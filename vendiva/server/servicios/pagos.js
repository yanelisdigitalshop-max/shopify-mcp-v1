// Parte 7: pagos con Stripe (decisiones de la dueña, 27 nov 2026). MODO DE PRUEBA.
//
//   - Suscripciones mensuales (Esencial, Crecimiento, Pro) y paquetes de créditos (compra única).
//   - Al pagar recibe enseguida todos los créditos del plan; se reponen en cada cobro mensual,
//     en su propia fecha. El plan Gratis sigue con el día 1.
//   - Subir de plan: inmediato; Stripe cobra solo la diferencia y recibe ya los créditos nuevos.
//   - Bajar de plan o cancelar: sigue en su plan hasta el fin del mes pagado.
//   - Cobro fallido: Stripe reintenta unos días y se le avisa en la app; si no se logra, vuelve a Gratis.
//   - Sin reembolsos. Para pagar hay que aceptar los términos (borrador, ver shared/terminos.js).
//
// Los créditos SOLO se entregan cuando Stripe confirma el cobro (aviso firmado = webhook),
// una sola vez por cobro (tabla pagos, referencia única).

import crypto from 'node:crypto';
import { PAQUETES_CREDITOS, PLANES, esPlanDePago } from '../../shared/datos.js';
import { VERSION_TERMINOS } from '../../shared/terminos.js';
import { ErrorApp, sinSesion } from '../errores.js';
import { ErrorStripe } from '../fuentes/stripe.js';
import { anotarMovimiento, periodoDe } from './creditos.js';
import { anotarHistorial } from './estado.js';

// past_due: Stripe está reintentando el cobro; sigue en su plan mientras tanto.
const ACTIVAS = new Set(['active', 'past_due', 'trialing']);

/** Una suscripción viva: mientras exista, los créditos del plan NO se reponen el día 1. */
export const tieneSuscripcion = (u) => Boolean(u.suscripcion_id) && ACTIVAS.has(u.suscripcion_estado);

function traducirErrorStripe(err) {
  if (err instanceof ErrorStripe) {
    console.error(`[pagos] Stripe: ${err.codigo}${err.detalle ? ` — ${err.detalle}` : ''}`);
    return new ErrorApp(err.estado === 402 ? 402 : 503, err.codigo, err.message, { reintentable: err.reintentable });
  }
  return err;
}

const sinPagos = () =>
  new ErrorApp(503, 'PAGOS_NO_DISPONIBLES', 'Los pagos todavía no están activos. Nadie te cobra nada.', { reintentable: false });

async function filaDe(t, usuariaId, bloquear = true) {
  const u = (await t.query(`select * from usuarias where id = $1${bloquear ? ' for update' : ''}`, [usuariaId])).rows[0];
  if (!u) throw sinSesion();
  return u;
}

/** Pone los saldos del plan en un valor fijo y anota la diferencia en el libro de movimientos. */
async function ponerSaldos(t, u, { texto, video, motivo, referencia = null, periodo = null }) {
  await t.query('update usuarias set creditos_plan = $2, creditos_video_plan = $3, actualizada_en = now() where id = $1', [u.id, texto, video]);
  if (texto !== u.creditos_plan) await anotarMovimiento(t, { usuariaId: u.id, bolsa: 'plan', cantidad: texto - u.creditos_plan, motivo, periodo, referencia });
  if (video !== u.creditos_video_plan) await anotarMovimiento(t, { usuariaId: u.id, bolsa: 'video_plan', cantidad: video - u.creditos_video_plan, motivo, periodo, referencia });
}

/**
 * Stripe confirmó el cobro de un plan (factura pagada o subida de plan cobrada).
 * Pone el plan que se pagó y le repone todos sus créditos. Una sola vez por cobro.
 */
async function aplicarPlanPagado(t, u, sub, { referencia, monto = null, modo }) {
  const plan = sub.plan;
  if (!PLANES[plan] || !esPlanDePago(plan)) throw new Error(`plan desconocido en Stripe: ${plan}`);

  // La fecha de renovación y el estado se ponen al día siempre.
  await t.query(
    `update usuarias set suscripcion_id = $2, suscripcion_estado = $3, suscripcion_fin = $4, suscripcion_cancela = $5,
            stripe_cliente_id = coalesce(stripe_cliente_id, $6), actualizada_en = now() where id = $1`,
    [u.id, sub.id, sub.estado, sub.finPeriodo, sub.cancelaAlFinal, sub.clienteId],
  );

  const nuevo = await t.query(
    `insert into pagos (id, usuaria_id, tipo, referencia_stripe, plan, monto_centavos, modo)
     values ($1, $2, 'plan', $3, $4, $5, $6) on conflict (referencia_stripe) do nothing returning id`,
    [crypto.randomUUID(), u.id, referencia, plan, monto, modo],
  );
  if (!nuevo.rows.length) return false; // este cobro ya se había aplicado

  const { creditosTextoMes, creditosVideoMes } = PLANES[plan];
  await t.query('update usuarias set plan = $2, plan_siguiente = null, pago_fallido_en = null where id = $1', [u.id, plan]);
  await ponerSaldos(t, u, { texto: creditosTextoMes, video: creditosVideoMes, motivo: 'suscripcion', referencia: null, periodo: null });
  await anotarHistorial(t, u.id, 'pago_plan', { plan, antes: u.plan });
  return true;
}

/** Terminó la suscripción (canceló, bajó a Gratis o no se pudo cobrar): vuelve a Gratis. */
async function volverAGratis(t, u, ahora, motivo) {
  if (u.plan === 'gratis' && !u.suscripcion_id) return;
  const periodo = periodoDe(ahora);
  await t.query(
    `update usuarias set plan = 'gratis', suscripcion_id = null, suscripcion_estado = null, suscripcion_fin = null,
            suscripcion_cancela = false, plan_siguiente = null, pago_fallido_en = null, periodo_creditos = $2,
            guiones_mes = 0, busquedas_mes = 0, video_gratis_usado = false, voces_ia_mes = 0, actualizada_en = now()
      where id = $1`,
    [u.id, periodo],
  );
  // Los créditos del plan Gratis de este mes. Los de paquete no se tocan (no vencen).
  await ponerSaldos(t, u, { texto: PLANES.gratis.creditosTextoMes, video: 0, motivo: 'vuelta_a_gratis', periodo });
  await anotarHistorial(t, u.id, 'vuelta_a_gratis', { antes: u.plan, motivo });
}

async function entregarPaquete(t, u, { paquete, referencia, monto, modo }) {
  const p = PAQUETES_CREDITOS.find((x) => x.id === paquete);
  if (!p) throw new Error(`paquete desconocido: ${paquete}`);
  const nuevo = await t.query(
    `insert into pagos (id, usuaria_id, tipo, referencia_stripe, paquete, monto_centavos, modo)
     values ($1, $2, 'paquete', $3, $4, $5, $6) on conflict (referencia_stripe) do nothing returning id`,
    [crypto.randomUUID(), u.id, referencia, p.id, monto, modo],
  );
  if (!nuevo.rows.length) return;
  await t.query('update usuarias set creditos_paquete = creditos_paquete + $2, actualizada_en = now() where id = $1', [u.id, p.creditos]);
  await anotarMovimiento(t, { usuariaId: u.id, bolsa: 'paquete', cantidad: p.creditos, motivo: 'compra_paquete', referencia: null });
  await anotarHistorial(t, u.id, 'pago_paquete', { paquete: p.id, nombre: p.nombre, creditos: p.creditos });
}

const subDeFactura = (f) => f.parent?.subscription_details?.subscription ?? f.subscription ?? null;

/**
 * Un aviso firmado de Stripe. Idempotente: cada evento se procesa una vez.
 * Los datos de la suscripción se piden frescos a Stripe (no se confía en el orden de los avisos).
 */
export async function procesarEvento({ db, stripe, reloj, evento }) {
  const modo = stripe.modo();
  if (evento.livemode && modo !== 'real') {
    // Un evento de modo real sin la aprobación de la dueña: no se toca nada.
    console.error(`[pagos] se ignoró un evento REAL (${evento.type}): los cobros reales no están aprobados`);
    return 'ignorado';
  }

  const ya = await db.query('insert into eventos_stripe (id, tipo) values ($1, $2) on conflict (id) do nothing returning id', [evento.id, evento.type]);
  if (!ya.rows.length) return 'repetido';

  try {
    await manejar({ db, stripe, reloj, evento, modo });
  } catch (err) {
    // Se borra la marca: así Stripe lo reenvía y se vuelve a intentar.
    await db.query('delete from eventos_stripe where id = $1', [evento.id]).catch(() => {});
    throw err;
  }
  return 'procesado';
}

async function manejar({ db, stripe, reloj, evento, modo }) {
  const o = evento.data.object;
  const ahora = reloj();

  switch (evento.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const usuariaId = o.metadata?.usuaria_id ?? o.client_reference_id;
      if (!usuariaId) return;
      if (o.mode === 'payment' && o.metadata?.tipo === 'paquete') {
        // Klarna y otros pagos pueden llegar "en proceso": solo se entrega cuando está pagado.
        if (o.payment_status !== 'paid') return;
        await db.tx(async (t) => entregarPaquete(t, await filaDe(t, usuariaId), { paquete: o.metadata.paquete, referencia: o.id, monto: o.amount_total, modo }));
      } else if (o.mode === 'subscription' && o.subscription) {
        // El plan se activa con la factura pagada; aquí solo se guarda qué suscripción es.
        const sub = await stripe.verSuscripcion(typeof o.subscription === 'string' ? o.subscription : o.subscription.id);
        await db.tx(async (t) => {
          await filaDe(t, usuariaId);
          await t.query(
            `update usuarias set suscripcion_id = $2, suscripcion_estado = $3, suscripcion_fin = $4,
                    stripe_cliente_id = coalesce(stripe_cliente_id, $5) where id = $1`,
            [usuariaId, sub.id, sub.estado, sub.finPeriodo, sub.clienteId],
          );
        });
      }
      return;
    }

    case 'invoice.paid': {
      const subId = subDeFactura(o);
      if (!subId) return;
      const sub = await stripe.verSuscripcion(typeof subId === 'string' ? subId : subId.id);
      if (!sub.usuariaId) return;
      await db.tx(async (t) => aplicarPlanPagado(t, await filaDe(t, sub.usuariaId), sub, { referencia: o.id, monto: o.amount_paid, modo }));
      return;
    }

    case 'invoice.payment_failed': {
      const subId = subDeFactura(o);
      if (!subId) return;
      await db.tx(async (t) => {
        const u = (await t.query('select * from usuarias where suscripcion_id = $1 for update', [typeof subId === 'string' ? subId : subId.id])).rows[0];
        if (!u) return;
        await t.query('update usuarias set pago_fallido_en = $2 where id = $1', [u.id, ahora]);
        await anotarHistorial(t, u.id, 'pago_fallido', { plan: u.plan });
      });
      return;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = evento.type === 'customer.subscription.deleted' ? { id: o.id, estado: 'canceled' } : await stripe.verSuscripcion(o.id);
      await db.tx(async (t) => {
        const u = (await t.query('select * from usuarias where suscripcion_id = $1 for update', [sub.id])).rows[0];
        if (!u) return;
        if (!ACTIVAS.has(sub.estado)) return volverAGratis(t, u, ahora, sub.estado === 'canceled' ? 'cancelada' : sub.estado);
        // El plan NO cambia aquí: cambia cuando se paga (subir) o en el cobro siguiente (bajar).
        await t.query(
          'update usuarias set suscripcion_estado = $2, suscripcion_fin = $3, suscripcion_cancela = $4, plan_siguiente = $5 where id = $1',
          [u.id, sub.estado, sub.finPeriodo, sub.cancelaAlFinal, sub.plan && sub.plan !== u.plan ? sub.plan : null],
        );
      });
      return;
    }

    default:
  }
}

// ── Lo que ella pide desde la pestaña Planes ──────────────────────────────────

function exigirTerminos(aceptaTerminos) {
  if (aceptaTerminos !== true) {
    throw new ErrorApp(409, 'FALTA_ACEPTAR', 'Para pagar hay que aceptar los términos de pago y cancelación.', { reintentable: false });
  }
}

async function guardarAceptacion(db, usuariaId, ahora) {
  await db.query('update usuarias set terminos_version = $2, terminos_aceptados_en = $3 where id = $1', [usuariaId, VERSION_TERMINOS, ahora]);
}

async function clienteDe(db, stripe, u) {
  if (u.stripe_cliente_id) return u.stripe_cliente_id;
  const id = await stripe.crearCliente({ correo: u.correo, nombre: u.nombre, usuariaId: u.id });
  await db.query('update usuarias set stripe_cliente_id = coalesce(stripe_cliente_id, $2) where id = $1', [u.id, id]);
  return (await db.query('select stripe_cliente_id from usuarias where id = $1', [u.id])).rows[0].stripe_cliente_id;
}

/**
 * Elegir un plan de pago.
 *   - Sin suscripción: devuelve { url } de la página de pago de Stripe.
 *   - Con suscripción: subir = inmediato (cobra la diferencia); bajar = al final del mes pagado.
 */
export async function elegirPlan({ db, stripe, reloj, usuariaId, plan, aceptaTerminos, volver }) {
  if (!stripe.lista()) throw sinPagos();
  if (!esPlanDePago(plan)) throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Para volver a Gratis, cancela tu plan.');
  exigirTerminos(aceptaTerminos);
  const u = (await db.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
  if (!u) throw sinSesion();
  await guardarAceptacion(db, usuariaId, reloj());

  try {
    if (!tieneSuscripcion(u)) {
      const cliente = await clienteDe(db, stripe, u);
      const s = await stripe.checkoutSuscripcion({ cliente, plan, usuariaId, exito: volver('listo'), cancelar: volver('cancelado') });
      return { url: s.url };
    }

    const actual = await stripe.verSuscripcion(u.suscripcion_id);
    if (plan === u.plan) {
      // Deshacer una bajada programada o una cancelación: sigue en su plan.
      if (actual.plan !== u.plan) await stripe.cambiarPlan(u.suscripcion_id, u.plan, { itemId: actual.itemId, inmediato: false });
      else if (actual.cancelaAlFinal) await stripe.cancelarAlFinal(u.suscripcion_id, false);
      else throw new ErrorApp(409, 'YA_ES_TU_PLAN', 'Ya estás en ese plan.', { reintentable: false });
      await db.query('update usuarias set plan_siguiente = null, suscripcion_cancela = false where id = $1', [usuariaId]);
      return { cambio: 'se_queda' };
    }

    if (PLANES[plan].precioMes > PLANES[u.plan].precioMes) {
      // Subir: Stripe cobra ya la diferencia. Si el cobro no pasa, no cambia nada.
      const sub = await stripe.cambiarPlan(u.suscripcion_id, plan, { itemId: actual.itemId, inmediato: true });
      await db.tx(async (t) => aplicarPlanPagado(t, await filaDe(t, usuariaId), { ...sub, plan }, { referencia: sub.ultimaFactura ?? `subida-${sub.id}-${plan}-${Date.now()}`, modo: stripe.modo() }));
      return { cambio: 'inmediato' };
    }

    // Bajar a otro plan de pago: el precio nuevo vale desde el próximo cobro.
    const sub = await stripe.cambiarPlan(u.suscripcion_id, plan, { itemId: actual.itemId, inmediato: false });
    await db.tx(async (t) => {
      await t.query('update usuarias set plan_siguiente = $2, suscripcion_cancela = false, suscripcion_fin = $3 where id = $1', [usuariaId, plan, sub.finPeriodo]);
      await anotarHistorial(t, usuariaId, 'plan_programado', { de: u.plan, a: plan });
    });
    return { cambio: 'al_final' };
  } catch (err) {
    throw traducirErrorStripe(err);
  }
}

/** Comprar un paquete de créditos de video: devuelve { url } de la página de pago. */
export async function comprarPaquete({ db, stripe, reloj, usuariaId, paquete, aceptaTerminos, volver }) {
  if (!stripe.lista()) throw sinPagos();
  exigirTerminos(aceptaTerminos);
  const u = (await db.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
  if (!u) throw sinSesion();
  await guardarAceptacion(db, usuariaId, reloj());
  try {
    const cliente = await clienteDe(db, stripe, u);
    const s = await stripe.checkoutPaquete({ cliente, paquete, usuariaId, exito: volver('listo'), cancelar: volver('cancelado') });
    return { url: s.url };
  } catch (err) {
    throw traducirErrorStripe(err);
  }
}

/** Cancelar (o deshacer la cancelación): sigue en su plan hasta el fin del mes pagado. */
export async function cancelarPlan({ db, stripe, usuariaId, cancelar }) {
  if (!stripe.lista()) throw sinPagos();
  const u = (await db.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
  if (!u) throw sinSesion();
  if (!tieneSuscripcion(u)) throw new ErrorApp(409, 'SIN_SUSCRIPCION', 'No tienes un plan de pago para cancelar.', { reintentable: false });
  try {
    const sub = await stripe.cancelarAlFinal(u.suscripcion_id, cancelar);
    await db.tx(async (t) => {
      await t.query('update usuarias set suscripcion_cancela = $2, suscripcion_fin = $3, plan_siguiente = null where id = $1', [usuariaId, sub.cancelaAlFinal, sub.finPeriodo]);
      await anotarHistorial(t, usuariaId, cancelar ? 'plan_cancelado' : 'plan_reanudado', { plan: u.plan });
    });
  } catch (err) {
    throw traducirErrorStripe(err);
  }
}

/** La página de Stripe para cambiar la tarjeta y ver sus recibos. */
export async function abrirPortal({ db, stripe, usuariaId, volver }) {
  if (!stripe.lista()) throw sinPagos();
  const u = (await db.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
  if (!u) throw sinSesion();
  if (!u.stripe_cliente_id) throw new ErrorApp(409, 'SIN_PAGOS', 'Todavía no tienes pagos en Vendiva.', { reintentable: false });
  try {
    return { url: await stripe.portal({ cliente: u.stripe_cliente_id, volver: volver('portal') }) };
  } catch (err) {
    throw traducirErrorStripe(err);
  }
}

// El modo de pagos lo fija crearApp (con el Stripe que use: el real o el de prueba).
let modoActual = 'apagado';
export const ponerModoPagos = (modo) => {
  modoActual = modo;
};

/** Para el estado de la usuaria. */
export function pagosDe(u, modo = modoActual) {
  return {
    modo, // 'apagado' | 'prueba' | 'real'
    disponible: modo !== 'apagado',
    suscripcion: tieneSuscripcion(u)
      ? {
          estado: u.suscripcion_estado,
          renuevaEl: u.suscripcion_fin,
          cancelaAlFinal: u.suscripcion_cancela,
          planSiguiente: u.plan_siguiente,
          pagoFallido: Boolean(u.pago_fallido_en),
        }
      : null,
    tienePagos: Boolean(u.stripe_cliente_id),
    terminosAceptados: u.terminos_version,
  };
}

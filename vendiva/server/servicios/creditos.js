// Créditos: dos bolsas.
//   - del plan: llegan solos el día 1 de cada mes (el saldo se repone, no se acumula).
//   - de paquete: se compran aparte y no vencen.
// Entran por el alta y la renovación; salen al crear lo que cuesta créditos.
// Dos tipos: de TEXTO (guion de en vivo, respuestas, GIFs, guiones extra) y de
// VIDEO (videos con IA). Los guiones normales y las búsquedas nunca gastan.

import crypto from 'node:crypto';
import { COSTOS_CREDITOS, LIMITES_GRATIS, PLANES, ZONA_HORARIA, planFrenaEnCero, videoFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp } from '../errores.js';

/** 'AAAA-MM' en la hora de Florida. */
export function periodoDe(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(fecha);
  const dato = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${dato('year')}-${dato('month')}`;
}

/** Semana ISO en la hora de Florida, por ejemplo '2026-W46'. Las tendencias se guardan por semana. */
export function semanaDe(fecha = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha);
  const dato = (t) => Number(p.find((x) => x.type === t).value);
  const dia = new Date(Date.UTC(dato('year'), dato('month') - 1, dato('day')));
  const diaSemana = dia.getUTCDay() || 7; // lunes = 1 ... domingo = 7
  dia.setUTCDate(dia.getUTCDate() + 4 - diaSemana); // el jueves de esa semana decide el año
  const inicioAno = new Date(Date.UTC(dia.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((dia - inicioAno) / 86400000 + 1) / 7);
  return `${dia.getUTCFullYear()}-W${String(numero).padStart(2, '0')}`;
}

/** '2026-W46' -> la semana anterior completa, en el formato de FastMoss: '2026-45'. */
export function semanaAnteriorFastmoss(fecha = new Date(), semanasAtras = 1) {
  const s = semanaDe(new Date(fecha.getTime() - semanasAtras * 7 * 86400000));
  return s.replace('-W', '-');
}

/** Lunes y domingo (AAAA-MM-DD) de una semana ISO 'AAAA-SS' o 'AAAA-WSS'. */
export function diasDeSemana(semana) {
  const [a, n] = semana.replace('-W', '-').split('-').map(Number);
  const cuatroEnero = new Date(Date.UTC(a, 0, 4));
  const lunes = new Date(cuatroEnero);
  lunes.setUTCDate(cuatroEnero.getUTCDate() - ((cuatroEnero.getUTCDay() || 7) - 1) + (n - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const f = (d) => d.toISOString().slice(0, 10);
  return { desde: f(lunes), hasta: f(domingo) };
}

/** 'AAAA-MM-01' del mes siguiente: el día en que se renuevan. */
export function proximaRenovacion(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const siguiente = m === 12 ? [a + 1, 1] : [a, m + 1];
  return `${siguiente[0]}-${String(siguiente[1]).padStart(2, '0')}-01`;
}

export async function anotarMovimiento(t, { usuariaId, bolsa, cantidad, motivo, periodo = null, referencia = null }) {
  await t.query(
    'insert into movimientos_creditos (id, usuaria_id, bolsa, cantidad, motivo, periodo, referencia) values ($1, $2, $3, $4, $5, $6, $7)',
    [crypto.randomUUID(), usuariaId, bolsa, cantidad, motivo, periodo, referencia],
  );
}

// Columnas de cada bolsa. El orden es el orden en que se gastan.
const BOLSAS = {
  texto: [{ columna: 'creditos_plan', bolsa: 'plan' }],
  video: [
    { columna: 'creditos_video_plan', bolsa: 'video_plan' }, // se repone el día 1
    { columna: 'creditos_paquete', bolsa: 'paquete' }, // paquetes comprados: no vencen
  ],
};

export function saldoDe(usuaria, tipo = 'texto') {
  return BOLSAS[tipo].reduce((n, b) => n + usuaria[b.columna], 0);
}

/**
 * Cobra una creación. Se llama con la fila de la usuaria bloqueada y ya renovada.
 *
 * - Texto (guion de en vivo, respuestas, GIFs, guiones extra): créditos de texto del plan.
 *   Gratis frena si no alcanza; los planes de pago no frenan (decisión de la dueña).
 * - Video: primero los créditos de video del plan y después los de paquete.
 *   Frena en todos los planes si no alcanza (cada video cuesta dinero real en Runway).
 *
 * @param {'texto'|'video'} [p.tipo]
 * @returns {{ partes: {columna: string, bolsa: string, cantidad: number}[], total: number }}
 */
export async function cobrar(t, usuaria, { costo, motivo, referencia, tipo = 'texto' }) {
  const saldo = saldoDe(usuaria, tipo);
  const frena = tipo === 'video' ? videoFrenaEnCero(usuaria.plan) : planFrenaEnCero(usuaria.plan);
  const unidad = tipo === 'video' ? 'créditos de video' : 'créditos';

  if (saldo < costo && frena) {
    throw new ErrorApp(
      402,
      'CREDITOS_INSUFICIENTES',
      tipo === 'video'
        ? `No te alcanzan los créditos de video. Esto cuesta ${costo} y te ${saldo === 1 ? 'queda' : 'quedan'} ${saldo}.`
        : `Ya se te terminó lo gratis de este mes. Esto cuesta ${costo} ${costo === 1 ? 'crédito' : 'créditos'} y te ${saldo === 1 ? 'queda' : 'quedan'} ${saldo}.`,
      { datos: { costo, saldo, tipo, unidad, renuevaEl: proximaRenovacion(usuaria.periodo_creditos) } },
    );
  }

  let restante = Math.min(costo, saldo);
  const partes = [];
  for (const b of BOLSAS[tipo]) {
    const cantidad = Math.min(usuaria[b.columna], restante);
    if (cantidad > 0) partes.push({ ...b, cantidad });
    restante -= cantidad;
  }
  for (const p of partes) {
    await t.query(`update usuarias set ${p.columna} = ${p.columna} - $2, actualizada_en = now() where id = $1`, [usuaria.id, p.cantidad]);
    await anotarMovimiento(t, {
      usuariaId: usuaria.id,
      bolsa: p.bolsa,
      cantidad: -p.cantidad,
      motivo,
      periodo: p.bolsa === 'paquete' ? null : usuaria.periodo_creditos,
      referencia,
    });
  }
  return { partes, total: partes.reduce((n, p) => n + p.cantidad, 0) };
}

/** Devuelve exactamente lo cobrado, a la misma bolsa, cuando la creación no se pudo entregar. */
export async function devolver(t, usuariaId, cobro, { referencia }) {
  if (!cobro || cobro.total === 0) return;
  for (const p of cobro.partes) {
    await t.query(`update usuarias set ${p.columna} = ${p.columna} + $2, actualizada_en = now() where id = $1`, [usuariaId, p.cantidad]);
    await anotarMovimiento(t, { usuariaId, bolsa: p.bolsa, cantidad: p.cantidad, motivo: 'devolucion', referencia });
  }
}

/**
 * Si cambió el mes desde el último abono, repone los créditos del plan.
 * Se llama dentro de una transacción con la fila de la usuaria bloqueada
 * (select ... for update), para que nunca se abone dos veces.
 */
export async function renovarSiToca(t, usuaria, ahora = new Date()) {
  const periodo = periodoDe(ahora);
  if (usuaria.periodo_creditos === periodo) return usuaria;
  // Parte 7: con una suscripción de Stripe viva, los créditos del plan se reponen en cada
  // cobro mensual (lo hace servicios/pagos.js), no el día 1.
  if (usuaria.suscripcion_id && ['active', 'past_due', 'trialing'].includes(usuaria.suscripcion_estado)) return usuaria;

  const { creditosTextoMes: texto, creditosVideoMes: video } = PLANES[usuaria.plan];
  await t.query(
    `update usuarias set creditos_plan = $2, creditos_video_plan = $3, periodo_creditos = $4,
            guiones_mes = 0, busquedas_mes = 0, video_gratis_usado = false, voces_ia_mes = 0, actualizada_en = now()
      where id = $1`,
    [usuaria.id, texto, video, periodo],
  );
  await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'plan', cantidad: texto, motivo: 'renovacion', periodo });
  if (video > 0) await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'video_plan', cantidad: video, motivo: 'renovacion', periodo });
  // Con el mes nuevo también vuelven a cero los guiones gratis, las búsquedas, el video gratis y las voces de IA.
  return { ...usuaria, creditos_plan: texto, creditos_video_plan: video, periodo_creditos: periodo, guiones_mes: 0, busquedas_mes: 0, video_gratis_usado: false, voces_ia_mes: 0 };
}

/**
 * Devuelve lo cobrado por una creación, buscándolo en el libro por su referencia.
 * Sirve cuando la falla llega más tarde (un video que Runway no terminó). No devuelve dos veces.
 */
export async function devolverPorReferencia(t, usuariaId, referencia) {
  const ya = await t.query("select 1 from movimientos_creditos where referencia = $1 and motivo = 'devolucion' limit 1", [referencia]);
  if (ya.rows.length) return 0;
  const { rows } = await t.query(
    "select bolsa, -sum(cantidad)::int as cantidad from movimientos_creditos where referencia = $1 and usuaria_id = $2 and cantidad < 0 group by bolsa",
    [referencia, usuariaId],
  );
  const columna = { plan: 'creditos_plan', video_plan: 'creditos_video_plan', paquete: 'creditos_paquete' };
  const partes = rows.filter((r) => r.cantidad > 0).map((r) => ({ bolsa: r.bolsa, columna: columna[r.bolsa], cantidad: r.cantidad }));
  const total = partes.reduce((n, p) => n + p.cantidad, 0);
  await devolver(t, usuariaId, { partes, total }, { referencia });
  return total;
}

/**
 * Cómo se paga la próxima voz de IA (siempre con créditos de texto).
 *   Gratis: 3 al mes. Pasadas las 3 se frena hasta el mes siguiente o hasta subir de plan
 *   (agotadas: true). Los paquetes son de video: no pagan la voz (decisión de la dueña, 27 nov 2026).
 *   Planes de pago: sin límite; los créditos de texto no frenan.
 */
export function pagoVozIA(usuaria) {
  const costo = COSTOS_CREDITOS.vozIA;
  if (planFrenaEnCero(usuaria.plan)) {
    const max = LIMITES_GRATIS.vocesIAMes;
    return { costo, bolsa: 'texto', saldo: usuaria.creditos_plan, frena: true, usadasMes: usuaria.voces_ia_mes, maxMes: max, agotadas: usuaria.voces_ia_mes >= max };
  }
  return { costo, bolsa: 'texto', saldo: usuaria.creditos_plan, frena: false, usadasMes: usuaria.voces_ia_mes, maxMes: null, agotadas: false };
}

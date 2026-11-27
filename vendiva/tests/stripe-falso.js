// Un Stripe de mentira para las pruebas: no llama a nadie y no cobra nada.
// Tiene la misma forma que server/fuentes/stripe.js y firma sus avisos (webhooks)
// con el mismo algoritmo que Stripe, así la verificación de la firma se prueba de verdad.

import { ErrorStripe, firmar, verificarFirma } from '../server/fuentes/stripe.js';
import { PAQUETES_CREDITOS, PLANES } from '../shared/datos.js';

export const SECRETO_WEBHOOK = 'whsec_de_prueba_vendiva';
const DIA = 24 * 3600 * 1000;

export function crearStripeFalso({ reloj = () => new Date() } = {}) {
  let n = 0;
  const id = (prefijo) => `${prefijo}_${(n += 1)}`;
  const sesiones = new Map();
  const subs = new Map();
  const llamadas = [];
  const control = { rechazarTarjeta: false, lista: true, modo: 'prueba' };

  const normal = (s) => ({
    id: s.id,
    estado: s.estado,
    clienteId: s.cliente,
    usuariaId: s.usuariaId,
    itemId: s.itemId,
    plan: s.plan,
    finPeriodo: new Date(s.fin),
    cancelaAlFinal: s.cancela,
    ultimaFactura: s.ultimaFactura,
    real: false,
  });
  const evento = (type, object, { livemode = false } = {}) => ({ id: id('evt'), type, livemode, data: { object } });
  const factura = (s, billing_reason, monto) => ({
    id: (s.ultimaFactura = id('in')),
    object: 'invoice',
    billing_reason,
    amount_paid: monto ?? PLANES[s.plan].precioMes * 100,
    parent: { subscription_details: { subscription: s.id } },
  });
  const sub = (subId) => {
    const s = subs.get(subId);
    if (!s) throw new ErrorStripe('PAGOS_PETICION', 'No existe.', { detalle: 'HTTP 404' });
    return s;
  };

  return {
    llamadas,
    control,
    sesiones,
    subs,
    lista: () => control.lista,
    modo: () => control.modo,

    async crearCliente(datos) {
      llamadas.push({ tipo: 'cliente', ...datos });
      return id('cus');
    },
    async checkoutSuscripcion(datos) {
      llamadas.push({ tipo: 'checkout_plan', ...datos });
      const s = { id: id('cs'), mode: 'subscription', ...datos };
      sesiones.set(s.id, s);
      return { id: s.id, url: `https://checkout.stripe.test/${s.id}` };
    },
    async checkoutPaquete(datos) {
      llamadas.push({ tipo: 'checkout_paquete', ...datos });
      const s = { id: id('cs'), mode: 'payment', ...datos };
      sesiones.set(s.id, s);
      return { id: s.id, url: `https://checkout.stripe.test/${s.id}` };
    },
    async verSuscripcion(subId) {
      return normal(sub(subId));
    },
    async cambiarPlan(subId, plan, { inmediato }) {
      llamadas.push({ tipo: 'cambiar_plan', subId, plan, inmediato });
      if (inmediato && control.rechazarTarjeta) throw new ErrorStripe('PAGO_RECHAZADO', 'El pago no pasó. Revisa tu tarjeta o usa otra. No se cobró nada.', { estado: 402 });
      const s = sub(subId);
      s.plan = plan;
      s.cancela = false;
      if (inmediato) factura(s, 'subscription_update', 1234);
      return normal(s);
    },
    async cancelarAlFinal(subId, cancelar) {
      llamadas.push({ tipo: 'cancelar', subId, cancelar });
      const s = sub(subId);
      s.cancela = cancelar;
      return normal(s);
    },
    async portal(datos) {
      llamadas.push({ tipo: 'portal', ...datos });
      return 'https://billing.stripe.test/portal';
    },
    verificarEvento(cuerpo, cabecera, ahora) {
      return verificarFirma(cuerpo, cabecera, SECRETO_WEBHOOK, ahora);
    },

    // ── Lo que hace Stripe por su cuenta (las pruebas lo disparan) ──

    /** Ella pagó en la página de Stripe: nace la suscripción. Devuelve los avisos que manda Stripe. */
    pagarPlan(sesionId) {
      const ses = sesiones.get(sesionId);
      const s = { id: id('sub'), itemId: id('si'), estado: 'active', plan: ses.plan, usuariaId: ses.usuariaId, cliente: ses.cliente, fin: reloj().getTime() + 30 * DIA, cancela: false };
      subs.set(s.id, s);
      return [
        evento('checkout.session.completed', { id: ses.id, mode: 'subscription', subscription: s.id, client_reference_id: ses.usuariaId, metadata: { usuaria_id: ses.usuariaId, tipo: 'plan', plan: ses.plan } }),
        evento('invoice.paid', factura(s, 'subscription_create')),
      ];
    },
    /** Pagó un paquete. pagado=false: el pago quedó en proceso (por ejemplo, Klarna). */
    pagarPaquete(sesionId, { pagado = true } = {}) {
      const ses = sesiones.get(sesionId);
      const p = PAQUETES_CREDITOS.find((x) => x.id === ses.paquete);
      const objeto = { id: ses.id, mode: 'payment', payment_status: pagado ? 'paid' : 'unpaid', amount_total: p.precio * 100, client_reference_id: ses.usuariaId, metadata: { usuaria_id: ses.usuariaId, tipo: 'paquete', paquete: ses.paquete } };
      return [evento('checkout.session.completed', objeto)];
    },
    pagoAtrasadoListo(sesionId) {
      const ses = sesiones.get(sesionId);
      const p = PAQUETES_CREDITOS.find((x) => x.id === ses.paquete);
      return [evento('checkout.session.async_payment_succeeded', { id: ses.id, mode: 'payment', payment_status: 'paid', amount_total: p.precio * 100, metadata: { usuaria_id: ses.usuariaId, tipo: 'paquete', paquete: ses.paquete } })];
    },
    /** Pasó un mes: Stripe cobra otra vez (con el precio que tenga la suscripción ahora). */
    cobrarMes(subId) {
      const s = sub(subId);
      if (s.cancela) {
        s.estado = 'canceled';
        return [evento('customer.subscription.deleted', { id: s.id, status: 'canceled' })];
      }
      s.fin += 30 * DIA;
      s.estado = 'active';
      return [evento('invoice.paid', factura(s, 'subscription_cycle'))];
    },
    fallarCobro(subId) {
      const s = sub(subId);
      s.estado = 'past_due';
      return [
        evento('invoice.payment_failed', { id: id('in'), object: 'invoice', billing_reason: 'subscription_cycle', parent: { subscription_details: { subscription: s.id } } }),
        evento('customer.subscription.updated', { id: s.id }),
      ];
    },
    /** Stripe se rindió después de los reintentos: cancela la suscripción. */
    rendirse(subId) {
      const s = sub(subId);
      s.estado = 'canceled';
      return [evento('customer.subscription.deleted', { id: s.id, status: 'canceled' })];
    },
    actualizada(subId) {
      return [evento('customer.subscription.updated', { id: sub(subId).id })];
    },
    eventoReal(tipo, objeto) {
      return evento(tipo, objeto, { livemode: true });
    },
  };
}

/** Manda un aviso al servidor como lo haría Stripe, con su firma. */
export async function enviarAviso(base, evento, { secreto = SECRETO_WEBHOOK, t } = {}) {
  const cuerpo = JSON.stringify(evento);
  const r = await fetch(`${base}/api/pagos/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': firmar(cuerpo, secreto, t) },
    body: cuerpo,
  });
  return { estado: r.status, json: await r.json().catch(() => null) };
}

export async function enviarAvisos(base, eventos) {
  const r = [];
  for (const e of eventos) r.push(await enviarAviso(base, e));
  return r;
}

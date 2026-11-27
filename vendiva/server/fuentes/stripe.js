// Conexión con la API de Stripe (Parte 7: pagos).
//
// Verificado en el paquete oficial de Stripe para Node (npm "stripe" 23.2.0, 27 nov 2026;
// docs.stripe.com no se pudo abrir desde el entorno de desarrollo):
//   - Dirección https://api.stripe.com, "Authorization: Bearer <llave secreta>", cuerpo
//     application/x-www-form-urlencoded. Versión de la API: 2026-11-18.endive.
//   - Página de pago: POST /v1/checkout/sessions, mode 'subscription' (planes) o 'payment' (paquetes).
//   - Suscripción: el fin del período está en cada item (items.data[].current_period_end).
//     En la factura, la suscripción está en parent.subscription_details.subscription.
//   - Cambiar de plan: POST /v1/subscriptions/{id} con items[0][id] + items[0][price];
//     proration_behavior 'always_invoice' cobra ya la diferencia, 'none' no prorratea;
//     payment_behavior 'error_if_incomplete' hace que falle si el cobro no pasa.
//   - Webhooks: cabecera Stripe-Signature "t=<segundos>,v1=<firma>"; la firma es
//     HMAC-SHA256 de "<t>.<cuerpo crudo>" con el secreto del endpoint; tolerancia 300 s.
//   - Shop Pay no está entre los métodos que acepta la página de pago (Checkout).
//
// SEGURO: el servidor no arranca con una llave que no sea de prueba (server/config.js).
// Aquí se revisa otra vez antes de cada llamada. Nunca se reintenta solo: son cobros.

import crypto from 'node:crypto';
import { PAQUETES_CREDITOS, PLANES } from '../../shared/datos.js';
import { modoDePagos } from '../config.js';

const BASE = 'https://api.stripe.com';
export const VERSION_API = '2026-11-18.endive';
const ESPERA_MS = 30000;
export const TOLERANCIA_FIRMA_S = 300;

export class ErrorStripe extends Error {
  constructor(codigo, mensaje, { reintentable = false, detalle, estado = 503 } = {}) {
    super(mensaje);
    this.name = 'ErrorStripe';
    this.codigo = codigo;
    this.reintentable = reintentable;
    this.estado = estado;
    this.detalle = detalle; // para el registro del servidor (nunca la llave)
  }
}

const leerLlave = (env = process.env) => env.VENDIVA_STRIPE_SECRET_KEY?.trim() || null;
const leerSecretoWebhook = (env = process.env) => env.VENDIVA_STRIPE_WEBHOOK_SECRET?.trim() || null;

/** Convierte { a: { b: 1 }, c: [{ d: 2 }] } en a[b]=1&c[0][d]=2, como lo pide Stripe. */
export function formulario(datos) {
  const pares = [];
  const agregar = (clave, valor) => {
    if (valor === undefined || valor === null) return;
    if (Array.isArray(valor)) valor.forEach((v, i) => agregar(`${clave}[${i}]`, v));
    else if (typeof valor === 'object') for (const [k, v] of Object.entries(valor)) agregar(clave ? `${clave}[${k}]` : k, v);
    else pares.push([clave, String(valor)]);
  };
  agregar('', datos);
  return new URLSearchParams(pares).toString();
}

function traducir(estadoHttp, cuerpo) {
  const e = cuerpo?.error ?? {};
  const detalle = `HTTP ${estadoHttp}${e.type ? `, ${e.type}` : ''}${e.code ? `/${e.code}` : ''}${e.message ? `: ${String(e.message).slice(0, 160)}` : ''}`;
  if (estadoHttp === 402 || e.type === 'card_error') {
    return new ErrorStripe('PAGO_RECHAZADO', 'El pago no pasó. Revisa tu tarjeta o usa otra. No se cobró nada.', { estado: 402, detalle });
  }
  if (estadoHttp === 401 || estadoHttp === 403) {
    return new ErrorStripe('PAGOS_SIN_PERMISO', 'Los pagos no están disponibles en este momento. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (estadoHttp === 429) {
    return new ErrorStripe('PAGOS_OCUPADO', 'El sistema de pagos está muy ocupado. Intenta de nuevo en un momento.', { reintentable: true, detalle });
  }
  if (estadoHttp === 400 || estadoHttp === 404) {
    return new ErrorStripe('PAGOS_PETICION', 'No pudimos preparar el pago. Ya quedó anotado para revisarlo.', { detalle });
  }
  return new ErrorStripe('PAGOS_FALLO', 'El sistema de pagos tuvo un problema. Intenta de nuevo en un momento.', { reintentable: true, detalle });
}

async function pedirStripe(metodo, ruta, datos, { env = process.env, pedir = fetch } = {}) {
  const llave = leerLlave(env);
  if (!llave) throw new ErrorStripe('PAGOS_SIN_LLAVE', 'Los pagos todavía no están conectados.');
  modoDePagos(env); // otra vez el seguro: con una llave real sin aprobación, esto lanza.

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  const query = metodo === 'GET' && datos ? `?${formulario(datos)}` : '';
  let r;
  try {
    r = await pedir(`${BASE}${ruta}${query}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${llave}`,
        'Stripe-Version': VERSION_API,
        Accept: 'application/json',
        ...(metodo !== 'GET' ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      body: metodo !== 'GET' && datos ? formulario(datos) : undefined,
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorStripe('PAGOS_SIN_CONEXION', 'No pudimos conectar con el sistema de pagos. Intenta de nuevo.', {
      reintentable: true,
      detalle: err?.name === 'AbortError' ? 'tiempo de espera agotado' : String(err?.cause?.code ?? err?.message ?? err).slice(0, 120),
    });
  } finally {
    clearTimeout(reloj);
  }
  let cuerpo = null;
  try {
    cuerpo = await r.json();
  } catch {
    // sin JSON
  }
  if (!r.ok) throw traducir(r.status, cuerpo);
  return cuerpo;
}

// ── Firma de los webhooks ──────────────────────────────────────────────────────

/** Firma un cuerpo como lo hace Stripe (lo usan las pruebas y la verificación). */
export function firmar(cuerpo, secreto, t = Math.floor(Date.now() / 1000)) {
  const firma = crypto.createHmac('sha256', secreto).update(`${t}.${cuerpo}`, 'utf8').digest('hex');
  return `t=${t},v1=${firma}`;
}

/**
 * Comprueba la cabecera Stripe-Signature contra el cuerpo CRUDO (tal como llegó).
 * Devuelve el evento, o lanza si la firma no es de Stripe o es demasiado vieja.
 */
export function verificarFirma(cuerpo, cabecera, secreto, ahora = Date.now()) {
  const texto = Buffer.isBuffer(cuerpo) ? cuerpo.toString('utf8') : String(cuerpo ?? '');
  if (!secreto) throw new ErrorStripe('WEBHOOK_SIN_SECRETO', 'Falta el secreto del webhook.');
  let t = -1;
  const firmas = [];
  for (const parte of String(cabecera ?? '').split(',')) {
    const [k, v] = parte.split('=');
    if (k === 't') t = Number.parseInt(v, 10);
    if (k === 'v1' && v) firmas.push(v);
  }
  if (t < 0 || !firmas.length) throw new ErrorStripe('FIRMA_INVALIDA', 'Firma de Stripe ausente o mal formada.', { estado: 400 });
  const esperada = Buffer.from(crypto.createHmac('sha256', secreto).update(`${t}.${texto}`, 'utf8').digest('hex'));
  const coincide = firmas.some((f) => {
    const b = Buffer.from(f);
    return b.length === esperada.length && crypto.timingSafeEqual(b, esperada);
  });
  if (!coincide) throw new ErrorStripe('FIRMA_INVALIDA', 'La firma no coincide.', { estado: 400 });
  if (Math.abs(Math.floor(ahora / 1000) - t) > TOLERANCIA_FIRMA_S) throw new ErrorStripe('FIRMA_VIEJA', 'La firma es demasiado vieja.', { estado: 400 });
  return JSON.parse(texto);
}

// ── Lo que la app necesita de Stripe, ya traducido ────────────────────────────

const claveDePlan = (plan) => `vendiva_${plan}_mensual`;
const planDePrecio = (precio) => precio?.metadata?.plan ?? /^vendiva_(\w+)_mensual$/.exec(precio?.lookup_key ?? '')?.[1] ?? null;

/** Una suscripción de Stripe en la forma que usa Vendiva. */
export function normalizarSuscripcion(s) {
  const item = s.items?.data?.[0];
  const fin = item?.current_period_end ?? s.current_period_end ?? null;
  return {
    id: s.id,
    estado: s.status, // active | past_due | unpaid | canceled | incomplete | incomplete_expired | trialing | paused
    clienteId: typeof s.customer === 'string' ? s.customer : s.customer?.id ?? null,
    usuariaId: s.metadata?.usuaria_id ?? null,
    itemId: item?.id ?? null,
    plan: planDePrecio(item?.price),
    finPeriodo: fin ? new Date(fin * 1000) : null,
    cancelaAlFinal: Boolean(s.cancel_at_period_end || s.cancel_at),
    ultimaFactura: typeof s.latest_invoice === 'string' ? s.latest_invoice : s.latest_invoice?.id ?? null,
    real: Boolean(s.livemode),
  };
}

// Los precios de los planes se crean una sola vez en Stripe (con su clave fija) y se reutilizan.
const preciosConocidos = new Map();

async function precioDePlan(plan, o) {
  if (preciosConocidos.has(plan)) return preciosConocidos.get(plan);
  const clave = claveDePlan(plan);
  const lista = await pedirStripe('GET', '/v1/prices', { 'lookup_keys[0]': clave, active: 'true', limit: 1 }, o);
  let precio = lista?.data?.[0];
  const datos = PLANES[plan];
  if (!precio || precio.unit_amount !== datos.precioMes * 100) {
    // No existe (o cambió el precio fijo): se crea y se le pasa la clave.
    const producto = await pedirStripe('POST', '/v1/products', { name: `Vendiva ${datos.nombre}`, metadata: { plan } }, o);
    precio = await pedirStripe(
      'POST',
      '/v1/prices',
      {
        product: producto.id,
        currency: 'usd',
        unit_amount: datos.precioMes * 100,
        recurring: { interval: 'month' },
        lookup_key: clave,
        transfer_lookup_key: 'true',
        metadata: { plan },
      },
      o,
    );
  }
  preciosConocidos.set(plan, precio.id);
  return precio.id;
}

export function crearStripe(o = {}) {
  const env = o.env ?? process.env;
  return {
    lista: () => Boolean(leerLlave(env)) && Boolean(leerSecretoWebhook(env)),
    modo: () => modoDePagos(env),

    async crearCliente({ correo, nombre, usuariaId }) {
      const c = await pedirStripe('POST', '/v1/customers', { email: correo, name: nombre, metadata: { usuaria_id: usuariaId } }, o);
      return c.id;
    },

    async checkoutSuscripcion({ cliente, plan, usuariaId, exito, cancelar }) {
      const precio = await precioDePlan(plan, o);
      const s = await pedirStripe(
        'POST',
        '/v1/checkout/sessions',
        {
          mode: 'subscription',
          customer: cliente,
          client_reference_id: usuariaId,
          line_items: [{ price: precio, quantity: 1 }],
          success_url: exito,
          cancel_url: cancelar,
          locale: 'es',
          metadata: { usuaria_id: usuariaId, tipo: 'plan', plan },
          subscription_data: { metadata: { usuaria_id: usuariaId } },
        },
        o,
      );
      return { id: s.id, url: s.url };
    },

    async checkoutPaquete({ cliente, paquete, usuariaId, exito, cancelar }) {
      const p = PAQUETES_CREDITOS.find((x) => x.id === paquete);
      const s = await pedirStripe(
        'POST',
        '/v1/checkout/sessions',
        {
          mode: 'payment',
          customer: cliente,
          client_reference_id: usuariaId,
          line_items: [
            {
              quantity: 1,
              price_data: { currency: 'usd', unit_amount: p.precio * 100, product_data: { name: `Vendiva: paquete ${p.nombre} (${p.creditos} créditos de video)` } },
            },
          ],
          success_url: exito,
          cancel_url: cancelar,
          locale: 'es',
          metadata: { usuaria_id: usuariaId, tipo: 'paquete', paquete: p.id },
          payment_intent_data: { metadata: { usuaria_id: usuariaId, tipo: 'paquete', paquete: p.id } },
        },
        o,
      );
      return { id: s.id, url: s.url };
    },

    async verSuscripcion(id) {
      return normalizarSuscripcion(await pedirStripe('GET', `/v1/subscriptions/${encodeURIComponent(id)}`, null, o));
    },

    /** inmediato: cobra ya la diferencia (subir). Si no, el precio nuevo vale desde el próximo cobro (bajar). */
    async cambiarPlan(id, plan, { itemId, inmediato }) {
      const precio = await precioDePlan(plan, o);
      const s = await pedirStripe(
        'POST',
        `/v1/subscriptions/${encodeURIComponent(id)}`,
        {
          items: [{ id: itemId, price: precio }],
          proration_behavior: inmediato ? 'always_invoice' : 'none',
          ...(inmediato ? { payment_behavior: 'error_if_incomplete' } : {}),
          cancel_at_period_end: 'false',
        },
        o,
      );
      return normalizarSuscripcion(s);
    },

    async cancelarAlFinal(id, cancelar) {
      return normalizarSuscripcion(await pedirStripe('POST', `/v1/subscriptions/${encodeURIComponent(id)}`, { cancel_at_period_end: cancelar ? 'true' : 'false' }, o));
    },

    async portal({ cliente, volver }) {
      const s = await pedirStripe('POST', '/v1/billing_portal/sessions', { customer: cliente, return_url: volver, locale: 'es' }, o);
      return s.url;
    },

    verificarEvento(cuerpo, cabecera, ahora) {
      return verificarFirma(cuerpo, cabecera, leerSecretoWebhook(env), ahora);
    },
  };
}

export const stripeReal = crearStripe();

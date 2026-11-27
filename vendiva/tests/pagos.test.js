// Parte 7: pagos con Stripe, en modo de prueba, con un Stripe de mentira.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearStripeFalso, enviarAviso, enviarAvisos } from './stripe-falso.js';
import { leerConfig, modoDePagos, TEXTO_PAGOS_REALES } from '../server/config.js';
import { crearStripe, firmar, verificarFirma } from '../server/fuentes/stripe.js';
import { VERSION_TERMINOS } from '../shared/terminos.js';

let s;
let st;
const reloj = { ahora: null };
before(async () => {
  st = crearStripeFalso({ reloj: () => reloj.ahora ?? new Date() });
  s = await levantar({ stripe: st, reloj: () => reloj.ahora ?? new Date() });
});
after(async () => { await s.cerrar(); });
beforeEach(() => {
  reloj.ahora = null;
  Object.assign(st.control, { rechazarTarjeta: false, lista: true, modo: 'prueba' });
});

const estado = async (c) => (await c.get('/api/estado')).json.estado;
const DIA = 24 * 3600 * 1000;

async function cuenta() {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cabello', seguidores: 10, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  return { c, usuariaId };
}
/** Una cuenta que ya pagó un plan (en la página de Stripe de mentira). */
async function suscrita(plan = 'esencial') {
  const x = await cuenta();
  const r = await x.c.post('/api/pagos/plan', { plan, aceptaTerminos: true });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  const sesionId = r.json.url.split('/').at(-1);
  const avisos = await enviarAvisos(s.base, st.pagarPlan(sesionId));
  assert.ok(avisos.every((a) => a.estado === 200), JSON.stringify(avisos));
  const subId = (await s.db.query('select suscripcion_id from usuarias where id = $1', [x.usuariaId])).rows[0].suscripcion_id;
  return { ...x, subId };
}

// ── El seguro contra cobros reales ────────────────────────────────────────────

test('seguro: el servidor no arranca con una llave que no sea de prueba', () => {
  assert.equal(modoDePagos({}), 'apagado');
  assert.equal(modoDePagos({ VENDIVA_STRIPE_SECRET_KEY: 'sk_test_abc' }), 'prueba');
  assert.equal(modoDePagos({ VENDIVA_STRIPE_SECRET_KEY: 'rk_test_abc' }), 'prueba');
  for (const llave of ['sk_live_abc', 'rk_live_abc', 'pk_test_abc', 'cualquier-cosa']) {
    assert.throws(() => leerConfig({ VENDIVA_STRIPE_SECRET_KEY: llave }), /no arranca/, llave);
    assert.throws(() => leerConfig({ VENDIVA_STRIPE_SECRET_KEY: llave, VENDIVA_PAGOS_REALES: 'si' }), /no arranca/, 'un "sí" cualquiera no quita el seguro');
  }
  // Solo con el texto exacto (cuando la dueña lo apruebe por escrito).
  assert.equal(modoDePagos({ VENDIVA_STRIPE_SECRET_KEY: 'sk_live_abc', VENDIVA_PAGOS_REALES: TEXTO_PAGOS_REALES }), 'real');
  assert.ok(!JSON.stringify(leerConfig({ VENDIVA_STRIPE_SECRET_KEY: 'sk_test_secreta' })).includes('sk_test_secreta'), 'la configuración nunca guarda la llave');
});

test('seguro: la conexión con Stripe se niega a llamar con una llave real, aunque la configuración se salte', async () => {
  const llamadas = [];
  const pedir = async (...a) => {
    llamadas.push(a);
    return new Response('{}', { status: 200 });
  };
  const real = crearStripe({ env: { VENDIVA_STRIPE_SECRET_KEY: 'sk_live_abc', VENDIVA_STRIPE_WEBHOOK_SECRET: 'whsec_x' }, pedir });
  await assert.rejects(real.crearCliente({ correo: 'a@b.co', nombre: 'A', usuariaId: 'x' }), /no arranca/);
  assert.equal(llamadas.length, 0, 'ni una sola llamada a Stripe');

  // Con la llave de prueba sí llama, con la versión de la API y el formulario de Stripe.
  const prueba = crearStripe({ env: { VENDIVA_STRIPE_SECRET_KEY: 'sk_test_abc', VENDIVA_STRIPE_WEBHOOK_SECRET: 'whsec_x' }, pedir: async (url, o) => {
    llamadas.push([url, o]);
    return new Response(JSON.stringify({ id: 'cus_1' }), { status: 200 });
  } });
  assert.equal(await prueba.crearCliente({ correo: 'a@b.co', nombre: 'Ana', usuariaId: 'u1' }), 'cus_1');
  const [url, o] = llamadas[0];
  assert.equal(url, 'https://api.stripe.com/v1/customers');
  assert.equal(o.headers['Stripe-Version'], '2026-11-18.endive');
  assert.equal(o.body, 'email=a%40b.co&name=Ana&metadata%5Busuaria_id%5D=u1');
});

test('firma de los avisos: solo vale la de Stripe, con el cuerpo exacto y reciente', () => {
  const cuerpo = JSON.stringify({ id: 'evt_1', type: 'x' });
  const ahora = Date.now();
  assert.equal(verificarFirma(cuerpo, firmar(cuerpo, 'whsec_a'), 'whsec_a', ahora).id, 'evt_1');
  assert.throws(() => verificarFirma(cuerpo, firmar(cuerpo, 'whsec_b'), 'whsec_a', ahora), /no coincide/);
  assert.throws(() => verificarFirma(`${cuerpo} `, firmar(cuerpo, 'whsec_a'), 'whsec_a', ahora), /no coincide/);
  assert.throws(() => verificarFirma(cuerpo, firmar(cuerpo, 'whsec_a', Math.floor(ahora / 1000) - 600), 'whsec_a', ahora), /vieja/);
  assert.throws(() => verificarFirma(cuerpo, 'basura', 'whsec_a', ahora), /mal formada/);
});

// ── Suscribirse ───────────────────────────────────────────────────────────────

test('sin aceptar los términos no se paga; con ellos, a la página de Stripe (y nada cambia hasta que Stripe confirma)', async () => {
  const { c, usuariaId } = await cuenta();
  let e = await estado(c);
  assert.deepEqual(e.pagos, { modo: 'prueba', disponible: true, suscripcion: null, tienePagos: false, terminosAceptados: null });

  const sin = await c.post('/api/pagos/plan', { plan: 'pro' });
  assert.equal(sin.estado, 409);
  assert.equal(sin.json.error.codigo, 'FALTA_ACEPTAR');
  assert.equal((await c.post('/api/pagos/plan', { plan: 'gratis', aceptaTerminos: true })).estado, 400);

  const r = await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true });
  assert.equal(r.estado, 200);
  assert.match(r.json.url, /^https:\/\/checkout\.stripe\.test\//);
  const llamada = st.llamadas.at(-1);
  assert.equal(llamada.plan, 'pro');
  assert.match(llamada.exito, /\/\?pago=listo#planes$/);
  assert.match(llamada.cancelar, /\/\?pago=cancelado#planes$/);

  e = r.json.estado;
  assert.equal(e.plan.id, 'gratis', 'todavía no pagó');
  assert.equal(e.creditos.total, 30);
  assert.equal(e.pagos.terminosAceptados, VERSION_TERMINOS);
  const fila = (await s.db.query('select terminos_aceptados_en from usuarias where id = $1', [usuariaId])).rows[0];
  assert.ok(fila.terminos_aceptados_en);
});

test('pagó: recibe enseguida todos los créditos del plan y se renueva en su propia fecha (no el día 1)', async () => {
  const { c, usuariaId, subId } = await suscrita('esencial');
  let e = await estado(c);
  assert.equal(e.plan.id, 'esencial');
  assert.equal(e.creditos.total, 100);
  assert.equal(e.creditos.video.plan, 100);
  assert.equal(e.pagos.suscripcion.estado, 'active');
  assert.equal(e.pagos.suscripcion.cancelaAlFinal, false);
  const fin = new Date(st.subs.get(subId).fin);
  assert.equal(e.creditos.renuevaEl, new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(fin));

  const pagos = (await s.db.query('select tipo, plan, modo, monto_centavos from pagos where usuaria_id = $1', [usuariaId])).rows;
  assert.deepEqual(pagos, [{ tipo: 'plan', plan: 'esencial', modo: 'prueba', monto_centavos: 1900 }]);

  // Gasta y pasa el día 1: con suscripción NO se reponen ese día.
  await s.db.query('update usuarias set creditos_plan = 40 where id = $1', [usuariaId]);
  reloj.ahora = new Date(Date.now() + 35 * DIA);
  e = await estado(c);
  assert.equal(e.creditos.total, 40, 'no se repuso el día 1');

  // Se reponen con el cobro mensual (no se acumulan).
  reloj.ahora = null; // la firma de Stripe lleva la hora de hoy
  await enviarAvisos(s.base, st.cobrarMes(subId));
  e = await estado(c);
  assert.equal(e.creditos.total, 100);
  assert.equal(e.creditos.video.plan, 100);
  assert.equal((await s.db.query('select count(*)::int as n from pagos where usuaria_id = $1', [usuariaId])).rows[0].n, 2);
});

test('avisos: firma falsa se rechaza; un aviso repetido no entrega dos veces; uno de modo real se ignora', async () => {
  const x = await cuenta();
  const r = await x.c.post('/api/pagos/plan', { plan: 'esencial', aceptaTerminos: true });
  const [completado, pagado] = st.pagarPlan(r.json.url.split('/').at(-1));

  const falsa = await enviarAviso(s.base, pagado, { secreto: 'whsec_de_otra_persona' });
  assert.equal(falsa.estado, 400);
  assert.equal((await estado(x.c)).plan.id, 'gratis');

  await enviarAviso(s.base, completado);
  assert.equal((await enviarAviso(s.base, pagado)).json.resultado, 'procesado');
  await s.db.query('update usuarias set creditos_plan = 7 where id = $1', [x.usuariaId]);
  assert.equal((await enviarAviso(s.base, pagado)).json.resultado, 'repetido');
  // El mismo cobro con otro id de aviso tampoco entrega dos veces (la factura es única).
  assert.equal((await enviarAviso(s.base, { ...pagado, id: 'evt_otro' })).json.resultado, 'procesado');
  assert.equal((await estado(x.c)).creditos.total, 7, 'no se repuso otra vez');

  const real = st.eventoReal('checkout.session.completed', { id: 'cs_real', mode: 'payment', payment_status: 'paid', metadata: { usuaria_id: x.usuariaId, tipo: 'paquete', paquete: 'tienda' } });
  assert.equal((await enviarAviso(s.base, real)).json.resultado, 'ignorado');
  assert.equal((await estado(x.c)).creditos.video.paquete, 0);
});

// ── Cambiar de plan ───────────────────────────────────────────────────────────

test('subir de plan: inmediato, Stripe cobra la diferencia y recibe ya los créditos nuevos', async () => {
  const { c, usuariaId, subId } = await suscrita('esencial');
  const r = await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal(r.json.cambio, 'inmediato');
  assert.deepEqual(st.llamadas.at(-1), { tipo: 'cambiar_plan', subId, plan: 'pro', inmediato: true });
  const e = r.json.estado;
  assert.equal(e.plan.id, 'pro');
  assert.equal(e.creditos.total, 1000);
  assert.equal(e.creditos.video.plan, 1000);

  // El aviso de esa misma factura no entrega otra vez.
  const factura = st.subs.get(subId).ultimaFactura;
  await s.db.query('update usuarias set creditos_plan = 5 where id = $1', [usuariaId]);
  await enviarAviso(s.base, { id: 'evt_subida', type: 'invoice.paid', livemode: false, data: { object: { id: factura, amount_paid: 1234, parent: { subscription_details: { subscription: subId } } } } });
  assert.equal((await estado(c)).creditos.total, 5);
});

test('subir de plan con la tarjeta rechazada: no cambia nada', async () => {
  const { c } = await suscrita('esencial');
  st.control.rechazarTarjeta = true;
  const r = await c.post('/api/pagos/plan', { plan: 'crecimiento', aceptaTerminos: true });
  assert.equal(r.estado, 402);
  assert.equal(r.json.error.codigo, 'PAGO_RECHAZADO');
  const e = await estado(c);
  assert.equal(e.plan.id, 'esencial');
  assert.equal(e.creditos.total, 100);
});

test('bajar de plan: sigue en su plan hasta el fin del mes pagado; el plan nuevo empieza con el cobro', async () => {
  const { c, subId } = await suscrita('pro');
  const r = await c.post('/api/pagos/plan', { plan: 'esencial', aceptaTerminos: true });
  assert.equal(r.json.cambio, 'al_final');
  assert.equal(st.llamadas.at(-1).inmediato, false);
  let e = r.json.estado;
  assert.equal(e.plan.id, 'pro');
  assert.equal(e.creditos.total, 1000);
  assert.equal(e.pagos.suscripcion.planSiguiente, 'esencial');

  // Stripe avisa del cambio de precio: el plan sigue siendo Pro.
  await enviarAvisos(s.base, st.actualizada(subId));
  e = await estado(c);
  assert.equal(e.plan.id, 'pro');
  assert.equal(e.pagos.suscripcion.planSiguiente, 'esencial');

  await enviarAvisos(s.base, st.cobrarMes(subId));
  e = await estado(c);
  assert.equal(e.plan.id, 'esencial');
  assert.equal(e.creditos.total, 100);
  assert.equal(e.pagos.suscripcion.planSiguiente, null);
});

test('arrepentirse de bajar: elegir otra vez su plan lo deja como estaba', async () => {
  const { c, subId } = await suscrita('pro');
  await c.post('/api/pagos/plan', { plan: 'crecimiento', aceptaTerminos: true });
  const r = await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true });
  assert.equal(r.json.cambio, 'se_queda');
  assert.equal(r.json.estado.pagos.suscripcion.planSiguiente, null);
  assert.equal(st.subs.get(subId).plan, 'pro');
  assert.equal((await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true })).json.error.codigo, 'YA_ES_TU_PLAN');
});

// ── Cancelar y cobros fallidos ────────────────────────────────────────────────

test('cancelar: sigue hasta el fin del mes pagado, no se vuelve a cobrar y vuelve a Gratis (conserva productos y paquetes)', async () => {
  const { c, usuariaId, subId } = await suscrita('crecimiento');
  for (let i = 0; i < 8; i += 1) assert.equal((await c.post('/api/productos', { nombre: `Producto ${i + 1}` })).estado, 201);
  await s.db.query('update usuarias set creditos_paquete = 300 where id = $1', [usuariaId]);

  let r = await c.post('/api/pagos/cancelar');
  assert.equal(r.estado, 200);
  assert.equal(r.json.estado.pagos.suscripcion.cancelaAlFinal, true);
  assert.equal(r.json.estado.plan.id, 'crecimiento', 'sigue en su plan');

  r = await c.post('/api/pagos/reanudar');
  assert.equal(r.json.estado.pagos.suscripcion.cancelaAlFinal, false);
  await c.post('/api/pagos/cancelar');

  // Llega el fin del mes pagado: Stripe no cobra y termina la suscripción.
  await enviarAvisos(s.base, st.cobrarMes(subId));
  const e = await estado(c);
  assert.equal(e.plan.id, 'gratis');
  assert.equal(e.pagos.suscripcion, null);
  assert.equal(e.creditos.total, 30);
  assert.equal(e.creditos.video.plan, 0);
  assert.equal(e.creditos.video.paquete, 300, 'los de paquete no vencen');
  assert.equal(e.productos.length, 8, 'conserva sus productos');
  assert.equal(e.limites.puedeAgregarProducto, false, 'pero no puede agregar más');
  assert.equal((await c.post('/api/productos', { nombre: 'Uno más' })).estado, 403);
  assert.equal((await s.db.query("select count(*)::int as n from pagos where usuaria_id = $1", [usuariaId])).rows[0].n, 1, 'no hubo otro cobro');
});

test('cobro fallido: se le avisa y sigue en su plan mientras Stripe reintenta; si no se logra, vuelve a Gratis', async () => {
  const { c, subId } = await suscrita('esencial');
  await enviarAvisos(s.base, st.fallarCobro(subId));
  let e = await estado(c);
  assert.equal(e.pagos.suscripcion.pagoFallido, true);
  assert.equal(e.pagos.suscripcion.estado, 'past_due');
  assert.equal(e.plan.id, 'esencial');
  assert.equal(e.historial[0].tipo, 'pago_fallido');

  await enviarAvisos(s.base, st.rendirse(subId));
  e = await estado(c);
  assert.equal(e.plan.id, 'gratis');
  assert.equal(e.pagos.suscripcion, null);
});

test('cobro fallido y luego pagado: se quita el aviso', async () => {
  const { c, subId } = await suscrita('esencial');
  await enviarAvisos(s.base, st.fallarCobro(subId));
  await enviarAvisos(s.base, st.cobrarMes(subId));
  const e = await estado(c);
  assert.equal(e.pagos.suscripcion.pagoFallido, false);
  assert.equal(e.pagos.suscripcion.estado, 'active');
});

// ── Paquetes ──────────────────────────────────────────────────────────────────

test('paquete: compra única; los créditos llegan solo cuando Stripe confirma el pago, una sola vez', async () => {
  const { c, usuariaId } = await cuenta();
  assert.equal((await c.post('/api/pagos/paquete', { paquete: 'mediano' })).json.error.codigo, 'FALTA_ACEPTAR');
  assert.equal((await c.post('/api/pagos/paquete', { paquete: 'gigante', aceptaTerminos: true })).estado, 400);
  const r = await c.post('/api/pagos/paquete', { paquete: 'mediano', aceptaTerminos: true });
  assert.match(r.json.url, /checkout\.stripe\.test/);
  const sesionId = r.json.url.split('/').at(-1);

  // Klarna (u otro pago que tarda): todavía no.
  await enviarAvisos(s.base, st.pagarPaquete(sesionId, { pagado: false }));
  assert.equal((await estado(c)).creditos.video.paquete, 0);

  const listo = st.pagoAtrasadoListo(sesionId);
  await enviarAvisos(s.base, listo);
  await enviarAvisos(s.base, st.pagarPaquete(sesionId)); // otro aviso del mismo pago
  const e = await estado(c);
  assert.equal(e.creditos.video.paquete, 300);
  assert.equal(e.plan.id, 'gratis', 'un paquete no cambia el plan');
  assert.equal(e.creditos.total, 30, 'los créditos de texto no se tocan');
  const pagos = (await s.db.query('select tipo, paquete, monto_centavos from pagos where usuaria_id = $1', [usuariaId])).rows;
  assert.deepEqual(pagos, [{ tipo: 'paquete', paquete: 'mediano', monto_centavos: 2400 }]);
  const mov = (await s.db.query("select bolsa, cantidad from movimientos_creditos where usuaria_id = $1 and motivo = 'compra_paquete'", [usuariaId])).rows;
  assert.deepEqual(mov, [{ bolsa: 'paquete', cantidad: 300 }]);
});

// ── Otros ─────────────────────────────────────────────────────────────────────

test('cambiar la tarjeta: la página de Stripe, solo si ya pagó alguna vez', async () => {
  const { c } = await cuenta();
  assert.equal((await c.post('/api/pagos/portal')).json.error.codigo, 'SIN_PAGOS');
  const x = await suscrita();
  const r = await x.c.post('/api/pagos/portal');
  assert.equal(r.json.url, 'https://billing.stripe.test/portal');
  assert.match(st.llamadas.at(-1).volver, /\?pago=portal#planes$/);
  assert.equal((await c.post('/api/pagos/cancelar')).json.error.codigo, 'SIN_SUSCRIPCION');
});

test('sin llaves de Stripe: los pagos dicen que no están activos y nadie cobra', async () => {
  st.control.lista = false;
  const { c } = await cuenta();
  const r = await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true });
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'PAGOS_NO_DISPONIBLES');
});

test('el aviso de Stripe no necesita sesión ni la cabecera de Vendiva, pero sí la firma', async () => {
  const r = await fetch(`${s.base}/api/pagos/webhook`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"id":"evt_x"}' });
  assert.equal(r.status, 400);
});

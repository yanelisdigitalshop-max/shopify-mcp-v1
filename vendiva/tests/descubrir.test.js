import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa, IDEAS } from './ia-falsa.js';
import { ErrorIA } from '../server/ia/claude.js';
import { semanaDe } from '../server/servicios/creditos.js';

let s;
let ia;
let comportamiento = {};
before(async () => {
  ia = crearIaFalsa({ responder: (n, pedido) => comportamiento.responder?.(n, pedido) });
  const original = ia.generar;
  ia.generar = async (...a) => {
    if (comportamiento.demoraMs) await new Promise((ok) => setTimeout(ok, comportamiento.demoraMs));
    return original(...a);
  };
  s = await levantar({ ia });
});
after(async () => { await s.cerrar(); });
beforeEach(() => { comportamiento = {}; ia.llamadas.length = 0; });

async function conCuenta({ plan = 'gratis', seguidores = 340 } = {}) {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const usuariaId = alta.json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  if (plan !== 'gratis') await s.db.query('update usuarias set plan = $2 where id = $1', [usuariaId, plan]);
  return { c, usuariaId };
}
const estado = async (c) => (await c.get('/api/estado')).json.estado;

// ── Buscador ───────────────────────────────────────────────────────────────────

test('buscador: 5 ideas con por qué vende, comisión a buscar, muestra gratis y palabras exactas; no gasta créditos', async () => {
  const { c } = await conCuenta();
  const r = await c.post('/api/buscador', { nicho: 'Cuidado del cabello' });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const { ideas, consejo } = r.json.busqueda;
  assert.equal(ideas.length, 5);
  for (const i of ideas) assert.ok(i.producto && i.porQueVende && i.comisionABuscar && i.muestraGratis && i.palabrasParaBuscar.length >= 2 && i.ideaDeVideo);
  assert.ok(consejo);
  assert.equal(r.json.estado.creditos.total, 30);
  assert.equal(r.json.estado.limites.busquedasUsadas, 1);
  assert.equal(r.json.estado.limites.busquedasMax, 10);
  assert.equal(r.json.estado.buscador.ultima.id, r.json.busqueda.id, 'queda guardada y se ve al volver');

  const [{ pedido, opciones }] = ia.llamadas;
  assert.match(pedido, /Nicho que quiere explorar: Cuidado del cabello/);
  assert.match(pedido, /Todavía no llega a los 1\.000 seguidores/);
  assert.ok(!opciones.busquedasWeb, 'el buscador no usa la búsqueda web');
  assert.match(opciones.system, /No tienes acceso a TikTok Shop/);
  assert.match(opciones.system, /La marca decide si aprueba una muestra/);
});

test('buscador: le pide a la IA no repetir lo que ya tiene en su lista', async () => {
  const { c } = await conCuenta();
  await c.post('/api/productos', { nombre: 'Cepillo alisador' });
  await c.post('/api/buscador', { nicho: 'Cabello' });
  assert.match(ia.llamadas[0].pedido, /no los repitas:\n- Cepillo alisador/);
});

test('buscador: plan Gratis, 10 búsquedas al mes; la 11 no pasa y no llama a la IA', async () => {
  const { c, usuariaId } = await conCuenta();
  await s.db.query('update usuarias set busquedas_mes = 9 where id = $1', [usuariaId]);
  const decima = await c.post('/api/buscador', { nicho: 'Hogar' });
  assert.equal(decima.estado, 201);
  assert.equal(decima.json.estado.limites.busquedasUsadas, 10);

  ia.llamadas.length = 0;
  const once = await c.post('/api/buscador', { nicho: 'Hogar' });
  assert.equal(once.estado, 402);
  assert.equal(once.json.error.codigo, 'LIMITE_BUSQUEDAS');
  assert.match(once.json.error.mensaje, /Ya usaste tus 10 búsquedas de este mes/);
  assert.equal(ia.llamadas.length, 0);
  assert.equal((await estado(c)).limites.busquedasUsadas, 10);
});

test('buscador: solo cuenta lo entregado y se renueva el día 1', async () => {
  s.ponerFecha(new Date('2026-11-20T15:00:00Z'));
  try {
    const { c, usuariaId } = await conCuenta();
    await s.db.query('update usuarias set busquedas_mes = 9 where id = $1', [usuariaId]);
    comportamiento.responder = () => new ErrorIA('IA_OCUPADA', 'Ocupada.', { reintentable: true });
    assert.equal((await c.post('/api/buscador', { nicho: 'Hogar' })).estado, 503);
    assert.equal((await estado(c)).limites.busquedasUsadas, 9, 'el intento fallido no cuenta');
    comportamiento.responder = undefined;
    assert.equal((await c.post('/api/buscador', { nicho: 'Hogar' })).estado, 201);
    assert.equal((await c.post('/api/buscador', { nicho: 'Hogar' })).estado, 402);

    s.ponerFecha(new Date('2026-12-01T14:00:00Z'));
    const r = await c.post('/api/buscador', { nicho: 'Hogar' });
    assert.equal(r.estado, 201, 'el día 1 vuelve a empezar');
    assert.equal(r.json.estado.limites.busquedasUsadas, 1);
  } finally {
    s.ponerFecha(null);
  }
});

test('buscador: los planes de pago no tienen límite', async () => {
  for (const plan of ['esencial', 'crecimiento', 'pro']) {
    const { c, usuariaId } = await conCuenta({ plan });
    await s.db.query('update usuarias set busquedas_mes = 50 where id = $1', [usuariaId]);
    const r = await c.post('/api/buscador', { nicho: 'Hogar' });
    assert.equal(r.estado, 201, plan);
    assert.equal(r.json.estado.limites.busquedasMax, null);
  }
});

test('buscador: datos inválidos, sin sesión y una búsqueda a la vez', async () => {
  const { c } = await conCuenta();
  for (const cuerpo of [{}, { nicho: '' }, { nicho: 'x' }, { nicho: 'a'.repeat(61) }, { nicho: 'Hogar', extra: 1 }]) {
    assert.equal((await c.post('/api/buscador', cuerpo)).estado, 400, JSON.stringify(cuerpo));
  }
  assert.equal((await s.cliente().post('/api/buscador', { nicho: 'Hogar' })).estado, 401);
  comportamiento.demoraMs = 150;
  const rs = await Promise.all([1, 2].map(() => c.post('/api/buscador', { nicho: 'Hogar' })));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [201, 409]);
  assert.equal((await estado(c)).limites.busquedasUsadas, 1);
});

// ── Guardar una idea en "mis productos" ────────────────────────────────────────

test('guardar una idea la agrega a sus productos (origen buscador) y no la duplica', async () => {
  const { c } = await conCuenta();
  const b = (await c.post('/api/buscador', { nicho: 'Cabello' })).json.busqueda;
  const r = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 2 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const p = r.json.estado.productos.find((x) => x.id === r.json.productoId);
  assert.equal(p.nombre, IDEAS.ideas[2].producto);
  assert.equal(p.descripcion, IDEAS.ideas[2].porQueVende);
  assert.equal(p.origen, 'buscador');
  assert.equal(p.comisionPct, null, 'no se inventa la comisión del producto');
  assert.deepEqual(r.json.estado.buscador.ultima.guardados, { 2: r.json.productoId });

  const otra = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 2 });
  assert.equal(otra.estado, 200);
  assert.equal(otra.json.productoId, r.json.productoId);
  assert.equal(otra.json.estado.productos.length, 1, 'no se duplicó');

  // Si lo borra, puede volver a guardarla.
  const borrado = await c.del(`/api/productos/${r.json.productoId}`);
  assert.deepEqual(borrado.json.estado.buscador.ultima.guardados, {});
  assert.equal((await c.post(`/api/buscador/${b.id}/guardar`, { indice: 2 })).estado, 201);
});

test('guardar respeta el tope de 6 productos del plan Gratis', async () => {
  const { c } = await conCuenta();
  for (let i = 1; i <= 5; i += 1) await c.post('/api/productos', { nombre: `Producto ${i}` });
  const b = (await c.post('/api/buscador', { nicho: 'Cabello' })).json.busqueda;
  assert.equal((await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).estado, 201, 'el sexto entra');
  const septimo = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 1 });
  assert.equal(septimo.estado, 403);
  assert.equal(septimo.json.error.codigo, 'LIMITE_PRODUCTOS');
  assert.equal((await estado(c)).productos.length, 6);

  const pago = await conCuenta({ plan: 'esencial' });
  for (let i = 1; i <= 6; i += 1) await pago.c.post('/api/productos', { nombre: `Producto ${i}` });
  const b2 = (await pago.c.post('/api/buscador', { nicho: 'Cabello' })).json.busqueda;
  assert.equal((await pago.c.post(`/api/buscador/${b2.id}/guardar`, { indice: 0 })).estado, 201, 'en pago no hay tope');
});

test('nadie guarda ideas de la búsqueda de otra cuenta; índice fuera de rango', async () => {
  const duena = await conCuenta();
  const b = (await duena.c.post('/api/buscador', { nicho: 'Cabello' })).json.busqueda;
  const otra = await conCuenta();
  assert.equal((await otra.c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).estado, 404);
  assert.equal((await duena.c.post(`/api/buscador/${b.id}/guardar`, { indice: 7 })).estado, 400);
  assert.equal((await duena.c.post('/api/buscador/no-es-id/guardar', { indice: 0 })).estado, 404);
  assert.deepEqual((await estado(otra.c)).productos, []);
});

test('desde un producto guardado se pueden crear sus guiones', async () => {
  const { c } = await conCuenta();
  const b = (await c.post('/api/buscador', { nicho: 'Cabello' })).json.busqueda;
  const { productoId } = (await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).json;
  const r = await c.post(`/api/productos/${productoId}/guiones`);
  assert.equal(r.estado, 201);
  assert.match(ia.llamadas.at(-1).pedido, new RegExp(IDEAS.ideas[0].producto));
});

// ── Tendencias de la semana ────────────────────────────────────────────────────

test('tendencias: en Gratis no se crean ni se ven, y no se llama a la IA', async () => {
  const { c, usuariaId } = await conCuenta();
  const r = await c.post('/api/tendencias');
  assert.equal(r.estado, 403);
  assert.equal(r.json.error.codigo, 'SOLO_PLANES_DE_PAGO');
  assert.equal(ia.llamadas.length, 0);
  assert.deepEqual((await estado(c)).tendencias, { disponible: false });
  const n = (await s.db.query('select count(*)::int as n from tendencias where usuaria_id = $1', [usuariaId])).rows[0].n;
  assert.equal(n, 0);
});

test('tendencias: en pago se crean con búsqueda web y solo quedan las de fuente verificada', async () => {
  const { c } = await conCuenta({ plan: 'esencial' });
  let e = await estado(c);
  assert.deepEqual(e.tendencias, { disponible: true, semana: semanaDe(new Date()), reporte: null });

  const r = await c.post('/api/tendencias');
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const nombres = r.json.reporte.tendencias.map((t) => t.nombre);
  assert.deepEqual(nombres, ['Calendarios de adviento', 'Rizadores sin calor'], 'la de fuente inventada se descarta');
  assert.equal(r.json.reporte.tendencias[0].fuente, 'https://www.ejemplo-tendencias.com/tiktok-shop/semana-46/', 'se usa la dirección real de la búsqueda');
  assert.equal(r.json.reporte.tendencias[0].fuenteTitulo, 'Lo más vendido esta semana');
  assert.equal(r.json.estado.creditos.total, 30, 'no gasta créditos');
  assert.equal(ia.llamadas[0].opciones.busquedasWeb, 3);
  e = r.json.estado;
  assert.equal(e.tendencias.reporte.id, r.json.reporte.id);

  // Una vez por semana: pedirlo otra vez devuelve el mismo, sin volver a buscar.
  ia.llamadas.length = 0;
  const otra = await c.post('/api/tendencias');
  assert.equal(otra.json.reporte.id, r.json.reporte.id);
  assert.equal(ia.llamadas.length, 0);
});

test('tendencias: si ninguna fuente se puede comprobar, no se guarda nada', async () => {
  const { c, usuariaId } = await conCuenta({ plan: 'pro' });
  comportamiento.responder = () =>
    JSON.stringify({ resumen: 'x', tendencias: [{ nombre: 'Inventada', queEs: 'x', porQue: 'x', fuente: 'https://no-salio.example/a', ideaDeVideo: 'x' }] });
  const r = await c.post('/api/tendencias');
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'SIN_FUENTES');
  const n = (await s.db.query('select count(*)::int as n from tendencias where usuaria_id = $1', [usuariaId])).rows[0].n;
  assert.equal(n, 0);
});

test('tendencias: al bajar a Gratis se ocultan (no se borran) y reaparecen al volver', async () => {
  const { c, usuariaId } = await conCuenta({ plan: 'crecimiento' });
  const r = await c.post('/api/tendencias');
  assert.equal(r.estado, 201);
  await s.db.query("update usuarias set plan = 'gratis' where id = $1", [usuariaId]);
  assert.deepEqual((await estado(c)).tendencias, { disponible: false });
  assert.equal((await c.post('/api/tendencias')).estado, 403);
  await s.db.query("update usuarias set plan = 'crecimiento' where id = $1", [usuariaId]);
  assert.equal((await estado(c)).tendencias.reporte.id, r.json.reporte.id);
});

test('tendencias: una semana nueva, un reporte nuevo', async () => {
  s.ponerFecha(new Date('2026-11-11T15:00:00Z'));
  try {
    const { c } = await conCuenta({ plan: 'pro' });
    const a = (await c.post('/api/tendencias')).json.reporte;
    assert.equal(a.semana, '2026-W46');
    s.ponerFecha(new Date('2026-11-18T15:00:00Z'));
    const e = await estado(c);
    assert.equal(e.tendencias.reporte, null, 'la semana nueva empieza sin reporte');
    const b = (await c.post('/api/tendencias')).json.reporte;
    assert.equal(b.semana, '2026-W47');
    assert.notEqual(b.id, a.id);
  } finally {
    s.ponerFecha(null);
  }
});

test('semanas en la hora de Florida', () => {
  assert.equal(semanaDe(new Date('2026-11-11T15:00:00Z')), '2026-W46');
  assert.equal(semanaDe(new Date('2026-11-16T04:30:00Z')), '2026-W46', 'domingo de noche en Miami sigue siendo la semana anterior');
  assert.equal(semanaDe(new Date('2026-11-16T06:00:00Z')), '2026-W47');
  assert.equal(semanaDe(new Date('2027-01-01T15:00:00Z')), '2026-W53');
});

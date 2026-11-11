import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearFastmossFalso, errorOcupado } from './fastmoss-falso.js';
import { crearIaFalsa } from './ia-falsa.js';
import { ErrorFastmoss } from '../server/fuentes/fastmoss.js';
import { semanaDe } from '../server/servicios/creditos.js';

let s;
let fm;
let ia;
before(async () => {
  fm = crearFastmossFalso();
  ia = crearIaFalsa();
  s = await levantar({ fastmoss: fm, ia });
});
after(async () => { await s.cerrar(); });
beforeEach(async () => {
  fm.llamadas.length = 0;
  ia.llamadas.length = 0;
  Object.assign(fm.control, { lista: true, resultados: 10, fallar: null, vacioSemanas: new Set(), demoraMs: 0 });
  await s.db.query('delete from tendencias_semana');
});

async function conCuenta({ plan = 'gratis' } = {}) {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const usuariaId = alta.json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores: 340, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  if (plan !== 'gratis') await s.db.query('update usuarias set plan = $2 where id = $1', [usuariaId, plan]);
  return { c, usuariaId };
}
const estado = async (c) => (await c.get('/api/estado')).json.estado;

// ── Buscador ───────────────────────────────────────────────────────────────────

test('buscador: una búsqueda = una llamada a FastMoss; productos reales con precio, ventas, comisión, tienda y enlace', async () => {
  const { c } = await conCuenta();
  const r = await c.post('/api/buscador', { consulta: 'hair brush' });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.deepEqual(fm.llamadas, [{ tipo: 'buscar', consulta: 'hair brush' }]);
  const { productos } = r.json.busqueda;
  assert.equal(productos.length, 10);
  for (const p of productos) assert.ok(p.titulo && p.precio && p.ventas7Dias != null && p.comisionPct != null && p.tienda && p.enlace);
  assert.equal(r.json.estado.creditos.total, 30, 'no gasta créditos');
  assert.equal(r.json.estado.limites.busquedasUsadas, 1);
  assert.equal(r.json.estado.buscador.ultima.id, r.json.busqueda.id, 'queda guardada y se ve al volver');
  assert.equal(ia.llamadas.length, 0, 'el buscador no usa la IA');
});

test('buscador: plan Gratis, 10 al mes; la 11 no llama a FastMoss', async () => {
  const { c, usuariaId } = await conCuenta();
  await s.db.query('update usuarias set busquedas_mes = 9 where id = $1', [usuariaId]);
  assert.equal((await c.post('/api/buscador', { consulta: 'mug' })).estado, 201);
  fm.llamadas.length = 0;
  const once = await c.post('/api/buscador', { consulta: 'mug' });
  assert.equal(once.estado, 402);
  assert.equal(once.json.error.codigo, 'LIMITE_BUSQUEDAS');
  assert.equal(fm.llamadas.length, 0);
  assert.equal((await estado(c)).limites.busquedasUsadas, 10);
});

test('buscador: una búsqueda sin resultados no cuenta (FastMoss no la cobra)', async () => {
  const { c } = await conCuenta();
  fm.control.resultados = 0;
  const r = await c.post('/api/buscador', { consulta: 'zzzz' });
  assert.equal(r.estado, 201);
  assert.deepEqual(r.json.busqueda.productos, []);
  assert.equal(r.json.estado.limites.busquedasUsadas, 0);
  assert.equal(fm.llamadas.length, 1);
});

test('buscador: si FastMoss falla, no cuenta, no reintenta solo y avisa', async () => {
  const { c } = await conCuenta();
  fm.control.fallar = errorOcupado();
  const r = await c.post('/api/buscador', { consulta: 'mug' });
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'FASTMOSS_OCUPADO');
  assert.equal(fm.llamadas.length, 1, 'una sola llamada');
  assert.equal((await estado(c)).limites.busquedasUsadas, 0);

  fm.control.fallar = new ErrorFastmoss('FASTMOSS_SIN_SALDO', 'El buscador llegó a su límite de consultas por ahora. Ya quedó anotado para revisarlo.');
  const sinSaldo = await c.post('/api/buscador', { consulta: 'mug' });
  assert.equal(sinSaldo.estado, 503);
  assert.match(sinSaldo.json.error.mensaje, /límite de consultas/);
});

test('buscador: sin la llave de FastMoss avisa y no llama', async () => {
  const { c } = await conCuenta();
  fm.control.lista = false;
  const r = await c.post('/api/buscador', { consulta: 'mug' });
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'FASTMOSS_SIN_LLAVE');
  assert.equal(fm.llamadas.length, 0);
});

test('buscador: se renueva el día 1; los planes de pago no tienen límite', async () => {
  s.ponerFecha(new Date('2026-11-20T15:00:00Z'));
  try {
    const { c, usuariaId } = await conCuenta();
    await s.db.query('update usuarias set busquedas_mes = 10 where id = $1', [usuariaId]);
    assert.equal((await c.post('/api/buscador', { consulta: 'mug' })).estado, 402);
    s.ponerFecha(new Date('2026-12-01T14:00:00Z'));
    const r = await c.post('/api/buscador', { consulta: 'mug' });
    assert.equal(r.estado, 201);
    assert.equal(r.json.estado.limites.busquedasUsadas, 1);
  } finally {
    s.ponerFecha(null);
  }
  for (const plan of ['esencial', 'crecimiento', 'pro']) {
    const { c, usuariaId } = await conCuenta({ plan });
    await s.db.query('update usuarias set busquedas_mes = 80 where id = $1', [usuariaId]);
    const r = await c.post('/api/buscador', { consulta: 'mug' });
    assert.equal(r.estado, 201, plan);
    assert.equal(r.json.estado.limites.busquedasMax, null);
  }
});

test('buscador: datos inválidos, sin sesión y una búsqueda a la vez', async () => {
  const { c } = await conCuenta();
  for (const cuerpo of [{}, { consulta: '' }, { consulta: 'x' }, { consulta: 'a'.repeat(61) }, { consulta: 'mug', otra: 1 }, { nicho: 'mug' }]) {
    assert.equal((await c.post('/api/buscador', cuerpo)).estado, 400, JSON.stringify(cuerpo));
  }
  assert.equal((await s.cliente().post('/api/buscador', { consulta: 'mug' })).estado, 401);
  assert.equal(fm.llamadas.length, 0);
  fm.control.demoraMs = 150;
  const rs = await Promise.all([1, 2].map(() => c.post('/api/buscador', { consulta: 'mug' })));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [201, 409]);
  assert.equal(fm.llamadas.length, 1, 'el segundo toque no llama a FastMoss');
});

// ── Guardar ────────────────────────────────────────────────────────────────────

test('guardar: el producto pasa a su lista con precio, comisión y enlace; sin duplicados', async () => {
  const { c } = await conCuenta();
  const b = (await c.post('/api/buscador', { consulta: 'hair brush' })).json.busqueda;
  const r = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 3 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const p = r.json.estado.productos.find((x) => x.id === r.json.productoId);
  assert.equal(p.nombre, b.productos[3].titulo);
  assert.equal(p.precio, 17.99);
  assert.equal(p.comisionPct, 13);
  assert.equal(p.enlace, b.productos[3].enlace);
  assert.equal(p.origen, 'buscador');
  assert.deepEqual(r.json.estado.buscador.ultima.guardados, { 3: r.json.productoId });

  assert.equal((await c.post(`/api/buscador/${b.id}/guardar`, { indice: 3 })).json.productoId, r.json.productoId);
  // El mismo producto en otra búsqueda tampoco se duplica.
  const b2 = (await c.post('/api/buscador', { consulta: 'otra' })).json.busqueda;
  const otra = await c.post(`/api/buscador/${b2.id}/guardar`, { indice: 3 });
  assert.equal(otra.estado, 200);
  assert.equal(otra.json.productoId, r.json.productoId);
  assert.equal(otra.json.estado.productos.length, 1);
  assert.equal(fm.llamadas.length, 2, 'guardar no llama a FastMoss');
});

test('guardar respeta el máximo de 6 productos del plan Gratis', async () => {
  const { c } = await conCuenta();
  for (let i = 1; i <= 5; i += 1) await c.post('/api/productos', { nombre: `Producto ${i}` });
  const b = (await c.post('/api/buscador', { consulta: 'mug' })).json.busqueda;
  assert.equal((await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).estado, 201);
  const septimo = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 1 });
  assert.equal(septimo.estado, 403);
  assert.equal(septimo.json.error.codigo, 'LIMITE_PRODUCTOS');
  assert.equal((await estado(c)).productos.length, 6);
});

test('desde un producto guardado se crean sus guiones, en vivo y respuestas como en la Parte 2', async () => {
  const { c } = await conCuenta();
  const b = (await c.post('/api/buscador', { consulta: 'hair brush' })).json.busqueda;
  const { productoId } = (await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).json;
  assert.equal((await c.post(`/api/productos/${productoId}/guiones`)).estado, 201);
  assert.match(ia.llamadas.at(-1).pedido, /Cepillo alisador de prueba 1/);
  assert.match(ia.llamadas.at(-1).pedido, /Precio: \$14\.99/);
  const vivo = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(vivo.estado, 201);
  assert.equal(vivo.json.estado.creditos.total, 20);
});

test('guardar: de otra cuenta o fuera de rango, no', async () => {
  const duena = await conCuenta();
  const b = (await duena.c.post('/api/buscador', { consulta: 'mug' })).json.busqueda;
  const otra = await conCuenta();
  assert.equal((await otra.c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).estado, 404);
  assert.equal((await duena.c.post(`/api/buscador/${b.id}/guardar`, { indice: 10 })).estado, 400);
  fm.control.resultados = 3;
  const corta = (await duena.c.post('/api/buscador', { consulta: 'mug' })).json.busqueda;
  assert.equal((await duena.c.post(`/api/buscador/${corta.id}/guardar`, { indice: 5 })).estado, 404);
});

// ── Tendencias ─────────────────────────────────────────────────────────────────

test('tendencias: en Gratis no se piden ni se ven', async () => {
  const { c } = await conCuenta();
  const r = await c.post('/api/tendencias');
  assert.equal(r.estado, 403);
  assert.equal(r.json.error.codigo, 'SOLO_PLANES_DE_PAGO');
  assert.equal(fm.llamadas.length, 0);
  assert.deepEqual((await estado(c)).tendencias, { disponible: false });
});

test('tendencias: en pago, los 10 más vendidos de la semana anterior; una llamada por semana para todas', async () => {
  s.ponerFecha(new Date('2026-11-11T15:00:00Z'));
  try {
    const a = await conCuenta({ plan: 'esencial' });
    assert.deepEqual((await estado(a.c)).tendencias, { disponible: true, semana: '2026-W46', reporte: null });
    const r = await a.c.post('/api/tendencias');
    assert.equal(r.estado, 201, JSON.stringify(r.json));
    assert.deepEqual(fm.llamadas, [{ tipo: 'tendencias', semana: '2026-45' }]);
    assert.equal(r.json.reporte.productos.length, 10);
    assert.equal(r.json.reporte.semanaDatos, '2026-45');
    assert.equal(r.json.estado.creditos.total, 30);

    // Otra usuaria de pago, la misma semana: mismo reporte, sin llamar otra vez.
    const b = await conCuenta({ plan: 'pro' });
    assert.equal((await estado(b.c)).tendencias.reporte.id, r.json.reporte.id);
    assert.equal((await b.c.post('/api/tendencias')).json.reporte.id, r.json.reporte.id);
    assert.equal(fm.llamadas.length, 1);

    // La semana siguiente, uno nuevo.
    s.ponerFecha(new Date('2026-11-18T15:00:00Z'));
    assert.equal((await estado(a.c)).tendencias.reporte, null);
    const nuevo = await a.c.post('/api/tendencias');
    assert.equal(nuevo.json.reporte.semanaDatos, '2026-46');
    assert.equal(fm.llamadas.length, 2);
  } finally {
    s.ponerFecha(null);
  }
});

test('tendencias: dos usuarias a la vez = una sola llamada', async () => {
  const a = await conCuenta({ plan: 'esencial' });
  const b = await conCuenta({ plan: 'crecimiento' });
  fm.control.demoraMs = 150;
  const [ra, rb] = await Promise.all([a.c.post('/api/tendencias'), b.c.post('/api/tendencias')]);
  assert.equal(ra.estado, 201);
  assert.equal(rb.estado, 201);
  assert.equal(ra.json.reporte.id, rb.json.reporte.id);
  assert.equal(fm.llamadas.length, 1);
});

test('tendencias: si la semana pasada todavía no tiene datos, usa la anterior; si falla, no guarda nada', async () => {
  s.ponerFecha(new Date('2026-11-11T15:00:00Z'));
  try {
    const { c } = await conCuenta({ plan: 'pro' });
    fm.control.vacioSemanas = new Set(['2026-45']);
    const r = await c.post('/api/tendencias');
    assert.equal(r.estado, 201);
    assert.equal(r.json.reporte.semanaDatos, '2026-44');
    assert.deepEqual(fm.llamadas.map((l) => l.semana), ['2026-45', '2026-44']);

    await s.db.query('delete from tendencias_semana');
    fm.llamadas.length = 0;
    fm.control.fallar = errorOcupado();
    const mal = await c.post('/api/tendencias');
    assert.equal(mal.estado, 503);
    assert.equal(fm.llamadas.length, 1);
    assert.equal((await estado(c)).tendencias.reporte, null);
  } finally {
    s.ponerFecha(null);
  }
});

test('tendencias: al bajar a Gratis se ocultan y reaparecen al volver', async () => {
  const { c, usuariaId } = await conCuenta({ plan: 'crecimiento' });
  const r = await c.post('/api/tendencias');
  await s.db.query("update usuarias set plan = 'gratis' where id = $1", [usuariaId]);
  assert.deepEqual((await estado(c)).tendencias, { disponible: false });
  await s.db.query("update usuarias set plan = 'crecimiento' where id = $1", [usuariaId]);
  assert.equal((await estado(c)).tendencias.reporte.id, r.json.reporte.id);
  assert.equal(semanaDe(new Date()), (await estado(c)).tendencias.semana);
});

test('/api/salud dice si la llave de FastMoss está puesta, sin mostrarla', async () => {
  const sin = await s.cliente().get('/api/salud');
  assert.ok(['llave puesta', 'falta la llave'].includes(sin.json.fastmoss));
  const con = await levantar({ env: { VENDIVA_FASTMOSS_CLIENT_SECRET: 'secreto-de-prueba-xyz' } });
  try {
    const r = await con.cliente().get('/api/salud');
    assert.equal(r.json.fastmoss, 'llave puesta');
    assert.ok(!JSON.stringify(r.json).includes('secreto-de-prueba'));
  } finally {
    await con.cerrar();
  }
});

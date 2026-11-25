import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { crearRunwayFalso, errorRunwayOcupado } from './runway-falso.js';
import { crearFastmossFalso } from './fastmoss-falso.js';
import { revisarVideos } from '../server/servicios/videos.js';
import { ErrorIA } from '../server/ia/claude.js';

let s;
let ia;
let rw;
let fm;
let iaRespuesta = null;
before(async () => {
  ia = crearIaFalsa({ responder: (n, pedido) => iaRespuesta?.(n, pedido) });
  rw = crearRunwayFalso();
  fm = crearFastmossFalso();
  s = await levantar({ ia, runway: rw, fastmoss: fm });
});
after(async () => { await s.cerrar(); });
beforeEach(() => {
  ia.llamadas.length = 0;
  rw.llamadas.length = 0;
  iaRespuesta = null;
  Object.assign(rw.control, { lista: true, fallarCrear: null, resultado: 'listo', demoraMs: 0 });
});

/** Cuenta con un producto guardado desde el buscador (trae la foto de FastMoss). */
async function conProducto({ plan = 'gratis' } = {}) {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores: 340, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  if (plan !== 'gratis') await s.db.query("update usuarias set plan = $2, periodo_creditos = '2000-01' where id = $1", [usuariaId, plan]);
  const b = (await c.post('/api/buscador', { consulta: 'hair brush' })).json.busqueda;
  const g = await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 });
  return { c, usuariaId, productoId: g.json.productoId };
}
const estado = async (c) => (await c.get('/api/estado')).json.estado;
const crear = (c, productoId, cuerpo) => c.post(`/api/productos/${productoId}/videos`, cuerpo);
const movimientos = async (usuariaId) =>
  (await s.db.query("select bolsa, cantidad, motivo from movimientos_creditos where usuaria_id = $1 and motivo not in ('alta', 'renovacion') order by creado_en, bolsa", [usuariaId])).rows;

test('el producto guardado desde el buscador trae su foto (la de FastMoss)', async () => {
  const { c, productoId } = await conProducto();
  const p = (await estado(c)).productos.find((x) => x.id === productoId);
  assert.equal(p.imagen, 'https://s.500fd.com/tt_product/foto0.jpeg');
});

test('Gratis: el video gratis de 10 s, con aviso confirmado; no gasta créditos', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  let e = await estado(c);
  assert.deepEqual(e.creditos.videoGratis, { incluido: true, disponible: true, segundos: 10 });
  assert.equal(e.creditos.video.total, 0);

  // Sin confirmar no se crea (aunque sea gratis).
  const sin = await crear(c, productoId, { tipo: 'corto', indice: 1 });
  assert.equal(sin.estado, 409);
  assert.deepEqual(sin.json.error.datos, { costo: 0, gratis: true });
  assert.equal(rw.llamadas.length, 0);

  const r = await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.equal(r.json.video.gratis, true);
  assert.equal(r.json.video.estado, 'procesando');
  assert.equal(r.json.video.duracion, 10);
  assert.equal(r.json.video.motor, 'Runway');
  assert.equal(r.json.estado.creditos.total, 30, 'los 30 de texto intactos');
  assert.equal(r.json.estado.creditos.videoGratis.disponible, false);
  assert.deepEqual(await movimientos(usuariaId), [], 'ningún crédito se movió');

  // Una sola llamada a Runway, desde la foto, vertical, 10 s.
  const [l] = rw.llamadas;
  assert.deepEqual([l.tipo, l.imagen, l.segundos], ['crear', 'https://s.500fd.com/tt_product/foto0.jpeg', 10]);
  assert.match(l.prompt, /No faces/);
  assert.equal(rw.llamadas.length, 1);

  // Claude recibió las reglas: sin avatar, sin caras, la foto manda.
  const pedido = ia.llamadas.at(-1).pedido;
  assert.match(pedido, /Nada de caras ni personas hablando, nada de avatar/);
  assert.match(pedido, /video vertical de 10 segundos/);
});

test('el video se termina en segundo plano: ella puede salir y lo encuentra listo', async () => {
  const { c, productoId } = await conProducto();
  const r = await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });
  const tarea = [...rw.tareas.keys()].at(-1);

  await revisarVideos({ db: s.db, runway: rw });
  assert.equal((await estado(c)).videos[productoId].corto[0].estado, 'procesando', 'Runway todavía no termina');

  rw.terminar(tarea, 'listo');
  await revisarVideos({ db: s.db, runway: rw });
  const v = (await estado(c)).videos[productoId].corto[0];
  assert.equal(v.id, r.json.video.id);
  assert.equal(v.estado, 'listo');
  assert.ok(v.guion.conCamara.length && v.guion.sinCamara.length, 'trae el guion en los dos modos');
  assert.equal(v.titulo, 'El cepillo en uso');
  assert.ok(!('url' in v) && !('video_url' in v), 'el enlace de Runway no se manda: se pide fresco al ver');

  // Ver: lleva al enlace de Runway.
  const ver = await fetch(`${s.base}/api/videos/${v.id}/ver`, { headers: { cookie: c.cookie }, redirect: 'manual' });
  assert.equal(ver.status, 302);
  assert.match(ver.headers.get('location'), /^https:\/\/dnznrvs05pmza\.cloudfront\.net\/video-\d+\.mp4/);
});

test('el enlace vence en 24 a 48 h: al verlo después de 20 h se pide uno nuevo a Runway', async () => {
  s.ponerFecha(new Date('2026-11-25T15:00:00Z'));
  try {
    const { c, productoId } = await conProducto();
    await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });
    const tarea = [...rw.tareas.keys()].at(-1);
    rw.terminar(tarea);
    await revisarVideos({ db: s.db, runway: rw, reloj: () => new Date('2026-11-25T15:02:00Z') });
    const id = (await estado(c)).videos[productoId].corto[0].id;
    const ver = async () => (await fetch(`${s.base}/api/videos/${id}/ver`, { headers: { cookie: c.cookie }, redirect: 'manual' })).headers.get('location');

    const primero = await ver();
    rw.llamadas.length = 0;
    assert.equal(await ver(), primero, 'recién hecho: el mismo enlace, sin llamar a Runway');
    assert.equal(rw.llamadas.length, 0);

    s.ponerFecha(new Date('2026-11-26T12:00:00Z'));
    const nuevo = await ver();
    assert.notEqual(nuevo, primero, 'pasadas 20 h: enlace nuevo');
    assert.deepEqual(rw.llamadas.map((l) => l.tipo), ['consultar']);
  } finally {
    s.ponerFecha(null);
  }
});

test('Gratis: después del video gratis, crear videos gasta créditos de video; sin ellos, frena', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });

  rw.llamadas.length = 0;
  const otraGratis = await crear(c, productoId, { tipo: 'corto', indice: 2, costoAceptado: 0 });
  assert.equal(otraGratis.estado, 409, 'el gratis ya se usó: ahora cuesta 20');
  assert.deepEqual(otraGratis.json.error.datos, { costo: 20, gratis: false });

  const sinCreditos = await crear(c, productoId, { tipo: 'corto', indice: 2, costoAceptado: 20 });
  assert.equal(sinCreditos.estado, 402);
  assert.equal(sinCreditos.json.error.codigo, 'CREDITOS_INSUFICIENTES');
  assert.match(sinCreditos.json.error.mensaje, /No te alcanzan los créditos de video/);
  assert.equal(rw.llamadas.length, 0, 'Runway no se llamó');
  assert.equal((await estado(c)).creditos.total, 30, 'los créditos de texto no pagan video');

  // Con un paquete (de video) sí.
  await s.db.query('update usuarias set creditos_paquete = 25 where id = $1', [usuariaId]);
  const conPaquete = await crear(c, productoId, { tipo: 'corto', indice: 2, costoAceptado: 20 });
  assert.equal(conPaquete.estado, 201);
  assert.equal(conPaquete.json.estado.creditos.video.total, 5);
  assert.equal(conPaquete.json.estado.creditos.total, 30);
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'paquete', cantidad: -20, motivo: 'video_corto' }]);
});

test('el video gratis es solo uno al mes y solo video corto; vuelve el día 1', async () => {
  s.ponerFecha(new Date('2026-11-20T15:00:00Z'));
  try {
    const { c, productoId } = await conProducto();
    const desdeFoto = await crear(c, productoId, { tipo: 'desde_foto', indice: 1, costoAceptado: 0 });
    assert.equal(desdeFoto.estado, 409, 'el video desde foto no entra en el gratis');
    assert.deepEqual(desdeFoto.json.error.datos, { costo: 20, gratis: false });
    assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 })).estado, 201);
    assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 3, costoAceptado: 0 })).estado, 409);

    s.ponerFecha(new Date('2026-12-01T14:00:00Z'));
    assert.equal((await estado(c)).creditos.videoGratis.disponible, true);
    assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 3, costoAceptado: 0 })).estado, 201);
  } finally {
    s.ponerFecha(null);
  }
});

test('planes de pago: 20 créditos de video cada uno; sin video gratis; frena en cero', async () => {
  const { c, usuariaId, productoId } = await conProducto({ plan: 'esencial' });
  let e = await estado(c);
  assert.equal(e.creditos.video.total, 100);
  assert.equal(e.creditos.total, 100);
  assert.equal(e.creditos.videoGratis.incluido, false);

  assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 })).estado, 409, 'en pago no hay video gratis');
  for (const [tipo, indice] of [['corto', 1], ['corto', 2], ['corto', 3], ['desde_foto', 1], ['desde_foto', 2]]) {
    const r = await crear(c, productoId, { tipo, indice, costoAceptado: 20 });
    assert.equal(r.estado, 201, `${tipo} ${indice}`);
  }
  e = await estado(c);
  assert.equal(e.creditos.video.total, 0);
  assert.equal(e.creditos.total, 100, 'el texto no se tocó');
  const sexto = await crear(c, productoId, { tipo: 'desde_foto', indice: 3, costoAceptado: 20 });
  assert.equal(sexto.estado, 402, 'video frena en cero también en pago');
  assert.equal(rw.llamadas.filter((l) => l.tipo === 'crear').length, 5);
  assert.equal((await movimientos(usuariaId)).reduce((n, m) => n + m.cantidad, 0), -100);
});

test('si Runway falla al crear, no se cobra: vuelve el crédito o el video gratis', async () => {
  const { c, usuariaId, productoId } = await conProducto({ plan: 'pro' });
  rw.control.fallarCrear = errorRunwayOcupado();
  const r = await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 });
  assert.equal(r.estado, 503);
  assert.match(r.json.error.mensaje, /No se gastó ningún crédito/);
  const e = await estado(c);
  assert.equal(e.creditos.video.total, 1000);
  assert.equal(e.videos[productoId].corto[0].estado, 'fallido');
  assert.equal(e.videos[productoId].corto[0].creditosCobrados, 0);
  assert.equal((await movimientos(usuariaId)).reduce((n, m) => n + m.cantidad, 0), 0);

  const gratis = await conProducto();
  const g = await crear(gratis.c, gratis.productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });
  assert.equal(g.estado, 503);
  assert.match(g.json.error.mensaje, /Tu video gratis del mes sigue disponible/);
  assert.equal((await estado(gratis.c)).creditos.videoGratis.disponible, true);
});

test('si la IA no puede escribir el plan del video, tampoco se cobra ni se llama a Runway', async () => {
  const { c, productoId } = await conProducto({ plan: 'pro' });
  iaRespuesta = () => new ErrorIA('IA_OCUPADA', 'Ocupada.', { reintentable: true });
  const r = await crear(c, productoId, { tipo: 'desde_foto', indice: 2, costoAceptado: 20 });
  assert.equal(r.estado, 503);
  assert.equal(rw.llamadas.length, 0);
  assert.equal((await estado(c)).creditos.video.total, 1000);
});

test('si Runway falla después (al procesar), se devuelve todo una sola vez', async () => {
  const { c, usuariaId, productoId } = await conProducto({ plan: 'crecimiento' });
  await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 });
  assert.equal((await estado(c)).creditos.video.total, 280);
  rw.terminar([...rw.tareas.keys()].at(-1), 'fallido');
  await revisarVideos({ db: s.db, runway: rw });
  await revisarVideos({ db: s.db, runway: rw });
  const e = await estado(c);
  assert.equal(e.creditos.video.total, 300, 'se devolvieron los 20');
  assert.equal(e.videos[productoId].corto[0].estado, 'fallido');
  assert.match(e.videos[productoId].corto[0].falla, /Runway no pudo crear/);
  const devoluciones = (await movimientos(usuariaId)).filter((m) => m.motivo === 'devolucion');
  assert.equal(devoluciones.length, 1, 'no se devuelve dos veces');

  // Y puede volver a crearlo.
  assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 })).estado, 201);
});

test('si Runway tarda más de 30 minutos, se cancela y se devuelve', async () => {
  const { c, productoId } = await conProducto();
  await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 0 });
  const tarea = [...rw.tareas.keys()].at(-1);
  await revisarVideos({ db: s.db, runway: rw, reloj: () => new Date(Date.now() + 31 * 60000) });
  const e = await estado(c);
  assert.equal(e.videos[productoId].corto[0].estado, 'fallido');
  assert.equal(e.creditos.videoGratis.disponible, true, 'el video gratis vuelve');
  assert.ok(rw.llamadas.some((l) => l.tipo === 'cancelar' && l.id === tarea));
});

test('mientras un video se hace, ese lugar no se puede pedir otra vez; y una creación a la vez', async () => {
  const { c, productoId } = await conProducto({ plan: 'pro' });
  assert.equal((await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 })).estado, 201);
  const otra = await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 });
  assert.equal(otra.estado, 409);
  assert.equal(otra.json.error.codigo, 'VIDEO_EN_PROCESO');

  rw.control.demoraMs = 150;
  const rs = await Promise.all([2, 3].map((indice) => crear(c, productoId, { tipo: 'corto', indice, costoAceptado: 20 })));
  assert.deepEqual(rs.map((r) => r.estado).sort(), [201, 409]);
  assert.equal((await estado(c)).creditos.video.total, 960, 'cobró solo los dos que se crearon');
});

test('sin foto, sin llave, de otra cuenta o datos inválidos: no se crea ni se cobra', async () => {
  const { c, productoId } = await conProducto({ plan: 'pro' });
  const manual = (await c.post('/api/productos', { nombre: 'Producto sin foto' })).json.productoId;
  const sinFoto = await crear(c, manual, { tipo: 'corto', indice: 1, costoAceptado: 20 });
  assert.equal(sinFoto.estado, 422);
  assert.equal(sinFoto.json.error.codigo, 'SIN_FOTO');

  rw.control.lista = false;
  const sinLlave = await crear(c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 });
  assert.equal(sinLlave.estado, 503);
  assert.equal(sinLlave.json.error.codigo, 'VIDEO_NO_DISPONIBLE');
  rw.control.lista = true;

  const otra = await conProducto({ plan: 'pro' });
  assert.equal((await crear(otra.c, productoId, { tipo: 'corto', indice: 1, costoAceptado: 20 })).estado, 404);
  for (const cuerpo of [{ tipo: 'largo', indice: 1 }, { tipo: 'corto', indice: 4 }, { tipo: 'corto', indice: 0 }, { tipo: 'corto', indice: 1, extra: 1 }]) {
    assert.equal((await crear(c, productoId, cuerpo)).estado, 400, JSON.stringify(cuerpo));
  }
  assert.equal(rw.llamadas.length, 0);
  assert.equal((await estado(c)).creditos.video.total, 1000);
  assert.equal((await s.cliente().post(`/api/productos/${productoId}/videos`, { tipo: 'corto', indice: 1 })).estado, 401);
  const ajeno = await fetch(`${s.base}/api/videos/00000000-0000-4000-8000-000000000000/ver`, { headers: { cookie: c.cookie }, redirect: 'manual' });
  assert.equal(ajeno.status, 404);
});

// ── GIFs (créditos de texto) ───────────────────────────────────────────────────

test('3 GIFs: 9 créditos de TEXTO, con aviso confirmado', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  const sin = await c.post(`/api/productos/${productoId}/gifs`, {});
  assert.equal(sin.estado, 409);
  assert.equal(sin.json.error.datos.costo, 9);

  const r = await c.post(`/api/productos/${productoId}/gifs`, { costoAceptado: 9 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.equal(r.json.creacion.contenido.gifs.length, 3);
  for (const g of r.json.creacion.contenido.gifs) assert.ok(g.nombre && g.duracion && g.queSeVe && g.dondeUsarlo);
  assert.equal(r.json.estado.creditos.total, 21);
  assert.equal(r.json.estado.creditos.videoGratis.disponible, true, 'no toca el video gratis');
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -9, motivo: 'gifs' }]);
  assert.match(ia.llamadas.at(-1).pedido, /3 GIFs cortos/);
});

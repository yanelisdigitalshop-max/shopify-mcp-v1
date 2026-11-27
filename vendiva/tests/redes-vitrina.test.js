// Parte 6: textos para sus redes (1 crédito de texto por red) y Vitrina (solo Pro).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { ErrorIA } from '../server/ia/claude.js';

let s;
let ia;
let respuesta = null;
before(async () => {
  ia = crearIaFalsa({ responder: (n, pedido) => respuesta?.(n, pedido) });
  s = await levantar({ ia });
});
after(async () => { await s.cerrar(); });
beforeEach(() => { respuesta = null; ia.llamadas.length = 0; });

const estado = async (c) => (await c.get('/api/estado')).json.estado;
const movimientos = async (usuariaId) =>
  (await s.db.query("select bolsa, cantidad, motivo from movimientos_creditos where usuaria_id = $1 and motivo not in ('alta', 'renovacion') order by creado_en", [usuariaId])).rows;

async function cuenta({ redes = ['tiktok', 'instagram', 'pinterest'], plan = 'gratis', objetivo = 'vender_mas' } = {}) {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cabello', seguidores: 340, modoGrabacion: 'sin_camara', objetivo, redes, onboardingCompleto: true });
  if (plan !== 'gratis') await s.db.query("update usuarias set plan = $2, periodo_creditos = '2000-01' where id = $1", [usuariaId, plan]);
  return { c, usuariaId };
}
async function conGuiones(opciones) {
  const x = await cuenta(opciones);
  const p = await x.c.post('/api/productos', { nombre: 'Cepillo alisador', descripcion: 'Alisa sin calor.' });
  const g = await x.c.post(`/api/productos/${p.json.productoId}/guiones`);
  ia.llamadas.length = 0; // solo cuentan las llamadas de lo que se prueba
  return { ...x, creacionId: g.json.creacion.id };
}
const ruta = (creacionId, numero = 1) => `/api/creaciones/${creacionId}/guiones/${numero}/textos-redes`;

// ── Usuarios de sus redes ──────────────────────────────────────────────────────

test('Mi cuenta: usuarios de Instagram, Facebook y Pinterest, opcionales y sin @', async () => {
  const { c } = await cuenta();
  let r = await c.patch('/api/perfil', { usuarioInstagram: '@maria.vende', usuarioFacebook: 'maria.perez', usuarioPinterest: 'maria_vende' });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  const p = r.json.estado.perfil;
  assert.deepEqual([p.usuarioInstagram, p.usuarioFacebook, p.usuarioPinterest], ['maria.vende', 'maria.perez', 'maria_vende']);

  r = await c.patch('/api/perfil', { usuarioInstagram: '', usuarioPinterest: null });
  assert.equal(r.json.estado.perfil.usuarioInstagram, null, 'vacío lo borra');
  assert.equal(r.json.estado.perfil.usuarioPinterest, null);

  assert.equal((await c.patch('/api/perfil', { usuarioInstagram: 'con espacios' })).estado, 400);
  assert.equal((await c.patch('/api/perfil', { usuarioFacebook: 'abc' })).estado, 400, 'Facebook pide al menos 5');
  assert.equal((await c.patch('/api/perfil', { contrasenaInstagram: 'x' })).estado, 400, 'nunca contraseñas');
});

// ── Textos para sus redes ──────────────────────────────────────────────────────

test('textos para sus redes: solo las que marcó (sin TikTok), 1 crédito por red, con aviso', async () => {
  const { c, usuariaId, creacionId } = await conGuiones({ redes: ['tiktok', 'instagram', 'pinterest'] });
  await c.patch('/api/perfil', { usuarioInstagram: 'maria.vende' });

  // Sin confirmar no se crea; el servidor dice el costo y las redes.
  const sin = await c.post(ruta(creacionId, 2));
  assert.equal(sin.estado, 409);
  assert.deepEqual(sin.json.error.datos, { costo: 2, redes: ['instagram', 'pinterest'] });
  assert.equal(ia.llamadas.length, 0);
  assert.equal((await c.post(ruta(creacionId, 2), { costoAceptado: 3 })).estado, 409, 'otro costo no vale');

  const r = await c.post(ruta(creacionId, 2), { costoAceptado: 2 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.deepEqual(Object.keys(r.json.textos.contenido), ['instagram', 'pinterest']);
  assert.ok(r.json.textos.contenido.instagram.hashtags.every((h) => h.startsWith('#')));
  assert.ok(r.json.textos.contenido.pinterest.titulo);
  assert.equal(r.json.textos.creditosCobrados, 2);
  assert.equal(r.json.estado.creditos.total, 28);
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -2, motivo: 'textos_redes' }]);

  // En el estado, por guion.
  const e = r.json.estado.textosRedes[`${creacionId}:2`];
  assert.equal(e.id, r.json.textos.id);
  assert.equal(r.json.estado.textosRedes[`${creacionId}:1`], undefined);

  // Claude recibió el guion, sus cuentas y solo esas redes.
  const pedido = ia.llamadas.at(-1).pedido;
  assert.match(pedido, /Instagram: @maria\.vende/);
  assert.match(pedido, /solo con estas redes \(instagram, pinterest\)/);
  assert.doesNotMatch(pedido, /"facebook"/);
});

test('textos para redes: solo TikTok marcado, no hay nada que crear', async () => {
  const { c, creacionId } = await conGuiones({ redes: ['tiktok'] });
  const r = await c.post(ruta(creacionId), { costoAceptado: 0 });
  assert.equal(r.estado, 409);
  assert.equal(r.json.error.codigo, 'SIN_REDES');
  assert.equal(ia.llamadas.length, 0);
});

test('textos para redes: Gratis sin créditos frena; si la IA falla se devuelve todo', async () => {
  const { c, usuariaId, creacionId } = await conGuiones({ redes: ['instagram', 'facebook', 'pinterest'] });
  await s.db.query('update usuarias set creditos_plan = 2 where id = $1', [usuariaId]);
  const frena = await c.post(ruta(creacionId), { costoAceptado: 3 });
  assert.equal(frena.estado, 402);
  assert.equal(frena.json.error.codigo, 'CREDITOS_INSUFICIENTES');
  assert.equal(ia.llamadas.length, 0);

  await s.db.query('update usuarias set creditos_plan = 30 where id = $1', [usuariaId]);
  respuesta = () => new ErrorIA('SOBRECARGA', 'Claude está ocupado.', { reintentable: true });
  const falla = await c.post(ruta(creacionId), { costoAceptado: 3 });
  assert.equal(falla.estado, 503);
  assert.match(falla.json.error.mensaje, /No se gastó ningún crédito/);
  assert.equal((await estado(c)).creditos.total, 30);
  assert.deepEqual((await movimientos(usuariaId)).map((m) => [m.cantidad, m.motivo]), [[-3, 'textos_redes'], [3, 'devolucion']]);
});

test('textos para redes: los planes de pago no frenan (se descuenta hasta cero)', async () => {
  const { c, usuariaId, creacionId } = await conGuiones({ redes: ['instagram', 'facebook'], plan: 'esencial' });
  await s.db.query('update usuarias set creditos_plan = 1 where id = $1', [usuariaId]);
  const r = await c.post(ruta(creacionId, 3), { costoAceptado: 2 });
  assert.equal(r.estado, 201);
  assert.equal(r.json.estado.creditos.total, 0);
});

test('textos para redes: solo guiones propios', async () => {
  const a = await conGuiones();
  const b = await cuenta();
  assert.equal((await b.c.post(ruta(a.creacionId), { costoAceptado: 2 })).estado, 404);
  assert.equal((await a.c.post(`/api/creaciones/${a.creacionId}/guiones/4/textos-redes`, { costoAceptado: 2 })).estado, 404);
});

// ── Vitrina ───────────────────────────────────────────────────────────────────

const calificacion = { estrellas: 3.8, resenas: 42, quejas: ['no_es_como_se_ve', 'envio_lento'], quejaOtra: 'Dicen que el color es distinto' };

test('Vitrina: solo Pro; los demás planes no reciben nada y el servidor no deja guardar', async () => {
  for (const plan of ['gratis', 'esencial', 'crecimiento']) {
    const { c } = await cuenta({ plan, objetivo: 'subir_vitrina' });
    const e = await estado(c);
    assert.deepEqual(e.vitrina, { disponible: false }, plan);
    const r = await c.post('/api/vitrina', calificacion);
    assert.equal(r.estado, 403, plan);
    assert.equal(r.json.error.codigo, 'SOLO_PRO');
  }
  assert.equal(ia.llamadas.length, 0);
});

test('Vitrina (Pro): guarda la calificación, escribe el plan sin créditos y avisa si baja de 4', async () => {
  const { c, usuariaId } = await cuenta({ plan: 'pro' });
  let e = await estado(c);
  assert.equal(e.vitrina.disponible, true);
  assert.equal(e.vitrina.ultima, null);
  const antes = e.creditos;

  const r = await c.post('/api/vitrina', { estrellas: 4.6, resenas: 30 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  e = r.json.estado;
  assert.equal(e.vitrina.ultima.estrellas, 4.6);
  assert.deepEqual(e.vitrina.ultima.quejas, []);
  assert.ok(e.vitrina.ultima.plan.prioridades.length >= 2);
  assert.equal(e.vitrina.bajoDelMinimo, false);
  assert.equal(e.vitrina.cambio, null);

  const r2 = await c.post('/api/vitrina', calificacion);
  e = r2.json.estado;
  assert.equal(e.vitrina.ultima.estrellas, 3.8);
  assert.equal(e.vitrina.bajoDelMinimo, true, 'aviso: debajo de 4');
  assert.equal(e.vitrina.cambio, -0.8);
  assert.equal(e.vitrina.historial.length, 2);
  assert.deepEqual(e.vitrina.ultima.quejas, ['envio_lento', 'no_es_como_se_ve']);
  assert.deepEqual(e.creditos, antes, 'incluido en Pro: no gasta créditos');
  assert.deepEqual(await movimientos(usuariaId), []);

  // Claude recibió las quejas, el historial y las reglas.
  const pedido = ia.llamadas.at(-1).pedido;
  assert.match(pedido, /3\.8 de 5 estrellas, con 42 reseñas/);
  assert.match(pedido, /El producto no es como se ve en el video/);
  assert.match(pedido, /Otra: Dicen que el color es distinto/);
  assert.match(pedido, /4\.6 estrellas, 30 reseñas/);
  assert.match(pedido, /Prohibido sugerir reseñas falsas/);
  assert.equal(e.historial[0].tipo, 'vitrina_actualizada');
});

test('Vitrina: datos que no valen', async () => {
  const { c } = await cuenta({ plan: 'pro' });
  assert.equal((await c.post('/api/vitrina', { estrellas: 6, resenas: 1 })).estado, 400);
  assert.equal((await c.post('/api/vitrina', { estrellas: 0.5, resenas: 1 })).estado, 400);
  assert.equal((await c.post('/api/vitrina', { estrellas: 4, resenas: -1 })).estado, 400);
  assert.equal((await c.post('/api/vitrina', { estrellas: 4, resenas: 1, quejas: ['inventada'] })).estado, 400);
  assert.equal((await c.post('/api/vitrina', { estrellas: 4, resenas: 1, quejaOtra: 'x'.repeat(301) })).estado, 400);
  const redondeo = await c.post('/api/vitrina', { estrellas: 4.26, resenas: 1 });
  assert.equal(redondeo.json.estado.vitrina.ultima.estrellas, 4.3);
});

test('Vitrina: si la IA falla, la calificación queda guardada y el plan se pide otra vez', async () => {
  const { c } = await cuenta({ plan: 'pro' });
  respuesta = () => new ErrorIA('SOBRECARGA', 'Claude está ocupado.', { reintentable: true });
  const r = await c.post('/api/vitrina', calificacion);
  assert.equal(r.estado, 503);
  assert.match(r.json.error.mensaje, /Tu calificación sí quedó guardada/);
  let e = await estado(c);
  assert.equal(e.vitrina.ultima.estrellas, 3.8);
  assert.equal(e.vitrina.ultima.plan, null);

  respuesta = null;
  const otra = await c.post(`/api/vitrina/${e.vitrina.ultima.id}/plan`);
  assert.equal(otra.estado, 200, JSON.stringify(otra.json));
  e = otra.json.estado;
  assert.ok(e.vitrina.ultima.plan.resumen);
  assert.equal(e.vitrina.historial.length, 1, 'no se duplicó la calificación');
});

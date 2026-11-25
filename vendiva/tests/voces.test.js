// Parte 4: la voz de los videos. Voz real (gratis, sin límite) y voz de IA de ElevenLabs
// (2 créditos de texto; Gratis: 3 al mes, después solo con créditos de paquete).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { crearRunwayFalso } from './runway-falso.js';
import { crearFastmossFalso } from './fastmoss-falso.js';
import { crearVozFalsa, errorVozOcupada } from './voz-falsa.js';
import { audio, revisarMp4, videoSinSonido } from './medios.js';
import { revisarVideos } from '../server/servicios/videos.js';
import { narracionDe } from '../server/servicios/voces.js';
import { PLAN_VIDEO } from './ia-falsa.js';

let s;
let rw;
let voz;
before(async () => {
  rw = crearRunwayFalso();
  voz = crearVozFalsa();
  s = await levantar({ ia: crearIaFalsa(), runway: rw, fastmoss: crearFastmossFalso(), voz });
});
after(async () => {
  await s.cerrar();
});
beforeEach(() => {
  voz.llamadas.length = 0;
  Object.assign(voz.control, { lista: true, fallar: null });
  rw.control.archivo = null;
});

/** Cuenta con un video listo (el gratis del mes, o pagado en un plan de pago). */
async function videoListo({ plan = 'gratis', textoPlan, paquete } = {}) {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores: 340, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  if (plan !== 'gratis') await s.db.query("update usuarias set plan = $2, periodo_creditos = '2000-01' where id = $1", [usuariaId, plan]);
  const b = (await c.post('/api/buscador', { consulta: 'hair brush' })).json.busqueda;
  const productoId = (await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).json.productoId;
  const r = await c.post(`/api/productos/${productoId}/videos`, { tipo: 'corto', indice: 1, costoAceptado: plan === 'gratis' ? 0 : 20 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const tarea = (await s.db.query('select tarea_id from videos where id = $1', [r.json.video.id])).rows[0].tarea_id;
  rw.terminar(tarea, 'listo');
  await revisarVideos({ db: s.db, runway: rw });
  if (textoPlan != null) await s.db.query('update usuarias set creditos_plan = $2 where id = $1', [usuariaId, textoPlan]);
  if (paquete != null) await s.db.query('update usuarias set creditos_paquete = $2 where id = $1', [usuariaId, paquete]);
  return { c, usuariaId, productoId, videoId: r.json.video.id };
}

const estado = async (c) => (await c.get('/api/estado')).json.estado;
const videoDe = async (c, productoId) => (await estado(c)).videos[productoId].corto[0];
const vozIA = (c, videoId, costoAceptado) => c.post(`/api/videos/${videoId}/voz-ia`, costoAceptado == null ? {} : { costoAceptado });
const movimientos = async (usuariaId) =>
  (await s.db.query("select bolsa, cantidad, motivo from movimientos_creditos where usuaria_id = $1 and motivo not in ('alta', 'renovacion') order by creado_en, bolsa", [usuariaId])).rows;
const usadas = async (usuariaId) => (await s.db.query('select voces_ia_mes from usuarias where id = $1', [usuariaId])).rows[0].voces_ia_mes;

async function subirGrabacion(c, videoId, bytes, tipo = 'audio/webm;codecs=opus') {
  const r = await fetch(`${s.base}/api/videos/${videoId}/voz-real`, {
    method: 'POST',
    headers: { cookie: c.cookie, 'x-vendiva': '1', 'content-type': tipo },
    body: bytes,
  });
  return { estado: r.status, json: await r.json() };
}
const bajar = (c, id) => fetch(`${s.base}/api/videos/${id}/descargar`, { headers: { cookie: c.cookie } });

// ── Voz real ──────────────────────────────────────────────────────────────────

test('voz real: ella graba su voz; es gratis, no mueve ningún crédito y no tiene límite', async () => {
  const { c, usuariaId, productoId, videoId } = await videoListo();
  const antes = await estado(c);
  for (let i = 0; i < 5; i++) {
    const r = await subirGrabacion(c, videoId, audio(1, 'webm'));
    assert.equal(r.estado, 201, JSON.stringify(r.json));
  }
  const v = await videoDe(c, productoId);
  assert.equal(v.voz.tipo, 'real');
  assert.equal(v.voz.creditosCobrados, 0);
  const despues = await estado(c);
  assert.equal(despues.creditos.total, antes.creditos.total);
  assert.equal(despues.creditos.video.total, antes.creditos.video.total);
  assert.deepEqual(await movimientos(usuariaId), []);
  assert.equal(await usadas(usuariaId), 0, 'la voz real no cuenta en el límite de la voz de IA');

  // Una sola voz por video: la nueva reemplaza a la anterior.
  assert.equal((await s.db.query('select count(*)::int as n from voces where video_id = $1', [videoId])).rows[0].n, 1);
  // Se puede escuchar.
  const oir = await fetch(`${s.base}/api/videos/${videoId}/voz`, { headers: { cookie: c.cookie } });
  assert.equal(oir.status, 200);
  assert.equal(oir.headers.get('content-type'), 'audio/webm');
});

test('voz real: grabaciones de Safari (mp4) también; vacías o de otro tipo, no', async () => {
  const { c, videoId } = await videoListo();
  assert.equal((await subirGrabacion(c, videoId, audio(1, 'm4a'), 'audio/mp4')).estado, 201);
  const vacia = await subirGrabacion(c, videoId, new Uint8Array(10));
  assert.equal(vacia.estado, 422);
  assert.equal(vacia.json.error.codigo, 'AUDIO_VACIO');
  const otra = await subirGrabacion(c, videoId, audio(1, 'webm'), 'text/plain');
  assert.equal(otra.estado, 415);
  assert.equal(otra.json.error.codigo, 'AUDIO_INVALIDO');
});

test('al descargar con voz, el archivo trae el video y la voz juntos (con sonido)', async () => {
  const { c, productoId, videoId } = await videoListo();
  await subirGrabacion(c, videoId, audio(1, 'webm'));
  rw.control.archivo = videoSinSonido(2);
  const original = revisarMp4(rw.control.archivo);
  assert.deepEqual(original.tiposDeStream, ['video'], 'el de Runway viene sin sonido');

  const r = await bajar(c, videoId);
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /-video-corto-1-con-voz\.mp4"$/);
  const final = revisarMp4(Buffer.from(await r.arrayBuffer()));
  assert.deepEqual(final.tiposDeStream.sort(), ['audio', 'video']);
  assert.ok(Math.abs(final.duracion - 2) < 0.3, `dura lo mismo que el video: ${final.duracion}`);
  let descargado = false;
  for (let i = 0; i < 20 && !descargado; i++) {
    descargado = (await videoDe(c, productoId)).descargado;
    if (!descargado) await new Promise((ok) => setTimeout(ok, 25));
  }
  assert.ok(descargado);

  // Si cambia la voz, el archivo que bajó ya no es el último: vuelve a pedir que lo descargue.
  await subirGrabacion(c, videoId, audio(1, 'webm'));
  assert.equal((await videoDe(c, productoId)).descargado, false);
});

test('la voz se pone solo en videos listos y propios', async () => {
  const { videoId } = await videoListo();
  const otra = s.cliente();
  await otra.post('/api/cuenta/registro', cuentaNueva());
  assert.equal((await subirGrabacion(otra, videoId, audio(1, 'webm'))).estado, 404);
  assert.equal((await vozIA(otra, videoId, 2)).estado, 404);
  assert.equal((await fetch(`${s.base}/api/videos/${videoId}/voz`, { headers: { cookie: otra.cookie } })).status, 404);
  assert.equal(voz.llamadas.length, 0);

  const { c, usuariaId, videoId: listo } = await videoListo({ plan: 'esencial' });
  await s.db.query("update videos set estado = 'procesando' where id = $1", [listo]);
  const r = await vozIA(c, listo, 2);
  assert.equal(r.estado, 409);
  assert.equal(r.json.error.codigo, 'VIDEO_NO_LISTO');
  assert.deepEqual((await movimientos(usuariaId)).filter((m) => m.motivo === 'voz_ia'), []);
});

// ── Voz de IA ─────────────────────────────────────────────────────────────────

test('voz de IA: narra el guion sin cámara (lo que se escucha), sin [marcas]', () => {
  assert.equal(
    narracionDe({ sinCamara: [{ seEscucha: 'Mira este cepillo.' }, { seEscucha: ' Alisa en [tu tiempo] minutos. ' }, { seEscucha: '' }] }),
    'Mira este cepillo. Alisa en minutos.',
  );
});

test('voz de IA en Gratis: sin confirmar el costo no se crea; con «Sí, crear» cuesta 2 créditos de texto y cuenta 1 de 3', async () => {
  const { c, usuariaId, productoId, videoId } = await videoListo();
  let e = await estado(c);
  assert.deepEqual(e.creditos.vozIA, { costo: 2, bolsa: 'texto', saldo: 30, frena: true, usadasMes: 0, maxMes: 3 });

  const sin = await vozIA(c, videoId);
  assert.equal(sin.estado, 409);
  assert.equal(sin.json.error.codigo, 'FALTA_CONFIRMAR');
  assert.equal(voz.llamadas.length, 0, 'no se llamó a ElevenLabs');
  const mal = await vozIA(c, videoId, 1);
  assert.equal(mal.estado, 409);

  const r = await vozIA(c, videoId, 2);
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.equal(voz.llamadas.length, 1);
  const narrado = narracionDe(PLAN_VIDEO);
  assert.equal(voz.llamadas[0].texto, narrado);
  e = r.json.estado;
  assert.equal(e.creditos.total, 28, 'de 30 a 28 créditos de texto');
  assert.equal(e.creditos.video.total, 0);
  assert.equal(e.creditos.vozIA.usadasMes, 1);
  const v = e.videos[productoId].corto[0];
  assert.equal(v.voz.tipo, 'ia');
  assert.equal(v.voz.creditosCobrados, 2);
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -2, motivo: 'voz_ia' }]);
  const guardada = (await s.db.query('select texto, proveedor, modelo from voces where video_id = $1', [videoId])).rows[0];
  assert.deepEqual(guardada, { texto: narrado, proveedor: 'elevenlabs', modelo: 'eleven_multilingual_v2' });
});

test('voz de IA en Gratis: 3 al mes; la 4.ª solo con créditos de paquete (o frena sin llamar a ElevenLabs)', async () => {
  const { c, usuariaId, videoId } = await videoListo();
  for (let i = 0; i < 3; i++) assert.equal((await vozIA(c, videoId, 2)).estado, 201);
  let e = await estado(c);
  assert.equal(e.creditos.total, 24);
  assert.deepEqual(e.creditos.vozIA, { costo: 2, bolsa: 'paquete', saldo: 0, frena: true, usadasMes: 3, maxMes: 3 });

  voz.llamadas.length = 0;
  const cuarta = await vozIA(c, videoId, 2);
  assert.equal(cuarta.estado, 402);
  assert.equal(cuarta.json.error.codigo, 'CREDITOS_INSUFICIENTES');
  assert.match(cuarta.json.error.mensaje, /compra créditos o sube de plan/);
  assert.equal(voz.llamadas.length, 0);
  assert.equal(await usadas(usuariaId), 3);

  // Con un paquete comprado sí: se paga con el paquete, los de texto no se tocan.
  await s.db.query('update usuarias set creditos_paquete = 10 where id = $1', [usuariaId]);
  const conPaquete = await vozIA(c, videoId, 2);
  assert.equal(conPaquete.estado, 201);
  e = conPaquete.json.estado;
  assert.equal(e.creditos.total, 24);
  assert.equal(e.creditos.video.paquete, 8);
  assert.equal((await movimientos(usuariaId)).at(-1).bolsa, 'paquete');
});

test('voz de IA en Gratis: si no alcanzan los créditos de texto, frena aunque le queden usos', async () => {
  const { c, videoId } = await videoListo({ textoPlan: 1 });
  const r = await vozIA(c, videoId, 2);
  assert.equal(r.estado, 402);
  assert.equal(voz.llamadas.length, 0);
});

test('voz de IA: si ElevenLabs falla no se cobra nada y el uso no cuenta', async () => {
  const { c, usuariaId, productoId, videoId } = await videoListo();
  voz.control.fallar = errorVozOcupada();
  const r = await vozIA(c, videoId, 2);
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'VOZ_OCUPADA');
  assert.match(r.json.error.mensaje, /No se gastó ningún crédito/);
  const e = await estado(c);
  assert.equal(e.creditos.total, 30);
  assert.equal(e.creditos.vozIA.usadasMes, 0);
  assert.equal(await usadas(usuariaId), 0);
  assert.equal(e.videos[productoId].corto[0].voz, null);
  const suma = (await movimientos(usuariaId)).reduce((n, m) => n + m.cantidad, 0);
  assert.equal(suma, 0, 'se cobró y se devolvió');
});

test('voz de IA sin la llave de ElevenLabs: avisa, no cobra y ofrece grabar su voz', async () => {
  const { c, usuariaId, videoId } = await videoListo();
  voz.control.lista = false;
  const r = await vozIA(c, videoId, 2);
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'VOZ_NO_DISPONIBLE');
  assert.match(r.json.error.mensaje, /grabar tu propia voz/);
  assert.deepEqual(await movimientos(usuariaId), []);
});

test('voz de IA en planes de pago: sin límite, con créditos de texto, y no frena en cero', async () => {
  const { c, usuariaId, videoId } = await videoListo({ plan: 'esencial' });
  let e = await estado(c);
  assert.deepEqual(e.creditos.vozIA, { costo: 2, bolsa: 'texto', saldo: 100, frena: false, usadasMes: 0, maxMes: null });
  for (let i = 0; i < 5; i++) assert.equal((await vozIA(c, videoId, 2)).estado, 201);
  e = await estado(c);
  assert.equal(e.creditos.total, 90);
  assert.equal(e.creditos.video.total, 80, 'solo el video gastó créditos de video');
  await s.db.query('update usuarias set creditos_plan = 1 where id = $1', [usuariaId]);
  const r = await vozIA(c, videoId, 2);
  assert.equal(r.estado, 201);
  assert.equal(r.json.estado.creditos.total, 0);
});

test('el día 1 vuelven las 3 voces de IA del plan Gratis', async () => {
  s.ponerFecha(new Date('2026-11-25T15:00:00Z'));
  try {
    const { c, usuariaId, videoId } = await videoListo();
    for (let i = 0; i < 3; i++) await vozIA(c, videoId, 2);
    assert.equal(await usadas(usuariaId), 3);
    s.ponerFecha(new Date('2026-12-01T15:00:00Z'));
    const e = await estado(c);
    assert.equal(e.creditos.vozIA.usadasMes, 0);
    assert.equal(e.creditos.vozIA.bolsa, 'texto');
    assert.equal(e.creditos.total, 30);
  } finally {
    s.ponerFecha(null);
  }
});

test('quitar la voz: el video vuelve a quedar sin sonido', async () => {
  const { c, productoId, videoId } = await videoListo();
  await subirGrabacion(c, videoId, audio(1, 'webm'));
  const r = await c.del(`/api/videos/${videoId}/voz`);
  assert.equal(r.estado, 200);
  assert.equal(r.json.estado.videos[productoId].corto[0].voz, null);
});

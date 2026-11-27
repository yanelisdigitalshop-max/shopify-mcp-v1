// Parte 5: Programar. Su calendario: gratis, ilimitado y sin publicar nada en TikTok.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { crearRunwayFalso } from './runway-falso.js';
import { crearFastmossFalso } from './fastmoss-falso.js';
import { revisarVideos } from '../server/servicios/videos.js';
import { PROGRAMAR, horaDeTexto } from '../shared/programar.js';

let s;
let rw;
before(async () => {
  rw = crearRunwayFalso();
  s = await levantar({ ia: crearIaFalsa(), runway: rw, fastmoss: crearFastmossFalso() });
});
after(async () => { await s.cerrar(); });
beforeEach(() => s.ponerFecha(null));

const enHoras = (h, desde = new Date()) => new Date(desde.getTime() + h * 3600 * 1000).toISOString();
const estado = async (c) => (await c.get('/api/estado')).json.estado;

/** Cuenta con un producto y sus 3 guiones creados. */
async function conGuiones() {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores: 340, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  const p = await c.post('/api/productos', { nombre: 'Cepillo alisador', descripcion: 'Alisa sin calor.' });
  const g = await c.post(`/api/productos/${p.json.productoId}/guiones`);
  assert.equal(g.estado, 201);
  return { c, usuariaId, productoId: p.json.productoId, creacionId: g.json.creacion.id };
}

test('programar un guion: queda en su calendario con el texto para publicar, sin gastar créditos', async () => {
  const { c, creacionId, productoId } = await conGuiones();
  const antes = (await estado(c)).creditos;
  assert.deepEqual((await estado(c)).agenda.pendientes, []);

  const para = enHoras(3);
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 2, programadaPara: para });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const [p] = r.json.estado.agenda.pendientes;
  assert.equal(p.tipo, 'guion');
  assert.equal(p.numero, 2);
  assert.equal(p.productoId, productoId);
  assert.equal(p.productoNombre, 'Cepillo alisador');
  assert.equal(p.titulo, 'Así se usa, paso a paso');
  assert.equal(new Date(p.programadaPara).toISOString(), para);
  assert.equal(p.publicadaEn, null);
  assert.equal(p.texto.caption, 'Probé este cepillo y así se ve.');
  assert.ok(p.texto.hashtags.length > 0);
  assert.deepEqual(r.json.estado.creditos, antes, 'programar no toca los créditos');

  const h = r.json.estado.historial[0];
  assert.equal(h.tipo, 'publicacion_programada');
});

test('programar otra vez lo mismo cambia la hora (no lo duplica)', async () => {
  const { c, creacionId } = await conGuiones();
  await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(2) });
  const nueva = enHoras(26);
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: nueva });
  assert.equal(r.estado, 200);
  assert.equal(r.json.estado.agenda.pendientes.length, 1);
  assert.equal(new Date(r.json.estado.agenda.pendientes[0].programadaPara).toISOString(), nueva);

  // Otro guion del mismo juego sí es otra publicación; quedan en orden de hora.
  const r2 = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 3, programadaPara: enHoras(5) });
  assert.deepEqual(r2.json.estado.agenda.pendientes.map((p) => p.numero), [3, 1]);
});

test('la hora: no en el pasado, no a más de 90 días, y con su zona horaria', async () => {
  const { c, creacionId } = await conGuiones();
  const pasada = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(-1) });
  assert.equal(pasada.estado, 400);
  assert.equal(pasada.json.error.codigo, 'HORA_PASADA');
  assert.ok(pasada.json.error.campos.programadaPara);

  const lejana = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(24 * 91) });
  assert.equal(lejana.json.error.codigo, 'HORA_LEJANA');

  // Hace un minuto vale: el reloj del teléfono puede ir un poco atrasado.
  const justo = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(-1 / 60) });
  assert.equal(justo.estado, 201);

  const sinZona = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 2, programadaPara: '2026-12-01T19:30' });
  assert.equal(sinZona.estado, 400);
  const conZona = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 2, programadaPara: enHoras(4).replace('Z', '+00:00') });
  assert.equal(conZona.estado, 201);
});

test('solo lo suyo: ni guiones ni publicaciones de otra cuenta', async () => {
  const a = await conGuiones();
  const b = await conGuiones();
  const ajeno = await b.c.post('/api/publicaciones', { tipo: 'guion', creacionId: a.creacionId, numero: 1, programadaPara: enHoras(2) });
  assert.equal(ajeno.estado, 404);

  const propia = await a.c.post('/api/publicaciones', { tipo: 'guion', creacionId: a.creacionId, numero: 1, programadaPara: enHoras(2) });
  const id = propia.json.estado.agenda.pendientes[0].id;
  assert.equal((await b.c.patch(`/api/publicaciones/${id}`, { publicada: true })).estado, 404);
  assert.equal((await b.c.del(`/api/publicaciones/${id}`)).estado, 404);
  assert.equal((await estado(a.c)).agenda.pendientes.length, 1);

  // Un número de guion que no existe, o datos de más.
  assert.equal((await a.c.post('/api/publicaciones', { tipo: 'guion', creacionId: a.creacionId, numero: 4, programadaPara: enHoras(2) })).estado, 400);
  assert.equal((await a.c.post('/api/publicaciones', { tipo: 'guion', creacionId: a.creacionId, numero: 1, programadaPara: enHoras(2), plataforma: 'tiktok' })).estado, 400);
  // Sin sesión no hay calendario.
  const sinSesion = s.cliente();
  assert.equal((await sinSesion.post('/api/publicaciones', { tipo: 'guion', creacionId: a.creacionId, numero: 1, programadaPara: enHoras(2) })).estado, 401);
});

test('marcar como publicada, deshacerlo, cambiar la hora y quitarla', async () => {
  const { c, creacionId } = await conGuiones();
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(1) });
  const id = r.json.estado.agenda.pendientes[0].id;

  const nueva = enHoras(30);
  const cambio = await c.patch(`/api/publicaciones/${id}`, { programadaPara: nueva });
  assert.equal(cambio.estado, 200);
  assert.equal(new Date(cambio.json.estado.agenda.pendientes[0].programadaPara).toISOString(), nueva);
  assert.equal((await c.patch(`/api/publicaciones/${id}`, { programadaPara: enHoras(-3) })).json.error.codigo, 'HORA_PASADA');
  assert.equal((await c.patch(`/api/publicaciones/${id}`, {})).estado, 400);

  const hecha = await c.patch(`/api/publicaciones/${id}`, { publicada: true });
  assert.deepEqual(hecha.json.estado.agenda.pendientes, []);
  assert.equal(hecha.json.estado.agenda.publicadas.length, 1);
  assert.ok(hecha.json.estado.agenda.publicadas[0].publicadaEn);
  assert.equal(hecha.json.estado.historial[0].tipo, 'publicacion_hecha');
  // Una publicada ya no cambia de hora.
  assert.equal((await c.patch(`/api/publicaciones/${id}`, { programadaPara: enHoras(5) })).json.error.codigo, 'YA_PUBLICADA');

  // Ya publicada, se puede volver a programar lo mismo (otra publicación).
  const otra = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(48) });
  assert.equal(otra.estado, 201);
  // Y entonces no se puede deshacer la primera: ya hay una pendiente para ese guion.
  assert.equal((await c.patch(`/api/publicaciones/${id}`, { publicada: false })).json.error.codigo, 'YA_PROGRAMADA');
  await c.del(`/api/publicaciones/${otra.json.publicacion.id}`);
  const deshecha = await c.patch(`/api/publicaciones/${id}`, { publicada: false });
  assert.equal(deshecha.json.estado.agenda.pendientes.length, 1);
  assert.equal(deshecha.json.estado.agenda.publicadas.length, 0);

  const quitada = await c.del(`/api/publicaciones/${id}`);
  assert.equal(quitada.estado, 200);
  assert.deepEqual(quitada.json.estado.agenda.pendientes, []);
  assert.equal((await c.del(`/api/publicaciones/${id}`)).estado, 404);
});

test('las publicadas se muestran 7 días; un producto borrado saca lo suyo del calendario', async () => {
  const { c, creacionId, productoId } = await conGuiones();
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(1) });
  await c.patch(`/api/publicaciones/${r.json.publicacion.id}`, { publicada: true });
  await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 2, programadaPara: enHoras(2) });

  s.ponerFecha(new Date(Date.now() + 8 * 24 * 3600 * 1000));
  let e = await estado(c);
  assert.equal(e.agenda.publicadas.length, 0, 'pasada una semana ya no sale');
  assert.equal(e.agenda.pendientes.length, 1, 'la pendiente sigue aunque ya pasó su hora');
  s.ponerFecha(null);

  await c.del(`/api/productos/${productoId}`);
  e = await estado(c);
  assert.deepEqual(e.agenda.pendientes, []);
});

test('programar un video listo; uno que todavía se está creando, no', async () => {
  const c = s.cliente();
  await c.post('/api/cuenta/registro', cuentaNueva());
  await c.patch('/api/perfil', { nicho: 'Cabello', seguidores: 10, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  const b = (await c.post('/api/buscador', { consulta: 'hair brush' })).json.busqueda;
  const productoId = (await c.post(`/api/buscador/${b.id}/guardar`, { indice: 0 })).json.productoId;
  const v = await c.post(`/api/productos/${productoId}/videos`, { tipo: 'corto', indice: 1, costoAceptado: 0 });
  assert.equal(v.estado, 201, JSON.stringify(v.json));
  const videoId = v.json.video.id;

  const temprano = await c.post('/api/publicaciones', { tipo: 'video', videoId, programadaPara: enHoras(2) });
  assert.equal(temprano.json.error.codigo, 'VIDEO_NO_LISTO');

  rw.terminar([...rw.tareas.keys()].at(-1), 'listo');
  await revisarVideos({ db: s.db, runway: rw });
  const r = await c.post('/api/publicaciones', { tipo: 'video', videoId, programadaPara: enHoras(2) });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const [p] = r.json.estado.agenda.pendientes;
  assert.equal(p.tipo, 'video');
  assert.equal(p.videoId, videoId);
  assert.equal(p.texto, null);
  assert.ok(p.titulo);
});

test(`tope de seguridad: ${PROGRAMAR.maxPendientes} pendientes a la vez (no es límite de plan)`, async () => {
  const { c, usuariaId, creacionId } = await conGuiones();
  // Se llena el calendario directo en la base, con guiones de otras creaciones de mentira.
  const { rows } = await s.db.query('select producto_id, contenido from creaciones where id = $1', [creacionId]);
  for (let i = 0; i < PROGRAMAR.maxPendientes; i += 1) {
    const id = crypto.randomUUID();
    await s.db.query("insert into creaciones (id, usuaria_id, producto_id, tipo, contenido) values ($1, $2, $3, 'guiones', $4)", [id, usuariaId, rows[0].producto_id, rows[0].contenido]);
    await s.db.query(
      "insert into publicaciones (id, usuaria_id, producto_id, tipo, creacion_id, numero, titulo, programada_para) values ($1, $2, $3, 'guion', $4, 1, 'x', now() + interval '1 day')",
      [crypto.randomUUID(), usuariaId, rows[0].producto_id, id],
    );
  }
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId, numero: 1, programadaPara: enHoras(2) });
  assert.equal(r.estado, 409);
  assert.equal(r.json.error.codigo, 'DEMASIADAS_PROGRAMADAS');
});

test('horaDeTexto: lee la hora sugerida por la IA', () => {
  assert.deepEqual(horaDeTexto('7:30 p. m.'), { hora: 19, minuto: 30 });
  assert.deepEqual(horaDeTexto('8 pm'), { hora: 20, minuto: 0 });
  assert.deepEqual(horaDeTexto('9:00 a. m.'), { hora: 9, minuto: 0 });
  assert.deepEqual(horaDeTexto('12:00 p. m.'), { hora: 12, minuto: 0 });
  assert.deepEqual(horaDeTexto('12 a. m.'), { hora: 0, minuto: 0 });
  assert.deepEqual(horaDeTexto('Entre 7 y 9 de la noche'), { hora: 19, minuto: 0 });
  assert.deepEqual(horaDeTexto('Al mediodía, 12:15'), { hora: 12, minuto: 15 });
  assert.deepEqual(horaDeTexto('10 de la mañana'), { hora: 10, minuto: 0 });
  assert.deepEqual(horaDeTexto('19:45'), { hora: 19, minuto: 45 });
  assert.deepEqual(horaDeTexto('A las 4'), { hora: 16, minuto: 0 });
  assert.equal(horaDeTexto('En la noche'), null);
  assert.equal(horaDeTexto(null), null);
});

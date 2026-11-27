// Parte 8: avisos del teléfono «Te toca publicar» (Firebase de mentira).
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { revisarAvisos } from '../server/servicios/avisos.js';
import { ErrorFcm, crearFcm, firmarJwt, leerCuentaServicio } from '../server/fuentes/fcm.js';

let s;
const enviados = [];
const control = { invalidos: new Set() };
const fcm = {
  lista: () => true,
  async enviar(m) {
    if (control.invalidos.has(m.token)) throw new ErrorFcm('FCM_FALLO', 'x', { tokenInvalido: true });
    enviados.push(m);
  },
};
before(async () => { s = await levantar({ ia: crearIaFalsa(), fcm }); });
after(async () => { await s.cerrar(); });
beforeEach(() => { enviados.length = 0; control.invalidos.clear(); });

const TOKEN = (n) => `token-de-prueba-del-telefono-${n}-${'x'.repeat(30)}`;
const enHoras = (h) => new Date(Date.now() + h * 3600e3).toISOString();

async function conGuionProgramado(horas = -0.01) {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cabello', seguidores: 10, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  const p = await c.post('/api/productos', { nombre: 'Cepillo alisador' });
  const g = await c.post(`/api/productos/${p.json.productoId}/guiones`);
  const r = await c.post('/api/publicaciones', { tipo: 'guion', creacionId: g.json.creacion.id, numero: 1, programadaPara: enHoras(horas) });
  return { c, usuariaId, publicacionId: r.json.publicacion.id };
}

test('registrar el teléfono: solo con sesión, token y plataforma válidos; otra cuenta en el mismo teléfono se lo queda', async () => {
  assert.equal((await s.cliente().post('/api/dispositivos', { token: TOKEN(1), plataforma: 'ios' })).estado, 401);
  const a = await conGuionProgramado(2);
  assert.equal((await a.c.post('/api/dispositivos', { token: 'corto', plataforma: 'ios' })).estado, 400);
  assert.equal((await a.c.post('/api/dispositivos', { token: TOKEN(1), plataforma: 'windows' })).estado, 400);
  assert.equal((await a.c.post('/api/dispositivos', { token: TOKEN(1), plataforma: 'ios' })).estado, 201);
  assert.equal((await a.c.post('/api/dispositivos', { token: TOKEN(1), plataforma: 'ios' })).estado, 201, 'repetir no falla');

  const b = await conGuionProgramado(2);
  await b.c.post('/api/dispositivos', { token: TOKEN(1), plataforma: 'ios' });
  const fila = (await s.db.query('select usuaria_id from dispositivos where token = $1', [TOKEN(1)])).rows;
  assert.deepEqual(fila, [{ usuaria_id: b.usuariaId }]);
});

test('te toca publicar: un aviso por publicación, en todos sus teléfonos; no se repite', async () => {
  const { c, publicacionId } = await conGuionProgramado();
  await c.post('/api/dispositivos', { token: TOKEN(2), plataforma: 'ios' });
  await c.post('/api/dispositivos', { token: TOKEN(3), plataforma: 'android' });

  assert.equal(await revisarAvisos({ db: s.db, fcm }), 2);
  assert.deepEqual(enviados.map((m) => m.token).sort(), [TOKEN(2), TOKEN(3)]);
  assert.equal(enviados[0].titulo, 'Te toca publicar');
  assert.match(enviados[0].cuerpo, /Tu guion «Así se usa, paso a paso» de Cepillo alisador/);
  assert.deepEqual(enviados[0].datos, { ruta: 'hoy', publicacionId });

  enviados.length = 0;
  assert.equal(await revisarAvisos({ db: s.db, fcm }), 0, 'no se repite');
});

test('avisos: no antes de la hora, no las ya publicadas ni las muy viejas; cambiar la hora avisa otra vez', async () => {
  const futura = await conGuionProgramado(3);
  await futura.c.post('/api/dispositivos', { token: TOKEN(4), plataforma: 'ios' });
  assert.equal(await revisarAvisos({ db: s.db, fcm }), 0, 'todavía no es la hora');

  // Llega la hora (reloj adelantado): avisa. Luego cambia la hora y vuelve a avisar en la nueva.
  const en3h = () => new Date(Date.now() + 3.1 * 3600e3);
  const deEsta = () => enviados.filter((m) => m.token === TOKEN(4)).length;
  await revisarAvisos({ db: s.db, fcm, reloj: en3h });
  assert.equal(deEsta(), 1);
  await revisarAvisos({ db: s.db, fcm, reloj: en3h });
  assert.equal(deEsta(), 1, 'no se repite');
  await futura.c.patch(`/api/publicaciones/${futura.publicacionId}`, { programadaPara: enHoras(5) });
  await revisarAvisos({ db: s.db, fcm, reloj: () => new Date(Date.now() + 5.1 * 3600e3) });
  assert.equal(deEsta(), 2, 'con la hora nueva se avisa otra vez');

  const publicada = await conGuionProgramado();
  await publicada.c.post('/api/dispositivos', { token: TOKEN(5), plataforma: 'ios' });
  await publicada.c.patch(`/api/publicaciones/${publicada.publicacionId}`, { publicada: true });
  enviados.length = 0;
  await revisarAvisos({ db: s.db, fcm });
  assert.ok(!enviados.some((m) => m.token === TOKEN(5)), 'ya publicada: no se avisa');

  const vieja = await conGuionProgramado(1);
  await vieja.c.post('/api/dispositivos', { token: TOKEN(6), plataforma: 'ios' });
  await revisarAvisos({ db: s.db, fcm, reloj: () => new Date(Date.now() + 8 * 3600e3) });
  assert.ok(!enviados.some((m) => m.token === TOKEN(6)), 'más de 6 horas tarde: no se avisa (lo ve en Hoy)');
});

test('un token que ya no sirve se borra; al cerrar sesión el teléfono deja de recibir', async () => {
  const { c, usuariaId } = await conGuionProgramado();
  await c.post('/api/dispositivos', { token: TOKEN(7), plataforma: 'android' });
  await c.post('/api/dispositivos', { token: TOKEN(8), plataforma: 'ios' });
  control.invalidos.add(TOKEN(7));
  await revisarAvisos({ db: s.db, fcm });
  const quedan = (await s.db.query('select token from dispositivos where usuaria_id = $1', [usuariaId])).rows.map((r) => r.token);
  assert.deepEqual(quedan, [TOKEN(8)]);

  assert.equal((await c.post('/api/dispositivos/quitar', { token: TOKEN(8) })).estado, 200);
  assert.equal((await s.db.query('select count(*)::int as n from dispositivos where usuaria_id = $1', [usuariaId])).rows[0].n, 0);
});

test('Firebase: el JWT va firmado con la cuenta de servicio; sin credenciales no se envía nada', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const cuenta = { client_email: 'avisos@vendiva-prueba.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), project_id: 'vendiva-prueba' };
  const jwt = firmarJwt(cuenta, 1000);
  const [h, d, f] = jwt.split('.');
  assert.ok(crypto.createVerify('RSA-SHA256').update(`${h}.${d}`).verify(publicKey, Buffer.from(f, 'base64url')));
  assert.deepEqual(JSON.parse(Buffer.from(d, 'base64url')), {
    iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: 1000, exp: 4600,
  });

  // La cuenta en base64 también vale; una mal escrita, no.
  const env = { VENDIVA_FIREBASE_CUENTA_SERVICIO: Buffer.from(JSON.stringify(cuenta)).toString('base64') };
  assert.equal(leerCuentaServicio(env).project_id, 'vendiva-prueba');
  assert.equal(leerCuentaServicio({ VENDIVA_FIREBASE_CUENTA_SERVICIO: '{malo' }), null);

  // Envío completo contra un Google de mentira: pide el acceso una vez y lo reutiliza.
  const llamadas = [];
  const real = crearFcm({
    env,
    pedir: async (url, o) => {
      llamadas.push({ url, o });
      if (url.includes('oauth2')) return new Response(JSON.stringify({ access_token: 'ya29.prueba', expires_in: 3600 }), { status: 200 });
      if (o.body.includes(TOKEN(9))) return new Response(JSON.stringify({ error: { status: 'UNREGISTERED' } }), { status: 404 });
      return new Response('{}', { status: 200 });
    },
  });
  await real.enviar({ token: TOKEN(10), titulo: 'Te toca publicar', cuerpo: 'x', datos: { ruta: 'hoy' } });
  await real.enviar({ token: TOKEN(11), titulo: 'Te toca publicar', cuerpo: 'x' });
  assert.equal(llamadas.filter((l) => l.url.includes('oauth2')).length, 1);
  const envio = llamadas.find((l) => l.url.includes('fcm.googleapis.com'));
  assert.equal(envio.url, 'https://fcm.googleapis.com/v1/projects/vendiva-prueba/messages:send');
  assert.equal(envio.o.headers.Authorization, 'Bearer ya29.prueba');
  await assert.rejects(real.enviar({ token: TOKEN(9), titulo: 'a', cuerpo: 'b' }), (e) => e.tokenInvalido === true);

  assert.equal(crearFcm({ env: {} }).lista(), false);
});

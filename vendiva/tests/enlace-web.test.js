// Parte 8, pagos opción (b): la app abre los Planes en el navegador con un enlace de un solo uso.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

async function cuenta() {
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
  return { c, usuariaId };
}
const tokenDe = (url) => new URL(url).searchParams.get('acceso');

test('enlace de acceso: abre la sesión en otro navegador, una sola vez, y lleva a Planes', async () => {
  const { c, usuariaId } = await cuenta();
  assert.equal((await s.cliente().post('/api/cuenta/enlace-web', { destino: 'planes' })).estado, 401, 'pide sesión');
  assert.equal((await c.post('/api/cuenta/enlace-web', { destino: 'otra' })).estado, 400);

  const r = await c.post('/api/cuenta/enlace-web', { destino: 'planes' });
  assert.equal(r.estado, 200);
  assert.match(r.json.url, /^http:\/\/127\.0\.0\.1:\d+\/\?acceso=[\w-]{40,}#planes$/);
  const token = tokenDe(r.json.url);
  const guardado = (await s.db.query('select token_hash from enlaces_acceso where usuaria_id = $1', [usuariaId])).rows[0].token_hash;
  assert.notEqual(guardado, token, 'en la base solo queda la huella');

  // El navegador del teléfono (sin sesión) lo cambia por una sesión suya.
  const navegador = s.cliente();
  const e = await navegador.post('/api/cuenta/acceso', { token });
  assert.equal(e.estado, 200, JSON.stringify(e.json));
  assert.equal(e.json.estado.usuaria.id, usuariaId);
  assert.equal((await navegador.get('/api/estado')).json.estado.usuaria.id, usuariaId);

  // Una segunda vez no sirve.
  const otra = await s.cliente().post('/api/cuenta/acceso', { token });
  assert.equal(otra.estado, 401);
  assert.equal(otra.json.error.codigo, 'ENLACE_VENCIDO');
});

test('enlace de acceso: vence a los 10 minutos y uno inventado no sirve', async () => {
  const { c } = await cuenta();
  const token = tokenDe((await c.post('/api/cuenta/enlace-web', { destino: 'planes' })).json.url);
  s.ponerFecha(new Date(Date.now() + 11 * 60000));
  assert.equal((await s.cliente().post('/api/cuenta/acceso', { token })).json.error.codigo, 'ENLACE_VENCIDO');
  s.ponerFecha(null);
  assert.equal((await s.cliente().post('/api/cuenta/acceso', { token: 'x'.repeat(43) })).estado, 401);
  assert.equal((await s.cliente().post('/api/cuenta/acceso', { token: 'corto' })).estado, 400);
});

test('enlace de acceso: si el navegador tenía otra cuenta abierta, queda la del enlace', async () => {
  const a = await cuenta();
  const b = await cuenta();
  const token = tokenDe((await a.c.post('/api/cuenta/enlace-web', { destino: 'planes' })).json.url);
  const e = await b.c.post('/api/cuenta/acceso', { token });
  assert.equal(e.json.estado.usuaria.id, a.usuariaId);
  assert.equal((await b.c.get('/api/estado')).json.estado.usuaria.id, a.usuariaId);
});

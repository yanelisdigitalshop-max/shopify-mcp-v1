// Parte 8: la cuenta para los revisores de las tiendas.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar } from './ayuda.js';
import { prepararCuentaRevisores } from '../server/scripts/cuenta-revisores.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

test('cuenta de revisores: plan Pro sin cobro, registro completo y productos de ejemplo; se puede repetir', async () => {
  await assert.rejects(prepararCuentaRevisores(s.db, { correo: 'revision@vendiva.app', contrasena: 'corta', config: s.config }), /al menos 12/);
  await prepararCuentaRevisores(s.db, { correo: 'revision@vendiva.app', contrasena: 'clave-de-revision-1', config: s.config });
  await prepararCuentaRevisores(s.db, { correo: 'revision@vendiva.app', contrasena: 'clave-de-revision-2', config: s.config });

  const c = s.cliente();
  assert.equal((await c.post('/api/cuenta/entrar', { correo: 'revision@vendiva.app', contrasena: 'clave-de-revision-1' })).estado, 401, 'vale la última contraseña');
  const r = await c.post('/api/cuenta/entrar', { correo: 'revision@vendiva.app', contrasena: 'clave-de-revision-2' });
  assert.equal(r.estado, 200);
  const e = r.json.estado;
  assert.equal(e.plan.id, 'pro');
  assert.equal(e.creditos.total, 1000);
  assert.equal(e.creditos.video.total, 1000);
  assert.equal(e.perfil.onboardingCompleto, true);
  assert.equal(e.productos.length, 2, 'no se duplican al repetir');
  assert.ok(e.productos.every((p) => p.nombre.includes('(ejemplo)')));
  assert.equal(e.vitrina.disponible, true);
  assert.equal(e.pagos.suscripcion, null, 'sin suscripción: no hay cobro');
});

// Parte 8: borrar la cuenta. Se cancela la suscripción y se borra todo lo suyo.
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa } from './ia-falsa.js';
import { crearStripeFalso, enviarAvisos } from './stripe-falso.js';

let s;
let st;
before(async () => {
  st = crearStripeFalso();
  s = await levantar({ stripe: st, ia: crearIaFalsa() });
});
after(async () => { await s.cerrar(); });
beforeEach(() => Object.assign(st.control, { lista: true, fallarCancelacion: false }));

async function cuenta() {
  const datos = cuentaNueva();
  const c = s.cliente();
  const usuariaId = (await c.post('/api/cuenta/registro', datos)).json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cabello', seguidores: 10, modoGrabacion: 'sin_camara', objetivo: 'vender_mas', onboardingCompleto: true });
  return { c, usuariaId, datos };
}
const cuantas = async (tabla, usuariaId) => (await s.db.query(`select count(*)::int as n from ${tabla} where usuaria_id = $1`, [usuariaId])).rows[0].n;

test('borrar la cuenta: pide la contraseña, borra todo lo suyo y cierra la sesión', async () => {
  const { c, usuariaId, datos } = await cuenta();
  const p = await c.post('/api/productos', { nombre: 'Cepillo', descripcion: 'Alisa sin calor.' });
  await c.post(`/api/productos/${p.json.productoId}/guiones`);
  assert.ok((await cuantas('creaciones', usuariaId)) > 0);

  const mal = await c.post('/api/cuenta/borrar', { contrasena: 'otra-clave' });
  assert.equal(mal.estado, 401);
  assert.equal(mal.json.error.codigo, 'CONTRASENA_INCORRECTA');
  assert.equal((await c.get('/api/estado')).estado, 200, 'nada cambió');

  const r = await c.post('/api/cuenta/borrar', { contrasena: datos.contrasena });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal((await c.get('/api/estado')).estado, 401, 'la sesión se cerró');
  for (const tabla of ['perfiles', 'productos', 'creaciones', 'movimientos_creditos', 'historial', 'sesiones']) {
    assert.equal(await cuantas(tabla, usuariaId), 0, tabla);
  }
  assert.equal((await s.db.query('select count(*)::int as n from usuarias where id = $1', [usuariaId])).rows[0].n, 0);
  // Ya no puede entrar; el correo queda libre.
  assert.equal((await s.cliente().post('/api/cuenta/entrar', { correo: datos.correo, contrasena: datos.contrasena })).estado, 401);
  assert.equal((await s.cliente().post('/api/cuenta/registro', datos)).estado, 201);
});

test('borrar con un plan de pago: se cancela YA en Stripe y se borra el cliente', async () => {
  const { c, usuariaId, datos } = await cuenta();
  const r = await c.post('/api/pagos/plan', { plan: 'pro', aceptaTerminos: true });
  await enviarAvisos(s.base, st.pagarPlan(r.json.url.split('/').at(-1)));
  const { suscripcion_id: subId, stripe_cliente_id: clienteId } = (await s.db.query('select suscripcion_id, stripe_cliente_id from usuarias where id = $1', [usuariaId])).rows[0];

  const b = await c.post('/api/cuenta/borrar', { contrasena: datos.contrasena });
  assert.equal(b.estado, 200);
  const tipos = st.llamadas.slice(-2);
  assert.deepEqual(tipos, [{ tipo: 'cancelar_ahora', subId }, { tipo: 'borrar_cliente', clienteId }]);
  assert.equal(st.subs.get(subId).estado, 'canceled');
  assert.equal(await cuantas('pagos', usuariaId), 0);

  // El aviso de Stripe que llega después no encuentra a nadie y no rompe nada.
  const avisos = await enviarAvisos(s.base, st.rendirse(subId));
  assert.equal(avisos[0].estado, 200);
});

test('si Stripe no puede cancelar el plan, la cuenta NO se borra', async () => {
  const { c, usuariaId, datos } = await cuenta();
  const r = await c.post('/api/pagos/plan', { plan: 'esencial', aceptaTerminos: true });
  await enviarAvisos(s.base, st.pagarPlan(r.json.url.split('/').at(-1)));

  st.control.fallarCancelacion = true;
  const b = await c.post('/api/cuenta/borrar', { contrasena: datos.contrasena });
  assert.equal(b.estado, 503);
  assert.equal(b.json.error.codigo, 'NO_SE_CANCELO');
  assert.equal(b.json.error.reintentable, true);
  const e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.usuaria.id, usuariaId);
  assert.equal(e.plan.id, 'esencial');
});

test('borrar la cuenta pide sesión y la cabecera de Vendiva', async () => {
  assert.equal((await s.cliente().post('/api/cuenta/borrar', { contrasena: 'x' })).estado, 401);
  const { c, datos } = await cuenta();
  assert.equal((await c.post('/api/cuenta/borrar', { contrasena: datos.contrasena }, { sinCabeceraVendiva: true })).estado, 403);
});

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

async function conCuenta() {
  const c = s.cliente();
  const datos = cuentaNueva();
  const alta = await c.post('/api/cuenta/registro', datos);
  return { c, datos, estado: alta.json.estado };
}

test('el registro guarda paso a paso y se puede retomar', async () => {
  const { c, datos, estado } = await conCuenta();
  assert.equal(estado.perfil.onboardingPaso, 2);
  assert.equal(estado.perfil.onboardingCompleto, false);

  let r = await c.patch('/api/perfil', { nicho: 'Belleza y cuidado de la piel', seguidores: 340, onboardingPaso: 3 });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal(r.json.estado.perfil.onboardingPaso, 3);

  // Cierra la app a la mitad y vuelve otro día: sigue donde iba.
  await c.post('/api/cuenta/salir');
  r = await c.post('/api/cuenta/entrar', { correo: datos.correo, contrasena: datos.contrasena });
  assert.equal(r.json.estado.perfil.onboardingPaso, 3);
  assert.equal(r.json.estado.perfil.nicho, 'Belleza y cuidado de la piel');
  assert.equal(r.json.estado.perfil.seguidores, 340);
  assert.equal(r.json.estado.perfil.onboardingCompleto, false);

  await c.patch('/api/perfil', { modoGrabacion: 'sin_camara', onboardingPaso: 4 });
  await c.patch('/api/perfil', { objetivo: 'primeros_1000', onboardingPaso: 5 });
  r = await c.patch('/api/perfil', { usuarioTiktok: '@maria.vende', redes: ['instagram', 'tiktok', 'tiktok'], onboardingCompleto: true });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  const p = r.json.estado.perfil;
  assert.equal(p.onboardingCompleto, true);
  assert.equal(p.modoGrabacion, 'sin_camara');
  assert.equal(p.objetivo, 'primeros_1000');
  assert.equal(p.usuarioTiktok, 'maria.vende', 'se guarda sin @');
  assert.deepEqual(p.redes, ['tiktok', 'instagram'], 'sin repetidos');
});

test('no se puede dar por terminado el registro si faltan datos del negocio', async () => {
  const { c } = await conCuenta();
  const r = await c.patch('/api/perfil', { onboardingCompleto: true });
  assert.equal(r.estado, 400);
  assert.equal(r.json.error.codigo, 'REGISTRO_INCOMPLETO');
  assert.equal((await c.get('/api/estado')).json.estado.perfil.onboardingCompleto, false);
});

test('el nivel cambia según los seguidores que ella escribe', async () => {
  const { c } = await conCuenta();
  const casos = [
    [0, 1, 'Desde cero'], [1, 2, 'Arranque'], [99, 2, 'Arranque'], [100, 3, 'Impulso'], [499, 3, 'Impulso'],
    [500, 4, 'Recta final'], [999, 4, 'Recta final'], [1000, 5, 'Afiliada en el programa piloto'],
    [4999, 5, 'Afiliada en el programa piloto'], [5000, 6, 'Afiliada libre'], [9999, 6, 'Afiliada libre'],
    [10000, 7, 'Creadora en subida'], [49999, 7, 'Creadora en subida'], [50000, 8, 'Creadora destacada'],
    [99999, 8, 'Creadora destacada'], [100000, 9, 'Creadora estrella'], [3200000, 9, 'Creadora estrella'],
  ];
  for (const [seguidores, numero, nombre] of casos) {
    const r = await c.patch('/api/perfil', { seguidores });
    assert.equal(r.estado, 200, `${seguidores}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.estado.nivel.numero, numero, `${seguidores} seguidores`);
    assert.equal(r.json.estado.nivel.nombre, nombre);
  }
  const techo = (await c.get('/api/estado')).json.estado.nivel;
  assert.equal(techo.siguiente, null, 'Creadora estrella no tiene techo');

  const r = await c.patch('/api/perfil', { seguidores: 940 });
  assert.equal(r.json.estado.nivel.siguiente.nombre, 'Afiliada en el programa piloto');
  assert.equal(r.json.estado.nivel.siguiente.faltan, 60);

  const cambios = r.json.estado.historial.filter((h) => h.tipo === 'seguidores_actualizados');
  assert.ok(cambios.length >= 1, 'cada cambio de seguidores queda en el historial');
  assert.equal(cambios[0].detalle.ahora, 940);
});

test('seguidores y otros datos inválidos se rechazan sin guardar nada', async () => {
  const { c } = await conCuenta();
  await c.patch('/api/perfil', { seguidores: 120 });
  for (const malo of [-1, 12.5, '300', null, 3_000_000_000]) {
    const r = await c.patch('/api/perfil', { seguidores: malo });
    assert.equal(r.estado, 400, `seguidores=${malo}`);
  }
  assert.equal((await c.patch('/api/perfil', { modoGrabacion: 'avatar' })).estado, 400, 'no existe modo avatar');
  assert.equal((await c.patch('/api/perfil', { objetivo: 'hacerme_rica' })).estado, 400);
  assert.equal((await c.patch('/api/perfil', { redes: ['tiktok', 'snapchat'] })).estado, 400);
  assert.equal((await c.patch('/api/perfil', { usuarioTiktok: 'con espacios' })).estado, 400);
  assert.equal((await c.patch('/api/perfil', { plan: 'pro' })).estado, 400, 'el plan no se cambia desde el perfil');
  assert.equal((await c.patch('/api/perfil', { creditos: 9999 })).estado, 400);

  const e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.perfil.seguidores, 120);
  assert.equal(e.plan.id, 'gratis');
  assert.equal(e.creditos.total, 30);
});

test('puede corregir su nombre, su teléfono y dejar vacío su usuario de TikTok', async () => {
  const { c } = await conCuenta();
  let r = await c.patch('/api/perfil', { nombre: 'María E. Pérez', telefono: '786 555 0199', usuarioTiktok: 'maria' });
  assert.equal(r.json.estado.usuaria.nombre, 'María E. Pérez');
  assert.equal(r.json.estado.usuaria.telefono, '786 555 0199');
  r = await c.patch('/api/perfil', { usuarioTiktok: '' });
  assert.equal(r.json.estado.perfil.usuarioTiktok, null);
});

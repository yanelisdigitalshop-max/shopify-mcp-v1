import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

test('crear cuenta, salir y volver a entrar', async () => {
  const c = s.cliente();
  const datos = cuentaNueva({ correo: `  Maria.Lopez.${Date.now()}@Ejemplo.COM ` });

  const alta = await c.post('/api/cuenta/registro', datos);
  assert.equal(alta.estado, 201, JSON.stringify(alta.json));
  assert.equal(alta.json.estado.usuaria.nombre, 'María Elena Pérez');
  assert.equal(alta.json.estado.usuaria.correo, datos.correo.trim().toLowerCase());
  assert.equal(alta.json.estado.plan.id, 'gratis', 'toda cuenta nueva empieza en Gratis');
  assert.equal(alta.json.estado.limites.productosMax, 6);
  assert.deepEqual(alta.json.estado.productos, [], 'la app empieza vacía');
  assert.equal(alta.json.estado.nivel.nombre, 'Desde cero');

  assert.equal((await c.get('/api/estado')).estado, 200, 'queda con la sesión abierta');

  assert.equal((await c.post('/api/cuenta/salir')).estado, 200);
  assert.equal((await c.get('/api/estado')).estado, 401, 'después de salir ya no entra');

  const entrada = await c.post('/api/cuenta/entrar', { correo: datos.correo, contrasena: datos.contrasena });
  assert.equal(entrada.estado, 200, JSON.stringify(entrada.json));
  assert.equal(entrada.json.estado.usuaria.id, alta.json.estado.usuaria.id);
  assert.equal((await c.get('/api/estado')).estado, 200);
});

test('la contraseña se guarda con hash, nunca en texto plano', async () => {
  const c = s.cliente();
  const datos = cuentaNueva({ contrasena: 'girasol-amarillo-77' });
  const alta = await c.post('/api/cuenta/registro', datos);
  const { rows } = await s.db.query('select contrasena_hash from usuarias where correo = $1', [datos.correo]);
  assert.match(rows[0].contrasena_hash, /^scrypt\$/);
  assert.ok(!rows[0].contrasena_hash.includes('girasol'));
  assert.ok(!JSON.stringify(alta.json).includes('girasol'), 'la respuesta no devuelve la contraseña');
  assert.ok(!JSON.stringify(alta.json).includes('scrypt$'), 'la respuesta no devuelve el hash');

  const otra = cuentaNueva({ contrasena: 'girasol-amarillo-77' });
  await s.cliente().post('/api/cuenta/registro', otra);
  const dos = await s.db.query('select contrasena_hash from usuarias where correo = $1', [otra.correo]);
  assert.notEqual(dos.rows[0].contrasena_hash, rows[0].contrasena_hash, 'cada cuenta tiene su propia sal');
});

test('la cookie de sesión es segura y la base solo guarda su huella', async () => {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const cookie = alta.cookies.find((x) => x.startsWith('vendiva_sesion='));
  assert.ok(cookie, 'pone la cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);
  const token = cookie.split(';')[0].split('=')[1];
  const { rows } = await s.db.query('select token_hash from sesiones where usuaria_id = $1', [alta.json.estado.usuaria.id]);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, token);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

test('contraseña equivocada y correo desconocido dan el mismo aviso', async () => {
  const datos = cuentaNueva();
  await s.cliente().post('/api/cuenta/registro', datos);
  const c = s.cliente();
  const mala = await c.post('/api/cuenta/entrar', { correo: datos.correo, contrasena: 'otra-clave-999' });
  const nadie = await c.post('/api/cuenta/entrar', { correo: 'nadie@ejemplo.com', contrasena: 'otra-clave-999' });
  assert.equal(mala.estado, 401);
  assert.equal(nadie.estado, 401);
  assert.equal(mala.json.error.mensaje, nadie.json.error.mensaje);
  assert.equal((await c.get('/api/estado')).estado, 401);
});

test('no se puede crear dos cuentas con el mismo correo', async () => {
  const datos = cuentaNueva();
  assert.equal((await s.cliente().post('/api/cuenta/registro', datos)).estado, 201);
  const repetida = await s.cliente().post('/api/cuenta/registro', { ...datos, correo: datos.correo.toUpperCase() });
  assert.equal(repetida.estado, 409);
  assert.equal(repetida.json.error.codigo, 'CORREO_EN_USO');

  const mismo = cuentaNueva();
  const [a, b] = await Promise.all([
    s.cliente().post('/api/cuenta/registro', mismo),
    s.cliente().post('/api/cuenta/registro', mismo),
  ]);
  assert.deepEqual([a.estado, b.estado].sort(), [201, 409], 'dos registros a la vez: solo entra uno');
});

test('el registro explica qué dato está mal', async () => {
  const c = s.cliente();
  const r = await c.post('/api/cuenta/registro', { nombre: 'A', correo: 'sin-arroba', telefono: '12', contrasena: 'corta' });
  assert.equal(r.estado, 400);
  assert.deepEqual(Object.keys(r.json.error.campos).sort(), ['contrasena', 'correo', 'nombre', 'telefono']);
  assert.match(r.json.error.campos.contrasena, /al menos 8/);

  for (const telefono of ['3055550100', '(305) 555-0100', '+1 305 555 0100', '305-555-0100']) {
    const ok = await s.cliente().post('/api/cuenta/registro', cuentaNueva({ telefono }));
    assert.equal(ok.estado, 201, `teléfono ${telefono}`);
  }
});

test('sin sesión no se ve ni se cambia nada', async () => {
  const c = s.cliente();
  assert.equal((await c.get('/api/estado')).estado, 401);
  assert.equal((await c.patch('/api/perfil', { nicho: 'Mascotas' })).estado, 401);
  assert.equal((await c.post('/api/productos', { nombre: 'Cepillo' })).estado, 401);
});

test('una sesión vencida ya no sirve', async () => {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  await s.db.query("update sesiones set expira_en = now() - interval '1 minute' where usuaria_id = $1", [alta.json.estado.usuaria.id]);
  assert.equal((await c.get('/api/estado')).estado, 401);
});

test('las peticiones forjadas desde otra página se rechazan', async () => {
  const c = s.cliente();
  await c.post('/api/cuenta/registro', cuentaNueva());

  const sinCabecera = await c.post('/api/productos', { nombre: 'Cepillo' }, { sinCabeceraVendiva: true });
  assert.equal(sinCabecera.estado, 403);

  const otroOrigen = await c.post('/api/productos', { nombre: 'Cepillo' }, { cabeceras: { origin: 'https://pagina-mala.example' } });
  assert.equal(otroOrigen.estado, 403);

  const mismoOrigen = await c.post('/api/productos', { nombre: 'Cepillo' }, { cabeceras: { origin: s.base } });
  assert.equal(mismoOrigen.estado, 201);
  assert.equal((await c.get('/api/estado')).json.estado.productos.length, 1, 'solo entró la petición legítima');
});

test('detrás del proxy del hosting se reconoce el dominio público; con APP_ORIGIN solo vale ese', async () => {
  const pedir = async (servidor, cabeceras) => {
    const c = servidor.cliente();
    await c.post('/api/cuenta/registro', cuentaNueva());
    return (await c.post('/api/productos', { nombre: 'Cepillo' }, { cabeceras })).estado;
  };
  const publico = { origin: 'https://app.ejemplo.com', 'x-forwarded-host': 'app.ejemplo.com' };

  assert.equal(await pedir(s, publico), 403, 'sin confiar en el proxy, X-Forwarded-Host no cuenta');

  const conProxy = await levantar({ env: { TRUST_PROXY: '1' } });
  try {
    assert.equal(await pedir(conProxy, publico), 201);
    assert.equal(await pedir(conProxy, { origin: 'https://pagina-mala.example', 'x-forwarded-host': 'app.ejemplo.com' }), 403);
  } finally {
    await conProxy.cerrar();
  }

  const conOrigen = await levantar({ env: { APP_ORIGIN: 'https://app.vendiva.example' } });
  try {
    assert.equal(await pedir(conOrigen, { origin: 'https://app.vendiva.example' }), 201);
    assert.equal(await pedir(conOrigen, { origin: conOrigen.base }), 403);
  } finally {
    await conOrigen.cerrar();
  }
});

test('/api/salud dice si la llave está puesta sin mostrarla', async () => {
  const sin = await s.cliente().get('/api/salud');
  assert.equal(sin.json.claude, 'falta la llave');
  assert.equal(sin.json.baseDeDatos, 'lista');

  const con = await levantar({ env: { ANTHROPIC_API_KEY: 'sk-ant-llave-de-mentira-para-la-prueba' } });
  try {
    const r = await con.cliente().get('/api/salud');
    assert.equal(r.json.claude, 'llave puesta');
    assert.ok(!JSON.stringify(r.json).includes('sk-ant'), 'la llave nunca sale del servidor');
  } finally {
    await con.cerrar();
  }
});

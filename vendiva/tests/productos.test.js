import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

async function conCuenta() {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  return { c, id: alta.json.estado.usuaria.id };
}

test('la app empieza vacía y ella agrega sus productos a mano', async () => {
  const { c } = await conCuenta();
  assert.deepEqual((await c.get('/api/estado')).json.estado.productos, []);

  const r = await c.post('/api/productos', {
    nombre: '  Cepillo alisador de cerdas suaves ',
    descripcion: 'Alisa sin calor. Para cabello rizado o con frizz.',
    precio: 14.99,
    comisionPct: 15,
    enlace: 'https://www.tiktok.com/view/product/123',
  });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  const [p] = r.json.estado.productos;
  assert.equal(p.nombre, 'Cepillo alisador de cerdas suaves');
  assert.equal(p.precio, 14.99);
  assert.equal(p.comisionPct, 15);
  assert.equal(p.origen, 'manual');
  assert.equal(r.json.estado.limites.productosUsados, 1);

  const minimo = await c.post('/api/productos', { nombre: 'Organizador de maquillaje' });
  assert.equal(minimo.estado, 201, 'solo el nombre es obligatorio');
  assert.equal(minimo.json.estado.productos.length, 2);
  assert.equal(minimo.json.estado.productos[0].precio, null);
});

test('plan Gratis: entran 6 productos y el séptimo no', async () => {
  const { c } = await conCuenta();
  for (let i = 1; i <= 6; i += 1) {
    const r = await c.post('/api/productos', { nombre: `Producto ${i}` });
    assert.equal(r.estado, 201, `producto ${i}`);
  }
  let e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.productos.length, 6);
  assert.equal(e.limites.puedeAgregarProducto, false);

  const septimo = await c.post('/api/productos', { nombre: 'Producto 7' });
  assert.equal(septimo.estado, 403);
  assert.equal(septimo.json.error.codigo, 'LIMITE_PRODUCTOS');
  assert.match(septimo.json.error.mensaje, /hasta 6 productos/);

  e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.productos.length, 6, 'el séptimo no quedó guardado');
  assert.ok(!e.productos.some((p) => p.nombre === 'Producto 7'));

  // Si borra uno, vuelve a tener lugar.
  const borrado = await c.del(`/api/productos/${e.productos[0].id}`);
  assert.equal(borrado.estado, 200);
  assert.equal(borrado.json.estado.limites.puedeAgregarProducto, true);
  assert.equal((await c.post('/api/productos', { nombre: 'Producto nuevo' })).estado, 201);
  assert.equal((await c.post('/api/productos', { nombre: 'Otro más' })).estado, 403);
});

test('diez toques a la vez no logran colar más de 6', async () => {
  const { c, id } = await conCuenta();
  const respuestas = await Promise.all(
    Array.from({ length: 10 }, (_, i) => c.post('/api/productos', { nombre: `A la vez ${i + 1}` })),
  );
  const estados = respuestas.map((r) => r.estado).sort();
  assert.deepEqual(estados, [201, 201, 201, 201, 201, 201, 403, 403, 403, 403]);
  const { rows } = await s.db.query('select count(*)::int as n from productos where usuaria_id = $1', [id]);
  assert.equal(rows[0].n, 6);
});

test('el tope es por cuenta: otra usuaria tiene sus propios 6', async () => {
  const a = await conCuenta();
  for (let i = 1; i <= 6; i += 1) await a.c.post('/api/productos', { nombre: `De A ${i}` });
  const b = await conCuenta();
  assert.equal((await b.c.post('/api/productos', { nombre: 'De B' })).estado, 201);
  assert.equal((await b.c.get('/api/estado')).json.estado.productos.length, 1);
});

test('editar y borrar', async () => {
  const { c } = await conCuenta();
  const alta = await c.post('/api/productos', { nombre: 'Sérum', precio: 20, comisionPct: 10 });
  const id = alta.json.productoId;

  let r = await c.patch(`/api/productos/${id}`, { nombre: 'Sérum de vitamina C', precio: null, descripcion: 'Ilumina la piel.' });
  assert.equal(r.estado, 200, JSON.stringify(r.json));
  assert.equal(r.json.estado.productos[0].nombre, 'Sérum de vitamina C');
  assert.equal(r.json.estado.productos[0].precio, null);
  assert.equal(r.json.estado.productos[0].comisionPct, 10, 'lo que no se manda no cambia');

  r = await c.del(`/api/productos/${id}`);
  assert.equal(r.estado, 200);
  assert.deepEqual(r.json.estado.productos, []);
  assert.equal((await c.del(`/api/productos/${id}`)).estado, 404);
});

test('nadie puede ver, editar ni borrar el producto de otra cuenta', async () => {
  const duena = await conCuenta();
  const alta = await duena.c.post('/api/productos', { nombre: 'Mi producto privado' });
  const id = alta.json.productoId;

  const intrusa = await conCuenta();
  assert.equal((await intrusa.c.patch(`/api/productos/${id}`, { nombre: 'Hackeado' })).estado, 404);
  assert.equal((await intrusa.c.del(`/api/productos/${id}`)).estado, 404);
  assert.deepEqual((await intrusa.c.get('/api/estado')).json.estado.productos, []);

  const e = (await duena.c.get('/api/estado')).json.estado;
  assert.equal(e.productos[0].nombre, 'Mi producto privado');
});

test('datos inválidos de producto', async () => {
  const { c } = await conCuenta();
  const malos = [
    {}, { nombre: '' }, { nombre: 'x' }, { nombre: 'a'.repeat(81) },
    { nombre: 'Ok', precio: -1 }, { nombre: 'Ok', precio: 'gratis' },
    { nombre: 'Ok', comisionPct: 101 }, { nombre: 'Ok', enlace: 'javascript:alert(1)' },
    { nombre: 'Ok', oculto: true }, { nombre: 'Ok', usuariaId: 'otra' },
  ];
  for (const cuerpo of malos) {
    const r = await c.post('/api/productos', cuerpo);
    assert.equal(r.estado, 400, JSON.stringify(cuerpo));
  }
  assert.equal((await c.patch('/api/productos/no-es-un-id', { nombre: 'Hola' })).estado, 404);
  assert.deepEqual((await c.get('/api/estado')).json.estado.productos, []);
});

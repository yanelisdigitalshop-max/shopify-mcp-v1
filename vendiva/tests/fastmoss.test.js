// El cliente de FastMoss contra respuestas falsas de la API (no llama a internet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buscarProductos, masVendidosDeLaSemana, llamarFastmoss, ErrorFastmoss, fastmossConfigurado } from '../server/fuentes/fastmoss.js';
import { crudoBusqueda, crudoRanking } from './fastmoss-falso.js';

const env = { VENDIVA_FASTMOSS_CLIENT_SECRET: 'secreto-de-mentira-123' };

function pedirFalso(respuestas) {
  const llamadas = [];
  const pedir = async (url, opciones) => {
    llamadas.push({ url, opciones, cuerpo: JSON.parse(opciones.body) });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { status: r.status ?? 200, json: async () => r.json };
  };
  return { pedir, llamadas };
}

test('búsqueda: una sola llamada POST a /product/v1/search con Bearer, EE. UU., 10 resultados', async () => {
  const { pedir, llamadas } = pedirFalso([{ json: { code: 0, data: { total: 4321, list: crudoBusqueda(10) } } }]);
  const r = await buscarProductos('hair brush', { env, pedir });
  assert.equal(llamadas.length, 1);
  const [l] = llamadas;
  assert.equal(l.url, 'https://openapi.fastmoss.com/product/v1/search');
  assert.equal(l.opciones.method, 'POST');
  assert.equal(l.opciones.headers.Authorization, 'Bearer secreto-de-mentira-123');
  assert.deepEqual(l.cuerpo, {
    keywords: 'hair brush',
    filter: { region: 'US', off_shelves: 0 },
    orderby: [{ field: 'day7_units_sold', order: 'desc' }],
    page: 1,
    pagesize: 10,
  });
  assert.equal(r.total, 4321);
  assert.equal(r.productos.length, 10);
  assert.deepEqual(r.productos[0], {
    id: '1729514474840169100',
    titulo: 'Cepillo alisador de prueba 1',
    precio: '$14.99',
    precioNumero: 14.99,
    ventas7Dias: 1000,
    ventasTotales: 20000,
    comisionPct: 10,
    tienda: 'Tienda 1',
    calificacion: 4.6,
    imagen: 'https://s.500fd.com/tt_product/foto0.jpeg',
    enlace: 'https://www.tiktok.com/view/product/1729514474840169100',
  });
});

test('búsqueda: nunca más de 10 aunque la API mande más; usa tiktok_url si viene', async () => {
  const lista = crudoBusqueda(10).concat(crudoBusqueda(5));
  lista[0].tiktok_url = 'https://www.tiktok.com/view/product/123?region=US';
  lista[1].cover = 'javascript:alert(1)';
  lista[2].commission_rate = 'n/a';
  const { pedir } = pedirFalso([{ json: { code: 0, data: { total: 15, list: lista } } }]);
  const r = await buscarProductos('x', { env, pedir });
  assert.equal(r.productos.length, 10);
  assert.equal(r.productos[0].enlace, 'https://www.tiktok.com/view/product/123?region=US');
  assert.equal(r.productos[1].imagen, null, 'solo imágenes https');
  assert.equal(r.productos[2].comisionPct, null, 'si la comisión no se entiende, no se inventa');
});

test('tendencias: una llamada a /product/v1/rank/topSelling de la semana pedida, 10 resultados', async () => {
  const { pedir, llamadas } = pedirFalso([{ json: { code: 0, msg: 'success', data: { total: 500, list: crudoRanking(10) } } }]);
  const r = await masVendidosDeLaSemana('2026-45', { env, pedir });
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, 'https://openapi.fastmoss.com/product/v1/rank/topSelling');
  assert.deepEqual(llamadas[0].cuerpo, {
    filter: { region: 'US', date_info: { type: 'week', value: '2026-45' } },
    orderby: [{ field: 'units_sold', order: 'desc' }],
    page: 1,
    pagesize: 10,
  });
  assert.equal(r.productos.length, 10);
  assert.equal(r.productos[0].ventasSemana, 5000);
  assert.equal(r.productos[0].precio, '$10.94');
  assert.ok(!('comisionPct' in r.productos[0]), 'la comisión del ranking no se muestra: su formato no está claro en la documentación');
});

test('errores de FastMoss: mensajes amables, sin reintentar solo', async () => {
  const casos = [
    [{ status: 200, json: { code: 30001, msg: 'no permission' } }, 'FASTMOSS_SIN_PERMISO', false],
    [{ status: 401, json: { code: 30001 } }, 'FASTMOSS_SIN_PERMISO', false],
    [{ status: 200, json: { code: 30002, msg: 'limit' } }, 'FASTMOSS_SIN_SALDO', false],
    [{ status: 200, json: { code: 30003 } }, 'FASTMOSS_OCUPADO', true],
    [{ status: 429, json: null }, 'FASTMOSS_OCUPADO', true],
    [{ status: 200, json: { code: 10001 } }, 'FASTMOSS_PETICION', false],
    [{ status: 200, json: { code: 40001 } }, 'FASTMOSS_FALLO', true],
    [{ status: 502, json: null }, 'FASTMOSS_FALLO', true],
    [new TypeError('fetch failed'), 'FASTMOSS_SIN_CONEXION', true],
  ];
  for (const [respuesta, codigo, reintentable] of casos) {
    const { pedir, llamadas } = pedirFalso([respuesta]);
    await assert.rejects(buscarProductos('x', { env, pedir }), (e) => e instanceof ErrorFastmoss && e.codigo === codigo && e.reintentable === reintentable && !e.message.includes('secreto'), codigo);
    assert.equal(llamadas.length, 1, `${codigo}: una sola llamada, sin reintento`);
  }
});

test('sin llave: no llama a nadie', async () => {
  const { pedir, llamadas } = pedirFalso([]);
  await assert.rejects(llamarFastmoss('/product/v1/search', {}, { env: {}, pedir }), (e) => e.codigo === 'FASTMOSS_SIN_LLAVE');
  assert.equal(llamadas.length, 0);
  assert.equal(fastmossConfigurado({}), false);
  assert.equal(fastmossConfigurado({ VENDIVA_FASTMOSS_CLIENT_SECRET: '  ' }), false);
  assert.equal(fastmossConfigurado(env), true);
});

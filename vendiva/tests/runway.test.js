// El cliente de Runway contra respuestas falsas de la API (no llama a internet).
import test from 'node:test';
import assert from 'node:assert/strict';
import { crearVideo, consultarVideo, cancelarVideo, ErrorRunway, runwayConfigurado } from '../server/fuentes/runway.js';

const env = { VENDIVA_RUNWAY_API_KEY: 'llave-runway-de-mentira' };
function pedirFalso(respuestas) {
  const llamadas = [];
  const pedir = async (url, o) => {
    llamadas.push({ url, metodo: o.method, cabeceras: o.headers, cuerpo: o.body ? JSON.parse(o.body) : null });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { status: r.status ?? 200, json: async () => r.json };
  };
  return { pedir, llamadas };
}

test('crear: una llamada POST a /v1/image_to_video con gen4_turbo, vertical, 10 s', async () => {
  const { pedir, llamadas } = pedirFalso([{ json: { id: 'abc-123' } }]);
  const r = await crearVideo({ imagen: 'https://img.example/foto.jpg', prompt: 'x'.repeat(1200), segundos: 10 }, { env, pedir });
  assert.deepEqual(r, { tareaId: 'abc-123' });
  assert.equal(llamadas.length, 1);
  const [l] = llamadas;
  assert.equal(l.url, 'https://api.dev.runwayml.com/v1/image_to_video');
  assert.equal(l.metodo, 'POST');
  assert.equal(l.cabeceras.Authorization, 'Bearer llave-runway-de-mentira');
  assert.equal(l.cabeceras['X-Runway-Version'], '2024-11-06');
  assert.deepEqual({ ...l.cuerpo, promptText: l.cuerpo.promptText.length }, {
    model: 'gen4_turbo',
    promptImage: 'https://img.example/foto.jpg',
    promptText: 1000,
    ratio: '720:1280',
    duration: 10,
  });
});

test('consultar: GET /v1/tasks/{id}; listo, fallido, cancelado y en proceso', async () => {
  const casos = [
    [{ status: 'SUCCEEDED', output: ['https://cdn.runway/v.mp4'] }, { estado: 'listo', url: 'https://cdn.runway/v.mp4' }],
    [{ status: 'FAILED', failure: 'imagen rechazada', failureCode: 'SAFETY.INPUT' }, { estado: 'fallido', falla: 'imagen rechazada', codigo: 'SAFETY.INPUT' }],
    [{ status: 'CANCELLED' }, { estado: 'fallido', falla: 'cancelado', codigo: 'CANCELLED' }],
    [{ status: 'RUNNING', progress: 0.4 }, { estado: 'procesando', progreso: 0.4 }],
    [{ status: 'THROTTLED' }, { estado: 'procesando', progreso: null }],
    [{ status: 'PENDING' }, { estado: 'procesando', progreso: null }],
  ];
  for (const [json, esperado] of casos) {
    const { pedir, llamadas } = pedirFalso([{ json }]);
    assert.deepEqual(await consultarVideo('t-1', { env, pedir }), esperado, json.status);
    assert.equal(llamadas[0].url, 'https://api.dev.runwayml.com/v1/tasks/t-1');
    assert.equal(llamadas[0].metodo, 'GET');
  }
});

test('cancelar: DELETE /v1/tasks/{id}', async () => {
  const { pedir, llamadas } = pedirFalso([{ status: 204, json: null }]);
  await cancelarVideo('t-9', { env, pedir });
  assert.equal(llamadas[0].metodo, 'DELETE');
  assert.equal(llamadas[0].url, 'https://api.dev.runwayml.com/v1/tasks/t-9');
});

test('errores: mensajes amables, una sola llamada, sin la llave en el mensaje', async () => {
  const casos = [
    [{ status: 401, json: { error: 'bad key' } }, 'RUNWAY_SIN_PERMISO', false],
    [{ status: 403, json: {} }, 'RUNWAY_SIN_PERMISO', false],
    [{ status: 400, json: { error: 'promptImage invalid' } }, 'RUNWAY_PETICION', false],
    [{ status: 429, json: {} }, 'RUNWAY_OCUPADO', true],
    [{ status: 500, json: null }, 'RUNWAY_FALLO', true],
    [new TypeError('fetch failed'), 'RUNWAY_SIN_CONEXION', true],
  ];
  for (const [r, codigo, reintentable] of casos) {
    const { pedir, llamadas } = pedirFalso([r]);
    await assert.rejects(crearVideo({ imagen: 'https://a/b.jpg', prompt: 'p', segundos: 10 }, { env, pedir }), (e) => e instanceof ErrorRunway && e.codigo === codigo && e.reintentable === reintentable && !e.message.includes('llave-runway'), codigo);
    assert.equal(llamadas.length, 1);
  }
});

test('sin llave: no llama a nadie', async () => {
  const { pedir, llamadas } = pedirFalso([]);
  await assert.rejects(crearVideo({ imagen: 'https://a/b.jpg', prompt: 'p', segundos: 10 }, { env: {}, pedir }), (e) => e.codigo === 'RUNWAY_SIN_LLAVE');
  assert.equal(llamadas.length, 0);
  assert.equal(runwayConfigurado({}), false);
  assert.equal(runwayConfigurado(env), true);
});

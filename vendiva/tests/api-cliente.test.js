// El cliente del navegador (src/api.js): cuándo ofrece "Reintentar".
import test from 'node:test';
import assert from 'node:assert/strict';

import { api, reintentableDe } from '../src/api.js';

test('reintentableDe: si el servidor lo dice, manda el servidor', () => {
  assert.equal(reintentableDe(503, { codigo: 'FASTMOSS_SIN_PERMISO', reintentable: false }), false);
  assert.equal(reintentableDe(503, { codigo: 'FASTMOSS_OCUPADO', reintentable: true }), true);
  assert.equal(reintentableDe(422, { codigo: 'X', reintentable: true }), true);
});

test('reintentableDe: si el servidor no lo dice, se decide por el estado como antes', () => {
  assert.equal(reintentableDe(503, { codigo: 'X' }), true);
  assert.equal(reintentableDe(500, { codigo: 'ERROR_INTERNO' }), true);
  assert.equal(reintentableDe(429, { codigo: 'DEMASIADAS_PETICIONES' }), true);
  assert.equal(reintentableDe(400, { codigo: 'DATOS_INVALIDOS' }), false);
  assert.equal(reintentableDe(404, { codigo: 'NO_ENCONTRADO' }), false);
  assert.equal(reintentableDe(502, undefined), true, 'sin JSON: problema del servidor');
});

test('api: un 503 que el servidor marca como no reintentable llega sin "Reintentar"', async (t) => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const responder = (estado, error) => async () =>
    new Response(JSON.stringify({ error }), { status: estado, headers: { 'Content-Type': 'application/json' } });

  globalThis.fetch = responder(503, { codigo: 'FASTMOSS_SIN_PERMISO', mensaje: 'La llave de FastMoss no es válida.', reintentable: false });
  await assert.rejects(api.post('/buscador', { consulta: 'mug' }), (e) => e.codigo === 'FASTMOSS_SIN_PERMISO' && e.estado === 503 && e.reintentable === false);

  globalThis.fetch = responder(503, { codigo: 'FASTMOSS_OCUPADO', mensaje: 'Muy ocupado.', reintentable: true });
  await assert.rejects(api.post('/buscador', { consulta: 'mug' }), (e) => e.reintentable === true);

  globalThis.fetch = responder(503, { codigo: 'VIEJO', mensaje: 'Sin el campo.' });
  await assert.rejects(api.post('/buscador', { consulta: 'mug' }), (e) => e.reintentable === true, 'sin el campo: como antes');
});

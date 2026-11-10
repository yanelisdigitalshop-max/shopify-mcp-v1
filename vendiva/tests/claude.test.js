import test from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { callClaude, parseClaudeJson, ErrorIA } from '../server/ia/claude.js';

const respuesta = (texto, extra = {}) => ({
  stop_reason: 'end_turn',
  content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: texto }],
  ...extra,
});

function clienteFalso(resultado) {
  const llamadas = { beta: [], normal: [] };
  const responder = (lista) => async (params) => {
    lista.push(params);
    if (resultado instanceof Error) throw resultado;
    return typeof resultado === 'function' ? resultado(params) : resultado;
  };
  return {
    llamadas,
    beta: { messages: { create: responder(llamadas.beta) } },
    messages: { create: responder(llamadas.normal) },
  };
}

test('parseClaudeJson: JSON limpio', () => {
  assert.deepEqual(parseClaudeJson('{"a": 1}'), { a: 1 });
  assert.deepEqual(parseClaudeJson('  [1, 2, 3]\n'), [1, 2, 3]);
});

test('parseClaudeJson: quita las cercas ```json', () => {
  assert.deepEqual(parseClaudeJson('```json\n{"gancho": "Mira esto"}\n```'), { gancho: 'Mira esto' });
  assert.deepEqual(parseClaudeJson('```\n{"gancho": "Mira esto"}\n```'), { gancho: 'Mira esto' });
  assert.deepEqual(parseClaudeJson('```JSON\n[{"n": 1}]\n```\n'), [{ n: 1 }]);
  assert.deepEqual(parseClaudeJson('```json\n{"sin": "cerrar"}'), { sin: 'cerrar' });
});

test('parseClaudeJson: texto antes y después', () => {
  assert.deepEqual(parseClaudeJson('Aquí tienes tus guiones:\n```json\n{"guiones": []}\n```\n¡Éxitos!'), { guiones: [] });
  assert.deepEqual(parseClaudeJson('Claro. {"ok": true, "texto": "con } llave"} Espero que sirva.'), { ok: true, texto: 'con } llave' });
  assert.deepEqual(parseClaudeJson('Lista: [{"a": 1}, {"a": 2}] fin'), [{ a: 1 }, { a: 2 }]);
});

test('parseClaudeJson: conserva las comillas invertidas que van dentro de un texto', () => {
  const dato = { caption: 'Usa el código `VIVA10` hoy' };
  assert.deepEqual(parseClaudeJson(JSON.stringify(dato)), dato);
});

test('parseClaudeJson: si no hay JSON, avisa con un error reintentable (no revienta)', () => {
  for (const malo of ['', '   ', 'No puedo ayudarte con eso.', '{"cortado": ', '```json\n{mal}\n```', null, undefined, 42]) {
    assert.throws(() => parseClaudeJson(malo), (e) => e instanceof ErrorIA && e.codigo === 'JSON_INVALIDO' && e.reintentable === true, String(malo));
  }
});

test('callClaude devuelve el texto y usa el modelo por defecto con respaldo', async () => {
  const cliente = clienteFalso(respuesta('  Hola, soy Claude.  '));
  const texto = await callClaude([{ role: 'user', content: 'Hola' }], { cliente, system: 'Eres la agente de Vendiva.' });
  assert.equal(texto, 'Hola, soy Claude.');
  assert.equal(cliente.llamadas.normal.length, 0);
  const [p] = cliente.llamadas.beta;
  assert.equal(p.model, 'claude-opus-5-5');
  assert.equal(p.system, 'Eres la agente de Vendiva.');
  assert.deepEqual(p.messages, [{ role: 'user', content: 'Hola' }]);
  assert.deepEqual(p.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(p.fallbacks, 'default');
  assert.deepEqual(p.output_config, { effort: 'medium' });
  assert.ok(!('temperature' in p) && !('thinking' in p));
});

test('callClaude con otro modelo no manda el respaldo', async () => {
  const cliente = clienteFalso(respuesta('ok'));
  await callClaude([{ role: 'user', content: 'Hola' }], { cliente, modelo: 'claude-haiku-5-5', esfuerzo: 'low', maxTokens: 500 });
  assert.equal(cliente.llamadas.beta.length, 0);
  const [p] = cliente.llamadas.normal;
  assert.equal(p.model, 'claude-haiku-5-5');
  assert.equal(p.max_tokens, 500);
  assert.ok(!('fallbacks' in p) && !('betas' in p) && !('system' in p));
});

test('callClaude une varios bloques de texto', async () => {
  const cliente = clienteFalso({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{"a":' }, { type: 'text', text: ' 1}' }] });
  assert.deepEqual(parseClaudeJson(await callClaude([{ role: 'user', content: 'x' }], { cliente })), { a: 1 });
});

test('callClaude: negativa, respuesta vacía y respuesta cortada', async () => {
  const codigo = async (resultado) => {
    try {
      await callClaude([{ role: 'user', content: 'x' }], { cliente: clienteFalso(resultado) });
      return 'sin error';
    } catch (e) {
      assert.ok(e instanceof ErrorIA);
      return e.codigo;
    }
  };
  assert.equal(await codigo({ stop_reason: 'refusal', content: [], stop_details: { category: null } }), 'IA_DECLINO');
  assert.equal(await codigo({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }] }), 'RESPUESTA_VACIA');
  assert.equal(await codigo(respuesta('{"a": ', { stop_reason: 'max_tokens' })), 'RESPUESTA_CORTADA');
});

test('callClaude traduce los errores de Anthropic a avisos amables', async () => {
  const casos = [
    [new Anthropic.AuthenticationError(401, { type: 'error' }, 'invalid x-api-key', new Headers()), 'LLAVE_INVALIDA', false],
    [new Anthropic.RateLimitError(429, { type: 'error' }, 'rate limited', new Headers()), 'IA_OCUPADA', true],
    [new Anthropic.BadRequestError(400, { type: 'error' }, 'bad request', new Headers()), 'PETICION_INVALIDA', false],
    [new Anthropic.InternalServerError(500, { type: 'error' }, 'overloaded', new Headers()), 'IA_FALLO', true],
    [new Anthropic.APIConnectionError({ message: 'sin red' }), 'SIN_CONEXION', true],
    [new TypeError('algo raro'), 'IA_FALLO', true],
  ];
  for (const [error, codigo, reintentable] of casos) {
    await assert.rejects(
      callClaude([{ role: 'user', content: 'x' }], { cliente: clienteFalso(error) }),
      (e) => e instanceof ErrorIA && e.codigo === codigo && e.reintentable === reintentable && !/sk-ant|api-key/i.test(e.message),
      codigo,
    );
  }
});

test('callClaude sin llave: avisa que falta, sin intentar llamar', async () => {
  const guardada = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    await assert.rejects(callClaude([{ role: 'user', content: 'Hola' }]), (e) => e instanceof ErrorIA && e.codigo === 'SIN_LLAVE');
  } finally {
    if (guardada !== undefined) process.env.ANTHROPIC_API_KEY = guardada;
  }
});

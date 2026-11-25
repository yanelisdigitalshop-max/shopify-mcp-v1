// La conexión con ElevenLabs, con un fetch de mentira: qué se manda y cómo se leen los errores.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ErrorVoz, VOZ_POR_DEFECTO, generarVoz, vozConfigurada } from '../server/fuentes/elevenlabs.js';

const ENV = { VENDIVA_ELEVENLABS_API_KEY: 'llave-de-prueba' };
const mp3 = () => new Uint8Array(4000).fill(1);

test('pide la voz a /v1/text-to-speech con la llave en xi-api-key, español multilingüe y MP3', async () => {
  let visto;
  const r = await generarVoz({ texto: 'Mira este cepillo.' }, {
    env: ENV,
    pedir: async (url, op) => {
      visto = { url, op };
      return new Response(mp3(), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    },
  });
  assert.equal(visto.url, `https://api.elevenlabs.io/v1/text-to-speech/${VOZ_POR_DEFECTO}?output_format=mp3_44100_128`);
  assert.equal(visto.op.method, 'POST');
  assert.equal(visto.op.headers['xi-api-key'], 'llave-de-prueba');
  const cuerpo = JSON.parse(visto.op.body);
  assert.equal(cuerpo.text, 'Mira este cepillo.');
  assert.equal(cuerpo.model_id, 'eleven_multilingual_v2');
  assert.ok(cuerpo.voice_settings.stability >= 0 && cuerpo.voice_settings.stability <= 1);
  assert.equal(r.mime, 'audio/mpeg');
  assert.equal(r.audio.length, 4000);
});

test('la voz se puede elegir con VENDIVA_ELEVENLABS_VOICE_ID', async () => {
  let url;
  await generarVoz({ texto: 'Hola' }, {
    env: { ...ENV, VENDIVA_ELEVENLABS_VOICE_ID: 'vozEspanola123' },
    pedir: async (u) => {
      url = u;
      return new Response(mp3(), { status: 200 });
    },
  });
  assert.match(url, /\/v1\/text-to-speech\/vozEspanola123\?/);
});

test('sin llave no llama a nadie; la llave nunca sale en los mensajes', async () => {
  assert.equal(vozConfigurada({}), false);
  assert.equal(vozConfigurada(ENV), true);
  let llamo = false;
  await assert.rejects(
    generarVoz({ texto: 'x' }, { env: {}, pedir: async () => { llamo = true; } }),
    (e) => e instanceof ErrorVoz && e.codigo === 'VOZ_SIN_LLAVE',
  );
  assert.equal(llamo, false);
});

test('errores de ElevenLabs: llave, saldo, ocupado, petición, caído y sin conexión', async () => {
  const con = (estado, cuerpo) => generarVoz({ texto: 'x' }, { env: ENV, pedir: async () => new Response(JSON.stringify(cuerpo ?? {}), { status: estado }) });
  const casos = [
    [401, { detail: { status: 'invalid_api_key', message: 'Invalid API key' } }, 'VOZ_SIN_PERMISO', false],
    [401, { detail: { status: 'quota_exceeded', message: 'quota' } }, 'VOZ_SIN_SALDO', false],
    [429, { detail: { status: 'too_many_concurrent_requests' } }, 'VOZ_OCUPADA', true],
    [422, { detail: [{ msg: 'bad' }] }, 'VOZ_PETICION', false],
    [500, {}, 'VOZ_FALLO', true],
  ];
  for (const [estado, cuerpo, codigo, reintentable] of casos) {
    await assert.rejects(con(estado, cuerpo), (e) => e.codigo === codigo && e.reintentable === reintentable && !e.message.includes('llave-de-prueba'), `${estado} ${codigo}`);
  }
  await assert.rejects(
    generarVoz({ texto: 'x' }, { env: ENV, pedir: async () => { throw new TypeError('fetch failed'); } }),
    (e) => e.codigo === 'VOZ_SIN_CONEXION' && e.reintentable,
  );
  await assert.rejects(
    generarVoz({ texto: 'x' }, { env: ENV, pedir: async () => new Response(new Uint8Array(10), { status: 200 }) }),
    (e) => e.codigo === 'VOZ_FALLO',
  );
});

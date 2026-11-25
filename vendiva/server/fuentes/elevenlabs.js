// Conexión con la API de ElevenLabs: SOLO la voz de IA que narra el guion del video.
//
// Verificado en el SDK oficial de ElevenLabs (github.com/elevenlabs/elevenlabs-js, versión 2.80.0,
// 25 nov 2026; elevenlabs.io no se pudo abrir desde el entorno de desarrollo):
//   - Dirección: https://api.elevenlabs.io
//   - Cabecera de la llave: "xi-api-key".
//   - Crear la voz: POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128
//     { text, model_id, voice_settings: { stability, similarity_boost, style, use_speaker_boost, speed }, seed }
//     -> el audio (MP3) directo en la respuesta.
//   - model_id: eleven_multilingual_v2 (habla español; no lleva language_code).
// Precio (búsqueda, nov 2026): cerca de 0,10 USD por cada 1.000 caracteres con multilingual v2.
// Una narración de 10 segundos tiene unos 150 a 200 caracteres: cerca de 2 centavos de dólar.
//
// La llave es de la dueña y vive SOLO en la variable de entorno VENDIVA_ELEVENLABS_API_KEY.
// La voz (femenina, español natural) se elige con VENDIVA_ELEVENLABS_VOICE_ID.
// Nunca se reintenta solo: cada narración cuesta dinero real.

const BASE = 'https://api.elevenlabs.io';
const ESPERA_MS = 60000;
export const MODELO_VOZ = 'eleven_multilingual_v2';
export const FORMATO = 'mp3_44100_128';
// Voz por defecto: una voz femenina prediseñada de ElevenLabs (multilingüe). Para una voz con
// acento nativo en español, la dueña elige una en la Voice Library, la agrega a su cuenta y pone
// su id en VENDIVA_ELEVENLABS_VOICE_ID.
export const VOZ_POR_DEFECTO = 'EXAVITQu4vr4xnSDxMaL';
const AJUSTES = { stability: 0.5, similarity_boost: 0.75, style: 0.2, use_speaker_boost: true, speed: 1 };

export class ErrorVoz extends Error {
  constructor(codigo, mensaje, { reintentable = false, detalle } = {}) {
    super(mensaje);
    this.name = 'ErrorVoz';
    this.codigo = codigo;
    this.reintentable = reintentable;
    this.detalle = detalle; // para el registro del servidor (nunca la llave)
  }
}

const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const leerLlave = (env = process.env) => texto(env.VENDIVA_ELEVENLABS_API_KEY);
export const vozConfigurada = (env = process.env) => Boolean(leerLlave(env));
export const vozElegida = (env = process.env) => texto(env.VENDIVA_ELEVENLABS_VOICE_ID) ?? VOZ_POR_DEFECTO;

function traducir(estadoHttp, cuerpo) {
  const d = cuerpo?.detail;
  const estado = typeof d === 'object' && d ? String(d.status ?? d.code ?? '') : '';
  const detalle = `HTTP ${estadoHttp}${estado ? `, ${estado}` : ''}${typeof d === 'object' && d?.message ? `, ${String(d.message).slice(0, 160)}` : ''}`;
  if (/quota|credit/i.test(estado)) {
    return new ErrorVoz('VOZ_SIN_SALDO', 'La voz de IA no está disponible en este momento. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (estadoHttp === 401 || estadoHttp === 403) {
    return new ErrorVoz('VOZ_SIN_PERMISO', 'La voz de IA no está disponible en este momento. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (estadoHttp === 429) {
    return new ErrorVoz('VOZ_OCUPADA', 'El servicio de voz está muy ocupado. Intenta de nuevo en un minuto.', { reintentable: true, detalle });
  }
  if (estadoHttp === 400 || estadoHttp === 404 || estadoHttp === 422) {
    return new ErrorVoz('VOZ_PETICION', 'No pudimos crear la voz para este guion. Ya quedó anotado para revisarlo.', { detalle });
  }
  return new ErrorVoz('VOZ_FALLO', 'El servicio de voz tuvo un problema. Intenta de nuevo en un momento.', { reintentable: true, detalle });
}

/**
 * Narra el texto con la voz elegida. UNA llamada.
 * Devuelve { audio: Buffer (MP3), mime, modelo, vozId }.
 */
export async function generarVoz({ texto: narracion }, { env = process.env, pedir = fetch } = {}) {
  const llave = leerLlave(env);
  if (!llave) {
    throw new ErrorVoz('VOZ_SIN_LLAVE', 'La voz de IA todavía no está conectada. Falta poner la llave de ElevenLabs en la configuración del servidor.');
  }
  const vozId = vozElegida(env);
  let r;
  try {
    r = await pedir(`${BASE}/v1/text-to-speech/${encodeURIComponent(vozId)}?output_format=${FORMATO}`, {
      method: 'POST',
      headers: { 'xi-api-key': llave, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: String(narracion).slice(0, 1000), model_id: MODELO_VOZ, voice_settings: AJUSTES }),
      signal: AbortSignal.timeout(ESPERA_MS),
    });
  } catch (err) {
    throw new ErrorVoz('VOZ_SIN_CONEXION', 'No pudimos conectar con el servicio de voz. Intenta de nuevo.', {
      reintentable: true,
      detalle: err?.name === 'TimeoutError' || err?.name === 'AbortError' ? 'tiempo de espera agotado' : String(err?.cause?.code ?? err?.message ?? err).slice(0, 120),
    });
  }
  if (r.status < 200 || r.status >= 300) {
    let cuerpo = null;
    try {
      cuerpo = await r.json();
    } catch {
      // sin JSON
    }
    throw traducir(r.status, cuerpo);
  }
  const audio = Buffer.from(await r.arrayBuffer());
  if (audio.length < 1000) {
    throw new ErrorVoz('VOZ_FALLO', 'El servicio de voz no devolvió el audio. Intenta de nuevo.', { reintentable: true, detalle: `audio de ${audio.length} bytes` });
  }
  return { audio, mime: 'audio/mpeg', modelo: MODELO_VOZ, vozId };
}

/** La fuente real. Las pruebas pasan otra con la misma forma, que no llama a nadie. */
export const vozReal = {
  lista: () => vozConfigurada(),
  generar: (p) => generarVoz(p),
};

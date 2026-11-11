// Paso 0: conexión con Claude (Anthropic).
//
// La llave es de la dueña y vive SOLO en una variable de entorno del servidor:
//   VENDIVA_ANTHROPIC_API_KEY   (la preferida)
//   ANTHROPIC_API_KEY           (el nombre de siempre; vale si la otra no está)
// El nombre propio existe porque ANTHROPIC_API_KEY también lo leen otras
// herramientas (como Claude Code): donde conviven, así no se pisan.
// Este archivo nunca muestra la llave, no la registra y no la envía al cliente.

import Anthropic from '@anthropic-ai/sdk';

export const MODELO_POR_DEFECTO = 'claude-opus-5-5';

// Modelos que aceptan el respaldo automático del servidor de Anthropic cuando
// un filtro de seguridad declina una petición.
const MODELOS_CON_RESPALDO = new Set([
  'claude-fable-5-2',
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/** Error de la IA con un mensaje amable para la usuaria y un código para el cliente. */
export class ErrorIA extends Error {
  constructor(codigo, mensaje, { reintentable = false, causa } = {}) {
    super(mensaje, causa ? { cause: causa } : undefined);
    this.name = 'ErrorIA';
    this.codigo = codigo;
    this.reintentable = reintentable;
  }
}

let clienteCompartido = null;

// La llave de Vendiva solo viaja a la API de Anthropic, pase lo que pase con
// otras variables del entorno (ANTHROPIC_BASE_URL, ANTHROPIC_AUTH_TOKEN...).
const API_DE_ANTHROPIC = 'https://api.anthropic.com';

/** Solo para uso interno del servidor: nunca se imprime ni se devuelve al cliente. */
function leerLlave(env = process.env) {
  return env.VENDIVA_ANTHROPIC_API_KEY?.trim() || env.ANTHROPIC_API_KEY?.trim() || null;
}

export function claudeConfigurado(env = process.env) {
  return Boolean(leerLlave(env));
}

function obtenerCliente() {
  if (!claudeConfigurado()) {
    throw new ErrorIA(
      'SIN_LLAVE',
      'La inteligencia artificial todavía no está conectada. Falta poner la llave de Anthropic en la configuración del servidor.',
    );
  }
  clienteCompartido ??= new Anthropic({ apiKey: leerLlave(), authToken: null, baseURL: API_DE_ANTHROPIC });
  return clienteCompartido;
}

function traducirError(err) {
  if (err instanceof ErrorIA) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ErrorIA('LLAVE_INVALIDA', 'La llave de Anthropic no fue aceptada. Hay que revisarla en la configuración del servidor.', { causa: err });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ErrorIA('IA_OCUPADA', 'La inteligencia artificial está muy ocupada en este momento. Intenta de nuevo en un minuto.', { reintentable: true, causa: err });
  }
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) {
    return new ErrorIA('PETICION_INVALIDA', 'No pudimos preparar esta creación. Ya quedó anotado para revisarlo.', { causa: err });
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ErrorIA('SIN_CONEXION', 'No pudimos conectar con la inteligencia artificial. Revisa tu internet e intenta de nuevo.', { reintentable: true, causa: err });
  }
  if (err instanceof Anthropic.APIError) {
    return new ErrorIA('IA_FALLO', 'La inteligencia artificial tuvo un problema. Intenta de nuevo en un momento.', { reintentable: true, causa: err });
  }
  return new ErrorIA('IA_FALLO', 'Algo salió mal al crear. Intenta de nuevo.', { reintentable: true, causa: err });
}

/**
 * Llama a Claude y devuelve el texto junto con el modelo y los tokens usados
 * (para saber cuánto cuesta cada creación). Es la versión completa de callClaude.
 *
 * @param {Array<{role: 'user'|'assistant', content: string|object[]}>} messages
 * @param {object} [opciones]
 * @param {string} [opciones.system]     instrucciones fijas (quién es y cómo escribe)
 * @param {number} [opciones.maxTokens]  tope de la respuesta
 * @param {'low'|'medium'|'high'} [opciones.esfuerzo]
 * @param {string} [opciones.modelo]     por defecto ANTHROPIC_MODEL o claude-opus-5-5
 * @param {object} [opciones.cliente]    solo para pruebas: un cliente falso
 * @returns {Promise<{ texto: string, modelo: string, uso: { entrada: number, salida: number } }>}
 */
export async function llamarClaude(messages, opciones = {}) {
  const {
    system,
    maxTokens = 16000,
    esfuerzo = 'medium',
    modelo = process.env.ANTHROPIC_MODEL?.trim() || MODELO_POR_DEFECTO,
    cliente,
  } = opciones;

  try {
    const c = cliente ?? obtenerCliente();
    const peticion = {
      model: modelo,
      max_tokens: maxTokens,
      output_config: { effort: esfuerzo },
      messages,
      ...(system ? { system } : {}),
    };

    const respuesta = MODELOS_CON_RESPALDO.has(modelo)
      ? await c.beta.messages.create({
          ...peticion,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
      : await c.messages.create(peticion);

    if (respuesta.stop_reason === 'refusal') {
      throw new ErrorIA('IA_DECLINO', 'La inteligencia artificial no pudo escribir esto. Prueba describir el producto de otra forma.');
    }

    const texto = respuesta.content
      .filter((bloque) => bloque.type === 'text')
      .map((bloque) => bloque.text)
      .join('')
      .trim();

    if (!texto) {
      throw new ErrorIA('RESPUESTA_VACIA', 'La inteligencia artificial no devolvió nada. Intenta de nuevo.', { reintentable: true });
    }
    if (respuesta.stop_reason === 'max_tokens') {
      throw new ErrorIA('RESPUESTA_CORTADA', 'La respuesta salió incompleta. Intenta de nuevo.', { reintentable: true });
    }
    return {
      texto,
      modelo: respuesta.model ?? modelo,
      uso: { entrada: respuesta.usage?.input_tokens ?? 0, salida: respuesta.usage?.output_tokens ?? 0 },
    };
  } catch (err) {
    throw traducirError(err);
  }
}

/**
 * Llama a Claude y devuelve el texto de la respuesta.
 * Mismas opciones que llamarClaude.
 *
 * @returns {Promise<string>}
 */
export async function callClaude(messages, opciones = {}) {
  return (await llamarClaude(messages, opciones)).texto;
}

/**
 * Convierte en objeto el JSON que devuelve Claude, aunque venga envuelto en
 * ```json ... ``` o con una frase antes o después.
 *
 * @param {string} text
 * @returns {any}
 * @throws {ErrorIA} JSON_INVALIDO si no hay un JSON que se pueda leer
 */
export function parseClaudeJson(text) {
  const invalido = (causa) =>
    new ErrorIA('JSON_INVALIDO', 'La respuesta llegó en un formato que no pudimos leer. Intenta de nuevo.', { reintentable: true, causa });

  if (typeof text !== 'string' || !text.trim()) throw invalido();

  let limpio = text.trim();

  // 1) Si hay un bloque ```json ... ``` (o ``` ... ```), nos quedamos con lo de adentro.
  const cerca = limpio.match(/```(?:json|JSON)?\s*\n?([\s\S]*?)```/);
  if (cerca) limpio = cerca[1].trim();
  else limpio = limpio.replace(/^```(?:json|JSON)?\s*/, '').trim(); // cerca abierta y sin cerrar

  try {
    return JSON.parse(limpio);
  } catch {
    // 2) Texto alrededor: se toma desde la primera llave o corchete hasta su cierre final.
    const inicio = limpio.search(/[{[]/);
    if (inicio === -1) throw invalido();
    const fin = limpio.lastIndexOf(limpio[inicio] === '{' ? '}' : ']');
    if (fin <= inicio) throw invalido();
    try {
      return JSON.parse(limpio.slice(inicio, fin + 1));
    } catch (err) {
      throw invalido(err);
    }
  }
}

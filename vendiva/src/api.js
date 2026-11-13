// Todas las llamadas al servidor pasan por aquí.
// Nada se guarda en el navegador: la sesión viaja en una cookie que el
// código de la página no puede leer, y los datos viven en la base del servidor.

const ESPERA_MAXIMA_MS = 20000;
// La IA tarda más en escribir que una petición normal.
export const ESPERA_IA_MS = 120000;

export class ErrorApi extends Error {
  constructor({ codigo, mensaje, campos = null, datos = null, estado = 0, reintentable = false }) {
    super(mensaje);
    this.name = 'ErrorApi';
    this.codigo = codigo;
    this.campos = campos;
    this.datos = datos;
    this.estado = estado;
    // true = problema de red o del servidor: tiene sentido ofrecer "Reintentar".
    this.reintentable = reintentable;
  }
}

/**
 * ¿Ofrecemos "Reintentar"? Si el servidor lo dice (error.reintentable true/false), manda él:
 * una llave inválida da 503 pero reintentar no la arregla. Si no lo dice, se decide por el estado.
 */
export function reintentableDe(estado, error) {
  if (typeof error?.reintentable === 'boolean') return error.reintentable;
  return estado >= 500 || estado === 429 || !error;
}

async function pedir(metodo, ruta, cuerpo, { esperaMs = ESPERA_MAXIMA_MS } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), esperaMs);
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      signal: control.signal,
      headers: {
        Accept: 'application/json',
        ...(metodo === 'GET' ? {} : { 'X-Vendiva': '1' }),
        ...(cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
  } catch {
    throw new ErrorApi({
      codigo: 'SIN_CONEXION',
      mensaje: 'No pudimos conectar. Revisa tu internet y vuelve a intentar: no perdiste nada.',
      reintentable: true,
    });
  } finally {
    clearTimeout(reloj);
  }

  let json = null;
  try {
    json = await respuesta.json();
  } catch {
    // respuesta sin JSON (por ejemplo, el servidor reiniciándose)
  }

  if (!respuesta.ok) {
    const e = json?.error;
    throw new ErrorApi({
      codigo: e?.codigo ?? 'ERROR',
      mensaje: e?.mensaje ?? 'Algo falló de nuestro lado. Intenta de nuevo en un momento.',
      campos: e?.campos ?? null,
      datos: e?.datos ?? null,
      estado: respuesta.status,
      reintentable: reintentableDe(respuesta.status, e),
    });
  }
  return json;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}, opciones) => pedir('POST', ruta, cuerpo, opciones),
  patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
  del: (ruta) => pedir('DELETE', ruta),
};

// Todas las llamadas al servidor pasan por aquí.
// Nada se guarda en el navegador: la sesión viaja en una cookie que el
// código de la página no puede leer, y los datos viven en la base del servidor.

import { esApp, guardarEnGaleria } from './nativo.js';

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

async function pedir(metodo, ruta, cuerpo, { esperaMs = ESPERA_MAXIMA_MS, archivo = null } = {}) {
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
        ...(archivo ? { 'Content-Type': archivo.type || 'application/octet-stream' } : cuerpo === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: archivo ?? (cuerpo === undefined ? undefined : JSON.stringify(cuerpo)),
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

/**
 * Descarga un archivo del servidor y lo guarda en el teléfono (o la computadora).
 * Devuelve cuando el archivo llegó completo. Nada se guarda en el navegador:
 * el archivo pasa directo a la carpeta de descargas.
 */
async function descargar(ruta, { esperaMs = 180000, nombrePorDefecto = 'video.mp4' } = {}) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), esperaMs);
  let respuesta;
  let blob;
  try {
    respuesta = await fetch(`/api${ruta}`, { credentials: 'same-origin', signal: control.signal });
    if (respuesta.ok) blob = await respuesta.blob();
  } catch {
    throw new ErrorApi({
      codigo: 'SIN_CONEXION',
      mensaje: 'La descarga se cortó. Revisa tu internet y vuelve a intentar: el video sigue aquí.',
      reintentable: true,
    });
  } finally {
    clearTimeout(reloj);
  }
  if (!respuesta.ok) {
    let e = null;
    try {
      e = (await respuesta.json())?.error;
    } catch {
      // sin JSON
    }
    throw new ErrorApi({
      codigo: e?.codigo ?? 'ERROR',
      mensaje: e?.mensaje ?? 'No pudimos descargar el video. Intenta de nuevo en un momento.',
      estado: respuesta.status,
      reintentable: respuesta.status >= 500 || respuesta.status === 429 || !e,
    });
  }
  const nombre = /filename="([^"]+)"/.exec(respuesta.headers.get('content-disposition') ?? '')?.[1] ?? nombrePorDefecto;
  // Parte 8: en la app del teléfono, el video va directo a la galería.
  if (esApp()) {
    try {
      await guardarEnGaleria(blob, nombre);
    } catch {
      throw new ErrorApi({ codigo: 'GALERIA', mensaje: 'No pudimos guardar el video en tu galería. Revisa que Vendiva tenga permiso para guardar fotos y videos, e intenta otra vez.', reintentable: true });
    }
    return { nombre, enGaleria: true };
  }
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return { nombre };
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}, opciones) => pedir('POST', ruta, cuerpo, opciones),
  patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
  del: (ruta) => pedir('DELETE', ruta),
  descargar,
  // Sube un archivo tal cual (por ejemplo, la grabación de su voz).
  subir: (ruta, archivo, opciones) => pedir('POST', ruta, undefined, { esperaMs: 60000, ...opciones, archivo }),
};

// Todas las llamadas al servidor pasan por aquí.
// Nada se guarda en el navegador: la sesión viaja en una cookie que el
// código de la página no puede leer, y los datos viven en la base del servidor.

const ESPERA_MAXIMA_MS = 20000;

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

async function pedir(metodo, ruta, cuerpo) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS);
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
      reintentable: respuesta.status >= 500 || respuesta.status === 429 || !e,
    });
  }
  return json;
}

export const api = {
  get: (ruta) => pedir('GET', ruta),
  post: (ruta, cuerpo = {}) => pedir('POST', ruta, cuerpo),
  patch: (ruta, cuerpo = {}) => pedir('PATCH', ruta, cuerpo),
  del: (ruta) => pedir('DELETE', ruta),
};

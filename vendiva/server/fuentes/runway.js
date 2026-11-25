// Conexión con la API de Runway (videos con IA, modelo Gen-4 Turbo).
//
// Verificado en el SDK oficial de Runway (github.com/runwayml/sdk-node, 25 nov 2026;
// la página docs.dev.runwayml.com no se pudo abrir desde aquí):
//   - Dirección: https://api.dev.runwayml.com
//   - Cabeceras: "Authorization: Bearer <llave>" y "X-Runway-Version: 2024-11-06".
//   - Crear: POST /v1/image_to_video { model: 'gen4_turbo', promptImage (URL https, hasta 5 MB),
//     promptText (hasta 1.000 caracteres), ratio ('720:1280' = vertical), duration } -> { id }.
//   - Consultar: GET /v1/tasks/{id} -> status PENDING | THROTTLED | RUNNING | SUCCEEDED | FAILED | CANCELLED.
//     SUCCEEDED trae output: [url]. FAILED trae failure y failureCode.
//     "No esperar cambios más seguido que cada 5 segundos."
//   - Los enlaces de salida VENCEN en 24 a 48 horas; consultar la tarea otra vez da enlaces nuevos.
//   - Cancelar: DELETE /v1/tasks/{id} (si ya estaba RUNNING, Runway no devuelve el gasto).
// Precio (docs de Runway, vía búsqueda): gen4_turbo = 5 créditos de Runway por segundo,
// 0,01 USD por crédito = 0,05 USD por segundo. Un video de 10 s = 0,50 USD.
//
// La llave es de la dueña y vive SOLO en la variable de entorno VENDIVA_RUNWAY_API_KEY.
// Nunca se reintenta solo: cada video cuesta dinero real.

const BASE = 'https://api.dev.runwayml.com';
const VERSION = '2024-11-06';
const ESPERA_MS = 30000;
export const MODELO = 'gen4_turbo';
export const PROPORCION_VERTICAL = '720:1280';

export class ErrorRunway extends Error {
  constructor(codigo, mensaje, { reintentable = false, detalle } = {}) {
    super(mensaje);
    this.name = 'ErrorRunway';
    this.codigo = codigo;
    this.reintentable = reintentable;
    this.detalle = detalle; // para el registro del servidor (nunca la llave)
  }
}

const leerLlave = (env = process.env) => env.VENDIVA_RUNWAY_API_KEY?.trim() || null;
export const runwayConfigurado = (env = process.env) => Boolean(leerLlave(env));

function traducir(estadoHttp, cuerpo) {
  const detalle = `HTTP ${estadoHttp}${cuerpo ? `, ${String(cuerpo.error ?? cuerpo.message ?? JSON.stringify(cuerpo)).slice(0, 160)}` : ''}`;
  if (estadoHttp === 401 || estadoHttp === 403) {
    return new ErrorRunway('RUNWAY_SIN_PERMISO', 'Los videos no están disponibles en este momento. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (estadoHttp === 429) {
    return new ErrorRunway('RUNWAY_OCUPADO', 'El servicio de video está muy ocupado. Intenta de nuevo en unos minutos.', { reintentable: true, detalle });
  }
  if (estadoHttp === 400 || estadoHttp === 422) {
    return new ErrorRunway('RUNWAY_PETICION', 'No pudimos crear este video con la foto del producto. Ya quedó anotado para revisarlo.', { detalle });
  }
  return new ErrorRunway('RUNWAY_FALLO', 'El servicio de video tuvo un problema. Intenta de nuevo en un momento.', { reintentable: true, detalle });
}

async function pedirRunway(metodo, ruta, cuerpo, { env = process.env, pedir = fetch } = {}) {
  const llave = leerLlave(env);
  if (!llave) {
    throw new ErrorRunway('RUNWAY_SIN_LLAVE', 'Los videos todavía no están conectados. Falta poner la llave de Runway en la configuración del servidor.');
  }
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  let r;
  try {
    r = await pedir(`${BASE}${ruta}`, {
      method: metodo,
      headers: {
        Authorization: `Bearer ${llave}`,
        'X-Runway-Version': VERSION,
        Accept: 'application/json',
        ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
      },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorRunway('RUNWAY_SIN_CONEXION', 'No pudimos conectar con el servicio de video. Intenta de nuevo.', {
      reintentable: true,
      detalle: err?.name === 'AbortError' ? 'tiempo de espera agotado' : String(err?.cause?.code ?? err?.message ?? err).slice(0, 120),
    });
  } finally {
    clearTimeout(reloj);
  }
  let json = null;
  try {
    json = r.status === 204 ? {} : await r.json();
  } catch {
    // sin JSON
  }
  if (r.status < 200 || r.status >= 300) throw traducir(r.status, json);
  return json ?? {};
}

/** Pide un video desde la foto. Devuelve el id de la tarea en Runway. UNA llamada. */
export async function crearVideo({ imagen, prompt, segundos }, opciones) {
  const r = await pedirRunway(
    'POST',
    '/v1/image_to_video',
    { model: MODELO, promptImage: imagen, promptText: String(prompt).slice(0, 1000), ratio: PROPORCION_VERTICAL, duration: segundos },
    opciones,
  );
  if (!r.id) throw new ErrorRunway('RUNWAY_FALLO', 'El servicio de video no respondió como esperábamos. Intenta de nuevo.', { detalle: 'respuesta sin id' });
  return { tareaId: String(r.id) };
}

/**
 * Cómo va una tarea. estado: 'procesando' | 'listo' | 'fallido'.
 * Si está lista trae la URL del video (vence en 24 a 48 horas).
 */
export async function consultarVideo(tareaId, opciones) {
  const r = await pedirRunway('GET', `/v1/tasks/${encodeURIComponent(tareaId)}`, null, opciones);
  switch (r.status) {
    case 'SUCCEEDED': {
      const url = Array.isArray(r.output) ? r.output.find((u) => typeof u === 'string' && u.startsWith('https://')) : null;
      return url ? { estado: 'listo', url } : { estado: 'fallido', falla: 'Runway terminó sin video', codigo: 'SIN_SALIDA' };
    }
    case 'FAILED':
      return { estado: 'fallido', falla: String(r.failure ?? 'falló').slice(0, 300), codigo: r.failureCode ? String(r.failureCode).slice(0, 80) : null };
    case 'CANCELLED':
      return { estado: 'fallido', falla: 'cancelado', codigo: 'CANCELLED' };
    default: // PENDING, THROTTLED, RUNNING
      return { estado: 'procesando', progreso: typeof r.progress === 'number' ? r.progress : null };
  }
}

export async function cancelarVideo(tareaId, opciones) {
  await pedirRunway('DELETE', `/v1/tasks/${encodeURIComponent(tareaId)}`, null, opciones);
}

/** La fuente real. Las pruebas pasan otra con la misma forma, que no llama a nadie. */
export const runwayReal = {
  lista: () => runwayConfigurado(),
  crearVideo: (p) => crearVideo(p),
  consultarVideo: (id) => consultarVideo(id),
  cancelarVideo: (id) => cancelarVideo(id),
};

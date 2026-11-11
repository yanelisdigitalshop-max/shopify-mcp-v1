// Conexión con la API REST de FastMoss (datos de TikTok Shop).
//
// Verificado en la documentación oficial (developers.fastmoss.com, 11 nov 2026):
//   - Dirección: https://openapi.fastmoss.com. Todas las peticiones son POST con JSON.
//   - Autenticación: cabecera "Authorization: Bearer <client_secret>".
//   - Respuesta: { code, msg, data, request_id, timestamp }. Éxito = HTTP 200 y code 0.
//     Códigos: 10001 parámetros, 20001 no encontrado, 30001 sin permiso,
//     30002 límite de datos superado, 30003 demasiadas peticiones, 40001 error del servicio.
//   - Precio: /product/v1/search y /product/v1/rank/topSelling cuestan 0,01 USD por
//     llamada con pagesize de hasta 10. Si no hay resultados, no se cobra.
//
// La llave es de la dueña y vive SOLO en la variable de entorno
// VENDIVA_FASTMOSS_CLIENT_SECRET del servidor. Nunca se muestra ni se registra.
// Nunca se reintenta solo: cada llamada cuesta, y "una búsqueda = una llamada".

const BASE = 'https://openapi.fastmoss.com';
const ESPERA_MS = 20000;
export const RESULTADOS_POR_LLAMADA = 10; // el precio base cubre hasta 10
export const REGION = 'US';

export class ErrorFastmoss extends Error {
  constructor(codigo, mensaje, { reintentable = false, detalle } = {}) {
    super(mensaje);
    this.name = 'ErrorFastmoss';
    this.codigo = codigo;
    this.reintentable = reintentable;
    this.detalle = detalle; // para el registro del servidor (nunca la llave)
  }
}

const leerLlave = (env = process.env) => env.VENDIVA_FASTMOSS_CLIENT_SECRET?.trim() || null;
export const fastmossConfigurado = (env = process.env) => Boolean(leerLlave(env));

function traducir(estadoHttp, codigo, msg) {
  const detalle = `HTTP ${estadoHttp}, code ${codigo ?? '-'}${msg ? `, ${String(msg).slice(0, 120)}` : ''}`;
  if (estadoHttp === 401 || estadoHttp === 403 || codigo === 30001) {
    return new ErrorFastmoss('FASTMOSS_SIN_PERMISO', 'El buscador no está disponible en este momento. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (codigo === 30002) {
    return new ErrorFastmoss('FASTMOSS_SIN_SALDO', 'El buscador llegó a su límite de consultas por ahora. Ya quedó anotado para revisarlo.', { detalle });
  }
  if (estadoHttp === 429 || codigo === 30003) {
    return new ErrorFastmoss('FASTMOSS_OCUPADO', 'El buscador está muy ocupado. Intenta de nuevo en un minuto.', { reintentable: true, detalle });
  }
  if (codigo === 10001) {
    return new ErrorFastmoss('FASTMOSS_PETICION', 'No pudimos hacer esa búsqueda. Prueba con otras palabras.', { detalle });
  }
  return new ErrorFastmoss('FASTMOSS_FALLO', 'El buscador tuvo un problema. Intenta de nuevo en un momento.', { reintentable: true, detalle });
}

/** Una llamada a FastMoss. Devuelve `data`. */
export async function llamarFastmoss(ruta, cuerpo, { env = process.env, pedir = fetch } = {}) {
  const llave = leerLlave(env);
  if (!llave) {
    throw new ErrorFastmoss('FASTMOSS_SIN_LLAVE', 'El buscador todavía no está conectado. Falta poner la llave de FastMoss en la configuración del servidor.');
  }

  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), ESPERA_MS);
  let r;
  try {
    r = await pedir(`${BASE}${ruta}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
  } catch (err) {
    throw new ErrorFastmoss('FASTMOSS_SIN_CONEXION', 'No pudimos conectar con el buscador. Revisa tu internet e intenta de nuevo.', {
      reintentable: true,
      detalle: err?.name === 'AbortError' ? 'tiempo de espera agotado' : String(err?.cause?.code ?? err?.message ?? err).slice(0, 120),
    });
  } finally {
    clearTimeout(reloj);
  }

  let json = null;
  try {
    json = await r.json();
  } catch {
    // respuesta sin JSON
  }
  if (r.status !== 200 || !json || json.code !== 0) throw traducir(r.status, json?.code, json?.msg ?? json?.message);
  return json.data ?? {};
}

// ── Lo que devuelve FastMoss, en el formato de Vendiva ─────────────────────────

const entero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);

/** "12.5%" -> 12.5. Solo se acepta el formato con %, que es el que documenta la búsqueda. */
function comisionPct(v) {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d+(?:[.,]\d+)?)\s*%$/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

const segura = (url) => (typeof url === 'string' && /^https:\/\/\S+$/i.test(url) ? url : null);

/** Enlace del producto en TikTok: el que da FastMoss o, si viene vacío, el formato público de TikTok Shop. */
function enlaceTikTok(p) {
  if (segura(p.tiktok_url)) return p.tiktok_url;
  return /^\d{6,25}$/.test(String(p.product_id ?? '')) ? `https://www.tiktok.com/view/product/${p.product_id}` : null;
}

export function productoDeBusqueda(p) {
  return {
    id: String(p.product_id),
    titulo: String(p.title ?? '').trim(),
    precio: typeof p.price === 'string' ? p.price.trim() : null,
    precioNumero: Number.isFinite(p.floor_price) ? p.floor_price : null,
    ventas7Dias: entero(p.day7_units_sold),
    ventasTotales: entero(p.total_units_sold),
    comisionPct: comisionPct(p.commission_rate),
    tienda: p.shop?.name ? String(p.shop.name) : null,
    calificacion: Number.isFinite(p.product_rating) ? p.product_rating : null,
    imagen: segura(p.cover),
    enlace: enlaceTikTok(p),
  };
}

export function productoDeRanking(p) {
  return {
    id: String(p.product_id),
    titulo: String(p.title ?? '').trim(),
    precio: typeof p.real_price === 'string' ? p.real_price.trim() : null,
    ventasSemana: entero(p.units_sold),
    ventasTotales: entero(p.total_units_sold),
    crecimiento: entero(p.growth_rate),
    tienda: p.shop?.name ? String(p.shop.name) : null,
    imagen: segura(p.cover),
    enlace: enlaceTikTok(p),
  };
}

// ── Las dos consultas que usa Vendiva ──────────────────────────────────────────

/** Buscador: UNA llamada, máximo 10 resultados, productos a la venta en EE. UU., los más vendidos en 7 días primero. */
export async function buscarProductos(consulta, opciones) {
  const data = await llamarFastmoss(
    '/product/v1/search',
    {
      keywords: consulta,
      filter: { region: REGION, off_shelves: 0 },
      orderby: [{ field: 'day7_units_sold', order: 'desc' }],
      page: 1,
      pagesize: RESULTADOS_POR_LLAMADA,
    },
    opciones,
  );
  const lista = Array.isArray(data.list) ? data.list : [];
  return { total: entero(data.total) ?? lista.length, productos: lista.slice(0, RESULTADOS_POR_LLAMADA).map(productoDeBusqueda).filter((p) => p.titulo) };
}

/** Tendencias: los 10 más vendidos de una semana en EE. UU. UNA llamada. semanaFastmoss = 'AAAA-SS'. */
export async function masVendidosDeLaSemana(semanaFastmoss, opciones) {
  const data = await llamarFastmoss(
    '/product/v1/rank/topSelling',
    {
      filter: { region: REGION, date_info: { type: 'week', value: semanaFastmoss } },
      orderby: [{ field: 'units_sold', order: 'desc' }],
      page: 1,
      pagesize: RESULTADOS_POR_LLAMADA,
    },
    opciones,
  );
  const lista = Array.isArray(data.list) ? data.list : [];
  return { productos: lista.slice(0, RESULTADOS_POR_LLAMADA).map(productoDeRanking).filter((p) => p.titulo) };
}

/** La fuente real. Las pruebas pasan otra con la misma forma, que no llama a nadie. */
export const fastmossReal = {
  lista: () => fastmossConfigurado(),
  buscarProductos: (consulta) => buscarProductos(consulta),
  masVendidosDeLaSemana: (semana) => masVendidosDeLaSemana(semana),
};

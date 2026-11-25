// Parte 4: videos con IA (Runway Gen-4 Turbo) desde la foto del producto.
//
// Por producto: 3 videos cortos y 3 videos desde la foto, de 10 segundos, verticales.
//   - Cada video cuesta 20 créditos de VIDEO. Gratis tiene 1 video corto gratis al mes.
//   - Antes de crear, ella confirma el costo en el aviso (costoAceptado; 0 si es el gratis).
//   - Runway tarda de 1 a 5 minutos: se pide, se guarda la tarea y un revisor en segundo
//     plano lo recoge cuando está listo. Ella puede salir y volver.
//   - Si algo falla (la IA, Runway, o tarda demasiado) se devuelven los créditos o el
//     video gratis.
//   - Se guarda solo el ENLACE que da Runway (vence en 24 a 48 horas); al verlo se pide
//     uno nuevo si hace falta. El archivo no se guarda en el servidor de Vendiva: al
//     descargarlo pasa directo de Runway al teléfono de ella.

import crypto from 'node:crypto';
import { DURACION_VIDEO_SEGUNDOS, LIMITES_GRATIS, TIPOS_VIDEO, planFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorRunway } from '../fuentes/runway.js';
import { ErrorIA } from '../ia/claude.js';
import { generarPlanVideo } from '../ia/guionista.js';
import { traducirErrorIA, unaALaVez } from './creaciones.js';
import { cobrar, devolverPorReferencia, renovarSiToca } from './creditos.js';
import { anotarHistorial, videoPublico } from './estado.js';

const ESPERA_MAXIMA_MIN = 30; // si Runway no termina en 30 minutos, se da por fallido y se devuelve
const PREPARANDO_MAXIMO_MIN = 10;
const RENOVAR_ENLACE_HORAS = 20; // los enlaces de Runway vencen entre 24 y 48 horas

/** ¿Este video corto entra en el video gratis del mes? Solo plan Gratis, solo videos cortos. */
function esGratis(usuaria, tipo) {
  return planFrenaEnCero(usuaria.plan) && tipo === 'corto' && LIMITES_GRATIS.videoGratisMes > 0 && !usuaria.video_gratis_usado;
}

/** Deshace el cobro (o el video gratis) y deja el video como fallido. Seguro de repetir. */
async function anular(db, video, falla) {
  await db.tx(async (t) => {
    const fila = (await t.query('select * from videos where id = $1 for update', [video.id])).rows[0];
    if (!fila || fila.estado === 'fallido' || fila.estado === 'listo') return;
    await t.query('select 1 from usuarias where id = $1 for update', [fila.usuaria_id]);
    await devolverPorReferencia(t, fila.usuaria_id, fila.id);
    if (fila.gratis) await t.query('update usuarias set video_gratis_usado = false where id = $1', [fila.usuaria_id]);
    await t.query("update videos set estado = 'fallido', falla = $2, creditos_cobrados = 0, actualizado_en = now() where id = $1", [fila.id, falla]);
  });
}

const sinCargo = (gratis) => (gratis ? 'Tu video gratis del mes sigue disponible.' : 'No se gastó ningún crédito.');

// ── Crear ──────────────────────────────────────────────────────────────────────

export async function crearVideo({ db, ia, runway, reloj, usuariaId, productoId, tipo, indice, costoAceptado }) {
  if (!runway.lista()) {
    throw new ErrorApp(503, 'VIDEO_NO_DISPONIBLE', 'Los videos todavía no están conectados. Ya quedó anotado para revisarlo.');
  }
  if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);

  return unaALaVez(usuariaId, async () => {
    const id = crypto.randomUUID();

    // 1. Revisar, confirmar el costo y apartarlo (o usar el video gratis).
    const pedido = await db.tx(async (t) => {
      const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
      if (!fila) throw sinSesion();
      const usuaria = await renovarSiToca(t, fila, reloj());

      const producto = (await t.query('select * from productos where id = $1 and usuaria_id = $2 and not oculto', [productoId, usuariaId])).rows[0];
      if (!producto) throw noEncontrado('Ese producto');
      if (!producto.imagen_url) {
        throw new ErrorApp(422, 'SIN_FOTO', 'Este producto no tiene foto. Los videos salen de la foto que trae TikTok Shop: guárdalo desde el buscador.');
      }
      const enCurso = await t.query(
        "select 1 from videos where producto_id = $1 and tipo = $2 and indice = $3 and estado in ('preparando', 'procesando')",
        [productoId, tipo, indice],
      );
      if (enCurso.rows.length) throw new ErrorApp(409, 'VIDEO_EN_PROCESO', 'Este video ya se está creando. Te avisamos cuando esté listo.');

      const gratis = esGratis(usuaria, tipo);
      const costo = gratis ? 0 : TIPOS_VIDEO[tipo].costo;
      if (costoAceptado !== costo) {
        throw new ErrorApp(409, 'FALTA_CONFIRMAR', gratis ? 'Antes de crear hay que confirmar el video gratis.' : `Antes de crear hay que confirmar el costo: ${costo} créditos de video.`, {
          datos: { costo, gratis },
        });
      }

      let cobrado = 0;
      if (gratis) {
        await t.query('update usuarias set video_gratis_usado = true where id = $1', [usuariaId]);
      } else {
        cobrado = (await cobrar(t, usuaria, { costo, motivo: `video_${tipo}`, referencia: id, tipo: 'video' })).total;
      }
      await t.query(
        `insert into videos (id, usuaria_id, producto_id, tipo, indice, estado, duracion, gratis, creditos_cobrados, imagen_url)
         values ($1, $2, $3, $4, $5, 'preparando', $6, $7, $8, $9)`,
        [id, usuariaId, productoId, tipo, indice, DURACION_VIDEO_SEGUNDOS, gratis, cobrado, producto.imagen_url],
      );
      const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
      return { producto, perfil, gratis };
    });

    // 2. Claude escribe el prompt y el guion; 3. se le pide el video a Runway (una vez).
    try {
      const plan = await generarPlanVideo(ia, { perfil: pedido.perfil, producto: pedido.producto, tipo, indice, segundos: DURACION_VIDEO_SEGUNDOS, ahora: reloj() });
      await db.query('update videos set prompt = $2, guion = $3::jsonb, actualizado_en = now() where id = $1', [
        id,
        plan.contenido.prompt,
        JSON.stringify({ titulo: plan.contenido.titulo, conCamara: plan.contenido.conCamara, sinCamara: plan.contenido.sinCamara, textoEnPantalla: plan.contenido.textoEnPantalla }),
      ]);
      const { tareaId } = await runway.crearVideo({ imagen: pedido.producto.imagen_url, prompt: plan.contenido.prompt, segundos: DURACION_VIDEO_SEGUNDOS });
      await db.query("update videos set estado = 'procesando', tarea_id = $2, actualizado_en = now() where id = $1", [id, tareaId]);
    } catch (err) {
      console.error(`[video] crear falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
      await anular(db, { id }, err.message ?? 'falló');
      if (err instanceof ErrorRunway) {
        throw new ErrorApp(err.codigo === 'RUNWAY_PETICION' ? 422 : 503, err.codigo, `${err.message} ${sinCargo(pedido.gratis)}`);
      }
      const e = traducirErrorIA(err, false);
      throw new ErrorApp(e.estado, e.codigo, `${e.message} ${sinCargo(pedido.gratis)}`);
    }

    await db.tx((t) => anotarHistorial(t, usuariaId, 'video', { tipo, indice, productoId, nombre: pedido.producto.nombre, gratis: pedido.gratis }));
    const fila = (await db.query('select * from videos where id = $1', [id])).rows[0];
    return videoPublico(fila);
  });
}

// ── Revisor en segundo plano ───────────────────────────────────────────────────

/** Revisa los videos que Runway está haciendo. Se llama cada pocos segundos desde el servidor. */
export async function revisarVideos({ db, runway, reloj = () => new Date() }) {
  const ahora = reloj().getTime();
  // Por turnos: primero los que llevan más tiempo sin revisarse, para que ninguno se quede esperando.
  const { rows } = await db.query(
    "select * from videos where estado in ('preparando', 'procesando') order by coalesce(revisado_en, creado_en) limit 25",
  );
  for (const v of rows) {
    await db.query('update videos set revisado_en = $2 where id = $1', [v.id, new Date(ahora)]);
    const minutos = (ahora - new Date(v.creado_en).getTime()) / 60000;
    if (v.estado === 'preparando') {
      // Quedó a medias (por ejemplo, el servidor se reinició mientras se creaba).
      if (minutos > PREPARANDO_MAXIMO_MIN) await anular(db, v, 'No se pudo terminar de pedir el video.');
      continue;
    }
    let r;
    try {
      r = await runway.consultarVideo(v.tarea_id);
    } catch (err) {
      console.error(`[video] consultar ${v.id} falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
      if (minutos > ESPERA_MAXIMA_MIN) await anular(db, v, 'El video tardó demasiado.');
      continue;
    }
    if (r.estado === 'listo') {
      await db.query("update videos set estado = 'listo', video_url = $2, url_obtenida_en = $3, actualizado_en = now() where id = $1 and estado = 'procesando'", [
        v.id,
        r.url,
        new Date(ahora),
      ]);
    } else if (r.estado === 'fallido') {
      console.error(`[video] Runway falló ${v.id}: ${r.codigo ?? ''} ${r.falla ?? ''}`);
      await anular(db, v, 'Runway no pudo crear este video con la foto del producto.');
    } else if (minutos > ESPERA_MAXIMA_MIN) {
      runway.cancelarVideo(v.tarea_id).catch(() => {});
      await anular(db, v, 'El video tardó demasiado.');
    }
  }
}

export function iniciarRevisorVideos(contexto, cadaMs = 10000) {
  let ocupado = false;
  const reloj = setInterval(async () => {
    if (ocupado || !contexto.runway.lista()) return;
    ocupado = true;
    try {
      await revisarVideos(contexto);
    } catch (err) {
      console.error('[video] revisor:', err.message);
    } finally {
      ocupado = false;
    }
  }, cadaMs);
  reloj.unref();
  return () => clearInterval(reloj);
}

// ── Ver ────────────────────────────────────────────────────────────────────────

const videoVencido = () =>
  new ErrorApp(410, 'VIDEO_VENCIDO', 'Este video ya no está disponible en el servicio de video. Puedes crearlo de nuevo.');

/**
 * El enlace para ver o descargar el video. Si el de Runway ya está viejo (o `forzar`),
 * pide uno nuevo con el id de la tarea.
 */
export async function enlaceVideo({ db, runway, reloj, usuariaId, videoId, forzar = false }) {
  const v = (await db.query("select * from videos where id = $1 and usuaria_id = $2 and estado = 'listo'", [videoId, usuariaId])).rows[0];
  if (!v) throw noEncontrado('Ese video');
  const horas = (reloj().getTime() - new Date(v.url_obtenida_en).getTime()) / 3600000;
  if (!forzar && horas < RENOVAR_ENLACE_HORAS) return v.video_url;

  try {
    const r = await runway.consultarVideo(v.tarea_id);
    if (r.estado !== 'listo') throw new Error('sin video');
    await db.query('update videos set video_url = $2, url_obtenida_en = $3, actualizado_en = now() where id = $1', [v.id, r.url, reloj()]);
    return r.url;
  } catch {
    throw videoVencido();
  }
}

// ── Descargar ──────────────────────────────────────────────────────────────────

const MAXIMO_BYTES = 200 * 1024 * 1024;
const sinAcentos = (t) =>
  String(t)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

/**
 * Abre el archivo del video en Runway para pasarlo directo al teléfono de ella.
 * El archivo NO se guarda en el servidor de Vendiva: solo pasa.
 * Si el enlace guardado ya no sirve, pide uno nuevo una vez; si Runway ya borró la tarea, VIDEO_VENCIDO.
 */
export async function abrirDescarga({ db, runway, reloj, usuariaId, videoId }) {
  const fila = (
    await db.query(
      "select v.tipo, v.indice, p.nombre from videos v join productos p on p.id = v.producto_id where v.id = $1 and v.usuaria_id = $2 and v.estado = 'listo'",
      [videoId, usuariaId],
    )
  ).rows[0];
  if (!fila) throw noEncontrado('Ese video');

  const intentar = async (url) => {
    try {
      const r = await runway.bajarArchivo(url);
      const largo = Number(r.headers.get('content-length'));
      if (r.ok && r.body && !(largo > MAXIMO_BYTES)) return r;
      r.body?.cancel?.().catch?.(() => {});
    } catch {
      // sin conexión con Runway: se prueba con un enlace nuevo
    }
    return null;
  };

  let archivo = await intentar(await enlaceVideo({ db, runway, reloj, usuariaId, videoId }));
  if (!archivo) archivo = await intentar(await enlaceVideo({ db, runway, reloj, usuariaId, videoId, forzar: true }));
  if (!archivo) throw videoVencido();

  const tipo = fila.tipo === 'corto' ? 'video-corto' : 'video-desde-foto';
  return {
    archivo,
    nombreArchivo: `vendiva-${sinAcentos(fila.nombre) || 'producto'}-${tipo}-${fila.indice}.mp4`,
  };
}

/** Ya lo descargó completo: deja de mostrarse la advertencia. */
export async function marcarDescargado(db, { usuariaId, videoId, ahora }) {
  await db.query('update videos set descargado_en = coalesce(descargado_en, $3), actualizado_en = now() where id = $1 and usuaria_id = $2', [
    videoId,
    usuariaId,
    ahora,
  ]);
}

// La voz de cada video (Parte 4). Los videos de Runway salen sin sonido.
//
//   - Voz real (la principal): ella graba su voz en la app. Gratis, sin créditos y sin límite.
//   - Voz de IA (ElevenLabs): narra el guion del video con una voz femenina en español.
//       * Cuesta 2 créditos de TEXTO, siempre con el aviso confirmado antes (costoAceptado).
//       * Plan Gratis: 3 al mes con sus créditos de texto. Pasadas las 3 se frena hasta el
//         mes siguiente o hasta subir de plan. Los paquetes son de video: no pagan la voz
//         (decisión de la dueña, 27 nov 2026).
//       * Planes de pago: sin límite; los créditos de texto siguen su regla (no frenan).
//       * Si ElevenLabs falla, se devuelve todo y el uso no cuenta.
//   - Cada video tiene una sola voz: una nueva reemplaza a la anterior.
//   - Al cambiar la voz, el video vuelve a quedar "sin descargar" (el archivo nuevo trae la voz).

import crypto from 'node:crypto';
import { MOTOR_VOZ } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorVoz } from '../fuentes/elevenlabs.js';
import { unaALaVez } from './creaciones.js';
import { cobrar, devolverPorReferencia, pagoVozIA, proximaRenovacion, renovarSiToca } from './creditos.js';

/** '2026-12-01' -> '1 de diciembre' */
function fechaCorta(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}
import { anotarHistorial } from './estado.js';
import { TIPOS_AUDIO } from './mezcla.js';

export const AUDIO_MAXIMO_BYTES = 3 * 1024 * 1024;
const AUDIO_MINIMO_BYTES = 1000;

/** El texto que narra la IA: lo que "se escucha" en el guion sin cámara (voz encima del video). */
export function narracionDe(guion) {
  const partes = (guion?.sinCamara ?? []).map((p) => String(p.seEscucha ?? '').trim()).filter(Boolean);
  return partes
    .join(' ')
    .replace(/\[[^\]]*\]/g, '') // nada de [marcas] entre corchetes
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

async function videoListoDe(t, usuariaId, videoId, { bloquear = false } = {}) {
  const v = (
    await t.query(`select * from videos where id = $1 and usuaria_id = $2${bloquear ? ' for update' : ''}`, [videoId, usuariaId])
  ).rows[0];
  if (!v) throw noEncontrado('Ese video');
  if (v.estado !== 'listo') throw new ErrorApp(409, 'VIDEO_NO_LISTO', 'La voz se pone cuando el video ya está listo.');
  return v;
}

async function guardarVoz(t, { usuariaId, videoId, tipo, audio, mime, texto = null, proveedor = null, modelo = null, vozId = null, creditos = 0, id = crypto.randomUUID() }) {
  await t.query('delete from voces where video_id = $1', [videoId]);
  await t.query(
    `insert into voces (id, usuaria_id, video_id, tipo, audio, mime, bytes, texto, proveedor, modelo, voz_id, creditos_cobrados)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [id, usuariaId, videoId, tipo, audio, mime, audio.length, texto, proveedor, modelo, vozId, creditos],
  );
  // El archivo que bajó antes no tenía esta voz: hay que descargarlo otra vez.
  await t.query('update videos set descargado_en = null, actualizado_en = now() where id = $1', [videoId]);
}

/** Voz real: ella la grabó en la app. No cuesta nada. */
export async function guardarVozReal({ db, usuariaId, videoId, audio, mime }) {
  const tipoLimpio = String(mime ?? '').split(';')[0].trim().toLowerCase();
  if (!TIPOS_AUDIO.includes(tipoLimpio)) {
    throw new ErrorApp(415, 'AUDIO_INVALIDO', 'No pudimos leer esa grabación. Graba otra vez, por favor.');
  }
  if (!Buffer.isBuffer(audio) || audio.length < AUDIO_MINIMO_BYTES) {
    throw new ErrorApp(422, 'AUDIO_VACIO', 'La grabación salió vacía. Revisa que el micrófono esté permitido y graba otra vez.');
  }
  await db.tx(async (t) => {
    await videoListoDe(t, usuariaId, videoId, { bloquear: true });
    await guardarVoz(t, { usuariaId, videoId, tipo: 'real', audio, mime: tipoLimpio });
    await anotarHistorial(t, usuariaId, 'voz', { videoId, tipo: 'real' });
  });
}

const sinCargo = 'No se gastó ningún crédito y este uso no cuenta.';

/** Voz de IA (ElevenLabs): con el costo aceptado en el aviso. Si falla, no se cobra. */
export async function crearVozIA({ db, voz, reloj, usuariaId, videoId, costoAceptado }) {
  if (!voz.lista()) {
    throw new ErrorApp(503, 'VOZ_NO_DISPONIBLE', 'La voz de IA todavía no está conectada. Mientras tanto puedes grabar tu propia voz, que es gratis.');
  }

  return unaALaVez(usuariaId, async () => {
    const id = crypto.randomUUID();

    // 1. Revisar, confirmar el costo y apartarlo.
    const pedido = await db.tx(async (t) => {
      const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
      if (!fila) throw sinSesion();
      const usuaria = await renovarSiToca(t, fila, reloj());
      const video = await videoListoDe(t, usuariaId, videoId);
      const texto = narracionDe(video.guion);
      if (!texto) throw new ErrorApp(422, 'SIN_GUION', 'Este video no tiene guion para narrar. Graba tu voz o crea el video otra vez.');

      const pago = pagoVozIA(usuaria);
      if (pago.agotadas) {
        throw new ErrorApp(
          402,
          'LIMITE_VOCES_IA',
          `Ya usaste tus ${pago.maxMes} voces de IA de este mes. Vuelven el ${fechaCorta(proximaRenovacion(usuaria.periodo_creditos))}, o sube de plan para usarla sin límite. Grabar tu propia voz sigue siendo gratis.`,
          { datos: { usadas: pago.usadasMes, maximo: pago.maxMes, renuevaEl: proximaRenovacion(usuaria.periodo_creditos) }, reintentable: false },
        );
      }
      if (costoAceptado !== pago.costo) {
        throw new ErrorApp(409, 'FALTA_CONFIRMAR', `Antes de crear hay que confirmar el costo: ${pago.costo} créditos.`, {
          datos: { costo: pago.costo, bolsa: pago.bolsa },
        });
      }
      const cobro = await cobrar(t, usuaria, { costo: pago.costo, motivo: 'voz_ia', referencia: id, tipo: pago.bolsa });
      await t.query('update usuarias set voces_ia_mes = voces_ia_mes + 1 where id = $1', [usuariaId]);
      return { texto, cobrado: cobro.total };
    });

    // 2. ElevenLabs narra el guion (una vez).
    let resultado;
    try {
      resultado = await voz.generar({ texto: pedido.texto });
    } catch (err) {
      console.error(`[voz] ElevenLabs falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
      await db.tx(async (t) => {
        await devolverPorReferencia(t, usuariaId, id);
        await t.query('update usuarias set voces_ia_mes = greatest(voces_ia_mes - 1, 0) where id = $1', [usuariaId]);
      });
      if (err instanceof ErrorVoz) {
        throw new ErrorApp(err.reintentable ? 503 : 422, err.codigo, `${err.message} ${sinCargo}`);
      }
      throw new ErrorApp(503, 'VOZ_FALLO', `El servicio de voz tuvo un problema. ${sinCargo}`);
    }

    // 3. Guardar la voz en el video.
    await db.tx(async (t) => {
      await guardarVoz(t, {
        id,
        usuariaId,
        videoId,
        tipo: 'ia',
        audio: resultado.audio,
        mime: resultado.mime,
        texto: pedido.texto,
        proveedor: MOTOR_VOZ.id,
        modelo: resultado.modelo,
        vozId: resultado.vozId,
        creditos: pedido.cobrado,
      });
      await anotarHistorial(t, usuariaId, 'voz', { videoId, tipo: 'ia', creditos: pedido.cobrado });
    });
  });
}

/** El audio de la voz de un video, para escucharlo con el video en la app. */
export async function audioDeVoz(db, { usuariaId, videoId }) {
  const v = (await db.query('select audio, mime from voces where video_id = $1 and usuaria_id = $2', [videoId, usuariaId])).rows[0];
  if (!v) throw noEncontrado('Esa voz');
  return v;
}

/** Quitar la voz: el video vuelve a quedar sin sonido. No devuelve créditos (la voz ya se creó). */
export async function quitarVoz(db, { usuariaId, videoId }) {
  await db.tx(async (t) => {
    const r = await t.query('delete from voces where video_id = $1 and usuaria_id = $2', [videoId, usuariaId]);
    if (r.rowCount) await t.query('update videos set descargado_en = null, actualizado_en = now() where id = $1', [videoId]);
  });
}

/** La voz del video si tiene (para unirla al descargar), o null. */
export async function vozOpcional(db, { usuariaId, videoId }) {
  return (await db.query('select audio, mime from voces where video_id = $1 and usuaria_id = $2', [videoId, usuariaId])).rows[0] ?? null;
}

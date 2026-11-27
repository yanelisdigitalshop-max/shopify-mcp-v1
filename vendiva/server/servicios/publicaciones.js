// Parte 5: Programar. Su calendario de publicaciones.
//
// Ella elige día y hora para uno de sus guiones o de sus videos. Cuando llega
// la hora, Hoy le dice "Te toca publicar" y ella lo marca como publicado.
// Vendiva NO publica en TikTok: ella sube el video a mano.
// Es gratis e ilimitado en todos los planes: no toca créditos.

import crypto from 'node:crypto';
import { PROGRAMAR } from '../../shared/programar.js';
import { ErrorApp, noEncontrado } from '../errores.js';
import { anotarHistorial } from './estado.js';

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

/** La hora elegida tiene que ser de ahora en adelante y no tan lejos. */
function revisarHora(programadaPara, ahora) {
  const fecha = new Date(programadaPara);
  if (Number.isNaN(fecha.getTime())) {
    throw new ErrorApp(400, 'DATOS_INVALIDOS', 'Elige el día y la hora.', { campos: { programadaPara: 'Elige el día y la hora.' } });
  }
  if (fecha.getTime() < ahora.getTime() - PROGRAMAR.toleranciaPasadoMin * MINUTO) {
    const m = 'Esa hora ya pasó. Elige una de ahora en adelante.';
    throw new ErrorApp(400, 'HORA_PASADA', m, { campos: { programadaPara: m } });
  }
  if (fecha.getTime() > ahora.getTime() + PROGRAMAR.diasMaximo * DIA) {
    const m = `Puedes programar hasta ${PROGRAMAR.diasMaximo} días adelante.`;
    throw new ErrorApp(400, 'HORA_LEJANA', m, { campos: { programadaPara: m } });
  }
  return fecha;
}

export function publicacionPublica(p) {
  return {
    id: p.id,
    productoId: p.producto_id,
    productoNombre: p.producto_nombre ?? null,
    tipo: p.tipo,
    creacionId: p.creacion_id,
    numero: p.numero,
    videoId: p.video_id,
    titulo: p.titulo,
    // Lo que necesita a la hora de publicar: el texto y los hashtags del guion.
    texto: p.texto ?? null,
    programadaPara: p.programada_para,
    publicadaEn: p.publicada_en,
    creadoEn: p.creado_en,
  };
}

/** Su calendario para el estado: todas las pendientes y las publicadas de los últimos días. */
export async function agendaDe(t, usuariaId, ahora) {
  const { rows } = await t.query(
    `select p.*, pr.nombre as producto_nombre,
            case when p.tipo = 'guion' then c.contenido->'guiones'->(p.numero - 1) end as guion
       from publicaciones p
       join productos pr on pr.id = p.producto_id and not pr.oculto
       left join creaciones c on c.id = p.creacion_id
      where p.usuaria_id = $1
        and (p.publicada_en is null or p.publicada_en >= $2)
      order by p.programada_para, p.id`,
    [usuariaId, new Date(ahora.getTime() - PROGRAMAR.diasPublicadasVisibles * DIA)],
  );
  const lista = rows.map((r) =>
    publicacionPublica({
      ...r,
      texto: r.guion ? { caption: r.guion.caption, hashtags: r.guion.hashtags, gancho: r.guion.gancho } : null,
    }),
  );
  return {
    pendientes: lista.filter((p) => !p.publicadaEn),
    publicadas: lista.filter((p) => p.publicadaEn).sort((a, b) => new Date(b.publicadaEn) - new Date(a.publicadaEn)),
    maxPendientes: PROGRAMAR.maxPendientes,
  };
}

/** Busca el guion o el video que quiere programar y confirma que es de ella. */
async function buscarQue(t, usuariaId, que) {
  if (que.tipo === 'guion') {
    const c = (
      await t.query(
        `select c.id, c.producto_id, c.contenido from creaciones c
           join productos pr on pr.id = c.producto_id and not pr.oculto
          where c.id = $1 and c.usuaria_id = $2 and c.tipo = 'guiones'`,
        [que.creacionId, usuariaId],
      )
    ).rows[0];
    const guion = c?.contenido?.guiones?.[que.numero - 1];
    if (!guion) throw noEncontrado('Ese guion');
    return { productoId: c.producto_id, titulo: guion.titulo, creacionId: c.id, numero: que.numero, videoId: null };
  }
  const v = (
    await t.query(
      `select v.id, v.producto_id, v.estado, v.tipo, v.indice, v.guion from videos v
         join productos pr on pr.id = v.producto_id and not pr.oculto
        where v.id = $1 and v.usuaria_id = $2`,
      [que.videoId, usuariaId],
    )
  ).rows[0];
  if (!v) throw noEncontrado('Ese video');
  if (v.estado !== 'listo') throw new ErrorApp(409, 'VIDEO_NO_LISTO', 'Ese video todavía no está listo. Prográmalo cuando termine.');
  const nombre = v.tipo === 'corto' ? 'Video corto' : 'Video desde la foto';
  return { productoId: v.producto_id, titulo: v.guion?.titulo ?? `${nombre} ${v.indice}`, creacionId: null, numero: null, videoId: v.id };
}

/**
 * Programa un guion o un video. Si ya estaba programado (y sin publicar),
 * solo cambia la hora: cada uno tiene a lo más una publicación pendiente.
 */
export async function programar(db, { usuariaId, que, programadaPara, ahora }) {
  const fecha = revisarHora(programadaPara, ahora);
  return db.tx(async (t) => {
    // La fila de la usuaria bloqueada: dos toques a la vez no pasan el tope ni duplican.
    await t.query('select id from usuarias where id = $1 for update', [usuariaId]);
    const item = await buscarQue(t, usuariaId, que);

    const existente = (
      await t.query(
        `select * from publicaciones
          where usuaria_id = $1 and publicada_en is null
            and coalesce(creacion_id, video_id) = $2 and coalesce(numero, 0) = $3`,
        [usuariaId, item.creacionId ?? item.videoId, item.numero ?? 0],
      )
    ).rows[0];
    if (existente) {
      const { rows } = await t.query(
        'update publicaciones set programada_para = $2, actualizado_en = $3, notificada_en = null where id = $1 returning *',
        [existente.id, fecha, ahora],
      );
      return { publicacion: publicacionPublica(rows[0]), nueva: false };
    }

    const { n } = (await t.query('select count(*)::int as n from publicaciones where usuaria_id = $1 and publicada_en is null', [usuariaId])).rows[0];
    if (n >= PROGRAMAR.maxPendientes) {
      throw new ErrorApp(
        409,
        'DEMASIADAS_PROGRAMADAS',
        `Ya tienes ${PROGRAMAR.maxPendientes} publicaciones esperando. Publica o quita alguna antes de programar otra.`,
        { reintentable: false },
      );
    }

    const { rows } = await t.query(
      `insert into publicaciones (id, usuaria_id, producto_id, tipo, creacion_id, numero, video_id, titulo, programada_para, creado_en, actualizado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10) returning *`,
      [crypto.randomUUID(), usuariaId, item.productoId, que.tipo, item.creacionId, item.numero, item.videoId, item.titulo, fecha, ahora],
    );
    await anotarHistorial(t, usuariaId, 'publicacion_programada', { titulo: item.titulo, tipo: que.tipo, para: fecha.toISOString() });
    return { publicacion: publicacionPublica(rows[0]), nueva: true };
  });
}

async function suya(t, usuariaId, id) {
  const p = (await t.query('select * from publicaciones where id = $1 and usuaria_id = $2 for update', [id, usuariaId])).rows[0];
  if (!p) throw noEncontrado('Esa publicación');
  return p;
}

/** Cambia la hora de una pendiente, o la marca como publicada (o deshace esa marca). */
export async function cambiarPublicacion(db, { usuariaId, id, cambios, ahora }) {
  return db.tx(async (t) => {
    const p = await suya(t, usuariaId, id);

    if (cambios.programadaPara !== undefined) {
      if (p.publicada_en) throw new ErrorApp(409, 'YA_PUBLICADA', 'Esta ya la marcaste como publicada.');
      const fecha = revisarHora(cambios.programadaPara, ahora);
      await t.query('update publicaciones set programada_para = $2, actualizado_en = $3, notificada_en = null where id = $1', [id, fecha, ahora]);
    }

    if (cambios.publicada === true && !p.publicada_en) {
      await t.query('update publicaciones set publicada_en = $2, actualizado_en = $2 where id = $1', [id, ahora]);
      await anotarHistorial(t, usuariaId, 'publicacion_hecha', { titulo: p.titulo, tipo: p.tipo });
    } else if (cambios.publicada === false && p.publicada_en) {
      // Deshacer: vuelve a pendiente. Si ya tiene otra pendiente para lo mismo, no se puede.
      const otra = (
        await t.query(
          `select 1 from publicaciones where usuaria_id = $1 and publicada_en is null and id <> $2
              and coalesce(creacion_id, video_id) = coalesce($3::uuid, $4::uuid) and coalesce(numero, 0) = $5`,
          [usuariaId, id, p.creacion_id, p.video_id, p.numero ?? 0],
        )
      ).rows[0];
      if (otra) throw new ErrorApp(409, 'YA_PROGRAMADA', 'Ya lo tienes programado otra vez. Cambia la hora de esa.');
      await t.query('update publicaciones set publicada_en = null, actualizado_en = $2 where id = $1', [id, ahora]);
    }
  });
}

export async function quitarPublicacion(db, { usuariaId, id }) {
  return db.tx(async (t) => {
    await suya(t, usuariaId, id);
    await t.query('delete from publicaciones where id = $1', [id]);
  });
}

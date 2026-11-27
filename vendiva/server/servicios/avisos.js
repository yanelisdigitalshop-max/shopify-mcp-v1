// Parte 8: avisos del teléfono «Te toca publicar» (decisión de la dueña, 27 nov 2026).
//
// Cada minuto se buscan las publicaciones de su calendario a las que les llegó la hora y
// todavía no se avisaron. A cada una se le avisa UNA vez, en todos sus teléfonos. Si ella
// cambia la hora, se vuelve a avisar a la hora nueva. Las de hace más de 6 horas no se
// avisan (por ejemplo, si el servidor estuvo apagado): ya las ve en Hoy.
// Vendiva sigue sin publicar nada en TikTok: el aviso solo le recuerda.

import crypto from 'node:crypto';
import { ErrorFcm } from '../fuentes/fcm.js';

const VENTANA_MS = 6 * 3600 * 1000;

export async function guardarDispositivo(db, { usuariaId, token, plataforma }) {
  await db.query(
    `insert into dispositivos (id, usuaria_id, token, plataforma) values ($1, $2, $3, $4)
     on conflict (token) do update set usuaria_id = excluded.usuaria_id, plataforma = excluded.plataforma, actualizado_en = now()`,
    [crypto.randomUUID(), usuariaId, token, plataforma],
  );
}

/** Al cerrar sesión en la app: ese teléfono deja de recibir sus avisos. */
export async function quitarDispositivo(db, { usuariaId, token }) {
  await db.query('delete from dispositivos where token = $1 and usuaria_id = $2', [token, usuariaId]);
}

export async function revisarAvisos({ db, fcm, reloj = () => new Date() }) {
  if (!fcm.lista()) return 0;
  const ahora = reloj();
  const { rows } = await db.query(
    `select p.id, p.usuaria_id, p.titulo, p.tipo, pr.nombre as producto
       from publicaciones p join productos pr on pr.id = p.producto_id and not pr.oculto
      where p.publicada_en is null and p.notificada_en is null
        and p.programada_para <= $1 and p.programada_para > $2
        and exists (select 1 from dispositivos d where d.usuaria_id = p.usuaria_id)
      order by p.programada_para limit 200`,
    [ahora, new Date(ahora.getTime() - VENTANA_MS)],
  );

  let enviados = 0;
  for (const p of rows) {
    // Se marca antes de enviar: con dos servidores a la vez, solo uno la toma.
    const tomada = await db.query('update publicaciones set notificada_en = $2 where id = $1 and notificada_en is null returning id', [p.id, ahora]);
    if (!tomada.rows.length) continue;
    const telefonos = (await db.query('select token from dispositivos where usuaria_id = $1', [p.usuaria_id])).rows;
    for (const { token } of telefonos) {
      try {
        await fcm.enviar({
          token,
          titulo: 'Te toca publicar',
          cuerpo: `${p.tipo === 'video' ? 'Tu video' : 'Tu guion'} «${p.titulo}» de ${p.producto}. Ábrelo en Vendiva y súbelo a TikTok.`,
          datos: { ruta: 'hoy', publicacionId: p.id },
        });
        enviados += 1;
      } catch (err) {
        if (err instanceof ErrorFcm && err.tokenInvalido) await db.query('delete from dispositivos where token = $1', [token]);
        else console.error(`[avisos] no se pudo avisar: ${err.codigo ?? err.message}${err.detalle ? ` — ${err.detalle}` : ''}`);
      }
    }
  }
  return enviados;
}

export function iniciarAvisos(contexto, cadaMs = 60000) {
  let ocupado = false;
  const reloj = setInterval(async () => {
    if (ocupado || !contexto.fcm.lista()) return;
    ocupado = true;
    try {
      await revisarAvisos(contexto);
    } catch (err) {
      console.error('[avisos] revisor:', err.message);
    } finally {
      ocupado = false;
    }
  }, cadaMs);
  reloj.unref();
  return () => clearInterval(reloj);
}

// Sesiones guardadas en la base de datos.
// La cookie lleva un token al azar; en la base solo queda su sha-256, así que
// ni leyendo la base se puede entrar a la cuenta de nadie.

import crypto from 'node:crypto';
import { sinSesion } from '../errores.js';

const DIA_MS = 24 * 60 * 60 * 1000;
const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function leerCookie(req, nombre) {
  const cabecera = req.headers.cookie;
  if (!cabecera) return null;
  for (const parte of cabecera.split(';')) {
    const i = parte.indexOf('=');
    if (i > 0 && parte.slice(0, i).trim() === nombre) return decodeURIComponent(parte.slice(i + 1).trim());
  }
  return null;
}

function opcionesCookie(req, config) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.produccion || req.secure,
    path: '/',
  };
}

export async function abrirSesion(db, config, req, res, usuariaId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const duracion = config.sesion.dias * DIA_MS;
  await db.query('insert into sesiones (id, usuaria_id, token_hash, expira_en) values ($1, $2, $3, $4)', [
    crypto.randomUUID(),
    usuariaId,
    sha256(token),
    new Date(Date.now() + duracion),
  ]);
  res.cookie(config.sesion.nombreCookie, token, { ...opcionesCookie(req, config), maxAge: duracion });
}

export async function cerrarSesion(db, config, req, res) {
  const token = leerCookie(req, config.sesion.nombreCookie);
  if (token) await db.query('delete from sesiones where token_hash = $1', [sha256(token)]);
  res.clearCookie(config.sesion.nombreCookie, opcionesCookie(req, config));
}

/** Middleware: si hay una sesión válida deja req.usuariaId. No rechaza. */
export function cargarSesion(db, config) {
  return async (req, res, next) => {
    req.usuariaId = null;
    const token = leerCookie(req, config.sesion.nombreCookie);
    if (!token) return next();

    const { rows } = await db.query(
      'select id, usuaria_id, ultimo_uso_en from sesiones where token_hash = $1 and expira_en > now()',
      [sha256(token)],
    );
    const sesion = rows[0];
    if (!sesion) return next();

    req.usuariaId = sesion.usuaria_id;

    // Sesión deslizante: si se usó hace más de un día, se renueva otros 30.
    if (Date.now() - new Date(sesion.ultimo_uso_en).getTime() > DIA_MS) {
      const duracion = config.sesion.dias * DIA_MS;
      await db.query('update sesiones set ultimo_uso_en = now(), expira_en = $2 where id = $1', [
        sesion.id,
        new Date(Date.now() + duracion),
      ]);
      res.cookie(config.sesion.nombreCookie, token, { ...opcionesCookie(req, config), maxAge: duracion });
    }
    next();
  };
}

export function exigirSesion(req, _res, next) {
  if (!req.usuariaId) throw sinSesion();
  next();
}

export async function borrarSesionesVencidas(db) {
  await db.query('delete from sesiones where expira_en <= now()');
}

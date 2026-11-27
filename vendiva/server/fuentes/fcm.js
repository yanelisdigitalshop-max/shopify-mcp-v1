// Conexión con Firebase Cloud Messaging (FCM), API HTTP v1, para las notificaciones
// de la app en iPhone y Android (Parte 8).
//
//   - Autenticación: cuenta de servicio de Google (JSON) -> JWT firmado RS256 ->
//     POST https://oauth2.googleapis.com/token -> access_token (dura 1 hora; se reutiliza).
//     Alcance: https://www.googleapis.com/auth/firebase.messaging
//   - Enviar: POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send
//     { message: { token, notification: { title, body }, data, apns, android } }
//   - Un token que ya no sirve devuelve 404 (UNREGISTERED) o 400 INVALID_ARGUMENT: se borra.
//
// La cuenta de servicio es de la dueña y vive SOLO en VENDIVA_FIREBASE_CUENTA_SERVICIO
// (el JSON entero, o en base64). Nunca en el código ni en el chat.

import crypto from 'node:crypto';

const ALCANCE = 'https://www.googleapis.com/auth/firebase.messaging';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const ESPERA_MS = 15000;

export class ErrorFcm extends Error {
  constructor(codigo, mensaje, { tokenInvalido = false, detalle } = {}) {
    super(mensaje);
    this.name = 'ErrorFcm';
    this.codigo = codigo;
    this.tokenInvalido = tokenInvalido;
    this.detalle = detalle;
  }
}

/** Lee la cuenta de servicio (JSON o base64). Devuelve null si no está o está mal. */
export function leerCuentaServicio(env = process.env) {
  const crudo = env.VENDIVA_FIREBASE_CUENTA_SERVICIO?.trim();
  if (!crudo) return null;
  try {
    const texto = crudo.startsWith('{') ? crudo : Buffer.from(crudo, 'base64').toString('utf8');
    const c = JSON.parse(texto);
    if (!c.client_email || !c.private_key || !c.project_id) return null;
    return c;
  } catch {
    return null;
  }
}

const b64url = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');

/** El JWT que se cambia por un access_token de Google (exportado para las pruebas). */
export function firmarJwt(cuenta, ahoraS = Math.floor(Date.now() / 1000)) {
  const cabecera = { alg: 'RS256', typ: 'JWT' };
  const datos = { iss: cuenta.client_email, scope: ALCANCE, aud: URL_TOKEN, iat: ahoraS, exp: ahoraS + 3600 };
  const sinFirma = `${b64url(cabecera)}.${b64url(datos)}`;
  const firma = crypto.createSign('RSA-SHA256').update(sinFirma).sign(cuenta.private_key).toString('base64url');
  return `${sinFirma}.${firma}`;
}

export function crearFcm({ env = process.env, pedir = fetch } = {}) {
  let acceso = null; // { token, vence }

  async function llamar(url, opciones) {
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), ESPERA_MS);
    try {
      return await pedir(url, { ...opciones, signal: control.signal });
    } catch (err) {
      throw new ErrorFcm('FCM_SIN_CONEXION', 'No se pudo conectar con Firebase.', { detalle: String(err?.cause?.code ?? err?.message).slice(0, 120) });
    } finally {
      clearTimeout(t);
    }
  }

  async function tokenDeAcceso(cuenta) {
    if (acceso && acceso.vence > Date.now() + 60000) return acceso.token;
    const r = await llamar(URL_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: firmarJwt(cuenta) }).toString(),
    });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j?.access_token) throw new ErrorFcm('FCM_SIN_PERMISO', 'Firebase no aceptó la cuenta de servicio.', { detalle: `HTTP ${r.status} ${j?.error ?? ''}` });
    acceso = { token: j.access_token, vence: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return acceso.token;
  }

  return {
    lista: () => Boolean(leerCuentaServicio(env)),

    /** Envía un aviso a un teléfono. Lanza ErrorFcm (tokenInvalido=true si hay que borrar el token). */
    async enviar({ token, titulo, cuerpo, datos = {} }) {
      const cuenta = leerCuentaServicio(env);
      if (!cuenta) throw new ErrorFcm('FCM_SIN_LLAVE', 'Faltan las credenciales de Firebase.');
      const r = await llamar(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(cuenta.project_id)}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenDeAcceso(cuenta)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: titulo, body: cuerpo },
            data: Object.fromEntries(Object.entries(datos).map(([k, v]) => [k, String(v)])),
            android: { priority: 'high', notification: { channel_id: 'avisos' } },
            apns: { payload: { aps: { sound: 'default' } } },
          },
        }),
      });
      if (r.ok) return;
      const j = await r.json().catch(() => null);
      const estado = j?.error?.status ?? '';
      const invalido = r.status === 404 || estado === 'UNREGISTERED' || (r.status === 400 && estado === 'INVALID_ARGUMENT');
      throw new ErrorFcm('FCM_FALLO', 'Firebase no entregó el aviso.', { tokenInvalido: invalido, detalle: `HTTP ${r.status} ${estado}` });
    },
  };
}

export const fcmReal = crearFcm();

// Las contraseñas nunca se guardan: se guarda un hash scrypt con sal propia.
// Formato: scrypt$N$r$p$sal$hash  (así se puede subir el costo sin romper las viejas).

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
const LARGO = 64;

function derivar(contrasena, sal, { N, r, p }) {
  return scrypt(contrasena.normalize('NFKC'), sal, LARGO, { N, r, p, maxmem: 256 * N * r });
}

export async function crearHash(contrasena, parametros) {
  const sal = crypto.randomBytes(16);
  const hash = await derivar(contrasena, sal, parametros);
  const { N, r, p } = parametros;
  return ['scrypt', N, r, p, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

export async function verificarHash(contrasena, guardado) {
  try {
    const [esquema, N, r, p, sal, hash] = String(guardado).split('$');
    if (esquema !== 'scrypt') return false;
    const esperado = Buffer.from(hash, 'base64url');
    const calculado = await derivar(contrasena, Buffer.from(sal, 'base64url'), {
      N: Number(N),
      r: Number(r),
      p: Number(p),
    });
    return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
  } catch {
    return false;
  }
}

/** true si el hash se creó con un costo menor al actual y conviene rehacerlo al entrar. */
export function hashDesactualizado(guardado, { N, r, p }) {
  const [, n0, r0, p0] = String(guardado).split('$').map(Number);
  return n0 < N || r0 < r || p0 < p;
}

// Copias de seguridad de la base de datos (decisión de la dueña, 27 nov 2026).
//
//   npm run respaldo                 hace una copia ahora (Railway lo corre cada noche)
//   npm run respaldo -- --lista      lista las copias guardadas
//
// Cómo es cada copia:
//   1. pg_dump de TODA la base (formato "custom" de PostgreSQL, ya comprimido).
//   2. Cifrada con AES-256-GCM con la llave VENDIVA_RESPALDO_CLAVE (32 bytes en base64).
//      La base tiene correos, teléfonos y grabaciones de voz: el archivo guardado no se puede
//      leer sin esa llave. SI LA LLAVE SE PIERDE, LAS COPIAS NO SIRVEN: la dueña la guarda
//      también fuera de Railway (por ejemplo, en su gestor de contraseñas).
//   3. Se sube a un bucket de Railway (compatible con S3) con las variables que Railway da:
//      ENDPOINT, REGION, BUCKET, ACCESS_KEY_ID y SECRET_ACCESS_KEY.
//   4. Se borran las viejas: quedan las de los últimos 14 días, una por semana de las
//      últimas 8 semanas y una por mes de los últimos 12 meses (el bucket de Railway no
//      tiene reglas de vencimiento propias).
//
// Formato del archivo: "VENDIVA-RESPALDO-1\n" + iv (12 bytes) + datos cifrados + etiqueta GCM (16 bytes).

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';

export const CABECERA = Buffer.from('VENDIVA-RESPALDO-1\n');
const PREFIJO = 'respaldos/';
const DIA = 24 * 3600 * 1000;

export function leerClave(env = process.env) {
  const crudo = env.VENDIVA_RESPALDO_CLAVE?.trim();
  const clave = crudo ? Buffer.from(crudo, 'base64') : null;
  if (!clave || clave.length !== 32) {
    throw new Error('Falta VENDIVA_RESPALDO_CLAVE: 32 bytes en base64. Se crea con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }
  return clave;
}

/** Cifra un flujo: escribe la cabecera, el iv, los datos cifrados y al final la etiqueta. */
export function cifrador(clave) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', clave, iv);
  let primero = true;
  return new Transform({
    transform(trozo, _cod, listo) {
      const salida = c.update(trozo);
      if (primero) {
        primero = false;
        return listo(null, Buffer.concat([CABECERA, iv, salida]));
      }
      listo(null, salida);
    },
    flush(listo) {
      const final = c.final();
      const inicio = primero ? Buffer.concat([CABECERA, iv]) : Buffer.alloc(0);
      listo(null, Buffer.concat([inicio, final, c.getAuthTag()]));
    },
  });
}

/** Descifra un archivo completo (para restaurar). Lanza si la llave no es la correcta o el archivo cambió. */
export function descifrar(datos, clave) {
  if (!datos.subarray(0, CABECERA.length).equals(CABECERA)) throw new Error('Ese archivo no es una copia de Vendiva.');
  const iv = datos.subarray(CABECERA.length, CABECERA.length + 12);
  const etiqueta = datos.subarray(datos.length - 16);
  const cifrado = datos.subarray(CABECERA.length + 12, datos.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', clave, iv);
  d.setAuthTag(etiqueta);
  try {
    return Buffer.concat([d.update(cifrado), d.final()]);
  } catch {
    throw new Error('No se pudo descifrar: la llave no es la de esta copia, o el archivo está dañado.');
  }
}

/** 'respaldos/2026-11-27T08-00-00Z.dump.enc' para una fecha. */
export const nombreDe = (fecha) => `${PREFIJO}${fecha.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '-')}.dump.enc`;
const fechaDe = (nombre) => {
  const m = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/.exec(nombre);
  return m ? new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : null;
};

/**
 * Cuáles copias se borran. Quedan: todas las de los últimos 14 días; la más nueva de cada
 * semana de las últimas 8 semanas; la más nueva de cada mes de los últimos 12 meses.
 */
export function copiasParaBorrar(nombres, ahora = new Date()) {
  const copias = nombres.map((n) => ({ n, f: fechaDe(n) })).filter((x) => x.f).sort((a, b) => b.f - a.f);
  const quedan = new Set();
  const semanas = new Set();
  const meses = new Set();
  for (const { n, f } of copias) {
    const edad = ahora - f;
    if (edad <= 14 * DIA) quedan.add(n);
    const semana = Math.floor(f.getTime() / (7 * DIA));
    if (edad <= 8 * 7 * DIA && !semanas.has(semana)) {
      semanas.add(semana);
      quedan.add(n);
    }
    const mes = f.toISOString().slice(0, 7);
    if (edad <= 366 * DIA && !meses.has(mes)) {
      meses.add(mes);
      quedan.add(n);
    }
  }
  return copias.map((x) => x.n).filter((n) => !quedan.has(n));
}

/** pg_dump de toda la base, como flujo (no pasa por el disco). */
export function volcar(databaseUrl) {
  const p = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-privileges', `--dbname=${databaseUrl}`], { stdio: ['ignore', 'pipe', 'pipe'] });
  let errores = '';
  p.stderr.on('data', (d) => {
    errores += d;
  });
  const terminado = new Promise((ok, mal) => {
    p.on('error', mal);
    p.on('close', (codigo) => (codigo === 0 ? ok() : mal(new Error(`pg_dump terminó con error ${codigo}: ${errores.slice(0, 300)}`))));
  });
  return { flujo: p.stdout, terminado };
}

export async function crearS3(env = process.env) {
  const { S3Client } = await import('@aws-sdk/client-s3');
  const faltan = ['ENDPOINT', 'BUCKET', 'ACCESS_KEY_ID', 'SECRET_ACCESS_KEY'].filter((k) => !env[k]);
  if (faltan.length) throw new Error(`Faltan las variables del bucket: ${faltan.join(', ')}.`);
  return {
    cliente: new S3Client({
      endpoint: env.ENDPOINT,
      region: env.REGION || 'auto',
      credentials: { accessKeyId: env.ACCESS_KEY_ID, secretAccessKey: env.SECRET_ACCESS_KEY },
      forcePathStyle: env.VENDIVA_RESPALDO_PATH_STYLE === '1',
    }),
    bucket: env.BUCKET,
  };
}

export async function listar({ cliente, bucket }) {
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  const nombres = [];
  let token;
  do {
    const r = await cliente.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: PREFIJO, ContinuationToken: token }));
    for (const o of r.Contents ?? []) nombres.push({ nombre: o.Key, bytes: o.Size, fecha: o.LastModified });
    token = r.IsTruncated ? r.NextContinuationToken : undefined;
  } while (token);
  return nombres.sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** Hace una copia y borra las viejas. `subir(nombre, flujo)` y `borrar(nombre)` se pueden cambiar en las pruebas. */
export async function respaldar({ databaseUrl, clave, subir, listarNombres, borrar, ahora = new Date() }) {
  const nombre = nombreDe(ahora);
  const { flujo, terminado } = volcar(databaseUrl);
  const cifrado = flujo.pipe(cifrador(clave));
  await Promise.all([subir(nombre, cifrado), terminado]);
  const viejas = copiasParaBorrar(await listarNombres(), ahora);
  for (const n of viejas) await borrar(n);
  return { nombre, borradas: viejas };
}

/** Restaura una copia en una base. Borra lo que haya en esa base. */
export async function restaurar({ datosCifrados, clave, destinoUrl }) {
  const dump = descifrar(datosCifrados, clave);
  const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vendiva-restaurar-')), 'copia.dump');
  fs.writeFileSync(tmp, dump, { mode: 0o600 });
  try {
    await new Promise((ok, mal) => {
      const p = spawn('pg_restore', ['--clean', '--if-exists', '--no-owner', '--no-privileges', `--dbname=${destinoUrl}`, tmp], { stdio: ['ignore', 'inherit', 'pipe'] });
      let errores = '';
      p.stderr.on('data', (d) => {
        errores += d;
      });
      p.on('error', mal);
      p.on('close', (c) => (c === 0 ? ok() : mal(new Error(`pg_restore terminó con error ${c}: ${errores.slice(0, 300)}`))));
    });
  } finally {
    fs.rmSync(path.dirname(tmp), { recursive: true, force: true });
  }
}

// ── Uso directo ────────────────────────────────────────────────────────────────

async function principal(args) {
  const s3 = await crearS3();
  const { DeleteObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');

  if (args.includes('--lista')) {
    for (const c of await listar(s3)) console.log(`${c.nombre}  ${(c.bytes / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  if (args.includes('--restaurar')) {
    // npm run respaldo -- --restaurar respaldos/2026-...Z.dump.enc --confirmo-borrar-y-restaurar
    // Restaura en VENDIVA_RESTAURAR_EN (otra base), NUNCA sola en DATABASE_URL: primero se revisa la copia.
    const nombre = args[args.indexOf('--restaurar') + 1];
    const destino = process.env.VENDIVA_RESTAURAR_EN;
    if (!nombre?.startsWith(PREFIJO)) throw new Error('Di qué copia: --restaurar respaldos/<fecha>.dump.enc (ver --lista).');
    if (!destino) throw new Error('Pon VENDIVA_RESTAURAR_EN con la base donde restaurar (de preferencia una base nueva, para revisarla antes).');
    if (!args.includes('--confirmo-borrar-y-restaurar')) throw new Error('Restaurar BORRA lo que haya en esa base. Si estás segura, agrega --confirmo-borrar-y-restaurar.');
    const r = await s3.cliente.send(new GetObjectCommand({ Bucket: s3.bucket, Key: nombre }));
    const datos = Buffer.from(await r.Body.transformToByteArray());
    await restaurar({ datosCifrados: datos, clave: leerClave(), destinoUrl: destino });
    console.log(`Copia ${nombre} restaurada.`);
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('Falta DATABASE_URL.');
  const { Upload } = await import('@aws-sdk/lib-storage');
  const r = await respaldar({
    databaseUrl,
    clave: leerClave(),
    subir: (Key, Body) => new Upload({ client: s3.cliente, params: { Bucket: s3.bucket, Key, Body, ContentType: 'application/octet-stream' } }).done(),
    listarNombres: async () => (await listar(s3)).map((c) => c.nombre),
    borrar: (Key) => s3.cliente.send(new DeleteObjectCommand({ Bucket: s3.bucket, Key })),
  });
  console.log(`Copia guardada: ${r.nombre}. Copias viejas borradas: ${r.borradas.length}.`);
}

if (process.argv[1]?.endsWith('respaldo.js')) {
  principal(process.argv.slice(2)).catch((err) => {
    console.error(`[respaldo] ${err.message}`);
    process.exitCode = 1;
  });
}

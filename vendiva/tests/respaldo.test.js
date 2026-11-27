// Copias de seguridad: cifrado, limpieza de copias viejas y una copia y restauración DE VERDAD
// con PostgreSQL (si está instalado en la máquina de pruebas; si no, esa prueba se salta).
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { CABECERA, cifrador, copiasParaBorrar, descifrar, leerClave, nombreDe, respaldar, restaurar } from '../server/scripts/respaldo.js';
import { leerConfig } from '../server/config.js';
import { abrirBase } from '../server/db/index.js';
import { migrar } from '../server/db/migrar.js';

const clave = crypto.randomBytes(32);
const juntar = async (flujo) => {
  const partes = [];
  for await (const p of flujo) partes.push(p);
  return Buffer.concat(partes);
};

test('la llave: 32 bytes en base64, si no, no se respalda', () => {
  assert.throws(() => leerClave({}), /VENDIVA_RESPALDO_CLAVE/);
  assert.throws(() => leerClave({ VENDIVA_RESPALDO_CLAVE: Buffer.alloc(16).toString('base64') }), /32 bytes/);
  assert.equal(leerClave({ VENDIVA_RESPALDO_CLAVE: clave.toString('base64') }).length, 32);
});

test('cifrado: sin la llave no se lee; con otra llave o un byte cambiado, falla', async () => {
  const datos = crypto.randomBytes(300_000);
  const cifrado = await juntar(Readable.from([datos.subarray(0, 1000), datos.subarray(1000)]).pipe(cifrador(clave)));
  assert.ok(cifrado.subarray(0, CABECERA.length).equals(CABECERA));
  assert.ok(!cifrado.includes(datos.subarray(5000, 5032)), 'los datos no aparecen tal cual');
  assert.ok(descifrar(cifrado, clave).equals(datos));
  assert.throws(() => descifrar(cifrado, crypto.randomBytes(32)), /llave/);
  const danado = Buffer.from(cifrado);
  danado[danado.length - 100] ^= 1;
  assert.throws(() => descifrar(danado, clave), /dañado/);
  assert.throws(() => descifrar(Buffer.from('otra cosa'), clave), /no es una copia/);
  // Un flujo vacío también queda bien formado.
  const vacio = await juntar(Readable.from([]).pipe(cifrador(clave)));
  assert.equal(descifrar(vacio, clave).length, 0);
});

test('limpieza: 14 días completos, una por semana por 8 semanas y una por mes por 12 meses', () => {
  const ahora = new Date('2026-11-27T08:00:00Z');
  const nombres = [];
  for (let d = 0; d < 400; d += 1) nombres.push(nombreDe(new Date(ahora - d * 86400000)));
  const borrar = new Set(copiasParaBorrar(nombres, ahora));
  const quedan = nombres.filter((n) => !borrar.has(n));
  for (let d = 0; d <= 14; d += 1) assert.ok(quedan.includes(nombreDe(new Date(ahora - d * 86400000))), `día ${d}`);
  assert.ok(quedan.length < 14 + 1 + 8 + 13 + 2, `quedan ${quedan.length}`);
  assert.ok(quedan.length >= 14 + 8, `quedan ${quedan.length}`);
  assert.ok(!quedan.includes(nombreDe(new Date(ahora - 399 * 86400000))), 'más de un año: se borra');
  assert.deepEqual(copiasParaBorrar(['respaldos/otra-cosa.txt'], ahora), [], 'no toca archivos que no son copias');
  assert.equal(nombreDe(ahora), 'respaldos/2026-11-27T08-00-00Z.dump.enc');
});

// ── Una copia y una restauración reales ────────────────────────────────────────

const BIN = '/usr/lib/postgresql/16/bin';
const hayPostgres = fs.existsSync(path.join(BIN, 'postgres')) && fs.existsSync('/usr/bin/pg_dump');
let pg = null;

before(async () => {
  if (!hayPostgres) return;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vendiva-pg-'));
  fs.chmodSync(dir, 0o777);
  const datos = path.join(dir, 'datos');
  const puerto = 20000 + Math.floor(Math.random() * 20000);
  const comoPostgres = process.getuid?.() === 0 ? (cmd, args) => ['runuser', ['-u', 'postgres', '--', cmd, ...args]] : (cmd, args) => [cmd, args];
  execFileSync(...comoPostgres(path.join(BIN, 'initdb'), ['-D', datos, '--auth=trust', '-U', 'postgres', '--no-sync']), { stdio: 'ignore' });
  execFileSync(
    ...comoPostgres(path.join(BIN, 'pg_ctl'), ['-D', datos, '-w', '-l', path.join(dir, 'pg.log'), '-o', `-p ${puerto} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off`, 'start']),
    { stdio: 'ignore' },
  );
  const parar = () => execFileSync(...comoPostgres(path.join(BIN, 'pg_ctl'), ['-D', datos, '-m', 'fast', 'stop']), { stdio: 'ignore' });
  const url = (db) => `postgres://postgres@127.0.0.1:${puerto}/${db}`;
  for (let i = 0; i < 50; i += 1) {
    try {
      execFileSync('/usr/bin/psql', [url('postgres'), '-c', 'select 1'], { stdio: 'ignore' });
      break;
    } catch {
      await new Promise((ok) => setTimeout(ok, 200));
    }
  }
  execFileSync('/usr/bin/psql', [url('postgres'), '-c', 'create database vendiva', '-c', 'create database restaurada'], { stdio: 'ignore' });
  pg = { parar, dir, url };
});
after(() => {
  if (!pg) return;
  try {
    pg.parar();
  } finally {
    fs.rmSync(pg.dir, { recursive: true, force: true });
  }
});

test('copia y restauración DE VERDAD: pg_dump cifrado, subir, limpiar y pg_restore en otra base', { skip: !hayPostgres && 'PostgreSQL no está instalado aquí' }, async () => {
  const origen = await abrirBase(leerConfig({ NODE_ENV: 'test', DATABASE_URL: pg.url('vendiva') }));
  await migrar(origen);
  const id = crypto.randomUUID();
  await origen.query(
    `insert into usuarias (id, correo, contrasena_hash, nombre, telefono, plan, creditos_plan, creditos_video_plan, periodo_creditos)
     values ($1, 'maria@ejemplo.com', 'hash', 'María Elena Pérez', '(305) 555-0100', 'pro', 1000, 1000, '2026-11')`,
    [id],
  );
  await origen.query("insert into perfiles (usuaria_id, nicho, redes) values ($1, 'Cabello', '[\"tiktok\"]'::jsonb)", [id]);

  const guardadas = new Map();
  const ahora = new Date('2026-11-27T08:00:00Z');
  // Una copia de hace 3 años, que la limpieza debe borrar.
  guardadas.set(nombreDe(new Date('2023-01-01T08:00:00Z')), Buffer.from('vieja'));
  const r = await respaldar({
    databaseUrl: pg.url('vendiva'),
    clave,
    ahora,
    subir: async (nombre, flujo) => guardadas.set(nombre, await juntar(flujo)),
    listarNombres: async () => [...guardadas.keys()],
    borrar: async (nombre) => guardadas.delete(nombre),
  });
  assert.equal(r.nombre, 'respaldos/2026-11-27T08-00-00Z.dump.enc');
  assert.deepEqual(r.borradas, ['respaldos/2023-01-01T08-00-00Z.dump.enc']);
  const archivo = guardadas.get(r.nombre);
  assert.ok(archivo.length > 1000);
  assert.ok(!archivo.includes(Buffer.from('maria@ejemplo.com')), 'el correo no se ve en la copia');

  await restaurar({ datosCifrados: archivo, clave, destinoUrl: pg.url('restaurada') });
  const destino = await abrirBase(leerConfig({ NODE_ENV: 'test', DATABASE_URL: pg.url('restaurada') }));
  const u = (await destino.query('select nombre, plan, creditos_plan from usuarias where id = $1', [id])).rows[0];
  assert.deepEqual(u, { nombre: 'María Elena Pérez', plan: 'pro', creditos_plan: 1000 });
  const p = (await destino.query('select nicho, redes from perfiles where usuaria_id = $1', [id])).rows[0];
  assert.deepEqual(p, { nicho: 'Cabello', redes: ['tiktok'] });
  const migraciones = (await destino.query('select count(*)::int as n from migraciones_aplicadas')).rows[0].n;
  assert.equal(migraciones, fs.readdirSync(new URL('../server/db/migraciones/', import.meta.url)).filter((f) => f.endsWith('.sql')).length);

  // Con otra llave no se restaura nada.
  await assert.rejects(restaurar({ datosCifrados: archivo, clave: crypto.randomBytes(32), destinoUrl: pg.url('restaurada') }), /llave/);
  await origen.close();
  await destino.close();
});

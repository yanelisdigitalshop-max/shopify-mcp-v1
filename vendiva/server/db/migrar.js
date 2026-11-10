// Aplica las migraciones pendientes, en orden y una sola vez cada una.
// Se ejecuta sola al arrancar el servidor; también con `npm run migrar`.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CARPETA = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migraciones');

export async function migrar(db) {
  const archivos = (await fs.readdir(CARPETA)).filter((f) => f.endsWith('.sql')).sort();
  const aplicadasAhora = [];

  await db.tx(async (t) => {
    // Si arrancan dos servidores a la vez, solo uno migra; el otro espera.
    await t.query('select pg_advisory_xact_lock(727274)');
    await t.exec(`
      create table if not exists migraciones_aplicadas (
        nombre      text primary key,
        aplicada_en timestamptz not null default now()
      )`);
    const { rows } = await t.query('select nombre from migraciones_aplicadas');
    const yaAplicadas = new Set(rows.map((r) => r.nombre));

    for (const archivo of archivos) {
      if (yaAplicadas.has(archivo)) continue;
      const sql = await fs.readFile(path.join(CARPETA, archivo), 'utf8');
      await t.exec(sql);
      await t.query('insert into migraciones_aplicadas (nombre) values ($1)', [archivo]);
      aplicadasAhora.push(archivo);
    }
  });

  return aplicadasAhora;
}

// Uso directo: npm run migrar
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { leerConfig } = await import('../config.js');
  const { abrirBase } = await import('./index.js');
  const db = await abrirBase(leerConfig());
  try {
    const hechas = await migrar(db);
    console.log(hechas.length ? `Migraciones aplicadas: ${hechas.join(', ')}` : 'La base ya estaba al día.');
  } finally {
    await db.close();
  }
}

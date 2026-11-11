// Arranque del servidor de Vendiva.
//   npm run dev    -> desarrollo (interfaz con recarga en caliente, base local)
//   npm start      -> producción (sirve la interfaz ya construida en dist/)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { leerConfig } from './config.js';
import { abrirBase } from './db/index.js';
import { migrar } from './db/migrar.js';
import { crearApp } from './app.js';
import { borrarSesionesVencidas } from './auth/sesiones.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function servirInterfaz(app, config) {
  if (!config.produccion) {
    const { createServer } = await import('vite');
    const vite = await createServer({ root: RAIZ, server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
    return;
  }

  const dist = path.join(RAIZ, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    throw new Error('Falta la carpeta dist/. Ejecuta "npm run build" antes de "npm start".');
  }
  // Los archivos con huella en el nombre pueden guardarse un año; index.html nunca.
  app.use('/assets', express.static(path.join(dist, 'assets'), { immutable: true, maxAge: '1y', fallthrough: false }));
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(dist, 'index.html'));
  });
}

async function main() {
  const config = leerConfig();
  const db = await abrirBase(config);
  const aplicadas = await migrar(db);
  if (aplicadas.length) console.log(`[db] migraciones aplicadas: ${aplicadas.join(', ')}`);

  const app = crearApp({ db, config });
  await servirInterfaz(app, config);

  const servidor = app.listen(config.puerto, () => {
    console.log(`Vendiva lista en http://localhost:${config.puerto}`);
    console.log(`  base de datos: ${db.motor === 'postgres' ? 'PostgreSQL' : `local (${config.dirDatosLocales})`}`);
    console.log(`  Claude: ${config.anthropic.llaveConfigurada ? 'llave puesta' : 'falta la llave (VENDIVA_ANTHROPIC_API_KEY)'}`);
    console.log(`  FastMoss: ${config.fastmoss.llaveConfigurada ? 'llave puesta' : 'falta la llave (VENDIVA_FASTMOSS_CLIENT_SECRET)'}`);
  });

  const limpieza = setInterval(() => borrarSesionesVencidas(db).catch(() => {}), 6 * 60 * 60 * 1000);
  limpieza.unref();

  const apagar = () => {
    clearInterval(limpieza);
    servidor.close(async () => {
      await db.close().catch(() => {});
      process.exit(0);
    });
  };
  process.on('SIGTERM', apagar);
  process.on('SIGINT', apagar);
}

main().catch((err) => {
  console.error('Vendiva no pudo arrancar:', err.message);
  process.exit(1);
});

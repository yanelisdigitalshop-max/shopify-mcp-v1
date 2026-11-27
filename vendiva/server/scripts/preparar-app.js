// Parte 8: prepara las apps de iPhone y Android con la dirección del servidor.
//
//   VENDIVA_APP_URL=https://app.<dominio> npm run app:preparar
//
// La app del teléfono abre la página de Vendiva en esa dirección (con todo lo del teléfono:
// avisos, galería, micrófono). Escribe la dirección en capacitor.config.json, construye la
// interfaz y copia todo a ios/ y android/. No envía ni publica nada en ninguna tienda.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const url = process.env.VENDIVA_APP_URL?.trim();
if (!url || !/^https:\/\/[^/\s]+$/.test(url) || url.includes('DOMINIO-PENDIENTE')) {
  console.error('Pon VENDIVA_APP_URL con la dirección pública de Vendiva, con https:// y sin barra al final. Ejemplo: https://app.vendiva.com');
  process.exit(1);
}
const archivo = path.join(RAIZ, 'capacitor.config.json');
const config = JSON.parse(fs.readFileSync(archivo, 'utf8'));
config.server.url = url;
fs.writeFileSync(archivo, `${JSON.stringify(config, null, 2)}\n`);
const correr = (cmd, args) => execFileSync(cmd, args, { cwd: RAIZ, stdio: 'inherit' });
correr('npx', ['vite', 'build']);
correr('npx', ['cap', 'sync']);
console.log(`Apps preparadas con ${url}. Nada se envió a ninguna tienda.`);

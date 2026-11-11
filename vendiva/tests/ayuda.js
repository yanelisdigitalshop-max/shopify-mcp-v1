// Utilidades de las pruebas: levantan el servidor real contra una base desechable.
import { leerConfig } from '../server/config.js';
import { abrirBase } from '../server/db/index.js';
import { migrar } from '../server/db/migrar.js';
import { crearApp } from '../server/app.js';

export async function levantar({ env = {}, reloj, ia, fastmoss } = {}) {
  const config = leerConfig({
    NODE_ENV: 'test',
    VENDIVA_SCRYPT_N: '1024', // hash rápido solo en pruebas
    VENDIVA_SIN_LIMITES: '1',
    DATABASE_URL: process.env.VENDIVA_TEST_DATABASE_URL ?? '',
    ...env,
  });
  const db = await abrirBase(config, { enMemoria: true });
  if (config.databaseUrl) {
    // PostgreSQL real compartido: cada archivo de pruebas empieza limpio.
    await db.query('drop schema public cascade; create schema public;').catch(async () => {
      await db.query('drop schema public cascade');
      await db.query('create schema public');
    });
  }
  await migrar(db);

  const estadoReloj = { ahora: null };
  const app = crearApp({ db, config, reloj: reloj ?? (() => estadoReloj.ahora ?? new Date()), ...(ia ? { ia } : {}), ...(fastmoss ? { fastmoss } : {}) });
  const servidor = await new Promise((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s));
  });
  const base = `http://127.0.0.1:${servidor.address().port}`;

  return {
    db,
    config,
    base,
    ponerFecha: (fecha) => (estadoReloj.ahora = fecha),
    cliente: () => crearCliente(base),
    async cerrar() {
      await new Promise((ok) => servidor.close(ok));
      await db.close();
    },
  };
}

/** Un "navegador" mínimo: recuerda la cookie de sesión entre peticiones. */
export function crearCliente(base) {
  let cookie = null;
  async function pedir(metodo, ruta, cuerpo, { cabeceras = {}, sinCabeceraVendiva = false } = {}) {
    const headers = { ...cabeceras };
    if (cuerpo !== undefined) headers['content-type'] = 'application/json';
    if (metodo !== 'GET' && !sinCabeceraVendiva) headers['x-vendiva'] = '1';
    if (cookie) headers.cookie = cookie;
    const r = await fetch(base + ruta, { method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) });
    const puesta = r.headers.getSetCookie?.() ?? [];
    for (const c of puesta) {
      const [par] = c.split(';');
      cookie = par.endsWith('=') ? null : par;
    }
    const texto = await r.text();
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      /* no era JSON */
    }
    return { estado: r.status, json, cabeceras: r.headers, cookies: puesta };
  }
  return {
    get: (ruta, o) => pedir('GET', ruta, undefined, o),
    post: (ruta, cuerpo = {}, o) => pedir('POST', ruta, cuerpo, o),
    patch: (ruta, cuerpo = {}, o) => pedir('PATCH', ruta, cuerpo, o),
    del: (ruta, o) => pedir('DELETE', ruta, undefined, o),
    get cookie() {
      return cookie;
    },
    olvidarCookie() {
      cookie = null;
    },
  };
}

let n = 0;
export function cuentaNueva(extra = {}) {
  n += 1;
  return {
    nombre: 'María Elena Pérez',
    correo: `maria${n}.${Date.now()}@ejemplo.com`,
    telefono: '(305) 555-0100',
    contrasena: 'mi-clave-segura-1',
    mayorDeEdad: true,
    ...extra,
  };
}

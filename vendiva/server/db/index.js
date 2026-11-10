// Conexión a la base de datos (PostgreSQL).
//
// - Con DATABASE_URL: PostgreSQL de verdad (producción y pruebas de integración).
// - Sin DATABASE_URL y fuera de producción: PGlite, que es PostgreSQL corriendo
//   dentro de Node y guardando en una carpeta local. Mismo SQL, cero instalación.
//
// Las dos opciones exponen la misma interfaz pequeña:
//   db.query(sql, params) -> { rows, rowCount }
//   db.tx(async (t) => { await t.query(...); await t.exec(sqlDeVariasSentencias) })
//   db.close()

import pg from 'pg';

function conPg(databaseUrl) {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  pool.on('error', (err) => console.error('[db] error en una conexión inactiva:', err.message));

  return {
    motor: 'postgres',
    async query(sql, params = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows, rowCount: r.rowCount ?? 0 };
    },
    async tx(fn) {
      const cliente = await pool.connect();
      try {
        await cliente.query('begin');
        const resultado = await fn({
          async query(sql, params = []) {
            const r = await cliente.query(sql, params);
            return { rows: r.rows, rowCount: r.rowCount ?? 0 };
          },
          async exec(sql) {
            await cliente.query(sql);
          },
        });
        await cliente.query('commit');
        return resultado;
      } catch (err) {
        try {
          await cliente.query('rollback');
        } catch {
          // la conexión ya estaba rota; el error original es el que importa
        }
        throw err;
      } finally {
        cliente.release();
      }
    },
    async close() {
      await pool.end();
    },
  };
}

async function conPglite(carpeta) {
  const { PGlite } = await import('@electric-sql/pglite');
  const lite = carpeta ? new PGlite(carpeta) : new PGlite();
  await lite.waitReady;

  const normalizar = (r) => ({ rows: r.rows, rowCount: r.affectedRows ?? r.rows.length });

  return {
    motor: 'pglite',
    async query(sql, params = []) {
      return normalizar(await lite.query(sql, params));
    },
    async tx(fn) {
      return lite.transaction((t) =>
        fn({
          async query(sql, params = []) {
            return normalizar(await t.query(sql, params));
          },
          async exec(sql) {
            await t.exec(sql);
          },
        }),
      );
    },
    async close() {
      await lite.close();
    },
  };
}

/**
 * @param {object} config  resultado de leerConfig()
 * @param {{ enMemoria?: boolean }} [opciones]  enMemoria: base desechable para pruebas
 */
export async function abrirBase(config, { enMemoria = false } = {}) {
  if (config.databaseUrl) return conPg(config.databaseUrl);

  if (config.produccion) {
    throw new Error(
      'Falta DATABASE_URL. En producción Vendiva necesita una base PostgreSQL: ' +
        'sin ella los datos de las usuarias se perderían.',
    );
  }
  return conPglite(enMemoria ? null : config.dirDatosLocales);
}

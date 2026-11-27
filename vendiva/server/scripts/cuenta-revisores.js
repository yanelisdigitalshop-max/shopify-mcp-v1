// Parte 8: la cuenta para los revisores de Apple y Google.
//
//   VENDIVA_REVISOR_CONTRASENA=<una contraseña larga> npm run cuenta:revisores
//
// Crea (o pone al día) una cuenta con el plan Pro de prueba, el registro completo y dos
// productos de ejemplo, para que el revisor vea toda la app. No hay cobro: el plan se pone
// directo en la base (sin suscripción de Stripe) y sus créditos se reponen el día 1.
// La contraseña NO va en el código ni en el chat: se pasa por la variable de entorno, y la dueña
// la escribe en el formulario de cada tienda («Información para la revisión»).

import { PLANES } from '../../shared/datos.js';
import { leerConfig } from '../config.js';
import { abrirBase } from '../db/index.js';
import { migrar } from '../db/migrar.js';
import { crearHash } from '../auth/contrasenas.js';
import { anotarMovimiento, periodoDe } from '../servicios/creditos.js';

export const CORREO_REVISORES_POR_DEFECTO = 'revision@vendiva.app';

const PRODUCTOS_EJEMPLO = [
  {
    nombre: 'Cepillo alisador (ejemplo)',
    descripcion: 'Producto de ejemplo para la revisión de la app. Cepillo de cerdas suaves para peinar cabello rizado.',
    precio_centavos: 1499,
    comision_pct: 15,
  },
  {
    nombre: 'Organizador de cocina (ejemplo)',
    descripcion: 'Producto de ejemplo para la revisión de la app. Organizador de plástico para especias.',
    precio_centavos: 1999,
    comision_pct: 12,
  },
];

export async function prepararCuentaRevisores(db, { correo, contrasena, config, ahora = new Date() }) {
  if (!contrasena || contrasena.length < 12) throw new Error('Falta VENDIVA_REVISOR_CONTRASENA (al menos 12 letras o números).');
  const hash = await crearHash(contrasena, config.scrypt);
  const pro = PLANES.pro;
  const periodo = periodoDe(ahora);

  return db.tx(async (t) => {
    let u = (await t.query('select * from usuarias where correo = $1 for update', [correo])).rows[0];
    if (!u) {
      const id = crypto.randomUUID();
      await t.query(
        `insert into usuarias (id, correo, contrasena_hash, nombre, telefono, plan, creditos_plan, creditos_video_plan, periodo_creditos, mayor_de_edad_confirmada_en)
         values ($1, $2, $3, 'Revisión de la tienda', '(305) 555-0100', 'pro', $4, $5, $6, $7)`,
        [id, correo, hash, pro.creditosTextoMes, pro.creditosVideoMes, periodo, ahora],
      );
      await t.query('insert into perfiles (usuaria_id) values ($1)', [id]);
      await anotarMovimiento(t, { usuariaId: id, bolsa: 'plan', cantidad: pro.creditosTextoMes, motivo: 'alta', periodo });
      u = (await t.query('select * from usuarias where id = $1', [id])).rows[0];
    } else {
      await t.query(
        `update usuarias set contrasena_hash = $2, plan = 'pro', creditos_plan = $3, creditos_video_plan = $4, periodo_creditos = $5,
                suscripcion_id = null, suscripcion_estado = null, actualizada_en = now() where id = $1`,
        [u.id, hash, pro.creditosTextoMes, pro.creditosVideoMes, periodo],
      );
    }
    await t.query(
      `update perfiles set nicho = 'Belleza y cuidado del cabello', seguidores = 350, modo_grabacion = 'sin_camara',
              objetivo = 'vender_mas', redes = '["tiktok","instagram"]'::jsonb, onboarding_paso = 6, onboarding_completo = true
        where usuaria_id = $1`,
      [u.id],
    );
    const tiene = (await t.query('select count(*)::int as n from productos where usuaria_id = $1 and not oculto', [u.id])).rows[0].n;
    if (tiene === 0) {
      for (const p of PRODUCTOS_EJEMPLO) {
        await t.query(
          `insert into productos (id, usuaria_id, nombre, descripcion, precio_centavos, comision_pct, origen) values ($1, $2, $3, $4, $5, $6, 'manual')`,
          [crypto.randomUUID(), u.id, p.nombre, p.descripcion, p.precio_centavos, p.comision_pct],
        );
      }
    }
    return u.id;
  });
}

// Uso directo: npm run cuenta:revisores
if (process.argv[1]?.endsWith('cuenta-revisores.js')) {
  const config = leerConfig();
  const db = await abrirBase(config);
  try {
    await migrar(db);
    const correo = process.env.VENDIVA_REVISOR_CORREO?.trim() || CORREO_REVISORES_POR_DEFECTO;
    await prepararCuentaRevisores(db, { correo, contrasena: process.env.VENDIVA_REVISOR_CONTRASENA, config });
    console.log(`Cuenta para los revisores lista: ${correo} (plan Pro de prueba). La contraseña es la de VENDIVA_REVISOR_CONTRASENA.`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await db.close();
  }
}

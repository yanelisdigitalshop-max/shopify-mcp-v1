// Reglas compartidas de productos.

import { PLANES } from '../../shared/datos.js';
import { ErrorApp, sinSesion } from '../errores.js';

/**
 * Plan Gratis: máximo 6 productos en total, contando los que sube ella y los del buscador.
 * Se llama dentro de una transacción: bloquea la fila de la usuaria para que dos
 * toques a la vez no puedan colar un séptimo.
 */
export async function comprobarTopeProductos(t, usuariaId) {
  const usuaria = (await t.query('select plan from usuarias where id = $1 for update', [usuariaId])).rows[0];
  if (!usuaria) throw sinSesion();
  const plan = PLANES[usuaria.plan];
  const total = (await t.query('select count(*)::int as n from productos where usuaria_id = $1', [usuariaId])).rows[0].n;

  if (plan.maxProductos != null && total >= plan.maxProductos) {
    throw new ErrorApp(
      403,
      'LIMITE_PRODUCTOS',
      `El plan ${plan.nombre} guarda hasta ${plan.maxProductos} productos y ya tienes ${total}. ` +
        'Para agregar otro, borra uno que ya no uses o sube de plan.',
      { datos: { maximo: plan.maxProductos, usados: total } },
    );
  }
}

// Parte 8: borrar la cuenta (lo exigen Apple y Google). Decisión de la dueña (27 nov 2026):
// si se borra, se cancela la suscripción y se borra todo lo suyo.
//
// Orden, para que nunca quede alguien cobrándose sin cuenta:
//   1. Si tiene una suscripción viva, se cancela YA en Stripe (sin reembolso). Si Stripe
//      falla, NO se borra nada y se le pide intentar otra vez.
//   2. Se borra su cliente en Stripe (y sus tarjetas guardadas). Si eso falla, se anota y se sigue:
//      ya no hay nada que cobrar.
//   3. Se borra la usuaria: todas sus tablas se borran en cascada (perfil, productos, guiones,
//      videos, voces, calendario, vitrina, pagos, sesiones...).
// Stripe guarda su propio registro de los cobros hechos, como exige la ley; Vendiva no.

import { ErrorApp, sinSesion } from '../errores.js';
import { ErrorStripe } from '../fuentes/stripe.js';
import { tieneSuscripcion } from './pagos.js';

export async function borrarCuenta({ db, stripe, usuariaId }) {
  const u = (await db.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
  if (!u) throw sinSesion();

  if (tieneSuscripcion(u)) {
    if (!stripe.lista()) {
      throw new ErrorApp(503, 'PAGOS_NO_DISPONIBLES', 'No pudimos cancelar tu plan en este momento, así que tu cuenta no se borró. Intenta más tarde.', { reintentable: true });
    }
    try {
      await stripe.cancelarAhora(u.suscripcion_id);
    } catch (err) {
      console.error(`[cuenta] no se pudo cancelar la suscripción al borrar: ${err.codigo ?? err.message}`);
      throw new ErrorApp(503, 'NO_SE_CANCELO', 'No pudimos cancelar tu plan, así que tu cuenta no se borró y nada cambió. Intenta otra vez en un momento.', {
        reintentable: true,
      });
    }
  }

  if (u.stripe_cliente_id && stripe.lista()) {
    await stripe.borrarCliente(u.stripe_cliente_id).catch((err) => {
      console.error(`[cuenta] no se pudo borrar el cliente de Stripe ${u.stripe_cliente_id}: ${err instanceof ErrorStripe ? err.codigo : err.message}`);
    });
  }

  await db.query('delete from usuarias where id = $1', [usuariaId]);
}

// Parte 7: pagos con Stripe (MODO DE PRUEBA hasta que la dueña apruebe por escrito).
//   POST /api/pagos/plan       { plan, aceptaTerminos: true }   -> { url } (página de pago) o el estado
//   POST /api/pagos/paquete    { paquete, aceptaTerminos: true } -> { url }
//   POST /api/pagos/cancelar   cancelar el plan (sigue hasta el fin del mes pagado)
//   POST /api/pagos/reanudar   deshacer la cancelación
//   POST /api/pagos/portal     -> { url } página de Stripe para cambiar la tarjeta y ver recibos
//   POST /api/pagos/webhook    avisos firmados de Stripe (se monta aparte, en app.js)

import { Router } from 'express';
import { z } from 'zod';
import { PAQUETES_CREDITOS } from '../../shared/datos.js';
import { validar } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { construirEstado } from '../servicios/estado.js';
import { abrirPortal, cancelarPlan, comprarPaquete, elegirPlan, procesarEvento } from '../servicios/pagos.js';

const esquemaPlan = z.object({ plan: z.enum(['esencial', 'crecimiento', 'pro']), aceptaTerminos: z.boolean().optional() }).strict();
const esquemaPaquete = z.object({ paquete: z.enum(PAQUETES_CREDITOS.map((p) => p.id)), aceptaTerminos: z.boolean().optional() }).strict();

/** Adónde vuelve después de la página de Stripe: la pestaña Planes, con el resultado. */
function regreso(config, req) {
  const origen = config.origenApp ?? `${req.protocol}://${req.get('host')}`;
  return (resultado) => `${origen}/?pago=${resultado}#planes`;
}

export function rutasPagos({ db, config, reloj, stripe }) {
  const r = Router();
  const estado = async (req) => construirEstado(db, req.usuariaId, reloj());

  r.post('/pagos/plan', exigirSesion, async (req, res) => {
    const { plan, aceptaTerminos } = validar(esquemaPlan, req.body);
    const resultado = await elegirPlan({ db, stripe, reloj, usuariaId: req.usuariaId, plan, aceptaTerminos, volver: regreso(config, req) });
    res.json({ ...resultado, estado: await estado(req) });
  });

  r.post('/pagos/paquete', exigirSesion, async (req, res) => {
    const { paquete, aceptaTerminos } = validar(esquemaPaquete, req.body);
    const resultado = await comprarPaquete({ db, stripe, reloj, usuariaId: req.usuariaId, paquete, aceptaTerminos, volver: regreso(config, req) });
    res.json({ ...resultado, estado: await estado(req) });
  });

  r.post('/pagos/cancelar', exigirSesion, async (req, res) => {
    await cancelarPlan({ db, stripe, usuariaId: req.usuariaId, cancelar: true });
    res.json({ estado: await estado(req) });
  });

  r.post('/pagos/reanudar', exigirSesion, async (req, res) => {
    await cancelarPlan({ db, stripe, usuariaId: req.usuariaId, cancelar: false });
    res.json({ estado: await estado(req) });
  });

  r.post('/pagos/portal', exigirSesion, async (req, res) => {
    res.json(await abrirPortal({ db, stripe, usuariaId: req.usuariaId, volver: regreso(config, req) }));
  });

  return r;
}

/**
 * Avisos de Stripe. Va ANTES de la defensa CSRF y del lector de JSON: Stripe no manda
 * la cabecera de Vendiva, y la firma se comprueba sobre el cuerpo crudo.
 */
export function webhookStripe({ db, reloj, stripe }) {
  return async (req, res) => {
    let evento;
    try {
      evento = stripe.verificarEvento(req.body, req.get('stripe-signature'), reloj().getTime());
    } catch (err) {
      console.error(`[pagos] webhook rechazado: ${err.codigo ?? err.message}`);
      return res.status(400).json({ recibido: false });
    }
    try {
      const resultado = await procesarEvento({ db, stripe, reloj, evento });
      res.json({ recibido: true, resultado });
    } catch (err) {
      // 500: Stripe lo reenvía más tarde.
      console.error(`[pagos] no se pudo procesar ${evento.type} (${evento.id}):`, err.message);
      res.status(500).json({ recibido: false });
    }
  };
}

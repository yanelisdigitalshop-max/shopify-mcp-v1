// Parte 6.
//   POST /api/creaciones/:id/guiones/:numero/textos-redes   { costoAceptado }  1 crédito de texto por red marcada
//   POST /api/vitrina                                        { estrellas, resenas, quejas, quejaOtra }  solo Pro
//   POST /api/vitrina/:id/plan                               pedir otra vez el plan (si la IA falló)

import { Router } from 'express';
import { z } from 'zod';
import { QUEJAS_VITRINA } from '../../shared/datos.js';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { construirEstado } from '../servicios/estado.js';
import { crearTextosRedes } from '../servicios/textos-redes.js';
import { guardarCalificacion, reintentarPlan } from '../servicios/vitrina.js';

const esquemaConfirmacion = z.object({ costoAceptado: z.number().int().min(0).max(1000).optional() }).strict();

const esquemaCalificacion = z
  .object({
    estrellas: z
      .number({ error: 'Escribe tus estrellas con números, por ejemplo 4,5.' })
      .min(1, 'Las estrellas van de 1 a 5.')
      .max(5, 'Las estrellas van de 1 a 5.')
      .transform((v) => Math.round(v * 10) / 10),
    resenas: z
      .number({ error: 'Escribe cuántas reseñas tienes. Si no tienes, pon 0.' })
      .int('Escribe un número entero.')
      .min(0, 'No puede ser menos de 0.')
      .max(10_000_000, 'Ese número es demasiado grande.'),
    quejas: z
      .array(z.enum(QUEJAS_VITRINA.map((q) => q.id)))
      .max(QUEJAS_VITRINA.length)
      .default([])
      .transform((v) => QUEJAS_VITRINA.map((q) => q.id).filter((id) => v.includes(id))),
    quejaOtra: z
      .string()
      .trim()
      .max(300, 'Escríbelo más corto (hasta 300 letras).')
      .transform((v) => v || null)
      .nullable()
      .optional()
      .transform((v) => v ?? null),
  })
  .strict();

export function rutasRedesVitrina({ db, reloj, ia }) {
  const r = Router();

  r.post('/creaciones/:id/guiones/:numero/textos-redes', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    const numero = Number(req.params.numero);
    if (!id.success || ![1, 2, 3].includes(numero)) throw noEncontrado('Ese guion');
    const { costoAceptado } = validar(esquemaConfirmacion, req.body);
    const textos = await crearTextosRedes({ db, ia, reloj, usuariaId: req.usuariaId, creacionId: id.data, numero, costoAceptado });
    res.status(201).json({ textos, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/vitrina', exigirSesion, async (req, res) => {
    const datos = validar(esquemaCalificacion, req.body);
    await guardarCalificacion({ db, ia, reloj, usuariaId: req.usuariaId, datos });
    res.status(201).json({ estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/vitrina/:id/plan', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Esa calificación');
    await reintentarPlan({ db, ia, reloj, usuariaId: req.usuariaId, calificacionId: id.data });
    res.json({ estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  return r;
}

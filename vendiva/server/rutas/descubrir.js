// "Descubre qué vender" y tendencias de la semana.
//   POST /api/buscador                     { nicho }  -> 5 ideas
//   POST /api/buscador/:id/guardar         { indice } -> la idea pasa a "mis productos"
//   POST /api/tendencias                   -> el reporte de esta semana (solo planes de pago)

import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { buscar, crearTendencias, guardarIdea } from '../servicios/descubrir.js';
import { construirEstado } from '../servicios/estado.js';

const esquemaBusqueda = z
  .object({
    nicho: z
      .string({ error: 'Escribe qué tipo de producto quieres vender.' })
      .trim()
      .min(2, 'Escribe qué tipo de producto quieres vender.')
      .max(60, 'Escríbelo más corto.'),
  })
  .strict();

const esquemaGuardar = z.object({ indice: z.number().int().min(0).max(4) }).strict();

export function rutasDescubrir({ db, reloj, ia }) {
  const r = Router();

  r.post('/buscador', exigirSesion, async (req, res) => {
    const { nicho } = validar(esquemaBusqueda, req.body);
    const busqueda = await buscar({ db, ia, reloj, usuariaId: req.usuariaId, nicho });
    res.status(201).json({ busqueda, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/buscador/:id/guardar', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Esa búsqueda');
    const { indice } = validar(esquemaGuardar, req.body);
    const { productoId, nuevo } = await guardarIdea({ db, reloj, usuariaId: req.usuariaId, busquedaId: id.data, indice });
    res.status(nuevo ? 201 : 200).json({ productoId, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/tendencias', exigirSesion, async (req, res) => {
    const reporte = await crearTendencias({ db, ia, reloj, usuariaId: req.usuariaId });
    res.status(201).json({ reporte, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  return r;
}

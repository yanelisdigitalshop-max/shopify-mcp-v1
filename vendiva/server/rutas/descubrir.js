// "Descubre qué vender" y tendencias de la semana.
//   POST /api/buscador                     { consulta } -> hasta 10 productos de TikTok Shop (FastMoss)
//   POST /api/buscador/:id/guardar         { indice }   -> ese producto pasa a "mis productos"
//   POST /api/tendencias                   -> los más vendidos de la semana (solo planes de pago)

import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { buscar, crearTendencias, guardarProducto } from '../servicios/descubrir.js';
import { construirEstado } from '../servicios/estado.js';

const esquemaBusqueda = z
  .object({
    consulta: z
      .string({ error: 'Escribe qué producto quieres buscar.' })
      .trim()
      .min(2, 'Escribe qué producto quieres buscar.')
      .max(60, 'Escríbelo más corto.'),
  })
  .strict();

const esquemaGuardar = z.object({ indice: z.number().int().min(0).max(9) }).strict();

export function rutasDescubrir({ db, reloj, fastmoss }) {
  const r = Router();

  r.post('/buscador', exigirSesion, async (req, res) => {
    const { consulta } = validar(esquemaBusqueda, req.body);
    const busqueda = await buscar({ db, fastmoss, reloj, usuariaId: req.usuariaId, consulta });
    res.status(201).json({ busqueda, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/buscador/:id/guardar', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Ese producto');
    const { indice } = validar(esquemaGuardar, req.body);
    const { productoId, nuevo } = await guardarProducto({ db, reloj, usuariaId: req.usuariaId, busquedaId: id.data, indice });
    res.status(nuevo ? 201 : 200).json({ productoId, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.post('/tendencias', exigirSesion, async (req, res) => {
    const reporte = await crearTendencias({ db, fastmoss, reloj, usuariaId: req.usuariaId });
    res.status(201).json({ reporte, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  return r;
}

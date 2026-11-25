// Videos con IA.
//   POST /api/productos/:id/videos   { tipo: 'corto'|'desde_foto', indice: 1..3, costoAceptado }
//   GET  /api/videos/:id/ver         -> lleva al video (con un enlace fresco de Runway)

import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { crearVideo, enlaceVideo } from '../servicios/videos.js';
import { construirEstado } from '../servicios/estado.js';

const esquemaVideo = z
  .object({
    tipo: z.enum(['corto', 'desde_foto']),
    indice: z.number().int().min(1).max(3),
    costoAceptado: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

export function rutasVideos({ db, reloj, ia, runway }) {
  const r = Router();

  r.post('/productos/:id/videos', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Ese producto');
    const { tipo, indice, costoAceptado } = validar(esquemaVideo, req.body);
    const video = await crearVideo({ db, ia, runway, reloj, usuariaId: req.usuariaId, productoId: id.data, tipo, indice, costoAceptado });
    res.status(201).json({ video, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.get('/videos/:id/ver', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Ese video');
    const url = await enlaceVideo({ db, runway, reloj, usuariaId: req.usuariaId, videoId: id.data });
    res.redirect(302, url);
  });

  return r;
}

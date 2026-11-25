// Videos con IA.
//   POST /api/productos/:id/videos   { tipo: 'corto'|'desde_foto', indice: 1..3, costoAceptado }
//   GET  /api/videos/:id/ver         -> lleva al video (con un enlace fresco de Runway)
//   GET  /api/videos/:id/descargar   -> el archivo, directo de Runway al teléfono (no se guarda aquí)

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { abrirDescarga, crearVideo, enlaceVideo, marcarDescargado } from '../servicios/videos.js';
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

  r.get('/videos/:id/descargar', exigirSesion, async (req, res) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Ese video');
    const { archivo, nombreArchivo } = await abrirDescarga({ db, runway, reloj, usuariaId: req.usuariaId, videoId: id.data });

    res.status(200);
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    const largo = archivo.headers.get('content-length');
    if (largo) res.set('Content-Length', largo);

    try {
      await pipeline(Readable.fromWeb(archivo.body), res);
    } catch (err) {
      console.error(`[video] descarga cortada: ${err.code ?? err.message}`);
      return; // no se marca: tendrá que descargarlo otra vez
    }
    // Solo cuando el archivo pasó completo se marca como descargado.
    await marcarDescargado(db, { usuariaId: req.usuariaId, videoId: id.data, ahora: reloj() }).catch((err) =>
      console.error('[video] no se pudo marcar la descarga:', err.message),
    );
  });

  return r;
}

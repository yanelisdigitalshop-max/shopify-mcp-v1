// Videos con IA.
//   POST /api/productos/:id/videos   { tipo: 'corto'|'desde_foto', indice: 1..3, costoAceptado }
//   GET  /api/videos/:id/ver         -> lleva al video (con un enlace fresco de Runway)
//   GET  /api/videos/:id/descargar   -> el archivo, directo de Runway al teléfono (no se guarda aquí);
//                                       si tiene voz, se le une al momento
//   POST /api/videos/:id/voz-real     el audio que ella grabó (cuerpo binario, tipo audio/*). Gratis.
//   POST /api/videos/:id/voz-ia       { costoAceptado } voz de IA de ElevenLabs (2 créditos de texto)
//   GET  /api/videos/:id/voz          el audio de la voz, para escucharla con el video
//   DELETE /api/videos/:id/voz        quitar la voz

import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import express, { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { abrirDescarga, crearVideo, enlaceVideo, marcarDescargado } from '../servicios/videos.js';
import { construirEstado } from '../servicios/estado.js';
import { mezclarVozConVideo } from '../servicios/mezcla.js';
import { AUDIO_MAXIMO_BYTES, audioDeVoz, crearVozIA, guardarVozReal, quitarVoz, vozOpcional } from '../servicios/voces.js';

const esquemaVideo = z
  .object({
    tipo: z.enum(['corto', 'desde_foto']),
    indice: z.number().int().min(1).max(3),
    costoAceptado: z.number().int().min(0).max(1000).optional(),
  })
  .strict();

const esquemaVozIA = z.object({ costoAceptado: z.number().int().min(0).max(1000).optional() }).strict();

export function rutasVideos({ db, reloj, ia, runway, voz }) {
  const r = Router();
  const idDeVideo = (req) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Ese video');
    return id.data;
  };
  const responderEstado = async (req, res) => res.json({ estado: await construirEstado(db, req.usuariaId, reloj()) });

  // ── Voz ──
  r.post(
    '/videos/:id/voz-real',
    exigirSesion,
    express.raw({ type: () => true, limit: AUDIO_MAXIMO_BYTES }),
    async (req, res) => {
      const videoId = idDeVideo(req);
      await guardarVozReal({ db, usuariaId: req.usuariaId, videoId, audio: Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0), mime: req.get('content-type') });
      res.status(201);
      await responderEstado(req, res);
    },
  );

  r.post('/videos/:id/voz-ia', exigirSesion, async (req, res) => {
    const videoId = idDeVideo(req);
    const { costoAceptado } = validar(esquemaVozIA, req.body);
    await crearVozIA({ db, voz, reloj, usuariaId: req.usuariaId, videoId, costoAceptado });
    res.status(201);
    await responderEstado(req, res);
  });

  r.get('/videos/:id/voz', exigirSesion, async (req, res) => {
    const { audio, mime } = await audioDeVoz(db, { usuariaId: req.usuariaId, videoId: idDeVideo(req) });
    res.set({ 'Content-Type': mime, 'Content-Length': String(audio.length) });
    res.send(Buffer.from(audio));
  });

  r.delete('/videos/:id/voz', exigirSesion, async (req, res) => {
    await quitarVoz(db, { usuariaId: req.usuariaId, videoId: idDeVideo(req) });
    await responderEstado(req, res);
  });

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
    const conVoz = await vozOpcional(db, { usuariaId: req.usuariaId, videoId: id.data });

    // Con voz: se une al video en una carpeta temporal que se borra al terminar.
    let mezcla = null;
    if (conVoz) mezcla = await mezclarVozConVideo({ video: archivo.body, audio: Buffer.from(conVoz.audio), mime: conVoz.mime });

    res.status(200);
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="${mezcla ? nombreArchivo.replace(/\.mp4$/, '-con-voz.mp4') : nombreArchivo}"`,
      'X-Content-Type-Options': 'nosniff',
    });
    const largo = mezcla ? String(mezcla.tamano) : archivo.headers.get('content-length');
    if (largo) res.set('Content-Length', largo);

    try {
      await pipeline(mezcla ? createReadStream(mezcla.ruta) : Readable.fromWeb(archivo.body), res);
    } catch (err) {
      console.error(`[video] descarga cortada: ${err.code ?? err.message}`);
      return; // no se marca: tendrá que descargarlo otra vez
    } finally {
      await mezcla?.limpiar();
    }
    // Solo cuando el archivo pasó completo se marca como descargado.
    await marcarDescargado(db, { usuariaId: req.usuariaId, videoId: id.data, ahora: reloj() }).catch((err) =>
      console.error('[video] no se pudo marcar la descarga:', err.message),
    );
  });

  return r;
}

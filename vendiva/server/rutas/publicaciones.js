// Parte 5: Programar (gratis e ilimitado; no publica en TikTok).
//   POST   /api/publicaciones       { tipo: 'guion', creacionId, numero, programadaPara }
//                                   { tipo: 'video', videoId, programadaPara }
//                                   Si ya estaba programado, cambia la hora.
//   PATCH  /api/publicaciones/:id   { programadaPara } y/o { publicada: true|false }
//   DELETE /api/publicaciones/:id   quitarla del calendario
// programadaPara: fecha y hora con su zona (ISO 8601), tal como la eligió en su teléfono.

import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { construirEstado } from '../servicios/estado.js';
import { cambiarPublicacion, programar, quitarPublicacion } from '../servicios/publicaciones.js';

const hora = z.iso.datetime({ offset: true, error: 'Elige el día y la hora.' });

const esquemaProgramar = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('guion'), creacionId: z.uuid(), numero: z.number().int().min(1).max(3), programadaPara: hora }).strict(),
  z.object({ tipo: z.literal('video'), videoId: z.uuid(), programadaPara: hora }).strict(),
]);

const esquemaCambio = z
  .object({ programadaPara: hora.optional(), publicada: z.boolean().optional() })
  .strict()
  .refine((c) => c.programadaPara !== undefined || c.publicada !== undefined, 'No hay nada que cambiar.');

export function rutasPublicaciones({ db, reloj }) {
  const r = Router();
  const idDe = (req) => {
    const id = esquemaUuid.safeParse(req.params.id);
    if (!id.success) throw noEncontrado('Esa publicación');
    return id.data;
  };

  r.post('/publicaciones', exigirSesion, async (req, res) => {
    const { programadaPara, ...que } = validar(esquemaProgramar, req.body);
    const { publicacion, nueva } = await programar(db, { usuariaId: req.usuariaId, que, programadaPara, ahora: reloj() });
    res.status(nueva ? 201 : 200).json({ publicacion, estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.patch('/publicaciones/:id', exigirSesion, async (req, res) => {
    const id = idDe(req);
    const cambios = validar(esquemaCambio, req.body);
    await cambiarPublicacion(db, { usuariaId: req.usuariaId, id, cambios, ahora: reloj() });
    res.json({ estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  r.delete('/publicaciones/:id', exigirSesion, async (req, res) => {
    await quitarPublicacion(db, { usuariaId: req.usuariaId, id: idDe(req) });
    res.json({ estado: await construirEstado(db, req.usuariaId, reloj()) });
  });

  return r;
}

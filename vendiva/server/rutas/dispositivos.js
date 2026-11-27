// Parte 8: los teléfonos que reciben los avisos «Te toca publicar».
//   POST /api/dispositivos         { token, plataforma: 'ios'|'android' }  registrar (o pasar a esta cuenta)
//   POST /api/dispositivos/quitar  { token }                               al cerrar sesión en la app

import { Router } from 'express';
import { z } from 'zod';
import { validar } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { guardarDispositivo, quitarDispositivo } from '../servicios/avisos.js';

const token = z.string().trim().min(20).max(4096).regex(/^[\w:.\-]+$/);

export function rutasDispositivos({ db }) {
  const r = Router();
  r.post('/dispositivos', exigirSesion, async (req, res) => {
    const d = validar(z.object({ token, plataforma: z.enum(['ios', 'android']) }).strict(), req.body);
    await guardarDispositivo(db, { usuariaId: req.usuariaId, ...d });
    res.status(201).json({ ok: true });
  });
  r.post('/dispositivos/quitar', exigirSesion, async (req, res) => {
    const d = validar(z.object({ token }).strict(), req.body);
    await quitarDispositivo(db, { usuariaId: req.usuariaId, token: d.token });
    res.json({ ok: true });
  });
  return r;
}

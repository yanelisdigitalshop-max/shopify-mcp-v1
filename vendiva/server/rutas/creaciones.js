// Lo que la IA escribe para un producto.
//   POST /api/productos/:id/guiones                  gratis, de un toque
//   POST /api/productos/:id/guion-en-vivo            10 créditos, con el costo confirmado
//   POST /api/productos/:id/respuestas-comentarios   3 créditos, con el costo confirmado

import { Router } from 'express';
import { z } from 'zod';
import { noEncontrado } from '../errores.js';
import { validar, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { crear } from '../servicios/creaciones.js';
import { construirEstado } from '../servicios/estado.js';

const esquemaConfirmacion = z.object({ costoAceptado: z.number().int().min(0).max(1000).optional() }).strict();

const RUTAS = {
  guiones: 'guiones',
  'guion-en-vivo': 'guion_en_vivo',
  'respuestas-comentarios': 'respuestas_comentarios',
};

export function rutasCreaciones({ db, reloj, ia }) {
  const r = Router();

  for (const [ruta, tipo] of Object.entries(RUTAS)) {
    r.post(`/productos/:id/${ruta}`, exigirSesion, async (req, res) => {
      const id = esquemaUuid.safeParse(req.params.id);
      if (!id.success) throw noEncontrado('Ese producto');
      const { costoAceptado } = validar(esquemaConfirmacion, req.body);

      const creacion = await crear({ db, ia, reloj, usuariaId: req.usuariaId, productoId: id.data, tipo, costoAceptado });
      res.status(201).json({ creacion, estado: await construirEstado(db, req.usuariaId, reloj()) });
    });
  }

  return r;
}

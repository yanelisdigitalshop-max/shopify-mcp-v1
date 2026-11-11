// Productos: la app empieza vacía y cada usuaria agrega los suyos.
// Plan Gratis: máximo 6 productos en total. El séptimo no entra.

import crypto from 'node:crypto';
import { Router } from 'express';
import { noEncontrado } from '../errores.js';
import { validar, esquemaProductoNuevo, esquemaProductoEditado, esquemaUuid } from '../validacion.js';
import { exigirSesion } from '../auth/sesiones.js';
import { anotarHistorial, construirEstado } from '../servicios/estado.js';
import { comprobarTopeProductos } from '../servicios/productos.js';

const aCentavos = (precio) => (precio == null ? null : Math.round(precio * 100));

function idDe(req) {
  const r = esquemaUuid.safeParse(req.params.id);
  if (!r.success) throw noEncontrado('Ese producto');
  return r.data;
}

export function rutasProductos({ db, reloj }) {
  const r = Router();
  r.use('/productos', exigirSesion);

  r.post('/productos', async (req, res) => {
    const datos = validar(esquemaProductoNuevo, req.body);
    const usuariaId = req.usuariaId;
    const id = crypto.randomUUID();

    await db.tx(async (t) => {
      await comprobarTopeProductos(t, usuariaId);

      await t.query(
        `insert into productos (id, usuaria_id, nombre, descripcion, precio_centavos, comision_pct, enlace, origen)
         values ($1, $2, $3, $4, $5, $6, $7, 'manual')`,
        [id, usuariaId, datos.nombre, datos.descripcion ?? null, aCentavos(datos.precio), datos.comisionPct ?? null, datos.enlace ?? null],
      );
      await anotarHistorial(t, usuariaId, 'producto_agregado', { productoId: id, nombre: datos.nombre });
    });

    res.status(201).json({ productoId: id, estado: await construirEstado(db, usuariaId, reloj()) });
  });

  r.patch('/productos/:id', async (req, res) => {
    const id = idDe(req);
    const datos = validar(esquemaProductoEditado, req.body);
    const usuariaId = req.usuariaId;

    const columnas = [];
    const valores = [];
    const poner = (columna, valor) => {
      valores.push(valor);
      columnas.push(`${columna} = $${valores.length + 2}`);
    };
    if ('nombre' in datos) poner('nombre', datos.nombre);
    if ('descripcion' in datos) poner('descripcion', datos.descripcion ?? null);
    if ('precio' in datos) poner('precio_centavos', aCentavos(datos.precio));
    if ('comisionPct' in datos) poner('comision_pct', datos.comisionPct ?? null);
    if ('enlace' in datos) poner('enlace', datos.enlace ?? null);

    await db.tx(async (t) => {
      // Siempre se filtra por usuaria: nadie puede tocar el producto de otra cuenta.
      const sql = columnas.length
        ? `update productos set ${columnas.join(', ')}, actualizado_en = now() where id = $1 and usuaria_id = $2 returning nombre`
        : 'select nombre from productos where id = $1 and usuaria_id = $2';
      const { rows } = await t.query(sql, [id, usuariaId, ...valores]);
      if (!rows[0]) throw noEncontrado('Ese producto');
      if (columnas.length) await anotarHistorial(t, usuariaId, 'producto_editado', { productoId: id, nombre: rows[0].nombre });
    });

    res.json({ estado: await construirEstado(db, usuariaId, reloj()) });
  });

  r.delete('/productos/:id', async (req, res) => {
    const id = idDe(req);
    const usuariaId = req.usuariaId;

    await db.tx(async (t) => {
      const { rows } = await t.query('delete from productos where id = $1 and usuaria_id = $2 returning nombre', [
        id,
        usuariaId,
      ]);
      if (!rows[0]) throw noEncontrado('Ese producto');
      await anotarHistorial(t, usuariaId, 'producto_borrado', { nombre: rows[0].nombre });
    });

    res.json({ estado: await construirEstado(db, usuariaId, reloj()) });
  });

  return r;
}

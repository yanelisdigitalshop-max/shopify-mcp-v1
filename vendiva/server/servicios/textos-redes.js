// Parte 6: textos de un guion para sus otras redes (Instagram, Facebook, Pinterest).
// Solo las redes que ella marcó; TikTok ya tiene su texto en el guion.
// 1 crédito de texto por cada red, con el aviso antes (decisión de la dueña, 27 nov 2026).
// Mismo orden que las demás creaciones: se aparta el costo, se llama a la IA y,
// si falla, se devuelve lo cobrado.

import crypto from 'node:crypto';
import { COSTOS_CREDITOS, REDES_CON_TEXTO } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorIA } from '../ia/claude.js';
import { generarTextosRedes } from '../ia/guionista.js';
import { cobrar, devolver, renovarSiToca } from './creditos.js';
import { anotarHistorial } from './estado.js';
import { traducirErrorIA, unaALaVez } from './creaciones.js';

/** Las redes (de Instagram, Facebook y Pinterest) que ella marcó, en orden fijo. */
export const redesConTexto = (redes) => REDES_CON_TEXTO.filter((r) => (redes ?? []).includes(r));

export function textosRedesPublico(x) {
  return { id: x.id, creacionId: x.creacion_id, numero: x.numero, redes: x.redes, contenido: x.contenido, creditosCobrados: x.creditos_cobrados, creadoEn: x.creado_en };
}

export async function crearTextosRedes({ db, ia, reloj, usuariaId, creacionId, numero, costoAceptado }) {
  if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);

  return unaALaVez(usuariaId, async () => {
    const id = crypto.randomUUID();
    let cobro = null;
    try {
      // 1. Leer lo necesario y apartar el costo.
      const pedido = await db.tx(async (t) => {
        const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
        if (!fila) throw sinSesion();
        const usuaria = await renovarSiToca(t, fila, reloj());

        const creacion = (
          await t.query(
            `select c.* from creaciones c join productos p on p.id = c.producto_id and not p.oculto
              where c.id = $1 and c.usuaria_id = $2 and c.tipo = 'guiones'`,
            [creacionId, usuariaId],
          )
        ).rows[0];
        const guion = creacion?.contenido?.guiones?.[numero - 1];
        if (!guion) throw noEncontrado('Ese guion');

        const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
        const redes = redesConTexto(perfil.redes);
        if (!redes.length) {
          throw new ErrorApp(409, 'SIN_REDES', 'Marca en Mi cuenta las redes que usas además de TikTok (Instagram, Facebook o Pinterest).', { reintentable: false });
        }

        // El costo depende de cuántas redes marcó: tiene que ser el mismo que ella vio en el aviso.
        const costo = redes.length * COSTOS_CREDITOS.textoRed;
        if (costoAceptado !== costo) {
          throw new ErrorApp(409, 'FALTA_CONFIRMAR', `Antes de crear hay que confirmar el costo: ${costo} ${costo === 1 ? 'crédito' : 'créditos'}.`, {
            datos: { costo, redes },
          });
        }
        const producto = (await t.query('select * from productos where id = $1', [creacion.producto_id])).rows[0];
        // Gratis frena aquí si no le alcanza; los planes de pago no frenan.
        const cobrado = await cobrar(t, usuaria, { costo, motivo: 'textos_redes', referencia: id });
        return { perfil, producto, guion, redes, cobrado };
      });
      cobro = pedido.cobrado;

      // 2. Escribir con la IA.
      let resultado;
      try {
        resultado = await generarTextosRedes(ia, { ...pedido, ahora: reloj() });
      } catch (err) {
        console.error(`[ia] textos_redes falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
        throw traducirErrorIA(err, Boolean(cobro?.total));
      }

      // 3. Guardar.
      const guardado = await db.tx(async (t) => {
        const { rows } = await t.query(
          `insert into textos_redes (id, usuaria_id, creacion_id, numero, redes, contenido, creditos_cobrados, modelo, tokens_entrada, tokens_salida)
           values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10) returning *`,
          [id, usuariaId, creacionId, numero, JSON.stringify(pedido.redes), JSON.stringify(resultado.contenido), cobro?.total ?? 0, resultado.modelo, resultado.uso.entrada, resultado.uso.salida],
        );
        await anotarHistorial(t, usuariaId, 'textos_redes', { titulo: pedido.guion.titulo, redes: pedido.redes, creditos: cobro?.total ?? 0 });
        return rows[0];
      });
      cobro = null;
      return textosRedesPublico(guardado);
    } catch (err) {
      if (cobro?.total) {
        const pendiente = cobro;
        await db
          .tx((t) => devolver(t, usuariaId, pendiente, { referencia: id }))
          .catch((e) => console.error(`[creditos] NO se pudo devolver ${pendiente.total} créditos de los textos ${id} a ${usuariaId}:`, e.message));
      }
      throw err;
    }
  });
}

/** Los últimos textos de cada guion visible, para el estado: { 'creacionId:numero': {...} }. */
export async function textosRedesDe(t, usuariaId, creacionIds) {
  if (!creacionIds.length) return {};
  const { rows } = await t.query(
    `select distinct on (creacion_id, numero) * from textos_redes
      where usuaria_id = $1 and creacion_id = any($2::uuid[])
      order by creacion_id, numero, creado_en desc`,
    [usuariaId, creacionIds],
  );
  return Object.fromEntries(rows.map((x) => [`${x.creacion_id}:${x.numero}`, textosRedesPublico(x)]));
}

// Buscador de productos y tendencias de la semana, con datos de FastMoss.
//
//   Buscador:   UNA llamada a FastMoss por búsqueda, máximo 10 productos. No gasta créditos.
//               Plan Gratis: 60 búsquedas al mes (vuelven a cero el día 1). Pago: sin límite.
//               Solo cuenta una búsqueda que trajo productos (FastMoss no cobra las vacías).
//   Guardar:    un producto del buscador pasa a "mis productos" con su precio, comisión y
//               enlace, respetando el tope de 6 del plan Gratis.
//   Tendencias: solo planes de pago. Los 10 más vendidos de la semana anterior en EE. UU.
//               Un reporte por semana para todas: se pide a FastMoss una sola vez.
//               En Gratis ni se pide ni se muestra.

import crypto from 'node:crypto';
import { LIMITES_GRATIS, esPlanDePago, planFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorFastmoss } from '../fuentes/fastmoss.js';
import { unaALaVez } from './creaciones.js';
import { proximaRenovacion, renovarSiToca, semanaAnteriorFastmoss, semanaDe } from './creditos.js';
import { anotarHistorial } from './estado.js';
import { comprobarTopeProductos } from './productos.js';

async function bloquearUsuaria(t, usuariaId, reloj) {
  const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
  if (!fila) throw sinSesion();
  return renovarSiToca(t, fila, reloj());
}

function traducirErrorFastmoss(err, que) {
  if (err instanceof ErrorFastmoss) {
    console.error(`[fastmoss] ${que} falló: ${err.codigo}${err.detalle ? ` — ${err.detalle}` : ''}`);
    const estado = err.codigo === 'FASTMOSS_PETICION' ? 422 : 503;
    return new ErrorApp(estado, err.codigo, err.message, { reintentable: err.reintentable });
  }
  console.error(`[fastmoss] ${que} falló:`, err);
  return new ErrorApp(503, 'FASTMOSS_FALLO', 'El buscador tuvo un problema. Intenta de nuevo en un momento.');
}

const sinLlave = () =>
  new ErrorApp(503, 'FASTMOSS_SIN_LLAVE', 'El buscador todavía no está conectado. Ya quedó anotado para revisarlo.', { reintentable: false });

// ── Buscador ───────────────────────────────────────────────────────────────────

export async function buscar({ db, fastmoss, reloj, usuariaId, consulta }) {
  if (!fastmoss.lista()) throw sinLlave();

  return unaALaVez(usuariaId, async () => {
    await db.tx(async (t) => {
      const usuaria = await bloquearUsuaria(t, usuariaId, reloj);
      if (planFrenaEnCero(usuaria.plan) && usuaria.busquedas_mes >= LIMITES_GRATIS.busquedasMes) {
        throw new ErrorApp(
          402,
          'LIMITE_BUSQUEDAS',
          `Ya usaste tus ${LIMITES_GRATIS.busquedasMes} búsquedas de este mes. El día 1 vuelven a empezar; en los planes de pago no hay límite.`,
          { datos: { usadas: usuaria.busquedas_mes, maximo: LIMITES_GRATIS.busquedasMes, renuevaEl: proximaRenovacion(usuaria.periodo_creditos) } },
        );
      }
    });

    // Una sola llamada. Si falla, no se reintenta sola: ella decide si toca "Reintentar".
    let r;
    try {
      r = await fastmoss.buscarProductos(consulta);
    } catch (err) {
      throw traducirErrorFastmoss(err, 'búsqueda');
    }

    const fila = await db.tx(async (t) => {
      const { rows } = await t.query(
        `insert into busquedas (id, usuaria_id, nicho, resultado, modelo) values ($1, $2, $3, $4::jsonb, 'fastmoss') returning *`,
        [crypto.randomUUID(), usuariaId, consulta, JSON.stringify({ fuente: 'fastmoss', total: r.total, productos: r.productos })],
      );
      // Solo cuenta si trajo productos (una búsqueda vacía no le quita una de sus 10).
      if (r.productos.length) await t.query('update usuarias set busquedas_mes = busquedas_mes + 1 where id = $1', [usuariaId]);
      await anotarHistorial(t, usuariaId, 'busqueda', { consulta, resultados: r.productos.length });
      return rows[0];
    });
    return { id: fila.id, consulta: fila.nicho, productos: r.productos, guardados: {}, creadoEn: fila.creado_en };
  });
}

export async function guardarProducto({ db, reloj, usuariaId, busquedaId, indice }) {
  return db.tx(async (t) => {
    await bloquearUsuaria(t, usuariaId, reloj);
    const b = (await t.query("select * from busquedas where id = $1 and usuaria_id = $2 and resultado ? 'productos'", [busquedaId, usuariaId])).rows[0];
    const p = b?.resultado.productos[indice];
    if (!p) throw noEncontrado('Ese producto');

    // Si ya lo guardó (desde esta u otra búsqueda) y sigue en su lista, no se duplica.
    const yaEsta = (await t.query('select id from productos where usuaria_id = $1 and fastmoss_id = $2', [usuariaId, p.id])).rows[0];
    if (yaEsta) {
      await t.query('update busquedas set guardados = guardados || jsonb_build_object($2::text, $3::text) where id = $1', [busquedaId, String(indice), yaEsta.id]);
      return { productoId: yaEsta.id, nuevo: false };
    }

    await comprobarTopeProductos(t, usuariaId);

    const productoId = crypto.randomUUID();
    await t.query(
      `insert into productos (id, usuaria_id, nombre, descripcion, precio_centavos, comision_pct, enlace, origen, fastmoss_id)
       values ($1, $2, $3, $4, $5, $6, $7, 'buscador', $8)`,
      [
        productoId,
        usuariaId,
        p.titulo.slice(0, 80),
        // Si el título es largo, completo va en la descripción para que los guiones lo tengan.
        p.titulo.length > 80 ? p.titulo.slice(0, 500) : null,
        p.precioNumero == null ? null : Math.round(p.precioNumero * 100),
        p.comisionPct != null && p.comisionPct >= 0 && p.comisionPct <= 100 ? p.comisionPct : null,
        p.enlace,
        p.id,
      ],
    );
    await t.query('update busquedas set guardados = guardados || jsonb_build_object($2::text, $3::text) where id = $1', [busquedaId, String(indice), productoId]);
    await anotarHistorial(t, usuariaId, 'producto_agregado', { productoId, nombre: p.titulo.slice(0, 80), origen: 'buscador' });
    return { productoId, nuevo: true };
  });
}

// ── Tendencias de la semana ────────────────────────────────────────────────────

const pendientes = new Map(); // semana -> promesa: si dos piden a la vez, FastMoss recibe una sola llamada

export function tendenciaPublica(fila) {
  return { id: fila.id, semana: fila.semana, semanaDatos: fila.semana_datos, productos: fila.productos, creadoEn: fila.creado_en };
}

export async function crearTendencias({ db, fastmoss, reloj, usuariaId }) {
  const ahora = reloj();
  const semana = semanaDe(ahora);

  const usuaria = await db.tx((t) => bloquearUsuaria(t, usuariaId, reloj));
  if (!esPlanDePago(usuaria.plan)) {
    throw new ErrorApp(403, 'SOLO_PLANES_DE_PAGO', 'Las tendencias de la semana son de los planes de pago. Sube de plan para verlas.');
  }

  const existente = (await db.query('select * from tendencias_semana where semana = $1', [semana])).rows[0];
  if (existente) return tendenciaPublica(existente);
  if (!fastmoss.lista()) throw sinLlave();

  if (!pendientes.has(semana)) {
    const trabajo = (async () => {
      // La semana anterior completa. Si FastMoss todavía no la tiene (vacía, no se cobra),
      // se pide la de antes.
      let semanaDatos = semanaAnteriorFastmoss(ahora, 1);
      let r;
      try {
        r = await fastmoss.masVendidosDeLaSemana(semanaDatos);
        if (!r.productos.length) {
          semanaDatos = semanaAnteriorFastmoss(ahora, 2);
          r = await fastmoss.masVendidosDeLaSemana(semanaDatos);
        }
      } catch (err) {
        throw traducirErrorFastmoss(err, 'tendencias');
      }
      if (!r.productos.length) {
        throw new ErrorApp(503, 'TENDENCIAS_VACIAS', 'Todavía no hay datos de esta semana. Intenta de nuevo mañana.', { reintentable: false });
      }
      const { rows } = await db.query(
        `insert into tendencias_semana (id, semana, semana_datos, productos) values ($1, $2, $3, $4::jsonb)
         on conflict (semana) do nothing returning *`,
        [crypto.randomUUID(), semana, semanaDatos, JSON.stringify(r.productos)],
      );
      return rows[0] ?? (await db.query('select * from tendencias_semana where semana = $1', [semana])).rows[0];
    })();
    pendientes.set(semana, trabajo);
    trabajo.finally(() => pendientes.delete(semana)).catch(() => {});
  }
  return tendenciaPublica(await pendientes.get(semana));
}

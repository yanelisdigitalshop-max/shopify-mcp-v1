// Buscador de productos y tendencias de la semana.
//
//   Buscador:   gratis en créditos. Plan Gratis: 10 búsquedas al mes (vuelven a cero
//               el día 1). Planes de pago: sin límite. Solo cuenta lo entregado.
//   Guardar:    una idea del buscador pasa a "mis productos", respetando el tope de 6
//               del plan Gratis.
//   Tendencias: solo planes de pago. Un reporte por semana, con búsqueda web.
//               En Gratis ni se crea ni se ve.

import crypto from 'node:crypto';
import { LIMITES_GRATIS, esPlanDePago, planFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorIA } from '../ia/claude.js';
import { generarBusqueda, generarTendencias } from '../ia/descubrir.js';
import { traducirErrorIA, unaALaVez } from './creaciones.js';
import { proximaRenovacion, renovarSiToca, semanaDe } from './creditos.js';
import { anotarHistorial } from './estado.js';
import { comprobarTopeProductos } from './productos.js';

export function busquedaPublica(b, productosExistentes) {
  // "guardados" solo cuenta los productos que siguen existiendo (si borró uno, puede guardarlo de nuevo).
  const guardados = Object.fromEntries(Object.entries(b.guardados ?? {}).filter(([, id]) => productosExistentes.has(id)));
  return { id: b.id, nicho: b.nicho, ideas: b.resultado.ideas, consejo: b.resultado.consejo, guardados, creadoEn: b.creado_en };
}

export function tendenciaPublica(t) {
  return { id: t.id, semana: t.semana, resumen: t.contenido.resumen, tendencias: t.contenido.tendencias, creadoEn: t.creado_en };
}

async function bloquearUsuaria(t, usuariaId, reloj) {
  const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
  if (!fila) throw sinSesion();
  return renovarSiToca(t, fila, reloj());
}

// ── Buscador ───────────────────────────────────────────────────────────────────

export async function buscar({ db, ia, reloj, usuariaId, nicho }) {
  if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);

  return unaALaVez(usuariaId, async () => {
    const pedido = await db.tx(async (t) => {
      const usuaria = await bloquearUsuaria(t, usuariaId, reloj);
      if (planFrenaEnCero(usuaria.plan) && usuaria.busquedas_mes >= LIMITES_GRATIS.busquedasMes) {
        throw new ErrorApp(
          402,
          'LIMITE_BUSQUEDAS',
          `Ya usaste tus ${LIMITES_GRATIS.busquedasMes} búsquedas de este mes. El día 1 vuelven a empezar; en los planes de pago no hay límite.`,
          { datos: { usadas: usuaria.busquedas_mes, maximo: LIMITES_GRATIS.busquedasMes, renuevaEl: proximaRenovacion(usuaria.periodo_creditos) } },
        );
      }
      const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
      const yaTiene = (await t.query('select nombre from productos where usuaria_id = $1 order by creado_en desc limit 20', [usuariaId])).rows.map((r) => r.nombre);
      return { perfil, yaTiene };
    });

    let r;
    try {
      r = await generarBusqueda(ia, { ...pedido, nicho, ahora: reloj() });
    } catch (err) {
      console.error(`[ia] buscador falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
      throw traducirErrorIA(err, false);
    }

    const id = crypto.randomUUID();
    const fila = await db.tx(async (t) => {
      const { rows } = await t.query(
        `insert into busquedas (id, usuaria_id, nicho, resultado, modelo, tokens_entrada, tokens_salida)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7) returning *`,
        [id, usuariaId, nicho, JSON.stringify(r.contenido), r.modelo, r.uso.entrada, r.uso.salida],
      );
      // Solo cuenta para el límite la búsqueda que se entregó.
      await t.query('update usuarias set busquedas_mes = busquedas_mes + 1 where id = $1', [usuariaId]);
      await anotarHistorial(t, usuariaId, 'busqueda', { nicho });
      return rows[0];
    });
    return busquedaPublica(fila, new Set());
  });
}

export async function guardarIdea({ db, reloj, usuariaId, busquedaId, indice }) {
  return db.tx(async (t) => {
    await bloquearUsuaria(t, usuariaId, reloj);
    const b = (await t.query('select * from busquedas where id = $1 and usuaria_id = $2', [busquedaId, usuariaId])).rows[0];
    const idea = b?.resultado.ideas[indice];
    if (!idea) throw noEncontrado('Esa idea');

    // Si ya la guardó y el producto sigue ahí, no se duplica.
    const anterior = b.guardados?.[indice];
    if (anterior) {
      const existe = (await t.query('select 1 from productos where id = $1 and usuaria_id = $2', [anterior, usuariaId])).rows.length;
      if (existe) return { productoId: anterior, nuevo: false };
    }

    await comprobarTopeProductos(t, usuariaId);

    const productoId = crypto.randomUUID();
    // La descripción es lo que sabemos de verdad: por qué suele vender. Ella le agrega
    // el precio, la comisión y el enlace cuando encuentre el producto en TikTok Shop.
    await t.query(
      `insert into productos (id, usuaria_id, nombre, descripcion, origen) values ($1, $2, $3, $4, 'buscador')`,
      [productoId, usuariaId, idea.producto.slice(0, 80), idea.porQueVende.slice(0, 500)],
    );
    await t.query(`update busquedas set guardados = guardados || jsonb_build_object($2::text, $3::text) where id = $1`, [busquedaId, String(indice), productoId]);
    await anotarHistorial(t, usuariaId, 'producto_agregado', { productoId, nombre: idea.producto, origen: 'buscador' });
    return { productoId, nuevo: true };
  });
}

// ── Tendencias de la semana ────────────────────────────────────────────────────

const soloPago = () =>
  new ErrorApp(403, 'SOLO_PLANES_DE_PAGO', 'Las tendencias de la semana son de los planes de pago. Sube de plan para verlas.');

export async function crearTendencias({ db, ia, reloj, usuariaId }) {
  if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);

  return unaALaVez(usuariaId, async () => {
    const semana = semanaDe(reloj());
    const pedido = await db.tx(async (t) => {
      const usuaria = await bloquearUsuaria(t, usuariaId, reloj);
      if (!esPlanDePago(usuaria.plan)) throw soloPago();
      const existente = (await t.query('select * from tendencias where usuaria_id = $1 and semana = $2', [usuariaId, semana])).rows[0];
      const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
      return { existente, perfil };
    });
    // Uno por semana: si ya está, se devuelve el mismo sin volver a buscar.
    if (pedido.existente) return tendenciaPublica(pedido.existente);

    let r;
    try {
      r = await generarTendencias(ia, { perfil: pedido.perfil, ahora: reloj() });
    } catch (err) {
      console.error(`[ia] tendencias falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
      throw traducirErrorIA(err, false);
    }

    const fila = await db.tx(async (t) => {
      const { rows } = await t.query(
        `insert into tendencias (id, usuaria_id, semana, contenido, modelo, tokens_entrada, tokens_salida, busquedas_web)
         values ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         on conflict (usuaria_id, semana) do nothing returning *`,
        [crypto.randomUUID(), usuariaId, semana, JSON.stringify(r.contenido), r.modelo, r.uso.entrada, r.uso.salida, r.busquedasWeb ?? 0],
      );
      return rows[0] ?? (await t.query('select * from tendencias where usuaria_id = $1 and semana = $2', [usuariaId, semana])).rows[0];
    });
    return tendenciaPublica(fila);
  });
}

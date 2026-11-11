// Crear con la IA: guiones (gratis), guion de en vivo (10 créditos) y
// respuestas a comentarios (3 créditos).
//
// Orden para lo que cuesta créditos:
//   1. Se aparta el costo (se cobra) dentro de una transacción con la fila de
//      la usuaria bloqueada. Si es Gratis y no alcanza, frena aquí: la IA ni se llama.
//   2. Se llama a la IA.
//   3. Si salió bien, se guarda la creación. Si falló, se devuelve lo cobrado.
// Así nunca se entrega algo sin cobrar ni se cobra algo que no se entregó.

import crypto from 'node:crypto';
import { COSTOS_CREDITOS, CREACIONES, LIMITES_GRATIS, planFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorIA } from '../ia/claude.js';
import { generarEnVivo, generarGuiones, generarRespuestas } from '../ia/guionista.js';
import { cobrar, devolver, proximaRenovacion, renovarSiToca } from './creditos.js';
import { anotarHistorial } from './estado.js';

const GENERADORES = {
  guiones: generarGuiones,
  guion_en_vivo: generarEnVivo,
  respuestas_comentarios: generarRespuestas,
};

// Una creación a la vez por usuaria: evita toques dobles y que alguien dispare
// muchas llamadas pagadas a la IA al mismo tiempo.
const creando = new Set();

function traducirErrorIA(err, seCobro) {
  const sinCargo = seCobro ? ' No se gastó ningún crédito.' : '';
  if (!(err instanceof ErrorIA)) {
    return new ErrorApp(503, 'IA_FALLO', `Algo salió mal al crear. Intenta de nuevo.${sinCargo}`);
  }
  if (err.codigo === 'IA_DECLINO') return new ErrorApp(422, 'IA_DECLINO', `${err.message}${sinCargo}`);
  if (err.reintentable) return new ErrorApp(503, err.codigo, `${err.message}${sinCargo}`);
  // Llave faltante o rechazada, petición mal armada: ella no puede arreglarlo.
  return new ErrorApp(503, 'IA_NO_DISPONIBLE', `La inteligencia artificial no está disponible en este momento. Ya quedó anotado para revisarlo.${sinCargo}`);
}

export function creacionPublica(c) {
  return {
    id: c.id,
    productoId: c.producto_id,
    tipo: c.tipo,
    contenido: c.contenido,
    creditosCobrados: c.creditos_cobrados,
    creadoEn: c.creado_en,
  };
}

/**
 * @param {object} p
 * @param {'guiones'|'guion_en_vivo'|'respuestas_comentarios'} p.tipo
 * @param {number} [p.costoAceptado]  el costo que ella vio y aceptó en el aviso
 */
export async function crear({ db, ia, reloj, usuariaId, productoId, tipo, costoAceptado }) {
  const { costo } = CREACIONES[tipo];

  // Lo que cuesta créditos solo se crea si ella confirmó en el aviso, y por el costo que vio.
  if (costo > 0 && costoAceptado !== costo) {
    throw new ErrorApp(409, 'FALTA_CONFIRMAR', `Antes de crear hay que confirmar el costo: ${costo} créditos.`, { datos: { costo } });
  }
  if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);

  if (creando.has(usuariaId)) {
    throw new ErrorApp(409, 'YA_CREANDO', 'Ya estamos creando algo para ti. Espera a que termine y vuelve a tocar.');
  }
  creando.add(usuariaId);

  const id = crypto.randomUUID();
  let cobro = null;
  let costoGuiones = 0; // los guiones son gratis, salvo los extra del plan Gratis

  try {
    // 1. Leer lo necesario y apartar el costo.
    const pedido = await db.tx(async (t) => {
      const fila = (await t.query('select * from usuarias where id = $1 for update', [usuariaId])).rows[0];
      if (!fila) throw sinSesion();
      const usuaria = await renovarSiToca(t, fila, reloj());

      const producto = (await t.query('select * from productos where id = $1 and usuaria_id = $2 and not oculto', [productoId, usuariaId])).rows[0];
      if (!producto) throw noEncontrado('Ese producto');
      const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];

      let extra = {};
      if (tipo === 'guiones') {
        // Plan Gratis: los guiones son gratis hasta el tope del mes. Después, cada vez
        // extra cuesta 1 crédito, y solo si ella lo confirmó en el aviso.
        if (planFrenaEnCero(usuaria.plan) && usuaria.guiones_mes >= LIMITES_GRATIS.guionesMes) {
          costoGuiones = COSTOS_CREDITOS.guionesExtraGratis;
          if (costoAceptado !== costoGuiones) {
            throw new ErrorApp(
              409,
              'LIMITE_GUIONES',
              `Llegaste al límite de guiones gratis de este mes. Puedes seguir creando: cada vez extra cuesta ${costoGuiones} crédito.`,
              {
                datos: {
                  costo: costoGuiones,
                  usados: usuaria.guiones_mes,
                  maximo: LIMITES_GRATIS.guionesMes,
                  renuevaEl: proximaRenovacion(usuaria.periodo_creditos),
                },
              },
            );
          }
        }
        const anteriores = (
          await t.query("select contenido from creaciones where producto_id = $1 and tipo = 'guiones' order by creado_en desc limit 3", [productoId])
        ).rows;
        const veces = (await t.query("select count(*)::int as n from creaciones where producto_id = $1 and tipo = 'guiones'", [productoId])).rows[0].n;
        extra = {
          vecesAnteriores: veces,
          ganchosUsados: anteriores.flatMap((c) => (c.contenido.guiones ?? []).map((g) => g.gancho)).slice(0, 9),
        };
      }

      // Gratis frena aquí si no le alcanza (también para el crédito de un guion extra).
      const cobrado =
        costo > 0
          ? await cobrar(t, usuaria, { costo, motivo: tipo, referencia: id })
          : costoGuiones > 0
            ? await cobrar(t, usuaria, { costo: costoGuiones, motivo: 'guiones_extra', referencia: id })
            : null;
      return { perfil, producto, cobrado, ...extra };
    });
    // Solo cuenta como cobrado cuando la transacción ya quedó guardada.
    cobro = pedido.cobrado;

    // 2. Escribir con la IA.
    let resultado;
    try {
      resultado = await GENERADORES[tipo](ia, { ...pedido, ahora: reloj() });
    } catch (err) {
      // Se anota el motivo (nunca el contenido ni la llave) para poder revisarlo.
      console.error(`[ia] ${tipo} falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}${err.cause?.status ? ` (HTTP ${err.cause.status})` : ''}`);
      throw traducirErrorIA(err, Boolean(cobro?.total));
    }

    // 3. Guardar.
    const guardada = await db.tx(async (t) => {
      const { rows } = await t.query(
        `insert into creaciones (id, usuaria_id, producto_id, tipo, contenido, creditos_cobrados, modelo, tokens_entrada, tokens_salida)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9) returning *`,
        [id, usuariaId, productoId, tipo, JSON.stringify(resultado.contenido), cobro?.total ?? 0, resultado.modelo, resultado.uso.entrada, resultado.uso.salida],
      );
      await anotarHistorial(t, usuariaId, 'creacion', { tipo, productoId, nombre: pedido.producto.nombre, creditos: cobro?.total ?? 0 });
      // Solo cuenta para el tope lo que de verdad se entregó.
      if (tipo === 'guiones') await t.query('update usuarias set guiones_mes = guiones_mes + 1 where id = $1', [usuariaId]);
      return rows[0];
    });
    cobro = null; // entregado: ya no hay nada que devolver
    return creacionPublica(guardada);
  } catch (err) {
    // No se entregó: se devuelve lo cobrado antes de avisar.
    if (cobro?.total) {
      const pendiente = cobro;
      await db
        .tx((t) => devolver(t, usuariaId, pendiente, { referencia: id }))
        .catch((e) => console.error(`[creditos] NO se pudo devolver ${pendiente.total} créditos de la creación ${id} a ${usuariaId}:`, e.message));
    }
    throw err;
  } finally {
    creando.delete(usuariaId);
  }
}

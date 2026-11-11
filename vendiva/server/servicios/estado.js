// El estado completo de una usuaria, tal como lo necesita el cliente.
// El servidor es la fuente de verdad: cada cambio devuelve este mismo objeto.

import crypto from 'node:crypto';
import { LIMITES_GRATIS, PLANES, esPlanDePago, nivelPara, planFrenaEnCero } from '../../shared/datos.js';
import { sinSesion } from '../errores.js';
import { renovarSiToca, proximaRenovacion, semanaDe } from './creditos.js';

export function productoPublico(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio_centavos == null ? null : p.precio_centavos / 100,
    comisionPct: p.comision_pct == null ? null : Number(p.comision_pct),
    enlace: p.enlace,
    origen: p.origen,
    creadoEn: p.creado_en,
  };
}

export async function anotarHistorial(t, usuariaId, tipo, detalle = {}) {
  await t.query('insert into historial (id, usuaria_id, tipo, detalle) values ($1, $2, $3, $4::jsonb)', [
    crypto.randomUUID(),
    usuariaId,
    tipo,
    JSON.stringify(detalle),
  ]);
}

export async function construirEstado(db, usuariaId, ahora = new Date()) {
  return db.tx(async (t) => {
    const { rows } = await t.query('select * from usuarias where id = $1 for update', [usuariaId]);
    if (!rows[0]) throw sinSesion();
    const usuaria = await renovarSiToca(t, rows[0], ahora);

    const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
    const productos = (
      await t.query('select * from productos where usuaria_id = $1 and not oculto order by creado_en desc, id', [
        usuariaId,
      ])
    ).rows;
    const totalProductos = (
      await t.query('select count(*)::int as n from productos where usuaria_id = $1', [usuariaId])
    ).rows[0].n;
    const historial = (
      await t.query(
        'select id, tipo, detalle, creado_en from historial where usuaria_id = $1 order by creado_en desc, id limit 20',
        [usuariaId],
      )
    ).rows;

    // Lo último que la IA escribió para cada producto, por tipo.
    const ultimas = (
      await t.query(
        `select distinct on (producto_id, tipo) id, producto_id, tipo, contenido, creditos_cobrados, creado_en
           from creaciones
          where usuaria_id = $1
          order by producto_id, tipo, creado_en desc`,
        [usuariaId],
      )
    ).rows;
    const visibles = new Set(productos.map((p) => p.id));
    const creaciones = {};
    for (const c of ultimas) {
      if (!visibles.has(c.producto_id)) continue;
      (creaciones[c.producto_id] ??= {})[c.tipo] = {
        id: c.id,
        productoId: c.producto_id,
        tipo: c.tipo,
        contenido: c.contenido,
        creditosCobrados: c.creditos_cobrados,
        creadoEn: c.creado_en,
      };
    }

    const plan = PLANES[usuaria.plan];

    // Buscador: la última búsqueda, con las ideas que ya guardó como producto.
    const ultimaBusqueda = (
      await t.query('select * from busquedas where usuaria_id = $1 order by creado_en desc limit 1', [usuariaId])
    ).rows[0];
    const idsProductos = new Set(productos.map((p) => p.id));
    const buscador = {
      ultima: ultimaBusqueda
        ? (() => {
            const guardados = Object.fromEntries(Object.entries(ultimaBusqueda.guardados ?? {}).filter(([, id]) => idsProductos.has(id)));
            return { id: ultimaBusqueda.id, nicho: ultimaBusqueda.nicho, ideas: ultimaBusqueda.resultado.ideas, consejo: ultimaBusqueda.resultado.consejo, guardados, creadoEn: ultimaBusqueda.creado_en };
          })()
        : null,
    };

    // Tendencias: solo de pago. En Gratis no se manda ni el reporte (aunque exista de antes).
    let tendencias = { disponible: false };
    if (esPlanDePago(usuaria.plan)) {
      const semana = semanaDe(ahora);
      const t2 = (await t.query('select * from tendencias where usuaria_id = $1 and semana = $2', [usuariaId, semana])).rows[0];
      tendencias = {
        disponible: true,
        semana,
        reporte: t2 ? { id: t2.id, semana: t2.semana, resumen: t2.contenido.resumen, tendencias: t2.contenido.tendencias, creadoEn: t2.creado_en } : null,
      };
    }

    return {
      usuaria: {
        id: usuaria.id,
        nombre: usuaria.nombre,
        correo: usuaria.correo,
        telefono: usuaria.telefono,
        creadaEn: usuaria.creada_en,
      },
      perfil: {
        nicho: perfil.nicho,
        seguidores: perfil.seguidores,
        modoGrabacion: perfil.modo_grabacion,
        objetivo: perfil.objetivo,
        usuarioTiktok: perfil.usuario_tiktok,
        redes: perfil.redes,
        onboardingPaso: perfil.onboarding_paso,
        onboardingCompleto: perfil.onboarding_completo,
      },
      nivel: nivelPara(perfil.seguidores),
      plan,
      creditos: {
        plan: usuaria.creditos_plan,
        paquete: usuaria.creditos_paquete,
        total: usuaria.creditos_plan + usuaria.creditos_paquete,
        periodo: usuaria.periodo_creditos,
        renuevaEl: proximaRenovacion(usuaria.periodo_creditos),
      },
      productos: productos.map(productoPublico),
      creaciones,
      buscador,
      tendencias,
      limites: {
        productosUsados: totalProductos,
        productosMax: plan.maxProductos,
        puedeAgregarProducto: plan.maxProductos == null || totalProductos < plan.maxProductos,
        // Veces que creó "sus 3 guiones" este mes. Solo el plan Gratis tiene tope (null = sin tope).
        guionesUsados: usuaria.guiones_mes,
        guionesMax: planFrenaEnCero(usuaria.plan) ? LIMITES_GRATIS.guionesMes : null,
        // Búsquedas del buscador este mes. Solo el plan Gratis tiene límite (null = sin límite).
        busquedasUsadas: usuaria.busquedas_mes,
        busquedasMax: planFrenaEnCero(usuaria.plan) ? LIMITES_GRATIS.busquedasMes : null,
      },
      historial: historial.map((h) => ({ id: h.id, tipo: h.tipo, detalle: h.detalle, creadoEn: h.creado_en })),
    };
  });
}

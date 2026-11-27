// El estado completo de una usuaria, tal como lo necesita el cliente.
// El servidor es la fuente de verdad: cada cambio devuelve este mismo objeto.

import crypto from 'node:crypto';
import { DURACION_VIDEO_SEGUNDOS, LIMITES_GRATIS, MOTOR_VIDEO, PLANES, esPlanDePago, nivelPara, planFrenaEnCero } from '../../shared/datos.js';
import { sinSesion } from '../errores.js';
import { pagoVozIA, renovarSiToca, proximaRenovacion, semanaDe } from './creditos.js';
import { agendaDe } from './publicaciones.js';
import { textosRedesDe } from './textos-redes.js';
import { vitrinaDe } from './vitrina.js';
import { pagosDe, tieneSuscripcion } from './pagos.js';
import { ZONA_HORARIA } from '../../shared/datos.js';

export function productoPublico(p) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion,
    precio: p.precio_centavos == null ? null : p.precio_centavos / 100,
    comisionPct: p.comision_pct == null ? null : Number(p.comision_pct),
    enlace: p.enlace,
    origen: p.origen,
    imagen: p.imagen_url ?? null,
    creadoEn: p.creado_en,
  };
}

/** Un video con IA, tal como lo ve la usuaria (sin el enlace de Runway: se pide fresco al verlo). */
export function videoPublico(v, voz = null) {
  return {
    id: v.id,
    productoId: v.producto_id,
    tipo: v.tipo,
    indice: v.indice,
    estado: v.estado,
    motor: MOTOR_VIDEO.nombre,
    modelo: MOTOR_VIDEO.modelo,
    duracion: v.duracion,
    gratis: v.gratis,
    creditosCobrados: v.creditos_cobrados,
    titulo: v.guion?.titulo ?? null,
    guion: v.guion ? { conCamara: v.guion.conCamara, sinCamara: v.guion.sinCamara, textoEnPantalla: v.guion.textoEnPantalla } : null,
    prompt: v.prompt,
    falla: v.estado === 'fallido' ? v.falla : null,
    // La voz del video (los de Runway salen sin sonido): la de ella o la de IA.
    voz: voz ? { tipo: voz.tipo, creditosCobrados: voz.creditos_cobrados, creadoEn: voz.creado_en } : null,
    // Mientras no lo descargue, al abrirlo se le avisa que el enlace de Runway vence.
    descargado: Boolean(v.descargado_en),
    creadoEn: v.creado_en,
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

    // Videos con IA: el último de cada lugar (producto, tipo, 1 a 3).
    const ultimosVideos = (
      await t.query(
        `select distinct on (producto_id, tipo, indice) * from videos
          where usuaria_id = $1 order by producto_id, tipo, indice, creado_en desc`,
        [usuariaId],
      )
    ).rows;
    const voces = new Map(
      (await t.query('select video_id, tipo, creditos_cobrados, creado_en from voces where usuaria_id = $1', [usuariaId])).rows.map((x) => [x.video_id, x]),
    );
    const videos = {};
    for (const v of ultimosVideos) {
      if (!productos.some((p) => p.id === v.producto_id)) continue;
      const porProducto = (videos[v.producto_id] ??= { corto: [null, null, null], desde_foto: [null, null, null] });
      porProducto[v.tipo][v.indice - 1] = videoPublico(v, voces.get(v.id));
    }

    // Buscador: la última búsqueda con FastMoss, con los productos que ya guardó.
    const ultimaBusqueda = (
      await t.query("select * from busquedas where usuaria_id = $1 and resultado ? 'productos' order by creado_en desc limit 1", [usuariaId])
    ).rows[0];
    const idsProductos = new Set(productos.map((p) => p.id));
    const buscador = {
      ultima: ultimaBusqueda
        ? {
            id: ultimaBusqueda.id,
            consulta: ultimaBusqueda.nicho,
            productos: ultimaBusqueda.resultado.productos,
            // Solo los que siguen en su lista: si borró uno, puede guardarlo otra vez.
            guardados: Object.fromEntries(Object.entries(ultimaBusqueda.guardados ?? {}).filter(([, id]) => idsProductos.has(id))),
            creadoEn: ultimaBusqueda.creado_en,
          }
        : null,
    };

    // Tendencias: solo de pago. En Gratis no se manda nada del reporte.
    let tendencias = { disponible: false };
    if (esPlanDePago(usuaria.plan)) {
      const semana = semanaDe(ahora);
      const fila = (await t.query('select * from tendencias_semana where semana = $1', [semana])).rows[0];
      tendencias = {
        disponible: true,
        semana,
        reporte: fila ? { id: fila.id, semana: fila.semana, semanaDatos: fila.semana_datos, productos: fila.productos, creadoEn: fila.creado_en } : null,
      };
    }

    // Parte 5: su calendario de publicaciones (gratis e ilimitado en todos los planes).
    const agenda = await agendaDe(t, usuariaId, ahora);

    // Parte 6: los textos para sus redes de los guiones que se ven, y su Vitrina (solo Pro).
    const idsGuiones = Object.values(creaciones).map((c) => c.guiones?.id).filter(Boolean);
    const textosRedes = await textosRedesDe(t, usuariaId, idsGuiones);
    const vitrina = await vitrinaDe(t, usuaria);

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
        usuarioInstagram: perfil.usuario_instagram,
        usuarioFacebook: perfil.usuario_facebook,
        usuarioPinterest: perfil.usuario_pinterest,
        redes: perfil.redes,
        onboardingPaso: perfil.onboarding_paso,
        onboardingCompleto: perfil.onboarding_completo,
      },
      nivel: nivelPara(perfil.seguidores),
      plan,
      creditos: {
        // "plan" y "total" son los créditos de TEXTO (guion de en vivo, respuestas, GIFs, guiones extra).
        plan: usuaria.creditos_plan,
        total: usuaria.creditos_plan,
        // Créditos de VIDEO: los del plan y los de paquetes (que no vencen).
        video: {
          plan: usuaria.creditos_video_plan,
          paquete: usuaria.creditos_paquete,
          total: usuaria.creditos_video_plan + usuaria.creditos_paquete,
        },
        // Plan Gratis: 1 video corto de 10 segundos al mes, sin créditos.
        videoGratis: planFrenaEnCero(usuaria.plan)
          ? { incluido: true, disponible: !usuaria.video_gratis_usado, segundos: DURACION_VIDEO_SEGUNDOS }
          : { incluido: false, disponible: false, segundos: DURACION_VIDEO_SEGUNDOS },
        // Voz de IA: cuánto cuesta, con qué se paga la próxima y cuántas lleva este mes (Gratis: 3).
        vozIA: pagoVozIA(usuaria),
        periodo: usuaria.periodo_creditos,
        // Con suscripción: el día de su próximo cobro (en su propia fecha). Si no, el día 1.
        renuevaEl: tieneSuscripcion(usuaria) && usuaria.suscripcion_fin
          ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(usuaria.suscripcion_fin)
          : proximaRenovacion(usuaria.periodo_creditos),
      },
      productos: productos.map(productoPublico),
      creaciones,
      videos,
      buscador,
      tendencias,
      agenda,
      textosRedes,
      vitrina,
      // Parte 7: pagos (modo de prueba) y su suscripción.
      pagos: pagosDe(usuaria),
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

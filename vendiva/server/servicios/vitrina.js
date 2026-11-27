// Parte 6: Vitrina. Solo plan Pro, sin créditos extra (decisión de la dueña, 27 nov 2026).
//
// Ella escribe sus estrellas, cuántas reseñas tiene y de qué se quejan (Vendiva no entra
// a su TikTok). Cada calificación queda en su historial y Claude le escribe un plan nuevo
// para mantenerla arriba de 4. Si la IA falla, la calificación igual queda guardada y el
// plan se puede pedir otra vez.

import crypto from 'node:crypto';
import { QUEJAS_VITRINA, VITRINA, esPlanPro } from '../../shared/datos.js';
import { ErrorApp, noEncontrado, sinSesion } from '../errores.js';
import { ErrorIA } from '../ia/claude.js';
import { generarPlanVitrina } from '../ia/guionista.js';
import { anotarHistorial } from './estado.js';
import { traducirErrorIA, unaALaVez } from './creaciones.js';

const HISTORIAL_VISIBLE = 12;

const soloPro = () =>
  new ErrorApp(403, 'SOLO_PRO', 'La Vitrina es del plan Pro. Sube de plan para usarla.', { reintentable: false });

function calificacionPublica(c) {
  return {
    id: c.id,
    estrellas: Number(c.estrellas),
    resenas: c.resenas,
    quejas: c.quejas,
    quejaOtra: c.queja_otra,
    plan: c.plan,
    creadoEn: c.creado_en,
  };
}

/** Lo que ve en la pestaña Vitrina. Fuera de Pro no se manda nada de su historial. */
export async function vitrinaDe(t, usuaria) {
  if (!esPlanPro(usuaria.plan)) return { disponible: false };
  const { rows } = await t.query('select * from vitrina_calificaciones where usuaria_id = $1 order by creado_en desc, id limit $2', [
    usuaria.id,
    HISTORIAL_VISIBLE,
  ]);
  const historial = rows.map(calificacionPublica);
  const [ultima, anterior] = historial;
  return {
    disponible: true,
    minimo: VITRINA.minimoEstrellas,
    ultima: ultima ?? null,
    historial,
    // El aviso: su calificación está debajo de 4.
    bajoDelMinimo: Boolean(ultima && ultima.estrellas < VITRINA.minimoEstrellas),
    cambio: ultima && anterior ? Math.round((ultima.estrellas - anterior.estrellas) * 10) / 10 : null,
  };
}

const nombreQueja = (id) => QUEJAS_VITRINA.find((q) => q.id === id)?.nombre ?? id;

async function escribirPlan({ db, ia, reloj, usuariaId, calificacionId }) {
  const pedido = await db.tx(async (t) => {
    const perfil = (await t.query('select * from perfiles where usuaria_id = $1', [usuariaId])).rows[0];
    const productos = (await t.query('select nombre from productos where usuaria_id = $1 and not oculto order by creado_en desc limit 6', [usuariaId])).rows.map((p) => p.nombre);
    const c = (await t.query('select * from vitrina_calificaciones where id = $1 and usuaria_id = $2', [calificacionId, usuariaId])).rows[0];
    const anteriores = (
      await t.query('select * from vitrina_calificaciones where usuaria_id = $1 and creado_en < $2 order by creado_en desc limit 5', [usuariaId, c.creado_en])
    ).rows.map((x) => ({
      fecha: new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(x.creado_en),
      estrellas: Number(x.estrellas),
      resenas: x.resenas,
    }));
    const quejas = [...c.quejas.map(nombreQueja), c.queja_otra ? `Otra: ${c.queja_otra}` : null].filter(Boolean);
    return { perfil, productos, anteriores, quejas, calificacion: { estrellas: Number(c.estrellas), resenas: c.resenas } };
  });

  let resultado;
  try {
    resultado = await generarPlanVitrina(ia, { ...pedido, ahora: reloj() });
  } catch (err) {
    console.error(`[ia] plan de vitrina falló: ${err.codigo ?? err.name}${err.detalle ? ` — ${err.detalle}` : ''}`);
    const e = traducirErrorIA(err, false);
    e.message = `${e.message} Tu calificación sí quedó guardada.`;
    throw e;
  }
  await db.query('update vitrina_calificaciones set plan = $2::jsonb, modelo = $3, tokens_entrada = $4, tokens_salida = $5 where id = $1', [
    calificacionId,
    JSON.stringify(resultado.contenido),
    resultado.modelo,
    resultado.uso.entrada,
    resultado.uso.salida,
  ]);
}

/** Guarda la calificación nueva y le escribe su plan. */
export async function guardarCalificacion({ db, ia, reloj, usuariaId, datos }) {
  return unaALaVez(usuariaId, async () => {
    const id = crypto.randomUUID();
    await db.tx(async (t) => {
      const u = (await t.query('select * from usuarias where id = $1', [usuariaId])).rows[0];
      if (!u) throw sinSesion();
      if (!esPlanPro(u.plan)) throw soloPro();
      await t.query(
        'insert into vitrina_calificaciones (id, usuaria_id, estrellas, resenas, quejas, queja_otra, creado_en) values ($1, $2, $3, $4, $5::jsonb, $6, $7)',
        [id, usuariaId, datos.estrellas, datos.resenas, JSON.stringify(datos.quejas), datos.quejaOtra, reloj()],
      );
      await anotarHistorial(t, usuariaId, 'vitrina_actualizada', { estrellas: datos.estrellas, resenas: datos.resenas });
    });
    // La calificación ya quedó. Ahora el plan; sin la llave se avisa igual que en lo demás.
    if (!ia.lista()) {
      const e = traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);
      e.message = `${e.message} Tu calificación sí quedó guardada.`;
      throw e;
    }
    await escribirPlan({ db, ia, reloj, usuariaId, calificacionId: id });
    return id;
  });
}

/** Pide otra vez el plan de su última calificación (si la IA falló la primera vez). */
export async function reintentarPlan({ db, ia, reloj, usuariaId, calificacionId }) {
  return unaALaVez(usuariaId, async () => {
    const u = (await db.query('select plan from usuarias where id = $1', [usuariaId])).rows[0];
    if (!u) throw sinSesion();
    if (!esPlanPro(u.plan)) throw soloPro();
    const ultima = (await db.query('select id, plan from vitrina_calificaciones where usuaria_id = $1 order by creado_en desc, id limit 1', [usuariaId])).rows[0];
    if (!ultima || ultima.id !== calificacionId) throw noEncontrado('Esa calificación');
    if (ultima.plan) return; // ya tiene su plan
    if (!ia.lista()) throw traducirErrorIA(new ErrorIA('SIN_LLAVE', 'Falta la llave'), false);
    await escribirPlan({ db, ia, reloj, usuariaId, calificacionId });
  });
}

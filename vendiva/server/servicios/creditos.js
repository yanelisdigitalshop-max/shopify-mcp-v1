// Créditos: dos bolsas.
//   - del plan: llegan solos el día 1 de cada mes (el saldo se repone, no se acumula).
//   - de paquete: se compran aparte y no vencen.
// Entran por el alta y la renovación; salen al crear lo que cuesta créditos
// (guion de en vivo, respuestas a comentarios). Los guiones nunca gastan.

import crypto from 'node:crypto';
import { PLANES, ZONA_HORARIA, planFrenaEnCero } from '../../shared/datos.js';
import { ErrorApp } from '../errores.js';

/** 'AAAA-MM' en la hora de Florida. */
export function periodoDe(fecha = new Date()) {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA_HORARIA,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(fecha);
  const dato = (tipo) => partes.find((p) => p.type === tipo).value;
  return `${dato('year')}-${dato('month')}`;
}

/** Semana ISO en la hora de Florida, por ejemplo '2026-W46'. Las tendencias se guardan por semana. */
export function semanaDe(fecha = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha);
  const dato = (t) => Number(p.find((x) => x.type === t).value);
  const dia = new Date(Date.UTC(dato('year'), dato('month') - 1, dato('day')));
  const diaSemana = dia.getUTCDay() || 7; // lunes = 1 ... domingo = 7
  dia.setUTCDate(dia.getUTCDate() + 4 - diaSemana); // el jueves de esa semana decide el año
  const inicioAno = new Date(Date.UTC(dia.getUTCFullYear(), 0, 1));
  const numero = Math.ceil(((dia - inicioAno) / 86400000 + 1) / 7);
  return `${dia.getUTCFullYear()}-W${String(numero).padStart(2, '0')}`;
}

/** '2026-W46' -> la semana anterior completa, en el formato de FastMoss: '2026-45'. */
export function semanaAnteriorFastmoss(fecha = new Date(), semanasAtras = 1) {
  const s = semanaDe(new Date(fecha.getTime() - semanasAtras * 7 * 86400000));
  return s.replace('-W', '-');
}

/** Lunes y domingo (AAAA-MM-DD) de una semana ISO 'AAAA-SS' o 'AAAA-WSS'. */
export function diasDeSemana(semana) {
  const [a, n] = semana.replace('-W', '-').split('-').map(Number);
  const cuatroEnero = new Date(Date.UTC(a, 0, 4));
  const lunes = new Date(cuatroEnero);
  lunes.setUTCDate(cuatroEnero.getUTCDate() - ((cuatroEnero.getUTCDay() || 7) - 1) + (n - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const f = (d) => d.toISOString().slice(0, 10);
  return { desde: f(lunes), hasta: f(domingo) };
}

/** 'AAAA-MM-01' del mes siguiente: el día en que se renuevan. */
export function proximaRenovacion(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const siguiente = m === 12 ? [a + 1, 1] : [a, m + 1];
  return `${siguiente[0]}-${String(siguiente[1]).padStart(2, '0')}-01`;
}

export async function anotarMovimiento(t, { usuariaId, bolsa, cantidad, motivo, periodo = null, referencia = null }) {
  await t.query(
    'insert into movimientos_creditos (id, usuaria_id, bolsa, cantidad, motivo, periodo, referencia) values ($1, $2, $3, $4, $5, $6, $7)',
    [crypto.randomUUID(), usuariaId, bolsa, cantidad, motivo, periodo, referencia],
  );
}

/**
 * Cobra una creación. Se llama con la fila de la usuaria bloqueada y ya renovada.
 *
 * - Primero se gastan los créditos del plan (se reponen el día 1) y después los de paquete (no vencen).
 * - Plan Gratis: si el saldo no alcanza, frena y no cobra nada.
 * - Planes de pago: no frenan. Se descuenta lo que haya, hasta cero, y la creación sale igual.
 *
 * @returns {{ delPlan: number, delPaquete: number, total: number }} lo cobrado de cada bolsa
 */
export async function cobrar(t, usuaria, { costo, motivo, referencia }) {
  const saldo = usuaria.creditos_plan + usuaria.creditos_paquete;

  if (saldo < costo && planFrenaEnCero(usuaria.plan)) {
    throw new ErrorApp(
      402,
      'CREDITOS_INSUFICIENTES',
      `Ya se te terminó lo gratis de este mes. Esto cuesta ${costo} ${costo === 1 ? 'crédito' : 'créditos'} y te ${saldo === 1 ? 'queda' : 'quedan'} ${saldo}.`,
      { datos: { costo, saldo, renuevaEl: proximaRenovacion(usuaria.periodo_creditos) } },
    );
  }

  const total = Math.min(costo, saldo);
  const delPlan = Math.min(usuaria.creditos_plan, total);
  const delPaquete = total - delPlan;

  if (total > 0) {
    await t.query(
      'update usuarias set creditos_plan = creditos_plan - $2, creditos_paquete = creditos_paquete - $3, actualizada_en = now() where id = $1',
      [usuaria.id, delPlan, delPaquete],
    );
    if (delPlan > 0) await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'plan', cantidad: -delPlan, motivo, periodo: usuaria.periodo_creditos, referencia });
    if (delPaquete > 0) await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'paquete', cantidad: -delPaquete, motivo, referencia });
  }
  return { delPlan, delPaquete, total };
}

/** Devuelve exactamente lo cobrado, a la misma bolsa, cuando la creación no se pudo entregar. */
export async function devolver(t, usuariaId, cobro, { referencia }) {
  if (!cobro || cobro.total === 0) return;
  await t.query(
    'update usuarias set creditos_plan = creditos_plan + $2, creditos_paquete = creditos_paquete + $3, actualizada_en = now() where id = $1',
    [usuariaId, cobro.delPlan, cobro.delPaquete],
  );
  if (cobro.delPlan > 0) await anotarMovimiento(t, { usuariaId, bolsa: 'plan', cantidad: cobro.delPlan, motivo: 'devolucion', referencia });
  if (cobro.delPaquete > 0) await anotarMovimiento(t, { usuariaId, bolsa: 'paquete', cantidad: cobro.delPaquete, motivo: 'devolucion', referencia });
}

/**
 * Si cambió el mes desde el último abono, repone los créditos del plan.
 * Se llama dentro de una transacción con la fila de la usuaria bloqueada
 * (select ... for update), para que nunca se abone dos veces.
 */
export async function renovarSiToca(t, usuaria, ahora = new Date()) {
  const periodo = periodoDe(ahora);
  if (usuaria.periodo_creditos === periodo) return usuaria;

  const creditos = PLANES[usuaria.plan].creditosMes;
  await t.query(
    'update usuarias set creditos_plan = $2, periodo_creditos = $3, guiones_mes = 0, busquedas_mes = 0, actualizada_en = now() where id = $1',
    [usuaria.id, creditos, periodo],
  );
  await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'plan', cantidad: creditos, motivo: 'renovacion', periodo });
  // Con el mes nuevo también vuelve a cero la cuenta de guiones gratis.
  return { ...usuaria, creditos_plan: creditos, periodo_creditos: periodo, guiones_mes: 0, busquedas_mes: 0 };
}

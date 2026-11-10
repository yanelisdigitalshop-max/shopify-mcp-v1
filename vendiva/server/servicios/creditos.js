// Créditos: dos bolsas.
//   - del plan: llegan solos el día 1 de cada mes (el saldo se repone, no se acumula).
//   - de paquete: se compran aparte y no vencen.
// En la Parte 1 solo existen el abono de alta y la renovación; todavía nada gasta.

import crypto from 'node:crypto';
import { PLANES, ZONA_HORARIA } from '../../shared/datos.js';

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

/** 'AAAA-MM-01' del mes siguiente: el día en que se renuevan. */
export function proximaRenovacion(periodo) {
  const [a, m] = periodo.split('-').map(Number);
  const siguiente = m === 12 ? [a + 1, 1] : [a, m + 1];
  return `${siguiente[0]}-${String(siguiente[1]).padStart(2, '0')}-01`;
}

export async function anotarMovimiento(t, { usuariaId, bolsa, cantidad, motivo, periodo = null }) {
  await t.query(
    'insert into movimientos_creditos (id, usuaria_id, bolsa, cantidad, motivo, periodo) values ($1, $2, $3, $4, $5, $6)',
    [crypto.randomUUID(), usuariaId, bolsa, cantidad, motivo, periodo],
  );
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
    'update usuarias set creditos_plan = $2, periodo_creditos = $3, actualizada_en = now() where id = $1',
    [usuaria.id, creditos, periodo],
  );
  await anotarMovimiento(t, { usuariaId: usuaria.id, bolsa: 'plan', cantidad: creditos, motivo: 'renovacion', periodo });
  return { ...usuaria, creditos_plan: creditos, periodo_creditos: periodo };
}

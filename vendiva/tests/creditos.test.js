import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { periodoDe, proximaRenovacion } from '../server/servicios/creditos.js';

let s;
before(async () => { s = await levantar(); });
after(async () => { await s.cerrar(); });

test('el mes se cuenta con la hora de Florida', () => {
  assert.equal(periodoDe(new Date('2026-11-10T15:00:00Z')), '2026-11');
  // 1 de diciembre a las 03:00 UTC todavía es 30 de noviembre de noche en Miami.
  assert.equal(periodoDe(new Date('2026-12-01T03:00:00Z')), '2026-11');
  assert.equal(periodoDe(new Date('2026-12-01T05:00:00Z')), '2026-12');
  assert.equal(proximaRenovacion('2026-11'), '2026-12-01');
  assert.equal(proximaRenovacion('2026-12'), '2027-01-01');
});

test('cuenta nueva: 30 créditos del plan Gratis, anotados en el libro', async () => {
  s.ponerFecha(new Date('2026-11-10T15:00:00Z'));
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const e = alta.json.estado;
  assert.deepEqual(e.creditos, { plan: 30, paquete: 0, total: 30, periodo: '2026-11', renuevaEl: '2026-12-01' });
  const { rows } = await s.db.query('select bolsa, cantidad, motivo, periodo from movimientos_creditos where usuaria_id = $1', [e.usuaria.id]);
  assert.deepEqual(rows, [{ bolsa: 'plan', cantidad: 30, motivo: 'alta', periodo: '2026-11' }]);
});

test('el día 1 los créditos del plan se reponen solos, una sola vez; los de paquete no se tocan', async () => {
  s.ponerFecha(new Date('2026-11-10T15:00:00Z'));
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const id = alta.json.estado.usuaria.id;

  // Simula que gastó casi todo y que tiene créditos de un paquete (no vencen).
  await s.db.query('update usuarias set creditos_plan = 4, creditos_paquete = 100 where id = $1', [id]);

  s.ponerFecha(new Date('2026-11-30T20:00:00Z'));
  let e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.creditos.plan, 4, 'mismo mes: no se repone');

  s.ponerFecha(new Date('2026-12-01T14:00:00Z'));
  const [a, b, d] = await Promise.all([c.get('/api/estado'), c.get('/api/estado'), c.get('/api/estado')]);
  for (const r of [a, b, d]) {
    assert.equal(r.json.estado.creditos.plan, 30, 'se repone al saldo del plan, no se acumula');
    assert.equal(r.json.estado.creditos.paquete, 100);
    assert.equal(r.json.estado.creditos.total, 130);
    assert.equal(r.json.estado.creditos.periodo, '2026-12');
    assert.equal(r.json.estado.creditos.renuevaEl, '2027-01-01');
  }
  const { rows } = await s.db.query("select count(*)::int as n from movimientos_creditos where usuaria_id = $1 and motivo = 'renovacion'", [id]);
  assert.equal(rows[0].n, 1, 'tres visitas a la vez: una sola renovación');

  s.ponerFecha(new Date('2026-12-15T14:00:00Z'));
  e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.creditos.plan, 30);
});

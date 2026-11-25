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

test('cuenta nueva: 30 créditos de texto del plan Gratis y su video gratis del mes, anotados en el libro', async () => {
  s.ponerFecha(new Date('2026-11-10T15:00:00Z'));
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const e = alta.json.estado;
  assert.deepEqual(e.creditos, {
    plan: 30,
    total: 30,
    video: { plan: 0, paquete: 0, total: 0 },
    videoGratis: { incluido: true, disponible: true, segundos: 10 },
    periodo: '2026-11',
    renuevaEl: '2026-12-01',
  });
  const { rows } = await s.db.query('select bolsa, cantidad, motivo, periodo from movimientos_creditos where usuaria_id = $1', [e.usuaria.id]);
  assert.deepEqual(rows, [{ bolsa: 'plan', cantidad: 30, motivo: 'alta', periodo: '2026-11' }]);
});

test('el día 1 se reponen los créditos de texto y de video y el video gratis, una sola vez; los de paquete no se tocan', async () => {
  s.ponerFecha(new Date('2026-11-10T15:00:00Z'));
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const id = alta.json.estado.usuaria.id;

  // Simula que gastó casi todo y que tiene créditos de un paquete (no vencen).
  await s.db.query('update usuarias set creditos_plan = 4, creditos_paquete = 100, video_gratis_usado = true where id = $1', [id]);

  s.ponerFecha(new Date('2026-11-30T20:00:00Z'));
  let e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.creditos.plan, 4, 'mismo mes: no se repone');

  s.ponerFecha(new Date('2026-12-01T14:00:00Z'));
  const [a, b, d] = await Promise.all([c.get('/api/estado'), c.get('/api/estado'), c.get('/api/estado')]);
  for (const r of [a, b, d]) {
    assert.equal(r.json.estado.creditos.plan, 30, 'se repone al saldo del plan, no se acumula');
    assert.equal(r.json.estado.creditos.total, 30, 'el texto no se mezcla con los paquetes');
    assert.equal(r.json.estado.creditos.video.paquete, 100, 'los paquetes (de video) no vencen');
    assert.equal(r.json.estado.creditos.videoGratis.disponible, true, 'el video gratis vuelve');
    assert.equal(r.json.estado.creditos.periodo, '2026-12');
    assert.equal(r.json.estado.creditos.renuevaEl, '2027-01-01');
  }
  const { rows } = await s.db.query("select count(*)::int as n from movimientos_creditos where usuaria_id = $1 and motivo = 'renovacion'", [id]);
  assert.equal(rows[0].n, 1, 'tres visitas a la vez: una sola renovación');

  s.ponerFecha(new Date('2026-12-15T14:00:00Z'));
  e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.creditos.plan, 30);
});

test('planes de pago: el día 1 reciben mitad texto y mitad video', async () => {
  s.ponerFecha(new Date('2026-11-10T15:00:00Z'));
  try {
    for (const [plan, texto, video] of [['esencial', 100, 100], ['crecimiento', 300, 300], ['pro', 1000, 1000]]) {
      const c = s.cliente();
      const id = (await c.post('/api/cuenta/registro', cuentaNueva())).json.estado.usuaria.id;
      await s.db.query("update usuarias set plan = $2, creditos_plan = 0, creditos_video_plan = 0, periodo_creditos = '2026-10' where id = $1", [id, plan]);
      const e = (await c.get('/api/estado')).json.estado;
      assert.equal(e.creditos.total, texto, plan);
      assert.equal(e.creditos.video.plan, video, plan);
      assert.equal(e.creditos.videoGratis.incluido, false, 'el video gratis es solo del plan Gratis');
      const { rows } = await s.db.query("select bolsa, cantidad from movimientos_creditos where usuaria_id = $1 and motivo = 'renovacion' order by bolsa", [id]);
      assert.deepEqual(rows, [{ bolsa: 'plan', cantidad: texto }, { bolsa: 'video_plan', cantidad: video }]);
    }
  } finally {
    s.ponerFecha(null);
  }
});

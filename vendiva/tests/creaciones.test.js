import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { levantar, cuentaNueva } from './ayuda.js';
import { crearIaFalsa, EN_VIVO, GUION, RESPUESTAS } from './ia-falsa.js';
import { ErrorIA } from '../server/ia/claude.js';
import { CREACIONES } from '../shared/datos.js';

let s;
let ia;
let comportamiento = {};
before(async () => {
  ia = crearIaFalsa({ responder: (n, pedido) => comportamiento.responder?.(n, pedido) });
  const original = ia.generar;
  ia.generar = async (...a) => {
    if (comportamiento.demoraMs) await new Promise((ok) => setTimeout(ok, comportamiento.demoraMs));
    return original(...a);
  };
  s = await levantar({ ia });
});
after(async () => { await s.cerrar(); });
beforeEach(() => { comportamiento = {}; ia.llamadas.length = 0; });

async function conProducto({ seguidores = 340, modoGrabacion = 'sin_camara' } = {}) {
  const c = s.cliente();
  const alta = await c.post('/api/cuenta/registro', cuentaNueva());
  const usuariaId = alta.json.estado.usuaria.id;
  await c.patch('/api/perfil', { nicho: 'Cuidado del cabello', seguidores, modoGrabacion, objetivo: 'vender_mas', onboardingCompleto: true });
  const p = await c.post('/api/productos', { nombre: 'Cepillo alisador de cerdas suaves', descripcion: 'Alisa sin calor. Para cabello con frizz.', precio: 14.99, comisionPct: 15 });
  return { c, usuariaId, productoId: p.json.productoId };
}
const saldo = async (c) => (await c.get('/api/estado')).json.estado.creditos;
const movimientos = async (usuariaId) =>
  (await s.db.query("select bolsa, cantidad, motivo from movimientos_creditos where usuaria_id = $1 and motivo <> 'alta' order by creado_en, bolsa", [usuariaId])).rows;
const cuantas = async (usuariaId) => (await s.db.query('select count(*)::int as n from creaciones where usuaria_id = $1', [usuariaId])).rows[0].n;
const ponerSaldo = (usuariaId, plan, paquete = 0, nombrePlan = 'gratis') =>
  s.db.query('update usuarias set creditos_plan = $2, creditos_paquete = $3, plan = $4 where id = $1', [usuariaId, plan, paquete, nombrePlan]);

test('los costos son los de la dueña', () => {
  assert.equal(CREACIONES.guiones.costo, 0);
  assert.equal(CREACIONES.guion_en_vivo.costo, 10);
  assert.equal(CREACIONES.respuestas_comentarios.costo, 3);
});

test('guiones: de un toque, 3 guiones en los dos modos, y no gastan créditos', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  const r = await c.post(`/api/productos/${productoId}/guiones`);
  assert.equal(r.estado, 201, JSON.stringify(r.json));

  const { guiones } = r.json.creacion.contenido;
  assert.equal(guiones.length, 3);
  for (const g of guiones) {
    assert.ok(g.gancho && g.titulo && g.caption);
    assert.ok(g.conCamara.length >= 3 && g.conCamara.every((p) => p.tiempo && p.dices && p.haces), 'modo con cámara completo');
    assert.ok(g.sinCamara.length >= 3 && g.sinCamara.every((p) => p.tiempo && p.seVe && p.seEscucha), 'modo sin cámara completo');
    assert.deepEqual(g.hashtags, ['#frizz', '#cabellorizado'], 'hashtags limpios, con # y sin repetir');
    assert.ok(g.mejorHora.hora && g.mejorHora.motivo);
  }
  assert.equal(r.json.creacion.creditosCobrados, 0);
  assert.equal(r.json.estado.creditos.total, 30, 'el saldo no baja');
  assert.deepEqual(await movimientos(usuariaId), [], 'ningún movimiento de créditos');

  // Quedan guardados: al volver a entrar siguen ahí.
  const e = (await c.get('/api/estado')).json.estado;
  assert.equal(e.creaciones[productoId].guiones.id, r.json.creacion.id);
  assert.equal(e.creaciones[productoId].guiones.contenido.guiones.length, 3);
});

test('guiones: ilimitados. Diez veces seguidas y con el saldo en cero siguen saliendo gratis', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await ponerSaldo(usuariaId, 0, 0);
  for (let i = 0; i < 10; i += 1) {
    const r = await c.post(`/api/productos/${productoId}/guiones`);
    assert.equal(r.estado, 201, `vez ${i + 1}: ${JSON.stringify(r.json)}`);
  }
  assert.equal((await saldo(c)).total, 0);
  assert.deepEqual(await movimientos(usuariaId), []);
  assert.equal(await cuantas(usuariaId), 10);
});

test('guiones: la IA recibe los datos reales del producto y de ella, sin avatar', async () => {
  const { c, productoId } = await conProducto({ seguidores: 340, modoGrabacion: 'sin_camara' });
  await c.post(`/api/productos/${productoId}/guiones`);
  assert.equal(ia.llamadas.length, 3, 'un pedido por guion');
  for (const { pedido, opciones } of ia.llamadas) {
    assert.match(pedido, /Cepillo alisador de cerdas suaves/);
    assert.match(pedido, /Alisa sin calor\. Para cabello con frizz\./);
    assert.match(pedido, /Precio: \$14\.99/);
    assert.match(pedido, /Nicho: Cuidado del cabello/);
    assert.match(pedido, /Seguidores en TikTok: 340 \(nivel 3 de 9, "Impulso"\)/);
    assert.match(pedido, /prefiere para grabar: sin cámara/);
    assert.match(pedido, /todavía no puede poner el carrito/, 'con menos de 1.000 seguidores no se le manda a tocar el carrito');
    assert.doesNotMatch(pedido, /15|comisi/i, 'la comisión es dato de ella, no va al guion');
    assert.match(opciones.system, /nunca un avatar/);
    assert.match(opciones.system, /Su cara no aparece nunca/);
    assert.match(opciones.system, /No inventes|no inventes/);
  }
  const angulos = ia.llamadas.map((l) => l.pedido.match(/con este ángulo:\n(.+)/)[1]);
  assert.equal(new Set(angulos).size, 3, 'tres ángulos distintos');

  // Al pedir otros 3: ángulos nuevos y aviso de los ganchos ya usados.
  ia.llamadas.length = 0;
  await c.post(`/api/productos/${productoId}/guiones`);
  const otros = ia.llamadas.map((l) => l.pedido.match(/con este ángulo:\n(.+)/)[1]);
  assert.equal(otros.filter((a) => angulos.includes(a)).length, 0, 'la segunda vez tocan otros ángulos');
  assert.ok(ia.llamadas.every((l) => l.pedido.includes(`- ${GUION.gancho}`)), 'se le pasan los ganchos ya usados');

  const conMil = await conProducto({ seguidores: 1200, modoGrabacion: 'con_camara' });
  ia.llamadas.length = 0;
  await conMil.c.post(`/api/productos/${conMil.productoId}/guiones`);
  assert.match(ia.llamadas[0].pedido, /ya puede mostrar el producto con el carrito/);
});

test('guiones: si la IA responde con cercas ```json se lee igual; si responde mal, se pide otra vez', async () => {
  const { c, productoId } = await conProducto();
  comportamiento.responder = () => '```json\n' + JSON.stringify(GUION) + '\n```';
  assert.equal((await c.post(`/api/productos/${productoId}/guiones`)).estado, 201);

  ia.llamadas.length = 0;
  comportamiento.responder = (n) => (n === 1 ? 'Claro, aquí tienes tu guion:' : undefined);
  assert.equal((await c.post(`/api/productos/${productoId}/guiones`)).estado, 201);
  assert.equal(ia.llamadas.length, 4, 'el guion que llegó mal se pidió una vez más');
});

test('guiones: un guion sin uno de los dos modos no se acepta ni se guarda', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  const { sinCamara, ...soloConCamara } = GUION;
  comportamiento.responder = () => JSON.stringify(soloConCamara);
  const r = await c.post(`/api/productos/${productoId}/guiones`);
  assert.equal(r.estado, 503);
  assert.equal(r.json.error.codigo, 'FORMA_INVALIDA');
  assert.equal(await cuantas(usuariaId), 0);
});

test('si la IA manda de más (preguntas, pasos, respuestas), se recorta y se entrega; no se rechaza', async () => {
  const { c, productoId } = await conProducto();
  comportamiento.responder = (_n, pedido) => {
    if (pedido.includes('guion completo de un en vivo')) {
      return JSON.stringify({
        ...EN_VIVO,
        preguntasFrecuentes: Array.from({ length: 9 }, (_, i) => ({ pregunta: `¿Pregunta ${i + 1}?`, respuesta: 'Sale en la página del producto.' })),
        bloques: Array.from({ length: 14 }, (_, i) => ({ tiempo: `${i}-${i + 1} min`, nombre: `Bloque ${i + 1}`, dices: 'Hola. '.repeat(600), haces: 'Muestras el producto.' })),
      });
    }
    if (pedido.includes('3 respuestas listas')) {
      return JSON.stringify({ respuestas: [...RESPUESTAS.respuestas, { comentario: '¿Una cuarta?', respuesta: 'Sobra.' }] });
    }
    return undefined;
  };
  const vivo = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(vivo.estado, 201, JSON.stringify(vivo.json));
  assert.equal(vivo.json.creacion.contenido.preguntasFrecuentes.length, 6);
  assert.equal(vivo.json.creacion.contenido.bloques.length, 10);
  assert.ok(vivo.json.creacion.contenido.bloques[0].dices.length <= 1500);
  const resp = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
  assert.equal(resp.estado, 201);
  assert.equal(resp.json.creacion.contenido.respuestas.length, 3);
});

test('en vivo y respuestas: sin confirmar el costo no se crea ni se cobra nada', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  for (const [ruta, costo] of [['guion-en-vivo', 10], ['respuestas-comentarios', 3]]) {
    for (const cuerpo of [{}, { costoAceptado: 0 }, { costoAceptado: costo - 1 }, { costoAceptado: costo + 1 }]) {
      const r = await c.post(`/api/productos/${productoId}/${ruta}`, cuerpo);
      assert.equal(r.estado, 409, `${ruta} ${JSON.stringify(cuerpo)}`);
      assert.equal(r.json.error.codigo, 'FALTA_CONFIRMAR');
      assert.equal(r.json.error.datos.costo, costo);
    }
  }
  assert.equal(ia.llamadas.length, 0, 'la IA ni se llamó');
  assert.equal((await saldo(c)).total, 30);
  assert.equal(await cuantas(usuariaId), 0);
});

test('guion de en vivo: cuesta 10 créditos', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  const r = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.equal(r.json.creacion.creditosCobrados, 10);
  assert.ok(r.json.creacion.contenido.bloques.length >= 4);
  assert.equal(r.json.estado.creditos.total, 20);
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -10, motivo: 'guion_en_vivo' }]);
  assert.equal(r.json.estado.creaciones[productoId].guion_en_vivo.id, r.json.creacion.id);
  assert.match(ia.llamadas[0].pedido, /todavía no llega a 1\.000 seguidores/, 'se avisa a la IA que aún no puede hacer en vivo en TikTok');
  assert.match(ia.llamadas[0].pedido, /Prefiere no mostrar la cara/);
});

test('3 respuestas a comentarios: cuestan 3 créditos', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  const r = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
  assert.equal(r.estado, 201, JSON.stringify(r.json));
  assert.equal(r.json.creacion.contenido.respuestas.length, 3);
  assert.equal(r.json.creacion.creditosCobrados, 3);
  assert.equal(r.json.estado.creditos.total, 27);
  assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -3, motivo: 'respuestas_comentarios' }]);
});

test('plan Gratis: si el saldo no alcanza, frena. No llama a la IA, no cobra y no crea', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await ponerSaldo(usuariaId, 2, 0);
  const r = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
  assert.equal(r.estado, 402);
  assert.equal(r.json.error.codigo, 'CREDITOS_INSUFICIENTES');
  assert.match(r.json.error.mensaje, /^Ya se te terminó lo gratis de este mes/);
  assert.deepEqual({ costo: r.json.error.datos.costo, saldo: r.json.error.datos.saldo }, { costo: 3, saldo: 2 });
  assert.equal(ia.llamadas.length, 0);
  assert.equal((await saldo(c)).total, 2);
  assert.equal(await cuantas(usuariaId), 0);

  // Con el saldo en cero los guiones siguen saliendo gratis.
  await ponerSaldo(usuariaId, 0, 0);
  assert.equal((await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 })).estado, 402);
  assert.equal((await c.post(`/api/productos/${productoId}/guiones`)).estado, 201);
});

test('plan Gratis: con el saldo justo sí crea y queda en cero', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await ponerSaldo(usuariaId, 10, 0);
  const r = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(r.estado, 201);
  assert.equal(r.json.estado.creditos.total, 0);
});

test('primero se gastan los créditos del plan y después los de paquete', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await ponerSaldo(usuariaId, 4, 100);
  const r = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(r.estado, 201);
  assert.deepEqual({ plan: r.json.estado.creditos.plan, paquete: r.json.estado.creditos.paquete }, { plan: 0, paquete: 94 });
  assert.deepEqual(await movimientos(usuariaId), [
    { bolsa: 'paquete', cantidad: -6, motivo: 'guion_en_vivo' },
    { bolsa: 'plan', cantidad: -4, motivo: 'guion_en_vivo' },
  ]);
});

test('planes de pago: no frenan. Se descuenta hasta cero y la creación sale igual', async () => {
  for (const plan of ['esencial', 'crecimiento', 'pro']) {
    const { c, usuariaId, productoId } = await conProducto();
    await ponerSaldo(usuariaId, 4, 0, plan);
    const r = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
    assert.equal(r.estado, 201, `${plan}: ${JSON.stringify(r.json)}`);
    assert.equal(r.json.estado.creditos.total, 0, 'queda en cero, nunca en negativo');
    assert.equal(r.json.creacion.creditosCobrados, 4);
    assert.deepEqual(await movimientos(usuariaId), [{ bolsa: 'plan', cantidad: -4, motivo: 'guion_en_vivo' }]);

    const otra = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
    assert.equal(otra.estado, 201, 'con cero también crea');
    assert.equal(otra.json.estado.creditos.total, 0);
  }
});

test('si la IA falla, se devuelven los créditos y no queda nada a medias', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await ponerSaldo(usuariaId, 4, 20);

  comportamiento.responder = () => new ErrorIA('IA_OCUPADA', 'La inteligencia artificial está muy ocupada en este momento. Intenta de nuevo en un minuto.', { reintentable: true });
  const r = await c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 });
  assert.equal(r.estado, 503);
  assert.match(r.json.error.mensaje, /No se gastó ningún crédito/);
  const despues = await saldo(c);
  assert.deepEqual({ plan: despues.plan, paquete: despues.paquete }, { plan: 4, paquete: 20 }, 'cada crédito vuelve a su bolsa');
  assert.equal(await cuantas(usuariaId), 0);
  const suma = (await movimientos(usuariaId)).reduce((n, m) => n + m.cantidad, 0);
  assert.equal(suma, 0, 'el libro queda cuadrado: cobro y devolución');

  // Respuesta ilegible dos veces: también se devuelve.
  comportamiento.responder = () => 'no es json';
  const mala = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
  assert.equal(mala.estado, 503);
  assert.equal((await saldo(c)).total, 24);

  // Y al reintentar con la IA bien, cobra una sola vez.
  comportamiento.responder = undefined;
  const bien = await c.post(`/api/productos/${productoId}/respuestas-comentarios`, { costoAceptado: 3 });
  assert.equal(bien.estado, 201);
  assert.equal(bien.json.estado.creditos.total, 21);
});

test('tres toques a la vez: se crea y se cobra una sola vez', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  comportamiento.demoraMs = 150;
  const respuestas = await Promise.all([1, 2, 3].map(() => c.post(`/api/productos/${productoId}/guion-en-vivo`, { costoAceptado: 10 })));
  const estados = respuestas.map((r) => r.estado).sort();
  assert.deepEqual(estados, [201, 409, 409]);
  assert.ok(respuestas.filter((r) => r.estado === 409).every((r) => r.json.error.codigo === 'YA_CREANDO'));
  assert.equal((await saldo(c)).total, 20);
  assert.equal(await cuantas(usuariaId), 1);
});

test('nadie crea sobre el producto de otra cuenta, ni sin sesión', async () => {
  const duena = await conProducto();
  const otra = await conProducto();
  assert.equal((await otra.c.post(`/api/productos/${duena.productoId}/guiones`)).estado, 404);
  assert.equal((await otra.c.post(`/api/productos/${duena.productoId}/guion-en-vivo`, { costoAceptado: 10 })).estado, 404);
  assert.equal((await saldo(otra.c)).total, 30, 'no se le cobró');
  assert.equal((await s.cliente().post(`/api/productos/${duena.productoId}/guiones`)).estado, 401);
  assert.equal((await duena.c.post('/api/productos/no-es-un-id/guiones')).estado, 404);
  assert.equal(ia.llamadas.length, 0);
});

test('sin la llave puesta: avisa con calma y no cobra', async () => {
  const sinLlave = await levantar({ env: { VENDIVA_ANTHROPIC_API_KEY: '', ANTHROPIC_API_KEY: '' } });
  const guardadas = ['VENDIVA_ANTHROPIC_API_KEY', 'ANTHROPIC_API_KEY'].map((n) => [n, process.env[n]]);
  for (const [n] of guardadas) delete process.env[n];
  try {
    const c = sinLlave.cliente();
    await c.post('/api/cuenta/registro', cuentaNueva());
    const p = await c.post('/api/productos', { nombre: 'Cepillo' });
    const r = await c.post(`/api/productos/${p.json.productoId}/guion-en-vivo`, { costoAceptado: 10 });
    assert.equal(r.estado, 503);
    assert.equal(r.json.error.codigo, 'IA_NO_DISPONIBLE');
    assert.equal((await c.get('/api/estado')).json.estado.creditos.total, 30);
  } finally {
    for (const [n, v] of guardadas) if (v !== undefined) process.env[n] = v;
    await sinLlave.cerrar();
  }
});

test('al borrar un producto se van sus creaciones', async () => {
  const { c, usuariaId, productoId } = await conProducto();
  await c.post(`/api/productos/${productoId}/guiones`);
  assert.equal(await cuantas(usuariaId), 1);
  const r = await c.del(`/api/productos/${productoId}`);
  assert.deepEqual(r.json.estado.creaciones, {});
  assert.equal(await cuantas(usuariaId), 0);
});

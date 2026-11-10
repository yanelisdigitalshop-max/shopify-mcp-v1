// Candado de los datos que la dueña decidió. Si esta prueba falla, alguien cambió
// un precio, un crédito o un dato del negocio: eso no se hace sin su aprobación.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  NOMBRE_APP, PLANES, ORDEN_PLANES, PLAN_INICIAL, COSTOS_CREDITOS, PAQUETES_CREDITOS,
  LIMITES_GRATIS, NIVELES, NEGOCIO, nivelPara, formatoNumero,
} from '../shared/datos.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('planes: nombres, precios, créditos y tope de productos', () => {
  assert.equal(NOMBRE_APP, 'Vendiva');
  assert.deepEqual(ORDEN_PLANES, ['gratis', 'esencial', 'crecimiento', 'pro']);
  assert.equal(PLAN_INICIAL, 'gratis');
  const fila = (id) => [PLANES[id].nombre, PLANES[id].precioMes, PLANES[id].creditosMes, PLANES[id].maxProductos];
  assert.deepEqual(fila('gratis'), ['Gratis', 0, 30, 6]);
  assert.deepEqual(fila('esencial'), ['Esencial', 19, 200, null]);
  assert.deepEqual(fila('crecimiento'), ['Crecimiento', 39, 600, null]);
  assert.deepEqual(fila('pro'), ['Pro', 59, 2000, null]);
});

test('costos en créditos y paquetes', () => {
  assert.deepEqual(COSTOS_CREDITOS, {
    guiones: 0, videosCortos: 15, videosDesdeFoto: 15, gifs: 9, guionEnVivo: 10, respuestasComentarios: 3,
  });
  assert.deepEqual(
    PAQUETES_CREDITOS.map((p) => [p.nombre, p.creditos, p.precio]),
    [['Chico', 100, 9], ['Mediano', 300, 24], ['Grande', 750, 49], ['Tienda', 2000, 99]],
  );
  assert.deepEqual(LIMITES_GRATIS, { videosCortosGratisMes: 3, busquedasMes: 10 });
});

test('los 9 niveles por seguidores', () => {
  assert.deepEqual(
    NIVELES.map((n) => [n.numero, n.nombre, n.min, n.max]),
    [
      [1, 'Desde cero', 0, 0],
      [2, 'Arranque', 1, 99],
      [3, 'Impulso', 100, 499],
      [4, 'Recta final', 500, 999],
      [5, 'Afiliada en el programa piloto', 1000, 4999],
      [6, 'Afiliada libre', 5000, 9999],
      [7, 'Creadora en subida', 10000, 49999],
      [8, 'Creadora destacada', 50000, 99999],
      [9, 'Creadora estrella', 100000, null],
    ],
  );
});

test('nivelPara ubica cada borde en su nivel', () => {
  const casos = [
    [0, 1], [1, 2], [99, 2], [100, 3], [499, 3], [500, 4], [999, 4], [1000, 5], [4999, 5],
    [5000, 6], [9999, 6], [10000, 7], [49999, 7], [50000, 8], [99999, 8], [100000, 9], [7500000, 9],
  ];
  for (const [seguidores, numero] of casos) assert.equal(nivelPara(seguidores).numero, numero, `${seguidores} seguidores`);

  const arranque = nivelPara(42);
  assert.equal(arranque.siguiente.nombre, 'Impulso');
  assert.equal(arranque.siguiente.faltan, 58);
  assert.ok(arranque.progreso > 0 && arranque.progreso < 1);

  const estrella = nivelPara(250000);
  assert.equal(estrella.siguiente, null); // sin techo
  assert.equal(estrella.progreso, 1);
});

test('datos oficiales del negocio', () => {
  assert.equal(NEGOCIO.duena, 'Yanelis Vazquez Barrera');
  assert.deepEqual(NEGOCIO.participacion, [
    { nombre: 'Yanelis Vazquez Barrera', porcentaje: 70 },
    { nombre: 'Carlos Manuel Machado de los Ángeles', porcentaje: 30 },
  ]);
  assert.equal(NEGOCIO.direccion, '420 Opa Locka Blvd, North Miami, FL 33168');
  assert.equal(NEGOCIO.correoSoporte, 'machadodelosangele@gmail.com');
  assert.deepEqual(NEGOCIO.pagosAceptados, ['PayPal', 'Stripe', 'Klarna', 'Tarjeta de crédito y débito', 'Apple Pay', 'Bitcoin']);
  assert.match(NEGOCIO.leyAplicable, /Florida/);
});

test('formato de números con punto de miles', () => {
  assert.equal(formatoNumero(0), '0');
  assert.equal(formatoNumero(999), '999');
  assert.equal(formatoNumero(1000), '1.000');
  assert.equal(formatoNumero(2500000), '2.500.000');
});

test('el nombre viejo no aparece en ningún archivo de la app', () => {
  const prohibido = /vende\s*tok/i;
  const extensiones = new Set(['.js', '.jsx', '.html', '.css', '.sql', '.md', '.json']);
  const revisar = (carpeta) => {
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      if (['node_modules', 'dist', '.datos-locales', '.git', 'tests'].includes(entrada.name)) continue;
      const ruta = path.join(carpeta, entrada.name);
      if (entrada.isDirectory()) revisar(ruta);
      else if (extensiones.has(path.extname(entrada.name)) && entrada.name !== 'package-lock.json') {
        assert.doesNotMatch(fs.readFileSync(ruta, 'utf8'), prohibido, `nombre viejo en ${path.relative(RAIZ, ruta)}`);
      }
    }
  };
  revisar(RAIZ);
});

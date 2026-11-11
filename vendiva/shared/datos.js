// Datos fijos de Vendiva.
//
// Estos valores los decidió la dueña y están copiados del "Resumen de Vendiva
// para Claude" (9 de noviembre de 2026), que manda sobre cualquier texto viejo.
// NO se cambian sin su aprobación por escrito. tests/datos-fijos.test.js falla
// si alguien toca un número.
//
// Este archivo lo usan el servidor y el cliente: una sola fuente para ambos.

export const NOMBRE_APP = 'Vendiva';

// El negocio está en Florida: el "día 1" de cada mes se calcula con su hora.
export const ZONA_HORARIA = 'America/New_York';

export const PLANES = {
  gratis: { id: 'gratis', nombre: 'Gratis', precioMes: 0, creditosMes: 30, maxProductos: 6 },
  esencial: { id: 'esencial', nombre: 'Esencial', precioMes: 19, creditosMes: 200, maxProductos: null },
  crecimiento: { id: 'crecimiento', nombre: 'Crecimiento', precioMes: 39, creditosMes: 600, maxProductos: null },
  pro: { id: 'pro', nombre: 'Pro', precioMes: 59, creditosMes: 2000, maxProductos: null },
};
export const ORDEN_PLANES = ['gratis', 'esencial', 'crecimiento', 'pro'];
export const PLAN_INICIAL = 'gratis';

// Costos en créditos. Los guiones y ganchos son ilimitados y gratis en todos los planes.
export const COSTOS_CREDITOS = {
  guiones: 0,
  guionesExtraGratis: 1, // plan Gratis, después de sus 100 guiones gratis del mes: cada vez extra
  videosCortos: 15, // 3 videos cortos
  videosDesdeFoto: 15, // 3 videos desde una foto
  gifs: 9, // 3 GIFs
  guionEnVivo: 10, // 1 guion de en vivo
  respuestasComentarios: 3, // 3 respuestas para comentarios
};

// Lo que la IA escribe en la Parte 2 y lo que cuesta cada cosa.
export const CREACIONES = {
  guiones: { id: 'guiones', nombre: 'Tus 3 guiones', costo: COSTOS_CREDITOS.guiones },
  guion_en_vivo: { id: 'guion_en_vivo', nombre: 'Guion completo para un en vivo', costo: COSTOS_CREDITOS.guionEnVivo },
  respuestas_comentarios: { id: 'respuestas_comentarios', nombre: '3 respuestas para comentarios', costo: COSTOS_CREDITOS.respuestasComentarios },
};

/** El plan Gratis frena cuando el saldo no alcanza. Los planes de pago no frenan: es decisión de la dueña. */
export const planFrenaEnCero = (planId) => planId === 'gratis';

// TikTok pide 1.000 seguidores para el programa de afiliadas (el carrito) y para los en vivo.
export const SEGUIDORES_PARA_AFILIADA = 1000;

// Paquetes de créditos sueltos: no vencen.
export const PAQUETES_CREDITOS = [
  { id: 'chico', nombre: 'Chico', creditos: 100, precio: 9 },
  { id: 'mediano', nombre: 'Mediano', creditos: 300, precio: 24 },
  { id: 'grande', nombre: 'Grande', creditos: 750, precio: 49 },
  { id: 'tienda', nombre: 'Tienda', creditos: 2000, precio: 99 },
];

// Topes del plan Gratis (además de maxProductos).
export const LIMITES_GRATIS = {
  videosCortosGratisMes: 3, // siempre con Sora
  busquedasMes: 10,
  guionesMes: 100, // veces que puede tocar "Crear mis 3 guiones" en el mes
};

// Los 9 niveles por seguidores. `max: null` = sin techo.
export const NIVELES = [
  { numero: 1, nombre: 'Desde cero', min: 0, max: 0 },
  { numero: 2, nombre: 'Arranque', min: 1, max: 99 },
  { numero: 3, nombre: 'Impulso', min: 100, max: 499 },
  { numero: 4, nombre: 'Recta final', min: 500, max: 999 },
  { numero: 5, nombre: 'Afiliada en el programa piloto', min: 1000, max: 4999 },
  { numero: 6, nombre: 'Afiliada libre', min: 5000, max: 9999 },
  { numero: 7, nombre: 'Creadora en subida', min: 10000, max: 49999 },
  { numero: 8, nombre: 'Creadora destacada', min: 50000, max: 99999 },
  { numero: 9, nombre: 'Creadora estrella', min: 100000, max: null },
];

export const SEGUIDORES_MAXIMO = 2_000_000_000;

/**
 * Ubica una cantidad de seguidores (la que la usuaria escribe) en su nivel.
 * Devuelve el nivel, el siguiente (si hay) y el avance dentro del nivel (0 a 1).
 */
export function nivelPara(seguidores) {
  const n = Math.max(0, Math.floor(Number(seguidores) || 0));
  const nivel = [...NIVELES].reverse().find((x) => n >= x.min) ?? NIVELES[0];
  const siguiente = NIVELES.find((x) => x.numero === nivel.numero + 1) ?? null;
  const progreso = siguiente ? Math.min(1, (n - nivel.min) / (siguiente.min - nivel.min)) : 1;
  return {
    numero: nivel.numero,
    nombre: nivel.nombre,
    min: nivel.min,
    max: nivel.max,
    progreso,
    siguiente: siguiente
      ? { numero: siguiente.numero, nombre: siguiente.nombre, min: siguiente.min, faltan: siguiente.min - n }
      : null,
  };
}

// Opciones del registro paso a paso.
export const MODOS_GRABACION = [
  {
    id: 'con_camara',
    nombre: 'Con cámara',
    detalle: 'Tú hablas a la cámara, con el guion que te da Vendiva.',
  },
  {
    id: 'sin_camara',
    nombre: 'Sin cámara',
    detalle: 'Solo se ven tus manos y el producto, con tu voz encima. Tu cara no sale.',
  },
];

export const OBJETIVOS = [
  { id: 'vender_mas', nombre: 'Vender más' },
  { id: 'primeros_1000', nombre: 'Llegar a mis primeros 1.000 seguidores' },
  { id: 'programa_piloto', nombre: 'Entrar al programa piloto de afiliadas' },
  { id: 'subir_vitrina', nombre: 'Subir la calificación de mi vitrina' },
];

export const REDES = [
  { id: 'tiktok', nombre: 'TikTok' },
  { id: 'instagram', nombre: 'Instagram' },
  { id: 'facebook', nombre: 'Facebook' },
  { id: 'pinterest', nombre: 'Pinterest' },
];

// Solo son sugerencias para escribir más rápido: ella puede poner el nicho que quiera.
export const NICHOS_SUGERIDOS = [
  'Belleza y cuidado de la piel',
  'Hogar y cocina',
  'Moda y accesorios',
  'Salud y bienestar',
  'Bebés y niños',
  'Mascotas',
];

export const PASOS_REGISTRO = 5;

// Datos oficiales del negocio. Se copian tal cual.
export const NEGOCIO = {
  nombreApp: 'Vendiva',
  duena: 'Yanelis Vazquez Barrera',
  participacion: [
    { nombre: 'Yanelis Vazquez Barrera', porcentaje: 70 },
    { nombre: 'Carlos Manuel Machado de los Ángeles', porcentaje: 30 },
  ],
  direccion: '420 Opa Locka Blvd, North Miami, FL 33168',
  correoSoporte: 'machadodelosangele@gmail.com',
  pagosAceptados: ['PayPal', 'Stripe', 'Klarna', 'Tarjeta de crédito y débito', 'Apple Pay', 'Bitcoin'],
  leyAplicable: 'Ley de Florida, Estados Unidos',
  sociedad:
    'Hoy figura como Machado Luxury Estates Corp.; el cambio a Vendiva LLC está planeado y todavía no presentado.',
};

/** 1000 -> "1.000". Mismo formato en toda la app. */
export function formatoNumero(n) {
  return String(Math.trunc(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

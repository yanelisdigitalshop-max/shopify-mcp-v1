// Una IA de mentira para las pruebas: no llama a nadie y no gasta.
// Responde según lo que se le pide y anota cada llamada para poder revisarla.

export const GUION = {
  titulo: 'Así se usa, paso a paso',
  gancho: '¿Alisar sin plancha? Mira esto.',
  conCamara: [
    { tiempo: '0-3 s', dices: '¿Alisar sin plancha? Mira esto.', haces: 'Levantas el cepillo.', textoEnPantalla: 'Sin calor' },
    { tiempo: '3-12 s', dices: 'Es un cepillo de cerdas suaves.', haces: 'Muestras las cerdas.', textoEnPantalla: '' },
    { tiempo: '12-25 s', dices: 'Lo paso despacito.', haces: 'Te cepillas un mechón.', textoEnPantalla: 'Despacito' },
    { tiempo: '25-30 s', dices: 'Sígueme para más.', haces: 'Saludas.', textoEnPantalla: 'Sígueme' },
  ],
  sinCamara: [
    { tiempo: '0-3 s', seVe: 'Tus manos toman el cepillo.', seEscucha: '¿Alisar sin plancha? Mira esto.', textoEnPantalla: 'Sin calor' },
    { tiempo: '3-12 s', seVe: 'Primer plano de las cerdas.', seEscucha: 'Es un cepillo de cerdas suaves.', textoEnPantalla: '' },
    { tiempo: '12-25 s', seVe: 'Tu mano cepilla un mechón.', seEscucha: 'Lo paso despacito.', textoEnPantalla: 'Despacito' },
    { tiempo: '25-30 s', seVe: 'Dejas el cepillo en la mesa.', seEscucha: 'Sígueme para más.', textoEnPantalla: 'Sígueme' },
  ],
  caption: 'Probé este cepillo y así se ve.',
  hashtags: ['#frizz', 'cabello rizado', '#frizz', '#de4a6', 'de 4 a 6 hashtags reales sobre este producto y su nicho, cada uno empezando con #'],
  mejorHora: { hora: '7:30 p. m.', motivo: 'De noche mucha gente revisa el teléfono.' },
};

export const EN_VIVO = {
  titulo: 'Conoce el cepillo en vivo',
  duracion: '20 a 30 minutos',
  antesDeEmpezar: ['Ten el cepillo a la mano.', 'Buena luz.'],
  bloques: [
    { tiempo: '0-2 min', nombre: 'Bienvenida', dices: 'Hola, bienvenidas.', haces: 'Saludas.' },
    { tiempo: '2-8 min', nombre: 'El producto', dices: 'Este es el cepillo.', haces: 'Lo muestras.' },
    { tiempo: '8-18 min', nombre: 'Demostración', dices: 'Miren cómo lo paso.', haces: 'Cepillas un mechón.' },
    { tiempo: '18-25 min', nombre: 'Preguntas', dices: 'Las leo.', haces: 'Lees los comentarios.' },
  ],
  preguntasFrecuentes: [
    { pregunta: '¿Cuánto cuesta?', respuesta: 'El precio sale en la página del producto.' },
    { pregunta: '¿Sirve para rizos?', respuesta: 'Es para cabello rizado o con frizz.' },
  ],
  cierre: 'Gracias por acompañarme.',
};

export const RESPUESTAS = {
  respuestas: [
    { comentario: '¿Cuánto cuesta?', respuesta: 'Hola. Está en [escribe el precio].' },
    { comentario: '¿Hacen envíos?', respuesta: 'El envío lo hace la tienda; el tiempo sale antes de pagar.' },
    { comentario: '¿Me servirá?', respuesta: 'Es para cabello rizado o con frizz.' },
  ],
};

export const IDEAS = {
  ideas: Array.from({ length: 5 }, (_, i) => ({
    producto: `Idea de producto ${i + 1}`,
    porQueVende: `Se ve el resultado en segundos (${i + 1}).`,
    comisionABuscar: 'Busca 15 % o más.',
    muestraGratis: 'Mira si la marca ofrece muestra gratis y pídela; la marca decide.',
    palabrasParaBuscar: ['heatless curler', 'rizador sin calor', 'satin curls'],
    ideaDeVideo: 'Muestra el antes y el después.',
  })),
  consejo: 'Empieza por la que puedas mostrar mejor.',
};

export const FUENTES = [
  { url: 'https://www.ejemplo-tendencias.com/tiktok-shop/semana-46/', titulo: 'Lo más vendido esta semana' },
  { url: 'https://noticias.ejemplo.org/belleza', titulo: 'Belleza en TikTok Shop' },
];

export const TENDENCIAS = {
  resumen: 'Esta semana se ven productos de temporada y regalos.',
  tendencias: [
    { nombre: 'Calendarios de adviento', queEs: 'Cajas con sorpresas.', porQue: 'Según la fuente, suben antes de las fiestas.', fuente: 'https://ejemplo-tendencias.com/tiktok-shop/semana-46', ideaDeVideo: 'Abrir una casilla al día.' },
    { nombre: 'Rizadores sin calor', queEs: 'Rulos de tela.', porQue: 'Aparecen en la nota de belleza.', fuente: 'https://noticias.ejemplo.org/belleza', ideaDeVideo: 'Antes y después.' },
    { nombre: 'Algo inventado', queEs: 'No salió en la búsqueda.', porQue: 'Sin fuente real.', fuente: 'https://pagina-que-no-salio.example/inventada', ideaDeVideo: 'Nada.' },
  ],
};

/**
 * @param {object} [comportamiento]
 * @param {(n: number, pedido: string) => string | Error | undefined} [comportamiento.responder]
 *        devuelve el texto a contestar, un Error para fallar, o nada para la respuesta buena
 * @param {number} [comportamiento.demoraMs]
 */
export function crearIaFalsa({ responder, demoraMs = 0 } = {}) {
  const llamadas = [];
  return {
    llamadas,
    lista: () => true,
    async generar(messages, opciones) {
      const pedido = messages[0].content;
      llamadas.push({ pedido, opciones });
      if (demoraMs) await new Promise((ok) => setTimeout(ok, demoraMs));

      const propio = responder?.(llamadas.length, pedido);
      if (propio instanceof Error) throw propio;
      let texto = propio;
      if (texto === undefined) {
        if (pedido.includes('Escribe un guion para un video')) texto = JSON.stringify(GUION);
        else if (pedido.includes('guion completo de un en vivo')) texto = JSON.stringify(EN_VIVO);
        else if (pedido.includes('Recomiéndale 5 tipos de producto')) texto = JSON.stringify(IDEAS);
        else if (pedido.includes('en tendencia en TikTok Shop')) texto = JSON.stringify(TENDENCIAS);
        else texto = JSON.stringify(RESPUESTAS);
      }
      const conWeb = opciones?.busquedasWeb > 0;
      return { texto, modelo: 'ia-de-prueba', uso: { entrada: 100, salida: 200 }, fuentes: conWeb ? FUENTES : [], busquedasWeb: conWeb ? 2 : 0 };
    },
  };
}

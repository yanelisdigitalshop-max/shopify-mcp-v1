// Parte 8: política de privacidad (la exigen Apple y Google).
//
// BORRADOR. Lo escribió la IA a partir de lo que la app hace de verdad (27 nov 2026).
// Lo tienen que revisar la dueña o un abogado ANTES de publicar en las tiendas.
// Si cambia el texto, cambia VERSION_PRIVACIDAD.
// Si la app empieza a usar otro servicio o a guardar otro dato, ESTE TEXTO SE ACTUALIZA.

import { NEGOCIO } from './datos.js';

export const VERSION_PRIVACIDAD = 'borrador-2026-11-27';
export const PRIVACIDAD_ES_BORRADOR = true;
export const EMPRESA = 'Machado Luxury Estates Corp.';

export const PRIVACIDAD = [
  {
    titulo: 'Quién es responsable',
    texto: `${NEGOCIO.nombreApp} es una app de ${EMPRESA}, ${NEGOCIO.direccion}. Para cualquier pregunta sobre tus datos: ${NEGOCIO.correoSoporte}.`,
  },
  {
    titulo: 'Para quién es',
    texto: 'Vendiva es solo para personas de 18 años o más. Al registrarte confirmas tu edad. No recogemos a sabiendas datos de menores; si nos enteramos de una cuenta de un menor, la borramos.',
  },
  {
    titulo: 'Qué datos guardamos',
    lista: [
      'Tu cuenta: nombre, correo, teléfono y tu contraseña protegida (guardamos solo una huella cifrada, nunca la contraseña).',
      'Tu perfil: lo que vendes, los seguidores que tú escribes, cómo prefieres grabar, tu objetivo, las redes que usas y tus nombres de usuario en ellas (opcionales). Nunca te pedimos contraseñas de tus redes.',
      'Tus productos y lo que la app crea para ti: guiones, textos, videos (solo el enlace del proveedor), GIFs y respuestas.',
      'Las grabaciones de tu voz que haces en la app para tus videos, y las voces de IA que pides.',
      'Tu calendario de publicaciones y las calificaciones de tu vitrina que tú escribes.',
      'Tus pagos: qué plan o paquete pagaste, cuándo y cuánto. Los números de tu tarjeta NO los vemos ni los guardamos: los maneja Stripe.',
      'Si usas la app del teléfono y aceptas las notificaciones: un código del teléfono para enviarte avisos.',
      'Datos técnicos mínimos para que la app funcione y sea segura: una cookie de sesión y registros del servidor.',
    ],
  },
  {
    titulo: 'Para qué los usamos',
    lista: [
      'Para darte el servicio: crear tus guiones, videos, voces y textos, guardar tu calendario y tu vitrina.',
      'Para cobrar tu plan o tus paquetes y llevar tus créditos.',
      'Para avisarte cuando te toca publicar o cuando un cobro no pasó.',
      'Para mantener la app segura y arreglar fallas.',
    ],
  },
  {
    titulo: 'Con quién los compartimos',
    texto: 'Solo con los servicios que hacen funcionar la app, y solo lo que cada uno necesita:',
    lista: [
      'Anthropic (Claude): tu perfil y los datos del producto, para escribir guiones, textos y planes.',
      'FastMoss: lo que buscas en el buscador de productos.',
      'Runway: la foto del producto y las instrucciones del video.',
      'ElevenLabs: el texto que la voz de IA va a leer.',
      'Stripe: tus pagos.',
      'Google Firebase: el código de tu teléfono para las notificaciones.',
      'El servicio de hosting donde funciona Vendiva.',
    ],
    nota: 'No vendemos tus datos. No mostramos anuncios ni te seguimos en otras apps o páginas.',
  },
  {
    titulo: 'Cuánto tiempo los guardamos',
    texto: 'Mientras tengas tu cuenta. Si la borras, borramos todo lo tuyo de Vendiva en ese momento. Stripe conserva el registro de los cobros que ya se hicieron, como lo exige la ley.',
  },
  {
    titulo: 'Cómo borrar tu cuenta',
    texto:
      'En la app: Mi cuenta → «Borrar mi cuenta». Se cancela tu plan en ese momento (sin reembolso) y se borra todo lo tuyo. También puedes pedirlo escribiendo desde tu correo de la cuenta a ' +
      `${NEGOCIO.correoSoporte}.`,
  },
  {
    titulo: 'Tus derechos',
    texto: `Puedes ver y corregir tus datos en Mi cuenta, y pedirnos una copia o que los borremos escribiendo a ${NEGOCIO.correoSoporte}.`,
  },
  {
    titulo: 'Seguridad',
    texto: 'La conexión va cifrada, las contraseñas se guardan con un hash fuerte y la sesión viaja en una cookie que la página no puede leer. Ningún sistema es perfecto, pero cuidamos tus datos como si fueran nuestros.',
  },
  {
    titulo: 'Cambios',
    texto: 'Si cambiamos esta política, actualizamos la fecha y te avisamos en la app.',
  },
];

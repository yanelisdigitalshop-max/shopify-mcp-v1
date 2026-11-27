// Toda la configuración sale de variables de entorno del servidor.
// Ninguna llave se escribe en el código ni en el repositorio.

// Parte 7: el seguro contra cobros reales. Mientras la dueña no lo apruebe por escrito,
// el servidor NO arranca con una llave de Stripe que no sea de prueba. Para quitar el
// seguro hace falta poner VENDIVA_PAGOS_REALES exactamente con este texto.
export const TEXTO_PAGOS_REALES = 'aprobado-por-escrito-por-la-duena';

/** Revisa las llaves de Stripe y decide el modo: 'apagado' (sin llave), 'prueba' o 'real'. */
export function modoDePagos(env) {
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const llave = texto(env.VENDIVA_STRIPE_SECRET_KEY);
  if (!llave) return 'apagado';
  const deprueba = /^(sk|rk)_test_/.test(llave);
  if (deprueba) return 'prueba';
  if (env.VENDIVA_PAGOS_REALES === TEXTO_PAGOS_REALES) return 'real';
  throw new Error(
    'VENDIVA_STRIPE_SECRET_KEY no es una llave de PRUEBA (debe empezar con sk_test_ o rk_test_). ' +
      'Vendiva no cobra de verdad hasta que la dueña lo apruebe por escrito: el servidor no arranca. ' +
      'Pon la llave de modo de prueba de Stripe.',
  );
}

export function leerConfig(env = process.env) {
  const produccion = env.NODE_ENV === 'production';
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

  return {
    produccion,
    puerto: Number(env.PORT) || 3000,

    // PostgreSQL. En producción es obligatoria: sin ella el servidor no arranca,
    // para no guardar datos de usuarias en un disco que se borra.
    databaseUrl: texto(env.DATABASE_URL),
    // Solo para trabajar en la computadora: base PostgreSQL local en una carpeta.
    dirDatosLocales: texto(env.VENDIVA_DATOS_LOCALES) ?? '.datos-locales',

    // Detrás del proxy del hosting (Render, Railway, Fly...) hace falta para
    // reconocer HTTPS y la IP real.
    confiarEnProxy: texto(env.TRUST_PROXY) ?? (produccion ? '1' : null),

    // Origen público de la app, por ejemplo https://app.vendiva.com.
    // Si está puesto, las peticiones que cambian datos deben venir de ahí.
    origenApp: texto(env.APP_ORIGIN),

    sesion: {
      nombreCookie: 'vendiva_sesion',
      dias: 30,
    },

    // Costo del hash de contraseñas (scrypt). Las pruebas lo bajan para ir rápido.
    scrypt: {
      N: Number(env.VENDIVA_SCRYPT_N) || 2 ** 15,
      r: 8,
      p: 3,
    },

    limitarPeticiones: env.VENDIVA_SIN_LIMITES !== '1',

    anthropic: {
      // Solo se guarda SI existe, nunca el valor.
      llaveConfigurada: Boolean(texto(env.VENDIVA_ANTHROPIC_API_KEY) ?? texto(env.ANTHROPIC_API_KEY)),
      modelo: texto(env.ANTHROPIC_MODEL) ?? 'claude-haiku-5-5',
    },

    fastmoss: {
      // Solo se guarda SI existe, nunca el valor.
      llaveConfigurada: Boolean(texto(env.VENDIVA_FASTMOSS_CLIENT_SECRET)),
    },

    runway: {
      llaveConfigurada: Boolean(texto(env.VENDIVA_RUNWAY_API_KEY)),
    },

    // Voz de IA de los videos (Parte 4). Solo se guarda SI existe, nunca el valor.
    elevenlabs: {
      llaveConfigurada: Boolean(texto(env.VENDIVA_ELEVENLABS_API_KEY)),
    },

    // Parte 7: pagos con Stripe. Solo se guarda SI existen las llaves, nunca el valor.
    // modo: 'apagado' (sin llave), 'prueba' (sk_test_) o 'real' (solo con el seguro quitado).
    pagos: {
      modo: modoDePagos(env),
      llaveConfigurada: Boolean(texto(env.VENDIVA_STRIPE_SECRET_KEY)),
      webhookConfigurado: Boolean(texto(env.VENDIVA_STRIPE_WEBHOOK_SECRET)),
    },
  };
}

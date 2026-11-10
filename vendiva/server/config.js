// Toda la configuración sale de variables de entorno del servidor.
// Ninguna llave se escribe en el código ni en el repositorio.

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
      llaveConfigurada: Boolean(texto(env.ANTHROPIC_API_KEY)),
      modelo: texto(env.ANTHROPIC_MODEL) ?? 'claude-opus-5-5',
    },
  };
}

// Arma la aplicación Express: seguridad, rutas /api y manejo de errores.
// No abre el puerto ni sirve la interfaz: eso lo hace server/index.js.

import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import { rateLimit } from 'express-rate-limit';
import { ErrorApp } from './errores.js';
import { cargarSesion } from './auth/sesiones.js';
import { rutasCuenta } from './rutas/cuenta.js';
import { rutasPerfil } from './rutas/perfil.js';
import { rutasProductos } from './rutas/productos.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defensa contra peticiones forjadas desde otras páginas (CSRF):
 * todo lo que cambia datos debe traer la cabecera propia de Vendiva
 * (una página ajena no puede ponerla) y, si el navegador dice de dónde
 * viene, tiene que ser de la propia app.
 */
function protegerCambios(config) {
  return (req, _res, next) => {
    if (METODOS_SEGUROS.has(req.method)) return next();

    const rechazo = () => next(new ErrorApp(403, 'ORIGEN_NO_PERMITIDO', 'No pudimos confirmar que la petición viene de Vendiva.'));
    if (req.get('x-vendiva') !== '1') return rechazo();

    const origen = req.get('origin');
    if (origen) {
      if (config.origenApp) {
        if (origen !== config.origenApp) return rechazo();
      } else {
        // Sin APP_ORIGIN: el origen tiene que ser el mismo dominio que atiende la petición.
        // Detrás del proxy del hosting, el dominio público llega en X-Forwarded-Host.
        let dominio;
        try {
          dominio = new URL(origen).host;
        } catch {
          return rechazo();
        }
        const propios = [req.get('host'), config.confiarEnProxy ? req.get('x-forwarded-host') : null];
        if (!propios.includes(dominio)) return rechazo();
      }
    }
    next();
  };
}

export function crearApp({ db, config, reloj = () => new Date() }) {
  const app = express();
  app.disable('x-powered-by');
  if (config.confiarEnProxy) app.set('trust proxy', Number(config.confiarEnProxy) || config.confiarEnProxy);

  app.use(
    helmet({
      // En desarrollo Vite inyecta scripts para recargar en caliente.
      contentSecurityPolicy: config.produccion
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              mediaSrc: ["'self'", 'blob:'],
              fontSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
    }),
  );
  app.use(compression());

  const api = express.Router();
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  if (config.limitarPeticiones) {
    api.use(
      rateLimit({
        windowMs: 5 * 60 * 1000,
        limit: 600,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: (_req, _res, next) =>
          next(new ErrorApp(429, 'DEMASIADAS_PETICIONES', 'Vas muy rápido. Espera un momento y sigue.')),
      }),
    );
  }

  // Estado del servidor. Dice SI la llave de Claude está puesta, nunca cuál es.
  api.get('/salud', async (_req, res) => {
    let baseDeDatos = 'lista';
    try {
      await db.query('select 1');
    } catch {
      baseDeDatos = 'sin conexión';
    }
    res.status(baseDeDatos === 'lista' ? 200 : 503).json({
      ok: baseDeDatos === 'lista',
      app: 'Vendiva',
      baseDeDatos,
      claude: config.anthropic.llaveConfigurada ? 'llave puesta' : 'falta la llave',
    });
  });

  api.use(protegerCambios(config));
  api.use(express.json({ limit: '100kb' }));
  api.use(cargarSesion(db, config));

  const contexto = { db, config, reloj };
  api.use(rutasCuenta(contexto));
  api.use(rutasPerfil(contexto));
  api.use(rutasProductos(contexto));

  api.use((_req, _res, next) => next(new ErrorApp(404, 'RUTA_NO_ENCONTRADA', 'Esa dirección no existe.')));

  // Un solo lugar convierte cualquier error en una respuesta amable.
  // eslint-disable-next-line no-unused-vars
  api.use((err, req, res, _next) => {
    if (err instanceof ErrorApp) {
      return res.status(err.estado).json({
        error: { codigo: err.codigo, mensaje: err.message, campos: err.campos ?? undefined, datos: err.datos ?? undefined },
      });
    }
    if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
      return res.status(400).json({ error: { codigo: 'DATOS_INVALIDOS', mensaje: 'No pudimos leer lo que enviaste. Intenta de nuevo.' } });
    }
    console.error(`[api] ${req.method} ${req.path}:`, err);
    res.status(500).json({
      error: { codigo: 'ERROR_INTERNO', mensaje: 'Algo falló de nuestro lado. Tus datos están a salvo; intenta de nuevo en un momento.' },
    });
  });

  app.use('/api', api);
  return app;
}

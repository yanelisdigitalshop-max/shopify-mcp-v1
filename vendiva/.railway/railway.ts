// Vendiva en Railway (Infrastructure as Code). Decisión de la dueña, 27 nov 2026.
//
// NADA DE ESTO SE CREA SOLO. Se aplica a mano, y solo con la aprobación escrita de la dueña:
//   railway config plan     muestra qué se crearía (no cambia nada)
//   railway config apply    lo crea (pide confirmación)
// Ver DESPLIEGUE.md. Requiere la CLI de Railway 5.42.1 o más nueva y el paquete "railway"
// (está en devDependencies). Los campos se tomaron del paquete oficial railway@3.19.1.
//
// Las llaves (Claude, FastMoss, Runway, ElevenLabs, Stripe, Firebase, la de las copias)
// NO están aquí: la dueña las pone en el panel de Railway. preserve() hace que este archivo
// no las toque ni las borre.

import { bucket, defineRailway, github, postgres, preserve, project, ref, service } from 'railway/iac';

const REPO = 'yanelisdigitalshop-max/shopify-mcp-v1';
const RAMA = 'main';
const CARPETA = 'vendiva';

export default defineRailway(() => {
  // Base de datos PostgreSQL. Sus copias automáticas de Railway (diarias, semanales,
  // mensuales) se encienden en el panel, en su volumen: ver DESPLIEGUE.md.
  const db = postgres('base-de-datos');

  // Donde se guardan las copias de seguridad propias (cifradas). Región iad: este de EE. UU.
  const copias = bucket('copias-de-seguridad', { region: 'iad' });

  const llaves = {
    VENDIVA_ANTHROPIC_API_KEY: preserve(),
    VENDIVA_FASTMOSS_CLIENT_SECRET: preserve(),
    VENDIVA_RUNWAY_API_KEY: preserve(),
    VENDIVA_ELEVENLABS_API_KEY: preserve(),
    VENDIVA_ELEVENLABS_VOICE_ID: preserve(),
    VENDIVA_STRIPE_SECRET_KEY: preserve(),
    VENDIVA_STRIPE_WEBHOOK_SECRET: preserve(),
    VENDIVA_FIREBASE_CUENTA_SERVICIO: preserve(),
    APP_ORIGIN: preserve(),
  };

  // La app: servidor + interfaz, con el Dockerfile de la carpeta vendiva/.
  const app = service('vendiva', {
    source: github(REPO, { branch: RAMA, rootDirectory: CARPETA }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: {
      startCommand: 'node server/index.js',
      healthcheckPath: '/api/salud',
      healthcheckTimeout: 60,
      restartPolicyType: 'ON_FAILURE',
      restartPolicyMaxRetries: 5,
    },
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: db.env.DATABASE_URL,
      ...llaves,
    },
  });

  // Copia de seguridad cada noche: 08:00 UTC = 3:00 a. m. en Florida (4:00 en horario de verano).
  // Corre, guarda la copia cifrada en el bucket, borra las viejas y termina.
  const respaldo = service('copia-nocturna', {
    source: github(REPO, { branch: RAMA, rootDirectory: CARPETA }),
    build: { builder: 'DOCKERFILE', dockerfilePath: 'Dockerfile' },
    deploy: {
      startCommand: 'node server/scripts/respaldo.js',
      cronSchedule: '0 8 * * *',
      restartPolicyType: 'NEVER',
    },
    env: {
      NODE_ENV: 'production',
      DATABASE_URL: db.env.DATABASE_URL,
      ENDPOINT: ref(copias, 'ENDPOINT'),
      REGION: ref(copias, 'REGION'),
      BUCKET: ref(copias, 'BUCKET'),
      ACCESS_KEY_ID: ref(copias, 'ACCESS_KEY_ID'),
      SECRET_ACCESS_KEY: ref(copias, 'SECRET_ACCESS_KEY'),
      // La llave que cifra las copias. La dueña la crea, la pone en el panel y la guarda
      // también FUERA de Railway: sin ella, las copias no se pueden abrir.
      VENDIVA_RESPALDO_CLAVE: preserve(),
    },
  });

  return project('vendiva', { resources: [db, copias, app, respaldo] });
});

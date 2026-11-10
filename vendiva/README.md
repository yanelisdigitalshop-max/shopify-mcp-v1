# Vendiva

App de suscripción mensual para afiliadas de TikTok Shop: reciben un producto de muestra, lo muestran en video y ganan comisión. Vendiva les dice qué decir y cómo mostrarlo, con cámara o sin cámara (manos + producto + su voz). Sin avatar.

Esta es la **app real** (servidor + base de datos), no el prototipo. Se construye parte por parte siguiendo la *Guía para crear Vendiva con Claude*. El *Resumen de Vendiva para Claude* (9 de noviembre de 2026) manda sobre cualquier texto viejo.

## Estado

| Parte | Qué es | Estado |
|---|---|---|
| Paso 0 | Conexión con Claude leyendo la llave de variables de entorno | Código listo. **Falta que la dueña ponga su llave** |
| Parte 1 | Base y cuentas: registro, sesión, Hoy, productos (tope de 6 en Gratis), 9 niveles | Lista para revisar |
| Parte 2 | Guiones con la IA real | Pendiente |
| Parte 3 | Buscador y tendencias | Pendiente |
| Parte 4 | Foto a video, 3 videos y 3 GIFs | Pendiente |
| Parte 5 | Voz y Programar | Pendiente |
| Parte 6 | Textos para 4 redes y Vitrina | Pendiente |
| Parte 7 | Pagos (primero en modo de prueba) | Pendiente |
| Parte 8 | Publicar en Apple y Google | Pendiente |

## Paso 0: dónde va la llave de Anthropic

La llave la crea la dueña en [console.anthropic.com](https://console.anthropic.com) con su propia cuenta. **Nunca se pega en un chat, en el código ni en el repositorio.** Solo va en uno de estos dos lugares:

- **En producción:** en la configuración segura del hosting, como variable de entorno llamada `ANTHROPIC_API_KEY`.
- **En una computadora de trabajo:** en el archivo `.env` (se crea copiando `.env.example`). Ese archivo está en `.gitignore` y no se sube.

Para comprobar que quedó bien, sin que nadie vea la llave:

```bash
npm run probar:claude
```

Hace una sola llamada muy pequeña y responde «Conexión con Claude: funciona» o explica qué falló. También se puede abrir `/api/salud` en el navegador: dice `"claude": "llave puesta"` o `"falta la llave"`, nunca el valor.

El código de la conexión está en `server/ia/claude.js`:

- `callClaude(messages, opciones)` llama a la API de Anthropic y devuelve el texto.
- `parseClaudeJson(text)` convierte la respuesta en objeto, aunque venga con cercas de código o con texto alrededor.

## Cómo correrla en una computadora

Hace falta Node 22.9 o más nuevo.

```bash
npm install
```

```bash
npm run dev
```

Abre `http://localhost:3000`. Sin `DATABASE_URL`, la app crea sola una base PostgreSQL local en la carpeta `.datos-locales/` (PGlite), así que no hay que instalar nada más.

## Pruebas

```bash
npm test
```

Levantan el servidor real contra una base desechable y comprueban cuentas, sesiones, perfil, niveles, productos, créditos y la conexión con Claude (con un cliente de mentira: no gasta). Para correrlas contra un PostgreSQL de verdad:

```bash
VENDIVA_TEST_DATABASE_URL=postgres://usuario:clave@localhost:5432/vendiva_pruebas npm test
```

Esa base se vacía en cada corrida: usar una dedicada solo a pruebas.

## Producción

```bash
npm run build
```

```bash
npm start
```

Variables de entorno (ver `.env.example`):

| Variable | Para qué | Obligatoria |
|---|---|---|
| `DATABASE_URL` | PostgreSQL donde viven las cuentas y los datos | Sí en producción. Sin ella el servidor no arranca |
| `ANTHROPIC_API_KEY` | Llave de Claude (Paso 0) | Desde la Parte 2 |
| `APP_ORIGIN` | Dirección pública, por ejemplo `https://app.vendiva.com` | Recomendada |
| `ANTHROPIC_MODEL` | Otro modelo de Claude. Por defecto `claude-opus-5-5` | No |
| `PORT` | Puerto. Por defecto 3000 | No |

Las tablas se crean y actualizan solas al arrancar (`server/db/migraciones/`). También hay un `Dockerfile` listo para cualquier hosting que acepte contenedores.

## Cómo está armada

```
shared/datos.js        Datos fijos: planes, créditos, costos, paquetes, 9 niveles, datos del negocio
server/
  index.js             Arranque (en desarrollo sirve la interfaz con Vite; en producción, dist/)
  app.js               Seguridad, rutas /api y manejo de errores
  config.js            Lee las variables de entorno
  db/                  Conexión a PostgreSQL y migraciones
  auth/                Hash de contraseñas (scrypt) y sesiones
  rutas/               cuenta, perfil, productos
  servicios/           estado completo de la usuaria, créditos
  ia/claude.js         callClaude y parseClaudeJson
src/
  estado/Estado.jsx    Un solo estado central; el servidor es la fuente de verdad
  componentes/         ProductCard, PlanCard, Stepper, TabBar, EmptyState, LoadingPulse...
  pantallas/           Acceso, Registro, Hoy, Productos, Planes, Cuenta
tests/                 Pruebas del servidor
```

## Reglas que el código hace cumplir

- **Datos fijos.** Planes (Gratis $0, Esencial $19, Crecimiento $39, Pro $59), créditos (30 / 200 / 600 / 2.000), costos, paquetes, niveles y datos del negocio viven en `shared/datos.js`. `tests/datos-fijos.test.js` falla si alguien cambia un número. No se tocan sin aprobación escrita de la dueña.
- **Plan Gratis: máximo 6 productos en total.** Lo decide el servidor, dentro de una transacción: ni con varios toques a la vez entra el séptimo.
- **Créditos.** Los del plan se reponen solos el día 1 (hora de Florida) y cada movimiento queda escrito en `movimientos_creditos`. Los de paquete no vencen.
- **Contraseñas.** Se guarda solo un hash scrypt con sal propia. La sesión viaja en una cookie que la página no puede leer; en la base queda solo su huella.
- **Nada en el navegador.** Ni `localStorage` ni `sessionStorage`: todo persiste en la base del servidor.
- **Nombre.** La app se llama Vendiva. Una prueba revisa que el nombre viejo no aparezca en ningún archivo.
- **Honestidad.** Lo que todavía no existe se marca como «Todavía no está construido». Nada de reseñas, ventas ni calificaciones inventadas.

## Decisiones de la dueña sobre la Parte 1

- La pestaña Planes se queda como está: su plan, su saldo de créditos y la tabla de los 4 planes.
- Los créditos del plan se reponen solos el día 1.
- El modelo de Claude es `claude-opus-5-5` por ahora.
- **Queda para después, por decisión suya (no construir todavía):** recuperar la contraseña olvidada, y aceptar las políticas y confirmar 18 años al registrarse.
- El hosting todavía no se elige: por ahora se prueba en local.

## Datos del negocio

Vendiva · 420 Opa Locka Blvd, North Miami, FL 33168 · machadodelosangele@gmail.com · Ley de Florida.

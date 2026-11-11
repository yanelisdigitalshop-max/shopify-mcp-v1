# Vendiva

App de suscripción mensual para afiliadas de TikTok Shop: reciben un producto de muestra, lo muestran en video y ganan comisión. Vendiva les dice qué decir y cómo mostrarlo, con cámara o sin cámara (manos + producto + su voz). Sin avatar.

Esta es la **app real** (servidor + base de datos), no el prototipo. Se construye parte por parte siguiendo la *Guía para crear Vendiva con Claude*. El *Resumen de Vendiva para Claude* (9 de noviembre de 2026) manda sobre cualquier texto viejo.

## Estado

| Parte | Qué es | Estado |
|---|---|---|
| Paso 0 | Conexión con Claude leyendo la llave de variables de entorno | Listo. Probado con la llave de la dueña y `claude-opus-5-5` (10 nov 2026) |
| Parte 1 | Base y cuentas: registro (con confirmación de 18 años), sesión, Hoy, productos (tope de 6 en Gratis), 9 niveles | Lista para revisar |
| Parte 2 | Guiones con la IA real (gratis e ilimitados, en los dos modos), guion de en vivo (10 créditos) y 3 respuestas a comentarios (3 créditos) con aviso antes de crear | Lista para revisar |
| Parte 3 | Buscador de productos (10 búsquedas al mes en Gratis, sin límite en pago) y tendencias de la semana (solo planes de pago) | Lista para revisar |
| Parte 4 | Foto a video, 3 videos y 3 GIFs | Pendiente |
| Parte 5 | Voz y Programar | Pendiente |
| Parte 6 | Textos para 4 redes y Vitrina | Pendiente |
| Parte 7 | Pagos (primero en modo de prueba) | Pendiente |
| Parte 8 | Publicar en Apple y Google | Pendiente |

## Paso 0: dónde va la llave de Anthropic

La llave la crea la dueña en [console.anthropic.com](https://console.anthropic.com) con su propia cuenta. **Nunca se pega en un chat, en el código ni en el repositorio.** Solo va en uno de estos dos lugares:

- **En producción:** en la configuración segura del hosting, como variable de entorno llamada `VENDIVA_ANTHROPIC_API_KEY`.
- **En una computadora de trabajo:** en el archivo `.env` (se crea copiando `.env.example`). Ese archivo está en `.gitignore` y no se sube.

La app lee `VENDIVA_ANTHROPIC_API_KEY` y, si no existe, `ANTHROPIC_API_KEY`. Se prefiere el nombre propio porque `ANTHROPIC_API_KEY` también lo leen otras herramientas (Claude Code, por ejemplo) y donde conviven se pisarían. La llave solo se envía a `api.anthropic.com`.

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
| `VENDIVA_ANTHROPIC_API_KEY` | Llave de Claude (Paso 0). También vale `ANTHROPIC_API_KEY` | Desde la Parte 2 |
| `APP_ORIGIN` | Dirección pública, por ejemplo `https://app.vendiva.com` | Recomendada |
| `ANTHROPIC_MODEL` | Otro modelo de Claude. Por defecto `claude-haiku-5-5` | No |
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
  ia/guionista.js      Lo que se le pide a Claude y la revisión de lo que devuelve
  ia/descubrir.js      Buscador de productos y tendencias (con búsqueda web y fuentes comprobadas)
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

## Parte 2: lo que escribe la IA

- **Guiones:** `POST /api/productos/:id/guiones`. Tres guiones, cada uno con cámara y sin cámara. No gastan créditos y no llevan aviso. Se escriben los tres a la vez para que la espera sea de unos 15 segundos.
- **Guion de en vivo (10 créditos) y 3 respuestas a comentarios (3 créditos):** el servidor solo crea si llega el costo que ella aceptó en el aviso (`costoAceptado`).
- **Créditos:** primero se gastan los del plan y luego los de paquete. El plan Gratis frena si no alcanza (sin llamar a la IA). Los planes de pago no frenan: se descuenta hasta cero y se crea igual. Si la IA falla, se devuelve lo cobrado.
- **Honestidad:** las instrucciones a la IA (`server/ia/guionista.js`) prohíben inventar datos del producto y prometer resultados, ventas o seguidores. Sin avatar; en el modo sin cámara su cara no aparece.
- **Modelo:** `claude-haiku-5-5`, el Haiku más reciente, para las tres creaciones (decisión de la dueña, 11 nov 2026).
- **Costo medido con `claude-haiku-5-5` (11 nov 2026):** cerca de 0,3 centavos de dólar por cada juego de 3 guiones, 0,14 por un guion de en vivo y 0,04 por las 3 respuestas. Con `claude-opus-5-5` eran 12, 6 y 2 centavos. Cada creación guarda el modelo y los tokens usados en la tabla `creaciones`.
- **Tope de guiones en el plan Gratis:** 100 veces «Crear mis 3 guiones» por mes. Solo cuenta lo entregado y vuelve a cero el día 1, junto con los créditos. Pasado el tope puede seguir creando: cada vez extra cuesta 1 crédito, con el aviso de costo antes y la devolución si la IA falla (decisión de la dueña, 11 nov 2026). Los planes de pago no tienen tope ni pagan nada por los guiones.
- **Sin construir en esta parte:** ChatGPT como respaldo (no hay llave de OpenAI) y el registro de ventas.

## Parte 3: buscador y tendencias

- **Vendiva no ve el catálogo de TikTok Shop.** El buscador (`POST /api/buscador`) da 5 ideas de tipos de producto: por qué venden, la comisión que conviene buscar, cómo comprobar y pedir la muestra gratis, y frases exactas para buscar en TikTok Shop. La pantalla lo dice tal cual; las instrucciones a la IA le prohíben afirmar que un producto concreto tiene muestra o tal comisión.
- **Búsquedas:** no gastan créditos. Plan Gratis: 10 al mes, vuelven a cero el día 1 y solo cuentan las entregadas. Planes de pago: sin límite.
- **Guardar una idea** (`POST /api/buscador/:id/guardar`) la agrega a sus productos con origen «buscador», respetando el tope de 6 del plan Gratis. «Crear su video» lleva a Hoy con ese producto elegido para crear sus 3 guiones.
- **Tendencias de la semana** (`POST /api/tendencias`): solo planes de pago, uno por semana y por usuaria. Se escriben con una búsqueda web real (`web_search_20250305`); cada tendencia debe citar una página que salió en esa búsqueda y las que no, se descartan. En Gratis no se crea ni se ve: solo un aviso para subir de plan. Al bajar de plan el reporte se oculta, no se borra.
- **Costo medido con `claude-haiku-5-5` (11 nov 2026):** cerca de 0,1 centavos de dólar por búsqueda y 1,3 centavos por reporte de tendencias (la mayor parte es la búsqueda web).
- **No hay publicación automática en TikTok.**

## Decisiones de la dueña sobre la Parte 1

- La pestaña Planes se queda como está: su plan, su saldo de créditos y la tabla de los 4 planes.
- Los créditos del plan se reponen solos el día 1.
- El modelo de Claude fue `claude-opus-5-5` hasta el 11 de noviembre de 2026; desde entonces es `claude-haiku-5-5`.
- Al registrarse hay una casilla obligatoria, «Confirmo que tengo 18 años o más». Sin marcarla el servidor no crea la cuenta, y queda guardado cuándo la marcó.
- **Queda para después, por decisión suya (no construir todavía):** recuperar la contraseña olvidada y aceptar las políticas al registrarse.
- El hosting todavía no se elige: por ahora se prueba en local.

## Datos del negocio

Vendiva · 420 Opa Locka Blvd, North Miami, FL 33168 · machadodelosangele@gmail.com · Ley de Florida.

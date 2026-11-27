# Vendiva

App de suscripción mensual para afiliadas de TikTok Shop: reciben un producto de muestra, lo muestran en video y ganan comisión. Vendiva les dice qué decir y cómo mostrarlo, con cámara o sin cámara (manos + producto + su voz). Sin avatar.

Esta es la **app real** (servidor + base de datos), no el prototipo. Se construye parte por parte siguiendo la *Guía para crear Vendiva con Claude*. El *Resumen de Vendiva para Claude* (9 de noviembre de 2026) manda sobre cualquier texto viejo.

## Estado

| Parte | Qué es | Estado |
|---|---|---|
| Paso 0 | Conexión con Claude leyendo la llave de variables de entorno | Listo. Probado con la llave de la dueña y `claude-opus-5-5` (10 nov 2026) |
| Parte 1 | Base y cuentas: registro (con confirmación de 18 años), sesión, Hoy, productos (tope de 6 en Gratis), 9 niveles | Lista para revisar |
| Parte 2 | Guiones con la IA real (gratis e ilimitados, en los dos modos), guion de en vivo (10 créditos) y 3 respuestas a comentarios (3 créditos) con aviso antes de crear | Lista para revisar |
| Parte 3 | Buscador y tendencias con datos de FastMoss (60 búsquedas al mes en Gratis; tendencias solo de pago) | Código listo y probado con un FastMoss de mentira. **Falta la llave de FastMoss** |
| Parte 4 | Videos con IA (Runway Gen-4 Turbo): 3 videos cortos, 3 desde la foto y 3 GIFs por producto; créditos de texto y de video por separado | Código listo y probado con un Runway de mentira. **Falta la llave de Runway** |
| Parte 5 | Voz (hecha en la Parte 4) y Programar: su calendario de publicaciones | Lista para revisar |
| Parte 6 | Textos para 4 redes y Vitrina | Lista para revisar (probada con una IA de mentira) |
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
| `VENDIVA_FASTMOSS_CLIENT_SECRET` | `client_secret` de FastMoss (buscador y tendencias) | Desde la Parte 3 |
| `VENDIVA_RUNWAY_API_KEY` | Llave de la API de Runway (videos con IA) | Desde la Parte 4 |
| `VENDIVA_ELEVENLABS_API_KEY` | Llave de la API de ElevenLabs (voz de IA de los videos) | Desde la Parte 4 |
| `VENDIVA_ELEVENLABS_VOICE_ID` | La voz de IA elegida (femenina, español). Vacía = voz prediseñada | No, pero recomendada |
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
  fuentes/fastmoss.js  Conexión con la API de FastMoss (buscador y más vendidos de la semana)
  fuentes/runway.js    Conexión con la API de Runway (videos desde la foto)
  fuentes/elevenlabs.js Conexión con la API de ElevenLabs (voz de IA)
  servicios/voces.js   Voz real y voz de IA de cada video
  servicios/mezcla.js  Une la voz con el video al descargarlo (ffmpeg)
  servicios/videos.js  Crear videos, revisar los que Runway termina y devolver créditos si fallan
  servicios/publicaciones.js  Programar: su calendario de publicaciones
  servicios/textos-redes.js  Textos de cada guion para Instagram, Facebook y Pinterest
  servicios/vitrina.js  Vitrina (solo Pro): calificaciones y plan
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
- **Créditos:** se gastan los créditos de texto del plan (desde la Parte 4 los paquetes son solo de video). El plan Gratis frena si no alcanza (sin llamar a la IA). Los planes de pago no frenan: se descuenta hasta cero y se crea igual. Si la IA falla, se devuelve lo cobrado.
- **Honestidad:** las instrucciones a la IA (`server/ia/guionista.js`) prohíben inventar datos del producto y prometer resultados, ventas o seguidores. Sin avatar; en el modo sin cámara su cara no aparece.
- **Modelo:** `claude-haiku-5-5`, el Haiku más reciente, para las tres creaciones (decisión de la dueña, 11 nov 2026).
- **Costo medido con `claude-haiku-5-5` (11 nov 2026):** cerca de 0,3 centavos de dólar por cada juego de 3 guiones, 0,14 por un guion de en vivo y 0,04 por las 3 respuestas. Con `claude-opus-5-5` eran 12, 6 y 2 centavos. Cada creación guarda el modelo y los tokens usados en la tabla `creaciones`.
- **Tope de guiones en el plan Gratis:** 100 veces «Crear mis 3 guiones» por mes. Solo cuenta lo entregado y vuelve a cero el día 1, junto con los créditos. Pasado el tope puede seguir creando: cada vez extra cuesta 1 crédito, con el aviso de costo antes y la devolución si la IA falla (decisión de la dueña, 11 nov 2026). Los planes de pago no tienen tope ni pagan nada por los guiones.
- **Sin construir en esta parte:** ChatGPT como respaldo (no hay llave de OpenAI) y el registro de ventas.

## Parte 3: buscador y tendencias con FastMoss

Los datos vienen de la API REST de FastMoss (`server/fuentes/fastmoss.js`), verificada en la documentación oficial (developers.fastmoss.com) el 11 de noviembre de 2026:

- **Dirección:** `https://openapi.fastmoss.com`, todo con POST y JSON. **Autenticación:** `Authorization: Bearer <client_secret>`.
- **Buscador:** `POST /product/v1/search` con `keywords`, región `US`, productos a la venta, ordenados por ventas de 7 días, `pagesize` 10. **Una búsqueda = una llamada**; nunca se reintenta sola.
- **Tendencias:** `POST /product/v1/rank/topSelling` con `date_info` de tipo `week` (la semana anterior completa), región `US`, `pagesize` 10. Un reporte por semana para todas las usuarias: se pide una sola vez. Si esa semana todavía no tiene datos, se pide la anterior.
- **Precio de lista:** 0,01 USD por llamada en las dos (hasta 10 resultados). Si no hay resultados, FastMoss no cobra.
- **Errores:** `code` distinto de 0 (10001 parámetros, 30001 sin permiso, 30002 límite de datos, 30003 demasiadas peticiones, 40001 servicio) se convierte en un mensaje amable.

Reglas:

- **La llave** va en la variable de entorno `VENDIVA_FASTMOSS_CLIENT_SECRET`. Nunca en el código ni en el chat. `/api/salud` dice si está puesta.
- **Búsquedas:** no gastan créditos. Plan Gratis: 60 al mes (decisión de la dueña, 13 nov 2026), vuelven a cero el día 1; una búsqueda sin resultados no cuenta y el servidor rechaza la 61 con el aviso de subir de plan. Planes de pago: sin límite. La pestaña Planes lo muestra en cada tarjeta.
- **En pantalla** se dice que las cifras son estimadas de FastMoss y que la muestra gratis no la confirma FastMoss: se confirma y se pide dentro de TikTok Shop.
- **Guardar** un producto lo agrega a sus productos con su precio, comisión y enlace, respetando el máximo de 6 del plan Gratis y sin duplicarlo. Desde ahí se crean sus guiones, guion de en vivo y respuestas como en la Parte 2.
- **Tendencias:** solo planes de pago. En Gratis no se piden ni se muestran: solo el aviso con «Subir de plan».
- **No hay publicación automática en TikTok.**

## Parte 4: videos con IA (Runway)

Los videos los hace la API de Runway (`server/fuentes/runway.js`), verificada en el SDK oficial de Runway (github.com/runwayml/sdk-node) el 25 de noviembre de 2026, porque docs.dev.runwayml.com no se pudo abrir desde el entorno de desarrollo:

- **Dirección:** `https://api.dev.runwayml.com`. **Cabeceras:** `Authorization: Bearer <llave>` y `X-Runway-Version: 2024-11-06`.
- **Crear:** `POST /v1/image_to_video` con `model: gen4_turbo`, `promptImage` (la foto del producto que trae FastMoss/TikTok Shop), `promptText` (lo escribe Claude, en inglés), `ratio: 720:1280` (vertical) y `duration: 10`. **Una llamada por video; nunca se reintenta sola.**
- **Esperar:** `GET /v1/tasks/{id}`. Un revisor en el servidor consulta cada 10 segundos los videos en curso (tardan de 1 a 5 minutos). Ella puede salir de la app y lo encuentra listo.
- **Precio de Runway:** 5 créditos de Runway por segundo a 0,01 USD = **0,05 USD por segundo; un video de 10 s cuesta 0,50 USD**.
- **El video sale sin sonido.** Con cada video viene un guion en los dos modos (con cámara / sin cámara) para que ella ponga su voz. Sin avatar ni caras.
- **Solo se guarda el enlace**, no el archivo. Los enlaces de Runway vencen en 24 a 48 horas, así que se guarda también el id de la tarea y `GET /api/videos/:id/ver` pide un enlace nuevo cuando el guardado tiene más de 20 horas. Si Runway ya borró la tarea, se le dice que puede crearlo de nuevo.

Reglas:

- **Por producto:** 3 videos cortos (20 créditos cada uno), 3 videos desde la foto (20 cada uno) y 3 GIFs (9 créditos por los 3).
- **Dos bolsas de créditos.** Texto: guion de en vivo, respuestas, GIFs y guiones extra. Video: solo videos. Gratis: 30 de texto y 1 video corto gratis de 10 segundos al mes (solo en Gratis). Esencial 100 + 100, Crecimiento 300 + 300, Pro 1.000 + 1.000. Los paquetes son créditos de video y no vencen (decisiones de la dueña, 25 nov 2026).
- **Aviso antes de crear** siempre, con el costo en créditos de video; nada se pide a Runway hasta «Sí, crear». El servidor exige el costo aceptado (`costoAceptado`).
- **Los videos frenan en cero en todos los planes** (cada uno cuesta dinero real en Runway).
- **Si algo falla** (Claude, Runway al pedir, Runway al procesar o más de 30 minutos), se devuelve todo una sola vez y el video gratis vuelve a quedar disponible.
- **Producto sin foto:** se explica y se ofrece el buscador.
- **Advertencia de descarga:** mientras ella no descargue un video, al abrirlo sale «Descarga tu video ahora» (el enlace de Runway vence en 24 a 48 horas; si Runway borra el video se pierde y habría que crearlo de nuevo gastando créditos) con el botón grande «Descargar video». Sale cada vez que abre un video sin descargar. `GET /api/videos/:id/descargar` pasa el archivo de Runway directo al teléfono (no se guarda en el servidor) y, cuando llegó completo, marca el video como descargado (`videos.descargado_en`).
- **No hay publicación automática en TikTok.**

### Voz de los videos

Los videos de Runway salen sin sonido. Cada video listo tiene «Voz del video»:

- **Voz real (la principal):** ella graba su voz en la app leyendo el guion (hasta 10 segundos, lo que dura el video). Gratis, sin créditos y sin límite. Se escucha junto al video en la app.
- **Voz de IA (ElevenLabs):** narra lo que «se escucha» del guion sin cámara con una voz femenina en español. **2 créditos de texto**, siempre con el aviso antes (costo, saldo y lo que queda); nada se genera hasta «Sí, crear». Si ElevenLabs falla, se devuelve todo y el uso no cuenta.
  - **Plan Gratis:** 3 voces de IA al mes con sus créditos de texto. Desde la 4.ª, solo con créditos de paquete; si no tiene, frena con «compra créditos o sube de plan». Vuelven a 3 el día 1.
  - **Planes de pago:** sin límite; los créditos de texto siguen su regla de siempre (no frenan).
- **ElevenLabs** (`server/fuentes/elevenlabs.js`), verificado en su SDK oficial (github.com/elevenlabs/elevenlabs-js) el 25 nov 2026: `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, cabecera `xi-api-key`, modelo `eleven_multilingual_v2`. Precio de lista cerca de 0,10 USD por 1.000 caracteres: unos 2 centavos por narración. Nunca se reintenta solo.
- **Cada video tiene una sola voz;** la nueva reemplaza a la anterior. El audio (unos 10 segundos) se guarda en la base (`voces`) para unirlo al video.
- **Al descargar**, ffmpeg une la voz con el video en una carpeta temporal que se borra al terminar; el archivo sale con `-con-voz.mp4`. El video sigue sin guardarse en el servidor. Si la voz cambia, el video vuelve a «sin descargar» para que baje el nuevo. El `Dockerfile` instala ffmpeg.

## Parte 5: Programar

Su propio calendario de publicaciones (decisiones de la dueña, 27 nov 2026):

- **Qué hace:** en cada guion y en cada video listo hay un botón **Programar**. Ella elige día y hora; el formulario empieza con la hora sugerida por la IA (hoy si todavía no pasó, si no mañana). Si ya estaba programado, el botón dice cuándo y deja cambiar la hora o quitarlo.
- **Vendiva no publica en TikTok.** A la hora elegida, en **Hoy** sale «Te toca publicar» con el texto y los hashtags del guion para copiar, y los botones «Ya lo publiqué» y «Cambiar la hora». Ella sube el video a mano.
- **Avisos:** solo dentro de la app. Las notificaciones del teléfono llegan con la Parte 8 (Apple y Google).
- **Costo:** gratis e ilimitado en todos los planes. No toca créditos.
- **En Hoy, «Tu calendario»:** lo que le toca, lo que viene agrupado por día, y lo publicado en los últimos 7 días (con «Deshacer»).
- **Reglas del servidor** (`shared/programar.js`): la hora viaja con su zona horaria (la del teléfono); no se acepta una hora pasada (con 5 minutos de tolerancia) ni a más de 90 días. Cada guion o video tiene a lo más una publicación pendiente: programarlo otra vez cambia la hora. Tope de seguridad de 60 pendientes a la vez (no es un límite de plan). Si borra el producto, lo suyo sale del calendario.
- **Rutas:** `POST /api/publicaciones`, `PATCH /api/publicaciones/:id` (`programadaPara` y/o `publicada`), `DELETE /api/publicaciones/:id`. Tabla `publicaciones` (migración `010_programar.sql`).

## Parte 6: textos para 4 redes y Vitrina

Decisiones de la dueña (27 nov 2026):

**Textos para sus redes**
- En cada guion, el botón **«Textos para mis redes»** escribe, a pedido, un texto adaptado a cada red: Instagram y Facebook con texto y hashtags a su estilo; Pinterest con título y descripción. TikTok no: el guion ya trae su texto.
- **Solo para las redes que ella marcó.** Si solo marcó TikTok, se le invita a marcar las otras en Mi cuenta.
- **1 crédito de texto por cada red** (`COSTOS_CREDITOS.textoRed`), con el aviso de costo antes. El servidor exige el costo aceptado, que depende de cuántas redes marcó. Gratis frena si no alcanza (sigue con sus 30 créditos al mes); los planes de pago no frenan. Si la IA falla, se devuelve todo. Volver a crearlos cobra otra vez y reemplaza a los anteriores.
- **Sus usuarios:** en Mi cuenta, campos opcionales para su usuario de Instagram, Facebook y Pinterest, solo para las redes marcadas. Claude puede usarlos para invitar a seguirla. Nunca contraseñas.
- Ruta: `POST /api/creaciones/:id/guiones/:numero/textos-redes` `{ costoAceptado }`. Tabla `textos_redes`.

**Vitrina (solo plan Pro, sin créditos extra)**
- Ella escribe sus **estrellas** (1 a 5, con un decimal), el **número de reseñas** y **de qué se quejan** (lista fija en `QUEJAS_VITRINA` más una queja libre). Vendiva no entra a su TikTok.
- Claude escribe un **plan** cada vez que actualiza la calificación: prioridades con pasos, una respuesta para reseñas negativas, qué evitar y cuándo revisar. Las instrucciones prohíben reseñas falsas, pedir reseñas a cambio de algo y prometer que la calificación va a subir.
- **Historial:** cada calificación queda guardada (`vitrina_calificaciones`); se muestran las últimas 12 y cuánto subió o bajó.
- **Aviso si baja de 4**, en la Vitrina y arriba en Hoy.
- Si la IA falla, la calificación igual queda guardada y el plan se pide otra vez con «Crear mi plan» (`POST /api/vitrina/:id/plan`).
- **Gratis, Esencial y Crecimiento** ven el aviso «Subir de plan», igual que en Tendencias; el servidor no deja guardar (`SOLO_PRO`) ni manda su historial. Quien eligió el objetivo «Subir la calificación de mi vitrina» sin ser Pro también ve el aviso en Hoy. La tarjeta de cada plan en Planes dice si incluye la Vitrina.

## Decisiones de la dueña sobre la Parte 1

- La pestaña Planes se queda como está: su plan, su saldo de créditos y la tabla de los 4 planes.
- Los créditos del plan se reponen solos el día 1.
- El modelo de Claude fue `claude-opus-5-5` hasta el 11 de noviembre de 2026; desde entonces es `claude-haiku-5-5`.
- Al registrarse hay una casilla obligatoria, «Confirmo que tengo 18 años o más». Sin marcarla el servidor no crea la cuenta, y queda guardado cuándo la marcó.
- **Queda para después, por decisión suya (no construir todavía):** recuperar la contraseña olvidada y aceptar las políticas al registrarse.
- El hosting todavía no se elige: por ahora se prueba en local.

## Datos del negocio

Vendiva · 420 Opa Locka Blvd, North Miami, FL 33168 · machadodelosangele@gmail.com · Ley de Florida.

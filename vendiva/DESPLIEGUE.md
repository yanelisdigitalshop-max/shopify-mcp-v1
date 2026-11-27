# Vendiva en Railway: guía de despliegue y copias de seguridad

Preparado el 27 de noviembre de 2026. **Nada de esta guía se ha hecho todavía.** No se ha contratado ni conectado nada. Cada paso se hace solo con la aprobación escrita de la dueña.

## Qué se va a crear

Todo está descrito en `.railway/railway.ts` (la forma actual de Railway: «Infraestructura como código»; el viejo `railway.json` quedó retirado):

| Recurso | Qué es | Costo (precios oficiales, 27 nov 2026) |
|---|---|---|
| `vendiva` | La app (servidor + interfaz), con el `Dockerfile`. Revisa su salud en `/api/salud` | Por uso: ~$10 por GB de memoria al mes, ~$20 por vCPU al mes |
| `base-de-datos` | PostgreSQL de Railway | Por uso (memoria, CPU y su volumen a ~$0.15 por GB al mes) |
| `copias-de-seguridad` | Bucket (almacenamiento tipo S3) en el este de EE. UU. | $0.015 por GB al mes; subir y bajar no cuesta |
| `copia-nocturna` | Tarea que corre cada noche a las 08:00 UTC (3 a. m. en Florida) y termina | Solo los minutos que corre |

Plan Hobby: **$5 al mes, que incluye $5 de uso**. Estimado para empezar: **~$7–12 al mes**.

## Copias de seguridad: dos capas

1. **Copias de Railway** (del volumen de la base): diarias (se guardan 6 días), semanales y mensuales. Se encienden en el panel: servicio `base-de-datos` → pestaña **Backups** → elegir **Daily**, **Weekly** y **Monthly**. Railway no deja claro si en el plan Hobby están disponibles o si piden el plan Pro: **revisarlo en la pestaña Backups**. Ojo: si se borra el volumen, se borran también estas copias.
2. **Copias propias** (las que no dependen del volumen): cada noche, `copia-nocturna` hace un `pg_dump` de toda la base, lo **cifra** con la llave `VENDIVA_RESPALDO_CLAVE` y lo guarda en el bucket. Se quedan:
   - todas las de los últimos 14 días,
   - una por semana de las últimas 8 semanas,
   - una por mes de los últimos 12 meses.

   Se probó de verdad con PostgreSQL 16: copia, cifrado, limpieza y restauración en otra base (`tests/respaldo.test.js`).

> **La llave de las copias es la parte más importante.** Si se pierde, las copias propias no se pueden abrir. Si alguien la obtiene junto con el bucket, puede leerlas. Se guarda en el panel de Railway **y** en un lugar seguro fuera de Railway (por ejemplo, el gestor de contraseñas de la dueña). Nunca en el chat ni en el repositorio.

## Antes de empezar (decisiones y cuentas de la dueña)

- [ ] Aprobación escrita para crear la cuenta de Railway (plan Hobby, $5 al mes).
- [ ] Pasar el trabajo de la rama `claude/loving-davinci-r18ppl` a `main` (Railway despliega desde `main`). Se hace con un pull request que la dueña aprueba.
- [ ] El dominio (se compra aparte) para `APP_ORIGIN`, la app del teléfono y el webhook de Stripe.

## Pasos (cuando la dueña lo apruebe)

1. **Cuenta y CLI.** Crear la cuenta en railway.com (plan Hobby) y conectar GitHub con acceso solo a este repositorio. Instalar la CLI de Railway (versión 5.42.1 o más nueva) en la computadora y entrar con `railway login`.
2. **Proyecto.** En la carpeta `vendiva/`: `railway init` (crea el proyecto vacío y lo enlaza) y `npm install`.
3. **Ver el plan, sin cambiar nada:**

   ```bash
   railway config plan
   ```

   Muestra los 4 recursos de arriba. Revisarlo antes de seguir.
4. **Aplicar** (crea los recursos; empieza a cobrar por uso):

   ```bash
   railway config apply
   ```

5. **Llaves**, en el panel de Railway → servicio `vendiva` → Variables (nunca en el chat):
   - `VENDIVA_ANTHROPIC_API_KEY`, `VENDIVA_FASTMOSS_CLIENT_SECRET`, `VENDIVA_RUNWAY_API_KEY`, `VENDIVA_ELEVENLABS_API_KEY` (y `VENDIVA_ELEVENLABS_VOICE_ID` si hay voz elegida).
   - `VENDIVA_STRIPE_SECRET_KEY`: **solo la de prueba** (`sk_test_...`). Con otra, el servidor no arranca.
   - `VENDIVA_FIREBASE_CUENTA_SERVICIO` (avisos del teléfono), cuando exista el proyecto de Firebase.
   - `APP_ORIGIN`: la dirección pública, por ejemplo `https://app.<dominio>`.
6. **Llave de las copias**, en el servicio `copia-nocturna` → Variables → `VENDIVA_RESPALDO_CLAVE`. Se crea así, en una terminal, y se guarda también fuera de Railway:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   ```

7. **Copias de Railway:** `base-de-datos` → Backups → Daily, Weekly y Monthly (ver arriba).
8. **Dominio:** servicio `vendiva` → Settings → Networking → dominio propio (`app.<dominio>`) y los registros DNS que indique Railway.
9. **Stripe (modo de prueba):** crear el webhook a `https://app.<dominio>/api/pagos/webhook` con los 6 eventos del README y poner su secreto en `VENDIVA_STRIPE_WEBHOOK_SECRET`.
10. **Comprobar:** abrir `https://app.<dominio>/api/salud`. Debe decir `"baseDeDatos": "lista"` y `"stripe": "llave puesta (modo prueba)"`. Las tablas se crean solas al arrancar.
11. **Probar la copia nocturna una vez a mano:** en el panel, `copia-nocturna` → ejecutar ahora. Su registro debe decir «Copia guardada: respaldos/…». Ver las copias:

    ```bash
    railway run --service copia-nocturna npm run respaldo -- --lista
    ```

## Restaurar una copia (simulacro recomendado una vez al mes)

Primero **siempre en una base nueva**, para revisarla; nunca directo sobre la base de producción.

1. Crear una base PostgreSQL de prueba (por ejemplo, otra base temporal en Railway) y copiar su dirección.
2. Restaurar (borra lo que haya en esa base de prueba):

   ```bash
   VENDIVA_RESTAURAR_EN='<dirección de la base de prueba>' railway run --service copia-nocturna npm run respaldo -- --restaurar respaldos/<fecha>.dump.enc --confirmo-borrar-y-restaurar
   ```

3. Revisar que estén las cuentas y los datos. Si hay que volver de verdad a esa copia, se decide con la dueña: o se apunta la app a la base restaurada, o se restaura sobre la de producción (con la app detenida).

## Lo que no se pudo probar desde el entorno de desarrollo

- **La imagen de Docker no se construyó aquí:** el repositorio oficial de PostgreSQL (de donde sale `pg_dump` 17) está bloqueado en este entorno. Railway sí tiene internet. Si el primer despliegue falla en ese paso, se ve en el registro de construcción de Railway.
- **`pg_dump` 17 sirve para PostgreSQL 17 o anterior.** Si Railway crea la base con una versión más nueva, hay que subir `postgresql-client-17` en el `Dockerfile` al número de esa versión. La versión se ve en el registro de la base.
- **`railway config plan` y `apply` no se corrieron:** necesitan la cuenta y la CLI de la dueña. El archivo se evaluó con el paquete oficial `railway@3.19.1` y produce los 4 recursos con su configuración.

# Vendiva: textos para las tiendas (BORRADOR para revisar)

Preparado el 27 de noviembre de 2026 para que la dueña lo revise. **Nada de esto se envía a ninguna tienda sin su aprobación por escrito.**

- Vendedor: **Machado Luxury Estates Corp.** (cuentas de empresa de Apple y Google).
- Identificador: `com.vendiva.app`. Solo Estados Unidos. Idioma: español (Estados Unidos).
- Edad: **18+**.
- Las imágenes están en `tienda/imagenes/` (ícono de 1024 px) y `tienda/capturas/` (iPhone 6,9": 1320×2868; Android: 1080×1920). Las capturas son de la app real con datos de prueba.

> **Ojo con las marcas:** Apple y Google pueden rechazar una app que use marcas de otros (TikTok) en el nombre, el subtítulo o las palabras clave. Por eso «TikTok» solo aparece en la descripción, para explicar para quién es, y con la aclaración de que Vendiva no es de TikTok.

---

## App Store (Apple)

**Nombre** (máx. 30): `Vendiva`

**Subtítulo** (máx. 30): `Guiones y videos para vender`

**Texto promocional** (máx. 170, se puede cambiar sin nueva revisión):
`Tus 3 guiones del día, listos para grabar con cámara o sin mostrar la cara. Y tu calendario para no olvidar cuándo publicar.`

**Descripción** (máx. 4.000):

```
Vendiva es la ayuda diaria para afiliadas que reciben productos de muestra y los muestran en video para ganar comisión en TikTok Shop.

Cada día, para tu producto:
• 3 guiones listos para grabar, cada uno en dos modos: con cámara, o sin mostrar la cara (solo tus manos, el producto y tu voz).
• El gancho de los primeros 3 segundos, qué decir, qué hacer y el texto para poner en pantalla.
• El texto para publicar y los hashtags, con una hora sugerida.

Y además:
• Tu calendario: programa cada guion o video y te avisamos cuando te toca publicar. Tú lo subes; Vendiva no publica por ti.
• Busca productos para mostrar, con sus ventas estimadas y su comisión.
• Videos cortos creados con IA a partir de la foto del producto, para ponerles tu voz.
• Guion para un en vivo, respuestas para comentarios y textos para Instagram, Facebook y Pinterest.
• Tu nivel según tus seguidores y qué te falta para el siguiente.
• Vitrina (plan Pro): escribe tu calificación y recibe un plan para mantenerla arriba de 4 estrellas.

Pensada para empezar desde cero: letras grandes, pasos claros y sin avatar. La protagonista eres tú.

Planes: Gratis, Esencial, Crecimiento y Pro. Los planes de pago se renuevan cada mes; puedes cancelar cuando quieras.

Vendiva es solo para mayores de 18 años. Vendiva no es de TikTok ni está afiliada a TikTok: tú escribes tus datos, y Vendiva nunca entra a tus cuentas ni te pide sus contraseñas.
```

> PENDIENTE: la línea de «Planes» depende de la decisión de pagos dentro de la app (ver el README). Si la app no vende dentro, hay que cambiarla.

**Palabras clave** (máx. 100, separadas por coma, sin espacios de más):
`afiliada,guiones,videos,vender,comisión,creadora,ventas,contenido,hashtags,calendario,en vivo`

**Categoría principal:** Negocios. **Secundaria:** Productividad.

**URL de soporte:** `https://<dominio>/ayuda` (página pública con el correo de soporte; el dominio está PENDIENTE).
**URL de la política de privacidad:** `https://<dominio>/privacidad`

**Clasificación por edad:** 18+ (la app exige confirmar 18 años al registrarse).

**Información para la revisión (App Review):**
- Cuenta de prueba: `revision@vendiva.app` (se crea con `npm run cuenta:revisores`; la contraseña la escribe la dueña en el formulario, no va en este archivo).
- Notas:
```
Vendiva ayuda a afiliadas de comercio en redes sociales a crear guiones y videos de sus productos. La cuenta de prueba tiene el plan Pro activado sin cobro, para que puedan ver todas las funciones. Las notificaciones avisan a la hora que la persona programó para publicar. El micrófono solo se usa cuando la persona toca «Grabar mi voz». Los videos se guardan en la galería cuando la persona toca «Descargar video». La cuenta se puede borrar en Mi cuenta → Borrar mi cuenta.
```

---

## Google Play

**Nombre** (máx. 30): `Vendiva`

**Descripción breve** (máx. 80): `Guiones y videos diarios para mostrar tus productos y ganar comisión.`

**Descripción completa** (máx. 4.000): la misma de Apple.

**Categoría:** Empresa (Business). **Etiquetas:** productividad, creación de contenido.

**Público objetivo:** solo mayores de 18 años. **Clasificación de contenido:** se responde el cuestionario IARC en Play Console (sin violencia, sin apuestas, con compras dentro / o sin, según la decisión de pagos).

**Borrar la cuenta (Google lo pide):** `https://<dominio>/borrar-cuenta`

---

## Privacidad en las tiendas (borrador de respuestas)

Debe coincidir con la política de privacidad (`/privacidad`). Lo revisa la dueña o un abogado.

| Dato | Se recoge | Para qué | Ligado a la persona | Rastreo / anuncios |
|---|---|---|---|---|
| Nombre, correo, teléfono | Sí | Cuenta y soporte | Sí | No |
| Grabaciones de voz | Sí (solo si graba) | Poner su voz en sus videos | Sí | No |
| Contenido que crea (productos, guiones, calendario, vitrina) | Sí | Dar el servicio | Sí | No |
| Historial de compras (plan, paquetes) | Sí | Cobrar y llevar los créditos | Sí | No |
| Datos de pago (tarjeta) | No los recoge Vendiva (los maneja Stripe) | — | — | — |
| Identificador del dispositivo para avisos (token de Firebase) | Sí (si acepta avisos) | Enviar «Te toca publicar» | Sí | No |
| Ubicación, contactos, fotos de la galería | No | — | — | — |

- **Apple (Privacidad de la app):** «Datos vinculados a ti»: información de contacto, contenido del usuario (audio y otro contenido), compras, identificadores. «Rastreo»: no.
- **Google (Seguridad de los datos):** los mismos datos; cifrados en tránsito: sí; se pueden borrar: sí (desde la app y en `/borrar-cuenta`); no se comparten para publicidad.

> Los servicios que procesan datos (Anthropic, FastMoss, Runway, ElevenLabs, Stripe, Firebase, hosting) están en la política de privacidad. Si en las tiendas se responde que se «comparten», hay que revisar con un abogado cómo encaja cada uno (en general, los proveedores que procesan datos por encargo no cuentan como «compartir»).

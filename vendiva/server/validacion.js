// Validación de todo lo que llega del cliente. Los mensajes son para la usuaria.

import { z } from 'zod';
import { ErrorApp } from './errores.js';
import { MODOS_GRABACION, OBJETIVOS, REDES, SEGUIDORES_MAXIMO, PASOS_REGISTRO } from '../shared/datos.js';

const ids = (lista) => lista.map((x) => x.id);

const nombre = z
  .string({ error: 'Escribe tu nombre completo.' })
  .trim()
  .min(2, 'Escribe tu nombre completo.')
  .max(80, 'El nombre es muy largo.');

const correo = z
  .string({ error: 'Escribe tu correo.' })
  .trim()
  .toLowerCase()
  .max(254, 'El correo es muy largo.')
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Revisa tu correo: parece que le falta algo.');

const telefono = z
  .string({ error: 'Escribe tu teléfono.' })
  .trim()
  .max(30, 'El teléfono es muy largo.')
  .regex(/^[+(\d][\d\s().-]*$/, 'Escribe solo los números de tu teléfono.')
  .refine((v) => {
    const digitos = v.replace(/\D/g, '').length;
    return digitos >= 7 && digitos <= 15;
  }, 'Revisa tu teléfono: debe tener entre 7 y 15 números.');

const contrasena = z
  .string({ error: 'Escribe una contraseña.' })
  .min(8, 'Tu contraseña debe tener al menos 8 letras o números.')
  .max(200, 'La contraseña es muy larga.');

// Vendiva es para mayores de 18. Solo vale un `true` de verdad: sin la casilla no hay cuenta.
const mayorDeEdad = z.literal(true, { error: 'Marca la casilla para confirmar que tienes 18 años o más.' });

export const esquemaRegistro = z.object({ nombre, correo, telefono, contrasena, mayorDeEdad });

export const esquemaEntrar = z.object({
  correo,
  contrasena: z.string({ error: 'Escribe tu contraseña.' }).min(1, 'Escribe tu contraseña.').max(200),
});

const usuarioTiktok = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@+/, ''))
  .pipe(
    z.union([
      z.literal(''),
      z
        .string()
        .min(2, 'Tu usuario de TikTok es muy corto.')
        .max(24, 'Tu usuario de TikTok es muy largo.')
        .regex(/^[a-zA-Z0-9._]+$/, 'Escribe tu usuario tal como sale en TikTok, sin @ y sin espacios.'),
    ]),
  )
  .transform((v) => v || null);

// Todos los campos son opcionales: el registro guarda paso a paso.
export const esquemaPerfil = z
  .object({
    nombre,
    telefono,
    nicho: z.string().trim().min(2, 'Cuéntanos qué vendes.').max(60, 'Escríbelo más corto.'),
    seguidores: z
      .number({ error: 'Escribe cuántos seguidores tienes. Si empiezas hoy, pon 0.' })
      .int('Escribe un número entero.')
      .min(0, 'No puede ser menos de 0.')
      .max(SEGUIDORES_MAXIMO, 'Ese número es demasiado grande.'),
    modoGrabacion: z.enum(ids(MODOS_GRABACION), { error: 'Elige cómo prefieres grabar.' }),
    objetivo: z.enum(ids(OBJETIVOS), { error: 'Elige tu objetivo.' }),
    usuarioTiktok,
    redes: z
      .array(z.enum(ids(REDES)))
      .max(REDES.length)
      .transform((v) => ids(REDES).filter((id) => v.includes(id))), // sin repetidos y en orden fijo
    onboardingPaso: z.number().int().min(2).max(PASOS_REGISTRO),
    onboardingCompleto: z.literal(true),
  })
  .partial()
  .strict();

const textoOpcional = (max, mensaje) =>
  z
    .string()
    .trim()
    .max(max, mensaje)
    .transform((v) => v || null)
    .nullable()
    .optional();

const baseProducto = {
  nombre: z
    .string({ error: 'Escribe el nombre del producto.' })
    .trim()
    .min(2, 'Escribe el nombre del producto.')
    .max(80, 'El nombre es muy largo.'),
  descripcion: textoOpcional(500, 'Escríbelo más corto (hasta 500 letras).'),
  precio: z
    .number({ error: 'Escribe el precio con números.' })
    .min(0, 'El precio no puede ser negativo.')
    .max(100000, 'Ese precio es demasiado alto.')
    .nullable()
    .optional(),
  comisionPct: z
    .number({ error: 'Escribe la comisión con números.' })
    .min(0, 'La comisión no puede ser negativa.')
    .max(100, 'La comisión no puede pasar de 100%.')
    .nullable()
    .optional(),
  enlace: z
    .string()
    .trim()
    .max(500, 'El enlace es muy largo.')
    .refine((v) => v === '' || /^https?:\/\/\S+\.\S+/i.test(v), 'Pega el enlace completo, empezando por https://')
    .transform((v) => v || null)
    .nullable()
    .optional(),
};

export const esquemaProductoNuevo = z.object(baseProducto).strict();
export const esquemaProductoEditado = z.object(baseProducto).partial().strict();

export const esquemaUuid = z.uuid();

/** Valida y devuelve los datos limpios, o lanza un ErrorApp 400 con un mensaje por campo. */
export function validar(esquema, datos) {
  const r = esquema.safeParse(datos ?? {});
  if (r.success) return r.data;

  const campos = {};
  for (const problema of r.error.issues) {
    const campo = problema.path[0] ?? '_';
    if (!(campo in campos)) {
      campos[campo] = problema.code === 'unrecognized_keys' ? 'Hay un dato que no reconocemos.' : problema.message;
    }
  }
  const primero = Object.values(campos)[0] ?? 'Revisa los datos.';
  throw new ErrorApp(400, 'DATOS_INVALIDOS', primero, { campos });
}

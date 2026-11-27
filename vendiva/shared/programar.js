// Parte 5: Programar. Lo usan el servidor y el cliente.
// Programar es gratis e ilimitado en todos los planes (decisión de la dueña, 27 nov 2026).
// Los topes de aquí no son límites de plan: solo evitan errores y abusos.

export const PROGRAMAR = {
  maxPendientes: 60, // publicaciones pendientes a la vez (dos meses de un video diario)
  diasMaximo: 90, // hasta cuántos días adelante se puede programar
  toleranciaPasadoMin: 5, // una hora "de hace un momento" se acepta (el reloj del teléfono puede ir atrasado)
  diasPublicadasVisibles: 7, // las publicadas de los últimos días que se siguen mostrando
};

/**
 * Lee la hora que sugiere la IA ("7:00 p. m.", "8 pm", "a las 12 del mediodía",
 * "entre 7 y 8 de la noche") y devuelve { hora, minuto } en 24 horas, o null.
 * Es solo un punto de partida para el formulario: ella elige la hora final.
 */
export function horaDeTexto(texto) {
  if (typeof texto !== 'string') return null;
  const t = texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const m = /(\d{1,2})(?:\s*[:.h]\s*(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?/.exec(t);
  if (!m) return null;
  let hora = Number(m[1]);
  const minuto = m[2] ? Number(m[2]) : 0;
  if (hora > 23 || minuto > 59) return null;
  const sufijo = m[3]?.replace(/[\s.]/g, '');
  const tarde = sufijo === 'pm' || (!sufijo && /(tarde|noche)/.test(t));
  const manana = sufijo === 'am' || (!sufijo && /(manana|madrugada)/.test(t));
  if (hora <= 12) {
    if (tarde && hora < 12) hora += 12;
    else if (manana && hora === 12) hora = 0;
    else if (!tarde && !manana && !/mediodia/.test(t) && hora >= 1 && hora <= 6) hora += 12; // "a las 4" para publicar = de la tarde
  }
  return { hora, minuto };
}

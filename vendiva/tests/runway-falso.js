// Un Runway de mentira para las pruebas: no llama a nadie y anota cada llamada.
import { ErrorRunway } from '../server/fuentes/runway.js';

export function crearRunwayFalso() {
  const llamadas = [];
  const tareas = new Map(); // id -> { estado, url, consultas }
  const control = { lista: true, fallarCrear: null, resultado: 'listo', demoraMs: 0, siguienteUrl: 1 };
  let siguienteTarea = 1; // nunca se reinicia: cada tarea tiene su propio número
  const vigentes = new Set(); // enlaces que todavía sirven (los de Runway vencen)
  const enlace = () => {
    const url = `https://dnznrvs05pmza.cloudfront.net/video-${control.siguienteUrl++}.mp4?firma=x`;
    vigentes.add(url);
    return url;
  };
  return {
    llamadas,
    tareas,
    control,
    lista: () => control.lista,
    async crearVideo(p) {
      llamadas.push({ tipo: 'crear', ...p });
      if (control.demoraMs) await new Promise((ok) => setTimeout(ok, control.demoraMs));
      if (control.fallarCrear) throw control.fallarCrear;
      const id = `tarea-${siguienteTarea++}`;
      tareas.set(id, { estado: 'procesando', url: null });
      return { tareaId: id };
    },
    /** Hace que una tarea termine (como si Runway acabara de procesarla). */
    terminar(id, resultado = control.resultado) {
      const t = tareas.get(id);
      t.estado = resultado;
      t.url = resultado === 'listo' ? enlace() : null;
    },
    /** Todos los enlaces dados hasta ahora dejan de servir (pasaron las 24 a 48 horas). */
    vencerEnlaces() {
      vigentes.clear();
    },
    /** Runway borró la tarea: ya no se puede pedir otro enlace. */
    borrarTarea(id) {
      tareas.delete(id);
      vigentes.clear();
    },
    /** El archivo del video (10 KB de mentira). Un enlace vencido da 403, como el de Runway. */
    async bajarArchivo(url) {
      llamadas.push({ tipo: 'bajar', url });
      if (!vigentes.has(url)) return new Response('AccessDenied', { status: 403 });
      const bytes = control.archivo ?? new Uint8Array(10 * 1024).fill(7);
      return new Response(bytes, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(bytes.length) } });
    },
    async consultarVideo(id) {
      llamadas.push({ tipo: 'consultar', id });
      const t = tareas.get(id);
      if (!t) throw new ErrorRunway('RUNWAY_PETICION', 'no existe');
      if (t.estado === 'listo') {
        // Runway da un enlace nuevo en cada consulta.
        t.url = enlace();
        return { estado: 'listo', url: t.url };
      }
      if (t.estado === 'fallido') return { estado: 'fallido', falla: 'moderación', codigo: 'SAFETY.INPUT.IMAGE' };
      return { estado: 'procesando', progreso: 0.5 };
    },
    async cancelarVideo(id) {
      llamadas.push({ tipo: 'cancelar', id });
    },
  };
}

export const errorRunwayOcupado = () => new ErrorRunway('RUNWAY_OCUPADO', 'El servicio de video está muy ocupado. Intenta de nuevo en unos minutos.', { reintentable: true });

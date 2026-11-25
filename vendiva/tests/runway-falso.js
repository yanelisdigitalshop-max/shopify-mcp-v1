// Un Runway de mentira para las pruebas: no llama a nadie y anota cada llamada.
import { ErrorRunway } from '../server/fuentes/runway.js';

export function crearRunwayFalso() {
  const llamadas = [];
  const tareas = new Map(); // id -> { estado, url, consultas }
  const control = { lista: true, fallarCrear: null, resultado: 'listo', demoraMs: 0, siguienteUrl: 1 };
  let siguienteTarea = 1; // nunca se reinicia: cada tarea tiene su propio número
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
      t.url = resultado === 'listo' ? `https://dnznrvs05pmza.cloudfront.net/video-${control.siguienteUrl++}.mp4?firma=x` : null;
    },
    async consultarVideo(id) {
      llamadas.push({ tipo: 'consultar', id });
      const t = tareas.get(id);
      if (!t) throw new ErrorRunway('RUNWAY_PETICION', 'no existe');
      if (t.estado === 'listo') {
        // Runway da un enlace nuevo en cada consulta.
        t.url = `https://dnznrvs05pmza.cloudfront.net/video-${control.siguienteUrl++}.mp4?firma=x`;
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

// Un ElevenLabs de mentira para las pruebas: no llama a nadie y anota cada llamada.
import { ErrorVoz } from '../server/fuentes/elevenlabs.js';
import { audio } from './medios.js';

export function crearVozFalsa() {
  const llamadas = [];
  const control = { lista: true, fallar: null };
  return {
    llamadas,
    control,
    lista: () => control.lista,
    async generar({ texto }) {
      llamadas.push({ texto });
      if (control.fallar) throw control.fallar;
      return { audio: audio(2, 'mp3'), mime: 'audio/mpeg', modelo: 'eleven_multilingual_v2', vozId: 'voz-de-prueba' };
    },
  };
}

export const errorVozOcupada = () => new ErrorVoz('VOZ_OCUPADA', 'El servicio de voz está muy ocupado. Intenta de nuevo en un minuto.', { reintentable: true });

// Une la voz (de ella o de IA) con el video de Runway, que llega sin sonido.
//
// Se hace al momento de descargar, con ffmpeg, en una carpeta temporal que se borra
// en cuanto termina: el video NO se guarda en el servidor.
// - La imagen no se vuelve a procesar (-c:v copy): es rápido y no pierde calidad.
// - La voz se pasa a AAC. Si dura menos que el video, el final queda en silencio;
//   si dura más, se corta donde termina el video.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ErrorApp } from '../errores.js';

const BINARIO = process.env.VENDIVA_FFMPEG || 'ffmpeg';
const ESPERA_MS = 60000;

const EXTENSIONES = {
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/x-m4a': 'm4a',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
};
export const TIPOS_AUDIO = Object.keys(EXTENSIONES);

function correr(args) {
  return new Promise((ok, mal) => {
    let errores = '';
    let hijo;
    try {
      hijo = spawn(BINARIO, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    } catch (err) {
      mal(err);
      return;
    }
    const reloj = setTimeout(() => hijo.kill('SIGKILL'), ESPERA_MS);
    hijo.stderr.on('data', (d) => {
      errores = (errores + d).slice(-600);
    });
    hijo.on('error', (err) => {
      clearTimeout(reloj);
      mal(err);
    });
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      if (codigo === 0) ok();
      else mal(new Error(`ffmpeg salió con ${codigo}: ${errores.trim()}`));
    });
  });
}

const noSePudo = () =>
  new ErrorApp(503, 'MEZCLA_FALLO', 'No pudimos poner la voz en el video. Intenta de nuevo en un momento; tu video y tu voz siguen guardados.', {
    datos: { reintentable: true },
  });

/**
 * Mezcla el video (un stream web de Runway) con el audio.
 * Devuelve { ruta, tamano, limpiar } del MP4 listo; hay que llamar a limpiar() al terminar de mandarlo.
 */
export async function mezclarVozConVideo({ video, audio, mime }) {
  const carpeta = await fs.mkdtemp(path.join(os.tmpdir(), 'vendiva-voz-'));
  const limpiar = () => fs.rm(carpeta, { recursive: true, force: true }).catch(() => {});
  try {
    const entradaVideo = path.join(carpeta, 'video.mp4');
    const entradaVoz = path.join(carpeta, `voz.${EXTENSIONES[mime] ?? 'bin'}`);
    const salida = path.join(carpeta, 'final.mp4');
    await pipeline(Readable.fromWeb(video), createWriteStream(entradaVideo));
    await fs.writeFile(entradaVoz, audio);
    await correr([
      '-v', 'error', '-y',
      '-i', entradaVideo,
      '-i', entradaVoz,
      '-map', '0:v:0', '-map', '1:a:0',
      '-c:v', 'copy',
      '-af', 'apad',
      '-c:a', 'aac', '-b:a', '128k',
      '-shortest',
      '-movflags', '+faststart',
      salida,
    ]);
    const { size } = await fs.stat(salida);
    return { ruta: salida, tamano: size, limpiar };
  } catch (err) {
    console.error(`[voz] mezcla falló: ${err.code === 'ENOENT' ? 'ffmpeg no está instalado' : err.message}`);
    await limpiar();
    throw noSePudo();
  }
}

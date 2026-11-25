// Archivos de audio y video de verdad (pequeños) para probar la mezcla con ffmpeg.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'vendiva-medios-'));
const ffmpeg = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args]);

/** Video vertical sin sonido, como los de Runway. */
export function videoSinSonido(segundos = 2) {
  const salida = path.join(carpeta, `video-${segundos}.mp4`);
  if (!fs.existsSync(salida)) ffmpeg(['-f', 'lavfi', '-i', `color=c=0xc2410c:s=360x640:d=${segundos}`, '-pix_fmt', 'yuv420p', '-c:v', 'libx264', salida]);
  return fs.readFileSync(salida);
}

/** Un tono, en el formato pedido (mp3 como ElevenLabs, webm/ogg como una grabación del navegador). */
export function audio(segundos = 1, formato = 'mp3') {
  const salida = path.join(carpeta, `voz-${segundos}.${formato}`);
  if (!fs.existsSync(salida)) ffmpeg(['-f', 'lavfi', '-i', `sine=frequency=440:duration=${segundos}`, salida]);
  return fs.readFileSync(salida);
}

/** Qué trae un MP4: duración y si tiene audio. */
export function revisarMp4(bytes) {
  const archivo = path.join(carpeta, `revisar-${Date.now()}-${Math.random().toString(16).slice(2)}.mp4`);
  fs.writeFileSync(archivo, bytes);
  const salida = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type:format=duration', '-of', 'json', archivo]).toString();
  fs.rmSync(archivo);
  const j = JSON.parse(salida);
  return { duracion: Number(j.format.duration), tiposDeStream: j.streams.map((x) => x.codec_type) };
}

// Parte 5: Programar. El botón "Programar" de cada guion y video, y la hoja
// para elegir el día y la hora. Vendiva no publica en TikTok: a esa hora le
// recuerda en Hoy que le toca publicar, y ella lo sube a mano.

import { useEffect, useState } from 'react';
import { CalendarClock, CalendarPlus, Trash2 } from 'lucide-react';
import { PROGRAMAR, horaDeTexto } from '../../shared/programar.js';
import { AvisoError, Boton, Campo, Hoja } from './base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { activarNotificaciones } from '../nativo.js';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';
const dos = (n) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' de una fecha, en la hora del teléfono. */
export const diaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;
const horaLocal = (d) => `${dos(d.getHours())}:${dos(d.getMinutes())}`;

/** "7:30 p. m." */
export const soloHora = (iso) =>
  new Intl.DateTimeFormat('es-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).replace(/\.$/, '');

/** "Hoy", "Mañana" o "Lunes 1 de diciembre" */
export function nombreDelDia(iso, ahora = new Date()) {
  const d = new Date(iso);
  const hoy = diaLocal(ahora);
  const manana = new Date(ahora);
  manana.setDate(manana.getDate() + 1);
  if (diaLocal(d) === hoy) return 'Hoy';
  if (diaLocal(d) === diaLocal(manana)) return 'Mañana';
  const t = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** "hoy a las 7:30 p. m." / "el lunes 1 de diciembre a las 7:30 p. m." */
export function cuandoSePublica(iso) {
  const dia = nombreDelDia(iso);
  const enFrase = dia === 'Hoy' || dia === 'Mañana' ? dia.toLowerCase() : `el ${dia.charAt(0).toLowerCase()}${dia.slice(1)}`;
  return `${enFrase} a las ${soloHora(iso)}`;
}

/**
 * Punto de partida del formulario: la hora que sugirió la IA, hoy si todavía no
 * pasó y si no mañana. Sin sugerencia: dentro de una hora, en punto.
 */
export function horaInicial(sugerida, ahora = new Date()) {
  const leida = horaDeTexto(sugerida);
  const d = new Date(ahora);
  if (leida) {
    d.setHours(leida.hora, leida.minuto, 0, 0);
    if (d.getTime() < ahora.getTime() + 10 * 60 * 1000) d.setDate(d.getDate() + 1);
  } else {
    d.setHours(d.getHours() + 2, 0, 0, 0);
  }
  return d;
}

/** La publicación pendiente de un guion o un video, si ya lo programó. */
export function pendienteDe(agenda, que) {
  return (
    agenda?.pendientes.find((p) =>
      que.tipo === 'guion' ? p.tipo === 'guion' && p.creacionId === que.creacionId && p.numero === que.numero : p.tipo === 'video' && p.videoId === que.videoId,
    ) ?? null
  );
}

/** Hoja para elegir día y hora. Sirve para programar algo nuevo o cambiar la hora de una pendiente. */
export function HojaProgramar({ abierta, alCerrar, titulo, sugerida, existente, alGuardar, guardando, error, alQuitar, quitando }) {
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    if (!abierta) return;
    const d = existente ? new Date(existente.programadaPara) : horaInicial(sugerida);
    setDia(diaLocal(d));
    setHora(horaLocal(d));
    setAviso(null);
    // Solo al abrir (o si la hora guardada cambia): un refresco del estado no borra lo que ella está eligiendo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierta, existente?.id, existente?.programadaPara, sugerida]);

  const hoy = new Date();
  const limite = new Date(hoy);
  limite.setDate(limite.getDate() + PROGRAMAR.diasMaximo);

  const enviar = (e) => {
    e.preventDefault();
    if (!dia || !hora) return setAviso('Elige el día y la hora.');
    // La fecha y la hora se leen en la hora de su teléfono y viajan con su zona.
    const fecha = new Date(`${dia}T${hora}`);
    if (Number.isNaN(fecha.getTime())) return setAviso('Elige el día y la hora.');
    if (fecha.getTime() < Date.now() - PROGRAMAR.toleranciaPasadoMin * 60 * 1000) return setAviso('Esa hora ya pasó. Elige una de ahora en adelante.');
    setAviso(null);
    alGuardar(fecha.toISOString());
  };

  const errorCampo = aviso ?? error?.campos?.programadaPara ?? null;

  return (
    <Hoja abierta={abierta} alCerrar={() => !guardando && !quitando && alCerrar()} titulo={existente ? 'Cambiar la hora' : 'Programar para publicar'}>
      <p className="text-lg font-semibold leading-snug text-stone-900">{titulo}</p>
      {sugerida && !existente && <p className="mt-1 text-base text-stone-600">Hora sugerida: {sugerida.replace(/\.$/, '')}. Puedes cambiarla.</p>}
      <form onSubmit={enviar} noValidate className="mt-4 space-y-4">
        <Campo etiqueta="Día" type="date" value={dia} min={diaLocal(hoy)} max={diaLocal(limite)} onChange={(e) => setDia(e.target.value)} />
        <Campo etiqueta="Hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} error={errorCampo} />
        <p className="text-base leading-snug text-stone-600">
          Vendiva no publica por ti. A esa hora te avisamos (en <strong className="font-semibold text-stone-900">Hoy</strong>, y en la app del teléfono con una notificación si la aceptas), y tú lo subes a TikTok.
        </p>
        {error && !error.campos && <AvisoError error={error} />}
        <Boton type="submit" icono={CalendarPlus} cargando={guardando} textoCargando="Guardando…" disabled={quitando}>
          {existente ? 'Guardar la hora nueva' : 'Programar'}
        </Boton>
        {existente && alQuitar && (
          <Boton variante="texto" icono={Trash2} className="min-h-12" onClick={alQuitar} cargando={quitando} textoCargando="Quitando…" disabled={guardando}>
            Quitar del calendario
          </Boton>
        )}
      </form>
    </Hoja>
  );
}

/**
 * El botón de cada guion y de cada video. Si ya está programado, dice cuándo
 * y deja cambiar la hora o quitarlo.
 */
export function BotonProgramar({ que, titulo, sugerida, className = '' }) {
  const { datos, acciones } = useEstado();
  const [abierta, setAbierta] = useState(false);
  const existente = pendienteDe(datos.agenda, que);
  const cerrar = () => setAbierta(false);
  const guardar = useAccion((iso) => (existente ? acciones.cambiarPublicacion(existente.id, { programadaPara: iso }) : acciones.programar(que, iso)), {
    alExito: () => {
      cerrar();
      // En la app del teléfono: al programar, se pide permiso para avisarle a la hora (una vez).
      activarNotificaciones(acciones.registrarTelefono).catch(() => {});
    },
  });
  const quitar = useAccion(() => acciones.quitarPublicacion(existente.id), { alExito: cerrar });

  const abrir = () => {
    guardar.limpiar();
    quitar.limpiar();
    setAbierta(true);
  };

  return (
    <div className={className}>
      {existente ? (
        <button
          type="button"
          onClick={abrir}
          className={`flex min-h-12 w-full items-center gap-3 rounded-2xl bg-amber-100 px-4 py-2.5 text-left ring-1 ring-inset ring-amber-300/70 transition hover:bg-amber-200/70 ${FOCO}`}
        >
          <CalendarClock className="h-5 w-5 shrink-0 text-amber-900" aria-hidden="true" />
          <span className="min-w-0 flex-1 text-base leading-snug text-amber-950">
            <span className="font-semibold">Programado {cuandoSePublica(existente.programadaPara)}</span>
          </span>
          <span className="shrink-0 text-base font-semibold text-orange-800">Cambiar</span>
        </button>
      ) : (
        <Boton variante="secundario" icono={CalendarPlus} className="min-h-12" onClick={abrir}>
          Programar
        </Boton>
      )}
      <HojaProgramar
        abierta={abierta}
        alCerrar={cerrar}
        titulo={titulo}
        sugerida={sugerida}
        existente={existente}
        alGuardar={(iso) => guardar.ejecutar(iso)}
        guardando={guardar.cargando}
        error={guardar.error ?? quitar.error}
        alQuitar={existente ? () => quitar.ejecutar() : null}
        quitando={quitar.cargando}
      />
    </div>
  );
}

// Tarjeta de un guion: gancho, los pasos en el modo elegido (con cámara o sin
// cámara), el texto para publicar y la hora sugerida.

import { useState } from 'react';
import { Check, ChevronDown, Clock, Copy, Hand, Video } from 'lucide-react';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

async function copiarTexto(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Navegadores viejos o sin permiso: el método de antes.
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** Botón que copia y lo confirma con un "Copiado" que se quita solo. */
export function BotonCopiar({ texto, children = 'Copiar', etiqueta, className = '' }) {
  const [estado, setEstado] = useState('listo'); // listo | copiado | fallo
  const copiar = async () => {
    const ok = await copiarTexto(typeof texto === 'function' ? texto() : texto);
    setEstado(ok ? 'copiado' : 'fallo');
    setTimeout(() => setEstado('listo'), 2200);
  };
  const Icono = estado === 'copiado' ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copiar}
      aria-label={etiqueta}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3.5 text-base font-semibold transition active:scale-[0.97] ${FOCO} ${
        estado === 'copiado' ? 'bg-amber-100 text-amber-950' : 'bg-orange-100 text-orange-900 hover:bg-orange-200'
      } ${className}`}
    >
      <Icono className="h-[18px] w-[18px]" strokeWidth={estado === 'copiado' ? 3 : 2} aria-hidden="true" />
      <span aria-live="polite">{estado === 'copiado' ? 'Copiado' : estado === 'fallo' ? 'No se pudo copiar' : children}</span>
    </button>
  );
}

const MODOS = [
  { id: 'conCamara', nombre: 'Con cámara', icono: Video },
  { id: 'sinCamara', nombre: 'Sin cámara', icono: Hand },
];

/** Selector de los dos modos. Sirve igual para un guion que para toda la lista. */
export function SelectorModo({ modo, alCambiar, nombre }) {
  return (
    <div role="radiogroup" aria-label={nombre ?? 'Modo de grabación'} className="grid grid-cols-2 gap-1 rounded-2xl bg-stone-100 p-1">
      {MODOS.map(({ id, nombre: n, icono: Icono }) => {
        const activo = modo === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={activo}
            onClick={() => alCambiar(id)}
            className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-base font-semibold transition ${FOCO} ${
              activo ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-900/5' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
            {n}
          </button>
        );
      })}
    </div>
  );
}

function Linea({ etiqueta, children, fuerte = false }) {
  return (
    <p className="leading-snug">
      <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">{etiqueta}</span>
      <span className={fuerte ? 'text-lg font-medium text-stone-900' : 'text-base text-stone-700'}>{children}</span>
    </p>
  );
}

function Paso({ paso, modo }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 h-fit shrink-0 rounded-lg bg-stone-900 px-2 py-1 text-xs font-bold tabular-nums text-orange-50">{paso.tiempo}</span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {modo === 'conCamara' ? (
          <>
            <Linea etiqueta="Dices" fuerte>{paso.dices}</Linea>
            <Linea etiqueta="Haces">{paso.haces}</Linea>
          </>
        ) : (
          <>
            <Linea etiqueta="Se ve">{paso.seVe}</Linea>
            <Linea etiqueta="Se escucha" fuerte>{paso.seEscucha}</Linea>
          </>
        )}
        {paso.textoEnPantalla && <Linea etiqueta="Texto en pantalla">{paso.textoEnPantalla}</Linea>}
      </div>
    </li>
  );
}

/** El guion en texto plano, para pegarlo donde ella quiera. */
export function guionComoTexto(guion, modo) {
  const pasos = guion[modo].map((p) =>
    modo === 'conCamara'
      ? [`${p.tiempo}`, `DICES: ${p.dices}`, `HACES: ${p.haces}`, p.textoEnPantalla && `TEXTO EN PANTALLA: ${p.textoEnPantalla}`]
      : [`${p.tiempo}`, `SE VE: ${p.seVe}`, `SE ESCUCHA: ${p.seEscucha}`, p.textoEnPantalla && `TEXTO EN PANTALLA: ${p.textoEnPantalla}`],
  );
  return [
    guion.titulo,
    modo === 'conCamara' ? '(Con cámara)' : '(Sin cámara: manos + producto + tu voz)',
    '',
    `GANCHO: ${guion.gancho}`,
    '',
    ...pasos.flatMap((lineas) => [...lineas.filter(Boolean), '']),
  ]
    .join('\n')
    .trim();
}

export function ScriptCard({ numero, guion, modo, alCambiarModo, abiertoAlInicio = false }) {
  const [abierto, setAbierto] = useState(abiertoAlInicio);
  const publicar = `${guion.caption}\n\n${guion.hashtags.join(' ')}`;

  return (
    <article className="sombra-tarjeta overflow-hidden rounded-3xl bg-white ring-1 ring-stone-900/5">
      <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-base font-bold text-white" aria-hidden="true">
            {numero}
          </span>
          <h3 className="min-w-0 text-lg font-bold leading-snug tracking-tight text-stone-900">
            <span className="sr-only">Guion {numero}: </span>
            {guion.titulo}
          </h3>
        </div>

        <div className="mt-4 rounded-2xl bg-amber-100/70 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-900">Gancho · primeros 3 segundos</p>
          <p className="mt-1 text-xl font-semibold leading-snug text-stone-900">{guion.gancho}</p>
        </div>

        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={`mt-3 flex min-h-12 w-full items-center justify-between rounded-2xl px-1 text-left text-base font-semibold text-orange-800 ${FOCO}`}
        >
          {abierto ? 'Ocultar el guion' : 'Ver el guion completo'}
          <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {abierto && (
        <div className="anim-entrar space-y-5 border-t border-stone-100 px-5 pb-5 pt-4">
          <SelectorModo modo={modo} alCambiar={alCambiarModo} nombre={`Modo del guion ${numero}`} />

          <ol key={modo} className="anim-entrar space-y-4">
            {guion[modo].map((paso, i) => (
              <Paso key={i} paso={paso} modo={modo} />
            ))}
          </ol>
          {modo === 'sinCamara' && <p className="text-sm text-stone-500">En este modo tu cara no sale: solo tus manos, el producto y tu voz.</p>}
          <BotonCopiar texto={() => guionComoTexto(guion, modo)} etiqueta={`Copiar el guion ${numero}`} className="w-full">
            Copiar este guion
          </BotonCopiar>

          <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Texto para publicar</p>
            <p className="mt-1.5 text-base leading-relaxed text-stone-800">{guion.caption}</p>
            <p className="mt-2 break-words text-base font-medium leading-relaxed text-orange-800">{guion.hashtags.join(' ')}</p>
            <BotonCopiar texto={publicar} etiqueta={`Copiar el texto para publicar del guion ${numero}`} className="mt-3 w-full">
              Copiar texto y hashtags
            </BotonCopiar>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
            <p className="text-base leading-snug text-stone-700">
              <span className="font-semibold text-stone-900">Hora sugerida: {guion.mejorHora.hora}.</span> {guion.mejorHora.motivo}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

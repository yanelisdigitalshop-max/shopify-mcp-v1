// La voz de un video ya listo (los de Runway salen sin sonido). Parte 4.
//   - Voz real (la principal): ella graba su voz aquí. Gratis, sin créditos y sin límite.
//   - Voz de IA (ElevenLabs): narra el guion. 2 créditos de texto, con el aviso antes.
//     Plan Gratis: 3 al mes; después se frena hasta el mes siguiente o hasta subir de plan.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Mic, RotateCcw, Sparkles, Square, UserRound } from 'lucide-react';
import { MOTOR_VOZ, VOZ_REAL_MAX_SEGUNDOS, formatoNumero } from '../../shared/datos.js';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { CreditNotice } from './CreditNotice.jsx';
import { AvisoError, Boton, Hoja } from './base.jsx';

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

// Formatos que graban los navegadores (Chrome/Android: webm; Safari/iPhone: mp4).
const FORMATOS = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg;codecs=opus'];

/** Hoja para grabar su voz leyendo el guion. */
function HojaGrabar({ abierta, alCerrar, lineas, guardar }) {
  const [fase, setFase] = useState('lista'); // lista | pidiendo | grabando | revisar
  const [segundos, setSegundos] = useState(0);
  const [problema, setProblema] = useState(null);
  const [grabacion, setGrabacion] = useState(null); // { blob, url }
  const grabadora = useRef(null);
  const microfono = useRef(null);
  const reloj = useRef(null);

  const soltarMicrofono = useCallback(() => {
    clearInterval(reloj.current);
    microfono.current?.getTracks().forEach((t) => t.stop());
    microfono.current = null;
  }, []);

  // Al cerrar: se apaga el micrófono y se olvida la grabación que no se usó.
  useEffect(() => {
    if (abierta) return undefined;
    if (grabadora.current?.state === 'recording') {
      grabadora.current.onstop = null;
      grabadora.current.stop();
    }
    soltarMicrofono();
    setFase('lista');
    setSegundos(0);
    setProblema(null);
    setGrabacion((g) => {
      if (g) URL.revokeObjectURL(g.url);
      return null;
    });
    return undefined;
  }, [abierta, soltarMicrofono]);
  useEffect(() => soltarMicrofono, [soltarMicrofono]);

  const detener = () => {
    if (grabadora.current?.state === 'recording') grabadora.current.stop();
  };

  const empezar = async () => {
    setProblema(null);
    guardar.limpiar();
    if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder === 'undefined') {
      setProblema('Este navegador no deja grabar. Abre Vendiva en Chrome o Safari actualizados.');
      return;
    }
    setFase('pidiendo');
    let flujo;
    try {
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setFase('lista');
      setProblema(
        e?.name === 'NotAllowedError'
          ? 'Para grabar tu voz, permite el micrófono cuando el teléfono te lo pregunte. Si dijiste que no, cámbialo en los ajustes del navegador.'
          : 'No encontramos el micrófono. Revisa que no lo esté usando otra app y prueba otra vez.',
      );
      return;
    }
    microfono.current = flujo;
    const formato = FORMATOS.find((f) => window.MediaRecorder.isTypeSupported?.(f));
    const r = new window.MediaRecorder(flujo, formato ? { mimeType: formato } : undefined);
    const partes = [];
    r.ondataavailable = (e) => {
      if (e.data?.size) partes.push(e.data);
    };
    r.onstop = () => {
      soltarMicrofono();
      const blob = new Blob(partes, { type: (r.mimeType || formato || 'audio/webm').split(';')[0] });
      setGrabacion({ blob, url: URL.createObjectURL(blob) });
      setFase('revisar');
    };
    grabadora.current = r;
    r.start(250);
    const inicio = Date.now();
    setSegundos(0);
    setFase('grabando');
    reloj.current = setInterval(() => {
      const s = (Date.now() - inicio) / 1000;
      setSegundos(s);
      if (s >= VOZ_REAL_MAX_SEGUNDOS) detener();
    }, 200);
  };

  const otraVez = () => {
    if (grabacion) URL.revokeObjectURL(grabacion.url);
    setGrabacion(null);
    empezar();
  };

  const guardando = guardar.cargando;

  return (
    <Hoja abierta={abierta} alCerrar={() => !guardando && alCerrar()} titulo="Graba tu voz">
      <p className="text-base leading-snug text-stone-600">
        Lee esto con calma, como si se lo contaras a una amiga. Tienes hasta {VOZ_REAL_MAX_SEGUNDOS} segundos, lo que dura el video.
      </p>
      <ol className="mt-3 space-y-2 rounded-2xl bg-white p-4 ring-1 ring-stone-900/5">
        {lineas.map((l, i) => (
          <li key={i} className="text-xl font-medium leading-snug text-stone-900">
            {l}
          </li>
        ))}
      </ol>

      {fase === 'grabando' && (
        <div className="mt-4" role="status">
          <p className="flex items-center gap-2 text-lg font-semibold text-red-700">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
            Grabando… {Math.floor(segundos)} de {VOZ_REAL_MAX_SEGUNDOS} segundos
          </p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
            <div className="h-full rounded-full bg-red-600 transition-[width] duration-200" style={{ width: `${Math.min(100, (segundos / VOZ_REAL_MAX_SEGUNDOS) * 100)}%` }} />
          </div>
        </div>
      )}

      {fase === 'revisar' && grabacion && (
        <div className="mt-4">
          <p className="text-base font-semibold text-stone-900">Escucha cómo quedó:</p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={grabacion.url} controls className="mt-2 w-full" aria-label="Tu grabación" />
        </div>
      )}

      {problema && <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-base leading-snug text-amber-950">{problema}</p>}
      {guardar.error && <AvisoError className="mt-4" error={guardar.error} alReintentar={() => guardar.ejecutar(grabacion.blob)} reintentando={guardando} />}

      <div className="mt-6 space-y-3">
        {fase === 'lista' && (
          <Boton icono={Mic} className="min-h-16 text-xl" onClick={empezar}>
            Empezar a grabar
          </Boton>
        )}
        {fase === 'pidiendo' && (
          <Boton icono={Mic} className="min-h-16 text-xl" cargando textoCargando="Abriendo el micrófono…">
            Empezar a grabar
          </Boton>
        )}
        {fase === 'grabando' && (
          <Boton icono={Square} className="min-h-16 text-xl" onClick={detener}>
            Terminar
          </Boton>
        )}
        {fase === 'revisar' && (
          <>
            <Boton icono={Check} className="min-h-16 text-xl" onClick={() => guardar.ejecutar(grabacion.blob)} cargando={guardando} textoCargando="Guardando tu voz…">
              Usar esta grabación
            </Boton>
            <Boton variante="secundario" icono={RotateCcw} onClick={otraVez} disabled={guardando}>
              Grabar otra vez
            </Boton>
          </>
        )}
      </div>
      <p className="mt-3 text-center text-base text-stone-600">Grabar tu voz es gratis y no tiene límite.</p>
    </Hoja>
  );
}

/** Lo que dice el guion sin cámara (la voz encima del video): eso se graba o lo lee la IA. */
export const lineasDeVoz = (video) => (video.guion?.sinCamara ?? []).map((p) => p.seEscucha).filter(Boolean);

export function VozDelVideo({ video, nombre, producto, irA }) {
  const { datos, acciones } = useEstado();
  const [grabar, setGrabar] = useState(false);
  const [avisoIA, setAvisoIA] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const guardarReal = useAccion((blob) => acciones.guardarVozReal(video.id, blob), {
    alExito: () => {
      setGrabar(false);
      setCambiando(false);
    },
  });
  const crearIA = useAccion((costo) => acciones.crearVozIA(video.id, costo), {
    alExito: () => {
      setAvisoIA(false);
      setCambiando(false);
    },
  });

  const lineas = lineasDeVoz(video);
  const pago = datos.creditos.vozIA;
  const enGratis = pago.maxMes != null;
  const renuevaEl = datos.creditos.renuevaEl;

  const abrirGrabar = () => {
    guardarReal.limpiar();
    setGrabar(true);
  };
  const abrirIA = () => {
    crearIA.limpiar();
    setAvisoIA(true);
  };

  const nota = [
    `La hace ${MOTOR_VOZ.nombre} con una voz femenina en español, leyendo el guion del video.`,
    enGratis ? `Es tu voz de IA ${pago.usadasMes + 1} de ${pago.maxMes} de este mes.` : null,
    video.voz ? 'Reemplaza la voz que tiene ahora.' : null,
    'Si falla, no se cobra nada.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Voz del video</p>

      {video.voz && !cambiando ? (
        <>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-stone-900">
            {video.voz.tipo === 'real' ? <UserRound className="h-5 w-5 text-orange-800" aria-hidden="true" /> : <Sparkles className="h-5 w-5 text-orange-800" aria-hidden="true" />}
            {video.voz.tipo === 'real' ? 'Tu voz' : `Voz de IA (${MOTOR_VOZ.nombre})`}
          </p>
          <p className="mt-1 text-base leading-snug text-stone-600">Dale play al video para escucharlo con la voz. Al descargarlo, la voz va incluida.</p>
          <Boton variante="secundario" className="mt-3 min-h-12" onClick={() => setCambiando(true)}>
            Cambiar la voz
          </Boton>
        </>
      ) : (
        <>
          <p className="mt-1 text-base leading-snug text-stone-700">Elige cómo ponerle voz:</p>
          <div className="mt-3 space-y-3">
            <Boton icono={Mic} onClick={abrirGrabar} disabled={!lineas.length}>
              Grabar mi voz · gratis
            </Boton>
            {pago.agotadas ? (
              <div className="rounded-2xl bg-amber-100 p-4 ring-1 ring-inset ring-amber-300/70" role="status">
                <p className="text-base font-semibold leading-snug text-amber-950">
                  Ya usaste tus {pago.maxMes} voces de IA de este mes. Vuelven el {fechaLarga(renuevaEl)}.
                </p>
                <p className="mt-1 text-base leading-snug text-amber-950/85">En los planes de pago la voz de IA no tiene límite. Grabar tu propia voz sigue siendo gratis.</p>
                <Boton variante="secundario" className="mt-3 min-h-12" onClick={() => irA('planes')}>
                  Subir de plan
                </Boton>
              </div>
            ) : (
              <Boton variante="suave" icono={Sparkles} onClick={abrirIA} disabled={!lineas.length}>
                Voz de IA · {pago.costo} créditos
              </Boton>
            )}
          </div>
          {enGratis && (
            <p className="mt-2 text-base leading-snug text-stone-600">
              Voz de IA en el plan Gratis: llevas {formatoNumero(Math.min(pago.usadasMes, pago.maxMes))} de {pago.maxMes} este mes.
            </p>
          )}
          {cambiando && (
            <button type="button" onClick={() => setCambiando(false)} className="mt-2 min-h-11 w-full rounded-xl text-base font-semibold text-stone-600 hover:bg-stone-100">
              Dejar la voz que tiene
            </button>
          )}
        </>
      )}

      <HojaGrabar abierta={grabar} alCerrar={() => setGrabar(false)} lineas={lineas} guardar={guardarReal} />

      <CreditNotice
        abierta={avisoIA}
        alCerrar={() => setAvisoIA(false)}
        queSeCrea={`Voz de IA para ${nombre}`}
        paraQue={producto.nombre}
        costo={pago.costo}
        saldo={{ total: pago.saldo, renuevaEl }}
        plan={datos.plan}
        unidad="de texto"
        frenaSiempre={pago.frena}
        nota={nota}
        creando={crearIA.cargando}
        textoCreando="Creando la voz…"
        esperaCreando={`${MOTOR_VOZ.nombre} está leyendo tu guion. Tarda unos segundos.`}
        error={crearIA.error}
        alConfirmar={() => crearIA.ejecutar(pago.costo)}
        irAPlanes={() => {
          setAvisoIA(false);
          irA('planes');
        }}
      />
    </div>
  );
}

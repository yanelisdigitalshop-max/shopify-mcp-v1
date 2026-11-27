// Videos con IA para el producto del día, dentro de Hoy (Parte 4).
//   - 3 videos cortos y 3 videos desde la foto, cada uno de 10 segundos, vertical.
//   - Los hace Runway (Gen-4 Turbo) a partir de la foto que trae TikTok Shop.
//   - Cada uno cuesta 20 créditos de VIDEO, siempre con el aviso antes de crear.
//   - Plan Gratis: 1 video corto gratis al mes.
//   - El video sale SIN sonido: con él viene el guion para que ella ponga su voz.
//   - Runway tarda de 1 a 5 minutos: ella puede salir y lo encuentra listo.
//   - El enlace de Runway vence en 24 a 48 horas: mientras no lo descargue, al abrir el
//     video sale una advertencia con el botón grande "Descargar video".

import { useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, Clapperboard, Download, ImageOff, Image as IconoFoto, PlayCircle, Search, TriangleAlert, VolumeX } from 'lucide-react';
import { DURACION_VIDEO_SEGUNDOS, MOTOR_VIDEO, TIPOS_VIDEO, VIDEOS_POR_TIPO, formatoNumero } from '../../shared/datos.js';
import { CreditNotice } from '../componentes/CreditNotice.jsx';
import { BotonCopiar, SelectorModo } from '../componentes/ScriptCard.jsx';
import { AvisoError, Boton, Hoja, Puntos, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { VozDelVideo } from '../componentes/VozDelVideo.jsx';
import { BotonProgramar } from '../componentes/Programar.jsx';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

const enCurso = (v) => v && (v.estado === 'preparando' || v.estado === 'procesando');

function Sello({ children, tono = 'claro' }) {
  const tonos = {
    claro: 'bg-stone-100 text-stone-700',
    ambar: 'bg-amber-100 text-amber-900',
    oscuro: 'bg-stone-900 text-orange-50',
  };
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${tonos[tono]}`}>{children}</span>;
}

function guionVideoComoTexto(v, modo) {
  const pasos = v.guion[modo].map((p) =>
    modo === 'conCamara'
      ? [p.tiempo, `DICES: ${p.dices}`, `HACES: ${p.haces}`, p.textoEnPantalla && `TEXTO EN PANTALLA: ${p.textoEnPantalla}`]
      : [p.tiempo, `SE VE: ${p.seVe}`, `SE ESCUCHA: ${p.seEscucha}`, p.textoEnPantalla && `TEXTO EN PANTALLA: ${p.textoEnPantalla}`],
  );
  return [
    v.titulo,
    modo === 'conCamara' ? '(Con cámara)' : '(Sin cámara: manos + producto + tu voz)',
    '',
    ...pasos.flatMap((lineas) => [...lineas.filter(Boolean), '']),
    v.guion.textoEnPantalla ? `TEXTO GRANDE EN PANTALLA: ${v.guion.textoEnPantalla}` : '',
  ]
    .join('\n')
    .trim();
}

/** El guion que acompaña al video: lo que ella dice (con cámara) o su voz encima (sin cámara). */
function GuionDelVideo({ video, modo, alCambiarModo }) {
  const [abierto, setAbierto] = useState(false);
  const [verPrompt, setVerPrompt] = useState(false);
  if (!video.guion) return null;
  return (
    <div className="border-t border-stone-100 pt-1">
      <button
        type="button"
        onClick={() => setAbierto((x) => !x)}
        aria-expanded={abierto}
        className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-1 text-left text-base font-semibold text-orange-800 ${FOCO}`}
      >
        {abierto ? 'Ocultar el guion' : 'Ver el guion para tu voz'}
        <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {abierto && (
        <div className="anim-entrar space-y-4 pb-1 pt-2">
          <SelectorModo modo={modo} alCambiar={alCambiarModo} nombre={`Modo del guion de ${video.titulo ?? 'este video'}`} />
          <ol key={modo} className="anim-entrar space-y-3">
            {video.guion[modo].map((p, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-0.5 h-fit shrink-0 rounded-lg bg-stone-900 px-2 py-1 text-xs font-bold tabular-nums text-orange-50">{p.tiempo}</span>
                <div className="min-w-0 flex-1 space-y-1">
                  {modo === 'conCamara' ? (
                    <>
                      <p className="leading-snug">
                        <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Dices</span>
                        <span className="text-lg font-medium text-stone-900">{p.dices}</span>
                      </p>
                      <p className="leading-snug">
                        <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Haces</span>
                        <span className="text-base text-stone-700">{p.haces}</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="leading-snug">
                        <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Se ve</span>
                        <span className="text-base text-stone-700">{p.seVe}</span>
                      </p>
                      <p className="leading-snug">
                        <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Tu voz</span>
                        <span className="text-lg font-medium text-stone-900">{p.seEscucha}</span>
                      </p>
                    </>
                  )}
                  {p.textoEnPantalla && (
                    <p className="leading-snug">
                      <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Texto en pantalla</span>
                      <span className="text-base text-stone-700">{p.textoEnPantalla}</span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {video.guion.textoEnPantalla && (
            <p className="rounded-2xl bg-amber-100/70 px-4 py-3 text-base leading-snug text-stone-900">
              <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-amber-900">Texto grande encima</span>
              {video.guion.textoEnPantalla}
            </p>
          )}
          {modo === 'sinCamara' && <p className="text-sm text-stone-500">En este modo tu cara no sale: el video de Runway y tu voz encima.</p>}
          <BotonCopiar texto={() => guionVideoComoTexto(video, modo)} className="w-full">
            Copiar este guion
          </BotonCopiar>

          {video.prompt && (
            <div>
              <button
                type="button"
                onClick={() => setVerPrompt((x) => !x)}
                aria-expanded={verPrompt}
                className={`flex min-h-11 items-center gap-1 rounded-xl px-1 text-base font-semibold text-stone-600 ${FOCO}`}
              >
                {verPrompt ? 'Ocultar lo que le pedimos a Runway' : 'Ver lo que le pedimos a Runway'}
                <ChevronDown className={`h-4 w-4 transition-transform ${verPrompt ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {verPrompt && (
                <p lang="en" className="anim-entrar mt-1 rounded-2xl bg-stone-50 p-3 text-sm leading-relaxed text-stone-700 ring-1 ring-inset ring-stone-200/70">
                  {video.prompt}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Un lugar para un video: vacío, creándose, listo o que no se pudo. */
function LugarVideo({ producto, tipo, indice, video, modo, alCambiarModo, irA }) {
  const { datos, acciones } = useEstado();
  const [aviso, setAviso] = useState(false);
  const [fallaVideo, setFallaVideo] = useState(false);
  const accion = useAccion((costoAceptado) => acciones.crearVideo(producto.id, tipo, indice, costoAceptado), {
    alExito: () => setAviso(false),
  });
  const { videoGratis, video: saldoVideo, renuevaEl } = datos.creditos;
  const info = TIPOS_VIDEO[tipo];
  const gratis = tipo === 'corto' && Boolean(videoGratis?.disponible);
  const costo = gratis ? 0 : info.costo;
  const nombre = `${info.nombre} ${indice}`;
  const esGratisPlan = Boolean(videoGratis?.incluido);

  const abrirAviso = () => {
    accion.limpiar();
    setAviso(true);
  };

  // Advertencia de descarga: sale CADA VEZ que abre un video que todavía no descargó.
  const [advertencia, setAdvertencia] = useState(false);
  const [verSinDescargar, setVerSinDescargar] = useState(false); // solo mientras esté en esta pantalla
  const descarga = useAccion(() => acciones.descargarVideo(video.id), { alExito: () => setAdvertencia(false) });
  const audioVoz = useRef(null);
  const conVoz = (hacer) => {
    if (audioVoz.current) hacer(audioVoz.current);
  };
  const abrirAdvertencia = () => {
    descarga.limpiar();
    setAdvertencia(true);
  };

  const creandose = enCurso(video);
  const listo = video?.estado === 'listo';
  const fallido = video?.estado === 'fallido';
  const enlace = listo ? `/api/videos/${video.id}/ver` : null;

  return (
    <li className="rounded-3xl bg-white p-4 ring-1 ring-stone-900/5 sombra-tarjeta">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-lg font-bold leading-snug tracking-tight text-stone-900">{video?.titulo && listo ? video.titulo : nombre}</h4>
          {video?.titulo && listo && <p className="text-base text-stone-600">{nombre}</p>}
        </div>
        {listo && <Sello tono={video.gratis ? 'ambar' : 'claro'}>{video.gratis ? 'Gratis' : `${video.creditosCobrados} créditos`}</Sello>}
      </div>

      {creandose && (
        <div className="mt-3 rounded-2xl bg-orange-50 p-4 ring-1 ring-inset ring-orange-200" role="status">
          <p className="flex items-center gap-2 text-lg font-semibold text-orange-900">
            <Puntos />
            Creando tu video…
          </p>
          <p className="mt-1 text-base leading-snug text-stone-700">
            {MOTOR_VIDEO.nombre} tarda de 1 a 5 minutos. Puedes salir de aquí: cuando esté listo lo encuentras en este mismo lugar.
          </p>
        </div>
      )}

      {listo && (
        <div className="mt-3 space-y-3">
          {!video.descargado && !verSinDescargar ? (
            // Sin descargar: el video no se abre directo. Primero sale la advertencia.
            <button
              type="button"
              onClick={abrirAdvertencia}
              className={`mx-auto flex aspect-[9/16] max-h-96 w-auto max-w-full flex-col items-center justify-center gap-3 rounded-2xl bg-stone-900 px-6 text-center text-orange-50 transition active:scale-[0.99] ${FOCO}`}
            >
              <PlayCircle className="h-16 w-16 text-amber-300" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-xl font-bold">Ver video</span>
              <span className="text-base text-orange-100/80">Todavía no lo descargas</span>
            </button>
          ) : fallaVideo ? (
            <div className="flex aspect-[9/16] max-h-96 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-stone-100 p-4 text-center">
              <ImageOff className="h-8 w-8 text-stone-400" aria-hidden="true" />
              <p className="text-base text-stone-700">No pudimos mostrar el video aquí. Descárgalo con el botón de abajo.</p>
            </div>
          ) : (
            <>
              <video
                src={enlace}
                controls
                playsInline
                preload="metadata"
                onError={() => setFallaVideo(true)}
                // Con voz: el audio suena junto al video (el de Runway no trae sonido).
                onPlay={(e) => conVoz((a) => {
                  a.currentTime = e.currentTarget.currentTime;
                  a.play().catch(() => {});
                })}
                onPause={() => conVoz((a) => a.pause())}
                onEnded={() => conVoz((a) => a.pause())}
                onSeeked={(e) => conVoz((a) => {
                  a.currentTime = e.currentTarget.currentTime;
                })}
                className="mx-auto aspect-[9/16] max-h-96 w-auto max-w-full rounded-2xl bg-stone-900"
                aria-label={`Video: ${video.titulo ?? nombre}`}
              />
              {video.voz && (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <audio ref={audioVoz} src={`/api/videos/${video.id}/voz?v=${encodeURIComponent(video.voz.creadoEn)}`} preload="auto" className="hidden" />
              )}
            </>
          )}
          {!video.voz && (
            <p className="flex items-start gap-2 text-base leading-snug text-stone-600">
              <VolumeX className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
              El video sale sin sonido. Ponle tu voz (gratis) o una voz de IA aquí abajo.
            </p>
          )}

          {video.descargado ? (
            <>
              <p className="flex items-start gap-2 rounded-2xl bg-stone-100 px-4 py-3 text-base leading-snug text-stone-700" role="status">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
                Ya lo descargaste: está en las descargas de tu teléfono.
              </p>
              <Boton variante="secundario" className="min-h-12" icono={Download} onClick={() => descarga.ejecutar()} cargando={descarga.cargando} textoCargando="Descargando…">
                Descargar otra vez
              </Boton>
            </>
          ) : (
            verSinDescargar && (
              <div className="rounded-2xl bg-amber-100 p-4 ring-1 ring-inset ring-amber-300/70" role="status">
                <p className="flex items-start gap-2 text-base font-semibold leading-snug text-amber-950">
                  <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                  Todavía no lo descargas. El enlace de Runway vence en 24 a 48 horas.
                </p>
                <Boton className="mt-3" icono={Download} onClick={() => descarga.ejecutar()} cargando={descarga.cargando} textoCargando="Descargando…">
                  Descargar video
                </Boton>
              </div>
            )
          )}
          {descarga.error && !advertencia && <AvisoError error={descarga.error} alReintentar={descarga.reintentar} reintentando={descarga.cargando} />}
          <BotonProgramar que={{ tipo: 'video', videoId: video.id }} titulo={video.titulo ?? nombre} />
          <VozDelVideo video={video} nombre={nombre} producto={producto} irA={irA} />
          <GuionDelVideo video={video} modo={modo} alCambiarModo={alCambiarModo} />
        </div>
      )}

      {listo && (
        <Hoja abierta={advertencia} alCerrar={() => !descarga.cargando && setAdvertencia(false)} titulo="Descarga tu video ahora">
          <div className="flex items-start gap-3 rounded-2xl bg-amber-100 p-4 ring-1 ring-inset ring-amber-300/70">
            <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-amber-900" aria-hidden="true" />
            <p className="text-lg font-semibold leading-snug text-amber-950">Este video todavía no está guardado en tu teléfono.</p>
          </div>
          <p className="mt-4 text-lg leading-snug text-stone-700">
            El enlace de Runway <strong className="font-semibold text-stone-900">vence en 24 a 48 horas</strong>. Si Runway borra el video, se pierde para siempre y
            tendrías que crearlo de nuevo, <strong className="font-semibold text-stone-900">gastando créditos otra vez</strong>.
          </p>
          <p className="mt-3 text-base leading-snug text-stone-600">Descárgalo ahora: queda en las descargas de tu teléfono y lo subes a TikTok cuando quieras.</p>
          {descarga.error && <AvisoError className="mt-4" error={descarga.error} alReintentar={descarga.reintentar} reintentando={descarga.cargando} />}
          <div className="mt-6 space-y-3">
            <Boton icono={Download} className="min-h-16 text-xl" onClick={() => descarga.ejecutar()} cargando={descarga.cargando} textoCargando="Descargando…">
              Descargar video
            </Boton>
            <Boton
              variante="secundario"
              disabled={descarga.cargando}
              onClick={() => {
                setVerSinDescargar(true);
                setAdvertencia(false);
              }}
            >
              Ver sin descargar
            </Boton>
          </div>
        </Hoja>
      )}

      {fallido && !accion.error && (
        <p className="mt-3 rounded-2xl bg-stone-100 px-4 py-3 text-base leading-snug text-stone-700">
          Este video no se pudo crear. {video.gratis ? 'Tu video gratis del mes sigue disponible.' : 'No se gastó ningún crédito.'} Puedes intentar otra vez.
        </p>
      )}

      {accion.error && !aviso && <AvisoError className="mt-3" error={accion.error} alReintentar={abrirAviso} />}

      {!creandose && (
        <Boton variante={listo ? 'secundario' : gratis ? 'primario' : 'suave'} className="mt-3 min-h-12" icono={Clapperboard} onClick={abrirAviso}>
          {listo ? 'Otra versión' : 'Crear'} · {gratis ? 'con tu video gratis' : `${costo} créditos`}
        </Boton>
      )}

      <CreditNotice
        abierta={aviso}
        alCerrar={() => setAviso(false)}
        queSeCrea={`${nombre} (${DURACION_VIDEO_SEGUNDOS} segundos)`}
        paraQue={producto.nombre}
        costo={info.costo}
        saldo={{ total: saldoVideo.total, renuevaEl }}
        plan={datos.plan}
        gratis={gratis}
        unidad="de video"
        frenaSiempre
        tituloFreno={esGratisPlan ? 'Ya usaste tu video gratis de este mes' : 'No te alcanzan los créditos de video'}
        detalleFreno={
          esGratisPlan
            ? `En el plan Gratis viene 1 video corto gratis al mes. El ${fechaLarga(renuevaEl)} tienes otro. Para hacer más, compra créditos de video o sube de plan.`
            : `Tus créditos de video del plan se renuevan solos el ${fechaLarga(renuevaEl)}.`
        }
        nota={`Lo hace ${MOTOR_VIDEO.nombre} (${MOTOR_VIDEO.modelo}) desde la foto del producto. Tarda de 1 a 5 minutos y sale sin sonido: con el video te damos el guion para tu voz.${
          listo ? ' La versión nueva reemplaza a la que tienes aquí.' : ''
        }`}
        creando={accion.cargando}
        textoCreando="Preparando tu video…"
        esperaCreando="Escribimos el guion y se lo pedimos a Runway. No cierres esta pantalla."
        error={accion.error}
        alConfirmar={() => accion.ejecutar(costo)}
        irAPlanes={() => {
          setAviso(false);
          irA('planes');
        }}
      />
    </li>
  );
}

export function SeccionVideos({ producto, modoPreferido, irA }) {
  const { datos } = useEstado();
  const [modo, setModo] = useState(modoPreferido === 'con_camara' ? 'conCamara' : 'sinCamara');
  if (!producto) return null;

  const { video: saldoVideo, videoGratis } = datos.creditos;
  const videos = datos.videos?.[producto.id] ?? { corto: [], desde_foto: [] };

  return (
    <section aria-labelledby="titulo-videos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-videos" className="text-xl font-bold tracking-tight text-stone-900">
          Tus videos con IA
        </h2>
        <p className="text-base font-semibold tabular-nums text-stone-700">Créditos de video: {formatoNumero(saldoVideo.total)}</p>
      </div>
      <p className="mt-1 text-base leading-snug text-stone-600">
        De {DURACION_VIDEO_SEGUNDOS} segundos, verticales, hechos desde la foto del producto. Sin avatar: tú pones tu voz.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Sello tono="oscuro">
          {MOTOR_VIDEO.nombre} · {MOTOR_VIDEO.modelo}
        </Sello>
        {videoGratis?.incluido && (
          <Sello tono={videoGratis.disponible ? 'ambar' : 'claro'}>
            {videoGratis.disponible ? 'Tienes 1 video corto gratis este mes' : 'Ya usaste tu video gratis del mes'}
          </Sello>
        )}
      </div>

      {!producto.imagen ? (
        <Tarjeta className="mt-3 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-500">
              <IconoFoto className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="min-w-0 text-base leading-snug text-stone-700">
              <strong className="font-semibold text-stone-900">{producto.nombre}</strong> no tiene foto. Los videos salen de la foto que trae TikTok Shop: busca el
              producto en el buscador y guárdalo desde ahí.
            </p>
          </div>
          <Boton variante="suave" icono={Search} className="mt-4 min-h-12" onClick={() => irA('productos', { vista: 'descubrir' })}>
            Ir al buscador
          </Boton>
        </Tarjeta>
      ) : (
        <div key={producto.id} className="mt-3 space-y-6">
          {['corto', 'desde_foto'].map((tipo) => (
            <div key={tipo}>
              <h3 className="text-lg font-bold tracking-tight text-stone-900">{TIPOS_VIDEO[tipo].plural.replace(/^./, (c) => c.toUpperCase())}</h3>
              <p className="text-base text-stone-600">
                {tipo === 'corto'
                  ? 'El producto en uso, como en un video de TikTok.'
                  : 'La foto del producto cobra vida: movimiento de cámara y luz.'}{' '}
                {TIPOS_VIDEO[tipo].costo} créditos de video cada uno.
              </p>
              <ul className="mt-3 space-y-3">
                {Array.from({ length: VIDEOS_POR_TIPO }, (_, i) => (
                  <LugarVideo
                    key={i}
                    producto={producto}
                    tipo={tipo}
                    indice={i + 1}
                    video={videos[tipo]?.[i] ?? null}
                    modo={modo}
                    alCambiarModo={setModo}
                    irA={irA}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

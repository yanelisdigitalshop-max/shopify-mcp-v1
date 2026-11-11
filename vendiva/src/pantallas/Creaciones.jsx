// Lo que la IA escribe para el producto del día, dentro de Hoy:
//   - Los 3 guiones: gratis, ilimitados, de un toque. Sin aviso.
//   - Guion para un en vivo (10 créditos) y 3 respuestas para comentarios
//     (3 créditos): siempre con el aviso antes de crear.

import { useState } from 'react';
import { ChevronDown, MessageSquareText, Radio, Sparkles } from 'lucide-react';
import { CREACIONES, SEGUIDORES_PARA_AFILIADA, formatoNumero } from '../../shared/datos.js';
import { CreditNotice } from '../componentes/CreditNotice.jsx';
import { IlustracionGuion } from '../componentes/Ilustraciones.jsx';
import { LoadingPulse } from '../componentes/LoadingPulse.jsx';
import { BotonCopiar, ScriptCard } from '../componentes/ScriptCard.jsx';
import { AvisoError, Boton, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

/** "hoy a las 3:40 p. m." o "el 9 de noviembre" */
function cuando(iso) {
  const fecha = new Date(iso);
  const esHoy = fecha.toDateString() === new Date().toDateString();
  // Sin el punto final de "p. m." para que la frase no termine en dos puntos seguidos.
  const hora = new Intl.DateTimeFormat('es-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(fecha).replace(/\.$/, '');
  return esHoy
    ? `hoy a las ${hora}`
    : `el ${new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(fecha)}`;
}

// ── Los 3 guiones ──────────────────────────────────────────────────────────────

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

export function SeccionGuiones({ producto, modoPreferido, irA }) {
  const { datos, acciones } = useEstado();
  const [enCurso, setEnCurso] = useState(null); // id del producto para el que se está creando
  const [modo, setModo] = useState(modoPreferido === 'con_camara' ? 'conCamara' : 'sinCamara');
  const crear = useAccion(async (productoId) => {
    setEnCurso(productoId);
    try {
      return await acciones.crearGuiones(productoId);
    } finally {
      setEnCurso(null);
    }
  });

  const creacion = producto ? datos.creaciones[producto.id]?.guiones : null;
  const creandoEste = crear.cargando && enCurso === producto?.id;
  const { guionesUsados, guionesMax } = datos.limites;
  // Plan Gratis: tope de veces por mes. Se muestra el aviso al llegar, o si el servidor frenó.
  const enElTope = (guionesMax != null && guionesUsados >= guionesMax) || (!crear.cargando && crear.error?.codigo === 'LIMITE_GUIONES');
  const errorDeEste = !crear.cargando && crear.error && crear.error.codigo !== 'LIMITE_GUIONES';
  const pie =
    guionesMax == null ? (
      <p className="mt-2 text-center text-base text-stone-600">Gratis e ilimitados. No gastan créditos.</p>
    ) : (
      <p className="mt-2 text-center text-base text-stone-600">
        Gratis: no gastan créditos. Llevas {formatoNumero(guionesUsados)} de {formatoNumero(guionesMax)} este mes.
      </p>
    );
  const tope = (
    <div className="anim-entrar mt-4 rounded-3xl bg-amber-100 p-5 ring-1 ring-inset ring-amber-300/70" role="status">
      <h3 className="text-lg font-bold text-amber-950">Llegaste al límite de guiones gratis de este mes</h3>
      <p className="mt-1 text-base leading-snug text-amber-950/85">
        El plan Gratis incluye {formatoNumero(guionesMax ?? 100)} veces al mes y ya las usaste. El {fechaLarga(datos.creditos.renuevaEl)} vuelve a empezar. Los guiones
        que ya tienes siguen aquí.
      </p>
      <div className="mt-4 space-y-3">
        <Boton onClick={() => irA('planes')}>Subir de plan</Boton>
        <Boton variante="secundario" onClick={() => irA('planes')}>
          Comprar créditos
        </Boton>
      </div>
    </div>
  );

  return (
    <section aria-labelledby="titulo-guiones">
      <h2 id="titulo-guiones" className="text-xl font-bold tracking-tight text-stone-900">
        Tus 3 guiones de hoy
      </h2>

      {!producto ? (
        <Tarjeta className="mt-3 p-5">
          <div className="flex items-center gap-4">
            <IlustracionGuion className="h-16 w-auto shrink-0" />
            <p className="text-base leading-relaxed text-stone-700">Cuando tengas un producto, aquí vas a recibir 3 guiones listos para grabar.</p>
          </div>
        </Tarjeta>
      ) : creandoEste ? (
        <LoadingPulse className="mt-4" texto="Creando tus guiones…" lineas={3} />
      ) : creacion ? (
        <>
          <p className="mt-1 text-base text-stone-600">
            Para <strong className="font-semibold text-stone-900">{producto.nombre}</strong>, creados {cuando(creacion.creadoEn)}.
          </p>
          <div key={creacion.id} className="anim-entrar mt-3 space-y-3">
            {creacion.contenido.guiones.map((guion, i) => (
              <ScriptCard key={i} numero={i + 1} guion={guion} modo={modo} alCambiarModo={setModo} abiertoAlInicio={i === 0} />
            ))}
          </div>
          {errorDeEste && <AvisoError className="mt-3" error={crear.error} alReintentar={crear.reintentar} />}
          {enElTope ? (
            tope
          ) : (
            <>
              <Boton variante="suave" icono={Sparkles} className="mt-4" onClick={() => crear.ejecutar(producto.id)} disabled={crear.cargando}>
                Crear otros 3 guiones
              </Boton>
              {pie}
            </>
          )}
        </>
      ) : (
        <Tarjeta className="mt-3 p-5">
          <div className="flex items-center gap-4">
            <IlustracionGuion className="h-16 w-auto shrink-0" />
            <p className="min-w-0 text-base leading-relaxed text-stone-700">
              3 guiones para <strong className="font-semibold text-stone-900">{producto.nombre}</strong>, cada uno con cámara y sin cámara: gancho, pasos con
              tiempos, texto en pantalla, texto para publicar y hora sugerida.
            </p>
          </div>
          {errorDeEste && <AvisoError className="mt-4" error={crear.error} alReintentar={crear.reintentar} />}
          {enElTope ? (
            tope
          ) : (
            <>
              <Boton icono={Sparkles} className="mt-4" onClick={() => crear.ejecutar(producto.id)} disabled={crear.cargando}>
                Crear mis 3 guiones
              </Boton>
              {pie}
            </>
          )}
        </Tarjeta>
      )}
    </section>
  );
}

// ── Guion de en vivo ───────────────────────────────────────────────────────────

function enVivoComoTexto(c) {
  return [
    c.titulo,
    `Duración: ${c.duracion}`,
    '',
    'ANTES DE EMPEZAR',
    ...c.antesDeEmpezar.map((x) => `- ${x}`),
    '',
    ...c.bloques.flatMap((b) => [`${b.tiempo} · ${b.nombre.toUpperCase()}`, `DICES: ${b.dices}`, `HACES: ${b.haces}`, '']),
    'SI TE PREGUNTAN',
    ...c.preguntasFrecuentes.flatMap((p) => [`- ${p.pregunta}`, `  ${p.respuesta}`]),
    '',
    `CIERRE: ${c.cierre}`,
  ].join('\n');
}

function GuionEnVivo({ contenido: c }) {
  return (
    <div className="space-y-5">
      <div>
        <p className="text-lg font-bold leading-snug text-stone-900">{c.titulo}</p>
        <p className="text-base text-stone-600">{c.duracion}</p>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Antes de empezar</p>
        <ul className="mt-1.5 space-y-1.5">
          {c.antesDeEmpezar.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-base leading-snug text-stone-800">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-700" aria-hidden="true" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <ol className="space-y-4">
        {c.bloques.map((b, i) => (
          <li key={i} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
            <p className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-stone-900 px-2 py-1 text-xs font-bold tabular-nums text-orange-50">{b.tiempo}</span>
              <span className="text-base font-bold text-stone-900">{b.nombre}</span>
            </p>
            <p className="mt-2 text-lg leading-snug text-stone-900">
              <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Dices</span>
              {b.dices}
            </p>
            <p className="mt-1.5 text-base leading-snug text-stone-700">
              <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Haces</span>
              {b.haces}
            </p>
          </li>
        ))}
      </ol>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Si te preguntan</p>
        <dl className="mt-1.5 space-y-3">
          {c.preguntasFrecuentes.map((p, i) => (
            <div key={i}>
              <dt className="text-base font-semibold text-stone-900">{p.pregunta}</dt>
              <dd className="text-base leading-snug text-stone-700">{p.respuesta}</dd>
            </div>
          ))}
        </dl>
      </div>
      <p className="text-base leading-snug text-stone-800">
        <span className="mr-1.5 text-xs font-bold uppercase tracking-[0.1em] text-orange-800">Cierre</span>
        {c.cierre}
      </p>
      <BotonCopiar texto={() => enVivoComoTexto(c)} className="w-full">
        Copiar todo el guion
      </BotonCopiar>
    </div>
  );
}

// ── Respuestas para comentarios ────────────────────────────────────────────────

function RespuestasComentarios({ contenido }) {
  return (
    <div className="space-y-4">
      {contenido.respuestas.map((r, i) => (
        <div key={i} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
          <p className="text-base italic leading-snug text-stone-600">«{r.comentario}»</p>
          <p className="mt-2 text-lg leading-snug text-stone-900">{r.respuesta}</p>
          <BotonCopiar texto={r.respuesta} etiqueta={`Copiar la respuesta ${i + 1}`} className="mt-3 w-full">
            Copiar respuesta
          </BotonCopiar>
        </div>
      ))}
      <p className="text-sm leading-snug text-stone-500">Si una respuesta trae algo [entre corchetes], cámbialo por tu dato antes de pegarla.</p>
    </div>
  );
}

// ── Una creación que cuesta créditos: fila + aviso + resultado ─────────────────

function CreacionDePago({ tipo, icono: Icono, descripcion, textoCreando, nota, producto, crear, Resultado, irA }) {
  const { datos } = useEstado();
  const { nombre, costo } = CREACIONES[tipo];
  const [aviso, setAviso] = useState(false);
  const [verResultado, setVerResultado] = useState(false);
  const accion = useAccion((productoId) => crear(productoId, costo), {
    alExito: () => {
      setAviso(false);
      setVerResultado(true);
    },
  });
  const creacion = datos.creaciones[producto.id]?.[tipo];

  const abrirAviso = () => {
    accion.limpiar();
    setAviso(true);
  };

  return (
    <Tarjeta className="p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-800">
          <Icono className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold leading-snug tracking-tight text-stone-900">{nombre}</h3>
          <p className="mt-0.5 text-base leading-snug text-stone-600">{descripcion}</p>
        </div>
      </div>

      {creacion && (
        <div className="mt-4 border-t border-stone-100 pt-1">
          <button
            type="button"
            onClick={() => setVerResultado((v) => !v)}
            aria-expanded={verResultado}
            className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-1 text-left text-base font-semibold text-orange-800 ${FOCO}`}
          >
            {verResultado ? 'Ocultar' : `Ver lo que creaste ${cuando(creacion.creadoEn)}`}
            <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${verResultado ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {verResultado && (
            <div key={creacion.id} className="anim-entrar pb-1 pt-2">
              <Resultado contenido={creacion.contenido} />
            </div>
          )}
        </div>
      )}

      <Boton variante={creacion ? 'secundario' : 'suave'} className="mt-4 min-h-12" onClick={abrirAviso}>
        {creacion ? 'Crear otro' : 'Crear'} · {costo} créditos
      </Boton>

      <CreditNotice
        abierta={aviso}
        alCerrar={() => setAviso(false)}
        queSeCrea={nombre}
        paraQue={producto.nombre}
        costo={costo}
        saldo={datos.creditos}
        plan={datos.plan}
        nota={nota}
        creando={accion.cargando}
        textoCreando={textoCreando}
        error={accion.error}
        alConfirmar={() => accion.ejecutar(producto.id)}
        irAPlanes={() => {
          setAviso(false);
          irA('planes');
        }}
      />
    </Tarjeta>
  );
}

export function SeccionExtras({ producto, irA }) {
  const { datos, acciones } = useEstado();
  if (!producto) return null;
  const seguidores = datos.perfil.seguidores;

  return (
    <section aria-labelledby="titulo-extras">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="titulo-extras" className="text-xl font-bold tracking-tight text-stone-900">
          Más para este producto
        </h2>
        <p className="text-base font-semibold tabular-nums text-stone-700">Tu saldo: {formatoNumero(datos.creditos.total)} créditos</p>
      </div>
      <p className="mt-1 text-base text-stone-600">Esto sí gasta créditos. Antes de crear te avisamos cuánto.</p>

      {/* key: al cambiar de producto, cada tarjeta empieza cerrada */}
      <div key={producto.id} className="mt-3 space-y-3">
        <CreacionDePago
          tipo="guion_en_vivo"
          icono={Radio}
          descripcion="Qué decir y qué hacer, bloque por bloque, para no quedarte en blanco."
          textoCreando="Escribiendo tu guion para el en vivo…"
          nota={
            seguidores < SEGUIDORES_PARA_AFILIADA
              ? `TikTok pide ${formatoNumero(SEGUIDORES_PARA_AFILIADA)} seguidores para hacer un en vivo y tú escribiste ${formatoNumero(seguidores)}. El guion te sirve para Instagram o Facebook, o para cuando llegues.`
              : null
          }
          producto={producto}
          crear={acciones.crearEnVivo}
          Resultado={GuionEnVivo}
          irA={irA}
        />
        <CreacionDePago
          tipo="respuestas_comentarios"
          icono={MessageSquareText}
          descripcion="Para cuando preguntan el precio, el envío o si les va a servir. Listas para pegar."
          textoCreando="Preparando tus respuestas…"
          producto={producto}
          crear={acciones.crearRespuestas}
          Resultado={RespuestasComentarios}
          irA={irA}
        />
      </div>
    </section>
  );
}

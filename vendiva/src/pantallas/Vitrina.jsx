// Parte 6: Vitrina. Solo plan Pro, sin créditos extra.
// Ella escribe sus estrellas, cuántas reseñas tiene y de qué se quejan (Vendiva no entra
// a su TikTok). Cada calificación queda en su historial y Claude le escribe un plan para
// mantenerla arriba de 4. Si baja de 4, se le avisa aquí y en Hoy.

import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Lock, PencilLine, Sparkles, Star, TriangleAlert } from 'lucide-react';
import { QUEJAS_VITRINA, VITRINA, formatoNumero } from '../../shared/datos.js';
import { LoadingPulse } from '../componentes/LoadingPulse.jsx';
import { BotonCopiar } from '../componentes/ScriptCard.jsx';
import { AreaTexto, AvisoError, Boton, Campo, Hoja, Opcion, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

const coma = (n) => String(n).replace('.', ',');
const fechaDe = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(iso));

/** '4,5' o '4.5' -> 4.5; vacío o raro -> null */
function leerDecimal(texto) {
  const t = texto.trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

function Estrellas({ valor, className = 'h-6 w-6' }) {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${valor >= n - 0.25 ? 'fill-amber-400 text-amber-500' : valor >= n - 0.75 ? 'fill-amber-200 text-amber-500' : 'text-stone-300'}`} />
      ))}
    </span>
  );
}

function Cambio({ cambio }) {
  if (cambio == null || cambio === 0) return cambio === 0 ? <span className="text-base text-stone-600">Igual que la vez anterior</span> : null;
  const sube = cambio > 0;
  const Icono = sube ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-1 text-base font-semibold ${sube ? 'text-emerald-800' : 'text-red-700'}`}>
      <Icono className="h-4 w-4" aria-hidden="true" />
      {sube ? 'Subió' : 'Bajó'} {coma(Math.abs(cambio))} desde la vez anterior
    </span>
  );
}

// ── Formulario: sus estrellas, sus reseñas y de qué se quejan ──────────────────

function Formulario({ anterior, alTerminar }) {
  const { acciones } = useEstado();
  const [estrellas, setEstrellas] = useState(anterior ? coma(anterior.estrellas) : '');
  const [resenas, setResenas] = useState(anterior ? String(anterior.resenas) : '');
  const [quejas, setQuejas] = useState(anterior?.quejas ?? []);
  const [otra, setOtra] = useState('');
  const [errores, setErrores] = useState({});
  const guardar = useAccion((datos) => acciones.guardarVitrina(datos), { alExito: () => alTerminar?.() });

  const enviar = async (e) => {
    e.preventDefault();
    const n = leerDecimal(estrellas);
    const r = /^\d+$/.test(resenas.trim().replace(/[.,\s]/g, '')) ? Number(resenas.trim().replace(/[.,\s]/g, '')) : null;
    const malos = {};
    if (n == null || n < 1 || n > 5) malos.estrellas = 'Escribe tus estrellas de 1 a 5, por ejemplo 4,5.';
    if (r == null) malos.resenas = 'Escribe cuántas reseñas tienes. Si no tienes, pon 0.';
    setErrores(malos);
    if (Object.keys(malos).length) return;
    const res = await guardar.ejecutar({ estrellas: n, resenas: r, quejas, quejaOtra: otra.trim() || null });
    // Si el plan no se pudo escribir, la calificación igual quedó guardada: se trae el estado nuevo.
    if (!res.ok && res.error?.estado >= 500) acciones.refrescar();
  };

  if (guardar.cargando) return <LoadingPulse className="py-4" texto="Guardando tu calificación y escribiendo tu plan…" lineas={3} />;

  const campos = guardar.error?.campos ?? {};
  return (
    <form onSubmit={enviar} noValidate className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <Campo
          etiqueta="Estrellas"
          inputMode="decimal"
          placeholder="4,5"
          value={estrellas}
          onChange={(e) => setEstrellas(e.target.value.replace(/[^\d.,]/g, ''))}
          error={errores.estrellas ?? campos.estrellas}
          maxLength={4}
        />
        <Campo
          etiqueta="Reseñas"
          inputMode="numeric"
          placeholder="0"
          value={resenas}
          onChange={(e) => setResenas(e.target.value.replace(/[^\d.,\s]/g, ''))}
          error={errores.resenas ?? campos.resenas}
        />
      </div>
      <p className="-mt-2 text-base text-stone-600">Cópialos tal como los ves en tu vitrina de TikTok. Vendiva no entra a tu cuenta.</p>

      <fieldset>
        <legend className="mb-2 text-base font-semibold text-stone-800">¿De qué se quejan? Marca las que veas</legend>
        <div className="space-y-2.5">
          {QUEJAS_VITRINA.map((q) => (
            <Opcion
              key={q.id}
              multiple
              activa={quejas.includes(q.id)}
              alElegir={() => setQuejas((v) => (v.includes(q.id) ? v.filter((x) => x !== q.id) : [...v, q.id]))}
              titulo={q.nombre}
            />
          ))}
        </div>
      </fieldset>
      <AreaTexto
        etiqueta="¿Otra queja? (opcional)"
        value={otra}
        onChange={(e) => setOtra(e.target.value)}
        maxLength={300}
        error={campos.quejaOtra}
        placeholder="Por ejemplo: dicen que el color es distinto"
      />

      {guardar.error && !guardar.error.campos && <AvisoError error={guardar.error} />}
      <Boton type="submit" icono={Sparkles}>
        Guardar y crear mi plan
      </Boton>
      <p className="text-center text-base text-stone-600">Incluido en tu plan Pro: no gasta créditos.</p>
    </form>
  );
}

// ── El plan que escribió Claude ────────────────────────────────────────────────

function PlanDeVitrina({ plan }) {
  return (
    <div className="space-y-5">
      <p className="text-lg leading-snug text-stone-900">{plan.resumen}</p>
      <ol className="space-y-3">
        {plan.prioridades.map((p, i) => (
          <li key={i} className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
            <p className="flex items-start gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-700 text-sm font-bold text-white" aria-hidden="true">
                {i + 1}
              </span>
              <span className="text-lg font-bold leading-snug text-stone-900">{p.titulo}</span>
            </p>
            <p className="mt-1.5 text-base leading-snug text-stone-700">{p.porque}</p>
            <ul className="mt-2 space-y-1.5">
              {p.pasos.map((paso, j) => (
                <li key={j} className="flex gap-2.5 text-base leading-snug text-stone-800">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-700" aria-hidden="true" />
                  {paso}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <div className="rounded-2xl bg-amber-100/70 p-4">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-amber-900">Para responder · {plan.respuestaResena.cuando}</p>
        <p className="mt-1.5 text-lg leading-snug text-stone-900">{plan.respuestaResena.texto}</p>
        <BotonCopiar texto={plan.respuestaResena.texto} className="mt-3 w-full">
          Copiar respuesta
        </BotonCopiar>
      </div>
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Qué evitar</p>
        <ul className="mt-1.5 space-y-1.5">
          {plan.queEvitar.map((x, i) => (
            <li key={i} className="flex gap-2.5 text-base leading-snug text-stone-800">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-red-700" aria-hidden="true" />
              {x}
            </li>
          ))}
        </ul>
      </div>
      <p className="flex items-start gap-3 text-base leading-snug text-stone-700">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
        {plan.proximaRevision}
      </p>
    </div>
  );
}

function SinPlan({ calificacionId }) {
  const { acciones } = useEstado();
  const pedir = useAccion(() => acciones.reintentarPlanVitrina(calificacionId));
  if (pedir.cargando) return <LoadingPulse texto="Escribiendo tu plan…" lineas={3} />;
  return (
    <div>
      <p className="text-base leading-snug text-stone-700">Tu calificación quedó guardada, pero tu plan no se pudo escribir.</p>
      {pedir.error && <AvisoError className="mt-3" error={pedir.error} />}
      <Boton icono={Sparkles} className="mt-3" onClick={() => pedir.ejecutar()}>
        Crear mi plan
      </Boton>
    </div>
  );
}

// ── Avisos ─────────────────────────────────────────────────────────────────────

function AvisoBajo({ ultima, minimo }) {
  return (
    <div className="anim-entrar flex items-start gap-3 rounded-3xl bg-red-50 p-4 ring-1 ring-inset ring-red-200" role="alert">
      <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-red-700" aria-hidden="true" />
      <p className="text-base leading-snug text-red-950">
        <strong className="font-bold">Tu vitrina está en {coma(ultima.estrellas)} estrellas, debajo de {minimo}.</strong> Empieza por lo primero de tu plan.
      </p>
    </div>
  );
}

function SoloPro({ irA, conObjetivo }) {
  return (
    <Tarjeta className="mt-5 p-5">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
          <Lock className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h2 className="text-lg font-bold leading-snug text-stone-900">La Vitrina es del plan Pro</h2>
          <p className="mt-1 text-base leading-snug text-stone-700">
            {conObjetivo ? 'Tu objetivo es subir la calificación de tu vitrina. ' : ''}
            Con Pro escribes la calificación que ves en TikTok y recibes un plan para mantenerla arriba de {VITRINA.minimoEstrellas} estrellas, sin gastar créditos.
          </p>
        </div>
      </div>
      <Boton className="mt-4" onClick={() => irA('planes')}>
        Subir de plan
      </Boton>
    </Tarjeta>
  );
}

/** Para Hoy: Pro debajo de 4, o el objetivo de la vitrina sin ser Pro. */
export function AvisoVitrinaHoy({ irA }) {
  const { datos } = useEstado();
  const { vitrina, perfil } = datos;
  if (vitrina.disponible) {
    if (!vitrina.bajoDelMinimo) return null;
    return (
      <div className="space-y-3">
        <AvisoBajo ultima={vitrina.ultima} minimo={vitrina.minimo} />
        <Boton variante="secundario" className="min-h-12" onClick={() => irA('vitrina')}>
          Ver mi plan de vitrina
        </Boton>
      </div>
    );
  }
  if (perfil.objetivo !== 'subir_vitrina') return null;
  return (
    <div className="flex items-start gap-3 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
      <Lock className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-base leading-snug text-stone-700">
          Tu objetivo es subir tu vitrina. La <strong className="font-semibold text-stone-900">Vitrina</strong> es del plan Pro.
        </p>
        <Boton variante="suave" className="mt-3 min-h-12" onClick={() => irA('planes')}>
          Subir de plan
        </Boton>
      </div>
    </div>
  );
}

// ── La pantalla ────────────────────────────────────────────────────────────────

export function Vitrina({ irA }) {
  const { datos } = useEstado();
  const { vitrina, perfil } = datos;
  const [actualizar, setActualizar] = useState(false);
  useEffect(() => setActualizar(false), [vitrina.ultima?.id]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Vitrina</h1>
      <p className="mt-1 text-base text-stone-600">Cuida la calificación de tu vitrina de TikTok y mantenla arriba de {VITRINA.minimoEstrellas} estrellas.</p>

      {!vitrina.disponible ? (
        <SoloPro irA={irA} conObjetivo={perfil.objetivo === 'subir_vitrina'} />
      ) : !vitrina.ultima ? (
        <Tarjeta className="mt-5 p-5 md:p-6">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">Escribe tu calificación de hoy</h2>
          <p className="mt-1 mb-4 text-base text-stone-600">Con esto te escribimos un plan a tu medida.</p>
          <Formulario />
        </Tarjeta>
      ) : (
        <div className="mt-5 space-y-6">
          {vitrina.bajoDelMinimo && <AvisoBajo ultima={vitrina.ultima} minimo={vitrina.minimo} />}

          <Tarjeta className="p-5 md:p-6">
            <p className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">Tu calificación · {fechaDe(vitrina.ultima.creadoEn)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="text-5xl font-extrabold tracking-tight tabular-nums text-stone-900">{coma(vitrina.ultima.estrellas)}</span>
              <div>
                <Estrellas valor={vitrina.ultima.estrellas} />
                <p className="text-base text-stone-600">
                  {formatoNumero(vitrina.ultima.resenas)} {vitrina.ultima.resenas === 1 ? 'reseña' : 'reseñas'}
                </p>
              </div>
            </div>
            <div className="mt-2">
              <Cambio cambio={vitrina.cambio} />
            </div>
            <Boton variante="secundario" icono={PencilLine} className="mt-4 min-h-12" onClick={() => setActualizar(true)}>
              Actualizar mi calificación
            </Boton>
          </Tarjeta>

          <section aria-labelledby="titulo-plan-vitrina">
            <h2 id="titulo-plan-vitrina" className="text-xl font-bold tracking-tight text-stone-900">
              Tu plan
            </h2>
            <Tarjeta className="mt-3 p-5 md:p-6">
              {vitrina.ultima.plan ? <PlanDeVitrina key={vitrina.ultima.id} plan={vitrina.ultima.plan} /> : <SinPlan calificacionId={vitrina.ultima.id} />}
            </Tarjeta>
            <p className="mt-2 text-base text-stone-600">Lo escribió la IA con lo que tú anotaste. Cada vez que actualizas tu calificación, recibes un plan nuevo.</p>
          </section>

          {vitrina.historial.length > 1 && (
            <section aria-labelledby="titulo-historial-vitrina">
              <h2 id="titulo-historial-vitrina" className="text-xl font-bold tracking-tight text-stone-900">
                Cómo ha ido
              </h2>
              <Tarjeta className="mt-3 divide-y divide-stone-100 px-5">
                {vitrina.historial.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-4 py-3">
                    <p className="text-base text-stone-700">{fechaDe(c.creadoEn)}</p>
                    <p className="flex items-center gap-2">
                      <Estrellas valor={c.estrellas} className="h-4 w-4" />
                      <span className={`text-lg font-bold tabular-nums ${c.estrellas < vitrina.minimo ? 'text-red-700' : 'text-stone-900'}`}>{coma(c.estrellas)}</span>
                      <span className="text-sm tabular-nums text-stone-500">({formatoNumero(c.resenas)})</span>
                    </p>
                  </div>
                ))}
              </Tarjeta>
            </section>
          )}
        </div>
      )}

      {vitrina.disponible && vitrina.ultima && (
        <Hoja abierta={actualizar} alCerrar={() => setActualizar(false)} titulo="Actualizar mi calificación">
          <Formulario anterior={vitrina.ultima} alTerminar={() => setActualizar(false)} />
        </Hoja>
      )}
    </div>
  );
}

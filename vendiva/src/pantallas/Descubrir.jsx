// "Descubre qué vender" (buscador) y tendencias de la semana.
// Vendiva no ve el catálogo de TikTok Shop: las ideas se presentan como ideas para
// buscar allá, y las tendencias muestran de dónde salió cada una.

import { useEffect, useState } from 'react';
import { BadgePercent, Check, ExternalLink, Gift, Lightbulb, Lock, Search, TrendingUp, Video } from 'lucide-react';
import { formatoNumero } from '../../shared/datos.js';
import { LoadingPulse } from '../componentes/LoadingPulse.jsx';
import { BotonCopiar } from '../componentes/ScriptCard.jsx';
import { AvisoError, Boton, Campo, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}
const fechaDe = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(iso));

function Bloque({ icono: Icono, titulo, children }) {
  return (
    <div className="flex gap-3">
      <Icono className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{titulo}</p>
        <div className="mt-0.5 text-base leading-snug text-stone-800">{children}</div>
      </div>
    </div>
  );
}

// ── Una idea del buscador ──────────────────────────────────────────────────────

function IdeaCard({ numero, idea, busquedaId, productoId, irA }) {
  const { datos, acciones } = useEstado();
  const guardar = useAccion(() => acciones.guardarIdea(busquedaId, numero - 1));
  const guardada = Boolean(productoId);
  const sinLugar = !guardada && !datos.limites.puedeAgregarProducto;

  return (
    <article className="sombra-tarjeta min-w-0 rounded-3xl bg-white p-5 ring-1 ring-stone-900/5">
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-700 text-base font-bold text-white" aria-hidden="true">
          {numero}
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-bold leading-snug tracking-tight text-stone-900">{idea.producto}</h3>
          <p className="mt-1 text-base leading-snug text-stone-700">{idea.porQueVende}</p>
        </div>
      </div>

      <div className="mt-4 space-y-3.5">
        <Bloque icono={BadgePercent} titulo="Comisión a buscar">
          {idea.comisionABuscar}
        </Bloque>
        <Bloque icono={Gift} titulo="Muestra gratis">
          {idea.muestraGratis}
        </Bloque>
        <Bloque icono={Search} titulo="Escribe esto en TikTok Shop">
          <ul className="mt-1.5 flex flex-wrap gap-2">
            {idea.palabrasParaBuscar.map((p) => (
              <li key={p}>
                <BotonCopiar texto={p} etiqueta={`Copiar «${p}»`} className="min-h-10 px-3 text-[15px]">
                  {p}
                </BotonCopiar>
              </li>
            ))}
          </ul>
        </Bloque>
        <Bloque icono={Video} titulo="Idea de video">
          {idea.ideaDeVideo}
        </Bloque>
      </div>

      <div className="mt-5 space-y-3 border-t border-stone-100 pt-4">
        {guardada ? (
          <>
            <p className="flex items-center gap-2 text-base font-semibold text-amber-900">
              <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
              Guardado en tus productos
            </p>
            <Boton icono={Video} onClick={() => irA('hoy', { productoId })}>
              Crear su video
            </Boton>
          </>
        ) : sinLugar ? (
          <div className="rounded-2xl bg-amber-100 p-4 text-base leading-snug text-amber-950">
            Ya tienes {datos.limites.productosMax} productos, el máximo del plan {datos.plan.nombre}. Borra uno o sube de plan para guardar este.
            <Boton variante="secundario" className="mt-3 min-h-12" onClick={() => irA('planes')}>
              Ver los planes
            </Boton>
          </div>
        ) : (
          <>
            {guardar.error && <AvisoError error={guardar.error} alReintentar={guardar.reintentar} reintentando={guardar.cargando} />}
            <Boton variante="suave" onClick={() => guardar.ejecutar()} cargando={guardar.cargando} textoCargando="Guardando…">
              Guardar en mis productos
            </Boton>
          </>
        )}
      </div>
    </article>
  );
}

// ── Buscador ───────────────────────────────────────────────────────────────────

export function BuscadorProductos({ irA }) {
  const { datos, acciones } = useEstado();
  const { busquedasUsadas, busquedasMax } = datos.limites;
  const [nicho, setNicho] = useState(datos.perfil.nicho ?? '');
  const buscar = useAccion(acciones.buscar);
  const ultima = datos.buscador.ultima;

  const sinBusquedas = (busquedasMax != null && busquedasUsadas >= busquedasMax) || buscar.error?.codigo === 'LIMITE_BUSQUEDAS';
  const quedan = busquedasMax == null ? null : Math.max(0, busquedasMax - busquedasUsadas);
  const errorVisible = buscar.error && buscar.error.codigo !== 'LIMITE_BUSQUEDAS';

  const enviar = (e) => {
    e.preventDefault();
    if (nicho.trim().length >= 2) buscar.ejecutar(nicho);
  };

  return (
    <section aria-labelledby="titulo-buscador">
      <h2 id="titulo-buscador" className="text-xl font-bold tracking-tight text-stone-900">
        Descubre qué vender
      </h2>
      <p className="mt-1 text-base leading-snug text-stone-600">Escribe tu nicho y te damos 5 ideas de productos para buscar en TikTok Shop, con la comisión que conviene buscar y cómo pedir la muestra gratis.</p>

      <Tarjeta className="mt-3 p-5">
        {sinBusquedas ? (
          <div role="status">
            <h3 className="text-lg font-bold text-stone-900">Ya usaste tus {formatoNumero(busquedasMax ?? 10)} búsquedas de este mes</h3>
            <p className="mt-1 text-base leading-snug text-stone-700">
              El {fechaLarga(datos.creditos.renuevaEl)} vuelven a empezar. En los planes de pago el buscador no tiene límite.
            </p>
            <Boton className="mt-4" onClick={() => irA('planes')}>
              Subir de plan
            </Boton>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate>
            <Campo
              etiqueta="¿Qué quieres vender?"
              placeholder="Por ejemplo: cuidado del cabello"
              value={nicho}
              onChange={(e) => setNicho(e.target.value)}
              error={buscar.error?.campos?.nicho}
              maxLength={60}
            />
            {errorVisible && !buscar.error.campos && <AvisoError className="mt-4" error={buscar.error} alReintentar={buscar.reintentar} reintentando={buscar.cargando} />}
            <Boton type="submit" icono={Search} className="mt-4" disabled={buscar.cargando || nicho.trim().length < 2}>
              Buscar productos
            </Boton>
            <p className="mt-2 text-center text-base text-stone-600">
              {quedan == null ? 'Búsquedas sin límite. No gastan créditos.' : `Te ${quedan === 1 ? 'queda' : 'quedan'} ${quedan} de ${busquedasMax} búsquedas este mes. No gastan créditos.`}
            </p>
          </form>
        )}
      </Tarjeta>

      {buscar.cargando ? (
        <LoadingPulse className="mt-5" texto="Buscando productos con muestra gratis…" lineas={3} />
      ) : (
        ultima && (
          <div key={ultima.id} className="anim-entrar mt-5">
            <p className="text-base text-stone-600">
              Ideas para <strong className="font-semibold text-stone-900">{ultima.nicho}</strong>, del {fechaDe(ultima.creadoEn)}.
            </p>
            <p className="mt-3 flex items-start gap-3 rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
              <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <span>
                Son ideas para buscar, no productos de TikTok Shop: Vendiva no ve su catálogo. Al encontrar el producto, confirma ahí su comisión y si ofrece muestra
                gratis.
              </span>
            </p>
            <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-4">
              {ultima.ideas.map((idea, i) => (
                <IdeaCard key={i} numero={i + 1} idea={idea} busquedaId={ultima.id} productoId={ultima.guardados[i]} irA={irA} />
              ))}
            </div>
            {ultima.consejo && <p className="mt-4 rounded-2xl bg-amber-100/70 p-4 text-base leading-snug text-stone-800">{ultima.consejo}</p>}
          </div>
        )
      )}
    </section>
  );
}

// ── Tendencias de la semana ────────────────────────────────────────────────────

export function TendenciasSemana({ irA }) {
  const { datos, acciones } = useEstado();
  const { tendencias } = datos;
  const crear = useAccion(acciones.crearTendencias);

  return (
    <section aria-labelledby="titulo-tendencias">
      <h2 id="titulo-tendencias" className="flex items-center gap-2 text-xl font-bold tracking-tight text-stone-900">
        <TrendingUp className="h-5 w-5 text-orange-800" aria-hidden="true" />
        Tendencias de la semana
      </h2>

      {!tendencias.disponible ? (
        <Tarjeta className="mt-3 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-stone-100 text-stone-600">
              <Lock className="h-6 w-6" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h3 className="text-lg font-bold leading-snug text-stone-900">Las tendencias son de los planes de pago</h3>
              <p className="mt-1 text-base leading-snug text-stone-700">
                Cada semana buscamos en la web qué se está moviendo en TikTok Shop y te lo resumimos, con su fuente. Está en Esencial, Crecimiento y Pro.
              </p>
            </div>
          </div>
          <Boton className="mt-4" onClick={() => irA('planes')}>
            Subir de plan
          </Boton>
        </Tarjeta>
      ) : crear.cargando ? (
        <LoadingPulse className="mt-4" texto="Buscando las tendencias de la semana…" lineas={3} />
      ) : !tendencias.reporte ? (
        <Tarjeta className="mt-3 p-5">
          <p className="text-base leading-snug text-stone-700">
            Buscamos en la web qué se está moviendo esta semana en TikTok Shop, con preferencia por tu nicho, y te lo resumimos con su fuente. Uno por semana; no gasta
            créditos.
          </p>
          {crear.error && <AvisoError className="mt-4" error={crear.error} alReintentar={crear.reintentar} />}
          <Boton icono={TrendingUp} className="mt-4" onClick={() => crear.ejecutar()}>
            Ver las tendencias de esta semana
          </Boton>
        </Tarjeta>
      ) : (
        <div key={tendencias.reporte.id} className="anim-entrar mt-3 space-y-3">
          <p className="text-base leading-snug text-stone-700">{tendencias.reporte.resumen}</p>
          {tendencias.reporte.tendencias.map((t, i) => (
            <article key={i} className="sombra-tarjeta min-w-0 rounded-3xl bg-white p-5 ring-1 ring-stone-900/5">
              <h3 className="text-lg font-bold leading-snug tracking-tight text-stone-900">{t.nombre}</h3>
              <p className="mt-1 text-base leading-snug text-stone-700">{t.queEs}</p>
              <div className="mt-3 space-y-3">
                <Bloque icono={TrendingUp} titulo="Por qué está en tendencia">
                  {t.porQue}
                </Bloque>
                <Bloque icono={Video} titulo="Idea de video">
                  {t.ideaDeVideo}
                </Bloque>
              </div>
              <a
                href={t.fuente}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 flex min-h-11 items-center gap-2 rounded-xl text-base font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
              >
                <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">Fuente: {t.fuenteTitulo || new URL(t.fuente).hostname}</span>
              </a>
            </article>
          ))}
          <p className="text-sm leading-snug text-stone-500">
            Reporte del {fechaDe(tendencias.reporte.creadoEn)}, hecho con una búsqueda web. Las tendencias cambian rápido: antes de grabar, búscalas también en TikTok Shop.
          </p>
        </div>
      )}
    </section>
  );
}

/** Al llegar desde otra parte de la app con una vista pedida, se respeta. */
export function useVistaInicial(foco, porDefecto) {
  const [vista, setVista] = useState(foco?.vista ?? porDefecto);
  useEffect(() => {
    if (foco?.vista) setVista(foco.vista);
  }, [foco]);
  return [vista, setVista];
}

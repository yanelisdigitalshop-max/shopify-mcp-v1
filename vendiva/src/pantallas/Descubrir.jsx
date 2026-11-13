// "Descubre qué vender" (buscador) y tendencias de la semana, con datos de FastMoss.
// Las cifras de FastMoss son estimadas, y la muestra gratis no la confirma FastMoss:
// las dos cosas se dicen en pantalla.

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Gift, Info, Lock, Search, Store, TrendingUp, Video } from 'lucide-react';
import { LIMITES_GRATIS, formatoNumero } from '../../shared/datos.js';
import { LoadingPulse } from '../componentes/LoadingPulse.jsx';
import { AvisoError, Boton, Campo, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}
const fechaDe = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(iso));

/** Lunes y domingo de una semana ISO 'AAAA-SS'. */
function diasDeSemana(semana) {
  const [a, n] = semana.replace('-W', '-').split('-').map(Number);
  const cuatro = new Date(Date.UTC(a, 0, 4));
  const lunes = new Date(cuatro);
  lunes.setUTCDate(cuatro.getUTCDate() - ((cuatro.getUTCDay() || 7) - 1) + (n - 1) * 7);
  const domingo = new Date(lunes);
  domingo.setUTCDate(lunes.getUTCDate() + 6);
  const f = (d) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return `del ${f(lunes)} al ${f(domingo)}`;
}

const cifra = (n) => (n == null ? '—' : formatoNumero(n));

function Foto({ src, titulo }) {
  const [rota, setRota] = useState(false);
  if (!src || rota) {
    return (
      <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-2xl font-bold text-orange-900" aria-hidden="true">
        {titulo.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setRota(true)} className="h-20 w-20 shrink-0 rounded-2xl bg-stone-100 object-cover" />;
}

function Dato({ etiqueta, valor }) {
  return (
    <div className="min-w-0 rounded-xl bg-stone-50 px-3 py-2 ring-1 ring-inset ring-stone-200/70">
      <dt className="text-xs font-bold uppercase tracking-[0.08em] text-stone-500">{etiqueta}</dt>
      <dd className="mt-0.5 truncate text-base font-bold tabular-nums text-stone-900">{valor}</dd>
    </div>
  );
}

function EnlaceTikTok({ href }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex min-h-11 items-center gap-2 rounded-xl text-base font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
    >
      <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
      Ver en TikTok Shop
    </a>
  );
}

// ── Un producto del buscador ───────────────────────────────────────────────────

function ProductoEncontrado({ numero, producto: p, busquedaId, productoId, irA }) {
  const { datos, acciones } = useEstado();
  const guardar = useAccion(() => acciones.guardarProducto(busquedaId, numero - 1));
  const guardado = Boolean(productoId);
  const sinLugar = !guardado && !datos.limites.puedeAgregarProducto;

  return (
    <article className="sombra-tarjeta min-w-0 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
      <div className="flex items-start gap-3.5">
        <Foto src={p.imagen} titulo={p.titulo} />
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-3 break-words text-base font-bold leading-snug text-stone-900">{p.titulo}</h3>
          {p.tienda && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-600">
              <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{p.tienda}</span>
            </p>
          )}
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        <Dato etiqueta="Precio" valor={p.precio ?? '—'} />
        <Dato etiqueta="Comisión" valor={p.comisionPct == null ? '—' : `${p.comisionPct}%`} />
        <Dato etiqueta="Ventas 7 días" valor={cifra(p.ventas7Dias)} />
        <Dato etiqueta="Ventas totales" valor={cifra(p.ventasTotales)} />
      </dl>

      <div className="mt-3">
        <EnlaceTikTok href={p.enlace} />
      </div>

      <div className="mt-2 space-y-3 border-t border-stone-100 pt-4">
        {guardado ? (
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

function AvisoCifras() {
  return (
    <div className="space-y-2.5 rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
      <p className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
        <span>Las ventas, precios y comisiones son cifras estimadas de FastMoss, no exactas. Pueden cambiar.</span>
      </p>
      <p className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
        <span>
          <strong className="font-semibold text-stone-900">La muestra gratis no la confirma FastMoss.</strong> Ábrelo en TikTok Shop y mira ahí si la marca ofrece muestra
          gratis para creadoras; la pides dentro de TikTok Shop y la marca decide.
        </span>
      </p>
    </div>
  );
}

// ── Buscador ───────────────────────────────────────────────────────────────────

export function BuscadorProductos({ irA }) {
  const { datos, acciones } = useEstado();
  const { busquedasUsadas, busquedasMax } = datos.limites;
  const ultima = datos.buscador.ultima;
  const [consulta, setConsulta] = useState(ultima?.consulta ?? datos.perfil.nicho ?? '');
  const buscar = useAccion(acciones.buscar);

  const sinBusquedas = (busquedasMax != null && busquedasUsadas >= busquedasMax) || buscar.error?.codigo === 'LIMITE_BUSQUEDAS';
  const quedan = busquedasMax == null ? null : Math.max(0, busquedasMax - busquedasUsadas);
  const errorVisible = buscar.error && buscar.error.codigo !== 'LIMITE_BUSQUEDAS' && !buscar.error.campos;

  const enviar = (e) => {
    e.preventDefault();
    if (consulta.trim().length >= 2) buscar.ejecutar(consulta);
  };

  return (
    <section aria-labelledby="titulo-buscador">
      <h2 id="titulo-buscador" className="text-xl font-bold tracking-tight text-stone-900">
        Descubre qué vender
      </h2>
      <p className="mt-1 text-base leading-snug text-stone-600">Busca productos reales de TikTok Shop en Estados Unidos, con su precio, sus ventas y su comisión.</p>

      <Tarjeta className="mt-3 p-5">
        {sinBusquedas ? (
          <div role="status">
            <h3 className="text-lg font-bold text-stone-900">Ya usaste tus {formatoNumero(busquedasMax ?? LIMITES_GRATIS.busquedasMes)} búsquedas de este mes</h3>
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
              etiqueta="¿Qué producto buscas?"
              placeholder="Por ejemplo: hair brush, cepillo"
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              error={buscar.error?.campos?.consulta}
              ayuda="Funciona mejor en inglés, como se buscan en TikTok Shop de EE. UU."
              maxLength={60}
            />
            {errorVisible && <AvisoError className="mt-4" error={buscar.error} alReintentar={buscar.reintentar} reintentando={buscar.cargando} />}
            <Boton type="submit" icono={Search} className="mt-4" disabled={buscar.cargando || consulta.trim().length < 2}>
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
          <div key={ultima.id} className="anim-entrar mt-5 space-y-3">
            <p className="text-base text-stone-600">
              {ultima.productos.length ? `${ultima.productos.length} productos` : 'Ningún producto'} para{' '}
              <strong className="font-semibold text-stone-900">«{ultima.consulta}»</strong>, del {fechaDe(ultima.creadoEn)}.
              {ultima.productos.length ? ' Los más vendidos en 7 días primero.' : ''}
            </p>
            {ultima.productos.length === 0 ? (
              <p className="rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
                No encontramos productos con esas palabras. Prueba con otras, por ejemplo en inglés. Esta búsqueda no te quitó ninguna de tus búsquedas del mes.
              </p>
            ) : (
              <>
                <AvisoCifras />
                <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-4">
                  {ultima.productos.map((p, i) => (
                    <ProductoEncontrado key={`${p.id}-${i}`} numero={i + 1} producto={p} busquedaId={ultima.id} productoId={ultima.guardados[i]} irA={irA} />
                  ))}
                </div>
              </>
            )}
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
              <p className="mt-1 text-base leading-snug text-stone-700">Están en los planes Esencial, Crecimiento y Pro.</p>
            </div>
          </div>
          <Boton className="mt-4" onClick={() => irA('planes')}>
            Subir de plan
          </Boton>
        </Tarjeta>
      ) : crear.cargando ? (
        <LoadingPulse className="mt-4" texto="Buscando los más vendidos de la semana…" lineas={3} />
      ) : !tendencias.reporte ? (
        <Tarjeta className="mt-3 p-5">
          <p className="text-base leading-snug text-stone-700">Los 10 productos más vendidos de la semana pasada en TikTok Shop de Estados Unidos, según FastMoss. Se actualiza una vez por semana.</p>
          {crear.error && <AvisoError className="mt-4" error={crear.error} alReintentar={crear.reintentar} />}
          <Boton icono={TrendingUp} className="mt-4" onClick={() => crear.ejecutar()}>
            Ver las tendencias de esta semana
          </Boton>
        </Tarjeta>
      ) : (
        <div key={tendencias.reporte.id} className="anim-entrar mt-3 space-y-3">
          <p className="text-base leading-snug text-stone-700">
            Los más vendidos en TikTok Shop de Estados Unidos, semana {diasDeSemana(tendencias.reporte.semanaDatos)}, según FastMoss. Cifras estimadas, no exactas.
          </p>
          <ol className="space-y-3">
            {tendencias.reporte.productos.map((p, i) => (
              <li key={`${p.id}-${i}`} className="sombra-tarjeta min-w-0 rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
                <div className="flex items-start gap-3.5">
                  <div className="relative shrink-0">
                    <Foto src={p.imagen} titulo={p.titulo} />
                    <span className="absolute -left-1.5 -top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-orange-50">
                      {i + 1}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="line-clamp-3 break-words text-base font-bold leading-snug text-stone-900">{p.titulo}</h3>
                    {p.tienda && (
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-stone-600">
                        <Store className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{p.tienda}</span>
                      </p>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  <Dato etiqueta="Precio" valor={p.precio ?? '—'} />
                  <Dato etiqueta="Ventas semana" valor={cifra(p.ventasSemana)} />
                </dl>
                <div className="mt-2">
                  <EnlaceTikTok href={p.enlace} />
                </div>
              </li>
            ))}
          </ol>
          <p className="text-sm leading-snug text-stone-500">
            Consultado el {fechaDe(tendencias.reporte.creadoEn)}. La muestra gratis y la comisión de cada producto se confirman dentro de TikTok Shop.
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

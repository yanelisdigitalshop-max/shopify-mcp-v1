// Piezas básicas: botón, campos, aviso de error, hoja (panel que sube) y opciones.
// Todo grande y con buen contraste: muchas usuarias son personas mayores.

import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, RefreshCw, TriangleAlert, WifiOff, X } from 'lucide-react';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

const BOTONES = {
  primario:
    'bg-orange-700 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.22),0_8px_18px_-8px_rgba(154,52,18,0.7)] hover:bg-orange-800 disabled:bg-orange-300 disabled:shadow-none',
  secundario: 'bg-white text-stone-800 ring-1 ring-inset ring-stone-300 hover:bg-stone-50 disabled:text-stone-400',
  suave: 'bg-orange-100 text-orange-900 hover:bg-orange-200 disabled:text-orange-300',
  oscuro: 'bg-white/10 text-white ring-1 ring-inset ring-white/20 hover:bg-white/20',
  peligro: 'bg-red-700 text-white hover:bg-red-800 disabled:bg-red-300',
  texto: 'text-orange-800 hover:bg-orange-100 disabled:text-stone-400',
};

export function Puntos() {
  return (
    <span className="inline-flex items-center gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="anim-punto h-1.5 w-1.5 rounded-full bg-current" style={{ animationDelay: `${i * 0.16}s` }} />
      ))}
    </span>
  );
}

export function Boton({
  variante = 'primario',
  cargando = false,
  textoCargando,
  icono: Icono,
  angosto = false,
  className = '',
  type = 'button',
  disabled,
  children,
  ...resto
}) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex min-h-14 items-center justify-center gap-2.5 rounded-2xl px-5 text-lg font-semibold tracking-tight transition duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${
        angosto ? '' : 'w-full'
      } ${FOCO} ${BOTONES[variante]} ${className}`}
      {...resto}
    >
      {cargando ? (
        <>
          <Puntos />
          <span>{textoCargando ?? children}</span>
        </>
      ) : (
        <>
          {Icono && <Icono className="h-5 w-5 shrink-0" strokeWidth={2.25} aria-hidden="true" />}
          <span>{children}</span>
        </>
      )}
    </button>
  );
}

const CAJA =
  'block w-full rounded-2xl border-0 bg-white px-4 text-lg text-stone-900 ring-1 ring-inset placeholder:text-stone-400 transition focus:outline-none focus:ring-2 focus:ring-inset focus:ring-orange-600';

/** Campo de texto con etiqueta grande, ayuda y mensaje de error por campo. */
export function Campo({ etiqueta, ayuda, error, antes, despues, className = '', id: idDado, ...resto }) {
  const propio = useId();
  const id = idDado ?? propio;
  const descrito = error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-base font-semibold text-stone-800">
        {etiqueta}
      </label>
      <div className="relative">
        {antes && (
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-lg font-semibold text-stone-500">
            {antes}
          </span>
        )}
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={descrito}
          className={`${CAJA} h-14 ${antes ? 'pl-9' : ''} ${despues ? 'pr-14' : ''} ${error ? 'ring-red-500' : 'ring-stone-300'}`}
          {...resto}
        />
        {despues && <span className="absolute inset-y-0 right-0 flex items-center pr-1.5">{despues}</span>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-base font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="mt-1.5 text-base text-stone-600">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export function AreaTexto({ etiqueta, ayuda, error, className = '', ...resto }) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-base font-semibold text-stone-800">
        {etiqueta}
      </label>
      <textarea
        id={id}
        rows={3}
        aria-invalid={error ? true : undefined}
        className={`${CAJA} resize-none py-3 leading-snug ${error ? 'ring-red-500' : 'ring-stone-300'}`}
        {...resto}
      />
      {error ? (
        <p className="mt-1.5 text-base font-medium text-red-700" role="alert">
          {error}
        </p>
      ) : ayuda ? (
        <p className="mt-1.5 text-base text-stone-600">{ayuda}</p>
      ) : null}
    </div>
  );
}

/**
 * Mensaje amable cuando algo falla. Si el problema es de red o del servidor,
 * ofrece "Reintentar" con los mismos datos, sin hacerla escribir de nuevo.
 */
export function AvisoError({ error, alReintentar, reintentando = false, className = '' }) {
  if (!error) return null;
  const deRed = error.codigo === 'SIN_CONEXION';
  const Icono = deRed ? WifiOff : TriangleAlert;
  return (
    <div role="alert" className={`anim-entrar rounded-2xl bg-red-50 p-4 ring-1 ring-inset ring-red-200 ${className}`}>
      <div className="flex gap-3">
        <Icono className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden="true" />
        <p className="text-base font-medium leading-snug text-red-900">{error.message}</p>
      </div>
      {alReintentar && error.reintentable && (
        <Boton variante="secundario" icono={RefreshCw} className="mt-3 min-h-12" onClick={alReintentar} cargando={reintentando} textoCargando="Reintentando…">
          Reintentar
        </Boton>
      )}
    </div>
  );
}

/** Panel que sube desde abajo en el teléfono y se centra en pantallas grandes. */
export function Hoja({ abierta, alCerrar, titulo, children }) {
  const panel = useRef(null);
  const cerrar = useRef(alCerrar);
  cerrar.current = alCerrar;

  useEffect(() => {
    if (!abierta) return undefined;
    const anterior = document.activeElement;
    const alTeclear = (e) => {
      if (e.key === 'Escape') cerrar.current?.();
    };
    document.addEventListener('keydown', alTeclear);
    const desborde = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.body.style.overflow = desborde;
      if (anterior instanceof HTMLElement) anterior.focus({ preventScroll: true });
    };
  }, [abierta]);

  if (!abierta) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
      <div className="anim-aparecer absolute inset-0 bg-stone-900/45" onClick={alCerrar} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        className="anim-hoja sombra-flotante relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-orange-50 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 outline-none md:rounded-3xl md:pt-5"
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-stone-300 md:hidden" aria-hidden="true" />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-2xl font-bold leading-tight tracking-tight text-stone-900">{titulo}</h2>
          <button
            type="button"
            onClick={alCerrar}
            aria-label="Cerrar"
            className={`-mr-1 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-stone-600 hover:bg-stone-200/70 ${FOCO}`}
          >
            <X className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Opción grande para elegir una entre varias (o varias, con `multiple`). */
export function Opcion({ activa, alElegir, titulo, detalle, icono: Icono, multiple = false }) {
  return (
    <button
      type="button"
      role={multiple ? 'checkbox' : 'radio'}
      aria-checked={activa}
      onClick={alElegir}
      className={`flex w-full items-center gap-4 rounded-2xl p-4 text-left transition duration-150 active:scale-[0.99] ${FOCO} ${
        activa ? 'bg-orange-100 ring-2 ring-inset ring-orange-700' : 'bg-white ring-1 ring-inset ring-stone-300 hover:bg-stone-50'
      }`}
    >
      {Icono && (
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
            activa ? 'bg-orange-700 text-white' : 'bg-orange-100 text-orange-800'
          }`}
        >
          <Icono className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold leading-snug text-stone-900">{titulo}</span>
        {detalle && <span className="mt-0.5 block text-base leading-snug text-stone-600">{detalle}</span>}
      </span>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 transition ${multiple ? 'rounded-lg' : 'rounded-full'} ${
          activa ? 'border-orange-700 bg-orange-700 text-white' : 'border-stone-300 bg-white text-transparent'
        }`}
        aria-hidden="true"
      >
        <Check className="h-4 w-4" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Tarjeta blanca con la sombra en capas de la app. */
export function Tarjeta({ className = '', children, ...resto }) {
  return (
    <div className={`sombra-tarjeta rounded-3xl bg-white ring-1 ring-stone-900/5 ${className}`} {...resto}>
      {children}
    </div>
  );
}

/** Marca honesta para lo que todavía no existe: nada de botones de adorno. */
export function AunNo({ children = 'Todavía no está construido' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-stone-200/80 px-3 py-1 text-sm font-semibold text-stone-700">
      <span className="h-1.5 w-1.5 rounded-full bg-stone-500" aria-hidden="true" />
      {children}
    </span>
  );
}

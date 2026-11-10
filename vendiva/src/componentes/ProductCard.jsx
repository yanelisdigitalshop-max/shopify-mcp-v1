// Tarjeta de producto. Sirve para la lista (con editar y borrar) y para
// elegir el producto del día en Hoy (seleccionable).

import { Check, Pencil, Trash2 } from 'lucide-react';

const TONOS = [
  'bg-orange-100 text-orange-900',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-900',
  'bg-stone-200 text-stone-800',
  'bg-yellow-100 text-yellow-900',
];
const tonoDe = (texto) => TONOS[[...texto].reduce((suma, letra) => suma + letra.codePointAt(0), 0) % TONOS.length];

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

export function precioBonito(precio) {
  if (precio == null) return null;
  return `$${Number.isInteger(precio) ? precio : precio.toFixed(2)}`;
}

function Datos({ producto }) {
  const precio = precioBonito(producto.precio);
  return (
    <span className="min-w-0 flex-1">
      <span className="line-clamp-2 block break-words text-lg font-semibold leading-snug text-stone-900">{producto.nombre}</span>
      {producto.descripcion && <span className="mt-0.5 line-clamp-2 block text-base leading-snug text-stone-600">{producto.descripcion}</span>}
      {(precio || producto.comisionPct != null) && (
        <span className="mt-2 flex flex-wrap items-center gap-2">
          {precio && <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-stone-800">{precio}</span>}
          {producto.comisionPct != null && (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-sm font-semibold tabular-nums text-amber-900">
              {producto.comisionPct}% de comisión
            </span>
          )}
        </span>
      )}
    </span>
  );
}

function Inicial({ nombre }) {
  return (
    <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl font-bold ${tonoDe(nombre)}`} aria-hidden="true">
      {nombre.trim().charAt(0).toUpperCase()}
    </span>
  );
}

export function ProductCard({ producto, nuevo = false, seleccionable = false, seleccionado = false, alElegir, alEditar, alBorrar }) {
  const animacion = nuevo ? 'anim-producto-nuevo' : '';

  if (seleccionable) {
    return (
      <button
        type="button"
        role="radio"
        aria-checked={seleccionado}
        onClick={alElegir}
        className={`sombra-tarjeta flex w-full min-w-0 items-center gap-4 rounded-3xl p-4 text-left transition duration-150 active:scale-[0.99] ${FOCO} ${animacion} ${
          seleccionado ? 'bg-orange-100 ring-2 ring-inset ring-orange-700' : 'bg-white ring-1 ring-stone-900/5 hover:bg-stone-50'
        }`}
      >
        <Inicial nombre={producto.nombre} />
        <Datos producto={producto} />
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition ${
            seleccionado ? 'border-orange-700 bg-orange-700 text-white' : 'border-stone-300 bg-white text-transparent'
          }`}
          aria-hidden="true"
        >
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      </button>
    );
  }

  const accion = `flex h-11 flex-1 items-center justify-center gap-2 rounded-xl text-base font-semibold transition ${FOCO}`;
  return (
    <article className={`sombra-tarjeta min-w-0 rounded-3xl bg-white p-4 pb-2 ring-1 ring-stone-900/5 ${animacion}`}>
      <div className="flex items-start gap-4">
        <Inicial nombre={producto.nombre} />
        <Datos producto={producto} />
      </div>
      <div className="mt-3 flex gap-2 border-t border-stone-100 pt-2">
        <button type="button" onClick={alEditar} aria-label={`Editar ${producto.nombre}`} className={`${accion} text-stone-700 hover:bg-orange-100 hover:text-orange-900`}>
          <Pencil className="h-[18px] w-[18px]" aria-hidden="true" />
          Editar
        </button>
        <button type="button" onClick={alBorrar} aria-label={`Borrar ${producto.nombre}`} className={`${accion} text-stone-600 hover:bg-red-50 hover:text-red-700`}>
          <Trash2 className="h-[18px] w-[18px]" aria-hidden="true" />
          Borrar
        </button>
      </div>
    </article>
  );
}

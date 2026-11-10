// Barra de progreso del registro: tres bloques con nombre y avance continuo.

import { Check } from 'lucide-react';

/**
 * @param {{ grupos: {nombre: string, pasos: number[]}[], paso: number, total: number }} props
 */
export function Stepper({ grupos, paso, total }) {
  const grupoActual = grupos.findIndex((g) => g.pasos.includes(paso));
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-orange-200/70"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={paso}
        aria-valuetext={`Paso ${paso} de ${total}: ${grupos[grupoActual]?.nombre ?? ''}`}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-600 transition-[width] duration-500 ease-out"
          style={{ width: `${(paso / total) * 100}%` }}
        />
      </div>
      <ol className="mt-3 flex items-center justify-between gap-2">
        {grupos.map((g, i) => {
          const hecho = i < grupoActual;
          const actual = i === grupoActual;
          return (
            <li key={g.nombre} className="flex min-w-0 items-center gap-1.5" aria-current={actual ? 'step' : undefined}>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-colors duration-300 ${
                  hecho ? 'bg-orange-700 text-white' : actual ? 'bg-stone-900 text-white' : 'bg-orange-200/80 text-orange-900/60'
                }`}
              >
                {hecho ? <Check className="h-3.5 w-3.5" strokeWidth={3.5} aria-hidden="true" /> : i + 1}
              </span>
              <span className={`truncate text-sm font-semibold ${actual ? 'text-stone-900' : hecho ? 'text-orange-800' : 'text-stone-500'}`}>
                {g.nombre}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

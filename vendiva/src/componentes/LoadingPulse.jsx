// Mientras se espera: una frase que dice qué está pasando y la silueta de lo que viene.
// Nada de ruedas girando sin explicación.

import { Puntos } from './base.jsx';

export function LoadingPulse({ texto = 'Un momento…', lineas = 3, className = '' }) {
  return (
    <div className={className} role="status" aria-live="polite">
      <p className="flex items-center gap-2.5 text-lg font-semibold text-orange-900">
        <Puntos />
        {texto}
      </p>
      <div className="mt-4 space-y-3" aria-hidden="true">
        {Array.from({ length: lineas }, (_, i) => (
          <div key={i} className="sombra-tarjeta rounded-3xl bg-white p-4 ring-1 ring-stone-900/5">
            <div className="flex items-center gap-4">
              <div className="esqueleto h-14 w-14 shrink-0 rounded-2xl" />
              <div className="flex-1 space-y-2.5">
                <div className="esqueleto h-4 rounded-full" style={{ width: `${70 - i * 12}%` }} />
                <div className="esqueleto h-3 rounded-full" style={{ width: `${45 + i * 8}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

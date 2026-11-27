// Tarjeta de un plan. Muestra solo los datos fijos: precio, créditos (texto y video), productos, buscador y Vitrina (solo Pro).

import { DURACION_VIDEO_SEGUNDOS, LIMITES_GRATIS, esPlanPro, formatoNumero, planFrenaEnCero } from '../../shared/datos.js';

export function PlanCard({ plan, actual = false }) {
  return (
    <div
      className={`sombra-tarjeta relative flex flex-col rounded-3xl p-5 ${
        actual ? 'bg-stone-900 text-orange-50 ring-1 ring-stone-900' : 'bg-white text-stone-900 ring-1 ring-stone-900/5'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xl font-bold tracking-tight">{plan.nombre}</h3>
        {actual && <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-sm font-bold text-stone-900">Tu plan</span>}
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className="text-4xl font-extrabold tracking-tight tabular-nums">${plan.precioMes}</span>
        <span className={`text-base font-medium ${actual ? 'text-orange-100/70' : 'text-stone-500'}`}>al mes</span>
      </p>
      <dl className={`mt-4 space-y-2 border-t pt-4 text-base ${actual ? 'border-white/15' : 'border-stone-200'}`}>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Créditos al mes</dt>
          <dd className="font-bold tabular-nums">{formatoNumero(plan.creditosMes)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 pl-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>De texto</dt>
          <dd className="font-semibold tabular-nums">{formatoNumero(plan.creditosTextoMes)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3 pl-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>De video</dt>
          <dd className="text-right font-semibold tabular-nums">
            {plan.creditosVideoMes > 0 ? formatoNumero(plan.creditosVideoMes) : `${LIMITES_GRATIS.videoGratisMes} video gratis de ${DURACION_VIDEO_SEGUNDOS} s`}
          </dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Productos</dt>
          <dd className="font-bold">{plan.maxProductos == null ? 'Sin tope' : `Máximo ${plan.maxProductos}`}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Buscador de productos</dt>
          <dd className="font-bold">{planFrenaEnCero(plan.id) ? `${LIMITES_GRATIS.busquedasMes} al mes` : 'Sin límite'}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Vitrina: tu calificación y un plan para mantenerla arriba de 4</dt>
          <dd className="shrink-0 font-bold">{esPlanPro(plan.id) ? 'Incluida' : 'No'}</dd>
        </div>
      </dl>
    </div>
  );
}

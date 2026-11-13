// Tarjeta de un plan. Muestra solo los datos fijos: precio, créditos y productos.

import { LIMITES_GRATIS, formatoNumero, planFrenaEnCero } from '../../shared/datos.js';

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
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Productos</dt>
          <dd className="font-bold">{plan.maxProductos == null ? 'Sin tope' : `Máximo ${plan.maxProductos}`}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className={actual ? 'text-orange-100/75' : 'text-stone-600'}>Buscador de productos</dt>
          <dd className="font-bold">{planFrenaEnCero(plan.id) ? `${LIMITES_GRATIS.busquedasMes} al mes` : 'Sin límite'}</dd>
        </div>
      </dl>
    </div>
  );
}

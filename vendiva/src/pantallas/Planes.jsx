// Pestaña Planes: su plan de hoy, su saldo y los 4 planes con sus datos fijos.
// Los pagos se conectan en la Parte 7: aquí todavía no se puede comprar nada.

import { CalendarClock, Info } from 'lucide-react';
import { ORDEN_PLANES, PLANES, formatoNumero } from '../../shared/datos.js';
import { PlanCard } from '../componentes/PlanCard.jsx';
import { Tarjeta } from '../componentes/base.jsx';
import { useEstado } from '../estado/Estado.jsx';

/** '2026-12-01' -> '1 de diciembre' (sin pasar por zonas horarias). */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

function Dato({ etiqueta, valor, detalle }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">{etiqueta}</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-stone-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-base text-stone-600">{detalle}</p>}
    </div>
  );
}

export function Planes() {
  const { datos } = useEstado();
  const { plan, creditos, limites } = datos;

  return (
    <div>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Tu plan</h1>
      <p className="mt-1 text-base text-stone-600">
        Estás en el plan <strong className="font-semibold text-stone-900">{plan.nombre}</strong>.
      </p>

      <Tarjeta className="mt-5 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-5">
          <Dato
            etiqueta="Créditos"
            valor={formatoNumero(creditos.total)}
            detalle={creditos.paquete > 0 ? `${formatoNumero(creditos.plan)} del plan + ${formatoNumero(creditos.paquete)} de paquetes` : `de ${formatoNumero(plan.creditosMes)} este mes`}
          />
          <Dato
            etiqueta="Productos"
            valor={limites.productosMax == null ? formatoNumero(limites.productosUsados) : `${limites.productosUsados}/${limites.productosMax}`}
            detalle={limites.productosMax == null ? 'sin tope' : 'guardados'}
          />
        </div>
        <p className="mt-5 flex items-start gap-3 border-t border-stone-200 pt-4 text-base leading-snug text-stone-700">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
          <span>
            Tus créditos del plan se renuevan solos el <strong className="font-semibold text-stone-900">{fechaLarga(creditos.renuevaEl)}</strong>.{' '}
            {limites.guionesMax == null
              ? 'Los guiones no gastan créditos.'
              : `Los guiones no gastan créditos hasta ${limites.guionesMax} veces al mes; después, 1 crédito cada vez.`}
          </span>
        </p>
      </Tarjeta>

      <h2 className="mt-9 text-xl font-bold tracking-tight text-stone-900">Los 4 planes</h2>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-4">
        {ORDEN_PLANES.map((id) => (
          <PlanCard key={id} plan={PLANES[id]} actual={id === plan.id} />
        ))}
      </div>

      <p className="mt-5 flex items-start gap-3 rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
        <span>Los pagos todavía no están activos. Por ahora todas las cuentas están en el plan Gratis y nadie cobra nada.</span>
      </p>
    </div>
  );
}

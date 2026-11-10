// Barra de pestañas. En el teléfono va abajo, al alcance del pulgar;
// en pantallas grandes sube al encabezado.

import { Gem, MessageCircleHeart, Package, Store, Sun } from 'lucide-react';

export const PESTANAS = [
  { id: 'hoy', nombre: 'Hoy', icono: Sun },
  { id: 'productos', nombre: 'Productos', icono: Package },
  { id: 'vitrina', nombre: 'Vitrina', icono: Store },
  { id: 'agente', nombre: 'Agente', icono: MessageCircleHeart },
  { id: 'planes', nombre: 'Planes', icono: Gem },
];

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

export function TabBar({ activa, alCambiar }) {
  return (
    <nav
      aria-label="Secciones"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-orange-200/70 bg-orange-50/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1.5">
        {PESTANAS.map(({ id, nombre, icono: Icono }) => {
          const esActiva = id === activa;
          return (
            <li key={id} className="flex-1">
              <button
                type="button"
                onClick={() => alCambiar(id)}
                aria-current={esActiva ? 'page' : undefined}
                className={`flex w-full flex-col items-center gap-0.5 rounded-2xl pb-1.5 pt-2 transition active:scale-95 ${FOCO}`}
              >
                <span
                  className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
                    esActiva ? 'bg-orange-700 text-white' : 'text-stone-600'
                  }`}
                >
                  <Icono className="h-[22px] w-[22px]" strokeWidth={esActiva ? 2.4 : 2} aria-hidden="true" />
                </span>
                <span className={`text-[13px] leading-tight ${esActiva ? 'font-bold text-orange-900' : 'font-medium text-stone-600'}`}>
                  {nombre}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** La misma navegación para el encabezado en pantallas grandes. */
export function TabBarEscritorio({ activa, alCambiar }) {
  return (
    <nav aria-label="Secciones" className="hidden md:block">
      <ul className="flex items-center gap-1 rounded-full bg-white/70 p-1 ring-1 ring-stone-900/5">
        {PESTANAS.map(({ id, nombre, icono: Icono }) => {
          const esActiva = id === activa;
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => alCambiar(id)}
                aria-current={esActiva ? 'page' : undefined}
                className={`flex items-center gap-2 rounded-full px-4 py-2 text-base font-semibold transition ${FOCO} ${
                  esActiva ? 'bg-orange-700 text-white' : 'text-stone-700 hover:bg-orange-100'
                }`}
              >
                <Icono className="h-[18px] w-[18px]" aria-hidden="true" />
                {nombre}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

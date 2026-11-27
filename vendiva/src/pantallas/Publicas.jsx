// Parte 8: páginas públicas (sin iniciar sesión), con dirección propia para las tiendas:
//   /privacidad     política de privacidad (borrador)
//   /terminos       términos de pago y cancelación (borrador)
//   /borrar-cuenta  cómo borrar la cuenta (Google pide una página web para esto)

import { ArrowLeft } from 'lucide-react';
import { NEGOCIO } from '../../shared/datos.js';
import { EMPRESA, PRIVACIDAD, PRIVACIDAD_ES_BORRADOR, VERSION_PRIVACIDAD } from '../../shared/privacidad.js';
import { TERMINOS, TERMINOS_ES_BORRADOR, VERSION_TERMINOS } from '../../shared/terminos.js';
import { Logo } from '../componentes/Logo.jsx';

export const RUTAS_PUBLICAS = ['/privacidad', '/terminos', '/borrar-cuenta'];

function Seccion({ titulo, texto, lista, nota }) {
  return (
    <section className="mt-7">
      <h2 className="text-xl font-bold tracking-tight text-stone-900">{titulo}</h2>
      {texto && <p className="mt-2 text-lg leading-relaxed text-stone-700">{texto}</p>}
      {lista && (
        <ul className="mt-2 space-y-2">
          {lista.map((x) => (
            <li key={x} className="flex gap-3 text-lg leading-relaxed text-stone-700">
              <span className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-700" aria-hidden="true" />
              {x}
            </li>
          ))}
        </ul>
      )}
      {nota && <p className="mt-3 text-lg font-semibold leading-relaxed text-stone-900">{nota}</p>}
    </section>
  );
}

function Pagina({ titulo, borrador, version, children }) {
  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <a href="/" aria-label="Ir a Vendiva" className="rounded-xl">
          <Logo />
        </a>
        <a href="/" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-base font-semibold text-orange-800">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver a la app
        </a>
      </header>
      <h1 className="mt-8 text-3xl font-extrabold leading-tight tracking-tight text-stone-900">{titulo}</h1>
      {borrador && (
        <p className="mt-4 rounded-2xl bg-amber-100 px-4 py-3 text-base font-semibold leading-snug text-amber-950">
          Borrador: pendiente de revisión por la dueña o un abogado.
        </p>
      )}
      {children}
      <p className="mt-10 border-t border-stone-200 pt-4 text-sm text-stone-500">
        {NEGOCIO.nombreApp} · {EMPRESA} · {NEGOCIO.direccion} · {NEGOCIO.correoSoporte}
        {version ? ` · Versión ${version}` : ''}
      </p>
    </div>
  );
}

export function PaginaPublica({ ruta }) {
  if (ruta === '/privacidad') {
    return (
      <Pagina titulo="Política de privacidad" borrador={PRIVACIDAD_ES_BORRADOR} version={VERSION_PRIVACIDAD}>
        {PRIVACIDAD.map((s) => (
          <Seccion key={s.titulo} {...s} />
        ))}
      </Pagina>
    );
  }
  if (ruta === '/terminos') {
    return (
      <Pagina titulo="Términos de pago y cancelación" borrador={TERMINOS_ES_BORRADOR} version={VERSION_TERMINOS}>
        {TERMINOS.map((s) => (
          <Seccion key={s.titulo} {...s} />
        ))}
      </Pagina>
    );
  }
  return (
    <Pagina titulo="Cómo borrar tu cuenta de Vendiva">
      <Seccion
        titulo="Desde la app"
        lista={[
          'Entra a Vendiva con tu correo y tu contraseña.',
          'Toca tu inicial, arriba a la derecha, para abrir «Mi cuenta».',
          'Baja hasta el final y toca «Borrar mi cuenta».',
          'Escribe tu contraseña y confirma.',
        ]}
      />
      <Seccion
        titulo="Qué pasa al borrarla"
        lista={[
          'Si tienes un plan de pago, se cancela en ese momento y no se te vuelve a cobrar. No hay reembolso del mes ya pagado.',
          'Se borra todo lo tuyo: tu perfil, tus productos, guiones, videos, voces, calendario, vitrina y créditos (también los de paquetes).',
          'Stripe conserva el registro de los cobros que ya se hicieron, como lo exige la ley.',
          'No se puede deshacer.',
        ]}
      />
      <Seccion
        titulo="Sin entrar a la app"
        texto={`Escríbenos desde el correo de tu cuenta a ${NEGOCIO.correoSoporte} con el asunto «Borrar mi cuenta». La borramos y te confirmamos por correo.`}
      />
    </Pagina>
  );
}

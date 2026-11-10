// Antes de entrar: bienvenida e inicio de sesión.

import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff, Hand, Sparkles, Video } from 'lucide-react';
import { Logo } from '../componentes/Logo.jsx';
import { AvisoError, Boton, Campo } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

export function Marco({ children }) {
  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
      {children}
    </div>
  );
}

export function BotonAtras({ onClick, etiqueta = 'Volver' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={etiqueta}
      className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-stone-700 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
    >
      <ArrowLeft className="h-6 w-6" aria-hidden="true" />
    </button>
  );
}

export function CampoContrasena({ etiqueta = 'Contraseña', nueva = false, ...resto }) {
  const [visible, setVisible] = useState(false);
  const Icono = visible ? EyeOff : Eye;
  return (
    <Campo
      etiqueta={etiqueta}
      type={visible ? 'text' : 'password'}
      autoComplete={nueva ? 'new-password' : 'current-password'}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      despues={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Ocultar la contraseña' : 'Ver la contraseña'}
          aria-pressed={visible}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-stone-600 hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
        >
          <Icono className="h-5 w-5" aria-hidden="true" />
        </button>
      }
      {...resto}
    />
  );
}

function Punto({ icono: Icono, titulo, texto }) {
  return (
    <li className="flex items-start gap-3.5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white text-orange-800 ring-1 ring-stone-900/5">
        <Icono className="h-5 w-5" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-lg font-semibold leading-snug text-stone-900">{titulo}</span>
        <span className="block text-base leading-snug text-stone-600">{texto}</span>
      </span>
    </li>
  );
}

export function Bienvenida({ alCrear, alEntrar, aviso }) {
  return (
    <Marco>
      <header className="anim-entrar pt-2">
        <Logo grande />
      </header>

      <main className="flex flex-1 flex-col justify-center py-8">
        <h1 className="anim-entrar text-[2.1rem] font-extrabold leading-[1.1] tracking-tight text-stone-900">
          Tu producto, listo para grabar hoy.
        </h1>
        <p className="anim-entrar mt-4 text-lg leading-relaxed text-stone-700" style={{ animationDelay: '60ms' }}>
          Para afiliadas de TikTok Shop: Vendiva te dice qué decir y cómo mostrar el producto que recibiste de muestra.
        </p>

        <ul className="anim-entrar mt-8 space-y-5" style={{ animationDelay: '120ms' }}>
          <Punto icono={Video} titulo="Con cámara" texto="Tú hablas, con el guion en la mano." />
          <Punto icono={Hand} titulo="Sin cámara" texto="Solo tus manos, el producto y tu voz. Tu cara no sale." />
          <Punto icono={Sparkles} titulo="A tu paso" texto="Letras grandes y pasos cortos, desde cero seguidores." />
        </ul>
      </main>

      <footer className="anim-entrar space-y-3" style={{ animationDelay: '180ms' }}>
        {aviso && <p className="rounded-2xl bg-amber-100 px-4 py-3 text-base font-medium text-amber-900">{aviso}</p>}
        <Boton onClick={alCrear}>Crear mi cuenta gratis</Boton>
        <Boton variante="secundario" onClick={alEntrar}>
          Ya tengo cuenta
        </Boton>
      </footer>
    </Marco>
  );
}

export function Entrar({ alVolver, alCrear, aviso }) {
  const { acciones } = useEstado();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const entrar = useAccion(acciones.entrar);

  const enviar = (e) => {
    e.preventDefault();
    entrar.ejecutar({ correo, contrasena });
  };

  return (
    <Marco>
      <header className="flex items-center justify-between">
        <BotonAtras onClick={alVolver} />
        <Logo />
        <span className="w-9" aria-hidden="true" />
      </header>

      <form onSubmit={enviar} className="anim-entrar flex flex-1 flex-col pt-8" noValidate>
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Qué bueno verte de nuevo</h1>
        <p className="mt-2 text-lg text-stone-600">Entra con el correo y la contraseña de tu cuenta.</p>

        {aviso && <p className="mt-5 rounded-2xl bg-amber-100 px-4 py-3 text-base font-medium text-amber-900">{aviso}</p>}

        <div className="mt-6 space-y-4">
          <Campo
            etiqueta="Correo"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="tucorreo@ejemplo.com"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            error={entrar.error?.campos?.correo}
            required
          />
          <CampoContrasena value={contrasena} onChange={(e) => setContrasena(e.target.value)} error={entrar.error?.campos?.contrasena} required />
        </div>

        {entrar.error && !entrar.error.campos && (
          <AvisoError className="mt-4" error={entrar.error} alReintentar={entrar.reintentar} reintentando={entrar.cargando} />
        )}

        <div className="mt-auto space-y-3 pt-8">
          <Boton type="submit" cargando={entrar.cargando} textoCargando="Entrando…">
            Entrar
          </Boton>
          <Boton variante="texto" onClick={alCrear}>
            No tengo cuenta: crear una
          </Boton>
        </div>
      </form>
    </Marco>
  );
}

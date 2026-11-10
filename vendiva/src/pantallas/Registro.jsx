// Registro paso a paso: 5 pantallas cortas en vez de un formulario largo.
// Cada pantalla se guarda en el servidor al tocar "Continuar": si ella cierra
// la app a la mitad, al volver sigue donde iba.

import { useState } from 'react';
import { Hand, Heart, ShieldCheck, Star, Target, TrendingUp, Users, Video } from 'lucide-react';
import {
  MODOS_GRABACION, NICHOS_SUGERIDOS, OBJETIVOS, PASOS_REGISTRO, REDES, SEGUIDORES_MAXIMO, nivelPara,
} from '../../shared/datos.js';
import { Logo } from '../componentes/Logo.jsx';
import { Stepper } from '../componentes/Stepper.jsx';
import { AvisoError, Boton, Campo, Opcion } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { BotonAtras, CampoContrasena, Marco } from './Acceso.jsx';

const GRUPOS = [
  { nombre: 'Tu cuenta', pasos: [1] },
  { nombre: 'Tu negocio', pasos: [2, 3, 4] },
  { nombre: 'Tus redes', pasos: [5] },
];

export const ICONO_MODO = { con_camara: Video, sin_camara: Hand };
export const ICONO_OBJETIVO = { vender_mas: TrendingUp, primeros_1000: Users, programa_piloto: Target, subir_vitrina: Star };

/** "1.200", "1,200" o "1200" -> 1200. Vacío -> null. */
export function leerEntero(texto) {
  const digitos = String(texto).replace(/\D/g, '');
  if (!digitos) return null;
  return Math.min(Number(digitos), SEGUIDORES_MAXIMO);
}

function Encabezado({ titulo, texto }) {
  return (
    <>
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-stone-900">{titulo}</h1>
      {texto && <p className="mt-2 text-lg leading-snug text-stone-600">{texto}</p>}
    </>
  );
}

function Pie({ accion, textoCargando = 'Guardando…', children = 'Continuar', deshabilitado = false }) {
  return (
    <div className="mt-auto space-y-3 pt-8">
      {accion.error && !accion.error.campos && <AvisoError error={accion.error} alReintentar={accion.reintentar} reintentando={accion.cargando} />}
      <Boton type="submit" cargando={accion.cargando} textoCargando={textoCargando} disabled={deshabilitado}>
        {children}
      </Boton>
    </div>
  );
}

function PasoCuenta({ alEntrar }) {
  const { acciones } = useEstado();
  const registrar = useAccion(acciones.registrar);
  const [f, setF] = useState({ nombre: '', correo: '', telefono: '', contrasena: '' });
  const poner = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const errores = registrar.error?.campos ?? {};

  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={(e) => { e.preventDefault(); registrar.ejecutar(f); }}>
      <Encabezado titulo="Empecemos por ti" texto="Con esto creamos tu cuenta. Empiezas en el plan Gratis, sin tarjeta." />
      <div className="mt-6 space-y-4">
        <Campo etiqueta="Tu nombre completo" autoComplete="name" autoCapitalize="words" placeholder="María Elena Pérez" value={f.nombre} onChange={poner('nombre')} error={errores.nombre} required />
        <Campo etiqueta="Tu correo" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="tucorreo@ejemplo.com" value={f.correo} onChange={poner('correo')} error={errores.correo} required />
        <Campo etiqueta="Tu teléfono" type="tel" inputMode="tel" autoComplete="tel" placeholder="(305) 555-0100" value={f.telefono} onChange={poner('telefono')} error={errores.telefono} required />
        <CampoContrasena etiqueta="Crea una contraseña" nueva value={f.contrasena} onChange={poner('contrasena')} error={errores.contrasena} ayuda="Al menos 8 letras o números. Solo tú la conoces." required />
      </div>
      <Pie accion={registrar} textoCargando="Creando tu cuenta…">Crear mi cuenta</Pie>
      <Boton variante="texto" className="mt-3" onClick={alEntrar}>
        Ya tengo cuenta
      </Boton>
    </form>
  );
}

function PasoNicho({ perfil, guardar }) {
  const [nicho, setNicho] = useState(perfil.nicho ?? '');
  const [seguidores, setSeguidores] = useState(perfil.nicho == null ? '' : String(perfil.seguidores));
  const cantidad = leerEntero(seguidores);
  const nivel = cantidad == null ? null : nivelPara(cantidad);
  const errores = guardar.error?.campos ?? {};

  const enviar = (e) => {
    e.preventDefault();
    guardar.ejecutar({ nicho, seguidores: cantidad ?? 0, onboardingPaso: 3 });
  };

  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={enviar}>
      <Encabezado titulo="¿Qué te gusta vender?" texto="Tu nicho es el tipo de producto que muestras. Puedes cambiarlo después." />
      <div className="mt-6">
        <Campo etiqueta="Mi nicho" placeholder="Por ejemplo: cuidado del cabello" value={nicho} onChange={(e) => setNicho(e.target.value)} error={errores.nicho} maxLength={60} />
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Sugerencias de nicho">
          {NICHOS_SUGERIDOS.map((sugerido) => {
            const activo = nicho === sugerido;
            return (
              <button
                key={sugerido}
                type="button"
                aria-pressed={activo}
                onClick={() => setNicho(sugerido)}
                className={`rounded-full px-3.5 py-2 text-base font-medium transition active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700 ${
                  activo ? 'bg-orange-700 text-white' : 'bg-white text-stone-700 ring-1 ring-inset ring-stone-300 hover:bg-orange-100'
                }`}
              >
                {sugerido}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-7">
        <Campo
          etiqueta="¿Cuántos seguidores tienes hoy en TikTok?"
          inputMode="numeric"
          placeholder="0"
          value={seguidores}
          onChange={(e) => setSeguidores(e.target.value.replace(/[^\d.,\s]/g, ''))}
          error={errores.seguidores}
          ayuda="Escribe el número que ves en tu perfil. Si empiezas hoy, déjalo en 0."
        />
        {nivel && (
          <p className="anim-entrar mt-3 inline-flex items-center gap-2 rounded-full bg-stone-900 px-3.5 py-1.5 text-base font-semibold text-orange-50" key={nivel.numero}>
            <span className="text-amber-300">Nivel {nivel.numero}</span>
            {nivel.nombre}
          </p>
        )}
      </div>
      <Pie accion={guardar} deshabilitado={nicho.trim().length < 2} />
    </form>
  );
}

function PasoModo({ perfil, guardar }) {
  const [modo, setModo] = useState(perfil.modoGrabacion);
  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={(e) => { e.preventDefault(); guardar.ejecutar({ modoGrabacion: modo, onboardingPaso: 4 }); }}>
      <Encabezado titulo="¿Cómo prefieres grabar?" texto="En los dos modos la protagonista eres tú, no un avatar. Podrás cambiar de modo cuando quieras." />
      <div className="mt-6 space-y-3" role="radiogroup" aria-label="Modo de grabación">
        {MODOS_GRABACION.map((m) => (
          <Opcion key={m.id} activa={modo === m.id} alElegir={() => setModo(m.id)} titulo={m.nombre} detalle={m.detalle} icono={ICONO_MODO[m.id]} />
        ))}
      </div>
      <Pie accion={guardar} deshabilitado={!modo} />
    </form>
  );
}

function PasoObjetivo({ perfil, guardar }) {
  const [objetivo, setObjetivo] = useState(perfil.objetivo);
  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={(e) => { e.preventDefault(); guardar.ejecutar({ objetivo, onboardingPaso: 5 }); }}>
      <Encabezado titulo="¿Qué quieres lograr primero?" texto="Elige una meta. Vendiva te acompaña hacia ahí; el resultado depende de tu trabajo y de TikTok." />
      <div className="mt-6 space-y-3" role="radiogroup" aria-label="Tu objetivo">
        {OBJETIVOS.map((o) => (
          <Opcion key={o.id} activa={objetivo === o.id} alElegir={() => setObjetivo(o.id)} titulo={o.nombre} icono={ICONO_OBJETIVO[o.id]} />
        ))}
      </div>
      <Pie accion={guardar} deshabilitado={!objetivo} />
    </form>
  );
}

function PasoRedes({ perfil, guardar }) {
  const [usuario, setUsuario] = useState(perfil.usuarioTiktok ?? '');
  const [redes, setRedes] = useState(perfil.redes.length ? perfil.redes : ['tiktok']);
  const alternar = (id) => setRedes((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  const errores = guardar.error?.campos ?? {};

  return (
    <form className="flex flex-1 flex-col" noValidate onSubmit={(e) => { e.preventDefault(); guardar.ejecutar({ usuarioTiktok: usuario, redes, onboardingCompleto: true }); }}>
      <Encabezado titulo="Tus redes" texto="Último paso. Así tus textos salen con tu nombre de cuenta." />
      <div className="mt-6">
        <Campo
          etiqueta="Tu usuario de TikTok"
          antes="@"
          placeholder="tunombre"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={usuario}
          onChange={(e) => setUsuario(e.target.value.replace(/^@+/, '').replace(/\s/g, ''))}
          error={errores.usuarioTiktok}
          ayuda="Sin la arroba. Si todavía no tienes cuenta, déjalo vacío."
          maxLength={24}
        />
      </div>

      <fieldset className="mt-7">
        <legend className="mb-2 text-base font-semibold text-stone-800">¿En cuáles publicas?</legend>
        <div className="grid grid-cols-2 gap-3">
          {REDES.map((r) => (
            <Opcion key={r.id} multiple activa={redes.includes(r.id)} alElegir={() => alternar(r.id)} titulo={r.nombre} />
          ))}
        </div>
      </fieldset>

      <p className="mt-6 flex items-start gap-3 rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
        <span>Vendiva nunca te pide la contraseña de tus redes, no entra a tus cuentas y no publica por ti.</span>
      </p>
      <Pie accion={guardar} textoCargando="Preparando tu Vendiva…">Entrar a Vendiva</Pie>
    </form>
  );
}

export function Registro({ alVolver, alEntrar }) {
  const { datos, acciones } = useEstado();
  const pasoGuardado = datos ? datos.perfil.onboardingPaso : 1;
  const [paso, setPaso] = useState(pasoGuardado);
  const [direccion, setDireccion] = useState('adelante');
  // Cada pantalla se guarda y, si salió bien (a la primera o al reintentar), avanza.
  const guardar = useAccion(acciones.guardarPerfil, {
    alExito: (_valor, cambios) => {
      if (cambios.onboardingCompleto) return;
      setDireccion('adelante');
      setPaso(cambios.onboardingPaso);
    },
  });
  const salir = useAccion(acciones.salir);

  // Con la cuenta recién creada, el paso 1 ya no existe: seguimos en el 2.
  const pasoVisible = datos ? Math.max(paso, 2) : 1;

  const atras = () => {
    guardar.limpiar();
    if (pasoVisible <= 2) return;
    setDireccion('atras');
    setPaso(pasoVisible - 1);
  };

  return (
    <Marco>
      <header className="flex items-center justify-between">
        {pasoVisible === 1 ? <BotonAtras onClick={alVolver} /> : pasoVisible > 2 ? <BotonAtras onClick={atras} etiqueta="Paso anterior" /> : <span className="w-9" aria-hidden="true" />}
        <Logo />
        {datos ? (
          <button
            type="button"
            onClick={() => salir.ejecutar()}
            className="rounded-full px-2 py-1 text-base font-semibold text-stone-600 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            Salir
          </button>
        ) : (
          <span className="w-9" aria-hidden="true" />
        )}
      </header>

      <div className="mt-5">
        <Stepper grupos={GRUPOS} paso={pasoVisible} total={PASOS_REGISTRO} />
      </div>

      <main key={pasoVisible} className={`flex flex-1 flex-col pt-7 ${direccion === 'atras' ? 'anim-atras' : 'anim-adelante'}`}>
        {pasoVisible === 1 && <PasoCuenta alEntrar={alEntrar} />}
        {pasoVisible === 2 && <PasoNicho perfil={datos.perfil} guardar={guardar} />}
        {pasoVisible === 3 && <PasoModo perfil={datos.perfil} guardar={guardar} />}
        {pasoVisible === 4 && <PasoObjetivo perfil={datos.perfil} guardar={guardar} />}
        {pasoVisible >= 5 && <PasoRedes perfil={datos.perfil} guardar={guardar} />}
      </main>

      {pasoVisible > 1 && pasoVisible < 5 && (
        <p className="mt-4 flex items-center justify-center gap-1.5 text-sm text-stone-500">
          <Heart className="h-3.5 w-3.5" aria-hidden="true" />
          Se guarda solo. Si sales, sigues donde ibas.
        </p>
      )}
    </Marco>
  );
}

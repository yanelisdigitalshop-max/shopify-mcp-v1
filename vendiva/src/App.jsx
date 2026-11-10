import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { EmptyState } from './componentes/EmptyState.jsx';
import { IlustracionSinConexion } from './componentes/Ilustraciones.jsx';
import { LoadingPulse } from './componentes/LoadingPulse.jsx';
import { Logo } from './componentes/Logo.jsx';
import { PESTANAS, TabBar, TabBarEscritorio } from './componentes/TabBar.jsx';
import { Boton } from './componentes/base.jsx';
import { useEstado } from './estado/Estado.jsx';
import { Bienvenida, Entrar, Marco } from './pantallas/Acceso.jsx';
import { Cuenta } from './pantallas/Cuenta.jsx';
import { Hoy } from './pantallas/Hoy.jsx';
import { Planes } from './pantallas/Planes.jsx';
import { Productos } from './pantallas/Productos.jsx';
import { Agente, Vitrina } from './pantallas/Proximamente.jsx';
import { Registro } from './pantallas/Registro.jsx';

const PANTALLAS = { hoy: Hoy, productos: Productos, vitrina: Vitrina, agente: Agente, planes: Planes, cuenta: Cuenta };
const VALIDAS = new Set(Object.keys(PANTALLAS));
const leerHash = () => {
  const id = window.location.hash.replace('#', '');
  return VALIDAS.has(id) ? id : 'hoy';
};

/** La pestaña vive en la dirección (#productos): el botón "atrás" del teléfono funciona. */
function usePestana() {
  const [pestana, setPestana] = useState(leerHash);
  useEffect(() => {
    const alCambiar = () => setPestana(leerHash());
    window.addEventListener('hashchange', alCambiar);
    return () => window.removeEventListener('hashchange', alCambiar);
  }, []);
  const irA = useCallback((id) => {
    if (id !== leerHash()) window.location.hash = id;
    setPestana(id);
    window.scrollTo({ top: 0 });
  }, []);
  return [pestana, irA];
}

function Arrancando() {
  return (
    <Marco>
      <header className="pt-2">
        <Logo />
      </header>
      <LoadingPulse className="mt-10" texto="Abriendo tu Vendiva…" lineas={3} />
    </Marco>
  );
}

function SinConexion({ error, alReintentar }) {
  return (
    <Marco>
      <header className="pt-2">
        <Logo />
      </header>
      <div className="flex flex-1 items-center justify-center">
        <EmptyState
          ilustracion={IlustracionSinConexion}
          titulo="No pudimos abrir Vendiva"
          texto={error?.message ?? 'Revisa tu internet y vuelve a intentar.'}
          accion={
            <Boton icono={RefreshCw} onClick={alReintentar}>
              Reintentar
            </Boton>
          }
        />
      </div>
    </Marco>
  );
}

function Invitada({ sesionVencida }) {
  const [vista, setVista] = useState(sesionVencida ? 'entrar' : 'bienvenida');
  const aviso = sesionVencida ? 'Tu sesión se cerró. Entra de nuevo: todo lo tuyo sigue guardado.' : null;
  // Al salir se olvida la pestaña: la próxima vez empieza en Hoy.
  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);
  if (vista === 'registro') return <Registro alVolver={() => setVista('bienvenida')} alEntrar={() => setVista('entrar')} />;
  if (vista === 'entrar') return <Entrar aviso={aviso} alVolver={() => setVista('bienvenida')} alCrear={() => setVista('registro')} />;
  return <Bienvenida alCrear={() => setVista('registro')} alEntrar={() => setVista('entrar')} />;
}

function Aplicacion() {
  const { datos } = useEstado();
  const [pestana, irA] = usePestana();
  const Pantalla = PANTALLAS[pestana];
  const inicial = datos.usuaria.nombre.trim().charAt(0).toUpperCase();
  const enCuenta = pestana === 'cuenta';

  // Al entrar (después del registro o de iniciar sesión) la pantalla empieza arriba.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  return (
    <div className="min-h-[100dvh]">
      <header className="sticky top-0 z-20 border-b border-orange-200/60 bg-orange-50/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[900px] items-center justify-between gap-4 px-5">
          <button type="button" onClick={() => irA('hoy')} aria-label="Ir a Hoy" className="rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-700">
            <Logo />
          </button>
          <TabBarEscritorio activa={pestana} alCambiar={irA} />
          <button
            type="button"
            onClick={() => irA(enCuenta ? 'hoy' : 'cuenta')}
            aria-label="Mi cuenta"
            aria-current={enCuenta ? 'page' : undefined}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700 ${
              enCuenta ? 'bg-orange-700 text-white' : 'bg-orange-200 text-orange-950 hover:bg-orange-300'
            }`}
          >
            {inicial}
          </button>
        </div>
      </header>

      <main key={pestana} className="anim-entrar mx-auto w-full max-w-[900px] px-5 pb-32 pt-6 md:pb-16 md:pt-10">
        <Pantalla irA={irA} alVolver={() => irA('hoy')} />
      </main>

      <TabBar activa={PESTANAS.some((p) => p.id === pestana) ? pestana : null} alCambiar={irA} />
    </div>
  );
}

export default function App() {
  const { fase, datos, errorArranque, sesionVencida, acciones } = useEstado();

  if (fase === 'cargando') return <Arrancando />;
  if (fase === 'error') return <SinConexion error={errorArranque} alReintentar={acciones.cargar} />;
  if (!datos) return <Invitada key={sesionVencida ? 'vencida' : 'nueva'} sesionVencida={sesionVencida} />;
  if (!datos.perfil.onboardingCompleto) return <Registro />;
  return <Aplicacion />;
}

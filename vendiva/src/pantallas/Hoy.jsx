// Pantalla Hoy: su nivel, el producto del día y (desde la Parte 2) sus guiones.

import { useEffect, useState } from 'react';
import { ArrowRight, Plus, TrendingUp } from 'lucide-react';
import { MODOS_GRABACION, NIVELES, formatoNumero, nivelPara } from '../../shared/datos.js';
import { EmptyState } from '../componentes/EmptyState.jsx';
import { IlustracionCaja, IlustracionGuion } from '../componentes/Ilustraciones.jsx';
import { ProductCard } from '../componentes/ProductCard.jsx';
import { AunNo, AvisoError, Boton, Campo, Hoja, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { FormularioProducto } from './FormularioProducto.jsx';
import { leerEntero } from './Registro.jsx';

const fechaDeHoy = () => {
  const texto = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

function TarjetaNivel({ seguidores, nivel, subio, alActualizar }) {
  const faltan = nivel.siguiente?.faltan;
  return (
    <section aria-label="Tu nivel" className="sombra-flotante relative overflow-hidden rounded-3xl bg-stone-900 p-5 text-orange-50 md:p-6">
      <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-orange-600/30 blur-3xl" aria-hidden="true" />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-amber-300">Nivel {nivel.numero} de {NIVELES.length}</p>
          {subio && (
            <span className="anim-entrar inline-flex items-center gap-1.5 rounded-full bg-amber-400 px-3 py-1 text-sm font-bold text-stone-900">
              <TrendingUp className="h-4 w-4" aria-hidden="true" />
              Subiste de nivel
            </span>
          )}
        </div>
        <h2 className="mt-1 text-2xl font-bold leading-tight tracking-tight">{nivel.nombre}</h2>

        <p className="mt-5 flex items-baseline gap-2">
          <span className="text-5xl font-extrabold tracking-tight tabular-nums">{formatoNumero(seguidores)}</span>
          <span className="text-lg text-orange-100/70">{seguidores === 1 ? 'seguidor' : 'seguidores'}</span>
        </p>

        <div className="mt-5 flex gap-1" aria-hidden="true">
          {NIVELES.map((n) => (
            <span key={n.numero} className={`h-2 flex-1 overflow-hidden rounded-full ${n.numero < nivel.numero ? 'bg-amber-400' : 'bg-white/15'}`}>
              {n.numero === nivel.numero && (
                <span
                  className="block h-full rounded-full bg-amber-400 transition-[width] duration-700 ease-out"
                  style={{ width: `${Math.max(12, nivel.progreso * 100)}%` }}
                />
              )}
            </span>
          ))}
        </div>

        <p className="mt-3 text-base leading-snug text-orange-100/85">
          {nivel.siguiente ? (
            <>
              {faltan === 1 ? 'Te falta ' : 'Te faltan '}
              <strong className="font-bold text-white">{formatoNumero(faltan)}</strong> para{' '}
              <strong className="font-bold text-white">{nivel.siguiente.nombre}</strong>.
            </>
          ) : (
            'Estás en el nivel más alto, y aquí no hay techo.'
          )}
        </p>

        <Boton variante="oscuro" className="mt-5 min-h-12" onClick={alActualizar}>
          Actualizar mis seguidores
        </Boton>
      </div>
    </section>
  );
}

function HojaSeguidores({ abierta, alCerrar, actuales, alSubir }) {
  const { acciones } = useEstado();
  const guardar = useAccion((cambios) => acciones.guardarPerfil(cambios), {
    alExito: (valor, _cambios, nivelAntes) => {
      if (valor.estado.nivel.numero > nivelAntes) alSubir();
      alCerrar();
    },
  });
  const limpiar = guardar.limpiar;
  const [texto, setTexto] = useState('');

  useEffect(() => {
    if (!abierta) return;
    setTexto(String(actuales));
    limpiar();
  }, [abierta, actuales, limpiar]);

  const cantidad = leerEntero(texto);
  const nivel = cantidad == null ? null : nivelPara(cantidad);

  const enviar = (e) => {
    e.preventDefault();
    if (cantidad == null) return;
    guardar.ejecutar({ seguidores: cantidad }, nivelPara(actuales).numero);
  };

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Tus seguidores de hoy">
      <form onSubmit={enviar} noValidate>
        <Campo
          etiqueta="¿Cuántos seguidores ves en tu perfil de TikTok?"
          inputMode="numeric"
          value={texto}
          onChange={(e) => setTexto(e.target.value.replace(/[^\d.,\s]/g, ''))}
          error={guardar.error?.campos?.seguidores}
          ayuda="Tú escribes el número: Vendiva no entra a tu cuenta de TikTok."
          autoFocus
        />
        {nivel && (
          <p className="mt-4 rounded-2xl bg-stone-900 px-4 py-3 text-base text-orange-50" key={nivel.numero}>
            <span className="font-bold text-amber-300">Nivel {nivel.numero}</span> · <span className="font-semibold">{nivel.nombre}</span>
          </p>
        )}
        {guardar.error && !guardar.error.campos && <AvisoError className="mt-4" error={guardar.error} alReintentar={guardar.reintentar} reintentando={guardar.cargando} />}
        <Boton type="submit" className="mt-5" cargando={guardar.cargando} textoCargando="Guardando…" disabled={cantidad == null}>
          Guardar
        </Boton>
      </form>
    </Hoja>
  );
}

export function Hoy({ irA }) {
  const { datos } = useEstado();
  const { usuaria, perfil, nivel, productos, limites, plan } = datos;
  const [elegido, setElegido] = useState(null);
  const [editarSeguidores, setEditarSeguidores] = useState(false);
  const [agregar, setAgregar] = useState(false);
  const [subio, setSubio] = useState(false);
  const [idNuevo, setIdNuevo] = useState(null);

  useEffect(() => {
    if (!subio) return undefined;
    const t = setTimeout(() => setSubio(false), 6000);
    return () => clearTimeout(t);
  }, [subio]);

  const productoDeHoy = productos.find((p) => p.id === elegido) ?? productos[0] ?? null;
  const modo = MODOS_GRABACION.find((m) => m.id === perfil.modoGrabacion);
  const primerNombre = usuaria.nombre.trim().split(/\s+/)[0];
  const visibles = productos.slice(0, 3);

  return (
    <div className="md:grid md:grid-cols-5 md:items-start md:gap-8">
      <div className="md:col-span-2">
        <p className="text-base font-medium text-stone-500">{fechaDeHoy()}</p>
        <h1 className="mt-0.5 text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Hola, {primerNombre}</h1>
        <div className="mt-5">
          <TarjetaNivel seguidores={perfil.seguidores} nivel={nivel} subio={subio} alActualizar={() => setEditarSeguidores(true)} />
        </div>
      </div>

      <div className="mt-8 space-y-8 md:col-span-3 md:mt-1">
        <section aria-labelledby="titulo-producto-hoy">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="titulo-producto-hoy" className="text-xl font-bold tracking-tight text-stone-900">
              Tu producto de hoy
            </h2>
            {productos.length > 0 && (
              <button
                type="button"
                onClick={() => irA('productos')}
                className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-base font-semibold text-orange-800 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
              >
                Ver todos
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {productos.length === 0 ? (
            <Tarjeta className="mt-3 p-5">
              <EmptyState
                ilustracion={IlustracionCaja}
                titulo="Empieza con tu primer producto"
                texto="Agrega el producto que recibiste de muestra. Desde ahí salen tus guiones y tus videos."
                accion={
                  <Boton icono={Plus} onClick={() => setAgregar(true)}>
                    Agregar mi producto
                  </Boton>
                }
              />
            </Tarjeta>
          ) : (
            <>
              <div className="mt-3 space-y-3" role="radiogroup" aria-label="Elige el producto de hoy">
                {visibles.map((p) => (
                  <ProductCard key={p.id} producto={p} seleccionable seleccionado={productoDeHoy?.id === p.id} alElegir={() => setElegido(p.id)} nuevo={p.id === idNuevo} />
                ))}
              </div>
              {productos.length > visibles.length && (
                <p className="mt-3 text-base text-stone-600">
                  Tienes {productos.length - visibles.length} más en{' '}
                  <button type="button" onClick={() => irA('productos')} className="font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4">
                    Productos
                  </button>
                  .
                </p>
              )}
              {limites.puedeAgregarProducto && (
                <Boton variante="suave" icono={Plus} className="mt-3 min-h-12" onClick={() => setAgregar(true)}>
                  Agregar otro producto
                </Boton>
              )}
            </>
          )}
        </section>

        <section aria-labelledby="titulo-guiones">
          <h2 id="titulo-guiones" className="text-xl font-bold tracking-tight text-stone-900">
            Tus 3 guiones de hoy
          </h2>
          <Tarjeta className="mt-3 p-5">
            <div className="flex items-center gap-4">
              <IlustracionGuion className="h-16 w-auto shrink-0" />
              <AunNo>Se activa en la Parte 2, con la IA</AunNo>
            </div>
            <p className="mt-4 text-base leading-relaxed text-stone-700">
              {productoDeHoy ? (
                <>
                  Aquí vas a recibir cada día 3 guiones para <strong className="font-semibold text-stone-900">{productoDeHoy.nombre}</strong>
                  {modo && (
                    <>
                      {' '}
                      en modo <strong className="font-semibold text-stone-900">{modo.nombre.toLowerCase()}</strong>
                    </>
                  )}
                  : gancho de 3 segundos, guion con tiempos, texto en pantalla, caption con hashtags y la mejor hora para publicar.
                </>
              ) : (
                'Cuando tengas un producto, aquí vas a recibir cada día 3 guiones listos para grabar.'
              )}
            </p>
            <p className="mt-2 text-base text-stone-600">Los guiones son ilimitados y no gastan créditos, en el plan {plan.nombre} y en todos.</p>
          </Tarjeta>
        </section>
      </div>

      <HojaSeguidores abierta={editarSeguidores} alCerrar={() => setEditarSeguidores(false)} actuales={perfil.seguidores} alSubir={() => setSubio(true)} />
      <FormularioProducto
        abierta={agregar}
        alCerrar={() => setAgregar(false)}
        alGuardar={(id) => {
          setElegido(id);
          setIdNuevo(id);
        }}
      />
    </div>
  );
}

// Pestaña Productos: la lista de ella, con agregar, editar y borrar.
// En el plan Gratis caben 6 en total; el servidor es quien lo hace cumplir.

import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { EmptyState } from '../componentes/EmptyState.jsx';
import { IlustracionCaja } from '../componentes/Ilustraciones.jsx';
import { ProductCard } from '../componentes/ProductCard.jsx';
import { AvisoError, Boton, Hoja, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { FormularioProducto } from './FormularioProducto.jsx';
import { BuscadorProductos, TendenciasSemana, useVistaInicial } from './Descubrir.jsx';

function Cupo({ usados, maximo }) {
  if (maximo == null) {
    return <p className="text-base font-medium text-stone-600">{usados === 1 ? '1 producto' : `${usados} productos`} · sin tope</p>;
  }
  const lleno = usados >= maximo;
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: maximo }, (_, i) => (
          <span key={i} className={`h-2 w-5 rounded-full transition-colors duration-300 ${i < usados ? (lleno ? 'bg-orange-700' : 'bg-amber-400') : 'bg-orange-200/80'}`} />
        ))}
      </div>
      <p className="text-base font-semibold tabular-nums text-stone-700">
        {usados} de {maximo}
      </p>
    </div>
  );
}

function ConfirmarBorrado({ producto, alCerrar }) {
  const { acciones } = useEstado();
  const borrar = useAccion(acciones.borrarProducto, { alExito: alCerrar });
  const limpiar = borrar.limpiar;
  useEffect(() => {
    if (producto) limpiar();
  }, [producto, limpiar]);

  return (
    <Hoja abierta={Boolean(producto)} alCerrar={alCerrar} titulo="¿Borrar este producto?">
      <p className="text-lg leading-snug text-stone-700">
        Vas a borrar <strong className="font-semibold text-stone-900">{producto?.nombre}</strong>. No se puede deshacer.
      </p>
      {borrar.error && <AvisoError className="mt-4" error={borrar.error} alReintentar={borrar.reintentar} reintentando={borrar.cargando} />}
      <div className="mt-6 space-y-3">
        <Boton variante="peligro" onClick={() => borrar.ejecutar(producto.id)} cargando={borrar.cargando} textoCargando="Borrando…">
          Sí, borrar
        </Boton>
        <Boton variante="secundario" onClick={alCerrar}>
          No, dejarlo
        </Boton>
      </div>
    </Hoja>
  );
}

const VISTAS = [
  { id: 'mis', nombre: 'Mis productos' },
  { id: 'descubrir', nombre: 'Descubre qué vender' },
];

export function Productos({ irA, foco }) {
  const [vista, setVista] = useVistaInicial(foco, 'mis');
  return (
    <div>
      <div role="tablist" aria-label="Productos" className="mb-6 grid grid-cols-2 gap-1 rounded-2xl bg-stone-200/60 p-1">
        {VISTAS.map((v) => {
          const activa = vista === v.id;
          return (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={activa}
              onClick={() => setVista(v.id)}
              className={`min-h-12 rounded-xl px-2 text-base font-semibold leading-tight transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700 ${
                activa ? 'bg-white text-stone-900 shadow-sm ring-1 ring-stone-900/5' : 'text-stone-600 hover:text-stone-900'
              }`}
            >
              {v.nombre}
            </button>
          );
        })}
      </div>
      {vista === 'mis' ? (
        <MisProductos irA={irA} verBuscador={() => setVista('descubrir')} />
      ) : (
        <div key="descubrir" className="anim-entrar space-y-10">
          <BuscadorProductos irA={irA} />
          <TendenciasSemana irA={irA} />
        </div>
      )}
    </div>
  );
}

function MisProductos({ irA, verBuscador }) {
  const { datos } = useEstado();
  const { productos, limites, plan } = datos;
  const [formulario, setFormulario] = useState({ abierta: false, producto: null });
  const [porBorrar, setPorBorrar] = useState(null);
  const [idNuevo, setIdNuevo] = useState(null);

  useEffect(() => {
    if (!idNuevo) return undefined;
    const t = setTimeout(() => setIdNuevo(null), 2600);
    return () => clearTimeout(t);
  }, [idNuevo]);

  const abrirNuevo = () => setFormulario({ abierta: true, producto: null });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Mis productos</h1>
          <p className="mt-1 text-base text-stone-600">Lo que recibiste de muestra y quieres mostrar.</p>
        </div>
        <Cupo usados={limites.productosUsados} maximo={limites.productosMax} />
      </div>

      {productos.length === 0 ? (
        <Tarjeta className="mt-6 p-5">
          <EmptyState
            ilustracion={IlustracionCaja}
            titulo="Todavía no tienes productos"
            texto="Agrega el que recibiste de muestra, o busca ideas de qué vender."
            accion={
              <div className="space-y-3">
                <Boton icono={Plus} onClick={abrirNuevo}>
                  Agregar mi producto
                </Boton>
                <Boton variante="secundario" icono={Search} onClick={verBuscador}>
                  Descubre qué vender
                </Boton>
              </div>
            }
          />
        </Tarjeta>
      ) : (
        <>
          {limites.puedeAgregarProducto ? (
            <Boton icono={Plus} className="mt-6 md:w-auto" onClick={abrirNuevo}>
              Agregar producto
            </Boton>
          ) : (
            <div className="anim-entrar mt-6 rounded-3xl bg-amber-100 p-5 ring-1 ring-inset ring-amber-300/70">
              <h2 className="text-lg font-bold text-amber-950">
                Llegaste a {limites.productosMax} productos, el máximo del plan {plan.nombre}
              </h2>
              <p className="mt-1 text-base leading-snug text-amber-950/85">
                Para agregar otro, borra uno que ya no uses. En los planes de pago no hay tope de productos.
              </p>
              <Boton variante="secundario" className="mt-4 min-h-12 md:w-auto" onClick={() => irA('planes')}>
                Ver los planes
              </Boton>
            </div>
          )}

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-4">
            {productos.map((p) => (
              <ProductCard
                key={p.id}
                producto={p}
                nuevo={p.id === idNuevo}
                alEditar={() => setFormulario({ abierta: true, producto: p })}
                alBorrar={() => setPorBorrar(p)}
              />
            ))}
          </div>
        </>
      )}

      <FormularioProducto
        abierta={formulario.abierta}
        producto={formulario.producto}
        alCerrar={() => setFormulario((f) => ({ ...f, abierta: false }))}
        alGuardar={(id) => {
          if (!formulario.producto) setIdNuevo(id);
        }}
      />
      <ConfirmarBorrado producto={porBorrar} alCerrar={() => setPorBorrar(null)} />
    </div>
  );
}

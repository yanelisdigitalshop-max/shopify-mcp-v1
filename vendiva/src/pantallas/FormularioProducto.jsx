// Hoja para agregar o editar un producto. Solo el nombre es obligatorio;
// lo demás está plegado para no asustar con un formulario largo.

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { AreaTexto, AvisoError, Boton, Campo, Hoja } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

const VACIO = { nombre: '', descripcion: '', precio: '', comisionPct: '', enlace: '' };

/** "14,99" o "14.99" -> 14.99. Vacío -> null. Texto raro -> NaN. */
function leerDecimal(texto) {
  const limpio = String(texto).trim().replace(/[$%\s]/g, '').replace(',', '.');
  if (!limpio) return null;
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN;
}

export function FormularioProducto({ abierta, alCerrar, producto = null, alGuardar }) {
  const { acciones } = useEstado();
  const editando = Boolean(producto);
  const [f, setF] = useState(VACIO);
  const [masDetalles, setMasDetalles] = useState(false);
  const [erroresLocales, setErroresLocales] = useState({});

  const guardar = useAccion((datos) => (editando ? acciones.editarProducto(producto.id, datos) : acciones.agregarProducto(datos)), {
    alExito: (valor) => {
      alGuardar?.(valor.productoId ?? producto?.id);
      alCerrar();
    },
  });
  const limpiarError = guardar.limpiar;

  // Cada vez que se abre, empieza limpia (o con los datos del producto a editar).
  useEffect(() => {
    if (!abierta) return;
    setF(
      producto
        ? {
            nombre: producto.nombre,
            descripcion: producto.descripcion ?? '',
            precio: producto.precio == null ? '' : String(producto.precio),
            comisionPct: producto.comisionPct == null ? '' : String(producto.comisionPct),
            enlace: producto.enlace ?? '',
          }
        : VACIO,
    );
    setMasDetalles(Boolean(producto && (producto.precio != null || producto.comisionPct != null || producto.enlace)));
    setErroresLocales({});
    limpiarError();
  }, [abierta, producto, limpiarError]);

  const poner = (campo) => (e) => setF((v) => ({ ...v, [campo]: e.target.value }));
  const errores = { ...(guardar.error?.campos ?? {}), ...erroresLocales };

  const enviar = async (e) => {
    e.preventDefault();
    const precio = leerDecimal(f.precio);
    const comisionPct = leerDecimal(f.comisionPct);
    const locales = {};
    if (f.nombre.trim().length < 2) locales.nombre = 'Escribe el nombre del producto.';
    if (Number.isNaN(precio)) locales.precio = 'Escribe el precio solo con números, por ejemplo 14.99';
    if (Number.isNaN(comisionPct)) locales.comisionPct = 'Escribe la comisión solo con números, por ejemplo 15';
    setErroresLocales(locales);
    if (Object.keys(locales).length) {
      if (locales.precio || locales.comisionPct) setMasDetalles(true);
      return;
    }

    const r = await guardar.ejecutar({ nombre: f.nombre, descripcion: f.descripcion, precio, comisionPct, enlace: f.enlace });
    if (!r.ok && (r.error.campos?.precio || r.error.campos?.comisionPct || r.error.campos?.enlace)) setMasDetalles(true);
  };

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo={editando ? 'Editar producto' : 'Agregar un producto'}>
      <form onSubmit={enviar} noValidate className="space-y-4">
        <Campo
          etiqueta="Nombre del producto"
          placeholder="Por ejemplo: cepillo alisador"
          value={f.nombre}
          onChange={poner('nombre')}
          error={errores.nombre}
          maxLength={80}
          autoFocus={!editando}
          required
        />
        <AreaTexto
          etiqueta="¿Qué es y a quién le sirve?"
          placeholder="Por ejemplo: alisa sin calor, para cabello con frizz."
          value={f.descripcion}
          onChange={poner('descripcion')}
          error={errores.descripcion}
          ayuda="Opcional. Mientras más cuentes, menos genéricos salen tus guiones."
          maxLength={500}
        />

        <div>
          <button
            type="button"
            onClick={() => setMasDetalles((v) => !v)}
            aria-expanded={masDetalles}
            className="flex w-full items-center justify-between rounded-2xl px-1 py-2 text-left text-base font-semibold text-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700"
          >
            Precio, comisión y enlace (opcional)
            <ChevronDown className={`h-5 w-5 transition-transform duration-200 ${masDetalles ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {masDetalles && (
            <div className="anim-entrar mt-2 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Campo etiqueta="Precio" antes="$" inputMode="decimal" placeholder="14.99" value={f.precio} onChange={poner('precio')} error={errores.precio} />
                <Campo
                  etiqueta="Comisión"
                  inputMode="decimal"
                  placeholder="15"
                  value={f.comisionPct}
                  onChange={poner('comisionPct')}
                  error={errores.comisionPct}
                  despues={<span className="pr-3 text-lg font-semibold text-stone-500">%</span>}
                />
              </div>
              <Campo
                etiqueta="Enlace del producto"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="https://…"
                value={f.enlace}
                onChange={poner('enlace')}
                error={errores.enlace}
              />
            </div>
          )}
        </div>

        {guardar.error && !guardar.error.campos && <AvisoError error={guardar.error} alReintentar={guardar.reintentar} reintentando={guardar.cargando} />}

        <Boton type="submit" cargando={guardar.cargando} textoCargando={editando ? 'Guardando cambios…' : 'Guardando tu producto…'}>
          {editando ? 'Guardar cambios' : 'Guardar producto'}
        </Boton>
      </form>
    </Hoja>
  );
}

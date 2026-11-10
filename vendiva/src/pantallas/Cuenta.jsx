// Mi cuenta: ver y corregir sus datos, su actividad reciente y cerrar sesión.

import { useState } from 'react';
import { Check, LogOut, Mail } from 'lucide-react';
import { MODOS_GRABACION, NEGOCIO, OBJETIVOS, REDES, formatoNumero } from '../../shared/datos.js';
import { AvisoError, Boton, Campo, Opcion, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { BotonAtras } from './Acceso.jsx';
import { ICONO_MODO, ICONO_OBJETIVO } from './Registro.jsx';

const cuando = (iso) => new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));

function describir({ tipo, detalle }) {
  switch (tipo) {
    case 'cuenta_creada':
      return 'Creaste tu cuenta';
    case 'registro_completo':
      return 'Terminaste tu registro';
    case 'seguidores_actualizados':
      return `Actualizaste tus seguidores: de ${formatoNumero(detalle.antes)} a ${formatoNumero(detalle.ahora)}`;
    case 'producto_agregado':
      return `Agregaste «${detalle.nombre}»`;
    case 'producto_editado':
      return `Editaste «${detalle.nombre}»`;
    case 'producto_borrado':
      return `Borraste «${detalle.nombre}»`;
    default:
      return null;
  }
}

export function Cuenta({ alVolver }) {
  const { datos, acciones } = useEstado();
  const { usuaria, perfil, historial } = datos;
  const [guardado, setGuardado] = useState(false);
  const guardar = useAccion(acciones.guardarPerfil, { alExito: () => setGuardado(true) });
  const salir = useAccion(acciones.salir);
  const [f, setF] = useState({
    nombre: usuaria.nombre,
    telefono: usuaria.telefono,
    nicho: perfil.nicho ?? '',
    modoGrabacion: perfil.modoGrabacion,
    objetivo: perfil.objetivo,
    usuarioTiktok: perfil.usuarioTiktok ?? '',
    redes: perfil.redes,
  });
  const poner = (campo, valor) => {
    setGuardado(false);
    setF((v) => ({ ...v, [campo]: valor }));
  };
  const alternarRed = (id) => poner('redes', f.redes.includes(id) ? f.redes.filter((x) => x !== id) : [...f.redes, id]);
  const errores = guardar.error?.campos ?? {};

  const enviar = (e) => {
    e.preventDefault();
    setGuardado(false);
    guardar.ejecutar(f);
  };

  const actividad = historial.map((h) => ({ ...h, texto: describir(h) })).filter((h) => h.texto).slice(0, 6);

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center gap-2">
        <BotonAtras onClick={alVolver} />
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Mi cuenta</h1>
      </div>

      <form onSubmit={enviar} noValidate className="mt-5 space-y-8">
        <section className="space-y-4" aria-label="Tus datos">
          <Campo etiqueta="Tu nombre completo" autoComplete="name" value={f.nombre} onChange={(e) => poner('nombre', e.target.value)} error={errores.nombre} />
          <Campo etiqueta="Tu teléfono" type="tel" inputMode="tel" autoComplete="tel" value={f.telefono} onChange={(e) => poner('telefono', e.target.value)} error={errores.telefono} />
          <div>
            <p className="mb-1.5 text-base font-semibold text-stone-800">Tu correo</p>
            <p className="flex min-h-14 items-center gap-3 rounded-2xl bg-stone-100 px-4 text-lg text-stone-700">
              <Mail className="h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
              <span className="truncate">{usuaria.correo}</span>
            </p>
          </div>
        </section>

        <section className="space-y-4" aria-label="Tu negocio">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">Tu negocio</h2>
          <Campo etiqueta="Mi nicho" value={f.nicho} onChange={(e) => poner('nicho', e.target.value)} error={errores.nicho} maxLength={60} />
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-stone-800">Cómo prefiero grabar</legend>
            <div className="space-y-3" role="radiogroup">
              {MODOS_GRABACION.map((m) => (
                <Opcion key={m.id} activa={f.modoGrabacion === m.id} alElegir={() => poner('modoGrabacion', m.id)} titulo={m.nombre} detalle={m.detalle} icono={ICONO_MODO[m.id]} />
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-2 text-base font-semibold text-stone-800">Mi objetivo</legend>
            <div className="space-y-3" role="radiogroup">
              {OBJETIVOS.map((o) => (
                <Opcion key={o.id} activa={f.objetivo === o.id} alElegir={() => poner('objetivo', o.id)} titulo={o.nombre} icono={ICONO_OBJETIVO[o.id]} />
              ))}
            </div>
          </fieldset>
        </section>

        <section className="space-y-4" aria-label="Tus redes">
          <h2 className="text-xl font-bold tracking-tight text-stone-900">Tus redes</h2>
          <Campo
            etiqueta="Tu usuario de TikTok"
            antes="@"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={f.usuarioTiktok}
            onChange={(e) => poner('usuarioTiktok', e.target.value.replace(/^@+/, '').replace(/\s/g, ''))}
            error={errores.usuarioTiktok}
            maxLength={24}
          />
          <div className="grid grid-cols-2 gap-3">
            {REDES.map((r) => (
              <Opcion key={r.id} multiple activa={f.redes.includes(r.id)} alElegir={() => alternarRed(r.id)} titulo={r.nombre} />
            ))}
          </div>
        </section>

        <div className="space-y-3">
          {guardar.error && !guardar.error.campos && <AvisoError error={guardar.error} alReintentar={guardar.reintentar} reintentando={guardar.cargando} />}
          {guardado && (
            <p className="anim-entrar flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-3 text-base font-semibold text-amber-950" role="status">
              <Check className="h-5 w-5" strokeWidth={3} aria-hidden="true" />
              Cambios guardados
            </p>
          )}
          <Boton type="submit" cargando={guardar.cargando} textoCargando="Guardando…">
            Guardar cambios
          </Boton>
        </div>
      </form>

      {actividad.length > 0 && (
        <section className="mt-10" aria-labelledby="titulo-actividad">
          <h2 id="titulo-actividad" className="text-xl font-bold tracking-tight text-stone-900">
            Tu actividad reciente
          </h2>
          <Tarjeta className="mt-3 divide-y divide-stone-100 px-5">
            {actividad.map((h) => (
              <div key={h.id} className="flex items-baseline justify-between gap-4 py-3.5">
                <p className="text-base leading-snug text-stone-800">{h.texto}</p>
                <p className="shrink-0 text-sm tabular-nums text-stone-500">{cuando(h.creadoEn)}</p>
              </div>
            ))}
          </Tarjeta>
        </section>
      )}

      <section className="mt-10 space-y-3">
        {salir.error && <AvisoError error={salir.error} alReintentar={salir.reintentar} reintentando={salir.cargando} />}
        <Boton variante="secundario" icono={LogOut} onClick={() => salir.ejecutar()} cargando={salir.cargando} textoCargando="Cerrando sesión…">
          Cerrar sesión
        </Boton>
      </section>

      <footer className="mt-8 text-center text-sm leading-relaxed text-stone-500">
        <p>
          ¿Necesitas ayuda? Escríbenos a{' '}
          <a href={`mailto:${NEGOCIO.correoSoporte}`} className="font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4">
            {NEGOCIO.correoSoporte}
          </a>
        </p>
        <p className="mt-1">
          {NEGOCIO.nombreApp} · {NEGOCIO.direccion}
        </p>
      </footer>
    </div>
  );
}

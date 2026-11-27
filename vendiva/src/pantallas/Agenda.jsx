// Parte 5: Programar, dentro de Hoy. Lo que le toca publicar ahora, lo que viene
// en los próximos días y lo que ya publicó. Gratis en todos los planes.
// Vendiva no publica en TikTok: aquí se le recuerda y ella lo marca como publicado.

import { useEffect, useState } from 'react';
import { BellRing, CalendarDays, Check, Clapperboard, FileText, Undo2 } from 'lucide-react';
import { BotonCopiar } from '../componentes/ScriptCard.jsx';
import { HojaProgramar, cuandoSePublica, diaLocal, nombreDelDia, soloHora } from '../componentes/Programar.jsx';
import { AvisoError, Boton, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

const PROXIMAS_VISIBLES = 6;

/** La hora del teléfono, al minuto: así "Te toca publicar" aparece solo cuando llega la hora. */
function useAhora() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  return ahora;
}

function IconoTipo({ tipo, className = '' }) {
  const Icono = tipo === 'video' ? Clapperboard : FileText;
  return <Icono className={className} aria-hidden="true" />;
}

const queEs = (p) => (p.tipo === 'video' ? 'Video' : `Guion ${p.numero}`);

/** Una publicación a la que le llegó la hora. */
function TeToca({ p, alCambiarHora }) {
  const { acciones } = useEstado();
  const marcar = useAccion(() => acciones.cambiarPublicacion(p.id, { publicada: true }));
  const textoPublicar = p.texto ? `${p.texto.caption}\n\n${p.texto.hashtags.join(' ')}` : null;

  return (
    <li className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-amber-300/70">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.1em] text-amber-900">
        <IconoTipo tipo={p.tipo} className="h-4 w-4" />
        {queEs(p)} · {p.productoNombre}
      </p>
      <p className="mt-1 text-lg font-bold leading-snug text-stone-900">{p.titulo}</p>
      <p className="text-base text-stone-600">Era para {cuandoSePublica(p.programadaPara)}.</p>

      {textoPublicar ? (
        <div className="mt-3 rounded-2xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200/70">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">Texto para publicar</p>
          <p className="mt-1 text-base leading-relaxed text-stone-800">{p.texto.caption}</p>
          <p className="mt-1 break-words text-base font-medium text-orange-800">{p.texto.hashtags.join(' ')}</p>
          <BotonCopiar texto={textoPublicar} etiqueta={`Copiar el texto para publicar de ${p.titulo}`} className="mt-2 w-full">
            Copiar texto y hashtags
          </BotonCopiar>
        </div>
      ) : (
        <p className="mt-2 text-base leading-snug text-stone-700">Súbelo a TikTok desde las descargas de tu teléfono. Si todavía no lo descargas, búscalo en los videos de su producto.</p>
      )}

      {marcar.error && <AvisoError className="mt-3" error={marcar.error} alReintentar={marcar.reintentar} reintentando={marcar.cargando} />}
      <div className="mt-3 space-y-2">
        <Boton icono={Check} className="min-h-12" onClick={() => marcar.ejecutar()} cargando={marcar.cargando} textoCargando="Guardando…">
          Ya lo publiqué
        </Boton>
        <Boton variante="secundario" className="min-h-12" onClick={() => alCambiarHora(p)} disabled={marcar.cargando}>
          Cambiar la hora
        </Boton>
      </div>
    </li>
  );
}

function FilaProxima({ p, alCambiarHora }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => alCambiarHora(p)}
        className="flex min-h-14 w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        aria-label={`${queEs(p)}: ${p.titulo}, ${cuandoSePublica(p.programadaPara)}. Cambiar la hora`}
      >
        <span className="w-[4.75rem] shrink-0 text-base font-bold tabular-nums text-stone-900">{soloHora(p.programadaPara)}</span>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
          <IconoTipo tipo={p.tipo} className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold text-stone-900">{p.titulo}</span>
          <span className="block truncate text-sm text-stone-600">
            {queEs(p)} · {p.productoNombre}
          </span>
        </span>
      </button>
    </li>
  );
}

function FilaPublicada({ p }) {
  const { acciones } = useEstado();
  const deshacer = useAccion(() => acciones.cambiarPublicacion(p.id, { publicada: false }));
  return (
    <li className="py-1.5">
      <div className="flex items-center gap-3">
        <Check className="h-5 w-5 shrink-0 text-orange-800" strokeWidth={2.5} aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-base text-stone-700">{p.titulo}</span>
        <button
          type="button"
          onClick={() => deshacer.ejecutar()}
          disabled={deshacer.cargando}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-base font-semibold text-orange-800 hover:bg-orange-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-700 disabled:text-stone-400"
          aria-label={`Deshacer: ${p.titulo} no está publicado`}
        >
          <Undo2 className="h-4 w-4" aria-hidden="true" />
          Deshacer
        </button>
      </div>
      {deshacer.error && <AvisoError className="mt-2" error={deshacer.error} />}
    </li>
  );
}

export function SeccionAgenda() {
  const { datos, acciones } = useEstado();
  const ahora = useAhora();
  const [cambiando, setCambiando] = useState(null); // la publicación a la que le cambia la hora
  const [verTodas, setVerTodas] = useState(false);
  const guardar = useAccion((id, iso) => acciones.cambiarPublicacion(id, { programadaPara: iso }), { alExito: () => setCambiando(null) });
  const quitar = useAccion((id) => acciones.quitarPublicacion(id), { alExito: () => setCambiando(null) });

  const { pendientes, publicadas } = datos.agenda;
  const toca = pendientes.filter((p) => new Date(p.programadaPara) <= ahora);
  const proximas = pendientes.filter((p) => new Date(p.programadaPara) > ahora);
  const visibles = verTodas ? proximas : proximas.slice(0, PROXIMAS_VISIBLES);

  // Las próximas, agrupadas por día.
  const dias = [];
  for (const p of visibles) {
    const clave = diaLocal(new Date(p.programadaPara));
    if (dias.at(-1)?.clave !== clave) dias.push({ clave, nombre: nombreDelDia(p.programadaPara, ahora), items: [] });
    dias.at(-1).items.push(p);
  }

  const abrirCambio = (p) => {
    guardar.limpiar();
    quitar.limpiar();
    setCambiando(p);
  };

  const vacio = pendientes.length === 0 && publicadas.length === 0;
  // Sin productos todavía no hay nada que programar: primero va "Tu producto de hoy".
  if (vacio && datos.productos.length === 0) return null;

  return (
    <section aria-labelledby="titulo-agenda">
      <h2 id="titulo-agenda" className="text-xl font-bold tracking-tight text-stone-900">
        Tu calendario
      </h2>

      {toca.length > 0 && (
        <div className="anim-entrar mt-3 rounded-3xl bg-amber-100 p-4 ring-1 ring-inset ring-amber-300/70 md:p-5" role="status">
          <p className="flex items-center gap-2 text-lg font-bold text-amber-950">
            <BellRing className="h-5 w-5" aria-hidden="true" />
            {toca.length === 1 ? 'Te toca publicar' : `Te toca publicar ${toca.length}`}
          </p>
          <ul className="mt-3 space-y-3">
            {toca.map((p) => (
              <TeToca key={p.id} p={p} alCambiarHora={abrirCambio} />
            ))}
          </ul>
        </div>
      )}

      {vacio ? (
        <Tarjeta className="mt-3 p-5">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-100 text-orange-800">
              <CalendarDays className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="min-w-0 text-base leading-relaxed text-stone-700">
              Elige cuándo publicar cada guion o video con el botón <strong className="font-semibold text-stone-900">Programar</strong>. A esa hora te lo
              recordamos aquí. Es gratis.
            </p>
          </div>
        </Tarjeta>
      ) : (
        (proximas.length > 0 || publicadas.length > 0) && (
          <Tarjeta className="mt-3 p-3 md:p-4">
            {proximas.length > 0 ? (
              <div className="space-y-3">
                {dias.map((d) => (
                  <div key={d.clave}>
                    <h3 className="px-2 pt-1 text-sm font-bold uppercase tracking-[0.1em] text-stone-500">{d.nombre}</h3>
                    <ul>
                      {d.items.map((p) => (
                        <FilaProxima key={p.id} p={p} alCambiarHora={abrirCambio} />
                      ))}
                    </ul>
                  </div>
                ))}
                {proximas.length > PROXIMAS_VISIBLES && (
                  <Boton variante="texto" className="min-h-12" onClick={() => setVerTodas((v) => !v)}>
                    {verTodas ? 'Ver menos' : `Ver las ${proximas.length} programadas`}
                  </Boton>
                )}
              </div>
            ) : (
              <p className="px-2 py-1 text-base text-stone-600">No tienes nada más programado. Toca «Programar» en un guion o en un video.</p>
            )}

            {publicadas.length > 0 && (
              <div className={`px-2 ${proximas.length > 0 ? 'mt-3 border-t border-stone-100 pt-3' : 'mt-2'}`}>
                <h3 className="text-sm font-bold uppercase tracking-[0.1em] text-stone-500">
                  Publicaste {publicadas.length} en los últimos 7 días
                </h3>
                <ul className="mt-1">
                  {publicadas.slice(0, 3).map((p) => (
                    <FilaPublicada key={p.id} p={p} />
                  ))}
                </ul>
              </div>
            )}
          </Tarjeta>
        )
      )}

      <HojaProgramar
        abierta={Boolean(cambiando)}
        alCerrar={() => setCambiando(null)}
        titulo={cambiando ? `${queEs(cambiando)}: ${cambiando.titulo}` : ''}
        existente={cambiando}
        alGuardar={(iso) => guardar.ejecutar(cambiando.id, iso)}
        guardando={guardar.cargando}
        error={guardar.error ?? quitar.error}
        alQuitar={() => quitar.ejecutar(cambiando.id)}
        quitando={quitar.cargando}
      />
    </section>
  );
}

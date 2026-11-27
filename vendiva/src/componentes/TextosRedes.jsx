// Parte 6: «Textos para mis redes» dentro de cada guion. Solo las redes que ella
// marcó además de TikTok (el guion ya trae el texto de TikTok). 1 crédito de texto
// por red, siempre con el aviso antes. Vendiva no publica: ella copia y pega.

import { useState } from 'react';
import { ChevronDown, Share2 } from 'lucide-react';
import { COSTOS_CREDITOS, REDES, REDES_CON_TEXTO } from '../../shared/datos.js';
import { CreditNotice } from './CreditNotice.jsx';
import { BotonCopiar } from './ScriptCard.jsx';
import { Boton } from './base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';

const FOCO = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';
const nombreRed = (id) => REDES.find((r) => r.id === id)?.nombre ?? id;

/** El texto de una red, listo para copiar. */
export function textoDeRed(red, t) {
  if (red === 'pinterest') return `${t.titulo}\n\n${t.descripcion}`;
  return t.hashtags?.length ? `${t.texto}\n\n${t.hashtags.join(' ')}` : t.texto;
}

function TextoDeRed({ red, t }) {
  return (
    <div className="rounded-2xl bg-stone-50 p-4 ring-1 ring-inset ring-stone-200/70">
      <p className="text-xs font-bold uppercase tracking-[0.1em] text-stone-500">{nombreRed(red)}</p>
      {red === 'pinterest' ? (
        <>
          <p className="mt-1.5 text-base font-semibold leading-snug text-stone-900">{t.titulo}</p>
          <p className="mt-1 text-base leading-relaxed text-stone-800">{t.descripcion}</p>
        </>
      ) : (
        <>
          <p className="mt-1.5 whitespace-pre-line text-base leading-relaxed text-stone-800">{t.texto}</p>
          {t.hashtags?.length > 0 && <p className="mt-2 break-words text-base font-medium text-orange-800">{t.hashtags.join(' ')}</p>}
        </>
      )}
      <BotonCopiar texto={textoDeRed(red, t)} etiqueta={`Copiar el texto para ${nombreRed(red)}`} className="mt-3 w-full">
        {red === 'pinterest' ? 'Copiar título y descripción' : 'Copiar texto y hashtags'}
      </BotonCopiar>
    </div>
  );
}

export function TextosRedes({ creacionId, numero, titulo, producto, irA }) {
  const { datos, acciones } = useEstado();
  const [aviso, setAviso] = useState(false);
  const [ver, setVer] = useState(false);
  const redes = REDES_CON_TEXTO.filter((r) => datos.perfil.redes.includes(r));
  const costo = redes.length * COSTOS_CREDITOS.textoRed;
  const hechos = datos.textosRedes?.[`${creacionId}:${numero}`] ?? null;
  const crear = useAccion(() => acciones.crearTextosRedes(creacionId, numero, costo), {
    alExito: () => {
      setAviso(false);
      setVer(true);
    },
  });

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-inset ring-stone-200">
      <p className="flex items-center gap-2 text-base font-bold text-stone-900">
        <Share2 className="h-5 w-5 text-orange-800" aria-hidden="true" />
        Textos para mis redes
      </p>

      {redes.length === 0 ? (
        <>
          <p className="mt-1 text-base leading-snug text-stone-600">
            El texto de TikTok ya está arriba. ¿Publicas también en Instagram, Facebook o Pinterest? Márcalas en Mi cuenta y aquí te escribimos el texto de cada una.
          </p>
          <Boton variante="secundario" className="mt-3 min-h-12" onClick={() => irA('cuenta')}>
            Marcar mis redes
          </Boton>
        </>
      ) : (
        <>
          <p className="mt-1 text-base leading-snug text-stone-600">
            Para {redes.map(nombreRed).join(', ').replace(/, ([^,]*)$/, ' y $1')}, a su estilo. {COSTOS_CREDITOS.textoRed} crédito de texto por red.
          </p>

          {hechos && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-expanded={ver}
                className={`flex min-h-12 w-full items-center justify-between rounded-2xl px-1 text-left text-base font-semibold text-orange-800 ${FOCO}`}
              >
                {ver ? 'Ocultar los textos' : 'Ver los textos que creaste'}
                <ChevronDown className={`h-5 w-5 shrink-0 transition-transform duration-200 ${ver ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {ver && (
                <div key={hechos.id} className="anim-entrar space-y-3 pt-1">
                  {hechos.redes.map((r) => hechos.contenido[r] && <TextoDeRed key={r} red={r} t={hechos.contenido[r]} />)}
                </div>
              )}
            </div>
          )}

          <Boton
            variante={hechos ? 'secundario' : 'suave'}
            className="mt-3 min-h-12"
            onClick={() => {
              crear.limpiar();
              setAviso(true);
            }}
          >
            {hechos ? 'Crear otra vez' : 'Crear mis textos'} · {costo} {costo === 1 ? 'crédito' : 'créditos'}
          </Boton>
        </>
      )}

      {redes.length > 0 && (
        <CreditNotice
          abierta={aviso}
          alCerrar={() => setAviso(false)}
          queSeCrea={`Textos para ${redes.map(nombreRed).join(', ').replace(/, ([^,]*)$/, ' y $1')}`}
          paraQue={`${titulo} · ${producto.nombre}`}
          costo={costo}
          saldo={datos.creditos}
          plan={datos.plan}
          unidad="de texto"
          nota={hechos ? 'Los textos nuevos reemplazan a los que tienes aquí.' : null}
          creando={crear.cargando}
          textoCreando="Escribiendo tus textos…"
          error={crear.error}
          alConfirmar={() => crear.ejecutar()}
          irAPlanes={() => {
            setAviso(false);
            irA('planes');
          }}
        />
      )}
    </div>
  );
}

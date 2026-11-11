// Aviso antes de gastar créditos. Obligatorio antes de CUALQUIER creación que
// cueste: dice qué se va a crear, cuánto cuesta, el saldo de hoy y cuánto queda.
// Nada se crea hasta que ella toca "Sí, crear".

import { formatoNumero, planFrenaEnCero } from '../../shared/datos.js';
import { LoadingPulse } from './LoadingPulse.jsx';
import { AvisoError, Boton, Hoja } from './base.jsx';

/** '2026-12-01' -> '1 de diciembre' */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

function Fila({ etiqueta, valor, fuerte = false }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-3 ${fuerte ? 'border-t border-stone-200' : ''}`}>
      <dt className={`text-lg ${fuerte ? 'font-bold text-stone-900' : 'text-stone-700'}`}>{etiqueta}</dt>
      <dd className={`tabular-nums ${fuerte ? 'text-2xl font-extrabold text-stone-900' : 'text-lg font-semibold text-stone-900'}`}>{valor}</dd>
    </div>
  );
}

const creditos = (n) => `${formatoNumero(n)} ${n === 1 ? 'crédito' : 'créditos'}`;

/**
 * @param {object} p
 * @param {string} p.queSeCrea      por ejemplo "Guion completo para un en vivo"
 * @param {string} [p.paraQue]      por ejemplo el nombre del producto
 * @param {number} p.costo
 * @param {{ total: number, renuevaEl: string }} p.saldo
 * @param {{ id: string, nombre: string }} p.plan
 * @param {boolean} [p.gratis]      la creación entra en sus videos gratis del mes (Parte 4)
 * @param {string} [p.nota]         algo que conviene saber antes de gastar
 * @param {boolean} p.creando
 * @param {string} p.textoCreando   "Escribiendo tu guion para el en vivo…"
 * @param {object} [p.error]
 */
export function CreditNotice({ abierta, alCerrar, queSeCrea, paraQue, costo, saldo, plan, gratis = false, nota, creando, textoCreando, error, alConfirmar, irAPlanes }) {
  const cuesta = gratis ? 0 : costo;
  const alcanza = saldo.total >= cuesta;
  const frena = !alcanza && planFrenaEnCero(plan.id);
  const despues = Math.max(0, saldo.total - cuesta);
  // Si el servidor frenó (por ejemplo, gastó desde otro teléfono), se muestra el mismo aviso de "se terminó".
  const frenoDelServidor = error?.codigo === 'CREDITOS_INSUFICIENTES';

  if (creando) {
    return (
      <Hoja abierta={abierta} alCerrar={() => {}} titulo={queSeCrea}>
        <LoadingPulse texto={textoCreando} lineas={2} className="pb-2" />
        <p className="mt-4 text-base text-stone-600">Puede tardar hasta medio minuto. No cierres esta pantalla.</p>
      </Hoja>
    );
  }

  if (frena || frenoDelServidor) {
    return (
      <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Ya se te terminó lo gratis de este mes">
        <p className="text-lg leading-snug text-stone-700">
          <strong className="font-semibold text-stone-900">{queSeCrea}</strong> cuesta {creditos(costo)} y te {saldo.total === 1 ? 'queda' : 'quedan'}{' '}
          <strong className="font-semibold text-stone-900">{formatoNumero(saldo.total)}</strong>. No se creó ni se cobró nada.
        </p>
        <p className="mt-3 text-base leading-snug text-stone-600">
          Tus créditos se renuevan solos el {fechaLarga(saldo.renuevaEl)}. Los guiones no gastan créditos.
        </p>
        <div className="mt-6 space-y-3">
          <Boton onClick={irAPlanes}>Comprar créditos y seguir creando</Boton>
          <Boton variante="secundario" onClick={irAPlanes}>
            Subir de plan
          </Boton>
        </div>
      </Hoja>
    );
  }

  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Antes de crear">
      <p className="text-lg leading-snug text-stone-700">
        Vas a crear: <strong className="font-semibold text-stone-900">{queSeCrea}</strong>
        {paraQue && (
          <>
            {' '}
            para <strong className="font-semibold text-stone-900">{paraQue}</strong>
          </>
        )}
        .
      </p>

      <dl className="mt-4 rounded-2xl bg-white px-4 ring-1 ring-stone-900/5">
        <Fila etiqueta="Cuesta" valor={gratis ? 'Gratis' : creditos(costo)} />
        <Fila etiqueta="Tu saldo hoy" valor={creditos(saldo.total)} />
        <Fila etiqueta="Te quedan" valor={creditos(despues)} fuerte />
      </dl>

      {gratis && <p className="mt-3 text-base leading-snug text-stone-600">Entra en tus videos gratis de este mes: no gasta créditos.</p>}
      {!alcanza && !gratis && (
        <p className="mt-3 rounded-2xl bg-amber-100 px-4 py-3 text-base leading-snug text-amber-950">
          Tu saldo no alcanza, pero el plan {plan.nombre} no frena: se descuenta lo que te queda y se crea igual.
        </p>
      )}
      {nota && <p className="mt-3 rounded-2xl bg-amber-100 px-4 py-3 text-base leading-snug text-amber-950">{nota}</p>}

      {error && <AvisoError className="mt-4" error={error} alReintentar={alConfirmar} />}

      <div className="mt-6 space-y-3">
        <Boton onClick={alConfirmar}>{gratis ? 'Sí, crear gratis' : 'Sí, crear'}</Boton>
        <Boton variante="secundario" onClick={alCerrar}>
          Ahora no
        </Boton>
      </div>
    </Hoja>
  );
}

// Pestaña Planes: su plan de hoy, su saldo, los 4 planes y los paquetes de créditos.
// Parte 7: pagos con Stripe, EN MODO DE PRUEBA (nadie cobra nada de verdad).
//   - Antes de pagar, siempre: qué se cobra, cuándo, cómo cancelar, sin reembolsos y
//     la casilla de los términos (borrador). Nada se cobra sin su «sí».
//   - Pagar abre la página de pago de Stripe; al volver, el servidor ya sabe si se pagó.

import { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, CreditCard, ExternalLink, FileText, FlaskConical, Info, Package, Receipt, TriangleAlert } from 'lucide-react';
import { ORDEN_PLANES, PAQUETES_CREDITOS, PLANES, formatoNumero } from '../../shared/datos.js';
import { TERMINOS, TERMINOS_ES_BORRADOR } from '../../shared/terminos.js';
import { PlanCard } from '../componentes/PlanCard.jsx';
import { AvisoError, Boton, Casilla, Hoja, Tarjeta } from '../componentes/base.jsx';
import { useAccion, useEstado } from '../estado/Estado.jsx';
import { abrirEnNavegador, esApp } from '../nativo.js';

/** '2026-12-01' -> '1 de diciembre' (sin pasar por zonas horarias). */
function fechaLarga(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(new Date(a, m - 1, d));
}

function Dato({ etiqueta, valor, detalle }) {
  return (
    <div>
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">{etiqueta}</p>
      <p className="mt-1 text-4xl font-extrabold tracking-tight tabular-nums text-stone-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-base text-stone-600">{detalle}</p>}
    </div>
  );
}

/** Ir a la página de pago de Stripe (o de su forma de pago). En la app, se abre en el navegador. */
const irA = (url) => abrirEnNavegador(url);

// ── Términos (borrador) ────────────────────────────────────────────────────────

function HojaTerminos({ abierta, alCerrar }) {
  return (
    <Hoja abierta={abierta} alCerrar={alCerrar} titulo="Términos de pago y cancelación">
      {TERMINOS_ES_BORRADOR && (
        <p className="mb-4 rounded-2xl bg-amber-100 px-4 py-3 text-base font-semibold leading-snug text-amber-950">
          Borrador: lo revisan la dueña o un abogado antes de cobrar de verdad.
        </p>
      )}
      <div className="space-y-4">
        {TERMINOS.map((t) => (
          <section key={t.titulo}>
            <h3 className="text-lg font-bold text-stone-900">{t.titulo}</h3>
            <p className="mt-1 text-base leading-relaxed text-stone-700">{t.texto}</p>
          </section>
        ))}
      </div>
      <Boton variante="secundario" className="mt-6 min-h-12" onClick={alCerrar}>
        Cerrar
      </Boton>
    </Hoja>
  );
}

// ── El aviso antes de pagar ────────────────────────────────────────────────────

function Linea({ children }) {
  return (
    <li className="flex gap-2.5 text-base leading-snug text-stone-800">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/**
 * Lo que va a pasar, con todas las condiciones, la casilla de los términos y el botón.
 * `pedido`: { tipo: 'plan', plan } o { tipo: 'paquete', paquete }.
 */
function HojaPago({ pedido, alCerrar }) {
  const { datos, acciones } = useEstado();
  const [acepta, setAcepta] = useState(false);
  const [verTerminos, setVerTerminos] = useState(false);
  const [listo, setListo] = useState(null);
  const pagar = useAccion(
    () => (pedido.tipo === 'plan' ? acciones.elegirPlan(pedido.plan) : acciones.comprarPaquete(pedido.paquete)),
    {
      alExito: (r) => {
        if (r.url) irA(r.url);
        else setListo(r.cambio);
      },
    },
  );
  useEffect(() => {
    setAcepta(false);
    setListo(null);
    pagar.limpiar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedido]);

  if (!pedido) return null;
  const suscripcion = datos.pagos.suscripcion;
  const actual = datos.plan;
  const renueva = datos.creditos.renuevaEl;
  let titulo;
  let lineas;
  let boton;

  if (pedido.tipo === 'paquete') {
    const p = PAQUETES_CREDITOS.find((x) => x.id === pedido.paquete);
    titulo = `Paquete ${p.nombre}`;
    lineas = [
      `${formatoNumero(p.creditos)} créditos de video por $${p.precio}, una sola vez (no se renueva).`,
      'Llegan a tu cuenta en cuanto se confirma el pago, y no vencen.',
      'Son solo para videos: no pagan la voz de IA ni los textos.',
      'No se reembolsan una vez que los créditos llegan a tu cuenta.',
    ];
    boton = `Ir a pagar $${p.precio}`;
  } else {
    const nuevo = PLANES[pedido.plan];
    const sube = suscripcion && nuevo.precioMes > actual.precioMes;
    const baja = suscripcion && nuevo.precioMes < actual.precioMes;
    const seQueda = suscripcion && nuevo.id === actual.id;
    const creditos = `${formatoNumero(nuevo.creditosTextoMes)} de texto y ${formatoNumero(nuevo.creditosVideoMes)} de video`;
    if (seQueda) {
      titulo = `Seguir en ${nuevo.nombre}`;
      lineas = [`Sigues en ${nuevo.nombre} por $${nuevo.precioMes} al mes.`, `Tu próximo cobro es el ${fechaLarga(renueva)}.`];
      boton = `Seguir en ${nuevo.nombre}`;
    } else if (sube) {
      titulo = `Subir a ${nuevo.nombre}`;
      lineas = [
        `El cambio es ahora mismo y recibes ya tus créditos de ${nuevo.nombre}: ${creditos}.`,
        `Hoy se cobra solo la diferencia por los días que faltan hasta el ${fechaLarga(renueva)}.`,
        `Desde el ${fechaLarga(renueva)}, $${nuevo.precioMes} al mes, el mismo día de cada mes.`,
        'Puedes cancelar cuando quieras desde aquí. Sin reembolsos: al cancelar, no se vuelve a cobrar.',
      ];
      boton = `Subir a ${nuevo.nombre} ahora`;
    } else if (baja) {
      titulo = `Cambiar a ${nuevo.nombre}`;
      lineas = [
        `Sigues en ${actual.nombre} hasta el ${fechaLarga(renueva)}. Hoy no se cobra nada.`,
        `Desde el ${fechaLarga(renueva)}, ${nuevo.nombre} por $${nuevo.precioMes} al mes, con ${creditos} cada mes.`,
        'Puedes cancelar cuando quieras desde aquí.',
      ];
      boton = `Cambiar a ${nuevo.nombre} desde el ${fechaLarga(renueva)}`;
    } else {
      titulo = `Pasar a ${nuevo.nombre}`;
      lineas = [
        `$${nuevo.precioMes} al mes. Se cobra hoy y se renueva solo cada mes, el mismo día, hasta que canceles.`,
        `Al pagar recibes enseguida tus créditos del mes: ${creditos}. Se reponen en cada cobro (no se acumulan).`,
        'Puedes cancelar cuando quieras desde aquí: sigues en tu plan hasta el fin del mes pagado y no se vuelve a cobrar.',
        'Sin reembolsos del mes ya pagado.',
      ];
      boton = `Ir a pagar $${nuevo.precioMes}`;
    }
  }

  if (listo) {
    const nuevo = PLANES[pedido.plan];
    return (
      <Hoja abierta alCerrar={alCerrar} titulo={titulo}>
        <p className="flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-lg font-semibold leading-snug text-amber-950" role="status">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          {listo === 'inmediato'
            ? `Listo: ya estás en ${nuevo.nombre} y tienes tus créditos nuevos.`
            : listo === 'al_final'
              ? `Listo: desde el ${fechaLarga(renueva)} pasas a ${nuevo.nombre}.`
              : `Listo: sigues en ${nuevo.nombre}.`}
        </p>
        <Boton className="mt-5" onClick={alCerrar}>
          Cerrar
        </Boton>
      </Hoja>
    );
  }

  return (
    <Hoja abierta alCerrar={() => !pagar.cargando && alCerrar()} titulo={titulo}>
      <ul className="space-y-2.5">
        {lineas.map((l) => (
          <Linea key={l}>{l}</Linea>
        ))}
      </ul>
      {datos.pagos.modo === 'prueba' && (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-sky-50 px-4 py-3 text-base leading-snug text-sky-950 ring-1 ring-inset ring-sky-200">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          Modo de prueba: no se cobra nada de verdad.
        </p>
      )}
      <div className="mt-5">
        <Casilla etiqueta="Acepto los términos de pago y cancelación" marcada={acepta} alCambiar={setAcepta} />
        <button
          type="button"
          onClick={() => setVerTerminos(true)}
          className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-base font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4"
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          Leer los términos
        </button>
      </div>
      {pagar.error && <AvisoError className="mt-4" error={pagar.error} alReintentar={pagar.reintentar} reintentando={pagar.cargando} />}
      <Boton className="mt-4" icono={CreditCard} disabled={!acepta} cargando={pagar.cargando} textoCargando="Un momento…" onClick={() => pagar.ejecutar()}>
        {boton}
      </Boton>
      <HojaTerminos abierta={verTerminos} alCerrar={() => setVerTerminos(false)} />
    </Hoja>
  );
}

// ── En la app del teléfono: pagar en la web (opción b, decisión de la dueña, 27 nov 2026) ──

/**
 * En la app no se compra nada adentro: se abre la página de Planes de Vendiva en el navegador
 * del teléfono, ya con su sesión (enlace de un solo uso), y ahí se paga como en la web.
 */
function HojaPagoWeb({ abierta, alCerrar }) {
  const { acciones } = useEstado();
  const [abierto, setAbierto] = useState(false);
  const abrir = useAccion(async () => {
    const { url } = await acciones.enlaceWeb();
    await abrirEnNavegador(url);
    setAbierto(true);
  });
  const cerrar = () => {
    setAbierto(false);
    abrir.limpiar();
    alCerrar();
  };
  return (
    <Hoja abierta={abierta} alCerrar={() => !abrir.cargando && cerrar()} titulo="Pagar en la web de Vendiva">
      {abierto ? (
        <>
          <p className="flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-lg font-semibold leading-snug text-amber-950" role="status">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
            Abrimos tu navegador. Cuando termines, vuelve aquí: tu plan y tus créditos se actualizan solos.
          </p>
          <Boton className="mt-5" onClick={cerrar}>
            Listo
          </Boton>
        </>
      ) : (
        <>
          <ul className="space-y-2.5">
            <Linea>Los planes y los paquetes se pagan en la página web de Vendiva, con Stripe.</Linea>
            <Linea>Se abre el navegador de tu teléfono, ya con tu cuenta (sin escribir tu contraseña).</Linea>
            <Linea>Al terminar, vuelve a la app: todo se actualiza solo.</Linea>
          </ul>
          {abrir.error && <AvisoError className="mt-4" error={abrir.error} alReintentar={abrir.reintentar} reintentando={abrir.cargando} />}
          <Boton className="mt-5" icono={ExternalLink} onClick={() => abrir.ejecutar()} cargando={abrir.cargando} textoCargando="Abriendo…">
            Abrir en el navegador
          </Boton>
          <Boton variante="secundario" className="mt-3" onClick={cerrar} disabled={abrir.cargando}>
            Ahora no
          </Boton>
        </>
      )}
    </Hoja>
  );
}

// ── Su suscripción ─────────────────────────────────────────────────────────────

function HojaCancelar({ abierta, alCerrar }) {
  const { datos, acciones } = useEstado();
  const cancelar = useAccion(acciones.cancelarPlan, { alExito: alCerrar });
  return (
    <Hoja abierta={abierta} alCerrar={() => !cancelar.cargando && alCerrar()} titulo="Cancelar mi plan">
      <ul className="space-y-2.5">
        <Linea>Sigues en {datos.plan.nombre} hasta el {fechaLarga(datos.creditos.renuevaEl)}, con todo lo que ya pagaste.</Linea>
        <Linea>No se te vuelve a cobrar.</Linea>
        <Linea>
          Después vuelves a Gratis: {PLANES.gratis.creditosTextoMes} créditos de texto al mes y máximo {PLANES.gratis.maxProductos} productos. Si tienes más, los
          conservas, pero no puedes agregar otros.
        </Linea>
        <Linea>Tus créditos de paquetes no vencen: los sigues teniendo.</Linea>
        <Linea>Sin reembolsos del mes ya pagado.</Linea>
      </ul>
      {cancelar.error && <AvisoError className="mt-4" error={cancelar.error} alReintentar={cancelar.reintentar} reintentando={cancelar.cargando} />}
      <div className="mt-5 space-y-3">
        <Boton variante="peligro" onClick={() => cancelar.ejecutar()} cargando={cancelar.cargando} textoCargando="Cancelando…">
          Sí, cancelar mi plan
        </Boton>
        <Boton variante="secundario" onClick={alCerrar} disabled={cancelar.cargando}>
          Seguir con mi plan
        </Boton>
      </div>
    </Hoja>
  );
}

function BotonPortal({ children, variante = 'secundario' }) {
  const { acciones } = useEstado();
  const portal = useAccion(acciones.abrirPortal, { alExito: (r) => irA(r.url) });
  return (
    <>
      <Boton variante={variante} icono={Receipt} className="min-h-12" onClick={() => portal.ejecutar()} cargando={portal.cargando} textoCargando="Abriendo…">
        {children}
      </Boton>
      {portal.error && <AvisoError className="mt-2" error={portal.error} />}
    </>
  );
}

function TuSuscripcion() {
  const { datos, acciones } = useEstado();
  const [cancelar, setCancelar] = useState(false);
  const reanudar = useAccion(acciones.reanudarPlan);
  const sus = datos.pagos.suscripcion;
  const fecha = fechaLarga(datos.creditos.renuevaEl);

  return (
    <Tarjeta className="mt-5 p-5 md:p-6">
      <p className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">Tu suscripción</p>
      {sus.pagoFallido && (
        <div className="mt-3 rounded-2xl bg-red-50 p-4 ring-1 ring-inset ring-red-200" role="alert">
          <p className="flex items-start gap-2.5 text-base font-semibold leading-snug text-red-900">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            Tu último cobro no pasó. Lo vamos a intentar otra vez en unos días: actualiza tu forma de pago para no perder tu plan.
          </p>
          <div className="mt-3">
            <BotonPortal variante="primario">Actualizar mi forma de pago</BotonPortal>
          </div>
        </div>
      )}
      <p className="mt-3 flex items-start gap-3 text-lg leading-snug text-stone-800">
        <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
        <span>
          {sus.cancelaAlFinal ? (
            <>
              Cancelaste: sigues en <strong className="font-semibold">{datos.plan.nombre}</strong> hasta el <strong className="font-semibold">{fecha}</strong> y después vuelves
              a Gratis. No se te vuelve a cobrar.
            </>
          ) : sus.planSiguiente ? (
            <>
              Sigues en <strong className="font-semibold">{datos.plan.nombre}</strong> hasta el <strong className="font-semibold">{fecha}</strong>. Desde ese día pasas a{' '}
              <strong className="font-semibold">{PLANES[sus.planSiguiente].nombre}</strong> (${PLANES[sus.planSiguiente].precioMes} al mes).
            </>
          ) : (
            <>
              {datos.plan.nombre}, ${datos.plan.precioMes} al mes. Tu próximo cobro es el <strong className="font-semibold">{fecha}</strong>, y ese día se reponen tus créditos.
            </>
          )}
        </span>
      </p>
      <div className="mt-4 space-y-3">
        {sus.cancelaAlFinal ? (
          <>
            {reanudar.error && <AvisoError error={reanudar.error} alReintentar={reanudar.reintentar} />}
            <Boton onClick={() => reanudar.ejecutar()} cargando={reanudar.cargando} textoCargando="Guardando…">
              Seguir con mi plan
            </Boton>
          </>
        ) : (
          <Boton variante="secundario" className="min-h-12" onClick={() => setCancelar(true)}>
            Cancelar mi plan
          </Boton>
        )}
        <BotonPortal>Mis recibos y forma de pago</BotonPortal>
      </div>
      <HojaCancelar abierta={cancelar} alCerrar={() => setCancelar(false)} />
    </Tarjeta>
  );
}

// ── Al volver de la página de Stripe ───────────────────────────────────────────

function useRegresoDePago() {
  const { datos, acciones } = useEstado();
  const [regreso] = useState(() => new URLSearchParams(window.location.search).get('pago'));
  const [desde] = useState(() => Date.now() - 15 * 60 * 1000);
  // Confirmado: el servidor ya anotó un pago de los últimos minutos (lo anota cuando Stripe avisa).
  const confirmado =
    regreso === 'listo' && datos.historial.some((h) => (h.tipo === 'pago_plan' || h.tipo === 'pago_paquete') && new Date(h.creadoEn).getTime() >= desde);

  useEffect(() => {
    if (regreso) window.history.replaceState(null, '', `${window.location.pathname}#planes`);
  }, [regreso]);

  // Stripe avisa al servidor por su lado: se revisa unas cuantas veces hasta que llega.
  useEffect(() => {
    if (regreso !== 'listo' || confirmado) return undefined;
    let vueltas = 0;
    const t = setInterval(() => {
      vueltas += 1;
      acciones.refrescar();
      if (vueltas >= 15) clearInterval(t);
    }, 2000);
    return () => clearInterval(t);
  }, [regreso, confirmado, acciones]);

  return { regreso, confirmado };
}

function AvisoRegreso({ regreso, confirmado }) {
  if (regreso === 'cancelado') {
    return (
      <p className="anim-entrar mt-4 flex items-start gap-3 rounded-2xl bg-white px-4 py-3 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5" role="status">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
        No terminaste el pago. No se cobró nada.
      </p>
    );
  }
  if (regreso !== 'listo') return null;
  return (
    <p className="anim-entrar mt-4 flex items-start gap-3 rounded-2xl bg-amber-100 px-4 py-3 text-base font-semibold leading-snug text-amber-950" role="status">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      {confirmado
        ? '¡Listo! Tu pago quedó confirmado. Si empezaste en la app de Vendiva, ya puedes volver a ella.'
        : 'Recibimos tu pago. Estamos esperando la confirmación de Stripe; tarda unos segundos…'}
    </p>
  );
}

// ── La pantalla ────────────────────────────────────────────────────────────────

export function Planes() {
  const { datos } = useEstado();
  const { plan, creditos, limites, pagos } = datos;
  const [pedido, setPedido] = useState(null);
  const [cancelar, setCancelar] = useState(false);
  const [verTerminos, setVerTerminos] = useState(false);
  const [pagoWeb, setPagoWeb] = useState(false);
  const { regreso, confirmado } = useRegresoDePago();
  // En la app del teléfono no se compra adentro: todo lo que cobra se hace en la web.
  const pedir = (p) => (esApp() ? setPagoWeb(true) : setPedido(p));
  const sus = pagos.suscripcion;

  /** El botón y la nota de cada tarjeta de plan. */
  function accionDe(id) {
    if (!pagos.disponible) return {};
    const p = PLANES[id];
    if (id === plan.id) {
      if (sus?.cancelaAlFinal || sus?.planSiguiente) {
        return { accion: <Boton variante="oscuro" className="min-h-12" onClick={() => setPedido({ tipo: 'plan', plan: id })}>Seguir en {p.nombre}</Boton> };
      }
      return {};
    }
    if (id === 'gratis') {
      if (!sus || sus.cancelaAlFinal) return { nota: sus ? `Vuelves a Gratis el ${fechaLarga(creditos.renuevaEl)}.` : null };
      return { accion: <Boton variante="secundario" className="min-h-12" onClick={() => setCancelar(true)}>Volver a Gratis</Boton> };
    }
    if (sus?.planSiguiente === id) return { nota: `Pasas a ${p.nombre} el ${fechaLarga(creditos.renuevaEl)}.` };
    const sube = !sus || p.precioMes > plan.precioMes;
    return {
      accion: (
        <Boton variante={sube ? 'primario' : 'secundario'} className="min-h-12" onClick={() => pedir({ tipo: 'plan', plan: id })}>
          {sus ? (sube ? `Subir a ${p.nombre}` : `Cambiar a ${p.nombre}`) : `Elegir ${p.nombre}`}
        </Boton>
      ),
    };
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900">Tu plan</h1>
      <p className="mt-1 text-base text-stone-600">
        Estás en el plan <strong className="font-semibold text-stone-900">{plan.nombre}</strong>.
      </p>

      <AvisoRegreso regreso={regreso} confirmado={confirmado} />
      {pagos.modo === 'prueba' && (
        <p className="mt-4 flex items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3 text-base leading-snug text-sky-950 ring-1 ring-inset ring-sky-200">
          <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">Modo de prueba:</strong> no se cobra nada de verdad. Para probar, usa la tarjeta 4242 4242 4242 4242, cualquier fecha futura y
            cualquier código.
          </span>
        </p>
      )}

      <Tarjeta className="mt-5 p-5 md:p-6">
        <div className="grid grid-cols-2 gap-5">
          <Dato etiqueta="Créditos de texto" valor={formatoNumero(creditos.total)} detalle={`de ${formatoNumero(plan.creditosTextoMes)} este mes`} />
          {creditos.videoGratis?.incluido && creditos.video.total === 0 ? (
            <Dato
              etiqueta="Video gratis"
              valor={creditos.videoGratis.disponible ? '1' : '0'}
              detalle={creditos.videoGratis.disponible ? `video corto de ${creditos.videoGratis.segundos} s este mes` : 'ya lo usaste este mes'}
            />
          ) : (
            <Dato
              etiqueta="Créditos de video"
              valor={formatoNumero(creditos.video.total)}
              detalle={
                creditos.video.paquete > 0
                  ? `${formatoNumero(creditos.video.plan)} del plan + ${formatoNumero(creditos.video.paquete)} de paquetes`
                  : `de ${formatoNumero(plan.creditosVideoMes)} este mes`
              }
            />
          )}
          <Dato
            etiqueta="Productos"
            valor={limites.productosMax == null ? formatoNumero(limites.productosUsados) : `${limites.productosUsados}/${limites.productosMax}`}
            detalle={limites.productosMax == null ? 'sin tope' : 'guardados'}
          />
        </div>
        <p className="mt-5 flex items-start gap-3 border-t border-stone-200 pt-4 text-base leading-snug text-stone-700">
          <CalendarClock className="mt-0.5 h-5 w-5 shrink-0 text-orange-800" aria-hidden="true" />
          <span>
            Tus créditos del plan se renuevan solos el <strong className="font-semibold text-stone-900">{fechaLarga(creditos.renuevaEl)}</strong>
            {sus ? ', con tu cobro mensual' : ''}.{' '}
            {limites.guionesMax == null
              ? 'Los guiones no gastan créditos.'
              : `Los guiones no gastan créditos hasta ${limites.guionesMax} veces al mes; después, 1 crédito cada vez.`}{' '}
            Los créditos de texto son para el guion de en vivo, las respuestas, los GIFs, la voz de IA y los textos para tus redes; los de video, solo para videos
            {creditos.videoGratis?.incluido ? ' (en el plan Gratis viene 1 video corto gratis al mes)' : ''}. Los paquetes de créditos son de video y no vencen.
          </span>
        </p>
      </Tarjeta>

      {sus && <TuSuscripcion />}

      <h2 className="mt-9 text-xl font-bold tracking-tight text-stone-900">Los 4 planes</h2>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[repeat(2,minmax(0,1fr))] md:gap-4">
        {ORDEN_PLANES.map((id) => (
          <PlanCard key={id} plan={PLANES[id]} actual={id === plan.id} {...accionDe(id)} />
        ))}
      </div>

      {pagos.disponible && (
        <section aria-labelledby="titulo-paquetes" className="mt-9">
          <h2 id="titulo-paquetes" className="text-xl font-bold tracking-tight text-stone-900">
            Paquetes de créditos de video
          </h2>
          <p className="mt-1 text-base text-stone-600">Compra única, sin renovación. No vencen. Solo para videos.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {PAQUETES_CREDITOS.map((p) => (
              <Tarjeta key={p.id} className="flex flex-col p-4">
                <p className="flex items-center gap-2 text-base font-bold text-stone-900">
                  <Package className="h-5 w-5 text-orange-800" aria-hidden="true" />
                  {p.nombre}
                </p>
                <p className="mt-2 text-2xl font-extrabold tabular-nums text-stone-900">{formatoNumero(p.creditos)}</p>
                <p className="text-sm text-stone-600">créditos de video</p>
                <Boton variante="suave" className="mt-3 min-h-12" onClick={() => pedir({ tipo: 'paquete', paquete: p.id })}>
                  ${p.precio}
                </Boton>
              </Tarjeta>
            ))}
          </div>
        </section>
      )}

      {pagos.disponible ? (
        <p className="mt-6 text-center text-base text-stone-600">
          Pagos con tarjeta, Apple Pay, Google Pay y más, a través de Stripe. Vendiva no guarda los números de tu tarjeta.{' '}
          <button type="button" onClick={() => setVerTerminos(true)} className="font-semibold text-orange-800 underline decoration-orange-300 underline-offset-4">
            Términos de pago y cancelación
          </button>
        </p>
      ) : (
        <p className="mt-5 flex items-start gap-3 rounded-2xl bg-white p-4 text-base leading-snug text-stone-700 ring-1 ring-stone-900/5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-stone-500" aria-hidden="true" />
          <span>Los pagos todavía no están activos. Nadie cobra nada.</span>
        </p>
      )}

      {pedido && <HojaPago pedido={pedido} alCerrar={() => setPedido(null)} />}
      <HojaPagoWeb abierta={pagoWeb} alCerrar={() => setPagoWeb(false)} />
      {sus && <HojaCancelar abierta={cancelar} alCerrar={() => setCancelar(false)} />}
      <HojaTerminos abierta={verTerminos} alCerrar={() => setVerTerminos(false)} />
    </div>
  );
}

/** Para Hoy: si el último cobro no pasó. */
export function AvisoPagoHoy({ irA: ir }) {
  const { datos } = useEstado();
  if (!datos.pagos.suscripcion?.pagoFallido) return null;
  return (
    <div className="rounded-3xl bg-red-50 p-4 ring-1 ring-inset ring-red-200" role="alert">
      <p className="flex items-start gap-2.5 text-base font-semibold leading-snug text-red-900">
        <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        Tu último cobro no pasó. Actualiza tu forma de pago para no perder tu plan {datos.plan.nombre}.
      </p>
      <Boton variante="secundario" className="mt-3 min-h-12" onClick={() => ir('planes')}>
        Ver mi plan
      </Boton>
    </div>
  );
}

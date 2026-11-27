// Parte 7: términos de pago y cancelación.
//
// BORRADOR. Lo escribió la IA a partir de las decisiones de la dueña (27 nov 2026).
// Lo tienen que revisar la dueña o un abogado ANTES de cobrar de verdad.
// Si cambia el texto, cambia VERSION_TERMINOS: así queda guardado qué versión aceptó cada una.

import { NEGOCIO, ORDEN_PLANES, PAQUETES_CREDITOS, PLANES } from './datos.js';

export const VERSION_TERMINOS = 'borrador-2026-11-27';
export const TERMINOS_ES_BORRADOR = true;

const planesDePago = ORDEN_PLANES.filter((id) => id !== 'gratis')
  .map((id) => `${PLANES[id].nombre} $${PLANES[id].precioMes} al mes`)
  .join(', ');
const paquetes = PAQUETES_CREDITOS.map((p) => `${p.nombre}: ${p.creditos} créditos por $${p.precio}`).join('; ');

export const TERMINOS = [
  {
    titulo: 'Quién vende',
    texto: `${NEGOCIO.nombreApp}, ${NEGOCIO.direccion}. Contacto: ${NEGOCIO.correoSoporte}. Se rige por la ley del estado de Florida.`,
  },
  {
    titulo: 'Planes y precios',
    texto: `El plan Gratis no cuesta nada. Los planes de pago son ${planesDePago}, en dólares de Estados Unidos. Los créditos y lo que incluye cada plan se ven en la pestaña Planes.`,
  },
  {
    titulo: 'Renovación automática',
    texto:
      'Los planes de pago se cobran por adelantado y se renuevan solos cada mes, en la misma fecha en que pagaste la primera vez, con la misma forma de pago, hasta que canceles. Al pagar recibes enseguida los créditos del plan, y se reponen en cada cobro mensual (no se acumulan de un mes a otro).',
  },
  {
    titulo: 'Cambiar de plan',
    texto:
      'Si subes de plan, el cambio es inmediato: se cobra solo la diferencia por los días que faltan del mes pagado y recibes ya los créditos del plan nuevo. Si bajas de plan, sigues en tu plan hasta que termine el mes pagado y el plan nuevo empieza en el siguiente cobro.',
  },
  {
    titulo: 'Cómo cancelar',
    texto:
      'Puedes cancelar cuando quieras desde la pestaña Planes, con el botón «Cancelar mi plan». No se te vuelve a cobrar. Sigues en tu plan hasta que termine el mes que ya pagaste y después vuelves al plan Gratis. Si en ese momento tienes más de 6 productos, los conservas, pero no puedes agregar más.',
  },
  {
    titulo: 'Sin reembolsos',
    texto:
      'No hay reembolsos del mes ya pagado: al cancelar, simplemente no se vuelve a cobrar. Los paquetes de créditos no se reembolsan una vez que los créditos se entregaron en tu cuenta.',
  },
  {
    titulo: 'Paquetes de créditos',
    texto: `Son una compra única, sin renovación: ${paquetes}. Son créditos de video y no vencen. No pagan la voz de IA ni otros usos de créditos de texto.`,
  },
  {
    titulo: 'Si un cobro no pasa',
    texto:
      'Si el cobro mensual no pasa (por ejemplo, una tarjeta vencida), el sistema de pagos lo vuelve a intentar durante unos días y te avisamos en la app para que actualices tu forma de pago. Si no se logra cobrar, tu cuenta vuelve al plan Gratis.',
  },
  {
    titulo: 'Quién procesa el pago',
    texto:
      'Los pagos los procesa Stripe. Vendiva no ve ni guarda los números de tu tarjeta. Según tu forma de pago (por ejemplo Klarna), pueden aplicar también las condiciones de ese servicio.',
  },
  {
    titulo: 'Impuestos',
    texto: 'PENDIENTE: la dueña o su contador confirmarán si corresponde cobrar impuestos y cuáles, antes de los cobros reales.',
  },
];

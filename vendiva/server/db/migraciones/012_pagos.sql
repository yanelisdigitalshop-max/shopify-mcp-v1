-- Parte 7: pagos con Stripe, EN MODO DE PRUEBA (decisiones de la dueña, 27 nov 2026).
-- Ningún cobro real hasta que la dueña lo apruebe por escrito (ver server/config.js).

alter table usuarias add column stripe_cliente_id     text unique;
alter table usuarias add column suscripcion_id        text unique;
alter table usuarias add column suscripcion_estado    text;
alter table usuarias add column suscripcion_fin       timestamptz;  -- fin del mes pagado: ahí se cobra otra vez
alter table usuarias add column suscripcion_cancela   boolean not null default false;
alter table usuarias add column plan_siguiente        text;         -- bajada de plan programada para el fin del mes pagado
alter table usuarias add column pago_fallido_en       timestamptz;  -- el último cobro no pasó (Stripe reintenta)
alter table usuarias add column terminos_version      text;
alter table usuarias add column terminos_aceptados_en timestamptz;

-- Cada cobro que Stripe confirma: una factura del plan o un paquete. La referencia de
-- Stripe es única: si un aviso llega dos veces, los créditos se entregan una sola vez.
create table pagos (
  id                uuid primary key,
  usuaria_id        uuid not null references usuarias (id) on delete cascade,
  tipo              text not null check (tipo in ('plan', 'paquete')),
  referencia_stripe text not null unique,
  plan              text,
  paquete           text,
  monto_centavos    integer,
  modo              text not null check (modo in ('prueba', 'real')),
  creado_en         timestamptz not null default now()
);
create index pagos_usuaria_idx on pagos (usuaria_id, creado_en desc);

-- Los avisos (webhooks) de Stripe ya procesados: cada uno, una sola vez.
create table eventos_stripe (
  id          text primary key,
  tipo        text not null,
  recibido_en timestamptz not null default now()
);

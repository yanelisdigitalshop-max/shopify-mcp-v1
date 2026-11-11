-- Parte 3: buscador de productos y tendencias de la semana.

-- Búsquedas del mes en curso. El plan Gratis tiene 10; vuelve a cero el día 1, con los créditos.
alter table usuarias add column busquedas_mes integer not null default 0 check (busquedas_mes >= 0);

-- Cada búsqueda y sus 5 ideas. "guardados" dice qué idea se guardó como producto: { "2": "<id del producto>" }.
create table busquedas (
  id             uuid primary key,
  usuaria_id     uuid not null references usuarias(id) on delete cascade,
  nicho          text not null,
  resultado      jsonb not null,
  guardados      jsonb not null default '{}'::jsonb,
  modelo         text,
  tokens_entrada integer,
  tokens_salida  integer,
  creado_en      timestamptz not null default now()
);
create index busquedas_usuaria_idx on busquedas (usuaria_id, creado_en desc);

-- Un reporte de tendencias por usuaria y por semana ('2026-W46'). Solo planes de pago.
-- Al bajar a Gratis no se borra: se deja de mostrar y reaparece al volver.
create table tendencias (
  id             uuid primary key,
  usuaria_id     uuid not null references usuarias(id) on delete cascade,
  semana         text not null,
  contenido      jsonb not null,
  modelo         text,
  tokens_entrada integer,
  tokens_salida  integer,
  busquedas_web  integer,
  creado_en      timestamptz not null default now(),
  unique (usuaria_id, semana)
);

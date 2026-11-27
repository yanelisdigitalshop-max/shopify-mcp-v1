-- Parte 6: textos para 4 redes y Vitrina (decisiones de la dueña, 27 nov 2026).

-- Sus usuarios en las otras redes (opcionales, sin @). Nunca contraseñas.
alter table perfiles add column usuario_instagram text;
alter table perfiles add column usuario_facebook  text;
alter table perfiles add column usuario_pinterest text;

-- Textos para sus redes: uno por guion (creación de tipo 'guiones' + número 1 a 3).
-- 1 crédito de texto por cada red. El último de cada guion es el que se muestra.
create table textos_redes (
  id                uuid primary key,
  usuaria_id        uuid not null references usuarias (id) on delete cascade,
  creacion_id       uuid not null references creaciones (id) on delete cascade,
  numero            smallint not null check (numero between 1 and 3),
  redes             jsonb not null,    -- ['instagram', 'facebook', 'pinterest'] (las que se escribieron)
  contenido         jsonb not null,
  creditos_cobrados integer not null default 0 check (creditos_cobrados >= 0),
  modelo            text,
  tokens_entrada    integer,
  tokens_salida     integer,
  creado_en         timestamptz not null default now()
);
create index textos_redes_guion_idx on textos_redes (usuaria_id, creacion_id, numero, creado_en desc);

-- Vitrina (solo plan Pro): cada calificación que ella escribe, con el plan que escribió Claude.
create table vitrina_calificaciones (
  id             uuid primary key,
  usuaria_id     uuid not null references usuarias (id) on delete cascade,
  estrellas      numeric(2, 1) not null check (estrellas between 1 and 5),
  resenas        integer not null check (resenas >= 0),
  quejas         jsonb not null default '[]'::jsonb,
  queja_otra     text,
  plan           jsonb,          -- null mientras se escribe o si la IA falló (se puede reintentar)
  modelo         text,
  tokens_entrada integer,
  tokens_salida  integer,
  creado_en      timestamptz not null default now()
);
create index vitrina_usuaria_idx on vitrina_calificaciones (usuaria_id, creado_en desc);

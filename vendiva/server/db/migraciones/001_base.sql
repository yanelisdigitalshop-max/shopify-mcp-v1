-- Parte 1: base y cuentas.
-- Los identificadores (uuid) los genera el servidor.

create table usuarias (
  id                uuid primary key,
  correo            text not null unique,            -- siempre en minúsculas
  contrasena_hash   text not null,                   -- scrypt; nunca la contraseña
  nombre            text not null,
  telefono          text not null,
  plan              text not null default 'gratis'
                    check (plan in ('gratis', 'esencial', 'crecimiento', 'pro')),
  -- Créditos del plan: se renuevan el día 1. Créditos de paquete: no vencen.
  creditos_plan     integer not null default 0 check (creditos_plan >= 0),
  creditos_paquete  integer not null default 0 check (creditos_paquete >= 0),
  periodo_creditos  text not null,                   -- 'AAAA-MM' del último abono del plan
  creada_en         timestamptz not null default now(),
  actualizada_en    timestamptz not null default now()
);

create table perfiles (
  usuaria_id          uuid primary key references usuarias(id) on delete cascade,
  nicho               text,
  seguidores          integer not null default 0 check (seguidores >= 0),  -- la escribe ella
  modo_grabacion      text check (modo_grabacion in ('con_camara', 'sin_camara')),
  objetivo            text check (objetivo in ('vender_mas', 'primeros_1000', 'programa_piloto', 'subir_vitrina')),
  usuario_tiktok      text,                          -- sin @
  redes               jsonb not null default '[]'::jsonb,
  onboarding_paso     smallint not null default 2,   -- siguiente pantalla del registro
  onboarding_completo boolean not null default false,
  actualizado_en      timestamptz not null default now()
);

create table sesiones (
  id            uuid primary key,
  usuaria_id    uuid not null references usuarias(id) on delete cascade,
  token_hash    text not null unique,                -- sha-256 del token; el token solo vive en la cookie
  creada_en     timestamptz not null default now(),
  ultimo_uso_en timestamptz not null default now(),
  expira_en     timestamptz not null
);
create index sesiones_usuaria_idx on sesiones (usuaria_id);
create index sesiones_expira_idx on sesiones (expira_en);

create table productos (
  id              uuid primary key,
  usuaria_id      uuid not null references usuarias(id) on delete cascade,
  nombre          text not null,
  descripcion     text,
  precio_centavos integer check (precio_centavos is null or precio_centavos >= 0),
  comision_pct    numeric(5, 2) check (comision_pct is null or (comision_pct >= 0 and comision_pct <= 100)),
  enlace          text,
  origen          text not null default 'manual' check (origen in ('manual', 'buscador')),
  -- Al bajar de plan nada se borra: lo que sobra se oculta y reaparece al volver.
  oculto          boolean not null default false,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now()
);
create index productos_usuaria_idx on productos (usuaria_id, creado_en);

-- Libro de movimientos de créditos: cada abono y cada gasto queda escrito.
create table movimientos_creditos (
  id          uuid primary key,
  usuaria_id  uuid not null references usuarias(id) on delete cascade,
  bolsa       text not null check (bolsa in ('plan', 'paquete')),
  cantidad    integer not null,                      -- positivo = abono, negativo = gasto
  motivo      text not null,                         -- 'alta', 'renovacion', ...
  periodo     text,
  creado_en   timestamptz not null default now()
);
create index movimientos_usuaria_idx on movimientos_creditos (usuaria_id, creado_en);

create table historial (
  id          uuid primary key,
  usuaria_id  uuid not null references usuarias(id) on delete cascade,
  tipo        text not null,
  detalle     jsonb not null default '{}'::jsonb,
  creado_en   timestamptz not null default now()
);
create index historial_usuaria_idx on historial (usuaria_id, creado_en desc);

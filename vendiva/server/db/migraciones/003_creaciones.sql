-- Parte 2: lo que la IA escribe para cada producto.
-- Una sola tabla para guiones, guion de en vivo y respuestas a comentarios
-- (más adelante también los videos y los GIFs).

create table creaciones (
  id                uuid primary key,
  usuaria_id        uuid not null references usuarias(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete cascade,
  tipo              text not null check (tipo in ('guiones', 'guion_en_vivo', 'respuestas_comentarios')),
  contenido         jsonb not null,
  creditos_cobrados integer not null default 0 check (creditos_cobrados >= 0),
  -- Para saber cuánto cuesta cada creación en la cuenta de Anthropic.
  modelo            text,
  tokens_entrada    integer,
  tokens_salida     integer,
  creado_en         timestamptz not null default now()
);
create index creaciones_ultimas_idx on creaciones (usuaria_id, producto_id, tipo, creado_en desc);

-- Cada cobro y cada devolución apunta a la creación que lo causó.
alter table movimientos_creditos add column referencia uuid;

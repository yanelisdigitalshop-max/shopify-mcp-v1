-- Parte 5: Programar. Su propio calendario de publicaciones.
-- Ella elige día y hora para un guion o un video; Vendiva se lo recuerda dentro
-- de la app y ella lo marca como publicado. NO se publica nada en TikTok:
-- ella publica a mano. Gratis e ilimitado en todos los planes (decisión de la dueña, 27 nov 2026).

create table publicaciones (
  id              uuid primary key,
  usuaria_id      uuid not null references usuarias (id) on delete cascade,
  producto_id     uuid not null references productos (id) on delete cascade,
  tipo            text not null check (tipo in ('guion', 'video')),
  -- Un guion es uno de los 3 de una creación de tipo 'guiones' (numero 1 a 3).
  creacion_id     uuid references creaciones (id) on delete cascade,
  numero          smallint check (numero between 1 and 3),
  -- Un video con IA (Parte 4).
  video_id        uuid references videos (id) on delete cascade,
  titulo          text not null,
  programada_para timestamptz not null,
  publicada_en    timestamptz,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  check (
    (tipo = 'guion' and creacion_id is not null and numero is not null and video_id is null)
    or (tipo = 'video' and video_id is not null and creacion_id is null and numero is null)
  )
);

-- Cada guion o video tiene a lo más una publicación pendiente: programarlo otra vez cambia la hora.
create unique index publicaciones_pendiente_unica
  on publicaciones (usuaria_id, coalesce(creacion_id, video_id), coalesce(numero, 0))
  where publicada_en is null;
create index publicaciones_usuaria_idx on publicaciones (usuaria_id, programada_para);

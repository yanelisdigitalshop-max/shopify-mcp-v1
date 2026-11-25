-- Parte 4: la voz de cada video.
--   real: ella graba su voz en la app (gratis, sin límite).
--   ia:   ElevenLabs narra el guion (2 créditos de texto; Gratis: 3 al mes).
-- El audio es corto (unos 10 segundos) y se guarda aquí para unirlo al video al descargarlo.
-- El video sigue sin guardarse en el servidor: solo pasa de Runway al teléfono.

alter table usuarias add column voces_ia_mes integer not null default 0 check (voces_ia_mes >= 0);

create table voces (
  id uuid primary key,
  usuaria_id uuid not null references usuarias (id) on delete cascade,
  video_id uuid not null unique references videos (id) on delete cascade,
  tipo text not null check (tipo in ('real', 'ia')),
  audio bytea not null,
  mime text not null,
  bytes integer not null,
  texto text,
  proveedor text,
  modelo text,
  voz_id text,
  creditos_cobrados integer not null default 0,
  creado_en timestamptz not null default now()
);
create index voces_usuaria on voces (usuaria_id);

-- Parte 8: notificaciones del teléfono (app de Apple y Google).

-- Cada teléfono donde ella abrió la app y aceptó los avisos. El token lo da Firebase.
-- Si otra persona entra con su cuenta en el mismo teléfono, el token pasa a esa cuenta.
create table dispositivos (
  id             uuid primary key,
  usuaria_id     uuid not null references usuarias (id) on delete cascade,
  token          text not null unique,
  plataforma     text not null check (plataforma in ('ios', 'android')),
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
create index dispositivos_usuaria_idx on dispositivos (usuaria_id);

-- Cuándo se le avisó «Te toca publicar» (una sola vez por publicación; si cambia la hora, se avisa otra vez).
alter table publicaciones add column notificada_en timestamptz;
create index publicaciones_por_avisar_idx on publicaciones (programada_para) where publicada_en is null and notificada_en is null;

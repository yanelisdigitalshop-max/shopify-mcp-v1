-- Parte 8, pagos opción (b) (decisión de la dueña, 27 nov 2026): en la app del teléfono,
-- los pagos se hacen en la web de Vendiva, en el navegador. Para no pedirle la contraseña
-- otra vez, la app pide un enlace de acceso de UN SOLO USO que vence en 10 minutos.
-- Se guarda solo la huella (sha256) del enlace, nunca el enlace.

create table enlaces_acceso (
  token_hash text primary key,
  usuaria_id uuid not null references usuarias (id) on delete cascade,
  destino    text not null check (destino in ('planes')),
  vence_en   timestamptz not null,
  usado_en   timestamptz,
  creado_en  timestamptz not null default now()
);
create index enlaces_acceso_usuaria_idx on enlaces_acceso (usuaria_id);

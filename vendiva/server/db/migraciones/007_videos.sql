-- Parte 4: videos con IA (Runway) y créditos de video aparte de los de texto.

-- Créditos: "creditos_plan" pasa a ser la bolsa de TEXTO del plan.
-- Nueva bolsa de VIDEO del plan. "creditos_paquete" (paquetes comprados) pasa a ser de VIDEO.
alter table usuarias add column creditos_video_plan integer not null default 0 check (creditos_video_plan >= 0);
-- El video gratis del mes (solo plan Gratis). Vuelve a false el día 1.
alter table usuarias add column video_gratis_usado boolean not null default false;

-- Las cuentas que ya existían reciben el reparto de su plan para este mes.
update usuarias set
  creditos_video_plan = case plan when 'esencial' then 100 when 'crecimiento' then 300 when 'pro' then 1000 else 0 end,
  creditos_plan = least(creditos_plan, case plan when 'esencial' then 100 when 'crecimiento' then 300 when 'pro' then 1000 else 30 end);

alter table movimientos_creditos drop constraint movimientos_creditos_bolsa_check;
alter table movimientos_creditos add constraint movimientos_creditos_bolsa_check check (bolsa in ('plan', 'video_plan', 'paquete'));

-- Los GIFs son una creación de texto como el guion de en vivo y las respuestas.
alter table creaciones drop constraint creaciones_tipo_check;
alter table creaciones add constraint creaciones_tipo_check check (tipo in ('guiones', 'guion_en_vivo', 'respuestas_comentarios', 'gifs'));

-- La foto del producto (la que trae FastMoss/TikTok). Los videos salen de ella.
alter table productos add column imagen_url text;
update productos p set imagen_url = b.prod->>'imagen'
  from (
    select distinct on (prod->>'id') prod
      from busquedas, jsonb_array_elements(resultado->'productos') as prod
     where resultado ? 'productos' and prod->>'imagen' like 'https://%'
     order by prod->>'id', busquedas.creado_en desc
  ) b
 where p.fastmoss_id = b.prod->>'id' and p.imagen_url is null;

-- Cada video: su motor, su prompt, el guion para usarlo y el ENLACE que devuelve el proveedor.
-- El archivo no se guarda en el servidor de Vendiva.
create table videos (
  id                uuid primary key,
  usuaria_id        uuid not null references usuarias(id) on delete cascade,
  producto_id       uuid not null references productos(id) on delete cascade,
  tipo              text not null check (tipo in ('corto', 'desde_foto')),
  indice            smallint not null check (indice between 1 and 3),
  estado            text not null check (estado in ('preparando', 'procesando', 'listo', 'fallido')),
  motor             text not null default 'runway',
  modelo            text not null default 'gen4_turbo',
  duracion          smallint not null,
  gratis            boolean not null default false,
  creditos_cobrados integer not null default 0 check (creditos_cobrados >= 0),
  imagen_url        text not null,
  prompt            text,
  guion             jsonb,
  tarea_id          text,          -- la tarea en Runway; sirve para pedir un enlace nuevo
  video_url         text,          -- enlace que devuelve Runway (vence en 24 a 48 horas)
  url_obtenida_en   timestamptz,
  falla             text,
  revisado_en       timestamptz,   -- última vez que se le preguntó a Runway (para revisar por turnos)
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);
create index videos_usuaria_idx on videos (usuaria_id, producto_id, tipo, indice, creado_en desc);
create index videos_pendientes_idx on videos (estado) where estado in ('preparando', 'procesando');

-- Parte 3 con FastMoss: el buscador y las tendencias usan datos reales de TikTok Shop.

-- Las búsquedas guardan los productos que devolvió FastMoss ("resultado.productos").
-- Las búsquedas de la versión anterior (ideas de la IA) se conservan pero ya no se muestran.

-- De qué producto de TikTok Shop salió un producto guardado desde el buscador.
alter table productos add column fastmoss_id text;

-- Tendencias: un solo reporte por semana para todas (los 10 más vendidos de EE. UU.),
-- para no pagar la misma consulta una vez por usuaria. Solo lo ven los planes de pago.
create table tendencias_semana (
  id             uuid primary key,
  semana         text not null unique,   -- semana de la app, por ejemplo '2026-W46'
  semana_datos   text not null,          -- semana de FastMoss que se pidió, por ejemplo '2026-45'
  productos      jsonb not null,
  creado_en      timestamptz not null default now()
);

-- La versión anterior de las tendencias (escritas por la IA) nunca salió a producción.
drop table tendencias;

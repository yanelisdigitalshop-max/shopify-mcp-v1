-- Parte 4: saber si ella ya descargó cada video.
-- Mientras no lo descargue, al abrirlo se le avisa que el enlace de Runway vence.
alter table videos add column if not exists descargado_en timestamptz;

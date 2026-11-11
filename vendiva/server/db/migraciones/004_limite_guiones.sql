-- Cuántas veces creó "sus 3 guiones" en el mes en curso.
-- El plan Gratis tiene un tope mensual; se pone en cero el día 1, junto con los créditos.

alter table usuarias add column guiones_mes integer not null default 0 check (guiones_mes >= 0);

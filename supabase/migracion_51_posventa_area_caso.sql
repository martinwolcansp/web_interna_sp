-- =====================================================================
-- migracion_51_posventa_area_caso.sql
-- Indicadores de Posventa: área del caso de cada relevamiento.
--
-- El servicio indicadores-api trae el "asignado a" del caso del
-- relevamiento (supportcase.assigned) y deduce el área con los mismos
-- ids que los informes de Instalaciones y Ampliaciones
-- (CASOS_INSTALACION_ASIGNADO_A = 133, CASOS_AMPLIACIONES_ASIGNADO_A = 232).
-- Si el caso tiene otro asignado, area_caso guarda su nombre.
--
-- Después de correrla, tocar "Actualizar ahora" en la página para que se
-- completen las columnas nuevas.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_posventa_relevamiento
  add column if not exists asignado_id integer,
  add column if not exists asignado_a  text,
  add column if not exists area_caso   text;

comment on column ind_posventa_relevamiento.asignado_id is 'supportcase.assigned del caso del relevamiento.';
comment on column ind_posventa_relevamiento.asignado_a  is 'Nombre del asignado del caso.';
comment on column ind_posventa_relevamiento.area_caso   is 'Instalaciones / Ampliaciones según el asignado del caso; otro asignado: su nombre.';

commit;

notify pgrst, 'reload schema';

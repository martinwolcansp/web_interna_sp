-- =====================================================================
-- migracion_38_alcance_comunicaciones.sql
-- Ampliaciones y Comunicaciones separadas también en el servicio.
--
-- Hasta ahora los casos del asignado 232 se guardaban todos con alcance
-- 'ampliaciones' y la página los separaba por unidad de negocio. Desde esta
-- versión de indicadores-api cada área trae y guarda sólo lo suyo:
--   alcance 'ampliaciones'    todas las unidades de negocio menos Comunicaciones
--   alcance 'comunicaciones'  sólo la unidad de negocio Comunicaciones
--
-- Esta migración pasa al alcance 'comunicaciones' los casos ya cargados de esa
-- unidad (con sus OV y líneas), así ninguno de los dos informes queda vacío ni
-- incompleto hasta su próxima actualización. No cambia tablas ni permisos
-- (los de Comunicaciones los agregó la migracion_37).
--
-- ORDEN: correr esta migración y desplegar enseguida indicadores-api y la
-- página. Requiere la migracion_37. Segura de correr más de una vez.
-- =====================================================================

begin;

update ind_caso_instalacion
   set alcance = 'comunicaciones'
 where alcance = 'ampliaciones'
   and unidad_negocio ~ '(^| : )Comunicaciones$';

update ind_caso_ov o
   set alcance = 'comunicaciones'
  from ind_caso_instalacion c
 where c.caso_id = o.caso_id
   and c.alcance = 'comunicaciones'
   and o.alcance = 'ampliaciones';

update ind_caso_ov_linea l
   set alcance = 'comunicaciones'
  from ind_caso_instalacion c
 where c.caso_id = l.caso_id
   and c.alcance = 'comunicaciones'
   and l.alcance = 'ampliaciones';

comment on column ind_caso_instalacion.alcance is
  'Qué área trae el caso: instalaciones (asignado 133, Posventa e Instalaciones), ampliaciones (232, unidades de negocio menos Comunicaciones) o comunicaciones (232, unidad Comunicaciones). Cada área borra sólo su alcance.';

commit;

notify pgrst, 'reload schema';

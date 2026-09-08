-- Permisos reales por área — cuarta etapa (según
-- Permisos_por_Area_WebInternaSP.xlsx, hoja "Matriz de permisos",
-- completada por Martin el 08/09/2026, segunda pasada).
--
-- Único cambio respecto a permisos_area_seccion_v1/v2/v3.sql: el área
-- "Marketing" (marketing, subárea de Ventas y Marketing) pasa a ver
-- Mapa de Servicios e Informes e indicadores de MKT. Hasta ahora sólo
-- "Ventas y Marketing" (el área padre) tenía esos permisos —
-- "Marketing" no tenía ninguno propio.
--
-- Requiere haber corrido antes migracion_7_seccion_informes_mkt.sql
-- (da de alta la sección 'informes-mkt'; sin eso el segundo insert
-- falla por la foreign key). No depende de que se haya corrido
-- permisos_area_seccion_v3.sql — son áreas distintas (v3 es
-- 'ventas-marketing', esto es 'marketing').
--
-- Seguro de correr más de una vez (on conflict do nothing).

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('marketing', 'mapa-servicios', 'ver'),
  ('marketing', 'informes-mkt', 'ver')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

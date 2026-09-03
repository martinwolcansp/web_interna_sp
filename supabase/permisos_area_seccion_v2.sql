-- Permisos reales por área — segunda etapa (según
-- Permisos_por_Area_WebInternaSP.xlsx, hoja "Matriz de permisos",
-- actualizada por Martin el 03/09/2026).
--
-- Único cambio respecto a permisos_area_seccion_v1.sql: Ventas y
-- Marketing pasa a ver el mosaico Mapa de Servicios. El resto de las
-- filas del Excel sigue igual que en v1 (ya marcadas "Sí" en la columna
-- "Cargado en Supabase"); las demás áreas siguen sin completar.
--
-- Seguro de correr más de una vez (on conflict do nothing).

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('ventas-marketing', 'mapa-servicios', 'ver')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

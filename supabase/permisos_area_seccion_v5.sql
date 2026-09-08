-- Permisos reales por área — quinta etapa (según
-- Permisos_por_Area_WebInternaSP.xlsx, hoja "Matriz de permisos",
-- columna "Comunicación Receptoras", completada por Martin el
-- 08/09/2026).
--
-- Único cambio respecto a permisos_area_seccion_v1..v4.sql: alta del
-- mosaico "Comunicación Receptoras" (comunicacion-receptoras) para
-- Operaciones Técnicas (Ver).
--
-- Requiere haber corrido antes
-- migracion_9_seccion_comunicacion_receptoras.sql (da de alta la
-- sección 'comunicacion-receptoras' en la tabla secciones; sin eso
-- este insert falla por la foreign key).
--
-- Seguro de correr más de una vez (on conflict do nothing).

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('operaciones-tecnicas', 'comunicacion-receptoras', 'ver')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

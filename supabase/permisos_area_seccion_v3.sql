-- Permisos reales por área — tercera etapa (según
-- Permisos_por_Area_WebInternaSP.xlsx, hoja "Matriz de permisos",
-- columna "Informes e indicadores de MKT", completada por Martin el
-- 08/09/2026).
--
-- Único cambio respecto a permisos_area_seccion_v1/v2.sql: alta del
-- mosaico "Informes e indicadores de MKT" (informes-mkt) para las
-- áreas que ya tienen acceso a los demás mosaicos, más Ventas y
-- Marketing (que hasta ahora sólo veía Mapa de Servicios).
--
-- Requiere haber corrido antes migracion_7_seccion_informes_mkt.sql
-- (da de alta la sección 'informes-mkt' en la tabla secciones; sin eso
-- este insert falla por la foreign key).
--
-- Seguro de correr más de una vez (on conflict do nothing).

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('directorio',            'informes-mkt', 'ver'),
  ('gerencia-general',      'informes-mkt', 'editar'),
  ('admin-finanzas',        'informes-mkt', 'editar'),
  ('ventas-marketing',      'informes-mkt', 'ver'),
  ('operaciones-tecnicas',  'informes-mkt', 'editar'),
  ('procesos-mejora',       'informes-mkt', 'editar')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

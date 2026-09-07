-- =========================================================================
-- Migración 7 — Nuevo mosaico "Informes e indicadores de MKT".
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
--
-- seed_secciones.sql ya quedó actualizado con esta misma fila para
-- instalaciones nuevas.
--
-- Esto sólo da de alta la sección: NO otorga acceso a nadie todavía.
-- Como los demás mosaicos, la visibilidad depende de
-- permisos_area_seccion — cargar ahí la(s) área(s) que correspondan
-- (ej. Ventas y Marketing) en Permisos_por_Area_WebInternaSP.xlsx y
-- generar el SQL de esa área como se hizo en permisos_area_seccion_v1/v2.
-- =========================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('informes-mkt', 'Informes e indicadores de MKT', 'mosaico')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

commit;

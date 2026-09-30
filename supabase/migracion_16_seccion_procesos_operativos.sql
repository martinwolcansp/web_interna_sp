-- =========================================================================
-- Migración 16 — Nuevo mosaico "Procesos Operativos".
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
--
-- seed_secciones.sql ya quedó actualizado con esta misma fila para
-- instalaciones nuevas.
--
-- Esto sólo da de alta la sección: NO otorga acceso a nadie todavía
-- (mientras tanto sólo la ven los superadmin). Como los demás mosaicos,
-- la visibilidad depende de permisos_area_seccion — cargar ahí la(s)
-- área(s) que correspondan en Permisos_por_Area_WebInternaSP.xlsx y
-- generar el SQL de esa área como en permisos_area_seccion_v1..v7.
-- =========================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('procesos-operativos', 'Procesos Operativos', 'mosaico')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

commit;

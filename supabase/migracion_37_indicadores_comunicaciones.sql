-- =====================================================================
-- migracion_37_indicadores_comunicaciones.sql
-- Indicadores por Área: Comunicaciones, separada de Ampliaciones.
--
-- Los casos de la unidad de negocio Comunicaciones están asignados al mismo
-- jefe que los de Ampliaciones (232) pero dependen de otra área. Usan los
-- mismos datos (alcance 'ampliaciones' de las tablas comunes); la página
-- ampliaciones.html los separa por unidad de negocio:
--   Ampliaciones    todas las unidades menos Comunicaciones
--   Comunicaciones  solo la unidad Comunicaciones (ampliaciones.html?area=comunicaciones)
--
-- Esta migración sólo agrega la sección de permisos y los permisos de lectura
-- sobre las tablas comunes. No cambia tablas.
--
-- Requiere la migracion_36. Segura de correr más de una vez.
-- =====================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('indicadores-comunicaciones', 'Indicadores - Comunicaciones', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

insert into ind_tabla_area (tabla, area) values
  ('ind_caso_instalacion',           'comunicaciones'),
  ('ind_caso_ov',                    'comunicaciones'),
  ('ind_caso_ov_linea',              'comunicaciones'),
  ('ind_equivalencia_tipo_proyecto', 'comunicaciones')
on conflict do nothing;

commit;

notify pgrst, 'reload schema';

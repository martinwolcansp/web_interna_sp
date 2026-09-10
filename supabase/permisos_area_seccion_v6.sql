-- Permisos reales por área — sexta etapa.
--
-- Alta del mosaico "Integración NetSuite ↔ GHL" (integracion-ghl-ns)
-- para Infraestructura Tecnológica e Innovación (Editar) — el equipo
-- que arma y mantiene la integración. Todavía no se definió qué otra(s)
-- área(s) tendrán acceso de sólo consulta (datos globales); se agrega
-- en una migración de permisos posterior cuando se decida.
--
-- Requiere haber corrido antes migracion_10_integracion_ghl_ns.sql (da
-- de alta la sección 'integracion-ghl-ns' en la tabla secciones; sin
-- eso este insert falla por la foreign key).
--
-- Seguro de correr más de una vez (on conflict do nothing).

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('infraestructura-it', 'integracion-ghl-ns', 'editar')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

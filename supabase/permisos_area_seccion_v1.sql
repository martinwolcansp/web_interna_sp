-- Permisos reales por área — primera etapa (según
-- Permisos_por_Area_WebInternaSP.xlsx, hoja "Matriz de permisos",
-- completada por Martin el 12/08/2026).
--
-- Reemplaza, sólo para las 6 áreas de esta primera etapa, los permisos
-- de ejemplo que traía seed_secciones.sql. Las demás áreas de ejemplo
-- (ampliaciones, comunicaciones-renovacion-tecnologias) no se tocan:
-- siguen como estaban hasta que se revisen y se sumen al Excel.
--
-- Nota: no se cargan filas de 'ver' para la sección 'pizarra' — ver
-- ya es libre para cualquier usuario activo (no depende de esta
-- tabla), sólo tiene sentido marcar 'editar' ahí.
--
-- Nota: Normativas Técnicas y Procesos Operativos (marcadas "Editar"
-- para Procesos y Mejora Continua en el Excel) todavía no existen
-- como fila en "secciones" -- son mosaicos "Próximamente", sin
-- página ni contenido aún. Esa fila se carga cuando se construyan.

begin;

delete from permisos_area_seccion
where area_id in (
  'directorio', 'gerencia-general', 'admin-finanzas',
  'admin-rrhh', 'operaciones-tecnicas', 'procesos-mejora'
)
and seccion_id in ('mapa-servicios', 'sector-comunicaciones', 'organigrama', 'pizarra');

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  -- Directorio: ve todo, no edita
  ('directorio', 'mapa-servicios', 'ver'),
  ('directorio', 'sector-comunicaciones', 'ver'),
  ('directorio', 'organigrama', 'ver'),

  -- Gerencia General: edita todo
  ('gerencia-general', 'mapa-servicios', 'editar'),
  ('gerencia-general', 'sector-comunicaciones', 'editar'),
  ('gerencia-general', 'organigrama', 'editar'),
  ('gerencia-general', 'pizarra', 'editar'),

  -- Admin y Finanzas: edita todo
  ('admin-finanzas', 'mapa-servicios', 'editar'),
  ('admin-finanzas', 'sector-comunicaciones', 'editar'),
  ('admin-finanzas', 'organigrama', 'editar'),
  ('admin-finanzas', 'pizarra', 'editar'),

  -- Admin. de RRHH: sólo ve los mosaicos, pero publica en la pizarra
  ('admin-rrhh', 'mapa-servicios', 'ver'),
  ('admin-rrhh', 'sector-comunicaciones', 'ver'),
  ('admin-rrhh', 'organigrama', 'ver'),
  ('admin-rrhh', 'pizarra', 'editar'),

  -- Operaciones Técnicas: edita todo
  ('operaciones-tecnicas', 'mapa-servicios', 'editar'),
  ('operaciones-tecnicas', 'sector-comunicaciones', 'editar'),
  ('operaciones-tecnicas', 'organigrama', 'editar'),
  ('operaciones-tecnicas', 'pizarra', 'editar'),

  -- Procesos y Mejora Continua: edita todo lo que ya existe
  ('procesos-mejora', 'mapa-servicios', 'editar'),
  ('procesos-mejora', 'sector-comunicaciones', 'editar'),
  ('procesos-mejora', 'organigrama', 'editar'),
  ('procesos-mejora', 'pizarra', 'editar')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

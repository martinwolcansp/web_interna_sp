-- Secciones actuales del sitio: los 3 mosaicos ya construidos y la
-- sección general (pizarra institucional). Agregar un mosaico nuevo a
-- futuro (Normativas Técnicas, Procesos Operativos, hoy "Próximamente"
-- en index.html) es simplemente insertar una fila más acá.

insert into secciones (id, nombre, tipo) values
  ('mapa-servicios',        'Mapa de Servicios',        'mosaico'),
  ('sector-comunicaciones', 'Sector Comunicaciones',    'mosaico'),
  ('organigrama',           'Directorio de Áreas',      'mosaico'),
  ('pizarra',               'Pizarra institucional',    'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- Ejemplo de permisos iniciales (ajustar según lo que definan con RRHH):
-- Directorio y Mapa de Servicios visibles para toda la empresa;
-- edición de la pizarra habilitada para RRHH ('admin-rrhh', ver
-- seed_areas.sql); Sector Comunicaciones visible además para
-- Ampliaciones (área madre de la Unidad de Negocio Comunicaciones).

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('directorio', 'mapa-servicios', 'ver'),
  ('directorio', 'organigrama', 'ver'),
  ('admin-rrhh', 'pizarra', 'editar'),
  ('ampliaciones', 'sector-comunicaciones', 'ver'),
  ('comunicaciones-renovacion-tecnologias', 'sector-comunicaciones', 'editar')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

-- Nota: estos permisos de ejemplo NO alcanzan a toda la empresa a
-- propósito. Antes de ir a producción hay que decidir con cada
-- responsable de área qué mosaico corresponde a quién (ver "Requisitos
-- previos", punto 7 de la propuesta) y cargar las filas reales acá.

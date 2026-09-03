-- Categorías iniciales de la pizarra institucional. Ampliable desde el
-- editor de la pizarra (sólo superadmin puede agregar/editar/borrar).

insert into categorias_novedades (id, nombre, orden) values
  ('publica',     'Pública',     0),
  ('novedades',   'Novedades',   1),
  ('comunicados', 'Comunicados', 2),
  ('feriados',    'Feriados',    3),
  ('vacaciones',  'Vacaciones',  4),
  ('rrhh',        'RRHH',        5)
on conflict (id) do update set
  nombre = excluded.nombre,
  orden  = excluded.orden;

-- =========================================================================
-- RPC para el editor de la pizarra (pages/pizarra-editor.html).
-- Correr en el SQL Editor DESPUÉS de schema.sql, migracion_2_* y
-- migracion_3_* (o, en una instalación nueva, después de schema.sql +
-- seed_categorias_novedades.sql).
-- =========================================================================

-- Todas las novedades para quien tiene permiso de editar la pizarra
-- (o es superadmin) -- a diferencia de fn_mis_novedades (rpc_home.sql),
-- ésta ignora el filtro de área: quien administra la pizarra necesita ver
-- y poder editar/borrar TODO lo publicado, esté dirigido a su área o no.
-- El chequeo de permiso va en el where (si no tiene permiso, no trae
-- filas) en vez de dejarlo sólo del lado del cliente, porque es security
-- definer y cualquier autenticado podría llamarla directo.
create or replace function fn_admin_novedades()
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  categoria_id text,
  categoria_nombre text,
  autor_nombre text,
  publicado_en timestamptz,
  vigente_hasta timestamptz,
  areas_ids text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id, n.titulo, n.cuerpo, n.categoria_id, c.nombre as categoria_nombre,
    p.nombre as autor_nombre, n.publicado_en, n.vigente_hasta,
    coalesce(
      (select array_agg(na.area_id order by na.area_id) from novedades_areas na where na.novedad_id = n.id),
      '{}'::text[]
    ) as areas_ids
  from novedades n
  left join perfiles p on p.id = n.autor_id
  left join categorias_novedades c on c.id = n.categoria_id
  where fn_tiene_permiso('pizarra', 'editar')
  order by n.publicado_en desc;
$$;

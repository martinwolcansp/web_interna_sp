-- =========================================================================
-- RPCs para el home dinámico (mosaicos según permisos + pizarra real).
-- Correr en el SQL Editor de Supabase Studio DESPUÉS de schema.sql,
-- seed_areas.sql y seed_secciones.sql.
-- =========================================================================

-- Mosaicos (secciones tipo 'mosaico') que el usuario logueado puede ver:
-- superadmin ve todos; el resto, según permisos_area_seccion de su área.
create or replace function fn_mis_secciones_visibles()
returns setof secciones
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from secciones s
  where s.tipo = 'mosaico'
    and (
      exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
      or fn_tiene_permiso(s.id, 'ver')
    );
$$;

-- Novedades vigentes de la pizarra, con el nombre del autor y si el
-- usuario logueado ya las leyó (para el indicador de "no leídas").
create or replace function fn_mis_novedades()
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  categoria text,
  autor_nombre text,
  publicado_en timestamptz,
  vigente_hasta timestamptz,
  leida boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id, n.titulo, n.cuerpo, n.categoria,
    p.nombre as autor_nombre,
    n.publicado_en, n.vigente_hasta,
    (nl.usuario_id is not null) as leida
  from novedades n
  left join perfiles p on p.id = n.autor_id
  left join novedades_leidas nl on nl.novedad_id = n.id and nl.usuario_id = auth.uid()
  where n.vigente_hasta is null or n.vigente_hasta > now()
  order by n.publicado_en desc;
$$;

-- Marca una novedad como leída por el usuario logueado (idempotente).
create or replace function fn_marcar_leida(p_novedad_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into novedades_leidas (usuario_id, novedad_id)
  values (auth.uid(), p_novedad_id)
  on conflict do nothing;
$$;

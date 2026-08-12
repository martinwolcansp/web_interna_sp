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

-- Mismo patrón que fn_mis_secciones_visibles() pero con nivel 'editar'.
-- La usa el editor de fichas de producto para saber qué fichas puede
-- tocar el usuario, y el header (auth.js) para decidir si muestra el
-- link al editor.
create or replace function fn_mis_secciones_editables()
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
      or fn_tiene_permiso(s.id, 'editar')
    );
$$;

-- Novedades vigentes de la pizarra, con el nombre del autor y si el
-- usuario logueado ya las leyó (para el indicador de "no leídas").
--
-- IMPORTANTE: al ser security definer, esta función consulta "novedades"
-- sin pasar por sus políticas RLS -- por eso el filtro de área
-- (fn_puede_ver_novedad, ver Adenda 2 / Migración 2) se chequea acá
-- explícitamente en el where. Sin esto, cualquier usuario vería todas
-- las novedades sin importar a qué área estén dirigidas, porque home.js
-- siempre entra por esta RPC, nunca consulta la tabla directo.
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
    n.id, n.titulo, n.cuerpo, c.nombre as categoria,
    p.nombre as autor_nombre,
    n.publicado_en, n.vigente_hasta,
    (nl.usuario_id is not null) as leida
  from novedades n
  left join perfiles p on p.id = n.autor_id
  left join categorias_novedades c on c.id = n.categoria_id
  left join novedades_leidas nl on nl.novedad_id = n.id and nl.usuario_id = auth.uid()
  where (n.vigente_hasta is null or n.vigente_hasta > now())
    and fn_puede_ver_novedad(n.id)
  order by n.publicado_en desc;
$$;

-- Una novedad puntual, completa, para la pantalla de detalle
-- (pages/novedad.html) — pensada para cuando el cuerpo sea más largo que
-- el extracto que se ve en la pizarra del home. Mismo chequeo de acceso
-- que fn_mis_novedades (fn_puede_ver_novedad); a diferencia de esa, acá
-- no se filtra por vigente_hasta -- si alguien ya tenía el link a una
-- novedad vencida, puede seguir leyéndola, sólo que ya no aparece en el
-- feed principal.
create or replace function fn_novedad_detalle(p_novedad_id uuid)
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  categoria text,
  autor_nombre text,
  publicado_en timestamptz,
  vigente_hasta timestamptz,
  leida boolean,
  areas_nombres text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id, n.titulo, n.cuerpo, c.nombre as categoria,
    p.nombre as autor_nombre,
    n.publicado_en, n.vigente_hasta,
    (nl.usuario_id is not null) as leida,
    (
      select array_agg(a.nombre order by a.nombre)
      from novedades_areas na
      join areas a on a.id = na.area_id
      where na.novedad_id = n.id
    ) as areas_nombres
  from novedades n
  left join perfiles p on p.id = n.autor_id
  left join categorias_novedades c on c.id = n.categoria_id
  left join novedades_leidas nl on nl.novedad_id = n.id and nl.usuario_id = auth.uid()
  where n.id = p_novedad_id
    and fn_puede_ver_novedad(n.id);
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

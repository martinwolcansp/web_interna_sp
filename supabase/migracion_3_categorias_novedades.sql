-- =========================================================================
-- Migración 3 — Categorías gestionables de la pizarra + fix de seguridad
-- en fn_mis_novedades
--
-- Para bases YA desplegadas. Seguro de correr más de una vez (columnas y
-- políticas con IF NOT EXISTS / DROP IF EXISTS antes de crear).
--
-- schema.sql y rpc_home.sql ya quedaron actualizados con estos mismos
-- cambios para instalaciones nuevas.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Catálogo de categorías (antes, "categoria" en novedades era texto
--    libre sin ningún control). Catálogo = estructural, lo gestiona sólo
--    el superadmin, igual que secciones/areas.
-- -------------------------------------------------------------------------
create table if not exists categorias_novedades (
  id     text primary key,
  nombre text not null,
  orden  int not null default 0
);

comment on table categorias_novedades is 'Catálogo de categorías de la pizarra institucional (Novedades, Vacaciones, Feriados, etc.). Gestionado por el superadmin desde el editor de la pizarra.';

alter table categorias_novedades enable row level security;

drop policy if exists "categorias_novedades: lectura autenticados" on categorias_novedades;
create policy "categorias_novedades: lectura autenticados" on categorias_novedades
  for select using (auth.role() = 'authenticated');

drop policy if exists "categorias_novedades: escritura superadmin" on categorias_novedades;
create policy "categorias_novedades: escritura superadmin" on categorias_novedades
  for all using (fn_es_superadmin());

insert into categorias_novedades (id, nombre, orden) values
  ('novedades',   'Novedades',   1),
  ('comunicados', 'Comunicados', 2),
  ('feriados',    'Feriados',    3),
  ('vacaciones',  'Vacaciones',  4),
  ('rrhh',        'RRHH',        5)
on conflict (id) do nothing;

-- -------------------------------------------------------------------------
-- 2. novedades.categoria (texto libre) -> categoria_id (FK al catálogo)
-- -------------------------------------------------------------------------
alter table novedades add column if not exists categoria_id text references categorias_novedades(id);

-- Backfill: matchea lo que ya estaba cargado como texto contra el nombre
-- del catálogo (sin importar mayúsculas/espacios).
update novedades n
set categoria_id = c.id
from categorias_novedades c
where n.categoria_id is null
  and n.categoria is not null
  and lower(trim(n.categoria)) = lower(c.nombre);

-- Lo que no pudo matchear (categoría vieja que no está en el catálogo
-- nuevo) cae en 'novedades' por defecto, para no perder la publicación.
update novedades set categoria_id = 'novedades' where categoria_id is null;

alter table novedades alter column categoria_id set not null;
alter table novedades drop column if exists categoria;

-- -------------------------------------------------------------------------
-- 3. Fix de seguridad: fn_mis_novedades es security definer, así que
--    consulta "novedades" sin pasar por sus políticas RLS — el filtro de
--    área agregado en la Migración 2 (fn_puede_ver_novedad) nunca se
--    estaba aplicando acá, que es el único camino que usa el sitio
--    (home.js llama siempre a esta RPC, nunca consulta la tabla
--    directo). Se corrige agregando el chequeo explícito adentro de la
--    función, y de paso se suma el nombre de la categoría desde el
--    catálogo nuevo.
-- -------------------------------------------------------------------------
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

commit;

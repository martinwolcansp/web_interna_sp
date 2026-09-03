-- =========================================================================
-- Migración 5 — Categoría "Publica" + RPC pública para que la home
-- muestre novedades aunque no haya sesión iniciada.
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
--
-- schema.sql (no requiere cambios de esquema, sólo datos/funciones),
-- rpc_home.sql y seed_categorias_novedades.sql ya quedaron actualizados
-- con estos mismos cambios para instalaciones nuevas.
-- =========================================================================

begin;

-- Categoría explícita para marcar una novedad como "pública": además de
-- verse en la pizarra como cualquier otra categoría para los usuarios
-- logueados (el filtro por área sigue aplicando igual, vía
-- fn_puede_ver_novedad), se muestra también en la home a un visitante
-- que todavía no inició sesión.
insert into categorias_novedades (id, nombre, orden) values
  ('publica', 'Pública', 0)
on conflict (id) do update set
  nombre = excluded.nombre;

-- Novedades vigentes de categoría "publica", para la home sin sesión.
-- Deliberadamente NO reutiliza fn_mis_novedades / fn_puede_ver_novedad:
-- esas dependen de auth.uid() y, al ser security definer, ya evalúan
-- fuera de RLS -- exponerlas a anon devolvería cualquier novedad sin
-- restricción de área (el comportamiento por defecto), no sólo las
-- pensadas para el público. Esta función sólo puede devolver lo que
-- tenga categoria_id = 'publica', así que es segura de exponer a anon.
create or replace function fn_novedades_publicas()
returns table (
  id uuid,
  titulo text,
  cuerpo text,
  categoria text,
  autor_nombre text,
  publicado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id, n.titulo, n.cuerpo, c.nombre as categoria,
    p.nombre as autor_nombre,
    n.publicado_en
  from novedades n
  left join perfiles p on p.id = n.autor_id
  join categorias_novedades c on c.id = n.categoria_id
  where n.categoria_id = 'publica'
    and (n.vigente_hasta is null or n.vigente_hasta > now())
  order by n.publicado_en desc;
$$;

grant execute on function fn_novedades_publicas() to anon;

commit;

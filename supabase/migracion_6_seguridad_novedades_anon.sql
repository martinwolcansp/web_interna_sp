-- =========================================================================
-- Migración 6 — Cierra un hueco de seguridad: las RPCs de la pizarra que
-- son security definer (fn_mis_novedades, fn_novedad_detalle) no
-- chequeaban autenticación por su cuenta.
--
-- Encontrado revisando el pedido de "novedades públicas sin login"
-- (2026-09-03): fn_puede_ver_novedad() sólo reimplementaba el filtro de
-- ÁREA (la lección ya documentada de Migración 3 -- una función security
-- definer no hereda las políticas RLS de la tabla que consulta), pero no
-- el "auth.role() = 'authenticated'" que sí tiene la política real de
-- "novedades". Resultado: cualquiera con la anon key (pública por
-- diseño, no es un secreto) podía llamar fn_mis_novedades() o
-- fn_novedad_detalle() directo por REST, sin sesión, y ver cualquier
-- novedad SIN restricción de área -- que son la mayoría, "todas las
-- áreas" es el comportamiento por defecto -- no sólo las de la nueva
-- categoría "Publica" (Migración 5). El sitio nunca lo mostraba (el
-- front siempre pasa por auth.js primero), pero la API sí lo permitía.
--
-- Para bases YA desplegadas. Segura de correr más de una vez
-- (create or replace).
--
-- schema.sql y rpc_home.sql ya quedaron actualizados con estos mismos
-- cambios para instalaciones nuevas.
-- =========================================================================

begin;

create or replace function fn_puede_ver_novedad(p_novedad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'authenticated'
    and (
      -- superadmin: ve todo
      exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
      or
      -- sin filas en novedades_areas: la novedad es para todas las áreas
      not exists (select 1 from novedades_areas na where na.novedad_id = p_novedad_id)
      or
      -- el área del usuario está entre las áreas destinatarias
      exists (
        select 1
        from perfiles p
        join novedades_areas na on na.area_id = p.area_id
        where p.id = auth.uid() and p.activo and na.novedad_id = p_novedad_id
      )
    );
$$;

-- Endurecimiento menor de paso, mismo tema: evita que una llamada
-- anónima reviente con un error de not-null en vez de simplemente no
-- hacer nada (nunca llegaba a grabar la fila, la constraint ya la
-- frenaba -- esto no era explotable, sólo prolijidad).
create or replace function fn_marcar_leida(p_novedad_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into novedades_leidas (usuario_id, novedad_id)
  select auth.uid(), p_novedad_id
  where auth.uid() is not null
  on conflict do nothing;
$$;

commit;

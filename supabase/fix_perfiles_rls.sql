-- =========================================================================
-- Fix: "infinite recursion detected in policy for relation perfiles" (42P17)
--
-- Causa: las políticas "perfiles: superadmin ve/edita todos" consultaban
-- la propia tabla perfiles directamente, lo que vuelve a disparar esas
-- mismas políticas y entra en loop. Se resuelve moviendo el chequeo a una
-- función security definer (mismo patrón que fn_tiene_permiso), que
-- bypassea RLS en su consulta interna.
--
-- Correr en el SQL Editor de Supabase Studio. Es seguro correrlo aunque
-- ya hayas aplicado schema.sql antes (usa create or replace / drop if
-- exists).
-- =========================================================================

create or replace function fn_es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and es_superadmin and activo
  );
$$;

drop policy if exists "perfiles: superadmin ve todos" on perfiles;
create policy "perfiles: superadmin ve todos" on perfiles
  for select using (fn_es_superadmin());

drop policy if exists "perfiles: superadmin edita todos" on perfiles;
create policy "perfiles: superadmin edita todos" on perfiles
  for update using (fn_es_superadmin());

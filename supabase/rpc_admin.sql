-- =========================================================================
-- RPC para el panel de administración de usuarios (pages/admin.html).
-- Correr en el SQL Editor DESPUÉS de schema.sql.
-- =========================================================================

-- Último ingreso de cada usuario, tomado directo de auth.users
-- (last_sign_in_at), que Supabase Auth ya mantiene solo en cada login --
-- no hace falta ninguna columna ni trigger propio para esto. security
-- definer porque el cliente normal no tiene acceso al esquema auth; el
-- chequeo de permiso va en el where (si no es superadmin, no trae filas)
-- por la misma razón que fn_admin_novedades (rpc_pizarra_editor.sql):
-- es security definer y cualquier autenticado podría llamarla directo.
create or replace function fn_admin_ultimos_ingresos()
returns table (
  id uuid,
  ultimo_ingreso timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.last_sign_in_at as ultimo_ingreso
  from auth.users u
  where fn_es_superadmin();
$$;

grant execute on function fn_admin_ultimos_ingresos() to authenticated;

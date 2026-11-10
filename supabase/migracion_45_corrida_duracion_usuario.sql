-- =====================================================================
-- migracion_45_corrida_duracion_usuario.sql
-- Indicadores por Área: usuario que hizo cada actualización.
--
-- La tabla "Actualizaciones anteriores" de cada informe suma dos columnas:
--   - Duración: se calcula en la página con iniciado_en y finalizado_en
--     (ya existen en ind_corrida, así que también sale para el historial).
--   - Usuario: ind_corrida ya guarda iniciado_por (auth.uid()), pero la
--     página no puede leer perfiles de otros usuarios (RLS: cada uno ve
--     el propio). Por eso se guarda el nombre en la propia corrida, en
--     iniciado_por_nombre, que lo completa un trigger al crearla.
--
-- Las corridas automáticas quedan con el nombre del usuario técnico
-- (INDICADORES_BOT_EMAIL).
--
-- No hace falta redesplegar indicadores-api. Segura de correr más de una vez.
-- =====================================================================

-- 1. Columna
alter table ind_corrida add column if not exists iniciado_por_nombre text;

comment on column ind_corrida.iniciado_por_nombre is 'Nombre y apellido (o email) de quien disparó la corrida, tomado de perfiles al crearla. Lo completa trg_ind_corrida_usuario; no se edita desde la web.';

-- 2. Nombre a mostrar de un usuario: nombre y apellido; si no, el email.
create or replace function fn_nombre_usuario(p_usuario uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email)
       from perfiles p where p.id = p_usuario),
    (select u.email from auth.users u where u.id = p_usuario)
  );
$$;

revoke all on function fn_nombre_usuario(uuid) from public, anon, authenticated;

-- 3. Historial: completar las corridas que ya existen.
--    (Va antes del trigger, que en un update conserva el valor anterior.)
update ind_corrida
   set iniciado_por_nombre = fn_nombre_usuario(iniciado_por)
 where iniciado_por is not null
   and iniciado_por_nombre is null;

-- 4. Trigger: al crear la corrida completa usuario y nombre; en los
--    updates los deja como estaban (no se pueden cambiar desde la web).
create or replace function fn_ind_corrida_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.iniciado_por := coalesce(auth.uid(), new.iniciado_por);
    new.iniciado_por_nombre := fn_nombre_usuario(new.iniciado_por);
  else
    new.iniciado_por := old.iniciado_por;
    new.iniciado_por_nombre := old.iniciado_por_nombre;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ind_corrida_usuario on ind_corrida;
create trigger trg_ind_corrida_usuario
  before insert or update on ind_corrida
  for each row execute function fn_ind_corrida_usuario();

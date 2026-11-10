-- =====================================================================
-- migracion_46_corrida_usuario_mkt_clientes.sql
-- Duración y usuario en "Actualizaciones anteriores" de Informe MKT
-- (informe_mkt_corrida) y Clientes activos (cli_corrida).
--
-- Mismo criterio que la migración 45 (ind_corrida):
--   - La duración se calcula en la página con iniciado_en y finalizado_en.
--   - El nombre de quien la hizo se guarda en iniciado_por_nombre, que
--     completa un trigger al crear la corrida (la página no puede leer
--     perfiles de otros usuarios).
--
-- Informe MKT: las corridas con origen "auditoria" (botón Auditar de
-- Integración NetSuite <-> GHL) corren con el usuario técnico y guardan
-- en solicitado_por el email de quien la pidió; en esas se muestra a esa
-- persona, no al usuario técnico.
--
-- Requiere la migración 45 (fn_nombre_usuario). No hace falta redesplegar
-- los servicios. Segura de correr más de una vez.
-- =====================================================================

-- 1. Nombre a mostrar a partir de un email (para solicitado_por).
create or replace function fn_nombre_usuario_email(p_email text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), p.email)
       from perfiles p where lower(p.email) = lower(p_email) limit 1),
    nullif(p_email, '')
  );
$$;

revoke all on function fn_nombre_usuario_email(text) from public, anon, authenticated;

-- 2. Columnas
alter table informe_mkt_corrida add column if not exists iniciado_por_nombre text;
alter table cli_corrida         add column if not exists iniciado_por_nombre text;

comment on column informe_mkt_corrida.iniciado_por_nombre is 'Nombre de quien disparó la corrida (si vino de Auditoría, quien la pidió: solicitado_por). Lo completa trg_corrida_usuario; no se edita desde la web.';
comment on column cli_corrida.iniciado_por_nombre is 'Nombre y apellido (o email) de quien disparó la corrida. Lo completa trg_corrida_usuario; no se edita desde la web.';

-- 3. Historial: completar las corridas que ya existen (antes del trigger,
--    que en un update conserva el valor anterior).
update informe_mkt_corrida
   set iniciado_por_nombre = coalesce(fn_nombre_usuario_email(solicitado_por), fn_nombre_usuario(iniciado_por))
 where iniciado_por_nombre is null
   and (solicitado_por is not null or iniciado_por is not null);

update cli_corrida
   set iniciado_por_nombre = fn_nombre_usuario(iniciado_por)
 where iniciado_por_nombre is null
   and iniciado_por is not null;

-- 4. Trigger común: al crear completa usuario y nombre (o el de
--    solicitado_por, si la tabla lo tiene y viene cargado); en los
--    updates los deja como estaban.
create or replace function fn_corrida_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.iniciado_por := coalesce(auth.uid(), new.iniciado_por);
    new.iniciado_por_nombre := coalesce(
      fn_nombre_usuario_email(to_jsonb(new) ->> 'solicitado_por'),
      fn_nombre_usuario(new.iniciado_por));
  else
    new.iniciado_por := old.iniciado_por;
    new.iniciado_por_nombre := old.iniciado_por_nombre;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_corrida_usuario on informe_mkt_corrida;
create trigger trg_corrida_usuario
  before insert or update on informe_mkt_corrida
  for each row execute function fn_corrida_usuario();

drop trigger if exists trg_corrida_usuario on cli_corrida;
create trigger trg_corrida_usuario
  before insert or update on cli_corrida
  for each row execute function fn_corrida_usuario();

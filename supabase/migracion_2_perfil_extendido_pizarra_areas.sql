-- =========================================================================
-- Migración 2 — Perfil extendido + pizarra filtrable por área
-- (Adenda 2 de Propuesta_Proyecto_Auth_Roles_CMS.docx, puntos 12.1 y 12.3)
--
-- Para bases YA desplegadas (como la de producción/staging actual).
-- No vuelvas a correr schema.sql completo sobre una base existente: la
-- política "novedades: ver todo autenticado" que reemplaza este script
-- quedaría duplicada en vez de reemplazada (create policy no la borra
-- sola), y las dos convivirían — la vieja, más permisiva, taparía el
-- filtro nuevo. Este script sí es seguro de correr más de una vez
-- (columnas con IF NOT EXISTS, política vieja con DROP explícito antes
-- de crear la nueva).
--
-- schema.sql ya quedó actualizado con estos mismos cambios, para que una
-- instalación nueva desde cero los traiga de una.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- 1. Perfil extendido (punto 12.1)
-- -------------------------------------------------------------------------
alter table perfiles add column if not exists apellido text;
alter table perfiles add column if not exists legajo   text;
alter table perfiles add column if not exists foto_url text;

comment on column perfiles.apellido is 'Autocompletado desde Google (family_name) en el primer login; editable por el superadmin.';
comment on column perfiles.legajo is 'No viene de Google. Se carga a mano desde el panel de superadmin (o import de RRHH, a definir) — ver Adenda 2 de la propuesta.';
comment on column perfiles.foto_url is 'Autocompletado desde Google (avatar_url/picture) en el primer login.';

-- Trigger de alta: separa nombre/apellido y trae la foto desde Google.
-- Sólo afecta altas nuevas (próximos primeros logins); ver el backfill
-- más abajo para las cuentas que ya existen.
create or replace function fn_alta_perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre, apellido, email, foto_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'given_name', new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'family_name',
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill: a los perfiles que ya existen (altas anteriores a esta
-- migración) les completa apellido/foto/nombre desde los mismos datos de
-- Google que ya tienen guardados en auth.users, sin pisar nada que ya
-- esté cargado a mano.
update perfiles p
set
  apellido = coalesce(p.apellido, u.raw_user_meta_data ->> 'family_name'),
  foto_url = coalesce(p.foto_url, u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  nombre   = coalesce(u.raw_user_meta_data ->> 'given_name', p.nombre)
from auth.users u
where u.id = p.id
  and (p.apellido is null or p.foto_url is null);

-- -------------------------------------------------------------------------
-- 2. Pizarra filtrable por área (punto 12.3)
-- -------------------------------------------------------------------------
create table if not exists novedades_areas (
  novedad_id uuid not null references novedades(id) on delete cascade,
  area_id    text not null references areas(id) on delete cascade,
  primary key (novedad_id, area_id)
);

comment on table novedades_areas is 'Filtro de audiencia por área para una novedad. Sin filas = todas las áreas.';

alter table novedades_areas enable row level security;

drop policy if exists "novedades_areas: lectura autenticados" on novedades_areas;
create policy "novedades_areas: lectura autenticados" on novedades_areas
  for select using (auth.role() = 'authenticated');

drop policy if exists "novedades_areas: escritura con permiso de editar pizarra" on novedades_areas;
create policy "novedades_areas: escritura con permiso de editar pizarra" on novedades_areas
  for all using (fn_tiene_permiso('pizarra', 'editar'));

create or replace function fn_puede_ver_novedad(p_novedad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
    or
    not exists (select 1 from novedades_areas na where na.novedad_id = p_novedad_id)
    or
    exists (
      select 1
      from perfiles p
      join novedades_areas na on na.area_id = p.area_id
      where p.id = auth.uid() and p.activo and na.novedad_id = p_novedad_id
    );
$$;

drop policy if exists "novedades: ver todo autenticado" on novedades;
drop policy if exists "novedades: ver segun area o global" on novedades;
create policy "novedades: ver segun area o global" on novedades
  for select using (auth.role() = 'authenticated' and fn_puede_ver_novedad(id));

commit;

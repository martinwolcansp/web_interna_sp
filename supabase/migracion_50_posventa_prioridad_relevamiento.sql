-- =====================================================================
-- migracion_50_posventa_prioridad_relevamiento.sql
-- Indicadores de Posventa: prioridad de los relevamientos.
--
-- En NetSuite se agregó al relevamiento posventa el campo
-- custrecord_sp_relev_prioridad (lista customlist_sp_prioridad_relev).
-- El servicio indicadores-api trae su ID interno y su nombre a
-- ind_posventa_relevamiento.
--
-- ind_posventa_prioridad guarda, por cada valor de la lista, el rango
-- (1 = más alta) y el color con que se muestra. El "Detalle de
-- relevamientos" agrupa por caso y pinta el caso con el nivel más alto
-- (menor rango) de sus relevamientos. Si en NetSuite se agrega o reordena
-- un nivel, se actualiza esta tabla; no hace falta tocar la página.
--
-- Después de correrla, tocar "Actualizar ahora" en la página para que se
-- completen las columnas nuevas.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Prioridad en los relevamientos
-- ---------------------------------------------------------------------
alter table ind_posventa_relevamiento
  add column if not exists prioridad_id integer,
  add column if not exists prioridad    text;

comment on column ind_posventa_relevamiento.prioridad_id is
  'ID interno del valor de customlist_sp_prioridad_relev (custrecord_sp_relev_prioridad). Cruza con ind_posventa_prioridad.id.';
comment on column ind_posventa_relevamiento.prioridad is
  'Nombre del nivel de prioridad tal como está en NetSuite.';

-- ---------------------------------------------------------------------
-- 2. Niveles de prioridad (rango y color)
-- ---------------------------------------------------------------------
create table if not exists ind_posventa_prioridad (
  id          integer primary key,               -- ID interno del valor en customlist_sp_prioridad_relev
  nombre      text not null,                     -- etiqueta que se muestra en la web
  rango       integer not null,                  -- 1 = más alta; define cuál manda en el caso
  color       text not null default '#9AA0A6',   -- color del borde y de la etiqueta
  actualizado_en timestamptz not null default now()
);

comment on table ind_posventa_prioridad is
  'Niveles de prioridad de los relevamientos posventa: rango (1 = más alta) y color para el Detalle de relevamientos.';

insert into ind_posventa_prioridad (id, nombre, rango, color) values
  (1, 'Crítica', 1, '#c0392b'),
  (2, 'Alta',    2, '#eb6834'),
  (3, 'Media',   3, '#d99a00'),
  (4, 'Baja',    4, '#2a78d6')
on conflict (id) do nothing;

alter table ind_posventa_prioridad enable row level security;

drop policy if exists "ind_posventa_prioridad: ver" on ind_posventa_prioridad;
create policy "ind_posventa_prioridad: ver" on ind_posventa_prioridad
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('indicadores-posventa', 'ver')));

drop policy if exists "ind_posventa_prioridad: escribir" on ind_posventa_prioridad;
create policy "ind_posventa_prioridad: escribir" on ind_posventa_prioridad
  for all using ((select fn_tiene_permiso('indicadores-posventa', 'editar')))
  with check ((select fn_tiene_permiso('indicadores-posventa', 'editar')));

grant select, insert, update, delete on ind_posventa_prioridad to authenticated;

commit;

notify pgrst, 'reload schema';

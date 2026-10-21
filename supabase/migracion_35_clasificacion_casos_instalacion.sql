-- =====================================================================
-- migracion_35_clasificacion_casos_instalacion.sql
-- Clasificación de los casos de instalación en dos dimensiones:
--
--   Tipo de trabajo        Instalación, Reprogramación, Traslado, Ampliación,
--                          Cámaras... (tipo de proyecto sin "Alarma"; en los
--                          tipos viejos Alarma Hogar / Alarma Comercio se
--                          deduce del título del presupuesto)
--   Clasificación comercial Unidad comercial > Categoría, del presupuesto de
--                          origen de la OV, si no de la oportunidad, si no de
--                          la equivalencia del tipo de proyecto viejo
--
-- ind_equivalencia_tipo_proyecto: tipo de proyecto viejo -> tipo de trabajo y
-- unidad comercial. tipo_trabajo vacío = se deduce del título del presupuesto.
-- La pueden editar quienes tengan "editar" en Indicadores - Instalaciones; el
-- servicio la aplica en la próxima actualización.
--
-- ORDEN: correr esta migración ANTES de desplegar indicadores-api (el servicio
-- ya escribe las columnas nuevas, también al actualizar Posventa).
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_caso_instalacion
  add column if not exists tipo_trabajo          text,
  add column if not exists tipo_trabajo_origen   text,
  add column if not exists unidad_comercial      text,
  add column if not exists categoria             text,
  add column if not exists clasificacion_origen  text;

comment on column ind_caso_instalacion.tipo_trabajo is 'Tipo de proyecto sin "Alarma"; en Alarma Hogar/Comercio, deducido del título del presupuesto.';
comment on column ind_caso_instalacion.tipo_trabajo_origen is 'tipo de proyecto / título del presupuesto / equivalencia';
comment on column ind_caso_instalacion.unidad_comercial is 'custbody_mw_sp_unidad_comercial del presupuesto, de la oportunidad o de la equivalencia del tipo de proyecto.';
comment on column ind_caso_instalacion.categoria is 'custbody_3k_categoria del presupuesto o de la oportunidad.';
comment on column ind_caso_instalacion.clasificacion_origen is 'presupuesto / oportunidad / equivalencia (null = sin dato)';

create table if not exists ind_equivalencia_tipo_proyecto (
  tipo_proyecto     text primary key,
  tipo_trabajo      text,          -- vacío = se deduce del título del presupuesto
  unidad_comercial  text,
  actualizado_en    timestamptz not null default now()
);

comment on table ind_equivalencia_tipo_proyecto is
  'Equivalencias de tipos de proyecto viejos a tipo de trabajo y unidad comercial (Indicadores de Instalaciones).';

insert into ind_equivalencia_tipo_proyecto (tipo_proyecto, tipo_trabajo, unidad_comercial) values
  ('Alarma Hogar',    null,          'Hogar'),
  ('Alarma Comercio', null,          'Comercio'),
  ('Alarma Obra',     'Instalación', 'Obra')
on conflict (tipo_proyecto) do nothing;

insert into ind_tabla_area (tabla, area) values
  ('ind_equivalencia_tipo_proyecto', 'instalaciones'),
  ('ind_equivalencia_tipo_proyecto', 'posventa')
on conflict do nothing;

alter table ind_equivalencia_tipo_proyecto enable row level security;
drop policy if exists "ind_equivalencia_tipo_proyecto: ver" on ind_equivalencia_tipo_proyecto;
create policy "ind_equivalencia_tipo_proyecto: ver" on ind_equivalencia_tipo_proyecto
  for select using (auth.role() = 'authenticated' and fn_puede_tabla_indicadores('ind_equivalencia_tipo_proyecto', 'ver'));
drop policy if exists "ind_equivalencia_tipo_proyecto: escribir" on ind_equivalencia_tipo_proyecto;
create policy "ind_equivalencia_tipo_proyecto: escribir" on ind_equivalencia_tipo_proyecto
  for all using (fn_tiene_permiso('indicadores-instalaciones', 'editar'))
  with check (fn_tiene_permiso('indicadores-instalaciones', 'editar'));
grant select, insert, update, delete on ind_equivalencia_tipo_proyecto to authenticated;

commit;

notify pgrst, 'reload schema';

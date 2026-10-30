-- =====================================================================
-- migracion_44_indicadores_servicio_tecnico.sql
-- Indicadores por Área: Servicio Técnico.
--
-- Casos de soporte asignados a "Servicio Técnico" en NetSuite. Los trae el
-- servicio indicadores-api (app/areas/servicio_tecnico.py) y los lee la
-- página pages/indicadores-area/servicio-tecnico.html.
--
-- Tabla propia (no usa las tablas comunes de casos de instalación): otro
-- asignado y otros campos. El problema sale del campo
-- custevent_3k_comentarios_tecnico (texto libre): el servicio lo clasifica en
-- una categoría (categoria_problema) por palabras clave, o la toma del
-- formulario estructurado cuando exista (app/fuentes/clasificacion_st.py).
--
-- Crea la sección de permisos indicadores-servicio-tecnico, la tabla y sus
-- políticas RLS (con el permiso evaluado una vez por consulta, como la 40).
--
-- Correr ANTES de desplegar el servicio. Segura de correr más de una vez.
-- =====================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('indicadores-servicio-tecnico', 'Indicadores - Servicio Técnico', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

create table if not exists ind_servicio_tecnico_caso (
  caso_id         bigint primary key,      -- id interno del caso en NetSuite
  numero          text,                    -- número del caso
  titulo          text,                    -- asunto del caso
  fecha_creacion  date,
  fecha_cerrada   date,
  cliente_id      bigint,
  cliente         text,
  nro_cuenta      text,
  tecnico         text,                    -- custevent_3k_tecnico_asignado_caso (sin "DAI ")
  problema        text,                    -- custevent_3k_comentarios_tecnico (texto libre)
  problema_st     text,                    -- custevent_3k_problema_st (valor de NetSuite)
  categoria_problema text,                 -- categoría asignada (formulario o palabras clave)
  categoria_origen   text,                 -- formulario | comentario | titulo | null (sin clasificar)
  vuelta_planificada boolean not null default false, -- el técnico dejó pendiente volver
  estado_caso     text,
  categoria       text,
  asignado_a      text,
  corrida_id      uuid,
  actualizado_en  timestamptz not null default now()
);

comment on table ind_servicio_tecnico_caso is 'Indicadores - Servicio Técnico: casos asignados a Servicio Técnico (indicadores-api, app/areas/servicio_tecnico.py).';

-- Por si la tabla se creó con una versión anterior de esta migración.
alter table ind_servicio_tecnico_caso add column if not exists problema_st text;
alter table ind_servicio_tecnico_caso add column if not exists categoria_problema text;
alter table ind_servicio_tecnico_caso add column if not exists categoria_origen text;
alter table ind_servicio_tecnico_caso add column if not exists vuelta_planificada boolean not null default false;

create index if not exists ind_servicio_tecnico_caso_cliente on ind_servicio_tecnico_caso (cliente_id, fecha_creacion);
create index if not exists ind_servicio_tecnico_caso_fecha   on ind_servicio_tecnico_caso (fecha_creacion);

alter table ind_servicio_tecnico_caso enable row level security;

drop policy if exists "ind_servicio_tecnico_caso: ver" on ind_servicio_tecnico_caso;
create policy "ind_servicio_tecnico_caso: ver" on ind_servicio_tecnico_caso
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('indicadores-servicio-tecnico', 'ver')));

drop policy if exists "ind_servicio_tecnico_caso: escribir" on ind_servicio_tecnico_caso;
create policy "ind_servicio_tecnico_caso: escribir" on ind_servicio_tecnico_caso
  for all using ((select fn_tiene_permiso('indicadores-servicio-tecnico', 'editar')))
  with check ((select fn_tiene_permiso('indicadores-servicio-tecnico', 'editar')));

grant select, insert, update, delete on ind_servicio_tecnico_caso to authenticated;

commit;

notify pgrst, 'reload schema';

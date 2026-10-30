-- =====================================================================
-- migracion_42_clientes_activos.sql
-- Mosaico "Clientes activos" (30 de octubre de 2026)
-- ---------------------------------------------------------------------
-- Dos informes actualizables por separado desde la web, con el servicio
-- clientes-api (servicios/clientes-api):
--
--   Segmentacion Clientes  base completa de clientes de NetSuite (todos,
--                          activos o no) y sus establecimientos, para
--                          segmentar campañas de MKT.
--   Analisis Bajas         bajas de establecimientos por mes, con plan de
--                          accion. Reemplaza el informe manual (busqueda
--                          "SP Clientes Suspendidos por Baja").
--
-- Secciones de permisos (mismo esquema que Indicadores por Area):
--   clientes-activos        mosaico (ver -> ve el mosaico)
--   clientes-segmentacion   ver -> pestaña Segmentacion; editar -> Actualizar
--   clientes-bajas          ver -> pestaña Bajas;        editar -> Actualizar
--
-- Tablas:
--   cli_corrida          corridas de actualizacion de los dos informes
--   cli_cliente          un registro por cliente de NetSuite (cliente
--                        principal / "empresa matriz", sin parent). Es la
--                        tabla maestra: los datos que se sumen mas adelante
--                        van en tablas hijas cli_<tema> con FK a cli_cliente
--                        (como cli_establecimiento), o en "datos" (jsonb) si
--                        es un atributo suelto.
--   cli_establecimiento  subclientes (C00404-1): un establecimiento = una
--                        cuenta ByKom. FK a cli_cliente.
--   cli_baja             "foto" de cada baja: una fila por establecimiento y
--                        fecha de suspension. NO se borra cuando el registro
--                        deja de cumplir la busqueda (reactivacion, cambio de
--                        estado, cuenta reutilizada): queda vigente = false
--                        con su estado actual. Ver README del servicio.
--
-- Relacion con el modelo de la integracion NetSuite <-> GHL: cli_cliente
-- guarda ghl_contact_id (custentity_ghl_contact_id), la misma clave que
-- contacto.ghl_contact_id. La vista v_cli_cliente la resuelve a contacto.id
-- sin FK dura (no todos los clientes tienen contacto en GHL todavia).
--
-- Segura de correr mas de una vez. Requiere PostgreSQL 15+ (vista con
-- security_invoker, para que respete las politicas RLS de las tablas).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Secciones
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('clientes-activos',      'Clientes activos',                     'mosaico'),
  ('clientes-segmentacion', 'Clientes activos - Segmentacion',      'general'),
  ('clientes-bajas',        'Clientes activos - Analisis Bajas',    'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Corridas (una en curso por informe)
-- ---------------------------------------------------------------------
create table if not exists cli_corrida (
  id             uuid primary key default gen_random_uuid(),
  informe        text not null check (informe in ('segmentacion', 'bajas')),
  periodo        date,                       -- bajas: primer dia del mes actualizado
  estado         text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  origen         text not null default 'manual' check (origen in ('manual', 'automatica')),
  paso           text,
  mensaje        text,
  stats          jsonb not null default '{}'::jsonb,
  log            text,
  iniciado_por   uuid default auth.uid(),
  iniciado_en    timestamptz not null default now(),
  finalizado_en  timestamptz
);

comment on table cli_corrida is 'Corridas de actualizacion de Clientes activos (servicio clientes-api). informe = sufijo de la seccion clientes-<informe>.';

create unique index if not exists cli_corrida_una_en_curso
  on cli_corrida (informe) where estado = 'en_curso';
create index if not exists cli_corrida_informe_fin
  on cli_corrida (informe, estado, finalizado_en desc);

alter table cli_corrida enable row level security;

drop policy if exists "cli_corrida: ver" on cli_corrida;
create policy "cli_corrida: ver" on cli_corrida
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('clientes-' || informe, 'ver'));
drop policy if exists "cli_corrida: crear" on cli_corrida;
create policy "cli_corrida: crear" on cli_corrida
  for insert with check (fn_tiene_permiso('clientes-' || informe, 'editar'));
drop policy if exists "cli_corrida: actualizar" on cli_corrida;
create policy "cli_corrida: actualizar" on cli_corrida
  for update using (fn_tiene_permiso('clientes-' || informe, 'editar'))
  with check (fn_tiene_permiso('clientes-' || informe, 'editar'));
drop policy if exists "cli_corrida: borrar" on cli_corrida;
create policy "cli_corrida: borrar" on cli_corrida
  for delete using (fn_tiene_permiso('clientes-' || informe, 'editar'));

grant select, insert, update, delete on cli_corrida to authenticated;

-- ---------------------------------------------------------------------
-- 3. Cliente (tabla maestra)
-- ---------------------------------------------------------------------
create table if not exists cli_cliente (
  ns_id              bigint primary key,           -- ID interno del cliente en NetSuite
  entity_id          text,                         -- C00404
  nombre             text,
  es_persona         boolean,
  ghl_contact_id     text,                         -- custentity_ghl_contact_id (= contacto.ghl_contact_id)
  telefono           text,
  telefono_movil     text,
  email              text,
  direccion          text,                         -- calle y numero (addr1)
  localidad          text,
  provincia          text,
  cp                 text,
  fecha_creacion     date,
  estado_ns          text,                         -- estado de la entidad en NetSuite (entitystatus)
  inactivo           boolean not null default false,
  datos              jsonb not null default '{}'::jsonb,  -- atributos sueltos que se sumen mas adelante
  vigente            boolean not null default true,       -- false: no vino en la ultima actualizacion
  corrida_id         uuid references cli_corrida(id) on delete set null,
  actualizado_en     timestamptz not null default now()
);

comment on table cli_cliente is 'Clientes de NetSuite (cliente principal, sin parent). Tabla maestra del mosaico Clientes activos: los datos que se agreguen van en tablas hijas cli_<tema> con FK a ns_id.';
comment on column cli_cliente.vigente is 'false si el cliente no vino en la ultima actualizacion (eliminado o fuera del criterio en NetSuite). No se borra para no perder lo que cuelgue de el.';

create index if not exists cli_cliente_ghl_idx on cli_cliente (ghl_contact_id);
create index if not exists cli_cliente_entity_idx on cli_cliente (entity_id);
create index if not exists cli_cliente_localidad_idx on cli_cliente (localidad);

-- ---------------------------------------------------------------------
-- 4. Establecimiento (cuenta ByKom)
-- ---------------------------------------------------------------------
create table if not exists cli_establecimiento (
  ns_id              bigint primary key,           -- ID interno del subcliente (o del cliente, si la cuenta esta en el mismo registro)
  cliente_ns_id      bigint not null references cli_cliente(ns_id) on delete cascade,
  parent_ns_id       bigint,                       -- parent directo en NetSuite
  entity_id          text,                         -- C00404-1
  nombre             text,
  nro_cuenta         text,                         -- numero de establecimiento ByKom (421721)
  id_bykom           text,                         -- id interno del establecimiento en ByKom
  fecha_activacion   date,                         -- Fecha de activacion Bykom
  tipo_monitoreo     text,                         -- FIJO, ...
  tipo_cliente       text,                         -- ESTABLECIMIENTO, ...
  estado_servicio    text,
  activo             boolean,                      -- segun la lista de estados activos del servicio
  fecha_suspension   timestamptz,                  -- Fecha de Suspension Bykom
  motivo_baja        text,
  telefono           text,
  email              text,
  direccion          text,
  localidad          text,
  provincia          text,
  cp                 text,
  fecha_creacion     date,
  inactivo           boolean not null default false,
  datos              jsonb not null default '{}'::jsonb,
  vigente            boolean not null default true,
  corrida_id         uuid references cli_corrida(id) on delete set null,
  actualizado_en     timestamptz not null default now()
);

comment on table cli_establecimiento is 'Establecimientos (subclientes de NetSuite, uno por cuenta ByKom) de cada cliente de cli_cliente.';

create index if not exists cli_establecimiento_cliente_idx on cli_establecimiento (cliente_ns_id);
create index if not exists cli_establecimiento_cuenta_idx on cli_establecimiento (nro_cuenta);
create index if not exists cli_establecimiento_estado_idx on cli_establecimiento (estado_servicio);

-- ---------------------------------------------------------------------
-- 5. Bajas (foto mensual acumulativa)
-- ---------------------------------------------------------------------
create table if not exists cli_baja (
  establecimiento_ns_id   bigint not null,          -- ID interno del establecimiento
  fecha_suspension        timestamptz not null,     -- Fecha de Suspension Bykom
  periodo                 date not null,            -- primer dia del mes de la suspension
  cliente_ns_id           bigint,
  entity_id               text,
  nombre                  text,
  nombre_establecimiento  text,
  nro_cuenta              text,
  direccion               text,                     -- direccion de servicio
  localidad               text,
  fecha_activacion        date,                     -- antiguedad del servicio
  tipo_cliente            text,
  estado_servicio         text,                     -- estado cuando se tomo la foto por primera vez
  estado_actual           text,                     -- estado en la ultima actualizacion
  motivo_baja             text,
  comentarios_motivo      text,
  comentarios             text,
  fecha_inicio_suspension date,
  duracion_suspension     numeric,
  dias_suspendido         int,                      -- a la fecha de la ultima actualizacion
  telefono                text,
  email                   text,
  categoria               text,                     -- categoria del plan de accion (app/plan_accion.py)
  vigente                 boolean not null default true,  -- sigue en la busqueda de bajas
  primera_captura_en      timestamptz not null default now(),
  ultima_captura_en       timestamptz not null default now(),
  datos                   jsonb not null default '{}'::jsonb,
  corrida_id              uuid references cli_corrida(id) on delete set null,
  primary key (establecimiento_ns_id, fecha_suspension)
);

comment on table cli_baja is 'Foto de las bajas por mes. Una fila por establecimiento y fecha de suspension. Si en una actualizacion posterior el registro ya no cumple el criterio, queda vigente = false con su estado_actual (no se borra).';

create index if not exists cli_baja_periodo_idx on cli_baja (periodo);
create index if not exists cli_baja_cliente_idx on cli_baja (cliente_ns_id);
create index if not exists cli_baja_cuenta_idx on cli_baja (nro_cuenta);

-- Columnas agregadas despues de la primera version (por si ya se corrio).
alter table cli_establecimiento add column if not exists id_bykom text;
alter table cli_establecimiento add column if not exists fecha_activacion date;
alter table cli_establecimiento add column if not exists tipo_monitoreo text;
alter table cli_baja add column if not exists direccion text;
alter table cli_baja add column if not exists localidad text;
alter table cli_baja add column if not exists fecha_activacion date;

-- ---------------------------------------------------------------------
-- 6. RLS (permiso evaluado una vez por consulta, como la migracion 40)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  s text;
begin
  foreach t in array array['cli_cliente', 'cli_establecimiento', 'cli_baja'] loop
    s := case when t = 'cli_baja' then 'clientes-bajas' else 'clientes-segmentacion' end;
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using ((select auth.role()) = ''authenticated'' and (select fn_tiene_permiso(%L, ''ver'')))', t, t, s);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using ((select fn_tiene_permiso(%L, ''editar''))) with check ((select fn_tiene_permiso(%L, ''editar'')))', t, t, s, s);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

-- La pestaña Bajas muestra el telefono/email y el ID de GHL del cliente:
-- quien ve Bajas puede leer clientes y establecimientos (solo lectura).
drop policy if exists "cli_cliente: ver desde bajas" on cli_cliente;
create policy "cli_cliente: ver desde bajas" on cli_cliente
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-bajas', 'ver')));
drop policy if exists "cli_establecimiento: ver desde bajas" on cli_establecimiento;
create policy "cli_establecimiento: ver desde bajas" on cli_establecimiento
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-bajas', 'ver')));

-- ---------------------------------------------------------------------
-- 7. Vista de clientes con totales de establecimientos y enlace a contacto
-- ---------------------------------------------------------------------
create or replace view v_cli_cliente with (security_invoker = true) as
select
  c.*,
  coalesce(e.establecimientos, 0)          as establecimientos,
  coalesce(e.establecimientos_activos, 0)  as establecimientos_activos,
  coalesce(e.establecimientos, 0) - coalesce(e.establecimientos_activos, 0) as establecimientos_inactivos,
  e.cuentas,
  e.estados,
  ct.id                                    as contacto_id
from cli_cliente c
left join lateral (
  select
    count(*)                                         as establecimientos,
    count(*) filter (where es.activo)                as establecimientos_activos,
    string_agg(distinct es.nro_cuenta, ', ')         as cuentas,
    string_agg(distinct es.estado_servicio, ', ')    as estados
  from cli_establecimiento es
  where es.cliente_ns_id = c.ns_id and es.vigente
) e on true
left join contacto ct on ct.ghl_contact_id = c.ghl_contact_id;

comment on view v_cli_cliente is 'Clientes con cantidad de establecimientos activos/inactivos, cuentas ByKom y contacto de la integracion GHL (contacto.id).';

grant select on v_cli_cliente to authenticated;

commit;

notify pgrst, 'reload schema';

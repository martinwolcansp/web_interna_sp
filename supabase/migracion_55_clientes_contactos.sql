-- =====================================================================
-- migracion_55_clientes_contactos.sql
-- Pestaña "Clientes activos + contactos" (25 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- Primera etapa de la sincronizacion de contactos ByKom -> NetSuite -> GHL:
-- se suben a mano los exports de ByKom (Clientes cuenta y Clientes contactos),
-- se cruzan con cli_cliente / cli_establecimiento y se arma la propuesta de
-- telefonos para NetSuite (CSV para el Import Assistant). No escribe en
-- NetSuite ni en GHL.
--
-- Seccion de permisos:
--   clientes-contactos   ver -> pestaña; editar -> subir archivos, procesar,
--                        marcar propuestas a incluir
--
-- Cambios:
--   1. Seccion clientes-contactos.
--   2. cli_corrida acepta informe = 'contactos'.
--   3. Telefonos completos de NetSuite en cli_cliente y cli_establecimiento
--      (altphone = celular, phone = fijo, telefono_contacto2 = segundo
--      numero, cada uno con su caracteristica). Los carga la Segmentacion.
--   4. Tablas cnt_*:
--        cnt_carga            un registro por archivo subido (respaldo en
--                             Storage, bucket bykom-exports)
--        cnt_bykom_cuenta     cuentas de ByKom (order_id = custentity_3k_id_bykom)
--        cnt_bykom_contacto   contactos de ByKom (lista de llamadas)
--        cnt_evento           altas, bajas y cambios detectados entre cargas
--                             (aviso de cuentas y contactos eliminados)
--        cnt_propuesta        telefono propuesto por registro de NetSuite y campo
--      Nada se borra: lo que no viene en la ultima carga queda vigente = false
--      con la fecha en que dejo de venir.
--   5. Bucket privado bykom-exports (Storage) con sus politicas.
--
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Seccion
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('clientes-contactos', 'Clientes activos - Contactos', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Corridas: informe 'contactos'
-- ---------------------------------------------------------------------
alter table cli_corrida drop constraint if exists cli_corrida_informe_check;
alter table cli_corrida add constraint cli_corrida_informe_check
  check (informe in ('segmentacion', 'bajas', 'contactos'));

-- ---------------------------------------------------------------------
-- 3. Telefonos de NetSuite
-- ---------------------------------------------------------------------
alter table cli_cliente add column if not exists telefono_car   text;  -- custentity_ap_codigo_de_area_telefono
alter table cli_cliente add column if not exists celular        text;  -- altphone
alter table cli_cliente add column if not exists celular_car    text;  -- custentity_ap_codigo_area_tel_celular
alter table cli_cliente add column if not exists telefono2      text;  -- custentity_ap_telefono_contacto2
alter table cli_cliente add column if not exists telefono2_car  text;  -- custentity_ap_codigo_area_tel_cont2

alter table cli_establecimiento add column if not exists telefono_car   text;
alter table cli_establecimiento add column if not exists celular        text;
alter table cli_establecimiento add column if not exists celular_car    text;
alter table cli_establecimiento add column if not exists telefono2      text;
alter table cli_establecimiento add column if not exists telefono2_car  text;

comment on column cli_cliente.celular is 'altphone de NetSuite: en SP es el celular (mobilephone no se usa). Su caracteristica va en celular_car.';
comment on column cli_establecimiento.celular is 'altphone de NetSuite: en SP es el celular (mobilephone no se usa). Su caracteristica va en celular_car.';

-- ---------------------------------------------------------------------
-- 4. Tablas de contactos
-- ---------------------------------------------------------------------
create table if not exists cnt_carga (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('cuentas', 'contactos')),
  archivo         text not null,              -- nombre original del archivo
  ruta            text,                       -- objeto en Storage (bykom-exports/<ruta>)
  bytes           bigint,
  filas           int,
  estado          text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  mensaje         text,
  stats           jsonb not null default '{}'::jsonb,
  subido_por      uuid default auth.uid(),
  subido_por_nombre text,
  subido_en       timestamptz not null default now(),
  procesado_en    timestamptz
);
comment on table cnt_carga is 'Archivos de ByKom subidos desde la pestaña Clientes activos + contactos. El archivo queda como respaldo en Storage (bucket bykom-exports).';
create index if not exists cnt_carga_tipo_idx on cnt_carga (tipo, subido_en desc);

create table if not exists cnt_bykom_cuenta (
  order_id        text primary key,           -- id interno de la cuenta en ByKom (= custentity_3k_id_bykom)
  id_cl           text,                       -- numero de cuenta / abonado (C146, 7005)
  nombre          text,
  nombre_dos      text,
  nombre_mix      text,
  domicilio       text,
  ciudad          text,
  estado          text,                       -- DESHABILITADA o vacio
  deshabilitada   boolean not null default false,
  ultima_senal    timestamptz,                -- fecha_mensaje
  datos           jsonb not null default '{}'::jsonb,
  carga_id        uuid references cnt_carga(id) on delete set null,
  vigente         boolean not null default true,   -- false: no vino en la ultima carga
  primera_carga_en timestamptz not null default now(),
  no_vigente_desde timestamptz,
  actualizado_en  timestamptz not null default now()
);
comment on table cnt_bykom_cuenta is 'Cuentas de monitoreo de ByKom (export Clientes cuenta). order_id = custentity_3k_id_bykom del establecimiento en NetSuite.';
create index if not exists cnt_bykom_cuenta_idcl_idx on cnt_bykom_cuenta (id_cl);

create table if not exists cnt_bykom_contacto (
  order_id        text primary key,           -- id interno del contacto en ByKom
  cuenta          text,                       -- id_cl de la cuenta (ultimo token de nombre_dos)
  nombre          text,
  nombre_dos      text,
  telefonos       text,                       -- texto original: '(0221) 5341935 / (0221) 5885556'
  email           text,
  modificado_en   timestamptz,                -- fechahora
  generico        boolean not null default false,  -- telefono repetido en 10 cuentas o mas
  titular         boolean not null default false,  -- comparte una palabra del nombre con la cuenta
  telefonos_norm  jsonb not null default '[]'::jsonb,  -- [{tipo, car, num, calidad}]
  datos           jsonb not null default '{}'::jsonb,
  carga_id        uuid references cnt_carga(id) on delete set null,
  vigente         boolean not null default true,
  primera_carga_en timestamptz not null default now(),
  no_vigente_desde timestamptz,
  actualizado_en  timestamptz not null default now()
);
comment on table cnt_bykom_contacto is 'Contactos de ByKom (export Clientes contactos): lista de llamadas de cada cuenta. La cuenta sale del ultimo token de nombre_dos (convencion de ByKom).';
create index if not exists cnt_bykom_contacto_cuenta_idx on cnt_bykom_contacto (cuenta);

create table if not exists cnt_evento (
  id              bigserial primary key,
  carga_id        uuid references cnt_carga(id) on delete cascade,
  tipo            text not null check (tipo in (
                    'cuenta_nueva', 'cuenta_eliminada', 'cuenta_deshabilitada', 'cuenta_habilitada',
                    'contacto_nuevo', 'contacto_eliminado', 'telefono_cambiado')),
  cuenta          text,                       -- id_cl
  order_id        text,                       -- cuenta o contacto
  detalle         jsonb not null default '{}'::jsonb,   -- antes / despues
  creado_en       timestamptz not null default now()
);
comment on table cnt_evento is 'Cambios detectados al comparar una carga de ByKom con la anterior. Sirve de aviso: una cuenta o un contacto eliminado no se borra de cnt_*, queda vigente = false.';
create index if not exists cnt_evento_carga_idx on cnt_evento (carga_id, tipo);

create table if not exists cnt_propuesta (
  ns_id           bigint not null,            -- registro de NetSuite (cliente o establecimiento)
  campo           text not null check (campo in ('celular', 'fijo', 'telefono2')),
  tipo_registro   text not null check (tipo_registro in ('cliente', 'establecimiento')),
  cliente_ns_id   bigint,
  entity_id       text,
  nombre          text,
  cuenta          text,                       -- id_cl de ByKom de donde sale el telefono
  actual_car      text,
  actual_num      text,
  propuesto_car   text,
  propuesto_num   text,
  accion          text not null check (accion in ('completar', 'igual', 'distinto', 'sin_dato', 'ya_no_en_bykom')),
  fuente_contacto text,                       -- order_id del contacto de ByKom
  fuente_nombre   text,
  es_titular      boolean,
  incluir         boolean not null default false,  -- va al CSV; por defecto solo 'completar'
  revisado_por    uuid,
  revisado_en     timestamptz,
  corrida_id      uuid references cli_corrida(id) on delete set null,
  generado_en     timestamptz not null default now(),
  primary key (ns_id, campo)
);
comment on table cnt_propuesta is 'Telefono propuesto por ByKom para cada registro de NetSuite y campo. incluir = va al CSV de actualizacion (por defecto solo accion completar; distinto se marca a mano despues de revisarlo).';
create index if not exists cnt_propuesta_accion_idx on cnt_propuesta (accion);
create index if not exists cnt_propuesta_cliente_idx on cnt_propuesta (cliente_ns_id);

-- RLS: ver -> leer; editar -> escribir
do $$
declare
  t text;
begin
  foreach t in array array['cnt_carga', 'cnt_bykom_cuenta', 'cnt_bykom_contacto', 'cnt_evento', 'cnt_propuesta'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using ((select auth.role()) = ''authenticated'' and (select fn_tiene_permiso(''clientes-contactos'', ''ver'')))', t, t);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using ((select fn_tiene_permiso(''clientes-contactos'', ''editar''))) with check ((select fn_tiene_permiso(''clientes-contactos'', ''editar'')))', t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;
grant usage, select on sequence cnt_evento_id_seq to authenticated;

-- La pestaña lee clientes y establecimientos para la comparacion.
drop policy if exists "cli_cliente: ver desde contactos" on cli_cliente;
create policy "cli_cliente: ver desde contactos" on cli_cliente
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-contactos', 'ver')));
drop policy if exists "cli_establecimiento: ver desde contactos" on cli_establecimiento;
create policy "cli_establecimiento: ver desde contactos" on cli_establecimiento
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-contactos', 'ver')));
drop policy if exists "cli_corrida: ver contactos" on cli_corrida;
create policy "cli_corrida: ver contactos" on cli_corrida
  for select using (informe = 'contactos' and (select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-contactos', 'ver')));

-- ---------------------------------------------------------------------
-- 5. Storage: respaldo de los archivos de ByKom
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('bykom-exports', 'bykom-exports', false)
on conflict (id) do nothing;

drop policy if exists "bykom-exports: ver" on storage.objects;
create policy "bykom-exports: ver" on storage.objects
  for select using (bucket_id = 'bykom-exports' and (select fn_tiene_permiso('clientes-contactos', 'ver')));
drop policy if exists "bykom-exports: subir" on storage.objects;
create policy "bykom-exports: subir" on storage.objects
  for insert with check (bucket_id = 'bykom-exports' and (select fn_tiene_permiso('clientes-contactos', 'editar')));

commit;

notify pgrst, 'reload schema';

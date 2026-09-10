-- =========================================================================
-- Migración 10 — Sección "Integración NetSuite ↔ GHL": modelo de datos
-- (Contacto / Oportunidad) para la prueba piloto de persistencia de
-- estado descripta en el Plan de Migración v1.1.
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
-- seed_secciones.sql queda actualizado con esta misma fila para
-- instalaciones nuevas.
--
-- Esto sólo da de alta la sección y las tablas: NO otorga acceso a nadie
-- todavía. Ver permisos_area_seccion_v6.sql para el alta de permisos.
--
-- Contexto (no se repite acá el detalle completo, ver el documento
-- técnico de la integración NetSuite-GHL y el Plan de Migración v1.1):
--   - contacto  ↔ Cliente Potencial de NetSuite / Contacto de GHL,
--     enlazados por ghl_contact_id (mismo campo que hoy usa NetSuite en
--     custentity_ghl_contact_id).
--   - oportunidad ↔ Oportunidad de NetSuite / Oportunidad de GHL, un
--     contacto puede tener varias.
--   - origen_detalle queda reservado (jsonb vacío) para una futura etapa
--     de atribución más fina (campaña, conversación inicial); no se
--     completa en esta primera versión.
--   - Las fechas de creación/actualización de cada lado (GHL y NS) se
--     guardan por separado a propósito: es justamente lo que hoy no se
--     está registrando en ningún lado (ver Plan de Migración v1.1).
--   - sync_estado/sync_mensaje dan la confirmación de estado por
--     registro que pidió el usuario para la prueba piloto; todavía no
--     hay ningún proceso que los actualice automáticamente (eso es el
--     paso siguiente: el endpoint que empuje contacto/oportunidad hacia
--     GHL).
-- =========================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('integracion-ghl-ns', 'Integración NetSuite ↔ GHL', 'mosaico')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- -------------------------------------------------------------------------
-- CONTACTO — mirror del Cliente Potencial de NetSuite / Contacto de GHL.
-- -------------------------------------------------------------------------
create table if not exists contacto (
  id                    uuid primary key default gen_random_uuid(),

  ghl_contact_id        text not null unique,
  ns_customer_id        text,

  nombre                text,
  apellido              text,
  email                 text,
  telefono              text,
  codigo_area           text,

  direccion_calle       text,
  direccion_numero      text,
  direccion_piso        text,
  provincia             text,
  localidad             text,
  cp                    text,

  interesado_en         text,
  forma_contacto        text,
  origen_lead           text,
  origen_detalle        jsonb not null default '{}'::jsonb,

  fecha_creacion_ghl        timestamptz,
  fecha_creacion_ns         timestamptz,
  fecha_actualizacion_ghl   timestamptz,
  fecha_actualizacion_ns    timestamptz,

  sync_estado           text not null default 'pendiente' check (sync_estado in ('pendiente', 'sincronizado', 'error')),
  sync_mensaje          text,
  sync_actualizado_en   timestamptz,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table contacto is 'Mirror del Cliente Potencial de NetSuite / Contacto de GHL para la sección Integración NetSuite ↔ GHL. Clave de enlace: ghl_contact_id (mismo valor que custentity_ghl_contact_id en NetSuite).';
comment on column contacto.origen_detalle is 'Reservado para una etapa futura (campaña, conversación inicial). Vacío por ahora.';
comment on column contacto.sync_estado is 'Confirmación de estado de la carga piloto hacia GHL. "pendiente" hasta que exista el endpoint de sincronización.';

-- -------------------------------------------------------------------------
-- OPORTUNIDAD — mirror de la Oportunidad de NetSuite / GHL. Un contacto
-- puede tener varias.
-- -------------------------------------------------------------------------
create table if not exists oportunidad (
  id                    uuid primary key default gen_random_uuid(),
  contacto_id           uuid not null references contacto(id) on delete cascade,

  ns_opportunity_id     text,
  ghl_opportunity_id    text,

  titulo                text,
  unidad_comercial      text,
  class_ns              int,
  estado                text not null default 'open' check (estado in ('open', 'won', 'lost')),
  monto                 numeric,
  pipeline_stage_id     text,

  estimate_id           text,
  tipo_proyecto         int,

  fecha_creacion_ns         timestamptz,
  fecha_creacion_ghl        timestamptz,
  fecha_actualizacion_ns    timestamptz,
  fecha_actualizacion_ghl   timestamptz,
  fecha_cierre              timestamptz,

  sync_estado           text not null default 'pendiente' check (sync_estado in ('pendiente', 'sincronizado', 'error')),
  sync_mensaje          text,
  sync_actualizado_en   timestamptz,

  creado_en             timestamptz not null default now(),
  actualizado_en        timestamptz not null default now()
);

comment on table oportunidad is 'Mirror de la Oportunidad de NetSuite / GHL para la sección Integración NetSuite ↔ GHL. Un contacto (contacto_id) puede tener varias.';
comment on column oportunidad.fecha_cierre is 'Fecha real del cierre (won/lost). Hoy no se registra en ningún lado del circuito NetSuite-GHL existente — ver Plan de Migración v1.1.';

-- touch de actualizado_en, mismo patrón que ficha_versiones (schema.sql).
create or replace function fn_touch_contacto()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_contacto on contacto;
create trigger trg_touch_contacto
  before update on contacto
  for each row execute function fn_touch_contacto();

create or replace function fn_touch_oportunidad()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_oportunidad on oportunidad;
create trigger trg_touch_oportunidad
  before update on oportunidad
  for each row execute function fn_touch_oportunidad();

-- -------------------------------------------------------------------------
-- ROW LEVEL SECURITY — mismo criterio que fichas/ficha_versiones:
-- ver requiere permiso 'ver' sobre 'integracion-ghl-ns', editar (incluye
-- insert/update/delete) requiere 'editar'. fn_tiene_permiso ya resuelve
-- superadmin y "editar implica ver".
-- -------------------------------------------------------------------------
alter table contacto enable row level security;
alter table oportunidad enable row level security;

create policy "contacto: ver con permiso de seccion" on contacto
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('integracion-ghl-ns', 'ver'));
create policy "contacto: editar con permiso de seccion" on contacto
  for all using (fn_tiene_permiso('integracion-ghl-ns', 'editar'));

create policy "oportunidad: ver con permiso de seccion" on oportunidad
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('integracion-ghl-ns', 'ver'));
create policy "oportunidad: editar con permiso de seccion" on oportunidad
  for all using (fn_tiene_permiso('integracion-ghl-ns', 'editar'));

commit;

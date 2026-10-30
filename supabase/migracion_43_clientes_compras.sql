-- =====================================================================
-- migracion_43_clientes_compras.sql
-- Clientes activos: compras de cada cliente (30 de octubre de 2026)
-- ---------------------------------------------------------------------
-- cli_compra   una fila por orden de venta de productos (tipo 1) desde
--              2022, asignada al cliente principal. La carga la
--              actualizacion de Segmentacion (clientes-api, app/compras.py).
--              Las OV en comodato cuentan como compra, marcadas.
--
-- v_cli_cliente  se recrea con: cantidad de compras, compras en comodato,
--                fecha y unidad de la ultima compra y monto total.
--
-- Permisos: los mismos que cli_cliente (clientes-segmentacion).
-- Requiere la migracion_42. Segura de correr mas de una vez.
-- =====================================================================

begin;

create table if not exists cli_compra (
  ov_id                    bigint primary key,       -- ID interno de la OV en NetSuite
  numero                   text,                     -- numero de la OV
  fecha                    date,
  cliente_ns_id            bigint not null references cli_cliente(ns_id) on delete cascade,
  entidad_ns_id            bigint,                   -- cliente de la OV (establecimiento o cliente principal)
  establecimiento_ns_id    bigint,                   -- si la OV es de un establecimiento
  unidad_negocio           text,                     -- clase de la OV (ej. "Alarmas : Comunicaciones")
  unidad_comercial         text,                     -- Hogar / Comercio / Obra ... (OV, presupuesto u oportunidad)
  unidad_comercial_origen  text check (unidad_comercial_origen in ('ov', 'presupuesto', 'oportunidad')),
  es_comodato              boolean not null default false,
  total                    numeric,                  -- monto total de la OV (con impuestos)
  estado                   text,
  oportunidad_id           bigint,
  presupuesto_id           bigint,
  datos                    jsonb not null default '{}'::jsonb,
  vigente                  boolean not null default true,
  corrida_id               uuid references cli_corrida(id) on delete set null,
  actualizado_en           timestamptz not null default now()
);

comment on table cli_compra is 'Compras de cada cliente: OV de productos (tipo 1) desde 2022. Comodato cuenta como compra (es_comodato). Unidad comercial de la OV, si no del presupuesto, si no de la oportunidad.';

create index if not exists cli_compra_cliente_idx on cli_compra (cliente_ns_id, fecha desc);
create index if not exists cli_compra_fecha_idx on cli_compra (fecha);

alter table cli_compra enable row level security;
drop policy if exists "cli_compra: ver" on cli_compra;
create policy "cli_compra: ver" on cli_compra
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('clientes-segmentacion', 'ver')));
drop policy if exists "cli_compra: escribir" on cli_compra;
create policy "cli_compra: escribir" on cli_compra
  for all using ((select fn_tiene_permiso('clientes-segmentacion', 'editar')))
  with check ((select fn_tiene_permiso('clientes-segmentacion', 'editar')));
grant select, insert, update, delete on cli_compra to authenticated;

-- Vista de clientes con compras (se recrea: cambian sus columnas)
drop view if exists v_cli_cliente;
create view v_cli_cliente with (security_invoker = true) as
select
  c.*,
  coalesce(e.establecimientos, 0)          as establecimientos,
  coalesce(e.establecimientos_activos, 0)  as establecimientos_activos,
  coalesce(e.establecimientos, 0) - coalesce(e.establecimientos_activos, 0) as establecimientos_inactivos,
  e.cuentas,
  e.estados,
  coalesce(k.compras, 0)                   as compras,
  coalesce(k.compras_comodato, 0)          as compras_comodato,
  k.ultima_compra,
  u.unidad_negocio                         as ultima_unidad_negocio,
  u.unidad_comercial                       as ultima_unidad_comercial,
  u.es_comodato                            as ultima_es_comodato,
  k.monto_total,
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
left join lateral (
  select
    count(*)                                  as compras,
    count(*) filter (where cp.es_comodato)    as compras_comodato,
    max(cp.fecha)                             as ultima_compra,
    sum(cp.total)                             as monto_total
  from cli_compra cp
  where cp.cliente_ns_id = c.ns_id and cp.vigente
) k on true
left join lateral (
  select cp.unidad_negocio, cp.unidad_comercial, cp.es_comodato
  from cli_compra cp
  where cp.cliente_ns_id = c.ns_id and cp.vigente
  order by cp.fecha desc, cp.ov_id desc
  limit 1
) u on true
left join contacto ct on ct.ghl_contact_id = c.ghl_contact_id;

comment on view v_cli_cliente is 'Clientes con establecimientos activos/inactivos, compras (OV de productos desde 2022) y contacto de la integracion GHL (contacto.id).';

grant select on v_cli_cliente to authenticated;

commit;

notify pgrst, 'reload schema';

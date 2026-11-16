-- =====================================================================
-- migracion_48_ns_articulos_transacciones.sql
-- Articulos, lista de precios, presupuestos y OV de productos de NetSuite
-- (13 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- Base para el analisis de ticket promedio y composicion de ventas del
-- Informe MKT, y reutilizable por otros informes (desglose por articulo,
-- presupuestado vs. vendido, comisiones). Tablas genericas "ns_", no del
-- informe.
--
--   ns_sincronizacion         cada actualizacion de articulos (manual, boton
--                             aparte del Informe MKT): rango, estado, conteos
--   ns_articulo               catalogo completo de NetSuite (item) con el
--                             precio base en pesos (pricing: nivel 1,
--                             moneda 1) y el articulo de venta equivalente de
--                             los de comodato (CC-XXX -> XXX)
--   ns_articulo_precio        historial del precio base: una fila cada vez
--                             que el precio cambia (vigente_desde = dia de la
--                             actualizacion en que se detecto el cambio)
--   ns_familia_articulo       familias de producto de MKT, con los prefijos
--                             de codigo que caen en cada una (editable)
--   ns_articulo_familia       asignacion manual articulo -> familia (manda
--                             sobre el prefijo); la actualizacion no la toca
--   ns_transaccion            encabezados de presupuestos (Estimate) y OV de
--                             productos (SalesOrd de tipo PRODUCTOS o PRODUCTOS
--                             y ABONOS) de S.P. SEGURIDAD PRIVADA S.A. Las OV
--                             mensuales de ABONOS (Contrato) no se guardan
--                             (~9.600 por mes, toda la cartera)
--   ns_transaccion_linea      lineas de articulo de esas transacciones, con el
--                             signo corregido (los descuentos restan) y la
--                             categoria Equipo / Servicio / Descuento / ABO
--   ns_articulo_clasificado   vista: articulo + familia resuelta + precio de
--                             referencia (propio o del equivalente de venta)
--
-- Permisos: ver = 'ver' en informes-mkt; escribir = 'editar' en informes-mkt.
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Tablas
-- ---------------------------------------------------------------------
create table if not exists ns_sincronizacion (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null default 'articulos',
  desde           date,
  hasta           date,
  estado          text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  paso            text,
  mensaje         text,
  detalle         jsonb,
  solicitado_por  text,
  iniciada_en     timestamptz not null default now(),
  finalizada_en   timestamptz
);
-- Una sola actualizacion en curso por tipo.
create unique index if not exists ns_sincronizacion_en_curso_idx
  on ns_sincronizacion (tipo) where estado = 'en_curso';
create index if not exists ns_sincronizacion_iniciada_idx on ns_sincronizacion (iniciada_en desc);

create table if not exists ns_articulo (
  id                bigint primary key,           -- ID interno de NetSuite
  codigo            text,                         -- primera palabra del nombre: 'CEN019', 'CC-CEN020'
  nombre            text,                         -- itemid completo
  tipo              text,                         -- InvtPart, Service, Kit, Discount, ...
  activo            boolean,
  es_comodato       boolean,                      -- custitem_3k_item_de_comodato
  habilitado_venta  boolean,                      -- custitem_3k_habilitado_para_venta
  clase             text,
  equivalente_id    bigint,                       -- articulo de venta XXX de un CC-XXX
  precio_lista      numeric,                      -- precio base (nivel 1) en pesos; null si no tiene
  sincronizacion_id uuid references ns_sincronizacion(id) on delete set null,
  actualizado_en    timestamptz not null default now()
);
create index if not exists ns_articulo_codigo_idx on ns_articulo (codigo);

create table if not exists ns_articulo_precio (
  articulo_id     bigint not null references ns_articulo(id) on delete cascade,
  vigente_desde   date not null,
  precio          numeric,                        -- null = dejo de tener precio
  sincronizacion_id uuid references ns_sincronizacion(id) on delete set null,
  primary key (articulo_id, vigente_desde)
);

create table if not exists ns_familia_articulo (
  id        serial primary key,
  nombre    text not null unique,
  prefijos  text[] not null default '{}',         -- codigos sin 'CC-': 'CEN', 'KIT-CAM'
  orden     int not null default 100,
  activa    boolean not null default true
);

create table if not exists ns_articulo_familia (
  articulo_id     bigint primary key references ns_articulo(id) on delete cascade,
  familia_id      int not null references ns_familia_articulo(id) on delete cascade,
  actualizado_por text,
  actualizado_en  timestamptz not null default now()
);

create table if not exists ns_transaccion (
  id                    bigint primary key,       -- ID interno de NetSuite
  tipo                  text not null check (tipo in ('Estimate', 'SalesOrd')),
  numero                text,
  fecha                 date not null,
  estado                text,
  tipo_ov               text,                     -- solo OV
  comodato              boolean,
  oportunidad_id        bigint,
  presupuesto_origen_id bigint,                   -- OV: custbody_3k_trans_orig_ov
  cliente_id            bigint,
  cliente               text,
  id_cliente_crm        text,
  representante         text,
  total                 numeric,
  modificado_en         timestamptz,              -- lastmodifieddate de NetSuite
  sincronizacion_id     uuid references ns_sincronizacion(id) on delete set null,
  actualizado_en        timestamptz not null default now()
);
create index if not exists ns_transaccion_fecha_idx on ns_transaccion (tipo, fecha);
create index if not exists ns_transaccion_oportunidad_idx on ns_transaccion (oportunidad_id);
create index if not exists ns_transaccion_presupuesto_idx on ns_transaccion (presupuesto_origen_id);
create index if not exists ns_transaccion_crm_idx on ns_transaccion (id_cliente_crm);

create table if not exists ns_transaccion_linea (
  transaccion_id  bigint not null references ns_transaccion(id) on delete cascade,
  linea_id        bigint not null,
  articulo_id     bigint,                         -- sin FK: el catalogo puede actualizarse despues
  articulo        text,                           -- nombre en la linea (BUILTIN.DF)
  tipo_articulo   text,
  categoria       text not null check (categoria in ('Equipo', 'Servicio', 'Descuento', 'ABO')),
  cantidad        numeric,
  precio          numeric,
  importe         numeric,                        -- sin IVA; descuentos en negativo
  primary key (transaccion_id, linea_id)
);
create index if not exists ns_transaccion_linea_articulo_idx on ns_transaccion_linea (articulo_id);

-- ---------------------------------------------------------------------
-- 2. Familias iniciales (MKT las ajusta desde el panel)
-- ---------------------------------------------------------------------
insert into ns_familia_articulo (nombre, prefijos, orden) values
  ('Centrales',               array['CEN'], 10),
  ('Detectores infrarrojos',  array['INF'], 20),
  ('Magnéticos',              array['MAG', 'MAP'], 30),
  ('Sirenas',                 array['SIR'], 40),
  ('Teclados y controles',    array['TEC', 'CRE', 'PAN'], 50),
  ('Comunicadores',           array['COM'], 60),
  ('Cámaras y video',         array['CAM', 'KIT-CAM', 'DVR', 'NVR'], 70),
  ('Energía',                 array['BAT', 'FUE'], 80),
  ('Cableado y accesorios',   array['CAB', 'VAR', 'POS'], 90),
  ('Otros',                   array[]::text[], 999)
on conflict (nombre) do nothing;

-- ---------------------------------------------------------------------
-- 3. Vista: articulo con familia y precio de referencia
-- ---------------------------------------------------------------------
create or replace view ns_articulo_clasificado
with (security_invoker = true) as
select
  a.*,
  regexp_replace(coalesce(a.codigo, ''), '^CC-', '') as codigo_base,
  coalesce(fm.id, fp.id)                             as familia_id,
  coalesce(fm.nombre, fp.nombre)                     as familia,
  case when fm.id is not null then 'manual'
       when fp.id is not null then 'prefijo' end     as familia_origen,
  coalesce(a.precio_lista, e.precio_lista)           as precio_referencia,
  case when a.precio_lista is not null then 'propio'
       when e.precio_lista is not null then 'equivalente' end as precio_origen
from ns_articulo a
left join ns_articulo e on e.id = a.equivalente_id
left join ns_articulo_familia af on af.articulo_id = a.id
left join ns_familia_articulo fm on fm.id = af.familia_id
left join lateral (
  select f.id, f.nombre
  from ns_familia_articulo f, unnest(f.prefijos) p
  where f.activa
    and regexp_replace(coalesce(a.codigo, ''), '^CC-', '') like p || '%'
  order by length(p) desc
  limit 1
) fp on true;

-- ---------------------------------------------------------------------
-- 4. RLS y permisos
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ns_sincronizacion','ns_articulo','ns_articulo_precio','ns_familia_articulo',
                           'ns_articulo_familia','ns_transaccion','ns_transaccion_linea']
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s: ver con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: ver con permiso de seccion" on %I for select using (auth.role() = ''authenticated'' and fn_tiene_permiso(''informes-mkt'', ''ver''))', t, t);

    execute format('drop policy if exists "%s: crear con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: crear con permiso de seccion" on %I for insert with check (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('drop policy if exists "%s: actualizar con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: actualizar con permiso de seccion" on %I for update using (fn_tiene_permiso(''informes-mkt'', ''editar'')) with check (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('drop policy if exists "%s: borrar con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: borrar con permiso de seccion" on %I for delete using (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

grant usage, select on sequence ns_familia_articulo_id_seq to authenticated;
grant select on ns_articulo_clasificado to authenticated;

commit;

notify pgrst, 'reload schema';

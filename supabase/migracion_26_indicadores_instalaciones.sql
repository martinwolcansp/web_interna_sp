-- =====================================================================
-- migracion_26_indicadores_instalaciones.sql
-- Indicadores por Área: segunda área, Instalaciones, y tablas comunes.
--
-- Los casos de instalación (búsqueda 2560) los usan Posventa e
-- Instalaciones, y los van a usar Ampliaciones, Depósito, etc. Pasan a
-- ser una tabla común:
--
--   ind_caso_instalacion   (antes ind_posventa_caso) casos de instalación
--   ind_caso_ov            OV de productos de cada caso (búsqueda 2439)
--   ind_caso_ov_linea      artículos de esas OV (búsqueda 2833)
--
-- Qué informe usa qué tabla queda registrado en ind_tabla_area. Las
-- políticas RLS de las tablas comunes leen esa lista: puede ver la tabla
-- quien tenga "ver" en alguna de las áreas que la usan, y escribirla quien
-- tenga "editar" en alguna. Para que un área nueva use una tabla común
-- alcanza con insertar la fila (tabla, área); no hay que tocar políticas.
--
-- Cada área sigue actualizando por su cuenta (botón de su página): el
-- servicio sólo reescribe las filas de su alcance, sin pisar al resto.
--
-- ORDEN DE DESPLIEGUE: esta migración renombra ind_posventa_caso. Correrla
-- y enseguida desplegar indicadores-api y las páginas (posventa.html ya
-- lee ind_caso_instalacion). Entre una cosa y la otra, la página de
-- Posventa no carga los casos.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Sección de permisos de Instalaciones
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('indicadores-instalaciones', 'Indicadores - Instalaciones', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Qué áreas usan cada tabla común
-- ---------------------------------------------------------------------
create table if not exists ind_tabla_area (
  tabla  text not null,
  area   text not null,           -- sufijo de la sección indicadores-<area>
  primary key (tabla, area)
);

comment on table ind_tabla_area is
  'Tablas comunes de Indicadores por Área y las áreas que las usan. Las políticas RLS de esas tablas dan acceso según esta lista.';

alter table ind_tabla_area enable row level security;
drop policy if exists "ind_tabla_area: ver" on ind_tabla_area;
create policy "ind_tabla_area: ver" on ind_tabla_area
  for select using (auth.role() = 'authenticated');
grant select on ind_tabla_area to authenticated;

insert into ind_tabla_area (tabla, area) values
  ('ind_caso_instalacion', 'posventa'),
  ('ind_caso_instalacion', 'instalaciones'),
  ('ind_caso_ov',          'instalaciones'),
  ('ind_caso_ov_linea',    'instalaciones')
on conflict do nothing;

-- true si el usuario tiene el nivel pedido en alguna de las áreas que usan la tabla.
create or replace function fn_puede_tabla_indicadores(p_tabla text, p_nivel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from ind_tabla_area ta
    where ta.tabla = p_tabla
      and fn_tiene_permiso('indicadores-' || ta.area, p_nivel)
  );
$$;

grant execute on function fn_puede_tabla_indicadores(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. Casos de instalación: ind_posventa_caso -> ind_caso_instalacion
-- ---------------------------------------------------------------------
do $$
begin
  if to_regclass('public.ind_posventa_caso') is not null
     and to_regclass('public.ind_caso_instalacion') is null then
    alter table ind_posventa_caso rename to ind_caso_instalacion;
    alter index if exists ind_posventa_caso_pkey   rename to ind_caso_instalacion_pkey;
    alter index if exists ind_posventa_caso_numero rename to ind_caso_instalacion_numero;
    alter index if exists ind_posventa_caso_fin    rename to ind_caso_instalacion_fin;
  end if;
end $$;

create table if not exists ind_caso_instalacion (
  caso_id                 bigint primary key,
  numero                  text,
  id_inst                 text,
  fecha_creacion          date,
  fecha_inicio_inst       date,
  fecha_fin_inst          date,
  fecha_cerrada           date,
  cliente_id              bigint,
  cliente                 text,
  nro_cuenta              text,
  tecnico                 text,
  tipo_proyecto           text,
  estado_caso             text,
  estado_instalacion      text,
  tipo_posventa           text,
  asignado_a              text,
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now()
);

alter table ind_caso_instalacion
  add column if not exists dias_reales_trabajo numeric;

comment on table ind_caso_instalacion is
  'Casos de instalación de NetSuite (búsqueda 2560). Tabla común: ver ind_tabla_area.';
comment on column ind_caso_instalacion.id_inst is
  'Agrupa los casos de una misma instalación: fecha inicio + fecha fin + cliente; si todavía no se inició, fecha de creación + cliente.';
comment on column ind_caso_instalacion.dias_reales_trabajo is
  'custevent_ap_sp_dias_reales_trabajo: días de mano de obra reales del caso.';

create index if not exists ind_caso_instalacion_numero on ind_caso_instalacion (numero);
create index if not exists ind_caso_instalacion_fin    on ind_caso_instalacion (fecha_fin_inst);

-- ---------------------------------------------------------------------
-- 4. OV de productos de cada caso (búsqueda 2439)
-- ---------------------------------------------------------------------
create table if not exists ind_caso_ov (
  caso_id                 bigint not null,
  ov_id                   bigint not null,             -- id interno de la orden de venta
  ov_numero               text,                        -- OV_SPxxxxxx
  fecha_ov                date,
  estado_ov               text,
  oportunidad             text,
  monto                   numeric,                     -- total de la OV (fxamount)
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now(),
  primary key (caso_id, ov_id)
);

comment on table ind_caso_ov is
  'Órdenes de venta de productos (tipo 1) vinculadas a cada caso de instalación. Tabla común: ver ind_tabla_area.';

-- ---------------------------------------------------------------------
-- 5. Artículos de esas OV (búsqueda 2833)
-- ---------------------------------------------------------------------
create table if not exists ind_caso_ov_linea (
  caso_id                 bigint not null,
  ov_id                   bigint not null,
  linea_id                integer not null,            -- id de la línea dentro de la OV
  item_id                 bigint,
  articulo                text,
  item_tipo               text,                        -- InvtPart, Kit, Service, TaxItem, Discount...
  cantidad                numeric,                     -- con la regla de la búsqueda: MO "1/2" cuenta media jornada
  categoria               text,                        -- reglas de PatronesCategorias del Power BI
  subcategoria            text,
  es_mo                   boolean not null default false,  -- mano de obra (artículo que empieza con MO)
  es_elemento             boolean not null default false,  -- cuenta como elemento instalado
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now(),
  primary key (caso_id, ov_id, linea_id)
);

comment on table ind_caso_ov_linea is
  'Líneas de artículos de las OV de productos de cada caso de instalación. Tabla común: ver ind_tabla_area.';
comment on column ind_caso_ov_linea.es_elemento is
  'false para IVA, descuentos, subtotales, mano de obra, cable (se vende por metro) y las categorías Servicios, Administrativo e Interno.';

create index if not exists ind_caso_ov_linea_caso on ind_caso_ov_linea (caso_id);

-- ---------------------------------------------------------------------
-- 6. RLS de las tablas comunes (según ind_tabla_area)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ind_caso_instalacion', 'ind_caso_ov', 'ind_caso_ov_linea'] loop
    execute format('alter table %I enable row level security', t);
    -- políticas viejas (las de ind_posventa_caso viajan con el renombre)
    execute format('drop policy if exists "ind_posventa_caso: ver" on %I', t);
    execute format('drop policy if exists "ind_posventa_caso: escribir" on %I', t);
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using (auth.role() = ''authenticated'' and fn_puede_tabla_indicadores(%L, ''ver''))', t, t, t);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using (fn_puede_tabla_indicadores(%L, ''editar'')) with check (fn_puede_tabla_indicadores(%L, ''editar''))', t, t, t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- migracion_29_comisiones_unidades.sql
-- Comisiones por vendedor: unidades de comisión (19/10/2026).
--
-- Requiere migracion_28_comisiones.sql.
--
-- 1. comision_unidad: agrupa abonos. Tiene un "Incluido desde" = N, igual
--    para todos los vendedores. Por vendedor y por mes se cuentan las
--    ventas de la unidad (OV con al menos un abono de la unidad); desde la
--    N-ésima comisionan: comisionan = ventas - N + 1 (mínimo 0).
--    Comisión de la unidad = base comisionable de la unidad × comisionan /
--    ventas (el promedio por venta × las ventas que comisionan).
-- 2. comision_abono.unidad_id: un abono está incluido si tiene unidad. La
--    columna "incluido" se mantiene sincronizada por trigger; la columna
--    "incluido_desde" del abono deja de usarse (manda la de la unidad).
-- 3. Pasaje: cada abono incluido sin unidad pasa a una unidad propia con su
--    mismo "Incluido desde" (el cálculo queda igual salvo que se paga el
--    promedio por venta). Después se pueden agrupar desde el Panel.
-- 4. Liquidaciones: guardan también las unidades usadas y el detalle por
--    unidad (vendedor.por_unidad, línea.unidad / factor).
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Unidades de comisión
-- ---------------------------------------------------------------------
create table if not exists comision_unidad (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  incluido_desde   integer not null default 1 check (incluido_desde >= 1),
  descripcion      text,
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index if not exists comision_unidad_nombre_uidx on comision_unidad (lower(nombre));
comment on table comision_unidad is 'Unidad de comisión: agrupa abonos. Por vendedor y por mes comisionan las ventas (OV con algún abono de la unidad) desde la N-ésima; se paga el promedio de la base por venta.';

alter table comision_unidad enable row level security;
drop policy if exists "comision_unidad: ver" on comision_unidad;
create policy "comision_unidad: ver" on comision_unidad for select
  using (auth.role() = 'authenticated'
         and (fn_tiene_permiso('comisiones', 'ver') or fn_tiene_permiso('informes-mkt', 'ver')));
drop policy if exists "comision_unidad: crear" on comision_unidad;
create policy "comision_unidad: crear" on comision_unidad for insert
  with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_unidad: actualizar" on comision_unidad;
create policy "comision_unidad: actualizar" on comision_unidad for update
  using (fn_tiene_permiso('comisiones', 'editar')) with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_unidad: borrar" on comision_unidad;
create policy "comision_unidad: borrar" on comision_unidad for delete
  using (fn_tiene_permiso('comisiones', 'editar'));
grant select, insert, update, delete on comision_unidad to authenticated;

-- ---------------------------------------------------------------------
-- 2. Abono -> unidad
-- ---------------------------------------------------------------------
alter table comision_abono
  add column if not exists unidad_id uuid references comision_unidad(id) on delete set null;
create index if not exists comision_abono_unidad_idx on comision_abono (unidad_id);
comment on column comision_abono.unidad_id is 'Unidad de comisión del abono. Sin unidad = no incluido.';
comment on column comision_abono.incluido is 'Sincronizada por trigger: true si el abono tiene unidad de comisión.';
comment on column comision_abono.incluido_desde is 'Sin uso desde la migración 29: manda el incluido_desde de la unidad.';

-- ---------------------------------------------------------------------
-- 3. Pasaje: una unidad por cada abono incluido sin unidad
--    (antes del trigger, para no perder el "incluido" actual)
-- ---------------------------------------------------------------------
insert into comision_unidad (nombre, incluido_desde, descripcion, actualizado_por)
select a.nombre, a.incluido_desde, 'Creada al pasar a unidades (migración 29) desde ' || a.codigo, 'migracion_29'
from comision_abono a
where a.incluido and a.unidad_id is null
  and not exists (select 1 from comision_unidad u where lower(u.nombre) = lower(a.nombre));

update comision_abono a
   set unidad_id = u.id
  from comision_unidad u
 where a.incluido and a.unidad_id is null and lower(u.nombre) = lower(a.nombre);

create or replace function fn_comision_abono_incluido()
returns trigger
language plpgsql
as $$
begin
  new.incluido := new.unidad_id is not null;
  return new;
end;
$$;
drop trigger if exists trg_comision_abono_incluido on comision_abono;
create trigger trg_comision_abono_incluido
  before insert or update on comision_abono
  for each row execute function fn_comision_abono_incluido();

-- ---------------------------------------------------------------------
-- 4. Liquidaciones: detalle por unidad
-- ---------------------------------------------------------------------
alter table comision_liquidacion
  add column if not exists unidades jsonb not null default '[]'::jsonb;  -- unidades vigentes al generar
alter table comision_liquidacion_vendedor
  add column if not exists por_unidad jsonb not null default '[]'::jsonb; -- [{unidad, ventas, incluido_desde, comisionan, base, promedio, comision}]
alter table comision_liquidacion_linea
  add column if not exists unidad text,
  add column if not exists factor numeric(9,6);                            -- comisionan / ventas de la unidad

create or replace function fn_comision_guardar_liquidacion(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id  uuid;
  v_mes date := (p->>'mes')::date;
begin
  if not fn_tiene_permiso('comisiones', 'editar') then
    raise exception 'Sin permiso para generar liquidaciones (editar en Comisiones).';
  end if;
  if exists (select 1 from comision_liquidacion where mes = v_mes) then
    raise exception 'Ya existe la liquidación de %. Eliminala para volver a generarla.', to_char(v_mes, 'MM/YYYY');
  end if;

  insert into comision_liquidacion (mes, desde, hasta, generada_por, config, unidades, totales, sin_ov, avisos)
  values (v_mes, (p->>'desde')::date, (p->>'hasta')::date, p->>'generada_por',
          coalesce(p->'config', '[]'::jsonb), coalesce(p->'unidades', '[]'::jsonb), coalesce(p->'totales', '{}'::jsonb),
          coalesce(p->'sin_ov', '[]'::jsonb), coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_id;

  insert into comision_liquidacion_vendedor
    (liquidacion_id, vendedor, ganadas, ovs, ovs_comisionables, base_comisionable, comision, por_abono, por_unidad)
  select v_id, x->>'vendedor', coalesce((x->>'ganadas')::int, 0), coalesce((x->>'ovs')::int, 0),
         coalesce((x->>'ovs_comisionables')::int, 0), coalesce((x->>'base_comisionable')::numeric, 0),
         coalesce((x->>'comision')::numeric, 0), coalesce(x->'por_abono', '[]'::jsonb), coalesce(x->'por_unidad', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p->'vendedores', '[]'::jsonb)) x;

  insert into comision_liquidacion_linea
    (liquidacion_id, vendedor, ov_id, ov_numero, fecha_ov, modalidad, oportunidad, fecha_oportunidad,
     cliente, nro_cliente, codigo, articulo, cantidad, importe, incluido, orden, incluido_desde, comisiona, comision,
     unidad, factor)
  select v_id, x->>'vendedor', (x->>'ov_id')::bigint, x->>'ov_numero', (x->>'fecha_ov')::date, x->>'modalidad',
         x->>'oportunidad', (x->>'fecha_oportunidad')::date, x->>'cliente', x->>'nro_cliente',
         x->>'codigo', x->>'articulo', (x->>'cantidad')::numeric, (x->>'importe')::numeric,
         coalesce((x->>'incluido')::boolean, false), (x->>'orden')::int, (x->>'incluido_desde')::int,
         coalesce((x->>'comisiona')::boolean, false), coalesce((x->>'comision')::numeric, 0),
         x->>'unidad', (x->>'factor')::numeric
  from jsonb_array_elements(coalesce(p->'lineas', '[]'::jsonb)) x;

  return v_id;
end;
$$;
grant execute on function fn_comision_guardar_liquidacion(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

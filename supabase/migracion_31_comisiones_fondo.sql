-- =====================================================================
-- migracion_31_comisiones_fondo.sql
-- Comisiones: fondo comisionable por unidad y reparto por porcentaje (19/10/2026).
--
-- Requiere las migraciones 28, 29 y 30.
--
-- Modelo nuevo (definido por Martín el 19/10/2026), por unidad de comisión
-- y por mes:
--   ventas      = OV con algún abono de la unidad, de TODOS los vendedores
--                 (incluidas las "Sin asignar").
--   comisionan  = ventas - N + 1 (mínimo 0), N = "Incluido desde" de la unidad.
--   fondo        = base comisionable de la unidad × comisionan / ventas.
--   El fondo comisionable se reparte entre los vendedores según su porcentaje en esa
--   unidad (comision_porcentaje), sin importar quién vendió. Las ventas
--   "Sin asignar" suman al fondo pero no reciben porcentaje. Si los
--   porcentajes no suman 100 %, lo que falta queda sin repartir (aviso).
--
-- 1. comision_porcentaje: porcentaje de cada vendedor en cada unidad.
--    vendedor = nombre del representante de ventas, igual que en NetSuite.
-- 2. Liquidaciones: columnas del modelo nuevo (modelo, fondos, porcentajes,
--    vendedor.aporte, línea.aporte) y nueva versión de la función de guardado.
--    Las liquidaciones ya generadas quedan marcadas modelo = 'vendedor'.
--
-- La limpieza de lo que deja de usarse está en la migración 32.
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Porcentaje por vendedor y unidad
-- ---------------------------------------------------------------------
create table if not exists comision_porcentaje (
  id               uuid primary key default gen_random_uuid(),
  unidad_id        uuid not null references comision_unidad(id) on delete cascade,
  vendedor         text not null check (btrim(vendedor) <> ''),
  porcentaje       numeric(6,3) not null check (porcentaje > 0 and porcentaje <= 100),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
create unique index if not exists comision_porcentaje_uidx on comision_porcentaje (unidad_id, lower(btrim(vendedor)));
comment on table comision_porcentaje is 'Porcentaje del fondo comisionable de cada unidad de comisión que recibe cada vendedor (nombre del representante de ventas de NetSuite).';

alter table comision_porcentaje enable row level security;
drop policy if exists "comision_porcentaje: ver" on comision_porcentaje;
create policy "comision_porcentaje: ver" on comision_porcentaje for select
  using (auth.role() = 'authenticated'
         and (fn_tiene_permiso('comisiones', 'ver') or fn_tiene_permiso('informes-mkt', 'ver')));
drop policy if exists "comision_porcentaje: crear" on comision_porcentaje;
create policy "comision_porcentaje: crear" on comision_porcentaje for insert
  with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_porcentaje: actualizar" on comision_porcentaje;
create policy "comision_porcentaje: actualizar" on comision_porcentaje for update
  using (fn_tiene_permiso('comisiones', 'editar')) with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_porcentaje: borrar" on comision_porcentaje;
create policy "comision_porcentaje: borrar" on comision_porcentaje for delete
  using (fn_tiene_permiso('comisiones', 'editar'));
grant select, insert, update, delete on comision_porcentaje to authenticated;

-- ---------------------------------------------------------------------
-- 2. Liquidaciones del modelo nuevo
-- ---------------------------------------------------------------------
alter table comision_liquidacion
  add column if not exists modelo text not null default 'vendedor',          -- 'vendedor' (anterior) | 'fondo'
  add column if not exists fondos jsonb not null default '[]'::jsonb,         -- [{unidad, ventas, incluido_desde, comisionan, factor, base, promedio, fondo, porcentaje_total, repartido, sin_repartir, ventas_sin_asignar, base_sin_asignar, vendedores_sin_porcentaje}]
  add column if not exists porcentajes jsonb not null default '[]'::jsonb;   -- [{unidad, vendedor, porcentaje}] vigentes al generar
alter table comision_liquidacion_vendedor
  add column if not exists aporte numeric(14,2) not null default 0;          -- lo que sus ventas aportaron a los fondos (informativo)
comment on column comision_liquidacion_vendedor.por_unidad is
  'Modelo fondo: [{unidad, comisiona, ventas, base, aporte, porcentaje, comision}].';
alter table comision_liquidacion_linea
  add column if not exists aporte numeric(14,2) not null default 0;          -- importe × factor de la unidad

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

  insert into comision_liquidacion (mes, desde, hasta, generada_por, modelo, config, unidades, fondos, porcentajes,
                                    totales, sin_ov, avisos)
  values (v_mes, (p->>'desde')::date, (p->>'hasta')::date, p->>'generada_por', 'fondo',
          coalesce(p->'config', '[]'::jsonb), coalesce(p->'unidades', '[]'::jsonb),
          coalesce(p->'fondos', '[]'::jsonb), coalesce(p->'porcentajes', '[]'::jsonb),
          coalesce(p->'totales', '{}'::jsonb), coalesce(p->'sin_ov', '[]'::jsonb), coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_id;

  insert into comision_liquidacion_vendedor
    (liquidacion_id, vendedor, ganadas, ovs, ovs_comisionables, base_comisionable, aporte, comision, por_unidad)
  select v_id, x->>'vendedor', coalesce((x->>'ganadas')::int, 0), coalesce((x->>'ovs')::int, 0),
         coalesce((x->>'ovs_comisionables')::int, 0), coalesce((x->>'base_comisionable')::numeric, 0),
         coalesce((x->>'aporte')::numeric, 0), coalesce((x->>'comision')::numeric, 0),
         coalesce(x->'por_unidad', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p->'vendedores', '[]'::jsonb)) x;

  insert into comision_liquidacion_linea
    (liquidacion_id, vendedor, ov_id, ov_numero, fecha_ov, modalidad, oportunidad, fecha_oportunidad,
     cliente, nro_cliente, codigo, articulo, cantidad, importe, incluido, unidad, factor, aporte)
  select v_id, x->>'vendedor', (x->>'ov_id')::bigint, x->>'ov_numero', (x->>'fecha_ov')::date, x->>'modalidad',
         x->>'oportunidad', (x->>'fecha_oportunidad')::date, x->>'cliente', x->>'nro_cliente',
         x->>'codigo', x->>'articulo', (x->>'cantidad')::numeric, (x->>'importe')::numeric,
         coalesce((x->>'incluido')::boolean, false), x->>'unidad', (x->>'factor')::numeric,
         coalesce((x->>'aporte')::numeric, 0)
  from jsonb_array_elements(coalesce(p->'lineas', '[]'::jsonb)) x;

  return v_id;
end;
$$;
grant execute on function fn_comision_guardar_liquidacion(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificación:
-- select mes, modelo from comision_liquidacion order by mes;

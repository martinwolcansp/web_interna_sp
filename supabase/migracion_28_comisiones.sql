-- =====================================================================
-- migracion_28_comisiones.sql
-- Comisiones por vendedor: configuración de abonos y liquidaciones
-- mensuales (14/10/2026).
--
-- 1. Sección "comisiones" (permisos por área, como las demás).
--    - ver:    Panel de administración → Comisiones (abonos y liquidaciones).
--    - editar: modificar abonos, generar y eliminar liquidaciones.
--    El pop up "Comisiones por vendedor" del Informe de MKT lee la tabla de
--    abonos con permiso "ver" en informes-mkt o en comisiones.
-- 2. comision_abono: un registro por abono (código ABO-xx, o el nombre si
--    el artículo no tiene código), con "Incluido" y "Incluido desde".
--    Carga inicial: listado Abonos_para_comisiones.csv (14/10/2026).
-- 3. comision_liquidacion (+ _vendedor y _linea): foto de un mes, con la
--    configuración usada. Una por mes; para regenerarla se elimina y se
--    vuelve a generar. No se editan.
-- 4. fn_comision_guardar_liquidacion(jsonb): guarda la liquidación entera
--    en una sola transacción (la llama informe-mkt-api).
--
-- Después de correrla, dar acceso a las áreas que correspondan en
-- permisos_area_seccion (sección "comisiones"); el superadmin ya lo tiene.
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Sección
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('comisiones', 'Comisiones por vendedor', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Abonos
-- ---------------------------------------------------------------------
create table if not exists comision_abono (
  codigo           text primary key,
  nombre           text not null,
  nombre_mostrar   text,
  incluido         boolean not null default false,
  incluido_desde   integer not null default 1 check (incluido_desde >= 1),
  actualizado_en   timestamptz not null default now(),
  actualizado_por  text
);
comment on table comision_abono is 'Abonos de NetSuite para el cálculo de comisiones. codigo = ABO-xx (o el nombre del artículo si no tiene código).';
comment on column comision_abono.incluido_desde is 'Por vendedor y por mes: la OV N-ésima de este abono en adelante comisiona; las primeras N-1 no.';

alter table comision_abono enable row level security;
drop policy if exists "comision_abono: ver" on comision_abono;
create policy "comision_abono: ver" on comision_abono for select
  using (auth.role() = 'authenticated'
         and (fn_tiene_permiso('comisiones', 'ver') or fn_tiene_permiso('informes-mkt', 'ver')));
drop policy if exists "comision_abono: crear" on comision_abono;
create policy "comision_abono: crear" on comision_abono for insert
  with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_abono: actualizar" on comision_abono;
create policy "comision_abono: actualizar" on comision_abono for update
  using (fn_tiene_permiso('comisiones', 'editar')) with check (fn_tiene_permiso('comisiones', 'editar'));
drop policy if exists "comision_abono: borrar" on comision_abono;
create policy "comision_abono: borrar" on comision_abono for delete
  using (fn_tiene_permiso('comisiones', 'editar'));
grant select, insert, update, delete on comision_abono to authenticated;

-- Carga inicial (no pisa lo que ya se haya editado).
insert into comision_abono (codigo, nombre, nombre_mostrar, incluido, incluido_desde) values
  ('Abono Mensual Central de Incendio', 'Abono Mensual Central de Incendio', 'Abono Mensual Central de Incendio', false, 1),
  ('ABO-10', 'ABO-10 Abono Mensual Monitoreo Alarma', 'Abono Mensual Monitoreo Alarma', true, 1),
  ('ABO-11', 'ABO-11 Adicional Abono 4G / Radio', 'Adicional Abono 4G / Radio', true, 1),
  ('ABO-12', 'ABO-12 Abono Mensual Aviso Corte de Luz', 'Abono Mensual Aviso Corte de Luz', false, 1),
  ('ABO-13', 'ABO-13 Abono Mensual Monitoreo Central de Incendio', 'Abono Mensual Monitoreo Central de Incendio', false, 1),
  ('ABO-14', 'ABO-14 Video Verificación: Servicio', 'Video Verificación: Servicio', false, 1),
  ('ABO-15', 'ABO-15 Abono Mensual Monitoreo Central de Incendio con Mantenimiento', 'ABO-15 Abono Mensual Monitoreo Central de Incendio con Mantenimiento', false, 1),
  ('ABO-16', 'ABO-16 Abono Mensual de Monitoreo', 'Abono Mensual de Monitoreo', true, 1),
  ('ABO-20', 'ABO-20 Abono Mensual Monitoreo Sin Móvil Acuda', 'Abono Mensual Monitoreo Sin Móvil Acuda', true, 1),
  ('ABO-21', 'ABO-21 Abono 4G Sin Móvil Acuda', 'Abono 4G Sin Móvil Acuda', true, 1),
  ('ABO-23', 'ABO-23 Abono para empresas con 4G', 'Abono para empresas con 4G', false, 1),
  ('ABO-310', 'ABO-310 Abono Mensual - Colegio Patris', 'Abono Mensual - Colegio Patris', false, 1),
  ('ABO-37', 'ABO-37 Abono mensual MDI BTOOTH (Clientes Nuevos)', null, false, 1),
  ('ABO-38', 'ABO-38 Abono mensual MDI BTOOTH (Clientes SP/MDI)', 'Abono mensual MDI BTOOTH', false, 1),
  ('ABO-402', 'ABO-402 Comodato Edificios: Cámaras y Conectividad', 'Comodato Edificios: Cámaras y Conectividad', false, 1),
  ('ABO-403', 'ABO-403 SP Obra Segura', 'SP Obra Segura (Comodato Alarma, Cámaras, Conectividad y Video Verificación)', true, 1),
  ('ABO-403-AC', 'ABO-403-AC Obra Segura - Adicional Cámara Adicional con memoria', 'Obra Segura - Adicional Cámara Adicional con memoria', false, 1),
  ('ABO-403-AI', 'ABO-403-AI Obra Segura - Adicional infrarrojo', 'Obra Segura - Adicional infrarrojo', false, 1),
  ('ABO-404', 'ABO-404 Comodato Obra: Alarma', 'Comodato Obra: Alarma', false, 1),
  ('ABO-405', 'ABO-405 Comodato Edificios: Cámaras', 'Comodato Edificios: Cámaras', false, 1),
  ('ABO-406', 'ABO-406 Totem Consorcio Seguro', 'Totem Consorcio Seguro', false, 1),
  ('ABO-42', 'ABO-42 Comodato Edificios: Control de Acceso Monitoreado (por puerta)', 'Comodato Edificios: Control de Acceso Monitoreado (por puerta)', false, 1),
  ('ABO-43', 'ABO-43 Video Verificación: Comodato Cámara Interior', 'Video Verificación: Comodato Cámara Interior', false, 1),
  ('ABO-50', 'ABO-50 SP Comercio Seguro - Kit 1 (Comodato)', 'SP Comercio Seguro - Kit 1', true, 1),
  ('ABO-500', 'ABO-500 Abono Mercado Agroganadero de Cañuelas', 'Abono Mercado Agroganadero de Cañuelas', false, 1),
  ('ABO-51', 'ABO-51 SP Comercio Seguro - Kit 2 (Comodato)', 'SP Comercio Seguro - Kit 2', true, 1),
  ('ABO-52', 'ABO-52 SP Comercio Seguro - Kit 1 + Cámara (Comodato)', 'SP Comercio Seguro - Kit 1 + Cámara', false, 1),
  ('ABO-53', 'ABO-53 SP Comercio Seguro - Kit 2 + Cámara (Comodato)', 'SP Comercio Seguro - Kit 2 + Cámara', false, 1),
  ('ABO-54', 'ABO-54 SP Comercio Seguro - Cámara Adicional (Comodato)', 'SP Comercio Seguro - Cámara Adicional', false, 1),
  ('ABO-55', 'ABO-55 SP Comercio Seguro - Rele Adic. (Comodato)', 'SP Comercio Seguro - Comando Rele Adic.', false, 1),
  ('ABO-56', 'ABO-56 SP Comercio Seguro - Mag. Adic. (Comodato)', 'ABO-56 SP Comercio Seguro - Mag. Adic. (Comodato)', false, 1),
  ('ABO-57', 'ABO-57 SP Comercio Seguro - Inf. Adic. (Comodato)', 'SP Comercio Seguro - Inf Adic. (Comodato)', false, 1),
  ('ABO-58', 'ABO-58 SP Comercio Seguro - Mag Persiana (Comodato)', 'SP Comercio Seguro - Mag Persiana (Comodato)', false, 1),
  ('ABO-59', 'ABO-59 SP Comercio Seguro - Infrarrojo inalámbrico para exterior Ajax (Comodato)', 'Infrarrojo inalámbrico para exterior Ajax (Comodato)', false, 1),
  ('ABO-60', 'ABO-60 SP Comercio Seguro - Kit 3 (Comodato)', 'SP Comercio Seguro - Kit 3 (Comodato)', true, 1),
  ('ABO-600', 'ABO-600 Abono Mensual - Mantenimiento Preventivo Cámaras', 'Abono Mensual - Mantenimiento Preventivo Cámaras', false, 1),
  ('ABO-601', 'ABO-601 Abono Mensual - St. George Mantenimiento Preventivo', 'St. George Mantenimiento Preventivo', false, 1),
  ('ABO-61', 'ABO-61 SP Comercio Seguro - Teclado Adic. (Comodato)', 'SP Comercio Seguro - Teclado Adic. (Comodato)', false, 1),
  ('ABO-62', 'ABO-62 SP Comercio Seguro - Detector Rotura de Vidrio Ajax. (Comodato)', 'SP Comercio Seguro - Detector Rotura de Vidrio Ajax.', false, 1),
  ('ABO-63', 'ABO-63 SP Comercio Seguro - Ctrol. Rem./ Pánico Adic. (Comodato)', 'Comercio Seguro - Ctrol. Rem./ Pánico Adic. (Comodato)', false, 1),
  ('ABO-64', 'ABO-64 SP Comercio Seguro - PIR DT Adic ( Comodato)', 'SP Comercio Seguro - PIR DT Adic ( Comodato)', false, 1),
  ('ABO-65', 'ABO-65 SP Comercio Seguro - Magnético Inalámbrico c/detección de choque Adic ( Comodato)', 'SP Comercio Seguro - Magnético Inalámbrico c/detección de choque Adic ( Comodato)', false, 1),
  ('ABO-66', 'ABO-66 SP Comercio Seguro - Infrarrojo Inalámbrico Exterior Hikvision ( Comodato)', 'SP Comercio Seguro - Infrarrojo Inalámbrico Exterior Hikvision ( Comodato)', false, 1),
  ('ABO-67', 'ABO-67 SP Comercio Seguro - Sirena exterior Inalámbrica Hikvision ( Comodato)', 'SP Comercio Seguro - Sirena exterior Inalámbrica Hikvision ( Comodato)', false, 1),
  ('ABO-70', 'ABO-70 SP Comercio Seguro - Kit 1 Abono Promocional (Comodato)', null, true, 1),
  ('ABO-71', 'ABO-71 SP Comercio Seguro - Kit 2 Abono Promocional (Comodato)', null, true, 1),
  ('Cargo de reconexión', 'Cargo de reconexión', 'Cargo de reconexión', false, 1)
on conflict (codigo) do nothing;

-- ---------------------------------------------------------------------
-- 3. Liquidaciones
-- ---------------------------------------------------------------------
create table if not exists comision_liquidacion (
  id            uuid primary key default gen_random_uuid(),
  mes           date not null unique check (extract(day from mes) = 1),
  desde         date not null,
  hasta         date not null,
  generada_en   timestamptz not null default now(),
  generada_por  text,
  config        jsonb not null,           -- abonos tal como estaban configurados al generar
  totales       jsonb not null,           -- ganadas, ovs, base, comision...
  sin_ov        jsonb not null default '[]'::jsonb,  -- ganadas sin OV de abonos
  avisos        jsonb not null default '[]'::jsonb
);
comment on table comision_liquidacion is 'Liquidación mensual de comisiones (foto). Una por mes; para regenerarla se elimina.';

create table if not exists comision_liquidacion_vendedor (
  id                  bigint generated always as identity primary key,
  liquidacion_id      uuid not null references comision_liquidacion(id) on delete cascade,
  vendedor            text not null,
  ganadas             integer not null default 0,
  ovs                 integer not null default 0,
  ovs_comisionables   integer not null default 0,
  base_comisionable   numeric(14,2) not null default 0,
  comision            numeric(14,2) not null default 0,
  por_abono           jsonb not null default '[]'::jsonb,  -- [{codigo, ovs, comisionan, base, comision}]
  unique (liquidacion_id, vendedor)
);
create index if not exists comision_liquidacion_vendedor_liq_idx on comision_liquidacion_vendedor (liquidacion_id);

create table if not exists comision_liquidacion_linea (
  id                 bigint generated always as identity primary key,
  liquidacion_id     uuid not null references comision_liquidacion(id) on delete cascade,
  vendedor           text not null,
  ov_id              bigint not null,
  ov_numero          text,
  fecha_ov           date,
  modalidad          text,
  oportunidad        text,
  fecha_oportunidad  date,
  cliente            text,
  nro_cliente        text,
  codigo             text not null,
  articulo           text,
  cantidad           numeric(12,2),
  importe            numeric(14,2),
  incluido           boolean not null default false,
  orden              integer,          -- número de OV de ese abono para el vendedor en el mes
  incluido_desde     integer,
  comisiona          boolean not null default false,
  comision           numeric(14,2) not null default 0
);
create index if not exists comision_liquidacion_linea_liq_idx on comision_liquidacion_linea (liquidacion_id);

do $$
declare t text;
begin
  foreach t in array array['comision_liquidacion','comision_liquidacion_vendedor','comision_liquidacion_linea']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using (auth.role() = ''authenticated'' and fn_tiene_permiso(''comisiones'', ''ver''))', t, t);
    execute format('drop policy if exists "%s: crear" on %I', t, t);
    execute format('create policy "%s: crear" on %I for insert with check (fn_tiene_permiso(''comisiones'', ''editar''))', t, t);
    execute format('drop policy if exists "%s: borrar" on %I', t, t);
    execute format('create policy "%s: borrar" on %I for delete using (fn_tiene_permiso(''comisiones'', ''editar''))', t, t);
    -- Sin update: una liquidación no se edita; se elimina y se vuelve a generar.
    execute format('grant select, insert, delete on %I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 4. Guardar una liquidación completa (una transacción)
--    security invoker: aplican las políticas RLS de quien la llama.
-- ---------------------------------------------------------------------
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

  insert into comision_liquidacion (mes, desde, hasta, generada_por, config, totales, sin_ov, avisos)
  values (v_mes, (p->>'desde')::date, (p->>'hasta')::date, p->>'generada_por',
          coalesce(p->'config', '[]'::jsonb), coalesce(p->'totales', '{}'::jsonb),
          coalesce(p->'sin_ov', '[]'::jsonb), coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_id;

  insert into comision_liquidacion_vendedor
    (liquidacion_id, vendedor, ganadas, ovs, ovs_comisionables, base_comisionable, comision, por_abono)
  select v_id, x->>'vendedor', coalesce((x->>'ganadas')::int, 0), coalesce((x->>'ovs')::int, 0),
         coalesce((x->>'ovs_comisionables')::int, 0), coalesce((x->>'base_comisionable')::numeric, 0),
         coalesce((x->>'comision')::numeric, 0), coalesce(x->'por_abono', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p->'vendedores', '[]'::jsonb)) x;

  insert into comision_liquidacion_linea
    (liquidacion_id, vendedor, ov_id, ov_numero, fecha_ov, modalidad, oportunidad, fecha_oportunidad,
     cliente, nro_cliente, codigo, articulo, cantidad, importe, incluido, orden, incluido_desde, comisiona, comision)
  select v_id, x->>'vendedor', (x->>'ov_id')::bigint, x->>'ov_numero', (x->>'fecha_ov')::date, x->>'modalidad',
         x->>'oportunidad', (x->>'fecha_oportunidad')::date, x->>'cliente', x->>'nro_cliente',
         x->>'codigo', x->>'articulo', (x->>'cantidad')::numeric, (x->>'importe')::numeric,
         coalesce((x->>'incluido')::boolean, false), (x->>'orden')::int, (x->>'incluido_desde')::int,
         coalesce((x->>'comisiona')::boolean, false), coalesce((x->>'comision')::numeric, 0)
  from jsonb_array_elements(coalesce(p->'lineas', '[]'::jsonb)) x;

  return v_id;
end;
$$;
grant execute on function fn_comision_guardar_liquidacion(jsonb) to authenticated;

commit;

notify pgrst, 'reload schema';

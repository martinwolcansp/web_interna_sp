-- =====================================================================
-- migracion_33_comisiones_oportunidades.sql
-- Comisiones: detalle de las oportunidades ganadas en la liquidación
-- (20/10/2026).
--
-- Requiere la migración 31.
--
-- comision_liquidacion.oportunidades: todas las oportunidades ganadas del
-- mes con su situación, para mostrar en la liquidación (y en su Excel) los
-- totales y el listado de cada grupo:
--   fondo = con OV de abonos que suma al fondo comisionable
--   conov = con OV de abonos que no suma (sin abonos incluidos)
--   sinov = sin OV de abonos
-- Las liquidaciones generadas antes quedan con la lista vacía: la pantalla
-- arma los grupos con lo que tienen (para verlas completas, regenerarlas).
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table comision_liquidacion
  add column if not exists oportunidades jsonb not null default '[]'::jsonb;
comment on column comision_liquidacion.oportunidades is
  'Oportunidades ganadas del mes con su situación (fondo / conov / sinov), OV, base y aporte al fondo.';

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
                                    totales, sin_ov, oportunidades, avisos)
  values (v_mes, (p->>'desde')::date, (p->>'hasta')::date, p->>'generada_por', 'fondo',
          coalesce(p->'config', '[]'::jsonb), coalesce(p->'unidades', '[]'::jsonb),
          coalesce(p->'fondos', '[]'::jsonb), coalesce(p->'porcentajes', '[]'::jsonb),
          coalesce(p->'totales', '{}'::jsonb), coalesce(p->'sin_ov', '[]'::jsonb), coalesce(p->'oportunidades', '[]'::jsonb),
          coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_id;

  insert into comision_liquidacion_vendedor
    (liquidacion_id, vendedor_id, vendedor, ganadas, ovs, ovs_comisionables, base_comisionable, aporte, comision, por_unidad)
  select v_id, (x->>'vendedor_id')::bigint, x->>'vendedor', coalesce((x->>'ganadas')::int, 0), coalesce((x->>'ovs')::int, 0),
         coalesce((x->>'ovs_comisionables')::int, 0), coalesce((x->>'base_comisionable')::numeric, 0),
         coalesce((x->>'aporte')::numeric, 0), coalesce((x->>'comision')::numeric, 0),
         coalesce(x->'por_unidad', '[]'::jsonb)
  from jsonb_array_elements(coalesce(p->'vendedores', '[]'::jsonb)) x;

  insert into comision_liquidacion_linea
    (liquidacion_id, vendedor_id, vendedor, ov_id, ov_numero, fecha_ov, modalidad, oportunidad, fecha_oportunidad,
     cliente, nro_cliente, codigo, articulo, cantidad, importe, incluido, unidad, factor, aporte)
  select v_id, (x->>'vendedor_id')::bigint, x->>'vendedor', (x->>'ov_id')::bigint, x->>'ov_numero', (x->>'fecha_ov')::date,
         x->>'modalidad', x->>'oportunidad', (x->>'fecha_oportunidad')::date, x->>'cliente', x->>'nro_cliente',
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

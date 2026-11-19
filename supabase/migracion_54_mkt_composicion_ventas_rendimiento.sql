-- =====================================================================
-- migracion_54_mkt_composicion_ventas_rendimiento.sql
-- Composicion de ventas: "canceling statement due to statement timeout"
-- (19 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- fn_mkt_composicion_ventas (migracion 49) era security invoker: cada fila
-- de ns_transaccion, ns_transaccion_linea, ns_articulo y de las oportunidades
-- pasaba por la politica RLS, que llama a fn_tiene_permiso (dos consultas a
-- perfiles / permisos) fila por fila. Con los articulos ya cargados superaba
-- el tiempo maximo de Supabase.
--
-- Ahora:
--   - security definer: verifica 'ver' en informes-mkt UNA vez y lee las
--     tablas sin RLS (mismo criterio que fn_cli_sin_compra, migracion 47);
--   - primero arma la lista de ganadas y de sus presupuestos y despues busca
--     OV y lineas por esos IDs (usa los indices de ns_transaccion).
-- Mismo resultado y mismas columnas que la migracion 49.
-- Requiere las migraciones 19, 48 y 49. Segura de correr mas de una vez.
-- =====================================================================

begin;

create index if not exists informe_mkt_ns_oportunidad_fecha_idx on informe_mkt_ns_oportunidad (fecha_oportunidad);
create index if not exists ns_transaccion_linea_abo_idx on ns_transaccion_linea (transaccion_id) where categoria = 'ABO';

create or replace function fn_mkt_composicion_ventas(p_desde date, p_hasta date, p_dias_nuevo int default 30)
returns table (
  oportunidad_id        bigint,
  oportunidad           text,
  fecha                 date,
  mes                   text,
  cliente               text,
  nro_cliente           text,
  vendedor              text,
  unidad_negocio        text,
  tipo_establecimiento  text,
  tipo_origen           text,
  modalidad             text,
  alta_cliente          date,
  cliente_nuevo         boolean,
  fuente                text,
  transacciones         text,
  abonos                int[],
  equipos_cantidad      numeric,
  equipos_lista         numeric,
  equipos_real          numeric,
  servicios_lista       numeric,
  servicios_real        numeric,
  descuentos            numeric,
  lineas_sin_precio     int,
  familias              jsonb,
  lineas                jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
#variable_conflict use_column
declare
  v_opps bigint[];
  v_pres bigint[];
begin
  if not fn_tiene_permiso('informes-mkt', 'ver') then
    raise exception 'Sin permiso para ver el Informe de MKT' using errcode = '42501';
  end if;

  select coalesce(array_agg(o.id_interno), '{}') into v_opps
  from informe_mkt_ns_oportunidad o
  where o.fecha_oportunidad between p_desde and p_hasta
    and coalesce(o.fila ->> 'Aprobada', '') ~ '^1(\.0+)?$';

  select coalesce(array_agg(t.id), '{}') into v_pres
  from ns_transaccion t
  where t.oportunidad_id = any(v_opps) and t.tipo = 'Estimate';

  return query
  with gan as (
    select o.id_interno                                           as opp_id,
           o.fecha_oportunidad                                    as f_fecha,
           o.fila ->> 'Oportunidad'                               as f_oportunidad,
           o.fila ->> 'Cliente'                                   as f_cliente,
           o.fila ->> 'ID'                                        as f_nro_cliente,
           nullif(trim(o.fila ->> 'Representante de Ventas'), '') as f_vendedor,
           nullif(trim(o.fila ->> 'Unidad de Negocio'), '')       as f_unidad,
           nullif(trim(o.fila ->> 'Tipo de establecimiento'), '') as tipo_cargado,
           case upper(coalesce(o.fila ->> 'Comodato', '')) when 'T' then 'Comodato' when 'F' then 'Venta' end as modalidad_op,
           case when (o.fila ->> 'Creación cliente potencial') ~ '^\d{4}-\d{2}-\d{2}'
                then left(o.fila ->> 'Creación cliente potencial', 10)::date end as f_alta
    from informe_mkt_ns_oportunidad o
    where o.id_interno = any(v_opps)
  ),
  pres as (
    select t.id as t_id, t.numero as t_numero, t.fecha as t_fecha, t.comodato as t_comodato, t.oportunidad_id as opp
    from ns_transaccion t
    where t.id = any(v_pres)
  ),
  ov as (
    select t.id as t_id, t.numero as t_numero, t.fecha as t_fecha, t.comodato as t_comodato,
           case when t.oportunidad_id = any(v_opps) then t.oportunidad_id else p.opp end as opp
    from ns_transaccion t
    left join pres p on p.t_id = t.presupuesto_origen_id
    where t.tipo = 'SalesOrd'
      and (t.oportunidad_id = any(v_opps) or t.presupuesto_origen_id = any(v_pres))
  ),
  ov_opp as (
    select opp, array_agg(t_id order by t_fecha, t_id) as ids,
           string_agg(t_numero, ', ' order by t_fecha, t_id) as numeros, bool_or(t_comodato) as comodato
    from ov where opp is not null group by opp
  ),
  pres_ult as (
    select distinct on (opp) opp, t_id, t_numero, t_comodato
    from pres order by opp, t_fecha desc, t_id desc
  ),
  fuente as (
    select g.*,
           case when oo.ids is not null then 'OV' when pu.t_id is not null then 'Presupuesto' end as f_fuente,
           coalesce(oo.ids, case when pu.t_id is not null then array[pu.t_id] end) as trans_ids,
           coalesce(oo.numeros, pu.t_numero) as f_transacciones,
           coalesce(g.modalidad_op,
                    case when coalesce(oo.comodato, pu.t_comodato) then 'Comodato'
                         when coalesce(oo.comodato, pu.t_comodato) is not null then 'Venta' end,
                    'Sin dato') as f_modalidad
    from gan g
    left join ov_opp oo on oo.opp = g.opp_id
    left join pres_ult pu on pu.opp = g.opp_id
  ),
  abo as (
    select x.opp, array_agg(distinct x.n order by x.n) as nums
    from (
      select t.opp, substring(l.articulo from '^\s*[Aa][Bb][Oo][\s\-_.]*0*([0-9]+)')::int as n
      from (select t_id, opp from pres union all select t_id, opp from ov) t
      join ns_transaccion_linea l on l.transaccion_id = t.t_id and l.categoria = 'ABO'
    ) x
    where x.n is not null
    group by x.opp
  ),
  art as (
    -- solo los articulos que aparecen en las lineas usadas
    select a.id, a.familia, a.precio_lista, a.precio_referencia
    from ns_articulo_clasificado a
    where a.id in (
      select l.articulo_id
      from fuente f
      cross join lateral unnest(f.trans_ids) as tid(id)
      join ns_transaccion_linea l on l.transaccion_id = tid.id
      where l.articulo_id is not null
    )
  ),
  lin as (
    select f.opp_id, l.categoria, l.articulo_id, l.articulo,
           coalesce(l.cantidad, 1) as cantidad, l.importe,
           coalesce(a.familia, 'Sin familia') as familia,
           case when l.categoria in ('Equipo', 'Servicio')
                then coalesce(a.precio_referencia, nullif(l.precio, 0)) end as precio_ref,
           case when a.precio_lista is not null then 'lista'
                when a.precio_referencia is not null then 'equivalente'
                when nullif(l.precio, 0) is not null then 'linea' end as precio_origen
    from fuente f
    cross join lateral unnest(f.trans_ids) as tid(id)
    join ns_transaccion_linea l on l.transaccion_id = tid.id
    left join art a on a.id = l.articulo_id
    where l.categoria <> 'ABO'
  ),
  tot as (
    select opp_id,
           sum(cantidad) filter (where categoria = 'Equipo')                 as t_equipos_cantidad,
           sum(precio_ref * cantidad) filter (where categoria = 'Equipo')    as t_equipos_lista,
           sum(importe) filter (where categoria = 'Equipo')                  as t_equipos_real,
           sum(precio_ref * cantidad) filter (where categoria = 'Servicio')  as t_servicios_lista,
           sum(importe) filter (where categoria = 'Servicio')                as t_servicios_real,
           sum(importe) filter (where categoria = 'Descuento')               as t_descuentos,
           (count(*) filter (where categoria in ('Equipo', 'Servicio') and precio_ref is null))::int as t_sin_precio,
           jsonb_agg(jsonb_build_object(
             'categoria', categoria, 'articulo_id', articulo_id, 'articulo', articulo, 'familia', familia,
             'cantidad', cantidad, 'precio_ref', precio_ref, 'precio_origen', precio_origen,
             'valor_lista', precio_ref * cantidad, 'importe', importe) order by categoria, articulo) as t_lineas
    from lin group by opp_id
  ),
  fam as (
    select opp_id, jsonb_object_agg(familia, jsonb_build_object('cantidad', cant, 'lista', lista)) as t_familias
    from (
      select opp_id, familia, sum(cantidad) as cant, sum(precio_ref * cantidad) as lista
      from lin where categoria = 'Equipo' group by opp_id, familia
    ) z group by opp_id
  )
  select f.opp_id, f.f_oportunidad, f.f_fecha, to_char(f.f_fecha, 'YYYY-MM'), f.f_cliente, f.f_nro_cliente,
         f.f_vendedor, f.f_unidad,
         case when f.tipo_cargado is not null then f.tipo_cargado
              when f.f_modalidad = 'Comodato' and ab.nums && array[60, 70, 71] then 'Comercio'
              when f.f_modalidad = 'Comodato' and 16 = any(ab.nums) then 'Hogar'
              else 'Sin dato' end,
         case when f.tipo_cargado is not null then 'cargado'
              when f.f_modalidad = 'Comodato' and (ab.nums && array[60, 70, 71] or 16 = any(ab.nums)) then 'inferido'
              else 'sin dato' end,
         f.f_modalidad, f.f_alta,
         case when f.f_alta is not null then (f.f_fecha - f.f_alta) <= p_dias_nuevo end,
         f.f_fuente, f.f_transacciones, ab.nums,
         coalesce(t.t_equipos_cantidad, 0), coalesce(t.t_equipos_lista, 0), coalesce(t.t_equipos_real, 0),
         coalesce(t.t_servicios_lista, 0), coalesce(t.t_servicios_real, 0), coalesce(t.t_descuentos, 0),
         coalesce(t.t_sin_precio, 0), coalesce(fm.t_familias, '{}'::jsonb), coalesce(t.t_lineas, '[]'::jsonb)
  from fuente f
  left join abo ab on ab.opp = f.opp_id
  left join tot t on t.opp_id = f.opp_id
  left join fam fm on fm.opp_id = f.opp_id
  order by f.f_fecha, f.opp_id;
end;
$fn$;

revoke all on function fn_mkt_composicion_ventas(date, date, int) from public;
grant execute on function fn_mkt_composicion_ventas(date, date, int) to authenticated;

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- migracion_49_mkt_composicion_ventas.sql
-- Informe MKT: pestana "Composicion de ventas" (16 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- fn_mkt_composicion_ventas(desde, hasta): una fila por oportunidad ganada
-- del periodo con sus equipos, mano de obra y descuentos.
--
-- Fuentes:
--   informe_mkt_ns_oportunidad   ganadas (Aprobada = 1), fecha, tipo de
--                                establecimiento, comodato, alta del cliente
--   ns_transaccion / _linea      presupuestos y OV de productos (migracion 48,
--                                actualizacion manual "Actualizar articulos")
--   ns_articulo_clasificado      familia y precio de referencia de cada articulo
--
-- Criterios (definidos el 13/11/2026):
--   Fuente de los articulos: las OV de productos de la ganada (por oportunidad
--     o por su presupuesto de origen); si no tiene, su ultimo presupuesto.
--   Ticket: EQUIPOS valorizados a la lista de precios vigente (precio base en
--     pesos, sin IVA). Los de comodato (CC-XXX) con el precio del articulo de
--     venta XXX. Sin precio de lista: el precio de la linea. La mano de obra
--     (Servicio) y los descuentos van aparte.
--   Cliente nuevo: alta del cliente en NetSuite dentro de los 30 dias previos
--     a la fecha de la oportunidad (p_dias_nuevo).
--   Tipo de establecimiento: el cargado en la oportunidad. Si falta y es
--     comodato, se infiere por los abonos: kit Comercio Seguro (ABO 60, 70,
--     71) = Comercio; monitoreo ABO 16 = Hogar. Si no, "Sin dato".
--
-- Permisos: security invoker; las tablas piden 'ver' en informes-mkt.
-- Requiere las migraciones 19 y 48. Segura de correr mas de una vez.
-- =====================================================================

begin;

drop function if exists fn_mkt_composicion_ventas(date, date, int);

create or replace function fn_mkt_composicion_ventas(p_desde date, p_hasta date, p_dias_nuevo int default 30)
returns table (
  oportunidad_id        bigint,
  oportunidad           text,
  fecha                 date,
  mes                   text,         -- 'AAAA-MM'
  cliente               text,
  nro_cliente           text,
  vendedor              text,
  unidad_negocio        text,
  tipo_establecimiento  text,         -- Hogar | Comercio | ... | Sin dato
  tipo_origen           text,         -- cargado | inferido | sin dato
  modalidad             text,         -- Venta | Comodato | Sin dato
  alta_cliente          date,
  cliente_nuevo         boolean,      -- null = sin fecha de alta
  fuente                text,         -- OV | Presupuesto | null (sin articulos cargados)
  transacciones         text,         -- numeros de las OV o del presupuesto usado
  abonos                int[],        -- numeros ABO de sus presupuestos y OV
  equipos_cantidad      numeric,
  equipos_lista         numeric,      -- ticket de equipos (a lista)
  equipos_real          numeric,      -- importe real de los equipos (0 en comodato)
  servicios_lista       numeric,
  servicios_real        numeric,
  descuentos            numeric,      -- negativo
  lineas_sin_precio     int,          -- equipos/servicios sin precio de lista ni de linea
  familias              jsonb,        -- {familia: {cantidad, lista}}
  lineas                jsonb         -- detalle de equipos, servicios y descuentos
)
language sql
stable
security invoker
set search_path = public
as $$
with gan as (
  select o.id_interno                                         as oportunidad_id,
         o.fecha_oportunidad                                  as fecha,
         o.fila ->> 'Oportunidad'                             as oportunidad,
         o.fila ->> 'Cliente'                                 as cliente,
         o.fila ->> 'ID'                                      as nro_cliente,
         nullif(trim(o.fila ->> 'Representante de Ventas'), '') as vendedor,
         nullif(trim(o.fila ->> 'Unidad de Negocio'), '')     as unidad_negocio,
         nullif(trim(o.fila ->> 'Tipo de establecimiento'), '') as tipo_cargado,
         case upper(coalesce(o.fila ->> 'Comodato', '')) when 'T' then 'Comodato' when 'F' then 'Venta' end as modalidad_op,
         case when (o.fila ->> 'Creación cliente potencial') ~ '^\d{4}-\d{2}-\d{2}'
              then left(o.fila ->> 'Creación cliente potencial', 10)::date end as alta_cliente
  from informe_mkt_ns_oportunidad o
  where o.fecha_oportunidad between p_desde and p_hasta
    and coalesce(o.fila ->> 'Aprobada', '') ~ '^1(\.0+)?$'
),
pres as (
  select t.id, t.numero, t.fecha, t.comodato, t.oportunidad_id as opp
  from ns_transaccion t
  join gan g on g.oportunidad_id = t.oportunidad_id
  where t.tipo = 'Estimate'
),
ov as (
  select t.id, t.numero, t.fecha, t.comodato,
         case when exists (select 1 from gan g where g.oportunidad_id = t.oportunidad_id)
              then t.oportunidad_id else p.opp end as opp
  from ns_transaccion t
  left join pres p on p.id = t.presupuesto_origen_id
  where t.tipo = 'SalesOrd'
    and (t.oportunidad_id in (select g.oportunidad_id from gan g) or p.id is not null)
),
ov_opp as (
  select opp, array_agg(id order by fecha, id) as ids, string_agg(numero, ', ' order by fecha, id) as numeros,
         bool_or(comodato) as comodato
  from ov where opp is not null group by opp
),
pres_ult as (
  select distinct on (opp) opp, id, numero, comodato
  from pres order by opp, fecha desc, id desc
),
fuente as (
  select g.*,
         case when oo.ids is not null then 'OV' when pu.id is not null then 'Presupuesto' end as fuente,
         coalesce(oo.ids, case when pu.id is not null then array[pu.id] end) as trans_ids,
         coalesce(oo.numeros, pu.numero) as transacciones,
         coalesce(g.modalidad_op,
                  case when coalesce(oo.comodato, pu.comodato) then 'Comodato'
                       when coalesce(oo.comodato, pu.comodato) is not null then 'Venta' end,
                  'Sin dato') as modalidad
  from gan g
  left join ov_opp oo on oo.opp = g.oportunidad_id
  left join pres_ult pu on pu.opp = g.oportunidad_id
),
abo as (
  select x.opp, array_agg(distinct x.n order by x.n) as nums
  from (
    select t.opp, substring(l.articulo from '^\s*[Aa][Bb][Oo][\s\-_.]*0*([0-9]+)')::int as n
    from (select id, opp from pres union all select id, opp from ov) t
    join ns_transaccion_linea l on l.transaccion_id = t.id and l.categoria = 'ABO'
  ) x
  where x.n is not null
  group by x.opp
),
lin as (
  select f.oportunidad_id, l.categoria, l.articulo_id, l.articulo,
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
  left join ns_articulo_clasificado a on a.id = l.articulo_id
  where l.categoria <> 'ABO'
),
tot as (
  select oportunidad_id,
         sum(cantidad) filter (where categoria = 'Equipo')                          as equipos_cantidad,
         sum(precio_ref * cantidad) filter (where categoria = 'Equipo')             as equipos_lista,
         sum(importe) filter (where categoria = 'Equipo')                           as equipos_real,
         sum(precio_ref * cantidad) filter (where categoria = 'Servicio')           as servicios_lista,
         sum(importe) filter (where categoria = 'Servicio')                         as servicios_real,
         sum(importe) filter (where categoria = 'Descuento')                        as descuentos,
         (count(*) filter (where categoria in ('Equipo', 'Servicio') and precio_ref is null))::int as lineas_sin_precio,
         jsonb_agg(jsonb_build_object(
           'categoria', categoria, 'articulo_id', articulo_id, 'articulo', articulo, 'familia', familia,
           'cantidad', cantidad, 'precio_ref', precio_ref, 'precio_origen', precio_origen,
           'valor_lista', precio_ref * cantidad, 'importe', importe) order by categoria, articulo) as lineas
  from lin group by oportunidad_id
),
fam as (
  select oportunidad_id,
         jsonb_object_agg(familia, jsonb_build_object('cantidad', cant, 'lista', lista)) as familias
  from (
    select oportunidad_id, familia, sum(cantidad) as cant, sum(precio_ref * cantidad) as lista
    from lin where categoria = 'Equipo' group by oportunidad_id, familia
  ) z group by oportunidad_id
)
select f.oportunidad_id, f.oportunidad, f.fecha, to_char(f.fecha, 'YYYY-MM'), f.cliente, f.nro_cliente,
       f.vendedor, f.unidad_negocio,
       case when f.tipo_cargado is not null then f.tipo_cargado
            when f.modalidad = 'Comodato' and ab.nums && array[60, 70, 71] then 'Comercio'
            when f.modalidad = 'Comodato' and 16 = any(ab.nums) then 'Hogar'
            else 'Sin dato' end,
       case when f.tipo_cargado is not null then 'cargado'
            when f.modalidad = 'Comodato' and (ab.nums && array[60, 70, 71] or 16 = any(ab.nums)) then 'inferido'
            else 'sin dato' end,
       f.modalidad, f.alta_cliente,
       case when f.alta_cliente is not null then (f.fecha - f.alta_cliente) <= p_dias_nuevo end,
       f.fuente, f.transacciones, ab.nums,
       coalesce(t.equipos_cantidad, 0), coalesce(t.equipos_lista, 0), coalesce(t.equipos_real, 0),
       coalesce(t.servicios_lista, 0), coalesce(t.servicios_real, 0), coalesce(t.descuentos, 0),
       coalesce(t.lineas_sin_precio, 0), coalesce(fm.familias, '{}'::jsonb), coalesce(t.lineas, '[]'::jsonb)
from fuente f
left join abo ab on ab.opp = f.oportunidad_id
left join tot t on t.oportunidad_id = f.oportunidad_id
left join fam fm on fm.oportunidad_id = f.oportunidad_id
order by f.fecha, f.oportunidad_id;
$$;

grant execute on function fn_mkt_composicion_ventas(date, date, int) to authenticated;

commit;

notify pgrst, 'reload schema';

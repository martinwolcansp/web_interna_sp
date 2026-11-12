-- =====================================================================
-- migracion_47_clientes_visitados_sin_compra.sql
-- Clientes activos: "Visitados sin compra" (12 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- Segmento para MKT: contactos de GHL que tuvieron una visita y no
-- concretaron la compra. Son sobre todo prospectos ("Cliente potencial" /
-- "interesado" en NetSuite), que no estan en cli_cliente (la Segmentacion
-- solo carga la etapa "Cliente"), por eso el segmento es por contacto de GHL.
--
-- No llama a GHL ni a NetSuite: cruza lo que ya guarda el Informe MKT
-- (servicio informe-mkt-api, corrida automatica lunes a viernes 16 hs):
--   informe_mkt_ghl_cita        citas de los calendarios de GHL (migracion 22)
--   informe_mkt_ns_oportunidad  oportunidades de NetSuite (busqueda 2933, migracion 19)
--   informe_mkt_ns_presupuesto  presupuestos de NetSuite (migracion 22)
--   contacto / informe_mkt_ghl_contacto  nombre, telefono, email, localidad
--   cli_cliente                 si el contacto ya es cliente en NetSuite
--
-- Criterios (mismos que el Informe por vendedor, app/visitas.py):
--   Visita     cita con fecha ya pasada y estado distinto de cancelled /
--              noshow / invalid ("concretada").
--   Vendedor   usuario asignado a la ultima visita (VENDEDOR_GHL_IDS de
--              app/resumen_ejecutivo.py; si se suma un vendedor, agregarlo
--              en los dos lados).
--   Compro     tiene una oportunidad de NetSuite ganada (columna "Aprobada"
--              = 1, estados 12 / 13) por ID CLIENTE CRM o ID CLIENTE CRM
--              MATRIZ, con fecha desde p_dias_previos dias antes de su primera
--              visita. La fecha de la oportunidad es la de creacion (casi
--              siempre anterior a la visita), por eso el margen.
--   Segmento   contactos con al menos una visita que no compraron.
--
-- Alcance: solo los dias que el Informe MKT cargo con visitas
-- (informe_mkt_dia_cargado.visitas_cargadas). fn_cli_visitas_cobertura()
-- devuelve ese rango para mostrarlo en la pagina.
--
-- Permisos: las tablas del Informe MKT piden permiso en informes-mkt. Las
-- funciones son security definer y verifican 'ver' en clientes-segmentacion,
-- asi quien ve la Segmentacion ve el segmento sin acceso al Informe MKT.
--
-- Requiere las migraciones 19, 22 y 42. Segura de correr mas de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Segmento: una fila por contacto de GHL visitado sin compra
-- ---------------------------------------------------------------------
drop function if exists fn_cli_visitados_sin_compra(int);
create or replace function fn_cli_visitados_sin_compra(p_dias_previos int default 180)
returns table (
  contact_id               text,
  nombre                   text,
  telefono                 text,
  email                    text,
  localidad                text,
  visitas                  int,
  primera_visita           timestamptz,
  ultima_visita            timestamptz,
  vendedor                 text,
  calendario               text,
  presupuestos             int,
  ultimo_presupuesto       date,
  total_ultimo_presupuesto numeric,
  oportunidades            int,
  estado_oportunidad       text,       -- estado de la ultima oportunidad de NetSuite
  cliente_ns_id            bigint,     -- si ya es cliente (cli_cliente, etapa Cliente)
  cliente_entity_id        text,
  detalle                  jsonb       -- {visitas: [...], oportunidades: [...], presupuestos: [...]}
)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not fn_tiene_permiso('clientes-segmentacion', 'ver') then
    raise exception 'Sin permiso para ver la Segmentacion de Clientes' using errcode = '42501';
  end if;

  return query
  with vend(id, nombre) as (
    values ('gsliIez5jPqQiJf2L8xw', 'Gustavo Duarte'),
           ('e2xSCStxUTstXbm2L6BS', 'Martín Ramos'),
           ('zJkQVddXy0ktGJqhUpgQ', 'Gonzalo Martin De Castro'),
           ('mS1a18rhRzZt2IsnpfrG', 'Federico Ordoqui')
  ),
  cita as (
    select c.id, c.contact_id as cid, c.inicio, c.estado, c.crudo,
           coalesce(v.nombre, 'Sin asignar') as vendedor
    from informe_mkt_ghl_cita c
    left join vend v on v.id = c.crudo ->> 'assignedUserId'
    where nullif(c.contact_id, '') is not null
      and c.inicio <= now()
      and coalesce(c.estado, '') not in ('cancelled', 'noshow', 'invalid')
  ),
  visitado as (
    select c.cid, count(*)::int as n, min(c.inicio) as primera, max(c.inicio) as ultima,
           jsonb_agg(jsonb_build_object(
             'id', c.id, 'inicio', c.inicio, 'estado', c.estado, 'vendedor', c.vendedor,
             'calendario', c.crudo ->> 'calendarName', 'titulo', c.crudo ->> 'title')
             order by c.inicio desc) as lista
    from cita c
    group by c.cid
  ),
  ultima as (
    select distinct on (c.cid) c.cid, c.vendedor, c.crudo ->> 'calendarName' as calendario, c.crudo ->> 'title' as titulo
    from cita c
    order by c.cid, c.inicio desc
  ),
  -- Oportunidades por contacto (propio o de la matriz, si es un establecimiento)
  opp as (
    select distinct on (o.id_interno, k.crm)
           o.id_interno, o.fecha_oportunidad as fecha, o.fila, k.crm,
           coalesce(o.fila ->> 'Aprobada', '') ~ '^1(\.0+)?$' as ganada
    from informe_mkt_ns_oportunidad o
    cross join lateral (values (nullif(trim(o.id_cliente_crm), '')),
                               (nullif(trim(o.fila ->> 'ID CLIENTE CRM MATRIZ'), ''))) k(crm)
    where k.crm is not null
  ),
  opp_v as (
    select v.cid, count(*)::int as n,
           bool_or(o.ganada and o.fecha >= (v.primera at time zone 'America/Argentina/Buenos_Aires')::date - p_dias_previos) as compro,
           (array_agg(o.fila ->> 'Estado Oportunidad' order by o.fecha desc, o.id_interno desc))[1] as ultimo_estado,
           jsonb_agg(jsonb_build_object(
             'id', o.id_interno, 'numero', o.fila ->> 'Oportunidad', 'fecha', o.fecha,
             'estado', o.fila ->> 'Estado Oportunidad', 'ganada', o.ganada,
             'representante', o.fila ->> 'Representante de Ventas',
             'unidad', o.fila ->> 'Unidad de Negocio')
             order by o.fecha desc, o.id_interno desc) as lista
    from visitado v
    join opp o on o.crm = v.cid
    group by v.cid
  ),
  pres_v as (
    select v.cid, count(*)::int as n,
           max(p.fecha) as ultima,
           (array_agg(nullif(p.fila ->> 'Total', '')::numeric order by p.fecha desc, p.id_interno desc))[1] as total,
           jsonb_agg(jsonb_build_object(
             'id', p.id_interno, 'numero', p.fila ->> 'Presupuesto', 'fecha', p.fecha,
             'estado', p.fila ->> 'Estado', 'total', p.fila ->> 'Total',
             'representante', p.fila ->> 'Representante de Ventas')
             order by p.fecha desc, p.id_interno desc) as lista
    from visitado v
    join informe_mkt_ns_presupuesto p
      on trim(p.id_cliente_crm) = v.cid
     and p.fecha >= (v.primera at time zone 'America/Argentina/Buenos_Aires')::date
    group by v.cid
  )
  select
    v.cid,
    coalesce(nullif(trim(coalesce(ct.nombre, '') || ' ' || coalesce(ct.apellido, '')), ''),
             nullif(trim(coalesce(gc.crudo ->> 'firstName', '') || ' ' || coalesce(gc.crudo ->> 'lastName', '')), ''),
             gc.crudo ->> 'contactName', cl.nombre, u.titulo, v.cid),
    coalesce(nullif(ct.telefono, ''), gc.crudo ->> 'phone', cl.telefono_movil, cl.telefono),
    coalesce(nullif(ct.email, ''), gc.crudo ->> 'email', cl.email),
    coalesce(nullif(ct.localidad, ''), gc.crudo ->> 'city', cl.localidad),
    v.n, v.primera, v.ultima,
    u.vendedor, u.calendario,
    coalesce(pr.n, 0), pr.ultima, pr.total,
    coalesce(op.n, 0), op.ultimo_estado,
    cl.ns_id, cl.entity_id,
    jsonb_build_object('visitas', v.lista,
                       'oportunidades', coalesce(op.lista, '[]'::jsonb),
                       'presupuestos', coalesce(pr.lista, '[]'::jsonb))
  from visitado v
  join ultima u on u.cid = v.cid
  left join opp_v op on op.cid = v.cid
  left join pres_v pr on pr.cid = v.cid
  left join contacto ct on ct.ghl_contact_id = v.cid
  left join informe_mkt_ghl_contacto gc on gc.id = v.cid
  left join lateral (
    select c.ns_id, c.entity_id, c.nombre, c.telefono, c.telefono_movil, c.email, c.localidad
    from cli_cliente c
    where c.ghl_contact_id = v.cid and c.vigente
    order by c.ns_id
    limit 1
  ) cl on true
  where not coalesce(op.compro, false)
  order by v.ultima desc;
end;
$$;

comment on function fn_cli_visitados_sin_compra(int) is
  'Contactos de GHL con visita concretada (informe_mkt_ghl_cita) sin oportunidad de NetSuite ganada desde p_dias_previos dias antes de su primera visita. Permiso: ver en clientes-segmentacion.';

revoke all on function fn_cli_visitados_sin_compra(int) from public, anon;
grant execute on function fn_cli_visitados_sin_compra(int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Rango de dias con visitas cargadas por el Informe MKT
-- ---------------------------------------------------------------------
create or replace function fn_cli_visitas_cobertura()
returns table (desde date, hasta date, dias int, actualizado_en timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if not fn_tiene_permiso('clientes-segmentacion', 'ver') then
    raise exception 'Sin permiso para ver la Segmentacion de Clientes' using errcode = '42501';
  end if;
  return query
  select min(d.dia), max(d.dia), count(*)::int, max(d.actualizado_en)
  from informe_mkt_dia_cargado d
  where d.visitas_cargadas;
end;
$$;

comment on function fn_cli_visitas_cobertura() is
  'Primer y ultimo dia con visitas de GHL cargadas por el Informe MKT, cantidad de dias y ultima carga. Permiso: ver en clientes-segmentacion.';

revoke all on function fn_cli_visitas_cobertura() from public, anon;
grant execute on function fn_cli_visitas_cobertura() to authenticated;

commit;

notify pgrst, 'reload schema';

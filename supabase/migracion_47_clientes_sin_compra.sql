-- =====================================================================
-- migracion_47_clientes_sin_compra.sql
-- Clientes activos: "Consultas sin compra" (12 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- Segmento para MKT: contactos de GHL que consultaron y no concretaron la
-- compra, separados en dos grupos:
--   Con visita   tuvieron al menos una visita (cita concretada), esten o
--                no calificados.
--   Sin visita   consultaron (contacto recibido en GHL), estan calificados
--                y no tuvieron visita.
-- La pagina permite filtrar por la etiqueta de linea "comercio".
--
-- Son sobre todo prospectos ("Cliente potencial" / "interesado" en
-- NetSuite), que no estan en cli_cliente (la Segmentacion solo carga la
-- etapa "Cliente"), por eso el segmento es por contacto de GHL.
--
-- No llama a GHL ni a NetSuite: cruza lo que ya guarda el Informe MKT
-- (servicio informe-mkt-api, corrida automatica lunes a viernes 16 hs):
--   informe_mkt_ghl_contacto    contactos recibidos en GHL (por fecha de alta), con sus etiquetas
--   informe_mkt_ghl_cita        citas de los calendarios de GHL (migracion 22)
--   informe_mkt_ns_oportunidad  oportunidades de NetSuite (busqueda 2933, migracion 19)
--   informe_mkt_ns_presupuesto  presupuestos de NetSuite (migracion 22)
--   contacto                    nombre, telefono, email, localidad, etiquetas, vendedor asignado
--   cli_cliente                 si el contacto ya es cliente en NetSuite
--
-- Criterios (mismos que el Informe MKT):
--   Consulto    contacto recibido en GHL (informe_mkt_ghl_contacto).
--   Calificado  sin etiqueta "nocalificado(cv)" ni "nocalificado(otros)"
--               (actualizable.html, calificacionContacto).
--   Comercio    etiqueta "comercio" (normalizada: sin mayusculas, espacios ni
--               simbolos; la de origen "netsuitecomercio" es otra etiqueta).
--   Visita      cita con fecha ya pasada y estado distinto de cancelled /
--               noshow / invalid (app/visitas.py).
--   Vendedor    usuario asignado a la ultima visita; sin visita, el asignado
--               al contacto (VENDEDOR_GHL_IDS de app/resumen_ejecutivo.py; si
--               se suma un vendedor, agregarlo en los dos lados).
--   Compro      oportunidad de NetSuite ganada (columna "Aprobada" = 1,
--               estados 12 / 13) por ID CLIENTE CRM o ID CLIENTE CRM MATRIZ,
--               con fecha desde p_dias_previos dias antes de la consulta o de
--               la primera visita (la mas antigua). La fecha de la oportunidad
--               es la de creacion, por eso el margen.
--
-- Alcance: lo que cargo el Informe MKT (contactos por fecha de alta; citas
-- desde el 08/10/2026). fn_cli_sin_compra_cobertura() devuelve los rangos.
--
-- Permisos: las tablas del Informe MKT piden permiso en informes-mkt. Las
-- funciones son security definer y verifican 'ver' en clientes-segmentacion.
--
-- Reemplaza la primera version (fn_cli_visitados_sin_compra /
-- fn_cli_visitas_cobertura), si se llego a correr.
-- Requiere las migraciones 14, 19, 22 y 42. Segura de correr mas de una vez.
-- =====================================================================

begin;

drop function if exists fn_cli_visitados_sin_compra(int);
drop function if exists fn_cli_visitas_cobertura();
drop function if exists fn_cli_sin_compra(int);
drop function if exists fn_cli_sin_compra_cobertura();

-- ---------------------------------------------------------------------
-- 1. Segmento: una fila por contacto de GHL sin compra
-- ---------------------------------------------------------------------
create or replace function fn_cli_sin_compra(p_dias_previos int default 180)
returns table (
  contact_id               text,
  grupo                    text,       -- 'Con visita' | 'Sin visita'
  nombre                   text,
  telefono                 text,
  email                    text,
  localidad                text,
  fecha_consulta           timestamptz, -- alta del contacto en GHL
  calificacion             text,       -- 'Calificado' | 'No calificado (cv)' | 'No calificado (otros)'
  comercio                 boolean,    -- tiene la etiqueta "comercio"
  etiquetas                text[],
  visitas                  int,
  citas_no_concretadas     int,        -- canceladas / no asistio / invalidas
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
  cita_todas as (
    select c.id, c.contact_id as cid, c.inicio, c.estado, c.crudo,
           coalesce(v.nombre, 'Sin asignar') as vendedor,
           (c.inicio <= now() and coalesce(c.estado, '') not in ('cancelled', 'noshow', 'invalid')) as concretada
    from informe_mkt_ghl_cita c
    left join vend v on v.id = c.crudo ->> 'assignedUserId'
    where nullif(c.contact_id, '') is not null
  ),
  cita as (select * from cita_todas where concretada),
  no_concretada as (
    select ct.cid, count(*)::int as n
    from cita_todas ct
    where not ct.concretada and coalesce(ct.estado, '') in ('cancelled', 'noshow', 'invalid')
    group by ct.cid
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
  -- Universo: contactos recibidos en GHL + contactos con visita
  base as (
    select gc.id as cid from informe_mkt_ghl_contacto gc
    union
    select v.cid from visitado v
  ),
  datos as (
    select b.cid,
           gc.id is not null as consulto,
           coalesce(gc.date_added, ct.fecha_creacion_ghl) as alta,
           coalesce(case when jsonb_typeof(gc.crudo -> 'tags') = 'array' then gc.crudo -> 'tags' end,
                    case when jsonb_typeof(ct.tags) = 'array' then ct.tags end,
                    '[]'::jsonb) as tags,
           gc.crudo as gcrudo, ct.nombre as ct_nombre, ct.apellido as ct_apellido, ct.telefono as ct_telefono,
           ct.email as ct_email, ct.localidad as ct_localidad,
           coalesce(gc.crudo ->> 'assignedTo', ct.vendedor_asignado) as asignado,
           v.n as visitas, v.primera, v.ultima, v.lista as visitas_lista,
           least((v.primera at time zone 'America/Argentina/Buenos_Aires')::date,
                 (coalesce(gc.date_added, ct.fecha_creacion_ghl) at time zone 'America/Argentina/Buenos_Aires')::date) as ref
    from base b
    left join informe_mkt_ghl_contacto gc on gc.id = b.cid
    left join contacto ct on ct.ghl_contact_id = b.cid
    left join visitado v on v.cid = b.cid
  ),
  etiq as (
    select d.cid,
           array_agg(t.tag order by t.ord) filter (where t.tag is not null) as lista,
           coalesce(bool_or(lower(trim(t.tag)) = 'nocalificado(cv)'), false) as nc_cv,
           coalesce(bool_or(lower(trim(t.tag)) = 'nocalificado(otros)'), false) as nc_otros,
           coalesce(bool_or(regexp_replace(lower(t.tag), '[^a-z0-9]', '', 'g') = 'comercio'), false) as comercio
    from datos d
    left join lateral jsonb_array_elements_text(d.tags) with ordinality t(tag, ord) on true
    group by d.cid
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
  opp_c as (
    select d.cid, count(*)::int as n,
           bool_or(o.ganada and (d.ref is null or o.fecha >= d.ref - p_dias_previos)) as compro,
           (array_agg(o.fila ->> 'Estado Oportunidad' order by o.fecha desc, o.id_interno desc))[1] as ultimo_estado,
           jsonb_agg(jsonb_build_object(
             'id', o.id_interno, 'numero', o.fila ->> 'Oportunidad', 'fecha', o.fecha,
             'estado', o.fila ->> 'Estado Oportunidad', 'ganada', o.ganada,
             'representante', o.fila ->> 'Representante de Ventas',
             'unidad', o.fila ->> 'Unidad de Negocio')
             order by o.fecha desc, o.id_interno desc) as lista
    from datos d
    join opp o on o.crm = d.cid
    group by d.cid
  ),
  pres_c as (
    select d.cid, count(*)::int as n,
           max(p.fecha) as ultima,
           (array_agg(case when (p.fila ->> 'Total') ~ '^-?[0-9]+(\.[0-9]+)?$' then (p.fila ->> 'Total')::numeric end
                      order by p.fecha desc, p.id_interno desc))[1] as total,
           jsonb_agg(jsonb_build_object(
             'id', p.id_interno, 'numero', p.fila ->> 'Presupuesto', 'fecha', p.fecha,
             'estado', p.fila ->> 'Estado', 'total', p.fila ->> 'Total',
             'representante', p.fila ->> 'Representante de Ventas')
             order by p.fecha desc, p.id_interno desc) as lista
    from datos d
    join informe_mkt_ns_presupuesto p
      on trim(p.id_cliente_crm) = d.cid
     and (d.ref is null or p.fecha >= d.ref)
    group by d.cid
  ),
  fila as (
    select d.*, e.lista as etiquetas, e.comercio,
           case when e.nc_cv then 'No calificado (cv)' when e.nc_otros then 'No calificado (otros)' else 'Calificado' end as calif
    from datos d
    join etiq e on e.cid = d.cid
  )
  select
    f.cid,
    case when f.visitas is not null then 'Con visita' else 'Sin visita' end,
    coalesce(nullif(trim(coalesce(f.ct_nombre, '') || ' ' || coalesce(f.ct_apellido, '')), ''),
             nullif(trim(coalesce(f.gcrudo ->> 'firstName', '') || ' ' || coalesce(f.gcrudo ->> 'lastName', '')), ''),
             f.gcrudo ->> 'contactName', cl.nombre, u.titulo, f.cid),
    coalesce(nullif(f.ct_telefono, ''), f.gcrudo ->> 'phone', cl.telefono_movil, cl.telefono),
    coalesce(nullif(f.ct_email, ''), f.gcrudo ->> 'email', cl.email),
    coalesce(nullif(f.ct_localidad, ''), f.gcrudo ->> 'city', cl.localidad),
    f.alta,
    f.calif,
    f.comercio,
    coalesce(f.etiquetas, '{}'::text[]),
    coalesce(f.visitas, 0),
    coalesce(nc.n, 0),
    f.primera, f.ultima,
    coalesce(u.vendedor, va.nombre, 'Sin asignar'),
    u.calendario,
    coalesce(pr.n, 0), pr.ultima, pr.total,
    coalesce(op.n, 0), op.ultimo_estado,
    cl.ns_id, cl.entity_id,
    jsonb_build_object('visitas', coalesce(f.visitas_lista, '[]'::jsonb),
                       'oportunidades', coalesce(op.lista, '[]'::jsonb),
                       'presupuestos', coalesce(pr.lista, '[]'::jsonb))
  from fila f
  left join ultima u on u.cid = f.cid
  left join vend va on va.id = f.asignado
  left join no_concretada nc on nc.cid = f.cid
  left join opp_c op on op.cid = f.cid
  left join pres_c pr on pr.cid = f.cid
  left join lateral (
    select c.ns_id, c.entity_id, c.nombre, c.telefono, c.telefono_movil, c.email, c.localidad
    from cli_cliente c
    where c.ghl_contact_id = f.cid and c.vigente
    order by c.ns_id
    limit 1
  ) cl on true
  where not coalesce(op.compro, false)
    and (f.visitas is not null or (f.consulto and f.calif = 'Calificado'))
  order by coalesce(f.ultima, f.alta) desc nulls last, f.cid;
end;
$$;

comment on function fn_cli_sin_compra(int) is
  'Contactos de GHL sin oportunidad de NetSuite ganada: con visita concretada (cualquier calificacion) o que consultaron calificados sin visita. Permiso: ver en clientes-segmentacion.';

revoke all on function fn_cli_sin_compra(int) from public, anon;
grant execute on function fn_cli_sin_compra(int) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Rangos cargados por el Informe MKT
-- ---------------------------------------------------------------------
create or replace function fn_cli_sin_compra_cobertura()
returns table (contactos_desde date, contactos_hasta date, visitas_desde date, visitas_hasta date, actualizado_en timestamptz)
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
  select min(d.dia), max(d.dia),
         min(d.dia) filter (where d.visitas_cargadas), max(d.dia) filter (where d.visitas_cargadas),
         max(d.actualizado_en)
  from informe_mkt_dia_cargado d;
end;
$$;

comment on function fn_cli_sin_compra_cobertura() is
  'Dias cargados por el Informe MKT: contactos (todos los dias cargados) y visitas (dias con visitas_cargadas). Permiso: ver en clientes-segmentacion.';

revoke all on function fn_cli_sin_compra_cobertura() from public, anon;
grant execute on function fn_cli_sin_compra_cobertura() to authenticated;

commit;

notify pgrst, 'reload schema';

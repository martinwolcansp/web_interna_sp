-- =====================================================================
-- Migracion 23 - Auditoria de la integracion NetSuite <-> GHL
-- (08 de octubre de 2026)
-- ---------------------------------------------------------------------
-- La seccion "Integracion NetSuite <-> GHL" suma la pestaña Auditoria, que
-- cruza lo que el Informe MKT ya carga todos los dias (corrida programada
-- de las 16 hs y boton "Actualizar"):
--   1. Contactos de GHL -> clientes potenciales de NetSuite (por
--      custentity_ghl_contact_id).
--   2. Oportunidades de NetSuite -> oportunidades de GHL (por el custom
--      field "NetSuite Opportunity ID").
--
--   informe_mkt_ns_cliente      (nueva) clientes de NetSuite que tienen el
--                               ID de algun contacto de GHL de la corrida, o
--                               que se crearon en el rango.
--   informe_mkt_ghl_contacto    + ns_verificado_en: cuando se busco por
--                               ultima vez su cliente en NetSuite. Los
--                               contactos cargados antes de esta migracion
--                               quedan en null ("sin verificar") hasta que
--                               una corrida vuelva a traerlos.
--
-- Lectura: ademas de 'ver' en informes-mkt (como el resto de las tablas
-- informe_mkt_*), 'ver' en integracion-ghl-ns para las tablas que usa la
-- auditoria. Las politicas son permisivas (se suman con "or"). Escritura:
-- igual que antes, 'editar' en informes-mkt (la hace el servicio
-- informe-mkt-api con el usuario que actualiza o el usuario tecnico).
--
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

create table if not exists informe_mkt_ns_cliente (
  id_interno      bigint primary key,
  id_cliente_crm  text,
  fecha_creacion  date,
  fila            jsonb not null,
  corrida_id      uuid references informe_mkt_corrida(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);
create index if not exists informe_mkt_ns_cliente_crm_idx on informe_mkt_ns_cliente (id_cliente_crm);
create index if not exists informe_mkt_ns_cliente_fecha_idx on informe_mkt_ns_cliente (fecha_creacion);

alter table informe_mkt_ghl_contacto add column if not exists ns_verificado_en timestamptz;

-- Indices para las consultas de la auditoria (por rango y por contacto).
create index if not exists informe_mkt_ghl_contacto_alta_idx on informe_mkt_ghl_contacto (date_added);
create index if not exists informe_mkt_ghl_oportunidad_contacto_idx on informe_mkt_ghl_oportunidad (contact_id);
create index if not exists informe_mkt_ns_oportunidad_fecha_idx on informe_mkt_ns_oportunidad (fecha_oportunidad);
create index if not exists informe_mkt_ns_oportunidad_crm_idx on informe_mkt_ns_oportunidad (id_cliente_crm);

-- ---------- RLS de la tabla nueva (mismo esquema que la migracion 22) ----------
alter table informe_mkt_ns_cliente enable row level security;

drop policy if exists "informe_mkt_ns_cliente: ver con permiso de seccion" on informe_mkt_ns_cliente;
create policy "informe_mkt_ns_cliente: ver con permiso de seccion" on informe_mkt_ns_cliente
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('informes-mkt', 'ver'));

drop policy if exists "informe_mkt_ns_cliente: crear con permiso de seccion" on informe_mkt_ns_cliente;
create policy "informe_mkt_ns_cliente: crear con permiso de seccion" on informe_mkt_ns_cliente
  for insert with check (fn_tiene_permiso('informes-mkt', 'editar'));

drop policy if exists "informe_mkt_ns_cliente: actualizar con permiso de seccion" on informe_mkt_ns_cliente;
create policy "informe_mkt_ns_cliente: actualizar con permiso de seccion" on informe_mkt_ns_cliente
  for update using (fn_tiene_permiso('informes-mkt', 'editar')) with check (fn_tiene_permiso('informes-mkt', 'editar'));

drop policy if exists "informe_mkt_ns_cliente: borrar con permiso de seccion" on informe_mkt_ns_cliente;
create policy "informe_mkt_ns_cliente: borrar con permiso de seccion" on informe_mkt_ns_cliente
  for delete using (fn_tiene_permiso('informes-mkt', 'editar'));

grant select, insert, update, delete on informe_mkt_ns_cliente to authenticated;

-- ---------- Lectura para la auditoria (permiso 'ver' en integracion-ghl-ns) ----------
do $$
declare t text;
begin
  foreach t in array array['informe_mkt_ns_cliente','informe_mkt_ns_oportunidad',
                           'informe_mkt_ghl_contacto','informe_mkt_ghl_oportunidad',
                           'informe_mkt_ghl_cita','informe_mkt_dia_cargado']
  loop
    execute format('drop policy if exists "%s: ver auditoria integracion" on %I', t, t);
    execute format('create policy "%s: ver auditoria integracion" on %I for select using (auth.role() = ''authenticated'' and fn_tiene_permiso(''integracion-ghl-ns'', ''ver''))', t, t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

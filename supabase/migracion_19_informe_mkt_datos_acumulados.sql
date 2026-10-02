-- =====================================================================
-- Migracion 19 - Informe MKT: datos acumulados para consultar cualquier rango
-- ---------------------------------------------------------------------
-- Cada actualizacion (boton "Actualizar") suma a estas tablas lo que trajo
-- de NetSuite y GHL. El informe se puede consultar despues por cualquier
-- rango Desde/Hasta dentro de lo cargado (ej. septiembre + octubre), sin
-- volver a llamar a NetSuite ni a GHL.
--
--   informe_mkt_ns_oportunidad  oportunidades de NetSuite (una fila por
--                               ID interno; la ultima actualizacion manda)
--   informe_mkt_ghl_contacto    contactos de GHL tal como los da la API
--   informe_mkt_ghl_oportunidad oportunidades de GHL tal como las da la API
--   informe_mkt_conversacion    campos de conversacion por contacto
--   informe_mkt_dia_cargado     que dias estan cargados y hasta que hora
--
-- Lectura: permiso 'ver' en informes-mkt. Escritura: 'editar'.
-- =====================================================================

create table if not exists informe_mkt_ns_oportunidad (
  id_interno         bigint primary key,
  fecha_oportunidad  date not null,
  id_cliente_crm     text,
  fila               jsonb not null,
  corrida_id         uuid references informe_mkt_corrida(id) on delete set null,
  actualizado_en     timestamptz not null default now()
);
create index if not exists informe_mkt_ns_oportunidad_fecha_idx on informe_mkt_ns_oportunidad (fecha_oportunidad);
create index if not exists informe_mkt_ns_oportunidad_crm_idx on informe_mkt_ns_oportunidad (id_cliente_crm);

create table if not exists informe_mkt_ghl_contacto (
  id              text primary key,
  date_added      timestamptz,
  crudo           jsonb not null,
  actualizado_en  timestamptz not null default now()
);
create index if not exists informe_mkt_ghl_contacto_alta_idx on informe_mkt_ghl_contacto (date_added);

create table if not exists informe_mkt_ghl_oportunidad (
  id              text primary key,
  contact_id      text,
  crudo           jsonb not null,
  actualizado_en  timestamptz not null default now()
);
create index if not exists informe_mkt_ghl_oportunidad_contacto_idx on informe_mkt_ghl_oportunidad (contact_id);

create table if not exists informe_mkt_conversacion (
  contact_id      text primary key,
  campos          jsonb not null,
  actualizado_en  timestamptz not null default now()
);

create table if not exists informe_mkt_dia_cargado (
  dia             date primary key,
  cargado_hasta   timestamptz not null,
  corrida_id      uuid references informe_mkt_corrida(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['informe_mkt_ns_oportunidad','informe_mkt_ghl_contacto',
                           'informe_mkt_ghl_oportunidad','informe_mkt_conversacion',
                           'informe_mkt_dia_cargado']
  loop
    execute format('alter table %I enable row level security', t);

    execute format('drop policy if exists "%s: ver con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: ver con permiso de seccion" on %I for select using (auth.role() = ''authenticated'' and fn_tiene_permiso(''informes-mkt'', ''ver''))', t, t);

    execute format('drop policy if exists "%s: crear con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: crear con permiso de seccion" on %I for insert with check (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('drop policy if exists "%s: actualizar con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: actualizar con permiso de seccion" on %I for update using (fn_tiene_permiso(''informes-mkt'', ''editar'')) with check (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('drop policy if exists "%s: borrar con permiso de seccion" on %I', t, t);
    execute format('create policy "%s: borrar con permiso de seccion" on %I for delete using (fn_tiene_permiso(''informes-mkt'', ''editar''))', t, t);

    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- =====================================================================
-- Migracion 22 - Informe MKT: visitas (citas de GHL) y presupuestos (NetSuite)
-- ---------------------------------------------------------------------
-- Para la tabla "Visitas y presupuestos por vendedor" del Informe por
-- vendedor (08/10/2026). Igual que la migracion 19: cada actualizacion suma
-- lo que trajo y el informe se puede consultar por cualquier rango.
--
--   informe_mkt_ghl_cita        citas de los calendarios de GHL (una fila por
--                               cita; la ultima actualizacion manda)
--   informe_mkt_ns_presupuesto  presupuestos (Estimate) de NetSuite
--   informe_mkt_dia_cargado     + visitas_cargadas: los dias cargados antes
--                               de este cambio no tienen citas ni presupuestos
--
-- Lectura: permiso 'ver' en informes-mkt. Escritura: 'editar'.
-- =====================================================================

create table if not exists informe_mkt_ghl_cita (
  id              text primary key,
  contact_id      text,
  inicio          timestamptz not null,
  estado          text,
  crudo           jsonb not null,
  corrida_id      uuid references informe_mkt_corrida(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);
create index if not exists informe_mkt_ghl_cita_inicio_idx on informe_mkt_ghl_cita (inicio);
create index if not exists informe_mkt_ghl_cita_contacto_idx on informe_mkt_ghl_cita (contact_id);

create table if not exists informe_mkt_ns_presupuesto (
  id_interno      bigint primary key,
  fecha           date not null,
  id_cliente_crm  text,
  fila            jsonb not null,
  corrida_id      uuid references informe_mkt_corrida(id) on delete set null,
  actualizado_en  timestamptz not null default now()
);
create index if not exists informe_mkt_ns_presupuesto_fecha_idx on informe_mkt_ns_presupuesto (fecha);
create index if not exists informe_mkt_ns_presupuesto_crm_idx on informe_mkt_ns_presupuesto (id_cliente_crm);

alter table informe_mkt_dia_cargado add column if not exists visitas_cargadas boolean not null default false;

-- ---------- RLS ----------
do $$
declare t text;
begin
  foreach t in array array['informe_mkt_ghl_cita','informe_mkt_ns_presupuesto']
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

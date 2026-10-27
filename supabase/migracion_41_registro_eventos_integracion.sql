-- =====================================================================
-- Migracion 41 - Registro de eventos de la integracion NetSuite <-> GHL
-- (27 de octubre de 2026)
-- ---------------------------------------------------------------------
-- Parte III del documento de Definiciones v2, fase 1: cada llamada que
-- reciben los tres servicios de la integracion (Etapa 1 Lead, Etapa 2
-- Oportunidad, Etapa 3 Presupuesto) queda registrada en una fila de
-- integration_events. De esa tabla se alimenta la pestaña "En vivo" de la
-- seccion Integracion NetSuite <-> GHL.
--
--   integration_events   una fila por evento. Solo se agregan filas:
--                        no hay politicas de update ni delete.
--   integracion_estado   valores de estado de la integracion (clave/valor).
--                        Hoy: 'netsuite_refresh_token' con el vencimiento
--                        del refresh token de NetSuite (Etapa 1).
--
-- Quien escribe: los servicios, con el usuario tecnico (el mismo del
-- Informe MKT) y permiso 'editar' en integracion-ghl-ns.
-- Quien lee: cualquier usuario con 'ver' en integracion-ghl-ns.
--
-- Las politicas evaluan el permiso una sola vez por consulta (select ...),
-- igual que la migracion 40.
--
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

-- ---------- Eventos ----------
create table if not exists integration_events (
  id             bigserial primary key,
  recibido_en    timestamptz not null default now(),
  etapa          text not null,   -- lead | oportunidad | presupuesto | sistema
  origen         text not null,   -- ghl | netsuite | local | servicio
  referencia_id  text,            -- ID del objeto en el sistema de origen
  resultado      text not null,   -- created | updated | skipped | already_exists |
                                  -- already_updated | simulado | error | rechazado | aviso
  detalle        text,
  payload        jsonb,           -- lo que llego al servicio
  respuesta      jsonb,           -- lo que respondio el servicio
  duracion_ms    integer
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'integration_events_etapa_check') then
    alter table integration_events add constraint integration_events_etapa_check
      check (etapa in ('lead', 'oportunidad', 'presupuesto', 'sistema'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'integration_events_origen_check') then
    alter table integration_events add constraint integration_events_origen_check
      check (origen in ('ghl', 'netsuite', 'local', 'servicio'));
  end if;
end $$;

create index if not exists integration_events_recibido_idx on integration_events (recibido_en desc);
create index if not exists integration_events_ref_idx on integration_events (etapa, referencia_id);
create index if not exists integration_events_resultado_idx on integration_events (resultado);

comment on table integration_events is 'Un evento por llamada recibida por los servicios de la integracion NetSuite <-> GHL. Solo insercion. Lo lee la pestaña En vivo.';

alter table integration_events enable row level security;

drop policy if exists "integration_events: ver con permiso de seccion" on integration_events;
create policy "integration_events: ver con permiso de seccion" on integration_events
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('integracion-ghl-ns', 'ver')));

drop policy if exists "integration_events: registrar con permiso de seccion" on integration_events;
create policy "integration_events: registrar con permiso de seccion" on integration_events
  for insert with check ((select fn_tiene_permiso('integracion-ghl-ns', 'editar')));

grant select, insert on integration_events to authenticated;
grant usage, select on sequence integration_events_id_seq to authenticated;

-- ---------- Estado de la integracion ----------
create table if not exists integracion_estado (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now()
);

comment on table integracion_estado is 'Estado de la integracion NetSuite <-> GHL (clave/valor). netsuite_refresh_token = vencimiento del refresh token de la Etapa 1.';

alter table integracion_estado enable row level security;

drop policy if exists "integracion_estado: ver con permiso de seccion" on integracion_estado;
create policy "integracion_estado: ver con permiso de seccion" on integracion_estado
  for select using ((select auth.role()) = 'authenticated' and (select fn_tiene_permiso('integracion-ghl-ns', 'ver')));

drop policy if exists "integracion_estado: escribir con permiso de seccion" on integracion_estado;
create policy "integracion_estado: escribir con permiso de seccion" on integracion_estado
  for all using ((select fn_tiene_permiso('integracion-ghl-ns', 'editar')))
  with check ((select fn_tiene_permiso('integracion-ghl-ns', 'editar')));

grant select, insert, update on integracion_estado to authenticated;

commit;

notify pgrst, 'reload schema';

-- Verificacion (opcional, correr aparte):
-- select etapa, resultado, count(*) from integration_events group by 1, 2 order by 1, 2;
-- select * from integracion_estado;

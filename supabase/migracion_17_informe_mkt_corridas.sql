-- =====================================================================
-- migracion_17_informe_mkt_corridas.sql
-- Informe MKT actualizable desde la web (boton "Actualizar" + rango
-- Desde/Hasta). Cada vez que alguien actualiza, el servicio informe-mkt-api
-- guarda una "corrida" con el panel Resumen ejecutivo ya calculado y el
-- arreglo CONTACTS. La pagina pages/informes-mkt/actualizable.html muestra
-- la ultima corrida OK. Las corridas anteriores quedan como historial (no
-- se pisan), porque las oportunidades abiertas cambian de un dia al otro.
--
-- Permisos (mismo esquema que el resto del sitio, fn_tiene_permiso):
--   ver    informes-mkt -> leer corridas
--   editar informes-mkt -> crear/actualizar corridas (apretar el boton)
-- =====================================================================

begin;

create table if not exists informe_mkt_corrida (
  id                  uuid primary key default gen_random_uuid(),
  estado              text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  desde               date not null,
  hasta               date not null,
  paso                text,
  mensaje             text,
  datos_hasta         timestamptz,
  stats               jsonb not null default '{}'::jsonb,
  panel_resumen_html  text,
  contacts            jsonb,
  log                 text,
  iniciado_por        uuid default auth.uid(),
  iniciado_en         timestamptz not null default now(),
  finalizado_en       timestamptz,
  constraint informe_mkt_corrida_rango check (desde <= hasta)
);

comment on table informe_mkt_corrida is 'Corridas de actualizacion del Informe MKT disparadas desde la web (informe-mkt-api). La pagina muestra la ultima con estado ok.';
comment on column informe_mkt_corrida.datos_hasta is 'Hasta cuando estan actualizados los datos: el momento de la corrida si hasta = hoy, o el fin del dia "hasta" si el rango termina antes.';
comment on column informe_mkt_corrida.contacts is 'Arreglo CONTACTS que consume el renderizador del informe (mismo formato que el bloque contacts-data de los HTML mensuales).';

-- Una sola corrida en curso a la vez (el servicio responde 409 si ya hay una).
create unique index if not exists informe_mkt_corrida_una_en_curso
  on informe_mkt_corrida ((true)) where estado = 'en_curso';

create index if not exists informe_mkt_corrida_estado_fin
  on informe_mkt_corrida (estado, finalizado_en desc);

alter table informe_mkt_corrida enable row level security;

drop policy if exists "informe_mkt_corrida: ver con permiso de seccion" on informe_mkt_corrida;
create policy "informe_mkt_corrida: ver con permiso de seccion" on informe_mkt_corrida
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('informes-mkt', 'ver'));

drop policy if exists "informe_mkt_corrida: crear con permiso de seccion" on informe_mkt_corrida;
create policy "informe_mkt_corrida: crear con permiso de seccion" on informe_mkt_corrida
  for insert with check (fn_tiene_permiso('informes-mkt', 'editar'));

drop policy if exists "informe_mkt_corrida: actualizar con permiso de seccion" on informe_mkt_corrida;
create policy "informe_mkt_corrida: actualizar con permiso de seccion" on informe_mkt_corrida
  for update using (fn_tiene_permiso('informes-mkt', 'editar'))
  with check (fn_tiene_permiso('informes-mkt', 'editar'));

grant select, insert, update on informe_mkt_corrida to authenticated;

commit;

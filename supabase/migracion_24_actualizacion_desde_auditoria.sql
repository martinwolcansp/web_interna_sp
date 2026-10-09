-- =====================================================================
-- Migracion 24 - Actualizacion desde la Auditoria de la integracion
-- (09 de octubre de 2026)
-- ---------------------------------------------------------------------
-- El boton "Auditar" de la seccion Integracion NetSuite <-> GHL actualiza
-- el mes en curso con su propio permiso ('editar' en integracion-ghl-ns),
-- separado del de Informes de MKT. El servicio informe-mkt-api
-- (POST /auditoria/actualizar) valida ese permiso y corre la actualizacion
-- con el usuario tecnico (el mismo de la corrida programada), asi que las
-- politicas de escritura de las tablas informe_mkt_* no cambian.
--
--   informe_mkt_corrida.origen          + 'auditoria'
--   informe_mkt_corrida.solicitado_por  (nueva) email de quien apreto
--                                       Auditar (iniciado_por queda con el
--                                       usuario tecnico)
--   lectura de informe_mkt_corrida con 'ver' en integracion-ghl-ns, para
--   que la Auditoria muestre el avance de la actualizacion.
--
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

alter table informe_mkt_corrida
  drop constraint if exists informe_mkt_corrida_origen;
alter table informe_mkt_corrida
  add constraint informe_mkt_corrida_origen check (origen in ('manual', 'automatica', 'auditoria'));

comment on column informe_mkt_corrida.origen is 'manual = boton Actualizar de Informes de MKT; automatica = tarea programada de Coolify (app.corrida_programada); auditoria = boton Auditar de Integracion NetSuite <-> GHL (corre con el usuario tecnico).';

alter table informe_mkt_corrida
  add column if not exists solicitado_por text;

comment on column informe_mkt_corrida.solicitado_por is 'Email de quien pidio la actualizacion cuando corre con el usuario tecnico (origen auditoria).';

drop policy if exists "informe_mkt_corrida: ver auditoria integracion" on informe_mkt_corrida;
create policy "informe_mkt_corrida: ver auditoria integracion" on informe_mkt_corrida
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('integracion-ghl-ns', 'ver'));

commit;

notify pgrst, 'reload schema';

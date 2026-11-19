-- =====================================================================
-- migracion_53_oportunidad_estado_abandoned.sql
-- Oportunidades de GHL con estado "abandoned" (19 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- GHL tiene cuatro estados de oportunidad: open, won, lost y abandoned. La
-- tabla oportunidad (migracion 10) solo admitia los tres primeros, y la
-- actualizacion del Informe MKT fallo al cargar una oportunidad marcada como
-- abandonada en GHL:
--   violates check constraint "oportunidad_estado_check" (23514)
-- Se agrega 'abandoned' (en la web: "Abandonada").
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

alter table oportunidad drop constraint if exists oportunidad_estado_check;
alter table oportunidad add constraint oportunidad_estado_check
  check (estado in ('open', 'won', 'lost', 'abandoned'));

commit;

notify pgrst, 'reload schema';

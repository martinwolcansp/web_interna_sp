-- =====================================================================
-- Migracion 20 - Informe MKT: origen de cada corrida
-- ---------------------------------------------------------------------
-- Ademas del boton "Actualizar" (manual), el servicio informe-mkt-api
-- corre una actualizacion automatica de lunes a viernes a las 16 hs
-- (tarea programada de Coolify: python -m app.corrida_programada).
-- La columna origen permite distinguirlas en "Actualizaciones anteriores".
-- Las corridas existentes quedan como 'manual'.
-- =====================================================================

begin;

alter table informe_mkt_corrida
  add column if not exists origen text not null default 'manual';

alter table informe_mkt_corrida
  drop constraint if exists informe_mkt_corrida_origen;
alter table informe_mkt_corrida
  add constraint informe_mkt_corrida_origen check (origen in ('manual', 'automatica'));

comment on column informe_mkt_corrida.origen is 'manual = boton Actualizar de la web; automatica = tarea programada de Coolify (app.corrida_programada).';

commit;

notify pgrst, 'reload schema';

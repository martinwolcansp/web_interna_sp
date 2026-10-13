-- =====================================================================
-- migracion_27_indicadores_ov_comodato_unidad.sql
-- Indicadores de Instalaciones: facturación separada en Venta / Comodato
-- y por unidad comercial.
--
-- ind_caso_ov suma:
--   es_comodato       custbody_3k_comodato de la OV (T = comodato)
--   unidad_comercial  custbody_mw_sp_unidad_comercial: de la OV; si no
--                     tiene, del presupuesto de origen; si no, de la
--                     oportunidad (del presupuesto o de la OV)
--   presupuesto       presupuesto de origen (custbody_3k_trans_orig_ov)
--
-- Después de correrla y desplegar indicadores-api, tocar "Actualizar
-- ahora" en Instalaciones para que se completen las columnas.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_caso_ov
  add column if not exists es_comodato      boolean not null default false,
  add column if not exists unidad_comercial text,
  add column if not exists presupuesto      text;

comment on column ind_caso_ov.es_comodato is 'custbody_3k_comodato de la OV.';
comment on column ind_caso_ov.unidad_comercial is
  'custbody_mw_sp_unidad_comercial de la OV, o del presupuesto de origen, o de la oportunidad.';
comment on column ind_caso_ov.presupuesto is 'Presupuesto de origen de la OV (custbody_3k_trans_orig_ov).';

commit;

notify pgrst, 'reload schema';

-- =====================================================================
-- migracion_25_posventa_relevamiento_ghl.sql
-- Indicadores de Posventa: ID de contacto de GHL en los relevamientos.
--
-- El servicio indicadores-api toma custentity_ghl_contact_id del cliente
-- del caso (o de su cliente padre si el subcliente no lo tiene). La
-- página cruza ese ID con ind_posventa_encuesta.contact_id para mostrar,
-- en el detalle de encuestas, la acción de posventa que respondió a una
-- encuesta negativa o a un pedido de llamado.
--
-- Después de correrla, tocar "Actualizar ahora" en la página para que se
-- complete la columna nueva.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_posventa_relevamiento
  add column if not exists id_cliente_ghl text;

comment on column ind_posventa_relevamiento.id_cliente_ghl is
  'custentity_ghl_contact_id del cliente del caso (o de su padre). Cruza con ind_posventa_encuesta.contact_id.';

create index if not exists ind_posventa_relev_ghl on ind_posventa_relevamiento (id_cliente_ghl);

commit;

notify pgrst, 'reload schema';

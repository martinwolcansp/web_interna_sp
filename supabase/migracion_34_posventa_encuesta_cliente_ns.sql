-- =====================================================================
-- migracion_34_posventa_encuesta_cliente_ns.sql
-- Indicadores de Posventa: cliente de NetSuite de cada encuesta.
--
-- El servicio indicadores-api busca el cliente cuyo
-- custentity_ghl_contact_id es el contact_id de la encuesta. Si el ID
-- está en más de un cliente se guarda el padre (o el primero) y la
-- cantidad en cliente_ns_cant.
--
-- Después de correrla, redesplegar indicadores-api y tocar
-- "Actualizar ahora" en la página.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_posventa_encuesta
  add column if not exists cliente_ns_id     bigint,
  add column if not exists cliente_ns        text,
  add column if not exists cliente_ns_nombre text,
  add column if not exists cliente_ns_cant   integer not null default 0;

comment on column ind_posventa_encuesta.cliente_ns_id is 'Id interno del cliente de NetSuite con custentity_ghl_contact_id = contact_id.';
comment on column ind_posventa_encuesta.cliente_ns is 'Número de cliente de NetSuite (entityid, ej. C18456).';
comment on column ind_posventa_encuesta.cliente_ns_cant is 'Cantidad de clientes de NetSuite con ese ID de GHL (más de 1 = duplicado).';

commit;

notify pgrst, 'reload schema';

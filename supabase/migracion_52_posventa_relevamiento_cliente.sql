-- =====================================================================
-- migracion_52_posventa_relevamiento_cliente.sql
-- Indicadores de Posventa: cliente de cada relevamiento.
--
-- En NetSuite se agregó al relevamiento posventa el campo
-- custrecord_sp_relev_cliente (Cliente). Si el relevamiento tiene caso,
-- el servicio indicadores-api sigue tomando el cliente del caso; si no
-- tiene caso, toma el de ese campo. Empresa, nro de cuenta y contacto de
-- GHL salen del mismo cliente.
--
-- cliente_origen: 'caso' o 'relevamiento' (de dónde salió el cliente).
--
-- Después de correrla, tocar "Actualizar ahora" en la página.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_posventa_relevamiento
  add column if not exists cliente_id     bigint,
  add column if not exists cliente_origen text;

comment on column ind_posventa_relevamiento.cliente_id is
  'ID interno del cliente: el del caso o, sin caso, custrecord_sp_relev_cliente del relevamiento.';
comment on column ind_posventa_relevamiento.cliente_origen is
  'De dónde salió el cliente: caso / relevamiento.';

create index if not exists ind_posventa_relev_cliente on ind_posventa_relevamiento (cliente_id);

commit;

notify pgrst, 'reload schema';

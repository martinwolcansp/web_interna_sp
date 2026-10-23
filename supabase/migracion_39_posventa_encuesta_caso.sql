-- =====================================================================
-- migracion_39_posventa_encuesta_caso.sql
-- Indicadores de Posventa: caso de instalación de cada encuesta.
--
-- El servicio indicadores-api toma, entre los casos del cliente asignados
-- al Jefe de Instalaciones - Alarmas Nuevas, el más reciente creado hasta
-- la fecha de la encuesta (si no hay, el más reciente). La página busca la
-- acción de posventa (relevamiento "Comunicación Cliente") en ese caso.
--
-- Después de correrla, redesplegar indicadores-api y tocar
-- "Actualizar ahora" en la página.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table ind_posventa_encuesta
  add column if not exists caso_ns_id    bigint,
  add column if not exists caso_ns       text,
  add column if not exists caso_ns_fecha date,
  add column if not exists caso_ns_cant  integer not null default 0;

comment on column ind_posventa_encuesta.caso_ns_id is 'Caso de instalación (supportcase) de la encuesta: el más reciente del cliente asignado al Jefe de Instalaciones - Alarmas Nuevas.';
comment on column ind_posventa_encuesta.caso_ns is 'Número del caso (CAS_xxxxx).';
comment on column ind_posventa_encuesta.caso_ns_cant is 'Cantidad de casos de instalación del cliente.';

commit;

notify pgrst, 'reload schema';

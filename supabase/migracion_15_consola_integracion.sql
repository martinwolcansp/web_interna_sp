-- =========================================================================
-- Migración 15 — Consola de la sección "Integración NetSuite ↔ GHL"
-- (23 de septiembre de 2026)
--
-- Contexto: Definiciones_Migracion_Integracion_NS_GHL.docx (v2). La
-- sección deja de ser la carga manual de la prueba piloto y pasa a ser
-- la consola de consulta de la integración. Para eso hace falta saber
-- de dónde vino cada registro: los que llegan desde GHL (carga
-- histórica / Informe MKT, y más adelante los webhooks) o desde
-- NetSuite se muestran de sólo lectura; sólo los cargados a mano en el
-- sitio ("local") se pueden editar o borrar.
--
-- Se usa la columna origen_ultimo_cambio que ya estaba prevista para la
-- Parte IV del documento de definiciones, en vez de crear otra.
--
-- Valores iniciales para las filas que ya existen:
--   - contacto: 'ghl' si vino de la carga de GHL (tiene
--     fecha_actualizacion_ghl, que el formulario del sitio nunca
--     completa) o si es un contacto "stub" reconstruido por
--     generar_sql.py (sync_mensaje 'Reconstruido desde datos
--     embebidos...'). El resto, 'local'.
--   - oportunidad: 'ghl' si tiene fecha_actualizacion_ghl. El resto,
--     'local'.
--
-- La restricción de edición es sólo de la interfaz, a propósito: las
-- políticas RLS no cambian, porque los servicios de la integración van
-- a escribir filas 'ghl'/'netsuite' con un usuario con permiso
-- 'editar' (Parte III del documento de definiciones).
--
-- Segura de correr más de una vez. Los valores iniciales sólo se
-- asignan a filas que todavía no tienen origen.
-- =========================================================================

begin;

alter table contacto
  add column if not exists origen_ultimo_cambio text;
alter table oportunidad
  add column if not exists origen_ultimo_cambio text;

-- Valores iniciales (sólo filas sin origen asignado).
update contacto
set origen_ultimo_cambio = case
  when fecha_actualizacion_ghl is not null then 'ghl'
  when sync_mensaje like 'Reconstruido desde datos embebidos%' then 'ghl'
  else 'local'
end
where origen_ultimo_cambio is null;

update oportunidad
set origen_ultimo_cambio = case
  when fecha_actualizacion_ghl is not null then 'ghl'
  else 'local'
end
where origen_ultimo_cambio is null;

-- Default y restricciones después de asignar los valores iniciales.
alter table contacto
  alter column origen_ultimo_cambio set default 'local',
  alter column origen_ultimo_cambio set not null;
alter table oportunidad
  alter column origen_ultimo_cambio set default 'local',
  alter column origen_ultimo_cambio set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacto_origen_ultimo_cambio_check') then
    alter table contacto add constraint contacto_origen_ultimo_cambio_check
      check (origen_ultimo_cambio in ('ghl', 'netsuite', 'local'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'oportunidad_origen_ultimo_cambio_check') then
    alter table oportunidad add constraint oportunidad_origen_ultimo_cambio_check
      check (origen_ultimo_cambio in ('ghl', 'netsuite', 'local'));
  end if;
end $$;

comment on column contacto.origen_ultimo_cambio is 'Sistema que escribió el registro por última vez: ghl | netsuite | local (sitio interno). La consola sólo permite editar/borrar los "local".';
comment on column oportunidad.origen_ultimo_cambio is 'Sistema que escribió el registro por última vez: ghl | netsuite | local (sitio interno). La consola sólo permite editar/borrar los "local".';

-- Índices para el orden y los filtros de la consola (paginación del
-- lado del servidor).
create index if not exists contacto_fecha_creacion_ghl_idx on contacto (fecha_creacion_ghl desc nulls last);
create index if not exists oportunidad_fecha_creacion_ghl_idx on oportunidad (fecha_creacion_ghl desc nulls last);
create index if not exists oportunidad_contacto_id_idx on oportunidad (contacto_id);

commit;

-- Verificación (opcional, correr aparte):
-- select 'contacto' as tabla, origen_ultimo_cambio, count(*) from contacto group by 2
-- union all
-- select 'oportunidad', origen_ultimo_cambio, count(*) from oportunidad group by 2;

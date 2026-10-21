-- =====================================================================
-- migracion_36_indicadores_ampliaciones.sql
-- Indicadores por Área: tercera área, Ampliaciones.
--
-- Ampliaciones usa la misma búsqueda de casos (2560) con otro asignado
-- (232, Jefe de Instalaciones - Alarmas Ampliaciones). Sus casos, OV y
-- artículos van a las mismas tablas comunes, separados por la columna
-- alcance:
--
--   alcance = 'instalaciones'  asignado 133 (Posventa e Instalaciones)
--   alcance = 'ampliaciones'   asignado 232 (Ampliaciones)
--
-- Cada corrida borra sólo las filas de su alcance que ya no vinieron, así
-- un área no pisa a la otra. Las filas existentes quedan como
-- 'instalaciones' (todas son del asignado 133).
--
-- Columnas nuevas en ind_caso_instalacion (del presupuesto de origen; las
-- completa cualquier área en su próxima actualización):
--   unidad_negocio     class: "Alarmas : Ampliaciones", "Alarmas : Comunicaciones"...
--   tipo_comunicacion  custbody_3k_tipo_comunicacion: Radio, Telefono...
--
-- ORDEN DE DESPLIEGUE: correr esta migración, desplegar indicadores-api y
-- las páginas (posventa.html e instalaciones.html ya filtran por alcance) y
-- recién después actualizar Ampliaciones. Un indicadores-api anterior a este
-- cambio borraría los casos de Ampliaciones al actualizar Instalaciones.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Sección de permisos de Ampliaciones
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('indicadores-ampliaciones', 'Indicadores - Ampliaciones', 'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Alcance en las tablas comunes de casos
-- ---------------------------------------------------------------------
alter table ind_caso_instalacion
  add column if not exists alcance            text not null default 'instalaciones',
  add column if not exists unidad_negocio     text,
  add column if not exists tipo_comunicacion  text;
alter table ind_caso_ov
  add column if not exists alcance text not null default 'instalaciones';
alter table ind_caso_ov_linea
  add column if not exists alcance text not null default 'instalaciones';

comment on column ind_caso_instalacion.alcance is
  'Asignado de la búsqueda 2560 que trajo el caso: instalaciones (133, Posventa e Instalaciones) o ampliaciones (232). Cada área borra sólo su alcance.';
comment on column ind_caso_instalacion.unidad_negocio is
  'Unidad de negocio (class) del presupuesto de origen, si no de la oportunidad, si no de la OV de productos.';
comment on column ind_caso_instalacion.tipo_comunicacion is
  'custbody_3k_tipo_comunicacion del presupuesto de origen, si no de la oportunidad, si no de la OV.';
comment on column ind_caso_ov.alcance is 'Alcance del caso (ver ind_caso_instalacion.alcance).';
comment on column ind_caso_ov_linea.alcance is 'Alcance del caso (ver ind_caso_instalacion.alcance).';

create index if not exists ind_caso_instalacion_alcance on ind_caso_instalacion (alcance);
create index if not exists ind_caso_ov_alcance          on ind_caso_ov (alcance);
create index if not exists ind_caso_ov_linea_alcance    on ind_caso_ov_linea (alcance);

-- ---------------------------------------------------------------------
-- 3. Tablas comunes que usa Ampliaciones (permisos por ind_tabla_area)
-- ---------------------------------------------------------------------
insert into ind_tabla_area (tabla, area) values
  ('ind_caso_instalacion',           'ampliaciones'),
  ('ind_caso_ov',                    'ampliaciones'),
  ('ind_caso_ov_linea',              'ampliaciones'),
  ('ind_equivalencia_tipo_proyecto', 'ampliaciones')
on conflict do nothing;

commit;

notify pgrst, 'reload schema';

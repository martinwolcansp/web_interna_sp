-- =====================================================================
-- migracion_30_comisiones_unidad_comisiona.sql
-- Comisiones por vendedor: casilla "Comisiona" en las unidades (19/10/2026).
--
-- Requiere migracion_29_comisiones_unidades.sql.
--
-- comision_unidad.comisiona (por defecto true). Con false la unidad queda
-- cargada con sus abonos, pero esos abonos no suman a la base comisionable
-- ni generan comisión (se ven como "no comisiona" en el pop up y en las
-- liquidaciones, y su importe va a "Otros ABO").
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

alter table comision_unidad
  add column if not exists comisiona boolean not null default true;

comment on column comision_unidad.comisiona is
  'false = la unidad queda cargada pero sus abonos no suman a la base comisionable ni comisionan.';

commit;

-- Verificación:
-- select nombre, incluido_desde, comisiona from comision_unidad order by nombre;

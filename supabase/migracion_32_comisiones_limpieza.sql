-- =====================================================================
-- migracion_32_comisiones_limpieza.sql
-- Comisiones: limpieza de lo que dejó de usarse con el modelo de fondo comisionable
-- (19/10/2026).
--
-- Requiere la migración 31 y que NO queden liquidaciones del modelo
-- anterior (modelo = 'vendedor'): si hay alguna, la migración se detiene
-- sin cambiar nada. Eliminalas desde Panel → Comisiones → Liquidaciones y
-- generalas de nuevo con el modelo de fondo comisionable antes de correrla.
--
-- Borra:
--   - comision_abono.incluido, su trigger y su función (alcanza con
--     unidad_id), y comision_abono.incluido_desde (sin uso desde la 29).
--   - comision_liquidacion_vendedor.por_abono (detalle por abono).
--   - comision_liquidacion_linea.orden, incluido_desde, comisiona y
--     comision (cálculo por vendedor; ahora la línea guarda unidad, factor
--     y aporte al fondo).
--
-- Después de correrla, la migración 28 ya no se puede volver a correr
-- (su carga inicial usa las columnas borradas). Segura de correr más de
-- una vez.
-- =====================================================================

begin;

do $$
declare
  n integer;
begin
  select count(*) into n from comision_liquidacion where modelo <> 'fondo';
  if n > 0 then
    raise exception 'Hay % liquidación(es) del modelo anterior. Eliminalas y generalas de nuevo antes de correr esta migración.', n;
  end if;
end;
$$;

drop trigger if exists trg_comision_abono_incluido on comision_abono;
drop function if exists fn_comision_abono_incluido();

alter table comision_abono
  drop column if exists incluido,
  drop column if exists incluido_desde;
comment on column comision_abono.unidad_id is 'Unidad de comisión del abono. Sin unidad = no incluido (no suma).';

alter table comision_liquidacion_vendedor
  drop column if exists por_abono;

alter table comision_liquidacion_linea
  drop column if exists orden,
  drop column if exists incluido_desde,
  drop column if exists comisiona,
  drop column if exists comision;

commit;

notify pgrst, 'reload schema';

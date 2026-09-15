-- Permisos reales por área — séptima etapa.
--
-- Alta de acceso de "Ver" al nuevo mosaico "Permisos por Área"
-- (permisos-area, ver migracion_11_seccion_permisos_area.sql) para
-- Gerencia General, además de superadmin (que ya tiene acceso total sin
-- necesitar fila acá). Decisión de Martin, 2026-09-15: por ahora sólo
-- superadmin + gerencia-general ven la matriz completa; sumar otra área
-- más adelante es una fila más acá, igual que siempre.
--
-- Requiere haber corrido antes migracion_11_seccion_permisos_area.sql (da
-- de alta la sección 'permisos-area' en la tabla secciones; sin eso este
-- insert falla por la foreign key).
--
-- Seguro de correr más de una vez (on conflict do nothing).
--
-- Nota: si querés que esto también quede reflejado en
-- Permisos_por_Area_WebInternaSP.xlsx (columna nueva "Permisos por Área",
-- fila gerencia-general = Ver), es un ajuste manual del Excel por ahora --
-- todavía no existe el export automático que lo genere solo.

begin;

insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso) values
  ('gerencia-general', 'permisos-area', 'ver')
on conflict (area_id, seccion_id, nivel_acceso) do nothing;

commit;

-- =====================================================================
-- migracion_56_bykom_exports_borrar.sql
-- Pestaña "Clientes activos + contactos" (25 de noviembre de 2026)
-- ---------------------------------------------------------------------
-- clientes-api conserva en Storage los ultimos CARGAS_A_CONSERVAR respaldos
-- de ByKom (20 por defecto) y borra los mas viejos con el token del usuario
-- que sube el archivo. Hace falta la politica de borrado en el bucket.
-- La fila de cnt_carga queda (con ruta = null).
--
-- Segura de correr mas de una vez.
-- =====================================================================

begin;

drop policy if exists "bykom-exports: borrar" on storage.objects;
create policy "bykom-exports: borrar" on storage.objects
  for delete using (bucket_id = 'bykom-exports' and (select fn_tiene_permiso('clientes-contactos', 'editar')));

commit;

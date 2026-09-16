-- =========================================================================
-- Migración 13 — Cierra el acceso de lectura abierto que tenía
-- permisos_area_seccion.
--
-- Contexto: la política original ("permisos: lectura autenticados",
-- schema.sql) dejaba leer la tabla completa a CUALQUIER usuario
-- autenticado, sin importar su área -- pensada en su momento para que el
-- frontend pudiera resolver permisos sin fricción, igual que areas/
-- secciones (esas sí son catálogos inofensivos). Quedó anotado como
-- pendiente en migracion_11_seccion_permisos_area.sql cuando se construyó
-- fn_matriz_permisos(): esa función ya está bien cerrada (repite el
-- chequeo adentro), pero la tabla de fondo seguía abierta -- cualquiera
-- con sesión podía consultar permisos_area_seccion directo por la API de
-- Supabase (ej. desde la consola del navegador) y ver la matriz completa,
-- aunque no tuviera acceso a la pantalla "Permisos por Área".
--
-- Verificado antes de aplicar (2026-09-16): ningún archivo .js del sitio
-- lee "permisos_area_seccion" directo -- todos pasan por RPCs
-- (fn_tiene_permiso, fn_mis_secciones_visibles/editables,
-- fn_matriz_permisos). Repetir esta verificación si en el futuro se
-- agrega alguna pantalla nueva que consulte esta tabla sin pasar por una
-- RPC: dejaría de funcionar después de esta migración.
--
-- Por qué es seguro usar fn_tiene_permiso() como condición de la propia
-- política de "permisos_area_seccion": es security definer, así que su
-- consulta interna a esa misma tabla no vuelve a evaluar RLS (mismo
-- mecanismo que ya usa fn_es_superadmin para evitar la recursión en
-- "perfiles", y el mismo fn_tiene_permiso ya se usa hoy como condición de
-- policies en fichas/ficha_versiones/contacto/oportunidad/novedades sin
-- problema). Para un usuario sin sesión (anon), auth.uid() es null, así
-- que las dos ramas de fn_tiene_permiso() dan false solas -- no hace
-- falta repetir el chequeo de auth.role() = 'authenticated' acá.
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
-- schema.sql queda actualizado con esta misma política para instalaciones
-- nuevas.
-- =========================================================================

begin;

drop policy if exists "permisos: lectura autenticados" on permisos_area_seccion;

create policy "permisos: lectura segun permiso de permisos-area" on permisos_area_seccion
  for select using (fn_tiene_permiso('permisos-area', 'ver'));

commit;

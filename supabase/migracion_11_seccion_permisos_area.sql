-- =========================================================================
-- Migración 11 — Sección "Permisos por Área": mosaico de solo lectura que
-- muestra la matriz área × sección tal como está hoy en
-- permisos_area_seccion, para no tener que abrir
-- Permisos_por_Area_WebInternaSP.xlsx sólo para consultar el estado
-- actual. El Excel sigue siendo, por ahora, la forma de EDITAR permisos en
-- lote (import/export automático: todavía no implementado, próxima
-- etapa).
--
-- Para bases YA desplegadas. Segura de correr más de una vez.
-- seed_secciones.sql queda actualizado con esta misma fila para
-- instalaciones nuevas.
--
-- Esto sólo da de alta la sección y la función de lectura: NO otorga
-- acceso a nadie todavía (ni siquiera Gerencia General). Ver
-- permisos_area_seccion_v7.sql para el alta de permisos.
--
-- Nota de seguridad -- las tablas "areas" y "secciones" son de lectura
-- libre para cualquier autenticado (políticas "lectura autenticados" en
-- schema.sql) -- son catálogos inofensivos. "permisos_area_seccion" tenía
-- la misma política heredada, lo cual SÍ era un problema (cualquier
-- logueado podía leer la matriz completa por la API, sin pasar por
-- ninguna pantalla). Por eso fn_matriz_permisos() no se apoyaba en esa
-- política: repite el chequeo de permiso puntual sobre 'permisos-area'
-- adentro de su propio WHERE (mismo criterio que fn_puede_ver_novedad).
-- RESUELTO 2026-09-16 en migracion_13_endurecer_lectura_permisos.sql:
-- la política de lectura de permisos_area_seccion ahora exige
-- fn_tiene_permiso('permisos-area', 'ver') en vez de "autenticado" a
-- secas -- ver ese archivo para el detalle y qué se verificó antes.
-- =========================================================================

begin;

insert into secciones (id, nombre, tipo) values
  ('permisos-area', 'Permisos por Área', 'mosaico')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- Devuelve la matriz de permisos tal cual está en la tabla real (una fila
-- por área+sección+nivel otorgado). El front (js/permisos-area.js) arma la
-- grilla visual cruzando esto contra las listas completas de áreas y
-- secciones (esas sí de lectura libre, igual que en el resto del sitio).
create or replace function fn_matriz_permisos()
returns table (
  area_id      text,
  seccion_id   text,
  nivel_acceso text
)
language sql
stable
security definer
set search_path = public
as $$
  select pas.area_id, pas.seccion_id, pas.nivel_acceso
  from permisos_area_seccion pas
  where fn_tiene_permiso('permisos-area', 'ver');
$$;

grant execute on function fn_matriz_permisos() to authenticated;

commit;

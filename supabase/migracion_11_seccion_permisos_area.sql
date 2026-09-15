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
-- Nota de seguridad -- IMPORTANTE: las tablas "areas" y "secciones" ya son
-- de lectura libre para cualquier autenticado (políticas "lectura
-- autenticados" en schema.sql), y lo mismo pasa hoy con
-- "permisos_area_seccion" -- cualquier usuario logueado ya podía leer la
-- matriz completa consultando esa tabla directo por la API de Supabase,
-- aunque hasta ahora ninguna pantalla se la mostrara. Por eso
-- fn_matriz_permisos() NO se apoya en esa política existente: repite el
-- chequeo de permiso puntual sobre la sección 'permisos-area' adentro de
-- su propio WHERE (mismo criterio que fn_puede_ver_novedad, ver la
-- lección documentada en el Adenda de Fase 5 sobre funciones security
-- definer). Si en algún momento se quiere cerrar también el acceso
-- directo a la tabla permisos_area_seccion para no-superadmins, es un
-- cambio de política RLS aparte, no incluido acá.
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

-- =========================================================================
-- Migración 4 — Fichas de producto (gestor de contenidos estandarizado).
--
-- Contexto: Mapa de Servicios y la ficha "Eje 3" de Sector Comunicaciones
-- comparten el mismo renderer (js/fichas/ficha-renderer.js) y la misma
-- forma de datos (7 pestañas: general, equipamiento, precios, proceso,
-- faq, competencia, areas), hoy hardcodeadas en js/fichas/versiones/*.js
-- con selector de versión (window.FICHA_VERSIONS[fichaId][versionKey]).
--
-- Diseño acordado con Martin (2026-08-12): los campos de identificación
-- simples van como columnas reales; las 7 pestañas van como JSONB, editadas
-- vía textarea de JSON validado en el editor (no formularios granulares
-- por campo) — se puede "promover" cualquier campo del JSON a columna
-- propia más adelante sin rediseñar el resto. Los nombres de columna acá
-- espejan 1:1 los nombres que ya usa ficha-renderer.js (d.badge, d.name,
-- d.version, d.date, d.author, d.liderProducto, d.colaborador, vd.versionId,
-- vd.versionDesc) para que el futuro cambio de "leer de JS" a "leer de
-- Supabase" en el renderer sea un simple mapeo de nombres, no un rediseño.
--
-- Idempotente: pensado para correr sobre la base YA desplegada en Coolify,
-- igual que migracion_2 y migracion_3. También reflejado en schema.sql
-- para instalaciones nuevas.
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. FICHAS — una fila por producto (id = slug usado hoy en el código,
--    ej. 'hogar-comodato', 'nuevas-tecnologias').
-- -------------------------------------------------------------------------
create table if not exists fichas (
  id          text primary key,
  seccion_id  text not null references secciones(id) on delete cascade,
  nombre      text not null,
  badge       text,
  creado_en   timestamptz not null default now()
);

comment on table fichas is 'Catálogo de fichas de producto (Mapa de Servicios + ficha Eje 3 de Sector Comunicaciones). Cada ficha tiene 1..N versiones en ficha_versiones.';
comment on column fichas.seccion_id is 'Gatea permisos: mapa-servicios para las fichas del mapa, sector-comunicaciones para la ficha de Eje 3.';

-- -------------------------------------------------------------------------
-- 2. FICHA_VERSIONES — el contenido real. version_key es la clave que hoy
--    usa window.FICHA_VERSIONS (ej. 'v1.10'), version_id es la etiqueta
--    que muestra el selector (ej. 'V1.10') — pueden no coincidir en
--    formato, se preservan ambos tal cual estaban en el código.
-- -------------------------------------------------------------------------
create table if not exists ficha_versiones (
  id              uuid primary key default gen_random_uuid(),
  ficha_id        text not null references fichas(id) on delete cascade,
  version_key     text not null,
  version_id      text,
  version_desc    text,
  nombre          text not null,
  badge           text,
  version         text,
  fecha           text,
  autor           text,
  lider_producto  text,
  colaborador     text,
  general         jsonb not null default '{}'::jsonb,
  equipamiento    jsonb not null default '{}'::jsonb,
  precios         jsonb not null default '{}'::jsonb,
  proceso         jsonb not null default '{}'::jsonb,
  faq             jsonb not null default '{}'::jsonb,
  competencia     jsonb not null default '{}'::jsonb,
  areas           jsonb not null default '{}'::jsonb,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (ficha_id, version_key)
);

comment on table ficha_versiones is 'Una fila por versión histórica de una ficha (hoy: js/fichas/versiones/*.js). Las 7 columnas jsonb son las 7 pestañas que arma ficha-renderer.js.';

-- Trigger para mantener actualizado_en al día en cada UPDATE.
create or replace function fn_touch_ficha_version()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_ficha_version on ficha_versiones;
create trigger trg_touch_ficha_version
  before update on ficha_versiones
  for each row execute function fn_touch_ficha_version();

-- -------------------------------------------------------------------------
-- 3. RLS — mismo criterio que el resto de las secciones: ver requiere
--    permiso 'ver' sobre la seccion_id de la ficha, editar requiere
--    'editar' (o superadmin en ambos casos, ya contemplado dentro de
--    fn_tiene_permiso).
-- -------------------------------------------------------------------------
alter table fichas enable row level security;
alter table ficha_versiones enable row level security;

drop policy if exists "fichas: ver con permiso de seccion" on fichas;
create policy "fichas: ver con permiso de seccion" on fichas
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso(seccion_id, 'ver'));

drop policy if exists "fichas: editar con permiso de seccion" on fichas;
create policy "fichas: editar con permiso de seccion" on fichas
  for all using (fn_tiene_permiso(seccion_id, 'editar'));

drop policy if exists "ficha_versiones: ver con permiso de seccion" on ficha_versiones;
create policy "ficha_versiones: ver con permiso de seccion" on ficha_versiones
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from fichas f
      where f.id = ficha_versiones.ficha_id and fn_tiene_permiso(f.seccion_id, 'ver')
    )
  );

drop policy if exists "ficha_versiones: editar con permiso de seccion" on ficha_versiones;
create policy "ficha_versiones: editar con permiso de seccion" on ficha_versiones
  for all using (
    exists (
      select 1 from fichas f
      where f.id = ficha_versiones.ficha_id and fn_tiene_permiso(f.seccion_id, 'editar')
    )
  );

-- -------------------------------------------------------------------------
-- 4. fn_mis_secciones_editables() — mismo patrón que
--    fn_mis_secciones_visibles() (rpc_home.sql) pero para 'editar'. La usa
--    el editor de fichas para saber qué fichas puede tocar el usuario, y
--    el header (auth.js) para decidir si muestra el link al editor.
-- -------------------------------------------------------------------------
create or replace function fn_mis_secciones_editables()
returns setof secciones
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from secciones s
  where s.tipo = 'mosaico'
    and (
      exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
      or fn_tiene_permiso(s.id, 'editar')
    );
$$;

comment on function fn_mis_secciones_editables is 'Secciones tipo mosaico donde el usuario logueado puede editar contenido (fichas). Espejo de fn_mis_secciones_visibles() pero con nivel editar.';

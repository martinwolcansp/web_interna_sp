-- =========================================================================
-- Web Interna SP — Esquema de autenticación, roles y permisos
-- Basado en la Propuesta de Proyecto Auth/Roles/CMS (ver
-- Propuesta_Proyecto_Auth_Roles_CMS.docx, secciones 5 y 10).
--
-- Orden de aplicación:
--   1. schema.sql          (este archivo)
--   2. seed_areas.sql      (áreas del organigrama)
--   3. seed_secciones.sql  (mosaicos + sección general)
--
-- Requiere Postgres 13+ (gen_random_uuid() ya es nativo; Supabase corre
-- versiones más nuevas, así que no hace falta instalar pgcrypto aparte).
-- =========================================================================

-- -------------------------------------------------------------------------
-- 1. ÁREAS — mirror del organigrama institucional (js/organigrama-data.js)
-- -------------------------------------------------------------------------
create table if not exists areas (
  id          text primary key,
  nombre      text not null,
  parent_id   text references areas(id) on delete set null,
  tipo        text not null check (tipo in ('box', 'item')),
  responsable text,
  cargo       text
);

comment on table areas is 'Mirror del organigrama institucional. Fuente: js/organigrama-data.js. Un usuario pertenece a un área; los permisos se otorgan por área.';

-- -------------------------------------------------------------------------
-- 2. PERFILES — extiende auth.users con área, nivel y flags
-- -------------------------------------------------------------------------
create table if not exists perfiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  nombre        text,
  apellido      text,
  email         text,
  legajo        text,
  foto_url      text,
  area_id       text references areas(id) on delete set null,
  nivel         text not null default 'colaborador' check (nivel in ('colaborador', 'responsable')),
  es_superadmin boolean not null default false,
  activo        boolean not null default false,
  creado_en     timestamptz not null default now()
);

comment on table perfiles is 'Perfil de cada usuario logueado. activo=false hasta que un superadmin le asigna área/rol (alta manual, Fase 5). Mientras activo=false, no tiene permisos.';
comment on column perfiles.apellido is 'Autocompletado desde Google (family_name) en el primer login; editable por el superadmin.';
comment on column perfiles.legajo is 'No viene de Google. Se carga a mano desde el panel de superadmin (o import de RRHH, a definir) — ver Adenda 2 de la propuesta.';
comment on column perfiles.foto_url is 'Autocompletado desde Google (avatar_url/picture) en el primer login.';

-- Alta automática de perfil (pendiente de aprobación) cuando alguien
-- inicia sesión por primera vez vía Google Workspace. nombre/apellido/foto
-- se completan solos desde los datos que entrega Google; legajo no viene
-- de ahí y queda null hasta que el superadmin lo cargue (ver Adenda 2).
create or replace function fn_alta_perfil_nuevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into perfiles (id, nombre, apellido, email, foto_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'given_name', new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'family_name',
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function fn_alta_perfil_nuevo();

-- -------------------------------------------------------------------------
-- 3. SECCIONES — mosaicos y sección general (ver seed_secciones.sql)
-- -------------------------------------------------------------------------
create table if not exists secciones (
  id     text primary key,
  nombre text not null,
  tipo   text not null check (tipo in ('mosaico', 'general'))
);

comment on table secciones is 'Cada mosaico del home (Mapa de Servicios, Sector Comunicaciones, Directorio de Áreas) y la sección general (pizarra). id coincide con el slug usado en el sitio.';

-- -------------------------------------------------------------------------
-- 4. PERMISOS — qué área puede ver/editar cada sección
-- -------------------------------------------------------------------------
create table if not exists permisos_area_seccion (
  area_id      text not null references areas(id) on delete cascade,
  seccion_id   text not null references secciones(id) on delete cascade,
  nivel_acceso text not null check (nivel_acceso in ('ver', 'editar')),
  primary key (area_id, seccion_id, nivel_acceso)
);

comment on table permisos_area_seccion is 'Permiso "editar" implica "ver". La pizarra institucional (general) se maneja aparte: ver es libre para cualquier autenticado, editar sí pasa por esta tabla.';

-- Función de chequeo de permiso, para usar en políticas RLS y en el
-- frontend (vía RPC) para saber qué mostrar.
create or replace function fn_tiene_permiso(p_seccion_id text, p_nivel text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- superadmin: acceso total
    exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
    or
    -- permiso explícito por área (editar cubre también ver)
    exists (
      select 1
      from perfiles p
      join permisos_area_seccion pas on pas.area_id = p.area_id
      where p.id = auth.uid()
        and p.activo
        and pas.seccion_id = p_seccion_id
        and (pas.nivel_acceso = p_nivel or (p_nivel = 'ver' and pas.nivel_acceso = 'editar'))
    );
$$;

-- -------------------------------------------------------------------------
-- 5. PIZARRA INSTITUCIONAL (novedades) — sección general, ver punto 10
--    de la propuesta.
-- -------------------------------------------------------------------------
-- Catálogo de categorías de la pizarra (Novedades, Comunicados, Feriados,
-- Vacaciones, RRHH...). Estructural: lo gestiona el superadmin desde el
-- editor de la pizarra, igual que secciones/areas.
create table if not exists categorias_novedades (
  id     text primary key,
  nombre text not null,
  orden  int not null default 0
);

comment on table categorias_novedades is 'Catálogo de categorías de la pizarra institucional. Gestionado por el superadmin desde el editor de la pizarra.';

create table if not exists novedades (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  cuerpo          text not null,
  categoria_id    text not null references categorias_novedades(id),
  autor_id        uuid references perfiles(id) on delete set null,
  publicado_en    timestamptz not null default now(),
  vigente_hasta   timestamptz
);

create table if not exists novedades_leidas (
  usuario_id  uuid not null references perfiles(id) on delete cascade,
  novedad_id  uuid not null references novedades(id) on delete cascade,
  leido_en    timestamptz not null default now(),
  primary key (usuario_id, novedad_id)
);

comment on table novedades_leidas is 'Sostiene el indicador de "notificaciones pendientes": lo no leído por el usuario logueado es novedades vigentes que no tienen fila acá.';

-- A qué área(s) está dirigida una novedad (ver Adenda 2 de la propuesta).
-- Sin filas = visible para todas las áreas (comportamiento por defecto,
-- igual al que tenía la pizarra antes de esta tabla). Con filas cargadas,
-- sólo la ven usuarios de esas áreas (+ superadmin, que ve todo).
create table if not exists novedades_areas (
  novedad_id uuid not null references novedades(id) on delete cascade,
  area_id    text not null references areas(id) on delete cascade,
  primary key (novedad_id, area_id)
);

comment on table novedades_areas is 'Filtro de audiencia por área para una novedad. Sin filas = todas las áreas.';

-- Chequeo de visibilidad de una novedad puntual, usado en la política de
-- select de "novedades" y disponible para el frontend vía RPC si hace
-- falta. security definer por el mismo motivo que fn_es_superadmin: evita
-- reevaluar RLS recursivamente al consultar perfiles/novedades_areas.
--
-- El "auth.role() = 'authenticated' and" de acá afuera es a propósito,
-- no redundante con el de la política de "novedades" (que ya lo repite):
-- fn_mis_novedades() y fn_novedad_detalle() (rpc_home.sql) son security
-- definer y llaman a esta función directo, sin pasar por la política de
-- la tabla -- sin este chequeo, cualquiera con la sólo-pública anon key
-- podía llamar esas RPCs por fuera del sitio y ver cualquier novedad sin
-- restricción de área (que son la mayoría, "todas las áreas" es el
-- comportamiento por defecto), no sólo las que sí tenían un área
-- asignada. Encontrado y corregido 2026-09-03, ver migracion_6_*.sql
-- para bases ya desplegadas.
create or replace function fn_puede_ver_novedad(p_novedad_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.role() = 'authenticated'
    and (
      -- superadmin: ve todo
      exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo)
      or
      -- sin filas en novedades_areas: la novedad es para todas las áreas
      not exists (select 1 from novedades_areas na where na.novedad_id = p_novedad_id)
      or
      -- el área del usuario está entre las áreas destinatarias
      exists (
        select 1
        from perfiles p
        join novedades_areas na on na.area_id = p.area_id
        where p.id = auth.uid() and p.activo and na.novedad_id = p_novedad_id
      )
    );
$$;

-- Chequeo de superadmin para usar en las políticas de perfiles. No se puede
-- consultar "perfiles" directamente adentro de una política de la propia
-- tabla "perfiles" (dispara esa misma política de nuevo → recursión
-- infinita, error 42P17) — por eso va en una función security definer,
-- que al ejecutar su consulta interna no vuelve a evaluar RLS.
create or replace function fn_es_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from perfiles where id = auth.uid() and es_superadmin and activo
  );
$$;

-- -------------------------------------------------------------------------
-- 7. FICHAS DE PRODUCTO — gestor de contenidos estandarizado (Mapa de
--    Servicios + ficha "Eje 3" de Sector Comunicaciones comparten el mismo
--    renderer y la misma forma de datos: js/fichas/ficha-renderer.js).
--    Migración 4 / 2026-08-12. Campos de identificación como columnas
--    reales; las 7 pestañas de contenido (general, equipamiento, precios,
--    proceso, faq, competencia, areas) como jsonb, editadas vía textarea
--    de JSON validado en el editor (no formularios granulares por campo).
--    Los nombres de columna espejan 1:1 los que ya usa ficha-renderer.js
--    (d.badge, d.name, d.version, d.date, d.author, d.liderProducto,
--    d.colaborador, vd.versionId, vd.versionDesc) para que cambiar el
--    renderer de "leer JS" a "leer Supabase" sea un mapeo de nombres, no
--    un rediseño.
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
-- 8. ROW LEVEL SECURITY
-- -------------------------------------------------------------------------
alter table areas enable row level security;
alter table perfiles enable row level security;
alter table secciones enable row level security;
alter table permisos_area_seccion enable row level security;
alter table novedades enable row level security;
alter table novedades_leidas enable row level security;
alter table novedades_areas enable row level security;
alter table categorias_novedades enable row level security;
alter table fichas enable row level security;
alter table ficha_versiones enable row level security;

create policy "categorias_novedades: lectura autenticados" on categorias_novedades
  for select using (auth.role() = 'authenticated');
create policy "categorias_novedades: escritura superadmin" on categorias_novedades
  for all using (fn_es_superadmin());

-- areas / secciones / permisos_area_seccion: catálogos, lectura libre para
-- cualquier usuario autenticado (los necesita el frontend para saber qué
-- mostrar); escritura solo superadmin.
create policy "areas: lectura autenticados" on areas
  for select using (auth.role() = 'authenticated');
create policy "areas: escritura superadmin" on areas
  for all using (exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo));

create policy "secciones: lectura autenticados" on secciones
  for select using (auth.role() = 'authenticated');
create policy "secciones: escritura superadmin" on secciones
  for all using (exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo));

create policy "permisos: lectura autenticados" on permisos_area_seccion
  for select using (auth.role() = 'authenticated');
create policy "permisos: escritura superadmin" on permisos_area_seccion
  for all using (exists (select 1 from perfiles where id = auth.uid() and es_superadmin and activo));

-- perfiles: cada usuario ve/edita el propio; superadmin ve y edita todos
-- (así da de alta áreas/roles — Fase 5).
create policy "perfiles: ver el propio" on perfiles
  for select using (id = auth.uid());
create policy "perfiles: superadmin ve todos" on perfiles
  for select using (fn_es_superadmin());
create policy "perfiles: superadmin edita todos" on perfiles
  for update using (fn_es_superadmin());

-- novedades (pizarra): ver depende de novedades_areas (sin filas = todas
-- las áreas, comportamiento por defecto; ver fn_puede_ver_novedad más
-- arriba); editar/publicar requiere permiso 'editar' sobre la sección
-- 'pizarra', o ser el autor de esa publicación.
create policy "novedades: ver segun area o global" on novedades
  for select using (auth.role() = 'authenticated' and fn_puede_ver_novedad(id));
create policy "novedades: crear con permiso de editar pizarra" on novedades
  for insert with check (fn_tiene_permiso('pizarra', 'editar'));
create policy "novedades: autor o permiso edita/borra" on novedades
  for update using (autor_id = auth.uid() or fn_tiene_permiso('pizarra', 'editar'));
create policy "novedades: autor o permiso borra" on novedades
  for delete using (autor_id = auth.uid() or fn_tiene_permiso('pizarra', 'editar'));

-- novedades_leidas: cada usuario marca y lee solo lo propio.
create policy "lecturas: propias" on novedades_leidas
  for all using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- novedades_areas: lectura libre para autenticados (el frontend la
-- necesita para saber a quién mostrarle cada novedad); escritura sólo
-- para quien tiene permiso de editar la pizarra (mismo criterio que crear
-- una novedad).
create policy "novedades_areas: lectura autenticados" on novedades_areas
  for select using (auth.role() = 'authenticated');
create policy "novedades_areas: escritura con permiso de editar pizarra" on novedades_areas
  for all using (fn_tiene_permiso('pizarra', 'editar'));

-- fichas / ficha_versiones: ver requiere permiso 'ver' sobre la sección
-- dueña de la ficha (mapa-servicios o sector-comunicaciones); editar
-- requiere 'editar' sobre esa misma sección (superadmin ya cubierto
-- dentro de fn_tiene_permiso).
create policy "fichas: ver con permiso de seccion" on fichas
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso(seccion_id, 'ver'));
create policy "fichas: editar con permiso de seccion" on fichas
  for all using (fn_tiene_permiso(seccion_id, 'editar'));

create policy "ficha_versiones: ver con permiso de seccion" on ficha_versiones
  for select using (
    auth.role() = 'authenticated'
    and exists (
      select 1 from fichas f
      where f.id = ficha_versiones.ficha_id and fn_tiene_permiso(f.seccion_id, 'ver')
    )
  );
create policy "ficha_versiones: editar con permiso de seccion" on ficha_versiones
  for all using (
    exists (
      select 1 from fichas f
      where f.id = ficha_versiones.ficha_id and fn_tiene_permiso(f.seccion_id, 'editar')
    )
  );

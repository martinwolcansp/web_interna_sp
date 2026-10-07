-- =====================================================================
-- migracion_21_indicadores_area_posventa.sql
-- Nuevo mosaico "Indicadores por Área" y su primera área: Posventa.
--
-- Datos: el servicio indicadores-api (servicios/indicadores-api) trae de
-- NetSuite (SuiteQL) los casos de instalación y los relevamientos
-- posventa, y de GHL las encuestas posventa. Los guarda en las tablas
-- ind_posventa_*; la página pages/indicadores-area/posventa.html las lee
-- directo de Supabase (RLS).
--
-- Permisos (mismo esquema que el resto del sitio, fn_tiene_permiso):
--   ver    indicadores-area       -> ver el mosaico en el home
--   ver    indicadores-posventa   -> ver los indicadores de Posventa
--   editar indicadores-posventa   -> botón Actualizar y historial
-- Cada área nueva suma su propia sección 'indicadores-<area>' (tipo
-- general, para que no aparezca como mosaico suelto en el home).
--
-- Esto da de alta las secciones pero NO otorga acceso a nadie (mientras
-- tanto sólo las ven los superadmin). Cargar las áreas que correspondan
-- en Permisos_por_Area_WebInternaSP.xlsx / Permisos por Área.
--
-- Segura de correr más de una vez.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Secciones
-- ---------------------------------------------------------------------
insert into secciones (id, nombre, tipo) values
  ('indicadores-area',      'Indicadores por Área',       'mosaico'),
  ('indicadores-posventa',  'Indicadores - Posventa',     'general')
on conflict (id) do update set
  nombre = excluded.nombre,
  tipo   = excluded.tipo;

-- ---------------------------------------------------------------------
-- 2. Corridas de actualización (todas las áreas)
-- ---------------------------------------------------------------------
create table if not exists ind_corrida (
  id             uuid primary key default gen_random_uuid(),
  area           text not null,
  estado         text not null default 'en_curso' check (estado in ('en_curso', 'ok', 'error')),
  origen         text not null default 'manual' check (origen in ('manual', 'automatica')),
  paso           text,
  mensaje        text,
  stats          jsonb not null default '{}'::jsonb,
  log            text,
  iniciado_por   uuid default auth.uid(),
  iniciado_en    timestamptz not null default now(),
  finalizado_en  timestamptz
);

comment on table ind_corrida is 'Corridas de actualización de Indicadores por Área (servicio indicadores-api). area = sufijo de la sección indicadores-<area>.';

-- Una sola corrida en curso por área.
create unique index if not exists ind_corrida_una_en_curso
  on ind_corrida (area) where estado = 'en_curso';
create index if not exists ind_corrida_area_fin
  on ind_corrida (area, estado, finalizado_en desc);

alter table ind_corrida enable row level security;

drop policy if exists "ind_corrida: ver con permiso del area" on ind_corrida;
create policy "ind_corrida: ver con permiso del area" on ind_corrida
  for select using (auth.role() = 'authenticated' and fn_tiene_permiso('indicadores-' || area, 'ver'));

drop policy if exists "ind_corrida: crear con permiso del area" on ind_corrida;
create policy "ind_corrida: crear con permiso del area" on ind_corrida
  for insert with check (fn_tiene_permiso('indicadores-' || area, 'editar'));

drop policy if exists "ind_corrida: actualizar con permiso del area" on ind_corrida;
create policy "ind_corrida: actualizar con permiso del area" on ind_corrida
  for update using (fn_tiene_permiso('indicadores-' || area, 'editar'))
  with check (fn_tiene_permiso('indicadores-' || area, 'editar'));

drop policy if exists "ind_corrida: borrar con permiso del area" on ind_corrida;
create policy "ind_corrida: borrar con permiso del area" on ind_corrida
  for delete using (fn_tiene_permiso('indicadores-' || area, 'editar'));

grant select, insert, update, delete on ind_corrida to authenticated;

-- ---------------------------------------------------------------------
-- 3. Posventa: casos de instalación (búsqueda 2560)
-- ---------------------------------------------------------------------
create table if not exists ind_posventa_caso (
  caso_id                 bigint primary key,          -- id interno del caso en NetSuite
  numero                  text,                        -- CAS_xxxxx
  id_inst                 text,                        -- fecha inicio + fecha fin + cliente: agrupa los casos de una misma instalación
  fecha_creacion          date,
  fecha_inicio_inst       date,
  fecha_fin_inst          date,
  fecha_cerrada           date,
  cliente_id              bigint,
  cliente                 text,
  nro_cuenta              text,
  tecnico                 text,
  tipo_proyecto           text,
  estado_caso             text,
  estado_instalacion      text,
  tipo_posventa           text,                        -- primera palabra: Presencial / Remoto
  asignado_a              text,
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now()
);

create index if not exists ind_posventa_caso_numero on ind_posventa_caso (numero);
create index if not exists ind_posventa_caso_fin on ind_posventa_caso (fecha_fin_inst);

-- ---------------------------------------------------------------------
-- 4. Posventa: relevamientos (búsqueda 2557)
-- ---------------------------------------------------------------------
create table if not exists ind_posventa_relevamiento (
  relevamiento_id         bigint primary key,          -- id del registro personalizado
  fecha_creacion          date,
  caso_id                 bigint,
  numero_caso             text,
  empresa                 text,
  nro_cuenta              text,
  es_obra_construccion    boolean,
  aplica_normativa        boolean,
  realizo                 text,
  acciones                text[] not null default '{}',
  motivos_variacion_mo    text,
  comentarios             text,
  tipo_posventa           text,                        -- del caso asociado: Presencial / Remoto
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now()
);

create index if not exists ind_posventa_relev_fecha on ind_posventa_relevamiento (fecha_creacion);

-- ---------------------------------------------------------------------
-- 5. Posventa: encuestas (GHL, una fila por contacto)
-- ---------------------------------------------------------------------
create table if not exists ind_posventa_encuesta (
  contact_id              text primary key,
  contacto                text,
  estado                  text,                        -- Enviada / Finalizada
  fecha                   date,                        -- fecha de la encuesta respondida
  calificacion            text,
  expectativa             text,
  comentarios             text,
  corrida_id              uuid,
  actualizado_en          timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. RLS de las tablas de Posventa
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['ind_posventa_caso', 'ind_posventa_relevamiento', 'ind_posventa_encuesta'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using (auth.role() = ''authenticated'' and fn_tiene_permiso(''indicadores-posventa'', ''ver''))', t, t);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using (fn_tiene_permiso(''indicadores-posventa'', ''editar'')) with check (fn_tiene_permiso(''indicadores-posventa'', ''editar''))', t, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

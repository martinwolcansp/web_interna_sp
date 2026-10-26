-- =====================================================================
-- migracion_40_rls_indicadores_rendimiento.sql
-- Indicadores por Área: políticas RLS que evalúan el permiso una sola vez
-- por consulta en lugar de una vez por fila.
--
-- Antes, las políticas llamaban a fn_puede_tabla_indicadores(...) /
-- fn_tiene_permiso(...) directamente, y PostgreSQL las ejecutaba por cada
-- fila leída, insertada, actualizada o borrada. En la actualización de
-- Instalaciones eso son ~6.000 llamadas solo para OV y líneas (el paso
-- "Guardando OV y articulos" tardaba 22-36 s), y lo mismo al abrir la página.
--
-- Envolver la llamada en (select ...) hace que PostgreSQL la calcule una vez
-- por consulta (InitPlan), con el mismo resultado: la condición no depende de
-- la fila. Es la recomendación de Supabase para RLS con funciones.
--
-- No cambia quién ve o edita qué. No toca ind_corrida (su política depende
-- de la columna area de cada fila, y son pocas filas).
--
-- No hace falta redesplegar nada. Segura de correr más de una vez.
-- =====================================================================

begin;

-- Tablas comunes (permiso según ind_tabla_area).
do $$
declare t text;
begin
  foreach t in array array['ind_caso_instalacion', 'ind_caso_ov', 'ind_caso_ov_linea'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using ((select auth.role()) = ''authenticated'' and (select fn_puede_tabla_indicadores(%L, ''ver'')))', t, t, t);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using ((select fn_puede_tabla_indicadores(%L, ''editar''))) with check ((select fn_puede_tabla_indicadores(%L, ''editar'')))', t, t, t, t);
  end loop;
end $$;

-- Equivalencias de tipo de proyecto (solo lectura por RLS).
do $$
begin
  if to_regclass('public.ind_equivalencia_tipo_proyecto') is not null then
    drop policy if exists "ind_equivalencia_tipo_proyecto: ver" on ind_equivalencia_tipo_proyecto;
    create policy "ind_equivalencia_tipo_proyecto: ver" on ind_equivalencia_tipo_proyecto
      for select using ((select auth.role()) = 'authenticated' and (select fn_puede_tabla_indicadores('ind_equivalencia_tipo_proyecto', 'ver')));
  end if;
end $$;

-- Tablas propias de Posventa.
do $$
declare t text;
begin
  foreach t in array array['ind_posventa_relevamiento', 'ind_posventa_encuesta'] loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('drop policy if exists "%s: ver" on %I', t, t);
    execute format('create policy "%s: ver" on %I for select using ((select auth.role()) = ''authenticated'' and (select fn_tiene_permiso(''indicadores-posventa'', ''ver'')))', t, t);
    execute format('drop policy if exists "%s: escribir" on %I', t, t);
    execute format('create policy "%s: escribir" on %I for all using ((select fn_tiene_permiso(''indicadores-posventa'', ''editar''))) with check ((select fn_tiene_permiso(''indicadores-posventa'', ''editar'')))', t, t);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- =========================================================================
-- Migración 12 — Import/export de Permisos por Área: una única RPC
-- transaccional que aplica un diff (altas + bajas) calculado en el
-- navegador contra un Excel subido, en vez de dejar que el cliente pise
-- la tabla entera fila por fila. Ver pages/permisos-area.html /
-- js/permisos-area.js para el flujo completo (export humano-editable con
-- ExcelJS, diff-preview obligatorio antes de aplicar).
--
-- Para bases YA desplegadas. Segura de correr más de una vez
-- (create or replace).
--
-- El archivo .xlsx en sí NUNCA llega a este lado -- todo el parseo pasa
-- en el navegador de quien sube el archivo (ver permisos-area.js); acá
-- sólo entra el resultado ya reducido a filas de permisos_area_seccion.
-- =========================================================================

begin;

-- p_altas / p_bajas: arrays de objetos {area_id, seccion_id, nivel_acceso}.
-- Gateada a superadmin -- a diferencia de fn_matriz_permisos (que
-- cualquiera con 'ver' sobre 'permisos-area' puede llamar, hoy superadmin
-- + Gerencia General), escribir permisos es más sensible que sólo verlos:
-- Gerencia General puede ver y exportar la matriz, pero no aplicarle
-- cambios. Atómica por ser una única función: si algo falla a mitad de
-- camino, Postgres deshace todo el bloque solo, no queda a medio aplicar.
create or replace function fn_aplicar_matriz_permisos(p_altas jsonb, p_bajas jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_es_superadmin() then
    raise exception 'No autorizado: sólo superadmin puede aplicar cambios de permisos.';
  end if;

  delete from permisos_area_seccion pas
  using jsonb_array_elements(coalesce(p_bajas, '[]'::jsonb)) x
  where pas.area_id = x->>'area_id'
    and pas.seccion_id = x->>'seccion_id'
    and pas.nivel_acceso = x->>'nivel_acceso';

  insert into permisos_area_seccion (area_id, seccion_id, nivel_acceso)
  select x->>'area_id', x->>'seccion_id', x->>'nivel_acceso'
  from jsonb_array_elements(coalesce(p_altas, '[]'::jsonb)) x
  on conflict (area_id, seccion_id, nivel_acceso) do nothing;
end;
$$;

grant execute on function fn_aplicar_matriz_permisos(jsonb, jsonb) to authenticated;

commit;

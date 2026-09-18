-- =========================================================================
-- Migración 11 — Ampliación para Informe MKT (18 de septiembre de 2026)
--
-- Ver plan_migracion.docx, sección "Actualización — Requerimiento de
-- Informe MKT", para el contexto completo del pedido.
--
-- Segura de correr más de una vez (usa "if not exists" / valida antes de
-- crear la constraint). NO borra ni modifica ninguna fila existente.
-- =========================================================================

begin;

-- -------------------------------------------------------------------------
-- CONTACTO — dos columnas nuevas pedidas por Informe MKT.
-- -------------------------------------------------------------------------
alter table contacto
  add column if not exists vendedor_asignado text,
  add column if not exists tags jsonb not null default '[]'::jsonb;

comment on column contacto.vendedor_asignado is 'assignedTo del contacto en GHL. Pedido por Informe MKT (18/09/2026) para la columna "Vendedor" y su filtro.';
comment on column contacto.tags is 'tags del contacto en GHL (array). Pedido por Informe MKT (18/09/2026) para inferir el canal de origen cuando "Origen del Cliente" está vacío.';

-- -------------------------------------------------------------------------
-- OPORTUNIDAD — sin columnas nuevas, pero hace falta una restricción
-- unique sobre ghl_opportunity_id para poder hacer upsert (ON CONFLICT)
-- desde la carga histórica y, más adelante, desde el webhook de GHL —
-- sin esto, un mismo evento procesado dos veces duplicaría la fila en vez
-- de actualizarla. Una unique constraint en Postgres permite múltiples
-- NULL sin problema (las oportunidades que todavía no tienen ID de GHL).
-- -------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'oportunidad_ghl_opportunity_id_key'
  ) then
    alter table oportunidad
      add constraint oportunidad_ghl_opportunity_id_key unique (ghl_opportunity_id);
  end if;
end $$;

commit;

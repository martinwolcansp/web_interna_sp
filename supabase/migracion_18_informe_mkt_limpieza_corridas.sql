-- =====================================================================
-- Migracion 18 - Informe MKT: limpieza del historial de corridas
-- ---------------------------------------------------------------------
-- El servicio informe-mkt-api conserva solo las ultimas N corridas
-- (CORRIDAS_A_CONSERVAR, por defecto 20) y borra las mas viejas al
-- terminar una corrida OK. Para eso necesita permiso de DELETE, que se
-- da a quien tenga 'editar' en la seccion informes-mkt (igual que
-- crear / actualizar). Nunca se borra una corrida en curso.
-- =====================================================================

drop policy if exists "informe_mkt_corrida: borrar con permiso de seccion" on informe_mkt_corrida;
create policy "informe_mkt_corrida: borrar con permiso de seccion" on informe_mkt_corrida
  for delete using (estado <> 'en_curso' and fn_tiene_permiso('informes-mkt', 'editar'));

grant delete on informe_mkt_corrida to authenticated;

notify pgrst, 'reload schema';

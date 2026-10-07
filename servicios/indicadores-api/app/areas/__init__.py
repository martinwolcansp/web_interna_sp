# app/areas — Un modulo por area de Indicadores por Area.
#
# Cada modulo expone:
#   SECCION                       id de la seccion de permisos (indicadores-<area>)
#   actualizar(token, corrida_id, log, paso) -> (stats, advertencias)
#
# Para sumar un area: crear app/areas/<area>.py, agregarlo aca, crear su
# seccion y sus tablas en una migracion de Supabase y su pagina en
# pages/indicadores-area/<area>.html.

from app.areas import posventa

AREAS = {
    "posventa": posventa,
}

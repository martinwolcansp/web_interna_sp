# app/areas — Un modulo por area de Indicadores por Area.
#
# Cada modulo expone:
#   SECCION                       id de la seccion de permisos (indicadores-<area>)
#   actualizar(token, corrida_id, log, paso) -> (stats, advertencias)
#
# Los datos que usan varias areas (casos de instalacion, OV y articulos) se
# traen con app/fuentes/*.py y se guardan en tablas comunes ind_caso_*. Si el
# area trae otros casos (otro asignado), usa su propio alcance en esas tablas
# (ver app/fuentes/casos.py).
#
# Para sumar un area: crear app/areas/<area>.py, agregarlo aca, crear su
# seccion y sus tablas en una migracion de Supabase (y registrar en
# ind_tabla_area las tablas comunes que usa) y su pagina en
# pages/indicadores-area/<area>.html.

from app.areas import ampliaciones, comunicaciones, instalaciones, posventa

AREAS = {
    "posventa": posventa,
    "instalaciones": instalaciones,
    "ampliaciones": ampliaciones,
    "comunicaciones": comunicaciones,
}

# app/informes — Un modulo por informe del mosaico Clientes activos.
#
# Cada modulo expone:
#   SECCION                 id de la seccion de permisos (clientes-<informe>)
#   USA_PERIODO             True si la actualizacion es por mes (?periodo=YYYY-MM)
#   actualizar(token, corrida_id, log, paso, periodo) -> (stats, advertencias)

from app.informes import bajas, segmentacion

INFORMES = {
    "segmentacion": segmentacion,
    "bajas": bajas,
}

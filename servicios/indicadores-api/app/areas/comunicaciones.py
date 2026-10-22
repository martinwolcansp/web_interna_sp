# app/areas/comunicaciones.py — Indicadores de Comunicaciones.
#
# Los casos de la unidad de negocio Comunicaciones (class "Alarmas :
# Comunicaciones" del presupuesto) estan asignados al mismo jefe que los de
# Ampliaciones (232), pero dependen de otra area. Tienen su propio alcance
# ("comunicaciones") en las tablas comunes y su propia corrida: esta trae los
# casos del 232, se queda con los de Comunicaciones y solo para esos consulta
# OV y articulos (ver app/areas/ampliaciones.py y app/fuentes/casos.py).
#
# Pagina: pages/indicadores-area/ampliaciones.html?area=comunicaciones

from app.areas import ampliaciones
from app.fuentes import casos as fuente_casos

SECCION = "indicadores-comunicaciones"
ALCANCE = fuente_casos.COMUNICACIONES


def actualizar(token, corrida_id, log, paso):
    return ampliaciones.actualizar_alcance(token, corrida_id, log, paso, ALCANCE)

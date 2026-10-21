# app/areas/comunicaciones.py — Indicadores de Comunicaciones.
#
# Los casos de la unidad de negocio Comunicaciones (class "Alarmas :
# Comunicaciones" del presupuesto) estan asignados al mismo jefe que los de
# Ampliaciones (232), pero dependen de otra area. Se muestran aparte para que
# no alteren los indicadores de Ampliaciones:
#   pages/indicadores-area/ampliaciones.html                      sin Comunicaciones
#   pages/indicadores-area/ampliaciones.html?area=comunicaciones  solo Comunicaciones
#
# Los datos son los mismos (alcance "ampliaciones" de las tablas comunes): esta
# area solo tiene su propia seccion de permisos y su boton Actualizar, que
# trae todo el alcance igual que Ampliaciones.

from app.areas import ampliaciones

SECCION = "indicadores-comunicaciones"


def actualizar(token, corrida_id, log, paso):
    return ampliaciones.actualizar(token, corrida_id, log, paso, area="comunicaciones")

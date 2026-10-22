# app/areas/ampliaciones.py — Indicadores de Ampliaciones.
#
# Reemplaza el Power BI "Analisis Ampliaciones V2". Usa los mismos RESTlets que
# Instalaciones (restlet_Instalaciones_oauth_power_bi + restlet_facturacion_areas_tecnicas)
# con case_assigned = 232 (Jefe de Instalaciones - Alarmas Ampliaciones):
#   - Casos            = busqueda 2560 -> tabla comun ind_caso_instalacion
#   - Facturacion      = busqueda 2439 -> tabla comun ind_caso_ov
#   - Articulos        = busqueda 2833 -> tabla comun ind_caso_ov_linea
# Las columnas propias del informe (Unidad de Negocio y Tipo Comunicacion de
# la 2560) salen del presupuesto de origen (app/fuentes/clasificacion.py).
#
# Los casos del 232 se reparten en dos alcances por unidad de negocio (ver
# app/fuentes/casos.py): "ampliaciones" (todas menos Comunicaciones) y
# "comunicaciones" (app/areas/comunicaciones.py). Cada area actualiza y borra
# solo su alcance: se pueden actualizar por separado y hasta a la vez.
#
# Los indicadores se calculan en pages/indicadores-area/ampliaciones.html
# (la misma pagina sirve a Comunicaciones con ?area=comunicaciones).

from app.fuentes import casos as fuente_casos
from app.fuentes import ov as fuente_ov

SECCION = "indicadores-ampliaciones"
ALCANCE = fuente_casos.AMPLIACIONES


def actualizar_alcance(token, corrida_id, log, paso, alcance):
    """Corrida de un alcance del asignado 232 (ampliaciones o comunicaciones).
    Devuelve (stats, advertencias)."""
    advertencias = []
    cache = {}  # presupuestos y oportunidades ya consultados en esta corrida

    paso(f"Consultando casos de {alcance} en NetSuite")
    casos = fuente_casos.traer(log, corrida_id, token, alcance=alcance, cache=cache)
    paso("Consultando OV y articulos de los casos en NetSuite")
    ovs, lineas = fuente_ov.traer([c["caso_id"] for c in casos], log, corrida_id, alcance=alcance, cache=cache)
    if not ovs or not lineas:
        raise RuntimeError(f"NetSuite devolvio {len(ovs)} OV y {len(lineas)} lineas; "
                           "no se actualiza para no dejar el informe vacio.")

    paso("Guardando casos")
    fuente_casos.guardar(token, casos, corrida_id, alcance=alcance)
    paso("Guardando OV y articulos")
    fuente_ov.guardar(token, ovs, lineas, corrida_id, alcance=alcance)

    sin_ov = len({c["caso_id"] for c in casos} - {o["caso_id"] for o in ovs})
    if sin_ov:
        log(f"{sin_ov} casos sin OV de productos vinculada.")
    sin_un = sum(1 for c in casos if not c["unidad_negocio"])
    if sin_un:
        log(f"{sin_un} casos sin unidad de negocio (sin presupuesto u oportunidad de origen).")

    stats = {
        "casos": len(casos),
        "trabajos": len({c["id_inst"] for c in casos if c["id_inst"]}),
        "ov": len(ovs),
        "lineas": len(lineas),
        "elementos": round(sum(l["cantidad"] or 0 for l in lineas if l["es_elemento"])),
    }
    return stats, advertencias


def actualizar(token, corrida_id, log, paso):
    return actualizar_alcance(token, corrida_id, log, paso, ALCANCE)

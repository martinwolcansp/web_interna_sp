# app/areas/ampliaciones.py — Indicadores de Ampliaciones (y comunicaciones).
#
# Reemplaza el Power BI "Analisis Ampliaciones V2". Usa los mismos RESTlets que
# Instalaciones (restlet_Instalaciones_oauth_power_bi + restlet_facturacion_areas_tecnicas)
# con case_assigned = 232 (Jefe de Instalaciones - Alarmas Ampliaciones):
#   - Casos            = busqueda 2560 -> tabla comun ind_caso_instalacion (alcance "ampliaciones")
#   - Facturacion      = busqueda 2439 -> tabla comun ind_caso_ov          (alcance "ampliaciones")
#   - Articulos        = busqueda 2833 -> tabla comun ind_caso_ov_linea    (alcance "ampliaciones")
# Las columnas propias del informe (Unidad de Negocio y Tipo Comunicacion de
# la 2560) salen del presupuesto de origen (app/fuentes/clasificacion.py).
#
# Esta corrida solo reescribe y borra las filas del alcance "ampliaciones":
# no toca los casos de Posventa / Instalaciones (alcance "instalaciones").
#
# Los indicadores se calculan en pages/indicadores-area/ampliaciones.html.

from app.fuentes import casos as fuente_casos
from app.fuentes import ov as fuente_ov

SECCION = "indicadores-ampliaciones"
ALCANCE = fuente_casos.AMPLIACIONES


def actualizar(token, corrida_id, log, paso):
    """Trae los datos, los guarda en Supabase y devuelve (stats, advertencias)."""
    advertencias = []

    paso("Consultando casos de ampliaciones en NetSuite")
    casos = fuente_casos.traer(log, corrida_id, token, alcance=ALCANCE)
    paso("Consultando OV y articulos de los casos en NetSuite")
    ovs, lineas = fuente_ov.traer([c["caso_id"] for c in casos], log, corrida_id, alcance=ALCANCE)
    if not ovs or not lineas:
        raise RuntimeError(f"NetSuite devolvio {len(ovs)} OV y {len(lineas)} lineas; "
                           "no se actualiza para no dejar el informe vacio.")

    paso("Guardando casos")
    fuente_casos.guardar(token, casos, corrida_id, alcance=ALCANCE)
    paso("Guardando OV y articulos")
    fuente_ov.guardar(token, ovs, lineas, corrida_id, alcance=ALCANCE)

    sin_ov = len({c["caso_id"] for c in casos} - {o["caso_id"] for o in ovs})
    if sin_ov:
        log(f"{sin_ov} casos sin OV de productos vinculada.")
    sin_un = sum(1 for c in casos if not c["unidad_negocio"])
    if sin_un:
        log(f"{sin_un} casos sin unidad de negocio (sin presupuesto u oportunidad de origen).")
    if casos and not any(c["unidad_negocio"] for c in casos):
        advertencias.append("Ningun caso trajo unidad de negocio: revisar el log de la corrida.")

    stats = {
        "casos": len(casos),
        "trabajos": len({c["id_inst"] for c in casos if c["id_inst"]}),
        "ov": len(ovs),
        "lineas": len(lineas),
        "elementos": round(sum(l["cantidad"] or 0 for l in lineas if l["es_elemento"])),
    }
    return stats, advertencias

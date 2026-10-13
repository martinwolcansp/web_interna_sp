# app/areas/instalaciones.py — Indicadores de Instalaciones.
#
# Reemplaza el Power BI "Analisis Instalaciones V2" y su RESTlet
# (restlet_Instalaciones_oauth_power_bi + restlet_facturacion_areas_tecnicas):
#   - Casos de instalacion  = busqueda 2560 -> tabla comun ind_caso_instalacion
#   - Facturacion por caso  = busqueda 2439 -> tabla comun ind_caso_ov
#   - Articulos por caso    = busqueda 2833 -> tabla comun ind_caso_ov_linea
# La busqueda 2831 (lista de articulos) ya no hace falta: la categoria sale
# del nombre del articulo (app/fuentes/ov.py).
#
# Los indicadores (demora estimada, demoras por agenda, variacion de MO,
# elementos instalados) se calculan en pages/indicadores-area/instalaciones.html.

from app.fuentes import casos as fuente_casos
from app.fuentes import ov as fuente_ov

SECCION = "indicadores-instalaciones"


def actualizar(token, corrida_id, log, paso):
    """Trae los datos, los guarda en Supabase y devuelve (stats, advertencias)."""
    advertencias = []

    paso("Consultando casos de instalacion en NetSuite")
    casos = fuente_casos.traer(log, corrida_id)
    paso("Consultando OV y articulos de los casos en NetSuite")
    ovs, lineas = fuente_ov.traer([c["caso_id"] for c in casos], log, corrida_id)
    if not ovs or not lineas:
        raise RuntimeError(f"NetSuite devolvio {len(ovs)} OV y {len(lineas)} lineas; "
                           "no se actualiza para no dejar el informe vacio.")

    paso("Guardando casos")
    fuente_casos.guardar(token, casos, corrida_id)
    paso("Guardando OV y articulos")
    fuente_ov.guardar(token, ovs, lineas, corrida_id)

    sin_ov = len({c["caso_id"] for c in casos} - {o["caso_id"] for o in ovs})
    if sin_ov:
        log(f"{sin_ov} casos sin OV de productos vinculada.")

    stats = {
        "casos": len(casos),
        "instalaciones": len({c["id_inst"] for c in casos if c["id_inst"]}),
        "ov": len(ovs),
        "lineas": len(lineas),
        "elementos": round(sum(l["cantidad"] or 0 for l in lineas if l["es_elemento"])),
    }
    return stats, advertencias

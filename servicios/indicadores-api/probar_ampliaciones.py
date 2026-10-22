# probar_ampliaciones.py — Prueba de las fuentes de Ampliaciones y Comunicaciones
# desde la PC, sin tocar Supabase. Usa el .env de esta carpeta.
#
#   python probar_ampliaciones.py                  (los dos alcances)
#   python probar_ampliaciones.py comunicaciones   (uno solo)
#
# Deja lo que trajo en salida_prueba/<alcance>_*.json, muestra el tiempo de
# cada paso y compara la suma de los dos alcances con los totales del Power BI
# "Analisis Ampliaciones V2" (datos cacheados en el .pbix, casos creados hasta
# el 18/09/2026: comparar los meses cerrados; los totales por unidad dan mas en
# la web porque incluyen los casos posteriores). El Power BI no separaba
# Comunicaciones, por eso se compara la suma.

import json
import os
import sys
import time
from collections import Counter

from app.fuentes import casos as fuente_casos
from app.fuentes import ov as fuente_ov

ALCANCES = [fuente_casos.AMPLIACIONES, fuente_casos.COMUNICACIONES]

# Power BI (Id_instalacion distintos por mes de Fecha Fin Instalacion).
PBI_FINALIZADOS = {"2026-01": 119, "2026-02": 118, "2026-03": 172, "2026-04": 167,
                   "2026-05": 156, "2026-06": 224, "2026-07": 249, "2026-08": 192}
# Power BI: casos por Unidad de Negocio (todos los estados).
# (nombre corto: NetSuite devuelve "Ampliaciones", el Power BI "Alarmas : Ampliaciones")
PBI_UNIDAD_NEGOCIO = {"Ampliaciones": 990, "Comunicaciones": 730, "(vacio)": 372,
                      "Servicio técnico": 11, "Nuevas": 5, "Operaciones": 3,
                      "Alarmas": 1, "Comodato": 1}
PBI_TIPO_COMUNICACION = {"Radio": 32, "Telefono": 28, "Incomunicado": 2}


def log(msg):
    print(msg)


def guardar(nombre, datos):
    os.makedirs("salida_prueba", exist_ok=True)
    ruta = os.path.join("salida_prueba", nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=str)
    print(f"  -> {ruta}")


def probar(alcance):
    print(f"\n===== {alcance} =====")
    cache = {}
    t0 = time.time()
    casos = fuente_casos.traer(log, alcance=alcance, cache=cache)
    t1 = time.time()
    ovs, lineas = fuente_ov.traer([c["caso_id"] for c in casos], log, alcance=alcance, cache=cache)
    t2 = time.time()
    guardar(f"{alcance}_casos.json", casos)
    guardar(f"{alcance}_ov.json", ovs)
    guardar(f"{alcance}_ov_lineas.json", lineas)
    print(f"  Tiempos: casos y clasificacion {t1 - t0:.0f} s; OV y articulos {t2 - t1:.0f} s.")
    print("  Estados:", dict(Counter(c["estado_caso"] for c in casos)))
    print("  Tipo de proyecto:", dict(Counter(c["tipo_proyecto"] or "(vacio)" for c in casos).most_common()))
    print("  OV por estado:", dict(Counter(o["estado_ov"] for o in ovs)))
    print("  Monto total:", round(sum(o["monto"] or 0 for o in ovs)))
    elem = Counter()
    for l in lineas:
        if l["es_elemento"]:
            elem[l["subcategoria"]] += l["cantidad"] or 0
    print("  Elementos por subcategoria:", dict(elem.most_common()))
    return casos


if __name__ == "__main__":
    alcances = sys.argv[1:] or ALCANCES
    casos = [c for a in alcances for c in probar(a)]
    if set(alcances) != set(ALCANCES):
        sys.exit(0)

    print("\n===== Suma de los dos alcances vs Power BI =====")
    fin = {}
    for c in casos:
        if c["fecha_fin_inst"]:
            fin.setdefault(c["fecha_fin_inst"][:7], set()).add(c["id_inst"])
    print("  Trabajos finalizados por mes (web / Power BI):")
    for m in sorted(set(fin) | set(PBI_FINALIZADOS)):
        print(f"    {m}: {len(fin.get(m, ())):>4} / {PBI_FINALIZADOS.get(m, '-')}")
    un = Counter(fuente_casos.unidad_corta(c["unidad_negocio"]) or "(vacio)" for c in casos)
    print("  Casos por unidad de negocio (web / Power BI):")
    for k in sorted(set(un) | set(PBI_UNIDAD_NEGOCIO), key=lambda k: -un.get(k, 0)):
        print(f"    {k}: {un.get(k, 0)} / {PBI_UNIDAD_NEGOCIO.get(k, '-')}")
    tc = Counter(c["tipo_comunicacion"] for c in casos if c["tipo_comunicacion"])
    print("  Casos por tipo de comunicacion (web / Power BI):",
          {k: f"{tc.get(k, 0)} / {PBI_TIPO_COMUNICACION.get(k, '-')}" for k in set(tc) | set(PBI_TIPO_COMUNICACION)})

# probar_instalaciones.py — Prueba de las fuentes de Instalaciones desde la PC,
# sin tocar Supabase. Usa el .env de esta carpeta.
#
#   python probar_instalaciones.py
#
# Deja lo que trajo en salida_prueba/*.json y muestra los totales para
# compararlos con el Power BI "Analisis Instalaciones V2".

import json
import os
from collections import Counter

from app.fuentes import casos as fuente_casos
from app.fuentes import ov as fuente_ov


def log(msg):
    print(msg)


def guardar(nombre, datos):
    os.makedirs("salida_prueba", exist_ok=True)
    ruta = os.path.join("salida_prueba", nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=str)
    print(f"  -> {ruta}")


if __name__ == "__main__":
    casos = fuente_casos.traer(log)
    guardar("casos.json", casos)
    print("  Estados:", dict(Counter(c["estado_caso"] for c in casos)))
    fin = {}
    for c in casos:
        if c["fecha_fin_inst"]:
            fin.setdefault(c["fecha_fin_inst"][:7], set()).add(c["id_inst"])
    print("  Instalaciones finalizadas por mes:", {m: len(v) for m, v in sorted(fin.items())})

    ovs, lineas = fuente_ov.traer([c["caso_id"] for c in casos], log)
    guardar("ov.json", ovs)
    guardar("ov_lineas.json", lineas)
    print("  OV por estado:", dict(Counter(o["estado_ov"] for o in ovs)))
    print("  Monto total:", round(sum(o["monto"] or 0 for o in ovs)))
    elem = Counter()
    for l in lineas:
        if l["es_elemento"]:
            elem[l["subcategoria"]] += l["cantidad"] or 0
    print("  Elementos por subcategoria:", dict(elem.most_common()))

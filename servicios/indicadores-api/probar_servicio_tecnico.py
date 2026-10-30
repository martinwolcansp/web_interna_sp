# probar_servicio_tecnico.py — Prueba de la fuente de Servicio Tecnico desde la
# PC, sin tocar Supabase. Usa el .env de esta carpeta.
#
#   python probar_servicio_tecnico.py              (consulta NetSuite)
#   python probar_servicio_tecnico.py --local      (reclasifica salida_prueba/servicio_tecnico_casos.json)
#
# Muestra el asignado encontrado, los casos por mes, las categorias de problema
# (app/fuentes/clasificacion_st.py) con ejemplos de cada una y la recurrencia
# por cliente sin contar visitas no realizadas, bajas ni vueltas planificadas.
# Deja los casos en salida_prueba/servicio_tecnico_casos.json.

import json
import os
import random
import sys
from collections import Counter, defaultdict
from datetime import date

from app.areas import servicio_tecnico
from app.fuentes import clasificacion_st as cs

VENTANA_DIAS = 90
RUTA = os.path.join("salida_prueba", "servicio_tecnico_casos.json")


def log(msg):
    print(msg)


def dias(a, b):
    return (date.fromisoformat(b) - date.fromisoformat(a)).days


if __name__ == "__main__":
    if "--local" in sys.argv:
        with open(RUTA, encoding="utf-8") as f:
            casos = json.load(f)
        for c in casos:
            c["categoria_problema"], c["categoria_origen"] = cs.clasificar(c["problema"], c["titulo"])
            c["vuelta_planificada"] = cs.vuelta_planificada(c["problema"], c["categoria_problema"])
        print(f"{len(casos)} casos de {RUTA} reclasificados.")
    else:
        casos = servicio_tecnico.traer(log)
        os.makedirs("salida_prueba", exist_ok=True)
        with open(RUTA, "w", encoding="utf-8") as f:
            json.dump(casos, f, ensure_ascii=False, indent=1, default=str)
        print(f"  -> {RUTA}")

        print("\nCasos por mes de creacion:")
        for m, n in sorted(Counter(c["fecha_creacion"][:7] for c in casos if c["fecha_creacion"]).items()):
            print(f"  {m}: {n}")
        print("\nEstados:", dict(Counter(c["estado_caso"] for c in casos).most_common()))
        print("Tecnicos:", dict(Counter(c["tecnico"] or "(vacio)" for c in casos).most_common(15)))
        pst = Counter(c["problema_st"] or "(vacio)" for c in casos)
        print(f"\nProblema ST (custevent_3k_problema_st): {len(pst)} valores distintos")
        for k, n in pst.most_common(30):
            print(f"  {n:>6}  {k}")

    total = len(casos)
    print("\nCategorias de problema:")
    for k, n in Counter(c["categoria_problema"] for c in casos).most_common():
        print(f"  {n:>6} {100 * n / total:5.1f}%  {k}")
    print("Origen de la categoria:", dict(Counter(c["categoria_origen"] or "sin clasificar" for c in casos)))
    print("Con vuelta planificada:", sum(1 for c in casos if c["vuelta_planificada"]))

    random.seed(1)
    por_cat = defaultdict(list)
    for c in casos:
        if c["problema"]:
            por_cat[c["categoria_problema"]].append(c["problema"])
    for k in cs.ORDEN:
        if por_cat.get(k):
            print(f"\n== {k} (ejemplos)")
            for t in random.sample(por_cat[k], min(5, len(por_cat[k]))):
                print("   -", t[:130].replace("\n", " "))

    # Recurrencia sin visitas no realizadas ni bajas; las vueltas planificadas aparte.
    por_cliente = defaultdict(list)
    for c in casos:
        if c["cliente_id"] and c["fecha_creacion"] and c["categoria_problema"] not in cs.NO_SERVICIO:
            por_cliente[c["cliente_id"]].append(c)
    servicios = sum(len(l) for l in por_cliente.values())
    reinc = misma = planif = 0
    for lista in por_cliente.values():
        lista.sort(key=lambda c: (c["fecha_creacion"], c["caso_id"]))
        for i, c in enumerate(lista):
            previos = [p for p in lista[:i] if p["fecha_creacion"] < c["fecha_creacion"]]
            if not previos or dias(previos[-1]["fecha_creacion"], c["fecha_creacion"]) > VENTANA_DIAS:
                continue
            if previos[-1]["vuelta_planificada"]:
                planif += 1
                continue
            reinc += 1
            mismos = [p for p in previos if p["categoria_problema"] == c["categoria_problema"]]
            if mismos and dias(mismos[-1]["fecha_creacion"], c["fecha_creacion"]) <= VENTANA_DIAS:
                misma += 1
    print(f"\nServicios realizados (sin visitas no realizadas ni bajas): {servicios}")
    print(f"Reincidencias en {VENTANA_DIAS} dias: {reinc} ({100 * reinc / servicios:.0f}%); "
          f"misma categoria: {misma} ({100 * misma / servicios:.0f}%); vueltas planificadas: {planif}")

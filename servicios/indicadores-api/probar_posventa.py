# probar_posventa.py — Prueba de las fuentes de Posventa desde la PC, sin
# tocar Supabase. Usa el .env de esta carpeta.
#
#   python probar_posventa.py            NetSuite + GHL
#   python probar_posventa.py netsuite   solo NetSuite
#   python probar_posventa.py ghl        solo GHL (muestra los objetos y las
#                                        propiedades del objeto de encuestas)
#
# Deja lo que trajo en salida_prueba/*.json para revisarlo.

import json
import os
import sys
from collections import Counter

from app import config, ghl
from app.areas import posventa


def log(msg):
    print(msg)


def guardar(nombre, datos):
    os.makedirs("salida_prueba", exist_ok=True)
    ruta = os.path.join("salida_prueba", nombre)
    with open(ruta, "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=str)
    print(f"  -> {ruta}")


def probar_netsuite():
    print("\n=== NetSuite ===")
    casos = posventa.traer_casos(log)
    guardar("casos.json", casos)
    fin = Counter((c["fecha_fin_inst"] or "")[:7] for c in casos if c["fecha_fin_inst"])
    inst = {}
    for c in casos:
        if c["fecha_fin_inst"]:
            inst.setdefault(c["fecha_fin_inst"][:7], set()).add(c["id_inst"])
    print("  Instalaciones finalizadas por mes (casos / instalaciones):")
    for mes in sorted(fin):
        print(f"    {mes}: {fin[mes]} / {len(inst[mes])}")

    relev = posventa.traer_relevamientos(log)
    guardar("relevamientos.json", relev)
    print("  Relevamientos por mes:", dict(sorted(Counter((r["fecha_creacion"] or "")[:7] for r in relev).items())))
    print("  Acciones:", dict(Counter(a for r in relev for a in r["acciones"]).most_common()))


def probar_ghl():
    print("\n=== GHL ===")
    try:
        data = ghl._ok(ghl._pedir("GET", f"{ghl.BASE_URL}/objects/", log, token=config.GHL_OBJETOS_API_TOKEN,
                                  params={"locationId": config.GHL_LOCATION_ID}), "listar objetos")
        for o in data.get("objects") or data.get("schemas") or []:
            print(f"  objeto: {o.get('key')}  ({(o.get('labels') or {}).get('plural')})")
    except RuntimeError as e:
        print(f"  No se pudieron listar los objetos ({e}).")
        if not config.GHL_OBJETO_ENCUESTAS:
            print("  Falta el scope objects/schema.readonly en el token, o bien configurar GHL_OBJETO_ENCUESTAS en el .env.")
            return
    clave = ghl.clave_objeto("encuesta", log)
    registros = ghl.registros_objeto(clave, log)
    print(f"  {clave}: {len(registros)} registros")
    if registros:
        print("  propiedades del primer registro:", json.dumps(registros[0].get("properties"), ensure_ascii=False)[:600])
    guardar("encuestas_registros.json", registros)

    contactos = {tag: ghl.contactos_con_tag(tag, log) for tag in posventa.TAGS_ENCUESTA}
    for tag, lista in contactos.items():
        print(f"  contactos con etiqueta {tag}: {len(lista)}")
    filas = posventa.filas_encuestas(contactos, registros, None)
    guardar("encuestas.json", filas)
    print("  Estado:", dict(Counter(f["estado"] for f in filas)))
    print("  Calificacion:", dict(Counter(f["calificacion"] for f in filas)))
    print("  Expectativa:", dict(Counter(f["expectativa"] for f in filas)))


if __name__ == "__main__":
    que = sys.argv[1] if len(sys.argv) > 1 else "todo"
    if que in ("todo", "netsuite"):
        probar_netsuite()
    if que in ("todo", "ghl"):
        probar_ghl()

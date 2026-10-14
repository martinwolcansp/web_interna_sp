# diagnostico_comisiones.py — Prueba la base de comisiones sin la web (13/10/2026).
#
# Muestra, para las oportunidades ganadas del rango, sus OV y los abonos (ABO)
# de cada una, con la misma logica del boton "Comisiones por vendedor"
# (app/comisiones.py). No escribe nada. Guarda el detalle en
# diagnostico_comisiones_<desde>_<hasta>.json.
#
#   python diagnostico_comisiones.py 2026-09-01 2026-09-30

import json
import sys
from collections import Counter
from datetime import date

from app import comisiones

if len(sys.argv) != 3:
    sys.exit("Uso: python diagnostico_comisiones.py AAAA-MM-DD AAAA-MM-DD")
desde, hasta = date.fromisoformat(sys.argv[1]), date.fromisoformat(sys.argv[2])
r = comisiones.generar(desde, hasta, print)

print(f"\nGanadas: {r['ganadas']} · OV de abonos relacionadas: {len(r['ovs'])} · Ganadas sin OV de abonos: {len(r['sin_ov'])}")
print("OV excluidas por tipo:", r.get("ov_excluidas_por_tipo") or "ninguna")
print("\nOV por clasificacion:")
for k, n in Counter(f["clasificacion"] for f in r["ovs"]).most_common():
    print(f"  {n:4d}  {k}")
print("\nOV por tipo de orden de venta / comodato:")
for k, n in Counter((f["tipo_ov"], "Comodato" if f["comodato"] else "Venta") for f in r["ovs"]).most_common():
    print(f"  {n:4d}  {k[0]} · {k[1]}")
print("\nArticulos ABO encontrados:")
for k, n in Counter(a["articulo"] for f in r["ovs"] for a in f["abonos"]).most_common():
    print(f"  {n:4d}  {k}")
print("\nPor vendedor (OV comisionables / OV / base):")
por = {}
for f in r["ovs"]:
    v = por.setdefault(f["vendedor"], [0, 0, 0.0])
    v[0] += f["comisionable"]; v[1] += 1; v[2] += f["base_comisionable"]
for k, (c, n, b) in sorted(por.items()):
    print(f"  {k:30s} {c:3d} / {n:3d}   $ {b:,.2f}")

salida = f"diagnostico_comisiones_{desde}_{hasta}.json"
with open(salida, "w", encoding="utf-8") as fh:
    json.dump(r, fh, ensure_ascii=False, indent=1)
print(f"\nDetalle: {salida}")

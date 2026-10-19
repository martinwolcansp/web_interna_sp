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

from app import comisiones, config
from app import supabase_rest as sb

if len(sys.argv) != 3:
    sys.exit("Uso: python diagnostico_comisiones.py AAAA-MM-DD AAAA-MM-DD")
desde, hasta = date.fromisoformat(sys.argv[1]), date.fromisoformat(sys.argv[2])
# Configuracion de abonos (migracion 28), leida con el usuario tecnico del .env.
try:
    token = sb.iniciar_sesion(config.INFORME_BOT_EMAIL, config.INFORME_BOT_PASSWORD)
    abonos = sb.leer_abonos_comision(token)
    unidades = sb.leer_unidades_comision(token)
    print(f"Configuracion: {len(abonos)} abonos, {sum(1 for a in abonos if a['incluido'])} incluidos, "
          f"{'sin tabla de unidades (falta la migracion 29)' if unidades is None else str(len(unidades)) + ' unidades'}.")
except Exception as e:
    sys.exit(f"No se pudo leer la configuracion de abonos (falta la migracion 28 o el usuario tecnico?): {e}")
r = comisiones.generar(desde, hasta, print, abonos, unidades)

print(f"\nGanadas: {r['ganadas']} · OV de abonos relacionadas: {len(r['ovs'])} · Ganadas sin OV de abonos: {len(r['sin_ov'])}")
print("OV excluidas por tipo:", r.get("ov_excluidas_por_tipo") or "ninguna")
print("OV mensuales posteriores no contadas (una OV por oportunidad):", r.get("ov_mensuales_no_contadas", 0))
print("\nOV por clasificacion:")
for k, n in Counter(f["clasificacion"] for f in r["ovs"]).most_common():
    print(f"  {n:4d}  {k}")
print("\nOV por tipo de orden de venta / comodato:")
for k, n in Counter((f["tipo_ov"], "Comodato" if f["comodato"] else "Venta") for f in r["ovs"]).most_common():
    print(f"  {n:4d}  {k[0]} · {k[1]}")
print("\nArticulos ABO encontrados:")
for k, n in Counter(a["articulo"] for f in r["ovs"] for a in f["abonos"]).most_common():
    print(f"  {n:4d}  {k}")
print("\nPor vendedor (ganadas / OV / OV con abonos incluidos / base / comision):")
for v in comisiones.resumen_vendedores(r):
    print(f"  {v['vendedor']:30s} {v['ganadas']:3d} / {v['ovs']:3d} / {v['ovs_comisionables']:3d}   "
          f"base $ {v['base_comisionable']:,.2f}   comision $ {v['comision']:,.2f}")
    for u in v["por_unidad"]:
        print(f"      {u['unidad'][:40]:40s} {u['ventas']:3d} ventas, comisionan {u['comisionan']:3d} (desde la {u['incluido_desde']}a)   "
              f"base $ {u['base']:,.2f}   promedio $ {u['promedio']:,.2f}   comision $ {u['comision']:,.2f}")

salida = f"diagnostico_comisiones_{desde}_{hasta}.json"
with open(salida, "w", encoding="utf-8") as fh:
    json.dump(r, fh, ensure_ascii=False, indent=1)
print(f"\nDetalle: {salida}")

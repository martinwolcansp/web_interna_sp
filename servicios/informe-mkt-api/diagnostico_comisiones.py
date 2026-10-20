# diagnostico_comisiones.py — Prueba la base de comisiones sin la web (13/10/2026).
#
# Muestra, para las oportunidades ganadas del rango, sus OV, los fondos comisionables por
# unidad y el reparto por vendedor, con la misma logica del boton "Comisiones por vendedor"
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
# Configuracion (migraciones 28 a 31), leida con el usuario tecnico del .env.
try:
    token = sb.iniciar_sesion(config.INFORME_BOT_EMAIL, config.INFORME_BOT_PASSWORD)
    abonos = sb.leer_abonos_comision(token)
    unidades = sb.leer_unidades_comision(token)
    porcentajes = sb.leer_porcentajes_comision(token)
    print(f"Configuracion: {len(abonos)} abonos ({sum(1 for a in abonos if a.get('unidad_id'))} con unidad), "
          f"{len(unidades)} unidades, "
          f"{'sin tabla de porcentajes (falta la migracion 31)' if porcentajes is None else str(len(porcentajes)) + ' porcentajes'}.")
except Exception as e:
    sys.exit(f"No se pudo leer la configuracion de comisiones (faltan migraciones o el usuario tecnico?): {e}")
r = comisiones.generar(desde, hasta, print, abonos, unidades, porcentajes)

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
print("\nFondo comisionable por unidad (ventas de todos los vendedores):")
for p in r["fondos"]:
    print(f"  {p['unidad'][:40]:40s} {p['ventas']:3d} ventas, comisionan {p['comisionan']:3d} (desde la {p['incluido_desde']}a)   "
          f"base $ {p['base']:,.2f}   fondo comisionable $ {p['fondo']:,.2f}   porcentajes {p['porcentaje_total']:g} %   "
          f"repartido $ {p['repartido']:,.2f}   sin repartir $ {p['sin_repartir']:,.2f}   sin asignar: {p['ventas_sin_asignar']} ventas")
print("\nPor vendedor (ganadas / OV / OV con abonos incluidos / aporte al fondo / comision):")
for v in r["vendedores"]:
    print(f"  {v['vendedor']:30s} {v['ganadas']:3d} / {v['ovs']:3d} / {v['ovs_comisionables']:3d}   "
          f"aporte $ {v['aporte']:,.2f}   comision $ {v['comision']:,.2f}")
    for u in v["por_unidad"]:
        pct = "sin %" if u["porcentaje"] is None else f"{u['porcentaje']:g} %"
        print(f"      {u['unidad'][:40]:40s} {u['ventas']:3d} ventas{'' if u['comisiona'] else ' (no comisiona)'}   "
              f"{pct:>8s}   comision $ {u['comision']:,.2f}")
print("\nAvisos:")
for a in r["avisos"]:
    print("  -", a)

salida = f"diagnostico_comisiones_{desde}_{hasta}.json"
with open(salida, "w", encoding="utf-8") as fh:
    json.dump(r, fh, ensure_ascii=False, indent=1)
print(f"\nDetalle: {salida}")

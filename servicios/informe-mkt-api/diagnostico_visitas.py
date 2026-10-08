# diagnostico_visitas.py — Prueba las dos fuentes nuevas del Informe por
# vendedor (08/10/2026) sin escribir nada en Supabase:
#   1. Calendarios y citas de GHL del rango (cuantas por estado y vendedor).
#   2. Presupuestos de NetSuite del rango y de los clientes visitados.
#   3. La tabla resultante (visitas concretadas / con presupuesto / presupuestos).
#
# Uso (carpeta informe-mkt-api, con el .env completo):
#     python diagnostico_visitas.py 2026-09-01 2026-09-30
# Si GHL responde 401/403 en /calendars, al token le falta el permiso de
# calendarios (calendars.readonly y calendars/events.readonly).

import sys
from collections import Counter
from datetime import date

from app import ghl, job, netsuite, visitas


def main():
    desde = date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else date.today().replace(day=1)
    hasta = date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else date.today()
    inicio, fin_excl = job.limites_del_rango(desde, hasta)
    print(f"Rango {desde} a {hasta}\n")

    try:
        for cal in ghl.traer_calendarios(print):
            print(f"  calendario {cal.get('id')}  {cal.get('name')}")
        citas = ghl.traer_citas(inicio, fin_excl, print)
    except RuntimeError as e:
        print(f"ERROR GHL: {e}")
        if "401" in str(e):
            print("  -> Al token le falta el permiso de calendarios: en GHL, Settings > Private Integrations,\n"
                  "     sumar View Calendars y View Calendar Events. Sigo con NetSuite.")
        citas = []
    print("\nCitas por estado:", dict(Counter((c.get("appointmentStatus") or "sin estado") for c in citas)))
    print("Citas por vendedor:", dict(Counter(visitas.vendedor_cita(c) for c in citas)))
    sin_vend = Counter(c.get("assignedUserId") for c in citas if visitas.vendedor_cita(c) == "Sin asignar")
    if sin_vend:
        print("Usuarios asignados que no estan en VENDEDOR_GHL_IDS:", dict(sin_vend))

    visitados = {c.get("contactId") for c in citas if visitas.es_concretada(c)}
    pres = netsuite.traer_presupuestos(desde, hasta, visitados, print)
    bloque = visitas.generar(citas, pres, {}, desde, hasta)

    print(f"\n{'Vendedor':28} {'Visitas':>8} {'c/presup':>9} {'Presup. periodo':>16}")
    vend = sorted({v['vendedor'] for v in bloque['visitas']} |
                  {p['vendedor'] for p in bloque['presupuestos'] if p['en_periodo'] and p['vendedor'] in visitas.VENDEDORES_INFORME})
    for v in vend:
        vs = [x for x in bloque["visitas"] if x["vendedor"] == v]
        print(f"{v:28} {len(vs):>8} {sum(1 for x in vs if x['presupuestos']):>9} "
              f"{sum(1 for p in bloque['presupuestos'] if p['en_periodo'] and p['vendedor'] == v):>16}")


if __name__ == "__main__":
    main()

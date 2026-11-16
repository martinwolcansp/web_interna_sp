# actualizar_articulos.py — Actualizacion de articulos, precios, presupuestos y
# OV de productos desde la PC (13/11/2026). Misma logica que el boton
# (POST /articulos/actualizar, app/articulos.py).
#
#   python actualizar_articulos.py 2026-09-01 2026-09-30 --simular
#       Trae todo de NetSuite y muestra el resumen. NO escribe nada.
#   python actualizar_articulos.py 2026-09-01 2026-09-30
#       Trae y guarda en Supabase con el usuario tecnico del .env
#       (INFORME_BOT_EMAIL / INFORME_BOT_PASSWORD). Requiere la migracion 48.

import sys
from collections import Counter
from datetime import date

from app import articulos, config
from app import supabase_rest as sb

args = [a for a in sys.argv[1:] if not a.startswith("--")]
simular = "--simular" in sys.argv
if len(args) != 2:
    sys.exit("Uso: python actualizar_articulos.py AAAA-MM-DD AAAA-MM-DD [--simular]")
desde, hasta = date.fromisoformat(args[0]), date.fromisoformat(args[1])

if simular:
    r = articulos.ejecutar(None, desde, hasta, simular=True)
    cat = {f["id"]: f for f in r["catalogo"]}
    trans = {f["id"]: f for f in r["transacciones"]}

    print("\nTransacciones por tipo / tipo de OV / modalidad:")
    for k, n in Counter((f["tipo"], f["tipo_ov"] or "-", "Comodato" if f["comodato"] else "Venta")
                        for f in r["transacciones"]).most_common():
        print(f"  {n:5d}  {k[0]:9s} {k[1]:45s} {k[2]}")

    print("\nLineas por categoria y cobertura del precio de referencia (equipos y servicios):")
    cob = Counter()
    for l in r["lineas"]:
        t = trans.get(l["transaccion_id"], {})
        clave = (t.get("tipo"), l["categoria"], "Comodato" if t.get("comodato") else "Venta")
        cob[clave + ("lineas",)] += 1
        if l["categoria"] in ("Equipo", "Servicio"):
            a = cat.get(l["articulo_id"], {})
            eq = cat.get(a.get("equivalente_id"), {})
            if a.get("precio_lista"):
                cob[clave + ("propio",)] += 1
            elif eq.get("precio_lista"):
                cob[clave + ("equivalente",)] += 1
            else:
                cob[clave + ("sin precio",)] += 1
    claves = sorted({k[:3] for k in cob}, key=str)
    print(f"  {'tipo / categoria / modalidad':40s} {'lineas':>7s} {'propio':>7s} {'equiv.':>7s} {'sin precio':>11s}")
    for k in claves:
        print(f"  {' / '.join(str(x) for x in k):40s} {cob[k + ('lineas',)]:7d} {cob[k + ('propio',)]:7d} "
              f"{cob[k + ('equivalente',)]:7d} {cob[k + ('sin precio',)]:11d}")
    print("\nDetalle:", r["detalle"])
    sys.exit(0)

if not (config.INFORME_BOT_EMAIL and config.INFORME_BOT_PASSWORD):
    sys.exit("Falta INFORME_BOT_EMAIL / INFORME_BOT_PASSWORD en el .env.")
token = sb.iniciar_sesion(config.INFORME_BOT_EMAIL, config.INFORME_BOT_PASSWORD)
sinc = articulos.crear_sincronizacion(token, desde, hasta, "actualizar_articulos.py")
if not sinc:
    sys.exit("Ya hay una actualizacion de articulos en curso.")
r = articulos.ejecutar(token, desde, hasta, sinc_id=sinc["id"])
print("\nOK:", r["detalle"])

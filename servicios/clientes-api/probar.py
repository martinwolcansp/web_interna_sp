# probar.py — Prueba de los informes desde la PC, sin tocar Supabase.
#
#   python probar.py segmentacion
#   python probar.py bajas 2026-09
#
# Trae de NetSuite lo mismo que una corrida y lo deja en salida_prueba/ (las
# filas tal como se guardarian en cli_cliente / cli_establecimiento / cli_baja).

import collections
import json
import os
import sys
from datetime import date

from app.comun import ahora
from app import compras
from app.informes import bajas, segmentacion


def log(m):
    print(m)


def paso(m):
    print(f"== {m}")


def guardar(nombre, datos):
    os.makedirs("salida_prueba", exist_ok=True)
    with open(f"salida_prueba/{nombre}.json", "w", encoding="utf-8") as f:
        json.dump(datos, f, ensure_ascii=False, indent=1, default=str)
    print(f"-> salida_prueba/{nombre}.json ({len(datos)} filas)")


def main():
    que = sys.argv[1] if len(sys.argv) > 1 else "segmentacion"
    if que == "segmentacion":
        por_id, avisos = segmentacion.traer(log, paso)
        clientes, est = segmentacion.separar(por_id, None, ahora().isoformat())
        print(f"\nClientes: {len(clientes)}  Establecimientos: {len(est)}  Avisos: {avisos}")
        print("Estados:", collections.Counter(e["estado_servicio"] for e in est).most_common(20))
        print("Activo:", collections.Counter(e["activo"] for e in est))
        print("Con ID GHL:", sum(1 for c in clientes if c["ghl_contact_id"]))
        guardar("cli_cliente", clientes)
        guardar("cli_establecimiento", est)
        compras_, avisos_c = compras.traer(por_id, segmentacion.raices(por_id), None, ahora().isoformat(), log)
        print(f"\nCompras: {len(compras_)} de {len({c['cliente_ns_id'] for c in compras_})} clientes  Avisos: {avisos_c}")
        print("Por anio:", sorted(collections.Counter(c["fecha"][:4] for c in compras_ if c["fecha"]).items()))
        print("Unidad de negocio:", collections.Counter(c["unidad_negocio"] for c in compras_).most_common(12))
        print("Unidad comercial:", collections.Counter((c["unidad_comercial"], c["unidad_comercial_origen"]) for c in compras_).most_common(12))
        print("Comodato:", collections.Counter(c["es_comodato"] for c in compras_))
        guardar("cli_compra", compras_)
    elif que == "bajas":
        anio, mes = (int(x) for x in sys.argv[2].split("-"))
        periodo = date(anio, mes, 1)
        filas, _, avisos = bajas.traer_mes(periodo, log, paso)
        ahora_dt = ahora()
        salida = [bajas.fila(f, periodo, None, ahora_dt.isoformat(), ahora_dt) for f in filas]
        print(f"\nBajas: {len(salida)}  Avisos: {avisos}")
        for campo in ("estado_actual", "motivo_baja", "categoria"):
            print(campo, collections.Counter(s[campo] for s in salida).most_common())
        guardar(f"cli_baja_{periodo:%Y-%m}", salida)
    else:
        print(__doc__)


if __name__ == "__main__":
    main()

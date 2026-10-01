# resumen_netsuite.py — Cuenta las oportunidades de NetSuite de un rango, para
# conciliar los numeros del informe con los que se ven en NetSuite.
# No escribe nada.
#
# Uso:
#     python resumen_netsuite.py --desde 2026-09-01 --hasta 2026-09-30

import argparse
from datetime import date

import pandas as pd

from app import netsuite


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", required=True)
    ap.add_argument("--hasta", required=True)
    args = ap.parse_args()
    desde, hasta = date.fromisoformat(args.desde), date.fromisoformat(args.hasta)

    # Todas las oportunidades del rango, sin filtros de subsidiaria ni vendedor.
    todas = pd.DataFrame(netsuite.suiteql(netsuite.consulta_oportunidades(desde, hasta)))
    for col in ("subsidiaria", "representante", "estado", "aprobada"):
        if col not in todas.columns:
            todas[col] = None
    todas["aprobada"] = pd.to_numeric(todas["aprobada"]).fillna(0).astype(int)
    todas["en_subsidiaria"] = todas["subsidiaria"].fillna("").str.strip().str.endswith(netsuite.SUBSIDIARIA)
    todas["vendedor_de_la_busqueda"] = todas["representante"].map(netsuite._normalizar).isin(netsuite.VENDEDORES)

    print(f"\nOportunidades con fecha del {desde} al {hasta}: {len(todas)} | ganadas (Compra o Venta Cerrada Concretada): {todas['aprobada'].sum()}")
    print("\nGanadas por subsidiaria y por si el vendedor esta en la busqueda:")
    print(todas.groupby(["en_subsidiaria", "vendedor_de_la_busqueda"])["aprobada"].agg(["count", "sum"])
          .rename(columns={"count": "oportunidades", "sum": "ganadas"}).to_string())

    informe = todas[todas["en_subsidiaria"] & todas["vendedor_de_la_busqueda"]]
    print(f"\nLo que toma el informe (subsidiaria S.P. + vendedores de la busqueda): {len(informe)} oportunidades, {informe['aprobada'].sum()} ganadas")
    print("\nPor estado:")
    print(informe["estado"].fillna("(sin estado)").value_counts().to_string())
    print("\nGanadas por vendedor (informe):")
    print(informe[informe["aprobada"] == 1]["representante"].map(netsuite._normalizar).value_counts().to_string())
    print("\nGanadas de vendedores que NO estan en la busqueda (subsidiaria S.P.):")
    fuera = todas[todas["en_subsidiaria"] & ~todas["vendedor_de_la_busqueda"] & (todas["aprobada"] == 1)]
    print(fuera["representante"].fillna("(sin vendedor)").value_counts().to_string() if len(fuera) else "  ninguna")


if __name__ == "__main__":
    main()

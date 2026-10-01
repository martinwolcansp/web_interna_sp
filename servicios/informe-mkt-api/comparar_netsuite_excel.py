# comparar_netsuite_excel.py — Valida que la consulta SuiteQL devuelva lo mismo
# que el Excel exportado de la busqueda guardada.
#
# Uso (carpeta informe-mkt-api, con el .env completo):
#     python comparar_netsuite_excel.py
#     python comparar_netsuite_excel.py --excel "<ruta al Excel>" --desde 2026-09-01 --hasta 2026-09-21
#
# El Excel de Fuentes se exporto el 21/09 con fechas 01/09 a 21/09. Desde ese
# dia las oportunidades siguieron cambiando (estado, origen, etc.), asi que
# algunas diferencias en esas columnas son esperables; lo importante es que
# coincidan las oportunidades y los valores que no cambian.

import argparse
from datetime import date

import pandas as pd

from app import netsuite

COLUMNAS = [
    "Fecha", "Representante de Ventas", "Aprobada", "Oportunidad", "Creación cliente potencial",
    "ID", "Cliente", "Origen de clientes potenciales", "Forma de Contacto con SP",
    "ID CLIENTE CRM", "Estado Oportunidad", "Unidad de Negocio", "Tipo de Proyecto",
]


def norm(v):
    if v is None or (isinstance(v, float) and pd.isna(v)) or v is pd.NaT:
        return ""
    if isinstance(v, pd.Timestamp):
        return v.strftime("%Y-%m-%d %H:%M") if (v.hour or v.minute) else v.strftime("%Y-%m-%d")
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    return " ".join(str(v).split())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--excel", default="../../../Analisis MKT Conversaciones - oportunidades/Fuentes/ResultadosSPFedeOportunidadesporVendedorDetalle.xlsx")
    ap.add_argument("--desde", default="2026-09-01")
    ap.add_argument("--hasta", default="2026-09-21")
    args = ap.parse_args()

    excel = pd.read_excel(args.excel)
    api = netsuite.traer_oportunidades(date.fromisoformat(args.desde), date.fromisoformat(args.hasta), print)

    ids_excel, ids_api = set(excel["ID interno"]), set(api["ID interno"])
    print(f"\nOportunidades: Excel {len(ids_excel)} | SuiteQL {len(ids_api)} | en ambos {len(ids_excel & ids_api)}")
    for titulo, ids, df in (("Solo en el Excel", ids_excel - ids_api, excel), ("Solo en SuiteQL", ids_api - ids_excel, api)):
        if ids:
            print(f"  {titulo}: {len(ids)}")
            print(df[df["ID interno"].isin(ids)][["ID interno", "Oportunidad", "Fecha", "Representante de Ventas", "Cliente"]]
                  .to_string(index=False))

    faltantes = sorted(ids_excel - ids_api)
    if faltantes:
        print("\n  Por que no estan en SuiteQL (datos actuales en NetSuite, sin filtros):")
        filas = netsuite.suiteql(f"""
            SELECT t.id, t.tranid, t.type, TO_CHAR(t.trandate, 'YYYY-MM-DD') AS fecha,
                   BUILTIN.DF(t.employee) AS representante, BUILTIN.DF(tl.subsidiary) AS subsidiaria
            FROM transaction t
            INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
            WHERE t.id IN ({", ".join(str(int(i)) for i in faltantes)})""")
        encontrados = {int(f["id"]) for f in filas}
        for f in filas:
            print(f"    {f}")
        for i in faltantes:
            if i not in encontrados:
                print(f"    {i}: ya no existe en NetSuite (eliminada)")

    e = excel.set_index("ID interno")
    a = api.set_index("ID interno")
    comunes = sorted(ids_excel & ids_api)
    print("\nColumna por columna (sobre las oportunidades en ambos):")
    for col in COLUMNAS:
        if col not in a.columns:
            print(f"  {col:32} FALTA en SuiteQL")
            continue
        distintos = [i for i in comunes if norm(e.at[i, col]) != norm(a.at[i, col])]
        estado = "OK" if not distintos else f"{len(distintos)} distintos"
        print(f"  {col:32} {estado}")
        for i in distintos[:3]:
            print(f"      {i}: Excel={norm(e.at[i, col])!r}  SuiteQL={norm(a.at[i, col])!r}")


if __name__ == "__main__":
    main()

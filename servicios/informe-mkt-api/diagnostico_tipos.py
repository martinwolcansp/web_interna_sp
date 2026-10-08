# diagnostico_tipos.py — Cuenta las transacciones de un rango por tipo, para
# ver que tipos puede leer el rol de la integracion (si un tipo no aparece,
# el rol no tiene permiso o no hay ninguna). No escribe nada en NetSuite.
#
# Uso: python diagnostico_tipos.py 2026-09-01 2026-09-30

import sys

from app import netsuite

desde = sys.argv[1] if len(sys.argv) > 1 else "2026-09-01"
hasta = sys.argv[2] if len(sys.argv) > 2 else "2026-09-30"
rango = f"t.trandate BETWEEN TO_DATE('{desde}', 'YYYY-MM-DD') AND TO_DATE('{hasta}', 'YYYY-MM-DD')"


def probar(nombre, q):
    try:
        print(f"OK     {nombre}: {netsuite.suiteql(q)}")
    except Exception as e:
        print(f"ERROR  {nombre}: {str(e)[-250:]}")


print(f"Transacciones del {desde} al {hasta} que ve el rol, por tipo:\n")
probar("Por tipo", f"SELECT t.type AS tipo, COUNT(t.id) AS cantidad FROM transaction t WHERE {rango} GROUP BY t.type")

print()
for tipo in ("Estimate", "Opprtnty", "SalesOrd", "CustInvc"):
    probar(f"{tipo} en el rango", f"SELECT COUNT(t.id) AS cantidad FROM transaction t WHERE t.type = '{tipo}' AND {rango}")
probar("Estimate sin filtro de fecha", "SELECT COUNT(t.id) AS cantidad FROM transaction t WHERE t.type = 'Estimate'")
probar("Ultimos 3 Estimate", "SELECT t.id, t.tranid, t.trandate FROM transaction t WHERE t.type = 'Estimate' AND ROWNUM <= 3")
probar("Tipos personalizados (customtransactiontype)", "SELECT id, scriptid, name FROM customtransactiontype")

# diagnostico_relevamiento_cliente.py — Busca en el relevamiento posventa
# (customrecord_ap_sp_relevamiento_posventa) el campo que guarda el cliente.
# Solo lee NetSuite; no toca Supabase. Usa el .env de esta carpeta.
#
#   python diagnostico_relevamiento_cliente.py
#
# 1. Muestra todos los campos de algunos relevamientos SIN caso, con su valor.
# 2. Para cada campo con valor numerico, prueba si ese id es un cliente.

from app import netsuite

CAMPOS_CONOCIDOS = {
    "custrecord_ap_sp_posventa_caso", "custrecord_ap_sp_es_obra_constr", "custrecord_ap_sp_aplica_normativa",
    "custrecord_ap_sp_realizo_relev_posventa", "custrecord8", "custrecord_mw_sp_motivos_variacion_mo",
    "custrecord_ap_sp_comentarios_posventa", "custrecord_sp_relev_prioridad",
}

filas = netsuite.suiteql("""
    SELECT * FROM customrecord_ap_sp_relevamiento_posventa
    WHERE custrecord_ap_sp_posventa_caso IS NULL
    ORDER BY id DESC
    FETCH FIRST 5 ROWS ONLY
""")
print(f"Relevamientos sin caso leidos: {len(filas)}\n")

candidatos = {}
for f in filas:
    print(f"--- Relevamiento {f.get('id')} ---")
    for campo in sorted(f):
        if campo == "links":
            continue
        valor = f[campo]
        marca = "" if campo in CAMPOS_CONOCIDOS else "   <- campo no usado hoy"
        print(f"  {campo}: {valor}{marca}")
        if campo.startswith("custrecord") and campo not in CAMPOS_CONOCIDOS and str(valor or "").isdigit():
            candidatos.setdefault(campo, set()).add(int(valor))
    print()

print("=== Campos con un id que podria ser un cliente ===")
if not candidatos:
    print("  Ninguno. El relevamiento no parece tener un campo de cliente con valor en estos registros.")
for campo, ids in candidatos.items():
    lista = ", ".join(str(i) for i in sorted(ids))
    clientes = netsuite.suiteql(f"SELECT id, entityid, altname FROM customer WHERE id IN ({lista})")
    if clientes:
        print(f"  {campo}: SI es cliente ->", "; ".join(f"{c['entityid']} {c.get('altname') or ''}".strip() for c in clientes))
    else:
        print(f"  {campo}: no corresponde a clientes")

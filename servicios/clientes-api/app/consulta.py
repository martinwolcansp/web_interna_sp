# app/consulta.py — Consulta SuiteQL de clientes/establecimientos (tabla customer).
#
# Arma el SELECT con los campos de app/campos.py. Antes de la consulta grande
# prueba los campos opcionales con una sola fila: si NetSuite rechaza alguno,
# se omite ese grupo y queda como aviso de la corrida (en vez de fallar todo).

from app import campos, netsuite

# Cliente principal: parent (p) y, si existe, el parent del parent (p2).
JOIN_PADRES = ("LEFT JOIN customer p ON p.id = c.parent\n"
               "LEFT JOIN customer p2 ON p2.id = p.parent")
LOTE_IDS = 900  # SuiteQL admite hasta 1000 valores en un IN (...)


def _columnas(grupos, extra=None):
    cols = dict(campos.BASE)
    joins = []
    for g in grupos:
        cols.update(g["campos"])
        if g.get("join") and g["join"] not in joins:
            joins.append(g["join"])
    for e in extra or []:
        cols.update(e.get("campos", {}))
        if e.get("join") and e["join"] not in joins:
            joins.append(e["join"])
    return cols, joins


def armar(grupos, where, extra=None, order="c.id"):
    cols, joins = _columnas(grupos, extra)
    seleccion = ",\n    ".join(f"{expr} AS {alias}" for alias, expr in cols.items())
    return (f"SELECT\n    {seleccion}\nFROM customer c\n" + ("\n".join(joins) + "\n" if joins else "")
            + f"WHERE {where}\nORDER BY {order}")


def grupos_validos(log):
    """Grupos opcionales que NetSuite deja leer. Devuelve (grupos, avisos)."""
    grupos = campos.opcionales()
    try:
        netsuite.suiteql(armar(grupos, "ROWNUM <= 1"))
        return grupos, []
    except RuntimeError as e:
        log(f"La consulta completa fallo, se prueban los campos de a uno: {str(e)[:300]}")
    netsuite.suiteql(armar([], "ROWNUM <= 1"))  # si falla la base, que se vea el error real
    ok, avisos = [], []
    for g in grupos:
        try:
            netsuite.suiteql(armar([g], "ROWNUM <= 1"))
            ok.append(g)
        except RuntimeError as e:
            avisos.append(f"NetSuite no dejo leer {g['nombre']} (se omitio)")
            log(f"AVISO {g['nombre']}: {str(e)[:300]}")
    return ok, avisos


def consultar(grupos, where, extra=None):
    return netsuite.suiteql(armar(grupos, where, extra))


def por_ids(grupos, ids, extra=None):
    """Mismos campos, para una lista de ids (en lotes y en paralelo)."""
    ids = sorted({int(i) for i in ids})
    consultas = [armar(grupos, f"c.id IN ({', '.join(str(i) for i in ids[k:k + LOTE_IDS])})", extra)
                 for k in range(0, len(ids), LOTE_IDS)]
    return netsuite.suiteql_unidas(consultas)

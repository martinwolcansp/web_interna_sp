# app/fuentes/clasificacion.py — Clasificacion de los casos de instalacion.
#
# Dos dimensiones independientes:
#
#   Tipo de trabajo       Instalacion, Reprogramacion, Traslado, Ampliacion,
#                         Camaras... Sale del tipo de proyecto del caso, sin
#                         "Alarma ". Los tipos viejos Alarma Hogar / Alarma
#                         Comercio (hoy inactivos) eran unidad comercial, no
#                         tipo de trabajo: en esos casos se deduce del titulo
#                         del presupuesto.
#
#   Clasificacion         Unidad comercial (custbody_mw_sp_unidad_comercial)
#   comercial             > Categoria (custbody_3k_categoria). En NetSuite un
#                         script acota las categorias segun la unidad comercial.
#                         Se toma del presupuesto de origen de la OV de
#                         productos del caso; si no tiene, de la oportunidad;
#                         si tampoco, de la equivalencia del tipo de proyecto
#                         viejo (Alarma Hogar -> Hogar, etc.), sin categoria.
#
# Las equivalencias por defecto estan aca; la tabla
# ind_equivalencia_tipo_proyecto de Supabase, si tiene filas, las reemplaza.

import unicodedata

from app import netsuite
from app import supabase_rest as sb
from app.fuentes.comun import texto

TABLA_EQUIVALENCIAS = "ind_equivalencia_tipo_proyecto"

# tipo de proyecto -> (tipo de trabajo, unidad comercial). Tipo de trabajo None
# = se deduce del titulo del presupuesto.
EQUIVALENCIAS = {
    "Alarma Hogar": (None, "Hogar"),
    "Alarma Comercio": (None, "Comercio"),
    "Alarma Obra": ("Instalación", "Obra"),
}

# Deduccion del tipo de trabajo por el titulo del presupuesto (en orden).
REGLAS_TITULO = [
    (("REPROGRAM", "PUESTA EN VALOR", "CAMBIO DE CENTRAL"), "Reprogramación"),
    (("TRASLAD",), "Traslado"),
    (("AMPLIACI",), "Ampliación"),
]
TRABAJO_POR_DEFECTO = "Instalación"

LOTE_IDS = 300


def _normalizar(t):
    t = (t or "").upper()
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def _lotes(ids):
    ids = sorted({int(i) for i in ids if i})
    for i in range(0, len(ids), LOTE_IDS):
        yield ",".join(str(x) for x in ids[i:i + LOTE_IDS])


def trabajo_de_titulo(titulo):
    t = _normalizar(titulo)
    for claves, trabajo in REGLAS_TITULO:
        if any(k in t for k in claves):
            return trabajo
    if "CAMARA" in t and "ALARMA" not in t:
        return "Cámaras"
    return TRABAJO_POR_DEFECTO


def trabajo_de_tipo(tipo_proyecto):
    """'Alarma Reprogramación' -> 'Reprogramación'; 'Cámaras' queda igual."""
    t = texto(tipo_proyecto)
    if not t:
        return None
    return t[len("Alarma "):] if t.startswith("Alarma ") else t


def cargar_equivalencias(token, log):
    """Equivalencias de Supabase (si las hay) o las de este archivo."""
    if not token:
        return dict(EQUIVALENCIAS)
    try:
        filas = sb.leer(token, TABLA_EQUIVALENCIAS, "tipo_proyecto,tipo_trabajo,unidad_comercial")
    except Exception as e:
        log(f"AVISO: no se pudieron leer las equivalencias de Supabase ({e}); se usan las del servicio.")
        return dict(EQUIVALENCIAS)
    if not filas:
        return dict(EQUIVALENCIAS)
    return {f["tipo_proyecto"]: (texto(f.get("tipo_trabajo")), texto(f.get("unidad_comercial"))) for f in filas}


def _origenes(crudas):
    """Presupuesto y oportunidad de cada caso, via su OV de productos."""
    ovs = {}
    for lote in _lotes(f.get("ov_productos_id") for f in crudas):
        for f in netsuite.suiteql(f"""
            SELECT t.id AS id, t.custbody_3k_trans_orig_ov AS presupuesto_id, t.opportunity AS oportunidad_id
            FROM transaction t
            WHERE t.id IN ({lote})
            ORDER BY t.id
        """):
            ovs[int(f["id"])] = f
    pres = {}
    for lote in _lotes(o.get("presupuesto_id") for o in ovs.values()):
        for f in netsuite.suiteql(f"""
            SELECT e.id AS id, e.title AS titulo, e.opportunity AS oportunidad_id,
                   BUILTIN.DF(e.custbody_mw_sp_unidad_comercial) AS uc,
                   BUILTIN.DF(e.custbody_3k_categoria) AS categoria
            FROM transaction e
            WHERE e.id IN ({lote})
            ORDER BY e.id
        """):
            pres[int(f["id"])] = f
    op_ids = [p.get("oportunidad_id") for p in pres.values()] + [o.get("oportunidad_id") for o in ovs.values()]
    ops = {}
    for lote in _lotes(op_ids):
        for f in netsuite.suiteql(f"""
            SELECT o.id AS id, o.title AS titulo,
                   BUILTIN.DF(o.custbody_mw_sp_unidad_comercial) AS uc,
                   BUILTIN.DF(o.custbody_3k_categoria) AS categoria
            FROM transaction o
            WHERE o.id IN ({lote})
            ORDER BY o.id
        """):
            ops[int(f["id"])] = f
    return ovs, pres, ops


def clasificar(crudas, equivalencias, log):
    """Agrega a cada fila cruda (caso de SuiteQL) tipo_trabajo, unidad_comercial,
    categoria y sus origenes."""
    ovs, pres, ops = _origenes(crudas)
    cuenta = {}
    for f in crudas:
        ov = ovs.get(int(f["ov_productos_id"])) if f.get("ov_productos_id") else None
        p = pres.get(int(ov["presupuesto_id"])) if ov and ov.get("presupuesto_id") else None
        op_id = (p or {}).get("oportunidad_id") or (ov or {}).get("oportunidad_id")
        op = ops.get(int(op_id)) if op_id else None
        tipo = texto(f.get("tipo_proyecto"))
        eq_trabajo, eq_uc = equivalencias.get(tipo, (False, None))

        # Clasificacion comercial: presupuesto > oportunidad > equivalencia.
        uc, origen = None, None
        for fuente, nombre in ((p, "presupuesto"), (op, "oportunidad")):
            if fuente and texto(fuente.get("uc")):
                uc, origen = texto(fuente.get("uc")), nombre
                break
        categoria = texto((p or {}).get("categoria")) or texto((op or {}).get("categoria"))
        if not uc and eq_uc:
            uc, origen = eq_uc, "equivalencia"
        f["unidad_comercial"], f["categoria"], f["clasificacion_origen"] = uc, categoria, origen

        # Tipo de trabajo: tipo de proyecto (sin "Alarma"); los viejos, por titulo.
        if eq_trabajo is None:
            titulo = texto((p or {}).get("titulo")) or texto((op or {}).get("titulo"))
            f["tipo_trabajo"] = trabajo_de_titulo(titulo)
            f["tipo_trabajo_origen"] = "título del presupuesto" if titulo else "por defecto (sin título)"
        elif eq_trabajo:
            f["tipo_trabajo"], f["tipo_trabajo_origen"] = eq_trabajo, "equivalencia"
        else:
            f["tipo_trabajo"] = trabajo_de_tipo(tipo)
            f["tipo_trabajo_origen"] = "tipo de proyecto" if f["tipo_trabajo"] else None
        cuenta[origen] = cuenta.get(origen, 0) + 1
    log("Clasificacion comercial por origen: " + ", ".join(f"{k or 'sin dato'} {v}" for k, v in sorted(cuenta.items(), key=lambda x: -x[1])) + ".")

# app/comisiones.py — Base de comisiones por vendedor (13/10/2026).
#
# POST /informe-mkt/comisiones {desde, hasta} (app/main.py). Se consulta en
# vivo a NetSuite (no se guarda nada), para el boton "Comisiones por vendedor"
# del Informe por vendedor.
#
# Criterio:
#   - Oportunidades ganadas del periodo: las mismas del informe (busqueda 2933,
#     fecha de oportunidad en el rango, estado 12 / 13 = "Aprobada").
#   - OV relacionadas: ordenes de venta (SalesOrd) cuya oportunidad es una de
#     las ganadas, o cuyo presupuesto de origen (custbody_3k_trans_orig_ov)
#     pertenece a una de las ganadas. Cualquier tipo de orden de venta.
#   - Abonos: lineas de la OV cuyo articulo empieza con "ABO" (ABO-10, ABO-16,
#     ABO-57 ...). En las OV de comodato entran varios abonos.
#   - Comisionable: ABO 16, o ABO 10 + ABO 11 (el ABO 16 reemplaza a la suma;
#     por ahora vale cualquiera de los dos). La base es el importe de esas
#     lineas. Si una OV tiene ABO 16 y tambien ABO 10 / 11, se toma el ABO 16
#     y la OV queda marcada para revisar.
# Vendedor = representante de ventas de la oportunidad (normalizado como en el
# resto del informe). El representante de la OV viaja aparte.

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config, netsuite
from app.resumen_ejecutivo import normalizar_vendedor_netsuite

ABO_16 = 16
ABO_10, ABO_11 = 10, 11

CLASIF_16 = "ABO 16"
CLASIF_10_11 = "ABO 10 + ABO 11"
CLASIF_AMBOS = "ABO 16 y ABO 10/11 (revisar)"
CLASIF_SOLO_10 = "Solo ABO 10 (falta ABO 11)"
CLASIF_SOLO_11 = "Solo ABO 11 (falta ABO 10)"
CLASIF_OTROS = "Solo otros ABO"
CLASIF_SIN = "Sin ABO"
COMISIONABLES = {CLASIF_16, CLASIF_10_11, CLASIF_AMBOS}

LOTE = 300
_RE_ABO = re.compile(r"^\s*ABO[\s\-_.]*0*(\d+)", re.I)


def numero_abo(codigo):
    """'ABO-16 Abono ...' -> 16; 'ABO-403-AC' -> 403; no ABO -> None."""
    m = _RE_ABO.match(str(codigo or ""))
    return int(m.group(1)) if m else None


def _lotes(ids):
    ids = sorted({int(i) for i in ids if i not in (None, "")})
    for i in range(0, len(ids), LOTE):
        yield ",".join(str(x) for x in ids[i:i + LOTE])


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _texto(v):
    v = None if v is None else str(v).strip()
    return v or None


def _si(v):
    return str(v or "").upper() in ("T", "TRUE", "1")


def _fecha(v):
    if v is None or (isinstance(v, float) and v != v):
        return None
    return str(v)[:10] or None


# ------------------------------------------------------------------ NetSuite

def _ovs_por_oportunidad(opp_ids):
    """{ov_id: fila} de las OV con oportunidad en opp_ids."""
    salida = {}
    for lote in _lotes(opp_ids):
        for f in netsuite.suiteql(_sql_ov(f"t.opportunity IN ({lote})")):
            salida[int(f["ov_id"])] = dict(f, vinculo="Oportunidad")
    return salida


def _presupuestos_de(opp_ids):
    """{presupuesto_id: (oportunidad_id, numero)} de los presupuestos de esas oportunidades."""
    salida = {}
    for lote in _lotes(opp_ids):
        for f in netsuite.suiteql(f"""
            SELECT e.id AS id, e.tranid AS tranid, e.opportunity AS oportunidad_id
            FROM transaction e
            WHERE e.type = 'Estimate' AND e.opportunity IN ({lote})
            ORDER BY e.id
        """):
            salida[int(f["id"])] = (int(f["oportunidad_id"]), f.get("tranid"))
    return salida


def _ovs_por_presupuesto(pres_ids):
    salida = {}
    for lote in _lotes(pres_ids):
        for f in netsuite.suiteql(_sql_ov(f"t.custbody_3k_trans_orig_ov IN ({lote})")):
            salida[int(f["ov_id"])] = dict(f, vinculo="Presupuesto")
    return salida


def _sql_ov(filtro):
    return f"""
        SELECT
            t.id                                            AS ov_id,
            t.tranid                                        AS ov_numero,
            TO_CHAR(t.trandate, 'YYYY-MM-DD')               AS fecha_ov,
            BUILTIN.DF(t.status)                            AS estado_ov,
            BUILTIN.DF(t.employee)                          AS representante_ov,
            t.foreigntotal                                  AS total_ov,
            t.custbody_3k_comodato                          AS comodato,
            BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta)   AS tipo_ov,
            BUILTIN.DF(t.custbody_mw_sp_unidad_comercial)   AS unidad_comercial,
            t.opportunity                                   AS oportunidad_id,
            t.custbody_3k_trans_orig_ov                     AS presupuesto_id,
            BUILTIN.DF(t.custbody_3k_trans_orig_ov)         AS presupuesto
        FROM transaction t
        WHERE t.type = 'SalesOrd' AND {filtro}
        ORDER BY t.id
    """


# Importe de la linea: se prueba de la mas completa a la mas simple, por si el
# rol no puede leer algun campo.
_CAMPOS_IMPORTE = [
    "tl.rate AS precio, tl.foreignamount AS importe,",
    "tl.rate AS precio, tl.netamount AS importe,",
    "",
]


def _lineas_abo(ov_ids, log):
    """{ov_id: [lineas ABO]}."""
    por_ov, vistas = {}, set()
    for lote in _lotes(ov_ids):
        for i, campos in enumerate(_CAMPOS_IMPORTE):
            try:
                # Sin JOIN a item: el rol no puede leer ese registro ("Record
                # 'item' was not found"). El nombre sale de BUILTIN.DF y los ABO
                # se filtran en Python (igual que indicadores-api/fuentes/ov.py).
                filas = netsuite.suiteql(f"""
                    SELECT
                        tl.transaction                  AS ov_id,
                        tl.id                           AS linea_id,
                        BUILTIN.DF(tl.item)             AS articulo,
                        {campos}
                        -tl.quantity                    AS cantidad
                    FROM transactionline tl
                    WHERE tl.transaction IN ({lote})
                      AND tl.mainline = 'F'
                      AND tl.item IS NOT NULL
                    ORDER BY tl.transaction, tl.id
                """)
                break
            except RuntimeError as e:
                if i == len(_CAMPOS_IMPORTE) - 1:
                    raise
                log(f"AVISO: no se pudo leer el importe de las lineas con [{campos.strip()}]: {str(e)[-300:]}")
        for f in filas:
            clave = (int(f["ov_id"]), int(f["linea_id"]))
            if clave in vistas:
                continue
            vistas.add(clave)
            articulo = _texto(f.get("articulo"))
            if not articulo or not articulo.upper().startswith("ABO"):
                continue
            importe = _num(f.get("importe"))
            cantidad = _num(f.get("cantidad"))
            precio = _num(f.get("precio"))
            por_ov.setdefault(clave[0], []).append({
                "linea_id": clave[1],
                # "ABO-16 Abono Mensual de Monitoreo" -> codigo "ABO-16"
                "codigo": articulo.split()[0],
                "numero": numero_abo(articulo),
                "articulo": articulo,
                "cantidad": abs(cantidad) if cantidad is not None else None,
                "precio": abs(precio) if precio is not None else None,
                # En SuiteQL las lineas de OV vienen con signo negativo.
                "importe": abs(importe) if importe is not None else None,
            })
    return por_ov


# ------------------------------------------------------------- clasificacion

def clasificar(abonos):
    """(clasificacion, comisionable, base, numeros que cuentan)."""
    nums = {a["numero"] for a in abonos if a.get("numero") is not None}
    tiene16, tiene10, tiene11 = ABO_16 in nums, ABO_10 in nums, ABO_11 in nums
    if tiene16 and (tiene10 or tiene11):
        clasif, cuentan = CLASIF_AMBOS, {ABO_16}
    elif tiene16:
        clasif, cuentan = CLASIF_16, {ABO_16}
    elif tiene10 and tiene11:
        clasif, cuentan = CLASIF_10_11, {ABO_10, ABO_11}
    elif tiene10:
        clasif, cuentan = CLASIF_SOLO_10, set()
    elif tiene11:
        clasif, cuentan = CLASIF_SOLO_11, set()
    elif abonos:
        clasif, cuentan = CLASIF_OTROS, set()
    else:
        clasif, cuentan = CLASIF_SIN, set()
    base = sum((a.get("importe") or 0) for a in abonos if a.get("numero") in cuentan)
    return clasif, clasif in COMISIONABLES, round(base, 2), cuentan


# ------------------------------------------------------------------- armado

def generar(desde, hasta, log):
    avisos = []

    def aviso(msg):
        avisos.append(msg)
        log(msg)

    df = netsuite.traer_oportunidades(desde, hasta, log)
    ganadas = df[df["Aprobada"] == 1] if len(df) else df
    opps = {}
    for _, r in ganadas.iterrows():
        comodato = r.get("Comodato")
        opps[int(r["ID interno"])] = {
            "oportunidad_id": int(r["ID interno"]),
            "oportunidad": _texto(r.get("Oportunidad")),
            "fecha_oportunidad": _fecha(r.get("Fecha Oportunidad")),
            "estado_oportunidad": _texto(r.get("Estado Oportunidad")),
            "vendedor": normalizar_vendedor_netsuite(_texto(r.get("Representante de Ventas"))) or "Sin asignar",
            "cliente": _texto(r.get("Cliente")),
            "nro_cliente": _texto(r.get("ID")),
            "unidad_negocio": _texto(r.get("Unidad de Negocio")),
            "tipo_establecimiento": _texto(r.get("Tipo de establecimiento")),
            "categoria": _texto(r.get("Categoría")),
            "comodato_oportunidad": None if comodato in (None, "") or comodato != comodato else _si(comodato),
        }

    ovs = _ovs_por_oportunidad(opps) if opps else {}
    pres = {}
    if opps:
        try:
            pres = _presupuestos_de(opps)
            for ov_id, f in _ovs_por_presupuesto(pres).items():
                if ov_id in ovs:
                    ovs[ov_id]["vinculo"] = "Oportunidad y presupuesto"
                else:
                    ovs[ov_id] = f
        except RuntimeError as e:
            aviso(f"No se pudieron buscar OV por presupuesto de origen; solo se usan las vinculadas a la oportunidad: {str(e)[:300]}")
    lineas = _lineas_abo(ovs, log) if ovs else {}

    filas = []
    con_ov = set()
    for ov_id, f in sorted(ovs.items()):
        opp_id = int(f["oportunidad_id"]) if f.get("oportunidad_id") else None
        if opp_id not in opps and f.get("presupuesto_id"):
            opp_id = pres.get(int(f["presupuesto_id"]), (None, None))[0]
        o = opps.get(opp_id)
        if not o:  # OV de una oportunidad que no es ganada del periodo
            continue
        con_ov.add(opp_id)
        abonos = lineas.get(ov_id, [])
        clasif, comisionable, base, cuentan = clasificar(abonos)
        for a in abonos:
            a["cuenta"] = a.get("numero") in cuentan
        filas.append(dict(
            o,
            ov_id=ov_id,
            ov_numero=_texto(f.get("ov_numero")),
            fecha_ov=_fecha(f.get("fecha_ov")),
            estado_ov=_texto(f.get("estado_ov")),
            tipo_ov=_texto(f.get("tipo_ov")),
            representante_ov=normalizar_vendedor_netsuite(_texto(f.get("representante_ov"))),
            total_ov=_num(f.get("total_ov")),
            comodato=_si(f.get("comodato")),
            unidad_comercial=_texto(f.get("unidad_comercial")),
            presupuesto=_texto(f.get("presupuesto")),
            vinculo=f.get("vinculo"),
            abonos=abonos,
            clasificacion=clasif,
            comisionable=comisionable,
            base_comisionable=base if comisionable else 0,
            importe_otros_abo=round(sum((a.get("importe") or 0) for a in abonos if not a["cuenta"]), 2),
        ))

    sin_ov = [o for k, o in sorted(opps.items()) if k not in con_ov]
    log(f"Comisiones: {len(opps)} oportunidades ganadas, {len(filas)} OV relacionadas "
        f"({sum(1 for f in filas if f['comisionable'])} con ABO comisionable), {len(sin_ov)} ganadas sin OV.")
    return {
        "version": 1,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "generado_en": datetime.now(ZoneInfo(config.ZONA_HORARIA)).isoformat(timespec="seconds"),
        "ganadas": len(opps),
        "ovs": filas,
        "sin_ov": sin_ov,
        "clasificaciones": [CLASIF_16, CLASIF_10_11, CLASIF_AMBOS, CLASIF_SOLO_10, CLASIF_SOLO_11, CLASIF_OTROS, CLASIF_SIN],
        "comisionables": sorted(COMISIONABLES),
        "avisos": avisos,
    }

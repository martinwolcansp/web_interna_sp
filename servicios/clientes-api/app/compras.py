# app/compras.py — Compras de cada cliente: ordenes de venta de productos.
#
# Se trae en la actualizacion de Segmentacion (tabla cli_compra, una fila por
# OV). Criterio, definido con MKT el 30/10/2026:
#   - OV (SalesOrd) con tipo de orden de venta = 1 (productos), igual que
#     Indicadores; las demas OV no son compras.
#   - Desde COMPRAS_DESDE (2022-01-01, migracion a ByKom).
#   - Las OV en comodato cuentan como compra, marcadas (es_comodato).
#   - Se descartan las OV anuladas o canceladas.
#
# Tipo de compra:
#   unidad_negocio    clase de la OV (ej. "Alarmas : Comunicaciones"): esta siempre.
#   unidad_comercial  Hogar / Comercio / Obra... (custbody_mw_sp_unidad_comercial):
#                     de la OV; si no, del presupuesto de origen; si no, de la
#                     oportunidad. Cargado en oportunidades desde mar-2026 y en
#                     presupuestos desde sep-2026: las compras viejas no lo tienen.
#
# Cada OV se asigna al cliente principal de su entidad (la OV puede estar a
# nombre del establecimiento o del cliente). Las OV de entidades que no estan
# en la base de clientes (ej. clientes potenciales) se descartan con aviso.

from app import config, netsuite
from app.comun import entero, numero, texto

LOTE_IDS = 900


def _consulta(con_extra=True):
    extra = (",\n            t.foreigntotal AS total,\n            BUILTIN.DF(t.status) AS estado" if con_extra else "")
    return f"""
        SELECT
            t.id AS ov_id,
            t.tranid AS numero,
            TO_CHAR(t.trandate, 'YYYY-MM-DD') AS fecha,
            t.entity AS entidad_id,
            BUILTIN.DF(t.class) AS unidad_negocio,
            BUILTIN.DF(t.custbody_mw_sp_unidad_comercial) AS uc_ov,
            t.custbody_3k_comodato AS comodato,
            t.opportunity AS oportunidad_id,
            t.custbody_3k_trans_orig_ov AS presupuesto_id{extra}
        FROM transaction t
        WHERE t.type = 'SalesOrd'
          AND t.custbody_3k_tipo_orden_de_venta = 1
          AND t.trandate >= TO_DATE('{config.COMPRAS_DESDE}', 'YYYY-MM-DD')
        ORDER BY t.id
    """


def _unidad_comercial_origen(ovs, log):
    """Unidad comercial de presupuestos y oportunidades (para las OV sin ella).
    Devuelve {id transaccion: {"uc": ..., "oportunidad_id": ...}}."""
    pres = {entero(o.get("presupuesto_id")) for o in ovs if not texto(o.get("uc_ov"))} - {None}
    datos = {}

    def leer(ids):
        ids = sorted(ids - set(datos))
        consultas = [f"""SELECT e.id AS id, BUILTIN.DF(e.custbody_mw_sp_unidad_comercial) AS uc,
                                e.opportunity AS oportunidad_id
                         FROM transaction e WHERE e.id IN ({', '.join(str(i) for i in ids[k:k + LOTE_IDS])})
                         ORDER BY e.id""" for k in range(0, len(ids), LOTE_IDS)]
        for f in netsuite.suiteql_unidas(consultas):
            datos[int(f["id"])] = f

    leer(pres)
    opps = {entero(o.get("oportunidad_id")) for o in ovs if not texto(o.get("uc_ov"))}
    opps |= {entero(d.get("oportunidad_id")) for d in datos.values()}
    leer(opps - {None})
    log(f"Unidad comercial: {len(pres)} presupuestos y {len(opps - {None})} oportunidades consultados")
    return datos


def traer(por_id, raiz, corrida_id, ts, log):
    """OV de productos -> (filas cli_compra, avisos). por_id/raiz: de segmentacion."""
    avisos = []
    try:
        ovs = netsuite.suiteql(_consulta(True))
    except RuntimeError as e:
        log(f"La consulta de OV con monto y estado fallo, se repite sin ellos: {str(e)[:300]}")
        ovs = netsuite.suiteql(_consulta(False))
        avisos.append("NetSuite no dejo leer monto y estado de las OV (se omitieron)")
    log(f"{len(ovs)} OV de productos desde {config.COMPRAS_DESDE}")

    anuladas = [o for o in ovs if any(p in str(o.get("estado") or "").upper() for p in ("ANULAD", "CANCEL"))]
    ovs = [o for o in ovs if o not in anuladas]
    origen = _unidad_comercial_origen(ovs, log)

    filas, sin_cliente = [], 0
    for o in ovs:
        ent = entero(o.get("entidad_id"))
        if ent not in por_id:
            sin_cliente += 1
            continue
        cliente = raiz[ent]
        uc, uc_origen = texto(o.get("uc_ov")), "ov" if texto(o.get("uc_ov")) else None
        if not uc:
            p = origen.get(entero(o.get("presupuesto_id")) or -1)
            if p and texto(p.get("uc")):
                uc, uc_origen = texto(p["uc"]), "presupuesto"
        if not uc:
            op = entero(o.get("oportunidad_id")) or entero((origen.get(entero(o.get("presupuesto_id")) or -1) or {}).get("oportunidad_id"))
            d = origen.get(op or -1)
            if d and texto(d.get("uc")):
                uc, uc_origen = texto(d["uc"]), "oportunidad"
        filas.append({
            "ov_id": int(o["ov_id"]),
            "numero": texto(o.get("numero")),
            "fecha": texto(o.get("fecha")),
            "cliente_ns_id": cliente,
            "entidad_ns_id": ent,
            "establecimiento_ns_id": ent if ent != cliente or texto(por_id[ent].get("nro_cuenta")) else None,
            "unidad_negocio": texto(o.get("unidad_negocio")),
            "unidad_comercial": uc,
            "unidad_comercial_origen": uc_origen,
            "es_comodato": str(o.get("comodato") or "").upper() == "T",
            "total": numero(o.get("total")),
            "estado": texto(o.get("estado")),
            "oportunidad_id": entero(o.get("oportunidad_id")),
            "presupuesto_id": entero(o.get("presupuesto_id")),
            "vigente": True,
            "corrida_id": corrida_id,
            "actualizado_en": ts,
        })
    if anuladas:
        log(f"{len(anuladas)} OV anuladas o canceladas descartadas")
    if sin_cliente:
        log(f"{sin_cliente} OV de entidades que no estan en la base de clientes (descartadas)")
        avisos.append(f"{sin_cliente} OV a nombre de entidades fuera de la base de clientes (no se cuentan)")
    return filas, avisos

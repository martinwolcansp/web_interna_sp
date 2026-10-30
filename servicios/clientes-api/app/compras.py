# app/compras.py — Compras de cada cliente: ordenes de venta de productos.
#
# Se trae en la actualizacion de Segmentacion (tabla cli_compra, una fila por
# OV, alcance "nuevas"). Criterio, definido con MKT el 30/10/2026:
#   - Solo instalaciones nuevas: unidades "Alarmas : Nuevas" y "Alarmas :
#     Comodato" (COMPRAS_UNIDADES), fusionadas. Las OV de
#     otras unidades (Servicio tecnico, Ampliaciones...) las cargaran otros
#     informes en la misma tabla con su propio alcance.
#   - OV (SalesOrd) con tipo de orden de venta = 1 (productos), igual que
#     Indicadores; las demas OV no son compras.
#   - Desde COMPRAS_DESDE (2022-01-01, migracion a ByKom).
#   - Las OV en comodato cuentan como compra, marcadas (es_comodato).
#   - Se descartan las OV anuladas o canceladas.
#
# La unidad de negocio y la unidad comercial (solo la de la OV) se guardan pero
# el informe no las muestra: todas las compras son instalaciones nuevas. No se
# consulta la unidad comercial de presupuestos ni oportunidades (ahi aparecian
# Ampliaciones y Servicio Tecnico); se saco el 30/10/2026.
#
# Cada OV se asigna al cliente principal de su entidad (la OV puede estar a
# nombre del establecimiento o del cliente). Las OV de entidades que no estan
# en la base de clientes (ej. clientes potenciales) se descartan con aviso.

from datetime import date

from app import config, netsuite
from app.comun import entero, numero, texto

# Variantes de la consulta, de la mas completa a la mas simple. La unidad de
# negocio (class) NO esta en transaction: esta en la linea principal
# (transactionline.mainline = 'T'), como en informe-mkt-api e indicadores-api.
# Pedir t.class hacia responder a NetSuite 500 UNEXPECTED_ERROR (30/10/2026).
# El nombre completo ("Alarmas : Comunicaciones") sale de classification, que
# requiere el permiso "Clases" en el rol; si no, BUILTIN.DF da solo la ultima parte.
VARIANTES = [
    {"nombre": "completa", "clase_completa": True, "extra": True},
    {"nombre": "sin nombre completo de la clase", "clase_completa": False, "extra": True},
    {"nombre": "sin monto ni estado", "clase_completa": False, "extra": False},
]


def _filtro_unidades(clase_completa):
    """Condicion sobre la unidad de negocio. Sin classification, BUILTIN.DF da
    solo la ultima parte ("Nuevas"), asi que se compara con esa parte."""
    if not config.COMPRAS_UNIDADES:
        return ""
    if clase_completa:
        valores, expr = config.COMPRAS_UNIDADES, "cl.fullname"
    else:
        valores, expr = [u.split(" : ")[-1] for u in config.COMPRAS_UNIDADES], "BUILTIN.DF(tl.class)"
    lista = ", ".join("'" + v.replace("'", "''") + "'" for v in valores)
    return f"\n          AND {expr} IN ({lista})"


def _consulta(desde, hasta, clase_completa=True, con_extra=True):
    unidad = "cl.fullname" if clase_completa else "BUILTIN.DF(tl.class)"
    join_clase = "        LEFT JOIN classification cl ON cl.id = tl.class\n" if clase_completa else ""
    extra = (",\n            t.foreigntotal AS total,\n            BUILTIN.DF(t.status) AS estado" if con_extra else "")
    return f"""
        SELECT
            t.id AS ov_id,
            t.tranid AS numero,
            TO_CHAR(t.trandate, 'YYYY-MM-DD') AS fecha,
            t.entity AS entidad_id,
            {unidad} AS unidad_negocio,
            BUILTIN.DF(t.custbody_mw_sp_unidad_comercial) AS uc_ov,
            t.custbody_3k_comodato AS comodato,
            t.opportunity AS oportunidad_id,
            t.custbody_3k_trans_orig_ov AS presupuesto_id{extra}
        FROM transaction t
        INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
{join_clase}        WHERE t.type = 'SalesOrd'
          AND t.custbody_3k_tipo_orden_de_venta = 1
          AND t.trandate >= TO_DATE('{desde}', 'YYYY-MM-DD')
          AND t.trandate < TO_DATE('{hasta}', 'YYYY-MM-DD'){_filtro_unidades(clase_completa)}
        ORDER BY t.id
    """


def traer(por_id, raiz, corrida_id, ts, log):
    """OV de productos -> (filas cli_compra, avisos). por_id/raiz: de segmentacion."""
    avisos = []
    # Una consulta por anio: con todas las OV desde 2022 juntas NetSuite puede
    # responder 500 (consulta pesada).
    desde = date.fromisoformat(config.COMPRAS_DESDE)
    rangos = []
    for anio in range(desde.year, date.today().year + 1):
        rangos.append((max(desde, date(anio, 1, 1)).isoformat(), date(anio + 1, 1, 1).isoformat()))
    # Se prueba cada variante con un mes antes de la consulta grande.
    hoy = date.today()
    mes = (date(hoy.year, hoy.month, 1).isoformat(), hoy.isoformat() if hoy.day > 1 else date(hoy.year, hoy.month, 2).isoformat())
    elegida, errores = None, []
    for v in VARIANTES:
        try:
            netsuite.suiteql(_consulta(*mes, v["clase_completa"], v["extra"]))
            elegida = v
            break
        except RuntimeError as e:
            errores.append(f"{v['nombre']}: {str(e)[:200]}")
            log(f"Consulta de OV ({v['nombre']}) rechazada: {str(e)[:300]}")
    if elegida is None:
        raise RuntimeError("NetSuite rechazo todas las variantes de la consulta de OV. " + " | ".join(errores))
    if elegida is not VARIANTES[0]:
        avisos.append(f"Compras: consulta {elegida['nombre']}")
    ovs = netsuite.suiteql_unidas([_consulta(a, b, elegida["clase_completa"], elegida["extra"]) for a, b in rangos])
    log(f"{len(ovs)} OV de productos desde {config.COMPRAS_DESDE} ({', '.join(config.COMPRAS_UNIDADES) or 'todas las unidades'})")

    anuladas = [o for o in ovs if any(p in str(o.get("estado") or "").upper() for p in ("ANULAD", "CANCEL"))]
    ovs = [o for o in ovs if o not in anuladas]
    filas, sin_cliente = [], 0
    for o in ovs:
        ent = entero(o.get("entidad_id"))
        if ent not in por_id:
            sin_cliente += 1
            continue
        cliente = raiz[ent]
        uc = texto(o.get("uc_ov"))
        filas.append({
            "ov_id": int(o["ov_id"]),
            "alcance": config.COMPRAS_ALCANCE,
            "numero": texto(o.get("numero")),
            "fecha": texto(o.get("fecha")),
            "cliente_ns_id": cliente,
            "entidad_ns_id": ent,
            "establecimiento_ns_id": ent if ent != cliente or texto(por_id[ent].get("nro_cuenta")) else None,
            "unidad_negocio": texto(o.get("unidad_negocio")),
            "unidad_comercial": uc,
            "unidad_comercial_origen": "ov" if uc else None,
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

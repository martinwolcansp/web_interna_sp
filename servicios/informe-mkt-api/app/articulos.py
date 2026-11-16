# app/articulos.py — Actualizacion de articulos, precios, presupuestos y OV de
# productos de NetSuite (13/11/2026, migracion 48).
#
# Es una actualizacion MANUAL y aparte del Informe MKT (no le suma tiempo a la
# corrida del informe). La dispara POST /articulos/actualizar {desde, hasta} o,
# desde la PC, actualizar_articulos.py.
#
# Pasos:
#   1. Catalogo completo (item, ~930 articulos) y precio base en pesos
#      (pricing: nivel 1, moneda 1, la cantidad minima). Los de comodato
#      (CC-XXX) guardan el articulo de venta equivalente (XXX). Si el precio
#      cambio respecto de lo guardado, se agrega una fila al historial
#      (ns_articulo_precio).
#   2. Presupuestos (Estimate) y OV de productos (SalesOrd de tipo PRODUCTOS,
#      PRODUCTOS y ABONOS o sin tipo) de S.P. SEGURIDAD PRIVADA S.A. con fecha
#      en el rango, y sus lineas de articulo. Las OV mensuales de ABONOS
#      (Contrato) no se traen.
#   3. Dentro del rango, las transacciones que ya no estan en NetSuite se borran.
#
# Signos: en SuiteQL las lineas de OV y presupuesto vienen en negativo; se
# invierte el signo, asi los descuentos quedan negativos.
#
# Lo que se probo con septiembre 2026 (diagnostico_articulos.py):
#   - el rol lee item y pricing (no pricelevel, currency ni baseprice);
#   - moneda 1 = pesos; la 2 es otra moneda;
#   - 119 de 119 lineas de equipos en comodato se valorizan por el equivalente.

import re
from datetime import datetime
from zoneinfo import ZoneInfo

import requests

from app import config, netsuite
from app import supabase_rest as sb

MONEDA_PESOS = "1"
NIVEL_PRECIO_BASE = "1"
LOTE = 300
MINUTOS_COLGADA = 60


# ------------------------------------------------------------ utilidades

def codigo(nombre):
    """'CEN019 Central ...' -> 'CEN019'; 'CC-CEN020 Central ...' -> 'CC-CEN020'."""
    partes = str(nombre or "").split()
    return partes[0].upper() if partes else None


def categoria(articulo, tipo_articulo):
    if str(articulo or "").strip().upper().startswith("ABO"):
        return "ABO"
    if tipo_articulo == "Discount":
        return "Descuento"
    if tipo_articulo in ("Service", "OthCharge"):
        return "Servicio"
    return "Equipo"


def _num(v):
    try:
        return float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _con_signo(v):
    n = _num(v)
    return None if n is None else -n


def _abs(v):
    n = _num(v)
    return None if n is None else abs(n)


def _si(v):
    return str(v or "").upper() in ("T", "TRUE", "1")


def _int(v):
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _lotes(ids):
    ids = sorted({int(i) for i in ids if i not in (None, "")})
    for i in range(0, len(ids), LOTE):
        yield ",".join(str(x) for x in ids[i:i + LOTE])


def _hoy():
    return datetime.now(ZoneInfo(config.ZONA_HORARIA)).date()


# ------------------------------------------------------- 1. catalogo

def traer_catalogo(log):
    """[{fila de ns_articulo}] con precio y equivalente."""
    con_custom = True
    try:
        items = netsuite.suiteql("""
            SELECT id, itemid, itemtype, isinactive, BUILTIN.DF(class) AS clase,
                   custitem_3k_item_de_comodato AS es_comodato,
                   custitem_3k_habilitado_para_venta AS habilitado_venta
            FROM item""")
    except RuntimeError as e:
        log(f"AVISO: no se pudieron leer los campos de comodato / clase de los articulos ({str(e)[-200:]}); "
            "se leen sin ellos.")
        con_custom = False
        items = netsuite.suiteql("SELECT id, itemid, itemtype, isinactive FROM item")

    precios = {}  # id -> (cantidad minima, precio)
    for f in netsuite.suiteql(f"""
            SELECT item, unitprice, quantity FROM pricing
            WHERE pricelevel = {NIVEL_PRECIO_BASE} AND currency = {MONEDA_PESOS}"""):
        aid, precio = _int(f.get("item")), _num(f.get("unitprice"))
        if aid is None or precio is None:
            continue
        q = _num(f.get("quantity")) or 1
        if aid not in precios or q < precios[aid][0]:
            precios[aid] = (q, precio)

    filas = []
    for f in items:
        aid = _int(f.get("id"))
        if aid is None:
            continue
        precio = precios.get(aid, (None, None))[1]
        filas.append({
            "id": aid,
            "codigo": codigo(f.get("itemid")),
            "nombre": f.get("itemid"),
            "tipo": f.get("itemtype"),
            "activo": f.get("isinactive") != "T",
            # SuiteQL no devuelve los campos vacios: si la consulta los incluia, falta = No.
            "es_comodato": _si(f.get("es_comodato")) if con_custom else None,
            "habilitado_venta": _si(f.get("habilitado_venta")) if con_custom else None,
            "clase": f.get("clase"),
            "precio_lista": precio if precio and precio > 0 else None,
        })
    por_codigo = {}
    for f in sorted(filas, key=lambda x: (not x["activo"], x["id"])):  # prefiere activos
        if f["codigo"]:
            por_codigo.setdefault(f["codigo"], f["id"])
    for f in filas:
        c = f["codigo"] or ""
        f["equivalente_id"] = por_codigo.get(c[3:]) if c.startswith("CC-") else None
    log(f"Catalogo: {len(filas)} articulos, {sum(1 for f in filas if f['precio_lista'])} con precio en pesos, "
        f"{sum(1 for f in filas if f['equivalente_id'])} de comodato con equivalente de venta.")
    return filas


# --------------------------------------------- 2. transacciones y lineas

def es_ov_productos(tipo_ov):
    """OV de PRODUCTOS o PRODUCTOS y ABONOS (o sin tipo). Las de ABONOS (Contrato)
    solas son las mensuales de toda la cartera y no se guardan."""
    return tipo_ov in (None, "") or "PRODUCTOS" in str(tipo_ov).upper()


def _sql_encabezados(desde, hasta, filtrar_en_sql=True):
    custom = """
            BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta)   AS tipo_ov,
            t.custbody_3k_comodato                          AS comodato,
            t.custbody_3k_trans_orig_ov                     AS presupuesto_origen_id,"""
    # Filtrar en SuiteQL evita traer las ~9.600 OV mensuales de abonos; si
    # NetSuite no acepta el filtro, se traen todas y se filtra en Python.
    filtro_ov = ("(t.type = 'Estimate' OR (t.type = 'SalesOrd' AND "
                 "(t.custbody_3k_tipo_orden_de_venta IS NULL OR "
                 "UPPER(BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta)) LIKE '%PRODUCTOS%')))"
                 if filtrar_en_sql else "t.type IN ('Estimate', 'SalesOrd')")
    return f"""
        SELECT
            t.id                                            AS id,
            t.type                                          AS tipo,
            t.tranid                                        AS numero,
            TO_CHAR(t.trandate, 'YYYY-MM-DD')               AS fecha,
            BUILTIN.DF(t.status)                            AS estado,{custom}
            t.opportunity                                   AS oportunidad_id,
            c.id                                            AS cliente_id,
            NVL(c.companyname, c.altname)                   AS cliente,
            c.custentity_ghl_contact_id                     AS id_cliente_crm,
            BUILTIN.DF(t.employee)                          AS representante,
            t.foreigntotal                                  AS total,
            TO_CHAR(t.lastmodifieddate, 'YYYY-MM-DD HH24:MI:SS') AS modificado_en,
            BUILTIN.DF(tm.subsidiary)                       AS subsidiaria
        FROM transaction t
        INNER JOIN transactionline tm ON tm.transaction = t.id AND tm.mainline = 'T'
        LEFT JOIN customer c ON c.id = t.entity
        WHERE {filtro_ov}
          AND t.trandate BETWEEN TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD')
                             AND TO_DATE('{hasta.isoformat()}', 'YYYY-MM-DD')
        ORDER BY t.id
    """


def traer_transacciones(desde, hasta, log):
    """[{fila de ns_transaccion}] del rango (presupuestos y OV de productos)."""
    try:
        filas = netsuite.suiteql(_sql_encabezados(desde, hasta))
    except RuntimeError as e:
        log(f"AVISO: NetSuite no acepto el filtro por tipo de OV ({str(e)[-200:]}); se traen todas las OV "
            "del rango y se filtran aca (tarda mas).")
        try:
            filas = netsuite.suiteql(_sql_encabezados(desde, hasta, filtrar_en_sql=False))
        except RuntimeError as e2:
            raise RuntimeError(f"No se pudieron leer presupuestos y OV de NetSuite: {str(e2)[-400:]}")
    salida = []
    for f in filas:
        if not str(f.get("subsidiaria") or "").strip().endswith(netsuite.SUBSIDIARIA):
            continue
        es_ov = f.get("tipo") == "SalesOrd"
        if es_ov and not es_ov_productos(f.get("tipo_ov")):
            continue
        salida.append({
            "id": _int(f["id"]),
            "tipo": f.get("tipo"),
            "numero": f.get("numero"),
            "fecha": f.get("fecha"),
            "estado": f.get("estado"),
            "tipo_ov": f.get("tipo_ov") if es_ov else None,
            "comodato": _si(f.get("comodato")),
            "oportunidad_id": _int(f.get("oportunidad_id")),
            "presupuesto_origen_id": _int(f.get("presupuesto_origen_id")) if es_ov else None,
            "cliente_id": _int(f.get("cliente_id")),
            "cliente": f.get("cliente"),
            "id_cliente_crm": f.get("id_cliente_crm"),
            "representante": " ".join(str(f.get("representante") or "").split()) or None,
            "total": _num(f.get("total")),
            "modificado_en": f.get("modificado_en"),
        })
    log(f"NetSuite: {sum(1 for f in salida if f['tipo'] == 'Estimate')} presupuestos y "
        f"{sum(1 for f in salida if f['tipo'] == 'SalesOrd')} OV de productos en el rango.")
    return salida


_VARIANTES_LINEAS = [
    "tl.foreignamount AS importe, AND_TAX",
    "tl.netamount AS importe, AND_TAX",
    "tl.netamount AS importe,",
]


def traer_lineas(trans_ids, log):
    """[{fila de ns_transaccion_linea}] de esas transacciones."""
    salida, vistas = [], set()
    for lote in _lotes(trans_ids):
        filas = None
        for i, var in enumerate(_VARIANTES_LINEAS):
            importe, con_tax = var.replace(" AND_TAX", ""), "AND_TAX" in var
            try:
                filas = netsuite.suiteql(f"""
                    SELECT tl.transaction AS transaccion_id, tl.id AS linea_id, tl.item AS articulo_id,
                           BUILTIN.DF(tl.item) AS articulo, tl.itemtype AS tipo_articulo,
                           tl.rate AS precio, {importe} tl.quantity AS cantidad
                    FROM transactionline tl
                    WHERE tl.transaction IN ({lote}) AND tl.mainline = 'F' AND tl.item IS NOT NULL
                      {"AND tl.taxline = 'F'" if con_tax else ""}
                    ORDER BY tl.transaction, tl.id""")
                break
            except RuntimeError as e:
                if i == len(_VARIANTES_LINEAS) - 1:
                    raise
                log(f"AVISO: lineas con la variante {i + 1}: {str(e)[-200:]}")
        for f in filas:
            clave = (_int(f["transaccion_id"]), _int(f["linea_id"]))
            if clave in vistas:
                continue
            vistas.add(clave)
            salida.append({
                "transaccion_id": clave[0],
                "linea_id": clave[1],
                "articulo_id": _int(f.get("articulo_id")),
                "articulo": f.get("articulo"),
                "tipo_articulo": f.get("tipo_articulo"),
                "categoria": categoria(f.get("articulo"), f.get("tipo_articulo")),
                "cantidad": _abs(f.get("cantidad")),
                "precio": _abs(f.get("precio")),
                "importe": _con_signo(f.get("importe")),
            })
    log(f"NetSuite: {len(salida)} lineas de articulo.")
    return salida


# ------------------------------------------------------------ Supabase

def _post(token, tabla, fila):
    resp = requests.post(sb._rest(tabla), headers=sb._h(token, "return=representation"), json=fila, timeout=30)
    if resp.status_code == 409:
        return None
    return sb._check(resp, f"insertar en {tabla}").json()[0]


def crear_sincronizacion(token, desde, hasta, solicitado_por=None):
    """Devuelve la fila creada o None si ya hay una en curso."""
    # Cierra las colgadas (el servicio se reinicio a mitad de una).
    limite = datetime.now(ZoneInfo("UTC")).timestamp() - MINUTOS_COLGADA * 60
    for f in sb.leer_todo(token, "ns_sincronizacion", {"select": "id,iniciada_en", "estado": "eq.en_curso"},
                          "leer actualizaciones en curso"):
        inicio = datetime.fromisoformat(f["iniciada_en"].replace("Z", "+00:00")).timestamp()
        if inicio < limite:
            sb.actualizar(token, "ns_sincronizacion", {"id": f"eq.{f['id']}"},
                          {"estado": "error", "mensaje": "Quedo colgada (mas de 60 minutos) y se cerro.",
                           "finalizada_en": datetime.now(ZoneInfo("UTC")).isoformat()},
                          "cerrar actualizacion colgada")
    return _post(token, "ns_sincronizacion", {
        "tipo": "articulos", "desde": desde.isoformat(), "hasta": hasta.isoformat(),
        "estado": "en_curso", "paso": "Iniciando", "solicitado_por": solicitado_por})


def _avance(token, sinc_id, **cambios):
    if sinc_id:
        sb.actualizar(token, "ns_sincronizacion", {"id": f"eq.{sinc_id}"}, cambios, "actualizar avance")


def guardar_catalogo(token, filas, sinc_id, log):
    """Upsert del catalogo + historial de precios (solo cuando cambia)."""
    previos = {int(f["id"]): f.get("precio_lista")
               for f in sb.leer_todo(token, "ns_articulo", {"select": "id,precio_lista"}, "leer catalogo guardado")}
    hoy = _hoy().isoformat()
    historial = []
    for f in filas:
        nuevo = f["precio_lista"]
        viejo = _num(previos.get(f["id"])) if f["id"] in previos else "nuevo"
        if viejo == "nuevo":
            if nuevo is not None:
                historial.append({"articulo_id": f["id"], "vigente_desde": hoy, "precio": nuevo,
                                  "sincronizacion_id": sinc_id})
        elif (viejo is None) != (nuevo is None) or (nuevo is not None and abs(nuevo - viejo) > 0.005):
            historial.append({"articulo_id": f["id"], "vigente_desde": hoy, "precio": nuevo,
                              "sincronizacion_id": sinc_id})
    ahora = datetime.now(ZoneInfo("UTC")).isoformat()
    sb.upsert(token, "ns_articulo", [dict(f, sincronizacion_id=sinc_id, actualizado_en=ahora) for f in filas], "id")
    if historial:
        sb.upsert(token, "ns_articulo_precio", historial, "articulo_id,vigente_desde")
    log(f"Supabase: {len(filas)} articulos guardados; {len(historial)} precios nuevos o cambiados en el historial.")
    return len(historial)


def guardar_transacciones(token, desde, hasta, encabezados, lineas, sinc_id, log):
    ahora = datetime.now(ZoneInfo("UTC")).isoformat()
    ids = {f["id"] for f in encabezados}
    # Transacciones del rango que ya no vinieron (borradas o cambiadas de tipo en NetSuite).
    guardadas = sb.leer_todo(token, "ns_transaccion",
                             {"select": "id", "and": f"(fecha.gte.{desde.isoformat()},fecha.lte.{hasta.isoformat()})"},
                             "leer transacciones guardadas")
    sobran = sorted({int(f["id"]) for f in guardadas} - ids)
    for i in range(0, len(sobran), 100):
        sb.borrar(token, "ns_transaccion", {"id": f"in.({','.join(str(x) for x in sobran[i:i + 100])})"},
                  "borrar transacciones que ya no estan")
    sb.upsert(token, "ns_transaccion",
              [dict(f, sincronizacion_id=sinc_id, actualizado_en=ahora) for f in encabezados], "id")
    # Lineas: se reemplazan las de cada transaccion traida (pudieron sacar lineas).
    lista = sorted(ids)
    for i in range(0, len(lista), 100):
        sb.borrar(token, "ns_transaccion_linea",
                  {"transaccion_id": f"in.({','.join(str(x) for x in lista[i:i + 100])})"},
                  "borrar lineas anteriores")
    sb.upsert(token, "ns_transaccion_linea", lineas, "transaccion_id,linea_id")
    log(f"Supabase: {len(encabezados)} transacciones y {len(lineas)} lineas guardadas; "
        f"{len(sobran)} transacciones del rango borradas porque ya no estan en NetSuite.")
    return len(sobran)


# ------------------------------------------------------------- corrida

def ejecutar(token, desde, hasta, log=print, sinc_id=None, simular=False):
    """Trae todo de NetSuite y, salvo simular=True, lo guarda. Devuelve el detalle."""
    detalle = {"desde": desde.isoformat(), "hasta": hasta.isoformat()}
    try:
        _avance(token, sinc_id, paso="Catalogo y precios")
        catalogo = traer_catalogo(log)
        _avance(token, sinc_id, paso="Presupuestos y OV")
        encabezados = traer_transacciones(desde, hasta, log)
        _avance(token, sinc_id, paso="Lineas")
        lineas = traer_lineas([f["id"] for f in encabezados], log)
        detalle.update({
            "articulos": len(catalogo),
            "articulos_con_precio": sum(1 for f in catalogo if f["precio_lista"]),
            "presupuestos": sum(1 for f in encabezados if f["tipo"] == "Estimate"),
            "ov_productos": sum(1 for f in encabezados if f["tipo"] == "SalesOrd"),
            "lineas": len(lineas),
        })
        if simular:
            log("SIMULACION: no se guardo nada.")
            return {"detalle": detalle, "catalogo": catalogo, "transacciones": encabezados, "lineas": lineas}
        _avance(token, sinc_id, paso="Guardando catalogo")
        detalle["precios_historial"] = guardar_catalogo(token, catalogo, sinc_id, log)
        _avance(token, sinc_id, paso="Guardando presupuestos y OV")
        detalle["transacciones_borradas"] = guardar_transacciones(token, desde, hasta, encabezados, lineas, sinc_id, log)
        _avance(token, sinc_id, estado="ok", paso="Terminada", detalle=detalle,
                mensaje=f"{detalle['presupuestos']} presupuestos, {detalle['ov_productos']} OV de productos, "
                        f"{detalle['lineas']} lineas, {detalle['articulos']} articulos.",
                finalizada_en=datetime.now(ZoneInfo("UTC")).isoformat())
        return {"detalle": detalle}
    except Exception as e:
        log(f"ERROR: {e}")
        try:
            _avance(token, sinc_id, estado="error", mensaje=str(e)[:1000], detalle=detalle,
                    finalizada_en=datetime.now(ZoneInfo("UTC")).isoformat())
        except Exception:
            pass
        raise

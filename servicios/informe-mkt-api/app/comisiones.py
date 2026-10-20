# app/comisiones.py — Base de comisiones por vendedor (13/10/2026).
#
# POST /informe-mkt/comisiones {desde, hasta} (app/main.py). Se consulta en
# vivo a NetSuite (no se guarda nada), para el boton "Comisiones por vendedor"
# del Informe por vendedor.
#
# Criterio (definido por Martin el 13/10/2026):
#   - Oportunidades ganadas del periodo: las mismas del informe (busqueda 2933,
#     fecha de oportunidad en el rango, estado 12 / 13 = "Aprobada").
#   - OV relacionadas: ordenes de venta (SalesOrd) cuya oportunidad es una de
#     las ganadas, o cuyo presupuesto de origen (custbody_3k_trans_orig_ov)
#     pertenece a una de las ganadas. Solo las de tipo ABONOS (Contrato):
#     "Orden de Venta ABONOS (Contrato)" y "PRODUCTOS y ABONOS (Contrato)".
#     Las de PRODUCTOS se cuentan aparte y no se listan.
#   - Una sola OV de abonos por oportunidad (14/10/2026): el contrato de
#     abonos genera una OV nueva cada mes con el mismo presupuesto de origen.
#     Se toma la primera (por fecha y numero) que no este "Cerrada"; si estan
#     todas cerradas, la primera. Las demas viajan como "ov_mensuales" en la
#     fila (solo informativo, no suman).
#   - Abonos: lineas de la OV cuyo articulo empieza con "ABO".
#   - Configuracion (Panel de administracion -> Comisiones):
#       * comision_abono (migracion 28): un registro por abono (codigo ABO-xx);
#         esta incluido si tiene unidad (unidad_id, migracion 29).
#       * comision_unidad (migraciones 29 y 30): unidad de comision con
#         "Incluido desde" = N y "Comisiona" (si esta destildado, sus abonos
#         no suman a la base ni al fondo).
#       * comision_porcentaje (migracion 31): porcentaje de cada vendedor en
#         cada unidad.
#   - Calculo (modelo de fondo comisionable, 19/10/2026), por unidad y por mes, con las
#     ventas de TODOS los vendedores:
#       * ventas = OV con al menos un abono de la unidad.
#       * base = importe (neto de IVA) de los abonos de la unidad.
#       * comisionan = ventas - N + 1 (minimo 0).
#       * fondo comisionable = base x comisionan / ventas (promedio por venta x las ventas
#         que comisionan). Cada linea aporta importe x factor.
#       * El fondo comisionable se reparte segun el porcentaje de cada vendedor en la
#         unidad, sin importar quien vendio. Las ventas "Sin asignar" suman
#         al fondo y no reciben. Si los porcentajes no suman 100 %, lo que
#         falta queda sin repartir (aviso).
#     Un abono sin unidad no suma. Un abono que aparece en una OV y no esta en
#     la tabla se informa en "abonos_sin_configurar".
# Vendedor = representante de ventas de la oportunidad (normalizado como en el
# resto del informe). El representante de la OV viaja aparte.

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config, netsuite
from app.resumen_ejecutivo import normalizar_vendedor_netsuite

_RE_CODIGO = re.compile(r"^\s*ABO[\s\-_.]*(\d+(?:-[A-Z0-9]+)*)", re.I)


def codigo_abono(articulo):
    """Codigo con el que se configura el abono: 'ABO-10  Abono Mensual ...' ->
    'ABO-10'; 'ABO 403-AI Obra ...' -> 'ABO-403-AI'. Si el articulo no tiene
    codigo ABO, el nombre completo (espacios colapsados)."""
    texto = " ".join(str(articulo or "").split())
    m = _RE_CODIGO.match(texto)
    return ("ABO-" + m.group(1).upper()) if m else texto


def es_ov_abonos(tipo_ov):
    """Solo OV de tipo ABONOS (Contrato), incluida PRODUCTOS y ABONOS (Contrato)."""
    return "ABONOS" in str(tipo_ov or "").upper()


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
    if v is None or (isinstance(v, float) and v != v):  # None o NaN de pandas
        return None
    v = str(v).strip()
    return None if not v or v.lower() == "nan" else v


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


def _representantes(opp_ids):
    """{oportunidad_id: vendedor_id} (ID interno del empleado representante de
    ventas en NetSuite)."""
    salida = {}
    for lote in _lotes(opp_ids):
        for f in netsuite.suiteql(f"SELECT t.id AS id, t.employee AS vendedor_id FROM transaction t WHERE t.id IN ({lote})"):
            if f.get("vendedor_id") not in (None, ""):
                salida[int(f["id"])] = int(f["vendedor_id"])
    return salida


def representantes_netsuite(meses=12):
    """Representantes de ventas de las oportunidades de la subsidiaria en los
    ultimos `meses`: [{id, nombre, nombre_netsuite, oportunidades, en_informe}].
    en_informe = esta en la lista de vendedores del Informe de MKT
    (netsuite.VENDEDORES)."""
    base = f"""
        FROM transaction t
        INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
        WHERE t.type = 'Opprtnty' AND t.employee IS NOT NULL
          AND t.trandate >= ADD_MONTHS(SYSDATE, -{int(meses)})"""
    try:
        filas = netsuite.suiteql(f"""
            SELECT t.employee AS id, BUILTIN.DF(t.employee) AS nombre, BUILTIN.DF(tl.subsidiary) AS subsidiaria, COUNT(*) AS n
            {base}
            GROUP BY t.employee, BUILTIN.DF(t.employee), BUILTIN.DF(tl.subsidiary)""")
    except RuntimeError:  # por si SuiteQL no acepta el GROUP BY con BUILTIN.DF
        filas = [dict(f, n=1) for f in netsuite.suiteql(f"""
            SELECT t.employee AS id, BUILTIN.DF(t.employee) AS nombre, BUILTIN.DF(tl.subsidiary) AS subsidiaria
            {base}""")]
    por_id = {}
    for f in filas:
        if not str(f.get("subsidiaria") or "").strip().endswith(netsuite.SUBSIDIARIA) or f.get("id") in (None, ""):
            continue
        vid = int(f["id"])
        crudo = " ".join(str(f.get("nombre") or "").split())
        x = por_id.setdefault(vid, {"id": vid, "nombre_netsuite": crudo,
                                    "nombre": normalizar_vendedor_netsuite(crudo) or f"Vendedor {vid}",
                                    "oportunidades": 0, "en_informe": crudo in netsuite.VENDEDORES})
        x["oportunidades"] += int(f.get("n") or 1)
    return sorted(por_id.values(), key=lambda x: x["nombre"].lower())


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


def _lineas_abo(ov_ids, log, nombres_configurados=()):
    """{ov_id: [lineas ABO]} (y las de articulos sin codigo ABO que esten en
    la configuracion, identificados por nombre)."""
    otros = {" ".join(str(n).split()) for n in nombres_configurados}
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
            if not articulo or not (articulo.upper().startswith("ABO") or " ".join(articulo.split()) in otros):
                continue
            importe = _num(f.get("importe"))
            cantidad = _num(f.get("cantidad"))
            precio = _num(f.get("precio"))
            por_ov.setdefault(clave[0], []).append({
                "linea_id": clave[1],
                "codigo": codigo_abono(articulo),
                "numero": numero_abo(articulo),
                "articulo": articulo,
                "cantidad": abs(cantidad) if cantidad is not None else None,
                "precio": abs(precio) if precio is not None else None,
                # En SuiteQL las lineas de OV vienen con signo negativo.
                "importe": abs(importe) if importe is not None else None,
            })
    return por_ov


# ------------------------------------------------------------- clasificacion

def clasificar(abonos, cfg, unidades):
    """Marca cada linea con "incluido" y "unidad" segun la configuracion y
    devuelve (clasificacion, comisionable, base, unidades de la OV, sin
    configurar)."""
    nombres, sin_config, sin_comision = [], [], []
    for a in abonos:
        conf = cfg.get(a["codigo"])
        uni = unidades.get((conf or {}).get("unidad_id")) if conf else None
        # Unidad con "Comisiona" destildado (migracion 30): el abono queda
        # asignado pero no suma a la base ni comisiona.
        a["incluido"] = uni is not None and uni.get("comisiona", True) is not False
        a["cuenta"] = a["incluido"]  # nombre que usa la pagina
        a["unidad"] = uni["nombre"] if uni else None
        a["unidad_comisiona"] = a["incluido"] if uni else None
        if a["incluido"] and uni["nombre"] not in nombres:
            nombres.append(uni["nombre"])
        if uni and not a["incluido"] and uni["nombre"] not in sin_comision:
            sin_comision.append(uni["nombre"])
        if conf is None and a["codigo"] not in sin_config:
            sin_config.append(a["codigo"])
    if nombres:
        clasif = " + ".join(nombres)
    elif sin_comision:
        clasif = " + ".join(sin_comision) + " (no comisiona)"
    elif abonos:
        clasif = "Sin abonos incluidos"
    else:
        clasif = "Sin ABO"
    base = sum((a.get("importe") or 0) for a in abonos if a["incluido"])
    return clasif, bool(nombres), round(base, 2), nombres, sin_config


SIN_ASIGNAR = "Sin asignar"


def _pesos(v):
    """1234567.8 -> '$ 1.234.567,80' (formato argentino, para los avisos)."""
    return "$ " + f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def aplicar_fondos(filas, unidades, porcentajes, nombres_vendedor=None):
    """Fondo comisionable por unidad (ventas de todos los vendedores) y reparto
    por porcentaje. Los vendedores se identifican por vendedor_id (ID del
    empleado en NetSuite; None = Sin asignar). Completa en cada linea
    incluida: factor y aporte; en cada OV: aporte. Devuelve (fondos, reparto,
    avisos):
      fondos  = [{unidad, ventas, incluido_desde, comisionan, factor, base,
                  promedio, fondo, porcentaje_total, repartido, sin_repartir,
                  ventas_sin_asignar, base_sin_asignar, vendedores_sin_porcentaje}]
      reparto = [{vendedor_id, vendedor, unidad, porcentaje, comision}]"""
    por_nombre = {u["nombre"]: u for u in unidades.values()}
    nombres = dict(nombres_vendedor or {})
    for f in filas:
        if f.get("vendedor_id") is not None:
            nombres.setdefault(f["vendedor_id"], f["vendedor"])
    pct = {}
    for p in porcentajes or []:
        u = unidades.get(p.get("unidad_id"))
        vid = p.get("vendedor_id")
        if u and vid is not None:
            pct.setdefault(u["nombre"], {})[int(vid)] = float(p.get("porcentaje") or 0)
    grupos = {}
    for f in filas:
        for nombre in {a["unidad"] for a in f["abonos"] if a["incluido"]}:
            grupos.setdefault(nombre, []).append(f)
    fondos, reparto, avisos = [], [], []
    nom = lambda vid: nombres.get(vid) or f"Vendedor {vid}"
    for nombre in sorted(set(grupos) | set(pct), key=str.lower):
        uni = por_nombre.get(nombre) or {}
        if uni.get("comisiona", True) is False:
            continue  # unidad que no comisiona: no tiene fondo comisionable
        ovs = grupos.get(nombre, [])
        n = max(1, int(uni.get("incluido_desde") or 1))
        ventas = len(ovs)
        comisionan = max(0, ventas - n + 1)
        factor = comisionan / ventas if ventas else 0
        base, por_vend = 0.0, {}
        for f in ovs:
            b = 0.0
            for a in f["abonos"]:
                if a["incluido"] and a["unidad"] == nombre:
                    a["factor"] = round(factor, 6)
                    a["aporte"] = round((a.get("importe") or 0) * factor, 2)
                    b += a.get("importe") or 0
            base += b
            x = por_vend.setdefault(f.get("vendedor_id"), {"ventas": 0, "base": 0.0})
            x["ventas"] += 1
            x["base"] += b
        fondo = round(base * factor, 2)
        porc = pct.get(nombre, {})
        suma = round(sum(porc.values()), 3)
        montos = {v: round(fondo * p / 100, 2) for v, p in porc.items()}
        if porc and abs(suma - 100) <= 0.0005:
            # Si suman 100 %, los centavos del redondeo van al de mayor porcentaje
            # para que se reparta exactamente el fondo.
            mayor = max(porc, key=lambda v: (porc[v], -v))
            montos[mayor] = round(montos[mayor] + fondo - sum(montos.values()), 2)
        repartido = round(sum(montos.values()), 2)
        sin_pct = sorted((nom(v) for v in por_vend if v is not None and v not in porc), key=str.lower)
        sa = por_vend.get(None, {"ventas": 0, "base": 0.0})
        fondos.append({
            "unidad": nombre, "ventas": ventas, "incluido_desde": n, "comisionan": comisionan,
            "factor": round(factor, 6), "base": round(base, 2), "promedio": round(base / ventas, 2) if ventas else 0,
            "fondo": fondo, "porcentaje_total": suma, "repartido": repartido, "sin_repartir": round(fondo - repartido, 2),
            "ventas_sin_asignar": sa["ventas"], "base_sin_asignar": round(sa["base"], 2),
            "vendedores_sin_porcentaje": sin_pct,
        })
        for v in sorted(porc, key=lambda v: nom(v).lower()):
            reparto.append({"vendedor_id": v, "vendedor": nom(v), "unidad": nombre, "porcentaje": porc[v], "comision": montos[v]})
        if not porc:
            avisos.append(f"{nombre}: no tiene porcentajes por vendedor; el fondo comisionable de {_pesos(fondo)} queda sin repartir.")
        elif abs(suma - 100) > 0.0005:
            avisos.append(f"{nombre}: los porcentajes suman {str(round(suma, 3)).rstrip('0').rstrip('.').replace('.', ',')} % (no 100 %); "
                          + (f"quedan {_pesos(fondo - repartido)} sin repartir." if suma < 100
                             else f"se reparten {_pesos(repartido - fondo)} de más."))
        if sin_pct:
            avisos.append(f"{nombre}: vendedores con ventas y sin porcentaje (no reciben del fondo comisionable): {', '.join(sin_pct)}.")
    for f in filas:
        for a in f["abonos"]:
            a.setdefault("factor", None)
            a.setdefault("aporte", 0)
        f["aporte"] = round(sum(a["aporte"] for a in f["abonos"]), 2)
    return fondos, reparto, avisos


def config_desde_filas(filas):
    """Lista de la tabla comision_abono -> {codigo: fila}."""
    return {str(f["codigo"]).strip(): f for f in filas or [] if f.get("codigo")}


# ------------------------------------------------------------------- armado

def generar(desde, hasta, log, abonos_config=None, unidades_config=None, porcentajes_config=None,
            vendedores_config=None):
    """abonos_config: filas de comision_abono (codigo, nombre, unidad_id).
    unidades_config: filas de comision_unidad (id, nombre, incluido_desde,
    comisiona). porcentajes_config: filas de comision_porcentaje (unidad_id,
    vendedor_id, porcentaje). vendedores_config: filas de comision_vendedor
    (id = empleado de NetSuite, nombre). Las dos ultimas son None si todavia
    no existe la migracion 31."""
    cfg = config_desde_filas(abonos_config)
    nombres_vendedor = {int(v["id"]): v["nombre"] for v in vendedores_config or [] if v.get("id") is not None}
    unidades = {u["id"]: u for u in unidades_config or [] if u.get("id")}
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
            "vendedor": normalizar_vendedor_netsuite(_texto(r.get("Representante de Ventas"))) or SIN_ASIGNAR,
            "representante_netsuite": " ".join(str(_texto(r.get("Representante de Ventas")) or "").split()) or None,
            "cliente": _texto(r.get("Cliente")),
            "nro_cliente": _texto(r.get("ID")),
            "unidad_negocio": _texto(r.get("Unidad de Negocio")),
            "tipo_establecimiento": _texto(r.get("Tipo de establecimiento")),
            "categoria": _texto(r.get("Categoría")),
            "comodato_oportunidad": None if comodato in (None, "") or comodato != comodato else _si(comodato),
        }

    # Vendedor = ID del empleado representante de ventas (NetSuite). El nombre
    # que se muestra es el de comision_vendedor (si esta) o el normalizado.
    vendedores_nuevos = {}
    if opps:
        try:
            ids = _representantes(opps)
        except RuntimeError as e:
            ids = {}
            aviso(f"No se pudo leer el ID de los representantes de ventas en NetSuite: {str(e)[:300]}")
        por_nombre_vend = {" ".join(n.split()).lower(): i for i, n in nombres_vendedor.items()}
        for opp_id, o in opps.items():
            vid = ids.get(opp_id)
            if vid is None and o["vendedor"] != SIN_ASIGNAR:
                vid = por_nombre_vend.get(o["vendedor"].lower())  # respaldo por nombre
            o["vendedor_id"] = vid
            if vid is None:
                o["vendedor"] = SIN_ASIGNAR
            elif vid in nombres_vendedor:
                o["vendedor"] = nombres_vendedor[vid]
            else:
                vendedores_nuevos[vid] = {"id": vid, "nombre": o["vendedor"], "nombre_netsuite": o.get("representante_netsuite")}
    if vendedores_nuevos and vendedores_config is not None:
        aviso("Representantes de ventas que no están en la tabla de vendedores (no pueden tener porcentaje): " +
              ", ".join(f"{v['nombre']} (ID {k})" for k, v in sorted(vendedores_nuevos.items())) +
              ". Actualizalos en Panel de administración → Comisiones → Distribución.")

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
    # Solo OV de abonos (Contrato); las de productos se cuentan y no se listan.
    excluidas = {}
    for ov_id in list(ovs):
        if not es_ov_abonos(ovs[ov_id].get("tipo_ov")):
            tipo = _texto(ovs.pop(ov_id).get("tipo_ov")) or "Sin tipo"
            excluidas[tipo] = excluidas.get(tipo, 0) + 1
    if excluidas:
        log("Comisiones: OV excluidas por tipo: " + ", ".join(f"{k} ({v})" for k, v in sorted(excluidas.items())))
    # Oportunidad de cada OV y una sola OV por oportunidad (la del alta del
    # contrato; las mensuales posteriores no suman).
    por_opp = {}
    for ov_id, f in ovs.items():
        opp_id = int(f["oportunidad_id"]) if f.get("oportunidad_id") else None
        if opp_id not in opps and f.get("presupuesto_id"):
            opp_id = pres.get(int(f["presupuesto_id"]), (None, None))[0]
        if opp_id in opps:  # si no, es de una oportunidad que no es ganada del periodo
            por_opp.setdefault(opp_id, []).append(ov_id)
    elegidas, mensuales = {}, {}
    for opp_id, ids in por_opp.items():
        ids.sort(key=lambda i: (_fecha(ovs[i].get("fecha_ov")) or "9999", i))
        abiertas = [i for i in ids if "CERRADA" not in str(ovs[i].get("estado_ov") or "").upper()]
        elegida = (abiertas or ids)[0]
        elegidas[elegida] = opp_id
        mensuales[elegida] = [{"ov_numero": _texto(ovs[i].get("ov_numero")), "fecha_ov": _fecha(ovs[i].get("fecha_ov")),
                               "estado_ov": _texto(ovs[i].get("estado_ov")), "total_ov": _num(ovs[i].get("total_ov"))}
                              for i in ids if i != elegida]
    n_mensuales = sum(len(v) for v in mensuales.values())
    if n_mensuales:
        log(f"Comisiones: {n_mensuales} OV mensuales posteriores del mismo contrato no se cuentan (una OV por oportunidad).")
    nombres_sin_codigo = [c for c in cfg if not c.upper().startswith("ABO")]
    lineas = _lineas_abo(elegidas, log, nombres_sin_codigo) if elegidas else {}

    filas = []
    con_ov = set()
    sin_configurar = {}
    for ov_id, opp_id in sorted(elegidas.items()):
        f = ovs[ov_id]
        o = opps[opp_id]
        con_ov.add(opp_id)
        abonos = lineas.get(ov_id, [])
        clasif, comisionable, base, incluidos, sin_config = clasificar(abonos, cfg, unidades)
        for codigo in sin_config:
            art = next((a["articulo"] for a in abonos if a["codigo"] == codigo), codigo)
            sin_configurar.setdefault(codigo, {"codigo": codigo, "articulo": art, "ovs": 0})["ovs"] += 1
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
            ov_mensuales=mensuales.get(ov_id, []),
            clasificacion=clasif,
            unidades=incluidos,
            comisionable=comisionable,
            base_comisionable=base,
            importe_otros_abo=round(sum((a.get("importe") or 0) for a in abonos if not a["incluido"]), 2),
        ))
    fondos, reparto, avisos_fondo = aplicar_fondos(filas, unidades, porcentajes_config, nombres_vendedor)
    if porcentajes_config is None:
        aviso("Falta la tabla de porcentajes por vendedor (migración 31): los fondos comisionables no se reparten.")
    if not cfg:
        aviso("No hay abonos configurados para comisiones (Panel de administración → Comisiones): ningún abono suma.")
    elif not unidades:
        aviso("No hay unidades de comisión con abonos asignados (Panel de administración → Comisiones): ningún abono suma.")
    if sin_configurar:
        aviso("Abonos que no están en la configuración de comisiones (no suman): " +
              ", ".join(f"{v['codigo']} ({v['ovs']} OV)" for v in sorted(sin_configurar.values(), key=lambda v: v["codigo"])) +
              ". Agregalos en Panel de administración → Comisiones.")
    for a in avisos_fondo:
        aviso(a)

    sin_ov = [o for k, o in sorted(opps.items()) if k not in con_ov]
    log(f"Comisiones: {len(opps)} oportunidades ganadas, {len(filas)} OV relacionadas "
        f"de abonos ({sum(1 for f in filas if f['comisionable'])} con abonos incluidos), {len(sin_ov)} ganadas sin OV de abonos; "
        f"fondo comisionable ${sum(p['fondo'] for p in fondos):,.2f}, repartido ${sum(p['repartido'] for p in fondos):,.2f}.")
    por_id = {u["id"]: u["nombre"] for u in unidades.values()}
    r = {
        "version": 1,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "generado_en": datetime.now(ZoneInfo(config.ZONA_HORARIA)).isoformat(timespec="seconds"),
        "ganadas": len(opps),
        "ovs": filas,
        "sin_ov": sin_ov,
        "ov_excluidas_por_tipo": excluidas,
        "ov_mensuales_no_contadas": n_mensuales,
        "modelo": "fondo",
        "config": [{"codigo": k, "nombre": cfg[k].get("nombre"), "nombre_mostrar": cfg[k].get("nombre_mostrar"),
                    "incluido": bool(cfg[k].get("unidad_id")),
                    "unidad": (unidades.get(cfg[k].get("unidad_id")) or {}).get("nombre")}
                   for k in sorted(cfg)],
        "unidades": [{"id": u["id"], "nombre": u["nombre"], "incluido_desde": u.get("incluido_desde") or 1,
                      "comisiona": u.get("comisiona", True) is not False,
                      "abonos": sorted(k for k, a in cfg.items() if a.get("unidad_id") == u["id"])}
                     for u in sorted(unidades.values(), key=lambda u: u["nombre"].lower())],
        "fondos": fondos,
        "reparto": reparto,
        "porcentajes": sorted(({"unidad": por_id[p["unidad_id"]], "vendedor_id": int(p["vendedor_id"]),
                                "vendedor": nombres_vendedor.get(int(p["vendedor_id"])) or f"Vendedor {p['vendedor_id']}",
                                "porcentaje": float(p["porcentaje"])}
                               for p in porcentajes_config or [] if p.get("unidad_id") in por_id),
                              key=lambda p: (p["unidad"].lower(), p["vendedor"].lower())),
        "vendedores_nuevos": sorted(vendedores_nuevos.values(), key=lambda v: v["nombre"].lower()),
        "abonos_sin_configurar": sorted(sin_configurar.values(), key=lambda v: v["codigo"]),
        "avisos": avisos,
    }
    r["vendedores"] = resumen_vendedores(r)
    r["totales"] = totales(r)
    return r


# --------------------------------------------------------------- liquidacion

def resumen_vendedores(r):
    """Por vendedor: ganadas, OV, ventas por unidad (todas las unidades,
    tambien las que no comisionan), lo que aportaron a los fondos, su
    porcentaje y su comision (reparto). Incluye a los vendedores que tienen
    porcentaje aunque no hayan vendido."""
    comisiona = {u["nombre"]: u.get("comisiona", True) is not False for u in r.get("unidades") or []}
    por = {}

    # Clave = vendedor_id (ID de NetSuite); None = Sin asignar.
    def fila(o):
        vid = o.get("vendedor_id")
        x = por.setdefault(vid, {"vendedor_id": vid, "vendedor": o.get("vendedor") or SIN_ASIGNAR, "ops": set(), "ovs": 0,
                                 "ovs_comisionables": 0, "base_comisionable": 0.0, "aporte": 0.0, "comision": 0.0,
                                 "unidades": {}})
        return x

    def uni(x, nombre):
        return x["unidades"].setdefault(nombre, {"unidad": nombre, "comisiona": comisiona.get(nombre, True),
                                                 "ventas": 0, "base": 0.0, "aporte": 0.0,
                                                 "porcentaje": None, "comision": 0.0})
    for f in r["ovs"]:
        x = fila(f)
        x["ops"].add(f["oportunidad_id"])
        x["ovs"] += 1
        x["ovs_comisionables"] += 1 if f["comisionable"] else 0
        x["base_comisionable"] += f["base_comisionable"] or 0
        x["aporte"] += f.get("aporte") or 0
        for nombre in sorted({a["unidad"] for a in f["abonos"] if a.get("unidad")}):
            u = uni(x, nombre)
            u["ventas"] += 1
            for a in f["abonos"]:
                if a.get("unidad") == nombre:
                    u["base"] += (a.get("importe") or 0) if a["incluido"] else 0
                    u["aporte"] += a.get("aporte") or 0
    for o in r["sin_ov"]:
        fila(o)["ops"].add(o["oportunidad_id"])
    for d in r.get("reparto") or []:
        x = fila(d)
        u = uni(x, d["unidad"])
        u["porcentaje"] = d["porcentaje"]
        u["comision"] += d["comision"]
        x["comision"] += d["comision"]
    salida = []
    for x in por.values():
        salida.append({
            "vendedor_id": x["vendedor_id"],
            "vendedor": x["vendedor"],
            "ganadas": len(x["ops"]),
            "ovs": x["ovs"],
            "ovs_comisionables": x["ovs_comisionables"],
            "base_comisionable": round(x["base_comisionable"], 2),
            "aporte": round(x["aporte"], 2),
            "comision": round(x["comision"], 2),
            "por_unidad": [dict(u, base=round(u["base"], 2), aporte=round(u["aporte"], 2), comision=round(u["comision"], 2))
                           for u in sorted(x["unidades"].values(), key=lambda u: u["unidad"].lower())],
        })
    return sorted(salida, key=lambda x: (x["vendedor_id"] is None, -x["comision"], x["vendedor"]))


def totales(r):
    fondos = r.get("fondos") or []
    ovs = r["ovs"]
    return {
        "ganadas": r["ganadas"],
        "ganadas_sin_ov": len(r["sin_ov"]),
        "ovs": len(ovs),
        "ovs_comisionables": sum(1 for f in ovs if f["comisionable"]),
        "base_comisionable": round(sum(f["base_comisionable"] for f in ovs), 2),
        "fondo": round(sum(p["fondo"] for p in fondos), 2),
        "comision": round(sum(p["repartido"] for p in fondos), 2),
        "sin_repartir": round(sum(p["sin_repartir"] for p in fondos), 2),
        "ventas_sin_asignar": sum(1 for f in ovs if f.get("vendedor_id") is None and f["comisionable"]),
        "base_sin_asignar": round(sum(f["base_comisionable"] for f in ovs if f.get("vendedor_id") is None), 2),
        "ov_mensuales_no_contadas": r.get("ov_mensuales_no_contadas", 0),
        "ov_excluidas_por_tipo": r.get("ov_excluidas_por_tipo", {}),
    }


def payload_liquidacion(r, mes, generada_por):
    """Arma el jsonb para fn_comision_guardar_liquidacion (migracion 31)."""
    lineas = []
    for f in r["ovs"]:
        for a in f["abonos"]:
            lineas.append({
                "vendedor_id": f.get("vendedor_id"), "vendedor": f["vendedor"], "ov_id": f["ov_id"], "ov_numero": f["ov_numero"],
                "fecha_ov": f["fecha_ov"], "modalidad": "Comodato" if f["comodato"] else "Venta",
                "oportunidad": f["oportunidad"], "fecha_oportunidad": f["fecha_oportunidad"],
                "cliente": f["cliente"], "nro_cliente": f["nro_cliente"],
                "codigo": a["codigo"], "articulo": a["articulo"], "cantidad": a.get("cantidad"),
                "importe": a.get("importe"), "incluido": a["incluido"], "unidad": a.get("unidad"),
                "factor": a.get("factor"), "aporte": a.get("aporte", 0),
            })
    sin_ov = [{k: o.get(k) for k in ("vendedor_id", "vendedor", "oportunidad_id", "oportunidad", "fecha_oportunidad", "estado_oportunidad",
                                     "cliente", "nro_cliente")} for o in r["sin_ov"]]
    # Todas las ganadas con su situacion (migracion 33): fondo / conov / sinov.
    oportunidades = []
    for f in r["ovs"]:
        oportunidades.append({
            "situacion": "fondo" if f["comisionable"] else "conov",
            **{k: f.get(k) for k in ("oportunidad_id", "oportunidad", "fecha_oportunidad", "estado_oportunidad", "vendedor_id",
                                     "vendedor", "cliente", "nro_cliente", "ov_id", "ov_numero", "fecha_ov", "tipo_ov",
                                     "clasificacion", "base_comisionable", "aporte", "importe_otros_abo")},
            "abonos": ", ".join(a["codigo"] for a in f["abonos"]),
        })
    for o in r["sin_ov"]:
        oportunidades.append({"situacion": "sinov", **{k: o.get(k) for k in (
            "oportunidad_id", "oportunidad", "fecha_oportunidad", "estado_oportunidad", "vendedor_id", "vendedor",
            "cliente", "nro_cliente")}})
    orden = {"fondo": 0, "conov": 1, "sinov": 2}
    oportunidades.sort(key=lambda o: (orden[o["situacion"]], str(o.get("vendedor") or ""), str(o.get("oportunidad") or "")))
    return {
        "mes": mes.isoformat(), "desde": r["desde"], "hasta": r["hasta"], "generada_por": generada_por,
        "oportunidades": oportunidades,
        "config": r.get("config") or [], "unidades": r.get("unidades") or [], "fondos": r.get("fondos") or [],
        "porcentajes": r.get("porcentajes") or [], "totales": r.get("totales") or totales(r), "sin_ov": sin_ov,
        "avisos": list(r.get("avisos") or []), "vendedores": r.get("vendedores") or resumen_vendedores(r),
        "lineas": lineas,
    }

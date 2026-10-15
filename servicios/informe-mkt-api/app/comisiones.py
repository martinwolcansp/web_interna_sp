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
#   - Configuracion (migracion 28, Panel de administracion -> Comisiones):
#     tabla comision_abono, un registro por abono (codigo ABO-xx) con
#     "Incluido" e "Incluido desde" = N.
#       * Base comisionable de la OV = importe de sus lineas de abonos
#         incluidos (neto de IVA).
#       * Comision: por vendedor, por abono incluido y por mes, las OV se
#         ordenan por fecha de OV (y numero); desde la N-esima en adelante
#         la linea comisiona por su importe (el primer abono del contrato).
#         Las primeras N-1 no comisionan.
#     Cada abono cuenta por si solo (desde el 14/10/2026 no hay reglas de
#     pares ni de reemplazo). Un abono que aparece en una OV y no esta en la
#     tabla se informa en "abonos_sin_configurar" y no suma.
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

def clasificar(abonos, cfg):
    """Marca cada linea con "incluido" segun la configuracion y devuelve
    (clasificacion, comisionable, base, codigos incluidos, sin configurar)."""
    incluidos, sin_config = [], []
    for a in abonos:
        conf = cfg.get(a["codigo"])
        a["incluido"] = bool(conf and conf.get("incluido"))
        a["cuenta"] = a["incluido"]  # nombre que usa la pagina
        if a["incluido"] and a["codigo"] not in incluidos:
            incluidos.append(a["codigo"])
        if conf is None and a["codigo"] not in sin_config:
            sin_config.append(a["codigo"])
    if incluidos:
        clasif = " + ".join(incluidos)
    elif abonos:
        clasif = "Sin abonos incluidos"
    else:
        clasif = "Sin ABO"
    base = sum((a.get("importe") or 0) for a in abonos if a["incluido"])
    return clasif, bool(incluidos), round(base, 2), incluidos, sin_config


def aplicar_incluido_desde(filas, cfg):
    """Por vendedor y abono incluido: ordena las OV por fecha (y numero) y
    marca desde la N-esima en adelante (N = incluido_desde) como comisionable
    por el importe de la linea. Completa en cada linea: orden, incluido_desde,
    comisiona, comision; y en cada OV: comision."""
    grupos = {}
    for f in filas:
        for codigo in {a["codigo"] for a in f["abonos"] if a["incluido"]}:
            grupos.setdefault((f["vendedor"], codigo), []).append(f)
    for (_, codigo), ovs in grupos.items():
        desde_n = max(1, int((cfg.get(codigo) or {}).get("incluido_desde") or 1))
        ovs.sort(key=lambda f: (f.get("fecha_ov") or "9999", f.get("ov_numero") or "", f["ov_id"]))
        for k, f in enumerate(ovs, start=1):
            for a in f["abonos"]:
                if a["codigo"] == codigo:
                    a["orden"], a["incluido_desde"] = k, desde_n
                    a["comisiona"] = k >= desde_n
                    a["comision"] = round(a.get("importe") or 0, 2) if a["comisiona"] else 0
    for f in filas:
        for a in f["abonos"]:
            a.setdefault("orden", None)
            a.setdefault("incluido_desde", None)
            a.setdefault("comisiona", False)
            a.setdefault("comision", 0)
        f["comision"] = round(sum(a["comision"] for a in f["abonos"]), 2)


def config_desde_filas(filas):
    """Lista de la tabla comision_abono -> {codigo: fila}."""
    return {str(f["codigo"]).strip(): f for f in filas or [] if f.get("codigo")}


# ------------------------------------------------------------------- armado

def generar(desde, hasta, log, abonos_config=None):
    """abonos_config: filas de comision_abono (codigo, incluido,
    incluido_desde, ...). Sin configuracion no hay abonos incluidos."""
    cfg = config_desde_filas(abonos_config)
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
        clasif, comisionable, base, incluidos, sin_config = clasificar(abonos, cfg)
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
            codigos_incluidos=incluidos,
            comisionable=comisionable,
            base_comisionable=base,
            importe_otros_abo=round(sum((a.get("importe") or 0) for a in abonos if not a["incluido"]), 2),
        ))
    aplicar_incluido_desde(filas, cfg)
    if not cfg:
        aviso("No hay abonos configurados para comisiones (Panel de administración → Comisiones): ningún abono suma.")
    if sin_configurar:
        aviso("Abonos que no están en la configuración de comisiones (no suman): " +
              ", ".join(f"{v['codigo']} ({v['ovs']} OV)" for v in sorted(sin_configurar.values(), key=lambda v: v["codigo"])) +
              ". Agregalos en Panel de administración → Comisiones.")

    sin_ov = [o for k, o in sorted(opps.items()) if k not in con_ov]
    log(f"Comisiones: {len(opps)} oportunidades ganadas, {len(filas)} OV relacionadas "
        f"de abonos ({sum(1 for f in filas if f['comisionable'])} con abonos incluidos), {len(sin_ov)} ganadas sin OV de abonos; "
        f"comision ${sum(f['comision'] for f in filas):,.2f}.")
    return {
        "version": 1,
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "generado_en": datetime.now(ZoneInfo(config.ZONA_HORARIA)).isoformat(timespec="seconds"),
        "ganadas": len(opps),
        "ovs": filas,
        "sin_ov": sin_ov,
        "ov_excluidas_por_tipo": excluidas,
        "ov_mensuales_no_contadas": n_mensuales,
        "config": [cfg[k] for k in sorted(cfg)],
        "abonos_sin_configurar": sorted(sin_configurar.values(), key=lambda v: v["codigo"]),
        "avisos": avisos,
    }


# --------------------------------------------------------------- liquidacion

def resumen_vendedores(r):
    """Totales por vendedor (mismo criterio que el resumen del pop up)."""
    por = {}

    def fila(v):
        return por.setdefault(v, {"vendedor": v, "ops": set(), "ovs": 0, "ovs_comisionables": 0,
                                  "base_comisionable": 0.0, "comision": 0.0, "abonos": {}})
    for f in r["ovs"]:
        x = fila(f["vendedor"])
        x["ops"].add(f["oportunidad_id"])
        x["ovs"] += 1
        x["ovs_comisionables"] += 1 if f["comisionable"] else 0
        x["base_comisionable"] += f["base_comisionable"] or 0
        x["comision"] += f["comision"] or 0
        for a in f["abonos"]:
            if not a["incluido"]:
                continue
            ab = x["abonos"].setdefault(a["codigo"], {"codigo": a["codigo"], "ovs": set(), "comisionan": set(),
                                                     "base": 0.0, "comision": 0.0,
                                                     "incluido_desde": a.get("incluido_desde")})
            ab["ovs"].add(f["ov_id"])
            if a["comisiona"]:
                ab["comisionan"].add(f["ov_id"])
            ab["base"] += a.get("importe") or 0
            ab["comision"] += a.get("comision") or 0
    for o in r["sin_ov"]:
        fila(o["vendedor"])["ops"].add(o["oportunidad_id"])
    salida = []
    for v, x in por.items():
        salida.append({
            "vendedor": v,
            "ganadas": len(x["ops"]),
            "ovs": x["ovs"],
            "ovs_comisionables": x["ovs_comisionables"],
            "base_comisionable": round(x["base_comisionable"], 2),
            "comision": round(x["comision"], 2),
            "por_abono": [{"codigo": ab["codigo"], "ovs": len(ab["ovs"]), "comisionan": len(ab["comisionan"]),
                           "incluido_desde": ab["incluido_desde"], "base": round(ab["base"], 2),
                           "comision": round(ab["comision"], 2)}
                          for ab in sorted(x["abonos"].values(), key=lambda a: a["codigo"])],
        })
    return sorted(salida, key=lambda x: (x["vendedor"] == "Sin asignar", -x["comision"], x["vendedor"]))


def payload_liquidacion(r, mes, generada_por):
    """Arma el jsonb para fn_comision_guardar_liquidacion (migracion 28)."""
    vendedores = resumen_vendedores(r)
    lineas = []
    for f in r["ovs"]:
        for a in f["abonos"]:
            lineas.append({
                "vendedor": f["vendedor"], "ov_id": f["ov_id"], "ov_numero": f["ov_numero"],
                "fecha_ov": f["fecha_ov"], "modalidad": "Comodato" if f["comodato"] else "Venta",
                "oportunidad": f["oportunidad"], "fecha_oportunidad": f["fecha_oportunidad"],
                "cliente": f["cliente"], "nro_cliente": f["nro_cliente"],
                "codigo": a["codigo"], "articulo": a["articulo"], "cantidad": a.get("cantidad"),
                "importe": a.get("importe"), "incluido": a["incluido"], "orden": a.get("orden"),
                "incluido_desde": a.get("incluido_desde"), "comisiona": a.get("comisiona", False),
                "comision": a.get("comision", 0),
            })
    totales = {
        "ganadas": r["ganadas"],
        "ganadas_sin_ov": len(r["sin_ov"]),
        "ovs": len(r["ovs"]),
        "ovs_comisionables": sum(1 for f in r["ovs"] if f["comisionable"]),
        "base_comisionable": round(sum(f["base_comisionable"] for f in r["ovs"]), 2),
        "comision": round(sum(f["comision"] for f in r["ovs"]), 2),
        "ov_mensuales_no_contadas": r.get("ov_mensuales_no_contadas", 0),
        "ov_excluidas_por_tipo": r.get("ov_excluidas_por_tipo", {}),
    }
    sin_ov = [{k: o.get(k) for k in ("vendedor", "oportunidad", "fecha_oportunidad", "estado_oportunidad",
                                     "cliente", "nro_cliente")} for o in r["sin_ov"]]
    avisos = list(r.get("avisos") or [])
    return {
        "mes": mes.isoformat(), "desde": r["desde"], "hasta": r["hasta"], "generada_por": generada_por,
        "config": r.get("config") or [], "totales": totales, "sin_ov": sin_ov, "avisos": avisos,
        "vendedores": vendedores, "lineas": lineas,
    }

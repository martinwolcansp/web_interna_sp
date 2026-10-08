# app/acumulado.py — Datos acumulados del informe MKT (migracion 19).
#
# guardar(): lo llama cada actualizacion (job.py). Suma a la base lo que se
#   trajo de NetSuite y GHL para el rango, y marca esos dias como cargados.
# consultar(): arma el informe para cualquier rango Desde/Hasta con lo ya
#   cargado, sin llamar a NetSuite ni a GHL (POST /informe-mkt/consultar).
#
# Criterio: si un mismo registro vino en varias actualizaciones, queda la
# version mas reciente (una venta que se cerro despues se refleja bien).

import json
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import pandas as pd

from app import config, ghl, resumen_ejecutivo, visitas
from app import supabase_rest as sb

T_NS = "informe_mkt_ns_oportunidad"
T_CONTACTO = "informe_mkt_ghl_contacto"
T_OPP = "informe_mkt_ghl_oportunidad"
T_CONV = "informe_mkt_conversacion"
T_DIA = "informe_mkt_dia_cargado"
T_CITA = "informe_mkt_ghl_cita"            # migracion 22
T_PRESUPUESTO = "informe_mkt_ns_presupuesto"  # migracion 22


def _tz():
    return ZoneInfo(config.ZONA_HORARIA)


def _filas_ns(ventas_df):
    """DataFrame de NetSuite -> lista de dicts JSON (fechas ISO, NaN -> null)."""
    if ventas_df is None or not len(ventas_df):
        return []
    return json.loads(ventas_df.to_json(orient="records", date_format="iso", force_ascii=False))


def _tiene_conversacion(reg):
    return any(reg.get(k) not in (None, [], 0, False, "") for k in resumen_ejecutivo.CONV_FIELDS_DEFAULT)


# ---------------------------------------------------------------- guardar

def guardar(token, corrida_id, desde, hasta, datos_hasta, contactos, oportunidades, ventas_df,
            registros, log):
    ahora = datetime.now(timezone.utc).isoformat()

    # NetSuite: upsert por ID interno y, dentro del rango, se borran las que ya
    # no existen (ej. una oportunidad eliminada en NetSuite).
    filas = []
    for f in _filas_ns(ventas_df):
        filas.append({
            "id_interno": int(f["ID interno"]),
            "fecha_oportunidad": str(f.get("Fecha Oportunidad") or f.get("Fecha"))[:10],
            "id_cliente_crm": (str(f["ID CLIENTE CRM"]).strip() or None) if f.get("ID CLIENTE CRM") else None,
            "fila": f,
            "corrida_id": corrida_id,
            "actualizado_en": ahora,
        })
    sb.upsert(token, T_NS, filas, "id_interno")
    params = {"fecha_oportunidad": f"gte.{desde.isoformat()}", "and": f"(fecha_oportunidad.lte.{hasta.isoformat()})"}
    if filas:
        params["id_interno"] = f"not.in.({','.join(str(x['id_interno']) for x in filas)})"
    sb.borrar(token, T_NS, params, "limpiar oportunidades NetSuite del rango")

    # GHL: contactos y oportunidades tal como vienen de la API.
    sb.upsert(token, T_CONTACTO, [
        {"id": c["id"], "date_added": c.get("dateAdded"), "crudo": c, "actualizado_en": ahora}
        for c in contactos if c.get("id")
    ], "id")
    sb.upsert(token, T_OPP, [
        {"id": o["id"], "contact_id": o.get("contactId"), "crudo": o, "actualizado_en": ahora}
        for o in oportunidades if o.get("id")
    ], "id")

    # Conversaciones: solo las que tienen datos (no se pisa con vacios).
    conv = []
    for r in registros:
        if r.get("contact_id") and _tiene_conversacion(r):
            conv.append({"contact_id": r["contact_id"], "actualizado_en": ahora,
                         "campos": {k: r.get(k) for k in resumen_ejecutivo.CONV_FIELDS_DEFAULT}})
    sb.upsert(token, T_CONV, conv, "contact_id")

    # Dias cargados: completos salvo el ultimo, que queda cargado hasta datos_hasta.
    tz, dias, d = _tz(), [], desde
    while d <= hasta:
        fin_dia = datetime.combine(d, time(23, 59, 59), tzinfo=tz)
        dias.append({"dia": d.isoformat(), "cargado_hasta": min(fin_dia, datos_hasta).isoformat(),
                     "corrida_id": corrida_id, "actualizado_en": ahora})
        d += timedelta(days=1)
    sb.upsert(token, T_DIA, dias, "dia")

    log(f"Datos acumulados: {len(filas)} oportunidades NetSuite, {len(contactos)} contactos y "
        f"{len(oportunidades)} oportunidades GHL, {len(conv)} conversaciones, {len(dias)} dias.")


def guardar_visitas(token, corrida_id, desde, hasta, inicio, fin_excl, citas, presupuestos, log):
    """Citas de GHL y presupuestos de NetSuite (migracion 22). Dentro del rango
    se borran las citas / presupuestos que ya no existen, y los dias quedan
    marcados con visitas_cargadas (los cargados antes no las tienen)."""
    ahora = datetime.now(timezone.utc).isoformat()
    filas_cita = []
    for c in citas:
        ini = ghl.parse_fecha_cita(c.get("startTime"))
        if not c.get("id") or ini is None:
            continue
        filas_cita.append({"id": c["id"], "contact_id": c.get("contactId"), "inicio": ini.isoformat(),
                           "estado": (c.get("appointmentStatus") or "").lower() or None,
                           "crudo": c, "corrida_id": corrida_id, "actualizado_en": ahora})
    sb.upsert(token, T_CITA, filas_cita, "id")
    params = {"inicio": f"gte.{inicio.isoformat()}", "and": f"(inicio.lt.{fin_excl.isoformat()})"}
    if filas_cita:
        params["id"] = "not.in.(" + ",".join(f'"{f["id"]}"' for f in filas_cita) + ")"
    sb.borrar(token, T_CITA, params, "limpiar citas del rango")

    filas_pres = [{"id_interno": int(f["ID interno"]), "fecha": str(f.get("Fecha"))[:10],
                   "id_cliente_crm": (str(f["ID CLIENTE CRM"]).strip() or None) if f.get("ID CLIENTE CRM") else None,
                   "fila": f, "corrida_id": corrida_id, "actualizado_en": ahora}
                  for f in presupuestos if f.get("ID interno") and f.get("Fecha")]
    sb.upsert(token, T_PRESUPUESTO, filas_pres, "id_interno")
    en_rango = [f for f in filas_pres if desde.isoformat() <= f["fecha"] <= hasta.isoformat()]
    params = {"fecha": f"gte.{desde.isoformat()}", "and": f"(fecha.lte.{hasta.isoformat()})"}
    if en_rango:
        params["id_interno"] = f"not.in.({','.join(str(f['id_interno']) for f in en_rango)})"
    sb.borrar(token, T_PRESUPUESTO, params, "limpiar presupuestos del rango")

    sb.actualizar(token, T_DIA, {"dia": f"gte.{desde.isoformat()}", "and": f"(dia.lte.{hasta.isoformat()})"},
                  {"visitas_cargadas": True}, "marcar dias con visitas")
    log(f"Datos acumulados: {len(filas_cita)} citas GHL y {len(filas_pres)} presupuestos NetSuite.")


def bloque_visitas(token, desde, hasta, inicio, fin_excl):
    """Arma el bloque de visitas del periodo con lo guardado (migracion 22)."""
    try:
        dias = sb.leer_todo(token, T_DIA, {
            "select": "dia,visitas_cargadas",
            "dia": f"gte.{desde.isoformat()}", "and": f"(dia.lte.{hasta.isoformat()})",
        }, "leer dias con visitas")
        citas = [f["crudo"] for f in sb.leer_todo(token, T_CITA, {
            "select": "crudo",
            "inicio": f"gte.{inicio.isoformat()}", "and": f"(inicio.lt.{fin_excl.isoformat()})",
        }, "leer citas")]
        pres = [f["fila"] for f in sb.leer_todo(token, T_PRESUPUESTO, {
            "select": "fila",
            "fecha": f"gte.{desde.isoformat()}", "and": f"(fecha.lte.{hasta.isoformat()})",
        }, "leer presupuestos")]
        visitados = {c.get("contactId") for c in citas if visitas.es_concretada(c) and c.get("contactId")}
        if visitados:
            vistos = {f.get("ID interno") for f in pres}
            for f in sb.leer_por_ids(token, T_PRESUPUESTO, "id_cliente_crm", visitados, "fila,fecha",
                                     "leer presupuestos de clientes visitados"):
                if f["fecha"] > hasta.isoformat() and f["fila"].get("ID interno") not in vistos:
                    pres.append(f["fila"])
        nombres = {f["id"]: f["crudo"] for f in sb.leer_por_ids(
            token, T_CONTACTO, "id", {c.get("contactId") for c in citas}, "id,crudo", "leer contactos visitados")}
    except Exception as e:
        return {"version": 1, "error": f"No se pudieron leer las visitas guardadas (falta la migracion 22?): {e}"}
    bloque = visitas.generar(citas, pres, nombres, desde, hasta)
    sin = sorted(date.fromisoformat(d["dia"]) for d in dias if not d.get("visitas_cargadas"))
    bloque["dias_sin_visitas"] = [{"desde": a.isoformat(), "hasta": b.isoformat()} for a, b in _rangos(sin)]
    return bloque


# -------------------------------------------------------------- consultar

def _rangos(dias):
    """Lista de fechas ordenadas -> [(desde, hasta), ...] consecutivos."""
    out = []
    for d in dias:
        if out and d == out[-1][1] + timedelta(days=1):
            out[-1] = (out[-1][0], d)
        else:
            out.append((d, d))
    return out


def cobertura(token, desde, hasta):
    filas = sb.leer_todo(token, T_DIA, {
        "select": "dia,cargado_hasta,actualizado_en",
        "dia": f"gte.{desde.isoformat()}", "and": f"(dia.lte.{hasta.isoformat()})", "order": "dia",
    }, "leer dias cargados")
    cargados = {date.fromisoformat(f["dia"]): f for f in filas}
    todos = [desde + timedelta(days=i) for i in range((hasta - desde).days + 1)]
    faltan = [d for d in todos if d not in cargados]
    return {
        "dias_total": len(todos),
        "dias_cargados": len(cargados),
        "faltantes": [{"desde": a.isoformat(), "hasta": b.isoformat()} for a, b in _rangos(faltan)],
        "datos_hasta": max((f["cargado_hasta"] for f in filas), default=None),
        "actualizado_en": max((f["actualizado_en"] for f in filas), default=None),
    }


def consultar(token, desde, hasta):
    tz = _tz()
    inicio = datetime.combine(desde, time.min, tzinfo=tz)
    fin_excl = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=tz)
    cob = cobertura(token, desde, hasta)

    # NetSuite: oportunidades con fecha de oportunidad en el rango.
    ns = sb.leer_todo(token, T_NS, {
        "select": "fila",
        "fecha_oportunidad": f"gte.{desde.isoformat()}", "and": f"(fecha_oportunidad.lte.{hasta.isoformat()})",
        "order": "id_interno",
    }, "leer oportunidades NetSuite")
    ventas_df = pd.DataFrame([f["fila"] for f in ns])

    # GHL: contactos con alta en el rango + los de las oportunidades de NetSuite.
    contactos = [f["crudo"] for f in sb.leer_todo(token, T_CONTACTO, {
        "select": "crudo",
        "date_added": f"gte.{inicio.isoformat()}", "and": f"(date_added.lt.{fin_excl.isoformat()})",
    }, "leer contactos GHL")]
    vistos = {c.get("id") for c in contactos}
    ids_ns = {str(f["fila"].get("ID CLIENTE CRM")).strip() for f in ns if f["fila"].get("ID CLIENTE CRM")}
    faltan = ids_ns - vistos
    if faltan:
        contactos += [f["crudo"] for f in sb.leer_por_ids(token, T_CONTACTO, "id", faltan, "crudo", "leer contactos GHL")]

    universo = {c.get("id") for c in contactos} | ids_ns
    oportunidades = [f["crudo"] for f in sb.leer_por_ids(token, T_OPP, "contact_id", universo, "crudo",
                                                          "leer oportunidades GHL")]
    previos = [dict(f["campos"], contact_id=f["contact_id"])
               for f in sb.leer_por_ids(token, T_CONV, "contact_id", universo, "contact_id,campos",
                                        "leer conversaciones")]

    actualizado = cob["actualizado_en"]
    fecha_act = (datetime.fromisoformat(actualizado).astimezone(tz).strftime("%d/%m/%Y %H:%M")
                 if actualizado else "sin datos")
    resultado = resumen_ejecutivo.generar(
        contactos=contactos,
        oportunidades=oportunidades,
        ventas_df=ventas_df,
        old_contacts=previos,
        periodo_inicio=inicio,
        periodo_fin=fin_excl - timedelta(seconds=1),
        rango_label=f"{desde.strftime('%d/%m/%Y')} al {hasta.strftime('%d/%m/%Y')}",
        fecha_actualizacion=fecha_act,
    )
    panel = visitas.incrustar(resultado["panel_html"], bloque_visitas(token, desde, hasta, inicio, fin_excl))
    return {
        "desde": desde.isoformat(),
        "hasta": hasta.isoformat(),
        "cobertura": cob,
        "stats": resultado["stats"],
        "panel_resumen_html": panel,
        "contacts": resultado["contacts"],
    }

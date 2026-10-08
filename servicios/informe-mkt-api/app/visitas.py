# app/visitas.py — Visitas por vendedor (GHL) y sus presupuestos (NetSuite).
#
# Agregado el 08/10/2026 para el "Informe por vendedor":
#   - Visita = cita de un calendario de GHL. "Concretada" = cita con fecha ya
#     pasada y estado distinto de Cancelada / No asistio / Invalida (decidido
#     el 08/10/2026: en septiembre ninguna cita estaba marcada Asistio; los
#     vendedores no cargan la asistencia, las citas quedan "confirmed").
#   - Vendedor de la visita = usuario asignado a la cita (VENDEDOR_GHL_IDS).
#   - Presupuestos = transacciones Presupuesto (Estimate) de NetSuite. El total
#     por vendedor cuenta los de fecha en el periodo de los representantes de
#     la busqueda 2933.
#   - Una visita se asocia con los presupuestos del mismo cliente (ID CLIENTE
#     CRM = contacto de la cita) con fecha igual o posterior a la visita y
#     anterior a la siguiente visita concretada de ese cliente.
# El resultado viaja dentro del panel HTML como <script id="visitas-data">,
# asi no hace falta otra columna en informe_mkt_corrida y la pagina lo lee
# tambien desde las actualizaciones guardadas.

import json
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config, ghl, netsuite
from app.resumen_ejecutivo import VENDEDOR_GHL_IDS, normalizar_vendedor_netsuite

ESTADOS_NO_CONCRETADA = {"cancelled", "noshow", "invalid"}
ESTADOS_CITA = {
    "showed": "Asistió",
    "confirmed": "Confirmada",
    "new": "Nueva",
    "noshow": "No asistió",
    "cancelled": "Cancelada",
    "invalid": "Inválida",
}
VENDEDORES_INFORME = {normalizar_vendedor_netsuite(v) for v in netsuite.VENDEDORES}


def _dia_hora(valor):
    fecha = ghl.parse_fecha_cita(valor)
    if fecha is None:
        return None, None
    local = fecha.astimezone(ZoneInfo(config.ZONA_HORARIA))
    return local.strftime("%Y-%m-%d"), local.strftime("%H:%M")


def es_concretada(cita, ahora=None):
    """Cita ya pasada y no cancelada / no asistio / invalida."""
    if (cita.get("appointmentStatus") or "").lower() in ESTADOS_NO_CONCRETADA:
        return False
    inicio = ghl.parse_fecha_cita(cita.get("startTime"))
    return inicio is not None and inicio <= (ahora or datetime.now(ZoneInfo(config.ZONA_HORARIA)))


def vendedor_cita(cita):
    ids = [cita.get("assignedUserId")] + list(cita.get("users") or [])
    for uid in ids:
        if uid and uid in VENDEDOR_GHL_IDS:
            return VENDEDOR_GHL_IDS[uid]
    return "Sin asignar"


def nombre_de_contacto(crudo):
    crudo = crudo or {}
    return ((f"{crudo.get('firstName') or ''} {crudo.get('lastName') or ''}").strip()
            or crudo.get("contactName") or crudo.get("name") or None)


def generar(citas, presupuestos, contactos_por_id, desde, hasta):
    """citas: crudas de GHL (todas las del rango, cualquier estado).
    presupuestos: filas de netsuite.traer_presupuestos (etiquetas).
    contactos_por_id: {contact_id: contacto crudo de GHL} para el nombre.
    desde / hasta: datetime.date del periodo."""
    d_ini, d_fin = desde.isoformat(), hasta.isoformat()

    # ---- Presupuestos ----
    pres = []
    for f in presupuestos or []:
        fecha = str(f.get("Fecha") or "")[:10] or None
        comodato = f.get("Comodato")
        pres.append({
            "id": f.get("ID interno"),
            "numero": f.get("Presupuesto"),
            "fecha": fecha,
            "vendedor": normalizar_vendedor_netsuite(f.get("Representante de Ventas")) or "Sin asignar",
            "estado": f.get("Estado"),
            "total": f.get("Total"),
            "cliente": f.get("Cliente"),
            "nro_cliente": f.get("ID"),
            "contact_id": (str(f.get("ID CLIENTE CRM")).strip() or None) if f.get("ID CLIENTE CRM") else None,
            "oportunidad": f.get("Oportunidad"),
            "comodato": None if comodato in (None, "") else str(comodato).upper() in ("T", "TRUE", "1"),
            "en_periodo": bool(fecha and d_ini <= fecha <= d_fin),
            "visita_id": None,
        })
    pres_por_contacto = {}
    for p in pres:
        if p["contact_id"]:
            pres_por_contacto.setdefault(p["contact_id"], []).append(p)

    # ---- Citas ----
    estados = {}
    visitas = []
    ahora = datetime.now(ZoneInfo(config.ZONA_HORARIA))
    for c in citas or []:
        estado = (c.get("appointmentStatus") or "sin estado").lower()
        vendedor = vendedor_cita(c)
        estados.setdefault(vendedor, {})
        estados[vendedor][estado] = estados[vendedor].get(estado, 0) + 1
        if not es_concretada(c, ahora):
            continue
        dia, hora = _dia_hora(c.get("startTime"))
        cid = c.get("contactId")
        visitas.append({
            "id": c.get("id"),
            "fecha": dia,
            "hora": hora,
            "vendedor": vendedor,
            "calendario": c.get("calendarName"),
            "contact_id": cid,
            "cliente": nombre_de_contacto(contactos_por_id.get(cid)) or c.get("title") or cid,
            "titulo": c.get("title"),
            "presupuestos": [],
        })

    # ---- Visita -> presupuestos del mismo cliente desde la fecha de la visita ----
    por_contacto = {}
    for v in visitas:
        if v["contact_id"] and v["fecha"]:
            por_contacto.setdefault(v["contact_id"], []).append(v)
    for cid, vs in por_contacto.items():
        vs.sort(key=lambda v: (v["fecha"], v["hora"] or ""))
        for i, v in enumerate(vs):
            hasta_sig = vs[i + 1]["fecha"] if i + 1 < len(vs) else None
            for p in sorted(pres_por_contacto.get(cid, []), key=lambda p: (p["fecha"] or "", p["id"] or 0)):
                if p["visita_id"] or not p["fecha"] or p["fecha"] < v["fecha"]:
                    continue
                if hasta_sig and p["fecha"] >= hasta_sig:
                    continue
                p["visita_id"] = v["id"]
                v["presupuestos"].append(p["id"])
            if not v["cliente"] or v["cliente"] == cid:
                v["cliente"] = next((p["cliente"] for p in pres_por_contacto.get(cid, []) if p["cliente"]), v["cliente"])

    # Solo viajan los presupuestos que cuentan: del periodo o asociados a una visita.
    pres = [p for p in pres if p["en_periodo"] or p["visita_id"]]
    visitas.sort(key=lambda v: (v["fecha"] or "", v["hora"] or ""))
    return {
        "version": 1,
        "desde": d_ini,
        "hasta": d_fin,
        "vendedores_informe": sorted(VENDEDORES_INFORME),
        "estados_citas": estados,
        "etiquetas_estado": ESTADOS_CITA,
        "visitas": visitas,
        "presupuestos": pres,
        "citas_total": len(citas or []),
    }


def script_html(bloque):
    """<script> con el bloque, para incrustar en el panel."""
    texto = json.dumps(bloque, ensure_ascii=False, default=str).replace("</", "<\\/")
    return f'<script type="application/json" id="visitas-data">{texto}</script>'


def incrustar(panel_html, bloque):
    """Agrega el bloque justo despues de la apertura de la seccion del panel
    (antes de "Contactos cargados", que la pagina mueve al Reporte diario)."""
    fin = panel_html.find(">") + 1
    return panel_html[:fin] + "\n" + script_html(bloque) + panel_html[fin:]


def error_html(mensaje):
    return script_html({"version": 1, "error": mensaje})

# app/resumen_ejecutivo.py — Calculo del panel "Resumen ejecutivo" del informe MKT.
#
# Las constantes y funciones auxiliares de abajo son COPIA TEXTUAL de
# Desarrollo/actualizar_resumen_ejecutivo.py (mismos mapas de vendedores,
# etapas, alias de NetSuite y graficos). Si se cambian alla, copiarlas aca.
# Lo nuevo es generar(), al final: misma logica que main() de ese script,
# pero recibe los datos en memoria y devuelve el HTML del panel y el
# arreglo CONTACTS en vez de reescribir un archivo.

# -*- coding: utf-8 -*-
"""
Actualiza SOLO la pestaña "Resumen ejecutivo" de un informe MKT ya publicado
(pages/informes-mkt/<periodo>.html) con datos frescos de contactos.json/
oportunidades.json (GHL), sin tocar la pestaña "Resumen de conversaciones"
(que depende de un proceso de resumen por IA aparte, a demanda -- ver
plan_migracion.docx).

Para cada contacto que ya existía en el archivo, se preservan tal cual sus
campos de conversación (mensajes_*, resumen_conversacion, motivo_categoria,
hilo_mensajes, tiene_datos_conversacion).

Cruce NetSuite/GHL (21 de septiembre de 2026, mismo criterio que
analisis_mensual_mkt.py -- combinar_con_netsuite): si se pasa --ventas, para
Origen del Cliente, Forma de Contacto y Vendedor, NetSuite manda cuando tiene
el dato para ese "ID CLIENTE CRM" (que es el mismo valor que el contact_id de
GHL); si no, se usa el dato de GHL como respaldo (custom field / tags para
origen y forma; el mapa VENDEDOR_GHL_IDS de abajo + assignedTo del contacto u
oportunidad para vendedor).

Uso (los paths son de ejemplo, ajustar al mes que corresponda):
    python actualizar_resumen_ejecutivo.py ^
        --html ..\\..\\web_interna_sp\\pages\\informes-mkt\\2026-09.html ^
        --contactos ..\\Salidas\\salida_2026-09\\completo\\contactos.json ^
        --oportunidades ..\\Salidas\\salida_2026-09\\completo\\oportunidades.json ^
        --ventas ..\\Fuentes\\ResultadosSPFedeOportunidadesporVendedorDetalle.xlsx ^
        --periodo-inicio 2026-09-01 --periodo-fin 2026-09-21 ^
        --mes-label "septiembre 2026"

Por defecto sobreescribe --html en el lugar (el archivo vive en un repo git:
revisar con `git diff --stat` antes de comitear, y `git checkout -- <archivo>`
para deshacer si algo sale mal). Usar --out para escribir en otro archivo y
comparar antes de aplicar.
"""
import argparse
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

# Custom fields de contacto en GHL (mismos IDs que analisis_mensual_mkt.py /
# generar_sql.py).
CF_ORIGEN = "hGx9bXN5dGnYcI0mebR8"
CF_FORMA = "piPfRw8woYcHiYXuiWu2"
CF_INTERESADO = "69JMvwOeep8gnaQTiDTD"

CANALES_TAGS = {
    "fb-ad-lead-whatsapp": "Facebook Ads",
    "instagram-ad-lead-whatsapp": "Instagram Ads",
    "formweb": "Formulario Web",
    "organico": "Organico",
}

# Mapa de ID de usuario de GHL -> nombre real, confirmado con el usuario el
# 21/09/2026 (antes de esta fecha no se reconstruía por precaución: una
# revisión cruzada contra el informe anterior había encontrado una
# inconsistencia en un ID). Se usa solo como respaldo cuando NetSuite no
# tiene el dato para ese cliente (ver combinar_con_netsuite_html).
VENDEDOR_GHL_IDS = {
    "gsliIez5jPqQiJf2L8xw": "Gustavo Duarte",
    "e2xSCStxUTstXbm2L6BS": "Martín Ramos",
    "zJkQVddXy0ktGJqhUpgQ": "Gonzalo Martin De Castro",
    "mS1a18rhRzZt2IsnpfrG": "Federico Ordoqui",
}

# El texto de "Representante de Ventas" en el Excel de NetSuite no siempre
# coincide letra por letra con el nombre de VENDEDOR_GHL_IDS de arriba (se
# encontró "Gonzalo  De Castro" con doble espacio, y "Martín German Ramos"
# con el segundo nombre) -- sin normalizar, el informe termina mostrando la
# misma persona como 2 vendedores distintos en el filtro. Se normaliza al
# mismo nombre canónico de VENDEDOR_GHL_IDS.
NETSUITE_VENDEDOR_ALIAS = {
    "Gonzalo De Castro": "Gonzalo Martin De Castro",  # espacios ya colapsados antes del lookup
    "Martín German Ramos": "Martín Ramos",
}


def normalizar_vendedor_netsuite(nombre):
    if not nombre:
        return nombre
    nombre = " ".join(nombre.split())  # colapsa espacios dobles
    return NETSUITE_VENDEDOR_ALIAS.get(nombre, nombre)


# Mapa de ID de etapa de pipeline de GHL -> nombre real, confirmado por el
# usuario el 22/09/2026 (los 5 pipelines completos de la cuenta, no solo las
# etapas que aparecian en la corrida de ese momento). Se usa para la columna
# "Etapa de pipeline" del detalle de oportunidades.
PIPELINE_STAGE_NAMES = {
    # Comercio
    "a6586695-8b79-4dd1-bb26-8d5bc945b752": "Nuevo lead",
    "5924cb77-2282-42a7-9e01-ed0bb20281dc": "Conv. Iniciada",
    "91532fbc-ffda-4604-bc25-ca58166bbf53": "Automatizacion dinamica",
    "7946f5d4-a474-4697-a8c2-92db83b71346": "Seguimiento",
    "8594e0fb-cd79-4581-8fa3-f4b56c63ee7e": "Baja x desinteres",
    "501228e9-133a-4c4d-92aa-cee9baefcc15": "Baja x precio",
    # Hogar
    "af8aa8c4-1141-454e-b5d4-606751557363": "Nuevo Lead",
    "65b86f8d-0b18-4d8b-b8d5-b9f1266dc5ba": "Conv. Iniciada",
    "54761431-ce5a-4a53-a539-b7a6be676ccc": "Recontactos Automatizados",
    "e790f05a-60f9-4e82-acd5-0f2f9d67c675": "Seguimiento",
    "7a58bb96-bff2-4d59-8634-0bd6995f905e": "Baja x desinteres",
    "a93a44cf-67dd-4d7c-b90b-af8aa75dcceb": "Baja x precio",
    # Leads Organicos
    "8558af67-2063-46c5-9f5f-e6d92484eba8": "Nuevo lead",
    "a9220c7f-6425-4f7d-a416-b68b169e0460": "Conv. Iniciada",
    "70798112-34b0-4205-aa91-0c74643f4339": "Automatizacion Dinamica",
    "4ffdb32c-ec89-487d-9a21-d6a2a9dfc866": "Seguimiento",
    "5c3d6fa3-9356-4a7f-b4c0-91e36455f495": "Baja x desinteres",
    "972780bc-874c-4705-b421-e1726a443f6a": "Baja x precio",
    "d01d69c3-b7f5-493c-b198-94e0e26508c7": "Visita agendada",
    # Obra Segura
    "b3b82029-7d98-458a-bf6f-7218b821ca27": "New Lead",
    "08520929-2de3-45ec-b4d6-d24df3403bbe": "Contacted",
    "453fe183-ff64-4f6b-90a9-36177944229d": "Seguimiento",
    "610a5abb-d67b-47a7-8f84-6b764cb28074": "Proposal Sent",
    "8f6976cc-f022-4c9c-a3de-af859e054046": "Closed",
    # Visitas
    "71989c58-aeee-4c5a-bfc6-02997375065b": "Visita coordinada",
    "5dc95c7f-0b33-4a04-aa45-d078cc571920": "Reagendar visita",
    "3bcc1dd2-70de-47af-b123-2aaa6e6bc818": "Visita efectuada",
    "ba115218-902b-4901-a90c-ec99c738d856": "Presupuesto enviado",
    "47fd6dde-dffe-490e-a6af-ffd8937b81bd": "Recontacto 1",
    "4f06b795-184a-440b-a1f4-10ffe22acfb6": "Recontacto 2",
    "8133262f-3c1b-47c9-8113-76350e6d6641": "Respondio al recontacto",
    "7068ac99-7f3a-4e57-ae7c-088acf5b629f": "Venta ganada",
    "e2adaf6d-79d7-4dcc-ae0e-616f3e16d965": "Venta perdida",
}

PALETTE = ["#1F3864", "#2a78d6", "#2a9d5c", "#8e6bb0", "#eb6834", "#9AA0A6", "#c9a227", "#6b6b6b"]

CONV_FIELDS_DEFAULT = {
    "tiene_datos_conversacion": False,
    "mensajes_total": 0,
    "mensajes_inbound": 0,
    "mensajes_outbound": 0,
    "primer_mensaje": None,
    "ultimo_mensaje": None,
    "motivo_categoria": None,
    "resumen_conversacion": None,
    "hilo_mensajes": [],
}


def cf_value(customfields, cf_id):
    for cf in customfields or []:
        if cf.get("id") == cf_id:
            return cf.get("fieldValueString") or cf.get("value")
    return None


def clasificar_canal(tags):
    for tag, canal in CANALES_TAGS.items():
        if tag in (tags or []):
            return canal
    return None


def parse_iso(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def valores_netsuite_por_crm(opp, columna):
    """Primer valor no vacío de una columna del Excel de ventas (NetSuite)
    por 'ID CLIENTE CRM'. Igual criterio que analisis_mensual_mkt.py."""
    if opp is None or columna not in opp.columns:
        return {}

    def _primero_no_vacio(serie):
        for v in serie:
            if pd.notna(v) and str(v).strip():
                return v
        return None

    return (
        opp.dropna(subset=["ID CLIENTE CRM"])
        .astype({"ID CLIENTE CRM": str})
        .groupby("ID CLIENTE CRM")[columna]
        .apply(_primero_no_vacio)
        .to_dict()
    )


def cargar_ventas_para_cruce(path_excel):
    """Carga liviana del Excel de ventas solo para el cruce de esta pantalla
    (no se preocupa por deduplicar oportunidades como cargar_ventas() de
    analisis_mensual_mkt.py -- acá alcanza con el primer valor no vacío por
    cliente)."""
    if not path_excel:
        return None
    df = pd.read_excel(path_excel)
    if "ID CLIENTE CRM" not in df.columns:
        print(f"AVISO: {path_excel} no tiene columna 'ID CLIENTE CRM'; se omite el cruce con NetSuite.")
        return None
    return df


def resolver_vendedor_ghl(contacto_crudo, opps_del_contacto):
    """assignedTo del contacto, o si no está, el de la oportunidad
    actualizada más recientemente -- resuelto a nombre via VENDEDOR_GHL_IDS."""
    assigned_id = (contacto_crudo or {}).get("assignedTo")
    if not assigned_id and opps_del_contacto:
        mas_reciente = sorted(opps_del_contacto, key=lambda o: o.get("updatedAt") or "", reverse=True)
        assigned_id = next((o.get("assignedTo") for o in mas_reciente if o.get("assignedTo")), None)
    return VENDEDOR_GHL_IDS.get(assigned_id) if assigned_id else None


def donut_svg(counter_items, total, filtro_campo, explorer_id, n_label="contactos"):
    """counter_items: lista de (etiqueta, cantidad) ya ordenada desc."""
    r = 76.0
    circunf = 2 * math.pi * r
    cx = cy = 90.0
    segments = []
    legend = []
    offset = 0.0
    for i, (label, count) in enumerate(counter_items):
        if count == 0:
            continue
        color = PALETTE[i % len(PALETTE)]
        pct = 100 * count / total if total else 0
        largo = circunf * count / total if total else 0
        resto = circunf - largo
        onclick = f'applyFilter(\"{explorer_id}\", {{"{filtro_campo}": {json.dumps(label)}}})'
        segments.append(
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{color}" stroke-width="28" '
            f'class="donut-seg clickable" stroke-dasharray="{largo:.2f} {resto:.2f}" '
            f'stroke-dashoffset="-{offset:.2f}" transform="rotate(-90 {cx} {cy})" '
            f"onclick='{onclick}'><title>{label}: {count} ({pct:.1f}%)</title></circle>"
        )
        legend.append(
            f'<span class="legend-item clickable" onclick=\'{onclick}\'>'
            f'<span class="swatch" style="background:{color}"></span>{label}: <strong>{count}</strong> ({pct:.1f}%)</span>'
        )
        offset += largo
    svg = (
        f'<svg viewBox="0 0 180 180" width="180" height="180" role="img" aria-label="grafico de torta" class="donut-svg">'
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#DEDCD3" stroke-width="28"/>'
        + "".join(segments)
        + f'<text x="{cx}" y="87.0" text-anchor="middle" class="donut-center-num">{total}</text>'
        + f'<text x="{cx}" y="106.0" text-anchor="middle" class="donut-center-sub">{n_label}</text></svg>'
    )
    return f'<div class="donut-flex">{svg}<div class="chart-legend chart-legend-wrap">{"".join(legend)}</div></div>'


def contar(items, campo):
    c = {}
    for it in items:
        v = it.get(campo) or "Sin dato"
        c[v] = c.get(v, 0) + 1
    return sorted(c.items(), key=lambda kv: -kv[1])



# =====================================================================
# generar(): Resumen ejecutivo con NetSuite como fuente de las ventas.
#
# Criterio (definido el 01/10/2026):
#   - Las oportunidades del informe son las de NetSuite con FECHA DE
#     OPORTUNIDAD en el rango (busqueda "SP- Fede Oportunidades por Vendedor").
#   - "Ganada" = estado de NetSuite Compra / Venta Cerrada Concretada
#     (columna "Aprobada" = 1, estados 12 y 13).
#   - GHL aporta informacion: origen, forma de contacto e interesado en
#     (cuando NetSuite no lo tiene), tags, monto y etapa de su oportunidad,
#     y las conversaciones. El estado de GHL queda solo como dato informativo.
#   - GHL tambien aporta los contactos nuevos del rango (tabla "Contactos").
# =====================================================================

ESTADOS_PERDIDA = ("rechazada", "perdida")


def _vacio(v):
    return v is None or (isinstance(v, float) and math.isnan(v)) or not str(v).strip()


def _limpio(v):
    return None if _vacio(v) else v


def _fecha_iso(v):
    if _vacio(v):
        return None
    try:
        return pd.Timestamp(v).strftime("%Y-%m-%d")
    except Exception:
        return str(v)[:10]


def generar(contactos, oportunidades, ventas_df, old_contacts, periodo_inicio, periodo_fin,
            rango_label, fecha_actualizacion):
    """
    contactos: contactos crudos de GHL (alta en el rango + los traidos por ID
        para las oportunidades de NetSuite).
    oportunidades: oportunidades crudas de GHL (actualizadas en el rango + las
        de esos contactos traidos por ID). Solo aportan informacion.
    ventas_df: DataFrame de NetSuite (mismas columnas que el Excel).
    old_contacts: CONTACTS anteriores, para preservar los campos de conversacion.
    Devuelve dict(contacts=[...], panel_html="<section ...>", stats={...}).
    """
    old_by_id = {c["contact_id"]: c for c in (old_contacts or []) if c.get("contact_id")}
    contactos_por_id = {c.get("id"): c for c in contactos if c.get("id")}

    opp_ghl_por_contacto = {}
    for o in oportunidades:
        if o.get("contactId"):
            opp_ghl_por_contacto.setdefault(o["contactId"], []).append(o)

    # ---- Oportunidades de NetSuite agrupadas por contacto ----
    ns_por_contacto = {}
    if ventas_df is not None and len(ventas_df):
        for _, f in ventas_df.iterrows():
            crm = _limpio(f.get("ID CLIENTE CRM"))
            clave = str(crm) if crm else f"ns-{_limpio(f.get('ID')) or int(f.get('ID interno'))}"
            ns_por_contacto.setdefault(clave, []).append(f)

    fuente_contador = {"origen": {"netsuite": 0, "ghl": 0, "sin_dato": 0},
                       "forma": {"netsuite": 0, "ghl": 0, "sin_dato": 0},
                       "vendedor": {"netsuite": 0, "ghl": 0, "sin_dato": 0}}

    def primero(filas, col):
        for f in filas:
            v = _limpio(f.get(col))
            if v is not None:
                return v
        return None

    def registro(contact_id, crudo, filas_ns):
        crudo = crudo or {}
        cfs = crudo.get("customFields") or []
        opps_ghl = opp_ghl_por_contacto.get(contact_id, [])
        tags = crudo.get("tags") or []

        nombre = (f"{crudo.get('firstName') or ''} {crudo.get('lastName') or ''}".strip()
                  or crudo.get("name") or crudo.get("contactName") or crudo.get("email")
                  or primero(filas_ns, "Cliente") or contact_id)

        # ---- NetSuite: oportunidades, estado y grupo ----
        ns_opps = []
        for f in filas_ns:
            ns_opps.append({
                "oportunidad": _limpio(f.get("Oportunidad")),
                "fecha": _fecha_iso(f.get("Fecha Oportunidad")),
                "estado": _limpio(f.get("Estado Oportunidad")),
                "ganada": int(f.get("Aprobada") or 0) == 1,
                "unidad_negocio": _limpio(f.get("Unidad de Negocio")),
                "tipo_establecimiento": _limpio(f.get("Tipo de establecimiento")),
                "categoria": _limpio(f.get("Categoría")),
                "tipo_proyecto": _limpio(f.get("Tipo de Proyecto")),
            })
        ns_opps.sort(key=lambda o: o["fecha"] or "")
        n_oportunidades = len(ns_opps)
        n_ganadas = sum(1 for o in ns_opps if o["ganada"])
        tiene_oportunidad = n_oportunidades > 0
        grupo_venta = ns_estado = fecha_oportunidad = None
        if tiene_oportunidad:
            relevante = ([o for o in ns_opps if o["ganada"]] or ns_opps)[-1]
            ns_estado, fecha_oportunidad = relevante["estado"], relevante["fecha"]
            if n_ganadas:
                grupo_venta = "Cerrada (venta)"
            elif all(any(p in (o["estado"] or "").lower() for p in ESTADOS_PERDIDA) for o in ns_opps):
                grupo_venta = "Perdida"
            else:
                grupo_venta = "Abierta / en proceso"

        # ---- GHL: informacion de su oportunidad (monto, etapa, estado) ----
        ghl_estado = monto = etapa_pipeline = None
        if opps_ghl:
            ganadas_ghl = [o for o in opps_ghl if o.get("status") == "won"]
            o = max(ganadas_ghl or opps_ghl, key=lambda x: x.get("updatedAt") or "")
            ghl_estado, monto = o.get("status"), o.get("monetaryValue")
            etapa_pipeline = PIPELINE_STAGE_NAMES.get(o.get("pipelineStageId"), o.get("pipelineStageId"))

        # ---- Cruce de origen / forma / vendedor: NetSuite manda, GHL respalda ----
        origen_ns, forma_ns = primero(filas_ns, "Origen de clientes potenciales"), primero(filas_ns, "Forma de Contacto con SP")
        vendedor_ns = normalizar_vendedor_netsuite(primero(filas_ns, "Representante de Ventas"))
        origen_ghl, forma_ghl = cf_value(cfs, CF_ORIGEN), cf_value(cfs, CF_FORMA)
        vendedor_ghl = resolver_vendedor_ghl(crudo, opps_ghl)
        for campo, ns, ghl in (("origen", origen_ns, origen_ghl), ("forma", forma_ns, forma_ghl),
                               ("vendedor", vendedor_ns, vendedor_ghl)):
            fuente_contador[campo]["netsuite" if ns else ("ghl" if ghl else "sin_dato")] += 1

        date_added = crudo.get("dateAdded")
        da = parse_iso(date_added)
        canal = clasificar_canal(tags)
        reg = {
            "contact_id": contact_id,
            "nombre": nombre,
            "date_added": date_added,
            "contacto_del_periodo": bool(da and periodo_inicio <= da <= periodo_fin),
            "origen_cliente": origen_ns or origen_ghl or "Sin dato",
            "forma_contacto": forma_ns or forma_ghl or "Sin dato",
            "interesado_en": cf_value(cfs, CF_INTERESADO) or "Sin dato",
            "vendedor": vendedor_ns or vendedor_ghl or "Sin asignar",
            "canal_tag": f"{canal} (tag)" if canal else None,
            "tags": tags,
            "sin_contacto_ghl": (not contact_id) or contact_id.startswith("ns-") or not crudo,
            "ns_estado": ns_estado,
            "ns_oportunidades": ns_opps,
            "ghl_estado": ghl_estado,
            "n_oportunidades": n_oportunidades,
            "n_ganadas": n_ganadas,
            "tiene_oportunidad": tiene_oportunidad,
            "grupo_venta": grupo_venta,
            "monto": monto,
            "fecha_creacion_oportunidad": fecha_oportunidad,
            "fecha_cierre": None,
            "etapa_pipeline": etapa_pipeline,
            "nro_cliente_netsuite": primero(filas_ns, "ID"),
        }
        old = old_by_id.get(contact_id)
        for k in CONV_FIELDS_DEFAULT:
            reg[k] = old.get(k, CONV_FIELDS_DEFAULT[k]) if old else CONV_FIELDS_DEFAULT[k]
        return reg

    # Universo: contactos nuevos del rango (GHL) + contactos con oportunidad en NetSuite.
    nuevos_contacts, vistos = [], set()
    for cid, crudo in contactos_por_id.items():
        da = parse_iso(crudo.get("dateAdded"))
        if cid in ns_por_contacto or (da and periodo_inicio <= da <= periodo_fin):
            nuevos_contacts.append(registro(cid, crudo, ns_por_contacto.get(cid, [])))
            vistos.add(cid)
    for clave, filas in ns_por_contacto.items():
        if clave in vistos:
            continue
        # Con oportunidad en NetSuite pero sin ficha de GHL disponible: se usa el
        # contacto embebido en alguna oportunidad de GHL, si existe.
        embebido = next((o.get("contact") for o in opp_ghl_por_contacto.get(clave, []) if o.get("contact")), None)
        nuevos_contacts.append(registro(clave, embebido, filas))

    # ---- KPIs (NetSuite) ----
    total_oportunidades = sum(c["n_oportunidades"] for c in nuevos_contacts)
    oportunidades_ganadas = sum(c["n_ganadas"] for c in nuevos_contacts)
    contactos_con_oportunidad = [c for c in nuevos_contacts if c["tiene_oportunidad"]]
    n_con_oportunidad = len(contactos_con_oportunidad)
    contactos_ganados = [c for c in contactos_con_oportunidad if c["n_ganadas"] > 0]
    n_ganados = len(contactos_ganados)
    n_del_periodo = sum(1 for c in nuevos_contacts if c["contacto_del_periodo"])
    origen_ganadas = contar(contactos_ganados, "origen_cliente")
    sin_ghl = sum(1 for c in contactos_con_oportunidad if c["sin_contacto_ghl"])

    rango_fechas = f"{periodo_inicio.strftime('%d/%m')} al {periodo_fin.strftime('%d/%m')}"

    panel_resumen = f'''<section class="tab-panel active" id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen">
      <h2>Resumen ejecutivo</h2>
      <div class="kpi-caveat">Oportunidades y ventas segun NetSuite (fecha de oportunidad del {rango_fechas}); origen, conversaciones y contactos nuevos segun GHL. Actualizado el {fecha_actualizacion} &middot; origen resuelto por NetSuite {fuente_contador["origen"]["netsuite"]}, por GHL {fuente_contador["origen"]["ghl"]}.</div>
      <h3>Oportunidades (NetSuite)</h3>

<div class="kpi-row kpi-row-featured">
  <div class="kpi-card kpi-card-feature kpi-card-feature--win">
    <div class="kpi-num">{oportunidades_ganadas}</div>
    <div class="kpi-label">Oportunidades ganadas &middot; {rango_label}</div>
  </div>
  <div class="kpi-card kpi-card-feature kpi-card-feature--win">
    <div class="kpi-num">{n_ganados}</div>
    <div class="kpi-label">Clientes con al menos una oportunidad ganada</div>
  </div>
  <div class="kpi-card kpi-card-feature kpi-card-feature--total">
    <div class="kpi-num">{total_oportunidades}</div>
    <div class="kpi-label">Total de oportunidades &middot; {rango_label}</div>
  </div>
</div>
<div class="kpi-row">
  <div class="kpi-card"><div class="kpi-num">{n_con_oportunidad}</div><div class="kpi-label">Clientes con al menos una oportunidad en el rango</div></div>
  <div class="kpi-card"><div class="kpi-num">{sin_ghl}</div><div class="kpi-label">Clientes sin contacto en GHL (sin ID CLIENTE CRM o sin ficha)</div></div>
</div>

<div class="donut-row donut-row-single">
  <div class="donut-block">
    <div class="donut-block-title">Origen de los clientes con oportunidad ganada &middot; n={n_ganados}</div>
    {donut_svg(origen_ganadas, n_ganados, "origen_cliente", "oportunidades")}
  </div>
</div>

<div class="explorer" id="explorer-oportunidades">
  <div class="explorer-bar">
    <div class="explorer-bar-top">
      <div class="explorer-title">Clientes con oportunidad en NetSuite en el rango ({n_con_oportunidad}) &mdash; click para ver el detalle</div>
      <span class="explorer-count" id="oportunidades-count"></span>
    </div>
    <div class="explorer-bar-controls">
      <select class="explorer-select" id="oportunidades-estado-select" onchange="setEstadoFilter('oportunidades', this.value)"></select>
      <select class="explorer-select" id="oportunidades-grupo-select" onchange="setGrupoFilter('oportunidades', this.value)"></select>
      <select class="explorer-select" id="oportunidades-vendedor-select" onchange="setVendedorFilter('oportunidades', this.value)"></select>
      <span class="explorer-date-group"><span class="explorer-date-label">Alta desde</span><input type="date" class="explorer-date" id="oportunidades-date-from" onchange="setDateFilter('oportunidades','from', this.value)" title="Filtra por fecha de alta del contacto"><span class="explorer-date-label">hasta</span><input type="date" class="explorer-date" id="oportunidades-date-to" onchange="setDateFilter('oportunidades','to', this.value)" title="Filtra por fecha de alta del contacto"></span>
      <input class="explorer-search" placeholder="Buscar por nombre..." oninput="setSearch('oportunidades', this.value)">
      <button class="explorer-clear" onclick="clearFilter('oportunidades')">Limpiar filtros</button>
    </div>
    <div class="explorer-chips" id="oportunidades-chips"></div>
  </div>
  <div class="table-scroll">
    <table class="data-table explorer-table" id="oportunidades-table">
      <thead id="oportunidades-thead"></thead>
      <tbody id="oportunidades-tbody"></tbody>
    </table>
  </div>
</div>

      <h3 id="contactos-hoy-titulo">Contactos cargados hoy</h3>

<div class="kpi-row">
  <div class="kpi-card"><div class="kpi-num" id="contactos-hoy-kpi-num">&nbsp;</div><div class="kpi-label" id="contactos-hoy-kpi-label">Contactos cargados hoy</div></div>
</div>

<div class="donut-row donut-row-single" id="contactos-hoy-donut-row"></div>

<div class="explorer" id="explorer-contactos">
  <div class="explorer-bar">
    <div class="explorer-bar-top">
      <div class="explorer-title">Contactos creados en GHL del {rango_label} ({n_del_periodo}) &mdash; click en una fila para ver el detalle</div>
      <span class="explorer-count" id="contactos-count"></span>
    </div>
    <div class="explorer-bar-controls">
      <select class="explorer-select" id="contactos-estado-select" onchange="setEstadoFilter('contactos', this.value)"></select>
      <select class="explorer-select" id="contactos-vendedor-select" onchange="setVendedorFilter('contactos', this.value)"></select>
      <span class="explorer-date-group"><span class="explorer-date-label">Alta desde</span><input type="date" class="explorer-date" id="contactos-date-from" onchange="setDateFilter('contactos','from', this.value)" title="Filtra por fecha de alta del contacto"><span class="explorer-date-label">hasta</span><input type="date" class="explorer-date" id="contactos-date-to" onchange="setDateFilter('contactos','to', this.value)" title="Filtra por fecha de alta del contacto"></span>
      <input class="explorer-search" placeholder="Buscar por nombre..." oninput="setSearch('contactos', this.value)">
      <button class="explorer-clear" onclick="clearFilter('contactos')">Limpiar filtros</button>
    </div>
    <div class="explorer-chips" id="contactos-chips"></div>
  </div>
  <div class="table-scroll">
    <table class="data-table explorer-table" id="contactos-table">
      <thead id="contactos-thead"></thead>
      <tbody id="contactos-tbody"></tbody>
    </table>
  </div>
</div>

    </section>'''

    stats = {
        "contactos_total": len(nuevos_contacts),
        "contactos_del_periodo": n_del_periodo,
        "clientes_con_oportunidad_ns": n_con_oportunidad,
        "clientes_ganados_ns": n_ganados,
        "oportunidades_total_ns": total_oportunidades,
        "oportunidades_ganadas_ns": oportunidades_ganadas,
        "clientes_sin_contacto_ghl": sin_ghl,
        "cruce_netsuite": fuente_contador,
    }
    return {"contacts": nuevos_contacts, "panel_html": panel_resumen, "stats": stats}

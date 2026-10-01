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
# generar(): version "en memoria" de main() para el servicio.
# =====================================================================

def generar(contactos, oportunidades, ventas_df, old_contacts, periodo_inicio, periodo_fin,
            rango_label, fecha_actualizacion):
    """
    contactos / oportunidades: listas crudas de GHL (mismo formato que
        contactos.json / oportunidades.json de los scripts por fecha).
    ventas_df: DataFrame de NetSuite (mismas columnas que el Excel) o None.
    old_contacts: CONTACTS de la corrida anterior / HTML publicado, para
        preservar los campos de conversacion (resumen, motivo, hilo).
    periodo_inicio / periodo_fin: datetimes con zona horaria (inclusive).
    rango_label: ej. "01/09/2026 al 30/09/2026".
    fecha_actualizacion: ej. "01/10/2026 14:35".
    Devuelve dict(contacts=[...], panel_html="<section ...>", stats={...}).
    """
    def _ns(columna):
        # groupby().apply() convierte los grupos sin dato en NaN, que en Python es
        # "verdadero": sin este filtro un NaN le ganaria al dato de GHL en el cruce
        # (y ademas no se puede guardar en JSON). Se descartan NaN y vacios.
        return {
            cid: v for cid, v in valores_netsuite_por_crm(ventas_df, columna).items()
            if v is not None and not (isinstance(v, float) and math.isnan(v)) and str(v).strip()
        }

    ns_origen = _ns("Origen de clientes potenciales")
    ns_forma = _ns("Forma de Contacto con SP")
    ns_vendedor = {cid: normalizar_vendedor_netsuite(nombre) for cid, nombre in _ns("Representante de Ventas").items()}
    ns_cliente = _ns("ID")
    fuente_contador = {"origen": {"netsuite": 0, "ghl": 0, "sin_dato": 0},
                        "forma": {"netsuite": 0, "ghl": 0, "sin_dato": 0},
                        "vendedor": {"netsuite": 0, "ghl": 0, "sin_dato": 0}}

    old_by_id = {c["contact_id"]: c for c in (old_contacts or []) if c.get("contact_id")}

    opp_by_contact = {}
    for o in oportunidades:
        cid = o.get("contactId")
        if cid:
            opp_by_contact.setdefault(cid, []).append(o)

    contacto_ids_en_archivo = {c.get("id") for c in contactos}

    def construir_registro(contact_id, nombre, date_added, tags, origen_ghl, forma_ghl, interesado_en, contacto_crudo):
        opps = opp_by_contact.get(contact_id, [])
        n_oportunidades = len(opps)
        n_ganadas = sum(1 for o in opps if o.get("status") == "won")
        tiene_oportunidad = n_oportunidades > 0
        grupo_venta = None
        ghl_estado = None
        mas_reciente = None
        if tiene_oportunidad:
            grupo_venta = "Cerrada (venta)" if n_ganadas > 0 else "Abierta / en proceso"
            mas_reciente = max(opps, key=lambda o: o.get("updatedAt") or "")
            ghl_estado = mas_reciente.get("status")

        # Oportunidad "relevante": la ganada mas reciente si hay alguna, si no
        # la mas reciente en general (criterio del 22/09/2026, caso Cadelli).
        opp_relevante = None
        if tiene_oportunidad:
            ganadas_del_contacto = [o for o in opps if o.get("status") == "won"]
            if ganadas_del_contacto:
                opp_relevante = max(ganadas_del_contacto, key=lambda o: o.get("lastStatusChangeAt") or o.get("updatedAt") or "")
            else:
                opp_relevante = mas_reciente
        monto = opp_relevante.get("monetaryValue") if opp_relevante else None
        fecha_creacion_oportunidad = opp_relevante.get("createdAt") if opp_relevante else None
        fecha_cierre = None
        if opp_relevante and opp_relevante.get("status") in ("won", "lost"):
            fecha_cierre = opp_relevante.get("lastStatusChangeAt")
        etapa_pipeline = None
        if opp_relevante:
            stage_id = opp_relevante.get("pipelineStageId")
            etapa_pipeline = PIPELINE_STAGE_NAMES.get(stage_id, stage_id)
        nro_cliente_netsuite = ns_cliente.get(contact_id)

        da = parse_iso(date_added)
        contacto_del_periodo = bool(da and periodo_inicio <= da <= periodo_fin)

        canal = clasificar_canal(tags)
        canal_tag = f"{canal} (tag)" if canal else None

        # Cruce NetSuite/GHL: NetSuite manda, GHL de respaldo.
        origen_ns = ns_origen.get(contact_id)
        origen_final = origen_ns or origen_ghl
        fuente_contador["origen"]["netsuite" if origen_ns else ("ghl" if origen_ghl else "sin_dato")] += 1

        forma_ns = ns_forma.get(contact_id)
        forma_final = forma_ns or forma_ghl
        fuente_contador["forma"]["netsuite" if forma_ns else ("ghl" if forma_ghl else "sin_dato")] += 1

        vendedor_ns = ns_vendedor.get(contact_id)
        vendedor_ghl = resolver_vendedor_ghl(contacto_crudo, opps)
        vendedor_final = vendedor_ns or vendedor_ghl
        fuente_contador["vendedor"]["netsuite" if vendedor_ns else ("ghl" if vendedor_ghl else "sin_dato")] += 1

        registro = {
            "contact_id": contact_id,
            "nombre": nombre,
            "date_added": date_added,
            "contacto_del_periodo": contacto_del_periodo,
            "origen_cliente": origen_final or "Sin dato",
            "forma_contacto": forma_final or "Sin dato",
            "interesado_en": interesado_en or "Sin dato",
            "vendedor": vendedor_final or "Sin asignar",
            "canal_tag": canal_tag,
            "tags": tags or [],
            "ghl_estado": ghl_estado,
            "n_oportunidades": n_oportunidades,
            "n_ganadas": n_ganadas,
            "tiene_oportunidad": tiene_oportunidad,
            "grupo_venta": grupo_venta,
            "monto": monto,
            "fecha_creacion_oportunidad": fecha_creacion_oportunidad,
            "fecha_cierre": fecha_cierre,
            "etapa_pipeline": etapa_pipeline,
            "nro_cliente_netsuite": nro_cliente_netsuite,
        }
        old = old_by_id.get(contact_id)
        for k in CONV_FIELDS_DEFAULT:
            registro[k] = old.get(k, CONV_FIELDS_DEFAULT[k]) if old else CONV_FIELDS_DEFAULT[k]
        return registro

    nuevos_contacts = []
    for c in contactos:
        cid = c.get("id")
        cfs = c.get("customFields") or []
        nombre = (
            f"{c.get('firstName') or ''} {c.get('lastName') or ''}".strip()
            or c.get("email") or cid
        )
        nuevos_contacts.append(construir_registro(
            cid, nombre, c.get("dateAdded"), c.get("tags"),
            cf_value(cfs, CF_ORIGEN), cf_value(cfs, CF_FORMA), cf_value(cfs, CF_INTERESADO),
            c,
        ))

    # Contactos "stub": referenciados por una oportunidad pero con alta fuera del rango.
    ids_agregados = set(contacto_ids_en_archivo)
    for o in oportunidades:
        cid = o.get("contactId")
        if not cid or cid in ids_agregados:
            continue
        embedded = o.get("contact") or {}
        if not embedded:
            continue
        nuevos_contacts.append(construir_registro(
            cid, embedded.get("name") or cid, None, embedded.get("tags"),
            None, None, None, embedded,
        ))
        ids_agregados.add(cid)

    total_oportunidades = len(oportunidades)
    oportunidades_ganadas = sum(1 for o in oportunidades if o.get("status") == "won")
    contactos_con_oportunidad = [c for c in nuevos_contacts if c["tiene_oportunidad"]]
    n_con_oportunidad = len(contactos_con_oportunidad)
    contactos_del_periodo = [c for c in nuevos_contacts if c["contacto_del_periodo"]]
    n_del_periodo = len(contactos_del_periodo)
    contactos_ganados = [c for c in contactos_con_oportunidad if c["n_ganadas"] > 0]
    n_ganados = len(contactos_ganados)
    origen_ganadas = contar(contactos_ganados, "origen_cliente")

    rango_fechas = f"{periodo_inicio.strftime('%d/%m')} al {periodo_fin.strftime('%d/%m')}"
    cruce_txt = ""
    if ventas_df is not None:
        cruce_txt = (
            f' &middot; cruzado con NetSuite (Origen {fuente_contador["origen"]["netsuite"]}, '
            f'Forma {fuente_contador["forma"]["netsuite"]}, Vendedor {fuente_contador["vendedor"]["netsuite"]} '
            f"resueltos por esa via)"
        )

    panel_resumen = f'''<section class="tab-panel active" id="panel-resumen" role="tabpanel" aria-labelledby="tab-resumen">
      <h2>Resumen ejecutivo</h2>
      <div class="kpi-caveat">Contactos y oportunidades actualizados el {fecha_actualizacion} (datos de GHL y NetSuite, {rango_fechas}){cruce_txt}.</div>
      <h3>Oportunidades (trazabilidad)</h3>

<div class="kpi-row kpi-row-featured">
  <div class="kpi-card kpi-card-feature kpi-card-feature--win">
    <div class="kpi-num">{oportunidades_ganadas}</div>
    <div class="kpi-label">Oportunidades ganadas &middot; {rango_label}</div>
  </div>
  <div class="kpi-card kpi-card-feature kpi-card-feature--win">
    <div class="kpi-num">{n_ganados}</div>
    <div class="kpi-label">Contactos con al menos una oportunidad ganada</div>
  </div>
  <div class="kpi-card kpi-card-feature kpi-card-feature--total">
    <div class="kpi-num">{total_oportunidades}</div>
    <div class="kpi-label">Total de oportunidades &middot; {rango_label}</div>
  </div>
</div>
<div class="kpi-row">
  <div class="kpi-card"><div class="kpi-num">{n_con_oportunidad}</div><div class="kpi-label">Contactos con al menos una oportunidad en el rango</div></div>
</div>

<div class="donut-row donut-row-single">
  <div class="donut-block">
    <div class="donut-block-title">Origen de los contactos con oportunidad ganada &middot; n={n_ganados}</div>
    {donut_svg(origen_ganadas, n_ganados, "origen_cliente", "oportunidades")}
  </div>
</div>

<div class="explorer" id="explorer-oportunidades">
  <div class="explorer-bar">
    <div class="explorer-bar-top">
      <div class="explorer-title">Contactos con oportunidad actualizada en el rango ({n_con_oportunidad}) &mdash; click para ver el detalle</div>
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

      <h3>Contactos cargados hoy</h3>

<div class="kpi-row">
  <div class="kpi-card"><div class="kpi-num" id="contactos-hoy-kpi-num">&nbsp;</div><div class="kpi-label">Contactos cargados hoy</div></div>
</div>

<div class="donut-row donut-row-single" id="contactos-hoy-donut-row"></div>

<div class="explorer" id="explorer-contactos">
  <div class="explorer-bar">
    <div class="explorer-bar-top">
      <div class="explorer-title">Contactos creados del {rango_label} ({n_del_periodo}) &mdash; click en una fila para ver el detalle</div>
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
        "contactos_con_oportunidad": n_con_oportunidad,
        "contactos_ganados": n_ganados,
        "oportunidades_total": total_oportunidades,
        "oportunidades_ganadas": oportunidades_ganadas,
        "cruce_netsuite": fuente_contador,
    }
    return {"contacts": nuevos_contacts, "panel_html": panel_resumen, "stats": stats}

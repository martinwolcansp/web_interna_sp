# app/job.py — Una corrida completa de actualizacion del informe MKT.
#
# Reemplaza los pasos manuales de Actualizacion_Informe_MKT.docx:
#   1. Descargar GHL (contactos por alta, oportunidades por actualizacion)
#   2-3. Cargar contacto/oportunidad en Supabase (upsert, igual que generar_sql.py)
#   (nuevo) Traer de NetSuite la busqueda "Oportunidades por vendedor" via RESTlet
#   5. Calcular el Resumen ejecutivo (misma logica que actualizar_resumen_ejecutivo.py)
#   6. Publicar: se guarda en informe_mkt_corrida y la pagina lo lee de ahi
# El paso 4 (analisis_mensual_mkt.py -> resumen.json / tablas_dinamicas.xlsx)
# no se publica en la web y queda como proceso manual para el informe completo.

import json
import logging
import re
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

import requests

from app import config, ghl, netsuite, resumen_ejecutivo
from app import supabase_rest as sb

logger = logging.getLogger("informe_mkt_job")

CF_ORIGEN = resumen_ejecutivo.CF_ORIGEN
CF_FORMA = resumen_ejecutivo.CF_FORMA
CF_INTERESADO = resumen_ejecutivo.CF_INTERESADO


def limites_del_rango(desde, hasta):
    """[inicio, fin_excl) en la zona horaria de Argentina."""
    tz = ZoneInfo(config.ZONA_HORARIA)
    inicio = datetime.combine(desde, time.min, tzinfo=tz)
    fin_excl = datetime.combine(hasta + timedelta(days=1), time.min, tzinfo=tz)
    return inicio, fin_excl


def _split_nombre(full_name):
    if not full_name:
        return None, None
    partes = full_name.strip().split(" ", 1)
    return (partes[0], None) if len(partes) == 1 else (partes[0], partes[1])


def cargar_en_supabase(token, contactos, oportunidades, log):
    """Mismo mapeo de columnas que Desarrollo/generar_sql.py, pero por PostgREST."""
    ahora = datetime.now(timezone.utc).isoformat()

    filas_contacto = []
    for c in contactos:
        cfs = c.get("customFields") or []
        filas_contacto.append({
            "ghl_contact_id": c.get("id"),
            "nombre": c.get("firstName"),
            "apellido": c.get("lastName"),
            "email": c.get("email"),
            "telefono": c.get("phone"),
            "origen_lead": resumen_ejecutivo.cf_value(cfs, CF_ORIGEN),
            "forma_contacto": resumen_ejecutivo.cf_value(cfs, CF_FORMA),
            "interesado_en": resumen_ejecutivo.cf_value(cfs, CF_INTERESADO),
            "vendedor_asignado": c.get("assignedTo"),
            "tags": c.get("tags") or [],
            "fecha_creacion_ghl": c.get("dateAdded"),
            "fecha_actualizacion_ghl": c.get("dateUpdated"),
            "sync_estado": "sincronizado",
            "sync_actualizado_en": ahora,
            "origen_ultimo_cambio": "ghl",
        })
    sb.upsert_contactos(token, filas_contacto)

    ids_cargados = {c.get("id") for c in contactos}
    stubs = {}
    for o in oportunidades:
        cid = o.get("contactId")
        embedded = o.get("contact") or {}
        if not cid or cid in ids_cargados or cid in stubs or not embedded:
            continue
        nombre, apellido = _split_nombre(embedded.get("name"))
        stubs[cid] = {
            "ghl_contact_id": cid,
            "nombre": nombre,
            "apellido": apellido,
            "email": embedded.get("email"),
            "telefono": embedded.get("phone"),
            "tags": embedded.get("tags") or [],
            "sync_estado": "pendiente",
            "sync_mensaje": (
                f"Reconstruido desde datos embebidos de la oportunidad {o.get('id')} "
                "(fuera del rango de contactos pedido a la API) -- completar con una carga de contactos mas amplia."
            ),
            "sync_actualizado_en": ahora,
            "origen_ultimo_cambio": "ghl",
        }
    sb.insertar_stubs(token, list(stubs.values()))

    mapa = sb.mapa_ids_contacto(token, [o.get("contactId") for o in oportunidades if o.get("contactId")])
    filas_opp, saltadas = [], 0
    for o in oportunidades:
        contacto_id = mapa.get(o.get("contactId"))
        if not contacto_id:
            saltadas += 1
            continue
        estado = o.get("status")
        filas_opp.append({
            "contacto_id": contacto_id,
            "ghl_opportunity_id": o.get("id"),
            "titulo": o.get("name"),
            "estado": estado,
            "monto": o.get("monetaryValue"),
            "pipeline_stage_id": o.get("pipelineStageId"),
            "fecha_creacion_ghl": o.get("createdAt"),
            "fecha_actualizacion_ghl": o.get("updatedAt"),
            "fecha_cierre": o.get("lastStatusChangeAt") if estado in ("won", "lost") else None,
            "sync_estado": "sincronizado",
            "sync_actualizado_en": ahora,
            "origen_ultimo_cambio": "ghl",
        })
    sb.upsert_oportunidades(token, filas_opp)
    log(f"Supabase: {len(filas_contacto)} contactos, {len(stubs)} stubs, {len(filas_opp)} oportunidades "
        f"cargadas ({saltadas} oportunidades sin contacto, salteadas).")


def contactos_previos(token, log):
    """CONTACTS anteriores para preservar los campos de conversacion: primero
    los HTML publicados (base historica), encima la ultima corrida OK."""
    previos = {}
    for url in config.INFORME_HTML_BASE_URLS:
        try:
            html = requests.get(url, timeout=60).text
            m = re.search(r'<script id="contacts-data" type="application/json">', html)
            if m:
                fin = html.find("</script>", m.end())
                for c in json.loads(html[m.end():fin]):
                    previos[c.get("contact_id")] = c
        except Exception as e:  # una base historica que falla no frena la corrida
            log(f"AVISO: no se pudo leer {url}: {e}")
    for c in sb.contactos_ultima_corrida_ok(token):
        previos[c.get("contact_id")] = c
    return list(previos.values())


def ejecutar(corrida_id, token, desde, hasta):
    lineas = []

    def log(msg):
        logger.info(msg)
        lineas.append(f"{datetime.now(ZoneInfo(config.ZONA_HORARIA)).strftime('%H:%M:%S')} {msg}")

    def paso(nombre):
        log(f"== {nombre}")
        sb.actualizar_corrida(token, corrida_id, {"paso": nombre})

    try:
        inicio, fin_excl = limites_del_rango(desde, hasta)
        log(f"Rango: {desde} a {hasta} ({config.ZONA_HORARIA}).")

        paso("Descargando contactos de GHL")
        contactos = ghl.traer_contactos(inicio, fin_excl, log)

        paso("Descargando oportunidades de GHL")
        oportunidades = ghl.traer_oportunidades(inicio, fin_excl, log)

        paso("Consultando NetSuite")
        ventas_df = netsuite.traer_oportunidades(desde, hasta, log)

        # Contactos de las oportunidades de NetSuite que no vinieron en la descarga
        # por rango (contacto creado antes y sin movimiento en GHL en el rango):
        # se traen por ID para tener su origen, sus oportunidades y conversaciones.
        paso("Completando datos de GHL de las oportunidades de NetSuite")
        ids_ns = {str(x) for x in ventas_df.get("ID CLIENTE CRM", []) if x is not None and str(x).strip() and str(x) != "nan"}
        ids_faltantes = sorted(ids_ns - {c.get("id") for c in contactos})
        if ids_faltantes:
            contactos = contactos + ghl.traer_contactos_por_id(ids_faltantes, log)
            ids_con_opp = {o.get("contactId") for o in oportunidades}
            extra = ghl.traer_oportunidades_por_contacto([i for i in ids_faltantes if i not in ids_con_opp], log)
            vistas = {o.get("id") for o in oportunidades}
            oportunidades = oportunidades + [o for o in extra if o.get("id") not in vistas]

        paso("Cargando contactos y oportunidades en la base")
        advertencias = []
        try:
            cargar_en_supabase(token, contactos, oportunidades, log)
        except Exception as e:
            # No frena el informe (que se calcula con los datos en memoria),
            # pero queda registrado: suele ser falta de permiso "editar" en
            # integracion-ghl-ns para el usuario que apreto el boton.
            advertencias.append(f"No se pudo actualizar contacto/oportunidad en la base: {e}")
            log(f"AVISO: {advertencias[-1]}")

        paso("Calculando el informe")
        ahora = datetime.now(ZoneInfo(config.ZONA_HORARIA))
        datos_hasta = min(ahora, fin_excl - timedelta(seconds=1))
        resultado = resumen_ejecutivo.generar(
            contactos=contactos,
            oportunidades=oportunidades,
            ventas_df=ventas_df,
            old_contacts=contactos_previos(token, log),
            periodo_inicio=inicio,
            periodo_fin=fin_excl - timedelta(seconds=1),
            rango_label=f"{desde.strftime('%d/%m/%Y')} al {hasta.strftime('%d/%m/%Y')}",
            fecha_actualizacion=ahora.strftime("%d/%m/%Y %H:%M"),
        )
        stats = dict(resultado["stats"], advertencias=advertencias, netsuite_filas=len(ventas_df))
        log(f"Listo: {json.dumps(stats, ensure_ascii=False)}")

        sb.actualizar_corrida(token, corrida_id, {
            "estado": "ok",
            "paso": "Terminada",
            "mensaje": "; ".join(advertencias) or None,
            "datos_hasta": datos_hasta.isoformat(),
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
            "stats": stats,
            "panel_resumen_html": resultado["panel_html"],
            "contacts": resultado["contacts"],
            "log": "\n".join(lineas),
        })
        try:
            borradas = sb.borrar_corridas_viejas(token, config.CORRIDAS_A_CONSERVAR)
            if borradas:
                logger.info("Historial: se borraron %s corridas viejas", borradas)
        except Exception:
            # No es grave: la corrida ya quedo OK. Suele ser que falta la migracion 18.
            logger.warning("No se pudo limpiar el historial de corridas", exc_info=True)
    except Exception as e:
        logger.exception("Fallo la corrida %s", corrida_id)
        log(f"ERROR: {e}")
        try:
            sb.actualizar_corrida(token, corrida_id, {
                "estado": "error",
                "mensaje": str(e)[:1000],
                "finalizado_en": datetime.now(timezone.utc).isoformat(),
                "log": "\n".join(lineas),
            })
        except Exception:
            logger.exception("Tampoco se pudo registrar el error de la corrida %s", corrida_id)

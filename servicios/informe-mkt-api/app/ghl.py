# app/ghl.py — Descarga de contactos y oportunidades de GHL por rango de fechas.
#
# Port de Desarrollo/API_contactos_por_fecha.py y API_oportunidades_por_fecha.py
# (mismos endpoints, mismas versiones de API y mismo criterio de filtro):
#   - contactos: por fecha de alta (dateAdded), GET /contacts/ ordenado desc,
#     corta cuando una pagina entera queda antes de "desde".
#   - oportunidades: por "Actualizado el" (updatedAt), GET /opportunities/search
#     con status=all; se recorre la cuenta entera porque la paginacion es por
#     fecha de creacion y no por actualizacion.
# Diferencia con los scripts: si una pagina falla, se corta con error en vez
# de seguir con datos parciales (un informe a medias es peor que ninguno).

import time
from datetime import datetime

import requests

from app import config

BASE_URL = "https://services.leadconnectorhq.com"
LIMITE_POR_PAGINA = 100
PAUSA_ENTRE_LLAMADAS = 0.25
MAX_REINTENTOS = 3
MAX_PAGINAS_CONTACTOS = 500
MAX_PAGINAS_OPORTUNIDADES = 1000


def _headers(version):
    return {
        "Authorization": f"Bearer {config.GHL_API_TOKEN}",
        "Version": version,
        "Accept": "application/json",
    }


def _parse(valor):
    if not valor:
        return None
    try:
        return datetime.fromisoformat(valor.replace("Z", "+00:00"))
    except ValueError:
        return None


def _get(url, version, params, log):
    for intento in range(1, MAX_REINTENTOS + 1):
        try:
            resp = requests.get(url, headers=_headers(version), params=params, timeout=30)
        except requests.exceptions.RequestException as error:
            log(f"  GHL error de red (intento {intento}/{MAX_REINTENTOS}): {error}")
            time.sleep(1)
            continue
        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429:
            log("  GHL rate limit (429), espero 2s y reintento...")
            time.sleep(2)
            continue
        raise RuntimeError(f"GHL respondio {resp.status_code} en {url}: {resp.text[:300]}")
    raise RuntimeError(f"GHL sin respuesta tras {MAX_REINTENTOS} reintentos en {url}")


def traer_contactos(desde, hasta_excl, log):
    """Contactos con dateAdded en [desde, hasta_excl). Fechas con zona horaria."""
    if not config.GHL_API_TOKEN or not config.GHL_LOCATION_ID:
        raise RuntimeError("Faltan GHL_API_TOKEN / GHL_LOCATION_ID en la configuracion del servicio.")

    en_rango, vistos = [], 0
    start_after_id = start_after = None
    for pagina in range(1, MAX_PAGINAS_CONTACTOS + 1):
        params = {"locationId": config.GHL_LOCATION_ID, "limit": LIMITE_POR_PAGINA}
        if start_after_id:
            params["startAfterId"] = start_after_id
        if start_after:
            params["startAfter"] = start_after
        contactos = _get(f"{BASE_URL}/contacts/", "2023-02-21", params, log).get("contacts", [])
        if not contactos:
            break

        vistos += len(contactos)
        pagina_vieja = True
        for c in contactos:
            fecha = _parse(c.get("dateAdded"))
            if fecha is None:
                continue
            if desde <= fecha < hasta_excl:
                c["contactId"] = c.get("id")
                en_rango.append(c)
            if fecha >= desde:
                pagina_vieja = False

        if pagina_vieja or len(contactos) < LIMITE_POR_PAGINA:
            break

        ultimo = contactos[-1]
        start_after_id = ultimo.get("id")
        fecha_ultimo = _parse(ultimo.get("dateAdded"))
        # GHL exige startAfter en epoch-milisegundos (numero), no ISO.
        start_after = int(fecha_ultimo.timestamp() * 1000) if fecha_ultimo else None
        time.sleep(PAUSA_ENTRE_LLAMADAS)
    else:
        log(f"ADVERTENCIA: se llego al freno de {MAX_PAGINAS_CONTACTOS} paginas de contactos.")

    log(f"GHL contactos: {len(en_rango)} con alta en el rango ({vistos} revisados).")
    return en_rango


def traer_oportunidades(desde, hasta_excl, log):
    """Oportunidades (todos los estados) con updatedAt en [desde, hasta_excl)."""
    en_rango, vistos = [], 0
    start_after_id = start_after = None
    for pagina in range(1, MAX_PAGINAS_OPORTUNIDADES + 1):
        params = {
            "locationId": config.GHL_LOCATION_ID,
            "status": "all",
            "order": "added_desc",
            "limit": LIMITE_POR_PAGINA,
        }
        if start_after_id:
            params["startAfterId"] = start_after_id
        if start_after:
            params["startAfter"] = start_after
        oportunidades = _get(f"{BASE_URL}/opportunities/search", "v3", params, log).get("opportunities", [])
        if not oportunidades:
            break

        vistos += len(oportunidades)
        for op in oportunidades:
            fecha_act = _parse(op.get("updatedAt"))
            if fecha_act is not None and desde <= fecha_act < hasta_excl:
                en_rango.append(op)

        if len(oportunidades) < LIMITE_POR_PAGINA:
            break

        ultimo = oportunidades[-1]
        start_after_id = ultimo.get("id")
        fecha_creacion = _parse(ultimo.get("createdAt"))
        start_after = int(fecha_creacion.timestamp() * 1000) if fecha_creacion else None
        time.sleep(PAUSA_ENTRE_LLAMADAS)
    else:
        raise RuntimeError(
            f"Se llego al freno de {MAX_PAGINAS_OPORTUNIDADES} paginas de oportunidades sin "
            "terminar de recorrer la cuenta: los numeros serian un piso, no el total."
        )

    log(f"GHL oportunidades: {len(en_rango)} actualizadas en el rango ({vistos} revisadas).")
    return en_rango


def traer_contactos_por_id(ids, log):
    """GET /contacts/{id} para contactos que no vinieron en el rango (contacto
    creado antes, pero con oportunidad en NetSuite en el rango)."""
    contactos = []
    for cid in ids:
        try:
            data = _get(f"{BASE_URL}/contacts/{cid}", "2021-07-28", None, log)
        except RuntimeError as e:
            log(f"  GHL contacto {cid}: no se pudo traer ({str(e)[:120]})")
            continue
        c = data.get("contact") or {}
        if c:
            c["contactId"] = c.get("id")
            contactos.append(c)
        time.sleep(PAUSA_ENTRE_LLAMADAS)
    log(f"GHL contactos por ID (oportunidades NetSuite fuera del rango de GHL): {len(contactos)} de {len(ids)}.")
    return contactos


def traer_oportunidades_por_contacto(ids, log):
    """Oportunidades de GHL (todos los estados) de una lista de contactos."""
    oportunidades = []
    for cid in ids:
        try:
            data = _get(f"{BASE_URL}/opportunities/search", "v3",
                        {"locationId": config.GHL_LOCATION_ID, "contactId": cid, "status": "all", "limit": 100}, log)
        except RuntimeError as e:
            log(f"  GHL oportunidades de {cid}: no se pudieron traer ({str(e)[:120]})")
            continue
        oportunidades.extend(data.get("opportunities", []))
        time.sleep(PAUSA_ENTRE_LLAMADAS)
    log(f"GHL oportunidades de esos contactos: {len(oportunidades)}.")
    return oportunidades

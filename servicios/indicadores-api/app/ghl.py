# app/ghl.py — Lecturas de GHL para Indicadores por Area.
#
# Contactos: GHL_API_TOKEN (mismo que informe-mkt-api, scope contacts.readonly).
# Objetos personalizados (encuestas): GHL_OBJETOS_API_TOKEN, de la integracion
# con scope objects/record.readonly (+ objects/schema.readonly para encontrar
# el objeto por nombre si no se configura GHL_OBJETO_ENCUESTAS).

import time

import requests

from app import config

BASE_URL = "https://services.leadconnectorhq.com"
VERSION = "2021-07-28"
LIMITE_POR_PAGINA = 100
PAUSA_ENTRE_LLAMADAS = 0.25
MAX_REINTENTOS = 3
MAX_PAGINAS = 200


def _headers(token=None):
    token = token or config.GHL_API_TOKEN
    if not token or not config.GHL_LOCATION_ID:
        raise RuntimeError("Faltan GHL_API_TOKEN / GHL_LOCATION_ID en la configuracion del servicio.")
    return {
        "Authorization": f"Bearer {token}",
        "Version": VERSION,
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


def _pedir(metodo, url, log, token=None, **kwargs):
    for intento in range(1, MAX_REINTENTOS + 1):
        try:
            resp = requests.request(metodo, url, headers=_headers(token), timeout=30, **kwargs)
        except requests.exceptions.RequestException as error:
            log(f"  GHL error de red (intento {intento}/{MAX_REINTENTOS}): {error}")
            time.sleep(1)
            continue
        if resp.status_code == 429:
            log("  GHL rate limit (429), espero 2s y reintento...")
            time.sleep(2)
            continue
        return resp
    raise RuntimeError(f"GHL sin respuesta tras {MAX_REINTENTOS} reintentos en {url}")


def _ok(resp, que):
    if resp.status_code not in (200, 201):
        raise RuntimeError(f"GHL {que}: {resp.status_code} {resp.text[:300]}")
    return resp.json()


# ---------- Contactos por etiqueta ----------

def contactos_con_tag(tag, log):
    """Contactos que tienen la etiqueta `tag` (POST /contacts/search).
    Prueba los operadores 'contains' y 'eq' (segun la cuenta acepta uno u otro)."""
    ultimo_error = None
    for operador in ("contains", "eq"):
        contactos, pagina = [], 1
        try:
            while pagina <= MAX_PAGINAS:
                resp = _pedir("POST", f"{BASE_URL}/contacts/search", log, json={
                    "locationId": config.GHL_LOCATION_ID,
                    "page": pagina,
                    "pageLimit": LIMITE_POR_PAGINA,
                    "filters": [{"field": "tags", "operator": operador, "value": tag}],
                })
                if resp.status_code in (400, 422) and pagina == 1:
                    raise ValueError(resp.text[:300])
                lote = _ok(resp, f"buscar contactos con etiqueta {tag}").get("contacts", [])
                contactos.extend(lote)
                if len(lote) < LIMITE_POR_PAGINA:
                    return contactos
                pagina += 1
                time.sleep(PAUSA_ENTRE_LLAMADAS)
            raise RuntimeError(f"Se llego al freno de {MAX_PAGINAS} paginas buscando la etiqueta {tag}.")
        except ValueError as e:
            ultimo_error = e
            continue
    raise RuntimeError(f"GHL no acepto el filtro por etiqueta {tag}: {ultimo_error}")


# ---------- Objetos personalizados ----------

def clave_objeto(nombre_parcial, log):
    """Clave del objeto personalizado (ej. 'custom_objects.encuestas'). Usa
    GHL_OBJETO_ENCUESTAS si esta configurada; si no, la busca por nombre."""
    if config.GHL_OBJETO_ENCUESTAS:
        return config.GHL_OBJETO_ENCUESTAS
    data = _ok(_pedir("GET", f"{BASE_URL}/objects/", log, token=config.GHL_OBJETOS_API_TOKEN,
                      params={"locationId": config.GHL_LOCATION_ID}), "listar objetos")
    objetos = data.get("objects") or data.get("schemas") or []
    candidatos = []
    for o in objetos:
        etiquetas = o.get("labels") or {}
        texto = " ".join(str(x) for x in (o.get("key"), etiquetas.get("singular"), etiquetas.get("plural"), o.get("name")) if x)
        if nombre_parcial in texto.lower():
            candidatos.append(o.get("key"))
    if not candidatos:
        disponibles = ", ".join(str(o.get("key")) for o in objetos) or "ninguno"
        raise RuntimeError(f"No se encontro un objeto de GHL que contenga '{nombre_parcial}'. "
                           f"Objetos disponibles: {disponibles}. Configurar GHL_OBJETO_ENCUESTAS.")
    if len(candidatos) > 1:
        log(f"AVISO: varios objetos de GHL contienen '{nombre_parcial}' ({', '.join(candidatos)}); se usa {candidatos[0]}. "
            "Para fijarlo, configurar GHL_OBJETO_ENCUESTAS.")
    return candidatos[0]


def registros_objeto(clave, log):
    """Todos los registros de un objeto personalizado. Devuelve dicts con
    id, createdAt, updatedAt y properties (claves sin el prefijo del objeto)."""
    registros, pagina = [], 1
    while pagina <= MAX_PAGINAS:
        data = _ok(_pedir("POST", f"{BASE_URL}/objects/{clave}/records/search", log,
                          token=config.GHL_OBJETOS_API_TOKEN, json={
                              "locationId": config.GHL_LOCATION_ID,
                              "page": pagina,
                              "pageLimit": LIMITE_POR_PAGINA,
                          }), f"leer registros de {clave}")
        lote = data.get("records", [])
        for r in lote:
            props = r.get("properties") or {}
            r["properties"] = {str(k).split(".")[-1]: v for k, v in props.items()}
        registros.extend(lote)
        if len(lote) < LIMITE_POR_PAGINA:
            return registros
        pagina += 1
        time.sleep(PAUSA_ENTRE_LLAMADAS)
    raise RuntimeError(f"Se llego al freno de {MAX_PAGINAS} paginas leyendo {clave}.")

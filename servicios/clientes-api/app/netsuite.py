# app/netsuite.py — Conexion a NetSuite por SuiteQL (API REST, token M2M).
#
# Mismo mecanismo que informe-mkt-api/app/netsuite.py: OAuth 2.0 Client
# Credentials con certificado (integracion "SP Servicios internos M2M", rol
# SP WEB SERVICE INTEGRATION). Los RESTlets de la cuenta rechazan el token M2M,
# por eso las busquedas guardadas se replican como consultas SuiteQL en cada
# modulo de area (app/areas/*.py).

import re
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor

import jwt
import requests

from app import config

TAMANO_PAGINA = 1000

_token_cache = {"access_token": None, "expires_at": 0}
_token_lock = threading.Lock()

# Consultas SuiteQL simultaneas. Un semaforo comun a todo el proceso limita las
# llamadas a NetSuite aunque haya varias corridas a la vez o consultas anidadas
# (por ejemplo la clasificacion dentro de la consulta de casos). La cuenta tiene
# un limite de concurrencia que comparte con otras integraciones (RESTlets de
# Power BI, informe-mkt-api): no subir mucho NETSUITE_CONCURRENCIA.
_semaforo = threading.BoundedSemaphore(max(1, config.NETSUITE_CONCURRENCIA))

# Reintentos cuando NetSuite rechaza por exceso de pedidos o falla la conexion.
REINTENTOS = 5
ESPERA_BASE_SEG = 2
_ERRORES_REINTENTABLES = ("CONCURRENCY_LIMIT_EXCEEDED", "SSS_REQUEST_LIMIT_EXCEEDED", "REQUEST_LIMIT_EXCEEDED")


def _host_cuenta():
    # NetSuite usa la cuenta en minusculas y con "-" en vez de "_" en los dominios.
    return config.NETSUITE_ACCOUNT_ID.lower().replace("_", "-")


def _token_url():
    return f"https://{_host_cuenta()}.suitetalk.api.netsuite.com/services/rest/auth/oauth2/v1/token"


def _suiteql_url():
    return f"https://{_host_cuenta()}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql"


def _normalizar_pem(texto):
    """Reconstruye la clave PEM aunque llegue deformada desde una variable de
    entorno (comillas, "\\n" literales, una sola linea, espacios)."""
    texto = texto.strip().strip('"').strip("'").replace("\\n", "\n").replace("\r", "")
    m = re.search(r"-----BEGIN ([A-Z ]+)-----(.*?)-----END \1-----", texto, re.S)
    if not m:
        raise RuntimeError("NETSUITE_PRIVATE_KEY no tiene el formato -----BEGIN ... PRIVATE KEY----- / -----END ...-----.")
    tipo, cuerpo = m.group(1), re.sub(r"[^A-Za-z0-9+/=]", "", m.group(2))
    lineas = [cuerpo[i:i + 64] for i in range(0, len(cuerpo), 64)]
    return f"-----BEGIN {tipo}-----\n" + "\n".join(lineas) + f"\n-----END {tipo}-----\n"


def _clave_privada():
    if config.NETSUITE_PRIVATE_KEY.strip():
        return _normalizar_pem(config.NETSUITE_PRIVATE_KEY)
    if config.NETSUITE_PRIVATE_KEY_PATH:
        with open(config.NETSUITE_PRIVATE_KEY_PATH, encoding="utf-8") as f:
            return f.read()
    raise RuntimeError("Falta NETSUITE_PRIVATE_KEY o NETSUITE_PRIVATE_KEY_PATH.")


def obtener_token():
    # Con consultas en paralelo, un solo hilo pide el token y los demas lo reusan.
    with _token_lock:
        return _obtener_token()


def _obtener_token():
    ahora = time.time()
    if _token_cache["access_token"] and ahora < _token_cache["expires_at"]:
        return _token_cache["access_token"]

    faltan = [n for n in ("NETSUITE_ACCOUNT_ID", "NETSUITE_CLIENT_ID", "NETSUITE_CERT_ID") if not getattr(config, n)]
    if faltan:
        raise RuntimeError(f"Falta configurar: {', '.join(faltan)}.")

    iat = int(ahora)
    assertion = jwt.encode(
        {
            "iss": config.NETSUITE_CLIENT_ID,
            "scope": ["rest_webservices"],
            "aud": _token_url(),
            "iat": iat,
            "exp": iat + 3000,  # NetSuite acepta como maximo 60 min
            "jti": str(uuid.uuid4()),
        },
        _clave_privada(),
        algorithm="PS256",
        headers={"kid": config.NETSUITE_CERT_ID, "typ": "JWT"},
    )
    resp = requests.post(
        _token_url(),
        data={
            "grant_type": "client_credentials",
            "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
            "client_assertion": assertion,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"NetSuite no entrego token ({resp.status_code}): {resp.text[:300]}")
    data = resp.json()
    _token_cache["access_token"] = data["access_token"]
    _token_cache["expires_at"] = ahora + int(data.get("expires_in", 3600)) - 60
    return _token_cache["access_token"]


def _pagina(consulta, offset):
    """Una pagina de SuiteQL (dentro del semaforo, con reintentos)."""
    for intento in range(REINTENTOS + 1):
        try:
            with _semaforo:
                resp = requests.post(
                    _suiteql_url(),
                    headers={
                        "Authorization": f"Bearer {obtener_token()}",
                        "Content-Type": "application/json",
                        "Accept": "application/json",
                        "Prefer": "transient",
                    },
                    params={"limit": TAMANO_PAGINA, "offset": offset},
                    json={"q": consulta},
                    timeout=120,
                )
        except requests.RequestException as e:
            if intento == REINTENTOS:
                raise RuntimeError(f"SuiteQL sin respuesta: {e}") from e
            time.sleep(ESPERA_BASE_SEG * 2 ** intento)
            continue
        if resp.status_code == 200:
            data = resp.json()
            for item in data.get("items", []):
                item.pop("links", None)
            return data
        reintentable = (resp.status_code in (429, 502, 503, 504)
                        or any(e in resp.text for e in _ERRORES_REINTENTABLES))
        if not reintentable or intento == REINTENTOS:
            raise RuntimeError(f"SuiteQL respondio {resp.status_code}: {resp.text[:500]}")
        time.sleep(ESPERA_BASE_SEG * 2 ** intento)


def suiteql(consulta):
    """Ejecuta una consulta SuiteQL y devuelve todas las filas.
    La primera pagina dice cuantas filas hay (totalResults); las demas se piden
    en paralelo. Las consultas deben tener ORDER BY: SuiteQL pagina con offset.
    Ojo: SuiteQL no devuelve las columnas nulas; usar fila.get()."""
    primera = _pagina(consulta, 0)
    filas = list(primera.get("items", []))
    if not primera.get("hasMore"):
        return filas
    total = primera.get("totalResults")
    if not total:
        # Sin el total se sigue pagina por pagina.
        offset = TAMANO_PAGINA
        while True:
            data = _pagina(consulta, offset)
            filas.extend(data.get("items", []))
            if not data.get("hasMore"):
                return filas
            offset += TAMANO_PAGINA
    offsets = list(range(TAMANO_PAGINA, int(total), TAMANO_PAGINA))
    for data in _en_paralelo(lambda o: _pagina(consulta, o), offsets):
        filas.extend(data.get("items", []))
    return filas


def _en_paralelo(funcion, valores):
    """funcion(v) para cada valor, en paralelo; resultados en el mismo orden.
    El limite real de llamadas simultaneas lo pone el semaforo."""
    valores = list(valores)
    if len(valores) <= 1:
        return [funcion(v) for v in valores]
    with ThreadPoolExecutor(max_workers=min(len(valores), max(1, config.NETSUITE_CONCURRENCIA))) as ex:
        return list(ex.map(funcion, valores))


def suiteql_varias(consultas):
    """Varias consultas SuiteQL en paralelo (por ejemplo una por lote de ids).
    Devuelve una lista de resultados (lista de filas) en el mismo orden."""
    return _en_paralelo(suiteql, consultas)


def suiteql_unidas(consultas):
    """Como suiteql_varias, pero todas las filas juntas en una sola lista
    (en el orden de las consultas)."""
    return [f for filas in suiteql_varias(consultas) for f in filas]

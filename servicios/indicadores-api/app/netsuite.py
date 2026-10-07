# app/netsuite.py — Conexion a NetSuite por SuiteQL (API REST, token M2M).
#
# Mismo mecanismo que informe-mkt-api/app/netsuite.py: OAuth 2.0 Client
# Credentials con certificado (integracion "SP Servicios internos M2M", rol
# SP WEB SERVICE INTEGRATION). Los RESTlets de la cuenta rechazan el token M2M,
# por eso las busquedas guardadas se replican como consultas SuiteQL en cada
# modulo de area (app/areas/*.py).

import re
import time
import uuid

import jwt
import requests

from app import config

TAMANO_PAGINA = 1000

_token_cache = {"access_token": None, "expires_at": 0}


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


def suiteql(consulta):
    """Ejecuta una consulta SuiteQL y devuelve todas las filas (pagina sola).
    Ojo: SuiteQL no devuelve las columnas nulas; usar fila.get()."""
    filas, offset = [], 0
    while True:
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
        if resp.status_code != 200:
            raise RuntimeError(f"SuiteQL respondio {resp.status_code}: {resp.text[:500]}")
        data = resp.json()
        for item in data.get("items", []):
            item.pop("links", None)
            filas.append(item)
        if not data.get("hasMore"):
            return filas
        offset += TAMANO_PAGINA

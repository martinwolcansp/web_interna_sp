# diagnostico_netsuite.py — Aisla por que el RESTlet responde INVALID_LOGIN_ATTEMPT.
#
# Pide el token M2M con tres formatos distintos de "scope" y, con cada token,
# prueba (a) una consulta SuiteQL minima por REST web services y (b) el RESTlet.
# Asi se distingue si el problema es el token/alcance o algo propio del RESTlet.
# No escribe nada en NetSuite.
#
# Uso (carpeta informe-mkt-api, con el .env completo):
#     python diagnostico_netsuite.py

import base64
import json
import time
import uuid

import jwt
import requests

from app import config, netsuite

TOKEN_URL = netsuite._token_url()
SUITEQL_URL = f"https://{netsuite._host_cuenta()}.suitetalk.api.netsuite.com/services/rest/query/v1/suiteql?limit=1"


def pedir_token(scope):
    iat = int(time.time())
    assertion = jwt.encode(
        {"iss": config.NETSUITE_CLIENT_ID, "scope": scope, "aud": TOKEN_URL,
         "iat": iat, "exp": iat + 3000, "jti": str(uuid.uuid4())},
        netsuite._clave_privada(), algorithm="PS256",
        headers={"kid": config.NETSUITE_CERT_ID, "typ": "JWT"},
    )
    r = requests.post(TOKEN_URL, data={
        "grant_type": "client_credentials",
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": assertion,
    }, timeout=30)
    if r.status_code != 200:
        print(f"   token: ERROR {r.status_code} {r.text[:200]}")
        return None
    tok = r.json()["access_token"]
    try:
        payload = tok.split(".")[1] + "=" * (-len(tok.split(".")[1]) % 4)
        claims = json.loads(base64.urlsafe_b64decode(payload))
        print("   token: OK  claims:", {k: v for k, v in claims.items() if k in ("scope", "aud", "sub", "role", "exp")})
    except Exception:
        print("   token: OK  (no es un JWT legible)")
    return tok


def probar(tok):
    h = {"Authorization": f"Bearer {tok}", "Content-Type": "application/json", "Accept": "application/json"}
    r = requests.post(SUITEQL_URL, headers={**h, "Prefer": "transient"},
                      json={"q": "SELECT id FROM employee"}, timeout=30)
    print(f"   SuiteQL (REST web services): {r.status_code} {r.text[:150]}")
    r = requests.get(config.NETSUITE_RESTLET_URL, headers=h,
                     params={"desde": "2026-09-01", "hasta": "2026-09-02"}, timeout=60)
    print(f"   RESTlet: {r.status_code} {r.text[:300]}")
    # Comparacion: el RESTlet de Power BI (script 2091), mismo rol en la audiencia.
    # Solo se mira si autentica (codigo de respuesta), no se usa lo que devuelve.
    otro = config.NETSUITE_RESTLET_URL.split("?")[0] + "?script=2091&deploy=1"
    try:
        r = requests.get(otro, headers=h, timeout=60, stream=True)
        print(f"   RESTlet Power BI (2091), para comparar: {r.status_code}")
        r.close()
    except requests.exceptions.RequestException as e:
        print(f"   RESTlet Power BI (2091): sin respuesta ({e.__class__.__name__})")


print("Cuenta:", config.NETSUITE_ACCOUNT_ID, "| RESTlet:", config.NETSUITE_RESTLET_URL)
for scope in (["restlets", "rest_webservices"],):
    print(f"\n== scope = {scope!r}")
    tok = pedir_token(scope)
    if tok:
        probar(tok)

# app/supabase_rest.py — Acceso a Supabase (PostgREST) de la web interna.
#
# Mismo criterio que indicadores-api: NO se usa service_role. Todo va con la
# anon key + el access token del usuario que aprieta el boton, asi las
# politicas RLS deciden:
#   cli_corrida                       ver/editar segun clientes-<informe>
#   cli_cliente, cli_establecimiento  ver/editar segun clientes-segmentacion
#   cli_baja                          ver/editar segun clientes-bajas

import math
from datetime import datetime, timedelta, timezone

import requests

from app import config

TAMANO_LOTE = 1000
T_CORRIDA = "cli_corrida"


def _h(token, prefer=None):
    h = {
        "apikey": config.SUPABASE_ANON_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    if prefer:
        h["Prefer"] = prefer
    return h


def _rest(tabla):
    return f"{config.SUPABASE_URL}/rest/v1/{tabla}"


def _check(resp, que):
    if resp.status_code not in (200, 201, 204):
        raise RuntimeError(f"Supabase {que}: {resp.status_code} {resp.text[:300]}")
    return resp


def _sin_nan(valor):
    if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
        return None
    if isinstance(valor, dict):
        return {k: _sin_nan(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_sin_nan(v) for v in valor]
    return valor


def ahora_iso():
    return datetime.now(timezone.utc).isoformat()


# ---------- usuario y permisos ----------

def verificar_usuario(token):
    resp = requests.get(
        f"{config.SUPABASE_URL}/auth/v1/user",
        headers={"apikey": config.SUPABASE_ANON_KEY, "Authorization": f"Bearer {token}"},
        timeout=15,
    )
    return resp.json() if resp.status_code == 200 else None


def tiene_permiso(token, seccion, nivel):
    resp = requests.post(
        _rest("rpc/fn_tiene_permiso"),
        headers=_h(token),
        json={"p_seccion_id": seccion, "p_nivel": nivel},
        timeout=15,
    )
    return resp.status_code == 200 and resp.json() is True


# ---------- corridas (cli_corrida) ----------

def cerrar_corridas_colgadas(token, informe):
    limite = datetime.now(timezone.utc) - timedelta(minutes=config.MINUTOS_CORRIDA_COLGADA)
    requests.patch(
        _rest(T_CORRIDA),
        headers=_h(token, "return=minimal"),
        params={"informe": f"eq.{informe}", "estado": "eq.en_curso", "iniciado_en": f"lt.{limite.isoformat()}"},
        json={
            "estado": "error",
            "mensaje": "La corrida quedo colgada (el servicio se reinicio o no respondio) y se cerro sola.",
            "finalizado_en": ahora_iso(),
        },
        timeout=15,
    )


def corrida_en_curso(token, informe):
    resp = _check(requests.get(
        _rest(T_CORRIDA),
        headers=_h(token),
        params={"select": "id,iniciado_en", "informe": f"eq.{informe}", "estado": "eq.en_curso", "limit": 1},
        timeout=15,
    ), "consultar corrida en curso")
    filas = resp.json()
    return filas[0] if filas else None


def crear_corrida(token, informe, periodo=None, origen="manual"):
    resp = requests.post(
        _rest(T_CORRIDA),
        headers=_h(token, "return=representation"),
        json={"informe": informe, "periodo": periodo, "estado": "en_curso", "paso": "Iniciando", "origen": origen},
        timeout=15,
    )
    if resp.status_code == 409:
        return None  # indice unico: ya hay una en curso para el informe
    return _check(resp, "crear corrida").json()[0]


def actualizar_corrida(token, corrida_id, cambios):
    _check(requests.patch(
        _rest(T_CORRIDA),
        headers=_h(token, "return=minimal"),
        params={"id": f"eq.{corrida_id}"},
        json=_sin_nan(cambios),
        timeout=60,
    ), "actualizar corrida")


def borrar_corridas_viejas(token, informe, conservar):
    resp = _check(requests.get(
        _rest(T_CORRIDA),
        headers=_h(token),
        params={"select": "id", "informe": f"eq.{informe}", "order": "iniciado_en.desc",
                "offset": conservar, "limit": 500},
        timeout=30,
    ), "listar corridas viejas")
    ids = [str(f["id"]) for f in resp.json()]
    if not ids:
        return 0
    _check(requests.delete(
        _rest(T_CORRIDA),
        headers=_h(token, "return=minimal"),
        params={"id": f"in.({','.join(ids)})", "estado": "neq.en_curso"},
        timeout=30,
    ), "borrar corridas viejas")
    return len(ids)


# ---------- datos ----------

def leer_todo(token, tabla, select="*", filtros=None, orden=None):
    """Todas las filas que cumplen los filtros (PostgREST pagina de a 1000)."""
    filas, offset = [], 0
    while True:
        params = dict(filtros or {}, select=select, limit=TAMANO_LOTE, offset=offset)
        if orden:
            params["order"] = orden
        lote = _check(requests.get(_rest(tabla), headers=_h(token), params=params, timeout=60),
                      f"leer {tabla}").json()
        filas.extend(lote)
        if len(lote) < TAMANO_LOTE:
            return filas
        offset += TAMANO_LOTE


def upsert(token, tabla, filas, on_conflict):
    """Upsert por lotes. Si vienen filas repetidas por la clave queda la ultima
    (PostgreSQL rechaza el lote si una clave se repite en el mismo comando).
    Todas las filas de un envio deben tener las mismas columnas."""
    claves = [c.strip() for c in on_conflict.split(",")]
    unicas = {}
    for f in _sin_nan(filas):
        unicas[tuple(f.get(c) for c in claves)] = f
    filas = list(unicas.values())
    for i in range(0, len(filas), TAMANO_LOTE):
        _check(requests.post(
            _rest(tabla),
            headers=_h(token, "resolution=merge-duplicates,return=minimal"),
            params={"on_conflict": on_conflict},
            json=filas[i:i + TAMANO_LOTE],
            timeout=120,
        ), f"upsert {tabla}")


def marcar_no_vistos(token, tabla, corrida_id, filtros=None):
    """vigente = false en las filas que no vinieron en esta corrida. No se
    borran: de cli_cliente pueden colgar otras tablas (FK). filtros: limita a
    una parte de la tabla (ej. {"alcance": "eq.nuevas"} en cli_compra)."""
    _check(requests.patch(
        _rest(tabla),
        headers=_h(token, "return=minimal"),
        params=dict(filtros or {}, vigente="eq.true", **{"or": f"(corrida_id.is.null,corrida_id.neq.{corrida_id})"}),
        json={"vigente": False},
        timeout=120,
    ), f"marcar no vistos en {tabla}")

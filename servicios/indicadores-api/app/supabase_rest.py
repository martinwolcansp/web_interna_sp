# app/supabase_rest.py — Acceso a Supabase (PostgREST) de la web interna.
#
# Mismo criterio que informe-mkt-api: NO se usa service_role. Todo va con la
# anon key + el access token del usuario que aprieta el boton (o del usuario
# tecnico de la tarea programada), asi las politicas RLS deciden:
#   ind_corrida            ver/editar segun la seccion indicadores-<area>
#   ind_<area>_*           ver/editar segun la seccion indicadores-<area>

import math
from datetime import datetime, timedelta, timezone

import requests

from app import config

TAMANO_LOTE = 200


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
    """JSON no admite NaN/Infinity: se guardan como null."""
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

def iniciar_sesion(email, password):
    resp = requests.post(
        f"{config.SUPABASE_URL}/auth/v1/token",
        headers={"apikey": config.SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        params={"grant_type": "password"},
        json={"email": email, "password": password},
        timeout=15,
    )
    _check(resp, "iniciar sesion del usuario tecnico")
    return resp.json()["access_token"]


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


# ---------- corridas (tabla ind_corrida) ----------

def cerrar_corridas_colgadas(token, area):
    limite = datetime.now(timezone.utc) - timedelta(minutes=config.MINUTOS_CORRIDA_COLGADA)
    requests.patch(
        _rest("ind_corrida"),
        headers=_h(token, "return=minimal"),
        params={"area": f"eq.{area}", "estado": "eq.en_curso", "iniciado_en": f"lt.{limite.isoformat()}"},
        json={
            "estado": "error",
            "mensaje": "La corrida quedo colgada (el servicio se reinicio o no respondio) y se cerro sola.",
            "finalizado_en": ahora_iso(),
        },
        timeout=15,
    )


def corrida_en_curso(token, area):
    resp = _check(requests.get(
        _rest("ind_corrida"),
        headers=_h(token),
        params={"select": "id,iniciado_en", "area": f"eq.{area}", "estado": "eq.en_curso", "limit": 1},
        timeout=15,
    ), "consultar corrida en curso")
    filas = resp.json()
    return filas[0] if filas else None


def crear_corrida(token, area, origen="manual"):
    resp = requests.post(
        _rest("ind_corrida"),
        headers=_h(token, "return=representation"),
        json={"area": area, "estado": "en_curso", "paso": "Iniciando", "origen": origen},
        timeout=15,
    )
    if resp.status_code == 409:
        return None  # indice unico: ya hay una en curso para el area
    return _check(resp, "crear corrida").json()[0]


def actualizar_corrida(token, corrida_id, cambios):
    _check(requests.patch(
        _rest("ind_corrida"),
        headers=_h(token, "return=minimal"),
        params={"id": f"eq.{corrida_id}"},
        json=_sin_nan(cambios),
        timeout=60,
    ), "actualizar corrida")


def estado_corrida(token, corrida_id):
    resp = _check(requests.get(
        _rest("ind_corrida"),
        headers=_h(token),
        params={"select": "estado,mensaje", "id": f"eq.{corrida_id}"},
        timeout=15,
    ), "leer estado de la corrida")
    filas = resp.json()
    return filas[0] if filas else None


def borrar_corridas_viejas(token, area, conservar):
    resp = _check(requests.get(
        _rest("ind_corrida"),
        headers=_h(token),
        params={"select": "id", "area": f"eq.{area}", "order": "iniciado_en.desc", "offset": conservar, "limit": 500},
        timeout=30,
    ), "listar corridas viejas")
    ids = [str(f["id"]) for f in resp.json()]
    if not ids:
        return 0
    _check(requests.delete(
        _rest("ind_corrida"),
        headers=_h(token, "return=minimal"),
        params={"id": f"in.({','.join(ids)})", "estado": "neq.en_curso"},
        timeout=30,
    ), "borrar corridas viejas")
    return len(ids)


# ---------- datos de cada area ----------

def upsert(token, tabla, filas, on_conflict):
    filas = _sin_nan(filas)
    for i in range(0, len(filas), TAMANO_LOTE):
        _check(requests.post(
            _rest(tabla),
            headers=_h(token, "resolution=merge-duplicates,return=minimal"),
            params={"on_conflict": on_conflict},
            json=filas[i:i + TAMANO_LOTE],
            timeout=60,
        ), f"upsert {tabla}")


def borrar_no_vistos(token, tabla, corrida_id):
    """Borra las filas que no vinieron en esta corrida (ya no cumplen el
    criterio en NetSuite/GHL: casos reasignados, registros eliminados, etc.)."""
    _check(requests.delete(
        _rest(tabla),
        headers=_h(token, "return=minimal"),
        params={"or": f"(corrida_id.is.null,corrida_id.neq.{corrida_id})"},
        timeout=60,
    ), f"limpiar {tabla}")

# app/supabase_rest.py — Acceso a Supabase (PostgREST) de la web interna.
#
# Mismo criterio que ghl-netsuite-api-opportunities: NO se usa service_role.
# Todo se hace con la anon key + el access token del usuario que apreto el
# boton, asi las politicas RLS deciden:
#   - informe_mkt_corrida: ver/editar segun permiso de la seccion informes-mkt
#   - contacto/oportunidad: editar segun permiso de integracion-ghl-ns

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


# ---------- usuario y permisos ----------

def iniciar_sesion(email, password):
    """Login con email y contrasena (usuario tecnico de la corrida programada).
    Devuelve el access token, que se usa igual que el del usuario que aprieta el boton."""
    resp = requests.post(
        f"{config.SUPABASE_URL}/auth/v1/token",
        headers={"apikey": config.SUPABASE_ANON_KEY, "Content-Type": "application/json"},
        params={"grant_type": "password"},
        json={"email": email, "password": password},
        timeout=15,
    )
    _check(resp, "iniciar sesion del usuario tecnico")
    return resp.json()["access_token"]


def estado_corrida(token, corrida_id):
    resp = _check(requests.get(
        _rest("informe_mkt_corrida"),
        headers=_h(token),
        params={"select": "estado,mensaje", "id": f"eq.{corrida_id}"},
        timeout=15,
    ), "leer estado de la corrida")
    filas = resp.json()
    return filas[0] if filas else None


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


# ---------- corridas del informe ----------

def cerrar_corridas_colgadas(token):
    limite = datetime.now(timezone.utc) - timedelta(minutes=config.MINUTOS_CORRIDA_COLGADA)
    requests.patch(
        _rest("informe_mkt_corrida"),
        headers=_h(token, "return=minimal"),
        params={"estado": "eq.en_curso", "iniciado_en": f"lt.{limite.isoformat()}"},
        json={
            "estado": "error",
            "mensaje": "La corrida quedo colgada (el servicio se reinicio o no respondio) y se cerro sola.",
            "finalizado_en": datetime.now(timezone.utc).isoformat(),
        },
        timeout=15,
    )


def corrida_en_curso(token):
    resp = _check(requests.get(
        _rest("informe_mkt_corrida"),
        headers=_h(token),
        params={"select": "id,desde,hasta,iniciado_en", "estado": "eq.en_curso", "limit": 1},
        timeout=15,
    ), "consultar corrida en curso")
    filas = resp.json()
    return filas[0] if filas else None


def crear_corrida(token, desde, hasta, origen=None, solicitado_por=None):
    fila = {"desde": desde.isoformat(), "hasta": hasta.isoformat(), "estado": "en_curso", "paso": "Iniciando"}
    if origen:  # columna de la migracion 20 (si no viene, la base pone 'manual')
        fila["origen"] = origen
    if solicitado_por:  # columna de la migracion 24
        fila["solicitado_por"] = solicitado_por
    resp = requests.post(
        _rest("informe_mkt_corrida"),
        headers=_h(token, "return=representation"),
        json=fila,
        timeout=15,
    )
    if resp.status_code == 409:
        return None  # indice unico: ya hay una en curso
    return _check(resp, "crear corrida").json()[0]


def _sin_nan(valor):
    """JSON no admite NaN/Infinity: se guardan como null (red de seguridad)."""
    import math
    if isinstance(valor, float) and (math.isnan(valor) or math.isinf(valor)):
        return None
    if isinstance(valor, dict):
        return {k: _sin_nan(v) for k, v in valor.items()}
    if isinstance(valor, (list, tuple)):
        return [_sin_nan(v) for v in valor]
    return valor


def actualizar_corrida(token, corrida_id, cambios):
    cambios = _sin_nan(cambios)
    _check(requests.patch(
        _rest("informe_mkt_corrida"),
        headers=_h(token, "return=minimal"),
        params={"id": f"eq.{corrida_id}"},
        json=cambios,
        timeout=60,
    ), "actualizar corrida")


def contactos_ultima_corrida_ok(token):
    resp = _check(requests.get(
        _rest("informe_mkt_corrida"),
        headers=_h(token),
        params={"select": "contacts", "estado": "eq.ok", "order": "finalizado_en.desc", "limit": 1},
        timeout=60,
    ), "leer ultima corrida")
    filas = resp.json()
    return (filas[0].get("contacts") or []) if filas else []


def borrar_corridas_viejas(token, conservar):
    """Deja solo las ultimas `conservar` corridas (por iniciado_en). Devuelve cuantas borro."""
    resp = _check(requests.get(
        _rest("informe_mkt_corrida"),
        headers=_h(token),
        params={"select": "id", "order": "iniciado_en.desc", "offset": conservar, "limit": 500},
        timeout=30,
    ), "listar corridas viejas")
    ids = [str(f["id"]) for f in resp.json()]
    if not ids:
        return 0
    _check(requests.delete(
        _rest("informe_mkt_corrida"),
        headers=_h(token, "return=minimal"),
        params={"id": f"in.({','.join(ids)})", "estado": "neq.en_curso"},
        timeout=30,
    ), "borrar corridas viejas")
    return len(ids)


# ---------- contacto / oportunidad (equivalente a generar_sql.py) ----------

def _post_lotes(token, tabla, filas, on_conflict, resolucion):
    filas = _sin_nan(filas)
    for i in range(0, len(filas), TAMANO_LOTE):
        _check(requests.post(
            _rest(tabla),
            headers=_h(token, f"resolution={resolucion},return=minimal"),
            params={"on_conflict": on_conflict},
            json=filas[i:i + TAMANO_LOTE],
            timeout=60,
        ), f"upsert {tabla}")


def upsert_contactos(token, filas):
    _post_lotes(token, "contacto", filas, "ghl_contact_id", "merge-duplicates")


def insertar_stubs(token, filas):
    # ignore-duplicates = "on conflict do nothing": nunca pisa un contacto real.
    _post_lotes(token, "contacto", filas, "ghl_contact_id", "ignore-duplicates")


def mapa_ids_contacto(token, ghl_ids):
    mapa = {}
    ids = sorted(set(ghl_ids))
    for i in range(0, len(ids), 100):
        lote = ",".join(f'"{x}"' for x in ids[i:i + 100])
        resp = _check(requests.get(
            _rest("contacto"),
            headers=_h(token),
            params={"select": "id,ghl_contact_id", "ghl_contact_id": f"in.({lote})"},
            timeout=30,
        ), "leer ids de contacto")
        mapa.update({f["ghl_contact_id"]: f["id"] for f in resp.json()})
    return mapa


def upsert_oportunidades(token, filas):
    _post_lotes(token, "oportunidad", filas, "ghl_opportunity_id", "merge-duplicates")


# ---------- datos acumulados del informe (migracion 19) ----------

def upsert(token, tabla, filas, on_conflict):
    _post_lotes(token, tabla, filas, on_conflict, "merge-duplicates")


def borrar(token, tabla, params, que):
    _check(requests.delete(_rest(tabla), headers=_h(token, "return=minimal"), params=params, timeout=60), que)


def leer_todo(token, tabla, params, que, pagina=1000):
    """GET paginado (PostgREST corta en 1000 filas por pedido)."""
    filas, offset = [], 0
    while True:
        p = dict(params, limit=pagina, offset=offset)
        lote = _check(requests.get(_rest(tabla), headers=_h(token), params=p, timeout=60), que).json()
        filas.extend(lote)
        if len(lote) < pagina:
            return filas
        offset += pagina


def leer_por_ids(token, tabla, columna, ids, select, que, tamano=100):
    """GET por una lista de valores (columna=in.(...)) en tandas, para no armar URLs enormes."""
    ids = sorted({str(i) for i in ids if i})
    filas = []
    for i in range(0, len(ids), tamano):
        tanda = ",".join(f'"{x}"' for x in ids[i:i + tamano])
        filas.extend(leer_todo(token, tabla, {"select": select, columna: f"in.({tanda})"}, que))
    return filas


def actualizar(token, tabla, params, cambios, que):
    """PATCH por filtro (ej. marcar dias con visitas cargadas)."""
    _check(requests.patch(_rest(tabla), headers=_h(token, "return=minimal"), params=params,
                          json=_sin_nan(cambios), timeout=60), que)


# ---------- comisiones (migracion 28) ----------

def leer_unidades_comision(token):
    """Unidades de comision (comision_unidad, migracion 29). None si la tabla
    todavia no existe: el calculo usa cada abono incluido como unidad propia."""
    resp = requests.get(_rest("comision_unidad"), headers=_h(token),
                        params={"select": "id,nombre,incluido_desde,comisiona", "order": "nombre"}, timeout=30)
    if resp.status_code >= 400 and "comision_unidad.comisiona" in resp.text:
        # falta la migracion 30: todas las unidades comisionan
        resp = requests.get(_rest("comision_unidad"), headers=_h(token),
                            params={"select": "id,nombre,incluido_desde", "order": "nombre"}, timeout=30)
    if resp.status_code == 404 or (resp.status_code >= 400 and "comision_unidad" in resp.text):
        return None
    return _check(resp, "leer unidades de comision (migracion 29)").json()


def leer_abonos_comision(token):
    """Configuracion de abonos con unidad (si existe la migracion 29)."""
    resp = requests.get(_rest("comision_abono"), headers=_h(token),
                        params={"select": "codigo,nombre,nombre_mostrar,incluido,incluido_desde,unidad_id", "order": "codigo"},
                        timeout=30)
    if resp.status_code >= 400 and "unidad_id" in resp.text:
        return leer_todo(token, "comision_abono",
                         {"select": "codigo,nombre,nombre_mostrar,incluido,incluido_desde", "order": "codigo"},
                         "leer configuracion de abonos (migracion 28)")
    return _check(resp, "leer configuracion de abonos").json()


def guardar_liquidacion_comision(token, payload):
    """fn_comision_guardar_liquidacion: guarda la liquidacion entera en una
    transaccion. Devuelve el id; si ya existe la del mes, RuntimeError con el
    mensaje de la base."""
    resp = requests.post(_rest("rpc/fn_comision_guardar_liquidacion"), headers=_h(token),
                         json={"p": _sin_nan(payload)}, timeout=120)
    if resp.status_code not in (200, 201):
        try:
            mensaje = resp.json().get("message") or resp.text
        except ValueError:
            mensaje = resp.text
        raise RuntimeError(mensaje[:500])
    return resp.json()

# app/informes/segmentacion.py — Base completa de clientes de NetSuite.
#
# Trae todos los registros "customer" que cumplen CRITERIO_CLIENTES (por
# defecto, etapa Cliente: activos e inactivos) y los separa en:
#   cli_cliente          registros sin parent (cliente principal, C00404)
#   cli_establecimiento  subclientes (C00404-1), con el cliente principal
#                        resuelto hasta el registro raiz. Si un cliente
#                        principal tiene cuenta ByKom en su propio registro
#                        (modelo viejo, sin subcliente), tambien se carga
#                        como establecimiento de si mismo.
#
# Si el parent de un establecimiento no cumple el criterio (ej. matriz en otra
# etapa) se trae igual por id, para que el establecimiento tenga su cliente.
#
# Lo que no viene en una corrida no se borra: queda vigente = false.

from app import config, consulta
from app import supabase_rest as sb
from app.comun import ahora, booleano, entero, es_activo, fecha_hora, texto

SECCION = "clientes-segmentacion"
USA_PERIODO = False

T_CLIENTE = "cli_cliente"
T_ESTABLECIMIENTO = "cli_establecimiento"
NIVELES_PADRE = 3


def _calle(calle, nro):
    """'488', '2721' -> 'Calle 488 N° 2721' (en La Plata las calles son numeros)."""
    if not calle:
        return None
    base = f"Calle {calle}" if calle.isdigit() else calle
    return f"{base} N° {nro}" if nro else base


def _direccion(f):
    """Direccion de servicio (campos 3K) si esta cargada; si no, la de facturacion."""
    calle = _calle(texto(f.get("serv_calle")), texto(f.get("serv_nro")))
    if calle:
        return {
            "direccion": calle,
            "localidad": texto(f.get("serv_barrio")),
            "provincia": texto(f.get("serv_provincia")),
            "cp": texto(f.get("serv_cp")),
        }
    return {
        "direccion": texto(f.get("direccion")),
        "localidad": texto(f.get("localidad")),
        "provincia": texto(f.get("provincia")),
        "cp": texto(f.get("cp")),
    }


def _nombre(f):
    return texto(f.get("empresa")) or texto(f.get("nombre")) or texto(f.get("entity_id"))


def fila_cliente(f, corrida_id, ts):
    return dict({
        "ns_id": int(f["ns_id"]),
        "entity_id": texto(f.get("entity_id")),
        "nombre": _nombre(f),
        "es_persona": booleano(f.get("es_persona")),
        "ghl_contact_id": texto(f.get("ghl_contact_id")),
        "telefono": texto(f.get("telefono")),
        "telefono_movil": texto(f.get("telefono_movil")),
        "email": texto(f.get("email")),
        "fecha_creacion": texto(f.get("fecha_creacion")),
        "estado_ns": texto(f.get("estado_ns")),
        "inactivo": booleano(f.get("inactivo")),
        "vigente": True,
        "corrida_id": corrida_id,
        "actualizado_en": ts,
    }, **_direccion(f))


def fila_establecimiento(f, cliente_ns_id, corrida_id, ts):
    inactivo = booleano(f.get("inactivo"))
    estado = texto(f.get("estado_servicio"))
    fs = fecha_hora(f.get("fecha_suspension"))
    return dict({
        "ns_id": int(f["ns_id"]),
        "cliente_ns_id": cliente_ns_id,
        "parent_ns_id": entero(f.get("parent_ns_id")),
        "entity_id": texto(f.get("entity_id")),
        "nombre": texto(f.get("nombre_establecimiento")) or _nombre(f),
        "nro_cuenta": texto(f.get("nro_cuenta")),
        "id_bykom": texto(f.get("id_bykom")),
        "fecha_activacion": texto(f.get("fecha_activacion")),
        "tipo_monitoreo": texto(f.get("tipo_monitoreo")),
        "tipo_cliente": texto(f.get("tipo_cliente")),
        "estado_servicio": estado,
        "activo": es_activo(estado, inactivo),
        "fecha_suspension": fs.isoformat() if fs else None,
        "motivo_baja": texto(f.get("motivo_baja")),
        "telefono": texto(f.get("telefono")),
        "email": texto(f.get("email")),
        "fecha_creacion": texto(f.get("fecha_creacion")),
        "inactivo": inactivo,
        "vigente": True,
        "corrida_id": corrida_id,
        "actualizado_en": ts,
    }, **_direccion(f))


def separar(por_id, corrida_id, ts):
    """Registros de NetSuite (por id) -> (filas cli_cliente, filas cli_establecimiento)."""
    def raiz(i):
        vistos = set()
        while True:
            p = entero(por_id[i].get("parent_ns_id"))
            if not p or p not in por_id or p in vistos:
                return i
            vistos.add(i)
            i = p

    clientes, establecimientos = [], []
    for i, f in por_id.items():
        r = raiz(i)
        if r == i:
            clientes.append(fila_cliente(f, corrida_id, ts))
            if texto(f.get("nro_cuenta")):
                establecimientos.append(fila_establecimiento(f, i, corrida_id, ts))
        else:
            establecimientos.append(fila_establecimiento(f, r, corrida_id, ts))

    # Cliente sin direccion propia: la de su primer establecimiento con direccion
    # (los clientes principales casi nunca tienen cargada la direccion de servicio).
    por_cliente = {}
    for e in sorted(establecimientos, key=lambda e: (not e["activo"], e["ns_id"])):
        if e["direccion"]:
            por_cliente.setdefault(e["cliente_ns_id"], e)
    for c in clientes:
        e = por_cliente.get(c["ns_id"])
        if not c["direccion"] and e:
            c.update({k: e[k] for k in ("direccion", "localidad", "provincia", "cp")})
    return clientes, establecimientos


def traer(log, paso):
    """Consulta NetSuite. Devuelve (registros por id, grupos de campos, avisos)."""
    paso("Verificando campos de NetSuite")
    grupos, avisos = consulta.grupos_validos(log)
    paso("Consultando clientes en NetSuite")
    filas = consulta.consultar(grupos, config.CRITERIO_CLIENTES)
    log(f"{len(filas)} registros de clientes ({config.CRITERIO_CLIENTES})")
    por_id = {int(f["ns_id"]): f for f in filas}
    for _ in range(NIVELES_PADRE):
        faltan = {entero(f.get("parent_ns_id")) for f in por_id.values() if f.get("parent_ns_id")} - set(por_id)
        faltan.discard(None)
        if not faltan:
            break
        paso("Consultando clientes principales")
        extra = consulta.por_ids(grupos, faltan)
        log(f"{len(extra)} clientes principales fuera del criterio, traidos por id")
        for f in extra:
            por_id[int(f["ns_id"])] = f
    return por_id, avisos


def actualizar(token, corrida_id, log, paso, periodo=None):
    por_id, avisos = traer(log, paso)
    ts = ahora().isoformat()
    clientes, establecimientos = separar(por_id, corrida_id, ts)

    paso("Guardando clientes")
    sb.upsert(token, T_CLIENTE, clientes, "ns_id")
    paso("Guardando establecimientos")
    sb.upsert(token, T_ESTABLECIMIENTO, establecimientos, "ns_id")
    paso("Marcando registros que ya no vienen")
    sb.marcar_no_vistos(token, T_ESTABLECIMIENTO, corrida_id)
    sb.marcar_no_vistos(token, T_CLIENTE, corrida_id)

    activos = sum(1 for e in establecimientos if e["activo"] is True)
    sin_estado = sum(1 for e in establecimientos if e["activo"] is None)
    if establecimientos and sin_estado == len(establecimientos):
        avisos.append("Ningun establecimiento trajo estado de servicio: revisar CAMPO_ESTADO_SERVICIO")
    stats = {
        "clientes": len(clientes),
        "establecimientos": len(establecimientos),
        "activos": activos,
        "inactivos": len(establecimientos) - activos - sin_estado,
        "sin_estado": sin_estado,
    }
    return stats, avisos

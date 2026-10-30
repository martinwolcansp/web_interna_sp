# app/campos.py — Columnas de NetSuite que lee el servicio.
#
# Tabla customer (c). Un establecimiento es un subcliente (C00404-1) cuyo
# parent es el cliente principal (C00404); puede haber un nivel mas
# (p2), igual que en informe-mkt-api/app/netsuite.py.
#
# BASE: campos estandar o ya usados por otros servicios (existen seguro).
# OPCIONALES: si NetSuite rechaza uno (el rol no lo puede leer o el id esta
# mal), la corrida sigue sin ese campo y lo deja como aviso. Los campos
# personalizados de bajas salen de config (CAMPO_*), porque sus ids se
# confirman con diagnostico_clientes.py.

from app import config

# alias -> expresion SuiteQL
BASE = {
    "ns_id": "c.id",
    "entity_id": "c.entityid",
    "nombre": "c.altname",
    "empresa": "c.companyname",
    "es_persona": "c.isperson",
    "parent_ns_id": "c.parent",
    "telefono": "c.phone",
    "email": "c.email",
    "fecha_creacion": "TO_CHAR(c.datecreated, 'YYYY-MM-DD')",
    "inactivo": "c.isinactive",
    "ghl_contact_id": "c.custentity_ghl_contact_id",
}


def _expr(campo, tipo):
    if tipo == "lista":
        return f"BUILTIN.DF(c.{campo})"
    if tipo == "fechahora":
        return f"TO_CHAR(c.{campo}, 'YYYY-MM-DD HH24:MI:SS')"
    if tipo == "fecha":
        return f"TO_CHAR(c.{campo}, 'YYYY-MM-DD')"
    return f"c.{campo}"


def opcionales():
    """Lista de grupos opcionales: {alias: expr} + join opcional.
    Cada grupo se prueba por separado si la consulta completa falla."""
    grupos = [
        {"nombre": "telefono movil", "campos": {"telefono_movil": "c.mobilephone"}},
        {"nombre": "estado de la entidad", "campos": {"estado_ns": "BUILTIN.DF(c.entitystatus)"}},
        {
            "nombre": "direccion de facturacion",
            "campos": {
                "direccion": "ea.addr1",
                "localidad": "ea.city",
                "provincia": "ea.state",
                "cp": "ea.zip",
            },
            # EntityAddress no existe para el rol (30/10/2026): libreta de direcciones del cliente.
            "join": ("LEFT JOIN customerAddressbook cab ON cab.entity = c.id AND cab.defaultbilling = 'T'\n"
                     "LEFT JOIN customerAddressbookEntityAddress ea ON ea.nkey = cab.addressbookaddress"),
        },
    ]
    # Datos del establecimiento en ByKom (campos 3K, vistos en el diagnostico)
    grupos.append({
        "nombre": "datos ByKom del establecimiento",
        "campos": {
            "nombre_establecimiento": "BUILTIN.DF(c.custentity_3k_nombre_establecimiento)",
            "id_bykom": "BUILTIN.DF(c.custentity_3k_id_bykom)",
            "fecha_activacion": "TO_CHAR(c.custentity_3k_fecha_activacion_bykom, 'YYYY-MM-DD')",
            "tipo_monitoreo": "BUILTIN.DF(c.custentity_3k_tipo_monitero_estblcmto)",
        },
    })
    # Direccion de servicio (donde esta el sistema), distinta de la de facturacion
    grupos.append({
        "nombre": "direccion de servicio",
        "campos": {
            "serv_calle": "BUILTIN.DF(c.custentity_3k_dir_serv_calle)",
            "serv_nro": "BUILTIN.DF(c.custentity_3k_dir_serv_nro)",
            "serv_barrio": "BUILTIN.DF(c.custentity_3k_dir_serv_barrio)",
            "serv_cp": "BUILTIN.DF(c.custentity_3k_dir_serv_cp)",
            "serv_provincia": "BUILTIN.DF(c.custentity_3k_dir_serv_prov)",
        },
    })
    personalizados = [
        ("nro_cuenta", config.CAMPO_NRO_CUENTA, "lista"),
        ("estado_servicio", config.CAMPO_ESTADO_SERVICIO, "lista"),
        ("tipo_cliente", config.CAMPO_TIPO_CLIENTE, "lista"),
        ("fecha_suspension", config.CAMPO_FECHA_SUSPENSION, "fechahora"),
        ("motivo_baja", config.CAMPO_MOTIVO_BAJA, "lista"),
        ("comentarios_motivo", config.CAMPO_COMENTARIOS_MOTIVO, "texto"),
        ("comentarios", config.CAMPO_COMENTARIOS, "texto"),
        ("fecha_inicio_suspension", config.CAMPO_FECHA_INICIO_SUSPENSION, "fecha"),
        ("duracion_suspension", config.CAMPO_DURACION_SUSPENSION, "texto"),
    ]
    for alias, campo, tipo in personalizados:
        if campo:
            grupos.append({"nombre": f"{alias} ({campo})", "campos": {alias: _expr(campo, tipo)}})
    return grupos


def expr_estado():
    return _expr(config.CAMPO_ESTADO_SERVICIO, "lista")


def expr_fecha_suspension():
    if not config.CAMPO_FECHA_SUSPENSION:
        raise RuntimeError(
            "Falta CAMPO_FECHA_SUSPENSION (id del campo 'Fecha de Suspension Bykom' del cliente). "
            "Correr diagnostico_clientes.py para encontrarlo.")
    return f"c.{config.CAMPO_FECHA_SUSPENSION}"

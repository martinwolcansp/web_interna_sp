# app/netsuite.py — Oportunidades de NetSuite via SuiteQL (reemplaza el Excel
# "ResultadosSPFedeOportunidadesporVendedorDetalle.xlsx").
#
# Replica la busqueda guardada "SP- Fede Oportunidades por Vendedor (Detalle)"
# (customsearch_sp_fede_oportunidades_ven_9, id 2933):
#   Criterios: Subsidiaria = S.P. SEGURIDAD PRIVADA S.A. / Tipo = Oportunidad /
#              Linea principal / Fecha en el rango / Representante de ventas en
#              la lista de VENDEDORES.
#   Columnas:  mismas etiquetas que el Excel, para que el resto del informe
#              (cruce NetSuite/GHL) no cambie.
#
# Por que SuiteQL y no el RESTlet: el token M2M es aceptado por la API REST
# (SuiteQL) pero los RESTlets de la cuenta lo rechazan con INVALID_LOGIN_ATTEMPT
# (probado el 01/10/2026, tambien con el RESTlet de Power BI).
#
# Autenticacion: OAuth 2.0 Client Credentials (M2M) con certificado. Integracion
# "SP Servicios internos M2M", rol SP WEB SERVICE INTEGRATION.

from datetime import timedelta
import time
import uuid

import jwt
import pandas as pd
import requests

from app import config

# Representantes de la busqueda guardada (criterio "Representante de ventas es
# cualquiera de"). Se compara con espacios colapsados, porque en NetSuite hay
# nombres con doble espacio ("Gonzalo  De Castro").
VENDEDORES = {
    "Federico Ordoqui",
    "Gonzalo De Castro",
    "Gustavo Duarte",
    "Martín German Ramos",
    "Ernesto Ramos",
}
SUBSIDIARIA = "S.P. SEGURIDAD PRIVADA S.A."
ESTADOS_APROBADA = (12, 13)  # misma formula que la columna "Aprobada" de la busqueda

COLUMNAS_REQUERIDAS = [
    "ID CLIENTE CRM",
    "Origen de clientes potenciales",
    "Forma de Contacto con SP",
    "Representante de Ventas",
    "ID",
]

# alias SuiteQL -> etiqueta de columna del Excel
ETIQUETAS = {
    "id_interno": "ID interno",
    "fecha": "Fecha",
    "representante": "Representante de Ventas",
    "aprobada": "Aprobada",
    "oportunidad": "Oportunidad",
    "creacion_cliente": "Creación cliente potencial",
    "id_cliente": "ID",
    "cliente": "Cliente",
    "origen": "Origen de clientes potenciales",
    "forma_contacto": "Forma de Contacto con SP",
    "id_cliente_crm": "ID CLIENTE CRM",
    "estado": "Estado Oportunidad",
    "unidad_negocio": "Unidad de Negocio",
    "tipo_proyecto": "Tipo de Proyecto",
    "tipo_establecimiento": "Tipo de establecimiento",
    "categoria": "Categoría",
    "comodato": "Comodato",
    "id_cliente_crm_matriz": "ID CLIENTE CRM MATRIZ",
    "empresa_matriz": "Empresa matriz",
}

# Establecimientos (08/10/2026): un establecimiento es un subcliente del
# cliente principal (campo parent, "Empresa matriz") y no tiene ID de GHL; lo
# tiene la matriz. "ID CLIENTE CRM" queda tal cual (el informe MKT no cambia)
# y se suma el ID de la matriz (hasta dos niveles) para la Auditoria de la
# integracion. Misma regla que UE_NS_Create_GHL_Opportunity / _Estimate.
SQL_CRM_MATRIZ = "NVL(p.custentity_ghl_contact_id, p2.custentity_ghl_contact_id)"
SQL_JOIN_MATRIZ = ("        LEFT JOIN customer p ON p.id = c.parent\n"
                   "        LEFT JOIN customer p2 ON p2.id = p.parent\n")

# Campos de cabecera agregados el 07/10/2026 (detalle y exportacion a Excel).
# Si el rol no los puede leer, la consulta se repite sin ellos (quedan vacios).
# alias -> (campo, es_lista): las listas se leen con BUILTIN.DF (texto); los
# checkbox, tal cual ('T' / 'F').
CAMPOS_EXTRA = {
    "tipo_establecimiento": ("custbody_mw_sp_unidad_comercial", True),
    "categoria": ("custbody_3k_categoria", True),
    "comodato": ("custbody_3k_comodato", False),
}

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
    entorno: con comillas, con "\\n" literales, en una sola linea, o con cortes
    y espacios agregados al copiarla desde la consola."""
    import re
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

    faltan = [n for n in ("NETSUITE_ACCOUNT_ID", "NETSUITE_CLIENT_ID", "NETSUITE_CERT_ID")
              if not getattr(config, n)]
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
    # Para diagnostico: lo que devolvio NetSuite, sin el token.
    _token_cache["detalle"] = {k: v for k, v in data.items() if k != "access_token"}
    _token_cache["expires_at"] = ahora + int(data.get("expires_in", 3600)) - 60
    return _token_cache["access_token"]


def suiteql(consulta):
    """Ejecuta una consulta SuiteQL y devuelve todas las filas (pagina sola)."""
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


def consulta_oportunidades(desde, hasta, clase_completa=True, campos_extra=True):
    """SuiteQL equivalente a la busqueda guardada. desde/hasta: datetime.date
    (validados por el servicio, por eso se pueden poner como literales)."""
    estados = ", ".join(str(e) for e in ESTADOS_APROBADA)
    # Unidad de Negocio = Clase. El nombre completo ("Alarmas : Nuevas") sale de la
    # tabla classification, que requiere el permiso "Clases" en el rol; sin ese
    # permiso se usa BUILTIN.DF, que devuelve solo la ultima parte ("Nuevas").
    if clase_completa:
        unidad = "cl.fullname"
        join_clase = "        LEFT JOIN classification cl ON cl.id = tl.class\n"
    else:
        unidad = "BUILTIN.DF(tl.class)"
        join_clase = ""
    extra = "".join(
        (f"            BUILTIN.DF(t.{campo}) AS {alias},\n" if es_lista else f"            t.{campo} AS {alias},\n")
        for alias, (campo, es_lista) in CAMPOS_EXTRA.items()
    ) if campos_extra else ""
    return f"""
        SELECT
            t.id                                            AS id_interno,
            TO_CHAR(t.trandate, 'YYYY-MM-DD')               AS fecha,
            BUILTIN.DF(t.employee)                          AS representante,
            CASE WHEN t.entitystatus IN ({estados}) THEN 1 ELSE 0 END AS aprobada,
            t.tranid                                        AS oportunidad,
            TO_CHAR(c.datecreated, 'YYYY-MM-DD HH24:MI')    AS creacion_cliente,
            c.entityid                                      AS id_cliente,
            NVL(c.companyname, c.altname)                   AS cliente,
            BUILTIN.DF(c.leadsource)                        AS origen,
            BUILTIN.DF(c.custentity_ap_sp_forma_de_contactoi) AS forma_contacto,
            c.custentity_ghl_contact_id                     AS id_cliente_crm,
            BUILTIN.DF(t.entitystatus)                      AS estado,
            {unidad}                                        AS unidad_negocio,
            BUILTIN.DF(t.custbody_3k_tipo_de_proyecto)      AS tipo_proyecto,
            {SQL_CRM_MATRIZ}                                AS id_cliente_crm_matriz,
            p.entityid                                      AS empresa_matriz,
{extra}            BUILTIN.DF(tl.subsidiary)                       AS subsidiaria
        FROM transaction t
        INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
        LEFT JOIN customer c ON c.id = t.entity
{SQL_JOIN_MATRIZ}{join_clase}        WHERE t.type = 'Opprtnty'
          AND t.trandate BETWEEN TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD')
                             AND TO_DATE('{hasta.isoformat()}', 'YYYY-MM-DD')
        ORDER BY t.id
    """


def _normalizar(nombre):
    return " ".join(str(nombre or "").split())


def traer_oportunidades(desde, hasta, log):
    """desde/hasta: datetime.date (inclusive). Devuelve un DataFrame con las
    mismas columnas que el Excel de la busqueda guardada."""
    opciones = {"clase_completa": True, "campos_extra": True}
    while True:
        try:
            filas = suiteql(consulta_oportunidades(desde, hasta, **opciones))
            break
        except RuntimeError as e:
            texto = str(e).lower()
            if opciones["clase_completa"] and "classification" in texto:
                log("AVISO: el rol no tiene permiso sobre Clases; Unidad de Negocio sale sin la jerarquia "
                    "(ej. 'Nuevas' en vez de 'Alarmas : Nuevas'). Agregar Listas > Clases (Ver) al rol.")
                opciones["clase_completa"] = False
            elif opciones["campos_extra"] and any(c in texto for c, _ in CAMPOS_EXTRA.values()):
                log("AVISO: NetSuite no dejo leer Tipo de establecimiento / Categoria / Comodato "
                    f"({', '.join(c for c, _ in CAMPOS_EXTRA.values())}); salen vacios. Revisar el acceso del rol "
                    f"a esos campos. Detalle: {str(e)[:300]}")
                opciones["campos_extra"] = False
            else:
                raise
    df = pd.DataFrame(filas)
    if df.empty:
        log("NetSuite: 0 oportunidades en el rango.")
        return pd.DataFrame(columns=list(ETIQUETAS.values()))

    # Criterios de subsidiaria y representante (en Python, para tolerar
    # diferencias de espacios y la jerarquia "Grupo SP : ALARMAS : ...").
    # SuiteQL no devuelve los campos vacios: si una columna viene nula en todas
    # las filas (hoy pasa con Tipo de Proyecto) no aparece en la respuesta.
    for alias in list(ETIQUETAS) + ["subsidiaria"]:
        if alias not in df.columns:
            df[alias] = None

    total = len(df)
    df = df[df["subsidiaria"].fillna("").str.strip().str.endswith(SUBSIDIARIA)]
    df = df[df["representante"].map(_normalizar).isin(VENDEDORES)]
    df = df.drop(columns=["subsidiaria"]).rename(columns=ETIQUETAS)

    # Columnas duplicadas del Excel, para que el DataFrame quede igual.
    df["Id interno"] = df["ID interno"]
    df["Fórmula (numérica)"] = df["ID interno"]
    df["Fecha Oportunidad"] = df["Fecha"]
    for col in ("ID interno", "Id interno", "Fórmula (numérica)", "Aprobada"):
        df[col] = pd.to_numeric(df[col])
    for col in ("Fecha", "Fecha Oportunidad", "Creación cliente potencial"):
        df[col] = pd.to_datetime(df[col])
    df = df.replace({"": None})

    log(f"NetSuite (SuiteQL): {len(df)} oportunidades de los representantes de la busqueda "
        f"({total} oportunidades en el rango, todas las subsidiarias y vendedores).")
    return df.reset_index(drop=True)


# ------------------------------------------------------------ presupuestos
# Presupuestos (transacciones tipo Estimate) para el informe de visitas
# (08/10/2026). Se traen:
#   - los de fecha en el rango (total de presupuestos por vendedor), y
#   - los de los clientes visitados (ID CLIENTE CRM = contacto de GHL de la
#     cita) con fecha desde el inicio del rango en adelante, para poder
#     asociar a cada visita los presupuestos que se hicieron despues.
# Misma subsidiaria que las oportunidades; no se filtra por vendedor (eso lo
# decide el informe). Campos opcionales con reintento sin ellos si el rol no
# los puede leer.

CAMPOS_EXTRA_PRESUPUESTO = {
    "oportunidad": ("opportunity", True),
    "comodato": ("custbody_3k_comodato", False),
    "tipo_establecimiento": ("custbody_mw_sp_unidad_comercial", True),
}

ETIQUETAS_PRESUPUESTO = {
    "id_interno": "ID interno",
    "fecha": "Fecha",
    "presupuesto": "Presupuesto",
    "representante": "Representante de Ventas",
    "estado": "Estado",
    "total": "Total",
    "id_cliente": "ID",
    "cliente": "Cliente",
    "id_cliente_crm": "ID CLIENTE CRM",
    "oportunidad": "Oportunidad",
    "comodato": "Comodato",
    "tipo_establecimiento": "Tipo de establecimiento",
}


def _ids_crm_seguros(ids):
    import re
    return sorted({str(i) for i in ids or [] if i and re.fullmatch(r"[A-Za-z0-9_-]{5,40}", str(i))})


def consulta_presupuestos(desde, hasta, ids_crm=None, campos_extra=True):
    extra = "".join(
        (f"            BUILTIN.DF(t.{campo}) AS {alias},\n" if es_lista else f"            t.{campo} AS {alias},\n")
        for alias, (campo, es_lista) in CAMPOS_EXTRA_PRESUPUESTO.items()
    ) if campos_extra else ""
    rango = (f"t.trandate BETWEEN TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD') "
             f"AND TO_DATE('{hasta.isoformat()}', 'YYYY-MM-DD')")
    ids = _ids_crm_seguros(ids_crm)
    if ids:
        lista = ", ".join(f"'{i}'" for i in ids)
        filtro = (f"({rango} OR (c.custentity_ghl_contact_id IN ({lista}) "
                  f"AND t.trandate >= TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD')))")
    else:
        filtro = rango
    return f"""
        SELECT
            t.id                                            AS id_interno,
            TO_CHAR(t.trandate, 'YYYY-MM-DD')               AS fecha,
            t.tranid                                        AS presupuesto,
            BUILTIN.DF(t.employee)                          AS representante,
            BUILTIN.DF(t.status)                            AS estado,
            t.foreigntotal                                  AS total,
            c.entityid                                      AS id_cliente,
            NVL(c.companyname, c.altname)                   AS cliente,
            c.custentity_ghl_contact_id                     AS id_cliente_crm,
{extra}            BUILTIN.DF(tl.subsidiary)                       AS subsidiaria
        FROM transaction t
        INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
        LEFT JOIN customer c ON c.id = t.entity
        WHERE t.type = 'Estimate'
          AND {filtro}
        ORDER BY t.id
    """


def traer_presupuestos(desde, hasta, ids_crm, log):
    """Lista de dicts con las etiquetas de ETIQUETAS_PRESUPUESTO (fechas ISO)."""
    ids = _ids_crm_seguros(ids_crm)
    filas, campos_extra = [], True
    # Tandas de 300 IDs para no armar una consulta enorme (la primera tanda
    # trae ademas los del rango; las siguientes repiten el rango sin costo).
    tandas = [ids[i:i + 300] for i in range(0, len(ids), 300)] or [[]]
    vistos = set()
    for tanda in tandas:
        while True:
            try:
                lote = suiteql(consulta_presupuestos(desde, hasta, tanda, campos_extra))
                break
            except RuntimeError as e:
                if campos_extra:
                    log("AVISO: NetSuite no dejo leer algun campo opcional del presupuesto "
                        f"({', '.join(c for c, _ in CAMPOS_EXTRA_PRESUPUESTO.values())}); se omiten. "
                        f"Detalle: {str(e)[:300]}")
                    campos_extra = False
                else:
                    raise
        for f in lote:
            if f.get("id_interno") in vistos:
                continue
            vistos.add(f.get("id_interno"))
            filas.append(f)

    total = len(filas)
    salida = []
    for f in filas:
        if not str(f.get("subsidiaria") or "").strip().endswith(SUBSIDIARIA):
            continue
        fila = {etq: f.get(alias) for alias, etq in ETIQUETAS_PRESUPUESTO.items()}
        fila["ID interno"] = int(fila["ID interno"])
        try:
            fila["Total"] = float(fila["Total"]) if fila["Total"] not in (None, "") else None
        except (TypeError, ValueError):
            fila["Total"] = None
        salida.append({k: (None if v == "" else v) for k, v in fila.items()})
    en_rango = sum(1 for f in salida if desde.isoformat() <= (f["Fecha"] or "") <= hasta.isoformat())
    log(f"NetSuite presupuestos: {en_rango} con fecha en el rango y {len(salida) - en_rango} posteriores de "
        f"clientes visitados ({total} antes de filtrar la subsidiaria).")
    return salida


# ------------------------------------------------- clientes potenciales
# Para la Auditoria de la seccion Integracion NetSuite <-> GHL (08/10/2026):
# por cada contacto de GHL de la corrida se busca en NetSuite el cliente
# (cliente potencial, prospecto o cliente) que tenga ese ID en
# custentity_ghl_contact_id. Ademas se traen los clientes creados en el rango,
# para detectar los que quedaron sin ID de GHL. No se filtra subsidiaria ni
# representante: si el ID de GHL esta en cualquier cliente, el contacto esta.

CAMPOS_EXTRA_CLIENTE = {
    "email": ("email", False),
    "telefono": ("phone", False),
    "origen": ("leadsource", True),
}

ETIQUETAS_CLIENTE = {
    "id_interno": "ID interno",
    "id_cliente": "ID",
    "cliente": "Cliente",
    "id_cliente_crm": "ID CLIENTE CRM",
    "creacion": "Fecha de creación",
    "estado": "Estado",
    "representante": "Representante de Ventas",
    "subsidiaria": "Subsidiaria",
    "email": "Email",
    "telefono": "Teléfono",
    "origen": "Origen de clientes potenciales",
    "id_cliente_crm_matriz": "ID CLIENTE CRM MATRIZ",
    "empresa_matriz": "Empresa matriz",
}


def consulta_clientes(desde, hasta, ids_crm=None, campos_extra=True):
    extra = "".join(
        (f"            BUILTIN.DF(c.{campo}) AS {alias},\n" if es_lista else f"            c.{campo} AS {alias},\n")
        for alias, (campo, es_lista) in CAMPOS_EXTRA_CLIENTE.items()
    ) if campos_extra else ""
    hasta_excl = (hasta + timedelta(days=1)).isoformat()
    rango = (f"(c.datecreated >= TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD') "
             f"AND c.datecreated < TO_DATE('{hasta_excl}', 'YYYY-MM-DD'))")
    ids = _ids_crm_seguros(ids_crm)
    if ids:
        lista = ", ".join(f"'{i}'" for i in ids)
        filtro = f"({rango} OR c.custentity_ghl_contact_id IN ({lista}))"
    else:
        filtro = rango
    return f"""
        SELECT
            c.id                                            AS id_interno,
            c.entityid                                      AS id_cliente,
            NVL(c.companyname, c.altname)                   AS cliente,
            c.custentity_ghl_contact_id                     AS id_cliente_crm,
            TO_CHAR(c.datecreated, 'YYYY-MM-DD HH24:MI')    AS creacion,
            BUILTIN.DF(c.entitystatus)                      AS estado,
            BUILTIN.DF(c.salesrep)                          AS representante,
            {SQL_CRM_MATRIZ}                                AS id_cliente_crm_matriz,
            p.entityid                                      AS empresa_matriz,
{extra}            BUILTIN.DF(c.subsidiary)                        AS subsidiaria
        FROM customer c
{SQL_JOIN_MATRIZ}        WHERE {filtro}
        ORDER BY c.id
    """


def traer_clientes(desde, hasta, ids_crm, log):
    """Clientes de NetSuite con ID de GHL en ids_crm o creados en el rango.
    Lista de dicts con las etiquetas de ETIQUETAS_CLIENTE."""
    ids = _ids_crm_seguros(ids_crm)
    filas, campos_extra, vistos = [], True, set()
    # Tandas de 300 IDs, igual que traer_presupuestos.
    tandas = [ids[i:i + 300] for i in range(0, len(ids), 300)] or [[]]
    for tanda in tandas:
        while True:
            try:
                lote = suiteql(consulta_clientes(desde, hasta, tanda, campos_extra))
                break
            except RuntimeError as e:
                if campos_extra:
                    log("AVISO: NetSuite no dejo leer algun campo opcional del cliente "
                        f"({', '.join(c for c, _ in CAMPOS_EXTRA_CLIENTE.values())}); se omiten. "
                        f"Detalle: {str(e)[:300]}")
                    campos_extra = False
                else:
                    raise
        for f in lote:
            if f.get("id_interno") in vistos:
                continue
            vistos.add(f.get("id_interno"))
            filas.append(f)

    salida = []
    for f in filas:
        fila = {etq: f.get(alias) for alias, etq in ETIQUETAS_CLIENTE.items()}
        fila["ID interno"] = int(fila["ID interno"])
        salida.append({k: (None if v == "" else v) for k, v in fila.items()})
    con_id = {str(f["ID CLIENTE CRM"]).strip() for f in salida if f.get("ID CLIENTE CRM")}
    encontrados = sum(1 for i in ids if i in con_id)
    log(f"NetSuite clientes: {encontrados} de {len(ids)} contactos de GHL tienen cliente en NetSuite; "
        f"{len(salida)} clientes en total (incluye los creados en el rango).")
    return salida

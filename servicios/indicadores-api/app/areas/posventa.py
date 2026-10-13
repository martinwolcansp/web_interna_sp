# app/areas/posventa.py — Indicadores de Posventa.
#
# Reemplaza el Power BI "Analisis Posventa V3" y su RESTlet:
#   - Casos de instalacion  = busqueda guardada 2560 (supportcase). Tabla comun
#                             ind_caso_instalacion (app/fuentes/casos.py),
#                             compartida con Instalaciones.
#   - Relevamientos         = busqueda guardada 2557 (customrecord_ap_sp_relevamiento_posventa)
#   - Encuestas posventa    = GHL: contactos con etiqueta enviar_encuesta /
#                             enviar_encuesta_finalizada + objeto de encuestas
# La busqueda 2897 (oportunidades con articulos) no se usa: el informe no la
# muestra en ningun visual.
#
# Cada corrida trae todo desde las fechas de corte de las busquedas (son
# pocos cientos de registros), hace upsert y borra lo que ya no vino.

import re
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config, ghl, netsuite
from app import supabase_rest as sb
from app.fuentes import casos as fuente_casos
from app.fuentes.comun import primera_palabra as _primera_palabra
from app.fuentes.comun import texto as _texto

SECCION = "indicadores-posventa"

TAGS_ENCUESTA = ("enviar_encuesta", "enviar_encuesta_finalizada")

# Normalizacion de respuestas (consulta "Reemplazos" del Power BI) y etiqueta a mostrar.
# GHL guarda la opcion elegida como "Choice: Las cumplió 🙂\nid: exp_buena"; si la
# persona escribio en vez de elegir, queda el texto libre tal cual.
RESPUESTAS = {
    "cal_excelente": "Excelente",
    "cal_buena": "Buena",
    "cal_mala": "Mala",
    "exp_excelente": "Las superó",
    "exp_buena": "Las cumplió",
    "exp_mala": "No las cumplió",
    "sin_comentarios": "Sin comentarios",
    "solicita_llamado": "Solicita llamado",
}


# ---------------------------------------------------------------------------
# Consultas SuiteQL
# ---------------------------------------------------------------------------

def consulta_relevamientos(desde):
    return f"""
        SELECT
            r.id                                                    AS relevamiento_id,
            TO_CHAR(r.created, 'YYYY-MM-DD')                        AS fecha_creacion,
            sc.id                                                   AS caso_id,
            sc.casenumber                                           AS numero_caso,
            c.altname                                               AS empresa,
            BUILTIN.DF(c.custentity_3k_nro_cuenta)                  AS nro_cuenta,
            r.custrecord_ap_sp_es_obra_constr                       AS es_obra_construccion,
            r.custrecord_ap_sp_aplica_normativa                     AS aplica_normativa,
            BUILTIN.DF(r.custrecord_ap_sp_realizo_relev_posventa)   AS realizo,
            BUILTIN.DF(r.custrecord8)                               AS acciones,
            BUILTIN.DF(r.custrecord_mw_sp_motivos_variacion_mo)     AS motivos_variacion_mo,
            r.custrecord_ap_sp_comentarios_posventa                 AS comentarios,
            BUILTIN.DF(sc.custevent_mw_sp_tipo_posventa)            AS tipo_posventa,
            COALESCE(c.custentity_ghl_contact_id, cp.custentity_ghl_contact_id) AS id_cliente_ghl
        FROM customrecord_ap_sp_relevamiento_posventa r
        LEFT JOIN supportcase sc ON sc.id = r.custrecord_ap_sp_posventa_caso
        LEFT JOIN customer c ON c.id = sc.company
        -- El caso apunta al subcliente (C16312-1); el ID de GHL suele estar en el padre (C16312).
        LEFT JOIN customer cp ON cp.id = c.parent
        WHERE r.created >= TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD')
        ORDER BY r.id
    """


# ---------------------------------------------------------------------------
# Transformaciones (mismas reglas que el Power Query del informe)
# ---------------------------------------------------------------------------

def _bool(valor):
    return None if valor is None else str(valor).upper() == "T"


def filas_relevamientos(crudas, corrida_id):
    filas = []
    for f in crudas:
        acciones = [a.strip() for a in (f.get("acciones") or "").split(",") if a.strip()]
        filas.append({
            "relevamiento_id": int(f["relevamiento_id"]),
            "fecha_creacion": f.get("fecha_creacion"),
            "caso_id": int(f["caso_id"]) if f.get("caso_id") else None,
            "numero_caso": _texto(f.get("numero_caso")),
            "empresa": _texto(f.get("empresa")),
            # El Power BI recortaba la cuenta del texto de Empresa (": 42xxxx"); se
            # lee del campo del cliente, que da lo mismo y cubre las cuentas "B42...".
            "nro_cuenta": _texto(f.get("nro_cuenta")),
            "es_obra_construccion": _bool(f.get("es_obra_construccion")),
            "aplica_normativa": _bool(f.get("aplica_normativa")),
            "realizo": _texto(f.get("realizo")),
            "acciones": acciones,
            "motivos_variacion_mo": _texto(f.get("motivos_variacion_mo")),
            "comentarios": _texto(f.get("comentarios")),
            "tipo_posventa": _primera_palabra(_texto(f.get("tipo_posventa"))),
            # Contacto de GHL del cliente: cruza el relevamiento con la encuesta.
            "id_cliente_ghl": _texto(f.get("id_cliente_ghl")),
            "corrida_id": corrida_id,
            "actualizado_en": sb.ahora_iso(),
        })
    return filas


def _respuesta(valor):
    """Normaliza la respuesta: si contiene un codigo conocido (cal_buena, ...)
    se usa su etiqueta; si no, el texto tal cual (comentarios libres)."""
    texto = _texto(valor)
    if texto is None:
        return None
    for codigo, etiqueta in RESPUESTAS.items():
        if codigo in texto:
            return etiqueta
    return texto


def _fecha_texto(valor):
    """El Power BI toma la fecha del texto entre '_' del campo encuesta
    (ej. 'posventa_2026-09-15_...')."""
    texto = str(valor or "")
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", texto)
    if m:
        return m.group(0)
    m = re.search(r"(\d{1,2})/(\d{1,2})/(\d{4})", texto)
    if m:
        return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
    return None


def _fecha_alta(creado):
    """Dia de alta del registro en hora de Argentina (si la encuesta no trae fecha)."""
    if creado:
        try:
            d = datetime.fromisoformat(str(creado).replace("Z", "+00:00"))
            return d.astimezone(ZoneInfo(config.ZONA_HORARIA)).date().isoformat()
        except ValueError:
            return str(creado)[:10]
    return None


def filas_encuestas(contactos_por_tag, registros, corrida_id):
    """Una fila por contacto con etiqueta de encuesta.
    Estado: Finalizada si tiene enviar_encuesta_finalizada, si no Enviada.
    Respuestas: pregunta 1 = Calificacion, 2 = Expectativa, 3 = Comentarios
    (la 0 es el mensaje de apertura y no se usa). Si el contacto respondio mas
    de una encuesta, se toman las respuestas de la mas reciente.
    El campo encuesta viene como '<contact_id>_6/10/2026_Pregunta3'."""
    respuestas = {}
    for r in registros:
        p = r.get("properties") or {}
        cid = _texto(p.get("contact_id"))
        if not cid:
            continue
        datos = respuestas.setdefault(cid, {"nombre": _texto(p.get("cliente_nombre")), "fecha": None})
        fecha = _fecha_texto(p.get("encuesta")) or _fecha_alta(r.get("createdAt")) or ""
        try:
            nro = int(float(p.get("nro_pregunta")))
        except (TypeError, ValueError):
            nro = None
        campo = {1: "calificacion", 2: "expectativa", 3: "comentarios"}.get(nro)
        if fecha and (datos["fecha"] is None or fecha > datos["fecha"]):
            # Encuesta mas nueva: se descartan las respuestas de la anterior.
            datos.update(fecha=fecha, calificacion=None, expectativa=None, comentarios=None)
        if campo and fecha == (datos["fecha"] or ""):
            datos[campo] = _respuesta(p.get("respuesta"))

    contactos = {}
    for tag, lista in contactos_por_tag.items():
        for c in lista:
            cid = c.get("id")
            if not cid:
                continue
            fila = contactos.setdefault(cid, {"contacto": None, "tags": set()})
            nombre = " ".join(x for x in (c.get("firstName"), c.get("lastName")) if x) or c.get("contactName") or c.get("name")
            fila["contacto"] = fila["contacto"] or _texto(nombre)
            fila["tags"].update(t.lower() for t in (c.get("tags") or []))
            fila["tags"].add(tag)

    filas = []
    for cid, c in contactos.items():
        r = respuestas.get(cid, {})
        filas.append({
            "contact_id": cid,
            "contacto": c["contacto"] or r.get("nombre"),
            "estado": "Finalizada" if any("enviar_encuesta_finalizada" in t for t in c["tags"]) else "Enviada",
            "fecha": r.get("fecha"),
            "calificacion": r.get("calificacion"),
            "expectativa": r.get("expectativa"),
            "comentarios": r.get("comentarios"),
            "corrida_id": corrida_id,
            "actualizado_en": sb.ahora_iso(),
        })
    return filas


# ---------------------------------------------------------------------------
# Extraccion (se usa en la corrida y en probar_posventa.py)
# ---------------------------------------------------------------------------

def traer_casos(log, corrida_id=None):
    return fuente_casos.traer(log, corrida_id)


def traer_relevamientos(log, corrida_id=None):
    crudas = netsuite.suiteql(consulta_relevamientos(config.POSVENTA_RELEV_DESDE))
    filas = filas_relevamientos(crudas, corrida_id)
    log(f"NetSuite: {len(filas)} relevamientos posventa desde {config.POSVENTA_RELEV_DESDE}.")
    return filas


def traer_encuestas(log, corrida_id=None):
    contactos = {tag: ghl.contactos_con_tag(tag, log) for tag in TAGS_ENCUESTA}
    clave = ghl.clave_objeto("encuesta", log)
    registros = ghl.registros_objeto(clave, log)
    filas = filas_encuestas(contactos, registros, corrida_id)
    log(f"GHL: {len(filas)} contactos con encuesta ({', '.join(f'{t}: {len(v)}' for t, v in contactos.items())}); "
        f"{len(registros)} respuestas en el objeto {clave}.")
    return filas


# ---------------------------------------------------------------------------
# Corrida
# ---------------------------------------------------------------------------

def actualizar(token, corrida_id, log, paso):
    """Trae los datos, los guarda en Supabase y devuelve (stats, advertencias).
    NetSuite es obligatorio; si GHL falla se conservan las encuestas anteriores."""
    advertencias = []

    paso("Consultando casos de instalacion en NetSuite")
    casos = traer_casos(log, corrida_id)
    paso("Consultando relevamientos posventa en NetSuite")
    relevamientos = traer_relevamientos(log, corrida_id)
    if not casos or not relevamientos:
        # Una respuesta vacia borraria todo lo cargado: se corta antes.
        raise RuntimeError(f"NetSuite devolvio {len(casos)} casos y {len(relevamientos)} relevamientos; "
                           "no se actualiza para no dejar el informe vacio.")

    paso("Guardando casos y relevamientos")
    fuente_casos.guardar(token, casos, corrida_id)
    sb.upsert(token, "ind_posventa_relevamiento", relevamientos, "relevamiento_id")
    sb.borrar_no_vistos(token, "ind_posventa_relevamiento", corrida_id)

    encuestas = None
    paso("Consultando encuestas en GHL")
    try:
        encuestas = traer_encuestas(log, corrida_id)
        if encuestas:
            sb.upsert(token, "ind_posventa_encuesta", encuestas, "contact_id")
            sb.borrar_no_vistos(token, "ind_posventa_encuesta", corrida_id)
        else:
            advertencias.append("GHL no devolvio contactos con etiqueta de encuesta; se conservan los datos anteriores.")
    except Exception as e:
        advertencias.append(f"No se pudieron actualizar las encuestas de GHL (se conservan las anteriores): {e}")
        log(f"AVISO: {advertencias[-1]}")

    stats = {
        "casos": len(casos),
        "instalaciones": len({c["id_inst"] for c in casos if c["id_inst"]}),
        "relevamientos": len(relevamientos),
        "encuestas": len(encuestas) if encuestas is not None else None,
    }
    return stats, advertencias

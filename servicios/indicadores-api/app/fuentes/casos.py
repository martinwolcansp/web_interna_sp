# app/fuentes/casos.py — Casos de instalacion (tabla comun ind_caso_instalacion).
#
# Replica la busqueda guardada 2560 (supportcase), filtrada por el asignado
# 133 como hacen los RESTlets de Power BI. La usan Posventa e Instalaciones;
# las dos traen exactamente el mismo alcance, asi que cualquiera de las dos
# puede refrescar la tabla.

from app import config, netsuite
from app import supabase_rest as sb
from app.fuentes import clasificacion
from app.fuentes.comun import entero, numero, primera_palabra, sin_prefijo_dai, texto

TABLA = "ind_caso_instalacion"

# Criterio de la busqueda 2560: estado del establecimiento del cliente.
ESTADOS_ESTABLECIMIENTO = (1, 2, 3, 4, 5, 6)


def alcance_sql(alias_caso="sc", alias_cliente="c"):
    """Condicion SuiteQL del alcance (casos de la busqueda 2560). La reusan las
    consultas de OV y articulos para traer solo lo que cuelga de estos casos.
    Requiere el JOIN customer <alias_cliente> ON <alias_cliente>.id = <alias_caso>.company."""
    estados = ", ".join(str(e) for e in ESTADOS_ESTABLECIMIENTO)
    desde = config.CASOS_INSTALACION_DESDE.isoformat()
    return (f"{alias_caso}.datecreated >= TO_DATE('{desde}', 'YYYY-MM-DD') "
            f"AND {alias_caso}.assigned = {int(config.CASOS_INSTALACION_ASIGNADO_A)} "
            f"AND {alias_cliente}.custentity_3k_estado_establecimiento IN ({estados})")


def consulta():
    return f"""
        SELECT
            sc.id                                                   AS caso_id,
            sc.casenumber                                           AS numero,
            TO_CHAR(sc.datecreated, 'YYYY-MM-DD')                   AS fecha_creacion,
            TO_CHAR(sc.custevent_3k_fecha_real_inst, 'YYYY-MM-DD')  AS fecha_inicio_inst,
            TO_CHAR(sc.custevent_ap_sp_fecha_fin_instal, 'YYYY-MM-DD') AS fecha_fin_inst,
            TO_CHAR(sc.enddate, 'YYYY-MM-DD')                       AS fecha_cerrada,
            c.id                                                    AS cliente_id,
            c.altname                                               AS cliente,
            BUILTIN.DF(c.custentity_3k_nro_cuenta)                  AS nro_cuenta,
            BUILTIN.DF(sc.custevent_3k_tecnico_asignado_caso)       AS tecnico,
            BUILTIN.DF(sc.custevent_ap_sp_tipo_proyecto_presup_sp)  AS tipo_proyecto,
            BUILTIN.DF(sc.status)                                   AS estado_caso,
            BUILTIN.DF(sc.custevent3k_estado_sp)                    AS estado_instalacion,
            BUILTIN.DF(sc.custevent_mw_sp_tipo_posventa)            AS tipo_posventa,
            BUILTIN.DF(sc.assigned)                                 AS asignado_a,
            sc.custevent_ap_sp_dias_reales_trabajo                  AS dias_reales_trabajo,
            sc.custevent_3k_ov_de_productos                         AS ov_productos_id
        FROM supportcase sc
        LEFT JOIN customer c ON c.id = sc.company
        WHERE {alcance_sql()}
        ORDER BY sc.id
    """


def id_inst(fecha_creacion, fecha_inicio, fecha_fin, cliente_id):
    """Agrupa los casos de una misma instalacion (alarma y camaras suelen ir en
    dos casos). Con fecha de inicio: inicio + fin + cliente (ID_inst del Power
    BI de Posventa). Sin iniciar: fecha de creacion + cliente (como el
    Id_instalacion del Power BI de Instalaciones para esos casos)."""
    if fecha_inicio:
        partes = (fecha_inicio, fecha_fin, cliente_id)
    else:
        partes = ("pend", fecha_creacion, cliente_id)
    return "_".join(str(x) for x in partes if x)


def filas(crudas, corrida_id):
    salida = []
    for f in crudas:
        fcre, fini, ffin = f.get("fecha_creacion"), f.get("fecha_inicio_inst"), f.get("fecha_fin_inst")
        cliente_id = entero(f.get("cliente_id"))
        salida.append({
            "caso_id": int(f["caso_id"]),
            "numero": f.get("numero"),
            "id_inst": id_inst(fcre, fini, ffin, cliente_id),
            "fecha_creacion": fcre,
            "fecha_inicio_inst": fini,
            "fecha_fin_inst": ffin,
            "fecha_cerrada": f.get("fecha_cerrada"),
            "cliente_id": cliente_id,
            "cliente": texto(f.get("cliente")),
            "nro_cuenta": texto(f.get("nro_cuenta")),
            "tecnico": sin_prefijo_dai(texto(f.get("tecnico"))),
            "tipo_proyecto": texto(f.get("tipo_proyecto")),
            "estado_caso": texto(f.get("estado_caso")),
            "estado_instalacion": texto(f.get("estado_instalacion")),
            "tipo_posventa": primera_palabra(texto(f.get("tipo_posventa"))),
            "asignado_a": texto(f.get("asignado_a")),
            "dias_reales_trabajo": numero(f.get("dias_reales_trabajo")),
            "tipo_trabajo": texto(f.get("tipo_trabajo")),
            "tipo_trabajo_origen": f.get("tipo_trabajo_origen"),
            "unidad_comercial": texto(f.get("unidad_comercial")),
            "categoria": texto(f.get("categoria")),
            "clasificacion_origen": f.get("clasificacion_origen"),
            "corrida_id": corrida_id,
            "actualizado_en": sb.ahora_iso(),
        })
    return salida


def traer(log, corrida_id=None, token=None):
    """token: para leer las equivalencias de tipo de proyecto de Supabase (sin
    token se usan las del servicio, por ejemplo en probar_*.py)."""
    crudas = netsuite.suiteql(consulta())
    clasificacion.clasificar(crudas, clasificacion.cargar_equivalencias(token, log), log)
    resultado = filas(crudas, corrida_id)
    log(f"NetSuite: {len(resultado)} casos de instalacion desde {config.CASOS_INSTALACION_DESDE} "
        f"(asignados a {config.CASOS_INSTALACION_ASIGNADO_A}).")
    return resultado


def guardar(token, casos, corrida_id):
    """Upsert y borrado de los casos que ya no estan en el alcance."""
    if not casos:
        # Una respuesta vacia borraria todo lo cargado: se corta antes.
        raise RuntimeError("NetSuite no devolvio casos de instalacion; no se actualiza para no dejar los informes vacios.")
    sb.upsert(token, TABLA, casos, "caso_id")
    sb.borrar_no_vistos(token, TABLA, corrida_id)

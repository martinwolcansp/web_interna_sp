# app/informes/bajas.py — Bajas de establecimientos de un mes (foto acumulativa).
#
# Replica la busqueda "SP Clientes Suspendidos por Baja": establecimientos con
# Fecha de Suspension Bykom dentro del mes y estado de servicio de suspension.
# Suma el estado BAJA (CRITERIO_BAJAS): una suspension por baja pasa despues a
# BAJA definitiva y la busqueda guardada la pierde (septiembre 2026 tenia 117
# bajas el 05/10 y 116 el 30/10). Igual, si un establecimiento se reactiva o
# cambia su fecha de suspension, deja de aparecer en el mes. NetSuite no
# expone el historial por SuiteQL (notas del sistema vacias para el rol). Por
# eso cada actualizacion:
#
#   1. Upsert de lo que trae NetSuite hoy, por establecimiento + fecha de
#      suspension. estado_servicio y primera_captura_en quedan como en la
#      primera foto; estado_actual, dias_suspendido y ultima_captura_en se
#      actualizan.
#   2. Las bajas del mes ya guardadas que hoy no vienen NO se borran: quedan
#      vigente = false y se consulta su estado actual por id (reactivado,
#      otra fecha de suspension, eliminado).

from datetime import date, datetime

from app import campos, config, consulta
from app import supabase_rest as sb
from app.comun import ahora, entero, fecha_hora, numero, texto
from app.informes.segmentacion import _direccion
from app.plan_accion import categoria

SECCION = "clientes-bajas"
USA_PERIODO = True

T_BAJA = "cli_baja"

EXTRA = [{
    "campos": {
        "cliente_ns_id": "NVL(p2.id, NVL(p.id, c.id))",
        "telefono_cliente": "NVL(p2.phone, p.phone)",
        "email_cliente": "NVL(p2.email, p.email)",
    },
    "join": consulta.JOIN_PADRES,
}]


def _mes_siguiente(d):
    return date(d.year + (d.month == 12), d.month % 12 + 1, 1)


def _clave(ns_id, fs):
    return (int(ns_id), fs.astimezone().replace(microsecond=0).isoformat() if isinstance(fs, datetime) else fs)


def where_mes(desde, hasta):
    fs = campos.expr_fecha_suspension()
    return (f"{fs} >= TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD') "
            f"AND {fs} < TO_DATE('{hasta.isoformat()}', 'YYYY-MM-DD') "
            f"AND " + config.CRITERIO_BAJAS.format(estado=campos.expr_estado()))


def fila(f, periodo, corrida_id, ts, ahora_dt, previa=None):
    fs = fecha_hora(f.get("fecha_suspension"))
    estado = texto(f.get("estado_servicio"))
    motivo = texto(f.get("motivo_baja"))
    com_motivo = texto(f.get("comentarios_motivo"))
    return {
        "establecimiento_ns_id": int(f["ns_id"]),
        "fecha_suspension": fs.isoformat(),
        "periodo": periodo.isoformat(),
        "cliente_ns_id": entero(f.get("cliente_ns_id")),
        "entity_id": texto(f.get("entity_id")),
        "nombre": texto(f.get("nombre")),
        "nombre_establecimiento": texto(f.get("nombre_establecimiento")) or texto(f.get("empresa")) or texto(f.get("nombre")),
        "direccion": _direccion(f)["direccion"],
        "localidad": _direccion(f)["localidad"],
        "fecha_activacion": texto(f.get("fecha_activacion")),
        "nro_cuenta": texto(f.get("nro_cuenta")),
        "tipo_cliente": texto(f.get("tipo_cliente")),
        # Estado de la primera foto: no se pisa en las actualizaciones siguientes.
        "estado_servicio": (previa or {}).get("estado_servicio") or estado,
        "estado_actual": estado,
        "motivo_baja": motivo,
        "comentarios_motivo": com_motivo,
        "comentarios": texto(f.get("comentarios")),
        "fecha_inicio_suspension": texto(f.get("fecha_inicio_suspension")),
        "duracion_suspension": numero(f.get("duracion_suspension")),
        "dias_suspendido": (ahora_dt - fs).days,
        "telefono": texto(f.get("telefono")) or texto(f.get("telefono_cliente")),
        "email": texto(f.get("email")) or texto(f.get("email_cliente")),
        "categoria": categoria(motivo, com_motivo),
        "vigente": True,
        "ultima_captura_en": ts,
        "corrida_id": corrida_id,
    }


def traer_mes(periodo, log, paso):
    paso("Verificando campos de NetSuite")
    grupos, avisos = consulta.grupos_validos(log)
    paso(f"Consultando bajas de {periodo:%m/%Y} en NetSuite")
    filas = consulta.consultar(grupos, where_mes(periodo, _mes_siguiente(periodo)), EXTRA, log=log, avisos=avisos)
    filas = [f for f in filas if fecha_hora(f.get("fecha_suspension"))]
    log(f"{len(filas)} bajas en NetSuite para {periodo:%m/%Y}")
    return filas, grupos, avisos


def actualizar(token, corrida_id, log, paso, periodo):
    filas, grupos, avisos = traer_mes(periodo, log, paso)
    ahora_dt = ahora()
    ts = ahora_dt.isoformat()

    paso("Leyendo la foto anterior del mes")
    previas = sb.leer_todo(token, T_BAJA, "establecimiento_ns_id,fecha_suspension,estado_servicio,vigente",
                           {"periodo": f"eq.{periodo.isoformat()}"})
    por_clave = {_clave(p["establecimiento_ns_id"], datetime.fromisoformat(p["fecha_suspension"])): p for p in previas}

    nuevas = [fila(f, periodo, corrida_id, ts, ahora_dt,
                   por_clave.get(_clave(f["ns_id"], fecha_hora(f.get("fecha_suspension")))))
              for f in filas]
    vistas = {_clave(n["establecimiento_ns_id"], datetime.fromisoformat(n["fecha_suspension"])) for n in nuevas}
    agregadas = sum(1 for k in vistas if k not in por_clave)

    paso("Guardando bajas")
    sb.upsert(token, T_BAJA, nuevas, "establecimiento_ns_id,fecha_suspension")

    # Bajas de la foto que hoy ya no cumplen la busqueda
    faltantes = [p for k, p in por_clave.items() if k not in vistas]
    if faltantes:
        paso("Consultando el estado actual de las bajas que ya no aparecen")
        actuales = {int(f["ns_id"]): f for f in consulta.por_ids(grupos, [p["establecimiento_ns_id"] for p in faltantes])}
        cambios = []
        for p in faltantes:
            act = actuales.get(int(p["establecimiento_ns_id"]))
            if act is None:
                estado = "No existe en NetSuite"
            else:
                estado = texto(act.get("estado_servicio")) or "Sin estado"
                fs_act = fecha_hora(act.get("fecha_suspension"))
                if fs_act and _clave(0, fs_act)[1] != _clave(0, datetime.fromisoformat(p["fecha_suspension"]))[1]:
                    estado += f" (suspension actual: {fs_act:%d/%m/%Y})"
            cambios.append({
                "establecimiento_ns_id": p["establecimiento_ns_id"],
                "fecha_suspension": p["fecha_suspension"],
                "periodo": periodo.isoformat(),
                "estado_actual": estado,
                "vigente": False,
                "ultima_captura_en": ts,
                "corrida_id": corrida_id,
            })
        sb.upsert(token, T_BAJA, cambios, "establecimiento_ns_id,fecha_suspension")
        log(f"{len(cambios)} bajas del mes ya no cumplen la busqueda (quedan con vigente = false)")

    stats = {
        "periodo": periodo.isoformat()[:7],
        "bajas": len(nuevas),
        "nuevas": agregadas,
        "ya_no_aparecen": len(faltantes),
    }
    return stats, avisos

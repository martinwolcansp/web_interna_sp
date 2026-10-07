# app/job.py — Una corrida de actualizacion de un area (generico).
#
# El modulo del area (app/areas/<area>.py) trae los datos y los guarda; aca se
# registra el avance, el log y el resultado en la tabla ind_corrida.

import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

from app import config
from app import supabase_rest as sb
from app.areas import AREAS

logger = logging.getLogger("indicadores_job")


def ejecutar(area, corrida_id, token):
    modulo = AREAS[area]
    lineas = []

    def log(msg):
        logger.info(msg)
        lineas.append(f"{datetime.now(ZoneInfo(config.ZONA_HORARIA)).strftime('%H:%M:%S')} {msg}")

    def paso(nombre):
        log(f"== {nombre}")
        sb.actualizar_corrida(token, corrida_id, {"paso": nombre})

    try:
        stats, advertencias = modulo.actualizar(token, corrida_id, log, paso)
        stats = dict(stats, advertencias=advertencias)
        log(f"Listo: {json.dumps(stats, ensure_ascii=False)}")
        sb.actualizar_corrida(token, corrida_id, {
            "estado": "ok",
            "paso": "Terminada",
            "mensaje": "; ".join(advertencias) or None,
            "stats": stats,
            "finalizado_en": sb.ahora_iso(),
            "log": "\n".join(lineas),
        })
        try:
            sb.borrar_corridas_viejas(token, area, config.CORRIDAS_A_CONSERVAR)
        except Exception:
            logger.warning("No se pudo limpiar el historial de corridas", exc_info=True)
    except Exception as e:
        logger.exception("Fallo la corrida %s (%s)", corrida_id, area)
        log(f"ERROR: {e}")
        try:
            sb.actualizar_corrida(token, corrida_id, {
                "estado": "error",
                "mensaje": str(e)[:1000],
                "finalizado_en": sb.ahora_iso(),
                "log": "\n".join(lineas),
            })
        except Exception:
            logger.exception("Tampoco se pudo registrar el error de la corrida %s", corrida_id)

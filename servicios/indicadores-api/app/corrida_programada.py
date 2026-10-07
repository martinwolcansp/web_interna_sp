# app/corrida_programada.py — Actualizacion automatica de Indicadores por Area.
#
# La corre la tarea programada de Coolify (Scheduled Tasks de indicadores-api):
#     python -m app.corrida_programada              (todas las areas)
#     python -m app.corrida_programada posventa     (una sola)
#
# Inicia sesion en Supabase con el usuario tecnico INDICADORES_BOT_EMAIL /
# INDICADORES_BOT_PASSWORD (permiso editar en cada indicadores-<area>).
# Si hay una actualizacion manual en curso, espera hasta
# MINUTOS_ESPERA_EN_CURSO a que termine.
# Sale con codigo 1 si algun area fallo, asi Coolify marca la ejecucion.

import argparse
import logging
import sys
import time

from app import config, job
from app import supabase_rest as sb
from app.areas import AREAS

logger = logging.getLogger("indicadores_programada")

SEGUNDOS_ENTRE_CONSULTAS = 30


def esperar_libre(token, area):
    limite = time.monotonic() + config.MINUTOS_ESPERA_EN_CURSO * 60
    while True:
        sb.cerrar_corridas_colgadas(token, area)
        en_curso = sb.corrida_en_curso(token, area)
        if not en_curso:
            return True
        if time.monotonic() >= limite:
            logger.error("%s: sigue en curso la corrida %s; no se actualiza.", area, en_curso["id"])
            return False
        logger.info("%s: hay una actualizacion en curso; se espera %ss.", area, SEGUNDOS_ENTRE_CONSULTAS)
        time.sleep(SEGUNDOS_ENTRE_CONSULTAS)


def correr_area(area):
    token = sb.iniciar_sesion(config.INDICADORES_BOT_EMAIL, config.INDICADORES_BOT_PASSWORD)
    seccion = AREAS[area].SECCION
    if not sb.tiene_permiso(token, seccion, "editar"):
        logger.error("El usuario tecnico %s no tiene permiso editar en %s.", config.INDICADORES_BOT_EMAIL, seccion)
        return False
    if not esperar_libre(token, area):
        return False
    corrida = sb.crear_corrida(token, area, origen="automatica")
    if not corrida:
        logger.error("%s: no se pudo crear la corrida (hay otra en curso).", area)
        return False
    logger.info("%s: corrida %s.", area, corrida["id"])
    job.ejecutar(area, corrida["id"], token)
    final = sb.estado_corrida(token, corrida["id"]) or {}
    if final.get("estado") == "ok":
        logger.info("%s: OK.%s", area, f" Avisos: {final['mensaje']}" if final.get("mensaje") else "")
        return True
    logger.error("%s: terminada con estado %s: %s", area, final.get("estado"), final.get("mensaje"))
    return False


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s")
    parser = argparse.ArgumentParser(description="Actualizacion automatica de Indicadores por Area.")
    parser.add_argument("areas", nargs="*", help=f"areas a actualizar (por defecto todas: {', '.join(AREAS)})")
    args = parser.parse_args(argv)

    areas = args.areas or list(AREAS)
    desconocidas = [a for a in areas if a not in AREAS]
    if desconocidas:
        parser.error(f"areas desconocidas: {', '.join(desconocidas)}")
    if not (config.INDICADORES_BOT_EMAIL and config.INDICADORES_BOT_PASSWORD):
        logger.error("Faltan INDICADORES_BOT_EMAIL / INDICADORES_BOT_PASSWORD.")
        return 1

    fallidas = 0
    for area in areas:
        try:
            if not correr_area(area):
                fallidas += 1
        except Exception:
            logger.exception("Fallo la actualizacion de %s", area)
            fallidas += 1
    logger.info("Fin: %s de %s areas OK.", len(areas) - fallidas, len(areas))
    return 1 if fallidas else 0


if __name__ == "__main__":
    sys.exit(main())

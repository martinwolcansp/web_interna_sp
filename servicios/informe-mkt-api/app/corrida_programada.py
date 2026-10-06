# app/corrida_programada.py — Actualizacion automatica del Informe MKT.
#
# La corre la tarea programada de Coolify (Scheduled Tasks de informe-mkt-api)
# de lunes a viernes a las 16 hs:
#     python -m app.corrida_programada
#
# Hace lo mismo que el boton "Actualizar" de la web, con el rango calculado:
#   - Siempre: del 1 del mes en curso a hoy (hora de Argentina).
#   - En los primeros DIAS_HABILES_MES_ANTERIOR dias habiles del mes, antes
#     corre el mes anterior completo, para tomar los cierres tardios. Se corre
#     primero para que la ultima corrida OK (la que muestra la pagina) sea la
#     del mes en curso.
#
# Como no hay un usuario de la web, inicia sesion en Supabase con el usuario
# tecnico INFORME_BOT_EMAIL / INFORME_BOT_PASSWORD (permiso editar en Informes
# de MKT y en Integracion NetSuite-GHL). Las politicas RLS aplican igual.
#
# Si hay una actualizacion manual en curso, espera hasta MINUTOS_ESPERA_EN_CURSO
# a que termine; si no termina, desiste de ese rango.
#
# Prueba manual (desde la carpeta del servicio, con el .env):
#     python -m app.corrida_programada --simular
#     python -m app.corrida_programada --desde 2026-10-01 --hasta 2026-10-06
#
# Sale con codigo 1 si alguna corrida termino con error o no se pudo hacer,
# asi Coolify la marca como fallida.

import argparse
import logging
import sys
import time
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from app import config, job
from app import supabase_rest as sb

logger = logging.getLogger("informe_mkt_programada")

SEGUNDOS_ENTRE_CONSULTAS = 30


def hoy_argentina():
    return datetime.now(ZoneInfo(config.ZONA_HORARIA)).date()


def es_habil(d):
    return d.weekday() < 5  # lunes a viernes (los feriados cuentan como habiles)


def dia_habil_del_mes(d):
    """1 si d es el primer dia habil del mes, 2 si es el segundo, etc."""
    return sum(1 for i in range(1, d.day + 1) if es_habil(d.replace(day=i)))


def rangos_del_dia(hoy):
    rangos = []
    if config.DIAS_HABILES_MES_ANTERIOR > 0 and dia_habil_del_mes(hoy) <= config.DIAS_HABILES_MES_ANTERIOR:
        fin_anterior = hoy.replace(day=1) - timedelta(days=1)
        rangos.append((fin_anterior.replace(day=1), fin_anterior))
    rangos.append((hoy.replace(day=1), hoy))
    return rangos


def esperar_libre(token):
    """True cuando no hay ninguna corrida en curso; False si se agota la espera."""
    limite = time.monotonic() + config.MINUTOS_ESPERA_EN_CURSO * 60
    while True:
        sb.cerrar_corridas_colgadas(token)
        en_curso = sb.corrida_en_curso(token)
        if not en_curso:
            return True
        if time.monotonic() >= limite:
            logger.error("Sigue en curso la corrida %s (iniciada %s): no se actualiza este rango.",
                         en_curso["id"], en_curso.get("iniciado_en"))
            return False
        logger.info("Hay una actualizacion en curso (%s); se espera %ss.", en_curso["id"], SEGUNDOS_ENTRE_CONSULTAS)
        time.sleep(SEGUNDOS_ENTRE_CONSULTAS)


def correr_rango(desde, hasta):
    """Una corrida completa. Devuelve True si termino OK."""
    # Sesion nueva por rango: el access token de Supabase vence (por defecto en 1 hora).
    token = sb.iniciar_sesion(config.INFORME_BOT_EMAIL, config.INFORME_BOT_PASSWORD)
    if not sb.tiene_permiso(token, "informes-mkt", "editar"):
        logger.error("El usuario tecnico %s no tiene permiso editar en Informes de MKT.", config.INFORME_BOT_EMAIL)
        return False
    if not esperar_libre(token):
        return False

    corrida = sb.crear_corrida(token, desde, hasta, origen="automatica")
    if not corrida:  # alguien aprieta el boton justo en este momento
        logger.info("Otra actualizacion empezo al mismo tiempo; se vuelve a esperar.")
        if not esperar_libre(token):
            return False
        corrida = sb.crear_corrida(token, desde, hasta, origen="automatica")
        if not corrida:
            logger.error("No se pudo crear la corrida %s a %s: hay otra en curso.", desde, hasta)
            return False

    logger.info("Corrida %s: %s a %s.", corrida["id"], desde, hasta)
    job.ejecutar(corrida["id"], token, desde, hasta)  # registra OK/error en la tabla

    final = sb.estado_corrida(token, corrida["id"]) or {}
    if final.get("estado") == "ok":
        logger.info("Corrida %s OK.%s", corrida["id"],
                    f" Avisos: {final['mensaje']}" if final.get("mensaje") else "")
        return True
    logger.error("Corrida %s terminada con estado %s: %s", corrida["id"], final.get("estado"), final.get("mensaje"))
    return False


def main(argv=None):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s:%(name)s:%(message)s")

    parser = argparse.ArgumentParser(description="Actualizacion automatica del Informe MKT.")
    parser.add_argument("--desde", type=date.fromisoformat, help="AAAA-MM-DD (con --hasta, reemplaza el rango calculado)")
    parser.add_argument("--hasta", type=date.fromisoformat, help="AAAA-MM-DD")
    parser.add_argument("--simular", action="store_true", help="muestra los rangos que correria y termina")
    parser.add_argument("--forzar", action="store_true", help="corre aunque hoy sea sabado o domingo")
    args = parser.parse_args(argv)

    hoy = hoy_argentina()
    if bool(args.desde) != bool(args.hasta):
        parser.error("--desde y --hasta van juntos")
    if args.desde:
        if args.desde > args.hasta or args.hasta > hoy:
            parser.error("rango invalido: desde <= hasta <= hoy")
        rangos = [(args.desde, args.hasta)]
    else:
        if not es_habil(hoy) and not args.forzar:
            logger.info("Hoy (%s) no es dia habil: no se actualiza.", hoy)
            return 0
        rangos = rangos_del_dia(hoy)

    logger.info("Hoy %s. Rangos: %s", hoy, ", ".join(f"{d} a {h}" for d, h in rangos))
    if args.simular:
        return 0

    if not (config.INFORME_BOT_EMAIL and config.INFORME_BOT_PASSWORD):
        logger.error("Faltan INFORME_BOT_EMAIL / INFORME_BOT_PASSWORD en las variables de entorno.")
        return 1

    fallidas = 0
    for desde, hasta in rangos:
        try:
            if not correr_rango(desde, hasta):
                fallidas += 1
        except Exception:
            logger.exception("Fallo la actualizacion %s a %s", desde, hasta)
            fallidas += 1

    logger.info("Fin: %s de %s rangos OK.", len(rangos) - fallidas, len(rangos))
    return 1 if fallidas else 0


if __name__ == "__main__":
    sys.exit(main())

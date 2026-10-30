# app/comun.py — Utilidades de transformacion.

from datetime import datetime
from zoneinfo import ZoneInfo

from app import config


def texto(valor):
    return None if valor is None or str(valor).strip() == "" else str(valor).strip()


def numero(valor):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        return float(str(valor).replace(",", "."))
    except (TypeError, ValueError):
        return None


def entero(valor):
    n = numero(valor)
    return int(n) if n is not None else None


def booleano(valor):
    return str(valor).upper() in ("T", "TRUE", "1", "Y")


def tz():
    return ZoneInfo(config.ZONA_HORARIA)


def ahora():
    return datetime.now(tz())


def fecha_hora(valor):
    """'2026-09-02 15:43:46' (hora de Argentina, como lo da NetSuite) -> datetime con zona."""
    s = texto(valor)
    if not s:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=tz())
        except ValueError:
            continue
    return None


def es_activo(estado, inactivo):
    """Establecimiento activo segun su estado de servicio (ver config.ESTADOS_ACTIVOS)."""
    if inactivo:
        return False
    if not estado:
        return None
    e = estado.upper().strip()
    if config.ESTADOS_ACTIVOS:
        return e in config.ESTADOS_ACTIVOS
    return "ACTIV" in e and "INACTIV" not in e and "SUSPEN" not in e and "BAJA" not in e

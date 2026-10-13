# app/fuentes/comun.py — Utilidades de transformacion compartidas.


def texto(valor):
    return None if valor is None or str(valor).strip() == "" else str(valor).strip()


def primera_palabra(valor):
    """'Presencial (Instalaciones de alta complejidad)' -> 'Presencial'."""
    return str(valor).split(" ", 1)[0] if valor else None


def sin_prefijo_dai(valor):
    """El Power BI quitaba el prefijo 'DAI ' del tecnico asignado."""
    if not valor:
        return None
    return valor.split("DAI ", 1)[1] if "DAI " in valor else valor


def numero(valor):
    if valor is None or str(valor).strip() == "":
        return None
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def entero(valor):
    n = numero(valor)
    return int(n) if n is not None else None

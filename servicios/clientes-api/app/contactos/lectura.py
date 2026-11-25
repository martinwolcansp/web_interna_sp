# app/contactos/lectura.py — Lectura de los exports de ByKom.
#
# Clientes cuenta     .XLS (formato Excel viejo, BIFF): una fila por cuenta de
#                     monitoreo. Se lee con xlrd.
# Clientes contactos  .xlsx: una fila por contacto de la lista de llamadas. Se
#                     lee con openpyxl en modo solo lectura (unas 143.000 filas).
#
# El tipo se reconoce por las columnas, no por el nombre del archivo.

import io
from datetime import date, datetime

COLUMNAS = {
    "cuentas": {"order_id", "id_cl", "nombre", "estado", "nombre_mix"},
    "contactos": {"order_id", "nombre", "nombre_dos", "telefonos"},
}


class ArchivoInvalido(Exception):
    pass


def _valor(v):
    """Celda -> texto limpio. Los numeros enteros que xlrd lee como float
    (100014991.0) vuelven a ser enteros; las fechas quedan en ISO."""
    if v is None:
        return None
    if isinstance(v, float):
        if v != v:  # NaN
            return None
        return str(int(v)) if v.is_integer() else str(v)
    if isinstance(v, (datetime, date)):
        return v.isoformat(sep=" ") if isinstance(v, datetime) else v.isoformat()
    s = str(v).strip()
    return s or None


def _tipo(cabecera):
    cols = {str(c).strip().lower() for c in cabecera if c is not None}
    # contactos se mira primero: tambien tiene order_id y nombre
    for tipo in ("contactos", "cuentas"):
        if COLUMNAS[tipo] <= cols:
            return tipo
    raise ArchivoInvalido(
        "No es un export de ByKom reconocido: faltan las columnas de Clientes cuenta "
        "(order_id, id_cl, nombre, estado) o de Clientes contactos (order_id, nombre_dos, telefonos).")


def _filas_xls(contenido):
    import xlrd
    try:
        libro = xlrd.open_workbook(file_contents=contenido)
    except Exception as e:
        raise ArchivoInvalido(f"No se pudo leer el archivo .xls: {e}")
    hoja = libro.sheet_by_index(0)
    if hoja.nrows < 1:
        raise ArchivoInvalido("El archivo esta vacio.")
    cab = [str(c).strip().lower() for c in hoja.row_values(0)]
    return cab, (hoja.row_values(r) for r in range(1, hoja.nrows))


def _filas_xlsx(contenido):
    import openpyxl
    try:
        libro = openpyxl.load_workbook(io.BytesIO(contenido), read_only=True, data_only=True)
    except Exception as e:
        raise ArchivoInvalido(f"No se pudo leer el archivo .xlsx: {e}")
    filas = libro.worksheets[0].iter_rows(values_only=True)
    try:
        cab = [str(c).strip().lower() if c is not None else "" for c in next(filas)]
    except StopIteration:
        raise ArchivoInvalido("El archivo esta vacio.")
    return cab, filas


def _abrir(contenido, nombre):
    n = (nombre or "").lower()
    if n.endswith(".xlsx"):
        return _filas_xlsx(contenido)
    if n.endswith(".xls"):
        return _filas_xls(contenido)
    raise ArchivoInvalido("Solo se aceptan archivos .xls o .xlsx exportados de ByKom.")


def tipo_de(contenido, nombre):
    """Reconoce el tipo leyendo solo la cabecera."""
    cab, _ = _abrir(contenido, nombre)
    return _tipo(cab)


def leer(contenido, nombre):
    """-> (tipo, filas como dict columna -> texto)."""
    cab, filas = _abrir(contenido, nombre)
    tipo = _tipo(cab)
    salida = []
    for valores in filas:
        fila = {c: _valor(v) for c, v in zip(cab, valores) if c}
        if fila.get("order_id"):
            salida.append(fila)
    if not salida:
        raise ArchivoInvalido("El archivo no tiene filas con order_id.")
    return tipo, salida

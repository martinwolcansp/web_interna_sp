# app/plan_accion.py — Categoria del plan de accion de cada baja.
#
# Replica la clasificacion del informe manual de bajas (Analisis_Bajas_
# Septiembre2026.xlsx, hoja "Plan de Accion"): por motivo de baja, y para
# "Otro" por el comentario del motivo. Validado con las bajas de septiembre
# 2026: mismas cantidades por categoria.
#
# La prioridad y la accion recomendada de cada categoria estan en la pagina
# (pages/clientes-activos/bajas.html, constante PLAN).

import unicodedata

MUDANZA = "Mudanza / relocalización"
INCOMUNICADOS = "Incomunicados"
REVISION = "Revisión manual"
ECONOMICA = "Baja económica"
COMPETENCIA = "Competencia"
INSATISFACCION = "Retención - insatisfacción"
DEFINITIVA = "Baja definitiva (fallecimiento/cierre)"
DEUDA = "Recuperación por deuda"

# (texto contenido en el motivo, categoria) — se evalua en orden
POR_MOTIVO = [
    ("MUDANZA", MUDANZA),
    ("INCOMUNICADO", INCOMUNICADOS),
    ("NO LO PUEDE PAGAR", ECONOMICA),
    ("COMPETENCIA", COMPETENCIA),
    ("DISCONFORME", INSATISFACCION),
    ("DEUDA", DEUDA),
    ("CERRO EL COMERCIO", DEFINITIVA),
    ("CIERRE", DEFINITIVA),
]

# Para motivo "Otro" (o sin motivo): palabras del comentario
POR_COMENTARIO = [
    ("FALLEC", DEFINITIVA),
]


def _norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.upper().split())


def categoria(motivo, comentario):
    m = _norm(motivo)
    for clave, cat in POR_MOTIVO:
        if clave in m:
            return cat
    c = _norm(comentario)
    for clave, cat in POR_COMENTARIO:
        if clave in c:
            return cat
    return REVISION

# app/fuentes/clasificacion_st.py — Categoria de los casos de Servicio Tecnico.
#
# El campo Comentarios tecnico (custevent_3k_comentarios_tecnico) es texto libre
# que describe el trabajo realizado: no sirve agrupar por texto (16.300 casos,
# 14.851 textos distintos). Cada caso recibe una categoria:
#
#   1. Del formulario estructurado, cuando exista (SERVICIO_TECNICO_CAMPO_CATEGORIA).
#   2. Si no, por palabras clave del comentario.
#   3. Si el comentario no alcanza, por palabras clave del titulo del caso.
#
# Reglas por palabras clave (validadas el 30/10/2026: 99,3% de los casos clasificados):
#   - "Visita no realizada": solo si el comentario lo dice al principio (los
#     comentarios largos con "recoordinar" suelen ser trabajos hechos que quedan pendientes).
#   - "Baja / desprogramacion": en cualquier parte del texto.
#   - Resto: gana la categoria cuya palabra aparece primero en el texto
#     ("se cambio bateria, tensiones normales, comunicacion correcta" -> Bateria).
#   - "Revision sin falla / asesoramiento": solo si no aparece ninguna otra.
#
# Tambien marca la vuelta planificada: el tecnico dejo pendiente volver
# ("recoordinar 2T para...", "llevar...", "queda pendiente"). La visita siguiente
# del cliente no es una reincidencia sino la continuacion del trabajo. No cuenta
# lo condicional ("si vuelve a fallar recoordinar..."): eso, si pasa, es reincidencia.
#
# Las categorias del formulario deberian ser las mismas que estas, para que el
# historico y los casos nuevos se puedan comparar.

import re
import unicodedata

VISITA_NO_REALIZADA = "Visita no realizada"
BAJA = "Baja / desprogramación"
SIN_FALLA = "Revisión sin falla / asesoramiento"
SIN_CLASIFICAR = "Sin clasificar"
SIN_COMENTARIO = "Sin comentario"

# Categorias que no son un servicio tecnico realizado (no cuentan en la recurrencia por defecto).
NO_SERVICIO = (VISITA_NO_REALIZADA, BAJA)

_VISITA = re.compile(r"recoordin|recordin|reecordin|ausente|no (se )?encontr\w* (al |el |la )?(titular|abonad|nadie)"
                     r"|no (habia|hay) nadie|no atendi|nadie|no se present|cancelad|anulad\w* por|suspend"
                     r"|no se pudo (ingresar|acceder|realizar)")
_BAJA = re.compile(r"desmont\w* (el |la )?(sistema|equipo)|desprogram|por baja|baja (de|del )?sistema"
                   r"|retir\w* (\w+ )?(bateria|equipo|equipos|central)\w* de sp|desmont\w* (la )?central")
CATEGORIAS = [
    ("Batería y alimentación", r"bater|tension|tensuon|fuente|trafo|alimentacion|corte de luz|transformador"),
    ("Comunicación", r"wifi|wi fi|wifk|lantrix|chip|comunicad|comunicac|incomunic|no comunica|comunico|\biot\b|gprs"
                     r"|\b[34]g|\bsim\b|senal|movistar|claro|radio|\bdx|linea telef|router|modem|nueva red|ethernet"
                     r"|\bip\b|\btest\b|transmi|puerto"),
    ("Teclado", r"teclado|tecldo|display"),
    ("Sensores y zonas", r"sensor|magn|\bmags?\b|infrar|\binfr|takex|barrera|\bzona|\bz ?[0-9]|resistencia|tamper"
                         r"|\bpir\b|detector|cortina|iman|humo|rotura|cazabobo|abertura"),
    ("Cableado", r"cable|empalme|cablea"),
    ("Sirena", r"sirena|bocina"),
    ("Cámaras / DVR", r"camara|\bdvr|\bnvr|cctv|hikvision|balun|grabac|\bxvr"),
    ("Control remoto / pánico", r"remoto|c/r|\bcr\b|llavero|panico|\bpila|\brx\b"),
    ("Central / programación / app", r"central|ce tral|placa|program|usuario|codigo|clave|contrase|configur|reset"
                                     r"|modulo|\bhora\b|\bapp\b|aplicacion|ajax|garnet|particion"),
]
_CATEGORIAS = [(c, re.compile(rx)) for c, rx in CATEGORIAS]
_SIN_FALLA = re.compile(r"explic|instruy|funcionamiento|funciona|todo ok|sin falla|normal|revis|prob[oa]|chequ|sistema ok")

_VUELTA = re.compile(r"recoordin|recordin|reecordin|coordinar|volver a (pasar|ir|venir)|hay que volver"
                     r"|queda pendiente|pendiente|\bllevar\b|regresar|segunda visita|otra visita")
# Frases condicionales: se quitan antes de buscar la vuelta planificada.
_CONDICIONAL = re.compile(r"(si (se )?(vuelve|sigue|persiste|continua|vuelven|siguen)|en caso)[^.;\n]*")

# Orden sugerido para mostrar (el resto, por cantidad).
ORDEN = [c for c, _ in CATEGORIAS] + [SIN_FALLA, VISITA_NO_REALIZADA, BAJA, SIN_CLASIFICAR, SIN_COMENTARIO]


def normalizar(texto):
    """Minusculas, sin acentos ni signos, espacios simples (con un espacio a cada lado)."""
    t = unicodedata.normalize("NFKD", texto or "").encode("ascii", "ignore").decode("ascii").lower()
    return " " + " ".join(re.sub(r"[^a-z0-9/]+", " ", t).split()) + " "


def por_palabras(texto):
    """Categoria por palabras clave, o None si no hay ninguna."""
    t = normalizar(texto)
    if not t.strip():
        return None
    if _VISITA.search(t[:45]):
        return VISITA_NO_REALIZADA
    if _BAJA.search(t):
        return BAJA
    mejor = None
    for categoria, rx in _CATEGORIAS:
        m = rx.search(t)
        if m and (mejor is None or m.start() < mejor[0]):
            mejor = (m.start(), categoria)
    if mejor:
        return mejor[1]
    return SIN_FALLA if _SIN_FALLA.search(t) else None


def vuelta_planificada(comentario, categoria):
    """El tecnico dejo pendiente volver (no aplica a visitas no realizadas ni bajas)."""
    if not comentario or categoria in NO_SERVICIO:
        return False
    t = unicodedata.normalize("NFKD", comentario).encode("ascii", "ignore").decode("ascii").lower()
    return bool(_VUELTA.search(normalizar(_CONDICIONAL.sub(" ", t))))


def clasificar(comentario, titulo, categoria_formulario=None):
    """Devuelve (categoria, origen). origen: formulario | comentario | titulo | None."""
    if categoria_formulario:
        return categoria_formulario, "formulario"
    cat = por_palabras(comentario)
    if cat:
        return cat, "comentario"
    cat = por_palabras(titulo)
    if cat:
        return cat, "titulo"
    return (SIN_CLASIFICAR if comentario else SIN_COMENTARIO), None

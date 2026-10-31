# app/areas/servicio_tecnico.py — Indicadores de Servicio Tecnico.
#
# Casos de soporte asignados a "Servicio Tecnico" en NetSuite (supportcase.assigned),
# creados desde SERVICIO_TECNICO_DESDE. No usa las tablas comunes de casos de
# instalacion (otro asignado y otros campos): guarda en su propia tabla
# ind_servicio_tecnico_caso (migracion_44).
#
# El foco del informe es:
#   1. Recurrencia de servicio tecnico por cliente (cantidad de servicios en una
#      ventana de dias), teniendo en cuenta el motivo.
#   2. Clasificacion de los servicios por problema.
# El problema sale del campo custevent_3k_comentarios_tecnico (texto libre con el
# trabajo realizado): se clasifica en categorias en app/fuentes/clasificacion_st.py.
# Ademas se guarda el campo Problema ST del caso (custevent_3k_problema_st) tal
# como viene de NetSuite, para filtrar y graficar por el.
# Cuando exista el formulario estructurado, su campo de categoria
# (SERVICIO_TECNICO_CAMPO_CATEGORIA) tiene prioridad sobre las palabras clave.
# Los indicadores (recurrencia, reincidencia, ranking de problemas) se calculan
# en pages/indicadores-area/servicio-tecnico.html.
#
# Asignado: si SERVICIO_TECNICO_ASIGNADO_A tiene ids (separados por coma) se
# usan esos; si no, se busca entre los asignados de los casos el que se llame
# SERVICIO_TECNICO_ASIGNADO_NOMBRE (sin distinguir mayusculas ni acentos).

import re
import unicodedata
from collections import Counter

from app import config, netsuite
from app import supabase_rest as sb
from app.fuentes import clasificacion_st
from app.fuentes.comun import entero, sin_prefijo_dai, texto

SECCION = "indicadores-servicio-tecnico"
TABLA = "ind_servicio_tecnico_caso"


def _normalizar(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode("ascii")
    return " ".join(s.lower().split())


def _desde():
    return config.SERVICIO_TECNICO_DESDE.isoformat()


def ids_asignado(log):
    """Ids de supportcase.assigned que corresponden a Servicio Tecnico."""
    if config.SERVICIO_TECNICO_ASIGNADO_A:
        ids = [int(x) for x in config.SERVICIO_TECNICO_ASIGNADO_A.split(",") if x.strip()]
        log(f"Asignado de Servicio Tecnico por configuracion: {ids}.")
        return ids
    filas = netsuite.suiteql(f"""
        SELECT DISTINCT sc.assigned AS id, BUILTIN.DF(sc.assigned) AS nombre
        FROM supportcase sc
        WHERE sc.datecreated >= TO_DATE('{_desde()}', 'YYYY-MM-DD')
          AND sc.assigned IS NOT NULL
        ORDER BY sc.assigned
    """)
    buscado = _normalizar(config.SERVICIO_TECNICO_ASIGNADO_NOMBRE)
    exactos = [f for f in filas if _normalizar(f.get("nombre")) == buscado]
    parecidos = [f for f in filas if buscado in _normalizar(f.get("nombre"))]
    elegidos = exactos or (parecidos if len(parecidos) == 1 else [])
    if not elegidos:
        candidatos = ", ".join(f"{f.get('id')} = {f.get('nombre')}" for f in parecidos) or "ninguno"
        raise RuntimeError(
            f"No se pudo identificar el asignado '{config.SERVICIO_TECNICO_ASIGNADO_NOMBRE}' "
            f"(parecidos: {candidatos}). Cargar el id en SERVICIO_TECNICO_ASIGNADO_A.")
    ids = sorted({int(f["id"]) for f in elegidos})
    log("Asignado de Servicio Tecnico: " + ", ".join(f"{f['id']} = {f.get('nombre')}" for f in elegidos) + ".")
    return ids


def _campo_formulario():
    """Columna SuiteQL de la categoria del formulario estructurado (si esta configurada)."""
    campo = config.SERVICIO_TECNICO_CAMPO_CATEGORIA
    if not campo:
        return ""
    if not re.fullmatch(r"custevent\w+", campo):
        raise RuntimeError(f"SERVICIO_TECNICO_CAMPO_CATEGORIA invalido: {campo}")
    return f",\n            BUILTIN.DF(sc.{campo})                              AS categoria_formulario"


# Codigo de sector en el nombre del tecnico: 3 mayusculas que empiezan con D
# (DST, DAA, DPE, DAI...), al principio ("DST Campioni C.") o al final ("Fabian Marcelo - DCA").
_PREFIJO_SECTOR = re.compile(r"^D[A-Z]{2}\s+")
_SUFIJO_SECTOR = re.compile(r"\s*-\s*D[A-Z]{2}$")


def sin_prefijo(tecnico):
    """'DST Campioni C.' -> 'Campioni C.'; 'Fabian Marcelo - DCA' -> 'Fabian Marcelo'."""
    t = sin_prefijo_dai(tecnico)
    if not t:
        return t
    return _SUFIJO_SECTOR.sub("", _PREFIJO_SECTOR.sub("", t)).strip() or t


def consulta(ids):
    lista = ", ".join(str(i) for i in ids)
    return f"""
        SELECT
            sc.id                                               AS caso_id,
            sc.casenumber                                       AS numero,
            sc.title                                            AS titulo,
            TO_CHAR(sc.datecreated, 'YYYY-MM-DD')               AS fecha_creacion,
            TO_CHAR(sc.enddate, 'YYYY-MM-DD')                   AS fecha_cerrada,
            c.id                                                AS cliente_id,
            c.altname                                           AS cliente,
            BUILTIN.DF(c.custentity_3k_nro_cuenta)              AS nro_cuenta,
            BUILTIN.DF(sc.custevent_3k_tecnico_asignado_caso)   AS tecnico,
            BUILTIN.DF(sc.custevent_3k_comentarios_tecnico)     AS problema,
            BUILTIN.DF(sc.custevent_3k_problema_st)             AS problema_st,
            BUILTIN.DF(sc.status)                               AS estado_caso,
            BUILTIN.DF(sc.category)                             AS categoria,
            BUILTIN.DF(sc.assigned)                             AS asignado_a{_campo_formulario()}
        FROM supportcase sc
        LEFT JOIN customer c ON c.id = sc.company
        WHERE sc.datecreated >= TO_DATE('{_desde()}', 'YYYY-MM-DD')
          AND sc.assigned IN ({lista})
        ORDER BY sc.id
    """


def filas(crudas, corrida_id):
    ahora = sb.ahora_iso()
    salida = []
    for f in crudas:
        problema, titulo = texto(f.get("problema")), texto(f.get("titulo"))
        categoria, origen = clasificacion_st.clasificar(problema, titulo, texto(f.get("categoria_formulario")))
        salida.append(fila(f, problema, titulo, categoria, origen, corrida_id, ahora))
    return salida


def fila(f, problema, titulo, categoria, origen, corrida_id, ahora):
    return {
        "caso_id": int(f["caso_id"]),
        "numero": texto(f.get("numero")),
        "titulo": titulo,
        "fecha_creacion": f.get("fecha_creacion"),
        "fecha_cerrada": f.get("fecha_cerrada"),
        "cliente_id": entero(f.get("cliente_id")),
        "cliente": texto(f.get("cliente")),
        "nro_cuenta": texto(f.get("nro_cuenta")),
        "tecnico": sin_prefijo(texto(f.get("tecnico"))),
        "problema": problema,
        "problema_st": texto(f.get("problema_st")),
        "categoria_problema": categoria,
        "categoria_origen": origen,
        "vuelta_planificada": clasificacion_st.vuelta_planificada(problema, categoria),
        "estado_caso": texto(f.get("estado_caso")),
        "categoria": texto(f.get("categoria")),
        "asignado_a": texto(f.get("asignado_a")),
        "corrida_id": corrida_id,
        "actualizado_en": ahora,
    }


def traer(log, corrida_id=None):
    ids = ids_asignado(log)
    resultado = filas(netsuite.suiteql(consulta(ids)), corrida_id)
    log(f"NetSuite: {len(resultado)} casos de Servicio Tecnico desde {_desde()} (asignados a {ids}).")
    return resultado


def actualizar(token, corrida_id, log, paso):
    paso("Consultando casos de Servicio Tecnico en NetSuite")
    casos = traer(log, corrida_id)
    if not casos:
        # Una respuesta vacia borraria todo lo cargado: se corta antes.
        raise RuntimeError("NetSuite no devolvio casos; no se actualiza para no dejar el informe vacio.")

    paso("Guardando casos")
    sb.upsert(token, TABLA, casos, "caso_id")
    sb.borrar_no_vistos(token, TABLA, corrida_id)

    sin_problema = sum(1 for c in casos if not c["problema"])
    sin_cliente = sum(1 for c in casos if not c["cliente_id"])
    origenes = Counter(c["categoria_origen"] or "sin clasificar" for c in casos)
    advertencias = []
    if sin_problema:
        log(f"{sin_problema} casos sin comentario tecnico cargado.")
    if sin_cliente:
        log(f"{sin_cliente} casos sin cliente.")
    log("Origen de la categoria: " + ", ".join(f"{k} {v}" for k, v in origenes.most_common()) + ".")
    stats = {
        "casos": len(casos),
        "clientes": len({c["cliente_id"] for c in casos if c["cliente_id"]}),
        "problemas": len({c["categoria_problema"] for c in casos}),
        "sin_problema": sin_problema,
        "sin_clasificar": origenes.get("sin clasificar", 0),
    }
    return stats, advertencias

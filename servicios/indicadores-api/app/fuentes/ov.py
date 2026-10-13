# app/fuentes/ov.py — OV de productos de los casos de instalacion y sus articulos.
#
# Tablas comunes:
#   ind_caso_ov        una fila por caso + OV   (replica la busqueda 2439, facturacion)
#   ind_caso_ov_linea  una fila por linea de OV (replica la busqueda 2833, articulos)
#
# Vinculo caso -> OV, igual que el join "Transaccion" de las busquedas de caso:
#   - el campo "OV de productos" del caso (custevent_3k_ov_de_productos), y
#   - las OV con alguna linea cuya "Orden de instalacion" (custcol_3k_orden_instalacion)
#     es el caso (OV adicionales: ampliaciones del mismo trabajo, etc.).
# Solo ordenes de venta con tipo de orden de venta = 1 (productos), como las
# busquedas. Validado el 13/10/2026 contra la 2833: 520 de 528 pares caso-OV iguales
# (las 8 restantes la busqueda las vincula por otra via; esta toma 7 que la busqueda no).
#
# La categoria del articulo sale de su nombre con las reglas de la consulta
# PatronesCategorias del Power BI (antes venia de la busqueda 2831, que solo
# se usaba para esto).

import unicodedata

from app import netsuite
from app import supabase_rest as sb
from app.fuentes.comun import entero, numero, texto

TABLA_OV = "ind_caso_ov"
TABLA_LINEA = "ind_caso_ov_linea"

# Lineas que no son articulos.
TIPOS_NO_ARTICULO = {"TaxItem", "Discount", "Subtotal", "Description", "Markup", "Payment", "Group", "EndGroup"}
# Categorias que no cuentan como elemento instalado.
CATEGORIAS_NO_ELEMENTO = {"Servicios", "Administrativo", "Interno"}
# El cable se vende por metro: sumarlo con los equipos inflaria el total.
SUBCATEGORIAS_NO_ELEMENTO = {"Cableado"}

# (patron, categoria, subcategoria, prioridad): copia de PatronesCategorias,
# mas dos patrones agregados (marcados) para articulos que caian mal.
PATRONES = [
    # 1 - Servicios
    ("INSTAL", "Servicios", "Instalación", 1),
    ("MANO DE OBRA", "Servicios", "Mano de Obra", 1),
    ("M.O.", "Servicios", "Mano de Obra", 1),
    ("MO -", "Servicios", "Mano de Obra", 1),
    ("AJUSTE", "Servicios", "Ajustes y Reparaciones", 1),
    ("REPARACION", "Servicios", "Ajustes y Reparaciones", 1),
    ("MIGRACION", "Servicios", "Migraciones", 1),
    ("RECONEXION", "Servicios", "Reconexiones", 1),
    ("HORA", "Servicios", "Vigilancia Física", 1),
    ("CUOTA", "Servicios", "Cuotas / Abonos", 1),
    ("ALQUILER", "Servicios", "Cuotas / Abonos", 1),
    # 2 - Administrativo
    ("FACT", "Administrativo", "Facturación", 2),
    ("ANTIC", "Administrativo", "Anticipos", 2),
    ("CHEQUE", "Administrativo", "Financiero", 2),
    ("DESCUENTO", "Administrativo", "Financiero", 2),
    ("RECARGO", "Administrativo", "Financiero", 2),
    ("PROVISORIO", "Administrativo", "Interno", 2),
    ("ABO", "Administrativo", "Abono", 2),
    # 3 - Kits
    ("KIT-", "Equipamiento", "Kits", 3),
    ("KIT ", "Equipamiento", "Kits", 3),
    ("COMERCIO SEGURO", "Equipamiento", "Kit Seguridad", 3),
    # 4 - Video
    ("CAMARA", "Equipamiento", "Cámaras", 4),
    ("DVR", "Equipamiento", "Grabadores", 4),
    ("NVR", "Equipamiento", "Grabadores", 4),
    ("DISCO", "Equipamiento", "Almacenamiento Video", 4),
    ("EZVIZ", "Equipamiento", "Cámaras", 4),
    ("TARJETA MEMORIA", "Equipamiento", "Almacenamiento Video", 4),  # agregado: si no, cae en Control de Acceso
    # 5 - Centrales / teclados / placas
    ("CENTRAL", "Equipamiento", "Centrales de Alarma", 5),
    ("PANEL", "Equipamiento", "Centrales de Alarma", 5),
    ("HUB", "Equipamiento", "Centrales de Alarma", 5),
    ("GARNET", "Equipamiento", "Centrales de Alarma", 5),
    ("PC732", "Equipamiento", "Centrales de Alarma", 5),
    ("PC-732T", "Equipamiento", "Centrales de Alarma", 5),
    ("TECLADO", "Equipamiento", "Teclado Alarma", 5),
    ("LCD732", "Equipamiento", "Teclado Alarma", 5),
    ("LED732", "Equipamiento", "Teclado Alarma", 5),
    ("K32", "Equipamiento", "Teclado Alarma", 5),
    ("PLACA", "Equipamiento", "Placa Electrónica", 5),
    # 6 - Sensores / sirenas / accesos
    ("PIR", "Equipamiento", "Sensor Movimiento", 6),
    ("INFRARROJO", "Equipamiento", "Sensor Movimiento", 6),
    ("INF", "Equipamiento", "Sensor Movimiento", 6),
    ("BARRERA", "Equipamiento", "Sensor Movimiento", 6),
    ("MAGNETICO", "Equipamiento", "Contacto Magnético", 6),
    ("BOTON DE PANICO", "Equipamiento", "Botón de Pánico", 6),
    ("BOTON REMOTO", "Equipamiento", "Control Remoto", 6),
    ("CONTROL REMOTO", "Equipamiento", "Control Remoto", 6),  # agregado: si no, cae en Interno (CONTROL)
    ("BOTON VERDE", "Equipamiento", "Botón de Emergencia", 6),
    ("BOTON DE VIDA", "Equipamiento", "Botón de Emergencia", 6),
    ("BLUETOOTH", "Equipamiento", "Botón de Emergencia", 6),
    ("LLAVERO", "Equipamiento", "Control Remoto", 6),
    ("ROTURA", "Equipamiento", "Detector Rotura Vidrio", 6),
    ("VIDRIO", "Equipamiento", "Detector Rotura Vidrio", 6),
    ("SHOCKTEC", "Equipamiento", "Detector Especial", 6),
    ("ANTIVIBRACION", "Equipamiento", "Detector Especial", 6),
    ("SIRENA INTERIOR", "Equipamiento", "Sirena", 6),
    ("SIRENA EXTERIOR", "Equipamiento", "Sirena", 6),
    ("FLASH", "Equipamiento", "Sirena", 6),
    # 7 - Incendio
    ("DETECTOR HUMO", "Equipamiento", "Detector Incendio", 7),
    ("DETECTOR DE HUMO", "Equipamiento", "Detector Incendio", 7),
    ("DETECTOR DE INCENDIO", "Equipamiento", "Detector Incendio", 7),
    ("DETECTOR DE CALOR", "Equipamiento", "Detector Incendio", 7),
    ("FOTOELECTRICO", "Equipamiento", "Detector Incendio", 7),
    ("TERMICO", "Equipamiento", "Detector Incendio", 7),
    ("BEAM", "Equipamiento", "Detector Incendio", 7),
    ("DIRECCIONABLE", "Equipamiento", "Detector Incendio", 7),
    ("OPTICO", "Equipamiento", "Detector Incendio", 7),
    ("2 HILOS", "Equipamiento", "Detector Incendio", 7),
    ("DETECTOR BOSCH", "Equipamiento", "Detector Incendio", 7),
    ("D7050", "Equipamiento", "Detector Incendio", 7),
    ("CENTRAL INCENDIO", "Equipamiento", "Sistema Incendio", 7),
    ("PULSADOR", "Equipamiento", "Sistema Incendio", 7),
    ("AVISADOR", "Equipamiento", "Sistema Incendio", 7),
    ("FPE-1000", "Equipamiento", "Sistema Incendio", 7),
    ("SIRENA DE INCENDIO", "Equipamiento", "Sirena Incendio", 7),
    ("STROBO", "Equipamiento", "Sirena Incendio", 7),
    ("BASE ", "Equipamiento", "Accesorio Incendio", 7),
    ("BASE DETECTOR", "Equipamiento", "Accesorio Incendio", 7),
    ("AEROSOL", "Equipamiento", "Accesorio Incendio", 7),
    ("HUMOTEST", "Equipamiento", "Accesorio Incendio", 7),
    ("TEMPERATURA", "Equipamiento", "Detector Temperatura", 7),
    ("TERMOVELOCIMETRICO", "Equipamiento", "Detector Temperatura", 7),
    ("SONDA", "Equipamiento", "Accesorio Sensor", 7),
    # 8 - Detectores especiales
    ("GAS", "Equipamiento", "Detector Gas", 8),
    ("MONOXIDO", "Equipamiento", "Detector Gas", 8),
    ("FUGA", "Equipamiento", "Detector Gas", 8),
    ("SISMICO", "Equipamiento", "Detector Especial", 8),
    ("METALES", "Equipamiento", "Detector Especial", 8),
    ("CALIDAD DEL AIRE", "Equipamiento", "Detector Especial", 8),
    # 9 - Comunicadores
    ("COMUNICADOR", "Equipamiento", "Comunicador", 9),
    ("GPRS", "Equipamiento", "Comunicador", 9),
    ("4G", "Equipamiento", "Comunicador", 9),
    ("LANTRIX", "Equipamiento", "Comunicador", 9),
    ("IP500", "Equipamiento", "Comunicador", 9),
    ("NANOCOMM", "Equipamiento", "Comunicador", 9),
    ("RECEPTOR", "Equipamiento", "Receptor RF", 9),
    ("TRANSMISOR", "Equipamiento", "Comunicador", 9),
    ("RADIO FULL ID", "Equipamiento", "Comunicador", 9),
    ("DX-25", "Equipamiento", "Comunicador", 9),
    ("AVL", "Equipamiento", "Comunicador", 9),
    ("MON IP", "Equipamiento", "Comunicador", 9),
    # 10 - Expansores / potencia
    ("EXPANSOR", "Equipamiento", "Expansor / Módulo", 10),
    ("MODULO", "Equipamiento", "Expansor / Módulo", 10),
    ("POPIT", "Equipamiento", "Expansor / Módulo", 10),
    ("RELE", "Equipamiento", "Expansor / Módulo", 10),
    ("CONTACTOR", "Equipamiento", "Módulo Potencia", 10),
    # 11 - Control de acceso
    ("CONTROLADORA", "Equipamiento", "Control de Acceso", 11),
    ("CONTROLADOR", "Equipamiento", "Control de Acceso", 11),
    ("LECTORA", "Equipamiento", "Control de Acceso", 11),
    ("PROXIMIDAD", "Equipamiento", "Control de Acceso", 11),
    ("TARJETA", "Equipamiento", "Control de Acceso", 11),
    ("RECONOCIMIENTO FACIAL", "Equipamiento", "Control de Acceso", 11),
    ("TAG", "Equipamiento", "Control de Acceso", 11),
    ("CERRADURA", "Equipamiento", "Control de Acceso", 11),
    # 12 - Infraestructura
    ("FUENTE", "Infraestructura", "Energía", 12),
    ("TRANSFORMADOR", "Infraestructura", "Energía", 12),
    ("BATERIA", "Infraestructura", "Energía", 12),
    ("UPS", "Infraestructura", "Energía", 12),
    ("SWITCH", "Infraestructura", "Redes", 12),
    ("POE", "Infraestructura", "Redes", 12),
    ("ROUTER", "Infraestructura", "Redes", 12),
    ("MESH", "Infraestructura", "Redes", 12),
    ("UBIQUITI", "Infraestructura", "Redes", 12),
    ("PATCH", "Infraestructura", "Redes", 12),
    ("JACK", "Infraestructura", "Redes", 12),
    ("FILTRO", "Infraestructura", "Redes", 12),
    ("BANDA ANCHA", "Infraestructura", "Redes", 12),
    ("CABLE", "Infraestructura", "Cableado", 12),
    ("UTP", "Infraestructura", "Cableado", 12),
    ("COAXIL", "Infraestructura", "Cableado", 12),
    ("ALAMBRE", "Infraestructura", "Cableado", 12),
    ("PORTERO", "Infraestructura", "Cableado", 12),
    ("BALUN", "Infraestructura", "Accesorio Video", 12),
    ("GABINETE", "Infraestructura", "Gabinetes y Soportes", 12),
    ("RACK", "Infraestructura", "Gabinetes y Soportes", 12),
    ("BANDEJA", "Infraestructura", "Gabinetes y Soportes", 12),
    ("SOPORTE", "Infraestructura", "Gabinetes y Soportes", 12),
    ("POSTE", "Infraestructura", "Gabinetes y Soportes", 12),
    ("ESTRUCTURA", "Infraestructura", "Gabinetes y Soportes", 12),
    ("TOTEM", "Infraestructura", "Gabinetes y Soportes", 12),
    ("OBRA SEGURA", "Infraestructura", "Obra Civil", 12),
    ("BASE DE CONCRETO", "Infraestructura", "Obra Civil", 12),
    # 13 - Cerco
    ("CERCO", "Equipamiento", "Cerco Eléctrico", 13),
    ("ELECTRIFICADOR", "Equipamiento", "Cerco Eléctrico", 13),
    ("VARILLA", "Equipamiento", "Cerco Eléctrico", 13),
    # 14 - Interno
    ("INVENTARIO", "Interno", "Inventario", 14),
    ("NO VENTA", "Interno", "No Vendible", 14),
    ("CONTROL", "Interno", "Control Interno", 14),
    ("SIM", "Interno", "Comunicaciones Internas", 14),
    ("DEVOLUCION", "Interno", "Movimiento Interno", 14),
    ("COMODATO", "Interno", "Comodato", 14),
    ("PRUEBA", "Interno", "Artículo Prueba", 14),
    ("SIN MODELO", "Interno", "No Clasificado Técnico", 14),
]
# El Power BI ordena los patrones alfabeticamente y despues elige la menor
# prioridad: a igual prioridad gana el primero en orden alfabetico.
_PATRONES_ORDEN = sorted(PATRONES, key=lambda p: (p[3], p[0]))


def _normalizar(nombre):
    """Mayusculas y sin tildes ni enie, como el Power Query (Á->A ... Ñ->N)."""
    t = (nombre or "").upper()
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn")


def clasificar(nombre):
    texto_art = _normalizar(nombre)
    for patron, categoria, subcategoria, _ in _PATRONES_ORDEN:
        if patron in texto_art:
            return categoria, subcategoria
    return "Sin Clasificar", "Sin Clasificar"


def cantidad_ajustada(articulo, cantidad):
    """Regla de la columna 'Cantidad Articulo' de la busqueda 2833: la mano de
    obra de media jornada ('MO... 1/2') cuenta 0,5."""
    if cantidad is None:
        return None
    if articulo and articulo.startswith("MO") and "1/2" in articulo:
        return cantidad / 2
    return cantidad


# ---------------------------------------------------------------------------
# Consultas
# ---------------------------------------------------------------------------
# Se consulta por listas de ids (de a LOTE_IDS): unir en una sola consulta los
# casos con todas las lineas de transacciones tarda mas de un minuto; asi son
# unos segundos.

LOTE_IDS = 300


def _lotes(ids):
    ids = sorted(set(int(i) for i in ids))
    for i in range(0, len(ids), LOTE_IDS):
        yield ",".join(str(x) for x in ids[i:i + LOTE_IDS])


def _vinculos(caso_ids):
    """Pares (caso_id, transaccion_id) de los casos pedidos, de cualquier tipo de
    transaccion (despues se quedan solo las OV de productos)."""
    pares = set()
    for lote in _lotes(caso_ids):
        for f in netsuite.suiteql(f"""
            SELECT sc.id AS caso_id, sc.custevent_3k_ov_de_productos AS tr_id
            FROM supportcase sc
            WHERE sc.id IN ({lote}) AND sc.custevent_3k_ov_de_productos IS NOT NULL
            ORDER BY sc.id
        """):
            pares.add((int(f["caso_id"]), int(f["tr_id"])))
        for f in netsuite.suiteql(f"""
            SELECT DISTINCT x.custcol_3k_orden_instalacion AS caso_id, x.transaction AS tr_id
            FROM transactionline x
            WHERE x.custcol_3k_orden_instalacion IN ({lote})
            ORDER BY x.custcol_3k_orden_instalacion, x.transaction
        """):
            pares.add((int(f["caso_id"]), int(f["tr_id"])))
    return pares


def _ov_productos(tr_ids):
    """Encabezado de las transacciones que son OV de productos (tipo 1)."""
    ovs = {}
    for lote in _lotes(tr_ids):
        for f in netsuite.suiteql(f"""
            SELECT
                t.id                                AS ov_id,
                t.tranid                            AS ov_numero,
                TO_CHAR(t.trandate, 'YYYY-MM-DD')   AS fecha_ov,
                BUILTIN.DF(t.status)                AS estado_ov,
                BUILTIN.DF(t.opportunity)           AS oportunidad,
                t.foreigntotal                      AS monto
            FROM transaction t
            WHERE t.id IN ({lote})
              AND t.type = 'SalesOrd'
              AND t.custbody_3k_tipo_orden_de_venta = 1
            ORDER BY t.id
        """):
            ovs[int(f["ov_id"])] = f
    return ovs


def _lineas(ov_ids):
    """Lineas (no mainline) de las OV, agrupadas por OV."""
    por_ov, vistas = {}, set()
    for lote in _lotes(ov_ids):
        for f in netsuite.suiteql(f"""
            SELECT
                tl.transaction                      AS ov_id,
                tl.id                               AS linea_id,
                tl.item                             AS item_id,
                BUILTIN.DF(tl.item)                 AS articulo,
                tl.itemtype                         AS item_tipo,
                -tl.quantity                        AS cantidad
            FROM transactionline tl
            WHERE tl.transaction IN ({lote})
              AND tl.mainline = 'F'
            ORDER BY tl.transaction, tl.id
        """):
            # SuiteQL pagina de a 1000 con offset: sin ORDER BY las paginas pueden
            # repetir o saltear filas. Ademas se descartan repetidos por las dudas.
            clave = (int(f["ov_id"]), int(f["linea_id"]))
            if clave in vistas:
                continue
            vistas.add(clave)
            por_ov.setdefault(clave[0], []).append(f)
    return por_ov


# ---------------------------------------------------------------------------
# Transformaciones
# ---------------------------------------------------------------------------

def filas_ov(crudas, corrida_id):
    return [{
        "caso_id": int(f["caso_id"]),
        "ov_id": int(f["ov_id"]),
        "ov_numero": texto(f.get("ov_numero")),
        "fecha_ov": f.get("fecha_ov"),
        "estado_ov": texto(f.get("estado_ov")),
        "oportunidad": texto(f.get("oportunidad")),
        "monto": numero(f.get("monto")),
        "corrida_id": corrida_id,
        "actualizado_en": sb.ahora_iso(),
    } for f in crudas]


def filas_lineas(crudas, corrida_id):
    salida = []
    for f in crudas:
        articulo = texto(f.get("articulo"))
        tipo = texto(f.get("item_tipo"))
        categoria, subcategoria = clasificar(articulo)
        es_mo = bool(articulo and articulo.startswith("MO"))
        salida.append({
            "caso_id": int(f["caso_id"]),
            "ov_id": int(f["ov_id"]),
            "linea_id": int(f["linea_id"]),
            "item_id": entero(f.get("item_id")),
            "articulo": articulo,
            "item_tipo": tipo,
            "cantidad": cantidad_ajustada(articulo, numero(f.get("cantidad"))),
            "categoria": categoria,
            "subcategoria": subcategoria,
            "es_mo": es_mo,
            "es_elemento": bool(articulo) and tipo not in TIPOS_NO_ARTICULO and not es_mo
                           and categoria not in CATEGORIAS_NO_ELEMENTO
                           and subcategoria not in SUBCATEGORIAS_NO_ELEMENTO,
            "corrida_id": corrida_id,
            "actualizado_en": sb.ahora_iso(),
        })
    return salida


# ---------------------------------------------------------------------------
# Extraccion y guardado
# ---------------------------------------------------------------------------

def traer(caso_ids, log, corrida_id=None):
    """OV de productos y sus lineas para los casos pedidos (los del alcance)."""
    pares = _vinculos(caso_ids)
    ovs = _ov_productos(tr for _, tr in pares)
    pares = sorted((c, o) for c, o in pares if o in ovs)
    lineas_ov = _lineas(ovs)

    filas_o = filas_ov([dict(ovs[o], caso_id=c) for c, o in pares], corrida_id)
    filas_l = filas_lineas([dict(l, caso_id=c) for c, o in pares for l in lineas_ov.get(o, [])], corrida_id)
    log(f"NetSuite: {len(ovs)} OV de productos en {len(pares)} pares caso-OV "
        f"({len({c for c, _ in pares})} casos con OV).")
    elementos = sum(1 for l in filas_l if l["es_elemento"])
    log(f"NetSuite: {len(filas_l)} lineas de OV ({elementos} de elementos instalados).")
    return filas_o, filas_l


def guardar(token, ovs, lineas, corrida_id):
    sb.upsert(token, TABLA_OV, ovs, "caso_id,ov_id")
    sb.borrar_no_vistos(token, TABLA_OV, corrida_id)
    sb.upsert(token, TABLA_LINEA, lineas, "caso_id,ov_id,linea_id")
    sb.borrar_no_vistos(token, TABLA_LINEA, corrida_id)

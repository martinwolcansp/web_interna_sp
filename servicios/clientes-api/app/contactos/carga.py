# app/contactos/carga.py — Una carga de un export de ByKom.
#
# Corre en segundo plano despues de que main.py guardo el respaldo en Storage
# y creo la fila en cnt_carga. Pasos:
#   1. Lee el archivo (lectura.py).
#   2. Lee el estado anterior de la tabla (cnt_bykom_cuenta o cnt_bykom_contacto).
#   3. Guarda las filas (upsert por order_id) con vigente = true.
#   4. Marca vigente = false lo que no vino (no se borra: queda la fecha en
#      no_vigente_desde) y registra en cnt_evento las altas, bajas y cambios.
#      En la primera carga de cada tipo no hay eventos: no hay contra que comparar.
#   5. Cierra la carga con sus estadisticas y borra los respaldos viejos.
#   6. Si ya hay cuentas y contactos cargados, recalcula la comparacion con
#      NetSuite (corrida 'contactos', origen automatica; app/informes/contactos.py).
#
# El avance se ve en cnt_carga.mensaje mientras estado = 'en_curso'.

import logging
from collections import defaultdict

from app import config
from app import supabase_rest as sb
from app.comun import fecha_hora
from app.contactos import lectura, telefonos

logger = logging.getLogger("clientes_contactos")

T_CARGA = "cnt_carga"
T_CUENTA = "cnt_bykom_cuenta"
T_CONTACTO = "cnt_bykom_contacto"
T_EVENTO = "cnt_evento"


def _fecha(valor):
    f = fecha_hora((valor or "")[:19])
    return f.isoformat() if f else None


# ---------- cuentas ----------

def _filas_cuentas(filas, carga_id, ts):
    salida = []
    for f in filas:
        estado = (f.get("estado") or "").strip().upper() or None
        salida.append({
            "order_id": f["order_id"],
            "id_cl": (f.get("id_cl") or "").strip().upper() or None,
            "nombre": f.get("nombre"),
            "nombre_dos": f.get("nombre_dos"),
            "nombre_mix": f.get("nombre_mix"),
            "domicilio": f.get("domicilio"),
            "ciudad": f.get("ciudad"),
            "estado": estado,
            "deshabilitada": estado == "DESHABILITADA",
            "ultima_senal": _fecha(f.get("fecha_mensaje")),
            "datos": {k: f.get(k) for k in ("particion", "contrato", "latitud", "longitud") if f.get(k)},
            "carga_id": carga_id,
            "vigente": True,
            "no_vigente_desde": None,
            "actualizado_en": ts,
        })
    return salida


def _eventos_cuentas(anteriores, nuevas, carga_id):
    previas = {a["order_id"]: a for a in anteriores if a.get("vigente")}
    actuales = {n["order_id"]: n for n in nuevas}
    eventos = []
    for oid, n in actuales.items():
        a = previas.get(oid)
        if not a:
            eventos.append({"tipo": "cuenta_nueva", "cuenta": n["id_cl"], "order_id": oid, "detalle": {"nombre": n["nombre_mix"]}})
        elif a.get("deshabilitada") != n["deshabilitada"]:
            eventos.append({"tipo": "cuenta_deshabilitada" if n["deshabilitada"] else "cuenta_habilitada",
                            "cuenta": n["id_cl"], "order_id": oid, "detalle": {"nombre": n["nombre_mix"]}})
    for oid, a in previas.items():
        if oid not in actuales:
            eventos.append({"tipo": "cuenta_eliminada", "cuenta": a.get("id_cl"), "order_id": oid, "detalle": {"nombre": a.get("nombre_mix")}})
    for e in eventos:
        e["carga_id"] = carga_id
    return eventos


# ---------- contactos ----------

def _filas_contactos(filas, carga_id, ts, cuentas_validas=None):
    """cuentas_validas: id_cl de las cuentas de ByKom ya cargadas. Si hay, la
    cuenta de un contacto se toma solo si el ultimo token de nombre_dos es una
    cuenta real (si no, 'CARLOS' o 'PABLO' pasarian por cuenta), y los
    genericos se cuentan sobre cuentas reales. Sin cuentas cargadas se toma el
    token tal cual (por eso conviene subir primero Clientes cuenta)."""
    def cuenta(f):
        c = telefonos.cuenta_de(f.get("nombre_dos"))
        return c if not cuentas_validas or c in cuentas_validas else None

    # Telefonos genericos: el mismo numero en muchas cuentas (policia, bomberos, UDEC).
    cuentas_por_tel = defaultdict(set)
    for f in filas:
        tel = telefonos.solo_digitos(f.get("telefonos"))
        c = cuenta(f)
        if tel and c:
            cuentas_por_tel[tel].add(c)
    genericos = {t for t, cs in cuentas_por_tel.items() if len(cs) >= config.GENERICO_MIN_CUENTAS}

    salida = []
    for f in filas:
        tel = telefonos.solo_digitos(f.get("telefonos"))
        salida.append({
            "order_id": f["order_id"],
            "cuenta": cuenta(f),
            "nombre": f.get("nombre"),
            "nombre_dos": f.get("nombre_dos"),
            "telefonos": f.get("telefonos"),
            "email": f.get("codigoemai"),
            "modificado_en": _fecha(f.get("fechahora")),
            "generico": bool(tel) and tel in genericos,
            "telefonos_norm": telefonos.normalizar(f.get("telefonos")),
            "carga_id": carga_id,
            "vigente": True,
            "no_vigente_desde": None,
            "actualizado_en": ts,
        })
    return salida, len(genericos)


def _eventos_contactos(anteriores, nuevos, carga_id):
    previos = {a["order_id"]: a for a in anteriores if a.get("vigente")}
    actuales = {n["order_id"]: n for n in nuevos}
    eventos = []
    for oid, n in actuales.items():
        a = previos.get(oid)
        if not a:
            eventos.append({"tipo": "contacto_nuevo", "cuenta": n["cuenta"], "order_id": oid,
                            "detalle": {"nombre": n["nombre"], "telefonos": n["telefonos"]}})
        elif telefonos.solo_digitos(a.get("telefonos")) != telefonos.solo_digitos(n["telefonos"]):
            eventos.append({"tipo": "telefono_cambiado", "cuenta": n["cuenta"], "order_id": oid,
                            "detalle": {"nombre": n["nombre"], "antes": a.get("telefonos"), "despues": n["telefonos"]}})
    for oid, a in previos.items():
        if oid not in actuales:
            eventos.append({"tipo": "contacto_eliminado", "cuenta": a.get("cuenta"), "order_id": oid,
                            "detalle": {"nombre": a.get("nombre"), "telefonos": a.get("telefonos")}})
    for e in eventos:
        e["carga_id"] = carga_id
    return eventos


# ---------- carga ----------

def ejecutar(token, carga_id, contenido, nombre):
    def paso(texto):
        logger.info("carga %s: %s", carga_id, texto)
        sb.patch(token, T_CARGA, {"id": f"eq.{carga_id}"}, {"mensaje": texto})

    try:
        ts = sb.ahora_iso()
        paso("Leyendo el archivo")
        tipo, filas = lectura.leer(contenido, nombre)

        if tipo == "cuentas":
            tabla = T_CUENTA
            paso("Leyendo la carga anterior")
            anteriores = sb.leer_todo(token, tabla, "order_id,id_cl,nombre_mix,deshabilitada,vigente")
            nuevas = _filas_cuentas(filas, carga_id, ts)
            eventos = _eventos_cuentas(anteriores, nuevas, carga_id) if anteriores else []
            desh = sum(1 for n in nuevas if n["deshabilitada"])
            stats = {"cuentas": len(nuevas), "habilitadas": len(nuevas) - desh, "deshabilitadas": desh}
        else:
            tabla = T_CONTACTO
            paso("Leyendo la carga anterior")
            anteriores = sb.leer_todo(token, tabla, "order_id,cuenta,nombre,telefonos,vigente")
            validas = {c["id_cl"] for c in sb.leer_todo(token, T_CUENTA, "id_cl", {"vigente": "eq.true"}) if c.get("id_cl")}
            paso("Normalizando telefonos")
            nuevas, n_gen = _filas_contactos(filas, carga_id, ts, validas)
            eventos = _eventos_contactos(anteriores, nuevas, carga_id) if anteriores else []
            validos = sum(1 for n in nuevas if not n["generico"] and any(t["calidad"] == "valido" for t in n["telefonos_norm"]))
            stats = {"contactos": len(nuevas), "con_cuenta": sum(1 for n in nuevas if n["cuenta"]),
                     "cuentas_validadas": bool(validas),
                     "genericos": sum(1 for n in nuevas if n["generico"]), "telefonos_genericos": n_gen,
                     "con_telefono_valido": validos}

        paso(f"Guardando {len(nuevas):,} filas".replace(",", "."))
        sb.upsert(token, tabla, nuevas, "order_id")
        paso("Marcando lo que ya no viene")
        sb.patch(token, tabla,
                 {"vigente": "eq.true", "or": f"(carga_id.is.null,carga_id.neq.{carga_id})"},
                 {"vigente": False, "no_vigente_desde": ts})
        if eventos:
            paso(f"Registrando {len(eventos)} cambios")
            sb.insertar(token, T_EVENTO, eventos)
        por_tipo = defaultdict(int)
        for e in eventos:
            por_tipo[e["tipo"]] += 1
        stats["eventos"] = dict(por_tipo)
        stats["primera_carga"] = not anteriores

        resumen = f"{stats.get('cuentas', stats.get('contactos')):,} filas cargadas".replace(",", ".")
        if anteriores:
            resumen += f"; {len(eventos)} cambios respecto de la carga anterior"
        sb.patch(token, T_CARGA, {"id": f"eq.{carga_id}"}, {
            "estado": "ok", "tipo": tipo, "filas": len(nuevas), "stats": stats,
            "mensaje": resumen, "procesado_en": sb.ahora_iso(),
        })
        _limpiar_respaldos(token)
        _recalcular_comparacion(token)
    except Exception as e:
        logger.exception("Fallo la carga %s", carga_id)
        try:
            sb.patch(token, T_CARGA, {"id": f"eq.{carga_id}"},
                     {"estado": "error", "mensaje": str(e)[:1000], "procesado_en": sb.ahora_iso()})
        except Exception:
            logger.exception("Tampoco se pudo registrar el error de la carga %s", carga_id)


def _limpiar_respaldos(token):
    """Borra de Storage los respaldos mas viejos que CARGAS_A_CONSERVAR (la fila
    de cnt_carga queda, con ruta = null)."""
    try:
        viejas = sb.leer_todo(token, T_CARGA, "id,ruta", {"ruta": "not.is.null"}, "subido_en.desc")[config.CARGAS_A_CONSERVAR:]
        if not viejas:
            return
        sb.borrar_objetos(token, config.BUCKET_BYKOM, [v["ruta"] for v in viejas])
        sb.patch(token, T_CARGA, {"id": f"in.({','.join(str(v['id']) for v in viejas)})"}, {"ruta": None})
    except Exception:
        logger.warning("No se pudieron borrar los respaldos viejos", exc_info=True)


def _recalcular_comparacion(token):
    """Corrida automatica de la comparacion, si ya estan los dos archivos."""
    from app import job  # import local: job -> informes -> contactos

    try:
        tipos = {c["tipo"] for c in sb.leer_todo(token, T_CARGA, "tipo", {"estado": "eq.ok"})}
        if not {"cuentas", "contactos"} <= tipos:
            logger.info("Comparacion pendiente: falta cargar %s", {"cuentas", "contactos"} - tipos)
            return
        sb.cerrar_corridas_colgadas(token, "contactos")
        if sb.corrida_en_curso(token, "contactos"):
            logger.info("Ya hay una comparacion en curso; no se dispara otra")
            return
        corrida = sb.crear_corrida(token, "contactos", origen="automatica")
        if corrida:
            job.ejecutar("contactos", corrida["id"], token)
    except Exception:
        logger.warning("No se pudo recalcular la comparacion despues de la carga", exc_info=True)

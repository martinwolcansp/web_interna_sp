# app/contactos/cruce.py — Propuesta de telefonos para NetSuite (cnt_propuesta).
#
# Cruza cli_establecimiento (id_bykom) con cnt_bykom_cuenta (order_id) y los
# contactos de cada cuenta (cnt_bykom_contacto.cuenta = id_cl). Para cada
# registro de NetSuite propone tres campos:
#   celular    altphone                          + custentity_ap_codigo_area_tel_celular
#   fijo       phone                             + custentity_ap_codigo_de_area_telefono
#   telefono2  custentity_ap_telefono_contacto2  + custentity_ap_codigo_area_tel_cont2
#
# Eleccion por cuenta (sin contactos genericos ni numeros invalidos):
#   celular    el primer celular, primero los del titular
#   fijo       el primer fijo, primero los del titular
#   telefono2  el mejor numero restante (celular antes que fijo)
# Titular = el contacto comparte una palabra del nombre con la cuenta.
#
# Establecimiento: los telefonos de su propia cuenta.
# Cliente principal: los de su mejor cuenta (habilitada antes que
# deshabilitada, establecimiento activo antes que inactivo).
#
# Accion de cada campo:
#   completar       NetSuite vacio, ByKom tiene numero      -> va al CSV
#   igual           el numero ya esta en NetSuite (en cualquiera de los campos)
#   distinto        NetSuite tiene otro numero              -> se revisa a mano
#   sin_dato        la cuenta no tiene numero valido (una fila por registro)
#   ya_no_en_bykom  la cuenta dejo de venir en la ultima carga (una fila por registro)
#
# Las marcas manuales (incluir de un 'distinto' revisado) se conservan si el
# numero propuesto no cambio.

import re

from app.contactos import telefonos

CAMPOS = {
    "celular": ("celular_car", "celular"),
    "fijo": ("telefono_car", "telefono"),
    "telefono2": ("telefono2_car", "telefono2"),
}
SEL_NS = "ns_id,entity_id,nombre,telefono,telefono_car,celular,celular_car,telefono2,telefono2_car"


def clave_ns(car, num):
    """Numero de NetSuite -> 10 digitos comparables (o lo que haya)."""
    car = re.sub(r"\D", "", str(car or "")).lstrip("0")
    num = re.sub(r"\D", "", str(num or ""))
    if num.startswith("54") and len(num) >= 12:
        num = num[2:]
    if num.startswith("9") and len(num) == 11:
        num = num[1:]
    if num.startswith("0"):
        num = num.lstrip("0")
    if car and num.startswith("15") and len(car) + len(num) - 2 == 10:
        num = num[2:]
    if car and len(car) + len(num) == 10:
        return car + num
    return num or None


def elegir(contactos, nombre_cuenta):
    """Contactos de una cuenta -> {campo: {car, num, tipo, contacto, nombre, titular}}."""
    pal_cuenta = telefonos.palabras(nombre_cuenta)
    candidatos = []
    for c in contactos:
        if c.get("generico"):
            continue
        titular = bool(pal_cuenta & telefonos.palabras(f"{c.get('nombre') or ''} {c.get('nombre_dos') or ''}"))
        for t in c.get("telefonos_norm") or []:
            if t.get("calidad") == "valido":
                candidatos.append({"car": t["car"], "num": t["num"], "tipo": t["tipo"], "contacto": c["order_id"],
                                   "nombre": " ".join(x for x in (c.get("nombre"), c.get("nombre_dos")) if x),
                                   "titular": titular, "orden": int(c["order_id"]) if str(c["order_id"]).isdigit() else 0})
    candidatos.sort(key=lambda x: (not x["titular"], x["orden"]))
    elegido, usados = {}, set()
    for campo, tipo in (("celular", "celular"), ("fijo", "fijo")):
        for x in candidatos:
            if x["tipo"] == tipo and x["car"] + x["num"] not in usados:
                elegido[campo] = x
                usados.add(x["car"] + x["num"])
                break
    for x in sorted(candidatos, key=lambda x: (x["tipo"] != "celular", not x["titular"], x["orden"])):
        if x["car"] + x["num"] not in usados:
            elegido["telefono2"] = x
            break
    return elegido


def _filas_registro(reg, tipo_registro, cliente_ns_id, cuenta, eleccion, estado_cuenta, previas, corrida_id, ts):
    base = {"ns_id": reg["ns_id"], "tipo_registro": tipo_registro, "cliente_ns_id": cliente_ns_id,
            "entity_id": reg.get("entity_id"), "nombre": reg.get("nombre"), "cuenta": cuenta,
            "corrida_id": corrida_id, "generado_en": ts}
    actuales = {campo: (reg.get(c), reg.get(n)) for campo, (c, n) in CAMPOS.items()}
    claves_ns = {clave_ns(*v) for v in actuales.values() if v[1]}
    vacio = {"propuesto_car": None, "propuesto_num": None, "fuente_contacto": None, "fuente_nombre": None,
             "es_titular": None, "incluir": False, "revisado_por": None, "revisado_en": None}

    if estado_cuenta == "no_vigente" or not eleccion:
        car, num = actuales["celular"]
        return [dict(base, **vacio, campo="celular", actual_car=car, actual_num=num,
                     accion="ya_no_en_bykom" if estado_cuenta == "no_vigente" else "sin_dato")]

    filas = []
    for campo, x in eleccion.items():
        car, num = actuales[campo]
        propuesto = x["car"] + x["num"]
        if propuesto in claves_ns:
            accion = "igual"
        elif not num:
            accion = "completar"
        else:
            accion = "distinto"
        fila = dict(base, campo=campo, actual_car=car, actual_num=num, propuesto_car=x["car"], propuesto_num=x["num"],
                    accion=accion, fuente_contacto=str(x["contacto"]), fuente_nombre=x["nombre"], es_titular=x["titular"],
                    incluir=accion == "completar", revisado_por=None, revisado_en=None)
        p = previas.get((reg["ns_id"], campo))
        if p and p.get("revisado_en") and p.get("propuesto_num") == x["num"] and accion in ("completar", "distinto"):
            fila.update(incluir=p.get("incluir"), revisado_por=p.get("revisado_por"), revisado_en=p.get("revisado_en"))
        filas.append(fila)
    return filas


def calcular(clientes, establecimientos, cuentas, contactos, previas, corrida_id, ts):
    """-> (filas de cnt_propuesta, estadisticas)."""
    cuenta_por_oid = {str(c["order_id"]): c for c in cuentas}
    por_cuenta = {}
    for c in contactos:
        if c.get("cuenta"):
            por_cuenta.setdefault(c["cuenta"], []).append(c)
    eleccion_cache = {}

    def eleccion(cta):
        if cta["id_cl"] not in eleccion_cache:
            eleccion_cache[cta["id_cl"]] = elegir(por_cuenta.get(cta["id_cl"], []), cta.get("nombre_mix"))
        return eleccion_cache[cta["id_cl"]]

    filas, propuestos = [], set()
    vinculados = {}  # cliente_ns_id -> [(prioridad, establecimiento, cuenta)]
    for e in establecimientos:
        cta = cuenta_por_oid.get(str(e.get("id_bykom") or ""))
        if not cta:
            continue  # sin ID ByKom o ID que nunca vino en una carga: no hay con que comparar
        estado = "no_vigente" if not cta.get("vigente") else "vigente"
        el = eleccion(cta) if estado == "vigente" else {}
        filas += _filas_registro(e, "establecimiento", e["cliente_ns_id"], cta["id_cl"], el, estado, previas, corrida_id, ts)
        propuestos.add(e["ns_id"])
        if estado == "vigente" and el:
            prioridad = (cta.get("deshabilitada", False), not e.get("activo"), e["ns_id"])
            vinculados.setdefault(e["cliente_ns_id"], []).append((prioridad, cta, el))

    clientes_con_cuenta = 0
    for c in clientes:
        if c["ns_id"] in propuestos:
            continue  # modelo viejo: el cliente es su propio establecimiento, ya tiene propuesta
        opciones = sorted(vinculados.get(c["ns_id"], []), key=lambda x: x[0])
        if not opciones:
            continue
        clientes_con_cuenta += 1
        _, cta, el = opciones[0]
        filas += _filas_registro(c, "cliente", c["ns_id"], cta["id_cl"], el, "vigente", previas, corrida_id, ts)

    stats = {"propuestas": len(filas), "establecimientos": len(propuestos), "clientes": clientes_con_cuenta}
    for f in filas:
        k = f"{f['tipo_registro']}_{f['accion']}"
        stats[k] = stats.get(k, 0) + 1
    stats["al_csv"] = sum(1 for f in filas if f["incluir"])
    return filas, stats

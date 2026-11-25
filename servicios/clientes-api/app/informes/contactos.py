# app/informes/contactos.py — Comparacion de telefonos ByKom -> NetSuite.
#
# Corrida "contactos" de cli_corrida: arma cnt_propuesta con app/contactos/cruce.py.
# La dispara el boton "Recalcular comparacion" de la pestaña Clientes activos +
# contactos y, sola, cada carga de un archivo de ByKom (app/contactos/carga.py).

from app import supabase_rest as sb
from app.contactos import SECCION, cruce  # noqa: F401 (SECCION la usa main.py)

USA_PERIODO = False
T_PROPUESTA = "cnt_propuesta"


def actualizar(token, corrida_id, log, paso, periodo=None):
    paso("Leyendo clientes y establecimientos")
    clientes = sb.leer_todo(token, "cli_cliente", cruce.SEL_NS, {"vigente": "eq.true"}, "ns_id")
    establecimientos = sb.leer_todo(token, "cli_establecimiento", cruce.SEL_NS + ",cliente_ns_id,id_bykom,activo",
                                    {"vigente": "eq.true"}, "ns_id")
    log(f"{len(clientes)} clientes y {len(establecimientos)} establecimientos de NetSuite")
    paso("Leyendo cuentas y contactos de ByKom")
    cuentas = sb.leer_todo(token, "cnt_bykom_cuenta", "order_id,id_cl,nombre_mix,deshabilitada,vigente", None, "order_id")
    contactos = sb.leer_todo(token, "cnt_bykom_contacto", "order_id,cuenta,nombre,nombre_dos,generico,telefonos_norm",
                             {"vigente": "eq.true", "cuenta": "not.is.null"}, "order_id")
    log(f"{len(cuentas)} cuentas y {len(contactos)} contactos de ByKom")
    avisos = []
    if not cuentas or not contactos:
        avisos.append("Faltan datos de ByKom: subí los archivos de cuentas y de contactos.")
    previas = {(p["ns_id"], p["campo"]): p for p in sb.leer_todo(
        token, T_PROPUESTA, "ns_id,campo,propuesto_num,incluir,revisado_por,revisado_en", {"revisado_en": "not.is.null"})}

    paso("Comparando telefonos")
    filas, stats = cruce.calcular(clientes, establecimientos, cuentas, contactos, previas, corrida_id, sb.ahora_iso())
    paso(f"Guardando {len(filas)} propuestas")
    sb.upsert(token, T_PROPUESTA, filas, "ns_id,campo")
    sb.borrar(token, T_PROPUESTA, {"or": f"(corrida_id.is.null,corrida_id.neq.{corrida_id})"})
    return stats, avisos

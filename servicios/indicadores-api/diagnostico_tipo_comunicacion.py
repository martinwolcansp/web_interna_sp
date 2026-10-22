# diagnostico_tipo_comunicacion.py — Por que la web encuentra tipo de comunicacion
# en muy pocos casos (13) y el Power BI en 62. Solo lee NetSuite.
#
#   python diagnostico_tipo_comunicacion.py
#
# Toma casos que en el Power BI tenian tipo de comunicacion y muestra, para cada
# uno: el presupuesto "Creado desde" segun el Power BI, el presupuesto al que
# llega la web (OV de productos -> custbody_3k_trans_orig_ov) y el valor de
# custbody_3k_tipo_comunicacion en cada uno. Ademas lista los campos del caso
# y del presupuesto que mencionan "comunic" o "creado".

from app import netsuite

# Caso, tipo de comunicacion y "Creado desde" segun el Power BI.
CASOS_PBI = [
    ("CAS_118049", "Radio", "PRE_SP24828"),
    ("CAS_118048", "Telefono", "PRE_SP24826"),
    ("CAS_118160", "Radio", "PRE_SP24872"),
    ("CAS_117879", "Telefono", "PRE_SP24750"),
]


def uno(sql):
    filas = netsuite.suiteql(sql)
    return filas[0] if filas else {}


def campos_interesantes(fila):
    return {k: v for k, v in fila.items() if "comunic" in k.lower() or "creado" in k.lower() or "created" in k.lower() or "orig" in k.lower()}


for numero, tipo_pbi, pre_pbi in CASOS_PBI:
    print(f"\n===== {numero} (Power BI: {tipo_pbi}, creado desde {pre_pbi}) =====")
    caso = uno(f"SELECT * FROM supportcase WHERE casenumber = '{numero}'")
    if not caso:
        print("  No se encontro el caso.")
        continue
    print("  Campos del caso:", campos_interesantes(caso))

    pres_pbi = uno(f"""SELECT t.id, t.tranid, t.custbody_3k_tipo_comunicacion AS tc_id,
                              BUILTIN.DF(t.custbody_3k_tipo_comunicacion) AS tc
                       FROM transaction t WHERE t.tranid = '{pre_pbi}'""")
    print("  Presupuesto del Power BI:", pres_pbi)

    ov_id = caso.get("custevent_3k_ov_de_productos")
    if ov_id:
        ov = uno(f"""SELECT t.id, t.tranid, t.custbody_3k_trans_orig_ov AS pres_id,
                            BUILTIN.DF(t.custbody_3k_tipo_comunicacion) AS tc
                     FROM transaction t WHERE t.id = {ov_id}""")
        print("  OV de productos:", ov)
        if ov.get("pres_id"):
            pres_web = uno(f"""SELECT t.id, t.tranid, BUILTIN.DF(t.custbody_3k_tipo_comunicacion) AS tc
                               FROM transaction t WHERE t.id = {ov['pres_id']}""")
            print("  Presupuesto al que llega la web:", pres_web)
    else:
        print("  El caso no tiene OV de productos.")

    if pres_pbi.get("id"):
        completo = uno(f"SELECT * FROM transaction WHERE id = {pres_pbi['id']}")
        print("  Campos del presupuesto (comunic/creado/orig):", campos_interesantes(completo))

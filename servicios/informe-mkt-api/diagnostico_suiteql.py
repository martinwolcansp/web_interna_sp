# diagnostico_suiteql.py — Prueba, una por una, las tablas y campos que usa la
# consulta del informe, para ver cual le falta permiso al rol.
# No escribe nada en NetSuite.
#
# Uso (carpeta informe-mkt-api, con el .env completo):
#     python diagnostico_suiteql.py

from app import netsuite

PRUEBAS = [
    ("Oportunidades (transaction)", "SELECT t.id, t.tranid, t.trandate FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Linea principal (transactionline)", "SELECT tl.transaction FROM transactionline tl WHERE tl.mainline = 'T' AND ROWNUM <= 1"),
    ("Subsidiaria de la linea", "SELECT BUILTIN.DF(tl.subsidiary) AS s FROM transactionline tl WHERE tl.mainline = 'T' AND ROWNUM <= 1"),
    ("Unidad de Negocio (clase)", "SELECT BUILTIN.DF(tl.class) AS c FROM transactionline tl WHERE tl.mainline = 'T' AND ROWNUM <= 1"),
    ("Representante (empleado)", "SELECT BUILTIN.DF(t.employee) AS e FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Estado de la oportunidad", "SELECT t.entitystatus, BUILTIN.DF(t.entitystatus) AS e FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Tipo de Proyecto", "SELECT BUILTIN.DF(t.custbody_3k_tipo_de_proyecto) AS p FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Tipo de establecimiento", "SELECT BUILTIN.DF(t.custbody_mw_sp_unidad_comercial) AS te FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Categoria", "SELECT BUILTIN.DF(t.custbody_3k_categoria) AS cat FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Comodato", "SELECT t.custbody_3k_comodato AS com FROM transaction t WHERE t.type = 'Opprtnty' AND ROWNUM <= 1"),
    ("Clientes (customer)", "SELECT c.id, c.entityid, c.companyname, c.altname, c.datecreated FROM customer c WHERE ROWNUM <= 1"),
    ("Origen de clientes potenciales", "SELECT BUILTIN.DF(c.leadsource) AS o FROM customer c WHERE ROWNUM <= 1"),
    ("Forma de Contacto con SP", "SELECT BUILTIN.DF(c.custentity_ap_sp_forma_de_contactoi) AS f FROM customer c WHERE ROWNUM <= 1"),
    ("ID CLIENTE CRM", "SELECT c.custentity_ghl_contact_id FROM customer c WHERE ROWNUM <= 1"),
]

for nombre, q in PRUEBAS:
    try:
        filas = netsuite.suiteql(q)
        print(f"OK     {nombre}: {filas[:1]}")
    except Exception as e:
        print(f"ERROR  {nombre}: {str(e)[-260:]}")

# diagnostico_oportunidad.py — Por qué una oportunidad entra o no en las
# comisiones (20/10/2026). Lee NetSuite con la misma integración del servicio
# (.env) y no escribe nada.
#
#   python diagnostico_oportunidad.py OPT_SP19146
#
# Revisa, con los mismos criterios que app/comisiones.py:
#   1. Que sea una oportunidad ganada del Informe de MKT: subsidiaria,
#      representante de ventas de la lista (netsuite.VENDEDORES) y estado
#      12 / 13. La fecha de la oportunidad define el mes en que se liquida.
#   2. Sus OV: vinculadas por la oportunidad o por el presupuesto de origen
#      (custbody_3k_trans_orig_ov). Solo cuentan las de tipo ABONOS
#      (Contrato); se toma la primera por fecha que no esté Cerrada.
#   3. Las líneas ABO de esa OV.

import sys

from app import netsuite
from app.comisiones import codigo_abono, es_ov_abonos

if len(sys.argv) != 2:
    sys.exit("Uso: python diagnostico_oportunidad.py OPT_SP19146")
numero = sys.argv[1].strip().replace("'", "")


def q(sql):
    return netsuite.suiteql(sql)


def ok(cond):
    return "OK " if cond else "NO "


opp = q(f"""
    SELECT t.id, t.tranid, TO_CHAR(t.trandate, 'YYYY-MM-DD') AS fecha, t.entitystatus AS estado_id,
           BUILTIN.DF(t.entitystatus) AS estado, t.employee AS rep_id, BUILTIN.DF(t.employee) AS rep,
           BUILTIN.DF(tl.subsidiary) AS subsidiaria, BUILTIN.DF(t.entity) AS cliente
    FROM transaction t
    INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'T'
    WHERE t.type = 'Opprtnty' AND t.tranid = '{numero}'""")
if not opp:
    sys.exit(f"No se encontró la oportunidad {numero} (¿número mal escrito?).")
o = opp[0]
rep = " ".join(str(o.get("rep") or "").split())
print(f"\nOportunidad {o['tranid']} (ID {o['id']}) · cliente {o.get('cliente')}")
print(f"  Fecha: {o['fecha']}  →  se liquida en el mes {o['fecha'][:7]} (la fecha de la oportunidad define el mes)")
print(f"  {ok(str(o.get('subsidiaria') or '').strip().endswith(netsuite.SUBSIDIARIA))}Subsidiaria: {o.get('subsidiaria')}")
print(f"  {ok(rep in netsuite.VENDEDORES)}Representante: {rep or '(vacío)'} (ID {o.get('rep_id')})"
      + ("" if rep in netsuite.VENDEDORES else f"  ← no está en la lista del Informe de MKT: {sorted(netsuite.VENDEDORES)}"))
ganada = str(o.get("estado_id")) in {str(e) for e in netsuite.ESTADOS_APROBADA}
print(f"  {ok(ganada)}Estado: {o.get('estado')} (ID {o.get('estado_id')}; ganada = {netsuite.ESTADOS_APROBADA})")

pres = q(f"SELECT e.id, e.tranid, TO_CHAR(e.trandate, 'YYYY-MM-DD') AS fecha FROM transaction e "
         f"WHERE e.type = 'Estimate' AND e.opportunity = {o['id']}")
print(f"\nPresupuestos de la oportunidad: {', '.join(p['tranid'] for p in pres) or 'ninguno'}")
ids_pres = ",".join(str(p["id"]) for p in pres) or "0"
ovs = q(f"""
    SELECT t.id, t.tranid, TO_CHAR(t.trandate, 'YYYY-MM-DD') AS fecha, BUILTIN.DF(t.status) AS estado,
           BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta) AS tipo, t.opportunity AS opp,
           BUILTIN.DF(t.custbody_3k_trans_orig_ov) AS presupuesto, BUILTIN.DF(t.employee) AS rep
    FROM transaction t
    WHERE t.type = 'SalesOrd' AND (t.opportunity = {o['id']} OR t.custbody_3k_trans_orig_ov IN ({ids_pres}))
    ORDER BY t.trandate, t.id""")
print(f"\nÓrdenes de venta vinculadas ({len(ovs)}):")
for v in ovs:
    vinc = "oportunidad" if str(v.get("opp")) == str(o["id"]) else f"presupuesto {v.get('presupuesto')}"
    print(f"  {ok(es_ov_abonos(v.get('tipo')))}{v['tranid']} · {v['fecha']} · {v.get('estado')} · tipo: {v.get('tipo') or '(vacío)'} · por {vinc}")
abonos = [v for v in ovs if es_ov_abonos(v.get("tipo"))]
if abonos:
    abiertas = [v for v in abonos if "CERRADA" not in str(v.get("estado") or "").upper()]
    elegida = (abiertas or abonos)[0]
    print(f"\nOV de abonos que se toma: {elegida['tranid']} (la primera por fecha que no está Cerrada)")
    lineas = q(f"SELECT BUILTIN.DF(tl.item) AS articulo, tl.foreignamount AS importe FROM transactionline tl "
               f"WHERE tl.transaction = {elegida['id']} AND tl.mainline = 'F' AND tl.item IS NOT NULL")
    abo = [l for l in lineas if str(l.get("articulo") or "").upper().startswith("ABO")]
    texto = ", ".join("%s ($%s)" % (codigo_abono(l["articulo"]), format(abs(float(l.get("importe") or 0)), ",.2f")) for l in abo)
    print("Líneas ABO: " + (texto or "ninguna"))

print("\nConclusión:")
if not (ganada and rep in netsuite.VENDEDORES and str(o.get("subsidiaria") or "").strip().endswith(netsuite.SUBSIDIARIA)):
    print("  No es una oportunidad ganada del Informe de MKT (ver los NO de arriba): no entra en ninguna liquidación.")
elif not ovs:
    print(f"  Es ganada de {o['fecha'][:7]}, pero no tiene OV vinculadas (ni por la oportunidad ni por sus presupuestos): figura en «Sin OV de abonos».")
elif not abonos:
    print(f"  Es ganada de {o['fecha'][:7]}, pero ninguna OV es de tipo ABONOS (Contrato): figura en «Sin OV de abonos».")
else:
    print(f"  Entra en la liquidación de {o['fecha'][:7]}. Si no aparece, revisar que la liquidación se haya generado después de cargar la OV "
          "y, si se generó con el mes en curso, regenerarla.")

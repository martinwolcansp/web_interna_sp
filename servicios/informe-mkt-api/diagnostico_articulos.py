# diagnostico_articulos.py - Pruebas previas al analisis de ticket promedio y
# composicion de ventas (13/11/2026). No escribe nada en NetSuite ni en Supabase.
#
# Revisa:
#   1. Permisos del rol sobre articulos (item), niveles de precio (pricelevel) y
#      precios (pricing).
#   2. Tamano del catalogo de articulos.
#   3. Volumen de OV y presupuestos (encabezados y lineas) del rango, para
#      dimensionar lo que habria que guardar.
#   4. Ganadas del rango (mismo criterio del Informe de MKT), sus OV por tipo y
#      sus presupuestos.
#   5. Catalogo completo y lista de precios (nivel 1, en pesos). Los articulos
#      de comodato (CC-XXX) se valorizan con el articulo de venta XXX.
#   6. Lineas de esas OV y presupuestos, por categoria (equipo, servicio,
#      descuento, ABO): importes en cero y cobertura del precio de referencia.
#   7. Ticket de prueba por segmento: real neto vs. valorizado a lista.
#   8. Equipos y servicios mas frecuentes con su precio de referencia.
#
# Uso (carpeta informe-mkt-api, con el .env completo):
#     python diagnostico_articulos.py 2026-09-01 2026-09-30
#
# Salidas: diagnostico_articulos_<desde>_<hasta>.json (resumen) y
#          diagnostico_articulos_<desde>_<hasta>_lineas.csv (una fila por linea,
#          separador ; para abrir en Excel).

import csv
import json
import sys
from collections import Counter, defaultdict
from datetime import date

from app import comisiones, netsuite

if len(sys.argv) != 3:
    sys.exit("Uso: python diagnostico_articulos.py AAAA-MM-DD AAAA-MM-DD")
desde, hasta = date.fromisoformat(sys.argv[1]), date.fromisoformat(sys.argv[2])
resumen = {"desde": str(desde), "hasta": str(hasta), "permisos": {}}


def titulo(t):
    print("\n" + "=" * 78 + "\n" + t + "\n" + "=" * 78)


def probar(nombre, q):
    """Ejecuta q; imprime OK/ERROR y devuelve las filas o None."""
    try:
        filas = netsuite.suiteql(q)
        print(f"OK     {nombre}: {len(filas)} filas. Ejemplo: {filas[:1]}")
        resumen["permisos"][nombre] = "OK"
        return filas
    except Exception as e:
        print(f"ERROR  {nombre}: {str(e)[-300:]}")
        resumen["permisos"][nombre] = "ERROR: " + str(e)[-300:]
        return None


def primera_que_funcione(opciones, log_nombre):
    """Prueba consultas de la mas completa a la mas simple."""
    ultimo = None
    for i, q in enumerate(opciones):
        try:
            filas = netsuite.suiteql(q)
            if i:
                print(f"AVISO  {log_nombre}: se uso la variante {i + 1} de {len(opciones)}.")
            return filas, i
        except Exception as e:
            ultimo = e
            print(f"AVISO  {log_nombre}, variante {i + 1}: {str(e)[-250:]}")
    raise RuntimeError(f"{log_nombre}: ninguna variante funciono. Ultimo error: {ultimo}")


def num(v):
    try:
        return abs(float(v)) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def es_abo(nombre):
    return str(nombre or "").strip().upper().startswith("ABO")


# --------------------------------------------------------------- 1. permisos
titulo("1. PERMISOS DEL ROL")
probar("Articulos (item)",
       "SELECT id, itemid, displayname, itemtype, isinactive FROM item WHERE ROWNUM <= 3")
campos_item = probar("Articulos: todos los campos (ver nombres)", "SELECT * FROM item WHERE ROWNUM <= 1")
if campos_item:
    print("       Campos disponibles en item:", ", ".join(sorted(campos_item[0].keys())))
probar("Articulos: clase", "SELECT id, BUILTIN.DF(class) AS clase FROM item WHERE ROWNUM <= 3")
probar("Articulos: campos de comodato / habilitado para venta",
       "SELECT id, custitem_3k_item_de_comodato AS comodato, custitem_3k_habilitado_para_venta AS venta "
       "FROM item WHERE ROWNUM <= 3")
precios_ej = probar("Precios por nivel (pricing)", "SELECT * FROM pricing WHERE ROWNUM <= 3")
monedas = probar("Monedas (currency)", "SELECT id, name, symbol FROM currency")
if monedas:
    print("       Monedas:", "; ".join(f"{m.get('id')}={m.get('name')} ({m.get('symbol')})" for m in monedas))
moneda_ars = next((str(m["id"]) for m in monedas or []
                   if "ARS" in str(m.get("symbol") or "").upper() or "PESO" in str(m.get("name") or "").upper()), None)
print(f"       Moneda que se toma como pesos: {moneda_ars or 'NO IDENTIFICADA (se usa 1)'}")
moneda_ars = moneda_ars or "1"
puede_item = resumen["permisos"].get("Articulos (item)") == "OK"
puede_pricing = resumen["permisos"].get("Precios por nivel (pricing)") == "OK"

# --------------------------------------------------------------- 2. catalogo
titulo("2. CATALOGO DE ARTICULOS")
if puede_item:
    try:
        filas = netsuite.suiteql("SELECT itemtype, isinactive, COUNT(*) AS n FROM item GROUP BY itemtype, isinactive")
        total = sum(int(f["n"]) for f in filas)
        print(f"Total de articulos: {total}")
        for f in sorted(filas, key=lambda x: -int(x["n"])):
            print(f"  {int(f['n']):6d}  {f.get('itemtype')}  {'inactivo' if f.get('isinactive') == 'T' else 'activo'}")
        resumen["catalogo"] = {"total": total, "por_tipo": filas}
    except Exception as e:
        print("ERROR contando articulos:", str(e)[-300:])
else:
    print("Sin permiso sobre item: no se puede medir el catalogo.")

# ---------------------------------------------------------------- 3. volumen
titulo("3. VOLUMEN DE OV Y PRESUPUESTOS DEL RANGO (todas, no solo las ganadas)")
rango = (f"t.trandate BETWEEN TO_DATE('{desde.isoformat()}', 'YYYY-MM-DD') "
         f"AND TO_DATE('{hasta.isoformat()}', 'YYYY-MM-DD')")
sub = f"BUILTIN.DF(tm.subsidiary) LIKE '%{netsuite.SUBSIDIARIA}'"
base_from = f"""
    FROM transaction t
    INNER JOIN transactionline tm ON tm.transaction = t.id AND tm.mainline = 'T'
    INNER JOIN transactionline tl ON tl.transaction = t.id AND tl.mainline = 'F' AND tl.item IS NOT NULL
    WHERE t.type IN ('SalesOrd', 'Estimate') AND {rango}"""
try:
    vol, var = primera_que_funcione([
        f"""SELECT t.type AS tipo, BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta) AS tipo_ov,
                   COUNT(DISTINCT t.id) AS transacciones, COUNT(*) AS lineas
            {base_from} AND {sub}
            GROUP BY t.type, BUILTIN.DF(t.custbody_3k_tipo_orden_de_venta)""",
        f"""SELECT t.type AS tipo, t.custbody_3k_tipo_orden_de_venta AS tipo_ov,
                   COUNT(DISTINCT t.id) AS transacciones, COUNT(*) AS lineas
            {base_from} AND {sub}
            GROUP BY t.type, t.custbody_3k_tipo_orden_de_venta""",
        f"""SELECT t.type AS tipo, COUNT(DISTINCT t.id) AS transacciones, COUNT(*) AS lineas
            {base_from}
            GROUP BY t.type""",
    ], "Volumen")
    if var == 2:
        print("(sin filtro de subsidiaria ni tipo de OV)")
    for f in sorted(vol, key=lambda x: (x.get("tipo") or "", x.get("tipo_ov") or "")):
        print(f"  {f.get('tipo'):9s} {str(f.get('tipo_ov') or '-'):40s} "
              f"{int(f['transacciones']):6d} transacciones  {int(f['lineas']):7d} lineas")
    resumen["volumen_rango"] = vol
except Exception as e:
    print("ERROR midiendo volumen:", str(e)[-300:])

# ------------------------------------------------------- 4. ganadas y sus OV
titulo("4. GANADAS DEL RANGO, SUS OV Y PRESUPUESTOS")
df = netsuite.traer_oportunidades(desde, hasta, print)
ganadas = df[df["Aprobada"] == 1] if len(df) else df
opps = {}
for _, r in ganadas.iterrows():
    com = r.get("Comodato")
    opps[int(r["ID interno"])] = {
        "oportunidad": comisiones._texto(r.get("Oportunidad")),
        "fecha": str(r.get("Fecha Oportunidad"))[:10],
        "tipo_establecimiento": comisiones._texto(r.get("Tipo de establecimiento")) or "Sin dato",
        "comodato": "Sin dato" if com in (None, "") or com != com else ("Comodato" if str(com).upper() == "T" else "Venta"),
        "creacion_cliente": str(r.get("Creación cliente potencial"))[:10],
    }
print(f"Ganadas: {len(opps)}")
print("  Por tipo de establecimiento:", dict(Counter(o["tipo_establecimiento"] for o in opps.values())))
print("  Por modalidad:", dict(Counter(o["comodato"] for o in opps.values())))
resumen["ganadas"] = len(opps)

ovs = comisiones._ovs_por_oportunidad(opps) if opps else {}
pres = comisiones._presupuestos_de(opps) if opps else {}
for ov_id, f in (comisiones._ovs_por_presupuesto(pres) if pres else {}).items():
    if ov_id in ovs:
        ovs[ov_id]["vinculo"] = "Ambos"
    else:
        ovs[ov_id] = f
for ov_id, f in ovs.items():  # oportunidad de cada OV
    opp = f.get("oportunidad_id")
    if opp in (None, "") and f.get("presupuesto_id") not in (None, ""):
        opp = pres.get(int(f["presupuesto_id"]), (None,))[0]
    f["opp"] = int(opp) if opp not in (None, "") else None

ovs_por_opp = defaultdict(list)
for ov_id, f in ovs.items():
    if f["opp"] in opps:
        ovs_por_opp[f["opp"]].append(f)
pres_por_opp = defaultdict(list)
for pid, (opp, _num) in pres.items():
    pres_por_opp[opp].append(pid)

print(f"OV vinculadas: {len(ovs)}   Presupuestos de las ganadas: {len(pres)}")
print("  OV por tipo / modalidad de la OV:")
for k, n in Counter((str(f.get("tipo_ov")), "Comodato" if comisiones._si(f.get("comodato")) else "Venta")
                    for f in ovs.values()).most_common():
    print(f"    {n:4d}  {k[0]}  ({k[1]})")
con_prod = sum(1 for o in opps if any("PRODUCTOS" in str(f.get("tipo_ov")).upper() for f in ovs_por_opp[o]))
con_ov = sum(1 for o in opps if ovs_por_opp[o])
con_pres = sum(1 for o in opps if pres_por_opp[o])
print(f"  Ganadas con alguna OV: {con_ov} de {len(opps)}")
print(f"  Ganadas con OV de PRODUCTOS (o PRODUCTOS y ABONOS): {con_prod} de {len(opps)}")
print(f"  Ganadas con presupuesto: {con_pres} de {len(opps)}")
print("  Cantidad de OV por ganada:", dict(sorted(Counter(len(ovs_por_opp[o]) for o in opps).items())))
print("  Cantidad de presupuestos por ganada:", dict(sorted(Counter(len(pres_por_opp[o]) for o in opps).items())))
resumen["ganadas_detalle"] = {"con_ov": con_ov, "con_ov_productos": con_prod, "con_presupuesto": con_pres,
                              "ov": len(ovs), "presupuestos": len(pres)}

# ------------------------------------------------- 5. catalogo y precios
titulo("5. CATALOGO COMPLETO Y LISTA DE PRECIOS (nivel 1 = precio base)")


def codigo(itemid):
    """'CEN019 Central ...' -> 'CEN019'; 'CC-CEN020 Central ...' -> 'CC-CEN020'."""
    partes = str(itemid or "").split()
    return partes[0].upper() if partes else ""


catalogo = {}
if puede_item:
    filas, _ = primera_que_funcione([
        """SELECT id, itemid, itemtype, isinactive, BUILTIN.DF(class) AS clase,
                  custitem_3k_item_de_comodato AS es_comodato, custitem_3k_habilitado_para_venta AS habilitado_venta
           FROM item""",
        "SELECT id, itemid, itemtype, isinactive FROM item",
    ], "Catalogo")
    for f in filas:
        catalogo[int(f["id"])] = dict(f, codigo=codigo(f.get("itemid")))
por_codigo = {}
for aid, f in catalogo.items():
    por_codigo.setdefault(f["codigo"], aid)
print(f"Articulos en el catalogo: {len(catalogo)}. "
      f"Marcados como item de comodato: {sum(1 for f in catalogo.values() if f.get('es_comodato') == 'T')}")

precios = defaultdict(dict)  # item -> {moneda: (cantidad_minima, precio)}
if puede_pricing:
    for f in netsuite.suiteql("SELECT item, currency, unitprice, quantity FROM pricing WHERE pricelevel = 1"):
        try:
            aid, mon, pu = int(f["item"]), str(f.get("currency")), float(f.get("unitprice"))
            q = float(f.get("quantity") or 1)
        except (TypeError, ValueError):
            continue
        if mon not in precios[aid] or q < precios[aid][mon][0]:
            precios[aid][mon] = (q, pu)
print("Articulos con precio base por moneda:",
      dict(Counter(m for p in precios.values() for m in p).most_common()))
print(f"Articulos con precio base en pesos (moneda {moneda_ars}) mayor a 0: "
      f"{sum(1 for p in precios.values() if p.get(moneda_ars, (0, 0))[1] > 0)}")


def precio_ars(aid):
    v = precios.get(aid, {}).get(moneda_ars)
    return v[1] if v and v[1] > 0 else None


def precio_referencia(aid):
    """(precio, origen): precio base en pesos del articulo; si es de comodato
    (CC-XXX) o no tiene precio, el del articulo de venta equivalente (XXX)."""
    p = precio_ars(aid)
    if p is not None:
        return p, "propio"
    cod = catalogo.get(aid, {}).get("codigo", "")
    if cod.startswith("CC-"):
        eq = por_codigo.get(cod[3:])
        if eq is not None and precio_ars(eq) is not None:
            return precio_ars(eq), f"equivalente {cod[3:]}"
        return None, "comodato sin equivalente con precio"
    return None, "sin precio"


# ------------------------------------------------------------- 6. lineas
titulo("6. LINEAS DE LAS OV Y PRESUPUESTOS DE LAS GANADAS")
trans_ids = list(ovs) + list(pres)
lineas = []
for lote in comisiones._lotes(trans_ids):
    filas, _ = primera_que_funcione([
        f"""SELECT tl.transaction AS trans_id, tl.id AS linea_id, tl.item AS articulo_id,
                   BUILTIN.DF(tl.item) AS articulo, tl.itemtype AS tipo_articulo,
                   tl.rate AS precio, tl.foreignamount AS importe, tl.quantity AS cantidad
            FROM transactionline tl
            WHERE tl.transaction IN ({lote}) AND tl.mainline = 'F' AND tl.item IS NOT NULL
              AND tl.taxline = 'F'
            ORDER BY tl.transaction, tl.id""",
        f"""SELECT tl.transaction AS trans_id, tl.id AS linea_id, tl.item AS articulo_id,
                   BUILTIN.DF(tl.item) AS articulo, tl.itemtype AS tipo_articulo,
                   tl.rate AS precio, tl.netamount AS importe, tl.quantity AS cantidad
            FROM transactionline tl
            WHERE tl.transaction IN ({lote}) AND tl.mainline = 'F' AND tl.item IS NOT NULL
            ORDER BY tl.transaction, tl.id""",
    ], "Lineas")
    lineas.extend(filas)
vistas = set()
lineas = [l for l in lineas if (k := (l["trans_id"], l["linea_id"])) not in vistas and not vistas.add(k)]
print(f"Lineas leidas: {len(lineas)}  Articulos distintos: {len({l.get('articulo_id') for l in lineas})}")

info_trans = {}
for ov_id, f in ovs.items():
    info_trans[int(ov_id)] = {"tipo": "OV", "numero": f.get("ov_numero"), "fecha": f.get("fecha_ov"),
                              "estado": f.get("estado_ov"), "tipo_ov": f.get("tipo_ov"),
                              "modalidad": "Comodato" if comisiones._si(f.get("comodato")) else "Venta",
                              "opp": f["opp"]}
for pid, (opp, numero) in pres.items():
    info_trans[int(pid)] = {"tipo": "Presupuesto", "numero": numero, "fecha": None, "estado": None,
                            "tipo_ov": None, "modalidad": opps.get(opp, {}).get("comodato"), "opp": opp}


def categoria(l):
    if es_abo(l.get("articulo")):
        return "ABO"
    t = l.get("tipo_articulo")
    if t == "Discount":
        return "Descuento"
    if t in ("Service", "OthCharge"):
        return "Servicio"
    return "Equipo"


def con_signo(v):
    """En SuiteQL las lineas de OV y presupuesto vienen en negativo: se invierte
    el signo, asi los descuentos quedan negativos."""
    try:
        return -float(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


filas_csv = []
grupos = defaultdict(lambda: {"lineas": 0, "importe_0": 0, "con_precio_ref": 0, "por_equivalente": 0})
sin_ref = Counter()
for l in lineas:
    t = info_trans.get(int(l["trans_id"]), {})
    o = opps.get(t.get("opp"), {})
    aid = int(l["articulo_id"]) if l.get("articulo_id") not in (None, "") else None
    cat = categoria(l)
    importe, cant = con_signo(l.get("importe")), num(l.get("cantidad"))
    ref, origen = precio_referencia(aid) if cat in ("Equipo", "Servicio") else (None, "-")
    g = grupos[(t.get("tipo"), cat, t.get("modalidad"))]
    g["lineas"] += 1
    g["importe_0"] += 1 if not importe else 0
    g["con_precio_ref"] += 1 if ref is not None else 0
    g["por_equivalente"] += 1 if origen.startswith("equivalente") else 0
    if cat in ("Equipo", "Servicio") and ref is None:
        sin_ref[(l.get("articulo"), origen)] += 1
    filas_csv.append({
        "opp_id": t.get("opp"), "oportunidad": o.get("oportunidad"), "fecha_oportunidad": o.get("fecha"),
        "tipo_establecimiento": o.get("tipo_establecimiento"), "modalidad_oportunidad": o.get("comodato"),
        "creacion_cliente": o.get("creacion_cliente"),
        "transaccion": t.get("tipo"), "numero": t.get("numero"), "fecha_transaccion": t.get("fecha"),
        "estado": t.get("estado"), "tipo_ov": t.get("tipo_ov"), "modalidad_transaccion": t.get("modalidad"),
        "articulo_id": aid, "codigo": catalogo.get(aid, {}).get("codigo"), "articulo": l.get("articulo"),
        "tipo_articulo": l.get("tipo_articulo"), "categoria": cat,
        "item_de_comodato": catalogo.get(aid, {}).get("es_comodato"),
        "cantidad": cant, "precio": num(l.get("precio")), "importe": importe,
        "precio_referencia": ref, "origen_precio": origen,
        "importe_referencia": round(ref * cant, 2) if ref is not None and cant else None,
    })

print(f"\n  {'transaccion / categoria / modalidad':45s} {'lineas':>7s} {'importe 0':>10s} {'con precio':>11s} {'x equivalente':>14s}")
for k, g in sorted(grupos.items(), key=lambda x: str(x[0])):
    print(f"  {' / '.join(str(x) for x in k):45s} {g['lineas']:7d} {g['importe_0']:10d} "
          f"{g['con_precio_ref']:11d} {g['por_equivalente']:14d}")
resumen["lineas"] = {" / ".join(str(x) for x in k): g for k, g in grupos.items()}
print("\n  Equipos y servicios sin precio de referencia (top 20):")
for (nombre, origen), n in sin_ref.most_common(20):
    print(f"    {n:4d}  {str(nombre)[:60]:60s} {origen}")

# ------------------------------------------------------------ 7. ticket
titulo("7. TICKET DE PRUEBA POR GANADA (lineas de sus OV, sin ABO)")
por_opp = defaultdict(lambda: defaultdict(float))
for f in filas_csv:
    if f["transaccion"] != "OV" or f["categoria"] == "ABO" or f["opp_id"] not in opps:
        continue
    p = por_opp[f["opp_id"]]
    p["real_neto"] += f["importe"] or 0
    p[f"real_{f['categoria']}"] += f["importe"] or 0
    if f["categoria"] in ("Equipo", "Servicio"):
        if f["importe_referencia"] is not None:
            p[f"lista_{f['categoria']}"] += f["importe_referencia"]
        else:
            p["sin_precio"] += 1
seg = defaultdict(list)
for oid, p in por_opp.items():
    o = opps[oid]
    seg[(o["tipo_establecimiento"], o["comodato"])].append(p)
print(f"Ganadas con productos en OV: {len(por_opp)} de {len(opps)}. Promedios por venta, en pesos con IVA excluido segun linea:")
print(f"  {'Segmento':28s} {'n':>3s} {'real neto':>12s} {'descuentos':>11s} {'equipos lista':>14s} "
      f"{'servicios lista':>16s} {'total lista':>12s} {'sin precio':>10s}")
for k, ps in sorted(seg.items(), key=lambda x: str(x[0])):
    n = len(ps)
    prom = lambda c: sum(p.get(c, 0) for p in ps) / n
    print(f"  {' / '.join(str(x) for x in k):28s} {n:3d} {prom('real_neto'):12,.0f} {prom('real_Descuento'):11,.0f} "
          f"{prom('lista_Equipo'):14,.0f} {prom('lista_Servicio'):16,.0f} "
          f"{prom('lista_Equipo') + prom('lista_Servicio'):12,.0f} {int(sum(p.get('sin_precio', 0) for p in ps)):10d}")

# ------------------------------------------------------- 8. frecuentes
titulo("8. EQUIPOS Y SERVICIOS MAS FRECUENTES")
frec = Counter((f["articulo_id"], f["articulo"], f["categoria"]) for f in filas_csv
               if f["categoria"] in ("Equipo", "Servicio"))
for (aid, nombre, cat), n in frec.most_common(30):
    ref, origen = precio_referencia(aid)
    print(f"  {n:4d}  {str(nombre)[:52]:52s} {cat:9s} ref: {'-' if ref is None else f'{ref:,.2f}':>14s}  {origen}")
print(f"Equipos y servicios distintos: {len(frec)}")

salida = f"diagnostico_articulos_{desde}_{hasta}"
with open(salida + ".json", "w", encoding="utf-8") as fh:
    json.dump(resumen, fh, ensure_ascii=False, indent=1, default=str)
if filas_csv:
    with open(salida + "_lineas.csv", "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(filas_csv[0].keys()), delimiter=";")
        w.writeheader()
        w.writerows(filas_csv)
print(f"\nResumen: {salida}.json   Lineas: {salida}_lineas.csv")

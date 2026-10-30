# diagnostico_clientes.py — Relevamiento de NetSuite para el mosaico Clientes activos.
#
# Se corre UNA vez desde la PC (con el .env completo), antes de la primera
# actualizacion. No toca Supabase. Responde:
#
#   1. Ids de los campos personalizados de la busqueda "SP Clientes Suspendidos
#      por Baja" (fecha de suspension Bykom, motivo de baja, comentarios, ...),
#      comparando los valores de establecimientos conocidos de la exportacion
#      de septiembre 2026. Sugiere las lineas CAMPO_* del .env.
#   2. Valores del estado de servicio y etapas de cliente (para ESTADOS_ACTIVOS
#      y CRITERIO_CLIENTES).
#   3. Cuentas ByKom reutilizadas: cuentas con mas de un establecimiento y el
#      estado de cada uno (queda registrado el cliente que se dio de baja?).
#   4. Historial (notas del sistema) de un establecimiento dado de baja: si
#      NetSuite guarda los cambios de estado y de fecha de suspension.
#
# Uso:  python diagnostico_clientes.py            (todo)
#       python diagnostico_clientes.py --rapido   (sin el punto 1, ya resuelto)
# Salida: pantalla + salida_prueba/diagnostico_clientes.json

import json
import os
import sys
import unicodedata

from app import config, netsuite

# Establecimientos de la exportacion de septiembre 2026 con los valores que se
# ven en el Excel (ResultadosSPClientesSuspendidosporBajaGonza758.xlsx).
CONOCIDOS = {
    15455: {"fecha_suspension": "2026-09-02", "motivo_baja": "CONTRATO COMPETENCIA",
            "comentarios_motivo": "BAJA YA TIENE OTRA EMPRESA", "estado_servicio": "SUSPENSION POR BAJA",
            "tipo_cliente": "ESTABLECIMIENTO", "nro_cuenta": "421721"},
    15461: {"fecha_suspension": "2026-09-15", "motivo_baja": "OTRO",
            "comentarios_motivo": "FALLECIO EL TIT", "estado_servicio": "SUSPENSION POR BAJA",
            "nro_cuenta": "42173"},
    16127: {"comentarios": "HUBO UN INCONVENIENTE CON ESTE CLIENTE"},
    20177: {"fecha_inicio_suspension": "2026-09-15", "duracion_suspension": "1",
            "estado_servicio": "SUSPENSION POR DEUDA", "motivo_baja": "SUSPENSION POR DEUDA"},
    17750: {"fecha_inicio_suspension": "2023-10-23", "duracion_suspension": "999"},
}

SALIDA = {}


def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode()
    return " ".join(s.upper().split())


def q(titulo, consulta, mostrar=20):
    print(f"\n--- {titulo}")
    try:
        filas = netsuite.suiteql(consulta)
    except RuntimeError as e:
        print(f"ERROR: {e}")
        SALIDA[titulo] = {"error": str(e)}
        return None
    for f in filas[:mostrar]:
        print("  ", json.dumps(f, ensure_ascii=False))
    if len(filas) > mostrar:
        print(f"   ... ({len(filas)} filas)")
    SALIDA[titulo] = filas
    return filas


def detectar_campos():
    print("\n=== 1. Campos personalizados de los establecimientos conocidos")
    ids = ", ".join(str(i) for i in CONOCIDOS)
    filas = netsuite.suiteql(f"SELECT * FROM customer WHERE id IN ({ids}) ORDER BY id")
    campos = sorted({k for f in filas for k, v in f.items()
                     if k.startswith("custentity") and v not in (None, "")})
    print(f"{len(campos)} campos custentity con valor: {', '.join(campos)}")
    # Texto de cada campo (BUILTIN.DF resuelve listas; en texto devuelve el valor)
    textos = {}
    for campo in campos:
        try:
            r = netsuite.suiteql(f"SELECT id, BUILTIN.DF(c.{campo}) AS t, c.{campo} AS v FROM customer c "
                                 f"WHERE c.id IN ({ids}) ORDER BY c.id")
        except RuntimeError:
            r = [{"id": f["id"], "t": f.get(campo), "v": f.get(campo)} for f in filas]
        for x in r:
            textos.setdefault(int(x["id"]), {})[campo] = x.get("t") if x.get("t") not in (None, "") else x.get("v")
    SALIDA["campos_por_registro"] = textos
    for i, valores in textos.items():
        print(f"\n  Registro {i}:")
        for campo, t in valores.items():
            print(f"    {campo:45s} {str(t)[:90]}")

    sugerencias = {}
    for alias in ("fecha_suspension", "motivo_baja", "comentarios_motivo", "comentarios", "estado_servicio",
                  "tipo_cliente", "nro_cuenta", "fecha_inicio_suspension", "duracion_suspension"):
        votos = {}
        for i, esperado in CONOCIDOS.items():
            if alias not in esperado:
                continue
            for campo, t in textos.get(i, {}).items():
                tn = norm(t)
                a, m, d = esperado[alias].split("-") if alias.startswith("fecha") else ("", "", "")
                dmy = f"{int(d)}/{int(m)}/{a}" if a else None
                if norm(esperado[alias]) in tn or (dmy and dmy in str(t)):
                    votos[campo] = votos.get(campo, 0) + 1
        if votos:
            sugerencias[alias] = max(votos, key=votos.get)
    print("\n=== Sugerencia para el .env (revisar):")
    nombres = {"fecha_suspension": "CAMPO_FECHA_SUSPENSION", "motivo_baja": "CAMPO_MOTIVO_BAJA",
               "comentarios_motivo": "CAMPO_COMENTARIOS_MOTIVO", "comentarios": "CAMPO_COMENTARIOS",
               "estado_servicio": "CAMPO_ESTADO_SERVICIO", "tipo_cliente": "CAMPO_TIPO_CLIENTE",
               "nro_cuenta": "CAMPO_NRO_CUENTA", "fecha_inicio_suspension": "CAMPO_FECHA_INICIO_SUSPENSION",
               "duracion_suspension": "CAMPO_DURACION_SUSPENSION"}
    for alias, var in nombres.items():
        print(f"{var}={sugerencias.get(alias, '')}" + ("" if alias in sugerencias else "    # no detectado"))
    SALIDA["sugerencias_env"] = {nombres[a]: c for a, c in sugerencias.items()}
    return sugerencias


def main():
    os.makedirs("salida_prueba", exist_ok=True)
    print("Cuenta NetSuite:", config.NETSUITE_ACCOUNT_ID)
    sug = {} if "--rapido" in sys.argv else detectar_campos()
    estado = sug.get("estado_servicio") or config.CAMPO_ESTADO_SERVICIO
    cuenta = sug.get("nro_cuenta") or config.CAMPO_NRO_CUENTA
    fecha = sug.get("fecha_suspension") or config.CAMPO_FECHA_SUSPENSION

    print("\n=== 2. Etapas y estados")
    q("Clientes por etapa (searchstage)",
      "SELECT c.searchstage AS etapa, COUNT(*) AS n FROM customer c GROUP BY c.searchstage ORDER BY 2 DESC")
    q("Etapa Cliente: con y sin parent",
      "SELECT CASE WHEN c.parent IS NULL THEN 'principal' ELSE 'subcliente' END AS nivel, COUNT(*) AS n "
      f"FROM customer c WHERE {config.CRITERIO_CLIENTES} "
      "GROUP BY CASE WHEN c.parent IS NULL THEN 'principal' ELSE 'subcliente' END")
    q(f"Valores de {estado} (estado de servicio)",
      f"SELECT c.{estado} AS id, BUILTIN.DF(c.{estado}) AS estado, COUNT(*) AS n FROM customer c "
      f"GROUP BY c.{estado}, BUILTIN.DF(c.{estado}) ORDER BY 3 DESC", 50)
    q("Clientes principales con cuenta ByKom en su propio registro",
      f"SELECT COUNT(*) AS n FROM customer c WHERE c.parent IS NULL AND c.{cuenta} IS NOT NULL")

    print("\n=== 3. Cuentas ByKom reutilizadas")
    rep = q("Cuentas con mas de un establecimiento",
            f"SELECT c.{cuenta} AS cuenta_id, COUNT(*) AS n FROM customer c WHERE c.{cuenta} IS NOT NULL "
            f"GROUP BY c.{cuenta} HAVING COUNT(*) > 1 ORDER BY 2 DESC", 10)
    q("Totales de cuentas",
      f"SELECT COUNT(*) AS establecimientos, COUNT(DISTINCT c.{cuenta}) AS cuentas FROM customer c "
      f"WHERE c.{cuenta} IS NOT NULL")
    if rep:
        # Se saltea la cuenta "42" (70 registros: dato incompleto, no reutilizacion)
        ids = ", ".join("'" + str(r["cuenta_id"]).replace("'", "''") + "'" for r in [x for x in rep if len(str(x["cuenta_id"])) > 2][:15])
        extra = f", TO_CHAR(c.{fecha}, 'YYYY-MM-DD') AS fecha_suspension" if fecha else ""
        q("Detalle de las primeras 15 cuentas reutilizadas",
          f"SELECT BUILTIN.DF(c.{cuenta}) AS cuenta, c.id, c.entityid, c.altname, BUILTIN.DF(c.custentity_3k_id_bykom) AS id_bykom, "
          f"TO_CHAR(c.datecreated, 'YYYY-MM-DD') AS creado, c.isinactive, BUILTIN.DF(c.{estado}) AS estado{extra} "
          f"FROM customer c WHERE c.{cuenta} IN ({ids}) ORDER BY c.{cuenta}, c.datecreated", 60)

    print("\n=== 4. Historial de un establecimiento dado de baja (15455, C00404-1)")
    r = q("Notas del sistema de 15455",
          "SELECT TO_CHAR(sn.date, 'YYYY-MM-DD HH24:MI') AS fecha, sn.field, sn.oldvalue, sn.newvalue "
          "FROM systemnote sn WHERE sn.recordid = 15455 AND sn.recordtypeid = -2 ORDER BY sn.date", 60)
    if r is None:
        q("Notas del sistema de 15455 (sin tipo de registro)",
          "SELECT TO_CHAR(sn.date, 'YYYY-MM-DD HH24:MI') AS fecha, sn.field, sn.oldvalue, sn.newvalue "
          "FROM systemnote sn WHERE sn.recordid = 15455 ORDER BY sn.date", 60)

    q("Notas del sistema: cualquier registro (permiso del rol)",
      "SELECT sn.recordtypeid, COUNT(*) AS n FROM systemnote sn WHERE ROWNUM <= 5000 GROUP BY sn.recordtypeid")

    if fecha:
        print("\n=== 5. Bajas de septiembre 2026 con los campos detectados (la exportacion del 30/10 tenia 116)")
        q("Bajas 09/2026 por estado",
          f"SELECT BUILTIN.DF(c.{estado}) AS estado, COUNT(*) AS n FROM customer c "
          f"WHERE c.{fecha} >= TO_DATE('2026-09-01', 'YYYY-MM-DD') AND c.{fecha} < TO_DATE('2026-10-01', 'YYYY-MM-DD') "
          f"GROUP BY BUILTIN.DF(c.{estado}) ORDER BY 2 DESC")

    with open("salida_prueba/diagnostico_clientes.json", "w", encoding="utf-8") as f:
        json.dump(SALIDA, f, ensure_ascii=False, indent=1, default=str)
    print("\nListo. Detalle en salida_prueba/diagnostico_clientes.json")


if __name__ == "__main__":
    sys.exit(main())

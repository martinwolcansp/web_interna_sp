# probar_conexiones.py — Prueba las conexiones del servicio ANTES de desplegarlo en Coolify.
#
# Uso (en la PC, parado en la carpeta informe-mkt-api, con un archivo .env
# completo segun .env.example):
#     pip install -r requirements.txt
#     python probar_conexiones.py --desde 2026-09-01 --hasta 2026-09-30
#
# No escribe nada en ningun lado: solo lee de NetSuite, GHL y Supabase.

import argparse
import sys
from datetime import date, timedelta

import requests

from app import config, netsuite
from app.job import limites_del_rango


def ok(msg):
    print(f"  OK  {msg}")


def falla(msg):
    print(f"  ERROR  {msg}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--desde", required=True, help="YYYY-MM-DD")
    ap.add_argument("--hasta", required=True, help="YYYY-MM-DD")
    args = ap.parse_args()
    desde, hasta = date.fromisoformat(args.desde), date.fromisoformat(args.hasta)
    errores = 0

    print("1) NetSuite: token M2M")
    try:
        netsuite.obtener_token()
        ok(f"token obtenido: {netsuite._token_cache.get('detalle')}")
    except Exception as e:
        falla(e)
        errores += 1

    print("2) NetSuite: oportunidades via SuiteQL")
    try:
        df = netsuite.traer_oportunidades(desde, hasta, lambda m: None)
        ok(f"{len(df)} filas, columnas: {list(df.columns)}")
        if len(df):
            print("     primera fila:", df.iloc[0].to_dict())
            con_crm = df["ID CLIENTE CRM"].notna().sum()
            ok(f"{con_crm} de {len(df)} filas con ID CLIENTE CRM")
        else:
            print("     AVISO: 0 oportunidades en el rango para los representantes de la busqueda.")
    except Exception as e:
        falla(e)
        errores += 1

    print("3) GHL: token y location")
    try:
        r = requests.get(
            "https://services.leadconnectorhq.com/opportunities/search",
            headers={"Authorization": f"Bearer {config.GHL_API_TOKEN}", "Version": "v3", "Accept": "application/json"},
            params={"locationId": config.GHL_LOCATION_ID, "status": "all", "limit": 1},
            timeout=30,
        )
        if r.status_code == 200:
            ok(f"oportunidades en la cuenta: {r.json().get('meta', {}).get('total')}")
        else:
            falla(f"{r.status_code} {r.text[:200]}")
            errores += 1
    except Exception as e:
        falla(e)
        errores += 1

    print("4) Supabase: URL y anon key")
    try:
        r = requests.get(f"{config.SUPABASE_URL}/auth/v1/health", headers={"apikey": config.SUPABASE_ANON_KEY}, timeout=15)
        if r.status_code == 200:
            ok("Supabase responde")
        else:
            falla(f"{r.status_code} {r.text[:200]}")
            errores += 1
    except Exception as e:
        falla(e)
        errores += 1

    inicio, fin_excl = limites_del_rango(desde, hasta)
    print(f"\nRango probado: {inicio.isoformat()} a {(fin_excl - timedelta(seconds=1)).isoformat()}")
    print("Todo OK." if not errores else f"{errores} prueba(s) con error.")
    sys.exit(1 if errores else 0)


if __name__ == "__main__":
    main()

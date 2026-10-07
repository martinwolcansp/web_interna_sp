# app/config.py — Configuracion del servicio indicadores-api.
# Todo sale de variables de entorno (Coolify). Nunca hardcodear tokens aca.

import os
from datetime import date

from dotenv import load_dotenv

load_dotenv()

# ---------- NetSuite (OAuth 2.0 Client Credentials / M2M + SuiteQL) ----------
# Misma integracion que informe-mkt-api ("SP Servicios internos M2M", rol
# SP WEB SERVICE INTEGRATION). Se puede reutilizar su certificado o subir uno propio.
NETSUITE_ACCOUNT_ID = os.getenv("NETSUITE_ACCOUNT_ID", "")
NETSUITE_CLIENT_ID = os.getenv("NETSUITE_CLIENT_ID")
NETSUITE_CERT_ID = os.getenv("NETSUITE_CERT_ID")
NETSUITE_PRIVATE_KEY = os.getenv("NETSUITE_PRIVATE_KEY", "").replace("\\n", "\n")
NETSUITE_PRIVATE_KEY_PATH = os.getenv("NETSUITE_PRIVATE_KEY_PATH")

# ---------- GHL ----------
GHL_API_TOKEN = os.getenv("GHL_API_TOKEN")
# Token de la integracion con permiso sobre objetos personalizados (encuestas).
# Si queda vacio se usa GHL_API_TOKEN.
GHL_OBJETOS_API_TOKEN = os.getenv("GHL_OBJETOS_API_TOKEN") or GHL_API_TOKEN
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID")
# Clave del objeto personalizado de encuestas (ej. "custom_objects.encuestas").
# Si queda vacio, el servicio busca el objeto cuyo nombre contenga "encuesta".
GHL_OBJETO_ENCUESTAS = os.getenv("GHL_OBJETO_ENCUESTAS", "").strip()

# ---------- Supabase (web interna) ----------
# Anon key + access token del usuario (o del usuario tecnico): decide RLS.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# ---------- Posventa ----------
# Mismos criterios de fecha que las busquedas guardadas 2560 ("creado despues del
# 1/1/2026 23:59") y 2557 ("creado despues del 1/5/2025 23:59"): desde inclusive.
POSVENTA_CASOS_DESDE = date.fromisoformat(os.getenv("POSVENTA_CASOS_DESDE", "2026-01-02"))
POSVENTA_RELEV_DESDE = date.fromisoformat(os.getenv("POSVENTA_RELEV_DESDE", "2025-05-02"))
# Empleado asignado al caso (parametro case_assigned del RESTlet de Power BI).
POSVENTA_ASIGNADO_A = int(os.getenv("POSVENTA_ASIGNADO_A", "133"))

# ---------- General ----------
ZONA_HORARIA = os.getenv("ZONA_HORARIA", "America/Argentina/Buenos_Aires")
MINUTOS_CORRIDA_COLGADA = int(os.getenv("MINUTOS_CORRIDA_COLGADA", "30"))
CORRIDAS_A_CONSERVAR = int(os.getenv("CORRIDAS_A_CONSERVAR", "40"))
MINUTOS_ESPERA_EN_CURSO = int(os.getenv("MINUTOS_ESPERA_EN_CURSO", "20"))

# Usuario tecnico de Supabase para la tarea programada (permiso editar en
# cada seccion indicadores-<area> que actualice).
INDICADORES_BOT_EMAIL = os.getenv("INDICADORES_BOT_EMAIL")
INDICADORES_BOT_PASSWORD = os.getenv("INDICADORES_BOT_PASSWORD")

ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

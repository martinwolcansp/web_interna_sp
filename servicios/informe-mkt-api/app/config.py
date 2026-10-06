# app/config.py — Configuracion del servicio informe-mkt-api.
# Todo sale de variables de entorno (Coolify). Nunca hardcodear tokens aca.

import os

from dotenv import load_dotenv

load_dotenv()

# ---------- GHL ----------
GHL_API_TOKEN = os.getenv("GHL_API_TOKEN")
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID")

# ---------- NetSuite (OAuth 2.0 Client Credentials / M2M) ----------
# Cuenta tal como aparece en la URL de NetSuite (ej. "1234567" o "1234567_SB1").
NETSUITE_ACCOUNT_ID = os.getenv("NETSUITE_ACCOUNT_ID", "")
NETSUITE_CLIENT_ID = os.getenv("NETSUITE_CLIENT_ID")
# "Certificate ID" que muestra NetSuite al subir el certificado en
# Setup > Integration > OAuth 2.0 Client Credentials (M2M) Setup.
NETSUITE_CERT_ID = os.getenv("NETSUITE_CERT_ID")
# Clave privada PEM del certificado. Se puede pasar entera en una variable
# (con los saltos de linea como \n) o como ruta a un archivo montado.
NETSUITE_PRIVATE_KEY = os.getenv("NETSUITE_PRIVATE_KEY", "").replace("\\n", "\n")
NETSUITE_PRIVATE_KEY_PATH = os.getenv("NETSUITE_PRIVATE_KEY_PATH")
# URL completa del RESTlet deployado, ej:
# https://1234567.restlets.api.netsuite.com/app/site/hosting/restlet.nl?script=123&deploy=1
NETSUITE_RESTLET_URL = os.getenv("NETSUITE_RESTLET_URL")

# ---------- Supabase (web interna) ----------
# Igual que ghl-netsuite-api-opportunities: anon key + access token del
# usuario que aprieta el boton. La autorizacion la dan las politicas RLS.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# ---------- Informe ----------
# HTML(s) ya publicados de donde rescatar los campos de conversacion
# (resumen, motivo, hilo) la primera vez, cuando todavia no hay ninguna
# corrida guardada en Supabase. Lista separada por comas.
INFORME_HTML_BASE_URLS = [
    u.strip() for u in os.getenv("INFORME_HTML_BASE_URLS", "").split(",") if u.strip()
]
ZONA_HORARIA = os.getenv("ZONA_HORARIA", "America/Argentina/Buenos_Aires")
# Rango maximo permitido por corrida (dias). Evita pedidos enormes por error.
MAX_DIAS_RANGO = int(os.getenv("MAX_DIAS_RANGO", "92"))
# Una corrida "en_curso" mas vieja que esto se considera colgada (reinicio
# del contenedor, etc.) y se marca como error para no bloquear el boton.
MINUTOS_CORRIDA_COLGADA = int(os.getenv("MINUTOS_CORRIDA_COLGADA", "30"))
# Historial: cuantas corridas se conservan (las mas viejas se borran).
CORRIDAS_A_CONSERVAR = int(os.getenv("CORRIDAS_A_CONSERVAR", "40"))
# Rango maximo de una consulta sobre los datos ya cargados (no llama a NetSuite ni a GHL).
MAX_DIAS_CONSULTA = int(os.getenv("MAX_DIAS_CONSULTA", "400"))

# ---------- Corrida programada (python -m app.corrida_programada) ----------
# Usuario tecnico de Supabase Auth (email + contrasena) con permiso editar en
# Informes de MKT y en Integracion NetSuite-GHL. Lo usa la tarea programada
# de Coolify, que no tiene un usuario de la web que apriete el boton.
INFORME_BOT_EMAIL = os.getenv("INFORME_BOT_EMAIL")
INFORME_BOT_PASSWORD = os.getenv("INFORME_BOT_PASSWORD")
# En los primeros N dias habiles del mes se actualiza tambien el mes anterior
# completo (cierres tardios), antes de la corrida del mes en curso. 0 = nunca.
DIAS_HABILES_MES_ANTERIOR = int(os.getenv("DIAS_HABILES_MES_ANTERIOR", "3"))
# Si hay una actualizacion manual en curso, cuantos minutos esperar a que
# termine antes de desistir.
MINUTOS_ESPERA_EN_CURSO = int(os.getenv("MINUTOS_ESPERA_EN_CURSO", "20"))

# ---------- CORS ----------
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "").split(",") if o.strip()]

# app/config.py — Configuracion del servicio clientes-api.
# Todo sale de variables de entorno (Coolify). Nunca hardcodear tokens aca.

import os

from dotenv import load_dotenv

load_dotenv()


def _lista(nombre, defecto=""):
    return [v.strip() for v in os.getenv(nombre, defecto).split(",") if v.strip()]


# ---------- NetSuite (OAuth 2.0 Client Credentials / M2M + SuiteQL) ----------
# Misma integracion que indicadores-api ("SP Servicios internos M2M", rol
# SP WEB SERVICE INTEGRATION). Se puede reutilizar su certificado.
NETSUITE_ACCOUNT_ID = os.getenv("NETSUITE_ACCOUNT_ID", "")
NETSUITE_CLIENT_ID = os.getenv("NETSUITE_CLIENT_ID")
NETSUITE_CERT_ID = os.getenv("NETSUITE_CERT_ID")
NETSUITE_PRIVATE_KEY = os.getenv("NETSUITE_PRIVATE_KEY", "").replace("\\n", "\n")
NETSUITE_PRIVATE_KEY_PATH = os.getenv("NETSUITE_PRIVATE_KEY_PATH")
NETSUITE_CONCURRENCIA = int(os.getenv("NETSUITE_CONCURRENCIA", "3"))

# ---------- GHL ----------
# Todavia no se usan: quedan cargadas para sumar datos de GHL a los informes
# (mismo Private Integration Token que indicadores-api / informe-mkt-api).
GHL_API_TOKEN = os.getenv("GHL_API_TOKEN")
GHL_LOCATION_ID = os.getenv("GHL_LOCATION_ID")

# ---------- Supabase (web interna) ----------
# Anon key + access token del usuario que aprieta el boton: decide RLS.
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")

# ---------- Campos de NetSuite (ver app/campos.py y diagnostico_clientes.py) ----------
# Ids de los campos personalizados del cliente/establecimiento que usa la
# busqueda "SP Clientes Suspendidos por Baja", confirmados con
# diagnostico_clientes.py el 30/10/2026. Vacio = no se consulta.
CAMPO_ESTADO_SERVICIO = os.getenv("CAMPO_ESTADO_SERVICIO", "custentity_3k_estado_establecimiento")
# Numero de establecimiento ByKom (421721). custentity_3k_nro_cuenta es otra
# cosa: la cuenta sin el grupo comercial (1721), como lista.
CAMPO_NRO_CUENTA = os.getenv("CAMPO_NRO_CUENTA", "custentity_3k_nro_establecimiento")
CAMPO_FECHA_SUSPENSION = os.getenv("CAMPO_FECHA_SUSPENSION", "custentity_3k_fecha_suspension_bykom")
CAMPO_MOTIVO_BAJA = os.getenv("CAMPO_MOTIVO_BAJA", "custentity_ap_sp_motivo_de_baja")
CAMPO_COMENTARIOS_MOTIVO = os.getenv("CAMPO_COMENTARIOS_MOTIVO", "custentity_ap_sp_comentarios_baja")
# "Comentarios" de la busqueda: no es un campo personalizado; se supone el
# campo estandar del cliente. Si NetSuite lo rechaza, la corrida lo omite con aviso.
CAMPO_COMENTARIOS = os.getenv("CAMPO_COMENTARIOS", "comments")
CAMPO_FECHA_INICIO_SUSPENSION = os.getenv("CAMPO_FECHA_INICIO_SUSPENSION", "custentity_3k_fecha_inicio_suspension")
CAMPO_DURACION_SUSPENSION = os.getenv("CAMPO_DURACION_SUSPENSION", "custentity_3k_duracion_suspension")
CAMPO_TIPO_CLIENTE = os.getenv("CAMPO_TIPO_CLIENTE", "custentity_3k_tipo_cuenta")

# ---------- Segmentacion ----------
# Que registros de "customer" son clientes (condicion SuiteQL sobre c).
# Por defecto: etapa "Cliente" (26.178 registros al 30/10/2026; deja afuera
# "Cliente interesado" y "Cliente potencial"). Activos e inactivos entran igual.
# Ojo: la cuenta devuelve la etapa en castellano; con 'Customer' no trae nada.
CRITERIO_CLIENTES = os.getenv("CRITERIO_CLIENTES", "c.searchstage = 'Cliente'")
# Estado de servicio que cuenta como establecimiento activo (texto, sin
# distinguir mayusculas). Estados al 30/10/2026: ACTIVO, BAJA, SUSPENSION POR
# BAJA, SUSPENSION POR DEUDA, SUSPENSION POR SOLICITUD, NO SINCRONIZADO.
ESTADOS_ACTIVOS = [e.upper() for e in _lista("ESTADOS_ACTIVOS", "ACTIVO")]

# Compras: OV de productos (tipo 1) desde esta fecha (migracion a ByKom).
COMPRAS_DESDE = os.getenv("COMPRAS_DESDE", "2022-01-01")

# ---------- Bajas ----------
# Condicion SuiteQL de la busqueda de bajas, ademas de la fecha de suspension
# dentro del mes. {estado} se reemplaza por el texto del estado de servicio.
# Ademas de las suspensiones (lo que trae la busqueda guardada) incluye BAJA:
# una "SUSPENSION POR BAJA" pasa despues a BAJA definitiva y la busqueda
# guardada la pierde (septiembre: 117 bajas el 05/10, 116 el 30/10).
CRITERIO_BAJAS = os.getenv("CRITERIO_BAJAS", "(UPPER({estado}) LIKE 'SUSPENSION%' OR UPPER({estado}) = 'BAJA')")

# ---------- General ----------
ZONA_HORARIA = os.getenv("ZONA_HORARIA", "America/Argentina/Buenos_Aires")
MINUTOS_CORRIDA_COLGADA = int(os.getenv("MINUTOS_CORRIDA_COLGADA", "30"))
CORRIDAS_A_CONSERVAR = int(os.getenv("CORRIDAS_A_CONSERVAR", "40"))

ALLOWED_ORIGINS = _lista("ALLOWED_ORIGINS")

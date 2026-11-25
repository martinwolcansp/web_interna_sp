# app/main.py — clientes-api: actualiza los informes del mosaico Clientes activos.
#
# POST /clientes/segmentacion/actualizar
# POST /clientes/bajas/actualizar?periodo=YYYY-MM
#   Los llama el boton "Actualizar" de pages/clientes-activos/<informe>.html con
#   el access token de Supabase del usuario. Valida el permiso editar en
#   clientes-<informe>, crea la corrida y la ejecuta en segundo plano. La
#   pagina sigue el avance leyendo cli_corrida.
#
# POST /clientes/contactos/cargar   (multipart, campo "archivo")
#   Lo llama la pestaña Clientes activos + contactos al soltar un export de
#   ByKom. Valida el permiso editar en clientes-contactos, guarda el archivo
#   como respaldo en Storage (bykom-exports/<tipo>/<fecha>_<archivo>), crea la
#   fila en cnt_carga y procesa el archivo en segundo plano
#   (app/contactos/carga.py). La pagina sigue el avance leyendo cnt_carga.
#
# La lectura de los informes no pasa por aca: las paginas leen cli_* y cnt_*
# directo de Supabase (RLS con permiso ver).

import logging
import os
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone

from fastapi import BackgroundTasks, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app import config, job
from app import supabase_rest as sb
from app.comun import ahora
from app.contactos import SECCION as SECCION_CONTACTOS
from app.contactos import carga as carga_contactos
from app.contactos import lectura as lectura_contactos
from app.informes import INFORMES

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("clientes_api")

app = FastAPI(title="clientes-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "informes": sorted(INFORMES), "cargas": ["contactos"],
            "version": (os.getenv("SOURCE_COMMIT") or "")[:7] or None}


@app.post("/clientes/{informe}/actualizar", status_code=202)
def actualizar(informe: str, background: BackgroundTasks, periodo: str = None, authorization: str = Header(None)):
    # Todo error sale como HTTPException para que pase por CORS y el navegador
    # muestre el mensaje real.
    try:
        return _actualizar(informe, periodo, background, authorization)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al iniciar la actualizacion de %s", informe)
        raise HTTPException(500, f"Error interno al iniciar la actualizacion: {e}")


def _periodo(texto):
    if not texto or not re.fullmatch(r"\d{4}-\d{2}", texto):
        raise HTTPException(400, "Falta el mes a actualizar (periodo=AAAA-MM).")
    anio, mes = int(texto[:4]), int(texto[5:])
    if not 1 <= mes <= 12:
        raise HTTPException(400, "Mes invalido.")
    p = date(anio, mes, 1)
    hoy = ahora().date()
    if p > hoy.replace(day=1):
        raise HTTPException(400, "No se puede actualizar un mes futuro.")
    return p


def _actualizar(informe, periodo, background, authorization):
    if informe not in INFORMES:
        raise HTTPException(404, f"Informe desconocido: {informe}")
    modulo = INFORMES[informe]
    p = _periodo(periodo) if modulo.USA_PERIODO else None
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el header Authorization: Bearer <token de Supabase del usuario>")
    token = authorization.split(" ", 1)[1].strip()
    if not sb.verificar_usuario(token):
        raise HTTPException(401, "La sesion no es valida o vencio. Volve a ingresar a la web interna.")
    if not sb.tiene_permiso(token, modulo.SECCION, "editar"):
        raise HTTPException(403, "Tu usuario no tiene permiso para actualizar este informe.")

    sb.cerrar_corridas_colgadas(token, informe)
    en_curso = sb.corrida_en_curso(token, informe)
    if en_curso:
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.", "corrida_id": en_curso["id"]})

    corrida = sb.crear_corrida(token, informe, p.isoformat() if p else None)
    if not corrida:
        en_curso = sb.corrida_en_curso(token, informe)
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.",
                                  "corrida_id": en_curso["id"] if en_curso else None})

    background.add_task(job.ejecutar, informe, corrida["id"], token, p)
    return {"corrida_id": corrida["id"], "estado": "en_curso", "periodo": p.isoformat() if p else None}


# ---------------------------------------------------------------------
# Carga de exports de ByKom (pestaña Clientes activos + contactos)
# ---------------------------------------------------------------------

def _token_editor(authorization, seccion):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el header Authorization: Bearer <token de Supabase del usuario>")
    token = authorization.split(" ", 1)[1].strip()
    usuario = sb.verificar_usuario(token)
    if not usuario:
        raise HTTPException(401, "La sesion no es valida o vencio. Volve a ingresar a la web interna.")
    if not sb.tiene_permiso(token, seccion, "editar"):
        raise HTTPException(403, "Tu usuario no tiene permiso para subir archivos en esta pestaña.")
    return token, usuario


def _nombre_seguro(nombre):
    s = unicodedata.normalize("NFD", nombre or "archivo").encode("ascii", "ignore").decode()
    return re.sub(r"[^A-Za-z0-9._-]+", "_", s).strip("_") or "archivo"


@app.post("/clientes/contactos/cargar", status_code=202)
def cargar_contactos(background: BackgroundTasks, archivo: UploadFile = File(...), authorization: str = Header(None)):
    try:
        return _cargar_contactos(background, archivo, authorization)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al recibir el archivo de ByKom")
        raise HTTPException(500, f"Error interno al recibir el archivo: {e}")


def _cargar_contactos(background, archivo, authorization):
    token, usuario = _token_editor(authorization, SECCION_CONTACTOS)
    nombre = archivo.filename or "archivo"
    contenido = archivo.file.read()
    if not contenido:
        raise HTTPException(400, "El archivo esta vacio.")
    if len(contenido) > config.MAX_MB_ARCHIVO * 1048576:
        raise HTTPException(413, f"El archivo supera los {config.MAX_MB_ARCHIVO} MB.")
    try:
        tipo = lectura_contactos.tipo_de(contenido, nombre)
    except lectura_contactos.ArchivoInvalido as e:
        raise HTTPException(400, str(e))

    # Una carga a la vez; las que quedaron colgadas (reinicio del servicio) se cierran.
    limite = (datetime.now(timezone.utc) - timedelta(minutes=config.MINUTOS_CARGA_COLGADA)).isoformat()
    sb.patch(token, carga_contactos.T_CARGA, {"estado": "eq.en_curso", "subido_en": f"lt.{limite}"},
             {"estado": "error", "mensaje": "La carga quedo colgada (el servicio se reinicio) y se cerro sola."})
    if sb.leer_todo(token, carga_contactos.T_CARGA, "id", {"estado": "eq.en_curso"}):
        raise HTTPException(409, "Ya hay un archivo procesandose. Esperá a que termine y volvé a subir este.")

    marca = ahora().strftime("%Y-%m-%d_%H%M%S")
    ruta = f"{tipo}/{marca}_{_nombre_seguro(nombre)}"
    tipo_mime = archivo.content_type or "application/octet-stream"
    try:
        sb.subir_objeto(token, config.BUCKET_BYKOM, ruta, contenido, tipo_mime)
    except RuntimeError as e:
        raise HTTPException(500, f"No se pudo guardar el respaldo en Storage: {e}")

    meta = usuario.get("user_metadata") or {}
    fila = sb.insertar_uno(token, carga_contactos.T_CARGA, {
        "tipo": tipo, "archivo": nombre, "ruta": ruta, "bytes": len(contenido), "estado": "en_curso",
        "mensaje": "En cola", "subido_por_nombre": meta.get("nombre") or meta.get("full_name") or usuario.get("email"),
    })
    background.add_task(carga_contactos.ejecutar, token, fila["id"], contenido, nombre)
    return {"carga_id": fila["id"], "tipo": tipo, "ruta": ruta, "estado": "en_curso",
            "mensaje": f"Archivo de {'cuentas' if tipo == 'cuentas' else 'contactos'} recibido; procesando."}

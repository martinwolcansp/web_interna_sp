# app/main.py — clientes-api: actualiza los informes del mosaico Clientes activos.
#
# POST /clientes/segmentacion/actualizar
# POST /clientes/bajas/actualizar?periodo=YYYY-MM
#   Los llama el boton "Actualizar" de pages/clientes-activos/<informe>.html con
#   el access token de Supabase del usuario. Valida el permiso editar en
#   clientes-<informe>, crea la corrida y la ejecuta en segundo plano. La
#   pagina sigue el avance leyendo cli_corrida.
#
# La lectura de los informes no pasa por aca: las paginas leen cli_* directo de
# Supabase (RLS con permiso ver).

import logging
import os
import re
from datetime import date

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import config, job
from app import supabase_rest as sb
from app.comun import ahora
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
    return {"status": "ok", "informes": sorted(INFORMES), "version": (os.getenv("SOURCE_COMMIT") or "")[:7] or None}


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

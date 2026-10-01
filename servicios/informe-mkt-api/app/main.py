# app/main.py — informe-mkt-api: actualiza el Informe MKT desde la web interna.
#
# POST /informe-mkt/actualizar {desde, hasta}
#   Lo llama el boton "Actualizar" de pages/informes-mkt/actualizable.html con
#   el access token de Supabase del usuario. Valida el rango y el permiso,
#   crea la corrida y la ejecuta en segundo plano. La pagina sigue el avance
#   leyendo la tabla informe_mkt_corrida.

import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app import config, job
from app import supabase_rest as sb

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

app = FastAPI(title="informe-mkt-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PedidoActualizacion(BaseModel):
    desde: date
    hasta: date


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/informe-mkt/actualizar", status_code=202)
def actualizar(pedido: PedidoActualizacion, background: BackgroundTasks, authorization: str = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el header Authorization: Bearer <token de Supabase del usuario>")
    token = authorization.split(" ", 1)[1].strip()

    if not sb.verificar_usuario(token):
        raise HTTPException(401, "La sesion no es valida o vencio. Volve a ingresar a la web interna.")
    if not sb.tiene_permiso(token, "informes-mkt", "editar"):
        raise HTTPException(403, "Tu usuario no tiene permiso para actualizar el informe (editar en Informes de MKT).")

    hoy = datetime.now(ZoneInfo(config.ZONA_HORARIA)).date()
    if pedido.desde > pedido.hasta:
        raise HTTPException(422, "La fecha 'desde' no puede ser posterior a 'hasta'.")
    if pedido.hasta > hoy:
        raise HTTPException(422, "La fecha 'hasta' no puede ser posterior a hoy.")
    if (pedido.hasta - pedido.desde).days + 1 > config.MAX_DIAS_RANGO:
        raise HTTPException(422, f"El rango no puede superar {config.MAX_DIAS_RANGO} dias.")

    sb.cerrar_corridas_colgadas(token)
    en_curso = sb.corrida_en_curso(token)
    if en_curso:
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.", "corrida_id": en_curso["id"]})

    corrida = sb.crear_corrida(token, pedido.desde, pedido.hasta)
    if not corrida:
        en_curso = sb.corrida_en_curso(token)
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.",
                                  "corrida_id": en_curso["id"] if en_curso else None})

    background.add_task(job.ejecutar, corrida["id"], token, pedido.desde, pedido.hasta)
    return {"corrida_id": corrida["id"], "estado": "en_curso"}

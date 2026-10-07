# app/main.py — indicadores-api: actualiza los Indicadores por Area desde la web.
#
# POST /indicadores/{area}/actualizar
#   Lo llama el boton "Actualizar" de pages/indicadores-area/<area>.html con el
#   access token de Supabase del usuario. Valida el permiso editar en
#   indicadores-<area>, crea la corrida y la ejecuta en segundo plano. La
#   pagina sigue el avance leyendo la tabla ind_corrida.
#
# La lectura de los indicadores no pasa por aca: la pagina lee las tablas
# ind_<area>_* directo de Supabase (RLS con permiso ver).

import logging

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app import config, job
from app import supabase_rest as sb
from app.areas import AREAS

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("indicadores_api")

app = FastAPI(title="indicadores-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "areas": sorted(AREAS)}


@app.post("/indicadores/{area}/actualizar", status_code=202)
def actualizar(area: str, background: BackgroundTasks, authorization: str = Header(None)):
    # Todo error sale como HTTPException para que pase por CORS y el navegador
    # muestre el mensaje real (un 500 sin manejar se ve como "Failed to fetch").
    try:
        return _actualizar(area, background, authorization)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al iniciar la actualizacion de %s", area)
        raise HTTPException(500, f"Error interno al iniciar la actualizacion: {e}")


def _actualizar(area, background, authorization):
    if area not in AREAS:
        raise HTTPException(404, f"Area desconocida: {area}")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el header Authorization: Bearer <token de Supabase del usuario>")
    token = authorization.split(" ", 1)[1].strip()
    if not sb.verificar_usuario(token):
        raise HTTPException(401, "La sesion no es valida o vencio. Volve a ingresar a la web interna.")
    seccion = AREAS[area].SECCION
    if not sb.tiene_permiso(token, seccion, "editar"):
        raise HTTPException(403, "Tu usuario no tiene permiso para actualizar estos indicadores.")

    sb.cerrar_corridas_colgadas(token, area)
    en_curso = sb.corrida_en_curso(token, area)
    if en_curso:
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.", "corrida_id": en_curso["id"]})

    corrida = sb.crear_corrida(token, area)
    if not corrida:
        en_curso = sb.corrida_en_curso(token, area)
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.",
                                  "corrida_id": en_curso["id"] if en_curso else None})

    background.add_task(job.ejecutar, area, corrida["id"], token)
    return {"corrida_id": corrida["id"], "estado": "en_curso"}

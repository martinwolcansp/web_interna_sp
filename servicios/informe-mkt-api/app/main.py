# app/main.py — informe-mkt-api: actualiza el Informe MKT desde la web interna.
#
# POST /informe-mkt/actualizar {desde, hasta}
#   Lo llama el boton "Actualizar" de pages/informes-mkt/actualizable.html con
#   el access token de Supabase del usuario. Valida el rango y el permiso,
#   crea la corrida y la ejecuta en segundo plano. La pagina sigue el avance
#   leyendo la tabla informe_mkt_corrida.
#
# POST /auditoria/actualizar (sin cuerpo)
#   Lo llama el boton "Auditar" de la seccion Integracion NetSuite <-> GHL.
#   Permiso propio: 'editar' en integracion-ghl-ns (no hace falta permiso en
#   Informes de MKT). Siempre actualiza el mes en curso y corre con el usuario
#   tecnico, como la corrida programada (migracion 24).
#
# POST /informe-mkt/consultar {desde, hasta}
#   Arma el informe para cualquier rango con los datos ya cargados por las
#   actualizaciones (tablas de la migracion 19). Permiso: ver. Es sincronico.
#
# POST /informe-mkt/comisiones {desde, hasta}
#   OV de las oportunidades ganadas del rango con sus abonos (ABO), para el
#   boton "Comisiones por vendedor" (app/comisiones.py). Consulta NetSuite en
#   vivo, no guarda nada. Permiso: ver en Informes de MKT o en Comisiones.
#   Usa la configuracion de abonos de comision_abono (migracion 28).
#
# POST /comisiones/liquidar {mes: "AAAA-MM"}
#   Calcula el mes completo como el pop up y guarda la liquidacion
#   (fn_comision_guardar_liquidacion). Permiso: editar en Comisiones. Si ya
#   existe la del mes responde 409: hay que eliminarla para regenerarla.

import calendar
import logging
import re
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import BackgroundTasks, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from pydantic import BaseModel

from app import acumulado, comisiones, config, job
from app import supabase_rest as sb

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger("informe_mkt_api")

app = FastAPI(title="informe-mkt-api")
app.add_middleware(GZipMiddleware, minimum_size=2000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.ALLOWED_ORIGINS or ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class PedidoActualizacion(BaseModel):
    desde: date
    hasta: date


class PedidoLiquidacion(BaseModel):
    mes: str  # "AAAA-MM"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/informe-mkt/actualizar", status_code=202)
def actualizar(pedido: PedidoActualizacion, background: BackgroundTasks, authorization: str = Header(None)):
    # Cualquier error inesperado se devuelve como HTTPException: asi la respuesta
    # pasa por el middleware de CORS y el navegador muestra el mensaje real (un
    # 500 sin manejar sale sin encabezados CORS y se ve como "Failed to fetch").
    try:
        return _actualizar(pedido, background, authorization)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al iniciar la actualizacion")
        raise HTTPException(500, f"Error interno al iniciar la actualizacion: {e}")


def _token_valido(authorization):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Falta el header Authorization: Bearer <token de Supabase del usuario>")
    token = authorization.split(" ", 1)[1].strip()
    if not sb.verificar_usuario(token):
        raise HTTPException(401, "La sesion no es valida o vencio. Volve a ingresar a la web interna.")
    return token


@app.post("/informe-mkt/consultar")
def consultar(pedido: PedidoActualizacion, authorization: str = Header(None)):
    try:
        token = _token_valido(authorization)
        if not sb.tiene_permiso(token, "informes-mkt", "ver"):
            raise HTTPException(403, "Tu usuario no tiene permiso para ver el Informe de MKT.")
        if pedido.desde > pedido.hasta:
            raise HTTPException(422, "La fecha 'desde' no puede ser posterior a 'hasta'.")
        if (pedido.hasta - pedido.desde).days + 1 > config.MAX_DIAS_CONSULTA:
            raise HTTPException(422, f"El rango no puede superar {config.MAX_DIAS_CONSULTA} dias.")
        return acumulado.consultar(token, pedido.desde, pedido.hasta)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al consultar el informe")
        raise HTTPException(500, f"Error interno al consultar el informe: {e}")


@app.post("/informe-mkt/comisiones")
def consultar_comisiones(pedido: PedidoActualizacion, authorization: str = Header(None)):
    try:
        token = _token_valido(authorization)
        if not (sb.tiene_permiso(token, "informes-mkt", "ver") or sb.tiene_permiso(token, "comisiones", "ver")):
            raise HTTPException(403, "Tu usuario no tiene permiso para ver el Informe de MKT ni Comisiones.")
        if pedido.desde > pedido.hasta:
            raise HTTPException(422, "La fecha 'desde' no puede ser posterior a 'hasta'.")
        if (pedido.hasta - pedido.desde).days + 1 > config.MAX_DIAS_CONSULTA:
            raise HTTPException(422, f"El rango no puede superar {config.MAX_DIAS_CONSULTA} dias.")
        return comisiones.generar(pedido.desde, pedido.hasta, logger.info, sb.leer_abonos_comision(token))
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al consultar las comisiones")
        raise HTTPException(500, f"Error al consultar NetSuite para las comisiones: {e}")


@app.post("/comisiones/liquidar")
def liquidar_comisiones(pedido: PedidoLiquidacion, authorization: str = Header(None)):
    try:
        token = _token_valido(authorization)
        if not sb.tiene_permiso(token, "comisiones", "editar"):
            raise HTTPException(403, "Tu usuario no tiene permiso para generar liquidaciones (editar en Comisiones).")
        if not re.fullmatch(r"\d{4}-\d{2}", pedido.mes or ""):
            raise HTTPException(422, "El mes tiene que tener el formato AAAA-MM.")
        anio, mes = (int(x) for x in pedido.mes.split("-"))
        if not 1 <= mes <= 12:
            raise HTTPException(422, "Mes inválido.")
        desde = date(anio, mes, 1)
        hasta = date(anio, mes, calendar.monthrange(anio, mes)[1])
        hoy = datetime.now(ZoneInfo(config.ZONA_HORARIA)).date()
        if desde > hoy:
            raise HTTPException(422, "No se puede liquidar un mes que todavía no empezó.")
        usuario = sb.verificar_usuario(token) or {}
        r = comisiones.generar(desde, hasta, logger.info, sb.leer_abonos_comision(token))
        payload = comisiones.payload_liquidacion(r, desde, usuario.get("email"))
        if hasta >= hoy:
            payload["avisos"].append(f"Liquidación generada el {hoy.strftime('%d/%m/%Y')}, con el mes todavía en curso.")
        try:
            liq_id = sb.guardar_liquidacion_comision(token, payload)
        except RuntimeError as e:
            if "Ya existe" in str(e):
                raise HTTPException(409, str(e))
            raise
        return {"id": liq_id, "mes": desde.isoformat(), "totales": payload["totales"],
                "vendedores": len(payload["vendedores"]), "lineas": len(payload["lineas"])}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al generar la liquidacion de comisiones")
        raise HTTPException(500, f"Error al generar la liquidación: {e}")


@app.post("/auditoria/actualizar", status_code=202)
def actualizar_auditoria(background: BackgroundTasks, authorization: str = Header(None)):
    try:
        return _actualizar_auditoria(background, authorization)
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error al iniciar la actualizacion desde la auditoria")
        raise HTTPException(500, f"Error interno al iniciar la actualizacion: {e}")


def _actualizar_auditoria(background, authorization):
    token = _token_valido(authorization)
    if not sb.tiene_permiso(token, "integracion-ghl-ns", "editar"):
        raise HTTPException(403, "Tu usuario no tiene permiso para actualizar la auditoria (editar en Integracion NetSuite-GHL).")
    if not (config.INFORME_BOT_EMAIL and config.INFORME_BOT_PASSWORD):
        raise HTTPException(500, "Falta configurar el usuario tecnico (INFORME_BOT_EMAIL / INFORME_BOT_PASSWORD).")
    usuario = sb.verificar_usuario(token) or {}

    # El rango lo decide el servidor: mes en curso, del 1 a hoy.
    hoy = datetime.now(ZoneInfo(config.ZONA_HORARIA)).date()
    desde = hoy.replace(day=1)

    # La actualizacion escribe en las tablas del informe: se hace con el
    # usuario tecnico (editar en Informes de MKT), no con el de la persona.
    bot = sb.iniciar_sesion(config.INFORME_BOT_EMAIL, config.INFORME_BOT_PASSWORD)
    sb.cerrar_corridas_colgadas(bot)
    en_curso = sb.corrida_en_curso(bot)
    if en_curso:
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.", "corrida_id": en_curso["id"]})

    corrida = sb.crear_corrida(bot, desde, hoy, origen="auditoria", solicitado_por=usuario.get("email"))
    if not corrida:
        en_curso = sb.corrida_en_curso(bot)
        raise HTTPException(409, {"mensaje": "Ya hay una actualizacion en curso.",
                                  "corrida_id": en_curso["id"] if en_curso else None})

    logger.info("Corrida %s desde la auditoria (%s): %s a %s.", corrida["id"], usuario.get("email"), desde, hoy)
    background.add_task(job.ejecutar, corrida["id"], bot, desde, hoy)
    return {"corrida_id": corrida["id"], "estado": "en_curso", "desde": desde.isoformat(), "hasta": hoy.isoformat()}


def _actualizar(pedido, background, authorization):
    token = _token_valido(authorization)
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

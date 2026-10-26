# -*- coding: utf-8 -*-
"""
Clasificacion del canal de origen de un contacto de GHL -- SP / Informe MKT
===========================================================================
Modulo compartido por analisis_mensual_mkt.py y actualizar_resumen_ejecutivo.py
(antes cada uno tenia su propia copia de CANALES_TAGS con solo 4 etiquetas).

Criterio (24/10/2026, a partir del relevamiento de workflows de GHL):

1. Etiquetas de origen, en ORDEN DE PRIORIDAD (gana la primera que aparezca;
   un contacto suele tener varias, ej. 'fb-ad-lead-whatsapp' + 'inbound
   whatsapp' + 'wa: +549...'). Lo mas especifico (anuncio, formulario) va
   primero; lo generico (entro por WhatsApp) al final.
2. Si no hay ninguna etiqueta de origen, se usa el campo 'Forma de Contacto'
   como respaldo, marcado como tal para no mezclarlo con un origen real.

Las etiquetas se comparan normalizadas: sin mayusculas, sin tildes y sin
espacios/guiones/guiones bajos. Asi 'WEB', 'web', 'formweb_aclho' y
'formwebaclho', o 'inbound whatsapp' e 'inbound-whatsapp', son lo mismo.
La comparacion es EXACTA sobre la etiqueta normalizada (no "contiene"), para
que 'formweb' no se confunda con 'web'.

NO son etiquetas de origen (se ignoran a proposito): las de linea de interes
(comercio, hogar, consultagral, consorcio, obraenconstruccion, otros...), las
de estado/seguimiento (nocalificado(...), leads sin respuesta, human handover,
recontactoN, enviar_encuesta...) y las tecnicas de WhatsApp
(another-device-replied-whatsapp, invalid whatsapp number...).
'whatsapp-missed-call' SI se toma como origen (ya lo usaba la pagina
actualizable.html), con prioridad baja.

Pendiente: las etiquetas UTM dinamicas (Source/Content/...) que agregan Form
Web, WA DM - Comercio e IG DM no tienen un nombre fijo, asi que no se pueden
mapear por nombre. Si se define un prefijo fijo para ellas (ej. 'utm-source:'),
agregarlo en PREFIJOS_ORIGEN.
"""
import re
import unicodedata

# (etiqueta normalizada, canal) -- en orden de prioridad.
# Nombres de canal iguales a los de la pagina actualizable.html (ORIGEN_TAGS),
# unificados el 26/10/2026 (antes: "Formulario Web", "Organico", "WhatsApp
# entrante").
TAGS_ORIGEN = [
    ("fbadleadwhatsapp", "Facebook Ads"),
    ("instagramadleadwhatsapp", "Instagram Ads"),
    ("formwebaclho", "Formulario ACLHO"),
    ("formweb", "Formulario web"),
    ("web", "WhatsApp del sitio web"),
    ("organico", "Orgánico"),
    ("netsuitecomercio", "Repesca NetSuite"),
    ("whatsappmissedcall", "Llamada perdida WhatsApp"),
    ("inboundwhatsapp", "WhatsApp (sin anuncio)"),
]

# Etiquetas que solo dicen "entro por WhatsApp" (sin campana ni accion de
# MKT detras). En origen_combinado() no le ganan al campo Origen del Cliente.
TAGS_GENERICOS = {"whatsappmissedcall", "inboundwhatsapp"}

# (prefijo normalizado, canal) -- se evaluan DESPUES de TAGS_ORIGEN.
# 'wa: +549...' indica el numero de WhatsApp por el que entro el contacto:
# solo dice "entro por WhatsApp", por eso va ultimo.
PREFIJOS_ORIGEN = [
    ("wa", "WhatsApp (sin anuncio)"),
]

_PRIORIDAD = {clave: i for i, (clave, _) in enumerate(TAGS_ORIGEN)}
_CANAL = dict(TAGS_ORIGEN)

VALORES_VACIOS = {"", "sindato", "none", "nan", "null"}


def normalizar_tag(tag):
    """'Formweb_ACLHO ' -> 'formwebaclho'; 'Orgánico' -> 'organico'."""
    s = unicodedata.normalize("NFKD", str(tag or "")).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]", "", s.lower())


def _es_prefijo_wa(tag):
    # 'wa: +5492214082291' -> empieza con 'wa:' seguido de un numero. Se
    # chequea sobre el texto original para no confundir con otra etiqueta
    # que casualmente empiece con 'wa' (ej. 'wa web').
    return bool(re.match(r"^\s*wa\s*:\s*\+?\d", str(tag or ""), re.IGNORECASE))


def canal_por_tags(tags, solo_especificos=False):
    """Canal de origen segun las etiquetas, o None si ninguna indica origen.
    Con solo_especificos=True ignora las genericas de WhatsApp (TAGS_GENERICOS
    y el prefijo 'wa:')."""
    normalizadas = {normalizar_tag(t) for t in (tags or [])}
    encontradas = [c for c in normalizadas if c in _PRIORIDAD
                   and not (solo_especificos and c in TAGS_GENERICOS)]
    if encontradas:
        return _CANAL[min(encontradas, key=_PRIORIDAD.get)]
    if solo_especificos:
        return None
    for prefijo, canal in PREFIJOS_ORIGEN:
        if prefijo == "wa" and any(_es_prefijo_wa(t) for t in (tags or [])):
            return canal
    return None


def canal_por_forma_contacto(forma_contacto):
    """Respaldo cuando no hay etiqueta de origen: 'Telefono' ->
    'Telefono (forma de contacto)'. None si el campo esta vacio."""
    if forma_contacto is None:
        return None
    valor = str(forma_contacto).strip()
    if normalizar_tag(valor) in VALORES_VACIOS:
        return None
    return f"{valor} (forma de contacto)"


def canal_origen(tags, forma_contacto=None):
    """Devuelve (canal, fuente), con fuente = 'tag' | 'forma_contacto' | None."""
    canal = canal_por_tags(tags)
    if canal:
        return canal, "tag"
    canal = canal_por_forma_contacto(forma_contacto)
    if canal:
        return canal, "forma_contacto"
    return None, None


def origen_combinado(tags, origen_cliente=None, forma_contacto=None):
    """Origen de un cliente cruzando etiquetas de GHL con el campo Origen del
    Cliente (NetSuite manda; si no, el custom field de GHL). Lo usa el grafico
    "Origen de los clientes con oportunidad ganada" (26/10/2026).

    Orden:
      1. Etiqueta de origen especifica (anuncio, formulario, web, organico,
         repesca): es el dato que registra la automatizacion, gana.
      2. Campo Origen del Cliente (Referido, Ya es Cliente, Carteleria...).
      3. Etiqueta generica de WhatsApp (inbound whatsapp, llamada perdida,
         'wa: +549...'): no le gana al campo porque un referido o un cliente
         de cartera tambien escribe por WhatsApp.
      4. Forma de Contacto, marcada '(forma de contacto)'.
    Devuelve (valor, fuente) con fuente = 'tag' | 'origen_cliente' |
    'tag_generico' | 'forma_contacto' | None (valor 'Sin dato')."""
    canal = canal_por_tags(tags, solo_especificos=True)
    if canal:
        return canal, "tag"
    if origen_cliente is not None and normalizar_tag(origen_cliente) not in VALORES_VACIOS:
        return str(origen_cliente).strip(), "origen_cliente"
    canal = canal_por_tags(tags)
    if canal:
        return canal, "tag_generico"
    canal = canal_por_forma_contacto(forma_contacto)
    if canal:
        return canal, "forma_contacto"
    return "Sin dato", None

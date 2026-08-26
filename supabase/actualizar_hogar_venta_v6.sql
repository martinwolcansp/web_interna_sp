-- =========================================================================
-- Actualiza la ficha "hogar-venta" (v1.0) — v6: sintetiza "Puntos de
-- comercialización" para uso de Marketing/Ventas. Pedido de Martin
-- (25-ago-2026): la sección tenía demasiado dato analítico (tasa de
-- cierre, % de mano de obra, citas a scripts) mezclado con las
-- condiciones comerciales — no es el lugar para eso.
--
-- Cambio: se recortan los bullets a lo puramente comercial (venta
-- directa vs. comodato, estructura de cargos, qué incluye, 2 técnicos,
-- que la web no publica precios) y se saca todo dato con fuente/cifra
-- de muestra. Ese detalle NO se pierde: ya vive en "proceso" (secciones
-- Ventas/Instalaciones, cargado en v4/v5) — se agrega una nota aclarando
-- dónde encontrarlo.
--
-- Solo toca la columna "general" (jsonb). "proceso", equipamiento,
-- precios, faq, competencia y areas quedan sin cambios respecto de v5.
--
-- Idempotente: UPDATE simple sobre la fila ya existente
-- (ficha_id='hogar-venta', version_key='v1.0'). No inserta filas nuevas.
-- =========================================================================

begin;

update ficha_versiones set
  version      = '0.6',
  general      = '{"descripcion": "Sistema de alarma monitoreada para el hogar, con control total desde la app y respuesta de un centro de monitoreo 24/7. Protege la vivienda en tres capas: detección de movimiento en el interior, sensores en puertas y ventanas, y cobertura del perímetro exterior. Incluye instalación, notificaciones inmediatas ante cualquier evento, botón de pánico silencioso y Móvil de Acuda. Se vende en forma directa: el cliente es propietario del equipo desde la instalación, a diferencia de SP Comercio Seguro, que se ofrece en comodato.", "infocards": [{"icon": "ti-home", "title": "Cliente objetivo", "body": "Viviendas particulares (casas y departamentos) — [A completar: zona de cobertura, ej. La Plata y Gran La Plata]"}, {"icon": "ti-contract", "title": "Plazo de contrato", "body": "[A completar]"}, {"icon": "ti-device-mobile", "title": "Plataforma", "body": "Doble ecosistema según instalación: App Hik-Connect (línea Hikvision AXPRO) o App Ajax Security (línea Ajax) — [A confirmar plataforma estándar recomendada por Producto]"}], "comercializacion": ["Venta directa: el cliente es propietario del equipo desde la instalación — a diferencia de SP Comercio Seguro, que se ofrece en comodato.", "Cargo de instalación único — [A completar: monto y política de bonificación].", "Abono mensual de monitoreo — [A completar: monto vigente].", "Adicional de abono 4G / Radio para domicilios sin línea fija o wifi estable.", "Instalación estándar con cuadrilla de 2 técnicos.", "Incluye: instalación, monitoreo 24/7, notificación inmediata, control por app, botón de pánico, Móvil de Acuda, informes de uso y aviso de corte de luz.", "La web pública no publica precios: el formulario deriva a \"Cotizá tu abono\" (lead a Ventas)."], "checklist": [{"label": "Nombre", "status": "rev"}, {"label": "Alcance detallado", "status": "rev"}, {"label": "Preguntas Frecuentes", "status": "rev"}, {"label": "Contrato", "status": "rev"}, {"label": "Artículo en Netsuite", "status": "prog"}, {"label": "Material Marketing", "status": "rev"}, {"label": "Proceso Ventas", "status": "rev"}, {"label": "Proceso Instaladores", "status": "rev"}, {"label": "Proceso Operadores", "status": "rev"}, {"label": "Proceso Serv. Técnico", "status": "rev"}]}'::jsonb
where ficha_id = 'hogar-venta' and version_key = 'v1.0';

commit;

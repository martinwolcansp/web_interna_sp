-- =========================================================================
-- Actualiza la ficha "hogar-venta" (v1.0) — v5: incorpora el export de
-- mano de obra por caso de instalación (script 452, 495 líneas / 467
-- casos) y el drill-down de oportunidades con 1 técnico (script 560, 89
-- líneas / 75 clientes), subidos por Martin el 25-ago-2026.
--
-- Cambio principal: el dato de "mano de obra de instalación" pasa de
-- basarse en presupuestos ganados (114/38 de 182, script 549) a basarse
-- en casos reales de instalación de "Alarma Nueva" (338/28 de 379,
-- script 452) — muestra bastante más grande y más directa (instalado,
-- no presupuestado). El nuevo dato: 89% de los casos con 2 técnicos
-- (310 instalación completa + 28 media jornada), 7% con 1 técnico.
--
-- El export 560 (oportunidades con 1 técnico) no agrega un campo nuevo
-- a la ficha, pero confirma que dentro de esa franja el comodato es
-- prácticamente nulo (0 de 33 clientes ganados) — consistente con el
-- ~98% venta directa ya cargado en v3/v4.
--
-- Solo toca las columnas "general" y "proceso" (jsonb). El resto de la
-- ficha (equipamiento, precios, faq, competencia, areas) queda sin
-- cambios respecto de v4 — sigue pendiente de carga por las áreas
-- correspondientes.
--
-- Idempotente: UPDATE simple sobre la fila ya existente
-- (ficha_id='hogar-venta', version_key='v1.0'). No inserta filas nuevas.
-- =========================================================================

begin;

update ficha_versiones set
  version      = '0.5',
  autor        = 'Borrador (scripts 549/200/452/560/865 + Informe_Mapa_Servicios_vs_Operacion.docx + spseguridad.com.ar/hogares) — pend. revisión comercial/instalaciones/precios',
  general      = '{"descripcion": "Sistema de alarma monitoreada para el hogar, con control total desde la app y respuesta de un centro de monitoreo 24/7. Protege la vivienda en tres capas: detección de movimiento en el interior, sensores en puertas y ventanas, y cobertura del perímetro exterior. Incluye instalación, notificaciones inmediatas ante cualquier evento, botón de pánico silencioso y Móvil de Acuda. Se vende en forma directa: el cliente es propietario del equipo desde la instalación, a diferencia de SP Comercio Seguro, que se ofrece en comodato.", "infocards": [{"icon": "ti-home", "title": "Cliente objetivo", "body": "Viviendas particulares (casas y departamentos) — [A completar: zona de cobertura, ej. La Plata y Gran La Plata]"}, {"icon": "ti-contract", "title": "Plazo de contrato", "body": "[A completar]"}, {"icon": "ti-device-mobile", "title": "Plataforma", "body": "Doble ecosistema según instalación: App Hik-Connect (línea Hikvision AXPRO) o App Ajax Security (línea Ajax) — [A confirmar plataforma estándar recomendada por Producto]"}], "comercializacion": ["Alta demanda: \"Alarma Nueva\" (= Hogar Seguro, confirmado con el equipo: todo lo que no es SP Comercio Seguro dentro de esa categoría) es la de mayor volumen del CRM — 588 presupuestos en el período, con una tasa de cierre del 31% (182 ganados). Fuente: Informe_Mapa_Servicios_vs_Operacion.docx, sección 3.", "Venta directa del equipamiento (título de propiedad del cliente) — modelo dominante en Hogar Seguro: ~98% de los casos (178 de 182 presupuestos ganados; 221 de 225 instalaciones reales), a diferencia de SP Comercio Seguro, que se vende mayoritariamente en comodato (77-81%).", "Cargo de instalación — [A completar: monto y política de bonificación]", "Abono mensual de monitoreo (ABO-10 / ABO-16 en Netsuite) — presente en 88 y 44 de los 182 presupuestos ganados respectivamente [A confirmar cuál es el abono vigente / si son alternativos]", "Adicional de abono 4G / Radio (ABO-11) cuando el domicilio no cuenta con línea fija o wifi estable — presente en 88 de 182 presupuestos ganados", "Mano de obra de instalación: 2 técnicos en 338 de 379 casos reales de instalación (89%: 310 instalación completa + 28 media jornada), 1 técnico en 28 casos (7%) — sobre el total de casos de \"Alarma Nueva\" del export de mano de obra por caso (script 452). Reemplaza la estimación anterior (63%/21% sobre 182 presupuestos, script 549): la gran mayoría de las instalaciones requiere 2 técnicos.", "Servicios incluidos (instalación, monitoreo 24/7, notificación, control por App, botón de pánico, Acuda, informes, aviso corte de luz) — cruzados contra Mapa de Servicios v1.5 y spseguridad.com.ar/hogares (13-ago-2026)", "La web pública no publica precios — el formulario de contacto deriva a \"Cotizá tu abono\" (lead a ventas), consistente con que los montos siguen [A completar] en esta ficha"], "checklist": [{"label": "Nombre", "status": "rev"}, {"label": "Alcance detallado", "status": "rev"}, {"label": "Preguntas Frecuentes", "status": "rev"}, {"label": "Contrato", "status": "rev"}, {"label": "Artículo en Netsuite", "status": "prog"}, {"label": "Material Marketing", "status": "rev"}, {"label": "Proceso Ventas", "status": "rev"}, {"label": "Proceso Instaladores", "status": "rev"}, {"label": "Proceso Operadores", "status": "rev"}, {"label": "Proceso Serv. Técnico", "status": "rev"}]}'::jsonb,
  proceso      = '{"secciones": [{"label": "Ventas", "pasos": [{"title": "Tipo de Proyecto en Netsuite: ''Alarma Nueva''", "note": "Categoría con mayor volumen del sistema: 588 presupuestos en el período analizado, con una tasa de cierre del 31% (182 ganados)."}, {"title": "[A completar: pasos de carga de oportunidad, presupuesto, firma de contrato si aplica]", "note": ""}]}, {"label": "Instalaciones", "pasos": [{"title": "Asignación de mano de obra", "note": "Predominan 2 técnicos: 89% de los casos reales de instalación (338 de 379, script 452) — [A completar: criterio para asignar 1 vs 2 técnicos]"}, {"title": "[A completar: checklist de instalación, alta en app, cierre de OV en Netsuite]", "note": ""}]}], "netsuite": [{"articulo": "Alarma Nueva (Tipo de Proyecto)", "codigo": "—", "desc": "Confirmado como categoría de mayor volumen — artículos específicos por línea aún sin formalizar como kit"}]}'::jsonb
where ficha_id = 'hogar-venta' and version_key = 'v1.0';

commit;

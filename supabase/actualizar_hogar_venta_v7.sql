-- =========================================================================
-- Actualiza la ficha "hogar-venta" (v1.0) — v7: agrega período de referencia
-- a los datos de "Componentes del equipo" (pedido de Martin, 25-ago-2026:
-- "Si vamos a mostrar datos me gustaría que tengan el período de
-- referencia"), y reemplaza la base de esa tabla por el export
-- Datos_elementos.csv (subido por Martin), que sí trae fechas utilizables
-- — a diferencia de los scripts 549/552 (nunca subidos en crudo) y del
-- script 452 (cuya columna "Fecha de creación" no pudo parsearse).
--
-- Cambio: la tabla de componentes pasa de estar basada en 182 presupuestos
-- ganados (script 549, sin fecha de referencia) a basarse en 63 casos de
-- instalación real de Hogar Seguro ("Alarma Nueva") con período explícito
-- 05/01/2026 al 17/03/2026. Se aclara en el propio dato (grupo de
-- encabezado y de cierre en "kits.grupos") que el archivo fuente trae
-- exactamente 1.000 filas y corta en seco a mitad de marzo — todo indica
-- un export con tope de filas, no el histórico completo — y que el mix de
-- componentes resultante (línea Ajax dominante) difiere del que mostraba
-- la base anterior. "servicios" (Servicios incluidos) no cambia.
--
-- Solo toca la columna "equipamiento" (jsonb). "general", "proceso",
-- precios, faq, competencia y areas quedan sin cambios respecto de v6.
--
-- Idempotente: UPDATE simple sobre la fila ya existente
-- (ficha_id='hogar-venta', version_key='v1.0'). No inserta filas nuevas.
-- =========================================================================

begin;

update ficha_versiones set
  version      = '0.7',
  autor        = 'Borrador (scripts 549/200/452/560/865 + Datos_elementos.csv + Informe_Mapa_Servicios_vs_Operacion.docx + spseguridad.com.ar/hogares) — pend. revisión comercial/instalaciones/precios',
  equipamiento = '{"kits": {"cols": ["Componente", "Subcategoría", "Casos"], "grupos": [{"label": "Período de referencia: 05/01/2026 al 17/03/2026 (fecha de creación del caso / fecha real de instalación) · Base: 63 casos de instalación real de Hogar Seguro (\"Alarma Nueva\"), 438 líneas de artículos \"Equipamiento\" · Fuente: Datos_elementos.csv (25-ago-2026)", "filas": []}, {"label": "Componentes más frecuentes (de 63 casos de instalación real)", "filas": [["MAG001 Magnético Común", "Contacto Magnético", "36"], ["CEN015 Panel Ajax (HUB 4G) Ethernet y 4G x 100 disp.", "Centrales de Alarma", "32"], ["INF014 Infrarrojo Anti-mascota Ajax", "Sensor Movimiento", "30"], ["SIR013 Sirena interior Ajax", "Sirena", "28"], ["SIR014 Sirena exterior Ajax", "Sirena", "27"], ["MAG004 Magnético Inalámbrico Ajax", "Contacto Magnético", "27"], ["KIT-CTRAL24 Central Ajax + 2 MAG + 2 PIR + 1 SIR.INT + 2 C.REM", "Kits", "21"], ["COM001 Comunicador 4G-MAX-T", "Comunicador", "14"], ["INF018 Infrarrojo inalámbrico para exterior Ajax", "Sensor Movimiento", "12"], ["INF001 Infrarrojo DSC LC-100", "Sensor Movimiento", "11"], ["CEN003 Central Titanium PC732T", "Centrales de Alarma", "10"], ["TEC002 Teclado LCD732RF p/ Titanium", "Teclado Alarma", "10"]]}, {"label": "Ojo: el archivo fuente trae exactamente 1.000 filas totales y corta en seco a mitad de marzo (418 líneas en enero, 337 en febrero, 245 en marzo) — todo indica un export con tope de filas, no el histórico completo. Línea Ajax dominante en este período, a diferencia del reparto Hikvision AXPRO / Ajax de la base anterior — a confirmar si es un cambio real de mix o un efecto del recorte. Reemplaza la tabla anterior (182 presupuestos ganados del script 549, sin período de referencia disponible). Hay otros 47 artículos fuera del top 12, cada uno en 5 casos o menos.", "filas": []}]}, "servicios": [{"icon": "ti-tool", "label": "Instalación del sistema", "desc": "Cobertura interior, perímetro de aberturas y espacios exteriores, según el domicilio"}, {"icon": "ti-shield-check", "label": "Monitoreo 24/7", "desc": "Alarma sonora + activación de protocolo desde la central SP"}, {"icon": "ti-bell", "label": "Notificación inmediata", "desc": "Ante cualquier evento"}, {"icon": "ti-device-mobile", "label": "Control desde la App", "desc": "Armado remoto, acceso a cámaras y notificaciones"}, {"icon": "ti-alert-octagon", "label": "Botón de pánico silencioso", "desc": "Pedir ayuda sin exponerse, ideal ante situaciones de riesgo"}, {"icon": "ti-car", "label": "Móvil de Acuda", "desc": "Personal de SP se dirige y permanece en el lugar — [A confirmar zona de cobertura, ej. La Plata, Gonnet, City Bell y Villa Elisa]"}, {"icon": "ti-report", "label": "Informes y avisos automáticos", "desc": "Reporte para control interno del uso del sistema y horarios"}, {"icon": "ti-bolt", "label": "Aviso ante corte de luz", "desc": "—"}]}'::jsonb
where ficha_id = 'hogar-venta' and version_key = 'v1.0';

commit;

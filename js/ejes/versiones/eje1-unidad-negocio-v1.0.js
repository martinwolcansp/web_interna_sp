/* ============================================================
   ejes/versiones/eje1-unidad-negocio-v1.0.js
   Módulo "Unidad de Negocio" (Eje 1) — Sector Comunicaciones — V1.0 (07/07/2026)

   Segundo de los 3 módulos internos del Sector Comunicaciones, junto
   con Procesos (Eje 2) y la Ficha de Producto (Eje 3). Define la
   estructura organizativa, los roles, la dotación, el modelo de abono
   y comodato, y los objetivos e indicadores de gestión del sector.

   Coherencia con los otros módulos:
   - Los roles definidos acá son los mismos que la Ficha de Producto
     (Eje 3, pestaña Áreas) excluye a propósito de su tabla de
     aprobación, para no duplicarlos.
   - El contrato de comodato (Tema 4) es el mismo que referencia la
     Ficha de Producto en su pestaña Precios — mismo link externo
     (ver js/documentos-externos.js, key 'contrato-hellgrun').
   - Los indicadores de gestión (Tema 5) son los mismos 5 KPIs que
     definen el marco de seguimiento del piloto (la ficha suma un
     6º indicador operativo — tiempo de instalación — sin contradecir
     este marco).

   Fuente: Eje1_Unidad_de_Negocio.docx (documento final), con roles
   detallados en Estructura_y_Roles_Sector_Comunicaciones.docx y
   contexto adicional de Proyecto_Sector_Comunicaciones.docx
   (actualizados 07/07/2026), del proyecto "Implementación Unidad de
   Negocio Comunicaciones".
   ============================================================ */

'use strict';

window.EJE_VERSIONS = window.EJE_VERSIONS || {};
window.EJE_VERSIONS['eje1-unidad-negocio'] = window.EJE_VERSIONS['eje1-unidad-negocio'] || {};
window.EJE_VERSIONS['eje1-unidad-negocio']['v1.0'] = {

  /* ── METADATOS DE VERSIÓN ─────────────────────────────── */
  versionId:   'V1.0',
  versionDesc: 'Estructura, roles, abono y contrato definidos',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'eje1-unidad-negocio',
  badge:   'Eje 1 · Sector Comunicaciones',
  name:    'Unidad de Negocio — Sector Comunicaciones',
  version: '1.0',
  date:    '07/07/2026',
  author:  'Sector Comunicaciones',

  /* ── GENERAL ───────────────────────────────────────────── */
  general: {
    descripcion: 'Este módulo reúne las definiciones de creación de la Unidad de Negocio del Sector Comunicaciones: estructura y dependencia jerárquica, dotación inicial, modelo del nuevo abono, contrato de comodato con el cliente, y objetivos e indicadores de gestión. Es el insumo de referencia para la Ficha de Producto (Eje 3) y se complementa con el detalle operativo del módulo Procesos (Eje 2).',
    objetivos: [
      'Migrar progresivamente la base de clientes con sistemas obsoletos hacia centrales híbridas Hellgrun, priorizando los casos de mayor riesgo de incomunicación.',
      'Generar un nuevo flujo de ingresos recurrentes a través del abono de comodato, recuperando la inversión en equipos a partir de la 6ª cuota.',
      'Reducir la dependencia del comunicador Lantrix, transformándolo en una herramienta de transición y no en una solución permanente.',
      'Estandarizar el proceso comercial, técnico y administrativo de venta e instalación de estas nuevas tecnologías.',
      'Capacitar y consolidar un equipo técnico especializado en la tecnología Hellgrun y en la convivencia cableado/inalámbrico.',
    ],
    justificacion: 'El esquema actual (comunicador Lantrix) tiene un techo: mejora la conectividad pero no resuelve la obsolescencia de fondo, ni mejora la rentabilidad de mantenimiento de equipos discontinuados. El esquema de comodato Hellgrun baja la barrera de entrada económica para el cliente, reaprovecha cableado y sensores existentes reduciendo costo y tiempo de obra, convierte una venta puntual en un ingreso recurrente y predecible, y diferencia a SP frente a competidores que solo ofrecen venta directa del equipo.',
    mapaTemas: [
      { tema: 'Tema 1 — Estructura y dependencia jerárquica', estado: 'ok',   fecha: 'Definido (02/07/2026), pendiente de validación formal del Jefe de Ampliaciones' },
      { tema: 'Tema 2 — Dotación inicial del sector',          estado: 'ok',   fecha: 'Definido' },
      { tema: 'Tema 3 — Modelo del nuevo abono',                estado: 'prog', fecha: 'Definido parcialmente' },
      { tema: 'Tema 4 — Contrato de comodato con el cliente',   estado: 'ok',   fecha: 'Definido — sin pendientes de contenido' },
      { tema: 'Tema 5 — Objetivos e indicadores de gestión',    estado: 'prog', fecha: 'Definido el marco de indicadores — faltan metas numéricas' },
    ],
  },

  /* ── ESTRUCTURA Y ROLES (Tema 1) ───────────────────────── */
  estructura: {
    texto: 'El Sector Comunicaciones depende de la Jefatura de Ampliaciones. La estructura del sector queda conformada por cuatro roles: Responsable de Sector, Técnico Comercial, Técnico Instalador y Administrativo de Sector Comunicaciones (este último dependiente del Responsable de Sector). El circuito administrativo de alta de contrato de comodato, orden de instalación y trazabilidad del equipo entregado queda a cargo del Administrativo de Sector Comunicaciones; Administración general se ocupa de la facturación y cobranza del abono, a partir de la información que le traslada ese rol. En esta primera etapa el sector no cuenta con estructura de recursos propia: comparte con el equipo de Ampliaciones herramientas, vehículos y stock. La creación del sector se comunicó a toda la empresa el 02/07/2026.',
    roles: [
      { rol: 'Responsable de Sector Comunicaciones',   dependeDe: 'Jefe de Ampliaciones',                    objetivo: 'Gestionar de forma integral el Sector Comunicaciones, garantizando el cumplimiento de los objetivos comerciales, técnicos y administrativos.' },
      { rol: 'Técnico Comercial',                        dependeDe: 'Responsable de Sector Comunicaciones',    objetivo: 'Contactar y cerrar la migración comercial de clientes candidatos hacia la nueva tecnología.' },
      { rol: 'Técnico Instalador',                        dependeDe: 'Responsable de Sector Comunicaciones',    objetivo: 'Ejecutar la instalación y puesta en marcha de la nueva tecnología en el domicilio del cliente.' },
      { rol: 'Administrativo de Sector Comunicaciones',   dependeDe: 'Responsable de Sector Comunicaciones',    objetivo: 'Gestionar el circuito administrativo interno del sector: alta de contratos de comodato, generación de órdenes de instalación y trazabilidad de los equipos entregados.' },
    ],
    pendientes: [
      'Detalle de qué herramientas, vehículos y stock específicos se comparten con Ampliaciones (formalizar el acuerdo de recursos compartidos).',
      'Validar con el Jefe de Ampliaciones si la baja del comunicador Lantrix aplica en todos los casos donde esté instalado, o hay excepciones.',
      'Validar con Administración el circuito operativo de recepción de información del Técnico Comercial y alta del contrato en el sistema.',
      'Actualizar la misión del sector en "Estructura_y_Roles_Sector_Comunicaciones.docx" para reflejar la exclusión de mantenimiento del alcance (ver Eje 2 y Eje 3), la próxima vez que se pueda re-exportar ese archivo.',
    ],
  },

  /* ── DOTACIÓN Y RECURSOS (Tema 2 + Proyecto 1.5) ───────── */
  dotacion: {
    texto: 'La dotación inicial del sector se conforma reasignando personal del equipo actual de Ampliaciones: sin costo de incorporación, y con un equipo que ya conoce la empresa y la base de clientes. Ya se incorporó al equipo una persona proveniente de Operadores.',
    riesgo: 'Riesgo a monitorear: la reasignación de personal desde Ampliaciones puede generar tensión de recursos con la operación actual de ese equipo.',
    recursos: [
      'Stock de centrales híbridas Hellgrun y dispositivos inalámbricos asociados (sensores, teclados, módulos de comunicación).',
      'Herramientas y vehículos para el equipo de instalación — compartidos con el área de Ampliaciones en esta primera etapa.',
      'Capacitación certificada del proveedor Hellgrun para los técnicos del sector — ya realizada para el equipo actual.',
      'Material comercial: ficha de producto, propuesta económica tipo, comparativo "sistema actual vs. Hellgrun".',
      'Adecuación del sistema administrativo/facturación para soportar el nuevo concepto de abono por comodato.',
      'Contrato de comodato y términos y condiciones revisados por Legal antes del lanzamiento comercial — ver Tema 4.',
    ],
    pendientes: [
      'Relevar la capacidad máxima del equipo actual, para saber cuánto puede absorber el Sector Comunicaciones sin afectar la operación de Ampliaciones.',
      'Dotación específica del rol Administrativo de Sector Comunicaciones, incorporado recientemente a la estructura.',
    ],
  },

  /* ── MODELO DE ABONO (Tema 3) ──────────────────────────── */
  modeloAbono: {
    texto: 'Este tema define a quién le corresponde cada parte del circuito, no el detalle operativo de cada proceso (ese detalle vive en el módulo Procesos, Eje 2). El Administrativo de Sector Comunicaciones da de alta el contrato de comodato y la orden de instalación; Administración general se encarga de la facturación y cobranza del abono, que se factura desde la firma del contrato. El sistema de facturación actual soporta el seguimiento de cuotas de este concepto, y el seguimiento de mora también es responsabilidad de Administración. El tratamiento contable del bien entregado en comodato corresponde al área de Finanzas — no es una definición de este eje.',
    definicionAcordada: 'Definición acordada para el proyecto: el comodato se recupera a través del abono de monitoreo. Se crea un nuevo concepto de ABONO específico para los equipos en comodato Hellgrun, diferenciado del abono de monitoreo estándar, de forma que a partir de la 6ª cuota la empresa haya recuperado el valor del equipo entregado.',
    pendientes: [
      'Si el nuevo abono reemplaza el abono de monitoreo actual del cliente o es un concepto adicional que se suma (mismo punto pendiente en la Ficha de Producto, Eje 3 → Condiciones comerciales).',
      'Precio y composición final del abono — a cargo de Gerencia + Administración (no es una definición de este eje; ver Ficha de Producto, pestaña Precios).',
    ],
  },

  /* ── CONTRATO DE COMODATO (Tema 4) ─────────────────────── */
  contrato: {
    texto: 'El contrato de comodato con el cliente está definido. Regula la provisión del sistema de seguridad en comodato, su instalación, mantenimiento y monitoreo.',
    clausulas: [
      { clausula: 'Duración y cancelación', detalle: '12 meses desde la instalación, con renovación automática mensual a partir del mes 12. Cancelación anticipada con 30 días de preaviso: 6 cuotas si es dentro de los primeros 6 meses, 4 cuotas entre el mes 7 y el 12, sin penalidad vencido el período inicial.' },
      { clausula: 'Propiedad del equipo',     detalle: 'El sistema es propiedad de SP durante toda la vigencia del contrato — no pasa a ser del cliente al alcanzar la cuota 6. Al finalizar el contrato se desinstala y se retira.' },
      { clausula: 'Daño, robo y seguro',      detalle: 'SP no es compañía de seguros; queda a criterio del cliente contratar los seguros que correspondan. Si el equipo no se restituye, se restituye en mal estado o resulta extraviado/hurtado/robado, el costo lo asume el cliente según la lista de precios vigente. El desgaste normal por uso legítimo no es responsabilidad del cliente.' },
      { clausula: 'Mora y suspensión',        detalle: 'A los 30 días corridos de mora, SP puede suspender el servicio; a los 90 días, puede cancelar el contrato aplicando la penalidad de incumplimiento y reportar la mora a centrales de riesgo crediticio (Ley 25.326, derechos ARCO).' },
      { clausula: 'Actualización del abono',  detalle: 'SP puede actualizar el abono con periodicidad mínima de 3 meses según la variación acumulada del IPC (INDEC), con 30 días de aviso previo. Si el cliente no acepta, puede rescindir sin penalidad dentro de los 10 días de notificado (Art. 10 quáter, Ley 24.240).' },
      { clausula: 'Derecho de revocación',    detalle: 'El cliente puede revocar sin justificar motivo dentro de los 10 días corridos desde la firma o la instalación (lo último que ocurra), conforme al art. 34 de la Ley 24.240. SP retira el equipo sin cargo y restituye todo pago anticipado.' },
      { clausula: 'Cesión del contrato',      detalle: 'SP puede ceder el contrato a un tercero, comunicándolo por escrito; el cliente puede rescindir sin penalidad dentro de los 30 días de notificado si la cesión afecta sus intereses. El cliente no puede ceder sus obligaciones sin autorización previa y escrita de SP.' },
      { clausula: 'Protección de datos',      detalle: 'Se rige por la Ley 25.326 y la Ley 27.483. Los datos personales se conservan durante la vigencia del contrato y hasta 5 años después de finalizado; las grabaciones de llamadas, hasta 90 días. El cliente puede ejercer sus derechos ARCO mediante comunicación fehaciente a SP.' },
    ],
    documentos: ['contrato-hellgrun'],
    pendientes: [],
  },

  /* ── OBJETIVOS E INDICADORES DE GESTIÓN (Tema 5) ───────── */
  indicadores: {
    texto: 'El documento general del proyecto define los siguientes indicadores como punto de partida del Sector Comunicaciones. El marco está definido; faltan las metas numéricas.',
    lista: [
      { nombre: 'Cantidad de migraciones / mes',       descripcion: 'Equipos Hellgrun instalados en reemplazo de sistemas obsoletos, por período.' },
      { nombre: 'Tasa de conversión comercial',         descripcion: '% de clientes contactados que aceptan la propuesta de migración.' },
      { nombre: 'Recupero de comodato',                 descripcion: 'Cantidad de equipos que alcanzaron la 6ª cuota de abono (punto de recupero de inversión).' },
      { nombre: 'Tasa de incidencias post-instalación', descripcion: 'Reclamos de servicio técnico sobre equipos Hellgrun en los primeros 90 días.' },
      { nombre: 'Mora del abono de comodato',            descripcion: '% de cuotas de abono comodato impagas, por su impacto directo en el recupero del equipo.' },
    ],
    pendientes: [
      'Meta de migraciones para los primeros 3 meses (fase piloto) y los primeros 12 meses.',
      'Estimación del universo total de clientes con sistemas obsoletos candidatos a migrar.',
      'Objetivo de facturación del nuevo abono para el primer año.',
      'Responsable de reportar los KPIs del sector y frecuencia de reporte.',
    ],
  },

  /* ── PENDIENTES (resumen consolidado, para trasladar a la Ficha de Producto) ── */
  pendientesResumen: [
    { tema: 'Tema 1 — Estructura y dependencia jerárquica', estado: 'rev', pendiente: 'Detalle de recursos compartidos con Ampliaciones; validar baja del Lantrix y circuito con Administración', interlocutor: 'Jefe de Ampliaciones / Administración' },
    { tema: 'Tema 2 — Dotación inicial del sector',          estado: 'rev', pendiente: 'Capacidad máxima del equipo; dotación del rol Administrativo', interlocutor: 'Jefe de Ampliaciones' },
    { tema: 'Tema 3 — Modelo del nuevo abono',                estado: 'rev', pendiente: 'Si el abono reemplaza o se suma al abono de monitoreo actual; precio final', interlocutor: 'Gerencia + Administración' },
    { tema: 'Tema 4 — Contrato de comodato con el cliente',   estado: 'ok',  pendiente: 'Sin pendientes de contenido — falta cargar el link externo al documento', interlocutor: '—' },
    { tema: 'Tema 5 — Objetivos e indicadores de gestión',    estado: 'rev', pendiente: 'Metas numéricas de los indicadores y responsable de reporte', interlocutor: 'Gerencia' },
  ],

};

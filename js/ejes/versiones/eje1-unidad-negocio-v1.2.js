/* ============================================================
   ejes/versiones/eje1-unidad-negocio-v1.2.js
   Módulo "Unidad de Negocio" (Eje 1) — Sector Comunicaciones — V1.2 (08/07/2026)

   Suma sobre v1.1:
   - Tema 4 (Contrato de comodato con el cliente) — contrato revisado:
       · Se elimina la penalidad por cuotas ante baja anticipada. En su
         lugar, subsiste la obligación autónoma de restituir el equipo
         dentro de los 10 días de la baja; si no se restituye (o se
         restituye dañado/incompleto), el cliente debe abonar su valor.
       · Nueva cláusula "Conexidad contractual": comodato y monitoreo
         son un negocio jurídico único (arts. 1073 a 1075 CCyC) — si el
         monitoreo se extingue, el comodato se extingue con él.
       · "Daño, robo y seguro": el valor del equipo se determina por la
         factura de compra de SP o, en caso de disputa, tasación de un
         tercero independiente (antes: lista de precios vigente de SP).
       · "Mora y suspensión": a los 90 días de mora ya no se aplica una
         penalidad por incumplimiento, sino que se torna exigible la
         restitución inmediata del equipo o el pago de su valor.
       · "Actualización del abono": se agrega índice sustituto del IPC
         si el INDEC lo discontinúa o modifica su metodología.
       · Nueva cláusula "Jurisdicción": rige el art. 36 LDC (domicilio
         del consumidor), sin cláusula de jurisdicción pactada.
       · Tema 4 pasa de "sin pendientes" a un pendiente: completar en
         el contrato el correo electrónico habilitado para el Derecho
         de Revocación (dato en blanco en el original).

   Fuente: Eje1_Unidad_de_Negocio.docx (actualizado 08/07/2026), del
   proyecto "Implementación Unidad de Negocio Comunicaciones".
   ============================================================ */

'use strict';

window.EJE_VERSIONS = window.EJE_VERSIONS || {};
window.EJE_VERSIONS['eje1-unidad-negocio'] = window.EJE_VERSIONS['eje1-unidad-negocio'] || {};
window.EJE_VERSIONS['eje1-unidad-negocio']['v1.2'] = {

  /* ── METADATOS DE VERSIÓN ─────────────────────────────── */
  versionId:   'V1.2',
  versionDesc: 'Contrato revisado: sin penalidad, restitución/valor del equipo y conexidad',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'eje1-unidad-negocio',
  badge:   'Eje 1 · Unidad de Negocio',
  name:    'Unidad de Negocio — Sector Comunicaciones',
  version: '1.2',
  date:    '08/07/2026',
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
      { tema: 'Tema 3 — Modelo del nuevo abono',                estado: 'ok',   fecha: 'Definido — sin pendientes (abono ABO-16, $66.000/mes, instalación sin cargo)' },
      { tema: 'Tema 4 — Contrato de comodato con el cliente',   estado: 'ok',   fecha: 'Definido — sin penalidad por baja anticipada (restitución/valor del equipo y conexidad contractual); falta completar el email para el Derecho de Revocación' },
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
    texto: 'Este tema define a quién le corresponde cada parte del circuito, no el detalle operativo de cada proceso (ese detalle vive en el módulo Procesos, Eje 2). Sector Comunicaciones (Administrativo de Sector Comunicaciones) da de alta el contrato de comodato, la orden de instalación y carga el nuevo abono en la OV (orden de venta); Administración general factura con ese abono desde la firma del contrato y se encarga de la cobranza. El sistema de facturación actual soporta el seguimiento de cuotas de este concepto, y el seguimiento de mora también es responsabilidad de Administración. El tratamiento contable del bien entregado en comodato corresponde al área de Finanzas — no es una definición de este eje.',
    definicionAcordada: 'El nuevo abono para Nuevas Tecnologías es un abono único que incluye la comunicación por chip celular (no es un concepto separado del monitoreo ni del comodato del equipo). En NetSuite se factura como ABO-16 Abono Mensual de Monitoreo - 4G/Hellgrun/Ajax, que incluye ABO-10 y ABO-11. Precio actual: $66.000 por mes (al 8 de julio de 2026). La instalación no tiene cargo para el cliente. El comodato se recupera a través de este abono, de forma que a partir de la 6ª cuota la empresa haya recuperado el valor del equipo entregado.',
    pendientes: [],
  },

  /* ── CONTRATO DE COMODATO (Tema 4) ─────────────────────── */
  contrato: {
    texto: 'El contrato de comodato con el cliente está definido. Regula la provisión del sistema de seguridad en comodato, su instalación, mantenimiento y monitoreo.',
    clausulas: [
      { clausula: 'Duración y cancelación',   detalle: '12 meses desde la instalación, con renovación automática mensual a partir del mes 12. Cancelación anticipada con 30 días de preaviso y sin penalidad en ningún momento del contrato. Subsiste la obligación autónoma de restituir el equipo dentro de los 10 días de operada la baja; si no se restituye (o se restituye dañado o incompleto), el cliente debe abonar su valor (ver "Daño, robo y seguro").' },
      { clausula: 'Propiedad del equipo',     detalle: 'El sistema es propiedad de SP durante toda la vigencia del contrato — no pasa a ser del cliente al alcanzar la cuota 6. Al finalizar el contrato se desinstala y se retira.' },
      { clausula: 'Conexidad contractual',    detalle: 'El comodato del equipo y el servicio de monitoreo constituyen un negocio jurídico único (arts. 1073 a 1075 CCyC): el comodato existe solo por la prestación del monitoreo, sin vida propia. Si el monitoreo se extingue por cualquier causa (vencimiento, rescisión o incumplimiento), el comodato se extingue con él y la restitución del equipo se vuelve exigible de inmediato. Ninguna de las partes puede invocar el estado de una prestación para incumplir la otra.' },
      { clausula: 'Daño, robo y seguro',      detalle: 'SP no es compañía de seguros; queda a criterio del cliente contratar los seguros que correspondan. Si el equipo no se restituye, se restituye en mal estado o resulta extraviado/hurtado/robado, el costo lo asume el cliente. El valor se determina con un criterio objetivo: la factura de compra del equipo por parte de SP o, en caso de disputa, la tasación de un tercero independiente designado de común acuerdo. El desgaste normal por uso legítimo no es responsabilidad del cliente.' },
      { clausula: 'Mora y suspensión',        detalle: 'A los 30 días corridos de mora, SP puede suspender el servicio; a los 90 días, puede cancelar el contrato, lo que torna exigible la restitución inmediata del equipo o el pago de su valor (ya no se aplica una penalidad por incumplimiento). En cancelaciones por mora mayor a 90 días, el cliente autoriza a SP a reportar la mora a centrales de riesgo crediticio (Ley 25.326, derechos ARCO).' },
      { clausula: 'Actualización del abono',  detalle: 'SP puede actualizar el abono con periodicidad mínima de 3 meses según la variación acumulada del IPC (INDEC). Si el INDEC discontinúa el IPC o modifica sustancialmente su metodología, se aplica automáticamente el índice oficial que lo suceda o, en su defecto, otro similar a acordar entre las partes, sin que esto paralice la actualización. Con 30 días de aviso previo; si el cliente no acepta, puede rescindir sin penalidad dentro de los 10 días de notificado (Art. 10 quáter, Ley 24.240).' },
      { clausula: 'Derecho de revocación',    detalle: 'El cliente puede revocar sin justificar motivo dentro de los 10 días corridos desde la firma o la instalación (lo último que ocurra), conforme al art. 34 de la Ley 24.240. SP retira el equipo sin cargo y restituye todo pago anticipado. [PENDIENTE] — falta completar en el contrato el correo electrónico habilitado para ejercer este derecho (dato en blanco en el original).' },
      { clausula: 'Cesión del contrato',      detalle: 'SP puede ceder el contrato a un tercero, comunicándolo por escrito; el cliente puede rescindir sin penalidad dentro de los 30 días de notificado si la cesión afecta sus intereses. El cliente no puede ceder sus obligaciones sin autorización previa y escrita de SP.' },
      { clausula: 'Jurisdicción',             detalle: 'El contrato no fija una cláusula de jurisdicción; aplica el régimen legal por defecto (art. 36, Ley 24.240), que da competencia al domicilio del consumidor, sin opción para SP.' },
      { clausula: 'Protección de datos',      detalle: 'Se rige por la Ley 25.326 y la Ley 27.483. Los datos personales se conservan durante la vigencia del contrato y hasta 5 años después de finalizado; las grabaciones de llamadas, hasta 90 días. El cliente puede ejercer sus derechos ARCO mediante comunicación fehaciente a SP.' },
    ],
    documentos: ['contrato-hellgrun'],
    pendientes: [
      'Completar en el contrato el correo electrónico habilitado para el Derecho de Revocación (dato en blanco en el original).',
    ],
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
    { tema: 'Tema 3 — Modelo del nuevo abono',                estado: 'ok',  pendiente: 'Sin pendientes — abono ABO-16 (incluye ABO-10 y ABO-11), $66.000/mes, instalación sin cargo', interlocutor: '—' },
    { tema: 'Tema 4 — Contrato de comodato con el cliente',   estado: 'rev', pendiente: 'Completar el correo electrónico habilitado para el Derecho de Revocación', interlocutor: 'Legal' },
    { tema: 'Tema 5 — Objetivos e indicadores de gestión',    estado: 'rev', pendiente: 'Metas numéricas de los indicadores y responsable de reporte', interlocutor: 'Gerencia' },
  ],

};

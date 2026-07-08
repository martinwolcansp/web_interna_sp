/* ============================================================
   ejes/versiones/eje2-procesos-v1.1.js
   Módulo "Procesos" (Eje 2) — Sector Comunicaciones — V1.1 (08/07/2026)

   Suma sobre v1.0:
   - Proceso 1 (Comercial): el monto del nuevo abono ya está definido
     ($66.000/mes, ABO-16, instalación sin cargo) — deja de ser un
     punto crítico bloqueante; se refleja en el paso "Elaboración de
     la propuesta comercial".
   - Proceso 2 (Instalación): protocolo de baja del comunicador Lantrix
     resuelto — se extrae el chip celular y se reutiliza en el mismo
     abono para la comunicación del nuevo equipo (no se da de alta una
     línea nueva).
   - Proceso 3 (Administrativo): se detalla el código de abono cargado
     en la OV (ABO-16) y su precio.
   - Tabla de bloqueantes: se sacan las dos filas resueltas (monto del
     abono, protocolo de baja del Lantrix).

   Fuente: Eje2_Procesos.docx (actualizado 08/07/2026), del proyecto
   "Implementación Unidad de Negocio Comunicaciones".
   ============================================================ */

'use strict';

window.EJE_VERSIONS = window.EJE_VERSIONS || {};
window.EJE_VERSIONS['eje2-procesos'] = window.EJE_VERSIONS['eje2-procesos'] || {};
window.EJE_VERSIONS['eje2-procesos']['v1.1'] = {

  /* ── METADATOS DE VERSIÓN ─────────────────────────────── */
  versionId:   'V1.1',
  versionDesc: 'Precio del abono definido y baja del Lantrix resuelta',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'eje2-procesos',
  badge:   'Eje 2 · Procesos',
  name:    'Procesos — Sector Comunicaciones',
  version: '1.1',
  date:    '08/07/2026',
  author:  'Sector Comunicaciones',

  /* ── GENERAL ───────────────────────────────────────────── */
  general: {
    descripcion: 'Este módulo define los procesos que necesita el Sector Comunicaciones para operar: el proceso comercial (cómo llegamos al cliente y cerramos la venta), el proceso de instalación (cómo ejecutamos el trabajo técnico) y el proceso administrativo del comodato y el abono. El mantenimiento de los equipos es responsabilidad de Servicio Técnico y no se incluye en este análisis por el momento — ver su validación en la Ficha de Producto (Eje 3, pestaña Áreas).',
    mapaProcesos: [
      { proceso: 'Proceso 1: Comercial',                    actores: 'Técnico Comercial, Jefe de Ampliaciones, Administración',      dispara: 'Identificación de cliente con sistema obsoleto',            cierra: 'Firma del contrato de comodato y alta administrativa' },
      { proceso: 'Proceso 2: Instalación',                   actores: 'Técnico Instalador, Central de Monitoreo, Administración',      dispara: 'Orden de trabajo generada tras cierre comercial',            cierra: 'Puesta en marcha, alta en monitoreo y entrega de documentación al cliente' },
      { proceso: 'Proceso 3: Administrativo del comodato',   actores: 'Administración, Gerencia',                                     dispara: 'Alta del contrato de comodato',                              cierra: 'Recupero del valor del equipo en cuota 6 y cierre de contrato' },
    ],
    flujo: 'Cartera de clientes obsoletos → Contacto comercial → Relevamiento → Propuesta → Cierre y firma de comodato → Alta administrativa → Instalación técnica → Puesta en marcha y alta en monitoreo → Facturación de abono Comunicaciones → Recupero de inversión en cuota 6.',
  },

  /* ── PROCESO 1 — COMERCIAL ─────────────────────────────── */
  comercial: {
    pasos: [
      { title: 'Identificación del cliente candidato', note: 'El listado se construye internamente, a cargo del responsable del área, priorizando por antigüedad del sistema instalado (la tecnología por la que se comienza ya está definida).' },
      { title: 'Contacto inicial con el cliente',       note: 'A cargo del Sector Comunicaciones. No hay visita presencial de relevamiento en esta etapa; el relevamiento técnico se hace durante la instalación (Proceso 2).' },
      { title: 'Elaboración de la propuesta comercial',  note: 'Equipo en comodato, elementos a agregar y nuevo abono mensual ($66.000/mes, ABO-16, instalación sin cargo — valor al 8/7/2026), con el guion y contenido de venta definidos en la Ficha de Producto (Eje 3).' },
      { title: 'Presentación al cliente y objeciones',   note: 'Gestión de objeciones frecuentes (ver Ficha de Producto → FAQ).' },
      { title: 'Cierre: aceptación y firma',             note: 'Firma del contrato de comodato y condiciones del nuevo abono. El Técnico Comercial no tiene, por el momento, restricciones de descuento ni requiere aprobación interna previa.' },
      { title: 'Confirmación de agenda de instalación',  note: 'Fecha y hora, a cargo del Técnico Comercial durante la llamada de cierre.' },
      { title: 'Traspaso a Administración',              note: 'Se entrega el contrato de comodato firmado para el alta administrativa y la generación de la orden de instalación.' },
    ],
    puntosCriticos: [
      'Falta definir cuánto tiempo demora Administración en procesar el alta del contrato una vez cerrada la venta, y si la firma del contrato es en papel, digital o ambas.',
    ],
  },

  /* ── PROCESO 2 — INSTALACIÓN ───────────────────────────── */
  instalacion: {
    pasos: [
      { title: 'Recepción de la orden de trabajo',        note: 'El Técnico Instalador recibe el relevamiento comercial y la agenda de instalación ya confirmada por el Técnico Comercial.' },
      { title: 'Relevamiento técnico final en sitio',      note: 'Validación de cableado existente a reutilizar, definición de elementos inalámbricos adicionales y materiales necesarios.' },
      { title: 'Preparación del equipo',                   note: 'Central Hellgrun, dispositivos inalámbricos, materiales de instalación. [A DEFINIR: responsable de esta tarea]' },
      { title: 'Instalación física de la central híbrida', note: 'Integración de elementos cableados existentes y nuevos elementos inalámbricos.' },
      { title: 'Configuración y programación',             note: 'Zonas, particiones, usuarios del cliente, módulo de comunicación hacia la central de monitoreo.' },
      { title: 'Pruebas de funcionamiento',                note: 'Cada zona, comunicación con monitoreo, batería de respaldo.' },
      { title: 'Capacitación básica al cliente',           note: 'Armado, desarmado, códigos de usuario, contacto ante fallas.' },
      { title: 'Baja del comunicador Lantrix',             note: 'Si el cliente lo tuviera activo: se extrae el chip celular del comunicador y se reutiliza en el mismo abono para la comunicación del nuevo equipo (no se da de alta una línea nueva).' },
      { title: 'Cierre de la orden de trabajo',            note: 'Firma del cliente, registro del número de serie del equipo entregado en comodato, notificación a Administración.' },
      { title: 'Alta definitiva en el sistema de monitoreo', note: 'Con el nuevo equipo dado de alta.' },
    ],
    nota: 'No se define todavía un tiempo estándar de instalación ni un checklist formal específico para la tecnología Hellgrun.',
    puntosCriticos: [
      'Protocolo a definir con el Jefe de Ampliaciones: qué hacer si al llegar a sitio el cableado existente no está en condiciones de reutilizarse (suspender la instalación, reformular la propuesta, o resolver con más elementos inalámbricos).',
      'Responsable de la tarea de preparación de los equipos antes de la instalación: a definir con el Jefe de Ampliaciones / Técnico Instalador.',
      'Resuelto: si el cliente tiene comunicador Lantrix instalado, se extrae el chip celular y se reutiliza en el mismo abono para la comunicación del nuevo equipo (no se da de alta una línea nueva).',
      'La extracción del chip y baja del comunicador Lantrix debe coordinarse con la Central de Monitoreo para no dejar al cliente sin comunicación en ningún momento durante el cambio.',
      'El registro del número de serie del equipo es obligatorio desde el primer día: el bien está en comodato y debe quedar trazado.',
      'Proceso de alta de equipos Hellgrun en el sistema de monitoreo: a definir con la Central de Monitoreo.',
    ],
  },

  /* ── PROCESO 3 — ADMINISTRATIVO DEL COMODATO Y EL ABONO ── */
  administrativo: {
    pasos: [
      { title: 'Alta del contrato de comodato',   note: 'En el sistema administrativo: equipo, número de serie, fecha de inicio, condiciones.' },
      { title: 'Creación del nuevo concepto de abono', note: 'Sector Comunicaciones carga el nuevo abono (ABO-16 Abono Mensual de Monitoreo - 4G/Hellgrun/Ajax) en la OV (orden de venta); Administración general factura con ese abono. Precio: $66.000 por mes (al 8 de julio de 2026); la instalación no tiene cargo.' },
      { title: 'Facturación mensual del abono',   note: 'A partir del mes acordado (inicio de instalación o puesta en marcha).' },
      { title: 'Seguimiento del pago del abono',  note: 'Control de mora con circuito prioritario, dado el impacto en el recupero del equipo.' },
      { title: 'Control del hito de cuota 6',     note: 'Registro de qué equipos alcanzaron el punto de recupero.' },
      { title: 'Procedimiento de baja',            note: 'Si el cliente da de baja antes de la cuota 6, activar el protocolo de recupero del equipo o del saldo (a definir con Legal).' },
    ],
    puntosCriticos: [
      'Administración indicó que falta definir en conjunto cómo se va a llevar adelante toda la gestión del comodato: si el sistema actual permite crear el concepto de abono con seguimiento de cuotas e hitos (cuota 1, cuota 6, etc.), si se puede asociar el número de serie del equipo a cada contrato para trazabilidad, cómo se gestiona hoy la mora en abonos, y si existe un proceso de baja de servicio con checklist de acciones (notificación, recupero de equipo, facturación de saldo).',
    ],
  },

  /* ── PUNTOS CRÍTICOS CONSOLIDADOS (bloquean la operación) ── */
  bloqueantes: [
    { punto: 'Capacitación técnica Hellgrun completada',                                    proceso: 'Instalación (no hay obra sin técnicos capacitados)',          interlocutor: 'Proveedor Hellgrun + Jefe de Ampliaciones' },
    { punto: 'Proceso de alta en monitoreo para equipos Hellgrun',                          proceso: 'Instalación (no hay puesta en marcha sin esto)',              interlocutor: 'Central de Monitoreo' },
    { punto: 'Protocolo si el cableado existente no es reutilizable en sitio',              proceso: 'Instalación',                                                 interlocutor: 'Jefe de Ampliaciones' },
    { punto: 'Responsable de la preparación de los equipos previa a la instalación',        proceso: 'Instalación',                                                 interlocutor: 'Jefe de Ampliaciones / Técnico Instalador' },
    { punto: 'Tiempo de procesamiento del alta del contrato y formato de firma (papel/digital)', proceso: 'Comercial',                                              interlocutor: 'Administración' },
    { punto: 'Gestión administrativa del comodato en el sistema (alta con N° de serie, seguimiento de mora, checklist de baja)', proceso: 'Administrativo',        interlocutor: 'Administración' },
  ],

};

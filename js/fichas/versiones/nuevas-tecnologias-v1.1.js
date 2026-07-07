/* ============================================================
   fichas/versiones/nuevas-tecnologias-v1.1.js
   Ficha "Nuevas Tecnologías" — Migración a comodato — V1.1 (07/07/2026)

   Suma sobre v1.0:
   - Se nombra la tecnología del proveedor (Hellgrun, antes deliberada-
     mente omitida por "puede cambiar") y el comunicador de transición
     que reemplaza (Lantrix) — ambos ya se usan de forma consistente
     en los documentos fuente.
   - Contrato de comodato cerrado: permanencia (12 meses + renovación
     mensual automática), condiciones de baja anticipada (6 cuotas /
     4 cuotas / sin penalidad según antigüedad), derecho de revocación
     de 10 días (Ley 24.240) y mecanismo de ajuste del abono por IPC.
   - Se confirma la app del cliente (Hellgrün Check, sin costo
     adicional) y se suman los servicios SP Acuda, video-verificación
     opcional y aviso de corte/restablecimiento de luz (220V).
   - La estructura y roles del sector pasan a "definida" (Eje 1, Tema 1)
     y la capacitación técnica del equipo ya está realizada.
   - Pestaña Áreas corregida: lista las áreas YA EXISTENTES de la empresa
     que deben aprobar o ser informadas de este nuevo servicio (Jefatura
     de Ampliaciones, Gerencia, Administración, Legal, Central de
     Monitoreo, Servicio Técnico) en lugar de los roles nuevos del propio
     Sector Comunicaciones, que quedan descriptos en la pestaña Proceso.

   Sigue pendiente: precio y composición del abono (Gerencia +
   Administración) y los datos técnicos del equipo — modelo, zonas,
   protocolo de comunicación, batería y garantía (proveedor Hellgrun).

   Fuente: Eje1_Unidad_de_Negocio, Eje2_Procesos, Eje3_Ficha_Producto y
   Proyecto_Sector_Comunicaciones (actualizados 07/07/2026), del
   proyecto "Implementación Unidad de Negocio Comunicaciones".
   ============================================================ */

'use strict';

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};
window.FICHA_VERSIONS['nuevas-tecnologias'] = window.FICHA_VERSIONS['nuevas-tecnologias'] || {};
window.FICHA_VERSIONS['nuevas-tecnologias']['v1.1'] = {

  /* ── METADATOS DE VERSIÓN (para el selector) ──────────── */
  versionId:   'V1.1',
  versionDesc: 'Contrato, app y roles definidos',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'nuevas-tecnologias',
  badge:   'Piloto · Sector Comunicaciones',
  name:    'Nuevas Tecnologías — Migración a Comodato',
  version: '1.1',
  date:    '07/07/2026',
  author:  'Sector Comunicaciones',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: 'Actualizamos el sistema de seguridad del cliente sin que tenga que comprar el equipo: se entrega en comodato. La nueva central híbrida Hellgrun reutiliza el cableado y los sensores existentes que sigan funcionando, sumando dispositivos inalámbricos donde haga falta — esto reduce la obra frente a una instalación nueva desde cero. Resuelve de forma definitiva el problema de fondo (central y componentes obsoletos), reemplazando el comunicador Lantrix que hoy palía solo el síntoma de incomunicación. Es además escalable: agregar zonas o dispositivos a futuro no requiere nueva obra de cableado. Piloto interno del Sector Comunicaciones (Área de Ampliaciones) sobre cartera de clientes actuales — todavía no es una oferta comercial abierta.',
    infocards: [
      { icon: 'ti-users',         title: 'Cliente objetivo',    body: 'Cartera actual con tecnología obsoleta, prioritariamente clientes con el comunicador Lantrix activo — grupo piloto de aprox. 50 clientes' },
      { icon: 'ti-contract',      title: 'Permanencia',        body: 'Sin permanencia mínima formal — contrato de 12 meses con renovación mensual automática; baja anticipada con penalidad según antigüedad (ver pestaña Precios)' },
      { icon: 'ti-device-mobile', title: 'Plataforma / app',    body: 'App Hellgrün Check — activar/desactivar, invitar usuarios, anular zonas y enviar emergencias, sin costo adicional' },
    ],
    comercializacion: [
      'Equipamiento en comodato — sin costo de compra para el cliente',
      'Central híbrida Hellgrun: integra el cableado y sensores existentes que sigan siendo reutilizables + dispositivos inalámbricos nuevos donde haga falta',
      'Reemplaza de forma definitiva el comunicador Lantrix que el cliente pueda tener instalado hoy',
      'Incluye envío de móvil de seguridad ante un Evento de Alarma (SP Acuda) y app Hellgrün Check sin costo adicional',
      'Video-verificación opcional con cámaras propias del cliente, mediante abono adicional — [PENDIENTE] costo a definir con Gerencia',
      'Recupero de la inversión a través del abono — estimado en la 6ª cuota, mes exacto NO validado todavía con números reales (ver pestaña Áreas → Administrativo de Sector Comunicaciones)',
    ],
    checklist: [
      { label: 'Identificación del servicio (Eje 3, Sección 1)', status: 'ok' },
      { label: 'Propuesta de valor y objeciones (Eje 3, Sección 2)', status: 'ok' },
      { label: 'Datos comerciales — permanencia, baja y ajuste ya cerrados por contrato; falta precio y composición del abono', status: 'rev', fecha: 'Pendiente: Gerencia + Administración' },
      { label: 'Datos técnicos — modelo, zonas, protocolo, batería y garantía', status: 'rev', fecha: 'Pendiente: confirmar con el proveedor Hellgrun' },
      { label: 'Contrato de comodato con el cliente', status: 'ok', fecha: 'Definido — ver condiciones en la pestaña Precios' },
      { label: 'Estructura y roles del Sector Comunicaciones', status: 'ok', fecha: 'Definida (Eje 1, Tema 1) — pendiente formalizar roles compartidos con Ampliaciones' },
      { label: 'Capacitación técnica del equipo', status: 'ok', fecha: 'Equipo ya capacitado en Hellgrun — falta referencia formal (contenido, fecha, certificación)' },
      { label: 'Objetivos e indicadores de gestión (metas)', status: 'rev', fecha: 'Catálogo cargado, metas numéricas pendientes (Eje 1, Tema 6)' },
      { label: 'Validación de Servicio Técnico (mantenimiento de los equipos)', status: 'rev', fecha: 'Pendiente — ver pestaña Áreas' },
      { label: 'Piloto con clientes', status: 'rev', fecha: 'No iniciado — depende de precio del abono y datos técnicos del proveedor' },
    ],
  },

  /* ── EQUIPAMIENTO ────────────────────────────────────── */
  equipamiento: {
    kits: {
      cols: ['Componente', 'Central Híbrida Hellgrun — Piloto'],
      grupos: [
        {
          label: 'Equipamiento instalado — en comodato',
          filas: [
            ['Central híbrida Hellgrun (modelo a confirmar con el proveedor)',            '[PENDIENTE]'],
            ['Módulo de comunicación hacia la central de monitoreo',                       '[PENDIENTE — protocolo a confirmar: IP / 4G / dual]'],
            ['Elementos cableados reutilizados del cliente (sensores, sirenas)',           'Según relevamiento técnico'],
            ['Dispositivos inalámbricos adicionales',                                      '[PENDIENTE — lista de sensores/detectores/sirenas compatibles]'],
          ],
        },
        {
          label: 'Aplicación para smartphone del cliente',
          filas: [
            ['App Hellgrün Check', 'Incluida sin costo adicional — activar/desactivar, invitar usuarios, anular zonas, enviar emergencias'],
          ],
        },
      ],
    },
    servicios: [
      { icon: 'ti-shield-check', label: 'Monitoreo 24/7',            desc: 'La Central de Monitoreo recibe los eventos del nuevo módulo de comunicación' },
      { icon: 'ti-wifi',         label: 'Tecnología híbrida',         desc: 'Convive cableado existente reutilizable + dispositivos inalámbricos nuevos' },
      { icon: 'ti-car',          label: 'Respaldo ante evento (SP Acuda)', desc: 'Envío de un móvil de seguridad para verificar la situación ante un Evento de Alarma' },
      { icon: 'ti-video',        label: 'Video-verificación opcional', desc: 'Con cámaras del cliente y abono adicional, el Centro de Monitoreo verifica visualmente cada evento y el cliente accede a las cámaras en tiempo real desde la app' },
      { icon: 'ti-bolt',         label: 'Aviso de corte de luz',      desc: 'El sistema notifica al cliente cuando se corta y cuando se restablece la alimentación eléctrica de 220V' },
      { icon: 'ti-activity',     label: 'Diagnóstico remoto',         desc: '[PENDIENTE] — alcance real de la plataforma de gestión del proveedor' },
      { icon: 'ti-tool',         label: 'Garantía de fabricante',     desc: '[PENDIENTE] — plazo y alcance a confirmar con el proveedor' },
    ],
  },

  /* ── PRECIOS ─────────────────────────────────────────── */
  precios: {
    cards: [
      { label: 'Abono mensual — Comodato Nuevas Tecnologías', value: '$ [PENDIENTE]', sub: 'Monto y composición (¿incluye monitoreo o es un concepto separado?) a definir con Gerencia + Administración', featured: true, featuredLabel: 'En definición' },
    ],
    alerta: 'Precio y composición del abono aún no validados. No usar cifras de análisis internos de rentabilidad del leasing en esta ficha — esa información es de uso exclusivo de Gerencia. Esta sección se completa cuando se cierre el valor final del abono al cliente.',
    cancelacion: [
      { momento: 'Dentro de los primeros 6 meses del contrato',                 penalidad: '6 cuotas del abono vigente' },
      { momento: 'Entre el mes 7 y el mes 12 del contrato',                     penalidad: '4 cuotas del abono vigente' },
      { momento: 'Después del mes 12 (renovación mensual automática)',         penalidad: 'Sin penalidad — con 30 días de preaviso' },
      { momento: 'Revocación dentro de los 10 días corridos desde la instalación', penalidad: 'Sin penalidad — devolución de lo abonado y retiro del equipo sin cargo (Art. 34, Ley 24.240)' },
    ],
    notas: [
      { icon: 'ti-info-circle',    color: '#2563eb', text: 'Ajuste del abono: se actualiza según la variación acumulada del IPC (INDEC), con periodicidad mínima de 3 meses y aviso previo de 30 días. Si el cliente no acepta el nuevo precio, puede rescindir sin penalidad dentro de los 10 días de notificado.' },
      { icon: 'ti-alert-triangle', color: '#d97706', text: 'Precio del abono y su composición aún no validados — ver estado real en el checklist de la pestaña General.' },
    ],
  },

  /* ── PROCESO ─────────────────────────────────────────── */
  proceso: {
    secciones: [
      {
        label: 'Comercial',
        pasos: [
          { title: 'Identificación de cartera',   note: 'Grupo inicial de clientes con tecnología obsoleta (aprox. 50), priorizados por antigüedad tecnológica' },
          { title: 'Contacto y diagnóstico',      note: 'El Técnico Comercial agenda la visita y releva el sistema actual (marca, antigüedad, cableado reutilizable)' },
          { title: 'Propuesta comercial',         note: 'Con esta ficha de producto — equipo en comodato + elementos a agregar + abono mensual [pendiente el precio final]; permanencia, baja anticipada y ajuste ya definidos por contrato' },
          { title: 'Cierre y firma',              note: 'Firma del contrato de comodato y de las condiciones del nuevo abono' },
          { title: 'Traspaso administrativo',     note: 'Al Administrativo de Sector Comunicaciones, para el alta del contrato y la orden de instalación' },
        ],
      },
      {
        label: 'Instalación',
        pasos: [
          { title: 'Relevamiento técnico final',        note: 'Confirmación de elementos reutilizables y definición de los dispositivos inalámbricos a sumar' },
          { title: 'Instalación de la central híbrida', note: 'Central Hellgrun — integra los elementos cableados existentes y los nuevos dispositivos inalámbricos' },
          { title: 'Configuración y pruebas',           note: 'Zonas, usuarios, comunicación con monitoreo, batería de respaldo' },
          { title: 'Baja del comunicador anterior',     note: 'Baja del comunicador Lantrix, coordinada con la Central de Monitoreo para no dejar al cliente sin comunicación' },
          { title: 'Cierre de la orden de trabajo',     note: 'El Administrativo de Sector Comunicaciones registra el número de serie del equipo entregado' },
        ],
      },
    ],
    netsuite: [
      { articulo: 'Abono Comodato Nuevas Tecnologías', codigo: '[PENDIENTE]', desc: 'Nuevo concepto de abono — todavía no creado en el sistema administrativo' },
    ],
    indicadores: [
      { nombre: 'Cantidad de migraciones / mes',           descripcion: 'Equipos nuevos instalados en reemplazo de sistemas obsoletos, por período.',        meta: '[PENDIENTE] — a definir con Gerencia' },
      { nombre: 'Tasa de conversión comercial',             descripcion: '% de clientes contactados que aceptan la propuesta de migración.',                   meta: '[PENDIENTE]' },
      { nombre: 'Tiempo promedio de instalación',           descripcion: 'Desde la aceptación comercial hasta la puesta en marcha y el alta en monitoreo.',    meta: '[PENDIENTE]' },
      { nombre: 'Recupero de comodato',                     descripcion: 'Cantidad de equipos que alcanzaron el punto de recupero de la inversión.',           meta: '[PENDIENTE] — mes de recupero aún no validado' },
      { nombre: 'Tasa de incidencias post-instalación',     descripcion: 'Reclamos de servicio técnico sobre equipos migrados, en los primeros 90 días.',      meta: '[PENDIENTE]' },
      { nombre: 'Mora del abono de comodato',                descripcion: '% de cuotas del abono de comodato impagas.',                                        meta: '[PENDIENTE]' },
    ],
  },

  /* ── FAQ ─────────────────────────────────────────────── */
  faq: [
    { q: '"Ya tengo el arreglo del comunicador y funciona bien" — ¿por qué migrar?',
      a: 'El comunicador Lantrix resuelve la comunicación pero el sistema de base sigue siendo antiguo: si la central falla, ya no hay repuestos ni soporte. La migración resuelve el problema de fondo con una cuota mensual accesible.' },
    { q: '¿Por qué sumar otra cuota mensual?',
      a: 'No es un gasto adicional aislado: reemplaza la situación actual (esperar que el sistema falle y enfrentar un gasto imprevisto mayor) por una cuota predecible que incluye el equipo nuevo en comodato.' },
    { q: '¿Qué pasa si el cliente quiere dar de baja el servicio?',
      a: 'Puede hacerlo con 30 días de preaviso. Si cancela dentro de los primeros 6 meses corresponden 6 cuotas del abono vigente; entre el mes 7 y el 12, 4 cuotas; pasado el mes 12 no hay penalidad. Además, tiene 10 días corridos desde la instalación para revocar el contrato sin dar motivo, con devolución de lo abonado y retiro del equipo sin cargo (Art. 34, Ley 24.240).' },
    { q: '¿El equipo nuevo pasa a ser del cliente en algún momento?',
      a: 'No. El equipo sigue siendo propiedad de SP durante toda la vigencia del contrato, incluso después de la cuota de recupero estimada (6ª): no pasa a ser del cliente en ningún momento. Al finalizar el contrato se desinstala y se retira. [PENDIENTE] — falta definir con Gerencia si, a partir de esa cuota, el monto del abono baja, sigue igual o cambia de categoría.' },
    { q: '¿La app del cliente tiene costo adicional?',
      a: 'No. La app Hellgrün Check está incluida sin costo adicional en el abono: permite activar/desactivar el sistema, invitar usuarios, anular zonas y enviar emergencias.' },
    { q: '¿El abono puede subir con el tiempo?',
      a: 'Sí, se actualiza según la variación acumulada del IPC (INDEC), con una periodicidad mínima de 3 meses. SP avisa con 30 días de anticipación; si el cliente no acepta el nuevo precio, puede rescindir sin penalidad dentro de los 10 días de notificado.' },
  ],

  /* ── COMPETENCIA ─────────────────────────────────────── */
  competencia: {
    competidores: [],
    filas: [
      { criterio: 'Solución equivalente en el mercado', sp: 'strong:Sin datos relevados', valores: [] },
    ],
    nota: 'No se relevaron ofertas equivalentes de la competencia para este piloto todavía.',
  },

  /* ── ÁREAS ───────────────────────────────────────────── */
  /* Aprobación / comunicación a las áreas YA EXISTENTES de la empresa
     sobre este nuevo servicio — no confundir con los roles nuevos del
     Sector Comunicaciones (esos están descriptos en la pestaña Proceso
     y en Eje 1 / Estructura_y_Roles_Sector_Comunicaciones.docx). */
  areas: [
    {
      area: 'Jefatura de Ampliaciones', responsable: '—', comentarios: 'Valida la creación del Sector Comunicaciones y su dependencia jerárquica (Eje 1, Tema 1) — pendiente formalizar los roles de Ampliaciones que se comparten con Comunicaciones y relevar la capacidad máxima del equipo actual', estado: 'rev', fecha: '07/07/2026',
      detalle: {
        titulo: 'Jefatura de Ampliaciones',
        bloques: [
          { tipo: 'texto', texto: 'El Sector Comunicaciones depende de la Jefatura de Ampliaciones y comparte recursos con el Sector Ampliaciones durante esta primera etapa.' },
          { tipo: 'lista', items: [
            'Validar la estructura y dotación inicial del sector (reasignación de personal de Ampliaciones)',
            'Formalizar los roles del Sector Ampliaciones que se comparten con Comunicaciones',
            'Relevar la capacidad máxima del equipo actual para saber cuánto puede absorber el nuevo sector sin afectar la operación de Ampliaciones',
          ]},
        ],
      },
    },
    {
      area: 'Gerencia', responsable: '—', comentarios: 'Debe definir precio y composición del abono, metas de los indicadores de gestión y qué ocurre con el abono una vez recuperado el valor del equipo', estado: 'rev', fecha: '07/07/2026',
      detalle: {
        titulo: 'Gerencia',
        bloques: [
          { tipo: 'texto', texto: 'Define las condiciones comerciales y los objetivos de negocio del piloto.' },
          { tipo: 'lista', items: [
            'Definir el precio del abono mensual y su composición (¿incluye monitoreo o es un concepto separado?)',
            'Definir si el Técnico Comercial tiene margen de descuento sobre el abono',
            'Definir metas de migraciones, universo de clientes candidatos y objetivo de facturación del primer año',
            'Definir qué ocurre con el monto del abono a partir de la cuota de recupero del equipo (baja, se mantiene o cambia de categoría)',
          ]},
        ],
      },
    },
    {
      area: 'Administración', responsable: '—', comentarios: 'Circuito de facturación y cobranza definido a nivel de responsabilidades; falta adaptar el sistema de gestión para el nuevo concepto de abono y sus hitos', estado: 'rev', fecha: '07/07/2026',
      detalle: {
        titulo: 'Administración',
        bloques: [
          { tipo: 'texto', texto: 'A cargo de la facturación y cobranza del nuevo abono de comodato, a partir de la información que le traslada el Administrativo de Sector Comunicaciones.' },
          { tipo: 'lista', items: [
            'Confirmar si el sistema de gestión actual permite crear el nuevo concepto de abono con seguimiento de cuotas e hitos (ej. cuota de recupero)',
            'Confirmar si se puede asociar el número de serie del equipo a cada contrato de comodato para trazabilidad',
            'Definir el circuito de seguimiento de mora para este abono (impacta directo en el recupero del equipo)',
            'Definir el procedimiento de baja de servicio (recupero de equipo o de saldo) para bajas anteriores a la cuota de recupero',
          ]},
        ],
      },
    },
    {
      area: 'Legal', responsable: '—', comentarios: 'Contrato de comodato con el cliente cerrado (permanencia, baja anticipada, revocación, ajuste por IPC, protección de datos) — quedan puntos abiertos sobre casos excepcionales', estado: 'ok', fecha: '07/07/2026',
      detalle: {
        titulo: 'Legal',
        bloques: [
          { tipo: 'texto', texto: 'El contrato de comodato con el cliente está definido y disponible en "Contrato Hellgrun.docx": duración de 12 meses con renovación mensual automática, condiciones de baja anticipada, derecho de revocación (Ley 24.240), ajuste del abono por IPC y tratamiento de datos personales (Ley 25.326).' },
          { tipo: 'lista', items: [
            'Definir qué ocurre con el equipo Hellgrun si el cliente fallece, la empresa cierra o hay un cambio de titular',
            'Confirmar si el saldo del comodato no recuperado en una baja anticipada es exigible judicialmente, y con qué documentación',
          ]},
        ],
      },
    },
    {
      area: 'Central de Monitoreo', responsable: '—', comentarios: 'Debe confirmar el procedimiento de alta de un equipo Hellgrun y la baja coordinada del comunicador Lantrix', estado: 'rev', fecha: '07/07/2026',
      detalle: {
        titulo: 'Central de Monitoreo',
        bloques: [
          { tipo: 'texto', texto: 'Valida la correcta comunicación del equipo instalado y reporta incidencias al Sector Comunicaciones.' },
          { tipo: 'lista', items: [
            'Confirmar el procedimiento para dar de alta un equipo Hellgrun en el sistema de monitoreo',
            'Confirmar si la plataforma de monitoreo actual recibe señales del módulo de comunicación Hellgrun sin necesidad de adaptación',
            'Coordinar con el Técnico Instalador la baja del comunicador Lantrix durante la instalación, sin dejar al cliente sin comunicación',
          ]},
        ],
      },
    },
    {
      area: 'Servicio Técnico', responsable: '—', comentarios: 'Debe confirmar si está en condiciones de realizar el mantenimiento preventivo y correctivo de los equipos Hellgrun', estado: 'rev', fecha: '07/07/2026',
      detalle: {
        titulo: 'Servicio Técnico',
        bloques: [
          { tipo: 'texto', texto: 'El mantenimiento preventivo y correctivo de los equipos Hellgrun es responsabilidad de Servicio Técnico, no del Sector Comunicaciones. Antes de lanzar el servicio comercialmente, Servicio Técnico debe confirmar que está en condiciones de mantener estos equipos (Eje 3, validación final).' },
          { tipo: 'lista', items: [
            'Confirmar capacidad de mantenimiento preventivo y correctivo de las centrales híbridas Hellgrun',
            'Designar responsable de la validación',
            'Definir fecha de validación',
          ]},
        ],
      },
    },
  ],

};

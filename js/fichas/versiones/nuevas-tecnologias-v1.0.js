/* ============================================================
   fichas/versiones/nuevas-tecnologias-v1.0.js
   Ficha "Nuevas Tecnologías" — Migración a comodato — V1.0 (06/07/2026)
   Piloto del Sector Comunicaciones (Área de Ampliaciones), sobre
   cartera de clientes ACTUALES con tecnología obsoleta. Todavía no
   es una oferta comercial abierta — es el antecedente de una futura
   ficha "Hogar Seguro — Comodato".

   Fuente: documentos del proyecto "Implementación Unidad de Negocio
   Comunicaciones" (Proyecto_Sector_Comunicaciones, Eje1, Eje2, Eje3,
   Estructura_y_Roles). Ejes 1 y 2 están cerrados; el Eje 3 (ficha de
   producto) tiene la Sección 1 y 2 cerradas, y la 3 y 4 pendientes de
   datos de Administración, Legal y el proveedor.

   Deliberadamente NO se nombra la marca/tecnología del proveedor
   (puede cambiar) ni se publican cifras de rentabilidad interna del
   leasing — esta ficha es de uso comercial/operativo, no financiero.
   ============================================================ */

'use strict';

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};
window.FICHA_VERSIONS['nuevas-tecnologias'] = window.FICHA_VERSIONS['nuevas-tecnologias'] || {};
window.FICHA_VERSIONS['nuevas-tecnologias']['v1.0'] = {

  /* ── METADATOS DE VERSIÓN (para el selector) ──────────── */
  versionId:   'V1.0',
  versionDesc: 'Piloto — estructura inicial',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'nuevas-tecnologias',
  badge:   'Piloto · Sector Comunicaciones',
  name:    'Nuevas Tecnologías — Migración a Comodato',
  version: '1.0',
  date:    '06/07/2026',
  author:  'Sector Comunicaciones',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: 'Actualizamos el sistema de seguridad del cliente sin que tenga que comprar el equipo: se entrega en comodato. La nueva central es híbrida y reutiliza el cableado y los sensores existentes que sigan funcionando, sumando dispositivos inalámbricos donde haga falta — esto reduce la obra frente a una instalación nueva desde cero. Resuelve de forma definitiva el problema de fondo (central y componentes obsoletos), no solo el síntoma de incomunicación que hoy palía el comunicador de transición actual. Es además escalable: agregar zonas o dispositivos a futuro no requiere nueva obra de cableado. Piloto interno del Sector Comunicaciones (Área de Ampliaciones) sobre cartera de clientes actuales — todavía no es una oferta comercial abierta.',
    infocards: [
      { icon: 'ti-users',         title: 'Cliente objetivo',    body: 'Cartera actual con tecnología obsoleta — grupo piloto de aprox. 50 clientes, priorizados por antigüedad tecnológica' },
      { icon: 'ti-contract',      title: 'Permanencia mínima',  body: '[PENDIENTE] — a definir con Legal' },
      { icon: 'ti-device-mobile', title: 'Plataforma / app',    body: '[PENDIENTE] — a confirmar con el proveedor' },
    ],
    comercializacion: [
      'Equipamiento en comodato — sin costo de compra para el cliente',
      'Central híbrida: integra el cableado y sensores existentes que sigan siendo reutilizables + dispositivos inalámbricos nuevos donde haga falta',
      'Reemplaza de forma definitiva el comunicador de transición que el cliente pueda tener instalado hoy',
      'Recupero de la inversión a través del abono — mes exacto de recupero NO validado todavía (ver pestaña Áreas → Administrativo de Sector Comunicaciones)',
    ],
    indicadores: [
      { nombre: 'Cantidad de migraciones / mes',           descripcion: 'Equipos nuevos instalados en reemplazo de sistemas obsoletos, por período.',        meta: '[PENDIENTE] — a definir con Gerencia' },
      { nombre: 'Tasa de conversión comercial',             descripcion: '% de clientes contactados que aceptan la propuesta de migración.',                   meta: '[PENDIENTE]' },
      { nombre: 'Tiempo promedio de instalación',           descripcion: 'Desde la aceptación comercial hasta la puesta en marcha y el alta en monitoreo.',    meta: '[PENDIENTE]' },
      { nombre: 'Recupero de comodato',                     descripcion: 'Cantidad de equipos que alcanzaron el punto de recupero de la inversión.',           meta: '[PENDIENTE] — mes de recupero aún no validado' },
      { nombre: 'Tasa de incidencias post-instalación',     descripcion: 'Reclamos de servicio técnico sobre equipos migrados, en los primeros 90 días.',      meta: '[PENDIENTE]' },
      { nombre: 'Mora del abono de comodato',                descripcion: '% de cuotas del abono de comodato impagas.',                                        meta: '[PENDIENTE]' },
    ],

    checklist: [
      { label: 'Identificación del servicio (Eje 3, Sección 1)', status: 'ok' },
      { label: 'Propuesta de valor y objeciones (Eje 3, Sección 2)', status: 'ok' },
      { label: 'Datos comerciales — abono, permanencia, baja anticipada', status: 'rev', fecha: 'Pendiente: Legal + Administración + Gerencia' },
      { label: 'Datos técnicos — modelo, zonas, protocolo, garantía', status: 'rev', fecha: 'Pendiente: confirmar con el proveedor' },
      { label: 'Contrato de comodato con el cliente', status: 'prog', fecha: 'Modelo base existente, en adaptación' },
      { label: 'Estructura y roles del Sector Comunicaciones', status: 'prog', fecha: 'En validación con el Jefe de Ampliaciones' },
      { label: 'Capacitación técnica del equipo', status: 'rev' },
      { label: 'Objetivos e indicadores de gestión (metas)', status: 'rev', fecha: 'Catálogo cargado, metas pendientes (Eje 1, Tema 7)' },
      { label: 'Piloto con clientes', status: 'rev', fecha: 'No iniciado — depende de los puntos anteriores' },
    ],
  },

  /* ── EQUIPAMIENTO ────────────────────────────────────── */
  equipamiento: {
    kits: {
      cols: ['Componente', 'Central Híbrida — Piloto'],
      grupos: [
        {
          label: 'Equipamiento instalado — en comodato',
          filas: [
            ['Central híbrida (modelo a confirmar con el proveedor)',           '[PENDIENTE]'],
            ['Módulo de comunicación hacia la central de monitoreo',           '[PENDIENTE]'],
            ['Elementos cableados reutilizados del cliente (sensores, sirenas)', 'Según relevamiento técnico'],
            ['Dispositivos inalámbricos adicionales',                          '[PENDIENTE]'],
          ],
        },
        {
          label: 'Aplicación para smartphone del cliente',
          filas: [
            ['App para el cliente final', '[PENDIENTE — confirmar si existe y si tiene costo adicional]'],
          ],
        },
      ],
    },
    servicios: [
      { icon: 'ti-shield-check', label: 'Monitoreo 24/7',        desc: 'La Central de Monitoreo recibe los eventos del nuevo módulo de comunicación' },
      { icon: 'ti-wifi',         label: 'Tecnología híbrida',     desc: 'Convive cableado existente reutilizable + dispositivos inalámbricos nuevos' },
      { icon: 'ti-activity',     label: 'Diagnóstico remoto',     desc: '[PENDIENTE] — alcance real de la plataforma de gestión del proveedor' },
      { icon: 'ti-tool',         label: 'Garantía de fabricante', desc: '[PENDIENTE] — plazo y alcance a confirmar con el proveedor' },
    ],
  },

  /* ── PRECIOS ─────────────────────────────────────────── */
  precios: {
    cards: [
      { label: 'Abono mensual — Comodato Nuevas Tecnologías', value: '$ [PENDIENTE]', sub: 'A definir con Gerencia + Administración', featured: true, featuredLabel: 'En definición' },
    ],
    alerta: 'Precio y condiciones aún no validados. No usar cifras de análisis internos de rentabilidad del leasing en esta ficha — esa información es de uso exclusivo de Gerencia. Esta sección se completa cuando se cierre el valor final del abono al cliente.',
    cancelacion: [
      { momento: 'Baja antes de recuperado el valor del equipo', penalidad: '[PENDIENTE] — a definir con Legal' },
    ],
    notas: [
      { icon: 'ti-alert-triangle', color: '#d97706', text: 'Sección en definición — ver estado real en el checklist de la pestaña General.' },
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
          { title: 'Propuesta comercial',         note: 'Con esta ficha de producto — equipo en comodato + elementos a agregar + abono mensual [pendiente el precio final]' },
          { title: 'Cierre y firma',              note: 'Firma del contrato de comodato y de las condiciones del nuevo abono' },
          { title: 'Traspaso administrativo',     note: 'Al Administrativo de Sector Comunicaciones, para el alta del contrato y la orden de instalación' },
        ],
      },
      {
        label: 'Instalación',
        pasos: [
          { title: 'Relevamiento técnico final',      note: 'Confirmación de elementos reutilizables y definición de los dispositivos inalámbricos a sumar' },
          { title: 'Instalación de la central híbrida', note: 'Integra los elementos cableados existentes y los nuevos dispositivos inalámbricos' },
          { title: 'Configuración y pruebas',          note: 'Zonas, usuarios, comunicación con monitoreo, batería de respaldo' },
          { title: 'Baja del comunicador anterior',    note: 'Si el cliente lo tenía instalado, se da de baja coordinado con la Central de Monitoreo' },
          { title: 'Cierre de la orden de trabajo',    note: 'El Administrativo de Sector Comunicaciones registra el número de serie del equipo entregado' },
        ],
      },
    ],
    netsuite: [
      { articulo: 'Abono Comodato Nuevas Tecnologías', codigo: '[PENDIENTE]', desc: 'Nuevo concepto de abono — todavía no creado en el sistema administrativo' },
    ],
  },

  /* ── FAQ ─────────────────────────────────────────────── */
  faq: [
    { q: '"Ya tengo el arreglo del comunicador y funciona bien" — ¿por qué migrar?',
      a: 'El comunicador de transición resuelve la comunicación pero el sistema de base sigue siendo antiguo: si la central falla, ya no hay repuestos ni soporte. La migración resuelve el problema de fondo con una cuota mensual accesible.' },
    { q: '¿Por qué sumar otra cuota mensual?',
      a: 'No es un gasto adicional aislado: reemplaza la situación actual (esperar que el sistema falle y enfrentar un gasto imprevisto mayor) por una cuota predecible que incluye el equipo nuevo en comodato.' },
    { q: '¿Qué pasa si el cliente quiere dar de baja el servicio?',
      a: '[PENDIENTE] — a definir por Legal (condiciones de baja anticipada y devolución del equipo).' },
    { q: '¿El equipo nuevo pasa a ser del cliente en algún momento?',
      a: '[PENDIENTE] — a definir por Legal y Gerencia una vez recuperado el valor del equipo.' },
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
  areas: [
    {
      area: 'Responsable de Sector Comunicaciones', responsable: '—', comentarios: 'Estructura pendiente de validación por el Jefe de Ampliaciones', estado: 'rev', fecha: '02/07/2026',
      detalle: {
        titulo: 'Responsable de Sector Comunicaciones',
        bloques: [
          { tipo: 'texto', texto: 'Depende de: Jefe de Ampliaciones. Gestiona de forma integral el Sector Comunicaciones, garantizando el cumplimiento de los objetivos comerciales, técnicos y administrativos.' },
          { tipo: 'lista', items: [
            'Coordinar al Técnico Comercial y al Técnico Instalador en la operación diaria',
            'Definir la priorización de la cartera de clientes y supervisar el proceso comercial',
            'Supervisar la calidad de las instalaciones y el cumplimiento de los procesos técnicos',
            'Reportar los KPIs del sector a la Jefatura de Ampliaciones y a Gerencia',
            'Supervisar al Administrativo de Sector Comunicaciones y coordinar con Administración general el circuito del abono de comodato',
            'Gestionar con la Jefatura de Ampliaciones el uso de recursos compartidos durante la etapa inicial',
          ]},
        ],
      },
    },
    {
      area: 'Técnico Comercial', responsable: '—', comentarios: 'Estructura pendiente de validación por el Jefe de Ampliaciones', estado: 'rev', fecha: '02/07/2026',
      detalle: {
        titulo: 'Técnico Comercial',
        bloques: [
          { tipo: 'texto', texto: 'Depende de: Responsable de Sector Comunicaciones. Identifica, contacta y cierra la migración comercial de clientes candidatos.' },
          { tipo: 'lista', items: [
            'Relevar y priorizar la cartera de clientes candidatos a migración',
            'Contactar al cliente y agendar la visita de diagnóstico',
            'Realizar el relevamiento comercial y técnico preliminar en sitio',
            'Elaborar y presentar la propuesta comercial utilizando la ficha de producto',
            'Gestionar objeciones y cerrar la venta',
            'Formalizar con el cliente la firma del contrato de comodato y las condiciones del nuevo abono',
            'Traspasar la información necesaria al Administrativo de Sector Comunicaciones para el alta del contrato y la orden de instalación',
          ]},
        ],
      },
    },
    {
      area: 'Técnico Instalador', responsable: '—', comentarios: 'Estructura pendiente de validación por el Jefe de Ampliaciones', estado: 'rev', fecha: '02/07/2026',
      detalle: {
        titulo: 'Técnico Instalador',
        bloques: [
          { tipo: 'texto', texto: 'Depende de: Responsable de Sector Comunicaciones. Ejecuta la instalación y puesta en marcha de la nueva tecnología en el domicilio del cliente.' },
          { tipo: 'lista', items: [
            'Realizar el relevamiento técnico final en sitio y definir los materiales necesarios',
            'Instalar la central híbrida e integrar los elementos cableados existentes y los nuevos dispositivos inalámbricos',
            'Configurar zonas, particiones, usuarios y el módulo de comunicación hacia la central de monitoreo',
            'Probar el funcionamiento del sistema y capacitar al cliente en su uso básico',
            'Si el cliente tenía instalado el comunicador anterior, darlo de baja como parte de la instalación y activar el alta definitiva en el sistema de monitoreo',
          ]},
        ],
      },
    },
    {
      area: 'Administrativo de Sector Comunicaciones', responsable: '—', comentarios: 'Rol nuevo — circuito administrativo resuelto, pendiente de validación formal', estado: 'rev', fecha: '02/07/2026',
      detalle: {
        titulo: 'Administrativo de Sector Comunicaciones',
        bloques: [
          { tipo: 'texto', texto: 'Depende de: Responsable de Sector Comunicaciones. Gestiona el circuito administrativo interno del sector: alta de contratos de comodato, generación de órdenes de instalación y trazabilidad de los equipos entregados.' },
          { tipo: 'lista', items: [
            'Recibir del Técnico Comercial la información del cliente, la propuesta cerrada y el contrato de comodato firmado',
            'Dar de alta el contrato de comodato en el sistema administrativo, con número de serie del equipo y condiciones',
            'Generar la orden de instalación para el Técnico Instalador',
            'Cerrar la orden de trabajo una vez finalizada la instalación, registrando el número de serie del equipo entregado en comodato',
            'Mantener la trazabilidad de los equipos entregados en comodato (número de serie, estado, historial)',
            'Ser el enlace operativo con Administración general de la empresa para todo lo referido a facturación y cobranza del abono',
          ]},
          { tipo: 'texto', texto: 'Nota: Administración general de la empresa queda acotada a facturación y cobranza del abono, a partir de la información que le traslada este rol.' },
        ],
      },
    },
  ],

};

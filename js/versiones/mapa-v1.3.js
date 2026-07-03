/* ============================================================
   mapa-v1.3.js — Contenido del Mapa de Servicios V1.3
   Revisión 3/7: se incorpora la estructura de los segmentos
   "Consorcios y Edificios" y "Empresas". Contenido pendiente de carga.
   ============================================================ */

'use strict';

window.MAPA_VERSIONS = window.MAPA_VERSIONS || {};
window.MAPA_VERSIONS['v1.3'] = {

  id:   'V1.3',
  desc: 'Revisión 3/7 — nuevos segmentos (estructura)',

  /* ── SEGMENTOS ────────────────────────────────────────── */

  segments: {
    hogar: {
      icon: 'ti-home',
      name: 'Hogar',
      desc: 'Seguridad para casas y departamentos. El objetivo es brindar total tranquilidad dentro del hogar pero también en momentos de ausencia. Cada servicio puede contratarse de forma independiente o combinada.',
      fichaBtn: { type: 'disabled', icon: 'ti-clock', label: 'Ficha Hogar Seguro — Próximamente' },
    },
    comercio: {
      icon: 'ti-building-store',
      name: 'Comercio',
      desc: 'Soluciones para negocios, locales y PyMEs. Protección del local y los activos, con herramientas de gestión y control adaptadas al día a día de un negocio.',
      fichaBtn: { type: 'primary', icon: 'ti-file-description', label: 'Ver ficha: Comercio Seguro', id: 'comercio-seguro' },
    },
    consorcios: {
      icon: 'ti-building-community',
      name: 'Consorcios y Edificios',
      desc: 'Contenido pendiente de carga.',
      fichaBtn: null,
    },
    empresas: {
      icon: 'ti-briefcase',
      name: 'Empresas',
      desc: 'Contenido pendiente de carga.',
      fichaBtn: null,
    },
    transversal: {
      icon: 'ti-layers-intersect',
      name: 'Servicios Transversales',
      desc: 'Servicios y capacidades que aplican a todos los segmentos. Forman parte del valor diferencial de SP y están disponibles para clientes residenciales y comerciales.',
      fichaBtn: null,
    },
  },

  segmentServices: {
    hogar:      ['alarma-hogar', 'video-hogar', 'cerco-hogar'],
    comercio:   ['alarma-comercio', 'video-comercio', 'accesos-comercio'],
    consorcios: [],
    empresas:   [],
  },

  /* ── SERVICIOS ────────────────────────────────────────── */

  services: {
    'alarma-hogar': {
      segment: 'hogar',
      icon:    'ti-bell-ringing',
      name:    'Alarma monitoreada',
      tagline: 'Detección y respuesta 24/7',
      problem: 'La seguridad del hogar en todo momento: ante cualquier intento de intrusión o emergencia, tanto cuando estás en casa como cuando no estás.',
      tags:    ['Instalación', 'Monitoreo 24/7', 'App móvil', 'Botón pánico'],
      includes: [
        'Instalación del sistema en el domicilio',
        'Monitoreo 24/7 desde la central SP',
        'Notificación inmediata ante cualquier evento',
        'Control y armado/desarmado desde el celular (App)',
        'Botón de pánico',
        'Aviso ante corte de luz',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo. Equipamiento en comodato: el mantenimiento es responsabilidad de SP.',
      diff:    'Es un servicio de seguridad que no depende del usuario. La central actúa de forma autónoma ante cualquier emergencia aunque no se pueda ubicar al cliente. El sistema registra con precisión los movimientos, detallando quién activa o desactiva la alarma en cada momento.',
      ficha:   null,
    },
    'video-hogar': {
      segment: 'hogar',
      icon:    'ti-video',
      name:    'Videovigilancia',
      tagline: 'Monitoreo visual interior y exterior',
      problem: 'No poder ver qué ocurre en el hogar en tiempo real, o no tener registro visual ante un incidente.',
      tags:    ['Cámaras int./ext.', 'Grabación continua', 'Acceso remoto', 'Video verificación'],
      includes: [
        'Instalación de cámaras interiores y/o exteriores',
        'Grabación continua con almacenamiento local',
        'Acceso remoto a las imágenes desde el celular',
        'Video verificación desde la central ante alertas',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo.',
      diff:    'Ante una alerta, la central puede ver las imágenes en tiempo real y actuar con información concreta, sin depender de la disponibilidad del cliente.',
      ficha:   null,
    },
    'cerco-hogar': {
      segment: 'hogar',
      icon:    'ti-fence',
      name:    'Cerco eléctrico',
      tagline: 'Protección perimetral activa',
      problem: 'El riesgo de ingreso no autorizado por los límites de la propiedad.',
      tags:    ['Instalación perimetral', 'Disuasión visible', 'Alerta inmediata', 'Integración monitoreo'],
      includes: [
        'Instalación del cerco perimetral de alta tensión',
        'Señalética disuasiva visible',
        'Integración con el sistema de monitoreo central',
        'Alerta inmediata ante cualquier intento de intrusión',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo.',
      diff:    'Actúa como disuasión visible y como sensor simultáneamente. La respuesta desde la central es inmediata ante cualquier contacto con el cerco.',
      ficha:   null,
    },
    'alarma-comercio': {
      segment: 'comercio',
      icon:    'ti-shield-lock',
      name:    'Protección anti-intrusión',
      tagline: 'Alarma + monitoreo + respuesta',
      problem: 'Intentos de robo o intrusiones en horarios comerciales como también cuando el local está cerrado.',
      tags:    ['Instalación', 'Monitoreo 24/7', 'Control apertura/cierre', 'Respuesta ante alertas'],
      includes: [
        'Instalación del sistema de alarma en el local',
        'Monitoreo 24/7 desde la central SP',
        'Notificación inmediata ante eventos',
        'Registro automatizado de apertura y cierre del local',
        'Alerta ante irregularidades de horario',
        'Respuesta con móvil acuda ante alertas confirmadas',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo. Equipamiento en comodato: el mantenimiento es responsabilidad de SP.',
      diff:    'Combina detección, monitoreo y respuesta en un solo servicio. El registro de aperturas y cierres permite identificar irregularidades y se reporta mensualmente.',
      ficha:   'comercio-seguro',
    },
    'video-comercio': {
      segment: 'comercio',
      icon:    'ti-video',
      name:    'Videovigilancia',
      tagline: 'Verificación visual y evidencia',
      problem: 'La falta de visibilidad sobre lo que ocurre en el local y la necesidad de contar con evidencia visual ante cualquier incidente.',
      tags:    ['Cámaras int./ext.', 'Grabación continua', 'Acceso remoto', 'Video verificación'],
      includes: [
        'Instalación de cámaras interiores y/o exteriores',
        'Grabación continua con almacenamiento local',
        'Acceso remoto a las imágenes desde el celular',
        'Video verificación desde la central ante alertas',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo.',
      diff:    'La verificación desde la central permite confirmar el evento antes de actuar, evitando falsas alarmas y optimizando la respuesta. SP solo accede a las cámaras ante un evento de alarma.',
      ficha:   null,
    },
    'accesos-comercio': {
      segment: 'comercio',
      icon:    'ti-door',
      name:    'Control de accesos',
      tagline: 'Registro y trazabilidad de ingresos',
      problem: 'Identifica a cada persona, e informa sobre horarios de ingreso y salida.',
      tags:    ['Tarjeta / código / biometría', 'Registro de accesos', 'Gestión de permisos', 'Zonas restringidas'],
      includes: [
        'Instalación del sistema de acceso (tarjeta, código o biometría)',
        'Registro completo de entradas y salidas por usuario',
        'Gestión de permisos por área o sector',
        'Restricción de acceso a zonas sensibles o depósitos',
      ],
      billing: 'Cargo de instalación único + abono mensual de administración y monitoreo.',
      diff:    'Permite auditar los movimientos internos con trazabilidad completa. Cada ingreso queda registrado con usuario, fecha y hora.',
      ficha:   null,
    },
  },

  /* ── TRANSVERSALES ────────────────────────────────────── */

  transversals: [
    { icon: 'ti-shield-check',  name: 'Monitoreo 24/7',     desc: 'Central propia de monitoreo con respuesta continua ante eventos.' },
    { icon: 'ti-car',           name: 'SP Acuda',            desc: 'Móvil propio de respuesta. La Plata, Gonnet, City Bell y Villa Elisa.' },
    { icon: 'ti-device-mobile', name: 'App Ajax Security',   desc: 'Control total desde el celular. Disponible en smartphone y Apple Watch.' },
    { icon: 'ti-tool',          name: 'Servicio técnico',    desc: 'Resolución rápida de problemas. Asistencia remota o con visita cuando se requiere.' },
    { icon: 'ti-bolt',          name: 'Aviso corte de luz',  desc: 'Notificación por mail y SMS al cortar y al restablecer el servicio eléctrico.' },
    { icon: 'ti-headset',       name: 'Atención al cliente', desc: 'Centro de atención disponible para consultas, gestión de usuarios y soporte.' },
  ],

};

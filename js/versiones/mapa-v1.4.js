/* ============================================================
   mapa-v1.4.js — Contenido del Mapa de Servicios V1.4
   Revisión 3/7: se incorpora el segmento "Obras" (SP Obra Segura) y
   se completan Consorcios y Edificios / Empresas, alineados a la
   estructura de referencia del PPT de Mapa de Servicios.
   ============================================================ */

'use strict';

window.MAPA_VERSIONS = window.MAPA_VERSIONS || {};
window.MAPA_VERSIONS['v1.4'] = {

  id:   'V1.4',
  desc: 'Revisión 3/7 — Obras, Consorcios y Empresas',

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
    obras: {
      icon: 'ti-building-warehouse',
      name: 'Obras',
      desc: 'Seguridad para obras en construcción y sitios temporales. Solución autónoma en formato tótem, fácil de reubicar a medida que avanza la obra.',
      fichaBtn: { type: 'primary', icon: 'ti-file-description', label: 'Ver ficha: SP Obra Segura', id: 'obra-segura' },
    },
    consorcios: {
      icon: 'ti-building-community',
      name: 'Consorcios y Edificios',
      desc: 'Seguridad para consorcios, edificios y depósitos. Vigilancia presencial, monitoreo remoto y control de perímetro para espacios comunes y accesos.',
      fichaBtn: null,
    },
    empresas: {
      icon: 'ti-briefcase',
      name: 'Empresas',
      desc: 'Seguridad para empresas e instituciones: seguridad integral (CCTV, accesos y monitoreo), consultoría y capacitación en seguridad.',
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
    obras:      ['totem-obra'],
    consorcios: ['vigilancia-consorcios', 'monitoreo-consorcios', 'perimetro-consorcios'],
    empresas:   ['integral-empresas', 'consultoria-empresas', 'capacitacion-empresas'],
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
    'totem-obra': {
      segment: 'obras',
      icon:    'ti-video',
      name:    'SP Obra Segura — Tótem',
      tagline: 'Vigilancia autónoma y reubicable',
      problem: 'La seguridad de la obra en construcción durante y fuera del horario de trabajo, sin instalaciones complejas y con la posibilidad de reubicarse a medida que avanza la obra.',
      tags:    ['Tótem autónomo', 'Comunicación 4G', 'Monitoreo 24/7', 'App Hik-Connect'],
      includes: [
        'Tótem autónomo con cámara, sensor infrarrojo exterior y sirena disuasoria',
        'Panel de alarma con comunicador 4G y wifi — solo requiere conexión eléctrica',
        'Monitoreo 24/7 desde la central SP',
        'Automatización del horario de armado/desarmado según turno de obra',
        'App SP Hik-Connect para control y visualización remota',
        'Envío de móvil SP Acuda ante evento confirmado (La Plata, Gonnet, City Bell y Villa Elisa)',
      ],
      billing: 'Equipamiento en comodato + abono mensual. Sin cargo de instalación. Plazo mínimo de contrato: 12 meses.',
      diff:    'Formato tótem 100% autónomo y reubicable: no requiere obra civil ni cableado, solo alimentación eléctrica. Pensado para acompañar el avance de la obra.',
      ficha:   'obra-segura',
    },
    'vigilancia-consorcios': {
      segment: 'consorcios',
      icon:    'ti-shield-lock',
      name:    'Vigilancia presencial',
      tagline: 'Personal de seguridad en sitio',
      problem: 'La necesidad de una presencia física constante en el edificio o consorcio, con registro de novedades y comunicación permanente con la central.',
      tags:    ['Personal de seguridad', 'Registro de novedades', 'Radiocomunicación'],
      includes: [
        'Personal de seguridad presente en el edificio o consorcio',
        'Registro de novedades y control de ingresos/egresos',
        'Comunicación permanente por radio con la central de monitoreo',
      ],
      billing: 'Servicio de personal por turno o guardia. Modalidad y abono a definir según dotación requerida.',
      diff:    'Combina presencia humana con respaldo tecnológico: el personal está en comunicación directa con la central SP ante cualquier evento.',
      ficha:   null,
    },
    'monitoreo-consorcios': {
      segment: 'consorcios',
      icon:    'ti-video',
      name:    'Monitoreo remoto',
      tagline: 'Cámaras móviles con grabación autónoma',
      problem: 'La cobertura de áreas comunes o accesos sin necesidad de obra civil ni cableado eléctrico permanente.',
      tags:    ['Cámaras móviles', 'Alimentación solar', 'Grabación continua'],
      includes: [
        'Cámaras móviles reubicables según necesidad',
        'Alimentación autónoma con panel solar',
        'Grabación continua con almacenamiento local',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo.',
      diff:    'Autonomía energética y movilidad: se puede reubicar la cobertura sin depender de tendido eléctrico ni obra civil.',
      ficha:   null,
    },
    'perimetro-consorcios': {
      segment: 'consorcios',
      icon:    'ti-fence',
      name:    'Control de perímetro',
      tagline: 'Cerco y control de accesos',
      problem: 'El riesgo de ingreso no autorizado por los límites del edificio o consorcio, y la falta de control sobre quién entra y sale.',
      tags:    ['Cerco perimetral', 'Control de entrada', 'Alertas inmediatas'],
      includes: [
        'Instalación de cerco perimetral',
        'Control de entrada de personas y vehículos',
        'Alertas inmediatas ante intentos de intrusión',
      ],
      billing: 'Cargo de instalación único + abono mensual de monitoreo.',
      diff:    'Combina barrera física con control de acceso y alertas automáticas ante cualquier irregularidad.',
      ficha:   null,
    },
    'integral-empresas': {
      segment: 'empresas',
      icon:    'ti-shield-check',
      name:    'Seguridad integral',
      tagline: 'CCTV, accesos y monitoreo combinados',
      problem: 'La necesidad de una solución de seguridad completa para empresas e instituciones, que combine video, control de accesos y monitoreo central.',
      tags:    ['CCTV', 'Control de accesos', 'Monitoreo 24/7'],
      includes: [
        'Sistema de videovigilancia (CCTV) adaptado a las instalaciones',
        'Control de accesos por sector o área',
        'Monitoreo centralizado con respuesta ante eventos',
      ],
      billing: 'Instalación + abono mensual de monitoreo. A definir según alcance del proyecto.',
      diff:    'Solución integral pensada a medida de cada empresa, combinando las distintas capas de seguridad en un mismo servicio.',
      ficha:   null,
    },
    'consultoria-empresas': {
      segment: 'empresas',
      icon:    'ti-clipboard-check',
      name:    'Consultoría en seguridad',
      tagline: 'Auditoría, diseño y diagnóstico',
      problem: 'La falta de un diagnóstico profesional sobre el estado de la seguridad actual y cómo mejorarla.',
      tags:    ['Auditoría', 'Diseño de soluciones', 'Diagnóstico'],
      includes: [
        'Auditoría de seguridad de las instalaciones',
        'Diseño de soluciones a medida',
        'Diagnóstico de riesgos y recomendaciones',
      ],
      billing: 'A definir según alcance del proyecto de consultoría.',
      diff:    'Mirada profesional externa que identifica riesgos y propone soluciones antes de invertir en equipamiento.',
      ficha:   null,
    },
    'capacitacion-empresas': {
      segment: 'empresas',
      icon:    'ti-certificate',
      name:    'Capacitación',
      tagline: 'Protocolos, formación y certificación',
      problem: 'La falta de protocolos claros y personal capacitado para actuar ante situaciones de riesgo.',
      tags:    ['Protocolos', 'Formación', 'Certificación'],
      includes: [
        'Elaboración de protocolos de seguridad',
        'Formación del personal de la empresa',
        'Certificación de los procesos implementados',
      ],
      billing: 'A definir según alcance del programa de capacitación.',
      diff:    'Prepara al personal de la empresa para actuar correctamente ante incidentes, no solo instala equipamiento.',
      ficha:   null,
    },
  },

  /* ── TRANSVERSALES ────────────────────────────────────── */
  /* Combina los transversales ya cargados con los del PPT de referencia,
     unificando los que se solapan (monitoreo, SP Acuda/respuesta, soporte técnico). */

  transversals: [
    { icon: 'ti-shield-check',   name: 'Monitoreo 24/7',                     desc: 'Central propia de monitoreo con respuesta continua ante eventos.' },
    { icon: 'ti-car',            name: 'SP Acuda',                           desc: 'Móvil propio de respuesta ante eventos. La Plata, Gonnet, City Bell y Villa Elisa.' },
    { icon: 'ti-device-mobile',  name: 'App Ajax Security',                  desc: 'Control total desde el celular. Disponible en smartphone y Apple Watch.' },
    { icon: 'ti-tools',          name: 'Mantenimiento preventivo y correctivo', desc: 'Revisión periódica y reparación de los equipos instalados para asegurar su correcto funcionamiento.' },
    { icon: 'ti-tool',           name: 'Servicio técnico',                   desc: 'Soporte remoto y en sitio. Resolución rápida de problemas con asistencia presencial cuando se requiere.' },
    { icon: 'ti-bolt',           name: 'Aviso corte de luz',                 desc: 'Notificación por mail y SMS al cortar y al restablecer el servicio eléctrico.' },
    { icon: 'ti-headset',        name: 'Atención al cliente',                desc: 'Centro de atención disponible para consultas, gestión de usuarios y soporte.' },
    { icon: 'ti-shopping-cart',  name: 'Venta de equipos y repuestos',       desc: 'Venta de equipamiento adicional y repuestos para ampliar o mantener el sistema instalado.' },
  ],

};

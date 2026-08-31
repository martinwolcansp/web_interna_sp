/* ============================================================
   mapa-v1.12.js — Contenido del Mapa de Servicios V1.12
   Revisión 11: se renombra el servicio transversal "App Ajax
   Security" a "APP para usuario final", con descripción genérica
   multi-marca (Ajax Security, Hik-Connect, Garnet) en vez de nombrar
   una sola marca. Se ajusta además la introducción de "Consorcios y
   Edificios" (se quita la mención a "depósitos"). Sin otros cambios
   de contenido. Hereda de V1.11: el texto final de introducción de
   "Vigilancia presencial".
   ============================================================ */

'use strict';

window.MAPA_VERSIONS = window.MAPA_VERSIONS || {};
window.MAPA_VERSIONS['v1.12'] = {

  id:   'V1.12',
  desc: 'Revisión 11 — se renombra "App Ajax Security" a "APP para usuario final" (descripción genérica multi-marca) y se ajusta la intro de Consorcios y Edificios',

  /* ── SEGMENTOS ────────────────────────────────────────── */

  segments: {
    hogar: {
      icon: 'ti-home',
      name: 'Hogar',
      desc: 'Seguridad para casas y departamentos. El objetivo es brindar total tranquilidad dentro del hogar pero también en momentos de ausencia. Cada servicio puede contratarse de forma independiente o combinada.',
      fichaBtn: { type: 'primary', icon: 'ti-file-description', label: 'Ver ficha: Hogar Seguro', id: 'hogar-venta' },
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
      desc: 'Seguridad para consorcios y edificios. Alarma monitoreada, videovigilancia y control de accesos para espacios comunes y accesos.',
      fichaBtn: null,
    },
    'vigilancia-presencial': {
      icon: 'ti-shield-lock',
      name: 'Vigilancia presencial',
      desc: 'Personal de seguridad presencial, capacitado en la verificación de eventos, para proteger tu propiedad, prevenir incidentes y dar aviso inmediato ante cualquier situación de alerta. En comunicación permanente con la central de monitoreo SP.',
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
    hogar:                  ['alarma-hogar', 'videoverificacion-hogar', 'cerco-hogar'],
    comercio:               ['alarma-comercio', 'videoverificacion-comercio'],
    obras:                  ['totem-obra'],
    consorcios:             ['alarma-consorcios', 'videoverificacion-consorcios', 'accesos-consorcios'],
    'vigilancia-presencial': ['vigilancia-presencial'],
    empresas:               ['integral-empresas', 'consultoria-empresas', 'capacitacion-empresas'],
  },

  /* ── SERVICIOS ────────────────────────────────────────── */

  services: {
    'alarma-hogar': {
      segment: 'hogar',
      icon:    'ti-bell-ringing',
      name:    'Alarma monitoreada + Videovigilancia',
      tagline: 'Detección, respuesta y video en un solo servicio, las 24 horas',
      problem: 'La seguridad del hogar en todo momento: detectar cualquier intento de intrusión o emergencia y, además, poder ver qué está pasando en tiempo real o revisar lo grabado ante un incidente — tanto estando en casa como en tu ausencia.',
      tags:    ['Instalación', 'Monitoreo 24/7', 'Cámaras int./ext.', 'App móvil', 'Botón pánico'],
      includes: [
        'Instalación del sistema de alarma y de cámaras interiores y/o exteriores',
        'Monitoreo 24/7 desde la central SP, con acceso a las imágenes ante cualquier evento',
        'Notificación inmediata ante cualquier evento',
        'Grabación continua con almacenamiento local',
        'Control, armado/desarmado y acceso a cámaras desde el celular (App)',
        'Botón de pánico',
        'Aviso ante corte de luz',
      ],
      billing: 'Cargo de instalación único + abono mensual único que incluye monitoreo de alarma y videovigilancia.<br><br>Dos modalidades de equipamiento:<ul class="modal__include-list"><li><i class="ti ti-check"></i>Comodato — para kit de instalación básico: el equipo es propiedad de SP y el mantenimiento corre por su cuenta.</li><li><i class="ti ti-check"></i>Venta directa: el cliente es propietario del equipo desde la instalación.</li></ul>',
      diff:    'Es un servicio de seguridad integral que no depende del usuario: la central detecta y actúa de forma autónoma ante cualquier emergencia, aunque no se pueda ubicar al cliente, combinando alarma monitoreada y cámaras en un solo servicio y un solo abono. Para que la central también vea las imágenes en tiempo real y confirme visualmente cada alerta antes de actuar, está disponible el servicio de Videoverificación.',
      ficha:   'hogar-venta',
      featured: true,
    },
    'videoverificacion-hogar': {
      segment: 'hogar',
      icon:    'ti-eye-check',
      name:    'Videoverificación',
      tagline: 'Confirmación visual del evento desde la central',
      problem: 'Saber con certeza qué está pasando ante una alerta, en vez de depender de que alguien esté disponible para confirmarlo.',
      tags:    ['Verificación en tiempo real', 'Reduce falsas alarmas', 'Respuesta más rápida'],
      includes: [
        'Verificación visual desde la central ante cada alerta',
        'Confirmación del evento antes de disparar la respuesta',
        'Reporte con información concreta a SP Acuda o a las fuerzas de seguridad',
      ],
      billing: 'Incluido en el abono mensual del servicio de Alarma monitoreada + Videovigilancia contratado.',
      diff:    'La central confirma visualmente lo que está pasando antes de actuar, en vez de responder a una alerta sin contexto.',
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
      name:    'Alarma monitoreada + Videovigilancia',
      tagline: 'Detección, respuesta y video en un solo servicio',
      problem: 'Intentos de robo o intrusiones en horarios comerciales, y la falta de visibilidad y evidencia visual ante cualquier incidente en el local, tanto abierto como cerrado.',
      tags:    ['Instalación', 'Monitoreo 24/7', 'Cámaras int./ext.', 'Control apertura/cierre', 'Respuesta ante alertas'],
      includes: [
        'Instalación del sistema de alarma y de cámaras interiores y/o exteriores',
        'Monitoreo 24/7 desde la central SP, con acceso a las imágenes ante cualquier evento',
        'Notificación inmediata ante eventos',
        'Registro automatizado de apertura y cierre del local',
        'Alerta ante irregularidades de horario',
        'Respuesta con móvil acuda ante alertas confirmadas',
        'Grabación continua con almacenamiento local',
      ],
      billing: 'Cargo de instalación único + abono mensual único que incluye monitoreo de alarma y videovigilancia. Equipamiento en comodato: el mantenimiento es responsabilidad de SP.',
      diff:    'Combina detección, monitoreo, video y respuesta en un solo servicio: el registro de aperturas y cierres permite identificar irregularidades y se reporta mensualmente. SP solo accede a las cámaras ante un evento de alarma. Para que la central también vea las imágenes en tiempo real y confirme visualmente cada alerta antes de actuar, está disponible el servicio de Videoverificación.',
      ficha:   'comercio-seguro',
      featured: true,
    },
    'videoverificacion-comercio': {
      segment: 'comercio',
      icon:    'ti-eye-check',
      name:    'Videoverificación',
      tagline: 'Confirmación visual del evento desde la central',
      problem: 'Confirmar si una alerta del local es real antes de movilizar una respuesta, evitando falsas alarmas.',
      tags:    ['Verificación en tiempo real', 'Reduce falsas alarmas', 'Respuesta más rápida'],
      includes: [
        'Verificación visual desde la central ante cada alerta',
        'Confirmación del evento antes de disparar la respuesta',
        'Reporte con información concreta al móvil acuda o a las fuerzas de seguridad',
      ],
      billing: 'Incluido en el abono mensual del servicio de Alarma monitoreada + Videovigilancia contratado.',
      diff:    'SP solo accede a las cámaras ante un evento de alarma, y confirma visualmente antes de movilizar una respuesta.',
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
    'alarma-consorcios': {
      segment: 'consorcios',
      icon:    'ti-bell-ringing',
      name:    'Alarma monitoreada + Videovigilancia',
      tagline: 'Detección, respuesta y video en un solo servicio, las 24 horas',
      problem: 'Intentos de intrusión en accesos y áreas comunes, y la falta de visibilidad y evidencia visual ante cualquier incidente en el edificio o consorcio, de día o de noche.',
      tags:    ['Instalación', 'Monitoreo 24/7', 'Cámaras int./ext.', 'App móvil', 'Botón pánico'],
      includes: [
        'Instalación del sistema de alarma y de cámaras interiores y/o exteriores',
        'Monitoreo 24/7 desde la central SP, con acceso a las imágenes ante cualquier evento',
        'Notificación inmediata ante cualquier evento',
        'Grabación continua con almacenamiento local',
        'Control, armado/desarmado y acceso a cámaras desde el celular (App)',
        'Botón de pánico',
        'Aviso ante corte de luz',
      ],
      billing: 'Cargo de instalación único + abono mensual único que incluye monitoreo de alarma y videovigilancia.<br><br>Dos modalidades de equipamiento:<ul class="modal__include-list"><li><i class="ti ti-check"></i>Comodato — para kit de instalación básico: el equipo es propiedad de SP y el mantenimiento corre por su cuenta.</li><li><i class="ti ti-check"></i>Venta directa: el cliente es propietario del equipo desde la instalación.</li></ul>',
      diff:    'Es un servicio de seguridad integral que no depende del usuario: la central detecta y actúa de forma autónoma ante cualquier emergencia, aunque no se pueda ubicar al cliente, combinando alarma monitoreada y cámaras en un solo servicio y un solo abono. Para que la central también vea las imágenes en tiempo real y confirme visualmente cada alerta antes de actuar, está disponible el servicio de Videoverificación.',
      ficha:   null,
      featured: true,
    },
    'videoverificacion-consorcios': {
      segment: 'consorcios',
      icon:    'ti-eye-check',
      name:    'Videoverificación',
      tagline: 'Confirmación visual del evento desde la central',
      problem: 'Confirmar visualmente los eventos en accesos y áreas comunes antes de dar aviso o movilizar una respuesta.',
      tags:    ['Verificación en tiempo real', 'Reduce falsas alarmas', 'Respuesta más rápida'],
      includes: [
        'Verificación visual desde la central ante cada alerta',
        'Confirmación del evento antes de disparar la respuesta',
        'Reporte con información concreta a la administración o a las fuerzas de seguridad',
      ],
      billing: 'Incluido en el abono mensual del servicio de Alarma monitoreada + Videovigilancia contratado.',
      diff:    'La central confirma visualmente lo que está pasando en el edificio o consorcio antes de actuar, en vez de responder a una alerta sin contexto.',
      ficha:   null,
    },
    'accesos-consorcios': {
      segment: 'consorcios',
      icon:    'ti-fence',
      name:    'Control de accesos',
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
    'vigilancia-presencial': {
      segment: 'vigilancia-presencial',
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
    { icon: 'ti-device-mobile',  name: 'APP para usuario final',             desc: 'Control del sistema desde el celular: activación y desactivación del servicio y visualización de cámaras. Según el equipo instalado: Ajax Security, Hik-Connect o Garnet.' },
    { icon: 'ti-tools',          name: 'Mantenimiento preventivo y correctivo', desc: 'Revisión periódica y reparación de los equipos instalados para asegurar su correcto funcionamiento.' },
    { icon: 'ti-tool',           name: 'Servicio técnico',                   desc: 'Soporte remoto y en sitio. Resolución rápida de problemas con asistencia presencial cuando se requiere.' },
    { icon: 'ti-bolt',           name: 'Aviso corte de luz',                 desc: 'Notificación por mail y SMS al cortar y al restablecer el servicio eléctrico.' },
    { icon: 'ti-headset',        name: 'Atención al cliente',                desc: 'Centro de atención disponible para consultas, gestión de usuarios y soporte.' },
    { icon: 'ti-shopping-cart',  name: 'Venta de equipos y repuestos',       desc: 'Venta de equipamiento adicional y repuestos para ampliar o mantener el sistema instalado.' },
  ],

};

/* ============================================================
   fichas/versiones/comercio-seguro-v1.1.js
   Ficha SP Comercio Seguro — Versión 1.1 (30/05/2025)
   ============================================================ */

'use strict';

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};
window.FICHA_VERSIONS['comercio-seguro'] = window.FICHA_VERSIONS['comercio-seguro'] || {};
window.FICHA_VERSIONS['comercio-seguro']['v1.1'] = {

  /* ── METADATOS DE VERSIÓN (para el selector) ──────────── */
  versionId:   'V1.1',
  versionDesc: '30/05/2025',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'comercio-seguro',
  badge:   'Comercios',
  name:    'SP Comercio Seguro',
  version: '1.1',
  date:    '30/05/2025',
  author:  'AP',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: 'Soluciones de alarmas inalámbricas para comercios en esquema de kits predefinidos más opcionales adicionales. La solución se ofrece en formato de comodato con un abono mensual.',
    infocards: [
      { icon: 'ti-building-store', title: 'Cliente objetivo',  body: 'Comercios chicos y medianos · La Plata y Gran La Plata' },
      { icon: 'ti-contract',       title: 'Plazo de contrato', body: '12 meses mínimo · renovación mensual automática' },
      { icon: 'ti-device-mobile',  title: 'Plataforma',        body: 'App SP Ajax Security · Smartphone y Apple Watch' },
    ],
    comercializacion: [
      'Equipamiento en comodato',
      'Cargo de instalación (herramienta de cierre)',
      'Abono mensual a mes vencido',
      'Facturación por mes adelantado',
      '50% bonificación por cliente recomendado',
    ],
    checklist: [
      { label: 'Nombre',               status: 'ok'   },
      { label: 'Alcance detallado',    status: 'ok'   },
      { label: 'Preguntas Frecuentes', status: 'ok'   },
      { label: 'Contrato',             status: 'ok'   },
      { label: 'Artículo en Netsuite', status: 'ok'   },
      { label: 'Material Marketing',   status: 'prog' },
      { label: 'Proceso Ventas',       status: 'rev'  },
      { label: 'Proceso Instaladores', status: 'rev'  },
      { label: 'Proceso Operadores',   status: 'rev'  },
      { label: 'Proceso Serv. Técnico',status: 'rev'  },
    ],
  },

  /* ── EQUIPAMIENTO ────────────────────────────────────── */
  equipamiento: {
    kits: {
      cols: ['Componente', 'Kit 1', 'Kit 2'],
      grupos: [
        {
          label: 'Equipamiento instalado',
          filas: [
            ['Panel Hub 4G Jeweler c/ batería de respaldo',    'ok',    'ok'  ],
            ['Detector Magnético DoorProtect inalámbrico',      'x 1',   'x 2' ],
            ['Detector Infrarrojo MotionProtect anti-mascota',  'x 1',   'x 2' ],
            ['Sirena interior HomeSiren inalámbrica',           'ok',    'ok'  ],
            ['Botón Pánico Silencioso Jewel inalámbrico',       'ok',    'ok'  ],
            ['Control Inalámbrico SpaceControl',                'ok',    'ok'  ],
            ['Cartel disuasivo SP Seguridad Privada',           'x 2',   'x 2' ],
          ],
        },
        {
          label: 'Adicionales opcionales',
          filas: [
            ['Cámara interior WiFi 2 Mpx FullHD + mem. 64 GB', 'pill:Opcional CAM',  'pill:Opcional CAM'  ],
            ['Teclado KeyPad inalámbrico',                       'pill:Opcional TECL', 'pill:Opcional TECL' ],
            ['Control Remoto SpaceControl adicional',            'pill:Opcional CRSC', 'pill:Opcional CRSC' ],
          ],
        },
      ],
    },
    servicios: [
      { icon: 'ti-shield-check',  label: 'Monitoreo 7/24',            desc: 'Central SP + aviso a Policía' },
      { icon: 'ti-car',           label: 'SP Acuda',                   desc: 'La Plata, Gonnet, City Bell y Villa Elisa' },
      { icon: 'ti-video',         label: 'Video verificación',          desc: 'Ante evento de alarma — requiere cámara opcional' },
      { icon: 'ti-device-mobile', label: 'App SP Ajax Security',        desc: 'Smartphone, Apple Watch y versión PC' },
      { icon: 'ti-clock',         label: 'Control apertura/cierre',     desc: 'Aviso fuera de horario + reporte mensual' },
      { icon: 'ti-tool',          label: 'Servicio técnico sin cargo',  desc: 'Equipamiento en comodato propiedad de SP' },
      { icon: 'ti-bolt',          label: 'Aviso corte de luz',          desc: 'Por mail y SMS al cortar y al restablecer' },
      { icon: 'ti-smart-home',    label: 'Domótica',                    desc: 'Persianas, luces, escenarios con accesorios IOT' },
    ],
  },

  /* ── PRECIOS ─────────────────────────────────────────── */
  precios: {
    cards: [
      { label: 'Kit 1 — Abono mensual', value: '$ 75.000.-', sub: 'Completar con precio vigente',                                           featured: false },
      { label: 'Kit 2 — Abono mensual', value: '$ 85.000.-', sub: 'Completar con precio vigente',  featured: true, featuredLabel: 'Más contratado' },
      { label: 'Cargo de instalación',  value: '$ 0',        sub: 'Bonif. hasta 50% sin aprobación — hasta 100% con gerencia',              featured: false },
    ],
    alerta: 'Los abonos se ajustan periódicamente por IPC según cláusulas del contrato. SP notifica al cliente por los medios que considere conveniente.',
    cancelacion: [
      { momento: 'Antes del mes 6',      penalidad: 'Pago de todos los meses restantes hasta mes 12' },
      { momento: 'Entre mes 6 y mes 12', penalidad: '80% de los meses restantes hasta completar mes 12' },
      { momento: 'A partir del mes 13',  penalidad: '30 días de preaviso — sin penalidad económica' },
    ],
    notas: [
      { icon: 'ti-alert-triangle', color: '#d97706', text: 'Los precios de venta de Mayo son a valor promocional. El precio real es un 40% más alto.' },
      { icon: 'ti-discount',       color: null,      text: 'Instalación: bonificación hasta 50% sin aprobación — 100% con aprobación de Federico.' },
      { icon: 'ti-star',           color: null,      text: '50% de bonificación de 1 mes por cliente recomendado.' },
    ],
  },

  /* ── PROCESO ─────────────────────────────────────────── */
  proceso: {
    secciones: [
      {
        label: 'Ventas',
        pasos: [
          { title: 'Oportunidad en NS',              note: 'Formulario SP Oportunidad Comodato — verificar casillero Comodato tildado' },
          { title: 'Presupuesto en NS',              note: 'Tipo de Proyecto: SP Comercio Seguro — ingresar kit + abonos correspondientes' },
          { title: 'Impresión y firma del contrato', note: 'El presupuesto incluye texto del contrato — debe ser firmado por el cliente' },
          { title: 'Adjuntar contrato firmado',      note: 'Escanear y adjuntar en NS — original a carpeta del cliente en At. Cliente' },
        ],
      },
      {
        label: 'Instalaciones',
        pasos: [
          { title: 'Orden de Instalación',             note: 'Verificar en presupuesto: control apertura/cierre e informe mensual' },
          { title: 'Configurar App usuario principal', note: 'Instalar app — explicar cómo dar de alta usuarios adicionales' },
          { title: 'Alta en Ajax Pro y Bykom',         note: 'Tipo de panel: SP COMERCIO SEGURO — KIT AJAX — registrar horarios apertura/cierre' },
          { title: 'Cierre OV en Netsuite',            note: 'Transferir artículos a Depósito Comodato Cliente — asignar números de serie' },
        ],
      },
    ],
    netsuite: [
      { articulo: 'Kit 1 Comodato',          codigo: 'KIT01-CDATO', desc: 'Hub 4G + mag + inf + sir int + ctrl rem + bot pánico' },
      { articulo: 'Kit 2 Comodato',          codigo: 'KIT02-CDATO', desc: 'Hub 4G + mag (2) + inf (2) + sir int + ctrl rem + bot pánico' },
      { articulo: 'Kit 1 + Cámara',          codigo: 'KIT03-CDATO', desc: 'Kit 1 + cámara IP WiFi' },
      { articulo: 'Kit 2 + Cámara',          codigo: 'KIT04-CDATO', desc: 'Kit 2 + cámara IP WiFi' },
      { articulo: 'Cámara adicional c/ mem.', codigo: 'CC-CAM006',  desc: 'Cámara IP WiFi Interior Ezviz slot SD' },
      { articulo: 'Relé adicional',           codigo: 'CC-MOD008',  desc: 'Módulo relé de potencia Ajax 110-230V' },
      { articulo: 'Control Remoto adicional', codigo: 'CC-CRE013',  desc: 'Control Remoto Ajax' },
      { articulo: 'Botón Pánico adicional',   codigo: 'CC-CRE017',  desc: 'Botón Inalámbrico Ajax' },
      { articulo: 'Teclado adicional',        codigo: 'CC-TEC014',  desc: 'Teclado Ajax táctil' },
      { articulo: 'Magnético adicional',      codigo: 'CC-MAG004',  desc: 'Magnético Inalámbrico Ajax' },
      { articulo: 'Infrarrojo adicional',     codigo: 'CC-INF014',  desc: 'Infrarrojo Anti-mascota Ajax' },
    ],
  },

  /* ── FAQ ─────────────────────────────────────────────── */
  faq: [
    { q: '¿Cómo activa/desactiva la alarma el personal?',
      a: '3 opciones: desde la App instalada en su smartphone, desde un Control Remoto inalámbrico (opcional) o desde un Teclado inalámbrico instalado en el comercio (opcional). En cualquier caso el sistema identifica al usuario.' },
    { q: '¿Cómo sé qué empleado desactivó o activó la alarma?',
      a: 'En las 3 opciones el sistema identifica al usuario: la App del smartphone está asociada al usuario, el control remoto también, y en el caso del teclado cada usuario tiene un PIN distinto.' },
    { q: '¿Qué pasa si se dispara la alarma?',
      a: 'El Centro de Monitoreo de SP se contactará para verificar la situación y solicitará la Palabra Clave. Si hay evento positivo se avisa a Policía y se despacha un móvil SP Acuda al lugar.' },
    { q: '¿Cuánto dura la batería del sistema?',
      a: 'Los detectores inalámbricos tienen baterías con duración promedio de 4 años. El hub central se conecta a 220V y ante un corte de luz opera con batería por un promedio de 15 horas. Desde la app se puede ver el estado de batería de todos los componentes.' },
    { q: '¿SP puede ver mis cámaras en cualquier momento?',
      a: 'No. SP solo puede acceder a las cámaras cuando se genera un evento de alarma desde la central. En otros momentos SP no tiene acceso.' },
    { q: '¿Cuánto tiempo entre la firma del contrato y la instalación?',
      a: 'Dentro de los 5 días hábiles. El departamento de instalaciones se contactará dentro de las 48 horas de la contratación para coordinar la fecha.' },
    { q: '¿Cómo agrego nuevos usuarios a la app?',
      a: 'Contactando con nuestro Centro de Atención. El nuevo usuario debe instalarse la app, generar una cuenta con un mail e informarnos con qué email se inscribió para darlo de alta.' },
    { q: '¿Qué pasa si un elemento instalado se rompe?',
      a: 'Si el equipo tiene un problema de fabricación, SP se hace cargo del reemplazo sin cargo ya que está en comodato. Si la rotura es por causas atribuibles al cliente, se cobra un cargo de reposición del elemento dañado.' },
    { q: '¿Cómo me llega el reporte de apertura y cierre?',
      a: 'En forma mensual se envía un mail con el reporte de aperturas y cierres con detalle de día, hora y usuario en formato PDF.' },
  ],

  /* ── COMPETENCIA ─────────────────────────────────────── */
  competencia: {
    competidores: ['901', 'Prosegur', 'ADT'],
    filas: [
      { criterio: 'Equipamiento',       sp: 'Kit predefinido + opcionales', valores: ['Kit básico',           'Kit básico',        'Kit básico'             ] },
      { criterio: 'Comodato',           sp: 'ok:Sí',                        valores: ['no:No',                'ok:Sí',             'ok:Con opción a compra'  ] },
      { criterio: 'Móvil Acuda propio', sp: 'ok:Auto propio',               valores: ['ok:Sí',                'Moto',              'no:No'                  ] },
      { criterio: 'Abono mensual',      sp: 'strong:Actualizar',            valores: ['$ 38.000',             '$ 40–100K',         '$ 61.900–69.900'         ] },
      { criterio: 'Cargo instalación',  sp: 'Bonificable hasta 100%',       valores: ['Incluido en equipo',   'Bonif. hasta 100K$','$ 92.900–104.900'         ] },
      { criterio: 'Cotización online',  sp: 'ok:Sí',                        valores: ['no:No',                'ok:Sí',             '—'                       ] },
      { criterio: 'Video verificación', sp: 'ok:Sí',                        valores: ['—',                    '—',                 'Con cámara opcional'      ] },
    ],
    nota: 'Precios de competencia de mayo 2025 — requieren actualización periódica.',
  },

  /* ── ÁREAS ───────────────────────────────────────────── */
  areas: [
    { area: 'Ventas y Mktg',    responsable: 'Federico', comentarios: '—',                                                                                    estado: 'ok',  fecha: '30-5-25'    },
    { area: 'Vendedor',         responsable: 'Gustavo',  comentarios: 'Ver comentarios en ficha original (sirena exterior, proceso presupuesto, firma digital)', estado: 'rev', fecha: ''           },
    { area: 'Vendedor',         responsable: 'Gonzalo',  comentarios: '—',                                                                                    estado: 'rev', fecha: ''           },
    { area: 'Operaciones',      responsable: 'Gonzalo',  comentarios: '—',                                                                                    estado: 'rev', fecha: ''           },
    { area: 'Instalaciones',    responsable: 'Eduardo',  comentarios: '—',                                                                                    estado: 'rev', fecha: ''           },
    { area: 'Servicio Técnico', responsable: 'Martín',   comentarios: '—',                                                                                    estado: 'ok',  fecha: '30/05/2025' },
    { area: 'Operadores',       responsable: 'Orlando',  comentarios: 'Protocolo Pánico desde App fuera del comercio — pendiente de redacción',                estado: 'rev', fecha: ''           },
    { area: 'Admin y Precios',  responsable: 'Belén',    comentarios: '—',                                                                                    estado: 'ok',  fecha: '30/05/2025' },
    { area: 'Facturación',      responsable: 'Marcela',  comentarios: '—',                                                                                    estado: 'rev', fecha: ''           },
    { area: 'Depósito',         responsable: 'David',    comentarios: 'Resolver Nros de serie en rol Jefe Depósito para seguimiento de artículos en comodato', estado: 'rev', fecha: ''           },
    { area: 'Procesos',         responsable: 'Martín',   comentarios: 'Pasos en NS para Instalaciones y Depósito agregados',                                   estado: 'ok',  fecha: '28/05/2025' },
  ],

};

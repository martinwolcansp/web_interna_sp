/* ============================================================
   fichas/versiones/obra-segura-v1.2.js
   Ficha SP Obra Segura — Versión 1.2 (27/11/2025)
   Fuente: "Ficha de Producto - SP Obra Segura ver 1.0.docx"
   ============================================================ */

'use strict';

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};
window.FICHA_VERSIONS['obra-segura'] = window.FICHA_VERSIONS['obra-segura'] || {};
window.FICHA_VERSIONS['obra-segura']['v1.2'] = {

  /* ── METADATOS DE VERSIÓN (para el selector) ──────────── */
  versionId:   'V1.2',
  versionDesc: '27/11/2025',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'obra-segura',
  badge:   'Obras',
  name:    'SP Obra Segura',
  version: '1.2',
  date:    '27/11/2025',
  author:  'AP',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: 'SP Obra Segura es una solución integral de seguridad especialmente diseñada para obras en construcción. Su diseño en formato tótem autónomo incorpora todos los elementos clave para la vigilancia y protección del sitio en obra: cámaras de video, detección de movimiento, sirena disuasoria y más, todo en una única unidad compacta. Gracias a su estructura y a la comunicación 4G es fácil de reubicar a medida que avanza la obra. Solo necesita una conexión eléctrica para comenzar a funcionar, sin instalaciones complejas ni configuraciones adicionales. Simple. Eficiente. Seguro.',
    infocards: [
      { icon: 'ti-building-cog',  title: 'Cliente objetivo',  body: 'Empresas constructoras y estudios de arquitectura' },
      { icon: 'ti-contract',      title: 'Plazo de contrato', body: '12 meses mínimo · renovación mensual automática' },
      { icon: 'ti-device-mobile', title: 'Plataforma',        body: 'App SP Hik-Connect · Control y visualización remota' },
    ],
    comercializacion: [
      'Equipamiento en comodato',
      'Abono mensual — sin cargo de instalación',
      'Plazo mínimo de contrato: 12 meses, luego renovación mensual',
      'Contratos de 6 a 12 meses posibles según criterios de aprobación (ver Áreas)',
    ],
    checklist: [
      { label: 'Nombre',                    status: 'ok' },
      { label: 'Alcance detallado',         status: 'ok' },
      { label: 'Preguntas Frecuentes',      status: 'ok' },
      { label: 'Contrato',                  status: 'ok', fecha: 'PDF para completar' },
      { label: 'Formulario de Presupuesto', status: 'ok', fecha: 'Word para imprimir en PDF' },
      { label: 'Artículo en Netsuite',      status: 'ok', fecha: 'Actualizado con artículos panel Hik' },
      { label: 'Precios',                   status: 'ok', fecha: '27/11/25' },
      { label: 'Material de Marketing',     status: 'ok' },
      { label: 'Proceso Ventas',            status: 'ok', fecha: 'Capacitado y documentado' },
      { label: 'Proceso Instaladores',      status: 'ok', fecha: 'Capacitado y documentado' },
      { label: 'Proceso Operadores',        status: 'ok', fecha: 'En uso desde 27/11/25' },
      { label: 'Proceso Atención al Cliente', status: 'ok' },
      { label: 'Proceso Servicio Técnico',  status: 'prog', fecha: 'Lo sigue haciendo Facundo por el momento' },
    ],
  },

  /* ── EQUIPAMIENTO ────────────────────────────────────── */
  equipamiento: {
    kits: {
      cols: ['Componente', 'SP Obra Segura — Tótem'],
      grupos: [
        {
          label: 'Equipamiento instalado — en comodato',
          filas: [
            ['Barral de hierro con pie de cemento y gabinete estanco para equipos', 'x 1'],
            ['Panel de alarma con comunicador 4G y wifi',                            'x 1'],
            ['Sensor doble infrarrojo exterior con cámara',                          'x 1'],
            ['Cámara domo PTZ 2 MPX con audio bidireccional y memoria 64 GB',        'x 1'],
            ['Sirena exterior',                                                       'x 1'],
            ['Sensor magnético para gabinete',                                        'x 1'],
            ['Batería de respaldo para cámara',                                       'x 1'],
            ['Cartel disuasivo SP Seguridad Privada',                                 'x 1'],
          ],
        },
        {
          label: 'Aplicación para smartphone del cliente',
          filas: [
            ['APP SP Hik-Connect',                                                   'ok'],
            ['Control de la alarma y visualización de cámaras por el usuario',       'ok'],
          ],
        },
        {
          label: 'Servicios de monitoreo y seguridad',
          filas: [
            ['Automatización del horario de armado y desarmado del sistema',         'ok'],
          ],
        },
        {
          label: 'Opcionales',
          filas: [
            ['Cámara IP WiFi adicional 2 Mpx c/audio bidireccional y memoria 64 GB', 'pill:Opcional'],
            ['Sensor infrarrojo interior inalámbrico (pañol / espacios cerrados)',    'pill:Opcional'],
            ['Control remoto inalámbrico',                                           'pill:Opcional'],
          ],
        },
      ],
    },
    servicios: [
      { icon: 'ti-shield-check',  label: 'Monitoreo 24/7',            desc: 'Central SP verifica el evento por cámara antes de actuar' },
      { icon: 'ti-car',           label: 'SP Acuda',                   desc: 'Móvil de verificación. La Plata, Gonnet, City Bell y Villa Elisa' },
      { icon: 'ti-clock',         label: 'Armado/desarmado automático', desc: 'Programado según horario de inicio y fin de tareas en obra' },
      { icon: 'ti-device-mobile', label: 'App SP Hik-Connect',          desc: 'Armado, desarmado y visualización de cámaras en tiempo real' },
      { icon: 'ti-bolt',          label: 'Aviso corte de luz',          desc: 'Mail/SMS ante corte de luz con batería baja' },
      { icon: 'ti-truck',         label: 'Reubicación por técnico SP',  desc: 'El traslado del tótem lo realiza siempre un técnico de SP' },
    ],
  },

  /* ── PRECIOS ─────────────────────────────────────────── */
  precios: {
    cards: [
      { label: 'Abono mensual — Tótem Obra Segura', value: '$ 357.000.-', sub: 'Código ABO-403 · precio vigente Sept. 2025 — actualizar', featured: true, featuredLabel: 'Producto principal' },
      { label: 'Cámara adicional c/ memoria',        value: '$ 10.300.-',  sub: 'Código ABO-403-AC · por unidad',                            featured: false },
      { label: 'Sensor infrarrojo adicional',        value: '$ 4.100.-',   sub: 'Código ABO 403-AI · por unidad',                             featured: false },
    ],
    alerta: 'Equipamiento en comodato. No se cobra cargo de instalación, solo abono mensual. Plazo mínimo de contrato: 12 meses.',
    cancelacion: [
      { momento: 'Antes del mes 6',      penalidad: 'Debe pagar todos los meses restantes hasta completar el mes 12' },
      { momento: 'Entre el mes 6 y el 12', penalidad: 'Debe pagar el 80% de los meses restantes hasta completar el mes 12' },
      { momento: 'Contratos de 6 a 12 meses', penalidad: 'Se evalúan caso por caso según criterios de aprobación (empresa de envergadura, tótem en stock, contratos previos)' },
    ],
    notas: [
      { icon: 'ti-alert-triangle', color: '#d97706', text: 'Precios vigentes a Septiembre 2025 — requieren actualización periódica.' },
      { icon: 'ti-info-circle',    color: null,      text: 'No hace falta incluir artículo de mano de obra en el presupuesto, solo los ítems de abono y el artículo TOTEM OS.' },
    ],
  },

  /* ── PROCESO ─────────────────────────────────────────── */
  proceso: {
    secciones: [
      {
        label: 'Ventas',
        pasos: [
          { title: 'Propuesta al cliente',  note: 'Formulario Word — editar y guardar como PDF para enviar' },
          { title: 'Oportunidad en NS',     note: 'Cargar como otras oportunidades — tildar casillero Comodato' },
          { title: 'Presupuesto en NS',     note: 'Tipo de Proyecto: Obra Segura — Unidad de Negocio: Alarma Comodato — ítems de abono + artículo TOTEM OS' },
          { title: 'Venta y contrato',      note: 'Cliente completa PDF con datos de obra y firma — contrato firmado se escanea y adjunta en NS' },
        ],
      },
      {
        label: 'Instalaciones y Atención al Cliente',
        pasos: [
          { title: 'Ensamblaje del tótem',     note: 'Orden de Ensamblaje en NS — el tótem fabricado queda con número de serie propio' },
          { title: 'Instalación en obra',      note: 'Mismo proceso que cualquier artículo de comodato — dentro de los 5 días hábiles desde la firma' },
          { title: 'Alta en Atención al Cliente', note: 'Carpeta de cliente, Orden de Venta de comodato y asignación de número Bykom' },
        ],
      },
    ],
    netsuite: [
      { articulo: 'Abono Tótem Obra Segura',      codigo: 'ABO-403',    desc: 'Abono por el comodato del Tótem de Obra Segura' },
      { articulo: 'Abono cámara adicional',       codigo: 'ABO-403-AC', desc: 'Abono por cada cámara adicional' },
      { articulo: 'Abono infrarrojo adicional',   codigo: 'ABO 403-AI', desc: 'Abono por cada infrarrojo adicional' },
      { articulo: 'Artículo Tótem (comodato)',    codigo: 'TOTEM OS',   desc: 'Artículo de comodato para la instalación del Tótem' },
    ],
  },

  /* ── FAQ ─────────────────────────────────────────────── */
  faq: [
    { q: '¿Cómo se instala el tótem?',
      a: 'El tótem ya viene completamente armado y configurado. Se lleva a la obra, se ubica cerca de la entrada para que el detector de movimiento actúe ante cualquier ingreso, y solo necesita conectarse a la red eléctrica de 220V.' },
    { q: '¿Cómo funciona la activación y desactivación del sistema?',
      a: 'De tres formas posibles: automáticamente según un horario programado (coincidente con el inicio/fin de tareas), manualmente desde la app SP Hik-Connect, o con un control remoto inalámbrico opcional.' },
    { q: '¿A quién avisan ante una notificación de alarma?',
      a: 'La central de monitoreo verifica primero la situación por cámara. Si se confirma el evento o no se puede verificar, se avisa a la Policía, se envía un móvil de apoyo SP y se notifica a los contactos designados.' },
    { q: '¿Cómo sabe la constructora o el estudio de arquitectura si el sistema está armado o desarmado?',
      a: 'Con la app SP Hik-Connect instalada se tiene visibilidad de los cambios de estado del sistema y quién los realizó.' },
    { q: '¿Cuánto dura la batería?',
      a: 'El sistema tiene dos baterías: la del panel de alarma dura aproximadamente 18 horas, y la de la cámara aproximadamente 6 horas. Con batería, las cámaras siguen grabando pero no se pueden ver en forma remota hasta que se restablezca la energía.' },
    { q: '¿Avisan si hay un corte de luz?',
      a: 'Sí, ante corte de luz y batería baja se envía un mail o SMS de aviso a la persona designada.' },
    { q: '¿Cuántas cámaras se pueden instalar?',
      a: 'El tótem viene con una cámara con detección de movimiento e incluye memoria. De forma adicional se pueden instalar hasta 2 cámaras WiFi (el constructor debe proveer un enchufe de 220V en la ubicación de cada cámara).' },
    { q: '¿Las cámaras graban?',
      a: 'Sí, cuentan con memoria de 64 GB y graban únicamente cuando detectan personas, lo que permite almacenar entre 6 y 10 días de grabación.' },
    { q: '¿Puedo ver los videos desde mi smartphone?',
      a: 'Sí, desde la app SP Hik-Connect se pueden ver las cámaras en tiempo real, las grabaciones, y usar el audio bidireccional. No es posible verlas desde una PC.' },
    { q: '¿Cuánto dura el contrato?',
      a: '12 meses a partir de la instalación. A partir del mes 13 se renueva mensualmente.' },
    { q: '¿Cuánto demora la instalación luego de firmado el contrato?',
      a: 'Dentro de los 5 días hábiles. El departamento de instalaciones se contacta dentro de las 48 horas de la contratación para coordinar la fecha.' },
    { q: '¿Qué pasa si se rompe algún elemento instalado?',
      a: 'Si la rotura es por un problema de fabricación, SP se hace cargo del reemplazo sin cargo (el equipamiento está en comodato). Si es por causas atribuibles al cliente, se cobra un cargo de reposición del elemento dañado.' },
    { q: '¿Se pueden agregar funciones de domótica?',
      a: 'Sí, el sistema permite incluir un punto de control remoto para activar o desactivar luces o un tablero desde la app, en forma manual o programada (requiere relé adicional con costo).' },
    { q: '¿Cómo es el servicio de apoyo móvil de SP?',
      a: 'Ante un evento de alarma confirmado por los sensores, se avisa al cliente y a la Policía, y se despacha un móvil de SP para verificar la situación en el lugar y colaborar con la Policía si es necesario.' },
    { q: '¿Se puede mover el tótem de lugar?',
      a: 'Sí, avisando a SP. El traslado lo debe hacer siempre un técnico de SP, para asegurar que la cámara y el sensor queden correctamente ubicados y cumplan su función.' },
    { q: '¿Se pueden agregar más sensores?',
      a: 'Sí, se pueden sumar sensores infrarrojos para detección de movimiento y sensores magnéticos para apertura de puertas.' },
    { q: '¿Hay iluminación adicional con este sistema?',
      a: 'Las cámaras ya cuentan con iluminadores LED por movimiento. Si el cliente lo necesita, se puede instalar un reflector LED comandado desde la app (requiere relé adicional con costo).' },
  ],

  /* ── COMPETENCIA ─────────────────────────────────────── */
  competencia: {
    competidores: [],
    filas: [
      { criterio: 'Solución equivalente en el mercado', sp: 'strong:Sin datos relevados', valores: [] },
    ],
    nota: 'No hay datos de un servicio similar por parte de la competencia (relevado a Sept. 2025). SP Obra Segura es, por el momento, una propuesta diferencial en formato tótem autónomo.',
  },

  /* ── ÁREAS ───────────────────────────────────────────── */
  areas: [
    { area: 'Ventas',              responsable: '—',              comentarios: 'Proceso capacitado y documentado',                                    estado: 'ok',   fecha: '27/11/25' },
    { area: 'Instalaciones',       responsable: 'Jefe de Instalaciones', comentarios: 'Revisión de sectores pendiente',                               estado: 'rev',  fecha: '' },
    { area: 'Operaciones',        responsable: '—',              comentarios: 'Revisión de sectores pendiente',                                       estado: 'rev',  fecha: '' },
    { area: 'Depósito',           responsable: 'Jefe de Depósito', comentarios: 'Revisión de sectores pendiente',                                     estado: 'rev',  fecha: '' },
    { area: 'Atención al Cliente', responsable: '—',              comentarios: 'Revisión de sectores pendiente',                                      estado: 'rev',  fecha: '' },
    { area: 'Administración',     responsable: '—',              comentarios: 'Revisión de sectores pendiente',                                       estado: 'rev',  fecha: '' },
    { area: 'Servicio Técnico',   responsable: 'Facundo Salas',   comentarios: 'No interviene el proceso estándar — soporte especial prestado por el Líder de Producto', estado: 'ok', fecha: '' },
  ],

};

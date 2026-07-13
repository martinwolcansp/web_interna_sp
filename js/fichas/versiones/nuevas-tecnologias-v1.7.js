/* ============================================================
   fichas/versiones/nuevas-tecnologias-v1.7.js
   Ficha "Nuevas Tecnologías" — Migración a comodato — V1.7 (13/07/2026)

   Suma sobre v1.6:
   - Resuelto por Gerencia: qué pasa con el abono después del punto de
     recupero del equipo. El punto de recupero se fija en la 5ª cuota
     (antes decía 6ª — corregido en toda la ficha). A partir de esa
     cuota el abono sigue igual (no baja ni cambia de categoría). Si
     el equipo no se devuelve al finalizar el comodato, se cobra a
     precio de lista de los elementos no devueltos (antes decía
     "según factura de compra o tasación de un tercero independiente").
     Se traslada a: checklist "Condiciones comerciales", pestaña
     Precios (alerta, tabla de cancelación, notas), FAQ, indicador
     "Recupero de comodato" y pestaña Áreas → Gerencia.
   - Nuevo pendiente: falta confirmar si existe o hace falta un
     formulario para que el cliente complete sus datos (checklist
     "Requerimientos para el cliente", antes marcado "OK" sin este
     punto).

   Fuente: Eje3_Ficha_Producto.docx (actualizado 13/07/2026), del
   proyecto "Implementación Unidad de Negocio Comunicaciones".
   ============================================================ */

'use strict';

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};
window.FICHA_VERSIONS['nuevas-tecnologias'] = window.FICHA_VERSIONS['nuevas-tecnologias'] || {};
window.FICHA_VERSIONS['nuevas-tecnologias']['v1.7'] = {

  /* ── METADATOS DE VERSIÓN (para el selector) ──────────── */
  versionId:   'V1.7',
  versionDesc: 'Recupero de equipo en cuota 5: abono sigue igual y valuación a precio de lista',

  /* ── IDENTIFICACIÓN ───────────────────────────────────── */
  id:      'nuevas-tecnologias',
  badge:   'Eje 3 · Ficha de Producto',
  name:    'Nuevas Tecnologías — Migración a Comodato',
  version: '1.7',
  date:    '13/07/2026',
  author:  'Sector Comunicaciones',
  liderProducto: 'Federico Champané (Jefe de Ampliaciones)',

  /* ── GENERAL ─────────────────────────────────────────── */
  general: {
    descripcion: 'Actualizamos el sistema de seguridad del cliente sin que tenga que comprar el equipo: se entrega en comodato. La nueva central híbrida Hellgrun reutiliza el cableado y los sensores existentes que sigan funcionando, sumando dispositivos inalámbricos donde haga falta — esto reduce la obra frente a una instalación nueva desde cero. Resuelve de forma definitiva el problema de fondo (central y componentes obsoletos), reemplazando el comunicador Lantrix que hoy palía solo el síntoma de incomunicación. Es además escalable: agregar zonas o dispositivos a futuro no requiere nueva obra de cableado. Piloto interno del Sector Comunicaciones (Área de Ampliaciones) sobre cartera de clientes actuales — todavía no es una oferta comercial abierta.',
    infocards: [
      { icon: 'ti-users',         title: 'Cliente objetivo',    body: 'Cartera actual con tecnología obsoleta, prioritariamente clientes con el comunicador Lantrix activo — grupo piloto de aprox. 50 clientes' },
      { icon: 'ti-contract',      title: 'Permanencia',        body: 'Sin permanencia mínima — contrato de 12 meses con renovación mensual automática; baja anticipada sin penalidad, con obligación de restituir el equipo (ver pestaña Precios)' },
      { icon: 'ti-device-mobile', title: 'Plataforma / app',    body: 'App Hellgrün Check — activar/desactivar, invitar usuarios, anular zonas y enviar emergencias, sin costo adicional' },
    ],
    comercializacion: [
      'Equipamiento en comodato — sin costo de compra para el cliente',
      'Central híbrida Hellgrun: integra el cableado y sensores existentes que sigan siendo reutilizables + dispositivos inalámbricos nuevos donde haga falta',
      'Reemplaza de forma definitiva el comunicador Lantrix que el cliente pueda tener instalado hoy',
      'Incluye envío de móvil de seguridad ante un Evento de Alarma (SP Acuda) y app Hellgrün Check sin costo adicional',
      'Video-verificación opcional con cámaras propias del cliente, mediante abono adicional — [PENDIENTE] costo a definir con Gerencia',
      'Recupero de la inversión a través del abono, a partir de la 5ª cuota — a partir de ahí el abono sigue igual (mes exacto de la cuota 5 aún NO validado con números reales; ver pestaña Áreas → Administrativo de Sector Comunicaciones)',
    ],
    /* Checklist alineado 1 a 1 con la tabla "Checklist de lanzamiento" de
       Eje3_Ficha_Producto.docx (mismos ítems, mismo orden). */
    checklist: [
      { label: 'Identificación y propuesta de valor', status: 'ok' },
      { label: 'Condiciones comerciales', status: 'prog', fecha: 'Precio ($66.000/mes), instalación (sin cargo) y código de abono (ABO-16) definidos. Descuentos, bonificación y análisis de competencia: cerrados por decisión de Gerencia, no se van a definir. Recupero del equipo definido en la 5ª cuota: el abono sigue igual después de ese punto, y si el equipo no se devuelve se cobra a precio de lista de los elementos no devueltos — falta validar el mes exacto de la cuota 5 con números reales' },
      { label: 'Requerimientos para el cliente', status: 'rev', fecha: 'Falta confirmar si existe o hace falta un formulario para que el cliente complete sus datos; si corresponde, incorporarlo acá o en Documentación (pestaña Precios → Documentos)' },
      { label: 'Terminología', status: 'ok' },
      { label: 'Contrato', status: 'ok', fecha: 'Firmado; falta cargar el link externo (ver pestaña Precios → Documentos) y completar el correo electrónico habilitado para el Derecho de Revocación' },
      { label: 'Material de marketing', status: 'rev', fecha: 'Pendiente — falta el link a la carpeta de piezas' },
      { label: 'Componentes técnicos', status: 'rev', fecha: 'Requiere datos del proveedor Hellgrun (modelo, zonas, protocolo, batería, garantía)' },
      { label: 'Procesos internos (Comercial / Instalación / Administrativo)', status: 'rev', fecha: 'Detalle completo en el módulo Procesos, Eje 2' },
      { label: 'Validación de Servicio Técnico', status: 'rev', fecha: 'Pendiente — ver pestaña Áreas' },
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
      { label: 'Abono mensual — ABO-16 Monitoreo 4G/Hellgrun/Ajax', value: '$66.000', sub: 'Por mes (valor al 8 de julio de 2026). Abono único: incluye monitoreo, comodato del equipo y comunicación por chip celular (incluye ABO-10 y ABO-11).', featured: true, featuredLabel: 'Vigente' },
      { label: 'Costo de instalación', value: 'Sin cargo', sub: 'Sin cargo para el cliente' },
    ],
    alerta: 'Por decisión de Gerencia, no se van a definir descuentos ni reglas de bonificación para el Técnico Comercial, ni un análisis de competencia, para este piloto — quedan cerrados. El recupero del equipo se definió en la 5ª cuota: a partir de ahí el abono sigue igual, y si el equipo no se devuelve se cobra a precio de lista de los elementos no devueltos. Sigue abierta la validación del mes exacto de la cuota 5 con números reales.',
    /* "Condiciones de baja anticipada" — contrato revisado: ya no hay
       penalidad escalonada por antigüedad. Ver Eje1_Unidad_de_Negocio.docx,
       Tema 4, y Eje3_Ficha_Producto.docx, tabla de Condiciones comerciales. */
    cancelacion: [
      { momento: 'Baja del servicio, en cualquier momento del contrato',              penalidad: 'Sin penalidad — con 30 días de preaviso' },
      { momento: 'Restitución del equipo, dentro de los 10 días de la baja',           penalidad: 'Obligatoria. Si no se restituye (o se restituye dañado/incompleto), el cliente debe abonar su valor a precio de lista de los elementos no devueltos' },
      { momento: 'Baja del servicio de monitoreo (conexidad contractual)',             penalidad: 'El comodato se extingue junto con el monitoreo y la restitución del equipo pasa a ser exigible de inmediato' },
      { momento: 'Revocación dentro de los 10 días corridos desde la instalación',     penalidad: 'Sin penalidad — devolución de lo abonado y retiro del equipo sin cargo (Art. 34, Ley 24.240)' },
    ],
    notas: [
      { icon: 'ti-info-circle',    color: '#2563eb', text: 'Ajuste del abono: se actualiza según la variación acumulada del IPC (INDEC), con periodicidad mínima de 3 meses y aviso previo de 30 días. Si el INDEC discontinúa el IPC o modifica su metodología, se aplica automáticamente el índice sucesor o, en su defecto, otro similar a acordar entre las partes. Si el cliente no acepta el nuevo precio, puede rescindir sin penalidad dentro de los 10 días de notificado. [EN REVISIÓN] — se está evaluando bajar el aviso previo a 15 días por mail; falta que Gonza lo valide con el abogado.' },
      { icon: 'ti-info-circle',    color: '#2563eb', text: 'Recupero del equipo: a partir de la 5ª cuota el abono sigue igual (no baja ni cambia de categoría); si el equipo no se devuelve, se cobra a precio de lista de los elementos no devueltos. Falta validar el mes exacto de la cuota 5 con números reales.' },
    ],
    /* Links a documentos externos (ver js/documentos-externos.js). Mientras
       no exista repositorio interno se muestran deshabilitados con tooltip. */
    documentos: ['contrato-hellgrun'],
  },

  /* ── PROCESO ─────────────────────────────────────────── */
  proceso: {
    nota: 'El detalle paso a paso de cada proceso (Comercial, Instalación, Administrativo del comodato y el abono) vive en el módulo <strong>Procesos</strong> (Eje 2) para no duplicarlo acá. Esta pestaña deja el resumen y los códigos administrativos.',
    resumen: [
      { proceso: 'Comercial',                                areas: 'Técnico Comercial, Jefe de Ampliaciones, Administración' },
      { proceso: 'Instalación',                               areas: 'Técnico Instalador, Central de Monitoreo, Administración' },
      { proceso: 'Administrativo del comodato y el abono',    areas: 'Administración, Gerencia' },
    ],
    netsuite: [
      { articulo: 'ABO-16 Abono Mensual de Monitoreo - 4G/Hellgrun/Ajax', codigo: 'ABO-16 (incluye ABO-10 y ABO-11)', desc: 'Abono único: monitoreo + comodato del equipo + comunicación por chip celular. $66.000/mes (valor al 8/7/2026); instalación sin cargo.' },
    ],
    indicadores: [
      { nombre: 'Cantidad de migraciones / mes',           descripcion: 'Equipos nuevos instalados en reemplazo de sistemas obsoletos, por período.',        meta: '[PENDIENTE] — a definir con Gerencia' },
      { nombre: 'Tasa de conversión comercial',             descripcion: '% de clientes contactados que aceptan la propuesta de migración.',                   meta: '[PENDIENTE]' },
      { nombre: 'Tiempo promedio de instalación',           descripcion: 'Desde la aceptación comercial hasta la puesta en marcha y el alta en monitoreo.',    meta: '[PENDIENTE]' },
      { nombre: 'Recupero de comodato',                     descripcion: 'Cantidad de equipos que alcanzaron el punto de recupero de la inversión (5ª cuota).', meta: '[PENDIENTE] — mes exacto de la cuota 5 aún no validado con números reales' },
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
      a: 'Puede dar de baja cuando quiera, con 30 días de preaviso y sin penalidad. Sí tiene que devolver el equipo dentro de los 10 días de la baja; si no lo devuelve, se le cobra su valor a precio de lista de los elementos no devueltos. Como el comodato está atado al monitoreo (conexidad contractual), si se da de baja el monitoreo el comodato se extingue con él.' },
    { q: '¿El equipo nuevo pasa a ser del cliente en algún momento?',
      a: 'No. El equipo sigue siendo propiedad de SP durante toda la vigencia del contrato, incluso después de la cuota de recupero (5ª): no pasa a ser del cliente en ningún momento. Al finalizar el contrato se desinstala y se retira. A partir de la 5ª cuota el abono sigue igual — no baja ni cambia de categoría. Si el equipo no se devuelve al finalizar el comodato, se cobra a precio de lista de los elementos no devueltos.' },
    { q: '¿La app del cliente tiene costo adicional?',
      a: 'No. La app Hellgrün Check está incluida sin costo adicional en el abono: permite activar/desactivar el sistema, invitar usuarios, anular zonas y enviar emergencias.' },
    { q: '¿El abono puede subir con el tiempo?',
      a: 'Sí, se actualiza según la variación acumulada del IPC (INDEC), con una periodicidad mínima de 3 meses. Si el INDEC discontinúa el IPC o modifica su metodología, se aplica automáticamente el índice sucesor o, en su defecto, otro similar a acordar entre las partes. SP avisa con 30 días de anticipación; si el cliente no acepta el nuevo precio, puede rescindir sin penalidad dentro de los 10 días de notificado. [EN REVISIÓN] — se evalúa bajar el aviso a 15 días por mail; falta la validación de Gonza con el abogado.' },
  ],

  /* ── COMPETENCIA ─────────────────────────────────────── */
  competencia: {
    competidores: [],
    filas: [
      { criterio: 'Solución equivalente en el mercado', sp: 'strong:No se releva (decisión de Gerencia)', valores: [] },
    ],
    nota: 'Por decisión de Gerencia, no se va a realizar un análisis de competencia para este piloto.',
  },

  /* ── ÁREAS ───────────────────────────────────────────── */
  /* Aprobación / comunicación a las áreas YA EXISTENTES de la empresa
     sobre este nuevo servicio — no confundir con los roles nuevos del
     Sector Comunicaciones (esos están descriptos en el módulo Unidad de
     Negocio, Eje 1 → pestaña Estructura y Roles). */
  areas: [
    {
      area: 'Jefatura de Ampliaciones', responsable: '—', comentarios: 'Valida la creación del Sector Comunicaciones y su dependencia jerárquica (Eje 1 → Estructura y Roles) — pendiente formalizar los roles de Ampliaciones que se comparten con Comunicaciones y relevar la capacidad máxima del equipo actual', estado: 'rev', fecha: '07/07/2026',
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
      area: 'Gerencia', responsable: '—', comentarios: 'Precio y composición del abono ya definidos ($66.000/mes, ABO-16, instalación sin cargo). Decidió no definir descuentos de bonificación del Técnico Comercial ni análisis de competencia (quedan cerrados). Definió que el recupero del equipo se alcanza en la 5ª cuota, que el abono sigue igual después de ese punto y que el equipo no devuelto se cobra a precio de lista; falta definir metas de indicadores y validar el mes exacto de la cuota 5 con números reales', estado: 'rev', fecha: '13/07/2026',
      detalle: {
        titulo: 'Gerencia',
        bloques: [
          { tipo: 'texto', texto: 'Define las condiciones comerciales y los objetivos de negocio del piloto. Decidió no definir descuentos ni reglas de bonificación para el Técnico Comercial, ni un análisis de competencia, para este piloto. Definió que el recupero del equipo se alcanza en la 5ª cuota, que el abono sigue igual a partir de ahí, y que el equipo no devuelto se cobra a precio de lista de los elementos no devueltos.' },
          { tipo: 'lista', items: [
            'Definir metas de migraciones, universo de clientes candidatos y objetivo de facturación del primer año',
            'Validar el mes exacto de la cuota de recupero (5ª) con números reales',
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
            'Confirmar con Gonzalo si estos equipos finalmente llevan número de serie — el proceso hoy lo registra, pero según lo comentado en una reunión podrían no llevarlo; de confirmarse, sacar esa referencia (ver módulo Procesos, Eje 2)',
            'Definir el circuito de seguimiento de mora para este abono (impacta directo en el recupero del equipo)',
            'Definir el procedimiento de baja de servicio (recupero de equipo o de saldo) para bajas anteriores a la cuota de recupero',
          ]},
        ],
      },
    },
    {
      area: 'Legal', responsable: '—', comentarios: 'Contrato de comodato con el cliente revisado: sin penalidad por baja anticipada (restitución del equipo a precio de lista si no se devuelve, y conexidad contractual con el monitoreo) — falta cargar el link externo al documento (ver pestaña Precios → Documentos), completar el correo electrónico para el Derecho de Revocación, y validar con Gonza si se ajusta el aviso de actualización del abono de 30 a 15 días', estado: 'rev', fecha: '13/07/2026',
      detalle: {
        titulo: 'Legal',
        bloques: [
          { tipo: 'texto', texto: 'El contrato de comodato con el cliente está revisado: duración de 12 meses con renovación mensual automática, sin penalidad por baja anticipada (con obligación de restituir el equipo o abonar su valor a precio de lista de los elementos no devueltos), conexidad contractual entre comodato y monitoreo, derecho de revocación (Ley 24.240), ajuste del abono por IPC con índice sustituto, jurisdicción por defecto (art. 36, Ley 24.240) y tratamiento de datos personales (Ley 25.326). El link externo al documento firmado está pendiente de cargar — ver pestaña Precios → Documentos.' },
          { tipo: 'lista', items: [
            'Completar en el contrato el correo electrónico habilitado para el Derecho de Revocación (dato en blanco en el original)',
            'Validar con Gonza si se ajusta la cláusula de actualización del abono: bajar el aviso previo de 30 a 15 días, a notificar por mail (conversación previa con Carmelo)',
            'Definir qué ocurre con el equipo Hellgrun si el cliente fallece, la empresa cierra o hay un cambio de titular',
            'Confirmar si el valor del equipo no restituido en una baja es exigible judicialmente, y con qué documentación',
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
          { tipo: 'texto', texto: 'El mantenimiento preventivo y correctivo de los equipos Hellgrun es responsabilidad de Servicio Técnico, no del Sector Comunicaciones. Antes de lanzar el servicio comercialmente, Servicio Técnico debe confirmar que está en condiciones de mantener estos equipos (validación final).' },
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

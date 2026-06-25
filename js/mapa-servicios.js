/* ============================================================
   mapa-servicios.js — Lógica del Mapa de Servicios
   Manejo de tabs, modal de servicio y navegación a fichas.
   ============================================================ */

'use strict';

/* ── DATOS DE SERVICIOS ──────────────────────────────────── */

const SERVICES = {
  'alarma-hogar': {
    badge: 'Hogar',
    name: 'Alarma domiciliaria',
    problem: 'La preocupación de no saber qué pasa en casa cuando no estás, o ante una situación de emergencia imprevista.',
    includes: [
      'Instalación del sistema en el domicilio',
      'Monitoreo 24/7 desde la central SP',
      'Notificación inmediata ante cualquier evento',
      'Control y armado/desarmado desde el celular (App)',
      'Botón de pánico para emergencias manuales',
      'Aviso ante corte de luz',
    ],
    billing: 'Cargo de instalación único + abono mensual de monitoreo. Equipamiento en comodato: el mantenimiento es responsabilidad de SP.',
    diff: 'La central monitorea de forma continua y actúa aunque el cliente no esté disponible. El sistema identifica qué usuario activó o desactivó la alarma en cada momento.',
    ficha: null,
  },
  'video-hogar': {
    badge: 'Hogar',
    name: 'Videovigilancia',
    problem: 'No poder ver qué ocurre en el hogar en tiempo real, o no contar con registro visual ante un incidente.',
    includes: [
      'Instalación de cámaras interiores y/o exteriores',
      'Grabación continua con almacenamiento local',
      'Acceso remoto a las imágenes desde el celular',
      'Video verificación desde la central ante alertas',
    ],
    billing: 'Cargo de instalación único + abono mensual de monitoreo.',
    diff: 'Ante una alerta, la central puede ver las imágenes en tiempo real y actuar con información concreta, sin depender de la disponibilidad del cliente.',
    ficha: null,
  },
  'cerco-hogar': {
    badge: 'Hogar',
    name: 'Cerco eléctrico',
    problem: 'El riesgo de ingreso no autorizado por los límites de la propiedad, especialmente en casas, countries o barrios privados.',
    includes: [
      'Instalación del cerco perimetral de alta tensión',
      'Señalética disuasiva visible',
      'Integración con el sistema de monitoreo central',
      'Alerta inmediata ante cualquier intento de intrusión',
    ],
    billing: 'Cargo de instalación único + abono mensual de monitoreo.',
    diff: 'Actúa como disuasión visible y como sensor simultáneamente. La respuesta desde la central es inmediata ante cualquier contacto con el cerco.',
    ficha: null,
  },
  'alarma-comercio': {
    badge: 'Comercio',
    name: 'Protección anti-intrusión',
    ficha: 'comercio-seguro',
    problem: 'El riesgo de robo o ingreso no autorizado al local, especialmente fuera del horario comercial.',
    includes: [
      'Instalación del sistema de alarma en el local',
      'Monitoreo 24/7 desde la central SP',
      'Notificación inmediata ante eventos',
      'Registro automatizado de apertura y cierre del local',
      'Alerta ante irregularidades de horario',
      'Respuesta con móvil acuda ante alertas confirmadas',
    ],
    billing: 'Cargo de instalación único + abono mensual de monitoreo. Equipamiento en comodato: el mantenimiento es responsabilidad de SP.',
    diff: 'Combina detección, monitoreo y respuesta en un solo servicio. El registro de aperturas y cierres permite identificar irregularidades y se reporta mensualmente.',
    ficha: null,
  },
  'video-comercio': {
    badge: 'Comercio',
    name: 'Videovigilancia',
    problem: 'La falta de visibilidad sobre lo que ocurre en el local y la necesidad de contar con evidencia visual ante cualquier incidente.',
    includes: [
      'Instalación de cámaras interiores y/o exteriores',
      'Grabación continua con almacenamiento local',
      'Acceso remoto a las imágenes desde el celular',
      'Video verificación desde la central ante alertas',
    ],
    billing: 'Cargo de instalación único + abono mensual de monitoreo.',
    diff: 'La verificación desde la central permite confirmar el evento antes de actuar, evitando falsas alarmas y optimizando la respuesta. SP solo accede a las cámaras ante un evento de alarma.',
    ficha: null,
  },
  'accesos-comercio': {
    badge: 'Comercio',
    name: 'Control de accesos',
    problem: 'La falta de control sobre quién entra al local, cuándo y a qué sectores, sin registro ni trazabilidad.',
    includes: [
      'Instalación del sistema de acceso (tarjeta, código o biometría)',
      'Registro completo de entradas y salidas por usuario',
      'Gestión de permisos por área o sector',
      'Restricción de acceso a zonas sensibles o depósitos',
    ],
    billing: 'Cargo de instalación único + abono mensual de administración y monitoreo.',
    diff: 'Permite auditar los movimientos internos con trazabilidad completa. Cada ingreso queda registrado con usuario, fecha y hora.',
    ficha: null,
  },
};


/* ── VERSIONES ───────────────────────────────────────────── */

const VERSION_DATA = {
  'v1.0': {
    label: 'V1.0 — Original',
    textFields: {
      'hogar-desc':
        'Soluciones para residencias y familias. El objetivo es que puedas estar tranquilo en casa y cuando no estás. Cada servicio puede contratarse de forma independiente o combinada.',
      'alarma-hogar-name':    'Alarma domiciliaria',
      'alarma-hogar-problem': 'La preocupación de no saber qué pasa en casa cuando no estás, o ante una emergencia.',
    },
    ariaLabels: {
      'alarma-hogar-card': 'Ver detalle: Alarma domiciliaria',
    },
    services: {
      'alarma-hogar': {
        name:    'Alarma domiciliaria',
        problem: 'La preocupación de no saber qué pasa en casa cuando no estás, o ante una situación de emergencia imprevista.',
        includes: [
          'Instalación del sistema en el domicilio',
          'Monitoreo 24/7 desde la central SP',
          'Notificación inmediata ante cualquier evento',
          'Control y armado/desarmado desde el celular (App)',
          'Botón de pánico para emergencias manuales',
          'Aviso ante corte de luz',
        ],
        diff: 'La central monitorea de forma continua y actúa aunque el cliente no esté disponible. El sistema identifica qué usuario activó o desactivó la alarma en cada momento.',
      },
    },
  },

  'v1.1': {
    label: 'V1.1 — Revisión 25/6',
    textFields: {
      'hogar-desc':
        'Seguridad para casas y departamentos. El objetivo es brindar total tranquilidad dentro del hogar pero también en momentos de ausencia. Cada servicio puede contratarse de forma independiente o combinada.',
      'alarma-hogar-name':    'Alarma monitoreada',
      'alarma-hogar-problem': 'La seguridad del hogar en todo momento: ante cualquier intento de intrusión o emergencia, tanto cuando estás en casa como cuando no estás.',
    },
    ariaLabels: {
      'alarma-hogar-card': 'Ver detalle: Alarma monitoreada',
    },
    services: {
      'alarma-hogar': {
        name:    'Alarma monitoreada',
        problem: 'Un problema de seguridad real: intrusiones o emergencias que pueden ocurrir tanto cuando no estás en casa como mientras estás presente. El sistema actúa de forma autónoma en ambos casos.',
        includes: [
          'Instalación del sistema en el domicilio',
          'Monitoreo 24/7 desde la central SP',
          'Notificación inmediata ante cualquier evento',
          'Control y armado/desarmado desde el celular (App)',
          'Botón de pánico',
          'Aviso ante corte de luz',
        ],
        diff: 'Es un servicio de seguridad que no depende del usuario. La central actúa de forma autónoma ante cualquier emergencia aunque no se pueda ubicar al cliente. El sistema registra con precisión los movimientos, detallando quién activa o desactiva la alarma en cada momento.',
      },
    },
  },
};

/**
 * Aplica una versión del contenido al mapa de servicios.
 * Actualiza campos de texto en el DOM, aria-labels y datos del modal.
 * @param {string} versionKey - 'v1.0' | 'v1.1'
 */
function setVersion(versionKey) {
  const vd = VERSION_DATA[versionKey];
  if (!vd) return;

  // Actualizar campos de texto
  Object.entries(vd.textFields).forEach(([field, value]) => {
    const el = document.querySelector(`[data-vf="${field}"]`);
    if (el) el.textContent = value;
  });

  // Actualizar aria-labels
  Object.entries(vd.ariaLabels).forEach(([field, value]) => {
    const el = document.querySelector(`[data-vf-aria="${field}"]`);
    if (el) el.setAttribute('aria-label', value);
  });

  // Actualizar datos de SERVICES (para el modal)
  Object.entries(vd.services).forEach(([serviceId, overrides]) => {
    Object.assign(SERVICES[serviceId], overrides);
  });

  // Actualizar UI del selector
  document.querySelectorAll('.version-selector__item').forEach(item => {
    const active = item.dataset.version === versionKey;
    item.classList.toggle('is-active', active);
    item.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  const label = document.getElementById('version-current-label');
  if (label) label.textContent = vd.label;

  closeVersionDropdown();
}

function toggleVersionDropdown() {
  const dropdown = document.getElementById('version-dropdown');
  const btn      = document.getElementById('version-btn');
  if (!dropdown || !btn) return;
  const isOpen = dropdown.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeVersionDropdown() {
  const dropdown = document.getElementById('version-dropdown');
  const btn      = document.getElementById('version-btn');
  if (dropdown) dropdown.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}


/* ── ESTADO ─────────────────────────────────────────────── */

let _currentFichaName = null;
let _currentFichaId   = null;


/* ── SEGMENT TABS ────────────────────────────────────────── */

/**
 * Activa un panel de segmento y su tab correspondiente.
 * @param {string} segmentId - ID del segmento ('hogar', 'comercio', 'transversal')
 * @param {HTMLElement} activeTab - Elemento tab clickeado
 */
function showSegment(segmentId, activeTab) {
  document.querySelectorAll('.segment-panel').forEach(panel => {
    panel.classList.remove('is-active');
  });
  document.querySelectorAll('.segment-tab').forEach(tab => {
    tab.classList.remove('is-active');
  });

  document.getElementById('segment-' + segmentId).classList.add('is-active');
  activeTab.classList.add('is-active');
}


/* ── MODAL ───────────────────────────────────────────────── */

/**
 * Abre el modal de detalle de un servicio.
 * @param {string} serviceId - Clave en el objeto SERVICES
 */
function openServiceModal(serviceId) {
  const service = SERVICES[serviceId];
  if (!service) return;

  _currentFichaId   = service.ficha    || null;
  _currentFichaName = service.name     || null;

  document.getElementById('modal-badge').textContent = service.badge;
  document.getElementById('modal-name').textContent  = service.name;

  const includesHTML = service.includes
    .map(item => `<li><i class="ti ti-check"></i>${item}</li>`)
    .join('');

  document.getElementById('modal-body').innerHTML = `
    <div class="modal__row">
      <div class="modal__row-label">¿Qué problema resuelve?</div>
      <div class="modal__row-content">${service.problem}</div>
    </div>
    <div class="modal__row">
      <div class="modal__row-label">¿Qué incluye?</div>
      <ul class="modal__include-list">${includesHTML}</ul>
    </div>
    <div class="modal__row">
      <div class="modal__billing-box">
        <i class="ti ti-credit-card"></i>
        <div class="modal__billing-text"><strong>¿Cómo se cobra?</strong><br>${service.billing}</div>
      </div>
    </div>
    <div class="modal__row">
      <div class="modal__diff-box">
        <i class="ti ti-shield-check"></i>
        <div class="modal__diff-text"><strong>¿Qué lo diferencia?</strong><br>${service.diff}</div>
      </div>
    </div>
  `;

  const fichaBtn  = document.getElementById('modal-ficha-btn');
  const footerNote = document.getElementById('modal-footer-note');
  const footerBar  = document.getElementById('modal-footer-bar');

  footerBar.style.display = 'flex';

  if (service.ficha) {
    fichaBtn.style.display = 'inline-flex';
    footerNote.textContent = '';
    footerBar.style.justifyContent = 'flex-end';
  } else {
    fichaBtn.style.display = 'none';
    footerNote.textContent = 'Este es el detalle completo del servicio.';
    footerBar.style.justifyContent = 'flex-start';
  }

  document.getElementById('modal-overlay').classList.add('is-open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('is-open');
}

function closeModalOnOverlayClick(event) {
  if (event.target === document.getElementById('modal-overlay')) {
    closeModal();
  }
}


/* ── NAVEGACIÓN ENTRE VISTAS ─────────────────────────────── */

/**
 * Alterna entre la vista del mapa y la ficha de producto.
 * @param {string} view - 'mapa' o 'ficha'
 * @param {string} [fichaName] - Nombre para el breadcrumb
 */
function showView(view, fichaName) {
  document.getElementById('app-mapa').style.display  = view === 'mapa'  ? 'block' : 'none';
  document.getElementById('app-ficha').style.display = view === 'ficha' ? 'block' : 'none';

  updateBreadcrumb(view === 'ficha' ? fichaName : null);
  window.scrollTo(0, 0);
}

/**
 * Actualiza el breadcrumb según la vista activa.
 * - Vista mapa:  ← Inicio / Mapa de Servicios
 * - Vista ficha: ← Inicio / Mapa de Servicios / <fichaName>
 * @param {string|null} fichaName - null para restaurar la vista mapa
 */
function updateBreadcrumb(fichaName) {
  const nav = document.querySelector('.breadcrumb');
  if (!nav) return;

  // Eliminar ítems dinámicos previos (sep + ficha)
  nav.querySelectorAll('.breadcrumb__dynamic').forEach(el => el.remove());

  const current = nav.querySelector('.breadcrumb__current');
  if (!current) return;

  if (fichaName) {
    // Convertir "Mapa de Servicios" en enlace clickeable
    current.outerHTML =
      `<a class="breadcrumb__link" onclick="showView('mapa')" style="cursor:pointer;">Mapa de Servicios</a>`;

    // Agregar separador + página actual de la ficha
    const sep = document.createElement('span');
    sep.className = 'breadcrumb__sep breadcrumb__dynamic';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '/';

    const fichaSpan = document.createElement('span');
    fichaSpan.className = 'breadcrumb__current breadcrumb__dynamic';
    fichaSpan.setAttribute('aria-current', 'page');
    fichaSpan.textContent = fichaName;

    nav.appendChild(sep);
    nav.appendChild(fichaSpan);
  } else {
    // Restaurar "Mapa de Servicios" como ítem actual (no enlace)
    const mapaLink = nav.querySelector('.breadcrumb__link[onclick]');
    if (mapaLink) {
      const span = document.createElement('span');
      span.className = 'breadcrumb__current';
      span.setAttribute('aria-current', 'page');
      span.textContent = 'Mapa de Servicios';
      mapaLink.replaceWith(span);
    }
  }
}

/**
 * Renderiza y navega a una ficha por ID.
 * @param {string} fichaId - Clave en el objeto FICHAS de ficha-renderer.js
 */
function openFicha(fichaId) {
  const data = (typeof FICHAS !== 'undefined') ? FICHAS[fichaId] : null;
  if (data) renderFicha(data);
  showView('ficha', data ? data.name : 'Ficha de Producto');
}

function goToFicha() {
  closeModal();
  if (_currentFichaId) {
    openFicha(_currentFichaId);
  } else {
    showView('ficha', _currentFichaName || 'Ficha de Producto');
  }
}


/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Cerrar dropdown de versión al click fuera
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#version-selector')) {
      closeVersionDropdown();
    }
  });

  // Inicializar en la versión más reciente
  setVersion('v1.1');
});

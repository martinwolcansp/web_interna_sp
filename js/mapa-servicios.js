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


/* ── ESTADO ─────────────────────────────────────────────── */

let _currentFichaName = null;


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

  _currentFichaName = service.fichaName || null;

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

function goToFicha() {
  closeModal();
  showView('ficha', _currentFichaName || 'Ficha de Producto');
}


/* ── INIT ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });
});

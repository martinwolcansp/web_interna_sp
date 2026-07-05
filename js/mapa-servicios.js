/* ============================================================
   mapa-servicios.js — Lógica del Mapa de Servicios
   Solo rendering y comportamiento de UI. Sin datos de contenido.
   El contenido vive en js/versiones/mapa-v*.js
   ============================================================ */

'use strict';


/* ── ESTADO ─────────────────────────────────────────────── */

let _currentVersion  = null;
let _currentFichaId  = null;
let _currentFichaName = null;


/* ── RENDERING DE VERSIÓN ────────────────────────────────── */

/**
 * Carga y renderiza una versión completa del mapa.
 * @param {string} versionKey - ej. 'v1.2'
 */
function setVersion(versionKey) {
  const vd = window.MAPA_VERSIONS && window.MAPA_VERSIONS[versionKey];
  if (!vd) return;
  _currentVersion = vd;

  // Heroes de segmento
  renderSegmentHero('hogar',       vd.segments.hogar);
  renderSegmentHero('comercio',    vd.segments.comercio);
  renderSegmentHero('obras',       vd.segments.obras);
  renderSegmentHero('consorcios',  vd.segments.consorcios);
  renderSegmentHero('empresas',    vd.segments.empresas);
  renderSegmentHero('transversal', vd.segments.transversal);

  // Grids de servicios
  renderServiceGrid('hogar',      vd);
  renderServiceGrid('comercio',   vd);
  renderServiceGrid('obras',      vd);
  renderServiceGrid('consorcios', vd);
  renderServiceGrid('empresas',   vd);

  // Transversales
  renderTransversals(vd.transversals);

  // Selector de versión
  updateVersionSelectorUI(versionKey);

  closeVersionDropdown();
}

/**
 * Renderiza el hero de un segmento.
 * @param {string} segmentId
 * @param {object} data - { icon, name, desc, fichaBtn }
 */
function renderSegmentHero(segmentId, data) {
  const container = document.getElementById('hero-' + segmentId);
  if (!container) return;

  // Segmento no definido en esta versión (ej. versiones anteriores a su alta)
  if (!data) {
    container.innerHTML = `<p class="segment-hero__placeholder">Este segmento no existe en esta versión del mapa.</p>`;
    return;
  }

  let btnHTML = '';
  if (data.fichaBtn) {
    const fb = data.fichaBtn;
    if (fb.type === 'primary') {
      btnHTML = `
        <button class="btn btn--primary" onclick="openFicha('${fb.id}')">
          <i class="ti ${fb.icon}" aria-hidden="true"></i> ${fb.label}
        </button>`;
    } else if (fb.type === 'disabled') {
      btnHTML = `
        <span class="btn btn--disabled">
          <i class="ti ${fb.icon}" aria-hidden="true"></i> ${fb.label}
        </span>`;
    }
  }

  container.innerHTML = `
    <div class="segment-hero__icon" aria-hidden="true"><i class="ti ${data.icon}"></i></div>
    <div class="segment-hero__body">
      <h2 class="segment-hero__name">${data.name}</h2>
      <p class="segment-hero__desc">${data.desc}</p>
      ${btnHTML ? `<div class="segment-hero__actions">${btnHTML}</div>` : ''}
    </div>
  `;
}

/**
 * Renderiza las cards de servicios de un segmento.
 * @param {string} segmentId
 * @param {object} vd - datos de la versión completa
 */
function renderServiceGrid(segmentId, vd) {
  const grid = document.getElementById('grid-' + segmentId);
  if (!grid) return;

  const serviceIds = vd.segmentServices[segmentId] || [];

  if (serviceIds.length === 0) {
    grid.innerHTML = `<p class="service-grid__empty">Pendiente de carga.</p>`;
    return;
  }

  grid.innerHTML = serviceIds.map(id => {
    const s = vd.services[id];
    if (!s) return '';
    return `
      <article class="service-card" onclick="openServiceModal('${id}')"
               role="button" tabindex="0" aria-label="Ver detalle: ${s.name}">
        <header class="service-card__header">
          <div class="service-card__icon" aria-hidden="true"><i class="ti ${s.icon}"></i></div>
          <div>
            <h3 class="service-card__name">${s.name}</h3>
            <p class="service-card__tagline">${s.tagline}</p>
          </div>
        </header>
        <div class="service-card__problem">
          <p class="service-card__problem-label">¿Qué resuelve?</p>
          ${s.problem}
        </div>
        <div class="service-card__includes">
          <p class="service-card__includes-label">Incluye</p>
          <ul class="tag-list" aria-label="Características incluidas">
            ${s.tags.map(tag => `<li class="tag">${tag}</li>`).join('')}
          </ul>
        </div>
        <footer class="service-card__footer">
          <span class="service-card__billing">
            <i class="ti ti-calendar-repeat" aria-hidden="true"></i> Instalación + abono mensual
          </span>
          <span class="service-card__cta">Ver ficha <i class="ti ti-arrow-right" aria-hidden="true"></i></span>
        </footer>
      </article>
    `;
  }).join('');
}

/**
 * Renderiza las cards de servicios transversales.
 * @param {Array} transversals - [{ icon, name, desc }]
 */
function renderTransversals(transversals) {
  const grid = document.getElementById('grid-transversal');
  if (!grid) return;

  grid.innerHTML = transversals.map(t => `
    <div class="transversal-card">
      <div class="transversal-card__icon" aria-hidden="true"><i class="ti ${t.icon}"></i></div>
      <div>
        <h3 class="transversal-card__name">${t.name}</h3>
        <p class="transversal-card__desc">${t.desc}</p>
      </div>
    </div>
  `).join('');
}


/* ── SELECTOR DE VERSIÓN ─────────────────────────────────── */

/**
 * Renderiza los ítems del dropdown y actualiza el label del botón.
 * @param {string} activeKey
 */
function updateVersionSelectorUI(activeKey) {
  const dropdown = document.getElementById('version-dropdown');
  const label    = document.getElementById('version-current-label');

  if (dropdown) {
    dropdown.innerHTML = Object.entries(window.MAPA_VERSIONS)
      .map(([key, vd]) => {
        const isActive = key === activeKey;
        return `
          <li class="version-selector__item${isActive ? ' is-active' : ''}"
              data-version="${key}" role="option"
              aria-selected="${isActive ? 'true' : 'false'}"
              onclick="setVersion('${key}')">
            <span class="version-selector__item-label">${vd.id}</span>
            <span class="version-selector__item-desc">${vd.desc}</span>
          </li>
        `;
      }).join('');
  }

  if (label && window.MAPA_VERSIONS[activeKey]) {
    const vd = window.MAPA_VERSIONS[activeKey];
    label.textContent = `${vd.id} — ${vd.desc}`;
  }
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


/* ── SEGMENT TABS ────────────────────────────────────────── */

/**
 * Activa un panel de segmento y su tab correspondiente.
 * @param {string} segmentId
 * @param {HTMLElement} activeTab
 */
function showSegment(segmentId, activeTab) {
  document.querySelectorAll('.segment-panel').forEach(p => p.classList.remove('is-active'));
  document.querySelectorAll('.segment-tab').forEach(t => t.classList.remove('is-active'));

  const panel = document.getElementById('segment-' + segmentId);
  if (panel) panel.classList.add('is-active');
  if (activeTab) activeTab.classList.add('is-active');
}


/* ── MODAL ───────────────────────────────────────────────── */

/**
 * Abre el modal de detalle de un servicio usando los datos de la versión activa.
 * @param {string} serviceId
 */
function openServiceModal(serviceId) {
  if (!_currentVersion) return;
  const service = _currentVersion.services[serviceId];
  if (!service) return;

  _currentFichaId   = service.ficha || null;
  _currentFichaName = service.name  || null;

  document.getElementById('modal-badge').textContent = _currentVersion.segments[service.segment]?.name || service.segment;
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

  const fichaBtn   = document.getElementById('modal-ficha-btn');
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
  if (event.target === document.getElementById('modal-overlay')) closeModal();
}


/* ── NAVEGACIÓN ENTRE VISTAS ─────────────────────────────── */

/**
 * Alterna entre la vista del mapa y la ficha de producto.
 * @param {string} view - 'mapa' | 'ficha'
 * @param {string} [fichaName]
 */
function showView(view, fichaName) {
  document.getElementById('app-mapa').style.display  = view === 'mapa'  ? 'block' : 'none';
  document.getElementById('app-ficha').style.display = view === 'ficha' ? 'block' : 'none';

  updateBreadcrumb(view === 'ficha' ? fichaName : null);
  window.scrollTo(0, 0);
}

/**
 * Actualiza el breadcrumb según la vista activa.
 * @param {string|null} fichaName
 */
function updateBreadcrumb(fichaName) {
  const nav = document.querySelector('.breadcrumb');
  if (!nav) return;

  nav.querySelectorAll('.breadcrumb__dynamic').forEach(el => el.remove());

  const current = nav.querySelector('.breadcrumb__current');
  if (!current) return;

  if (fichaName) {
    current.outerHTML =
      `<a class="breadcrumb__link" onclick="showView('mapa')" style="cursor:pointer;">Mapa de Servicios</a>`;

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
 * Renderiza y navega a una ficha por ID (última versión disponible).
 * @param {string} fichaId - ej. 'comercio-seguro'
 */
function openFicha(fichaId) {
  const fichaVersions = window.FICHA_VERSIONS && window.FICHA_VERSIONS[fichaId];
  if (!fichaVersions) return;
  const latestKey = Object.keys(fichaVersions).at(-1);
  const data      = fichaVersions[latestKey];
  renderFichaById(fichaId);
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeAreaDetail(); }
  });

  // Cerrar dropdowns al click fuera
  document.addEventListener('click', e => {
    if (!e.target.closest('#version-selector'))       closeVersionDropdown();
    if (!e.target.closest('#ficha-version-selector')) closeFichaVersionDropdown();
  });

  // Cargar la versión más reciente
  const latestKey = Object.keys(window.MAPA_VERSIONS || {}).at(-1);
  if (latestKey) setVersion(latestKey);
});

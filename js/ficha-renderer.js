/* ============================================================
   ficha-renderer.js — Renderizado dinámico de Fichas de Producto
   Solo lógica y rendering. Sin datos de contenido.
   El contenido vive en js/fichas/versiones/[ficha]-v*.js
   ============================================================ */

'use strict';


/* ── ESTADO ─────────────────────────────────────────────── */

let _activeFichaId = null;


/* ── VERSIONES: ENTRY POINTS ─────────────────────────────── */

/**
 * Renderiza una ficha en su última versión (o una versión específica).
 * Entry point principal — llamado desde mapa-servicios.js.
 * @param {string} fichaId   - ej. 'comercio-seguro'
 * @param {string} [versionKey] - ej. 'v1.1' — si se omite, usa la última
 */
function renderFichaById(fichaId, versionKey) {
  const fichaVersions = window.FICHA_VERSIONS && window.FICHA_VERSIONS[fichaId];
  if (!fichaVersions) return;

  const key  = versionKey || Object.keys(fichaVersions).at(-1);
  const data = fichaVersions[key];
  if (!data) return;

  _activeFichaId = fichaId;

  _renderFichaContent(data);
  _renderFichaVersionSelector(fichaId, key);
}

/**
 * Cambia la versión de la ficha actualmente visible.
 * Llamado desde los ítems del dropdown de versión.
 * @param {string} versionKey
 */
function setFichaVersion(versionKey) {
  if (_activeFichaId) renderFichaById(_activeFichaId, versionKey);
  closeFichaVersionDropdown();
}


/* ── SELECTOR DE VERSIÓN ─────────────────────────────────── */

function _renderFichaVersionSelector(fichaId, activeKey) {
  const fichaVersions = window.FICHA_VERSIONS[fichaId] || {};
  const dropdown = document.getElementById('ficha-version-dropdown');
  const label    = document.getElementById('ficha-version-current-label');

  if (dropdown) {
    dropdown.innerHTML = Object.entries(fichaVersions)
      .map(([key, vd]) => {
        const isActive = key === activeKey;
        return `
          <li class="version-selector__item${isActive ? ' is-active' : ''}"
              data-version="${key}" role="option"
              aria-selected="${isActive ? 'true' : 'false'}"
              onclick="setFichaVersion('${key}')">
            <span class="version-selector__item-label">${vd.versionId}</span>
            <span class="version-selector__item-desc">${vd.versionDesc}</span>
          </li>`;
      }).join('');
  }

  if (label && fichaVersions[activeKey]) {
    const vd = fichaVersions[activeKey];
    label.textContent = `${vd.versionId} — ${vd.versionDesc}`;
  }
}

function toggleFichaVersionDropdown() {
  const dropdown = document.getElementById('ficha-version-dropdown');
  const btn      = document.getElementById('ficha-version-btn');
  if (!dropdown || !btn) return;
  const isOpen = dropdown.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeFichaVersionDropdown() {
  const dropdown = document.getElementById('ficha-version-dropdown');
  const btn      = document.getElementById('ficha-version-btn');
  if (dropdown) dropdown.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}


/* ── HELPERS ─────────────────────────────────────────────── */

/**
 * Renderiza una celda de la tabla de kits.
 * Soporta: 'ok', 'no', 'x 2', 'pill:texto', '—'
 */
function _kitCell(val) {
  if (!val || val === '—') return '—';
  if (val === 'ok') return '<span class="dot dot--ok"></span>';
  if (val === 'no') return '<span class="dot dot--no"></span>';
  if (val.startsWith('pill:')) return `<span class="pill">${val.slice(5)}</span>`;
  return val;
}

/**
 * Renderiza una celda de la tabla de competencia.
 * Soporta: 'ok:texto', 'no:texto', 'strong:texto', texto plano, '—'
 */
function _compCell(val) {
  if (!val || val === '—') return '—';
  if (val.startsWith('ok:'))     return `<span class="dot dot--ok"></span> ${val.slice(3)}`;
  if (val.startsWith('no:'))     return `<span class="dot dot--no"></span> ${val.slice(3)}`;
  if (val.startsWith('strong:')) return `<strong>${val.slice(7)}</strong>`;
  return val;
}

/** Renderiza un badge de estado para checklist y áreas. */
const _STATUS = {
  ok:   { cls: 'status-badge--ok',   label: 'OK' },
  prog: { cls: 'status-badge--prog', label: 'En progreso' },
  rev:  { cls: 'status-badge--rev',  label: 'A revisión' },
};

function _badge(status, fecha) {
  const s = _STATUS[status] || { cls: '', label: status };
  const f = fecha ? ` — ${fecha}` : '';
  return `<span class="status-badge ${s.cls}">${s.label}${f}</span>`;
}


/* ── SECCIONES ───────────────────────────────────────────── */

function _header(d) {
  return `
    <header class="ficha-header">
      <div class="ficha-header__right">
        <span class="ficha-header__badge">${d.badge}</span>
        <h1 class="ficha-header__product-name">${d.name}</h1>
        <p class="ficha-header__version">Ver ${d.version} &nbsp;&middot;&nbsp; ${d.date} &nbsp;&middot;&nbsp; Autor: ${d.author}</p>
      </div>
    </header>`;
}

function _tabNav() {
  const tabs = [
    { id: 'general',      icon: 'ti-file-description', label: 'General'      },
    { id: 'equipamiento', icon: 'ti-cpu',              label: 'Equipamiento' },
    { id: 'precios',      icon: 'ti-currency-dollar',  label: 'Precios'      },
    { id: 'proceso',      icon: 'ti-sitemap',          label: 'Procesos'     },
    { id: 'faq',          icon: 'ti-help-circle',      label: 'FAQ'          },
    { id: 'competencia',  icon: 'ti-chart-bar',        label: 'Competencia'  },
    { id: 'areas',        icon: 'ti-users',            label: 'Áreas'        },
  ];
  return `
    <nav class="section-tab-row" role="tablist" aria-label="Secciones de la ficha">
      ${tabs.map(t => `
        <button class="section-tab" role="tab" onclick="showFichaSection('${t.id}', this)">
          <i class="ti ${t.icon}" aria-hidden="true"></i> ${t.label}
        </button>`).join('')}
    </nav>`;
}

function _secGeneral(g) {
  const infocards = g.infocards.map(c => `
    <div class="ficha-info-card">
      <i class="ti ${c.icon}" aria-hidden="true"></i>
      <div>
        <div class="ficha-info-card__title">${c.title}</div>
        <div class="ficha-info-card__body">${c.body}</div>
      </div>
    </div>`).join('');

  const comercItems = g.comercializacion.map(item =>
    `<li><i class="ti ti-check" aria-hidden="true"></i>${item}</li>`).join('');

  const checkItems = g.checklist.map(item =>
    `<li><i class="ti ti-clipboard-list" aria-hidden="true"></i>${item.label} ${_badge(item.status, item.fecha)}</li>`).join('');

  // "Requerimientos para el cliente" es opcional — no todas las fichas lo tienen cargado todavía.
  const requerimientosBlock = (g.requerimientos && g.requerimientos.length) ? `
      <div class="ficha-card-full">
        <p class="section-label">Requerimientos para el cliente</p>
        <ul class="checklist">${g.requerimientos.map(item =>
          `<li><i class="ti ti-list-check" aria-hidden="true"></i>${item}</li>`).join('')}</ul>
      </div>` : '';

  return `
    <section id="sec-general" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Descripción del producto</p>
        <p style="font-size:14px; color:#374151; line-height:1.7;">${g.descripcion}</p>
      </div>
      <div class="ficha-info-row">${infocards}</div>
      <div class="grid-2">
        <div class="ficha-card">
          <p class="section-label">Forma de comercialización</p>
          <ul class="checklist">${comercItems}</ul>
        </div>
        <div class="ficha-card">
          <p class="section-label">Check-list de lanzamiento</p>
          <ul class="checklist">${checkItems}</ul>
        </div>
      </div>
      ${requerimientosBlock}
    </section>`;
}

function _secEquipamiento(e) {
  const kitCols   = e.kits.cols;
  const colHeaders = kitCols.slice(1).map(c =>
    `<th style="width:24%; text-align:center;">${c}</th>`).join('');

  const kitRows = e.kits.grupos.map(grupo => {
    const sep = `
      <tr style="background:#f9fafb;">
        <td colspan="${kitCols.length}" style="font-size:11px; font-weight:700; color:#9ca3af; padding:8px 12px; text-transform:uppercase; letter-spacing:0.5px;">
          ${grupo.label}
        </td>
      </tr>`;
    const filas = grupo.filas.map(fila => {
      const celdas = fila.slice(1).map(v =>
        `<td style="text-align:center;">${_kitCell(v)}</td>`).join('');
      return `<tr><td>${fila[0]}</td>${celdas}</tr>`;
    }).join('');
    return sep + filas;
  }).join('');

  const servicios = e.servicios.map(s => `
    <div class="feature-item">
      <i class="ti ${s.icon}" aria-hidden="true"></i>
      <div class="feature-item__label">${s.label}</div>
      <div class="feature-item__desc">${s.desc}</div>
    </div>`).join('');

  return `
    <section id="sec-equipamiento" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Kits disponibles — Equipamiento Ajax</p>
        <table class="data-table" style="table-layout:fixed;">
          <thead>
            <tr>
              <th style="width:52%;">${kitCols[0]}</th>
              ${colHeaders}
            </tr>
          </thead>
          <tbody>${kitRows}</tbody>
        </table>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Servicios incluidos</p>
        <div class="feature-grid">${servicios}</div>
      </div>
    </section>`;
}

function _secPrecios(p) {
  const cards = p.cards.map(c => `
    <div class="price-card${c.featured ? ' price-card--featured' : ''}">
      ${c.featured && c.featuredLabel ? `<div class="price-card__badge-popular">${c.featuredLabel}</div>` : ''}
      <div class="price-card__label">${c.label}</div>
      <div class="price-card__value">${c.value}</div>
      <div class="price-card__sub">${c.sub}</div>
    </div>`).join('');

  const cancelRows = p.cancelacion.map(r =>
    `<tr><td>${r.momento}</td><td>${r.penalidad}</td></tr>`).join('');

  const notas = p.notas.map(n => `
    <li>
      <i class="ti ${n.icon}"${n.color ? ` style="color:${n.color};"` : ''} aria-hidden="true"></i>${n.text}
    </li>`).join('');

  return `
    <section id="sec-precios" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Estructura de precios</p>
        <div class="pricing-row">${cards}</div>
        <div class="alert-box">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          ${p.alerta}
        </div>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Condiciones de cancelación anticipada</p>
        <table class="data-table">
          <thead><tr><th>Momento de cancelación</th><th>Penalidad</th></tr></thead>
          <tbody>${cancelRows}</tbody>
        </table>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Notas sobre precios de venta</p>
        <ul class="checklist">${notas}</ul>
      </div>
    </section>`;
}

function _secProceso(pr) {
  const secciones = pr.secciones.map(s => {
    const pasos = s.pasos.map((paso, i) => `
      <div class="process-step">
        <div class="process-step__num">${i + 1}</div>
        <div>
          <div class="process-step__title">${paso.title}</div>
          ${paso.note ? `<div class="process-step__note">${paso.note}</div>` : ''}
        </div>
      </div>`).join('');
    return `
      <div class="ficha-card">
        <p class="section-label">${s.label}</p>
        ${pasos}
      </div>`;
  }).join('');

  const nsRows = pr.netsuite.map(r =>
    `<tr><td>${r.articulo}</td><td><code class="ns-code">${r.codigo}</code></td><td style="color:#6b7280;">${r.desc}</td></tr>`).join('');

  // "Indicadores de gestión (KPIs)" es opcional — pensado para fichas de unidad de
  // negocio (ej. pilotos), no para fichas de producto estándar.
  const indicadoresBlock = (pr.indicadores && pr.indicadores.length) ? `
      <div class="ficha-card-full">
        <p class="section-label">Indicadores de gestión (KPIs)</p>
        <table class="data-table">
          <thead><tr><th>Indicador</th><th>Descripción</th><th>Meta / objetivo</th></tr></thead>
          <tbody>${pr.indicadores.map(k =>
            `<tr><td>${k.nombre}</td><td>${k.descripcion}</td><td>${k.meta}</td></tr>`).join('')}</tbody>
        </table>
      </div>` : '';

  return `
    <section id="sec-proceso" class="section-panel" role="tabpanel">
      <div class="grid-2">${secciones}</div>
      <div class="ficha-card-full">
        <p class="section-label">Códigos Netsuite</p>
        <table class="data-table">
          <thead><tr><th>Artículo</th><th>Código NS</th><th>Descripción</th></tr></thead>
          <tbody>${nsRows}</tbody>
        </table>
      </div>
      ${indicadoresBlock}
    </section>`;
}

function _secFaq(faq) {
  const items = faq.map(item => `
    <div class="faq-item">
      <div class="faq-item__question" onclick="toggleFaq(this.parentElement)">
        ${item.q} <i class="ti ti-chevron-down" aria-hidden="true"></i>
      </div>
      <div class="faq-item__answer">${item.a}</div>
    </div>`).join('');

  return `
    <section id="sec-faq" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Preguntas frecuentes</p>
        ${items}
      </div>
    </section>`;
}

function _secCompetencia(comp) {
  const headers = comp.competidores.map(c => `<th>${c}</th>`).join('');
  const rows    = comp.filas.map(fila => {
    const vals = fila.valores.map(v => `<td>${_compCell(v)}</td>`).join('');
    return `<tr><td>${fila.criterio}</td><td class="sp-col">${_compCell(fila.sp)}</td>${vals}</tr>`;
  }).join('');

  return `
    <section id="sec-competencia" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Análisis comparativo de competencia</p>
        <table class="data-table comparison-table">
          <thead>
            <tr>
              <th>Criterio</th>
              <th class="sp-col">SP</th>
              ${headers}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p class="comparison-note">
          <i class="ti ti-alert-triangle" style="color:#d97706;" aria-hidden="true"></i>
          ${comp.nota}
        </p>
      </div>
    </section>`;
}

function _secAreas(areas) {
  // Se guarda para que openAreaDetail() pueda ir a buscar el detalle por índice.
  _currentAreasData = areas;

  const rows = areas.map((a, i) => `
    <tr>
      <td>${a.area}</td>
      <td>${a.responsable}</td>
      <td>${a.comentarios}</td>
      <td>${_badge(a.estado, a.fecha)}</td>
      <td>
        ${a.detalle
          ? `<button class="areas-detail-btn" onclick="openAreaDetail(${i})">
               <i class="ti ti-file-text" aria-hidden="true"></i> Ver detalle
             </button>`
          : '—'}
      </td>
    </tr>`).join('');

  return `
    <section id="sec-areas" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Aprobación por área</p>
        <table class="data-table">
          <thead>
            <tr>
              <th>Área</th>
              <th>Responsable</th>
              <th>Comentarios / Pendientes</th>
              <th>Estado</th>
              <th>Información</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}


/* ── MODAL DE DETALLE POR ÁREA ────────────────────────────── */

let _currentAreasData = [];

/**
 * Renderiza los bloques de contenido de un detalle de área.
 * Soporta: 'texto', 'lista', 'pasos', 'tabla'.
 */
function _renderAreaDetailBlocks(bloques) {
  return bloques.map(b => {
    if (b.tipo === 'texto') {
      return `<p class="modal__row-content">${b.texto}</p>`;
    }
    if (b.tipo === 'lista') {
      return `<ul class="checklist">${b.items.map(item =>
        `<li><i class="ti ti-check" aria-hidden="true"></i>${item}</li>`).join('')}</ul>`;
    }
    if (b.tipo === 'pasos') {
      return b.pasos.map((paso, i) => `
        <div class="process-step">
          <div class="process-step__num">${i + 1}</div>
          <div>
            <div class="process-step__title">${paso.title}</div>
            ${paso.note ? `<div class="process-step__note">${paso.note}</div>` : ''}
          </div>
        </div>`).join('');
    }
    if (b.tipo === 'tabla') {
      const headers = b.headers.map(h => `<th>${h}</th>`).join('');
      const filas   = b.filas.map(fila =>
        `<tr>${fila.map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
      return `
        <table class="data-table">
          <thead><tr>${headers}</tr></thead>
          <tbody>${filas}</tbody>
        </table>`;
    }
    return '';
  }).join('');
}

/**
 * Abre el modal de detalle de un área. Llamado desde el botón "Ver detalle".
 * @param {number} index - índice del área dentro de data.areas
 */
function openAreaDetail(index) {
  const area = _currentAreasData[index];
  if (!area || !area.detalle) return;

  document.getElementById('area-modal-badge').textContent = area.area;
  document.getElementById('area-modal-title').textContent = area.detalle.titulo;
  document.getElementById('area-modal-body').innerHTML = _renderAreaDetailBlocks(area.detalle.bloques);
  document.getElementById('area-modal-overlay').classList.add('is-open');
}

function closeAreaDetail() {
  document.getElementById('area-modal-overlay').classList.remove('is-open');
}

function closeAreaDetailOnOverlayClick(event) {
  if (event.target === document.getElementById('area-modal-overlay')) closeAreaDetail();
}

function _footer() {
  return `
    <footer class="ficha-footer">
      <div>SP Seguridad Privada SA &nbsp;&middot;&nbsp; Av. 13 N 716, La Plata &nbsp;&middot;&nbsp; CUIT 30-64256032-4</div>
      <div>ventas@spseguridad.com.ar &nbsp;&middot;&nbsp; 0810-222-4141</div>
    </footer>`;
}


/* ── RENDER INTERNO ──────────────────────────────────────── */

/**
 * Renderiza el contenido completo de una ficha en #ficha-container.
 * Uso interno — llamar renderFichaById() desde fuera.
 * @param {Object} data - Datos de una versión de ficha
 */
function _renderFichaContent(data) {
  const container = document.getElementById('ficha-container');
  if (!container || !data) return;

  container.innerHTML = [
    _header(data),
    _tabNav(),
    _secGeneral(data.general),
    _secEquipamiento(data.equipamiento),
    _secPrecios(data.precios),
    _secProceso(data.proceso),
    _secFaq(data.faq),
    _secCompetencia(data.competencia),
    _secAreas(data.areas),
    _footer(),
  ].join('');

  // Activar primera pestaña y panel
  const firstTab   = container.querySelector('.section-tab');
  const firstPanel = container.querySelector('.section-panel');
  if (firstTab)   firstTab.classList.add('is-active');
  if (firstPanel) firstPanel.classList.add('is-active');
}

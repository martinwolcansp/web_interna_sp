/* ============================================================
   ficha-renderer.js — Renderizado dinámico de Fichas de Producto
   Lee objetos de datos de js/fichas/ y genera el HTML completo.
   Depende de: fichas/comercio-seguro.js, hogar-venta.js, hogar-comodato.js
   ============================================================ */

'use strict';

/* ── REGISTRO DE FICHAS ─────────────────────────────────── */

const FICHAS = {
  'comercio-seguro': FICHA_COMERCIO_SEGURO,
  'hogar-venta':     FICHA_HOGAR_VENTA,
  'hogar-comodato':  FICHA_HOGAR_COMODATO,
};


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
    </section>`;
}

function _secEquipamiento(e) {
  const kitCols   = e.kits.cols;
  const colWidths = kitCols.slice(1).map(() => `<th style="width:24%; text-align:center;"></th>`);
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

  const rows = comp.filas.map(fila => {
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
  const rows = areas.map(a => `
    <tr>
      <td>${a.area}</td>
      <td>${a.responsable}</td>
      <td>${a.comentarios}</td>
      <td>${_badge(a.estado, a.fecha)}</td>
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
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function _footer() {
  return `
    <footer class="ficha-footer">
      <div>SP Seguridad Privada SA &nbsp;&middot;&nbsp; Av. 13 N 716, La Plata &nbsp;&middot;&nbsp; CUIT 30-64256032-4</div>
      <div>ventas@spseguridad.com.ar &nbsp;&middot;&nbsp; 0810-222-4141</div>
    </footer>`;
}


/* ── ENTRY POINT ─────────────────────────────────────────── */

/**
 * Renderiza una ficha completa en #ficha-container.
 * @param {Object} data - Objeto de datos de la ficha (de js/fichas/*.js)
 */
function renderFicha(data) {
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

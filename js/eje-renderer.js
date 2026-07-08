/* ============================================================
   eje-renderer.js — Renderizado dinámico de los módulos de Eje
   (Unidad de Negocio / Procesos) del Sector Comunicaciones.

   Solo lógica y rendering. Sin datos de contenido — el contenido
   vive en js/ejes/versiones/[eje]-v*.js

   Reutiliza de js/ficha-renderer.js (debe cargarse ANTES que este
   archivo en la página): _header(), _footer(), _badge(), _docLink().
   Reutiliza de js/ficha.js: toggleFichaVersionDropdown() /
   closeFichaVersionDropdown() — son genéricas, solo manipulan el DOM
   del selector de versión por id, no dependen de FICHA_VERSIONS.
   ============================================================ */

'use strict';


/* ── ESTADO ─────────────────────────────────────────────── */

let _activeEjeId = null;


/* ── ENTRY POINTS ─────────────────────────────────────────── */

/**
 * Renderiza un módulo de eje en su última versión (o una versión
 * específica). Entry point principal — llamado desde el script de
 * arranque de cada página (js/sector-comunicaciones-eje1.js, eje2.js).
 * @param {string} ejeId      - 'eje1-unidad-negocio' | 'eje2-procesos'
 * @param {string} [versionKey] - ej. 'v1.0' — si se omite, usa la última
 */
function renderEjeById(ejeId, versionKey) {
  const ejeVersions = window.EJE_VERSIONS && window.EJE_VERSIONS[ejeId];
  if (!ejeVersions) return;

  const key  = versionKey || Object.keys(ejeVersions).at(-1);
  const data = ejeVersions[key];
  if (!data) return;

  _activeEjeId = ejeId;

  _renderEjeContent(data);
  _renderEjeVersionSelector(ejeId, key);
}

/**
 * Cambia la versión del eje actualmente visible.
 * Llamado desde los ítems del dropdown de versión.
 * @param {string} versionKey
 */
function setEjeVersion(versionKey) {
  if (_activeEjeId) renderEjeById(_activeEjeId, versionKey);
  closeFichaVersionDropdown();
}


/* ── SELECTOR DE VERSIÓN (misma UI que las fichas de producto) ── */

function _renderEjeVersionSelector(ejeId, activeKey) {
  const ejeVersions = window.EJE_VERSIONS[ejeId] || {};
  const dropdown = document.getElementById('ficha-version-dropdown');
  const label    = document.getElementById('ficha-version-current-label');

  if (dropdown) {
    dropdown.innerHTML = Object.entries(ejeVersions)
      .map(([key, vd]) => {
        const isActive = key === activeKey;
        return `
          <li class="version-selector__item${isActive ? ' is-active' : ''}"
              data-version="${key}" role="option"
              aria-selected="${isActive ? 'true' : 'false'}"
              onclick="setEjeVersion('${key}')">
            <span class="version-selector__item-label">${vd.versionId}</span>
            <span class="version-selector__item-desc">${vd.versionDesc}</span>
          </li>`;
      }).join('');
  }

  if (label && ejeVersions[activeKey]) {
    const vd = ejeVersions[activeKey];
    label.textContent = `${vd.versionId} — ${vd.versionDesc}`;
  }
}


/* ── HELPERS LOCALES ──────────────────────────────────────── */

/** Renderiza una lista de pasos numerados (mismo componente .process-step de la ficha). */
function _renderPasos(pasos) {
  return pasos.map((paso, i) => `
    <div class="process-step">
      <div class="process-step__num">${i + 1}</div>
      <div>
        <div class="process-step__title">${paso.title}</div>
        ${paso.note ? `<div class="process-step__note">${paso.note}</div>` : ''}
      </div>
    </div>`).join('');
}

/** Renderiza una lista simple de pendientes/puntos críticos como checklist. */
function _renderPendientes(items, icon) {
  if (!items || !items.length) return '<p style="font-size:13px; color:#6b7280;">Sin pendientes.</p>';
  return `<ul class="checklist">${items.map(item =>
    `<li><i class="ti ${icon || 'ti-alert-triangle'}" aria-hidden="true"></i>${item}</li>`).join('')}</ul>`;
}


/* ── TAB NAV (distinta por eje) ───────────────────────────── */

const _EJE1_TABS = [
  { id: 'general',     icon: 'ti-file-description',   label: 'General' },
  { id: 'estructura',  icon: 'ti-users-group',         label: 'Estructura y Roles' },
  { id: 'dotacion',    icon: 'ti-briefcase',           label: 'Dotación y Recursos' },
  { id: 'modelo',      icon: 'ti-file-contract',       label: 'Modelo Comercial' },
  { id: 'indicadores', icon: 'ti-target-arrow',        label: 'Objetivos e Indicadores' },
  { id: 'pendientes',  icon: 'ti-list-check',          label: 'Pendientes' },
];

const _EJE2_TABS = [
  { id: 'general',        icon: 'ti-file-description',  label: 'General' },
  { id: 'comercial',      icon: 'ti-briefcase',          label: 'Comercial' },
  { id: 'instalacion',    icon: 'ti-tool',                label: 'Instalación' },
  { id: 'administrativo', icon: 'ti-clipboard-list',     label: 'Administrativo' },
  { id: 'bloqueantes',    icon: 'ti-alert-triangle',     label: 'Puntos Críticos' },
];

function _tabNavEje(tabs) {
  return `
    <nav class="section-tab-row" role="tablist" aria-label="Secciones del módulo">
      ${tabs.map(t => `
        <button class="section-tab" role="tab" onclick="showFichaSection('${t.id}', this)">
          <i class="ti ${t.icon}" aria-hidden="true"></i> ${t.label}
        </button>`).join('')}
    </nav>`;
}


/* ══════════════════════════════════════════════════════════
   EJE 1 — UNIDAD DE NEGOCIO
   ══════════════════════════════════════════════════════════ */

function _e1General(g) {
  const objetivos = g.objetivos.map(item =>
    `<li><i class="ti ti-target" aria-hidden="true"></i>${item}</li>`).join('');

  const mapaRows = g.mapaTemas.map(t =>
    `<tr><td>${t.tema}</td><td>${_badge(t.estado)}</td><td style="color:#6b7280;">${t.fecha}</td></tr>`).join('');

  return `
    <section id="sec-general" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Sobre este módulo</p>
        <p style="font-size:14px; color:#374151; line-height:1.7;">${g.descripcion}</p>
      </div>
      <div class="grid-2">
        <div class="ficha-card">
          <p class="section-label">Objetivos de la unidad de negocio</p>
          <ul class="checklist">${objetivos}</ul>
        </div>
        <div class="ficha-card">
          <p class="section-label">Justificación / caso de negocio</p>
          <p style="font-size:13px; color:#374151; line-height:1.6;">${g.justificacion}</p>
        </div>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Mapa de temas del eje</p>
        <table class="data-table">
          <thead><tr><th>Tema</th><th>Estado</th><th>Detalle</th></tr></thead>
          <tbody>${mapaRows}</tbody>
        </table>
      </div>
    </section>`;
}

function _e1Estructura(e) {
  const rolesRows = e.roles.map(r =>
    `<tr><td><strong>${r.rol}</strong></td><td>${r.dependeDe}</td><td>${r.objetivo}</td></tr>`).join('');

  return `
    <section id="sec-estructura" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Estructura y dependencia jerárquica</p>
        <p style="font-size:13px; color:#374151; line-height:1.6;">${e.texto}</p>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Roles del sector</p>
        <table class="data-table">
          <thead><tr><th>Rol</th><th>Depende de</th><th>Objetivo del rol</th></tr></thead>
          <tbody>${rolesRows}</tbody>
        </table>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Pendientes</p>
        ${_renderPendientes(e.pendientes)}
      </div>
    </section>`;
}

function _e1Dotacion(d) {
  const recursos = d.recursos.map(item =>
    `<li><i class="ti ti-check" aria-hidden="true"></i>${item}</li>`).join('');

  return `
    <section id="sec-dotacion" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Dotación inicial del sector</p>
        <p style="font-size:13px; color:#374151; line-height:1.6;">${d.texto}</p>
        <div class="alert-box" style="margin-top:12px;">
          <i class="ti ti-alert-triangle" aria-hidden="true"></i>
          ${d.riesgo}
        </div>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Recursos necesarios</p>
        <ul class="checklist">${recursos}</ul>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Pendientes</p>
        ${_renderPendientes(d.pendientes)}
      </div>
    </section>`;
}

function _e1Modelo(m, c) {
  const clausulasRows = c.clausulas.map(cl =>
    `<tr><td><strong>${cl.clausula}</strong></td><td>${cl.detalle}</td></tr>`).join('');

  const docs = (c.documentos || []).map(key => _docLink(key)).join('');

  return `
    <section id="sec-modelo" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Modelo del nuevo abono</p>
        <p style="font-size:13px; color:#374151; line-height:1.6;">${m.texto}</p>
        <div class="alert-box" style="margin-top:12px;">
          <i class="ti ti-info-circle" aria-hidden="true"></i>
          ${m.definicionAcordada}
        </div>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Pendientes — modelo de abono</p>
        ${_renderPendientes(m.pendientes)}
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Contrato de comodato con el cliente</p>
        <p style="font-size:13px; color:#374151; line-height:1.6; margin-bottom:12px;">${c.texto}</p>
        <table class="data-table">
          <thead><tr><th>Cláusula</th><th>Detalle</th></tr></thead>
          <tbody>${clausulasRows}</tbody>
        </table>
        ${docs ? `<div style="margin-top:14px; display:flex; flex-wrap:wrap; gap:8px;">${docs}</div>` : ''}
      </div>
    </section>`;
}

function _e1Indicadores(k) {
  const rows = k.lista.map(i =>
    `<tr><td>${i.nombre}</td><td>${i.descripcion}</td></tr>`).join('');

  return `
    <section id="sec-indicadores" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Objetivos e indicadores de gestión (KPIs)</p>
        <p style="font-size:13px; color:#374151; line-height:1.6; margin-bottom:12px;">${k.texto}</p>
        <table class="data-table">
          <thead><tr><th>Indicador</th><th>Descripción</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Pendientes</p>
        ${_renderPendientes(k.pendientes)}
      </div>
    </section>`;
}

function _e1Pendientes(items) {
  const rows = items.map(p => `
    <tr>
      <td>${p.tema}</td>
      <td>${_badge(p.estado)}</td>
      <td>${p.pendiente}</td>
      <td>${p.interlocutor}</td>
    </tr>`).join('');

  return `
    <section id="sec-pendientes" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Resumen de pendientes del eje</p>
        <table class="data-table">
          <thead><tr><th>Tema</th><th>Estado</th><th>Pendiente</th><th>Interlocutor</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function _renderEje1Content(container, data) {
  container.innerHTML = [
    _header(data),
    _tabNavEje(_EJE1_TABS),
    _e1General(data.general),
    _e1Estructura(data.estructura),
    _e1Dotacion(data.dotacion),
    _e1Modelo(data.modeloAbono, data.contrato),
    _e1Indicadores(data.indicadores),
    _e1Pendientes(data.pendientesResumen),
    _footer(),
  ].join('');
}


/* ══════════════════════════════════════════════════════════
   EJE 2 — PROCESOS
   ══════════════════════════════════════════════════════════ */

function _e2General(g) {
  const rows = g.mapaProcesos.map(p => `
    <tr>
      <td><strong>${p.proceso}</strong></td>
      <td>${p.actores}</td>
      <td>${p.dispara}</td>
      <td>${p.cierra}</td>
    </tr>`).join('');

  return `
    <section id="sec-general" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">¿Para qué sirve este módulo?</p>
        <p style="font-size:14px; color:#374151; line-height:1.7;">${g.descripcion}</p>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Mapa de procesos</p>
        <table class="data-table">
          <thead><tr><th>Proceso</th><th>Actores involucrados</th><th>Dispara</th><th>Cierra con</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="ficha-card-full">
        <p class="section-label">Esquema general del flujo</p>
        <p style="font-size:13px; color:#374151; line-height:1.6;">${g.flujo}</p>
      </div>
    </section>`;
}

function _e2Proceso(id, label, p) {
  const notaBlock = p.nota ? `
    <div class="alert-box" style="margin-bottom:16px;">
      <i class="ti ti-info-circle" aria-hidden="true"></i>
      ${p.nota}
    </div>` : '';

  return `
    <section id="sec-${id}" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Descripción del proceso</p>
        ${_renderPasos(p.pasos)}
      </div>
      ${notaBlock}
      <div class="ficha-card-full">
        <p class="section-label">Puntos críticos y pendientes</p>
        ${_renderPendientes(p.puntosCriticos)}
      </div>
    </section>`;
}

function _e2Bloqueantes(items) {
  const rows = items.map(b => `
    <tr>
      <td>${b.punto}</td>
      <td>${b.proceso}</td>
      <td>${b.interlocutor}</td>
    </tr>`).join('');

  return `
    <section id="sec-bloqueantes" class="section-panel" role="tabpanel">
      <div class="ficha-card-full">
        <p class="section-label">Puntos sin definir que bloquean la operación</p>
        <table class="data-table">
          <thead><tr><th>Punto pendiente</th><th>Proceso que bloquea</th><th>Interlocutor para resolverlo</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function _renderEje2Content(container, data) {
  container.innerHTML = [
    _header(data),
    _tabNavEje(_EJE2_TABS),
    _e2General(data.general),
    _e2Proceso('comercial', 'Comercial', data.comercial),
    _e2Proceso('instalacion', 'Instalación', data.instalacion),
    _e2Proceso('administrativo', 'Administrativo', data.administrativo),
    _e2Bloqueantes(data.bloqueantes),
    _footer(),
  ].join('');
}


/* ── RENDER INTERNO (despacha según el módulo) ────────────── */

function _renderEjeContent(data) {
  const container = document.getElementById('ficha-container');
  if (!container || !data) return;

  if (data.id === 'eje1-unidad-negocio') {
    _renderEje1Content(container, data);
  } else if (data.id === 'eje2-procesos') {
    _renderEje2Content(container, data);
  } else {
    return;
  }

  // Activar primera pestaña y panel
  const firstTab   = container.querySelector('.section-tab');
  const firstPanel = container.querySelector('.section-panel');
  if (firstTab)   firstTab.classList.add('is-active');
  if (firstPanel) firstPanel.classList.add('is-active');
}

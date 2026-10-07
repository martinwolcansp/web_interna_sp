/**
 * procesos-proceso.js — Página de un proceso (mosaico Procesos Operativos).
 *
 * Lee /assets/procesos/<id>/proceso.json (id en data-proceso de #proc-app)
 * y arma las pestañas: Resumen, Diagramas, Documentos y Reuniones. Una
 * pestaña se muestra solo si el JSON tiene datos para ella.
 *
 * Diagramas: visor BPMN de solo lectura (bpmn-js NavigatedViewer, global
 * BpmnJS). Permite zoom, desplazamiento y entrar a los subprocesos con
 * el ícono [+] (drill-down). No permite editar.
 *
 * Documentos: "Ver" abre el PDF dentro de la página; "Descargar" baja el
 * archivo original (Word / Excel).
 *
 * Para publicar un documento nuevo: copiar los archivos en
 * /assets/procesos/<id>/ y agregar la entrada en proceso.json.
 */

(function () {
  const app = document.getElementById('proc-app');
  if (!app) return;
  const procesoId = app.dataset.proceso;
  const base = `/assets/procesos/${procesoId}/`;

  const TABS = [
    { id: 'resumen', label: 'Resumen', icon: 'ti-info-circle' },
    { id: 'diagramas', label: 'Diagramas', icon: 'ti-sitemap' },
    { id: 'documentos', label: 'Documentos', icon: 'ti-files' },
    { id: 'reuniones', label: 'Reuniones', icon: 'ti-users-group' }
  ];

  let data = null;
  let viewer = null;
  let diagramaActual = null;

  fetch(base + 'proceso.json', { cache: 'no-cache' })
    .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(json => { data = json; render(); })
    .catch(err => {
      console.error('[procesos-proceso.js] no se pudo cargar proceso.json', err);
      app.innerHTML = '<p class="proc-loading">No se pudo cargar el proceso. Probá recargar la página.</p>';
    });

  // ── Utilidades ──
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }
  function url(archivo) { return archivo ? base + encodeURI(archivo) : null; }
  function estadoClase(estado) {
    const e = (estado || '').toLowerCase();
    if (e.startsWith('resuelto') || e.startsWith('validado') || e.startsWith('vigente') || e.startsWith('aprobado')) return 'ok';
    if (e.startsWith('a definir') || e.startsWith('propuesto') || e.startsWith('borrador') || e.startsWith('en ')) return 'prog';
    return 'rev';
  }
  function tieneDatos(tab) {
    if (tab === 'resumen') return !!data.resumen;
    return Array.isArray(data[tab]) && data[tab].length > 0;
  }
  function docAcciones(doc) {
    let h = '';
    if (doc.pdf) h += `<button type="button" class="doc-link" data-ver-pdf="${esc(url(doc.pdf))}" data-titulo="${esc(doc.nombre)}"><i class="ti ti-eye" aria-hidden="true"></i> Ver</button>`;
    if (doc.original) h += `<a class="doc-link doc-link--plain" href="${esc(url(doc.original))}" download><i class="ti ti-download" aria-hidden="true"></i> ${esc(extension(doc.original))}</a>`;
    return h;
  }
  function extension(archivo) {
    const ext = archivo.split('.').pop().toLowerCase();
    return { docx: 'Word', xlsx: 'Excel', pdf: 'PDF', bpmn: 'BPMN' }[ext] || ext.toUpperCase();
  }

  // ── Render general ──
  function render() {
    document.title = `${data.nombre} — Procesos Operativos | SP Seguridad`;
    const tabs = TABS.filter(t => tieneDatos(t.id));

    app.innerHTML = `
      <div class="proc-intro">
        <p class="proc-intro__eyebrow">${esc(data.categoria || 'Proceso operativo')}</p>
        <h1 class="proc-intro__title">${esc(data.nombre)}</h1>
        ${data.descripcion ? `<p class="proc-intro__desc">${esc(data.descripcion)}</p>` : ''}
        <div class="proc-meta">
          ${data.estado ? `<span class="status-badge status-badge--${estadoClase(data.estado)}">${esc(data.estado)}</span>` : ''}
          ${data.version ? `<span class="proc-meta__item"><i class="ti ti-git-branch" aria-hidden="true"></i> ${esc(data.version)}</span>` : ''}
          ${data.actualizado ? `<span class="proc-meta__item"><i class="ti ti-calendar" aria-hidden="true"></i> Actualizado ${esc(data.actualizado)}</span>` : ''}
          ${data.responsable ? `<span class="proc-meta__item"><i class="ti ti-user" aria-hidden="true"></i> ${esc(data.responsable)}</span>` : ''}
        </div>
      </div>

      <div class="section-tab-row" role="tablist">
        ${tabs.map(t => `<button type="button" class="section-tab" role="tab" data-tab="${t.id}"><i class="ti ${t.icon}" aria-hidden="true"></i> ${t.label}</button>`).join('')}
      </div>

      ${tabs.map(t => `<section class="proc-panel" data-panel="${t.id}" role="tabpanel" hidden></section>`).join('')}

      <div class="proc-docmodal" id="proc-docmodal" hidden>
        <div class="proc-docmodal__box" role="dialog" aria-modal="true" aria-labelledby="proc-docmodal-title">
          <header class="proc-docmodal__header">
            <h2 class="proc-docmodal__title" id="proc-docmodal-title"></h2>
            <a class="doc-link doc-link--plain" id="proc-docmodal-open" target="_blank" rel="noopener"><i class="ti ti-external-link" aria-hidden="true"></i> Abrir en otra pestaña</a>
            <button type="button" class="modal__close" id="proc-docmodal-close" aria-label="Cerrar"><i class="ti ti-x" aria-hidden="true"></i></button>
          </header>
          <iframe class="proc-docmodal__frame" id="proc-docmodal-frame" title="Documento"></iframe>
        </div>
      </div>

      <footer class="site-footer" role="contentinfo">
        <div>SP Seguridad Privada SA &nbsp;&middot;&nbsp; Av. 13 N 716, La Plata &nbsp;&middot;&nbsp; CUIT 30-64256032-4</div>
        <div>Procesos y Mejora Continua</div>
      </footer>
    `;

    renderResumen();
    renderDiagramas();
    renderDocumentos();
    renderReuniones();
    wireEventos();

    const inicial = (location.hash || '').replace('#', '');
    mostrarTab(tabs.some(t => t.id === inicial) ? inicial : tabs[0].id);
  }

  function panel(id) { return app.querySelector(`[data-panel="${id}"]`); }

  // Tabla única: etapas del relevamiento en orden y, al cerrar cada tramo,
  // el hito donde cambia la responsabilidad. Cada hito se ubica después de
  // la última etapa que lo compone; los que no tienen etapa van al final.
  function filasEtapasHitos() {
    const ultimaEtapa = h => (h.etapas && h.etapas.length) ? Math.max(...h.etapas) : null;
    const filaHito = h => `
      <tr class="proc-hito">
        <td class="proc-table__num"><span class="proc-hito__tag">H${esc(h.n)}</span></td>
        <td class="proc-hito__nombre">${esc(h.nombre)}${h.nota ? `<span class="proc-hito__nota">${esc(h.nota)}</span>` : ''}<span class="status-badge status-badge--${estadoClase(h.estado)} proc-hito__estado-movil">${esc(h.estado)}</span></td>
        <td>${esc(h.responsable || '—')}</td>
        <td><span class="status-badge status-badge--${estadoClase(h.estado)}">${esc(h.estado)}</span></td>
      </tr>`;
    let filas = '';
    data.etapas.forEach(e => {
      filas += `
      <tr class="proc-etapa">
        <td class="proc-table__num">${esc(e.id)}</td>
        <td>${esc(e.nombre)}</td>
        <td>${esc(e.area)}</td>
        <td></td>
      </tr>`;
      data.hitos.filter(h => ultimaEtapa(h) === e.id).forEach(h => { filas += filaHito(h); });
    });
    const sinEtapa = data.hitos.filter(h => ultimaEtapa(h) === null);
    if (sinEtapa.length) {
      filas += `<tr class="proc-etapa proc-etapa--grupo"><td></td><td colspan="3">Hitos sin etapa asociada en el relevamiento</td></tr>`;
      sinEtapa.forEach(h => { filas += filaHito(h); });
    }
    return filas;
  }

  // ── Resumen ──
  function renderResumen() {
    const p = panel('resumen');
    if (!p) return;
    const r = data.resumen;
    let h = '<div class="proc-card">';
    if (r.objetivo) h += `<h2 class="proc-card__title">Objetivo</h2><p class="proc-text">${esc(r.objetivo)}</p>`;
    if (r.alcance) h += `<h2 class="proc-card__title">Alcance</h2><p class="proc-text">${esc(r.alcance)}</p>`;
    if (r.diagnostico) h += `<h2 class="proc-card__title">Diagnóstico</h2><p class="proc-text">${esc(r.diagnostico)}</p>`;
    if (r.areas && r.areas.length) {
      h += `<h2 class="proc-card__title">Áreas que intervienen</h2><div class="proc-pills">${r.areas.map(a => `<span class="pill">${esc(a)}</span>`).join('')}</div>`;
    }
    if (r.puntos && r.puntos.length) {
      h += `<h2 class="proc-card__title">${esc(r.puntosTitulo || 'Puntos clave')}</h2><ul class="proc-list">${r.puntos.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    }
    h += '</div>';

    if (data.hitos && data.hitos.length) {
      const resueltos = data.hitos.filter(x => estadoClase(x.estado) === 'ok').length;
      h += `
        <div class="proc-card">
          <div class="proc-card__head">
            <h2 class="proc-card__title">${Array.isArray(data.etapas) ? 'Etapas e hitos de traspaso de responsabilidad' : 'Hitos de traspaso de responsabilidad'}</h2>
            <span class="proc-card__count">${resueltos} de ${data.hitos.length} ${data.estadosValidacion ? 'validados' : 'resueltos'}</span>
          </div>
          ${Array.isArray(data.etapas) ? `
          <table class="proc-table proc-table--etapas">
            <thead><tr><th>N°</th><th>Etapa / hito</th><th>Área responsable</th><th>Estado</th></tr></thead>
            <tbody>${filasEtapasHitos()}</tbody>
          </table>` : `
          <table class="proc-table">
            <thead><tr><th>N°</th><th>Hito</th><th>Responsable</th><th>Estado</th></tr></thead>
            <tbody>
              ${data.hitos.map(x => `
                <tr>
                  <td class="proc-table__num">${esc(x.n)}</td>
                  <td>${esc(x.nombre)}</td>
                  <td>${esc(x.responsable || '—')}</td>
                  <td><span class="status-badge status-badge--${estadoClase(x.estado)}">${esc(x.estado)}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>`}
          ${data.estadosValidacion ? `
          <p class="proc-table__legend">
            ${Object.entries(data.estadosValidacion).map(([k, v]) => `<span><span class="status-badge status-badge--${estadoClase(k)}">${esc(k)}</span> ${esc(v)}</span>`).join('')}
          </p>` : ''}
        </div>`;
    }
    p.innerHTML = h;
  }

  // ── Diagramas ──
  function renderDiagramas() {
    const p = panel('diagramas');
    if (!p) return;
    p.innerHTML = `
      <div class="proc-diagram-list">
        ${data.diagramas.map((d, i) => `
          <button type="button" class="proc-diagram-item" data-diagrama="${i}">
            <i class="ti ti-sitemap" aria-hidden="true"></i>
            <span>
              <span class="proc-diagram-item__name">${esc(d.nombre)}</span>
              <span class="proc-diagram-item__meta">${esc([d.version, d.fecha, d.estado].filter(Boolean).join(' · '))}</span>
            </span>
          </button>`).join('')}
      </div>
      <div class="proc-viewer" id="proc-viewer">
        <div class="proc-viewer__toolbar">
          <span class="proc-viewer__title" id="proc-viewer-title"></span>
          <button type="button" class="proc-tool" data-accion="zoom-in" title="Acercar"><i class="ti ti-zoom-in"></i></button>
          <button type="button" class="proc-tool" data-accion="zoom-out" title="Alejar"><i class="ti ti-zoom-out"></i></button>
          <button type="button" class="proc-tool" data-accion="ajustar" title="Ajustar a la pantalla"><i class="ti ti-focus-centered"></i></button>
          <button type="button" class="proc-tool" data-accion="pantalla" title="Pantalla completa"><i class="ti ti-maximize"></i></button>
          <button type="button" class="proc-tool" data-accion="svg" title="Descargar imagen (SVG)"><i class="ti ti-photo-down"></i></button>
          <a class="proc-tool" id="proc-viewer-bpmn" title="Descargar archivo .bpmn" download><i class="ti ti-file-download"></i></a>
        </div>
        <div class="proc-viewer__canvas" id="proc-viewer-canvas"></div>
        <p class="proc-viewer__hint"><i class="ti ti-hand-finger" aria-hidden="true"></i>
          Arrastrá para moverte, usá la rueda con Ctrl para hacer zoom y hacé clic en el ícono
          <span class="proc-viewer__plus">+</span> de un subproceso para ver su detalle.</p>
      </div>
      <div id="proc-diagram-desc"></div>
    `;
  }

  async function abrirDiagrama(i) {
    const d = data.diagramas[i];
    if (!d) return;
    diagramaActual = d;
    app.querySelectorAll('.proc-diagram-item').forEach(b => b.classList.toggle('is-active', +b.dataset.diagrama === i));
    document.getElementById('proc-viewer-title').textContent = d.nombre;
    document.getElementById('proc-viewer-bpmn').href = url(d.archivo);
    document.getElementById('proc-diagram-desc').innerHTML = d.descripcion
      ? `<div class="proc-card"><p class="proc-text">${esc(d.descripcion)}</p></div>` : '';

    if (!viewer) {
      if (typeof BpmnJS === 'undefined') {
        document.getElementById('proc-viewer-canvas').innerHTML = '<p class="proc-loading">No se pudo cargar el visor de diagramas.</p>';
        return;
      }
      viewer = new BpmnJS({ container: '#proc-viewer-canvas' });
    }
    try {
      const res = await fetch(url(d.archivo), { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      await viewer.importXML(await res.text());
      viewer.get('canvas').zoom('fit-viewport', 'auto');
    } catch (err) {
      console.error('[procesos-proceso.js] error abriendo diagrama', err);
      document.getElementById('proc-viewer-canvas').insertAdjacentHTML('beforeend',
        '<p class="proc-loading">No se pudo abrir el diagrama.</p>');
    }
  }

  async function accionVisor(accion) {
    if (!viewer) return;
    const canvas = viewer.get('canvas');
    if (accion === 'zoom-in') canvas.zoom(canvas.zoom() * 1.2);
    if (accion === 'zoom-out') canvas.zoom(canvas.zoom() / 1.2);
    if (accion === 'ajustar') canvas.zoom('fit-viewport', 'auto');
    if (accion === 'pantalla') {
      const el = document.getElementById('proc-viewer');
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen();
    }
    if (accion === 'svg') {
      const { svg } = await viewer.saveSVG();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      a.download = (diagramaActual.archivo || 'diagrama.bpmn').replace(/\.bpmn$/i, '') + '.svg';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }
  }

  // ── Documentos ──
  function renderDocumentos() {
    const p = panel('documentos');
    if (!p) return;
    p.innerHTML = `
      <div class="proc-card proc-card--flush">
        <table class="proc-table">
          <thead><tr><th>Documento</th><th>Tipo</th><th>Versión</th><th>Fecha</th><th></th></tr></thead>
          <tbody>
            ${data.documentos.map(doc => `
              <tr>
                <td>
                  <div class="proc-doc__name">${esc(doc.nombre)}</div>
                  ${doc.descripcion ? `<div class="proc-doc__desc">${esc(doc.descripcion)}</div>` : ''}
                </td>
                <td><span class="pill">${esc(doc.tipo || '')}</span></td>
                <td>${esc(doc.version || '—')}</td>
                <td class="proc-nowrap">${esc(doc.fecha || '—')}</td>
                <td class="proc-doc__cell"><div class="proc-doc__actions">${docAcciones(doc)}</div></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  // ── Reuniones ──
  function renderReuniones() {
    const p = panel('reuniones');
    if (!p) return;
    const reuniones = [...data.reuniones].sort((a, b) => (b.orden || 0) - (a.orden || 0));
    p.innerHTML = `<ol class="proc-timeline">${reuniones.map(r => `
      <li class="proc-timeline__item">
        <div class="proc-timeline__marker">${esc(r.codigo)}</div>
        <div class="proc-card proc-timeline__card">
          <div class="proc-card__head">
            <h2 class="proc-card__title">${esc(r.titulo)}</h2>
            <span class="proc-card__count">${esc(r.fecha)}</span>
          </div>
          ${r.objetivo ? `<p class="proc-text">${esc(r.objetivo)}</p>` : ''}
          ${r.participantes && r.participantes.length ? `<div class="proc-pills">${r.participantes.map(x => `<span class="pill">${esc(x)}</span>`).join('')}</div>` : ''}
          ${r.temas && r.temas.length ? `<ul class="proc-list">${r.temas.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
          ${r.documentos && r.documentos.length ? `
            <div class="proc-timeline__docs">
              ${r.documentos.map(doc => `<div class="proc-timeline__doc"><span><i class="ti ti-file-text" aria-hidden="true"></i> ${esc(doc.nombre)}</span><span class="proc-doc__actions">${docAcciones(doc)}</span></div>`).join('')}
            </div>` : ''}
        </div>
      </li>`).join('')}</ol>`;
  }

  // ── Pestañas y eventos ──
  function mostrarTab(id) {
    app.querySelectorAll('.section-tab').forEach(t => {
      const activo = t.dataset.tab === id;
      t.classList.toggle('is-active', activo);
      t.setAttribute('aria-selected', activo);
    });
    app.querySelectorAll('.proc-panel').forEach(p => { p.hidden = p.dataset.panel !== id; });
    if (history.replaceState) history.replaceState(null, '', '#' + id);
    if (id === 'diagramas' && !diagramaActual) abrirDiagrama(0);
  }

  function abrirPdf(href, titulo) {
    const m = document.getElementById('proc-docmodal');
    document.getElementById('proc-docmodal-title').textContent = titulo;
    document.getElementById('proc-docmodal-frame').src = href;
    document.getElementById('proc-docmodal-open').href = href;
    m.hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function cerrarPdf() {
    const m = document.getElementById('proc-docmodal');
    m.hidden = true;
    document.getElementById('proc-docmodal-frame').src = 'about:blank';
    document.body.style.overflow = '';
  }

  function wireEventos() {
    app.addEventListener('click', (e) => {
      const tab = e.target.closest('.section-tab');
      if (tab) return mostrarTab(tab.dataset.tab);
      const diag = e.target.closest('.proc-diagram-item');
      if (diag) return abrirDiagrama(+diag.dataset.diagrama);
      const tool = e.target.closest('.proc-tool[data-accion]');
      if (tool) return accionVisor(tool.dataset.accion);
      const ver = e.target.closest('[data-ver-pdf]');
      if (ver) return abrirPdf(ver.dataset.verPdf, ver.dataset.titulo);
      if (e.target.closest('#proc-docmodal-close') || e.target.id === 'proc-docmodal') return cerrarPdf();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarPdf(); });
    document.addEventListener('fullscreenchange', () => {
      if (viewer) setTimeout(() => viewer.get('canvas').zoom('fit-viewport', 'auto'), 100);
    });
  }
})();

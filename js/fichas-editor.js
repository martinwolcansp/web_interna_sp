/**
 * fichas-editor.js — Editor de fichas de producto (gestor de contenidos
 * estandarizado para Mapa de Servicios + la ficha "Eje 3" de Sector
 * Comunicaciones, que comparten renderer y forma de datos).
 *
 * v1: los campos de identificación son inputs reales; las 7 pestañas de
 * contenido (general, equipamiento, precios, proceso, faq, competencia,
 * areas) se editan como JSON validado en un textarea por pestaña — sin
 * formularios granulares por campo. Si más adelante hace falta un campo
 * puntual con su propio input, se "promueve" sacándolo del JSON a una
 * columna real, sin tocar el resto del editor.
 *
 * Acceso: fn_mis_secciones_editables() (superadmin ve todas). La
 * seguridad real la da RLS (supabase/migracion_4_fichas_producto.sql) —
 * este script sólo decide qué mostrar y arma los pedidos.
 *
 * Requiere supabase/migracion_4_fichas_producto.sql (tablas fichas /
 * ficha_versiones + fn_mis_secciones_editables) y
 * supabase/seed_fichas_producto.sql (contenido real ya migrado).
 */

const FE_TABS = ['general', 'equipamiento', 'precios', 'proceso', 'faq', 'competencia', 'areas'];
const FE_IDENT_FIELDS = ['nombre', 'badge', 'version', 'version_id', 'fecha', 'autor', 'lider_producto', 'colaborador', 'version_desc'];
// Los ids del HTML no siguen 1:1 el nombre de columna (fe-lider, no
// fe-lider-producto) — mapa explícito para no depender de un reemplazo
// de guiones bajos que no siempre da el id correcto.
const FE_IDENT_FIELD_IDS = {
  nombre: 'fe-nombre', badge: 'fe-badge', version: 'fe-version',
  version_id: 'fe-version-id', fecha: 'fe-fecha', autor: 'fe-autor',
  lider_producto: 'fe-lider', colaborador: 'fe-colaborador', version_desc: 'fe-version-desc'
};

let fe_fichasCache = [];              // fichas que el usuario puede editar
let fe_versionesPorFicha = {};        // { fichaId: [fila ficha_versiones, ...] }
let fe_seccionesEditablesIds = [];    // ids de secciones editables (vacío + superadmin = todas)
let fe_isSuperadmin = false;
let fe_currentFichaId = null;
let fe_currentVersionRowId = null;
let fe_searchIndex = [];
let fe_searchDebounce = null;
// sp:auth-ready puede disparar más de una vez por carga de página (login +
// cada refresco de token) — mismo patrón que pizarra-editor.js: los
// listeners de elementos fijos se enganchan una sola vez.
let fe_wired = false;

document.addEventListener('sp:auth-ready', handleAuthReady);

async function handleAuthReady(e) {
  const gate = document.getElementById('fe-gate');
  const content = document.getElementById('fe-content');
  if (!gate || !content || !window.supabaseClient) return;

  if (e.detail.error) {
    showGate('No se pudo verificar tu sesión. Probá recargar la página.');
    console.error('[fichas-editor.js] sp:auth-ready llegó con error', e.detail.error);
    return;
  }

  const session = e.detail.session;

  if (!session) {
    showGate('Iniciá sesión para acceder al editor de fichas de producto.');
    return;
  }

  // Ver nota equivalente en admin.js / pizarra-editor.js: cualquier falla
  // de red de acá para abajo dejaba la pantalla sin gate y sin contenido,
  // colgada en blanco hasta recargar la página.
  try {
    const { data: perfil, error } = await window.supabaseClient
      .from('perfiles')
      .select('activo, es_superadmin')
      .eq('id', session.user.id)
      .single();

    if (error || !perfil) {
      showGate('No se pudo verificar tu acceso. Probá recargar la página.');
      console.error('[fichas-editor.js] error cargando perfil', error);
      return;
    }

    if (!perfil.activo) {
      showGate('Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.');
      return;
    }

    fe_isSuperadmin = perfil.es_superadmin;

    if (!fe_isSuperadmin) {
      const { data: secciones, error: seccionesError } = await window.supabaseClient
        .rpc('fn_mis_secciones_editables');
      if (seccionesError) {
        showGate('No se pudo verificar tu permiso. Probá recargar la página.');
        console.error('[fichas-editor.js] error cargando secciones editables', seccionesError);
        return;
      }
      fe_seccionesEditablesIds = (secciones || []).map(s => s.id);
      if (fe_seccionesEditablesIds.length === 0) {
        showGate('No tenés permiso para editar fichas de producto. Pedile a un administrador que te lo habilite.');
        return;
      }
    }

    gate.style.display = 'none';
    content.style.display = '';

    if (!fe_wired) {
      fe_wired = true;
      wireOnce();
    }

    await loadSeccionesParaAltaFicha();
    await loadFichas();
  } catch (err) {
    showGate('No se pudo conectar. Probá recargar la página.');
    console.error('[fichas-editor.js] error inesperado', err);
  }
}

function showGate(mensaje) {
  const gate = document.getElementById('fe-gate');
  const content = document.getElementById('fe-content');
  content.style.display = 'none';
  gate.style.display = '';
  gate.innerHTML = `
    <p>${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
  `;
}

function wireOnce() {
  document.getElementById('fe-select-ficha').addEventListener('change', onFichaChange);
  document.getElementById('fe-select-version').addEventListener('change', onVersionChange);
  document.getElementById('fe-new-version-btn').addEventListener('click', onNewVersion);
  document.getElementById('fe-new-ficha-btn').addEventListener('click', onNewFicha);
  document.getElementById('fe-save-btn').addEventListener('click', onSave);
  document.getElementById('fe-search-input').addEventListener('input', onSearchInput);

  const tabsWrap = document.getElementById('fe-tabs-wrap');
  tabsWrap.innerHTML = FE_TABS.map(tab => `
    <div class="fe-tab" data-tab="${tab}">
      <div class="fe-tab__header">
        <span class="fe-tab__title">${escapeHtml(tab)}</span>
        <div class="fe-tab__actions">
          <button type="button" class="btn btn--secondary fe-tab-format">Formatear</button>
        </div>
      </div>
      <textarea class="admin-input fe-tab-textarea" data-tab="${tab}" spellcheck="false"></textarea>
      <p class="fe-tab__error" data-tab-error="${tab}" style="display:none;"></p>
    </div>
  `).join('');

  tabsWrap.querySelectorAll('.fe-tab').forEach(tabEl => {
    const tab = tabEl.dataset.tab;
    tabEl.querySelector('.fe-tab-format').addEventListener('click', () => formatTab(tab));
    tabEl.querySelector('.fe-tab-textarea').addEventListener('input', () => clearTabError(tab));
  });
}

/* ── Secciones (para el desplegable de "dar de alta ficha nueva") ──── */

async function loadSeccionesParaAltaFicha() {
  const select = document.getElementById('fe-new-ficha-seccion');

  const { data, error } = await window.supabaseClient
    .from('secciones')
    .select('id, nombre')
    .eq('tipo', 'mosaico')
    .order('nombre');

  if (error) {
    console.error('[fichas-editor.js] error cargando secciones', error);
    select.innerHTML = '';
    return;
  }

  const opciones = fe_isSuperadmin
    ? (data || [])
    : (data || []).filter(s => fe_seccionesEditablesIds.includes(s.id));

  select.innerHTML = opciones.map(s => `<option value="${escapeAttr(s.id)}">${escapeHtml(s.nombre)}</option>`).join('');
}

/* ── Fichas + versiones ─────────────────────────────────────────────── */

async function loadFichas() {
  const { data, error } = await window.supabaseClient
    .from('fichas')
    .select('id, seccion_id, nombre, badge')
    .order('nombre');

  if (error) {
    console.error('[fichas-editor.js] error cargando fichas', error);
    fe_fichasCache = [];
    return;
  }

  fe_fichasCache = fe_isSuperadmin
    ? (data || [])
    : (data || []).filter(f => fe_seccionesEditablesIds.includes(f.seccion_id));

  const select = document.getElementById('fe-select-ficha');
  select.innerHTML = fe_fichasCache
    .map(f => `<option value="${escapeAttr(f.id)}">${escapeHtml(f.nombre)} (${escapeHtml(f.seccion_id)})</option>`)
    .join('');

  if (fe_fichasCache.length === 0) {
    document.getElementById('fe-select-version').innerHTML = '';
    return;
  }

  await loadVersiones(fe_fichasCache.map(f => f.id));
  buildSearchIndex();

  fe_currentFichaId = fe_fichasCache[0].id;
  select.value = fe_currentFichaId;
  populateVersionSelect(fe_currentFichaId);
}

async function loadVersiones(fichaIds) {
  const { data, error } = await window.supabaseClient
    .from('ficha_versiones')
    .select('*')
    .in('ficha_id', fichaIds);

  if (error) {
    console.error('[fichas-editor.js] error cargando versiones', error);
    fe_versionesPorFicha = {};
    return;
  }

  fe_versionesPorFicha = {};
  (data || []).forEach(v => {
    if (!fe_versionesPorFicha[v.ficha_id]) fe_versionesPorFicha[v.ficha_id] = [];
    fe_versionesPorFicha[v.ficha_id].push(v);
  });
  Object.values(fe_versionesPorFicha).forEach(rows => rows.sort(compareVersionKeysDesc));
}

// Orden numérico real (v1.10 después de v1.9), no orden de texto. Más
// reciente primero, así queda seleccionada por defecto.
function compareVersionKeysDesc(a, b) {
  const pa = parseVersionKey(a.version_key);
  const pb = parseVersionKey(b.version_key);
  return (pb[0] - pa[0]) || (pb[1] - pa[1]);
}
function parseVersionKey(vk) {
  const m = (vk || '').match(/^v(\d+)\.(\d+)$/i);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

function onFichaChange() {
  fe_currentFichaId = document.getElementById('fe-select-ficha').value;
  populateVersionSelect(fe_currentFichaId);
}

function populateVersionSelect(fichaId, selectRowId) {
  const select = document.getElementById('fe-select-version');
  const rows = fe_versionesPorFicha[fichaId] || [];

  select.innerHTML = rows.map(v => `
    <option value="${escapeAttr(v.id)}">${escapeHtml(v.version_id || v.version_key)}${v.version_desc ? ' — ' + escapeHtml(truncar(v.version_desc, 60)) : ''}</option>
  `).join('');

  if (rows.length === 0) {
    clearForm();
    return;
  }

  const targetId = selectRowId && rows.some(v => v.id === selectRowId) ? selectRowId : rows[0].id;
  select.value = targetId;
  onVersionChange();
}

function onVersionChange() {
  const rowId = document.getElementById('fe-select-version').value;
  const rows = fe_versionesPorFicha[fe_currentFichaId] || [];
  const row = rows.find(v => v.id === rowId);
  if (!row) { clearForm(); return; }
  loadVersionIntoForm(row);
}

function loadVersionIntoForm(row) {
  fe_currentVersionRowId = row.id;

  document.getElementById('fe-nombre').value = row.nombre || '';
  document.getElementById('fe-badge').value = row.badge || '';
  document.getElementById('fe-version').value = row.version || '';
  document.getElementById('fe-version-id').value = row.version_id || '';
  document.getElementById('fe-fecha').value = row.fecha || '';
  document.getElementById('fe-autor').value = row.autor || '';
  document.getElementById('fe-lider').value = row.lider_producto || '';
  document.getElementById('fe-colaborador').value = row.colaborador || '';
  document.getElementById('fe-version-desc').value = row.version_desc || '';

  FE_TABS.forEach(tab => {
    const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`);
    textarea.value = JSON.stringify(row[tab] ?? {}, null, 2);
    clearTabError(tab);
  });

  document.getElementById('fe-save-status').textContent = '';
}

function clearForm() {
  fe_currentVersionRowId = null;
  FE_IDENT_FIELDS.forEach(f => {
    const el = document.getElementById(FE_IDENT_FIELD_IDS[f]);
    if (el) el.value = '';
  });
  FE_TABS.forEach(tab => {
    document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`).value = '';
    clearTabError(tab);
  });
}

/* ── Pestañas JSON: formateo + validación ───────────────────────────── */

function formatTab(tab) {
  const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`);
  try {
    const parsed = JSON.parse(textarea.value);
    textarea.value = JSON.stringify(parsed, null, 2);
    clearTabError(tab);
  } catch (err) {
    showTabError(tab, 'JSON inválido: ' + err.message);
  }
}

function clearTabError(tab) {
  const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`);
  const errorEl = document.querySelector(`[data-tab-error="${tab}"]`);
  textarea.classList.remove('fe-tab-textarea--error');
  errorEl.style.display = 'none';
  errorEl.textContent = '';
}

function showTabError(tab, mensaje) {
  const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`);
  const errorEl = document.querySelector(`[data-tab-error="${tab}"]`);
  textarea.classList.add('fe-tab-textarea--error');
  errorEl.style.display = '';
  errorEl.textContent = mensaje;
}

// Valida las 7 pestañas; devuelve { ok, valores } o { ok:false } si hay
// errores (ya marcados en el DOM tab por tab).
function validarTabs() {
  const valores = {};
  let ok = true;
  FE_TABS.forEach(tab => {
    const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${tab}"]`);
    try {
      valores[tab] = JSON.parse(textarea.value || '{}');
      clearTabError(tab);
    } catch (err) {
      showTabError(tab, 'JSON inválido: ' + err.message);
      ok = false;
    }
  });
  return { ok, valores };
}

/* ── Guardar ─────────────────────────────────────────────────────────── */

async function onSave() {
  const statusEl = document.getElementById('fe-save-status');
  const saveBtn = document.getElementById('fe-save-btn');

  if (!fe_currentVersionRowId) {
    statusEl.textContent = 'Elegí una ficha y versión primero';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  const nombre = document.getElementById('fe-nombre').value.trim();
  if (!nombre) {
    statusEl.textContent = 'Falta el nombre';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  const { ok, valores } = validarTabs();
  if (!ok) {
    statusEl.textContent = 'Hay JSON inválido en alguna pestaña — revisá los avisos en rojo';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  const payload = {
    nombre,
    badge: document.getElementById('fe-badge').value.trim() || null,
    version: document.getElementById('fe-version').value.trim() || null,
    version_id: document.getElementById('fe-version-id').value.trim() || null,
    fecha: document.getElementById('fe-fecha').value.trim() || null,
    autor: document.getElementById('fe-autor').value.trim() || null,
    lider_producto: document.getElementById('fe-lider').value.trim() || null,
    colaborador: document.getElementById('fe-colaborador').value.trim() || null,
    version_desc: document.getElementById('fe-version-desc').value.trim() || null,
    ...valores
  };

  saveBtn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const { error } = await window.supabaseClient
    .from('ficha_versiones')
    .update(payload)
    .eq('id', fe_currentVersionRowId);

  saveBtn.disabled = false;

  if (error) {
    statusEl.textContent = 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[fichas-editor.js] error guardando version', error);
    return;
  }

  statusEl.textContent = 'Guardado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';

  // Actualiza la copia en memoria (sin recargar todo) y reconstruye el
  // índice de búsqueda para que refleje lo recién guardado.
  const rows = fe_versionesPorFicha[fe_currentFichaId] || [];
  const idx = rows.findIndex(v => v.id === fe_currentVersionRowId);
  if (idx >= 0) rows[idx] = { ...rows[idx], ...payload };
  buildSearchIndex();

  // El desplegable de versión muestra version_id / version_desc — se
  // refresca por si cambiaron.
  populateVersionSelect(fe_currentFichaId, fe_currentVersionRowId);
}

/* ── Nueva versión (clona la actual como punto de partida) ──────────── */

async function onNewVersion() {
  if (!fe_currentFichaId) return;

  const rows = fe_versionesPorFicha[fe_currentFichaId] || [];
  const actual = rows.find(v => v.id === fe_currentVersionRowId);
  if (!actual) return;

  const [maj, min] = parseVersionKey(actual.version_key);
  const sugerida = `v${maj}.${min + 1}`;
  const nuevaKey = (prompt('Clave de la nueva versión (ej. v1.11):', sugerida) || '').trim().toLowerCase();

  if (!nuevaKey) return;
  if (!/^v\d+\.\d+$/.test(nuevaKey)) {
    alert('Formato inválido. Tiene que ser "v" + número + "." + número, ej. v1.11');
    return;
  }
  if (rows.some(v => v.version_key === nuevaKey)) {
    alert('Ya existe una versión con esa clave.');
    return;
  }

  // Valida el JSON de la pestaña actual antes de clonar, para no arrastrar
  // un error de tipeo a la versión nueva.
  const { ok, valores } = validarTabs();
  if (!ok) {
    alert('Hay JSON inválido en alguna pestaña — corregilo antes de crear una versión nueva.');
    return;
  }

  const payload = {
    ficha_id: fe_currentFichaId,
    version_key: nuevaKey,
    version_id: nuevaKey.toUpperCase(),
    version_desc: '',
    nombre: document.getElementById('fe-nombre').value.trim() || actual.nombre,
    badge: document.getElementById('fe-badge').value.trim() || actual.badge,
    version: nuevaKey.slice(1),
    fecha: actual.fecha,
    autor: actual.autor,
    lider_producto: actual.lider_producto,
    colaborador: actual.colaborador,
    ...valores
  };

  const { data, error } = await window.supabaseClient
    .from('ficha_versiones')
    .insert(payload)
    .select('*')
    .single();

  if (error || !data) {
    alert('No se pudo crear la nueva versión.');
    console.error('[fichas-editor.js] error creando version', error);
    return;
  }

  rows.push(data);
  rows.sort(compareVersionKeysDesc);
  buildSearchIndex();
  populateVersionSelect(fe_currentFichaId, data.id);

  const statusEl = document.getElementById('fe-save-status');
  statusEl.textContent = 'Versión nueva creada a partir de la anterior — revisá el contenido y guardá.';
  statusEl.className = 'admin-row-status admin-row-status--ok';
}

/* ── Nueva ficha ─────────────────────────────────────────────────────── */

async function onNewFicha() {
  const statusEl = document.getElementById('fe-new-ficha-status');
  const idInput = document.getElementById('fe-new-ficha-id');
  const nombreInput = document.getElementById('fe-new-ficha-nombre');
  const badgeInput = document.getElementById('fe-new-ficha-badge');
  const seccionSelect = document.getElementById('fe-new-ficha-seccion');

  const id = idInput.value.trim().toLowerCase();
  const nombre = nombreInput.value.trim();
  const badge = badgeInput.value.trim() || null;
  const seccionId = seccionSelect.value;

  if (!/^[a-z0-9-]+$/.test(id)) {
    statusEl.textContent = 'El id tiene que ser minúsculas, números y guiones';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }
  if (!nombre || !seccionId) {
    statusEl.textContent = 'Faltan campos obligatorios';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  statusEl.textContent = 'Creando…';
  statusEl.className = 'admin-row-status';

  const { error: fichaError } = await window.supabaseClient
    .from('fichas')
    .insert({ id, seccion_id: seccionId, nombre, badge });

  if (fichaError) {
    statusEl.textContent = fichaError.code === '23505' ? 'Ya existe una ficha con ese id' : 'Error al crear la ficha';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[fichas-editor.js] error creando ficha', fichaError);
    return;
  }

  const vacio = {};
  const { error: versionError } = await window.supabaseClient
    .from('ficha_versiones')
    .insert({
      ficha_id: id,
      version_key: 'v1.0',
      version_id: 'V1.0',
      version_desc: 'Versión inicial',
      nombre,
      badge,
      version: '1.0',
      general: vacio, equipamiento: vacio, precios: vacio, proceso: vacio,
      faq: vacio, competencia: vacio, areas: vacio
    });

  if (versionError) {
    statusEl.textContent = 'Ficha creada, pero falló la versión inicial';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[fichas-editor.js] error creando version inicial', versionError);
    return;
  }

  statusEl.textContent = 'Creada ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  idInput.value = '';
  nombreInput.value = '';
  badgeInput.value = '';

  await loadFichas();
  document.getElementById('fe-select-ficha').value = id;
  fe_currentFichaId = id;
  populateVersionSelect(id);
}

/* ── Buscador (cruza todas las fichas/versiones/pestañas) ───────────── */

function buildSearchIndex() {
  fe_searchIndex = [];

  Object.keys(fe_versionesPorFicha).forEach(fichaId => {
    const ficha = fe_fichasCache.find(f => f.id === fichaId);
    const fichaNombre = ficha ? ficha.nombre : fichaId;

    fe_versionesPorFicha[fichaId].forEach(row => {
      const identTexto = FE_IDENT_FIELDS.map(f => row[f]).filter(Boolean).join('\n');
      fe_searchIndex.push({
        fichaId, versionRowId: row.id, tab: 'identificación',
        label: `${fichaNombre} · ${row.version_id || row.version_key} · Identificación`,
        texto: identTexto
      });

      FE_TABS.forEach(tab => {
        const texto = JSON.stringify(row[tab] ?? {}, null, 2);
        fe_searchIndex.push({
          fichaId, versionRowId: row.id, tab,
          label: `${fichaNombre} · ${row.version_id || row.version_key} · ${tab}`,
          texto
        });
      });
    });
  });
}

function onSearchInput(ev) {
  clearTimeout(fe_searchDebounce);
  const query = ev.target.value.trim();
  fe_searchDebounce = setTimeout(() => doSearch(query), 150);
}

function doSearch(query) {
  const resultsEl = document.getElementById('fe-search-results');

  if (query.length < 2) {
    resultsEl.style.display = 'none';
    resultsEl.innerHTML = '';
    return;
  }

  const q = query.toLowerCase();
  const resultados = [];

  for (const entry of fe_searchIndex) {
    const idx = entry.texto.toLowerCase().indexOf(q);
    if (idx === -1) continue;
    resultados.push({ ...entry, matchIndex: idx, queryLen: query.length });
    if (resultados.length >= 30) break;
  }

  if (resultados.length === 0) {
    resultsEl.style.display = '';
    resultsEl.innerHTML = '<p class="fe-search-empty">Sin resultados.</p>';
    return;
  }

  resultsEl.style.display = '';
  resultsEl.innerHTML = resultados.map((r, i) => `
    <button type="button" class="fe-search-result" data-result-index="${i}">
      <div class="fe-search-result__path">${escapeHtml(r.label)}</div>
      <div class="fe-search-result__snippet">${snippetHtml(r.texto, r.matchIndex, query.length)}</div>
    </button>
  `).join('');

  resultsEl.querySelectorAll('.fe-search-result').forEach(btn => {
    const i = parseInt(btn.dataset.resultIndex, 10);
    btn.addEventListener('click', () => selectSearchResult(resultados[i]));
  });
}

function snippetHtml(texto, matchIndex, len) {
  const contexto = 50;
  const inicio = Math.max(0, matchIndex - contexto);
  const fin = Math.min(texto.length, matchIndex + len + contexto);
  const antes = escapeHtml(texto.slice(inicio, matchIndex));
  const match = escapeHtml(texto.slice(matchIndex, matchIndex + len));
  const despues = escapeHtml(texto.slice(matchIndex + len, fin));
  const prefijo = inicio > 0 ? '…' : '';
  const sufijo = fin < texto.length ? '…' : '';
  return `${prefijo}${antes}<mark>${match}</mark>${despues}${sufijo}`;
}

function selectSearchResult(r) {
  document.getElementById('fe-select-ficha').value = r.fichaId;
  fe_currentFichaId = r.fichaId;
  populateVersionSelect(r.fichaId, r.versionRowId);

  document.getElementById('fe-search-results').style.display = 'none';

  // Después de cargar el formulario, lleva el foco al campo/pestaña que
  // matcheó y selecciona el texto encontrado (mismo formato JSON que se
  // usó para indexar, así el offset coincide con lo que se ve).
  requestAnimationFrame(() => {
    if (r.tab === 'identificación') {
      const query = r.texto.slice(r.matchIndex).toLowerCase();
      for (const f of FE_IDENT_FIELDS) {
        const el = document.getElementById(FE_IDENT_FIELD_IDS[f]);
        if (el && el.value && r.texto.includes(el.value) && el.value.toLowerCase().includes(query.slice(0, 5))) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.focus();
          return;
        }
      }
      document.getElementById('fe-nombre').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const textarea = document.querySelector(`.fe-tab-textarea[data-tab="${r.tab}"]`);
    if (!textarea) return;
    textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
    textarea.focus();
    textarea.setSelectionRange(r.matchIndex, r.matchIndex + (r.queryLen || 1));
  });
}

/* ── Utilidades ──────────────────────────────────────────────────────── */

function truncar(texto, maxLen) {
  if (!texto || texto.length <= maxLen) return texto;
  return texto.slice(0, maxLen) + '…';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

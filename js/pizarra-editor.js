/**
 * pizarra-editor.js — Editor de la pizarra institucional (Fase 4, primera
 * versión): alta/edición/borrado de novedades, con categoría (del
 * catálogo) y áreas destinatarias, más gestión de categorías (superadmin).
 *
 * Acceso: fn_tiene_permiso('pizarra','editar') (true también para
 * superadmin activo) — no es un mosaico, no depende de page-guard.js.
 * La seguridad real la sigue dando RLS (schema.sql / migracion_2 /
 * migracion_3); este script sólo decide qué mostrar y arma los pedidos.
 *
 * Requiere supabase/rpc_pizarra_editor.sql (fn_admin_novedades).
 */

let pe_areasCache = [];
let pe_categoriasCache = [];
let pe_novedadesCache = [];
let pe_isSuperadmin = false;
let pe_currentUserId = null;
// sp:auth-ready puede disparar más de una vez en la misma carga de página
// (login, y cada refresco automático del token de sesión) — este flag
// evita enganchar los listeners de los formularios (elementos fijos del
// HTML, no se regeneran) más de una vez. Las recargas de datos sí son
// seguras de repetir.
let pe_wired = false;
// Umbral (en caracteres) a partir del cual el cuerpo de una novedad se
// recorta a 3 líneas con un botón "Ver más" en el listado del editor —
// ver renderPost() / pe-post__excerpt--clamped en pizarra-editor.css.
const PE_EXCERPT_CLAMP_THRESHOLD = 220;

document.addEventListener('sp:auth-ready', handleAuthReady);

async function handleAuthReady(e) {
  const gate = document.getElementById('pe-gate');
  const content = document.getElementById('pe-content');
  if (!gate || !content || !window.supabaseClient) return;

  if (e.detail.error) {
    showGate('No se pudo verificar tu sesión. Probá recargar la página.');
    console.error('[pizarra-editor.js] sp:auth-ready llegó con error', e.detail.error);
    return;
  }

  const session = e.detail.session;

  if (!session) {
    showGate('Iniciá sesión para acceder al editor de la pizarra.');
    return;
  }

  // Ver nota equivalente en admin.js: cualquier falla de red de acá para
  // abajo (no sólo un {error} de supabase-js, alguna vez es una excepción
  // real) dejaba la pantalla sin gate y sin contenido, colgada en
  // "Cargando…", hasta recargar la página.
  try {
    const { data: perfil, error } = await window.supabaseClient
      .from('perfiles')
      .select('activo, es_superadmin')
      .eq('id', session.user.id)
      .single();

    if (error || !perfil) {
      showGate('No se pudo verificar tu acceso. Probá recargar la página.');
      console.error('[pizarra-editor.js] error cargando perfil', error);
      return;
    }

    if (!perfil.activo) {
      showGate('Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.');
      return;
    }

    let puedeEditar = perfil.es_superadmin;
    if (!puedeEditar) {
      const { data: tienePermiso, error: permisoError } = await window.supabaseClient
        .rpc('fn_tiene_permiso', { p_seccion_id: 'pizarra', p_nivel: 'editar' });
      if (permisoError) {
        showGate('No se pudo verificar tu permiso. Probá recargar la página.');
        console.error('[pizarra-editor.js] error chequeando permiso', permisoError);
        return;
      }
      puedeEditar = !!tienePermiso;
    }

    if (!puedeEditar) {
      showGate('No tenés permiso para editar la pizarra. Pedile a un administrador que te lo habilite.');
      return;
    }

    pe_isSuperadmin = perfil.es_superadmin;
    pe_currentUserId = session.user.id;

    gate.style.display = 'none';
    content.style.display = '';

    if (pe_isSuperadmin) {
      document.getElementById('pe-categorias-section').style.display = '';
    }

    if (!pe_wired) {
      pe_wired = true;
      wireForm();
      if (pe_isSuperadmin) {
        document.getElementById('pe-cat-form').addEventListener('submit', onAddCategoria);
      }
    }

    await loadAreas();
    await loadCategorias();
    await loadList();
    if (pe_isSuperadmin) await loadCategoriasList();
  } catch (err) {
    showGate('No se pudo conectar. Probá recargar la página.');
    console.error('[pizarra-editor.js] error inesperado', err);
  }
}

function showGate(mensaje) {
  const gate = document.getElementById('pe-gate');
  const content = document.getElementById('pe-content');
  content.style.display = 'none';
  gate.style.display = '';
  gate.innerHTML = `
    <p>${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
  `;
}

/* ── Áreas ───────────────────────────────────────────────────────── */

async function loadAreas() {
  const { data, error } = await window.supabaseClient
    .from('areas')
    .select('id, nombre')
    .order('nombre');

  if (error) {
    console.error('[pizarra-editor.js] error cargando areas', error);
    pe_areasCache = [];
    return;
  }
  pe_areasCache = data || [];

  const grid = document.getElementById('pe-areas-grid');
  grid.innerHTML = pe_areasCache.map(a => `
    <label class="pe-area-check">
      <input type="checkbox" class="pe-area-checkbox" value="${escapeAttr(a.id)}">
      ${escapeHtml(a.nombre)}
    </label>
  `).join('');
}

/* ── Categorías (select del formulario + gestión superadmin) ───────── */

async function loadCategorias() {
  const { data, error } = await window.supabaseClient
    .from('categorias_novedades')
    .select('id, nombre, orden')
    .order('orden');

  if (error) {
    console.error('[pizarra-editor.js] error cargando categorias', error);
    pe_categoriasCache = [];
    return;
  }
  pe_categoriasCache = data || [];

  const select = document.getElementById('pe-categoria');
  select.innerHTML = pe_categoriasCache
    .map(c => `<option value="${escapeAttr(c.id)}">${escapeHtml(c.nombre)}</option>`)
    .join('');
}

async function loadCategoriasList() {
  const wrap = document.getElementById('pe-categorias-wrap');
  wrap.innerHTML = pe_categoriasCache.length
    ? pe_categoriasCache.map(renderCategoriaRow).join('')
    : '<p class="admin-empty">Todavía no hay categorías.</p>';

  // Los botones de cada fila sí hay que re-engancharlos en cada refresco:
  // innerHTML los recrea de cero. El submit del formulario "Agregar
  // categoría" es distinto (elemento fijo) y se engancha una sola vez,
  // ver el bloque pe_wired en handleAuthReady.
  wrap.querySelectorAll('.pe-cat-row').forEach(row => {
    const id = row.dataset.catId;
    row.querySelector('.pe-cat-save').addEventListener('click', () => saveCategoria(row, id));
    row.querySelector('.pe-cat-delete').addEventListener('click', () => deleteCategoria(id));
  });
}

function renderCategoriaRow(c) {
  return `
    <div class="pe-cat-row" data-cat-id="${escapeAttr(c.id)}">
      <span class="pe-cat-row__id">${escapeHtml(c.id)}</span>
      <input type="text" class="admin-input pe-cat-nombre" value="${escapeAttr(c.nombre)}">
      <input type="number" class="admin-input admin-input--orden pe-cat-orden" value="${escapeAttr(c.orden)}">
      <button type="button" class="btn btn--secondary pe-cat-save">Guardar</button>
      <button type="button" class="btn btn--secondary pe-cat-delete">Borrar</button>
      <span class="admin-row-status"></span>
    </div>
  `;
}

async function saveCategoria(row, id) {
  const statusEl = row.querySelector('.admin-row-status');
  const nombre = row.querySelector('.pe-cat-nombre').value.trim();
  const orden = parseInt(row.querySelector('.pe-cat-orden').value, 10) || 0;

  if (!nombre) {
    statusEl.textContent = 'Falta el nombre';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const { error } = await window.supabaseClient
    .from('categorias_novedades')
    .update({ nombre, orden })
    .eq('id', id);

  if (error) {
    statusEl.textContent = 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[pizarra-editor.js] error guardando categoria', error);
    return;
  }

  statusEl.textContent = 'Guardado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  await loadCategorias();
}

async function deleteCategoria(id) {
  if (!confirm('¿Borrar esta categoría? Sólo se puede si ninguna publicación la está usando.')) return;

  const { error } = await window.supabaseClient
    .from('categorias_novedades')
    .delete()
    .eq('id', id);

  if (error) {
    alert('No se pudo borrar: probablemente hay publicaciones usando esta categoría.');
    console.error('[pizarra-editor.js] error borrando categoria', error);
    return;
  }

  await loadCategorias();
  await loadCategoriasList();
}

async function onAddCategoria(ev) {
  ev.preventDefault();
  const nombreInput = document.getElementById('pe-cat-nombre');
  const ordenInput = document.getElementById('pe-cat-orden');
  const statusEl = document.getElementById('pe-cat-status');

  const nombre = nombreInput.value.trim();
  const orden = parseInt(ordenInput.value, 10) || 0;
  const id = slugify(nombre);

  if (!nombre || !id) {
    statusEl.textContent = 'Falta el nombre';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const { error } = await window.supabaseClient
    .from('categorias_novedades')
    .insert({ id, nombre, orden });

  if (error) {
    statusEl.textContent = error.code === '23505' ? 'Ya existe una categoría así' : 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[pizarra-editor.js] error creando categoria', error);
    return;
  }

  statusEl.textContent = 'Agregada ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  nombreInput.value = '';
  ordenInput.value = '0';

  await loadCategorias();
  await loadCategoriasList();
}

/* ── Formulario de alta/edición de novedad ──────────────────────────── */

function wireForm() {
  document.getElementById('pe-form').addEventListener('submit', onSubmitForm);
  document.getElementById('pe-cancel-btn').addEventListener('click', resetForm);
  document.getElementById('pe-todas-areas').addEventListener('change', (e) => {
    document.getElementById('pe-areas-grid').style.display = e.target.checked ? 'none' : '';
  });
}

function resetForm() {
  document.getElementById('pe-form').reset();
  document.getElementById('pe-editing-id').value = '';
  document.getElementById('pe-areas-grid').style.display = 'none';
  document.querySelectorAll('.pe-area-checkbox').forEach(cb => { cb.checked = false; });
  document.getElementById('pe-form-title').textContent = 'Nueva publicación';
  document.getElementById('pe-submit-btn').textContent = 'Publicar';
  document.getElementById('pe-cancel-btn').style.display = 'none';
  document.getElementById('pe-form-status').textContent = '';
}

function editNovedad(id) {
  const n = pe_novedadesCache.find(x => x.id === id);
  if (!n) return;

  document.getElementById('pe-editing-id').value = n.id;
  document.getElementById('pe-titulo').value = n.titulo;
  document.getElementById('pe-cuerpo').value = n.cuerpo;
  document.getElementById('pe-categoria').value = n.categoria_id;
  document.getElementById('pe-vigencia').value = n.vigente_hasta ? n.vigente_hasta.slice(0, 10) : '';

  const areasIds = n.areas_ids || [];
  const todasCheckbox = document.getElementById('pe-todas-areas');
  const grid = document.getElementById('pe-areas-grid');
  todasCheckbox.checked = areasIds.length === 0;
  grid.style.display = areasIds.length === 0 ? 'none' : '';
  document.querySelectorAll('.pe-area-checkbox').forEach(cb => {
    cb.checked = areasIds.includes(cb.value);
  });

  document.getElementById('pe-form-title').textContent = 'Editar publicación';
  document.getElementById('pe-submit-btn').textContent = 'Guardar cambios';
  document.getElementById('pe-cancel-btn').style.display = '';
  document.getElementById('pe-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function onSubmitForm(ev) {
  ev.preventDefault();

  const statusEl = document.getElementById('pe-form-status');
  const submitBtn = document.getElementById('pe-submit-btn');

  const editingId = document.getElementById('pe-editing-id').value || null;
  const titulo = document.getElementById('pe-titulo').value.trim();
  const cuerpo = document.getElementById('pe-cuerpo').value.trim();
  const categoriaId = document.getElementById('pe-categoria').value;
  const vigenciaRaw = document.getElementById('pe-vigencia').value;
  const vigenteHasta = vigenciaRaw ? `${vigenciaRaw}T23:59:59` : null;

  const todasAreas = document.getElementById('pe-todas-areas').checked;
  const areasSeleccionadas = todasAreas
    ? []
    : Array.from(document.querySelectorAll('.pe-area-checkbox:checked')).map(cb => cb.value);

  if (!titulo || !cuerpo || !categoriaId) {
    statusEl.textContent = 'Faltan campos obligatorios';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  let novedadId = editingId;

  if (editingId) {
    const { error } = await window.supabaseClient
      .from('novedades')
      .update({ titulo, cuerpo, categoria_id: categoriaId, vigente_hasta: vigenteHasta })
      .eq('id', editingId);

    if (error) {
      submitBtn.disabled = false;
      statusEl.textContent = 'Error al guardar';
      statusEl.className = 'admin-row-status admin-row-status--error';
      console.error('[pizarra-editor.js] error actualizando novedad', error);
      return;
    }

    // Reconcilia áreas: borra lo que había y carga de nuevo la selección
    // actual (más simple y confiable que comparar diffs).
    await window.supabaseClient.from('novedades_areas').delete().eq('novedad_id', editingId);
  } else {
    const { data, error } = await window.supabaseClient
      .from('novedades')
      .insert({ titulo, cuerpo, categoria_id: categoriaId, autor_id: pe_currentUserId, vigente_hasta: vigenteHasta })
      .select('id')
      .single();

    if (error || !data) {
      submitBtn.disabled = false;
      statusEl.textContent = 'Error al publicar';
      statusEl.className = 'admin-row-status admin-row-status--error';
      console.error('[pizarra-editor.js] error creando novedad', error);
      return;
    }
    novedadId = data.id;
  }

  if (areasSeleccionadas.length > 0) {
    const rows = areasSeleccionadas.map(areaId => ({ novedad_id: novedadId, area_id: areaId }));
    const { error: areasError } = await window.supabaseClient.from('novedades_areas').insert(rows);
    if (areasError) {
      console.error('[pizarra-editor.js] error guardando areas de la novedad', areasError);
      // La novedad ya se guardó; se avisa pero no se corta el flujo.
      statusEl.textContent = 'Guardado, pero falló el filtro por área';
      statusEl.className = 'admin-row-status admin-row-status--error';
      submitBtn.disabled = false;
      await loadList();
      return;
    }
  }

  submitBtn.disabled = false;
  statusEl.textContent = editingId ? 'Guardado ✓' : 'Publicado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  resetForm();
  await loadList();
}

/* ── Listado de publicaciones ───────────────────────────────────────── */

async function loadList() {
  const wrap = document.getElementById('pe-list-wrap');

  const { data, error } = await window.supabaseClient.rpc('fn_admin_novedades');

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar las publicaciones.</p>';
    console.error('[pizarra-editor.js] error cargando novedades', error);
    return;
  }

  pe_novedadesCache = data || [];

  if (pe_novedadesCache.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Todavía no hay publicaciones.</p>';
    return;
  }

  wrap.innerHTML = pe_novedadesCache.map(renderPost).join('');

  wrap.querySelectorAll('.pe-post').forEach(el => {
    const id = el.dataset.novedadId;
    el.querySelector('.pe-post-edit').addEventListener('click', () => editNovedad(id));
    el.querySelector('.pe-post-delete').addEventListener('click', () => deleteNovedad(id));

    const toggleBtn = el.querySelector('.pe-post__toggle');
    if (toggleBtn) {
      const excerpt = el.querySelector('.pe-post__excerpt');
      toggleBtn.addEventListener('click', () => {
        const expandido = excerpt.classList.toggle('pe-post__excerpt--clamped') === false;
        toggleBtn.textContent = expandido ? 'Ver menos' : 'Ver más';
      });
    }
  });
}

function renderPost(n) {
  const areasLabel = (n.areas_ids && n.areas_ids.length > 0)
    ? n.areas_ids.map(id => {
        const a = pe_areasCache.find(a => a.id === id);
        return escapeHtml(a ? a.nombre : id);
      }).join(', ')
    : 'Todas las áreas';

  const vigenciaLabel = n.vigente_hasta
    ? `vence ${formatFecha(n.vigente_hasta)}`
    : 'sin vencimiento';

  return `
    <article class="pe-post" data-novedad-id="${escapeAttr(n.id)}">
      <div class="pe-post__header">
        <span class="pe-post__title">${escapeHtml(n.titulo)}</span>
        <div class="pe-post__actions">
          <button type="button" class="btn btn--secondary pe-post-edit">Editar</button>
          <button type="button" class="btn btn--secondary pe-post-delete">Borrar</button>
        </div>
      </div>
      <div class="pe-post__meta">
        <span class="tag">${escapeHtml(n.categoria_nombre || '—')}</span>
        <span>${escapeHtml(formatFecha(n.publicado_en))}</span>
        <span>·</span>
        <span>${escapeHtml(n.autor_nombre || '—')}</span>
        <span>·</span>
        <span>${escapeHtml(areasLabel)}</span>
        <span>·</span>
        <span>${escapeHtml(vigenciaLabel)}</span>
      </div>
      <p class="pe-post__excerpt${(n.cuerpo || '').length > PE_EXCERPT_CLAMP_THRESHOLD ? ' pe-post__excerpt--clamped' : ''}">${escapeHtml(n.cuerpo)}</p>
      ${(n.cuerpo || '').length > PE_EXCERPT_CLAMP_THRESHOLD ? '<button type="button" class="pe-post__toggle">Ver más</button>' : ''}
    </article>
  `;
}

async function deleteNovedad(id) {
  if (!confirm('¿Borrar esta publicación? No se puede deshacer.')) return;

  const { error } = await window.supabaseClient.from('novedades').delete().eq('id', id);

  if (error) {
    alert('No se pudo borrar la publicación.');
    console.error('[pizarra-editor.js] error borrando novedad', error);
    return;
  }

  await loadList();
}

/* ── Utilidades ──────────────────────────────────────────────────────── */

function slugify(str) {
  return str
    .toString()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function formatFecha(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return iso;
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

/**
 * admin.js — Panel de superadministrador (Fase 5), primera versión.
 *
 * Alta/edición de usuarios (área, nivel, legajo, activo, superadmin)
 * desde la UI en vez de a mano por SQL en Supabase Studio. La seguridad
 * real la sigue dando RLS (perfiles: "superadmin ve/edita todos", ver
 * schema.sql) — este script sólo decide qué mostrar en el navegador.
 *
 * Requiere sesión + perfil con es_superadmin=true y activo=true. No usa
 * page-guard.js (ese chequea permiso por sección/área, esto es un caso
 * aparte: acceso total o nada).
 */

let sp_areasCache = [];

document.addEventListener('sp:auth-ready', handleAuthReady);

async function handleAuthReady(e) {
  const gate = document.getElementById('admin-gate');
  const content = document.getElementById('admin-content');
  if (!gate || !content || !window.supabaseClient) return;

  const session = e.detail.session;

  if (!session) {
    showGate('Iniciá sesión para acceder al panel de administración.');
    return;
  }

  const { data: perfil, error } = await window.supabaseClient
    .from('perfiles')
    .select('activo, es_superadmin')
    .eq('id', session.user.id)
    .single();

  if (error || !perfil) {
    showGate('No se pudo verificar tu acceso. Probá recargar la página.');
    console.error('[admin.js] error cargando perfil', error);
    return;
  }

  if (!perfil.activo || !perfil.es_superadmin) {
    showGate('Este panel es sólo para superadministradores.');
    return;
  }

  gate.style.display = 'none';
  content.style.display = '';

  await loadAreas();
  await loadUsers();
}

function showGate(mensaje) {
  const gate = document.getElementById('admin-gate');
  const content = document.getElementById('admin-content');
  content.style.display = 'none';
  gate.style.display = '';
  gate.innerHTML = `
    <p>${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
  `;
}

async function loadAreas() {
  const { data, error } = await window.supabaseClient
    .from('areas')
    .select('id, nombre')
    .order('nombre');

  if (error) {
    console.error('[admin.js] error cargando areas', error);
    sp_areasCache = [];
    return;
  }
  sp_areasCache = data || [];
}

async function loadUsers() {
  const wrap = document.getElementById('admin-users-table-wrap');

  const { data, error } = await window.supabaseClient
    .from('perfiles')
    .select('id, nombre, apellido, email, legajo, foto_url, area_id, nivel, es_superadmin, activo, creado_en')
    .order('activo', { ascending: true })
    .order('creado_en', { ascending: true });

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar los usuarios. Probá recargar la página.</p>';
    console.error('[admin.js] error cargando usuarios', error);
    return;
  }

  if (!data || data.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Todavía no hay usuarios que hayan iniciado sesión.</p>';
    return;
  }

  wrap.innerHTML = renderTable(data);

  const rows = wrap.querySelectorAll('tbody tr');
  rows.forEach((tr, i) => wireRow(tr, data[i].id));
}

function renderTable(users) {
  const rows = users.map(renderRow).join('');
  return `
    <table class="admin-table">
      <thead>
        <tr>
          <th>Usuario</th>
          <th>Legajo</th>
          <th>Área</th>
          <th>Nivel</th>
          <th>Activo</th>
          <th>Superadmin</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderRow(u) {
  const nombreCompleto = [u.nombre, u.apellido].filter(Boolean).join(' ') || u.email || '(sin nombre)';

  const avatar = u.foto_url
    ? `<img class="admin-avatar" src="${escapeAttr(u.foto_url)}" alt="" referrerpolicy="no-referrer">`
    : `<span class="admin-avatar admin-avatar--placeholder">${escapeHtml(iniciales(nombreCompleto))}</span>`;

  const areaOptions = ['<option value="">— sin área —</option>']
    .concat(sp_areasCache.map(a =>
      `<option value="${escapeAttr(a.id)}"${a.id === u.area_id ? ' selected' : ''}>${escapeHtml(a.nombre)}</option>`
    ))
    .join('');

  const statusBadge = u.activo
    ? '<span class="status-badge status-badge--ok">Activo</span>'
    : '<span class="status-badge status-badge--prog">Pendiente</span>';

  return `
    <tr>
      <td>
        <div class="admin-user-cell">
          ${avatar}
          <div>
            <div class="admin-name-inputs">
              <input type="text" class="admin-input admin-input--nombre" value="${escapeAttr(u.nombre || '')}" placeholder="Nombre">
              <input type="text" class="admin-input admin-input--apellido" value="${escapeAttr(u.apellido || '')}" placeholder="Apellido">
            </div>
            <div class="admin-user-email">${escapeHtml(u.email || '')}</div>
          </div>
          ${statusBadge}
        </div>
      </td>
      <td><input type="text" class="admin-input admin-input--legajo" value="${escapeAttr(u.legajo || '')}" placeholder="Legajo"></td>
      <td><select class="admin-select admin-select--area">${areaOptions}</select></td>
      <td>
        <select class="admin-select admin-select--nivel">
          <option value="colaborador"${u.nivel === 'colaborador' ? ' selected' : ''}>Colaborador</option>
          <option value="responsable"${u.nivel === 'responsable' ? ' selected' : ''}>Responsable</option>
        </select>
      </td>
      <td><input type="checkbox" class="admin-checkbox admin-checkbox--activo"${u.activo ? ' checked' : ''}></td>
      <td><input type="checkbox" class="admin-checkbox admin-checkbox--superadmin"${u.es_superadmin ? ' checked' : ''}></td>
      <td>
        <button type="button" class="btn btn--primary admin-row-save">Guardar</button>
        <span class="admin-row-status"></span>
      </td>
    </tr>
  `;
}

function wireRow(tr, userId) {
  const btn = tr.querySelector('.admin-row-save');
  btn.addEventListener('click', () => saveRow(tr, userId));
}

async function saveRow(tr, userId) {
  const statusEl = tr.querySelector('.admin-row-status');
  const btn = tr.querySelector('.admin-row-save');

  const nombre = tr.querySelector('.admin-input--nombre').value.trim() || null;
  const apellido = tr.querySelector('.admin-input--apellido').value.trim() || null;
  const legajo = tr.querySelector('.admin-input--legajo').value.trim() || null;
  const areaId = tr.querySelector('.admin-select--area').value || null;
  const nivel = tr.querySelector('.admin-select--nivel').value;
  const activo = tr.querySelector('.admin-checkbox--activo').checked;
  const esSuperadmin = tr.querySelector('.admin-checkbox--superadmin').checked;

  btn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const { error } = await window.supabaseClient
    .from('perfiles')
    .update({
      nombre,
      apellido,
      legajo,
      area_id: areaId,
      nivel,
      activo,
      es_superadmin: esSuperadmin,
    })
    .eq('id', userId);

  btn.disabled = false;

  if (error) {
    statusEl.textContent = 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[admin.js] error guardando perfil', error);
    return;
  }

  statusEl.textContent = 'Guardado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';

  const badge = tr.querySelector('.status-badge');
  if (badge) {
    badge.className = activo ? 'status-badge status-badge--ok' : 'status-badge status-badge--prog';
    badge.textContent = activo ? 'Activo' : 'Pendiente';
  }
}

function iniciales(nombre) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0].toUpperCase())
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

/* ============================================================
   integracion-ghl-ns.js — Sección "Integración NetSuite ↔ GHL"
   (prueba piloto, Plan de Migración v1.1).

   Carga manual de Contacto/Oportunidad contra Supabase (tablas
   'contacto' y 'oportunidad', ver supabase/migracion_10_integracion_
   ghl_ns.sql). La recepción automática desde NetSuite queda para la
   segunda etapa: acá el contacto ya existe en GHL de antes y se carga
   a mano en la base local.

   Al guardar una Oportunidad (alta o edición) se llama a
   POST /admin/sync-oportunidad/{id} en el servicio FastAPI de la
   integración (ghl-netsuite-api-opportunities — ver SYNC_API_BASE_URL
   más abajo), pasándole el access token del usuario logueado. Ese
   servicio reenvía el token a Supabase (RLS decide si puede leer/editar
   esa fila) y, si todavía no tiene ghl_opportunity_id, la crea en GHL.
   Es idempotente: si ya está sincronizada, no hace nada — por eso es
   seguro llamarlo tanto en alta como en cada edición, y también como
   "reintentar" manual desde la tabla.

   page-guard.js ya resuelve el nivel 'ver' (si no lo tiene, ni carga
   esta página). Acá se chequea además 'editar' para decidir si se
   muestran los formularios de alta/edición o sólo las tablas de
   sólo lectura (pensado para cuando haya áreas con acceso de sólo
   consulta de datos globales).
   ============================================================ */

'use strict';

// Servicio FastAPI de la integración (Etapa 2 — Oportunidad), migrado
// al servidor local (Coolify) siguiendo el mismo esquema de subdominio
// sslip.io que ya usa Supabase. Si en Coolify se termina usando otro
// dominio, actualizar acá.
const SYNC_API_BASE_URL = 'https://ghl-ns-opportunities.200.5.196.50.sslip.io';

let ig_puedeEditar = false;
let ig_contactosCache = [];
let ig_oportunidadesCache = [];

document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session || !window.supabaseClient) return;

  const { data: puedeEditar, error } = await window.supabaseClient
    .rpc('fn_tiene_permiso', { p_seccion_id: 'integracion-ghl-ns', p_nivel: 'editar' });

  if (error) {
    console.error('[integracion-ghl-ns.js] error chequeando permiso de edición', error);
  } else {
    ig_puedeEditar = !!puedeEditar;
  }

  if (ig_puedeEditar) {
    document.getElementById('ig-contacto-form-section').style.display = '';
    document.getElementById('ig-oportunidad-form-section').style.display = '';
  }

  document.getElementById('ig-contacto-form').addEventListener('submit', onSubmitContacto);
  document.getElementById('ig-c-cancel-btn').addEventListener('click', resetContactoForm);
  document.getElementById('ig-oportunidad-form').addEventListener('submit', onSubmitOportunidad);
  document.getElementById('ig-o-cancel-btn').addEventListener('click', resetOportunidadForm);

  await loadContactos();
  await loadOportunidades();
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMonto(n) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function datetimeLocalToIso(value) {
  return value ? `${value}:00` : null;
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  // input datetime-local espera "YYYY-MM-DDTHH:MM", sin segundos ni zona.
  return iso.slice(0, 16);
}

function syncBadge(estado, mensaje) {
  const map = {
    pendiente: ['prog', 'Pendiente'],
    sincronizado: ['ok', 'Sincronizado'],
    error: ['err', 'Error'],
  };
  const [mod, label] = map[estado] || ['rev', estado || '—'];
  const title = mensaje ? ` title="${escapeHtml(mensaje)}"` : '';
  return `<span class="status-badge status-badge--${mod}"${title}>${label}</span>`;
}

function estadoOportunidadBadge(estado) {
  const map = {
    open: ['prog', 'Abierta'],
    won: ['ok', 'Ganada'],
    lost: ['err', 'Perdida'],
  };
  const [mod, label] = map[estado] || ['rev', estado || '—'];
  return `<span class="status-badge status-badge--${mod}">${label}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function nombreContacto(c) {
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
  return nombre || c.ghl_contact_id;
}

/* ── Sincronización con GHL (POST /admin/sync-oportunidad/{id}) ────────── */

async function sincronizarOportunidadConGHL(oportunidadId) {
  const { data: sessionData } = await window.supabaseClient.auth.getSession();
  const token = sessionData?.session?.access_token;

  if (!token) {
    console.error('[integracion-ghl-ns.js] no hay sesión activa para sincronizar con GHL');
    return { ok: false, detail: 'No hay sesión activa.' };
  }

  try {
    const resp = await fetch(`${SYNC_API_BASE_URL}/admin/sync-oportunidad/${oportunidadId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      console.error('[integracion-ghl-ns.js] error sincronizando con GHL', resp.status, body);
      return { ok: false, detail: body.detail || `Error ${resp.status}` };
    }

    return { ok: true, ...body };
  } catch (err) {
    console.error('[integracion-ghl-ns.js] fallo de red sincronizando con GHL', err);
    return { ok: false, detail: 'No se pudo conectar con el servicio de integración.' };
  }
}

async function reintentarSyncOportunidad(id) {
  const wrap = document.getElementById('ig-oportunidad-list-wrap');
  if (wrap) wrap.classList.add('admin-table-wrap--busy');

  const resultado = await sincronizarOportunidadConGHL(id);
  await loadOportunidades();

  if (wrap) wrap.classList.remove('admin-table-wrap--busy');

  if (!resultado.ok) {
    alert(`No se pudo sincronizar con GHL: ${resultado.detail || 'error desconocido'}`);
  }
}


/* ── Resumen ─────────────────────────────────────────────────────────── */

function renderResumen(contactos, oportunidades) {
  const el = document.getElementById('ig-summary');
  if (!el) return;

  const ganadas = oportunidades.filter(o => o.estado === 'won').length;
  const pendientesSync = contactos.filter(c => c.sync_estado === 'pendiente').length
    + oportunidades.filter(o => o.sync_estado === 'pendiente').length;

  const items = [
    [String(contactos.length), 'contactos cargados'],
    [String(oportunidades.length), 'oportunidades cargadas'],
    [String(ganadas), 'oportunidades ganadas'],
    [String(pendientesSync), 'registros pendientes de sincronizar'],
  ];

  el.innerHTML = items.map(([v, l]) => `
    <div class="ig-summary__item">
      <span class="ig-summary__value">${v}</span>
      <span class="ig-summary__label">${l}</span>
    </div>
  `).join('');
}

/* ── Contactos ───────────────────────────────────────────────────────── */

async function loadContactos() {
  const wrap = document.getElementById('ig-contacto-list-wrap');

  const { data, error } = await window.supabaseClient
    .from('contacto')
    .select('*')
    .order('creado_en', { ascending: false });

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar los contactos.</p>';
    console.error('[integracion-ghl-ns.js] error cargando contactos', error);
    return;
  }

  ig_contactosCache = data || [];
  renderContactoSelect(ig_contactosCache);

  if (ig_contactosCache.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Todavía no hay contactos cargados.</p>';
  } else {
    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Contacto</th>
            <th>ID GHL</th>
            <th>ID NetSuite</th>
            <th>Origen</th>
            <th>Creado en GHL</th>
            <th>Creado en NS</th>
            <th>Sincronización</th>
            ${ig_puedeEditar ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${ig_contactosCache.map(c => `
            <tr>
              <td>${escapeHtml(nombreContacto(c))}</td>
              <td>${escapeHtml(c.ghl_contact_id)}</td>
              <td>${escapeHtml(c.ns_customer_id || '—')}</td>
              <td>${escapeHtml(c.origen_lead || '—')}</td>
              <td>${fmtFecha(c.fecha_creacion_ghl)}</td>
              <td>${fmtFecha(c.fecha_creacion_ns)}</td>
              <td>${syncBadge(c.sync_estado, c.sync_mensaje)}</td>
              ${ig_puedeEditar ? `<td class="ig-table-actions">
                <button type="button" class="btn btn--secondary" onclick="editarContacto('${c.id}')">Editar</button>
                <button type="button" class="btn btn--secondary" onclick="borrarContacto('${c.id}')">Borrar</button>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderResumen(ig_contactosCache, ig_oportunidadesCache);
}

function renderContactoSelect(contactos) {
  const select = document.getElementById('ig-o-contacto');
  if (!select) return;
  const seleccionActual = select.value;
  select.innerHTML = '<option value="" disabled selected>Elegir contacto…</option>' +
    contactos.map(c => `<option value="${c.id}">${escapeHtml(nombreContacto(c))} — ${escapeHtml(c.ghl_contact_id)}</option>`).join('');
  if (seleccionActual) select.value = seleccionActual;
}

function editarContacto(id) {
  const c = ig_contactosCache.find(x => x.id === id);
  if (!c) return;

  document.getElementById('ig-c-editing-id').value = c.id;
  document.getElementById('ig-c-ghl-id').value = c.ghl_contact_id || '';
  document.getElementById('ig-c-ns-id').value = c.ns_customer_id || '';
  document.getElementById('ig-c-nombre').value = c.nombre || '';
  document.getElementById('ig-c-apellido').value = c.apellido || '';
  document.getElementById('ig-c-email').value = c.email || '';
  document.getElementById('ig-c-telefono').value = c.telefono || '';
  document.getElementById('ig-c-interesado').value = c.interesado_en || '';
  document.getElementById('ig-c-forma-contacto').value = c.forma_contacto || '';
  document.getElementById('ig-c-origen').value = c.origen_lead || '';
  document.getElementById('ig-c-fecha-creacion-ghl').value = isoToDatetimeLocal(c.fecha_creacion_ghl);
  document.getElementById('ig-c-fecha-creacion-ns').value = isoToDatetimeLocal(c.fecha_creacion_ns);

  document.getElementById('ig-contacto-form-title').textContent = 'Editar contacto';
  document.getElementById('ig-c-submit-btn').textContent = 'Guardar cambios';
  document.getElementById('ig-c-cancel-btn').style.display = '';
  document.getElementById('ig-contacto-form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetContactoForm() {
  document.getElementById('ig-contacto-form').reset();
  document.getElementById('ig-c-editing-id').value = '';
  document.getElementById('ig-contacto-form-title').textContent = 'Nuevo contacto';
  document.getElementById('ig-c-submit-btn').textContent = 'Guardar contacto';
  document.getElementById('ig-c-cancel-btn').style.display = 'none';
  document.getElementById('ig-c-form-status').textContent = '';
  document.getElementById('ig-c-form-status').className = 'admin-row-status';
}

async function borrarContacto(id) {
  const c = ig_contactosCache.find(x => x.id === id);
  const tieneOportunidades = ig_oportunidadesCache.some(o => o.contacto_id === id);
  const advertencia = tieneOportunidades
    ? ' Este contacto tiene oportunidades cargadas: se borran junto con él.'
    : '';

  if (!confirm(`¿Borrar el contacto ${c ? nombreContacto(c) : ''}?${advertencia} No se puede deshacer.`)) return;

  const { error } = await window.supabaseClient.from('contacto').delete().eq('id', id);

  if (error) {
    alert('No se pudo borrar el contacto.');
    console.error('[integracion-ghl-ns.js] error borrando contacto', error);
    return;
  }

  await loadContactos();
  await loadOportunidades();
}

async function onSubmitContacto(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById('ig-c-form-status');
  const submitBtn = document.getElementById('ig-c-submit-btn');

  const editingId = document.getElementById('ig-c-editing-id').value || null;
  const payload = {
    ghl_contact_id: document.getElementById('ig-c-ghl-id').value.trim(),
    ns_customer_id: document.getElementById('ig-c-ns-id').value.trim() || null,
    nombre: document.getElementById('ig-c-nombre').value.trim() || null,
    apellido: document.getElementById('ig-c-apellido').value.trim() || null,
    email: document.getElementById('ig-c-email').value.trim() || null,
    telefono: document.getElementById('ig-c-telefono').value.trim() || null,
    interesado_en: document.getElementById('ig-c-interesado').value.trim() || null,
    forma_contacto: document.getElementById('ig-c-forma-contacto').value.trim() || null,
    origen_lead: document.getElementById('ig-c-origen').value.trim() || null,
    fecha_creacion_ghl: datetimeLocalToIso(document.getElementById('ig-c-fecha-creacion-ghl').value),
    fecha_creacion_ns: datetimeLocalToIso(document.getElementById('ig-c-fecha-creacion-ns').value),
  };

  if (!payload.ghl_contact_id) {
    statusEl.textContent = 'Falta el ID de contacto GHL';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const query = editingId
    ? window.supabaseClient.from('contacto').update(payload).eq('id', editingId)
    : window.supabaseClient.from('contacto').insert(payload);

  const { error } = await query;
  submitBtn.disabled = false;

  if (error) {
    statusEl.textContent = error.code === '23505' ? 'Ya existe un contacto con ese ID de GHL' : 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[integracion-ghl-ns.js] error guardando contacto', error);
    return;
  }

  statusEl.textContent = editingId ? 'Guardado ✓' : 'Creado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  resetContactoForm();
  await loadContactos();
}

/* ── Oportunidades ───────────────────────────────────────────────────── */

async function loadOportunidades() {
  const wrap = document.getElementById('ig-oportunidad-list-wrap');

  const { data, error } = await window.supabaseClient
    .from('oportunidad')
    .select('*, contacto:contacto_id (nombre, apellido, ghl_contact_id)')
    .order('creado_en', { ascending: false });

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar las oportunidades.</p>';
    console.error('[integracion-ghl-ns.js] error cargando oportunidades', error);
    return;
  }

  ig_oportunidadesCache = data || [];

  if (ig_oportunidadesCache.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">Todavía no hay oportunidades cargadas.</p>';
  } else {
    wrap.innerHTML = `
      <table class="admin-table">
        <thead>
          <tr>
            <th>Contacto</th>
            <th>Título</th>
            <th>Unidad comercial</th>
            <th>Estado</th>
            <th>Monto</th>
            <th>Fecha de cierre</th>
            <th>Sincronización</th>
            ${ig_puedeEditar ? '<th></th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${ig_oportunidadesCache.map(o => `
            <tr>
              <td>${escapeHtml(o.contacto ? nombreContacto(o.contacto) : '—')}</td>
              <td>${escapeHtml(o.titulo || '—')}</td>
              <td>${escapeHtml(o.unidad_comercial || '—')}</td>
              <td>${estadoOportunidadBadge(o.estado)}</td>
              <td>${fmtMonto(o.monto)}</td>
              <td>${fmtFecha(o.fecha_cierre)}</td>
              <td>${syncBadge(o.sync_estado, o.sync_mensaje)}</td>
              ${ig_puedeEditar ? `<td class="ig-table-actions">
                <button type="button" class="btn btn--secondary" onclick="editarOportunidad('${o.id}')">Editar</button>
                ${o.sync_estado !== 'sincronizado' ? `<button type="button" class="btn btn--secondary" onclick="reintentarSyncOportunidad('${o.id}')">${o.sync_estado === 'error' ? 'Reintentar' : 'Sincronizar'}</button>` : ''}
                <button type="button" class="btn btn--secondary" onclick="borrarOportunidad('${o.id}')">Borrar</button>
              </td>` : ''}
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  renderResumen(ig_contactosCache, ig_oportunidadesCache);
}

function editarOportunidad(id) {
  const o = ig_oportunidadesCache.find(x => x.id === id);
  if (!o) return;

  document.getElementById('ig-o-editing-id').value = o.id;
  document.getElementById('ig-o-contacto').value = o.contacto_id;
  document.getElementById('ig-o-ns-id').value = o.ns_opportunity_id || '';
  document.getElementById('ig-o-ghl-id').value = o.ghl_opportunity_id || '';
  document.getElementById('ig-o-titulo').value = o.titulo || '';
  document.getElementById('ig-o-unidad').value = o.unidad_comercial || '';
  document.getElementById('ig-o-estado').value = o.estado || 'open';
  document.getElementById('ig-o-monto').value = o.monto ?? '';
  document.getElementById('ig-o-fecha-creacion-ns').value = isoToDatetimeLocal(o.fecha_creacion_ns);
  document.getElementById('ig-o-fecha-cierre').value = isoToDatetimeLocal(o.fecha_cierre);

  document.getElementById('ig-oportunidad-form-title').textContent = 'Editar oportunidad';
  document.getElementById('ig-o-submit-btn').textContent = 'Guardar cambios';
  document.getElementById('ig-o-cancel-btn').style.display = '';
  document.getElementById('ig-oportunidad-form-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetOportunidadForm() {
  document.getElementById('ig-oportunidad-form').reset();
  document.getElementById('ig-o-editing-id').value = '';
  document.getElementById('ig-oportunidad-form-title').textContent = 'Nueva oportunidad';
  document.getElementById('ig-o-submit-btn').textContent = 'Guardar oportunidad';
  document.getElementById('ig-o-cancel-btn').style.display = 'none';
  document.getElementById('ig-o-form-status').textContent = '';
  document.getElementById('ig-o-form-status').className = 'admin-row-status';
}

async function borrarOportunidad(id) {
  const o = ig_oportunidadesCache.find(x => x.id === id);
  const advertencia = o?.ghl_opportunity_id
    ? ' Ya está sincronizada con GHL — esto no la borra allá, sólo acá.'
    : '';

  if (!confirm(`¿Borrar esta oportunidad?${advertencia} No se puede deshacer.`)) return;

  const { error } = await window.supabaseClient.from('oportunidad').delete().eq('id', id);

  if (error) {
    alert('No se pudo borrar la oportunidad.');
    console.error('[integracion-ghl-ns.js] error borrando oportunidad', error);
    return;
  }

  await loadOportunidades();
}

async function onSubmitOportunidad(ev) {
  ev.preventDefault();
  const statusEl = document.getElementById('ig-o-form-status');
  const submitBtn = document.getElementById('ig-o-submit-btn');

  const editingId = document.getElementById('ig-o-editing-id').value || null;
  const contactoId = document.getElementById('ig-o-contacto').value;

  if (!contactoId) {
    statusEl.textContent = 'Elegí un contacto';
    statusEl.className = 'admin-row-status admin-row-status--error';
    return;
  }

  const montoRaw = document.getElementById('ig-o-monto').value;

  const payload = {
    contacto_id: contactoId,
    ns_opportunity_id: document.getElementById('ig-o-ns-id').value.trim() || null,
    ghl_opportunity_id: document.getElementById('ig-o-ghl-id').value.trim() || null,
    titulo: document.getElementById('ig-o-titulo').value.trim() || null,
    unidad_comercial: document.getElementById('ig-o-unidad').value.trim() || null,
    estado: document.getElementById('ig-o-estado').value,
    monto: montoRaw ? Number(montoRaw) : null,
    fecha_creacion_ns: datetimeLocalToIso(document.getElementById('ig-o-fecha-creacion-ns').value),
    fecha_cierre: datetimeLocalToIso(document.getElementById('ig-o-fecha-cierre').value),
  };

  submitBtn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const query = editingId
    ? window.supabaseClient.from('oportunidad').update(payload).eq('id', editingId).select('id')
    : window.supabaseClient.from('oportunidad').insert(payload).select('id');

  const { data, error } = await query;
  submitBtn.disabled = false;

  if (error) {
    statusEl.textContent = 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[integracion-ghl-ns.js] error guardando oportunidad', error);
    return;
  }

  statusEl.textContent = editingId ? 'Guardado ✓' : 'Creada ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  resetOportunidadForm();
  await loadOportunidades();

  // Idempotente: si ya tenía ghl_opportunity_id no hace nada. Si no,
  // la crea en GHL ahora. Se dispara solo (no bloquea el "Creada ✓"
  // de arriba) y al terminar refresca la fila con el sync_estado real.
  const idParaSync = editingId || data?.[0]?.id;
  if (idParaSync) {
    sincronizarOportunidadConGHL(idParaSync).then((resultado) => {
      if (!resultado.ok) {
        statusEl.textContent = `Guardado, pero no se pudo sincronizar con GHL: ${resultado.detail || 'error desconocido'}`;
        statusEl.className = 'admin-row-status admin-row-status--error';
      }
      loadOportunidades();
    });
  }
}

/* ============================================================
   integracion-ghl-ns.js — Sección "Integración NetSuite ↔ GHL"
   Consola de la integración (migración 15).

   Consulta de las tablas 'contacto' y 'oportunidad' de Supabase (ver
   supabase/migracion_10_integracion_ghl_ns.sql, _14_ y _15_) con
   paginación, búsqueda y filtros resueltos en el servidor (PostgREST):
   nunca se trae la tabla completa, así que no aplica el tope de 1000
   filas por pedido de Supabase.

   Origen de cada registro (columna origen_ultimo_cambio):
     - 'ghl' / 'netsuite': llegó desde la integración (carga histórica
       del Informe MKT, y más adelante los webhooks). Sólo lectura.
     - 'local': cargado a mano en este sitio. Se puede editar/borrar.
   La restricción es de la interfaz; RLS sigue igual (ver migración 15).

   Carga manual de Oportunidad: al guardar se llama a
   POST /admin/sync-oportunidad/{id} del servicio FastAPI de la
   integración (ghl-netsuite-api-opportunities, ver SYNC_API_BASE_URL),
   pasándole el access token del usuario logueado. Es idempotente: si
   la oportunidad ya tiene ghl_opportunity_id no hace nada.

   page-guard.js ya resuelve el nivel 'ver'. Acá se chequea 'editar'
   para mostrar la carga manual y las acciones de edición.
   ============================================================ */

'use strict';

// Servicio FastAPI de la integración (Etapa 2 — Oportunidad) en el
// servidor local (Coolify). Si cambia el dominio, actualizar acá.
const SYNC_API_BASE_URL = 'https://ghl-ns-opportunities.200.5.196.50.sslip.io';

const IG_PAGE_SIZE = 50;
// Máximo de contactos cuyo nombre coincide con la búsqueda que se usan
// para filtrar oportunidades (van en la URL del pedido: acotado para no
// superar el largo máximo de URL).
const IG_MAX_CONTACTOS_EN_BUSQUEDA = 100;

// Nombres de etapa de pipeline de GHL (GHL sólo expone el ID en la
// oportunidad). Misma fuente que PIPELINE_STAGE_NAMES de
// actualizar_resumen_ejecutivo.py (Informe MKT), con el pipeline adelante.
const IG_ETAPAS = {
  'a6586695-8b79-4dd1-bb26-8d5bc945b752': 'Comercio · Nuevo lead',
  '5924cb77-2282-42a7-9e01-ed0bb20281dc': 'Comercio · Conv. iniciada',
  '91532fbc-ffda-4604-bc25-ca58166bbf53': 'Comercio · Automatización dinámica',
  '7946f5d4-a474-4697-a8c2-92db83b71346': 'Comercio · Seguimiento',
  '8594e0fb-cd79-4581-8fa3-f4b56c63ee7e': 'Comercio · Baja x desinterés',
  '501228e9-133a-4c4d-92aa-cee9baefcc15': 'Comercio · Baja x precio',
  'af8aa8c4-1141-454e-b5d4-606751557363': 'Hogar · Nuevo lead',
  '65b86f8d-0b18-4d8b-b8d5-b9f1266dc5ba': 'Hogar · Conv. iniciada',
  '54761431-ce5a-4a53-a539-b7a6be676ccc': 'Hogar · Recontactos automatizados',
  'e790f05a-60f9-4e82-acd5-0f2f9d67c675': 'Hogar · Seguimiento',
  '7a58bb96-bff2-4d59-8634-0bd6995f905e': 'Hogar · Baja x desinterés',
  'a93a44cf-67dd-4d7c-b90b-af8aa75dcceb': 'Hogar · Baja x precio',
  '8558af67-2063-46c5-9f5f-e6d92484eba8': 'Leads Orgánicos · Nuevo lead',
  'a9220c7f-6425-4f7d-a416-b68b169e0460': 'Leads Orgánicos · Conv. iniciada',
  '70798112-34b0-4205-aa91-0c74643f4339': 'Leads Orgánicos · Automatización dinámica',
  '4ffdb32c-ec89-487d-9a21-d6a2a9dfc866': 'Leads Orgánicos · Seguimiento',
  '5c3d6fa3-9356-4a7f-b4c0-91e36455f495': 'Leads Orgánicos · Baja x desinterés',
  '972780bc-874c-4705-b421-e1726a443f6a': 'Leads Orgánicos · Baja x precio',
  'd01d69c3-b7f5-493c-b198-94e0e26508c7': 'Leads Orgánicos · Visita agendada',
  'b3b82029-7d98-458a-bf6f-7218b821ca27': 'Obra Segura · New lead',
  '08520929-2de3-45ec-b4d6-d24df3403bbe': 'Obra Segura · Contacted',
  '453fe183-ff64-4f6b-90a9-36177944229d': 'Obra Segura · Seguimiento',
  '610a5abb-d67b-47a7-8f84-6b764cb28074': 'Obra Segura · Proposal sent',
  '8f6976cc-f022-4c9c-a3de-af859e054046': 'Obra Segura · Closed',
  '71989c58-aeee-4c5a-bfc6-02997375065b': 'Visitas · Visita coordinada',
  '5dc95c7f-0b33-4a04-aa45-d078cc571920': 'Visitas · Reagendar visita',
  '3bcc1dd2-70de-47af-b123-2aaa6e6bc818': 'Visitas · Visita efectuada',
  'ba115218-902b-4901-a90c-ec99c738d856': 'Visitas · Presupuesto enviado',
  '47fd6dde-dffe-490e-a6af-ffd8937b81bd': 'Visitas · Recontacto 1',
  '4f06b795-184a-440b-a1f4-10ffe22acfb6': 'Visitas · Recontacto 2',
  '8133262f-3c1b-47c9-8113-76350e6d6641': 'Visitas · Respondió al recontacto',
  '7068ac99-7f3a-4e57-ae7c-088acf5b629f': 'Visitas · Venta ganada',
  'e2adaf6d-79d7-4dcc-ae0e-616f3e16d965': 'Visitas · Venta perdida',
};

// Vendedores de GHL (assignedTo). Misma fuente que VENDEDOR_GHL_IDS de
// actualizar_resumen_ejecutivo.py.
const IG_VENDEDORES = {
  gsliIez5jPqQiJf2L8xw: 'Gustavo Duarte',
  e2xSCStxUTstXbm2L6BS: 'Martín Ramos',
  zJkQVddXy0ktGJqhUpgQ: 'Gonzalo Martin De Castro',
  mS1a18rhRzZt2IsnpfrG: 'Federico Ordoqui',
};

const IG_OPORTUNIDAD_SELECT =
  '*, contacto:contacto_id (id, nombre, apellido, email, ghl_contact_id, ns_customer_id)';

let ig_puedeEditar = false;

// Estado de cada tabla: página actual, filas visibles, fila expandida y
// un contador de pedidos para descartar respuestas viejas (si el usuario
// escribe rápido en el buscador, puede volver antes un pedido anterior).
const ig_estado = {
  contactos: { page: 0, rows: [], total: 0, expandido: null, seq: 0 },
  oportunidades: { page: 0, rows: [], total: 0, expandido: null, seq: 0 },
};

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
    document.querySelectorAll('.ig-edit-only').forEach((el) => { el.style.display = ''; });
  }

  inicializarFiltros();
  inicializarFormularios();

  await Promise.all([loadResumen(), loadContactos(), loadOportunidades()]);
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

function fmtFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtMonto(n) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n);
}

function fmtNumero(n) {
  return new Intl.NumberFormat('es-AR').format(n || 0);
}

function datetimeLocalToIso(value) {
  return value ? `${value}:00` : null;
}

function isoToDatetimeLocal(iso) {
  if (!iso) return '';
  // input datetime-local espera "YYYY-MM-DDTHH:MM", sin segundos ni zona.
  return iso.slice(0, 16);
}

// Rango de fechas del filtro, en hora de Argentina.
function desdeIso(fecha) { return fecha ? `${fecha}T00:00:00-03:00` : null; }
function hastaIso(fecha) { return fecha ? `${fecha}T23:59:59.999-03:00` : null; }

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function valor(v) {
  return (v === null || v === undefined || v === '') ? '—' : escapeHtml(v);
}

function nombreContacto(c) {
  if (!c) return '—';
  const nombre = [c.nombre, c.apellido].filter(Boolean).join(' ').trim();
  return nombre || c.ghl_contact_id || '—';
}

function nombreEtapa(id) {
  if (!id) return '—';
  return IG_ETAPAS[id] || id;
}

function nombreVendedor(id) {
  if (!id) return '—';
  return IG_VENDEDORES[id] || id;
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Texto de búsqueda → palabras seguras para un filtro "or" de PostgREST
// (se sacan los caracteres con significado en esa sintaxis).
function palabrasBusqueda(texto) {
  return (texto || '')
    .replace(/[,()%*"\\:]/g, ' ')
    .split(/\s+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function orCampos(campos, palabra) {
  return campos.map((c) => `${c}.ilike.%${palabra}%`).join(',');
}

const IG_CAMPOS_BUSQUEDA_CONTACTO = ['nombre', 'apellido', 'email', 'ghl_contact_id', 'ns_customer_id'];

/* ── Badges ──────────────────────────────────────────────────────────── */

function syncBadge(estado, mensaje) {
  const map = {
    pendiente: ['prog', 'Pendiente'],
    sincronizado: ['ok', 'Sincronizada'],
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

function origenBadge(origen) {
  const map = {
    ghl: ['ghl', 'GHL'],
    netsuite: ['ns', 'NetSuite'],
    local: ['local', 'Manual'],
  };
  const [mod, label] = map[origen] || ['local', origen || '—'];
  return `<span class="ig-origen ig-origen--${mod}">${label}</span>`;
}

function tagsHtml(tags) {
  const lista = Array.isArray(tags) ? tags.filter(Boolean) : [];
  if (lista.length === 0) return '—';
  const visibles = lista.slice(0, 3).map((t) => `<span class="ig-tag">${escapeHtml(t)}</span>`).join('');
  const resto = lista.length > 3 ? `<span class="ig-tag ig-tag--more" title="${escapeHtml(lista.slice(3).join(', '))}">+${lista.length - 3}</span>` : '';
  return `<span class="ig-tags">${visibles}${resto}</span>`;
}

function esEditable(registro) {
  return ig_puedeEditar && registro && registro.origen_ultimo_cambio === 'local';
}

/* ── Paginador ───────────────────────────────────────────────────────── */

function renderPager(elId, estado, onPage) {
  const el = document.getElementById(elId);
  if (!el) return;
  const { page, total } = estado;
  if (total === 0) { el.innerHTML = ''; return; }
  const desde = page * IG_PAGE_SIZE + 1;
  const hasta = Math.min(total, (page + 1) * IG_PAGE_SIZE);
  const ultima = Math.max(0, Math.ceil(total / IG_PAGE_SIZE) - 1);
  el.innerHTML = `
    <span class="ig-pager__info">Mostrando ${fmtNumero(desde)}–${fmtNumero(hasta)} de ${fmtNumero(total)}</span>
    <span class="ig-pager__nav">
      <button type="button" class="btn btn--secondary" data-page="${page - 1}" ${page <= 0 ? 'disabled' : ''}><i class="ti ti-chevron-left"></i> Anterior</button>
      <span class="ig-pager__page">Página ${page + 1} de ${ultima + 1}</span>
      <button type="button" class="btn btn--secondary" data-page="${page + 1}" ${page >= ultima ? 'disabled' : ''}>Siguiente <i class="ti ti-chevron-right"></i></button>
    </span>
  `;
  el.querySelectorAll('button[data-page]').forEach((b) => {
    b.addEventListener('click', () => onPage(Number(b.dataset.page)));
  });
}

/* ── Filtros ─────────────────────────────────────────────────────────── */

function inicializarFiltros() {
  const vendedorSelect = document.getElementById('ig-c-f-vendedor');
  vendedorSelect.innerHTML = '<option value="">Vendedor: todos</option>' +
    Object.entries(IG_VENDEDORES).map(([id, n]) => `<option value="${id}">${escapeHtml(n)}</option>`).join('') +
    '<option value="__sin__">Sin asignar</option>';

  const recargarContactos = () => { ig_estado.contactos.page = 0; ig_estado.contactos.expandido = null; loadContactos(); };
  const recargarOportunidades = () => { ig_estado.oportunidades.page = 0; ig_estado.oportunidades.expandido = null; loadOportunidades(); };

  const cForm = document.getElementById('ig-c-filtros');
  const oForm = document.getElementById('ig-o-filtros');
  cForm.addEventListener('submit', (ev) => { ev.preventDefault(); recargarContactos(); });
  oForm.addEventListener('submit', (ev) => { ev.preventDefault(); recargarOportunidades(); });

  document.getElementById('ig-c-q').addEventListener('input', debounce(recargarContactos, 350));
  document.getElementById('ig-o-q').addEventListener('input', debounce(recargarOportunidades, 350));
  cForm.querySelectorAll('select, input[type="date"]').forEach((el) => el.addEventListener('change', recargarContactos));
  oForm.querySelectorAll('select, input[type="date"]').forEach((el) => el.addEventListener('change', recargarOportunidades));

  document.getElementById('ig-c-limpiar').addEventListener('click', () => { cForm.reset(); recargarContactos(); });
  document.getElementById('ig-o-limpiar').addEventListener('click', () => { oForm.reset(); recargarOportunidades(); });
}

function filtrosContactos() {
  return {
    q: document.getElementById('ig-c-q').value,
    origen: document.getElementById('ig-c-f-origen').value,
    ns: document.getElementById('ig-c-f-ns').value,
    vendedor: document.getElementById('ig-c-f-vendedor').value,
    dato: document.getElementById('ig-c-f-dato').value,
    desde: document.getElementById('ig-c-f-desde').value,
    hasta: document.getElementById('ig-c-f-hasta').value,
  };
}

function filtrosOportunidades() {
  return {
    q: document.getElementById('ig-o-q').value,
    estado: document.getElementById('ig-o-f-estado').value,
    origen: document.getElementById('ig-o-f-origen').value,
    ns: document.getElementById('ig-o-f-ns').value,
    sync: document.getElementById('ig-o-f-sync').value,
    desde: document.getElementById('ig-o-f-desde').value,
    hasta: document.getElementById('ig-o-f-hasta').value,
  };
}

function aplicarBusquedaContacto(query, texto) {
  palabrasBusqueda(texto).forEach((p) => {
    query = query.or(orCampos(IG_CAMPOS_BUSQUEDA_CONTACTO, p));
  });
  return query;
}

/* ── Resumen ─────────────────────────────────────────────────────────── */

async function loadResumen() {
  const el = document.getElementById('ig-summary');
  if (!el) return;
  const sb = window.supabaseClient;
  const contar = (q) => q.then(({ count, error }) => (error ? null : count));

  const [contactos, contactosNs, oportunidades, oportunidadesNs, ganadas, pendientes] = await Promise.all([
    contar(sb.from('contacto').select('id', { count: 'exact', head: true })),
    contar(sb.from('contacto').select('id', { count: 'exact', head: true }).not('ns_customer_id', 'is', null)),
    contar(sb.from('oportunidad').select('id', { count: 'exact', head: true })),
    contar(sb.from('oportunidad').select('id', { count: 'exact', head: true }).not('ns_opportunity_id', 'is', null)),
    contar(sb.from('oportunidad').select('id', { count: 'exact', head: true }).eq('estado', 'won')),
    contar(sb.from('oportunidad').select('id', { count: 'exact', head: true })
      .eq('origen_ultimo_cambio', 'local').neq('sync_estado', 'sincronizado')),
  ]);

  const n = (v) => (v === null ? '—' : fmtNumero(v));
  const items = [
    [n(contactos), 'contactos', null],
    [n(contactosNs), 'contactos con cliente NetSuite', null],
    [n(oportunidades), 'oportunidades', null],
    [n(oportunidadesNs), 'oportunidades con ID NetSuite', null],
    [n(ganadas), 'oportunidades ganadas', 'ganadas'],
    [n(pendientes), 'cargas manuales sin sincronizar con GHL', 'pendientes'],
  ];

  el.innerHTML = items.map(([v, l, accion]) => accion
    ? `<button type="button" class="ig-summary__item ig-summary__item--link" data-accion="${accion}" title="Ver en la tabla">
        <span class="ig-summary__value">${v}</span>
        <span class="ig-summary__label">${l}</span>
      </button>`
    : `<div class="ig-summary__item">
        <span class="ig-summary__value">${v}</span>
        <span class="ig-summary__label">${l}</span>
      </div>`).join('');

  el.querySelectorAll('[data-accion]').forEach((b) => b.addEventListener('click', () => {
    const oForm = document.getElementById('ig-o-filtros');
    oForm.reset();
    if (b.dataset.accion === 'ganadas') document.getElementById('ig-o-f-estado').value = 'won';
    if (b.dataset.accion === 'pendientes') document.getElementById('ig-o-f-origen').value = 'local';
    ig_estado.oportunidades.page = 0;
    ig_estado.oportunidades.expandido = null;
    loadOportunidades({ soloNoSincronizadas: b.dataset.accion === 'pendientes' });
    document.getElementById('ig-oportunidad-list-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
}

/* ── Contactos ───────────────────────────────────────────────────────── */

async function loadContactos() {
  const est = ig_estado.contactos;
  const seq = ++est.seq;
  const wrap = document.getElementById('ig-contacto-list-wrap');
  wrap.classList.add('admin-table-wrap--busy');

  const f = filtrosContactos();
  let query = window.supabaseClient.from('contacto').select('*', { count: 'exact' });

  query = aplicarBusquedaContacto(query, f.q);
  if (f.origen) query = query.eq('origen_ultimo_cambio', f.origen);
  if (f.ns === 'si') query = query.not('ns_customer_id', 'is', null);
  if (f.ns === 'no') query = query.is('ns_customer_id', null);
  if (f.vendedor === '__sin__') query = query.is('vendedor_asignado', null);
  else if (f.vendedor) query = query.eq('vendedor_asignado', f.vendedor);
  if (f.dato === 'incompleto') query = query.eq('sync_estado', 'pendiente');
  if (f.desde) query = query.gte('fecha_creacion_ghl', desdeIso(f.desde));
  if (f.hasta) query = query.lte('fecha_creacion_ghl', hastaIso(f.hasta));

  const from = est.page * IG_PAGE_SIZE;
  const { data, count, error } = await query
    .order('fecha_creacion_ghl', { ascending: false, nullsFirst: false })
    .order('creado_en', { ascending: false })
    .range(from, from + IG_PAGE_SIZE - 1);

  if (seq !== est.seq) return; // llegó una respuesta más nueva
  wrap.classList.remove('admin-table-wrap--busy');

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar los contactos.</p>';
    document.getElementById('ig-c-pager').innerHTML = '';
    console.error('[integracion-ghl-ns.js] error cargando contactos', error);
    return;
  }

  est.rows = data || [];
  est.total = count || 0;
  renderContactos();
  renderPager('ig-c-pager', est, (p) => { est.page = p; est.expandido = null; loadContactos(); });
}

function renderContactos() {
  const est = ig_estado.contactos;
  const wrap = document.getElementById('ig-contacto-list-wrap');

  if (est.rows.length === 0) {
    wrap.innerHTML = '<p class="admin-empty">No hay contactos que coincidan con la búsqueda.</p>';
    return;
  }

  const cols = 8;
  wrap.innerHTML = `
    <table class="admin-table ig-table">
      <thead>
        <tr>
          <th>Contacto</th>
          <th>Vendedor</th>
          <th>Tags</th>
          <th>ID GHL</th>
          <th>Cliente NetSuite</th>
          <th>Alta GHL</th>
          <th>Origen</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${est.rows.map((c) => `
          <tr class="${est.expandido === c.id ? 'ig-row--open' : ''}">
            <td>
              <div class="ig-cell-main">${escapeHtml(nombreContacto(c))}</div>
              <div class="ig-cell-sub">${valor(c.email)}</div>
            </td>
            <td>${escapeHtml(nombreVendedor(c.vendedor_asignado))}</td>
            <td>${tagsHtml(c.tags)}</td>
            <td class="ig-mono">${escapeHtml(c.ghl_contact_id)}</td>
            <td class="ig-mono">${valor(c.ns_customer_id)}</td>
            <td>${fmtFecha(c.fecha_creacion_ghl)}</td>
            <td>${origenBadge(c.origen_ultimo_cambio)}${c.sync_estado === 'pendiente' ? ' <span class="status-badge status-badge--prog" title="' + escapeHtml(c.sync_mensaje || '') + '">Incompleto</span>' : ''}</td>
            <td class="ig-actions-cell"><div class="ig-table-actions">
              <button type="button" class="btn btn--secondary btn--sm" onclick="toggleDetalleContacto('${c.id}')">${est.expandido === c.id ? 'Cerrar' : 'Ver'}</button>
              ${esEditable(c) ? `
                <button type="button" class="btn btn--secondary btn--sm" onclick="editarContacto('${c.id}')">Editar</button>
                <button type="button" class="btn btn--secondary btn--sm" onclick="borrarContacto('${c.id}')">Borrar</button>` : ''}
            </div></td>
          </tr>
          ${est.expandido === c.id ? `<tr class="ig-detail-row"><td colspan="${cols}"><div id="ig-c-detalle-${c.id}" class="ig-detail">Cargando…</div></td></tr>` : ''}
        `).join('')}
      </tbody>
    </table>
  `;

  if (est.expandido) cargarDetalleContacto(est.expandido);
}

function toggleDetalleContacto(id) {
  const est = ig_estado.contactos;
  est.expandido = est.expandido === id ? null : id;
  renderContactos();
}

async function cargarDetalleContacto(id) {
  const c = ig_estado.contactos.rows.find((x) => x.id === id);
  const el = document.getElementById(`ig-c-detalle-${id}`);
  if (!c || !el) return;

  const { data: ops, error } = await window.supabaseClient
    .from('oportunidad')
    .select('id, titulo, estado, monto, pipeline_stage_id, ghl_opportunity_id, ns_opportunity_id, estimate_id, fecha_creacion_ghl')
    .eq('contacto_id', id)
    .order('fecha_creacion_ghl', { ascending: false, nullsFirst: false });

  const elActual = document.getElementById(`ig-c-detalle-${id}`);
  if (!elActual) return; // se cerró mientras cargaba

  const opsHtml = error
    ? '<p class="admin-empty">No se pudieron cargar las oportunidades.</p>'
    : (ops.length === 0
      ? '<p class="ig-detail__empty">Sin oportunidades.</p>'
      : `<table class="admin-table ig-table ig-table--inner">
          <thead><tr><th>Título</th><th>Etapa</th><th>Estado</th><th>Monto</th><th>ID GHL</th><th>ID NetSuite</th><th>Presupuesto</th><th>Alta GHL</th></tr></thead>
          <tbody>${ops.map((o) => `
            <tr>
              <td>${valor(o.titulo)}</td>
              <td>${escapeHtml(nombreEtapa(o.pipeline_stage_id))}</td>
              <td>${estadoOportunidadBadge(o.estado)}</td>
              <td>${fmtMonto(o.monto)}</td>
              <td class="ig-mono">${valor(o.ghl_opportunity_id)}</td>
              <td class="ig-mono">${valor(o.ns_opportunity_id)}</td>
              <td class="ig-mono">${valor(o.estimate_id)}</td>
              <td>${fmtFecha(o.fecha_creacion_ghl)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`);

  const direccion = [c.direccion_calle, c.direccion_numero, c.direccion_piso ? `piso ${c.direccion_piso}` : null, c.localidad]
    .filter(Boolean).join(' ');

  elActual.innerHTML = `
    <dl class="ig-dl">
      <div><dt>Teléfono</dt><dd>${valor([c.codigo_area, c.telefono].filter(Boolean).join(' '))}</dd></div>
      <div><dt>Dirección</dt><dd>${valor(direccion)}</dd></div>
      <div><dt>Interesado en</dt><dd>${valor(c.interesado_en)}</dd></div>
      <div><dt>Forma de contacto</dt><dd>${valor(c.forma_contacto)}</dd></div>
      <div><dt>Origen del lead</dt><dd>${valor(c.origen_lead)}</dd></div>
      <div><dt>Alta en NetSuite</dt><dd>${fmtFechaHora(c.fecha_creacion_ns)}</dd></div>
      <div><dt>Última actualización GHL</dt><dd>${fmtFechaHora(c.fecha_actualizacion_ghl)}</dd></div>
      <div><dt>Última actualización NetSuite</dt><dd>${fmtFechaHora(c.fecha_actualizacion_ns)}</dd></div>
      ${c.sync_mensaje ? `<div class="ig-dl__wide"><dt>Nota</dt><dd>${escapeHtml(c.sync_mensaje)}</dd></div>` : ''}
    </dl>
    <h3 class="ig-detail__title">Oportunidades del contacto</h3>
    ${opsHtml}
  `;
}

/* ── Oportunidades ───────────────────────────────────────────────────── */

async function loadOportunidades(opciones = {}) {
  const est = ig_estado.oportunidades;
  if (opciones.soloNoSincronizadas !== undefined) est.soloNoSincronizadas = opciones.soloNoSincronizadas;
  const seq = ++est.seq;
  const wrap = document.getElementById('ig-oportunidad-list-wrap');
  wrap.classList.add('admin-table-wrap--busy');

  const f = filtrosOportunidades();
  // El atajo "cargas manuales sin sincronizar" del resumen sólo vale
  // mientras no se toque el filtro de sincronización.
  if (f.sync || f.origen !== 'local') est.soloNoSincronizadas = false;

  let query = window.supabaseClient.from('oportunidad').select(IG_OPORTUNIDAD_SELECT, { count: 'exact' });

  const palabras = palabrasBusqueda(f.q);
  if (palabras.length) {
    // Contactos cuyo nombre/email/ID coincide con todas las palabras.
    let qc = window.supabaseClient.from('contacto').select('id').limit(IG_MAX_CONTACTOS_EN_BUSQUEDA);
    qc = aplicarBusquedaContacto(qc, f.q);
    const { data: contactos } = await qc;
    if (seq !== est.seq) return;

    const texto = palabras.join(' ');
    const condiciones = [orCampos(['titulo', 'ghl_opportunity_id', 'ns_opportunity_id', 'estimate_id'], texto)];
    const ids = (contactos || []).map((c) => c.id);
    if (ids.length) condiciones.push(`contacto_id.in.(${ids.join(',')})`);
    query = query.or(condiciones.join(','));
  }

  if (f.estado) query = query.eq('estado', f.estado);
  if (f.origen) query = query.eq('origen_ultimo_cambio', f.origen);
  if (f.ns === 'si') query = query.not('ns_opportunity_id', 'is', null);
  if (f.ns === 'no') query = query.is('ns_opportunity_id', null);
  if (f.sync) query = query.eq('sync_estado', f.sync);
  else if (est.soloNoSincronizadas) query = query.neq('sync_estado', 'sincronizado');
  if (f.desde) query = query.gte('fecha_creacion_ghl', desdeIso(f.desde));
  if (f.hasta) query = query.lte('fecha_creacion_ghl', hastaIso(f.hasta));

  const from = est.page * IG_PAGE_SIZE;
  const { data, count, error } = await query
    .order('fecha_creacion_ghl', { ascending: false, nullsFirst: false })
    .order('creado_en', { ascending: false })
    .range(from, from + IG_PAGE_SIZE - 1);

  if (seq !== est.seq) return;
  wrap.classList.remove('admin-table-wrap--busy');

  if (error) {
    wrap.innerHTML = '<p class="admin-empty">No se pudieron cargar las oportunidades.</p>';
    document.getElementById('ig-o-pager').innerHTML = '';
    console.error('[integracion-ghl-ns.js] error cargando oportunidades', error);
    return;
  }

  est.rows = data || [];
  est.total = count || 0;
  renderOportunidades();
  renderPager('ig-o-pager', est, (p) => { est.page = p; est.expandido = null; loadOportunidades(); });
}

function renderOportunidades() {
  const est = ig_estado.oportunidades;
  const wrap = document.getElementById('ig-oportunidad-list-wrap');

  const aviso = est.soloNoSincronizadas
    ? '<p class="ig-filter-note">Mostrando sólo cargas manuales sin sincronizar con GHL. <button type="button" class="ig-link" onclick="quitarAtajoPendientes()">Ver todas</button></p>'
    : '';

  if (est.rows.length === 0) {
    wrap.innerHTML = aviso + '<p class="admin-empty">No hay oportunidades que coincidan con la búsqueda.</p>';
    return;
  }

  const cols = 10;
  wrap.innerHTML = aviso + `
    <table class="admin-table ig-table">
      <thead>
        <tr>
          <th>Contacto</th>
          <th>Título</th>
          <th>Etapa</th>
          <th>Estado</th>
          <th>Monto</th>
          <th>ID GHL</th>
          <th>NetSuite / Presupuesto</th>
          <th>Alta GHL</th>
          <th>Origen</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${est.rows.map((o) => {
          const local = o.origen_ultimo_cambio === 'local';
          const syncCell = local ? ` ${syncBadge(o.sync_estado, o.sync_mensaje)}` : '';
          return `
          <tr class="${est.expandido === o.id ? 'ig-row--open' : ''}">
            <td>
              <div class="ig-cell-main">${escapeHtml(nombreContacto(o.contacto))}</div>
              <div class="ig-cell-sub ig-mono">${valor(o.contacto?.ns_customer_id)}</div>
            </td>
            <td>${valor(o.titulo)}</td>
            <td>${escapeHtml(nombreEtapa(o.pipeline_stage_id))}</td>
            <td>${estadoOportunidadBadge(o.estado)}</td>
            <td class="ig-num">${fmtMonto(o.monto)}</td>
            <td class="ig-mono">${valor(o.ghl_opportunity_id)}</td>
            <td class="ig-mono">${valor(o.ns_opportunity_id)}${o.estimate_id ? `<div class="ig-cell-sub">Pres. ${escapeHtml(o.estimate_id)}</div>` : ''}</td>
            <td>${fmtFecha(o.fecha_creacion_ghl)}</td>
            <td>${origenBadge(o.origen_ultimo_cambio)}${syncCell}</td>
            <td class="ig-actions-cell"><div class="ig-table-actions">
              <button type="button" class="btn btn--secondary btn--sm" onclick="toggleDetalleOportunidad('${o.id}')">${est.expandido === o.id ? 'Cerrar' : 'Ver'}</button>
              ${esEditable(o) ? `
                <button type="button" class="btn btn--secondary btn--sm" onclick="editarOportunidad('${o.id}')">Editar</button>
                ${o.sync_estado !== 'sincronizado' ? `<button type="button" class="btn btn--secondary btn--sm" onclick="reintentarSyncOportunidad('${o.id}')">${o.sync_estado === 'error' ? 'Reintentar' : 'Sincronizar'}</button>` : ''}
                <button type="button" class="btn btn--secondary btn--sm" onclick="borrarOportunidad('${o.id}')">Borrar</button>` : ''}
            </div></td>
          </tr>
          ${est.expandido === o.id ? `<tr class="ig-detail-row"><td colspan="${cols}">${detalleOportunidadHtml(o)}</td></tr>` : ''}
        `;
        }).join('')}
      </tbody>
    </table>
  `;
}

function quitarAtajoPendientes() {
  const est = ig_estado.oportunidades;
  est.soloNoSincronizadas = false;
  document.getElementById('ig-o-f-origen').value = '';
  est.page = 0;
  loadOportunidades();
}

function toggleDetalleOportunidad(id) {
  const est = ig_estado.oportunidades;
  est.expandido = est.expandido === id ? null : id;
  renderOportunidades();
}

function detalleOportunidadHtml(o) {
  const c = o.contacto || {};
  return `
    <div class="ig-detail">
      <dl class="ig-dl">
        <div><dt>Contacto</dt><dd>${escapeHtml(nombreContacto(c))}</dd></div>
        <div><dt>ID contacto GHL</dt><dd class="ig-mono">${valor(c.ghl_contact_id)}</dd></div>
        <div><dt>Cliente NetSuite</dt><dd class="ig-mono">${valor(c.ns_customer_id)}</dd></div>
        <div><dt>Email</dt><dd>${valor(c.email)}</dd></div>
        <div><dt>ID oportunidad GHL</dt><dd class="ig-mono">${valor(o.ghl_opportunity_id)}</dd></div>
        <div><dt>ID oportunidad NetSuite</dt><dd class="ig-mono">${valor(o.ns_opportunity_id)}</dd></div>
        <div><dt>Presupuesto NetSuite</dt><dd class="ig-mono">${valor(o.estimate_id)}</dd></div>
        <div><dt>Tipo de proyecto</dt><dd>${valor(o.tipo_proyecto)}</dd></div>
        <div><dt>Unidad comercial</dt><dd>${valor(o.unidad_comercial)}</dd></div>
        <div><dt>Class NetSuite</dt><dd>${valor(o.class_ns)}</dd></div>
        <div><dt>Etapa</dt><dd>${escapeHtml(nombreEtapa(o.pipeline_stage_id))}</dd></div>
        <div><dt>Monto</dt><dd>${fmtMonto(o.monto)}</dd></div>
        <div><dt>Alta en GHL</dt><dd>${fmtFechaHora(o.fecha_creacion_ghl)}</dd></div>
        <div><dt>Alta en NetSuite</dt><dd>${fmtFechaHora(o.fecha_creacion_ns)}</dd></div>
        <div><dt>Última actualización GHL</dt><dd>${fmtFechaHora(o.fecha_actualizacion_ghl)}</dd></div>
        <div><dt>Última actualización NetSuite</dt><dd>${fmtFechaHora(o.fecha_actualizacion_ns)}</dd></div>
        <div><dt>Cierre</dt><dd>${fmtFechaHora(o.fecha_cierre)}</dd></div>
        ${o.origen_ultimo_cambio === 'local' ? `<div><dt>Sincronización con GHL</dt><dd>${syncBadge(o.sync_estado, o.sync_mensaje)} <span class="ig-cell-sub">${fmtFechaHora(o.sync_actualizado_en)}</span></dd></div>` : ''}
        ${o.sync_mensaje ? `<div class="ig-dl__wide"><dt>Mensaje</dt><dd>${escapeHtml(o.sync_mensaje)}</dd></div>` : ''}
      </dl>
    </div>
  `;
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
  await Promise.all([loadOportunidades(), loadResumen()]);

  if (wrap) wrap.classList.remove('admin-table-wrap--busy');

  if (!resultado.ok) {
    alert(`No se pudo sincronizar con GHL: ${resultado.detail || 'error desconocido'}`);
  }
}

/* ── Carga manual: formularios ───────────────────────────────────────── */

function inicializarFormularios() {
  document.getElementById('ig-contacto-form').addEventListener('submit', onSubmitContacto);
  document.getElementById('ig-c-cancel-btn').addEventListener('click', cerrarContactoForm);
  document.getElementById('ig-oportunidad-form').addEventListener('submit', onSubmitOportunidad);
  document.getElementById('ig-o-cancel-btn').addEventListener('click', cerrarOportunidadForm);

  document.getElementById('ig-c-nuevo-btn').addEventListener('click', () => {
    resetContactoForm();
    abrirSeccion('ig-contacto-form-section');
  });
  document.getElementById('ig-o-nuevo-btn').addEventListener('click', () => {
    resetOportunidadForm();
    abrirSeccion('ig-oportunidad-form-section');
    buscarContactosParaForm('');
  });

  document.getElementById('ig-o-contacto-buscar')
    .addEventListener('input', debounce((ev) => buscarContactosParaForm(ev.target.value), 300));
}

function abrirSeccion(id) {
  if (!ig_puedeEditar) return;
  const sec = document.getElementById(id);
  sec.style.display = '';
  sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Llena el select de contacto del formulario de oportunidad con los que
// coinciden con la búsqueda (máx. 30), manteniendo el seleccionado.
async function buscarContactosParaForm(texto, seleccionado) {
  const select = document.getElementById('ig-o-contacto');
  let query = window.supabaseClient.from('contacto')
    .select('id, nombre, apellido, ghl_contact_id')
    .order('fecha_creacion_ghl', { ascending: false, nullsFirst: false })
    .limit(30);
  query = aplicarBusquedaContacto(query, texto);

  const { data, error } = await query;
  if (error) {
    console.error('[integracion-ghl-ns.js] error buscando contactos', error);
    return;
  }

  const actual = seleccionado || null;
  const lista = data || [];
  if (actual && !lista.some((c) => c.id === actual.id)) lista.unshift(actual);

  select.innerHTML = `<option value="" disabled ${actual ? '' : 'selected'}>${lista.length ? 'Elegir contacto…' : 'Sin coincidencias'}</option>` +
    lista.map((c) => `<option value="${c.id}">${escapeHtml(nombreContacto(c))} — ${escapeHtml(c.ghl_contact_id)}</option>`).join('');
  if (actual) select.value = actual.id;
}

/* Contacto */

function editarContacto(id) {
  const c = ig_estado.contactos.rows.find((x) => x.id === id);
  if (!esEditable(c)) return;

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

  document.getElementById('ig-contacto-form-title').textContent = 'Editar contacto (carga manual)';
  document.getElementById('ig-c-submit-btn').textContent = 'Guardar cambios';
  abrirSeccion('ig-contacto-form-section');
}

function resetContactoForm() {
  document.getElementById('ig-contacto-form').reset();
  document.getElementById('ig-c-editing-id').value = '';
  document.getElementById('ig-contacto-form-title').textContent = 'Nuevo contacto (carga manual)';
  document.getElementById('ig-c-submit-btn').textContent = 'Guardar contacto';
  document.getElementById('ig-c-form-status').textContent = '';
  document.getElementById('ig-c-form-status').className = 'admin-row-status';
}

function cerrarContactoForm() {
  resetContactoForm();
  document.getElementById('ig-contacto-form-section').style.display = 'none';
}

async function borrarContacto(id) {
  const c = ig_estado.contactos.rows.find((x) => x.id === id);
  if (!esEditable(c)) return;

  const { count } = await window.supabaseClient
    .from('oportunidad').select('id', { count: 'exact', head: true }).eq('contacto_id', id);
  const advertencia = count
    ? ` Este contacto tiene ${count} oportunidad(es) cargada(s): se borran junto con él.`
    : '';

  if (!confirm(`¿Borrar el contacto ${nombreContacto(c)}?${advertencia} No se puede deshacer.`)) return;

  const { error } = await window.supabaseClient.from('contacto').delete()
    .eq('id', id).eq('origen_ultimo_cambio', 'local');

  if (error) {
    alert('No se pudo borrar el contacto.');
    console.error('[integracion-ghl-ns.js] error borrando contacto', error);
    return;
  }

  ig_estado.contactos.expandido = null;
  await Promise.all([loadContactos(), loadOportunidades(), loadResumen()]);
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
    origen_ultimo_cambio: 'local',
    // El Contacto siempre corresponde a uno YA existente en GHL (no hay un
    // paso que lo cree allá desde acá): se guarda como "sincronizado" para
    // no quedar "pendiente" para siempre.
    sync_estado: 'sincronizado',
    sync_mensaje: null,
    sync_actualizado_en: new Date().toISOString(),
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
    ? window.supabaseClient.from('contacto').update(payload).eq('id', editingId).eq('origen_ultimo_cambio', 'local')
    : window.supabaseClient.from('contacto').insert(payload);

  const { error } = await query;
  submitBtn.disabled = false;

  if (error) {
    statusEl.textContent = error.code === '23505' ? 'Ya existe un contacto con ese ID de GHL' : 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[integracion-ghl-ns.js] error guardando contacto', error);
    return;
  }

  resetContactoForm();
  statusEl.textContent = editingId ? 'Guardado ✓' : 'Creado ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  await Promise.all([loadContactos(), loadResumen()]);
}

/* Oportunidad */

function editarOportunidad(id) {
  const o = ig_estado.oportunidades.rows.find((x) => x.id === id);
  if (!esEditable(o)) return;

  document.getElementById('ig-o-editing-id').value = o.id;
  document.getElementById('ig-o-contacto-buscar').value = '';
  buscarContactosParaForm('', o.contacto ? { ...o.contacto, id: o.contacto_id } : null);
  document.getElementById('ig-o-ns-id').value = o.ns_opportunity_id || '';
  document.getElementById('ig-o-ghl-id').value = o.ghl_opportunity_id || '';
  document.getElementById('ig-o-titulo').value = o.titulo || '';
  document.getElementById('ig-o-unidad').value = o.unidad_comercial || '';
  document.getElementById('ig-o-estado').value = o.estado || 'open';
  document.getElementById('ig-o-monto').value = o.monto ?? '';
  document.getElementById('ig-o-fecha-creacion-ns').value = isoToDatetimeLocal(o.fecha_creacion_ns);
  document.getElementById('ig-o-fecha-cierre').value = isoToDatetimeLocal(o.fecha_cierre);

  document.getElementById('ig-oportunidad-form-title').textContent = 'Editar oportunidad (carga manual)';
  document.getElementById('ig-o-submit-btn').textContent = 'Guardar cambios';
  abrirSeccion('ig-oportunidad-form-section');
}

function resetOportunidadForm() {
  document.getElementById('ig-oportunidad-form').reset();
  document.getElementById('ig-o-editing-id').value = '';
  document.getElementById('ig-oportunidad-form-title').textContent = 'Nueva oportunidad (carga manual)';
  document.getElementById('ig-o-submit-btn').textContent = 'Guardar oportunidad';
  document.getElementById('ig-o-form-status').textContent = '';
  document.getElementById('ig-o-form-status').className = 'admin-row-status';
}

function cerrarOportunidadForm() {
  resetOportunidadForm();
  document.getElementById('ig-oportunidad-form-section').style.display = 'none';
}

async function borrarOportunidad(id) {
  const o = ig_estado.oportunidades.rows.find((x) => x.id === id);
  if (!esEditable(o)) return;
  const advertencia = o.ghl_opportunity_id
    ? ' Ya está sincronizada con GHL — esto no la borra allá, sólo acá.'
    : '';

  if (!confirm(`¿Borrar esta oportunidad?${advertencia} No se puede deshacer.`)) return;

  const { error } = await window.supabaseClient.from('oportunidad').delete()
    .eq('id', id).eq('origen_ultimo_cambio', 'local');

  if (error) {
    alert('No se pudo borrar la oportunidad.');
    console.error('[integracion-ghl-ns.js] error borrando oportunidad', error);
    return;
  }

  ig_estado.oportunidades.expandido = null;
  await Promise.all([loadOportunidades(), loadResumen()]);
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

  const ghlIdIngresado = document.getElementById('ig-o-ghl-id').value.trim() || null;

  // Si es una oportunidad NUEVA y el campo "ID de oportunidad GHL" tiene
  // algo cargado, se confirma: ese ID la marca como "ya existente en GHL"
  // y la sincronización NO la va a crear.
  if (!editingId && ghlIdIngresado) {
    const seguir = confirm(
      '¿Esta oportunidad YA existe en GHL con el ID "' + ghlIdIngresado + '"?\n\n' +
      'Aceptar: se guarda con ese ID y NO se crea de nuevo en GHL.\n' +
      'Cancelar: dejá el campo vacío y guardá de nuevo para que se cree sola en GHL.'
    );
    if (!seguir) {
      statusEl.textContent = 'Guardado cancelado — vaciá el campo "ID de oportunidad GHL" y volvé a guardar.';
      statusEl.className = 'admin-row-status admin-row-status--error';
      return;
    }
  }

  const montoRaw = document.getElementById('ig-o-monto').value;

  const payload = {
    contacto_id: contactoId,
    ns_opportunity_id: document.getElementById('ig-o-ns-id').value.trim() || null,
    ghl_opportunity_id: ghlIdIngresado,
    titulo: document.getElementById('ig-o-titulo').value.trim() || null,
    unidad_comercial: document.getElementById('ig-o-unidad').value.trim() || null,
    estado: document.getElementById('ig-o-estado').value,
    monto: montoRaw ? Number(montoRaw) : null,
    fecha_creacion_ns: datetimeLocalToIso(document.getElementById('ig-o-fecha-creacion-ns').value),
    fecha_cierre: datetimeLocalToIso(document.getElementById('ig-o-fecha-cierre').value),
    origen_ultimo_cambio: 'local',
  };

  submitBtn.disabled = true;
  statusEl.textContent = 'Guardando…';
  statusEl.className = 'admin-row-status';

  const query = editingId
    ? window.supabaseClient.from('oportunidad').update(payload).eq('id', editingId).eq('origen_ultimo_cambio', 'local').select('id')
    : window.supabaseClient.from('oportunidad').insert(payload).select('id');

  const { data, error } = await query;
  submitBtn.disabled = false;

  if (error) {
    statusEl.textContent = error.code === '23505' ? 'Ya existe una oportunidad con ese ID de GHL' : 'Error al guardar';
    statusEl.className = 'admin-row-status admin-row-status--error';
    console.error('[integracion-ghl-ns.js] error guardando oportunidad', error);
    return;
  }

  resetOportunidadForm();
  statusEl.textContent = editingId ? 'Guardado ✓' : 'Creada ✓';
  statusEl.className = 'admin-row-status admin-row-status--ok';
  await Promise.all([loadOportunidades(), loadResumen()]);

  // Idempotente: si ya tenía ghl_opportunity_id no hace nada. Si no, la
  // crea en GHL ahora y al terminar refresca con el sync_estado real.
  const idParaSync = editingId || data?.[0]?.id;
  if (idParaSync) {
    sincronizarOportunidadConGHL(idParaSync).then((resultado) => {
      if (!resultado.ok) {
        statusEl.textContent = `Guardado, pero no se pudo sincronizar con GHL: ${resultado.detail || 'error desconocido'}`;
        statusEl.className = 'admin-row-status admin-row-status--error';
      }
      loadOportunidades();
      loadResumen();
    });
  }
}

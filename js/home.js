/**
 * home.js — Home dinámico: mosaicos según permisos + pizarra real.
 *
 * Reemplaza el mock estático de index.html. Se engancha al evento
 * 'sp:auth-ready' que dispara js/auth.js una vez que se sabe si hay
 * sesión o no. Requiere las RPCs de supabase/rpc_home.sql
 * (fn_mis_secciones_visibles, fn_mis_novedades, fn_marcar_leida).
 */

const SECCION_IDS_MOSAICOS = ['mapa-servicios', 'sector-comunicaciones', 'organigrama'];

document.addEventListener('sp:auth-ready', (e) => {
  handleAuthReady(e.detail.session);
});

async function handleAuthReady(session) {
  if (!session) {
    showGateMessage(
      'Iniciá sesión para ver las novedades y los mosaicos habilitados para tu área.',
      false
    );
    return;
  }

  const { data: perfil, error: perfilError } = await window.supabaseClient
    .from('perfiles')
    .select('activo, es_superadmin, area_id')
    .eq('id', session.user.id)
    .single();

  if (perfilError || !perfil) {
    showGateMessage('No se pudo cargar tu perfil. Probá recargar la página.', false);
    console.error('[home.js] error cargando perfil', perfilError);
    return;
  }

  if (!perfil.activo) {
    showGateMessage(
      'Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.',
      false
    );
    return;
  }

  hideGateMessage();
  await Promise.all([
    cargarMosaicos(perfil),
    cargarPizarra()
  ]);
}

function showGateMessage(texto, mostrarBotonLogin) {
  const msg = document.getElementById('home-gate-message');
  const pizarra = document.getElementById('pizarra-section');
  if (pizarra) pizarra.style.display = 'none';
  SECCION_IDS_MOSAICOS.forEach(id => {
    const card = document.querySelector(`[data-seccion-id="${id}"]`);
    if (card) card.style.display = 'none';
  });
  if (msg) {
    msg.textContent = texto;
    msg.style.display = '';
  }
}

function hideGateMessage() {
  const msg = document.getElementById('home-gate-message');
  const pizarra = document.getElementById('pizarra-section');
  if (msg) msg.style.display = 'none';
  if (pizarra) pizarra.style.display = '';
}

async function cargarMosaicos(perfil) {
  let visibles;

  if (perfil.es_superadmin) {
    visibles = SECCION_IDS_MOSAICOS;
  } else {
    const { data, error } = await window.supabaseClient.rpc('fn_mis_secciones_visibles');
    if (error) {
      console.error('[home.js] error cargando secciones visibles', error);
      visibles = [];
    } else {
      visibles = (data || []).map(s => s.id);
    }
  }

  SECCION_IDS_MOSAICOS.forEach(id => {
    const card = document.querySelector(`[data-seccion-id="${id}"]`);
    if (card) card.style.display = visibles.includes(id) ? '' : 'none';
  });

  const emptyMsg = document.getElementById('mosaicos-empty');
  if (emptyMsg) {
    emptyMsg.style.display = visibles.length > 0 ? 'none' : '';
  }
}

async function cargarPizarra() {
  const list = document.getElementById('pizarra-list');
  const badge = document.getElementById('pizarra-unread-badge');
  if (!list) return;

  const { data, error } = await window.supabaseClient.rpc('fn_mis_novedades');

  if (error) {
    list.innerHTML = '<p class="pizarra-post__excerpt">No se pudieron cargar las novedades.</p>';
    console.error('[home.js] error cargando novedades', error);
    return;
  }

  const novedades = data || [];
  const noLeidas = novedades.filter(n => !n.leida);

  if (badge) {
    if (noLeidas.length > 0) {
      badge.textContent = `${noLeidas.length} sin leer`;
      badge.style.display = '';
    } else {
      badge.style.display = 'none';
    }
  }

  if (novedades.length === 0) {
    list.innerHTML = '<p class="pizarra-post__excerpt">Todavía no hay publicaciones.</p>';
    return;
  }

  list.innerHTML = novedades.map(renderNovedad).join('');

  // Marca como leídas, en segundo plano, las que se acaban de mostrar.
  noLeidas.forEach(n => {
    window.supabaseClient.rpc('fn_marcar_leida', { p_novedad_id: n.id }).catch(err => {
      console.error('[home.js] error marcando como leída', err);
    });
  });
}

function renderNovedad(n) {
  const meta = [formatFecha(n.publicado_en), n.autor_nombre].filter(Boolean).join(' · ');
  return `
    <article class="pizarra-post ${!n.leida ? 'pizarra-post--unread' : ''}">
      <div class="pizarra-post__meta">
        <span class="tag">${escapeHtml(n.categoria)}</span>
        <span class="pizarra-post__date">${escapeHtml(meta)}</span>
        ${!n.leida ? '<span class="pizarra-post__dot" aria-label="No leído" title="No leído"></span>' : ''}
      </div>
      <h3 class="pizarra-post__title">${escapeHtml(n.titulo)}</h3>
      <p class="pizarra-post__excerpt">${escapeHtml(n.cuerpo)}</p>
    </article>
  `;
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

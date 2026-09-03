/**
 * home.js — Home dinámico: mosaicos según permisos + pizarra real.
 *
 * Reemplaza el mock estático de index.html. Se engancha al evento
 * 'sp:auth-ready' que dispara js/auth.js una vez que se sabe si hay
 * sesión o no. Requiere las RPCs de supabase/rpc_home.sql
 * (fn_mis_secciones_visibles, fn_mis_novedades).
 *
 * El feed sólo muestra un extracto de cada novedad (pensado para cuando
 * el cuerpo sea más largo) con link a pages/novedad.html, que es donde
 * se ve completa y donde se marca como leída al acceder — ver
 * js/novedad.js. Este archivo no marca nada como leído por su cuenta.
 */

const SECCION_IDS_MOSAICOS = ['mapa-servicios', 'sector-comunicaciones', 'organigrama'];
const PIZARRA_EXCERPT_LEN = 180;
const PIZARRA_PAGE_SIZE = 10;

document.addEventListener('sp:auth-ready', (e) => {
  handleAuthReady(e.detail.session, e.detail.error);
});

// Si el navegador restauró la página desde el bfcache (por ejemplo al
// volver con "atrás" desde pages/novedad.html), el DOM queda como estaba
// antes de irse — con el estado de "no leída" viejo. Se refresca la
// pizarra en ese caso para que el punto rojo/contador queden al día.
window.addEventListener('pageshow', (e) => {
  if (e.persisted) cargarPizarra();
});

async function handleAuthReady(session, authError) {
  if (authError) {
    showGateMessage('No se pudo verificar tu sesión. Probá recargar la página.');
    console.error('[home.js] sp:auth-ready llegó con error', authError);
    await cargarPizarraPublica();
    return;
  }

  if (!session) {
    // Sin sesión no hay mosaicos que mostrar (dependen del área del
    // usuario), pero las novedades de categoría "Pública" sí se
    // muestran igual -- ver supabase/migracion_5_novedades_publicas.sql.
    showGateMessage(
      'Iniciá sesión para ver los mosaicos habilitados para tu área. Las novedades públicas se muestran igual, debajo.'
    );
    await cargarPizarraPublica();
    return;
  }

  let perfil, perfilError;
  try {
    ({ data: perfil, error: perfilError } = await window.supabaseClient
      .from('perfiles')
      .select('activo, es_superadmin, area_id')
      .eq('id', session.user.id)
      .single());
  } catch (err) {
    perfilError = err;
  }

  if (perfilError || !perfil) {
    showGateMessage('No se pudo cargar tu perfil. Probá recargar la página.');
    console.error('[home.js] error cargando perfil', perfilError);
    await cargarPizarraPublica();
    return;
  }

  if (!perfil.activo) {
    showGateMessage(
      'Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.'
    );
    await cargarPizarraPublica();
    return;
  }

  hideGateMessage();
  await Promise.all([
    cargarMosaicos(perfil),
    cargarPizarra()
  ]);
}

function showGateMessage(texto) {
  const msg = document.getElementById('home-gate-message');
  const mosaicosWrap = document.getElementById('mosaicos-wrap');
  // Sin sesión completa (o cuenta pendiente) no se sabe qué mosaico
  // corresponde mostrar, así que se oculta toda la sección "Productos y
  // servicios" (incluidos los "Próximamente"). La pizarra NO se oculta
  // acá -- en este estado muestra las novedades públicas en vez de las
  // personalizadas, ver cargarPizarraPublica().
  if (mosaicosWrap) mosaicosWrap.style.display = 'none';
  if (msg) {
    msg.textContent = texto;
    msg.style.display = '';
  }
}

function hideGateMessage() {
  const msg = document.getElementById('home-gate-message');
  const mosaicosWrap = document.getElementById('mosaicos-wrap');
  if (mosaicosWrap) mosaicosWrap.style.display = '';
  if (msg) msg.style.display = 'none';
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

let sp_unreadCount = 0;
let sp_novedades = [];
let sp_paginaActual = 1;
// El pager es HTML fijo (no se regenera con innerHTML como la lista), así
// que sus botones se enganchan una sola vez, no en cada cargarPizarra().
let sp_pagerWired = false;

// Novedades de categoría "Pública" (supabase/migracion_5_novedades_publicas.sql),
// para cuando no hay sesión iniciada o todavía no se sabe si el perfil
// tiene permisos. A diferencia de cargarPizarra(), no hay indicador de
// "no leídas" (no hay a quién asociarlo) ni paginado (se espera que sean
// pocas), y las tarjetas no linkean a pages/novedad.html porque esa
// pantalla sí requiere sesión.
async function cargarPizarraPublica() {
  const list = document.getElementById('pizarra-list');
  const badge = document.getElementById('pizarra-unread-badge');
  const pager = document.getElementById('pizarra-pager');
  if (!list) return;

  if (badge) badge.style.display = 'none';
  if (pager) pager.style.display = 'none';

  const { data, error } = await window.supabaseClient.rpc('fn_novedades_publicas');

  if (error) {
    list.innerHTML = '<p class="pizarra-post__excerpt">No se pudieron cargar las novedades.</p>';
    console.error('[home.js] error cargando novedades públicas', error);
    return;
  }

  const novedades = data || [];
  if (novedades.length === 0) {
    list.innerHTML = '<p class="pizarra-post__excerpt">Todavía no hay novedades públicas.</p>';
    return;
  }

  list.innerHTML = novedades.map(renderNovedadPublica).join('');
}

function renderNovedadPublica(n) {
  const meta = [formatFecha(n.publicado_en), n.autor_nombre].filter(Boolean).join(' · ');
  return `
    <div class="pizarra-post">
      <div class="pizarra-post__meta">
        <span class="tag">${escapeHtml(n.categoria)}</span>
        <span class="pizarra-post__date">${escapeHtml(meta)}</span>
      </div>
      <h3 class="pizarra-post__title">${escapeHtml(n.titulo)}</h3>
      <p class="pizarra-post__excerpt">${escapeHtml(truncar(n.cuerpo, PIZARRA_EXCERPT_LEN))}</p>
    </div>
  `;
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

  sp_novedades = data || [];
  sp_unreadCount = sp_novedades.filter(n => !n.leida).length;
  actualizarBadge(badge);

  if (sp_novedades.length === 0) {
    list.innerHTML = '<p class="pizarra-post__excerpt">Todavía no hay publicaciones.</p>';
    document.getElementById('pizarra-pager').style.display = 'none';
    return;
  }

  const totalPaginas = Math.ceil(sp_novedades.length / PIZARRA_PAGE_SIZE);
  if (sp_paginaActual > totalPaginas) sp_paginaActual = 1;

  wirePager();
  renderPaginaActual();
}

function actualizarBadge(badge) {
  if (!badge) return;
  if (sp_unreadCount > 0) {
    badge.textContent = `${sp_unreadCount} sin leer`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

function wirePager() {
  if (sp_pagerWired) return;
  sp_pagerWired = true;
  document.getElementById('pizarra-pager-prev').addEventListener('click', () => {
    if (sp_paginaActual > 1) {
      sp_paginaActual--;
      renderPaginaActual();
    }
  });
  document.getElementById('pizarra-pager-next').addEventListener('click', () => {
    const totalPaginas = Math.ceil(sp_novedades.length / PIZARRA_PAGE_SIZE);
    if (sp_paginaActual < totalPaginas) {
      sp_paginaActual++;
      renderPaginaActual();
    }
  });
}

function renderPaginaActual() {
  const list = document.getElementById('pizarra-list');
  const pager = document.getElementById('pizarra-pager');
  const totalPaginas = Math.ceil(sp_novedades.length / PIZARRA_PAGE_SIZE);

  const inicio = (sp_paginaActual - 1) * PIZARRA_PAGE_SIZE;
  const pagina = sp_novedades.slice(inicio, inicio + PIZARRA_PAGE_SIZE);
  list.innerHTML = pagina.map(renderNovedad).join('');

  if (totalPaginas <= 1) {
    pager.style.display = 'none';
    return;
  }

  pager.style.display = '';
  document.getElementById('pizarra-pager-label').textContent = `Página ${sp_paginaActual} de ${totalPaginas}`;
  document.getElementById('pizarra-pager-prev').disabled = sp_paginaActual === 1;
  document.getElementById('pizarra-pager-next').disabled = sp_paginaActual === totalPaginas;
}

function renderNovedad(n) {
  const meta = [formatFecha(n.publicado_en), n.autor_nombre].filter(Boolean).join(' · ');
  const esNoLeida = !n.leida;
  return `
    <a
      class="pizarra-post ${esNoLeida ? 'pizarra-post--unread' : ''}"
      href="/pages/novedad.html?id=${encodeURIComponent(n.id)}"
    >
      <div class="pizarra-post__meta">
        <span class="tag">${escapeHtml(n.categoria)}</span>
        <span class="pizarra-post__date">${escapeHtml(meta)}</span>
        ${esNoLeida ? '<span class="pizarra-post__dot" aria-label="No leído" title="No leído"></span>' : ''}
      </div>
      <h3 class="pizarra-post__title">${escapeHtml(n.titulo)}</h3>
      <p class="pizarra-post__excerpt">${escapeHtml(truncar(n.cuerpo, PIZARRA_EXCERPT_LEN))}</p>
      <p class="pizarra-post__hint">Leer más</p>
    </a>
  `;
}

// Corta al espacio anterior al límite, para no partir una palabra al
// medio, y agrega "…". Si el texto ya entra completo, lo devuelve tal
// cual (no todo el mundo va a escribir novedades largas).
function truncar(texto, maxLen) {
  if (!texto || texto.length <= maxLen) return texto;
  const cortado = texto.slice(0, maxLen);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  return (ultimoEspacio > 40 ? cortado.slice(0, ultimoEspacio) : cortado) + '…';
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

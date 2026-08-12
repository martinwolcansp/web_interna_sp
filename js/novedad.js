/**
 * novedad.js — Pantalla de detalle de una novedad de la pizarra
 * (pages/novedad.html?id=<uuid>).
 *
 * Marca la novedad como leída automáticamente al acceder a esta pantalla
 * (si todavía no estaba leída) — a diferencia del feed del home, que
 * sólo muestra un extracto y no marca nada por su cuenta.
 *
 * Requiere supabase/rpc_home.sql (fn_novedad_detalle, fn_marcar_leida).
 */

document.addEventListener('sp:auth-ready', handleAuthReady);

async function handleAuthReady(e) {
  const gate = document.getElementById('novedad-gate');
  const content = document.getElementById('novedad-content');
  if (!gate || !content || !window.supabaseClient) return;

  const session = e.detail.session;

  if (!session) {
    showGate('Iniciá sesión para ver esta publicación.');
    return;
  }

  const id = new URLSearchParams(window.location.search).get('id');
  if (!id) {
    showGate('Falta indicar qué publicación mostrar.');
    return;
  }

  const { data: perfil, error: perfilError } = await window.supabaseClient
    .from('perfiles')
    .select('activo')
    .eq('id', session.user.id)
    .single();

  if (perfilError || !perfil) {
    showGate('No se pudo verificar tu acceso. Probá recargar la página.');
    console.error('[novedad.js] error cargando perfil', perfilError);
    return;
  }

  if (!perfil.activo) {
    showGate('Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.');
    return;
  }

  const { data, error } = await window.supabaseClient
    .rpc('fn_novedad_detalle', { p_novedad_id: id })
    .maybeSingle();

  if (error) {
    showGate('No se pudo cargar la publicación. Probá recargar la página.');
    console.error('[novedad.js] error cargando novedad', error);
    return;
  }

  if (!data) {
    showGate('No se encontró esta publicación, o no tenés acceso a ella.');
    return;
  }

  render(data);
  gate.style.display = 'none';
  content.style.display = '';

  if (!data.leida) {
    window.supabaseClient.rpc('fn_marcar_leida', { p_novedad_id: data.id }).catch(err => {
      console.error('[novedad.js] error marcando como leída', err);
    });
  }
}

function render(n) {
  document.title = `${n.titulo} — SP Seguridad`;
  document.getElementById('novedad-categoria').textContent = n.categoria || '';
  document.getElementById('novedad-fecha').textContent = formatFecha(n.publicado_en);
  document.getElementById('novedad-titulo').textContent = n.titulo;
  document.getElementById('novedad-autor').textContent = n.autor_nombre ? `Publicado por ${n.autor_nombre}` : '';
  document.getElementById('novedad-cuerpo').textContent = n.cuerpo;

  const areasEl = document.getElementById('novedad-areas');
  if (n.areas_nombres && n.areas_nombres.length > 0) {
    areasEl.textContent = `Dirigido a: ${n.areas_nombres.join(', ')}`;
    areasEl.style.display = '';
  }
}

function showGate(mensaje) {
  const gate = document.getElementById('novedad-gate');
  const content = document.getElementById('novedad-content');
  content.style.display = 'none';
  gate.style.display = '';
  gate.innerHTML = `
    <p>${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
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

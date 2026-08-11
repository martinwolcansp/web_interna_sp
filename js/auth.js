/**
 * auth.js — Login/logout con Google Workspace, pintado en el header.
 *
 * Se engancha al evento 'sp:header-loaded' que dispara components/header/header.js
 * una vez que el header (con el <div id="auth-area">) ya está en el DOM.
 *
 * Requiere que js/supabase-client.js ya haya corrido antes (window.supabaseClient).
 */

document.addEventListener('sp:header-loaded', initAuthArea);

async function initAuthArea() {
  const area = document.getElementById('auth-area');
  if (!area || !window.supabaseClient) return;

  renderLoading(area);

  const { data: { session } } = await window.supabaseClient.auth.getSession();
  renderAuthState(area, session);
  notifyAuthReady(session);

  // Repinta automáticamente ante login, logout o refresco de token.
  window.supabaseClient.auth.onAuthStateChange((_event, session) => {
    renderAuthState(area, session);
    notifyAuthReady(session);
  });
}

// Avisa al resto de los scripts de la página (ej. js/home.js) que ya se
// sabe si hay sesión o no, para que puedan cargar contenido según permisos.
function notifyAuthReady(session) {
  document.dispatchEvent(new CustomEvent('sp:auth-ready', { detail: { session } }));
}

function renderLoading(area) {
  area.innerHTML = '<span class="auth-loading">Cargando sesión…</span>';
}

function renderAuthState(area, session) {
  if (session && session.user) {
    const nombre = session.user.user_metadata?.full_name || session.user.email;
    area.innerHTML = `
      <span class="auth-user">${escapeHtml(nombre)}</span>
      <button id="btn-logout" class="btn btn--secondary" type="button">Cerrar sesión</button>
    `;
    document.getElementById('btn-logout').addEventListener('click', logout);
  } else {
    area.innerHTML = `
      <button id="btn-login" class="btn btn--secondary" type="button">
        <i class="ti ti-brand-google" aria-hidden="true"></i> Iniciar sesión con Google
      </button>
    `;
    document.getElementById('btn-login').addEventListener('click', login);
  }
}

async function login() {
  await window.supabaseClient.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.href }
  });
}

async function logout() {
  await window.supabaseClient.auth.signOut();
  window.location.reload();
}

// Evita inyectar HTML si el nombre/email trae caracteres raros.
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

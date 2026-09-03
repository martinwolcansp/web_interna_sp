/**
 * panel-admin.js — Punto de entrada único a las pantallas de
 * administración (Usuarios, Editor de la pizarra, Editor de fichas).
 *
 * Sólo decide qué tarjetas mostrar según permiso — cada pantalla sigue
 * teniendo su propio chequeo de acceso (admin.js / pizarra-editor.js /
 * fichas-editor.js) para el caso de que alguien entre directo por URL
 * sin pasar por acá. La seguridad real la da RLS, como siempre.
 */

document.addEventListener('sp:auth-ready', handleAuthReady);

async function handleAuthReady(e) {
  const gate = document.getElementById('pa-gate');
  const content = document.getElementById('pa-content');
  if (!gate || !content || !window.supabaseClient) return;

  if (e.detail.error) {
    showGate('No se pudo verificar tu sesión. Probá recargar la página.');
    console.error('[panel-admin.js] sp:auth-ready llegó con error', e.detail.error);
    return;
  }

  const session = e.detail.session;

  if (!session) {
    showGate('Iniciá sesión para acceder al panel de administración.');
    return;
  }

  // Ver nota equivalente en admin.js: sin este try/catch, una falla de
  // red de acá para abajo dejaba la pantalla sin gate y sin contenido.
  try {
    const { data: perfil, error } = await window.supabaseClient
      .from('perfiles')
      .select('activo, es_superadmin')
      .eq('id', session.user.id)
      .single();

    if (error || !perfil) {
      showGate('No se pudo verificar tu acceso. Probá recargar la página.');
      console.error('[panel-admin.js] error cargando perfil', error);
      return;
    }

    if (!perfil.activo) {
      showGate('Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.');
      return;
    }

    const accesos = await calcularAccesos(perfil);

    gate.style.display = 'none';
    content.style.display = '';

    renderCards(accesos);
  } catch (err) {
    showGate('No se pudo conectar. Probá recargar la página.');
    console.error('[panel-admin.js] error inesperado', err);
  }
}

async function calcularAccesos(perfil) {
  if (perfil.es_superadmin) {
    return { usuarios: true, pizarra: true, fichas: true };
  }

  const [pizarraRes, seccionesRes] = await Promise.all([
    window.supabaseClient.rpc('fn_tiene_permiso', { p_seccion_id: 'pizarra', p_nivel: 'editar' }),
    window.supabaseClient.rpc('fn_mis_secciones_editables')
  ]);

  return {
    usuarios: false, // sólo superadmin
    pizarra: !!pizarraRes.data,
    fichas: !!(seccionesRes.data && seccionesRes.data.length > 0)
  };
}

function renderCards(accesos) {
  const cardsWrap = document.getElementById('pa-cards');
  const emptyMsg = document.getElementById('pa-empty');

  const tarjetas = [
    {
      permitido: accesos.usuarios,
      href: '/pages/admin.html',
      icon: 'ti-users',
      title: 'Usuarios',
      desc: 'Alta y edición de cuentas: área, nivel, legajo y permisos de superadministrador.'
    },
    {
      permitido: accesos.pizarra,
      href: '/pages/pizarra-editor.html',
      icon: 'ti-news',
      title: 'Editor de la pizarra',
      desc: 'Publicar novedades, elegir a qué áreas van dirigidas, y gestionar las categorías.'
    },
    {
      permitido: accesos.fichas,
      href: '/pages/fichas-editor.html',
      icon: 'ti-file-description',
      title: 'Editor de fichas de producto',
      desc: 'Contenido de las fichas de Mapa de Servicios y Sector Comunicaciones, por versión.'
    }
  ].filter(t => t.permitido);

  if (tarjetas.length === 0) {
    cardsWrap.style.display = 'none';
    emptyMsg.style.display = '';
    return;
  }

  cardsWrap.innerHTML = tarjetas.map(t => `
    <a class="pa-card" href="${t.href}">
      <div class="pa-card__icon"><i class="ti ${t.icon}" aria-hidden="true"></i></div>
      <div class="pa-card__title">${t.title}</div>
      <p class="pa-card__desc">${t.desc}</p>
      <span class="pa-card__cta">Entrar <i class="ti ti-arrow-right" aria-hidden="true"></i></span>
    </a>
  `).join('');
}

function showGate(mensaje) {
  const gate = document.getElementById('pa-gate');
  const content = document.getElementById('pa-content');
  content.style.display = 'none';
  gate.style.display = '';
  gate.innerHTML = `
    <p>${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
  `;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

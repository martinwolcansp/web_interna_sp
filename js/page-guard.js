/**
 * page-guard.js — Corte del lado del navegador para páginas ligadas a un
 * mosaico con permiso (Mapa de Servicios, Sector Comunicaciones,
 * Directorio de Áreas).
 *
 * IMPORTANTE — esto NO es la seguridad real, es un parche de navegación:
 * mientras el contenido de estas páginas siga siendo HTML estático (no
 * datos servidos desde Supabase), alguien que mire el código fuente o
 * desactive JS todavía puede ver el HTML completo. La protección real
 * llega cuando el contenido se migre a la base de datos (Fase 4 de la
 * propuesta) y quede detrás de las políticas RLS, igual que ya pasa con
 * la pizarra y los datos de permisos. Ver Propuesta_Proyecto_Auth_Roles_CMS.docx,
 * sección 2 ("cualquier control de acceso implementado solo en el
 * navegador... no es seguridad real").
 *
 * Uso: definir window.SP_SECCION_ID con el id de supabase/seed_secciones.sql
 * ANTES de cargar este script, ej.:
 *   <script>window.SP_SECCION_ID = 'mapa-servicios';</script>
 *   <script src="/js/page-guard.js"></script>
 * (después de js/auth.js, no importa el orden exacto porque es por evento).
 */

document.addEventListener('sp:auth-ready', async (e) => {
  const seccionId = window.SP_SECCION_ID;
  if (!seccionId || !window.supabaseClient) return;

  const session = e.detail.session;

  if (!session) {
    denyAccess('Iniciá sesión para ver esta sección.');
    return;
  }

  const { data: perfil, error: perfilError } = await window.supabaseClient
    .from('perfiles')
    .select('activo, es_superadmin')
    .eq('id', session.user.id)
    .single();

  if (perfilError || !perfil) {
    denyAccess('No se pudo verificar tu acceso. Probá recargar la página.');
    console.error('[page-guard.js] error cargando perfil', perfilError);
    return;
  }

  if (!perfil.activo) {
    denyAccess('Tu cuenta todavía no fue activada. Pedile a un administrador que te asigne área y permisos.');
    return;
  }

  if (perfil.es_superadmin) return; // acceso total, no hace falta chequear permiso puntual

  const { data: tienePermiso, error: permisoError } = await window.supabaseClient
    .rpc('fn_tiene_permiso', { p_seccion_id: seccionId, p_nivel: 'ver' });

  if (permisoError) {
    denyAccess('No se pudo verificar tu permiso. Probá recargar la página.');
    console.error('[page-guard.js] error chequeando permiso', permisoError);
    return;
  }

  if (!tienePermiso) {
    denyAccess('No tenés permiso para ver esta sección. Pedile a un administrador que te lo habilite.');
  }
});

function denyAccess(mensaje) {
  // Oculta todo el contenido ya insertado en <body> (sea <main> u otra
  // estructura, cada página arma la suya distinto), preservando el
  // header/breadcrumb ya cargados, y muestra el aviso en su lugar.
  const header = document.querySelector('.site-header');
  const breadcrumb = document.querySelector('.breadcrumb');

  Array.from(document.body.children).forEach((el) => {
    if (el === header || el === breadcrumb || el.tagName === 'SCRIPT') return;
    el.style.display = 'none';
  });

  const box = document.createElement('div');
  box.style.cssText = 'max-width:480px;margin:4rem auto;text-align:center;padding:0 1.5rem;';
  box.innerHTML = `
    <p style="color:#6b7280;font-size:15px;line-height:1.5;">${escapeHtml(mensaje)}</p>
    <a href="/index.html" class="btn btn--secondary" style="display:inline-flex;margin-top:1rem;">Volver al inicio</a>
  `;
  document.body.appendChild(box);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

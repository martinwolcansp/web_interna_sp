/* ============================================================
   clientes-activos.js — Mosaico "Clientes activos".

   pages/clientes-activos.html: una pestaña por informe (solo las que
   el usuario puede ver) y el informe elegido en un iframe con alto
   automático (pages/clientes-activos/<archivo>). La pestaña elegida
   queda en el hash (#segmentacion / #bajas).

   Cada informe tiene su propia sección de permisos (clientes-<id>).
   La seguridad real la dan las políticas RLS de las tablas cli_*
   (ver supabase/migracion_42_clientes_activos.sql).
   ============================================================ */

'use strict';

window.CLIENTES_INFORMES = [
  { id: 'segmentacion', label: 'Segmentación Clientes', archivo: 'segmentacion.html', seccion: 'clientes-segmentacion', icono: 'ti-users-group' },
  { id: 'bajas', label: 'Análisis Bajas', archivo: 'bajas.html', seccion: 'clientes-bajas', icono: 'ti-user-minus' },
];

function clientesEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Alto del iframe = alto real del contenido (mismo origen).
function ajustarAltoClientes() {
  const frame = document.getElementById('clientes-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

let _clientesVisibles = [];

function abrirInformeClientes(id) {
  const inf = _clientesVisibles.find(i => i.id === id) || _clientesVisibles[0];
  if (!inf) return;
  document.querySelectorAll('#clientes-tabs .section-tab').forEach(b => {
    const activo = b.dataset.id === inf.id;
    b.classList.toggle('is-active', activo);
    b.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
  if (location.hash !== '#' + inf.id) history.replaceState(null, '', '#' + inf.id);
  document.title = `${inf.label} — Clientes activos — SP Seguridad`;
  const frame = document.getElementById('clientes-frame');
  // ?v= evita que el navegador muestre una versión vieja después de un deploy.
  frame.src = 'clientes-activos/' + inf.archivo + '?v=' + Date.now();
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('clientes-frame');
  if (!frame) return;
  frame.addEventListener('load', () => {
    ajustarAltoClientes();
    try {
      new ResizeObserver(ajustarAltoClientes).observe(frame.contentDocument.body);
    } catch (e) {
      // Sin ResizeObserver el informe se ve igual, solo sin auto-ajuste posterior.
    }
  });
});

// Se arma una sola vez ('sp:auth-ready' se repite ante cada cambio de sesión).
let _clientesArmado = false;
document.addEventListener('sp:auth-ready', async (e) => {
  if (_clientesArmado || !e.detail.session || !window.supabaseClient) return;
  _clientesArmado = true;

  const informes = window.CLIENTES_INFORMES;
  const permisos = await Promise.all(informes.map(i =>
    window.supabaseClient.rpc('fn_tiene_permiso', { p_seccion_id: i.seccion, p_nivel: 'ver' })
  ));
  _clientesVisibles = informes.filter((i, k) => permisos[k] && permisos[k].data === true);

  document.getElementById('clientes-cargando').hidden = true;
  if (!_clientesVisibles.length) {
    document.getElementById('clientes-vacio').hidden = false;
    return;
  }
  const tabs = document.getElementById('clientes-tabs');
  tabs.innerHTML = _clientesVisibles.map(i => `
    <button type="button" class="section-tab" role="tab" data-id="${clientesEsc(i.id)}" aria-selected="false">
      <i class="ti ${clientesEsc(i.icono)}" aria-hidden="true"></i>${clientesEsc(i.label)}
    </button>`).join('');
  tabs.hidden = false;
  tabs.addEventListener('click', ev => {
    const b = ev.target.closest('.section-tab');
    if (b) abrirInformeClientes(b.dataset.id);
  });
  document.getElementById('clientes-frame-wrap').hidden = false;
  abrirInformeClientes((location.hash || '').replace('#', ''));
});

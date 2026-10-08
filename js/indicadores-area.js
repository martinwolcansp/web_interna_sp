/* ============================================================
   indicadores-area.js — Mosaico "Indicadores por Área".

   Dos páginas usan este archivo:
   - pages/indicadores-area.html: un mosaico por área (solo las que
     el usuario puede ver).
   - pages/indicadores-area/area.html?id=<area>: el área elegida en un
     iframe con alto automático (pages/indicadores-area/<archivo>).

   Cada área tiene su propia sección de permisos (indicadores-<area>).
   La seguridad real la dan las políticas RLS de las tablas
   ind_<area>_* (ver supabase/migracion_21_*).

   Para sumar un área: agregar una entrada a INDICADORES_AREAS y crear
   pages/indicadores-area/<area>.html.
   ============================================================ */

'use strict';

window.INDICADORES_AREAS = [
  {
    id: 'posventa',
    label: 'Posventa',
    archivo: 'posventa.html',
    seccion: 'indicadores-posventa',
    icono: 'ti-tool',
    descripcion: 'Relevamientos posventa, instalaciones finalizadas y encuestas de satisfacción.',
  },
];

function indicadoresAreaActual() {
  const id = new URLSearchParams(location.search).get('id');
  return (window.INDICADORES_AREAS || []).find(a => a.id === id) || null;
}

function indicadoresEsc(s) {
  return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------
// Página del área: permiso, breadcrumb y título se definen antes de
// que carguen page-guard.js y header.js (este script va antes).
// ---------------------------------------------------------------
(function prepararPaginaArea() {
  if (document.body.dataset.indicadores !== 'area') return;
  const area = indicadoresAreaActual();
  // Sin área válida, el control de acceso es el del mosaico.
  window.SP_SECCION_ID = area ? area.seccion : 'indicadores-area';
  const header = document.getElementById('site-header');
  if (header) {
    header.dataset.breadcrumb = JSON.stringify([
      { label: 'Inicio', href: '/index.html' },
      { label: 'Indicadores por Área', href: '/pages/indicadores-area.html' },
      { label: area ? area.label : 'Área desconocida' },
    ]);
  }
  if (area) document.title = `Indicadores de ${area.label} — SP Seguridad`;
})();

// Alto del iframe = alto real del contenido (mismo origen).
function ajustarAltoIndicadores() {
  const frame = document.getElementById('indicadores-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('indicadores-frame');
  if (frame) {
    const area = indicadoresAreaActual();
    if (!area) {
      document.getElementById('indicadores-frame-wrap').hidden = true;
      document.getElementById('indicadores-vacio').hidden = false;
      return;
    }
    frame.addEventListener('load', () => {
      ajustarAltoIndicadores();
      try {
        new ResizeObserver(ajustarAltoIndicadores).observe(frame.contentDocument.body);
      } catch (e) {
        // Sin ResizeObserver el área se ve igual, solo sin auto-ajuste posterior.
      }
    });
    // Una sola carga (no depende de 'sp:auth-ready', que se dispara varias
    // veces y haría recargar el iframe en ciclo). El permiso lo controlan
    // page-guard.js en esta página y la propia página del área.
    frame.src = area.archivo;
    return;
  }

  // Compatibilidad con los enlaces anteriores (indicadores-area.html#posventa).
  const pedida = (location.hash || '').replace('#', '');
  if (pedida && (window.INDICADORES_AREAS || []).some(a => a.id === pedida)) {
    location.replace('indicadores-area/area.html?id=' + encodeURIComponent(pedida));
  }
});

// ---------------------------------------------------------------
// Página del mosaico: un mosaico por área visible.
// Se arma una sola vez ('sp:auth-ready' se repite ante cada cambio de sesión).
// ---------------------------------------------------------------
let _indicadoresMosaicosArmados = false;
document.addEventListener('sp:auth-ready', async (e) => {
  const grid = document.getElementById('indicadores-grid');
  if (!grid || _indicadoresMosaicosArmados || !e.detail.session || !window.supabaseClient) return;
  _indicadoresMosaicosArmados = true;

  const areas = window.INDICADORES_AREAS || [];
  const permisos = await Promise.all(areas.map(a =>
    window.supabaseClient.rpc('fn_tiene_permiso', { p_seccion_id: a.seccion, p_nivel: 'ver' })
  ));
  const visibles = areas.filter((a, i) => permisos[i] && permisos[i].data === true);

  document.getElementById('indicadores-cargando').hidden = true;
  if (visibles.length === 0) {
    document.getElementById('indicadores-vacio').hidden = false;
    return;
  }
  grid.innerHTML = visibles.map(a => `
    <a class="home-card" href="indicadores-area/area.html?id=${encodeURIComponent(a.id)}">
      <div class="home-card__icon" aria-hidden="true"><i class="ti ${indicadoresEsc(a.icono)}"></i></div>
      <div>
        <div class="home-card__name">${indicadoresEsc(a.label)}</div>
        <p class="home-card__desc">${indicadoresEsc(a.descripcion)}</p>
      </div>
      <span class="home-card__badge home-card__badge--new">Disponible</span>
    </a>
  `).join('');
});

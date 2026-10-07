/* ============================================================
   indicadores-area.js — Mosaico "Indicadores por Área".
   Selector de área (mismo patrón que el selector de período de
   Informes de MKT) + la página del área en un iframe con alto
   automático. Cada área tiene su propia sección de permisos
   (indicadores-<area>): el selector muestra solo las áreas que el
   usuario puede ver. La seguridad real la dan las políticas RLS de
   las tablas ind_<area>_* (ver supabase/migracion_21_*).

   Para sumar un área: agregar una entrada a INDICADORES_AREAS y
   crear pages/indicadores-area/<area>.html.
   ============================================================ */

'use strict';

window.INDICADORES_AREAS = [
  { id: 'posventa', label: 'Posventa', archivo: 'posventa.html', seccion: 'indicadores-posventa' },
];

let _indicadoresAreasVisibles = [];

function setIndicadoresArea(areaId) {
  const area = _indicadoresAreasVisibles.find(a => a.id === areaId);
  if (!area) return;
  updateIndicadoresAreaSelectorUI(areaId);
  closeIndicadoresAreaDropdown();
  const frame = document.getElementById('indicadores-frame');
  if (frame) frame.src = 'indicadores-area/' + area.archivo + '?v=' + Date.now();
  try { history.replaceState(null, '', '#' + area.id); } catch (e) { /* sin hash, no pasa nada */ }
}

function updateIndicadoresAreaSelectorUI(activeId) {
  const dropdown = document.getElementById('area-dropdown');
  const label = document.getElementById('area-current-label');
  if (dropdown) {
    dropdown.innerHTML = _indicadoresAreasVisibles.map(a => {
      const isActive = a.id === activeId;
      return `
        <li class="version-selector__item${isActive ? ' is-active' : ''}"
            data-area="${a.id}" role="option"
            aria-selected="${isActive ? 'true' : 'false'}"
            onclick="setIndicadoresArea('${a.id}')">
          <span class="version-selector__item-label">${a.label}</span>
        </li>
      `;
    }).join('');
  }
  const activa = _indicadoresAreasVisibles.find(a => a.id === activeId);
  if (label && activa) label.textContent = activa.label;
}

function toggleIndicadoresAreaDropdown() {
  const dropdown = document.getElementById('area-dropdown');
  const btn = document.getElementById('area-btn');
  if (!dropdown || !btn) return;
  const isOpen = dropdown.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeIndicadoresAreaDropdown() {
  const dropdown = document.getElementById('area-dropdown');
  const btn = document.getElementById('area-btn');
  if (dropdown) dropdown.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#area-selector')) closeIndicadoresAreaDropdown();
});

// Alto del iframe = alto real del contenido (mismo origen).
function ajustarAltoIndicadores() {
  const frame = document.getElementById('indicadores-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('indicadores-frame');
  if (!frame) return;
  frame.addEventListener('load', () => {
    ajustarAltoIndicadores();
    try {
      new ResizeObserver(ajustarAltoIndicadores).observe(frame.contentDocument.body);
    } catch (e) {
      // Sin ResizeObserver el área se ve igual, solo sin auto-ajuste posterior.
    }
  });
});

// Áreas visibles según permiso (superadmin ve todas: fn_tiene_permiso lo contempla).
document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session || !window.supabaseClient) return;
  const areas = window.INDICADORES_AREAS || [];
  const permisos = await Promise.all(areas.map(a =>
    window.supabaseClient.rpc('fn_tiene_permiso', { p_seccion_id: a.seccion, p_nivel: 'ver' })
  ));
  _indicadoresAreasVisibles = areas.filter((a, i) => permisos[i] && permisos[i].data === true);

  if (_indicadoresAreasVisibles.length === 0) {
    document.getElementById('area-selector').hidden = true;
    document.getElementById('indicadores-frame-wrap').hidden = true;
    document.getElementById('indicadores-vacio').hidden = false;
    return;
  }
  const pedida = (location.hash || '').replace('#', '');
  const inicial = _indicadoresAreasVisibles.find(a => a.id === pedida) || _indicadoresAreasVisibles[0];
  setIndicadoresArea(inicial.id);
});

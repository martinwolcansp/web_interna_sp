/* ============================================================
   informes-mkt.js — Lógica de "Informes e indicadores de MKT"
   Selector de período (mismo patrón visual que el selector de
   versión de Mapa de Servicios/Fichas) + carga del informe elegido
   en un iframe, con ajuste automático de alto.
   Sin datos propios: el contenido vive en pages/informes-mkt/*.html,
   listado en js/versiones/informes-mkt.js.
   ============================================================ */

'use strict';

let _informesMktPeriodoActual = null;

function setInformesMktPeriodo(periodoId) {
  const periodos = window.INFORMES_MKT_PERIODOS || [];
  const periodo = periodos.find(p => p.id === periodoId);
  if (!periodo) return;

  _informesMktPeriodoActual = periodoId;
  updateInformesMktSelectorUI(periodoId);
  closeInformesMktDropdown();

  const frame = document.getElementById('informes-mkt-frame');
  if (frame) frame.src = 'informes-mkt/' + periodo.archivo + '?v=' + Date.now();
}

function updateInformesMktSelectorUI(activeId) {
  const periodos = window.INFORMES_MKT_PERIODOS || [];
  const dropdown = document.getElementById('periodo-dropdown');
  const label    = document.getElementById('periodo-current-label');

  if (dropdown) {
    dropdown.innerHTML = periodos.map(p => {
      const isActive = p.id === activeId;
      return `
        <li class="version-selector__item${isActive ? ' is-active' : ''}"
            data-periodo="${p.id}" role="option"
            aria-selected="${isActive ? 'true' : 'false'}"
            onclick="setInformesMktPeriodo('${p.id}')">
          <span class="version-selector__item-label">${p.label}</span>
        </li>
      `;
    }).join('');
  }

  const activo = periodos.find(p => p.id === activeId);
  if (label && activo) label.textContent = activo.label;
}

function toggleInformesMktDropdown() {
  const dropdown = document.getElementById('periodo-dropdown');
  const btn      = document.getElementById('periodo-btn');
  if (!dropdown || !btn) return;
  const isOpen = dropdown.classList.toggle('is-open');
  btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

function closeInformesMktDropdown() {
  const dropdown = document.getElementById('periodo-dropdown');
  const btn      = document.getElementById('periodo-btn');
  if (dropdown) dropdown.classList.remove('is-open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

// Cierra el dropdown al hacer click afuera (mismo comportamiento que el
// selector de versión de mapa-servicios.js).
document.addEventListener('click', (e) => {
  if (!e.target.closest('#periodo-selector')) closeInformesMktDropdown();
});

// El informe es un HTML propio (mismo origen), así que se puede leer su
// altura real y ajustar el iframe para que no quede con scroll interno
// ni espacio vacío. Se reintenta en 'load' y en un resize del contenido
// vía ResizeObserver, por si el informe carga contenido asincrónico.
function ajustarAltoIframe() {
  const frame = document.getElementById('informes-mkt-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  const periodos = window.INFORMES_MKT_PERIODOS || [];
  if (periodos.length === 0) return;

  const frame = document.getElementById('informes-mkt-frame');
  if (frame) {
    frame.addEventListener('load', () => {
      ajustarAltoIframe();
      try {
        new ResizeObserver(ajustarAltoIframe).observe(frame.contentDocument.body);
      } catch (e) {
        // Si el navegador no puede observar (raro, cross-origin ya
        // descartado porque es mismo origen), no rompe nada: el informe
        // sigue viéndose, sólo sin auto-ajuste ante cambios posteriores.
      }
    });
  }

  setInformesMktPeriodo(periodos[0].id);
});

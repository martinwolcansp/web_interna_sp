/* ============================================================
   comunicacion-receptoras.js — Vista general del mosaico
   "Comunicación Receptoras": arma una tarjeta de resumen por cada
   receptora listada en js/versiones/comunicacion-receptoras.js,
   con sus datos básicos (clientes, señales, período) y un link al
   informe completo de esa receptora.
   ============================================================ */

'use strict';

function fmtNumeroCR(n) {
  return new Intl.NumberFormat('es-AR').format(n);
}

document.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('cr-cards');
  if (!el) return;

  const receptoras = window.COMUNICACION_RECEPTORAS || [];
  if (receptoras.length === 0) {
    el.innerHTML = '<p class="cr-empty">Todavía no hay informes cargados.</p>';
    return;
  }

  el.innerHTML = receptoras.map(r => `
    <a class="cr-card" href="${r.href}">
      <div class="cr-card__header">
        <span class="cr-card__nombre">${r.nombre}</span>
        <span class="cr-card__via">${r.via}</span>
      </div>
      <p class="cr-card__periodo">${r.periodo}</p>
      <div class="cr-card__stats">
        <div class="cr-stat">
          <span class="cr-stat__value">${fmtNumeroCR(r.clientes)}</span>
          <span class="cr-stat__label">clientes comunicados</span>
        </div>
        <div class="cr-stat">
          <span class="cr-stat__value">${fmtNumeroCR(r.senales)}</span>
          <span class="cr-stat__label">señales registradas</span>
        </div>
      </div>
      <p class="cr-card__link">Ver informe completo <i class="ti ti-arrow-right" aria-hidden="true"></i></p>
    </a>
  `).join('');
});

/* ============================================================
   ficha.js — Lógica de la Ficha de Producto
   Manejo de tabs internos y FAQ accordion.
   ============================================================ */

'use strict';


/* ── SECTION TABS ────────────────────────────────────────── */

/**
 * Activa una sección interna de la ficha.
 * @param {string} sectionName - ID de la sección
 * @param {HTMLElement} activeTab - Tab clickeado
 */
function showFichaSection(sectionName, activeTab) {
  document.querySelectorAll('.section-panel').forEach(panel => {
    panel.classList.remove('is-active');
  });
  document.querySelectorAll('.section-tab').forEach(tab => {
    tab.classList.remove('is-active');
  });

  document.getElementById('sec-' + sectionName).classList.add('is-active');
  activeTab.classList.add('is-active');
}


/* ── FAQ ACCORDION ───────────────────────────────────────── */

/**
 * Abre o cierra un item del FAQ.
 * @param {HTMLElement} faqItem - El elemento .faq-item clickeado
 */
function toggleFaq(faqItem) {
  faqItem.classList.toggle('is-open');
}

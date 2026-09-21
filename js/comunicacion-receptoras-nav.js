/* ============================================================
   comunicacion-receptoras-nav.js — Menú de subsecciones de
   "Comunicación Receptoras". Se dibuja dentro de
   <nav id="cr-subnav" data-active="general|receptoras|incomunicados">.
   ============================================================ */

'use strict';

(function () {
  const ITEMS = [
    { id: 'general',       label: 'Informe general receptoras', href: '/pages/comunicacion-receptoras.html' },
    { id: 'receptoras',    label: 'Receptoras',                 href: '/pages/comunicacion-receptoras/receptoras.html' },
    { id: 'incomunicados', label: 'Incomunicados',              href: '/pages/comunicacion-receptoras/incomunicados.html' },
  ];

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('cr-subnav');
    if (!nav) return;
    const activo = nav.dataset.active;
    nav.setAttribute('aria-label', 'Subsecciones de Comunicación Receptoras');
    nav.innerHTML = ITEMS.map(it =>
      `<a class="cr-subnav__link${it.id === activo ? ' is-active' : ''}" href="${it.href}"${it.id === activo ? ' aria-current="page"' : ''}>${it.label}</a>`
    ).join('');
  });
})();

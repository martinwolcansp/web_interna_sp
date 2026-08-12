/* ============================================================
   sector-comunicaciones.js — Arranque de la página del piloto
   Sector Comunicaciones (Nuevas Tecnologías / Comodato).
   Página de una sola ficha: no hay mapa de segmentos que navegar,
   así que se renderiza directo al cargar.
   ============================================================ */

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  // El contenido ahora llega de Supabase de forma asíncrona (ver
  // js/fichas-data-loader.js) — antes los <script> estáticos ya estaban
  // listos en este punto, ahora hace falta esperar la promesa.
  await (window.SP_FICHAS_READY || Promise.resolve());
  renderFichaById('nuevas-tecnologias');
});

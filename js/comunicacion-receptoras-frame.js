/* ============================================================
   comunicacion-receptoras-frame.js — Script genérico compartido
   por las páginas wrapper de cada receptora (bosch.html,
   nanocomm.html, y las que se vayan agregando): sólo ajuste
   automático de alto del iframe #receptora-frame, sin lógica
   propia de cada informe.
   ============================================================ */

'use strict';

function ajustarAltoIframeReceptora() {
  const frame = document.getElementById('receptora-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('receptora-frame');
  if (!frame) return;

  frame.addEventListener('load', () => {
    ajustarAltoIframeReceptora();
    try {
      new ResizeObserver(ajustarAltoIframeReceptora).observe(frame.contentDocument.body);
    } catch (e) {
      // Si el navegador no puede observar (raro, cross-origin ya
      // descartado porque es mismo origen), no rompe nada: el informe
      // sigue viéndose, sólo sin auto-ajuste ante cambios posteriores.
    }
  });
});

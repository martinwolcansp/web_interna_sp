/* ============================================================
   comunicacion-receptoras.js — Lógica de "Comunicación Receptoras".
   Análisis puntual, sin selector de período (a diferencia de
   informes-mkt.js): un único iframe con ajuste automático de alto.
   Si en el futuro este informe pasa a actualizarse periódicamente,
   migrar a un manifiesto tipo js/versiones/informes-mkt.js.
   ============================================================ */

'use strict';

// El informe es un HTML propio (mismo origen), así que se puede leer su
// altura real y ajustar el iframe para que no quede con scroll interno
// ni espacio vacío. Se reintenta en 'load' y en un resize del contenido
// vía ResizeObserver, por si el informe carga contenido asincrónico.
function ajustarAltoIframeComunicacionReceptoras() {
  const frame = document.getElementById('comunicacion-receptoras-frame');
  if (!frame || !frame.contentDocument) return;
  const alto = frame.contentDocument.documentElement.scrollHeight;
  if (alto) frame.style.height = alto + 'px';
}

document.addEventListener('DOMContentLoaded', () => {
  const frame = document.getElementById('comunicacion-receptoras-frame');
  if (!frame) return;

  frame.addEventListener('load', () => {
    ajustarAltoIframeComunicacionReceptoras();
    try {
      new ResizeObserver(ajustarAltoIframeComunicacionReceptoras).observe(frame.contentDocument.body);
    } catch (e) {
      // Si el navegador no puede observar (raro, cross-origin ya
      // descartado porque es mismo origen), no rompe nada: el informe
      // sigue viéndose, sólo sin auto-ajuste ante cambios posteriores.
    }
  });
});

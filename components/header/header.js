/**
 * header.js — Loader del componente site-header
 *
 * Uso: colocar en el HTML un placeholder con los textos como data-attributes:
 *
 *   <div id="site-header"
 *     data-sub="Intranet — Uso Interno"
 *     data-title="Portal Interno"
 *     data-subtitle="SP Seguridad Privada SA">
 *   </div>
 *   <script src="/components/header/header.js"></script>
 */

(function loadHeader() {
  const placeholder = document.getElementById('site-header');
  if (!placeholder) return;

  const sub      = placeholder.dataset.sub      || 'Intranet — Uso Interno';
  const title    = placeholder.dataset.title    || 'Portal Interno';
  const subtitle = placeholder.dataset.subtitle || 'SP Seguridad Privada SA';

  fetch('/components/header/header.html')
    .then(res => {
      if (!res.ok) throw new Error('No se pudo cargar el header');
      return res.text();
    })
    .then(html => {
      const filled = html
        .replace('{{sub}}',      sub)
        .replace('{{title}}',    title)
        .replace('{{subtitle}}', subtitle);

      placeholder.outerHTML = filled;
    })
    .catch(err => console.error('[header.js]', err));
})();

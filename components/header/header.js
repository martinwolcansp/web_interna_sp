/**
 * header.js — Loader del componente site-header + breadcrumb automático
 *
 * Uso básico (sin breadcrumb):
 *
 *   <div id="site-header"
 *     data-sub="Intranet — Uso Interno"
 *     data-title="Portal Interno"
 *     data-subtitle="SP Seguridad Privada SA">
 *   </div>
 *   <script src="/components/header/header.js"></script>
 *
 * Con breadcrumb (JSON array de ítems, último sin href = página actual):
 *
 *   <div id="site-header"
 *     data-title="Mapa de Servicios"
 *     data-breadcrumb='[{"label":"Inicio","href":"/index.html"},{"label":"Mapa de Servicios"}]'>
 *   </div>
 */

(function loadHeader() {
  const placeholder = document.getElementById('site-header');
  if (!placeholder) return;

  const sub        = placeholder.dataset.sub      || 'Intranet — Uso Interno';
  const title      = placeholder.dataset.title    || 'Portal Interno';
  const subtitle   = placeholder.dataset.subtitle || 'SP Seguridad Privada SA';
  const breadcrumb = placeholder.dataset.breadcrumb || null;

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

      // Insertar header en el DOM
      placeholder.insertAdjacentHTML('beforebegin', filled);

      // Generar breadcrumb si se definió
      if (breadcrumb) {
        let items;
        try {
          items = JSON.parse(breadcrumb);
        } catch (e) {
          console.error('[header.js] data-breadcrumb inválido:', e);
          placeholder.remove();
          return;
        }

        const nav = document.createElement('nav');
        nav.className = 'breadcrumb';
        nav.setAttribute('aria-label', 'Navegación de retorno');

        items.forEach((item, index) => {
          const isLast = index === items.length - 1;

          if (index === 0 && item.href) {
            // Primer ítem: incluye ícono de flecha
            const a = document.createElement('a');
            a.className = 'breadcrumb__link';
            a.href = item.href;
            a.innerHTML = '<i class="ti ti-arrow-left" aria-hidden="true"></i> ' + item.label;
            nav.appendChild(a);
          } else if (!isLast && item.href) {
            // Ítem intermedio con enlace
            const sep = document.createElement('span');
            sep.className = 'breadcrumb__sep';
            sep.setAttribute('aria-hidden', 'true');
            sep.textContent = '/';
            nav.appendChild(sep);

            const a = document.createElement('a');
            a.className = 'breadcrumb__link';
            a.href = item.href;
            a.textContent = item.label;
            nav.appendChild(a);
          } else {
            // Último ítem: página actual (sin enlace)
            const sep = document.createElement('span');
            sep.className = 'breadcrumb__sep';
            sep.setAttribute('aria-hidden', 'true');
            sep.textContent = '/';
            nav.appendChild(sep);

            const span = document.createElement('span');
            span.className = 'breadcrumb__current';
            span.setAttribute('aria-current', 'page');
            span.textContent = item.label;
            nav.appendChild(span);
          }
        });

        placeholder.insertAdjacentElement('beforebegin', nav);
      }

      placeholder.remove();
    })
    .catch(err => console.error('[header.js]', err));
})();

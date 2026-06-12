/**
 * header.js — Loader del componente site-header + breadcrumb automático
 *
 * Uso sin breadcrumb (home u otras páginas raíz):
 *
 *   <div id="site-header"></div>
 *   <script src="/components/header/header.js"></script>
 *
 * Con breadcrumb (JSON array; último ítem sin href = página actual):
 *
 *   <div id="site-header"
 *     data-breadcrumb='[{"label":"Inicio","href":"/index.html"},{"label":"Mapa de Servicios"}]'>
 *   </div>
 *   <script src="/components/header/header.js"></script>
 */

(function loadHeader() {
  const placeholder = document.getElementById('site-header');
  if (!placeholder) return;

  const breadcrumb = placeholder.dataset.breadcrumb || null;

  fetch('/components/header/header.html')
    .then(res => {
      if (!res.ok) throw new Error('No se pudo cargar el header');
      return res.text();
    })
    .then(html => {
      placeholder.insertAdjacentHTML('beforebegin', html);

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
          const isFirst = index === 0;
          const isLast  = index === items.length - 1;

          if (!isFirst) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb__sep';
            sep.setAttribute('aria-hidden', 'true');
            sep.textContent = '/';
            nav.appendChild(sep);
          }

          if (isLast) {
            const span = document.createElement('span');
            span.className = 'breadcrumb__current';
            span.setAttribute('aria-current', 'page');
            span.textContent = item.label;
            nav.appendChild(span);
          } else {
            const a = document.createElement('a');
            a.className = 'breadcrumb__link';
            a.href = item.href;
            if (isFirst) {
              a.innerHTML = '<i class="ti ti-arrow-left" aria-hidden="true"></i> ' + item.label;
            } else {
              a.textContent = item.label;
            }
            nav.appendChild(a);
          }
        });

        placeholder.insertAdjacentElement('beforebegin', nav);
      }

      placeholder.remove();
    })
    .catch(err => console.error('[header.js]', err));
})();

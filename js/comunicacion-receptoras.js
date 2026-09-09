/* ============================================================
   comunicacion-receptoras.js — Vista general del mosaico
   "Comunicación Receptoras".

   Dos bloques, ambos derivados de js/versiones/comunicacion-receptoras.js
   (window.COMUNICACION_RECEPTORAS) — no hay nada hardcodeado acá, así
   que agregar una receptora al manifiesto alcanza para que el resumen
   se recalcule solo:

   1. Resumen general (#cr-summary): KPIs agregados (receptoras
      cargadas, clientes comunicados, señales registradas) + un
      gráfico de barras con la distribución combinada de señales por
      tipo de evento, sumando el cat_counts de todas las receptoras.
   2. Tarjetas por receptora (#cr-cards): una por cada entrada del
      manifiesto, con link al informe completo.
   ============================================================ */

'use strict';

const CR_CAT_META = {
  apertura_cierre: {label:'Apertura / Cierre',              color:'var(--cr-cat-ap)'},
  test:            {label:'Test periódico',                 color:'var(--cr-cat-test)'},
  falla_comunicacion: {label:'Falla de comunicación',       color:'var(--cr-cat-fcom)'},
  alarma:          {label:'Alarma',                         color:'var(--cr-cat-alarma)'},
  restauracion:    {label:'Restauración',                   color:'var(--cr-cat-rest)'},
  falla_energia:   {label:'Falla de energía / batería',     color:'var(--cr-cat-fenerg)'},
  anulacion:       {label:'Anulación de zona',               color:'var(--cr-cat-anu)'},
  otros:           {label:'Otros',                          color:'var(--cr-cat-otros)'},
};
const CR_CAT_ORDER = ['apertura_cierre','test','falla_comunicacion','alarma','restauracion','falla_energia','anulacion','otros'];

function fmtNumeroCR(n) {
  return new Intl.NumberFormat('es-AR').format(n);
}

function renderResumenGeneral(receptoras) {
  const kpisEl = document.getElementById('cr-summary-kpis');
  const chartEl = document.getElementById('cr-summary-chart');
  if (!kpisEl || !chartEl) return;

  const totalReceptoras = receptoras.length;
  const totalEsperado = window.COMUNICACION_RECEPTORAS_TOTAL_ESPERADO || null;
  const totalClientes = receptoras.reduce((sum, r) => sum + (r.clientes || 0), 0);
  const totalSenales = receptoras.reduce((sum, r) => sum + (r.senales || 0), 0);

  const catTotals = {};
  CR_CAT_ORDER.forEach(k => { catTotals[k] = 0; });
  receptoras.forEach(r => {
    const cc = r.cat_counts || {};
    CR_CAT_ORDER.forEach(k => { catTotals[k] += (cc[k] || 0); });
  });

  const kpis = [
    [totalEsperado ? `${totalReceptoras} de ~${totalEsperado}` : String(totalReceptoras), 'receptoras cargadas'],
    [fmtNumeroCR(totalClientes), 'clientes comunicados (todas las receptoras)'],
    [fmtNumeroCR(totalSenales), 'señales registradas (todas las receptoras)'],
  ];
  kpisEl.innerHTML = kpis.map(([v,l]) => `
    <div class="cr-kpi">
      <span class="cr-kpi__value">${v}</span>
      <span class="cr-kpi__label">${l}</span>
    </div>
  `).join('');

  const max = Math.max(...CR_CAT_ORDER.map(k => catTotals[k]));
  chartEl.innerHTML = CR_CAT_ORDER.map(key => {
    const meta = CR_CAT_META[key];
    const count = catTotals[key];
    const pct = max > 0 ? Math.max((count/max)*100, 0.5) : 0;
    return `<div class="cr-bar-row">
      <span class="cr-bar-row__label">${meta.label}</span>
      <span class="cr-bar-row__track"><span class="cr-bar-row__fill" style="width:${pct}%;background:${meta.color}"></span></span>
      <span class="cr-bar-row__count">${fmtNumeroCR(count)}</span>
    </div>`;
  }).join('');
}

function renderTarjetas(receptoras) {
  const el = document.getElementById('cr-cards');
  if (!el) return;

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
}

document.addEventListener('DOMContentLoaded', () => {
  const receptoras = window.COMUNICACION_RECEPTORAS || [];
  renderResumenGeneral(receptoras);
  renderTarjetas(receptoras);
});

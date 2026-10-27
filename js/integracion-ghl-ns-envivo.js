/* ============================================================
   integracion-ghl-ns-envivo.js — Pestaña "En vivo" de la sección
   Integración NetSuite ↔ GHL (migración 41).

   Muestra lo que reciben los tres servicios de la integración en el
   servidor local, a medida que llega:
     - integration_events: una fila por llamada (Lead, Oportunidad,
       Presupuesto y avisos del sistema). Solo lectura.
     - integracion_estado: 'netsuite_refresh_token' con el vencimiento
       del refresh token de NetSuite que usa la Etapa 1.

   Las filas las escriben los servicios con el usuario técnico. Acá se
   leen con el usuario logueado: alcanza con 'ver' en integracion-ghl-ns
   (page-guard.js ya lo verificó).

   Se actualiza cada EV_POLL_MS sólo mientras la pestaña está visible y no
   está en pausa. Las actualizaciones traen sólo los eventos nuevos (id
   mayor al último mostrado), así no se cierran los que están abiertos.

   Usa escapeHtml() de integracion-ghl-ns.js, que se carga antes.
   ============================================================ */

'use strict';

const EV_POLL_MS = 10000;
const EV_PAGE = 50;
// Días antes del vencimiento del token a partir de los cuales se avisa
// (el servicio usa el mismo valor por defecto: AVISO_TOKEN_DIAS=5).
const EV_TOKEN_AVISO_DIAS = 5;

const EV_ETAPAS = {
  lead: { nombre: 'Lead', flujo: 'GHL → NetSuite', icono: 'ti-user-plus' },
  oportunidad: { nombre: 'Oportunidad', flujo: 'NetSuite → GHL', icono: 'ti-briefcase' },
  presupuesto: { nombre: 'Presupuesto', flujo: 'NetSuite → GHL', icono: 'ti-file-invoice' },
  sistema: { nombre: 'Sistema', flujo: '', icono: 'ti-settings' },
};

const EV_ORIGENES = { ghl: 'GHL', netsuite: 'NetSuite', local: 'Sitio interno', servicio: 'Servicio' };

// resultado -> [texto, clase de status-badge]
const EV_RESULTADOS = {
  created: ['Creado', 'ok'],
  updated: ['Actualizado', 'ok'],
  skipped: ['Ya existía', 'rev'],
  already_exists: ['Ya existía', 'rev'],
  already_updated: ['Sin cambios', 'rev'],
  simulado: ['Simulado', 'prog'],
  aviso: ['Aviso', 'prog'],
  error: ['Error', 'err'],
  rechazado: ['Rechazado', 'err'],
};

const EV_GRUPOS_RESULTADO = {
  ok: ['created', 'updated', 'skipped', 'already_exists', 'already_updated', 'simulado'],
  error: ['error', 'rechazado'],
  aviso: ['aviso'],
};

const EV_COLUMNAS = 'id,recibido_en,etapa,origen,referencia_id,resultado,detalle,duracion_ms';

const ev = {
  authListo: false,
  pausado: false,
  timer: null,
  ultimoId: 0,       // mayor id mostrado (para traer sólo lo nuevo)
  primerId: null,    // menor id mostrado (para "Ver eventos anteriores")
  cantidad: 0,
  cargando: false,
  error: null,
  detalles: new Map(), // id -> { payload, respuesta }
};

/* ── Utilidades ──────────────────────────────────────────────────────── */

function evSb() {
  return window.supabaseClient;
}

function evPanelVisible() {
  const panel = document.getElementById('ig-tab-envivo');
  return panel && !panel.hidden && document.visibilityState === 'visible';
}

function evHoraAR(iso, conFecha) {
  const d = new Date(iso);
  const opciones = { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  if (conFecha) { opciones.day = '2-digit'; opciones.month = '2-digit'; }
  return new Intl.DateTimeFormat('es-AR', opciones).format(d);
}

function evFechaCorta(iso) {
  // "26/11 11:22", hora de Argentina.
  const p = Object.fromEntries(new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

function evEsHoy(iso) {
  const f = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(d);
  return f(new Date(iso)) === f(new Date());
}

function evHace(iso) {
  const seg = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seg < 60) return 'hace instantes';
  const min = Math.round(seg / 60);
  if (min < 60) return `hace ${min} min`;
  const hs = Math.round(min / 60);
  if (hs < 24) return `hace ${hs} h`;
  const dias = Math.round(hs / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
}

function evBadge(resultado) {
  const [texto, clase] = EV_RESULTADOS[resultado] || [resultado, 'rev'];
  return `<span class="status-badge status-badge--${clase}">${escapeHtml(texto)}</span>`;
}

function evMensaje(texto, tipo) {
  const el = document.getElementById('ev-actualizado');
  if (!el) return;
  el.innerHTML = tipo === 'error'
    ? `<span class="au-aviso"><i class="ti ti-alert-triangle" aria-hidden="true"></i> ${escapeHtml(texto)}</span>`
    : escapeHtml(texto);
}

function evErrorTexto(error) {
  const msg = (error && (error.message || error.details)) || String(error);
  if (/integration_events|integracion_estado/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)) {
    return 'Todavía no se aplicó la migración 41 en Supabase (tablas integration_events e integracion_estado).';
  }
  return `No se pudieron leer los eventos: ${msg}`;
}

/* ── Filtros ─────────────────────────────────────────────────────────── */

function evFiltros() {
  return {
    q: (document.getElementById('ev-q').value || '').trim().replace(/[,()%*\\]/g, ' ').trim(),
    etapa: document.getElementById('ev-f-etapa').value,
    resultado: document.getElementById('ev-f-resultado').value,
  };
}

function evAplicarFiltros(query) {
  const f = evFiltros();
  if (f.etapa) query = query.eq('etapa', f.etapa);
  if (f.resultado && EV_GRUPOS_RESULTADO[f.resultado]) query = query.in('resultado', EV_GRUPOS_RESULTADO[f.resultado]);
  if (f.q) query = query.or(`referencia_id.ilike.*${f.q}*,detalle.ilike.*${f.q}*`);
  return query;
}

/* ── Estado de la integración ────────────────────────────────────────── */

async function evCargarEstado() {
  const sb = evSb();
  const hace24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const ultimos = ['lead', 'oportunidad', 'presupuesto'].map((etapa) =>
    sb.from('integration_events')
      .select('recibido_en,resultado,detalle')
      .eq('etapa', etapa)
      .neq('resultado', 'rechazado')
      .order('id', { ascending: false })
      .limit(1)
      .then((r) => ({ etapa, r })));

  const [token, errores, ...porEtapa] = await Promise.all([
    sb.from('integracion_estado').select('valor,actualizado_en').eq('clave', 'netsuite_refresh_token').maybeSingle(),
    sb.from('integration_events').select('id', { count: 'exact', head: true })
      .in('resultado', EV_GRUPOS_RESULTADO.error).gte('recibido_en', hace24),
    ...ultimos,
  ]);

  if (token.error) throw token.error;

  const tarjetas = porEtapa.map(({ etapa, r }) => {
    const info = EV_ETAPAS[etapa];
    const fila = r.data && r.data[0];
    const cuerpo = fila
      ? `<div class="ev-card__valor">${evBadge(fila.resultado)}</div>
         <div class="ev-card__sub" title="${escapeHtml(evHoraAR(fila.recibido_en, true))}">Último evento ${escapeHtml(evHace(fila.recibido_en))}</div>`
      : `<div class="ev-card__valor ev-card__vacio">Sin eventos</div>
         <div class="ev-card__sub">Todavía no llegó ninguna llamada</div>`;
    const alerta = fila && EV_GRUPOS_RESULTADO.error.includes(fila.resultado) ? ' ev-card--err' : '';
    return `
      <div class="ev-card${alerta}">
        <div class="ev-card__titulo"><i class="ti ${info.icono}" aria-hidden="true"></i> ${escapeHtml(info.nombre)} <span class="ev-card__flujo">${escapeHtml(info.flujo)}</span></div>
        ${cuerpo}
      </div>`;
  });

  // Errores de las últimas 24 h (toca para filtrar).
  const nErrores = errores.count || 0;
  tarjetas.push(`
    <button type="button" class="ev-card ev-card--boton${nErrores ? ' ev-card--err' : ''}" data-ev-accion="errores">
      <div class="ev-card__titulo"><i class="ti ti-alert-triangle" aria-hidden="true"></i> Errores · últimas 24 h</div>
      <div class="ev-card__valor ev-card__numero">${nErrores}</div>
      <div class="ev-card__sub">${nErrores ? 'Tocá para verlos en el registro' : 'Sin errores ni rechazos'}</div>
    </button>`);

  tarjetas.push(evTarjetaToken(token.data));

  document.getElementById('ev-estado').innerHTML = `<div class="ev-cards">${tarjetas.join('')}</div>`;
}

function evTarjetaToken(fila) {
  const titulo = '<div class="ev-card__titulo"><i class="ti ti-key" aria-hidden="true"></i> Token de NetSuite (Etapa 1)</div>';
  const valor = fila && fila.valor;
  if (!valor || !valor.vence_en) {
    return `<div class="ev-card">${titulo}
      <div class="ev-card__valor ev-card__vacio">Sin dato</div>
      <div class="ev-card__sub">El servicio de la Etapa 1 todavía no informó el vencimiento</div></div>`;
  }
  // Los días se calculan acá, con la hora actual, no con los guardados.
  const dias = (new Date(valor.vence_en).getTime() - Date.now()) / 86400000;
  let clase = 'ok';
  let texto = `Faltan ${Math.floor(dias)} día${Math.floor(dias) === 1 ? '' : 's'}`;
  if (dias <= 0) { clase = 'err'; texto = 'Vencido'; }
  else if (dias <= EV_TOKEN_AVISO_DIAS) { clase = 'prog'; texto = dias < 1 ? 'Vence hoy' : `Vence en ${Math.ceil(dias)} día${Math.ceil(dias) === 1 ? '' : 's'}`; }
  const ayuda = clase === 'ok' ? '' : '<div class="ev-card__sub">Renovarlo y cargarlo en Coolify (NETSUITE_REFRESH_TOKEN) con Redeploy</div>';
  return `<div class="ev-card${clase === 'err' ? ' ev-card--err' : clase === 'prog' ? ' ev-card--aviso' : ''}">${titulo}
    <div class="ev-card__valor"><span class="status-badge status-badge--${clase}">${escapeHtml(texto)}</span></div>
    <div class="ev-card__sub">Vence el ${escapeHtml(evFechaCorta(valor.vence_en))}</div>
    ${ayuda}</div>`;
}

/* ── Registro de eventos ─────────────────────────────────────────────── */

function evFilaHtml(e, nueva) {
  const etapa = EV_ETAPAS[e.etapa] || { nombre: e.etapa, icono: 'ti-point' };
  const hora = evHoraAR(e.recibido_en, !evEsHoy(e.recibido_en));
  const err = EV_GRUPOS_RESULTADO.error.includes(e.resultado) ? ' ev-fila--err' : (e.resultado === 'aviso' ? ' ev-fila--aviso' : '');
  return `
    <details class="ev-fila${err}${nueva ? ' ev-fila--nueva' : ''}" data-id="${e.id}">
      <summary>
        <span class="ev-fila__hora" title="${escapeHtml(evHoraAR(e.recibido_en, true))}">${escapeHtml(hora)}</span>
        <span class="ev-fila__etapa"><i class="ti ${etapa.icono}" aria-hidden="true"></i> ${escapeHtml(etapa.nombre)}</span>
        <span class="ev-fila__resultado">${evBadge(e.resultado)}</span>
        <span class="ev-fila__ref ig-mono">${e.referencia_id ? escapeHtml(e.referencia_id) : '—'}</span>
        <span class="ev-fila__detalle">${e.detalle ? escapeHtml(e.detalle) : `<span class="ev-tenue">desde ${escapeHtml(EV_ORIGENES[e.origen] || e.origen)}</span>`}</span>
        <span class="ev-fila__dur">${e.duracion_ms != null ? `${e.duracion_ms} ms` : ''}</span>
      </summary>
      <div class="ev-fila__cuerpo"><p class="admin-loading">Cargando detalle…</p></div>
    </details>`;
}

async function evCargarDetalle(det) {
  const id = Number(det.dataset.id);
  const cuerpo = det.querySelector('.ev-fila__cuerpo');
  if (!ev.detalles.has(id)) {
    const { data, error } = await evSb().from('integration_events').select('origen,detalle,payload,respuesta').eq('id', id).maybeSingle();
    if (error || !data) {
      cuerpo.innerHTML = `<p class="au-aviso">No se pudo leer el detalle${error ? `: ${escapeHtml(error.message)}` : ''}.</p>`;
      return;
    }
    ev.detalles.set(id, data);
  }
  const d = ev.detalles.get(id);
  const bloque = (titulo, valor) => `
    <div class="ev-json">
      <div class="ev-json__titulo">${escapeHtml(titulo)}</div>
      <pre>${valor == null ? '—' : escapeHtml(JSON.stringify(valor, null, 2))}</pre>
    </div>`;
  cuerpo.innerHTML = `
    <dl class="ev-dl">
      <div><dt>Origen</dt><dd>${escapeHtml(EV_ORIGENES[d.origen] || d.origen)}</dd></div>
      <div><dt>Evento</dt><dd class="ig-mono">#${id}</dd></div>
      ${d.detalle ? `<div class="ev-dl__ancho"><dt>Detalle</dt><dd>${escapeHtml(d.detalle)}</dd></div>` : ''}
    </dl>
    <div class="ev-jsons">${bloque('Qué llegó', d.payload)}${bloque('Qué se respondió', d.respuesta)}</div>`;
}

function evPintar(filas, modo) {
  const log = document.getElementById('ev-log');
  if (modo === 'reemplazar') {
    log.innerHTML = filas.length
      ? filas.map((e) => evFilaHtml(e, false)).join('')
      : '<p class="ev-vacio">No hay eventos con estos filtros.</p>';
  } else if (filas.length) {
    log.querySelector('.ev-vacio')?.remove();
    const html = filas.map((e) => evFilaHtml(e, modo === 'nuevos')).join('');
    log.insertAdjacentHTML(modo === 'nuevos' ? 'afterbegin' : 'beforeend', html);
  }
  if (filas.length) {
    const ids = filas.map((e) => e.id);
    ev.ultimoId = Math.max(ev.ultimoId, ...ids);
    ev.primerId = ev.primerId == null ? Math.min(...ids) : Math.min(ev.primerId, ...ids);
  }
  ev.cantidad = log.querySelectorAll('.ev-fila').length;
}

async function evCargar(modo) {
  if (!ev.authListo || ev.cargando) return;
  ev.cargando = true;
  try {
    let q = evAplicarFiltros(evSb().from('integration_events').select(EV_COLUMNAS));
    if (modo === 'nuevos') q = q.gt('id', ev.ultimoId);
    if (modo === 'anteriores') q = q.lt('id', ev.primerId);
    const { data, error } = await q.order('id', { ascending: false }).limit(EV_PAGE);
    if (error) throw error;

    if (modo === 'reemplazar') { ev.ultimoId = 0; ev.primerId = null; }
    evPintar(data || [], modo);

    if (modo !== 'nuevos') {
      document.getElementById('ev-mas').hidden = (data || []).length < EV_PAGE;
    }

    await evCargarEstado();
    ev.error = null;
    evMensaje(`Actualizado a las ${evHoraAR(new Date().toISOString(), false)}${ev.pausado ? ' · en pausa' : ''}`);
  } catch (error) {
    ev.error = error;
    const texto = evErrorTexto(error);
    evMensaje(texto, 'error');
    if (modo === 'reemplazar') document.getElementById('ev-log').innerHTML = `<p class="ev-vacio">${escapeHtml(texto)}</p>`;
  } finally {
    ev.cargando = false;
  }
}

/* ── Actualización automática ────────────────────────────────────────── */

function evProgramar() {
  clearTimeout(ev.timer);
  if (ev.pausado || !evPanelVisible() || !ev.authListo) return;
  ev.timer = setTimeout(async () => {
    await evCargar('nuevos');
    evProgramar();
  }, EV_POLL_MS);
}

function evActivar() {
  if (!evPanelVisible() || !ev.authListo) { clearTimeout(ev.timer); return; }
  // Al volver a la pestaña se recarga entera (puede haber pasado tiempo).
  evCargar('reemplazar').then(evProgramar);
}

function evPausar(pausar) {
  ev.pausado = pausar;
  const btn = document.getElementById('ev-pausa');
  btn.setAttribute('aria-pressed', pausar ? 'true' : 'false');
  btn.innerHTML = pausar ? '<i class="ti ti-player-play"></i> Reanudar' : '<i class="ti ti-player-pause"></i> Pausar';
  if (pausar) {
    clearTimeout(ev.timer);
    evMensaje('Actualización en pausa');
  } else {
    evActivar();
  }
}

/* ── Inicialización ──────────────────────────────────────────────────── */

if (typeof document !== 'undefined' && document.getElementById('ig-tab-envivo')) {
  let demoraBusqueda = null;
  const recargar = () => { ev.detalles.clear(); evActivar(); };

  document.getElementById('ev-q').addEventListener('input', () => {
    clearTimeout(demoraBusqueda);
    demoraBusqueda = setTimeout(recargar, 400);
  });
  document.getElementById('ev-f-etapa').addEventListener('change', recargar);
  document.getElementById('ev-f-resultado').addEventListener('change', recargar);
  document.getElementById('ev-filtros').addEventListener('submit', (e) => { e.preventDefault(); recargar(); });
  document.getElementById('ev-limpiar').addEventListener('click', () => {
    document.getElementById('ev-filtros').reset();
    recargar();
  });
  document.getElementById('ev-pausa').addEventListener('click', () => evPausar(!ev.pausado));
  document.getElementById('ev-mas').addEventListener('click', () => evCargar('anteriores'));

  // Detalle de cada evento: se lee recién al abrirlo.
  document.getElementById('ev-log').addEventListener('toggle', (e) => {
    const det = e.target;
    if (det.matches && det.matches('details.ev-fila') && det.open) evCargarDetalle(det);
  }, true);

  // Tarjeta de errores: filtra el registro.
  document.getElementById('ev-estado').addEventListener('click', (e) => {
    if (!e.target.closest('[data-ev-accion="errores"]')) return;
    document.getElementById('ev-f-resultado').value = 'error';
    recargar();
    document.getElementById('ev-log-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.addEventListener('ig:tab', evActivar);
  document.addEventListener('visibilitychange', evActivar);

  document.addEventListener('sp:auth-ready', (e) => {
    if (!e.detail.session || !window.supabaseClient) return;
    ev.authListo = true;
    evActivar();
  });
}

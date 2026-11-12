/* ============================================================
   integracion-ghl-ns-auditoria.js — Pestaña "Auditoría" de la sección
   Integración NetSuite ↔ GHL (migración 23).

   Monitoreo por vendedor de cómo va la integración:
     1. Contactos de GHL → clientes potenciales de NetSuite: cada contacto
        de GHL con oportunidad tiene que estar en un cliente de NetSuite con
        su ID en custentity_ghl_contact_id ("ID CLIENTE CRM"). Lo crítico
        son los contactos cuya oportunidad de GHL ya tiene "NetSuite
        Opportunity ID" y no tienen cliente en NetSuite; el resto de los
        contactos sin cliente se muestra como información (12/11/2026).
     2. Oportunidades de NetSuite → GHL: cada oportunidad de NetSuite tiene
        que tener su oportunidad en GHL con el custom field "NetSuite
        Opportunity ID".
     3. Oportunidades de NetSuite con error de sincronización: las que
        tienen "ERROR | ..." o "NO ENVIADO | ..." en
        custbody_ghl_last_sync_msg_op (columna "Mensaje sync GHL").
   Además: clientes de NetSuite creados en el período sin ID de GHL.

   Fuente: las tablas informe_mkt_* que carga el servicio informe-mkt-api
   en cada actualización del Informe MKT (corrida programada de lunes a
   viernes 16 hs, o botón "Actualizar"). No llama a NetSuite ni a GHL: los
   datos están al día de la última actualización. (El modo "Subir exports"
   se quitó el 12/11/2026.)

   Usa los helpers de integracion-ghl-ns.js (escapeHtml, fmtFecha,
   fmtFechaHora, fmtMonto, fmtNumero, desdeIso, hastaIso, nombreEtapa,
   IG_VENDEDORES), que se carga antes.
   ============================================================ */

'use strict';

// Enlaces para ir a buscar cada registro.
const AU_NS_URL = 'https://7138551.app.netsuite.com';
const AU_GHL_URL = 'https://app.gohighlevel.com/v2/location/goympjLjeLIBzCFxsbFM';

// ID del custom field de GHL "NetSuite Opportunity ID" (el mismo valor que
// la variable CUSTOM_FIELD_NETSUITE_OPPORTUNITY_ID de los servicios). Si
// queda vacío, se detecta solo: es el campo cuyo valor coincide con más IDs
// internos de NetSuite.
const AU_CF_NS_OPP_ID = 'tUshSe9uBgbbWpBxf1wG';

const AU_SUBSIDIARIA = 'S.P. SEGURIDAD PRIVADA S.A.';
// Filas por página de cada listado.
const AU_PAGE_SIZE = { c1: 25, c2: 50, c4: 25 };
// Servicio del Informe MKT: el botón Auditar le pide la actualización del mes
// en curso (POST /auditoria/actualizar, migración 24). Permiso propio:
// 'editar' en integracion-ghl-ns; el servicio corre con el usuario técnico.
const AU_INFORME_API_URL = 'https://informe-mkt-api.200.5.196.50.sslip.io';
const AU_POLL_MS = 5000;
// Librería para la descarga a Excel de los listados.
const AU_XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';

// Mismo alias que NETSUITE_VENDEDOR_ALIAS de resumen_ejecutivo.py, para que
// el vendedor de NetSuite y el de GHL se vean con el mismo nombre.
const AU_ALIAS_VENDEDOR_NS = {
  'Gonzalo De Castro': 'Gonzalo Martin De Castro',
  'Martín German Ramos': 'Martín Ramos',
};

const au = {
  authListo: false,
  puedeActualizar: false, // permiso 'editar' en integracion-ghl-ns
  actualizando: false,
  pollTimer: null,
  cargado: false,
  cargando: false,
  datos: null,          // { c1, c2, c3, c4, info }
  pag: { c1: 0, c2: 0, c4: 0 },
};

/* ── Pestañas ────────────────────────────────────────────────────────── */

function auMostrarTab(tab) {
  ['consola', 'auditoria', 'envivo'].forEach((t) => {
    const activo = t === tab;
    document.getElementById(`ig-tab-${t}`).hidden = !activo;
    const btn = document.getElementById(`ig-tabbtn-${t}`);
    btn.classList.toggle('is-active', activo);
    btn.setAttribute('aria-selected', activo ? 'true' : 'false');
  });
  // La Auditoría es la pestaña por defecto: las otras quedan en la URL.
  try { history.replaceState(null, '', tab === 'auditoria' ? location.pathname + location.search : `#${tab}`); } catch (e) { /* sin historial */ }
  // Aviso para la pestaña En vivo (arranca o frena su actualización).
  document.dispatchEvent(new CustomEvent('ig:tab', { detail: { tab } }));
  if (tab === 'auditoria' && au.authListo && !au.cargado && !au.cargando) auditar();
}

if (typeof document !== 'undefined' && document.getElementById('ig-tab-auditoria')) {
  document.querySelectorAll('.segment-tab[data-tab]').forEach((b) => {
    b.addEventListener('click', () => auMostrarTab(b.dataset.tab));
  });

  auInicializar();
  if (location.hash === '#consola') auMostrarTab('consola');
  if (location.hash === '#envivo') auMostrarTab('envivo');

  document.addEventListener('sp:auth-ready', async (e) => {
    if (!e.detail.session || !window.supabaseClient) return;
    au.authListo = true;
    if (!document.getElementById('ig-tab-auditoria').hidden && !au.cargado) auditar();
    await auVerificarPermisoActualizar();
  });
}

/* ── Inicialización de filtros ───────────────────────────────────────── */

function auHoyAR() {
  // Fecha de hoy en Argentina (YYYY-MM-DD), sin depender de la zona de la PC.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

// Período de la auditoría: siempre el mes en curso (del 1 a hoy, hora de
// Argentina). Otros períodos se consultan en el Informe de MKT.
function auPeriodo() {
  const hoy = auHoyAR();
  return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
}

function auPintarPeriodo() {
  const { desde, hasta } = auPeriodo();
  const mes = new Date(`${desde}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  document.getElementById('au-periodo').innerHTML =
    `<i class="ti ti-calendar"></i> <b>${escapeHtml(mes.charAt(0).toUpperCase() + mes.slice(1))}</b> · ${fmtFecha(`${desde}T12:00:00`)} al ${fmtFecha(`${hasta}T12:00:00`)}`;
}

function auInicializar() {
  auPintarPeriodo();
  auLlenarVendedores([]);

  document.getElementById('au-filtros').addEventListener('submit', (ev) => { ev.preventDefault(); auBotonAuditar(); });

  const rerender = (cual) => () => { au.pag[cual] = 0; auRender(); };
  document.getElementById('au-vendedor').addEventListener('change', () => { au.pag = { c1: 0, c2: 0, c4: 0 }; auRender(); });
  ['au-c1-estado'].forEach((id) => document.getElementById(id).addEventListener('change', rerender('c1')));
  ['au-c2-estado', 'au-c2-aprobada'].forEach((id) => document.getElementById(id).addEventListener('change', rerender('c2')));
  document.getElementById('au-c1-q').addEventListener('input', debounce(rerender('c1'), 250));
  document.getElementById('au-c2-q').addEventListener('input', debounce(rerender('c2'), 250));
  document.getElementById('au-c4-tipo').addEventListener('change', rerender('c4'));
  document.getElementById('au-c4-q').addEventListener('input', debounce(rerender('c4'), 250));

  document.querySelectorAll('[data-excel]').forEach((b) => b.addEventListener('click', () => auExportar(b.dataset.excel)));
}

function auLlenarVendedores(nombres) {
  const sel = document.getElementById('au-vendedor');
  const actual = sel.value;
  const lista = [...new Set(nombres.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  sel.innerHTML = '<option value="">Vendedor: todos</option>' +
    lista.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
  if (lista.includes(actual)) sel.value = actual;
}

// Mensaje de estado con fondo según el tipo: 'progreso' (actualizando),
// 'ok', 'aviso', 'error' o 'info'. Por compatibilidad, true = 'error'.
const AU_ICONO_STATUS = {
  progreso: 'ti-loader-2 au-girar',
  ok: 'ti-circle-check',
  aviso: 'ti-alert-triangle',
  error: 'ti-alert-circle',
  info: 'ti-info-circle',
};

function auStatus(msg, tipo) {
  const el = document.getElementById('au-status');
  const t = tipo === true ? 'error' : (tipo || 'info');
  el.className = `au-status au-status--${t}`;
  el.hidden = !msg;
  el.innerHTML = msg ? `<i class="ti ${AU_ICONO_STATUS[t] || AU_ICONO_STATUS.info}" aria-hidden="true"></i><span>${escapeHtml(msg)}</span>` : '';
}

/* ── Normalización ───────────────────────────────────────────────────── */

function auNormId(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim().replace(/\.0+$/, '').replace(/[^\d]/g, '');
}

function auTexto(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

function auValorCf(cf) {
  if (!cf) return null;
  const v = cf.fieldValue ?? cf.fieldValueString ?? cf.fieldValueNumber ?? cf.value;
  return v === null || v === undefined || v === '' ? null : v;
}

function auVendedorGhl(assignedTo) {
  if (!assignedTo) return 'Sin asignar';
  return IG_VENDEDORES[assignedTo] || `Usuario GHL ${assignedTo}`;
}

function auVendedorNs(nombre) {
  const n = auTexto(nombre).split(/\s+/).join(' ');
  if (!n) return 'Sin asignar';
  return AU_ALIAS_VENDEDOR_NS[n] || n;
}

function auNombreGhl(c) {
  if (!c) return '';
  const nombre = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
  return nombre || c.contactName || c.name || c.companyName || c.email || '';
}

function auOppGhl(o) {
  const c = o.crudo || o;
  return {
    id: c.id,
    nombre: c.name || '',
    etapa: c.pipelineStageId ? nombreEtapa(c.pipelineStageId) : (c.etapa || ''),
    estado: c.status || '',
    monto: c.monetaryValue ?? null,
    contactId: c.contactId || o.contact_id || '',
    contacto: (c.contact && (c.contact.name || c.contact.email)) || c.contacto || '',
    vendedor: c.assignedTo ? auVendedorGhl(c.assignedTo) : (c.vendedor || ''),
    creado: c.createdAt || c.creado || null,
  };
}

function auPorcentaje(a, total) {
  if (!total) return '—';
  return `${Math.round((a / total) * 100)}%`;
}

function auAgrupar(lista, clave) {
  const m = new Map();
  lista.forEach((x) => {
    const k = clave(x);
    if (!k) return;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  });
  return m;
}

/* ── Lectura de Supabase ─────────────────────────────────────────────── */

// PostgREST corta en 1000 filas por pedido: se pagina con range().
async function auLeerTodo(armar) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await armar().range(desde, desde + 999);
    if (error) throw error;
    filas.push(...data);
    if (data.length < 1000) return filas;
  }
}

// Lectura por lista de valores (col in (...)), en tandas de 100 para no
// armar URLs enormes, con hasta 4 pedidos en paralelo.
async function auLeerPorIds(tabla, columna, ids, select) {
  const lista = [...new Set(ids.filter(Boolean).map(String))];
  const tandas = [];
  for (let i = 0; i < lista.length; i += 100) tandas.push(lista.slice(i, i + 100));
  const salida = [];
  let idx = 0;
  const sb = window.supabaseClient;
  async function trabajador() {
    while (idx < tandas.length) {
      const tanda = tandas[idx++];
      salida.push(...await auLeerTodo(() => sb.from(tabla).select(select).in(columna, tanda)));
    }
  }
  await Promise.all([1, 2, 3, 4].map(trabajador));
  return salida;
}

function auMensajeError(err) {
  const msg = (err && (err.message || err.details)) || String(err);
  if (err && (err.code === '42P01' || err.code === '42703' || /does not exist|ns_verificado_en|informe_mkt_ns_cliente/.test(msg))) {
    return 'Falta correr supabase/migracion_23_auditoria_integracion.sql en la base.';
  }
  if (err && err.code === '42501') return 'Tu usuario no tiene permiso para leer los datos de la auditoría.';
  return `No se pudieron leer los datos: ${msg}`;
}

/* ── Auditar ─────────────────────────────────────────────────────────── */

async function auditar() {
  if (au.cargando) return;
  au.cargando = true;
  const btn = document.getElementById('au-aplicar');
  btn.disabled = true;
  auStatus('Procesando…', 'progreso');
  try {
    auPintarPeriodo();
    const { desde, hasta } = auPeriodo();
    au.datos = await auCargarBase(desde, hasta);
    au.cargado = true;
    au.pag = { c1: 0, c2: 0, c4: 0 };
    auLlenarVendedores([
      ...au.datos.c1.map((r) => r.vendedor),
      ...au.datos.c2.map((r) => r.vendedor),
    ]);
    auStatus('');
    auRender();
  } catch (err) {
    console.error('[integracion-ghl-ns-auditoria.js] error en la auditoría', err);
    auStatus(auMensajeError(err), true);
  } finally {
    au.cargando = false;
    btn.disabled = au.actualizando;
  }
}

/* ── Botón Auditar: actualizar el mes en curso y auditar ─────────────── */

// Con permiso 'editar' en Integración NetSuite ↔ GHL, Auditar primero
// actualiza el mes en curso desde GHL y NetSuite (servicio informe-mkt-api,
// con el usuario técnico) y después audita. Sin ese permiso, Auditar vuelve a
// leer lo que ya está cargado. No hace falta permiso en Informes de MKT.
async function auVerificarPermisoActualizar() {
  const { data } = await window.supabaseClient
    .rpc('fn_tiene_permiso', { p_seccion_id: 'integracion-ghl-ns', p_nivel: 'editar' });
  au.puedeActualizar = data === true;
  if (au.datos) auRenderCobertura(au.datos);
  if (!au.puedeActualizar) return;
  // Si ya hay una actualización corriendo (la programada de las 16 hs u otra
  // persona), se muestra su avance y al terminar se vuelve a auditar.
  const { data: enCurso } = await window.supabaseClient
    .from('informe_mkt_corrida').select('id').eq('estado', 'en_curso').limit(1);
  if (enCurso && enCurso.length) auSeguirCorrida(enCurso[0].id, 'Hay una actualización en curso');
}

function auBotonAuditar() {
  if (!au.puedeActualizar) { auditar(); return; }
  auActualizarMes();
}

// Durante la actualización el botón queda deshabilitado y muestra el avance.
function auBloquear(bloqueado) {
  au.actualizando = bloqueado;
  const btn = document.getElementById('au-aplicar');
  btn.disabled = bloqueado;
  btn.classList.toggle('au-btn--ocupado', bloqueado);
  if (bloqueado) btn.innerHTML = '<i class="ti ti-loader-2 au-girar"></i> Actualizando…';
  else auEtiquetaBoton();
}

function auEtiquetaBoton() {
  document.getElementById('au-aplicar').innerHTML = '<i class="ti ti-refresh"></i> Auditar';
}

async function auActualizarMes() {
  if (au.actualizando) return;
  auBloquear(true);
  auStatus('Iniciando la actualización del mes en curso…', 'progreso');
  const { data: sesion } = await window.supabaseClient.auth.getSession();
  const token = sesion && sesion.session && sesion.session.access_token;
  if (!token) { auBloquear(false); auStatus('Tu sesión venció: volvé a ingresar a la web interna.', true); return; }

  try {
    // Sin cuerpo: el servicio actualiza siempre el mes en curso.
    const resp = await fetch(`${AU_INFORME_API_URL}/auditoria/actualizar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await resp.json().catch(() => ({}));
    if (resp.status === 409 && body.detail && body.detail.corrida_id) {
      auSeguirCorrida(body.detail.corrida_id, 'Ya había una actualización en curso');
      return;
    }
    if (!resp.ok) {
      const det = body.detail;
      const msg = typeof det === 'string' ? det : (det && det.mensaje) || `error ${resp.status}`;
      auBloquear(false);
      auStatus(`No se pudo iniciar la actualización: ${msg}. Se muestran los datos ya cargados.`, true);
      auditar();
      return;
    }
    auSeguirCorrida(body.corrida_id, 'Actualizando');
  } catch (err) {
    auBloquear(false);
    auStatus(`No se pudo contactar al servicio de actualización (${err.message}). Se muestran los datos ya cargados.`, true);
    auditar();
  }
}

// Sigue el avance de una corrida del Informe MKT y, al terminar, audita.
function auSeguirCorrida(id, prefijo) {
  auBloquear(true);
  auStatus(`${prefijo}… Puede tardar algunos minutos.`, 'progreso');
  if (au.pollTimer) clearInterval(au.pollTimer);
  au.pollTimer = setInterval(async () => {
    const { data: c, error } = await window.supabaseClient
      .from('informe_mkt_corrida').select('estado,paso,mensaje').eq('id', id).single();
    if (error) { auStatus(`No se pudo consultar el avance: ${error.message}`, true); return; }
    if (c.estado === 'en_curso') {
      auStatus(`${prefijo}: ${c.paso || '…'}. Puede tardar algunos minutos.`, 'progreso');
      return;
    }
    clearInterval(au.pollTimer);
    au.pollTimer = null;
    auBloquear(false);
    await auditar();
    if (c.estado === 'ok') {
      auStatus(c.mensaje ? `Actualización terminada con avisos: ${c.mensaje}` : 'Actualización terminada.', c.mensaje ? 'aviso' : 'ok');
    } else {
      auStatus(`La actualización falló: ${c.mensaje || 'error desconocido'}. Se muestran los datos anteriores.`, true);
    }
  }, AU_POLL_MS);
}

async function auCargarBase(desde, hasta) {
  const sb = window.supabaseClient;

  const [contactos, nsOpps, nsClientesRango, dias] = await Promise.all([
    auLeerTodo(() => sb.from('informe_mkt_ghl_contacto')
      .select('id,date_added,ns_verificado_en,crudo')
      .gte('date_added', desdeIso(desde)).lte('date_added', hastaIso(hasta))
      .order('date_added', { ascending: false })),
    auLeerTodo(() => sb.from('informe_mkt_ns_oportunidad')
      .select('id_interno,fecha_oportunidad,id_cliente_crm,fila')
      .gte('fecha_oportunidad', desde).lte('fecha_oportunidad', hasta)
      .order('fecha_oportunidad', { ascending: false })),
    auLeerTodo(() => sb.from('informe_mkt_ns_cliente')
      .select('id_interno,id_cliente_crm,fecha_creacion,fila')
      .gte('fecha_creacion', desde).lte('fecha_creacion', hasta)
      .order('fecha_creacion', { ascending: false })),
    auLeerTodo(() => sb.from('informe_mkt_dia_cargado')
      .select('dia,cargado_hasta')
      .gte('dia', desde).lte('dia', hasta)
      .order('dia')),
  ]);

  const idsContacto = contactos.map((c) => c.id);
  const idsCrmNs = nsOpps.map((o) => auCrmEfectivo(o).crm).filter(Boolean);

  const [nsClientesCrm, citas, ghlOpps] = await Promise.all([
    auLeerPorIds('informe_mkt_ns_cliente', 'id_cliente_crm', idsContacto, 'id_interno,id_cliente_crm,fecha_creacion,fila'),
    auLeerPorIds('informe_mkt_ghl_cita', 'contact_id', idsContacto, 'contact_id'),
    auLeerPorIds('informe_mkt_ghl_oportunidad', 'contact_id', [...idsContacto, ...idsCrmNs], 'id,contact_id,crudo'),
  ]);

  return auCruzarBase({ desde, hasta, contactos, nsOpps, nsClientesRango, nsClientesCrm, citas, ghlOpps, dias });
}

// Cruce con los datos de la base. Función pura (sin DOM ni Supabase).
function auCruzarBase({ desde, hasta, contactos, nsOpps, nsClientesRango, nsClientesCrm, citas, ghlOpps, dias }) {
  // Clientes de NetSuite por ID de GHL (puede haber más de uno: duplicado).
  const clientes = new Map();
  [...nsClientesCrm, ...nsClientesRango].forEach((c) => clientes.set(String(c.id_interno), c));
  const clientesPorCrm = auAgrupar([...clientes.values()], (c) => auTexto(c.id_cliente_crm));

  const conVisita = new Set(citas.map((c) => c.contact_id));
  const oppsPorContacto = auAgrupar(ghlOpps, (o) => o.contact_id || (o.crudo && o.crudo.contactId));

  // Campo de GHL con el ID de NetSuite (lo usan los controles 1 y 2).
  const nsIds = new Set(nsOpps.map((o) => String(o.id_interno)));
  const campo = auDetectarCampo(ghlOpps.map((o) => o.crudo || {}), nsIds);

  // 1. Contactos de GHL → clientes de NetSuite
  // Sólo los contactos con al menos una oportunidad en GHL tienen que estar
  // en NetSuite; el resto (leads sin oportunidad) no se audita.
  // Estados: ok (tiene cliente), critico (sin cliente y alguna oportunidad de
  // GHL ya tiene NetSuite Opportunity ID: la oportunidad está en NetSuite pero
  // el contacto no quedó vinculado), falta (sin cliente, información) y
  // sin_verificar.
  const conOportunidad = contactos.filter((c) => (oppsPorContacto.get(c.id) || []).length);
  const c1 = conOportunidad.map((c) => {
    const k = c.crudo || {};
    const encontrados = (clientesPorCrm.get(c.id) || []).map((x) => auClienteNs(x));
    const oportunidades = (oppsPorContacto.get(c.id) || []).map((o) => ({ ...auOppGhl(o), nsOppId: auNsOppIdGhl(o, campo) }));
    const conIdNs = oportunidades.some((o) => o.nsOppId);
    let estado = 'ok';
    if (!encontrados.length) estado = !c.ns_verificado_en ? 'sin_verificar' : (conIdNs ? 'critico' : 'falta');
    return {
      ghlId: c.id,
      nombre: auNombreGhl(k),
      email: k.email || '',
      telefono: k.phone || '',
      vendedor: auVendedorGhl(k.assignedTo),
      alta: c.date_added,
      origen: k.source || '',
      visita: conVisita.has(c.id),
      oportunidades,
      conIdNs,
      clientes: encontrados,
      verificado: c.ns_verificado_en,
      estado,
    };
  });

  // 2. Oportunidades de NetSuite → GHL
  const oppPorNsId = new Map();
  ghlOpps.forEach((o) => {
    const v = auNsOppIdGhl(o, campo);
    if (v) oppPorNsId.set(v, o);
  });

  const c2 = nsOpps.map((r) => {
    const f = r.fila || {};
    const id = String(r.id_interno);
    const { crm, viaMatriz } = auCrmEfectivo(r);
    const matriz = auTexto(f['Empresa matriz']);
    const vinculada = oppPorNsId.get(id);
    const delContacto = crm ? (oppsPorContacto.get(crm) || []).map(auOppGhl) : [];
    const ghl = vinculada ? auOppGhl(vinculada) : null;
    let diag = '';
    if (ghl) {
      if (crm && ghl.contactId && ghl.contactId !== crm) diag = 'La oportunidad de GHL está en otro contacto que el cliente de NetSuite.';
    } else if (!crm) {
      diag = matriz
        ? `Es un establecimiento de ${matriz}: ni el establecimiento ni la empresa matriz tienen ID de GHL.`
        : 'El cliente de NetSuite no tiene ID de GHL (ID CLIENTE CRM vacío).';
    } else if (!delContacto.length) {
      diag = 'El contacto de GHL no tiene oportunidades.';
    } else {
      diag = `El contacto tiene ${delContacto.length} oportunidad${delContacto.length === 1 ? '' : 'es'} en GHL, ninguna con este ID de NetSuite.`;
    }
    return {
      nsId: id,
      numero: f['Oportunidad'] || '',
      fecha: r.fecha_oportunidad,
      cliente: f['Cliente'] || '',
      codCliente: f['ID'] || '',
      vendedor: auVendedorNs(f['Representante de Ventas']),
      estadoNs: f['Estado Oportunidad'] || '',
      aprobada: Number(f['Aprobada']) === 1,
      unidad: f['Unidad de Negocio'] || '',
      tipoProyecto: f['Tipo de Proyecto'] || '',
      crm,
      viaMatriz,
      matriz,
      ghl,
      delContacto,
      diag,
      sync: auParsearSync(f['Mensaje sync GHL']),
      estado: ghl ? 'ok' : 'falta',
    };
  });

  // 3. Oportunidades de NetSuite con error de sincronización con GHL.
  // "Mensaje sync GHL" sólo existe en las filas cargadas por la versión del
  // servicio del 12/11/2026 en adelante: si no está, el control queda vacío
  // con un aviso.
  const syncDisponible = nsOpps.some((o) => o.fila && Object.prototype.hasOwnProperty.call(o.fila, 'Mensaje sync GHL'));
  const c4 = c2.filter((r) => r.sync && (r.sync.tipo === 'error' || r.sync.tipo === 'no_enviado'));

  // Extra: Clientes de NetSuite sin ID de GHL: los creados en el período y los
  // de oportunidades del período (aunque el cliente sea anterior), para que
  // todo aviso "sin ID de GHL" del control 2 tenga su cliente acá. Se unen
  // por código de cliente (entityid), que está en las dos fuentes.
  const c3PorCodigo = new Map();
  nsClientesRango
    .filter((c) => !auCrmEfectivo(c).crm)
    .map((c) => auClienteNs(c))
    .filter((c) => !c.subsidiaria || c.subsidiaria.endsWith(AU_SUBSIDIARIA))
    .forEach((c) => c3PorCodigo.set(c.codigo || `id:${c.idInterno}`, { ...c, creadoEnPeriodo: true, oportunidades: [] }));
  c2.filter((r) => !r.crm).forEach((r) => {
    const clave = r.codCliente || `opp:${r.nsId}`;
    if (!c3PorCodigo.has(clave)) {
      c3PorCodigo.set(clave, {
        idInterno: '', codigo: r.codCliente, nombre: r.cliente, estado: '', representante: r.vendedor,
        creacion: '', email: '', telefono: '', origen: '', subsidiaria: '', creadoEnPeriodo: false, oportunidades: [],
      });
    }
    c3PorCodigo.get(clave).oportunidades.push({ nsId: r.nsId, numero: r.numero, fecha: r.fecha, vendedor: r.vendedor });
  });
  const c3 = [...c3PorCodigo.values()];

  // Cobertura de días cargados en el rango.
  const totalDias = Math.round((new Date(`${hasta}T00:00:00`) - new Date(`${desde}T00:00:00`)) / 86400000) + 1;
  const ultimo = dias.reduce((m, d) => (!m || d.cargado_hasta > m ? d.cargado_hasta : m), null);

  return {
    c1, c2, c3, c4,
    info: { desde, hasta, totalDias, diasCargados: dias.length, ultimo, campo, syncDisponible, c1SinOportunidad: contactos.length - conOportunidad.length },
  };
}

// ID de GHL efectivo: el del cliente o, si es un establecimiento (subcliente)
// sin ID, el de su empresa matriz. Misma regla que los scripts de NetSuite.
function auCrmEfectivo(r) {
  const propio = auTexto(r.id_cliente_crm);
  if (propio) return { crm: propio, viaMatriz: false };
  const matriz = auTexto((r.fila || {})['ID CLIENTE CRM MATRIZ']);
  return { crm: matriz, viaMatriz: !!matriz };
}

function auClienteNs(c) {
  const f = c.fila || {};
  return {
    idInterno: String(c.id_interno),
    codigo: f['ID'] || '',
    nombre: f['Cliente'] || '',
    estado: f['Estado'] || '',
    representante: auVendedorNs(f['Representante de Ventas']),
    creacion: f['Fecha de creación'] || c.fecha_creacion || '',
    email: f['Email'] || '',
    telefono: f['Teléfono'] || '',
    origen: f['Origen de clientes potenciales'] || '',
    subsidiaria: auTexto(f['Subsidiaria']),
  };
}

// Campo de GHL con el ID de NetSuite: el configurado, o el que más
// coincide con IDs internos de las oportunidades de NetSuite del período.
function auDetectarCampo(opps, nsIds) {
  if (AU_CF_NS_OPP_ID) return { id: AU_CF_NS_OPP_ID, detectado: false, coincidencias: null };
  const cuenta = {};
  opps.forEach((o) => (o.customFields || []).forEach((cf) => {
    const v = auNormId(auValorCf(cf));
    if (v && nsIds.has(v)) cuenta[cf.id] = (cuenta[cf.id] || 0) + 1;
  }));
  const [id, n] = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0] || [null, 0];
  return { id, detectado: true, coincidencias: n };
}

// Valor del "NetSuite Opportunity ID" de una oportunidad de GHL ('' si no tiene).
function auNsOppIdGhl(o, campo) {
  if (!campo || !campo.id) return '';
  const cf = ((o.crudo && o.crudo.customFields) || []).find((x) => x.id === campo.id);
  return cf ? auNormId(auValorCf(cf)) : '';
}

// custbody_ghl_last_sync_msg_op, que escribe UE_NS_Create_GHL_Opportunity:
//   "OK | <acción> | dd/mm/aaaa hh:mm"
//   "ERROR | <detalle> | dd/mm/aaaa hh:mm"
//   "NO ENVIADO | <motivo> | dd/mm/aaaa hh:mm | MANUAL"
function auParsearSync(msg) {
  const texto = auTexto(msg);
  if (!texto) return null;
  const partes = texto.split(/\s+\|\s+/);
  const cab = partes[0].trim().toUpperCase();
  let tipo = 'otro';
  if (cab.startsWith('ERROR')) tipo = 'error';
  else if (cab.startsWith('NO ENVIADO')) tipo = 'no_enviado';
  else if (cab.startsWith('OK')) tipo = 'ok';
  const manual = partes.length > 2 && partes[partes.length - 1].trim().toUpperCase() === 'MANUAL';
  if (manual) partes.pop();
  const fecha = partes.length > 2 && /^\d{1,2}\/\d{1,2}\/\d{4}/.test(partes[partes.length - 1].trim()) ? partes.pop().trim() : '';
  const mensaje = partes.slice(1).join(' | ').trim() || texto;
  return { tipo, mensaje, fecha, manual, texto };
}

/* ── Excel ───────────────────────────────────────────────────────────── */

function auCargarXlsx() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!window.__xlsxCarga) {
    window.__xlsxCarga = new Promise((ok, mal) => {
      const s = document.createElement('script');
      s.src = AU_XLSX_URL;
      s.onload = () => ok(window.XLSX);
      s.onerror = () => { window.__xlsxCarga = null; mal(new Error('No se pudo cargar la librería de Excel.')); };
      document.head.appendChild(s);
    });
  }
  return window.__xlsxCarga;
}

/* ── Render ──────────────────────────────────────────────────────────── */

function auFiltrosVista() {
  return {
    vendedor: document.getElementById('au-vendedor').value,
    c1q: document.getElementById('au-c1-q').value.trim().toLowerCase(),
    c1estado: document.getElementById('au-c1-estado').value,
    c2q: document.getElementById('au-c2-q').value.trim().toLowerCase(),
    c2estado: document.getElementById('au-c2-estado').value,
    c2aprobada: document.getElementById('au-c2-aprobada').value,
    c4q: document.getElementById('au-c4-q').value.trim().toLowerCase(),
    c4tipo: document.getElementById('au-c4-tipo').value,
  };
}

function auFiltrarC1(filas, f, conEstado = true) {
  return filas.filter((r) => {
    if (f.vendedor && r.vendedor !== f.vendedor) return false;
    if (conEstado && f.c1estado && r.estado !== f.c1estado) return false;
    if (f.c1q) {
      const texto = [r.nombre, r.email, r.telefono, r.ghlId, ...r.clientes.map((c) => `${c.codigo} ${c.nombre}`)].join(' ').toLowerCase();
      if (!texto.includes(f.c1q)) return false;
    }
    return true;
  });
}

function auFiltrarC2(filas, f, conEstado = true) {
  return filas.filter((r) => {
    if (f.vendedor && r.vendedor !== f.vendedor) return false;
    if (f.c2aprobada === '1' && r.aprobada !== true) return false;
    if (f.c2aprobada === '0' && r.aprobada !== false) return false;
    if (conEstado && f.c2estado && r.estado !== f.c2estado) return false;
    if (f.c2q) {
      const texto = [r.numero, r.nsId, r.cliente, r.codCliente, r.crm, r.ghl && r.ghl.nombre].join(' ').toLowerCase();
      if (!texto.includes(f.c2q)) return false;
    }
    return true;
  });
}

function auFiltrarC4(filas, f, conTipo = true) {
  return filas.filter((r) => {
    if (f.vendedor && r.vendedor !== f.vendedor) return false;
    if (conTipo && f.c4tipo && r.sync.tipo !== f.c4tipo) return false;
    if (f.c4q) {
      const texto = [r.numero, r.nsId, r.cliente, r.codCliente, r.sync.texto].join(' ').toLowerCase();
      if (!texto.includes(f.c4q)) return false;
    }
    return true;
  });
}

function auRender() {
  const d = au.datos;
  if (!d) return;
  document.getElementById('au-resultados').hidden = false;

  const f = auFiltrosVista();
  auRenderCobertura(d);
  auRenderKpis(d, f);
  auRenderVendedores(d, f);
  auRenderC1(d, f);
  auRenderC2(d, f);
  auRenderC4(d, f);
  auRenderC3(d, f);
  auRenderPie(d);
}

function auRenderCobertura(d) {
  const el = document.getElementById('au-cobertura');
  const { totalDias, diasCargados, ultimo } = d.info;
  const faltan = totalDias - diasCargados;
  const como = au.puedeActualizar
    ? 'Auditar los actualiza desde GHL y NetSuite; también se actualizan solos de lunes a viernes a las 16 hs'
    : 'se actualizan de lunes a viernes a las 16 hs; Auditar vuelve a leerlos';
  el.innerHTML = `Datos al <b>${fmtFechaHora(ultimo)}</b> (${como}). ` +
    (faltan > 0
      ? `<span class="au-aviso">${fmtNumero(faltan)} de ${fmtNumero(totalDias)} días del mes no están cargados${au.puedeActualizar ? ': apretá Auditar para traerlos' : ''}.</span>`
      : 'Todos los días del rango están cargados.');
}

function auBarra(partes) {
  const total = partes.reduce((s, p) => s + p.n, 0) || 1;
  return `<div class="au-barra" role="img" aria-label="${partes.map((p) => `${p.label}: ${p.n}`).join(', ')}">` +
    partes.filter((p) => p.n > 0).map((p) => `<span class="au-barra__seg au-barra__seg--${p.mod}" style="width:${(p.n / total) * 100}%" title="${escapeHtml(p.label)}: ${p.n}"></span>`).join('') +
    '</div>';
}

function auKpi(valor, label, mod, accion) {
  const attrs = accion ? ` data-ir="${accion}" title="Ver el detalle"` : '';
  const tag = accion ? 'button type="button"' : 'div';
  const cierre = accion ? 'button' : 'div';
  return `<${tag} class="au-kpi au-kpi--${mod}${accion ? ' au-kpi--link' : ''}"${attrs}>
      <span class="au-kpi__valor">${valor}</span>
      <span class="au-kpi__label">${label}</span>
    </${cierre}>`;
}

function auRenderKpis(d, f) {
  const el = document.getElementById('au-kpis');
  const bloques = [];

  // Control 1: lo crítico son los contactos con NetSuite Opportunity ID en
  // alguna oportunidad de GHL y sin cliente en NetSuite.
  const c1 = auFiltrarC1(d.c1, f, false);
  const ok = c1.filter((r) => r.estado === 'ok').length;
  const critico = c1.filter((r) => r.estado === 'critico').length;
  const falta = c1.filter((r) => r.estado === 'falta').length;
  const sinVer = c1.filter((r) => r.estado === 'sin_verificar').length;
  bloques.push(`<div class="au-kpi-grupo">
    <h3 class="au-kpi-grupo__titulo">Contactos de GHL → NetSuite</h3>
    <div class="au-kpi-grupo__items">
      ${auKpi(fmtNumero(c1.length), 'contactos de GHL con oportunidad', 'neutro')}
      ${auKpi(`${fmtNumero(ok)} <small>${auPorcentaje(ok, c1.length)}</small>`, 'con cliente en NetSuite', 'ok', 'c1:ok')}
      ${auKpi(fmtNumero(critico), 'con NetSuite Opportunity ID y sin cliente en NetSuite', critico ? 'err' : 'ok', 'c1:critico')}
    </div>
    <div class="au-kpi-grupo__info">
      ${auKpi(fmtNumero(falta), 'sin cliente en NetSuite, sin oportunidad en NetSuite (información)', 'rev', 'c1:falta')}
      ${sinVer ? auKpi(fmtNumero(sinVer), 'sin verificar', 'rev', 'c1:sin_verificar') : ''}
    </div>
    ${auBarra([{ n: ok, mod: 'ok', label: 'Con cliente' }, { n: critico, mod: 'err', label: 'Con ID de NetSuite, sin cliente' }, { n: falta + sinVer, mod: 'rev', label: 'Sin cliente (información) / sin verificar' }])}
  </div>`);

  const c2 = auFiltrarC2(d.c2, f, false);
  const ok2 = c2.filter((r) => r.estado === 'ok').length;
  const falta2 = c2.length - ok2;
  bloques.push(`<div class="au-kpi-grupo">
    <h3 class="au-kpi-grupo__titulo">Oportunidades de NetSuite → GHL</h3>
    <div class="au-kpi-grupo__items">
      ${auKpi(fmtNumero(c2.length), 'oportunidades de NetSuite', 'neutro')}
      ${auKpi(`${fmtNumero(ok2)} <small>${auPorcentaje(ok2, c2.length)}</small>`, 'vinculadas en GHL', 'ok', 'c2:ok')}
      ${auKpi(fmtNumero(falta2), 'faltan en GHL', 'err', 'c2:falta')}
    </div>
    ${auBarra([{ n: ok2, mod: 'ok', label: 'Vinculadas' }, { n: falta2, mod: 'err', label: 'Faltan' }])}
  </div>`);

  const c4 = auFiltrarC4(d.c4, f, false);
  const errores = c4.filter((r) => r.sync.tipo === 'error').length;
  const noEnviadas = c4.length - errores;
  bloques.push(`<div class="au-kpi-grupo au-kpi-grupo--chico">
    <h3 class="au-kpi-grupo__titulo">Errores de sincronización en NetSuite</h3>
    <div class="au-kpi-grupo__items">
      ${d.info.syncDisponible
        ? auKpi(fmtNumero(errores), 'oportunidades con ERROR', errores ? 'err' : 'ok', 'c4:error') +
          (noEnviadas ? auKpi(fmtNumero(noEnviadas), 'no enviadas (envío manual)', 'rev', 'c4:no_enviado') : '')
        : auKpi('—', 'todavía sin datos: falta actualizar', 'rev')}
    </div>
  </div>`);

  const c3 = auFiltrarC3(d.c3, f);
  const conOpp = c3.filter((c) => c.oportunidades.length).length;
  bloques.push(`<div class="au-kpi-grupo au-kpi-grupo--chico">
    <h3 class="au-kpi-grupo__titulo">Clientes NetSuite sin ID de GHL</h3>
    <div class="au-kpi-grupo__items">
      ${auKpi(fmtNumero(c3.length), 'clientes a completar', c3.length ? 'err' : 'ok', 'c3')}
      ${c3.length ? auKpi(fmtNumero(conOpp), 'con oportunidades en el período', 'rev', 'c3') : ''}
    </div>
  </div>`);

  el.innerHTML = bloques.join('');
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => auIr(b.dataset.ir)));
}

// Lleva al listado con el estado indicado ("c1:critico", "c2:ok", "c4:error", "c3"...).
function auIr(destino, vendedor) {
  const [ctrl, estado] = destino.split(':');
  if (vendedor !== undefined) document.getElementById('au-vendedor').value = vendedor;
  if (ctrl === 'c1' || ctrl === 'c2' || ctrl === 'c4') {
    document.getElementById(ctrl === 'c4' ? 'au-c4-tipo' : `au-${ctrl}-estado`).value = estado || '';
    au.pag[ctrl] = 0;
  }
  auRender();
  document.getElementById(`au-${ctrl}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function auRenderVendedores(d, f) {
  const el = document.getElementById('au-vendedores');
  const fSinVendedor = { ...f, vendedor: '' };
  const c1 = auFiltrarC1(d.c1, fSinVendedor, false);
  const c2 = auFiltrarC2(d.c2, fSinVendedor, false);
  const c4 = auFiltrarC4(d.c4, fSinVendedor, false);
  const nombres = [...new Set([...c1.map((r) => r.vendedor), ...c2.map((r) => r.vendedor)])]
    .sort((a, b) => a.localeCompare(b, 'es'));

  if (!nombres.length) { el.innerHTML = '<p class="admin-empty">Sin datos en el período.</p>'; return; }

  const link = (n, destino, vend, mod) => (n
    ? `<button type="button" class="au-num au-num--${mod}" data-ir="${destino}" data-vendedor="${escapeHtml(vend)}">${fmtNumero(n)}</button>`
    : '<span class="au-num au-num--cero">0</span>');

  const filas = nombres.map((v) => {
    const a = c1.filter((r) => r.vendedor === v);
    const b = c2.filter((r) => r.vendedor === v);
    const e = c4.filter((r) => r.vendedor === v);
    const aOk = a.filter((r) => r.estado === 'ok').length;
    const aCritico = a.filter((r) => r.estado === 'critico').length;
    const aFalta = a.filter((r) => r.estado === 'falta').length;
    const aSin = a.filter((r) => r.estado === 'sin_verificar').length;
    const bOk = b.filter((r) => r.estado === 'ok').length;
    const bFalta = b.length - bOk;
    const eErr = e.filter((r) => r.sync.tipo === 'error').length;
    const eNoEnv = e.length - eErr;
    const destacada = f.vendedor === v ? ' class="au-fila--activa"' : '';
    return `<tr${destacada}>
      <td><b>${escapeHtml(v)}</b></td>
      <td class="num">${fmtNumero(a.length)}</td>
      <td class="num">${link(aCritico, 'c1:critico', v, 'err')}</td>
      <td class="num">${aFalta ? link(aFalta, 'c1:falta', v, 'info') : '<span class="au-sub">0</span>'}${aSin ? ` <span class="au-sub" title="Sin verificar">+${fmtNumero(aSin)} s/v</span>` : ''}</td>
      <td class="num">${auPorcentaje(aOk, a.length)}</td>
      <td class="num">${fmtNumero(b.length)}</td>
      <td class="num">${link(bFalta, 'c2:falta', v, 'err')}</td>
      <td class="num">${auPorcentaje(bOk, b.length)}</td>
      <td class="num">${d.info.syncDisponible ? link(eErr, 'c4:error', v, 'err') : '<span class="au-sub">—</span>'}${eNoEnv ? ` <span class="au-sub" title="No enviadas (envío manual)">+${fmtNumero(eNoEnv)} n/e</span>` : ''}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `<table class="admin-table au-tabla-vend">
    <thead>
      <tr>
        <th rowspan="2">Vendedor</th>
        <th colspan="4" class="au-th-grupo">Contactos GHL → NetSuite</th>
        <th colspan="3" class="au-th-grupo">Oportunidades NetSuite → GHL</th>
        <th rowspan="2" class="num au-th-grupo">Errores de sync en NS</th>
      </tr>
      <tr>
        <th class="num" >Contactos</th><th class="num" title="Con NetSuite Opportunity ID en GHL y sin cliente en NetSuite">Con ID NS, sin cliente</th><th class="num" title="Información: sin cliente en NetSuite y sin oportunidad en NetSuite">Sin cliente (info)</th><th class="num">% OK</th>
        <th class="num">Oportunidades</th><th class="num">Faltan en GHL</th><th class="num">% OK</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>`;
  el.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => auIr(b.dataset.ir, b.dataset.vendedor)));
}

function auBadgeEstado(estado, tipo) {
  const map = {
    ok: ['ok', tipo === 'c1' ? 'En NetSuite' : 'En GHL'],
    critico: ['err', 'Con ID NS, sin cliente'],
    falta: tipo === 'c1' ? ['rev', 'Sin cliente en NS'] : ['err', 'Falta en GHL'],
    sin_verificar: ['rev', 'Sin verificar'],
  };
  const [mod, label] = map[estado] || ['rev', estado];
  return `<span class="status-badge status-badge--${mod}">${label}</span>`;
}

function auBadgeSync(s) {
  const [mod, label] = s && s.tipo === 'error' ? ['err', 'Error'] : ['rev', 'No enviado'];
  return `<span class="status-badge status-badge--${mod}">${label}</span>`;
}

function auLinkNs(tipo, id, texto) {
  if (!id) return escapeHtml(texto || '—');
  const ruta = tipo === 'opp' ? '/app/accounting/transactions/opprtnty.nl?id=' : '/app/common/entity/custjob.nl?id=';
  return `<a href="${AU_NS_URL}${ruta}${encodeURIComponent(id)}" target="_blank" rel="noopener" title="Abrir en NetSuite">${escapeHtml(texto || id)} <i class="ti ti-external-link"></i></a>`;
}

function auLinkGhl(contactId, texto) {
  if (!contactId) return escapeHtml(texto || '—');
  return `<a href="${AU_GHL_URL}/contacts/detail/${encodeURIComponent(contactId)}" target="_blank" rel="noopener" title="Abrir el contacto en GHL">${escapeHtml(texto || contactId)} <i class="ti ti-external-link"></i></a>`;
}

function auPaginar(filas, cual) {
  const tamano = AU_PAGE_SIZE[cual] || 50;
  const ultima = Math.max(0, Math.ceil(filas.length / tamano) - 1);
  if (au.pag[cual] > ultima) au.pag[cual] = ultima;
  const page = au.pag[cual];
  renderPager(`au-${cual}-pager`, { page, total: filas.length }, (p) => {
    au.pag[cual] = p;
    auRender();
    document.getElementById(`au-${cual}`).scrollIntoView({ block: 'start' });
  }, tamano);
  return filas.slice(page * tamano, (page + 1) * tamano);
}

function auRenderC1(d, f) {
  const el = document.getElementById('au-c1-tabla');
  const filas = auFiltrarC1(d.c1, f);
  const pagina = auPaginar(filas, 'c1');
  if (!filas.length) {
    el.innerHTML = `<p class="admin-empty">${f.c1estado === 'critico' && !f.c1q ? '✓ No hay contactos con NetSuite Opportunity ID sin cliente en NetSuite.' : 'Sin resultados con estos filtros.'}</p>`;
    return;
  }
  el.innerHTML = `<table class="admin-table au-tabla">
    <thead><tr>
      <th>Estado</th><th>Contacto GHL</th><th>Vendedor GHL</th><th>Alta GHL</th><th>Origen</th><th>En GHL</th><th>Cliente NetSuite</th>
    </tr></thead>
    <tbody>${pagina.map((r) => `<tr>
      <td>${auBadgeEstado(r.estado, 'c1')}</td>
      <td>${auLinkGhl(r.ghlId, r.nombre || r.ghlId)}
        <div class="ig-cell-sub">${[r.email, r.telefono].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div>
        <div class="ig-cell-sub ig-mono">${escapeHtml(r.ghlId)}</div></td>
      <td>${escapeHtml(r.vendedor)}</td>
      <td>${fmtFecha(r.alta)}</td>
      <td>${valor(r.origen)}</td>
      <td>${r.visita ? '<span class="ig-tag">Visita</span> ' : ''}<span class="ig-tag">${r.oportunidades.length} oport.</span>
        <details class="au-det"><summary>Ver oportunidades</summary><ul>${r.oportunidades.map((o) =>
          `<li>${escapeHtml(o.nombre || '(sin nombre)')} <span class="ig-cell-sub">${[o.etapa, o.estado, o.creado ? fmtFecha(o.creado) : ''].filter(Boolean).map(escapeHtml).join(' · ')}</span>${o.nsOppId ? ` <span class="ig-tag">NS ${escapeHtml(o.nsOppId)}</span>` : ''}</li>`).join('')}</ul></details></td>
      <td>${r.clientes.length
        ? r.clientes.map((c) => `<div>${auLinkNs('cliente', c.idInterno, `${c.codigo || c.idInterno} ${c.nombre}`.trim())}
            <div class="ig-cell-sub">${[c.estado, c.representante !== 'Sin asignar' ? c.representante : ''].filter(Boolean).map(escapeHtml).join(' · ')}</div></div>`).join('') +
          (r.clientes.length > 1 ? '<div class="au-aviso">Hay más de un cliente con este ID de GHL.</div>' : '')
        : `${r.estado === 'critico' ? `<div class="au-aviso">La oportunidad ya está en NetSuite (${r.oportunidades.filter((o) => o.nsOppId).map((o) => auLinkNs('opp', o.nsOppId, `ID ${o.nsOppId}`)).join(', ')}) pero ningún cliente tiene este ID de GHL.</div>` : ''}
          <span class="ig-cell-sub">${r.verificado ? `Buscado el ${fmtFechaHora(r.verificado)}` : 'Todavía no se buscó en NetSuite'}</span>`}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function auRenderC2(d, f) {
  const el = document.getElementById('au-c2-tabla');
  const filas = auFiltrarC2(d.c2, f);
  const pagina = auPaginar(filas, 'c2');
  if (!filas.length) {
    el.innerHTML = `<p class="admin-empty">${f.c2estado === 'falta' ? '✓ No faltan oportunidades en GHL con estos filtros.' : 'Sin resultados con estos filtros.'}</p>`;
    return;
  }
  el.innerHTML = `<table class="admin-table au-tabla">
    <thead><tr>
      <th>Estado</th><th>Oportunidad NetSuite</th><th>Cliente</th><th>Representante</th><th>Estado NS</th><th>Unidad de negocio</th><th>GHL</th>
    </tr></thead>
    <tbody>${pagina.map((r) => `<tr>
      <td>${auBadgeEstado(r.estado, 'c2')}${r.sync && r.sync.tipo === 'error' ? '<div><span class="status-badge status-badge--err" title="Ver Errores de sincronización">Error de sync</span></div>' : ''}</td>
      <td>${auLinkNs('opp', r.nsId, r.numero || r.nsId)}
        <div class="ig-cell-sub">${fmtFecha(r.fecha)} · ID interno <span class="ig-mono">${escapeHtml(r.nsId)}</span></div></td>
      <td>${valor(r.cliente)}<div class="ig-cell-sub">${valor(r.codCliente)}</div></td>
      <td>${escapeHtml(r.vendedor)}</td>
      <td>${valor(r.estadoNs)}${r.aprobada === true ? ' <span class="ig-tag">Aprobada</span>' : ''}</td>
      <td>${valor(r.unidad)}${r.tipoProyecto ? `<div class="ig-cell-sub">${escapeHtml(r.tipoProyecto)}</div>` : ''}</td>
      <td>${auCeldaGhlC2(r)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function auCeldaGhlC2(r) {
  const contacto = r.crm ? `<div class="ig-cell-sub">Contacto: ${auLinkGhl(r.crm, r.crm)}</div>` : '';
  const matriz = r.viaMatriz ? `<div class="ig-cell-sub"><span class="ig-tag">Vía empresa matriz ${escapeHtml(r.matriz)}</span></div>` : '';
  if (r.ghl) {
    return `<div>${escapeHtml(r.ghl.nombre || '(sin nombre)')}</div>
      <div class="ig-cell-sub">${[r.ghl.etapa, r.ghl.vendedor].filter(Boolean).map(escapeHtml).join(' · ')}</div>
      ${r.ghl.contactId ? `<div class="ig-cell-sub">Contacto: ${auLinkGhl(r.ghl.contactId, r.ghl.contacto || r.ghl.contactId)}</div>` : contacto}
      ${matriz}
      ${r.diag ? `<div class="au-aviso">${escapeHtml(r.diag)}</div>` : ''}`;
  }
  const lista = r.delContacto.length
    ? `<details class="au-det"><summary>Ver oportunidades del contacto</summary><ul>${r.delContacto.map((o) =>
      `<li>${escapeHtml(o.nombre || '(sin nombre)')} <span class="ig-cell-sub">${[o.etapa, o.estado, o.creado ? fmtFecha(o.creado) : ''].filter(Boolean).map(escapeHtml).join(' · ')}</span></li>`).join('')}</ul></details>`
    : '';
  return `<div class="au-diag">${escapeHtml(r.diag)}</div>${contacto}${matriz}${lista}`;
}

function auRenderC4(d, f) {
  const el = document.getElementById('au-c4-tabla');
  const filas = auFiltrarC4(d.c4, f);
  const pagina = auPaginar(filas, 'c4');
  if (!d.info.syncDisponible) {
    el.innerHTML = '<p class="admin-empty">Todavía no está cargado el mensaje de sincronización de las oportunidades. Se carga en la próxima actualización (Auditar o la corrida de las 16 hs) con la versión nueva del servicio del Informe MKT.</p>';
    return;
  }
  if (!filas.length) {
    el.innerHTML = `<p class="admin-empty">${f.c4q || f.c4tipo === 'no_enviado' ? 'Sin resultados con estos filtros.' : '✓ No hay oportunidades con error de sincronización en el período.'}</p>`;
    return;
  }
  el.innerHTML = `<table class="admin-table au-tabla">
    <thead><tr>
      <th>Tipo</th><th>Oportunidad NetSuite</th><th>Cliente</th><th>Representante</th><th>Unidad de negocio</th><th>Mensaje en NetSuite</th><th>GHL</th>
    </tr></thead>
    <tbody>${pagina.map((r) => `<tr>
      <td>${auBadgeSync(r.sync)}</td>
      <td>${auLinkNs('opp', r.nsId, r.numero || r.nsId)}
        <div class="ig-cell-sub">${fmtFecha(r.fecha)} · ID interno <span class="ig-mono">${escapeHtml(r.nsId)}</span></div></td>
      <td>${valor(r.cliente)}<div class="ig-cell-sub">${valor(r.codCliente)}</div></td>
      <td>${escapeHtml(r.vendedor)}</td>
      <td>${valor(r.unidad)}${r.tipoProyecto ? `<div class="ig-cell-sub">${escapeHtml(r.tipoProyecto)}</div>` : ''}</td>
      <td><div class="au-msg">${escapeHtml(r.sync.mensaje)}</div>
        <div class="ig-cell-sub">${[r.sync.fecha, r.sync.manual ? 'Envío manual' : ''].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</div></td>
      <td>${auBadgeEstado(r.estado, 'c2')}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

// Vendedor: el representante del cliente o el de alguna de sus oportunidades.
function auFiltrarC3(filas, f) {
  return filas.filter((c) => !f.vendedor || c.representante === f.vendedor ||
    c.oportunidades.some((o) => o.vendedor === f.vendedor));
}

function auMotivoC3(c) {
  return [c.creadoEnPeriodo ? 'Creado en el período' : '', c.oportunidades.length ? 'Tiene oportunidades en el período' : '']
    .filter(Boolean).join(' · ');
}

function auRenderC3(d, f) {
  const el = document.getElementById('au-c3-tabla');
  const filas = auFiltrarC3(d.c3, f);
  if (!filas.length) { el.innerHTML = '<p class="admin-empty">✓ No hay clientes sin ID de GHL en el período.</p>'; return; }
  el.innerHTML = `<table class="admin-table au-tabla">
    <thead><tr><th>Cliente NetSuite</th><th>Por qué aparece</th><th>Oportunidades del período</th><th>Creado</th><th>Estado</th><th>Representante</th><th>Contacto</th></tr></thead>
    <tbody>${filas.map((c) => `<tr>
      <td>${auLinkNs('cliente', c.idInterno, `${c.codigo || c.idInterno} ${c.nombre}`.trim())}</td>
      <td>${escapeHtml(auMotivoC3(c))}</td>
      <td>${c.oportunidades.length
        ? c.oportunidades.map((o) => `<div>${auLinkNs('opp', o.nsId, o.numero || o.nsId)} <span class="ig-cell-sub">${fmtFecha(o.fecha)}</span></div>`).join('')
        : '—'}</td>
      <td>${c.creacion ? fmtFechaHora(c.creacion) : '<span class="ig-cell-sub">Anterior al período</span>'}</td>
      <td>${valor(c.estado)}</td><td>${escapeHtml(c.representante)}</td>
      <td>${[c.email, c.telefono].filter(Boolean).map(escapeHtml).join(' · ') || '—'}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

function auRenderPie(d) {
  const el = document.getElementById('au-pie');
  const c = d.info.campo;
  const campo = c.id
    ? `Campo de GHL con el ID de NetSuite: <span class="ig-mono">${escapeHtml(c.id)}</span>${c.detectado ? ` (detectado en ${fmtNumero(c.coincidencias)} oportunidades)` : ''}.`
    : '<span class="au-aviso">No se pudo identificar el campo de GHL con el ID de NetSuite: ninguna oportunidad de GHL coincide con las de NetSuite del período. Configurá AU_CF_NS_OPP_ID (sin ese campo no se detectan los contactos con NetSuite Opportunity ID sin cliente).</span>';
  const sinOpp = d.info.c1SinOportunidad
    ? `${fmtNumero(d.info.c1SinOportunidad)} contactos de GHL del período no tienen oportunidad y no se auditan en el control 1. `
    : '';
  el.innerHTML = `${campo} ${sinOpp}Los contactos "sin verificar" se cargaron antes de habilitar la auditoría: se verifican en la próxima actualización del Informe MKT que incluya su fecha de alta.`;
}

/* ── Excel ───────────────────────────────────────────────────────────── */

async function auExportar(cual) {
  const d = au.datos;
  if (!d) return;
  const f = auFiltrosVista();
  let filas = [];
  let hoja = '';
  if (cual === 'c1') {
    hoja = 'Contactos GHL a NetSuite';
    filas = auFiltrarC1(d.c1, f).map((r) => ({
      Estado: { ok: 'En NetSuite', critico: 'Con NetSuite Opportunity ID, sin cliente en NetSuite', falta: 'Sin cliente en NetSuite (información)', sin_verificar: 'Sin verificar' }[r.estado],
      'Contacto GHL': r.nombre, Email: r.email, 'Teléfono': r.telefono, 'ID contacto GHL': r.ghlId,
      'Vendedor GHL': r.vendedor, 'Alta GHL': fmtFecha(r.alta), Origen: r.origen,
      'Visita en GHL': r.visita ? 'Sí' : 'No', 'Oportunidades en GHL': r.oportunidades.length,
      'Nombres oportunidades GHL': r.oportunidades.map((o) => o.nombre).join(' | '),
      'NetSuite Opportunity ID (GHL)': r.oportunidades.map((o) => o.nsOppId).filter(Boolean).join(' | '),
      'Cliente NetSuite': r.clientes.map((c) => `${c.codigo} ${c.nombre}`.trim()).join(' | '),
      'ID interno cliente NS': r.clientes.map((c) => c.idInterno).join(' | '),
      'Estado cliente NS': r.clientes.map((c) => c.estado).join(' | '),
      'Buscado en NS': r.verificado ? fmtFechaHora(r.verificado) : '',
      'Link GHL': `${AU_GHL_URL}/contacts/detail/${r.ghlId}`,
    }));
  } else if (cual === 'c2') {
    hoja = 'Oportunidades NS a GHL';
    filas = auFiltrarC2(d.c2, f).map((r) => ({
      Estado: r.estado === 'ok' ? 'En GHL' : 'Falta en GHL',
      'Oportunidad NS': r.numero, 'ID interno NS': r.nsId, Fecha: fmtFecha(r.fecha),
      Cliente: r.cliente, 'Código cliente': r.codCliente, Representante: r.vendedor,
      'Estado NS': r.estadoNs, Aprobada: r.aprobada === null ? '' : (r.aprobada ? 'Sí' : 'No'),
      'Unidad de negocio': r.unidad, 'Tipo de proyecto': r.tipoProyecto, 'ID contacto GHL': r.crm, 'ID GHL vía empresa matriz': r.viaMatriz ? r.matriz : '',
      'Oportunidad GHL': r.ghl ? r.ghl.nombre : '', 'Etapa GHL': r.ghl ? r.ghl.etapa : '',
      'Diagnóstico': r.diag,
      'Mensaje sync GHL (NetSuite)': r.sync ? r.sync.texto : '',
      'Link NetSuite': `${AU_NS_URL}/app/accounting/transactions/opprtnty.nl?id=${r.nsId}`,
    }));
  } else if (cual === 'c4') {
    hoja = 'Errores de sync NS';
    filas = auFiltrarC4(d.c4, f).map((r) => ({
      Tipo: r.sync.tipo === 'error' ? 'Error' : 'No enviado',
      'Oportunidad NS': r.numero, 'ID interno NS': r.nsId, Fecha: fmtFecha(r.fecha),
      Cliente: r.cliente, 'Código cliente': r.codCliente, Representante: r.vendedor,
      'Estado NS': r.estadoNs, 'Unidad de negocio': r.unidad, 'Tipo de proyecto': r.tipoProyecto,
      Mensaje: r.sync.mensaje, 'Fecha del mensaje': r.sync.fecha, 'Envío manual': r.sync.manual ? 'Sí' : 'No',
      'En GHL': r.estado === 'ok' ? 'Sí' : 'No',
      'Link NetSuite': `${AU_NS_URL}/app/accounting/transactions/opprtnty.nl?id=${r.nsId}`,
    }));
  } else if (cual === 'c3') {
    hoja = 'Clientes NS sin ID GHL';
    filas = auFiltrarC3(d.c3, f).map((c) => ({
      Cliente: c.nombre, 'Código': c.codigo, 'ID interno': c.idInterno, 'Por qué aparece': auMotivoC3(c),
      'Oportunidades del período': c.oportunidades.map((o) => o.numero || o.nsId).join(' | '),
      Creado: c.creacion || 'Anterior al período', Estado: c.estado,
      Representante: c.representante, Email: c.email, 'Teléfono': c.telefono, Origen: c.origen,
      'Link NetSuite': c.idInterno
        ? `${AU_NS_URL}/app/common/entity/custjob.nl?id=${c.idInterno}`
        : c.oportunidades.map((o) => `${AU_NS_URL}/app/accounting/transactions/opprtnty.nl?id=${o.nsId}`).join(' | '),
    }));
  }
  if (!filas.length) { auStatus('No hay filas para exportar con estos filtros.', 'aviso'); return; }
  try {
    const XLSX = await auCargarXlsx();
    const ws = XLSX.utils.json_to_sheet(filas);
    ws['!cols'] = Object.keys(filas[0]).map((h) => ({
      wch: Math.min(60, Math.max(10, h.length + 2, ...filas.map((r) => String(r[h] ?? '').length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, hoja.slice(0, 31));
    const sufijo = `${d.info.desde}_${d.info.hasta}`;
    const vend = f.vendedor ? `_${f.vendedor.replace(/\s+/g, '-')}` : '';
    XLSX.writeFile(wb, `auditoria_${cual}_${sufijo}${vend}.xlsx`);
  } catch (err) {
    auStatus(err.message, true);
  }
}

// Para pruebas fuera del navegador (node): no afecta al sitio.
if (typeof module !== 'undefined') module.exports = { auCruzarBase, auDetectarCampo, auParsearSync, auFiltrarC1, auFiltrarC2, auFiltrarC4 };

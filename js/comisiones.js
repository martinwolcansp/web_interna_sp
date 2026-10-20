/**
 * comisiones.js — Panel de administración → Comisiones (14/10/2026).
 *
 * Pestaña Abonos (tabla comision_abono, migracion_28_comisiones.sql):
 *   - Todos los que tienen "ver" en la sección comisiones ven la tabla y la
 *     exportan. Con "editar" se modifican la unidad de comisión y los nombres,
 *     se agregan o eliminan abonos y se importa un Excel (con vista previa
 *     de los cambios antes de aplicar; nunca borra abonos que no vengan en
 *     el archivo).
 *   - El código es la clave: "ABO-10", "ABO-403-AC"... (mismo criterio que
 *     codigo_abono() en servicios/informe-mkt-api/app/comisiones.py). Un
 *     artículo sin código ABO se identifica por su nombre.
 *
 * Pestaña Unidades de comisión (comision_unidad, migracion_29, 19/10/2026):
 *   agrupan abonos; "Incluido desde" = N por unidad, igual para todos los
 *   vendedores. Un abono está incluido si tiene unidad (desplegable en Abonos).
 *
 *   Con "Comisiona" destildado (migración 30) sus abonos no suman.
 *
 * Pestaña Distribución (comision_vendedor + comision_porcentaje, migracion_31):
 *   vendedores con su ID de empleado de NetSuite (se traen de las
 *   oportunidades) y porcentaje del fondo comisionable de cada unidad que
 *   recibe cada uno. Si no suman 100 % se advierte.
 *   Modelo de fondo comisionable: por unidad y por mes se cuentan las ventas de todos los
 *   vendedores; comisionan ventas − N + 1; fondo comisionable = base × comisionan / ventas;
 *   el fondo comisionable se reparte por porcentaje, sin importar quién vendió.
 *
 * Pestaña Liquidaciones (comision_liquidacion + _vendedor + _linea):
 *   - Generar: POST /comisiones/liquidar {mes} a informe-mkt-api, que
 *     consulta NetSuite, calcula y guarda (permiso editar).
 *   - Ver, exportar a Excel y eliminar (editar). No se editan.
 */

const API_BASE_URL = 'https://informe-mkt-api.200.5.196.50.sslip.io';
const TZ = 'America/Argentina/Buenos_Aires';

const EST = {
  session: null,
  puedeEditar: false,
  abonos: [],            // filas de la base
  cambios: new Map(),    // codigo -> fila editada (incluye nuevas)
  nuevos: new Set(),     // codigos agregados a mano, sin guardar
  borrarPendiente: null, // codigo con confirmación de borrado
  importPendiente: null, // { nuevos: [], modificados: [] }
  unidades: [],          // comision_unidad
  unCambios: new Map(),  // id -> unidad editada (incluye nuevas)
  unNuevas: new Set(),   // ids temporales de unidades sin guardar
  unBorrarPendiente: null,
  liquidaciones: [],
  liqSeleccionada: null, // id
  liqDetalle: null,      // { liq, vendedores, lineas }
  liqBorrarPendiente: null,
  porcentajes: [],       // comision_porcentaje (filas de la base)
  vendedores: [],        // comision_vendedor (id = empleado de NetSuite)
  disTrabajo: {},        // unidad_id -> { vendedor_id: '%' } en edición
  disSucias: new Set(),  // unidades con cambios sin guardar
  disSinTabla: false,    // falta la migración 31
  vendAbierto: null,
  lineaFiltroVend: ''
};

// ───────────────────────── utilidades ─────────────────────────
const $ = (id) => document.getElementById(id);
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pesos(v) {
  if (v === null || v === undefined || v === '') return '—';
  return '$ ' + Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtFechaHora(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}
const NETSUITE_TX = 'https://7138551.app.netsuite.com/app/accounting/transactions/';
function linkNs(tipo, id, texto) {
  if (!id) return esc(texto);
  return `<a class="com-ns" href="${NETSUITE_TX}${tipo}.nl?id=${encodeURIComponent(id)}" target="_blank" rel="noopener" title="Abrir en NetSuite">${esc(texto)}</a>`;
}
function pct(f) { return f == null || f === '' ? '' : (Number(f) * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' %'; }
function fmtDia(s) { if (!s) return ''; const p = String(s).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; }
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
function fmtMes(s) { const p = String(s).split('-'); return `${MESES[Number(p[1]) - 1]} ${p[0]}`; }
function status(id, texto, tipo) {
  const el = $(id);
  el.textContent = texto || '';
  el.className = 'com-status' + (tipo ? ' com-status--' + tipo : '');
}
function normEspacios(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

// Mismo criterio que codigo_abono() del servicio.
function codigoAbono(nombre) {
  const t = normEspacios(nombre);
  const m = t.match(/^ABO[\s\-_.]*(\d+(?:-[A-Z0-9]+)*)/i);
  return m ? 'ABO-' + m[1].toUpperCase() : t;
}
function compararCodigos(a, b) { return String(a).localeCompare(String(b), 'es', { numeric: true }); }
function aBool(v) {
  const t = normEspacios(v).toLowerCase();
  return ['x', 'si', 'sí', 's', 'true', 'verdadero', '1', 'yes'].includes(t) || v === true || v === 1;
}

// ───────────────────────── arranque ─────────────────────────
document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session) return; // page-guard.js muestra el mensaje de acceso
  EST.session = e.detail.session;
  const r = await window.supabaseClient.rpc('fn_tiene_permiso', { p_seccion_id: 'comisiones', p_nivel: 'editar' });
  EST.puedeEditar = !!(r && r.data === true);
  document.body.classList.toggle('com-es-editor', EST.puedeEditar);
  iniciarTabs();
  iniciarAbonos();
  iniciarUnidades();
  iniciarDistribucion();
  iniciarLiquidaciones();
  await cargarUnidades();
  await cargarAbonos();
  await cargarLiquidaciones();
  await cargarPorcentajes();
});

function iniciarTabs() {
  document.querySelectorAll('.com-tab').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.com-tab').forEach((x) => {
        const activo = x === b;
        x.classList.toggle('is-active', activo);
        x.setAttribute('aria-selected', activo ? 'true' : 'false');
      });
      ['abonos', 'unidades', 'distribucion', 'liquidaciones'].forEach((t) => { $('com-panel-' + t).hidden = b.dataset.tab !== t; });
    });
  });
}

// ═══════════════════════════ ABONOS ═══════════════════════════
function iniciarAbonos() {
  $('com-ab-buscar').addEventListener('input', renderAbonos);
  $('com-ab-filtro').addEventListener('change', renderAbonos);
  $('com-ab-exportar').addEventListener('click', exportarAbonos);
  $('com-ab-guardar').addEventListener('click', guardarAbonos);
  $('com-ab-agregar').addEventListener('click', agregarAbono);
  $('com-ab-importar').addEventListener('change', (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (f) leerArchivoImportacion(f);
  });
  $('com-imp-cancelar').addEventListener('click', () => { EST.importPendiente = null; $('com-imp').hidden = true; });
  $('com-imp-confirmar').addEventListener('click', aplicarImportacion);

  // Delegación de eventos de la tabla
  const tbody = $('com-ab-tbody');
  tbody.addEventListener('input', (ev) => {
    const tr = ev.target.closest('tr[data-codigo]');
    if (!tr) return;
    const campo = ev.target.dataset.campo;
    if (!campo) return;
    let valor = ev.target.value;
    if (campo === 'unidad_id') valor = valor || null;
    if (campo === 'codigo') return; // se valida al salir del campo
    editar(tr.dataset.codigo, campo, valor);
    tr.classList.toggle('is-dirty', EST.cambios.has(tr.dataset.codigo) && !EST.nuevos.has(tr.dataset.codigo));
    tr.classList.toggle('is-incluido', !!filaActual(tr.dataset.codigo).unidad_id);
    actualizarBotonGuardar();
  });
  tbody.addEventListener('change', (ev) => {
    if (ev.target.dataset.campo !== 'codigo') return;
    const tr = ev.target.closest('tr[data-codigo]');
    renombrarNuevo(tr.dataset.codigo, ev.target.value);
  });
  tbody.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-accion]');
    if (!b) return;
    const codigo = b.closest('tr[data-codigo]').dataset.codigo;
    if (b.dataset.accion === 'borrar') pedirBorrado(codigo);
    if (b.dataset.accion === 'confirmar-borrar') borrarAbono(codigo);
  });
}

async function cargarAbonos() {
  status('com-ab-status', 'Cargando abonos…');
  const { data, error } = await window.supabaseClient
    .from('comision_abono')
    .select('codigo, nombre, nombre_mostrar, unidad_id, actualizado_en, actualizado_por')
    .order('codigo');
  if (error) {
    status('com-ab-status', 'No se pudieron leer los abonos: ' + error.message, 'error');
    $('com-ab-tbody').innerHTML = '';
    return;
  }
  EST.abonos = (data || []).sort((a, b) => compararCodigos(a.codigo, b.codigo));
  EST.cambios.clear();
  EST.nuevos.clear();
  EST.borrarPendiente = null;
  status('com-ab-status', '');
  $('com-ab-exportar').disabled = false;
  renderAbonos();
  renderUnidades();
}

function filaBase(codigo) { return EST.abonos.find((a) => a.codigo === codigo) || null; }
function filaActual(codigo) { return EST.cambios.get(codigo) || filaBase(codigo); }

function editar(codigo, campo, valor) {
  const base = filaBase(codigo);
  const actual = { ...(EST.cambios.get(codigo) || base) };
  actual[campo] = valor;
  if (base && !EST.nuevos.has(codigo)) {
    const igual = ['nombre', 'nombre_mostrar', 'unidad_id']
      .every((k) => normEspacios(actual[k]) === normEspacios(base[k]));
    if (igual) { EST.cambios.delete(codigo); return; }
  }
  EST.cambios.set(codigo, actual);
}

function actualizarBotonGuardar() {
  const n = EST.cambios.size;
  $('com-ab-guardar').disabled = n === 0;
  $('com-ab-guardar').innerHTML = '<i class="ti ti-device-floppy" aria-hidden="true"></i> ' +
    (n ? `Guardar cambios (${n})` : 'Guardar cambios');
}

function listaVisible() {
  const q = normEspacios($('com-ab-buscar').value).toLowerCase();
  const filtro = $('com-ab-filtro').value;
  const nuevos = [...EST.nuevos].map((c) => EST.cambios.get(c)).filter(Boolean);
  const todas = nuevos.concat(EST.abonos.map((a) => EST.cambios.get(a.codigo) || a));
  return todas.filter((a) => {
    if (filtro === 'si' && !a.unidad_id) return false;
    if (filtro === 'no' && a.unidad_id) return false;
    if (filtro.startsWith('u:') && a.unidad_id !== filtro.slice(2)) return false;
    if (q && !`${a.codigo} ${a.nombre || ''} ${a.nombre_mostrar || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function nombreUnidad(id) {
  const u = EST.unidades.find((x) => x.id === id);
  return u ? u.nombre : '';
}
function opcionesUnidad(sel) {
  return '<option value="">— No incluido —</option>' + EST.unidades
    .slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
    .map((u) => `<option value="${esc(u.id)}"${u.id === sel ? ' selected' : ''}>${esc(u.nombre)} (${u.comisiona === false ? 'no comisiona' : 'desde ' + esc(u.incluido_desde)})</option>`).join('');
}
function actualizarFiltroUnidades() {
  const sel = $('com-ab-filtro');
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todos</option><option value="si">Incluidos (con unidad)</option><option value="no">No incluidos</option>' +
    EST.unidades.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }))
      .map((u) => `<option value="u:${esc(u.id)}">Unidad: ${esc(u.nombre)}</option>`).join('');
  sel.value = [...sel.options].some((o) => o.value === actual) ? actual : '';
}

function renderAbonos() {
  const filas = listaVisible();
  const ed = EST.puedeEditar;
  const dis = ed ? '' : ' disabled';
  $('com-ab-tbody').innerHTML = filas.length ? filas.map((a) => {
    const nuevo = EST.nuevos.has(a.codigo);
    const clases = [a.unidad_id ? 'is-incluido' : '', nuevo ? 'is-nuevo' : (EST.cambios.has(a.codigo) ? 'is-dirty' : '')].join(' ');
    const borrar = EST.borrarPendiente === a.codigo
      ? `<button type="button" class="com-icon-btn com-icon-btn--confirm" data-accion="confirmar-borrar">Eliminar</button>`
      : `<button type="button" class="com-icon-btn" data-accion="borrar" title="Eliminar abono"><i class="ti ti-trash" aria-hidden="true"></i></button>`;
    return `<tr data-codigo="${esc(a.codigo)}" class="${clases}">
      <td>${nuevo && ed ? `<input class="admin-input com-codigo" data-campo="codigo" value="${esc(a.codigo)}" placeholder="ABO-xx">` : `<span class="com-codigo">${esc(a.codigo)}</span>`}</td>
      <td><input class="admin-input" data-campo="nombre" value="${esc(a.nombre)}"${dis}></td>
      <td><input class="admin-input" data-campo="nombre_mostrar" value="${esc(a.nombre_mostrar)}"${dis}></td>
      <td><select class="admin-select com-select-unidad" data-campo="unidad_id"${dis} aria-label="Unidad de comisión">${opcionesUnidad(a.unidad_id)}</select></td>
      <td><span class="com-meta">${nuevo ? 'Nuevo, sin guardar' : esc(fmtFechaHora(a.actualizado_en))}${a.actualizado_por && !nuevo ? '<br>' + esc(a.actualizado_por) : ''}</span></td>
      <td class="com-solo-editor">${borrar}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="admin-empty">No hay abonos con este filtro.</td></tr>';
  const total = EST.abonos.length + EST.nuevos.size;
  const incluidos = EST.abonos.map((a) => filaActual(a.codigo)).concat([...EST.nuevos].map((c) => EST.cambios.get(c)))
    .filter((a) => a && a.unidad_id).length;
  $('com-ab-cuenta').textContent = `${filas.length} de ${total} abonos · ${incluidos} incluidos`;
  actualizarBotonGuardar();
}

function agregarAbono() {
  let n = 1, codigo;
  do { codigo = `NUEVO-${n++}`; } while (filaActual(codigo));
  EST.nuevos.add(codigo);
  EST.cambios.set(codigo, { codigo, nombre: '', nombre_mostrar: '', unidad_id: null });
  $('com-ab-buscar').value = '';
  $('com-ab-filtro').value = '';
  renderAbonos();
  const input = document.querySelector(`tr[data-codigo="${CSS.escape(codigo)}"] input[data-campo="codigo"]`);
  if (input) { input.select(); input.focus(); }
  status('com-ab-status', 'Completá el código (ej. ABO-72) y el nombre como figura en NetSuite, y guardá.');
}

function renombrarNuevo(codigoViejo, valor) {
  const nuevo = codigoAbono(valor);
  if (!nuevo) return;
  if (nuevo !== codigoViejo && filaActual(nuevo)) {
    status('com-ab-status', `El código ${nuevo} ya existe.`, 'error');
    renderAbonos();
    return;
  }
  const fila = { ...EST.cambios.get(codigoViejo), codigo: nuevo };
  EST.cambios.delete(codigoViejo); EST.nuevos.delete(codigoViejo);
  EST.cambios.set(nuevo, fila); EST.nuevos.add(nuevo);
  status('com-ab-status', '');
  renderAbonos();
}

function pedirBorrado(codigo) {
  if (EST.nuevos.has(codigo)) { // nunca se guardó: se descarta
    EST.nuevos.delete(codigo); EST.cambios.delete(codigo);
    renderAbonos();
    return;
  }
  EST.borrarPendiente = EST.borrarPendiente === codigo ? null : codigo;
  renderAbonos();
}

async function borrarAbono(codigo) {
  const { error } = await window.supabaseClient.from('comision_abono').delete().eq('codigo', codigo);
  if (error) { status('com-ab-status', 'No se pudo eliminar: ' + error.message, 'error'); return; }
  status('com-ab-status', `Se eliminó ${codigo}.`, 'ok');
  const pendientes = new Map(EST.cambios); const nuevos = new Set(EST.nuevos);
  await cargarAbonos();
  pendientes.delete(codigo);
  pendientes.forEach((v, k) => EST.cambios.set(k, v)); nuevos.forEach((c) => EST.nuevos.add(c));
  renderAbonos();
}

function filaParaGuardar(a) {
  return {
    codigo: a.codigo,
    nombre: normEspacios(a.nombre) || a.codigo,
    nombre_mostrar: normEspacios(a.nombre_mostrar) || null,
    unidad_id: a.unidad_id || null,
    actualizado_en: new Date().toISOString(),
    actualizado_por: EST.session.user.email || null
  };
}

async function guardarAbonos() {
  const filas = [...EST.cambios.values()];
  const malos = filas.filter((a) => !a.codigo || /^NUEVO-\d+$/.test(a.codigo));
  if (malos.length) { status('com-ab-status', 'Completá el código de los abonos nuevos antes de guardar.', 'error'); return; }
  $('com-ab-guardar').disabled = true;
  status('com-ab-status', 'Guardando…');
  const { error } = await window.supabaseClient.from('comision_abono').upsert(filas.map(filaParaGuardar), { onConflict: 'codigo' });
  if (error) { status('com-ab-status', 'No se pudo guardar: ' + error.message, 'error'); actualizarBotonGuardar(); return; }
  await cargarAbonos();
  status('com-ab-status', `Se guardaron ${filas.length} abono(s).`, 'ok');
}

// ── Exportar / importar ──
async function exportarAbonos() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Abonos');
  ws.columns = [
    { header: 'Código', key: 'codigo', width: 16 },
    { header: 'Nombre', key: 'nombre', width: 60 },
    { header: 'Nombre para mostrar', key: 'nombre_mostrar', width: 50 },
    { header: 'Unidad de comisión', key: 'unidad', width: 36 },
    { header: 'Incluido', key: 'incluido', width: 10 },
    { header: 'Última modificación', key: 'actualizado_en', width: 20 },
    { header: 'Modificado por', key: 'actualizado_por', width: 30 }
  ];
  EST.abonos.forEach((a) => ws.addRow({
    codigo: a.codigo, nombre: a.nombre, nombre_mostrar: a.nombre_mostrar || '',
    unidad: nombreUnidad(a.unidad_id), incluido: a.unidad_id ? 'Sí' : 'No',
    actualizado_en: fmtFechaHora(a.actualizado_en), actualizado_por: a.actualizado_por || ''
  }));
  estilarEncabezado(ws);
  ws.autoFilter = { from: 'A1', to: 'G1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const wu = wb.addWorksheet('Unidades');
  wu.columns = [
    { header: 'Unidad de comisión', key: 'nombre', width: 40 },
    { header: 'Incluido desde', key: 'incluido_desde', width: 15 },
    { header: 'Comisiona', key: 'comisiona', width: 11 },
    { header: 'Abonos', key: 'abonos', width: 60 }
  ];
  const unidades = EST.unidades.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  unidades.forEach((u) => wu.addRow({ nombre: u.nombre, incluido_desde: u.incluido_desde, comisiona: u.comisiona === false ? 'No' : 'Sí',
    abonos: EST.abonos.filter((a) => a.unidad_id === u.id).map((a) => a.codigo).sort(compararCodigos).join(', ') }));
  estilarEncabezado(wu);
  if (unidades.length) {
    ws.dataValidations.add(`D2:D${Math.max(2, EST.abonos.length + 200)}`,
      { type: 'list', allowBlank: true, formulae: [`Unidades!$A$2:$A$${unidades.length + 1}`] });
  }

  const ayuda = wb.addWorksheet('Instrucciones');
  ayuda.getColumn(1).width = 110;
  [
    'Abonos para comisiones — cómo actualizar desde este archivo',
    '',
    '1. En la hoja Abonos, elegí la Unidad de comisión de cada abono (la lista sale de la hoja Unidades). Vacía = no incluido.',
    '2. Para agregar un abono nuevo, sumá una fila con el Nombre tal como figura en NetSuite (ej. "ABO-72 SP Comercio Seguro - Kit 4").',
    '   El Código se puede dejar vacío: se toma del nombre (ABO-72).',
    '3. Subí el archivo en Panel de administración → Comisiones → Abonos → Importar Excel. Antes de aplicar se muestra qué cambia.',
    '',
    'Las unidades se crean y modifican en la pestaña Unidades de comisión del Panel (la hoja Unidades de este archivo es solo de consulta).',
    'Los abonos que no estén en el archivo no se borran. La columna Incluido es informativa: manda la Unidad de comisión.',
    'Incluido desde = N (de la unidad): por vendedor y por mes, comisionan las ventas de la unidad desde la N-ésima;',
    'la comisión es la base comisionable de la unidad × ventas que comisionan / ventas.'
  ].forEach((t, i) => { const c = ayuda.getCell(`A${i + 1}`); c.value = t; if (i === 0) c.font = { bold: true, size: 13, color: { argb: 'FF1F3864' } }; });
  await descargarLibro(wb, `Abonos_comisiones_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function estilarEncabezado(ws) {
  const fila = ws.getRow(1);
  fila.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
  fila.alignment = { vertical: 'middle' };
}

async function descargarLibro(wb, nombre) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function leerArchivoImportacion(file) {
  status('com-ab-status', `Leyendo ${file.name}…`);
  try {
    const filas = file.name.toLowerCase().endsWith('.csv') ? await leerCsv(file) : await leerXlsx(file);
    prepararImportacion(filas);
  } catch (err) {
    console.error('[comisiones.js] importación', err);
    status('com-ab-status', 'No se pudo leer el archivo: ' + err.message, 'error');
  }
}

// Encabezados aceptados (sin tildes ni mayúsculas): los de la exportación y los del listado original.
const ENCABEZADOS = {
  codigo: ['codigo'],
  nombre: ['nombre'],
  nombre_mostrar: ['nombre para mostrar'],
  incluido: ['incluido', 'incluido para comision', 'inlcuido para comision'],
  unidad: ['unidad de comision', 'unidad']
};
function claveEncabezado(t) {
  const n = normEspacios(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return Object.keys(ENCABEZADOS).find((k) => ENCABEZADOS[k].includes(n)) || null;
}
function filasDesdeMatriz(matriz) {
  if (!matriz.length) throw new Error('El archivo está vacío.');
  const cols = matriz[0].map(claveEncabezado);
  if (!cols.includes('nombre') && !cols.includes('codigo')) throw new Error('No se encontró la columna Nombre ni Código en la primera fila.');
  return matriz.slice(1).map((celdas) => {
    const o = {};
    cols.forEach((k, i) => { if (k) o[k] = celdas[i]; });
    return o;
  }).filter((o) => normEspacios(o.nombre) || normEspacios(o.codigo));
}
async function leerXlsx(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet('Abonos') || wb.worksheets[0];
  const matriz = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    const v = [];
    for (let c = 1; c <= Math.max(ws.columnCount, 7); c++) {
      const cel = row.getCell(c).value;
      v.push(cel && typeof cel === 'object' ? (cel.text || cel.result || (cel.richText ? cel.richText.map((r) => r.text).join('') : '')) : cel);
    }
    matriz.push(v);
  });
  return filasDesdeMatriz(matriz);
}
async function leerCsv(file) {
  const buf = await file.arrayBuffer();
  let texto = new TextDecoder('utf-8').decode(buf);
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf); // CSV de Excel en Windows
  texto = texto.replace(/^﻿/, '');
  const sep = (texto.split('\n')[0].match(/;/g) || []).length >= (texto.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const matriz = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === sep) { fila.push(campo); campo = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo); campo = '';
      if (fila.some((x) => x !== '')) matriz.push(fila);
      fila = [];
    } else campo += ch;
  }
  fila.push(campo);
  if (fila.some((x) => x !== '')) matriz.push(fila);
  return filasDesdeMatriz(matriz);
}

function prepararImportacion(filas) {
  const porNombre = new Map(EST.unidades.map((u) => [normEspacios(u.nombre).toLowerCase(), u]));
  const vistos = new Map();
  const errores = [];
  filas.forEach((o) => {
    const codigo = normEspacios(o.codigo) ? codigoAbono(o.codigo) : codigoAbono(o.nombre);
    if (!codigo || vistos.has(codigo)) return; // repetidos: vale el primero
    const base = filaBase(codigo);
    // Unidad: la columna "Unidad de comisión" manda; si el archivo no la
    // trae, "Incluido = No" quita la unidad e "Incluido = Sí" la mantiene.
    let unidad;
    if (o.unidad !== undefined) {
      const t = normEspacios(o.unidad);
      if (!t || /^(—\s*)?no incluido/i.test(t)) unidad = null;
      else if (porNombre.has(t.toLowerCase())) unidad = porNombre.get(t.toLowerCase()).id;
      else { errores.push(`${codigo}: la unidad «${t}» no existe`); return; }
    } else if (o.incluido !== undefined) {
      if (!aBool(o.incluido)) unidad = null;
      else if (base && base.unidad_id) unidad = base.unidad_id;
      else { errores.push(`${codigo}: incluido sin unidad de comisión (asignala en el Panel o agregá la columna Unidad de comisión)`); return; }
    }
    vistos.set(codigo, {
      codigo,
      nombre: normEspacios(o.nombre) || codigo,
      nombre_mostrar: o.nombre_mostrar !== undefined ? (normEspacios(o.nombre_mostrar) || null) : undefined,
      unidad_id: unidad
    });
  });
  const nuevos = [], modificados = [];
  vistos.forEach((imp) => {
    const base = filaBase(imp.codigo);
    if (!base) {
      nuevos.push({ ...imp, nombre_mostrar: imp.nombre_mostrar ?? null, unidad_id: imp.unidad_id ?? null });
      return;
    }
    const final = {
      ...base,
      nombre: imp.nombre || base.nombre,
      nombre_mostrar: imp.nombre_mostrar === undefined ? base.nombre_mostrar : imp.nombre_mostrar,
      unidad_id: imp.unidad_id === undefined ? base.unidad_id : imp.unidad_id
    };
    const campos = ['nombre', 'nombre_mostrar', 'unidad_id'].filter((k) => normEspacios(final[k]) !== normEspacios(base[k]));
    if (campos.length) modificados.push({ antes: base, despues: final, campos });
  });
  const sinCambios = vistos.size - nuevos.length - modificados.length;
  const ausentes = EST.abonos.filter((a) => !vistos.has(a.codigo)).length;
  const txtErrores = errores.length ? ` ${errores.length} fila(s) con error no se aplican: ${errores.join('; ')}.` : '';
  if (!nuevos.length && !modificados.length) {
    status('com-ab-status', `El archivo no trae cambios (${sinCambios} abonos iguales${ausentes ? `, ${ausentes} de la base no están en el archivo y se dejan como están` : ''}).${txtErrores}`,
      errores.length ? 'error' : 'ok');
    return;
  }
  EST.importPendiente = { nuevos, modificados };
  $('com-imp-resumen').textContent = `${nuevos.length} abono(s) nuevo(s), ${modificados.length} modificado(s), ${sinCambios} sin cambios.` +
    (ausentes ? ` ${ausentes} abono(s) de la base no están en el archivo: no se borran.` : '') + txtErrores + ' Revisá y confirmá.';
  const un = (id) => nombreUnidad(id) || '— No incluido —';
  const celda = (m, k, fmt) => (m.campos.includes(k) ? `<span class="com-antes">${esc(fmt(m.antes[k]))}</span>${esc(fmt(m.despues[k]))}` : esc(fmt(m.despues[k])));
  $('com-imp-tbody').innerHTML =
    nuevos.map((n) => `<tr><td><span class="com-cambio com-cambio--nuevo">Nuevo</span></td><td class="com-codigo">${esc(n.codigo)}</td>
      <td>${esc(n.nombre)}</td><td>${esc(un(n.unidad_id))}</td></tr>`).join('') +
    modificados.map((m) => `<tr><td><span class="com-cambio com-cambio--mod">Modificado</span></td><td class="com-codigo">${esc(m.despues.codigo)}</td>
      <td>${celda(m, 'nombre', (x) => x || '')}${m.campos.includes('nombre_mostrar') ? `<br><small>Mostrar: ${celda(m, 'nombre_mostrar', (x) => x || '—')}</small>` : ''}</td>
      <td>${celda(m, 'unidad_id', un)}</td></tr>`).join('');
  $('com-imp').hidden = false;
  status('com-ab-status', '');
  $('com-imp').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function aplicarImportacion() {
  const p = EST.importPendiente;
  if (!p) return;
  $('com-imp-confirmar').disabled = true;
  const filas = p.nuevos.concat(p.modificados.map((m) => m.despues)).map(filaParaGuardar);
  const { error } = await window.supabaseClient.from('comision_abono').upsert(filas, { onConflict: 'codigo' });
  $('com-imp-confirmar').disabled = false;
  if (error) { status('com-ab-status', 'No se pudo aplicar la importación: ' + error.message, 'error'); return; }
  EST.importPendiente = null;
  $('com-imp').hidden = true;
  await cargarAbonos();
  status('com-ab-status', `Importación aplicada: ${p.nuevos.length} nuevo(s), ${p.modificados.length} modificado(s).`, 'ok');
}

// ═══════════════════════════ UNIDADES DE COMISIÓN ═══════════════════════════
function iniciarUnidades() {
  $('com-un-agregar').addEventListener('click', agregarUnidad);
  $('com-un-guardar').addEventListener('click', guardarUnidades);
  $('com-un-confirm-no').addEventListener('click', () => pedirBorradoUnidad(null));
  $('com-un-confirm-si').addEventListener('click', () => { if (EST.unBorrarPendiente) borrarUnidad(EST.unBorrarPendiente); });
  const tbody = $('com-un-tbody');
  tbody.addEventListener('input', (ev) => {
    const tr = ev.target.closest('tr[data-id]');
    const campo = ev.target.dataset.campo;
    if (!tr || !campo) return;
    let valor = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    if (campo === 'incluido_desde') valor = Math.max(1, parseInt(valor, 10) || 1);
    editarUnidad(tr.dataset.id, campo, valor);
    if (campo === 'comisiona') tr.classList.toggle('com-un-off', !valor);
    tr.classList.toggle('is-dirty', EST.unCambios.has(tr.dataset.id) && !EST.unNuevas.has(tr.dataset.id));
    actualizarBotonGuardarUnidades();
  });
  tbody.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-accion="borrar"]');
    if (b) pedirBorradoUnidad(b.closest('tr[data-id]').dataset.id);
  });
}

async function cargarUnidades() {
  const { data, error } = await window.supabaseClient
    .from('comision_unidad')
    .select('id, nombre, incluido_desde, comisiona, descripcion, actualizado_en, actualizado_por')
    .order('nombre');
  if (error) {
    EST.unidades = [];
    status('com-un-status', 'No se pudieron leer las unidades: ' + error.message, 'error');
    $('com-un-tbody').innerHTML = '';
    actualizarFiltroUnidades();
    return;
  }
  EST.unidades = data || [];
  EST.unCambios.clear();
  EST.unNuevas.clear();
  actualizarFiltroUnidades();
  renderUnidades();
  if (EST.porcentajes.length || Object.keys(EST.disTrabajo).length) renderDistribucion();
}

function unidadBase(id) { return EST.unidades.find((u) => u.id === id) || null; }
function unidadActual(id) { return EST.unCambios.get(id) || unidadBase(id); }

function editarUnidad(id, campo, valor) {
  const base = unidadBase(id);
  const actual = { ...(EST.unCambios.get(id) || base) };
  actual[campo] = valor;
  if (base && !EST.unNuevas.has(id) &&
      normEspacios(actual.nombre) === normEspacios(base.nombre) && Number(actual.incluido_desde) === Number(base.incluido_desde) &&
      (actual.comisiona !== false) === (base.comisiona !== false)) {
    EST.unCambios.delete(id);
    return;
  }
  EST.unCambios.set(id, actual);
}

function actualizarBotonGuardarUnidades() {
  const n = EST.unCambios.size;
  $('com-un-guardar').disabled = n === 0;
  $('com-un-guardar').innerHTML = '<i class="ti ti-device-floppy" aria-hidden="true"></i> ' + (n ? `Guardar cambios (${n})` : 'Guardar cambios');
}

function renderUnidades() {
  const tbody = $('com-un-tbody');
  if (!tbody) return;
  const dis = EST.puedeEditar ? '' : ' disabled';
  const lista = [...EST.unNuevas].map((id) => EST.unCambios.get(id)).filter(Boolean)
    .concat(EST.unidades.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true })).map((u) => EST.unCambios.get(u.id) || u));
  tbody.innerHTML = lista.length ? lista.map((u) => {
    const nueva = EST.unNuevas.has(u.id);
    const abonos = EST.abonos.filter((a) => a.unidad_id === u.id).map((a) => a.codigo).sort(compararCodigos);
    const clase = (nueva ? 'is-nuevo' : (EST.unCambios.has(u.id) ? 'is-dirty' : (EST.unBorrarPendiente === u.id ? 'com-liq-borrar' : ''))) +
      (u.comisiona === false ? ' com-un-off' : '');
    return `<tr data-id="${esc(u.id)}" class="${clase}">
      <td><input class="admin-input" data-campo="nombre" value="${esc(u.nombre)}" placeholder="Ej. Comercio Seguro"${dis}></td>
      <td class="com-c"><input type="checkbox" class="admin-checkbox" data-campo="comisiona"${u.comisiona !== false ? ' checked' : ''}${dis} aria-label="Comisiona"></td>
      <td class="com-c"><input type="number" min="1" step="1" class="admin-input com-input-num" data-campo="incluido_desde" value="${esc(u.incluido_desde || 1)}"${dis} aria-label="Incluido desde"></td>
      <td>${abonos.length ? abonos.map((c) => `<span class="com-chip">${esc(c)}</span>`).join(' ') : '<span class="com-meta">Sin abonos: asignalos en la pestaña Abonos</span>'}</td>
      <td><span class="com-meta">${nueva ? 'Nueva, sin guardar' : esc(fmtFechaHora(u.actualizado_en))}${u.actualizado_por && !nueva ? '<br>' + esc(u.actualizado_por) : ''}</span></td>
      <td class="com-solo-editor"><button type="button" class="com-icon-btn" data-accion="borrar" title="Eliminar unidad"><i class="ti ti-trash" aria-hidden="true"></i></button></td>
    </tr>`;
  }).join('') : '<tr><td colspan="6" class="admin-empty">Todavía no hay unidades. Agregá una y asignale abonos en la pestaña Abonos.</td></tr>';
  actualizarBotonGuardarUnidades();
}

function agregarUnidad() {
  let n = 1, id;
  do { id = `nueva-${n++}`; } while (unidadActual(id));
  EST.unNuevas.add(id);
  EST.unCambios.set(id, { id, nombre: '', incluido_desde: 1, comisiona: true });
  renderUnidades();
  const input = document.querySelector(`#com-un-tbody tr[data-id="${CSS.escape(id)}"] input[data-campo="nombre"]`);
  if (input) input.focus();
  status('com-un-status', 'Poné el nombre y el Incluido desde, guardá, y después asignale abonos en la pestaña Abonos.');
}

async function guardarUnidades() {
  const filas = [...EST.unCambios.values()];
  const nombres = new Map();
  EST.unidades.forEach((u) => { if (!EST.unCambios.has(u.id)) nombres.set(normEspacios(u.nombre).toLowerCase(), u.id); });
  for (const u of filas) {
    const n = normEspacios(u.nombre);
    if (!n) { status('com-un-status', 'Todas las unidades necesitan un nombre.', 'error'); return; }
    if (nombres.has(n.toLowerCase())) { status('com-un-status', `Ya existe una unidad llamada «${n}».`, 'error'); return; }
    nombres.set(n.toLowerCase(), u.id);
  }
  $('com-un-guardar').disabled = true;
  status('com-un-status', 'Guardando…');
  const sb = window.supabaseClient;
  const meta = { actualizado_en: new Date().toISOString(), actualizado_por: EST.session.user.email || null };
  const limpio = (u) => ({ nombre: normEspacios(u.nombre), incluido_desde: Math.max(1, parseInt(u.incluido_desde, 10) || 1),
    comisiona: u.comisiona !== false, ...meta });
  const nuevas = filas.filter((u) => EST.unNuevas.has(u.id)).map(limpio);
  const existentes = filas.filter((u) => !EST.unNuevas.has(u.id)).map((u) => ({ id: u.id, ...limpio(u) }));
  const r1 = nuevas.length ? await sb.from('comision_unidad').insert(nuevas) : { error: null };
  const r2 = !r1.error && existentes.length ? await sb.from('comision_unidad').upsert(existentes, { onConflict: 'id' }) : { error: null };
  const error = r1.error || r2.error;
  if (error) { status('com-un-status', 'No se pudo guardar: ' + error.message, 'error'); actualizarBotonGuardarUnidades(); return; }
  await cargarUnidades();
  renderAbonos();
  status('com-un-status', `Se guardaron ${filas.length} unidad(es).`, 'ok');
}

function pedirBorradoUnidad(id) {
  if (id && EST.unNuevas.has(id)) { // nunca se guardó: se descarta
    EST.unNuevas.delete(id); EST.unCambios.delete(id);
    renderUnidades();
    return;
  }
  EST.unBorrarPendiente = id;
  const u = id && unidadBase(id);
  $('com-un-confirm').hidden = !u;
  if (u) {
    const n = EST.abonos.filter((a) => a.unidad_id === id).length;
    $('com-un-confirm-texto').innerHTML = `¿Eliminar la unidad <b>${esc(u.nombre)}</b>? ` +
      (n ? `Sus ${n} abono(s) quedan <b>no incluidos</b> hasta que les asignes otra unidad. ` : '') +
      'Las liquidaciones ya generadas no cambian.';
    $('com-un-confirm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  renderUnidades();
}

async function borrarUnidad(id) {
  const u = unidadBase(id);
  const sb = window.supabaseClient;
  $('com-un-confirm-si').disabled = true;
  const { error } = await sb.from('comision_unidad').delete().eq('id', id);
  $('com-un-confirm-si').disabled = false;
  EST.unBorrarPendiente = null;
  $('com-un-confirm').hidden = true;
  if (error) { status('com-un-status', 'No se pudo eliminar: ' + error.message, 'error'); renderUnidades(); return; }
  const quedo = await sb.from('comision_unidad').select('id').eq('id', id);
  if (!quedo.error && quedo.data && quedo.data.length) {
    status('com-un-status', 'La base no eliminó la unidad: tu usuario necesita permiso "editar" en la sección Comisiones.', 'error');
    renderUnidades();
    return;
  }
  await cargarUnidades();
  await cargarAbonos();
  status('com-un-status', `Se eliminó la unidad ${u ? u.nombre : ''}.`, 'ok');
}

// ═══════════════════════════ DISTRIBUCIÓN DEL FONDO COMISIONABLE ═══════════════════════════
// Vendedores (comision_vendedor, migración 31): id = ID interno del empleado
// representante de ventas en NetSuite. Se cargan desde las oportunidades con
// "Actualizar desde NetSuite" (POST /comisiones/vendedores/sincronizar) y al
// liquidar. El nombre que se muestra y "Activo" se editan acá.
// Porcentajes (comision_porcentaje): % del fondo comisionable de cada unidad
// por vendedor_id. Si no suman 100 % se advierte (no se bloquea): lo que
// falta queda sin repartir en la liquidación.
function iniciarDistribucion() {
  $('com-dis-guardar').addEventListener('click', guardarPorcentajes);
  $('com-dis-sync').addEventListener('click', sincronizarVendedores);
  const cont = $('com-dis-unidades');
  cont.addEventListener('input', (ev) => {
    const tr = ev.target.closest('tr[data-vid]');
    const card = ev.target.closest('[data-unidad]');
    if (!tr || !card) return;
    const uid = card.dataset.unidad;
    (EST.disTrabajo[uid] = EST.disTrabajo[uid] || {})[tr.dataset.vid] = ev.target.value;
    EST.disSucias.add(uid);
    actualizarTotalUnidad(uid);
    actualizarBotonGuardarPorcentajes();
  });
  cont.addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-accion="repartir"]');
    const card = ev.target.closest('[data-unidad]');
    if (!b || !card) return;
    // Reparte el 100 % en partes iguales entre los vendedores activos.
    const uid = card.dataset.unidad;
    const ids = vendedoresDeUnidad(uid).filter((v) => v.activo !== false).map((v) => String(v.id));
    if (!ids.length) return;
    const parte = Math.floor((100 / ids.length) * 1000) / 1000;
    const t = EST.disTrabajo[uid] = {};
    ids.forEach((id, i) => { t[id] = String(i === ids.length - 1 ? +(100 - parte * (ids.length - 1)).toFixed(3) : parte); });
    EST.disSucias.add(uid);
    renderDistribucion();
  });
  const tv = $('com-ven-tbody');
  tv.addEventListener('change', async (ev) => {
    const tr = ev.target.closest('tr[data-vid]');
    const campo = ev.target.dataset.campo;
    if (!tr || !campo) return;
    const valor = campo === 'activo' ? ev.target.checked : normEspacios(ev.target.value);
    if (campo === 'nombre' && !valor) { renderVendedores(); return; }
    const { error } = await window.supabaseClient.from('comision_vendedor')
      .update({ [campo]: valor, actualizado_en: new Date().toISOString(), actualizado_por: EST.session.user.email || null })
      .eq('id', Number(tr.dataset.vid));
    if (error) { status('com-dis-status', 'No se pudo guardar el vendedor: ' + error.message, 'error'); return; }
    const v = EST.vendedores.find((x) => String(x.id) === tr.dataset.vid);
    if (v) v[campo] = valor;
    status('com-dis-status', 'Vendedor actualizado.', 'ok');
    renderDistribucion();
  });
}

async function cargarPorcentajes() {
  const sb = window.supabaseClient;
  const [rv, rp] = await Promise.all([
    sb.from('comision_vendedor').select('id, nombre, nombre_netsuite, activo').order('nombre'),
    sb.from('comision_porcentaje').select('id, unidad_id, vendedor_id, porcentaje, actualizado_en, actualizado_por')
  ]);
  const error = rv.error || rp.error;
  EST.disSinTabla = !!error;
  if (error) {
    status('com-dis-status', 'No se pudieron leer los vendedores y porcentajes (¿falta correr la migración 31?): ' + error.message, 'error');
    $('com-dis-unidades').innerHTML = '';
    $('com-ven-tbody').innerHTML = '';
    return;
  }
  EST.vendedores = rv.data || [];
  EST.porcentajes = rp.data || [];
  EST.disTrabajo = {};
  EST.porcentajes.forEach((p) => {
    (EST.disTrabajo[p.unidad_id] = EST.disTrabajo[p.unidad_id] || {})[String(p.vendedor_id)] = String(Number(p.porcentaje));
  });
  EST.disSucias.clear();
  renderVendedores();
  renderDistribucion();
}

async function sincronizarVendedores() {
  const btn = $('com-dis-sync');
  btn.disabled = true;
  status('com-dis-status', 'Buscando los representantes de ventas de las oportunidades en NetSuite…');
  try {
    const s = await window.supabaseClient.auth.getSession();
    const token = s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Tu sesión venció: volvé a ingresar.');
    const resp = await fetch(API_BASE_URL + '/comisiones/vendedores/sincronizar', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'error ' + resp.status);
    const sucias = new Set(EST.disSucias); const trabajo = EST.disTrabajo;
    await cargarPorcentajes();
    if (sucias.size) { EST.disTrabajo = trabajo; EST.disSucias = sucias; renderDistribucion(); }
    status('com-dis-status', `NetSuite: ${body.encontrados} representantes en las oportunidades de los últimos 12 meses; ` +
      `${body.nuevos} nuevo(s)${body.actualizados ? `, ${body.actualizados} con nombre actualizado` : ''}.` +
      (body.nuevos ? ' Los que no están en el Informe de MKT quedan inactivos: activalos si corresponde.' : ''), 'ok');
  } catch (err) {
    status('com-dis-status', 'No se pudieron traer los vendedores: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

function renderVendedores() {
  const tb = $('com-ven-tbody');
  const dis = EST.puedeEditar ? '' : ' disabled';
  $('com-ven-cuenta').textContent = `${EST.vendedores.filter((v) => v.activo !== false).length} activos de ${EST.vendedores.length}`;
  tb.innerHTML = EST.vendedores.length ? EST.vendedores.map((v) => `<tr data-vid="${esc(v.id)}"${v.activo === false ? ' class="com-un-off"' : ''}>
      <td><input class="admin-input" data-campo="nombre" value="${esc(v.nombre)}"${dis} aria-label="Nombre"></td>
      <td class="com-codigo">${esc(v.id)}</td>
      <td><span class="com-meta">${esc(v.nombre_netsuite || '')}</span></td>
      <td class="com-c"><input type="checkbox" class="admin-checkbox" data-campo="activo"${v.activo !== false ? ' checked' : ''}${dis} aria-label="Activo"></td>
    </tr>`).join('')
    : '<tr><td colspan="4" class="admin-empty">Todavía no hay vendedores: tocá «Actualizar desde NetSuite».</td></tr>';
}

// Vendedores que se muestran en la tarjeta de una unidad: los activos y los
// inactivos que tienen porcentaje cargado.
function vendedoresDeUnidad(uid) {
  const t = EST.disTrabajo[uid] || {};
  return EST.vendedores.filter((v) => v.activo !== false || parseFloat(t[String(v.id)]) > 0);
}
function sumaPorcentajes(uid) {
  const t = EST.disTrabajo[uid] || {};
  return Math.round(Object.values(t).reduce((s, x) => s + (parseFloat(String(x).replace(',', '.')) || 0), 0) * 1000) / 1000;
}
function fmtPct(n) { return Number(n).toLocaleString('es-AR', { maximumFractionDigits: 3 }) + ' %'; }

function htmlTotalUnidad(uid) {
  const u = unidadBase(uid);
  if (u && u.comisiona === false) return '<span class="com-meta">La unidad no comisiona: no genera fondo comisionable (los porcentajes quedan guardados para cuando se active).</span>';
  const suma = sumaPorcentajes(uid);
  const ok = Math.abs(suma - 100) < 0.0005;
  const msg = suma === 0 ? 'Sin porcentajes: el fondo comisionable de esta unidad queda sin repartir.'
    : ok ? 'Suma 100 %.'
      : suma < 100 ? `Faltan ${fmtPct(100 - suma)}: esa parte del fondo queda sin repartir.`
        : `Sobran ${fmtPct(suma - 100)}: se repartiría más que el fondo.`;
  return `<span class="com-dis-total${ok ? ' is-ok' : ' is-warn'}">${ok ? '' : '<i class="ti ti-alert-triangle" aria-hidden="true"></i> '}Total ${fmtPct(suma)}</span>
    <span class="com-meta">${esc(msg)}</span>`;
}
function actualizarTotalUnidad(uid) {
  const card = document.querySelector(`[data-unidad="${CSS.escape(uid)}"]`);
  if (!card) return;
  card.querySelector('.com-dis-pie').innerHTML = htmlTotalUnidad(uid);
  card.classList.toggle('is-dirty', EST.disSucias.has(uid));
}
function actualizarBotonGuardarPorcentajes() {
  const n = EST.disSucias.size;
  $('com-dis-guardar').disabled = n === 0;
  $('com-dis-guardar').innerHTML = '<i class="ti ti-device-floppy" aria-hidden="true"></i> ' + (n ? `Guardar cambios (${n} unidad${n > 1 ? 'es' : ''})` : 'Guardar cambios');
}

function renderDistribucion() {
  const cont = $('com-dis-unidades');
  if (!cont || EST.disSinTabla) return;
  const dis = EST.puedeEditar ? '' : ' disabled';
  const unidades = EST.unidades.slice().sort((a, b) =>
    ((a.comisiona === false) - (b.comisiona === false)) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
  if (!unidades.length) {
    cont.innerHTML = '<p class="admin-empty">Todavía no hay unidades de comisión. Creálas en la pestaña Unidades de comisión.</p>';
    actualizarBotonGuardarPorcentajes();
    return;
  }
  cont.innerHTML = unidades.map((u) => {
    const t = EST.disTrabajo[u.id] || {};
    const vend = vendedoresDeUnidad(u.id);
    const abonos = EST.abonos.filter((a) => a.unidad_id === u.id).map((a) => a.codigo).sort(compararCodigos);
    return `<div class="com-dis-card${u.comisiona === false ? ' is-off' : ''}${EST.disSucias.has(u.id) ? ' is-dirty' : ''}" data-unidad="${esc(u.id)}">
      <div class="com-dis-head">
        <div><b>${esc(u.nombre)}</b>
          <span class="com-meta">${u.comisiona === false ? 'No comisiona: no tiene fondo comisionable' : 'Incluido desde ' + esc(u.incluido_desde)} ·
          ${abonos.length ? abonos.map((c) => `<span class="com-chip">${esc(c)}</span>`).join(' ') : 'sin abonos'}</span></div>
        <div class="com-actions com-solo-editor">
          <button type="button" class="btn btn--secondary btn--sm" data-accion="repartir" title="Reparte el 100 % en partes iguales entre los vendedores activos">Partes iguales</button>
        </div>
      </div>
      <table class="admin-table com-tabla com-dis-tabla"><thead><tr><th>Vendedor</th><th class="com-n">ID NetSuite</th><th class="com-n">% del fondo</th></tr></thead><tbody>` +
      (vend.length ? vend.map((v) => `<tr data-vid="${esc(v.id)}"${v.activo === false ? ' class="com-un-off" title="Vendedor inactivo"' : ''}>
          <td>${esc(v.nombre)}</td><td class="com-n com-meta">${esc(v.id)}</td>
          <td class="com-n"><input type="number" min="0" max="100" step="0.001" class="admin-input com-input-num" value="${esc(t[String(v.id)] ?? '')}" placeholder="0"${dis} aria-label="Porcentaje de ${esc(v.nombre)}"></td>
        </tr>`).join('')
        : '<tr><td colspan="3" class="admin-empty">No hay vendedores activos: tocá «Actualizar desde NetSuite».</td></tr>') +
      `</tbody></table>
      <div class="com-dis-pie">${htmlTotalUnidad(u.id)}</div>
    </div>`;
  }).join('');
  actualizarBotonGuardarPorcentajes();
}

async function guardarPorcentajes() {
  const sb = window.supabaseClient;
  const meta = { actualizado_en: new Date().toISOString(), actualizado_por: EST.session.user.email || null };
  const borrar = [], upserts = [];
  for (const uid of EST.disSucias) {
    const u = unidadBase(uid);
    const t = EST.disTrabajo[uid] || {};
    for (const [vid, texto] of Object.entries(t)) {
      const s = String(texto ?? '').trim();
      const p = s === '' ? 0 : parseFloat(s.replace(',', '.'));
      const v = EST.vendedores.find((x) => String(x.id) === vid);
      if (!(p >= 0 && p <= 100)) {
        status('com-dis-status', `${u ? u.nombre : 'Unidad'}: el porcentaje de ${v ? v.nombre : vid} tiene que estar entre 0 y 100.`, 'error');
        return;
      }
      const existe = EST.porcentajes.find((x) => x.unidad_id === uid && String(x.vendedor_id) === vid);
      if (p > 0) upserts.push({ unidad_id: uid, vendedor_id: Number(vid), porcentaje: Math.round(p * 1000) / 1000, ...meta });
      else if (existe) borrar.push(existe.id);
    }
  }
  $('com-dis-guardar').disabled = true;
  status('com-dis-status', 'Guardando…');
  const r1 = borrar.length ? await sb.from('comision_porcentaje').delete().in('id', borrar) : { error: null };
  const r2 = !r1.error && upserts.length
    ? await sb.from('comision_porcentaje').upsert(upserts, { onConflict: 'unidad_id,vendedor_id' }) : { error: null };
  const error = r1.error || r2.error;
  if (error) {
    status('com-dis-status', 'No se pudo guardar: ' + error.message, 'error');
    actualizarBotonGuardarPorcentajes();
    return;
  }
  const n = EST.disSucias.size;
  await cargarPorcentajes();
  const avisos = EST.unidades.filter((u) => u.comisiona !== false && sumaPorcentajes(u.id) > 0 &&
    Math.abs(sumaPorcentajes(u.id) - 100) >= 0.0005).map((u) => u.nombre);
  status('com-dis-status', `Se guardaron los porcentajes de ${n} unidad(es).` +
    (avisos.length ? ` Atención: no suman 100 % en ${avisos.join(', ')}.` : ''), avisos.length ? 'error' : 'ok');
}

// ═══════════════════════════ LIQUIDACIONES ═══════════════════════════
function iniciarLiquidaciones() {
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  const [a, m] = hoy.split('-').map(Number);
  const prev = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}`;
  $('com-liq-mes').value = prev;
  $('com-liq-mes').max = hoy.slice(0, 7);
  $('com-liq-generar').addEventListener('click', generarLiquidacion);
  $('com-liq-tbody').addEventListener('click', (ev) => {
    const b = ev.target.closest('button[data-accion]');
    if (!b) return;
    const id = b.closest('tr[data-id]').dataset.id;
    if (b.dataset.accion === 'ver') verLiquidacion(id);
    if (b.dataset.accion === 'excel') exportarLiquidacion(id, b);
    if (b.dataset.accion === 'borrar') pedirBorradoLiquidacion(id);
  });
  $('com-liq-confirm-si').addEventListener('click', () => { if (EST.liqBorrarPendiente) borrarLiquidacion(EST.liqBorrarPendiente); });
  $('com-liq-confirm-no').addEventListener('click', () => pedirBorradoLiquidacion(null));
}

async function cargarLiquidaciones() {
  const { data, error } = await window.supabaseClient
    .from('comision_liquidacion')
    .select('id, mes, desde, hasta, generada_en, generada_por, modelo, totales, avisos')
    .order('mes', { ascending: false });
  if (error) {
    $('com-liq-tbody').innerHTML = `<tr><td colspan="7" class="admin-empty">No se pudieron leer las liquidaciones: ${esc(error.message)}</td></tr>`;
    return;
  }
  EST.liquidaciones = data || [];
  renderLiquidaciones();
}

// La confirmación se muestra en un recuadro arriba de la tabla (y no dentro
// de la fila), para que se vea aunque la tabla no entre a lo ancho.
function pedirBorradoLiquidacion(id) {
  EST.liqBorrarPendiente = id;
  const l = id && EST.liquidaciones.find((x) => x.id === id);
  $('com-liq-confirm').hidden = !l;
  if (l) {
    $('com-liq-confirm-texto').innerHTML = `¿Eliminar la liquidación de <b>${esc(fmtMes(l.mes))}</b>? ` +
      'Se borra con todo su detalle y no se puede deshacer; después se puede volver a generar.';
    $('com-liq-confirm').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  status('com-liq-status', '');
  renderLiquidaciones();
}

function renderLiquidaciones() {
  const ed = EST.puedeEditar;
  $('com-liq-tbody').innerHTML = EST.liquidaciones.length ? EST.liquidaciones.map((l) => {
    const t = l.totales || {};
    const borrar = !ed ? '' : '<button type="button" class="com-icon-btn" data-accion="borrar" title="Eliminar liquidación"><i class="ti ti-trash" aria-hidden="true"></i> Eliminar</button>';
    const clase = EST.liqBorrarPendiente === l.id ? 'com-liq-borrar' : (EST.liqSeleccionada === l.id ? 'com-liq-sel' : '');
    return `<tr data-id="${esc(l.id)}" class="${clase}">
      <td><b>${esc(fmtMes(l.mes))}</b>${(l.avisos || []).length ? ' <i class="ti ti-alert-triangle" title="Tiene avisos" style="color:var(--color-alert-icon)"></i>' : ''}</td>
      <td class="com-n">${esc(t.ganadas ?? '')}</td>
      <td class="com-n">${esc(t.ovs ?? '')}</td>
      <td class="com-n">${l.modelo === 'fondo' ? pesos(t.fondo) : '<span class="com-meta" title="Modelo anterior: eliminala y generala de nuevo">modelo anterior</span>'}</td>
      <td class="com-n"><b>${pesos(t.comision)}</b></td>
      <td><span class="com-meta">${esc(fmtFechaHora(l.generada_en))}<br>${esc(l.generada_por || '')}</span></td>
      <td><div class="com-row-actions">
        <button type="button" class="com-icon-btn" data-accion="ver" title="Ver detalle"><i class="ti ti-eye" aria-hidden="true"></i></button>
        <button type="button" class="com-icon-btn" data-accion="excel" title="Exportar a Excel"><i class="ti ti-file-spreadsheet" aria-hidden="true"></i></button>
        ${borrar}
      </div></td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="admin-empty">Todavía no hay liquidaciones generadas.</td></tr>';
}

async function generarLiquidacion() {
  const mes = $('com-liq-mes').value;
  if (!/^\d{4}-\d{2}$/.test(mes)) { status('com-liq-status', 'Elegí el mes a liquidar.', 'error'); return; }
  if (EST.liquidaciones.some((l) => l.mes.slice(0, 7) === mes)) {
    status('com-liq-status', `Ya existe la liquidación de ${fmtMes(mes)}. Eliminala para volver a generarla.`, 'error');
    return;
  }
  const btn = $('com-liq-generar');
  btn.disabled = true;
  status('com-liq-status', `Generando la liquidación de ${fmtMes(mes)}: consultando NetSuite (puede tardar hasta un minuto)…`);
  try {
    const s = await window.supabaseClient.auth.getSession();
    const token = s.data && s.data.session && s.data.session.access_token;
    if (!token) throw new Error('Tu sesión venció: volvé a ingresar.');
    const resp = await fetch(API_BASE_URL + '/comisiones/liquidar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ mes })
    });
    const body = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'error ' + resp.status);
    status('com-liq-status', `Liquidación de ${fmtMes(mes)} generada: ${body.vendedores} vendedores, comisión ${pesos(body.totales && body.totales.comision)}.`, 'ok');
    await cargarLiquidaciones();
    verLiquidacion(body.id);
  } catch (err) {
    status('com-liq-status', 'No se pudo generar la liquidación: ' + err.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function borrarLiquidacion(id) {
  const l = EST.liquidaciones.find((x) => x.id === id);
  $('com-liq-confirm-si').disabled = true;
  status('com-liq-status', 'Eliminando…');
  const sb = window.supabaseClient;
  const { error } = await sb.from('comision_liquidacion').delete().eq('id', id);
  EST.liqBorrarPendiente = null;
  $('com-liq-confirm').hidden = true;
  $('com-liq-confirm-si').disabled = false;
  if (error) {
    console.error('[comisiones.js] eliminar liquidación', error);
    status('com-liq-status', 'No se pudo eliminar: ' + error.message, 'error');
    renderLiquidaciones();
    return;
  }
  // Si las políticas de la base no dejan borrar, Supabase no da error,
  // simplemente no borra nada: se verifica que ya no esté.
  const quedo = await sb.from('comision_liquidacion').select('id').eq('id', id);
  if (!quedo.error && quedo.data && quedo.data.length) {
    status('com-liq-status', 'La base no eliminó la liquidación: tu usuario necesita permiso "editar" en la sección Comisiones.', 'error');
    await cargarLiquidaciones();
    return;
  }
  if (EST.liqSeleccionada === id) { EST.liqSeleccionada = null; EST.liqDetalle = null; $('com-liq-detalle').hidden = true; }
  status('com-liq-status', `Se eliminó la liquidación de ${l ? fmtMes(l.mes) : ''}.`, 'ok');
  await cargarLiquidaciones();
}

async function leerDetalle(id) {
  const sb = window.supabaseClient;
  const [liq, vend] = await Promise.all([
    sb.from('comision_liquidacion').select('*').eq('id', id).single(),
    sb.from('comision_liquidacion_vendedor').select('*').eq('liquidacion_id', id)
  ]);
  if (liq.error) throw liq.error;
  if (vend.error) throw vend.error;
  const lineas = [];
  for (let desde = 0; ; desde += 1000) {
    const r = await sb.from('comision_liquidacion_linea').select('*').eq('liquidacion_id', id)
      .order('vendedor').order('ov_numero').order('codigo').range(desde, desde + 999);
    if (r.error) throw r.error;
    lineas.push(...r.data);
    if (r.data.length < 1000) break;
  }
  const vendedores = vend.data.sort((a, b) => (a.vendedor === 'Sin asignar') - (b.vendedor === 'Sin asignar') || b.comision - a.comision || a.vendedor.localeCompare(b.vendedor, 'es'));
  return { liq: liq.data, vendedores, lineas };
}

async function verLiquidacion(id) {
  EST.liqSeleccionada = id;
  EST.vendAbierto = null;
  EST.lineaFiltroVend = '';
  renderLiquidaciones();
  const cont = $('com-liq-detalle');
  cont.hidden = false;
  cont.innerHTML = '<p class="admin-loading">Cargando detalle…</p>';
  try {
    EST.liqDetalle = await leerDetalle(id);
    renderDetalle();
    cont.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    cont.innerHTML = `<p class="com-status com-status--error">No se pudo leer la liquidación: ${esc(err.message)}</p>`;
  }
}

function renderDetalle() {
  const { liq, vendedores, lineas } = EST.liqDetalle;
  const cont = $('com-liq-detalle');
  if (liq.modelo !== 'fondo') {
    cont.innerHTML = `<h3>Liquidación de ${esc(fmtMes(liq.mes))}</h3>
      <div class="com-avisos"><b>Generada con el modelo anterior (comisión por vendedor).</b>
      <p>Desde el 19/10/2026 la comisión se calcula con el fondo comisionable por unidad y el reparto por porcentaje. Eliminá esta liquidación y
      generala de nuevo para verla con el modelo actual (la limpieza de la migración 32 no se puede correr mientras quede alguna).</p></div>`;
    return;
  }
  const t = liq.totales || {};
  const fondos = liq.fondos || [];
  let h = `<h3>Liquidación de ${esc(fmtMes(liq.mes))}</h3>
    <p class="com-detalle__meta">Oportunidades ganadas del ${esc(fmtDia(liq.desde))} al ${esc(fmtDia(liq.hasta))} ·
      generada el ${esc(fmtFechaHora(liq.generada_en))}${liq.generada_por ? ' por ' + esc(liq.generada_por) : ''} ·
      importes sin IVA</p>
    <div class="com-kpis">
      <div class="com-kpi"><b>${esc(t.ganadas ?? 0)}</b><span>Oportunidades ganadas</span>
        <small>${esc(t.ovs_comisionables ?? 0)} suman al fondo · ${esc((t.ovs ?? 0) - (t.ovs_comisionables ?? 0))} con OV que no suma · ${esc(t.ganadas_sin_ov ?? 0)} sin OV de abonos</small></div>
      <div class="com-kpi"><b>${esc(t.ovs_comisionables ?? 0)}</b><span>Ventas que suman al fondo</span><small>OV de abonos con abonos incluidos</small></div>
      <div class="com-kpi"><b>${pesos(t.base_comisionable)}</b><span>Base comisionable</span><small>abonos incluidos de esas ventas</small></div>
      <div class="com-kpi"><b>${pesos(t.fondo)}</b><span>Fondo comisionable</span>
        <small>${Number(t.base_comisionable) ? pct(Number(t.fondo) / Number(t.base_comisionable)) + ' de la base · ventas desde el piso de cada unidad' : ''}</small></div>
      <div class="com-kpi com-kpi--total"><b>${pesos(t.comision)}</b><span>Comisión repartida</span><small>según el porcentaje de cada vendedor</small></div>
    </div>`;
  if (Math.abs(Number(t.sin_repartir || 0)) >= 0.005) {
    h += `<div class="com-alerta"><i class="ti ti-alert-triangle" aria-hidden="true"></i> <b>${Number(t.sin_repartir) > 0
      ? `Quedan ${pesos(t.sin_repartir)} del fondo comisionable sin repartir`
      : `Se repartieron ${pesos(-Number(t.sin_repartir))} más que el fondo comisionable`}</b>: los porcentajes de alguna unidad no suman 100 % (ver «Fondo comisionable por unidad»).</div>`;
  }
  if (Number(t.ventas_sin_asignar || 0) > 0) {
    h += `<div class="com-alerta"><i class="ti ti-alert-triangle" aria-hidden="true"></i> <b>${esc(t.ventas_sin_asignar)} venta(s) sin representante de ventas</b>
      (${pesos(t.base_sin_asignar)} de base): suman al fondo pero no reciben porcentaje.</div>`;
  }
  if ((liq.avisos || []).length) {
    h += `<div class="com-avisos"><b>Avisos al generar</b><ul>${liq.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  }

  h += `<h4>Fondo comisionable por unidad de comisión</h4>
    <p class="com-detalle__meta" style="margin:-6px 0 8px">Ventas de todos los vendedores. Comisionan = ventas − incluido desde + 1 (mínimo 0);
      fondo comisionable = base × comisionan / ventas. El fondo comisionable se reparte según el porcentaje de cada vendedor.</p>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr>
      <th>Unidad</th><th class="com-n">Ventas</th><th class="com-n">Incluido desde</th><th class="com-n">Comisionan</th><th class="com-n">% que comisiona</th>
      <th class="com-n">Base</th><th class="com-n">Promedio por venta</th><th class="com-n">Fondo comisionable</th><th class="com-n">% asignado</th>
      <th class="com-n">Repartido</th><th class="com-n">Sin repartir</th><th class="com-n">Ventas sin asignar</th></tr></thead><tbody>` +
    (fondos.length ? fondos.map((p) => {
      const okPct = Math.abs(Number(p.porcentaje_total) - 100) < 0.0005;
      return `<tr><td><b>${esc(p.unidad)}</b>${(p.vendedores_sin_porcentaje || []).length
        ? `<br><span class="com-meta">Con ventas y sin porcentaje: ${esc(p.vendedores_sin_porcentaje.join(', '))}</span>` : ''}</td>
        <td class="com-n">${p.ventas}</td><td class="com-n">${esc(p.incluido_desde)}</td><td class="com-n">${p.comisionan}</td>
        <td class="com-n">${pct(p.factor)}</td><td class="com-n">${pesos(p.base)}</td><td class="com-n">${pesos(p.promedio)}</td>
        <td class="com-n"><b>${pesos(p.fondo)}</b></td>
        <td class="com-n">${okPct ? '' : '<i class="ti ti-alert-triangle com-warn" title="No suma 100 %" aria-hidden="true"></i> '}${fmtPct(p.porcentaje_total || 0)}</td>
        <td class="com-n">${pesos(p.repartido)}</td><td class="com-n">${Number(p.sin_repartir) ? pesos(p.sin_repartir) : '—'}</td>
        <td class="com-n">${p.ventas_sin_asignar ? `${p.ventas_sin_asignar} <span class="com-meta">(${pesos(p.base_sin_asignar)})</span>` : '—'}</td></tr>`;
    }).join('') : '<tr><td colspan="12" class="admin-empty">Ninguna unidad tuvo ventas.</td></tr>') +
    `</tbody><tfoot><tr><td>Total</td><td class="com-n">${fondos.reduce((s, p) => s + p.ventas, 0)}</td><td></td>
      <td class="com-n">${fondos.reduce((s, p) => s + p.comisionan, 0)}</td><td></td><td class="com-n">${pesos(fondos.reduce((s, p) => s + Number(p.base), 0))}</td><td></td>
      <td class="com-n">${pesos(t.fondo)}</td><td></td><td class="com-n">${pesos(t.comision)}</td><td class="com-n">${pesos(t.sin_repartir)}</td>
      <td class="com-n">${esc(t.ventas_sin_asignar ?? 0)}</td></tr></tfoot></table></div>`;

  h += `<h4>Reparto por vendedor</h4><p class="com-detalle__meta" style="margin:-6px 0 8px">La comisión es su porcentaje del fondo comisionable de cada unidad, sin importar quién vendió.
      Las ventas y el aporte al fondo son informativos. Click en un vendedor para ver el detalle por unidad y filtrar las líneas.</p>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr>
      <th>Vendedor</th><th class="com-n">ID NetSuite</th><th class="com-n">Ganadas</th><th class="com-n">OV de abonos</th><th class="com-n">Ventas que suman al fondo</th>
      <th class="com-n">Aporte al fondo</th><th class="com-n">Comisión</th></tr></thead><tbody>`;
  vendedores.forEach((v) => {
    const abierto = EST.vendAbierto === v.vendedor;
    h += `<tr class="com-vend-row${abierto ? ' is-open' : ''}" data-vend="${esc(v.vendedor)}">
      <td>${abierto ? '▾' : '▸'} ${esc(v.vendedor)}${v.vendedor_id == null ? ' <span class="com-meta">(no recibe porcentaje)</span>' : ''}</td>
      <td class="com-n com-meta">${esc(v.vendedor_id ?? '—')}</td><td class="com-n">${v.ganadas}</td><td class="com-n">${v.ovs}</td><td class="com-n">${v.ovs_comisionables}</td>
      <td class="com-n">${pesos(v.aporte)}</td><td class="com-n"><b>${pesos(v.comision)}</b></td></tr>`;
    if (abierto) {
      const us = v.por_unidad || [];
      h += `<tr class="com-sub"><td colspan="7">${us.length ? `<table class="com-subtabla"><thead><tr>
        <th>Unidad de comisión</th><th class="com-n">Ventas</th><th class="com-n">Base</th><th class="com-n">Aporte al fondo</th>
        <th class="com-n">% del fondo</th><th class="com-n">Comisión</th></tr></thead><tbody>` +
        us.map((u) => `<tr><td>${esc(u.unidad)}${u.comisiona === false ? ' <span class="com-no">(no comisiona)</span>' : ''}</td>
          <td class="com-n">${u.ventas}</td><td class="com-n">${u.comisiona === false ? '—' : pesos(u.base)}</td>
          <td class="com-n">${u.comisiona === false ? '—' : pesos(u.aporte)}</td>
          <td class="com-n">${u.porcentaje == null ? '<span class="com-meta">sin %</span>' : fmtPct(u.porcentaje)}</td>
          <td class="com-n"><b>${pesos(u.comision)}</b></td></tr>`).join('') +
        '</tbody></table>' : '<span class="com-meta">Sin ventas ni porcentajes.</span>'}</td></tr>`;
    }
  });
  h += `</tbody><tfoot><tr><td>Total</td><td></td><td class="com-n">${vendedores.reduce((s, v) => s + v.ganadas, 0)}</td>
    <td class="com-n">${vendedores.reduce((s, v) => s + v.ovs, 0)}</td><td class="com-n">${vendedores.reduce((s, v) => s + v.ovs_comisionables, 0)}</td>
    <td class="com-n">${pesos(vendedores.reduce((s, v) => s + Number(v.aporte || 0), 0))}</td><td class="com-n">${pesos(t.comision)}</td></tr></tfoot></table></div>`;

  const ls = EST.lineaFiltroVend ? lineas.filter((l) => l.vendedor === EST.lineaFiltroVend) : lineas;
  h += `<h4>Líneas de abono${EST.lineaFiltroVend ? ' · ' + esc(EST.lineaFiltroVend) : ''} (${ls.length})</h4>
    <div class="com-lineas-wrap"><table class="admin-table com-tabla"><thead><tr>
      <th>Vendedor</th><th>OV</th><th>Fecha OV</th><th>Cliente</th><th>Oportunidad</th><th>Abono</th>
      <th>Unidad de comisión</th><th class="com-n">% que comisiona</th><th class="com-n">Importe</th><th class="com-n">Aporte al fondo</th>
    </tr></thead><tbody>` +
    (ls.length ? ls.map((l) => `<tr><td>${esc(l.vendedor)}</td><td>${linkNs('salesord', l.ov_id, l.ov_numero)}</td><td>${esc(fmtDia(l.fecha_ov))}</td>
      <td>${esc(l.cliente)}</td><td>${esc(l.oportunidad)}</td><td title="${esc(l.articulo)}"><span class="com-codigo">${esc(l.codigo)}</span></td>
      <td>${l.incluido ? esc(l.unidad || 'Incluido') : (l.unidad ? esc(l.unidad) + ' <span class="com-no">(no comisiona)</span>' : '<span class="com-no">No incluido</span>')}</td>
      <td class="com-n">${l.incluido && l.factor != null ? pct(l.factor) : ''}</td>
      <td class="com-n">${pesos(l.importe)}</td><td class="com-n">${l.incluido ? pesos(l.aporte) : ''}</td></tr>`).join('')
      : '<tr><td colspan="10" class="admin-empty">Sin líneas.</td></tr>') + '</tbody></table></div>';

  const sinOv = (liq.sin_ov || []).filter((o) => !EST.lineaFiltroVend || o.vendedor === EST.lineaFiltroVend);
  h += `<h4>Ganadas sin OV de abonos (${sinOv.length})</h4>` + (sinOv.length
    ? `<div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr><th>Vendedor</th><th>Oportunidad</th><th>Fecha</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>` +
      sinOv.map((o) => `<tr><td>${esc(o.vendedor)}</td><td>${linkNs('opprtnty', o.oportunidad_id, o.oportunidad)}</td><td>${esc(fmtDia(o.fecha_oportunidad))}</td>
        <td>${esc(o.cliente)} <span class="com-meta">${esc(o.nro_cliente || '')}</span></td><td>${esc(o.estado_oportunidad || '')}</td></tr>`).join('') +
      '</tbody></table></div>'
    : '<p class="com-meta">Ninguna.</p>');

  const cfg = (liq.config || []).slice().sort((a, b) => (b.incluido - a.incluido) || compararCodigos(a.codigo, b.codigo));
  const uns = liq.unidades || [];
  const porc = liq.porcentajes || [];
  h += `<details class="com-config"><summary>Configuración usada (${uns.length} unidades · ${porc.length} porcentajes · ${cfg.filter((c) => c.incluido).length} abonos incluidos de ${cfg.length})</summary>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr><th>Unidad de comisión</th><th class="com-c">Comisiona</th><th class="com-n">Incluido desde</th><th>Abonos</th><th>Porcentajes</th></tr></thead><tbody>` +
    uns.map((u) => `<tr><td>${esc(u.nombre)}</td><td class="com-c">${u.comisiona === false ? '<span class="com-no">No</span>' : '<span class="com-si">Sí</span>'}</td>
      <td class="com-n">${esc(u.incluido_desde)}</td><td>${(u.abonos || []).map((c) => `<span class="com-chip">${esc(c)}</span>`).join(' ')}</td>
      <td>${porc.filter((p) => p.unidad === u.nombre).map((p) => `${esc(p.vendedor)} ${fmtPct(p.porcentaje)}`).join(' · ') || '<span class="com-meta">—</span>'}</td></tr>`).join('') +
    `</tbody></table></div>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr><th>Código</th><th>Nombre</th><th>Unidad de comisión</th></tr></thead><tbody>` +
    cfg.map((c) => `<tr><td class="com-codigo">${esc(c.codigo)}</td><td>${esc(c.nombre_mostrar || c.nombre)}</td>
      <td>${c.incluido ? esc(c.unidad || 'Incluido') : '<span class="com-no">No incluido</span>'}</td></tr>`).join('') +
    '</tbody></table></div></details>';

  cont.innerHTML = h;
  cont.querySelectorAll('.com-vend-row').forEach((tr) => tr.addEventListener('click', () => {
    const v = tr.dataset.vend;
    EST.vendAbierto = EST.vendAbierto === v ? null : v;
    EST.lineaFiltroVend = EST.vendAbierto || '';
    renderDetalle();
  }));
}

async function exportarLiquidacion(id, btn) {
  if (btn) btn.disabled = true;
  try {
    const d = (EST.liqDetalle && EST.liqDetalle.liq.id === id) ? EST.liqDetalle : await leerDetalle(id);
    const { liq, vendedores, lineas } = d;
    if (liq.modelo !== 'fondo') {
      status('com-liq-status', 'Esta liquidación es del modelo anterior: eliminala y generala de nuevo para exportarla.', 'error');
      return;
    }
    const t = liq.totales || {};
    const wb = new ExcelJS.Workbook();
    const money = '#,##0.00';

    const ws0 = wb.addWorksheet('Fondo comisionable por unidad');
    ws0.columns = [
      { header: 'Unidad de comisión', key: 'unidad', width: 30 }, { header: 'Ventas', key: 'ventas', width: 9 },
      { header: 'Incluido desde', key: 'incluido_desde', width: 10 }, { header: 'Comisionan', key: 'comisionan', width: 11 },
      { header: '% que comisiona', key: 'factor', width: 12, style: { numFmt: '0.00%' } },
      { header: 'Base', key: 'base', width: 16, style: { numFmt: money } }, { header: 'Promedio por venta', key: 'promedio', width: 16, style: { numFmt: money } },
      { header: 'Fondo comisionable', key: 'fondo', width: 16, style: { numFmt: money } }, { header: '% asignado', key: 'porcentaje_total', width: 11 },
      { header: 'Repartido', key: 'repartido', width: 16, style: { numFmt: money } }, { header: 'Sin repartir', key: 'sin_repartir', width: 16, style: { numFmt: money } },
      { header: 'Ventas sin asignar', key: 'ventas_sin_asignar', width: 11 }, { header: 'Base sin asignar', key: 'base_sin_asignar', width: 16, style: { numFmt: money } },
      { header: 'Vendedores con ventas y sin porcentaje', key: 'sin_pct', width: 40 }
    ];
    (liq.fondos || []).forEach((p) => ws0.addRow({ ...p, factor: Number(p.factor), base: Number(p.base), promedio: Number(p.promedio), fondo: Number(p.fondo),
      porcentaje_total: Number(p.porcentaje_total), repartido: Number(p.repartido), sin_repartir: Number(p.sin_repartir),
      base_sin_asignar: Number(p.base_sin_asignar), sin_pct: (p.vendedores_sin_porcentaje || []).join(', ') }));
    const tot0 = ws0.addRow({ unidad: 'Total', fondo: Number(t.fondo), repartido: Number(t.comision), sin_repartir: Number(t.sin_repartir),
      ventas_sin_asignar: t.ventas_sin_asignar, base_sin_asignar: Number(t.base_sin_asignar || 0) });
    tot0.font = { bold: true };

    const ws1 = wb.addWorksheet('Por vendedor');
    ws1.columns = [
      { header: 'Vendedor', key: 'v', width: 28 }, { header: 'ID NetSuite', key: 'id', width: 12 }, { header: 'Oportunidades ganadas', key: 'g', width: 12 },
      { header: 'OV de abonos', key: 'o', width: 12 }, { header: 'Ventas que suman al fondo', key: 'oc', width: 14 },
      { header: 'Aporte al fondo', key: 'a', width: 18, style: { numFmt: money } }, { header: 'Comisión', key: 'c', width: 18, style: { numFmt: money } }
    ];
    vendedores.forEach((v) => ws1.addRow({ v: v.vendedor, id: v.vendedor_id ?? null, g: v.ganadas, o: v.ovs, oc: v.ovs_comisionables, a: Number(v.aporte || 0), c: Number(v.comision) }));
    const tot = ws1.addRow({ v: 'Total', g: vendedores.reduce((s, v) => s + v.ganadas, 0), o: vendedores.reduce((s, v) => s + v.ovs, 0),
      oc: vendedores.reduce((s, v) => s + v.ovs_comisionables, 0), a: vendedores.reduce((s, v) => s + Number(v.aporte || 0), 0), c: Number(t.comision) });
    tot.font = { bold: true };

    const ws2 = wb.addWorksheet('Reparto por unidad');
    ws2.columns = [
      { header: 'Vendedor', key: 'v', width: 28 }, { header: 'ID NetSuite', key: 'id', width: 12 }, { header: 'Unidad de comisión', key: 'u', width: 30 }, { header: 'Comisiona', key: 'k', width: 10 },
      { header: 'Ventas', key: 'n', width: 9 }, { header: 'Base', key: 'b', width: 16, style: { numFmt: money } },
      { header: 'Aporte al fondo', key: 'a', width: 16, style: { numFmt: money } }, { header: '% del fondo', key: 'p', width: 11 },
      { header: 'Comisión', key: 'c', width: 16, style: { numFmt: money } }
    ];
    vendedores.forEach((v) => (v.por_unidad || []).forEach((u) => ws2.addRow({ v: v.vendedor, id: v.vendedor_id ?? null, u: u.unidad, k: u.comisiona === false ? 'No' : 'Sí',
      n: u.ventas, b: Number(u.base), a: Number(u.aporte), p: u.porcentaje == null ? null : Number(u.porcentaje), c: Number(u.comision) })));

    const ws3 = wb.addWorksheet('Líneas');
    ws3.columns = [
      { header: 'Vendedor', key: 'vendedor', width: 26 }, { header: 'ID NetSuite', key: 'vendedor_id', width: 12 }, { header: 'OV', key: 'ov_numero', width: 14 }, { header: 'Fecha OV', key: 'fecha_ov', width: 11 },
      { header: 'Modalidad', key: 'modalidad', width: 10 }, { header: 'Oportunidad', key: 'oportunidad', width: 14 },
      { header: 'Fecha oportunidad', key: 'fecha_oportunidad', width: 11 }, { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Nro. cliente', key: 'nro_cliente', width: 12 }, { header: 'Código', key: 'codigo', width: 12 }, { header: 'Artículo', key: 'articulo', width: 50 },
      { header: 'Cantidad', key: 'cantidad', width: 9 }, { header: 'Importe', key: 'importe', width: 14, style: { numFmt: money } },
      { header: 'Incluido', key: 'incluido', width: 9 }, { header: 'Unidad de comisión', key: 'unidad', width: 26 },
      { header: '% que comisiona', key: 'factor', width: 12, style: { numFmt: '0.00%' } },
      { header: 'Aporte al fondo', key: 'aporte', width: 14, style: { numFmt: money } }
    ];
    lineas.forEach((l) => ws3.addRow({ ...l, fecha_ov: fmtDia(l.fecha_ov), fecha_oportunidad: fmtDia(l.fecha_oportunidad),
      importe: l.importe == null ? null : Number(l.importe), cantidad: l.cantidad == null ? null : Number(l.cantidad),
      incluido: l.incluido ? 'Sí' : 'No', factor: l.factor == null ? null : Number(l.factor), aporte: Number(l.aporte || 0) }));

    const ws4 = wb.addWorksheet('Ganadas sin OV abonos');
    ws4.columns = [
      { header: 'Vendedor', key: 'vendedor', width: 26 }, { header: 'Oportunidad', key: 'oportunidad', width: 14 },
      { header: 'Fecha', key: 'fecha_oportunidad', width: 11 }, { header: 'Estado', key: 'estado_oportunidad', width: 26 },
      { header: 'Cliente', key: 'cliente', width: 30 }, { header: 'Nro. cliente', key: 'nro_cliente', width: 12 }
    ];
    (liq.sin_ov || []).forEach((o) => ws4.addRow({ ...o, fecha_oportunidad: fmtDia(o.fecha_oportunidad) }));

    const ws5 = wb.addWorksheet('Configuración');
    ws5.columns = [
      { header: 'Código', key: 'codigo', width: 14 }, { header: 'Nombre', key: 'nombre', width: 60 },
      { header: 'Unidad de comisión', key: 'unidad', width: 30 }, { header: 'Comisiona', key: 'comisiona', width: 10 },
      { header: 'Incluido desde', key: 'incluido_desde', width: 14 }
    ];
    const porNombre = new Map((liq.unidades || []).map((u) => [u.nombre, u]));
    (liq.config || []).forEach((c) => {
      const u = porNombre.get(c.unidad);
      ws5.addRow({ codigo: c.codigo, nombre: c.nombre, unidad: c.unidad || '', comisiona: u ? (u.comisiona === false ? 'No' : 'Sí') : '',
        incluido_desde: u ? u.incluido_desde : null });
    });

    const ws6 = wb.addWorksheet('Porcentajes');
    ws6.columns = [
      { header: 'Unidad de comisión', key: 'unidad', width: 30 }, { header: 'Vendedor', key: 'vendedor', width: 30 }, { header: 'ID NetSuite', key: 'vendedor_id', width: 12 },
      { header: '% del fondo', key: 'porcentaje', width: 12 }
    ];
    (liq.porcentajes || []).forEach((p) => ws6.addRow({ ...p, porcentaje: Number(p.porcentaje) }));

    wb.worksheets.forEach((ws) => {
      estilarEncabezado(ws);
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      if (ws.rowCount > 1) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
    });
    await descargarLibro(wb, `Liquidacion_comisiones_${String(liq.mes).slice(0, 7)}.xlsx`);
  } catch (err) {
    status('com-liq-status', 'No se pudo exportar: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

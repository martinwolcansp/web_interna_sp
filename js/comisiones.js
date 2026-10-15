/**
 * comisiones.js — Panel de administración → Comisiones (14/10/2026).
 *
 * Pestaña Abonos (tabla comision_abono, migracion_28_comisiones.sql):
 *   - Todos los que tienen "ver" en la sección comisiones ven la tabla y la
 *     exportan. Con "editar" se modifican Incluido / Incluido desde / nombres,
 *     se agregan o eliminan abonos y se importa un Excel (con vista previa
 *     de los cambios antes de aplicar; nunca borra abonos que no vengan en
 *     el archivo).
 *   - El código es la clave: "ABO-10", "ABO-403-AC"... (mismo criterio que
 *     codigo_abono() en servicios/informe-mkt-api/app/comisiones.py). Un
 *     artículo sin código ABO se identifica por su nombre.
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
  liquidaciones: [],
  liqSeleccionada: null, // id
  liqDetalle: null,      // { liq, vendedores, lineas }
  liqBorrarPendiente: null,
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
  iniciarLiquidaciones();
  await cargarAbonos();
  await cargarLiquidaciones();
});

function iniciarTabs() {
  document.querySelectorAll('.com-tab').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.com-tab').forEach((x) => {
        const activo = x === b;
        x.classList.toggle('is-active', activo);
        x.setAttribute('aria-selected', activo ? 'true' : 'false');
      });
      $('com-panel-abonos').hidden = b.dataset.tab !== 'abonos';
      $('com-panel-liquidaciones').hidden = b.dataset.tab !== 'liquidaciones';
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
    let valor = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
    if (campo === 'incluido_desde') valor = Math.max(1, parseInt(valor, 10) || 1);
    if (campo === 'codigo') return; // se valida al salir del campo
    editar(tr.dataset.codigo, campo, valor);
    tr.classList.toggle('is-dirty', EST.cambios.has(tr.dataset.codigo) && !EST.nuevos.has(tr.dataset.codigo));
    tr.classList.toggle('is-incluido', !!filaActual(tr.dataset.codigo).incluido);
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
    .select('codigo, nombre, nombre_mostrar, incluido, incluido_desde, actualizado_en, actualizado_por')
    .order('codigo');
  if (error) {
    status('com-ab-status', 'No se pudieron leer los abonos (¿falta correr la migración 28?): ' + error.message, 'error');
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
}

function filaBase(codigo) { return EST.abonos.find((a) => a.codigo === codigo) || null; }
function filaActual(codigo) { return EST.cambios.get(codigo) || filaBase(codigo); }

function editar(codigo, campo, valor) {
  const base = filaBase(codigo);
  const actual = { ...(EST.cambios.get(codigo) || base) };
  actual[campo] = valor;
  if (base && !EST.nuevos.has(codigo)) {
    const igual = ['nombre', 'nombre_mostrar', 'incluido', 'incluido_desde']
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
    if (filtro === 'si' && !a.incluido) return false;
    if (filtro === 'no' && a.incluido) return false;
    if (q && !`${a.codigo} ${a.nombre || ''} ${a.nombre_mostrar || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

function renderAbonos() {
  const filas = listaVisible();
  const ed = EST.puedeEditar;
  const dis = ed ? '' : ' disabled';
  $('com-ab-tbody').innerHTML = filas.length ? filas.map((a) => {
    const nuevo = EST.nuevos.has(a.codigo);
    const clases = [a.incluido ? 'is-incluido' : '', nuevo ? 'is-nuevo' : (EST.cambios.has(a.codigo) ? 'is-dirty' : '')].join(' ');
    const borrar = EST.borrarPendiente === a.codigo
      ? `<button type="button" class="com-icon-btn com-icon-btn--confirm" data-accion="confirmar-borrar">Eliminar</button>`
      : `<button type="button" class="com-icon-btn" data-accion="borrar" title="Eliminar abono"><i class="ti ti-trash" aria-hidden="true"></i></button>`;
    return `<tr data-codigo="${esc(a.codigo)}" class="${clases}">
      <td>${nuevo && ed ? `<input class="admin-input com-codigo" data-campo="codigo" value="${esc(a.codigo)}" placeholder="ABO-xx">` : `<span class="com-codigo">${esc(a.codigo)}</span>`}</td>
      <td><input class="admin-input" data-campo="nombre" value="${esc(a.nombre)}"${dis}></td>
      <td><input class="admin-input" data-campo="nombre_mostrar" value="${esc(a.nombre_mostrar)}"${dis}></td>
      <td class="com-c"><input type="checkbox" class="admin-checkbox" data-campo="incluido"${a.incluido ? ' checked' : ''}${dis} aria-label="Incluido"></td>
      <td class="com-c"><input type="number" min="1" step="1" class="admin-input com-input-num" data-campo="incluido_desde" value="${esc(a.incluido_desde || 1)}"${dis} aria-label="Incluido desde"></td>
      <td><span class="com-meta">${nuevo ? 'Nuevo, sin guardar' : esc(fmtFechaHora(a.actualizado_en))}${a.actualizado_por && !nuevo ? '<br>' + esc(a.actualizado_por) : ''}</span></td>
      <td class="com-solo-editor">${borrar}</td>
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="admin-empty">No hay abonos con este filtro.</td></tr>';
  const total = EST.abonos.length + EST.nuevos.size;
  const incluidos = EST.abonos.map((a) => filaActual(a.codigo)).concat([...EST.nuevos].map((c) => EST.cambios.get(c)))
    .filter((a) => a && a.incluido).length;
  $('com-ab-cuenta').textContent = `${filas.length} de ${total} abonos · ${incluidos} incluidos`;
  actualizarBotonGuardar();
}

function agregarAbono() {
  let n = 1, codigo;
  do { codigo = `NUEVO-${n++}`; } while (filaActual(codigo));
  EST.nuevos.add(codigo);
  EST.cambios.set(codigo, { codigo, nombre: '', nombre_mostrar: '', incluido: false, incluido_desde: 1 });
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
    incluido: !!a.incluido,
    incluido_desde: Math.max(1, parseInt(a.incluido_desde, 10) || 1),
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
    { header: 'Incluido', key: 'incluido', width: 10 },
    { header: 'Incluido desde', key: 'incluido_desde', width: 15 },
    { header: 'Última modificación', key: 'actualizado_en', width: 20 },
    { header: 'Modificado por', key: 'actualizado_por', width: 30 }
  ];
  EST.abonos.forEach((a) => ws.addRow({
    codigo: a.codigo, nombre: a.nombre, nombre_mostrar: a.nombre_mostrar || '',
    incluido: a.incluido ? 'Sí' : 'No', incluido_desde: a.incluido_desde,
    actualizado_en: fmtFechaHora(a.actualizado_en), actualizado_por: a.actualizado_por || ''
  }));
  estilarEncabezado(ws);
  ws.autoFilter = { from: 'A1', to: 'G1' };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.dataValidations.add(`D2:D${Math.max(2, EST.abonos.length + 200)}`, { type: 'list', allowBlank: true, formulae: ['"Sí,No"'] });
  const ayuda = wb.addWorksheet('Instrucciones');
  ayuda.getColumn(1).width = 110;
  [
    'Abonos para comisiones — cómo actualizar desde este archivo',
    '',
    '1. Editá las columnas Incluido (Sí / No) e Incluido desde (número entero, 1 o más) en la hoja Abonos.',
    '2. Para agregar un abono nuevo, sumá una fila con el Nombre tal como figura en NetSuite (ej. "ABO-72 SP Comercio Seguro - Kit 4").',
    '   El Código se puede dejar vacío: se toma del nombre (ABO-72).',
    '3. Subí el archivo en Panel de administración → Comisiones → Importar Excel. Antes de aplicar se muestra qué cambia.',
    '',
    'Los abonos que no estén en el archivo no se borran. Las columnas Última modificación y Modificado por se ignoran al importar.',
    'Incluido desde = N: por vendedor y por mes, las OV de ese abono comisionan desde la N-ésima (las primeras N−1 no).'
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
  incluido_desde: ['incluido desde']
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
  const vistos = new Map();
  filas.forEach((o) => {
    const codigo = normEspacios(o.codigo) ? codigoAbono(o.codigo) : codigoAbono(o.nombre);
    if (!codigo || vistos.has(codigo)) return; // repetidos: vale el primero
    const desde = parseInt(o.incluido_desde, 10);
    vistos.set(codigo, {
      codigo,
      nombre: normEspacios(o.nombre) || codigo,
      nombre_mostrar: o.nombre_mostrar !== undefined ? (normEspacios(o.nombre_mostrar) || null) : undefined,
      incluido: o.incluido !== undefined ? aBool(o.incluido) : undefined,
      incluido_desde: Number.isFinite(desde) && desde >= 1 ? desde : undefined
    });
  });
  const nuevos = [], modificados = [];
  vistos.forEach((imp) => {
    const base = filaBase(imp.codigo);
    if (!base) {
      nuevos.push({ ...imp, nombre_mostrar: imp.nombre_mostrar ?? null, incluido: !!imp.incluido, incluido_desde: imp.incluido_desde || 1 });
      return;
    }
    const final = {
      ...base,
      nombre: imp.nombre || base.nombre,
      nombre_mostrar: imp.nombre_mostrar === undefined ? base.nombre_mostrar : imp.nombre_mostrar,
      incluido: imp.incluido === undefined ? base.incluido : imp.incluido,
      incluido_desde: imp.incluido_desde === undefined ? base.incluido_desde : imp.incluido_desde
    };
    const campos = ['nombre', 'nombre_mostrar', 'incluido', 'incluido_desde'].filter((k) => normEspacios(final[k]) !== normEspacios(base[k]));
    if (campos.length) modificados.push({ antes: base, despues: final, campos });
  });
  const sinCambios = vistos.size - nuevos.length - modificados.length;
  const ausentes = EST.abonos.filter((a) => !vistos.has(a.codigo)).length;
  if (!nuevos.length && !modificados.length) {
    status('com-ab-status', `El archivo no trae cambios (${sinCambios} abonos iguales${ausentes ? `, ${ausentes} de la base no están en el archivo y se dejan como están` : ''}).`, 'ok');
    return;
  }
  EST.importPendiente = { nuevos, modificados };
  $('com-imp-resumen').textContent = `${nuevos.length} abono(s) nuevo(s), ${modificados.length} modificado(s), ${sinCambios} sin cambios.` +
    (ausentes ? ` ${ausentes} abono(s) de la base no están en el archivo: no se borran.` : '') + ' Revisá y confirmá.';
  const si = (v) => (v ? 'Sí' : 'No');
  const celda = (m, k, fmt) => (m.campos.includes(k) ? `<span class="com-antes">${esc(fmt(m.antes[k]))}</span>${esc(fmt(m.despues[k]))}` : esc(fmt(m.despues[k])));
  $('com-imp-tbody').innerHTML =
    nuevos.map((n) => `<tr><td><span class="com-cambio com-cambio--nuevo">Nuevo</span></td><td class="com-codigo">${esc(n.codigo)}</td>
      <td>${esc(n.nombre)}</td><td>${si(n.incluido)}</td><td>${esc(n.incluido_desde)}</td></tr>`).join('') +
    modificados.map((m) => `<tr><td><span class="com-cambio com-cambio--mod">Modificado</span></td><td class="com-codigo">${esc(m.despues.codigo)}</td>
      <td>${celda(m, 'nombre', (x) => x || '')}${m.campos.includes('nombre_mostrar') ? `<br><small>Mostrar: ${celda(m, 'nombre_mostrar', (x) => x || '—')}</small>` : ''}</td>
      <td>${celda(m, 'incluido', si)}</td><td>${celda(m, 'incluido_desde', (x) => x)}</td></tr>`).join('');
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
    .select('id, mes, desde, hasta, generada_en, generada_por, totales, avisos')
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
      <td class="com-n">${pesos(t.base_comisionable)}</td>
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
  // .select() devuelve las filas borradas: si las políticas de la base no
  // dejan borrar, Supabase no da error, simplemente no borra nada.
  const { data, error } = await window.supabaseClient.from('comision_liquidacion').delete().eq('id', id).select('id');
  EST.liqBorrarPendiente = null;
  $('com-liq-confirm').hidden = true;
  $('com-liq-confirm-si').disabled = false;
  if (error) {
    console.error('[comisiones.js] eliminar liquidación', error);
    status('com-liq-status', 'No se pudo eliminar: ' + error.message, 'error');
    renderLiquidaciones();
    return;
  }
  if (!data || !data.length) {
    status('com-liq-status', 'La base no eliminó la liquidación: tu usuario necesita permiso "editar" en la sección Comisiones (o falta aplicar la migración 28 completa).', 'error');
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
      .order('vendedor').order('codigo').order('orden').range(desde, desde + 999);
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
  const t = liq.totales || {};
  let h = `<h3>Liquidación de ${esc(fmtMes(liq.mes))}</h3>
    <p class="com-detalle__meta">Oportunidades ganadas del ${esc(fmtDia(liq.desde))} al ${esc(fmtDia(liq.hasta))} ·
      generada el ${esc(fmtFechaHora(liq.generada_en))}${liq.generada_por ? ' por ' + esc(liq.generada_por) : ''} ·
      importes sin IVA</p>
    <div class="com-kpis">
      <div class="com-kpi"><b>${esc(t.ganadas ?? 0)}</b><span>Oportunidades ganadas</span></div>
      <div class="com-kpi"><b>${esc(t.ovs ?? 0)}</b><span>OV de abonos · ${esc(t.ganadas_sin_ov ?? 0)} ganadas sin OV</span></div>
      <div class="com-kpi"><b>${esc(t.ovs_comisionables ?? 0)}</b><span>OV con abonos incluidos</span></div>
      <div class="com-kpi"><b>${pesos(t.base_comisionable)}</b><span>Base comisionable</span></div>
      <div class="com-kpi com-kpi--total"><b>${pesos(t.comision)}</b><span>Comisión total</span></div>
    </div>`;
  if ((liq.avisos || []).length) {
    h += `<div class="com-avisos"><b>Avisos al generar</b><ul>${liq.avisos.map((a) => `<li>${esc(a)}</li>`).join('')}</ul></div>`;
  }
  h += `<h4>Por vendedor</h4><p class="com-detalle__meta" style="margin:-6px 0 8px">Click en un vendedor para ver el detalle por abono y filtrar las líneas.</p>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr>
      <th>Vendedor</th><th class="com-n">Ganadas</th><th class="com-n">OV de abonos</th><th class="com-n">OV con abonos incluidos</th>
      <th class="com-n">Base comisionable</th><th class="com-n">Comisión</th></tr></thead><tbody>`;
  vendedores.forEach((v) => {
    const abierto = EST.vendAbierto === v.vendedor;
    h += `<tr class="com-vend-row${abierto ? ' is-open' : ''}" data-vend="${esc(v.vendedor)}">
      <td>${abierto ? '▾' : '▸'} ${esc(v.vendedor)}</td><td class="com-n">${v.ganadas}</td><td class="com-n">${v.ovs}</td>
      <td class="com-n">${v.ovs_comisionables}</td><td class="com-n">${pesos(v.base_comisionable)}</td><td class="com-n"><b>${pesos(v.comision)}</b></td></tr>`;
    if (abierto) {
      h += `<tr class="com-sub"><td colspan="6">${(v.por_abono || []).length ? `<table class="com-subtabla"><thead><tr>
        <th>Abono</th><th class="com-n">OV</th><th class="com-n">Incluido desde</th><th class="com-n">OV que comisionan</th>
        <th class="com-n">Base</th><th class="com-n">Comisión</th></tr></thead><tbody>` +
        v.por_abono.map((a) => `<tr><td class="com-codigo">${esc(a.codigo)}</td><td class="com-n">${a.ovs}</td><td class="com-n">${esc(a.incluido_desde ?? '')}</td>
          <td class="com-n">${a.comisionan}</td><td class="com-n">${pesos(a.base)}</td><td class="com-n"><b>${pesos(a.comision)}</b></td></tr>`).join('') +
        '</tbody></table>' : '<span class="com-meta">Sin abonos incluidos.</span>'}</td></tr>`;
    }
  });
  h += `</tbody><tfoot><tr><td>Total</td><td class="com-n">${vendedores.reduce((s, v) => s + v.ganadas, 0)}</td>
    <td class="com-n">${vendedores.reduce((s, v) => s + v.ovs, 0)}</td><td class="com-n">${vendedores.reduce((s, v) => s + v.ovs_comisionables, 0)}</td>
    <td class="com-n">${pesos(t.base_comisionable)}</td><td class="com-n">${pesos(t.comision)}</td></tr></tfoot></table></div>`;

  const ls = EST.lineaFiltroVend ? lineas.filter((l) => l.vendedor === EST.lineaFiltroVend) : lineas;
  h += `<h4>Líneas de abono${EST.lineaFiltroVend ? ' · ' + esc(EST.lineaFiltroVend) : ''} (${ls.length})</h4>
    <div class="com-lineas-wrap"><table class="admin-table com-tabla"><thead><tr>
      <th>Vendedor</th><th>OV</th><th>Fecha OV</th><th>Cliente</th><th>Oportunidad</th><th>Abono</th>
      <th class="com-c">Incluido</th><th class="com-n">N.º</th><th class="com-c">Comisiona</th><th class="com-n">Importe</th><th class="com-n">Comisión</th>
    </tr></thead><tbody>` +
    (ls.length ? ls.map((l) => `<tr><td>${esc(l.vendedor)}</td><td>${esc(l.ov_numero)}</td><td>${esc(fmtDia(l.fecha_ov))}</td>
      <td>${esc(l.cliente)}</td><td>${esc(l.oportunidad)}</td><td title="${esc(l.articulo)}"><span class="com-codigo">${esc(l.codigo)}</span></td>
      <td class="com-c">${l.incluido ? '<span class="com-si">Sí</span>' : '<span class="com-no">No</span>'}</td>
      <td class="com-n">${l.orden ? `${l.orden}${l.incluido_desde > 1 ? ' / desde ' + l.incluido_desde : ''}` : ''}</td>
      <td class="com-c">${l.comisiona ? '<span class="com-si">Sí</span>' : '<span class="com-no">No</span>'}</td>
      <td class="com-n">${pesos(l.importe)}</td><td class="com-n">${l.comisiona ? '<b>' + pesos(l.comision) + '</b>' : ''}</td></tr>`).join('')
      : '<tr><td colspan="11" class="admin-empty">Sin líneas.</td></tr>') + '</tbody></table></div>';

  const sinOv = (liq.sin_ov || []).filter((o) => !EST.lineaFiltroVend || o.vendedor === EST.lineaFiltroVend);
  h += `<h4>Ganadas sin OV de abonos (${sinOv.length})</h4>` + (sinOv.length
    ? `<div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr><th>Vendedor</th><th>Oportunidad</th><th>Fecha</th><th>Cliente</th><th>Estado</th></tr></thead><tbody>` +
      sinOv.map((o) => `<tr><td>${esc(o.vendedor)}</td><td>${esc(o.oportunidad)}</td><td>${esc(fmtDia(o.fecha_oportunidad))}</td>
        <td>${esc(o.cliente)} <span class="com-meta">${esc(o.nro_cliente || '')}</span></td><td>${esc(o.estado_oportunidad || '')}</td></tr>`).join('') +
      '</tbody></table></div>'
    : '<p class="com-meta">Ninguna.</p>');

  const cfg = (liq.config || []).slice().sort((a, b) => (b.incluido - a.incluido) || compararCodigos(a.codigo, b.codigo));
  h += `<details class="com-config"><summary>Configuración de abonos usada (${cfg.filter((c) => c.incluido).length} incluidos de ${cfg.length})</summary>
    <div class="admin-table-wrap"><table class="admin-table com-tabla"><thead><tr><th>Código</th><th>Nombre</th><th class="com-c">Incluido</th><th class="com-n">Incluido desde</th></tr></thead><tbody>` +
    cfg.map((c) => `<tr><td class="com-codigo">${esc(c.codigo)}</td><td>${esc(c.nombre_mostrar || c.nombre)}</td>
      <td class="com-c">${c.incluido ? '<span class="com-si">Sí</span>' : '<span class="com-no">No</span>'}</td><td class="com-n">${esc(c.incluido_desde)}</td></tr>`).join('') +
    '</tbody></table></div></details>';

  const cont = $('com-liq-detalle');
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
    const wb = new ExcelJS.Workbook();
    const money = '#,##0.00';

    const ws1 = wb.addWorksheet('Por vendedor');
    ws1.columns = [
      { header: 'Vendedor', key: 'v', width: 28 }, { header: 'Oportunidades ganadas', key: 'g', width: 12 },
      { header: 'OV de abonos', key: 'o', width: 12 }, { header: 'OV con abonos incluidos', key: 'oc', width: 14 },
      { header: 'Base comisionable', key: 'b', width: 18, style: { numFmt: money } }, { header: 'Comisión', key: 'c', width: 18, style: { numFmt: money } }
    ];
    vendedores.forEach((v) => ws1.addRow({ v: v.vendedor, g: v.ganadas, o: v.ovs, oc: v.ovs_comisionables, b: Number(v.base_comisionable), c: Number(v.comision) }));
    const tot = ws1.addRow({ v: 'Total', g: vendedores.reduce((s, v) => s + v.ganadas, 0), o: vendedores.reduce((s, v) => s + v.ovs, 0),
      oc: vendedores.reduce((s, v) => s + v.ovs_comisionables, 0), b: Number(liq.totales.base_comisionable), c: Number(liq.totales.comision) });
    tot.font = { bold: true };

    const ws2 = wb.addWorksheet('Por abono');
    ws2.columns = [
      { header: 'Vendedor', key: 'v', width: 28 }, { header: 'Abono', key: 'a', width: 14 }, { header: 'OV', key: 'o', width: 8 },
      { header: 'Incluido desde', key: 'd', width: 14 }, { header: 'OV que comisionan', key: 'oc', width: 16 },
      { header: 'Base', key: 'b', width: 16, style: { numFmt: money } }, { header: 'Comisión', key: 'c', width: 16, style: { numFmt: money } }
    ];
    vendedores.forEach((v) => (v.por_abono || []).forEach((a) => ws2.addRow({ v: v.vendedor, a: a.codigo, o: a.ovs, d: a.incluido_desde, oc: a.comisionan, b: Number(a.base), c: Number(a.comision) })));

    const ws3 = wb.addWorksheet('Líneas');
    ws3.columns = [
      { header: 'Vendedor', key: 'vendedor', width: 26 }, { header: 'OV', key: 'ov_numero', width: 14 }, { header: 'Fecha OV', key: 'fecha_ov', width: 11 },
      { header: 'Modalidad', key: 'modalidad', width: 10 }, { header: 'Oportunidad', key: 'oportunidad', width: 14 },
      { header: 'Fecha oportunidad', key: 'fecha_oportunidad', width: 11 }, { header: 'Cliente', key: 'cliente', width: 30 },
      { header: 'Nro. cliente', key: 'nro_cliente', width: 12 }, { header: 'Código', key: 'codigo', width: 12 }, { header: 'Artículo', key: 'articulo', width: 50 },
      { header: 'Cantidad', key: 'cantidad', width: 9 }, { header: 'Importe', key: 'importe', width: 14, style: { numFmt: money } },
      { header: 'Incluido', key: 'incluido', width: 9 }, { header: 'N.º de OV del abono', key: 'orden', width: 10 },
      { header: 'Incluido desde', key: 'incluido_desde', width: 10 }, { header: 'Comisiona', key: 'comisiona', width: 10 },
      { header: 'Comisión', key: 'comision', width: 14, style: { numFmt: money } }
    ];
    lineas.forEach((l) => ws3.addRow({ ...l, fecha_ov: fmtDia(l.fecha_ov), fecha_oportunidad: fmtDia(l.fecha_oportunidad),
      importe: l.importe == null ? null : Number(l.importe), cantidad: l.cantidad == null ? null : Number(l.cantidad),
      incluido: l.incluido ? 'Sí' : 'No', comisiona: l.comisiona ? 'Sí' : 'No', comision: Number(l.comision) }));

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
      { header: 'Incluido', key: 'incluido', width: 10 }, { header: 'Incluido desde', key: 'incluido_desde', width: 14 }
    ];
    (liq.config || []).forEach((c) => ws5.addRow({ codigo: c.codigo, nombre: c.nombre, incluido: c.incluido ? 'Sí' : 'No', incluido_desde: c.incluido_desde }));

    [ws1, ws2, ws3, ws4, ws5].forEach((ws) => {
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

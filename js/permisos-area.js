/**
 * permisos-area.js — "Permisos por Área": ver la matriz área × sección,
 * descargarla como Excel, y (sólo superadmin) subir una versión editada
 * para aplicar los cambios.
 *
 * Todo corre en el navegador con ExcelJS (cargado en permisos-area.html
 * desde CDN) -- este sitio no tiene backend, así que el .xlsx en sí nunca
 * se sube ni se guarda en ningún servidor: se genera localmente al
 * descargar, y al subir uno se lee/parsea también en el navegador de
 * quien lo sube. Lo único que viaja a Supabase es el diff ya calculado
 * (filas de alta/baja), vía la RPC fn_aplicar_matriz_permisos
 * (supabase/migracion_12_import_export_permisos.sql).
 *
 * Fuentes de datos:
 *   - areas / secciones (lectura libre para autenticados, schema.sql) —
 *     acá se piden TODAS (no sólo las que ya tienen permiso), porque el
 *     Excel de edición tiene que poder agregar permisos a áreas que hoy
 *     no tienen ninguno.
 *   - fn_matriz_permisos() (migracion_11): sólo devuelve filas si el
 *     usuario tiene 'ver' sobre 'permisos-area'.
 */

const ESTADO = {
  session: null,
  areas: [],       // todas, id/nombre/parent_id
  secciones: [],   // todas, id/nombre/tipo
  actualMap: new Map(), // "area_id|seccion_id" -> 'ver' | 'editar'
  esSuperadmin: false,
  cambiosPendientes: null // último diff calculado, a la espera de confirmación
};

document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session) return; // page-guard.js ya se encarga del mensaje de acceso
  ESTADO.session = e.detail.session;
  await cargarMatriz();
  await verificarSiEsSuperadmin();
});

async function cargarMatriz() {
  const status = document.getElementById('permisos-area-status');
  const tableWrap = document.getElementById('permisos-area-table-wrap');
  const btnExportar = document.getElementById('permisos-area-btn-exportar');

  status.style.display = '';
  status.textContent = 'Cargando matriz de permisos…';
  tableWrap.style.display = 'none';

  const [areasRes, seccionesRes, matrizRes] = await Promise.all([
    window.supabaseClient.from('areas').select('id, nombre, parent_id').order('nombre'),
    window.supabaseClient.from('secciones').select('id, nombre, tipo').order('nombre'),
    window.supabaseClient.rpc('fn_matriz_permisos')
  ]);

  if (areasRes.error || seccionesRes.error || matrizRes.error) {
    status.textContent = 'No se pudo cargar la matriz de permisos. Probá recargar la página.';
    console.error('[permisos-area.js] error cargando datos', areasRes.error, seccionesRes.error, matrizRes.error);
    return;
  }

  ESTADO.areas = areasRes.data || [];
  ESTADO.secciones = seccionesRes.data || [];

  const permisos = matrizRes.data || [];
  if (permisos.length === 0) {
    status.textContent = 'No se encontraron permisos cargados (o no tenés acceso a esta vista).';
    return;
  }

  // "editar" pisa a "ver" si por algún motivo quedaron cargadas ambas
  // filas para la misma celda (editar ya implica ver).
  const mapa = new Map();
  permisos.forEach(p => {
    const key = `${p.area_id}|${p.seccion_id}`;
    if (mapa.get(key) !== 'editar') mapa.set(key, p.nivel_acceso);
  });
  ESTADO.actualMap = mapa;

  // La vista en pantalla sólo muestra las áreas con al menos un permiso
  // cargado (listar las 40+ completas, la mayoría vacías, sería más
  // ruido que ayuda acá) -- el Excel exportado sí lleva todas, ver
  // exportarExcel().
  const areasConPermisos = ESTADO.areas.filter(a => [...mapa.keys()].some(k => k.startsWith(a.id + '|')));
  renderTabla(areasConPermisos, ESTADO.secciones, mapa);

  status.style.display = 'none';
  tableWrap.style.display = '';
  btnExportar.disabled = false;
}

function renderTabla(areas, secciones, mapa) {
  const theadRow = document.getElementById('permisos-area-thead-row');
  const tbody = document.getElementById('permisos-area-tbody');

  theadRow.innerHTML = '<th>Área</th>' +
    secciones.map(s => `<th>${escapeHtml(s.nombre)}</th>`).join('');

  tbody.innerHTML = areas.map(a => {
    const celdas = secciones.map(s => {
      const nivel = mapa.get(`${a.id}|${s.id}`);
      if (!nivel) return '<td class="permisos-area-cell permisos-area-cell--vacia">—</td>';
      const claseNivel = nivel === 'editar' ? 'tag--editar' : 'tag--ver';
      const etiqueta = nivel === 'editar' ? 'Editar' : 'Ver';
      return `<td class="permisos-area-cell"><span class="tag ${claseNivel}">${etiqueta}</span></td>`;
    }).join('');
    return `<tr><td class="permisos-area-cell permisos-area-cell--area">${escapeHtml(a.nombre)}</td>${celdas}</tr>`;
  }).join('');
}

document.getElementById('permisos-area-btn-exportar')?.addEventListener('click', exportarExcel);

// ─────────────────────────────────────────────────────────────────────
// EXPORT — arma el .xlsx en el navegador y dispara la descarga local.
// Formato pensado para poder editarse a mano y volver a subirse: fila 1
// de la "Matriz de permisos" lleva los id técnicos de sección (no
// tocar), fila 2 los nombres humanos (sí se pueden renombrar/anotar sin
// romper el import), y la columna A de cada fila el id técnico del área
// (tampoco tocar) con el nombre humano en la columna B.
// ─────────────────────────────────────────────────────────────────────
async function exportarExcel() {
  const btn = document.getElementById('permisos-area-btn-exportar');
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = 'Generando…';

  try {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Web Interna SP';
    wb.created = new Date();

    const hojaInstrucciones = wb.addWorksheet('Instrucciones');
    hojaInstrucciones.columns = [{ width: 100 }];
    [
      'Permisos por área — Web Interna SP (exportado desde Administración → Permisos por Área)',
      '',
      'Cómo editar este archivo:',
      '1. Ir a la hoja "Matriz de permisos". Cada fila es un área, cada columna una sección.',
      '2. Escribir "Ver" o "Editar" en la celda que corresponda (vacío = sin permiso). "Editar" ya incluye "Ver".',
      '3. NO tocar la fila 1 (ids técnicos) ni la columna A (id de área) — son los que usa el sistema para saber a qué fila/columna corresponde cada celda. La fila 2 y la columna B (nombres) sí se pueden anotar libremente.',
      '4. Guardar el archivo y volver a Administración → Permisos por Área → "Actualizar desde Excel" para subirlo. Antes de aplicar nada se muestra un resumen de qué cambiaría.',
      '',
      `Generado: ${new Date().toLocaleString('es-AR')}`
    ].forEach(linea => hojaInstrucciones.addRow([linea]));

    const hojaSecciones = wb.addWorksheet('Secciones');
    hojaSecciones.addRow(['ID', 'Nombre', 'Tipo']);
    hojaSecciones.getRow(1).font = { bold: true };
    ESTADO.secciones.forEach(s => hojaSecciones.addRow([s.id, s.nombre, s.tipo]));

    const hojaAreas = wb.addWorksheet('Áreas (referencia)');
    hojaAreas.addRow(['ID', 'Nombre', 'Área padre']);
    hojaAreas.getRow(1).font = { bold: true };
    ESTADO.areas.forEach(a => hojaAreas.addRow([a.id, a.nombre, a.parent_id || '']));

    const hojaMatriz = wb.addWorksheet('Matriz de permisos');
    const filaTecnica = ['ID técnico (no editar)', '', ...ESTADO.secciones.map(s => s.id)];
    const filaHumana = ['(no editar)', 'Área', ...ESTADO.secciones.map(s => s.nombre)];
    hojaMatriz.addRow(filaTecnica);
    hojaMatriz.addRow(filaHumana);
    hojaMatriz.getRow(1).font = { italic: true, color: { argb: 'FF9CA3AF' }, size: 9 };
    hojaMatriz.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hojaMatriz.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0C2340' } };
    hojaMatriz.getColumn(1).width = 26;
    hojaMatriz.getColumn(2).width = 30;
    ESTADO.secciones.forEach((_s, i) => { hojaMatriz.getColumn(i + 3).width = 16; });

    ESTADO.areas.forEach(a => {
      const valores = ESTADO.secciones.map(s => {
        const nivel = ESTADO.actualMap.get(`${a.id}|${s.id}`);
        return nivel === 'editar' ? 'Editar' : nivel === 'ver' ? 'Ver' : '';
      });
      const fila = hojaMatriz.addRow([a.id, a.nombre, ...valores]);
      fila.getCell(1).font = { color: { argb: 'FF9CA3AF' }, size: 9 };
      for (let col = 3; col < 3 + ESTADO.secciones.length; col++) {
        fila.getCell(col).dataValidation = {
          type: 'list', allowBlank: true, formulae: ['"Ver,Editar"']
        };
      }
    });
    hojaMatriz.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const fecha = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Permisos_por_Area_WebInternaSP_${fecha}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error('[permisos-area.js] error generando el Excel', err);
    alert('No se pudo generar el Excel. Revisá la consola para más detalle.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }
}

// ─────────────────────────────────────────────────────────────────────
// IMPORT (sólo superadmin) — leer el archivo, calcular el diff contra
// ESTADO.actualMap, mostrar un preview, y sólo aplicar si se confirma.
// ─────────────────────────────────────────────────────────────────────
async function verificarSiEsSuperadmin() {
  const { data: perfil, error } = await window.supabaseClient
    .from('perfiles')
    .select('es_superadmin')
    .eq('id', ESTADO.session.user.id)
    .single();

  if (error || !perfil || !perfil.es_superadmin) return;

  ESTADO.esSuperadmin = true;
  document.getElementById('permisos-area-import-section').style.display = '';
  wireImportUI();
}

let _importUIWired = false;
function wireImportUI() {
  if (_importUIWired) return;
  _importUIWired = true;

  document.getElementById('permisos-area-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    document.getElementById('permisos-area-file-name').textContent = file ? file.name : '';
    if (!file) return;

    ocultarImportStatus();
    ocultarPreview();

    try {
      const deseado = await parsearArchivo(file);
      const cambios = calcularDiff(ESTADO.actualMap, deseado);
      if (cambios.length === 0) {
        mostrarImportStatus('El archivo no tiene cambios respecto a lo que ya está cargado.', false);
        return;
      }
      ESTADO.cambiosPendientes = cambios;
      mostrarPreview(cambios);
    } catch (err) {
      console.error('[permisos-area.js] error procesando el archivo', err);
      mostrarImportStatus(err.message || 'No se pudo leer el archivo.', true);
    } finally {
      e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta reintentar
    }
  });

  document.getElementById('permisos-area-btn-cancelar').addEventListener('click', () => {
    ESTADO.cambiosPendientes = null;
    ocultarPreview();
    document.getElementById('permisos-area-file-name').textContent = '';
  });

  document.getElementById('permisos-area-btn-confirmar').addEventListener('click', aplicarCambios);
}

// Devuelve un Map "area_id|seccion_id" -> 'ver' | 'editar' con lo que
// pide el archivo. Valida ids de área/sección contra el estado actual de
// la base (ESTADO.areas/secciones) y tira error (sin aplicar nada) ante
// cualquier cosa rara -- mejor frenar con un mensaje claro que aplicar
// algo a medias o mal interpretado.
async function parsearArchivo(file) {
  const buffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const hoja = wb.getWorksheet('Matriz de permisos');
  if (!hoja) throw new Error('No se encontró la hoja "Matriz de permisos" en el archivo.');

  const seccionesCols = [];
  hoja.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    if (colNumber < 3) return; // A y B son ID de área / nombre, no secciones
    const seccionId = String(cell.value || '').trim();
    if (seccionId) seccionesCols.push({ col: colNumber, seccionId });
  });

  if (seccionesCols.length === 0) {
    throw new Error('No se encontraron columnas de sección en la fila 1 (a partir de la columna C). ¿Se borró la fila de IDs técnicos?');
  }

  const seccionesValidas = new Set(ESTADO.secciones.map(s => s.id));
  const seccionesDesconocidas = [...new Set(seccionesCols.filter(c => !seccionesValidas.has(c.seccionId)).map(c => c.seccionId))];
  if (seccionesDesconocidas.length > 0) {
    throw new Error('No se aplicó nada. Columnas con id de sección que no existe hoy en la base: ' + seccionesDesconocidas.join(', '));
  }

  const areasValidas = new Set(ESTADO.areas.map(a => a.id));
  const areasDesconocidas = [];
  const deseado = new Map();

  for (let rowNumber = 3; rowNumber <= hoja.rowCount; rowNumber++) {
    const fila = hoja.getRow(rowNumber);
    const areaId = String(fila.getCell(1).value || '').trim();
    if (!areaId) continue; // fila vacía, se ignora

    if (!areasValidas.has(areaId)) {
      areasDesconocidas.push(`fila ${rowNumber} ("${areaId}")`);
      continue;
    }

    for (const { col, seccionId } of seccionesCols) {
      const valorCrudo = String(fila.getCell(col).value || '').trim().toLowerCase();
      if (!valorCrudo) continue;
      if (valorCrudo !== 'ver' && valorCrudo !== 'editar') {
        throw new Error(`No se aplicó nada. Valor no reconocido "${valorCrudo}" en la fila ${rowNumber}, columna de sección "${seccionId}" — sólo se acepta "Ver", "Editar" o vacío.`);
      }
      deseado.set(`${areaId}|${seccionId}`, valorCrudo);
    }
  }

  if (areasDesconocidas.length > 0) {
    throw new Error('No se aplicó nada. Filas con id de área que no existe hoy en la base: ' + areasDesconocidas.join(', '));
  }

  return deseado;
}

function calcularDiff(actual, deseado) {
  const keys = new Set([...actual.keys(), ...deseado.keys()]);
  const cambios = [];
  keys.forEach(key => {
    const antes = actual.get(key) || null;
    const despues = deseado.get(key) || null;
    if (antes === despues) return;
    const [areaId, seccionId] = key.split('|');
    cambios.push({ areaId, seccionId, antes, despues });
  });
  return cambios;
}

function mostrarPreview(cambios) {
  const nombreArea = id => ESTADO.areas.find(a => a.id === id)?.nombre || id;
  const nombreSeccion = id => ESTADO.secciones.find(s => s.id === id)?.nombre || id;
  const etiquetaNivel = n => n === 'editar' ? 'Editar' : n === 'ver' ? 'Ver' : '—';
  const etiquetaCambio = c => {
    if (!c.antes) return 'Nuevo permiso';
    if (!c.despues) return 'Se quita';
    return 'Se cambia';
  };

  const altas = cambios.filter(c => c.despues && !c.antes).length;
  const bajas = cambios.filter(c => !c.despues).length;
  const cambiadas = cambios.length - altas - bajas;

  document.getElementById('permisos-area-preview-summary').textContent =
    `${cambios.length} celda(s) van a cambiar: ${altas} nuevo(s), ${bajas} se quitan, ${cambiadas} se modifican.`;

  document.getElementById('permisos-area-preview-tbody').innerHTML = cambios.map(c => `
    <tr>
      <td>${etiquetaCambio(c)}</td>
      <td>${escapeHtml(nombreArea(c.areaId))}</td>
      <td>${escapeHtml(nombreSeccion(c.seccionId))}</td>
      <td>${etiquetaNivel(c.antes)}</td>
      <td>${etiquetaNivel(c.despues)}</td>
    </tr>
  `).join('');

  document.getElementById('permisos-area-preview').style.display = '';
}

function ocultarPreview() {
  document.getElementById('permisos-area-preview').style.display = 'none';
}

async function aplicarCambios() {
  const cambios = ESTADO.cambiosPendientes;
  if (!cambios || cambios.length === 0) return;

  const btn = document.getElementById('permisos-area-btn-confirmar');
  btn.disabled = true;
  btn.textContent = 'Aplicando…';

  const altas = cambios.filter(c => c.despues).map(c => ({ area_id: c.areaId, seccion_id: c.seccionId, nivel_acceso: c.despues }));
  const bajas = cambios.filter(c => c.antes).map(c => ({ area_id: c.areaId, seccion_id: c.seccionId, nivel_acceso: c.antes }));

  const { error } = await window.supabaseClient.rpc('fn_aplicar_matriz_permisos', { p_altas: altas, p_bajas: bajas });

  btn.disabled = false;
  btn.textContent = 'Confirmar y aplicar';

  if (error) {
    console.error('[permisos-area.js] error aplicando cambios', error);
    mostrarImportStatus('No se pudieron aplicar los cambios: ' + error.message, true);
    return;
  }

  ESTADO.cambiosPendientes = null;
  ocultarPreview();
  document.getElementById('permisos-area-file-name').textContent = '';
  mostrarImportStatus(`Listo — se aplicaron ${cambios.length} cambio(s).`, false);
  await cargarMatriz();
}

function mostrarImportStatus(mensaje, esError) {
  const el = document.getElementById('permisos-area-import-status');
  el.textContent = mensaje;
  el.className = 'permisos-area-import-status' + (esError ? ' permisos-area-import-status--error' : ' permisos-area-import-status--ok');
  el.style.display = '';
}

function ocultarImportStatus() {
  document.getElementById('permisos-area-import-status').style.display = 'none';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

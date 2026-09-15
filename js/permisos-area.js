/**
 * permisos-area.js — Mosaico "Permisos por Área": vista de solo lectura de
 * la matriz área × sección tal como está en permisos_area_seccion.
 *
 * Arma la grilla cruzando dos fuentes:
 *   - areas / secciones (lectura libre para autenticados, schema.sql) —
 *     para tener nombres e ids completos, aunque una fila no tenga
 *     ningún permiso cargado.
 *   - fn_matriz_permisos() (supabase/migracion_11_seccion_permisos_area.sql):
 *     sólo devuelve filas si el usuario logueado tiene 'ver' sobre la
 *     sección 'permisos-area' — ver esa migración para el porqué de una
 *     RPC dedicada en vez de leer permisos_area_seccion directo.
 *
 * Deliberadamente de solo lectura en esta primera etapa: no hay import ni
 * edición inline todavía (eso es la próxima etapa, el import/export con
 * el Excel).
 */

document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session) return; // page-guard.js ya se encarga del mensaje de acceso
  await cargarMatriz();
});

async function cargarMatriz() {
  const status = document.getElementById('permisos-area-status');
  const tableWrap = document.getElementById('permisos-area-table-wrap');

  const [areasRes, seccionesRes, matrizRes] = await Promise.all([
    window.supabaseClient.from('areas').select('id, nombre').order('nombre'),
    window.supabaseClient.from('secciones').select('id, nombre').order('nombre'),
    window.supabaseClient.rpc('fn_matriz_permisos')
  ]);

  if (areasRes.error || seccionesRes.error || matrizRes.error) {
    status.textContent = 'No se pudo cargar la matriz de permisos. Probá recargar la página.';
    console.error('[permisos-area.js] error cargando datos', areasRes.error, seccionesRes.error, matrizRes.error);
    return;
  }

  const areas = areasRes.data || [];
  const secciones = seccionesRes.data || [];
  const permisos = matrizRes.data || [];

  if (permisos.length === 0) {
    status.textContent = 'No se encontraron permisos cargados (o no tenés acceso a esta vista).';
    return;
  }

  // area_id -> seccion_id -> 'ver' | 'editar'
  const mapa = {};
  permisos.forEach(p => {
    if (!mapa[p.area_id]) mapa[p.area_id] = {};
    // "editar" pisa a "ver" si por algún motivo quedaron cargadas ambas
    // filas para la misma celda (editar ya implica ver).
    if (mapa[p.area_id][p.seccion_id] !== 'editar') {
      mapa[p.area_id][p.seccion_id] = p.nivel_acceso;
    }
  });

  // Sólo se muestran las áreas que tienen al menos un permiso cargado --
  // listar las 42 áreas completas, la mayoría vacías, sería más ruido que
  // ayuda acá (ver seed_areas.sql si hace falta comparar contra el
  // organigrama completo).
  const areasConPermisos = areas.filter(a => mapa[a.id]);

  renderTabla(areasConPermisos, secciones, mapa);

  status.style.display = 'none';
  tableWrap.style.display = '';
}

function renderTabla(areas, secciones, mapa) {
  const theadRow = document.getElementById('permisos-area-thead-row');
  const tbody = document.getElementById('permisos-area-tbody');

  theadRow.innerHTML = '<th>Área</th>' +
    secciones.map(s => `<th>${escapeHtml(s.nombre)}</th>`).join('');

  tbody.innerHTML = areas.map(a => {
    const celdas = secciones.map(s => {
      const nivel = mapa[a.id][s.id];
      if (!nivel) return '<td class="permisos-area-cell permisos-area-cell--vacia">—</td>';
      const claseNivel = nivel === 'editar' ? 'tag--editar' : 'tag--ver';
      const etiqueta = nivel === 'editar' ? 'Editar' : 'Ver';
      return `<td class="permisos-area-cell"><span class="tag ${claseNivel}">${etiqueta}</span></td>`;
    }).join('');
    return `<tr><td class="permisos-area-cell permisos-area-cell--area">${escapeHtml(a.nombre)}</td>${celdas}</tr>`;
  }).join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

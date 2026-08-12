/**
 * fichas-data-loader.js — Reemplaza los <script> estáticos de
 * js/fichas/versiones/*.js: trae fichas + ficha_versiones desde Supabase
 * y arma window.FICHA_VERSIONS con la MISMA forma que esperaban esos
 * archivos (window.FICHA_VERSIONS[fichaId][versionKey] = {...}), para que
 * js/ficha-renderer.js no necesite ningún cambio — sólo cambia de dónde
 * sale el dato.
 *
 * El contenido real ahora se edita desde pages/fichas-editor.html y vive
 * en las tablas fichas / ficha_versiones — ver
 * supabase/migracion_4_fichas_producto.sql.
 *
 * window.SP_FICHAS_READY es una Promise que las páginas que muestran una
 * ficha (mapa-servicios.js, sector-comunicaciones.js) esperan antes de
 * llamar a renderFichaById(), porque ahora la carga es asíncrona — a
 * diferencia de los <script> estáticos que quedaban listos antes que
 * cualquier otro código de la página corriera.
 *
 * Se engancha a 'sp:auth-ready' (mismo evento que usa page-guard.js) — sin
 * sesión no hay fichas para traer, la política de lectura de
 * ficha_versiones exige usuario autenticado con permiso de ver la sección.
 */

window.FICHA_VERSIONS = window.FICHA_VERSIONS || {};

let _resolveFichasReady;
window.SP_FICHAS_READY = new Promise((resolve) => { _resolveFichasReady = resolve; });

document.addEventListener('sp:auth-ready', async (e) => {
  if (!e.detail.session || !window.supabaseClient) {
    // Sin sesión: page-guard.js ya se encarga de tapar la página. No hay
    // nada que traer, pero igual se resuelve la promesa para no dejar
    // colgado a quien esté esperándola.
    _resolveFichasReady();
    return;
  }

  const { data, error } = await window.supabaseClient
    .from('ficha_versiones')
    .select('*');

  if (error) {
    console.error('[fichas-data-loader.js] error cargando fichas', error);
    _resolveFichasReady();
    return;
  }

  window.FICHA_VERSIONS = buildFichaVersions(data || []);
  _resolveFichasReady();
});

// Arma window.FICHA_VERSIONS a partir de las filas de ficha_versiones,
// mapeando los nombres de columna (snake_case) a las propiedades que ya
// usa ficha-renderer.js (camelCase, heredadas de los archivos estáticos
// que reemplaza este loader).
function buildFichaVersions(rows) {
  const porFicha = {};
  rows.forEach(v => {
    if (!porFicha[v.ficha_id]) porFicha[v.ficha_id] = [];
    porFicha[v.ficha_id].push(v);
  });

  const result = {};
  Object.keys(porFicha).forEach(fichaId => {
    // Ascendente (más vieja primero) — igual que el orden cronológico en
    // que se cargaban los <script> antes, así Object.keys(...).at(-1)
    // sigue dando la versión más reciente sin tocar ficha-renderer.js.
    const versiones = porFicha[fichaId].slice().sort(compareVersionKeysAsc);
    result[fichaId] = {};
    versiones.forEach(v => {
      result[fichaId][v.version_key] = {
        id: v.ficha_id,
        badge: v.badge,
        name: v.nombre,
        version: v.version,
        date: v.fecha,
        author: v.autor,
        liderProducto: v.lider_producto || undefined,
        colaborador: v.colaborador || undefined,
        versionId: v.version_id,
        versionDesc: v.version_desc,
        general: v.general,
        equipamiento: v.equipamiento,
        precios: v.precios,
        proceso: v.proceso,
        faq: v.faq,
        competencia: v.competencia,
        areas: v.areas,
      };
    });
  });
  return result;
}

function compareVersionKeysAsc(a, b) {
  const [amaj, amin] = parseVersionKey(a.version_key);
  const [bmaj, bmin] = parseVersionKey(b.version_key);
  return (amaj - bmaj) || (amin - bmin);
}

function parseVersionKey(vk) {
  const m = (vk || '').match(/^v(\d+)\.(\d+)$/i);
  return m ? [parseInt(m[1], 10), parseInt(m[2], 10)] : [0, 0];
}

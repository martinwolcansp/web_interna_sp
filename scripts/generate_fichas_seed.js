/**
 * generate_fichas_seed.js — A partir de scripts/fichas_extracted.json
 * (generado por extract_fichas.js), arma supabase/seed_fichas_producto.sql
 * con INSERTs idempotentes (on conflict do update) para fichas y
 * ficha_versiones.
 *
 * Uso: node scripts/extract_fichas.js && node scripts/generate_fichas_seed.js
 */
const fs = require('fs');
const path = require('path');
const FV = require(path.join(__dirname, 'fichas_extracted.json'));

const SECCION_POR_FICHA = {
  'comercio-seguro': 'mapa-servicios',
  'hogar-comodato': 'mapa-servicios',
  'hogar-venta': 'mapa-servicios',
  'obra-segura': 'mapa-servicios',
  'nuevas-tecnologias': 'sector-comunicaciones',
};

// Orden numérico real de version_key (v1.2 antes que v1.10), no orden de string.
function parseVersionKey(vk) {
  const m = vk.match(/^v(\d+)\.(\d+)$/i);
  if (!m) return [0, 0];
  return [parseInt(m[1], 10), parseInt(m[2], 10)];
}
function compareVersionKeys(a, b) {
  const [amaj, amin] = parseVersionKey(a);
  const [bmaj, bmin] = parseVersionKey(b);
  return amaj - bmaj || amin - bmin;
}

function sqlStr(v) {
  if (v === undefined || v === null) return 'null';
  return `'${String(v).replace(/'/g, "''")}'`;
}
function sqlJsonb(v) {
  const json = JSON.stringify(v === undefined ? {} : v);
  return `'${json.replace(/'/g, "''")}'::jsonb`;
}

let out = [];
out.push('-- =========================================================================');
out.push('-- Seed — contenido real de las fichas de producto, migrado desde');
out.push('-- js/fichas/versiones/*.js con scripts/extract_fichas.js (evalúa los');
out.push('-- objetos tal cual, sin transcripción manual). Generado el 2026-08-12.');
out.push('--');
out.push('-- Correr DESPUÉS de migracion_4_fichas_producto.sql. Idempotente: usa');
out.push('-- on conflict do update en ambas tablas, así se puede re-correr si se');
out.push('-- vuelve a exportar contenido actualizado del código.');
out.push('-- =========================================================================');
out.push('');
out.push('begin;');
out.push('');

const fichaIds = Object.keys(FV).sort();

// 1. fichas — usa la última versión (por orden numérico) para nombre/badge.
out.push('-- 1. Catálogo de fichas');
out.push('insert into fichas (id, seccion_id, nombre, badge) values');
const fichaRows = fichaIds.map(fichaId => {
  const versionKeys = Object.keys(FV[fichaId]).sort(compareVersionKeys);
  const ultima = FV[fichaId][versionKeys[versionKeys.length - 1]];
  const seccionId = SECCION_POR_FICHA[fichaId];
  if (!seccionId) throw new Error('Sin seccion_id mapeado para ' + fichaId);
  return `  (${sqlStr(fichaId)}, ${sqlStr(seccionId)}, ${sqlStr(ultima.name)}, ${sqlStr(ultima.badge)})`;
});
out.push(fichaRows.join(',\n') + '\n' + 'on conflict (id) do update set\n  seccion_id = excluded.seccion_id,\n  nombre = excluded.nombre,\n  badge = excluded.badge;');
out.push('');

// 2. ficha_versiones — todas las versiones de todas las fichas.
out.push('-- 2. Versiones (contenido de las 7 pestañas)');
out.push('insert into ficha_versiones (');
out.push('  ficha_id, version_key, version_id, version_desc, nombre, badge, version,');
out.push('  fecha, autor, lider_producto, colaborador,');
out.push('  general, equipamiento, precios, proceso, faq, competencia, areas');
out.push(') values');

const versionRows = [];
for (const fichaId of fichaIds) {
  const versionKeys = Object.keys(FV[fichaId]).sort(compareVersionKeys);
  for (const vk of versionKeys) {
    const v = FV[fichaId][vk];
    versionRows.push(
      '  (' + [
        sqlStr(fichaId),
        sqlStr(vk),
        sqlStr(v.versionId),
        sqlStr(v.versionDesc),
        sqlStr(v.name),
        sqlStr(v.badge),
        sqlStr(v.version),
        sqlStr(v.date),
        sqlStr(v.author),
        sqlStr(v.liderProducto),
        sqlStr(v.colaborador),
        sqlJsonb(v.general),
        sqlJsonb(v.equipamiento),
        sqlJsonb(v.precios),
        sqlJsonb(v.proceso),
        sqlJsonb(v.faq),
        sqlJsonb(v.competencia),
        sqlJsonb(v.areas),
      ].join(', ') + ')'
    );
  }
}
out.push(versionRows.join(',\n'));
out.push('on conflict (ficha_id, version_key) do update set');
out.push('  version_id = excluded.version_id,');
out.push('  version_desc = excluded.version_desc,');
out.push('  nombre = excluded.nombre,');
out.push('  badge = excluded.badge,');
out.push('  version = excluded.version,');
out.push('  fecha = excluded.fecha,');
out.push('  autor = excluded.autor,');
out.push('  lider_producto = excluded.lider_producto,');
out.push('  colaborador = excluded.colaborador,');
out.push('  general = excluded.general,');
out.push('  equipamiento = excluded.equipamiento,');
out.push('  precios = excluded.precios,');
out.push('  proceso = excluded.proceso,');
out.push('  faq = excluded.faq,');
out.push('  competencia = excluded.competencia,');
out.push('  areas = excluded.areas;');
out.push('');
out.push('commit;');

const outFile = path.join(__dirname, '..', 'supabase', 'seed_fichas_producto.sql');
fs.writeFileSync(outFile, out.join('\n') + '\n');
console.log('OK, escrito', outFile, '| filas fichas:', fichaRows.length, '| filas ficha_versiones:', versionRows.length);

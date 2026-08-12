/**
 * extract_fichas.js — Evalúa js/fichas/versiones/*.js (window.FICHA_VERSIONS)
 * en un sandbox y vuelca el resultado a scripts/fichas_extracted.json, para
 * migrar el contenido real con fidelidad en vez de transcribirlo a mano.
 *
 * Uso: node scripts/extract_fichas.js
 * Después: node scripts/generate_fichas_seed.js (arma supabase/seed_fichas_producto.sql)
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dir = path.join(__dirname, '..', 'js', 'fichas', 'versiones');
const outFile = path.join(__dirname, 'fichas_extracted.json');

// Orden numérico real del nombre de archivo (...-v1.10.js después de
// ...-v1.9.js, no antes) — un sort de string plano pondría v1.10 antes de
// v1.2. Sólo afecta el orden de inserción en el JSON intermedio (informativo);
// generate_fichas_seed.js y js/fichas-data-loader.js ya re-ordenan por su
// cuenta al armar el seed y window.FICHA_VERSIONS respectivamente.
function partesDelNombre(filename) {
  const m = filename.match(/^(.*)-v(\d+)\.(\d+)\.js$/i);
  return m ? [m[1], parseInt(m[2], 10), parseInt(m[3], 10)] : [filename, 0, 0];
}
const files = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort((a, b) => {
  const [aPrefix, aMaj, aMin] = partesDelNombre(a);
  const [bPrefix, bMaj, bMin] = partesDelNombre(b);
  return aPrefix.localeCompare(bPrefix, 'es') || (aMaj - bMaj) || (aMin - bMin);
});

const sandbox = { window: {}, console };
vm.createContext(sandbox);

for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    vm.runInContext(src, sandbox, { filename: f });
  } catch (e) {
    console.error('ERROR evaluando', f, e.message);
    process.exit(1);
  }
}

const FV = sandbox.window.FICHA_VERSIONS;
const fichaIds = Object.keys(FV);
console.log('Fichas encontradas:', fichaIds);
for (const id of fichaIds) {
  console.log(' -', id, '->', Object.keys(FV[id]));
}

fs.writeFileSync(outFile, JSON.stringify(FV, null, 2));
console.log('OK, escrito', outFile);

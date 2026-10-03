// Build halaman Claude Artifact dari index.html.
// Artifact membungkus halaman dengan <!doctype>/<head>/<body> sendiri, jadi kita ambil isi <head> (bagian bertanda) + isi <body>.
// Output: dist/artifact.html (+ assets/ dipublish via `files`).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const head = html.split('<!-- ARTIFACT:START -->')[1].split('<!-- ARTIFACT:HEAD-END -->')[0].trim();
const body = html.split(/<body[^>]*>/)[1].split('</body>')[0].trim();
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'artifact.html'), head + '\n' + body + '\n');
// Demo link opens AlphaLeaders directly; Lightech staff use #lightech.
writeFileSync(join(root, 'dist', 'artifact-config.js'), "window.MCRM_CONFIG = window.MCRM_CONFIG || { apiUrl: '', defaultTenant: 'alphaleaders' };\n");
console.log('dist/artifact.html written');

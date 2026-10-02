// Builds the static site for lightech.co.id/alpha (or any static host).
//   node scripts/build-deploy.mjs                 → dist/alpha/ + dist/lightech-alpha.zip (apiUrl left empty)
//   API_URL=https://script.google.com/macros/s/…/exec node scripts/build-deploy.mjs   → apiUrl filled in
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'alpha');
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'assets'), { recursive: true });

const assets = ['app.css', 'app.js', 'presets.js'];
const hash = createHash('sha256');
assets.forEach((f) => { copyFileSync(join(root, 'assets', f), join(out, 'assets', f)); hash.update(readFileSync(join(root, 'assets', f))); });
const v = hash.digest('hex').slice(0, 10);

const api = process.env.API_URL || '';
writeFileSync(join(out, 'assets', 'config.js'), `/* Deployment config — set apiUrl to the Apps Script Web App URL (…/exec). */\nwindow.MCRM_CONFIG = window.MCRM_CONFIG || { apiUrl: ${JSON.stringify(api)} };\n`);

let html = readFileSync(join(root, 'index.html'), 'utf8');
assets.forEach((f) => { html = html.replace(`assets/${f}"`, `assets/${f}?v=${v}"`); });
html = html.replace('assets/config.js"', `assets/config.js?v=${Date.now().toString(36)}"`);
writeFileSync(join(out, 'index.html'), html);

// Apache / cPanel: security headers, no stale app shell, long cache for versioned assets.
writeFileSync(join(out, '.htaccess'), `# Lightrees Mentoring CRM — /alpha
Options -Indexes
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  <FilesMatch "\\.(html|htm)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "config\\.js$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(css|js)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
</IfModule>
`);
writeFileSync(join(out, 'VERSION.txt'), `Lightrees Mentoring CRM\nbuild ${v}\nbuilt ${new Date().toISOString()}\napiUrl ${api ? 'set' : 'EMPTY — edit assets/config.js'}\n`);

const zip = join(root, 'dist', 'lightech-alpha.zip');
rmSync(zip, { force: true });
execFileSync('python3', ['-c', `import shutil; shutil.make_archive(${JSON.stringify(zip.replace(/\.zip$/, ''))}, 'zip', ${JSON.stringify(out)})`]);
console.log(`dist/alpha built (assets v=${v}, apiUrl ${api ? 'set' : 'empty'}) → ${zip}`);

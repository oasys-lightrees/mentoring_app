// Builds the static site for lightech.co.id/alpha (or any static host).
//   node scripts/build-deploy.mjs                 → dist/alpha/ + dist/lightech-alpha.zip (apiUrl left empty)
//   API_URL=https://script.google.com/macros/s/…/exec node scripts/build-deploy.mjs   → apiUrl filled in
import { readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync, readdirSync, existsSync } from 'node:fs';
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
const tenant = process.env.DEFAULT_TENANT ?? 'alphaleaders'; // the bare link opens this company; DEFAULT_TENANT= (empty) for the neutral sign-in
writeFileSync(join(out, 'assets', 'config.js'), `/* Deployment config — apiUrl: Apps Script Web App URL (…/exec); defaultTenant: company opened by the bare link (Lightech uses #lightech). */\nwindow.MCRM_CONFIG = window.MCRM_CONFIG || { apiUrl: ${JSON.stringify(api)}, defaultTenant: ${JSON.stringify(tenant)} };\n`);
mkdirSync(join(out, 'assets', 'brands'), { recursive: true });
readdirSync(join(root, 'assets', 'brands')).forEach((f) => copyFileSync(join(root, 'assets', 'brands', f), join(out, 'assets', 'brands', f)));

let html = readFileSync(join(root, 'index.html'), 'utf8');
assets.forEach((f) => { html = html.replace(`assets/${f}"`, `assets/${f}?v=${v}"`); });
html = html.replace('assets/config.js"', `assets/config.js?v=${Date.now().toString(36)}"`);

const brandIcon = tenant && existsSync(join(root, 'assets', 'brands', `${tenant}-icon.png`)) ? `assets/brands/${tenant}-icon.png` : '';
const appIcon = brandIcon || 'assets/icon.svg';
const appName = tenant === 'alphaleaders' ? 'AlphaLeaders' : 'Lightech Mentoring App';
// Installable app (PWA): home-screen icon on phones, app shell available offline. Data still comes from the server.
html = html.replace('<!-- ARTIFACT:START -->', `<!-- ARTIFACT:START -->
<link rel="manifest" href="manifest.webmanifest">
<meta name="theme-color" content="${brandIcon ? '#0a0a0a' : '#0f2a5c'}">
<link rel="icon" href="${appIcon}">
<link rel="apple-touch-icon" href="${appIcon}">
<meta name="apple-mobile-web-app-capable" content="yes">`);
html = html.replace('</body>', `<script>if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});</script>
</body>`);
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'assets', 'icon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0f2a5c"/><path d="M128 352 L208 256 L272 304 L384 160" fill="none" stroke="#f0a500" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/><circle cx="384" cy="160" r="28" fill="#f0a500"/></svg>`);
writeFileSync(join(out, 'manifest.webmanifest'), JSON.stringify({
  name: appName, short_name: appName.length > 12 ? 'Mentoring' : appName, start_url: './', scope: './', display: 'standalone',
  background_color: brandIcon ? '#0a0a0a' : '#0f2a5c', theme_color: brandIcon ? '#0a0a0a' : '#0f2a5c',
  icons: brandIcon ? [{ src: brandIcon, sizes: '256x256', type: 'image/png', purpose: 'any' }] : [{ src: 'assets/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
}, null, 2));
writeFileSync(join(out, 'sw.js'), `// App shell cache for build ${v}. API calls (other origins) are never cached.
const CACHE = 'mcrm-${v}';
const SHELL = ['./', './index.html', './assets/app.css?v=${v}', './assets/app.js?v=${v}', './assets/presets.js?v=${v}', './${appIcon}'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (e.request.mode === 'navigate' || u.pathname.endsWith('config.js')) { // network first: always the latest shell & config
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
`);

// Apache / cPanel: security headers, no stale app shell, long cache for versioned assets.
writeFileSync(join(out, '.htaccess'), `# Lightech Mentoring App — /alpha
Options -Indexes
AddType application/manifest+json .webmanifest
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set X-Frame-Options "SAMEORIGIN"
  Header always set Permissions-Policy "camera=(), microphone=(), geolocation=()"
  <FilesMatch "\\.(html|htm)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
  <FilesMatch "\\.(css|js)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  # last match wins: shell files that must never be stale
  <FilesMatch "(config\\.js|sw\\.js|manifest\\.webmanifest)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
</IfModule>
`);
writeFileSync(join(out, 'VERSION.txt'), `Lightech Mentoring App\nbuild ${v}\nbuilt ${new Date().toISOString()}\napiUrl ${api ? 'set' : 'EMPTY — edit assets/config.js'}\ndefaultTenant ${tenant || '(none)'}\n`);

const zip = join(root, 'dist', 'lightech-alpha.zip');
rmSync(zip, { force: true });
execFileSync('python3', ['-c', `import shutil; shutil.make_archive(${JSON.stringify(zip.replace(/\.zip$/, ''))}, 'zip', ${JSON.stringify(out)})`]);
console.log(`dist/alpha built (assets v=${v}, apiUrl ${api ? 'set' : 'empty'}) → ${zip}`);

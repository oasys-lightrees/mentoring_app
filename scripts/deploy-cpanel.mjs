// One-command deploy of dist/lightech-alpha.zip to a cPanel host (e.g. lightech.co.id/alpha).
//   CPANEL_HOST=lightech.co.id CPANEL_USER=xxx CPANEL_TOKEN=xxx node scripts/deploy-cpanel.mjs [--dry-run]
// Steps: build check → rename public_html/alpha to alpha_backup_<stamp> → create alpha → upload zip → extract → delete zip → verify.
// Rollback: in File Manager rename alpha → alpha_failed and alpha_backup_<stamp> → alpha.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = join(root, 'dist', 'lightech-alpha.zip');
const { CPANEL_HOST, CPANEL_USER, CPANEL_TOKEN } = process.env;
const DIR = process.env.CPANEL_DIR || 'public_html/alpha';
const SITE = process.env.SITE_URL || `https://${CPANEL_HOST}/alpha/`;
const dry = process.argv.includes('--dry-run');

if (!CPANEL_HOST || !CPANEL_USER || !CPANEL_TOKEN) { console.error('Set CPANEL_HOST, CPANEL_USER and CPANEL_TOKEN (cPanel → Security → Manage API Tokens).'); process.exit(1); }
if (!existsSync(zipPath)) { console.error('Run `node scripts/build-deploy.mjs` first.'); process.exit(1); }

const base = `https://${CPANEL_HOST}:2083`;
const auth = { Authorization: `cpanel ${CPANEL_USER}:${CPANEL_TOKEN}` };
const parent = DIR.split('/').slice(0, -1).join('/');
const name = DIR.split('/').pop();
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);

async function api2(func, params) {
  const q = new URLSearchParams(Object.assign({ cpanel_jsonapi_user: CPANEL_USER, cpanel_jsonapi_apiversion: '2', cpanel_jsonapi_module: 'Fileman', cpanel_jsonapi_func: func }, params));
  if (dry) { console.log('[dry-run] API2', func, params); return {}; }
  const r = await fetch(`${base}/json-api/cpanel?${q}`, { headers: auth });
  const j = await r.json();
  const res = j.cpanelresult || {};
  if (res.error || (res.data && res.data[0] && res.data[0].result === 0)) throw new Error(`${func} failed: ${res.error || JSON.stringify(res.data)}`);
  return res;
}
async function upload() {
  if (dry) { console.log('[dry-run] upload', zipPath, '→', DIR); return; }
  const fd = new FormData();
  fd.append('dir', DIR);
  fd.append('overwrite', '1');
  fd.append('file-1', new Blob([readFileSync(zipPath)]), 'lightech-alpha.zip');
  const r = await fetch(`${base}/execute/Fileman/upload_files`, { method: 'POST', headers: auth, body: fd });
  const j = await r.json();
  if (!j.status) throw new Error('upload failed: ' + JSON.stringify(j.errors || j));
}

console.log(`Deploying ${zipPath} → ${CPANEL_HOST}:${DIR}${dry ? ' (dry run)' : ''}`);
try { await api2('fileop', { op: 'rename', sourcefiles: DIR, destfiles: `${DIR}_backup_${stamp}` }); console.log(`1/5 backup: ${DIR}_backup_${stamp}`); }
catch (e) { console.log('1/5 no existing folder to back up (' + e.message.slice(0, 80) + ')'); }
await api2('mkdir', { path: parent, name }); console.log('2/5 folder created');
await upload(); console.log('3/5 uploaded');
await api2('fileop', { op: 'extract', sourcefiles: `${DIR}/lightech-alpha.zip`, destfiles: DIR }); console.log('4/5 extracted');
await api2('fileop', { op: 'unlink', sourcefiles: `${DIR}/lightech-alpha.zip` }); console.log('5/5 zip removed');
if (!dry) {
  const html = await (await fetch(SITE, { cache: 'no-store' })).text();
  const ok = html.includes('assets/app.js?v=');
  console.log(ok ? `✓ live: ${SITE}` : `⚠ ${SITE} did not return the new app shell. Check File Manager; rollback steps are at the top of this file.`);
  if (!ok) process.exit(1);
}

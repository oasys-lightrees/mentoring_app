/**
 * Lightrees Mentoring CRM — Server API (Google Apps Script + Google Sheets)
 * -------------------------------------------------------------------------
 * Server-side sign-in, per-company (tenant) data isolation and an audit trail
 * for the white-label CRM hosted at lightech.co.id/alpha.
 *
 * Storage: one Google Sheet with tabs
 *   docs  : path | parent | json | updatedAt (ms) | updatedBy     (one row per record; deletes keep a tombstone)
 *   audit : time | actor | company | action | path | detail        (append-only change log)
 *
 * Request  : POST text/plain JSON { action, token?, ... }
 * Response : JSON { ok: true, ... } | { ok: false, error: 'auth' | 'forbidden' | 'locked' | 'suspended' | 'invalid' | 'not_found', message }
 *
 * === DEPLOY (10 minutes) ===
 * 1. Create a new Google Sheet (e.g. "Lightech Mentoring CRM — Data").
 * 2. Extensions → Apps Script → replace Code.gs with this file → Save.
 * 3. Run `setup` once and approve the permissions.
 *    The execution log prints the Lightech Super Admin email and a one-time password. Store it in your password manager.
 * 4. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → Deploy.
 * 5. Copy the "/exec" URL into assets/config.js (apiUrl) of the /alpha site.
 */

const SHEET_ID = '';                 // leave empty when the script is created from the Sheet (Extensions → Apps Script)
const ADMIN_EMAIL = 'super@lightech.co.id';
const SESSION_HOURS = 6;              // token lifetime (CacheService max is 6 h)
const MAX_FAILED_LOGINS = 5;          // per email, then locked for LOCK_MINUTES
const LOCK_MINUTES = 15;
const VERSION = '1.0.0';

// ───────────────────────────────────────────────────────── entry points
function doPost(e) {
  let req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return out_(handle_(req));
  } catch (err) {
    return out_({ ok: false, error: 'server', message: String(err && err.message || err) });
  }
}
function doGet() { return out_({ ok: true, service: 'lightrees-mentoring-crm', version: VERSION }); }

function handle_(req) {
  const a = String(req.action || '');
  if (a === 'ping') return { ok: true, version: VERSION };
  if (a === 'brand') return brand_(req);
  if (a === 'login') return login_(req);
  const sess = session_(req.token);
  if (!sess) return { ok: false, error: 'auth', message: 'Session expired. Please sign in again.' };
  switch (a) {
    case 'whoami': return { ok: true, session: publicSession_(sess) };
    case 'logout': cache_().remove('tok:' + req.token); return { ok: true };
    case 'list': return list_(sess, req.collection);
    case 'get': return get_(sess, req.path);
    case 'batch': return batch_(sess, req.ops || []);
    case 'changes': return changes_(sess, Number(req.since) || 0);
    case 'audit': return auditList_(sess, Number(req.limit) || 200);
  }
  return { ok: false, error: 'invalid', message: 'Unknown action' };
}

// ───────────────────────────────────────────────────────── one-time setup
function setup() {
  const ss = book_();
  ['docs', 'audit'].forEach(function (name) { if (!ss.getSheetByName(name)) ss.insertSheet(name); });
  const docs = ss.getSheetByName('docs');
  if (docs.getLastRow() === 0) docs.appendRow(['path', 'parent', 'json', 'updatedAt', 'updatedBy']);
  const audit = ss.getSheetByName('audit');
  if (audit.getLastRow() === 0) audit.appendRow(['time', 'actor', 'company', 'action', 'path', 'detail']);
  const store = load_();
  if (!store.byPath['platform/main'] || store.byPath['platform/main'].deleted) {
    const pw = randomPassword_();
    const admin = { id: 'lt-owner', name: 'Lightech Super Admin', email: ADMIN_EMAIL, role: 'owner', active: true };
    setPassword_(admin, pw);
    writeDocs_(store, [{ op: 'set', path: 'platform/main', data: { name: 'Lightech', admins: [admin] } }], 'setup');
    audit_('setup', '', 'setup', 'platform/main', 'Created Lightech Super Admin ' + ADMIN_EMAIL);
    Logger.log('Lightech Super Admin: ' + ADMIN_EMAIL + '  one-time password: ' + pw + '  (change it after first sign-in)');
  } else {
    Logger.log('Already set up. Nothing changed.');
  }
}

// ───────────────────────────────────────────────────────── auth
function login_(req) {
  const email = String(req.email || '').trim().toLowerCase();
  const pw = String(req.password || '');
  const slug = String(req.slug || '').trim().toLowerCase();
  if (!email || !pw) return { ok: false, error: 'invalid', message: 'Email and password are required.' };
  const c = cache_();
  const fails = Number(c.get('fail:' + email) || 0);
  if (fails >= MAX_FAILED_LOGINS) return { ok: false, error: 'locked', message: 'Too many failed attempts. Try again in ' + LOCK_MINUTES + ' minutes.' };
  const store = load_();
  let sess = null, suspended = false;
  if (!slug) {
    const plat = data_(store, 'platform/main') || { admins: [] };
    const adm = (plat.admins || []).filter(function (x) { return (x.email || '').toLowerCase() === email && x.active !== false; })[0];
    if (adm && checkPassword_(adm, pw)) sess = { kind: 'platform', adminId: adm.id, role: adm.role, name: adm.name, email: adm.email };
  }
  if (!sess) {
    const metas = metas_(store);
    for (let i = 0; i < metas.length && !sess; i++) {
      const w = metas[i];
      if (slug && slugOf_(w) !== slug) continue;
      const acc = (w.data.accounts || []).filter(function (x) { return (x.email || '').toLowerCase() === email && x.active !== false; })[0];
      if (acc && checkPassword_(acc, pw)) {
        if (w.data.status === 'suspended') { suspended = true; continue; }
        sess = { kind: 'tenant', wsId: w.id, accountId: acc.id, role: acc.role, name: acc.name, email: acc.email };
      }
    }
  }
  if (!sess) {
    if (suspended) return { ok: false, error: 'suspended', message: 'This workspace is inactive. Contact your administrator.' };
    c.put('fail:' + email, String(fails + 1), LOCK_MINUTES * 60);
    audit_(email, slug, 'login_failed', '', 'attempt ' + (fails + 1));
    return { ok: false, error: 'invalid', message: 'Wrong email or password.' };
  }
  c.remove('fail:' + email);
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  sess.exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  c.put('tok:' + token, JSON.stringify(sess), SESSION_HOURS * 3600);
  audit_(sess.email, sess.wsId || 'lightech', 'login', '', sess.kind + ' · ' + sess.role);
  return { ok: true, token: token, session: publicSession_(sess) };
}

function session_(token) {
  if (!token) return null;
  const raw = cache_().get('tok:' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (s.exp && s.exp < Date.now()) return null;
  // Re-check that the account is still active and the company not suspended.
  const store = load_();
  if (s.kind === 'platform') {
    const plat = data_(store, 'platform/main') || { admins: [] };
    const adm = (plat.admins || []).filter(function (x) { return x.id === s.adminId && x.active !== false; })[0];
    if (!adm) return null;
    s.role = adm.role;
  } else {
    const meta = data_(store, 'ws/' + s.wsId);
    if (!meta || meta.status === 'suspended') return null;
    const acc = (meta.accounts || []).filter(function (x) { return x.id === s.accountId && x.active !== false; })[0];
    if (!acc) return null;
    s.role = acc.role;
  }
  s.store = store;
  return s;
}
const publicSession_ = function (s) { return { kind: s.kind, wsId: s.wsId || '', accountId: s.accountId || '', adminId: s.adminId || '', role: s.role, name: s.name, email: s.email }; };

// Public branding for a company's own sign-in page (no other company, no password hashes).
function brand_(req) {
  const slug = String(req.slug || '').trim().toLowerCase();
  const w = metas_(load_()).filter(function (m) { return slugOf_(m) === slug; })[0];
  if (!w) return { ok: false, error: 'not_found', message: 'Unknown company code.' };
  const c = w.data.config || {};
  const byRole = {};
  if (c.demoLogin) (w.data.accounts || []).forEach(function (a) { if (a.active !== false && !byRole[a.role]) byRole[a.role] = { id: a.id, name: a.name, role: a.role, email: a.email }; });
  return {
    ok: true, id: w.id, slug: slugOf_(w), status: w.data.status || 'active', name: w.data.name,
    config: { brandName: c.brandName, tagline: c.tagline, accent: c.accent, labels: c.labels, demoLogin: !!c.demoLogin, stages: [], sessionTypes: [], sources: [], lostReasons: [] },
    chips: Object.keys(byRole).map(function (k) { return byRole[k]; })
  };
}

// ───────────────────────────────────────────────────────── authorization
function canRead_(s, path) {
  if (s.kind === 'platform') return true;
  const base = 'ws/' + s.wsId;
  return path === base || path.indexOf(base + '/') === 0;
}
function canWrite_(s, op, path) {
  if (s.kind === 'platform') return true;
  if (!canRead_(s, path)) return false;
  const base = 'ws/' + s.wsId;
  const admin = s.role === 'superadmin' || s.role === 'admin';
  if (path === base) return admin && op === 'set';               // company config & accounts: owner/admin only, never delete the company
  if (op === 'del') return admin || path.indexOf(base + '/sessions/') === 0 && s.role !== 'client';
  if (s.role === 'client') return path.indexOf(base + '/sessions/') === 0; // clients only tick their own action items
  return true;
}

// ───────────────────────────────────────────────────────── data actions
function list_(s, collection) {
  collection = String(collection || '');
  const store = s.store;
  const rows = store.rows.filter(function (r) { return r.parent === collection && !r.deleted && canRead_(s, r.path); });
  return { ok: true, now: Date.now(), docs: rows.map(function (r) { return { id: r.path.split('/').pop(), data: redact_(s, r.path, JSON.parse(r.json)) }; }) };
}
function get_(s, path) {
  path = String(path || '');
  if (!canRead_(s, path)) return { ok: false, error: 'forbidden', message: 'No access.' };
  const d = data_(s.store, path);
  return { ok: true, exists: !!d, data: d ? redact_(s, path, d) : null };
}
function batch_(s, ops) {
  if (!Array.isArray(ops) || ops.length > 500) return { ok: false, error: 'invalid', message: 'Send 1–500 operations.' };
  for (let i = 0; i < ops.length; i++) {
    const o = ops[i];
    if (!o || !/^[A-Za-z0-9_\-.~:@+]+(\/[A-Za-z0-9_\-.~:@+]+)+$/.test(o.path || '') || (o.op !== 'set' && o.op !== 'del')) return { ok: false, error: 'invalid', message: 'Bad operation at #' + i };
    if (!canWrite_(s, o.op, o.path)) return { ok: false, error: 'forbidden', message: 'No permission to change ' + o.path };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const store = load_(); // re-read inside the lock
    const actor = s.email + (s.kind === 'platform' ? ' (Lightech)' : '');
    const merged = ops.map(function (o) {
      if (o.op !== 'set') return o;
      const d = keepSecrets_(store, o.path, o.data);
      if (s.kind !== 'platform' && /^ws\/[^/]+$/.test(o.path)) { // login code & status are governed by Lightech only
        const old = data_(store, o.path) || {};
        d.slug = old.slug; d.status = old.status || 'active';
      }
      return { op: 'set', path: o.path, data: d };
    });
    const ts = writeDocs_(store, merged, actor);
    ops.forEach(function (o) { audit_(actor, companyOf_(o.path), o.op === 'del' ? 'delete' : 'save', o.path, summary_(o)); });
    return { ok: true, now: ts };
  } finally { lock.releaseLock(); }
}
function changes_(s, since) {
  const rows = s.store.rows.filter(function (r) { return r.updatedAt > since && canRead_(s, r.path); });
  return {
    ok: true, now: Date.now(),
    docs: rows.map(function (r) { return r.deleted ? { path: r.path, deleted: true } : { path: r.path, data: redact_(s, r.path, JSON.parse(r.json)) }; })
  };
}
function auditList_(s, limit) {
  if (s.kind !== 'platform' && s.role !== 'superadmin' && s.role !== 'admin') return { ok: false, error: 'forbidden', message: 'No access.' };
  const sh = book_().getSheetByName('audit');
  const n = sh.getLastRow();
  if (n < 2) return { ok: true, rows: [] };
  const start = Math.max(2, n - Math.min(limit, 1000) * 4 + 1);
  const vals = sh.getRange(start, 1, n - start + 1, 6).getValues().reverse();
  const out = [];
  for (let i = 0; i < vals.length && out.length < limit; i++) {
    const v = vals[i];
    if (s.kind !== 'platform' && v[2] !== s.wsId) continue;
    out.push({ time: v[0] instanceof Date ? v[0].toISOString() : String(v[0]), actor: v[1], company: v[2], action: v[3], path: v[4], detail: v[5] });
  }
  return { ok: true, rows: out };
}

// Password hashes never leave the server; incoming records without a hash keep the stored one.
function redact_(s, path, d) {
  if (path === 'platform/main' || /^ws\/[^/]+$/.test(path)) {
    const key = path === 'platform/main' ? 'admins' : 'accounts';
    d = JSON.parse(JSON.stringify(d));
    (d[key] || []).forEach(function (a) { a.defaultPw = !!a.pw && checkPassword_(a, 'demo'); delete a.pw; delete a.salt; });
  }
  return d;
}
function keepSecrets_(store, path, d) {
  if (!(path === 'platform/main' || /^ws\/[^/]+$/.test(path))) return d;
  const key = path === 'platform/main' ? 'admins' : 'accounts';
  const old = data_(store, path) || {};
  const byId = {};
  (old[key] || []).forEach(function (a) { byId[a.id] = a; });
  d = JSON.parse(JSON.stringify(d));
  (d[key] || []).forEach(function (a) {
    delete a.defaultPw;
    if (!a.pw && byId[a.id]) { a.pw = byId[a.id].pw; a.salt = byId[a.id].salt; }
  });
  return d;
}

// ───────────────────────────────────────────────────────── storage helpers
function book_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }
function load_() {
  const sh = book_().getSheetByName('docs');
  const n = sh ? sh.getLastRow() : 0;
  const vals = n > 1 ? sh.getRange(2, 1, n - 1, 5).getValues() : [];
  const rows = [], byPath = {};
  vals.forEach(function (v, i) {
    const r = { row: i + 2, path: String(v[0]), parent: String(v[1]), json: String(v[2] || ''), updatedAt: Number(v[3]) || 0, updatedBy: String(v[4] || '') };
    r.deleted = !r.json;
    rows.push(r); byPath[r.path] = r;
  });
  return { sheet: sh, rows: rows, byPath: byPath };
}
function data_(store, path) { const r = store.byPath[path]; return r && !r.deleted ? JSON.parse(r.json) : null; }
function metas_(store) { return store.rows.filter(function (r) { return r.parent === 'ws' && !r.deleted; }).map(function (r) { return { id: r.path.split('/')[1], data: JSON.parse(r.json) }; }); }
function slugOf_(w) { return String(w.data.slug || w.data.preset || w.data.name || '').toLowerCase(); }
function companyOf_(path) { const p = path.split('/'); return p[0] === 'ws' ? p[1] : 'lightech'; }
function summary_(o) { if (o.op === 'del') return ''; const d = o.data || {}; return String(d.name || d.leadId || '').slice(0, 80); }
function writeDocs_(store, ops, actor) {
  let ts = Date.now();
  const updates = [], appends = [];
  ops.forEach(function (o) {
    ts += 1; // strictly increasing so polling never misses a write in the same millisecond
    const parent = o.path.split('/').slice(0, -1).join('/');
    const json = o.op === 'set' ? JSON.stringify(o.data) : '';
    const row = [o.path, parent, json, ts, actor];
    const ex = store.byPath[o.path];
    if (ex) { ex.json = json; ex.deleted = !json; ex.updatedAt = ts; updates.push({ row: ex.row, vals: row }); }
    else if (json) { const r = { row: 0, path: o.path, parent: parent, json: json, updatedAt: ts, deleted: false }; store.rows.push(r); store.byPath[o.path] = r; appends.push({ r: r, vals: row }); }
  });
  updates.forEach(function (u) { store.sheet.getRange(u.row, 1, 1, 5).setValues([u.vals]); });
  if (appends.length) {
    const start = store.sheet.getLastRow() + 1;
    store.sheet.getRange(start, 1, appends.length, 5).setValues(appends.map(function (a) { return a.vals; }));
    appends.forEach(function (a, i) { a.r.row = start + i; });
  }
  return ts;
}
function audit_(actor, company, action, path, detail) {
  const sh = book_().getSheetByName('audit');
  if (sh) sh.appendRow([new Date(), actor, company, action, path, detail || '']);
}

// ───────────────────────────────────────────────────────── crypto & misc
function sha256Hex_(s) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
function checkPassword_(acc, pw) { return !!acc.pw && acc.pw === sha256Hex_((acc.salt || '') + ':' + pw); }
function setPassword_(acc, pw) { acc.salt = Utilities.getUuid().replace(/-/g, '').slice(0, 10); acc.pw = sha256Hex_(acc.salt + ':' + pw); }
function randomPassword_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function cache_() { return CacheService.getScriptCache(); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

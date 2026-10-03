/**
 * Lightech Mentoring App — Server API (Google Apps Script + Google Sheets)
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
 * 1. Create a new Google Sheet (e.g. "Lightech Mentoring App — Data").
 * 2. Extensions → Apps Script → replace Code.gs with this file → Save.
 * 3. Run `setup` once and approve the permissions.
 *    The execution log prints the Lightech Super Admin email and a one-time password. Store it in your password manager.
 *    Then run `setupAlphaLeaders` once: it creates the AlphaLeaders company and prints its Owner's one-time password.
 * 4. Deploy → New deployment → Web app → Execute as: Me · Who has access: Anyone → Deploy.
 * 5. Copy the "/exec" URL into assets/config.js (apiUrl) of the /alpha site.
 */

const SHEET_ID = '';                 // leave empty when the script is created from the Sheet (Extensions → Apps Script)
const ADMIN_EMAIL = 'super@lightech.co.id';
const SESSION_HOURS = 6;              // token lifetime (CacheService max is 6 h)
const MAX_FAILED_LOGINS = 5;          // per email, then locked for LOCK_MINUTES
const LOCK_MINUTES = 15;
const VERSION = '1.2.0';
const APP_TITLE = 'AlphaLeaders · Lightech Mentoring App';
const DEFAULT_TENANT = 'alphaleaders'; // company whose sign-in the bare link opens; Lightech staff add #lightech

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
// GET <web app url>            → the app itself (served by this script: no separate hosting needed)
// GET <web app url>?health=1   → JSON health check
// GET <web app url>?form=<code>&src=<campaign> → that company's public lead form
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.health !== undefined) return out_({ ok: true, service: 'lightech-mentoring-app', version: VERSION });
  const url = ScriptApp.getService().getUrl();
  const clip = function (v) { return String(v || '').replace(/[^A-Za-z0-9 _.\-]/g, '').slice(0, 60); };
  const cfg = { apiUrl: url, publicUrl: url, defaultTenant: DEFAULT_TENANT, assetBase: ASSET_BASE, params: { form: clip(p.form), src: clip(p.src) } };
  const html = APP_SHELL.split('__ASSETS__').join(ASSET_BASE).replace('__CONFIG__', JSON.stringify(cfg).replace(/</g, '\\u003c'));
  return HtmlService.createHtmlOutput(html)
    .setTitle(APP_TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl(ASSET_BASE + 'assets/brands/alphaleaders-icon.png')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL); // lets lightech.co.id/alpha embed it later
}

function handle_(req) {
  const a = String(req.action || '');
  const t0 = Date.now() - 5000; // overlap window: rows written while we read are re-sent next poll (clients de-duplicate)
  if (a === 'ping') return { ok: true, version: VERSION };
  if (a === 'brand') return brand_(req);
  if (a === 'login') return login_(req);
  if (a === 'capture') return capture_(req);
  const sess = session_(req.token);
  if (!sess) return { ok: false, error: 'auth', message: 'Session expired. Please sign in again.' };
  switch (a) {
    case 'whoami': return { ok: true, session: publicSession_(sess) };
    case 'password': return changePassword_(sess, req);
    case 'logout': cache_().remove('tok:' + req.token); return { ok: true };
    case 'list': return list_(sess, req.collection, t0);
    case 'get': return get_(sess, req.path);
    case 'batch': return batch_(sess, req.ops || []);
    case 'changes': return changes_(sess, Number(req.since) || 0, t0);
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
    Logger.log('Lightech Super Admin already exists.');
  }
}

// Creates the AlphaLeaders company (brand, funnel, programs, Owner account) once. Safe to run again.
// The whole AlphaLeaders team; each gets a one-time password and must choose their own at first sign-in.
// Emails can be changed by the Owner in Team & Access.
const FIRST_COMPANY = {
  slug: 'alphaleaders',
  team: [
    { id: 'u-owner', name: 'Coach Ferly F Raya', email: 'ferly@alphaleaders.id', role: 'superadmin', coach: true },
    { id: 'u-ferry', name: 'Ferry Davira', email: 'ferry@alphaleaders.id', role: 'superadmin', coach: true },
    { id: 'u-lisa', name: 'Tami', email: 'tami@alphaleaders.id', role: 'admin' },
    { id: 'u-anita', name: 'Anita', email: 'anita@alphaleaders.id', role: 'admin' },
    { id: 'm-hendra', name: 'Josshhua Abraham', email: 'josshhua@alphaleaders.id', role: 'mentor' },
    { id: 'm-sylvia', name: 'Anthony Sihombing', email: 'anthony@alphaleaders.id', role: 'mentor' },
    { id: 'm-alvin', name: 'Wulansari Suharto', email: 'wulansari@alphaleaders.id', role: 'mentor' },
    { id: 'm-charles', name: 'Charles Suryana', email: 'charles@alphaleaders.id', role: 'mentor' },
    { id: 'm-malvin', name: 'Malvin Haryanto', email: 'malvin@alphaleaders.id', role: 'mentor' },
    { id: 'm-rizki', name: 'Rizki Esa', email: 'rizki@alphaleaders.id', role: 'mentor' },
    { id: 'b-rina', name: 'Julia', email: 'julia@alphaleaders.id', role: 'bd' },
    { id: 'b-fajar', name: 'Paul', email: 'paul@alphaleaders.id', role: 'bd' }
  ]
};
function setupAlphaLeaders() {
  const store = load_();
  if (metas_(store).some(function (m) { return slugOf_(m) === FIRST_COMPANY.slug; })) { Logger.log('AlphaLeaders already exists. Nothing changed.'); return; }
  const owners = FIRST_COMPANY.team.map(function (o) {
    const a = { id: o.id, name: o.name, email: o.email, role: o.role, active: true, mustChange: true };
    if (o.coach) a.coach = true;
    a.oneTime = randomPassword_(); setPassword_(a, a.oneTime);
    return a;
  });
  const log = owners.map(function (a) { const line = 'AlphaLeaders ' + a.role + ' · ' + a.name + ': ' + a.email + '  one-time password: ' + a.oneTime; delete a.oneTime; return line; });
  const id = 'ws-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12);
  const meta = {
    name: 'AlphaLeaders', slug: FIRST_COMPANY.slug, status: 'active', preset: 'alphaleaders', createdAt: new Date().toISOString(), v: 3,
    config: {
      brandName: 'AlphaLeaders', tagline: 'Coaching CRM · Lead to Deal', accent: '#1c1c1c', currency: 'IDR', demoLogin: false, publicForm: false,
      logo: 'assets/brands/alphaleaders-logo.png', mark: 'assets/brands/alphaleaders-mark.png', bar: '#0a0a0a', bar2: '#1d1d1d', gold: '#d4a537',
      labels: { lead: 'Lead', leads: 'Leads', client: 'Client', clients: 'Clients', mentor: 'Coach', mentors: 'Coaches', session: 'Session', sessions: 'Sessions', program: 'Program', programs: 'Programs', owner: 'BD / Sales' },
      stages: [
        { id: 'new', name: 'New Lead', color: '#64748b', prob: 5, sla: 2, type: 'open' },
        { id: 'cov', name: 'COV Call (15m)', color: '#0284c7', prob: 15, sla: 3, type: 'open' },
        { id: 'abm', name: 'ABM Mapping (2–3h)', color: '#d97706', prob: 40, sla: 7, type: 'open' },
        { id: 'abe', name: 'ABE Closing (2h)', color: '#7c3aed', prob: 70, sla: 7, type: 'open' },
        { id: 'won', name: 'Deal Won', color: '#16a34a', prob: 100, sla: 0, type: 'won' },
        { id: 'lost', name: 'Lost', color: '#dc2626', prob: 0, sla: 0, type: 'lost' }
      ],
      sessionTypes: [
        { id: 'st-cov', name: 'COV Call', duration: 15, color: '#0284c7', stageId: 'cov' },
        { id: 'st-abm', name: 'ABM Assessment & Mapping', duration: 150, color: '#d97706', stageId: 'abm' },
        { id: 'st-abe', name: 'ABE Proposal & Closing', duration: 120, color: '#7c3aed', stageId: 'abe' },
        { id: 'st-coach', name: 'Coaching Session', duration: 120, color: '#16a34a', stageId: '' },
        { id: 'st-review', name: 'Review / Induction', duration: 60, color: '#0f766e', stageId: '' }
      ],
      sources: ['Meta Ads', 'Google Ads', 'Referral', 'Organic / Social', 'Event / Seminar', 'BD Relation', 'Walk-in', 'Website form'],
      lostReasons: ['Budget not ready', 'Timing not right', 'Chose a competitor', 'Unresponsive', 'Not qualified'],
      waTemplate: 'Hi {name}, a quick reminder of your {type} with {mentor} on {date} at {time} WIB. See you there! — {brand}',
      commission: { rate: 10, target: 0, bonus: 0 }
    },
    accounts: owners,
    programs: [
      { id: 'p-private', name: '1-Year Private Coaching', format: 'Private', price: 120000000, sessions: 24, months: 12 },
      { id: 'p-group', name: '1-Year Group Mastermind', format: 'Group', price: 36000000, sessions: 24, months: 12 },
      { id: 'p-abm', name: 'Business Mapping (ABM only)', format: 'Private', price: 7500000, sessions: 1, months: 1 }
    ]
  };
  writeDocs_(store, [{ op: 'set', path: 'ws/' + id, data: meta }], 'setup');
  audit_('setup', id, 'save', 'ws/' + id, 'Created AlphaLeaders with Owners ' + owners.map(function (a) { return a.email; }).join(', '));
  log.forEach(function (l) { Logger.log(l); });
  Logger.log('Send each person their own line privately. Everyone chooses a new password at first sign-in.');
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
    config: { brandName: c.brandName, tagline: c.tagline, accent: c.accent, logo: c.logo || '', mark: c.mark || '', bar: c.bar || '', bar2: c.bar2 || '', gold: c.gold || '', labels: c.labels, demoLogin: !!c.demoLogin, publicForm: !!c.publicForm, stages: [], sessionTypes: [], sources: [], lostReasons: [] },
    programs: c.publicForm ? (w.data.programs || []).map(function (p) { return { id: p.id, name: p.name }; }) : [],
    chips: Object.keys(byRole).map(function (k) { return byRole[k]; })
  };
}

// ───────────────────────────────────────────────────────── public lead form
// Anyone can submit; only to a company that switched its form on. Spam guards: honeypot field, per-company and
// per-phone rate limits, field length caps. New leads are assigned round-robin to the BD with the fewest open leads.
const CAPTURE_PER_10_MIN = 30;
function capture_(req) {
  if (req.website) return { ok: true }; // honeypot filled in: a bot. Pretend success, store nothing.
  const slug = String(req.slug || '').trim().toLowerCase();
  const clip = function (v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); };
  const name = clip(req.name, 80), phone = clip(req.phone, 20).replace(/[^\d+]/g, '');
  if (!name || phone.replace(/\D/g, '').length < 8) return { ok: false, error: 'invalid', message: 'Name and a valid WhatsApp number are required.' };
  const c = cache_();
  const n = Number(c.get('cap:' + slug) || 0);
  if (n >= CAPTURE_PER_10_MIN) return { ok: false, error: 'busy', message: 'Too many submissions. Please try again later.' };
  c.put('cap:' + slug, String(n + 1), 600);
  const digits = phone.replace(/\D/g, '').replace(/^0/, '62');
  if (c.get('capp:' + slug + ':' + digits)) return { ok: true, duplicate: true }; // double-click / resubmit
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const store = load_();
    const w = metas_(store).filter(function (m) { return slugOf_(m) === slug; })[0];
    if (!w || w.data.status === 'suspended' || !(w.data.config || {}).publicForm) return { ok: false, error: 'closed', message: 'This form is not available.' };
    const cfg = w.data.config, base = 'ws/' + w.id;
    const leads = store.rows.filter(function (r) { return !r.deleted && r.parent === base + '/leads'; }).map(function (r) { return JSON.parse(r.json); });
    const norm = function (x) { return String(x || '').replace(/\D/g, '').replace(/^0/, '62'); };
    if (leads.some(function (l) { return norm(l.phone) === digits; })) { audit_('web form', w.id, 'capture_duplicate', '', name); return { ok: true, duplicate: true }; }
    const stages = cfg.stages || [];
    const first = stages.filter(function (x) { return x.type === 'open'; })[0] || stages[0] || { id: 'new' };
    const openIds = {}; stages.forEach(function (x) { if (x.type === 'open') openIds[x.id] = 1; });
    const owner = pickOwner_(w.data.accounts || [], leads, openIds);
    const prog = (w.data.programs || []).filter(function (p) { return p.id === req.programId; })[0];
    // Campaign source from the link (&src=): matched to a known source, else kept as typed (cleaned), else "Website form".
    const rawSrc = clip(req.source, 40).replace(/[^A-Za-z0-9 _.\-\/&]/g, '');
    const src = (cfg.sources || []).filter(function (x) { return x.toLowerCase() === rawSrc.toLowerCase(); })[0] || rawSrc || 'Website form';
    const now = new Date(), iso = now.toISOString();
    const lead = {
      id: 'L' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), name: name, phone: phone, email: clip(req.email, 120), company: clip(req.company, 120),
      source: src, ownerId: owner, programId: prog ? prog.id : '', value: prog ? Number(prog.price) || 0 : 0, stageId: first.id,
      nextAction: 'WhatsApp follow-up (web form)', nextActionDate: Utilities.formatDate(now, 'Asia/Jakarta', 'yyyy-MM-dd'),
      notes: clip(req.message, 1000), createdAt: iso, updatedAt: iso, createdBy: 'web-form',
      history: [{ at: iso, from: null, to: first.id, note: 'Web form', by: 'web-form' }]
    };
    writeDocs_(store, [{ op: 'set', path: base + '/leads/' + lead.id, data: lead }], 'web form');
    audit_('web form', w.id, 'capture', base + '/leads/' + lead.id, name + ' → ' + owner);
    c.put('capp:' + slug + ':' + digits, '1', 600);
    return { ok: true };
  } finally { lock.releaseLock(); }
}
// Round-robin by workload: the active BD with the fewest open leads; falls back to the Owner.
function pickOwner_(accounts, leads, openIds) {
  const bds = accounts.filter(function (a) { return a.role === 'bd' && a.active !== false; });
  const pool = bds.length ? bds : accounts.filter(function (a) { return a.role === 'superadmin' && a.active !== false; });
  if (!pool.length) return '';
  const load = {}; pool.forEach(function (a) { load[a.id] = 0; });
  leads.forEach(function (l) { if (openIds[l.stageId] && load[l.ownerId] != null) load[l.ownerId]++; });
  return pool.slice().sort(function (a, b) { return load[a.id] - load[b.id]; })[0].id;
}

// ───────────────────────────────────────────────────────── authorization
// Least privilege: every record is either fully visible, visible as numbers only (leaderboard / funnel), or hidden.
const FULL_ROLES_ = ['superadmin', 'admin', 'senior'];
function inCompany_(s, path) {
  if (s.kind === 'platform') return true;
  const base = 'ws/' + s.wsId;
  return path === base || path.indexOf(base + '/') === 0;
}
// Per-request visibility for limited roles (bd, mentor, assistant, client). null = sees everything in the company.
function scope_(s) {
  if (s.kind === 'platform' || FULL_ROLES_.indexOf(s.role) >= 0) return null;
  if (s._scope) return s._scope;
  const base = 'ws/' + s.wsId;
  const meta = data_(s.store, base) || {};
  const me = (meta.accounts || []).filter(function (a) { return a.id === s.accountId; })[0] || {};
  const leads = {}, sessions = {}, clients = {};
  s.store.rows.forEach(function (r) {
    if (r.deleted) return;
    if (r.parent === base + '/leads') leads[r.path] = JSON.parse(r.json);
    else if (r.parent === base + '/sessions') sessions[r.path] = JSON.parse(r.json);
    else if (r.parent === base + '/clients') clients[r.path] = JSON.parse(r.json);
  });
  const sc = { full: {}, numbers: {}, me: me };
  const leadFull = {};
  const each = function (o, fn) { Object.keys(o).forEach(function (k) { fn(k, o[k]); }); };
  if (s.role === 'client') {
    const c = clients[base + '/clients/' + me.clientId];
    if (c) { sc.full[base + '/clients/' + me.clientId] = 1; leadFull[c.leadId] = 1; }
    each(sessions, function (p, x) { if (leadFull[x.leadId]) sc.full[p] = 1; });
    each(leads, function (p, x) { if (leadFull[x.id]) sc.full[p] = 1; });
    return (s._scope = sc);
  }
  if (s.role === 'bd') {
    each(leads, function (p, x) { if (x.ownerId === s.accountId) leadFull[x.id] = 1; });
    each(sessions, function (p, x) { if (leadFull[x.leadId]) sc.full[p] = 1; });
    each(clients, function (p, x) { if (leadFull[x.leadId]) sc.full[p] = 1; });
  } else if (s.role === 'mentor' || s.role === 'assistant') {
    const coach = s.role === 'assistant' ? me.mentorId : s.accountId;
    if (s.role === 'assistant') each(leads, function (p, x) { leadFull[x.id] = 1; }); // assistants manage all leads
    each(sessions, function (p, x) { if (x.mentorId === coach || x.assistantId === s.accountId) { sc.full[p] = 1; leadFull[x.leadId] = 1; } });
    each(clients, function (p, x) { if (x.coachId === coach || x.assistantId === s.accountId) { sc.full[p] = 1; leadFull[x.leadId] = 1; } });
  }
  each(leads, function (p, x) { if (leadFull[x.id]) sc.full[p] = 1; else sc.numbers[p] = 1; });
  return (s._scope = sc);
}
function visibility_(s, path) {
  if (!inCompany_(s, path)) return 'none';
  if (path === 'platform/main') return s.kind === 'platform' ? 'full' : 'none';
  const sc = scope_(s);
  if (!sc || /^ws\/[^/]+$/.test(path)) return 'full';
  if (sc.full[path]) return 'full';
  if (sc.numbers[path]) return 'numbers';
  return 'none';
}
function canRead_(s, path) { return visibility_(s, path) !== 'none'; }
function canWrite_(s, op, path) {
  if (s.kind === 'platform') return op === 'set' || s.role === 'owner' || !/^ws\/[^/]+$/.test(path); // only the Super Admin deletes companies
  if (!inCompany_(s, path)) return false;
  const base = 'ws/' + s.wsId;
  const admin = s.role === 'superadmin' || s.role === 'admin';
  if (path === base) return admin && op === 'set';
  const exists = !!data_(s.store, path);
  if (exists && scope_(s) && visibility_(s, path) !== 'full') return false; // cannot change records you cannot fully see
  if (op === 'del') return admin || (path.indexOf(base + '/sessions/') === 0 && s.role !== 'client' && s.role !== 'bd');
  if (s.role === 'client') return exists && path.indexOf(base + '/sessions/') === 0; // clients only tick action items on their own sessions
  return true;
}

// ───────────────────────────────────────────────────────── data actions
function list_(s, collection, t0) {
  collection = String(collection || '');
  const rows = s.store.rows.filter(function (r) { return r.parent === collection && !r.deleted && canRead_(s, r.path); });
  return { ok: true, now: t0, docs: rows.map(function (r) { return { id: r.path.split('/').pop(), data: redact_(s, r.path, JSON.parse(r.json)) }; }) };
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
    if (o.op === 'set' && (!o.data || typeof o.data !== 'object' || Array.isArray(o.data))) return { ok: false, error: 'invalid', message: 'Missing data at #' + i };
    if (o.path.split('/').length % 2) return { ok: false, error: 'invalid', message: 'Not a record path at #' + i };
    if (!canWrite_(s, o.op, o.path)) return { ok: false, error: 'forbidden', message: 'No permission to change ' + o.path };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const store = load_(); // re-read inside the lock
    const actor = s.email + (s.kind === 'platform' ? ' (Lightech)' : '');
    const merged = ops.map(function (o) {
      if (o.op !== 'set') return o;
      let d = keepSecrets_(store, o.path, o.data);
      const old = data_(store, o.path);
      if (s.kind !== 'platform' && /^ws\/[^/]+$/.test(o.path)) { // login code & status are governed by Lightech only
        d.slug = (old || {}).slug; d.status = (old || {}).status || 'active';
        if (s.role !== 'superadmin') d.accounts = protectAccounts_(old && old.accounts, d.accounts, 'superadmin', s.accountId);
      }
      if (s.kind === 'platform' && o.path === 'platform/main' && s.role !== 'owner' && old) d = selfOnly_(old, d, s.adminId);
      return { op: 'set', path: o.path, data: d };
    });
    const ts = writeDocs_(store, merged, actor);
    auditMany_(ops.map(function (o) { return [new Date(), actor, companyOf_(o.path), o.op === 'del' ? 'delete' : 'save', o.path, summary_(o)]; }));
    return { ok: true, now: ts };
  } finally { lock.releaseLock(); }
}
function changes_(s, since, t0) {
  // Rows that became invisible (deleted or out of scope) are reported as deleted so clients drop them.
  const rows = s.store.rows.filter(function (r) { return r.updatedAt > since && inCompany_(s, r.path); });
  return {
    ok: true, now: t0,
    docs: rows.map(function (r) { return r.deleted || !canRead_(s, r.path) ? { path: r.path, deleted: true } : { path: r.path, data: redact_(s, r.path, JSON.parse(r.json)) }; })
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
    if (s.role === 'client' && s.kind === 'tenant') d[key] = (d[key] || []).map(function (a) { return a.id === s.accountId ? a : { id: a.id, name: a.name, role: a.role, mentorId: a.mentorId || '', active: a.active }; });
    return d;
  }
  if (visibility_(s, path) === 'numbers') { // leaderboard & funnel only: no names, phones, emails or notes
    return { id: d.id, ownerId: d.ownerId, stageId: d.stageId, value: d.value, source: d.source, programId: d.programId,
      createdAt: d.createdAt, updatedAt: d.updatedAt, wonAt: d.wonAt, lostAt: d.lostAt, lostReason: d.lostReason,
      history: (d.history || []).map(function (h) { return { at: h.at, from: h.from, to: h.to }; }), restricted: true };
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
  const demo = !!(d.config && d.config.demoLogin); // practice workspaces with one-click demo sign-in skip the first-sign-in step
  (d[key] || []).forEach(function (a) {
    delete a.defaultPw;
    // Server-owned flag: a password set by someone else must be changed at next sign-in; otherwise keep what is stored.
    if (a.pw && !demo) a.mustChange = true;
    else { delete a.mustChange; if (byId[a.id] && byId[a.id].mustChange) a.mustChange = true; }
    if (!a.pw && byId[a.id]) { a.pw = byId[a.id].pw; a.salt = byId[a.id].salt; }
  });
  return d;
}

// A company admin cannot touch Owner accounts or create new Owners; only the Owner can.
function protectAccounts_(oldList, newList, protectedRole, selfId) {
  oldList = oldList || []; newList = newList || [];
  const oldById = {};
  oldList.forEach(function (a) { oldById[a.id] = a; });
  const out = [];
  newList.forEach(function (a) {
    const prev = oldById[a.id];
    if (prev && prev.role === protectedRole) { out.push(prev); return; }            // owner records stay exactly as they were
    if (a.role === protectedRole) { if (prev) { a.role = prev.role; } else return; } // no promotion to owner
    out.push(a);
  });
  oldList.forEach(function (a) { if (a.role === protectedRole && !out.some(function (x) { return x.id === a.id; })) out.push(a); }); // owners cannot be removed
  return out;
}
// A Lightech Admin (not Super Admin) may only change their own name, email and password.
function selfOnly_(old, d, selfId) {
  const next = JSON.parse(JSON.stringify(old));
  const mine = (d.admins || []).filter(function (a) { return a.id === selfId; })[0];
  next.admins = (next.admins || []).map(function (a) {
    if (a.id !== selfId || !mine) return a;
    const r = JSON.parse(JSON.stringify(a));
    r.name = mine.name; r.email = mine.email;
    if (mine.pw) { r.pw = mine.pw; r.salt = mine.salt; }
    return r;
  });
  return next;
}
function auditMany_(rows) {
  const sh = book_().getSheetByName('audit');
  if (!sh || !rows.length) return;
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 6).setValues(rows);
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
// Any signed-in person changes their own password (old one required); clears the first-sign-in flag.
function changePassword_(s, req) {
  const next = String(req.newPassword || '');
  if (next.length < 8) return { ok: false, error: 'invalid', message: 'Use at least 8 characters.' };
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const store = load_();
    const path = s.kind === 'platform' ? 'platform/main' : 'ws/' + s.wsId;
    const doc = data_(store, path);
    const key = s.kind === 'platform' ? 'admins' : 'accounts';
    const id = s.kind === 'platform' ? s.adminId : s.accountId;
    const acc = ((doc || {})[key] || []).filter(function (a) { return a.id === id; })[0];
    if (!acc || !checkPassword_(acc, String(req.oldPassword || ''))) return { ok: false, error: 'invalid', message: 'Current password is wrong.' };
    if (checkPassword_(acc, next)) return { ok: false, error: 'invalid', message: 'Choose a different password.' };
    setPassword_(acc, next); delete acc.mustChange;
    writeDocs_(store, [{ op: 'set', path: path, data: doc }], s.email);
    audit_(s.email, s.wsId || 'lightech', 'password', path, 'changed own password');
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function setPassword_(acc, pw) { acc.salt = Utilities.getUuid().replace(/-/g, '').slice(0, 10); acc.pw = sha256Hex_(acc.salt + ':' + pw); }
function randomPassword_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function cache_() { return CacheService.getScriptCache(); }
function out_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }

// ── app shell (generated by scripts/build-gas.mjs; do not edit by hand) ──
const ASSET_BASE = 'https://cdn.jsdelivr.net/gh/oasys-lightrees/mentoring_app@22332f0e17db57af329e9066187178da6054293e/';
const APP_SHELL = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n<meta charset=\"UTF-8\">\n<link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n<link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n<link rel=\"stylesheet\" href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap\">\n<link rel=\"stylesheet\" href=\"__ASSETS__assets/app.css\">\n</head>\n<body>\n<div id=\"gate\" hidden></div>\n\n<div id=\"app\" hidden>\n  <header class=\"topbar\">\n    <div class=\"topbar-inner\">\n      <div class=\"brand\">\n        <div class=\"brand-logo\" id=\"brand-logo\">L</div>\n        <div style=\"min-width:0\">\n          <div class=\"brand-name ellipsis\" id=\"brand-name\">Lightech Mentoring App</div>\n          <div class=\"brand-tag ellipsis\" id=\"brand-tag\"></div>\n        </div>\n      </div>\n      <div class=\"topbar-actions\">\n        <span class=\"sync local\" id=\"sync\"><span class=\"dot\"></span><span id=\"sync-text\"></span></span>\n        <button class=\"btn btn-bar\" id=\"console-back\" type=\"button\" hidden></button>\n        <button class=\"btn btn-gold\" id=\"btn-add-lead\" type=\"button\">+ <span id=\"btn-add-lead-label\">Lead</span></button>\n        <button class=\"btn btn-bar\" id=\"btn-add-session\" type=\"button\">+ <span id=\"btn-add-session-label\">Session</span></button>\n        <div class=\"me-chip\" id=\"me-chip\"></div>\n        <div class=\"lang-seg\" id=\"lang-bar\" role=\"group\" aria-label=\"Language\"></div>\n      </div>\n    </div>\n    <nav class=\"tabs\" id=\"tabs\" aria-label=\"Main menu\"></nav>\n  </header>\n  <div class=\"imp-banner\" id=\"imp-banner\" hidden></div>\n\n  <main id=\"view\" class=\"container\"></main>\n</div>\n\n<aside id=\"drawer\" class=\"drawer\" aria-hidden=\"true\">\n  <div class=\"drawer-backdrop\" data-close-drawer></div>\n  <div class=\"drawer-panel\" id=\"drawer-panel\"></div>\n</aside>\n\n<div id=\"modal\" class=\"modal\" aria-hidden=\"true\">\n  <div class=\"modal-card\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"modal-title\">\n    <div class=\"modal-head\">\n      <h3 id=\"modal-title\"></h3>\n      <button class=\"icon-btn\" type=\"button\" data-close-modal aria-label=\"Close\">✕</button>\n    </div>\n    <form id=\"modal-form\" class=\"modal-body\" autocomplete=\"off\"></form>\n  </div>\n</div>\n\n<div id=\"toast\" class=\"toast\" role=\"status\" aria-live=\"polite\"></div>\n<script>window.MCRM_CONFIG = __CONFIG__;</script>\n<script src=\"__ASSETS__assets/presets.js\"></script>\n<script src=\"__ASSETS__assets/app.js\"></script>\n</body>\n</html>";
// ── end app shell ──

/*
 * Lightrees Mentoring CRM — white-label, multi-company Lead → Deal → Client.
 *
 *  - Every company (tenant) logs in on its own branded screen (link ending in #<slug>) and only ever sees its own brand.
 *  - Lightech platform admins sign in to the Lightech Console to create, configure and open every company.
 *  - UI is bilingual (EN / ID), toggle at the top right.
 *
 * Storage:
 *  - Cloud: opened as a Claude Artifact (capability `db`) → online, real-time for everyone with access.
 *  - Local: opened as a plain file → this browser's localStorage (JSON backup available).
 */
(function () {
  'use strict';

  // =====================================================================
  // Utils & i18n
  // =====================================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const DAY = 86400000;

  const mem = {};
  const LS = {
    get(k) { try { const v = localStorage.getItem(k); return v == null ? (mem[k] ?? null) : JSON.parse(v); } catch (e) { return mem[k] ?? null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* keep in memory */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  const K_INDEX = 'mcrm:workspaces', K_WS = (id) => 'mcrm:ws:' + id, K_AUTH = (id) => 'mcrm:auth:' + id;
  const K_TENANT = 'mcrm:tenant', K_PAUTH = 'mcrm:pauth', K_LANG = 'mcrm:lang', K_PLATFORM = 'mcrm:platform';

  let LANG = LS.get(K_LANG) === 'id' ? 'id' : 'en';
  const tr = (en, id) => (LANG === 'id' ? id : en);
  const locale = () => (LANG === 'id' ? 'id-ID' : 'en-GB');

  const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const todayISO = () => localISO();
  const addMonths = (iso, m) => { const d = new Date(iso + 'T00:00:00'); d.setMonth(d.getMonth() + Number(m || 0)); return localISO(d); };
  const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY);
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    return isNaN(d) ? '—' : d.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtShortDate = (iso) => fmtDate(iso).replace(/ \d{4}$/, '');
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  };
  const fmtMoney = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const fmtMoneyShort = (n) => {
    n = Number(n) || 0;
    const f = (x) => x.toLocaleString(locale(), { maximumFractionDigits: 1 });
    if (n >= 1e9) return 'Rp ' + f(n / 1e9) + tr('B', ' M');
    if (n >= 1e6) return 'Rp ' + f(n / 1e6) + tr('M', ' jt');
    return fmtMoney(n);
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const dd = (n) => n + tr('d', ' hr');
  const waNumber = (phone) => {
    let p = String(phone || '').replace(/[^\d+]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = '62' + p.slice(1);
    return p;
  };
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const slugify = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const durLabel = (m) => (m >= 60 ? (m / 60).toLocaleString(locale(), { maximumFractionDigits: 1 }) + tr(' h', ' jam') : m + tr(' min', ' mnt'));

  // SHA-256 (sync, UTF-8) for client-side password hashing.
  function sha256(str) {
    const ascii = unescape(encodeURIComponent(str));
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const maxWord = Math.pow(2, 32);
    let hash = [], k = [], primeCounter = 0;
    const isComposite = {};
    for (let c = 2; primeCounter < 64; c++) {
      if (!isComposite[c]) {
        for (let i = 0; i < 313; i += c) isComposite[i] = c;
        hash[primeCounter] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[primeCounter++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    hash = hash.slice(0, 8);
    let s = ascii + '\x80';
    while (s.length % 64 - 56) s += '\x00';
    const words = [];
    for (let i = 0; i < s.length; i++) words[i >> 2] |= s.charCodeAt(i) << ((3 - i) % 4) * 8;
    words[words.length] = (ascii.length * 8 / maxWord) | 0;
    words[words.length] = ascii.length * 8;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, j += 16);
      const old = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    let out = '';
    for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; out += (b < 16 ? '0' : '') + b.toString(16); }
    return out;
  }
  function setPassword(acc, pw) { acc.salt = Math.random().toString(36).slice(2, 10); acc.pw = sha256(acc.salt + ':' + pw); }
  const checkPassword = (acc, pw) => !!acc && !!acc.pw && acc.pw === sha256((acc.salt || '') + ':' + pw);

  // =====================================================================
  // State
  // =====================================================================
  let Backend = null;
  let platform = null;  // { admins: [] } — Lightech platform admins
  let wsIndex = [];     // company metas: [{id, name, slug, status, preset, config, accounts, programs, createdAt}]
  let S = null;         // open company workspace
  let me = null;        // signed-in company account (or a Lightech admin viewing the company)
  let pme = null;       // signed-in Lightech admin
  let drawerState = null;
  const consoleStats = {};
  const ui = { period: '90', pipeOwner: '', pipeSearch: '', leadSearch: '', leadStage: '', leadOwner: '', leadSource: '', sessFilter: 'upcoming', sessType: '', sessMentor: '', clientSearch: '', clientStatus: 'active', clientCoach: '' };

  const slugOf = (m) => m.slug || slugify(m.preset && window.PRESETS[m.preset] ? m.preset : m.name);
  const tenantBySlug = (s) => (s ? wsIndex.find((w) => slugOf(w) === s) : null);
  const metaFields = (d) => ({ name: d.name, slug: d.slug, status: d.status || 'active', preset: d.preset, config: d.config, accounts: d.accounts, programs: d.programs, createdAt: d.createdAt, v: 3 });

  // =====================================================================
  // Backends
  // =====================================================================
  const LocalBackend = {
    mode: 'local',
    async list() {
      return (LS.get(K_INDEX) || []).map((w) => { const d = LS.get(K_WS(w.id)); return d ? Object.assign({ id: w.id }, metaFields(migrate(Object.assign(d, { id: w.id })))) : null; }).filter(Boolean);
    },
    async open(id) { const d = LS.get(K_WS(id)); return d ? Object.assign(d, { id }) : null; },
    save() { LS.set(K_WS(S.id), S); this.syncIndex(S); setSync('local'); },
    syncIndex(d) {
      const i = wsIndex.findIndex((x) => x.id === d.id);
      const m = Object.assign({ id: d.id }, metaFields(d));
      if (i >= 0) wsIndex[i] = m; else wsIndex.push(m);
      LS.set(K_INDEX, wsIndex.map((w) => ({ id: w.id, name: w.name })));
    },
    async create(d) { LS.set(K_WS(d.id), d); this.syncIndex(d); },
    async saveMeta(id, meta) { const d = LS.get(K_WS(id)); if (!d) return; Object.assign(d, meta); LS.set(K_WS(id), d); this.syncIndex(Object.assign(d, { id })); },
    async remove(id) { LS.del(K_WS(id)); wsIndex = wsIndex.filter((w) => w.id !== id); LS.set(K_INDEX, wsIndex.map((w) => ({ id: w.id, name: w.name }))); },
    async stats(id) { const d = LS.get(K_WS(id)) || {}; return { leads: d.leads || [], sessions: d.sessions || [], clients: d.clients || [] }; },
    async getPlatform() { return LS.get(K_PLATFORM); },
    async savePlatform(p) { LS.set(K_PLATFORM, p); },
    close() {}
  };

  function makeCloudBackend(db) {
    const shadow = new Map();
    let unsubs = [], idxUnsub = null, flushing = null, dirty = false, renderT = null;
    const queue = new Map(); // workspace id -> workspace object waiting to be written
    const B = { mode: 'cloud', readOnly: false };
    const KINDS = ['leads', 'sessions', 'clients'];
    function docsOf(d) {
      const m = new Map();
      m.set('ws/' + d.id, metaFields(d));
      KINDS.forEach((k) => (d[k] || []).forEach((x) => m.set(`ws/${d.id}/${k}/${x.id}`, x)));
      return m;
    }
    async function op(fn) {
      for (let i = 0; ; i++) {
        try { return await fn(); } catch (e) {
          const code = e && e.code;
          if ((code === 'unavailable' || code === 'resource_exhausted') && i < 4) { await sleep(600 * Math.pow(2, i) + Math.random() * 400); continue; }
          throw e;
        }
      }
    }
    async function runOps(ops) {
      let idx = 0;
      const worker = async () => {
        while (idx < ops.length) {
          const o = ops[idx++];
          try {
            if (o.del) { await op(() => db.doc(o.p).delete()); shadow.delete(o.p); }
            else { await op(() => db.doc(o.p).set(JSON.parse(o.j))); shadow.set(o.p, o.j); }
          } catch (e) {
            if (e && (e.code === 'invalid_argument' || e.code === 'not_granted')) {
              if (!B.readOnly) { B.readOnly = true; toast(tr('You have view-only access to this link. Ask the owner for Contributor or Editor access to save.', 'Akses Anda di link ini hanya lihat. Minta akses Contributor/Editor ke pemilik untuk menyimpan.')); }
            } else if (e && e.code === 'quota_exceeded') { toast(tr('Database is full. Delete old data or back up to JSON and clear.', 'Kapasitas database penuh. Hapus data lama atau backup JSON lalu kosongkan.')); }
            else { console.warn('save failed', o.p, e); setSync('error'); }
            throw e;
          }
        }
      };
      await Promise.allSettled([worker(), worker(), worker(), worker()]);
    }
    B.flush = function (data) {
      const d0 = data || S;
      if (d0) queue.set(d0.id, d0);
      if (flushing) { dirty = true; return flushing; }
      setSync('saving');
      flushing = (async () => {
        do {
          dirty = false;
          const sets = Array.from(queue.values()); queue.clear();
          const ops = [];
          sets.forEach((d) => {
            const want = docsOf(d);
            const prefix = 'ws/' + d.id;
            want.forEach((obj, p) => { const j = JSON.stringify(obj); if (shadow.get(p) !== j) ops.push({ p, j }); });
            shadow.forEach((_, p) => { if ((p === prefix || p.startsWith(prefix + '/')) && !want.has(p)) ops.push({ p, del: true }); });
          });
          if (ops.length) await runOps(ops);
        } while (dirty || queue.size);
      })().catch(() => {}).finally(() => { flushing = null; setSync(B.readOnly ? 'readonly' : 'cloud'); });
      return flushing;
    };
    B.idle = () => flushing || Promise.resolve();
    B.save = () => { if (!B.readOnly) B.flush(); };
    B.list = async () => {
      const q = await op(() => db.collection('ws').get());
      return q.docs.map((d) => { const m = clone(d.data() || {}); shadow.set('ws/' + d.id, JSON.stringify(m)); return Object.assign({ id: d.id }, m); });
    };
    B.watchIndex = () => {
      if (idxUnsub) return;
      idxUnsub = db.collection('ws').onSnapshot((snap) => {
        wsIndex = snap.docs.map((d) => Object.assign({ id: d.id }, clone(d.data() || {})));
        if (S) {
          const mine = snap.docs.find((d) => d.id === S.id);
          if (!mine && !snap.metadata.fromCache) { toast(tr('This workspace was removed.', 'Workspace ini sudah dihapus.')); S = null; me = null; boot(); return; }
          if (mine) {
            const data = clone(mine.data());
            const j = JSON.stringify(data);
            if (shadow.get('ws/' + S.id) !== j) {
              Object.assign(S, data);
              shadow.set('ws/' + S.id, j);
              migrate(S);
              if (me && !me.platform) me = S.status === 'suspended' ? null : (S.accounts.find((a) => a.id === me.id && a.active !== false) || null);
              scheduleRender();
              return;
            }
          }
        }
        if (pme && !me) scheduleRender();
      }, (e) => console.warn('index listener', e));
    };
    B.open = (id) => new Promise((resolve) => {
      B.close();
      const data = { id, leads: [], sessions: [], clients: [] };
      let pending = KINDS.length + 1, done = false;
      const ready = () => { if (!done && --pending <= 0) { done = true; resolve(data); } };
      setTimeout(() => { if (!done) { done = true; resolve(data.config ? data : null); } }, 12000);
      op(() => db.doc('ws/' + id).get()).then((snap) => {
        if (!snap.exists) { done = true; resolve(null); return; }
        const m = clone(snap.data()); shadow.set('ws/' + id, JSON.stringify(m)); Object.assign(data, m);
        ready();
      }).catch(() => { done = true; resolve(null); });
      KINDS.forEach((k) => {
        const path = `ws/${id}/${k}`;
        let first = true;
        unsubs.push(db.collection(path).onSnapshot((snap) => {
          const arr = (S && S.id === id) ? S[k] : data[k];
          let changed = false;
          snap.docChanges().forEach((ch) => {
            const p = path + '/' + ch.doc.id;
            if (ch.type === 'removed') {
              const i = arr.findIndex((x) => x.id === ch.doc.id);
              if (i >= 0) { arr.splice(i, 1); changed = true; }
              shadow.delete(p);
              return;
            }
            const obj = clone(ch.doc.data());
            const j = JSON.stringify(obj);
            if (shadow.get(p) === j) return;
            shadow.set(p, j);
            const i = arr.findIndex((x) => x.id === ch.doc.id);
            if (i >= 0) { if (JSON.stringify(arr[i]) === j) return; arr[i] = obj; } else arr.push(obj);
            changed = true;
          });
          if (first) { first = false; ready(); } else if (changed && S && S.id === id) scheduleRender();
        }, (e) => { console.warn('listener', path, e); if (first) { first = false; ready(); } }));
      });
    });
    B.create = async (d) => { await B.flush(d); wsIndex.push(Object.assign({ id: d.id }, metaFields(d))); };
    B.saveMeta = async (id, meta) => {
      const cur = wsIndex.find((w) => w.id === id);
      const next = Object.assign({}, cur, meta);
      const body = metaFields(next);
      const j = JSON.stringify(body);
      await runOps([{ p: 'ws/' + id, j }]);
      Object.assign(cur, body);
    };
    B.remove = async (id) => {
      const ps = [];
      for (const k of KINDS) { const q = await op(() => db.collection(`ws/${id}/${k}`).get()); q.docs.forEach((d) => ps.push(`ws/${id}/${k}/${d.id}`)); }
      ps.push('ws/' + id);
      await runOps(ps.map((p) => ({ p, del: true })));
      wsIndex = wsIndex.filter((w) => w.id !== id);
    };
    B.stats = async (id) => {
      const out = {};
      for (const k of KINDS) { const q = await op(() => db.collection(`ws/${id}/${k}`).get()); out[k] = q.docs.map((d) => d.data()); }
      return out;
    };
    B.getPlatform = async () => { const s = await op(() => db.doc('platform/main').get()); return s.exists ? clone(s.data()) : null; };
    B.savePlatform = async (p) => { await runOps([{ p: 'platform/main', j: JSON.stringify(p) }]); };
    B.close = () => { unsubs.forEach((u) => { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; };
    function scheduleRender() {
      clearTimeout(renderT);
      renderT = setTimeout(() => {
        const ae = document.activeElement;
        const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && (ae.closest('#view') || ae.closest('#drawer-panel'));
        if (typing) { ae.addEventListener('blur', scheduleRender, { once: true }); return; }
        if (pme && !me) { renderConsole(); return; }
        if (!S) return;
        applyBrand();
        if (!me) { render(); return; }
        renderMain();
        if (drawerState && $('#drawer').classList.contains('open')) reopenDrawer();
      }, 120);
    }
    return B;
  }

  function save() { if (S) Backend.save(); }

  // =====================================================================
  // Workspaces & platform
  // =====================================================================
  function buildWorkspace(presetKey, withDemo, name, slug) {
    const p = window.PRESETS[presetKey] || window.PRESETS.blank;
    const d = {
      id: uid('ws'), name: name || p.name, slug: slug || slugify(presetKey), status: 'active', preset: presetKey, createdAt: new Date().toISOString(),
      config: clone(p.config), accounts: clone(p.accounts), programs: clone(p.programs), leads: [], sessions: [], clients: []
    };
    if (name) d.config.brandName = name;
    d.accounts.forEach((a) => { a.active = true; setPassword(a, 'demo'); });
    if (withDemo) seedDemo(d);
    return d;
  }

  function migrate(d) {
    if (!d.accounts) {
      d.accounts = (d.team || []).map((m) => Object.assign({}, m, { email: slugify(m.name) + '@demo.local' }));
      d.accounts.unshift({ id: 'u-owner', name: 'Owner', email: 'owner@demo.local', role: 'superadmin' });
      delete d.team;
    }
    d.accounts.forEach((a) => { if (!a.pw) setPassword(a, 'demo'); if (a.active == null) a.active = true; });
    d.leads = d.leads || []; d.sessions = d.sessions || []; d.clients = d.clients || []; d.programs = d.programs || [];
    d.sessions.forEach((s) => { if (!Array.isArray(s.actionItems)) s.actionItems = []; });
    d.name = d.name || (d.config && d.config.brandName) || 'Company';
    d.slug = slugOf(d);
    d.status = d.status || 'active';
    if (d.config.demoLogin == null) d.config.demoLogin = true;
    return d;
  }

  function defaultPlatform() {
    const a = { id: 'lt-owner', name: 'Lightech Super Admin', email: 'super@lightech.co.id', role: 'owner', active: true };
    setPassword(a, 'demo');
    return { name: 'Lightech', admins: [a] };
  }
  const savePlatform = () => Backend.savePlatform(platform);

  async function activate(id) {
    const data = await Backend.open(id);
    if (!data) { toast(tr('Could not open this workspace', 'Workspace tidak bisa dibuka')); return false; }
    S = migrate(data);
    const authId = LS.get(K_AUTH(id));
    me = S.accounts.find((a) => a.id === authId && a.active !== false) || null;
    applyBrand();
    return true;
  }

  // =====================================================================
  // Demo data
  // =====================================================================
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seedDemo(d) {
    const r = rng(String(d.preset).length * 977 + 13);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const first = ['Budi', 'Siti', 'Andi', 'Dewi', 'Hendra', 'Clarissa', 'Rudi', 'Maya', 'Yusuf', 'Intan', 'Kevin', 'Laras', 'Bayu', 'Nadia', 'Rizky', 'Putri', 'Agus', 'Wulan', 'Teguh', 'Citra', 'Fikri', 'Melati', 'Galih', 'Sinta'];
    const last = ['Santoso', 'Rahma', 'Pratama', 'Lestari', 'Gunawan', 'Wijaya', 'Hartono', 'Saputra', 'Halim', 'Kusuma', 'Tanoto', 'Nugroho'];
    const comp = ['PT Digital Scale', 'Aroma Coffee', 'Techindo', 'Glow Skincare', 'BuildCorp', 'Fashion Hub', 'Villa Seminyak', 'Kost Eksklusif', 'Klinik Sehat', 'Kopi Nusantara', 'Logistik Prima', 'EduKids', 'Bali Living', 'Space Office', ''];
    const tasks = ['Audit Q3 financial report', 'Write the sales team SOP', 'Hire an operations manager', 'Set CS team KPIs', 'Review product margins', 'Build a weekly cashflow dashboard', 'Launch Meta Ads campaign', 'Review org structure'];
    const st = d.config.stages;
    const open = st.filter((s) => s.type === 'open');
    const won = st.find((s) => s.type === 'won'), lost = st.find((s) => s.type === 'lost');
    const owners = d.accounts.filter((a) => a.role === 'bd');
    const ownerPool = owners.length ? owners : d.accounts.filter((a) => ['admin', 'assistant', 'superadmin'].includes(a.role));
    const mentors = d.accounts.filter((a) => ['mentor', 'senior'].includes(a.role));
    const mentorPool = mentors.length ? mentors : d.accounts;
    const asstOf = (mid) => (d.accounts.find((a) => a.role === 'assistant' && a.mentorId === mid) || {}).id || '';
    const now = Date.now();
    const typeByStage = {};
    d.config.sessionTypes.forEach((t) => { if (t.stageId) typeByStage[t.stageId] = t; });
    const delivery = d.config.sessionTypes.find((t) => !t.stageId);
    const hhmm = () => String(9 + Math.floor(r() * 8)).padStart(2, '0') + ':' + (r() < 0.5 ? '00' : '30');
    const mkSession = (lead, typeId, date, status, mentorId, extra) => Object.assign({ id: uid('S'), leadId: lead.id, typeId, date, time: hhmm(), mentorId, assistantId: asstOf(mentorId), status, notes: '', actionItems: [] }, extra || {});
    for (let i = 0; i < 24; i++) {
      const created = now - Math.floor(2 + r() * 85) * DAY - Math.floor(r() * 8) * 3600000;
      const prog = pick(d.programs);
      const lead = {
        id: uid('L'), name: first[(i * 7) % first.length] + ' ' + pick(last), company: pick(comp),
        phone: '08' + String(Math.floor(1e9 + r() * 8e9)), email: '', source: pick(d.config.sources),
        ownerId: pick(ownerPool).id, programId: prog.id, value: prog.price, stageId: open[0].id,
        nextAction: '', nextActionDate: '', notes: '', demo: true,
        createdAt: new Date(created).toISOString(), updatedAt: new Date(created).toISOString(),
        history: [{ at: new Date(created).toISOString(), from: null, to: open[0].id, note: 'Lead created' }]
      };
      let t = created, idx = 0;
      const step = (toId, note) => {
        t = Math.min(t + Math.floor(1 + r() * 6) * DAY + Math.floor(r() * 6) * 3600000, now - 3600000);
        lead.history.push({ at: new Date(t).toISOString(), from: lead.stageId, to: toId, note: note || '' });
        lead.stageId = toId;
      };
      while (idx < open.length - 1 && r() < 0.68) { idx++; step(open[idx].id); }
      if (idx === open.length - 1 && r() < 0.6) { step(won.id, 'Deal closed'); lead.wonAt = new Date(t).toISOString(); }
      else if (now - created > 25 * DAY && r() < 0.45) { lead.lostReason = pick(d.config.lostReasons); step(lost.id, lead.lostReason); lead.lostAt = new Date(t).toISOString(); }
      lead.updatedAt = new Date(t).toISOString();
      const leadMentor = pick(mentorPool).id;
      lead.history.forEach((h) => { const ty = typeByStage[h.to]; if (ty) d.sessions.push(mkSession(lead, ty.id, localISO(new Date(h.at)), 'done', leadMentor)); });
      const cur = st.find((s) => s.id === lead.stageId);
      if (cur.type === 'open') {
        lead.nextActionDate = localISO(new Date(now + (Math.floor(r() * 9) - 3) * DAY));
        lead.nextAction = pick(['WhatsApp follow-up', 'Send proposal', 'Book next session', 'Call back', 'Send preview material']);
        const nx = open[idx + 1];
        if (nx && typeByStage[nx.id] && r() < 0.6) d.sessions.push(mkSession(lead, typeByStage[nx.id].id, localISO(new Date(now + Math.floor(r() * 7) * DAY)), 'scheduled', leadMentor));
      }
      if (cur.type === 'won') {
        const p = d.programs.find((x) => x.id === lead.programId) || prog;
        const start = localISO(new Date(lead.wonAt));
        d.clients.push({
          id: uid('C'), leadId: lead.id, name: lead.name, company: lead.company, phone: lead.phone, email: '',
          programId: p.id, coachId: leadMentor, assistantId: asstOf(leadMentor), startDate: start, months: p.months,
          totalSessions: p.sessions, value: lead.value, status: 'active', notes: '', demo: true, createdAt: lead.wonAt
        });
        if (delivery) {
          const elapsed = Math.max(0, daysBetween(start, new Date()));
          const doneN = Math.min(p.sessions, Math.floor(elapsed / 14));
          for (let k = 0; k < doneN; k++) {
            const date = localISO(new Date(new Date(start).getTime() + (k + 1) * 14 * DAY));
            if (date >= todayISO()) break;
            d.sessions.push(mkSession(lead, delivery.id, date, 'done', leadMentor, { actionItems: [{ text: pick(tasks), done: true }, { text: pick(tasks), done: k < doneN - 1 || r() < 0.4 }] }));
          }
          if (doneN < p.sessions) d.sessions.push(mkSession(lead, delivery.id, localISO(new Date(now + Math.floor(1 + r() * 10) * DAY)), 'scheduled', leadMentor));
        }
      }
      d.leads.push(lead);
    }
    const c0 = d.clients[0];
    if (c0) {
      const dom = ((d.accounts[0] || {}).email || '@demo.local').split('@')[1];
      const acc = { id: uid('u'), name: c0.name, email: 'client@' + dom, role: 'client', clientId: c0.id, active: true };
      setPassword(acc, 'demo');
      d.accounts.push(acc);
      c0.accountId = acc.id;
    }
  }

  // =====================================================================
  // Lookups, labels, RBAC
  // =====================================================================
  const L = (k) => (S.config.labels && S.config.labels[k]) || k;
  const stages = () => S.config.stages;
  const stage = (id) => stages().find((s) => s.id === id) || { id, name: id || '—', color: '#94a3b8', type: 'open', prob: 0, sla: 0 };
  const stageIdx = (id) => stages().findIndex((s) => s.id === id);
  const openStages = () => stages().filter((s) => s.type === 'open');
  const wonStage = () => stages().find((s) => s.type === 'won');
  const lostStage = () => stages().find((s) => s.type === 'lost');
  const acc = (id) => S.accounts.find((a) => a.id === id);
  const accName = (id) => {
    if (id && String(id).startsWith('lt:')) { const a = (platform.admins || []).find((x) => 'lt:' + x.id === id); return (a ? a.name : 'Lightech') + ' (Lightech)'; }
    return (acc(id) || {}).name || '—';
  };
  const program = (id) => S.programs.find((p) => p.id === id);
  const stype = (id) => S.config.sessionTypes.find((t) => t.id === id) || { id, name: id || '—', color: '#94a3b8', duration: 0, stageId: '' };
  const lead = (id) => S.leads.find((l) => l.id === id);
  const client = (id) => S.clients.find((c) => c.id === id);
  const clientOfLead = (leadId) => S.clients.find((c) => c.leadId === leadId);
  const isOpen = (l) => stage(l.stageId).type === 'open';
  const isWon = (l) => stage(l.stageId).type === 'won';
  const isLost = (l) => stage(l.stageId).type === 'lost';
  const stageEnteredAt = (l) => { for (let i = l.history.length - 1; i >= 0; i--) if (l.history[i].to === l.stageId) return l.history[i].at; return l.createdAt; };
  const mentorsList = () => S.accounts.filter((a) => ['senior', 'mentor'].includes(a.role) && a.active !== false);
  const staffList = () => S.accounts.filter((a) => a.role !== 'client' && a.active !== false);
  const ownersList = () => {
    const order = { bd: 0, admin: 1, assistant: 2, senior: 3, superadmin: 4, mentor: 5 };
    return staffList().slice().sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
  };
  const assistantOf = (mentorId) => S.accounts.find((a) => a.role === 'assistant' && a.mentorId === mentorId && a.active !== false);
  const roleName = (r) => ({
    superadmin: 'Owner', admin: 'Admin / PA / CS', senior: 'Senior ' + L('mentor'), mentor: L('mentor'),
    assistant: tr('Asst. ', 'Ast. ') + L('mentor'), bd: L('owner'), client: L('client')
  }[r] || r);

  const R = () => (me ? me.role : '');
  const isAdmin = () => ['superadmin', 'admin'].includes(R());
  const seesAll = () => ['superadmin', 'admin', 'senior'].includes(R());
  const isStaff = () => !!me && R() !== 'client';
  const can = { settings: () => isAdmin(), accounts: () => isAdmin(), del: () => isAdmin(), editLead: () => isStaff(), editClient: () => isStaff() && R() !== 'bd', editSession: () => isStaff() };
  const myClient = () => (R() === 'client' ? client(me.clientId) : null);
  function visibleLeads() {
    if (!me) return [];
    if (seesAll() || R() === 'assistant') return S.leads;
    if (R() === 'bd') return S.leads.filter((l) => l.ownerId === me.id);
    if (R() === 'mentor') {
      const ids = new Set(S.sessions.filter((s) => s.mentorId === me.id).map((s) => s.leadId));
      S.clients.forEach((c) => { if (c.coachId === me.id) ids.add(c.leadId); });
      return S.leads.filter((l) => ids.has(l.id));
    }
    return [];
  }
  function visibleSessions() {
    if (!me) return [];
    if (seesAll()) return S.sessions;
    if (R() === 'mentor') return S.sessions.filter((s) => s.mentorId === me.id);
    if (R() === 'assistant') return S.sessions.filter((s) => s.mentorId === me.mentorId || s.assistantId === me.id);
    if (R() === 'bd') { const ids = new Set(visibleLeads().map((l) => l.id)); return S.sessions.filter((s) => ids.has(s.leadId)); }
    const c = myClient();
    return c ? S.sessions.filter((s) => s.leadId === c.leadId) : [];
  }
  function visibleClients() {
    if (!me) return [];
    if (seesAll()) return S.clients;
    if (R() === 'mentor') return S.clients.filter((c) => c.coachId === me.id);
    if (R() === 'assistant') return S.clients.filter((c) => c.coachId === me.mentorId || c.assistantId === me.id);
    if (R() === 'bd') { const ids = new Set(visibleLeads().map((l) => l.id)); return S.clients.filter((c) => ids.has(c.leadId)); }
    const c = myClient();
    return c ? [c] : [];
  }
  const scopeNote = () => {
    if (seesAll() || !me) return '';
    const txt = {
      bd: tr(`Showing your own ${L('leads')}`, `Menampilkan ${L('leads')} milik Anda`),
      mentor: tr(`Showing the ${L('clients')} & ${L('sessions')} you handle`, `Menampilkan ${L('clients')} & ${L('sessions')} yang Anda pegang`),
      assistant: tr(`Scope: ${accName(me.mentorId)}'s team`, `Ruang lingkup: tim ${accName(me.mentorId)}`)
    }[R()];
    return txt ? `<div class="scope-note">${esc(txt)} · ${esc(roleName(R()))}</div>` : '';
  };

  // =====================================================================
  // Render helpers
  // =====================================================================
  function pillStage(id) { const s = stage(id); return `<span class="pill" style="background:${esc(s.color)}22;color:${esc(s.color)}"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`; }
  function pillType(id) { const t = stype(id); return `<span class="pill" style="background:${esc(t.color)}22;color:${esc(t.color)}">${esc(t.name)}${t.duration ? ' · ' + esc(durLabel(t.duration)) : ''}</span>`; }
  const CLIENT_STATUS = () => ({ active: [tr('Active', 'Aktif'), 'badge-green'], paused: [tr('Paused', 'Pause'), 'badge-amber'], completed: [tr('Completed', 'Selesai'), 'badge-blue'], churned: ['Churn', 'badge-red'] });
  const clientBadge = (s) => { const x = CLIENT_STATUS()[s] || [s, '']; return `<span class="badge ${x[1]}">${esc(x[0])}</span>`; };
  const SESS_STATUS = () => ({ scheduled: tr('Scheduled', 'Terjadwal'), done: tr('Done', 'Selesai'), noshow: 'No-show', cancelled: tr('Cancelled', 'Batal') });
  const options = (arr, sel, valFn, labFn, empty) =>
    (empty != null ? `<option value="">${esc(empty)}</option>` : '') +
    arr.map((x) => { const v = valFn(x); return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(labFn(x))}</option>`; }).join('');
  const kpi = (label, value, sub, lead) => `<div class="kpi ${lead ? 'lead-kpi' : ''}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-sub">${esc(sub)}</div></div>`;
  const waHref = (phone, msg) => `https://wa.me/${esc(waNumber(phone))}${msg ? '?text=' + encodeURIComponent(msg) : ''}`;
  function waReminder(s) {
    const l = lead(s.leadId);
    const msg = (S.config.waTemplate || '')
      .replace(/\{name\}/g, l ? l.name.split(' ')[0] : '').replace(/\{type\}/g, stype(s.typeId).name)
      .replace(/\{mentor\}/g, accName(s.mentorId)).replace(/\{date\}/g, fmtDate(s.date))
      .replace(/\{time\}/g, s.time).replace(/\{brand\}/g, S.config.brandName || '');
    return waHref(l && l.phone, msg);
  }
  function clientProgress(c) {
    const ss = S.sessions.filter((s) => s.leadId === c.leadId && !stype(s.typeId).stageId);
    const done = ss.filter((s) => s.status === 'done').length;
    const next = ss.filter((s) => s.status === 'scheduled' && s.date >= todayISO()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    const last = ss.filter((s) => s.status === 'done').sort((a, b) => b.date.localeCompare(a.date))[0];
    const actions = [];
    S.sessions.filter((s) => s.leadId === c.leadId).forEach((s) => (s.actionItems || []).forEach((a, i) => actions.push({ s, i, a })));
    const end = c.startDate ? addMonths(c.startDate, c.months || 12) : '';
    const total = Number(c.totalSessions) || 0;
    const idle = c.status === 'active' && (!last || daysBetween(last.date, new Date()) > 30) && daysBetween(c.startDate || todayISO(), new Date()) > 21;
    return { done, total, pct: total ? Math.min(100, pct(done, total)) : 0, next, last, actions, openActions: actions.filter((x) => !x.a.done), end, daysLeft: end ? daysBetween(new Date(), end + 'T00:00:00') : null, idle };
  }
  const langToggle = () => `<button type="button" data-lang="en" class="${LANG === 'en' ? 'on' : ''}">EN</button><button type="button" data-lang="id" class="${LANG === 'id' ? 'on' : ''}">ID</button>`;
  function bindLang(root) {
    $$('[data-lang]', root || document).forEach((b) => b.onclick = () => {
      if (LANG === b.dataset.lang) return;
      LANG = b.dataset.lang; LS.set(K_LANG, LANG); document.documentElement.lang = LANG;
      rerenderAll();
    });
  }

  // =====================================================================
  // Domain actions
  // =====================================================================
  function moveStage(l, toId, note) {
    if (!l || l.stageId === toId) return;
    const to = stage(toId);
    l.history.push({ at: new Date().toISOString(), from: l.stageId, to: toId, note: note || '', by: me ? me.id : '' });
    l.stageId = toId;
    if (to.type === 'won') { l.wonAt = new Date().toISOString(); delete l.lostAt; delete l.lostReason; }
    else if (to.type === 'lost') { l.lostAt = new Date().toISOString(); delete l.wonAt; }
    else { delete l.wonAt; delete l.lostAt; delete l.lostReason; }
    l.updatedAt = new Date().toISOString();
    save();
  }

  function requestStageChange(leadId, toId, after) {
    const l = lead(leadId);
    if (!l || l.stageId === toId) { after && after(); return; }
    const to = stage(toId);
    if (to.type === 'lost') {
      openModal(tr('Mark as Lost', 'Tandai Lost') + ' · ' + l.name, `
        <div class="form-stack">
          <label class="field"><span>${tr('Lost reason *', 'Alasan lost *')}</span>
            <select name="reason" id="f-lost-reason" required>${options(S.config.lostReasons, '', (x) => x, (x) => x, tr('Choose a reason', 'Pilih alasan'))}</select></label>
          <label class="field"><span>${tr('Note', 'Catatan')}</span><textarea name="note" id="f-lost-note" placeholder="${esc(tr('Optional, useful for nurturing later', 'Opsional, untuk nurture lagi nanti'))}"></textarea></label>
        </div>${modalFoot(tr('Mark as Lost', 'Tandai Lost'), 'btn-danger-solid')}`,
      (fd) => {
        l.lostReason = fd.get('reason');
        moveStage(l, toId, l.lostReason + (fd.get('note') ? ' — ' + fd.get('note') : ''));
        toast(tr(`${l.name} marked as Lost`, `${l.name} ditandai Lost`));
        after && after();
      });
      return;
    }
    if (to.type === 'won') {
      const existing = clientOfLead(l.id);
      const lastMentor = (S.sessions.filter((s) => s.leadId === l.id).sort((a, b) => b.date.localeCompare(a.date))[0] || {}).mentorId;
      openModal('Deal Won · ' + l.name, `
        <div class="grid-2">
          <label class="field"><span>${esc(L('program'))}</span>
            <select name="programId" id="f-won-prog">${options(S.programs, l.programId, (p) => p.id, (p) => p.name, '—')}</select></label>
          <label class="field"><span>${tr('Deal value (Rp) *', 'Nilai deal (Rp) *')}</span><input name="value" id="f-won-value" type="number" min="0" step="1000" required value="${esc(l.value || '')}"></label>
          ${existing ? '' : `
          <label class="field"><span>${esc(tr(`Assigned ${L('mentor')}`, `${L('mentor')} pendamping`))}</span>
            <select name="coachId" id="f-won-coach">${options(mentorsList(), lastMentor || (mentorsList()[0] || {}).id, (m) => m.id, (m) => m.name)}</select></label>
          <label class="field"><span>${tr('Program start', 'Mulai program')}</span><input name="startDate" id="f-won-start" type="date" value="${esc(todayISO())}"></label>`}
        </div>
        <label class="field mt"><span>${tr('Closing note', 'Catatan closing')}</span><textarea name="note" id="f-won-note" placeholder="${esc(tr('e.g. 50% down payment, kickoff next week', 'Mis. DP 50%, kickoff minggu depan'))}"></textarea></label>
        <div class="hint">${existing ? esc(tr(`A ${L('client')} record already exists for this ${L('lead')}.`, `${L('client')} sudah ada untuk ${L('lead')} ini.`)) : esc(tr(`A ${L('client')} record and program are created automatically, ready for the first session.`, `Otomatis dibuatkan data ${L('client')} + program, siap dijadwalkan sesi pertama.`))}</div>
        ${modalFoot(tr('Confirm deal', 'Konfirmasi deal'), 'btn-ok')}`,
      (fd) => {
        l.programId = fd.get('programId') || l.programId;
        l.value = Number(fd.get('value')) || 0;
        l.nextAction = ''; l.nextActionDate = '';
        moveStage(l, toId, fd.get('note') || 'Deal closed');
        if (!clientOfLead(l.id)) {
          const p = program(l.programId) || {};
          const coachId = fd.get('coachId') || '';
          S.clients.push({
            id: uid('C'), leadId: l.id, name: l.name, company: l.company || '', phone: l.phone || '', email: l.email || '',
            programId: l.programId || '', coachId, assistantId: (assistantOf(coachId) || {}).id || '',
            startDate: fd.get('startDate') || todayISO(), months: p.months || 12, totalSessions: p.sessions || 12,
            value: l.value, status: 'active', notes: '', createdAt: new Date().toISOString()
          });
          save();
        }
        toast(tr(`Closed ${fmtMoneyShort(l.value)}! ${l.name} is now an active ${L('client')}`, `Closing ${fmtMoneyShort(l.value)}! ${l.name} jadi ${L('client')} aktif`));
        after && after();
      });
      return;
    }
    moveStage(l, toId);
    toast(`${l.name} → ${to.name}`);
    after && after();
  }

  // =====================================================================
  // Chrome
  // =====================================================================
  function setSync(state) {
    const el = $('#sync'); if (!el) return;
    const map = {
      local: ['local', tr('Saved in this browser', 'Tersimpan di browser ini')], cloud: ['cloud', tr('Cloud · saved', 'Cloud · tersimpan')],
      saving: ['saving', tr('Saving…', 'Menyimpan…')], error: ['error', tr('Save failed, retry', 'Gagal simpan, coba lagi')], readonly: ['error', tr('View only', 'Akses lihat saja')]
    };
    const [cls, txt] = map[state] || map.local;
    el.className = 'sync ' + cls;
    $('#sync-text').textContent = txt;
    el.dataset.state = state;
    el.title = Backend && Backend.mode === 'cloud' ? tr('Data is stored online and syncs live for everyone with access.', 'Data tersimpan online & sinkron real-time untuk semua user.') : tr('Data is stored in this browser only. Back up to JSON regularly.', 'Data hanya tersimpan di browser ini. Backup JSON rutin.');
  }
  const refreshSync = () => setSync($('#sync').dataset.state || (Backend && Backend.mode === 'cloud' ? 'cloud' : 'local'));

  function applyBrand() {
    if (!S) return;
    const c = S.config;
    document.documentElement.style.setProperty('--accent', c.accent || '#1a4fa0');
    $('#brand-name').textContent = c.brandName || 'CRM';
    $('#brand-tag').textContent = c.tagline || '';
    $('#brand-logo').textContent = initials(c.brandName).slice(0, 1) || 'C';
    $('#btn-add-lead-label').textContent = L('lead');
    $('#btn-add-session-label').textContent = L('session');
    document.title = c.brandName || 'CRM';
  }
  function chromeCommon() {
    $('#lang-bar').innerHTML = langToggle();
    bindLang($('#lang-bar'));
    refreshSync();
  }

  function tabsFor() {
    if (R() === 'client') return [['portal', tr('My Portal', 'Portal Saya')]];
    const t = [['dashboard', 'Dashboard'], ['pipeline', 'Pipeline'], ['leads', L('leads')], ['sessions', L('sessions')], ['clients', L('clients')]];
    if (can.accounts()) t.push(['team', tr('Team & Access', 'Tim & Akses')]);
    if (can.settings()) t.push(['settings', 'Settings']);
    return t;
  }

  // =====================================================================
  // Router
  // =====================================================================
  const views = {
    dashboard: () => renderDashboard(), pipeline: () => renderPipeline(), leads: () => renderLeads(), sessions: () => renderSessions(),
    clients: () => renderClients(), team: () => renderTeam(), settings: () => renderSettings(), portal: () => renderPortal()
  };
  function currentView() {
    const allowed = tabsFor().map((t) => t[0]);
    const v = location.hash.replace('#', '');
    return allowed.includes(v) ? v : allowed[0];
  }
  function showGate(html) {
    $('#app').hidden = true;
    const g = $('#gate'); g.hidden = false;
    g.innerHTML = `<div class="gate"><div class="gate-lang lang-seg">${langToggle()}</div>${html}</div>`;
    bindLang(g);
  }
  function showLoading(msg) {
    showGate(`<div class="gate-card"><div class="muted small" style="text-align:center">${esc(msg || tr('Loading…', 'Memuat…'))}</div></div>`);
  }
  function rerenderAll() {
    if (pme && !me) { renderConsole(); return; }
    if (S) { render(); if (drawerState && me) reopenDrawer(); return; }
    renderNeutralLogin();
  }
  function render() {
    if (!S) { renderNeutralLogin(); return; }
    if (!me) { renderTenantLogin(); return; }
    $('#gate').hidden = true; $('#gate').innerHTML = '';
    $('#app').hidden = false;
    applyBrand();
    renderMain();
  }
  function renderMain() {
    if (!me) { render(); return; }
    chromeCommon();
    const v = currentView();
    $('#tabs').innerHTML = tabsFor().map(([k, t]) => `<a href="#${k}" data-view="${k}" class="${k === v ? 'active' : ''}">${esc(t)}</a>`).join('');
    const imp = !!me.platform;
    $('#me-chip').innerHTML = `<span class="avatar">${esc(initials(me.name))}</span><span><div class="me-name">${esc(me.name)}</div><div class="me-role">${esc(roleName(me.role))}</div></span>${imp ? '' : `<button type="button" id="btn-logout">${tr('Sign out', 'Keluar')}</button>`}`;
    if ($('#btn-logout')) $('#btn-logout').onclick = logout;
    const back = $('#console-back');
    back.hidden = !imp; back.textContent = '← Lightech Console'; back.onclick = backToConsole;
    const ban = $('#imp-banner');
    ban.hidden = !imp;
    if (imp) ban.textContent = tr(`Lightech mode: you are viewing ${S.name} as its Owner. Changes are saved to this company.`, `Mode Lightech: Anda melihat ${S.name} sebagai Owner. Perubahan tersimpan ke company ini.`);
    $('#btn-add-lead').hidden = !isStaff();
    $('#btn-add-session').hidden = !can.editSession();
    views[v]();
  }

  // =====================================================================
  // Login screens
  // =====================================================================
  function renderNeutralLogin(err, emailVal) {
    S = null; me = null;
    document.title = tr('Sign in', 'Masuk');
    document.documentElement.style.setProperty('--accent', '#1a4fa0');
    showGate(`<div class="gate-card">
      <div><div class="gate-title">${tr('Sign in', 'Masuk')}</div><div class="muted small">${tr('Use the email and password from your administrator.', 'Gunakan email & password dari administrator Anda.')}</div></div>
      <form id="login-form" class="form-stack" autocomplete="on">
        <label class="field"><span>Email</span><input id="login-email" type="email" required autocomplete="username" value="${esc(emailVal || '')}"></label>
        <label class="field"><span>Password</span><input id="login-pw" type="password" required autocomplete="current-password"></label>
        ${err ? `<div class="gate-err">${esc(err)}</div>` : ''}
        <button class="btn btn-primary" type="submit" style="justify-content:center;padding:10px">${tr('Sign in', 'Masuk')}</button>
      </form>
    </div>`);
    $('#login-form').onsubmit = (e) => { e.preventDefault(); neutralSignIn($('#login-email').value.trim().toLowerCase(), $('#login-pw').value); };
  }
  async function neutralSignIn(email, pw) {
    const pa = (platform.admins || []).find((a) => (a.email || '').toLowerCase() === email && a.active !== false);
    if (pa && checkPassword(pa, pw)) { platformLogin(pa); return; }
    const hits = [];
    wsIndex.forEach((w) => (w.accounts || []).forEach((a) => { if ((a.email || '').toLowerCase() === email && a.active !== false && checkPassword(a, pw)) hits.push({ w, a }); }));
    if (!hits.length) { renderNeutralLogin(tr('Wrong email or password.', 'Email atau password salah.'), email); return; }
    const go = async (h) => {
      if (h.w.status === 'suspended') { renderNeutralLogin(tr('This workspace is inactive. Contact your administrator.', 'Workspace ini nonaktif. Hubungi administrator Anda.'), email); return; }
      LS.set(K_TENANT, slugOf(h.w)); LS.set(K_AUTH(h.w.id), h.a.id);
      showLoading();
      if (await activate(h.w.id)) { location.hash = me && me.role === 'client' ? '#portal' : '#dashboard'; render(); }
    };
    if (hits.length === 1) { go(hits[0]); return; }
    showGate(`<div class="gate-card"><div class="gate-title">${tr('Choose a workspace', 'Pilih workspace')}</div>
      <div class="choice-list">${hits.map((h, i) => `<button type="button" class="choice" data-hit="${i}"><span class="co-dot" style="background:${esc(h.w.config.accent)}">${esc(initials(h.w.config.brandName).slice(0, 1))}</span><span><b>${esc(h.w.config.brandName)}</b><div class="small muted">${esc(h.a.name)}</div></span></button>`).join('')}</div></div>`);
    $$('[data-hit]').forEach((b) => b.onclick = () => go(hits[Number(b.dataset.hit)]));
  }

  function renderTenantLogin(err, emailVal) {
    const c = S.config;
    applyBrand();
    const suspended = S.status === 'suspended';
    const byRole = {};
    S.accounts.forEach((a) => { if (a.active !== false && !byRole[a.role]) byRole[a.role] = a; });
    const chips = window.ROLE_KEYS.filter((r) => byRole[r]).map((r) => byRole[r]);
    showGate(`<div class="gate-card">
      <div class="gate-brand">
        <div class="brand-logo" style="background:${esc(c.accent)}">${esc(initials(c.brandName).slice(0, 1))}</div>
        <div><div class="gate-title">${esc(c.brandName)}</div><div class="brand-tag">${esc(c.tagline || '')}</div></div>
      </div>
      ${suspended ? `<div class="gate-err">${tr('This workspace is inactive. Contact your administrator.', 'Workspace ini nonaktif. Hubungi administrator Anda.')}</div>` : `
      <form id="login-form" class="form-stack" autocomplete="on">
        <label class="field"><span>Email</span><input id="login-email" type="email" required autocomplete="username" placeholder="name@company.com" value="${esc(emailVal || '')}"></label>
        <label class="field"><span>Password</span><input id="login-pw" type="password" required autocomplete="current-password"></label>
        ${err ? `<div class="gate-err">${esc(err)}</div>` : ''}
        <button class="btn btn-primary" type="submit" style="justify-content:center;padding:10px">${tr('Sign in', 'Masuk')}</button>
      </form>
      ${c.demoLogin && chips.length ? `
        <div>
          <div class="eyebrow">${tr('Demo mode · one-click sign in per role', 'Mode demo · masuk 1 klik per peran')}</div>
          <div class="demo-chips" style="margin-top:8px">${chips.map((a) => `<button type="button" class="demo-chip" data-demo="${esc(a.id)}"><b>${esc(roleName(a.role))}</b><span>${esc(a.name)}</span></button>`).join('')}</div>
          <div class="hint">${tr('Demo password: <b>demo</b>. Turn demo mode off in Settings before go-live.', 'Password demo: <b>demo</b>. Matikan mode demo di Settings sebelum go-live.')}</div>
        </div>` : ''}`}
      <button type="button" class="gate-link" id="other-account">${tr('Use a different account', 'Masuk dengan akun lain')}</button>
    </div>`);
    if ($('#login-form')) $('#login-form').onsubmit = (e) => {
      e.preventDefault();
      const email = $('#login-email').value.trim().toLowerCase();
      const a = S.accounts.find((x) => (x.email || '').toLowerCase() === email);
      if (!a || !checkPassword(a, $('#login-pw').value)) { renderTenantLogin(tr('Wrong email or password.', 'Email atau password salah.'), email); return; }
      if (a.active === false) { renderTenantLogin(tr('This account is inactive. Contact your admin.', 'Akun ini nonaktif. Hubungi admin.'), email); return; }
      login(a);
    };
    $$('[data-demo]').forEach((b) => b.onclick = () => login(acc(b.dataset.demo)));
    $('#other-account').onclick = () => { LS.del(K_TENANT); S = null; me = null; renderNeutralLogin(); };
  }
  function login(a) {
    me = a; LS.set(K_AUTH(S.id), a.id); LS.set(K_TENANT, S.slug);
    location.hash = a.role === 'client' ? '#portal' : '#dashboard';
    render();
    toast(tr(`Welcome, ${a.name.split(' ')[0]}!`, `Halo, ${a.name.split(' ')[0]}!`));
  }
  function logout() { LS.del(K_AUTH(S.id)); me = null; closeDrawer(); closeModal(); render(); }

  // =====================================================================
  // Lightech Console (platform)
  // =====================================================================
  function platformLogin(a) {
    pme = a; LS.set(K_PAUTH, a.id); LS.del(K_TENANT);
    S = null; me = null;
    location.hash = '#companies';
    renderConsole();
  }
  function platformLogout() { LS.del(K_PAUTH); pme = null; S = null; me = null; Backend.close(); location.hash = ''; renderNeutralLogin(); }
  async function openCompany(id) {
    showLoading(tr('Opening company…', 'Membuka company…'));
    if (!(await activate(id))) { renderConsole(); return; }
    me = { id: 'lt:' + pme.id, name: pme.name, email: pme.email, role: 'superadmin', platform: true };
    location.hash = '#dashboard';
    render();
  }
  async function backToConsole() {
    if (Backend.idle) await Backend.idle();
    closeDrawer(); Backend.close(); S = null; me = null;
    location.hash = '#companies';
    renderConsole();
  }

  function renderConsole() {
    if (!pme) { renderNeutralLogin(); return; }
    $('#gate').hidden = true; $('#gate').innerHTML = '';
    $('#app').hidden = false;
    document.documentElement.style.setProperty('--accent', '#1a4fa0');
    document.title = 'Lightech Console';
    $('#brand-name').textContent = 'Lightech';
    $('#brand-tag').textContent = tr('Mentoring platform · Console', 'Platform mentoring · Console');
    $('#brand-logo').textContent = 'L';
    chromeCommon();
    $('#btn-add-lead').hidden = true; $('#btn-add-session').hidden = true; $('#console-back').hidden = true; $('#imp-banner').hidden = true;
    $('#me-chip').innerHTML = `<span class="avatar">${esc(initials(pme.name))}</span><span><div class="me-name">${esc(pme.name)}</div><div class="me-role">${pme.role === 'owner' ? 'Lightech Super Admin' : 'Lightech Admin'}</div></span><button type="button" id="btn-logout">${tr('Sign out', 'Keluar')}</button>`;
    $('#btn-logout').onclick = platformLogout;
    const tab = location.hash === '#admins' ? 'admins' : 'companies';
    $('#tabs').innerHTML = [['companies', tr('Companies', 'Company')], ['admins', tr('Lightech admins', 'Admin Lightech')]].map(([k, t]) => `<a href="#${k}" class="${k === tab ? 'active' : ''}">${esc(t)}</a>`).join('');
    if (tab === 'admins') renderAdmins(); else renderCompanies();
  }

  function renderCompanies() {
    const list = wsIndex.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const statOf = (id) => {
      const s = consoleStats[id];
      if (!s) return null;
      const st = (wsIndex.find((w) => w.id === id) || {}).config;
      const typeOf = (sid) => ((st && st.stages) || []).find((x) => x.id === sid) || {};
      const won = s.leads.filter((l) => typeOf(l.stageId).type === 'won');
      const today = todayISO();
      const last = [s.leads.map((l) => (l.updatedAt || '').slice(0, 10)), s.sessions.map((x) => x.date || '')].flat().filter((x) => x && x <= today).sort().pop();
      return { leads: s.leads.length, won: won.length, revenue: won.reduce((a, l) => a + (Number(l.value) || 0), 0), clients: s.clients.filter((c) => c.status === 'active').length, last };
    };
    const totals = list.reduce((t, w) => { const s = statOf(w.id); if (s) { t.leads += s.leads; t.revenue += s.revenue; t.clients += s.clients; } return t; }, { leads: 0, revenue: 0, clients: 0 });
    const weak = (platform.admins || []).filter((a) => checkPassword(a, 'demo'));
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Lightech Console</div><h1>${tr('Companies', 'Company')}</h1><div class="muted small">${tr('Every company gets its own white-label app. Users only ever see their own brand.', 'Setiap company punya app white-label sendiri. User hanya melihat brand-nya.')}</div></div>
        <div class="toolbar"><button class="btn btn-primary" type="button" id="new-co">+ ${tr('New company', 'Company baru')}</button></div>
      </div>
      ${weak.length ? `<div class="notice">${tr('Some Lightech admins still use the default password "demo". Change it under Lightech admins.', 'Ada admin Lightech yang masih memakai password default "demo". Ganti di menu Admin Lightech.')}</div>` : ''}
      <div class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        ${kpi(tr('Companies', 'Company'), list.length, tr(`${list.filter((w) => w.status !== 'suspended').length} active`, `${list.filter((w) => w.status !== 'suspended').length} aktif`), true)}
        ${kpi(tr('Total leads', 'Total lead'), totals.leads, tr('across all companies', 'semua company'))}
        ${kpi('Revenue closed', fmtMoneyShort(totals.revenue), tr('all time', 'sepanjang waktu'))}
        ${kpi(tr('Active clients', 'Client aktif'), totals.clients, tr('in delivery', 'dalam program'))}
      </div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>Company</th><th>${tr('Login code', 'Kode login')}</th><th>Status</th><th class="right">${tr('Users', 'User')}</th><th class="right">Leads</th><th class="right">Won</th><th class="right">Revenue</th><th class="right">${tr('Active clients', 'Client aktif')}</th><th>${tr('Last activity', 'Aktivitas terakhir')}</th><th class="right"></th></tr></thead>
        <tbody>${list.map((w) => { const s = statOf(w.id); const c = w.config || {}; return `<tr>
          <td><div class="row" style="flex-wrap:nowrap"><span class="co-dot" style="background:${esc(c.accent || '#1a4fa0')}">${esc(initials(c.brandName || w.name).slice(0, 1))}</span><div><b>${esc(w.name)}</b><div class="small muted">${esc((window.PRESETS[w.preset] || {}).name || w.preset || '')}</div></div></div></td>
          <td><span class="slug">#${esc(slugOf(w))}</span></td>
          <td>${w.status === 'suspended' ? `<span class="badge badge-red">${tr('Suspended', 'Nonaktif')}</span>` : `<span class="badge badge-green">${tr('Active', 'Aktif')}</span>`}</td>
          <td class="right">${(w.accounts || []).filter((a) => a.role !== 'client').length}</td>
          <td class="right">${s ? s.leads : '…'}</td><td class="right">${s ? s.won : '…'}</td>
          <td class="right nowrap">${s ? fmtMoneyShort(s.revenue) : '…'}</td><td class="right">${s ? s.clients : '…'}</td>
          <td class="small">${s && s.last ? esc(fmtDate(s.last.slice(0, 10))) : '—'}</td>
          <td class="right nowrap"><button class="btn btn-sm btn-primary" type="button" data-co-open="${esc(w.id)}">${tr('Open', 'Buka')}</button> <button class="btn btn-sm" type="button" data-co-edit="${esc(w.id)}">Edit</button></td>
        </tr>`; }).join('') || `<tr><td colspan="10" class="empty">${tr('No companies yet. Create the first one.', 'Belum ada company. Buat yang pertama.')}</td></tr>`}</tbody>
      </table></div></div>
      <div class="hint mt">${tr('Give each company its own link: the app link followed by its login code, for example <span class="slug">…/artifact/…#alphaleaders</span>. They will only see their own brand.', 'Bagikan link khusus per company: link app + kode login, mis. <span class="slug">…/artifact/…#alphaleaders</span>. Mereka hanya melihat brand-nya sendiri.')}</div>`;
    $('#new-co').onclick = companyCreateForm;
    $$('[data-co-open]').forEach((b) => b.onclick = () => openCompany(b.dataset.coOpen));
    $$('[data-co-edit]').forEach((b) => b.onclick = () => companyEditForm(wsIndex.find((w) => w.id === b.dataset.coEdit)));
    const missing = list.filter((w) => !consoleStats[w.id]);
    if (missing.length) Promise.all(missing.map((w) => Backend.stats(w.id).then((s) => { consoleStats[w.id] = s; }).catch(() => { consoleStats[w.id] = { leads: [], sessions: [], clients: [] }; })))
      .then(() => { if (pme && !me && location.hash !== '#admins') renderCompanies(); });
  }

  function slugProblem(sl, selfId) {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(sl)) return tr('Use 3–40 lowercase letters, numbers or dashes.', 'Gunakan 3–40 huruf kecil, angka atau tanda minus.');
    if (window.RESERVED_SLUGS.includes(sl)) return tr('This word is reserved. Choose another code.', 'Kata ini dipakai sistem. Pilih kode lain.');
    if (wsIndex.some((w) => w.id !== selfId && slugOf(w) === sl)) return tr('Another company already uses this code.', 'Kode ini sudah dipakai company lain.');
    return '';
  }

  function companyCreateForm() {
    openModal(tr('New company', 'Company baru'), `
      <div class="grid-2">
        <label class="field"><span>${tr('Company / brand name *', 'Nama company / brand *')}</span><input name="name" id="f-co-name" required placeholder="AlphaLeaders"></label>
        <label class="field"><span>${tr('Login code *', 'Kode login *')}</span><input name="slug" id="f-co-slug" required placeholder="alphaleaders"><div class="hint">${tr('Their link ends with #code', 'Link mereka diakhiri #kode')}</div></label>
        <label class="field"><span>Template</span><select name="preset" id="f-co-preset">${Object.entries(window.PRESETS).map(([k, p]) => `<option value="${k}">${esc(p.name)} · ${esc(p.config.tagline)}</option>`).join('')}</select></label>
        <label class="field"><span>${tr('Owner name *', 'Nama owner *')}</span><input name="ownerName" id="f-co-owner" required></label>
        <label class="field"><span>${tr('Owner email *', 'Email owner *')}</span><input name="ownerEmail" id="f-co-email" type="email" required></label>
        <label class="field"><span>${tr('Owner password *', 'Password owner *')}</span><input name="ownerPw" id="f-co-pw" required value="${esc(Math.random().toString(36).slice(2, 10))}"></label>
      </div>
      <label class="check mt"><input type="checkbox" name="demo" id="f-co-demo"> ${tr('Add example data and a demo team (can be deleted later)', 'Isi contoh data & tim demo (bisa dihapus nanti)')}</label>
      ${modalFoot(tr('Create company', 'Buat company'))}`,
    async (fd) => {
      const v = Object.fromEntries(fd.entries());
      const sl = slugify(v.slug);
      const prob = slugProblem(sl);
      if (prob) { toast(prob); return false; }
      const d = buildWorkspace(v.preset, !!v.demo, v.name.trim(), sl);
      let owner = d.accounts.find((a) => a.role === 'superadmin');
      if (!owner) { owner = { id: uid('u'), role: 'superadmin', active: true }; d.accounts.unshift(owner); }
      Object.assign(owner, { name: v.ownerName.trim(), email: v.ownerEmail.trim().toLowerCase() });
      setPassword(owner, v.ownerPw);
      if (!v.demo) { d.accounts = [owner]; d.config.demoLogin = false; }
      showLoading(tr('Creating company…', 'Membuat company…'));
      await Backend.create(d);
      consoleStats[d.id] = { leads: d.leads, sessions: d.sessions, clients: d.clients };
      renderConsole();
      toast(tr(`${d.name} created. Login code: #${sl}`, `${d.name} dibuat. Kode login: #${sl}`));
    });
    $('#f-co-name').oninput = (e) => { $('#f-co-slug').value = slugify(e.target.value); };
  }

  function companyEditForm(w) {
    const owner = (w.accounts || []).find((a) => a.role === 'superadmin');
    openModal(tr('Edit company', 'Edit company') + ' · ' + w.name, `
      <div class="grid-2">
        <label class="field"><span>${tr('Company name', 'Nama company')}</span><input name="name" id="f-ce-name" required value="${esc(w.name)}"></label>
        <label class="field"><span>${tr('Login code', 'Kode login')}</span><input name="slug" id="f-ce-slug" required value="${esc(slugOf(w))}"></label>
        <label class="field"><span>Status</span><select name="status" id="f-ce-status">${options([['active', tr('Active', 'Aktif')], ['suspended', tr('Suspended (sign-in blocked)', 'Nonaktif (login diblokir)')]], w.status || 'active', (x) => x[0], (x) => x[1])}</select></label>
        <label class="field"><span>${tr('Reset owner password', 'Reset password owner')}${owner ? ' · ' + esc(owner.email) : ''}</span><input name="ownerPw" id="f-ce-pw" placeholder="${esc(tr('Leave empty to keep', 'Kosongkan jika tidak diganti'))}"></label>
      </div>
      <div class="modal-foot">${pme.role === 'owner' ? `<button type="button" class="btn btn-danger" id="co-del">${tr('Delete company', 'Hapus company')}</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close-modal>${tr('Cancel', 'Batal')}</button><button type="submit" class="btn btn-primary">${tr('Save', 'Simpan')}</button></div>`,
    async (fd) => {
      const v = Object.fromEntries(fd.entries());
      const sl = slugify(v.slug);
      const prob = slugProblem(sl, w.id);
      if (prob) { toast(prob); return false; }
      const accounts = clone(w.accounts || []);
      if (v.ownerPw) { const o = accounts.find((a) => a.role === 'superadmin'); if (o) setPassword(o, v.ownerPw); }
      await Backend.saveMeta(w.id, { name: v.name.trim(), slug: sl, status: v.status, accounts });
      renderConsole(); toast(tr('Company saved', 'Company disimpan'));
    });
    const del = $('#co-del');
    if (del) del.onclick = () => confirmDialog(tr('Delete company?', 'Hapus company?'), tr(`${w.name} and all of its data will be deleted permanently.`, `${w.name} beserta seluruh datanya akan dihapus permanen.`), tr('Delete permanently', 'Hapus permanen'), async () => {
      showLoading(tr('Deleting…', 'Menghapus…'));
      await Backend.remove(w.id); delete consoleStats[w.id];
      renderConsole(); toast(tr('Company deleted', 'Company dihapus'));
    });
  }

  function renderAdmins() {
    const list = platform.admins || [];
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Lightech Console</div><h1>${tr('Lightech admins', 'Admin Lightech')}</h1><div class="muted small">${tr('People at Lightech who can see and manage every company.', 'Tim Lightech yang bisa melihat & mengelola semua company.')}</div></div>
        ${pme.role === 'owner' ? '<div class="toolbar"><button class="btn btn-primary" type="button" id="add-admin">+ Admin</button></div>' : ''}
      </div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>${tr('Name', 'Nama')}</th><th>Email</th><th>${tr('Role', 'Peran')}</th><th>Status</th><th class="right"></th></tr></thead>
        <tbody>${list.map((a) => `<tr>
          <td><div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(a.name))}</span><b>${esc(a.name)}</b>${a.id === pme.id ? ` <span class="badge badge-blue">${tr('You', 'Anda')}</span>` : ''}</div></td>
          <td class="small">${esc(a.email)}</td>
          <td><span class="badge">${a.role === 'owner' ? 'Super Admin' : 'Admin'}</span></td>
          <td>${a.active !== false ? `<span class="badge badge-green">${tr('Active', 'Aktif')}</span>` : `<span class="badge">${tr('Inactive', 'Nonaktif')}</span>`}${checkPassword(a, 'demo') ? ` <span class="badge badge-amber">${tr('default password', 'password default')}</span>` : ''}</td>
          <td class="right">${pme.role === 'owner' || a.id === pme.id ? `<button class="btn btn-sm" type="button" data-admin-edit="${esc(a.id)}">Edit</button>` : ''}</td>
        </tr>`).join('')}</tbody>
      </table></div></div>`;
    if ($('#add-admin')) $('#add-admin').onclick = () => adminForm();
    $$('[data-admin-edit]').forEach((b) => b.onclick = () => adminForm(list.find((a) => a.id === b.dataset.adminEdit)));
  }

  function adminForm(a) {
    const isNew = !a;
    const d = a || { role: 'admin', active: true };
    const self = !isNew && a.id === pme.id;
    openModal(isNew ? tr('New Lightech admin', 'Admin Lightech baru') : tr('Edit admin', 'Edit admin') + ' · ' + d.name, `
      <div class="grid-2">
        <label class="field"><span>${tr('Name *', 'Nama *')}</span><input name="name" id="f-ad-name" required value="${esc(d.name || '')}"></label>
        <label class="field"><span>Email *</span><input name="email" id="f-ad-email" type="email" required value="${esc(d.email || '')}"></label>
        <label class="field"><span>${tr('Role', 'Peran')}</span><select name="role" id="f-ad-role" ${pme.role !== 'owner' || self ? 'disabled' : ''}>${options([['owner', 'Super Admin'], ['admin', 'Admin']], d.role, (x) => x[0], (x) => x[1])}</select></label>
        <label class="field"><span>Status</span><select name="active" id="f-ad-active" ${self ? 'disabled' : ''}>${options([['1', tr('Active', 'Aktif')], ['0', tr('Inactive', 'Nonaktif')]], d.active === false ? '0' : '1', (x) => x[0], (x) => x[1])}</select></label>
        <label class="field"><span>${isNew ? 'Password *' : tr('New password', 'Password baru')}</span><input name="password" id="f-ad-pw" ${isNew ? 'required' : ''} placeholder="${isNew ? '' : esc(tr('Leave empty to keep', 'Kosongkan jika tidak diganti'))}"></label>
      </div>
      ${modalFoot(tr('Save', 'Simpan'))}`,
    async (fd) => {
      const v = Object.fromEntries(fd.entries());
      const email = v.email.trim().toLowerCase();
      if ((platform.admins || []).some((x) => x !== a && (x.email || '').toLowerCase() === email)) { toast(tr('Email already used', 'Email sudah dipakai')); return false; }
      if (v.password && v.password.length < 6) { toast(tr('Password needs at least 6 characters', 'Password minimal 6 karakter')); return false; }
      const t = a || { id: uid('lt') };
      Object.assign(t, { name: v.name.trim(), email, role: v.role || d.role, active: v.active !== '0' });
      if (v.password) setPassword(t, v.password);
      if (isNew) platform.admins.push(t);
      await savePlatform();
      renderConsole(); toast(tr('Admin saved', 'Admin disimpan'));
    });
  }

  // =====================================================================
  // Dashboard
  // =====================================================================
  function inPeriod(iso) {
    if (!iso) return false;
    if (ui.period === 'all') return true;
    if (ui.period === 'month') { const d = new Date(iso), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }
    return Date.now() - new Date(iso).getTime() <= Number(ui.period) * DAY;
  }
  function reachedIdx(l) {
    let max = -1;
    const visit = (id) => { if (stage(id).type !== 'lost') max = Math.max(max, stageIdx(id)); };
    l.history.forEach((h) => visit(h.to)); visit(l.stageId);
    return max;
  }
  const actionItem = (l, badge, text) => `<div class="list-item clickable" data-open-lead="${esc(l.id)}">
      <div class="grow"><div class="ellipsis"><b>${esc(l.name)}</b> <span class="muted small">${esc(l.company || '')}</span></div><div class="small muted ellipsis">${esc(text)} · ${esc(accName(l.ownerId))}</div></div>${badge}</div>`;
  function topReasons(list) {
    const c = {};
    list.forEach((l) => { const k = l.lostReason || tr('Other', 'Lainnya'); c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${esc(k)} (${v})`).join(', ');
  }

  function renderDashboard() {
    const leads = visibleLeads();
    const cohort = leads.filter((l) => inPeriod(l.createdAt));
    const wonP = leads.filter((l) => isWon(l) && inPeriod(l.wonAt));
    const lostP = leads.filter((l) => isLost(l) && inPeriod(l.lostAt));
    const openAll = leads.filter(isOpen);
    const pipeVal = openAll.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const weighted = openAll.reduce((a, l) => a + (Number(l.value) || 0) * (stage(l.stageId).prob || 0) / 100, 0);
    const revenue = wonP.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const cycle = wonP.length ? Math.round(wonP.reduce((a, l) => a + Math.max(0, daysBetween(l.createdAt, l.wonAt)), 0) / wonP.length) : 0;
    const today = todayISO();
    const overdue = openAll.filter((l) => l.nextActionDate && l.nextActionDate < today);
    const stuck = openAll.filter((l) => { const sla = stage(l.stageId).sla; return sla > 0 && daysBetween(stageEnteredAt(l), new Date()) > sla; });
    const noAction = openAll.filter((l) => !l.nextActionDate);
    const activeClients = visibleClients().filter((c) => c.status === 'active');
    const idleClients = activeClients.filter((c) => clientProgress(c).idle);
    const funnelStages = openStages().concat(wonStage() ? [wonStage()] : []);
    const funnel = funnelStages.map((s) => ({ s, n: cohort.filter((l) => reachedIdx(l) >= stageIdx(s.id)).length }));
    const bySource = {};
    cohort.forEach((l) => {
      const k = l.source || '—';
      bySource[k] = bySource[k] || { leads: 0, won: 0, rev: 0 };
      bySource[k].leads++;
      if (isWon(l)) { bySource[k].won++; bySource[k].rev += Number(l.value) || 0; }
    });
    const srcRows = Object.entries(bySource).sort((a, b) => b[1].rev - a[1].rev || b[1].leads - a[1].leads);
    const board = {};
    S.leads.forEach((l) => {
      const k = l.ownerId || '';
      board[k] = board[k] || { leads: 0, open: 0, won: 0, lost: 0, rev: 0 };
      if (inPeriod(l.createdAt)) board[k].leads++;
      if (isOpen(l)) board[k].open++;
      if (isWon(l) && inPeriod(l.wonAt)) { board[k].won++; board[k].rev += Number(l.value) || 0; }
      if (isLost(l) && inPeriod(l.lostAt)) board[k].lost++;
    });
    const boardRows = Object.entries(board).sort((a, b) => b[1].rev - a[1].rev || b[1].won - a[1].won || b[1].leads - a[1].leads);
    const vs = visibleSessions();
    const upcoming = vs.filter((s) => s.status === 'scheduled' && s.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
    const todayCount = vs.filter((s) => s.status === 'scheduled' && s.date === today).length;
    const periodBtn = (v, t) => `<button type="button" class="${ui.period === v ? 'on' : ''}" data-period="${v}">${t}</button>`;
    const lastFunnel = funnel.length ? funnel[funnel.length - 1].n : 0;
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${esc(S.config.brandName)}</div><h1>Dashboard</h1></div>
        <div class="seg" id="period">${periodBtn('month', tr('This month', 'Bulan ini'))}${periodBtn('30', tr('30 days', '30 hari'))}${periodBtn('90', tr('90 days', '90 hari'))}${periodBtn('all', tr('All', 'Semua'))}</div>
      </div>
      ${scopeNote()}
      <div class="kpis">
        ${kpi(tr(`New ${L('leads')}`, `${L('leads')} masuk`), cohort.length, tr(`${openAll.length} still open in pipeline`, `${openAll.length} masih aktif di pipeline`), true)}
        ${kpi(tr('Open pipeline', 'Pipeline aktif'), fmtMoneyShort(pipeVal), `Weighted ${fmtMoneyShort(weighted)}`)}
        ${kpi(tr('Deals won', 'Deal won'), wonP.length, tr(`${lostP.length} lost in this period`, `${lostP.length} lost di periode ini`))}
        ${kpi('Revenue closed', fmtMoneyShort(revenue), wonP.length ? tr(`Avg ${fmtMoneyShort(revenue / wonP.length)} / deal`, `Rata-rata ${fmtMoneyShort(revenue / wonP.length)}/deal`) : tr('No deals yet', 'Belum ada deal'))}
        ${kpi('Win rate', pct(wonP.length, wonP.length + lostP.length) + '%', tr(`Lead→Deal ${pct(lastFunnel, cohort.length)}% · cycle ${cycle || '—'} days`, `Lead→Deal ${pct(lastFunnel, cohort.length)}% · cycle ${cycle || '—'} hari`))}
        ${kpi(tr(`Active ${L('clients')}`, `${L('clients')} aktif`), activeClients.length, tr(`${todayCount} ${L('sessions')} today`, `${todayCount} ${L('sessions')} hari ini`))}
      </div>
      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Funnel conversion</div><div class="muted small">${esc(tr(`${L('leads')} that reached each stage (created in this period)`, `${L('leads')} yang pernah mencapai tiap stage (masuk di periode ini)`))}</div></div></div>
          ${cohort.length ? funnel.map((f, i) => {
            const prev = i ? funnel[i - 1].n : f.n;
            return `<div class="funnel-row">
              <div class="funnel-name" title="${esc(f.s.name)}">${esc(f.s.name)}</div>
              <div class="funnel-track"><div class="funnel-bar" style="width:${Math.max(pct(f.n, cohort.length), 4)}%;background:${esc(f.s.color)}">${f.n}</div></div>
              <div class="funnel-conv">${i ? `<b>${pct(f.n, prev)}%</b> ${tr('passed', 'lolos')}` : '<b>100%</b>'}</div>
            </div>`;
          }).join('') : `<div class="empty">${esc(tr(`No ${L('leads')} in this period yet. Click + ${L('lead')} above to start.`, `Belum ada ${L('leads')} di periode ini. Klik + ${L('lead')} di atas untuk mulai.`))}</div>`}
          ${lostP.length ? `<div class="mt small muted">${tr('Top lost reasons', 'Alasan lost terbanyak')}: ${topReasons(lostP)}</div>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">${tr('Needs action', 'Butuh aksi')}</div><a class="small" href="#leads">${tr('All', 'Semua')} ${esc(L('leads'))}</a></div>
          <div class="list">
            ${overdue.length + stuck.length + noAction.length + idleClients.length === 0 ? `<div class="empty">${tr('All clear. The pipeline is healthy.', 'Semua beres. Pipeline sehat.')}</div>` : ''}
            ${overdue.slice(0, 5).map((l) => actionItem(l, `<span class="badge badge-red">${tr('Late', 'Telat')} ${dd(daysBetween(l.nextActionDate, today))}</span>`, l.nextAction || 'Follow up')).join('')}
            ${stuck.filter((l) => !overdue.includes(l)).slice(0, 4).map((l) => actionItem(l, `<span class="badge badge-amber">${tr('Idle', 'Diam')} ${dd(daysBetween(stageEnteredAt(l), new Date()))}</span>`, tr(`${stage(l.stageId).name} is past its ${stage(l.stageId).sla}-day SLA`, `${stage(l.stageId).name} melewati SLA ${stage(l.stageId).sla} hari`))).join('')}
            ${noAction.filter((l) => !stuck.includes(l)).slice(0, 3).map((l) => actionItem(l, `<span class="badge">${tr('No next step', 'Tanpa next step')}</span>`, tr('No next action set', 'Belum ada next action'))).join('')}
            ${idleClients.slice(0, 3).map((c) => `<div class="list-item clickable" data-open-client="${esc(c.id)}"><div class="grow"><div class="ellipsis"><b>${esc(c.name)}</b> <span class="muted small">${esc(L('client'))}</span></div><div class="small muted">${esc(tr(`No ${L('session')} in the last 30 days`, `Tidak ada ${L('session')} 30 hari terakhir`))} · ${esc(accName(c.coachId))}</div></div><span class="badge badge-amber">${tr('Churn risk', 'Risiko churn')}</span></div>`).join('')}
          </div>
        </div>
      </div>
      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Leaderboard ${esc(L('owner'))}</div><div class="muted small">${tr('Ranked by revenue closed, the basis for SUKA & Self Compensation', 'Ranking revenue closed, dasar SUKA & Self Compensation')}</div></div></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>${tr('Name', 'Nama')}</th><th class="right">${esc(L('leads'))}</th><th class="right">${tr('Open', 'Aktif')}</th><th class="right">Won</th><th class="right">Win %</th><th class="right">Revenue</th></tr></thead>
            <tbody>${boardRows.map(([id, b], i) => `<tr>
              <td class="rank ${i === 0 ? 'rank-1' : ''}">${i === 0 ? '★' : i + 1}</td>
              <td><b>${esc(accName(id))}</b>${me && id === me.id ? ` <span class="badge badge-blue">${tr('You', 'Anda')}</span>` : ''}</td>
              <td class="right">${b.leads}</td><td class="right">${b.open}</td><td class="right">${b.won}</td>
              <td class="right">${pct(b.won, b.won + b.lost)}%</td><td class="right nowrap"><b>${fmtMoneyShort(b.rev)}</b></td></tr>`).join('') || `<tr><td colspan="7" class="empty">${tr('No data yet', 'Belum ada data')}</td></tr>`}
            </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><div class="card-title">${esc(tr(`Upcoming ${L('sessions')}`, `${L('sessions')} mendatang`))}</div><a class="small" href="#sessions">${tr('Full schedule', 'Jadwal lengkap')}</a></div>
          <div class="list">
            ${upcoming.map((s) => { const l = lead(s.leadId); return `<div class="list-item">
              <div style="width:64px" class="small"><b>${s.date === today ? tr('Today', 'Hari ini') : esc(fmtShortDate(s.date))}</b><div class="muted">${esc(s.time)}</div></div>
              <div class="grow"><div class="ellipsis"><b>${esc(l ? l.name : '—')}</b></div><div class="small muted ellipsis">${esc(stype(s.typeId).name)} · ${esc(accName(s.mentorId))}</div></div>
              ${l && l.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waReminder(s)}">WA</a>` : ''}
            </div>`; }).join('') || `<div class="empty">${tr('Nothing scheduled yet.', 'Belum ada jadwal mendatang.')}</div>`}
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div class="card-title">${esc(tr(`Performance by ${L('lead')} source`, `Performa per sumber ${L('lead')}`))}</div><div class="muted small">${tr('Put budget into the channels that close, not the noisiest ones', 'Taruh budget di channel yang closing, bukan yang paling ramai')}</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>${tr('Source', 'Sumber')}</th><th class="right">${esc(L('leads'))}</th><th class="right">Won</th><th class="right">${tr('Conversion', 'Konversi')}</th><th class="right">Revenue</th></tr></thead>
          <tbody>${srcRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="right">${v.leads}</td><td class="right">${v.won}</td><td class="right">${pct(v.won, v.leads)}%</td><td class="right nowrap">${fmtMoneyShort(v.rev)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">${tr('No data yet', 'Belum ada data')}</td></tr>`}</tbody>
        </table></div>
      </div>`;
    $$('#period button').forEach((b) => b.onclick = () => { ui.period = b.dataset.period; renderDashboard(); });
    bindOpeners();
  }

  // =====================================================================
  // Pipeline
  // =====================================================================
  function renderPipeline() {
    const q = ui.pipeSearch.toLowerCase();
    const list = visibleLeads().filter((l) => (!ui.pipeOwner || l.ownerId === ui.pipeOwner) &&
      (!q || (l.name + ' ' + (l.company || '') + ' ' + (l.phone || '')).toLowerCase().includes(q)));
    const today = todayISO();
    const editable = can.editLead();
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Lead → Deal</div><h1>Pipeline</h1><div class="muted small">${tr('Drag cards between columns, or change the stage from the dropdown on each card', 'Geser kartu antar kolom, atau ganti stage lewat dropdown di kartu')}</div></div>
        <div class="toolbar">
          <input id="pipe-search" type="search" placeholder="${esc(tr('Search name / company / phone', 'Cari nama / perusahaan / HP'))}" value="${esc(ui.pipeSearch)}">
          ${R() === 'bd' ? '' : `<select id="pipe-owner">${options(ownersList(), ui.pipeOwner, (m) => m.id, (m) => m.name, tr(`All ${L('owner')}`, `Semua ${L('owner')}`))}</select>`}
          ${isStaff() ? `<button class="btn btn-primary" type="button" data-new-lead>+ ${esc(L('lead'))}</button>` : ''}
        </div>
      </div>
      ${scopeNote()}
      <div class="board">
        ${stages().map((s) => {
          const items = list.filter((l) => l.stageId === s.id)
            .sort((a, b) => s.type === 'open' ? (a.nextActionDate || '9999').localeCompare(b.nextActionDate || '9999') : (b.updatedAt || '').localeCompare(a.updatedAt || ''));
          const shown = s.type === 'open' ? items : items.slice(0, 25);
          const sum = items.reduce((a, l) => a + (Number(l.value) || 0), 0);
          return `<div class="col" data-stage="${esc(s.id)}" style="--c:${esc(s.color)}">
            <div class="col-head">
              <div class="col-title"><span class="ellipsis">${esc(s.name)}</span><span class="badge">${items.length}</span></div>
              <div class="col-sum">${fmtMoneyShort(sum)}${s.type === 'open' ? ` · prob ${s.prob}%` : ''}</div>
            </div>
            <div class="col-body">
              ${shown.map((l) => leadCard(l, today, editable)).join('') || `<div class="empty">${tr('Empty', 'Kosong')}</div>`}
              ${items.length > shown.length ? `<div class="empty">${esc(tr(`+${items.length - shown.length} more in the ${L('leads')} tab`, `+${items.length - shown.length} lainnya di tab ${L('leads')}`))}</div>` : ''}
            </div></div>`;
        }).join('')}
      </div>`;
    const s = $('#pipe-search');
    s.oninput = () => { ui.pipeSearch = s.value; const pos = s.selectionStart; renderPipeline(); const n = $('#pipe-search'); n.focus(); n.setSelectionRange(pos, pos); };
    if ($('#pipe-owner')) $('#pipe-owner').onchange = (e) => { ui.pipeOwner = e.target.value; renderPipeline(); };
    $$('.lcard select').forEach((sel) => {
      sel.onclick = (e) => e.stopPropagation();
      sel.onchange = (e) => { e.stopPropagation(); const v = sel.value; renderPipeline(); requestStageChange(sel.dataset.lead, v, renderPipeline); };
    });
    if (editable) {
      $$('.lcard').forEach((c) => {
        c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.openLead); c.classList.add('dragging'); });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
      });
      $$('.col').forEach((col) => {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
        col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
        col.addEventListener('drop', (e) => {
          e.preventDefault(); col.classList.remove('drop-target');
          const id = e.dataTransfer.getData('text/plain');
          if (id) requestStageChange(id, col.dataset.stage, renderPipeline);
        });
      });
    }
    bindOpeners();
  }
  function leadCard(l, today, editable) {
    const s = stage(l.stageId);
    const overdue = s.type === 'open' && l.nextActionDate && l.nextActionDate < today;
    const days = daysBetween(stageEnteredAt(l), new Date());
    const stuck = s.type === 'open' && s.sla > 0 && days > s.sla;
    const next = S.sessions.filter((x) => x.leadId === l.id && x.status === 'scheduled' && x.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return `<div class="lcard" ${editable ? 'draggable="true"' : ''} data-open-lead="${esc(l.id)}">
      <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
        <div style="min-width:0"><div class="lcard-name ellipsis">${esc(l.name)}</div><div class="lcard-sub ellipsis">${esc(l.company || l.source || '')}</div></div>
        <span class="badge" title="${esc(accName(l.ownerId))}">${esc(initials(accName(l.ownerId)))}</span>
      </div>
      ${next ? `<div class="tiny" style="margin-top:6px">📅 ${esc(stype(next.typeId).name)} · ${esc(next.date === today ? tr('Today', 'Hari ini') : fmtShortDate(next.date))} ${esc(next.time)}</div>` : ''}
      ${s.type === 'open' && l.nextActionDate ? `<div class="tiny" style="margin-top:4px;color:${overdue ? 'var(--danger)' : 'var(--muted)'}">Next: ${esc(l.nextAction || 'Follow up')} · ${esc(fmtShortDate(l.nextActionDate))}</div>` : ''}
      ${s.type === 'lost' && l.lostReason ? `<div class="tiny muted" style="margin-top:4px">${tr('Reason', 'Alasan')}: ${esc(l.lostReason)}</div>` : ''}
      <div class="lcard-meta">
        <span class="lcard-value">${fmtMoneyShort(l.value)}</span>
        <span>${stuck ? `<span class="badge badge-amber">${dd(days)} ${tr('in stage', 'di stage')}</span>` : `<span class="muted">${dd(days)}</span>`}</span>
      </div>
      ${editable ? `<select data-lead="${esc(l.id)}" aria-label="${esc(tr('Move stage', 'Pindah stage'))}">${options(stages(), l.stageId, (x) => x.id, (x) => '→ ' + x.name)}</select>` : ''}
    </div>`;
  }

  // =====================================================================
  // Leads table
  // =====================================================================
  function renderLeads() {
    const q = ui.leadSearch.toLowerCase();
    const list = visibleLeads().filter((l) =>
      (!ui.leadStage || l.stageId === ui.leadStage) && (!ui.leadOwner || l.ownerId === ui.leadOwner) && (!ui.leadSource || l.source === ui.leadSource) &&
      (!q || [l.name, l.company, l.phone, l.email, l.notes].join(' ').toLowerCase().includes(q))
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const today = todayISO();
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">Database</div><h1>${esc(L('leads'))}</h1><div class="muted small">${tr(`${list.length} of ${visibleLeads().length} records`, `${list.length} dari ${visibleLeads().length} data`)}</div></div>
        <div class="toolbar">
          <button class="btn" type="button" id="btn-csv">Export CSV</button>
          ${isStaff() ? `<button class="btn btn-primary" type="button" data-new-lead>+ ${esc(L('lead'))}</button>` : ''}
        </div>
      </div>
      ${scopeNote()}
      <div class="toolbar" style="margin-bottom:12px">
        <input id="lead-search" type="search" placeholder="${esc(tr('Search name, company, phone, email, notes', 'Cari nama, perusahaan, HP, email, catatan'))}" value="${esc(ui.leadSearch)}" style="min-width:220px">
        <select id="lead-stage-f">${options(stages(), ui.leadStage, (s) => s.id, (s) => s.name, tr('All stages', 'Semua stage'))}</select>
        ${R() === 'bd' ? '' : `<select id="lead-owner-f">${options(ownersList(), ui.leadOwner, (m) => m.id, (m) => m.name, tr(`All ${L('owner')}`, `Semua ${L('owner')}`))}</select>`}
        <select id="lead-source-f">${options(S.config.sources, ui.leadSource, (x) => x, (x) => x, tr('All sources', 'Semua sumber'))}</select>
      </div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>${tr('Name', 'Nama')}</th><th>Stage</th><th>${esc(L('program'))}</th><th class="right">${tr('Value', 'Nilai')}</th><th>${tr('Source', 'Sumber')}</th><th>${esc(L('owner'))}</th><th>Next action</th><th>${tr('Created', 'Masuk')}</th></tr></thead>
        <tbody>${list.map((l) => `<tr class="clickable" data-open-lead="${esc(l.id)}">
          <td><b>${esc(l.name)}</b><div class="small muted">${esc(l.company || '')}${l.company && l.phone ? ' · ' : ''}${esc(l.phone || '')}</div></td>
          <td>${pillStage(l.stageId)}</td>
          <td class="small">${esc((program(l.programId) || {}).name || '—')}</td>
          <td class="right nowrap">${fmtMoneyShort(l.value)}</td>
          <td class="small">${esc(l.source || '—')}</td>
          <td class="small">${esc(accName(l.ownerId))}</td>
          <td class="small">${isOpen(l) && l.nextActionDate ? `<span style="color:${l.nextActionDate < today ? 'var(--danger)' : 'inherit'}">${esc(fmtDate(l.nextActionDate))}</span><div class="muted">${esc(l.nextAction || '')}</div>` : '<span class="muted">—</span>'}</td>
          <td class="small nowrap">${esc(fmtDate(l.createdAt))}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="empty">${esc(tr(`No records yet. Click + ${L('lead')} to start.`, `Belum ada data. Klik + ${L('lead')} untuk mulai.`))}</td></tr>`}</tbody>
      </table></div></div>`;
    const s = $('#lead-search');
    s.oninput = () => { ui.leadSearch = s.value; const pos = s.selectionStart; renderLeads(); const n = $('#lead-search'); n.focus(); n.setSelectionRange(pos, pos); };
    $('#lead-stage-f').onchange = (e) => { ui.leadStage = e.target.value; renderLeads(); };
    if ($('#lead-owner-f')) $('#lead-owner-f').onchange = (e) => { ui.leadOwner = e.target.value; renderLeads(); };
    $('#lead-source-f').onchange = (e) => { ui.leadSource = e.target.value; renderLeads(); };
    $('#btn-csv').onclick = () => exportCSV(list);
    bindOpeners();
  }

  // =====================================================================
  // Sessions
  // =====================================================================
  function renderSessions() {
    const today = todayISO();
    const f = ui.sessFilter;
    const base = visibleSessions();
    const list = base.filter((s) => (!ui.sessType || s.typeId === ui.sessType) && (!ui.sessMentor || s.mentorId === ui.sessMentor) && (
      f === 'all' ? true : f === 'today' ? s.date === today : f === 'upcoming' ? s.status === 'scheduled' && s.date >= today :
      f === 'missed' ? s.status === 'scheduled' && s.date < today : s.status !== 'scheduled'
    )).sort((a, b) => (f === 'upcoming' || f === 'today' ? 1 : -1) * (a.date + a.time).localeCompare(b.date + b.time));
    const missedN = base.filter((s) => s.status === 'scheduled' && s.date < today).length;
    const segBtn = (v, t) => `<button type="button" class="${f === v ? 'on' : ''}" data-sf="${v}">${t}</button>`;
    const ss = SESS_STATUS();
    const statusBadge = (s) => ({
      scheduled: s.date < today ? `<span class="badge badge-red">${tr('Needs update', 'Belum di-update')}</span>` : `<span class="badge badge-blue">${ss.scheduled}</span>`,
      done: `<span class="badge badge-green">${ss.done}</span>`, noshow: '<span class="badge badge-amber">No-show</span>', cancelled: `<span class="badge">${ss.cancelled}</span>`
    }[s.status] || esc(s.status));
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${tr('Schedule', 'Jadwal')}</div><h1>${esc(L('sessions'))}</h1><div class="muted small">${esc(tr(`Funnel & delivery ${L('sessions')} with your ${L('mentors')}`, `${L('sessions')} funnel & delivery bersama ${L('mentors')}`))}</div></div>
        <div class="toolbar">
          <select id="sess-type">${options(S.config.sessionTypes, ui.sessType, (t) => t.id, (t) => t.name, tr('All types', 'Semua jenis'))}</select>
          ${seesAll() ? `<select id="sess-mentor">${options(mentorsList(), ui.sessMentor, (m) => m.id, (m) => m.name, tr(`All ${L('mentors')}`, `Semua ${L('mentors')}`))}</select>` : ''}
          ${can.editSession() ? `<button class="btn btn-primary" type="button" data-new-session>+ ${esc(L('session'))}</button>` : ''}
        </div>
      </div>
      ${scopeNote()}
      <div class="seg" id="sess-seg" style="margin-bottom:12px">${segBtn('upcoming', tr('Upcoming', 'Mendatang'))}${segBtn('today', tr('Today', 'Hari ini'))}${segBtn('missed', tr('Needs update', 'Perlu update') + (missedN ? ' (' + missedN + ')' : ''))}${segBtn('past', tr('History', 'Riwayat'))}${segBtn('all', tr('All', 'Semua'))}</div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>${tr('Date', 'Tanggal')}</th><th>${tr('Type', 'Jenis')}</th><th>${esc(L('lead'))} / ${esc(L('client'))}</th><th>${esc(L('mentor'))}</th><th>Status</th><th class="right">${tr('Actions', 'Aksi')}</th></tr></thead>
        <tbody>${list.map((s) => { const l = lead(s.leadId); const ai = s.actionItems || []; return `<tr>
          <td class="nowrap"><b>${esc(s.date === today ? tr('Today', 'Hari ini') : fmtDate(s.date))}</b><div class="small muted">${esc(s.time)} WIB</div></td>
          <td>${pillType(s.typeId)}</td>
          <td>${l ? `<a href="#" data-open-lead="${esc(l.id)}"><b>${esc(l.name)}</b></a><div class="small">${pillStage(l.stageId)}</div>` : `<span class="muted">${tr('(deleted)', '(dihapus)')}</span>`}</td>
          <td class="small">${esc(accName(s.mentorId))}${s.assistantId ? `<div class="muted">+ ${esc(accName(s.assistantId))}</div>` : ''}</td>
          <td>${statusBadge(s)}${ai.length ? `<div class="tiny muted">Action ${ai.filter((a) => a.done).length}/${ai.length}</div>` : ''}${s.notes ? `<div class="tiny muted" style="max-width:220px">${esc(s.notes)}</div>` : ''}</td>
          <td class="right nowrap">
            ${l && l.phone && s.status === 'scheduled' ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waReminder(s)}">WA reminder</a>` : ''}
            ${can.editSession() && s.status === 'scheduled' ? `<button class="btn btn-sm btn-ok" type="button" data-sess-done="${esc(s.id)}">${tr('Done', 'Selesai')}</button><button class="btn btn-sm" type="button" data-sess-noshow="${esc(s.id)}">No-show</button>` : ''}
            ${can.editSession() ? `<button class="btn btn-sm" type="button" data-sess-edit="${esc(s.id)}">Edit</button>` : ''}
          </td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">${esc(tr(`No ${L('sessions')} for this filter.`, `Tidak ada ${L('sessions')} di filter ini.`))}</td></tr>`}</tbody>
      </table></div></div>`;
    $$('#sess-seg button').forEach((b) => b.onclick = () => { ui.sessFilter = b.dataset.sf; renderSessions(); });
    $('#sess-type').onchange = (e) => { ui.sessType = e.target.value; renderSessions(); };
    if ($('#sess-mentor')) $('#sess-mentor').onchange = (e) => { ui.sessMentor = e.target.value; renderSessions(); };
    bindSessionActions(renderMain);
    bindOpeners();
  }
  function bindSessionActions(rerender) {
    $$('[data-sess-done]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); completeSession(b.dataset.sessDone, rerender); });
    $$('[data-sess-noshow]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation();
      const s = S.sessions.find((x) => x.id === b.dataset.sessNoshow);
      s.status = 'noshow'; save(); toast(tr('Marked as no-show. Remember to reschedule.', 'Ditandai no-show. Jangan lupa reschedule.')); rerender();
    });
    $$('[data-sess-edit]').forEach((b) => b.onclick = (e) => { e.stopPropagation(); sessionForm(S.sessions.find((x) => x.id === b.dataset.sessEdit), null, rerender); });
    $$('[data-action-toggle]').forEach((cb) => cb.onchange = () => {
      const [sid, i] = cb.dataset.actionToggle.split('|');
      const s = S.sessions.find((x) => x.id === sid);
      if (s && s.actionItems[i]) { s.actionItems[i].done = cb.checked; save(); toast(cb.checked ? tr('Action item done', 'Action item selesai') : tr('Action item reopened', 'Action item dibuka lagi')); rerender(); }
    });
  }
  const parseActions = (text, prev) => String(text || '').split('\n').map((x) => x.trim()).filter(Boolean)
    .map((t) => ({ text: t, done: !!((prev || []).find((a) => a.text === t) || {}).done }));

  function completeSession(id, rerender) {
    const s = S.sessions.find((x) => x.id === id);
    const l = lead(s.leadId);
    const t = stype(s.typeId);
    const opens = openStages();
    const curIdx = l ? opens.findIndex((x) => x.id === l.stageId) : -1;
    const nextStage = curIdx >= 0 ? (opens[curIdx + 1] || wonStage()) : null;
    openModal(tr('Complete', 'Selesaikan') + ` ${t.name} · ${l ? l.name : ''}`, `
      <div class="form-stack">
        <label class="field"><span>${esc(tr(`${L('session')} notes / outcome`, `Catatan / hasil ${L('session')}`))}</span><textarea name="notes" id="f-done-notes" placeholder="${esc(tr('Insights, pain points, decisions', 'Insight, pain point, keputusan'))}">${esc(s.notes || '')}</textarea></label>
        <label class="field"><span>${tr('Action items (one per line)', 'Action items (1 per baris)')}</span><textarea name="actions" id="f-done-actions" placeholder="${esc(tr('e.g. Send Q3 financial report', 'Mis. Kirim laporan keuangan Q3'))}">${esc((s.actionItems || []).map((a) => a.text).join('\n'))}</textarea></label>
        ${l && isOpen(l) ? `
          <label class="field"><span>${esc(tr(`Next step for this ${L('lead')}`, `Next step ${L('lead')}`))}</span>
            <select name="next" id="f-done-next">
              <option value="">${tr('Stay in', 'Tetap di')} ${esc(stage(l.stageId).name)}</option>
              ${nextStage ? `<option value="${esc(nextStage.id)}" selected>${tr('Move on', 'Lanjut')} → ${esc(nextStage.name)}</option>` : ''}
              ${lostStage() ? `<option value="${esc(lostStage().id)}">${tr('Not moving forward', 'Tidak lanjut')} → Lost</option>` : ''}
            </select></label>
          <div class="grid-2">
            <label class="field"><span>Next action</span><input name="nextAction" id="f-done-na" value="${esc(nextStage ? tr('Book ', 'Jadwalkan ') + nextStage.name : 'Follow up')}"></label>
            <label class="field"><span>${tr('Date', 'Tanggal')}</span><input name="nextActionDate" id="f-done-nad" type="date" value="${esc(localISO(new Date(Date.now() + 2 * DAY)))}"></label>
          </div>` : ''}
      </div>
      ${modalFoot(tr('Save', 'Simpan'), 'btn-ok')}`,
    (fd) => {
      s.status = 'done'; s.notes = fd.get('notes') || '';
      s.actionItems = parseActions(fd.get('actions'), s.actionItems);
      if (l && isOpen(l)) { l.nextAction = fd.get('nextAction') || ''; l.nextActionDate = fd.get('nextActionDate') || ''; l.updatedAt = new Date().toISOString(); }
      save();
      const nx = fd.get('next');
      if (l && nx) { requestStageChange(l.id, nx, rerender); return; }
      toast(tr(`${t.name} completed`, `${t.name} selesai`));
      rerender();
    });
  }

  // =====================================================================
  // Clients
  // =====================================================================
  function renderClients() {
    const q = ui.clientSearch.toLowerCase();
    const all = visibleClients();
    const list = all.filter((c) => (!ui.clientStatus || c.status === ui.clientStatus) && (!ui.clientCoach || c.coachId === ui.clientCoach) &&
      (!q || [c.name, c.company, c.phone].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
    const cs = CLIENT_STATUS();
    const statusSeg = [['active', cs.active[0]], ['paused', cs.paused[0]], ['completed', cs.completed[0]], ['churned', cs.churned[0]], ['', tr('All', 'Semua')]];
    const nActive = all.filter((c) => c.status === 'active').length;
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${tr('Program delivery', 'Delivery program')}</div><h1>${esc(L('clients'))}</h1><div class="muted small">${esc(tr(`${nActive} active · ${L('session')} progress, action items & program period`, `${nActive} aktif · progress ${L('sessions')}, action items & masa program`))}</div></div>
        <div class="toolbar">
          <input id="client-search" type="search" placeholder="${esc(tr('Search name / company', 'Cari nama / perusahaan'))}" value="${esc(ui.clientSearch)}">
          ${seesAll() ? `<select id="client-coach">${options(mentorsList(), ui.clientCoach, (m) => m.id, (m) => m.name, tr(`All ${L('mentors')}`, `Semua ${L('mentors')}`))}</select>` : ''}
        </div>
      </div>
      ${scopeNote()}
      <div class="seg" id="client-seg" style="margin-bottom:12px">${statusSeg.map(([v, t]) => `<button type="button" class="${ui.clientStatus === v ? 'on' : ''}" data-cs="${v}">${t} (${v ? all.filter((c) => c.status === v).length : all.length})</button>`).join('')}</div>
      <div class="client-grid">
        ${list.map((c) => {
          const p = clientProgress(c); const prog = program(c.programId);
          return `<div class="ccard" data-open-client="${esc(c.id)}">
            <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
              <div style="min-width:0"><div class="lcard-name ellipsis" style="font-size:15px">${esc(c.name)}</div><div class="small muted ellipsis">${esc(prog ? prog.name : '—')}${c.company ? ' · ' + esc(c.company) : ''}</div></div>
              ${clientBadge(c.status)}
            </div>
            <div>
              <div class="row small" style="justify-content:space-between"><span>${esc(L('sessions'))} ${p.done}/${p.total}</span><span class="muted num">${p.pct}%</span></div>
              <div class="progress ${p.pct >= 100 ? 'ok' : ''}"><div style="width:${p.pct}%"></div></div>
            </div>
            <div class="small muted">${esc(L('mentor'))}: <b style="color:var(--ink-2)">${esc(accName(c.coachId))}</b>${c.assistantId ? ' + ' + esc(accName(c.assistantId)) : ''}</div>
            <div class="row small" style="justify-content:space-between">
              <span>${p.next ? `${tr('Next', 'Berikutnya')}: <b>${esc(fmtShortDate(p.next.date))} ${esc(p.next.time)}</b>` : `<span class="muted">${tr('Nothing scheduled', 'Belum ada jadwal berikutnya')}</span>`}</span>
              <span>${p.openActions.length ? `<span class="badge badge-amber">${p.openActions.length} action</span>` : ''} ${p.idle ? `<span class="badge badge-red">${tr('Churn risk', 'Risiko churn')}</span>` : ''}</span>
            </div>
            <div class="tiny muted">Program ${esc(fmtDate(c.startDate))} – ${esc(fmtDate(p.end))}${p.daysLeft != null && c.status === 'active' ? ` · ${p.daysLeft >= 0 ? tr(`renewal in ${p.daysLeft} days`, `renewal ${p.daysLeft} hari lagi`) : tr('past program end', 'lewat masa program')}` : ''}</div>
          </div>`;
        }).join('') || `<div class="card empty" style="grid-column:1/-1">${esc(tr(`No ${L('clients')} for this filter. A ${L('client')} is created automatically when a ${L('lead')} is marked Deal Won.`, `Belum ada ${L('clients')} di filter ini. ${L('client')} otomatis dibuat saat ${L('lead')} ditandai Deal Won.`))}</div>`}
      </div>`;
    const s = $('#client-search');
    s.oninput = () => { ui.clientSearch = s.value; const pos = s.selectionStart; renderClients(); const n = $('#client-search'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('#client-seg button').forEach((b) => b.onclick = () => { ui.clientStatus = b.dataset.cs; renderClients(); });
    if ($('#client-coach')) $('#client-coach').onchange = (e) => { ui.clientCoach = e.target.value; renderClients(); };
    bindOpeners();
  }

  function renderPortal() {
    const c = myClient();
    if (!c) { $('#view').innerHTML = `<div class="card empty">${esc(tr(`Your account is not linked to a ${L('client')} record yet. Contact your admin.`, `Akun Anda belum terhubung ke data ${L('client')}. Hubungi admin.`))}</div>`; return; }
    const p = clientProgress(c); const prog = program(c.programId);
    const ss = S.sessions.filter((s) => s.leadId === c.leadId).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const coach = acc(c.coachId);
    $('#view').innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${esc(tr(`${L('client')} portal`, `Portal ${L('client')}`))}</div><h1>${tr('Hi', 'Halo')}, ${esc(c.name.split(' ')[0])}</h1><div class="muted small">${esc(prog ? prog.name : '')}</div></div></div>
      <div class="dash-grid">
        <div class="card">
          <div class="card-title">${tr('Program progress', 'Progress program')}</div>
          <div class="kpi-value mt">${p.done} / ${p.total} <span class="small muted">${esc(L('sessions'))}</span></div>
          <div class="progress mt ${p.pct >= 100 ? 'ok' : ''}"><div style="width:${p.pct}%"></div></div>
          <dl class="kv mt">
            <dt>${esc(L('mentor'))}</dt><dd>${esc(coach ? coach.name : '—')}${c.assistantId ? ` (${tr('assistant', 'asisten')}: ${esc(accName(c.assistantId))})` : ''}</dd>
            <dt>${tr('Period', 'Periode')}</dt><dd>${esc(fmtDate(c.startDate))} – ${esc(fmtDate(p.end))}</dd>
            <dt>${esc(tr(`Next ${L('session')}`, `${L('session')} berikutnya`))}</dt><dd>${p.next ? `${esc(stype(p.next.typeId).name)} · <b>${esc(fmtDate(p.next.date))} ${esc(p.next.time)} WIB</b>` : tr('Not scheduled yet', 'Belum dijadwalkan')}</dd>
          </dl>
        </div>
        <div class="card">
          <div class="card-title">${tr('My action plan', 'Action plan saya')}</div>
          <div class="actions-list mt">${p.actions.length ? p.actions.map((x) => `<label class="action-item ${x.a.done ? 'done' : ''}"><input type="checkbox" data-action-toggle="${esc(x.s.id)}|${x.i}" ${x.a.done ? 'checked' : ''}><span>${esc(x.a.text)} <span class="muted tiny">· ${esc(fmtShortDate(x.s.date))}</span></span></label>`).join('') : `<div class="empty">${tr('No action items yet.', 'Belum ada action item.')}</div>`}</div>
        </div>
      </div>
      <div class="card mt">
        <div class="card-title">${esc(tr(`${L('session')} history`, `Riwayat ${L('sessions')}`))}</div>
        <div class="list mt">${ss.map((s) => `<div class="list-item"><div class="grow"><div>${pillType(s.typeId)} <span class="small muted">${esc(fmtDate(s.date))} ${esc(s.time)} · ${esc(SESS_STATUS()[s.status] || s.status)}</span></div>${s.notes ? `<div class="small" style="margin-top:4px">${esc(s.notes)}</div>` : ''}</div></div>`).join('') || `<div class="empty">${tr('Nothing yet.', 'Belum ada.')}</div>`}</div>
      </div>`;
    bindSessionActions(renderPortal);
  }

  // =====================================================================
  // Team & access
  // =====================================================================
  function renderTeam() {
    const rows = S.accounts.slice().sort((a, b) => window.ROLE_KEYS.indexOf(a.role) - window.ROLE_KEYS.indexOf(b.role) || a.name.localeCompare(b.name));
    const counts = (a) => {
      if (a.role === 'bd') { const n = S.leads.filter((l) => l.ownerId === a.id && isOpen(l)).length; return tr(`${n} open ${L('leads')}`, `${n} ${L('leads')} aktif`); }
      if (['mentor', 'senior'].includes(a.role)) { const n = S.clients.filter((c) => c.coachId === a.id && c.status === 'active').length; return tr(`${n} active ${L('clients')}`, `${n} ${L('clients')} aktif`); }
      if (a.role === 'assistant') return tr(`assists ${accName(a.mentorId)}`, `asisten ${accName(a.mentorId)}`);
      if (a.role === 'client') return tr('portal access', 'akses portal');
      return '';
    };
    $('#view').innerHTML = `
      <div class="page-head">
        <div><div class="eyebrow">${tr('Team & Access', 'Tim & Akses')}</div><h1>${tr('Accounts & roles', 'Akun & peran')}</h1><div class="muted small">${esc(tr(`Each ${L('mentor')} can have their own assistant. Access follows the role.`, `Setiap ${L('mentor')} bisa punya asisten sendiri. Hak akses mengikuti peran.`))}</div></div>
        <div class="toolbar"><button class="btn btn-primary" type="button" id="add-acc">+ ${tr('Account', 'Akun')}</button></div>
      </div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>${tr('Name', 'Nama')}</th><th>Email</th><th>${tr('Role', 'Peran')}</th><th>${tr('Notes', 'Keterangan')}</th><th>Status</th><th class="right"></th></tr></thead>
        <tbody>${rows.map((a) => `<tr>
          <td><div class="row" style="flex-wrap:nowrap"><span class="avatar">${esc(initials(a.name))}</span><b>${esc(a.name)}</b>${a.id === me.id ? ` <span class="badge badge-blue">${tr('You', 'Anda')}</span>` : ''}</div></td>
          <td class="small">${esc(a.email || '—')}</td>
          <td><span class="badge">${esc(roleName(a.role))}</span></td>
          <td class="small muted">${esc(counts(a))}</td>
          <td>${a.active !== false ? `<span class="badge badge-green">${tr('Active', 'Aktif')}</span>` : `<span class="badge">${tr('Inactive', 'Nonaktif')}</span>`}</td>
          <td class="right"><button class="btn btn-sm" type="button" data-acc-edit="${esc(a.id)}">Edit</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>
      <div class="card mt">
        <div class="card-title">${tr('Permission matrix', 'Matriks hak akses')}</div>
        <div class="hint">${tr('Roles control what each person sees in the app.', 'Peran mengatur apa yang dilihat setiap orang di aplikasi.')}</div>
        <div class="table-wrap mt"><table class="matrix">
          <thead><tr><th>${tr('Capability', 'Kemampuan')}</th>${window.ROLE_KEYS.map((r) => `<th>${esc(roleName(r))}</th>`).join('')}</tr></thead>
          <tbody>${window.PERMISSIONS.map(([en, id, rs]) => `<tr><td class="small">${esc(tr(en, id))}</td>${window.ROLE_KEYS.map((r) => `<td>${rs.includes(r) ? '<span class="yes">✓</span>' : '<span class="no">·</span>'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    $('#add-acc').onclick = () => accountForm();
    $$('[data-acc-edit]').forEach((b) => b.onclick = () => accountForm(acc(b.dataset.accEdit)));
  }

  function accountForm(a) {
    const isNew = !a;
    const d = a || { role: 'bd', active: true };
    const roleChoices = window.ROLE_KEYS.filter((r) => r !== 'superadmin' || R() === 'superadmin' || d.role === 'superadmin');
    openModal(isNew ? tr('New account', 'Akun baru') : tr('Edit account', 'Edit akun') + ' · ' + d.name, `
      <div class="grid-2">
        <label class="field"><span>${tr('Name *', 'Nama *')}</span><input name="name" id="f-acc-name" required value="${esc(d.name || '')}"></label>
        <label class="field"><span>${tr('Email (for sign in) *', 'Email (untuk login) *')}</span><input name="email" id="f-acc-email" type="email" required value="${esc(d.email || '')}"></label>
        <label class="field"><span>${tr('Phone', 'No. HP')}</span><input name="phone" id="f-acc-phone" value="${esc(d.phone || '')}"></label>
        <label class="field"><span>${tr('Role *', 'Peran *')}</span><select name="role" id="f-acc-role">${options(roleChoices, d.role, (r) => r, roleName)}</select></label>
        <label class="field" id="f-acc-mentor-wrap"><span>${esc(tr(`Assistant to ${L('mentor')}`, `Asisten untuk ${L('mentor')}`))}</span><select name="mentorId" id="f-acc-mentor">${options(mentorsList(), d.mentorId, (m) => m.id, (m) => m.name, '—')}</select></label>
        <label class="field" id="f-acc-client-wrap"><span>${esc(tr(`Linked ${L('client')}`, `Terhubung ke ${L('client')}`))}</span><select name="clientId" id="f-acc-client">${options(S.clients, d.clientId, (c) => c.id, (c) => c.name, '—')}</select></label>
        <label class="field"><span>${isNew ? 'Password *' : tr('New password', 'Password baru')}</span><input name="password" id="f-acc-pw" type="text" ${isNew ? 'required' : ''} placeholder="${esc(isNew ? tr('At least 4 characters', 'Min. 4 karakter') : tr('Leave empty to keep', 'Kosongkan jika tidak diganti'))}"></label>
        <label class="field"><span>Status</span><select name="active" id="f-acc-active">${options([['1', tr('Active', 'Aktif')], ['0', tr('Inactive', 'Nonaktif')]], d.active === false ? '0' : '1', (x) => x[0], (x) => x[1])}</select></label>
      </div>
      <div class="warn-text mt" id="f-acc-warn"></div>
      <div class="modal-foot">${!isNew && d.id !== me.id ? `<button type="button" class="btn btn-danger" id="acc-del">${tr('Delete', 'Hapus')}</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close-modal>${tr('Cancel', 'Batal')}</button><button type="submit" class="btn btn-primary">${tr('Save', 'Simpan')}</button></div>`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      const email = v.email.trim().toLowerCase();
      if (S.accounts.some((x) => x !== a && (x.email || '').toLowerCase() === email)) { toast(tr('Email is already used by another account', 'Email sudah dipakai akun lain')); return false; }
      if (v.password && v.password.length < 4) { toast(tr('Password needs at least 4 characters', 'Password minimal 4 karakter')); return false; }
      if (!isNew && d.id === me.id && v.active === '0') { toast(tr('You cannot deactivate your own account', 'Tidak bisa menonaktifkan akun sendiri')); return false; }
      const target = a || { id: uid('u') };
      Object.assign(target, { name: v.name.trim(), email, phone: v.phone, role: v.role, active: v.active !== '0', mentorId: v.role === 'assistant' ? v.mentorId : '', clientId: v.role === 'client' ? v.clientId : '' });
      if (v.password) setPassword(target, v.password);
      if (isNew) S.accounts.push(target);
      if (target.role === 'client' && target.clientId) { const c = client(target.clientId); if (c) c.accountId = target.id; }
      save(); toast(isNew ? tr(`Account for ${target.name} created`, `Akun ${target.name} dibuat`) : tr('Account saved', 'Akun disimpan'));
      renderMain();
    });
    const sync = () => { const r = $('#f-acc-role').value; $('#f-acc-mentor-wrap').hidden = r !== 'assistant'; $('#f-acc-client-wrap').hidden = r !== 'client'; };
    $('#f-acc-role').onchange = sync; sync();
    const del = $('#acc-del');
    if (del) del.onclick = () => {
      const used = S.leads.some((l) => l.ownerId === d.id) || S.sessions.some((s) => s.mentorId === d.id) || S.clients.some((c) => c.coachId === d.id);
      if (used) { $('#f-acc-warn').textContent = tr('This account is still used by leads, sessions or clients. Set it to Inactive instead, or reassign the data first.', 'Akun ini masih dipakai di lead/sesi/client. Ubah status jadi Nonaktif saja, atau pindahkan datanya dulu.'); return; }
      confirmDialog(tr('Delete account?', 'Hapus akun?'), tr(`${d.name} will no longer be able to sign in.`, `${d.name} tidak akan bisa login lagi.`), tr('Delete', 'Hapus'), () => {
        S.accounts = S.accounts.filter((x) => x.id !== d.id);
        S.clients.forEach((c) => { if (c.accountId === d.id) delete c.accountId; });
        save(); toast(tr('Account deleted', 'Akun dihapus')); renderMain();
      });
    };
  }

  // =====================================================================
  // Settings (the company owner configures their own app)
  // =====================================================================
  function renderSettings() {
    const c = S.config;
    const labelKeys = [['lead', 'Lead (singular)', 'Lead (tunggal)'], ['leads', 'Lead (plural)', 'Lead (jamak)'], ['client', 'Client (singular)', 'Client (tunggal)'], ['clients', 'Client (plural)', 'Client (jamak)'], ['mentor', 'Mentor (singular)', 'Mentor (tunggal)'], ['mentors', 'Mentor (plural)', 'Mentor (jamak)'], ['session', 'Session (singular)', 'Session (tunggal)'], ['sessions', 'Session (plural)', 'Session (jamak)'], ['program', 'Program (singular)', 'Program (tunggal)'], ['programs', 'Program (plural)', 'Program (jamak)'], ['owner', 'Sales owner (PIC)', 'PIC / Sales']];
    const leadsIn = (id) => S.leads.filter((l) => l.stageId === id).length;
    const demoCount = S.leads.filter((l) => l.demo).length;
    $('#view').innerHTML = `
      <div class="page-head"><div><div class="eyebrow">${tr('Configure your app', 'Konfigurasi app Anda')}</div><h1>Settings</h1><div class="muted small">${tr('Brand, terminology, funnel & master data. Changes save automatically.', 'Brand, istilah, funnel & master data. Perubahan tersimpan otomatis.')}</div></div></div>
      <div class="settings-grid">
        <div class="card">
          <div class="card-title">Brand</div>
          <div class="form-stack mt">
            <label class="field"><span>${tr('Brand name', 'Nama brand')}</span><input id="set-brand" data-cfg="brandName" value="${esc(c.brandName)}"></label>
            <label class="field"><span>Tagline</span><input id="set-tagline" data-cfg="tagline" value="${esc(c.tagline)}"></label>
            <label class="field"><span>${tr('Brand colour', 'Warna brand')}</span><input id="set-accent" type="color" data-cfg="accent" value="${esc(c.accent)}"></label>
            <label class="check"><input type="checkbox" id="set-demologin" ${c.demoLogin ? 'checked' : ''}> ${tr('Show one-click demo sign-in (turn off before go-live)', 'Tampilkan login demo 1 klik (matikan saat go-live)')}</label>
            <div class="hint">${tr('Your team signs in with the app link ending in', 'Tim Anda login lewat link app yang diakhiri')} <span class="slug">#${esc(S.slug)}</span></div>
          </div>
        </div>
        <div class="card">
          <div class="card-title">${tr('Terminology', 'Istilah')}</div>
          <div class="hint">${tr('Mentor → Coach / Teacher / PT / Consultant. Session → Class / Webinar / Workshop. The whole app follows.', 'Mentor → Coach / Teacher / PT / Consultant. Session → Class / Webinar / Workshop. Semua tampilan ikut berubah.')}</div>
          <div class="grid-2 mt">${labelKeys.map(([k, en, id]) => `<label class="field"><span>${esc(tr(en, id))}</span><input id="set-label-${k}" data-label-key="${k}" value="${esc(c.labels[k] || '')}"></label>`).join('')}</div>
        </div>
        <div class="card full">
          <div class="card-head"><div><div class="card-title">${tr('Funnel stages', 'Stage funnel')}</div><div class="hint">${tr('Order = funnel flow. Prob% drives the weighted pipeline. SLA = max days in a stage before it is flagged idle.', 'Urutan = alur funnel. Prob% untuk weighted pipeline. SLA = maksimal hari di stage sebelum ditandai diam.')}</div></div><button class="btn btn-sm" type="button" id="add-stage">+ Stage</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th></th><th>${tr('Name', 'Nama')}</th><th>${tr('Colour', 'Warna')}</th><th>Prob %</th><th>SLA (${tr('days', 'hari')})</th><th>${tr('Type', 'Tipe')}</th><th>${esc(L('leads'))}</th><th></th></tr></thead><tbody>
            ${c.stages.map((s, i) => `<tr>
              <td>${s.type === 'open' && i > 0 ? `<button class="btn btn-sm" type="button" data-stage-up="${i}" aria-label="Up">↑</button>` : ''}</td>
              <td><input id="stg-name-${i}" data-stage="${i}" data-k="name" value="${esc(s.name)}" style="min-width:150px"></td>
              <td><input id="stg-color-${i}" type="color" data-stage="${i}" data-k="color" value="${esc(s.color)}"></td>
              <td><input id="stg-prob-${i}" type="number" min="0" max="100" data-stage="${i}" data-k="prob" value="${esc(s.prob)}" style="width:72px"></td>
              <td><input id="stg-sla-${i}" type="number" min="0" data-stage="${i}" data-k="sla" value="${esc(s.sla)}" style="width:72px" ${s.type !== 'open' ? 'disabled' : ''}></td>
              <td class="small">${s.type === 'open' ? tr('In progress', 'Proses') : s.type === 'won' ? '<span class="badge badge-green">Won</span>' : '<span class="badge badge-red">Lost</span>'}</td>
              <td class="small">${leadsIn(s.id)}</td>
              <td>${s.type === 'open' ? `<button class="btn btn-sm btn-danger" type="button" data-stage-del="${i}" aria-label="Delete">✕</button>` : ''}</td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="card full">
          <div class="card-head"><div><div class="card-title">${esc(tr(`${L('session')} types`, `Jenis ${L('session')}`))}</div><div class="hint">${esc(tr(`Link a type to a funnel stage: booking it moves the ${L('lead')} to that stage. Leave empty for delivery sessions after the deal.`, `Hubungkan ke stage funnel: saat dijadwalkan, ${L('lead')} otomatis maju ke stage itu. Kosongkan untuk sesi delivery setelah deal.`))}</div></div><button class="btn btn-sm" type="button" id="add-stype">+ ${tr('Type', 'Jenis')}</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th>${tr('Name', 'Nama')}</th><th>${tr('Duration (min)', 'Durasi (mnt)')}</th><th>${tr('Colour', 'Warna')}</th><th>${tr('Funnel stage', 'Stage funnel')}</th><th></th></tr></thead><tbody>
            ${c.sessionTypes.map((t, i) => `<tr>
              <td><input id="st-name-${i}" data-stype="${i}" data-k="name" value="${esc(t.name)}" style="min-width:150px"></td>
              <td><input id="st-dur-${i}" type="number" min="0" data-stype="${i}" data-k="duration" value="${esc(t.duration)}" style="width:90px"></td>
              <td><input id="st-color-${i}" type="color" data-stype="${i}" data-k="color" value="${esc(t.color)}"></td>
              <td><select id="st-stage-${i}" data-stype="${i}" data-k="stageId">${options(openStages(), t.stageId, (s) => s.id, (s) => s.name, tr('— Delivery (after the deal) —', '— Delivery (setelah deal) —'))}</select></td>
              <td><button class="btn btn-sm btn-danger" type="button" data-stype-del="${i}" aria-label="Delete">✕</button></td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="card full">
          <div class="card-head"><div class="card-title">${esc(L('programs'))}</div><button class="btn btn-sm" type="button" id="add-program">+ ${esc(L('program'))}</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th>${tr('Name', 'Nama')}</th><th>Format</th><th>${tr('Price (Rp)', 'Harga (Rp)')}</th><th>${tr('Sessions', 'Jumlah sesi')}</th><th>${tr('Months', 'Bulan')}</th><th></th></tr></thead><tbody>
            ${S.programs.map((p, i) => `<tr>
              <td><input id="pr-name-${i}" data-program="${i}" data-k="name" value="${esc(p.name)}" style="min-width:180px"></td>
              <td><select id="pr-format-${i}" data-program="${i}" data-k="format">${options(['Private', 'Group', 'Online', 'Hybrid'], p.format, (x) => x, (x) => x)}</select></td>
              <td><input id="pr-price-${i}" type="number" min="0" step="1000" data-program="${i}" data-k="price" value="${esc(p.price)}" style="width:130px"></td>
              <td><input id="pr-sess-${i}" type="number" min="0" data-program="${i}" data-k="sessions" value="${esc(p.sessions)}" style="width:80px"></td>
              <td><input id="pr-months-${i}" type="number" min="0" data-program="${i}" data-k="months" value="${esc(p.months)}" style="width:80px"></td>
              <td><button class="btn btn-sm btn-danger" type="button" data-program-del="${i}" aria-label="Delete">✕</button></td></tr>`).join('')}
          </tbody></table></div>
        </div>
        <div class="card">
          <div class="card-title">${esc(tr(`${L('lead')} sources`, `Sumber ${L('lead')}`))}</div><div class="hint">${tr('One per line', 'Satu per baris')}</div>
          <textarea class="mt" id="set-sources" data-list="sources" rows="6">${esc(c.sources.join('\n'))}</textarea>
          <div class="card-title mt">${tr('Lost reasons', 'Alasan lost')}</div>
          <textarea class="mt" id="set-lost" data-list="lostReasons" rows="5">${esc(c.lostReasons.join('\n'))}</textarea>
        </div>
        <div class="card">
          <div class="card-title">${tr('WhatsApp reminder template', 'Template WA reminder')}</div>
          <div class="hint">Placeholder: {name} {type} {mentor} {date} {time} {brand}</div>
          <textarea class="mt" id="set-wa" data-cfg="waTemplate" rows="4">${esc(c.waTemplate)}</textarea>
          <div class="card-title mt">Data</div>
          <div class="hint">${Backend.mode === 'cloud' ? tr('Stored online and synced live for your whole team.', 'Tersimpan online dan sinkron untuk seluruh tim.') : tr('Local mode: stored in this browser only. Back up to JSON regularly.', 'Mode lokal: tersimpan di browser ini saja. Backup JSON rutin.')}</div>
          <div class="row mt">
            <button class="btn" type="button" id="exp-json">Backup JSON</button>
            <label class="btn">Restore JSON<input type="file" id="imp-json" accept="application/json,.json" hidden></label>
            <button class="btn" type="button" id="exp-csv">CSV ${esc(L('leads'))}</button>
          </div>
          <div class="row mt">
            ${demoCount ? `<button class="btn btn-danger" type="button" id="clear-demo">${tr('Delete example data', 'Hapus data contoh')} (${demoCount})</button>` : ''}
            <button class="btn" type="button" id="reset-demo">${tr('Add example data', 'Isi data contoh')}</button>
            <button class="btn btn-danger" type="button" id="clear-data">${tr('Clear all data', 'Kosongkan semua data')}</button>
          </div>
        </div>
      </div>`;
    const reBrand = () => { save(); applyBrand(); };
    $$('[data-cfg]').forEach((el) => el.onchange = () => { c[el.dataset.cfg] = el.value; reBrand(); toast(tr('Saved', 'Tersimpan')); });
    $('#set-demologin').onchange = (e) => { c.demoLogin = e.target.checked; save(); toast(c.demoLogin ? tr('Demo sign-in on', 'Login demo aktif') : tr('Demo sign-in off', 'Login demo dimatikan')); };
    $$('[data-label-key]').forEach((el) => el.onchange = () => { c.labels[el.dataset.labelKey] = el.value || el.dataset.labelKey; reBrand(); renderMain(); toast(tr('Terminology updated', 'Istilah diperbarui')); });
    const num = (k, v) => (['prob', 'sla', 'duration', 'price', 'sessions', 'months'].includes(k) ? Number(v) || 0 : v);
    const bindRows = (attr, arr) => $$(`[data-${attr}]`).forEach((el) => el.onchange = () => { arr()[Number(el.dataset[attr])][el.dataset.k] = num(el.dataset.k, el.value); save(); toast(tr('Saved', 'Tersimpan')); });
    bindRows('stage', () => c.stages); bindRows('stype', () => c.sessionTypes); bindRows('program', () => S.programs);
    $$('[data-list]').forEach((el) => el.onchange = () => { c[el.dataset.list] = el.value.split('\n').map((x) => x.trim()).filter(Boolean); save(); toast(tr('Saved', 'Tersimpan')); });
    $('#add-stage').onclick = () => {
      const lastOpen = c.stages.reduce((a, s, i) => (s.type === 'open' ? i : a), -1);
      c.stages.splice(lastOpen + 1, 0, { id: uid('stg'), name: tr('New stage', 'Stage baru'), color: '#0ea5e9', prob: 50, sla: 5, type: 'open' });
      save(); renderSettings();
    };
    $$('[data-stage-up]').forEach((b) => b.onclick = () => { const i = Number(b.dataset.stageUp); [c.stages[i - 1], c.stages[i]] = [c.stages[i], c.stages[i - 1]]; save(); renderSettings(); });
    $$('[data-stage-del]').forEach((b) => b.onclick = () => {
      const i = Number(b.dataset.stageDel), s = c.stages[i];
      if (leadsIn(s.id)) { toast(tr(`${leadsIn(s.id)} ${L('leads')} are still in this stage. Move them first.`, `Masih ada ${leadsIn(s.id)} ${L('leads')} di stage ini. Pindahkan dulu.`)); return; }
      if (c.stages.filter((x) => x.type === 'open').length <= 1) { toast(tr('Keep at least one in-progress stage', 'Minimal 1 stage proses')); return; }
      c.stages.splice(i, 1); c.sessionTypes.forEach((t) => { if (t.stageId === s.id) t.stageId = ''; }); save(); renderSettings();
    });
    $('#add-stype').onclick = () => { c.sessionTypes.push({ id: uid('st'), name: tr(`New ${L('session')}`, `${L('session')} baru`), duration: 60, color: '#6366f1', stageId: '' }); save(); renderSettings(); };
    $$('[data-stype-del]').forEach((b) => b.onclick = () => {
      const t = c.sessionTypes[Number(b.dataset.stypeDel)];
      if (S.sessions.some((s) => s.typeId === t.id)) { toast(tr('This type is already used in the schedule', 'Jenis ini sudah dipakai di jadwal')); return; }
      c.sessionTypes.splice(Number(b.dataset.stypeDel), 1); save(); renderSettings();
    });
    $('#add-program').onclick = () => { S.programs.push({ id: uid('p'), name: tr(`New ${L('program')}`, `${L('program')} baru`), format: 'Private', price: 0, sessions: 12, months: 12 }); save(); renderSettings(); };
    $$('[data-program-del]').forEach((b) => b.onclick = () => { S.programs.splice(Number(b.dataset.programDel), 1); save(); renderSettings(); });
    $('#exp-json').onclick = () => download(`${slugify(c.brandName)}-backup-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json');
    $('#exp-csv').onclick = () => exportCSV(S.leads);
    $('#imp-json').onchange = (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        let d;
        try { d = JSON.parse(rd.result); if (!d.config || !Array.isArray(d.leads)) throw new Error('format'); } catch (err) { toast(tr('This backup file is not valid', 'File backup tidak valid')); return; }
        confirmDialog('Restore backup?', tr(`All data in "${S.name}" will be replaced with ${f.name}.`, `Data "${S.name}" akan diganti isi file ${f.name}.`), 'Restore', () => {
          const keep = { id: S.id, slug: S.slug, status: S.status, name: S.name };
          S = migrate(Object.assign(d, keep));
          if (!me.platform) { me = S.accounts.find((a) => a.id === me.id) || S.accounts.find((a) => a.role === 'superadmin') || null; if (me) LS.set(K_AUTH(S.id), me.id); }
          save(); applyBrand(); render(); toast(tr('Data restored', 'Data dipulihkan'));
        });
      };
      rd.readAsText(f);
    };
    if ($('#clear-demo')) $('#clear-demo').onclick = () => confirmDialog(tr('Delete example data?', 'Hapus data contoh?'), tr(`${demoCount} example ${L('leads')} and their ${L('sessions')} & ${L('clients')} will be deleted. Data you entered stays.`, `${demoCount} ${L('leads')} contoh beserta ${L('sessions')} & ${L('clients')}-nya akan dihapus. Data yang Anda input sendiri tetap aman.`), tr('Delete example data', 'Hapus data contoh'), () => {
      const ids = new Set(S.leads.filter((l) => l.demo).map((l) => l.id));
      const cids = new Set(S.clients.filter((x) => ids.has(x.leadId)).map((x) => x.id));
      S.leads = S.leads.filter((l) => !ids.has(l.id)); S.sessions = S.sessions.filter((s) => !ids.has(s.leadId)); S.clients = S.clients.filter((x) => !ids.has(x.leadId));
      S.accounts = S.accounts.filter((a) => !(a.role === 'client' && cids.has(a.clientId)));
      save(); toast(tr('Example data deleted. Ready to go live.', 'Data contoh dihapus. Siap go-live.')); renderSettings();
    });
    $('#reset-demo').onclick = () => confirmDialog(tr('Add example data?', 'Isi data contoh?'), tr(`Adds example ${L('leads')}, ${L('sessions')} & ${L('clients')} (marked as examples). Real data is kept.`, `Menambahkan ${L('leads')}, ${L('sessions')} & ${L('clients')} contoh (ditandai demo). Data asli tidak terhapus.`), tr('Add example data', 'Isi data contoh'), () => {
      const tmp = { preset: S.preset + Date.now(), config: S.config, accounts: S.accounts.filter((a) => a.role !== 'client'), programs: S.programs, leads: [], sessions: [], clients: [] };
      seedDemo(tmp);
      S.leads.push(...tmp.leads); S.sessions.push(...tmp.sessions); S.clients.push(...tmp.clients);
      tmp.accounts.filter((a) => a.role === 'client' && !S.accounts.some((x) => x.email === a.email)).forEach((a) => S.accounts.push(a));
      save(); toast(tr('Example data added', 'Data contoh ditambahkan')); location.hash = '#dashboard'; renderMain();
    });
    $('#clear-data').onclick = () => confirmDialog(tr('Clear all data?', 'Kosongkan semua data?'), tr(`ALL ${L('leads')}, ${L('sessions')} & ${L('clients')} in "${S.name}" will be deleted. Accounts, programs & settings stay. Back up to JSON first if unsure.`, `SEMUA ${L('leads')}, ${L('sessions')} & ${L('clients')} di "${S.name}" dihapus. Akun, program & settings tetap. Backup JSON dulu kalau ragu.`), tr('Clear', 'Kosongkan'), () => {
      S.leads = []; S.sessions = []; S.clients = []; S.accounts = S.accounts.filter((a) => a.role !== 'client');
      save(); toast(tr('Data cleared', 'Data dikosongkan')); renderSettings();
    });
  }

  // =====================================================================
  // Drawers
  // =====================================================================
  function bindOpeners() {
    $$('[data-open-lead]').forEach((el) => el.onclick = (e) => { if (e.target.closest('select, button, a.btn, input')) return; e.preventDefault(); openLead(el.dataset.openLead); });
    $$('[data-open-client]').forEach((el) => el.onclick = (e) => { if (e.target.closest('select, button, a.btn, input')) return; e.preventDefault(); openClient(el.dataset.openClient); });
    $$('[data-new-lead]').forEach((b) => b.onclick = () => leadForm());
    $$('[data-new-session]').forEach((b) => b.onclick = () => sessionForm());
  }
  function openDrawer(html) { $('#drawer-panel').innerHTML = html; $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { drawerState = null; $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }
  function reopenDrawer() {
    if (!drawerState) return;
    if (drawerState.type === 'lead') { if (lead(drawerState.id)) openLead(drawerState.id); else closeDrawer(); }
    else if (client(drawerState.id)) openClient(drawerState.id); else closeDrawer();
  }
  const refreshAll = () => { renderMain(); reopenDrawer(); };

  function openLead(id) {
    const l = lead(id);
    if (!l) return;
    drawerState = { type: 'lead', id };
    const today = todayISO();
    const sess = S.sessions.filter((s) => s.leadId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const cur = stage(l.stageId), curI = stageIdx(l.stageId);
    const prog = program(l.programId);
    const c = clientOfLead(l.id);
    const ed = can.editLead();
    const days = daysBetween(stageEnteredAt(l), new Date());
    openDrawer(`
      <div class="drawer-head">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
          <div style="min-width:0"><div class="eyebrow">${esc(L('lead'))}</div><h3 class="ellipsis">${esc(l.name)}</h3><div class="small muted">${esc(l.company || '')} ${pillStage(l.stageId)}</div></div>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Close">✕</button>
        </div>
        <div class="row mt">
          ${l.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waHref(l.phone)}">WhatsApp</a>` : ''}
          ${ed ? '<button class="btn btn-sm" type="button" id="d-edit">Edit</button>' : ''}
          ${can.editSession() ? `<button class="btn btn-sm" type="button" id="d-sess">${esc(tr(`Book ${L('session')}`, `Jadwalkan ${L('session')}`))}</button>` : ''}
          ${ed && cur.type === 'open' && wonStage() ? '<button class="btn btn-sm btn-ok" type="button" id="d-won">Deal Won</button>' : ''}
          ${ed && cur.type === 'open' && lostStage() ? '<button class="btn btn-sm btn-danger" type="button" id="d-lost">Lost</button>' : ''}
          ${c ? `<button class="btn btn-sm" type="button" data-open-client="${esc(c.id)}">${esc(tr(`View ${L('client')}`, `Lihat ${L('client')}`))}</button>` : ''}
        </div>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <h4>${tr('Funnel stage', 'Stage funnel')}</h4>
          <div class="stage-steps">${stages().map((s, i) => `<button type="button" class="stage-step ${s.id === l.stageId ? 'current' : (i < curI && s.type === 'open' && cur.type !== 'lost' ? 'passed' : '')}" ${s.id === l.stageId ? `style="background:${esc(s.color)};border-color:${esc(s.color)}"` : ''} data-step="${esc(s.id)}" ${ed ? '' : 'disabled'}>${esc(s.name)}</button>`).join('')}</div>
          ${cur.type === 'open' ? `<div class="hint">${tr(`${days} days in this stage`, `${days} hari di stage ini`)}${cur.sla ? ` · SLA ${cur.sla} ${tr('days', 'hari')}` : ''} · ${tr('probability', 'probabilitas')} ${cur.prob}%</div>` : ''}
          ${l.lostReason && cur.type === 'lost' ? `<div class="hint">${tr('Lost reason', 'Alasan lost')}: <b>${esc(l.lostReason)}</b></div>` : ''}
        </div>
        ${cur.type === 'open' ? `<div class="drawer-section">
          <h4>Next action</h4>
          <div class="grid-2">
            <input id="d-na" placeholder="${esc(tr('e.g. Follow up on proposal', 'Mis. Follow up proposal'))}" value="${esc(l.nextAction || '')}" ${ed ? '' : 'disabled'}>
            <input id="d-nad" type="date" value="${esc(l.nextActionDate || '')}" ${ed ? '' : 'disabled'}>
          </div>
          ${l.nextActionDate && l.nextActionDate < today ? `<div class="warn-text mt">${tr('Follow-up is overdue', 'Terlambat dari jadwal follow up')}</div>` : ''}
        </div>` : ''}
        <div class="drawer-section">
          <h4>${tr('Details', 'Detail')}</h4>
          <dl class="kv">
            <dt>${tr('Phone / WA', 'HP / WA')}</dt><dd>${esc(l.phone || '—')}</dd><dt>Email</dt><dd>${esc(l.email || '—')}</dd>
            <dt>${tr('Source', 'Sumber')}</dt><dd>${esc(l.source || '—')}</dd><dt>${esc(L('owner'))}</dt><dd>${esc(accName(l.ownerId))}</dd>
            <dt>${esc(L('program'))}</dt><dd>${esc(prog ? prog.name : '—')}</dd><dt>${tr('Value', 'Nilai')}</dt><dd>${fmtMoney(l.value)}</dd>
            <dt>${tr('Created', 'Masuk')}</dt><dd>${esc(fmtDateTime(l.createdAt))}</dd>
            ${l.wonAt ? `<dt>Closing</dt><dd>${esc(fmtDateTime(l.wonAt))} (${daysBetween(l.createdAt, l.wonAt)} ${tr('days', 'hari')})</dd>` : ''}
          </dl>
          ${l.notes ? `<div class="note-box mt">${esc(l.notes)}</div>` : ''}
        </div>
        <div class="drawer-section"><h4>${esc(L('sessions'))} (${sess.length})</h4>${sessionList(sess)}</div>
        <div class="drawer-section">
          <h4>${tr('History', 'Riwayat')}</h4>
          <div class="timeline">${l.history.slice().reverse().map((h) => `<div class="tl-item" style="--c:${esc(stage(h.to).color)}">
            <b>${h.from ? esc(stage(h.from).name) + ' → ' : ''}${esc(stage(h.to).name)}</b>
            <div class="muted tiny">${esc(fmtDateTime(h.at))}${h.by ? ' · ' + esc(accName(h.by)) : ''}${h.note ? ' · ' + esc(h.note) : ''}</div></div>`).join('')}</div>
        </div>
        ${can.del() ? `<div class="row"><span class="spacer"></span><button class="btn btn-sm btn-danger" type="button" id="d-del">${esc(tr(`Delete ${L('lead')}`, `Hapus ${L('lead')}`))}</button></div>` : ''}
      </div>`);
    if ($('#d-edit')) $('#d-edit').onclick = () => leadForm(l, refreshAll);
    if ($('#d-sess')) $('#d-sess').onclick = () => sessionForm(null, l.id, refreshAll);
    if ($('#d-won')) $('#d-won').onclick = () => requestStageChange(l.id, wonStage().id, refreshAll);
    if ($('#d-lost')) $('#d-lost').onclick = () => requestStageChange(l.id, lostStage().id, refreshAll);
    if (ed) $$('[data-step]').forEach((b) => b.onclick = () => requestStageChange(l.id, b.dataset.step, refreshAll));
    const saveNA = () => { l.nextAction = $('#d-na').value; l.nextActionDate = $('#d-nad').value; l.updatedAt = new Date().toISOString(); save(); renderMain(); toast(tr('Next action saved', 'Next action disimpan')); };
    if ($('#d-na') && ed) { $('#d-na').onchange = saveNA; $('#d-nad').onchange = saveNA; }
    if ($('#d-del')) $('#d-del').onclick = () => confirmDialog(tr(`Delete ${l.name}?`, `Hapus ${l.name}?`), tr(`This ${L('lead')} and its ${L('sessions')} will be deleted permanently.`, `${L('lead')} beserta ${L('sessions')}-nya dihapus permanen.`), tr('Delete', 'Hapus'), () => {
      S.leads = S.leads.filter((x) => x.id !== l.id);
      S.sessions = S.sessions.filter((x) => x.leadId !== l.id);
      save(); closeDrawer(); renderMain(); toast(tr('Deleted', 'Dihapus'));
    });
    bindSessionActions(refreshAll);
    $$('#drawer-panel [data-open-client]').forEach((b) => b.onclick = () => openClient(b.dataset.openClient));
  }

  function sessionList(sess) {
    return `<div class="list">${sess.map((s) => `<div class="list-item" style="align-items:flex-start">
      <div class="grow">
        <div>${pillType(s.typeId)}</div>
        <div class="small muted" style="margin-top:4px">${esc(fmtDate(s.date))} ${esc(s.time)} · ${esc(accName(s.mentorId))} · ${esc(SESS_STATUS()[s.status] || s.status)}</div>
        ${s.notes ? `<div class="small" style="white-space:pre-wrap;margin-top:4px">${esc(s.notes)}</div>` : ''}
        ${(s.actionItems || []).length ? `<div class="actions-list" style="margin-top:6px">${s.actionItems.map((a, i) => `<label class="action-item ${a.done ? 'done' : ''}"><input type="checkbox" data-action-toggle="${esc(s.id)}|${i}" ${a.done ? 'checked' : ''} ${can.editSession() ? '' : 'disabled'}><span>${esc(a.text)}</span></label>`).join('')}</div>` : ''}
      </div>
      ${can.editSession() && s.status === 'scheduled' ? `<button class="btn btn-sm btn-ok" type="button" data-sess-done="${esc(s.id)}">${tr('Done', 'Selesai')}</button>` : ''}
      ${can.editSession() ? `<button class="btn btn-sm" type="button" data-sess-edit="${esc(s.id)}">Edit</button>` : ''}
    </div>`).join('') || `<div class="empty">${tr('Nothing yet.', 'Belum ada.')}</div>`}</div>`;
  }

  function openClient(id) {
    const c = client(id);
    if (!c) return;
    drawerState = { type: 'client', id };
    const p = clientProgress(c), prog = program(c.programId), l = lead(c.leadId);
    const sess = S.sessions.filter((s) => s.leadId === c.leadId).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const ed = can.editClient();
    const portal = c.accountId && acc(c.accountId);
    openDrawer(`
      <div class="drawer-head">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap;align-items:flex-start">
          <div style="min-width:0"><div class="eyebrow">${esc(L('client'))}</div><h3 class="ellipsis">${esc(c.name)}</h3><div class="small muted">${esc(c.company || '')} ${clientBadge(c.status)}</div></div>
          <button class="icon-btn" type="button" data-close-drawer aria-label="Close">✕</button>
        </div>
        <div class="row mt">
          ${c.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waHref(c.phone)}">WhatsApp</a>` : ''}
          ${ed ? '<button class="btn btn-sm" type="button" id="c-edit">Edit</button>' : ''}
          ${can.editSession() && l ? `<button class="btn btn-sm btn-primary" type="button" id="c-sess">${esc(tr(`Book ${L('session')}`, `Jadwalkan ${L('session')}`))}</button>` : ''}
          ${l ? `<button class="btn btn-sm" type="button" id="c-lead">${esc(tr(`${L('lead')} history`, `Riwayat ${L('lead')}`))}</button>` : ''}
          ${can.accounts() && !portal ? `<button class="btn btn-sm" type="button" id="c-portal">${tr('Create portal login', 'Buat akun portal')}</button>` : ''}
        </div>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <h4>${tr('Program progress', 'Progress program')}</h4>
          <div class="row small" style="justify-content:space-between"><b>${esc(prog ? prog.name : '—')}</b><span class="num">${p.done}/${p.total} ${esc(L('sessions'))} · ${p.pct}%</span></div>
          <div class="progress mt ${p.pct >= 100 ? 'ok' : ''}"><div style="width:${p.pct}%"></div></div>
          <dl class="kv mt">
            <dt>${esc(L('mentor'))}</dt><dd>${esc(accName(c.coachId))}${c.assistantId ? ' + ' + esc(accName(c.assistantId)) : ''}</dd>
            <dt>${tr('Period', 'Periode')}</dt><dd>${esc(fmtDate(c.startDate))} – ${esc(fmtDate(p.end))}${p.daysLeft != null && c.status === 'active' ? ` (${p.daysLeft >= 0 ? tr(`${p.daysLeft} days left`, `${p.daysLeft} hari lagi`) : tr('past program end', 'lewat masa program')})` : ''}</dd>
            <dt>${tr('Contract value', 'Nilai kontrak')}</dt><dd>${fmtMoney(c.value)}</dd>
            <dt>${tr('Next', 'Berikutnya')}</dt><dd>${p.next ? `${esc(stype(p.next.typeId).name)} · ${esc(fmtDate(p.next.date))} ${esc(p.next.time)}` : tr('Not scheduled', 'Belum dijadwalkan')}</dd>
            <dt>${tr('Phone / Email', 'HP / Email')}</dt><dd>${esc(c.phone || '—')} · ${esc(c.email || '—')}</dd>
            <dt>Portal</dt><dd>${portal ? esc(portal.email) : tr('No login yet', 'Belum ada akun')}</dd>
          </dl>
          ${p.idle ? `<div class="warn-text mt">${esc(tr(`No ${L('session')} completed in 30 days. Churn risk, book the next one.`, `Tidak ada ${L('session')} selesai dalam 30 hari. Risiko churn, jadwalkan ulang.`))}</div>` : ''}
          ${c.notes ? `<div class="note-box mt">${esc(c.notes)}</div>` : ''}
        </div>
        <div class="drawer-section">
          <h4>${tr('Open action items', 'Action items terbuka')} (${p.openActions.length})</h4>
          <div class="actions-list">${p.openActions.map((x) => `<label class="action-item"><input type="checkbox" data-action-toggle="${esc(x.s.id)}|${x.i}" ${can.editSession() ? '' : 'disabled'}><span>${esc(x.a.text)} <span class="tiny muted">· ${esc(fmtShortDate(x.s.date))}</span></span></label>`).join('') || `<div class="empty">${tr('None.', 'Tidak ada.')}</div>`}</div>
        </div>
        <div class="drawer-section"><h4>${esc(L('sessions'))} (${sess.length})</h4>${sessionList(sess)}</div>
      </div>`);
    if ($('#c-edit')) $('#c-edit').onclick = () => clientForm(c);
    if ($('#c-sess')) $('#c-sess').onclick = () => sessionForm(null, c.leadId, refreshAll);
    if ($('#c-lead')) $('#c-lead').onclick = () => openLead(c.leadId);
    if ($('#c-portal')) $('#c-portal').onclick = () => {
      openModal(tr('Portal login', 'Akun portal') + ' · ' + c.name, `
        <div class="form-stack">
          <label class="field"><span>${tr('Sign-in email *', 'Email login *')}</span><input name="email" id="f-portal-email" type="email" required value="${esc(c.email || '')}"></label>
          <label class="field"><span>Password *</span><input name="password" id="f-portal-pw" required value="${esc(Math.random().toString(36).slice(2, 8))}"></label>
          <div class="hint">${esc(tr(`The ${L('client')} sees their own program progress, schedule & action plan. Send them this email and password on WhatsApp.`, `${L('client')} bisa melihat progress program, jadwal & action plan miliknya sendiri. Kirim email & password ini via WA.`))}</div>
        </div>${modalFoot(tr('Create login', 'Buat akun'))}`,
      (fd) => {
        const email = String(fd.get('email')).trim().toLowerCase();
        if (S.accounts.some((x) => (x.email || '').toLowerCase() === email)) { toast(tr('Email is already used by another account', 'Email sudah dipakai akun lain')); return false; }
        const a = { id: uid('u'), name: c.name, email, role: 'client', clientId: c.id, active: true };
        setPassword(a, String(fd.get('password')));
        S.accounts.push(a); c.accountId = a.id; if (!c.email) c.email = email;
        save(); toast(tr('Portal login created', 'Akun portal dibuat')); refreshAll();
      });
    };
    bindSessionActions(refreshAll);
  }

  // =====================================================================
  // Forms
  // =====================================================================
  function leadForm(l, after) {
    const isNew = !l;
    const d = l || { stageId: openStages()[0] && openStages()[0].id, source: S.config.sources[0], ownerId: R() === 'bd' ? me.id : (S.accounts.find((m) => m.role === 'bd') || S.accounts.find((m) => m.role === 'superadmin') || {}).id };
    openModal(isNew ? tr(`New ${L('lead')}`, `${L('lead')} baru`) : `Edit ${L('lead')}`, `
      <div class="grid-2">
        <label class="field"><span>${tr('Name *', 'Nama *')}</span><input name="name" id="f-lead-name" required value="${esc(d.name || '')}" placeholder="${esc(tr('Full name', 'Nama lengkap'))}"></label>
        <label class="field"><span>${tr('Company / business', 'Perusahaan / bisnis')}</span><input name="company" id="f-lead-company" value="${esc(d.company || '')}"></label>
        <label class="field"><span>${tr('WhatsApp number *', 'No. WhatsApp *')}</span><input name="phone" id="f-lead-phone" type="tel" required value="${esc(d.phone || '')}" placeholder="0812xxxxxxx"><div class="warn-text" id="dup-warn"></div></label>
        <label class="field"><span>Email</span><input name="email" id="f-lead-email" type="email" value="${esc(d.email || '')}"></label>
        <label class="field"><span>${tr('Source', 'Sumber')}</span><select name="source" id="f-lead-source">${options(S.config.sources, d.source, (x) => x, (x) => x)}</select></label>
        <label class="field"><span>${esc(L('owner'))} (PIC)</span><select name="ownerId" id="f-lead-owner" ${R() === 'bd' ? 'disabled' : ''}>${options(ownersList(), d.ownerId, (m) => m.id, (m) => m.name + ' · ' + roleName(m.role))}</select></label>
        <label class="field"><span>${esc(tr(`${L('program')} of interest`, `${L('program')} diminati`))}</span><select name="programId" id="f-prog">${options(S.programs, d.programId, (p) => p.id, (p) => `${p.name} (${fmtMoneyShort(p.price)})`, tr('— not sure yet —', '— belum tahu —'))}</select></label>
        <label class="field"><span>${tr('Estimated value (Rp)', 'Estimasi nilai (Rp)')}</span><input name="value" id="f-val" type="number" min="0" step="1000" value="${esc(d.value ?? '')}"></label>
        ${isNew ? `<label class="field"><span>${tr('Starting stage', 'Stage awal')}</span><select name="stageId" id="f-lead-stage">${options(openStages(), d.stageId, (s) => s.id, (s) => s.name)}</select></label>` : ''}
        <label class="field"><span>Next action</span><input name="nextAction" id="f-lead-na" value="${esc(d.nextAction || (isNew ? tr('WhatsApp follow-up', 'Follow up WA') : ''))}"></label>
        <label class="field"><span>${tr('Next action date', 'Tanggal next action')}</span><input name="nextActionDate" id="f-lead-nad" type="date" value="${esc(d.nextActionDate || (isNew ? localISO(new Date(Date.now() + DAY)) : ''))}"></label>
      </div>
      <label class="field mt"><span>${tr('Notes', 'Catatan')}</span><textarea name="notes" id="f-lead-notes" placeholder="${esc(tr('Needs, pain points, budget, timeline', 'Kebutuhan, pain point, budget, timeline'))}">${esc(d.notes || '')}</textarea></label>
      ${modalFoot(isNew ? tr(`Save ${L('lead')}`, `Simpan ${L('lead')}`) : tr('Save', 'Simpan'))}`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      const ownerId = R() === 'bd' ? me.id : v.ownerId;
      const nowIso = new Date().toISOString();
      if (isNew) {
        const nl = { id: uid('L'), name: v.name.trim(), company: v.company, phone: v.phone, email: v.email, source: v.source, ownerId, programId: v.programId, value: Number(v.value) || 0, stageId: v.stageId, nextAction: v.nextAction, nextActionDate: v.nextActionDate, notes: v.notes, createdAt: nowIso, updatedAt: nowIso, createdBy: me.id, history: [{ at: nowIso, from: null, to: v.stageId, note: 'Lead created', by: me.id }] };
        S.leads.unshift(nl);
        save(); toast(tr(`${nl.name} added to the pipeline`, `${nl.name} masuk pipeline`));
      } else {
        Object.assign(l, { name: v.name.trim(), company: v.company, phone: v.phone, email: v.email, source: v.source, ownerId, programId: v.programId, value: Number(v.value) || 0, nextAction: v.nextAction, nextActionDate: v.nextActionDate, notes: v.notes, updatedAt: nowIso });
        save(); toast(tr('Saved', 'Tersimpan'));
      }
      renderMain(); after && after();
    });
    const val = $('#f-val');
    $('#f-prog').onchange = (e) => { const p = program(e.target.value); if (p) val.value = p.price; };
    $('#f-lead-phone').oninput = (e) => {
      const n = waNumber(e.target.value);
      const dup = n.length > 6 && S.leads.find((x) => x !== l && waNumber(x.phone) === n);
      $('#dup-warn').textContent = dup ? tr(`This number already exists: ${dup.name} (${stage(dup.stageId).name})`, `Nomor ini sudah terdaftar: ${dup.name} (${stage(dup.stageId).name})`) : '';
    };
  }

  function sessionForm(s, presetLeadId, after) {
    const isNew = !s;
    const leads = (seesAll() || R() === 'assistant') ? S.leads : visibleLeads();
    if (!leads.length) { toast(tr(`Add a ${L('lead')} first`, `Tambah ${L('lead')} dulu`)); return; }
    const leadId = s ? s.leadId : presetLeadId || '';
    const l0 = lead(leadId);
    let defType = S.config.sessionTypes[0] && S.config.sessionTypes[0].id;
    if (l0 && isOpen(l0)) {
      const opens = openStages(); const i = opens.findIndex((x) => x.id === l0.stageId);
      const t = S.config.sessionTypes.find((x) => x.stageId && x.stageId === (opens[i + 1] || {}).id) || S.config.sessionTypes.find((x) => x.stageId === l0.stageId);
      if (t) defType = t.id;
    } else if (l0 && isWon(l0)) { const t = S.config.sessionTypes.find((x) => !x.stageId); if (t) defType = t.id; }
    const c0 = l0 && clientOfLead(l0.id);
    const defMentor = R() === 'mentor' || R() === 'senior' ? me.id : R() === 'assistant' ? me.mentorId : (c0 && c0.coachId) || (mentorsList()[0] || {}).id;
    const d = s || { leadId, typeId: defType, date: todayISO(), time: '10:00', mentorId: defMentor, status: 'scheduled', actionItems: [] };
    const sorted = leads.slice().sort((a, b) => a.name.localeCompare(b.name));
    openModal(isNew ? tr(`Book ${L('session')}`, `Jadwalkan ${L('session')}`) : `Edit ${L('session')}`, `
      <div class="form-stack">
        <label class="field"><span>${esc(L('lead'))} / ${esc(L('client'))} *</span>
          <select name="leadId" id="f-sess-lead" required>${options(sorted, d.leadId, (x) => x.id, (x) => `${x.name}${x.company ? ' · ' + x.company : ''} [${clientOfLead(x.id) ? L('client') : stage(x.stageId).name}]`, tr('Choose…', 'Pilih…'))}</select></label>
        <label class="field"><span>${esc(tr(`${L('session')} type *`, `Jenis ${L('session')} *`))}</span>
          <select name="typeId" id="f-sess-type" required>${options(S.config.sessionTypes, d.typeId, (t) => t.id, (t) => `${t.name} (${durLabel(t.duration)})${t.stageId ? ' → ' + stage(t.stageId).name : ' · delivery'}`)}</select>
          <div class="hint">${esc(tr(`Types linked to a stage automatically move the ${L('lead')} to that stage.`, `Jenis yang terhubung ke stage otomatis memajukan ${L('lead')} ke stage tersebut.`))}</div></label>
        <div class="grid-3">
          <label class="field"><span>${tr('Date *', 'Tanggal *')}</span><input name="date" id="f-sess-date" type="date" required value="${esc(d.date)}"></label>
          <label class="field"><span>${tr('Time *', 'Jam *')}</span><input name="time" id="f-sess-time" type="time" required value="${esc(d.time)}"></label>
          <label class="field"><span>Status</span><select name="status" id="f-sess-status">${options(Object.entries(SESS_STATUS()), d.status, (x) => x[0], (x) => x[1])}</select></label>
        </div>
        <label class="field"><span>${esc(L('mentor'))} *</span><select name="mentorId" id="f-sess-mentor" required>${options(mentorsList().length ? mentorsList() : staffList(), d.mentorId, (m) => m.id, (m) => m.name + ' · ' + roleName(m.role))}</select>
          <div class="hint" id="f-sess-asst"></div></label>
        <label class="field"><span>${tr('Notes / meeting link', 'Catatan / link meeting')}</span><textarea name="notes" id="f-sess-notes" placeholder="${esc(tr('Zoom link / location / agenda', 'Link Zoom / lokasi / agenda'))}">${esc(d.notes || '')}</textarea></label>
        <label class="field"><span>${tr('Action items (one per line)', 'Action items (1 per baris)')}</span><textarea name="actions" id="f-sess-actions" placeholder="${esc(tr('Optional', 'Opsional'))}">${esc((d.actionItems || []).map((a) => a.text).join('\n'))}</textarea></label>
      </div>
      <div class="modal-foot">${!isNew && can.del() ? `<button type="button" class="btn btn-danger" id="sess-del">${tr('Delete', 'Hapus')}</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-close-modal>${tr('Cancel', 'Batal')}</button><button type="submit" class="btn btn-primary">${tr('Save', 'Simpan')}</button></div>`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      const target = s || { id: uid('S'), createdBy: me.id };
      Object.assign(target, { leadId: v.leadId, typeId: v.typeId, date: v.date, time: v.time, mentorId: v.mentorId, assistantId: (assistantOf(v.mentorId) || {}).id || '', status: v.status, notes: v.notes, actionItems: parseActions(v.actions, target.actionItems) });
      if (isNew) S.sessions.push(target);
      save();
      const l = lead(v.leadId), t = stype(v.typeId);
      let msg = isNew ? tr(`${t.name} booked`, `${t.name} terjadwal`) : tr('Saved', 'Tersimpan');
      if (l && t.stageId && isOpen(l) && stageIdx(t.stageId) > stageIdx(l.stageId)) {
        moveStage(l, t.stageId, `Auto: ${t.name} booked`);
        msg += ` · ${l.name} → ${stage(t.stageId).name}`;
      }
      toast(msg);
      renderMain(); after && after();
    });
    const showAsst = () => { const a = assistantOf($('#f-sess-mentor').value); $('#f-sess-asst').textContent = a ? tr(`Assistant joins automatically: ${a.name}`, `Asisten otomatis ikut: ${a.name}`) : ''; };
    $('#f-sess-mentor').onchange = showAsst; showAsst();
    const del = $('#sess-del');
    if (del) del.onclick = () => confirmDialog(tr('Delete this booking?', 'Hapus jadwal ini?'), `${stype(s.typeId).name} · ${fmtDate(s.date)} ${s.time}`, tr('Delete', 'Hapus'), () => {
      S.sessions = S.sessions.filter((x) => x.id !== s.id); save(); renderMain(); after && after(); toast(tr('Booking deleted', 'Jadwal dihapus'));
    });
  }

  function clientForm(c) {
    const cs = CLIENT_STATUS();
    openModal(`Edit ${L('client')} · ${c.name}`, `
      <div class="grid-2">
        <label class="field"><span>${tr('Name *', 'Nama *')}</span><input name="name" id="f-cl-name" required value="${esc(c.name)}"></label>
        <label class="field"><span>${tr('Company', 'Perusahaan')}</span><input name="company" id="f-cl-company" value="${esc(c.company || '')}"></label>
        <label class="field"><span>WhatsApp</span><input name="phone" id="f-cl-phone" value="${esc(c.phone || '')}"></label>
        <label class="field"><span>Email</span><input name="email" id="f-cl-email" type="email" value="${esc(c.email || '')}"></label>
        <label class="field"><span>${esc(L('program'))}</span><select name="programId" id="f-cl-prog">${options(S.programs, c.programId, (p) => p.id, (p) => p.name, '—')}</select></label>
        <label class="field"><span>Status</span><select name="status" id="f-cl-status">${options(Object.entries(cs), c.status, (x) => x[0], (x) => x[1][0])}</select></label>
        <label class="field"><span>${esc(L('mentor'))}</span><select name="coachId" id="f-cl-coach">${options(mentorsList(), c.coachId, (m) => m.id, (m) => m.name, '—')}</select><div class="hint" id="f-cl-asst"></div></label>
        <label class="field"><span>${tr('Program start', 'Mulai program')}</span><input name="startDate" id="f-cl-start" type="date" value="${esc(c.startDate || '')}"></label>
        <label class="field"><span>${tr('Duration (months)', 'Durasi (bulan)')}</span><input name="months" id="f-cl-months" type="number" min="1" value="${esc(c.months || 12)}"></label>
        <label class="field"><span>Total ${esc(L('sessions'))}</span><input name="totalSessions" id="f-cl-total" type="number" min="0" value="${esc(c.totalSessions || 0)}"></label>
      </div>
      <label class="field mt"><span>${tr('Notes', 'Catatan')}</span><textarea name="notes" id="f-cl-notes">${esc(c.notes || '')}</textarea></label>
      ${modalFoot(tr('Save', 'Simpan'))}`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      Object.assign(c, { name: v.name.trim(), company: v.company, phone: v.phone, email: v.email, programId: v.programId, status: v.status, coachId: v.coachId, assistantId: (assistantOf(v.coachId) || {}).id || '', startDate: v.startDate, months: Number(v.months) || 12, totalSessions: Number(v.totalSessions) || 0, notes: v.notes });
      save(); toast(tr('Saved', 'Tersimpan')); refreshAll();
    });
    const showAsst = () => { const a = assistantOf($('#f-cl-coach').value); $('#f-cl-asst').textContent = a ? tr(`Assistant: ${a.name}`, `Asisten: ${a.name}`) : ''; };
    $('#f-cl-coach').onchange = showAsst; showAsst();
    $('#f-cl-prog').onchange = (e) => { const p = program(e.target.value); if (p) { $('#f-cl-months').value = p.months; $('#f-cl-total').value = p.sessions; } };
  }

  // =====================================================================
  // Export
  // =====================================================================
  async function download(name, content, type) {
    let dl = null;
    if (window.claude && typeof window.claude.use === 'function') { try { dl = await window.claude.use('downloads'); } catch (e) { dl = null; } }
    if (dl) {
      try { const r = await dl.save({ filename: name, data: new Blob([content], { type }) }); if (r && r.status === 'saved') toast(tr('File saved', 'File disimpan')); }
      catch (e) { if (!e || e.code !== 'declined') toast(tr('Downloads are not available in this view', 'Download tidak tersedia di tampilan ini')); }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCSV(list) {
    const cols = [['Name', (l) => l.name], ['Company', (l) => l.company], ['Phone', (l) => l.phone], ['Email', (l) => l.email], ['Stage', (l) => stage(l.stageId).name], ['Source', (l) => l.source], [L('owner'), (l) => accName(l.ownerId)], [L('program'), (l) => (program(l.programId) || {}).name], ['Value', (l) => l.value], ['Next action', (l) => l.nextAction], ['Next action date', (l) => l.nextActionDate], ['Created', (l) => (l.createdAt || '').slice(0, 10)], ['Won', (l) => (l.wonAt || '').slice(0, 10)], ['Lost reason', (l) => l.lostReason], ['Notes', (l) => l.notes]];
    const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.map((c) => q(c[0])).join(','), ...list.map((l) => cols.map((c) => q(c[1](l))).join(','))].join('\n');
    download(`${slugify(S.config.brandName)}-${slugify(L('leads'))}-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  // =====================================================================
  // Modal, confirm, toast
  // =====================================================================
  let modalSubmit = null;
  const modalFoot = (label, cls) => `<div class="modal-foot"><button type="button" class="btn" data-close-modal>${tr('Cancel', 'Batal')}</button><button type="submit" class="btn ${cls || 'btn-primary'}">${esc(label)}</button></div>`;
  function openModal(title, body, onSubmit) {
    $('#modal-title').textContent = title;
    $('#modal-form').innerHTML = body;
    modalSubmit = onSubmit;
    $('#modal').classList.add('open');
    $('#modal').setAttribute('aria-hidden', 'false');
    const first = $('#modal-form input:not([type=hidden]):not([disabled]), #modal-form select:not([disabled]), #modal-form textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); modalSubmit = null; }
  function confirmDialog(title, msg, okLabel, onOk) { openModal(title, `<p style="margin:0">${esc(msg)}</p>${modalFoot(okLabel, 'btn-danger-solid')}`, () => onOk()); }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800);
  }

  // =====================================================================
  // Boot
  // =====================================================================
  let chromeBound = false;
  function bindChrome() {
    if (chromeBound) return; chromeBound = true;
    $('#btn-add-lead').onclick = () => leadForm();
    $('#btn-add-session').onclick = () => sessionForm();
    $('#modal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fn = modalSubmit; const fd = new FormData(e.target);
      $$('#modal-form select[disabled]').forEach((x) => fd.set(x.name, x.value));
      if (!fn) { closeModal(); return; }
      closeModal();
      const res = await fn(fd);
      if (res === false) { $('#modal').classList.add('open'); modalSubmit = fn; }
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-modal]')) closeModal();
      if (e.target.closest('[data-close-drawer]')) closeDrawer();
    });
    $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if ($('#modal').classList.contains('open')) closeModal(); else closeDrawer(); });
    window.addEventListener('hashchange', () => {
      const tok = location.hash.slice(1).toLowerCase();
      const t = tenantBySlug(tok);
      if (t && (!S || S.id !== t.id) && !(me && me.platform)) { LS.set(K_TENANT, tok); boot(); return; }
      if (me) { closeDrawer(); renderMain(); } else if (pme) renderConsole();
    });
  }

  async function pickBackend() {
    if (!(window.claude && typeof window.claude.use === 'function')) return LocalBackend;
    let db = null;
    try { db = await window.claude.use('db'); } catch (e) { db = null; }
    return db ? makeCloudBackend(db) : LocalBackend;
  }

  async function boot() {
    bindChrome();
    document.documentElement.lang = LANG;
    showLoading();
    if (!Backend) Backend = await pickBackend();
    setSync(Backend.mode === 'cloud' ? 'cloud' : 'local');
    try { platform = await Backend.getPlatform(); } catch (e) { platform = null; }
    if (!platform || !Array.isArray(platform.admins) || !platform.admins.length) platform = defaultPlatform();
    try { wsIndex = await Backend.list(); } catch (e) { wsIndex = []; }
    if (!wsIndex.length && Backend.mode === 'local') {
      for (const k of ['alphaleaders', 'piwa', 'iplus']) await Backend.create(buildWorkspace(k, true));
    }
    if (Backend.watchIndex) Backend.watchIndex();
    S = null; me = null; pme = null;

    // Deep link: #<company-code> opens that company's own branded sign-in; #lightech opens the neutral sign-in.
    const tok = location.hash.slice(1).toLowerCase();
    const linked = tenantBySlug(tok);
    if (linked) LS.set(K_TENANT, tok);
    if (tok === 'lightech' || tok === 'console') LS.del(K_TENANT);

    const pa = (platform.admins || []).find((a) => a.id === LS.get(K_PAUTH) && a.active !== false);
    if (pa && !linked) { pme = pa; if (!['companies', 'admins'].includes(tok)) location.hash = '#companies'; renderConsole(); return; }

    const t = tenantBySlug(LS.get(K_TENANT));
    if (t && (await activate(t.id))) {
      if (S.status === 'suspended') me = null;
      if (linked) location.hash = me ? (me.role === 'client' ? '#portal' : '#dashboard') : '';
      render();
      return;
    }
    renderNeutralLogin();
  }

  window.__mcrm = { get state() { return S; }, get backend() { return Backend; }, get platform() { return platform; }, sha256 };
  boot();
})();

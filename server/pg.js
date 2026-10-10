/**
 * PostgreSQL host for server/core.js (Supabase or any Postgres 14+).
 *
 * One request = one database transaction:
 *   1. writers take a global advisory lock (sign-ins, saves and form submissions are serialized; readers never wait)
 *   2. the records this request may touch are loaded: the platform row, every company row, and the leads /
 *      sessions / clients of the signed-in person's company only (all companies for a Lightech console session)
 *   3. core.handle_() runs on that snapshot
 *   4. pending record writes, audit rows and session / rate-limit keys are saved before COMMIT
 *
 * `sql` is a postgres.js client (npm "postgres"); it is passed in so the same file runs in Deno (Edge Function)
 * and Node (tests).
 */
import { createCore, VERSION } from './core.js';

const LOCK_KEY = 7731001;
const KINDS = ['leads', 'sessions', 'clients'];
const WRITERS = new Set(['setup', 'login', 'capture', 'password', 'logout', 'batch']);

export { VERSION };

export function createApi(sql, opts) {
  opts = opts || {};
  const log = opts.log || function () {};

  return async function api(req) {
    if (!req || typeof req !== 'object' || Array.isArray(req)) return { ok: false, error: 'invalid', message: 'Bad request.' };
    const action = String(req.action || '');
    if (action === 'ping' && opts.fastPing) return { ok: true, version: VERSION };
    const writer = WRITERS.has(action);
    try {
      return await sql.begin(writer ? 'isolation level read committed' : 'isolation level repeatable read read only', async function (tx) {
        if (writer) await tx`select pg_advisory_xact_lock(${LOCK_KEY})`;
        const now = Date.now();
        const host = await loadHost(tx, req, action, now, writer);
        const core = createCore(host);
        const res = core.handle_(req);
        if (writer) await flush(tx, host, now);
        else if (Object.keys(host.store.pending).length || host.auditQueue.length || host.cache.dirty.size) throw new Error('write in a read-only request: ' + action);
        return res;
      });
    } catch (err) {
      log('api error', action, err && err.stack || err);
      return { ok: false, error: 'server', message: 'Server error. Please try again.' };
    }
  };
}

// ───────────────────────────────────────────────────────── load
async function loadHost(tx, req, action, now, writer) {
  const kvRows = await tx`select key, value, expires_at from kv where expires_at > ${now}`;
  const cache = makeCache(kvRows, now);

  const store = { rows: [], byPath: {}, pending: {}, maxTs: 0 };
  const add = function (path, parent, r) {
    const row = { path: path, parent: parent, json: r.deleted || r.data == null ? '' : JSON.stringify(r.data), updatedAt: Number(r.updated_at), updatedBy: r.updated_by || '', deleted: !!r.deleted || r.data == null };
    store.rows.push(row); store.byPath[path] = row;
  };
  const plat = await tx`select id, data, updated_at, updated_by, deleted from platform`;
  plat.forEach(function (r) { add('platform/' + r.id, 'platform', r); });
  const comps = await tx`select id, data, updated_at, updated_by, deleted, slug from companies`;
  comps.forEach(function (r) { add('ws/' + r.id, 'ws', r); });

  // Which companies' records does this request need?
  let wsIds = [];
  if (action === 'capture') {
    const slug = String(req.slug || '').trim().toLowerCase();
    wsIds = comps.filter(function (c) { return !c.deleted && c.slug === slug; }).map(function (c) { return c.id; });
  } else if (req.token) {
    const raw = cache.get('tok:' + String(req.token));
    let s = null;
    try { s = raw ? JSON.parse(raw) : null; } catch (e) { s = null; }
    if (s && s.kind === 'platform') wsIds = comps.map(function (c) { return c.id; });
    else if (s && s.wsId) wsIds = [s.wsId];
  }
  if (wsIds.length) {
    for (const k of KINDS) {
      const rows = await tx`select company_id, id, data, updated_at, updated_by, deleted from ${tx(k)} where company_id in ${tx(wsIds)}`;
      rows.forEach(function (r) { add('ws/' + r.company_id + '/' + k + '/' + r.id, 'ws/' + r.company_id + '/' + k, r); });
    }
  }
  if (writer) {
    const m = await tx`select greatest(
      (select max(updated_at) from platform), (select max(updated_at) from companies), (select max(updated_at) from leads),
      (select max(updated_at) from sessions), (select max(updated_at) from clients)) as m`;
    store.maxTs = Number(m[0].m) || 0;
  }

  let auditRows = [];
  if (action === 'audit') {
    const s = req.token ? cache.get('tok:' + String(req.token)) : null;
    const sess = s ? JSON.parse(s) : null;
    if (sess) {
      auditRows = sess.kind === 'platform'
        ? await tx`select at, actor, company, action, path, detail from audit_log order by id desc limit 1000`
        : await tx`select at, actor, company, action, path, detail from audit_log where company = ${String(sess.wsId || '')} order by id desc limit 1000`;
    }
  }
  let setupCode = '';
  if (action === 'setup') {
    const r = await tx`select code from app_setup where id = 1`;
    setupCode = r.length ? r[0].code : '';
  }

  const host = {
    store: store,
    cache: cache,
    auditQueue: [],
    setupConsumed: false,
    audit: function (row) { host.auditQueue.push(row); },
    auditRows: function (wsId, limit) {
      return auditRows.filter(function (r) { return wsId == null || r.company === wsId; }).slice(0, limit).map(function (r) {
        return { time: new Date(r.at).toISOString(), actor: r.actor, company: r.company, action: r.action, path: r.path, detail: r.detail };
      });
    },
    setupCode: function () { return setupCode; },
    consumeSetup: function () { host.setupConsumed = true; },
    log: function () {}
  };
  return host;
}

// Session tokens, failed-sign-in counters and rate limits (seconds-based TTL, like a cache).
function makeCache(rows, now) {
  const m = new Map();
  rows.forEach(function (r) { m.set(r.key, { value: r.value, exp: Number(r.expires_at) }); });
  const dirty = new Map(); // key → { value, exp } | null (removed)
  return {
    dirty: dirty,
    get: function (k) { const e = m.get(k); return e && e.exp > now ? e.value : null; },
    put: function (k, v, seconds) { const e = { value: String(v), exp: now + Number(seconds) * 1000 }; m.set(k, e); dirty.set(k, e); },
    remove: function (k) { m.delete(k); dirty.set(k, null); }
  };
}

// ───────────────────────────────────────────────────────── save
async function flush(tx, host, now) {
  const rows = Object.keys(host.store.pending).map(function (p) { return host.store.pending[p]; });
  for (const r of rows) {
    const parts = r.path.split('/');
    const data = r.deleted ? null : r.json;
    if (parts[0] === 'platform' && parts.length === 2) {
      await tx`insert into platform (id, data, updated_at, updated_by, deleted) values (${parts[1]}, ${data}::text::jsonb, ${r.updatedAt}, ${r.updatedBy || ''}, ${r.deleted})
        on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = excluded.deleted`;
    } else if (parts[0] === 'ws' && parts.length === 2) {
      await tx`insert into companies (id, data, updated_at, updated_by, deleted) values (${parts[1]}, ${data}::text::jsonb, ${r.updatedAt}, ${r.updatedBy || ''}, ${r.deleted})
        on conflict (id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = excluded.deleted`;
    } else if (parts[0] === 'ws' && parts.length === 4 && KINDS.indexOf(parts[2]) >= 0) {
      await tx`insert into ${tx(parts[2])} (company_id, id, data, updated_at, updated_by, deleted) values (${parts[1]}, ${parts[3]}, ${data}::text::jsonb, ${r.updatedAt}, ${r.updatedBy || ''}, ${r.deleted})
        on conflict (company_id, id) do update set data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted = excluded.deleted`;
    } else {
      throw new Error('unsupported path ' + r.path);
    }
  }
  for (const a of host.auditQueue) {
    await tx`insert into audit_log (at, actor, company, action, path, detail)
      values (${new Date(a[0])}, ${String(a[1] || '')}, ${String(a[2] || '')}, ${String(a[3] || '')}, ${String(a[4] || '')}, ${String(a[5] || '').slice(0, 500)})`;
  }
  for (const [k, e] of host.cache.dirty) {
    if (e) await tx`insert into kv (key, value, expires_at) values (${k}, ${e.value}, ${e.exp}) on conflict (key) do update set value = excluded.value, expires_at = excluded.expires_at`;
    else await tx`delete from kv where key = ${k}`;
  }
  if (host.setupConsumed) await tx`delete from app_setup`;
  if (Math.random() < 0.05) await tx`delete from kv where expires_at < ${now}`; // housekeeping
}

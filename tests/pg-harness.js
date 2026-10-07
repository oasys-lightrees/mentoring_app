// Runs the real server (server/pg.js + server/core.js) against a throwaway PostgreSQL database.
// Needs a local Postgres: PG_TEST_URL (default postgres://postgres:postgres@localhost:5432/postgres).
// Each createServer() gets its own fresh database with the Supabase migration applied.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const postgres = require('postgres');

const ADMIN_URL = process.env.PG_TEST_URL || 'postgres://postgres:postgres@localhost:5432/postgres';
const MIGRATIONS = path.join(__dirname, '..', 'supabase', 'migrations');
const dbUrl = (name) => { const u = new URL(ADMIN_URL); u.pathname = '/' + name; return u.toString(); };
const created = [];

async function createServer(opts) {
  opts = opts || {};
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe(`do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    end $$`);
  } catch (e) { /* roles created concurrently */ }
  const name = 'mcrm_t_' + crypto.randomBytes(5).toString('hex');
  await admin.unsafe('create database ' + name);
  await admin.end();
  created.push(name);
  const url = dbUrl(name);
  const sql = postgres(url, { max: opts.max || 4, onnotice: () => {}, prepare: false });
  for (const f of fs.readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) await sql.unsafe(fs.readFileSync(path.join(MIGRATIONS, f), 'utf8'));
  const { createApi } = await import('../server/pg.js');
  const { createHandler } = await import('../server/http.js');
  const errors = [];
  const api = createApi(sql, { log: (...a) => errors.push(a.join(' ')) });
  const post = (body) => api(typeof body === 'string' ? JSON.parse(body) : body);
  const handler = createHandler(api, Object.assign({ version: 'test' }, opts.http || {}));
  const setupCode = async () => ((await sql`select code from app_setup`)[0] || {}).code || '';
  // Runs first-time setup the way the app's setup screen does; returns the Super Admin password and the team's one-time passwords.
  async function setup(o) {
    o = o || {};
    const adminPw = o.password || 'Lt-' + crypto.randomBytes(8).toString('hex');
    const r = await post({ action: 'setup', code: await setupCode(), email: o.email || 'super@lightech.co.id', name: 'Lightech Super Admin', password: adminPw, alphaleaders: !!o.alphaleaders });
    if (!r.ok) throw new Error('setup failed: ' + JSON.stringify(r));
    return { adminPw, team: r.team || [] };
  }
  return { post, handler, setup, setupCode, sql, url, errors, close: () => sql.end({ timeout: 2 }) };
}

async function dropAll() {
  if (!created.length) return;
  const admin = postgres(ADMIN_URL, { max: 1, onnotice: () => {} });
  for (const n of created.splice(0)) { try { await admin.unsafe('drop database if exists ' + n + ' with (force)'); } catch (e) { /* ignore */ } }
  await admin.end();
}

module.exports = { createServer, dropAll, ADMIN_URL };

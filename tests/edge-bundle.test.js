// Runs the generated Edge Function bundle (supabase/functions/api/index.ts) in Node with a tiny Deno stand-in,
// against a fresh PostgreSQL database: proves the single-file deploy works end to end.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createServer, dropAll } = require('./pg-harness');

(async () => {
  const db = await createServer();
  const src = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'api', 'index.ts'), 'utf8');
  assert.ok(!/^import .* from '\.\//m.test(src), 'bundle must be self-contained');
  const tmpDir = path.join(__dirname, '.tmp'); fs.mkdirSync(tmpDir, { recursive: true });
  const tmp = path.join(tmpDir, 'edge-' + process.pid + '.mjs');
  fs.writeFileSync(tmp, src.replace("from 'npm:postgres@3.4.4'", "from 'postgres'"));
  let handler = null;
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_DB_URL: db.url, ALLOWED_ORIGINS: '' })[k] }, serve: (h) => { handler = h; } };
  await import(tmp);
  fs.unlinkSync(tmp);
  let n = 0; const ok = (m) => { n++; console.log('  ✓ ' + m); };
  assert.ok(typeof handler === 'function'); ok('bundle starts and registers its HTTP handler');
  const post = async (b) => (await handler(new Request('https://x.supabase.co/functions/v1/api', { method: 'POST', body: JSON.stringify(b), headers: { 'Content-Type': 'text/plain;charset=utf-8', Origin: 'https://crm.test' } }))).json();
  assert.ok((await post({ action: 'ping' })).setup); ok('fresh database reports setup needed');
  const code = await db.setupCode();
  const s = await post({ action: 'setup', code, email: 'super@lightech.co.id', name: 'Lightech', password: 'edge-test-password', alphaleaders: true });
  assert.ok(s.ok && s.team.length === 12); ok('setup through the bundle creates Lightech + AlphaLeaders team');
  const ferly = s.team.find((x) => x.email === 'ferly@alphaleaders.id');
  const L = await post({ action: 'login', email: ferly.email, password: ferly.password, slug: 'alphaleaders' });
  assert.ok(L.ok); ok('team member signs in through the bundle');
  const w = L.session.wsId;
  assert.ok((await post({ action: 'batch', token: L.token, ops: [{ op: 'set', path: `ws/${w}/leads/E1`, data: { id: 'E1', name: 'Edge lead', value: 7 } }] })).ok);
  const list = await post({ action: 'list', token: L.token, collection: `ws/${w}/leads` });
  assert.ok(list.docs.some((d) => d.id === 'E1')); ok('saves and reads records through the bundle');
  const h = await handler(new Request('https://x.supabase.co/functions/v1/api'));
  assert.strictEqual((await h.json()).version, '2.0.0'); ok('health check reports the version');
  await db.close(); await dropAll();
  console.log(`\n${n} edge bundle checks passed`);
  process.exit(0); // the bundle's own connection pool stays open, as it would in the Edge runtime
})().catch(async (e) => { console.error(e); try { await dropAll(); } catch (x) { /* ignore */ } process.exit(1); });

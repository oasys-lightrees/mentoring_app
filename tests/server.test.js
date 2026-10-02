// API-level tests for server/Code.gs: auth, tenant isolation, password redaction, governance rules, audit.
const assert = require('assert');
const { createServer } = require('./gas-harness');
const crypto = require('crypto');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const acc = (id, email, role, pw, extra) => Object.assign({ id, name: id, email, role, active: true, salt: 's' + id, pw: sha('s' + id + ':' + pw) }, extra || {});

const srv = createServer();
srv.setup();
const pwLine = srv.logs.find((l) => l.includes('one-time password'));
const adminPw = pwLine.match(/one-time password: (\S+)/)[1];
let n = 0; const ok = (name) => { n++; console.log('  ✓ ' + name); };

// Platform login
let r = srv.post({ action: 'login', email: 'super@lightech.co.id', password: 'nope' });
assert.strictEqual(r.ok, false); ok('wrong admin password rejected');
r = srv.post({ action: 'login', email: 'super@lightech.co.id', password: adminPw });
assert.ok(r.ok && r.session.kind === 'platform'); const P = r.token; ok('Lightech admin signs in with the setup password');

// Platform creates two companies
const metaA = { name: 'AlphaLeaders', slug: 'alphaleaders', status: 'active', config: { brandName: 'AlphaLeaders', demoLogin: true, labels: { lead: 'Lead' } }, accounts: [acc('a-owner', 'owner@al.id', 'superadmin', 'demo'), acc('a-bd', 'bd@al.id', 'bd', 'demo'), acc('a-cl', 'client@al.id', 'client', 'demo')], programs: [] };
const metaB = { name: 'PIWA', slug: 'piwa', status: 'active', config: { brandName: 'PIWA', demoLogin: false }, accounts: [acc('b-owner', 'owner@piwa.id', 'superadmin', 'secret1')], programs: [] };
r = srv.post({ action: 'batch', token: P, ops: [
  { op: 'set', path: 'ws/A', data: metaA }, { op: 'set', path: 'ws/A/leads/L1', data: { id: 'L1', name: 'Budi' } },
  { op: 'set', path: 'ws/B', data: metaB }, { op: 'set', path: 'ws/B/leads/L9', data: { id: 'L9', name: 'Secret PIWA lead' } }
] });
assert.ok(r.ok); ok('Lightech creates companies');

// Branding endpoint: only that company, no hashes
r = srv.post({ action: 'brand', slug: 'alphaleaders' });
assert.ok(r.ok && r.config.brandName === 'AlphaLeaders' && !JSON.stringify(r).includes('PIWA') && !JSON.stringify(r).includes('"pw"')); ok('brand returns only AlphaLeaders, no password hashes');
r = srv.post({ action: 'brand', slug: 'piwa' });
assert.ok(r.ok && r.chips.length === 0); ok('no demo buttons when demo sign-in is off');

// Tenant login scoped by slug
r = srv.post({ action: 'login', email: 'owner@piwa.id', password: 'secret1', slug: 'alphaleaders' });
assert.strictEqual(r.ok, false); ok('PIWA owner cannot sign in through the AlphaLeaders page');
r = srv.post({ action: 'login', email: 'owner@al.id', password: 'demo', slug: 'alphaleaders' });
assert.ok(r.ok && r.session.wsId === 'A'); const A = r.token; ok('AlphaLeaders owner signs in');

// Isolation
r = srv.post({ action: 'list', token: A, collection: 'ws' });
assert.deepStrictEqual(r.docs.map((d) => d.id), ['A']); ok('owner lists only their own company');
assert.ok(!JSON.stringify(r).includes('"pw"') && !JSON.stringify(r).includes('"salt"')); ok('password hashes never leave the server');
r = srv.post({ action: 'list', token: A, collection: 'ws/B/leads' });
assert.strictEqual(r.docs.length, 0); ok('cannot list another company\'s leads');
r = srv.post({ action: 'get', token: A, path: 'ws/B' });
assert.strictEqual(r.error, 'forbidden'); ok('cannot read another company\'s config');
r = srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/B/leads/X', data: { id: 'X' } }] });
assert.strictEqual(r.error, 'forbidden'); ok('cannot write into another company');
r = srv.post({ action: 'get', token: A, path: 'platform/main' });
assert.strictEqual(r.error, 'forbidden'); ok('cannot read Lightech admin data');
r = srv.post({ action: 'changes', token: A, since: 0 });
assert.ok(r.docs.every((d) => d.path === 'ws/A' || d.path.startsWith('ws/A/'))); ok('change feed only contains own company');

// Governance: owner saves config without hashes → hashes kept; slug/status protected
const red = srv.post({ action: 'get', token: A, path: 'ws/A' }).data;
red.config.brandName = 'AlphaLeaders Pro'; red.slug = 'hijack'; red.status = 'active';
r = srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/A', data: red }] });
assert.ok(r.ok); ok('owner saves own branding');
r = srv.post({ action: 'login', email: 'bd@al.id', password: 'demo', slug: 'alphaleaders' });
assert.ok(r.ok); const BD = r.token; ok('existing passwords survive a config save (hashes merged server-side)');
assert.strictEqual(srv.post({ action: 'brand', slug: 'alphaleaders' }).config.brandName, 'AlphaLeaders Pro'); ok('login code cannot be changed by the company');
r = srv.post({ action: 'batch', token: BD, ops: [{ op: 'set', path: 'ws/A', data: red }] });
assert.strictEqual(r.error, 'forbidden'); ok('BD cannot change company config');
r = srv.post({ action: 'batch', token: BD, ops: [{ op: 'del', path: 'ws/A/leads/L1' }] });
assert.strictEqual(r.error, 'forbidden'); ok('BD cannot delete records');
r = srv.post({ action: 'batch', token: BD, ops: [{ op: 'set', path: 'ws/A/leads/L2', data: { id: 'L2', name: 'New lead' } }] });
assert.ok(r.ok); ok('BD adds a lead');
const CL = srv.post({ action: 'login', email: 'client@al.id', password: 'demo', slug: 'alphaleaders' }).token;
r = srv.post({ action: 'batch', token: CL, ops: [{ op: 'set', path: 'ws/A/leads/L3', data: { id: 'L3' } }] });
assert.strictEqual(r.error, 'forbidden'); ok('client portal cannot create leads');

// Suspend → sign-in blocked and live session ends
const metaNow = srv.post({ action: 'get', token: P, path: 'ws/A' }).data; metaNow.status = 'suspended';
assert.ok(srv.post({ action: 'batch', token: P, ops: [{ op: 'set', path: 'ws/A', data: metaNow }] }).ok);
assert.strictEqual(srv.post({ action: 'whoami', token: A }).error, 'auth'); ok('suspending a company ends its sessions');
assert.strictEqual(srv.post({ action: 'login', email: 'owner@al.id', password: 'demo', slug: 'alphaleaders' }).error, 'suspended'); ok('suspended company cannot sign in');

// Brute force lockout
for (let i = 0; i < 5; i++) srv.post({ action: 'login', email: 'owner@piwa.id', password: 'x' + i });
assert.strictEqual(srv.post({ action: 'login', email: 'owner@piwa.id', password: 'secret1' }).error, 'locked'); ok('5 failed attempts lock the account for 15 minutes');

// Audit
r = srv.post({ action: 'audit', token: P, limit: 100 });
assert.ok(r.ok && r.rows.some((x) => x.action === 'login_failed') && r.rows.some((x) => x.action === 'save')); ok('audit log records sign-ins, failures and saves');
console.log(`\n${n} server checks passed`);

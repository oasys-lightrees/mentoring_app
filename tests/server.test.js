// API-level tests for the real server (server/core.js + server/pg.js) on PostgreSQL: auth, tenant isolation,
// password redaction, governance rules, audit, first-time setup, the HTTP layer and database guarantees.
const assert = require('assert');
const { createServer, dropAll } = require('./pg-harness');
const crypto = require('crypto');
const sha = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');
const acc = (id, email, role, pw, extra) => Object.assign({ id, name: id, email, role, active: true, salt: 's' + id, pw: sha('s' + id + ':' + pw) }, extra || {});

(async () => {
const srv = await createServer();
const { adminPw } = await srv.setup();
let n = 0; const ok = (name) => { n++; console.log('  ✓ ' + name); };

// Platform login
let r = (await srv.post({ action: 'login', email: 'super@lightech.co.id', password: 'nope' }));
assert.strictEqual(r.ok, false); ok('wrong admin password rejected');
r = (await srv.post({ action: 'login', email: 'super@lightech.co.id', password: adminPw }));
assert.ok(r.ok && r.session.kind === 'platform'); const P = r.token; ok('Lightech admin signs in with the setup password');

// Platform creates two companies
const metaA = { name: 'AlphaLeaders', slug: 'alphaleaders', status: 'active', config: { brandName: 'AlphaLeaders', demoLogin: true, labels: { lead: 'Lead' } }, accounts: [acc('a-owner', 'owner@al.id', 'superadmin', 'demo'), acc('a-bd', 'bd@al.id', 'bd', 'demo'), acc('a-cl', 'client@al.id', 'client', 'demo')], programs: [] };
const metaB = { name: 'PIWA', slug: 'piwa', status: 'active', config: { brandName: 'PIWA', demoLogin: false }, accounts: [acc('b-owner', 'owner@piwa.id', 'superadmin', 'secret1')], programs: [] };
r = (await srv.post({ action: 'batch', token: P, ops: [
  { op: 'set', path: 'ws/A', data: metaA }, { op: 'set', path: 'ws/A/leads/L1', data: { id: 'L1', name: 'Budi' } },
  { op: 'set', path: 'ws/B', data: metaB }, { op: 'set', path: 'ws/B/leads/L9', data: { id: 'L9', name: 'Secret PIWA lead' } }
] }));
assert.ok(r.ok); ok('Lightech creates companies');

// Branding endpoint: only that company, no hashes
r = (await srv.post({ action: 'brand', slug: 'alphaleaders' }));
assert.ok(r.ok && r.config.brandName === 'AlphaLeaders' && !JSON.stringify(r).includes('PIWA') && !JSON.stringify(r).includes('"pw"')); ok('brand returns only AlphaLeaders, no password hashes');
r = (await srv.post({ action: 'brand', slug: 'piwa' }));
assert.ok(r.ok && r.chips.length === 0); ok('no demo buttons when demo sign-in is off');

// Tenant login scoped by slug
r = (await srv.post({ action: 'login', email: 'owner@piwa.id', password: 'secret1', slug: 'alphaleaders' }));
assert.strictEqual(r.ok, false); ok('PIWA owner cannot sign in through the AlphaLeaders page');
r = (await srv.post({ action: 'login', email: 'owner@al.id', password: 'demo', slug: 'alphaleaders' }));
assert.ok(r.ok && r.session.wsId === 'A'); const A = r.token; ok('AlphaLeaders owner signs in');

// Isolation
r = (await srv.post({ action: 'list', token: A, collection: 'ws' }));
assert.deepStrictEqual(r.docs.map((d) => d.id), ['A']); ok('owner lists only their own company');
assert.ok(!JSON.stringify(r).includes('"pw"') && !JSON.stringify(r).includes('"salt"')); ok('password hashes never leave the server');
r = (await srv.post({ action: 'list', token: A, collection: 'ws/B/leads' }));
assert.strictEqual(r.docs.length, 0); ok('cannot list another company\'s leads');
r = (await srv.post({ action: 'get', token: A, path: 'ws/B' }));
assert.strictEqual(r.error, 'forbidden'); ok('cannot read another company\'s config');
r = (await srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/B/leads/X', data: { id: 'X' } }] }));
assert.strictEqual(r.error, 'forbidden'); ok('cannot write into another company');
r = (await srv.post({ action: 'get', token: A, path: 'platform/main' }));
assert.strictEqual(r.error, 'forbidden'); ok('cannot read Lightech admin data');
r = (await srv.post({ action: 'changes', token: A, since: 0 }));
assert.ok(r.docs.every((d) => d.path === 'ws/A' || d.path.startsWith('ws/A/'))); ok('change feed only contains own company');

// Governance: owner saves config without hashes → hashes kept; slug/status protected
const red = (await srv.post({ action: 'get', token: A, path: 'ws/A' })).data;
red.config.brandName = 'AlphaLeaders Pro'; red.slug = 'hijack'; red.status = 'active';
r = (await srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/A', data: red }] }));
assert.ok(r.ok); ok('owner saves own branding');
r = (await srv.post({ action: 'login', email: 'bd@al.id', password: 'demo', slug: 'alphaleaders' }));
assert.ok(r.ok); const BD = r.token; ok('existing passwords survive a config save (hashes merged server-side)');
assert.strictEqual((await srv.post({ action: 'brand', slug: 'alphaleaders' })).config.brandName, 'AlphaLeaders Pro'); ok('login code cannot be changed by the company');
r = (await srv.post({ action: 'batch', token: BD, ops: [{ op: 'set', path: 'ws/A', data: red }] }));
assert.strictEqual(r.error, 'forbidden'); ok('BD cannot change company config');
r = (await srv.post({ action: 'batch', token: BD, ops: [{ op: 'del', path: 'ws/A/leads/L1' }] }));
assert.strictEqual(r.error, 'forbidden'); ok('BD cannot delete records');
r = (await srv.post({ action: 'batch', token: BD, ops: [{ op: 'set', path: 'ws/A/leads/L2', data: { id: 'L2', name: 'New lead' } }] }));
assert.ok(r.ok); ok('BD adds a lead');
const CL = (await srv.post({ action: 'login', email: 'client@al.id', password: 'demo', slug: 'alphaleaders' })).token;
r = (await srv.post({ action: 'batch', token: CL, ops: [{ op: 'set', path: 'ws/A/leads/L3', data: { id: 'L3' } }] }));
assert.strictEqual(r.error, 'forbidden'); ok('client portal cannot create leads');

// Least privilege inside a company: every role only sees what its job needs
const meta2 = (await srv.post({ action: 'get', token: A, path: 'ws/A' })).data;
meta2.accounts.push(acc('a-adm', 'adm@al.id', 'admin', 'demo'), acc('a-m', 'mentor@al.id', 'mentor', 'demo'));
meta2.accounts.find((a) => a.id === 'a-cl').clientId = 'C1';
r = (await srv.post({ action: 'batch', token: A, ops: [
  { op: 'set', path: 'ws/A', data: meta2 },
  { op: 'set', path: 'ws/A/leads/L4', data: { id: 'L4', name: 'Own BD lead', phone: '0811', ownerId: 'a-bd', stageId: 's1', value: 5 } },
  { op: 'set', path: 'ws/A/leads/L5', data: { id: 'L5', name: 'Rina Client', phone: '0822', email: 'rina@x.id', notes: 'private', ownerId: 'a-owner', stageId: 'won', value: 50 } },
  { op: 'set', path: 'ws/A/clients/C1', data: { id: 'C1', leadId: 'L5', coachId: 'a-m' } },
  { op: 'set', path: 'ws/A/sessions/S1', data: { id: 'S1', leadId: 'L5', mentorId: 'a-m', actions: [] } },
  { op: 'set', path: 'ws/A/sessions/S2', data: { id: 'S2', leadId: 'L1', mentorId: 'someone-else' } }
] }));
assert.ok(r.ok); ok('owner adds team members, clients and sessions');
const docsById = (res) => Object.fromEntries(res.docs.map((d) => [d.id, d.data]));
let L = docsById((await srv.post({ action: 'list', token: BD, collection: 'ws/A/leads' })));
assert.ok(L.L4.name === 'Own BD lead' && !L.L4.restricted); ok('BD sees own leads in full');
assert.ok(L.L5.restricted && !L.L5.name && !L.L5.phone && !L.L5.email && !L.L5.notes && L.L5.value === 50); ok('BD sees other leads as numbers only (leaderboard), no names/phones/notes');
assert.strictEqual((await srv.post({ action: 'batch', token: BD, ops: [{ op: 'set', path: 'ws/A/leads/L5', data: { id: 'L5', name: 'x' } }] })).error, 'forbidden'); ok('BD cannot overwrite a lead it only sees as numbers');
assert.strictEqual((await srv.post({ action: 'list', token: BD, collection: 'ws/A/sessions' })).docs.length, 0); ok('BD does not see sessions of other people\'s leads');
assert.strictEqual((await srv.post({ action: 'get', token: BD, path: 'ws/A/clients/C1' })).error, 'forbidden'); ok('BD cannot open another person\'s client');
const CL2 = (await srv.post({ action: 'login', email: 'client@al.id', password: 'demo', slug: 'alphaleaders' })).token;
L = docsById((await srv.post({ action: 'list', token: CL2, collection: 'ws/A/leads' })));
assert.deepStrictEqual(Object.keys(L), ['L5']); ok('client portal sees only their own record');
assert.deepStrictEqual((await srv.post({ action: 'list', token: CL2, collection: 'ws/A/sessions' })).docs.map((d) => d.id), ['S1']); ok('client sees only their own sessions');
const accView = (await srv.post({ action: 'get', token: CL2, path: 'ws/A' })).data.accounts;
assert.ok(accView.every((a) => a.id === 'a-cl' || !a.email)); ok('client cannot see team emails');
assert.ok((await srv.post({ action: 'batch', token: CL2, ops: [{ op: 'set', path: 'ws/A/sessions/S1', data: { id: 'S1', leadId: 'L5', mentorId: 'a-m', actions: [{ t: 'Read book', done: true }] } }] })).ok); ok('client ticks action items on own session');
assert.strictEqual((await srv.post({ action: 'batch', token: CL2, ops: [{ op: 'set', path: 'ws/A/sessions/S9', data: { id: 'S9' } }] })).error, 'forbidden'); ok('client cannot create sessions');
assert.strictEqual((await srv.post({ action: 'batch', token: CL2, ops: [{ op: 'del', path: 'ws/A/sessions/S1' }] })).error, 'forbidden'); ok('client cannot delete sessions');
const M = (await srv.post({ action: 'login', email: 'mentor@al.id', password: 'demo', slug: 'alphaleaders' })).token;
assert.deepStrictEqual((await srv.post({ action: 'list', token: M, collection: 'ws/A/sessions' })).docs.map((d) => d.id), ['S1']); ok('mentor sees only own sessions');
L = docsById((await srv.post({ action: 'list', token: M, collection: 'ws/A/leads' })));
assert.ok(L.L5.name === 'Rina Client' && L.L4.restricted); ok('mentor sees own clients in full, other leads as numbers');
assert.strictEqual((await srv.post({ action: 'batch', token: M, ops: [{ op: 'del', path: 'ws/A/sessions/S2' }] })).error, 'forbidden'); ok('mentor cannot delete another coach\'s session');
assert.ok((await srv.post({ action: 'batch', token: M, ops: [{ op: 'set', path: 'ws/A/sessions/S3', data: { id: 'S3', leadId: 'L5', mentorId: 'a-m' } }] })).ok); ok('mentor books a session');
const ch = (await srv.post({ action: 'changes', token: BD, since: 0 }));
assert.ok(!JSON.stringify(ch).includes('Rina') && ch.docs.some((d) => d.path === 'ws/A/sessions/S1' && d.deleted)); ok('change feed hides out-of-scope records from BD');

// Company admin cannot touch the Owner
const ADM = (await srv.post({ action: 'login', email: 'adm@al.id', password: 'demo', slug: 'alphaleaders' })).token;
const m3 = (await srv.post({ action: 'get', token: ADM, path: 'ws/A' })).data;
m3.accounts.find((a) => a.id === 'a-owner').email = 'attacker@evil.id';
m3.accounts.push(acc('a-evil', 'evil@al.id', 'superadmin', 'x'));
m3.accounts.find((a) => a.id === 'a-bd').role = 'superadmin';
assert.ok((await srv.post({ action: 'batch', token: ADM, ops: [{ op: 'set', path: 'ws/A', data: m3 }] })).ok);
const accs = (await srv.post({ action: 'get', token: A, path: 'ws/A' })).data.accounts;
assert.ok(accs.find((a) => a.id === 'a-owner').email === 'owner@al.id'); ok('admin cannot change the Owner account');
assert.ok(!accs.find((a) => a.id === 'a-evil') && accs.find((a) => a.id === 'a-bd').role === 'bd'); ok('admin cannot create or promote Owners');
const m4 = (await srv.post({ action: 'get', token: ADM, path: 'ws/A' })).data; m4.accounts = m4.accounts.filter((a) => a.id !== 'a-owner');
(await srv.post({ action: 'batch', token: ADM, ops: [{ op: 'set', path: 'ws/A', data: m4 }] }));
assert.ok((await srv.post({ action: 'get', token: A, path: 'ws/A' })).data.accounts.some((a) => a.id === 'a-owner')); ok('admin cannot remove the Owner');
assert.strictEqual((await srv.post({ action: 'batch', token: ADM, ops: [{ op: 'del', path: 'ws/A' }] })).error, 'forbidden'); ok('nobody inside a company can delete the company');

// Input validation & sync safety
assert.strictEqual((await srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/A/leads/L7' }] })).error, 'invalid'); ok('a save without data is rejected');
assert.strictEqual((await srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/A/leads', data: {} }] })).error, 'invalid'); ok('collection paths cannot be overwritten');
r = (await srv.post({ action: 'list', token: A, collection: 'ws/A/leads' }));
assert.ok(r.now <= Date.now() - 4000); ok('sync cursor overlaps by 5 s so concurrent saves are never missed');

// Lightech Admin vs Super Admin
const plat = (await srv.post({ action: 'get', token: P, path: 'platform/main' })).data;
plat.admins.push(acc('lt-2', 'ops@lightech.co.id', 'admin', 'opspass'));
assert.ok((await srv.post({ action: 'batch', token: P, ops: [{ op: 'set', path: 'platform/main', data: plat }] })).ok);
const OPS = (await srv.post({ action: 'login', email: 'ops@lightech.co.id', password: 'opspass' })).token;
assert.ok(OPS); ok('Super Admin adds a Lightech Admin');
assert.strictEqual((await srv.post({ action: 'batch', token: OPS, ops: [{ op: 'del', path: 'ws/B' }] })).error, 'forbidden'); ok('Lightech Admin cannot delete a company');
const p2 = (await srv.post({ action: 'get', token: OPS, path: 'platform/main' })).data;
p2.admins.find((a) => a.id === 'lt-owner').email = 'hijack@x.id'; p2.admins.find((a) => a.id === 'lt-2').name = 'Ops Team';
p2.admins.push(acc('lt-3', 'new@x.id', 'owner', 'x'));
assert.ok((await srv.post({ action: 'batch', token: OPS, ops: [{ op: 'set', path: 'platform/main', data: p2 }] })).ok);
const p3 = (await srv.post({ action: 'get', token: P, path: 'platform/main' })).data.admins;
assert.ok(p3.find((a) => a.id === 'lt-owner').email === 'super@lightech.co.id' && !p3.find((a) => a.id === 'lt-3') && p3.find((a) => a.id === 'lt-2').name === 'Ops Team'); ok('Lightech Admin can only edit their own profile');

// Public lead form (web / Meta ads landing page → CRM)
const capLead = { action: 'capture', slug: 'alphaleaders', name: 'Form Lead', phone: '0812 7777 8888', email: 'f@x.id', message: 'Interested' };
assert.strictEqual((await srv.post(capLead)).error, 'closed'); ok('public form is closed until the company switches it on');
const m5 = (await srv.post({ action: 'get', token: A, path: 'ws/A' })).data;
m5.config.publicForm = true; m5.config.stages = [{ id: 'new', type: 'open' }, { id: 'won', type: 'won' }]; m5.programs = [{ id: 'P1', name: 'Mastery', price: 25000000 }];
assert.ok((await srv.post({ action: 'batch', token: A, ops: [{ op: 'set', path: 'ws/A', data: m5 }] })).ok);
const br = (await srv.post({ action: 'brand', slug: 'alphaleaders' }));
assert.ok(br.config.publicForm && br.programs.length === 1 && !('price' in br.programs[0])); ok('form page gets program names, never prices or team data');
assert.ok((await srv.post(Object.assign({}, capLead, { programId: 'P1' }))).ok);
const capped = (await srv.post({ action: 'list', token: A, collection: 'ws/A/leads' })).docs.map((d) => d.data).find((l) => l.name === 'Form Lead');
assert.ok(capped && capped.stageId === 'new' && capped.ownerId === 'a-bd' && capped.value === 25000000 && capped.source === 'Website form'); ok('form submission lands in the first stage, auto-assigned to a BD, valued from the program');
const before = (await srv.post({ action: 'list', token: A, collection: 'ws/A/leads' })).docs.length;
assert.ok((await srv.post(Object.assign({}, capLead, { phone: '+62 812-7777-8888' }))).duplicate); ok('same WhatsApp number is not added twice');
assert.ok((await srv.post(Object.assign({}, capLead, { phone: '081300001111', website: 'http://spam' }))).ok);
assert.strictEqual((await srv.post({ action: 'list', token: A, collection: 'ws/A/leads' })).docs.length, before); ok('honeypot silently drops bots');
assert.strictEqual((await srv.post(Object.assign({}, capLead, { phone: '123' }))).error, 'invalid'); ok('invalid phone rejected');
let busy = false; for (let i = 0; i < 40 && !busy; i++) busy = (await srv.post(Object.assign({}, capLead, { name: 'Flood ' + i, phone: '0819' + String(1000000 + i) }))).error === 'busy';
assert.ok(busy); ok('flooding the form is rate-limited');
assert.ok((await srv.post({ action: 'audit', token: P, limit: 500 })).rows.some((x) => x.action === 'capture')); ok('form submissions are in the audit log');

// Suspend → sign-in blocked and live session ends
const metaNow = (await srv.post({ action: 'get', token: P, path: 'ws/A' })).data; metaNow.status = 'suspended';
assert.ok((await srv.post({ action: 'batch', token: P, ops: [{ op: 'set', path: 'ws/A', data: metaNow }] })).ok);
assert.strictEqual((await srv.post({ action: 'whoami', token: A })).error, 'auth'); ok('suspending a company ends its sessions');
assert.strictEqual((await srv.post({ action: 'login', email: 'owner@al.id', password: 'demo', slug: 'alphaleaders' })).error, 'suspended'); ok('suspended company cannot sign in');

// Brute force lockout
for (let i = 0; i < 5; i++) (await srv.post({ action: 'login', email: 'owner@piwa.id', password: 'x' + i }));
assert.strictEqual((await srv.post({ action: 'login', email: 'owner@piwa.id', password: 'secret1' })).error, 'locked'); ok('5 failed attempts lock the account for 15 minutes');

// Audit
r = (await srv.post({ action: 'audit', token: P, limit: 100 }));
assert.ok(r.ok && r.rows.some((x) => x.action === 'login_failed') && r.rows.some((x) => x.action === 'save')); ok('audit log records sign-ins, failures and saves');

// One-click company setup for go-live
const fresh = await createServer();
assert.strictEqual((await fresh.post({ action: 'brand', slug: 'alphaleaders' })).error, 'setup_required'); ok('a new database asks for setup first');
assert.ok((await fresh.post({ action: 'ping' })).setup); ok('ping tells the app that setup is needed');
assert.strictEqual((await fresh.post({ action: 'setup', code: 'WRONG', email: 'x@y.id', password: 'long-password-1' })).error, 'invalid'); ok('setup needs the one-time setup code from the database');
const freshSetup = await fresh.setup({ alphaleaders: true });
assert.strictEqual((await fresh.post({ action: 'setup', code: 'anything', email: 'x@y.id', password: 'long-password-1' })).error, 'forbidden'); ok('setup runs once; the code is consumed');
assert.strictEqual(await fresh.setupCode(), ''); ok('setup code is deleted from the database after use');
const pwOf = (srvX, email) => freshSetup.team.find((x) => x.email.startsWith(email)).password;
const ownerPw = pwOf(fresh, 'ferly@alphaleaders.id');
const fb = (await fresh.post({ action: 'brand', slug: 'alphaleaders' }));
assert.ok(fb.ok && fb.config.logo.endsWith('alphaleaders-logo.png') && fb.config.bar === '#0a0a0a' && fb.chips.length === 0); ok('AlphaLeaders ships with its logo and theme, demo sign-in off');
const fo = (await fresh.post({ action: 'login', email: 'ferly@alphaleaders.id', password: ownerPw, slug: 'alphaleaders' }));
const ferryPw = pwOf(fresh, 'ferry@alphaleaders.id');
const fy = (await fresh.post({ action: 'login', email: 'ferry@alphaleaders.id', password: ferryPw, slug: 'alphaleaders' }));
assert.ok(fo.ok && fy.ok && fo.session.role === 'superadmin' && fy.session.role === 'superadmin' && ownerPw !== ferryPw); ok('both AlphaLeaders Owners (Ferly, Ferry) sign in with their own one-time passwords');
assert.strictEqual((await fresh.post({ action: 'login', email: 'ferly@alphaleaders.id', password: 'demo', slug: 'alphaleaders' })).ok, false); ok('no default password on the production company');
assert.ok(freshSetup.team.length === 12 && new Set(freshSetup.team.map((x) => x.password)).size === 12); ok('setup creates the whole AlphaLeaders team (12 people), each with their own one-time password');
const julia = (await fresh.post({ action: 'login', email: 'julia@alphaleaders.id', password: pwOf(fresh, 'julia@'), slug: 'alphaleaders' }));
assert.ok(julia.ok && julia.session.role === 'bd'); ok('team members sign in with their one-time password');
let jm = (await fresh.post({ action: 'get', token: julia.token, path: 'ws/' + julia.session.wsId })).data.accounts.find((a) => a.email === 'julia@alphaleaders.id');
assert.ok(jm.mustChange); ok('first sign-in is flagged: a new password is required');
assert.strictEqual((await fresh.post({ action: 'password', token: julia.token, oldPassword: 'wrong', newPassword: 'julia-secret-1' })).error, 'invalid'); ok('changing a password needs the current one');
assert.strictEqual((await fresh.post({ action: 'password', token: julia.token, oldPassword: pwOf(fresh, 'julia@'), newPassword: 'short' })).error, 'invalid'); ok('new passwords need at least 8 characters');
assert.ok((await fresh.post({ action: 'password', token: julia.token, oldPassword: pwOf(fresh, 'julia@'), newPassword: 'julia-secret-1' })).ok); ok('a BD changes their own password (no admin rights needed)');
assert.ok((await fresh.post({ action: 'login', email: 'julia@alphaleaders.id', password: 'julia-secret-1', slug: 'alphaleaders' })).ok && !(await fresh.post({ action: 'login', email: 'julia@alphaleaders.id', password: pwOf(fresh, 'julia@'), slug: 'alphaleaders' })).ok); ok('the one-time password stops working');
// Owner saves settings with a stale copy that still says mustChange: the server keeps its own flag
const fo2 = (await fresh.post({ action: 'login', email: 'ferly@alphaleaders.id', password: ownerPw, slug: 'alphaleaders' }));
const stale = (await fresh.post({ action: 'get', token: fo2.token, path: 'ws/' + fo2.session.wsId })).data;
stale.accounts.find((a) => a.email === 'julia@alphaleaders.id').mustChange = true;
assert.ok((await fresh.post({ action: 'batch', token: fo2.token, ops: [{ op: 'set', path: 'ws/' + fo2.session.wsId, data: stale }] })).ok);
jm = (await fresh.post({ action: 'get', token: fo2.token, path: 'ws/' + fo2.session.wsId })).data.accounts.find((a) => a.email === 'julia@alphaleaders.id');
assert.ok(!jm.mustChange); ok('the first-sign-in flag is controlled by the server, not by a saved copy');
const reset = (await fresh.post({ action: 'get', token: fo2.token, path: 'ws/' + fo2.session.wsId })).data;
const resetAcc = reset.accounts.find((a) => a.email === 'paul@alphaleaders.id'); resetAcc.salt = 'x1'; resetAcc.pw = sha('x1:temporary-123');
(await fresh.post({ action: 'batch', token: fo2.token, ops: [{ op: 'set', path: 'ws/' + fo2.session.wsId, data: reset }] }));
assert.ok((await fresh.post({ action: 'get', token: fo2.token, path: 'ws/' + fo2.session.wsId })).data.accounts.find((a) => a.email === 'paul@alphaleaders.id').mustChange); ok('a password set by the Owner must be changed at next sign-in');

// Passwords: PBKDF2 at rest; older SHA-256 hashes still work and are upgraded on change
const wsRow = (await fresh.sql`select data from companies where slug = 'alphaleaders'`)[0].data;
assert.ok(wsRow.accounts.filter((a) => a.email !== 'paul@alphaleaders.id').every((a) => /^pbkdf2\$\d+\$[0-9a-f]{64}$/.test(a.pw) && a.salt.length >= 32)); ok('passwords are stored as salted PBKDF2-SHA256 hashes');
const paulTmp = await fresh.post({ action: 'login', email: 'paul@alphaleaders.id', password: 'temporary-123', slug: 'alphaleaders' });
assert.ok(paulTmp.ok); ok('a password set in the browser (legacy SHA-256) still signs in');
assert.ok((await fresh.post({ action: 'password', token: paulTmp.token, oldPassword: 'temporary-123', newPassword: 'paul-own-pass-9' })).ok);
const paulRow = (await fresh.sql`select data from companies where slug = 'alphaleaders'`)[0].data.accounts.find((a) => a.email === 'paul@alphaleaders.id');
assert.ok(paulRow.pw.startsWith('pbkdf2$') && !paulRow.mustChange); ok('choosing an own password upgrades the hash to PBKDF2');

// Database guarantees
const wsId = fo2.session.wsId;
const many = Array.from({ length: 25 }, (_, i) => fresh.post({ action: 'batch', token: fo2.token, ops: [{ op: 'set', path: `ws/${wsId}/leads/P${i}`, data: { id: 'P' + i, name: 'Parallel ' + i, phone: '0812' + (5550000 + i), value: 1000 * i, stageId: 'new', ownerId: 'b-rina' } }] }));
assert.ok((await Promise.all(many)).every((x) => x.ok)); ok('25 simultaneous saves all succeed');
const leadRows = await fresh.sql`select id, name, value, stage_id, owner_id from leads where company_id = ${wsId} and id like 'P%'`;
assert.strictEqual(leadRows.length, 25); ok('no save is lost under concurrency');
assert.ok(leadRows.every((x) => x.name.startsWith('Parallel') && Number(x.value) >= 0 && x.stage_id === 'new' && x.owner_id === 'b-rina')); ok('typed SQL columns (name, value, stage, owner) are filled for reporting');
const feed = await fresh.post({ action: 'changes', token: fo2.token, since: 0 });
const stamps = feed.docs.length;
assert.ok(stamps >= 26); ok('change feed returns every record of the company');
const tsRows = await fresh.sql`select updated_at from leads where company_id = ${wsId} and id like 'P%' order by updated_at`;
assert.strictEqual(new Set(tsRows.map((x) => String(x.updated_at))).size, 25); ok('every save gets its own strictly increasing timestamp');
assert.ok((await fresh.post({ action: 'batch', token: fo2.token, ops: [{ op: 'del', path: `ws/${wsId}/leads/P0` }] })).ok);
const tomb = (await fresh.sql`select deleted, data from leads where company_id = ${wsId} and id = 'P0'`)[0];
assert.ok(tomb.deleted && tomb.data === null); ok('deletes leave a tombstone so other devices drop the record');
assert.strictEqual((await fresh.post({ action: 'batch', token: fo2.token, ops: [{ op: 'set', path: `ws/${wsId}/notes/N1`, data: { id: 'N1' } }] })).error, 'invalid'); ok('only known record types can be written');
await assert.rejects(fresh.sql`update audit_log set actor = 'x'`); await assert.rejects(fresh.sql`delete from audit_log`); ok('audit log is append-only at the database level');
const rls = await fresh.sql`select count(*)::int as n from pg_class where relname in ('platform','companies','leads','sessions','clients','audit_log','kv','app_setup') and relrowsecurity`;
assert.strictEqual(rls[0].n, 8); ok('row level security is on for every table');
await assert.rejects(fresh.sql.begin(async (tx) => { await tx`set local role anon`; await tx`select * from leads`; })); ok('public (anon) database key cannot read any table');
const tok = (await fresh.sql`select expires_at from kv where key like 'tok:%' limit 1`)[0];
assert.ok(Number(tok.expires_at) > Date.now() + 7 * 3600 * 1000); ok('sign-in sessions are stored server-side with an 8-hour expiry');
const logout = await fresh.post({ action: 'login', email: 'julia@alphaleaders.id', password: 'julia-secret-1', slug: 'alphaleaders' });
await fresh.post({ action: 'logout', token: logout.token });
assert.strictEqual((await fresh.post({ action: 'whoami', token: logout.token })).error, 'auth'); ok('signing out ends the session on the server');
await fresh.sql`update kv set expires_at = ${Date.now() - 1} where key = ${'tok:' + fo2.token}`;
assert.strictEqual((await fresh.post({ action: 'whoami', token: fo2.token })).error, 'auth'); ok('expired sessions are refused');
assert.strictEqual(fresh.errors.length, 0, fresh.errors.join('\n')); ok('no server errors logged');

// HTTP layer (what the Edge Function serves)
const H = fresh.handler;
let hr = await H(new Request('https://api.test/', { method: 'GET' }));
assert.ok(hr.status === 200 && (await hr.json()).ok); ok('GET answers a JSON health check');
hr = await H(new Request('https://api.test/', { method: 'POST', body: JSON.stringify({ action: 'brand', slug: 'alphaleaders' }), headers: { 'Content-Type': 'text/plain;charset=utf-8', Origin: 'https://crm.example' } }));
const hb = await hr.json();
assert.ok(hb.ok && hb.config.brandName === 'AlphaLeaders' && hr.headers.get('access-control-allow-origin') === '*' && hr.headers.get('cache-control') === 'no-store'); ok('POST text/plain works cross-origin, never cached');
hr = await H(new Request('https://api.test/', { method: 'OPTIONS', headers: { Origin: 'https://crm.example' } }));
assert.ok(hr.status === 204 && /POST/.test(hr.headers.get('access-control-allow-methods'))); ok('CORS preflight answered');
hr = await H(new Request('https://api.test/', { method: 'POST', body: '{not json' }));
assert.strictEqual((await hr.json()).error, 'invalid'); ok('bad JSON is rejected cleanly');
const locked = await createServer({ http: { allowedOrigins: 'https://crm.alphaleaders.id' } });
hr = await locked.handler(new Request('https://api.test/', { method: 'POST', body: '{"action":"ping"}', headers: { Origin: 'https://evil.example' } }));
assert.strictEqual(hr.status, 403); ok('ALLOWED_ORIGINS blocks other websites');
hr = await locked.handler(new Request('https://api.test/', { method: 'POST', body: '{"action":"ping"}', headers: { Origin: 'https://crm.alphaleaders.id' } }));
assert.ok(hr.status === 200 && hr.headers.get('access-control-allow-origin') === 'https://crm.alphaleaders.id'); ok('ALLOWED_ORIGINS lets the CRM website in');

assert.strictEqual(srv.errors.length, 0, srv.errors.join('\n'));
await srv.close(); await fresh.close(); await locked.close(); await dropAll();
console.log(`\n${n} server checks passed (PostgreSQL)`);
})().catch(async (e) => { console.error(e); try { await dropAll(); } catch (x) { /* ignore */ } process.exit(1); });

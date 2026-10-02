// Browser end-to-end: the real app (index.html) talking to server/Code.gs through the harness.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const path = require('path');
const { createServer } = require('./gas-harness');
const API = 'https://api.example.test/exec';
const BASE = process.env.BASE || ('file://' + path.join(__dirname, '..', 'index.html'));

(async () => {
  const srv = createServer(); srv.setup();
  const adminPw = srv.logs.find((l) => l.includes('one-time password')).match(/one-time password: (\S+)/)[1];
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(`window.MCRM_CONFIG = { apiUrl: '${API}' };`);
  await ctx.route(API, (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(srv.post(route.request().postData())) }));
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const txt = async () => (await p.textContent('body')).replace(/\s+/g, ' ');
  let n = 0; const ok = (m, cond) => { if (!cond) throw new Error('FAILED: ' + m); n++; console.log('  ✓ ' + m); };

  await p.goto(BASE); await p.waitForSelector('#login-form');
  ok('neutral sign-in page without any brand', !(await txt()).includes('AlphaLeaders'));
  await p.fill('#login-email', 'super@lightech.co.id'); await p.fill('#login-pw', 'wrong'); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('.gate-err'); ok('wrong password shows an error', (await txt()).includes('Wrong email or password'));
  await p.fill('#login-pw', adminPw); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#new-co');
  for (const [name, slug, preset] of [['AlphaLeaders', 'alphaleaders', 'alphaleaders'], ['PIWA', 'piwa', 'piwa']]) {
    await p.click('#new-co'); await p.fill('#f-co-name', name); await p.fill('#f-co-slug', slug); await p.selectOption('#f-co-preset', preset);
    await p.fill('#f-co-owner', name + ' Owner'); await p.fill('#f-co-email', 'owner@' + slug + '.id'); await p.fill('#f-co-pw', 'demo'); await p.check('#f-co-demo');
    await p.click('#modal-form button[type=submit]');
    await p.waitForFunction((s) => !document.querySelector('#app').hidden && document.querySelector('tbody') && document.querySelector('tbody').textContent.includes('#' + s), slug);
  }
  const metas = srv.post({ action: 'login', email: 'super@lightech.co.id', password: adminPw });
  const docsCount = srv.post({ action: 'changes', token: metas.token, since: 0 }).docs.length;
  ok(`companies with example data saved on the server (${docsCount} records)`, docsCount > 100);
  await p.click('a[href="#audit"]'); await p.waitForFunction(() => document.querySelector('tbody') && document.querySelector('tbody').textContent.includes('Saved'));
  ok('audit log tab lists server activity', true);
  await p.click('#btn-logout'); await p.waitForSelector('#login-form');

  await p.goto('about:blank'); await p.goto(BASE + '#alphaleaders'); await p.waitForSelector('[data-demo]');
  const t1 = await txt();
  ok('AlphaLeaders sign-in page is exclusive', t1.includes('AlphaLeaders') && !t1.includes('PIWA'));
  await p.click('[data-demo]:has-text("Owner")'); await p.waitForSelector('.kpis');
  ok('owner one-click demo sign-in via server', (await p.textContent('#brand-name')) === 'AlphaLeaders');
  ok('owner sees no Lightech console button', !(await p.isVisible('#console-back')));
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'Server Lead'); await p.fill('#f-lead-phone', '0811000111'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => document.querySelector('#sync-text').textContent.includes('saved'));
  const own = srv.post({ action: 'login', email: 'owner@alphaleaders.id', password: 'demo', slug: 'alphaleaders' });
  const leads = srv.post({ action: 'list', token: own.token, collection: 'ws/' + own.session.wsId + '/leads' }).docs;
  ok('new lead stored on the server', leads.some((d) => d.data.name === 'Server Lead'));
  await p.goto(BASE + '#settings'); await p.waitForSelector('#set-brand');
  await p.fill('#set-brand', 'AlphaLeaders Pro'); await p.press('#set-brand', 'Tab');
  await p.waitForTimeout(400);
  await p.reload(); await p.waitForSelector('#brand-name');
  ok('brand change persists after reload', (await p.textContent('#brand-name')) === 'AlphaLeaders Pro');
  await p.click('#btn-logout'); await p.waitForSelector('[data-demo]');
  ok('after sign-out the AlphaLeaders page stays', (await txt()).includes('AlphaLeaders Pro'));
  await p.click('[data-demo]:has-text("BD")'); await p.waitForSelector('.kpis');
  ok('BD can still sign in after the owner saved config (hashes kept)', true);
  await p.goto(BASE + '#leads'); await p.waitForSelector('tbody');
  const rows = await p.$$eval('tbody tr.clickable', (r) => r.length);
  ok(`BD sees only own leads (${rows})`, rows > 0 && rows < 25);
  await p.click('#btn-logout'); await p.waitForSelector('#login-form');

  // live update between two users
  const p2 = await ctx.newPage();
  await p2.goto(BASE + '#alphaleaders'); await p2.reload(); await p2.waitForSelector('[data-demo]');
  await p2.click('[data-demo]:has-text("Owner")'); await p2.waitForSelector('.kpis');
  srv.post({ action: 'batch', token: own.token, ops: [{ op: 'set', path: `ws/${own.session.wsId}/leads/L-live`, data: { id: 'L-live', name: 'Live Update Lead', stageId: 'new', history: [{ at: new Date().toISOString(), from: null, to: 'new' }], createdAt: new Date().toISOString(), value: 0 } }] });
  await p2.goto(BASE + '#leads');
  await p2.waitForFunction(() => document.body.textContent.includes('Live Update Lead'), null, { timeout: 25000 });
  ok('another user\'s new lead appears without reload (polling)', true);
  await p2.close();

  // Lightech: open company, suspend PIWA
  await p.goto('about:blank'); await p.goto(BASE + '#lightech'); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'super@lightech.co.id'); await p.fill('#login-pw', adminPw); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#new-co'); await p.waitForTimeout(300);
  await p.click('tbody tr:has-text("AlphaLeaders") [data-co-open]'); await p.waitForSelector('.kpis');
  ok('Lightech opens AlphaLeaders with banner', await p.isVisible('#imp-banner'));
  ok('re-opened company has all its leads', await p.evaluate(() => window.__mcrm.state.leads.length > 20 && window.__mcrm.state.leads.some((l) => l.name === 'Server Lead')));
  await p.click('#console-back'); await p.waitForSelector('#new-co'); await p.waitForTimeout(300);
  await p.click('tbody tr:has-text("PIWA") [data-co-edit]'); await p.selectOption('#f-ce-status', 'suspended'); await p.click('#modal-form button[type=submit]');
  await p.waitForTimeout(300);
  await p.click('#btn-logout');
  await p.goto('about:blank'); await p.goto(BASE + '#piwa'); await p.waitForSelector('.gate-card');
  ok('suspended PIWA shows inactive notice', (await txt()).includes('inactive'));

  ok('no page errors', errs.length === 0);
  console.log(`\n${n} browser checks passed`);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });

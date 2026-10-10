// UAT rehearsal for the AlphaLeaders team (the scenario in UAT.md), on the built site + real server + PostgreSQL:
// the Owner renames wording & funnel, switches on testing mode, then one lead goes New → Pre-Session → Diagnostics →
// Closing → Deal Won, a second stays in the pipeline, a web-form lead arrives, Reports reflect it all, and the
// test data is removed in one click while the settings stay.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const path = require('path');
const { execFileSync } = require('child_process');
const { createServer, dropAll } = require('./pg-harness');
const API = 'https://uat-project.supabase.co/functions/v1/api';

(async () => {
  const ROOT = path.join(__dirname, '..');
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-deploy.mjs')], { env: Object.assign({}, process.env, { API_URL: API, DEFAULT_TENANT: 'alphaleaders' }), stdio: 'ignore' });
  const web = await require('./static-server').serve(path.join(ROOT, 'dist', 'alpha'));
  const SITE = web.url;
  const srv = await createServer();
  const { team } = await srv.setup({ alphaleaders: true });
  const otp = (e) => team.find((x) => x.email === e).password;
  // Owner already chose a password on day one (covered by e2e-golive)
  const first = await srv.post({ action: 'login', email: 'ferly@alphaleaders.id', password: otp('ferly@alphaleaders.id'), slug: 'alphaleaders' });
  await srv.post({ action: 'password', token: first.token, oldPassword: otp('ferly@alphaleaders.id'), newPassword: 'Ferly-2026!' });
  const own = await srv.post({ action: 'login', email: 'ferly@alphaleaders.id', password: 'Ferly-2026!', slug: 'alphaleaders' });
  const ws = own.session.wsId;
  const leadRows = () => srv.sql`select id, name, stage_id, value, deleted, (data->>'demo') as demo from leads where company_id = ${ws}`;

  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(API, async (route) => {
    const rq = route.request();
    const res = await srv.handler(new Request(API, { method: rq.method(), headers: rq.headers(), body: rq.method() === 'POST' ? rq.postData() : undefined }));
    return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const txt = async () => ((await p.textContent('body')) || '').replace(/\s+/g, ' ');
  const state = () => p.evaluate(() => window.__mcrm.state);
  const synced = () => p.waitForFunction(() => document.querySelector('#sync-text').textContent.match(/saved|tersimpan/i), null, { timeout: 15000 });
  const go = async (h, sel) => { await p.evaluate((x) => { location.hash = x; }, h); await p.waitForSelector(sel); };
  let n = 0; const ok = (m, cond) => { if (!cond) throw new Error('FAILED: ' + m); n++; console.log('  ✓ ' + m); };

  await p.goto(SITE); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'ferly@alphaleaders.id'); await p.fill('#login-pw', 'Ferly-2026!'); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('.kpis');

  // 1. Owner sets wording, funnel names, programs and testing mode
  await go('#settings', '#set-testmode');
  await p.click('[data-term-preset="0:1"]'); // Session → Class
  await p.waitForFunction(() => window.__mcrm.state.config.labels.session === 'Class');
  ok('one click renames Session → Class (singular and plural)', (await state()).config.labels.sessions === 'Classes' && (await p.textContent('#btn-add-session-label')) === 'Class');
  await p.click('[data-funnel-preset="1"]'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => window.__mcrm.state.config.stages[1].name === 'Pre-Session');
  const cfg = (await state()).config;
  ok('funnel preset renames the stages: Pre-Session → Diagnostics → Closing', cfg.stages.slice(0, 4).map((s) => s.name).join('|') === 'New Lead|Pre-Session|Diagnostics|Closing');
  ok('linked Class types follow the new names', cfg.sessionTypes.filter((t) => t.stageId).map((t) => t.name).join('|') === 'Pre-Session|Diagnostics Session|Closing Session');
  await p.fill('#stg-name-2', 'Diagnostics (ABM)'); await p.press('#stg-name-2', 'Tab');
  ok('any stage name can still be typed freely', (await state()).config.stages[2].name === 'Diagnostics (ABM)');
  ok('stage name field offers suggestions (Webinar, Assessment, …)', (await p.$$eval('#dl-stage-names option', (o) => o.map((x) => x.value))).includes('Assessment'));
  await p.check('#set-testmode');
  await p.waitForSelector('#imp-banner.test-banner');
  ok('testing mode shows a banner on every page', (await p.textContent('#imp-banner')).includes('TESTING'));
  await p.click('#paste-matrix');
  await p.fill('#f-matrix', '\tSAMPLE Drive\tSMP\tRp 1 – 2 M / bulan\t20000000\t17000000\t15000000\t240000000\t204000000\t180000000\tOwner, maks 2 pax\t—\t—\t—');
  await p.dispatchEvent('#f-matrix', 'input'); await p.click('#modal-form button[type=submit]');
  await synced();
  const meta = (await srv.post({ action: 'get', token: own.token, path: 'ws/' + ws })).data;
  ok('wording, funnel and testing mode are saved on the server', meta.config.labels.session === 'Class' && meta.config.stages[1].name === 'Pre-Session' && meta.config.testMode === true);

  // 2. Lead comes in → Pre-Session → Diagnostics → Closing → Deal Won
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'UAT Budi'); await p.fill('#f-lead-phone', '081234500001');
  await p.selectOption('#f-prog', { label: 'SAMPLE Drive · Rp 1 – 2 M / bulan' }); await p.selectOption('#f-term', 't2');
  await p.click('#modal-form button[type=submit]'); await synced();
  let budi = (await state()).leads.find((l) => l.name === 'UAT Budi');
  ok('new lead lands in "New Lead", valued from the program term, marked as test data', budi.stageId === cfg.stages[0].id && budi.value === 204000000 && budi.demo === true);
  const book = async (expectType) => {
    await go('#leads', 'tbody'); await p.click('tbody tr:has-text("UAT Budi")'); await p.click('#d-sess');
    await p.waitForSelector('#f-sess-type');
    const label = await p.$eval('#f-sess-type', (s) => s.options[s.selectedIndex].textContent);
    await p.click('#modal-form button[type=submit]'); await synced();
    await p.click('[data-close-drawer]').catch(() => {});
    return label.includes(expectType);
  };
  ok('booking a Class suggests the next step: Pre-Session', await book('Pre-Session'));
  budi = (await state()).leads.find((l) => l.name === 'UAT Budi');
  ok('… and moves the lead to Pre-Session', budi.stageId === cfg.stages[1].id);
  ok('next booking suggests Diagnostics and moves the lead there', (await book('Diagnostics')) && (await state()).leads.find((l) => l.name === 'UAT Budi').stageId === cfg.stages[2].id);
  ok('next booking suggests Closing and moves the lead there', (await book('Closing')) && (await state()).leads.find((l) => l.name === 'UAT Budi').stageId === cfg.stages[3].id);
  await go('#leads', 'tbody'); await p.click('tbody tr:has-text("UAT Budi")'); await p.click('#d-won');
  ok('Deal Won keeps term and contract value', (await p.inputValue('#f-won-term')) === 't2' && (await p.inputValue('#f-won-value')) === '204000000');
  await p.fill('#f-won-commit', '5000000'); await p.click('#modal-form button[type=submit]'); await synced();
  const st = await state();
  budi = st.leads.find((l) => l.name === 'UAT Budi');
  const client = st.clients.find((c) => c.leadId === budi.id);
  ok('the deal is Won and a client record is created', st.config.stages.find((s) => s.id === budi.stageId).type === 'won' && !!client);
  await go('#clients', '.client-grid'); await p.click('.ccard:has-text("UAT Budi")'); await p.waitForSelector('.mini-table');
  ok('payment schedule starts with the upfront commitment', (await p.textContent('.mini-table')).includes('Commitment'));
  await p.click('[data-close-drawer]');

  // 3. A second lead stays in the pipeline, a web-form lead arrives
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'UAT Sari'); await p.fill('#f-lead-phone', '081234500002');
  await p.selectOption('#f-prog', { label: 'SAMPLE Drive · Rp 1 – 2 M / bulan' }); await p.selectOption('#f-term', 't1');
  await p.selectOption('#f-lead-stage', cfg.stages[2].id);
  await p.click('#modal-form button[type=submit]'); await synced();
  await go('#settings', '#set-publicform'); await p.check('#set-publicform'); await p.waitForSelector('#form-link'); await synced();
  const f = await ctx.newPage(); f.on('pageerror', (e) => errs.push(e.message));
  await f.goto(SITE + '?form=alphaleaders&src=Instagram'); await f.waitForSelector('#pub-form');
  await f.fill('#pf-name', 'UAT Form'); await f.fill('#pf-phone', '081234500003'); await f.click('#pub-form button[type=submit]'); await f.waitForSelector('#form-done');
  await f.close();
  let rows = await leadRows();
  ok('every lead is a row in the database, all marked as test data (incl. the web form)', rows.length === 3 && rows.every((r) => r.demo === 'true'));
  ok('the leads table shows the real stage of each lead', rows.find((r) => r.name === 'UAT Sari').stage_id === cfg.stages[2].id && rows.find((r) => r.name === 'UAT Form').stage_id === cfg.stages[0].id);

  // 4. Pipeline & Reports use the new names and the numbers add up
  await go('#pipeline', '.kanban, .board, .col, [data-stage-col]').catch(() => {});
  const pipe = await txt();
  ok('pipeline columns use the new funnel names', pipe.includes('Pre-Session') && pipe.includes('Diagnostics (ABM)') && pipe.includes('Closing'));
  await go('#reports', '#rep-forecast');
  const forecast = await p.textContent('#rep-forecast');
  ok('forecast lists the renamed stages with Sari in Diagnostics', forecast.includes('Diagnostics (ABM)') && forecast.includes('Pre-Session'));
  const revenue = await p.evaluate(() => window.__mcrm.state.leads.filter((l) => l.wonAt).reduce((a, l) => a + (l.value || 0), 0));
  ok('revenue closed this month = the won deal (204 jt)', revenue === 204000000 && (await txt()).match(/204/));
  ok('Self Compensation table has a row for the deal owner', (await p.$$eval('#rep-comp tbody tr', (r) => r.length)) >= 1);
  const dash = (await go('#dashboard', '.kpis'), await txt());
  ok('dashboard shows the Classes wording', dash.includes('Class'));

  // 5. Test data removed in one click, settings kept
  await p.waitForFunction(() => window.__mcrm.state.leads.some((l) => l.name === 'UAT Form'), null, { timeout: 30000 });
  ok('the web-form lead appears for the Owner without a reload', true);
  await go('#settings', '#clear-demo');
  ok('Settings offers "Delete example & test data" with the count', (await p.textContent('#clear-demo')).includes('(3)'));
  await p.click('#clear-demo'); await p.click('#modal-form button[type=submit]'); await synced();
  await p.uncheck('#set-testmode'); await synced();
  rows = await leadRows();
  ok('all test leads are deleted from the database', rows.length === 3 && rows.every((r) => r.deleted));
  const sess = await srv.sql`select count(*)::int as n from sessions where company_id = ${ws} and not deleted`;
  const cl = await srv.sql`select count(*)::int as n from clients where company_id = ${ws} and not deleted`;
  ok('their Classes and client records are deleted too', sess[0].n === 0 && cl[0].n === 0);
  const after = (await srv.post({ action: 'get', token: own.token, path: 'ws/' + ws })).data;
  ok('wording, funnel names and programs stay; testing mode is off', after.config.labels.session === 'Class' && after.config.stages[2].name === 'Diagnostics (ABM)' && after.programs.some((x) => x.code === 'SMP') && !after.config.testMode);
  ok('banner is gone once testing mode is off', await p.isHidden('#imp-banner'));

  if (errs.length) console.log('ERRS', errs);
  ok('no page errors', errs.length === 0);
  ok('no server errors', srv.errors.length === 0);
  console.log(`\n${n} UAT checks passed`);
  await b.close(); web.close(); await srv.close(); await dropAll();
})().catch(async (e) => { console.error(e.message); try { await dropAll(); } catch (x) { /* ignore */ } process.exit(1); });

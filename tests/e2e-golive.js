// Go-live rehearsal, exactly as AlphaLeaders will run it: the built static site (dist/alpha) + the Supabase API
// (server/http.js → server/pg.js → PostgreSQL). Day zero: first-time setup with the database's setup code.
// Day one: the Owner signs in with a one-time password, sets their own, pastes the Investment Matrix, enters a lead,
// opens the public form; a BD signs in and changes their password; Lightech opens its console.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const path = require('path');
const { execFileSync } = require('child_process');
const { createServer, dropAll } = require('./pg-harness');
const API = 'https://demo-project.supabase.co/functions/v1/api';

(async () => {
  const ROOT = path.join(__dirname, '..');
  execFileSync('node', [path.join(ROOT, 'scripts', 'build-deploy.mjs')], { env: Object.assign({}, process.env, { API_URL: API, DEFAULT_TENANT: 'alphaleaders' }), stdio: 'ignore' });
  const web = await require('./static-server').serve(path.join(ROOT, 'dist', 'alpha'));
  const SITE = web.url;
  const srv = await createServer();
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  // The browser talks to the real HTTP layer of the Edge Function (CORS, text/plain POST, JSON answers).
  await ctx.route(API, async (route) => {
    const rq = route.request();
    const res = await srv.handler(new Request(API, { method: rq.method(), headers: rq.headers(), body: rq.method() === 'POST' ? rq.postData() : undefined }));
    return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const txt = async (pg) => ((await (pg || p).textContent('body')) || '').replace(/\s+/g, ' ');
  let n = 0; const ok = (m, cond) => { if (!cond) throw new Error('FAILED: ' + m); n++; console.log('  ✓ ' + m); };

  // Day zero: first-time setup
  await p.goto(SITE); await p.waitForSelector('#setup-form');
  ok('a new database opens the first-time setup screen', (await txt()).includes('First-time setup'));
  await p.fill('#f-setup-code', 'WRONGCODE'); await p.fill('#f-setup-pw', 'Lightech-2026!'); await p.fill('#f-setup-pw2', 'Lightech-2026!');
  await p.click('#setup-form button[type=submit]'); await p.waitForSelector('.gate-err');
  ok('a wrong setup code is refused', (await txt()).includes('Wrong setup code'));
  await p.fill('#f-setup-code', (await srv.setupCode()).toLowerCase()); await p.fill('#f-setup-pw', 'Lightech-2026!'); await p.fill('#f-setup-pw2', 'Lightech-2026!');
  await p.click('#setup-form button[type=submit]'); await p.waitForSelector('#setup-team');
  const otps = Object.fromEntries(await p.$$eval('[data-otp]', (els) => els.map((e) => [e.dataset.otp, e.textContent])));
  ok('setup shows the 12 one-time passwords once, ready to copy', Object.keys(otps).length === 12 && (await p.inputValue('#setup-out')).includes('julia@alphaleaders.id'));
  ok('the setup code is used up', (await srv.setupCode()) === '');
  p.once('dialog', (d) => d.accept());
  await p.click('#setup-done');
  await p.waitForSelector('#login-form');
  ok('then the link opens the AlphaLeaders sign-in with its logo', (await p.$('.gate-hero img[alt="AlphaLeaders"]')) !== null && (await p.$('[data-demo]')) === null);
  const logo = await p.$eval('.gate-hero img', (i) => i.naturalWidth);
  ok('the AlphaLeaders logo loads from the site', logo > 0);
  const p0 = await ctx.newPage(); await p0.goto(SITE); await p0.waitForSelector('#login-form');
  ok('visiting again never shows setup a second time', !(await p0.$('#setup-form'))); await p0.close();

  // Day one: Owner
  await p.fill('#login-email', 'ferly@alphaleaders.id'); await p.fill('#login-pw', otps['ferly@alphaleaders.id']); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#f-pw-new');
  ok('first sign-in asks the Owner to create their own password', (await txt()).includes('Create your own password'));
  await p.keyboard.press('Escape');
  ok('that step cannot be skipped', await p.isVisible('#f-pw-new'));
  await p.fill('#f-pw-old', otps['ferly@alphaleaders.id']); await p.fill('#f-pw-new', 'Ferly-2026!'); await p.fill('#f-pw-again', 'Ferly-2026!'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => !document.querySelector('#modal').classList.contains('open') && !window.__mcrm.me.mustChange);
  ok('new password accepted; the dashboard starts empty for real data', (await p.isVisible('.kpis')) && (await p.evaluate(() => window.__mcrm.state.leads.length)) === 0);
  ok('the whole team is already set up (12 people)', (await p.evaluate(() => window.__mcrm.state.accounts.length)) === 12);

  // Investment Matrix (sample numbers)
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForSelector('#paste-matrix'); await p.click('#paste-matrix');
  await p.fill('#f-matrix', '\tSAMPLE Drive\tSMP\tRp 1 – 2 M / bulan\t20000000\t17000000\t15000000\t240000000\t204000000\t180000000\tOwner, maks 2 pax\t—\t—\t—');
  await p.dispatchEvent('#f-matrix', 'input'); await p.click('#modal-form button[type=submit]');
  await p.waitForTimeout(600);
  const own = await srv.post({ action: 'login', email: 'ferly@alphaleaders.id', password: 'Ferly-2026!', slug: 'alphaleaders' });
  const meta = async () => (await srv.post({ action: 'get', token: own.token, path: 'ws/' + own.session.wsId })).data;
  ok('the Investment Matrix is saved in the database', (await meta()).programs.some((x) => x.code === 'SMP' && x.terms.t2 === 17000000));

  // First real lead
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'Budi Real Client'); await p.fill('#f-lead-phone', '081234567890');
  await p.selectOption('#f-prog', { label: 'SAMPLE Drive · Rp 1 – 2 M / bulan' }); await p.selectOption('#f-term', 't2');
  await p.click('#modal-form button[type=submit]'); await p.waitForTimeout(800);
  const row = (await srv.sql`select name, value, owner_id, data->>'term' as term from leads where company_id = ${own.session.wsId} and name = 'Budi Real Client'`)[0];
  ok('a lead typed in the app is a row in the leads table, with term and value', row && row.term === 't2' && Number(row.value) === 204000000);
  ok('it is auto-assigned to a BD', ['b-rina', 'b-fajar'].includes(row.owner_id));

  // Public lead form
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForSelector('#set-publicform'); await p.check('#set-publicform'); await p.waitForSelector('#form-link');
  ok('the form link is the site link', (await p.inputValue('#form-link')) === SITE + '?form=alphaleaders');
  await p.waitForTimeout(600);
  const f = await ctx.newPage(); f.on('pageerror', (e) => errs.push(e.message));
  await f.goto(SITE + '?form=alphaleaders&src=Instagram'); await f.waitForSelector('#pub-form');
  await f.fill('#pf-name', 'Form Visitor'); await f.fill('#pf-phone', '081399998888'); await f.click('#pub-form button[type=submit]'); await f.waitForSelector('#form-done');
  const fromForm = (await srv.sql`select source from leads where company_id = ${own.session.wsId} and name = 'Form Visitor'`)[0];
  ok('a public form submission lands in the database with its campaign source', fromForm && fromForm.source === 'Instagram');
  await f.close();

  // A BD's first day
  await p.click('#btn-logout'); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'julia@alphaleaders.id'); await p.fill('#login-pw', otps['julia@alphaleaders.id']); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#f-pw-new');
  await p.fill('#f-pw-old', otps['julia@alphaleaders.id']); await p.fill('#f-pw-new', 'Julia-2026!'); await p.fill('#f-pw-again', 'Julia-2026!'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => !document.querySelector('#modal').classList.contains('open') && !window.__mcrm.me.mustChange);
  ok('a BD signs in, sets a password and lands on their dashboard', (await p.isVisible('.kpis')) && (await p.textContent('#me-chip')).includes('Julia'));

  // Lightech console
  const p3 = await ctx.newPage(); p3.on('pageerror', (e) => errs.push(e.message));
  await p3.goto(SITE + '?view=lightech'); await p3.waitForSelector('#login-form');
  await p3.fill('#login-email', 'super@lightech.co.id'); await p3.fill('#login-pw', 'Lightech-2026!'); await p3.click('#login-form button[type=submit]');
  await p3.waitForSelector('#new-co');
  ok('?view=lightech opens the Lightech console with the password chosen at setup', (await txt(p3)).includes('AlphaLeaders'));
  await p3.close();

  const audit = await srv.sql`select action from audit_log`;
  ok(`every step is in the audit log (${audit.length} rows)`, ['setup', 'login', 'password', 'save', 'capture'].every((a) => audit.some((x) => x.action === a)));
  if (errs.length) console.log('ERRS', errs);
  ok('no page errors', errs.length === 0);
  ok('no server errors', srv.errors.length === 0);
  console.log(`\n${n} go-live checks passed`);
  await b.close(); web.close(); await srv.close(); await dropAll();
})().catch(async (e) => { console.error(e.message); try { await dropAll(); } catch (x) { /* ignore */ } process.exit(1); });

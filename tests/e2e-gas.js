// Go-live rehearsal: the app served by the Apps Script web app itself (as it will run for AlphaLeaders).
// Day one: Owner signs in with a one-time password, sets their own, pastes the Investment Matrix, enters a lead,
// opens the public form; a BD signs in and changes their password.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const path = require('path');
const { createServer } = require('./gas-harness');
const EXEC = 'https://script.google.com/macros/s/TEST/exec';

(async () => {
  const fs = require('fs');
  const ROOT = process.env.ROOT || path.join(__dirname, '..');
  const ASSETS = 'https://assets.test/'; // stands in for jsDelivr (https, like production)
  const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const srv = createServer({ url: EXEC }); srv.setup(); srv.setupAlphaLeaders();
  const otp = (email) => srv.logs.find((l) => l.includes(email)).match(/one-time password: (\S+)/)[1];
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.route(ASSETS + '**', (route) => {
    const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '');
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'not found' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  await ctx.route(EXEC + '**', (route) => {
    const req = route.request();
    if (req.method() === 'POST') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(srv.post(req.postData())) });
    const params = Object.fromEntries(new URL(req.url()).searchParams);
    const html = srv.get(params).html.split(/https:\/\/cdn\.jsdelivr\.net\/gh\/oasys-lightrees\/mentoring_app@[0-9a-f]+\//).join(ASSETS);
    return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const txt = async (pg) => ((await (pg || p).textContent('body')) || '').replace(/\s+/g, ' ');
  let n = 0; const ok = (m, cond) => { if (!cond) throw new Error('FAILED: ' + m); n++; console.log('  ✓ ' + m); };

  await p.goto(EXEC); try { await p.waitForSelector('#login-form', { timeout: 8000 }); } catch (e) { console.log('ERRS', errs, 'BODY', (await txt()).slice(0, 300), 'HTML', (await p.content()).slice(0, 600)); throw e; }
  ok('the web app link opens the AlphaLeaders sign-in with its logo', (await p.$('.gate-hero img[alt="AlphaLeaders"]')) !== null && (await p.$('[data-demo]')) === null);
  await p.fill('#login-email', 'ferly@alphaleaders.id'); await p.fill('#login-pw', otp('ferly@')); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#f-pw-new');
  ok('first sign-in asks the Owner to create their own password', (await txt()).includes('Create your own password'));
  await p.keyboard.press('Escape');
  ok('that step cannot be skipped', await p.isVisible('#f-pw-new'));
  await p.fill('#f-pw-old', otp('ferly@')); await p.fill('#f-pw-new', 'Ferly-2026!'); await p.fill('#f-pw-again', 'Ferly-2026!'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => !document.querySelector('#modal').classList.contains('open'));
  ok('new password accepted; the dashboard starts empty for real data', (await p.isVisible('.kpis')) && (await p.evaluate(() => window.__mcrm.state.leads.length)) === 0);
  ok('the whole team is already set up (12 people)', (await p.evaluate(() => window.__mcrm.state.accounts.length)) === 12);

  // Investment Matrix (sample numbers)
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForSelector('#paste-matrix'); await p.click('#paste-matrix');
  await p.fill('#f-matrix', '\tSAMPLE Drive\tSMP\tRp 1 – 2 M / bulan\t20000000\t17000000\t15000000\t240000000\t204000000\t180000000\tOwner, maks 2 pax\t—\t—\t—');
  await p.dispatchEvent('#f-matrix', 'input'); await p.click('#modal-form button[type=submit]');
  await p.waitForTimeout(400);
  const own = srv.post({ action: 'login', email: 'ferly@alphaleaders.id', password: 'Ferly-2026!', slug: 'alphaleaders' });
  const meta = () => srv.post({ action: 'get', token: own.token, path: 'ws/' + own.session.wsId }).data;
  ok('the Investment Matrix is saved on the server', meta().programs.some((x) => x.code === 'SMP' && x.terms.t2 === 17000000));

  // First real lead
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'Budi Real Client'); await p.fill('#f-lead-phone', '081234567890');
  await p.selectOption('#f-prog', { label: 'SAMPLE Drive · Rp 1 – 2 M / bulan' }); await p.selectOption('#f-term', 't2');
  await p.click('#modal-form button[type=submit]'); await p.waitForTimeout(600);
  const leads = srv.post({ action: 'list', token: own.token, collection: 'ws/' + own.session.wsId + '/leads' }).docs.map((d) => d.data);
  const budi = leads.find((l) => l.name === 'Budi Real Client');
  ok('a lead typed in the app is stored on the server with term and value', budi && budi.term === 't2' && budi.value === 204000000);
  ok('it is auto-assigned to a BD', ['b-rina', 'b-fajar'].includes(budi.ownerId));

  // Public lead form through the web app link
  await p.evaluate(() => { location.hash = '#settings'; }); await p.waitForSelector('#set-publicform'); await p.check('#set-publicform'); await p.waitForSelector('#form-link');
  ok('the form link is the web app link', (await p.inputValue('#form-link')) === EXEC + '?form=alphaleaders');
  await p.waitForTimeout(500);
  const f = await ctx.newPage(); f.on('pageerror', (e) => errs.push(e.message));
  await f.goto(EXEC + '?form=alphaleaders&src=Instagram'); await f.waitForSelector('#pub-form');
  await f.fill('#pf-name', 'Form Visitor'); await f.fill('#pf-phone', '081399998888'); await f.click('#pub-form button[type=submit]'); await f.waitForSelector('#form-done');
  const fromForm = srv.post({ action: 'list', token: own.token, collection: 'ws/' + own.session.wsId + '/leads' }).docs.map((d) => d.data).find((l) => l.name === 'Form Visitor');
  ok('a public form submission lands on the server with its campaign source', fromForm && fromForm.source === 'Instagram');
  await f.close();

  // A BD's first day
  await p.click('#btn-logout'); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'julia@alphaleaders.id'); await p.fill('#login-pw', otp('julia@')); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#f-pw-new');
  await p.fill('#f-pw-old', otp('julia@')); await p.fill('#f-pw-new', 'Julia-2026!'); await p.fill('#f-pw-again', 'Julia-2026!'); await p.click('#modal-form button[type=submit]');
  await p.waitForFunction(() => !document.querySelector('#modal').classList.contains('open'));
  ok('a BD signs in, sets a password and lands on their dashboard', (await p.isVisible('.kpis')) && (await p.textContent('#me-chip')).includes('Julia'));
  ok('no page errors', errs.length === 0);
  console.log(`\n${n} go-live checks passed`);
  await b.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

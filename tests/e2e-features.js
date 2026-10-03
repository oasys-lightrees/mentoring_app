// Browser end-to-end for the growth features: reports & forecast, Self Compensation, CSV import, week calendar, public lead form.
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node-tools/node_modules/playwright'); }
const path = require('path');
let BASE = process.env.BASE;

(async () => {
  const web = BASE ? null : await require('./static-server').serve(process.env.ROOT || path.join(__dirname, '..'));
  if (web) BASE = web.url + 'index.html';
  const b = await pw.chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  const txt = async (pg) => (await (pg || p).textContent('body')).replace(/\s+/g, ' ');
  let n = 0; const ok = (m, cond) => { if (!cond) throw new Error('FAILED: ' + m); n++; console.log('  ✓ ' + m); };
  const state = () => p.evaluate(() => window.__mcrm.state);

  await p.goto(BASE + '#alphaleaders'); await p.waitForSelector('[data-demo]');
  await p.click('[data-demo]:has-text("Owner")'); await p.waitForSelector('.kpis');

  // Reports
  await p.click('#tabs a[href="#reports"]'); await p.waitForSelector('svg.chart');
  ok('reports page renders the 12-month revenue chart', (await p.$$eval('svg.chart rect.bar', (r) => r.length)) === 12);
  ok('forecast table lists every open stage with a total', (await p.$$eval('#rep-forecast tbody tr', (r) => r.length)) >= 3 && (await txt()).includes('Weighted pipeline'));
  ok('Self Compensation table is shown to the Owner', (await p.$$eval('#rep-comp tbody tr', (r) => r.length)) >= 1);
  ok('coach utilisation table is shown to the Owner', (await p.$$eval('#rep-coaches tbody tr', (r) => r.length)) >= 1);

  // Targets drive bonus column
  await p.click('#tabs a[href="#settings"]'); await p.waitForSelector('#set-target');
  await p.fill('#set-target', '20000000'); await p.press('#set-target', 'Tab');
  await p.fill('#set-bonus', '5'); await p.press('#set-bonus', 'Tab');
  ok('targets are saved in company settings', (await state()).config.commission.target === 20000000);
  await p.click('#tabs a[href="#reports"]'); await p.waitForSelector('#rep-comp');
  ok('reports show target attainment and bonus once a target is set', (await p.textContent('#rep-comp thead')).includes('Bonus') && (await p.$('svg.chart .target-line')) !== null);

  // CSV import
  const before = (await state()).leads.length;
  const dupPhone = (await state()).leads[0].phone;
  await p.click('#tabs a[href="#leads"]'); await p.click('#btn-import');
  await p.fill('#f-imp-text', `Nama;No HP;Email;Perusahaan;Sumber\nImport Satu;081211110001;a@x.id;PT A;Instagram\n"Import, Dua";081211110002;;PT B;\nDuplicate;${dupPhone};;;\nNoPhone;;;;`);
  await p.dispatchEvent('#f-imp-text', 'input');
  ok('import preview counts ready, duplicate and invalid rows', (await p.textContent('#imp-preview')).replace(/\s+/g, ' ').startsWith('2 ready · 1 duplicates · 1 missing'));
  await p.click('#modal-form button[type=submit]');
  const after = await state();
  ok('2 leads imported, duplicate skipped', after.leads.length === before + 2 && after.leads.some((l) => l.name === 'Import, Dua'));
  const imp = after.leads.filter((l) => l.name.startsWith('Import'));
  ok('imported leads are auto-assigned to BDs and start in the first stage', imp.every((l) => after.accounts.find((a) => a.id === l.ownerId).role === 'bd') && imp.every((l) => l.history[0].note === 'Imported'));

  // Week calendar
  await p.click('#tabs a[href="#sessions"]'); await p.click('#sess-view [data-sv=week]');
  ok('week calendar shows 7 days with today highlighted', (await p.$$eval('.week-day', (r) => r.length)) === 7 && (await p.$('.week-day.is-today')) !== null);
  const l1 = await p.textContent('#week-label'); await p.click('[data-week="7"]');
  ok('week navigation moves forward', (await p.textContent('#week-label')) !== l1 && (await p.$('.week-day.is-today')) === null);
  await p.click('[data-week="0"]');
  const item = await p.$('.week-item[data-sess-edit]');
  if (item) { await item.click(); ok('clicking a calendar item opens the session', await p.isVisible('#modal-form')); await p.click('[data-close-modal]'); }

  // Public lead form
  await p.click('#tabs a[href="#settings"]'); await p.check('#set-publicform'); await p.waitForSelector('#form-link');
  const link = await p.inputValue('#form-link');
  ok('form link is shown once the form is live', link.endsWith('?form=alphaleaders'));
  const f = await ctx.newPage(); f.on('pageerror', (e) => errs.push(e.message));
  await f.goto(link + '&src=Instagram'); await f.waitForSelector('#pub-form');
  const ft = await txt(f);
  ok('public form shows the company logo only, no sign-in or team data', (await f.$('.gate-hero img[alt="AlphaLeaders"]')) !== null && !ft.includes('Sign in') && !ft.includes('PIWA'));
  await f.fill('#pf-name', 'Web Visitor'); await f.fill('#pf-phone', '0813 5555 6666'); await f.fill('#pf-msg', 'Scale my business');
  if (await f.$('#pf-program')) await f.selectOption('#pf-program', { index: 1 });
  await f.click('#pub-form button[type=submit]'); await f.waitForSelector('#form-done');
  ok('visitor sees a thank-you page', true);
  await f.click('[data-lang=id]'); ok('language toggle keeps the thank-you page', (await txt(f)).includes('Terima kasih'));
  await f.click('[data-lang=en]');
  await f.close();
  await p.goto(BASE + '#leads'); await p.reload(); await p.waitForSelector('tbody');
  const s2 = await state();
  const webLead = s2.leads.find((l) => l.name === 'Web Visitor');
  ok('form submission is in the pipeline with source, owner and value', webLead && webLead.source === 'Instagram' && s2.accounts.find((a) => a.id === webLead.ownerId).role === 'bd' && webLead.value > 0 && webLead.stageId === s2.config.stages[0].id);

  // BD sees only own compensation
  await p.click('#btn-logout'); await p.waitForSelector('[data-demo]');
  await p.click('[data-demo]:has-text("BD")'); await p.waitForSelector('.kpis');
  await p.goto(BASE + '#reports'); await p.waitForSelector('#rep-comp');
  const rows = await p.$$eval('#rep-comp tbody tr', (r) => r.map((x) => x.textContent));
  ok('BD sees only their own commission row', rows.length === 1 && (rows[0].includes('You') || rows[0].includes('No deals')));
  ok('BD does not see coach utilisation', (await p.$('#rep-coaches')) === null);

  // Mobile
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await m.goto(BASE + '?form=alphaleaders'); await m.waitForSelector('.gate-card .gate-title');
  ok('form stays closed for a company that has not switched it on', (await txt(m)).includes('not available'));
  await m.goto(BASE + '?form=does-not-exist'); await m.waitForSelector('.gate-card .gate-title');
  ok('unknown company code shows no form', (await txt(m)).includes('not available'));
  await m.goto(BASE + '#alphaleaders'); await m.waitForSelector('[data-demo]'); await m.click('[data-demo]:has-text("Owner")'); await m.waitForSelector('.kpis');
  await m.evaluate(() => { const s = window.__mcrm.state; s.config.publicForm = true; window.__mcrm.backend.save(); });
  await m.goto('about:blank'); await m.goto(BASE + '?form=alphaleaders'); await m.waitForSelector('#pub-form');
  ok('public form fits a phone screen', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.goto('about:blank'); await m.goto(BASE + '#sessions'); await m.waitForSelector('#sess-view'); await m.click('#sess-view [data-sv=week]');
  ok('week calendar fits a phone screen', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);
  await m.goto('about:blank'); await m.goto(BASE + '#reports'); await m.waitForSelector('svg.chart');
  ok('reports fit a phone screen', (await m.evaluate(() => document.documentElement.scrollWidth)) <= 390);

  ok('no page errors', errs.length === 0);
  console.log(`\n${n} feature checks passed`);
  await b.close();
  if (web) web.close();
})().catch((e) => { console.error(e.message); process.exit(1); });

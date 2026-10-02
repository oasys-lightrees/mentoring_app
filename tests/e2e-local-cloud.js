let pwm; try { pwm = require('playwright'); } catch (e) { pwm = require('/opt/node-tools/node_modules/playwright'); }
const { chromium } = pwm;
const path = require('path');
const fs = require('fs');
const BASE = 'file://' + path.join(__dirname, '..', 'index.html');
const MODE = process.argv[2] || 'local';
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1360, height: 900 } });
  if (MODE === 'cloud') await ctx.addInitScript({ content: fs.readFileSync(path.join(__dirname, 'mock-artifact-db.js'), 'utf8') });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !m.text().includes('CERT')) errs.push(m.text()); });
  const txt = async () => (await p.textContent('body')).replace(/\s+/g, ' ');
  if (MODE === 'cloud') {
    // seed cloud mock via local-style creation: log in as Lightech, create companies
    await p.goto(BASE); await p.waitForSelector('#login-form');
    await p.fill('#login-email', 'super@lightech.co.id'); await p.fill('#login-pw', 'demo'); await p.click('#login-form button[type=submit]');
    await p.waitForSelector('#new-co');
    for (const [name, slug, preset] of [['AlphaLeaders', 'alphaleaders', 'alphaleaders'], ['PIWA', 'piwa', 'piwa']]) {
      await p.click('#new-co'); await p.fill('#f-co-name', name); await p.fill('#f-co-slug', slug); await p.selectOption('#f-co-preset', preset);
      await p.fill('#f-co-owner', name + ' Owner'); await p.fill('#f-co-email', 'owner@' + slug + '.id'); await p.fill('#f-co-pw', 'demo'); await p.check('#f-co-demo');
      await p.click('#modal-form button[type=submit]'); await p.waitForSelector('#new-co');
    }
    console.log('cloud docs:', await p.evaluate(() => Object.keys(window.__mockStore).length));
    await p.click('#btn-logout');
  }
  // 1. neutral
  await p.goto(BASE); await p.waitForSelector('#login-form');
  console.log('1 neutral has no brand list:', !(await txt()).includes('PIWA') && !(await txt()).includes('AlphaLeaders'));
  await p.screenshot({ path: require('os').tmpdir() + '/w-neutral.png' });
  // 2. tenant link
  await p.goto('about:blank'); await p.goto(BASE + '#alphaleaders'); await p.waitForSelector('#login-form');
  const t2 = await txt();
  console.log('2 AL login exclusive:', t2.includes('AlphaLeaders') && !t2.includes('PIWA') && !t2.includes('iPlus'));
  await p.screenshot({ path: require('os').tmpdir() + '/w-al-login.png' });
  await p.click('[data-demo]:has-text("Owner")'); await p.waitForSelector('.kpis');
  const t3 = await txt();
  console.log('3 AL app no other brands:', !t3.includes('PIWA') && !t3.includes('iPlus') && !(await p.$('#ws-select')));
  await p.screenshot({ path: require('os').tmpdir() + '/w-al-dash-en.png' });
  await p.click('#lang-bar [data-lang=id]'); await p.waitForTimeout(150);
  console.log('4 lang ID:', (await txt()).includes('Butuh aksi'));
  await p.screenshot({ path: require('os').tmpdir() + '/w-al-dash-id.png' });
  await p.click('#lang-bar [data-lang=en]');
  await p.goto(BASE + '#settings'); await p.waitForSelector('#set-brand');
  await p.fill('#set-brand', 'AlphaLeaders Pro'); await p.press('#set-brand', 'Tab'); await p.waitForTimeout(200);
  console.log('5 owner renamed brand:', await p.textContent('#brand-name'));
  // add lead
  await p.click('#btn-add-lead'); await p.fill('#f-lead-name', 'Josh Test'); await p.fill('#f-lead-phone', '0812999'); await p.click('#modal-form button[type=submit]');
  await p.click('#btn-logout'); await p.waitForSelector('#login-form');
  console.log('6 after logout stays on AL login:', (await txt()).includes('AlphaLeaders Pro'));
  // 7. platform login via other account
  await p.click('#other-account'); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'super@lightech.co.id'); await p.fill('#login-pw', 'demo'); await p.click('#login-form button[type=submit]');
  await p.waitForSelector('#new-co'); await p.waitForFunction(() => !document.querySelector('tbody').textContent.includes('…'));
  const rows = await p.$$eval('tbody tr', r => r.map(x => x.textContent.replace(/\s+/g, ' ').trim().slice(0, 80)));
  console.log('7 console rows:', rows);
  await p.screenshot({ path: require('os').tmpdir() + '/w-console.png', fullPage: true });
  // open AL as Lightech
  await p.click('tbody tr:has-text("AlphaLeaders") [data-co-open]'); await p.waitForSelector('.kpis');
  console.log('8 impersonation banner:', await p.isVisible('#imp-banner'), 'has Josh:', await p.evaluate(() => !!window.__mcrm.state.leads.find(l => l.name === 'Josh Test')), '| reopened company keeps all leads:', await p.evaluate(() => window.__mcrm.state.leads.length > 20));
  await p.screenshot({ path: require('os').tmpdir() + '/w-imp.png' });
  await p.click('#console-back'); await p.waitForSelector('#new-co');
  // create company
  await p.click('#new-co'); await p.fill('#f-co-name', 'Glow Academy'); await p.fill('#f-co-owner', 'Rara'); await p.fill('#f-co-email', 'rara@glow.id'); await p.fill('#f-co-pw', 'rahasia1');
  await p.click('#modal-form button[type=submit]'); await p.waitForFunction(() => !document.querySelector('#app').hidden && document.querySelector('tbody') && document.querySelector('tbody').textContent.includes('#glow-academy') && !document.querySelector('tbody').textContent.includes('…'));
  console.log('9 new company listed:', (await txt()).includes('#glow-academy'));
  // suspend PIWA
  await p.click('tbody tr:has-text("PIWA") [data-co-edit]'); await p.selectOption('#f-ce-status', 'suspended'); await p.click('#modal-form button[type=submit]'); await p.waitForTimeout(300);
  await p.click('#btn-logout');
  // 10. new tenant owner login via its link
  await p.goto('about:blank'); await p.goto(BASE + '#glow-academy'); await p.waitForSelector('#login-form');
  await p.fill('#login-email', 'rara@glow.id'); await p.fill('#login-pw', 'rahasia1'); await p.click('#login-form button[type=submit]');
  try { await p.waitForSelector('#view h1', { timeout: 8000 }); } catch (e) { console.log('BODY10', (await txt()).slice(0, 400)); await p.screenshot({ path: require('os').tmpdir() + '/w-fail10.png' }); }
  console.log('10 new tenant owner in:', await p.textContent('#brand-name'), '| empty leads ok:', await p.evaluate(() => window.__mcrm.state.leads.length === 0));
  await p.click('#btn-logout');
  await p.goto('about:blank'); await p.goto(BASE + '#piwa'); await p.waitForSelector('.gate-card');
  console.log('11 suspended PIWA blocked:', (await txt()).includes('inactive'));
  // mobile + dark
  const m = await (await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' })).newPage();
  if (MODE === 'local') {
    await m.goto(BASE + '#alphaleaders'); await m.waitForSelector('[data-demo]'); await m.screenshot({ path: require('os').tmpdir() + '/w-m-login.png' });
    await m.click('[data-demo]:has-text("Owner")'); await m.waitForSelector('.kpis'); await m.screenshot({ path: require('os').tmpdir() + '/w-m-dash.png' });
    console.log('mobile scrollWidth', await m.evaluate(() => document.documentElement.scrollWidth));
  }
  console.log('ERRORS', errs);
  await b.close();
})().catch(async (e) => { console.log('FAIL', e.message.split('\n')[0]); console.log('STACK', (e.stack.match(/e2e-local-cloud.js:(\d+)/) || [])[1]); process.exit(1); });

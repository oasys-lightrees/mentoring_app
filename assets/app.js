/*
 * Mentoring CRM — MVP "Lead to Deal".
 * Zero dependency, data disimpan di localStorage per workspace (brand).
 * Layer storage sengaja dipisah (Store) supaya nanti gampang diganti ke Supabase / Odoo API.
 */
(function () {
  'use strict';

  // ---------- Utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p) => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const DAY = 86400000;
  const localISO = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const todayISO = () => localISO();
  const daysBetween = (a, b) => Math.floor((new Date(b) - new Date(a)) / DAY);
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtMoney = (n) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
  const fmtMoneyShort = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' M';
    if (n >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
    return fmtMoney(n);
  };
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const waNumber = (phone) => {
    let p = String(phone || '').replace(/[^\d+]/g, '');
    if (p.startsWith('+')) p = p.slice(1);
    if (p.startsWith('0')) p = '62' + p.slice(1);
    return p;
  };
  const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  // ---------- Store (localStorage, per workspace) ----------
  const K_INDEX = 'mcrm:workspaces';
  const K_ACTIVE = 'mcrm:active';
  const K_WS = (id) => 'mcrm:ws:' + id;
  const mem = {};
  const Store = {
    get(k) { try { const v = localStorage.getItem(k); return v == null ? (mem[k] ?? null) : JSON.parse(v); } catch (e) { return mem[k] ?? null; } },
    set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage penuh / diblok: tetap jalan di memori */ } },
    del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };

  let wsIndex = [];
  let wsId = null;
  let S = null; // state workspace aktif

  function save() { S.updatedAt = new Date().toISOString(); Store.set(K_WS(wsId), S); }

  function createWorkspace(presetKey, withDemo, nameOverride) {
    const p = window.PRESETS[presetKey] || window.PRESETS.blank;
    const id = uid('ws');
    const data = {
      version: 1,
      preset: presetKey,
      config: clone(p.config),
      team: clone(p.team),
      programs: clone(p.programs),
      leads: [],
      sessions: [],
      createdAt: new Date().toISOString()
    };
    if (withDemo) seedDemo(data);
    Store.set(K_WS(id), data);
    wsIndex.push({ id, name: nameOverride || p.name });
    Store.set(K_INDEX, wsIndex);
    return id;
  }

  function loadWorkspace(id) {
    const data = Store.get(K_WS(id));
    if (!data) return false;
    wsId = id; S = data;
    Store.set(K_ACTIVE, id);
    applyBrand();
    return true;
  }

  // ---------- Demo data ----------
  function rng(seed) { return function () { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  function seedDemo(data) {
    const r = rng(data.preset.length * 977 + 13);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const first = ['Budi', 'Siti', 'Andi', 'Dewi', 'Hendra', 'Clarissa', 'Rudi', 'Maya', 'Yusuf', 'Intan', 'Kevin', 'Laras', 'Bayu', 'Nadia', 'Rizky', 'Putri', 'Agus', 'Wulan', 'Teguh', 'Citra', 'Fikri', 'Melati', 'Galih', 'Sinta'];
    const last = ['Santoso', 'Rahma', 'Pratama', 'Lestari', 'Gunawan', 'Wijaya', 'Hartono', 'Saputra', 'Halim', 'Kusuma', 'Tanoto', 'Nugroho'];
    const comp = ['PT Digital Scale', 'Aroma Coffee', 'Techindo', 'Glow Skincare', 'BuildCorp', 'Fashion Hub', 'Villa Seminyak', 'Kost Eksklusif', 'Klinik Sehat', 'Kopi Nusantara', 'Logistik Prima', 'EduKids', 'Bali Living', 'Space Office', ''];
    const stages = data.config.stages;
    const open = stages.filter((s) => s.type === 'open');
    const won = stages.find((s) => s.type === 'won');
    const lost = stages.find((s) => s.type === 'lost');
    const bds = data.team.filter((m) => m.role === 'bd');
    const mentors = data.team.filter((m) => ['mentor', 'senior', 'assistant'].includes(m.role));
    const now = Date.now();
    const typeByStage = {};
    data.config.sessionTypes.forEach((t) => { if (t.stageId) typeByStage[t.stageId] = t; });
    const hhmm = () => String(9 + Math.floor(r() * 8)).padStart(2, '0') + ':' + (r() < 0.5 ? '00' : '30');

    for (let i = 0; i < 26; i++) {
      const created = now - Math.floor(2 + r() * 85) * DAY - Math.floor(r() * 8) * 3600000;
      const prog = pick(data.programs);
      const lead = {
        id: uid('L'),
        name: first[(i * 7) % first.length] + ' ' + pick(last),
        company: pick(comp),
        phone: '08' + String(Math.floor(1e9 + r() * 8e9)),
        email: '',
        source: pick(data.config.sources),
        ownerId: (bds.length ? pick(bds) : pick(data.team)).id,
        programId: prog.id,
        value: prog.price,
        stageId: open[0].id,
        nextAction: '',
        nextActionDate: '',
        notes: '',
        createdAt: new Date(created).toISOString(),
        updatedAt: new Date(created).toISOString(),
        history: [{ at: new Date(created).toISOString(), from: null, to: open[0].id, note: 'Lead dibuat' }]
      };
      let t = created;
      let idx = 0;
      const step = (toId, note) => {
        t = Math.min(t + Math.floor(1 + r() * 6) * DAY + Math.floor(r() * 6) * 3600000, now - 3600000);
        lead.history.push({ at: new Date(t).toISOString(), from: lead.stageId, to: toId, note: note || '' });
        lead.stageId = toId;
      };
      while (idx < open.length - 1 && r() < 0.68) { idx++; step(open[idx].id); }
      if (idx === open.length - 1 && r() < 0.55) { step(won.id, 'Deal closed'); lead.wonAt = new Date(t).toISOString(); }
      else if (now - created > 25 * DAY && r() < 0.45) { lead.lostReason = pick(data.config.lostReasons); step(lost.id, lead.lostReason); lead.lostAt = new Date(t).toISOString(); }
      lead.updatedAt = new Date(t).toISOString();

      // sesi historis untuk stage yang sudah dilewati
      lead.history.forEach((h) => {
        const st = typeByStage[h.to];
        if (!st) return;
        const d = new Date(h.at);
        data.sessions.push({ id: uid('S'), leadId: lead.id, typeId: st.id, date: localISO(d), time: hhmm(), mentorId: pick(mentors.length ? mentors : data.team).id, status: 'done', notes: '' });
      });
      // lead aktif: next action + kadang sesi terjadwal
      const cur = stages.find((s) => s.id === lead.stageId);
      if (cur.type === 'open') {
        const offset = Math.floor(r() * 9) - 3; // beberapa overdue
        lead.nextActionDate = localISO(new Date(now + offset * DAY));
        lead.nextAction = pick(['Follow up WA', 'Kirim proposal', 'Jadwalkan sesi berikutnya', 'Telepon ulang', 'Kirim materi preview']);
        const nextStage = open[idx + 1];
        if (nextStage && typeByStage[nextStage.id] && r() < 0.6) {
          const d = new Date(now + Math.floor(r() * 7) * DAY);
          data.sessions.push({ id: uid('S'), leadId: lead.id, typeId: typeByStage[nextStage.id].id, date: localISO(d), time: hhmm(), mentorId: pick(mentors.length ? mentors : data.team).id, status: 'scheduled', notes: '' });
        }
      }
      data.leads.push(lead);
    }
  }

  // ---------- Lookups ----------
  const L = (k) => (S.config.labels && S.config.labels[k]) || k;
  const stages = () => S.config.stages;
  const stage = (id) => stages().find((s) => s.id === id) || { id, name: id || '—', color: '#94a3b8', type: 'open', prob: 0 };
  const stageIdx = (id) => stages().findIndex((s) => s.id === id);
  const openStages = () => stages().filter((s) => s.type === 'open');
  const wonStage = () => stages().find((s) => s.type === 'won');
  const lostStage = () => stages().find((s) => s.type === 'lost');
  const member = (id) => S.team.find((m) => m.id === id);
  const memberName = (id) => (member(id) || {}).name || '—';
  const program = (id) => S.programs.find((p) => p.id === id);
  const stype = (id) => S.config.sessionTypes.find((t) => t.id === id) || { id, name: id || '—', color: '#94a3b8', duration: 0 };
  const lead = (id) => S.leads.find((l) => l.id === id);
  const mentorsList = () => S.team.filter((m) => ['senior', 'mentor', 'assistant'].includes(m.role));
  const ownersList = () => S.team.filter((m) => ['bd', 'admin', 'senior'].includes(m.role)).concat(S.team.filter((m) => !['bd', 'admin', 'senior'].includes(m.role)));
  const isOpen = (l) => stage(l.stageId).type === 'open';
  const isWon = (l) => stage(l.stageId).type === 'won';
  const isLost = (l) => stage(l.stageId).type === 'lost';
  const stageEnteredAt = (l) => { for (let i = l.history.length - 1; i >= 0; i--) if (l.history[i].to === l.stageId) return l.history[i].at; return l.createdAt; };

  function pillStage(id) {
    const s = stage(id);
    return `<span class="pill" style="background:${esc(s.color)}1a;color:${esc(s.color)}"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`;
  }
  function pillType(id) {
    const t = stype(id);
    return `<span class="pill" style="background:${esc(t.color)}1a;color:${esc(t.color)}">${esc(t.name)}${t.duration ? ' · ' + esc(durLabel(t.duration)) : ''}</span>`;
  }
  const durLabel = (m) => (m >= 60 ? (m / 60).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jam' : m + ' mnt');
  const options = (arr, sel, valFn, labFn, empty) =>
    (empty != null ? `<option value="">${esc(empty)}</option>` : '') +
    arr.map((x) => { const v = valFn(x); return `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(labFn(x))}</option>`; }).join('');

  // ---------- Domain actions ----------
  function moveStage(l, toId, note) {
    if (!l || l.stageId === toId) return;
    const to = stage(toId);
    l.history.push({ at: new Date().toISOString(), from: l.stageId, to: toId, note: note || '' });
    l.stageId = toId;
    if (to.type === 'won') { l.wonAt = new Date().toISOString(); delete l.lostAt; delete l.lostReason; }
    else if (to.type === 'lost') { l.lostAt = new Date().toISOString(); delete l.wonAt; }
    else { delete l.wonAt; delete l.lostAt; delete l.lostReason; }
    l.updatedAt = new Date().toISOString();
    save();
  }

  function requestStageChange(leadId, toId, after) {
    const l = lead(leadId);
    if (!l || l.stageId === toId) { after && after(); return; }
    const to = stage(toId);
    if (to.type === 'lost') {
      openModal(`Tandai Lost — ${l.name}`, `
        <label class="field"><span>Alasan lost *</span>
          <select name="reason" required>${options(S.config.lostReasons, '', (x) => x, (x) => x, 'Pilih alasan')}</select></label>
        <label class="field"><span>Catatan</span><textarea name="note" placeholder="Opsional — biar bisa di-nurture lagi nanti"></textarea></label>
        ${modalFoot('Tandai Lost', 'btn-danger')}`,
      (fd) => {
        l.lostReason = fd.get('reason');
        moveStage(l, toId, l.lostReason + (fd.get('note') ? ' — ' + fd.get('note') : ''));
        toast(`${l.name} → Lost`);
        after && after();
      });
      return;
    }
    if (to.type === 'won') {
      openModal(`🎉 Deal Won — ${l.name}`, `
        <div class="grid-2">
          <label class="field"><span>${esc(L('program'))}</span>
            <select name="programId">${options(S.programs, l.programId, (p) => p.id, (p) => p.name, '—')}</select></label>
          <label class="field"><span>Nilai deal (Rp) *</span><input name="value" type="number" min="0" step="1000" required value="${esc(l.value || '')}"></label>
        </div>
        <label class="field mt"><span>Catatan closing</span><textarea name="note" placeholder="Mis. DP 50%, mulai program bulan depan"></textarea></label>
        ${modalFoot('Konfirmasi Deal', 'btn-ok')}`,
      (fd) => {
        l.programId = fd.get('programId') || l.programId;
        l.value = Number(fd.get('value')) || 0;
        l.nextAction = ''; l.nextActionDate = '';
        moveStage(l, toId, fd.get('note') || 'Deal closed');
        toast(`🎉 ${l.name} closing ${fmtMoneyShort(l.value)}!`);
        after && after();
      });
      return;
    }
    moveStage(l, toId);
    toast(`${l.name} → ${to.name}`);
    after && after();
  }

  // ---------- Branding / chrome ----------
  function applyBrand() {
    const c = S.config;
    document.documentElement.style.setProperty('--accent', c.accent || '#2563eb');
    $('#brand-name').textContent = c.brandName || 'Mentoring CRM';
    $('#brand-tag').textContent = c.tagline || '';
    $('#brand-logo').textContent = initials(c.brandName).slice(0, 1) || 'M';
    document.title = (c.brandName || 'Mentoring') + ' CRM';
    $('#btn-add-lead-label').textContent = L('lead');
    $('#btn-add-session-label').textContent = L('session');
    $$('[data-label]').forEach((el) => { el.textContent = L(el.dataset.label); });
    $('#ws-select').innerHTML = wsIndex.map((w) => `<option value="${esc(w.id)}" ${w.id === wsId ? 'selected' : ''}>${esc(w.name)}</option>`).join('') +
      '<option value="__new">+ Workspace baru…</option>';
  }

  // ---------- Router ----------
  const views = { dashboard: renderDashboard, pipeline: renderPipeline, leads: renderLeads, sessions: renderSessions, settings: renderSettings };
  const ui = { period: '90', pipeOwner: '', pipeSearch: '', leadSearch: '', leadStage: '', leadOwner: '', leadSource: '', sessFilter: 'upcoming', sessType: '' };

  function currentView() { const v = location.hash.replace('#', ''); return views[v] ? v : 'dashboard'; }
  function render() {
    const v = currentView();
    $$('#tabs a').forEach((a) => a.classList.toggle('active', a.dataset.view === v));
    views[v]();
  }

  // ---------- Dashboard ----------
  function inPeriod(iso) {
    if (!iso) return false;
    if (ui.period === 'all') return true;
    if (ui.period === 'month') { const d = new Date(iso); const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); }
    return Date.now() - new Date(iso).getTime() <= Number(ui.period) * DAY;
  }

  function reachedIdx(l) {
    let max = -1;
    const visit = (id) => { const s = stage(id); if (s.type !== 'lost') max = Math.max(max, stageIdx(id)); };
    l.history.forEach((h) => visit(h.to));
    visit(l.stageId);
    return max;
  }

  function renderDashboard() {
    const cohort = S.leads.filter((l) => inPeriod(l.createdAt));
    const wonP = S.leads.filter((l) => isWon(l) && inPeriod(l.wonAt));
    const lostP = S.leads.filter((l) => isLost(l) && inPeriod(l.lostAt));
    const openAll = S.leads.filter(isOpen);
    const pipeVal = openAll.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const weighted = openAll.reduce((a, l) => a + (Number(l.value) || 0) * (stage(l.stageId).prob || 0) / 100, 0);
    const revenue = wonP.reduce((a, l) => a + (Number(l.value) || 0), 0);
    const cycle = wonP.length ? Math.round(wonP.reduce((a, l) => a + Math.max(0, daysBetween(l.createdAt, l.wonAt)), 0) / wonP.length) : 0;
    const today = todayISO();
    const overdue = openAll.filter((l) => l.nextActionDate && l.nextActionDate < today);
    const noAction = openAll.filter((l) => !l.nextActionDate);

    // Funnel
    const funnelStages = openStages().concat(wonStage() ? [wonStage()] : []);
    const funnel = funnelStages.map((s) => ({ s, n: cohort.filter((l) => reachedIdx(l) >= stageIdx(s.id)).length }));

    // Source
    const bySource = {};
    cohort.forEach((l) => {
      const k = l.source || '—';
      bySource[k] = bySource[k] || { leads: 0, won: 0, rev: 0 };
      bySource[k].leads++;
      if (isWon(l)) { bySource[k].won++; bySource[k].rev += Number(l.value) || 0; }
    });
    const srcRows = Object.entries(bySource).sort((a, b) => b[1].rev - a[1].rev || b[1].leads - a[1].leads);

    // Leaderboard
    const board = {};
    S.leads.forEach((l) => {
      const k = l.ownerId || '';
      board[k] = board[k] || { leads: 0, open: 0, won: 0, lost: 0, rev: 0 };
      if (inPeriod(l.createdAt)) board[k].leads++;
      if (isOpen(l)) board[k].open++;
      if (isWon(l) && inPeriod(l.wonAt)) { board[k].won++; board[k].rev += Number(l.value) || 0; }
      if (isLost(l) && inPeriod(l.lostAt)) board[k].lost++;
    });
    const boardRows = Object.entries(board).sort((a, b) => b[1].rev - a[1].rev || b[1].won - a[1].won || b[1].leads - a[1].leads);

    // Agenda
    const upcoming = S.sessions.filter((s) => s.status === 'scheduled' && s.date >= today)
      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 8);
    const todayCount = S.sessions.filter((s) => s.status === 'scheduled' && s.date === today).length;
    const stuck = openAll.filter((l) => { const sla = stage(l.stageId).sla; return sla > 0 && daysBetween(stageEnteredAt(l), new Date()) > sla; });

    const periodBtn = (v, t) => `<button type="button" class="${ui.period === v ? 'on' : ''}" data-period="${v}">${t}</button>`;
    $('#view').innerHTML = `
      <div class="page-head">
        <div><h1>Dashboard</h1><div class="muted small">Funnel ${esc(L('leads'))} → Deal, real-time</div></div>
        <div class="seg" id="period">${periodBtn('month', 'Bulan ini')}${periodBtn('30', '30 hari')}${periodBtn('90', '90 hari')}${periodBtn('all', 'Semua')}</div>
      </div>

      <div class="kpis">
        ${kpi(`${L('leads')} masuk`, cohort.length, `${openAll.length} masih aktif di pipeline`, true)}
        ${kpi('Pipeline aktif', fmtMoneyShort(pipeVal), `Weighted: ${fmtMoneyShort(weighted)}`)}
        ${kpi('Deal won', wonP.length, `${lostP.length} lost di periode ini`)}
        ${kpi('Revenue closed', fmtMoneyShort(revenue), wonP.length ? `Avg deal ${fmtMoneyShort(revenue / wonP.length)}` : 'Belum ada deal')}
        ${kpi('Win rate', pct(wonP.length, wonP.length + lostP.length) + '%', `Lead→Deal: ${pct(funnel.length ? funnel[funnel.length - 1].n : 0, cohort.length)}%`)}
        ${kpi('Sales cycle', cycle ? cycle + ' hari' : '—', `${todayCount} ${L('sessions')} hari ini`)}
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><div class="card-title">Funnel Conversion</div><div class="muted small">${esc(L('leads'))} yang pernah mencapai tiap stage (cohort periode ini)</div></div></div>
          ${cohort.length ? funnel.map((f, i) => {
            const prev = i ? funnel[i - 1].n : f.n;
            return `<div class="funnel-row">
              <div class="funnel-name" title="${esc(f.s.name)}">${esc(f.s.name)}</div>
              <div class="funnel-track"><div class="funnel-bar" style="width:${Math.max(pct(f.n, cohort.length), 4)}%;background:${esc(f.s.color)}">${f.n}</div></div>
              <div class="funnel-conv">${i ? `<b>${pct(f.n, prev)}%</b> dari prev` : `<b>100%</b>`}</div>
            </div>`;
          }).join('') : `<div class="empty">Belum ada ${esc(L('leads'))} di periode ini.</div>`}
          ${lostP.length ? `<div class="mt small muted">Top alasan lost: ${topReasons(lostP)}</div>` : ''}
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">🔥 Butuh Aksi</div><a class="small" href="#leads">Lihat semua</a></div>
          <div class="list">
            ${overdue.length + stuck.length + noAction.length === 0 ? '<div class="empty">Semua beres. Pipeline sehat 👌</div>' : ''}
            ${overdue.slice(0, 5).map((l) => actionItem(l, `<span class="badge badge-red">Overdue ${daysBetween(l.nextActionDate, today)}h</span>`, l.nextAction || 'Follow up')).join('')}
            ${stuck.filter((l) => !overdue.includes(l)).slice(0, 4).map((l) => actionItem(l, `<span class="badge badge-amber">Stuck ${daysBetween(stageEnteredAt(l), new Date())}h</span>`, `Di ${stage(l.stageId).name} > SLA ${stage(l.stageId).sla} hari`)).join('')}
            ${noAction.filter((l) => !stuck.includes(l)).slice(0, 3).map((l) => actionItem(l, `<span class="badge">No next step</span>`, 'Belum ada next action')).join('')}
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head"><div><div class="card-title">🏆 Leaderboard ${esc(L('owner'))}</div><div class="muted small">Ranking by revenue closed — basis SUKA / Self Compensation</div></div></div>
          <div class="table-wrap"><table>
            <thead><tr><th>#</th><th>Nama</th><th class="right">${esc(L('leads'))}</th><th class="right">Aktif</th><th class="right">Won</th><th class="right">Win %</th><th class="right">Revenue</th></tr></thead>
            <tbody>${boardRows.map(([id, b], i) => `<tr>
              <td class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</td>
              <td><b>${esc(memberName(id))}</b></td>
              <td class="right">${b.leads}</td><td class="right">${b.open}</td><td class="right">${b.won}</td>
              <td class="right">${pct(b.won, b.won + b.lost)}%</td>
              <td class="right nowrap"><b>${fmtMoneyShort(b.rev)}</b></td></tr>`).join('') || `<tr><td colspan="7" class="empty">Belum ada data</td></tr>`}
            </tbody></table></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">📅 ${esc(L('sessions'))} Mendatang</div><a class="small" href="#sessions">Jadwal lengkap</a></div>
          <div class="list">
            ${upcoming.map((s) => { const l = lead(s.leadId); return `<div class="list-item">
              <div style="width:62px" class="small"><b>${s.date === today ? 'Hari ini' : esc(fmtDate(s.date).replace(/ \d{4}$/, ''))}</b><div class="muted">${esc(s.time)}</div></div>
              <div class="grow"><div class="ellipsis"><b>${esc(l ? l.name : '—')}</b></div><div class="small muted ellipsis">${esc(stype(s.typeId).name)} · ${esc(memberName(s.mentorId))}</div></div>
              ${l && l.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waLink(s)}">WA</a>` : ''}
            </div>`; }).join('') || '<div class="empty">Belum ada jadwal mendatang.</div>'}
          </div>
        </div>
      </div>

      <div class="card mt">
        <div class="card-head"><div class="card-title">Performa per Sumber ${esc(L('lead'))}</div><div class="muted small">Alokasi budget marketing ke channel yang closing, bukan yang ramai</div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Sumber</th><th class="right">${esc(L('leads'))}</th><th class="right">Won</th><th class="right">Konversi</th><th class="right">Revenue</th></tr></thead>
          <tbody>${srcRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="right">${v.leads}</td><td class="right">${v.won}</td><td class="right">${pct(v.won, v.leads)}%</td><td class="right nowrap">${fmtMoneyShort(v.rev)}</td></tr>`).join('') || `<tr><td colspan="5" class="empty">Belum ada data</td></tr>`}</tbody>
        </table></div>
      </div>`;

    $$('#period button').forEach((b) => b.addEventListener('click', () => { ui.period = b.dataset.period; renderDashboard(); }));
    bindLeadOpeners();
  }

  const kpi = (label, value, sub, accent) => `<div class="kpi ${accent ? 'accent' : ''}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${esc(value)}</div><div class="kpi-sub">${esc(sub)}</div></div>`;
  const actionItem = (l, badge, text) => `<div class="list-item clickable" data-open-lead="${esc(l.id)}" style="cursor:pointer">
      <div class="grow"><div class="ellipsis"><b>${esc(l.name)}</b> <span class="muted small">${esc(l.company || '')}</span></div><div class="small muted ellipsis">${esc(text)} · ${esc(memberName(l.ownerId))}</div></div>${badge}</div>`;
  function topReasons(list) {
    const c = {};
    list.forEach((l) => { const k = l.lostReason || 'Lainnya'; c[k] = (c[k] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${esc(k)} (${v})`).join(', ');
  }

  // ---------- Pipeline (Kanban) ----------
  function renderPipeline() {
    const q = ui.pipeSearch.toLowerCase();
    const list = S.leads.filter((l) => (!ui.pipeOwner || l.ownerId === ui.pipeOwner) &&
      (!q || (l.name + ' ' + (l.company || '') + ' ' + (l.phone || '')).toLowerCase().includes(q)));
    const today = todayISO();

    $('#view').innerHTML = `
      <div class="page-head">
        <div><h1>Pipeline</h1><div class="muted small">Drag kartu antar kolom, atau ganti stage dari dropdown (mobile-friendly)</div></div>
        <div class="toolbar">
          <input id="pipe-search" type="search" placeholder="Cari nama / perusahaan / HP" value="${esc(ui.pipeSearch)}">
          <select id="pipe-owner">${options(ownersList(), ui.pipeOwner, (m) => m.id, (m) => m.name, `Semua ${L('owner')}`)}</select>
          <button class="btn btn-primary" data-new-lead>+ ${esc(L('lead'))}</button>
        </div>
      </div>
      <div class="board">
        ${stages().map((s) => {
          const items = list.filter((l) => l.stageId === s.id)
            .sort((a, b) => s.type === 'open' ? (a.nextActionDate || '9999').localeCompare(b.nextActionDate || '9999') : (b.updatedAt || '').localeCompare(a.updatedAt || ''));
          const shown = s.type === 'open' ? items : items.slice(0, 30);
          const sum = items.reduce((a, l) => a + (Number(l.value) || 0), 0);
          return `<div class="col" data-stage="${esc(s.id)}" style="--c:${esc(s.color)}">
            <div class="col-head">
              <div class="col-title"><span>${esc(s.name)}</span><span class="badge">${items.length}</span></div>
              <div class="col-sum">${fmtMoneyShort(sum)}${s.type === 'open' ? ` · ${s.prob}% prob` : ''}</div>
            </div>
            <div class="col-body">
              ${shown.map((l) => leadCard(l, today)).join('') || '<div class="empty">Kosong</div>'}
              ${items.length > shown.length ? `<div class="empty">+${items.length - shown.length} lainnya — lihat di tab ${esc(L('leads'))}</div>` : ''}
            </div></div>`;
        }).join('')}
      </div>`;

    const s = $('#pipe-search');
    s.addEventListener('input', () => { ui.pipeSearch = s.value; const pos = s.selectionStart; renderPipeline(); const n = $('#pipe-search'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#pipe-owner').addEventListener('change', (e) => { ui.pipeOwner = e.target.value; renderPipeline(); });
    $$('.lcard select').forEach((sel) => {
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('change', (e) => { e.stopPropagation(); requestStageChange(sel.dataset.lead, sel.value, renderPipeline); renderPipeline(); });
    });
    // Drag & drop
    $$('.lcard').forEach((c) => {
      c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.dataset.openLead); c.classList.add('dragging'); });
      c.addEventListener('dragend', () => c.classList.remove('dragging'));
    });
    $$('.col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault(); col.classList.remove('drop-target');
        const id = e.dataTransfer.getData('text/plain');
        if (id) requestStageChange(id, col.dataset.stage, renderPipeline);
      });
    });
    bindLeadOpeners();
  }

  function leadCard(l, today) {
    const s = stage(l.stageId);
    const overdue = s.type === 'open' && l.nextActionDate && l.nextActionDate < today;
    const days = daysBetween(stageEnteredAt(l), new Date());
    const stuck = s.type === 'open' && s.sla > 0 && days > s.sla;
    const next = S.sessions.filter((x) => x.leadId === l.id && x.status === 'scheduled' && x.date >= today).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0];
    return `<div class="lcard" draggable="true" data-open-lead="${esc(l.id)}">
      <div class="row" style="justify-content:space-between;align-items:flex-start;flex-wrap:nowrap">
        <div style="min-width:0"><div class="lcard-name ellipsis">${esc(l.name)}</div><div class="lcard-sub ellipsis">${esc(l.company || l.source || '')}</div></div>
        <span class="badge">${esc(initials(memberName(l.ownerId)))}</span>
      </div>
      ${next ? `<div class="tiny mt" style="margin-top:6px">📅 ${esc(stype(next.typeId).name)} · ${esc(next.date === today ? 'Hari ini' : fmtDate(next.date))} ${esc(next.time)}</div>` : ''}
      ${s.type === 'open' && l.nextActionDate ? `<div class="tiny" style="margin-top:4px;color:${overdue ? 'var(--danger)' : 'var(--muted)'}">⏭ ${esc(l.nextAction || 'Follow up')} · ${esc(fmtDate(l.nextActionDate))}</div>` : ''}
      ${s.type === 'lost' && l.lostReason ? `<div class="tiny muted" style="margin-top:4px">✖ ${esc(l.lostReason)}</div>` : ''}
      <div class="lcard-meta">
        <span class="lcard-value">${fmtMoneyShort(l.value)}</span>
        <span>${stuck ? `<span class="badge badge-amber">${days}h di stage</span>` : `<span class="muted">${days}h</span>`}</span>
      </div>
      <select data-lead="${esc(l.id)}" aria-label="Pindah stage">${options(stages(), l.stageId, (x) => x.id, (x) => '→ ' + x.name)}</select>
    </div>`;
  }

  // ---------- Leads table ----------
  function renderLeads() {
    const q = ui.leadSearch.toLowerCase();
    const list = S.leads.filter((l) =>
      (!ui.leadStage || l.stageId === ui.leadStage) && (!ui.leadOwner || l.ownerId === ui.leadOwner) && (!ui.leadSource || l.source === ui.leadSource) &&
      (!q || [l.name, l.company, l.phone, l.email, l.notes].join(' ').toLowerCase().includes(q))
    ).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    const today = todayISO();

    $('#view').innerHTML = `
      <div class="page-head">
        <div><h1>${esc(L('leads'))}</h1><div class="muted small">${list.length} dari ${S.leads.length} data</div></div>
        <div class="toolbar">
          <button class="btn" id="btn-csv">⬇ Export CSV</button>
          <button class="btn btn-primary" data-new-lead>+ ${esc(L('lead'))}</button>
        </div>
      </div>
      <div class="toolbar" style="margin-bottom:12px">
        <input id="lead-search" type="search" placeholder="Cari nama, perusahaan, HP, email, catatan" value="${esc(ui.leadSearch)}" style="min-width:240px">
        <select id="lead-stage-f">${options(stages(), ui.leadStage, (s) => s.id, (s) => s.name, 'Semua stage')}</select>
        <select id="lead-owner-f">${options(ownersList(), ui.leadOwner, (m) => m.id, (m) => m.name, `Semua ${L('owner')}`)}</select>
        <select id="lead-source-f">${options(S.config.sources, ui.leadSource, (x) => x, (x) => x, 'Semua sumber')}</select>
      </div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>Nama</th><th>Stage</th><th>${esc(L('program'))}</th><th class="right">Nilai</th><th>Sumber</th><th>${esc(L('owner'))}</th><th>Next action</th><th>Masuk</th></tr></thead>
        <tbody>${list.map((l) => `<tr class="clickable" data-open-lead="${esc(l.id)}">
          <td><b>${esc(l.name)}</b><div class="small muted">${esc(l.company || '')}${l.company && l.phone ? ' · ' : ''}${esc(l.phone || '')}</div></td>
          <td>${pillStage(l.stageId)}</td>
          <td class="small">${esc((program(l.programId) || {}).name || '—')}</td>
          <td class="right nowrap">${fmtMoneyShort(l.value)}</td>
          <td class="small">${esc(l.source || '—')}</td>
          <td class="small">${esc(memberName(l.ownerId))}</td>
          <td class="small">${isOpen(l) && l.nextActionDate ? `<span style="color:${l.nextActionDate < today ? 'var(--danger)' : 'inherit'}">${esc(fmtDate(l.nextActionDate))}</span><div class="muted">${esc(l.nextAction || '')}</div>` : '<span class="muted">—</span>'}</td>
          <td class="small nowrap">${esc(fmtDate(l.createdAt))}</td>
        </tr>`).join('') || `<tr><td colspan="8" class="empty">Tidak ada data. Klik "+ ${esc(L('lead'))}" untuk mulai.</td></tr>`}</tbody>
      </table></div></div>`;

    const s = $('#lead-search');
    s.addEventListener('input', () => { ui.leadSearch = s.value; const pos = s.selectionStart; renderLeads(); const n = $('#lead-search'); n.focus(); n.setSelectionRange(pos, pos); });
    $('#lead-stage-f').addEventListener('change', (e) => { ui.leadStage = e.target.value; renderLeads(); });
    $('#lead-owner-f').addEventListener('change', (e) => { ui.leadOwner = e.target.value; renderLeads(); });
    $('#lead-source-f').addEventListener('change', (e) => { ui.leadSource = e.target.value; renderLeads(); });
    $('#btn-csv').addEventListener('click', () => exportCSV(list));
    bindLeadOpeners();
  }

  // ---------- Sessions ----------
  function renderSessions() {
    const today = todayISO();
    const f = ui.sessFilter;
    const list = S.sessions.filter((s) => (!ui.sessType || s.typeId === ui.sessType) && (
      f === 'all' ? true :
      f === 'today' ? s.date === today :
      f === 'upcoming' ? s.status === 'scheduled' && s.date >= today :
      f === 'missed' ? s.status === 'scheduled' && s.date < today :
      s.status !== 'scheduled'
    )).sort((a, b) => (f === 'upcoming' || f === 'today' ? 1 : -1) * (a.date + a.time).localeCompare(b.date + b.time));
    const missedN = S.sessions.filter((s) => s.status === 'scheduled' && s.date < today).length;
    const segBtn = (v, t) => `<button type="button" class="${f === v ? 'on' : ''}" data-sf="${v}">${t}</button>`;
    const statusBadge = (s) => ({
      scheduled: s.date < today ? '<span class="badge badge-red">Belum di-update</span>' : '<span class="badge badge-blue">Terjadwal</span>',
      done: '<span class="badge badge-green">Selesai</span>',
      noshow: '<span class="badge badge-amber">No-show</span>',
      cancelled: '<span class="badge">Batal</span>'
    }[s.status] || esc(s.status));

    $('#view').innerHTML = `
      <div class="page-head">
        <div><h1>${esc(L('sessions'))}</h1><div class="muted small">Jadwal ${esc(L('sessions'))} funnel & delivery bersama ${esc(L('mentors'))}</div></div>
        <div class="toolbar">
          <select id="sess-type">${options(S.config.sessionTypes, ui.sessType, (t) => t.id, (t) => t.name, 'Semua jenis')}</select>
          <button class="btn btn-primary" data-new-session>+ ${esc(L('session'))}</button>
        </div>
      </div>
      <div class="seg" id="sess-seg" style="margin-bottom:12px">${segBtn('upcoming', 'Mendatang')}${segBtn('today', 'Hari ini')}${segBtn('missed', `Perlu update${missedN ? ' (' + missedN + ')' : ''}`)}${segBtn('past', 'Riwayat')}${segBtn('all', 'Semua')}</div>
      <div class="card table-card"><div class="table-wrap"><table>
        <thead><tr><th>Tanggal</th><th>Jenis</th><th>${esc(L('lead'))} / ${esc(L('client'))}</th><th>${esc(L('mentor'))}</th><th>Status</th><th class="right">Aksi</th></tr></thead>
        <tbody>${list.map((s) => { const l = lead(s.leadId); return `<tr>
          <td class="nowrap"><b>${esc(s.date === today ? 'Hari ini' : fmtDate(s.date))}</b><div class="small muted">${esc(s.time)} WIB</div></td>
          <td>${pillType(s.typeId)}</td>
          <td>${l ? `<a href="#" data-open-lead="${esc(l.id)}"><b>${esc(l.name)}</b></a><div class="small muted">${pillStage(l.stageId)}</div>` : '<span class="muted">(dihapus)</span>'}</td>
          <td class="small">${esc(memberName(s.mentorId))}</td>
          <td>${statusBadge(s)}${s.notes ? `<div class="tiny muted" style="max-width:220px">${esc(s.notes)}</div>` : ''}</td>
          <td class="right nowrap">
            ${l && l.phone && s.status === 'scheduled' ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="${waLink(s)}">WA reminder</a>` : ''}
            ${s.status === 'scheduled' ? `<button class="btn btn-sm btn-ok" data-sess-done="${esc(s.id)}">Selesai</button><button class="btn btn-sm" data-sess-noshow="${esc(s.id)}">No-show</button>` : ''}
            <button class="btn btn-sm" data-sess-edit="${esc(s.id)}">Edit</button>
          </td></tr>`; }).join('') || `<tr><td colspan="6" class="empty">Tidak ada ${esc(L('sessions'))}.</td></tr>`}</tbody>
      </table></div></div>`;

    $$('#sess-seg button').forEach((b) => b.addEventListener('click', () => { ui.sessFilter = b.dataset.sf; renderSessions(); }));
    $('#sess-type').addEventListener('change', (e) => { ui.sessType = e.target.value; renderSessions(); });
    bindSessionActions(renderSessions);
    bindLeadOpeners();
  }

  function bindSessionActions(rerender) {
    $$('[data-sess-done]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); completeSession(b.dataset.sessDone, rerender); }));
    $$('[data-sess-noshow]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      const s = S.sessions.find((x) => x.id === b.dataset.sessNoshow);
      s.status = 'noshow'; save(); toast('Ditandai no-show — jangan lupa reschedule'); rerender();
    }));
    $$('[data-sess-edit]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); sessionForm(S.sessions.find((x) => x.id === b.dataset.sessEdit), null, rerender); }));
  }

  function completeSession(id, rerender) {
    const s = S.sessions.find((x) => x.id === id);
    const l = lead(s.leadId);
    const t = stype(s.typeId);
    const opens = openStages();
    const curIdx = l ? opens.findIndex((x) => x.id === l.stageId) : -1;
    const nextStage = curIdx >= 0 ? (opens[curIdx + 1] || wonStage()) : null;
    openModal(`Selesaikan ${t.name} — ${l ? l.name : ''}`, `
      <label class="field"><span>Catatan / hasil ${esc(L('session'))}</span><textarea name="notes" placeholder="Insight, pain point, keputusan, action items">${esc(s.notes || '')}</textarea></label>
      ${l && isOpen(l) ? `
        <label class="field mt"><span>Next step untuk ${esc(L('lead'))}</span>
          <select name="next">
            <option value="">Tetap di ${esc(stage(l.stageId).name)}</option>
            ${nextStage ? `<option value="${esc(nextStage.id)}" selected>Lanjut → ${esc(nextStage.name)}</option>` : ''}
            ${lostStage() ? `<option value="${esc(lostStage().id)}">Tidak lanjut → Lost</option>` : ''}
          </select></label>
        <div class="grid-2 mt">
          <label class="field"><span>Next action</span><input name="nextAction" value="${esc(nextStage ? 'Jadwalkan ' + nextStage.name : 'Follow up')}"></label>
          <label class="field"><span>Tanggal</span><input name="nextActionDate" type="date" value="${esc(localISO(new Date(Date.now() + 2 * DAY)))}"></label>
        </div>` : ''}
      ${modalFoot('Simpan', 'btn-ok')}`,
    (fd) => {
      s.status = 'done'; s.notes = fd.get('notes') || '';
      save();
      if (l && isOpen(l)) {
        l.nextAction = fd.get('nextAction') || ''; l.nextActionDate = fd.get('nextActionDate') || '';
        save();
        const nx = fd.get('next');
        if (nx) { requestStageChange(l.id, nx, rerender); return; }
      }
      toast(`${t.name} selesai ✔`);
      rerender();
    });
  }

  const waLink = (s) => {
    const l = lead(s.leadId);
    const msg = (S.config.waTemplate || '')
      .replace(/\{name\}/g, l ? l.name.split(' ')[0] : '')
      .replace(/\{type\}/g, stype(s.typeId).name)
      .replace(/\{mentor\}/g, memberName(s.mentorId))
      .replace(/\{date\}/g, fmtDate(s.date))
      .replace(/\{time\}/g, s.time)
      .replace(/\{brand\}/g, S.config.brandName || '');
    return `https://wa.me/${waNumber(l && l.phone)}?text=${encodeURIComponent(msg)}`;
  };

  // ---------- Lead drawer ----------
  function bindLeadOpeners() {
    $$('[data-open-lead]').forEach((el) => el.addEventListener('click', (e) => {
      if (e.target.closest('select, button, a.btn')) return;
      e.preventDefault();
      openLead(el.dataset.openLead);
    }));
    $$('[data-new-lead]').forEach((b) => b.addEventListener('click', () => leadForm()));
    $$('[data-new-session]').forEach((b) => b.addEventListener('click', () => sessionForm()));
  }

  function openLead(id) {
    const l = lead(id);
    if (!l) return;
    const today = todayISO();
    const sess = S.sessions.filter((s) => s.leadId === id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
    const cur = stage(l.stageId);
    const curI = stageIdx(l.stageId);
    const prog = program(l.programId);
    $('#drawer-panel').innerHTML = `
      <div class="drawer-head">
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap">
          <div style="min-width:0"><h3 class="ellipsis">${esc(l.name)}</h3><div class="small muted">${esc(l.company || '')} ${pillStage(l.stageId)}</div></div>
          <button class="icon-btn" data-close-drawer aria-label="Tutup">✕</button>
        </div>
        <div class="row mt">
          ${l.phone ? `<a class="btn btn-sm btn-wa" target="_blank" rel="noopener" href="https://wa.me/${esc(waNumber(l.phone))}">💬 WhatsApp</a>` : ''}
          <button class="btn btn-sm" id="d-edit">✎ Edit</button>
          <button class="btn btn-sm" id="d-sess">📅 Jadwalkan ${esc(L('session'))}</button>
          ${cur.type === 'open' && wonStage() ? `<button class="btn btn-sm btn-ok" id="d-won">✔ Won</button>` : ''}
          ${cur.type === 'open' && lostStage() ? `<button class="btn btn-sm btn-danger" id="d-lost">✖ Lost</button>` : ''}
        </div>
      </div>
      <div class="drawer-body">
        <div class="drawer-section">
          <h4>Stage funnel</h4>
          <div class="stage-steps">${stages().map((s, i) => `<button class="stage-step ${s.id === l.stageId ? 'current' : (i < curI && s.type === 'open' && cur.type !== 'lost' ? 'passed' : '')}" ${s.id === l.stageId ? `style="background:${esc(s.color)};border-color:${esc(s.color)}"` : ''} data-step="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>
          ${cur.type === 'open' ? `<div class="hint">Di stage ini ${daysBetween(stageEnteredAt(l), new Date())} hari${cur.sla ? ` · SLA ${cur.sla} hari` : ''} · Probabilitas ${cur.prob}%</div>` : ''}
          ${l.lostReason && cur.type === 'lost' ? `<div class="hint">Alasan lost: <b>${esc(l.lostReason)}</b></div>` : ''}
        </div>
        <div class="drawer-section">
          <h4>Next action</h4>
          <div class="grid-2">
            <input id="d-na" placeholder="Mis. Follow up proposal" value="${esc(l.nextAction || '')}">
            <input id="d-nad" type="date" value="${esc(l.nextActionDate || '')}">
          </div>
          ${l.nextActionDate && l.nextActionDate < today && cur.type === 'open' ? '<div class="warn-text mt">⚠ Overdue</div>' : ''}
        </div>
        <div class="drawer-section">
          <h4>Detail</h4>
          <table class="small"><tbody>
            ${drow('HP / WA', l.phone)}${drow('Email', l.email)}${drow('Sumber', l.source)}${drow(L('owner'), memberName(l.ownerId))}
            ${drow(L('program'), prog ? prog.name : '')}${drow('Nilai', fmtMoney(l.value))}${drow('Masuk', fmtDateTime(l.createdAt))}
            ${l.wonAt ? drow('Closing', fmtDateTime(l.wonAt) + ` (${daysBetween(l.createdAt, l.wonAt)} hari)`) : ''}
          </tbody></table>
          ${l.notes ? `<div class="mt small" style="white-space:pre-wrap;background:var(--soft);padding:10px;border-radius:8px">${esc(l.notes)}</div>` : ''}
        </div>
        <div class="drawer-section">
          <h4>${esc(L('sessions'))} (${sess.length})</h4>
          <div class="list">${sess.map((s) => `<div class="list-item">
            <div class="grow"><div>${pillType(s.typeId)}</div><div class="small muted mt" style="margin-top:4px">${esc(fmtDate(s.date))} ${esc(s.time)} · ${esc(memberName(s.mentorId))} · ${esc({ scheduled: 'Terjadwal', done: 'Selesai', noshow: 'No-show', cancelled: 'Batal' }[s.status] || s.status)}</div>${s.notes ? `<div class="tiny" style="white-space:pre-wrap">${esc(s.notes)}</div>` : ''}</div>
            ${s.status === 'scheduled' ? `<button class="btn btn-sm btn-ok" data-sess-done="${esc(s.id)}">Selesai</button>` : ''}
            <button class="btn btn-sm" data-sess-edit="${esc(s.id)}">Edit</button>
          </div>`).join('') || '<div class="empty">Belum ada.</div>'}</div>
        </div>
        <div class="drawer-section">
          <h4>Riwayat</h4>
          <div class="timeline">${l.history.slice().reverse().map((h) => `<div class="tl-item" style="--c:${esc(stage(h.to).color)}">
            <b>${h.from ? esc(stage(h.from).name) + ' → ' : ''}${esc(stage(h.to).name)}</b>
            <div class="muted tiny">${esc(fmtDateTime(h.at))}${h.note ? ' · ' + esc(h.note) : ''}</div></div>`).join('')}</div>
        </div>
        <div class="row"><span class="spacer"></span><button class="btn btn-sm btn-danger" id="d-del">Hapus ${esc(L('lead'))}</button></div>
      </div>`;
    $('#drawer').classList.add('open');
    $('#drawer').setAttribute('aria-hidden', 'false');

    const refresh = () => { render(); if ($('#drawer').classList.contains('open')) openLead(id); };
    $('#d-edit').addEventListener('click', () => leadForm(l, refresh));
    $('#d-sess').addEventListener('click', () => sessionForm(null, l.id, refresh));
    $('#d-won') && $('#d-won').addEventListener('click', () => requestStageChange(l.id, wonStage().id, refresh));
    $('#d-lost') && $('#d-lost').addEventListener('click', () => requestStageChange(l.id, lostStage().id, refresh));
    $$('[data-step]').forEach((b) => b.addEventListener('click', () => requestStageChange(l.id, b.dataset.step, refresh)));
    const saveNA = () => { l.nextAction = $('#d-na').value; l.nextActionDate = $('#d-nad').value; l.updatedAt = new Date().toISOString(); save(); render(); toast('Next action disimpan'); };
    $('#d-na').addEventListener('change', saveNA);
    $('#d-nad').addEventListener('change', saveNA);
    $('#d-del').addEventListener('click', () => {
      if (!confirm(`Hapus ${l.name} beserta ${L('sessions')}-nya?`)) return;
      S.leads = S.leads.filter((x) => x.id !== l.id);
      S.sessions = S.sessions.filter((x) => x.leadId !== l.id);
      save(); closeDrawer(); render(); toast('Dihapus');
    });
    bindSessionActions(refresh);
  }
  const drow = (k, v) => `<tr><td class="muted" style="padding:4px 12px 4px 0;border:0;white-space:nowrap">${esc(k)}</td><td style="padding:4px 0;border:0">${esc(v || '—')}</td></tr>`;
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true'); }

  // ---------- Forms ----------
  function leadForm(l, after) {
    const isNew = !l;
    const d = l || { stageId: openStages()[0] && openStages()[0].id, source: S.config.sources[0], ownerId: (S.team.find((m) => m.role === 'bd') || S.team[0] || {}).id };
    openModal(isNew ? `${L('lead')} Baru` : `Edit ${L('lead')}`, `
      <div class="grid-2">
        <label class="field"><span>Nama *</span><input name="name" required value="${esc(d.name || '')}" placeholder="Nama lengkap"></label>
        <label class="field"><span>Perusahaan / Bisnis</span><input name="company" value="${esc(d.company || '')}"></label>
        <label class="field"><span>No. WhatsApp *</span><input name="phone" type="tel" required value="${esc(d.phone || '')}" placeholder="0812xxxxxxx"><div class="warn-text" id="dup-warn"></div></label>
        <label class="field"><span>Email</span><input name="email" type="email" value="${esc(d.email || '')}"></label>
        <label class="field"><span>Sumber</span><select name="source">${options(S.config.sources, d.source, (x) => x, (x) => x)}</select></label>
        <label class="field"><span>${esc(L('owner'))} (PIC)</span><select name="ownerId">${options(ownersList(), d.ownerId, (m) => m.id, (m) => m.name + ' — ' + (window.ROLES[m.role] || m.role))}</select></label>
        <label class="field"><span>${esc(L('program'))} diminati</span><select name="programId" id="f-prog">${options(S.programs, d.programId, (p) => p.id, (p) => `${p.name} (${fmtMoneyShort(p.price)})`, '— belum tahu —')}</select></label>
        <label class="field"><span>Estimasi nilai (Rp)</span><input name="value" id="f-val" type="number" min="0" step="1000" value="${esc(d.value ?? '')}"></label>
        ${isNew ? `<label class="field"><span>Stage awal</span><select name="stageId">${options(openStages(), d.stageId, (s) => s.id, (s) => s.name)}</select></label>` : ''}
        <label class="field"><span>Next action</span><input name="nextAction" value="${esc(d.nextAction || (isNew ? 'Follow up WA' : ''))}"></label>
        <label class="field"><span>Tanggal next action</span><input name="nextActionDate" type="date" value="${esc(d.nextActionDate || (isNew ? localISO(new Date(Date.now() + DAY)) : ''))}"></label>
      </div>
      <label class="field mt"><span>Catatan</span><textarea name="notes" placeholder="Kebutuhan, pain point, budget, timeline…">${esc(d.notes || '')}</textarea></label>
      ${modalFoot(isNew ? `Simpan ${L('lead')}` : 'Simpan')}`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      if (isNew) {
        const nowIso = new Date().toISOString();
        const nl = { id: uid('L'), name: v.name.trim(), company: v.company, phone: v.phone, email: v.email, source: v.source, ownerId: v.ownerId, programId: v.programId, value: Number(v.value) || 0, stageId: v.stageId, nextAction: v.nextAction, nextActionDate: v.nextActionDate, notes: v.notes, createdAt: nowIso, updatedAt: nowIso, history: [{ at: nowIso, from: null, to: v.stageId, note: `${L('lead')} dibuat` }] };
        S.leads.unshift(nl);
        save(); toast(`${nl.name} masuk pipeline ✔`);
        render();
        after && after();
      } else {
        Object.assign(l, { name: v.name.trim(), company: v.company, phone: v.phone, email: v.email, source: v.source, ownerId: v.ownerId, programId: v.programId, value: Number(v.value) || 0, nextAction: v.nextAction, nextActionDate: v.nextActionDate, notes: v.notes, updatedAt: new Date().toISOString() });
        save(); toast('Tersimpan');
        render();
        after && after();
      }
    });
    const val = $('#f-val');
    $('#f-prog').addEventListener('change', (e) => { const p = program(e.target.value); if (p && (!val.value || Number(val.value) === 0 || !isNew)) val.value = p.price; });
    $('#modal-form [name=phone]').addEventListener('input', (e) => {
      const n = waNumber(e.target.value);
      const dup = n.length > 6 && S.leads.find((x) => x !== l && waNumber(x.phone) === n);
      $('#dup-warn').textContent = dup ? `⚠ Nomor ini sudah ada: ${dup.name} (${stage(dup.stageId).name})` : '';
    });
  }

  function sessionForm(s, presetLeadId, after) {
    const isNew = !s;
    if (!S.leads.length) { toast(`Tambah ${L('lead')} dulu`); return; }
    const leadId = s ? s.leadId : presetLeadId || '';
    const l0 = lead(leadId);
    // default jenis sesi = sesi untuk stage berikutnya dari lead
    let defType = S.config.sessionTypes[0] && S.config.sessionTypes[0].id;
    if (l0 && isOpen(l0)) {
      const opens = openStages(); const i = opens.findIndex((x) => x.id === l0.stageId);
      const t = S.config.sessionTypes.find((x) => x.stageId && (x.stageId === (opens[i + 1] || {}).id)) || S.config.sessionTypes.find((x) => x.stageId === l0.stageId);
      if (t) defType = t.id;
    } else if (l0 && isWon(l0)) {
      const t = S.config.sessionTypes.find((x) => !x.stageId); if (t) defType = t.id;
    }
    const d = s || { leadId, typeId: defType, date: todayISO(), time: '10:00', mentorId: (mentorsList()[0] || S.team[0] || {}).id, status: 'scheduled' };
    const leadsSorted = S.leads.slice().sort((a, b) => a.name.localeCompare(b.name));
    openModal(isNew ? `Jadwalkan ${L('session')}` : `Edit ${L('session')}`, `
      <label class="field"><span>${esc(L('lead'))} / ${esc(L('client'))} *</span>
        <select name="leadId" required>${options(leadsSorted, d.leadId, (x) => x.id, (x) => `${x.name}${x.company ? ' — ' + x.company : ''} [${stage(x.stageId).name}]`, 'Pilih…')}</select></label>
      <label class="field mt"><span>Jenis ${esc(L('session'))} *</span>
        <select name="typeId" required>${options(S.config.sessionTypes, d.typeId, (t) => t.id, (t) => `${t.name} (${durLabel(t.duration)})${t.stageId ? ' → stage ' + stage(t.stageId).name : ''}`)}</select>
        <div class="hint">Jenis sesi yang terhubung ke stage funnel otomatis memajukan ${esc(L('lead'))} ke stage tersebut.</div></label>
      <div class="grid-3 mt">
        <label class="field"><span>Tanggal *</span><input name="date" type="date" required value="${esc(d.date)}"></label>
        <label class="field"><span>Jam *</span><input name="time" type="time" required value="${esc(d.time)}"></label>
        <label class="field"><span>Status</span><select name="status">${options([['scheduled', 'Terjadwal'], ['done', 'Selesai'], ['noshow', 'No-show'], ['cancelled', 'Batal']], d.status, (x) => x[0], (x) => x[1])}</select></label>
      </div>
      <label class="field mt"><span>${esc(L('mentor'))} *</span><select name="mentorId" required>${options(mentorsList().length ? mentorsList() : S.team, d.mentorId, (m) => m.id, (m) => m.name + ' — ' + (window.ROLES[m.role] || m.role))}</select></label>
      <label class="field mt"><span>Catatan</span><textarea name="notes" placeholder="Link Zoom / lokasi / agenda">${esc(d.notes || '')}</textarea></label>
      <div class="modal-foot">${!isNew ? '<button type="button" class="btn btn-danger" id="sess-del">Hapus</button><span class="spacer"></span>' : ''}<button type="button" class="btn" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>`,
    (fd) => {
      const v = Object.fromEntries(fd.entries());
      const target = s || { id: uid('S') };
      Object.assign(target, { leadId: v.leadId, typeId: v.typeId, date: v.date, time: v.time, mentorId: v.mentorId, status: v.status, notes: v.notes });
      if (isNew) S.sessions.push(target);
      save();
      // auto-advance funnel stage
      const l = lead(v.leadId); const t = stype(v.typeId);
      let msg = isNew ? `${t.name} terjadwal ✔` : 'Tersimpan';
      if (l && t.stageId && isOpen(l) && stageIdx(t.stageId) > stageIdx(l.stageId)) {
        moveStage(l, t.stageId, `Auto: ${t.name} dijadwalkan`);
        msg += ` · ${l.name} → ${stage(t.stageId).name}`;
      }
      toast(msg);
      render();
      after && after();
    });
    const del = $('#sess-del');
    if (del) del.addEventListener('click', () => {
      if (!confirm('Hapus jadwal ini?')) return;
      S.sessions = S.sessions.filter((x) => x.id !== s.id); save(); closeModal(); render(); after && after(); toast('Dihapus');
    });
  }

  // ---------- Settings ----------
  function renderSettings() {
    const c = S.config;
    const labelKeys = [['lead', `${'Lead'} (tunggal)`], ['leads', 'Lead (jamak)'], ['client', 'Client (tunggal)'], ['clients', 'Client (jamak)'], ['mentor', 'Mentor (tunggal)'], ['mentors', 'Mentor (jamak)'], ['session', 'Session (tunggal)'], ['sessions', 'Session (jamak)'], ['program', 'Program (tunggal)'], ['programs', 'Program (jamak)'], ['owner', 'PIC / Sales']];
    const leadsIn = (id) => S.leads.filter((l) => l.stageId === id).length;
    $('#view').innerHTML = `
      <div class="page-head"><div><h1>Settings</h1><div class="muted small">Semua label, funnel & master data bisa dikonfigurasi per workspace. Perubahan tersimpan otomatis.</div></div></div>
      <div class="settings-grid">
        <div class="card">
          <div class="card-title">Brand</div>
          <div class="form-stack mt">
            <label class="field"><span>Nama workspace (di switcher)</span><input data-ws-name value="${esc((wsIndex.find((w) => w.id === wsId) || {}).name || '')}"></label>
            <label class="field"><span>Nama brand</span><input data-cfg="brandName" value="${esc(c.brandName)}"></label>
            <label class="field"><span>Tagline</span><input data-cfg="tagline" value="${esc(c.tagline)}"></label>
            <label class="field"><span>Warna brand</span><input type="color" data-cfg="accent" value="${esc(c.accent)}"></label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Terminologi (Label)</div>
          <div class="hint">Mis. Mentor → Coach / Teacher / PT / Consultant. Session → Class / Webinar / Workshop.</div>
          <div class="grid-2 mt">${labelKeys.map(([k, t]) => `<label class="field"><span>${esc(t)}</span><input data-label-key="${k}" value="${esc(c.labels[k] || '')}"></label>`).join('')}</div>
        </div>

        <div class="card full">
          <div class="card-head"><div><div class="card-title">Stage Funnel</div><div class="hint">Urutan = alur funnel. Prob% dipakai untuk weighted pipeline. SLA = maksimal hari di stage sebelum ditandai "stuck".</div></div><button class="btn btn-sm" id="add-stage">+ Stage</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th></th><th>Nama</th><th>Warna</th><th>Prob %</th><th>SLA (hari)</th><th>Tipe</th><th>${esc(L('leads'))}</th><th></th></tr></thead><tbody>
            ${c.stages.map((s, i) => `<tr>
              <td class="nowrap">${s.type === 'open' ? `<button class="btn btn-sm" data-stage-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button>` : ''}</td>
              <td><input data-stage="${i}" data-k="name" value="${esc(s.name)}"></td>
              <td><input type="color" data-stage="${i}" data-k="color" value="${esc(s.color)}"></td>
              <td><input type="number" min="0" max="100" data-stage="${i}" data-k="prob" value="${esc(s.prob)}" style="width:72px"></td>
              <td><input type="number" min="0" data-stage="${i}" data-k="sla" value="${esc(s.sla)}" style="width:72px" ${s.type !== 'open' ? 'disabled' : ''}></td>
              <td class="small">${s.type === 'open' ? 'Proses' : s.type === 'won' ? '<span class="badge badge-green">Won</span>' : '<span class="badge badge-red">Lost</span>'}</td>
              <td class="small">${leadsIn(s.id)}</td>
              <td>${s.type === 'open' ? `<button class="btn btn-sm btn-danger" data-stage-del="${i}" title="${leadsIn(s.id) ? 'Pindahkan dulu leads di stage ini' : 'Hapus'}">✕</button>` : ''}</td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>

        <div class="card full">
          <div class="card-head"><div><div class="card-title">Jenis ${esc(L('session'))}</div><div class="hint">Hubungkan ke stage funnel → saat dijadwalkan, ${esc(L('lead'))} otomatis maju ke stage tsb. Kosongkan untuk sesi delivery (setelah deal).</div></div><button class="btn btn-sm" id="add-stype">+ Jenis</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th>Nama</th><th>Durasi (mnt)</th><th>Warna</th><th>Stage funnel</th><th></th></tr></thead><tbody>
            ${c.sessionTypes.map((t, i) => `<tr>
              <td><input data-stype="${i}" data-k="name" value="${esc(t.name)}"></td>
              <td><input type="number" min="0" data-stype="${i}" data-k="duration" value="${esc(t.duration)}" style="width:90px"></td>
              <td><input type="color" data-stype="${i}" data-k="color" value="${esc(t.color)}"></td>
              <td><select data-stype="${i}" data-k="stageId">${options(openStages(), t.stageId, (s) => s.id, (s) => s.name, '— Delivery (tanpa stage) —')}</select></td>
              <td><button class="btn btn-sm btn-danger" data-stype-del="${i}">✕</button></td>
            </tr>`).join('')}
          </tbody></table></div>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">Tim (${esc(L('mentors'))}, ${esc(L('owner'))}, Admin)</div><button class="btn btn-sm" id="add-member">+ Orang</button></div>
          <table class="edit-table"><tbody>
            ${S.team.map((m, i) => `<tr>
              <td><input data-member="${i}" data-k="name" value="${esc(m.name)}"></td>
              <td><select data-member="${i}" data-k="role">${options(Object.entries(window.ROLES), m.role, (x) => x[0], (x) => x[1])}</select></td>
              <td><button class="btn btn-sm btn-danger" data-member-del="${i}">✕</button></td></tr>`).join('')}
          </tbody></table>
        </div>

        <div class="card">
          <div class="card-head"><div class="card-title">${esc(L('programs'))} / Produk</div><button class="btn btn-sm" id="add-program">+ ${esc(L('program'))}</button></div>
          <div class="table-wrap"><table class="edit-table"><thead><tr><th>Nama</th><th>Format</th><th>Harga (Rp)</th><th>#Sesi</th><th>Bulan</th><th></th></tr></thead><tbody>
            ${S.programs.map((p, i) => `<tr>
              <td><input data-program="${i}" data-k="name" value="${esc(p.name)}" style="min-width:150px"></td>
              <td><select data-program="${i}" data-k="format">${options(['Private', 'Group', 'Online', 'Hybrid'], p.format, (x) => x, (x) => x)}</select></td>
              <td><input type="number" min="0" step="1000" data-program="${i}" data-k="price" value="${esc(p.price)}" style="width:120px"></td>
              <td><input type="number" min="0" data-program="${i}" data-k="sessions" value="${esc(p.sessions)}" style="width:60px"></td>
              <td><input type="number" min="0" data-program="${i}" data-k="months" value="${esc(p.months)}" style="width:60px"></td>
              <td><button class="btn btn-sm btn-danger" data-program-del="${i}">✕</button></td></tr>`).join('')}
          </tbody></table></div>
        </div>

        <div class="card">
          <div class="card-title">Sumber ${esc(L('lead'))}</div><div class="hint">Satu per baris</div>
          <textarea class="mt" data-list="sources" rows="6">${esc(c.sources.join('\n'))}</textarea>
          <div class="card-title mt">Alasan Lost</div>
          <textarea class="mt" data-list="lostReasons" rows="5">${esc(c.lostReasons.join('\n'))}</textarea>
        </div>

        <div class="card">
          <div class="card-title">Template WA Reminder</div>
          <div class="hint">Placeholder: {name} {type} {mentor} {date} {time} {brand}</div>
          <textarea class="mt" data-cfg="waTemplate" rows="4">${esc(c.waTemplate)}</textarea>
          <div class="card-title mt">Data & Workspace</div>
          <div class="row mt">
            <button class="btn" id="exp-json">⬇ Backup JSON</button>
            <label class="btn">⬆ Restore JSON<input type="file" id="imp-json" accept="application/json,.json" hidden></label>
            <button class="btn" id="exp-csv">⬇ CSV ${esc(L('leads'))}</button>
          </div>
          <div class="row mt">
            <button class="btn" id="reset-demo">↺ Isi ulang data demo</button>
            <button class="btn btn-danger" id="clear-data">Kosongkan data (go-live)</button>
            <button class="btn btn-danger" id="del-ws">Hapus workspace</button>
          </div>
          <div class="hint">Data tersimpan di browser ini (localStorage). Backup JSON rutin sampai versi cloud (Supabase/Odoo) live.</div>
        </div>
      </div>`;

    const reBrand = () => { save(); applyBrand(); };
    $$('[data-cfg]').forEach((el) => el.addEventListener('change', () => { c[el.dataset.cfg] = el.value; reBrand(); toast('Tersimpan'); }));
    $('[data-ws-name]').addEventListener('change', (e) => { const w = wsIndex.find((x) => x.id === wsId); w.name = e.target.value || w.name; Store.set(K_INDEX, wsIndex); applyBrand(); toast('Tersimpan'); });
    $$('[data-label-key]').forEach((el) => el.addEventListener('change', () => { c.labels[el.dataset.labelKey] = el.value || el.dataset.labelKey; reBrand(); renderSettings(); toast('Label diperbarui'); }));
    const num = (k, v) => (['prob', 'sla', 'duration', 'price', 'sessions', 'months'].includes(k) ? Number(v) || 0 : v);
    const bindRows = (attr, arr) => $$(`[data-${attr}]`).forEach((el) => el.addEventListener('change', () => { arr()[Number(el.dataset[attr])][el.dataset.k] = num(el.dataset.k, el.value); save(); toast('Tersimpan'); }));
    bindRows('stage', () => c.stages);
    bindRows('stype', () => c.sessionTypes);
    bindRows('member', () => S.team);
    bindRows('program', () => S.programs);
    $$('[data-list]').forEach((el) => el.addEventListener('change', () => { c[el.dataset.list] = el.value.split('\n').map((x) => x.trim()).filter(Boolean); save(); toast('Tersimpan'); }));

    $('#add-stage').addEventListener('click', () => {
      const lastOpen = c.stages.reduce((a, s, i) => (s.type === 'open' ? i : a), -1);
      c.stages.splice(lastOpen + 1, 0, { id: uid('stg'), name: 'Stage baru', color: '#0ea5e9', prob: 50, sla: 5, type: 'open' });
      save(); renderSettings();
    });
    $$('[data-stage-up]').forEach((b) => b.addEventListener('click', () => { const i = Number(b.dataset.stageUp); [c.stages[i - 1], c.stages[i]] = [c.stages[i], c.stages[i - 1]]; save(); renderSettings(); }));
    $$('[data-stage-del]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.stageDel); const s = c.stages[i];
      if (leadsIn(s.id)) { toast(`Masih ada ${leadsIn(s.id)} ${L('leads')} di stage ini`); return; }
      if (c.stages.filter((x) => x.type === 'open').length <= 1) { toast('Minimal 1 stage proses'); return; }
      c.stages.splice(i, 1); c.sessionTypes.forEach((t) => { if (t.stageId === s.id) t.stageId = ''; }); save(); renderSettings();
    }));
    $('#add-stype').addEventListener('click', () => { c.sessionTypes.push({ id: uid('st'), name: `${L('session')} baru`, duration: 60, color: '#6366f1', stageId: '' }); save(); renderSettings(); });
    $$('[data-stype-del]').forEach((b) => b.addEventListener('click', () => {
      const t = c.sessionTypes[Number(b.dataset.stypeDel)];
      if (S.sessions.some((s) => s.typeId === t.id)) { toast('Jenis ini sudah dipakai di jadwal'); return; }
      c.sessionTypes.splice(Number(b.dataset.stypeDel), 1); save(); renderSettings();
    }));
    $('#add-member').addEventListener('click', () => { S.team.push({ id: uid('m'), name: 'Nama baru', role: 'mentor' }); save(); renderSettings(); });
    $$('[data-member-del]').forEach((b) => b.addEventListener('click', () => {
      const m = S.team[Number(b.dataset.memberDel)];
      if (S.leads.some((l) => l.ownerId === m.id) || S.sessions.some((s) => s.mentorId === m.id)) { toast(`${m.name} masih punya ${L('leads')}/jadwal — reassign dulu`); return; }
      S.team.splice(Number(b.dataset.memberDel), 1); save(); renderSettings();
    }));
    $('#add-program').addEventListener('click', () => { S.programs.push({ id: uid('p'), name: `${L('program')} baru`, format: 'Private', price: 0, sessions: 12, months: 12 }); save(); renderSettings(); });
    $$('[data-program-del]').forEach((b) => b.addEventListener('click', () => { S.programs.splice(Number(b.dataset.programDel), 1); save(); renderSettings(); }));

    $('#exp-json').addEventListener('click', () => download(`${slug(c.brandName)}-backup-${todayISO()}.json`, JSON.stringify(S, null, 2), 'application/json'));
    $('#exp-csv').addEventListener('click', () => exportCSV(S.leads));
    $('#imp-json').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!d.config || !Array.isArray(d.leads) || !Array.isArray(d.stages || d.config.stages)) throw new Error('format');
          if (!confirm('Timpa data workspace ini dengan file backup?')) return;
          S = d; save(); applyBrand(); render(); toast('Data dipulihkan ✔');
        } catch (err) { toast('File tidak valid'); }
      };
      rd.readAsText(f);
    });
    $('#reset-demo').addEventListener('click', () => {
      if (!confirm('Ganti semua data workspace ini dengan data demo? (config tetap)')) return;
      S.leads = []; S.sessions = []; seedDemo(S); save(); toast('Data demo diisi ulang'); location.hash = '#dashboard'; render();
    });
    $('#clear-data').addEventListener('click', () => {
      if (!confirm(`Hapus SEMUA ${L('leads')} & ${L('sessions')} di workspace ini? Config, tim & program tetap.`)) return;
      S.leads = []; S.sessions = []; save(); toast('Data dikosongkan — siap go-live'); render();
    });
    $('#del-ws').addEventListener('click', () => {
      if (wsIndex.length <= 1) { toast('Minimal harus ada 1 workspace'); return; }
      if (!confirm('Hapus workspace ini permanen?')) return;
      Store.del(K_WS(wsId)); wsIndex = wsIndex.filter((w) => w.id !== wsId); Store.set(K_INDEX, wsIndex);
      loadWorkspace(wsIndex[0].id); location.hash = '#dashboard'; render();
    });
  }

  // ---------- Export ----------
  const slug = (s) => String(s || 'data').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function exportCSV(list) {
    const cols = [['Nama', (l) => l.name], ['Perusahaan', (l) => l.company], ['HP', (l) => l.phone], ['Email', (l) => l.email], ['Stage', (l) => stage(l.stageId).name], ['Sumber', (l) => l.source], [L('owner'), (l) => memberName(l.ownerId)], [L('program'), (l) => (program(l.programId) || {}).name], ['Nilai', (l) => l.value], ['Next action', (l) => l.nextAction], ['Tgl next action', (l) => l.nextActionDate], ['Masuk', (l) => (l.createdAt || '').slice(0, 10)], ['Won', (l) => (l.wonAt || '').slice(0, 10)], ['Lost reason', (l) => l.lostReason], ['Catatan', (l) => l.notes]];
    const q = (v) => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [cols.map((c) => q(c[0])).join(','), ...list.map((l) => cols.map((c) => q(c[1](l))).join(','))].join('\n');
    download(`${slug(S.config.brandName)}-${slug(L('leads'))}-${todayISO()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  // ---------- Modal & toast ----------
  let modalSubmit = null;
  const modalFoot = (label, cls) => `<div class="modal-foot"><button type="button" class="btn" data-close-modal>Batal</button><button type="submit" class="btn ${cls || 'btn-primary'}">${esc(label)}</button></div>`;
  function openModal(title, body, onSubmit) {
    $('#modal-title').textContent = title;
    $('#modal-form').innerHTML = body;
    modalSubmit = onSubmit;
    $('#modal').classList.add('open');
    $('#modal').setAttribute('aria-hidden', 'false');
    const first = $('#modal-form input:not([type=hidden]), #modal-form select, #modal-form textarea');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modal').classList.remove('open'); $('#modal').setAttribute('aria-hidden', 'true'); modalSubmit = null; }
  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------- Boot ----------
  function newWorkspaceDialog() {
    openModal('Workspace / Brand Baru', `
      <label class="field"><span>Nama workspace *</span><input name="name" required placeholder="Mis. PIWA Bali, AlphaLeaders Jakarta"></label>
      <label class="field mt"><span>Template</span><select name="preset">
        <option value="alphaleaders">AlphaLeaders — Coaching (COV → ABM → ABE)</option>
        <option value="piwa">PIWA — Mentoring / Class (Preview → Konsultasi → Penawaran)</option>
        <option value="blank">Kosong — Generic (Discovery → Proposal)</option>
      </select></label>
      <label class="field mt" style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="demo" checked> <span style="margin:0">Isi data demo (bisa dikosongkan nanti)</span></label>
      ${modalFoot('Buat Workspace')}`,
    (fd) => {
      const id = createWorkspace(fd.get('preset'), !!fd.get('demo'), fd.get('name'));
      const w = wsIndex.find((x) => x.id === id);
      const data = Store.get(K_WS(id));
      data.config.brandName = fd.get('name'); Store.set(K_WS(id), data);
      w.name = fd.get('name'); Store.set(K_INDEX, wsIndex);
      loadWorkspace(id); location.hash = '#settings'; render();
      toast('Workspace dibuat — sesuaikan label & funnel di Settings');
    });
  }

  function boot() {
    wsIndex = Store.get(K_INDEX) || [];
    wsIndex = wsIndex.filter((w) => Store.get(K_WS(w.id)));
    if (!wsIndex.length) {
      createWorkspace('alphaleaders', true);
      createWorkspace('piwa', true);
    }
    const active = Store.get(K_ACTIVE);
    loadWorkspace(wsIndex.some((w) => w.id === active) ? active : wsIndex[0].id);

    $('#ws-select').addEventListener('change', (e) => {
      if (e.target.value === '__new') { e.target.value = wsId; newWorkspaceDialog(); return; }
      loadWorkspace(e.target.value); closeDrawer(); render(); toast(`Pindah ke ${S.config.brandName}`);
    });
    $('#btn-add-lead').addEventListener('click', () => leadForm());
    $('#btn-add-session').addEventListener('click', () => sessionForm());
    $('#modal-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fn = modalSubmit; const fd = new FormData(e.target);
      closeModal();
      if (fn) fn(fd);
    });
    document.addEventListener('click', (e) => {
      if (e.target.closest('[data-close-modal]')) closeModal();
      if (e.target.closest('[data-close-drawer]')) closeDrawer();
    });
    $('#modal').addEventListener('mousedown', (e) => { if (e.target.id === 'modal') closeModal(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if ($('#modal').classList.contains('open')) closeModal(); else closeDrawer();
    });
    window.addEventListener('hashchange', () => { closeDrawer(); render(); });
    render();
  }

  boot();
})();

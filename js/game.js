'use strict';
/* =====================================================================
   game.js — Engine of the serious game "Operation TLX"
   Depends on: world.js (simulated cluster), data-a.js / data-b.js (content)
   ===================================================================== */

const BASE_KEY = 'sap2kube_v1';        /* prefix for per-player saves */
const LEGACY_KEY = 'sap2kube_v1';      /* pre-multiplayer save (migrated once) */
const ROSTER_KEY = 'sap2kube_players';
const CURRENT_KEY = 'sap2kube_current';

const $ = sel => document.querySelector(sel);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ---------------- players (multi-user on one machine) ---------------- */
function slug(name) { return String(name).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'player'; }
function playerKey(name) { return BASE_KEY + '::' + slug(name); }
function roster() { try { const r = JSON.parse(localStorage.getItem(ROSTER_KEY) || '[]'); return Array.isArray(r) ? r : []; } catch (e) { return []; } }
function saveRoster(r) { try { localStorage.setItem(ROSTER_KEY, JSON.stringify(r)); } catch (e) { } }
function currentPlayerName() { try { const c = JSON.parse(localStorage.getItem(CURRENT_KEY) || 'null'); return c && c.name ? c.name : null; } catch (e) { return null; } }
function setCurrentPlayer(name) { try { localStorage.setItem(CURRENT_KEY, JSON.stringify({ name })); } catch (e) { } }

function blankState() {
  return { v: 1, track: null, started: false, elapsed: 0, done: {}, score: {}, badges: [], gloss: [], finished: false };
}
function loadState() {
  const name = currentPlayerName();
  if (!name) return null;
  try {
    const s = JSON.parse(localStorage.getItem(playerKey(name)) || 'null');
    if (s && s.v === 1) return s;
  } catch (e) { }
  return blankState();
}
function save() { if (!STATE) return; try { localStorage.setItem(playerKey(currentPlayerName() || ''), JSON.stringify(STATE)); } catch (e) { } }

/* one-time migration: adopt the legacy single-player save as player "Alex" */
(function migrateLegacySave() {
  try {
    if (!localStorage.getItem(LEGACY_KEY)) return;
    if (roster().length) { localStorage.removeItem(LEGACY_KEY); return; }
    localStorage.setItem(playerKey('Alex'), localStorage.getItem(LEGACY_KEY));
    localStorage.removeItem(LEGACY_KEY);
    saveRoster([{ name: 'Alex', ts: Date.now() }]);
    setCurrentPlayer('Alex');
  } catch (e) { }
})();

let STATE = loadState();

const trackOf = () => (STATE ? TRACKS.find(t => t.id === STATE.track) || null : null);
const mission = id => MISSIONS.find(m => m.id === id);
const trackMissions = () => { const t = trackOf(); return t ? t.missions.map(mission).filter(Boolean) : []; };
const totalScore = () => { const ids = new Set(trackMissions().map(m => m.id)); return Object.entries(STATE.score || {}).filter(([k]) => ids.has(k)).reduce((a, [, v]) => a + v, 0); };
const missionsDoneCount = () => trackMissions().filter(m => STATE.done[m.id]).length;
function maxScore() {
  let n = 0;
  trackMissions().forEach(m => (m.steps || []).forEach(s => {
    if (s.type === 'quiz') {
      let qs = s.qs || [];
      if (s.dynamic === 'final') { qs = QUIZ_BANK; }
      qs.forEach(q => n += (q.pts || 10));
    }
    if (s.type === 'terminal') ((s.tasks || []).concat(s.tasks2 || [])).forEach(t => n += (t.pts || 10));
    if (s.type === 'mapping') s.items.forEach(() => n += 10);
    if (s.type === 'build') s.slots.forEach(() => n += 10);
  }));
  return n;
}

/* ---------------- generic IO ---------------- */
function initUI() {
  $('#tb-book').addEventListener('click', openBook);
  window.addEventListener('hashchange', route);
  setInterval(() => {
    if (STATE && STATE.started && !STATE.finished) { STATE.elapsed++; save(); }
    if (STATE) renderTopbar();
  }, 60000);
  route();
  renderTopbar();
}
function renderTopbar() {
  if (!STATE) { $('#topbar').hidden = true; return; }
  const t = trackMissions();
  const doneN = t.filter(m => STATE.done[m.id]).length;
  $('#tb-bar').style.width = (t.length ? Math.round(100 * doneN / t.length) : 0) + '%';
  $('#tb-score').innerHTML = '⭐ <b>' + totalScore() + '</b> / ' + maxScore();
  const mm = Math.floor(STATE.elapsed / 60), h = Math.floor(mm / 60);
  $('#tb-time').innerHTML = '⏱ <b>' + h + ':' + String(mm % 60).padStart(2, '0') + '</b>';
  /* player chip */
  let p = $('#tb-player');
  if (!p) {
    p = el('button', 'btn ghost small'); p.id = 'tb-player';
    p.onclick = openPlayers;
    $('#tb-book').parentNode.insertBefore(p, $('#tb-book'));
  }
  p.innerHTML = '👤 ' + esc(currentPlayerName() || '');
}
function toast(msg, kind) {
  const t = el('div', 'toast ' + (kind || ''), msg);
  $('#toasts').appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; }, 3400);
  setTimeout(() => t.remove(), 4000);
}
function confettiBurst() {
  const c = $('#fx'); c.hidden = false;
  const ctx = c.getContext('2d');
  c.width = innerWidth; c.height = innerHeight;
  const col = ['#2e90fa', '#3ecf8e', '#f5c542', '#ff6b6b', '#7c5cff'];
  const pieces = [];
  for (let i = 0; i < 130; i++) pieces.push({
    x: Math.random() * c.width, y: -20 - Math.random() * c.height * 0.35,
    r: 4 + Math.random() * 5, c: col[i % col.length],
    vy: 2.5 + Math.random() * 3.5, vx: -1.5 + Math.random() * 3, rot: Math.random() * 6
  });
  let n = 0;
  const iv = setInterval(() => {
    ctx.clearRect(0, 0, c.width, c.height); n++;
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += 0.09;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
    });
    if (n > 140) { clearInterval(iv); ctx.clearRect(0, 0, c.width, c.height); c.hidden = true; }
  }, 33);
}

/* ---------------- player selection modal ---------------- */
function openPlayers() {
  closePlayersModal();
  const ov = el('div', 'modal-overlay');
  const mo = el('div', 'modal');
  ov.appendChild(mo);
  const draw = () => {
    mo.innerHTML = '<button class="modal-close">✕ close</button><h3>👤 Players</h3>' +
      '<p style="color:var(--muted);font-size:13.5px;margin:4px 0 14px">Each player keeps their own progress on this computer. Switch or add a nickname.</p>';
    mo.querySelector('.modal-close').onclick = closePlayersModal;
    const list = el('div', 'deflist');
    roster().forEach(p => {
      const d = el('div', 'defitem');
      let stats = '';
      try {
        const s = JSON.parse(localStorage.getItem(playerKey(p.name)) || 'null');
        if (s && s.track) {
          const tr = TRACKS.find(x => x.id === s.track);
          const done = Object.keys(s.done || {}).length;
          const sc = Object.values(s.score || {}).reduce((a, b) => a + b, 0);
          stats = (tr ? tr.name : s.track) + ' · ' + done + ' missions · ⭐ ' + sc;
        } else stats = 'no game started yet';
      } catch (e) { }
      d.innerHTML = '<b>👤 ' + esc(p.name) + '</b>' +
        '<p>' + esc(stats) + '</p>' +
        '<p style="margin-top:6px"></p>';
      const row = el('div', 'step-actions');
      if (p.name === currentPlayerName()) {
        row.appendChild(el('span', 'chip', '✔ current'));
      } else {
        const sw = el('button', 'btn small', 'Switch ▸');
        sw.onclick = () => { switchPlayer(p.name); };
        row.appendChild(sw);
      }
      const del = el('button', 'btn ghost small', '🗑');
      del.onclick = () => {
        if (confirm('Delete player "' + p.name + '" and all their progress?')) deletePlayer(p.name);
      };
      row.appendChild(del);
      d.appendChild(row);
      list.appendChild(d);
    });
    mo.appendChild(list);
    /* add player */
    const form = el('div', 'step-actions');
    const inp = el('input', 'pseud-in');
    inp.placeholder = 'New nickname (e.g. Alex)';
    inp.style.flex = '1'; inp.maxLength = 20;
    const add = el('button', 'btn', '➕ Add player');
    const doAdd = () => {
      const name = inp.value.trim().replace(/\s+/g, ' ');
      if (!name) { inp.focus(); return; }
      if (roster().some(p => slug(p.name) === slug(name))) { toast('That nickname is already taken', 'warn'); return; }
      createPlayer(name);
    };
    add.onclick = doAdd;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    form.appendChild(inp); form.appendChild(add);
    mo.appendChild(form);
    ov.addEventListener('click', e => { if (e.target === ov) closePlayersModal(); });
  };
  draw();
  openPlayers._draw = draw;
  $('#modal').appendChild(ov);
}
function closePlayersModal() {
  const ov = $('#modal').querySelector('.modal-overlay');
  if (ov) ov.remove();
}
function createPlayer(name) {
  const r = roster();
  r.push({ name, ts: Date.now() });
  saveRoster(r);
  setCurrentPlayer(name);
  STATE = loadState(); save();
  closePlayersModal();
  renderTopbar();
  go('#/'); route();
  toast('👤 Welcome, ' + esc(name) + '!', 'green');
}
function switchPlayer(name) {
  setCurrentPlayer(name);
  STATE = loadState();
  closePlayersModal();
  renderTopbar();
  go('#/'); route();
  toast('👤 Switched to ' + esc(name));
}
function deletePlayer(name) {
  saveRoster(roster().filter(p => p.name !== name));
  try { localStorage.removeItem(playerKey(name)); } catch (e) { }
  if (currentPlayerName() === name) {
    const r = roster();
    if (r.length) setCurrentPlayer(r[0].name);
    else { try { localStorage.removeItem(CURRENT_KEY); } catch (e) { } }
    STATE = loadState();
  }
  if (openPlayers._draw) openPlayers._draw();
  renderTopbar(); route();
}

/* ---------------- routing ---------------- */
function go(h) { location.hash = h; }
function route() {
  const h = (location.hash || '#/').replace(/^#\/?/, '');
  const app = $('#app'); app.innerHTML = '';
  if (!STATE || !currentPlayerName()) { renderHome(app); return; }
  if (h.startsWith('mission/')) {
    const id = h.split('/')[1];
    if (!trackOf() || !mission(id)) return go('#/jeu');
    renderMission(app, id);
    return;
  }
  if (h === 'jeu' && trackOf()) { renderDashboard(app); return; }
  renderHome(app);
  renderTopbar();
}

/* ---------------- home ---------------- */
function renderHome(app) {
  /* Player gate: no nickname selected yet */
  if (!STATE || !currentPlayerName()) {
    $('#topbar').hidden = true;
    const hero = el('section', 'hero');
    hero.innerHTML = `
      <span class="kicker">Serious game · <span id="hero-dur">1 h to 3 h 30</span> · no Kubernetes prerequisites</span>
      <h1>Operation <span class="grad">TLX</span></h1>
      <p class="sub">You are Arnaud, a SAP Basis administrator. Your CIO is migrating the SAP landscape to Kubernetes.
      Good news: you already know the essentials — it is a matter of <b>translation</b>. Welcome aboard.</p>`;
    app.appendChild(hero);
    const gate = el('section', 'panel');
    gate.innerHTML = '<h3 style="margin:0 0 4px">👤 Who is playing?</h3>' +
      '<p style="color:var(--muted);font-size:14px;margin:4px 0 14px">Pick your nickname or create one — each player gets a separate save.</p>';
    const existing = roster();
    if (existing.length) {
      const list = el('div', 'tracks');
      existing.forEach(p => {
        let stats = '';
        try {
          const s = JSON.parse(localStorage.getItem(playerKey(p.name)) || 'null');
          if (s && s.track) {
            const tr = TRACKS.find(x => x.id === s.track);
            stats = (tr ? tr.name : s.track) + ' · ⭐ ' + Object.values(s.score || {}).reduce((a, b) => a + b, 0);
          } else stats = 'new player';
        } catch (e) { }
        const d = el('div', 'track');
        d.innerHTML = '<h3>👤 ' + esc(p.name) + '</h3><p style="font-size:12.5px">' + esc(stats) + '</p>' +
          '<p style="margin:10px 0 0;color:#7db4ff;font-size:12.5px">Play ▸</p>';
        d.onclick = () => { setCurrentPlayer(p.name); STATE = loadState(); renderTopbar(); go('#/'); route(); };
        list.appendChild(d);
      });
      gate.appendChild(list);
      const orp = el('p', 'bonus-note', '— or create a new nickname —');
      orp.style.textAlign = 'center';
      gate.appendChild(orp);
    }
    const form = el('div', 'step-actions');
    const inp = el('input', 'pseud-in');
    inp.placeholder = 'Your nickname (e.g. Alex)';
    inp.style.flex = '1'; inp.maxLength = 20;
    const add = el('button', 'btn green', 'Start ▸');
    const doAdd = () => {
      const name = inp.value.trim().replace(/\s+/g, ' ');
      if (!name) { inp.focus(); return; }
      if (roster().some(p => slug(p.name) === slug(name))) { setCurrentPlayer(name); STATE = loadState(); }
      else createPlayerNoRoute(name);
      renderTopbar(); go('#/'); route();
    };
    add.onclick = doAdd;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
    form.appendChild(inp); form.appendChild(add);
    gate.appendChild(form);
    app.appendChild(gate);
    setTimeout(() => inp.focus(), 50);
    return;
  }

  $('#topbar').hidden = !(STATE.started && trackOf());
  const hero = el('section', 'hero');
  hero.innerHTML = `
    <span class="kicker">Serious game · <span id="hero-dur">1 h to 3 h 30</span> · no Kubernetes prerequisites</span>
    <h1>Operation <span class="grad">TLX</span></h1>
    <p class="sub">You are Arnaud, a SAP Basis administrator. Your CIO is migrating the SAP landscape to Kubernetes.
    Good news: you already master the essentials — it is a matter of <b>translation</b>. Guided by Kubea,
    your copilot, you run real kubectl commands on a simulated cluster: Pods, Deployments,
    Services, persistent HANA… then 5 incidents to troubleshoot like an expert.</p>`;
  app.appendChild(hero);

  const pills = el('div', 'pill-row');
  ['Simulated kubectl terminals', 'Progress is saved', 'SAP ↔ K8s logbook',
   'Pods · Deployments · StatefulSet · HPA · Ingress', 'Incidents & debug'].forEach(x => {
    pills.appendChild(el('span', 'pill', x));
  });
  hero.appendChild(pills);

  /* resume */
  if (STATE.started && trackOf() && Object.keys(STATE.done).length) {
    const resume = el('div', 'panel', '<h3 style="margin:0 0 14px">Game in progress — ' + esc(currentPlayerName() || '') + '</h3>');
    const row = el('div', 'step-actions');
    const b1 = el('button', 'btn green', '▶ Resume the game (⭐ ' + totalScore() + ')');
    b1.onclick = () => go('#/jeu'); row.appendChild(b1);
    const b2 = el('button', 'btn ghost', '♻️ Start from zero');
    b2.onclick = () => {
      if (confirm('Erase this player\u2019s whole progress and go back to track selection?')) {
        STATE = blankState();
        save(); go('#/'); renderTopbar(); route();
      }
    };
    row.appendChild(b2);
    const b3 = el('button', 'btn ghost', '👤 Switch player');
    b3.onclick = openPlayers;
    row.appendChild(b3);
    resume.appendChild(row);
    const sp = el('div'); sp.style.height = '26px'; app.appendChild(sp);
    app.appendChild(resume);
  }

  /* track choice */
  const panel = el('section', 'panel');
  panel.style.marginTop = '30px';
  panel.innerHTML = '<h3 style="margin:0 0 4px">' + (STATE.started ? 'Change your flight plan (restarts your progress)' : 'Choose your flight plan') + '</h3>' +
    '<p style="color:var(--muted);font-size:14px;margin:4px 0 14px">The duration covers dialogs, commands and thinking. ' + esc(currentPlayerName() || '') + ', you can switch tracks at any time (progress restarts).</p>';
  const tr = el('div', 'tracks');
  TRACKS.forEach(t => {
    const d = el('div', 'track');
    d.innerHTML = '<span class="dur">⏱ ' + esc(t.label) + '</span><h3>' + esc(t.name) + '</h3><p>' + esc(t.desc) + '</p>' +
      '<p style="margin:10px 0 0;color:#7db4ff;font-size:12.5px">' + t.missions.length + ' missions · 8 chapters</p>';
    d.onclick = () => {
      STATE.track = t.id; STATE.started = true;
      STATE.done = {}; STATE.score = {}; STATE.badges = []; STATE.gloss = []; STATE.finished = false; STATE.elapsed = 0;
      save(); renderTopbar(); go('#/jeu');
    };
    tr.appendChild(d);
  });
  panel.appendChild(tr);
  app.appendChild(panel);

  /* chapters */
  const wrap = el('div'); wrap.style.height = '26px'; app.appendChild(wrap);
  const chp = el('section', 'panel', '<h3 style="margin:0 0 12px">The program</h3>');
  const chap = el('div', 'chapters-grid');
  [['1', 'Clusters & Nodes', 'the "server" translated'],
   ['2', 'Pods & ConfigMaps', 'the SAP instance as a Pod'],
   ['3', 'Deployment & Services', 'HA without Pacemaker'],
   ['4', 'Volumes & StatefulSet', 'persistent HANA'],
   ['5', 'Scaling & limits', 'payroll peak'],
   ['6', 'Rolling update', 'SP without a maintenance window'],
   ['7', 'Troubleshooting', '5 real incidents'],
   ['8', 'Migration & final boss', 'TLX → TXP']].forEach(c => {
    chap.appendChild(el('div', 'chapter-chip', '<b>Chapter ' + c[0] + ' — ' + c[1] + '</b><span>' + c[2] + '</span>'));
  });
  chp.appendChild(chap);
  app.appendChild(chp);
}
/* create a player without leaving the home route (gate flow) */
function createPlayerNoRoute(name) {
  const r = roster();
  r.push({ name, ts: Date.now() });
  saveRoster(r);
  setCurrentPlayer(name);
  STATE = loadState(); save();
}

/* ---------------- dashboard ---------------- */
function renderDashboard(app) {
  $('#topbar').hidden = !trackOf();
  const t = trackOf(); if (!t) return go('#/');
  const tms = trackMissions();

  /* steady progression */
  let lockedPrev = false;
  const byCh = {};
  tms.forEach((m, i) => {
    const locked = !!STATE.done[m.id] ? false : lockedPrev;
    if (!STATE.done[m.id] && !lockedPrev) lockedPrev = true;
    (byCh[m.ch] = byCh[m.ch] || []).push({ m, locked, done: !!STATE.done[m.id],
      current: !STATE.done[m.id] && !locked });
  });

  const head = el('div', 'dash-head');
  head.innerHTML = '<div><h2>Operation TLX · ' + esc(t.name) + '</h2>' +
    '<p style="color:var(--muted);margin:4px 0 0;font-size:13.5px">Mission control of the migration — player: <b>' + esc(currentPlayerName() || '') + '</b>. Each chapter unlocks the next.</p></div>';
  const meta = el('div', 'dash-meta');
  const remaining = tms.filter(m => !STATE.done[m.id]).reduce((a, m) => a + (m.dur || 12), 0);
  meta.appendChild(el('span', 'chip', '⏳ ~' + remaining + ' min left'));
  if (STATE.finished || tms.every(m => STATE.done[m.id])) {
    const dpl = el('button', 'btn small', '🏆 Final report');
    dpl.onclick = () => renderBilanFinancial();
    meta.appendChild(dpl);
  }
  const back = el('button', 'btn ghost small', '⌂ Home');
  back.onclick = () => { STATE.prevHash = '#/jeu'; go('#/'); };
  meta.appendChild(back);
  head.appendChild(meta);
  app.appendChild(head);

  const CHT = { 1: 'First contact', 2: 'Translating the landscape', 3: 'High availability & exposure', 4: 'Data & identity',
    5: 'Load & sizing', 6: 'Non-stop updates', 7: 'Troubleshooting', 8: 'Migration' };
  Object.keys(byCh).sort((a, b) => a - b).forEach(ch => {
    const sec = el('div', 'chapter');
    sec.appendChild(el('h4', '', 'Chapter ' + ch + ' · ' + CHT[ch]));
    byCh[ch].forEach(({ m, locked, done, current }) => {
      const card = el('div', 'mcard ' + (done ? 'done' : current ? 'current' : 'locked'));
      const b = BADGES[m.badge];
      card.innerHTML = `
        <div class="mnum">${done ? '✓' : esc(ch)}</div>
        <div class="mbody"><h3>${esc(m.title)}</h3>
        <p>~${m.dur} min${b ? ' · <span class="mono">' + b.icon + ' ' + b.label + '</span>' : ''}</p></div>
        <div class="mside"></div>`;
      if (STATE.score[m.id]) card.querySelector('.mside').appendChild(el('span', 'mscore', '⭐ ' + STATE.score[m.id]));
      const btn = el('button', 'btn small' + (current ? '' : ' ghost'), done ? 'Replay' : current ? 'Play ▸' : '🔒 Locked');
      btn.disabled = locked;
      if (!locked) btn.onclick = () => go('#/mission/' + m.id);
      card.querySelector('.mside').appendChild(btn);
      sec.appendChild(card);
    });
    app.appendChild(sec);
  });

  /* Bonus chapters: off-track missions — freely playable to unlock missing badges */
  const inTrack = new Set(tms.map(m => m.id));
  const bonus = MISSIONS.filter(m => !inTrack.has(m.id));
  if (bonus.length) {
    const sec = el('div', 'chapter');
    sec.appendChild(el('h4', '', 'Bonus chapters · off track'));
    sec.appendChild(el('p', 'bonus-note', 'Optional: they unlock the missing badges (useful for certification, untimed).'));
    bonus.forEach(m => {
      const done = !!STATE.done[m.id];
      const card = el('div', 'mcard ' + (done ? 'done' : 'current'));
      const b = BADGES[m.badge];
      card.innerHTML = `
        <div class="mnum">${done ? '✓' : '+ ' + esc(m.ch)}</div>
        <div class="mbody"><h3>${esc(m.title)}</h3>
        <p>bonus · ~${m.dur} min${b ? ' · <span class="mono">' + b.icon + ' ' + b.label + '</span>' : ''}</p></div>
        <div class="mside"></div>`;
      if (STATE.score[m.id]) card.querySelector('.mside').appendChild(el('span', 'mscore', '⭐ ' + STATE.score[m.id]));
      const btn = el('button', 'btn small' + (done ? ' ghost' : ''), done ? 'Replay' : 'Play ▸');
      btn.onclick = () => go('#/mission/' + m.id);
      card.querySelector('.mside').appendChild(btn);
      sec.appendChild(card);
    });
    app.appendChild(sec);
  }

  const foot = el('div', 'panel');
  foot.innerHTML = '<p style="margin:0;color:var(--muted);font-size:13px">📘 The <b>Logbook</b> (button at the top) holds the SAP ↔ Kubernetes equivalence table and the glossary you unlocked. 💾 Everything is auto-saved in this browser, per player.</p>';
  app.appendChild(foot);
}

/* ================================================================
   MISSION
   ================================================================ */
function renderMission(app, id) {
  $('#topbar').hidden = false;
  const m = mission(id);
  const tms = trackMissions();
  const idx = tms.findIndex(x => x.id === id);
  const prev = tms[idx - 1];
  if (prev && !STATE.done[prev.id]) {
    toast('First complete the mission "' + prev.title + '"');
    return go('#/jeu');
  }

  const head = el('div', 'mission-head');
  head.innerHTML = '<div><div class="mch">Chapter ' + m.ch + ' · Mission ' + (idx + 1) + '/' + tms.length + ' · ~' + m.dur + ' min</div><h2>' + esc(m.title) + '</h2></div>';
  const backTop = el('button', 'btn ghost small', '⌂ Overview'); backTop.onclick = () => go('#/jeu');
  head.appendChild(backTop);
  app.appendChild(head);

  const dots = el('div', 'dots'); app.appendChild(dots);
  const shell = el('div', 'panel'); app.appendChild(shell);

  let si = 0, pts = 0;
  const drawDots = () => {
    dots.innerHTML = '';
    m.steps.forEach((_, i) => dots.appendChild(el('i', i < si ? 'done' : i === si ? 'on' : '')));
  };
  function nextStep() {
    si++;
    if (si >= m.steps.length) return completeMission(m, pts);
    showStep();
  }
  function showStep() {
    drawDots();
    shell.innerHTML = '';
    const s = m.steps[si];
    const wrap = el('div', 'step'); shell.appendChild(wrap);
    const doneUI = () => {
      const act = el('div', 'step-actions');
      act.appendChild(el('span', 'step-hint', '⭐ mission points: <b id="mpts">' + pts + '</b>'));
      const nxt = el('button', 'btn', si === m.steps.length - 1 ? 'Finish the mission ✓' : 'Continue ▸');
      nxt.onclick = nextStep;
      act.appendChild(nxt);
      wrap.appendChild(act);
      try { nxt.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { }
    };
    const ctx = { addPts: n => { pts += n; const e = $('#mpts'); if (e) e.textContent = pts; }, done: doneUI };
    const R = { talk: stepTalk, text: stepText, quiz: stepQuiz, mapping: stepMapping, terminal: stepTerminal, build: stepBuild };
    (R[s.type] || stepText)(s, wrap, ctx);
  }
  showStep();
}

function completeMission(m, pts) {
  const wasFirst = !STATE.done[m.id];
  STATE.done[m.id] = { ts: Date.now() };
  STATE.score[m.id] = Math.max(STATE.score[m.id] || 0, pts);
  (m.glossary || []).forEach(g => { if (!STATE.gloss.includes(g)) STATE.gloss.push(g); });
  if (m.badge && !STATE.badges.includes(m.badge)) STATE.badges.push(m.badge);
  const tms = trackMissions();
  const pos = tms.findIndex(x => x.id === m.id);
  const next = pos >= 0 ? tms[pos + 1] : null;
  const trackDone = pos >= 0 && (pos + 1) >= tms.length;
  if (trackDone && !STATE.finished) STATE.finished = true;
  save(); renderTopbar();
  confettiBurst();
  toast('⭐ Mission complete: ' + pts + ' points banked', 'gold');
  if (m.badge && wasFirst && BADGES[m.badge]) {
    const b = BADGES[m.badge];
    setTimeout(() => toast(b.icon + ' Badge unlocked: <b>' + b.label + '</b>', 'green'), 800);
  }
  if (trackDone) { renderBilanFinancial(); return; }
  if (!next) {
    /* off-track bonus mission: badge banked, back to the overview */
    $('#modal').querySelectorAll('.modal-overlay').forEach(x => x.remove());
    const ov = el('div', 'modal-overlay');
    const box = el('div', 'modal diploma', `
      <div class="dg-badge">🏅</div>
      <h2>Mission accomplished: ${esc(m.title)}</h2>
      <div class="dg-sub">⭐ +${pts} points for this mission · bonus badge in the pocket</div>
      <div class="step-actions" style="justify-content:center"></div>`);
    const row = box.querySelector('.step-actions');
    const db = el('button', 'btn', '⌂ Overview');
    db.onclick = () => { ov.remove(); go('#/jeu'); };
    row.appendChild(db);
    ov.appendChild(box);
    $('#modal').appendChild(ov);
    return;
  }
  $('#modal').querySelectorAll('.modal-overlay').forEach(x => x.remove());
  const ov = el('div', 'modal-overlay');
  const box = el('div', 'modal diploma', `
    <div class="dg-badge">🏅</div>
    <h2>Mission accomplished: ${esc(m.title)}</h2>
    <div class="dg-sub">⭐ +${pts} points for this mission · total: ${totalScore()}</div>
    <div class="step-actions" style="justify-content:center"></div>`);
  const row = box.querySelector('.step-actions');
  const nb = el('button', 'btn', 'Next mission ▸');
  nb.onclick = () => { ov.remove(); go('#/mission/' + next.id); };
  row.appendChild(nb);
  const db = el('button', 'btn ghost', '⌂ Overview');
  db.onclick = () => { ov.remove(); go('#/jeu'); };
  row.appendChild(db);
  ov.appendChild(box);
  $('#modal').appendChild(ov);
}

/* ================================================================
   STEPS: dialogs
   ================================================================ */
const SPEAKER = {
  kubea: { cls: 'b-kubea', who: 'Kubea — K8s copilot', av: 'K' },
  dsi: { cls: 'b-dsi', who: 'Cedric J. — CIO', av: 'D' },
  alert: { cls: 'b-alert', who: 'OPS-ALERT', av: '!' },
  narr: { cls: 'b-narr', who: '', av: '📖' },
  alex: { cls: 'b-alex', who: 'Arnaud — you', av: 'A' }
};
function stepTalk(s, wrap, ctx) {
  let i = 0;
  const box = el('div'); wrap.appendChild(box);
  const btn = el('button', 'btn more-btn', 'More ▸');
  function next() {
    if (i >= s.lines.length) { btn.remove(); ctx.done(); return; }
    const l = s.lines[i++];
    const sp = SPEAKER[l.w] || SPEAKER.narr;
    box.appendChild(el('div', 'bubble ' + sp.cls,
      '<div class="avatar">' + sp.av + '</div><div class="txt">' + (sp.who ? '<div class="who">' + sp.who + '</div>' : '') + esc(l.t) + '</div>'));
    box.lastChild.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  btn.onclick = next;
  wrap.appendChild(btn);
  next();
}

/* ================================================================
   STEPS: text / tables
   ================================================================ */
function stepText(s, wrap, ctx) {
  (s.blocks || []).forEach(b => {
    if (b.h) wrap.appendChild(el('h3', '', esc(b.h)));
    if (b.p) wrap.appendChild(el('p', '', esc(b.p)));
    if (b.tip) wrap.appendChild(el('div', 'callout tip', '💡 ' + esc(b.tip)));
    if (b.warn) wrap.appendChild(el('div', 'callout warn', '⚠️ ' + esc(b.warn)));
    if (b.list) {
      const ul = el('ul'); ul.style.lineHeight = '1.7'; ul.style.fontSize = '15px';
      b.list.forEach(x => ul.appendChild(el('li', '', esc(x))));
      wrap.appendChild(ul);
    }
    if (b.def) {
      const dl = el('div', 'deflist');
      b.def.forEach(d => dl.appendChild(el('div', 'defitem', '<b>' + esc(d.t) + '</b><p>' + esc(d.d) + '</p>')));
      wrap.appendChild(dl);
    }
    if (b.table) {
      const tb = el('table', 'eqtable');
      tb.innerHTML = '<tr>' + b.table.h.map(h => '<th>' + esc(h) + '</th>').join('') + '</tr>' +
        b.table.r.map(r => '<tr>' + r.map(c => '<td>' + esc(c) + '</td>').join('') + '</tr>').join('');
      wrap.appendChild(tb);
    }
    if (b.eqtable) {
      const tb = el('table', 'eqtable');
      tb.innerHTML = '<tr><th>SAP universe (that you know)</th><th>Kubernetes universe (just translated)</th><th>The nuance that matters</th></tr>' +
        EQMAP.map(r => '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2] || '') + '</td></tr>').join('');
      wrap.appendChild(tb);
    }
  });
  ctx.done();
}

/* ================================================================
   STEPS: quiz & mapping
   ================================================================ */
function questionCard(q, wrap, ctx, onAnswered) {
  const card = el('div', 'qcard');
  card.appendChild(el('div', '', '<h4>' + esc(q.q) + ' <span class="qpts">(' + (q.pts || 10) + ' pts)</span></h4>'));
  const opts = el('div', 'opts');
  let answered = false;
  q.opts.forEach((o, i) => {
    const b = el('button', 'opt', esc(o));
    b.onclick = () => {
      if (answered) return;
      answered = true;
      const good = i === q.ans;
      [...opts.children].forEach((x, j) => { if (j === q.ans) x.classList.add('correct'); x.disabled = true; });
      if (!good) b.classList.add('wrong');
      else ctx.addPts(q.pts || 10);
      card.appendChild(el('div', 'why ' + (good ? 'ok' : 'ko'),
        (good ? '✔ Correct! ' : '✘ Missed ') + esc(q.why || '')));
      onAnswered();
    };
    opts.appendChild(b);
  });
  card.appendChild(opts);
  wrap.appendChild(card);
  return card;
}

function stepQuiz(s, wrap, ctx) {
  let qs = s.qs || [];
  if (s.dynamic === 'final') {
    const doneIds = Object.keys(STATE.done || {});
    qs = QUIZ_BANK.filter(q => doneIds.includes(q.tag));
    qs.sort(() => Math.random() - .5);
    wrap.appendChild(el('div', 'callout tip', '🎓 General review: ' + qs.length + ' questions drawn from the missions you completed.'));
  }
  let remaining = qs.length;
  function check() { if (--remaining <= 0) ctx.done(); }
  if (!remaining) return ctx.done();
  qs.forEach(q => questionCard(q, wrap, ctx, () => { if (--remaining <= 0) ctx.done(); }));
}

function stepMapping(s, wrap, ctx) {
  wrap.appendChild(el('p', '', ' Match each SAP notion to its Kubernetes equivalent — from the pool of answers. '));
  let remaining = s.items.length;
  s.items.forEach(it => {
    const card = el('div', 'qcard');
    card.appendChild(el('h4', '', '🧩 ' + esc(it.sap)));
    const opts = el('div', 'opts');
    opts.style.gridTemplateColumns = 'repeat(auto-fit,minmax(160px,1fr))';
    let done = false;
    it.opts.forEach((o, i) => {
      const b = el('button', 'opt', esc(o));
      b.onclick = () => {
        if (done) return;
        done = true;
        if (i === it.ans) { b.classList.add('correct'); ctx.addPts(10); }
        else { b.classList.add('wrong'); opts.children[it.ans].classList.add('correct'); }
        [...opts.children].forEach(x => x.disabled = true);
        card.appendChild(el('div', 'why ' + (i === it.ans ? 'ok' : 'ko'), esc(it.why)));
        if (--remaining <= 0) ctx.done();
      };
      opts.appendChild(b);
    });
    card.appendChild(opts);
    wrap.appendChild(card);
  });
  if (!remaining) ctx.done();
}

/* ================================================================
   STEPS: build (8.1)
   ================================================================ */
function stepBuild(s, wrap, ctx) {
  let remaining = s.slots.length;
  s.slots.forEach(sl => {
    const card = el('div', 'slot');
    card.appendChild(el('div', 'slabel', '🧱 ' + esc(sl.label)));
    card.appendChild(el('div', 'ssub', esc(sl.sub || '')));
    const opts = el('div', 'opts');
    let done = false;
    sl.opts.forEach((o, i) => {
      const b = el('button', 'opt', '<b style="font-family:var(--font);font-size:14px">' + esc(o.t) + '</b>' +
        (o.y ? '<span class="oy">' + esc(o.y) + '</span>' : ''));
      b.onclick = () => {
        if (done) return;
        done = true;
        if (i === sl.ans) { b.classList.add('correct'); ctx.addPts(10); }
        else { b.classList.add('wrong'); opts.children[sl.ans].classList.add('correct'); }
        [...opts.children].forEach(x => x.disabled = true);
        card.appendChild(el('div', 'why ' + (i === sl.ans ? 'ok' : 'ko'), esc(sl.why)));
        if (--remaining <= 0) ctx.done();
      };
      opts.appendChild(b);
    });
    card.appendChild(opts);
    wrap.appendChild(card);
  });
  if (!remaining) ctx.done();
}

/* ================================================================
   STEPS: kubectl TERMINAL
   ================================================================ */
function stepTerminal(s, wrap, ctx) {
  wrap.appendChild(el('h3', '', '🖥️ ' + esc(s.title || 'Terminal')));
  if (s.brief && s.brief.length) {
    const bs = el('div', 'callout tip');
    bs.innerHTML = s.brief.map(esc).join('<br>');
    wrap.appendChild(bs);
  }

  const world = W.create(s.world);
  try { window.__lastWorld = world; } catch (e) { }
  const allTasks = (s.tasks || []).concat(s.tasks2 || []);
  const nFirst = (s.tasks || []).length;
  const triggers = (s.triggers || []);
  const list = el('div', 'tasks'); wrap.appendChild(list);

  /* task state */
  const tasks = allTasks.map((t, i) => ({ ...t, idx: i, done: false, hintUsed: false, regex: new RegExp(t.match, 'i'), t2: i >= nFirst }));

  /* display */
  function renderTasks() {
    list.innerHTML = '';
    tasks.forEach((t, i) => {
      const d = el('div', 'task' + (t.done ? ' done' : ''));
      d.appendChild(el('span', 'ticon', t.done ? '✓' : String(i + 1)));
      const body = (t.done ? '' : (i === nextIdx() ? '' : '')) + t.t + (t.done ? '' : '<span class="tcode mono">e.g. ' + (t.hint || t.cmd || '…') + '</span>');
      d.appendChild(el('span', 'ttext', body));
      list.appendChild(d);
    });
  }
  const firstUndone = () => tasks.find(t => !t.done);
  function nextIdx() { const t = firstUndone(); return t ? t.idx : -1; }

  const btnContinue = ctx.done; /* appears once ALL tasks are done */

  const term = el('div', 'terminal');
  const bar = el('div', 'term-bar', '<span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>' +
    '<span class="ttitle">arnaud@k8s-lab — kubectl (simulation)</span>');
  const bHint = el('button', '', '💡 hint (-2 pts)');
  const bClear = el('button', '', 'clear');
  bar.appendChild(bHint); bar.appendChild(bClear);
  const body = el('div', 'term-body');
  const inputRow = el('div', 'term-input');
  const prompt = el('span', '', 'arnaud@k8s-lab:~$');
  const input = document.createElement('input');
  input.autocomplete = 'off'; input.spellcheck = false;
  inputRow.appendChild(prompt); inputRow.appendChild(input);
  term.appendChild(bar); term.appendChild(body); term.appendChild(inputRow);
  wrap.appendChild(term);
  const hist = []; let histIdx = -1;

  let typing = false, queue = [], currentTask = 0;
  const skip = { on: false };
  function print(t, cls) { queue.push({ t, cls: cls || 'out' }); }
  function pump() {
    if (typing || !queue.length) return;
    typing = true;
    const step = () => {
      if (!queue.length) { typing = false; body.scrollTop = body.scrollHeight; return; }
      if (skip.on) {
        const all = queue.splice(0);
        all.forEach(l => body.appendChild(el('div', 'tl ' + l.cls, esc(l.t))));
        typing = false; body.scrollTop = body.scrollHeight;
        return;
      }
      const l = queue.shift();
      body.appendChild(el('div', 'tl ' + l.cls, esc(l.t)));
      body.scrollTop = body.scrollHeight;
      setTimeout(step, 14);
    };
    step();
  }
  function echo(cmd) { queue.push({ t: cmd, cls: 'echo' }); }
  function flushOut(res) {
    if (res.clear) { body.innerHTML = ''; return; }
    (res.lines || []).forEach(l => queue.push({ t: l.t, cls: l.cls || 'out' }));
  }

  /* cluster state loop */
  const iv = setInterval(() => {
    if (!term.isConnected) { clearInterval(iv); return; }
    const narr = W.tick(world);
    if (narr && narr.length && !typing) narr.forEach(l => queue.push({ t: l.t, cls: l.cls || 'out' }));
    pump();
  }, 650);

  function completeTask(t) {
    t.done = true;
    const gain = Math.max(0, (t.pts || 10) - (t.hintUsed ? 2 : 0));
    ctx.addPts(gain);
    queue.push({ t: '✔ task validated: +' + gain + ' pts', cls: 'ok' });
    renderTasks();
    /* triggers after this task */
    triggers.forEach(tr => {
      if (tr.afterTask === t.idx) {
        try { tr.run(world); } catch (e) { }
        if (tr.story) queue.push({ t: '— ' + tr.story + ' —', cls: 'acc' });
      }
    });
    if (tasks.every(x => x.done)) setTimeout(ctx.done, 400);
    pump();
  }

  function submit() {
    const cmd = input.value.trim();
    input.value = '';
    if (!cmd) return;
    hist.push(cmd); histIdx = -1;
    echo(cmd); pump();
    const res = W.exec(world, cmd);
    flushOut(res);
    if (res.clear) pump();
    /* credit a task? */
    let want = firstUndone();
    if (want && want.regex.test(cmd)) completeTask(want);
    pump();
  }

  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { submit(); }
    else if (e.key === 'Escape') { if (typing && queue.length) { skip.on = true; pump(); setTimeout(() => skip.on = false, 0); } }
    else if (e.key === 'ArrowUp') {
      if (hist.length) { histIdx = histIdx === -1 ? hist.length - 1 : Math.max(0, histIdx - 1); input.value = hist[histIdx]; e.preventDefault(); }
    } else if (e.key === 'ArrowDown' && histIdx >= 0) {
      histIdx = Math.min(hist.length - 1, histIdx + 1);
      input.value = hist[histIdx] || '';
    }
  });
  body.addEventListener('click', () => input.focus());
  bClear.onclick = () => { body.innerHTML = ''; input.focus(); };
  bHint.onclick = () => {
    const t = firstUndone();
    if (!t) return;
    t.hintUsed = true;
    input.value = t.cmd || t.hint || '';
    queue.push({ t: '💡 workshop tip: ' + (t.cmd || t.hint), cls: 'acc' });
    pump(); input.focus();
  };

  renderTasks();
  queue.push({ t: 'Current namespace: tlx — type "help" for the list of workshop commands', cls: 'muted' });
  setTimeout(() => input.focus(), 100);
  pump();
}

/* ================================================================
   FINAL REPORT
   ================================================================ */
function renderBilanFinancial() {
  const app = $('#app'); app.innerHTML = '';
  $('#topbar').hidden = false; renderTopbar();
  const dg = el('section', 'panel diploma');
  dg.innerHTML = `
    <div class="dg-badge">🏆</div>
    <h2>Certified "Kube Basis Engineer"</h2>
    <div class="dg-sub">From SAP Basis to Kubernetes: the translation is done. The TXP production is yours${currentPlayerName() ? ', ' + esc(currentPlayerName()) : ''}.</div>
    <div class="dg-stats">
      <div class="dg-stat"><b>${totalScore()}</b><span>final score</span></div>
      <div class="dg-stat"><b>${missionsDoneCount()}</b><span>missions completed</span></div>
      <div class="dg-stat"><b>${Math.floor(STATE.elapsed / 60) > 0 ? Math.floor(STATE.elapsed / 60) + ' h ' + (STATE.elapsed % 60) : STATE.elapsed}</b><span>minutes of play</span></div>
    </div>
    <h3 style="margin:10px 0 6px">Your badges</h3>
    <div class="badge-row"></div>
    <div class="step-actions" style="justify-content:center;margin-top:20px"></div>`;
  const br = dg.querySelector('.badge-row');
  Object.keys(BADGES).forEach(k => {
    const on = STATE.badges.includes(k);
    br.appendChild(el('span', 'badge' + (on ? ' on' : ''), (on ? '' : '🔒 ') + BADGES[k].icon + ' ' + esc(BADGES[k].label)));
  });
  const row = dg.querySelector('.step-actions');
  const r1 = el('button', 'btn', '📘 Review the logbook');
  r1.onclick = openBook; row.appendChild(r1);
  const r2 = el('button', 'btn ghost', '⌂ Home');
  r2.onclick = () => { STATE.finished = true; save(); go('#/'); }; row.appendChild(r2);
  app.appendChild(dg);
  confettiBurst();
}

/* ================================================================
   LOGBOOK (modal)
   ================================================================ */
function openBook() {
  closeBook();
  const ov = el('div', 'modal-overlay');
  const mo = el('div', 'modal');
  mo.innerHTML = '<button class="modal-close">✕ close</button><h3>📘 Logbook — SAP ↔ Kubernetes</h3>' +
    '<p style="color:var(--muted);font-size:13.5px;margin:4px 0 16px">The official TransLogix translation. <b>Struck-out</b> entries appear as you progress through missions.</p>';
  mo.querySelector('.modal-close').onclick = closeBook;
  const tb = el('table', 'eqtable');
  tb.innerHTML = '<tr><th>SAP</th><th>Kubernetes</th><th>Nuance</th></tr>' +
    EQMAP.map(r => '<tr><td><b>' + esc(r[0]) + '</b></td><td>' + esc(r[1]) + '</td><td>' + esc(r[2] || '') + '</td></tr>').join('');
  mo.appendChild(tb);

  mo.appendChild(el('h3', '', 'Unlocked glossary (' + STATE.gloss.length + '/' + Object.keys(GLOSS).length + ')'));
  const gl = el('div', 'deflist');
  Object.keys(GLOSS).forEach(k => {
    const on = STATE.gloss.includes(k);
    gl.appendChild(el('div', 'defitem' + (on ? '' : ' locked'),
      '<b>' + (on ? esc(k) : '🔒 ————') + '</b><p>' + (on ? esc(GLOSS[k]) : 'Unlocks as you progress through the missions.') + '</p>'));
  });
  mo.appendChild(gl);
  ov.appendChild(mo);
  $('#modal').appendChild(ov);
  ov.addEventListener('click', e => { if (e.target === ov) closeBook(); });
  document.addEventListener('keydown', escKey);
}
function escKey(e) { if (e.key === 'Escape') closeBook(); }
function closeBook() {
  const ov = $('#modal').querySelector('.modal-overlay');
  if (ov) ov.remove();
  document.removeEventListener('keydown', escKey);
}

/* ================================================================
   BOOT
   ================================================================ */
initUI();

'use strict';
const $ = s => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, ZOOM = 1;
function resize() {
  DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = W * DPR | 0; cv.height = H * DPR | 0;
}
// Zoom: Grundzoom passt sich dem Bildschirm an, der Spieler kann rein-/rauszoomen (bis die ganze Welt sichtbar ist)
let zoomU = 1;
try { zoomU = +localStorage.getItem('lw_zoom') || 1; } catch (e) {}
function setZoom(f) { zoomU = clamp(zoomU * f, 0.05, 2); try { localStorage.setItem('lw_zoom', zoomU); } catch (e) {} }
function calcZoom() {
  const fit = Math.min(W / (WORLD.w * T), H / ((WORLD.h + ALPS) * T)), z = Math.max(0.6, Math.min(1.15, Math.min(W, H) / 620)) * zoomU;
  if (z < fit) zoomU *= fit / z; // nicht weiter raus als die ganze Welt
  ZOOM = Math.max(z, fit);
}
addEventListener('resize', resize); resize();

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
function seeded(seed) { let s = (seed * 9301 + 49297) % 233280; return () => (s = (s * 9301 + 49297) % 233280) / 233280; }
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, n >> 8 & 255, n & 255].map(v => clamp(Math.round(v * f), 0, 255));
  return `rgb(${c})`;
}
function show(id) { for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id; }

// =================== Spieler, Code, Wiederherstellung ===================
const PKEY = 'lw_profiles';
const store = {
  get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};
let profiles = store.get(PKEY) || [{ id: 'lorenz', name: 'Lorenz', age: 9 }, { id: 'adrian', name: 'Adrian', age: 7 }];
const saveProfiles = () => store.set(PKEY, profiles);

async function hash(s) {
  s = 'lorenzwelt:' + s;
  if (crypto.subtle) {
    const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; // ponytail: Fallback nur für unsichere Kontexte (file://)
  return 'x' + h;
}

// ---- Online-Speicher (Cloudflare Worker, siehe worker/) ----
// Ohne Internet läuft alles lokal weiter; beim nächsten Online-Start gewinnt der neuere Spielstand.
const API = 'https://lorenz-welt.maierhofer-l.workers.dev';
let online = false, KEY = null; // KEY = Code-Hash des angemeldeten Spielers
async function api(path, body) {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || 'http'), { code: j.error || 'http', wait: j.wait });
  return j;
}
const hasPin = p => online ? p.hasPin : !!p.pinHash;

function drawSelect() {
  $('#plist').innerHTML = profiles.map((p, i) =>
    `<button class="pcard" data-i="${i}">👦🏼<b>${esc(p.name)}</b><small>${hasPin(p) ? '🔒 ' + p.age + ' Jahre' : '✨ neu'}</small></button>`).join('') +
    (online ? `<button class="pcard add" data-add>＋<b>Neuer Spieler</b></button>` : '');
  $('#whosub').textContent = online ? 'Wer spielt?' : 'Wer spielt? (offline – Spielstand nur auf diesem Gerät)';
}
async function renderSelect() {
  show('select');
  $('#addform').hidden = true;
  $('#plist').hidden = false;
  drawSelect();
  try {
    const list = await api('/profiles');
    online = true;
    profiles = list.map(p => ({ ...p, pinHash: profiles.find(l => l.id === p.id)?.pinHash }));
    saveProfiles();
  } catch (e) { online = false; }
  drawSelect();
}
$('#plist').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.add != null) { $('#plist').hidden = true; $('#addform').hidden = false; $('#newname').value = ''; $('#newname').focus(); return; }
  openPin(profiles[+b.dataset.i]);
};
$('#newage').innerHTML = Array.from({ length: 12 }, (_, i) => `<option${i + 5 === 8 ? ' selected' : ''}>${i + 5}</option>`).join('');
$('#addcancel').onclick = renderSelect;
$('#addform').onsubmit = async e => {
  e.preventDefault();
  const name = $('#newname').value.trim(); if (!name) return;
  try {
    const p = await api('/profiles', { name, age: +$('#newage').value });
    profiles.push(p); saveProfiles(); openPin(p);
  } catch (err) { alert(err.code === 'full' ? 'Es gibt schon zu viele Spieler.' : 'Hat nicht geklappt – ist das Internet an?'); }
};
for (const b of document.querySelectorAll('[data-back]')) b.onclick = renderSelect;

let pin = null;
$('#pad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button>${k}</button>` : '<span></span>').join('');
$('#pad').onclick = e => { const b = e.target.closest('button'); if (b) pinKey(b.textContent); };
function openPin(p) { pin = { p, mode: hasPin(p) ? 'enter' : 'set', buf: '', first: '' }; show('pin'); drawPin(); }
function drawPin(msg = '') {
  const n = esc(pin.p.name);
  $('#pintitle').innerHTML = { enter: `Hallo ${n}! Gib deinen Geheimcode ein.`, set: `Hallo ${n}! Denk dir einen 4-stelligen Geheimcode aus.`, confirm: 'Gib den Code zur Sicherheit nochmal ein.' }[pin.mode];
  [...$('#dots').children].forEach((d, i) => d.classList.toggle('on', i < pin.buf.length));
  $('#pinmsg').textContent = msg;
  $('#forgot').hidden = pin.mode !== 'enter';
}
function shakeDots() { const d = $('#dots'); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
async function pinKey(k) {
  if (!pin) return;
  if (k === '⌫') pin.buf = pin.buf.slice(0, -1); else if (/\d/.test(k) && pin.buf.length < 4) pin.buf += k;
  drawPin(); if (pin.buf.length < 4) return;
  const b = pin.buf; pin.buf = '';
  const h = await hash(pin.p.id + b);
  if (!pin) return;
  if (pin.mode === 'set') { pin.first = b; pin.mode = 'confirm'; drawPin(); }
  else if (pin.mode === 'confirm') {
    if (b !== pin.first) { pin.mode = 'set'; shakeDots(); return drawPin('Die Codes waren verschieden – nochmal!'); }
    if (online) try { await api('/setpin', { id: pin.p.id, pin: h, token: pin.token }); } catch (e) { pin.mode = 'set'; return drawPin('Hat nicht geklappt – nochmal versuchen.'); }
    pin.p.hasPin = true; if (!online) pin.p.pinHash = h; login(h);
  } else login(h);
}
async function login(h) {
  let server = null;
  if (online) {
    try { server = (await api('/login', { id: pin.p.id, pin: h })).save; if (!pin) return; }
    catch (e) {
      if (!pin) return;
      if (e.code) { shakeDots(); return drawPin(e.code === 'locked' ? `Zu oft falsch – warte ${e.wait} Sekunden. ⏳` : 'Falscher Code 🙈'); }
      online = false; // Netz weg → lokal weiter
    }
  }
  if (!online && pin.p.pinHash !== h) {
    shakeDots(); return drawPin(pin.p.pinHash ? 'Falscher Code 🙈' : 'Ohne Internet kannst du dich auf diesem Gerät noch nicht anmelden.');
  }
  pin.p.pinHash = h; saveProfiles(); // lokale Kopie für Offline-Anmeldung
  startGame(pin.p, h, server);
}
addEventListener('keydown', e => { if (!$('#pin').hidden && /^[0-9]$|^Backspace$/.test(e.key)) pinKey(e.key === 'Backspace' ? '⌫' : e.key); });

// Wiederherstellung über schwierige Rechnungen – Aufgaben und Prüfung am Server
async function loadProblems(msg = '') {
  try {
    const { problems } = await api('/recover/start', { id: pin.p.id });
    show('recover'); $('#recmsg').textContent = msg;
    $('#probs').innerHTML = problems.map(q => `<label>${q} = <input inputmode="numeric"></label>`).join('');
  } catch (e) { show('pin'); drawPin('Code-Hilfe geht nur mit Internet.'); }
}
$('#forgot').onclick = () => loadProblems();
$('#checkprobs').onclick = async () => {
  const answers = [...$('#probs').querySelectorAll('input')].map(i => i.value.trim());
  try {
    pin.token = (await api('/recover/finish', { id: pin.p.id, answers })).token;
    pin.mode = 'set'; show('pin'); drawPin('Super gerechnet! Wähle einen neuen Code.');
  } catch (e) { loadProblems(e.code ? 'Leider nicht alles richtig. Hier sind neue Aufgaben!' : 'Kein Internet?'); }
};

// =================== Spielstand ===================
let G = null, P = null;
const saveKey = () => 'lw_save_' + P.id;
const toolLv = line => TOOLS[line].levels[G.tools[line]];
const bagCap = () => toolLv('tragen').cap;
const bagCount = () => Object.values(G.inv).reduce((a, b) => a + b, 0);
const isAuto = t => { const d = THINGS[t.type]; return d.kind === 'grow' && !!toolLv(d.tool).auto; };
const storeCap = d => d.n * 3;
const hasConsumer = item => G.things.some(t => THINGS[t.type].in?.[item]);
const surplus = item => !G.things.some(c => { const n = THINGS[c.type].in?.[item]; return n && (c.inS[item] || 0) < n * 4; }); // kein Abnehmer hat mehr Platz
const pos = t => t.type === 'kuh' ? { x: t.cx, y: t.cy } : { x: t.x, y: t.y };
const age = () => P.age + STAGES[G.stage].add;
const avail = k => !UNLOCKS.slice(G.unlocks).flat().includes(k); // schon im Laden?
// Endstation (Ware wird nirgends weiterverarbeitet) zum ersten Mal gebaut → nächste Kette freischalten
function checkUnlock(k) {
  const d = THINGS[k];
  if (d.kind !== 'factory' || G.fin[k] || Object.keys(THINGS).some(f => avail(f) && THINGS[f].in?.[d.item])) return null;
  G.fin[k] = 1;
  return G.unlocks < UNLOCKS.length ? UNLOCKS[G.unlocks++] : null;
}

function slotsAvail(area) { const a = AREAS[area]; return a.base + a.per * G.land; }
function slotPos(area, i) {
  const a = AREAS[area], j = i - a.cols * a.rows;
  if (j < 0) return { x: (a.x + (i % a.cols) * a.dx) * T, y: (a.y + Math.floor(i / a.cols) * a.dy) * T };
  return { x: (a.ex + (j % a.ec) * a.dx) * T, y: (WORLD_H0 + 3 + Math.floor(j / a.ec) * a.dy) * T }; // Neuland im Süden
}
// ponytail: Welt wächst nur nach Süden; bei sehr viel Land wird sie lang, aber nie zu eng
function fitWorld() { WORLD.h = Math.max(WORLD_H0, ...Object.keys(AREAS).map(a => slotPos(a, slotsAvail(a) - 1).y / T + 2)); }
function freeSlot(area) {
  const used = new Set(G.things.filter(t => THINGS[t.type].area === area).map(t => t.slot));
  for (let i = 0; i < slotsAvail(area); i++) if (!used.has(i)) return i;
  return -1;
}
function addThing(type) {
  const area = THINGS[type].area, slot = freeSlot(area);
  if (slot < 0) return null;
  const p = slotPos(area, slot);
  const t = { id: G.nid++, type, slot, x: p.x, y: p.y, timer: 0, ripe: false, store: 0, inS: {}, out: 0, prog: 0, wait: 0 };
  if (type === 'kuh') Object.assign(t, { cx: p.x, cy: p.y, tx: p.x, ty: p.y, face: 1 });
  G.things.push(t);
  return t;
}
function newGame() {
  G = { v: 1, nid: 1, money: 0, inv: {}, tools: {}, land: 0, things: [], px: 29 * T, py: 16 * T, seen: {}, stage: 0, unlocks: 0, fin: {}, deco: [], carry: null };
  for (const k in TOOLS) G.tools[k] = 0;
  addThing('feld').ripe = true;
  addThing('baum').ripe = true;
  addThing('baum').timer = 15;
}
function loadGame(server) {
  newGame();
  const local = store.get(saveKey());
  const s = (server?.savedAt || 0) > (local?.savedAt || 0) ? server : local;
  if (s) {
    const tools = G.tools;
    Object.assign(G, s);
    G.tools = Object.assign(tools, s.tools);
    G.things = G.things.filter(t => THINGS[t.type]); // falls ein Typ entfernt wurde
    G.deco = (G.deco || []).filter(d => DECOS[d.type]);
    if (G.carry && !DECOS[G.carry]) G.carry = null;
    const u0 = G.unlocks;
    for (const t of G.things) checkUnlock(t.type); // alte Spielstände: schon gebaute Endstationen zählen
    if (G.unlocks > u0) setTimeout(() => toast(`🎉 ${G.unlocks - u0} neue Rezepte freigeschaltet – schau im Laden bei 🏭 Gebäude!`), 1500);
  }
}
function save(cloud) {
  if (!G) return;
  G.savedAt = Date.now();
  store.set(saveKey(), G);
  if (cloud && online && KEY) fetch(API + '/save', { method: 'POST', keepalive: true, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id: P.id, pin: KEY, save: G }) }).catch(() => {});
}

function startGame(p, key, server) {
  P = p; KEY = key; pin = null; loadGame(server); AU.init(); show('game'); resize();
  shopDismiss = false; near = null; lastNear = null;
  hud(); toast(`Willkommen, ${P.name}! Lauf mit den Pfeiltasten ${'ontouchstart' in window ? 'oder wisch über den Bildschirm' : '(oder WASD)'}.`);
}
$('#bexit').onclick = () => { save(true); G = null; KEY = null; closeModals(); renderSelect(); };
$('#bsound').onclick = e => { e.currentTarget.textContent = AU.toggle() ? '🔊' : '🔇'; };
$('#bplan').onclick = () => openPlan();
$('#bzin').onclick = () => setZoom(1.25);
$('#bzout').onclick = () => setZoom(0.8);
cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(Math.exp(-e.deltaY * 0.002)); }, { passive: false });
addEventListener('visibilitychange', () => document.hidden && save(true));
addEventListener('pagehide', () => save(true));

// =================== Eingabe ===================
const keys = {};
addEventListener('keydown', e => {
  if (!G || e.target.tagName === 'INPUT') return;
  AU.init();
  keys[e.key.toLowerCase()] = true;
  if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault();
  if (e.key === 'Escape') closeModals();
  if (G.carry && (e.key === 'Enter' || e.key === ' ') && $('#shop').hidden) placeDeco();
  if (e.key === '+' || e.key === '-') setZoom(e.key === '+' ? 1.25 : 0.8);
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
let joy = null;
// Zwei Finger = Pinch-Zoom, ein Finger = Joystick
const touches = new Map(); let pinch = 0;
const spread = () => { const [a, b] = touches.values(); return dist(a.x, a.y, b.x, b.y) || 1; };
cv.addEventListener('pointerdown', e => {
  AU.init(); cv.setPointerCapture(e.pointerId); touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (touches.size === 2) { joy = null; pinch = spread(); }
  else if (!joy && touches.size === 1) joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
});
cv.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size === 2) { const s = spread(); setZoom(s / pinch); pinch = s; }
  else if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
});
const joyEnd = e => { touches.delete(e.pointerId); if (touches.size < 2) pinch = 0; if (joy && e.pointerId === joy.id) joy = null; };
cv.addEventListener('pointerup', joyEnd); cv.addEventListener('pointercancel', joyEnd);

// =================== Spiellogik ===================
let near = null, lastNear = null, harvest = null, shopDismiss = false, moving = false, walk = 0, face = 1, faceS = 1, amp = 0, time = 0;
const cart = { on: false }; // gezogener Wagen: Vorder-/Hinterachse in Weltkoordinaten
let trH = 0; // Fahrtrichtung des Traktors (Bogenmass)
const packages = [], floaters = [], particles = [];
let acc = { tr: 0, w: 0, save: 0, hud: 0, sp: 0 };

function update(dt) {
  time += dt;
  // Bewegung
  let mx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
  let my = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
  if (joy) { const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy); if (l > 8) { mx = dx / Math.max(l, 50); my = dy / Math.max(l, 50); } }
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const sp = 4.6 * T * (1 + G.stage * 0.06);
  const ox = G.px, oy = G.py;
  G.px = clamp(G.px + mx * sp * dt, T, (WORLD.w - 1) * T);
  if (inLake(G.px, G.py)) G.px = ox; // nicht in den See laufen – am Ufer entlang rutschen
  fitWorld();
  G.py = clamp(G.py + my * sp * dt, T * 1.5, (WORLD.h - 0.5) * T);
  if (inLake(G.px, G.py)) G.py = oy;
  moving = ml > 0.1;
  if (moving) { walk += dt * 11; if (Math.abs(mx) > 0.2) face = Math.sign(mx); }
  amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 10); // Schritt weich ein-/ausblenden
  if (!onTractor()) trH = face > 0 ? 0 : Math.PI;
  else if (moving) { // lenkt mit begrenzter Drehgeschwindigkeit in die Fahrtrichtung
    const d = Math.atan2(my, mx) - trH; trH += clamp(Math.atan2(Math.sin(d), Math.cos(d)), -5 * dt, 5 * dt);
    const c = Math.cos(trH); if (Math.abs(c) > 0.2) face = Math.sign(c);
  }
  faceS += (face - faceS) * Math.min(1, dt * 14);         // Umdrehen statt Umklappen
  trailCart();

  for (const t of G.things) {
    const d = THINGS[t.type];
    if (d.kind === 'grow') {
      if (!t.ripe) { t.timer += dt; if (t.timer >= d.time) t.ripe = true; }
      if (t.ripe && isAuto(t) && t.store + d.n <= storeCap(d)) { t.store += d.n; t.ripe = false; t.timer = 0; }
      if (t.type === 'kuh') cowMove(t, dt);
    } else {
      t.working = Object.entries(d.in).every(([k, v]) => (t.inS[k] || 0) >= v) && t.out + d.n <= OUT_CAP;
      if (t.working) {
        t.wait = 0; t.prog += dt / d.time;
        if (t.prog >= 1) { t.prog = 0; for (const k in d.in) t.inS[k] -= d.in[k]; t.out += d.n; }
      } else t.wait += dt;
      if (t.working && t.type === 'baeckerei' && Math.random() < dt * 3) particles.push({ x: t.x + 34, y: t.y - 100, vx: rndf(-5, 5), vy: -18, life: 2.5, r: 6 });
      if (t.type === 'muehle') t.ang = (t.ang || 0) + dt * (t.working ? 2.2 : 0.25);
    }
  }
  for (const d of G.deco) if (d.type === 'alphorn' && Math.random() < dt * 0.7 && dist(G.px, G.py, d.x, d.y) < 9 * T) floaters.push({ x: d.x + 60 + rndf(-6, 6), y: d.y - 30, text: Math.random() < 0.5 ? '♪' : '♫', t: 0 });
  if ((acc.tr += dt) > 0.35) { acc.tr = 0; transfers(); }
  if ((acc.sp += dt) > (toolLv('spedition').every || 1e9)) { acc.sp = 0; spedition(); }
  if ((acc.w += dt) > 0.5) { acc.w = 0; warnings(); checkStage(); }
  interact(dt);
  if ((acc.hud += dt) > 0.25) { acc.hud = 0; hud(); }
  for (const k of packages) k.t += dt / k.dur;
  for (const f of floaters) { f.t += dt; f.y -= dt * 30; }
  for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += dt * 6; }
  prune(packages, k => k.t < 1); prune(floaters, f => f.t < 1.6); prune(particles, p => p.life > 0);
  if ((acc.save += dt) > 5) { acc.save = 0; acc.cloud = (acc.cloud || 0) + 1; save(acc.cloud % 6 === 0); } // lokal alle 5 s, Server alle 30 s
  AU.update(soundLevels());
}
const rndf = (a, b) => a + Math.random() * (b - a);
function prune(arr, keep) { for (let i = arr.length - 1; i >= 0; i--) if (!keep(arr[i])) arr.splice(i, 1); }

function cowMove(t, dt) {
  const d = dist(t.cx, t.cy, t.tx, t.ty);
  if (d < 4) {
    if (Math.random() < dt * 0.3) { t.tx = (PASTURE.x + 1 + Math.random() * (PASTURE.w - 2)) * T; t.ty = (PASTURE.y + 1.5 + Math.random() * (PASTURE.h - 2.5)) * T; }
    return;
  }
  const s = 0.5 * T * dt / d;
  t.cx += (t.tx - t.cx) * s; t.cy += (t.ty - t.cy) * s;
  if (Math.abs(t.tx - t.cx) > 2) t.face = Math.sign(t.tx - t.cx);
}

// Waren fliessen automatisch zu Gebäuden, die sie brauchen (aus Lagern von Feldern/Bäumen/Kühen und anderen Gebäuden)
function transfers() {
  for (const f of G.things) {
    const d = THINGS[f.type]; if (d.kind !== 'factory') continue;
    for (const it in d.in) {
      if ((f.inS[it] || 0) >= d.in[it] * 4) continue;
      let best = null, bd = 1e9;
      for (const s of G.things) {
        const sd = THINGS[s.type]; if (s === f || sd.item !== it) continue;
        if ((sd.kind === 'grow' ? s.store : s.out) <= 0) continue;
        const p = pos(s), dd = dist(p.x, p.y, f.x, f.y);
        if (dd < bd) { bd = dd; best = s; }
      }
      if (!best) continue;
      if (THINGS[best.type].kind === 'grow') best.store--; else best.out--;
      f.inS[it] = (f.inS[it] || 0) + 1;
      const p = pos(best);
      packages.push({ x0: p.x, y0: p.y - 20, x1: f.x, y1: f.y - 30, t: 0, dur: Math.min(3, 0.6 + bd / (T * 8)), icon: ITEMS[it].icon });
    }
  }
}

function spedition() { // Spediteur holt Endprodukte ab und verkauft sie beim Händler
  const h = FIXED_E.find(f => f.type === 'haendler');
  let left = toolLv('spedition').cap, sum = 0;
  for (const t of G.things) {
    const d = THINGS[t.type];
    if (!left) break;
    if (d.kind !== 'factory' || !t.out || hasConsumer(d.item)) continue;
    const n = Math.min(t.out, left); t.out -= n; left -= n; sum += n * ITEMS[d.item].price;
    packages.push({ x0: t.x, y0: t.y - 20, x1: h.x, y1: h.y - 30, t: 0, dur: 2.5, icon: '🚚' + ITEMS[d.item].icon });
  }
  if (sum) { G.money += sum; floater(h.x, h.y - 90, `🚚 +${sum} Fr.`); AU.sfx('cash'); }
}
function warnings() {
  const sup = {}, dem = {};
  for (const t of G.things) {
    const d = THINGS[t.type];
    sup[d.item] = (sup[d.item] || 0) + d.n / d.time * 60;
    if (d.in) for (const k in d.in) dem[k] = (dem[k] || 0) + d.in[k] / d.time * 60;
  }
  const r = v => Math.round(v || 0);
  for (const t of G.things) {
    const d = THINGS[t.type]; t.warn = ''; t.wl = 'red';
    if (d.kind === 'grow') {
      if (t.store >= storeCap(d)) {
        if (hasConsumer(d.item)) { t.warn = `Zu viel ${ITEMS[d.item].name} – die Verarbeitung kommt nicht nach. Hol etwas ab oder baue mehr!`; t.wl = 'yellow'; }
        else t.warn = `Lager voll! Hol ${ITEMS[d.item].name} ab und bring es zum Händler.`;
      }
      continue;
    }
    if (t.out + d.n > OUT_CAP) {
      t.warn = hasConsumer(d.item) ? `Lager voll – die nächste Station schafft nicht so viel ${ITEMS[d.item].name}. Hol etwas ab und verkauf es!` : `Lager voll! Hol ${ITEMS[d.item].name} ab und verkauf es.`;
      if (hasConsumer(d.item)) t.wl = 'yellow';
      continue;
    }
    const miss = Object.keys(d.in).filter(k => (t.inS[k] || 0) < d.in[k]);
    if (miss.length && t.wait > 5) {
      const k = miss[0], name = ITEMS[k].name;
      if (!sup[k]) t.warn = `Es fehlt ${name} – niemand stellt das her! Kauf etwas, das ${name} macht.`;
      else {
        const auto = G.things.some(s => THINGS[s.type].item === k && (THINGS[s.type].kind === 'factory' || isAuto(s)));
        t.warn = auto ? `Wartet auf ${name} …` : `Bring ${name} her! (oder kauf eine Maschine, die automatisch erntet)`;
      }
      continue;
    }
    for (const k in d.in) if ((sup[k] || 0) < dem[k] * 0.9) { t.warn = `Zu wenig ${ITEMS[k].name}: gebraucht ${r(dem[k])}/min, hergestellt ${r(sup[k])}/min.`; t.wl = 'yellow'; break; }
  }
}

function score() { return G.things.length + G.land * 3 + Object.values(G.tools).reduce((a, b) => a + b, 0) * 2; }
function checkStage() {
  let s = 0; STAGES.forEach((st, i) => { if (score() >= st.score) s = i; });
  if (s > G.stage) { G.stage = s; toast(`🎉 ${P.name} ist gewachsen! Jetzt ${age()} Jahre alt.`); AU.sfx('grow'); }
}

function addInv(item, n) { G.inv[item] = (G.inv[item] || 0) + n; }
let toastKeys = {};
function toast(msg, key) {
  if (key) { if (toastKeys[key] > time) return; toastKeys[key] = time + 5; }
  const d = document.createElement('div'); d.textContent = msg; $('#toast').append(d);
  setTimeout(() => d.remove(), 3800);
}
function floater(x, y, text) { floaters.push({ x, y, text, t: 0 }); }
function take(t, field) { // Ware vom Lager in die Tasche
  const item = THINGS[t.type].item, free = bagCap() - bagCount(), n = Math.min(t[field], free);
  if (n <= 0) { toast('Deine Tasche ist voll! Bring alles zum Händler. 🧺', 'full'); return; }
  t[field] -= n; addInv(item, n); AU.sfx('pop');
  const p = pos(t); floater(p.x, p.y - 50, `+${n} ${ITEMS[item].icon}`);
}

function reach(t) {
  const p = pos(t);
  if (t.type === 'feld') {
    const d = THINGS.feld, dx = Math.max(0, Math.abs(G.px - p.x) - d.w * T / 2), dy = Math.max(0, Math.abs(G.py - p.y) - d.h * T / 2);
    return Math.hypot(dx, dy) < T * 0.4 ? Math.hypot(dx, dy) : 1e9;
  }
  const r = t.type === 'baum' ? 1.3 : t.type === 'kuh' ? 1.4 : 2.4;
  const d = dist(G.px, G.py, p.x, p.y - (r > 2 ? T * 0.3 : 0));
  return d < r * T ? d : 1e9;
}
const FIXED_E = FIXED.map(f => ({ ...f, x: f.x * T, y: f.y * T }));

// =================== See & Deko ===================
const lakeR = a => 1 + 0.07 * Math.sin(3 * a + 1) + 0.05 * Math.sin(5 * a + 2); // Ufer etwas wellig
function inLake(x, y, m = 0) {
  const dx = x / T - LAKE.x, dy = (y / T - LAKE.y) * LAKE.rx / LAKE.ry, a = Math.atan2(dy, dx);
  return Math.hypot(dx, dy) < LAKE.rx * lakeR(a) + m;
}
const decoCount = k => G.deco.filter(d => d.type === k).length + (G.carry === k ? 1 : 0);
const ghostPos = () => ({ x: G.px + face * 46, y: G.py + 2 });
let nearDeco = null;
function decoSpotOk(x, y) {
  if (x < T || x > (WORLD.w - 1) * T || y < 2 * T || y > (WORLD.h - 0.3) * T || inLake(x, y, 0.6)) return false;
  for (const f of FIXED_E) if (Math.abs(x - f.x) < 3 * T && y < f.y + 0.8 * T && y > f.y - 1.5 * T) return false;
  for (const t of G.things) {
    if (t.type === 'feld') { if (Math.abs(x - t.x) < 2.8 * T && Math.abs(y - t.y) < 1.9 * T) return false; }
    else if (THINGS[t.type].kind === 'factory') { if (Math.abs(x - t.x) < 2.4 * T && y < t.y + 0.7 * T && y > t.y - 1.2 * T) return false; }
    else if (t.type === 'baum' && dist(x, y, t.x, t.y) < 0.9 * T) return false;
  }
  return !G.deco.some(d => DECOS[d.type].where === 'land' && dist(x, y, d.x, d.y) < 0.6 * T);
}
function placeDeco() {
  if (!G.carry) return;
  const { x, y } = ghostPos();
  if (!decoSpotOk(x, y)) { AU.sfx('no'); toast('Hier ist kein Platz – such dir ein freies Stück Wiese! 🌼', 'noplace'); return; }
  G.deco.push({ id: G.nid++, type: G.carry, x, y }); G.carry = null; AU.sfx('buy'); save(); hud();
}
function pickDeco(d) { if (G.carry) return; G.deco.splice(G.deco.indexOf(d), 1); G.carry = d.type; AU.sfx('pop'); hud(); }
function buyDeco(k) {
  const d = DECOS[k];
  if (d.where !== 'land') { G.deco.push({ id: G.nid++, type: k }); toast(`${d.name} ist da! ${d.where === 'see' ? `Schau auf den ${P.name}see 🌊` : d.where === 'luft' ? 'Schau in den Himmel ☁️' : 'Schau hinauf in die Berge 🏔️'}`); return; }
  G.carry = k; shopDismiss = true; $('#shop').hidden = true;
  toast(`Du trägst jetzt: ${d.name}. Lauf dorthin, wo es stehen soll, und tippe 📍 Hier abstellen!`);
}

function interact(dt) {
  near = null; let nd = 1e9;
  for (const t of G.things.concat(FIXED_E)) { const d = reach(t); if (d < nd) { nd = d; near = t; } }
  if (near !== lastNear) {
    lastNear = near;
    if (near && !G.seen[near.type]) { G.seen[near.type] = 1; showInfo(near); }
  }
  const d = near && THINGS[near.type];
  // Ernten
  if (d && d.kind === 'grow') {
    if (near.store > 0 && surplus(d.item)) take(near, 'store');
    if (near.ripe && !isAuto(near)) {
      if (bagCount() >= bagCap()) { toast('Deine Tasche ist voll! Bring alles zum Händler. 🧺', 'full'); harvest = null; }
      else {
        if (!harvest || harvest.t !== near) harvest = { t: near, p: 0 };
        harvest.p += dt * toolLv(d.tool).speed / HARVEST_TIME;
        if (harvest.p >= 1) {
          const n = Math.min(d.n, bagCap() - bagCount()); addInv(d.item, n);
          near.ripe = false; near.timer = 0; harvest = null; AU.sfx('pop');
          const p = pos(near); floater(p.x, p.y - 40, `+${n} ${ITEMS[d.item].icon}`);
        }
      }
    } else harvest = null;
  } else harvest = null;
  // Gebäude: Zutaten abliefern, fertige Waren abholen
  if (d && d.kind === 'factory') {
    for (const k in d.in) {
      const n = Math.min(G.inv[k] || 0, d.in[k] * 4 - (near.inS[k] || 0));
      if (n > 0) { G.inv[k] -= n; if (!G.inv[k]) delete G.inv[k]; near.inS[k] = (near.inS[k] || 0) + n; AU.sfx('drop'); floater(near.x, near.y - 60, `−${n} ${ITEMS[k].icon}`); }
    }
    if (near.out > 0 && surplus(d.item)) take(near, 'out');
  }
  if (near?.type === 'haendler' && bagCount() > 0) {
    let sum = 0; for (const k in G.inv) sum += G.inv[k] * ITEMS[k].price;
    G.inv = {}; G.money += sum; AU.sfx('cash'); floater(near.x, near.y - 90, `+${sum} Fr. 💰`);
  }
  nearDeco = null; let dd = 1.1 * T;
  if (!near) for (const o of G.deco) if (DECOS[o.type].where === 'land') { const k = dist(G.px, G.py, o.x, o.y); if (k < dd) { dd = k; nearDeco = o; } }
  if (near?.type === 'laden') { if (!shopDismiss && $('#shop').hidden) openShop(); }
  else { shopDismiss = false; if (!$('#shop').hidden) $('#shop').hidden = true; }
}

function soundLevels() {
  const L = { feld: 0, baum: 0, kuh: 0 };
  for (const k in THINGS) L[k] = 0;
  for (const t of G.things) {
    const p = pos(t), v = clamp(1 - dist(G.px, G.py, p.x, p.y) / (6 * T), 0, 1) * (THINGS[t.type].kind === 'factory' && !t.working ? 0.25 : 1);
    if (v > L[t.type]) L[t.type] = v;
  }
  for (const d of G.deco) if (d.x != null) { const v = clamp(1 - dist(G.px, G.py, d.x, d.y) / (7 * T), 0, 1); if (v > (L[d.type] || 0)) L[d.type] = v; }
  return L;
}

// =================== HUD ===================
const NOTES = [[1000, '#9a7cc4'], [200, '#b98557'], [100, '#5f97d6'], [50, '#6fb46b'], [20, '#e0646e'], [10, '#efc93f']]; // Farben der Schweizer Banknoten
function hud() {
  if (!G) return;
  $('#who').textContent = `👦🏼 ${P.name} · ${age()} Jahre`;
  let m = G.money, notes = '';
  for (const [v, c] of NOTES) { let k = Math.floor(m / v); m -= k * v; k = Math.min(k, 6); while (k--) notes += `<span class="note" style="background:${c}">${v}</span>`; }
  $('#money').innerHTML = `💰 ${G.money} Fr.<span class="notes">${notes}${m ? `<span title="Münzen">🪙${m}</span>` : ''}</span>`;
  const inv = Object.entries(G.inv).map(([k, n]) => `${ITEMS[k].icon}${n}`).join(' ');
  $('#bag').innerHTML = `${TOOLS.tragen.icon} ${inv || '<small>leer</small>'} <small>(${bagCount()}/${bagCap()})</small>`;
  // Info-Leiste zum nächsten Ort
  const t = near, px = $('#prox');
  const set = (html, ...fns) => {
    if (px.dataset.html !== html) { px.dataset.html = html; px.innerHTML = html; } // nicht ständig neu bauen, sonst gehen Tipper verloren
    px.querySelectorAll('button').forEach((b, i) => b.onclick = fns[i]);
    px.hidden = false;
  };
  if (G.carry) {
    const dc = DECOS[G.carry], g = ghostPos(), ok = decoSpotOk(g.x, g.y);
    return set(`<div><b>${dc.icon} ${dc.name}</b><div>${ok ? 'Lauf dorthin, wo es stehen soll.' : '<span class="warn">Hier ist kein Platz.</span> Geh auf eine freie Wiese.'}</div></div><button ${ok ? '' : 'disabled'}>📍 Hier abstellen</button>`, placeDeco);
  }
  if (!t && nearDeco) {
    const dc = DECOS[nearDeco.type], o = nearDeco;
    return set(`<div><b>${dc.icon} ${dc.name}</b><div>Deko – macht nichts, ist aber schön! 😊</div></div><button>✋ Umstellen</button><button>ℹ️</button>`, () => pickDeco(o), () => showInfo(dc));
  }
  if (!t) { px.hidden = true; return; }
  const d = THINGS[t.type] || t;
  let st = '';
  if (d.kind === 'grow') {
    const tl = toolLv(d.tool);
    if (isAuto(t)) st = `🤖 ${tl.name} erntet automatisch · Lager ${t.store}/${storeCap(d)} ${ITEMS[d.item].icon}`;
    else st = t.ripe ? `Reif! Bleib stehen – du erntest mit: <b>${tl.name}</b>` : `Wächst … ${Math.floor(t.timer / d.time * 100)} %`;
  } else if (d.kind === 'factory') {
    st = Object.keys(d.in).map(k => `${ITEMS[k].icon} ${t.inS[k] || 0}/${d.in[k]}`).join(' + ') + ` → ${ITEMS[d.item].icon} ${t.out}` + (t.working ? ' ⚙️ arbeitet' : '');
  } else st = { haendler: 'Komm mit vollen Taschen – du bekommst Geldscheine!', laden: 'Hier kannst du einkaufen.', hof: 'Dein Zuhause.' }[t.type] || '';
  const w = t.warn ? `<div class="warn">❗ ${esc(t.warn)}</div>` : '';
  set(`<div><b>${d.icon || ''} ${d.name}</b><div>${st}</div>${w}</div><button>ℹ️ Wie geht das?</button>`, () => showInfo(t));
}

// =================== Fenster: Info, Laden, Plan ===================
function closeModals() { for (const id of ['#shop', '#plan', '#info']) $(id).hidden = true; shopDismiss = true; }
function modal(el, title, body, extraHead = '') {
  el.innerHTML = `<div class="box"><header>${title}<button data-x>✕</button></header>${extraHead}<div class="body">${body}</div></div>`;
  el.querySelector('[data-x]').onclick = () => { el.hidden = true; if (el.id === 'shop') shopDismiss = true; };
  el.onclick = e => { if (e.target === el) { el.hidden = true; if (el.id === 'shop') shopDismiss = true; } };
  el.hidden = false;
}
function showInfo(t) {
  const d = THINGS[t.type] || t;
  let extra = '';
  if (d.kind === 'grow') { const tl = toolLv(d.tool); extra = `<p><b>Dein Werkzeug: ${tl.name}.</b> ${tl.info}</p><p>Ergibt ${d.n} ${ITEMS[d.item].icon} ${ITEMS[d.item].name} alle ${d.time} Sekunden.</p>`; }
  if (d.kind === 'factory') extra = `<p><b>Rezept:</b> ${recipe(d)} in ${d.time} Sekunden.</p>`;
  modal($('#info'), `${d.icon || '💡'} ${d.name} – Wusstest du?`, `<p>${d.info}</p>${extra}<button class="btn" data-ok>Verstanden!</button>`);
  $('#info [data-ok]').onclick = () => $('#info').hidden = true;
}
const recipe = d => Object.entries(d.in).map(([k, v]) => `${v} ${ITEMS[k].icon} ${ITEMS[k].name}`).join(' + ') + ` → ${d.n} ${ITEMS[d.item].icon} ${ITEMS[d.item].name}`;

let shopTab = 0;
function shopList() {
  const tabs = [[], [], [], [], []];
  for (const [k, d] of Object.entries(THINGS)) {
    if (!avail(k)) continue;
    const free = freeSlot(d.area) >= 0;
    tabs[d.kind === 'grow' ? 0 : 1].push({
      icon: d.icon, name: d.name, price: d.price, info: d.info,
      desc: d.kind === 'grow' ? `Gibt ${d.n} ${ITEMS[d.item].icon} alle ${d.time} s` : recipe(d),
      note: free ? `kommt auf: ${AREAS[d.area].name}` : '⚠️ Kein Platz – kauf mehr Land!', can: free,
      buy: () => {
        const t = addThing(k); toast(`${d.name} steht jetzt auf: ${AREAS[d.area].name}`); if (!G.seen[k]) { G.seen[k] = 1; showInfo(t); }
        const u = checkUnlock(k);
        if (u) { toast(`🎉 Neues Rezept freigeschaltet: ${u.map(f => THINGS[f].icon + ' ' + THINGS[f].name).join(' → ')} – schau im Laden bei 🏭 Gebäude!`); AU.sfx('grow'); }
      },
    });
  }
  if (G.unlocks < UNLOCKS.length) tabs[1].push({ icon: '🔒', name: 'Geheimes Rezept', price: 0, can: false,
    desc: 'Bau eine Endstation – ein Gebäude, dessen Ware nirgends weiterverarbeitet wird (z. B. Konditorei). Dann kommt ein neues Produkt dazu!',
    info: 'Jedes Mal, wenn du eine neue Endstation baust, lernst du ein neues Rezept mit mehreren Verarbeitungs-Schritten.' });
  for (const [k, line] of Object.entries(TOOLS)) {
    const lv = G.tools[k], next = line.levels[lv + 1];
    if (!next) { tabs[2].push({ icon: line.icon, name: `${line.name}: ${line.levels[lv].name}`, desc: 'Beste Stufe erreicht! 🏆', info: line.levels[lv].info, can: false, price: 0 }); continue; }
    tabs[2].push({
      icon: line.icon, name: next.name, price: next.price, info: next.info, can: true,
      desc: `${line.name} · jetzt: ${line.levels[lv].name}`,
      note: next.every ? `holt ${next.cap} fertige Waren alle ${next.every} s und verkauft sie` : next.cap ? `trägt ${next.cap} statt ${line.levels[lv].cap} Waren` : next.auto ? '🤖 arbeitet automatisch!' : `${next.speed / line.levels[lv].speed}× schneller`,
      buy: () => { G.tools[k]++; modal($('#info'), `${line.icon} ${next.name} – so funktioniert's`, `<p>${next.info}</p><button class="btn" data-ok>Super!</button>`); $('#info [data-ok]').onclick = () => $('#info').hidden = true; },
    });
  }
  const lp = LAND_PRICES[G.land] ?? LAND_PRICES.at(-1) + (G.land - LAND_PRICES.length + 1) * 2000;
  tabs[3].push({
    icon: '🗺️', name: `Land Stufe ${G.land + 1}`, price: lp, can: true,
    desc: 'Mehr Platz für Felder, Bäume, Kühe und Gebäude', info: 'Mit mehr Land kannst du deine Welt vergrössern. Bauern kaufen oder pachten Land von Nachbarn.',
    buy: () => { G.land++; fitWorld(); toast(WORLD.h > WORLD_H0 ? '🗺️ Neues Land im Süden ⬇️ – folge dem Weg! Mit ➖ siehst du die ganze Welt.' : '🗺️ Deine Welt ist grösser geworden! Neue Plätze sind gestrichelt markiert.'); },
  });
  for (const [k, d] of Object.entries(DECOS)) {
    const full = d.max && decoCount(k) >= d.max, busy = d.where === 'land' && G.carry;
    tabs[4].push({ icon: d.icon, name: d.name, price: d.price, info: d.info, can: !full && !busy,
      desc: { land: 'Du stellst es hin, wo du willst', see: 'Schwimmt auf dem See', luft: 'Fliegt über deine Welt', berg: 'Fährt in die Berge' }[d.where],
      note: full ? '✅ Schon gekauft' : busy ? `Stell zuerst ${DECOS[G.carry].name} ab` : decoCount(k) ? `Hast du schon ${decoCount(k)}×` : '',
      buy: () => buyDeco(k) });
  }
  return tabs;
}
function openShop() {
  const tabs = shopList(), names = ['🌱 Tiere & Pflanzen', '🏭 Gebäude', '🔧 Werkzeuge', '🗺️ Land', '🏔️ Deko'];
  const L = tabs[shopTab];
  const head = `<div class="tabs">${names.map((n, i) => `<button data-tab="${i}" class="${i === shopTab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const body = `<div class="cards">${L.map((it, i) => `<div class="card"><div class="ic">${it.icon}</div><b>${it.name}</b><small>${it.desc}</small>${it.note ? `<small>${it.note}</small>` : ''}
    <div class="more" hidden>${it.info}</div>
    <div class="row">${it.price ? `<span class="price">${it.price} Fr.</span>` : '<span class="price"></span>'}<button class="i" data-info="${i}">ℹ️</button>${it.buy ? `<button class="k" data-buy="${i}" ${!it.can || G.money < it.price ? 'disabled' : ''}>Kaufen</button>` : ''}</div></div>`).join('')}</div>`;
  modal($('#shop'), `🛒 Laden <small style="font-weight:600;font-size:16px">– du hast ${G.money} Fr.</small>`, body, head);
  const el = $('#shop');
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = +b.dataset.tab; openShop(); });
  el.querySelectorAll('[data-info]').forEach(b => b.onclick = () => { const m = b.closest('.card').querySelector('.more'); m.hidden = !m.hidden; });
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const it = L[+b.dataset.buy];
    if (G.money < it.price) { AU.sfx('no'); return; }
    G.money -= it.price; it.buy(); AU.sfx('buy'); save(); hud(); if (!$('#shop').hidden) openShop();
  });
}

// Produktions-Diagramm: alle möglichen Ketten, Besessenes farbig, Probleme rot/gelb
function openPlan() {
  const types = Object.keys(THINGS).filter(avail), depth = {};
  const makers = it => types.filter(k => THINGS[k].item === it);
  const dep = k => depth[k] ?? (depth[k] = THINGS[k].kind === 'grow' ? 0 : 1 + Math.max(0, ...Object.keys(THINGS[k].in).flatMap(it => makers(it).map(dep))));
  types.forEach(dep);
  const maxD = Math.max(...Object.values(depth)) + 1;
  const cnt = {}, sup = {}, dem = {};
  for (const k of types) cnt[k] = G.things.filter(t => t.type === k).length;
  for (const k of types) { const d = THINGS[k]; sup[d.item] = (sup[d.item] || 0) + cnt[k] * d.n / d.time * 60; if (d.in) for (const i in d.in) dem[i] = (dem[i] || 0) + cnt[k] * d.in[i] / d.time * 60; }
  const cols = Array.from({ length: maxD + 1 }, () => []);
  types.forEach(k => cols[depth[k]].push(k)); cols[maxD].push('haendler');
  const NW = 170, NH = 62, GX = 70, GY = 18, posn = {};
  const hMax = Math.max(...cols.map(c => c.length)) * (NH + GY);
  cols.forEach((c, ci) => c.forEach((k, ri) => { posn[k] = { x: 10 + ci * (NW + GX), y: 10 + (hMax - c.length * (NH + GY)) / 2 + ri * (NH + GY) }; }));
  const Wd = 20 + (maxD + 1) * (NW + GX) - GX, Hd = hMax + 10;
  let edges = '', nodes = '';
  const r = v => Math.round(v * 10) / 10;
  const edge = (a, b, it, color, dash, label) => {
    const p = posn[a], q = posn[b], x1 = p.x + NW, y1 = p.y + NH / 2, x2 = q.x, y2 = q.y + NH / 2, mx = (x1 + x2) / 2;
    edges += `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${color}" stroke-width="${dash ? 2 : 3.5}" ${dash ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#ar)"/>`;
    if (label) edges += `<text x="${mx}" y="${(y1 + y2) / 2 - 5}" text-anchor="middle" font-size="12" font-weight="700" fill="${color}" stroke="#fbf4e4" stroke-width="4" paint-order="stroke">${label}</text>`;
  };
  for (const k of types) {
    const d = THINGS[k], it = d.item;
    const consumers = types.filter(f => THINGS[f].in?.[it]);
    for (const f of consumers) {
      const on = cnt[k] && cnt[f];
      let color = '#bbb';
      if (on) color = sup[it] < dem[it] * 0.9 ? '#d23b2b' : sup[it] > dem[it] * 1.8 ? '#e39b1c' : '#3d8b2f';
      edge(k, f, it, color, false, on ? `${ITEMS[it].icon} ${r(sup[it])}→${r(dem[it])}/min` : ITEMS[it].icon);
    }
    if (cnt[k] && !consumers.some(f => cnt[f])) edge(k, 'haendler', it, '#3e7bc4', true, `${ITEMS[it].icon} ${d.kind === 'factory' && G.tools.spedition ? '🚚 Spediteur' : 'du trägst'}`);
  }
  // Tipps: alles, was gerade Geld kostet oder bringen würde – bewertet als ≈ Fr. in den nächsten M Minuten
  const tips = [], M = 5, eur = it => ITEMS[it].price, perMin = d => d.n / d.time * 60, nm = it => `${ITEMS[it].icon} ${ITEMS[it].name}`;
  const tip = (v, html) => tips.push({ v: Math.max(1, Math.round(v)), html });
  const unitVal = f => eur(THINGS[f].item) * THINGS[f].n / Object.values(THINGS[f].in).reduce((a, b) => a + b); // Wert je Zutat nach Verarbeitung
  const bestUser = (it, built) => types.filter(f => THINGS[f].in?.[it] && (!built || cnt[f])).sort((a, b) => unitVal(b) - unitVal(a))[0];
  let blocked = 0; // was gerade auf eine freie Tasche wartet
  for (const k of types) {
    const d = THINGS[k], it = d.item, fld = d.kind === 'grow' ? 'store' : 'out', cap = d.kind === 'grow' ? storeCap(d) : OUT_CAP;
    const ts = G.things.filter(t => t.type === k && t[fld] > 0);
    if (ts.length && surplus(it)) { // nur Überschuss lässt sich abholen
      const n = ts.reduce((a, t) => a + t[fld], 0), full = ts.filter(t => t[fld] + d.n > cap).length, v = n * eur(it) + full * perMin(d) * eur(it) * M;
      blocked += v;
      tip(v, `📦 <b>Hole ${n} ${nm(it)} ab</b> – liegt bei ${ts.length}× ${d.name}${full ? ` (bei ${full} ist das Lager voll, dort steht die Arbeit!)` : ''} – und verkauf es beim Händler.`);
    }
    const ripe = G.things.filter(t => t.type === k && t.ripe && !isAuto(t)).length;
    if (ripe) { const v = ripe * (d.n * eur(it) + perMin(d) * eur(it) * M); blocked += v; tip(v, `✨ <b>${ripe}× ${d.name} ${ripe > 1 ? 'sind' : 'ist'} reif – ernte ${ripe * d.n} ${nm(it)}!</b> Solange du nicht erntest, wächst nichts nach.`); }
  }
  for (const [it, n] of Object.entries(G.inv)) {
    const f = G.things.find(t => THINGS[t.type].in?.[it] && (t.inS[it] || 0) < THINGS[t.type].in[it] * 4);
    if (f) tip(n * unitVal(f.type), `🧺 <b>Bring ${n} ${nm(it)} aus deiner Tasche zur ${THINGS[f.type].name}</b> – dort wird etwas Wertvolleres daraus.`);
    else tip(n * eur(it), `💰 <b>Verkauf ${n} ${nm(it)} beim Händler</b> (${n * eur(it)} Fr.).`);
  }
  if (bagCount() >= bagCap()) tip(blocked + 1, `🎒 <b>Deine Tasche ist voll!</b> Leere sie zuerst – sonst kannst du nichts ernten oder abholen.`);
  for (const it in ITEMS) {
    const s = sup[it] || 0, dm = dem[it] || 0, makes = makers(it).map(k => THINGS[k].name).join(' / ');
    if (dm && s < dm * 0.9) {
      const f = bestUser(it, true);
      tip((dm - s) * unitVal(f) * M, `🔴 <b>Zu wenig ${nm(it)}</b>: gebraucht ${r(dm)}/min, hergestellt ${r(s)}/min. ${s ? `Kauf mehr ${makes}.` : `Niemand macht ${ITEMS[it].name} – kauf ${makes}!`}`);
    }
    if (!s) continue;
    const bu = bestUser(it, true), best = bestUser(it, false);
    if (dm && s > dm * 1.8) tip((s - dm) * Math.max(1, unitVal(bu) - eur(it)) * M, `🟠 <b>Mehr ${nm(it)} als gebraucht</b> (${r(s)} statt ${r(dm)}/min). Hol den Rest ab und verkauf ihn – oder baue noch eine ${THINGS[bu].name}.`);
    if (!dm && best && unitVal(best) > eur(it)) tip(s * (unitVal(best) - eur(it)) * M, `🏗️ <b>Baue eine ${THINGS[best].name}</b> (${THINGS[best].price} Fr.): macht ${nm(it)} → ${nm(THINGS[best].item)}. Das bringt mehr Geld, als ${ITEMS[it].name} direkt zu verkaufen.`);
    const manual = makers(it).filter(k => cnt[k] && THINGS[k].kind === 'grow' && !toolLv(THINGS[k].tool).auto);
    if (dm && manual.length) tip(s * eur(it) * M * 0.5, `✋ <b>${ITEMS[it].name} wird von Hand geerntet</b> – du musst es selbst zur Verarbeitung bringen. Automatisch geht es mit: ${manual.map(k => TOOLS[THINGS[k].tool].levels.find(l => l.auto).name).join(', ')}.`);
  }
  tips.sort((a, b) => b.v - a.v);
  for (const k of types.concat('haendler')) {
    const p = posn[k], d = THINGS[k] || FIXED.find(f => f.type === k), on = k === 'haendler' || cnt[k] > 0;
    const warn = G.things.some(t => t.type === k && t.warn);
    const rate = THINGS[k] ? (cnt[k] ? `${r(cnt[k] * d.n / d.time * 60)} ${ITEMS[d.item].icon}/min` : `${d.price} Fr. im Laden`) : 'macht Geld 💰';
    const ic = d.icon || '💰';
    nodes += `<g data-k="${k}" style="cursor:pointer" opacity="${on ? 1 : 0.45}"><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="12" fill="${on ? '#fff' : '#eee'}" stroke="${warn ? '#d23b2b' : on ? '#a8743f' : '#bbb'}" stroke-width="${warn ? 3 : 2}" ${on ? '' : 'stroke-dasharray="5 4"'}/>
      <text x="${p.x + 10}" y="${p.y + 26}" font-size="16" font-weight="800">${ic} ${d.name}${cnt[k] ? ' ×' + cnt[k] : ''}</text>
      <text x="${p.x + 10}" y="${p.y + 47}" font-size="12" fill="#555">${rate}</text>
      ${warn ? `<circle cx="${p.x + NW - 4}" cy="${p.y + 4}" r="11" fill="#d23b2b"/><text x="${p.x + NW - 4}" y="${p.y + 9}" text-anchor="middle" fill="#fff" font-weight="900" font-size="15">!</text>` : ''}</g>`;
  }
  const svg = `<svg width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#777"/></marker></defs>${edges}${nodes}</svg>`;
  const legend = `<div class="legend"><span style="color:#3d8b2f">━ passt</span><span style="color:#d23b2b">━ zu wenig</span><span style="color:#e39b1c">━ zu viel</span><span style="color:#3e7bc4">┅ du musst tragen</span><span style="opacity:.5">▢ noch nicht gebaut</span></div>`;
  modal($('#plan'), '📊 Dein Produktions-Plan', `${legend}<div style="overflow:auto">${svg}</div><h3>Was jetzt am meisten bringt</h3><ol class="probs">${tips.map((t, i) => `<li><b class="rk">${i + 1}</b><span>${t.html}</span><span class="imp" title="geschätzter Nutzen in den nächsten ${M} Minuten"><i style="width:${Math.max(6, t.v / tips[0].v * 100)}%"></i>≈ ${t.v} Fr.</span></li>`).join('') || '<li>✅ Alles läuft rund!</li>'}</ol><small>≈ Fr. = geschätzter Nutzen in den nächsten ${M} Minuten. </small><small>Tipp: Tippe auf ein Kästchen, um zu lernen, wie es funktioniert.</small>`);
  $('#plan').querySelectorAll('[data-k]').forEach(g => g.onclick = () => showInfo(THINGS[g.dataset.k] ? { type: g.dataset.k } : FIXED.find(f => f.type === g.dataset.k)));
}

// =================== Zeichnen ===================
const grassPat = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#6aa046'; g.fillRect(0, 0, 256, 256);
  const r = seeded(7);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `hsl(${80 + r() * 35},${38 + r() * 22}%,${28 + r() * 26}%)`; g.fillRect(r() * 256, r() * 256, 1.5, 3 + r() * 4); }
  for (let i = 0; i < 18; i++) { g.fillStyle = ['#fff', '#ffe066', '#f5a3c7'][i % 3]; g.beginPath(); g.arc(r() * 256, r() * 256, 1.8, 0, 7); g.fill(); }
  return ctx.createPattern(c, 'repeat');
})();

function ellipse(x, y, rx, ry, fill) { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); }
function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function label(x, y, text, size = 13) {
  ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(40,25,10,.75)';
  ctx.strokeText(text, x, y); ctx.fillStyle = '#fff'; ctx.fillText(text, x, y);
}
function house(x, y, w, h, wall, roof, rh = 30) {
  ellipse(x + 8, y, w / 2 + 12, 10, 'rgba(0,0,0,.22)');
  let g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, shade(wall, 1.06)); g.addColorStop(1, shade(wall, 0.82));
  ctx.fillStyle = g; ctx.fillRect(x - w / 2, y - h, w, h);
  g = ctx.createLinearGradient(0, y - h - rh, 0, y - h); g.addColorStop(0, shade(roof, 1.15)); g.addColorStop(1, shade(roof, 0.75));
  ctx.fillStyle = g; ctx.beginPath();
  ctx.moveTo(x - w / 2 - 10, y - h + 4); ctx.lineTo(x + w / 2 + 10, y - h + 4); ctx.lineTo(x + w / 2 - 6, y - h - rh); ctx.lineTo(x - w / 2 + 6, y - h - rh); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1;
  for (let i = 1; i < 4; i++) { const yy = y - h + 4 - rh * i / 4; ctx.beginPath(); ctx.moveTo(x - w / 2 - 10 + 16 * i / 4, yy); ctx.lineTo(x + w / 2 + 10 - 16 * i / 4, yy); ctx.stroke(); }
}
function win(x, y, w, h, lit) {
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, lit ? '#ffd27a' : '#bfe0f5'); g.addColorStop(1, lit ? '#f08a24' : '#6d9bc0');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x + w / 2 - 1, y, 2, h); ctx.fillRect(x, y + h / 2 - 1, w, 2);
}
function door(x, y, w, h, c = '#6b4423') { ctx.fillStyle = c; ctx.fillRect(x - w / 2, y - h, w, h); ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(x + w / 4, y - h / 2, 2, 0, 7); ctx.fill(); }
function sign(x, y, text) {
  ctx.font = '800 13px system-ui'; const w = ctx.measureText(text).width + 16;
  ctx.fillStyle = '#5b3a1e'; rrect(x - w / 2, y - 11, w, 22, 5); ctx.fill();
  ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 5);
}
function awning(x, y, w, c1, c2, n = 8) {
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? c2 : c1; ctx.beginPath(); const a = x - w / 2 + i * w / n; ctx.moveTo(a, y); ctx.lineTo(a + w / n, y); ctx.lineTo(a + w / n + 3, y + 16); ctx.lineTo(a + 3, y + 16); ctx.fill(); }
  for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? c2 : c1; ctx.beginPath(); ctx.arc(x - w / 2 + i * w / n + w / n / 2 + 3, y + 16, w / n / 2, 0, Math.PI); ctx.fill(); }
}

const fieldCache = new Map();
function drawField(t) {
  const d = THINGS.feld, w = d.w * T, h = d.h * T, x0 = t.x - w / 2, y0 = t.y - h / 2;
  const g = t.ripe ? 1 : t.timer / d.time;
  ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(x0 + 4, y0 + 6, w, h);
  ctx.fillStyle = '#7d5a37'; ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = '#664628'; ctx.lineWidth = 2;
  for (let y = y0 + 6; y < y0 + h; y += 9) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); ctx.stroke(); }
  if (!fieldCache.has(t.id)) {
    const r = seeded(t.id * 31 + 5), L = [];
    for (let y = y0 + 10; y < y0 + h - 2; y += 9) for (let x = x0 + 4; x < x0 + w - 3; x += 5.5) L.push([x + r() * 3 - t.x, y + r() * 2 - t.y, r()]);
    fieldCache.set(t.id, L);
  }
  const L = fieldCache.get(t.id);
  const lerp = (a, b) => Math.round(a + (b - a) * clamp((g - 0.4) / 0.6, 0, 1));
  const col = `rgb(${lerp(98, 222)},${lerp(160, 180)},${lerp(58, 72)})`;
  const hgt = g < 0.04 ? 3 : 4 + g * 16, sway = Math.sin(time * 1.5 + t.id) * 2 * g;
  ctx.strokeStyle = g < 0.04 ? '#c8b06a' : col; ctx.lineWidth = 1.6; ctx.beginPath();
  for (const [sx, sy, rr] of L) { const x = t.x + sx, y = t.y + sy; ctx.moveTo(x, y); ctx.lineTo(x + sway * (0.6 + rr), y - hgt * (0.85 + rr * 0.3)); }
  ctx.stroke();
  if (g > 0.55) {
    ctx.fillStyle = shade(t.ripe ? '#e0b54a' : '#9bbf4f', 0.95); ctx.beginPath();
    for (const [sx, sy, rr] of L) { const x = t.x + sx + sway * (0.6 + rr), y = t.y + sy - hgt * (0.85 + rr * 0.3); ctx.moveTo(x + 1.6, y); ctx.ellipse(x, y, 1.6, 3.5, 0, 0, 7); }
    ctx.fill();
  }
  for (let i = 0; i < Math.ceil(t.store / d.n); i++) sack(x0 + w - 14 - i * 16, y0 + h + 4);
}
function sack(x, y) {
  ellipse(x, y, 8, 3, 'rgba(0,0,0,.25)');
  ctx.fillStyle = '#d9c59a'; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.quadraticCurveTo(x - 9, y - 12, x - 3, y - 17); ctx.lineTo(x + 3, y - 17); ctx.quadraticCurveTo(x + 9, y - 12, x + 7, y); ctx.fill();
  ctx.strokeStyle = '#8a6b3a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 3, y - 15); ctx.lineTo(x + 3, y - 15); ctx.stroke();
}

function drawTree(t) {
  const { x, y } = t, d = THINGS.baum, g = t.ripe ? 1 : t.timer / d.time, r = seeded(t.id * 17 + 3);
  ellipse(x + 6, y, 30, 10, 'rgba(0,0,0,.25)');
  let gr = ctx.createLinearGradient(x - 6, 0, x + 6, 0); gr.addColorStop(0, '#7a5534'); gr.addColorStop(1, '#4a3220');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 4, y - 38); ctx.lineTo(x + 4, y - 38); ctx.lineTo(x + 7, y); ctx.fill();
  const blobs = [[-16, -50, 19], [16, -52, 19], [0, -68, 21], [-6, -46, 18], [8, -44, 18]];
  for (const [bx, by, br] of blobs) {
    gr = ctx.createRadialGradient(x + bx - 6, y + by - 8, 2, x + bx, y + by, br);
    gr.addColorStop(0, '#7dbb4f'); gr.addColorStop(1, '#2f6a26');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x + bx, y + by, br, 0, 7); ctx.fill();
  }
  const n = 12;
  for (let i = 0; i < n; i++) {
    const ax = x + (r() - 0.5) * 50, ay = y - 40 - r() * 38;
    if (g < 0.25) { ctx.fillStyle = r() < 0.5 ? '#fff' : '#f7c6d9'; ctx.beginPath(); ctx.arc(ax, ay, 2.6, 0, 7); ctx.fill(); }   // Blüten
    else if (i < n * g) { ctx.fillStyle = g < 0.75 ? '#a6c84a' : '#d8332a'; ctx.beginPath(); ctx.arc(ax, ay, 1.5 + g * 2.8, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(ax - 1.5, ay - 1.5, 1.5, 1.5); }
  }
  if (t.store > 0) crate(x + 22, y + 4, '#d8332a', Math.min(t.store, 12));
}
function crate(x, y, c, n) {
  ellipse(x, y, 14, 4, 'rgba(0,0,0,.25)');
  ctx.fillStyle = '#b07a42'; ctx.fillRect(x - 12, y - 14, 24, 14);
  ctx.strokeStyle = '#7b5228'; ctx.lineWidth = 1; ctx.strokeRect(x - 12, y - 14, 24, 14); ctx.beginPath(); ctx.moveTo(x - 12, y - 7); ctx.lineTo(x + 12, y - 7); ctx.stroke();
  ctx.fillStyle = c; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x - 8 + (i % 5) * 4, y - 15 - Math.floor(i / 5) * 3, 2.6, 0, 7); ctx.fill(); }
}

function drawCow(t) {
  const x = t.cx, y = t.cy, f = t.face || 1, walking = dist(t.cx, t.cy, t.tx, t.ty) > 4, ph = walking ? Math.sin(time * 6 + t.id) * 3 : 0;
  ellipse(x, y, 30, 8, 'rgba(0,0,0,.25)');
  ctx.save(); ctx.translate(x, y); ctx.scale(f, 1);
  ctx.fillStyle = '#3a3a3a';
  for (const [lx, o] of [[-16, ph], [-9, -ph], [12, -ph], [18, ph]]) ctx.fillRect(lx - 2.5 + o * 0.3, -14, 5, 14);
  ctx.fillStyle = '#222'; for (const lx of [-16, -9, 12, 18]) ctx.fillRect(lx - 2.5, -3, 5, 3);
  ctx.beginPath(); ctx.ellipse(0, -24, 25, 13, 0, 0, 7);
  const g = ctx.createLinearGradient(0, -37, 0, -11); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d4cc'); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip(); const r = seeded(t.id * 7);
  ctx.fillStyle = '#1e1e1e'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(-18 + r() * 36, -32 + r() * 18, 5 + r() * 7, 4 + r() * 5, r() * 3, 0, 7); ctx.fill(); }
  ctx.restore();
  const ud = t.ripe ? 7 : t.timer / THINGS.kuh.time * 4 + 2;
  ellipse(4, -12, ud, ud * 0.7, '#f2a7b5');
  ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-24, -28); ctx.quadraticCurveTo(-30, -18 + ph, -27, -10); ctx.stroke();
  const hy = -30 + (walking ? 0 : Math.sin(time + t.id) * 2 + 6); // grasen
  ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(27, hy, 8, 9, 0.3, 0, 7); ctx.fill();
  ctx.fillStyle = '#1e1e1e'; ctx.beginPath(); ctx.ellipse(25, hy - 3, 5, 5, 0, 0, 7); ctx.fill();
  ellipse(31, hy + 6, 6, 4.5, '#e8a0a8');
  ctx.fillStyle = '#e8dcc0'; ctx.fillRect(22, hy - 11, 2, 4); ctx.fillRect(29, hy - 11, 2, 4);
  ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(29, hy - 2, 1.4, 0, 7); ctx.fill();
  // Kuhglocke am roten Riemen
  const bs = walking ? Math.sin(time * 9 + t.id) * 0.35 : 0;
  ctx.strokeStyle = '#d52b1e'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(20, hy + 2); ctx.quadraticCurveTo(22, hy + 9, 28, hy + 6); ctx.stroke();
  ctx.save(); ctx.translate(22, hy + 8); ctx.rotate(bs);
  ctx.fillStyle = '#d9a92e'; ctx.beginPath(); ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0); ctx.lineTo(4, 7); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#8a6a1a'; ctx.fillRect(-4, 6, 8, 1.5); ctx.restore();
  ctx.restore();
  if (t.store > 0) milkcan(t.x + 26, t.y + 4);
}
function milkcan(x, y) {
  ellipse(x, y, 8, 3, 'rgba(0,0,0,.25)');
  const g = ctx.createLinearGradient(x - 7, 0, x + 7, 0); g.addColorStop(0, '#eef2f5'); g.addColorStop(1, '#8e9aa5');
  ctx.fillStyle = g; ctx.fillRect(x - 7, y - 18, 14, 18); ctx.fillRect(x - 4, y - 24, 8, 6);
}

const DRAW = {
  hof(x, y, t) {
    house(x - 50, y, 100, 64, '#9e3226', '#55504a', 34);
    ctx.fillStyle = '#7d281e'; ctx.fillRect(x - 74, y - 48, 48, 48); ctx.strokeStyle = '#f2eadc'; ctx.lineWidth = 4;
    ctx.strokeRect(x - 74, y - 48, 48, 48); ctx.beginPath(); ctx.moveTo(x - 74, y - 48); ctx.lineTo(x - 26, y); ctx.moveTo(x - 26, y - 48); ctx.lineTo(x - 74, y); ctx.stroke();
    house(x + 50, y, 84, 56, '#f1e8d4', '#a8452e', 30);
    win(x + 20, y - 44, 18, 16); win(x + 64, y - 44, 18, 16); door(x + 50, y, 16, 28);
    ctx.fillStyle = '#8b8b8b'; ctx.fillRect(x + 70, y - 104, 10, 22);
    flagPole(x + 108, y, 96, 26, 0);
  },
  haendler(x, y) {
    ellipse(x + 6, y, 70, 10, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 60, y - 72, 5, 72); ctx.fillRect(x + 55, y - 72, 5, 72);
    // Händler
    ellipse(x, y - 52, 9, 10, '#f1c9a5'); ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.arc(x, y - 56, 9, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#3f6fb0'; ctx.fillRect(x - 11, y - 42, 22, 14);
    ctx.fillStyle = '#9b6a3a'; ctx.fillRect(x - 62, y - 30, 124, 30); ctx.fillStyle = '#7b5228'; ctx.fillRect(x - 62, y - 30, 124, 5);
    crate(x - 38, y - 30, '#d8332a', 10); crate(x - 10, y - 30, '#e0b54a', 10); crate(x + 32, y - 30, '#f5f5f0', 8);
    awning(x, y - 84, 132, '#d23b2b', '#fff', 10);
    sign(x, y - 94, 'HÄNDLER 💰');
    flagPole(x + 57, y - 72, 26, 16, 2);
  },
  laden(x, y) {
    house(x, y, 140, 72, '#f0dfb2', '#3d6b8f', 32);
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 62, y - 56, 46, 40); ctx.fillRect(x + 16, y - 56, 46, 40);
    ctx.fillStyle = '#cfe8f5'; ctx.fillRect(x - 60, y - 54, 42, 36); ctx.fillRect(x + 18, y - 54, 42, 36);
    ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🔧🐄', x - 39, y - 30); ctx.fillText('🌳🚜', x + 39, y - 30);
    door(x, y, 22, 40, '#3d6b8f');
    awning(x, y - 72, 150, '#d52b1e', '#fff', 12);
    sign(x, y - 112, 'LADEN 🛒');
    flagPole(x - 80, y, 110, 24, 3); flagPole(x + 80, y, 110, 24, 4);
  },
  muehle(x, y, t) {
    ellipse(x + 6, y, 40, 10, 'rgba(0,0,0,.25)');
    const g = ctx.createLinearGradient(x - 28, 0, x + 28, 0); g.addColorStop(0, '#ece4d4'); g.addColorStop(1, '#b3a892');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 30, y); ctx.lineTo(x - 19, y - 95); ctx.lineTo(x + 19, y - 95); ctx.lineTo(x + 30, y); ctx.fill();
    ctx.fillStyle = '#5b4a3a'; ctx.beginPath(); ctx.ellipse(x, y - 95, 23, 16, 0, Math.PI, 0); ctx.fill();
    door(x, y, 14, 24); win(x - 6, y - 70, 12, 14);
    sack(x + 40, y + 4); sack(x + 54, y + 7);
    ctx.save(); ctx.translate(x, y - 100); ctx.rotate(t.ang || 0);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.fillStyle = '#5a3d22'; ctx.fillRect(-2, 0, 4, 66);
      ctx.fillStyle = 'rgba(245,240,225,.92)'; ctx.fillRect(3, 12, 13, 52);
      ctx.strokeStyle = '#5a3d22'; ctx.lineWidth = 1; for (let k = 18; k < 64; k += 8) { ctx.beginPath(); ctx.moveTo(3, k); ctx.lineTo(16, k); ctx.stroke(); }
    }
    ctx.restore();
    ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(x, y - 100, 5, 0, 7); ctx.fill();
  },
  baeckerei(x, y, t) {
    house(x, y, 116, 62, '#c4704f', '#6b3b2a', 30);
    ctx.strokeStyle = 'rgba(90,40,20,.35)'; ctx.lineWidth = 1;
    for (let yy = y - 58; yy < y; yy += 7) { ctx.beginPath(); ctx.moveTo(x - 58, yy); ctx.lineTo(x + 58, yy); ctx.stroke(); }
    ctx.fillStyle = '#7d4632'; ctx.fillRect(x + 28, y - 110, 14, 30);
    win(x - 48, y - 46, 30, 22, t.working); win(x + 18, y - 46, 30, 22, t.working); door(x - 4, y, 18, 32);
    sign(x, y - 66, 'BÄCKEREI 🥨');
  },
  molkerei(x, y, t) {
    for (const [sx, h] of [[34, 96], [58, 84]]) {
      ellipse(x + sx + 4, y, 14, 5, 'rgba(0,0,0,.25)');
      const g = ctx.createLinearGradient(x + sx - 12, 0, x + sx + 12, 0); g.addColorStop(0, '#eef2f5'); g.addColorStop(0.5, '#c3ccd4'); g.addColorStop(1, '#7f8a95');
      ctx.fillStyle = g; ctx.fillRect(x + sx - 12, y - h, 24, h); ellipse(x + sx, y - h, 12, 5, '#dfe5ea');
    }
    house(x - 22, y, 92, 58, '#f4f4ef', '#7d8a96', 26);
    win(x - 58, y - 44, 20, 16); win(x - 22, y - 44, 20, 16); door(x + 10, y, 16, 28, '#4d6a85');
    ctx.strokeStyle = '#8e9aa5'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x + 24, y - 40); ctx.lineTo(x + 34, y - 40); ctx.stroke();
    sign(x - 22, y - 62, 'MOLKEREI 🥛');
  },
  kaeserei(x, y) {
    house(x, y, 104, 62, '#a8743f', '#5b3a1e', 34);
    ctx.strokeStyle = 'rgba(60,35,15,.4)'; ctx.lineWidth = 1;
    for (let xx = x - 50; xx < x + 52; xx += 8) { ctx.beginPath(); ctx.moveTo(xx, y - 62); ctx.lineTo(xx, y); ctx.stroke(); }
    win(x - 40, y - 46, 20, 18); win(x + 20, y - 46, 20, 18); door(x - 4, y, 18, 32);
    for (let i = 0; i < 3; i++) { ellipse(x + 64, y - 4 - i * 9, 14, 6, '#e8b830'); ellipse(x + 64, y - 6 - i * 9, 14, 5, '#f5cf4a'); }
    sign(x, y - 70, 'KÄSEREI 🧀');
  },
  fonduestube(x, y, t) { DECO_DRAW.chalet(x, y, t, t.working); sign(x, y - 66, 'FONDUE-STÜBLI 🍲'); },
  muesli_kueche(x, y, t) {
    house(x, y, 104, 60, '#f3ead2', '#d52b1e', 30); win(x - 40, y - 44, 22, 18, t.working); win(x + 18, y - 44, 22, 18, t.working); door(x - 4, y, 18, 30);
    for (const [ax, c] of [[-56, '#d8332a'], [-46, '#a6c84a'], [52, '#d8332a']]) ellipse(x + ax, y - 4, 5, 5, c);
    sign(x, y - 66, 'MÜESLI 🥗');
  },
  konditorei(x, y, t) {
    house(x, y, 108, 62, '#f6d4dc', '#b05a7a', 30);
    win(x - 46, y - 44, 34, 24, t.working); door(x + 20, y, 18, 32, '#b05a7a');
    ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🥧', x - 29, y - 26);
    awning(x - 29, y - 52, 46, '#b05a7a', '#fff', 5);
    sign(x, y - 68, 'KONDITOREI 🎂');
  },
};
DRAW.default = (x, y, t) => { const d = THINGS[t.type]; house(x, y, 104, 60, '#e8dcc4', '#8a5a3a'); win(x - 40, y - 44, 20, 16, t.working); door(x + 10, y, 18, 30); sign(x, y - 68, d.name.toUpperCase() + ' ' + d.icon); };
const HGT = { fonduestube: 105, hof: 112, haendler: 110, laden: 130, muehle: 170, baeckerei: 115, molkerei: 110, kaeserei: 110, konditorei: 110, baum: 92, kuh: 50, feld: 1.5 * T + 8 };
const topOf = t => { const p = pos(t); return p.y - (HGT[t.type] || 110); };

// Werkzeuge am Spieler: Transport immer, Ernte-Werkzeug nur während des Erntens
const harvTool = () => harvest && THINGS[harvest.t.type].tool;
const onTractor = () => G.tools.tragen === 4 && !harvest; // beim Ernten steigt man ab
const liftH = () => harvTool() === 'obst' && G.tools.obst === 3 ? 26 : onTractor() ? 12 : 0;
function wheel(x, y, r) { ctx.fillStyle = '#2b2b2b'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = '#a8a8a8'; ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, 7); ctx.fill(); }
function line(c, w, ...pts) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[0], pts[1]); ctx.stroke(); }
// Lokale Koordinaten: Ursprung an den Füssen, +x = Blickrichtung, y nach oben negativ
function gearBack(D) {
  const ht = harvTool();
  if (ht === 'obst' && G.tools.obst === 2) { // Obstleiter mit drei Beinen
    line('#9b7040', 2.5, 8, 0, 14, -78); line('#9b7040', 2.5, 20, 0, 18, -78); line('#7d5a33', 2, 34, 0, 16, -78);
    for (let y = -10; y > -76; y -= 11) line('#9b7040', 2, 8 - y * 0.077, y, 20 + y * 0.026, y);
  }
  if (ht === 'obst' && G.tools.obst === 3) { // Hebebühne: Scheren-Hub
    const L = D.lift;
    ctx.fillStyle = '#555'; ctx.fillRect(-18, -5, 36, 5); wheel(-13, 0, 3); wheel(13, 0, 3);
    line('#e0b020', 2.5, -14, -5, 14, -L, -14, -L, 14, -5, -14, -5);
    ctx.fillStyle = '#e0b020'; ctx.fillRect(-18, -L - 3, 36, 4);
    line('#e0b020', 2, -18, -L - 3, -18, -L - 20, 18, -L - 20, 18, -L - 3);
  }
}
function gearFront(D) {
  const tr = G.tools.tragen, ht = harvTool(), lv = ht && G.tools[ht], { hx, hy } = D, a = Math.sin(time * 12);
  if (tr === 1) { // Korb in der hinteren Hand
    line('#8a5a2b', 1.5, D.bx - 5, D.hy + 3, D.bx, D.hy - 3, D.bx + 5, D.hy + 3);
    ctx.fillStyle = '#c48a45'; rrect(D.bx - 6, D.hy + 2, 12, 9, 2); ctx.fill(); line('#8a5a2b', 1, D.bx - 6, D.hy + 6, D.bx + 6, D.hy + 6);
  }
  if (tr === 2) { // Schubkarre vorne geschoben
    line('#6b4a2b', 2, hx, hy, hx + 12, -12);
    ctx.fillStyle = '#3d7fc4'; ctx.beginPath(); ctx.moveTo(hx + 6, -22); ctx.lineTo(hx + 36, -24); ctx.lineTo(hx + 29, -10); ctx.lineTo(hx + 11, -10); ctx.fill();
    line('#555', 2, hx + 12, -10, hx + 12, 0); wheel(hx + 28, -5, 5);
  }
  if (ht === 'getreide' && lv === 1) { // Sichel schwingen
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * 0.6);
    line('#6b4a2b', 2.5, 0, 0, 5, 0); ctx.strokeStyle = '#ccd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, 0, 6, Math.PI, Math.PI * 1.9); ctx.stroke(); ctx.restore();
  }
  if (ht === 'getreide' && lv === 2) { // Sense
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * 0.4);
    line('#8a5a2b', 2.5, -2, -16, 5, 14); ctx.strokeStyle = '#ccd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, 14); ctx.quadraticCurveTo(16, 10, 26, 14); ctx.stroke(); ctx.restore();
  }
  if (ht === 'getreide' && lv === 3) { // Motormäher mit zitterndem Mähbalken
    line('#333', 2, hx, hy, hx + 10, -10);
    ctx.fillStyle = '#d33'; ctx.fillRect(hx + 8, -13, 14, 9); wheel(hx + 14, -3, 3);
    const j = Math.sin(time * 60) * 1.5; ctx.fillStyle = '#999'; ctx.fillRect(hx + 20, -4, 24, 3);
    ctx.fillStyle = '#ccd'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(hx + 21 + i * 4 + j, -4); ctx.lineTo(hx + 23 + i * 4 + j, -8); ctx.lineTo(hx + 25 + i * 4 + j, -4); ctx.fill(); }
  }
  if (ht === 'obst' && lv === 1) { // Pflückstange
    const tx = hx + 14, ty = -D.legL - D.torso - 34 + a * 2;
    line('#8a5a2b', 2, hx - 2, hy + 6, tx, ty); ctx.fillStyle = '#c48a45'; rrect(tx - 4, ty - 6, 8, 7, 2); ctx.fill();
  }
  if (ht === 'milch' && lv >= 1) { // Eimer (Schemel) bzw. Melkmaschine
    if (lv === 1) {
      ctx.fillStyle = '#9aa3ad'; ctx.beginPath(); ctx.moveTo(hx + 4, -12); ctx.lineTo(hx + 18, -12); ctx.lineTo(hx + 16, 0); ctx.lineTo(hx + 6, 0); ctx.fill();
      ellipse(hx + 11, -12, 7, 2, '#fff');
    } else {
      ctx.fillStyle = '#b8c0c8'; rrect(hx + 8, -20, 14, 20, 3); ctx.fill();
      ellipse(hx + 15, -15, 2.5, 2.5, a > 0 ? '#4c4' : '#262');
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(hx + 15, -20); ctx.quadraticCurveTo(hx + 22, hy - 6, hx + 2, hy); ctx.stroke();
    }
  }
}

// Gezogener Wagen folgt der Deichsel wie ein echter Anhänger (Schleppkurve):
// Vorderachse hält Abstand zur Kupplung, Hinterachse zur Vorderachse.
const hasCart = () => G.tools.tragen === 3 || onTractor();
const follow = (x, y, tx, ty, d) => { const l = Math.hypot(tx - x, ty - y) || 1; return [tx - (tx - x) / l * d, ty - (ty - y) / l * d]; };
function cartDims(s) { const t = onTractor(); return { k: (t ? 18 : 6) * s, rope: (t ? 10 : 14) * s, L: (t ? 40 : 28) * s, w: (t ? 13 : 9) * s, h: (t ? 9 : 6) * s, wall: (t ? 10 : 8) * s, r: (t ? 7 : 5) * s, t }; }
function trailCart() {
  if (!hasCart()) { cart.on = false; return; }
  const c = cartDims(0.85 + G.stage * 0.09), [ux, uy] = c.t ? [Math.cos(trH), Math.sin(trH)] : [face, 0];
  const hx = G.px - (c.t ? ux : faceS) * c.k, hy = G.py - uy * c.k;
  if (!cart.on || Math.hypot(hx - cart.fx, hy - cart.fy) > 150) // neu angehängt: gerade hinter die Figur
    Object.assign(cart, { on: true, fx: hx - ux * c.rope, fy: hy - uy * c.rope, bx: hx - ux * (c.rope + c.L), by: hy - uy * (c.rope + c.L) });
  [cart.fx, cart.fy] = follow(cart.fx, cart.fy, hx, hy, c.rope);
  [cart.bx, cart.by] = follow(cart.bx, cart.by, cart.fx, cart.fy, c.L);
}
function poly(pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke();
}
function wheelE(cx, cy, r, ux, uy) { // Rad steht parallel zur Fahrtrichtung
  ctx.fillStyle = ctx.strokeStyle = '#2b2b2b'; ctx.lineWidth = 2; ctx.beginPath();
  for (let i = 0; i < 16; i++) { const t = i / 16 * 6.283; ctx.lineTo(cx + Math.cos(t) * r * ux, cy + Math.cos(t) * r * uy * 0.5 - Math.sin(t) * r); }
  ctx.closePath(); ctx.fill(); ctx.stroke();
}
function drawCart(ax, ay, s) {
  const c = cartDims(s), dx = cart.fx - cart.bx, dy = cart.fy - cart.by, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
  const px = -uy * c.w, py = ux * c.w * 0.5; // Querachse, Boden in der Tiefe gestaucht
  const C = [[cart.fx + px, cart.fy + py], [cart.fx - px, cart.fy - py], [cart.bx - px, cart.by - py], [cart.bx + px, cart.by + py]];
  const [col, back, floor] = c.t ? ['#c9a24a', '#a8842f', '#8f6f2a'] : ['#b5523b', '#8f3f2c', '#7a3524'];
  const mx = (cart.fx + cart.bx) / 2, my = (cart.fy + cart.by) / 2;
  ellipse(mx, my, Math.abs(dx) / 2 + c.w, Math.abs(dy) / 2 + c.w * 0.5, 'rgba(0,0,0,.25)');
  const wheels = C.map(([x, y]) => [x, y - c.r]).sort((a, b) => a[1] - b[1]);
  wheels.slice(0, 2).forEach(([x, y]) => wheelE(x, y, c.r, ux, uy));
  const up = o => C.map(([x, y]) => [x, y - o]);
  poly(up(c.h), floor);
  const walls = [0, 1, 2, 3].map(i => [C[i], C[(i + 1) % 4]]).sort((a, b) => a[0][1] + a[1][1] - b[0][1] - b[1][1])
    .map(([p, q]) => [[p[0], p[1] - c.h], [q[0], q[1] - c.h], [q[0], q[1] - c.h - c.wall], [p[0], p[1] - c.h - c.wall]]);
  walls.slice(0, 2).forEach(w => poly(w, back));
  const items = Object.keys(G.inv); // Ladung liegt im Wagen
  if (items.length) { ctx.font = `${11 * s}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(items.map(k => ITEMS[k].icon).join(''), mx, my - c.h - c.wall * 0.2); }
  walls.slice(2).forEach(w => poly(w, col));
  wheels.slice(2).forEach(([x, y]) => wheelE(x, y, c.r, ux, uy));
  line(c.t ? '#555' : '#6b4a2b', 2, cart.fx, cart.fy - c.h, ax, ay); // Deichsel
}
// Traktor in Fahrtrichtung: a = längs (vorne +), b = quer (in der Tiefe gestaucht), z = Höhe.
// Liefert Teile mit Tiefe y, damit sie mit der sitzenden Figur richtig überdecken.
function tractorParts(x, y, s) {
  const ux = Math.cos(trH), uy = Math.sin(trH);
  const P = (a, b, z = 0) => [x + (ux * a - uy * b) * s, y + (uy * a + ux * b * 0.5) * s - z * s];
  const box = (a0, a1, b, z0, h, top, side) => {
    const C = [[a1, b], [a1, -b], [a0, -b], [a0, b]], ring = z => C.map(([a, q]) => P(a, q, z)), lo = ring(z0), hi = ring(z0 + h);
    [0, 1, 2, 3].map(i => [lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]).sort((p, q) => p[0][1] + p[1][1] - q[0][1] - q[1][1]).forEach(w => poly(w, side));
    poly(hi, top);
  };
  const part = (a, b, d) => ({ y: P(a, b)[1], d });
  const whl = (a, b, r) => part(a, b, () => { const [cx, cy] = P(a, b, r); wheelE(cx, cy, r * s, ux, uy); });
  const post = (a, b) => part(a, b, () => line('#3c3c3c', 2.5 * s, ...P(a, b, 15), ...P(a, b, 58)));
  const shadow = { y: -Infinity, d: () => { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); for (const [a, b] of [[-14, 15], [38, 12], [38, -12], [-14, -15]]) ctx.lineTo(...P(a, b)); ctx.fill(); } };
  return [shadow, whl(0, 13, 12), whl(0, -13, 12), whl(30, 9, 7), whl(30, -9, 7),
    part(0, 0, () => box(-9, 7, 9, 8, 7, '#38a35b', '#2f8f4e')), // Sitzkasten
    part(21, 0, () => { box(6, 36, 6, 8, 13, '#38a35b', '#2f8f4e'); line('#333', 2.5 * s, ...P(30, 0, 21), ...P(30, 0, 31 + Math.abs(Math.sin(time * 12)) * 2)); }), // Motorhaube + Auspuff
    post(-8, 9), post(-8, -9), post(6, 9), post(6, -9),
    { y: Infinity, d: () => box(-10, 8, 11, 58, 3, '#38a35b', '#26794a') }]; // Dach
}
// Bein mit Knie (2-Glied-IK): Fuss schwingt nach vorn und hebt dabei ab, Standbein bleibt am Boden
function legDraw(p, L, drop, hipX, col, am) {
  const a = Math.sin(p) * 0.5 * am, fx = hipX + L * Math.sin(a), fy = -Math.max(0, Math.cos(p)) * L * 0.3 * am, hy = -L + drop;
  const vx = fx - hipX, vy = fy - hy, d = Math.hypot(vx, vy), k = Math.sqrt(Math.max(0, L * L / 4 - d * d / 4));
  line(col, 5, hipX, hy, hipX + vx / 2 + vy / d * k, hy + vy / 2 - vx / d * k, fx, fy);
  ctx.fillStyle = '#4a2f1e'; rrect(fx - 3, fy - 3, 8, 3.5, 1.5); ctx.fill();
}
function drawPlayer() {
  const x = G.px, y = G.py, st = G.stage, s = 0.85 + st * 0.09;
  const sx = Math.sign(faceS) * Math.max(0.2, Math.abs(faceS)); // beim Umdrehen kurz schmal (Profil dreht)
  const am = onTractor() ? 0 : amp, sw = Math.sin(walk) * am, leg = -sw * 4; // Arme gegengleich zu den Beinen
  const legL = 13 + st * 2.5, torso = 17 + st * 2, sh = 8 + st * 0.8, headR = 9.5 - st * 0.5, tr = onTractor(), lift = tr ? 15 - legL : liftH(); // auf dem Traktor sitzt der Rumpf auf dem Sitz
  const drop = legL * (1 - Math.cos(sw * 0.5)); // Hüfte sinkt bei gespreizten Beinen
  const D = { legL, torso, sh, headR, lift, hx: sh + 3 + leg * 0.5, hy: -legL - 1, bx: -sh - 3 - leg * 0.5 };
  const anchor = () => tr ? [x - Math.cos(trH) * 18 * s, y - (Math.sin(trH) * 18 + 8) * s] : [x + sx * D.bx * s, y + (D.hy + drop) * s];
  const cartBack = cart.on && (cart.fy + cart.by) / 2 <= y;
  if (!tr) ellipse(x, y, 12 * s, 4 * s, 'rgba(0,0,0,.3)');
  if (cartBack) drawCart(...anchor(), s);
  const fig = () => {
  ctx.save(); ctx.translate(x, y); ctx.scale(s * sx, s);
  gearBack(D); ctx.translate(0, -lift);
  if (!tr) { legDraw(walk + Math.PI, legL, drop, -2, '#28406a', am); legDraw(walk, legL, drop, 2, '#34507f', am); }
  ctx.translate(0, drop);
  const shirt = ['#e8483b', '#2f8f4e', '#3a6fd8', '#6b4fa3', '#4a6274'][st];
  ctx.fillStyle = shirt; rrect(-sh, -legL - torso, sh * 2, torso + 2, 4); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(-sh, -legL - torso + 3, sh * 2, 3);
  // Arme
  ctx.strokeStyle = shirt; ctx.lineWidth = 4.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-sh, -legL - torso + 4); ctx.lineTo(-sh - 3 - leg * 0.5, -legL - 2); ctx.moveTo(sh, -legL - torso + 4); ctx.lineTo(sh + 3 + leg * 0.5, -legL - 2); ctx.stroke();
  ctx.fillStyle = '#f2c9a2'; ctx.beginPath(); ctx.arc(-sh - 3 - leg * 0.5, -legL - 1, 2.6, 0, 7); ctx.arc(sh + 3 + leg * 0.5, -legL - 1, 2.6, 0, 7); ctx.fill();
  // Kopf
  const hy = -legL - torso - headR + 1;
  ctx.fillStyle = '#f2c9a2'; ctx.beginPath(); ctx.arc(0, hy, headR, 0, 7); ctx.fill();
  ctx.fillStyle = '#f2cf5b'; ctx.beginPath(); ctx.arc(0, hy - 1.5, headR + 1, Math.PI * 1.02, Math.PI * 1.98); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-headR - 1, hy - 2); ctx.quadraticCurveTo(-2, hy - 1, 2, hy - 5); ctx.quadraticCurveTo(5, hy - 1, headR + 1, hy - 2); ctx.lineTo(headR, hy - 6); ctx.lineTo(-headR, hy - 6); ctx.fill();
  ctx.fillStyle = '#d9a93a'; ctx.fillRect(-headR + 2, hy - headR + 1, 6, 1.5);
  ctx.fillStyle = '#2a4a7a'; ctx.beginPath(); ctx.arc(1.5, hy + 1, 1.4, 0, 7); ctx.arc(5.5, hy + 1, 1.4, 0, 7); ctx.fill();
  ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(3.5, hy + 3.5, 2.4, 0.2, Math.PI - 0.2); ctx.stroke();
  if (st >= 4) { ctx.fillStyle = 'rgba(220,180,80,.55)'; ctx.beginPath(); ctx.arc(2, hy + 3, headR - 2, 0.1, Math.PI - 0.1); ctx.fill(); }
  gearFront(D);
  ctx.restore();
  };
  if (tr) [...tractorParts(x, y, s), { y: y + 0.01, d: fig }].sort((a, b) => a.y - b.y).forEach(p => p.d());
  else fig();
  if (cart.on && !cartBack) drawCart(...anchor(), s);
  const items = Object.keys(G.inv);
  if (items.length && !cart.on) { ctx.font = `${14 * s}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(items.map(k => ITEMS[k].icon).join(''), x + 16 * s * sx, y - (legL + 6 + liftH()) * s); }
}

// =================== Schweiz: Fahne, Alpen, See, Deko ===================
const FLAG_IMG = (() => { // Schweizer Fahne: quadratisch, weisses Kreuz auf Rot
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#d52b1e'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(26, 12, 12, 40); g.fillRect(12, 26, 40, 12);
  return c;
})();
// x/y = oben am Mast, Tuch weht nach rechts (in Streifen gezeichnet, die sich wellen)
function swissFlag(x, y, s, ph = 0) {
  const n = 12, w = s / n;
  for (let i = 0; i < n; i++) {
    const off = Math.sin(time * 4 + ph - i * 0.55) * s * 0.07 * (i / n), lt = 0.92 + Math.cos(time * 4 + ph - i * 0.55) * 0.1;
    ctx.drawImage(FLAG_IMG, i * 64 / n, 0, 64 / n, 64, x + i * w, y + off, w + 0.7, s);
    ctx.fillStyle = lt > 1 ? `rgba(255,255,255,${(lt - 1) * 1.2})` : `rgba(0,0,0,${(1 - lt) * 1.2})`; ctx.fillRect(x + i * w, y + off, w + 0.7, s);
  }
}
function flagPole(x, y, h, s, ph = 0) {
  line('#cfd3d8', 2.5, x, y, x, y - h); ellipse(x, y - h - 1, 2.6, 2.6, '#e8c35a');
  swissFlag(x + 1, y - h + 2, s, ph);
}

// ---- Alpen-Panorama (Kulisse nördlich der Welt, y < 0) ----
const alps = (() => {
  const Wp = WORLD.w * T, r = seeded(42), step = 12;
  const peaks = (n, hMin, hMax, wMin, wMax) => Array.from({ length: n }, (_, i) => ({ x: (i + 0.15 + r() * 0.7) / n * Wp, h: hMin + r() * (hMax - hMin), wl: wMin + r() * (wMax - wMin), wr: wMin + r() * (wMax - wMin) }));
  const ridge = (pk, base, rough) => {
    const pts = [];
    for (let x = -step; x <= Wp + step; x += step) {
      let h = 0; for (const p of pk) h = Math.max(h, p.h - Math.abs(x - p.x) * p.h / (x < p.x ? p.wl : p.wr));
      pts.push([x, base - h + (r() - 0.5) * rough * Math.min(1, h / 60)]);
    }
    return pts;
  };
  const far = peaks(15, 150, 250, 150, 240), near = peaks(7, 110, 200, 200, 300);
  near.push({ x: Wp * 0.64, h: 300, wl: 120, wr: 210, horn: true }); // das grosse Horn
  const firs = Array.from({ length: 70 }, () => [r() * Wp, r(), 0.5 + r() * 0.45]);
  return { Wp, far, near, farR: ridge(far, -40, 10), nearR: ridge(near, -6, 14), firs, horn: near.at(-1) };
})();
const hillY = x => -34 + 14 * Math.sin(x * 0.0035 + 1) + 8 * Math.sin(x * 0.011 + 2);
function ridgeAt(R, x) { const i = clamp(Math.round((x + 12) / 12), 0, R.length - 1); return R[i][1]; }
function mountainRange(R, pk, base, c1, c2, snowY) {
  const path = () => { ctx.beginPath(); ctx.moveTo(R[0][0], 10); for (const [x, y] of R) ctx.lineTo(x, y); ctx.lineTo(R.at(-1)[0], 10); ctx.closePath(); };
  const g = ctx.createLinearGradient(0, -ALPS * T, 0, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = 'rgba(20,30,50,.16)'; // Schattenseite (Licht von links)
  for (const p of pk) { ctx.beginPath(); ctx.moveTo(p.x, base - p.h); ctx.lineTo(p.x + p.wr, base); ctx.lineTo(p.x + p.wr * 0.15, base); ctx.closePath(); ctx.fill(); }
  ctx.fillStyle = '#f7fbff'; ctx.beginPath(); ctx.moveTo(-20, -ALPS * T - 10); // Schnee oberhalb der Schneegrenze
  for (let x = -20; x <= alps.Wp + 20; x += 16) ctx.lineTo(x, snowY + Math.sin(x * 0.05) * 9 + Math.sin(x * 0.13) * 6);
  ctx.lineTo(alps.Wp + 20, -ALPS * T - 10); ctx.fill();
  ctx.fillStyle = 'rgba(120,150,190,.28)';
  for (const p of pk) { ctx.beginPath(); ctx.moveTo(p.x, base - p.h); ctx.lineTo(p.x + p.wr, base); ctx.lineTo(p.x + p.wr * 0.15, base); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawAlps() {
  const top = -ALPS * T, Wp = alps.Wp;
  let g = ctx.createLinearGradient(0, top, 0, -20); g.addColorStop(0, '#6fbcf0'); g.addColorStop(1, '#d9f0fb');
  ctx.fillStyle = g; ctx.fillRect(0, top, Wp, -top + 2);
  for (let i = 0; i < 7; i++) { // Wolken
    const cx = ((time * (6 + i) + i * 523) % (Wp + 300)) - 150, cy = top + 40 + (i * 37) % 90;
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (const [dx, dy, rr] of [[0, 0, 22], [22, 4, 17], [-22, 5, 16], [10, -10, 16]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, rr, 0, 7); ctx.fill(); }
  }
  mountainRange(alps.farR, alps.far, -40, '#9db3cf', '#7f97b5', -180);
  mountainRange(alps.nearR, alps.near, -6, '#8a8f99', '#6c7a6c', -175);
  const h = alps.horn; flagPole(h.x, -6 - h.h + 4, 26, 14, 1); // Gipfelfahne
  // Alpwiesen-Hügel, nahtlos ins Gras
  ctx.beginPath(); ctx.moveTo(0, 14); for (let x = 0; x <= Wp; x += 16) ctx.lineTo(x, hillY(x)); ctx.lineTo(Wp, 14); ctx.closePath();
  ctx.fillStyle = grassPat; ctx.fill();
  g = ctx.createLinearGradient(0, -50, 0, 0); g.addColorStop(0, 'rgba(40,80,30,.25)'); g.addColorStop(1, 'rgba(40,80,30,0)'); ctx.fillStyle = g; ctx.fill();
  // Bergsee in der Alp
  const bx = Wp * 0.3, by = hillY(Wp * 0.3) + 16;
  ellipse(bx, by, 74, 11, '#d9c89a'); ellipse(bx, by, 68, 8.5, '#3fb6c7'); ellipse(bx - 14, by - 2, 30, 2.5, 'rgba(255,255,255,.35)');
  for (const [fx, fy, fs] of alps.firs) { const y = hillY(fx) + 6 + fy * 18; if (Math.abs(fx - bx) > 90 || y < by - 14) tanne(fx, y, fs); }
  if (G.deco.some(d => d.type === 'gondelbahn')) gondola();
}
function gondola() {
  const bx = 34 * T, by = 1.6 * T, tx = 40.5 * T, ty = ridgeAt(alps.nearR, 40.5 * T) + 34;
  const station = (x, y, w) => { ellipse(x + 4, y, w / 2 + 6, 5, 'rgba(0,0,0,.2)'); ctx.fillStyle = '#c8c2b6'; ctx.fillRect(x - w / 2, y - 24, w, 24); ctx.fillStyle = '#d52b1e'; ctx.fillRect(x - w / 2 - 4, y - 30, w + 8, 7); ctx.fillStyle = '#3d4b5c'; ctx.fillRect(x - 8, y - 18, 16, 18); };
  station(tx, ty, 40); line('#666', 4, bx + 6, by, bx + 6, by - 50);
  for (const o of [-3, 3]) line('#3a3a3a', 1.2, bx + 6, by - 44 + o, tx, ty - 22 + o);
  station(bx, by, 46);
  for (const [u0, o] of [[0, -3], [0.5, 3]]) { // zwei Gondeln, eine rauf, eine runter
    const u = (Math.sin(time * 0.18 + u0 * Math.PI * 2) + 1) / 2, x = bx + 6 + (tx - bx - 6) * u, y = by - 44 + o + (ty - 22 - by + 44) * u;
    line('#333', 1.5, x, y, x, y + 10);
    ctx.fillStyle = '#d52b1e'; rrect(x - 9, y + 10, 18, 14, 4); ctx.fill();
    ctx.fillStyle = '#cfe8f5'; ctx.fillRect(x - 6, y + 13, 12, 5);
  }
}
function tanne(x, y, s = 1) {
  ellipse(x + 3 * s, y, 13 * s, 4 * s, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 2.5 * s, y - 9 * s, 5 * s, 9 * s);
  for (let i = 0; i < 4; i++) {
    const w = (17 - i * 3.5) * s, yb = y - (6 + i * 11) * s, ht = 17 * s;
    const g = ctx.createLinearGradient(x - w, 0, x + w, 0); g.addColorStop(0, '#3f7a3a'); g.addColorStop(1, '#1f4a26');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - w, yb); ctx.lineTo(x, yb - ht); ctx.lineTo(x + w, yb); ctx.closePath(); ctx.fill();
  }
}

// ---- See ----
function lakePath(m) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, rr = LAKE.rx * lakeR(a) + m; ctx.lineTo((LAKE.x + Math.cos(a) * rr) * T, (LAKE.y + Math.sin(a) * rr * LAKE.ry / LAKE.rx) * T); }
  ctx.closePath();
}
function drawLake() {
  const cx = LAKE.x * T, cy = LAKE.y * T;
  lakePath(0.45); ctx.fillStyle = '#dccb98'; ctx.fill();
  lakePath(0.12); ctx.fillStyle = '#8fc7d8'; ctx.fill();
  const g = ctx.createRadialGradient(cx - 40, cy - 20, 10, cx, cy, LAKE.rx * T); g.addColorStop(0, '#4fb0e0'); g.addColorStop(1, '#2a70ad');
  lakePath(0); ctx.fillStyle = g; ctx.fill();
  ctx.save(); lakePath(0); ctx.clip();
  // Spiegelung der Berge und kleine Wellen
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(cx - 60, cy - 50, 120, 22, -0.1, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; const r = seeded(11);
  for (let i = 0; i < 26; i++) {
    const wx = cx + (r() - 0.5) * LAKE.rx * 2 * T, wy = cy + (r() - 0.5) * LAKE.ry * 2 * T, k = (time * 0.4 + r()) % 1;
    ctx.globalAlpha = Math.sin(k * Math.PI); ctx.beginPath(); ctx.arc(wx, wy, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.arc(wx + 12, wy, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();
  // Schilf am Ufer
  for (const a of [2.4, 2.6, 0.5, 0.65, 4.1]) {
    const rr = LAKE.rx * lakeR(a) - 0.1, x = (LAKE.x + Math.cos(a) * rr) * T, y = (LAKE.y + Math.sin(a) * rr * LAKE.ry / LAKE.rx) * T;
    for (let i = 0; i < 6; i++) { const sx = x + i * 4 - 10, sw = Math.sin(time * 1.6 + i) * 2; line('#5f8a3a', 1.6, sx, y + 4, sx + sw, y - 16 - (i % 3) * 4); ellipse(sx + sw, y - 16 - (i % 3) * 4, 1.6, 4, '#7a4e2a'); }
  }
  // Steg
  const sx = (LAKE.x - 3.2) * T, sy = (LAKE.y + 2.9) * T;
  ctx.fillStyle = '#8a5a2b'; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 14 + i * 2, sy - 58 + i * 10, 26, 7);
  ctx.fillStyle = '#5b3a1e'; for (const [px, py] of [[-14, -54], [12, -54], [-4, 2], [22, 2]]) ctx.fillRect(sx + px, sy + py, 3, 10);
  label(cx, cy + LAKE.ry * T + 30, `${P.name}see`, 14);
}
function lakeDecos() {
  const L = G.deco.filter(d => DECOS[d.type].where === 'see').map(d => {
    const sp = { schwan: 0.06, segelboot: 0.09, dampfschiff: 0.035 }[d.type], dir = d.id % 2 ? 1 : -1, k = 0.3 + (d.id * 0.37) % 0.42;
    const a = time * sp * dir + d.id * 1.7;
    return { d, x: (LAKE.x + Math.cos(a) * LAKE.rx * k) * T, y: (LAKE.y + Math.sin(a) * LAKE.ry * k) * T + 6, f: -Math.sin(a) * dir >= 0 ? 1 : -1 };
  }).sort((a, b) => a.y - b.y);
  for (const o of L) { ctx.save(); ctx.translate(o.x, o.y + Math.sin(time * 2 + o.d.id) * 1.2); ctx.scale(o.f, 1); DECO_DRAW[o.d.type](0, 0, o.d); ctx.restore(); }
}
function balloons() {
  const Wp = alps.Wp;
  for (const d of G.deco) {
    if (d.type !== 'ballon') continue;
    const x = ((time * 13 + d.id * 977) % (Wp + 600)) - 300, gy = (5 + (d.id * 13) % 32) * T, y = gy - 210 - Math.sin(time * 0.5 + d.id) * 18;
    ellipse(x, gy, 26, 8, 'rgba(0,0,0,.13)');
    DECO_DRAW.ballon(x, y, d);
  }
}

// ---- Deko-Zeichnungen (x/y = Fusspunkt) ----
const DECO_DRAW = {
  steinmann(x, y) {
    ellipse(x + 3, y, 14, 4, 'rgba(0,0,0,.22)');
    for (const [dx, dy, rx, ry, c] of [[0, -4, 12, 5, '#8d8d86'], [1, -12, 9.5, 4.5, '#a3a39b'], [-1, -19.5, 7.5, 4, '#7f8079'], [1, -25.5, 5.5, 3.2, '#9c9c94'], [0, -30.5, 3.5, 2.4, '#b0b0a8']]) {
      ellipse(x + dx, y + dy, rx, ry, c); ellipse(x + dx - rx * 0.3, y + dy - ry * 0.4, rx * 0.4, ry * 0.3, 'rgba(255,255,255,.3)');
    }
  },
  gartenzwerg(x, y, o) {
    ellipse(x + 2, y, 10, 3, 'rgba(0,0,0,.25)');
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 6, y - 4, 5, 4); ctx.fillRect(x + 1, y - 4, 5, 4);
    ctx.fillStyle = '#3a6fd8'; rrect(x - 7, y - 17, 14, 14, 4); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 7, y - 10, 14, 2.5);
    ellipse(x, y - 22, 6, 6, '#f2c9a2');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 6, y - 21); ctx.lineTo(x + 6, y - 21); ctx.lineTo(x, y - 9); ctx.fill(); // Bart
    ellipse(x, y - 21, 2, 1.6, '#e8a0a0');
    const blink = (time + o.id) % 4 < 0.15;
    ctx.fillStyle = '#222'; if (blink) ctx.fillRect(x - 3.5, y - 24, 2.4, 0.8); else ellipse(x - 2.3, y - 24, 0.9, 0.9, '#222'); ellipse(x + 2.3, y - 24, 0.9, 0.9, '#222');
    ctx.fillStyle = '#d52b1e'; ctx.beginPath(); ctx.moveTo(x - 7, y - 26); ctx.lineTo(x + 7, y - 26); ctx.lineTo(x + 3, y - 44); ctx.closePath(); ctx.fill();
  },
  tanne(x, y) { tanne(x, y, 1.6); },
  wegweiser(x, y) {
    ellipse(x + 2, y, 8, 3, 'rgba(0,0,0,.22)');
    line('#b9bfc6', 3, x, y, x, y - 54);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y - 20, 3, 3); ctx.fillStyle = '#d52b1e'; ctx.fillRect(x - 1.5, y - 17, 3, 3); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.5, y - 14, 3, 3);
    const arrow = (yy, dir, txt) => {
      const x0 = x, x1 = x + dir * 52; ctx.fillStyle = '#f5c400'; ctx.beginPath();
      ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.lineTo(x1 + dir * 6, yy + 5); ctx.lineTo(x1, yy + 10); ctx.lineTo(x0, yy + 10); ctx.fill();
      ctx.fillStyle = '#222'; ctx.font = '700 6.5px system-ui'; ctx.textAlign = 'center'; ctx.fillText(txt, (x0 + x1) / 2, yy + 7.5);
    };
    arrow(y - 54, 1, `${P.name}see 5 min`); arrow(y - 42, -1, 'Alp 2 h 30 min');
  },
  edelweiss(x, y, o) {
    ellipse(x + 2, y, 18, 5, 'rgba(0,0,0,.15)'); ellipse(x, y - 2, 17, 5, '#7c8f6a');
    const r = seeded(o.id * 3 + 1);
    for (let i = 0; i < 6; i++) {
      const fx = x + (r() - 0.5) * 26, fy = y - 5 - r() * 9;
      line('#8fa07c', 1.3, fx, y - 2, fx, fy);
      ctx.fillStyle = '#f4f4ee'; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.283 + time * 0.2 * 0; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * 3.2, fy + Math.sin(a) * 2.6, 2.4, 1.2, a, 0, 7); ctx.fill(); }
      ellipse(fx, fy, 1.6, 1.4, '#e8d36a');
    }
  },
  schneemann(x, y) {
    ellipse(x + 3, y, 16, 5, 'rgba(0,0,0,.2)');
    for (const [dy, rr] of [[-13, 14], [-34, 10.5], [-50, 7.5]]) { const g = ctx.createRadialGradient(x - rr * 0.4, y + dy - rr * 0.4, 1, x, y + dy, rr); g.addColorStop(0, '#fff'); g.addColorStop(1, '#cfdbe6'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y + dy, rr, 0, 7); ctx.fill(); }
    line('#6b4a2b', 1.6, x - 9, y - 36, x - 22, y - 46); line('#6b4a2b', 1.6, x + 9, y - 36, x + 22, y - 44 + Math.sin(time * 3) * 3); // winkt
    ctx.fillStyle = '#d52b1e'; ctx.fillRect(x - 8, y - 44, 16, 4); ctx.fillRect(x + 3, y - 44, 4, 10); // Schal
    ctx.fillStyle = '#222'; for (const dy of [-38, -32, -26]) { ctx.beginPath(); ctx.arc(x, y + dy, 1.4, 0, 7); ctx.fill(); }
    ellipse(x - 2.5, y - 52, 1.1, 1.1, '#222'); ellipse(x + 2.5, y - 52, 1.1, 1.1, '#222');
    ctx.fillStyle = '#f08a24'; ctx.beginPath(); ctx.moveTo(x, y - 50); ctx.lineTo(x + 10, y - 48.5); ctx.lineTo(x, y - 47.5); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(x - 8, y - 58, 16, 2.5); ctx.fillRect(x - 5, y - 68, 10, 10);
  },
  fahne(x, y, o) { ellipse(x + 3, y, 8, 3, 'rgba(0,0,0,.25)'); ctx.fillStyle = '#9a9a92'; ctx.fillRect(x - 4, y - 4, 8, 4); flagPole(x, y - 2, 74, 28, o.id); },
  murmeltier(x, y, o) {
    ellipse(x, y - 1, 18, 6, '#8a6a43'); ellipse(x, y - 2, 10, 3.5, '#2b1d10');
    const ph = (time * 0.32 + o.id * 0.37) % 1, up = ph < 0.6 ? Math.pow(Math.sin(ph / 0.6 * Math.PI), 0.4) : 0;
    if (up > 0.02) {
      ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y - 60, 40, 58); ctx.clip();
      const by = y - 2 + 26 * (1 - up);
      ellipse(x, by - 12, 7.5, 12, '#a07848'); ellipse(x, by - 9, 4.5, 8, '#d9b98a');
      ellipse(x, by - 25, 6, 5.5, '#a07848'); ellipse(x - 4.5, by - 29, 1.8, 1.8, '#6b4a2b'); ellipse(x + 4.5, by - 29, 1.8, 1.8, '#6b4a2b');
      ellipse(x - 2.2, by - 26, 1, 1, '#111'); ellipse(x + 2.2, by - 26, 1, 1, '#111'); ellipse(x, by - 23, 1.5, 1, '#3a2a1a');
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 1.2, by - 22, 2.4, 2);
      ellipse(x - 4, by - 15, 2, 1.5, '#6b4a2b'); ellipse(x + 4, by - 15, 2, 1.5, '#6b4a2b'); // Pfötchen
      ctx.restore();
      if (up > 0.95 && ph > 0.25 && ph < 0.35) label(x + 14, y - 34, '!', 14);
    }
    ctx.fillStyle = '#8a6a43'; ctx.beginPath(); ctx.ellipse(x, y - 1, 11, 3.5, 0, 0, Math.PI); ctx.fill();
  },
  alphorn(x, y, o) {
    ellipse(x + 30, y, 44, 6, 'rgba(0,0,0,.2)');
    const sw = Math.sin(time * 1.4 + o.id) * 1.5;
    // Horn: langer Holz-Trichter bis auf den Boden
    ctx.strokeStyle = '#8a5a2b'; ctx.lineCap = 'round';
    for (const [w, c] of [[4.5, '#7a4a20'], [3, '#b07a42']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x + 5, y - 35 + sw); ctx.lineTo(x + 58, y - 8); ctx.stroke(); }
    ctx.fillStyle = '#9b6a3a'; ctx.beginPath(); ctx.moveTo(x + 54, y - 10); ctx.quadraticCurveTo(x + 64, y - 4, x + 66, y - 16); ctx.lineTo(x + 74, y - 14); ctx.quadraticCurveTo(x + 72, y + 1, x + 56, y - 3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d52b1e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 52, y - 10); ctx.lineTo(x + 55, y - 4); ctx.stroke();
    // Bläser in Tracht
    ctx.fillStyle = '#2b2b2b'; ctx.fillRect(x - 6, y - 16, 5, 9); ctx.fillRect(x + 1, y - 16, 5, 9);
    ctx.fillStyle = '#eee'; ctx.fillRect(x - 6, y - 7, 5, 6); ctx.fillRect(x + 1, y - 7, 5, 6);
    ctx.fillStyle = '#222'; ctx.fillRect(x - 7, y - 2, 6, 2.5); ctx.fillRect(x + 1, y - 2, 6, 2.5);
    ctx.fillStyle = '#2f5ea8'; rrect(x - 8, y - 33, 16, 18, 4); ctx.fill(); // Edelweiss-Hemd
    ctx.fillStyle = '#fff'; for (const [a, b] of [[-4, -29], [3, -25], [-3, -20], [4, -19]]) ctx.fillRect(x + a, y + b, 1.6, 1.6);
    ctx.fillStyle = '#222'; ctx.fillRect(x - 8, y - 33, 4, 18); ctx.fillRect(x + 4, y - 33, 4, 18); // Weste
    line('#2f5ea8', 3.5, x + 6, y - 30, x + 12, y - 27 + sw * 0.5);
    ellipse(x + 1, y - 40 + sw, 6.5, 6.5, '#f2c9a2');
    ellipse(x + 4, y - 37 + sw, 3, 2.5, '#f2a0a0'); // Backen voller Luft
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x - 7, y - 47 + sw, 15, 2.5); ctx.fillRect(x - 4, y - 52 + sw, 9, 5);
  },
  bernhardiner(x, y, o) {
    ellipse(x + 2, y, 26, 6, 'rgba(0,0,0,.22)');
    const wag = Math.sin(time * 9 + o.id) * 0.5;
    ctx.save(); ctx.translate(x - 20, y - 22); ctx.rotate(-0.9 + wag); line('#a0582a', 4, 0, 0, 0, -12); ctx.restore();
    ctx.fillStyle = '#f4ede0'; for (const lx of [-15, -9, 10, 16]) ctx.fillRect(x + lx - 2.5, y - 12, 5, 12);
    ellipse(x, y - 20, 22, 11, '#f4ede0'); ellipse(x - 6, y - 23, 12, 7, '#a0582a'); ellipse(x + 10, y - 24, 6, 5, '#a0582a');
    ellipse(x + 22, y - 32, 10, 9, '#a0582a'); ellipse(x + 27, y - 28, 6.5, 5, '#f4ede0'); ctx.fillStyle = '#f4ede0'; ctx.fillRect(x + 21, y - 41, 3, 10);
    ellipse(x + 15, y - 30, 4, 8, '#6b3a1a'); ellipse(x + 32, y - 29, 2, 1.6, '#222'); ellipse(x + 24, y - 34, 1.4, 1.4, '#222');
    const tg = (time * 0.8 + o.id) % 3 < 0.8; if (tg) ellipse(x + 30, y - 24, 2, 3, '#e8708a'); // Zunge
    ctx.fillStyle = '#7a4a20'; rrect(x + 14, y - 22, 12, 8, 2); ctx.fill(); ctx.fillStyle = '#c9a227'; ctx.fillRect(x + 16, y - 22, 1.5, 8); ctx.fillRect(x + 22, y - 22, 1.5, 8); // Fässchen
  },
  fondue_tisch(x, y) {
    ellipse(x + 4, y, 40, 7, 'rgba(0,0,0,.2)');
    ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 34, y - 10, 68, 4); ctx.fillRect(x - 32, y - 6, 3, 6); ctx.fillRect(x + 29, y - 6, 3, 6); // Bank
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 24, y - 22, 3, 22); ctx.fillRect(x + 21, y - 22, 3, 22);
    ctx.fillStyle = '#a8743f'; ctx.fillRect(x - 30, y - 26, 60, 5);
    ctx.fillStyle = '#d23b2b'; for (let i = 0; i < 6; i++) ctx.fillRect(x - 30 + i * 10, y - 26, 5, 5); // Tischtuch kariert
    ctx.fillStyle = '#333'; ctx.fillRect(x - 6, y - 30, 12, 4);
    ellipse(x, y - 36, 10, 6.5, '#c0392b'); ellipse(x, y - 41, 9, 2.6, '#f2d36b'); // Caquelon mit Käse
    ctx.fillStyle = '#d9a95a'; for (const [a, b] of [[-22, -30], [-16, -29], [16, -30], [22, -29]]) ctx.fillRect(x + a, y + b, 4, 3.5);
    line('#999', 1, x - 4, y - 42, x - 16, y - 54); line('#999', 1, x + 3, y - 42, x + 14, y - 56);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const k = (time * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k; ctx.beginPath(); ctx.moveTo(x - 4 + i * 4, y - 44 - k * 22); ctx.quadraticCurveTo(x + 2 + i * 4 + Math.sin(time * 3 + i) * 4, y - 50 - k * 22, x - 2 + i * 4, y - 56 - k * 22); ctx.stroke(); }
    ctx.globalAlpha = 1;
  },
  brunnen(x, y, o) {
    ellipse(x + 4, y, 40, 7, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#a7a59c'; ctx.fillRect(x - 17, y - 54, 10, 40); ctx.fillStyle = '#c4c2b8'; ctx.fillRect(x - 17, y - 54, 4, 40);
    ellipse(x - 12, y - 56, 7, 3, '#8f8d85'); flagPole(x - 12, y - 56, 18, 11, o.id);
    line('#8a8f96', 2.5, x - 7, y - 42, x + 2, y - 42);
    let g = ctx.createLinearGradient(0, y - 20, 0, y); g.addColorStop(0, '#c9c7bd'); g.addColorStop(1, '#8f8d85');
    ctx.fillStyle = g; rrect(x - 34, y - 20, 68, 20, 4); ctx.fill();
    ctx.fillStyle = '#5aa8d8'; rrect(x - 30, y - 20, 60, 5, 2); ctx.fill();
    ctx.strokeStyle = 'rgba(160,210,240,.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]); ctx.lineDashOffset = -time * 30;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 42); ctx.quadraticCurveTo(x + 12, y - 40, x + 12, y - 18); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; const k = (time * 1.5) % 1; ctx.beginPath(); ctx.ellipse(x + 12, y - 17.5, 4 + k * 10, 1.2 + k * 1.5, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = '#4f8a2f'; ctx.fillRect(x - 32, y - 14, 18, 5); ctx.fillStyle = '#e8483b'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(x - 30 + i * 3.5, y - 15, 2, 0, 7); ctx.fill(); }
  },
  chalet(x, y, o, lit) {
    ellipse(x + 8, y, 72, 10, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#ece6da'; ctx.fillRect(x - 56, y - 18, 112, 18); // Steinsockel
    ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.strokeRect(x - 56, y - 18, 112, 18);
    const g = ctx.createLinearGradient(x - 56, 0, x + 56, 0); g.addColorStop(0, '#8a5530'); g.addColorStop(1, '#5f3a1e');
    ctx.fillStyle = g; ctx.fillRect(x - 56, y - 62, 112, 44);
    ctx.beginPath(); ctx.moveTo(x - 56, y - 62); ctx.lineTo(x, y - 92); ctx.lineTo(x + 56, y - 62); ctx.fill(); // Giebel
    ctx.strokeStyle = 'rgba(30,15,5,.35)'; for (let yy = y - 58; yy > y - 90; yy -= 6) { ctx.beginPath(); ctx.moveTo(x - 56, yy); ctx.lineTo(x + 56, yy); ctx.stroke(); }
    ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(x - 74, y - 56); ctx.lineTo(x, y - 100); ctx.lineTo(x + 74, y - 56); ctx.lineTo(x + 68, y - 52); ctx.lineTo(x, y - 92); ctx.lineTo(x - 68, y - 52); ctx.closePath(); ctx.fill(); // weites Dach
    for (const wx of [-36, 18]) { ctx.fillStyle = '#fff'; ctx.fillRect(x + wx - 2, y - 52, 22, 20); win(x + wx, y - 50, 18, 16, lit); ctx.fillStyle = '#3d7a3a'; ctx.fillRect(x + wx - 7, y - 52, 5, 20); ctx.fillRect(x + wx + 20, y - 52, 5, 20); }
    win(x - 7, y - 82, 14, 12, lit);
    ctx.fillStyle = '#7a4a26'; ctx.fillRect(x - 58, y - 32, 116, 4); for (let bx = x - 56; bx <= x + 56; bx += 8) ctx.fillRect(bx, y - 32, 2.5, 10); ctx.fillRect(x - 58, y - 23, 116, 2.5); // Balkon
    ctx.fillStyle = '#3d7a3a'; ctx.fillRect(x - 56, y - 36, 112, 4);
    ctx.fillStyle = '#e8303a'; for (let i = 0; i < 22; i++) { ctx.beginPath(); ctx.arc(x - 54 + i * 5.1, y - 37 - (i % 2) * 1.5, 2.3, 0, 7); ctx.fill(); } // Geranien
    door(x, y, 16, 18, '#5b3a1e');
    ctx.fillStyle = '#7d7468'; ctx.fillRect(x + 34, y - 104, 9, 20);
    flagPole(x + 64, y, 72, 18, o.id || 0);
  },
  uhrturm(x, y, o) {
    ellipse(x + 6, y, 30, 7, 'rgba(0,0,0,.24)');
    const g = ctx.createLinearGradient(x - 20, 0, x + 20, 0); g.addColorStop(0, '#ebe0c8'); g.addColorStop(1, '#b8a888');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 21, y); ctx.lineTo(x - 18, y - 124); ctx.lineTo(x + 18, y - 124); ctx.lineTo(x + 21, y); ctx.fill();
    ctx.fillStyle = '#5b3a1e'; ctx.beginPath(); ctx.moveTo(x - 7, y); ctx.lineTo(x - 7, y - 16); ctx.arc(x, y - 16, 7, Math.PI, 0); ctx.lineTo(x + 7, y); ctx.fill();
    win(x - 4, y - 52, 8, 12); win(x - 4, y - 76, 8, 12);
    ctx.fillStyle = '#8e3a2a'; ctx.beginPath(); ctx.moveTo(x - 24, y - 122); ctx.lineTo(x, y - 168); ctx.lineTo(x + 24, y - 122); ctx.closePath(); ctx.fill(); // Spitzdach
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.moveTo(x, y - 168); ctx.lineTo(x + 24, y - 122); ctx.lineTo(x, y - 122); ctx.fill();
    flagPole(x, y - 166, 16, 12, o.id);
    const cy = y - 103; // Zifferblatt mit echter Uhrzeit
    ellipse(x, cy, 14, 14, '#2a3a5a'); ellipse(x, cy, 12, 12, '#fffaf0');
    ctx.fillStyle = '#c9a227'; for (let i = 0; i < 12; i++) { const a = i / 6 * Math.PI; ctx.beginPath(); ctx.arc(x + Math.sin(a) * 10, cy - Math.cos(a) * 10, i % 3 ? 0.8 : 1.4, 0, 7); ctx.fill(); }
    const now = new Date(), m = now.getMinutes() + now.getSeconds() / 60, hh = (now.getHours() % 12) + m / 60;
    line('#222', 2, x, cy, x + Math.sin(hh / 6 * Math.PI) * 6, cy - Math.cos(hh / 6 * Math.PI) * 6);
    line('#222', 1.3, x, cy, x + Math.sin(m / 30 * Math.PI) * 9.5, cy - Math.cos(m / 30 * Math.PI) * 9.5);
    line('#d52b1e', 0.8, x, cy, x + Math.sin(now.getSeconds() / 30 * Math.PI) * 10, cy - Math.cos(now.getSeconds() / 30 * Math.PI) * 10);
    ellipse(x, cy, 1.5, 1.5, '#d52b1e');
  },
  // --- auf dem See (lokale Koordinaten, Blick nach rechts) ---
  schwan(x, y) {
    ellipse(x, y, 12, 3, 'rgba(255,255,255,.35)');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 12, y - 4); ctx.quadraticCurveTo(x - 14, y - 12, x - 4, y - 9); ctx.quadraticCurveTo(x + 8, y - 10, x + 8, y - 3); ctx.quadraticCurveTo(x, y + 1, x - 12, y - 4); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(x + 5, y - 6); ctx.quadraticCurveTo(x + 12, y - 12, x + 6, y - 18); ctx.quadraticCurveTo(x + 4, y - 23, x + 9, y - 23); ctx.stroke();
    ctx.fillStyle = '#f08a24'; ctx.beginPath(); ctx.moveTo(x + 10, y - 24); ctx.lineTo(x + 15, y - 22); ctx.lineTo(x + 10, y - 21.5); ctx.fill();
    ellipse(x + 9, y - 23.5, 0.8, 0.8, '#111');
  },
  segelboot(x, y) {
    ellipse(x, y + 1, 24, 4, 'rgba(255,255,255,.3)');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 20, y - 8); ctx.lineTo(x + 22, y - 8); ctx.lineTo(x + 14, y); ctx.lineTo(x - 16, y); ctx.fill();
    ctx.fillStyle = '#3d6b8f'; ctx.fillRect(x - 18, y - 5, 36, 2);
    line('#6b4a2b', 1.8, x, y - 8, x, y - 50);
    ctx.fillStyle = '#fbf6ea'; ctx.beginPath(); ctx.moveTo(x + 1.5, y - 48); ctx.quadraticCurveTo(x + 18, y - 30, x + 20, y - 11); ctx.lineTo(x + 1.5, y - 11); ctx.fill();
    ctx.fillStyle = '#d52b1e'; ctx.beginPath(); ctx.moveTo(x - 1.5, y - 42); ctx.lineTo(x - 1.5, y - 11); ctx.lineTo(x - 15, y - 11); ctx.fill();
    swissFlag(x, y - 57, 7, 0);
  },
  dampfschiff(x, y, o) {
    ellipse(x, y + 2, 54, 6, 'rgba(255,255,255,.3)');
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 50, y - 12); ctx.lineTo(x + 54, y - 12); ctx.lineTo(x + 44, y); ctx.lineTo(x - 46, y); ctx.fill();
    ctx.fillStyle = '#2a3a5a'; ctx.fillRect(x - 47, y - 4, 92, 3);
    ctx.fillStyle = '#f4f1e8'; ctx.fillRect(x - 38, y - 24, 72, 12); ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 40, y - 26, 76, 3);
    ctx.fillStyle = '#8fc0e0'; for (let i = 0; i < 8; i++) ctx.fillRect(x - 34 + i * 8.5, y - 21, 5, 6);
    ctx.fillStyle = '#e8e3d6'; ctx.beginPath(); ctx.arc(x - 4, y - 10, 13, Math.PI, 0); ctx.fill(); // Radkasten
    ctx.strokeStyle = '#7a4e2a'; ctx.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = Math.PI + i / 5 * Math.PI; ctx.beginPath(); ctx.moveTo(x - 4, y - 10); ctx.lineTo(x - 4 + Math.cos(a) * 13, y - 10 + Math.sin(a) * 13); ctx.stroke(); }
    ctx.fillStyle = '#e8b830'; ctx.fillRect(x + 8, y - 44, 8, 18); ctx.fillStyle = '#222'; ctx.fillRect(x + 8, y - 46, 8, 3);
    for (let i = 0; i < 4; i++) { const k = (time * 0.4 + i / 4) % 1; ellipse(x + 12 - k * 30, y - 50 - k * 22, 4 + k * 8, 3 + k * 6, `rgba(90,90,90,${0.5 * (1 - k)})`); }
    line('#666', 1.2, x - 48, y - 12, x - 48, y - 30); swissFlag(x - 48, y - 30, 10, o.id);
  },
  ballon(x, y, o) {
    const R = 30;
    line('#7a4e2a', 1, x - 14, y + 26, x - 7, y + 46); line('#7a4e2a', 1, x + 14, y + 26, x + 7, y + 46);
    ctx.fillStyle = '#9b6a3a'; rrect(x - 8, y + 44, 16, 12, 2); ctx.fill(); ctx.fillStyle = '#7a4e2a'; ctx.fillRect(x - 8, y + 44, 16, 2.5);
    if ((time + o.id) % 5 < 0.6) { ellipse(x, y + 36, 3, 6, '#ffb52e'); ellipse(x, y + 38, 1.6, 3, '#fff3b0'); }
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, R, Math.PI * 0.85, Math.PI * 0.15); ctx.quadraticCurveTo(x + R * 0.75, y + R * 0.9, x + 8, y + 30); ctx.lineTo(x - 8, y + 30); ctx.quadraticCurveTo(x - R * 0.75, y + R * 0.9, x - R * Math.cos(Math.PI * 0.15), y + R * Math.sin(Math.PI * 0.15)); ctx.closePath();
    ctx.fillStyle = '#d52b1e'; ctx.fill(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.95)'; for (const dx of [-24, 18]) ctx.fillRect(x + dx, y - R, 6, R * 2.2);
    ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 14, 8, 24); ctx.fillRect(x - 12, y - 6, 24, 8);
    const g = ctx.createRadialGradient(x - 12, y - 14, 2, x, y, R * 1.2); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2.2);
    ctx.restore();
  },
};

function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  calcZoom();
  const vw = W / ZOOM, vh = H / ZOOM, cam = (p, v, w) => v >= w ? (w - v) / 2 : clamp(p - v / 2, 0, w - v); // kleiner als Bildschirm: mittig
  const camX = cam(G.px, vw, WORLD.w * T), camY = cam(G.py - 30 + ALPS * T, vh, (WORLD.h + ALPS) * T) - ALPS * T; // oben: Alpen-Kulisse
  ctx.fillStyle = '#3f6e2a'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, -camX * DPR * ZOOM, -camY * DPR * ZOOM);
  ctx.fillStyle = grassPat; ctx.fillRect(0, 0, WORLD.w * T, WORLD.h * T);
  drawAlps();
  // Wege
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const [w, c] of [[T * 1.5, '#b99a68'], [T * 1.2, '#d6bd8c']]) {
    ctx.strokeStyle = c; ctx.lineWidth = w;
    for (const p of WORLD.h > WORLD_H0 ? PATHS.concat(PATHS_SOUTH) : PATHS) { ctx.beginPath(); p.forEach(([a, b], i) => i ? ctx.lineTo(a * T, b * T) : ctx.moveTo(a * T, b * T)); ctx.stroke(); }
  }
  drawLake(); lakeDecos();
  // Weide-Zaun
  const pa = { x: PASTURE.x * T, y: PASTURE.y * T, w: PASTURE.w * T, h: PASTURE.h * T };
  ctx.fillStyle = 'rgba(140,200,90,.18)'; ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
  ctx.strokeStyle = '#8b6a43'; ctx.lineWidth = 3; ctx.strokeRect(pa.x, pa.y, pa.w, pa.h); ctx.strokeRect(pa.x, pa.y - 8, pa.w, pa.h);
  ctx.fillStyle = '#6b4a2b'; for (let x = pa.x; x <= pa.x + pa.w; x += T) { ctx.fillRect(x - 2, pa.y - 14, 4, 16); ctx.fillRect(x - 2, pa.y + pa.h - 14, 4, 16); }
  ctx.fillStyle = '#4f8ec9'; rrect(pa.x + pa.w - 90, pa.y + pa.h - 40, 60, 22, 6); ctx.fill(); // Wassertrog
  // freie Plätze
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
  for (const a in AREAS) {
    const used = new Set(G.things.filter(t => THINGS[t.type].area === a).map(t => t.slot));
    for (let i = 0; i < slotsAvail(a); i++) {
      if (used.has(i)) continue;
      const p = slotPos(a, i);
      if (a === 'acker') ctx.strokeRect(p.x - 2.5 * T, p.y - 1.5 * T, 5 * T, 3 * T);
      else if (a === 'dorf') ctx.strokeRect(p.x - 2 * T, p.y - 2 * T, 4 * T, 2.2 * T);
      else { ctx.beginPath(); ctx.ellipse(p.x, p.y, 20, 9, 0, 0, 7); ctx.stroke(); }
    }
  }
  ctx.setLineDash([]);
  for (const t of G.things) if (t.type === 'feld') drawField(t);
  // nach y sortiert zeichnen
  const list = G.things.filter(t => t.type !== 'feld').map(t => [pos(t).y, t]).concat(FIXED_E.map(f => [f.y, f]), [[G.py, null]],
    G.deco.filter(d => DECOS[d.type].where === 'land').map(d => [d.y, d]));
  const gh = G.carry && ghostPos();
  if (gh) list.push([gh.y, { ghost: G.carry, ...gh }]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, t] of list) {
    if (!t) drawPlayer();
    else if (t.ghost) { // Vorschau: so würde es stehen
      const ok = decoSpotOk(t.x, t.y);
      ctx.globalAlpha = 0.85; ellipse(t.x, t.y, 22, 8, ok ? 'rgba(80,200,80,.45)' : 'rgba(220,50,40,.5)');
      ctx.globalAlpha = 0.6; DECO_DRAW[t.ghost](t.x, t.y, { id: 0 }); ctx.globalAlpha = 1;
    }
    else if (DECOS[t.type] && !THINGS[t.type]) DECO_DRAW[t.type](t.x, t.y, t);
    else if (t.type === 'baum') drawTree(t);
    else if (t.type === 'kuh') drawCow(t);
    else (DRAW[t.type] || DRAW.default)(t.x, t.y, t);
  }
  for (const p of particles) { ctx.fillStyle = `rgba(230,230,230,${p.life / 3})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  // Pakete auf dem Weg
  ctx.font = '16px system-ui'; ctx.textAlign = 'center';
  for (const k of packages) {
    const x = k.x0 + (k.x1 - k.x0) * k.t, y = k.y0 + (k.y1 - k.y0) * k.t - Math.sin(Math.PI * k.t) * 40;
    ctx.fillStyle = '#b07a42'; ctx.fillRect(x - 8, y - 6, 16, 12); ctx.fillText(k.icon, x, y - 8);
  }
  // Namen, Status, Warnungen
  for (const t of FIXED_E) label(t.x, t.y + 18, t.name, 14);
  for (const t of G.things) {
    const d = THINGS[t.type], p = pos(t), top = topOf(t);
    if (d.kind === 'factory') {
      label(t.x, t.y + 18, d.name);
      const txt = Object.keys(d.in).map(k => `${ITEMS[k].icon}${t.inS[k] || 0}`).join(' ') + ` ➜ ${ITEMS[d.item].icon}${t.out}`;
      ctx.font = '700 13px system-ui'; const w = ctx.measureText(txt).width + 16;
      ctx.fillStyle = 'rgba(255,250,235,.92)'; rrect(t.x - w / 2, top - 26, w, 24, 8); ctx.fill();
      ctx.fillStyle = '#3d8b2f'; ctx.fillRect(t.x - w / 2 + 6, top - 5, (w - 12) * t.prog, 3);
      ctx.fillStyle = '#3a2a1a'; ctx.textAlign = 'center'; ctx.fillText(txt, t.x, top - 9);
    } else if (t.ripe && !isAuto(t)) {
      const b = Math.sin(time * 4 + t.id) * 3;
      ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('✨', p.x + 14, top + b);
    }
    if (t.warn) {
      const b = Math.abs(Math.sin(time * 4)) * 6, wy = top - (d.kind === 'factory' ? 44 : 14) - b;
      ellipse(p.x, wy, 13, 13, t.wl === 'yellow' ? '#f2b01e' : '#d23b2b');
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, wy, 13, 0, 7); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '900 18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', p.x, wy + 6);
    }
  }
  if (harvest) {
    const s = 0.85 + G.stage * 0.09, hy = G.py - (75 + liftH()) * s;
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(G.px, hy, 12, 0, 7); ctx.stroke();
    ctx.strokeStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(G.px, hy, 12, -Math.PI / 2, -Math.PI / 2 + harvest.p * Math.PI * 2); ctx.stroke();
  }
  balloons();
  for (const f of floaters) { ctx.globalAlpha = clamp(1.6 - f.t, 0, 1); label(f.x, f.y, f.text, 18); }
  ctx.globalAlpha = 1;
  // Bildschirm-Joystick
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (joy) {
    const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1;
    ellipse(joy.x0, joy.y0, 55, 55, 'rgba(255,255,255,.18)');
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.x0, joy.y0, 55, 0, 7); ctx.stroke();
    ellipse(joy.x0 + dx * k, joy.y0 + dy * k, 24, 24, 'rgba(255,255,255,.75)');
  }
}

let last = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
  if (G && !$('#game').hidden) { update(dt); render(); }
  requestAnimationFrame(loop);
}
renderSelect();
requestAnimationFrame(loop);

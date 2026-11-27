'use strict';
const $ = s => document.querySelector(s);
const cv = $('#cv'); let ctx = cv.getContext('2d', { alpha: false }); // let: Avatar-Vorschau zeichnet kurz auf eigene Canvas; alpha:false spart das Mischen mit der Seite
let W = 0, H = 0, DPR = 1, ZOOM = 1; // Akku schonen: immer DPR 1, max. 30 fps, wenig Partikel
function resize() {
  W = innerWidth; H = innerHeight; // ponytail: DPR 1 auch auf Retina – ¼ der Pixel, Grafik ist weich gezeichnet
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
let loopOn = false;
// Dialog auf → Cursor ins erste sichtbare Eingabefeld
const focusInput = el => [...el.querySelectorAll('input:not([type=hidden]),textarea')].find(i => i.offsetParent)?.focus();
function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  focusInput($('#' + id));
  if (id === 'game' && !loopOn) { loopOn = true; AU.init(); requestAnimationFrame(loop); } // Loop läuft nur im Spiel
}

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

// Startbildschirm: zuerst die Familie, dann ihre Spieler. Profile ohne fam gehören zur Standard-Familie M.
let fam = null, newFam = null;
const famOf = p => p.fam || 'M';
function drawSelect() {
  if (fam == null) {
    const fams = [...new Set(['M', ...profiles.map(famOf)])];
    $('#plist').innerHTML = fams.map(f => `<button class="pcard fam" data-fam="${esc(f)}">🏡<b>${$t`Familie ${esc(f)}`}</b><small>👦🏼 × ${profiles.filter(p => famOf(p) === f).length}</small></button>`).join('') +
      (online ? `<i class="brk"></i><button class="pcard add" data-newfam>＋<b>${$t`Neue Familie`}</b></button>` : '');
    $('#whosub').textContent = $t`Welche Familie spielt?`;
    return;
  }
  $('#plist').innerHTML = `<button class="pcard add" data-fams>←<b>${$t`Familien`}</b></button><i class="brk"></i>` + profiles.map((p, i) => famOf(p) !== fam ? '' :
    `<div class="pwrap"><button class="pcard" data-i="${i}"><canvas class="pav" data-av="${i}"></canvas><b>${esc(p.name)}</b><small>${hasPin(p) ? $t`🔒 ${p.age} Jahre` : $t`✨ neu`}</small></button><button class="pedit" data-edit="${i}" title="${$t`🎨 Aussehen`}">🎨</button></div>`).join('') +
    (online ? `<i class="brk"></i><button class="pcard add" data-add>＋<b>${$t`Neuer Spieler`}</b></button>` : '');
  $('#whosub').textContent = online ? $t`Wer spielt?` : $t`Wer spielt? (offline – Spielstand nur auf diesem Gerät)`;
  for (const c of document.querySelectorAll('[data-av]')) drawAvatar(c, getLook(profiles[+c.dataset.av].id));
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
  if (b.dataset.edit != null) return openAvatar(profiles[+b.dataset.edit]);
  if (b.dataset.fam != null) { fam = b.dataset.fam; return drawSelect(); }
  if (b.dataset.fams != null) { fam = null; return drawSelect(); }
  if (b.dataset.add != null || b.dataset.newfam != null) {
    newFam = b.dataset.newfam != null; $('#famrow').hidden = !newFam; $('#newfam').required = newFam; $('#newfam').value = '';
    $('#plist').hidden = true; $('#addform').hidden = false; $('#newname').value = ''; (newFam ? $('#newfam') : $('#newname')).focus(); return;
  }
  openPin(profiles[+b.dataset.i]);
};
$('#newage').innerHTML = Array.from({ length: 12 }, (_, i) => `<option${i + 5 === 8 ? ' selected' : ''}>${i + 5}</option>`).join('');
$('#addcancel').onclick = renderSelect;
$('#addform').onsubmit = async e => {
  e.preventDefault();
  const name = $('#newname').value.trim(); if (!name) return;
  try {
    const f = newFam ? $('#newfam').value.trim() || 'M' : fam;
    const p = await api('/profiles', { name, age: +$('#newage').value, fam: f });
    profiles.push(p); saveProfiles(); fam = famOf(p); openPin(p);
  } catch (err) { alert(err.code === 'full' ? $t`Es gibt schon zu viele Spieler.` : $t`Hat nicht geklappt – ist das Internet an?`); }
};
for (const b of document.querySelectorAll('[data-back]')) b.onclick = renderSelect;

let pin = null;
$('#pad').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(k => k ? `<button>${k}</button>` : '<span></span>').join('');
$('#pad').onclick = e => { const b = e.target.closest('button'); if (b) pinKey(b.textContent); };
function openPin(p) { pin = { p, mode: hasPin(p) ? 'enter' : 'set', buf: '', first: '' }; show('pin'); drawPin(); }
function drawPin(msg = '') {
  const n = esc(pin.p.name);
  $('#pintitle').innerHTML = { enter: $t`Hallo ${n}! Gib deinen Geheimcode ein.`, set: $t`Hallo ${n}! Denk dir einen 4-stelligen Geheimcode aus.`, confirm: $t`Gib den Code zur Sicherheit nochmal ein.` }[pin.mode];
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
    if (b !== pin.first) { pin.mode = 'set'; shakeDots(); return drawPin($t`Die Codes waren verschieden – nochmal!`); }
    if (online) try { await api('/setpin', { id: pin.p.id, pin: h, token: pin.token }); } catch (e) { pin.mode = 'set'; return drawPin($t`Hat nicht geklappt – nochmal versuchen.`); }
    pin.p.hasPin = true; if (!online) pin.p.pinHash = h; login(h);
  } else login(h);
}
async function login(h) {
  let server = null;
  if (online) {
    try { server = (await api('/login', { id: pin.p.id, pin: h })).save; if (!pin) return; }
    catch (e) {
      if (!pin) return;
      if (e.code) { shakeDots(); return drawPin(e.code === 'locked' ? $t`Zu oft falsch – warte ${e.wait} Sekunden. ⏳` : $t`Falscher Code 🙈`); }
      online = false; // Netz weg → lokal weiter
    }
  }
  if (!online && pin.p.pinHash !== h) {
    shakeDots(); return drawPin(pin.p.pinHash ? $t`Falscher Code 🙈` : $t`Ohne Internet kannst du dich auf diesem Gerät noch nicht anmelden.`);
  }
  pin.p.pinHash = h; saveProfiles(); // lokale Kopie für Offline-Anmeldung
  startGame(pin.p, h, server);
}
addEventListener('keydown', e => { if (!$('#pin').hidden && /^[0-9]$|^Backspace$/.test(e.key)) pinKey(e.key === 'Backspace' ? '⌫' : e.key); });

// Wiederherstellung über schwierige Rechnungen – Aufgaben und Prüfung am Server
async function loadProblems(msg = '') {
  try {
    const { problems } = await api('/recover/start', { id: pin.p.id });
    $('#recmsg').textContent = msg;
    $('#probs').innerHTML = problems.map(q => `<label>${q} = <input inputmode="numeric"></label>`).join('');
    show('recover');
  } catch (e) { show('pin'); drawPin($t`Code-Hilfe geht nur mit Internet.`); }
}
$('#forgot').onclick = () => loadProblems();
$('#checkprobs').onclick = async () => {
  const answers = [...$('#probs').querySelectorAll('input')].map(i => i.value.trim());
  try {
    pin.token = (await api('/recover/finish', { id: pin.p.id, answers })).token;
    pin.mode = 'set'; show('pin'); drawPin($t`Super gerechnet! Wähle einen neuen Code.`);
  } catch (e) { loadProblems(e.code ? $t`Leider nicht alles richtig. Hier sind neue Aufgaben!` : $t`Kein Internet?`); }
};

// =================== Avatar-Baukasten ===================
const getLook = id => store.get('lw_look_' + id) || {};
const lookOf = l => Object.fromEntries(Object.entries(LOOK).map(([k, [, o]]) => [k, o[l?.[k]] ?? o[0]]));
// Figur ausserhalb der Welt zeichnen: drawPlayer mit kurz ausgeliehenem Zustand (G, ctx, Blickrichtung, Schritt)
function drawAvatar(c, look, t) {
  const r = c.getBoundingClientRect(), dpr = devicePixelRatio || 1, w = r.width || 90, h = r.height || 110;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const keep = [G, ctx, trH, walk, amp, cart.on, harvest];
  try {
    ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height);
    const k = h * dpr / 75; ctx.setTransform(k, 0, 0, k, 0, 0);
    G = { px: w * dpr / k / 2, py: 70, stage: 1, tools: { tragen: 0 }, inv: {}, look };
    trH = t == null ? Math.PI / 2 - 0.45 : Math.PI / 2 + Math.sin(t * 0.7) * 1.4;
    walk = (t || 0) * 7; amp = t == null ? 0 : 0.7; cart.on = false; harvest = null;
    drawPlayer();
  } finally { [G, ctx, trH, walk, amp, cart.on, harvest] = keep; }
}
let av = null;
function openAvatar(p) {
  av = { p, look: { ...getLook(p.id) } };
  show('avatar'); $('#avtitle').textContent = $t`Wie siehst du aus, ${p.name}?`;
  avOpts(); requestAnimationFrame(avLoop);
}
function avLoop(ts) { if (!av || $('#avatar').hidden) return; drawAvatar($('#avcv'), av.look, ts / 1000); requestAnimationFrame(avLoop); }
function avOpts() {
  $('#avopts').innerHTML = Object.entries(LOOK).map(([k, [name, opts]]) => `<div class="avrow"><b>${$t([name])}</b><div>${opts.map((o, i) => {
    const on = (av.look[k] || 0) === i ? ' on' : '';
    return o === 'auto' ? `<button class="sw auto${on}" data-k="${k}" data-v="${i}" title="${$t`wächst mit`}">🌱</button>`
      : o[0] === '#' ? `<button class="sw${on}" data-k="${k}" data-v="${i}" style="background:${o}"></button>`
      : `<button class="opt${on}" data-k="${k}" data-v="${i}">${$t([o])}</button>`;
  }).join('')}</div></div>`).join('');
}
$('#avopts').onclick = e => { const b = e.target.closest('[data-k]'); if (!b) return; av.look[b.dataset.k] = +b.dataset.v; avOpts(); };
$('#avrand').onclick = () => { for (const k in LOOK) av.look[k] = Math.floor(Math.random() * LOOK[k][1].length); avOpts(); };
$('#avok').onclick = () => { store.set('lw_look_' + av.p.id, { ...av.look, t: Date.now() }); av = null; renderSelect(); };

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
// Analyse-Cockpit: Einnahmen aus Verkäufen zählen und den Verlauf je Spielminute mitschreiben
const earn = v => { G.money += v; G.earn += v; };
const busy = t => THINGS[t.type].kind === 'grow' ? !t.ripe : !!t.working; // reif und nicht geerntet / Lager voll / Zutat fehlt = steht
const busyShare = (L = G.things) => L.length ? L.filter(busy).length / L.length : 0;
function logMinute() {
  G.pmin++; G.hist.push({ p: G.pmin, t: Math.round(Date.now() / 6e4), m: G.money, e: G.earn, a: Math.round(acc.sa / acc.sn * 100), n: G.things.length });
  acc.sa = acc.sn = 0;
  if (G.hist.length > 240) G.hist.splice(0, 120, ...G.hist.slice(0, 120).filter((_, i) => i % 2)); // ponytail: ältere Hälfte ausdünnen – max. 240 Punkte, alte Punkte stehen dann für mehrere Minuten (Rate = Δe/Δp stimmt trotzdem)
}
// Herstellung/Bedarf pro Minute je Ware (auch für den Produktions-Plan).
// Fehlt einem Gebäude eine Zutat, läuft es langsamer (u < 1) – das zieht durch die ganze Kette.
// sup = was wirklich herauskommt; dem = was die Abnehmer nehmen würden, wenn genau diese Ware reichen würde.
let ratesMemo = null;
function rates() { // ponytail: Ergebnis hängt nur an der Anzahl je Typ, Dinge kommen nur dazu → Cache bis G.things wächst/ersetzt wird
  if (ratesMemo?.a === G.things && ratesMemo.n === G.things.length) return ratesMemo.v;
  const cnt = {}, u = {}, bind = {};
  for (const t of G.things) cnt[t.type] = (cnt[t.type] || 0) + 1;
  const ks = Object.keys(cnt), pm = (k, v) => cnt[k] * v / THINGS[k].time * 60;
  let sup, use;
  for (let n = 0; n < 60; n++) { // ponytail: Fixpunkt mit fester Rundenzahl, reicht für die ≤ 6 Stufen tiefen Ketten
    sup = {}; use = {};
    for (const k of ks) { const d = THINGS[k]; sup[d.item] = (sup[d.item] || 0) + pm(k, d.n) * (u[k] ?? 1); for (const i in d.in) use[i] = (use[i] || 0) + pm(k, d.in[i]) * (u[k] ?? 1); }
    for (const k of ks) {
      const d = THINGS[k]; if (!d.in) continue;
      const q = Object.keys(d.in).map(i => [i, use[i] ? (sup[i] || 0) / use[i] : 1]).sort((a, b) => a[1] - b[1]);
      u[k] = Math.min(1, Math.max(u[k] ?? 1, 1e-3) * q[0][1]); bind[k] = q.filter(e => e[1] < q[0][1] + 0.02).map(e => e[0]); // knappste Zutat(en)
    }
  }
  const dem = {}; // ponytail: Abnehmer, die an dieser Ware hängen, zählen voll – auch wenn noch eine zweite Zutat knapp wäre
  for (const k of ks) for (const i in THINGS[k].in) dem[i] = (dem[i] || 0) + pm(k, THINGS[k].in[i]) * (u[k] === 1 || bind[k].includes(i) ? 1 : u[k]);
  ratesMemo = { a: G.things, n: G.things.length, v: { sup, dem, u, cnt } };
  return ratesMemo.v;
}
const pos = t => t.type === 'kuh' ? { x: t.cx, y: t.cy } : { x: t.x, y: t.y };
const age = () => P.age + STAGES[G.stage].add;
const avail = k => G.land >= (THINGS[k].land || 0) && !UNLOCKS.slice(G.unlocks).flat().includes(k); // schon im Laden?
const hofLv = () => HOF_LV.filter(l => G.land >= l).length;
const shopLv = () => hofLv() + SHOP_LV.filter(l => G.land >= l).length; // Laden/Händler: 0–9
// Endstation (Ware wird nirgends weiterverarbeitet) zum ersten Mal gebaut → nächste Kette freischalten
function checkUnlock(k) {
  const d = THINGS[k];
  if (d.kind !== 'factory' || G.fin[k] || Object.keys(THINGS).some(f => avail(f) && THINGS[f].in?.[d.item])) return null;
  G.fin[k] = 1;
  return G.unlocks < UNLOCKS.length ? UNLOCKS[G.unlocks++] : null;
}

// Ein Band fasst höchstens bandCap Plätze (BAND_LEN Kacheln lang, oder max). Ist ein Bereich voll und reicht das Land für mehr,
// kommt beim Kauf ein Zusatzband dazu (G.ext = Bereich-Schlüssel in der Reihenfolge, in der sie aufgingen): in Spalte 2 untereinander,
// südlich vom letzten Band dort. Geschäftszentren bekommen stattdessen einen zweiten Platz (sightsOn). So wächst jede Ware immer weiter.
const bandCap = a => a.max ?? a.rows * (Math.floor(BAND_LEN / a.dx) + 1);
const nLand = a => G.land < (a.from || 0) ? 0 : a.base + a.per * (G.land - (a.from || 0));
const C2_BOT = Math.max(...Object.values(AREAS).filter(a => a.x > ROAD_X2).map(a => a.y + (a.rows - 1) * a.dy + 0.8));
let extMemo = null;
function segs(k) { // Haupt-Band + Zusatzbänder: { k, j, key, a = Geometrie wie ein AREAS-Eintrag, off = erster Platz, cap }
  const E = G.ext || [];
  if (extMemo?.g !== G || extMemo.n !== E.length) {
    let y0 = C2_BOT; const by = {}, cnt = {};
    for (const k of Object.keys(AREAS)) by[k] = [{ k, j: 0, key: k, a: AREAS[k] }];
    for (const k of E) {
      const p = AREAS[k], j = cnt[k] = (cnt[k] || 0) + 1; let a = p;
      if (!p.hub) { // Spalte 2: gleiche Reihen wie das Haupt-Band, Strasse(n) gleich weit weg; ohne eigene Strasse (Weide, Fischteiche) eine oben
        const rows = p.cols ? 2 : p.rows, lo = p.x > ROAD_X && p.lane ? p.lane.map(l => l - p.y) : [-2.8];
        const y = y0 + 0.4 - Math.min(-2.8, ...lo.map(l => l - 1));
        a = { name: p.name, x: p.x > ROAD_X2 ? p.x : ROAD_X2 + (p.cols ? 2.6 : p.x - ROAD_X), y, rows, dx: p.dx, dy: p.dy, lane: lo.map(l => y + l) };
        y0 = Math.max(y + (rows - 1) * p.dy + 0.8, ...a.lane.map(l => l + 0.9));
      }
      by[k].push({ k, j, key: k + '#' + j, a });
    }
    for (const k in by) { let off = 0; for (const s of by[k]) { s.off = off; off += s.cap = bandCap(s.a); } }
    extMemo = { g: G, n: E.length, by };
  }
  return extMemo.by[k];
}
const segOf = (k, i) => segs(k).findLast(s => i >= s.off);
const segsN = k => { const n = slotsAvail(k); return segs(k).map(s => ({ ...s, n: clamp(n - s.off, 0, s.cap) })); }; // n = offene Plätze im Band
function slotsAvail(area) { // base + per*Landstufe, höchstens so viele, wie die offenen Bänder fassen
  const s = segs(area).at(-1);
  return Math.min(s.off + s.cap, nLand(AREAS[area])); // Plätze über dem Deckel (alte Stände) bekommen beim Laden ein Zusatzband – kein Scan über G.things, das lief pro Bild hundertfach
}
function slotPos(area, i) { // spaltenweise füllen: das Band wächst nach Osten
  const g = segOf(area, i), a = g.a; i -= g.off;
  if (a.hub) { const s = sightsOn().find(s => s.k === g.key); return { x: (s.x - s.w / 2 + 0.4 + (i % a.cols + 0.5) * a.dx) * T, y: (s.y - 0.5 - Math.floor(i / a.cols) * a.dy) * T }; } // Geschäftszentrum: Reihe 0 unten
  const [c, r] = a.cols ? [i % a.cols, Math.floor(i / a.cols)] : [Math.floor(i / a.rows), i % a.rows];
  return { x: (a.x + c * a.dx) * T, y: (a.y + r * a.dy) * T };
}
const areaOn = a => G.land >= (a.from || 0);
const hubH = a => 3.4 + (Math.ceil(a.max / a.cols) - 1) * a.dy; // Geschäftszentrum gleich in voller Grösse: wächst nicht, zieht also nicht um
const bands = () => Object.keys(AREAS).filter(k => areaOn(AREAS[k]) && !AREAS[k].hub); // Geschäftszentren sind keine Bänder
const bandSegs = () => bands().flatMap(segsN);
const segEnd = s => s.a.x + Math.max(0, (s.a.cols ? Math.min(s.a.cols, s.n) : Math.ceil(s.n / s.a.rows)) - 1) * s.a.dx; // x der letzten Spalte
const segRows = s => s.a.cols ? Math.max(1, Math.ceil(s.n / s.a.cols)) : s.a.rows;
const areaEnd = k => segEnd(segsN(k)[0]); // nur Haupt-Band
const pastures = () => segsN('weide').map(s => s.j ? { x: s.a.x - 1.4, y: s.a.y - 2, w: Math.max(10, segEnd(s) - s.a.x + 3), h: PASTURE.h } : PASTURE); // Zaun je Weide-Band
// Gülle-Verteiler (ab Land-Stufe 20): sammelt Dung von den Tieren und düngt die Weizenfelder → doppelte Ernte
const FELD_N = THINGS.feld.n, MIST = ['kuh', 'schwein', 'huhn', 'masthuhn'];
const guelleOn = () => !!G.guelle && G.things.some(t => MIST.includes(t.type));
function relayout() { // Plätze neu setzen (alte Spielstände hatten ein anderes Raster)
  for (const t of G.things) {
    const p = slotPos(THINGS[t.type].area, t.slot); Object.assign(t, p);
    if (t.type === 'kuh' && dist(t.cx, t.cy, p.x, p.y) > 6 * T) Object.assign(t, { cx: p.x, cy: p.y, tx: p.x, ty: p.y });
  }
}
function fitWorld() { // Welt = Hof-Bereich + alle offenen Bänder; Weide-Zaun wächst mit
  const on = bandSegs();
  PASTURE.w = Math.max(10, areaEnd('weide') - PASTURE.x + 1.6);
  WORLD.w = Math.max(48, ...on.map(s => Math.ceil(segEnd(s) + 3)));
  const bh = s => Math.max(s.a.y + (segRows(s) - 1) * s.a.dy + 1.4, ...(s.a.lane || []).map(l => l + 0.9));
  const hubs = Object.keys(AREAS).filter(k => AREAS[k].hub && areaOn(AREAS[k])), hh = Math.max(0, ...hubs.map(k => hubH(AREAS[k]))); // Geschäftsviertel: eigener Streifen unter den Bändern, da wächst kein Band hinein
  const nHub = hubs.reduce((n, k) => n + segs(k).length, 0), perRow = Math.max(1, Math.floor((WORLD.w - ROAD_X - 2) / 18.8)); // ponytail: Reihe voll → nächste Reihe; Neustadt-Häuser drängen sich dazwischen, sonst fehlen sie (townOn)
  WORLD.h = Math.max(...on.map(bh), nHub ? Math.max(...on.filter(s => s.a.x > ROAD_X).map(bh)) + Math.ceil(nHub / perRow) * (hh + 1.5) + 0.5 : 0); // voll → nächste Reihe darunter
}
// Wege: Hof-Wege, Hauptstrasse (Nord–Süd) und je Band eine Strasse bis ans Bandende
// paths(): dazu die Zufahrten der Zweigstellen (werden automatisch gebaut); basePaths(): nur das feste Strassennetz
const paths = () => basePaths().concat(branches().map(b => spur(b).pts.map(q => [q.x / T, q.y / T])));
let bpMemo = null;
function basePaths() { // Spalte 2: Querwege ab der Oststrasse, die oben über y 10.2 an die Hauptstrasse anschliesst
  const key = [G.land, G.ext?.length].join(); // hängt nur an Landstufe und Zusatzbändern; snap() ruft das sehr oft
  if (bpMemo?.g === G && bpMemo.key === key) return bpMemo.v;
  const L = bandSegs().flatMap(s => (s.a.lane || []).filter((_, j) => s.n > j).map(y => [y, segEnd(s) + 1.8, s.a.x > ROAD_X2 ? ROAD_X2 : ROAD_X])); // Dorf: Strasse erst, wenn ihre Reihe Plätze hat
  const end = x0 => Math.max(...L.filter(l => l[2] === x0).map(l => l[0])), east = L.some(l => l[2] === ROAD_X2) ? [[[ROAD_X, 10.2], [ROAD_X2, 10.2], [ROAD_X2, end(ROAD_X2)]]] : [];
  bpMemo = { g: G, key, v: PATHS.concat([[[ROAD_X, 10.2], [ROAD_X, end(ROAD_X)]]], east, L.map(([y, x, x0]) => [[x0, y], [x, y]])) };
  return bpMemo.v;
}
function freeSlot(area) {
  const used = new Set(G.things.filter(t => THINGS[t.type].area === area).map(t => t.slot));
  const n = slotsAvail(area);
  for (let i = 0; i < n; i++) if (!used.has(i) && !underBranch(area, slotPos(area, i))) return i; // Zweigstelle steht auf dem Platz
  return nLand(AREAS[area]) > n ? n : -1; // alle Bänder voll, Land reicht für mehr: erster Platz im nächsten Zusatzband (legt addThing an)
}
function addThing(type) {
  const area = THINGS[type].area, slot = freeSlot(area);
  if (slot < 0) return null;
  if (slot >= (s => s.off + s.cap)(segs(area).at(-1))) { G.ext.push(area); fitWorld(); relayout(); fixDeco(); }
  const p = slotPos(area, slot);
  const t = { id: G.nid++, type, slot, x: p.x, y: p.y, timer: 0, ripe: false, store: 0, inS: {}, out: 0, prog: 0, wait: 0 };
  if (type === 'kuh') Object.assign(t, { cx: p.x, cy: p.y, tx: p.x, ty: p.y, face: 1 });
  G.things.push(t);
  return t;
}
function newGame() {
  G = { v: 1, nid: 1, money: 0, inv: {}, tools: {}, land: 0, things: [], px: 14 * T, py: 10.2 * T, seen: {}, stage: 0, unlocks: 0, fin: {}, deco: [], carry: null, pass: {}, spot: {}, earn: 0, pmin: 0, hist: [], ext: [] };
  for (const k in TOOLS) G.tools[k] = 0;
  trucks.length = 0; // anderer Spieler: Fahrzeuge neu aufstellen
  addThing('feld').ripe = true;
  addThing('baum').ripe = true;
  addThing('baum').timer = 15;
}
function loadGame(server) {
  newGame();
  const local = store.get(saveKey()), rv = s => +s?.rev || 0;
  // Zähler nur vergleichen, wenn beide einen haben – alte Spielstände (ohne rev) wie früher nach Zeit
  const s = rv(server) && rv(local) && rv(server) !== rv(local) ? (rv(server) > rv(local) ? server : local) : (server?.savedAt || 0) > (local?.savedAt || 0) ? server : local;
  if (s) {
    const tools = G.tools;
    Object.assign(G, s);
    G.tools = Object.assign(tools, s.tools);
    // Spielstand kommt von aussen (Server/localStorage) und landet teils in innerHTML: Zahlen erzwingen
    for (const k of ['money', 'land', 'lkw', 'unlocks', 'stage', 'nid', 'rev', 'earn', 'pmin']) G[k] = Math.max(0, Math.floor(+G[k] || 0));
    G.hist = (Array.isArray(G.hist) ? G.hist : []).map(h => Object.fromEntries(['p', 't', 'm', 'e', 'a', 'n'].map(k => [k, Math.floor(+h?.[k] || 0)])));
    G.rev = Math.max(rv(server), rv(local)); // gewählter Stand darf hochladen, auch wenn er (alt, ohne rev) vom Gerät kommt
    G.nid ||= 1; G.stage = Math.min(G.stage, STAGES.length - 1); G.unlocks = Math.min(G.unlocks, UNLOCKS.length);
    for (const k in G.tools) G.tools[k] = TOOLS[k] ? clamp(G.tools[k] | 0, 0, TOOLS[k].levels.length - 1) : 0;
    G.inv = Object.fromEntries(Object.entries(G.inv || {}).filter(([k, n]) => ITEMS[k] && n > 0).map(([k, n]) => [k, n | 0]));
    G.things = G.things.filter(t => THINGS[t.type]); // falls ein Typ entfernt wurde
    G.deco = (G.deco || []).filter(d => DECOS[d.type]);
    if (G.carry && !DECOS[G.carry]) G.carry = null;
    G.ext = (Array.isArray(G.ext) ? G.ext : []).filter(k => AREAS[k]);
    for (const k in AREAS) { const m = Math.max(0, ...G.things.filter(t => THINGS[t.type].area === k).map(t => t.slot + 1)); while ((s => s.off + s.cap)(segs(k).at(-1)) < m) G.ext.push(k); } // alte Stände: Plätze über dem Deckel → Zusatzband
    const u0 = G.unlocks;
    fitWorld(); relayout(); // erst Weltgrösse: Geschäftszentren suchen ihren Platz darin
    fixDeco();
    for (const t of G.things) checkUnlock(t.type); // alte Spielstände: schon gebaute Endstationen zählen
    G.unlocks = Math.max(G.unlocks, Math.min(Object.keys(G.fin).length, UNLOCKS.length)); // jede Endstation schaltet 1 Kette frei – auch Ketten, die erst später ins Spiel kamen
    if (G.unlocks > u0) setTimeout(() => toast($t`🎉 ${G.unlocks - u0} neue Rezepte freigeschaltet – schau im Laden bei 🏭 Gebäude!`), 1500);
  }
}
// Laufzeit-Felder nicht speichern, Kommazahlen kürzen: hält den Spielstand klein
const SKIP = new Set(['warn', 'wl', 'working', 'ang']);
const slim = (k, v) => SKIP.has(k) ? undefined : typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v;
// leaving: Seite wird verlassen → keepalive (Browser erlauben dafür höchstens 64 KB)
function save(cloud, leaving) {
  if (!G) return;
  G.savedAt = Date.now();
  const up = cloud && online && KEY;
  if (up) G.rev = (G.rev || 0) + 1; // Server lehnt ältere Stände ab (anderes Gerät/alter Tab hat weitergespielt)
  const s = JSON.stringify(G, slim);
  try { localStorage.setItem(saveKey(), s); } catch (e) {}
  if (!up) return;
  const g = G, body = `{"id":${JSON.stringify(P.id)},"pin":${JSON.stringify(KEY)},"save":${s}}`;
  fetch(API + '/save', { method: 'POST', keepalive: !!leaving && body.length < 60e3, headers: { 'content-type': 'text/plain' }, body })
    .then(r => { if (r.status === 409 && G === g) stale(); }).catch(() => {});
}
function stale() { // anderswo weitergespielt: diesen (alten) Stand verwerfen, neu anmelden lädt den neueren
  G = null; KEY = null; closeModals(); renderSelect();
  alert($t`Du hast auf einem anderen Gerät weitergespielt. Melde dich nochmal an, dann geht es dort weiter.`);
}

function startGame(p, key, server) {
  P = p; KEY = key; pin = null; loadGame(server); folk.length = 0;
  const lk = getLook(p.id); // Aussehen: neuere Fassung gewinnt (Gerät oder Spielstand in der Cloud)
  if ((G.look?.t || 0) > (lk.t || 0)) store.set('lw_look_' + p.id, G.look); else G.look = lk; AU.init(); show('game'); resize();
  shopDismiss = false; near = null; lastNear = null;
  pt = playTime(); if (pt.s >= (pt.lim || LIMIT)) timeUp();
  hud(); toast('ontouchstart' in window ? $t`Willkommen, ${P.name}! Lauf mit den Pfeiltasten oder wisch über den Bildschirm.` : $t`Willkommen, ${P.name}! Lauf mit den Pfeiltasten (oder WASD).`);
}
// ---- Tageslimit: 30 Min. pro Spieler und Tag, Eltern-Code stellt die Minuten bis zur nächsten Sperre ein ----
const LIMIT = 30 * 60, PARENT = 'lorenzmaierhofer'; // ponytail: Klartext im Client – hält Kinder auf, nicht DevTools/localStorage
const today = () => new Date().toLocaleDateString('sv');
const playTime = () => { const t = store.get('lw_time_' + P.id); return t?.d === today() ? t : { d: today(), s: 0 }; };
let pt = null;
function tickTime(dt) {
  if (pt.d !== today()) pt = { d: today(), s: 0 };
  const before = pt.s; pt.s += dt;
  if (Math.floor(pt.s / 5) !== Math.floor(before / 5)) store.set('lw_time_' + P.id, pt);
  if (before < LIMIT - 300 && pt.s >= LIMIT - 300) toast($t`⏰ Noch 5 Minuten Spielzeit für heute!`);
  if (pt.s >= (pt.lim || LIMIT)) timeUp();
}
function timeUp() { store.set('lw_time_' + P.id, pt); save(true); closeModals(); $('#tupass').value = ''; $('#tupass').hidden = false; $('#tuminw').hidden = true; $('#tumsg').textContent = ''; show('timeup'); }
$('#tuform').onsubmit = e => {
  e.preventDefault();
  if ($('#tupass').value !== PARENT) { $('#tumsg').textContent = $t`Falscher Code`; return; }
  if ($('#tuminw').hidden) { $('#tupass').hidden = true; $('#tuminw').hidden = false; $('#tumsg').textContent = ''; $('#tumin').select(); return; } // Schritt 2: Minuten wählen
  pt.lim = pt.s + Math.min(600, Math.max(1, Math.round(+$('#tumin').value) || 5)) * 60; store.set('lw_time_' + P.id, pt); show('game'); resize();
};
$('#tuexit').onclick = () => $('#bexit').click();
$('#bexit').onclick = () => { save(true); G = null; KEY = null; closeModals(); renderSelect(); };
$('#bsound').onclick = e => { e.currentTarget.textContent = AU.toggle() ? '🔊' : '🔇'; };
$('#bplan').onclick = () => openPlan();
$('#bmusic').onclick = e => { AU.init(); e.currentTarget.style.opacity = AU.music() ? 1 : 0.5; };
$('#bzin').onclick = () => setZoom(1.25);
$('#bzout').onclick = () => setZoom(0.8);
cv.addEventListener('wheel', e => { e.preventDefault(); setZoom(Math.exp(-e.deltaY * 0.002)); }, { passive: false });
addEventListener('visibilitychange', () => { if (document.hidden) { save(true, true); AU.pause(); } else if (G && !$('#game').hidden) AU.init(); });
addEventListener('pagehide', () => save(true, true));

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
let near = null, lastNear = null, harvest = null, shopDismiss = false, moving = false, walk = 0, amp = 0, time = 0;
const cart = { on: false }; // gezogener Wagen: Vorder-/Hinterachse in Weltkoordinaten
let trH = 0; // Blickrichtung von Figur und Traktor (Bogenmass, 0 = rechts)
const packages = [], floaters = [], particles = [], trucks = [];
let acc = { tr: 0, w: 0, save: 0, hud: 0, st: 0, sa: 0, sn: 0 };

function update(dt) {
  time += dt;
  // Bewegung
  let mx = (keys.arrowright || keys.d ? 1 : 0) - (keys.arrowleft || keys.a ? 1 : 0);
  let my = (keys.arrowdown || keys.s ? 1 : 0) - (keys.arrowup || keys.w ? 1 : 0);
  if (joy) { const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy); if (l > 8) { mx = dx / Math.max(l, 50); my = dy / Math.max(l, 50); } }
  const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
  const sp = 4.6 * T * (1 + G.stage * 0.06);
  const ox = G.px, oy = G.py, solid = (x, y) => inLake(x, y) || inMts(x, y) && !inMts(ox, oy); // wer (alter Spielstand) im Berg steht, darf hinaus
  G.px = clamp(G.px + mx * sp * dt, T, (WORLD.w - 1) * T);
  if (solid(G.px, G.py)) G.px = ox; // nicht in den See oder Berg laufen – am Ufer entlang rutschen
  fitWorld(); THINGS.feld.n = guelleOn() ? FELD_N * 2 : FELD_N; // ponytail: jedes Frame gesetzt, so stimmt's auch nach Laden/Kauf
  G.py = clamp(G.py + my * sp * dt, T * 1.5, (WORLD.h - 0.5) * T);
  if (solid(G.px, G.py)) G.py = oy;
  moving = ml > 0.1;
  amp += ((moving ? 1 : 0) - amp) * Math.min(1, dt * 10); // Schritt weich ein-/ausblenden
  if (moving) { // dreht sich (der Traktor langsamer) in die Laufrichtung
    walk += dt * 11;
    const d = Math.atan2(my, mx) - trH, r = onTractor() ? 5 : 14;
    trH += clamp(Math.atan2(Math.sin(d), Math.cos(d)), -r * dt, r * dt);
  }
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
      t.ang = (t.ang || 0) + dt * (t.working ? 2.2 : t.type === 'muehle' ? 0.25 : 0); // Animation: steht still, wenn nichts zu tun
    }
  }
  for (const d of G.deco) if (d.type === 'alphorn' && Math.random() < dt * 0.7 && dist(G.px, G.py, d.x, d.y) < 9 * T) floaters.push({ x: d.x + 60 + rndf(-6, 6), y: d.y - 30, text: Math.random() < 0.5 ? '♪' : '♫', t: 0 });
  if ((acc.tr += dt) > 0.35) { acc.tr = 0; transfers(); }
  spedition(dt);
  if ((acc.w += dt) > 0.5) { acc.w = 0; warnings(); checkStage(); }
  if ((acc.st += dt) > 1) { acc.st = 0; acc.sa += busyShare(); if (++acc.sn >= 60) logMinute(); } // Cockpit: Auslastung 1×/s messen, jede Spielminute ein Punkt im Verlauf
  interact(dt);
  if ((acc.hud += dt) > 0.25) { acc.hud = 0; hud(); seasonTick(); }
  folkTick(dt); evTick(dt);
  trainTick(dt);
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
    const pa = pastures()[segOf('weide', t.slot).j];
    if (Math.random() < dt * 0.3) { t.tx = (pa.x + 1 + Math.random() * (pa.w - 2)) * T; t.ty = (pa.y + 1.5 + Math.random() * (pa.h - 2.5)) * T; }
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

// Spediteur: jedes Fahrzeug startet alle <every> s beim Händler, fährt zu Gebäuden mit Endprodukten,
// lädt bis <cap> Überschuss (surplus: kein Abnehmer hat Platz) ein und verkauft beim Händler. Gefahren wird auf der Strasse (road).
// Strassennetz = Hauptstrasse (x = ROAD_X) + Querwege. Zufahrt = kürzeste Gerade zur Strasse, die nicht durch den See geht.
const wet = (a, b) => { for (let s = 0; s <= 1; s += 0.05) if (inLake(a.x + (b.x - a.x) * s, a.y + (b.y - a.y) * s, 0.5)) return true; return false; };
function snap(p) { // nächster Strassenpunkt (Pixel); main = auf der Hauptstrasse, sonst auf dem Querweg in Zeile y
  let best = null, bd = Infinity;
  for (const pl of basePaths()) for (let j = 1; j < pl.length; j++) {
    const [ax, ay] = pl[j - 1], [bx, by] = pl[j], main = ax === bx;
    if (main && ax !== ROAD_X && ax !== ROAD_X2) continue; // Hof-Stummel
    const q = { x: clamp(p.x, Math.min(ax, bx) * T, Math.max(ax, bx) * T), y: clamp(p.y, Math.min(ay, by) * T, Math.max(ay, by) * T), main }, d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < bd && !wet(p, q)) { bd = d; best = q; }
  }
  return best;
}
function road(a, b) { // Wegpunkte von a nach b: Zufahrt → Querweg → Hauptstrasse → Querweg → Zufahrt
  // in einer Zweigstelle (Start oder Ziel): über ihre eigene Zufahrtsstrasse statt quer übers Land
  const ba = branches().find(o => inFil(a.x, a.y, o, 0.1)), bb = branches().find(o => inFil(b.x, b.y, o, 0.1));
  const pa = ba ? spur(ba) : null, pb = bb ? spur(bb) : null;
  if (ba && ba === bb) return [b];
  const sa = pa ? pa.end : snap(a), sb = pb ? pb.end : snap(b), R = ROAD_X * T;
  if (!sa || !sb) return [b];
  const head = pa ? pa.pts.slice(1, -1) : [], tail = pb ? pb.pts.slice(1, -1).reverse() : [];
  const R2 = ROAD_X2 * T, Y0 = 10.2 * T, c2 = p => p.x > R2 - 1; // c2: Spalte 2 (an der Oststrasse)
  const up = p => c2(p) ? [p, { x: R2, y: p.y }, { x: R2, y: Y0 }, { x: R, y: Y0 }] : [p, { x: R, y: p.y }]; // bis auf die Hauptstrasse
  const mid = !sa.main && !sb.main && sa.y === sb.y && (c2(sa) === c2(sb) || sa.y === Y0) ? [sa, sb] // gleicher Querweg?
    : c2(sa) && c2(sb) ? [sa, { x: R2, y: sa.y }, { x: R2, y: sb.y }, sb] : [...up(sa), ...up(sb).reverse()];
  return [...head, ...mid, ...tail, b];
}
// Zufahrt einer Zweigstelle: vom Parkplatz zur nächsten Strasse, nur gerade Stücke. Liegt die Strasse hinter dem Haus (Norden),
// führt sie seitlich am Haus vorbei. pts in Pixeln (Parkplatz → Strasse), end = Strassenpunkt wie snap()
const spurMemo = new WeakMap();
function spur(b) {
  const key = [b.x, b.y, b.s, G.land, G.ext?.length].join(); let m = spurMemo.get(b);
  if (m?.key === key) return m;
  const sc = b.s || 1, lot = { x: b.x, y: b.y + FIL_PY * sc * T }, s0 = snap(lot);
  let pts = [lot], end = s0;
  if (s0 && s0.y >= lot.y) { end = snap({ x: b.x, y: s0.y }) || s0; pts.push({ x: b.x, y: end.y }); } // Strasse vorne: gerade hinaus
  else if (s0) { // hinten: seitlich am Haus vorbei
    const sx = b.x + ((s0.x < b.x ? FIL[0] : FIL[1]) * sc + (s0.x < b.x ? -0.7 : 0.7)) * T;
    end = snap({ x: sx, y: s0.y }) || s0; pts.push({ x: sx, y: lot.y }, { x: sx, y: end.y });
  }
  if (end) pts.push({ x: end.x, y: end.y });
  pts = pts.filter((q, i) => !i || Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y) > 1);
  m = { key, pts, end }; spurMemo.set(b, m); return m;
}
const fld = t => THINGS[t.type].kind === 'grow' ? 'store' : 'out'; // Lagerfeld: Ernte vs. fertige Ware
const truckCount = () => G.tools.spedition ? 1 + (G.lkw || 0) : 0;
const filMax = () => DECOS.filiale.max + 2 * DECOS.filiale.more.filter(l => G.land >= l).length; // ab Land 240 und 280 je 2 Zweigstellen mehr
// LKW-Parkplatz südlich vom Grosshandel (zwischen Händler und See): ab Lastwagen, 2 Reihen, wächst mit den Fahrzeugen
const LOT = { x: 10.3, y: 19.75, bay: 1.15, rows: [21.15, 23], cols: 6 }; // Kacheln
const lotOn = () => G.tools.spedition >= 3;
const lotCols = () => Math.min(LOT.cols, Math.ceil(truckCount() / 2));
function parkAt(i) { // Parkfeld i (Pixel); ponytail: 12 Felder, weitere stehen wie früher neben dem Händler
  if (lotOn() && i < LOT.cols * 2) return { x: (LOT.x + 0.65 + Math.floor(i / 2) * LOT.bay) * T, y: LOT.rows[i % 2] * T };
  const h = FIXED_E.find(f => f.type === 'haendler'); return { x: h.x + 140, y: h.y + 20 + i * 45 };
}
function drawLot() {
  if (!lotOn()) return;
  const x = LOT.x * T, y = LOT.y * T, w = (lotCols() * LOT.bay + 0.75) * T, hh = (LOT.rows[1] + 0.9 - LOT.y) * T;
  ctx.fillStyle = '#b9b2a2'; rrect(x - 5, y - 5, w + 10, hh + 10, 10); ctx.fill(); // Randstein
  ctx.fillStyle = '#5d6166'; rrect(x, y, w, hh, 7); ctx.fill();
  ctx.fillStyle = '#e8e2d0'; ctx.fillRect(x + 6, y + hh / 2 - 1.5, w - 0.5 * T, 3); // Mittellinie
  for (let c = 0; c <= lotCols(); c++) // Parkfeld-Striche
    { const bx = x + (0.075 + c * LOT.bay) * T; ctx.fillRect(bx - 1.5, y + 6, 3, hh / 2 - 14); ctx.fillRect(bx - 1.5, y + hh / 2 + 8, 3, hh / 2 - 14); }
  ctx.fillStyle = '#2f6fc4'; rrect(x + w - 26, y + hh / 2 - 10, 20, 20, 4); ctx.fill(); // P-Schild
  ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText('P', x + w - 16, y + hh / 2 + 6);
}
// Zweigstellen: jedes Fahrzeug verkauft nach der Tour beim Händler oder der Zweigstelle, die über die Strasse am nächsten liegt (parkSell),
// und parkt dort (home) – die nächste Tour startet von da. So fahren Lastwagen in weit entfernten Bändern viel kürzer.
// Parkplatz nach der Tour: der nächste – ausser dort stehen schon mehr als ihr Anteil, dann ein leererer, der höchstens 1.5× so weit ist.
// So verteilen sich die Wagen auf Händler und Zweigstellen, statt sich an einer zu stauen.
// ponytail: fester Faktor 1.5, Gewichtung nach Arbeit in der Nähe falls nötig
const homed = (s, k) => trucks.filter(o => o !== k && o.home === s).length;
function parkSell(k, p, h) {
  const all = [h, ...branches()].map(s => [s, roadLen(p, s)]).sort((a, b) => a[1] - b[1]), fair = Math.ceil(trucks.length / all.length);
  return (all.find(([s, d]) => homed(s, k) < fair && d <= all[0][1] * 1.5) || all[0])[0];
}
const roadLen = (a, b) => road(a, b).reduce((s, q) => (s.d += Math.hypot(q.x - s.p.x, q.y - s.p.y), s.p = q, s), { d: 0, p: a }).d;
function parkSpot(k, s, h) { // freies Parkfeld bei Händler (eigenes Feld auf dem Parkplatz) oder Zweigstelle (4 Felder)
  if (s === h) return parkAt(trucks.indexOf(k));
  const taken = new Set(trucks.filter(o => o !== k && o.home === s).map(o => o.bay));
  k.bay = FIL_BAY.findIndex((_, i) => !taken.has(i)); if (k.bay < 0) k.bay = trucks.indexOf(k) % FIL_BAY.length; // mehr als 4: stehen doppelt
  const sc = s.s || 1; return { x: s.x + FIL_BAY[k.bay] * sc * T, y: s.y + FIL_PY * sc * T };
}
function spedition(dt) {
  const stuck = t => { const d = THINGS[t.type]; return d.kind === 'grow' ? t.store >= storeCap(d) : t.out + d.n > OUT_CAP; }; // volles Lager: Arbeit steht
  const h = FIXED_E.find(f => f.type === 'haendler'), lv = toolLv('spedition');
  while (trucks.length < truckCount()) { // neue Wagen auf Händler und Zweigstellen verteilen: dorthin, wo am wenigsten stehen
    const i = trucks.length, home = [h, ...branches()].reduce((a, b) => homed(b) < homed(a) ? b : a), k = { h: lotOn() ? Math.PI / 2 : Math.PI, wait: i * 4, route: [], load: 0, sum: 0, home };
    trucks.push(k); Object.assign(k, parkSpot(k, home, h)); if (home !== h) k.h = -Math.PI / 2;
  }
  for (const [i, k] of trucks.entries()) {
    if (!k.route.length) { // im Depot
      k.wait += dt;
      if ((k.chk = (k.chk || 0) + dt) < 0.5) continue; // Depot nur 2× pro Sekunde prüfen
      k.chk = 0;
      const busy = new Set(trucks.flatMap(o => o.route.map(r => r.t))), val = t => t[fld(t)] * ITEMS[THINGS[t.type].item].price;
      // zuerst Gebäude, deren Ware im Plan Überschuss ist (kein Abnehmer oder 🟠 zu viel: > 1.1× Bedarf), dann wertvollste
      const { sup, dem } = rates(), over = t => { const it = THINGS[t.type].item; return !dem[it] || sup[it] > dem[it] * 1.1; };
      const sp = {}, sur = it => sp[it] ??= surplus(it); // surplus() ist O(Gebäude) – je Ware nur einmal
      // ganz zuerst: Gebäude mit vollem Lager (dort steht die Arbeit), wertvollste zuerst
      // Rohprodukte (kind 'grow') ganz hinten: nur mit Platz, der nach allen verarbeiteten Waren noch frei ist
      const raw = t => THINGS[t.type].kind === 'grow';
      const todo = G.things.filter(t => t[fld(t)] > 0 && !busy.has(t) && sur(THINGS[t.type].item)).sort((a, b) => raw(a) - raw(b) || stuck(b) - stuck(a) || (stuck(a) ? 0 : over(b) - over(a)) || val(b) - val(a));
      // volles Lager oder Gebäude ohne Abnehmer: nicht auf den Takt warten (ohne Abnehmer schon ab 3 Stück)
      if (k.wait < lv.every && !todo.some(t => stuck(t) || t[fld(t)] > 2 && !hasConsumer(THINGS[t.type].item))) continue;
      if (!todo.length) { k.wait = lv.every - 2; continue; } // nichts zu holen: gleich nochmal schauen
      // alle freien Fahrzeuge fahren gemeinsam los: erster Halt reihum (so sieht man mehrere unterwegs),
      // danach geht jedes Gebäude an das Fahrzeug mit Platz, dessen letzter Halt am nächsten liegt
      // (mit Zweigstellen: erster Halt ans nächste Fahrzeug, das noch keinen hat – so holt jedes in seiner Nähe ab)
      const idle = trucks.filter(o => !o.route.length), left = idle.map(() => lv.cap), at = idle.map(o => ({ x: o.x, y: o.y })), fil = branches().length;
      todo.forEach((t, j) => {
        const p = pos(t), d = m => left[m] > 0 ? Math.hypot(p.x - at[m].x, p.y - at[m].y) : Infinity;
        const free = idle.map((_, m) => m).filter(m => !idle[m].route.length);
        const n = j < idle.length ? (fil ? free.reduce((b, m) => d(m) < d(b) ? m : b, free[0]) : j) : idle.reduce((b, _, m) => d(m) < d(b) ? m : b, 0);
        if (left[n] <= 0) return; // alle voll
        idle[n].route.push({ t, x: p.x, y: p.y + 24, hot: stuck(t) }); left[n] -= t[fld(t)]; at[n] = p;
      });
      idle.forEach(o => {
        if (!o.route.length) return;
        // Halte nach nächstem Nachbarn ordnen: nahe Häuser nacheinander statt Zickzack nach Priorität –
        // aber Gebäude mit vollem Lager (hot) zuerst, sonst ist der Wagen voll, bevor er dort ankommt, und lässt sie aus
        // ponytail: greedy nearest neighbour, O(n²) bei wenigen Halten egal
        const seq = []; let c = o;
        for (const rest of [o.route.filter(r => r.hot), o.route.filter(r => !r.hot)])
          while (rest.length) { const i = rest.reduce((b, r, m) => Math.hypot(r.x - c.x, r.y - c.y) < Math.hypot(rest[b].x - c.x, rest[b].y - c.y) ? m : b, 0); c = rest.splice(i, 1)[0]; seq.push(c); }
        const sell = parkSell(o, seq.at(-1), h);
        o.route = seq; o.wait = 0; o.home = sell; o.route.push({ ...parkSpot(o, sell, h), sell }); // verkaufen und dort parken
      });
      continue;
    }
    k.wait += dt;
    if (k.load < lv.cap * 1.5 && (k.pk = (k.pk || 0) + dt) > 0.25) { // an vollem Lager vorbei: anhalten, leeren, dann weiter auf der Route
      k.pk = 0; // ponytail: Suche über alle Gebäude 4×/s je Wagen, Raster falls es ruckelt; bis 1.5× Ladung (Wagen auf dem Heimweg halten auch)
      // nah = am Haus oder an der Stelle, wo seine Zufahrt auf die Strasse trifft (Wagen auf der Strasse sind oft >2 Kacheln vom Haus)
      const near = t => { const p = { x: pos(t).x, y: pos(t).y + 24 }; if (Math.abs(p.x - k.x) > 8 * T || Math.abs(p.y - k.y) > 8 * T) return false; const s = snap(p); return Math.hypot(p.x - k.x, p.y - k.y) < 2 * T || s && Math.hypot(s.x - k.x, s.y - k.y) < 1.5 * T; };
      const head = new Set(trucks.map(o => o.route[0]?.t)); // schon direkt angefahren: dem anderen lassen
      const t = G.things.find(t => stuck(t) && !head.has(t) && near(t) && surplus(THINGS[t.type].item));
      if (t) { // anderen Wagen, die es erst später eingeplant haben, wegnehmen – wer vorbeifährt, holt ab
        for (const o of trucks) o.route = o.route.filter(q => q.t !== t);
        const p = pos(t); k.route.unshift({ t, x: p.x, y: p.y + 24, hot: true }); k.path = null;
      }
    }
    const r = k.route[0];
    if (!k.path?.length) k.path = road(k, r);
    const w = k.path[0], dx = w.x - k.x, dy = w.y - k.y, l = Math.hypot(dx, dy), v = T * (lv.v || 7) * dt;
    if (l > v) { k.x += dx / l * v; k.y += dy / l * v; const d = Math.atan2(dy, dx) - k.h; k.h += clamp(Math.atan2(Math.sin(d), Math.cos(d)), -6 * dt, 6 * dt); continue; }
    k.x = w.x; k.y = w.y; k.path.shift();
    if (k.path.length) continue;
    k.route.shift();
    if (r.t) { // beim Gebäude einladen
      const it = THINGS[r.t.type].item, f = fld(r.t), n = surplus(it) ? r.t[f] : 0; // immer den ganzen Vorrat mitnehmen, auch wenn es über die Ladung geht
      r.t[f] -= n; k.load += n; k.sum += n * ITEMS[it].price; k.cargo = k.cargo || {}; if (n) k.cargo[it] = (k.cargo[it] || 0) + n;
      earn(n * ITEMS[it].price); // gleich gutschreiben: Fahrzeuge werden nicht gespeichert, sonst wäre die Ladung beim Verlassen weg
      if (k.load >= lv.cap) { const s = [h, ...branches()].reduce((a, b) => roadLen(k, b) < roadLen(k, a) ? b : a); k.home = s; k.route = [{ ...parkSpot(k, s, h), sell: s }]; } // voll: restliche Halte auslassen, immer zum nächsten Händler (nicht verteilen)
      else { // unterwegs voll gewordenes verarbeitetes Gebäude (Arbeit steht), das kein Wagen eingeplant hat: nächstes gleich als nächsten Halt einschieben
        const busy = new Set(trucks.flatMap(o => o.route.map(q => q.t)));
        const hot = G.things.filter(t => !busy.has(t) && THINGS[t.type].kind !== 'grow' && t.out + THINGS[t.type].n > OUT_CAP && k.load + t.out <= lv.cap && surplus(THINGS[t.type].item));
        const t = hot.reduce((b, t) => !b || Math.hypot(pos(t).x - k.x, pos(t).y - k.y) < Math.hypot(pos(b).x - k.x, pos(b).y - k.y) ? t : b, null);
        if (t) { const p = pos(t); k.route.unshift({ t, x: p.x, y: p.y + 24, hot: true }); }
      }
    } else if (k.sum) { const s = r.sell || h; floater(s.x, s.y - 90, $t`🚚 +${k.sum} Fr.`); AU.sfx('cash'); k.load = k.sum = 0; k.cargo = {}; }
  }
}
function warnings() {
  const { sup, dem } = rates();
  const r = v => Math.round(v || 0);
  for (const t of G.things) {
    const d = THINGS[t.type]; t.warn = ''; t.wl = 'red';
    if (d.kind === 'grow') {
      if (t.store >= storeCap(d)) {
        if (hasConsumer(d.item)) { t.warn = $t`Zu viel ${ITEMS[d.item].name} – die Verarbeitung kommt nicht nach. Hol etwas ab oder baue mehr!`; t.wl = 'yellow'; }
        else t.warn = $t`Lager voll! Hol ${ITEMS[d.item].name} ab und bring es zum Händler.`;
      }
      continue;
    }
    if (t.out + d.n > OUT_CAP) {
      t.warn = hasConsumer(d.item) ? $t`Lager voll – die nächste Station schafft nicht so viel ${ITEMS[d.item].name}. Hol etwas ab und verkauf es!` : $t`Lager voll! Hol ${ITEMS[d.item].name} ab und verkauf es.`;
      if (hasConsumer(d.item)) t.wl = 'yellow';
      continue;
    }
    const miss = Object.keys(d.in).filter(k => (t.inS[k] || 0) < d.in[k]);
    if (miss.length && t.wait > 5) {
      const k = miss[0], name = ITEMS[k].name;
      if (!G.things.some(s => THINGS[s.type].item === k)) t.warn = $t`Es fehlt ${name} – niemand stellt das her! Kauf etwas, das ${name} macht.`;
      else {
        const auto = G.things.some(s => THINGS[s.type].item === k && (THINGS[s.type].kind === 'factory' || isAuto(s)));
        t.warn = auto ? $t`Wartet auf ${name} …` : $t`Bring ${name} her! (oder kauf eine Maschine, die automatisch erntet)`;
      }
      continue;
    }
    for (const k in d.in) if ((sup[k] || 0) < dem[k] * 0.9) { t.warn = $t`Zu wenig ${ITEMS[k].name}: gebraucht ${r(dem[k])}/min, hergestellt ${r(sup[k])}/min.`; t.wl = 'yellow'; break; }
  }
}

function score() { return G.things.length + G.land * 3 + (G.lkw || 0) * 2 + Object.values(G.tools).reduce((a, b) => a + b, 0) * 2; }
function checkStage() {
  let s = 0; STAGES.forEach((st, i) => { if (score() >= st.score) s = i; });
  if (s > G.stage) { G.stage = s; toast($t`🎉 ${P.name} ist gewachsen! Jetzt ${age()} Jahre alt.`); AU.sfx('grow'); }
}

function addInv(item, n) { G.inv[item] = (G.inv[item] || 0) + n; }
let toastKeys = {};
function toast(msg, key, soft) {
  if (key) { if (toastKeys[key] > time) return; toastKeys[key] = time + 10; }
  const d = document.createElement('div'); d.textContent = msg; if (soft) d.className = 'soft'; $('#toast').append(d);
  setTimeout(() => d.remove(), 10000);
}
// Meldungen sitzen über der Info-Leiste unten; deren Höhe wechselt (ein-/ausgeblendet, umgebrochen)
new ResizeObserver(() => { const px = $('#prox'); document.documentElement.style.setProperty('--proxh', px.hidden ? '0px' : px.offsetHeight + 10 + 'px'); }).observe($('#prox'));
function floater(x, y, text) { floaters.push({ x, y, text, t: 0 }); }
function take(t, field) { // Ware vom Lager in die Tasche
  const item = THINGS[t.type].item, free = bagCap() - bagCount(), n = Math.min(t[field], free);
  if (n <= 0) { toast($t`Deine Tasche ist voll! Bring alles zum Händler. 🧺`, 'full'); return; }
  t[field] -= n; addInv(item, n); AU.sfx('pop');
  const p = pos(t); floater(p.x, p.y - 50, `+${n} ${ITEMS[item].icon}`);
}

function reach(t) {
  const p = pos(t);
  if (t.type === 'feld') {
    const d = THINGS.feld, dx = Math.max(0, Math.abs(G.px - p.x) - d.w * T / 2), dy = Math.max(0, Math.abs(G.py - p.y) - d.h * T / 2);
    return Math.hypot(dx, dy) < T * 0.4 ? Math.hypot(dx, dy) : 1e9;
  }
  const r = { baum: 1.3, kuh: 1.4, rebe: 1.6, fischteich: 1.9, huhn: 1.7, masthuhn: 1.7, schwein: 1.7, kakaoimport: 1.8, kaffeeimport: 1.8, bienenhaus: 1.7, kartoffelfeld: 1.9, kastanienbaum: 1.4, geiss: 1.7, ruebenfeld: 1.9, kirschbaum: 1.4, erdbeerfeld: 1.9, schaf: 1.7, maisfeld: 1.9, kraeuterbeet: 1.9, wald: 1.4, kuerbisfeld: 1.9, quelle: 1.7 }[t.type] || 2.4;
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
const ghostPos = () => { const f = DECOS[G.carry]?.sell, r = f ? 2.2 * T : 46, p = { x: G.px + Math.cos(trH) * r, y: G.py + 2 + Math.sin(trH) * r }; return f ? filSnap(p.x, p.y) : p; }; // Zweigstelle ist gross: weiter vorne
let nearDeco = null;
// Zweigstelle: Haus + Parkplatz davor (Kacheln relativ zu x/y); FIL_BAY = Parkfelder (x-Versatz), Lastwagen stehen in Zeile FIL_PY
const FIL = [-2.5, 2.5, -2.3, 2.7], FIL_BAY = [-1.725, -0.575, 0.575, 1.725], FIL_PY = 1.55;
const branches = () => G.deco.filter(d => DECOS[d.type].sell);
// b.s = Grösse (1 = normal; auf Bauplätzen in einem Band kleiner, damit sie zwischen die Strassen passt)
const filRect = (b, m = 0) => { const s = b.s || 1; return [b.x + (FIL[0] * s - m) * T, b.x + (FIL[1] * s + m) * T, b.y + (FIL[2] * s - m) * T, b.y + (FIL[3] * s + m) * T]; };
const inFil = (x, y, b, m = 0) => { const r = filRect(b, m); return x > r[0] && x < r[1] && y > r[2] && y < r[3]; };
const overlap = (a, b) => a[0] < b[1] && a[1] > b[0] && a[2] < b[3] && a[3] > b[2];
function slotRect(k, p) { // Fläche eines Bauplatzes (Pixel), wie decoSpotOk sie freihält
  const a = AREAS[k];
  if (k === 'acker') return [p.x - 2.8 * T, p.x + 2.8 * T, p.y - 1.9 * T, p.y + 1.9 * T];
  return [p.x - a.dx / 2 * T, p.x + a.dx / 2 * T, p.y - (k === 'dorf' || a.hub ? 2.6 : 1.4) * T, p.y + 0.6 * T];
}
const underBranch = (k, p) => k !== 'weide' && branches().some(b => overlap(slotRect(k, p), filRect(b)));
const FIL_S = [1, 0.9, 0.8, 0.7, 0.6];
// Zweigstelle: grösste Grösse, die hier passt (oder 0). Leere Bauplätze darf sie belegen, besetzte nicht.
function filFitAt(x, y, s) {
  for (const a of [-2.4, -1.2, 0, 1.2, 2.4]) for (const b of [-2.2, -1, 0.3, 1.5, 2.6]) if (!decoSpotOk(x + a * s * T, y + b * s * T, 'plot')) return false;
  const r = filRect({ x, y, s });
  return !G.things.some(t => THINGS[t.type].area !== 'weide' && overlap(slotRect(THINGS[t.type].area, t), r))
    && !G.deco.some(d => DECOS[d.type].where === 'land' && inFil(d.x, d.y, { x, y, s }, 0.4));
}
const filFit = (x, y) => FIL_S.find(s => filFitAt(x, y, s)) || 0;
// Beim Tragen einrasten: zwischen zwei Band-Strassen genau in die Mitte rücken (sonst müsste man aufs Pixel genau zielen)
let filMemo = null;
function filSnap(x, y) {
  const key = [x >> 2, y >> 2, G.deco.length, G.things.length, G.land, G.ext?.length].join();
  if (filMemo?.key === key) return filMemo.p;
  const tx = x / T, ty = y / T, ys = basePaths().flatMap(p => p.slice(1).filter((q, j) => q[1] === p[j][1] && tx >= Math.min(q[0], p[j][0]) && tx <= Math.max(q[0], p[j][0])).map(q => q[1]));
  const l1 = Math.max(...ys.filter(v => v <= ty)), l2 = Math.min(...ys.filter(v => v > ty));
  let p = { x, y }; const s0 = filFit(x, y);
  if (isFinite(l1) && isFinite(l2)) for (const s of FIL_S.filter(s => s > s0)) { const yc = ((l1 + 1) + (l2 - 0.6)) / 2 - 0.2 * s; if (filFitAt(x, yc * T, s)) { p = { x, y: yc * T }; break; } } // grösser, wenn mittig
  filMemo = { key, p }; return p;
}
function decoSpotOk(x, y, k = G.carry) {
  if (DECOS[k]?.sell) return filFit(x, y);
  if (x < T || x > (WORLD.w - 1) * T || y < 2 * T || y > (WORLD.h - 0.3) * T || inLake(x, y, 0.6) || inMts(x, y) || nearRiver(x, y, 0.6 * T)) return false;
  for (const f of FIXED_E) if (Math.abs(x - f.x) < 3 * T && y < f.y + 0.8 * T && y > f.y - 1.5 * T) return false;
  if (k !== 'plot') for (const k in AREAS) { // ganze Bänder sind Bauland – auch leere Plätze, sonst baut man später auf die Deko (plot: Zweigstelle darf auf leere Plätze)
    if (k === 'weide') continue;
    const a = AREAS[k];
    for (let i = 0, n = slotsAvail(k); i < n; i++) {
      const p = slotPos(k, i);
      if (k === 'acker' ? Math.abs(x - p.x) < 2.8 * T && Math.abs(y - p.y) < 1.9 * T : Math.abs(x - p.x) < a.dx / 2 * T && y > p.y - (k === 'dorf' || a.hub ? 2.6 : 1.4) * T && y < p.y + 0.6 * T) return false;
    }
  }
  for (const p of paths()) for (let j = 1; j < p.length; j++) { const [ax, ay] = p[j - 1], [bx, by] = p[j]; if (x > (Math.min(ax, bx) - 0.8) * T && x < (Math.max(ax, bx) + 0.8) * T && y > (Math.min(ay, by) - 0.6) * T && y < (Math.max(ay, by) + 1) * T) return false; } // nicht auf den Weg
  if (sightsOn().some(s => !s.town && Math.abs(x / T - s.x) < s.w / 2 + 0.3 && y / T > s.y - s.h && y / T < s.y + 0.7)) return false; // Sehenswürdigkeiten
  if (townOn().some(b => Math.abs(x - b.x * T) < 1.1 * T && y > (b.y - 1.6) * T && y < (b.y + 0.5) * T)) return false; // Häuser vom Städtchen
  if (lotOn() && x > (LOT.x - 0.4) * T && x < (LOT.x + LOT.cols * LOT.bay + 1) * T && y > (LOT.y - 0.2) * T && y < (LOT.rows[1] + 1.4) * T) return false; // Parkplatz
  if (pastures().some(P => x > P.x * T - 20 && x < (P.x + P.w) * T + 20 && y > P.y * T - 20 && y < (P.y + P.h) * T + 30)) return false;
  if (branches().some(b => inFil(x, y, b, 0.3))) return false; // nicht in die Zweigstelle
  return !G.deco.some(d => DECOS[d.type].where === 'land' && dist(x, y, d.x, d.y) < 0.6 * T);
}
// Deko, die im Weg steht (altes Layout, oder ein Band ist darüber gewachsen), zieht auf die Wiese unter dem See
function fixDeco() {
  sightsOn(); // Plätze suchen, solange die Deko noch dasteht
  const land = G.deco.filter(d => DECOS[d.type].where === 'land'); G.deco = G.deco.filter(d => !land.includes(d));
  for (const d of land) {
    if (DECOS[d.type].sell) d.s = clamp(+d.s || 1, 0.6, 1);
    if (DECOS[d.type].sell && !decoSpotOk(d.x, d.y, d.type)) { // Zweigstelle: nur so weit wie nötig verschieben, sie soll nah bei den Gebäuden bleiben
      out: for (let r = 1; r < 60; r++) for (let a = 0; a < 8 * r; a++) { const x = d.x + Math.cos(a / (8 * r) * 6.283) * r * 0.5 * T, y = d.y + Math.sin(a / (8 * r) * 6.283) * r * 0.5 * T; if (decoSpotOk(x, y, d.type)) { Object.assign(d, { x, y }); break out; } }
    }
    if (!decoSpotOk(d.x, d.y, d.type)) for (let i = 0; i < 600; i++) { const x = (2.5 + (i % 12) * 1.2) * T, y = (LAKE.y + LAKE.ry + 2 + Math.floor(i / 12) * 1.3) * T; if (decoSpotOk(x, y, d.type)) { Object.assign(d, { x, y }); break; } }
    if (DECOS[d.type].sell) d.s = decoSpotOk(d.x, d.y, d.type) || d.s;
    G.deco.push(d);
  }
}
function placeDeco() {
  if (!G.carry) return;
  const { x, y } = ghostPos();
  const ok = decoSpotOk(x, y);
  if (!ok) { AU.sfx('no'); toast($t`Hier ist kein Platz – such dir ein freies Stück Wiese! 🌼`, 'noplace'); return; }
  const d = { id: G.nid++, type: G.carry, x, y };
  if (DECOS[G.carry].sell) { d.s = ok; toast($t`🛣️ Die Bauarbeiter bauen gleich eine Strasse zur Zweigstelle!`); }
  G.deco.push(d); G.carry = null; AU.sfx('buy'); save(); hud();
}
function pickDeco(d) { if (G.carry) return; G.deco.splice(G.deco.indexOf(d), 1); G.carry = d.type; AU.sfx('pop'); hud(); }
function buyDeco(k) {
  const d = DECOS[k];
  if (d.where !== 'land') { G.deco.push({ id: G.nid++, type: k }); toast($t`${d.name} ist da!` + ' ' + (d.where === 'see' ? $t`Schau auf den ${P.name}see 🌊` : d.where === 'luft' ? $t`Schau in den Himmel ☁️` : $t`Schau hinauf in die Berge 🏔️`)); return; }
  G.carry = k; shopDismiss = true; $('#shop').hidden = true;
  toast($t`Du trägst jetzt: ${d.name}. Lauf dorthin, wo es stehen soll, und tippe 📍 Hier abstellen!`);
}

function interact(dt) {
  near = null; let nd = 1e9;
  for (const t of G.things.concat(FIXED_E, branches())) { const d = reach(t); if (d < nd) { nd = d; near = t; } }
  if (near !== lastNear) {
    lastNear = near;
    if (near && !G.seen[near.type]) { G.seen[near.type] = 1; showInfo(near); }
  }
  const d = near && THINGS[near.type];
  // Ernten
  if (d && d.kind === 'grow') {
    if (near.store > 0 && surplus(d.item)) take(near, 'store');
    if (near.ripe && !isAuto(near)) {
      if (bagCount() >= bagCap()) { toast($t`Deine Tasche ist voll! Bring alles zum Händler. 🧺`, 'full'); harvest = null; }
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
  if ((near?.type === 'haendler' || DECOS[near?.type]?.sell) && bagCount() > 0) {
    let sum = 0; for (const k in G.inv) sum += G.inv[k] * ITEMS[k].price;
    G.inv = {}; earn(sum); AU.sfx('cash'); floater(near.x, near.y - 90, `+${sum} Fr. 💰`);
  }
  nearDeco = null; let dd = 1.1 * T;
  if (!near) for (const o of G.deco) if (DECOS[o.type].where === 'land' && !DECOS[o.type].sell) { const k = dist(G.px, G.py, o.x, o.y); if (k < dd) { dd = k; nearDeco = o; } }
  if (near?.type === 'laden') { if (!shopDismiss && $('#shop').hidden) openShop(); }
  else { shopDismiss = false; if (!$('#shop').hidden) $('#shop').hidden = true; }
  visitSights();
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
function hud() {
  if (!G) return;
  $('#who').textContent = $t`👦🏼 ${P.name} · ${age()} Jahre`;
  $('#money').textContent = `💰 ${G.money} ${$t`Fr.`}`;
  const inv = Object.entries(G.inv).map(([k, n]) => `${ITEMS[k].icon}${n}`).join(' ');
  $('#bag').innerHTML = `${TOOLS.tragen.icon} <small>(${bagCount()}/${bagCap()})</small> ${inv || `<small>${$t`leer`}</small>`}`;
  // Info-Leiste zum nächsten Ort
  const t = near, px = $('#prox');
  const set = (html, ...fns) => {
    if (px.dataset.html !== html) { px.dataset.html = html; px.innerHTML = html; } // nicht ständig neu bauen, sonst gehen Tipper verloren
    px.querySelectorAll('button').forEach((b, i) => b.onclick = fns[i]);
    px.hidden = false;
  };
  if (G.carry) {
    const dc = DECOS[G.carry], g = ghostPos(), ok = decoSpotOk(g.x, g.y);
    return set(`<div><b>${dc.icon} ${dc.name}</b><div>${ok ? $t`Lauf dorthin, wo es stehen soll.` : `<span class="warn">${$t`Hier ist kein Platz.`}</span> ${$t`Geh auf eine freie Wiese.`}`}</div></div><button ${ok ? '' : 'disabled'}>${$t`📍 Hier abstellen`}</button>`, placeDeco);
  }
  if (!t && nearDeco) {
    const dc = DECOS[nearDeco.type], o = nearDeco;
    return set(`<div><b>${dc.icon} ${dc.name}</b><div>${$t`Deko – macht nichts, ist aber schön! 😊`}</div></div><button>${$t`✋ Umstellen`}</button><button>ℹ️</button>`, () => pickDeco(o), () => showInfo(dc));
  }
  if (!t) { px.hidden = true; return; }
  if (DECOS[t.type]?.sell) {
    const dc = DECOS[t.type], n = trucks.filter(k => k.home === t && !k.route.length).length;
    return set(`<div><b>${dc.icon} ${dc.name}</b><div>${$t`Komm mit vollen Taschen – du bekommst Geldscheine!`}${n ? ' ' + $t`🚛 ${n} Fahrzeuge parken hier.` : ''}</div></div><button>${$t`✋ Umstellen`}</button><button>ℹ️</button>`, () => pickDeco(t), () => showInfo(dc));
  }
  const d = THINGS[t.type] || t;
  let st = '';
  if (d.kind === 'grow') {
    const tl = toolLv(d.tool);
    if (isAuto(t)) st = $t`🤖 ${tl.name} erntet automatisch · Lager ${t.store}/${storeCap(d)} ${ITEMS[d.item].icon}`;
    else st = t.ripe ? $t`Reif! Bleib stehen – du erntest mit: <b>${tl.name}</b>` : $t`Wächst … ${Math.floor(t.timer / d.time * 100)} %`;
  } else if (d.kind === 'factory') {
    st = Object.keys(d.in).map(k => `${ITEMS[k].icon} ${t.inS[k] || 0}/${d.in[k]}`).join(' + ') + ` → ${ITEMS[d.item].icon} ${t.out}` + (t.working ? $t` ⚙️ arbeitet` : '');
  } else st = { haendler: $t`Komm mit vollen Taschen – du bekommst Geldscheine!`, laden: $t`Hier kannst du einkaufen.`, hof: $t`Dein Zuhause.` }[t.type] || '';
  const w = t.warn ? `<div class="warn">❗ ${esc(t.warn)}</div>` : '';
  set(`<div><b>${d.icon || ''} ${d.name}</b><div>${st}</div>${w}</div><button>${$t`ℹ️ Wie geht das?`}</button>`, () => showInfo(t));
}

// =================== Land-Fest: grosse Animation, wenn eine Land-Stufe etwas Neues bringt ===================
function landFeats(l) { // was kommt bei Land-Stufe l dazu? [{ic, t, d}]
  const f = [];
  for (const [k, a] of Object.entries(AREAS)) if (a.from === l) {
    const th = Object.values(THINGS).filter(t => t.land === l && !UNLOCKS.flat().some(u => THINGS[u] === t)), tl = Object.values(TOOLS).find(t => t.land === l);
    f.push({ ic: a.icon || th.find(t => t.area === k)?.icon || '🎉', t: a.hub ? $t`Neues Geschäftszentrum im Südosten: ${a.name}!` : $t`Neues Gebiet im Süden: ${a.name}!`,
      d: th.map(t => `${t.icon} ${t.name}`).concat(tl ? [`${tl.icon} ${tl.name}`] : []).join(' · ') });
  }
  if (!f.length) { // Stufe ohne neues Gebiet: neue Gebäude in einem Geschäftszentrum
    const th = Object.values(THINGS).filter(t => t.land === l && !UNLOCKS.flat().some(u => THINGS[u] === t));
    if (th.length) f.push({ ic: th[0].icon, t: $t`${AREAS[th[0].area].name} wächst!`, d: th.map(t => `${t.icon} ${t.name}`).join(' · ') });
  }
  const i = HOF_LV.indexOf(l);
  if (i >= 0) f.push({ ic: '🏡', t: $t`Dein Bauernhof bekommt ${HOF_ADD[i]}!`, d: $t`Lauf hin und schau ihn dir an!` });
  if (SHOP_LV.includes(l) || i === 1 || i === 3) f.push({ ic: '🏪', t: $t`Laden und Händler ziehen in grössere Häuser!`, d: $t`Mehr Regale, mehr Kundschaft, mehr Geld 💰` });
  if (l === 20) f.push({ ic: '⛪', t: $t`Neu im Laden: Kirche und Gülle-Verteiler`, d: $t`Die Gülle stinkt – aber dein Weizen wächst doppelt! 💩` });
  const sp = TOOLS.spedition.levels.find(v => v.land === l);
  if (sp) f.push({ ic: '🚛', t: $t`Neu im Laden: ${sp.name}`, d: $t`Holt ${sp.cap} Waren auf einmal – unter 🔧 Werkzeuge 🚚` });
  if (DECOS.filiale.more.includes(l)) f.push({ ic: '🏪', t: $t`Jetzt bis ${DECOS.filiale.max + 2 * (DECOS.filiale.more.indexOf(l) + 1)} Händler-Zweigstellen!`, d: $t`Noch kürzere Wege für deine Lastwagen 🚛` });
  if (l === DECOS.filiale.land) f.push({ ic: '🏪', t: $t`Neu im Laden: Händler-Zweigstelle`, d: $t`Deine Lastwagen verkaufen beim nächsten Händler – kürzere Wege! 🚛` });
  const nb = TOWN.find(b => b.lv === l);
  if (nb) f.push({ ic: nb.icon || (nb.k === 'chalet' ? '🛖' : '🏠'), t: $t`Dein Hof wächst zum Städtchen: ${nb.name ? $t([nb.name]) : $t`ein neues Haus`}!`, d: nb.se ? $t`Es steht in der Neustadt ganz im Südosten!` : $t`Neue Nachbarn ziehen ein – sie finden dein Dorf toll!` });
  else if (TOWN.some(b => l > b.lv && (l - b.lv) % 40 === 0 && (b.f0 || 1) + (l - b.lv) / 40 <= (b.max || (b.k === 'chalet' ? 3 : 4)))) f.push({ ic: '🏗️', t: $t`Im Städtchen wird ein Haus höher!`, d: $t`Ein Stock mehr – bis zu den Wolken? ☁️` });
  for (const s of Object.values(SIGHTS)) if (s.lv === l) f.push({ ic: s.icon, t: $t`Neue Sehenswürdigkeit am Weg: ${s.name}!`, d: $t`Lauf hin und hol dir den Stempel für deinen Reisepass! 📸` });
  return f;
}
const FUN = [$t`Die Kühe rufen: Muuuh-ega! 🐄`, $t`Sogar die Geissen machen einen Freudensprung! 🐐`, $t`Die Hühner gackern vor Stolz! 🐔`, $t`Das Murmeli pfeift dir ein Ständchen! 🎶`, $t`Der Nachbar staunt mit offenem Mund! 😮`, $t`Die Säuli wälzen sich vor Freude im Dreck! 🐖`];
function fest(l, f) {
  let nx = l + 1; while (nx < l + 60 && !landFeats(nx).length) nx++;
  let pv = l - 1; while (pv > 0 && !landFeats(pv).length) pv--;
  const el = $('#fest'), conf = Array.from({ length: 40 }, (_, k) => `<i style="left:${Math.random() * 100}%;background:hsl(${k * 37} 85% 58%);animation-delay:${Math.random() * 1.5}s;animation-duration:${2.5 + Math.random() * 2}s"></i>`).join('');
  el.innerHTML = `${conf}<div class="fbox"><div class="fbig">${f.map(x => `<span>${x.ic}</span>`).join('')}</div>
    <h2>${$t`Land-Stufe ${l}!`}</h2>
    ${f.map((x, k) => `<div class="feat" style="animation-delay:${0.6 + k * 0.35}s"><span>${x.ic}</span><div><b>${x.t}</b><small>${x.d}</small></div></div>`).join('')}
    <p class="fun">${FUN[l % FUN.length]}</p>
    <div class="prog"><i style="--w:${Math.round(100 * (l - pv) / (nx - pv))}%"></i></div>
    <small>${$t`Super gemacht! Nächste Überraschung bei Land-Stufe ${nx} 🎁`}</small>
    <button class="btn" data-ok>${$t`Juhui, weiter!`}</button></div>`;
  el.hidden = false; AU.sfx('grow'); setTimeout(() => AU.sfx('cash'), 700);
  speak(`${$t`Land-Stufe ${l}!`} ${f.map(x => x.t).join(' ')} ${FUN[l % FUN.length]}`);
  el.querySelector('[data-ok]').onclick = () => { el.hidden = true; window.speechSynthesis?.cancel(); };
}

// =================== Fenster: Info, Laden, Plan ===================
function closeModals() { for (const id of ['#shop', '#plan', '#info']) $(id).hidden = true; shopDismiss = true; }
function modal(el, title, body, extraHead = '') {
  el.innerHTML = `<div class="box"><header>${title}<button data-x>✕</button></header>${extraHead}<div class="body">${body}</div></div>`;
  el.querySelector('[data-x]').onclick = () => { el.hidden = true; if (el.id === 'shop') shopDismiss = true; };
  el.onclick = e => { if (e.target === el) { el.hidden = true; if (el.id === 'shop') shopDismiss = true; } };
  el.hidden = false; focusInput(el);
}
// Vorlesen (Browser-Stimme in der gewählten Sprache); Info-Fenster zu oder Ton aus → Stimme aus
const VOICE_LANG = { de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-GB' };
function speak(html) {
  if (!window.speechSynthesis || !AU.on) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(html.replace(/<[^>]+>/g, ' . ').replace(/\p{Extended_Pictographic}/gu, ''));
  const vs = speechSynthesis.getVoices(), L = VOICE_LANG[LANG] || 'de-CH';
  u.voice = vs.find(v => v.lang.replace('_', '-') === L) || vs.find(v => v.lang.startsWith(L.slice(0, 2))) || null;
  u.lang = L; u.rate = 0.95;
  speechSynthesis.speak(u);
}
new MutationObserver(() => { if ($('#info').hidden) window.speechSynthesis?.cancel(); }).observe($('#info'), { attributes: true, attributeFilter: ['hidden'] });
function showInfo(t) {
  const d = THINGS[t.type] || DECOS[t.type] || t;
  let extra = '';
  if (d.kind === 'grow') { const tl = toolLv(d.tool); extra = $t`<p><b>Dein Werkzeug: ${tl.name}.</b> ${tl.info}</p><p>Ergibt ${d.n} ${ITEMS[d.item].icon} ${ITEMS[d.item].name} alle ${d.time} Sekunden.</p>`; }
  if (d.kind === 'factory') extra = $t`<p><b>Rezept:</b> ${recipe(d)} in ${d.time} Sekunden.</p>`;
  modal($('#info'), $t`${d.icon || '💡'} ${d.name} – Wusstest du?`, `<p>${d.info}</p>${extra}<button class="btn" data-ok>${$t`Verstanden!`}</button>`);
  speak(`${d.name}. ${d.info} ${extra}`);
  $('#info [data-ok]').onclick = () => $('#info').hidden = true;
}
const recipe = d => Object.entries(d.in).map(([k, v]) => `${v} ${ITEMS[k].icon} ${ITEMS[k].name}`).join(' + ') + ` → ${d.n} ${ITEMS[d.item].icon} ${ITEMS[d.item].name}`;

let shopTab = 0, planCat = null, shopCat = null, planView = 'ketten';
// Gebäude-Reiter: nach Rohstoff gruppiert (Ware → erste Zutat bis zum Rohstoff), innerhalb nach Verarbeitungsstufe
const maker = it => Object.keys(THINGS).find(k => THINGS[k].item === it);
const depth = it => { const d = THINGS[maker(it)]; return d?.in ? 1 + Math.max(...Object.keys(d.in).map(depth)) : 0; };
// Rohstoff-Reiter (Produktions-Plan und Laden/Gebäude): Rohstoff, aus dem am meisten drinsteckt (Kuchen: 3 Äpfel > 1 Mehl → Äpfel)
const catOf = k => { const d = THINGS[k]; if (d.kind === 'grow') return d.item; const it = Object.entries(d.in).sort((a, b) => b[1] - a[1])[0][0], m = maker(it); return m ? catOf(m) : it; };
const catTabs = (cats, on, attr, dot = () => false) => `<div class="tabs cats">${cats.map(c => `<button data-${attr}="${c}" class="${c === on ? 'on' : ''}">${ITEMS[c].icon} ${ITEMS[c].name}${dot(c) ? '<i class="dot"></i>' : ''}</button>`).join('')}</div>`; // dot: hier gibt es Neues
function centerTab(el) { for (const tb of el.querySelectorAll('.tabs')) { const on = tb.querySelector('.on'); if (on && tb.scrollWidth > tb.clientWidth) tb.scrollLeft = on.offsetLeft - (tb.clientWidth - on.offsetWidth) / 2; } } // aktiver Reiter sichtbar (Handy: wischbare Reihe)
function shopList() {
  const tabs = [[], [], [], [], []];
  for (const [k, d] of Object.entries(THINGS)) {
    if (!avail(k)) continue;
    const free = freeSlot(d.area) >= 0;
    tabs[d.kind === 'grow' ? 0 : 1].push({
      cat: catOf(k), depth: depth(d.item), icon: d.icon, name: d.name, price: d.price, info: d.info, neu: !G.things.some(t => t.type === k),
      desc: (d.kind === 'grow' ? $t`Gibt ${d.n} ${ITEMS[d.item].icon} alle ${d.time} s` : recipe(d)) + ` · 1 ${ITEMS[d.item].icon} = ${ITEMS[d.item].price} ${$t`Fr.`}`, // Wert der Ware beim Händler
      note: free ? $t`kommt auf: ${AREAS[d.area].name}` : $t`⚠️ Kein Platz – kauf mehr Land!`, can: free,
      buy: () => {
        const t = addThing(k); if (t && d.area === 'terminal') trains.push({ t, age: 0, y: trainLaneY(t), first: true }); toast($t`${d.name} steht jetzt auf: ${AREAS[d.area].name}`); if (!G.seen[k]) { G.seen[k] = 1; showInfo(t); }
        const u = checkUnlock(k);
        if (u) { shopCat = catOf(u[0]); toast($t`🎉 Neues Rezept freigeschaltet: ${u.map(f => THINGS[f].icon + ' ' + THINGS[f].name).join(' → ')} – schau im Laden bei 🏭 Gebäude!`); AU.sfx('grow'); }
      },
    });
  }
  if (G.land >= 20) tabs[1].push({ cat: 'weizen', depth: 9, icon: '💩', name: $t`Gülle-Verteiler`, price: 3000, can: !G.guelle, neu: !G.guelle,
    desc: $t`Doppelte Ernte auf allen Weizenfeldern`, note: G.guelle ? $t`✅ Schon gekauft` : $t`braucht Tiere, die Dung machen (Kühe, Säuli, Hühner)`,
    info: $t`Kuhfladen und Mist werden in einer grossen Grube gesammelt und mit Wasser zu Gülle verrührt. Der Bauer fährt sie mit dem Güllefass aufs Feld. Darin stecken Stickstoff, Phosphor und Kalium – Futter für die Pflanzen! So wächst der Weizen viel kräftiger. Es stinkt zwar, aber nur ein paar Tage.`,
    buy: () => { G.guelle = 1; toast(guelleOn() ? $t`💩 Deine Felder werden gedüngt – jetzt doppelte Weizen-Ernte!` : $t`💩 Gülle-Verteiler steht – kauf Tiere, damit es Dung gibt!`); AU.sfx('grow'); } });
  for (const [k, line] of Object.entries(TOOLS)) {
    if (G.land < (line.land || 0)) continue;
    const lv = G.tools[k], next = line.levels[lv + 1];
    // Spediteur: zusätzliches Fahrzeug kaufen ist ein eigener Eintrag, getrennt vom Upgrade auf die nächste Stufe
    if (lv && k === 'spedition') tabs[2].push({ icon: '🚛', name: $t`Noch ein ${line.levels[lv].name}`, price: line.levels[lv].price, info: line.levels[lv].info, can: true,
      desc: $t`${line.name} · du hast ${truckCount()} Fahrzeuge`, note: $t`fährt zusätzlich und holt noch mehr Waren ab`,
      buy: () => { G.lkw = (G.lkw || 0) + 1; toast($t`🚛 Du hast jetzt ${truckCount()} Fahrzeuge!`); } });
    if (!next) { tabs[2].push({ icon: line.icon, name: `${line.name}: ${line.levels[lv].name}`, desc: $t`Beste Stufe erreicht! 🏆`, info: line.levels[lv].info, can: false, price: 0 }); continue; }
    if (next.land > G.land) { tabs[2].push({ icon: line.icon, name: next.name, price: next.price, info: next.info, can: false, desc: $t`${line.name} · jetzt: ${line.levels[lv].name}`, note: $t`🔒 ab Land-Stufe ${next.land}` }); continue; }
    tabs[2].push({
      // Upgrade ersetzt alle Fahrzeuge, kostet aber fix pro Stufe – mehr Fahrzeuge machen es nicht teurer
      icon: line.icon, name: next.name, price: next.price, info: next.info, can: true,
      desc: $t`${line.name} · jetzt: ${line.levels[lv].name}` + (k === 'spedition' && truckCount() > 1 ? ` (${truckCount()}×)` : ''),
      note: next.every ? $t`holt ${next.cap} fertige Waren alle ${next.every} s und verkauft sie` : next.cap ? $t`trägt ${next.cap} statt ${line.levels[lv].cap} Waren` : next.auto ? $t`🤖 arbeitet automatisch!` : $t`${next.speed / line.levels[lv].speed}× schneller`,
      buy: () => { G.tools[k]++; modal($('#info'), $t`${line.icon} ${next.name} – so funktioniert's`, `<p>${next.info}</p><button class="btn" data-ok>${$t`Super!`}</button>`); speak(`${next.name}. ${next.info}`); $('#info [data-ok]').onclick = () => $('#info').hidden = true; },
    });
  }
  if (G.land >= DECOS.filiale.land) { // Händler-Zweigstelle: Lastwagen verkaufen beim nächsten Händler und parken dort
    const d = DECOS.filiale, n = decoCount('filiale'), full = n >= filMax(), busy = !!G.carry;
    tabs[2].push({ icon: d.icon, name: d.name, price: d.price + n * 25000, info: d.info, can: !full && !busy, neu: !n,
      desc: $t`Du stellst sie hin, wo du willst – auch auf leere Bauplätze. Sie bekommt eine eigene Strasse, und deine Lastwagen verkaufen beim nächsten Händler`,
      note: full ? $t`✅ Schon gekauft` : busy ? $t`Stell zuerst ${DECOS[G.carry].name} ab` : n ? $t`Hast du schon ${n}×` : '',
      buy: () => buyDeco('filiale') });
  }
  const lp = LAND_PRICES[G.land] ?? LAND_PRICES.at(-1) + (G.land - LAND_PRICES.length + 1) * 2000;
  tabs[3].push({
    icon: '🗺️', name: $t`Land Stufe ${G.land + 1}`, price: lp, can: true,
    desc: $t`Mehr Platz für Felder, Bäume, Kühe und Gebäude`, info: $t`Mit mehr Land kannst du deine Welt vergrössern. Bauern kaufen oder pachten Land von Nachbarn.`,
    buy: () => {
      G.land++; fitWorld(); relayout(); fixDeco();
      const f = landFeats(G.land);
      if (f.length) { closeModals(); fest(G.land, f); } else toast($t`🗺️ Deine Welt ist grösser geworden! Neue Plätze sind gestrichelt markiert.`);
    },
  });
  if (G.land >= 20) tabs[3].push({ icon: '⛪', name: $t`Kirche`, price: 20000, can: !G.kirche, neu: !G.kirche,
    desc: $t`Steht neben deinem Bauernhof`, note: G.kirche ? $t`✅ Schon gekauft` : '',
    info: $t`Fast jedes Schweizer Dorf hat eine Kirche mit einem hohen Turm. Die Turmuhr zeigt allen die Zeit, und die Glocken läuten zum Mittag und am Sonntag. Früher hörte man sie bis weit auf die Felder hinaus.`,
    buy: () => { G.kirche = 1; toast($t`⛪ Deine Kirche steht jetzt neben dem Bauernhof!`); AU.sfx('grow'); } });
  for (const [k, d] of Object.entries(DECOS)) {
    if (d.land) continue; // Zweigstelle: steht bei den Werkzeugen
    const full = d.max && decoCount(k) >= d.max, busy = d.where === 'land' && G.carry;
    tabs[4].push({ icon: d.icon, name: d.name, price: d.price, info: d.info, can: !full && !busy, neu: !decoCount(k),
      desc: { land: $t`Du stellst es hin, wo du willst`, see: $t`Schwimmt auf dem See`, luft: $t`Fliegt über deine Welt`, berg: $t`Fährt in die Berge` }[d.where],
      note: full ? $t`✅ Schon gekauft` : busy ? $t`Stell zuerst ${DECOS[G.carry].name} ab` : decoCount(k) ? $t`Hast du schon ${decoCount(k)}×` : '',
      buy: () => buyDeco(k) });
  }
  return tabs;
}
const moneyTag = () => `<small class="money" style="font-weight:600;font-size:16px">${$t`– du hast ${G.money} Fr.`}</small>`;
setInterval(() => { // Laden/Cockpit offen: Kontostand und Kaufen-Knöpfe 1×/s nachführen, ohne neu zu zeichnen (Scroll, ℹ️ bleiben)
  if (!G) return;
  for (const el of [$('#shop'), $('#plan')]) if (!el.hidden) {
    el.querySelectorAll('.money').forEach(s => s.outerHTML = moneyTag());
    el.querySelectorAll('[data-buy]').forEach(b => b.disabled = !('can' in b.dataset) || G.money < +b.dataset.price);
  }
}, 1000);
function openShop() {
  const tabs = shopList(), names = [$t`🌱 Tiere & Pflanzen`, $t`🏭 Gebäude`, $t`🔧 Werkzeuge`, $t`🗺️ Land`, $t`🏔️ Deko`];
  let L = tabs[shopTab], head = `<div class="tabs">${names.map((n, i) => `<button data-tab="${i}" class="${i === shopTab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  if (shopTab === 1) { // Gebäude: ein Reiter pro Rohstoff wie im Produktions-Plan, innerhalb nach Verarbeitungsstufe
    const cats = Object.keys(ITEMS).filter(c => L.some(it => it.cat === c));
    if (!cats.includes(shopCat)) shopCat = cats.includes(planCat) ? planCat : cats.find(c => L.some(it => it.cat === c && it.neu)) || cats[0];
    head += catTabs(cats, shopCat, 'cat', c => L.some(it => it.cat === c && it.neu));
    L = L.filter(it => it.cat === shopCat).sort((a, b) => a.depth - b.depth || a.price - b.price);
  }
  const body = `<div class="cards">${L.map((it, i) => `<div class="card"><div class="ic">${it.icon}${it.neu ? `<span class="neu">${$t`Neu`}</span>` : ''}</div><b>${it.name}</b><small>${it.desc}</small>${it.note ? `<small>${it.note}</small>` : ''}
    <div class="more" hidden>${it.info}</div>
    <div class="row">${it.price ? `<span class="price">${it.price} ${$t`Fr.`}</span>` : '<span class="price"></span>'}<button class="i" data-info="${i}">ℹ️</button>${it.buy ? `<button class="k" data-buy="${i}" data-price="${it.price}" ${it.can ? 'data-can' : ''} ${!it.can || G.money < it.price ? 'disabled' : ''}>${$t`Kaufen`}</button>` : ''}</div></div>`).join('')}</div>`;
  modal($('#shop'), `${$t`🛒 Laden`} ${moneyTag()}`, body, head);
  const el = $('#shop');
  el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = +b.dataset.tab; openShop(); });
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { shopCat = b.dataset.cat; openShop(); });
  centerTab(el);
  el.querySelectorAll('[data-info]').forEach(b => b.onclick = () => { const m = b.closest('.card').querySelector('.more'); m.hidden = !m.hidden; });
  el.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    const it = L[+b.dataset.buy];
    if (G.money < it.price) { AU.sfx('no'); return; }
    G.money -= it.price; it.buy(); AU.sfx('buy'); save(); hud();
    if (!$('#shop').hidden) { const y = el.querySelector('.body').scrollTop; openShop(); el.querySelector('.body').scrollTop = y; } // Scrollposition behalten
  });
}

// Cockpit: Kennzahlen jetzt, Verlauf über die Spielminuten, Auslastung je Rohstoff-Reiter
const pct = v => `${Math.round(v * 100)}%`, fr = v => `${Math.round(v)} ${$t`Fr.`}`;
const statusCol = v => v >= 0.8 ? '#3d8b2f' : v >= 0.5 ? '#e39b1c' : '#d23b2b';
function chart(title, pts, col, fmt, bar, max) { // pts: [{ h: Verlaufspunkt, v: Wert }], eine Reihe pro Diagramm
  if (pts.length < 2) return `<div class="chart"><b>${title}</b><p class="nodata">${$t`Noch zu wenig Daten – spiel ein paar Minuten weiter.`}</p></div>`;
  const W = 320, Hh = 110, top = 18, bot = 16, n = pts.length, mx = max ?? Math.max(1, ...pts.map(p => p.v)) * 1.1, cw = (W - 8) / n;
  const x = i => 4 + cw * (i + 0.5), y = v => top + (Hh - top - bot) * (1 - Math.max(0, v) / mx);
  const df = new Intl.DateTimeFormat(LANG, { weekday: 'short', hour: '2-digit', minute: '2-digit' }), when = h => df.format(h.t * 6e4); // toLocaleString baut pro Aufruf einen Formatter – bei 240 Punkten sekundenlang auf Tablets
  const marks = bar ? pts.map((p, i) => `<rect x="${(x(i) - cw * 0.4).toFixed(1)}" y="${y(p.v).toFixed(1)}" width="${Math.max(1, cw * 0.8).toFixed(1)}" height="${(Hh - bot - y(p.v)).toFixed(1)}" rx="${Math.min(3, cw * 0.3).toFixed(1)}" fill="${col}"/>`).join('')
    : `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ')}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(n - 1)}" cy="${y(pts.at(-1).v)}" r="4" fill="${col}" stroke="#fff" stroke-width="2"/>`;
  const hits = pts.map((p, i) => `<rect class="hit" x="${(4 + cw * i).toFixed(1)}" y="0" width="${cw.toFixed(1)}" height="${Hh}" data-v="${when(p.h)}: ${fmt(p.v)}"><title>${when(p.h)}: ${fmt(p.v)}</title></rect>`).join('');
  const span = pts.at(-1).h.p - pts[0].h.p;
  return `<div class="chart"><b>${title}</b> <span class="val">${fmt(pts.at(-1).v)}</span><svg viewBox="0 0 ${W} ${Hh}"><line x1="4" x2="${W - 4}" y1="${top}" y2="${top}" stroke="#e6d6b5" stroke-dasharray="3 3"/><line x1="4" x2="${W - 4}" y1="${Hh - bot}" y2="${Hh - bot}" stroke="#c9b48a"/>
    <text x="4" y="12" font-size="11" fill="#777">${fmt(mx)}</text><text x="4" y="${Hh - 3}" font-size="11" fill="#777">${$t`vor ${span} Spielmin.`}</text><text x="${W - 4}" y="${Hh - 3}" font-size="11" fill="#777" text-anchor="end">${$t`jetzt`}</text>${marks}${hits}</svg></div>`;
}
function cockpit(types, cats, cnt, sup, dem, u) {
  const H = G.hist, last = H.at(-1);
  const at = dp => [...H].reverse().find(h => h.p <= last.p - dp) || H[0]; // Verlaufspunkt vor dp Spielminuten
  const rate = (a, b) => a && b && a.p > b.p ? (a.e - b.e) / (a.p - b.p) : null; // Einnahmen Fr./min zwischen zwei Punkten
  const inc = last && rate(last, at(10)), prev = last && rate(at(10), at(20));
  const poss = Object.keys(sup).reduce((a, it) => a + Math.max(0, sup[it] - (dem[it] || 0)) * ITEMS[it].price, 0); // was der Plan zum Verkaufen hergibt
  const val = k => cnt[k] * THINGS[k].n / THINGS[k].time * 60 * ITEMS[THINGS[k].item].price;
  const flow = ks => { const f = ks.filter(k => cnt[k] && THINGS[k].in), all = f.reduce((a, k) => a + val(k), 0); return all ? f.reduce((a, k) => a + val(k) * (u[k] ?? 1), 0) / all : null; };
  const now = busyShare(), a10 = H.filter(h => h.p > (last?.p ?? 0) - 10), avgA = a10.length ? a10.reduce((s, h) => s + h.a, 0) / a10.length / 100 : null, fl = flow(types);
  const trend = inc != null && prev ? (inc >= prev ? `<span style="color:#3d8b2f">▲ +${pct(inc / prev - 1)}</span>` : `<span style="color:#d23b2b">▼ −${pct(1 - inc / prev)}</span>`) + ' ' + $t`zu vorher` : '';
  const kpi = (ic, name, v, sub, bar) => `<div class="kpi"><small>${ic} ${name}</small><b>${v}</b>${bar != null ? `<i style="--w:${Math.min(100, bar * 100)}%;--c:${statusCol(bar)}"></i>` : ''}<span>${sub}</span></div>`;
  const kpis = `<div class="kpis">${[
    kpi('💰', $t`Einnahmen`, inc != null ? `${fr(inc)}/min` : '–', inc != null ? `${$t`letzte 10 Spielmin.`} ${trend}` : $t`misst ab jetzt jede Spielminute`),
    kpi('🎯', $t`Ausbeute`, inc != null && poss ? pct(inc / poss) : '–', $t`von möglich ${fr(poss)}/min`, inc != null && poss ? inc / poss : null),
    kpi('⚙️', $t`Auslastung`, pct(now), avgA != null ? $t`Ø 10 Min.: ${pct(avgA)} · ${G.things.filter(busy).length} von ${G.things.length} arbeiten` : $t`${G.things.filter(busy).length} von ${G.things.length} arbeiten`, now),
    kpi('🔗', $t`Ketten-Fluss`, fl != null ? pct(fl) : '–', $t`so schnell laufen die Gebäude mit den Zutaten, die da sind`, fl),
  ].join('')}</div>`;
  const incPts = H.slice(1).map((h, i) => ({ h, v: rate(h, H[i]) }));
  const charts = `<div class="charts">${[
    chart($t`💰 Einnahmen pro Minute`, incPts, '#3d8b2f', v => `${fr(v)}/min`, true),
    chart($t`⚙️ Auslastung`, H.map(h => ({ h, v: h.a / 100 })), '#3e7bc4', pct, false, 1),
    chart($t`🏦 Kontostand`, H.map(h => ({ h, v: h.m })), '#a8743f', fr),
    chart($t`🏗️ Gebäude, Tiere & Pflanzen`, H.map(h => ({ h, v: h.n })), '#7a5a9e', v => `${Math.round(v)}`),
  ].join('')}</div>`;
  const rows = cats.map(c => {
    const ks = types.filter(k => catOf(k) === c && cnt[k]); if (!ks.length) return '';
    const b = busyShare(G.things.filter(t => ks.includes(t.type))), f = flow(ks), stuck = G.things.filter(t => ks.includes(t.type) && !busy(t)).length;
    return `<button class="crow" data-go="${c}"><span>${ITEMS[c].icon} ${ITEMS[c].name}</span><i style="--w:${b * 100}%;--c:${statusCol(b)}"></i><b>${pct(b)}</b><small>${[f != null && $t`Fluss ${pct(f)}`, stuck && $t`${stuck} stehen`].filter(Boolean).join(' · ')}</small></button>`;
  }).join('');
  return `${kpis}<h3>${$t`Entwicklung`}</h3>${charts}<h3>${$t`Auslastung je Rohstoff`}</h3><div class="crows">${rows}</div><small>${$t`Tippe auf einen Rohstoff, um seine Kette zu sehen. Auslastung = Anteil, der gerade arbeitet (nicht: reif und ungeerntet, Lager voll oder Zutat fehlt).`}</small>`;
}
// Produktions-Diagramm: alle möglichen Ketten, Besessenes farbig, Probleme rot/gelb
function openPlan() {
  const types = Object.keys(THINGS).filter(avail), depth = {};
  const makers = it => types.filter(k => THINGS[k].item === it);
  const dep = k => depth[k] ?? (depth[k] = THINGS[k].kind === 'grow' ? 0 : 1 + Math.max(0, ...Object.keys(THINGS[k].in).flatMap(it => makers(it).map(dep))));
  types.forEach(dep);
  const { sup, dem, u, cnt: c0 } = rates(), cnt = {};
  for (const k of types) cnt[k] = c0[k] || 0;
  const cap = {}; // volle Kapazität je Ware (alle Gebäude laufen ohne Wartezeit)
  for (const k of types) { const d = THINGS[k]; cap[d.item] = (cap[d.item] || 0) + cnt[k] * d.n / d.time * 60; }
  // Ein Reiter pro Rohstoff. Kategorie = Rohstoff, aus dem am meisten drinsteckt (Kuchen: 3 Äpfel > 1 Mehl → Äpfel).
  const cats = [...new Set(types.map(catOf))];
  if (!cats.includes(planCat)) planCat = cats.map(c => [c, types.filter(k => catOf(k) === c).reduce((a, k) => a + cnt[k], 0)]).sort((a, b) => b[1] - a[1])[0][0];
  const vis = types.filter(k => catOf(k) === planCat), used = [...new Set(vis.map(k => depth[k]))].sort((a, b) => a - b);
  const NW = 180, NH = 70, GX = 130, GY = 18, posn = {}, rows = [], col = {};
  for (const k of vis) { const c = used.indexOf(depth[k]); col[k] = c; rows[c] = (rows[c] || 0) + 1; posn[k] = { x: 10 + c * (NW + GX), y: 10 + (rows[c] - 1) * (NH + GY) }; }
  const Wd = 110 + used.length * (NW + GX) - GX; // +90: Platz für Stummel mit Rate ganz rechts
  let Hd = 20 + Math.max(...rows) * (NH + GY) - GY, edges = '', labels = '', nodes = '';
  const r = v => Math.round(v * 10) / 10;
  const rateTxt = it => `${r(sup[it] || 0)}${(sup[it] || 0) < cap[it] * 0.95 ? ' ' + $t`(voll ${r(cap[it])})` : ''}`; // echt (voll), wenn es gerade langsamer läuft
  // Pfeile überlagern sich nie: jeder hat eigene Anschlusspunkte, eigene senkrechte Spur pro Lücke,
  // und Pfeile über mehrere Spalten laufen auf einer eigenen Bahn unter allen Kästchen durch.
  const users = k => vis.filter(f => THINGS[f].in?.[THINGS[k].item]), feeders = k => vis.filter(m => THINGS[k].in?.[THINGS[m].item]);
  const E = [];
  for (const k of vis) {
    const it = THINGS[k].item;
    users(k).forEach(f => {
      const on = cnt[k] && cnt[f];
      const color = !on ? '#bbb' : sup[it] < dem[it] * 0.9 ? '#d23b2b' : sup[it] > dem[it] * 1.1 ? '#e39b1c' : '#3d8b2f';
      E.push({ a: k, b: f, color, long: col[f] - col[k] > 1 });
    });
  }
  E.filter(e => e.long).forEach((e, i) => e.lane = Hd + 4 + i * 10);
  Hd += E.filter(e => e.long).length * 10;
  const mid = k => posn[k].y + NH / 2;
  // ponytail: Abstand 8px, ab 8 Pfeilen an einer Kästchenseite wird es eng. Ein-Anschlüsse 4px versetzt → nie gleiche Höhe wie Aus-Anschlüsse.
  const ports = (k, list, toward, shift) => list.sort((e, f) => toward(e) - toward(f)).forEach((e, i) => e[shift ? 'y2' : 'y1'] = mid(k) + shift + 8 * (i - Math.floor((list.length - 1) / 2)));
  for (const k of vis) {
    ports(k, E.filter(e => e.a === k), e => e.long ? 1e9 : mid(e.b), 0);
    ports(k, E.filter(e => e.b === k), e => e.long ? 1e9 : mid(e.a), 4);
  }
  // senkrechte Spuren je Lücke: oben startende Abwärts-Pfeile nach rechts, so kreuzen sie sich am wenigsten
  const gaps = {};
  for (const e of E) {
    const ya = e.long ? e.lane : e.y2;
    (gaps[col[e.a]] ||= []).push({ e, k: 'ta', y1: e.y1, y2: ya });
    if (e.long) (gaps[col[e.b] - 1] ||= []).push({ e, k: 'tb', y1: e.lane, y2: e.y2 });
  }
  for (const [c, L] of Object.entries(gaps)) {
    L.sort((p, q) => (p.y2 >= p.y1 ? -p.y1 : p.y1 + 1e6) - (q.y2 >= q.y1 ? -q.y1 : q.y1 + 1e6));
    L.forEach((t, j) => t.e[t.k] = 10 + (+c) * (NW + GX) + NW + GX * (j + 1) / (L.length + 1));
  }
  for (const e of E) {
    const x1 = posn[e.a].x + NW, x2 = posn[e.b].x;
    const pts = e.long ? [[x1, e.y1], [e.ta, e.y1], [e.ta, e.lane], [e.tb, e.lane], [e.tb, e.y2], [x2, e.y2]] : [[x1, e.y1], [e.ta, e.y1], [e.ta, e.y2], [x2, e.y2]];
    let d = `M${pts[0]}`;
    for (let i = 1; i < pts.length - 1; i++) { // Ecken abrunden
      const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1];
      const rr = Math.min(8, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2);
      const ux = Math.sign(x - px), uy = Math.sign(y - py), vx = Math.sign(nx - x), vy = Math.sign(ny - y);
      d += ` L${x - ux * rr},${y - uy * rr} Q${x},${y} ${x + vx * rr},${y + vy * rr}`;
    }
    d += ` L${pts.at(-1)}`;
    edges += `<g data-e="${e.a}>${e.b}"><path d="${d}" fill="none" stroke="${e.color}" stroke-width="3.5" marker-end="url(#ar)"/></g>`;
  }
  // Σ-Label 1× pro Hersteller: ganze Produktion → ganze Abnahme (alle Abnehmer, auch anderer Reiter), über dem obersten Pfeil
  const said = new Set(); // Ware mit mehreren Herstellern (Fleisch): Summe nur 1×
  for (const k of vis) {
    const out = E.filter(e => e.a === k);
    if (!out.length || said.has(THINGS[k].item)) continue;
    said.add(THINGS[k].item);
    const it = THINGS[k].item, top = Math.min(...out.map(e => e.y1)), c = out.find(e => e.color !== '#bbb')?.color || '#bbb';
    const x = posn[k].x + NW + 6; // zweizeilig: Produktion / → Abnahme, sonst ragt es unter das nächste Kästchen
    labels += `<text data-fit="${GX - 10}" x="${x}" y="${top - (cnt[k] ? 20 : 6)}" font-size="12" font-weight="700" fill="${c}" stroke="#fbf4e4" stroke-width="4" paint-order="stroke">${cnt[k] ? `Σ ${ITEMS[it].icon} ${rateTxt(it)}<tspan x="${x}" dy="14">→ ${r(dem[it] || 0)}/min</tspan>` : ITEMS[it].icon}</text>`;
  }
  edges += labels;
  // Tipps: alles, was gerade Geld kostet oder bringen würde – bewertet als ≈ Fr. in den nächsten M Minuten
  const tips = [], M = 5, eur = it => ITEMS[it].price, perMin = d => d.n / d.time * 60, nm = it => `${ITEMS[it].icon} ${ITEMS[it].name}`;
  const tip = (v, html, go) => tips.push({ v: Math.max(1, Math.round(v)), html, go }); // go: Klick springt dorthin, wo man es tut
  const toAt = t => () => { const p = pos(t); G.px = p.x; G.py = p.y + T * 0.5; harvest = null; }; // ponytail: Figur hinbeamen statt hinlaufen
  const toShop = (tab, k) => () => { shopTab = tab; if (k && tab === 1) shopCat = catOf(k); openShop(); };
  const toBuy = k => toShop(THINGS[k].kind === 'grow' ? 0 : 1, k), toSell = toAt(fixedE('haendler'));
  const unitVal = f => eur(THINGS[f].item) * THINGS[f].n / Object.values(THINGS[f].in).reduce((a, b) => a + b); // Wert je Zutat nach Verarbeitung
  const ready = f => Object.keys(THINGS[f].in).every(i => sup[i] > 0); // nur vorschlagen, wenn ALLE Zutaten schon hergestellt werden
  const bestUser = (it, built, fed) => types.filter(f => THINGS[f].in?.[it] && (!built || cnt[f]) && ready(f) && (!fed || u[f] >= 0.9)).sort((a, b) => unitVal(b) - unitVal(a))[0]; // fed: hat genug von den anderen Zutaten
  let blocked = 0; // was gerade auf eine freie Tasche wartet
  for (const k of types) {
    const d = THINGS[k], it = d.item, fld = d.kind === 'grow' ? 'store' : 'out', cap = d.kind === 'grow' ? storeCap(d) : OUT_CAP;
    const ts = G.things.filter(t => t.type === k && t[fld] > 0);
    if (ts.length && surplus(it)) { // nur Überschuss lässt sich abholen
      const n = ts.reduce((a, t) => a + t[fld], 0), full = ts.filter(t => t[fld] + d.n > cap).length, v = n * eur(it) + full * perMin(d) * eur(it) * M;
      blocked += v;
      tip(v, (full ? $t`📦 <b>Hole ${n} ${nm(it)} ab</b> – liegt bei ${ts.length}× ${d.name} (bei ${full} ist das Lager voll, dort steht die Arbeit!) – und verkauf es beim Händler.` : $t`📦 <b>Hole ${n} ${nm(it)} ab</b> – liegt bei ${ts.length}× ${d.name} – und verkauf es beim Händler.`), toAt(ts.find(t => t[fld] + d.n > cap) || ts[0]));
    }
    const ripe = G.things.filter(t => t.type === k && t.ripe && !isAuto(t)).length;
    if (ripe) { const v = ripe * (d.n * eur(it) + perMin(d) * eur(it) * M); blocked += v; tip(v, $t`✨ <b>${ripe}× ${d.name} reif – ernte ${ripe * d.n} ${nm(it)}!</b> Solange du nicht erntest, wächst nichts nach.`, toAt(G.things.find(t => t.type === k && t.ripe && !isAuto(t)))); }
  }
  for (const [it, n] of Object.entries(G.inv)) {
    const f = G.things.find(t => THINGS[t.type].in?.[it] && ready(t.type) && (t.inS[it] || 0) < THINGS[t.type].in[it] * 4);
    if (f) tip(n * unitVal(f.type), $t`🧺 <b>Bring ${n} ${nm(it)} aus deiner Tasche zur ${THINGS[f.type].name}</b> – dort wird etwas Wertvolleres daraus.`, toAt(f));
    else tip(n * eur(it), $t`💰 <b>Verkauf ${n} ${nm(it)} beim Händler</b> (${n * eur(it)} Fr.).`, toSell);
  }
  if (bagCount() >= bagCap()) tip(blocked + 1, $t`🎒 <b>Deine Tasche ist voll!</b> Leere sie zuerst – sonst kannst du nichts ernten oder abholen.`, toSell);
  for (const it in ITEMS) {
    const s = sup[it] || 0, dm = dem[it] || 0, makes = makers(it).map(k => THINGS[k].name).join(' / ');
    // Hersteller hungern selbst (u < 0.9)? Dann bringen mehr davon nichts – der Tipp steht weiter oben in der Kette
    if (dm && s < dm * 0.9 && !(s && makers(it).filter(k => cnt[k]).every(k => (u[k] ?? 1) < 0.9))) {
      const f = bestUser(it, true);
      tip((dm - s) * (f ? unitVal(f) : eur(it)) * M, $t`🔴 <b>Zu wenig ${nm(it)}</b>: gebraucht ${r(dm)}/min, hergestellt ${r(s)}/min.` + ' ' + (s ? $t`Kauf mehr ${makes}.` : $t`Niemand macht ${ITEMS[it].name} – kauf ${makes}!`), makers(it).length && toBuy(makers(it)[0]));
    }
    if (!s) continue;
    const bu = bestUser(it, true, true), best = bestUser(it, false);
    if (dm && bu && s > dm * 1.1) tip((s - dm) * Math.max(1, unitVal(bu) - eur(it)) * M, $t`🟠 <b>Mehr ${nm(it)} als gebraucht</b> (${r(s)} statt ${r(dm)}/min). Hol den Rest ab und verkauf ihn – oder baue noch eine ${THINGS[bu].name}.`, toBuy(bu));
    if (!dm && best && unitVal(best) > eur(it)) tip(s * (unitVal(best) - eur(it)) * M, $t`🏗️ <b>Baue eine ${THINGS[best].name}</b> (${THINGS[best].price} Fr.): macht ${nm(it)} → ${nm(THINGS[best].item)}. Das bringt mehr Geld, als ${ITEMS[it].name} direkt zu verkaufen.` + ' ' + $t`Im Laden unter 🏭 Gebäude → ${ITEMS[catOf(best)].icon} ${ITEMS[catOf(best)].name}.`, toBuy(best));
    const manual = makers(it).filter(k => cnt[k] && THINGS[k].kind === 'grow' && !toolLv(THINGS[k].tool).auto);
    if (dm && manual.length) tip(s * eur(it) * M * 0.5, $t`✋ <b>${ITEMS[it].name} wird von Hand geerntet</b> – du musst es selbst zur Verarbeitung bringen. Automatisch geht es mit: ${[...new Set(manual.map(k => TOOLS[THINGS[k].tool].levels.find(l => l.auto).name))].join(', ')}.`, toShop(2));
  }
  // Transport: alles über dem Bedarf geht zum Händler – bei voller Produktion, damit man vor dem Engpass gewarnt wird.
  // ponytail: Fahrzeug-Leistung = cap pro Takt; lange Fahrwege machen es langsamer, das schätzen wir nicht.
  const sellIt = Object.keys(cap).filter(it => cap[it] > (dem[it] || 0) * 1.1), sellN = sellIt.reduce((a, it) => a + cap[it] - (dem[it] || 0), 0);
  const sellV = sellIt.reduce((a, it) => a + (cap[it] - (dem[it] || 0)) * eur(it), 0), lvS = G.tools.spedition && toolLv('spedition');
  const truckN = lvS ? truckCount() * lvS.cap / lvS.every * 60 : 0;
  if (sellN >= 1 && !lvS) tip(sellV * M * 0.3, $t`🚚 <b>Kein Spediteur</b>: deine Gebäude machen bis ${r(sellN)} Waren/min zum Verkaufen – die musst du alle selbst zum Händler tragen. Ein Spediteur aus dem Laden macht das für dich.`, toShop(2));
  if (lvS && sellN > truckN * 1.05) tip(sellV * (1 - truckN / sellN) * M, $t`⚠️ <b>Zu wenig Transport</b>: deine Gebäude machen bis ${r(sellN)} Waren/min zum Verkaufen, ${truckCount()}× ${lvS.name} schafft nur ≈ ${r(truckN)}/min. Kauf im Laden noch ein Fahrzeug oder ein grösseres – sonst werden die Lager voll und die Arbeit steht.`, toShop(2));
  tips.sort((a, b) => b.v - a.v);
  for (const k of vis) {
    const p = posn[k], d = THINGS[k], on = cnt[k] > 0, warn = G.things.some(t => t.type === k && t.warn);
    const full = cnt[k] * d.n / d.time * 60, uk = u[k] ?? 1; // läuft langsamer (Zutat fehlt): echt/möglich
    const rate = on ? `${r(full * uk)}${uk < 0.95 ? '/' + r(full) : ''} ${ITEMS[d.item].icon}/min${k === 'feld' && guelleOn() ? ' 💩×2' : ''}` : $t`${d.price} Fr. im Laden`;
    const extra = Object.keys(d.in || {}).filter(it => !vis.some(m => THINGS[m].item === it)).map(it => ITEMS[it].icon).join(''); // Zutaten aus anderen Reitern
    const awayF = types.filter(f => cnt[f] && !vis.includes(f) && THINGS[f].in?.[d.item]), away = [...new Set(awayF.map(f => THINGS[f].icon))].join(''); // ponytail: nur gebaute Abnehmer, sonst zu viele Symbole (Mehl)
    const sell = !types.some(f => THINGS[f].in?.[d.item] && cnt[f]) ? `→ 💰${on ? ' ' + (d.kind === 'factory' && G.tools.spedition ? '🚚' : '🎒') : ''}` : '';
    nodes += `<g data-k="${k}" style="cursor:pointer" opacity="${on ? 1 : 0.45}"><rect x="${p.x}" y="${p.y}" width="${NW}" height="${NH}" rx="12" fill="${on ? '#fff' : '#eee'}" stroke="${warn ? '#d23b2b' : on ? '#a8743f' : '#bbb'}" stroke-width="${warn ? 3 : 2}" ${on ? '' : 'stroke-dasharray="5 4"'}/>
      <text data-fit="${NW - 20}" x="${p.x + 10}" y="${p.y + 24}" font-size="15" font-weight="800">${d.icon} ${d.name}${cnt[k] ? ' ×' + cnt[k] : ''}</text>
      <text x="${p.x + 10}" y="${p.y + 43}" font-size="12" fill="#555">${rate}</text>
      <text x="${p.x + 10}" y="${p.y + 61}" font-size="12" font-weight="700" fill="#3e7bc4">${sell}${sell ? ' ' : ''}<tspan fill="#a8743f">1 ${ITEMS[d.item].icon} = ${ITEMS[d.item].price} ${$t`Fr.`}</tspan></text>
      <text data-info="${k}" x="${p.x + NW - 18}" y="${p.y + NH - 8}" font-size="16">ℹ️</text>
      ${warn ? `<circle cx="${p.x + NW - 4}" cy="${p.y + 4}" r="11" fill="#d23b2b"/><text x="${p.x + NW - 4}" y="${p.y + 9}" text-anchor="middle" fill="#fff" font-weight="900" font-size="15">!</text>` : ''}</g>`;
    const sy = p.y + NH - 12, stub = (x1, x2, ic, tx) => `<g opacity="${on ? 1 : 0.45}"><path d="M${x1},${sy} L${x2},${sy}" stroke="#3e7bc4" stroke-width="2.5" stroke-dasharray="4 3" marker-end="url(#ab)"/><text x="${tx}" y="${sy - 5}" font-size="12">${ic}</text></g>`; // Pfeil-Stummel: von/zu anderem Reiter
    if (extra) nodes += stub(p.x - 40, p.x, extra, p.x - 40);
    // Rate (Summe aller Abnehmer, auch anderer Reiter) steht nur 1×: am obersten Pfeil, sonst am Stummel
    if (away) nodes += stub(p.x + NW, p.x + NW + 40, `${away}${on && !E.some(e => e.a === k) ? `<tspan x="${p.x + NW + 4}" dy="-28">${rateTxt(d.item)}</tspan><tspan x="${p.x + NW + 4}" dy="14">→ ${r(dem[d.item])}/min</tspan>` : ''}`, p.x + NW + 4);
  }
  const svg = `<svg width="${Wd}" height="${Hd}" style="max-width:100%;height:auto" viewBox="0 0 ${Wd} ${Hd}"><defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#777"/></marker><marker id="ab" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#3e7bc4"/></marker></defs>${edges}${nodes}</svg>`;
  const views = `<div class="tabs">${[['cockpit', $t`📈 Cockpit`], ['ketten', $t`🔗 Ketten`]].map(([v, n]) => `<button data-view="${v}" class="${v === planView ? 'on' : ''}">${n}</button>`).join('')}</div>`;
  const head = views + (planView === 'ketten' ? catTabs(cats, planCat, 'cat') : '');
  const legend = `<div class="legend"><span style="color:#3d8b2f">━ ${$t`passt`}</span><span style="color:#d23b2b">━ ${$t`zu wenig`}</span><span style="color:#e39b1c">━ ${$t`zu viel`}</span><span style="color:#3e7bc4">→ 💰 ${$t`verkauft`} (🎒 ${$t`du`}, 🚚 ${$t`Spediteur`})</span><span style="color:#3e7bc4">⇢▢ ${$t`von anderem Reiter`}</span><span style="color:#3e7bc4">▢⇢ ${$t`zu anderem Reiter`}</span><span style="opacity:.5">▢ ${$t`nicht gebaut`}</span></div>`;
  const tipsHtml = `<h3>${$t`Was jetzt am meisten bringt`}</h3><ol class="probs">${tips.map((t, i) => `<li${t.go ? ` data-tip="${i}" style="cursor:pointer"` : ''}><b class="rk">${i + 1}</b><span>${t.html}</span><span class="imp" title="${$t`geschätzter Nutzen in den nächsten ${M} Minuten`}"><i style="width:${Math.max(6, t.v / tips[0].v * 100)}%"></i>≈ ${t.v} ${$t`Fr.`}</span></li>`).join('') || `<li>${$t`✅ Alles läuft rund!`}</li>`}</ol><small>${$t`≈ Fr. = geschätzter Nutzen in den nächsten ${M} Minuten.`} </small>`;
  const body = planView === 'cockpit' ? cockpit(types, cats, cnt, sup, dem, u) + tipsHtml
    : `${legend}<div style="overflow:auto">${svg}</div>${tipsHtml}<small>${$t`Tipp: Tippe auf ein Kästchen – die ganze Kette leuchtet auf. ℹ️ erklärt, wie es funktioniert.`}</small>`;
  modal($('#plan'), `${$t`📊 Dein Analyse-Cockpit`} ${moneyTag()}`, body, head);
  // Zu breite Labels (lange Namen, «voll»-Rate) auf ihren Platz stauchen, damit nichts überlappt
  $('#plan').querySelectorAll('[data-fit]').forEach(t => { const b = t.getBBox(), f = +t.dataset.fit / b.width; if (f < 1) t.setAttribute('transform', `translate(${b.x},${b.y + b.height / 2}) scale(${f}) translate(${-b.x},${-b.y - b.height / 2})`); });
  const el = $('#plan'), chain = (k, next, set = new Set()) => { for (const m of next(k)) if (!set.has(m)) { set.add(m); chain(m, next, set); } return set; };
  el.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { planView = b.dataset.view; openPlan(); });
  el.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { planView = 'ketten'; planCat = b.dataset.go; openPlan(); });
  el.querySelectorAll('.chart').forEach(c => c.querySelectorAll('.hit').forEach(r => r.onpointerenter = r.onclick = () => { c.querySelector('.val').textContent = r.dataset.v; })); // Antippen/Hovern: Wert oben anzeigen
  el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { planCat = b.dataset.cat; openPlan(); });
  el.querySelectorAll('[data-tip]').forEach(li => li.onclick = () => { el.hidden = true; tips[li.dataset.tip].go(); });
  centerTab(el);
  let focus = null; // Antippen: Zulieferer und Abnehmer bleiben hell, der Rest wird blass
  el.querySelectorAll('[data-k]').forEach(g => g.onclick = e => {
    const k = g.dataset.k;
    if (e.target.dataset.info) return showInfo({ type: k });
    focus = focus === k ? null : k;
    const keep = focus && new Set([k, ...chain(k, feeders), ...chain(k, users)]);
    el.querySelectorAll('[data-k]').forEach(n => n.classList.toggle('dim', !!keep && !keep.has(n.dataset.k)));
    el.querySelectorAll('[data-e]').forEach(n => { const [a, b] = n.dataset.e.split('>'); n.classList.toggle('dim', !!keep && !(keep.has(a) && keep.has(b))); });
  });
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
  ctx.font = `800 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(40,25,10,.75)';
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
  ctx.font = '800 10px system-ui'; const m = ctx.measureText(text).width, f = Math.min(10, 10 * 96 / m); // klein, damit man das Dach noch sieht; lange Namen: kleinere Schrift
  ctx.font = `800 ${f}px system-ui`; const w = m * f / 10 + 12;
  ctx.fillStyle = '#5b3a1e'; rrect(x - w / 2, y - 8, w, 16, 4); ctx.fill();
  ctx.fillStyle = '#fff4d6'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 3.5);
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
  ctx.fillStyle = guelleOn() ? '#5e4128' : '#7d5a37'; ctx.fillRect(x0, y0, w, h); // gedüngt = dunkle Erde
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
  sprite('baum', x, y, 36, 90, 82, 102, () => { // Schatten, Stamm und Krone sind bei allen Bäumen gleich
    ellipse(6, 0, 30, 10, 'rgba(0,0,0,.25)');
    let gr = ctx.createLinearGradient(-6, 0, 6, 0); gr.addColorStop(0, '#7a5534'); gr.addColorStop(1, '#4a3220');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-4, -38); ctx.lineTo(4, -38); ctx.lineTo(7, 0); ctx.fill();
    for (const [bx, by, br] of [[-16, -50, 19], [16, -52, 19], [0, -68, 21], [-6, -46, 18], [8, -44, 18]]) {
      gr = ctx.createRadialGradient(bx - 6, by - 8, 2, bx, by, br);
      gr.addColorStop(0, '#7dbb4f'); gr.addColorStop(1, '#2f6a26');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    }
  });
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
  hof(x, y) { // Alpen-Bauernhof, wächst mit der Land-Stufe (HOF_LV)
    const lv = hofLv(), fl = lv >= 3 ? 2 : 1;
    if (lv >= 5) kapelle(x + 190, y - 4);
    if (G.kirche) kirche(x + 300, y - 4);
    if (G.guelle) guelle(x + 264, y + 260); // zwischen Hof und Acker
    if (lv >= 2) speicher(x - 205, y - 4);
    if (lv >= 1) for (let i = 0; i < 4; i++) for (let j = 0; j < 5 - (i % 2); j++) { ellipse(x - 148 + j * 9 + (i % 2) * 4.5, y - 5 - i * 8, 4.5, 4.5, '#b07a42'); ellipse(x - 148 + j * 9 + (i % 2) * 4.5, y - 5 - i * 8, 2, 2, '#e3c08a'); } // Holzbeige
    // Stall mit Heuboden
    const st = alpHouse(x - 52, y, 100, 14, 46, 34);
    ctx.fillStyle = '#7d4a26'; ctx.fillRect(x - 78, y - 50, 48, 50); ctx.strokeStyle = '#f2eadc'; ctx.lineWidth = 3;
    ctx.strokeRect(x - 78, y - 50, 48, 50); ctx.beginPath(); ctx.moveTo(x - 78, y - 50); ctx.lineTo(x - 30, y); ctx.moveTo(x - 30, y - 50); ctx.lineTo(x - 78, y); ctx.stroke();
    ctx.fillStyle = '#3a2412'; ctx.fillRect(x - 60, st - 22, 16, 14); ctx.fillStyle = '#e8c35a'; ctx.fillRect(x - 58, st - 14, 12, 6); // Heuluke
    win(x - 18, y - 42, 14, 12);
    if (lv >= 4) { // Glockentürmchen (Dachreiter)
      const bx = x - 52, by = st - 40;
      ctx.fillStyle = '#6b4423'; ctx.fillRect(bx - 8, by - 16, 16, 18);
      ctx.fillStyle = '#2a2a2a'; ctx.fillRect(bx - 5, by - 13, 10, 10);
      ctx.save(); ctx.translate(bx, by - 13); ctx.rotate(Math.sin(time * 2.4) * 0.35); ctx.fillStyle = '#d9a83a'; ctx.beginPath(); ctx.moveTo(-4, 8); ctx.lineTo(4, 8); ctx.lineTo(2, 1); ctx.lineTo(-2, 1); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(bx - 12, by - 14); ctx.lineTo(bx, by - 34); ctx.lineTo(bx + 12, by - 14); ctx.fill();
    }
    // Wohnhaus: gemauertes Erdgeschoss, Holz darüber
    const hx = x + 52, top = alpHouse(hx, y, 104, 32, 30 * fl, 32);
    for (const wx of [-36, 18]) shutterWin(hx + wx, y - 26);
    door(hx - 4, y, 16, 26, '#5b3a1e');
    for (let f = 0; f < fl; f++) for (const wx of [-36, 18]) { shutterWin(hx + wx, top + 6 + f * 30); flowers(hx + wx - 4, hx + wx + 22, top + 26 + f * 30); }
    shutterWin(hx - 8, top - 20, 16, 12);
    if (lv >= 3) balcony(hx, 104, top + 30);
    ctx.fillStyle = '#7d7468'; ctx.fillRect(hx + 26, top - 30, 9, 20); // Kamin
    if (lv >= 1) { // Brunnen aus einem Holzstamm
      const bx = x + 128, by = y + 16;
      ellipse(bx, by, 26, 6, 'rgba(0,0,0,.22)'); ctx.fillStyle = '#8a5a30'; ctx.fillRect(bx - 24, by - 14, 48, 14); ctx.fillStyle = '#4f9ad0'; ctx.fillRect(bx - 21, by - 14, 42, 4);
      ctx.fillStyle = '#6b4423'; ctx.fillRect(bx - 28, by - 34, 7, 34); line('#9aa0a6', 3, bx - 22, by - 28, bx - 12, by - 28);
      line('rgba(140,200,240,.85)', 2, bx - 12, by - 28, bx - 11, by - 14);
    }
    flagPole(x + 158, y, 96, 26, 0);
  },
  haendler(x, y) { // wächst mit der Land-Stufe (HOF_LV, dann SHOP_LV): Marktstand → Markthalle → Grosshandel
    const lv = shopLv();
    if (lv >= 4) { grosshandel(x + 6, y, lv); return; }
    if (lv >= 2) { markthalle(x - 10, y, lv); return; }
    if (lv >= 1) { // Waage und mehr Kisten neben dem Stand
      crate(x - 84, y, '#7fbf4a', 9); crate(x - 84, y - 14, '#e0b54a', 9); crate(x + 82, y, '#d8332a', 10);
      ctx.fillStyle = '#7d7468'; ctx.fillRect(x + 70, y - 34, 4, 22); line('#555', 2, x + 60, y - 34, x + 84, y - 34); ellipse(x + 60, y - 30, 7, 2.5, '#b8b0a2'); ellipse(x + 84, y - 30, 7, 2.5, '#b8b0a2'); // Waage
    }
    ellipse(x + 6, y, 70, 10, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 60, y - 72, 5, 72); ctx.fillRect(x + 55, y - 72, 5, 72);
    haendlerMann(x, y - 42);
    ctx.fillStyle = '#9b6a3a'; ctx.fillRect(x - 62, y - 30, 124, 30); ctx.fillStyle = '#7b5228'; ctx.fillRect(x - 62, y - 30, 124, 5);
    crate(x - 38, y - 30, '#d8332a', 10); crate(x - 10, y - 30, '#e0b54a', 10); crate(x + 32, y - 30, '#f5f5f0', 8);
    awning(x, y - 84, 132, '#d23b2b', '#fff', 10);
    sign(x, y - 94, $t`HÄNDLER 💰`);
    flagPole(x + 57, y - 72, 26, 16, 2);
  },
  laden(x, y) { // wächst mit der Land-Stufe (HOF_LV, dann SHOP_LV): Lädeli → Dorfladen → moderner Markt
    const lv = shopLv();
    if (lv >= 4) { supermarkt(x, y, lv); return; }
    if (lv >= 2) { dorfladen(x, y, lv); return; }
    if (lv >= 1) { // Gemüse-Gestell vor dem Laden
      ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 128, y - 30, 40, 4); ctx.fillRect(x - 128, y - 16, 40, 4); ctx.fillRect(x - 128, y - 30, 3, 30); ctx.fillRect(x - 91, y - 30, 3, 30);
      for (let i = 0; i < 4; i++) { ellipse(x - 122 + i * 10, y - 34, 4.5, 4, ['#e8483b', '#f29a2e', '#7fbf4a', '#e8483b'][i]); ellipse(x - 122 + i * 10, y - 20, 4.5, 4, ['#f2cf3b', '#7fbf4a', '#b5652a', '#f29a2e'][i]); }
    }
    house(x, y, 140, 72, '#f0dfb2', '#3d6b8f', 32);
    ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 62, y - 56, 46, 40); ctx.fillRect(x + 16, y - 56, 46, 40);
    ctx.fillStyle = '#cfe8f5'; ctx.fillRect(x - 60, y - 54, 42, 36); ctx.fillRect(x + 18, y - 54, 42, 36);
    ctx.font = '16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🔧🐄', x - 39, y - 30); ctx.fillText('🌳🚜', x + 39, y - 30);
    door(x, y, 22, 40, '#3d6b8f');
    awning(x, y - 72, 150, '#d52b1e', '#fff', 12);
    sign(x, y - 112, $t`LADEN 🛒`);
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
    hangSign(x + 58, y - 50, (cx, cy) => pretzel(cx, cy)); // Bretzel = altes Zeichen der Bäcker
    sign(x, y - 66, $t`BÄCKEREI 🥨`);
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
    for (const mx of [-74, -64]) { ctx.fillStyle = '#c3ccd4'; rrect(x + mx - 4, y - 16, 9, 16, 2); ctx.fill(); ctx.fillStyle = '#7f8a95'; ctx.fillRect(x + mx - 2, y - 19, 5, 3); } // Milchkannen
    sign(x - 22, y - 62, $t`MOLKEREI 🥛`);
  },
  kaeserei(x, y) {
    house(x, y, 104, 62, '#a8743f', '#5b3a1e', 34);
    ctx.strokeStyle = 'rgba(60,35,15,.4)'; ctx.lineWidth = 1;
    for (let xx = x - 50; xx < x + 52; xx += 8) { ctx.beginPath(); ctx.moveTo(xx, y - 62); ctx.lineTo(xx, y); ctx.stroke(); }
    win(x - 40, y - 46, 20, 18); win(x + 20, y - 46, 20, 18); door(x - 4, y, 18, 32);
    for (let i = 0; i < 3; i++) { ellipse(x + 64, y - 4 - i * 9, 14, 6, '#e8b830'); ellipse(x + 64, y - 6 - i * 9, 14, 5, '#f5cf4a'); }
    for (const [hx, hy] of [[-6, -24], [4, -23], [-1, -25]]) ellipse(x + 64 + hx, y + hy, 2, 1.2, '#c8961e'); // Löcher
    mouse(x + 72, y + 6, -1, '#f5cf4a'); // Maus mit Käsestück
    sign(x, y - 70, $t`KÄSEREI 🧀`);
  },
  fonduestube(x, y, t) { DECO_DRAW.chalet(x, y, t, t.working); sign(x, y - 66, $t`FONDUE-STÜBLI 🍲`); },
  muesli_kueche(x, y, t) {
    house(x, y, 104, 60, '#f3ead2', '#d52b1e', 30); win(x - 40, y - 44, 22, 18, t.working); win(x + 18, y - 44, 22, 18, t.working); door(x - 4, y, 18, 30);
    for (const [ax, c] of [[-56, '#d8332a'], [-46, '#a6c84a'], [52, '#d8332a']]) ellipse(x + ax, y - 4, 5, 5, c);
    sign(x, y - 66, $t`MÜESLI 🥗`);
  },
  konditorei(x, y, t) {
    house(x, y, 108, 62, '#f6d4dc', '#b05a7a', 30);
    win(x - 46, y - 44, 34, 24, t.working); door(x + 20, y, 18, 32, '#b05a7a');
    ctx.font = '18px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🥧', x - 29, y - 26);
    awning(x - 29, y - 52, 46, '#b05a7a', '#fff', 5);
    sign(x, y - 68, $t`KONDITOREI 🎂`);
  },
};
// ---- Weinberg & Fischteich ----
DRAW.rebe = (x, y, t) => {
  const g = t.ripe ? 1 : t.timer / THINGS.rebe.time, r = seeded(t.id * 13 + 5);
  ellipse(x, y, 66, 8, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x - 62, y - 56, 5, 56); ctx.fillRect(x + 57, y - 56, 5, 56); // Pfähle
  line('#8a8a8a', 1, x - 60, y - 50, x + 60, y - 50); line('#8a8a8a', 1, x - 60, y - 32, x + 60, y - 32); // Drähte
  for (let i = 0; i < 9; i++) {
    const ax = x - 52 + i * 13;
    line('#5a3d22', 3, ax, y, ax + 2, y - 30);
    for (const [bx, by] of [[-6, -44], [6, -40], [0, -53], [-3, -31]]) ellipse(ax + bx + r() * 4, y + by + r() * 4, 8, 6, r() < 0.5 ? '#4f8a2f' : '#6aa23c');
    if (g > 0.3) { const c = g < 0.75 ? '#a6c84a' : '#6b2d6e'; for (let k = 0; k < Math.round(g * 5); k++) ellipse(ax + 2 + (k % 2) * 4, y - 30 + Math.floor(k / 2) * 4, 2.6, 2.6, c); }
  }
  if (t.store > 0) crate(x + 72, y + 4, '#6b2d6e', Math.min(t.store, 12));
};
DRAW.fischteich = (x, y, t) => {
  const g = t.ripe ? 1 : t.timer / THINGS.fischteich.time;
  ellipse(x, y - 14, 72, 30, '#8b6a43'); ellipse(x, y - 15, 65, 26, '#3a8fc4'); ellipse(x - 12, y - 21, 38, 12, 'rgba(255,255,255,.18)');
  for (let i = 0; i < 1 + Math.round(g * 5); i++) { // Fische schwimmen im Kreis, je reifer desto mehr
    const a = time * (0.6 + i * 0.13) + i * 1.7, fx = x + Math.cos(a) * (16 + i * 6), fy = y - 15 + Math.sin(a) * (5 + i * 2.5), dir = -Math.sin(a) >= 0 ? 1 : -1;
    ctx.fillStyle = 'rgba(25,55,85,.6)'; ctx.beginPath(); ctx.ellipse(fx, fy, 7, 3, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx - 6 * dir, fy); ctx.lineTo(fx - 11 * dir, fy - 3); ctx.lineTo(fx - 11 * dir, fy + 3); ctx.fill();
  }
  for (const rx of [-62, -56, -50]) line('#4f7a2f', 2, x + rx, y - 4, x + rx + 2, y - 32); // Schilf
  ctx.fillStyle = '#a07a4a'; ctx.fillRect(x + 22, y - 6, 34, 8); ctx.fillStyle = '#6b4a2b'; ctx.fillRect(x + 50, y + 2, 3, 6); // Steg
  if (t.store > 0) crate(x + 80, y + 4, '#5a8fb8', Math.min(t.store, 12));
};
// Hühnerhof: Hüsli mit Rampe, Hühner picken im Gehege. Masthühner sind weiss, Legehennen braun.
function chicken(x, y, c, ph) {
  const p = Math.max(0, Math.sin(ph)) * 4; // picken
  ellipse(x, y - 7, 7, 5.5, c); ellipse(x + 6, y - 12 + p, 3.6, 3.6, c);
  ctx.fillStyle = '#d8332a'; ctx.fillRect(x + 5, y - 17 + p, 3, 2.5); ctx.fillStyle = '#e8a030'; ctx.beginPath(); ctx.moveTo(x + 9, y - 12 + p); ctx.lineTo(x + 12, y - 11 + p); ctx.lineTo(x + 9, y - 10 + p); ctx.fill();
  line('#e8a030', 1.2, x - 2, y - 2, x - 2, y + 1, x + 1, y - 2, x + 1, y + 1);
}
function coop(x, y, t, hen) {
  const d = THINGS[t.type], g = t.ripe ? 1 : t.timer / d.time;
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)'); ellipse(x, y - 4, 62, 16, '#c9b27a'); // Scharrplatz
  ctx.fillStyle = '#c0552f'; ctx.fillRect(x - 58, y - 46, 40, 30); ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.moveTo(x - 63, y - 44); ctx.lineTo(x - 38, y - 62); ctx.lineTo(x - 13, y - 44); ctx.fill();
  ctx.fillStyle = '#3a2412'; ctx.fillRect(x - 43, y - 30, 10, 14); line('#9b7040', 3, x - 33, y - 16, x - 20, y - 4); // Türchen + Rampe
  for (const px of [-58, -22]) { ctx.fillStyle = '#6b4423'; ctx.fillRect(x + px, y - 16, 4, 16); }
  line('#b8b8b0', 1, x - 10, y - 24, x + 62, y - 24); for (let px = -10; px <= 62; px += 12) line('#8a6a43', 2, x + px, y - 26, x + px, y + 2); // Zaun
  for (let i = 0; i < 2 + Math.round(g * 3); i++) chicken(x + 4 + i * 12, y - 2 + (i % 2) * 6, hen ? '#a8582a' : '#f4f1e8', time * 4 + i * 1.9 + t.id);
  if (t.store > 0) crate(x + 78, y + 4, hen ? '#f2e6cf' : '#d86a5a', Math.min(t.store, 12));
}
DRAW.huhn = (x, y, t) => coop(x, y, t, true);
DRAW.masthuhn = (x, y, t) => coop(x, y, t, false);
DRAW.schwein = (x, y, t) => {
  const g = t.ripe ? 1 : t.timer / THINGS.schwein.time;
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)'); ellipse(x + 8, y - 6, 56, 16, '#7a5a3a'); ellipse(x + 14, y - 6, 22, 7, '#5e4329'); // Suhle
  ctx.fillStyle = '#9b6a3a'; ctx.fillRect(x - 60, y - 40, 34, 34); ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(x - 64, y - 38); ctx.lineTo(x - 43, y - 54); ctx.lineTo(x - 22, y - 38); ctx.fill();
  ctx.fillStyle = '#e8c35a'; ctx.fillRect(x - 54, y - 22, 22, 16); // Stroh
  for (let i = 0; i < 1 + Math.round(g * 2); i++) { // Säuli wackeln im Schlamm
    const px = x - 6 + i * 22, py = y - 2 + (i % 2) * 5, w = Math.sin(time * 3 + i + t.id) * 1.5;
    ellipse(px, py - 9, 12, 8, '#f2a7b0'); ellipse(px + 11 + w, py - 11, 6, 5.5, '#f2a7b0'); ellipse(px + 16 + w, py - 10, 2.6, 2.2, '#e0808e');
    ctx.fillStyle = '#e0808e'; ctx.beginPath(); ctx.moveTo(px + 8 + w, py - 16); ctx.lineTo(px + 10 + w, py - 21); ctx.lineTo(px + 13 + w, py - 16); ctx.fill();
    ellipse(px + 12 + w, py - 12, 1, 1, '#222'); for (const lx of [-7, -2, 4, 8]) line('#e0808e', 2.5, px + lx, py - 3, px + lx, py + 1);
    line('#e0808e', 1.5, px - 12, py - 10, px - 15, py - 13, px - 13, py - 14);
  }
  line('#8a6a43', 2, x - 24, y - 20, x + 66, y - 20); for (let px = -24; px <= 66; px += 15) line('#6b4a2b', 3, x + px, y - 24, x + px, y + 2);
  if (t.store > 0) crate(x + 80, y + 4, '#d86a5a', Math.min(t.store, 12));
};
// Import-Terminal: Container auf Schienen, Säcke davor (mehr Säcke = bald bereit)
function container(x, y, t, c, sack) {
  const g = t.ripe ? 1 : t.timer / THINGS[t.type].time;
  ellipse(x, y, 70, 9, 'rgba(0,0,0,.22)'); line('#7d7468', 3, x - 70, y - 2, x + 70, y - 2); line('#7d7468', 3, x - 70, y + 4, x + 70, y + 4); // Gleise
  ctx.fillStyle = c; ctx.fillRect(x - 60, y - 52, 92, 48); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 9; i++) ctx.fillRect(x - 56 + i * 10, y - 50, 3, 44);
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('IMPORT', x - 14, y - 36);
  wheel(x - 44, y - 2, 5); wheel(x + 16, y - 2, 5);
  for (let i = 0; i < Math.round(g * 4); i++) { const sx = x + 44 + (i % 2) * 14, sy = y - Math.floor(i / 2) * 10; ctx.fillStyle = '#c8a46a'; rrect(sx - 7, sy - 12, 14, 12, 3); ctx.fill(); ellipse(sx, sy - 6, 3, 3, sack); }
  if (t.store > 0) crate(x + 84, y + 4, sack, Math.min(t.store, 12));
}
DRAW.kakaoimport = (x, y, t) => container(x, y, t, '#c0552f', '#5a3220');
DRAW.kaffeeimport = (x, y, t) => container(x, y, t, '#2f6a8f', '#3f6a2f');
// Import-Zug: rote Lok wie bei der SBB, kommt vom Ostrand über die Terminal-Strasse, hält am Container, lädt ab, fährt rückwärts wieder weg (Pendelzug)
// ponytail: Züge zu nahen Containern können sich überlappen – eigene Gleise je Container, falls es stört
const trains = [], TR_IN = 5, TR_STOP = 2.5, TR_OUT = 4, TR_C = { kakaoimport: '#c0552f', kaffeeimport: '#2f6a8f' };
const trainLaneY = t => segOf('terminal', t.slot).a.lane[0] * T; // Zusatzband: eigenes Gleis auf seiner Strasse
function trainX(k) { // Lok-Nase links; bremst rein, steht, beschleunigt raus
  const stop = k.t.x - 120, D = WORLD.w * T + 60 - stop, a = k.age;
  if (a < TR_IN) return stop + D * (1 - a / TR_IN) ** 2;
  if (a < TR_IN + TR_STOP) return stop;
  return stop + D * ((a - TR_IN - TR_STOP) / TR_OUT) ** 2;
}
function trainTick(dt) {
  for (const t of G.things) { // Zug startet so, dass er genau ankommt, wenn der Container voll ist
    const d = THINGS[t.type];
    if (d.area === 'terminal' && !t.ripe && t.timer >= d.time - TR_IN && !trains.some(k => k.t === t)) trains.push({ t, age: t.timer - (d.time - TR_IN), y: trainLaneY(t) });
  }
  for (const k of trains) {
    const a0 = k.age, X = trainX(k), near = Math.hypot(G.px - k.t.x, G.py - k.y) < 1000;
    k.age += dt;
    if (a0 < TR_IN - 2.5 && k.age >= TR_IN - 2.5 && near) AU.sfx('horn');
    if (a0 < TR_IN && k.age >= TR_IN) { // abladen: Säcke fliegen vom Wagen in den Container
      const d = THINGS[k.t.type];
      for (let i = 0; i < d.n; i++) packages.push({ x0: X + 106 + (i % 2) * 66, y0: k.y - 40, x1: k.t.x - 14, y1: k.t.y - 30, icon: ITEMS[d.item].icon, t: 0, dur: 0.5 + i * 0.15 });
      floater(k.t.x, k.t.y - 80, k.first ? '🚂 🇨🇭' : `🚂 +${d.n} ${ITEMS[d.item].icon}`);
      if (near) AU.sfx('pop');
    }
  }
  prune(trains, k => k.age < TR_IN + TR_STOP + TR_OUT);
}
function drawRails(camX, vw) {
  const ts = G.things.filter(t => THINGS[t.type].area === 'terminal');
  for (const y of new Set(ts.map(trainLaneY))) { // je Band ein Gleis
    const x0 = Math.max(Math.min(...ts.filter(t => trainLaneY(t) === y).map(t => t.x)) - 140, camX - 20), x1 = Math.min(WORLD.w * T, camX + vw + 20);
    ctx.fillStyle = '#6b4a2b'; for (let x = x0 - x0 % 16; x < x1; x += 16) ctx.fillRect(x, y - 5, 5, 12); // Schwellen
    line('#7d7468', 3, x0, y - 2, x1, y - 2); line('#7d7468', 3, x0, y + 4, x1, y + 4);
  }
}
function drawTrain(k) {
  const X = trainX(k), y = k.y, c = TR_C[k.t.type] || '#c0552f', mv = k.age < TR_IN || k.age > TR_IN + TR_STOP;
  ellipse(X + 105, y + 2, 112, 6, 'rgba(0,0,0,.2)');
  for (let i = 0; i < 2; i++) { // Containerwagen
    const wx = X + 76 + i * 66;
    line('#333', 2, wx - 6, y - 10, wx, y - 10);
    ctx.fillStyle = '#4a4a4a'; ctx.fillRect(wx, y - 12, 60, 5);
    ctx.fillStyle = c; ctx.fillRect(wx + 3, y - 38, 54, 26); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (let j = 0; j < 6; j++) ctx.fillRect(wx + 6 + j * 9, y - 36, 2, 22);
    wheel(wx + 10, y - 2, 5); wheel(wx + 50, y - 2, 5);
  }
  // Lok: schräge Nase, weisser Streifen, Schweizer Kreuz
  ctx.fillStyle = '#d42a20'; ctx.beginPath(); ctx.moveTo(X, y - 8); ctx.lineTo(X + 10, y - 38); ctx.lineTo(X + 70, y - 38); ctx.lineTo(X + 70, y - 8); ctx.fill();
  ctx.fillStyle = '#2a3440'; ctx.beginPath(); ctx.moveTo(X + 6, y - 22); ctx.lineTo(X + 11, y - 35); ctx.lineTo(X + 22, y - 35); ctx.lineTo(X + 22, y - 22); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillRect(X + 3, y - 15, 67, 3); ctx.fillRect(X + 40, y - 33, 14, 14);
  ctx.fillStyle = '#d42a20'; ctx.fillRect(X + 45, y - 31, 4, 10); ctx.fillRect(X + 42, y - 28, 10, 4);
  ellipse(X + 3, y - 10, 2.5, 2.5, mv ? '#fff3b0' : '#c9c2a0'); // Scheinwerfer
  line('#333', 2, X + 46, y - 38, X + 38, y - 47, X + 50, y - 54); line('#333', 2, X + 42, y - 54, X + 58, y - 54); // Stromabnehmer
  if (mv && (time * 6 + k.t.id * 0.37) % 1 < 0.12) { ellipse(X + 50, y - 55, 6, 6, 'rgba(160,210,255,.5)'); ellipse(X + 50, y - 55, 2.5, 2.5, '#fff'); } // Funke am Fahrdraht
  for (const wx of [14, 28, 48, 62]) wheel(X + wx, y - 2, 5);
}
const grown = t => t.ripe ? 1 : t.timer / THINGS[t.type].time;
DRAW.bienenhaus = (x, y, t) => { // Bienenhaus mit bunten Fluglöchern; je mehr Bienen, desto bald Honig
  const g = grown(t), C = ['#e8483b', '#f2cf3b', '#3a6fd8', '#2f8f4e', '#f29a2e', '#f2f2f2'];
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#9a6236'; ctx.fillRect(x - 54, y - 44, 76, 40); for (const px of [-52, 16]) { ctx.fillStyle = '#5f3a1e'; ctx.fillRect(x + px, y - 6, 4, 6); }
  ctx.fillStyle = '#5f3a1e'; ctx.beginPath(); ctx.moveTo(x - 62, y - 42); ctx.lineTo(x - 16, y - 62); ctx.lineTo(x + 30, y - 42); ctx.fill();
  for (let i = 0; i < 6; i++) { const bx = x - 50 + (i % 3) * 24, by = y - 40 + Math.floor(i / 3) * 17; ctx.fillStyle = C[i]; ctx.fillRect(bx, by, 20, 14); ctx.fillStyle = '#222'; ctx.fillRect(bx + 7, by + 10, 6, 2); }
  for (let i = 0; i < 8; i++) ellipse(x + 32 + (i % 4) * 9, y - 2 - (i >> 2) * 8, 3, 3, C[(i + 2) % 6]); // Blumenwiese
  for (let i = 0; i < 3 + Math.round(g * 6); i++) {
    const a = time * (1.5 + i * 0.13) + i * 2.1 + t.id, bx = x + 20 + Math.cos(a) * (18 + i * 3), by = y - 24 + Math.sin(a * 1.7) * 12;
    ellipse(bx, by, 2.6, 1.8, '#f2c21e'); ellipse(bx, by - 2, 1.6, 1.2, 'rgba(255,255,255,.8)');
  }
  if (t.store > 0) crate(x + 80, y + 4, '#f2a81e', Math.min(t.store, 12));
};
function rowCrop(x, y, t, leaf, hi, rleaf, rhi, knolle, big = 1) { // Dämme mit Kraut; reif = Knollen gucken heraus
  const g = grown(t), s = (3 + g * 5) * big;
  ctx.fillStyle = '#7a5636'; rrect(x - 66, y - 34, 140, 38, 8); ctx.fill();
  for (let r = 0; r < 3; r++) {
    const ry = y - 25 + r * 11; line('#5e4329', 3, x - 60, ry + 4, x + 68, ry + 4);
    for (let c = 0; c < 8; c++) {
      const px = x - 56 + c * 16 + (r % 2) * 6;
      if (g > 0.6 && (c + r) % 3 === 0) ellipse(px + 4, ry + 4, 3 * big, 2.2 * big, knolle);
      ellipse(px, ry, s + 1, s * 0.8, t.ripe ? rleaf : leaf); ellipse(px - s * 0.4, ry - s * 0.4, s * 0.6, s * 0.5, t.ripe ? rhi : hi);
    }
  }
  if (t.store > 0) crate(x + 86, y + 4, knolle, Math.min(t.store, 12));
}
DRAW.kartoffelfeld = (x, y, t) => rowCrop(x, y, t, '#4f9a36', '#6cbf45', '#b8a33a', '#d0bb4a', '#d9b072');
DRAW.ruebenfeld = (x, y, t) => rowCrop(x, y, t, '#3f8a3a', '#5cae4a', '#3f8a3a', '#6cbf45', '#f2ecd8', 1.25);
function bigTree(x, y, c1, c2, c3) {
  ellipse(x, y, 46, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 6, y - 40, 12, 40); line('#6b4423', 5, x, y - 30, x - 18, y - 50); line('#6b4423', 5, x, y - 34, x + 16, y - 54);
  for (const [cx, cy, r, c] of [[-22, -58, 22, c1], [20, -60, 24, c1], [0, -78, 28, c2], [-6, -62, 20, c3]]) ellipse(x + cx, y + cy, r, r * 0.85, c);
}
const fruitAt = i => [-28 + (i * 37 % 56), -88 + (i * 23 % 36)]; // Früchte verteilt in der Krone
DRAW.kastanienbaum = (x, y, t) => { // stachelige Igel im Baum, reife Kastanien liegen am Boden
  const g = grown(t);
  bigTree(x, y, '#2f6a2a', '#3d7d33', '#468a3a');
  for (let i = 0; i < Math.round(g * 7); i++) {
    const [fx, fy] = fruitAt(i), bx = x + fx, by = y + fy;
    ctx.strokeStyle = '#c8d86a'; ctx.lineWidth = 1; ctx.beginPath(); for (let a = 0; a < 6.3; a += 0.7) { ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 6.5, by + Math.sin(a) * 6.5); } ctx.stroke();
    ellipse(bx, by, 4, 4, t.ripe ? '#a8b83a' : '#7fb83a');
  }
  if (t.ripe) for (let i = 0; i < 4; i++) ellipse(x - 30 + i * 14, y + 2, 3.5, 2.6, '#7a3f1e');
  if (t.store > 0) crate(x + 50, y + 4, '#7a3f1e', Math.min(t.store, 12));
};
DRAW.kirschbaum = (x, y, t) => { // Chriesi zu zweit am Stiel; ein Glitzerband verscheucht die Vögel
  const g = grown(t);
  bigTree(x, y, '#3f7d35', '#4f9440', '#5aa148');
  for (let i = 0; i < Math.round(g * 9); i++) {
    const [fx, fy] = fruitAt(i), bx = x + fx, by = y + fy, c = g > 0.7 ? '#c8102e' : '#e8a040';
    line('#4a6a2a', 1, bx, by - 6, bx - 3, by, bx, by - 6, bx + 3, by); ellipse(bx - 3, by + 1, 2.8, 2.8, c); ellipse(bx + 3, by + 1, 2.8, 2.8, c);
  }
  const w = Math.sin(time * 3 + t.id) * 4; line('#d8dde8', 2, x + 16, y - 54, x + 18 + w, y - 38); line('#f2c21e', 2, x + 17, y - 54, x + 21 + w, y - 40);
  if (t.store > 0) crate(x + 50, y + 4, '#c8102e', Math.min(t.store, 12));
};
function goat(x, y, ph, c = '#f2efe6') { // Geiss mit Hörnern und Bart, kaut
  const k = Math.sin(ph) * 1.2;
  ellipse(x, y - 9, 10, 6, c); ellipse(x + 10, y - 15 + k, 4.5, 4, c); line('#8a7a62', 1.6, x + 9, y - 19 + k, x + 6, y - 24 + k, x + 4, y - 22 + k);
  line('#d8d0c0', 1.5, x + 12, y - 12 + k, x + 12, y - 8 + k); ellipse(x + 12, y - 16 + k, 0.9, 0.9, '#222');
  for (const lx of [-7, -3, 4, 7]) line(c, 2, x + lx, y - 4, x + lx, y + 1);
  line(c, 2, x - 9, y - 12, x - 12, y - 15);
}
DRAW.geiss = (x, y, t) => { // Steinhütte, Felsen, eine Geiss steht ganz oben drauf
  const g = grown(t);
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#9a958c'; ctx.fillRect(x - 60, y - 38, 36, 34); bricks(x - 60, y - 38, 36, 34);
  ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(x - 64, y - 36); ctx.lineTo(x - 42, y - 52); ctx.lineTo(x - 20, y - 36); ctx.fill();
  ctx.fillStyle = '#3a2412'; ctx.fillRect(x - 47, y - 22, 10, 18);
  ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.moveTo(x + 30, y); ctx.lineTo(x + 40, y - 30); ctx.lineTo(x + 52, y - 34); ctx.lineTo(x + 64, y); ctx.fill(); // Felsen
  goat(x + 44, y - 32, time * 5 + t.id, '#e8e2d4');
  for (let i = 0; i < 1 + Math.round(g * 2); i++) goat(x - 10 + i * 20, y + 2 - (i % 2) * 4, time * 4 + i * 2 + t.id, i % 2 ? '#8a5a3a' : '#f2efe6');
  if (t.store > 0) crate(x + 80, y + 4, '#f8f8f2', Math.min(t.store, 12));
};
// ---- Alpenstil: Holzhaus auf gemauertem Sockel, flaches weites Dach mit Steinen ----
function alpHouse(x, y, w, base, up, rh) { // gibt die Oberkante der Wand zurück
  ellipse(x + 8, y, w / 2 + 16, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#ece6da'; ctx.fillRect(x - w / 2, y - base, w, base);
  const top = y - base - up, g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, '#9a6236'); g.addColorStop(1, '#5f3a1e');
  ctx.fillStyle = g; ctx.fillRect(x - w / 2, top, w, up);
  ctx.beginPath(); ctx.moveTo(x - w / 2, top); ctx.lineTo(x, top - rh); ctx.lineTo(x + w / 2, top); ctx.fill(); // Giebel
  ctx.strokeStyle = 'rgba(30,15,5,.35)'; ctx.lineWidth = 1;
  for (let yy = y - base - 6; yy > top - rh + 4; yy -= 6) { const k = yy < top ? (yy - top + rh) / rh : 1; ctx.beginPath(); ctx.moveTo(x - w / 2 * k, yy); ctx.lineTo(x + w / 2 * k, yy); ctx.stroke(); } // Balken
  ctx.fillStyle = '#5a5248'; ctx.beginPath(); ctx.moveTo(x - w / 2 - 18, top + 6); ctx.lineTo(x, top - rh - 8); ctx.lineTo(x + w / 2 + 18, top + 6);
  ctx.lineTo(x + w / 2 + 12, top + 10); ctx.lineTo(x, top - rh); ctx.lineTo(x - w / 2 - 12, top + 10); ctx.closePath(); ctx.fill();
  for (const k of [0.3, 0.65]) for (const sx of [-1, 1]) ellipse(x + sx * (w / 2 + 14) * k, top - rh - 6 + (rh + 12) * k, 3.5, 2.5, '#9a958c'); // Steine gegen den Föhnsturm
  return top;
}
function shutterWin(x, y, w = 18, h = 16) { ctx.fillStyle = '#fff'; ctx.fillRect(x - 2, y - 2, w + 4, h + 4); win(x, y, w, h); ctx.fillStyle = '#3d7a3a'; ctx.fillRect(x - 7, y - 2, 5, h + 4); ctx.fillRect(x + w + 2, y - 2, 5, h + 4); }
function flowers(x0, x1, y) { ctx.fillStyle = '#6b4423'; ctx.fillRect(x0, y, x1 - x0, 4); ctx.fillStyle = '#e8303a'; for (let xx = x0 + 2; xx < x1; xx += 5) { ctx.beginPath(); ctx.arc(xx, y - 1, 2.3, 0, 7); ctx.fill(); } }
function balcony(x, w, y) {
  ctx.fillStyle = '#7a4a26'; ctx.fillRect(x - w / 2 - 4, y - 2, w + 8, 4); for (let bx = x - w / 2; bx <= x + w / 2; bx += 8) ctx.fillRect(bx, y - 2, 2.5, 12); ctx.fillRect(x - w / 2 - 4, y + 8, w + 8, 2.5);
  flowers(x - w / 2, x + w / 2, y - 4);
}
// ---- Hof → Städtchen (TOWN) ----
const townOn = () => TOWN.filter(b => G.land >= b.lv && (!b.se || sightsOn().some(s => s.town === b))); // se: steht nur, wenn die Südost-Ecke Platz hat
// ---- Sehenswürdigkeiten (SIGHTS) an den Wegen, Neustadt (TOWN mit se) und Geschäftszentren in der Südost-Ecke ----
// Sehenswürdigkeiten stehen gleich neben einem Weg – meist hinter einem Bandende, wo man baut – und halten Abstand zueinander,
// damit sie über alle Bänder verteilt sind. Neustadt und Geschäftszentren füllen die Ecke ganz unten rechts.
// Jedes Ding behält seinen Platz (G.spot), bis ein Band hineinwächst – dann sucht es neu. Neu gerechnet nur bei anderem Land/Spieler; Deko gilt als Hindernis.
// Nächster Punkt auf einem Weg: [Abstand, x, y] (Kacheln)
function nearPath(x, y) {
  let best = [1e9];
  for (const p of basePaths()) for (let j = 1; j < p.length; j++) {
    const [ax, ay] = p[j - 1], dx = p[j][0] - ax, dy = p[j][1] - ay, t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1), d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
    if (d < best[0]) best = [d, ax + t * dx, ay + t * dy];
  }
  return best;
}
let sightMemo = null;
function sightsOn() {
  if (sightMemo?.g === G && sightMemo.land === G.land && sightMemo.w === WORLD.w && sightMemo.e === G.ext?.length) return sightMemo.list;
  const bandRects = () => { // [x0, x1, y0, y1] in Kacheln
    const r = [];
    for (const s of bandSegs()) {
      const a = s.a; if (a.x < ROAD_X) continue;
      r.push([a.x > ROAD_X2 ? ROAD_X2 - 1.5 : 0, Math.max(segEnd(s) + 3, a.hill ? ROAD_X + 17 : 0), Math.min(a.y - 2.8, ...(a.lane || []).map(l => l - 1)), Math.max(a.y + (segRows(s) - 1) * a.dy + 0.8, ...(a.lane || []).map(l => l + 0.9))]); // Strasse kann unter den Reihen liegen (Acker)
      if (s.k === 'terminal') r.push([ROAD_X2, 1e4, a.lane[0] - 1.6, a.lane[0] + 0.6]); // Gleis bis an den Weltrand
    }
    for (const p of basePaths()) for (let j = 1; j < p.length; j++) { const [ax, ay] = p[j - 1], [bx, by] = p[j]; r.push([Math.min(ax, bx) - 1, Math.max(ax, bx) + 1, Math.min(ay, by) - 1, Math.max(ay, by) + 0.9]); } // Oststrasse und Verbindung
    return r;
  };
  const busy = bandRects();
  G.land += 6; const later = bandRects(); G.land -= 6; // so gross sind die Bänder in 6 Land-Stufen: neuer Platz für Sehenswürdigkeiten bleibt eine Weile frei
  for (const d of G.deco) if (DECOS[d.type].where === 'land') busy.push(DECOS[d.type].sell ? filRect(d).map(v => v / T) : [d.x / T - 1, d.x / T + 1, d.y / T - 2, d.y / T + 0.6]);
  const todo = Object.entries(SIGHTS).filter(([, s]) => G.land >= s.lv).map(([k, s]) => ({ k, lv: s.lv, w: s.w, h: s.h }))
    .concat(TOWN.filter(b => b.se && G.land >= b.lv).map(b => ({ town: b, lv: b.lv, w: 2.2, h: 3.8 })),
      Object.entries(AREAS).filter(([, a]) => a.hub && areaOn(a)).flatMap(([k, a]) => segs(k).map(s => ({ k: s.key, hub: a, lv: s.j ? 1e4 + s.j : a.from, w: a.cols * a.dx + 0.8, h: hubH(a) })))).sort((a, b) => a.lv - b.lv); // zweiter Platz nach allen anderen
  const list = [], spot = G.spot ||= {};
  const fits = r => !busy.some(b => r[0] < b[1] && r[1] > b[0] && r[2] < b[3] && r[3] > b[2]) && r[0] > ROAD_X + 1 && r[1] < WORLD.w - 0.5 && r[2] > 4 && r[3] < WORLD.h + 0.3;
  const put = (s, x, y) => { // unten Platz fürs Namensschild
    const r = [x - s.w / 2, x + s.w / 2, y - s.h, y + 0.7]; if (!fits(r)) return false;
    busy.push([r[0] - 0.5, r[1] + 0.5, r[2] - 0.3, r[3]]); list.push(Object.assign(s, { x, y })); spot[key(s)] = [x, y];
    if (s.town) Object.assign(s.town, { x, y });
    return true;
  };
  const key = s => s.town ? 't' + s.lv : s.hub ? s.k : 'w' + s.k; // w: Sehenswürdigkeit am Weg (alte Plätze in der Ecke gelten nicht mehr)
  for (const s of todo) s.old = spot[key(s)];
  for (const s of todo) if (Array.isArray(s.old) && put(s, +s.old[0], +s.old[1])) s.done = 1; // zuerst alle, die bleiben dürfen
  // Sehenswürdigkeit: freier Platz nahe einem Wegende, Strafe für Nachbarn unter 16 Kacheln → verteilt über die Bänder
  const ends = basePaths().map(p => p.at(-1));
  for (const s of todo) if (!s.done && !s.town && !s.hub) {
    let best = null;
    for (const [ex, ey] of ends) for (let y = Math.round(ey - 1); y <= ey + s.h + 2; y++) for (let x = Math.round(ex - s.w / 2); x <= ex + s.w / 2 + 30; x++) {
      const r = [x - s.w / 2, x + s.w / 2, y - s.h, y + 0.7];
      if (!fits(r) || later.some(b => r[0] < b[1] && r[1] > b[0] && r[2] < b[3] && r[3] > b[2])) continue;
      const v = nearPath(x, y + 0.9)[0] + Math.max(0, 16 - Math.min(16, ...list.filter(o => !o.town && !o.hub).map(o => Math.hypot(o.x - x, o.y - y))));
      if (!best || v < best[0]) best = [v, x, y];
    }
    if (best && put(s, best[1], best[2])) s.done = 1;
  }
  // ponytail: Rasterscan O(Höhe·Breite·Hindernisse) je Ding, läuft nur beim Landkauf – Freiflächen-Liste, falls es mal ruckelt
  for (const s of todo) if (!s.done) find: for (let y = Math.floor(WORLD.h - 0.5); y - s.h > 4; y--) for (let x = Math.floor(WORLD.w - 1 - s.w / 2); x - s.w / 2 > ROAD_X + 1; x--) if (put(s, x, y)) break find;
  // ponytail: Geschäftszentrum ohne freien Platz steht notfalls ganz unten rechts, auch wenn es etwas überlappt – bei 200 Stufen ist dort immer Wiese
  for (const s of todo) if (s.hub && !list.includes(s)) list.push(Object.assign(s, { x: WORLD.w - s.w / 2 - 1, y: WORLD.h - 0.8 }));
  sightMemo = { g: G, land: G.land, w: WORLD.w, e: G.ext?.length, list, busy, gen: (sightMemo?.gen || 0) + 1 };
  return list;
}
// Freie Südost-Wiese (Hintergrund-Cache): Wäldchen, Felsbrocken, Blumen, Tümpel und Heustadel – fest je Zelle –
// und ein Wanderweg vom nächsten Bandweg zu allen Sehenswürdigkeiten
function drawPanorama() {
  const list = sightsOn(), { busy } = sightMemo, C = 2.5;
  const free = (x, y) => !busy.some(b => x + C > b[0] && x < b[1] && y + C > b[2] && y < b[3]);
  const ax = Math.max(ROAD_X + 2, Math.floor(bg.x / T / C) * C), bx = Math.min(WORLD.w - 1.5, (bg.x + bg.w) / T), ay = Math.max(5, Math.floor(bg.y / T / C) * C), by = Math.min(WORLD.h - 1.5, (bg.y + bg.h + 3 * T) / T);
  for (let cx = ax; cx < bx; cx += C) for (let cy = ay; cy < by; cy += C) {
    if (!free(cx, cy)) continue;
    const r = seeded(Math.round(cx * 31 + cy * 977) % 233280), v = r(), px = (cx + C / 2 + r() - 0.5) * T, py = (cy + C / 2 + r() - 0.5) * T;
    if (v < 0.28) Array.from({ length: 3 + Math.floor(r() * 4) }, () => [px + (r() - 0.5) * 80, py + (r() - 0.5) * 44, 0.8 + r() * 0.6]).sort((a, b) => a[1] - b[1]).forEach(f => tanne(...f)); // Wäldchen
    else if (v < 0.36) { ellipse(px + 4, py + 2, 22, 7, 'rgba(0,0,0,.2)'); ellipse(px, py - 8, 20, 14, '#9a958c'); ellipse(px - 5, py - 13, 9, 6, '#b8b3a8'); } // Findling
    else if (v < 0.56) for (let i = 0; i < 14; i++) ellipse(px + (r() - 0.5) * 90, py + (r() - 0.5) * 50, 2.6, 2.6, ['#f2f2f2', '#f2cf3b', '#e870b0', '#6b8fe0'][i % 4]); // Blumenwiese
    else if (v < 0.6) { ellipse(px, py, 34, 14, '#3c7fb8'); ellipse(px - 6, py - 3, 22, 7, 'rgba(255,255,255,.25)'); for (let i = 0; i < 6; i++) line('#5c8a34', 1.6, px + 26 + i * 3, py + 4, px + 27 + i * 3, py - 10); } // Tümpel
    else if (v < 0.64) alpHouse(px, py, 26, 4, 14, 10); // Heustadel
  }
  // Wanderweg: vom nächsten Weg zu jeder Sehenswürdigkeit und jedem Geschäftszentrum, mit gelbem Wegweiser
  ctx.lineCap = ctx.lineJoin = 'round';
  for (const s of list) if (!s.town) {
    const [d, sx, sy] = nearPath(s.x, s.y + 0.9), [ex, ey] = [s.x * T, (s.y + 0.9) * T];
    if (d < 0.6) continue;
    for (const [w, c] of [[T * 0.6, '#b99a68'], [T * 0.42, '#dcc596']]) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx * T, sy * T); ctx.quadraticCurveTo((sx * T + ex) / 2 + 20, (sy * T + ey) / 2 - 20, ex, ey); ctx.stroke(); }
    const px = sx * T, py = sy * T; line('#6b4a2b', 3, px + 20, py - 6, px + 20, py - 40);
    ctx.fillStyle = '#f2c21a'; ctx.beginPath(); ctx.moveTo(px + 20, py - 40); ctx.lineTo(px + 46, py - 40); ctx.lineTo(px + 54, py - 34); ctx.lineTo(px + 46, py - 28); ctx.lineTo(px + 20, py - 28); ctx.fill();
  }
}
// Reisepass: erster Besuch = Stempel, Taschengeld und „Wusstest du?“
function visitSights() {
  for (const s of sightsOn()) {
    if (s.town || s.hub || G.pass[s.k] || Math.abs(G.px / T - s.x) > s.w / 2 || G.py / T < s.y - s.h || G.py / T > s.y + 0.7) continue;
    const d = SIGHTS[s.k], fr = d.lv * 20;
    G.pass[s.k] = 1; G.money += fr; AU.sfx('cash'); hud(); save();
    floater(s.x * T, (s.y - s.h) * T, `📸 +${fr} Fr.`);
    toast($t`📸 Stempel im Reisepass! ${Object.keys(G.pass).length} von ${Object.keys(SIGHTS).length} Sehenswürdigkeiten besucht.`);
    showInfo(d);
  }
}
// Berg: Umriss (Fuss links → Fuss rechts), Schattenseite rechts vom Gipfel px, Schnee oberhalb snowY
function mount(pts, rock, px, snowY) {
  const path = () => { ctx.beginPath(); for (const [a, b] of pts) ctx.lineTo(a, b); ctx.closePath(); };
  const top = Math.min(...pts.map(p => p[1])), bot = Math.max(...pts.map(p => p[1])), L = pts[0][0] - 10, R = pts.at(-1)[0] + 10;
  const g = ctx.createLinearGradient(0, top, 0, bot); g.addColorStop(0, shade(rock, 1.12)); g.addColorStop(1, shade(rock, 0.85));
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.fillStyle = '#f7fbff'; ctx.beginPath(); ctx.moveTo(L, top - 10);
  for (let a = L; a <= R; a += 8) ctx.lineTo(a, snowY + Math.sin(a * 0.09) * 8 + Math.sin(a * 0.23) * 5);
  ctx.lineTo(R, top - 10); ctx.fill();
  ctx.fillStyle = 'rgba(30,35,60,.22)'; ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(px + (bot - top) * 0.22, bot); ctx.lineTo(R, bot); ctx.lineTo(R, top); ctx.fill(); // Schattenseite
  ctx.restore();
}
function palm(x, y, s = 1) {
  ctx.strokeStyle = '#8a6a44'; ctx.lineWidth = 5 * s; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6 * s, y - 25 * s, x + 3 * s, y - 48 * s); ctx.stroke();
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.5 + Math.sin(time * 1.5 + i) * 0.05; ctx.strokeStyle = i % 2 ? '#2f8f3e' : '#3fa34d'; ctx.lineWidth = 4 * s; ctx.beginPath(); ctx.moveTo(x + 3 * s, y - 48 * s); ctx.quadraticCurveTo(x + 3 * s + Math.cos(a) * 18 * s, y - 48 * s + Math.sin(a) * 18 * s - 6 * s, x + 3 * s + Math.cos(a) * 30 * s, y - 48 * s + Math.sin(a) * 26 * s + 8 * s); ctx.stroke(); }
}
// x/y = Mitte unten, W/H = Grösse in Pixeln
const SIGHT_DRAW = {
  rheinfall(x, y, W, H) {
    const t = y - H, L = x - W / 2, R = x + W / 2, lip = t + H * 0.38, pool = y - 22;
    mount([[L, y - 6], [L, t + H * 0.12], [L + W * 0.22, t + H * 0.22], [L + W * 0.26, y - 6]], '#6f7a4a', L + W * 0.3, -1e4);
    mount([[R - W * 0.24, y - 6], [R - W * 0.2, t + H * 0.25], [R, t + H * 0.15], [R, y - 6]], '#6f7a4a', R, -1e4);
    ctx.fillStyle = '#4b8fca'; ctx.beginPath(); ctx.moveTo(L + W * 0.2, t + H * 0.2); ctx.lineTo(R - W * 0.2, t + H * 0.2); ctx.lineTo(R - W * 0.21, lip); ctx.lineTo(L + W * 0.23, lip); ctx.fill(); // Rhein oben
    const fx0 = L + W * 0.23, fw = W * 0.56, g = ctx.createLinearGradient(0, lip, 0, pool); g.addColorStop(0, '#d8ecf8'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g; ctx.fillRect(fx0, lip, fw, pool - lip); // Wasserfall
    for (let i = 0; i < 18; i++) { const fx = fx0 + (i + 0.5) * fw / 18, k = (time * 1.6 + i * 0.37) % 1; line('rgba(120,170,215,.55)', 2, fx, lip + k * (pool - lip) - 14, fx, lip + k * (pool - lip)); }
    ellipse(x, pool + 4, W * 0.4, 16, '#3f86c4');
    for (let i = 0; i < 10; i++) ellipse(fx0 + i * fw / 9, pool - 4 + Math.sin(time * 3 + i) * 3, 15, 10, 'rgba(255,255,255,.88)'); // Gischt
    mount([[x - 14, pool], [x - 9, lip + 26], [x + 4, lip + 18], [x + 14, pool]], '#5d574b', x + 4, -1e4); flagPole(x, lip + 22, 22, 11, 3); // Felsen mit Fahne
    house(L + W * 0.12, t + H * 0.22, 46, 30, '#efe3c8', '#8a3b2a', 16); ctx.fillStyle = '#efe3c8'; ctx.fillRect(L + W * 0.12 + 10, t + H * 0.22 - 62, 16, 34); poly([[L + W * 0.12 + 7, t + H * 0.22 - 62], [L + W * 0.12 + 18, t + H * 0.22 - 84], [L + W * 0.12 + 29, t + H * 0.22 - 62]], '#8a3b2a'); // Schloss Laufen
  },
  kapellbruecke(x, y, W, H) {
    const t = y - H;
    ctx.fillStyle = '#4a8fc8'; rrect(x - W / 2, t + H * 0.1, W, H * 0.9, 50); ctx.fill(); // Reuss
    for (let i = 0; i < 9; i++) { const wx = x - W / 2 + 30 + i * W / 10 + Math.sin(time * 0.8 + i) * 8, wy = t + H * (0.3 + (i % 3) * 0.22); line('rgba(255,255,255,.35)', 2, wx, wy, wx + 22, wy); }
    const ax = x - W / 2 + 14, ay = y - H * 0.22, bx = x + W / 2 - 14, by = t + H * 0.32, n = 16, P = i => [ax + (bx - ax) * i / n, ay + (by - ay) * i / n];
    for (let i = 0; i <= n; i++) { const [px, py] = P(i); line('#4a3018', 3, px, py, px, py + 16); } // Pfähle
    line('#8a5a30', 10, ax, ay, bx, by); // Gehweg
    for (let i = 0; i <= n; i++) { const [px, py] = P(i); line('#5b3a1e', 2, px, py - 4, px, py - 18); ellipse(px, py - 6, 3, 2.4, i % 2 ? '#e8303a' : '#f29a2e'); } // Stützen, Blumen
    line('#7a3a22', 12, ax - 4, ay - 20, bx + 4, by - 20); line('#9a4a2a', 4, ax - 4, ay - 24, bx + 4, by - 24); // Dach
    const [wx, wy] = P(n * 0.6); const tx = wx + 14, ty = wy + 34; // Wasserturm, achteckig
    ellipse(tx, ty, 26, 8, 'rgba(0,0,0,.25)');
    const g = ctx.createLinearGradient(tx - 20, 0, tx + 20, 0); g.addColorStop(0, '#c9b89a'); g.addColorStop(1, '#8e7d62');
    ctx.fillStyle = g; ctx.fillRect(tx - 20, ty - 96, 40, 96); line('rgba(0,0,0,.18)', 1, tx - 7, ty - 96, tx - 7, ty, tx + 7, ty, tx + 7, ty - 96);
    win(tx - 4, ty - 70, 8, 10); poly([[tx - 24, ty - 94], [tx, ty - 132], [tx + 24, ty - 94]], '#7a3a22');
  },
  zytglogge(x, y, W, H) {
    ctx.save(); ctx.translate(x, y - 34); ctx.scale(1.25, 1.25); DECO_DRAW.uhrturm(0, 0, { id: 7 }); ctx.restore();
    ctx.fillStyle = '#a8957a'; ctx.fillRect(x - 40, y - 46, 80, 46); // Stadttor
    ctx.fillStyle = '#2d241c'; ctx.beginPath(); ctx.moveTo(x - 16, y); ctx.lineTo(x - 16, y - 22); ctx.arc(x, y - 22, 16, Math.PI, 0); ctx.lineTo(x + 16, y); ctx.fill();
    const b = Math.sin(time * 4) * 3; ellipse(x - 30, y - 56 + b, 6, 6, '#6b4423'); ellipse(x + 30, y - 56 - b, 6, 6, '#6b4423'); // tanzende Bären
    ellipse(x - 34, y - 61 + b, 2.5, 2.5, '#6b4423'); ellipse(x - 26, y - 61 + b, 2.5, 2.5, '#6b4423'); ellipse(x + 26, y - 61 - b, 2.5, 2.5, '#6b4423'); ellipse(x + 34, y - 61 - b, 2.5, 2.5, '#6b4423');
  },
  oeschinensee(x, y, W, H) {
    const t = y - H, ly = y - H * 0.3;
    mount([[x - W / 2, ly], [x - W * 0.4, t], [x - W * 0.18, t + H * 0.14], [x + W * 0.04, t - 6], [x + W * 0.28, t + H * 0.12], [x + W / 2, t + H * 0.02], [x + W / 2, ly]], '#8d8a86', x + W * 0.04, t + H * 0.12);
    for (const f of [-0.22, 0.2]) { line('rgba(255,255,255,.85)', 3, x + W * f, t + H * 0.2, x + W * f, ly - 4); }
    const g = ctx.createLinearGradient(0, ly - H * 0.2, 0, y); g.addColorStop(0, '#36c1c9'); g.addColorStop(1, '#1d8fa6');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, ly, W * 0.46, H * 0.27, 0, 0, 7); ctx.fill();
    if (SW[0]) { ctx.fillStyle = `rgba(235,245,250,${0.85 * SW[0]})`; ctx.beginPath(); ctx.ellipse(x, ly, W * 0.46, H * 0.27, 0, 0, 7); ctx.fill(); } // Winter: zugefroren
    else { const bx = x + Math.sin(time * 0.25) * W * 0.25; ellipse(bx, ly + 6, 14, 5, '#a0522d'); line('#5b3a1e', 1.5, bx - 10, ly + 2 + Math.sin(time * 3) * 2, bx + 10, ly + 2 - Math.sin(time * 3) * 2); } // Ruderboot
    for (let i = 0; i < 5; i++) fir(x - W * 0.45 + i * 14, y - 4 - (i % 2) * 6, 34, '#2f6a3a');
    for (let i = 0; i < 4; i++) fir(x + W * 0.32 + i * 14, y - 4 - (i % 2) * 6, 32, '#2f6a3a');
  },
  matterhorn(x, y, W, H) {
    const L = x - W / 2, R = x + W / 2, px = x + W * 0.04, py = y - H;
    ellipse(x, y - 4, W / 2, 14, 'rgba(0,0,0,.18)');
    mount([[L, y - 6], [L + W * 0.2, y - H * 0.42], [px - W * 0.1, py + H * 0.2], [px - W * 0.05, py + H * 0.1], [px - W * 0.08, py + 10], [px, py], [px + W * 0.07, py + H * 0.16], [px + W * 0.13, py + H * 0.3], [R, y - 6]], '#8b7d6e', px, py + H * 0.45);
    ctx.strokeStyle = 'rgba(60,45,35,.35)'; ctx.lineWidth = 1.5; for (let i = 1; i < 6; i++) { const yy = py + H * 0.4 + i * H * 0.1; ctx.beginPath(); ctx.moveTo(x - W * 0.3 + i * 8, yy); ctx.lineTo(x + W * 0.1, yy - 18); ctx.stroke(); } // Felsbänder
    flagPole(px, py + 2, 20, 10, 5);
    for (let i = 0; i < 3; i++) { alpHouse(L + W * 0.12 + i * 36, y - 2, 28, 8, 10, 10); } // Zermatt
  },
  landwasser(x, y, W, H) {
    const t = y - H, L = x - W / 2, R = x + W / 2, deck = t + H * 0.32, tx = R - W * 0.15;
    mount([[L, y], [L, t + H * 0.25], [L + W * 0.12, deck + 12], [x - W * 0.05, y - 12], [x + W * 0.15, y - 12], [tx, deck + 12], [R, t + H * 0.1], [R, y]], '#4f7a3a', R, -1e4); // Schlucht
    line('#5aa0d8', 8, L + W * 0.2, y - 8, R - W * 0.25, y - 14); // Landwasser
    mount([[tx - 4, y - 10], [tx - 2, t], [R, t + 6], [R, y - 10]], '#7a7468', R, -1e4);
    ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(tx - 1, deck); ctx.lineTo(tx - 1, deck - 22); ctx.arc(tx + 13, deck - 22, 14, Math.PI, 0); ctx.lineTo(tx + 27, deck); ctx.fill(); // Tunnel
    const x0 = L + W * 0.08, n = 6, sp = (tx - x0) / n;
    ctx.fillStyle = '#b5a088'; ctx.fillRect(x0, deck, tx - x0, 12);
    for (let i = 0; i <= n; i++) { const pxl = x0 + i * sp; ctx.fillRect(pxl - 6, deck, 12, y - 12 - deck); } // Pfeiler
    ctx.strokeStyle = '#b5a088'; ctx.lineWidth = 6; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x0 + (i + 0.5) * sp, deck + sp / 2 + 10, sp / 2 - 3, Math.PI, 0); ctx.stroke(); } // Bogen
    ctx.fillStyle = '#7a7468'; ctx.fillRect(x0 - 30, deck - 40, 26, y - deck + 30); ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.moveTo(x0 - 4, deck); ctx.lineTo(x0 - 4, deck - 22); ctx.arc(x0 - 18, deck - 22, 14, 0, Math.PI, true); ctx.lineTo(x0 - 32, deck); ctx.fill(); // Tunnel links
    ctx.save(); ctx.beginPath(); ctx.rect(x0 - 4, t - 50, tx - x0 + 10, H); ctx.clip(); // Zug fährt von Tunnel zu Tunnel
    const k = (time * 70) % (tx - x0 + 400), zx = x0 - 20 + k;
    for (let c = 0; c < 3; c++) { const cx = zx - c * 44; ctx.fillStyle = '#c8241a'; rrect(cx - 20, deck - 20, 40, 18, 4); ctx.fill(); ctx.fillStyle = '#d9eef8'; for (let w = 0; w < 3; w++) ctx.fillRect(cx - 15 + w * 11, deck - 16, 8, 6); }
    ctx.restore();
  },
  bundeshaus(x, y, W, H) {
    const w = W * 0.82, mw = w * 0.32, base = y - 26;
    ctx.fillStyle = '#d9cfbf'; ctx.fillRect(x - W / 2, base, W, 26); // Bundesplatz
    house(x - w * 0.33, base, w * 0.34, H * 0.36, '#d8c79e', '#5b6f63', 16); house(x + w * 0.33, base, w * 0.34, H * 0.36, '#d8c79e', '#5b6f63', 16);
    for (const s of [-1, 1]) for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) win(x + s * w * 0.33 - w * 0.15 + c * w * 0.08, base - H * 0.32 + r * 26, 10, 14);
    const mh = H * 0.5; ctx.fillStyle = '#e2d3ac'; ctx.fillRect(x - mw / 2, base - mh, mw, mh); // Mitteltrakt
    for (let c = 0; c < 6; c++) { ctx.fillStyle = '#f2e8cc'; ctx.fillRect(x - mw / 2 + 8 + c * (mw - 16) / 5 - 3, base - mh + 24, 6, mh - 30); } // Säulen
    poly([[x - mw / 2 - 4, base - mh + 2], [x, base - mh - 18], [x + mw / 2 + 4, base - mh + 2]], '#cdbd94');
    ctx.fillStyle = '#4f8f73'; ctx.beginPath(); ctx.ellipse(x, base - mh - 14, mw * 0.32, mw * 0.36, 0, Math.PI, 0); ctx.fill(); // Kuppel
    ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.beginPath(); ctx.ellipse(x - mw * 0.1, base - mh - 14, mw * 0.12, mw * 0.32, 0, Math.PI, 0); ctx.fill();
    flagPole(x, base - mh - 14 - mw * 0.36, 22, 12, 9);
    for (let i = 0; i < 13; i++) { const fx = x - W * 0.42 + i * W * 0.84 / 12, hh = 6 + 12 * Math.max(0, Math.sin(time * 2.2 + i * 0.7)); line('rgba(170,215,250,.95)', 2.5, fx, y - 6, fx, y - 6 - hh); } // 26 Fontänen (13 sieht man)
  },
  aletsch(x, y, W, H) {
    const t = y - H, L = x - W / 2, R = x + W / 2;
    mount([[L, y - 4], [L + W * 0.2, t], [L + W * 0.3, t + H * 0.2], [x + W * 0.05, y - 4]], '#7d7468', L + W * 0.2, t + H * 0.3);
    mount([[x - W * 0.05, y - 4], [R - W * 0.28, t + H * 0.18], [R - W * 0.16, t + 8], [R, y - 4]], '#6c6358', R - W * 0.16, t + H * 0.3);
    const C = s => x + Math.sin(s * 3.2 + 0.4) * W * 0.12, Yy = s => t + H * 0.06 + s * H * 0.86, wd = s => W * (0.2 - s * 0.09), N = 20;
    const g = ctx.createLinearGradient(0, t, 0, y); g.addColorStop(0, '#f6fbff'); g.addColorStop(1, '#a9cfe3');
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i <= N; i++) ctx.lineTo(C(i / N) - wd(i / N), Yy(i / N));
    for (let i = N; i >= 0; i--) ctx.lineTo(C(i / N) + wd(i / N), Yy(i / N));
    ctx.fill();
    for (const m of [-0.35, 0.25]) { ctx.strokeStyle = 'rgba(70,65,60,.7)'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 1; i <= N; i++) ctx.lineTo(C(i / N) + m * wd(i / N), Yy(i / N)); ctx.stroke(); } // Mittelmoränen
    for (let i = 2; i < N; i += 3) line('rgba(90,150,200,.55)', 1.5, C(i / N) - wd(i / N) * 0.8, Yy(i / N), C(i / N) - wd(i / N) * 0.5, Yy(i / N) + 4); // Gletscherspalten
    line('#6fb0dd', 4, C(1), y - 2, C(1) + 18, y + 4); // Schmelzwasser
  },
  jungfrau(x, y, W, H) {
    const pk = [[-0.3, 0.8, '#5b544c'], [0.02, 0.9, '#7a7166'], [0.3, 1, '#857b6f']]; // Eiger, Mönch, Jungfrau
    for (const [o, h, c] of pk) { const cx = x + o * W; mount([[cx - W * 0.24, y - 4], [cx - W * 0.04, y - H * h + 12], [cx, y - H * h], [cx + W * 0.05, y - H * h + 14], [cx + W * 0.22, y - 4]], c, cx, y - H * h * (o < 0 ? 0.62 : 0.5)); }
    const sx = x + W * 0.17, sy = y - H * 0.62; // Sphinx-Observatorium auf dem Jungfraujoch
    ctx.fillStyle = '#9aa3ad'; ctx.fillRect(sx - 6, sy - 6, 12, 14); ellipse(sx, sy - 7, 8, 7, '#c9d1da'); line('#6c757e', 2, sx, sy - 14, sx, sy - 20);
    ctx.fillStyle = '#1d1a16'; ctx.beginPath(); ctx.arc(x - W * 0.42, y - 4, 10, Math.PI, 0); ctx.fill(); // Bahntunnel in den Eiger
  },
  castelgrande(x, y, W, H) {
    const t = y - H, top = t + H * 0.42;
    mount([[x - W / 2, y], [x - W * 0.38, top + 10], [x + W * 0.36, top + 6], [x + W / 2, y]], '#8a8070', x + W * 0.3, -1e4); // Felshügel
    ctx.fillStyle = '#d8d0c0'; ctx.fillRect(x - W * 0.38, top - 22, W * 0.74, 28); // Mauer
    for (let c = x - W * 0.38; c < x + W * 0.36; c += 12) ctx.fillRect(c, top - 30, 7, 8); // Zinnen
    const tower = (tx, h, c) => { ctx.fillStyle = c; ctx.fillRect(tx - 12, top - h, 24, h); for (let i = 0; i < 3; i++) ctx.fillRect(tx - 12 + i * 9, top - h - 8, 6, 8); win(tx - 3, top - h + 14, 6, 9); };
    tower(x - W * 0.14, H * 0.55, '#ece6d8'); tower(x + W * 0.18, H * 0.45, '#9a9488'); // Torre Bianca, Torre Nera
    palm(x - W * 0.42, y - 2, 0.9); palm(x + W * 0.44, y - 2, 0.8);
  },
  saentis(x, y, W, H) {
    const px = x + W * 0.05, py = y - H + 44;
    mount([[x - W / 2, y - 4], [x - W * 0.25, y - H * 0.45], [px - W * 0.08, py + 14], [px, py], [px + W * 0.12, py + 22], [x + W / 2, y - 4]], '#a69e8e', px, py + H * 0.18);
    ctx.strokeStyle = 'rgba(90,80,65,.35)'; ctx.lineWidth = 2; for (let i = 1; i < 5; i++) { const yy = py + i * H * 0.13; ctx.beginPath(); ctx.moveTo(x - W * 0.35 + i * 10, yy + 20); ctx.lineTo(x + W * 0.3 - i * 6, yy); ctx.stroke(); } // Kalk-Schichten
    ctx.fillStyle = '#d8d8d4'; ctx.fillRect(px - 14, py - 10, 28, 12); // Wetterstation
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#d52b1e' : '#f2f2f2'; ctx.fillRect(px - 2.5, py - 12 - (i + 1) * 7, 5, 7); } // Antennenturm
    const sx = x - W * 0.45, sy = y - 8, k = (Math.sin(time * 0.3) + 1) / 2; line('#555', 1, sx, sy, px - 14, py - 4); // Schwebebahn
    const cx = sx + (px - 14 - sx) * k, cy = sy + (py - 4 - sy) * k; line('#555', 1.5, cx, cy, cx, cy + 6); ctx.fillStyle = '#d52b1e'; rrect(cx - 6, cy + 6, 12, 9, 2); ctx.fill();
  },
};
const townFloors = b => Math.min(b.max || (b.k === 'chalet' ? 3 : 4), (b.f0 || 1) + Math.floor((G.land - b.lv) / 40));
const TOWN_WALL = ['#f3e3c3', '#e9c9a8', '#d9e4ea', '#f2d0c4', '#e4e9c8', '#f6f1e4'], TOWN_ROOF = ['#8a3b2a', '#6f4a3a', '#5a5f66', '#a0522d'];
function drawTown(b) {
  const x = b.x * T, y = b.y * T, f = townFloors(b), n = b.lv / 5;
  if (b.k === 'chalet') {
    const top = alpHouse(x, y, 62, 14, 22 * f, 18);
    for (let i = 0; i < f; i++) { for (const wx of [-22, 8]) shutterWin(x + wx, top + 4 + i * 22, 14, 11); flowers(x - 24, x + 24, top + 20 + i * 22); }
    door(x, y, 12, 14, '#5b3a1e'); return;
  }
  const w = b.k === 'haus' ? 60 : 78, fh = 24, h = 24 + f * fh;
  house(x, y, w, h, b.wall || TOWN_WALL[n % TOWN_WALL.length], TOWN_ROOF[n % TOWN_ROOF.length], f > 3 ? 14 : 22);
  const cols = b.k === 'haus' ? 2 : 3;
  for (let i = 0; i < f; i++) for (let j = 0; j < cols; j++) { const wx = x - w / 2 + (j + 0.5) * w / cols - 7; b.k === 'haus' ? shutterWin(wx, y - h + 6 + i * fh, 14, 12) : win(wx, y - h + 6 + i * fh, 14, 13); }
  if (b.garage) for (const gx of [-20, 20]) { ctx.fillStyle = '#c8241a'; ctx.fillRect(x + gx - 15, y - 22, 30, 22); for (let py = y - 18; py < y; py += 5) line('rgba(0,0,0,.25)', 1, x + gx - 15, py, x + gx + 15, py); }
  else door(x, y, 14, 20, '#5b3a1e');
  if (b.flag) flagPole(x + w / 2 - 8, y - h - 6, 30, 14, b.lv);
  if (b.name) { // Schild über dem Eingang
    const t = `${$t([b.name]).toUpperCase()} ${b.icon}`; ctx.font = '800 10px system-ui'; const tw = ctx.measureText(t).width + 10;
    ctx.fillStyle = b.sign; rrect(x - tw / 2, y - h - 2, tw, 15, 4); ctx.fill(); ctx.textAlign = 'center'; ctx.fillStyle = b.sign === '#f2c21a' ? '#222' : '#fff'; ctx.fillText(t, x, y - h + 9);
  }
}
// ---- Laden & Händler: Ausbaustufen ----
function haendlerMann(x, y) { // y = Schultern
  ellipse(x, y - 10, 9, 10, '#f1c9a5'); ctx.fillStyle = '#4a3020'; ctx.beginPath(); ctx.arc(x, y - 14, 9, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#3f6fb0'; ctx.fillRect(x - 11, y, 22, 14);
}
function shopWin(x, y, w, h, frame = '#5b3a1e') { // grosses Schaufenster mit Spiegelung
  ctx.fillStyle = frame; ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#d9eef8'); g.addColorStop(1, '#7fa9c6'); ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.moveTo(x + w * 0.15, y); ctx.lineTo(x + w * 0.35, y); ctx.lineTo(x + w * 0.1, y + h); ctx.lineTo(x - w * 0.1 > x ? x : x, y + h); ctx.fill();
}
function shopCart(x, y) { // Einkaufswagen
  ctx.strokeStyle = '#8c949c'; ctx.lineWidth = 1.5; ctx.strokeRect(x - 9, y - 16, 18, 10);
  for (let i = -6; i <= 6; i += 4) line('#a9b0b7', 1, x + i, y - 16, x + i, y - 6);
  line('#8c949c', 2, x + 9, y - 16, x + 13, y - 20); line('#d52b1e', 3, x + 11, y - 20, x + 15, y - 20);
  wheel(x - 6, y - 2, 2.5); wheel(x + 6, y - 2, 2.5);
}
function dorfladen(x, y, lv) { // Stufe 2–3: zweistöckiger Dorfladen mit Schaufenstern (3: Gartencenter daneben)
  if (lv >= 3) { // Gartencenter mit Zaun, Bäumchen und Blumen
    const gx = x - 150;
    ctx.fillStyle = 'rgba(120,90,50,.18)'; ctx.fillRect(gx - 34, y - 34, 68, 34);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { const px = gx - 22 + i * 22, py = y - 22 + j * 16; ctx.fillStyle = '#b5652a'; ctx.fillRect(px - 5, py - 6, 10, 7); ellipse(px, py - 10, 7, 6, j ? '#5f9a3a' : ['#e8303a', '#f2cf3b', '#e870b0'][i]); }
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.strokeRect(gx - 34, y - 34, 68, 34);
    for (let px = gx - 34; px <= gx + 34; px += 8.5) line('#f2f2f2', 1.5, px, y, px, y - 10);
    sign(gx, y - 46, $t`GARTEN 🌷`);
  }
  house(x, y, 180, 118, '#f4e6c4', '#7a3b2a', 40);
  ctx.fillStyle = '#e3d2a8'; ctx.fillRect(x - 90, y - 52, 180, 4); // Gesims
  shopWin(x - 82, y - 46, 52, 40); shopWin(x + 30, y - 46, 52, 40);
  ctx.font = '15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🧀🍞🥛', x - 56, y - 20); ctx.fillText('🔧🌱🐄', x + 56, y - 20);
  shopWin(x - 13, y - 44, 26, 44, '#3d6b8f'); line('#3d6b8f', 2, x, y - 44, x, y); // Glastür
  for (const wx of [-70, -20, 30]) { shutterWin(wx + x, y - 100, 18, 16); flowers(x + wx - 4, x + wx + 22, y - 80); }
  awning(x, y - 66, 186, '#d52b1e', '#fff', 14);
  sign(x, y - 136, $t`DORFLADEN 🛒`);
  if (lv >= 3) { ctx.fillStyle = '#8a5a30'; ctx.fillRect(x + 96, y - 14, 30, 4); ctx.fillRect(x + 99, y - 10, 3, 10); ctx.fillRect(x + 120, y - 10, 3, 10); } // Bänkli
}
function supermarkt(x, y, lv) { // Stufe 4–5: moderner Markt mit Glasfront, Flachdach (5: Solardach, Parkplatz, Ladesäule)
  const w = 250, h = 96, x0 = x - w / 2 - 10, up = lv >= 6 ? 64 : 0; // up = Obergeschoss
  // ab Stufe 6 wächst er in die Höhe (links der Rand, rechts der Händler, vorne der Weg)
  if (lv >= 7) { // Glasturm am linken Rand
    const tx = x0 + 8, th = lv >= 9 ? 190 : 140; ctx.fillStyle = '#5a7a94'; ctx.fillRect(tx, y - h - th, 62, th);
    for (let r = 0; r < th / 16 - 1; r++) for (let c = 0; c < 3; c++) { ctx.fillStyle = (r * 5 + c * 3 + Math.floor(time * 0.3)) % 7 ? '#a8d0ec' : '#ffe08a'; ctx.fillRect(tx + 5 + c * 19, y - h - th + 6 + r * 16, 15, 11); } // Fenster, manche mit Licht
    if (lv >= 9) { const cx = tx + 31, cy = y - h - th - 16; ellipse(cx, cy, 15, 15, '#fff'); ctx.strokeStyle = '#333'; ctx.lineWidth = 2; ctx.stroke(); const d = new Date(), hh = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.283, mm = d.getMinutes() / 60 * 6.283; line('#222', 2.5, cx, cy, cx + Math.sin(hh) * 8, cy - Math.cos(hh) * 8); line('#222', 1.5, cx, cy, cx + Math.sin(mm) * 12, cy - Math.cos(mm) * 12); } // Uhr mit echter Zeit
  }
  if (up) { // Obergeschoss mit Restaurant
    const ux0 = x0 + 24, uw = w - 40; ctx.fillStyle = '#e4e6e8'; ctx.fillRect(ux0, y - h - 14 - up, uw, up);
    for (let i = 0; i < 5; i++) { shopWin(ux0 + 8 + i * (uw - 16) / 5, y - h - up - 4, (uw - 16) / 5 - 6, 34, '#4a4f56'); ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(['🍝', '☕', '🍰', '🥗', '🍕'][i], ux0 + 8 + (i + 0.5) * (uw - 16) / 5 - 3, y - h - up + 22); }
    ctx.fillStyle = '#d52b1e'; ctx.fillRect(ux0 - 4, y - h - 14 - up - 8, uw + 8, 9);
  }
  if (lv >= 8) { // grosse Leuchtreklame auf dem Dach
    const sy = y - h - 22 - up - 34, on = Math.sin(time * 2.5) > -0.7; line('#555', 3, x - 50, sy + 30, x - 50, y - h - 22 - up); line('#555', 3, x + 50, sy + 30, x + 50, y - h - 22 - up);
    ctx.fillStyle = on ? '#ffd23a' : '#c8a020'; rrect(x - 74, sy, 148, 30, 7); ctx.fill(); ctx.font = '800 17px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#d52b1e'; ctx.fillText($t`LADEN 🛒`, x, sy + 22);
  }
  ellipse(x - 2, y, w / 2 + 20, 11, 'rgba(0,0,0,.22)');
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, '#f4f4f0'); g.addColorStop(1, '#c9ccd0'); ctx.fillStyle = g; ctx.fillRect(x0, y - h, w, h);
  ctx.fillStyle = '#d52b1e'; ctx.fillRect(x0 - 6, y - h - 14, w + 12, 16); // Dachrand
  if (lv >= 5) for (let i = 0; i < 8; i++) { ctx.fillStyle = '#1f3a64'; ctx.beginPath(); const px = x0 + 6 + i * 30, py = y - h - 14 - (up ? up + 8 : 0); if (lv >= 8 && px > x - 80 && px < x + 60) continue; ctx.moveTo(px, py); ctx.lineTo(px + 26, py); ctx.lineTo(px + 22, py - 14); ctx.lineTo(px + 4, py - 14); ctx.fill(); line('rgba(150,190,240,.6)', 1, px + 13, py, px + 13, py - 14); } // Solarpanels
  // Glasfront mit Sprossen
  const gx = x0 + 16, gw = w - 32, gh = 58, gy = y - gh;
  shopWin(gx, gy, gw, gh, '#4a4f56');
  for (let px = gx + gw / 6; px < gx + gw - 2; px += gw / 6) line('#4a4f56', 2.5, px, gy, px, y);
  ctx.font = '14px system-ui'; ctx.textAlign = 'center'; ['🍎🥕', '🧀🥛', '🔧🪴', '🐄🚜', '🌳🌾'].forEach((e, i) => { if (i !== 2) ctx.fillText(e, gx + gw / 6 * (i + 0.5 + (i > 2 ? 1 : 0)), gy + 40); });
  const o = Math.max(0, Math.sin(time * 0.8)) * 12; // Schiebetür geht auf und zu
  ctx.fillStyle = '#2d3a46'; ctx.fillRect(x - 20, gy, 40, gh); shopWin(x - 20 - o, gy, 20, gh, '#4a4f56'); shopWin(x + o, gy, 20, gh, '#4a4f56');
  ctx.fillStyle = '#d52b1e'; rrect(x - 66, y - h + 8, 132, 22, 6); ctx.fill(); // Leuchtschrift
  ctx.font = '800 13px system-ui'; ctx.fillStyle = '#fff'; ctx.fillText($t`LADEN 🛒`, x, y - h + 24);
  for (let i = 0; i < 3; i++) shopCart(x - 150 + i * 7, y + 6);
  if (lv >= 5) { // Ladesäule fürs E-Auto
    const ex = x - 186; ctx.fillStyle = '#e8eef2'; rrect(ex - 7, y - 40, 14, 40, 3); ctx.fill(); ctx.fillStyle = '#3fb55a'; ctx.fillRect(ex - 4, y - 34, 8, 6); line('#2a2a2a', 2, ex + 7, y - 20, ex + 14, y - 10, ex + 12, y - 2);
  }
  flagPole(x0 + w - 14, y - h - 14 - (up ? up + 8 : 0), 44, 20, 4); // auf dem Dach
}
function markthalle(x, y, lv) { // Stufe 2–3: offene Holz-Markthalle (3: Leiterwagen mit Säcken)
  ellipse(x + 6, y, 104, 12, 'rgba(0,0,0,.22)');
  for (const px of [-92, -32, 28, 88]) { ctx.fillStyle = '#6b4423'; ctx.fillRect(x + px - 3, y - 84, 7, 84); } // Pfosten
  ctx.fillStyle = 'rgba(60,40,20,.25)'; ctx.fillRect(x - 92, y - 84, 184, 84); // Schatten unter dem Dach
  haendlerMann(x, y - 46);
  ctx.fillStyle = '#9b6a3a'; ctx.fillRect(x - 96, y - 32, 192, 32); ctx.fillStyle = '#7b5228'; ctx.fillRect(x - 96, y - 32, 192, 5); // Theke
  [['#d8332a', 10], ['#e0b54a', 10], ['#f5f5f0', 8], ['#7fbf4a', 9], ['#b5652a', 8]].forEach(([c, n], i) => crate(x - 74 + i * 36 + (i > 1 ? 12 : 0), y - 32, c, n));
  ctx.fillStyle = '#7a3b2a'; ctx.beginPath(); ctx.moveTo(x - 116, y - 80); ctx.lineTo(x, y - 128); ctx.lineTo(x + 116, y - 80); ctx.closePath(); ctx.fill(); // Satteldach
  ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (let i = 1; i < 6; i++) { ctx.beginPath(); ctx.moveTo(x - 116 + i * 19.3, y - 80 - i * 8); ctx.lineTo(x + 116 - i * 19.3, y - 80 - i * 8); ctx.stroke(); } // Ziegelreihen
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 118, y - 82, 236, 6);
  sign(x, y - 104, $t`MARKTHALLE 💰`);
  flagPole(x + 96, y - 84, 30, 16, 2);
  if (lv >= 3) { // Leiterwagen
    const wx = x + 140; ctx.fillStyle = '#9b6a3a'; ctx.fillRect(wx - 26, y - 22, 52, 10); wheel(wx - 16, y - 6, 8); wheel(wx + 16, y - 6, 8);
    for (let i = 0; i < 3; i++) ellipse(wx - 14 + i * 14, y - 28, 8, 7, '#e3d2a8'); line('#6b4423', 2.5, wx - 26, y - 16, wx - 44, y - 4);
  }
}
function grosshandel(x, y, lv) { // Stufe 4–5: Lagerhalle mit Rolltor, Büro mit Glasfront und Rampe (5: Gabelstapler fährt Paletten)
  const w = 240, h = 92, x0 = x - w / 2;
  // ab Stufe 6 wächst er hinter der Halle in die Höhe (Seiten: Laden, Strasse und Spediteur-Hof)
  if (lv >= 8) { // Windrad
    const wx = x0 + w - 46, wy = y - h - 150; line('#e8eef2', 5, wx, y - h, wx, wy); ellipse(wx, wy, 5, 5, '#d8dee2');
    for (let i = 0; i < 3; i++) { const a = time * 1.4 + i * 2.094; line('#f4f6f8', 4, wx, wy, wx + Math.cos(a) * 52, wy + Math.sin(a) * 52); }
  }
  if (lv >= 6) { // Hochregal-Lager: Turm mit bunten Paletten
    const th = lv >= 9 ? 150 : 96, tx = x0 + 14, tw = 84;
    ctx.fillStyle = '#c8d0d6'; ctx.fillRect(tx, y - h - th, tw, th);
    for (let r = 0; r < th / 14 - 1; r++) { line('#8a959e', 2, tx, y - h - th + 12 + r * 14, tx + tw, y - h - th + 12 + r * 14); for (let c = 0; c < 6; c++) if ((r * 7 + c * 3) % 5) { ctx.fillStyle = ['#d8332a', '#e0b54a', '#7fbf4a', '#3a6fd8'][(r + c) % 4]; ctx.fillRect(tx + 4 + c * 13, y - h - th + 3 + r * 14, 10, 8); } }
    if (lv >= 9) { // Leuchtschrift oben drauf
      const on = Math.sin(time * 3) > -0.6; ctx.fillStyle = on ? '#ff3a2a' : '#a8251c'; rrect(tx - 6, y - h - th - 26, tw + 12, 22, 5); ctx.fill();
      ctx.font = '800 15px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = on ? '#fff' : '#f2d0c8'; ctx.fillText('💰 💰 💰', tx + tw / 2, y - h - th - 10);
    }
  }
  if (lv >= 7) { // Büro-Etage aus Glas hinter dem Dach
    const ox = x0 + 112, ow = w - 140; ctx.fillStyle = '#e8ecef'; ctx.fillRect(ox, y - h - 60, ow, 60);
    for (let i = 0; i < 3; i++) shopWin(ox + 6 + i * (ow - 12) / 3, y - h - 54, (ow - 12) / 3 - 4, 26, '#4a4f56');
  }
  ellipse(x + 6, y, w / 2 + 14, 12, 'rgba(0,0,0,.22)');
  const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, '#9fb3c0'); g.addColorStop(1, '#6f8594'); ctx.fillStyle = g; ctx.fillRect(x0, y - h, w, h);
  for (let px = x0 + 4; px < x0 + w; px += 7) line('rgba(255,255,255,.18)', 1.5, px, y - h, px, y); // Wellblech
  ctx.fillStyle = '#3f5563'; ctx.beginPath(); ctx.moveTo(x0 - 8, y - h); ctx.lineTo(x0 + 20, y - h - 22); ctx.lineTo(x0 + w - 20, y - h - 22); ctx.lineTo(x0 + w + 8, y - h); ctx.fill(); // flaches Dach
  // Büro mit Glasfront links
  ctx.fillStyle = '#f4f4f0'; ctx.fillRect(x0 + 8, y - 70, 78, 70); shopWin(x0 + 14, y - 64, 66, 26, '#4a4f56'); shopWin(x0 + 14, y - 32, 30, 32, '#4a4f56');
  haendlerMann(x0 + 62, y - 26); ctx.fillStyle = '#d0c4a8'; ctx.fillRect(x0 + 46, y - 14, 34, 14); // am Schalter
  // Rolltor und Rampe
  const rx = x0 + 120; ctx.fillStyle = '#2f3b44'; ctx.fillRect(rx - 4, y - 68, 76, 68);
  const op = 38 + Math.sin(time * 0.6) * 10; ctx.fillStyle = '#c9ced2'; ctx.fillRect(rx, y - 64, 68, 64 - op);
  for (let py = y - 64 + 5; py < y - op; py += 5) line('#9aa1a7', 1, rx, py, rx + 68, py);
  ctx.fillStyle = '#5d4630'; for (let i = 0; i < 2; i++) { ctx.fillRect(rx + 8 + i * 30, y - 8, 24, 4); crate(rx + 20 + i * 30, y - 8, ['#d8332a', '#e0b54a'][i], 9); } // Paletten im Tor
  ctx.fillStyle = '#ffd23a'; ctx.fillRect(rx - 4, y - 6, 76, 6); for (let i = 0; i < 8; i++) { ctx.fillStyle = '#2a2a2a'; ctx.fillRect(rx - 2 + i * 10, y - 6, 5, 6); } // Rampenkante
  ctx.fillStyle = '#d52b1e'; rrect(x - 70, y - h + 4, 140, 20, 5); ctx.fill();
  ctx.font = '800 12px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText($t`GROSSHANDEL 💰`, x, y - h + 18);
  if (lv >= 5) { // Gabelstapler pendelt vor der Halle
    const fx = x0 + 100 + (Math.sin(time * 0.5) * 0.5 + 0.5) * 120, up = Math.max(0, Math.sin(time * 1.0)) * 10;
    ctx.fillStyle = '#f2a51a'; ctx.fillRect(fx - 16, y - 2 - 16, 26, 16); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(fx - 12, y - 30, 2, 14); ctx.fillRect(fx + 4, y - 30, 2, 14); ctx.fillRect(fx - 12, y - 30, 18, 2);
    line('#555', 3, fx + 12, y - 2, fx + 12, y - 34); ctx.fillStyle = '#5d4630'; ctx.fillRect(fx + 12, y - 6 - up, 22, 3); crate(fx + 23, y - 6 - up, '#7fbf4a', 9);
    wheel(fx - 10, y + 2, 5); wheel(fx + 6, y + 2, 5);
  }
  flagPole(x0 + w - 24, y - h - 22, 40, 20, 2); // auf dem Dach
}
function speicher(x, y) { // Kornspeicher auf Stelzen mit Steinplatten gegen Mäuse
  ellipse(x + 4, y, 30, 7, 'rgba(0,0,0,.22)');
  for (const px of [-18, 14]) { ctx.fillStyle = '#6b4423'; ctx.fillRect(x + px, y - 16, 5, 16); ellipse(x + px + 2.5, y - 16, 6, 2.5, '#9a958c'); }
  alpHouse(x, y - 16, 48, 0, 34, 20); shutterWin(x - 6, y - 42, 12, 10);
}
function kapelle(x, y) {
  ellipse(x + 4, y, 34, 8, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#f4efe4'; ctx.fillRect(x - 24, y - 50, 48, 50);
  ctx.fillStyle = '#7a3b2a'; ctx.beginPath(); ctx.moveTo(x - 30, y - 48); ctx.lineTo(x, y - 78); ctx.lineTo(x + 30, y - 48); ctx.fill();
  ctx.fillStyle = '#f4efe4'; ctx.fillRect(x - 8, y - 100, 16, 30); // Turm
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 4, y - 96, 8, 9);
  ctx.fillStyle = '#7a3b2a'; ctx.beginPath(); ctx.moveTo(x - 11, y - 100); ctx.lineTo(x, y - 128); ctx.lineTo(x + 11, y - 100); ctx.fill();
  line('#e8c35a', 2, x, y - 128, x, y - 140); line('#e8c35a', 2, x - 5, y - 135, x + 5, y - 135);
  ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.moveTo(x - 8, y); ctx.lineTo(x - 8, y - 20); ctx.arc(x, y - 20, 8, Math.PI, 0); ctx.lineTo(x + 8, y); ctx.fill();
  ellipse(x, y - 38, 5, 5, '#bfe0f5');
}
function guelle(x, y) { // Güllegrube (runder Betontank) mit Güllefass, das zum Acker fährt
  ellipse(x, y, 44, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#a8a39a'; ctx.fillRect(x - 36, y - 30, 72, 30); ellipse(x, y - 30, 36, 9, '#5e4128'); ellipse(x, y, 36, 9, '#a8a39a');
  if (guelleOn()) for (let i = 0; i < 3; i++) { const k = (time * 0.5 + i / 3) % 1; ellipse(x - 10 + i * 10, y - 34 - k * 26, 3 + k * 4, 2 + k * 3, `rgba(150,120,60,${0.4 * (1 - k)})`); } // es duftet 😄
  const fx = x - 66; // Güllefass auf Rädern
  ctx.fillStyle = '#2f6a3a'; ctx.beginPath(); ctx.ellipse(fx, y - 18, 20, 11, 0, 0, 7); ctx.fill(); wheel(fx - 8, y - 4, 6); wheel(fx + 8, y - 4, 6);
  line('#555', 2, fx - 20, y - 12, fx - 28, y - 6);
}
function kirche(x, y) { // Dorfkirche mit Turmuhr und Spitzhelm (Kauf ab Land-Stufe 20)
  ellipse(x + 6, y, 62, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#f4efe4'; ctx.fillRect(x - 22, y - 62, 76, 62); // Schiff
  ctx.fillStyle = '#7a3b2a'; ctx.beginPath(); ctx.moveTo(x - 28, y - 60); ctx.lineTo(x + 16, y - 96); ctx.lineTo(x + 60, y - 60); ctx.fill();
  for (const wx of [x + 8, x + 34]) { ctx.fillStyle = '#bfe0f5'; ctx.beginPath(); ctx.moveTo(wx - 5, y - 18); ctx.lineTo(wx - 5, y - 42); ctx.arc(wx, y - 42, 5, Math.PI, 0); ctx.lineTo(wx + 5, y - 18); ctx.fill(); }
  ctx.fillStyle = '#ebe4d6'; ctx.fillRect(x - 44, y - 140, 30, 140); // Turm
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 36, y - 132, 14, 14); // Glockenstube
  ctx.save(); ctx.translate(x - 29, y - 132); ctx.rotate(Math.sin(time * 1.8) * 0.3); ctx.fillStyle = '#d9a83a'; ctx.beginPath(); ctx.moveTo(-5, 11); ctx.lineTo(5, 11); ctx.lineTo(3, 2); ctx.lineTo(-3, 2); ctx.fill(); ctx.restore();
  ellipse(x - 29, y - 100, 10, 10, '#fff'); ctx.strokeStyle = '#2a2a2a'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x - 29, y - 100, 10, 0, 7); ctx.stroke(); // Turmuhr
  const h = new Date(), a = (h.getHours() % 12 + h.getMinutes() / 60) / 6 * Math.PI, m = h.getMinutes() / 30 * Math.PI;
  line('#2a2a2a', 2, x - 29, y - 100, x - 29 + Math.sin(a) * 5, y - 100 - Math.cos(a) * 5); line('#2a2a2a', 1.5, x - 29, y - 100, x - 29 + Math.sin(m) * 8, y - 100 - Math.cos(m) * 8);
  ctx.fillStyle = '#4f6f5a'; ctx.beginPath(); ctx.moveTo(x - 48, y - 140); ctx.lineTo(x - 29, y - 196); ctx.lineTo(x - 10, y - 140); ctx.fill(); // Spitzhelm
  line('#e8c35a', 2, x - 29, y - 196, x - 29, y - 212); line('#e8c35a', 2, x - 35, y - 206, x - 23, y - 206);
  ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.moveTo(x - 38, y); ctx.lineTo(x - 38, y - 22); ctx.arc(x - 29, y - 22, 9, Math.PI, 0); ctx.lineTo(x - 20, y); ctx.fill();
}
// ---- Thematische Gebäude: man sieht, was drin passiert – und jedes hat einen kleinen Witz ----
const bname = t => THINGS[t.type].name.toUpperCase() + ' ' + THINGS[t.type].icon;
const phase = t => t.ang || 0; // läuft nur, solange das Gebäude arbeitet
function puffs(x, y, on, c = '235,235,235', big = 1) { // Rauch/Dampf
  if (on) for (let i = 0; i < 4; i++) { const k = (time * 0.5 + i / 4) % 1; ellipse(x + Math.sin(k * 5 + i) * 4 + k * 12, y - k * 44 * big, (4 + k * 9) * big, (3 + k * 7) * big, `rgba(${c},${0.75 * (1 - k)})`); }
}
function chimney(x, y, h, on, c, big) { ctx.fillStyle = '#7d4632'; ctx.fillRect(x - 6, y - h, 12, h); ctx.fillStyle = '#5a3020'; ctx.fillRect(x - 8, y - h, 16, 4); puffs(x, y - h, on, c, big); }
function person(x, y, shirt, hat, arm = -0.6) { // Männli, Füsse bei y, schaut nach rechts; arm = Winkel (0 = waagrecht)
  line('#3a3a4a', 3, x - 2, y, x - 2, y - 9); line('#3a3a4a', 3, x + 2, y, x + 2, y - 9);
  ctx.fillStyle = shirt; rrect(x - 5, y - 21, 10, 13, 3); ctx.fill();
  line('#f1c9a5', 2.5, x + 3, y - 18, x + 3 + Math.cos(arm) * 9, y - 18 - Math.sin(arm) * 9);
  ellipse(x, y - 25, 5, 5, '#f1c9a5'); ellipse(x + 2, y - 26, 0.9, 0.9, '#222');
  if (hat === 'chef') { ctx.fillStyle = '#fff'; ctx.fillRect(x - 4, y - 33, 8, 5); ellipse(x, y - 34, 6, 4, '#fff'); }
  else if (hat) { ctx.fillStyle = hat; ctx.beginPath(); ctx.arc(x, y - 27, 5.5, Math.PI, 0); ctx.fill(); }
}
const hand = (x, y, arm) => [x + 3 + Math.cos(arm) * 9, y - 18 - Math.sin(arm) * 9];
function swirl(x, y, r, c1, c2) { ellipse(x, y, r, r, c1); ctx.strokeStyle = c2; ctx.lineWidth = Math.max(1, r / 6); ctx.beginPath(); for (let a = 0; a < 13; a += 0.3) { const rr = r * 0.9 * (1 - a / 13); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.stroke(); }
function barrel(x, y, r = 12, h = 26, c = '#9a6236') { ctx.fillStyle = c; rrect(x - r, y - h, r * 2, h, r * 0.5); ctx.fill(); for (const k of [0.25, 0.75]) line('#4a4a4a', 2, x - r + 1, y - h * k, x + r - 1, y - h * k); }
function fish(x, y, s, c) { ellipse(x, y, 10 * s, 4.5 * s, c); ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x - 8 * s, y); ctx.lineTo(x - 15 * s, y - 5 * s); ctx.lineTo(x - 15 * s, y + 5 * s); ctx.fill(); ellipse(x + 6 * s, y - s, 1.2 * s, 1.2 * s, '#222'); }
function pet(x, y, c, dog) { // sitzt und wartet auf Reste, der Schwanz wedelt
  const w = Math.sin(time * (dog ? 9 : 2.5) + x) * 4;
  ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 5, y - 3); ctx.quadraticCurveTo(x - 15, y - 5, x - 13 + w, y - 15); ctx.stroke();
  ellipse(x, y - 8, 7, 8, c); ellipse(x + 3, y - 19, 5.5, 5, c);
  ctx.fillStyle = dog ? shade(c, 0.7) : c; ctx.beginPath();
  if (dog) ctx.ellipse(x - 1, y - 17, 2.5, 5, 0.3, 0, 7);
  else { ctx.moveTo(x - 2, y - 22); ctx.lineTo(x - 1, y - 28); ctx.lineTo(x + 3, y - 23); ctx.moveTo(x + 4, y - 23); ctx.lineTo(x + 7, y - 28); ctx.lineTo(x + 8, y - 21); }
  ctx.fill(); ellipse(x + 5, y - 20, 1, 1, '#222'); ellipse(x + 8.5, y - 18, 1.3, 1, '#222');
  if (dog) ellipse(x + 7, y - 14 + Math.abs(w) * 0.2, 1.6, 2.6, '#e0808e'); // Zunge
}
function gull(x, y) { // Möwe auf dem Dach, schaut sich um
  const b = Math.max(0, Math.sin(time * 1.7 + x)) * 2;
  ellipse(x, y - 6, 8, 5, '#f4f4f4'); ellipse(x - 2, y - 7, 6, 3, '#9aa3ab'); ellipse(x + 6, y - 11 - b, 4, 4, '#f4f4f4');
  ctx.fillStyle = '#f2b01e'; ctx.beginPath(); ctx.moveTo(x + 9, y - 12 - b); ctx.lineTo(x + 15, y - 10 - b); ctx.lineTo(x + 9, y - 9 - b); ctx.fill();
  ellipse(x + 7, y - 12 - b, 0.9, 0.9, '#222'); line('#f2b01e', 1.2, x - 1, y - 2, x - 1, y); line('#f2b01e', 1.2, x + 2, y - 2, x + 2, y);
}
function mouse(x, y, dir, crumb) {
  line('#9a958c', 1, x - 6 * dir, y - 3, x - 13 * dir, y - 6); ellipse(x, y - 4, 6, 4, '#9a958c'); ellipse(x + 5 * dir, y - 6, 3.5, 3, '#9a958c');
  ellipse(x + 3 * dir, y - 9, 2.2, 2.2, '#d8a8a8'); ellipse(x + 7 * dir, y - 7, 0.9, 0.9, '#222');
  if (crumb) ellipse(x + 9 * dir, y - 4, 2.6, 2, crumb);
}
function hangSign(x, y, draw) { // Wirtshausschild am Eisenarm, schaukelt im Wind
  line('#2a2a2a', 2.5, x, y, x + 26, y);
  ctx.save(); ctx.translate(x + 16, y); ctx.rotate(Math.sin(time * 1.3 + x) * 0.12); line('#2a2a2a', 1, -6, 0, -6, 7); line('#2a2a2a', 1, 6, 0, 6, 7); draw(0, 16); ctx.restore();
}
function pretzel(x, y) {
  ctx.strokeStyle = '#a0602a'; ctx.lineWidth = 3.5;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * 5, y - 2, 6, 0, 7); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(x - 9, y + 7); ctx.quadraticCurveTo(x, y - 8, x + 9, y + 7); ctx.stroke();
}
function zopf(x, y, w) { for (let i = 0; i < 7; i++) { const k = i / 6, r = 10 - Math.abs(k - 0.5) * 8; ctx.save(); ctx.translate(x - w / 2 + k * w, y); ctx.rotate(i % 2 ? 0.6 : -0.6); ellipse(0, 0, r * 1.3, r, i % 2 ? '#c8822f' : '#d9953a'); ellipse(-r * 0.3, -r * 0.4, r * 0.5, r * 0.25, 'rgba(255,240,200,.55)'); ctx.restore(); } }
function meringue(x, y, r) {
  ellipse(x, y, r, r * 0.55, '#f6efe4'); ellipse(x, y - r * 0.45, r * 0.7, r * 0.45, '#fffaf2');
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - r * 0.4, y - r * 0.6); ctx.quadraticCurveTo(x, y - r * 1.1, x + r * 0.3, y - r * 1.45); ctx.lineTo(x + r * 0.4, y - r * 0.6); ctx.fill();
}
function cookie(x, y, r) { ellipse(x, y, r, r * 0.9, '#c98e48'); ellipse(x - r * 0.15, y - r * 0.15, r * 0.8, r * 0.7, '#dfa860'); for (const [cx, cy] of [[-0.4, -0.3], [0.3, -0.4], [0.1, 0.2], [-0.3, 0.4], [0.5, 0.2], [-0.6, 0.05]]) ellipse(x + cx * r, y + cy * r, r * 0.12, r * 0.1, '#4a2a1a'); }
function cupcake(x, y) { // Boden bei y
  ctx.fillStyle = '#f28aa8'; ctx.beginPath(); ctx.moveTo(x - 13, y - 17); ctx.lineTo(x + 13, y - 17); ctx.lineTo(x + 10, y); ctx.lineTo(x - 10, y); ctx.fill();
  for (let i = -2; i <= 2; i++) line('rgba(255,255,255,.5)', 1.5, x + i * 4.5, y - 16, x + i * 3.6, y - 1);
  ellipse(x, y - 19, 15, 6, '#6b3a20'); ellipse(x, y - 25, 11, 5, '#7d4a2a'); ellipse(x, y - 30, 7, 4, '#8a5530'); ellipse(x + 1, y - 36, 4, 4, '#d8232a');
  ['#ffe066', '#7fd0f0', '#fff', '#a6e070', '#f5a3c7'].forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(x - 10 + i * 5, y - 23 - (i % 2) * 5, 3, 1.6); });
}
function flames(x, y, n, w) { for (let i = 0; i < n; i++) ellipse(x + (i - (n - 1) / 2) * w, y - 5 - Math.abs(Math.sin(time * 9 + i)) * 3, 3.5, 6 + Math.sin(time * 11 + i * 2) * 2, i % 2 ? '#ffb02e' : '#e8501e'); }
function tiles(x0, y0, w, h, c, s = 8) { ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.beginPath(); for (let xx = x0 + s; xx < x0 + w; xx += s) { ctx.moveTo(xx, y0); ctx.lineTo(xx, y0 + h); } for (let yy = y0 + s; yy < y0 + h; yy += s) { ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); } ctx.stroke(); }
function bricks(x0, y0, w, h) { ctx.strokeStyle = 'rgba(255,235,220,.3)'; ctx.lineWidth = 1; ctx.beginPath(); for (let r = 0, yy = y0 + 6; yy < y0 + h; yy += 6, r++) { ctx.moveTo(x0, yy); ctx.lineTo(x0 + w, yy); for (let xx = x0 + (r % 2) * 6; xx < x0 + w; xx += 12) { ctx.moveTo(xx, yy - 6); ctx.lineTo(xx, yy); } } ctx.stroke(); }

// Weinberg-Kette
DRAW.kelterei = (x, y, t) => { // Trauben werden im Bottich gestampft – früher wirklich barfuss!
  const a = phase(t), hop = Math.abs(Math.sin(a * 2)) * 6;
  house(x - 24, y, 78, 56, '#efe3c8', '#7a3b2a', 26); win(x - 54, y - 42, 18, 16, t.working); door(x - 14, y, 18, 30);
  person(x + 42, y - 18 - hop, '#6b2d6e', '#e8c35a', 1 + Math.sin(a * 4) * 0.7);
  barrel(x + 42, y, 20, 24); ellipse(x + 42, y - 24, 17, 4, '#6b2d6e');
  if (t.working) for (let i = 0; i < 4; i++) ellipse(x + 28 + i * 9, y - 28 - Math.abs(Math.sin(a * 2 + i)) * 10, 2, 2, '#8a3d8e'); // Spritzer
  line('#7d7468', 3, x + 62, y - 8, x + 70, y - 8); if (t.working) line('rgba(120,40,120,.9)', 2, x + 69, y - 8, x + 69, y + 3);
  sign(x - 16, y - 62, bname(t));
};
DRAW.doerrhaus = (x, y, t) => { // Trauben schrumpeln an der Sonne zu Rosinen
  house(x - 36, y, 64, 50, '#d9b98a', '#8a5a3a', 24); door(x - 36, y, 16, 28);
  line('#6b4423', 3, x + 8, y, x + 8, y - 44); line('#6b4423', 3, x + 72, y, x + 72, y - 44);
  for (let r = 0; r < 3; r++) { const ry = y - 12 - r * 14; ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x + 8, ry, 64, 3); for (let i = 0; i < 8; i++) ellipse(x + 14 + i * 7.5, ry - 2, 3 - r * 0.3, 2.4 - r * 0.3, r ? '#5a3a2a' : '#7a3d7e'); }
  const sx = x + 44, sy = y - 92 + Math.sin(time) * 2; // die Sonne macht hier Ferien 😎
  ctx.strokeStyle = '#f5b81e'; ctx.lineWidth = 3; ctx.beginPath();
  for (let i = 0; i < 10; i++) { const w = i / 10 * Math.PI * 2 + time * 0.4; ctx.moveTo(sx + Math.cos(w) * 17, sy + Math.sin(w) * 17); ctx.lineTo(sx + Math.cos(w) * 24, sy + Math.sin(w) * 24); }
  ctx.stroke(); ellipse(sx, sy, 14, 14, '#ffd23f');
  ctx.fillStyle = '#222'; rrect(sx - 11, sy - 5, 9, 6, 2); ctx.fill(); rrect(sx + 2, sy - 5, 9, 6, 2); ctx.fill(); line('#222', 1.5, sx - 2, sy - 3, sx + 2, sy - 3);
  ctx.strokeStyle = '#a0521e'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(sx, sy + 2, 6, 0.3, Math.PI - 0.3); ctx.stroke();
  sign(x - 22, y - 60, bname(t));
};
DRAW.schneckenbeck = (x, y, t) => {
  house(x, y, 112, 60, '#f3e2c0', '#a0603a', 28); win(x - 46, y - 44, 30, 22, t.working); door(x + 22, y, 18, 32);
  chimney(x + 38, y - 70, 24, t.working);
  swirl(x - 12, y - 100, 16, '#e3a85a', '#9a5a22'); for (const [rx, ry] of [[-6, -4], [5, 3], [2, -9], [-9, 6]]) ellipse(x - 12 + rx, y - 100 + ry, 1.8, 1.5, '#4a2a1a'); // Riesen-Rosinenschnecke
  const k = (time * 0.015 + t.id * 0.37) % 1, sx = x - 50 + k * 100, sy = y - 4; // und eine echte Schnecke kriecht ganz langsam vorbei
  ellipse(sx + 2, sy, 9, 2.5, '#c9b28a'); swirl(sx - 1, sy - 6, 5.5, '#c98a4a', '#7a4a20');
  line('#c9b28a', 1, sx + 9, sy - 1, sx + 12, sy - 8); line('#c9b28a', 1, sx + 7, sy - 1, sx + 8, sy - 8);
  sign(x, y - 66, bname(t));
};
// Fischteich-Kette
DRAW.filetiererei = (x, y, t) => {
  house(x - 10, y, 104, 58, '#f2f6f8', '#4f7fa0', 24); tiles(x - 62, y - 58, 104, 58, 'rgba(80,120,150,.18)');
  ctx.fillStyle = '#3a8fc4'; ctx.fillRect(x - 62, y - 24, 104, 5);
  win(x - 52, y - 48, 22, 18, t.working); door(x + 4, y, 18, 30, '#4f7fa0');
  fish(x - 6, y - 94 + Math.sin(time * 2) * 2, 2, '#5a8fb8');
  pet(x + 58, y + 2, '#e08a3a'); // die Katze wartet auf Reste
  sign(x - 10, y - 64, bname(t));
};
DRAW.raeucherei = (x, y, t) => {
  house(x - 14, y, 92, 58, '#5f3a1e', '#3a2a1f', 28);
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.beginPath(); for (let xx = x - 52; xx < x + 32; xx += 8) { ctx.moveTo(xx, y - 58); ctx.lineTo(xx, y); } ctx.stroke(); // Bretter
  win(x - 50, y - 44, 22, 18, t.working); door(x + 10, y, 16, 28, '#2a1a0e');
  chimney(x - 36, y - 72, 22, t.working, '120,115,110', 1.6);
  line('#6b4423', 3, x + 40, y, x + 40, y - 50); line('#6b4423', 3, x + 72, y, x + 72, y - 50); line('#6b4423', 3, x + 38, y - 48, x + 74, y - 48);
  for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(x + 48 + i * 10, y - 48); ctx.rotate(Math.PI / 2 + Math.sin(time * 1.5 + i) * 0.15); line('#ccc', 1, 0, 0, 5, 0); fish(20, 0, 0.9, '#c8893a'); ctx.restore(); } // Fische hängen am Gestell
  gull(x - 4, y - 84); // die Möwe hat's auch gerochen
  sign(x - 14, y - 64, bname(t));
};
DRAW.seebeiz = (x, y, t) => {
  house(x - 24, y, 92, 58, '#f4efe4', '#2f6a8f', 26); win(x - 60, y - 44, 20, 16, t.working); door(x - 22, y, 18, 30, '#2f6a8f');
  ctx.lineWidth = 5; for (let i = 0; i < 8; i++) { ctx.strokeStyle = i % 2 ? '#fff' : '#e8303a'; ctx.beginPath(); ctx.arc(x + 4, y - 38, 8, i * Math.PI / 4, (i + 1) * Math.PI / 4); ctx.stroke(); } // Rettungsring
  ctx.fillStyle = '#a07a4a'; ctx.fillRect(x + 24, y - 6, 50, 6); // Terrasse
  ctx.fillStyle = '#6b4423'; ctx.fillRect(x + 38, y - 22, 26, 3); line('#6b4423', 2, x + 42, y - 20, x + 42, y - 6); line('#6b4423', 2, x + 60, y - 20, x + 60, y - 6);
  ellipse(x + 46, y - 24, 6, 2, '#fff'); ellipse(x + 46, y - 26, 4, 2, '#e0a840'); // Fischknusperli
  line('#6b4423', 2, x + 51, y - 22, x + 51, y - 52);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#fff' : '#3a8fc4'; ctx.beginPath(); ctx.moveTo(x + 51, y - 48); ctx.arc(x + 51, y - 48, 24, Math.PI + i * Math.PI / 6, Math.PI + (i + 1) * Math.PI / 6); ctx.fill(); }
  gull(x - 24, y - 84);
  sign(x - 16, y - 64, bname(t));
};
// Tierhof-Kette
DRAW.metzgerei = (x, y, t) => {
  house(x - 10, y, 104, 60, '#f4efe4', '#8a2a22', 28);
  ctx.fillStyle = '#5b3a1e'; ctx.fillRect(x - 58, y - 50, 50, 34); ctx.fillStyle = '#cfe8f5'; ctx.fillRect(x - 56, y - 48, 46, 30); // Schaufenster
  for (const dy of [0, 12]) for (let i = 0; i < 6; i++) { const k = i / 5; ellipse(x - 52 + k * 38, y - 44 + dy + Math.sin(k * Math.PI) * 6, 4, 3, dy ? '#d07a5a' : '#b8483a'); } // Wurstgirlanden
  awning(x - 33, y - 58, 56, '#d52b1e', '#fff', 6); door(x + 18, y, 18, 32, '#8a2a22');
  hangSign(x + 42, y - 50, (cx, cy) => { ellipse(cx, cy, 13, 5, '#b8483a'); ellipse(cx - 3, cy - 2, 6, 1.5, 'rgba(255,255,255,.35)'); line('#e8c35a', 1.5, cx - 13, cy, cx - 16, cy - 3); line('#e8c35a', 1.5, cx + 13, cy, cx + 16, cy - 3); });
  pet(x + 62, y + 4, '#c8a06a', true); // der Hund hofft auf ein Wurstzipfeli
  sign(x - 10, y - 66, bname(t));
};
DRAW.zopfbeck = (x, y, t) => {
  house(x, y, 108, 60, '#f6e7c8', '#9a5a2a', 28); win(x - 46, y - 44, 26, 20, t.working); door(x + 20, y, 18, 32);
  chimney(x + 38, y - 70, 22, t.working); zopf(x - 8, y - 98, 64);
  person(x + 20, y, '#fff', 'chef', 1.2 + Math.sin(time * 5) * 0.5); // der Beck winkt
  sign(x, y - 66, bname(t));
};
DRAW.meringuerie = (x, y, t) => { // Dach aus Meringues, und die Wolken aus dem Kamin sind auch welche
  house(x, y, 104, 58, '#f8d8e4', '#e8a0b8', 8);
  for (let i = 0; i < 7; i++) meringue(x - 48 + i * 16, y - 62, 10); meringue(x, y - 78, 16);
  puffs(x + 8, y - 100, t.working, '255,255,255', 1.2);
  win(x - 40, y - 42, 20, 16, t.working); win(x + 20, y - 42, 20, 16, t.working); door(x - 2, y, 18, 30, '#c0708a');
  sign(x, y - 112, bname(t));
};
DRAW.cordonbleu_beiz = (x, y, t) => {
  const top = alpHouse(x - 16, y, 92, 18, 42, 28);
  for (const wx of [-52, 8]) { shutterWin(x + wx, top + 8); flowers(x + wx - 4, x + wx + 22, top + 28); }
  door(x - 16, y, 16, 24, '#5b3a1e');
  hangSign(x + 30, top + 12, (cx, cy) => { ellipse(cx, cy, 13, 8, '#d99a3a'); for (let i = 0; i < 6; i++) ellipse(cx - 9 + i * 3.5, cy - 3 + (i % 2) * 4, 1, 1, '#a8682a'); ctx.fillStyle = '#f5cf4a'; ctx.beginPath(); ctx.moveTo(cx + 2, cy + 6); ctx.quadraticCurveTo(cx + 4, cy + 14, cx + 6, cy + 6); ctx.fill(); }); // Käse läuft raus!
  const a = phase(t), up = t.working ? Math.abs(Math.sin(a * 1.6)) * 22 : 0, [hx, hy] = hand(x + 56, y, 0.25);
  person(x + 56, y, '#fff', 'chef', 0.25); line('#333', 2.5, hx, hy, hx + 8, hy); ellipse(hx + 13, hy, 7, 2.5, '#333'); // Pfanne
  if (t.working) flames(hx + 13, hy + 2, 3, 4);
  ctx.save(); ctx.translate(hx + 13, hy - 5 - up); ctx.rotate(up / 8); ellipse(0, 0, 6, 3, '#d99a3a'); ctx.restore(); // Cordon bleu fliegt
  sign(x - 16, top - 10, bname(t));
};
// Import-Ketten
DRAW.kakaoroesterei = (x, y, t) => {
  house(x - 26, y, 88, 60, '#b5523a', '#4a3a30', 26); bricks(x - 70, y - 60, 88, 60);
  win(x - 60, y - 46, 20, 16, t.working); door(x - 18, y, 18, 30); chimney(x - 50, y - 74, 20, t.working, '120,80,50');
  const a = phase(t);
  line('#555', 3, x + 32, y, x + 32, y - 32); line('#555', 3, x + 66, y, x + 66, y - 32);
  if (t.working) flames(x + 49, y - 2, 4, 7);
  ctx.fillStyle = '#6a6a6a'; rrect(x + 28, y - 48, 42, 26, 12); ctx.fill(); // Röst-Trommel, dreht sich
  ctx.save(); rrect(x + 28, y - 48, 42, 26, 12); ctx.clip(); for (let i = 0; i < 4; i++) { const k = (a * 0.4 + i / 4) % 1; line('#454545', 2.5, x + 28 + k * 42, y - 48, x + 28 + k * 42, y - 22); } ctx.restore();
  ellipse(x + 40, y - 42, 8, 2, 'rgba(255,255,255,.3)');
  sack(x + 68, y + 6);
  sign(x - 20, y - 66, bname(t));
};
DRAW.schoggifabrik = (x, y, t) => {
  ellipse(x + 4, y, 78, 11, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#efe3c8'; ctx.fillRect(x - 70, y - 60, 104, 60);
  for (let i = 0; i < 4; i++) win(x - 62 + i * 24, y - 50, 16, 14, t.working); door(x - 18, y, 20, 28, '#5a3220');
  ctx.fillStyle = '#b5523a'; ctx.fillRect(x - 64, y - 128, 14, 50); ctx.fillStyle = '#8a3a28'; ctx.fillRect(x - 66, y - 128, 18, 5); puffs(x - 57, y - 128, t.working, '200,170,150');
  ctx.save(); ctx.beginPath(); ctx.rect(x - 76, y - 82, 116, 24); ctx.arc(x + 40, y - 82, 11, 0, 7); ctx.clip('evenodd'); // Dach = Schoggitafel, angebissen 😋
  ctx.fillStyle = '#5a3220'; ctx.fillRect(x - 76, y - 82, 116, 24);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = '#6e3e26'; ctx.fillRect(x - 73 + i * 19, y - 79 + j * 11, 15, 8); }
  ctx.restore();
  ctx.fillStyle = '#c3ccd4'; rrect(x + 38, y - 66, 26, 34, 6); ctx.fill(); line('#7f8a95', 2, x + 40, y - 56, x + 62, y - 56); // Kessel
  line('#7f8a95', 4, x + 60, y - 40, x + 70, y - 40);
  if (t.working) { ctx.fillStyle = '#6b3a20'; ctx.fillRect(x + 67, y - 40, 6, 38); for (let i = 0; i < 3; i++) ellipse(x + 70, y - 40 + ((time * 1.5 + i / 3) % 1) * 38, 1.5, 4, '#8a5030'); } // Schoggi-Wasserfall
  ellipse(x + 66, y - 1, 14, 4, '#5a3220');
  sign(x - 18, y - 94, bname(t));
};
DRAW.schoggikonditorei = (x, y, t) => {
  house(x, y, 104, 60, '#fbe3ea', '#6b3a20', 26);
  ctx.fillStyle = '#6b3a20'; for (let i = 0; i < 9; i++) { ctx.beginPath(); ctx.ellipse(x - 48 + i * 12, y - 58, 4, 5 + (i % 3) * 3, 0, 0, 7); ctx.fill(); } // Glasur tropft über die Fassade
  win(x - 40, y - 40, 24, 18, t.working); door(x + 22, y, 18, 30, '#6b3a20');
  cupcake(x - 4, y - 84);
  sign(x, y - 66, bname(t));
};
DRAW.kaffeeroesterei = (x, y, t) => {
  house(x - 18, y, 92, 60, '#e8dcc4', '#3e2a1e', 26); win(x - 54, y - 46, 20, 16, t.working); door(x - 6, y, 18, 30);
  chimney(x + 14, y - 72, 20, t.working, '150,120,100');
  ctx.save(); ctx.translate(x - 26, y - 100); ctx.rotate(0.4 + Math.sin(time) * 0.06); ellipse(0, 0, 16, 11, '#5a3220'); ellipse(-4, -4, 7, 3, 'rgba(255,255,255,.18)');
  ctx.strokeStyle = '#2e180c'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-13, 0); ctx.bezierCurveTo(-4, -6, 4, 6, 13, 0); ctx.stroke(); ctx.restore(); // Riesen-Kaffeebohne
  const j = t.working ? Math.sin(time * 47) * 1.5 : 0, px = x + 50 + j, [hx, hy] = hand(px, y, 0.5); // der Kaffee-Prober zittert: zu viel probiert!
  person(px, y, '#8a5530', null, 0.5);
  if (t.working) for (const d of [-3, 0, 3]) line('#3a2412', 1.5, px + d, y - 30, px + d * 1.6, y - 36);
  ctx.fillStyle = '#fff'; ctx.fillRect(hx - 2, hy - 5, 6, 5); puffs(hx + 1, hy - 5, true, '255,255,255', 0.3);
  sack(x + 70, y + 6);
  sign(x - 18, y - 66, bname(t));
};
DRAW.kafistube = (x, y, t) => {
  house(x - 22, y, 92, 58, '#f3e2c0', '#7a3b2a', 26); win(x - 58, y - 44, 20, 16, t.working); win(x - 8, y - 44, 20, 16, t.working); door(x - 24, y, 16, 28);
  const cx = x - 22, cy = y - 96; // Riesen-Tasse auf dem Dach
  ellipse(cx, cy + 6, 20, 4, '#e8e8e8'); ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx + 14, cy - 6, 6, -1.3, 1.3); ctx.stroke();
  ctx.fillStyle = '#fff'; rrect(cx - 14, cy - 16, 28, 21, 6); ctx.fill(); ellipse(cx, cy - 15, 13, 3, '#6b3a20'); puffs(cx, cy - 18, true, '255,255,255', 0.7);
  ctx.fillStyle = '#6b4423'; ctx.fillRect(x + 36, y - 18, 22, 3); line('#6b4423', 2, x + 47, y - 16, x + 47, y); // Tischli
  ellipse(x + 42, y - 20, 3, 2, '#fff'); ellipse(x + 53, y - 20, 3, 2, '#fff');
  person(x + 30, y, '#3d7a3a', '#c0552f', 0.1);
  ctx.save(); ctx.translate(x + 64, 0); ctx.scale(-1, 1); person(0, y, '#d8332a', '#e8c35a', 0.1); ctx.restore();
  ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText(['💬', '😂', '☕'][Math.floor(time / 2 + t.id) % 3], x + 47, y - 42); // Schwatz
  sign(x - 16, y - 64, bname(t));
};
// Milch, Äpfel, Pizza, Pasta, Torte
DRAW.zentrifuge = (x, y, t) => {
  house(x - 34, y, 74, 54, '#f4f4ef', '#7d8a96', 22); win(x - 62, y - 40, 18, 14); door(x - 26, y, 16, 28, '#4d6a85');
  const sh = t.working ? Math.sin(time * 38) * 1.5 : 0; // rüttelt beim Schleudern
  ctx.save(); ctx.translate(sh, 0);
  ellipse(x + 40, y, 28, 6, 'rgba(0,0,0,.25)');
  for (const lx of [-16, 16]) line('#7f8a95', 3, x + 40 + lx, y, x + 40 + lx, y - 12);
  const g = ctx.createLinearGradient(x + 18, 0, x + 62, 0); g.addColorStop(0, '#eef2f5'); g.addColorStop(0.5, '#c3ccd4'); g.addColorStop(1, '#7f8a95');
  ctx.fillStyle = g; rrect(x + 18, y - 70, 44, 60, 10); ctx.fill();
  ctx.save(); ctx.translate(x + 40, y - 40); ctx.rotate(-phase(t) * 3); swirl(0, 0, 15, '#dfe5ea', '#4f7fa0'); ctx.restore();
  ctx.restore();
  if (t.working) for (const s of [-1, 1]) { ctx.strokeStyle = 'rgba(60,60,60,.45)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + 40, y - 40, 30, s > 0 ? -0.5 : Math.PI - 0.5, s > 0 ? 0.5 : Math.PI + 0.5); ctx.stroke(); }
  sign(x - 26, y - 62, bname(t));
};
DRAW.butterei = (x, y, t) => {
  house(x - 22, y, 92, 58, '#f8e7a0', '#c08a2a', 26); win(x - 58, y - 44, 20, 16, t.working); door(x - 8, y, 18, 30);
  ctx.fillStyle = '#ffe27a'; rrect(x - 40, y - 100, 34, 18, 3); ctx.fill(); ctx.fillStyle = '#fff2b0'; ctx.fillRect(x - 38, y - 98, 30, 4); // Butterblock auf dem Dach …
  ellipse(x - 34, y - 80 + ((time * 0.4) % 1) * 4, 2.5, 3.5, '#ffe27a'); // … schmilzt an der Sonne
  const up = t.working ? Math.abs(Math.sin(phase(t) * 2)) * 12 : 0; // Butterfass, der Stössel stampft
  barrel(x + 44, y, 11, 32, '#b07a42'); line('#6b4423', 3, x + 44, y - 30 - up, x + 44, y - 52 - up); line('#6b4423', 3, x + 36, y - 52 - up, x + 52, y - 52 - up);
  if (t.working) for (let i = 0; i < 3; i++) ellipse(x + 38 + i * 6, y - 36 - Math.abs(Math.sin(time * 6 + i)) * 8, 2, 2, '#ffe27a');
  pet(x + 66, y + 2, '#8a8a8a'); // die Katze schleckt heimlich mit
  sign(x - 16, y - 64, bname(t));
};
DRAW.keksbaeckerei = (x, y, t) => {
  house(x - 6, y, 104, 60, '#f3e2c0', '#b5713a', 28); win(x - 50, y - 44, 26, 20, t.working); door(x + 14, y, 18, 32);
  chimney(x + 30, y - 70, 22, t.working); cookie(x - 16, y - 100, 17);
  const k = Math.sin(time * 0.8 + t.id), dir = Math.cos(time * 0.8 + t.id) > 0 ? 1 : -1; // eine Maus klaut Krümel
  mouse(x + 62 + k * 10, y + 4, dir, dir > 0 ? null : '#dfa860');
  sign(x - 6, y - 66, bname(t));
};
DRAW.saftpresse = (x, y, t) => {
  house(x - 8, y, 100, 58, '#eef0dc', '#3d7a3a', 26); win(x - 46, y - 44, 20, 16, t.working); win(x + 10, y - 44, 20, 16, t.working); door(x - 12, y, 18, 30);
  const ax = x - 8, ay = y - 98; // Riesen-Apfel auf dem Dach – mit Wurm!
  ellipse(ax, ay, 18, 16, '#d8332a'); ellipse(ax - 6, ay - 5, 5, 4, 'rgba(255,255,255,.35)'); line('#5a3d22', 3, ax, ay - 14, ax + 2, ay - 22); ellipse(ax + 8, ay - 20, 6, 3, '#4f8a2f');
  ellipse(ax + 13, ay + 2, 3, 3, '#5a2a1a');
  const w = Math.sin(time * 3) * 3; ctx.strokeStyle = '#f2a7b0'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(ax + 13, ay + 2); ctx.quadraticCurveTo(ax + 22, ay - 4 + w, ax + 24 + w * 0.5, ay - 12); ctx.stroke(); ctx.lineCap = 'butt';
  ellipse(ax + 25 + w * 0.5, ay - 13, 0.9, 0.9, '#222');
  crate(x + 60, y + 4, '#d8332a', 10);
  sign(x - 8, y - 64, bname(t));
};
DRAW.essigbrauerei = (x, y, t) => {
  house(x - 22, y, 92, 58, '#e8dcc4', '#6b4a2b', 26); win(x - 58, y - 44, 20, 16, t.working); door(x - 12, y, 18, 30);
  barrel(x + 40, y, 13, 26); barrel(x + 68, y, 13, 26); barrel(x + 54, y - 26, 13, 26);
  const fx = x + 54, fy = y - 40; // das Fass hat sauer probiert 😖
  line('#2a1a0e', 1.5, fx - 7, fy - 4, fx - 3, fy - 2, fx - 7, fy); line('#2a1a0e', 1.5, fx + 7, fy - 4, fx + 3, fy - 2, fx + 7, fy);
  line('#2a1a0e', 1.5, fx - 5, fy + 6, fx - 2.5, fy + 4, fx, fy + 6, fx + 2.5, fy + 4, fx + 5, fy + 6);
  if (t.working) for (let i = 0; i < 3; i++) { const k = (time * 0.7 + i / 3) % 1; ctx.strokeStyle = `rgba(200,220,150,${1 - k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(fx + Math.sin(k * 6 + i) * 3, fy - 16 - k * 26, 2 + k * 2, 0, 7); ctx.stroke(); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.pizzeria = (x, y, t) => {
  house(x - 28, y, 82, 60, '#e8a86a', '#b5523a', 26); win(x - 58, y - 46, 18, 16, t.working); door(x - 22, y, 18, 32, '#3d7a3a');
  ctx.fillStyle = '#c4704f'; ctx.beginPath(); ctx.arc(x + 30, y, 24, Math.PI, 0); ctx.fill(); // Holzofen
  ctx.fillStyle = '#7d4632'; ctx.fillRect(x + 26, y - 34, 8, 12); puffs(x + 30, y - 34, t.working);
  ctx.fillStyle = t.working ? '#f08a24' : '#2a1a0e'; ctx.beginPath(); ctx.arc(x + 30, y, 10, Math.PI, 0); ctx.fill();
  if (t.working) flames(x + 30, y + 2, 2, 6);
  const a = phase(t), h = Math.abs(Math.sin(a * 1.5)) * 30, [hx, hy] = hand(x + 62, y, 1.4); // der Pizzaiolo wirft den Teig
  person(x + 62, y, '#fff', 'chef', 1.4); line('#3a2412', 2, x + 62, y - 22.5, x + 67, y - 22.5); // Schnauz
  ctx.save(); ctx.translate(hx, hy - 3 - h); ctx.rotate(Math.sin(a * 3) * 0.3); ellipse(0, 0, 10, 2.5, '#f3dca0'); ctx.restore();
  sign(x - 22, y - 66, bname(t));
};
DRAW.griessmuehle = (x, y, t) => { // Wassermühle
  house(x - 24, y, 88, 60, '#ece4d4', '#5b4a3a', 26); tiles(x - 68, y - 60, 88, 60, 'rgba(90,80,70,.15)', 10);
  win(x - 56, y - 46, 18, 16, t.working); door(x - 18, y, 18, 30);
  const wx = x + 44, wy = y - 30;
  ellipse(wx, y - 1, 30, 6, '#4f9ad0');
  ctx.fillStyle = '#7a5a3a'; ctx.fillRect(x + 30, y - 66, 36, 6); // Rinne
  if (t.working) { ctx.fillStyle = 'rgba(90,160,220,.85)'; ctx.fillRect(x + 32, y - 60, 6, 6); ctx.fillRect(x + 62, y - 60, 6, 56); }
  ctx.save(); ctx.translate(wx, wy); ctx.rotate(phase(t)); ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 25, 0, 7); ctx.stroke();
  for (let i = 0; i < 8; i++) { ctx.rotate(Math.PI / 4); line('#6b4423', 2.5, 0, 0, 25, 0); ctx.fillStyle = '#8a6a43'; ctx.fillRect(22, -3, 8, 6); }
  ctx.restore(); ellipse(wx, wy, 4, 4, '#3a2412');
  sign(x - 20, y - 66, bname(t));
};
DRAW.nudelfabrik = (x, y, t) => {
  house(x - 20, y, 96, 62, '#f4efe4', '#b5523a', 24); for (let i = 0; i < 3; i++) win(x - 60 + i * 26, y - 48, 16, 14, t.working); door(x - 20, y, 18, 28);
  chimney(x + 12, y - 74, 24, t.working);
  line('#6b4423', 3, x + 34, y, x + 34, y - 50); line('#6b4423', 3, x + 70, y, x + 70, y - 50); line('#8a6a43', 3, x + 32, y - 48, x + 72, y - 48); // Trocknungsgestell
  ctx.strokeStyle = '#f2d78a'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 11; i++) { const sx = x + 37 + i * 3, sw = Math.sin(time * 1.5 + i * 0.3) * 2; ctx.beginPath(); ctx.moveTo(sx, y - 48); ctx.quadraticCurveTo(sx + sw, y - 30, sx + sw * 1.5, y - 16 - (i % 3) * 3); ctx.stroke(); }
  const bx = x + 70 + Math.sin(time * 3) * 2; // ein Spatz zieht an einer Spaghetti
  ctx.beginPath(); ctx.moveTo(x + 68, y - 48); ctx.quadraticCurveTo(x + 64, y - 20, bx - 2, y - 9); ctx.stroke();
  ellipse(bx + 5, y - 5, 6, 4.5, '#9a6a3a'); ellipse(bx + 1, y - 9, 3.5, 3.5, '#9a6a3a'); ellipse(bx, y - 10, 0.9, 0.9, '#222'); line('#9a6a3a', 1.2, bx + 4, y - 1, bx + 4, y + 1);
  sign(x - 16, y - 70, bname(t));
};
DRAW.trattoria = (x, y, t) => {
  house(x - 22, y, 92, 60, '#f0c27a', '#b5523a', 26); win(x - 58, y - 36, 20, 16, t.working); win(x - 6, y - 36, 20, 16, t.working); door(x - 22, y, 16, 28, '#3d7a3a');
  awning(x - 22, y - 58, 92, '#d52b1e', '#fff', 10);
  for (let i = 0; i < 9; i++) ellipse(x - 68 + Math.sin(i * 1.3) * 3, y - 4 - i * 7, 4, 3, i % 2 ? '#4f8a2f' : '#6aa23c'); // Reben an der Wand
  const tx = x + 48; ctx.fillStyle = '#fff'; ctx.fillRect(tx - 14, y - 22, 28, 10); ctx.fillStyle = '#d52b1e';
  for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) if ((i + j) % 2) ctx.fillRect(tx - 14 + i * 4, y - 22 + j * 5, 4, 5); // karierte Tischdecke
  line('#6b4423', 2, tx - 10, y - 12, tx - 10, y); line('#6b4423', 2, tx + 10, y - 12, tx + 10, y);
  ctx.fillStyle = '#2f6a3a'; ctx.fillRect(tx + 4, y - 32, 5, 10); ctx.fillRect(tx + 5.5, y - 36, 2, 4); // Flasche
  ctx.fillStyle = '#fff'; ctx.fillRect(tx - 7, y - 30, 3, 8); ellipse(tx - 5.5, y - 33 + Math.sin(time * 9) * 0.6, 1.6, 2.8, '#ffb02e'); // Kerze
  const [hx, hy] = hand(x + 66, y, 1.45), wb = Math.sin(time * 2.3) * 0.25; // der Kellner balanciert den Teller
  person(x + 66, y, '#222', null, 1.45); line('#3a2412', 2, x + 66, y - 22.5, x + 71, y - 22.5);
  ctx.save(); ctx.translate(hx, hy - 2); ctx.rotate(wb); ellipse(0, 0, 9, 2.5, '#fff'); ellipse(0, -2, 5, 2, '#e8c35a'); ctx.restore();
  sign(x - 16, y - 66, bname(t));
};
DRAW.tortenmeister = (x, y, t) => { // das ganze Haus ist eine Torte
  ellipse(x + 6, y, 66, 10, 'rgba(0,0,0,.22)');
  const tier = (w, h, by, c) => {
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0); g.addColorStop(0, shade(c, 1.04)); g.addColorStop(1, shade(c, 0.85));
    ctx.fillStyle = g; ctx.fillRect(x - w / 2, by - h, w, h); ellipse(x, by - h, w / 2, 6, shade(c, 1.06));
    const n = Math.round(w / 12); for (let i = 0; i <= n; i++) ellipse(x - w / 2 + i * w / n, by - h + 1, 4.5, 3.5, '#fffdf8'); // Rahmtupfer
  };
  tier(120, 40, y, '#f6d4dc'); tier(88, 34, y - 40, '#fff2e0'); tier(56, 28, y - 74, '#f6d4dc');
  win(x - 50, y - 30, 16, 14, t.working); win(x + 34, y - 30, 16, 14, t.working); win(x - 10, y - 66, 20, 14, t.working); door(x, y, 18, 30, '#b05a7a');
  for (const [cx, c] of [[-18, '#7fd0f0'], [0, '#ffe066'], [18, '#a6e070']]) { ctx.fillStyle = c; ctx.fillRect(x + cx - 2, y - 120, 4, 16); ellipse(x + cx, y - 124 + Math.sin(time * 10 + cx) * 0.8, 2, 3.5, '#ffb02e'); }
  ellipse(x + 9, y - 106, 5, 5, '#d8232a'); line('#4f7a2f', 1.5, x + 9, y - 111, x + 12, y - 116);
  sign(x, y - 140, bname(t));
};
// Neue Rezepte
DRAW.gelateria = (x, y, t) => { // Riesen-Cornet auf dem Dach – es tropft!
  house(x - 20, y, 92, 58, '#fde8ef', '#7fc8c0', 24); win(x - 56, y - 44, 20, 16, t.working); door(x - 8, y, 18, 30, '#e07a9a');
  awning(x - 20, y - 58, 92, '#f28aa8', '#fff', 8);
  const cx = x - 20, cy = y - 80;
  ctx.fillStyle = '#d9a35a'; ctx.beginPath(); ctx.moveTo(cx - 13, cy - 30); ctx.lineTo(cx + 13, cy - 30); ctx.lineTo(cx, cy); ctx.fill();
  for (let i = -1; i <= 1; i++) line('rgba(120,70,20,.5)', 1, cx + i * 7 - 6, cy - 30, cx + i * 7 + 4, cy - 12); // Waffelmuster
  ellipse(cx, cy - 33, 14, 9, '#f5a3c7'); ellipse(cx - 1, cy - 44, 12, 8, '#fff6e0'); ellipse(cx + 1, cy - 54, 9, 7, '#7d4a2a'); ellipse(cx + 3, cy - 62, 3, 3, '#d8232a');
  const k = (time * 0.35) % 1; ellipse(cx + 10 - k * 3, cy - 28 + k * 22, 2, 2.5 + k, '#f5a3c7'); // Tropfen
  const [hx, hy] = hand(x + 40, y, 1.2); person(x + 40, y, '#3a6fd8', null, 1.2); // Kind mit Glace …
  ctx.fillStyle = '#d9a35a'; ctx.beginPath(); ctx.moveTo(hx - 3, hy - 4); ctx.lineTo(hx + 3, hy - 4); ctx.lineTo(hx, hy + 3); ctx.fill(); ellipse(hx, hy - 6, 3.5, 3, '#a6e070');
  ellipse(x + 58, y - 1, 5, 2.5, '#f5a3c7'); pet(x + 70, y + 2, '#c08a50', true); // … die andere Kugel ist runtergefallen, der Hund freut sich
  sign(x - 20, y - 66, bname(t));
};
DRAW.sennhuette = (x, y, t) => { // Alphütte: der Senn rührt im Kupferkessi, die Kuh schaut ums Eck
  const cw = Math.sin(time * 1.4 + t.id) * 2; // Kuh nickt
  ellipse(x - 76, y - 28 + cw, 9, 8, '#fff'); ellipse(x - 79, y - 31 + cw, 4, 3, '#222'); ellipse(x - 82, y - 22 + cw, 6, 4, '#f2b6b0');
  ellipse(x - 74, y - 37 + cw, 4, 2, '#fff'); ellipse(x - 80, y - 29 + cw, 1, 1, '#222');
  house(x - 24, y, 88, 54, '#8a5a35', '#6a6560', 22);
  for (let i = 1; i < 6; i++) line('rgba(40,20,10,.35)', 1, x - 68, y - i * 9, x + 20, y - i * 9); // Holzbalken
  for (const sx of [-48, -24, 0]) ellipse(x + sx, y - 70, 6, 3, '#8f8a84'); // Steine halten das Dach bei Sturm fest
  win(x - 56, y - 40, 16, 14, t.working); door(x - 16, y, 18, 30, '#4a2f1e');
  const kx = x + 46;
  line('#3a3a3a', 3, kx - 20, y, kx - 16, y - 50); line('#3a3a3a', 3, kx + 20, y, kx + 16, y - 50); line('#3a3a3a', 3, kx - 18, y - 48, kx + 18, y - 48); line('#3a3a3a', 1.5, kx, y - 48, kx, y - 40);
  if (t.working) flames(kx, y + 2, 3, 6);
  ctx.fillStyle = '#c8783a'; ctx.beginPath(); ctx.arc(kx, y - 30, 14, 0, Math.PI); ctx.fill(); ellipse(kx, y - 30, 14, 3.5, '#f2d78a');
  puffs(kx, y - 34, t.working, '255,255,255', 0.6);
  const a = phase(t), sx = kx + 28, arm = 0.8;
  ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); person(0, y, '#3a6fd8', '#222', arm); ctx.restore(); // Senn im blauen Edelweisshemd
  line('#6b4423', 2.5, sx - 3 - Math.cos(arm) * 9, y - 18 - Math.sin(arm) * 9, kx + Math.cos(a * 2) * 7, y - 31); // Kelle rührt
  sign(x - 24, y - 64, bname(t));
};
DRAW.gruyerestube = (x, y, t) => { // Schlösschen mit Turm; im Doppelrahm steht der Löffel
  house(x - 10, y, 88, 56, '#e6dccb', '#b5523a', 24); win(x - 44, y - 42, 18, 16, t.working); door(x - 4, y, 18, 30, '#6b4423');
  const tx = x + 46; ctx.fillStyle = '#d8cdb8'; ctx.fillRect(tx - 14, y - 82, 28, 82); // Turm
  for (let i = 0; i < 4; i++) ctx.fillRect(tx - 14 + i * 8, y - 88, 5, 6);
  ctx.fillStyle = '#b5523a'; ctx.beginPath(); ctx.moveTo(tx - 17, y - 86); ctx.lineTo(tx + 17, y - 86); ctx.lineTo(tx, y - 122); ctx.fill();
  line('#555', 1.5, tx, y - 122, tx, y - 132); ctx.fillStyle = '#d52b1e'; ctx.fillRect(tx, y - 132 + Math.sin(time * 3) * 0.6, 9, 5); // Fähnli
  win(tx - 6, y - 64, 12, 16, t.working);
  const bx = x - 10, by = y - 84; // Schüssel auf dem Dach
  meringue(bx - 18, by + 2, 9);
  ellipse(bx + 6, by, 15, 5, '#7fa7c9'); ctx.fillStyle = '#7fa7c9'; ctx.beginPath(); ctx.arc(bx + 6, by, 15, 0, Math.PI); ctx.fill(); ellipse(bx + 6, by, 13, 3.5, '#fff6dc');
  ctx.save(); ctx.translate(bx + 6, by - 2); ctx.rotate(0.15 + Math.sin(time * 0.7) * 0.03); line('#b8c0c8', 3, 0, 0, 0, -22); ellipse(0, -24, 3.5, 5, '#b8c0c8'); ctx.restore(); // steht von allein!
  sign(x - 10, y - 64, bname(t));
};
DRAW.maelzerei = (x, y, t) => { // Darre mit Lüftungshaube; davor keimen die Körner
  house(x - 30, y, 84, 56, '#efe3c8', '#8a5a3a', 22); win(x - 62, y - 42, 18, 14, t.working); door(x - 24, y, 18, 30);
  const dx = x + 32; ctx.fillStyle = '#c4704f'; ctx.fillRect(dx - 15, y - 90, 30, 90); bricks(dx - 15, y - 90, 30, 90); // Darre
  ctx.save(); ctx.translate(dx, y - 90); ctx.rotate(Math.sin(time * 0.8) * (t.working ? 0.12 : 0.03)); // Haube dreht sich im Wind
  ctx.fillStyle = '#e8e2d4'; ctx.beginPath(); ctx.moveTo(-19, 0); ctx.lineTo(19, 0); ctx.lineTo(0, -26); ctx.fill(); ctx.restore();
  puffs(dx, y - 112, t.working, '240,230,200', 0.6);
  ellipse(x + 64, y - 2, 18, 5, '#e3c27a'); // Körnerhaufen …
  for (let i = 0; i < 6; i++) { const sx = x + 50 + i * 5.5, h = 4 + Math.abs(Math.sin(time * 0.6 + i)) * 5; line('#6aa23c', 1.5, sx, y - 4, sx + 1, y - 4 - h); ellipse(sx + 2, y - 4 - h, 1.8, 1, '#8ccf55'); } // … und alle keimen
  const a = phase(t), w = Math.sin(a * 1.5) * 10; person(x + 64 + w, y + 10, '#8a5530', '#e8c35a', -0.4); line('#6b4423', 2, x + 70 + w, y - 5, x + 78 + w, y + 6); // Mälzer wendet mit dem Rechen
  sign(x - 26, y - 62, bname(t));
};
DRAW.malzfabrik = (x, y, t) => { // Riesen-Tasse auf dem Dach; der Gewichtheber hat schon getrunken
  house(x - 22, y, 96, 60, '#f6e6c8', '#e07a24', 24); win(x - 62, y - 46, 18, 16, t.working); win(x - 34, y - 46, 18, 16, t.working); door(x - 8, y, 18, 30, '#7a3b2a');
  const cx = x - 26, cy = y - 92;
  ctx.strokeStyle = '#3a6fd8'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx + 15, cy - 4, 6, -1.3, 1.3); ctx.stroke();
  ctx.fillStyle = '#3a6fd8'; rrect(cx - 15, cy - 14, 30, 22, 6); ctx.fill(); ellipse(cx, cy - 13, 13, 3, '#8a5530'); puffs(cx, cy - 16, t.working, '255,255,255', 0.6);
  const up = t.working ? Math.abs(Math.sin(phase(t) * 1.4)) : 0.2, px = x + 52, by = y - 26 - up * 12; // Hantel hoch, Hantel runter
  line('#3a3a4a', 3, px - 3, y, px - 4, y - 9); line('#3a3a4a', 3, px + 3, y, px + 4, y - 9);
  ctx.fillStyle = '#e07a24'; rrect(px - 5, y - 21, 10, 13, 3); ctx.fill();
  line('#f1c9a5', 2.5, px - 4, y - 18, px - 10, by); line('#f1c9a5', 2.5, px + 4, y - 18, px + 10, by);
  ellipse(px, y - 25, 5, 5, '#f1c9a5'); ellipse(px + 2, y - 26, 0.9, 0.9, '#222'); line('#222', 1, px - 1, y - 22.5, px + 3, y - 22.5);
  line('#555', 2.5, px - 18, by, px + 18, by); for (const s of [-1, 1]) ellipse(px + s * 18, by, 3.5, 7, '#2a2a2a');
  if (t.working && up > 0.9) { ctx.font = '12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('💪', px + 22, by - 8); }
  sign(x - 22, y - 66, bname(t));
};
DRAW.schoggistube = (x, y, t) => { // Caquelon auf dem Dach: ein Apfelschnitz taucht ein und wieder auf
  house(x - 18, y, 96, 58, '#fbeedd', '#6b3a20', 26); win(x - 56, y - 44, 20, 16, t.working); win(x - 4, y - 44, 20, 16, t.working); door(x - 30, y, 16, 28, '#6b3a20');
  ctx.fillStyle = '#6b3a20'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.ellipse(x - 60 + i * 12, y - 58, 4, 4 + (i % 3) * 2.5, 0, 0, 7); ctx.fill(); } // Schoggi tropft vom Dach
  const cx = x - 18, cy = y - 92;
  if (t.working) flames(cx, cy + 18, 2, 7);
  ctx.fillStyle = '#c0552f'; ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI); ctx.fill(); ellipse(cx, cy, 18, 4.5, '#5a3220'); line('#c0552f', 4, cx + 16, cy + 2, cx + 30, cy - 2);
  const d = t.working ? Math.max(0, Math.sin(phase(t) * 1.6)) * 14 : 6, fx = cx - 6, fy = cy - 6 - d; // Gabel mit Apfelschnitz
  line('#999', 1.5, fx, fy, fx - 14, fy - 30);
  ellipse(fx, fy, 5, 3.5, '#f3e6b8'); ctx.save(); ctx.beginPath(); ctx.rect(fx - 6, fy, 12, 6); ctx.clip(); ellipse(fx, fy, 5, 3.5, '#5a3220'); ctx.restore(); // halb schoggiert
  const m = Math.sin(time * 0.9 + t.id), dir = Math.cos(time * 0.9 + t.id) > 0 ? 1 : -1;
  mouse(x + 54 + m * 10, y + 4, dir, '#5a3220'); // die Maus hat sich einen Schoggi-Brocken geschnappt
  sign(x - 18, y - 66, bname(t));
};
DRAW.laeckerli_huus = (x, y, t) => { // Riesen-Läckerli auf dem Dach; eine Biene will auch probieren
  house(x - 14, y, 100, 58, '#f4e2c4', '#a8452a', 26); win(x - 54, y - 44, 18, 14, t.working); win(x + 12, y - 44, 18, 14, t.working); door(x - 18, y, 18, 30);
  const lx = x - 14, ly = y - 98; ctx.fillStyle = '#9a5a2a'; rrect(lx - 24, ly, 48, 14, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.75)'; rrect(lx - 22, ly + 1, 44, 4, 2); ctx.fill();
  const a = time * 2 + t.id, bx = lx + Math.cos(a) * 28, by = ly - 6 + Math.sin(a * 2) * 6; ellipse(bx, by, 3, 2, '#f2c21e'); ellipse(bx, by - 2.5, 2, 1.4, 'rgba(255,255,255,.85)');
  if (t.working) { const k = phase(t), cx = x + 58, cy = y - 4; person(cx - 10, y + 6, '#f2f2f2', 'chef', -0.2 + Math.sin(k * 2) * 0.3); ctx.fillStyle = '#9a5a2a'; ctx.fillRect(cx - 2, cy - 14, 22, 6); }
  sign(x - 14, y - 64, bname(t));
};
DRAW.biberbeck = (x, y, t) => { // auf dem Dach sitzt ein Biber und knabbert einen Biber
  house(x - 16, y, 100, 60, '#efe0c8', '#6b4423', 26); win(x - 56, y - 46, 18, 14, t.working); win(x + 10, y - 46, 18, 14, t.working); door(x - 20, y, 18, 30, '#3a2a1a');
  const bx = x - 16, by = y - 92, n = t.working ? Math.abs(Math.sin(phase(t) * 3)) * 2 : 0;
  ctx.fillStyle = '#5a3a20'; ctx.beginPath(); ctx.ellipse(bx - 20, by + 8, 12, 5, -0.3, 0, 7); ctx.fill(); // platter Schwanz
  ellipse(bx, by, 14, 12, '#8a5530'); ellipse(bx + 12, by - 10, 8, 7, '#8a5530'); ellipse(bx + 18, by - 9, 2, 1.6, '#222'); ellipse(bx + 14, by - 13, 1, 1, '#222');
  ctx.fillStyle = '#fff'; ctx.fillRect(bx + 16, by - 6 + n, 2, 3); ctx.fillRect(bx + 18.5, by - 6 + n, 2, 3); // Nagezähne
  ctx.fillStyle = '#b06a32'; rrect(bx + 16, by - 3, 14, 10, 2); ctx.fill(); ctx.strokeStyle = '#f4e2c4'; ctx.lineWidth = 1; ctx.strokeRect(bx + 18, by - 1, 10, 6);
  sign(x - 16, y - 68, bname(t));
};
DRAW.roestibeiz = (x, y, t) => { // Pfanne auf dem Dach: die Rösti wird gewendet – hopp!
  house(x - 16, y, 96, 58, '#f4ead6', '#8a3a2a', 26); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  const px = x - 16, py = y - 90, k = t.working ? Math.max(0, Math.sin(phase(t) * 1.5)) : 0;
  if (t.working) flames(px, py + 14, 3, 8);
  ellipse(px, py, 22, 5, '#2a2a2a'); line('#2a2a2a', 4, px + 20, py, px + 38, py - 6);
  ctx.save(); ctx.translate(px, py - 4 - k * 26); ctx.rotate(k * Math.PI); ellipse(0, 0, 17, 4, '#e8b04a'); ellipse(0, -1, 14, 2.5, '#d08a2a'); ctx.restore();
  sign(x - 16, y - 66, bname(t));
};
DRAW.raclettestube = (x, y, t) => { // halber Käselaib vor dem Feuer, der Käse tropft auf die Kartoffeln
  house(x - 16, y, 100, 60, '#f2e8d8', '#5a5248', 26); win(x - 56, y - 46, 18, 14, t.working); win(x + 10, y - 46, 18, 14, t.working); door(x - 20, y, 18, 30);
  const cx = x - 16, cy = y - 96;
  if (t.working) flames(cx + 26, cy + 18, 2, 7);
  ctx.fillStyle = '#e8c35a'; ctx.beginPath(); ctx.arc(cx, cy + 10, 18, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#c99a3a'; ctx.fillRect(cx - 18, cy + 8, 36, 3);
  ctx.fillStyle = '#f2d470'; ctx.fillRect(cx + 15, cy - 6, 4, 16);
  if (t.working) { const d = (time * 1.2 + t.id) % 1; ellipse(cx + 18, cy + 14 + d * 10, 2.5, 3 + d * 2, '#f2d470'); } // tropf
  for (let i = 0; i < 3; i++) ellipse(cx + 12 + i * 8, cy + 24, 4, 3, '#d9b072');
  sign(x - 16, y - 68, bname(t));
};
DRAW.chipsfabrik = (x, y, t) => { // Kamin pustet Chips statt Rauch
  house(x - 16, y, 104, 62, '#e8e4dc', '#c03a2a', 22); win(x - 58, y - 48, 18, 14, t.working); win(x - 30, y - 48, 18, 14, t.working); door(x + 12, y, 20, 32, '#5a5a5a');
  chimney(x + 22, y - 72, 26, false);
  if (t.working) for (let i = 0; i < 5; i++) { const k = (time * 0.6 + i / 5) % 1, cx = x + 22 + Math.sin(k * 6 + i) * 10, cy = y - 100 - k * 34; ctx.save(); ctx.translate(cx, cy); ctx.rotate(k * 6 + i); ellipse(0, 0, 5, 3.5, `rgba(240,200,90,${1 - k})`); ctx.restore(); }
  sign(x - 16, y - 70, bname(t));
};
DRAW.marronistand = (x, y, t) => { // Marroni-Mann mit Ofen auf Rädern
  ellipse(x, y, 50, 9, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(x - 34, y - 40, 52, 30); wheel(x - 24, y - 6, 7); wheel(x + 8, y - 6, 7);
  ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x - 30, y - 46, 44, 6); for (let i = 0; i < 6; i++) ellipse(x - 26 + i * 7, y - 48, 3, 2.2, '#7a3f1e');
  if (t.working) flames(x - 8, y - 12, 4, 8);
  chimney(x + 10, y - 46, 30, t.working, '200,200,200', 0.7);
  ctx.fillStyle = '#c0552f'; ctx.beginPath(); ctx.moveTo(x - 46, y - 64); ctx.lineTo(x + 30, y - 64); ctx.lineTo(x + 24, y - 76); ctx.lineTo(x - 40, y - 76); ctx.fill();
  person(x + 40, y + 2, '#2a4a7a', '#3a2a1a', t.working ? -0.6 + Math.sin(phase(t) * 2) * 0.4 : -0.6);
  for (let i = 0; i < Math.min(t.out, 4); i++) { ctx.fillStyle = '#e8dcc4'; ctx.fillRect(x - 54 + i * 8, y - 16, 7, 10); }
  sign(x - 8, y - 82, bname(t));
};
DRAW.vermicelles_kueche = (x, y, t) => { // Riesen-Coupe: braune Würmchen, Rahmhaube, Kirsche obendrauf
  house(x - 16, y, 100, 60, '#fbefe0', '#7a4a2a', 26); win(x - 56, y - 46, 18, 14, t.working); win(x + 10, y - 46, 18, 14, t.working); door(x - 20, y, 18, 30, '#7a4a2a');
  const cx = x - 16, cy = y - 92;
  ctx.fillStyle = 'rgba(200,225,240,.85)'; ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy); ctx.lineTo(cx + 4, cy + 14); ctx.lineTo(cx - 4, cy + 14); ctx.fill(); ctx.fillRect(cx - 2, cy + 14, 4, 6);
  ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 2.2; ctx.beginPath(); for (let i = 0; i < 7; i++) { ctx.moveTo(cx - 18 + i * 6, cy); ctx.quadraticCurveTo(cx - 14 + i * 5, cy - 12, cx - 4 + i * 2, cy - 18); } ctx.stroke();
  const w = t.working ? Math.sin(phase(t) * 2) * 1.5 : 0;
  ellipse(cx, cy - 22, 12, 6, '#fff'); ellipse(cx + w, cy - 27, 7, 5, '#fff'); ellipse(cx + w, cy - 34, 3.5, 3.5, '#d8232a');
  sign(x - 16, y - 68, bname(t));
};
DRAW.geisskaeserei = (x, y, t) => { // Geiss auf dem Dach knabbert an der Wetterfahne
  house(x - 16, y, 98, 58, '#f2ece0', '#5a5248', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  for (let i = 0; i < 4; i++) ellipse(x + 50, y - 4 - i * 7, 8, 3.5, '#f8f8f2'); // Chäsli-Turm
  goat(x - 22, y - 82, time * 6 + t.id); line('#555', 2, x + 4, y - 82, x + 4, y - 104); ctx.fillStyle = '#c8102e'; ctx.beginPath(); ctx.moveTo(x + 4, y - 104); ctx.lineTo(x + 18, y - 100); ctx.lineTo(x + 4, y - 96); ctx.fill();
  sign(x - 16, y - 64, bname(t));
};
DRAW.chaeschueechli_beck = (x, y, t) => { // Riesen-Chüechli auf dem Dach, dampft frisch
  house(x - 16, y, 98, 58, '#f6e8cc', '#a8452a', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  const cx = x - 16, cy = y - 90, u = t.working ? Math.abs(Math.sin(phase(t))) * 3 : 0;
  ctx.fillStyle = '#c8883a'; ctx.beginPath(); ctx.moveTo(cx - 20, cy - 8); ctx.lineTo(cx + 20, cy - 8); ctx.lineTo(cx + 15, cy + 4); ctx.lineTo(cx - 15, cy + 4); ctx.fill();
  ellipse(cx, cy - 8 - u, 18, 6 + u, '#f2c85a'); ellipse(cx - 4, cy - 10 - u, 6, 2, '#d8902a'); puffs(cx, cy - 14, t.working, '255,255,255', 0.5);
  sign(x - 16, y - 64, bname(t));
};
DRAW.zuckerfabrik = (x, y, t) => { // Fabrik mit Silo; aus dem Kamin steigen Zuckerwürfel
  house(x - 24, y, 92, 62, '#e4e0d8', '#6a7a8a', 20); win(x - 60, y - 48, 16, 14, t.working); win(x - 36, y - 48, 16, 14, t.working); door(x - 2, y, 18, 32, '#5a5a5a');
  ctx.fillStyle = '#c8ccd0'; rrect(x + 30, y - 96, 28, 96, 12); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('ZUCKER', x + 44, y - 60);
  if (t.working) for (let i = 0; i < 4; i++) { const k = (time * 0.5 + i / 4) % 1; ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(x + 40 + Math.sin(k * 5 + i) * 8, y - 104 - k * 30, 6, 6); }
  sign(x - 24, y - 70, bname(t));
};
DRAW.taefeli_kueche = (x, y, t) => { // Blech mit Täfeli-Würfeln, der Koch rührt im Kupferkessel
  house(x - 16, y, 98, 58, '#fbefe0', '#c07a3a', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  const bx = x - 34, by = y - 92; ctx.fillStyle = '#9aa0a8'; ctx.fillRect(bx - 2, by + 8, 40, 4);
  for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 3 ? '#d89a4a' : '#c07a2a'; ctx.fillRect(bx + (i % 6) * 6, by - Math.floor(i / 6) * 6 + 2, 5, 5); }
  const k = phase(t); ellipse(x + 52, y - 10, 13, 5, '#c8743a'); ctx.fillStyle = '#c8743a'; ctx.beginPath(); ctx.arc(x + 52, y - 10, 13, 0, Math.PI); ctx.fill(); ellipse(x + 52, y - 10, 11, 3.5, '#a8662a');
  if (t.working) { line('#6b4423', 2, x + 52 + Math.cos(k * 3) * 6, y - 11, x + 46, y - 30); puffs(x + 52, y - 14, true, '255,240,220', 0.4); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.nougat_kueche = (x, y, t) => { // dreieckiger Berg aus Nougat auf dem Dach – mit Schneekappe
  house(x - 16, y, 98, 58, '#f6ecd8', '#8a5a3a', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  const cx = x - 16, cy = y - 82;
  ctx.fillStyle = '#e8d4a8'; ctx.beginPath(); ctx.moveTo(cx - 24, cy); ctx.lineTo(cx + 2, cy - 38); ctx.lineTo(cx + 24, cy); ctx.fill();
  for (let i = 0; i < 6; i++) ellipse(cx - 12 + (i * 9 % 24), cy - 6 - (i * 7 % 20), 2.2, 1.6, '#b07a3a'); // Mandeln
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(cx - 6, cy - 29); ctx.lineTo(cx + 2, cy - 38); ctx.lineTo(cx + 9, cy - 28); ctx.lineTo(cx + 3, cy - 31); ctx.fill();
  const a = time * 2 + t.id; ellipse(cx + Math.cos(a) * 30, cy - 20 + Math.sin(a * 2) * 6, 3, 2, '#f2c21e'); // die Biene kommt den Honig suchen
  sign(x - 16, y - 64, bname(t));
};
DRAW.konfiserie = (x, y, t) => { // Gläser auf dem Fensterbrett, im Topf blubbert's rot
  house(x - 16, y, 98, 58, '#fbeee8', '#c8102e', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30);
  for (let i = 0; i < 4; i++) { const jx = x - 60 + i * 12, jy = y - 92; ctx.fillStyle = '#b8102e'; ctx.fillRect(jx, jy, 9, 11); ctx.fillStyle = '#f2f2f2'; ctx.fillRect(jx - 1, jy - 3, 11, 3); }
  ellipse(x + 50, y - 12, 13, 4, '#7a7a7a'); ctx.fillStyle = '#7a7a7a'; ctx.beginPath(); ctx.arc(x + 50, y - 12, 13, 0, Math.PI); ctx.fill(); ellipse(x + 50, y - 12, 11, 3, '#b8102e');
  if (t.working) { flames(x + 50, y + 4, 3, 7); for (let i = 0; i < 3; i++) { const k = (time * 1.3 + i / 3) % 1; ellipse(x + 44 + i * 6, y - 13 - k * 6, 2 * (1 - k), 2 * (1 - k), '#d8203e'); } }
  sign(x - 16, y - 64, bname(t));
};
DRAW.kirschtorte_beck = (x, y, t) => { // Torte mit Rautenmuster; oben sitzt eine Kirsche, die ein Spatz klauen will
  house(x - 16, y, 98, 58, '#fdf2ec', '#d8708a', 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30, '#a8452a');
  const cx = x - 16, cy = y - 86;
  ctx.fillStyle = '#f2c8a8'; ctx.fillRect(cx - 22, cy - 14, 44, 14); ctx.fillStyle = '#e8a0b0'; ctx.fillRect(cx - 22, cy - 9, 44, 4); ellipse(cx, cy - 14, 22, 5, '#fbf4e8');
  ctx.strokeStyle = 'rgba(160,110,70,.6)'; ctx.lineWidth = 1; ctx.beginPath(); for (let i = -3; i <= 3; i++) { ctx.moveTo(cx + i * 6 - 8, cy - 18); ctx.lineTo(cx + i * 6 + 8, cy - 10); ctx.moveTo(cx + i * 6 + 8, cy - 18); ctx.lineTo(cx + i * 6 - 8, cy - 10); } ctx.stroke();
  ellipse(cx, cy - 20, 3.5, 3.5, '#c8102e'); line('#4a6a2a', 1, cx, cy - 23, cx + 3, cy - 28);
  const h = Math.max(0, Math.sin(time * 0.8 + t.id)) * 14; ellipse(cx + 22 + h, cy - 22, 5, 4, '#8a6a4a'); ellipse(cx + 18 + h, cy - 25, 3, 3, '#8a6a4a'); ellipse(cx + 17 + h, cy - 26, 0.8, 0.8, '#222');
  sign(x - 16, y - 64, bname(t));
};
// ---- Land-Stufen 70–100 ----
DRAW.erdbeerfeld = (x, y, t) => { // Erdbeeren auf Stroh; eine Schnecke hat sich die grösste geschnappt
  rowCrop(x, y, t, '#3f8a3a', '#5cae4a', '#3f8a3a', '#5cae4a', '#e8283a', 0.9);
  const s = (time * 3 + t.id * 7) % 40; ellipse(x - 48 + s, y + 6, 6, 2.5, '#c8b890'); ellipse(x - 50 + s, y + 3, 4, 4, '#a8743a'); line('#a8743a', 1, x - 43 + s, y + 4, x - 41 + s, y); // Schnecke kriecht
};
DRAW.kraeuterbeet = (x, y, t) => { // Chrüter mit lila Blüten, ein Schmetterling flattert drüber
  rowCrop(x, y, t, '#5a8a4a', '#8ab06a', '#4f7f42', '#9ac07a', '#a87ad8', 0.85);
  const a = time * 1.3 + t.id, bx = x + Math.cos(a) * 40, by = y - 40 + Math.sin(a * 2.3) * 8, f = Math.abs(Math.sin(time * 14)) * 4 + 1;
  ellipse(bx - f, by, f, 3, '#f29a2e'); ellipse(bx + f, by, f, 3, '#f29a2e'); line('#333', 1.5, bx, by - 3, bx, by + 3);
};
DRAW.kuerbisfeld = (x, y, t) => { // Ranken mit Kürbissen; einer ist riesig, eine Maus wohnt drin
  const g = grown(t);
  ctx.fillStyle = '#7a5636'; rrect(x - 66, y - 34, 140, 38, 8); ctx.fill();
  ctx.strokeStyle = '#4f8a36'; ctx.lineWidth = 2; ctx.beginPath(); for (let r = 0; r < 2; r++) { ctx.moveTo(x - 60, y - 22 + r * 16); for (let i = 1; i <= 8; i++) ctx.quadraticCurveTo(x - 64 + i * 16, y - 30 + r * 16 + (i % 2) * 12, x - 60 + i * 16, y - 22 + r * 16); } ctx.stroke();
  for (let i = 0; i < 6; i++) ellipse(x - 52 + i * 22, y - 26 + (i % 2) * 16, 7, 5, '#5cae4a');
  for (let i = 0; i < 4; i++) { const px = x - 44 + i * 30, py = y - 14 + (i % 2) * 8, r = (3 + g * 8) * (i === 2 ? 1.6 : 1), c = g > 0.6 ? '#f28a1e' : '#c8c03a';
    ellipse(px, py, r * 1.2, r, c); ellipse(px - r * 0.4, py, r * 0.35, r * 0.95, 'rgba(0,0,0,.12)'); ellipse(px + r * 0.4, py, r * 0.35, r * 0.95, 'rgba(0,0,0,.12)'); line('#4a6a2a', 2, px, py - r, px + 2, py - r - 4); }
  if (g > 0.6) { ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.arc(x + 16, y - 8, 3, Math.PI, 0); ctx.fill(); ellipse(x + 16, y - 9, 1.8, 1.8, '#9a9a9a'); } // Mäuseloch im Riesenkürbis
  if (t.store > 0) crate(x + 86, y + 4, '#f28a1e', Math.min(t.store, 12));
};
DRAW.maisfeld = (x, y, t) => { // hohe Maisstängel; ein Rabe sitzt obendrauf und lacht
  const g = grown(t), h = 12 + g * 50;
  ctx.fillStyle = '#7a5636'; rrect(x - 66, y - 18, 140, 22, 6); ctx.fill();
  for (let r = 0; r < 2; r++) for (let c = 0; c < 9; c++) {
    const px = x - 60 + c * 16 + r * 8, py = y - 12 + r * 10, sw = Math.sin(time * 1.5 + c + r) * 2;
    line('#5a9a3a', 3, px, py, px + sw, py - h); line('#6cbf45', 2, px, py - h * 0.5, px + 9, py - h * 0.65); line('#6cbf45', 2, px, py - h * 0.35, px - 9, py - h * 0.5);
    if (g > 0.5) { ellipse(px + 3, py - h * 0.55, 3, 6, t.ripe ? '#f2cf3b' : '#a8c86a'); line('#c8903a', 1, px + 3, py - h * 0.55 - 6, px + 5, py - h * 0.55 - 10); }
    if (g > 0.7) line('#d8c06a', 1.5, px + sw, py - h, px + sw - 3, py - h - 6, px + sw, py - h, px + sw + 3, py - h - 6);
  }
  const rx = x + 40, ry = y - 12 - h - 6, k = Math.sin(time * 4 + t.id) > 0.7; ellipse(rx, ry, 7, 5, '#222'); ellipse(rx + 6, ry - 4, 4, 4, '#222'); ctx.fillStyle = '#e8b02e'; ctx.beginPath(); ctx.moveTo(rx + 9, ry - 5); ctx.lineTo(rx + 15, ry - (k ? 6 : 4)); ctx.lineTo(rx + 9, ry - 2); ctx.fill();
  if (t.store > 0) crate(x + 86, y + 4, '#f2cf3b', Math.min(t.store, 12));
};
function sheep(x, y, ph, nose = '#2a2a2a') { // wollig wie eine Wolke, Schwarznase aus dem Wallis
  const k = Math.sin(ph) * 1.2;
  for (const [dx, dy] of [[-6, -10], [0, -12], [6, -10], [-3, -7], [4, -7]]) ellipse(x + dx, y + dy, 6, 5, '#f4f2ea');
  ellipse(x + 11, y - 13 + k, 4, 4.5, nose); ellipse(x + 9, y - 17 + k, 3.5, 2.5, '#f4f2ea'); ellipse(x + 13, y - 14 + k, 0.9, 0.9, '#fff');
  for (const lx of [-6, -2, 4, 7]) line(nose, 2, x + lx, y - 4, x + lx, y + 1);
}
DRAW.schaf = (x, y, t) => { // Stall, Schafe; eines ist frisch geschoren und friert
  const g = grown(t);
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#8a6a4a'; ctx.fillRect(x - 62, y - 36, 40, 32); ctx.fillStyle = '#6b4a2b'; ctx.beginPath(); ctx.moveTo(x - 66, y - 34); ctx.lineTo(x - 42, y - 50); ctx.lineTo(x - 18, y - 34); ctx.fill();
  ctx.fillStyle = '#3a2412'; ctx.fillRect(x - 48, y - 22, 12, 18);
  for (let i = 0; i < 1 + Math.round(g * 2); i++) sheep(x - 6 + i * 22, y + 2 - (i % 2) * 5, time * 4 + i * 2 + t.id, i === 1 ? '#f4f2ea' : '#2a2a2a');
  const s = Math.sin(time * 30) * 0.8; ellipse(x + 60 + s, y - 8, 7, 5, '#f2c8b8'); ellipse(x + 69 + s, y - 12, 3.5, 4, '#2a2a2a'); for (const lx of [-4, 4]) line('#2a2a2a', 2, x + 60 + lx + s, y - 4, x + 60 + lx + s, y + 1); // nackt und bibbernd
  if (t.store > 0) crate(x + 86, y + 4, '#f4f2ea', Math.min(t.store, 12));
};
function fir(x, y, h, c) { ctx.fillStyle = '#5a3a20'; ctx.fillRect(x - 3, y - 10, 6, 10); ctx.fillStyle = c; for (let i = 0; i < 3; i++) { const w = h * (0.45 - i * 0.1), yy = y - 8 - i * h * 0.26; ctx.beginPath(); ctx.moveTo(x - w, yy); ctx.lineTo(x, yy - h * 0.45); ctx.lineTo(x + w, yy); ctx.fill(); } }
DRAW.wald = (x, y, t) => { // Tannen wachsen nach, ein Specht klopft, Baumstumpf mit Jahrringen
  const g = grown(t);
  ellipse(x, y, 50, 9, 'rgba(0,0,0,.22)');
  fir(x - 22, y - 4, 70 + g * 20, '#2a5a2e'); fir(x + 14, y, 60 + g * 30, '#2f6a33'); fir(x - 2, y + 6, 22 + g * 30, '#3d7d3a');
  ellipse(x + 34, y + 2, 7, 3, '#c8a06a'); ctx.strokeStyle = '#8a6a3a'; ctx.lineWidth = 0.8; for (const r of [2, 4, 6]) { ctx.beginPath(); ctx.ellipse(x + 34, y + 2, r, r * 0.4, 0, 0, 7); ctx.stroke(); }
  const k = Math.sin(time * 20 + t.id) > 0 ? 1 : 0; ellipse(x + 17 - k, y - 30, 3, 4, '#222'); ellipse(x + 17 - k, y - 34, 2, 2, '#c8102e'); line('#555', 1.5, x + 15 - k, y - 31, x + 12 - k, y - 31); // Specht
  if (t.ripe) for (let i = 0; i < 3; i++) { ctx.fillStyle = '#a8743a'; ctx.fillRect(x - 40, y - 2 - i * 5, 22, 5); ellipse(x - 40, y + 0.5 - i * 5, 2.5, 2.5, '#d8b07a'); }
  if (t.store > 0) crate(x + 50, y + 4, '#a8743a', Math.min(t.store, 12));
};
DRAW.quelle = (x, y, t) => { // Wasser sprudelt aus dem Fels in einen Holztrog, ein Frosch badet
  const g = grown(t);
  ellipse(x, y, 66, 10, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.moveTo(x - 64, y); ctx.lineTo(x - 52, y - 40); ctx.lineTo(x - 30, y - 50); ctx.lineTo(x - 12, y - 34); ctx.lineTo(x - 4, y); ctx.fill();
  ctx.fillStyle = '#6a655c'; ctx.beginPath(); ctx.arc(x - 26, y - 26, 6, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(140,200,240,.9)'; ctx.lineWidth = 2 + g * 3; ctx.beginPath(); ctx.moveTo(x - 22, y - 26); ctx.quadraticCurveTo(x + 2, y - 28, x + 8, y - 14); ctx.stroke();
  for (let i = 0; i < 3; i++) { const k = (time * 2 + i / 3) % 1; ellipse(x + 8 + Math.sin(i * 3) * 3, y - 14 + k * 6, 1.5, 1.5, `rgba(255,255,255,${1 - k})`); }
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 4, y - 14, 50, 14); ctx.fillStyle = 'rgba(110,180,230,.95)'; ctx.fillRect(x - 1, y - 12, 44, 3);
  const j = Math.max(0, Math.sin(time * 1.2 + t.id)) * 10; ellipse(x + 30, y - 14 - j, 5, 3.5, '#4f9a36'); ellipse(x + 28, y - 17 - j, 1.4, 1.4, '#fff'); ellipse(x + 32, y - 17 - j, 1.4, 1.4, '#fff'); // Frosch hüpft
  if (t.store > 0) crate(x + 80, y + 4, '#8ac8f0', Math.min(t.store, 12));
};
function stdHouse(x, y, t, wall, roof, dc) { house(x - 16, y, 98, 58, wall, roof, 24); win(x - 54, y - 44, 18, 14, t.working); win(x + 8, y - 44, 18, 14, t.working); door(x - 22, y, 18, 30, dc); }
DRAW.shakebar = (x, y, t) => { // Riesenglas mit Röhrli auf dem Dach – es wird geschlürft, bis es leer ist
  stdHouse(x, y, t, '#fdeef2', '#e8708a'); const cx = x - 16, cy = y - 84, lv = t.working ? 0.3 + 0.7 * (1 - (phase(t) / 6.28 % 1)) : 1;
  ctx.fillStyle = 'rgba(220,235,245,.8)'; ctx.fillRect(cx - 12, cy - 32, 24, 32); ctx.fillStyle = '#f2a0b8'; ctx.fillRect(cx - 11, cy - 31 * lv, 22, 31 * lv); ellipse(cx, cy - 31 * lv, 11, 3, '#fbe0e8');
  line('#e83a5a', 3, cx + 4, cy - 10, cx + 10, cy - 46, cx + 18, cy - 46); ellipse(cx - 6, cy - 33, 5, 4, '#e8283a');
  sign(x - 16, y - 64, bname(t));
};
DRAW.toertlibeck = (x, y, t) => { // Riesentörtli auf dem Dach, eine Wespe kreist
  stdHouse(x, y, t, '#fbf2e4', '#c8433a'); const cx = x - 16, cy = y - 86;
  ctx.fillStyle = '#d8a050'; ctx.beginPath(); ctx.moveTo(cx - 22, cy - 8); ctx.lineTo(cx + 22, cy - 8); ctx.lineTo(cx + 16, cy + 4); ctx.lineTo(cx - 16, cy + 4); ctx.fill();
  ellipse(cx, cy - 8, 22, 5, '#f8e8a8'); for (let i = 0; i < 5; i++) { ellipse(cx - 14 + i * 7, cy - 11 - (i % 2) * 2, 4, 4.5, '#e8283a'); ellipse(cx - 15 + i * 7, cy - 13 - (i % 2) * 2, 1.2, 1.2, 'rgba(255,255,255,.7)'); }
  const a = time * 3 + t.id, bx = cx + Math.cos(a) * 26, by = cy - 20 + Math.sin(a * 2) * 5; ellipse(bx, by, 3, 2, '#f2c21e'); line('#222', 1, bx - 1, by - 2, bx - 1, by + 2); ellipse(bx, by - 2.5, 2, 1.4, 'rgba(255,255,255,.85)');
  sign(x - 16, y - 64, bname(t));
};
DRAW.spinnerei = (x, y, t) => { // Spinnrad auf dem Dach dreht sich; ein Schaf schaut, wo seine Wolle hin ist
  stdHouse(x, y, t, '#f2e8d8', '#7a5a8a'); const cx = x - 20, cy = y - 100, a = phase(t) * 3;
  ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 15, 0, 7); ctx.stroke(); ctx.lineWidth = 1.5; ctx.beginPath();
  for (let i = 0; i < 6; i++) { ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a + i) * 15, cy + Math.sin(a + i) * 15); } ctx.stroke();
  line('#8a5a30', 3, cx - 8, cy + 16, cx, cy, cx + 8, cy + 16); line('#c8a8e0', 2, cx + 15, cy, cx + 30, cy - 6); ellipse(cx + 32, cy - 6, 5, 4, '#c8a8e0');
  sheep(x + 52, y + 2, time * 3 + t.id);
  sign(x - 16, y - 64, bname(t));
};
DRAW.strickstube = (x, y, t) => { // Riesen-Zipfelchappe auf dem Dach, der Bommel wackelt
  stdHouse(x, y, t, '#f6efe4', '#3a6fd8'); const cx = x - 16, cy = y - 84, w = Math.sin(time * 2 + t.id) * 6;
  ctx.fillStyle = '#d8232a'; ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.quadraticCurveTo(cx - 6, cy - 30, cx + 14 + w, cy - 36); ctx.quadraticCurveTo(cx + 6, cy - 18, cx + 20, cy); ctx.fill();
  ctx.fillStyle = '#f2f2f2'; ctx.fillRect(cx - 21, cy - 5, 42, 6); for (let i = 0; i < 4; i++) ctx.fillRect(cx - 14 + i * 8, cy - 14 - i * 3, 5, 2);
  ellipse(cx + 15 + w, cy - 38, 6, 6, '#f2f2f2');
  if (t.working) { const k = Math.sin(phase(t) * 4) * 4; line('#c8c8c8', 2, x + 46, y - 30, x + 60 + k, y - 12); line('#c8c8c8', 2, x + 62, y - 30, x + 48 - k, y - 12); ellipse(x + 54, y - 10, 7, 4, '#d8232a'); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.popcornmaschine = (x, y, t) => { // der Kamin poppt Popcorn statt Rauch
  house(x - 16, y, 104, 62, '#fbe8a0', '#d8232a', 22); win(x - 58, y - 48, 18, 14, t.working); win(x - 30, y - 48, 18, 14, t.working); door(x + 12, y, 20, 32, '#c8102e');
  for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#d8232a' : '#fff'; ctx.fillRect(x - 66 + i * 17, y - 62, 17, 6); } // Streifen-Markise
  chimney(x + 22, y - 72, 26, false);
  if (t.working) for (let i = 0; i < 7; i++) { const k = (time * 0.8 + i / 7) % 1, px = x + 22 + Math.sin(i * 2.3) * k * 30, py = y - 100 - Math.sin(k * Math.PI) * 30 + k * 20; ellipse(px, py, 4, 3.5, '#fffbe8'); ellipse(px + 2, py - 2, 2.5, 2, '#f8e8a8'); }
  sign(x - 16, y - 70, bname(t));
};
DRAW.polentagrotto = (x, y, t) => { // Steinhütte, davor rührt einer im Kupferkessi – stundenlang
  ellipse(x - 8, y, 62, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#9a958c'; ctx.fillRect(x - 64, y - 56, 92, 56); bricks(x - 64, y - 56, 92, 56);
  ctx.fillStyle = '#6a655c'; ctx.beginPath(); ctx.moveTo(x - 72, y - 54); ctx.lineTo(x - 18, y - 82); ctx.lineTo(x + 36, y - 54); ctx.fill();
  win(x - 52, y - 44, 16, 14, t.working); door(x - 6, y, 18, 32, '#5a3a20');
  line('#3a3a3a', 2, x + 42, y, x + 52, y - 34, x + 62, y); line('#3a3a3a', 2, x + 52, y - 34, x + 52, y - 24);
  ctx.fillStyle = '#c8743a'; ctx.beginPath(); ctx.arc(x + 52, y - 20, 10, 0, Math.PI); ctx.fill(); ellipse(x + 52, y - 20, 10, 3, '#f2cf3b');
  if (t.working) { flames(x + 52, y + 4, 3, 6); const k = phase(t); line('#6b4423', 2, x + 52 + Math.cos(k * 2) * 5, y - 21, x + 66, y - 40); person(x + 74, y + 2, '#2f6a3a', '#3a2a1a', -1.1 + Math.sin(k * 2) * 0.2); }
  sign(x - 18, y - 66, bname(t));
};
DRAW.zaeltlifabrik = (x, y, t) => { // Riesenbonbon im Papierli dreht sich auf dem Dach
  stdHouse(x, y, t, '#f8f4e0', '#e8b02e'); const cx = x - 16, cy = y - 96, a = t.working ? Math.sin(phase(t)) * 0.4 : 0;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(a);
  ctx.fillStyle = '#f2e070'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-28, -9); ctx.lineTo(-28, 9); ctx.fill(); ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(28, -9); ctx.lineTo(28, 9); ctx.fill();
  ellipse(0, 0, 15, 11, '#e8c02a'); ctx.fillStyle = '#4f8a36'; ctx.font = 'bold 9px system-ui'; ctx.textAlign = 'center'; ctx.fillText('🌿', 0, 3); ctx.restore();
  if (t.working) puffs(x + 40, y - 70, true, '220,255,220', 0.5);
  sign(x - 16, y - 64, bname(t));
};
DRAW.teestube = (x, y, t) => { // Riesen-Teekanne auf dem Dach dampft, Grossmutter im Schaukelstuhl
  stdHouse(x, y, t, '#f2ece0', '#4f8a5a'); const cx = x - 16, cy = y - 96;
  ellipse(cx, cy, 18, 14, '#e8e4dc'); ctx.fillStyle = '#4f8a5a'; ctx.fillRect(cx - 18, cy - 2, 36, 4); ellipse(cx, cy - 14, 6, 3, '#e8e4dc'); ellipse(cx, cy - 17, 2.5, 2.5, '#4f8a5a');
  line('#e8e4dc', 4, cx + 16, cy + 2, cx + 28, cy - 8); line('#e8e4dc', 3, cx - 17, cy - 6, cx - 24, cy, cx - 17, cy + 6); puffs(cx + 28, cy - 10, t.working, '255,255,255', 0.5);
  const r = Math.sin(time * 1.5 + t.id) * 0.15; ctx.save(); ctx.translate(x + 54, y); ctx.rotate(r); ctx.strokeStyle = '#8a5a30'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -4, 12, 0.3, Math.PI - 0.3); ctx.stroke(); line('#8a5a30', 2, 8, -6, 10, -26); ctx.restore();
  person(x + 52, y - 4, '#8a4a8a', '#d8d8d8', -0.2);
  sign(x - 16, y - 64, bname(t));
};
DRAW.saegerei = (x, y, t) => { // Wasserrad treibt die Säge, die geht auf und ab
  house(x - 24, y, 92, 54, '#b08a5a', '#6b4a2b', 22); win(x - 60, y - 42, 16, 12, t.working); door(x - 18, y, 22, 30, '#5a3a20');
  const a = phase(t) * 2; ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x + 34, y - 24, 20, 0, 7); ctx.stroke(); ctx.lineWidth = 4; ctx.beginPath();
  for (let i = 0; i < 8; i++) { const c = Math.cos(a + i * 0.785), s = Math.sin(a + i * 0.785); ctx.moveTo(x + 34 + c * 8, y - 24 + s * 8); ctx.lineTo(x + 34 + c * 24, y - 24 + s * 24); } ctx.stroke();
  ctx.fillStyle = 'rgba(110,180,230,.8)'; ctx.fillRect(x + 14, y - 4, 44, 5);
  ctx.fillStyle = '#a8743a'; ctx.fillRect(x - 64, y - 86, 76, 10); ellipse(x + 12, y - 81, 3, 5, '#d8b07a');
  const k = t.working ? Math.sin(a * 2) * 6 : 0; ctx.fillStyle = '#c8ccd0'; ctx.fillRect(x - 26, y - 104 + k, 3, 24); // Sägeblatt
  if (t.working) for (let i = 0; i < 4; i++) { const s = (time * 2 + i / 4) % 1; ellipse(x - 24 + s * 10, y - 74 + s * 16, 1.5, 1.5, '#e8c890'); }
  sign(x - 24, y - 64, bname(t));
};
DRAW.schreinerei = (x, y, t) => { // Riesen-Holzchüeli auf dem Dach schaukelt, die Glocke bimmelt
  stdHouse(x, y, t, '#e8d4b0', '#8a5a30'); const cx = x - 16, cy = y - 88, r = Math.sin(time * 2 + t.id) * 0.12;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(r);
  ctx.strokeStyle = '#6b4423'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -40, 42, Math.PI * 0.35, Math.PI * 0.65); ctx.stroke(); // Schaukelkufe
  ctx.fillStyle = '#b07a42'; ctx.fillRect(-18, -24, 34, 14); ctx.fillRect(14, -32, 12, 12); for (const lx of [-16, -8, 6, 12]) ctx.fillRect(lx, -10, 4, 10);
  ellipse(-6, -18, 5, 4, '#f4ead6'); ellipse(8, -19, 4, 3, '#f4ead6'); ellipse(22, -34, 2, 2, '#f4ead6'); line('#e8c35a', 2, 22, -32, 25, -36);
  ellipse(18, -18, 3, 3, '#e8b02e'); ctx.restore();
  sign(x - 16, y - 64, bname(t));
};
DRAW.suppenchuchi = (x, y, t) => { // Riesenkessel auf dem Dach, eine Kelle rührt die orange Suppe
  stdHouse(x, y, t, '#fbf0e0', '#d8701e'); const cx = x - 16, cy = y - 88;
  ctx.fillStyle = '#5a5a5a'; ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI); ctx.fill(); ellipse(cx, cy, 20, 5, '#f28a1e'); ellipse(cx + 4, cy, 6, 1.6, '#fff8e8');
  const k = t.working ? phase(t) * 2 : 0; line('#8a5a30', 3, cx + Math.cos(k) * 10, cy, cx + 6 + Math.cos(k) * 4, cy - 24); puffs(cx, cy - 6, t.working, '255,240,220', 0.6);
  sign(x - 16, y - 64, bname(t));
};
DRAW.schnitzerei = (x, y, t) => { // leuchtende Kürbis-Gesichter auf dem Fensterbrett – eines streckt die Zunge raus
  stdHouse(x, y, t, '#3f3a4a', '#2a2532', '#5a3a20');
  for (let i = 0; i < 3; i++) { const px = x - 50 + i * 22, py = y - 92, f = 0.7 + Math.sin(time * 9 + i * 2) * 0.2;
    ellipse(px, py, 10, 8, '#f28a1e'); ctx.fillStyle = `rgba(255,220,80,${f})`; ctx.fillRect(px - 5, py - 3, 3, 3); ctx.fillRect(px + 2, py - 3, 3, 3); ctx.fillRect(px - 4, py + 2, 8, 2);
    if (i === 1) ellipse(px, py + 5, 2, 2.5, '#e8505a'); line('#4a6a2a', 2, px, py - 8, px + 2, py - 12); }
  if (t.working) { const k = phase(t); person(x + 50, y + 4, '#4f6f5a', 0, -0.3 + Math.sin(k * 4) * 0.3); ellipse(x + 66, y - 12, 8, 7, '#f28a1e'); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.sprudelei = (x, y, t) => { // Riesenflasche auf dem Dach, die Blöterli steigen und der Deckel hüpft
  stdHouse(x, y, t, '#e8f2f8', '#3a7ab8'); const cx = x - 16, cy = y - 82, j = t.working ? Math.abs(Math.sin(phase(t) * 3)) * 6 : 0;
  ctx.fillStyle = 'rgba(160,210,240,.85)'; rrect(cx - 10, cy - 34, 20, 34, 5); ctx.fill(); ctx.fillRect(cx - 4, cy - 44, 8, 12); ctx.fillStyle = '#d8232a'; ctx.fillRect(cx - 5, cy - 48 - j, 10, 5);
  ctx.fillStyle = '#fff'; ctx.fillRect(cx - 10, cy - 22, 20, 8);
  for (let i = 0; i < 5; i++) { const k = (time * 0.8 + i / 5) % 1; ellipse(cx - 6 + (i * 5 % 12), cy - 4 - k * 28, 1.5, 1.5, 'rgba(255,255,255,.9)'); }
  if (t.working) for (let i = 0; i < 3; i++) { const k = (time + i / 3) % 1; ellipse(cx + Math.sin(i * 2) * 6, cy - 52 - k * 20, 2, 2, `rgba(200,235,255,${1 - k})`); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.sirupkueche = (x, y, t) => { // Sirupflasche und Glas auf dem Dach, Röhrli blubbert
  stdHouse(x, y, t, '#fdf0ec', '#c8102e'); const cx = x - 26, cy = y - 84;
  ctx.fillStyle = '#c8102e'; rrect(cx - 8, cy - 30, 16, 30, 4); ctx.fill(); ctx.fillRect(cx - 3, cy - 38, 6, 9); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 8, cy - 18, 16, 7); ellipse(cx, cy - 14, 2.5, 2.5, '#e8283a');
  ctx.fillStyle = 'rgba(220,235,245,.85)'; ctx.fillRect(cx + 16, cy - 20, 14, 20); ctx.fillStyle = '#f2708a'; ctx.fillRect(cx + 17, cy - 15, 12, 14); line('#3a9a5a', 2, cx + 24, cy - 10, cx + 30, cy - 30);
  if (t.working) for (let i = 0; i < 3; i++) { const k = (time * 1.4 + i / 3) % 1; ellipse(cx + 20 + i * 3, cy - 4 - k * 10, 1.4, 1.4, 'rgba(255,255,255,.9)'); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.jubilaeumsbeck = (x, y, t) => { // drei Stockwerke Torte, 100 Kerzen (na ja, fast) und Feuerwerk
  stdHouse(x, y, t, '#fff4f8', '#b84a9a', '#8a2a6a'); const cx = x - 16, cy = y - 82;
  for (const [w, h, c, dy] of [[46, 12, '#7a4a2a', 0], [34, 11, '#f2a0b8', 12], [22, 10, '#fbf4e8', 23]]) { ctx.fillStyle = c; ctx.fillRect(cx - w / 2, cy - dy - h, w, h); ellipse(cx, cy - dy - h, w / 2, 2.5, '#fff'); }
  for (let i = 0; i < 5; i++) { const px = cx - 8 + i * 4; ctx.fillStyle = ['#e8483b', '#3a6fd8', '#f2cf3b', '#2f8f4e', '#e870b0'][i]; ctx.fillRect(px - 1, cy - 44, 2, 8); ellipse(px, cy - 46 - Math.abs(Math.sin(time * 10 + i)) * 1.5, 1.6, 2.6, '#ffb02e'); }
  const f = (time * 0.5 + t.id * 0.3) % 1; if (f < 0.4) { const r = f * 60, fx = x + 40, fy = y - 110; for (let i = 0; i < 10; i++) ellipse(fx + Math.cos(i * 0.63) * r, fy + Math.sin(i * 0.63) * r, 1.8, 1.8, `hsla(${i * 36},90%,60%,${1 - f * 2.5})`); }
  sign(x - 16, y - 64, bname(t));
};
DRAW.default = (x, y, t) => { const d = THINGS[t.type]; house(x, y, 104, 60, '#e8dcc4', '#8a5a3a'); win(x - 40, y - 44, 20, 16, t.working); door(x + 10, y, 18, 30); sign(x, y - 68, d.name.toUpperCase() + ' ' + d.icon); };
const HGT = { erdbeerfeld: 40, kraeuterbeet: 40, kuerbisfeld: 40, maisfeld: 80, schaf: 56, wald: 110, quelle: 56, shakebar: 136, toertlibeck: 114, spinnerei: 124, strickstube: 128, popcornmaschine: 130, polentagrotto: 92, zaeltlifabrik: 112, teestube: 118, saegerei: 106, schreinerei: 132, suppenchuchi: 116, schnitzerei: 108, sprudelei: 136, sirupkueche: 126, jubilaeumsbeck: 132, geiss: 60, ruebenfeld: 40, kirschbaum: 106, geisskaeserei: 110, chaeschueechli_beck: 112, zuckerfabrik: 104, taefeli_kueche: 110, nougat_kueche: 124, konfiserie: 104, kirschtorte_beck: 118, bienenhaus: 66, kartoffelfeld: 40, kastanienbaum: 106, laeckerli_huus: 118, biberbeck: 124, roestibeiz: 118, raclettestube: 122, chipsfabrik: 120, marronistand: 92, vermicelles_kueche: 128, gelateria: 130, sennhuette: 96, gruyerestube: 136, maelzerei: 128, malzfabrik: 120, schoggistube: 122, meringuerie: 128, tortenmeister: 156, schoggifabrik: 110, doerrhaus: 122, kafistube: 118, schneckenbeck: 122, zopfbeck: 116, keksbaeckerei: 122, saftpresse: 124, schoggikonditorei: 124, kaffeeroesterei: 116, rebe: 62, fischteich: 50, huhn: 70, masthuhn: 70, schwein: 60, kakaoimport: 80, kaffeeimport: 80, fonduestube: 105, hof: 112, haendler: 110, laden: 130, muehle: 170, baeckerei: 115, molkerei: 110, kaeserei: 110, konditorei: 110, baum: 92, kuh: 50, feld: 1.5 * T + 8 };
// ===== Geschäftszentren (AREAS mit hub): Pflasterplatz, ein Hausstil je Zentrum, eigene Bilder für die Rohstoff-Quellen =====
function drawHub(s) { // flach unter allem: Pflaster mit Randstein, Bäumchen in den oberen Ecken, Fahne
  const x0 = (s.x - s.w / 2) * T, y0 = (s.y - s.h) * T, W = s.w * T, H = (s.h + 0.7) * T, g = s.hub.ground;
  ctx.fillStyle = shade(g, 1.18); rrect(x0 - 5, y0 - 5, W + 10, H + 10, 16); ctx.fill();
  ctx.fillStyle = g; rrect(x0, y0, W, H, 12); ctx.fill();
  ctx.strokeStyle = shade(g, 0.9); ctx.lineWidth = 1; ctx.beginPath();
  for (let x = x0 + 24; x < x0 + W; x += 24) { ctx.moveTo(x, y0 + 4); ctx.lineTo(x, y0 + H - 4); }
  for (let y = y0 + 24; y < y0 + H; y += 24) { ctx.moveTo(x0 + 4, y); ctx.lineTo(x0 + W - 4, y); }
  ctx.stroke();
  for (const bx of [x0 + 16, x0 + W - 16]) { ellipse(bx, y0 + 22, 12, 4, 'rgba(0,0,0,.2)'); ctx.fillStyle = '#6b4a2b'; ctx.fillRect(bx - 2, y0 + 8, 4, 14); ellipse(bx, y0 + 4, 12, 11, '#3f8a3a'); }
  flagPole(x0 + 14, y0 + H - 6, 70, 18, s.x);
}
function emblem(x, y, t, sz = 22) { // Produkt thront auf dem Dach und hüpft, solange gearbeitet wird
  const j = t.working ? Math.abs(Math.sin(time * 4 + t.id)) * 4 : 0;
  ctx.font = `${sz}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(ITEMS[THINGS[t.type].item].icon, x, y - j);
}
const BIZ = {
  industrie(x, y, t) { // Backstein-Halle mit Sheddach (Glas zeigt nach Norden) und rauchendem Kamin
    ellipse(x + 6, y, 62, 10, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#a5523a'; ctx.fillRect(x - 56, y - 50, 112, 50);
    ctx.strokeStyle = 'rgba(60,20,10,.25)'; ctx.lineWidth = 1; ctx.beginPath(); for (let yy = y - 44; yy < y; yy += 6) { ctx.moveTo(x - 56, yy); ctx.lineTo(x + 56, yy); } ctx.stroke();
    for (let i = 0; i < 4; i++) { const a = x - 56 + i * 28; ctx.fillStyle = '#bfe0f5'; ctx.fillRect(a, y - 68, 4, 18); ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.moveTo(a + 4, y - 68); ctx.lineTo(a + 28, y - 50); ctx.lineTo(a + 4, y - 50); ctx.fill(); }
    for (const wx of [-46, -22, 2]) win(x + wx, y - 40, 16, 18, t.working);
    ctx.fillStyle = '#5a5f66'; ctx.fillRect(x + 24, y - 28, 24, 28); // Rolltor
    ctx.fillStyle = '#7a3a28'; ctx.fillRect(x + 36, y - 104, 12, 36); ctx.fillStyle = '#e8e2d0'; ctx.fillRect(x + 36, y - 98, 12, 3);
    if (t.working) for (let i = 0; i < 3; i++) { const k = (time * 0.6 + i / 3) % 1; ellipse(x + 42 + k * 14, y - 108 - k * 30, 5 + k * 8, 4 + k * 6, `rgba(210,210,210,${0.6 * (1 - k)})`); }
    emblem(x - 16, y - 76, t); sign(x - 4, y - 58, bname(t));
  },
  uhrental(x, y, t) { // Uhrmacherhaus aus dem Jura: lange Fensterbänder, weil man für winzige Teile viel Licht braucht
    house(x, y, 104, 62, '#f2ede0', '#4a4a52', 26);
    for (const r of [y - 54, y - 34]) for (let i = 0; i < 7; i++) { ctx.fillStyle = '#5b5048'; ctx.fillRect(x - 50 + i * 14, r - 1, 13, 15); ctx.fillStyle = t.working ? '#ffe3a0' : '#bfe0f5'; ctx.fillRect(x - 49 + i * 14, r, 11, 13); }
    door(x, y, 16, 18, '#3a4a6a');
    const cx = x, cy = y - 80, a = time * 0.6 + t.id; // Uhr am Giebel – der Sekundenzeiger läuft
    ellipse(cx, cy, 10, 10, '#fff'); ctx.strokeStyle = '#333'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, 10, 0, 7); ctx.stroke();
    line('#222', 2, cx, cy, cx + Math.sin(a / 12) * 5, cy - Math.cos(a / 12) * 5); line('#c8102e', 1.2, cx, cy, cx + Math.sin(a) * 8, cy - Math.cos(a) * 8);
    emblem(x + 44, y - 94, t, 18); sign(x, y - 66, bname(t));
  },
  bankenplatz(x, y, t) { // Bank mit Säulen und Giebel wie am Paradeplatz
    ellipse(x + 6, y, 62, 9, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#cfc8b8'; ctx.fillRect(x - 56, y - 8, 112, 8); ctx.fillStyle = '#e2dccd'; ctx.fillRect(x - 50, y - 60, 100, 52);
    ctx.fillStyle = '#f4efe2'; for (const cx of [-44, -26, 18, 36]) { ctx.fillRect(x + cx, y - 56, 8, 48); ctx.fillRect(x + cx - 2, y - 58, 12, 4); }
    ctx.fillStyle = '#c8c0ae'; ctx.beginPath(); ctx.moveTo(x - 58, y - 60); ctx.lineTo(x, y - 84); ctx.lineTo(x + 58, y - 60); ctx.fill();
    door(x, y - 8, 20, 30, '#4a3a28'); ellipse(x, y - 39, 10, 4, '#4a3a28');
    emblem(x, y - 88, t, 20); sign(x, y - 66, bname(t));
  },
  pharma(x, y, t) { // weisses Labor und ein Turm, der oben in Stufen schmaler wird
    ellipse(x + 6, y, 62, 9, 'rgba(0,0,0,.2)');
    ctx.fillStyle = '#f4f6f4'; ctx.fillRect(x - 56, y - 44, 72, 44); ctx.fillRect(x + 16, y - 80, 38, 80); ctx.fillRect(x + 16, y - 92, 30, 12); ctx.fillRect(x + 16, y - 102, 22, 10);
    ctx.fillStyle = t.working ? '#ffe3a0' : '#9cc4d8'; for (let yy = y - 76; yy < y - 4; yy += 9) ctx.fillRect(x + 19, yy, 32, 4); ctx.fillRect(x - 52, y - 34, 64, 8); ctx.fillRect(x - 52, y - 20, 64, 8);
    ctx.fillStyle = '#2f9a4e'; ctx.fillRect(x - 47, y - 56, 12, 4); ctx.fillRect(x - 43, y - 60, 4, 12); // grünes Apotheken-Kreuz
    emblem(x - 14, y - 52, t); sign(x - 20, y - 48, bname(t));
  },
  technopark(x, y, t) { // Glaswürfel mit Antenne, das rote Licht blinkt
    ellipse(x + 6, y, 60, 9, 'rgba(0,0,0,.2)');
    const g = ctx.createLinearGradient(x - 50, y - 64, x + 50, y); g.addColorStop(0, '#a8d6f0'); g.addColorStop(1, '#3a6f9a');
    ctx.fillStyle = g; ctx.fillRect(x - 50, y - 64, 100, 64);
    if (t.working) { ctx.fillStyle = 'rgba(255,230,150,.35)'; ctx.fillRect(x - 50, y - 64 + ((time * 30) % 64), 100, 6); }
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = 1; i < 5; i++) { ctx.moveTo(x - 50 + i * 20, y - 64); ctx.lineTo(x - 50 + i * 20, y); } for (let j = 1; j < 4; j++) { ctx.moveTo(x - 50, y - j * 16); ctx.lineTo(x + 50, y - j * 16); } ctx.stroke();
    ctx.fillStyle = '#3a4048'; ctx.fillRect(x - 54, y - 68, 108, 5);
    line('#555', 2, x + 36, y - 68, x + 36, y - 94); ellipse(x + 36, y - 95, 2.5, 2.5, Math.sin(time * 5) > 0 ? '#ff3a2e' : '#7a1a14');
    emblem(x - 10, y - 76, t); sign(x, y - 50, bname(t));
  },
  kicampus(x, y, t) { // dunkles Glas mit leuchtenden Leiterbahnen – sie pulsieren, wenn die KI rechnet
    ellipse(x + 6, y, 60, 9, 'rgba(0,0,0,.25)');
    ctx.fillStyle = '#23283a'; rrect(x - 52, y - 66, 104, 66, 10); ctx.fill();
    const p = t.working ? 0.5 + 0.5 * Math.sin(time * 4 + t.id) : 0.15, neon = `rgba(90,220,255,${0.35 + 0.65 * p})`;
    ctx.strokeStyle = neon; ctx.lineWidth = 2; rrect(x - 52, y - 66, 104, 66, 10); ctx.stroke();
    for (let i = 0; i < 5; i++) { const bx = x - 42 + i * 21, by = y - 30 - (i % 2) * 14; line(neon, 1.5, bx, y - 4, bx, by, bx + 9, by - 9); ellipse(bx + 9, by - 9, 2.4, 2.4, neon); }
    emblem(x, y - 74, t); sign(x, y - 52, bname(t));
  },
  skiort(x, y, t) { // Holz-Chalet mit Schnee auf dem Dach und Eiszapfen
    house(x, y, 100, 50, '#9a6a3e', '#7a4a2a', 30);
    ctx.fillStyle = '#fbfdff'; ctx.beginPath(); ctx.moveTo(x - 62, y - 46); ctx.lineTo(x + 62, y - 46); ctx.lineTo(x + 46, y - 82); ctx.lineTo(x - 46, y - 82); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#dfeaf5'; for (let i = 0; i < 9; i++) { const ix = x - 56 + i * 14; ctx.beginPath(); ctx.moveTo(ix, y - 46); ctx.lineTo(ix + 5, y - 46); ctx.lineTo(ix + 2.5, y - 38 - (i % 3) * 3); ctx.fill(); } // Eiszapfen
    for (const wx of [-40, 22]) win(x + wx, y - 36, 18, 16, t.working); door(x, y, 18, 30, '#5a3a1e');
    emblem(x, y - 90, t); sign(x, y - 60, bname(t));
  },
  raumfahrt(x, y, t) { // Montagehalle mit grossem Tor und Kuppel, auf dem Dach eine Schüssel-Antenne
    ellipse(x + 6, y, 62, 9, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#e8eaee'; ctx.fillRect(x - 56, y - 58, 112, 58); ctx.fillStyle = '#c8ccd4'; ctx.fillRect(x - 56, y - 62, 112, 6);
    ctx.fillStyle = '#3a4a6a'; ctx.fillRect(x - 20, y - 50, 40, 50); ctx.fillStyle = '#5a6a8a'; for (let yy = y - 46; yy < y; yy += 8) ctx.fillRect(x - 18, yy, 36, 2); // Rolltor
    ctx.fillStyle = '#2a3a7a'; ctx.fillRect(x - 50, y - 46, 22, 6); ctx.fillRect(x + 28, y - 46, 22, 6); // blaue Streifen
    ctx.save(); ctx.translate(x + 38, y - 72); ctx.rotate(-0.5 + Math.sin(time * 0.4 + t.id) * 0.3); ctx.fillStyle = '#f4f4f4'; ctx.beginPath(); ctx.ellipse(0, 0, 13, 6, 0, 0, Math.PI); ctx.fill(); line('#888', 1.5, 0, 2, 0, -8); ctx.restore();
    line('#999', 2, x + 38, y - 62, x + 38, y - 70);
    emblem(x - 34, y - 70, t); sign(x, y - 60, bname(t));
  },
  forschung(x, y, t) { // runde Halle wie der Globus am CERN, aus Holzrippen
    ellipse(x + 6, y, 60, 9, 'rgba(0,0,0,.22)');
    ctx.fillStyle = '#8a5a30'; ctx.beginPath(); ctx.ellipse(x, y, 50, 64, 0, Math.PI, 0); ctx.fill();
    ctx.strokeStyle = '#6a4220'; ctx.lineWidth = 2; ctx.beginPath(); for (let i = -4; i <= 4; i++) { ctx.moveTo(x + i * 11, y); ctx.quadraticCurveTo(x + i * 6, y - 60, x, y - 64); } for (let j = 1; j < 4; j++) { ctx.moveTo(x - 50 * Math.sqrt(1 - (j / 4) ** 2), y - j * 16); ctx.lineTo(x + 50 * Math.sqrt(1 - (j / 4) ** 2), y - j * 16); } ctx.stroke();
    const p = t.working ? 0.5 + 0.5 * Math.sin(time * 5 + t.id) : 0; ctx.fillStyle = `rgba(90,180,255,${0.25 + 0.5 * p})`; ctx.beginPath(); ctx.ellipse(x, y - 4, 40, 6, 0, 0, 7); ctx.fill(); // Teilchen-Ring leuchtet
    door(x, y, 18, 24, '#3a2412');
    emblem(x, y - 72, t); sign(x, y - 44, bname(t));
  },
  kreislauf(x, y, t) { // Halle mit grünem Dach, Solarzellen und grossem Recycling-Pfeil
    house(x, y, 104, 52, '#e8eee0', '#3f8a3a', 26);
    ctx.fillStyle = '#24406b'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 44 + i * 22, y - 74, 18, 10); // Solarzellen
    ctx.save(); ctx.translate(x - 30, y - 28); ctx.rotate(t.working ? time * 1.5 : 0); ctx.strokeStyle = '#2f9a4e'; ctx.lineWidth = 4; for (let i = 0; i < 3; i++) { ctx.rotate(2.09); ctx.beginPath(); ctx.arc(0, 0, 12, 0.2, 1.7); ctx.stroke(); } ctx.restore();
    door(x + 22, y, 22, 30, '#4a6a3a'); win(x - 4, y - 40, 14, 14, t.working);
    emblem(x + 40, y - 88, t, 18); sign(x, y - 58, bname(t));
  },
  festplatz(x, y, t) { // gestreiftes Festzelt mit Wimpeln
    ellipse(x + 6, y, 62, 9, 'rgba(0,0,0,.22)');
    for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#f4f0e6' : '#d52b1e'; ctx.beginPath(); ctx.moveTo(x - 56 + i * 14, y); ctx.lineTo(x - 56 + i * 14, y - 36); ctx.lineTo(x, y - 82); ctx.lineTo(x - 42 + i * 14, y - 36); ctx.lineTo(x - 42 + i * 14, y); ctx.fill(); }
    ctx.fillStyle = '#3a2a1a'; ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x, y - 26); ctx.lineTo(x + 10, y); ctx.fill(); // Eingang
    const c = ['#f2c21a', '#2f6fc4', '#2f9a4e', '#d52b1e']; for (let i = 0; i < 8; i++) { const a = x - 56 + i * 14, h = Math.sin(time * 3 + i) * 1.5; ctx.fillStyle = c[i % 4]; ctx.beginPath(); ctx.moveTo(a, y - 36); ctx.lineTo(a + 14, y - 36); ctx.lineTo(a + 7, y - 28 + h); ctx.fill(); } // Wimpel
    line('#555', 2, x, y - 82, x, y - 96); ctx.fillStyle = '#d52b1e'; ctx.fillRect(x, y - 96, 12, 8);
    emblem(x - 30, y - 70, t, 18); sign(x, y - 46, bname(t));
  },
};
for (const [k, d] of Object.entries(THINGS)) if (AREAS[d.area].hub && d.kind === 'factory') DRAW[k] = BIZ[d.area];
const crateOf = (t, x, y, c) => { if (t.store > 0) crate(x, y, c, Math.min(t.store, 12)); };
DRAW.kraftwerk = (x, y, t) => { // Staumauer mit Stausee dahinter, unten das Maschinenhaus, daneben ein Strommast
  const g = grown(t);
  ellipse(x, y, 64, 10, 'rgba(0,0,0,.22)');
  ellipse(x, y - 56, 54, 10, '#3c7fb8'); ellipse(x - 12, y - 58, 26, 3, 'rgba(255,255,255,.3)');
  const gr = ctx.createLinearGradient(x - 50, 0, x + 50, 0); gr.addColorStop(0, '#d8d4cc'); gr.addColorStop(1, '#a8a49c');
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x - 56, y - 54); ctx.quadraticCurveTo(x, y - 44, x + 56, y - 54); ctx.lineTo(x + 44, y); ctx.lineTo(x - 44, y); ctx.fill();
  ctx.fillStyle = '#e8e4da'; ctx.fillRect(x - 14, y - 18, 28, 18); ctx.fillStyle = '#f2c21a'; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillText('⚡', x, y - 5);
  ctx.strokeStyle = 'rgba(140,200,240,.9)'; ctx.lineWidth = 2 + g * 3; ctx.beginPath(); ctx.moveTo(x + 18, y - 10); ctx.quadraticCurveTo(x + 30, y - 8, x + 34, y); ctx.stroke();
  line('#6a6e74', 2, x + 52, y, x + 58, y - 62, x + 64, y); line('#6a6e74', 2, x + 50, y - 46, x + 66, y - 46); line('#6a6e74', 1.5, x + 52, y - 30, x + 64, y - 30);
  crateOf(t, x - 60, y + 4, '#f2cf3b');
};
DRAW.bergwerk = (x, y, t) => { // Berg mit Stollen, das Grubenwägeli rollt heraus, sobald es voll ist
  const g = grown(t);
  ellipse(x, y, 64, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#8a8478'; ctx.beginPath(); ctx.moveTo(x - 64, y); ctx.quadraticCurveTo(x - 36, y - 86, x + 6, y - 72); ctx.quadraticCurveTo(x + 50, y - 62, x + 64, y); ctx.fill();
  ctx.fillStyle = '#1e1a16'; ctx.beginPath(); ctx.arc(x - 14, y, 18, Math.PI, 0); ctx.fill();
  line('#7a5230', 4, x - 33, y, x - 33, y - 20, x + 5, y - 20, x + 5, y);
  line('#6b4a2b', 2, x - 14, y + 2, x + 56, y + 2); line('#6b4a2b', 2, x - 14, y - 4, x + 56, y - 4);
  const cx = x - 14 + g * 48; ctx.fillStyle = '#5a5f66'; ctx.fillRect(cx - 10, y - 16, 20, 12); wheel(cx - 6, y - 3, 3); wheel(cx + 6, y - 3, 3);
  if (g > 0.5) for (let i = 0; i < 4; i++) ellipse(cx - 6 + i * 4, y - 17 - (i % 2) * 2, 3.5, 3, '#6a4a3a');
  crateOf(t, x + 70, y + 4, '#6a4a3a');
};
DRAW.goldwaschplatz = (x, y, t) => { // Bach mit Waschrinne, das Gold glitzert in der Pfanne
  const g = grown(t);
  ctx.strokeStyle = '#5a9ad0'; ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x - 64, y - 10); ctx.quadraticCurveTo(x - 10, y - 30, x + 20, y - 4); ctx.quadraticCurveTo(x + 40, y + 10, x + 64, y + 2); ctx.stroke();
  ctx.fillStyle = '#8a5a30'; ctx.fillRect(x - 30, y - 30, 40, 9); ctx.fillStyle = '#c8a06a'; ctx.fillRect(x - 28, y - 28, 36, 5);
  ellipse(x + 30, y - 14, 14, 5, '#3a3a3a'); ellipse(x + 30, y - 15, 11, 3.5, '#c8a06a');
  for (let i = 0; i < 6; i++) if (i < g * 6) { const tw = Math.sin(time * 6 + i * 2) > 0.3; ellipse(x + 24 + (i * 7 % 12), y - 15 + (i % 2), tw ? 2 : 1.2, tw ? 2 : 1.2, '#ffd23a'); }
  crateOf(t, x - 56, y + 8, '#ffd23a');
};
DRAW.rubinofen = (x, y, t) => { // Backsteinofen, im Fenster glüht die Flamme; rote Steine wachsen
  const g = grown(t);
  ellipse(x, y, 46, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#b0503a'; ctx.beginPath(); ctx.moveTo(x - 40, y); ctx.lineTo(x - 40, y - 34); ctx.quadraticCurveTo(x, y - 70, x + 40, y - 34); ctx.lineTo(x + 40, y); ctx.fill();
  ctx.fillStyle = '#7a3a28'; ctx.fillRect(x + 14, y - 74, 10, 24);
  const f = 0.6 + 0.4 * Math.sin(time * 9 + t.id); ctx.fillStyle = `rgba(255,${120 + f * 80},40,1)`; ctx.beginPath(); ctx.arc(x, y - 16, 12, Math.PI, 0); ctx.fill(); ctx.fillRect(x - 12, y - 16, 24, 16);
  for (let i = 0; i < 5; i++) if (i < g * 5) { ctx.fillStyle = '#d0102e'; ctx.beginPath(); const rx = x - 34 + i * 6, ry = y + 6; ctx.moveTo(rx, ry - 6); ctx.lineTo(rx + 3, ry); ctx.lineTo(rx, ry + 2); ctx.lineTo(rx - 3, ry); ctx.fill(); }
  crateOf(t, x + 54, y + 4, '#d0102e');
};
DRAW.bankschalter = (x, y, t) => { BIZ.bankenplatz(x, y, t); ctx.font = '18px system-ui'; ctx.fillText('🐷', x + 50, y - 2); crateOf(t, x - 66, y + 4, '#e8c35a'); };
DRAW.gewaechshaus = (x, y, t) => { // Glashaus mit Rundbogen, drinnen wachsen die Heilpflanzen
  const g = grown(t);
  ellipse(x, y, 60, 9, 'rgba(0,0,0,.2)');
  ctx.fillStyle = 'rgba(200,235,225,.55)'; ctx.beginPath(); ctx.moveTo(x - 54, y); ctx.lineTo(x - 54, y - 34); ctx.quadraticCurveTo(x, y - 76, x + 54, y - 34); ctx.lineTo(x + 54, y); ctx.fill();
  for (let i = 0; i < 7; i++) { const px = x - 44 + i * 15, h = 8 + g * 22 * (0.7 + (i % 3) * 0.15); line('#3f8a3a', 2, px, y - 2, px, y - h); ellipse(px - 4, y - h + 2, 5, 3, '#4fa04a'); ellipse(px + 4, y - h + 6, 5, 3, '#5cae4a'); if (g > 0.8) ellipse(px, y - h - 2, 2.5, 2.5, '#c88ae0'); }
  ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 54, y); ctx.lineTo(x - 54, y - 34); ctx.quadraticCurveTo(x, y - 76, x + 54, y - 34); ctx.lineTo(x + 54, y);
  for (let i = -2; i <= 2; i++) { ctx.moveTo(x + i * 18, y); ctx.lineTo(x + i * 18, y - 40 - (2 - Math.abs(i)) * 6); } ctx.stroke();
  crateOf(t, x + 68, y + 4, '#4fa04a');
};
DRAW.saline = (x, y, t) => { // Salzdom aus Holz, davor wächst der weisse Salzberg
  const g = grown(t);
  ellipse(x, y, 60, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#a8743a'; ctx.beginPath(); ctx.ellipse(x - 6, y, 48, 56, 0, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = '#7a5228'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = -3; i <= 3; i++) { ctx.moveTo(x - 6 + i * 14, y); ctx.quadraticCurveTo(x - 6 + i * 6, y - 50, x - 6, y - 56); } ctx.stroke();
  ctx.fillStyle = '#3a2412'; ctx.fillRect(x - 14, y - 22, 16, 22);
  ctx.fillStyle = '#f6f6f2'; ctx.beginPath(); ctx.moveTo(x + 22, y); ctx.lineTo(x + 38, y - 6 - g * 22); ctx.lineTo(x + 56, y); ctx.fill();
  crateOf(t, x - 62, y + 4, '#f6f6f2');
};
DRAW.quarzgrube = (x, y, t) => { // Sandgrube, ein kleiner Bagger schaufelt
  const g = grown(t), a = Math.sin(time * 1.5 + t.id) * 0.3;
  ellipse(x, y - 8, 62, 18, '#c8a86a'); ellipse(x, y - 6, 48, 12, '#e0c890');
  for (let i = 0; i < 8; i++) if (i < g * 8) ellipse(x - 30 + i * 8, y - 8 + (i % 2) * 3, 2, 2, '#9ad0f0');
  ctx.fillStyle = '#f2c21a'; ctx.fillRect(x + 20, y - 26, 24, 14); ctx.fillStyle = '#2a2a2a'; ctx.fillRect(x + 18, y - 12, 28, 6);
  ctx.save(); ctx.translate(x + 22, y - 22); ctx.rotate(-0.6 + a); ctx.fillStyle = '#e0a810'; ctx.fillRect(-34, -3, 34, 6); ctx.fillStyle = '#5a5f66'; ctx.fillRect(-40, -2, 8, 10); ctx.restore();
  crateOf(t, x - 60, y + 6, '#9ad0f0');
};
DRAW.solarpark = (x, y, t) => { // Reihen schräger Solarzellen, die Sonne blitzt darin
  const g = grown(t);
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    const px = x - 54 + i * 28 + r * 6, py = y - 26 + r * 22;
    line('#7a7e84', 2, px + 12, py + 2, px + 12, py + 10);
    ctx.fillStyle = '#2a4a8a'; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 24, py); ctx.lineTo(px + 20, py - 14); ctx.lineTo(px - 4, py - 14); ctx.fill();
    if (Math.sin(time * 2 + i + r * 2) > 0.85) ellipse(px + 10, py - 8, 6, 2, 'rgba(255,255,255,.7)');
  }
  ellipse(x + 50, y - 50, 6 + g * 4, 6 + g * 4, 'rgba(255,214,60,.85)');
  crateOf(t, x + 70, y + 6, '#f2cf3b');
};
DRAW.serverhalle = (x, y, t) => { // Bunker im Fels: Stahltür, daneben blinken die Server-Lämpchen
  ellipse(x, y, 62, 10, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#7a7468'; ctx.beginPath(); ctx.moveTo(x - 62, y); ctx.quadraticCurveTo(x - 30, y - 80, x + 10, y - 70); ctx.quadraticCurveTo(x + 50, y - 60, x + 62, y); ctx.fill();
  ellipse(x + 20, y - 62, 14, 5, '#3f8a3a');
  ctx.fillStyle = '#5a5f66'; ctx.fillRect(x - 40, y - 34, 30, 34); ctx.fillStyle = '#8a9098'; ctx.beginPath(); ctx.arc(x - 25, y - 17, 8, 0, 7); ctx.fill();
  ctx.fillStyle = '#1e222c'; ctx.fillRect(x, y - 36, 40, 36);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) { const on = Math.sin(time * (3 + c) + r * 7 + c * 3 + t.id) > 0; ellipse(x + 5 + c * 6, y - 31 + r * 7, 1.6, 1.6, on ? (c % 3 ? '#4fe06a' : '#5ad8ff') : '#2a3a2e'); }
  crateOf(t, x + 54, y + 4, '#5ad8ff');
};
Object.assign(HGT, { kraftwerk: 70, bergwerk: 84, goldwaschplatz: 40, rubinofen: 76, bankschalter: 96, gewaechshaus: 72, saline: 60, quarzgrube: 44, solarpark: 50, serverhalle: 76 });
DRAW.schneekanone = (x, y, t) => { // Schneekanone auf dem Hügel, sie sprüht Schnee, und der Schneehaufen wächst
  const g = grown(t);
  ellipse(x, y - 2, 60, 12, '#f4f8fc'); ctx.fillStyle = '#fbfdff'; ctx.beginPath(); ctx.moveTo(x - 50, y); ctx.lineTo(x - 26, y - 14 - g * 22); ctx.lineTo(x, y); ctx.fill();
  line('#666', 3, x + 20, y, x + 24, y - 30); ctx.save(); ctx.translate(x + 24, y - 32); ctx.rotate(-0.5); ctx.fillStyle = '#f2c21a'; ctx.fillRect(-26, -10, 30, 20); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(-26, 0, 9, 0, 7); ctx.fill(); ctx.restore();
  for (let i = 0; i < 10; i++) { const k = (time * 0.8 + i / 10) % 1; ellipse(x + 2 - k * 50, y - 46 - Math.sin(k * 3) * 20 + k * 30, 2, 2, `rgba(255,255,255,${1 - k})`); }
  crateOf(t, x + 56, y + 4, '#e8f2fa');
};
DRAW.sternwarte = (x, y, t) => { // weisse Kuppel mit offenem Spalt, das Fernrohr schwenkt; Sterne blinken darüber
  const g = grown(t);
  ellipse(x, y, 52, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#d8d4cc'; ctx.fillRect(x - 36, y - 34, 72, 34); ctx.fillStyle = '#f4f4f2'; ctx.beginPath(); ctx.arc(x, y - 34, 36, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#1e2a4a'; ctx.fillRect(x - 6, y - 70, 12, 36);
  ctx.save(); ctx.translate(x, y - 44); ctx.rotate(-1 + Math.sin(time * 0.3 + t.id) * 0.3); ctx.fillStyle = '#888'; ctx.fillRect(0, -3, 34, 6); ctx.restore();
  door(x - 20, y, 12, 20, '#5a5f66');
  for (let i = 0; i < 5; i++) if (i < g * 5) { const on = Math.sin(time * 3 + i * 2) > 0; ctx.font = `${on ? 12 : 9}px system-ui`; ctx.textAlign = 'center'; ctx.fillText('✦', x - 40 + i * 20, y - 82 - (i % 2) * 10); }
  crateOf(t, x + 56, y + 4, '#3a3a7a');
};
DRAW.protonenquelle = (x, y, t) => { // rote Wasserstoff-Flasche, ein Rohr führt in den Tunnel; Lichtpunkte flitzen hinein
  const g = grown(t);
  ellipse(x, y, 56, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#c8102e'; rrect(x - 40, y - 54, 20, 54, 9); ctx.fill(); ctx.fillStyle = '#666'; ctx.fillRect(x - 34, y - 62, 8, 9);
  line('#8a9098', 6, x - 26, y - 58, x + 4, y - 58, x + 4, y - 14, x + 30, y - 14);
  ctx.fillStyle = '#5a5f66'; ctx.beginPath(); ctx.arc(x + 40, y, 22, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#1e222c'; ctx.beginPath(); ctx.arc(x + 40, y, 14, Math.PI, 0); ctx.fill();
  for (let i = 0; i < 4; i++) { const k = (time * 1.5 + i / 4) % 1; ellipse(x + 4 + k * 30, y - 14, 2.5, 2.5, `rgba(120,200,255,${0.4 + g * 0.6})`); }
  crateOf(t, x - 62, y + 4, '#78c8ff');
};
DRAW.glassammel = (x, y, t) => { // drei Glas-Container: weiss, grün, braun
  const g = grown(t);
  ellipse(x, y, 60, 9, 'rgba(0,0,0,.2)');
  ['#e8e8e8', '#3f8a3a', '#8a5a30'].forEach((c, i) => { const cx = x - 40 + i * 30; ctx.fillStyle = c; rrect(cx - 13, y - 40, 26, 40, 5); ctx.fill(); ctx.fillStyle = '#333'; ctx.beginPath(); ctx.arc(cx, y - 30, 4, 0, 7); ctx.fill(); });
  for (let i = 0; i < 6; i++) if (i < g * 6) { ctx.fillStyle = ['#bfe0f5', '#5cae4a', '#a8743a'][i % 3]; ctx.fillRect(x + 38 + (i % 3) * 6, y - 14 - Math.floor(i / 3) * 10, 4, 10); }
  crateOf(t, x - 64, y + 4, '#5cae4a');
};
DRAW.alteisen = (x, y, t) => { // Mulde voll Altmetall, ein Magnet-Kran hebt Eisen heraus
  const g = grown(t);
  ellipse(x, y, 60, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#e07a1a'; ctx.beginPath(); ctx.moveTo(x - 50, y - 30); ctx.lineTo(x + 20, y - 30); ctx.lineTo(x + 12, y); ctx.lineTo(x - 42, y); ctx.fill();
  for (let i = 0; i < 7; i++) if (i < 2 + g * 5) ellipse(x - 40 + i * 9, y - 32 - (i % 2) * 4, 5, 4, i % 2 ? '#8a8e94' : '#b0b4ba');
  line('#555', 4, x + 40, y, x + 40, y - 76, x - 10, y - 76); const my = y - 70 + Math.sin(time + t.id) * 12; line('#333', 1.5, x - 10, y - 76, x - 10, my); ellipse(x - 10, my + 3, 9, 4, '#333');
  crateOf(t, x + 56, y + 4, '#8a8e94');
};
DRAW.buehne = (x, y, t) => { // Konzertbühne mit Dach, Lautsprechern und farbigen Scheinwerfern; Noten fliegen
  const g = grown(t);
  ellipse(x, y, 62, 9, 'rgba(0,0,0,.22)');
  ctx.fillStyle = '#3a3a42'; ctx.fillRect(x - 54, y - 14, 108, 14); ctx.fillStyle = '#2a2a30'; ctx.beginPath(); ctx.moveTo(x - 58, y - 64); ctx.quadraticCurveTo(x, y - 90, x + 58, y - 64); ctx.lineTo(x + 58, y - 60); ctx.lineTo(x - 58, y - 60); ctx.fill();
  line('#555', 3, x - 54, y - 14, x - 54, y - 62); line('#555', 3, x + 54, y - 14, x + 54, y - 62);
  for (const sx of [-44, 36]) { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(x + sx, y - 42, 12, 28); ellipse(x + sx + 6, y - 32, 4, 4, '#444'); ellipse(x + sx + 6, y - 21, 3, 3, '#444'); }
  ['#ff4a4a', '#4aa8ff', '#ffd23a'].forEach((c, i) => { ctx.fillStyle = c; ctx.globalAlpha = 0.25 + 0.2 * Math.sin(time * 4 + i * 2); ctx.beginPath(); ctx.moveTo(x - 20 + i * 20, y - 60); ctx.lineTo(x - 34 + i * 20, y - 14); ctx.lineTo(x - 6 + i * 20, y - 14); ctx.fill(); ctx.globalAlpha = 1; });
  for (let i = 0; i < 3; i++) if (i < 1 + g * 2) { const k = (time * 0.5 + i / 3) % 1; ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillText('♪', x - 10 + i * 12 + Math.sin(k * 6) * 6, y - 66 - k * 30); }
  crateOf(t, x - 66, y + 4, '#e870b0');
};
Object.assign(HGT, { schneekanone: 70, sternwarte: 86, protonenquelle: 66, glassammel: 46, alteisen: 80, buehne: 92 });
const topOf = t => { const p = pos(t); return p.y - (HGT[t.type] || 110); };

// Werkzeuge am Spieler: Transport immer, Ernte-Werkzeug nur während des Erntens
const harvTool = () => harvest && THINGS[harvest.t.type].tool;
const onTractor = () => G.tools.tragen >= 4 && !harvest; // beim Ernten steigt man ab
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
}
// Fahrbare Geräte als echte 3D-Körper (drehen mit der Figur): P wie proj, zu = Höhe der Füsse, add() sortiert nach Tiefe
function gear3(P, s, D, zu, add) {
  const ht = harvTool(), lv = ht && G.tools[ht], { hx } = D, hz = zu - D.hy, { ux, uy } = P;
  const whl = (a, b, z, r, w, rim) => add(a, b, () => { const [cx, cy] = P(a, b, z + r); wheelE(cx, cy, r * s, ux, uy, { w: w * s, rim }); });
  const bar = (c, w, ...q) => line(c, w * s, ...q.flatMap(([a, b, z]) => P(a, b, z)));
  if (ht === 'obst' && lv === 3) { // Hebebühne: Fahrgestell, Scherenhub, Korb mit Geländer
    const L = D.lift;
    const W = [[-13, -9], [13, -9], [-13, 9], [13, 9]].sort((p, q) => P.d(...p) - P.d(...q)), rad = ([a, b]) => { const [cx, cy] = P(a, b, 3); wheelE(cx, cy, 3 * s, ux, uy, { w: 1.2 * s }); };
    add(0, -1, () => {
      W.slice(0, 2).forEach(rad); box3(P, -18, 18, 8, 2, 4, '#666', '#4a4a4a'); W.slice(2).forEach(rad);
      for (const b of [-7, 7]) bar('#e0b020', 2.5, [-14, b, 6], [14, b, L], [-14, b, L], [14, b, 6], [-14, b, 6]);
      box3(P, -18, 18, 9, L, 3, '#e0b020', '#c09018');
    }, -20);
    add(0, 0, () => { // Geländer (vorne über der Figur, ist ja durchsichtig)
      const C = [[-18, -9], [18, -9], [18, 9], [-18, 9]];
      for (const [a, b] of C) bar('#e0b020', 1.8, [a, b, L + 3], [a, b, L + 20]);
      bar('#e0b020', 1.8, ...[...C, C[0]].map(([a, b]) => [a, b, L + 20]));
    }, 20);
  }
  if (G.tools.tragen === 2) { // Schubkarre: Mulde, zwei Holme mit Stützen, Rad vorne
    whl(hx + 28, 0, zu, 5, 2, '#c8c8c8');
    add(hx + 14, 0, () => { for (const b of [-4.5, 4.5]) { bar('#6b4a2b', 2, [hx, b, hz], [hx + 28, b * 0.4, zu + 5]); bar('#555', 2, [hx + 12, b, zu + 10], [hx + 12, b, zu]); } }, -0.5);
    add(hx + 20, 0, () => box3(P, hx + 8, hx + 33, 8, zu + 9, 12, '#2a5a94', '#3d7fc4'));
  }
  if (ht === 'getreide' && lv === 3) { // Motormäher: Lenkholm, Motor, zwei Räder, quer liegender Mähbalken
    for (const b of [-6, 6]) whl(hx + 14, b, zu, 4, 1.8, '#c8c8c8');
    add(hx + 14, 0, () => { for (const b of [-3, 3]) bar('#333', 2, [hx, b, hz], [hx + 10, b, zu + 11]); box3(P, hx + 8, hx + 22, 5, zu + 4, 9, '#e04a40', '#c33'); });
    const j = Math.sin(time * 60) * 1.5;
    add(hx + 26, 0, () => {
      box3(P, hx + 22, hx + 27, 16, zu + 1, 2, '#aaa', '#888');
      ctx.fillStyle = '#ccd'; for (let b = -15; b <= 15; b += 3) { ctx.beginPath(); ctx.moveTo(...P(hx + 27, b + j - 1.2, zu + 2)); ctx.lineTo(...P(hx + 31, b + j, zu + 2)); ctx.lineTo(...P(hx + 27, b + j + 1.2, zu + 2)); ctx.fill(); }
    });
  }
}
function gearFront(D) {
  const tr = G.tools.tragen, ht = harvTool(), lv = ht && G.tools[ht], { hx, hy } = D, a = Math.sin(time * 12);
  if (tr === 1) { // Korb in der hinteren Hand
    line('#8a5a2b', 1.5, D.bx - 5, D.hy + 3, D.bx, D.hy - 3, D.bx + 5, D.hy + 3);
    ctx.fillStyle = '#c48a45'; rrect(D.bx - 6, D.hy + 2, 12, 9, 2); ctx.fill(); line('#8a5a2b', 1, D.bx - 6, D.hy + 6, D.bx + 6, D.hy + 6);
  }
  if (ht === 'getreide' && lv === 1) { // Sichel schwingen
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * 0.6);
    line('#6b4a2b', 2.5, 0, 0, 5, 0); ctx.strokeStyle = '#ccd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(10, 0, 6, Math.PI, Math.PI * 1.9); ctx.stroke(); ctx.restore();
  }
  if (ht === 'getreide' && lv === 2) { // Sense
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * 0.4);
    line('#8a5a2b', 2.5, -2, -16, 5, 14); ctx.strokeStyle = '#ccd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(5, 14); ctx.quadraticCurveTo(16, 10, 26, 14); ctx.stroke(); ctx.restore();
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
const trK = () => 1 + Math.min(G.tools.tragen - 4, 2) * 0.25; // Traktor wächst mit der Stufe: 1 / 1.25 / 1.5, danach wächst nur der Anhänger
function cartDims(s) { const t = onTractor(), k = (t ? 18 * trK() : 6) * s; if (t) s *= trK(); return { k, rope: (t ? 10 : 14) * s, L: (t ? 40 + clamp(G.tools.tragen - 6, 0, 3) * 22 : 28) * s, w: (t ? 13 : 9) * s, h: (t ? 9 : 6) * s, wall: (t ? 10 : 8) * s, r: (t ? 7 : 5) * s, t }; }
function trailCart() {
  if (!hasCart()) { cart.on = false; return; }
  const c = cartDims(0.85 + G.stage * 0.09), ux = Math.cos(trH), uy = Math.sin(trH);
  const hx = G.px - ux * c.k, hy = G.py - uy * c.k;
  if (!cart.on || Math.hypot(hx - cart.fx, hy - cart.fy) > 150) // neu angehängt: gerade hinter die Figur
    Object.assign(cart, { on: true, fx: hx - ux * c.rope, fy: hy - uy * c.rope, bx: hx - ux * (c.rope + c.L), by: hy - uy * (c.rope + c.L) });
  [cart.fx, cart.fy] = follow(cart.fx, cart.fy, hx, hy, c.rope);
  [cart.bx, cart.by] = follow(cart.bx, cart.by, cart.fx, cart.fy, c.L);
}
function poly(pts, fill) {
  ctx.fillStyle = fill; ctx.beginPath(); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1; ctx.stroke();
}
// Rad als Zylinder parallel zur Fahrtrichtung: Lauffläche (Breite 2·w, quer zur Fahrt) + Flanke mit Felge auf der Seite zum Betrachter.
// rim = Felgenfarbe, lug = Stollenprofil (Traktor)
function wheelE(cx, cy, r, ux, uy, { w = r * 0.45, rim = '#a8a8a8', lug = false } = {}) {
  const N = 32, sx = -uy * w, sy = ux * w * 0.5, k = ux < 0 ? -1 : 1; // Querachse; k: welche Flanke näher ist
  const E = (t, o = 0, f = 1) => [cx + Math.cos(t) * r * f * ux + sx * o, cy + Math.cos(t) * r * f * uy * 0.5 - Math.sin(t) * r * f + sy * o];
  ctx.fillStyle = '#1b1b1b'; ctx.beginPath(); // Umriss = Ellipse über die Breite geschoben
  for (let i = 0; i < N; i++) {
    const t = i / N * 6.283, [ax, ay] = E(t - 0.01), [bx, by] = E(t + 0.01), nx = by - ay, ny = ax - bx; // Normale (Umlaufsinn egal, nur Vorzeichen-Wechsel zählt)
    ctx.lineTo(...E(t, nx * sx + ny * sy > 0 ? 1 : -1));
  }
  ctx.closePath(); ctx.fill();
  if (lug) { // Stollen auf dem sichtbaren Teil der Lauffläche (nur innerhalb des Reifens)
    ctx.save(); ctx.clip(); ctx.strokeStyle = '#444'; ctx.lineWidth = Math.max(1, r * 0.12);
    for (let i = 0; i < 20; i++) { const t = i / 20 * 6.283; if (uy * Math.cos(t) + Math.sin(t) * 0.8 < 0.15) continue; ctx.beginPath(); ctx.moveTo(...E(t, -0.9)); ctx.lineTo(...E(t + 0.12, 0)); ctx.lineTo(...E(t, 0.9)); ctx.stroke(); }
    ctx.restore();
  }
  const face = (f, c) => { ctx.fillStyle = c; ctx.beginPath(); for (let i = 0; i < N; i++) ctx.lineTo(...E(i / N * 6.283, k, f)); ctx.closePath(); ctx.fill(); };
  if (Math.abs(ux) < 0.08) return; // genau von vorn/hinten: nur die Lauffläche
  face(1, '#2e2e2e'); face(0.62, rim); face(0.5, shade(rim, 0.8)); face(0.18, shade(rim, 1.15)); // Flanke, Felge mit Schüssel, Nabe
}
// Ladung als Haufen: Q(u, v, z) → Bildschirm (u 0..1 längs, v -1..1 quer, z Höhe in px), na Plätze längs.
// Unterste Lage 2 Reihen, darüber je eine Reihe mit einem Platz weniger; Grösse wächst mit Füllstand.
function pile(Q, inv, cap, na, sz) {
  const all = Object.entries(inv).flatMap(([k, n]) => Array(Math.min(n, 999)).fill(ITEMS[k].icon)); // ponytail: max 999 je Ware, reicht für die Stichprobe
  if (!all.length) return;
  const ps = [];
  for (let l = 0; l < na; l++) for (let a = 0; a < na - l; a++) for (const v of l ? [0] : [-0.5, 0.5]) ps.push({ l, p: Q((a + 0.5 + l / 2) / na, v, l * sz * 0.55) });
  const tot = Object.values(inv).reduce((a, b) => a + b, 0), n = clamp(Math.ceil(ps.length * tot / cap), 1, ps.length);
  ps.length = n; ps.forEach((q, i) => q.ic = all[Math.floor((i * 0.618 % 1) * all.length)]); // goldener Schnitt: gemischt, im Verhältnis der Waren
  ctx.font = `${sz}px system-ui`; ctx.textAlign = 'center';
  ps.sort((a, b) => a.l - b.l || a.p[1] - b.p[1]).forEach(q => ctx.fillText(q.ic, q.p[0], q.p[1]));
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
  pile((u, v, z) => [cart.bx + dx * u + px * v, cart.by + dy * u + py * v - c.h - c.wall * 0.3 - z], G.inv, toolLv('tragen').cap, Math.max(2, Math.round(c.L / (9 * s))), 10 * s); // Ladung als Haufen im Wagen
  walls.slice(2).forEach(w => poly(w, col));
  wheels.slice(2).forEach(([x, y]) => wheelE(x, y, c.r, ux, uy));
  line(c.t ? '#555' : '#6b4a2b', 2, cart.fx, cart.fy - c.h, ax, ay); // Deichsel
}
// Pseudo-3D in Blickrichtung trH: a = längs (vorne +), b = quer (in der Tiefe gestaucht), z = Höhe.
// P(a, b, z) → Bildschirm; P.d(a, b) = Tiefe (grösser = näher am Betrachter, später zeichnen)
function proj(x, y, s, h = trH) {
  const ux = Math.cos(h), uy = Math.sin(h);
  const P = (a, b, z = 0) => [x + (ux * a - uy * b) * s, y + (uy * a + ux * b * 0.5) * s - z * s];
  return Object.assign(P, { ux, uy, d: (a, b) => uy * a + ux * b * 0.5 });
}
function box3(P, a0, a1, b, z0, h, top, side) {
  const C = [[a1, b], [a1, -b], [a0, -b], [a0, b]], ring = z => C.map(([a, q]) => P(a, q, z)), lo = ring(z0), hi = ring(z0 + h);
  [0, 1, 2, 3].map(i => [lo[i], lo[(i + 1) % 4], hi[(i + 1) % 4], hi[i]]).sort((p, q) => p[0][1] + p[1][1] - q[0][1] - q[1][1]).forEach(w => poly(w, side));
  poly(hi, top);
}
// Spediteur-Fahrzeug: Lastenrad, Lieferwagen, Lastwagen, Sattelschlepper, Lastzug (2 Ladeflächen), E-, Wasserstoff- oder selbstfahrender Lastwagen (je nach Stufe), in Fahrtrichtung k.h
function drawTruck(k) {
  const lv = G.tools.spedition, s = [0, 0.55, 0.8, 1, 1, 1, 1, 1, 1][lv], P = proj(k.x, k.y, s, k.h), { ux, uy } = P, box = (...a) => box3(P, ...a);
  const L = [0, 18, 18, 30, 40, 48, 40, 44, 48][lv], col = ['', '#e39b1c', '#f2f2f2', '#d23b2b', '#2f6fc4', '#38a35b', '#1fa39a', '#5ab4e8', '#6b4fa3'][lv], dark = ['', '#b8741a', '#c8c8c8', '#a12a1e', '#2559a0', '#26794a', '#167a73', '#3a8cc0', '#4f3a80'][lv]; // 7 Wasserstoff (hellblau), 8 selbstfahrend (violett)
  if (lv === 1) return drawCargoBike(k, P, s);
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); for (const [a, b] of [[-L - 6, 15], [34, 15], [34, -15], [-L - 6, -15]]) ctx.lineTo(...P(a, b)); ctx.fill();
  const whl = (a, b) => { const [cx, cy] = P(a, b, 7); wheelE(cx, cy, 7 * s, ux, uy); };
  const parts = [[-L + 6, 12], [-L + 6, -12], [24, 12], [24, -12], ...(lv > 3 ? [[-L + 18, 12], [-L + 18, -12]] : [])].map(([a, b]) => ({ d: P.d(a, b), f: () => whl(a, b) }));
  parts.push({ d: 0, f: () => { if (lv === 5) { box(-L - 4, -L / 2 + 2, 13, 6, 30, '#c9a24a', '#a8842f'); box(-L / 2 + 6, 14, 13, 6, 30, '#c9a24a', '#a8842f'); } else box(-L - 4, 14, 13, 6, 30, '#c9a24a', '#a8842f'); box(14, 34, 12, 6, 22, col, dark); box(28, 33, 10, 18, 8, '#9fd3f0', '#7ab6d8'); } }); // Ladefläche, Kabine, Scheibe
  parts.sort((a, b) => a.d - b.d).forEach(p => p.f());
  if (k.load) pile((u, v, z) => P(-L - 4 + (L + 18) * u, v * 10, 36 + z / s), k.cargo, toolLv('spedition').cap, Math.max(2, Math.round((L + 18) * s / 9)), 11);
}
// Lastenrad (Dreirad): Kiste vorne zwischen zwei Rädern, hinten ein grosses Rad, Fahrer tritt in die Pedale
function drawCargoBike(k, P, s) {
  const { ux, uy } = P, pd = time * 8, bar = (c, w, ...q) => line(c, w * s, ...q.flatMap(([a, b, z]) => P(a, b, z)));
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); for (const [a, b] of [[-26, 6], [38, 15], [38, -15], [-26, -6]]) ctx.lineTo(...P(a, b)); ctx.fill();
  const parts = [[24, 12, 6], [24, -12, 6], [-18, 0, 9]].map(([a, b, r]) => ({ d: P.d(a, b), f: () => { const [cx, cy] = P(a, b, r); wheelE(cx, cy, r * s, ux, uy, { w: 1.6 * s, rim: '#d8d8d8' }); } }));
  parts.push({ d: P.d(0, 0) - 0.01, f: () => bar('#555', 2.5, [-18, 0, 9], [-6, 0, 22], [8, 0, 12], [-18, 0, 9]) }); // Rahmen
  parts.push({ d: P.d(-4, 0), f: () => { // Fahrer
    for (const sd of [-1, 1]) { const c = Math.sin(pd + (sd > 0 ? 0 : Math.PI)) * 4; bar('#2b3a55', 3.5, [-6, sd * 3, 24], [0 + c, sd * 3, 17], [-1 + c, sd * 3, 10 + c * 0.5]); }
    box3(P, -10, -2, 5, 24, 16, '#f0a83a', '#e39b1c'); // Weste
    bar('#e39b1c', 3, [-4, 4, 38], [6, 6, 30]); bar('#e39b1c', 3, [-4, -4, 38], [6, -6, 30]); // Arme zum Lenker
    const [hx, hy] = P(-5, 0, 46); ellipse(hx, hy, 5.5 * s, 5.5 * s, '#f1c9a5'); ctx.fillStyle = '#d23b2b'; ctx.beginPath(); ctx.ellipse(hx, hy - 2 * s, 6 * s, 4.5 * s, 0, Math.PI, 0); ctx.fill(); // Kopf mit Velohelm
  } });
  parts.push({ d: P.d(4, 0), f: () => { bar('#333', 2, [6, 0, 12], [6, 0, 30]); bar('#333', 2, [6, -7, 30], [6, 7, 30]); } }); // Lenker
  parts.push({ d: P.d(23, 0), f: () => box3(P, 10, 36, 12, 7, 14, '#8a5a1a', '#e39b1c') }); // Kiste
  parts.sort((a, b) => a.d - b.d).forEach(p => p.f());
  if (k.load) pile((u, v, z) => P(12 + 22 * u, v * 9, 18 + z / s), k.cargo, toolLv('spedition').cap, 2, 11);
}
// Traktor: liefert Teile mit Tiefe y, damit sie mit der sitzenden Figur richtig überdecken.
const TR_COL = [['#38a35b', '#2f8f4e', '#26794a'], ['#c8352b', '#a32a22', '#87221b'], ['#2f6fc4', '#2559a0', '#1d4782'], ['#e8b923', '#c99a14', '#a67c0c'], ['#e9eef2', '#b9c3cc', '#8c98a3'], ['#e8732a', '#c45e1f', '#9c4a17'], ['#1fa39a', '#167a73', '#0f5a55']]; // Stufe 4–10: grün, rot, blau, gelb, weiss (Elektro), orange (Roboter), türkis (Wasserstoff)
function tractorParts(x, y, s) {
  const [c1, c2, c3] = TR_COL[clamp(G.tools.tragen - 4, 0, 6)], lv = clamp(G.tools.tragen - 4, 0, 2), ev = G.tools.tragen >= 8; // ab Stufe 7 Bauform wie Riesentraktor
  const P = proj(x, y, s * trK()), { ux, uy } = P, box = (...a) => box3(P, ...a), S = s * trK();
  const part = (a, b, d) => ({ y: P(a, b)[1], d });
  const whl = (a, b, r) => part(a, b, () => { const [cx, cy] = P(a, b, r); wheelE(cx, cy, r * S, ux, uy, { w: (r > 10 ? 4 : 3) * S, rim: lv ? '#e8c33a' : '#d8d8d8', lug: true }); }); // ab Kipper: gelbe Felgen
  const post = (a, b) => part(a, b, () => line('#3c3c3c', 2.5 * S, ...P(a, b, 15), ...P(a, b, 58)));
  const shadow = { y: -Infinity, d: () => { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); for (const [a, b] of [[-14, 19], [42, 15], [42, -15], [-14, -19]]) ctx.lineTo(...P(a, b)); ctx.fill(); } };
  const rear = [12, 14, 13][lv], front = [7, 8, 13][lv], hood = [36, 38, 40][lv], hh = [13, 14, 17][lv];
  const W = [whl(0, 13, rear), whl(0, -13, rear), whl(30, 9 + lv * 2, front), whl(30, -9 - lv * 2, front)];
  if (lv === 2) W.push(whl(0, 19, rear), whl(0, -19, rear)); // Riesentraktor: Zwillingsräder hinten
  const fb = lv === 2 ? 16 : 13; // Kotflügel über den Hinterrädern (Bogen in der Radebene)
  for (const b of [fb, -fb]) W.push(part(0, b + 0.01, () => { ctx.lineCap = 'round'; line(c2, 6 * S, ...Array.from({ length: 9 }, (_, i) => { const t = 0.15 + i / 8 * 0.7; return P(Math.cos(t * Math.PI) * (rear + 2), b, rear + Math.sin(t * Math.PI) * (rear + 2)); }).flat()); ctx.lineCap = 'butt'; }));
  const roof = () => {
    if (lv) box(-10, 8, 11, 15, 43, 'rgba(170,215,240,.18)', 'rgba(170,215,240,.28)'); // geschlossene Glaskabine
    box(-10, 8, 11, 58, 3, c1, c3);
    if (ev) box(-9, 7, 10, 61, 1, '#24406b', '#1a2f50'); // Solarpanel auf dem Dach
    if (G.tools.tragen >= 9) { const [lx, ly] = P(2, 0, 66); ellipse(lx, ly + 2 * S, 3.5 * S, 2 * S, '#222'); ellipse(lx, ly, 3.5 * S, 2 * S, Math.sin(time * 20) > 0 ? '#5ad1ff' : '#333'); } // Lidar dreht sich
    if (!lv) return;
    const on = Math.sin(time * 9) > 0; // orange Rundumleuchte blinkt
    const [bx, by] = P(-6, 6, 63); ellipse(bx, by, 3 * S, 3 * S, on ? '#ffb02e' : '#b8641a'); if (on) ellipse(bx, by, 6 * S, 6 * S, 'rgba(255,176,46,.3)');
    if (lv === 2) {
      const [gx, gy] = P(-3, -2, 62); ellipse(gx, gy, 4 * S, 2.5 * S, '#f2f2f2'); // GPS-Antenne
      for (const b of [-8, -3, 3, 8]) { const [lx, ly] = P(8, b, 59); ellipse(lx, ly, 2 * S, 1.5 * S, '#fff8c8'); } // Lichtbalken
    }
  };
  return [shadow, ...W,
    part(0, 0, () => box(-9, 7, 9, 8, 7, c1, c2)), // Sitzkasten
    part(21, 0, () => {
      box(6, hood, 6 + lv, 8, hh, c1, c2); // Motorhaube
      if (lv) box(hood, hood + 4, 7, 6, 8, '#3c3c3c', '#2a2a2a'); // Frontgewicht
      if (G.tools.tragen >= 10) { const [wx, wy] = P(hood - 6, 0, 10 + hh); puffs(wx, wy, true, '235,245,255', 0.5); } // Wasserstoff: nur Wasserdampf
      if (ev) return; // Elektro: kein Auspuff
      const ex = P(hood - 6, 0, 8 + hh), et = P(hood - 6, 0, 18 + hh + lv * 6 + Math.abs(Math.sin(time * 12)) * 2);
      line('#333', (2.5 + lv) * S, ...ex, ...et); if (lv) puffs(et[0], et[1], true, lv === 2 ? '90,90,90' : '200,200,200', 0.4 + lv * 0.2); // Auspuff qualmt
    }),
    post(-8, 9), post(-8, -9), post(6, 9), post(6, -9),
    { y: Infinity, d: roof }];
}
// Bein mit Knie (2-Glied-IK) in der Ebene quer-Versatz b: Fuss schwingt nach vorn und hebt ab, Standbein bleibt am Boden.
// Rechnet in (vorne, unten) wie in der Seitenansicht und projiziert dann in 3D.
function leg3(P, s, p, L, drop, b, z0, col, am, shoe = '#4a2f1e') {
  const a = Math.sin(p) * 0.5 * am, fx = L * Math.sin(a), fy = -Math.max(0, Math.cos(p)) * L * 0.3 * am, hy = -L + drop;
  const vy = fy - hy, d = Math.hypot(fx, vy), k = Math.sqrt(Math.max(0, L * L / 4 - d * d / 4));
  const Q = (u, v) => P(u, b, z0 - v);
  line(col, 5 * s, ...Q(0, hy), ...Q(fx / 2 + vy / d * k, hy + vy / 2 - fx / d * k), ...Q(fx, fy));
  line(shoe, 3.5 * s, ...Q(fx - 2, fy - 1), ...Q(fx + 5, fy - 1)); // Schuh zeigt nach vorn
}
function drawPlayer() {
  const x = G.px, y = G.py, st = G.stage, s = 0.85 + st * 0.09, P = proj(x, y, s);
  const tr = onTractor(), am = tr ? 0 : amp, sw = Math.sin(walk) * am, leg = -sw * 4; // Arme gegengleich zu den Beinen
  const legL = 13 + st * 2.5, torso = 17 + st * 2, sh = 8 + st * 0.8, headR = 9.5 - st * 0.5, lift = tr ? 15 * trK() - legL : liftH(); // auf dem Traktor sitzt der Rumpf auf dem Sitz
  const drop = legL * (1 - Math.cos(sw * 0.5)); // Hüfte sinkt bei gespreizten Beinen
  const D = { legL, torso, sh, headR, lift, hx: sh + 3 + leg * 0.5, hy: -legL - 1, bx: -sh - 3 - leg * 0.5 };
  const anchor = () => tr ? P(-18 * trK(), 0, 8 * trK()) : P(-6, 0, legL + lift - drop);
  const cartBack = cart.on && (cart.fy + cart.by) / 2 <= y;
  if (!tr) ellipse(x, y, 12 * s, 4 * s, 'rgba(0,0,0,.3)');
  if (cartBack) drawCart(...anchor(), s);
  const lk = lookOf(G.look), zu = lift - drop, shirt = lk.shirt === 'auto' ? ['#e8483b', '#2f8f4e', '#3a6fd8', '#6b4fa3', '#4a6274'][st] : lk.shirt, skin = lk.skin, hair = lk.hair;
  const hz = zu + legL + torso + headR - 1, shZ = zu + legL + torso - 4, handZ = zu + legL + 1;
  const front = tr || !!harvTool() || G.tools.tragen === 2, basket = !tr && G.tools.tragen === 1; // Hände nach vorn: Lenkrad, Werkzeug, Schubkarre
  const ball = (a, b, z, r, c) => () => { const [px, py] = P(a, b, z); ctx.fillStyle = c; ctx.beginPath(); ctx.arc(px, py, r * s, 0, 7); ctx.fill(); };
  // Gegenstände in der Ebene vorne/oben zeichnen (Seitenansicht-Koordinaten); ponytail: flaches Bild, darum nie ganz von der Kante
  const plane = f => { ctx.save(); ctx.transform((Math.sign(P.ux) || 1) * Math.max(0.4, Math.abs(P.ux)) * s, P.uy * s, 0, s, x, y); f(); ctx.restore(); };
  const parts = [];
  const add = (a, b, f, k = 0) => parts.push({ d: P.d(a, b) + k, f });
  for (const [b, ph, col] of [[-2.5, walk + Math.PI, lk.pants], [2.5, walk, shade(lk.pants, 1.18)]]) {
    if (!tr) add(0, b, () => leg3(P, s, ph, legL, drop, b, lift, col, am, lk.shoes));
    else add(6, b, () => { line(col, 5 * s, ...P(0, b, 15), ...P(9, b, 15), ...P(10, b, 6)); line(lk.shoes, 3.5 * s, ...P(9, b, 5), ...P(15, b, 5)); }); // sitzt
  }
  add(0, 0, () => box3(P, -sh * 0.6, sh * 0.6, sh, zu + legL - 2, torso + 2, shade(shirt, 1.15), shirt));
  for (const sd of [-1, 1]) { // Arme
    const reach = sd > 0 ? front : basket, ha = reach ? (sd > 0 ? D.hx : D.bx) : -sd * leg * 0.8, hb = reach ? sd * sh * 0.6 : sd * (sh + 2.5);
    add(ha, hb, () => { line(shirt, 4.5 * s, ...P(0, sd * (sh + 1.5), shZ), ...P(ha, hb, handZ)); ball(ha, hb, handZ, 2.6, skin)(); }, 0.01);
  }
  if (!tr) gear3(P, s, D, zu, add);
  const blob = (a, b, z, rx, ry, c) => () => { const [px, py] = P(a, b, z); ellipse(px, py, rx * s, ry * s, c); };
  const [fw, fh] = { Rund: [1, 1], Oval: [0.88, 1.15], Breit: [1.15, 0.92] }[lk.face];
  add(1.5, 0, blob(1.5, 0, hz, headR * fw, headR * fh, skin), 0.02); // Gesicht
  const hr = lk.style; // Frisur
  if (hr === 'Lang') add(-headR * 0.7, 0, blob(-headR * 0.7, 0, hz - headR * 0.55, headR * 0.95, headR * 1.15, shade(hair, 0.92)), 0.015);
  if (hr === 'Zopf') { add(-headR * 1.1, 0, ball(-headR * 1.1, 0, hz + 1, headR * 0.42, hair), 0.015); add(-headR * 1.25, 0, ball(-headR * 1.25, 0, hz - headR * 0.6, headR * 0.34, shade(hair, 0.9)), 0.012); }
  if (hr !== 'Glatze') add(-2.5, 0, ball(-2.5, 0, hz + 2, headR * (hr === 'Igel' ? 0.85 : 0.95), hair), 0.02); // Haare hinten/oben
  if (hr === 'Locken') for (let i = 0; i < 7; i++) { const w = i / 7 * 6.283, a = Math.cos(w) * headR * 0.75 - 1, b = Math.sin(w) * headR * 0.75; add(a, b, ball(a, b, hz + headR * 0.45, headR * 0.42, i % 2 ? hair : shade(hair, 1.1)), 0.03); }
  if (hr === 'Igel') add(0, 0, () => { ctx.fillStyle = hair; for (let i = 0; i < 6; i++) { const w = i / 6 * 6.283, a = Math.cos(w) * headR * 0.5, b = Math.sin(w) * headR * 0.5, [x0, y0] = P(a, b, hz + headR * 0.6), [x1, y1] = P(a * 1.4, b * 1.4, hz + headR * 1.35); ctx.beginPath(); ctx.moveTo(x0 - 3 * s, y0); ctx.lineTo(x1, y1); ctx.lineTo(x0 + 3 * s, y0); ctx.fill(); } }, 0.035);
  if (!['Glatze', 'Igel', 'Locken'].includes(hr)) add(headR * 0.55, 0, () => { const [px, py] = P(headR * 0.55, 0, hz + headR * 0.55); ctx.fillStyle = hair; ctx.beginPath(); ctx.ellipse(px, py, headR * 0.8 * s, headR * 0.4 * s, 0, 0, 7); ctx.fill(); }, 0.03); // Stirnfransen
  for (const b of [-2.6, 2.6]) add(headR * 0.85, b, ball(headR * 0.85, b, hz + 1, 1.4, lk.eyes), 0.04); // Augen
  if (lk.freckles === 'Ja') for (const b of [-4, -3, -5, 3, 4, 5]) add(headR * 0.8, b, ball(headR * 0.8, b, hz - 1.5 + (Math.abs(b) % 2), 0.55, '#b0703a'), 0.045);
  if (lk.glasses !== 'Keine') add(headR * 0.95, 0, () => {
    const L = P(headR * 0.9, -2.6, hz + 1), R = P(headR * 0.9, 2.6, hz + 1);
    ctx.lineWidth = 0.9 * s; ctx.strokeStyle = '#222'; ctx.fillStyle = lk.glasses === 'Sonnenbrille' ? 'rgba(20,20,30,.85)' : 'rgba(200,230,255,.25)';
    for (const [px, py] of [L, R]) { ctx.beginPath(); ctx.arc(px, py, 2.3 * s, 0, 7); ctx.fill(); ctx.stroke(); }
    line('#222', 0.9 * s, ...L, ...R);
  }, 0.05);
  const top = hz + headR * fh * 0.6; // Kopfbedeckung immer zuoberst
  if (lk.hat === 'Sennenkäppi') add(0, 0, () => { const [px, py] = P(0, 0, top); ctx.fillStyle = '#1e1e1e'; ctx.beginPath(); ctx.ellipse(px, py, headR * 0.95 * s, headR * 0.6 * s, 0, Math.PI, 0); ctx.fill(); ellipse(px, py, headR * 0.98 * s, 1.4 * s, '#1e1e1e'); ellipse(px, py - headR * 0.3 * s, 1.6 * s, 1.6 * s, '#fff'); }, 0.5);
  if (lk.hat === 'Strohhut') add(0, 0, () => { const [px, py] = P(0, 0, top - 1); ellipse(px, py, headR * 1.9 * s, headR * 0.6 * s, '#e3c26a'); ctx.fillStyle = '#d9ae4a'; rrect(px - headR * 0.85 * s, py - headR * 0.85 * s, headR * 1.7 * s, headR * 0.85 * s, 3 * s); ctx.fill(); ctx.fillStyle = '#d23b2b'; ctx.fillRect(px - headR * 0.85 * s, py - headR * 0.3 * s, headR * 1.7 * s, 2 * s); }, 0.5);
  if (lk.hat === 'Zipfelmütze') add(0, 0, () => { const [px, py] = P(0, 0, top - 1), [tx, ty] = P(-headR * 0.9, 0, top + headR * 1.4); ctx.fillStyle = '#d23b2b'; ctx.beginPath(); ctx.moveTo(px - headR * s, py); ctx.quadraticCurveTo(px, py - headR * 1.6 * s, tx, ty); ctx.lineTo(px + headR * s, py); ctx.fill(); ellipse(px, py, headR * s, 2 * s, '#f2f2f2'); ellipse(tx, ty, 2.4 * s, 2.4 * s, '#f2f2f2'); }, 0.5);
  if (lk.hat === 'Velohelm') add(0, 0, () => { const [px, py] = P(0, 0, top - 2); ctx.fillStyle = '#3a6fd8'; ctx.beginPath(); ctx.ellipse(px, py, headR * 1.08 * s, headR * 0.85 * s, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.5)'; for (const o of [-0.4, 0, 0.4]) ctx.fillRect(px + o * headR * s - s, py - headR * 0.75 * s, 2 * s, headR * 0.5 * s); }, 0.5);
  add(headR * 0.9, 0, () => { const [px, py] = P(headR * 0.9, 0, hz - 3); ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 1.2 * s; ctx.beginPath(); ctx.ellipse(px, py, 2.4 * s * Math.max(0.3, Math.abs(P.uy)), 2.4 * s, 0, 0.2, Math.PI - 0.2); ctx.stroke(); }, 0.04); // Mund
  if (st >= 4) add(headR * 0.7, 0, () => { const [px, py] = P(headR * 0.7, 0, hz - 3); ctx.fillStyle = hair; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(px, py, (headR - 3) * s, 0.1, Math.PI - 0.1); ctx.fill(); ctx.globalAlpha = 1; }, 0.03); // Bart
  const fig = () => {
    plane(() => gearBack(D));
    parts.sort((p, q) => p.d - q.d).forEach(p => p.f());
    plane(() => { ctx.translate(0, drop - lift); gearFront(D); });
  };
  if (tr) [...tractorParts(x, y, s), { y: y + 0.01, d: fig }].sort((a, b) => a.y - b.y).forEach(p => p.d());
  else fig();
  if (cart.on && !cartBack) drawCart(...anchor(), s);
  const items = Object.keys(G.inv);
  if (items.length && !cart.on) { ctx.font = `${14 * s}px system-ui`; ctx.textAlign = 'center'; ctx.fillText(items.map(k => ITEMS[k].icon).join(''), x + 16 * s, y - (legL + 6 + liftH()) * s); }
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
// Bergformen: horn = steile hohle Flanken (Eiger), dom = runde Firnkuppe (Mönch), zacken = Grat mit Zähnen (Dents du Midi),
// stock = Kalkklotz mit Felswänden und schiefem Dach (Säntis), matter = das grosse Horn mit Schulter rechts (Hörnligrat)
const mtH = (p, d) => {
  const u = Math.abs(d) / (d < 0 ? p.wl : p.wr); if (u >= 1) return 0;
  switch (p.kind) {
    case 'horn': return p.h * (1 - u) ** 1.8;
    case 'dom': return p.h * (1 - u ** 1.7) ** 1.6;
    case 'zacken': return p.h * (1 - u) * (0.8 + 0.2 * (1 - Math.abs(Math.sin(d / 17 + p.ph))));
    case 'stock': return p.h * Math.min(1, (1 - u) * 2.6) ** 1.2 * (1 - 0.1 * Math.sign(d) * u); // Dach fällt nach rechts
    case 'matter': return d < 0 ? p.h * (1 - u) ** 1.25 : p.h * ((1 - u) ** 2.6 * 0.78 + 0.22 * (1 - u)) + p.h * 0.1 * Math.exp(-(((u - 0.42) / 0.1) ** 2));
  }
};
const makeAlps = () => {
  const Wp = WORLD.w * T, r = seeded(42), step = 12, KINDS = ['horn', 'dom', 'zacken', 'stock', 'horn', 'zacken'];
  const peaks = (n, hMin, hMax, wMin, wMax) => Array.from({ length: n }, (_, i) => ({ x: (i + 0.15 + r() * 0.7) / n * Wp, h: hMin + r() * (hMax - hMin), wl: wMin + r() * (wMax - wMin), wr: wMin + r() * (wMax - wMin), kind: KINDS[r() * KINDS.length | 0], ph: r() * 9 }));
  const ridge = (pk, base, rough) => {
    const pts = [];
    for (let x = -step; x <= Wp + step; x += step) {
      let h = 0; for (const p of pk) h = Math.max(h, mtH(p, x - p.x));
      const crest = Math.sin(x * 0.043) * 0.6 + Math.sin(x * 0.11 + 1) * 0.4; // ruhiger Grat statt Rauschen
      pts.push([x, base - h + (crest + (r() - 0.5) * 0.5) * rough * Math.min(1, h / 60)]);
    }
    return pts;
  };
  const far = peaks(15, 150, 250, 150, 240), near = peaks(7, 110, 200, 200, 300);
  const horn = { x: Wp * 0.64, h: 300, wl: 120, wr: 230, kind: 'matter', ph: 0, horn: true }; near.push(horn); // das grosse Horn
  const firs = Array.from({ length: 70 }, () => [r() * Wp, r(), 0.5 + r() * 0.45]);
  return { Wp, far, near, farR: ridge(far, -40, 10), nearR: ridge(near, -6, 14), firs, horn };
};
let alps = makeAlps();
const hillY = x => -34 + 14 * Math.sin(x * 0.0035 + 1) + 8 * Math.sin(x * 0.011 + 2);
function ridgeAt(R, x) { const i = clamp(Math.round((x + 12) / 12), 0, R.length - 1); return R[i][1]; }
function mountainRange(R, pk, base, c1, c2, snowY) {
  const path = () => { ctx.beginPath(); ctx.moveTo(R[0][0], 10); for (const [x, y] of R) ctx.lineTo(x, y); ctx.lineTo(R.at(-1)[0], 10); ctx.closePath(); };
  const grat = p => Array.from({ length: 9 }, (_, i) => { const t = i / 8; return [p.x + p.wr * 0.18 * t + Math.sin(t * 7 + p.ph) * 9 * t, base - p.h * (1 - t)]; }); // Grat vom Gipfel hinunter, leicht gewunden
  const shadow = p => { // Schattenseite folgt der Bergform (Licht von links)
    ctx.beginPath(); for (let d = 0; d <= p.wr; d += 10) ctx.lineTo(p.x + d, base - mtH(p, d));
    ctx.lineTo(p.x + p.wr, base + 20); for (const [x, y] of grat(p).reverse()) ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
  };
  const g = ctx.createLinearGradient(0, -ALPS * T, 0, 0); g.addColorStop(0, c1); g.addColorStop(1, c2);
  path(); ctx.fillStyle = g; ctx.fill();
  ctx.save(); path(); ctx.clip();
  ctx.strokeStyle = 'rgba(30,35,50,.13)'; ctx.lineWidth = 2; // Felsbänder am Kalkklotz
  for (const p of pk) if (p.kind === 'stock') for (let k = 1; k < 5; k++) { const y = base - p.h * (1 - k * 0.17); ctx.beginPath(); ctx.moveTo(p.x - p.wl, y + 6); ctx.lineTo(p.x + p.wr, y - 6); ctx.stroke(); }
  ctx.fillStyle = 'rgba(20,30,50,.16)'; for (const p of pk) shadow(p);
  ctx.fillStyle = '#f7fbff'; ctx.beginPath(); ctx.moveTo(-20, -ALPS * T - 10); // Schnee oberhalb der Schneegrenze, in Rinnen weit hinunter
  for (let x = -20; x <= alps.Wp + 20; x += 6) ctx.lineTo(x, snowY + Math.sin(x * 0.05) * 9 + Math.sin(x * 0.13) * 6 + Math.max(0, Math.sin(x * 0.083 + 2)) ** 8 * 38 + Math.max(0, Math.sin(x * 0.19)) ** 10 * 18);
  ctx.lineTo(alps.Wp + 20, -ALPS * T - 10); ctx.fill();
  ctx.fillStyle = 'rgba(120,150,190,.28)'; for (const p of pk) shadow(p);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1.5; // Licht auf der Gratkante
  for (const p of pk) { ctx.beginPath(); for (const [x, y] of grat(p)) ctx.lineTo(x, y); ctx.stroke(); }
  ctx.restore();
}
// Himmel und Wolken (bewegt) liegen hinter dem Hintergrund-Cache, die Berge darin decken sie unten ab
function drawSky(camX, vw) {
  if (alps.Wp !== WORLD.w * T) alps = makeAlps(); // Welt breiter geworden
  const top = -ALPS * T, Wp = alps.Wp;
  const g = ctx.createLinearGradient(0, top, 0, -20); g.addColorStop(0, '#5fb0ea'); g.addColorStop(0.6, '#a9dbf5'); g.addColorStop(1, '#e6f5fb');
  ctx.fillStyle = g; ctx.fillRect(0, top, Wp, -top + 2);
  // Sonne mit Lichthof – wandert langsam mit der Kamera (weit weg = Parallaxe)
  const sx = camX * 0.85 + vw * 0.62, sy = top + 95, sr = ctx.createRadialGradient(sx, sy, 10, sx, sy, 190);
  sr.addColorStop(0, `rgba(255,248,215,${0.9 - SW[0] * 0.4})`); sr.addColorStop(0.25, 'rgba(255,240,190,.35)'); sr.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = sr; ctx.fillRect(sx - 190, sy - 190, 380, 380); ellipse(sx, sy, 24, 24, '#fff8dc');
  if (SW[0]) { ctx.fillStyle = `rgba(222,230,238,${0.55 * SW[0]})`; ctx.fillRect(0, top, Wp, -top + 2); } // Winter: Hochnebel-Himmel
  if (SW[3]) { ctx.fillStyle = `rgba(255,196,130,${0.28 * SW[3]})`; ctx.fillRect(0, top, Wp, -top + 2); } // Herbst: goldenes Licht
  const puff = [[0, 0, 22], [22, 4, 17], [-22, 5, 16], [10, -10, 16], [-8, -8, 13]];
  for (let i = 0; i < 7; i++) { // Wolken: blaugrauer Bauch, weisse Kuppe, Glanz von der Sonne
    const cx = ((time * (6 + i) + i * 523) % (Wp + 300)) - 150, cy = top + 40 + (i * 37) % 90, sc = 0.8 + (i % 3) * 0.2;
    for (const [c, oy] of [['rgba(196,212,230,.9)', 4], ['rgba(255,255,255,.92)', 0]]) { ctx.fillStyle = c; ctx.beginPath(); for (const [dx, dy, rr] of puff) { ctx.moveTo(cx + dx * sc + rr * sc, cy + dy * sc + oy); ctx.arc(cx + dx * sc, cy + dy * sc + oy, rr * sc, 0, 7); } ctx.fill(); }
    ellipse(cx + 4 * sc, cy - 12 * sc, 9 * sc, 4 * sc, 'rgba(255,255,255,.9)');
  }
  if (!SW[0]) for (let i = 0; i < 5; i++) { // Vogelschwarm
    const bx = ((time * 22 + i * 17) % (Wp + 400)) - 200 + (i % 2) * 14, by = top + 120 + Math.abs(i - 2) * 9 + Math.sin(time + i) * 4, f = Math.sin(time * 9 + i) * 3;
    line('rgba(40,50,60,.7)', 1.6, bx - 6, by - f, bx, by + 1, bx + 6, by - f);
  }
}
// Hintergrund-Cache: unbewegte Landschaft einmal in eine Canvas rund um den Bildausschnitt, pro Frame nur ein drawImage.
// Neu gezeichnet bei Zoom, Landkauf (G.land bestimmt Bänder, Wege, Sumpf) oder wenn die Kamera aus dem Rand läuft.
const bg = { c: document.createElement('canvas'), key: '' };
function drawBg(camX, camY, vw, vh) {
  const s = ZOOM * DPR, key = [s, WORLD.w, WORLD.h, G.land, sightsOn() && sightMemo.gen, branches().map(b => [b.x | 0, b.y | 0, b.s]).join('/'), SW.map(w => Math.round(w * 8))].join(); // Saison in 8 Stufen: beim Überblenden ~8 Neuzeichnungen
  if (key !== bg.key || camX < bg.x || camY < bg.y || camX + vw > bg.x + bg.w || camY + vh > bg.y + bg.h) {
    const m = Math.max(vw, vh) * 0.35, main = ctx;
    Object.assign(bg, { key, x: camX - m, y: camY - m, w: vw + 2 * m, h: vh + 2 * m });
    bg.c.width = Math.ceil(bg.w * s); bg.c.height = Math.ceil(bg.h * s);
    ctx = bg.c.getContext('2d'); ctx.setTransform(s, 0, 0, s, -bg.x * s, -bg.y * s);
    try {
      ctx.fillStyle = grassPat; ctx.fillRect(0, 0, WORLD.w * T, WORLD.h * T);
      drawAlps(); drawVoralp();
      for (const k in AREAS) if (AREAS[k].hill && areaOn(AREAS[k])) drawHill(AREAS[k], areaEnd(k));
      drawSumpf(); drawPanorama();
      const roads = () => { ctx.lineCap = ctx.lineJoin = 'round'; // Wege
        for (const [w, c] of [[T * 1.5, '#b99a68'], [T * 1.2, '#d6bd8c']]) {
          ctx.strokeStyle = c; ctx.lineWidth = w;
          for (const p of paths()) { ctx.beginPath(); p.forEach(([a, b], i) => i ? ctx.lineTo(a * T, b * T) : ctx.moveTo(a * T, b * T)); ctx.stroke(); }
        } };
      roads(); drawLake();
      seasonTint(s);
      if (SW[0]) { ctx.globalAlpha = 0.45 * SW[0]; roads(); ctx.globalAlpha = 1; } // Winter: Wege sind gepfadet
    } finally { ctx = main; }
  }
  if (bg.c.width && bg.c.height) ctx.drawImage(bg.c, bg.x, bg.y, bg.w, bg.h); // Fenster 0×0 (minimiert) → nichts
}
// Sprite-Cache für Teile, die überall gleich aussehen (Baumkrone): einmal je Zoomstufe zeichnen, dann nur drawImage. ox/oy = Fusspunkt im Sprite
const sprites = {};
function sprite(key, x, y, ox, oy, w, h, draw) {
  const s = ZOOM * DPR; let c = sprites[key];
  if (c?.s !== s) {
    c = sprites[key] = document.createElement('canvas'); c.s = s; c.width = Math.ceil(w * s); c.height = Math.ceil(h * s);
    const main = ctx; ctx = c.getContext('2d'); ctx.setTransform(s, 0, 0, s, ox * s, oy * s);
    try { draw(); } finally { ctx = main; }
  }
  ctx.drawImage(c, x - ox, y - oy, w, h);
}
function drawAlps() {
  const Wp = alps.Wp;
  mountainRange(alps.farR, alps.far, -40, '#9db3cf', '#7f97b5', -180);
  mountainRange(alps.nearR, alps.near, -6, '#8a8f99', '#6c7a6c', -175);
  const h = alps.horn; flagPole(h.x, -6 - h.h + 4, 26, 14, 1); // Gipfelfahne
  // Alpwiesen-Hügel, nahtlos ins Gras
  ctx.beginPath(); ctx.moveTo(0, 14); for (let x = 0; x <= Wp; x += 16) ctx.lineTo(x, hillY(x)); ctx.lineTo(Wp, 14); ctx.closePath();
  ctx.fillStyle = grassPat; ctx.fill();
  const g = ctx.createLinearGradient(0, -50, 0, 0); g.addColorStop(0, 'rgba(40,80,30,.25)'); g.addColorStop(1, 'rgba(40,80,30,0)'); ctx.fillStyle = g; ctx.fill();
  // Bergsee in der Alp
  const bx = Wp * 0.3, by = hillY(Wp * 0.3) + 16;
  ellipse(bx, by, 74, 11, '#d9c89a'); ellipse(bx, by, 68, 8.5, '#3fb6c7'); ellipse(bx - 14, by - 2, 30, 2.5, 'rgba(255,255,255,.35)');
  for (const [fx, fy, fs] of alps.firs) { const y = hillY(fx) + 6 + fy * 18; if (Math.abs(fx - bx) > 90 || y < by - 14) tanne(fx, y, fs); }
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

// Obstgarten = Voralpen: sanfte Hügelwellen (je Baumreihe eine) und Bäche, die aus der Alp herunterkommen
// Bäche in den Lücken zwischen den Baumspalten: oben fliessen 1–2 Seitenbäche zusammen, dann münden sie in den Fluss.
// Geometrie hängt nur an Obstgarten-Ende und Weltbreite → gemerkt statt jedes Frame neu
let brookMemo = null;
function brooks() {
  const key = areaEnd('obst') + ':' + WORLD.w;
  if (brookMemo?.key === key) return brookMemo;
  const a = AREAS.obst;
  const L = [[riverPath(), 9]]; // [Punkte, Breite] – erst alle Ufer, dann alles Wasser, so verschmelzen die Mündungen
  const srcs = [L[0][0][0]], rocks = [];
  for (let c = 2, s = 0, xs; (xs = (a.x + (c + 0.5) * a.dx) * T) < (areaEnd('obst') + 1.2) * T; c += 7, s++) {
    const r = seeded(s * 13 + 1), f1 = 40 + r() * 30, f2 = 15 + r() * 12, p1 = r() * 7, p2 = r() * 7;
    const wig = y => 0.65 * Math.sin(y / f1 + p1) + 0.35 * Math.sin(y / f2 + p2); // zufällig, aber fest pro Bach
    const y0 = hillY(xs) + 6, P = [];
    for (let y = y0; y <= riverY(xs) + 4; y += 6) P.push([xs + 12 * wig(y), y]);
    const tribs = [], n = 1 + Math.floor(r() * 2);
    for (let k = 0; k < n; k++) { // Seitenbach: startet seitlich am Hang, schwenkt spät in den Hauptbach ein
      const side = (k ? -tribs[0].side : r() < 0.5 ? -1 : 1), sx = clamp(xs + side * (1.8 + r() * 2.2) * T, (a.x + 0.3) * T, (WORLD.w - 1) * T);
      const j = P[clamp(Math.floor((0.6 * T + r() * 0.9 * T - y0) / 6), 2, P.length - 4)], sy = hillY(sx) + 6, Q = [], g1 = 20 + r() * 20, ph = r() * 7;
      for (let t = 0; t <= 1.001; t += 6 / (j[1] - sy)) Q.push([sx + (j[0] - sx) * t ** 1.7 + Math.sin(Math.PI * t) * (14 * Math.sin(t * (j[1] - sy) / g1 + ph) + 6 * Math.sin(t * (j[1] - sy) / 11 + ph * 2)), sy + (j[1] - sy) * t]);
      tribs.push({ side, Q, jy: j[1] });
    }
    for (const t of tribs) { L.push([t.Q, 4]); srcs.push(t.Q[0]); }
    const jTop = Math.min(...tribs.map(t => t.jy));
    L.push([P.filter(p => p[1] <= jTop + 6), 5], [P.filter(p => p[1] >= jTop), 7]); // nach dem Zusammenfluss breiter
    srcs.push(P[0]);
    for (let i = 0; i < 6; i++) { const [x, y] = P[Math.floor(r() * P.length)]; rocks.push([x + (r() < 0.5 ? -8 : 8), y]); }
  }
  return (brookMemo = { key, L, srcs, rocks });
}
function drawVoralp() {
  const a = AREAS.obst, x0 = (ROAD_X + 0.9) * T, x1 = Math.min(WORLD.w, ROAD_X2 - 1.5) * T, lane = a.lane[0] * T; // nur Spalte 1
  for (let r = -1; r < a.rows; r++) {
    const yb = (a.y + r * a.dy) * T + 14, top = yb - 1.6 * T;
    const crest = x => yb - (yb - (top + 14 * Math.sin(x / 190 + r * 2) + 8 * Math.sin(x / 67 + r))) * Math.sqrt(1 - (1 - Math.min(1, (x - x0) / (2.5 * T))) ** 2); // rundes Westende
    ctx.beginPath(); ctx.moveTo(x0, yb);
    for (let x = x0; x <= x1 + 11; x += 12) ctx.lineTo(Math.min(x, x1), crest(Math.min(x, x1)));
    ctx.lineTo(x1, yb + 0.7 * T); ctx.lineTo(x0, yb + 0.7 * T); ctx.closePath();
    const g = ctx.createLinearGradient(0, top - 20, 0, yb + 0.7 * T); // Licht oben, Schatten am Fuss, weich auslaufend
    g.addColorStop(0, 'rgba(220,245,130,.32)'); g.addColorStop(0.4, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(30,60,20,.2)'); g.addColorStop(1, 'rgba(30,60,20,0)');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(240,255,200,.25)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = x0; x <= x1; x += 12) ctx.lineTo(x, crest(x)); ctx.stroke(); // Kuppenlinie
  }
  const { L, srcs, rocks } = brooks();
  const stroke = (P, col, lw) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); for (const [x, y] of P) ctx.lineTo(x, y); ctx.stroke(); };
  for (const [P, w] of L) stroke(P, '#3f7f8f', w + 5);
  for (const [P, w] of L) stroke(P, '#6cc0e0', w);
  for (const [x, y] of srcs) { ellipse(x - 7, y, 7, 4, '#9a9a92'); ellipse(x + 6, y + 1, 5, 3, '#b5b4ab'); } // Quellen
  for (const [x, y] of rocks) ellipse(x, y, 3, 2, '#a9a79c');
}
function brookGlitter() { // fliessendes Glitzern auf Bächen und Fluss – live, der Rest liegt im Hintergrund-Cache
  ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 14]); ctx.lineDashOffset = -time * 30;
  ctx.beginPath(); for (const [P] of brooks().L) { ctx.moveTo(...P[0]); for (const [x, y] of P) ctx.lineTo(x, y); }
  ctx.stroke(); ctx.setLineDash([]);
}
// Fluss: Quelle am Hang östlich vom Obstgarten → Sammelbach über den Obstbäumen nach Westen → hinter dem Hof vorbei
// → zwischen Laden und Händler unter der Steinbrücke durch → in den See. Kacheln für den West-Teil:
const riverY = x => 2.45 * T + 9 * Math.sin(x / 83) + 5 * Math.sin(x / 31 + 1);
const RIVER_W = [[12, 2.6], [5.6, 2.9], [3.3, 5], [3.1, 9], [4.4, 11.6], [7.4, 13], [8.8, 15.2], [8.9, 19.2], [9, 26]];
let riverMemo = null;
function riverPath() { // Punkte (px) alle ~6 px, von der Quelle bis in den See; hängt nur am Ende des Obstgartens → gemerkt
  const xe = (areaEnd('obst') + 1.6) * T;
  if (riverMemo?.xe !== xe) riverMemo = { xe, P: riverCalc(xe) };
  return riverMemo.P;
}
function riverCalc(xe) {
  const y0 = hillY(xe + T) + 6, ye = riverY(xe), P = [];
  for (let t = 0; t < 1; t += 6 / (ye - y0)) P.push([xe + T * (1 - t) ** 2, y0 + (ye - y0) * t]); // vom Hang herunter
  for (let x = xe; x > 19 * T; x -= 6) P.push([x, riverY(x)]);
  const W = [[19 * T, riverY(19 * T)], ...RIVER_W.map(([x, y]) => [x * T, y * T])], W1 = [W[0], ...W, W.at(-1)];
  for (let i = 1; i < W1.length - 2; i++) { // Catmull-Rom: weich durch alle Punkte
    const [p0, p1, p2, p3] = W1.slice(i - 1, i + 3), n = Math.ceil(dist(...p1, ...p2) / 6);
    for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; P.push([0, 1].map(d => 0.5 * (2 * p1[d] + (p2[d] - p0[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (3 * p1[d] - p0[d] - 3 * p2[d] + p3[d]) * t3))); }
  }
  P.push(W.at(-1));
  return P;
}
const nearRiver = (x, y, m) => riverPath().some(([px, py]) => Math.abs(px - x) < m && Math.abs(py - y) < m);
function bridge(x, y) { // Steinbrücke: Pflaster, zwei Brüstungen, Bogen auf der Seeseite
  const w = 46, r = seeded(5);
  ctx.fillStyle = '#958e82'; ctx.fillRect(x - w, y + 30, 2 * w, 24); // Stirnmauer
  ctx.fillStyle = '#1f3d48'; ctx.beginPath(); ctx.moveTo(x - 19, y + 54); ctx.arc(x, y + 54, 19, Math.PI, 0); ctx.fill(); // Bogen, darunter das Wasser
  ctx.strokeStyle = '#c4bcad'; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(x, y + 54, 22, Math.PI, 0); ctx.stroke();
  ctx.strokeStyle = '#958e82'; ctx.lineWidth = 1.2; for (let i = 1; i < 7; i++) { const a = Math.PI + i * Math.PI / 7; line('#958e82', 1.2, x + Math.cos(a) * 19, y + 54 + Math.sin(a) * 19, x + Math.cos(a) * 25, y + 54 + Math.sin(a) * 25); } // Keilsteine
  ctx.fillStyle = '#cdc5b6'; ctx.fillRect(x - w, y - 30, 2 * w, 62); // Fahrbahn
  for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) { ctx.fillStyle = r() < 0.5 ? '#bdb4a3' : '#d8d1c3'; rrect(x - w + 2 + i * 11.4 + (j % 2) * 5, y - 28 + j * 10, 9, 8, 2); ctx.fill(); } // Pflastersteine
  for (const py of [y - 36, y + 26]) { // Brüstungen
    ctx.fillStyle = '#8a8377'; ctx.fillRect(x - w - 6, py, 2 * w + 12, 11);
    ctx.fillStyle = '#b9b1a2'; ctx.fillRect(x - w - 6, py - 4, 2 * w + 12, 5);
    for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(60,50,40,.25)'; ctx.fillRect(x - w - 6 + i * 18.6 + (py > y ? 9 : 0), py + 1, 1.5, 10); }
    for (const px of [x - w - 6, x + w - 4]) { ctx.fillStyle = '#7d766b'; ctx.fillRect(px, py - 8, 10, 19); ctx.fillStyle = '#c9c1b2'; ctx.fillRect(px - 1, py - 10, 12, 4); } // Pfeiler
  }
}
// Fischteiche liegen im Sumpf: Moorboden, Tümpel, Schilf und Rohrkolben zwischen den Teichen
let sumpfMemo = null;
function sumpfGeo(rows) { // Zufalls-Geometrie einmal pro Teich-Reihenzahl berechnen (seeded → immer gleich)
  const a = AREAS.fischerei, x0 = (a.x - 2) * T, x1 = (a.x + (a.cols - 1) * a.dx + 2) * T, y0 = (a.y - 1.4) * T, y1 = (a.y + (rows - 1) * a.dy + 1) * T;
  const ponds = Array.from({ length: a.cols * rows }, (_, i) => slotPos('fischerei', i)), free = (x, y, m) => ponds.every(p => ((x - p.x) / (78 + m)) ** 2 + ((y - p.y + 14) / (36 + m)) ** 2 > 1);
  const r = seeded(77), n = Math.round((x1 - x0) * (y1 - y0) / 900);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, edge = (x, y) => clamp(1.4 - Math.hypot((x - cx) / (x1 - cx), (y - cy) / (y1 - cy)), 0, 1); // zum Rand hin ausblenden
  const moor = [], pools = [], reeds = [[], []], cobs = [];
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), e = edge(x, y); moor.push([x, y, 30 + r() * 40, 12 + r() * 14, r() < 0.5 ? 'rgba(70,85,40,.16)' : 'rgba(110,120,55,.14)', e]); }
  for (let i = 0; i < n; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0), w = 10 + r() * 18;
    if (!free(x, y, w) || r() > edge(x, y)) continue;
    pools.push([x, y, w, r() < 0.5]);
  }
  for (let i = 0; i < n / 2; i++) {
    const x = x0 + r() * (x1 - x0), y = y0 + r() * (y1 - y0);
    if (!free(x, y, 6) || r() > edge(x, y) + 0.2) continue;
    for (let k = 0; k < 4 + r() * 5; k++) {
      const bx = x + (r() - 0.5) * 18, h = 18 + r() * 20, lean = (r() - 0.5) * 8, c = r() < 0.5 ? 0 : 1;
      reeds[c].push([bx, y, h, lean]);
      if (r() < 0.3) cobs.push([bx, y, h, lean]);
    }
  }
  return { rows, moor, pools, reeds, cobs };
}
function drawSumpf() {
  const a = AREAS.fischerei; if (!areaOn(a)) return;
  const rows = Math.ceil(slotsAvail('fischerei') / a.cols);
  if (sumpfMemo?.rows !== rows) sumpfMemo = sumpfGeo(rows);
  const { moor, pools, reeds, cobs } = sumpfMemo; // ponytail: Schilf ohne Wiegen, damit der Sumpf in den Hintergrund-Cache passt
  for (const [x, y, rx, ry, c, e] of moor) { ctx.globalAlpha = e; ellipse(x, y, rx, ry, c); } // Moorboden
  ctx.globalAlpha = 1;
  for (const [x, y, w, leaf] of pools) { // Tümpel
    ellipse(x, y, w + 3, w * 0.4 + 2, '#6b5a35'); ellipse(x, y, w, w * 0.4, '#4d7f86'); ellipse(x - w * 0.3, y - 1.5, w * 0.4, w * 0.1, 'rgba(255,255,255,.25)');
    if (leaf) ellipse(x + w * 0.3, y + 1, 4, 2, '#5f9a3a'); // Seerosenblatt
  }
  ctx.lineWidth = 1.6; // Schilf: je Farbe ein Pfad statt ein Strich pro Halm
  reeds.forEach((L, c) => { ctx.strokeStyle = c ? '#7a9a3e' : '#5c8a34'; ctx.beginPath(); for (const [bx, y, h, lean] of L) { ctx.moveTo(bx, y); ctx.lineTo(bx + lean, y - h); } ctx.stroke(); });
  for (const [bx, y, h, lean] of cobs) ellipse(bx + lean * 0.9, y - h * 0.9, 1.8, 4.5, '#6b4423'); // Rohrkolben
}
// ---- See ----
// Weinberg: sanfte Hügelkuppen, Rebreihen auf Terrassen mit Trockenmäuerchen
function drawHill(a, end) {
  const x0 = (ROAD_X + 0.9) * T, x1 = Math.min(Math.max(end + 2.6, ROAD_X + 16), WORLD.w) * T, [t, b] = a.hill.map(v => v * T);
  const hill = (crest, c0, c1) => { // Kuppen mit runden Enden
    const g = ctx.createLinearGradient(0, t, 0, b); g.addColorStop(0, c0); g.addColorStop(1, c1);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, b);
    for (let x = x0; x <= x1 + 11; x += 12) { const xx = Math.min(x, x1), e = Math.min(1, (xx - x0) / (3 * T), (x1 - xx) / (3 * T)); ctx.lineTo(xx, b - (b - crest(xx)) * Math.sqrt(1 - (1 - e) ** 2)); }
    ctx.closePath(); ctx.fill();
  };
  hill(x => t - 6 + 26 * Math.sin(x / 210 + 2) + 12 * Math.sin(x / 77), '#7aa94a', '#5f9338'); // hintere Hügel
  hill(x => t + 30 + 24 * Math.sin(x / 160) + 10 * Math.sin(x / 59 + 1), '#a6cf62', '#6aa23f'); // vordere Hügel
  ctx.save(); ctx.clip();
  for (let r = 0; r < a.rows; r++) { const y = (a.y + r * a.dy) * T + 12; ctx.fillStyle = 'rgba(50,80,25,.3)'; ctx.fillRect(x0, y + 4, x1 - x0, 5); ctx.fillStyle = '#c9b88e'; ctx.fillRect(x0, y, x1 - x0, 5); } // Terrassen-Mäuerchen
  ctx.restore();
}
// Wie am Lac Léman: Berge steigen am Nordufer steil aus dem Wasser (Blick wie von Lausanne zu den Savoyer Alpen),
// der Fluss mündet dazwischen wie die Rhone, davor Schloss Chillon. [x, Fuss-y, Höhe, halbe Breite links, rechts, Zacken] in Kacheln, hinten → vorn
const LEMAN = [[4.6, 25, 4.4, 3.6, 3, 3, 1], [1.4, 25.6, 3.6, 2.6, 2.2, 1], [7.6, 25.3, 2.4, 1.7, 1.1, 0, 1], [0.3, 28.8, 2.6, 1.6, 2.6, 0]]; // letzte Zahl 1 = Lavaux-Reben am Hang
const inMts = (x, y) => LEMAN.some(([mx, f, h, wl, wr]) => { const d = x / T - mx, s = d < 0 ? wl : wr; return Math.abs(d) < s && y / T < f + 0.6 && y / T > f - h * (1 - Math.abs(d) / s); });
function lemanPath([x, f, h, wl, wr, n], k = 1) { // k = -0.5: Spiegelbild im See
  const r = seeded(Math.round(x * 7) + 3), X = x * T, F = f * T, base = k > 0 ? F + 0.6 * T : F;
  ctx.beginPath(); ctx.moveTo(X - wl * T, base);
  for (let d = -wl; d <= wr; d += 0.12) {
    let y = h * (1 - Math.abs(d) / (d < 0 ? wl : wr));
    for (let i = 0; i < n; i++) y = Math.max(y, h * (0.92 + 0.08 * (i % 2)) - Math.abs(d - (i - (n - 1) / 2) * 0.55) * 2.2); // Zacken wie die Dents du Midi
    ctx.lineTo(X + d * T, F - (y + (r() - 0.5) * 0.15 * Math.min(1, y)) * T * k);
  }
  ctx.lineTo(X + wr * T, base); ctx.closePath();
}
function lemanMts() {
  for (const m of LEMAN) {
    const [x, f, h, wl, wr, , lav] = m, X = x * T, F = f * T, top = F - h * T, r = seeded(Math.round(x * 5));
    const g = ctx.createLinearGradient(0, top, 0, F); g.addColorStop(0, '#9aa0aa'); g.addColorStop(0.45, '#7f8681'); g.addColorStop(0.72, '#4f7a45'); g.addColorStop(1, '#3a6533');
    lemanPath(m); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    if (lav) { // Lavaux: Rebterrassen mit Trockenmäuerchen am unteren Hang, Oberkante leicht gewellt
      const edge = xx => F - h * T * 0.45 + Math.sin(xx * 0.05 + x) * 6;
      ctx.fillStyle = '#86b04e'; ctx.beginPath(); ctx.moveTo(X - wl * T, F + T); for (let xx = X - wl * T; xx <= X + wr * T; xx += 8) ctx.lineTo(xx, edge(xx)); ctx.lineTo(X + wr * T, F + T); ctx.fill();
      for (let y = F - h * T * 0.45 + 6, i = 0; y < F + T; y += 9, i++) for (let xx = X - wl * T + (i % 2) * 4; xx < X + wr * T; xx += 8) {
        if (y < edge(xx) + 3) continue;
        ctx.fillStyle = '#ddd0a6'; ctx.fillRect(xx, y, 8, 2); // Mäuerchen
        ctx.fillStyle = '#3f6e2a'; ctx.fillRect(xx + 2, y - 5, 3, 4); // Rebstock
      }
    }
    if (h > 3) { ctx.fillStyle = '#f7fbff'; ctx.beginPath(); ctx.moveTo(X - wl * T, top - 20); for (let d = -wl * T; d <= wr * T; d += 10) ctx.lineTo(X + d, top + h * T * 0.28 + Math.sin(d * 0.09 + x) * 7); ctx.lineTo(X + wr * T, top - 20); ctx.fill(); } // Schnee
    ctx.fillStyle = 'rgba(20,30,50,.18)'; ctx.beginPath(); ctx.moveTo(X, top); ctx.lineTo(X + wr * T, F + T); ctx.lineTo(X + wr * 0.1 * T, F + T); ctx.fill(); // Schattenseite (Licht von links)
    ctx.restore();
    for (let d = -wl + 0.2; d < wr; d += 0.45) { const tx = X + d * T, ty = F + 0.6 * T + r() * 6; if (!inLake(tx, ty, 0.45)) tanne(tx, ty, 0.55 + r() * 0.25); } // Wald am Fuss, wo kein Wasser ist
  }
}
function chillon(x, y) { // Schloss Chillon auf seinem Felsen im See
  ellipse(x + 4, y + 3, 40, 9, '#5f5a53'); ellipse(x, y, 36, 7, '#8a847a');
  const wall = '#e6dfcf', roof = '#9a4a32';
  ctx.fillStyle = roof; ctx.fillRect(x - 31, y - 26, 62, 5);
  ctx.fillStyle = wall; ctx.fillRect(x - 30, y - 22, 60, 22); // Ringmauer
  for (const [dx, w, h] of [[-25, 11, 34], [-3, 16, 50], [22, 10, 30]]) { // Türme, in der Mitte der Bergfried
    ctx.fillStyle = wall; ctx.fillRect(x + dx - w / 2, y - h, w, h);
    ctx.fillStyle = roof; ctx.beginPath(); ctx.moveTo(x + dx - w / 2 - 2, y - h); ctx.lineTo(x + dx, y - h - w * 1.3); ctx.lineTo(x + dx + w / 2 + 2, y - h); ctx.fill();
  }
  ctx.fillStyle = '#5a5248'; for (const [dx, dy] of [[-27, -24], [-5, -40], [-13, -12], [7, -12], [20, -20]]) ctx.fillRect(x + dx, y + dy, 3, 5); // Fenster
  ctx.fillStyle = 'rgba(20,30,50,.13)'; ctx.fillRect(x + 6, y - 22, 24, 22); // Schattenseite
}
function lakePath(m) {
  ctx.beginPath();
  for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, rr = LAKE.rx * lakeR(a) + m; ctx.lineTo((LAKE.x + Math.cos(a) * rr) * T, (LAKE.y + Math.sin(a) * rr * LAKE.ry / LAKE.rx) * T); }
  ctx.closePath();
}
function drawLake() {
  const cx = LAKE.x * T, cy = LAKE.y * T;
  lakePath(0.45); ctx.fillStyle = '#dccb98'; ctx.fill();
  lemanMts(); // vor dem Wasser: ihr Fuss verschwindet im See
  lakePath(0.12); ctx.fillStyle = '#8fc7d8'; ctx.fill();
  const g = ctx.createRadialGradient(cx - 40, cy - 20, 10, cx, cy, LAKE.rx * T); g.addColorStop(0, '#4fb0e0'); g.addColorStop(1, '#2a70ad');
  lakePath(0); ctx.fillStyle = g; ctx.fill();
  ctx.save(); lakePath(0); ctx.clip();
  // Spiegelung der Berge und kleine Wellen
  ctx.fillStyle = 'rgba(25,55,85,.22)'; for (const m of LEMAN) { lemanPath(m, -0.5); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.ellipse(cx - 60, cy - 50, 120, 22, -0.1, 0, 7); ctx.fill();
  ctx.restore();
  chillon(7 * T, 25.45 * T);
}
function lakeLive() { // Wellen, Schilf, Steg, Name – über dem See aus dem Hintergrund-Cache
  const cx = LAKE.x * T, cy = LAKE.y * T;
  ctx.save(); lakePath(0); ctx.clip();
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1.5; const r = seeded(11);
  for (let i = 0; i < 26; i++) {
    const wx = cx + (r() - 0.5) * LAKE.rx * 2 * T, wy = cy + (r() - 0.5) * LAKE.ry * 2 * T, k = (time * 0.4 + r()) % 1;
    if (Math.abs(wx - 7 * T) < 56 && Math.abs(wy - 25.3 * T) < 34) continue; // nicht übers Schloss
    ctx.globalAlpha = Math.sin(k * Math.PI) * (1 - SW[0]); ctx.beginPath(); ctx.arc(wx, wy, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.arc(wx + 12, wy, 7, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.restore();
  // Jet d'eau: Fontäne im See, Wind weht die Gischt nach rechts
  const jx = 14 * T, jy = 27.6 * T, H = (125 + Math.sin(time * 3) * 4) * (1 - SW[0]), q = seeded(29); // im Winter abgestellt (wie in Genf)
  if (H > 8) {
  ellipse(jx + 2, jy, 26, 6, 'rgba(255,255,255,.6)'); ellipse(jx + 2, jy - 2, 14, 4, 'rgba(255,255,255,.8)'); // Schaum am Fuss
  const jg = ctx.createLinearGradient(0, jy - H, 0, jy); jg.addColorStop(0, 'rgba(255,255,255,.25)'); jg.addColorStop(1, 'rgba(255,255,255,.95)');
  ctx.fillStyle = jg; ctx.beginPath(); ctx.moveTo(jx - 7, jy); ctx.quadraticCurveTo(jx - 4, jy - H * 0.6, jx + 3, jy - H); ctx.lineTo(jx + 17, jy - H + 8); ctx.quadraticCurveTo(jx + 8, jy - H * 0.5, jx + 9, jy); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(jx + 1, jy); ctx.quadraticCurveTo(jx + 1, jy - H * 0.6, jx + 8, jy - H + 3); ctx.stroke(); // heller Kern
  for (let i = 0; i < 40; i++) { const k = (time * 0.7 + q()) % 1, o = q() * 14; ctx.globalAlpha = 0.75 * (1 - k); ellipse(jx + 6 + k * 36 + o, jy - H + 2 + k * k * (H - 6), 4 + k * 7, 4 + k * 7, '#fff'); } // Gischt fällt
  ctx.globalAlpha = 1; }
  // Schilf am Ufer
  for (const a of [2.4, 2.6, 0.5, 0.65, 5.3]) {
    const rr = LAKE.rx * lakeR(a) - 0.1, x = (LAKE.x + Math.cos(a) * rr) * T, y = (LAKE.y + Math.sin(a) * rr * LAKE.ry / LAKE.rx) * T;
    for (let i = 0; i < 6; i++) { const sx = x + i * 4 - 10, sw = Math.sin(time * 1.6 + i) * 2; line('#5f8a3a', 1.6, sx, y + 4, sx + sw, y - 16 - (i % 3) * 4); ellipse(sx + sw, y - 16 - (i % 3) * 4, 1.6, 4, '#7a4e2a'); }
  }
  // Steg
  const sx = (LAKE.x - 3.2) * T, sy = (LAKE.y + 2.9) * T;
  ctx.fillStyle = '#8a5a2b'; for (let i = 0; i < 6; i++) ctx.fillRect(sx - 14 + i * 2, sy - 58 + i * 10, 26, 7);
  ctx.fillStyle = '#5b3a1e'; for (const [px, py] of [[-14, -54], [12, -54], [-4, 2], [22, 2]]) ctx.fillRect(sx + px, sy + py, 3, 10);
  label(cx, cy + LAKE.ry * T + 30, $t`${P.name}see`, 14);
}
function lakeDecos() {
  const L = G.deco.filter(d => DECOS[d.type].where === 'see').map(d => {
    const sp = { schwan: 0.06, segelboot: 0.09, dampfschiff: 0.035 }[d.type], dir = d.id % 2 ? 1 : -1, k = 0.3 + (d.id * 0.37) % 0.42;
    const a = time * sp * dir + d.id * 1.7;
    return { d, x: (LAKE.x + Math.cos(a) * LAKE.rx * k) * T, y: (LAKE.y + Math.sin(a) * LAKE.ry * k) * T + 6, f: -Math.sin(a) * dir >= 0 ? 1 : -1 };
  }).sort((a, b) => a.y - b.y);
  for (const o of L) { ctx.save(); ctx.translate(o.x, o.y + Math.sin(time * 2 + o.d.id) * 1.2); ctx.scale(o.f, 1); DECO_DRAW[o.d.type](0, 0, o.d); ctx.restore(); }
}
// =================== Jahreszeiten ===================
// ponytail: an der Uhr (Date.now) statt im Spielstand – nichts zu speichern, alle sehen dieselbe Saison. 15 Min je Saison, die letzten 2 Min überblenden.
// Reine Kulisse: nichts hier berührt Felder, Tiere, Wege oder Klicks. Zum Ausprobieren: ?saison=0…3 (Winter, Frühling, Sommer, Herbst; 0.9 = mitten im Überblenden)
const SEASON_MS = 15 * 60e3, SEASON_FIX = new URLSearchParams(location.search).get('saison');
let SW = [1, 0, 0, 0], seasonNow = -1; // Gewicht je Saison (Winter, Frühling, Sommer, Herbst), Summe 1
const SEASON_MSG = [() => $t`❄️ Winter! Alles tief verschneit – ab auf die Piste! ⛷️`, () => $t`🌸 Frühling! Die Bäume blühen und der Böögg brennt! 🔥`, () => $t`☀️ Sommer! Gleitschirme über den Alpen und Feuerwerk zum 1. August 🎆`, () => $t`🍂 Herbst! Alpabzug – die Kühe kommen geschmückt von der Alp 🐄🌻`];
function seasonTick() {
  const p = SEASON_FIX != null ? +SEASON_FIX % 4 : (Date.now() / SEASON_MS) % 4, i = Math.floor(p), k = clamp((p - i - 13 / 15) / (2 / 15), 0, 1), s = k * k * (3 - 2 * k);
  SW = [0, 0, 0, 0]; SW[i] = 1 - s; SW[(i + 1) % 4] += s;
  const cur = s < 0.5 ? i : (i + 1) % 4;
  if (cur !== seasonNow) { seasonNow = cur; toast(SEASON_MSG[cur](), null, true); }
}
function seasonTint(s) { // Boden im Hintergrund-Cache einfärben; source-atop lässt den Himmel (durchsichtig) frei
  const [wi, fr, , he] = SW;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-atop';
  for (const [w, c] of [[wi * 0.74, '246,250,255'], [he * 0.26, '214,128,36'], [fr * 0.1, '190,240,140']]) if (w) { ctx.fillStyle = `rgba(${c},${w})`; ctx.fillRect(0, 0, bg.c.width, bg.c.height); }
  if (wi > 0.2) { const r = seeded(5); ctx.fillStyle = `rgba(160,185,215,${0.35 * wi})`; for (let i = 0; i < 260; i++) { ctx.beginPath(); ctx.ellipse(r() * bg.c.width, r() * bg.c.height, (10 + r() * 30) * s, (2 + r() * 4) * s, 0, 0, 7); ctx.fill(); } } // Schneewehen
  ctx.restore();
}
function skier(x, y, c, d) { // klein, weit weg auf dem Berg; d = Richtung im Schwung
  ellipse(x - 6 * d, y + 1, 4, 1.6, 'rgba(255,255,255,.9)'); // Pulverschnee
  line('#222', 1.4, x - 7 * d, y + 1.5, x + 7 * d, y - 0.5);
  ctx.fillStyle = c; ctx.fillRect(x - 2, y - 9, 4, 8);
  ellipse(x, y - 11, 2.2, 2.2, '#f1c9a5'); ellipse(x, y - 12.6, 2.4, 1.3, '#fff');
  line('#555', 0.8, x + 2 * d, y - 6, x + 5 * d, y + 1);
}
function sled(x, y, c) { // Kind auf dem Schlitten, saust den Alphügel hinunter
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.36);
  for (let i = 1; i < 4; i++) ellipse(-12 - i * 7, 1, 4 - i * 0.6, 2, `rgba(255,255,255,${0.9 - i * 0.2})`);
  line('#6b4423', 2, -12, 0, 12, 0, 15, -4); ctx.fillStyle = '#b5652b'; ctx.fillRect(-11, -5, 22, 3);
  ctx.fillStyle = c; rrect(-6, -15, 9, 11, 3); ctx.fill(); line(c, 3, 1, -6, 8, -3);
  ellipse(-1, -18, 4, 4, '#f1c9a5'); ctx.fillStyle = '#2f6fc4'; ctx.beginPath(); ctx.arc(-1, -19, 4.3, Math.PI, 0); ctx.fill(); ellipse(-1, -24, 1.8, 1.8, '#fff');
  line('#f1c9a5', 2, 2, -11, 10, -6); ctx.restore();
}
function glider(x, y, c) { // Gleitschirm
  ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, 24, 9, 0, Math.PI, 0); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; for (const dx of [-12, 4]) ctx.fillRect(x + dx, y - 8, 5, 8);
  for (const dx of [-22, -9, 9, 22]) line('rgba(60,60,60,.6)', 0.6, x + dx, y, x, y + 26);
  ellipse(x, y + 29, 2.6, 4, '#333'); ellipse(x, y + 24, 2.2, 2.2, '#f1c9a5');
}
function boeoegg(x, y) { // Sechseläuten: der Böögg auf dem Holzstoss – brennt, bis der Kopf knallt
  const c = time % 24, boom = c > 18;
  ctx.fillStyle = '#7a4e2a'; for (let i = 0; i < 4; i++) ctx.fillRect(x - 22 + i * 3, y - 8 - i * 7, 44 - i * 6, 6);
  line('#5b3a1e', 3, x, y - 30, x, y - 70);
  if (c < 20) flames(x, y - 14 - Math.min(c, 14), 5, 7);
  puffs(x, y - 40, true, '120,120,120', 0.8);
  ellipse(x, y - 64, 10, 9, '#fafafa'); ellipse(x, y - 79, 8, 7, '#fafafa');
  if (!boom) { ellipse(x, y - 92, 7, 7, '#fafafa'); ctx.fillStyle = '#222'; ctx.fillRect(x - 6, y - 98, 12, 3); ctx.fillRect(x - 4, y - 108, 8, 10); ellipse(x + 2, y - 93, 1.2, 1.2, '#222'); ellipse(x + 5, y - 92, 2.5, 1.2, '#ff8a2a'); }
  else for (let i = 0; i < 10; i++) { const a = i * 0.63, k = (c - 18) * 3; line(i % 2 ? '#ffd34d' : '#ff6a2a', 2, x + Math.cos(a) * k * 4, y - 92 + Math.sin(a) * k * 4, x + Math.cos(a) * k * 7, y - 92 + Math.sin(a) * k * 7); }
}
function crown(x, y) { // Blumenkranz mit Tännli für den Alpabzug
  ctx.fillStyle = '#2f6a2a'; ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x, y - 18); ctx.lineTo(x + 5, y - 2); ctx.fill();
  for (let i = 0; i < 6; i++) { const a = Math.PI * (1.05 + i * 0.18); ellipse(x + Math.cos(a) * 10, y + 3 + Math.sin(a) * 7, 3.4, 3.4, ['#e8303a', '#ffe066', '#fff', '#f5a3c7', '#e8303a', '#ffe066'][i]); }
}
function seasonBack(camX, vw) { // Szenen in den Bergen und am Alphügel (hinter allem anderen)
  const [wi, fr, so, he] = SW, Wp = alps.Wp, inView = x => x > camX - 200 && x < camX + vw + 200;
  if (wi > 0.3) {
    ctx.globalAlpha = clamp((wi - 0.3) * 3, 0, 1);
    alps.near.forEach((p, j) => { if (p.h < 140 || !inView(p.x)) return;
      for (let k = 0; k < 3; k++) { const u = (time * 0.03 + k / 3 + j * 0.21) % 1, w = Math.sin(u * 24); skier(p.x + u * p.wr * 0.6 + w * 16 * (0.3 + u), -6 - p.h * (1 - u * 0.8) + 14, ['#d52b1e', '#2f6fc4', '#f2b01e'][k], Math.cos(u * 24) > 0 ? 1 : -1); } });
    [0.14, 0.52, 0.83].forEach((f, j) => { const x0 = Wp * f; if (!inView(x0)) return; const u = (time * 0.2 + f * 3) % 1; sled(x0 + u * 120, hillY(x0) + 8 + u * 44, ['#d52b1e', '#3d8b2f', '#8a3bb8'][j]); });
  }
  if (fr > 0.3) { ctx.globalAlpha = clamp((fr - 0.3) * 3, 0, 1); const x = Wp * 0.22; if (inView(x)) boeoegg(x, hillY(x) + 24); }
  if (so > 0.3) {
    ctx.globalAlpha = clamp((so - 0.3) * 3, 0, 1);
    for (let j = 0; j < 3; j++) { const x = ((time * (14 + j * 3) + j * 900) % (Wp + 400)) - 200; if (inView(x)) glider(x, -ALPS * T * 0.6 + j * 30 + Math.sin(time * 0.5 + j) * 14, ['#e8303a', '#f2b01e', '#2f9fd6'][j]); }
    for (let j = 0; j < 3; j++) { // 1.-August-Feuerwerk über den Bergen
      const z = time / 2.6 + j / 3, n = Math.floor(z), k = z - n, r = seeded(n * 7 + j + 1), x = r() * Wp, y = -ALPS * T * 0.75 + r() * 90, col = `hsl(${r() * 360},90%,60%)`;
      if (!inView(x)) continue;
      ctx.globalAlpha = clamp((so - 0.3) * 3, 0, 1) * (1 - k);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, R = 8 + k * 38; line(col, 2, x + Math.cos(a) * R * 0.6, y + Math.sin(a) * R * 0.6 + k * k * 12, x + Math.cos(a) * R, y + Math.sin(a) * R + k * k * 16); }
    }
  }
  if (he > 0.3) { // Alpabzug: geschmückte Kühe ziehen mit dem Senn über den Alphügel
    ctx.globalAlpha = clamp((he - 0.3) * 3, 0, 1);
    const lead = ((time * 20) % (Wp + 900)) - 300;
    for (let j = 5; j >= 0; j--) {
      const x = lead - j * 80, y = hillY(x) + 34; if (!inView(x)) continue;
      if (!j) { person(x + 20, y, '#d52b1e', '#222', 0.9); line('#6b4423', 2, x + 26, y - 30, x + 30, y + 1); continue; } // Senn mit Stock
      ctx.save(); ctx.translate(x, y); ctx.scale(0.75, 0.75); drawCow({ cx: 0, cy: 0, tx: 99, ty: 0, face: 1, id: j, ripe: true, store: 0 }); crown(27, -42); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}
function seasonGround() { // Szenen auf dem See und der Weide (flach am Boden)
  const [wi, fr, so] = SW, cx = LAKE.x * T, cy = LAKE.y * T;
  if (wi > 0.3) { // Seegfrörni: Schlittschuhläufer
    ctx.globalAlpha = clamp((wi - 0.3) * 3, 0, 1);
    for (let j = 0; j < 5; j++) { const a = time * (0.25 + j * 0.04) + j * 1.3, x = cx + Math.cos(a) * LAKE.rx * T * (0.35 + j * 0.06), y = cy + Math.sin(a) * LAKE.ry * T * 0.45 + 10;
      line('rgba(255,255,255,.8)', 1.5, x - 14, y + 2, x - 4, y + 1); ctx.save(); ctx.translate(x, y); ctx.scale(-Math.sin(a) >= 0 ? 1 : -1, 1); person(0, 0, ['#d52b1e', '#2f6fc4', '#f2b01e', '#8a3bb8', '#3d8b2f'][j], '#fff', Math.sin(time * 3 + j) * 0.4); line('#bbb', 1.5, -5, 1, 5, 1); ctx.restore(); }
    // Schneemann am Ufer
    const sx = (LAKE.x - 5.6) * T, sy = (LAKE.y - 2.6) * T;
    ellipse(sx + 4, sy, 18, 5, 'rgba(0,0,0,.15)'); ellipse(sx, sy - 12, 15, 13, '#fbfdff'); ellipse(sx, sy - 33, 11, 10, '#fbfdff'); ellipse(sx, sy - 50, 8, 8, '#fbfdff');
    ellipse(sx + 6, sy - 50, 4, 1.6, '#ff8a2a'); ellipse(sx - 3, sy - 53, 1.3, 1.3, '#222'); ellipse(sx + 2, sy - 53, 1.3, 1.3, '#222');
    ctx.fillStyle = '#d52b1e'; ctx.fillRect(sx - 9, sy - 44, 18, 4); ctx.fillRect(sx + 4, sy - 44, 4, 12); // Schal
    line('#6b4423', 2, sx - 10, sy - 34, sx - 22, sy - 44); line('#6b4423', 2, sx + 10, sy - 34, sx + 22, sy - 42);
  }
  if (fr > 0.3) { // Ostereier im Gras der Weide
    ctx.globalAlpha = clamp((fr - 0.3) * 3, 0, 1); const r = seeded(3);
    for (let i = 0; i < 12; i++) { const x = (PASTURE.x + 0.4 + r() * (PASTURE.w - 0.8)) * T, y = (PASTURE.y + 0.8 + r() * (PASTURE.h - 1.2)) * T, c = ['#e8303a', '#2f9fd6', '#ffd34d', '#8a3bb8', '#3d8b2f'][i % 5];
      ellipse(x, y - 6, 5, 6.5, c); ctx.fillStyle = '#fff'; ctx.fillRect(x - 5, y - 7, 10, 2); line('#4f8a2a', 1.5, x - 7, y, x - 9, y - 7, x - 4, y, x - 3, y - 6); }
  }
  if (so > 0.3) { // Schwimmer im See
    ctx.globalAlpha = clamp((so - 0.3) * 3, 0, 1);
    for (let j = 0; j < 4; j++) { const a = time * 0.08 * (j % 2 ? 1 : -1) + j * 1.6, x = cx + Math.cos(a) * LAKE.rx * T * 0.45, y = cy + Math.sin(a) * LAKE.ry * T * 0.5 + 8, b = Math.sin(time * 3 + j) * 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(x, y + 3, 10 + b, 3, 0, 0, 7); ctx.stroke();
      ellipse(x, y + b, 4.5, 4.5, '#f1c9a5'); ctx.fillStyle = ['#e8303a', '#ffd34d', '#2f9fd6', '#f5a3c7'][j]; ctx.beginPath(); ctx.arc(x, y + b - 1, 4.8, Math.PI, 0); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
}
function seasonFx(camX, camY, vw, vh) { // Schnee, Blüten, Schmetterlinge, Laub – weltfest, laufen am Bildrand rundum
  const [wi, fr, so, he] = SW, n = 40, mod = (a, b) => ((a % b) + b) % b;
  for (let i = 0; i < n; i++) {
    const q = i / n, r1 = (i * 0.6180339) % 1, r2 = (i * 0.7548776) % 1, sp = 0.6 + r2;
    const kind = q < wi ? 0 : q < wi + he * 0.6 ? 3 : q < wi + he * 0.6 + fr * 0.4 ? 1 : q < wi + he * 0.6 + fr * 0.4 + so * 0.08 ? 2 : -1;
    if (kind < 0) continue;
    const x = camX + mod(r1 * (vw + 40) + Math.sin(time * (0.5 + r2) + i) * 24 + time * 10 - camX, vw + 40) - 20;
    const y = camY + mod(r2 * (vh + 40) + (kind === 2 ? Math.sin(time * 1.3 + i) * 30 : time * [42, 20, 0, 30][kind] * sp) - camY, vh + 40) - 20;
    if (kind === 0) ellipse(x, y, 1.4 + r1 * 2.2, 1.4 + r1 * 2.2, 'rgba(255,255,255,.9)');
    else if (kind === 2) { const f = Math.abs(Math.sin(time * 12 + i)) * 5 + 1, c = ['#ffd34d', '#f5a3c7', '#7ac6f0'][i % 3]; ellipse(x - f / 2, y, f / 2, 4, c); ellipse(x + f / 2, y, f / 2, 4, c); }
    else { ctx.fillStyle = kind === 1 ? ['#ffd1e3', '#fff'][i % 2] : ['#d9531e', '#e8a019', '#a8331c'][i % 3]; ctx.beginPath(); ctx.ellipse(x, y, kind === 1 ? 2.6 : 4.5, kind === 1 ? 1.6 : 2.2, time * (1 + r1) + i, 0, 7); ctx.fill(); }
  }
}

// =================== Bewohner ===================
// Kleine Leute aus Hof und Dorf: bringen Kisten zum Händler, kaufen im Laden ein – und machen typisch Schweizerisches:
// vor dem Haus wischen, am See fischen, auf die Alp wandern und jodeln, mit dem Berner Sennenhund spazieren.
// Mehr Land → mehr Leute (4 bis 24). Nur Kulisse: keine Kollision, kein Einfluss aufs Spiel.
const folk = [], FOLK_LOOK = [['#d52b1e', '#6b4423'], ['#2f6fc4', null], ['#3d8b2f', '#f2b01e'], ['#8a3bb8', null], ['#e8a019', '#2f6fc4'], ['#f5a3c7', '#fff'], ['#5a5f66', '#d52b1e'], ['#1f8a8a', null], ['#b5652b', '#3d8b2f']];
const fixedE = k => FIXED_E.find(f => f.type === k);
const YODEL = ['Holleri-du-dödl-di! 🎶', 'Jo-ho-dl-di-hu! 🎶', 'Hoi zäme! 👋', '♪ Lueget vo Bärg und Tal ♪'];
function folkTask(f) { // was macht diese Person als Nächstes? Ziel (Pixel) oder null = bleibt daheim
  const L = G.land, r = Math.random(), opts = [['haendler', 3], ['laden', 3], ['fegen', 1], ['see', L >= 5 ? 1.5 : 0], ['wandern', L >= 10 ? 1.5 : 0], ['gassi', L >= 15 ? 1.2 : 0]];
  let k = r * opts.reduce((a, o) => a + o[1], 0), task = 'haendler';
  for (const [t, w] of opts) if ((k -= w) < 0) { task = t; break; }
  f.task = task;
  if (task === 'fegen') return null;
  if (task === 'haendler' || task === 'laden') { const s = fixedE(task); return { x: s.x + rndf(-22, 22), y: s.y + 12 }; }
  if (task === 'see') { const a = rndf(-0.7, 0.5), rr = LAKE.rx * lakeR(a) + 0.7; return { x: (LAKE.x + Math.cos(a) * rr) * T, y: (LAKE.y + Math.sin(a) * rr * LAKE.ry / LAKE.rx) * T, face: -1 }; }
  if (task === 'wandern') return { x: rndf(2, WORLD.w - 2) * T, y: 0.7 * T };
  return { x: ROAD_X * T + rndf(-8, 8), y: rndf(4, WORLD.h - 4) * T }; // gassi: ein Stück die Hauptstrasse entlang
}
function folkTick(dt) {
  const n = 4 + Math.min(20, Math.floor(G.land / 5));
  while (folk.length < n) folk.push({ id: folk.length, x: 0, y: 0, dir: 1, way: [], wait: Math.random() * 8, home: null, out: false, bag: null, task: null });
  folk.length = n;
  for (const f of folk) {
    if (f.way.length) {
      const p = f.way[0], dx = p.x - f.x, dy = p.y - f.y, l = Math.hypot(dx, dy), s = 40 * dt;
      if (Math.abs(dx) > 0.5) f.dir = Math.sign(dx);
      if (l <= s) {
        f.x = p.x; f.y = p.y; f.way.shift();
        if (!f.way.length) { // angekommen
          if (p.face) f.dir = p.face;
          f.wait = !f.out ? rndf(4, 10) : { see: rndf(8, 14), wandern: rndf(5, 8), gassi: 1 }[f.task] || rndf(2, 4);
          if (f.out && f.task === 'wandern') floater(f.x, f.y - 40, YODEL[f.id % YODEL.length]);
          if (!f.out) f.task = null;
        }
      } else { f.x += dx / l * s; f.y += dy / l * s; }
      continue;
    }
    if ((f.wait -= dt) > 0) continue;
    if (!f.home) { // erstes Mal: zu Hause auftauchen (Hof, Dorfhäuser, Dorfgebäude)
      const homes = [fixedE('hof'), ...townOn().map(b => ({ x: b.x * T, y: b.y * T })), ...G.things.filter(t => THINGS[t.type].area === 'dorf')], h = homes[f.id % homes.length];
      f.home = { x: h.x + rndf(-14, 14), y: h.y + 8 }; Object.assign(f, f.home);
    }
    if (f.out) { // heim, mit dem, was man geholt hat
      f.bag = { laden: 'korb', see: Math.random() < 0.7 ? 'fisch' : null }[f.task] || null;
      f.out = false; f.way = road(f, f.home); continue;
    }
    const to = folkTask(f);
    f.bag = f.task === 'haendler' ? 'kiste' : null;
    if (!to) { f.wait = rndf(5, 9); continue; } // fegen vor dem Haus
    f.out = true; f.way = road(f, to); f.way.at(-1).face = to.face;
  }
}
function folkDog(x, y, d) { // Berner Sennenhund trottet nebenher
  const ph = Math.sin(time * 12 + x) * 2;
  ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
  ellipse(0, 0, 9, 2.5, 'rgba(0,0,0,.18)');
  ctx.fillStyle = '#222'; for (const [lx, o] of [[-6, ph], [-3, -ph], [4, -ph], [7, ph]]) ctx.fillRect(lx - 1 + o * 0.3, -6, 2, 6);
  ellipse(0, -9, 10, 5, '#222'); ellipse(2, -7, 6, 2.5, '#f6f1e4'); ellipse(-6, -9, 3, 3.5, '#a0522d');
  ellipse(10, -13, 4.5, 4, '#222'); ellipse(12, -11, 2.5, 1.8, '#f6f1e4'); ellipse(9, -15, 1.5, 1.2, '#a0522d');
  line('#222', 2, -9, -10, -13, -14 + ph); ctx.restore();
}
function drawFolk(f) {
  const [shirt, hat] = FOLK_LOOK[f.id % FOLK_LOOK.length], go = f.way.length > 0, b = go ? Math.abs(Math.sin(time * 9 + f.id)) * 1.5 : 0;
  const here = !go && f.out, sweep = !go && !f.out && f.task === 'fegen', fishing = here && f.task === 'see';
  const arm = sweep ? -1.2 + Math.sin(time * 6 + f.id) * 0.5 : fishing ? 0.5 : here && f.task === 'wandern' ? 1.2 + Math.sin(time * 5) * 0.2 : f.bag ? -0.3 : go ? -0.9 + 0.4 * Math.sin(time * 9 + f.id) : -0.6;
  ellipse(f.x, f.y, 7, 2.5, 'rgba(0,0,0,.2)');
  if (f.task === 'gassi') folkDog(f.x - 16 * f.dir, f.y + 3, f.dir);
  ctx.save(); ctx.translate(f.x, f.y - b); ctx.scale(f.dir * 0.85, 0.85);
  if (f.task === 'wandern') { ctx.fillStyle = '#c8352b'; rrect(-10, -22, 7, 12, 2); ctx.fill(); } // Rucksack
  person(0, 0, shirt, SW[0] > 0.5 ? '#e8303a' : hat, arm); // im Winter alle mit Zipfelmütze
  const [hx, hy] = hand(0, 0, arm);
  if (f.task === 'wandern') line('#6b4423', 1.5, hx, hy - 4, hx + 3, hy + 16); // Wanderstock
  if (sweep) { line('#8a5a2b', 2, hx, hy, hx + 6, 2); ctx.fillStyle = '#d9b45a'; ctx.fillRect(hx + 2, -1, 9, 3); }
  if (fishing) { const t = time * 2 + f.id; line('#5b3a1e', 1.5, hx, hy, hx + 22, hy - 16); line('rgba(255,255,255,.7)', 0.8, hx + 22, hy - 16, hx + 30, 6); ellipse(hx + 30, 7 + Math.sin(t) * 1.2, 2, 2, '#e8303a'); }
  if (f.bag === 'kiste') { ctx.fillStyle = '#b07a42'; ctx.fillRect(hx - 5, hy - 4, 12, 8); for (let i = 0; i < 3; i++) ellipse(hx - 2 + i * 3.5, hy - 5, 2, 2, '#d23b2b'); }
  if (f.bag === 'korb') { ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(hx + 1, hy + 2, 5, Math.PI, 0); ctx.stroke(); ctx.fillStyle = '#c8935a'; ctx.fillRect(hx - 5, hy + 2, 12, 7); ellipse(hx + 3, hy + 1, 5, 1.8, '#d9953a'); ellipse(hx - 2, hy, 1.5, 3, '#3d8b2f'); }
  if (f.bag === 'fisch') { line('#666', 1, hx, hy, hx, hy + 5); ctx.save(); ctx.translate(hx, hy + 9); ctx.rotate(Math.PI / 2); fish(0, 0, 0.5, '#8fa8b8'); ctx.restore(); }
  ctx.restore();
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

// =================== Zufalls-Ereignisse ===================
// Alle 40–90 s passiert im Bild etwas typisch Schweizerisches: Postauto, Patrouille Suisse, Alphorn, Fahnenschwinger,
// davonrollender Käselaib, Murmeli, Bernhardiner, Guggenmusik, Schwingen, Regenbogen. Reine Kulisse, keine Klicks.
// Zum Ausprobieren: ?ereignis=postauto (kommt dann alle 20 s wieder)
const view = { x: 0, y: 0, w: 800, h: 600 }; // Kamera vom letzten Frame (render setzt sie)
const EV_FIX = new URLSearchParams(location.search).get('ereignis');
let evNow = null, evNext = 30, evPrev = null;
const EVENTS = {
  postauto: { dur: 13, walk: 1, msg: () => $t`📯 Tü-ta-too! Das Postauto kommt!`, sfx: 'tutato' },
  patrouille: { dur: 8, sky: 1, msg: () => $t`✈️ Die Patrouille Suisse donnert vorbei!`, sfx: 'jet' },
  alphorn: { dur: 12, msg: () => $t`🎺 Ein Alphornbläser spielt ein Lied!`, sfx: 'alphorn' },
  fahne: { dur: 12, msg: () => $t`🚩 Ein Fahnenschwinger wirft die Fahne hoch!` },
  kaese: { dur: 9, walk: 1, msg: () => $t`🧀 Hilfe! Ein Käselaib rollt davon!` },
  murmeli: { dur: 9, msg: () => $t`🐾 Ein Murmeli schaut aus dem Bau und pfeift!`, sfx: 'pfiff' },
  bernhardiner: { dur: 14, walk: 1, msg: () => $t`🐕 Ein Bernhardiner mit Fässli trottet vorbei!`, sfx: 'woof' },
  gugge: { dur: 14, walk: 1, msg: () => $t`🥁 Guggenmusik! Konfetti für alle!`, sfx: 'gugge' },
  schwingen: { dur: 13, msg: () => $t`💪 Schwingen im Sägemehl – wer gewinnt?` },
  regenbogen: { dur: 24, sky: 1, msg: () => $t`🌈 Ein Regenbogen über den Alpen!` },
};
function evTick(dt) {
  if (evNow && time - evNow.t0 > EVENTS[evNow.k].dur) evNow = null;
  if (evNow || (evNext -= dt) > 0) return;
  evNext = EV_FIX ? 20 : 40 + Math.random() * 50;
  const keys = Object.keys(EVENTS).filter(k => k !== evPrev), k = EVENTS[EV_FIX] ? EV_FIX : keys[Math.floor(Math.random() * keys.length)], e = EVENTS[k];
  evPrev = k;
  const d = Math.random() < 0.5 ? 1 : -1;
  let x = G.px + d * (90 + Math.random() * 60), y = clamp(G.py + 30 + Math.random() * 40, 2 * T, (WORLD.h - 1) * T);
  if (inLake(x, y, 40) || inMts(x, y)) x = G.px - d * 120; // nicht im See oder Berg
  if (e.walk) { x = d > 0 ? view.x - 140 : view.x + view.w + 140; y = clamp(G.py + 45, 2 * T, (WORLD.h - 1) * T); }
  evNow = { k, t0: time, x, y, d, x1: d > 0 ? view.x + view.w + 140 : view.x - 140 };
  toast(e.msg(), null, true); if (e.sfx) AU.sfx(e.sfx);
}
const evFade = (u, dur) => clamp(Math.min(u / 0.8, (dur - u) / 0.8), 0, 1);
function postauto(x, y, d) { // gelbes Postauto mit rotem Streifen
  const b = Math.abs(Math.sin(time * 14)) * 0.8;
  ellipse(x, y, 44, 7, 'rgba(0,0,0,.22)');
  ctx.save(); ctx.translate(x, y - b); ctx.scale(d, 1);
  ctx.fillStyle = '#f5c400'; rrect(-40, -40, 80, 34, 7); ctx.fill();
  ctx.fillStyle = '#d6a800'; ctx.fillRect(-40, -12, 80, 5);
  ctx.fillStyle = '#d52b1e'; ctx.fillRect(-40, -17, 80, 3);
  ctx.fillStyle = '#2b3a4a'; rrect(-35, -35, 60, 13, 3); ctx.fill();
  ctx.fillStyle = '#9fd3ef'; for (let i = 0; i < 5; i++) ctx.fillRect(-33 + i * 12, -33, 10, 9);
  for (let i = 0; i < 5; i++) ellipse(-28 + i * 12, -27, 2.4, 2.4, ['#f1c9a5', '#8d5a3a', '#f1c9a5', '#f6d9b8', '#c98e64'][i]); // Fahrgäste
  ctx.fillStyle = '#bfe5f7'; rrect(28, -35, 11, 20, 3); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fillRect(30, -33, 3, 16);
  ellipse(38, -10, 2.5, 2, '#fff8c0'); ctx.fillStyle = '#5a5a5a'; ctx.fillRect(-36, -45, 50, 5); // Gepäckträger
  ctx.restore();
  wheel(x - 24 * d, y - 4 - b, 6.5); wheel(x + 24 * d, y - 4 - b, 6.5);
}
function jet(x, y, s) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.fillStyle = '#d52b1e'; ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(4, -3); ctx.lineTo(-14, -3); ctx.lineTo(-14, 3); ctx.lineTo(4, 3); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(-8, -13); ctx.lineTo(-12, -13); ctx.lineTo(-6, 0); ctx.lineTo(-12, 9); ctx.lineTo(-8, 9); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-10, -2); ctx.lineTo(-16, -9); ctx.lineTo(-14, 0); ctx.fill();
  ellipse(8, -2, 4, 1.6, '#bfe5f7'); ctx.fillStyle = '#fff'; ctx.fillRect(-7, -6, 4, 1.4); ctx.fillRect(-5.7, -7.3, 1.4, 4);
  ctx.restore();
}
function marmot(x, y, up) { // Murmeli steht auf den Hinterbeinen, up = 0…1 wie weit es herausschaut
  ellipse(x, y, 16, 5, '#7a5a38'); ellipse(x, y - 1, 10, 3, '#3a2a1a');
  if (up < 0.05) return;
  ctx.save(); ctx.beginPath(); ctx.rect(x - 20, y - 60, 40, 59); ctx.clip();
  const h = up * 26, by = y - h;
  ellipse(x, by + 10, 8, 12, '#9a7048'); ellipse(x, by + 12, 5, 8, '#c9a476');
  ellipse(x, by - 4, 6.5, 6, '#9a7048'); ellipse(x - 5, by - 8, 2, 2, '#7a5a38'); ellipse(x + 5, by - 8, 2, 2, '#7a5a38');
  ellipse(x, by - 1, 3.5, 2.5, '#d9bc94'); ellipse(x, by - 2.5, 1.2, 0.9, '#222');
  ellipse(x - 2.5, by - 5, 1, 1, '#222'); ellipse(x + 2.5, by - 5, 1, 1, '#222');
  ellipse(x - 4, by + 6, 2, 3, '#7a5a38'); ellipse(x + 4, by + 6, 2, 3, '#7a5a38');
  ctx.restore();
}
function stBernard(x, y, d) { // Bernhardiner mit Schnapsfässli am Hals
  const ph = Math.sin(time * 10) * 2.5;
  ctx.save(); ctx.translate(x, y); ctx.scale(d, 1);
  ellipse(0, 0, 18, 4, 'rgba(0,0,0,.2)');
  ctx.fillStyle = '#f2ece0'; for (const [lx, o] of [[-12, ph], [-7, -ph], [8, -ph], [13, ph]]) ctx.fillRect(lx - 2 + o * 0.4, -12, 4, 12);
  ellipse(0, -17, 18, 9, '#f2ece0'); ellipse(-4, -20, 9, 6, '#a0522d'); ellipse(8, -18, 5, 5, '#a0522d');
  ellipse(19, -25, 8, 7, '#f2ece0'); ellipse(19, -28, 7, 4, '#a0522d'); ellipse(15, -23, 3, 6, '#7a3d1d'); // Kopf, Schlappohr
  ellipse(26, -22, 4, 3, '#f2ece0'); ellipse(29, -23, 1.6, 1.3, '#222'); ellipse(21, -28, 1.1, 1.1, '#222');
  line('#f2ece0', 4, -17, -19, -23, -25 + ph);
  ctx.save(); ctx.translate(16, -15); ctx.rotate(Math.PI / 2); barrel(0, 5, 3.6, 10, '#b5652b'); ctx.restore();
  ctx.restore();
}
function cheeseWheel(x, y, a) {
  ellipse(x, y, 16, 4, 'rgba(0,0,0,.2)');
  ctx.save(); ctx.translate(x, y - 16); ctx.rotate(a);
  ellipse(0, 0, 16, 16, '#e0a43a'); ellipse(0, 0, 13, 13, '#f3cf6b');
  for (const [cx, cy] of [[-5, -4], [4, 3], [2, -7], [-3, 6]]) ellipse(cx, cy, 2, 2, '#d9a945');
  ctx.fillStyle = '#d52b1e'; ctx.fillRect(-4, -1.5, 8, 3); ctx.fillRect(-1.5, -4, 3, 8);
  ctx.restore();
}
function evDraw(e, u) { // Ereignisse am Boden – mit den Gebäuden nach y sortiert
  const D = EVENTS[e.k].dur, p = u / D, x = e.x + (e.x1 - e.x) * p, y = e.y;
  ctx.globalAlpha = evFade(u, D);
  if (e.k === 'postauto') { postauto(x, y, e.d); if (u % 4 < 1.4) label(x + 30 * e.d, y - 58, 'Tü-ta-too! 📯', 14); }
  else if (e.k === 'bernhardiner') { stBernard(x, y, e.d); if (u % 5 < 1) label(x, y - 46, 'Wuff! 🐾', 14); }
  else if (e.k === 'kaese') {
    const b = Math.abs(Math.sin(u * 6)) * 14;
    cheeseWheel(x + 70 * e.d, y - b, u * 9 * e.d);
    ctx.save(); ctx.translate(x, y - Math.abs(Math.sin(u * 12)) * 2); ctx.scale(e.d, 1); person(0, 0, '#2f6fc4', '#222', 1.3 + Math.sin(u * 14) * 0.3); ctx.restore();
    label(x, y - 46, $t`Halt, mis Chäs! 🧀`, 14);
  }
  else if (e.k === 'gugge') {
    for (let i = 0; i < 4; i++) {
      const xx = x - i * 34 * e.d, yy = y + (i % 2) * 8, c = ['#e8303a', '#ffd34d', '#2f9fd6', '#8a3bb8'][i];
      ctx.save(); ctx.translate(xx, yy - Math.abs(Math.sin(u * 8 + i)) * 2); ctx.scale(e.d, 1);
      person(0, 0, c, ['#ffd34d', '#3d8b2f', '#e8303a', '#f5a3c7'][i], i % 2 ? 0.2 + Math.sin(u * 16) * 0.3 : -0.4);
      ellipse(0, -34, 7, 4, c); line('#222', 1, -4, -36, -6, -42); // Fasnachts-Hut mit Feder
      if (i % 2) { ctx.fillStyle = '#e8c35a'; ctx.fillRect(10, -20, 10, 3); ellipse(21, -18.5, 3, 4, '#e8c35a'); } // Trompete
      else { ellipse(6, -11, 6, 5, '#fff'); ctx.strokeStyle = '#d52b1e'; ctx.lineWidth = 1.5; ctx.strokeRect(1, -15, 10, 8); } // Trommel
      ctx.restore();
    }
    if (u % 2 < 1) label(x - 50 * e.d, y - 52, '🎶 Bum-ba-di-bum! 🎶', 14);
  }
  else if (e.k === 'alphorn') {
    ellipse(e.x + 30, y, 44, 6, 'rgba(0,0,0,.18)');
    line('#8a5a2b', 4, e.x + 4, y - 22, e.x + 30, y - 10, e.x + 62, y - 3); line('#5b3a1e', 1.5, e.x + 20, y - 15, e.x + 22, y - 14); // Horn
    ctx.fillStyle = '#6b4423'; ctx.beginPath(); ctx.ellipse(e.x + 66, y - 6, 5, 8, -0.3, 0, 7); ctx.fill(); ellipse(e.x + 66, y - 6, 2.5, 5, '#3a2a1a');
    ctx.save(); ctx.translate(e.x, y); person(0, 0, '#2f4f8f', '#222', 0.3); ctx.restore();
    for (let i = 0; i < 3; i++) { const k = (u * 0.5 + i / 3) % 1; ctx.globalAlpha = evFade(u, D) * (1 - k); label(e.x + 66 + Math.sin(k * 6 + i) * 10, y - 16 - k * 60, i % 2 ? '♪' : '♫', 18); }
  }
  else if (e.k === 'fahne') {
    ellipse(e.x, y, 10, 3, 'rgba(0,0,0,.2)');
    const c = u % 4, up = c > 2.6 ? Math.sin((c - 2.6) / 1.4 * Math.PI) : 0, a = c * 5;
    ctx.save(); ctx.translate(e.x, y); person(0, 0, '#fff', '#d52b1e', up ? 1.4 : Math.sin(a) * 0.9); ctx.restore();
    const [hx, hy] = up ? [e.x + 5, y - 40 - up * 90] : hand(e.x, y, Math.sin(a) * 0.9);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(up ? c * 6 : Math.sin(a) * 1.2 - 0.6);
    line('#e8c35a', 2, 0, 6, 0, -30); swissFlag(1, -30, 22, 2); ctx.restore();
    if (up > 0.9) label(e.x, y - 60, 'Hopp! 🇨🇭', 14);
  }
  else if (e.k === 'murmeli') { const s = u % 4.5, up = s < 0.4 ? s / 0.4 : s < 3.4 ? 1 : s < 3.8 ? (3.8 - s) / 0.4 : 0; marmot(e.x, y, up); if (up > 0.9 && s < 2) label(e.x, y - 44, 'Piiiiiiiep! 📢', 13); const n = Math.floor(u / 4.5); if (e.pf !== n) { if (e.pf != null) AU.sfx('pfiff'); e.pf = n; } }
  else if (e.k === 'schwingen') {
    ellipse(e.x, y, 54, 16, '#e3c98a'); ellipse(e.x, y - 1, 46, 12, '#efd9a2');
    const done = p > 0.62, sway = Math.sin(u * 3) * 6;
    if (!done) {
      for (const s of [1, -1]) { ctx.save(); ctx.translate(e.x - 9 * s + sway, y); ctx.scale(s, 1); ctx.rotate(0.25); person(0, 0, s > 0 ? '#e9e2cf' : '#2f6fc4', null, -0.1); ctx.restore(); }
      if (u % 2 < 1) label(e.x, y - 46, $t`Hau ruck! 💪`, 14);
    } else {
      ctx.save(); ctx.translate(e.x + 14, y - 2); ctx.rotate(-Math.PI / 2); person(0, 0, '#2f6fc4', null, 0.2); ctx.restore(); // auf dem Rücken
      ctx.save(); ctx.translate(e.x - 14, y); person(0, 0, '#e9e2cf', null, 1.5); ctx.restore();
      label(e.x - 14, y - 44, $t`Gewonnen! 🏆`, 14);
      for (let i = 0; i < 6; i++) { const k = (u * 1.3 + i / 6) % 1; ellipse(e.x - 30 + i * 12, y - 6 - k * 20, 2, 2, `rgba(220,190,120,${1 - k})`); } // Sägemehl stiebt
    }
  }
  ctx.globalAlpha = 1;
}
function evSky(e, u) { // Ereignisse am Himmel – über allem, an der Kamera ausgerichtet
  const D = EVENTS[e.k].dur, p = u / D;
  if (e.k === 'patrouille') {
    const x0 = e.d > 0 ? view.x - 200 + (view.w + 500) * p : view.x + view.w + 200 - (view.w + 500) * p, y0 = view.y + view.h * 0.16;
    const F = [[0, 0], [-34, -18], [-34, 18], [-68, -36], [-68, 36], [-80, 0]];
    F.forEach(([fx, fy], i) => {
      const x = x0 + fx * e.d, y = y0 + fy + Math.sin(u * 2 + i) * 2, L = 260;
      const g = ctx.createLinearGradient(x, y, x - L * e.d, y); g.addColorStop(0, i === 5 ? 'rgba(213,43,30,.75)' : 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(x - 14 * e.d, y); ctx.lineTo(x - L * e.d, y); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.scale(e.d, 1); jet(0, 0, 1.1); ctx.restore();
    });
  }
  else if (e.k === 'gugge') { // Konfetti regnet übers ganze Bild
    const n = 40;
    for (let i = 0; i < n; i++) {
      const r1 = (i * 0.6180339) % 1, r2 = (i * 0.7548776) % 1, x = view.x + r1 * view.w + Math.sin(u * 3 + i) * 12, y = view.y + ((r2 * view.h + u * (60 + r1 * 60)) % view.h);
      ctx.fillStyle = ['#e8303a', '#ffd34d', '#2f9fd6', '#3d8b2f', '#f5a3c7', '#fff'][i % 6];
      ctx.globalAlpha = evFade(u, D); ctx.save(); ctx.translate(x, y); ctx.rotate(u * 4 + i); ctx.fillRect(-3, -1.5, 6, 3); ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}
function rainbow() { // hinter den Bergen (vor dem Hintergrund-Cache gezeichnet)
  if (evNow?.k !== 'regenbogen') return;
  const u = time - evNow.t0, cx = view.x + view.w * 0.55, R = ALPS * T * 0.85;
  ctx.globalAlpha = evFade(u, EVENTS.regenbogen.dur) * 0.4;
  ['#e8303a', '#f28c28', '#ffd34d', '#4fb84a', '#2f9fd6', '#6a4fc4'].forEach((c, i) => { ctx.strokeStyle = c; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(cx, 10, R - i * 8, Math.PI, 0); ctx.stroke(); });
  ctx.globalAlpha = 1;
}

// ---- Deko-Zeichnungen (x/y = Fusspunkt) ----
const DECO_DRAW = {
  filiale(x, y, d) { // auf Bauplätzen kleiner (d.s)
    const s = d?.s || 1; if (s === 1) return DECO_DRAW.filiale1(x, y);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s); DECO_DRAW.filiale1(0, 0); ctx.restore();
  },
  filiale1(x, y) { // Händler-Zweigstelle: Lagerhalle mit Rolltor und Laderampe, davor Parkplatz mit 4 Feldern
    const px0 = x + FIL[0] * T + 6, pw = (FIL[1] - FIL[0]) * T - 12, py0 = y + 0.3 * T, ph = (FIL[3] - 0.3) * T - 10;
    ctx.fillStyle = '#b9b2a2'; rrect(px0 - 5, py0 - 5, pw + 10, ph + 10, 10); ctx.fill(); // Randstein
    ctx.fillStyle = '#5d6166'; rrect(px0, py0, pw, ph, 7); ctx.fill();
    ctx.fillStyle = '#e8e2d0'; for (let i = 0; i <= FIL_BAY.length; i++) { const bx = x + (FIL_BAY[0] - 0.575 + i * 1.15) * T; ctx.fillRect(bx - 1.5, py0 + 8, 3, ph - 16); } // Parkfeld-Striche
    const w = 200, h = 78, x0 = x - w / 2;
    ellipse(x + 6, y, w / 2 + 12, 10, 'rgba(0,0,0,.22)');
    const g = ctx.createLinearGradient(x0, 0, x0 + w, 0); g.addColorStop(0, '#b4c4ce'); g.addColorStop(1, '#7d93a2'); ctx.fillStyle = g; ctx.fillRect(x0, y - h, w, h);
    for (let px = x0 + 4; px < x0 + w; px += 7) line('rgba(255,255,255,.18)', 1.5, px, y - h, px, y); // Wellblech
    ctx.fillStyle = '#3f5563'; ctx.beginPath(); ctx.moveTo(x0 - 8, y - h); ctx.lineTo(x0 + 16, y - h - 18); ctx.lineTo(x0 + w - 16, y - h - 18); ctx.lineTo(x0 + w + 8, y - h); ctx.fill(); // Dach
    ctx.fillStyle = '#f4f4f0'; ctx.fillRect(x0 + 8, y - 58, 60, 58); shopWin(x0 + 14, y - 52, 48, 22, '#4a4f56'); shopWin(x0 + 14, y - 26, 22, 26, '#4a4f56'); // Büro
    haendlerMann(x0 + 50, y - 20); ctx.fillStyle = '#d0c4a8'; ctx.fillRect(x0 + 38, y - 10, 26, 10);
    for (let i = 0; i < 2; i++) { // zwei Rolltore mit Rampe
      const rx = x0 + 80 + i * 58; ctx.fillStyle = '#2f3b44'; ctx.fillRect(rx - 3, y - 56, 52, 56);
      const op = 28 + Math.sin(time * 0.6 + i * 2) * 8; ctx.fillStyle = '#c9ced2'; ctx.fillRect(rx, y - 53, 46, 53 - op);
      for (let py = y - 48; py < y - op; py += 5) line('#9aa1a7', 1, rx, py, rx + 46, py);
      crate(rx + 23, y - 6, ['#d8332a', '#e0b54a'][i], 8);
      ctx.fillStyle = '#ffd23a'; ctx.fillRect(rx - 3, y - 6, 52, 6); for (let j = 0; j < 5; j++) { ctx.fillStyle = '#2a2a2a'; ctx.fillRect(rx - 1 + j * 10, y - 6, 5, 6); }
    }
    ctx.fillStyle = '#d52b1e'; rrect(x - 62, y - h + 4, 124, 18, 5); ctx.fill();
    ctx.font = '800 11px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText($t`ZWEIGSTELLE 💰`, x, y - h + 17);
    flagPole(x0 + w - 12, y - h - 14, 40, 18, 3);
  },
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
    arrow(y - 54, 1, $t`${P.name}see` + ' 5 min'); arrow(y - 42, -1, $t`Alp` + ' 2 h 30 min');
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

const vig = { c: null, k: '' };
function vignette() { // weicher dunkler Rand und warmes Licht oben links – ein vorberechnetes Bild, kostet pro Frame nur ein drawImage
  const k = W + 'x' + H;
  if (vig.k !== k) {
    vig.k = k; vig.c = document.createElement('canvas'); vig.c.width = Math.max(1, W >> 1); vig.c.height = Math.max(1, H >> 1);
    const x = vig.c.getContext('2d'), w = vig.c.width, h = vig.c.height;
    const r = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    r.addColorStop(0, 'rgba(30,25,10,0)'); r.addColorStop(1, 'rgba(30,25,10,.28)'); x.fillStyle = r; x.fillRect(0, 0, w, h);
    const l = x.createLinearGradient(0, 0, w * 0.6, h * 0.6); l.addColorStop(0, 'rgba(255,230,160,.12)'); l.addColorStop(1, 'rgba(255,230,160,0)'); x.fillStyle = l; x.fillRect(0, 0, w, h);
  }
  ctx.drawImage(vig.c, 0, 0, W, H);
}
function render() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  calcZoom();
  const vw = W / ZOOM, vh = H / ZOOM, cam = (p, v, w) => v >= w ? (w - v) / 2 : clamp(p - v / 2, 0, w - v); // kleiner als Bildschirm: mittig
  const camX = cam(G.px, vw, WORLD.w * T), camY = cam(G.py - 30 + ALPS * T, vh, (WORLD.h + ALPS) * T) - ALPS * T; // oben: Alpen-Kulisse
  ctx.fillStyle = '#3f6e2a'; ctx.fillRect(0, 0, W, H);
  // nur zeichnen, was (fast) im Bild ist; y = Fusspunkt, Gebäude ragen bis ~250 px nach oben
  const vis = (x, y) => x > camX - 200 && x < camX + vw + 200 && y > camY - 60 && y < camY + vh + 260;
  ctx.setTransform(DPR * ZOOM, 0, 0, DPR * ZOOM, -camX * DPR * ZOOM, -camY * DPR * ZOOM);
  Object.assign(view, { x: camX, y: camY, w: vw, h: vh });
  drawSky(camX, vw); rainbow(); drawBg(camX, camY, vw, vh);
  ctx.lineCap = ctx.lineJoin = 'round';
  seasonBack(camX, vw);
  if (G.deco.some(d => d.type === 'gondelbahn')) gondola();
  brookGlitter(); bridge(RIVER_W[7][0] * T, RIVER_W[7][1] * T);
  lakeLive(); lakeDecos(); seasonGround();
  // Weide-Zaun
  for (const P of pastures()) {
    const pa = { x: P.x * T, y: P.y * T, w: P.w * T, h: P.h * T };
    ctx.fillStyle = 'rgba(140,200,90,.18)'; ctx.fillRect(pa.x, pa.y, pa.w, pa.h);
    ctx.strokeStyle = '#8b6a43'; ctx.lineWidth = 3; ctx.strokeRect(pa.x, pa.y, pa.w, pa.h); ctx.strokeRect(pa.x, pa.y - 8, pa.w, pa.h);
    ctx.fillStyle = '#6b4a2b'; for (let x = pa.x; x <= pa.x + pa.w; x += T) { ctx.fillRect(x - 2, pa.y - 14, 4, 16); ctx.fillRect(x - 2, pa.y + pa.h - 14, 4, 16); }
    ctx.fillStyle = '#4f8ec9'; rrect(pa.x + pa.w - 90, pa.y + pa.h - 40, 60, 22, 6); ctx.fill(); // Wassertrog
  }
  for (const s of sightsOn()) if (s.hub) drawHub(s); // Pflaster der Geschäftszentren unter die freien Plätze
  // freie Plätze
  ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2;
  for (const a in AREAS) {
    const used = new Set(G.things.filter(t => THINGS[t.type].area === a).map(t => t.slot));
    for (let i = 0, n = slotsAvail(a); i < n; i++) {
      if (used.has(i)) continue;
      const p = slotPos(a, i); if (!vis(p.x, p.y)) continue;
      if (a === 'acker') ctx.strokeRect(p.x - 2.5 * T, p.y - 1.5 * T, 5 * T, 3 * T);
      else if (AREAS[a].hub) { if (AREAS[a].ground > '#b') ctx.strokeStyle = 'rgba(40,40,40,.4)'; ctx.strokeRect(p.x - 1.3 * T, p.y - 2 * T, 2.6 * T, 2.2 * T); ctx.strokeStyle = 'rgba(255,255,255,.55)'; } // helles Pflaster: dunkel stricheln
      else if (a === 'dorf') ctx.strokeRect(p.x - 1.3 * T, p.y - 2 * T, 2.6 * T, 2.2 * T);
      else { ctx.beginPath(); ctx.ellipse(p.x, p.y, 20, 9, 0, 0, 7); ctx.stroke(); }
    }
  }
  ctx.setLineDash([]);
  drawLot(); drawRails(camX, vw);
  const sOn = sightsOn().filter(s => !s.town && (s.x + s.w / 2) * T > camX - 50 && (s.x - s.w / 2) * T < camX + vw + 50 && s.y * T > camY - 60 && (s.y - s.h) * T < camY + vh + 60);
  for (const s of sOn) if (!s.hub && SIGHTS[s.k].flat) SIGHT_DRAW[s.k](s.x * T, s.y * T, s.w * T, s.h * T); // flach: man läuft darüber
  for (const t of G.things) if (t.type === 'feld' && vis(t.x, t.y)) drawField(t);
  // nach y sortiert zeichnen
  const list = G.things.filter(t => t.type !== 'feld' && vis(pos(t).x, pos(t).y)).map(t => [pos(t).y, t]).concat(FIXED_E.map(f => [f.y, f]), [[G.py, null]],
    G.deco.filter(d => DECOS[d.type].where === 'land' && vis(d.x, d.y)).map(d => [d.y, d]), trucks.filter(k => vis(k.x, k.y)).map(k => [k.y, { truck: k }]), trains.filter(k => vis(trainX(k) + 100, k.y)).map(k => [k.y, { train: k }]), folk.filter(f => f.home && vis(f.x, f.y)).map(f => [f.y, { folk: f }]), evNow && !EVENTS[evNow.k].sky ? [[evNow.y, { ev: evNow }]] : [], townOn().filter(b => vis(b.x * T, b.y * T)).map(b => [b.y * T, { town: b }]),
    sOn.filter(s => !s.hub && !SIGHTS[s.k].flat).map(s => [s.y * T, { sight: s }]));
  const gh = G.carry && ghostPos();
  if (gh) list.push([gh.y, { ghost: G.carry, ...gh }]);
  list.sort((a, b) => a[0] - b[0]);
  for (const [, t] of list) {
    if (!t) drawPlayer();
    else if (t.truck) drawTruck(t.truck);
    else if (t.train) drawTrain(t.train);
    else if (t.folk) drawFolk(t.folk);
    else if (t.ev) evDraw(t.ev, time - t.ev.t0);
    else if (t.town) drawTown(t.town);
    else if (t.sight) SIGHT_DRAW[t.sight.k](t.sight.x * T, t.sight.y * T, t.sight.w * T, t.sight.h * T);
    else if (t.ghost) { // Vorschau: so würde es stehen
      const ok = decoSpotOk(t.x, t.y);
      ctx.globalAlpha = 0.85; ellipse(t.x, t.y, 22, 8, ok ? 'rgba(80,200,80,.45)' : 'rgba(220,50,40,.5)');
      ctx.globalAlpha = 0.6; DECO_DRAW[t.ghost](t.x, t.y, { id: 0, s: ok || 1 }); ctx.globalAlpha = 1;
    }
    else if (DECOS[t.type] && !THINGS[t.type]) DECO_DRAW[t.type](t.x, t.y, t);
    else if (t.type === 'baum') drawTree(t);
    else if (t.type === 'kuh') drawCow(t);
    else (DRAW[t.type] || DRAW.default)(t.x, t.y, t);
  }
  for (const p of particles) { ctx.fillStyle = p.c ? `rgba(${p.c},${Math.min(1, p.life * 4)})` : `rgba(230,230,230,${p.life / 3})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  // Pakete auf dem Weg
  ctx.font = '16px system-ui'; ctx.textAlign = 'center';
  for (const k of packages) {
    const x = k.x0 + (k.x1 - k.x0) * k.t, y = k.y0 + (k.y1 - k.y0) * k.t - Math.sin(Math.PI * k.t) * 40;
    ctx.fillStyle = '#b07a42'; ctx.fillRect(x - 8, y - 6, 16, 12); ctx.fillText(k.icon, x, y - 8);
  }
  // Namen, Status, Warnungen
  for (const t of FIXED_E) label(t.x, t.y + 18, t.name, 14);
  for (const b of branches()) if (vis(b.x, b.y)) label(b.x, b.y + (FIL[3] * (b.s || 1) + 0.1) * T, DECOS[b.type].name, 13);
  for (const s of sOn) s.hub ? label(s.x * T, s.y * T + 22, `${s.hub.icon} ${s.hub.name}`, 18) : label(s.x * T, s.y * T + 18, `${G.pass[s.k] ? '✅' : '📸'} ${SIGHTS[s.k].name}`, 14);
  for (const t of G.things) {
    const p = pos(t); if (!vis(p.x, p.y)) continue;
    const d = THINGS[t.type], top = topOf(t);
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
  balloons(); seasonFx(camX, camY, vw, vh); if (evNow) evSky(evNow, time - evNow.t0);
  for (const f of floaters) { ctx.globalAlpha = clamp(1.6 - f.t, 0, 1); label(f.x, f.y, f.text, 18); }
  ctx.globalAlpha = 1;
  // Bildschirm-Joystick
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  vignette();
  if (joy) {
    const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy), k = l > 50 ? 50 / l : 1;
    ellipse(joy.x0, joy.y0, 55, 55, 'rgba(255,255,255,.18)');
    ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(joy.x0, joy.y0, 55, 0, 7); ctx.stroke();
    ellipse(joy.x0 + dx * k, joy.y0 + dy * k, 24, 24, 'rgba(255,255,255,.75)');
  }
}

let last = 0;
function loop(t) {
  if (!G || $('#game').hidden) { loopOn = false; AU.pause(); return; } // ausserhalb des Spiels steht alles still, show('game') startet neu
  requestAnimationFrame(loop);
  // Akku: 30 fps beim Spielen, 10 hinter offenem Laden/Cockpit, 15 nach 10 s ohne Eingabe. -4 ms Toleranz fürs Frame-Raster
  const fps = !$('#shop').hidden || !$('#plan').hidden || !$('#info').hidden ? 10 : moving || joy || t - lastInput < 10000 ? 30 : 15;
  if (t - last < 1000 / fps - 4) return;
  let el = Math.min(0.25, (t - last) / 1000 || 0); last = t;
  while (el > 0) { const dt = Math.min(0.05, el); el -= dt; update(dt); tickTime(dt); } // Teilschritte: tiefe fps verlangsamen das Spiel nicht
  render();
}
let lastInput = 0;
for (const ev of ['pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { lastInput = performance.now(); }, { passive: true, capture: true });
renderSelect();

'use strict';
// Alle Klänge werden live mit WebAudio erzeugt – keine Sound-Dateien nötig.
// BED = Dauerklang je Ort, EV = wiederkehrendes Geräusch [alle X Sekunden, Funktion(lautstärke)]
const AU = (() => {
  let ac = null, master = null, nb = null, on = true;
  const beds = {}, nextEv = {};

  function init() {
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
        nb = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
        const d = nb.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      ac.resume();
    } catch (e) { ac = null; }
  }
  const filt = (type, f, q = 1) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const noise = () => { const s = ac.createBufferSource(); s.buffer = nb; s.loop = true; s.start(); return s; };
  function osc(type, f) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; }
  function env(g, t, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
  function tone(type, f0, f1, dur, vol, delay = 0) {
    const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    env(g, t, vol, dur); o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function burst(dur, vol, ft, ff, q = 1, delay = 0) {
    const t = ac.currentTime + delay, s = ac.createBufferSource(), g = ac.createGain();
    s.buffer = nb; env(g, t, vol, dur);
    s.connect(filt(ft, ff, q)).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  function moo(v) {
    const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(115, t); o.frequency.linearRampToValueAtTime(150, t + 0.35); o.frequency.linearRampToValueAtTime(100, t + 1.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35 * v, t + 0.2); g.gain.setValueAtTime(0.35 * v, t + 1.0); g.gain.linearRampToValueAtTime(0, t + 1.5);
    o.connect(filt('lowpass', 650, 3)).connect(g).connect(master); o.start(t); o.stop(t + 1.6);
  }

  // Kuhglocke: unharmonische Teiltöne, kurz und blechern
  function bell(v, delay = 0) { tone('triangle', 520, 505, 0.7, 0.16 * v, delay); tone('sine', 1290, 1270, 0.45, 0.08 * v, delay); tone('sine', 2010, 1990, 0.25, 0.04 * v, delay); }
  // Alphorn: nur Naturtöne (Obertöne von F), weich angeblasen
  function alphorn(v) {
    const f = 87.3, mel = [[6, 0.7], [8, 0.5], [9, 0.5], [8, 0.9], [6, 0.6], [5, 0.6], [6, 1.6]];
    let t = ac.currentTime;
    for (const [h, d] of mel) {
      const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sawtooth'; o.frequency.value = f * h;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * v, t + 0.09); g.gain.setValueAtTime(0.16 * v, t + d - 0.08); g.gain.linearRampToValueAtTime(0, t + d + 0.05);
      o.connect(filt('lowpass', 1100, 1.5)).connect(g).connect(master); o.start(t); o.stop(t + d + 0.1); t += d;
    }
  }
  function woof(v) { for (let i = 0; i < 2; i++) { tone('sawtooth', 260, 140, 0.13, 0.2 * v, i * 0.25); burst(0.1, 0.15 * v, 'lowpass', 900, 1, i * 0.25); } }

  const BED = {
    brunnen: () => noise().connect(filt('bandpass', 2200, 0.6)),                  // Wasser plätschert
    feld: () => noise().connect(filt('bandpass', 900, 0.5)),                       // Wind im Getreide
    muehle: () => noise().connect(filt('lowpass', 160, 2)),                        // Mahlstein rumpelt
    baeckerei: () => noise().connect(filt('lowpass', 380)),                        // Ofen faucht
    molkerei: () => osc('sawtooth', 55).connect(filt('lowpass', 220)),             // Pumpe/Rührwerk
    kaeserei: () => osc('sawtooth', 46).connect(filt('lowpass', 160)),
    konditorei: () => osc('square', 170).connect(filt('lowpass', 500)),            // Rührmaschine
  };
  const BED_VOL = { brunnen: 0.09, feld: 0.07, muehle: 0.45, baeckerei: 0.25, molkerei: 0.18, kaeserei: 0.15, konditorei: 0.05 };
  const EV = {
    kuh: [2.2, v => { if (Math.random() < 0.25) moo(v); else for (let i = 0, n = 1 + Math.random() * 3 | 0; i < n; i++) bell(v, i * 0.28 + Math.random() * 0.1); }], // Muh & Kuhglocken
    alphorn: [9, alphorn],
    murmeltier: [5, v => tone('sine', 2900, 2400, 0.35, 0.12 * v)],                                                             // Pfiff
    bernhardiner: [7, woof],
    uhrturm: [12, v => [0, 1, 2].forEach(i => bell(v * 0.8, i * 0.6))],
    baum: [2.5, v => { for (let i = 0; i < 3; i++) tone('sine', 2600 + Math.random() * 900, 4300, 0.08, 0.07 * v, i * 0.11); }], // Vögel
    feld: [3.5, v => { for (let i = 0; i < 4; i++) burst(0.03, 0.08 * v, 'bandpass', 5200, 8, i * 0.07); }],                    // Grille
    muehle: [1.8, v => tone('sawtooth', 75, 62, 0.6, 0.12 * v)],                                                               // Holz knarrt
    baeckerei: [0.3, v => burst(0.025, 0.3 * v * Math.random(), 'highpass', 2500)],                                             // Feuer knistert
    molkerei: [2.4, v => { tone('sine', 140, 60, 0.25, 0.4 * v); burst(0.5, 0.12 * v, 'highpass', 3000, 1, 0.2); }],          // Ventil zischt
    kaeserei: [1.6, v => tone('sine', 900, 1500, 0.07, 0.1 * v)],                                                              // Molke tropft
    konditorei: [5, v => { tone('triangle', 1760, 1760, 0.15, 0.1 * v); tone('triangle', 1760, 1760, 0.15, 0.1 * v, 0.25); }], // Ofen-Timer
  };

  function update(levels) {
    if (!ac || !on) return;
    const now = ac.currentTime;
    for (const k in levels) {
      const v = levels[k];
      if (BED[k]) {
        if (!beds[k]) { const g = ac.createGain(); g.gain.value = 0; BED[k]().connect(g).connect(master); beds[k] = g; }
        beds[k].gain.setTargetAtTime(v * BED_VOL[k], now, 0.3);
      }
      if (EV[k] && v > 0.05 && !(now < nextEv[k])) {
        const [every, fn] = EV[k];
        nextEv[k] = now + every * (0.6 + Math.random() * 0.8);
        fn(v);
      }
    }
  }
  const SFX = {
    pop: () => tone('sine', 400, 900, 0.12, 0.3),
    drop: () => tone('square', 320, 180, 0.08, 0.08),
    cash: () => { burst(0.08, 0.3, 'highpass', 4000); tone('triangle', 1318, 1318, 0.12, 0.25, 0.05); tone('triangle', 1760, 1760, 0.4, 0.25, 0.15); },
    buy: () => { tone('sine', 1046, 1046, 0.5, 0.25); tone('sine', 1568, 1568, 0.6, 0.2, 0.12); },
    grow: () => [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.3, 0.2, i * 0.13)),
    no: () => tone('square', 200, 140, 0.2, 0.1),
  };
  return {
    init, update,
    sfx: k => { if (ac && on) try { SFX[k](); } catch (e) {} },
    toggle: () => { on = !on; if (master) master.gain.value = on ? 0.5 : 0; return on; },
  };
})();

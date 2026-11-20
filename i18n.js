'use strict';
// ===== Sprachen =====
// Deutsch ist die Quelle. lang/<code>.js setzt TR (wird in index.html vor dieser Datei geladen).
// UI-Texte: $t`Text ${x}` sucht den deutschen Text in TR.ui – Werte stehen dort als {} (oder {0}, {1} zum Umstellen).
// Spielinhalte aus data.js werden nach ID übersetzt. Fehlt eine Übersetzung, bleibt Deutsch stehen.
const LANGS = { de: 'Deutsch', fr: 'Français', it: 'Italiano', en: 'English' };
var TR; // ponytail: Schlüssel = deutscher Text; wer ihn ändert, muss lang/*.js mitziehen
function $t(s, ...v) { let i = 0; const k = s.join('{}'); return (TR?.ui[k] ?? k).replace(/\{(\d*)\}/g, (_, n) => v[n ? +n : i++]); }
(() => {
  document.documentElement.lang = LANG;
  document.getElementById('langs').innerHTML = Object.entries(LANGS).map(([k, n]) => `<button data-lang="${k}" class="${k === LANG ? 'on' : ''}">${n}</button>`).join('');
  document.getElementById('langs').onclick = e => {
    const k = e.target.dataset.lang; if (!k || k === LANG) return;
    try { localStorage.setItem('lw_lang', k); } catch (err) {}
    location.reload();
  };
  if (!TR) return;
  const set = (o, t) => { if (!t) return; if (typeof t === 'string') o.name = t; else { if (t[0]) o.name = t[0]; if (t[1]) o.info = t[1]; } };
  for (const k in ITEMS) set(ITEMS[k], TR.items?.[k]);
  for (const k in THINGS) set(THINGS[k], TR.things?.[k]);
  for (const k in DECOS) set(DECOS[k], TR.decos?.[k]);
  for (const k in SIGHTS) set(SIGHTS[k], TR.sights?.[k]);
  for (const k in AREAS) set(AREAS[k], TR.areas?.[k]);
  for (const f of FIXED) set(f, TR.fixed?.[f.type]);
  for (const k in TOOLS) { const t = TR.tools?.[k]; if (!t) continue; TOOLS[k].name = t[0]; t[1].forEach((l, i) => set(TOOLS[k].levels[i], l)); }
  if (TR.hof) HOF_ADD.splice(0, HOF_ADD.length, ...TR.hof);
  // festes HTML (index.html): Textknoten und title/placeholder
  const tx = s => TR.ui[s.trim()];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = w.nextNode());) { const t = tx(n.nodeValue); if (t) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), t); }
  for (const el of document.querySelectorAll('[title],[placeholder]')) for (const a of ['title', 'placeholder']) { const t = el.getAttribute(a) && tx(el.getAttribute(a)); if (t) el.setAttribute(a, t); }
  document.title = TR.ui[document.title] || document.title;
})();

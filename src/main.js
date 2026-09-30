import './style.css';
import { View } from './view.js';
import { BenchWorld } from './bench/world.js';
import { benchSpec } from './bench/board.js';
import { Runtime } from './sim/runtime.js';
import { LESSONS } from './lessons/index.js';
import { buildControls, bandHtml } from './ui/controls.js';
import { Meter } from './ui/meter.js';
import { Scope } from './ui/scope.js';
import { Schematic } from './ui/schematic.js';
import { GRAPHS } from './ui/graphs.js';
import { fmt, fmtR, fmtC, LEDS } from './sim/parts.js';
import { viridisCss } from './bench/util3d.js';

/* =====================================================================
   APP. One station at a time: its circuit runs in a Runtime, the world
   draws it, and the panels read from the same solution every frame.
   ===================================================================== */
const $ = (id) => document.getElementById(id);
const STORE = 'circuit-bench-v1';
const app = {
  idx: 0, L: null, p: null, params: {}, done: new Set(), stats: {}, hold: {},
  opts: { dots: true, electrons: false, strips: true, labels: true }, rate: 1,
  rt: null, probe: null, hover: null, fig3: 'schematic', dirty: false, layoutKey: '', meterMode: 'V'
};

// theme tokens, re-read when the colour scheme changes
let cssCache = {};
const css = (n) => cssCache[n] ?? (cssCache[n] = getComputedStyle(document.documentElement).getPropertyValue(n).trim());
window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { cssCache = {}; });
new MutationObserver(() => { cssCache = {}; }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (!s) return;
    app.idx = Math.min(LESSONS.length - 1, s.idx | 0); app.params = s.params || {}; app.done = new Set(s.done || []);
    Object.assign(app.opts, s.opts || {}); app.meterMode = s.meter || 'V';
  } catch (e) { /* storage unavailable: start fresh */ }
}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify({ idx: app.idx, params: app.params, done: [...app.done], opts: app.opts, meter: meter.mode })); } catch (e) { /* ignore */ }
}
const ui = { toast(msg, ms = 2800) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(ui._t); ui._t = setTimeout(() => t.classList.remove('show'), ms); } };

/* ---------- views ---------- */
const view = new View($('view3d'), {
  hover: (id, e) => { app.hover = id; showTip(id, e); worldHover(id); },
  click: (id) => { if (!id) return; onPartClick(id); },
  orbit: () => document.querySelectorAll('#views button').forEach(b => b.setAttribute('aria-pressed', 'false'))
});
const bench = new BenchWorld();
bench.onPress = (id, down) => { if (app.L.live && app.L.live.press && id === 'S1') setParam('press', down); };
const worlds = { bench };
const meter = new Meter($('meter'), (m) => { save(); });
const scope = new Scope($('scope'));
const schem = new Schematic($('schem'), {
  hover: (id, e) => { app.schemHover = id; worldHover(id); },
  click: (id) => onPartClick(id)
});
function worldHover(id) { const w = view.world; if (w && w.setHover) w.setHover(id || app.schemHover || null); }

function onPartClick(id) {
  const L = app.L, w = view.world, b = w.parts && w.parts.get(id);
  if (b && b.toggle && L.live && L.live.sw) { setParam('sw', app.p.sw ? 0 : 1); }
  if (app.rt && app.rt.part(id)) { app.probe = id; }
}

/* ---------- stations ---------- */
function renderStations() {
  $('stations').innerHTML = LESSONS.map((L, i) => {
    const n = L.tasks.length, d = L.tasks.filter(t => app.done.has(t.id)).length;
    return `<button class="cell" data-i="${i}" aria-pressed="${i === app.idx}" title="${L.title}"><span class="z"><span>${L.num}</span><span class="${d === n ? 'ok' : ''}">${d}/${n}</span></span><span class="sym">${L.sym}</span><span class="nm">${L.name}</span><i class="bar" style="width:${(d / n * 100).toFixed(0)}%"></i></button>`;
  }).join('');
  $('stations').querySelectorAll('.cell').forEach(c => c.addEventListener('click', () => setLesson(+c.dataset.i)));
  const all = LESSONS.reduce((a, L) => a + L.tasks.length, 0);
  $('progress').innerHTML = `<b>${app.done.size}</b> of ${all} tasks done`;
}
function renderTasks() {
  const L = app.L, n = L.tasks.filter(t => app.done.has(t.id)).length;
  $('taskCount').textContent = `${n} of ${L.tasks.length}`;
  $('tasks').innerHTML = L.tasks.map(t => `<li data-t="${t.id}" class="${app.done.has(t.id) ? 'done' : ''}"><i class="led"></i><span>${t.text}</span></li>`).join('');
}

function setLesson(i) {
  if (app.L && app.L.leave) app.L.leave(app);
  app.idx = i; const L = app.L = LESSONS[i];
  const p = app.p = app.params[L.id] = Object.assign({}, L.defaults, app.params[L.id] || {});
  app.stats[L.id] = app.stats[L.id] || { burnt: {}, replaced: {} };
  $('lessonNum').textContent = `Station ${L.num} of ${LESSONS.length}`;
  $('lessonTitle').textContent = L.title;
  $('lessonText').innerHTML = L.text.map(t => `<p>${t}</p>`).join('');
  $('formula').innerHTML = L.formula.map(f => `<span>${f}</span>`).join('');
  renderStations(); renderTasks();
  app.controls = buildControls($('controls'), L.controls, p, (k, v) => setParam(k, v), L.id);
  const w = worlds[L.world || 'bench'];
  if (view.world !== w) view.setWorld(w); else view.flyTo(w.defaultView);
  if (L.enter) L.enter(app, w);
  app.rt = null; app.layoutKey = ''; rebuild();
  app.probe = L.probe; app.hold = {};
  $('views').innerHTML = Object.keys(w.views).map(k => `<button data-view="${k}" aria-pressed="${k === w.defaultView}">${k}</button>`).join('');
  $('views').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { view.flyTo(b.dataset.view); $('views').querySelectorAll('button').forEach(q => q.setAttribute('aria-pressed', q === b)); }));
  $('vcapTxt').textContent = L.caption || 'Breadboard on the bench. Dot speed shows current, dot colour shows voltage.';
  $('scopeTitle').innerHTML = L.fig2 ? `Fig. 2&nbsp; ${L.fig2}` : 'Fig. 2&nbsp; Oscilloscope';
  $('capScope').innerHTML = L.scope ? `<span style="color:var(--ch1)">CH1</span> ${L.scope.ch1[0]}&nbsp; <span style="color:var(--ch2)">CH2</span> ${L.scope.ch2[0]}` : (L.fig2cap || '');
  app.fig3 = 'schematic'; renderFig3Tabs();
  scope.reset();
  $('displayGrp').querySelector('#optStrips span').textContent = L.world === 'pcb' ? 'Copper voltages' : 'Strip voltages';
  renderTiles(); renderSpec(); updateReadouts();
  $('lesson').scrollIntoView({ block: 'nearest' });
  save();
}
function renderFig3Tabs() {
  const L = app.L, g = L.graph && GRAPHS[L.graph];
  const gt = g ? (typeof g.title === 'function' ? g.title(app.p) : g.title) : null;
  $('schemTitle').innerHTML = `Fig. 3&nbsp; ${app.fig3 === 'graph' && gt ? gt : L.fig3 || 'Schematic'}`;
  $('schemTabs').innerHTML = g ? `<button data-f="schematic" aria-pressed="${app.fig3 === 'schematic'}">Schematic</button><button data-f="graph" aria-pressed="${app.fig3 === 'graph'}">Graph</button>` : '';
  $('schemTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { app.fig3 = b.dataset.f; renderFig3Tabs(); }));
}

/* ---------- parameters and rebuilding ---------- */
function setParam(k, v) {
  const L = app.L, p = app.p;
  if (p[k] === v) return;
  p[k] = v;
  if (L.live && L.live[k] && app.rt) L.live[k](app.rt, v); else app.dirty = true;
  if (L.onParam) L.onParam(k, v, app);
  app.controls.sync(p); save();
  if (L.graph && GRAPHS[L.graph] && typeof GRAPHS[L.graph].title === 'function') renderFig3Tabs();
}
function layoutKey(layout) {
  return JSON.stringify({ parts: layout.parts.map(({ pressed, pos, ...q }) => q), wires: layout.wires, tags: layout.tags });
}
function rebuild() {
  const L = app.L, p = app.p;
  app.dirty = false;
  if (L.world === 'pcb') { app.rt = L.runtime(p, app.rt, app); return; }
  const layout = L.layout(p);
  app.rt = new Runtime(benchSpec(layout, L.hMax ? L.hMax(p) : undefined), app.rt);
  const key = layoutKey(layout);
  if (key !== app.layoutKey) { bench.setLayout(layout); app.layoutKey = key; } else bench.layout = layout;
  if (!app.rt.part(app.probe) && app.probe !== 'PS') app.probe = L.probe;
}

/* ---------- part information for the tooltip, meter and schematic ---------- */
function partInfo(id) {
  const rt = app.rt; if (!rt) return null;
  const P = rt.part(id); if (!P) return null;
  const r = P.read(rt.solver), s = P.spec;
  switch (P.kind) {
    case 'resistor': return { name: `${id}, ${fmtR(P.R)} resistor`, short: fmtR(P.R), v: r.v, i: r.i, p: r.p, R: P.R, bands: true,
      rows: [['Voltage across', fmt(r.v, 'V')], ['Current', fmt(r.i, 'A')], ['Power', fmt(r.p, 'W') + (r.p > P.rating ? ' (over ¼ W)' : '')], ['Temperature', P.burnt ? 'burnt out' : `${r.T.toFixed(0)} °C`]] };
    case 'led': return { name: `${id}, ${P.L.name.toLowerCase()} LED`, short: P.L.name.toLowerCase(), v: r.v, i: r.i, p: r.p, R: null, glow: r.glow,
      rows: [['Voltage across', fmt(r.v, 'V')], ['Current', fmt(r.i, 'A')], ['Brightness', P.burnt ? 'burnt out' : `${Math.round(Math.min(r.glow, 9.99) * 100)} % of 20 mA`], ['Forward voltage', `${P.L.vf} V at 20 mA`]] };
    case 'cap': return { name: `${id}, ${fmtC(P.C)} capacitor`, short: fmtC(P.C), v: r.v, i: r.i, R: null,
      rows: [['Voltage', fmt(r.v, 'V')], ['Current', fmt(r.i, 'A')], ['Charge', fmt(r.q, 'C')], ['Energy', fmt(0.5 * P.C * r.v * r.v, 'J')]] };
    case 'npn': return { name: `${id}, 2N3904 transistor`, short: '2N3904', v: r.vce, vwhat: 'collector to emitter voltage', i: r.ic, R: null,
      rows: [['V collector to emitter', fmt(r.vce, 'V')], ['Collector current', fmt(r.ic, 'A')], ['Base current', fmt(r.ib, 'A')], ['V base to emitter', fmt(r.vbe, 'V')]] };
    case 'ic555': return { name: `${id}, NE555 timer`, short: 'NE555', v: r.v, vwhat: 'supply, pin 8 to pin 1', i: r.i, R: null,
      rows: [['Supply', fmt(r.v, 'V')], ['Output', `${fmt(r.out, 'V')} (${r.q ? 'high' : 'low'})`], ['Supply current', fmt(r.i, 'A')]] };
    case 'supply': return { name: 'Bench supply', short: `${(+s.V).toFixed(1)} V`, v: r.v, vwhat: 'voltage at its terminals', i: r.i, R: null,
      rows: [['Set to', `${(+s.V).toFixed(2)} V`], ['Delivering', fmt(r.i, 'A')], ['Power', fmt(r.p, 'W')]] };
    case 'button': return { name: `${id}, push button`, short: 'button', v: r.v, i: r.i, R: P.pressed ? 0.03 : null,
      rows: [['State', P.pressed ? 'pressed, closed' : 'up, open'], ['Current', fmt(r.i, 'A')]] };
    case 'slide': return { name: `${id}, slide switch`, short: 'switch', v: 0, i: r.i, R: 0.03,
      rows: [['Position', P.pos ? 'discharge' : 'charge'], ['Current', fmt(r.i, 'A')]] };
    case 'wire': return { name: 'Jumper wire', short: 'wire', v: r.v, i: r.i, R: 0.01, rows: [['Current', fmt(r.i, 'A')], ['Drop', fmt(r.v, 'V')]] };
    default: return { name: id, v: r.v, i: r.i, R: null, rows: [] };
  }
}
function showTip(id, e) {
  const tip = $('tip');
  if (!id || !partInfo(id)) { tip.hidden = true; app.tipId = null; return; }
  app.tipId = id;
  if (e) { const r = $('view3d').getBoundingClientRect(); app.tipAt = [e.clientX - r.left, e.clientY - r.top]; }
  fillTip(); tip.hidden = false;
}
function fillTip() {
  const tip = $('tip'), inf = partInfo(app.tipId); if (!inf) { tip.hidden = true; return; }
  const P = app.rt.part(app.tipId);
  tip.innerHTML = `<b>${inf.name}</b>${inf.bands ? bandHtml(P.R) : ''}` + inf.rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
  const [x, y] = app.tipAt || [0, 0], vr = $('view3d').getBoundingClientRect();
  tip.style.left = Math.min(vr.width - tip.offsetWidth - 12, x + 16) + 'px';
  tip.style.top = Math.min(vr.height - tip.offsetHeight - 12, y + 16) + 'px';
}

/* ---------- readouts ---------- */
function splitUnit(x, unit, dig = 3) { const t = fmt(x, unit, dig), k = t.lastIndexOf(' '); return `${t.slice(0, k)}<small>${t.slice(k + 1)}</small>`; }
function renderTiles() { $('vals').innerHTML = [0, 1, 2, 3].map(i => `<div><span class="k"></span><span class="v"></span><span class="x"></span></div>`).join(''); }
function updateTiles() {
  const tiles = app.L.tiles(app.rt, app.p), els = $('vals').children;
  tiles.forEach((t, i) => {
    const el = els[i]; if (!el) return;
    el.children[0].innerHTML = (t.ch ? `<i style="background:var(--ch${t.ch})"></i>` : '') + t.k;
    el.children[1].innerHTML = t.raw ? `${t.v.toFixed(t.dig ?? (Math.abs(t.v) < 10 ? 1 : 0))}<small>${t.u}</small>` : splitUnit(t.v, t.u);
    el.children[1].classList.toggle('warn', !!t.warn);
    el.children[2].innerHTML = t.x || '';
  });
}
function renderSpec() { $('spec').innerHTML = app.L.spec(app.rt, app.p).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join(''); }
function updateReadouts() {
  const L = app.L, rt = app.rt;
  const [lvl, text] = L.status(rt, app.p);
  $('dot').className = 'led ' + lvl; $('status').textContent = text;
  updateTiles();
  let anyBurnt = false; for (const P of rt.parts.values()) if (P.burnt) anyBurnt = true;
  $('replaceGrp').hidden = !anyBurnt;
  const vmax = vmaxOf();
  $('cbarTicks').innerHTML = [0, 0.5, 1].map(f => `<span class="tk" style="left:${(8 + 92 * f).toFixed(1)}%">${(vmax * f).toFixed(vmax * f < 10 && f ? 1 : 0)} V</span>`).join('');
  $('clock').textContent = `t ${rt.t.toFixed(1)} s · ${app.rate ? (app.rate === 1 ? 'real time' : '÷ ' + Math.round(1 / app.rate)) : 'paused'}${rt.slow < 0.999 ? ` · slowed to ×${rt.slow.toPrecision(2)} for accuracy` : ''}`;
  if (app.tipId) fillTip();
}
const vmaxOf = () => app.L.vmax ? app.L.vmax(app.p) : Math.max(0.5, +app.p.V || 1);

/* ---------- tasks ---------- */
function checkTasks() {
  const L = app.L, st = app.stats[L.id], ctx = { p: app.p, rt: app.rt, r: (id) => app.rt.read(id), stats: st, app };
  for (const t of L.tasks) {
    if (app.done.has(t.id)) continue;
    let ok = false; try { ok = !!t.check(ctx); } catch (e) { ok = false; }
    app.hold[t.id] = ok ? (app.hold[t.id] || 0) + 1 : 0;
    if (app.hold[t.id] >= 2) {
      app.done.add(t.id); save(); renderTasks(); renderStations();
      const li = document.querySelector(`#tasks li[data-t="${t.id}"]`); if (li) li.classList.add('fresh');
      const left = L.tasks.filter(q => !app.done.has(q.id)).length;
      ui.toast(left ? `Done: ${stripTags(t.text)}` : app.idx < LESSONS.length - 1 ? `Station ${L.num} complete. Station ${L.num + 1}, ${LESSONS[app.idx + 1].name}, is next.` : 'Every station complete. You are ready to try KiCad.', 3600);
    }
  }
}
const stripTags = (s) => s.replace(/<[^>]+>/g, '');

/* ---------- controls outside the station ---------- */
function initChrome() {
  const opt = (id, key) => { const b = $(id); b.setAttribute('aria-pressed', app.opts[key]); b.addEventListener('click', () => { app.opts[key] = !app.opts[key]; b.setAttribute('aria-pressed', app.opts[key]); if (key === 'electrons') dotsTip(); save(); }); };
  opt('optDots', 'dots'); opt('optElectrons', 'electrons'); opt('optStrips', 'strips'); opt('optLabels', 'labels');
  const dotsTip = () => { $('dotsTip').textContent = app.opts.electrons ? 'Dots now drift the way electrons do, from − to +. Electrons carry negative charge, so conventional current points the other way.' : 'Dots move in the direction of conventional current, from + to −.'; };
  dotsTip();
  $('rate').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { app.rate = +b.dataset.rate; $('rate').querySelectorAll('button').forEach(q => q.setAttribute('aria-pressed', q === b)); }));
  $('replace').addEventListener('click', () => {
    const st = app.stats[app.L.id];
    for (const P of app.rt.parts.values()) if (P.burnt && P.replace) { P.replace(); st.replaced[P.id] = (st.replaced[P.id] || 0) + 1; ui.toast(`Fitted a new ${P.kind === 'led' ? 'LED' : 'resistor'} as ${P.id}.`); }
    updateReadouts();
  });
  meter.mode = app.meterMode;
}

/* ---------- main loop ---------- */
let last = performance.now(), acc = 0, frameN = 0;
function frame(now) {
  const dt = Math.min(1 / 30, Math.max(1e-4, (now - last) / 1000)); last = now; frameN++;
  const L = app.L;
  if (app.dirty) rebuild();
  const rt = app.rt;
  if (app.rate > 0) {
    const win = L.window ? L.window(app.p) : 5;
    rt.advance(dt, app.rate, L.scope ? (r) => L.scope.get(r, app.p) : null, win / 1200);
  }
  for (const ev of rt.events) if (ev.ev === 'burnt') {
    const st = app.stats[L.id]; st.burnt[ev.id] = (st.burnt[ev.id] || 0) + 1;
    view.world.burst && view.world.burst(ev.id);
    ui.toast(ev.kind === 'led' ? `${ev.id} burnt out. Too much current went through the LED.` : `${ev.id} burnt out after overheating.`, 3600);
  }
  rt.events.length = 0;
  const opts = { ...app.opts, vmax: vmaxOf() };
  view.world.update(rt, app.rate > 0 ? dt : 0, opts);
  view.frame(dt);
  if (L.scope) scope.draw(rt.samples, rt.t, L.window ? L.window(app.p) : 5, L.scope, app.p, css);
  else if (L.drawFig2) L.drawFig2($('scope'), rt, app.p, css, app);
  if (frameN % 2 === 0) drawFig3();
  if (frameN % 3 === 0) { const inf = partInfo(app.probe); meter.draw(inf, css); }
  acc += dt;
  if (acc > 0.2) { acc = 0; updateReadouts(); checkTasks(); if (frameN % 30 < 6) renderSpec(); }
  requestAnimationFrame(frame);
}
function drawFig3() {
  const L = app.L, rt = app.rt;
  if (app.fig3 === 'graph' && L.graph) {
    const c = $('schem'), r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
    GRAPHS[L.graph].draw(g, r.width, r.height, rt, app.p, css);
    schem.boxes = [];
    return;
  }
  const def = typeof L.schematic === 'function' ? L.schematic(app.p, app) : L.schematic;
  schem.draw(def, {
    v: (net) => rt.v(net),
    part: (id) => {
      if (id === 'PS') { const r = rt.read('PS'); return r ? { value: `${(+app.p.V).toFixed(1)} V`, i: r.i } : null; }
      const inf = partInfo(id); return inf ? { value: inf.short, i: inf.i, glow: inf.glow } : null;
    }
  }, { color: true, vmax: vmaxOf(), sel: app.probe, hover: app.hover || app.schemHover }, css);
}

/* ---------- start ---------- */
function main() {
  load(); initChrome();
  setLesson(app.idx);
  $('loading').remove();
  window.__bench = { app, setLesson, setParam, view, bench, LESSONS, partInfo, pause: () => { app.rate = 0; } };
  requestAnimationFrame(frame);
}
main();

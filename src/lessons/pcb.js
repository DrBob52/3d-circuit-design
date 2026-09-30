import { PROJECTS, FAB, NET_HUE, padsOf } from '../pcb/footprints.js';
import { SOLUTIONS } from '../pcb/solutions.js';
import { analyze, ipcCurrent, ipcRise, ipcWidth, trackOhms, padIndex, islandKey } from '../pcb/geom.js';
import { boardRuntime } from '../pcb/runtime.js';
import { fmt, fmtR, fmtC } from '../sim/parts.js';
import { sizeCanvas, nice } from '../ui/scope.js';
import { FONT } from '../bench/util3d.js';

/* =====================================================================
   CIRCUIT BOARD STATIONS
   8: the LED tag from a coin cell, taken apart layer by layer.
   9: lay out a board yourself, check it, and watch it power up.
   ===================================================================== */
const clone = (o) => JSON.parse(JSON.stringify(o));
const PLAN = [0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5];
const netKey = (app, name) => {
  const A = app.pcbA; if (!A) return null;
  const i = A.objs.findIndex(o => o.type === 'pad' && o.net === name);
  return i < 0 ? null : islandKey(A, i);
};

// the anatomy board: the worked tag layout, with the ground return run on the bottom layer through a via
function anatomyBoard(w) {
  const b = clone(SOLUTIONS.tag);
  b.traces[2] = { layer: 'F', w, pts: [[0.1, 1.27], [-0.6, 1.27]] };
  b.traces.push({ layer: 'B', w, pts: [[-0.6, 1.27], [-2.2, 1.27]] });
  b.vias.push({ x: -0.6, y: 1.27 });
  for (const t of b.traces) t.w = w;
  return b;
}
const trackLen = (b) => b.traces.reduce((a, t) => a + t.pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - t.pts[i][0], p[1] - t.pts[i][1]), 0), 0);

function tagSchematic(app, project) {
  const k = (n) => netKey(app, n) || n;
  return {
    w: 12, h: 7,
    parts: [{ id: 'J1', ref: 'PS', sym: 'header', at: [1.5, 3.5], lab: [-0.9, -1.95] }, { id: 'R1', sym: 'resistor', at: [6, 1] }, { id: 'D1', sym: 'led', at: [9.5, 3.5], rot: 90, color: 'red' }],
    wires: [{ net: k('VCC'), pts: [[3, 2.75], [3.6, 2.75], [3.6, 1], [4.5, 1]] }, { net: k('LED'), pts: [[7.5, 1], [9.5, 1], [9.5, 2]] }, { net: k('GND'), pts: [[9.5, 5], [9.5, 6], [3.6, 6], [3.6, 4.25], [3, 4.25]] }],
    volts: [{ net: k('VCC'), at: [4.4, 2.3] }, { net: k('LED'), at: [10.6, 0.4] }, { net: k('GND'), at: [6.5, 6.6] }],
    grounds: [[6.5, 6]]
  };
}
function blinkerSchematic(app) {
  const k = (n) => netKey(app, n) || n;
  return {
    w: 23, h: 9.9,
    parts: [{ id: 'J1', ref: 'PS', sym: 'header', at: [1.2, 4.5], lab: [-0.7, -1.9] }, { id: 'U1', sym: 'ic555', at: [12, 4.5] }, { id: 'RA', sym: 'resistor', at: [6, 1.5], rot: 90 },
      { id: 'RB', sym: 'resistor', at: [6, 4.5], rot: 90, lab: [0.6, -0.55] }, { id: 'C1', sym: 'cap', at: [4.5, 7.5], rot: 90, lab: [-0.6, -0.1, 'right'] }, { id: 'R3', sym: 'resistor', at: [16.5, 3.5], lab: [-1.3, 1.05] },
      { id: 'D1', sym: 'led', at: [18.5, 6], rot: 90, color: 'red' }, { id: 'C2', sym: 'cap', at: [21, 4.5], rot: 90 }],
    wires: [
      { net: k('VCC'), pts: [[2.7, 3.75], [3, 3.75], [3, 0], [21, 0], [21, 3]] }, { net: k('VCC'), pts: [[12.8, 0], [12.8, 1]] }, { net: k('VCC'), pts: [[11.2, 0], [11.2, 1]] },
      { net: k('DIS'), pts: [[6, 3], [9, 3]] },
      { net: k('THR'), pts: [[4.5, 6], [9, 6]] }, { net: k('THR'), pts: [[9, 4.5], [8.5, 4.5], [8.5, 6]] },
      { net: k('OUT'), pts: [[15, 3.5], [15, 3.5]] }, { net: k('LED'), pts: [[18, 3.5], [18.5, 3.5], [18.5, 4.5]] },
      { net: k('GND'), pts: [[2.7, 5.25], [3, 5.25], [3, 9], [21, 9], [21, 6]] }, { net: k('GND'), pts: [[12, 8], [12, 9]] }, { net: k('GND'), pts: [[18.5, 7.5], [18.5, 9]] }, { net: k('GND'), pts: [[4.5, 9], [4.5, 9]] }
    ],
    dots: [[6, 3], [6, 6], [8.5, 6], [6, 0], [11.2, 0], [12.8, 0], [4.5, 9], [12, 9], [18.5, 9]],
    volts: [{ net: k('VCC'), at: [4.6, -0.5] }, { net: k('THR'), at: [7.2, 6.65], label: 'C1' }, { net: k('LED'), at: [19.9, 2.8] }, { net: k('GND'), at: [8, 9.65] }],
    grounds: [[15, 9]]
  };
}

/* ---------------- station 8 ---------------- */
export const anatomy = {
  id: 'anatomy', num: 8, sym: 'PCB', name: 'Inside a board', title: 'Inside a circuit board', world: 'pcb',
  text: [
    'A circuit board is a breadboard made permanent. Copper tracks take the place of jumper wires, and the parts are soldered onto flat copper pads.',
    'Most boards are a sandwich. A glass fibre core called FR-4 sits in the middle with a thin sheet of copper on each side. Green solder mask covers the copper that solder should stay off, and white silkscreen prints the labels.',
    'Standard copper is 35 µm thick, sold as 1 oz. A track’s width decides how much current it carries before it warms up. The IPC-2221 standard gives the rule of thumb most board calculators use.',
    'A via is a plated hole that carries a connection through to the other side. This board runs its ground return along the bottom through one.'
  ],
  formula: ['I = 0.048 × ΔT<sup>0.44</sup> × A<sup>0.725</sup>', 'A = width × thickness, in square mils'],
  caption: 'An LED tag, 7 × 6 mm, powered by a coin cell. Pull the layers apart to see how it is made.',
  defaults: { explode: 0, silk: true, mask: true, copper: true, core: true, w: 0.25, oz: 1, plan: 7 },
  controls: [
    { type: 'slider', key: 'explode', label: 'Pull the layers apart', min: 0, max: 1, step: 0.01, unit: '', fmt: (v) => Math.round(v * 100) + ' %' },
    { type: 'toggles', label: 'Layers shown', items: [['silk', 'Silkscreen'], ['mask', 'Solder mask'], ['copper', 'Copper'], ['core', 'FR-4 core']] },
    { type: 'slider', key: 'w', label: 'Track width', min: 0.1, max: 1.5, step: 0.005, unit: 'mm', dig: 3 },
    { type: 'cells', key: 'oz', label: 'Copper weight', options: [{ k: 0.5, sym: '½ oz', z: '17.5 µm', nm: 'thin' }, { k: 1, sym: '1 oz', z: '35 µm', nm: 'standard' }, { k: 2, sym: '2 oz', z: '70 µm', nm: 'heavy' }] },
    { type: 'steps', key: 'plan', label: 'Current to plan for', values: PLAN, fmt: (v) => fmt(v, 'A') }
  ],
  live: {
    explode: (rt, v, app) => app.worlds.pcb.setExplode(v),
    silk: (rt, v, app) => app.worlds.pcb.setShow({ silk: v }), mask: (rt, v, app) => app.worlds.pcb.setShow({ mask: v }),
    copper: (rt, v, app) => app.worlds.pcb.setShow({ copper: v }), core: (rt, v, app) => app.worlds.pcb.setShow({ core: v }),
    oz: () => {}, plan: () => {}
  },
  enter(app, w) {
    const p = app.p; app.pcbProject = PROJECTS.tag; app.pcbBoard = anatomyBoard(p.w);
    app.pcbA = analyze(app.pcbProject, app.pcbBoard);
    w.setDesign(app.pcbProject, app.pcbBoard, app.pcbA, { editable: false, view: 'Angled' });
    w.setShow({ silk: p.silk, mask: p.mask, copper: p.copper, core: p.core }); w.setExplode(p.explode);
    w.onEdit = null;
  },
  onParam(k, v, app) { if (k === 'w') { app.pcbBoard = anatomyBoard(v); app.pcbA = analyze(app.pcbProject, app.pcbBoard); app.worlds.pcb.setDesign(app.pcbProject, app.pcbBoard, app.pcbA, { editable: false }); } },
  runtime: (p, prev, app) => boardRuntime(app.pcbProject, app.pcbA, prev && prev.parts.has('D1') ? prev : null),
  vmax: () => 3,
  probe: 'D1',
  supplyName: () => 'CR2032 coin cell',
  fig2: 'Cross-section through a track',
  drawFig2: (c, rt, p, css) => drawSection(c, p, css),
  tiles: (rt, p) => {
    const plan = PLAN[p.plan], rise = ipcRise(plan, p.w, p.oz), cap = ipcCurrent(p.w, p.oz);
    return [
      { k: 'Track width', v: p.w, u: 'mm', raw: true, dig: 3, x: `${(p.w / 0.0254).toFixed(1)} mil${p.w < FAB.minTrace - 1e-9 ? ', too thin to make' : ''}`, warn: p.w < FAB.minTrace - 1e-9 },
      { k: 'Safe current', v: cap, u: 'A', x: 'for a 10 °C rise, IPC-2221' },
      { k: `Rise at ${fmt(plan, 'A')}`, v: Math.min(rise, 999), u: '°C', raw: true, x: rise > 10 ? `needs ${ipcWidth(plan, p.oz).toFixed(2)} mm for 10 °C` : 'within a 10 °C rise', warn: rise > 10 },
      { k: 'LED current', v: rt.read('D1').i, u: 'A', x: `tracks drop ${fmt(rt.read('D1').i * trackOhms(4.8, p.w, p.oz), 'V')}`, ch: 2 }
    ];
  },
  status: (rt, p) => {
    const cap = ipcCurrent(p.w, p.oz);
    if (p.w < FAB.minTrace - 1e-9) return ['warm', `${p.w.toFixed(3)} mm is thinner than the factory's 0.127 mm minimum. It would not survive etching.`];
    return ['live', `${p.w.toFixed(2)} mm of ${p.oz} oz copper carries ${fmt(cap, 'A')} at a 10 °C rise. The LED needs ${fmt(rt.read('D1').i, 'A')}.`];
  },
  tasks: [
    { id: 'pcbexplode', text: 'Pull the layers apart and find the FR-4 core.', check: (c) => c.p.explode >= 0.6 && c.p.core },
    { id: 'pcbmask', text: 'Hide the solder mask to see the bare copper tracks.', check: (c) => !c.p.mask && c.p.copper },
    { id: 'pcbmin', text: 'Set the tracks to the thinnest the factory makes, 0.127 mm (5 mil).', check: (c) => c.p.w >= 0.1265 && c.p.w <= 0.1305 },
    { id: 'pcb1a', text: 'Plan for 1 A and widen the tracks until the rise stays under 10 °C.', check: (c) => PLAN[c.p.plan] >= 1 && ipcRise(PLAN[c.p.plan], c.p.w, c.p.oz) <= 10 }
  ],
  spec: (rt, p) => [['Board', '7 × 6 mm, 2 layers, 1.6 mm thick'], ['Core', 'FR-4 glass epoxy, 1.5 mm'], ['Copper', `${p.oz} oz, ${FAB.copperUm[p.oz]} µm`], ['Finish', 'gold over nickel on the pads'], ['Rules', `${FAB.minTrace} mm track and gap, ${FAB.via.drill} mm via drill`], ['Power', 'CR2032 coin cell, 3 V, about 15 Ω inside'], ['R1', '100 Ω, 0603, 0.1 W'], ['D1', 'red LED, 0603']],
  schematic: (p, app) => tagSchematic(app),
  graph: 'ipc'
};

function drawSection(c, p, css) {
  const s = sizeCanvas(c); if (!s) return; const { g, W, H } = s;
  const ink = css('--ink'), soft = css('--ink-soft'), faint = css('--ink-faint');
  const x0 = 60, x1 = W - 230, cy = H / 2 + 6, core = Math.min(70, H * 0.34), cu = Math.max(6, core * 0.06 * p.oz), mask = 5, silk = 3;
  const trW = Math.max(14, Math.min(x1 - x0 - 40, (x1 - x0) * p.w / 1.6)), tx = (x0 + x1) / 2 - trW / 2;
  // core
  g.fillStyle = '#b8ad7a'; g.fillRect(x0, cy - core / 2, x1 - x0, core);
  g.strokeStyle = 'rgba(80,70,40,0.35)'; g.lineWidth = 1;
  for (let x = x0 + 6; x < x1; x += 12) { g.beginPath(); g.moveTo(x, cy - core / 2 + 4); g.lineTo(x + 6, cy + core / 2 - 4); g.stroke(); }
  // copper: the track on top, a solid plane on the bottom
  g.fillStyle = '#c98552'; g.fillRect(tx, cy - core / 2 - cu, trW, cu); g.fillRect(x0, cy + core / 2, x1 - x0, cu);
  // mask over everything, hugging the track
  g.fillStyle = 'rgba(23,105,58,0.88)';
  g.beginPath(); g.moveTo(x0, cy - core / 2); g.lineTo(tx - 4, cy - core / 2); g.lineTo(tx, cy - core / 2 - cu - mask); g.lineTo(tx + trW, cy - core / 2 - cu - mask); g.lineTo(tx + trW + 4, cy - core / 2); g.lineTo(x1, cy - core / 2);
  g.lineTo(x1, cy - core / 2 - mask); g.lineTo(tx + trW + 4, cy - core / 2 - mask); g.lineTo(tx + trW, cy - core / 2 - cu - 2 * mask); g.lineTo(tx, cy - core / 2 - cu - 2 * mask); g.lineTo(tx - 4, cy - core / 2 - mask); g.lineTo(x0, cy - core / 2 - mask); g.closePath(); g.fill();
  g.fillRect(x0, cy + core / 2 + cu, x1 - x0, mask);
  g.fillStyle = '#f4f2ea'; g.fillRect(x0 + 20, cy - core / 2 - mask - silk, 60, silk);
  // dimensions
  g.strokeStyle = ink; g.fillStyle = ink; g.lineWidth = 1; g.font = `11px ${FONT}`; g.textAlign = 'center';
  const yA = cy - core / 2 - cu - 2 * mask - 14;
  g.beginPath(); g.moveTo(tx, yA); g.lineTo(tx + trW, yA); g.moveTo(tx, yA - 4); g.lineTo(tx, yA + 4); g.moveTo(tx + trW, yA - 4); g.lineTo(tx + trW, yA + 4); g.stroke();
  g.fillText(`width ${p.w.toFixed(3)} mm`, tx + trW / 2, yA - 6);
  // labels on the right
  g.textAlign = 'left'; const lx = x1 + 16;
  const lab = (y, t, sub, col) => { g.fillStyle = col; g.fillRect(lx, y - 4, 10, 8); g.fillStyle = ink; g.font = `600 11.5px ${FONT}`; g.fillText(t, lx + 16, y + 1); g.fillStyle = soft; g.font = `11px ${FONT}`; g.fillText(sub, lx + 16, y + 14); };
  lab(cy - core / 2 - cu - 26, 'Silkscreen and solder mask', 'ink on top, about 20 µm of mask', '#17693a');
  lab(cy - core / 2 + 4, `Copper, ${p.oz} oz`, `${FAB.copperUm[p.oz]} µm thick`, '#c98552');
  lab(cy + 18, 'FR-4 core', '1.5 mm of glass fibre and epoxy', '#b8ad7a');
  const A = (p.w / 0.0254) * 1.378 * p.oz;
  g.fillStyle = faint; g.font = `11px ${FONT}`; g.textAlign = 'left';
  g.fillText(`cross-section area ${p.w.toFixed(3)} mm × ${FAB.copperUm[p.oz]} µm = ${A.toFixed(1)} mil²`, x0, H - 10);
  g.fillText('not to scale: copper drawn thicker so you can see it', x0, 16);
}

/* ---------------- station 9 ---------------- */
function staged(key) {
  const P = PROJECTS[key], b = { w: P.board.w, h: P.board.h, place: {}, traces: [], vias: [] };
  const y = P.board.h / 2 + 4.5, n = P.parts.length, span = Math.max(P.board.w, n * 3.6);
  P.parts.forEach((part, i) => { b.place[part.id] = { x: +(-span / 2 + span * (i + 0.5) / n).toFixed(1), y: part.fp === 'HDR2' || part.fp === 'SOIC8' ? y + 1.5 : y, rot: 0 }; });
  return b;
}
const TOOLS = [['move', 'Move parts'], ['route', 'Draw tracks'], ['erase', 'Erase']];
export const layout = {
  id: 'layout', num: 9, sym: '⌗', name: 'Lay out a board', title: 'Lay out a tiny board', world: 'pcb',
  text: [
    'Now you design one. The parts wait beside the board, and thin coloured lines called the ratsnest show which pads still need joining.',
    'Drag the parts onto the board. Then pick <b>Draw tracks</b>, click a pad and click your way to the pad it should join. Tracks of different nets must not cross on the same side, so press <b>V</b> to drop a via and carry on along the bottom.',
    'The design rule check compares your layout with what the factory can make: tracks at least 0.127 mm wide with 0.127 mm gaps, and copper kept 0.25 mm from the edge. When every net is routed the board powers up, mistakes and all.',
    'KiCad, which is free, runs these same steps on real boards: schematic, footprints, layout, design rule check, then Gerber files for the factory.'
  ],
  formula: ['track ≥ 0.127 mm', 'gap ≥ 0.127 mm', 'edge ≥ 0.25 mm'],
  caption: 'Layout view from above. Yellow: board edge. Coloured lines: connections still to route. Red rings: design rule errors.',
  defaults: { project: 'tag', tool: 'move', layer: 'F', width: 0.25, boards: null },
  controls: [
    { type: 'choice', key: 'project', label: 'Board', options: [['tag', 'LED tag'], ['blinker', 'Blinker']] },
    { type: 'choice', key: 'tool', label: 'Tool', options: TOOLS },
    { type: 'choice', key: 'layer', label: 'Copper layer for new tracks', options: [['F', 'Top'], ['B', 'Bottom']] },
    { type: 'slider', key: 'width', label: 'Track width', min: 0.1, max: 1, step: 0.05, unit: 'mm', dig: 2 },
    { type: 'slider', key: 'bw', label: 'Board width', min: 4, max: 40, step: 0.5, unit: 'mm', dig: 1 },
    { type: 'slider', key: 'bh', label: 'Board height', min: 4, max: 30, step: 0.5, unit: 'mm', dig: 1 },
    { type: 'buttons', items: [['rotate', 'Rotate part'], ['undo', 'Undo'], ['clear', 'Clear tracks'], ['solve', 'Show a solution']] },
    { type: 'note', html: '<b>R</b> rotates the selected part. While drawing: click to add a corner, click a pad to finish, <b>V</b> drops a via, <b>Esc</b> cancels, <b>Backspace</b> removes the last corner.' }
  ],
  live: {
    tool: (rt, v, app) => { const w = app.worlds.pcb; w.tool = v; w.cancelRoute(); w.drawPreview(); },
    layer: (rt, v, app) => { const w = app.worlds.pcb; w.layer = v; if (w.route) w.placeVia(); w.drawPreview(); },
    width: (rt, v, app) => { app.worlds.pcb.width = v; }
  },
  enter(app, w) {
    const p = app.p;
    if (!p.boards) p.boards = { tag: staged('tag'), blinker: staged('blinker') };
    for (const k of ['tag', 'blinker']) if (!p.boards[k]) p.boards[k] = staged(k);
    app.hist = [];
    w.tool = p.tool; w.layer = p.layer; w.width = p.width; w.sel = null;
    w.onEdit = (live, selOnly) => this.edited(app, live, selOnly);
    w.onSelect = () => {};
    w.onToast = (m) => app.ui.toast(m);
    w.onLayer = (L) => { p.layer = L; app.controls.sync(p); };
    this.load(app, true);
    this.keys = (e) => {
      if (app.L !== this || /input|textarea|select/i.test(document.activeElement.tagName)) return;
      const k = e.key;
      if (k === 'r' || k === 'R') this.action('rotate', app);
      else if (k === 'v' || k === 'V') { w.placeVia(); }
      else if (k === 'Escape') w.cancelRoute();
      else if (k === 'Enter') w.finishRoute();
      else if (k === 'Backspace' || k === 'Delete') { if (!w.undoPoint()) this.action('undo', app); e.preventDefault(); }
      else return;
    };
    window.addEventListener('keydown', this.keys);
  },
  leave(app) { window.removeEventListener('keydown', this.keys); const w = app.worlds.pcb; w.cancelRoute(); w.editable = false; },
  load(app, first) {
    const p = app.p, w = app.worlds.pcb, b = p.boards[p.project];
    p.bw = b.w; p.bh = b.h;
    app.pcbProject = PROJECTS[p.project]; app.pcbBoard = b;
    app.pcbA = analyze(app.pcbProject, b);
    w.setDesign(app.pcbProject, b, app.pcbA, { editable: true, view: 'Top' });
    w.setShow({ silk: true, mask: true, copper: true, core: true }); w.setExplode(0);
    if (!first) { app.dirty = true; app.fig2Dirty = true; }
    app.controls && app.controls.sync(p);
  },
  edited(app, live, selOnly) {
    if (!selOnly && !live) { app.hist.push(JSON.stringify(app.pcbBoard)); if (app.hist.length > 60) app.hist.shift(); }
    app.pcbA = analyze(app.pcbProject, app.pcbBoard);
    app.worlds.pcb.setDesign(app.pcbProject, app.pcbBoard, app.pcbA, { editable: true });
    app.worlds.pcb.drawPreview();
    if (!selOnly) { app.dirty = true; app.fig2Dirty = true; app.save(); }
  },
  onParam(k, v, app) {
    const p = app.p;
    if (k === 'project') { this.load(app); app.view.flyTo('Top'); }
    if (k === 'bw' || k === 'bh') { app.pcbBoard[k === 'bw' ? 'w' : 'h'] = v; this.edited(app, true); }
  },
  action(a, app) {
    const w = app.worlds.pcb, p = app.p, b = app.pcbBoard;
    const snap = () => { app.hist.push(JSON.stringify(b)); };
    if (a === 'rotate') { if (!w.sel) { app.ui.toast('Pick a part with Move parts first, then rotate it.'); return; } snap(); const pl = b.place[w.sel]; pl.rot = ((pl.rot || 0) + 90) % 360; this.edited(app, true); }
    if (a === 'undo') { const s = app.hist.pop(); if (!s) { app.ui.toast('Nothing to undo.'); return; } p.boards[p.project] = JSON.parse(s); this.load(app); return; }
    if (a === 'clear') { snap(); b.traces = []; b.vias = []; this.edited(app, true); }
    if (a === 'solve') { snap(); p.boards[p.project] = clone(SOLUTIONS[p.project]); this.load(app); app.ui.toast('Loaded a worked layout. Compare it with yours, or press Undo to go back.', 3600); }
  },
  runtime: (p, prev, app) => boardRuntime(app.pcbProject, app.pcbA, prev && prev.spec.parts.some(q => q.kind === 'ic555') === (p.project === 'blinker') ? prev : null),
  hMax: null,
  vmax: (p) => PROJECTS[p.project].supply.V,
  probe: 'D1',
  supplyName: (p) => PROJECTS[p.project].supply.name,
  fig2: 'Design rule check', fig2html: true,
  drawFig2: (c, rt, p, css, app) => drfReport(app),
  tiles: (rt, p, app) => {
    const A = app.pcbA, b = app.pcbBoard, d = rt.read('D1'), u = rt.part('U1') ? rt.read('U1') : null;
    return [
      { k: 'Board area', v: b.w * b.h, u: 'mm²', raw: true, dig: 0, x: `${b.w} × ${b.h} mm` },
      { k: 'Left to route', v: A.unrouted, u: '', raw: true, dig: 0, x: A.unrouted ? 'follow the ratsnest lines' : 'every net joined', warn: A.unrouted > 0 },
      { k: 'Rule errors', v: A.errors.length, u: '', raw: true, dig: 0, x: A.warnings.length ? `${A.warnings.length} warning${A.warnings.length > 1 ? 's' : ''}` : 'no warnings', warn: A.errors.length > 0 },
      u ? { k: 'Blinking at', v: u.period > 0 ? 1 / u.period : 0, u: 'Hz', x: d.i > 1e-4 ? `LED ${fmt(d.i, 'A')}` : 'LED dark', ch: 2 }
        : { k: 'LED current', v: d.i, u: 'A', x: d.i > 1e-3 ? 'the board works' : 'not lit yet', ch: 2 }
    ];
  },
  status: (rt, p, app) => {
    const A = app.pcbA;
    if (!A.allOn) return ['idle', 'Drag each part onto the board. The yellow outline is the board edge.'];
    if (A.errors.some(e => e.kind === 'short')) return ['fault', `${A.errors.find(e => e.kind === 'short').msg}. Erase the track that bridges them.`];
    if (A.unrouted) return ['warm', `${A.unrouted} connection${A.unrouted > 1 ? 's' : ''} left to route. Follow the coloured lines.`];
    if (A.errors.length) return ['warm', `Everything is joined and the board runs, with ${A.errors.length} rule error${A.errors.length > 1 ? 's' : ''} to fix before it can be made.`];
    return ['live', `The board passes the design rule check: ${app.pcbBoard.w} × ${app.pcbBoard.h} mm, ready for the factory.`];
  },
  tasks: [
    { id: 'lay1', text: 'Drag every part of the LED tag onto the board.', check: (c) => c.p.project === 'tag' && c.app.pcbA.allOn },
    { id: 'lay2', text: 'Route every connection on the LED tag. The LED lights when you do.', check: (c) => c.p.project === 'tag' && c.app.pcbA.allOn && c.app.pcbA.unrouted === 0 },
    { id: 'lay3', text: 'Pass the design rule check with no errors.', check: (c) => c.p.project === 'tag' && c.app.pcbA.pass },
    { id: 'lay4', text: 'Shrink the LED tag below 100 mm² and keep it passing.', check: (c) => c.p.project === 'tag' && c.app.pcbA.pass && c.app.pcbBoard.w * c.app.pcbBoard.h < 100 },
    { id: 'lay5', text: 'Switch to the blinker and get it to pass as well.', check: (c) => c.p.project === 'blinker' && c.app.pcbA.pass }
  ],
  spec: (rt, p) => {
    const P = PROJECTS[p.project];
    return [['Power', P.supply.name], ...P.parts.filter(q => q.kind !== 'header').map(q => [q.id, `${q.kind === 'resistor' ? fmtR(q.value) : q.kind === 'cap' ? fmtC(q.value) : q.kind === 'led' ? 'red LED' : 'NE555'}, ${q.fp.replace('R0603', '0603').replace('C0603', '0603').replace('C0805', '0805').replace('LED0603', '0603').replace('SOIC8', 'SOIC-8')}`]), ['Rules', `${FAB.minTrace} mm track and gap, ${FAB.edge} mm to edge`], ['Vias', `${FAB.via.drill} mm drill, ${FAB.via.dia} mm pad`]];
  },
  schematic: (p, app) => p.project === 'tag' ? tagSchematic(app) : blinkerSchematic(app),
  graph: null
};

function drfReport(app) {
  const el = document.getElementById('fig2html');
  if (!app.fig2Dirty && el.dataset.for === app.L.id) return;
  app.fig2Dirty = false; el.dataset.for = app.L.id;
  const A = app.pcbA, items = [];
  if (!A.allOn) items.push(['idle', 'Place the parts', 'Drag each part from beside the board onto it.']);
  for (const e of A.errors) if (e.kind === 'place') items.push(['warm', e.msg, 'Drag it onto the board.']);
  if (A.unrouted) items.push(['warm', `${A.unrouted} connection${A.unrouted > 1 ? 's' : ''} to route`, [...new Set(A.rats.map(r => r[4]))].map(n => `<i class="net" style="background:${NET_HUE[n] || '#fff'}"></i>${n}`).join(' ')]);
  for (const e of A.errors) if (e.kind !== 'place') items.push(['fault', e.msg, `at ${e.x.toFixed(2)}, ${e.y.toFixed(2)} mm`, e]);
  for (const e of A.warnings) items.push(['warm', e.msg, `at ${e.x.toFixed(2)}, ${e.y.toFixed(2)} mm`, e]);
  if (!items.length) items.push(['live', 'No errors, nothing left to route', `${app.pcbBoard.w} × ${app.pcbBoard.h} mm, ${app.pcbBoard.traces.length} tracks, ${app.pcbBoard.vias.length} vias. This board could be sent to a factory.`]);
  el.innerHTML = `<ul>${items.slice(0, 40).map(([lvl, t, sub], i) => `<li data-i="${i}"><i class="led ${lvl}"></i><div><b>${t}</b><span>${sub}</span></div></li>`).join('')}</ul>`;
  el.querySelectorAll('li').forEach((li) => {
    const e = items[+li.dataset.i][3]; if (!e) return;
    li.classList.add('go'); li.title = 'Show this on the board';
    li.addEventListener('click', () => app.view.flyToPoint(e.x, e.y));
  });
}
export const PCB_LESSONS = [anatomy, layout];
export { nice };

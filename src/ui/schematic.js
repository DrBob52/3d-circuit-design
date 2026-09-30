import { sizeCanvas } from './scope.js';
import { FONT, viridisCss } from '../bench/util3d.js';
import { fmt, LEDS } from '../sim/parts.js';

/* =====================================================================
   SCHEMATIC. Parts sit on a grid (1 unit = one step), two-terminal
   symbols are 3 units long with pins at ±1.5. rot turns them in 90°
   steps; rot 90 puts pin a on top. Wires are coloured by the voltage of
   their net, the same colour map as the 3D view.
   ===================================================================== */
const PI = Math.PI;
export const PIN = {
  resistor: { a: [-1.5, 0], b: [1.5, 0] }, led: { a: [-1.5, 0], k: [1.5, 0] }, cap: { p: [-1.5, 0], n: [1.5, 0] },
  source: { p: [0, -1.5], n: [0, 1.5] }, button: { a: [-1.5, 0], b: [1.5, 0] }
};

function symbol(g, sym, u, o) {
  const L = (x1, y1, x2, y2) => { g.moveTo(x1 * u, y1 * u); g.lineTo(x2 * u, y2 * u); };
  g.beginPath();
  switch (sym) {
    case 'resistor': {
      L(-1.5, 0, -0.9, 0); g.lineTo(-0.9 * u, 0);
      const n = 6; for (let i = 0; i < n; i++) g.lineTo((-0.9 + (i + 0.5) * 1.8 / n) * u, (i % 2 ? 0.28 : -0.28) * u);
      g.lineTo(0.9 * u, 0); L(0.9, 0, 1.5, 0); g.stroke(); break;
    }
    case 'led': {
      L(-1.5, 0, -0.45, 0); L(0.35, 0, 1.5, 0); L(0.35, -0.45, 0.35, 0.45); g.stroke();
      g.beginPath(); g.moveTo(-0.45 * u, -0.45 * u); g.lineTo(-0.45 * u, 0.45 * u); g.lineTo(0.35 * u, 0); g.closePath();
      if (o.glow > 0.02) { g.save(); g.fillStyle = o.glowColor; g.globalAlpha = Math.min(1, 0.25 + o.glow); g.fill(); g.restore(); }
      g.stroke();
      for (const dx of [-0.15, 0.25]) { g.beginPath(); g.moveTo(dx * u, -0.55 * u); g.lineTo((dx + 0.4) * u, -0.95 * u); g.stroke(); g.beginPath(); g.moveTo((dx + 0.4) * u, -0.95 * u); g.lineTo((dx + 0.22) * u, -0.9 * u); g.lineTo((dx + 0.35) * u, -0.77 * u); g.closePath(); g.fill(); }
      break;
    }
    case 'cap': {
      L(-1.5, 0, -0.15, 0); L(-0.15, -0.6, -0.15, 0.6); g.stroke();
      g.beginPath(); g.arc(0.9 * u, 0, 0.9 * u, PI - 0.72, PI + 0.72); g.stroke();
      g.beginPath(); L(0.05, 0, 1.5, 0); g.stroke();
      g.beginPath(); L(-0.55, -0.62, -0.55, -0.32); L(-0.7, -0.47, -0.4, -0.47); g.stroke();
      break;
    }
    case 'source': {
      L(0, -1.5, 0, -0.75); L(0, 0.75, 0, 1.5); g.stroke();
      g.beginPath(); g.arc(0, 0, 0.75 * u, 0, 2 * PI); g.stroke();
      g.beginPath(); L(-0.2, -0.35, 0.2, -0.35); L(0, -0.55, 0, -0.15); L(-0.2, 0.38, 0.2, 0.38); g.stroke();
      break;
    }
    case 'button': {
      L(-1.5, 0, -0.62, 0); L(0.62, 0, 1.5, 0); g.stroke();
      for (const x of [-0.55, 0.55]) { g.beginPath(); g.arc(x * u, 0, 0.08 * u, 0, 2 * PI); g.stroke(); }
      const y = o.pressed ? -0.14 : -0.5;
      g.beginPath(); L(-0.75, y, 0.75, y); L(0, y, 0, y - 0.45); L(-0.25, y - 0.45, 0.25, y - 0.45); g.stroke();
      break;
    }
    case 'spdt': {     // common on the right, throw A top left, B bottom left
      L(1.5, 0, 0.62, 0); L(-1.5, -1, -0.62, -1); L(-1.5, 1, -0.62, 1); g.stroke();
      for (const [x, y] of [[0.55, 0], [-0.55, -1], [-0.55, 1]]) { g.beginPath(); g.arc(x * u, y * u, 0.08 * u, 0, 2 * PI); g.stroke(); }
      g.beginPath(); L(0.5, -0.05, -0.5, o.pos ? 0.9 : -0.9); g.stroke();
      g.font = `600 ${0.42 * u}px ${FONT}`; g.textAlign = 'center';
      g.fillText('charge', -0.55 * u, -1.3 * u); g.fillText('discharge', -0.55 * u, 1.6 * u);
      break;
    }
    case 'npn': {
      L(-1.5, 0, -0.35, 0); L(-0.35, -0.55, -0.35, 0.55); L(-0.35, -0.22, 0.5, -0.8); L(0.5, -0.8, 0.5, -1.5); L(-0.35, 0.22, 0.5, 0.8); L(0.5, 0.8, 0.5, 1.5); g.stroke();
      g.beginPath(); g.arc(0.1 * u, 0, 0.95 * u, 0, 2 * PI); g.stroke();
      const ax = 0.5, ay = 0.8, dx = 0.85, dy = 0.58, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
      g.beginPath(); g.moveTo(ax * u, ay * u); g.lineTo((ax - 0.3 * ux + 0.14 * uy) * u, (ay - 0.3 * uy - 0.14 * ux) * u); g.lineTo((ax - 0.3 * ux - 0.14 * uy) * u, (ay - 0.3 * uy + 0.14 * ux) * u); g.closePath(); g.fill();
      break;
    }
    case 'ic555': {
      g.rect(-2 * u, -2.5 * u, 4 * u, 5 * u); g.stroke();
      const pins = [[8, -0.8, -2.5, -0.8, -3.5, 'VCC'], [4, 0.8, -2.5, 0.8, -3.5, 'RST'], [1, 0, 2.5, 0, 3.5, 'GND'], [7, -2, -1.5, -3, -1.5, 'DIS'], [6, -2, 0, -3, 0, 'THR'], [2, -2, 1.5, -3, 1.5, 'TRIG'], [3, 2, -1, 3, -1, 'OUT'], [5, 2, 1.5, 3, 1.5, 'CV']];
      g.beginPath(); for (const p of pins) L(p[1], p[2], p[3], p[4]); g.stroke();
      g.font = `600 ${0.36 * u}px ${FONT}`; g.textBaseline = 'middle';
      for (const [n, x1, y1, x2, y2, name] of pins) {
        if (Math.abs(x1) === 2) { g.textAlign = x1 < 0 ? 'left' : 'right'; g.fillText(name, (x1 + (x1 < 0 ? 0.15 : -0.15)) * u, y1 * u); g.fillText(String(n), (x1 + (x1 < 0 ? -0.5 : 0.5)) * u, (y1 - 0.25) * u); }
        else { g.textAlign = 'center'; g.fillText(name, x1 * u, (y1 + (y1 < 0 ? 0.3 : -0.3)) * u); g.textAlign = 'left'; g.fillText(String(n), (x1 + 0.12) * u, (y1 + (y1 < 0 ? -0.55 : 0.55)) * u); }
      }
      g.font = `700 ${0.6 * u}px ${FONT}`; g.textAlign = 'center'; g.fillText('555', 0, 0.9 * u); g.textBaseline = 'alphabetic';
      break;
    }
    case 'header': {
      g.rect(-0.5 * u, -1.5 * u, 1 * u, 3 * u); g.stroke();
      for (const y of [-0.75, 0.75]) { g.beginPath(); g.arc(0, y * u, 0.16 * u, 0, 2 * PI); g.fill(); g.beginPath(); L(0, y, 1.5, y); g.stroke(); }
      break;
    }
  }
}

export class Schematic {
  constructor(canvas, hooks) {
    this.c = canvas; this.hooks = hooks; this.boxes = [];
    canvas.addEventListener('mousemove', (e) => { const id = this.hit(e); canvas.style.cursor = id ? 'pointer' : 'default'; hooks.hover(id, e); });
    canvas.addEventListener('mouseleave', () => hooks.hover(null));
    canvas.addEventListener('click', (e) => { const id = this.hit(e); if (id) hooks.click(id); });
  }
  hit(e) {
    const r = this.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    for (const b of this.boxes) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b.id;
    return null;
  }
  draw(def, info, opts, css) {
    const s = sizeCanvas(this.c); if (!s) return; const { g, W, H } = s;
    const pad = 14, u = Math.min((W - 2 * pad) / def.w, (H - 2 * pad) / def.h);
    const ox = (W - def.w * u) / 2, oy = (H - def.h * u) / 2;
    const X = (x) => ox + x * u, Y = (y) => oy + y * u;
    const ink = css('--ink'), soft = css('--ink-soft'), faint = css('--ink-faint'), acc = css('--acc');
    const netColor = (net) => { const v = info.v(net); return opts.color && isFinite(v) ? viridisCss(0.08 + 0.92 * v / Math.max(0.5, opts.vmax)) : soft; };
    g.lineCap = 'round'; g.lineJoin = 'round';
    // wires
    for (const w of def.wires) {
      g.strokeStyle = w.ghost ? faint : netColor(w.net); g.lineWidth = w.ghost ? 1 : 2.2;
      g.setLineDash(w.ghost ? [3, 4] : []);
      g.beginPath(); w.pts.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); g.stroke();
    }
    g.setLineDash([]);
    for (const [x, y] of def.dots || []) { g.fillStyle = soft; g.beginPath(); g.arc(X(x), Y(y), Math.max(2.5, 0.13 * u), 0, 2 * PI); g.fill(); }
    for (const [x, y] of def.grounds || []) {
      g.strokeStyle = soft; g.lineWidth = 1.6; g.beginPath();
      g.moveTo(X(x), Y(y)); g.lineTo(X(x), Y(y + 0.35));
      [[0.4, 0.35], [0.26, 0.52], [0.12, 0.69]].forEach(([w, dy]) => { g.moveTo(X(x - w), Y(y + dy)); g.lineTo(X(x + w), Y(y + dy)); });
      g.stroke();
    }
    // parts
    this.boxes = [];
    for (const p of def.parts) {
      const d = info.part(p.id) || {}, sel = p.id === opts.sel, hov = p.id === opts.hover;
      const col = p.ghost ? faint : sel || hov ? acc : ink;
      g.save(); g.translate(X(p.at[0]), Y(p.at[1])); g.rotate((p.rot || 0) * PI / 180);
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = sel ? 2.4 : 1.7; if (p.ghost) g.setLineDash([3, 4]);
      symbol(g, p.sym, u, { glow: d.glow || 0, glowColor: p.color ? (LEDS[p.color] || LEDS.red).css : '#fff', pressed: p.pressed, pos: p.pos });
      g.restore(); g.setLineDash([]);
      // hit box and labels
      const vert = p.rot === 90 || p.rot === 270, big = p.sym === 'ic555', src = p.sym === 'source' || p.sym === 'header';
      const hw = big ? 2 : vert || src ? 0.8 : 1.5, hh = big ? 2.5 : vert || src ? 1.5 : 0.8;
      this.boxes.push({ id: p.id, x0: X(p.at[0] - hw), x1: X(p.at[0] + hw), y0: Y(p.at[1] - hh), y1: Y(p.at[1] + hh) });
      if (p.ghost) {
        g.fillStyle = faint; g.font = `500 ${Math.max(10, 0.38 * u)}px ${FONT}`; g.textAlign = 'left';
        g.fillText(`${p.id} not connected`, X(p.at[0] + 0.7), Y(p.at[1]));
        continue;
      }
      const fs = Math.max(10, Math.min(13, 0.42 * u));
      g.font = `600 ${fs}px ${FONT}`; g.fillStyle = sel || hov ? acc : ink;
      const name = `${p.id}${d.value ? ' ' + d.value : ''}`;
      let lx, ly, cx, cy, align;
      const lab = p.lab || (p.sym === 'npn' ? [1.35, -0.15] : null);
      if (lab) { lx = X(p.at[0] + lab[0]); ly = Y(p.at[1] + lab[1]); cx = lx; cy = ly + fs + 2; align = lab[2] || 'left'; }
      else if (big) { lx = X(p.at[0]); ly = Y(p.at[1] - 0.4); align = 'center'; }
      else if (vert || src) { lx = X(p.at[0] + 0.7); ly = Y(p.at[1] - 0.15); cx = lx; cy = ly + fs + 2; align = 'left'; }
      else { lx = X(p.at[0]); ly = Y(p.at[1] - 0.62); cx = lx; cy = Y(p.at[1] + 0.62) + fs; align = 'center'; }
      g.textAlign = align;
      if (!big) g.fillText(name, lx, ly);
      if (cx !== undefined && d.i !== undefined && isFinite(d.i)) {
        g.font = `400 ${fs - 1}px ${FONT}`; g.fillStyle = soft;
        const a = Math.abs(d.i) > 1e-7 ? (d.i > 0 ? 1 : -1) : 0;
        const r = p.rot || 0, dirs = { 0: '→', 90: '↓', 180: '←', 270: '↑' }, back = { 0: '←', 90: '↑', 180: '→', 270: '↓' };
        const arrow = p.sym === 'npn' ? (a > 0 ? 'I꜀ ↓' : '') : src ? (a > 0 ? '↑' : a < 0 ? '↓' : '') : a > 0 ? dirs[r] : a < 0 ? back[r] : '';
        g.fillText(`${arrow} ${fmt(Math.abs(d.i), 'A')}`.trim(), cx, cy);
      }
    }
    // node voltages
    g.textBaseline = 'middle';
    for (const t of def.volts || []) {
      const v = info.v(t.net); if (!isFinite(v)) continue;
      const txt = `${t.label ? t.label + ' ' : ''}${v.toFixed(2)} V`, fs = Math.max(10, Math.min(12, 0.4 * u));
      g.font = `600 ${fs}px ${FONT}`;
      const w = g.measureText(txt).width + 18, x = X(t.at[0]) - w / 2, y = Y(t.at[1]);
      g.fillStyle = css('--panel'); g.fillRect(x, y - fs * 0.75, w, fs * 1.5);
      g.fillStyle = viridisCss(0.08 + 0.92 * v / Math.max(0.5, opts.vmax));
      g.beginPath(); g.moveTo(x + 6, y - 4); g.lineTo(x + 10, y); g.lineTo(x + 6, y + 4); g.lineTo(x + 2, y); g.closePath(); g.fill();
      g.fillStyle = ink; g.textAlign = 'left'; g.fillText(txt, x + 14, y + 0.5);
    }
    g.textBaseline = 'alphabetic';
  }
}

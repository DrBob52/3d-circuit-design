import { sizeCanvas, nice } from './scope.js';
import { FONT } from '../bench/util3d.js';
import { fmt, fmtR, LEDS, LED_RS, R_RATING } from '../sim/parts.js';
import { VT } from '../sim/engine.js';

/* Station graphs for Fig. 3. Each draws to scale on shared axes. */
function axes(g, W, H, css, { x0, x1, y0, y1, xl, yl, xf, yf, logx }) {
  const L = 54, R = 14, T = 12, B = 32, pw = W - L - R, ph = H - T - B;
  const X = logx ? (x) => L + (Math.log10(x) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) * pw : (x) => L + (x - x0) / (x1 - x0) * pw;
  const Y = (y) => T + ph - (y - y0) / (y1 - y0) * ph;
  g.font = `10.5px ${FONT}`; g.lineWidth = 1;
  const soft = css('--ink-soft'), faint = css('--tick-soft');
  const xt = logx ? (() => { const a = []; for (let e = Math.ceil(Math.log10(x0)); e <= Math.log10(x1) + 1e-9; e++) a.push(10 ** e); return a; })() : ticks(x0, x1, 6);
  for (const x of xt) { g.strokeStyle = faint; g.beginPath(); g.moveTo(X(x), T); g.lineTo(X(x), T + ph); g.stroke(); g.fillStyle = soft; g.textAlign = 'center'; g.fillText(xf(x), X(x), T + ph + 13); }
  for (const y of ticks(y0, y1, 4)) { g.strokeStyle = faint; g.beginPath(); g.moveTo(L, Y(y)); g.lineTo(L + pw, Y(y)); g.stroke(); g.fillStyle = soft; g.textAlign = 'right'; g.fillText(yf(y), L - 5, Y(y) + 3.5); }
  g.fillStyle = soft; g.textAlign = 'center'; g.fillText(xl, L + pw / 2, H - 5);
  g.save(); g.translate(11, T + ph / 2); g.rotate(-Math.PI / 2); g.fillText(yl, 0, 0); g.restore();
  return { X, Y, L, R, T, B, pw, ph, clip() { g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip(); } };
}
function ticks(a, b, n) { const st = nice((b - a) / n), out = []; for (let v = Math.ceil(a / st) * st; v <= b + st * 1e-6; v += st) out.push(+v.toPrecision(10)); return out; }
function dot(g, x, y, color, ring) { g.fillStyle = color; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); if (ring) { g.strokeStyle = color; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 8, 0, 7); g.stroke(); } }
function note(g, text, x, y, color, align = 'left') { g.font = `11px ${FONT}`; g.fillStyle = color; g.textAlign = align; g.fillText(text, x, y); }
const mA = (x) => fmt(x, 'A', 2);

export const GRAPHS = {
  ohm: { title: 'Current against voltage', draw(g, W, H, rt, p, css) {
    const R = p.R, x1 = 12, y1 = nice(Math.max(12 / R, 0.25 / 12) * 1.05);
    const a = axes(g, W, H, css, { x0: 0, x1, y0: 0, y1, xl: 'voltage across R1, V', yl: 'current', xf: (v) => v, yf: (v) => fmt(v, 'A', 1) });
    a.clip();
    g.fillStyle = 'rgba(239,91,76,0.10)'; g.beginPath(); g.moveTo(a.X(0.25 / y1), a.Y(y1));
    for (let v = 0.25 / y1; v <= x1; v += 0.05) g.lineTo(a.X(v), a.Y(R_RATING / v)); g.lineTo(a.X(x1), a.Y(y1)); g.closePath(); g.fill();
    g.strokeStyle = css('--fault'); g.setLineDash([4, 4]); g.beginPath(); for (let v = 0.25 / y1; v <= x1; v += 0.05) g.lineTo(a.X(v), a.Y(R_RATING / v)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = css('--ch3'); g.lineWidth = 2; g.beginPath(); g.moveTo(a.X(0), a.Y(0)); g.lineTo(a.X(x1), a.Y(x1 / R)); g.stroke(); g.restore();
    const r = rt.read('R1'); dot(g, a.X(Math.min(x1, r.v)), a.Y(Math.min(y1, r.i)), css('--ch1'), true);
    note(g, `slope = 1 / R = 1 / ${fmtR(R)}`, a.L + 8, a.T + 12, css('--ch3'));
    note(g, 'shaded: more than ¼ W, R1 overheats', a.L + 8, a.T + 26, css('--fault'));
  } },
  led: { title: 'LED curve and load line', draw(g, W, H, rt, p, css) {
    const L = LEDS[p.color], Is = 0.02 / Math.exp((L.vf - 0.02 * LED_RS) / (L.n * VT)), nvt = L.n * VT;
    const x1 = 4.5, y1 = 0.04;
    const a = axes(g, W, H, css, { x0: 0, x1, y0: 0, y1, xl: 'voltage across the LED, V', yl: 'LED current', xf: (v) => v, yf: (v) => fmt(v, 'A', 1) });
    a.clip();
    g.fillStyle = 'rgba(239,91,76,0.10)'; g.fillRect(a.L, a.Y(y1), a.pw, a.Y(0.03) - a.Y(y1));
    g.strokeStyle = css('--tick'); g.setLineDash([4, 4]); for (const i of [0.02, 0.03]) { g.beginPath(); g.moveTo(a.L, a.Y(i)); g.lineTo(a.L + a.pw, a.Y(i)); g.stroke(); } g.setLineDash([]);
    if (!p.flip) {   // load line: every point the resistor allows, I = (V - v) / R
      g.strokeStyle = css('--ch1'); g.lineWidth = 1.5; g.beginPath(); g.moveTo(a.X(0), a.Y(p.V / p.R)); g.lineTo(a.X(x1), a.Y((p.V - x1) / p.R)); g.stroke();
    }
    g.strokeStyle = L.css; g.lineWidth = 2.2; g.beginPath();
    for (let k = 0; k <= 200; k++) { const i = y1 * 1.05 * k / 200, v = nvt * Math.log(i / Is + 1) + i * LED_RS; k ? g.lineTo(a.X(v), a.Y(i)) : g.moveTo(a.X(v), a.Y(i)); }
    g.stroke(); g.restore();
    const d = rt.read('D1');
    if (!p.flip) dot(g, a.X(Math.min(x1, d.v)), a.Y(Math.min(y1, Math.max(0, d.i))), css('--ink'), true);
    note(g, `${L.name} LED`, a.L + 8, a.T + 12, L.css);
    note(g, p.flip ? 'reversed: the LED blocks, no operating point' : `load line of ${fmtR(p.R)} from ${(+p.V).toFixed(1)} V`, a.L + 8, a.T + 26, p.flip ? css('--ink-soft') : css('--ch1'));
    note(g, '20 mA', a.L + a.pw - 4, a.Y(0.02) - 4, css('--ink-faint'), 'right'); note(g, '30 mA max', a.L + a.pw - 4, a.Y(0.03) - 4, css('--fault'), 'right');
  } },
  series: { title: (p) => p.topo === 'series' ? 'Voltage around the loop' : 'Current in each branch', draw(g, W, H, rt, p, css) {
    const r1 = rt.read('R1'), r2 = rt.read('R2'), soft = css('--ink-soft');
    if (p.topo === 'series') {
      const V = Math.max(0.1, +p.V), y1 = nice(V * 1.1), vA = V - 0, vm = rt.v('U11');
      const a = axes(g, W, H, css, { x0: 0, x1: 5, y0: 0, y1, xl: 'position around the circuit', yl: 'voltage', xf: () => '', yf: (v) => v + ' V' });
      const pts = [[0, vA], [1, vA], [2, vm], [3, vm], [4, 0], [5, 0]];
      g.strokeStyle = css('--ch3'); g.lineWidth = 2.2; g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(a.X(x), a.Y(y)) : g.moveTo(a.X(x), a.Y(y))); g.stroke();
      g.fillStyle = 'rgba(128,128,120,0.12)'; g.fillRect(a.X(1), a.T, a.X(2) - a.X(1), a.ph); g.fillRect(a.X(3), a.T, a.X(4) - a.X(3), a.ph);
      note(g, 'R1', a.X(1.5), a.T + a.ph + 13, css('--ch1'), 'center'); note(g, 'R2', a.X(3.5), a.T + a.ph + 13, css('--ch2'), 'center');
      note(g, 'red lead', a.X(0.5), a.T + a.ph + 13, soft, 'center'); note(g, 'black lead', a.X(4.5), a.T + a.ph + 13, soft, 'center');
      note(g, `drop ${r1.v.toFixed(2)} V`, a.X(1.5), a.Y((vA + vm) / 2) - 8, css('--ch1'), 'left');
      note(g, `drop ${r2.v.toFixed(2)} V`, a.X(3.5), a.Y(vm / 2) - 8, css('--ch2'), 'left');
    } else {
      const I = Math.abs(r1.i) + Math.abs(r2.i), y1 = nice(Math.max(I, 1e-6) * 1.15);
      const a = axes(g, W, H, css, { x0: 0, x1: 3, y0: 0, y1, xl: '', yl: 'current', xf: () => '', yf: (v) => fmt(v, 'A', 1) });
      const bar = (x, v, color, lab) => { g.fillStyle = color; g.fillRect(a.X(x - 0.3), a.Y(v), a.X(x + 0.3) - a.X(x - 0.3), a.Y(0) - a.Y(v)); note(g, lab, a.X(x), a.T + a.ph + 13, color, 'center'); note(g, mA(v), a.X(x), a.Y(v) - 5, css('--ink'), 'center'); };
      bar(0.5, Math.abs(r1.i), css('--ch1'), 'R1'); bar(1.5, Math.abs(r2.i), css('--ch2'), 'R2'); bar(2.5, I, css('--ch3'), 'total');
    }
  } },
  divider: { title: 'Output against load', draw(g, W, H, rt, p, css) {
    const Vu = p.V * p.R2 / (p.R1 + p.R2), y1 = nice(Math.max(0.1, Vu) * 1.15);
    const a = axes(g, W, H, css, { x0: 10, x1: 1e6, y0: 0, y1, xl: 'load resistance RL (log scale)', yl: 'V out', xf: (v) => fmtR(v).replace(' ', ''), yf: (v) => v + ' V', logx: true });
    a.clip();
    g.strokeStyle = css('--tick'); g.setLineDash([4, 4]); g.beginPath(); g.moveTo(a.L, a.Y(Vu)); g.lineTo(a.L + a.pw, a.Y(Vu)); g.stroke(); g.setLineDash([]);
    g.strokeStyle = css('--ch1'); g.lineWidth = 2; g.beginPath();
    for (let k = 0; k <= 200; k++) { const RL = 10 * 1e5 ** (k / 200), Rp = p.R2 * RL / (p.R2 + RL), v = p.V * Rp / (p.R1 + Rp); k ? g.lineTo(a.X(RL), a.Y(v)) : g.moveTo(a.X(RL), a.Y(v)); }
    g.stroke(); g.restore();
    if (p.load) dot(g, a.X(p.RL), a.Y(rt.v('U11')), css('--ink'), true);
    note(g, `with no load: ${Vu.toFixed(2)} V`, a.L + a.pw - 6, a.Y(Vu) - 6, css('--ink-soft'), 'right');
    note(g, p.load ? `RL = ${fmtR(p.RL)}, V out ${rt.v('U11').toFixed(2)} V` : 'connect the load to see where you sit', a.L + 8, a.T + a.ph - 8, css('--ink-soft'));
  } },
  rc: { title: 'Charging curve', draw(g, W, H, rt, p, css) {
    const tau = p.R * p.C, V = +p.V, vc = rt.read('C1').v, charging = p.sw === 0;
    const a = axes(g, W, H, css, { x0: 0, x1: 5, y0: 0, y1: nice(V * 1.08), xl: 'time, in time constants τ', yl: 'capacitor voltage', xf: (v) => v + 'τ', yf: (v) => v + ' V' });
    a.clip();
    g.strokeStyle = css('--ch1'); g.lineWidth = 2; g.beginPath();
    for (let k = 0; k <= 200; k++) { const t = 5 * k / 200, v = charging ? V * (1 - Math.exp(-t)) : V * Math.exp(-t); k ? g.lineTo(a.X(t), a.Y(v)) : g.moveTo(a.X(t), a.Y(v)); }
    g.stroke();
    g.setLineDash([3, 4]); g.strokeStyle = css('--tick');
    for (let n = 1; n <= 5; n++) { const v = charging ? V * (1 - Math.exp(-n)) : V * Math.exp(-n); g.beginPath(); g.moveTo(a.X(n), a.Y(0)); g.lineTo(a.X(n), a.Y(v)); g.lineTo(a.X(0), a.Y(v)); g.stroke(); }
    g.setLineDash([]); g.restore();
    for (let n = 1; n <= 3; n++) { const f = charging ? 1 - Math.exp(-n) : Math.exp(-n); note(g, `${Math.round(f * 100)} %`, a.X(n) + 4, a.Y(V * f) + (charging ? 13 : -5), css('--ink-soft')); }
    const f = Math.min(0.9999, Math.max(1e-4, vc / V)), t = charging ? -Math.log(1 - f) : -Math.log(f);
    if (t <= 5) dot(g, a.X(t), a.Y(vc), css('--ink'), true);
    note(g, `τ = ${fmtR(p.R)} × ${fmt(p.C, 'F')} = ${fmt(tau, 's')}`, a.L + a.pw - 6, a.T + 12, css('--ch1'), 'right');
  } },
  transistor: { title: 'Collector current against base current', draw(g, W, H, rt, p, css) {
    const q = rt.read('Q1'), beta = 200, vf = LEDS.red.vf, icMax = Math.max(1e-4, (p.V - vf - 0.1) / (p.Rc + LED_RS));
    const x1 = nice(Math.max(3 * icMax / beta, (q.ib || 0) * 1.1)), y1 = nice(icMax * 1.25);
    const a = axes(g, W, H, css, { x0: 0, x1, y0: 0, y1, xl: 'base current', yl: 'LED current', xf: (v) => fmt(v, 'A', 1), yf: (v) => fmt(v, 'A', 1) });
    a.clip();
    g.fillStyle = 'rgba(53,183,121,0.08)'; g.fillRect(a.X(icMax / beta), a.T, a.L + a.pw - a.X(icMax / beta), a.ph);
    g.strokeStyle = css('--ch2'); g.lineWidth = 2; g.beginPath();
    for (let k = 0; k <= 200; k++) { const ib = x1 * k / 200, lin = beta * ib, ic = lin * icMax / Math.pow(Math.pow(lin, 6) + Math.pow(icMax, 6), 1 / 6) ; k ? g.lineTo(a.X(ib), a.Y(ic)) : g.moveTo(a.X(ib), a.Y(ic)); }
    g.stroke(); g.restore();
    if (p.press) dot(g, a.X(Math.min(x1, q.ib)), a.Y(Math.min(y1, rt.read('D1').i)), css('--ink'), true);
    note(g, `slope β ≈ ${beta}`, a.X(icMax / beta * 0.45) + 6, a.Y(icMax * 0.45) + 4, css('--ch2'));
    note(g, 'saturated: the LED resistor sets the current', a.L + a.pw - 6, a.T + 12, css('--acc'), 'right');
    if (!p.press) note(g, 'press S1 to see the operating point', a.L + a.pw - 6, a.T + a.ph - 8, css('--ink-soft'), 'right');
  } }
};

import { Resistor, Source, Switch, Capacitor, Diode, NPN, Timer555, VT } from './engine.js';

/* =====================================================================
   PART CATALOGUE. Values are typical datasheet figures.
   ===================================================================== */
// 5 mm through hole LEDs. vf is the forward voltage at 20 mA.
export const LEDS = {
  red:    { name: 'Red',    nm: 625, vf: 1.9, n: 2.0, hex: 0xff2d1f, css: '#ff4a36', body: 0xd8261a },
  yellow: { name: 'Yellow', nm: 590, vf: 2.0, n: 2.0, hex: 0xffc21a, css: '#ffc933', body: 0xe8b21c },
  green:  { name: 'Green',  nm: 525, vf: 3.0, n: 3.0, hex: 0x28ff6a, css: '#3dff7c', body: 0x2bbf55 },
  blue:   { name: 'Blue',   nm: 470, vf: 3.1, n: 3.0, hex: 0x2f6bff, css: '#5b8cff', body: 0x2a55d6 },
  white:  { name: 'White',  nm: 0,   vf: 3.1, n: 3.0, hex: 0xf4f7ff, css: '#f4f7ff', body: 0xe8ecf2 }
};
export const LED_RS = 10;            // bulk series resistance of the die, Ω
export const LED_IMAX = 0.030;       // absolute maximum continuous current
export const LED_INOM = 0.020;       // recommended operating current
export const R_RATING = 0.25;        // ¼ W carbon film resistor
export const Q_RATING = { ic: 0.2, p: 0.625 };   // 2N3904

export const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
export function eSeries(lo, hi, base = E12) {
  const out = [];
  for (let d = -12; d <= 9; d++) for (const m of base) { const v = +(m * 10 ** d).toPrecision(3); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  return out;
}
export const RVALS = eSeries(10, 1e6);
export const CVALS = [1e-6, 2.2e-6, 4.7e-6, 10e-6, 22e-6, 47e-6, 100e-6, 220e-6, 470e-6, 1000e-6];

// Resistor colour code, four bands, 5 % tolerance
export const BAND = [
  ['black', '#1b1b1b'], ['brown', '#7a4a24'], ['red', '#d42a1e'], ['orange', '#f07a1a'], ['yellow', '#f2d21a'],
  ['green', '#2f9a3a'], ['blue', '#2a5ad6'], ['violet', '#8b4ad6'], ['grey', '#8d8d8d'], ['white', '#f2f2f2']
];
export const GOLD = ['gold', '#c9a23a'], SILVER = ['silver', '#c0c4c8'];
export function bands(R) {
  const e = Math.floor(Math.log10(R) + 1e-9) - 1, m = Math.round(R / 10 ** e);
  const d1 = Math.floor(m / 10), d2 = m % 10;
  const mult = e >= 0 ? BAND[e] : e === -1 ? GOLD : SILVER;
  return [BAND[d1], BAND[d2], mult, GOLD];
}

/* =====================================================================
   FORMATTING
   ===================================================================== */
const PRE = [[1e-12, 'p'], [1e-9, 'n'], [1e-6, 'µ'], [1e-3, 'm'], [1, ''], [1e3, 'k'], [1e6, 'M']];
export function fmt(x, unit, dig = 3) {
  if (!isFinite(x)) return '–';
  if (Math.abs(x) < 5e-12) return '0 ' + unit;
  const a = Math.abs(x); let p = PRE[0];
  for (const q of PRE) if (a >= q[0] * 0.9995) p = q;
  const v = x / p[0], d = Math.max(0, dig - 1 - Math.floor(Math.log10(Math.abs(v) || 1)));
  return v.toFixed(Math.min(d, 3)) + ' ' + p[1] + unit;
}
export function fmtR(R) {
  if (R >= 1e6) return +(R / 1e6).toPrecision(3) + ' MΩ';
  if (R >= 1e3) return +(R / 1e3).toPrecision(3) + ' kΩ';
  return +R.toPrecision(3) + ' Ω';
}
export function fmtC(C) {
  if (C >= 1e-6) return +(C * 1e6).toPrecision(3) + ' µF';
  if (C >= 1e-9) return +(C * 1e9).toPrecision(3) + ' nF';
  return +(C * 1e12).toPrecision(3) + ' pF';
}

/* =====================================================================
   PARTS. A part owns one or more solver elements, knows its pins, and
   carries state that must survive a rebuild (heat, charge, a blown LED).
   pinCurrents() gives the current flowing from each pin's node into the part.
   ===================================================================== */
class Part {
  constructor(spec) { this.spec = spec; this.id = spec.id; this.kind = spec.kind; this.fault = null; }
  adopt() {}
  thermal() {}
  read() { return { v: 0, i: 0, p: 0 }; }
}

export class WirePart extends Part {
  build(c, n) { this.el = c.add(new Resistor(n('a'), n('b'), this.spec.R || 0.01)); }
  read(s) { const i = this.el.current(s); return { v: s.v[this.el.a] - s.v[this.el.b], i, p: 0 }; }
  pinCurrents(s) { const i = this.el.current(s); return { a: i, b: -i }; }
}

export class SupplyPart extends Part {
  build(c, n) { this.el = c.add(new Source(n('p'), n('n'), this.spec.V, this.spec.Rint || 0.05)); }
  read(s) { const i = this.el.current(s), v = s.v[this.el.a] - s.v[this.el.b]; return { v, i, p: v * i }; }
  // current delivered leaves the + pin, so it flows into the part at the - pin
  pinCurrents(s) { const i = this.el.current(s); return { p: -i, n: i }; }
}

export class ResistorPart extends Part {
  constructor(spec) { super(spec); this.R = spec.value; this.T = 25; this.burnt = false; this.rating = spec.rating || R_RATING; }
  adopt(p) { if (p && p.R === this.R) { this.T = p.T; this.burnt = p.burnt; } else if (p) this.T = p.T; }
  build(c, n) { this.el = c.add(new Resistor(n('a'), n('b'), this.burnt ? 1e12 : this.R)); }
  read(s) { const v = s.v[this.el.a] - s.v[this.el.b], i = v / this.el.R; return { v, i, p: v * i, T: this.T }; }
  pinCurrents(s) { const i = this.el.current(s); return { a: i, b: -i }; }
  // Thermal RC: 300 °C per watt, 3 s time constant. Smokes past 250 °C and fails open at 400 °C.
  thermal(dt, s) {
    const P = this.burnt ? 0 : this.read(s).p;
    this.T += (25 + 300 * P - this.T) * (1 - Math.exp(-dt / 3));
    if (!this.burnt && this.T > 400) { this.burnt = true; this.el.R = 1e12; return 'burnt'; }
    this.fault = this.burnt ? 'burnt' : this.T > 250 ? 'smoke' : P > this.rating ? 'hot' : null;
  }
  replace() { this.burnt = false; this.T = 25; this.el.R = this.R; this.fault = null; }
}

export class LedPart extends Part {
  constructor(spec) {
    super(spec); const L = LEDS[spec.color] || LEDS.red; this.L = L;
    this.Is = 0.02 / Math.exp((L.vf - 0.02 * LED_RS) / (L.n * VT));
    this.burnt = false; this.stress = 0;
  }
  adopt(p) { if (p && p.spec.color === this.spec.color) { this.burnt = p.burnt; this.stress = p.stress; } }
  build(c, n) {
    const a = n('a'), k = n('k'), m = c.node(this.id + ' die');
    this.rs = c.add(new Resistor(a, m, this.burnt ? 1e12 : LED_RS));
    this.d = c.add(new Diode(m, k, this.Is, this.L.n));
  }
  read(s) { const v = s.v[this.rs.a] - s.v[this.d.b], i = this.rs.current(s); return { v, i, p: v * i, glow: this.burnt ? 0 : Math.max(0, i) / LED_INOM }; }
  pinCurrents(s) { const i = this.rs.current(s); return { a: i, k: -i }; }
  // A 5 mm LED survives brief overloads. Well past its rating the die heats and fails open.
  thermal(dt, s) {
    const i = this.read(s).i;
    if (i > 0.06) this.stress += dt * (i / 0.06) ** 2; else this.stress = Math.max(0, this.stress - dt * 0.5);
    if (!this.burnt && this.stress > 0.6) { this.burnt = true; this.rs.R = 1e12; return 'burnt'; }
    this.fault = this.burnt ? 'burnt' : i > LED_IMAX ? 'over' : null;
  }
  replace() { this.burnt = false; this.stress = 0; this.rs.R = LED_RS; this.fault = null; }
}

export class CapPart extends Part {
  constructor(spec) { super(spec); this.C = spec.value; this.vc = 0; }
  adopt(p) { if (p) this.vc = p.el ? p.el.vc : p.vc; }
  build(c, n) { this.el = c.add(new Capacitor(n('p'), n('n'), this.C, this.vc)); }
  read(s) { const v = this.el.vc, i = this.el.i; return { v, i, p: v * i, q: this.C * v }; }
  pinCurrents() { return { p: this.el.i, n: -this.el.i }; }
}

// 6 mm tactile button: a1-a2 always joined, b1-b2 always joined, press joins a to b
export class ButtonPart extends Part {
  constructor(spec) { super(spec); this.pressed = !!spec.pressed; }
  build(c, n) {
    this.ja = c.add(new Resistor(n('a1'), n('a2'), 0.02)); this.jb = c.add(new Resistor(n('b1'), n('b2'), 0.02));
    this.sw = c.add(new Switch(n('a1'), n('b1'), this.pressed));
  }
  set(on) { this.pressed = on; this.sw.on = on; }
  read(s) { const i = this.sw.current(s); return { v: s.v[this.sw.a] - s.v[this.sw.b], i, p: 0 }; }
  pinCurrents(s) { const ia = this.ja.current(s), ib = this.jb.current(s), is = this.sw.current(s); return { a1: ia + is, a2: -ia, b1: ib - is, b2: -ib }; }
}

// SPDT slide switch: common pin c goes to a in position 0 and to b in position 1
export class SlidePart extends Part {
  constructor(spec) { super(spec); this.pos = spec.pos || 0; }
  build(c, n) { this.sa = c.add(new Switch(n('c'), n('a'), this.pos === 0)); this.sb = c.add(new Switch(n('c'), n('b'), this.pos === 1)); }
  set(pos) { this.pos = pos; this.sa.on = pos === 0; this.sb.on = pos === 1; }
  read(s) { const i = this.sa.current(s) + this.sb.current(s); return { v: 0, i, p: 0 }; }
  pinCurrents(s) { const ia = this.sa.current(s), ib = this.sb.current(s); return { c: ia + ib, a: -ia, b: -ib }; }
}

export class NpnPart extends Part {
  build(c, n) { this.el = c.add(new NPN(n('c'), n('b'), n('e'), this.spec.model)); }
  read(s) {
    const v = s.v, { ic, ib } = this.el.currents(s), vce = v[this.el.c] - v[this.el.e], vbe = v[this.el.b] - v[this.el.e];
    const p = vce * ic + vbe * ib;
    return { v: vce, i: ic, p, ib, ic, vce, vbe, beta: ib > 1e-9 ? ic / ib : 0 };
  }
  pinCurrents(s) { const { ic, ib, ie } = this.el.currents(s); return { c: ic, b: ib, e: ie }; }
  thermal(dt, s) { const r = this.read(s); this.fault = r.ic > Q_RATING.ic || r.p > Q_RATING.p ? 'over' : null; }
}

// NE555 in an 8 pin package: 1 GND, 2 TRIG, 3 OUT, 4 RESET, 5 CTRL, 6 THR, 7 DIS, 8 VCC
export class Timer555Part extends Part {
  constructor(spec) { super(spec); this.q = 0; }
  adopt(p) { if (p && p.el) { this.q = p.el.q; this.hist = p.el; } }
  build(c, n) {
    const low = c.node(this.id + ' 1/3');
    this.el = c.add(new Timer555({ gnd: n('1'), trig: n('2'), out: n('3'), reset: n('4'), ctrl: n('5'), thr: n('6'), dis: n('7'), vcc: n('8') }, low));
    this.el.q = this.q;
    if (this.hist) { for (const k of ['lastRise', 'lastFall', 'period', 'high']) this.el[k] = this.hist[k]; this.hist = null; }
  }
  read(s) {
    const e = this.el, v = s.v, vcc = v[e.vcc] - v[e.gnd];
    return { v: vcc, i: this.pinCurrents(s)['8'], p: 0, q: e.q, out: v[e.out] - v[e.gnd], period: e.period, high: e.high };
  }
  pinCurrents(s) {
    const e = this.el, v = s.v, dis = e.q ? 0 : (v[e.dis] - v[e.gnd]) * (1 / 14);
    const out = -e.outCurrent(s);
    const ctrl = (v[e.ctrl] - v[e.vcc]) / 5000 + (v[e.ctrl] - v[e.low]) / 5000;
    const vcc = (v[e.vcc] - v[e.gnd]) / 1600 + (v[e.vcc] - v[e.ctrl]) / 5000 + (e.q ? e.outCurrent(s) : 0);
    const r = { 2: 0, 3: out, 4: 0, 5: ctrl, 6: 0, 7: dis, 8: vcc };
    r[1] = -(out + ctrl + dis + vcc);
    return r;
  }
}

export const PART_CLASSES = {
  wire: WirePart, supply: SupplyPart, resistor: ResistorPart, led: LedPart, cap: CapPart,
  button: ButtonPart, slide: SlidePart, npn: NpnPart, ic555: Timer555Part
};

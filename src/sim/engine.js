/* =====================================================================
   CIRCUIT SOLVER
   Modified nodal analysis. Every node voltage is an unknown, node 0 is
   ground. Sources are stamped as Norton equivalents, so the matrix only
   ever holds node voltages. Nonlinear parts (diodes, LEDs, transistors)
   are linearised around the last guess and solved by Newton iteration
   with SPICE style junction voltage limiting. Capacitors use backward
   Euler, which stays stable through the hard edges of a 555 timer.
   ===================================================================== */
export const VT = 0.025852;      // thermal voltage kT/q at 300 K
export const GMIN = 1e-12;       // 1 TΩ from every node to ground, so a floating node still has a voltage

export class Circuit {
  constructor() { this.n = 1; this.els = []; this.labels = ['0']; }
  node(label = '') { this.labels.push(label); return this.n++; }
  add(el) { this.els.push(el); return el; }
}

// exp that grows linearly past e^80 instead of overflowing
export function safeExp(x) { return x < 80 ? Math.exp(x) : Math.exp(80) * (1 + x - 80); }

// Junction voltage limiting (Nagel's pnjlim, as in SPICE 3)
export function pnjlim(vnew, vold, vt, vcrit) {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return { v: arg > 0 ? vold + vt * Math.log(arg) : vcrit, lim: true };
    }
    return { v: vt * Math.log(vnew / vt), lim: true };
  }
  return { v: vnew, lim: false };
}

export class Solver {
  constructor(circuit) {
    this.c = circuit;
    this.N = circuit.n - 1;
    this.A = new Float64Array(this.N * this.N);
    this.b = new Float64Array(this.N);
    this.v = new Float64Array(circuit.n);
    this.t = 0; this.h = 0; this.iters = 0; this.limited = false; this.failed = 0;
    this.nonlinear = circuit.els.some(e => e.nonlinear);
  }
  V(n) { return this.v[n]; }
  // conductance G between nodes a and b
  g(a, b, G) {
    const N = this.N, A = this.A;
    if (a) A[(a - 1) * N + a - 1] += G;
    if (b) A[(b - 1) * N + b - 1] += G;
    if (a && b) { A[(a - 1) * N + b - 1] -= G; A[(b - 1) * N + a - 1] -= G; }
  }
  // current I pushed into node n from outside
  inject(n, I) { if (n) this.b[n - 1] += I; }
  jac(r, c, val) { if (r && c) this.A[(r - 1) * this.N + c - 1] += val; }

  solveLinear() {
    const N = this.N, A = this.A, x = this.b;   // eliminates in place
    for (let k = 0; k < N; k++) {
      let p = k, m = Math.abs(A[k * N + k]);
      for (let r = k + 1; r < N; r++) { const a = Math.abs(A[r * N + k]); if (a > m) { m = a; p = r; } }
      if (m < 1e-300) return false;
      if (p !== k) {
        for (let c = k; c < N; c++) { const t = A[k * N + c]; A[k * N + c] = A[p * N + c]; A[p * N + c] = t; }
        const t = x[k]; x[k] = x[p]; x[p] = t;
      }
      const d = A[k * N + k];
      for (let r = k + 1; r < N; r++) {
        const f = A[r * N + k] / d; if (f === 0) continue;
        for (let c = k + 1; c < N; c++) A[r * N + c] -= f * A[k * N + c];
        x[r] -= f * x[k];
      }
    }
    for (let k = N - 1; k >= 0; k--) {
      let s = x[k];
      for (let c = k + 1; c < N; c++) s -= A[k * N + c] * x[c];
      x[k] = s / A[k * N + k];
    }
    return true;
  }

  // Advance the circuit by h seconds. h = 0 gives the DC operating point with capacitors open.
  step(h) {
    this.h = h;
    const N = this.N, els = this.c.els, v = this.v, maxIt = this.nonlinear ? 150 : 1;
    let converged = false;
    for (let it = 0; it < maxIt; it++) {
      this.A.fill(0); this.b.fill(0); this.limited = false;
      for (let i = 0; i < N; i++) this.A[i * N + i] += GMIN;
      for (const el of els) el.stamp(this);
      if (!this.solveLinear()) { this.failed++; break; }
      let dmax = 0, vmax = 0;
      for (let i = 0; i < N; i++) { const d = Math.abs(this.b[i] - v[i + 1]); if (d > dmax) dmax = d; vmax = Math.max(vmax, Math.abs(this.b[i])); v[i + 1] = this.b[i]; }
      this.iters = it + 1;
      if (!this.nonlinear || (it > 0 && !this.limited && dmax < 1e-9 + 1e-7 * vmax)) { converged = true; break; }
    }
    if (!converged) this.failed++;
    for (const el of els) if (el.accept) el.accept(this);
    this.t += h;
    return converged;
  }
}

/* ---------------------------------------------------------------------
   ELEMENTS. Each one stamps itself into the solver. Currents are signed
   from the first terminal to the second, through the element.
   --------------------------------------------------------------------- */
export class Resistor {
  constructor(a, b, R) { this.a = a; this.b = b; this.R = R; }
  stamp(s) { s.g(this.a, this.b, 1 / this.R); }
  current(s) { return (s.v[this.a] - s.v[this.b]) / this.R; }
}

// Voltage source V with internal resistance, + at a
export class Source {
  constructor(a, b, V, Rint = 0.05) { this.a = a; this.b = b; this.V = V; this.R = Rint; }
  stamp(s) { const G = 1 / this.R; s.g(this.a, this.b, G); s.inject(this.a, this.V * G); s.inject(this.b, -this.V * G); }
  // current delivered out of the + terminal into the circuit
  current(s) { return (this.V - (s.v[this.a] - s.v[this.b])) / this.R; }
}

export class Switch {
  constructor(a, b, on = false, Ron = 0.03) { this.a = a; this.b = b; this.on = on; this.Ron = Ron; }
  stamp(s) { if (this.on) s.g(this.a, this.b, 1 / this.Ron); }
  current(s) { return this.on ? (s.v[this.a] - s.v[this.b]) / this.Ron : 0; }
}

export class Capacitor {
  constructor(a, b, C, v0 = 0) { this.a = a; this.b = b; this.C = C; this.vc = v0; this.i = 0; }
  stamp(s) {
    if (!(s.h > 0)) return;          // open at DC
    const G = this.C / s.h;
    s.g(this.a, this.b, G); s.inject(this.a, G * this.vc); s.inject(this.b, -G * this.vc);
  }
  accept(s) {
    const v = s.v[this.a] - s.v[this.b];
    this.i = s.h > 0 ? this.C * (v - this.vc) / s.h : 0;
    this.vc = v;
  }
  current() { return this.i; }
}

// Shockley diode junction, anode a, cathode b
export class Diode {
  constructor(a, b, Is, n = 1) {
    this.a = a; this.b = b; this.Is = Is; this.nvt = n * VT; this.vd = 0; this.nonlinear = true;
    this.vcrit = this.nvt * Math.log(this.nvt / (Math.SQRT2 * Is));
  }
  stamp(s) {
    const r = pnjlim(s.v[this.a] - s.v[this.b], this.vd, this.nvt, this.vcrit);
    if (r.lim) s.limited = true;
    const vd = this.vd = r.v, e = safeExp(vd / this.nvt);
    const I = this.Is * (e - 1), gd = this.Is * e / this.nvt + 1e-12;
    s.g(this.a, this.b, gd);
    const Ieq = I - gd * vd;
    s.inject(this.a, -Ieq); s.inject(this.b, Ieq);
  }
  current(s) { const vd = s.v[this.a] - s.v[this.b]; return this.Is * (safeExp(vd / this.nvt) - 1); }
}

// NPN bipolar transistor, Ebers-Moll transport model
export class NPN {
  constructor(c, b, e, { Is = 6.73e-15, bf = 200, br = 0.74 } = {}) {
    this.c = c; this.b = b; this.e = e; this.Is = Is; this.bf = bf; this.br = br;
    this.vbe = 0; this.vbc = 0; this.nonlinear = true;
    this.vcrit = VT * Math.log(VT / (Math.SQRT2 * Is));
  }
  terminal(vbe, vbc) {
    const Is = this.Is, ef = safeExp(vbe / VT), er = safeExp(vbc / VT);
    const If = Is * (ef - 1), Ir = Is * (er - 1), gf = Is * ef / VT, gr = Is * er / VT;
    const k = 1 + 1 / this.br;
    return {
      Ic: If - Ir * k, Ib: If / this.bf + Ir / this.br,
      dIc_dbe: gf, dIc_dbc: -gr * k, dIb_dbe: gf / this.bf, dIb_dbc: gr / this.br
    };
  }
  stamp(s) {
    const v = s.v, { c, b, e } = this;
    const r1 = pnjlim(v[b] - v[e], this.vbe, VT, this.vcrit), r2 = pnjlim(v[b] - v[c], this.vbc, VT, this.vcrit);
    if (r1.lim || r2.lim) s.limited = true;
    const vbe = this.vbe = r1.v, vbc = this.vbc = r2.v;
    const T = this.terminal(vbe, vbc);
    // d/dV at nodes (c, b, e): vbe = vb - ve, vbc = vb - vc
    const dIc = [-T.dIc_dbc, T.dIc_dbe + T.dIc_dbc, -T.dIc_dbe];
    const dIb = [-T.dIb_dbc, T.dIb_dbe + T.dIb_dbc, -T.dIb_dbe];
    const dIe = [-(dIc[0] + dIb[0]), -(dIc[1] + dIb[1]), -(dIc[2] + dIb[2])];
    const nodes = [c, b, e], I0 = [T.Ic, T.Ib, -(T.Ic + T.Ib)], D = [dIc, dIb, dIe];
    // linearise around the limited junction voltages: node voltages consistent with them
    const vx = [v[e] + vbe - vbc, v[e] + vbe, v[e]];
    for (let r = 0; r < 3; r++) {
      let lin = I0[r];
      for (let k = 0; k < 3; k++) { s.jac(nodes[r], nodes[k], D[r][k]); lin -= D[r][k] * vx[k]; }
      s.inject(nodes[r], -lin);
    }
    // small leak across each junction helps convergence when both are off
    s.g(b, e, 1e-12); s.g(b, c, 1e-12);
  }
  currents(s) {
    const v = s.v, T = this.terminal(v[this.b] - v[this.e], v[this.b] - v[this.c]);
    return { ic: T.Ic, ib: T.Ib, ie: -(T.Ic + T.Ib) };   // flowing into each terminal
  }
}

/* ---------------------------------------------------------------------
   NE555 TIMER, behavioural. Three 5 kΩ resistors set the comparator
   references at 1/3 and 2/3 of the supply (pin 5 sits on the upper tap).
   Trigger below 1/3 sets the flip flop: output high, discharge off.
   Threshold above 2/3 resets it: output low, discharge pin shorted to
   ground. The output stage sits about 1.6 V below the supply when high.
   --------------------------------------------------------------------- */
export class Timer555 {
  constructor(pins, lowTap) {
    Object.assign(this, pins);        // vcc, gnd, trig, thr, dis, out, ctrl, reset
    this.low = lowTap;                // internal 1/3 node
    this.q = 0; this.edges = []; this.lastRise = null; this.lastFall = null; this.period = 0; this.high = 0;
  }
  stamp(s) {
    const { vcc, gnd, out, dis, ctrl, low } = this;
    s.g(vcc, gnd, 1 / 1600);                      // quiescent supply current
    s.g(vcc, ctrl, 1 / 5000); s.g(ctrl, low, 1 / 5000); s.g(low, gnd, 1 / 5000);
    if (this.q) {
      const G = 1 / 12, drop = 1.6; s.g(vcc, out, G); s.inject(vcc, G * drop); s.inject(out, -G * drop);
    } else {
      s.g(out, gnd, 1 / 9);
      s.g(dis, gnd, 1 / 14);
    }
  }
  accept(s) {
    const v = s.v, trigLow = v[this.trig] - v[this.gnd] < v[this.low] - v[this.gnd];
    const thrHigh = v[this.thr] - v[this.gnd] > v[this.ctrl] - v[this.gnd];
    const resetLow = this.reset != null && v[this.reset] - v[this.gnd] < 0.7;
    const q0 = this.q;
    if (resetLow) this.q = 0; else if (trigLow) this.q = 1; else if (thrHigh) this.q = 0;
    const t = s.t + s.h;
    // timed from falling edge to falling edge, which skips the long first charge from 0 V
    if (this.q && !q0) this.lastRise = t;
    if (!this.q && q0) { if (this.lastFall != null && this.lastRise != null && this.lastRise > this.lastFall) { this.period = t - this.lastFall; this.high = t - this.lastRise; } this.lastFall = t; }
  }
  outCurrent(s) {   // current flowing out of pin 3 into the load
    const v = s.v;
    return this.q ? ((v[this.vcc] - v[this.out] - 1.6) * 12) : -(v[this.out] - v[this.gnd]) * 9;
  }
}

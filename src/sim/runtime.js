import { Circuit, Solver } from './engine.js';
import { PART_CLASSES } from './parts.js';

/* =====================================================================
   RUNTIME. Turns a list of parts, each pin tagged with a net name, into
   a circuit, and steps it through time. The breadboard names nets after
   its metal strips, the circuit board after its copper islands, so both
   share this code. Part state (heat, charge, a blown LED) carries over
   when the circuit is rebuilt after a change.
   ===================================================================== */
export class Runtime {
  constructor(spec, prev = null) {
    const c = this.circuit = new Circuit();
    this.spec = spec;
    this.nodeOf = new Map([[spec.ground, 0]]);
    const node = (key) => {
      if (key == null) key = '~' + c.n;             // an unconnected pin gets its own node
      if (!this.nodeOf.has(key)) this.nodeOf.set(key, c.node(key));
      return this.nodeOf.get(key);
    };
    this.parts = new Map();
    for (const ps of spec.parts) {
      const P = new PART_CLASSES[ps.kind](ps);
      const old = prev && prev.parts.get(ps.id);
      if (old && old.kind === ps.kind) P.adopt(old);
      P.pinNode = {};
      P.build(c, (pin) => (P.pinNode[pin] = node(ps.nets[pin])));
      this.parts.set(ps.id, P);
    }
    this.solver = new Solver(c);
    if (prev) for (const [k, n] of this.nodeOf) { const m = prev.nodeOf.get(k); if (n && m != null) this.solver.v[n] = prev.solver.v[m]; }
    this.solver.t = prev ? prev.t : 0;
    this.samples = prev ? prev.samples : [];
    this.nextSample = prev ? prev.nextSample : 0;
    this.hMax = spec.hMax || Infinity;
    this.slow = 1; this.events = [];
    this.solver.step(1e-7);
  }
  get t() { return this.solver.t; }
  v(key) { const n = this.nodeOf.get(key); return n == null ? NaN : this.solver.v[n]; }
  part(id) { return this.parts.get(id); }
  read(id) { const p = this.parts.get(id); return p ? p.read(this.solver) : null; }

  // Advance by dt of wall time at the given time scale. sample(rt) returns scope values.
  advance(dt, scale = 1, sample = null, sampleDt = 0.004) {
    let span = dt * scale; if (!(span > 0)) return;
    let n = Math.max(1, Math.ceil(span / this.hMax));
    const cap = 1500;
    if (n > cap) { n = cap; const s2 = n * this.hMax; this.slow = s2 / span; span = s2; } else this.slow = 1;
    const h = span / n, s = this.solver;
    for (let k = 0; k < n; k++) {
      s.step(h);
      if (sample && this.t >= this.nextSample) {
        const [a, b] = sample(this); this.samples.push({ t: this.t, a, b });
        this.nextSample = this.t + sampleDt;
      }
    }
    for (const P of this.parts.values()) { const ev = P.thermal(span, s); if (ev) this.events.push({ id: P.id, kind: P.kind, ev }); }
    const keep = this.t - Math.max(30, sampleDt * 4000);
    let cut = 0; while (cut < this.samples.length && this.samples[cut].t < keep) cut++;
    if (cut) this.samples.splice(0, cut);
  }
}

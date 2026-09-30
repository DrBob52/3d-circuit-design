import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gap, analyze, trackFlow, ipcCurrent, ipcWidth, ipcRise, trackOhms, padIndex } from '../src/pcb/geom.js';
import { PROJECTS, padsOf } from '../src/pcb/footprints.js';
import { SOLUTIONS } from '../src/pcb/solutions.js';
import { boardRuntime } from '../src/pcb/runtime.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('gap between shapes', () => {
  close(gap({ kind: 'circle', x: 0, y: 0, r: 1 }, { kind: 'circle', x: 3, y: 0, r: 1 }).d, 1, 1e-9, 'circles');
  close(gap({ kind: 'rect', x: 0, y: 0, w: 2, h: 2 }, { kind: 'rect', x: 3, y: 4, w: 2, h: 2 }).d, Math.hypot(1, 2), 1e-9, 'rects apart');
  close(gap({ kind: 'seg', ax: -5, ay: 0, bx: 5, by: 0, r: 0.1 }, { kind: 'seg', ax: 0, ay: -5, bx: 0, by: 5, r: 0.1 }).d, -0.2, 1e-9, 'crossing tracks');
  close(gap({ kind: 'seg', ax: 0, ay: 1, bx: 4, by: 1, r: 0.125 }, { kind: 'rect', x: 2, y: 0, w: 1, h: 1 }).d, 0.375, 1e-9, 'track over pad');
  close(gap({ kind: 'rect', x: 2, y: 0, w: 1, h: 1 }, { kind: 'seg', ax: 0, ay: 1, bx: 4, by: 1, r: 0.125 }).d, 0.375, 1e-9, 'order does not matter');
  close(gap({ kind: 'seg', ax: 0, ay: 0, bx: 1, by: 1, r: 0.1 }, { kind: 'circle', x: 3, y: 0, r: 0.3 }).d, Math.hypot(2, 1) - 0.4, 1e-9, 'track to via');
});

test('pads rotate with their part', () => {
  const R = PROJECTS.tag.parts[1];
  const p0 = padsOf(R, { x: 1, y: 2, rot: 0 }), p90 = padsOf(R, { x: 1, y: 2, rot: 90 });
  close(p0[0].x, 1 - 0.825, 1e-9, 'rot 0 pad a x'); close(p90[0].y, 2 - 0.825, 1e-9, 'rot 90 pad a y');
  assert.equal(p90[0].w, 0.95); assert.equal(p90[0].h, 0.8);
});

test('both worked layouts pass the design rule check', () => {
  for (const k of ['tag', 'blinker']) {
    const A = analyze(PROJECTS[k], SOLUTIONS[k]);
    assert.deepEqual(A.errors.map(e => e.msg), [], k);
    assert.equal(A.unrouted, 0, k); assert.ok(A.pass, k); assert.equal(A.warnings.length, 0, k);
  }
});

test('a missing track leaves a connection to route', () => {
  const b = clone(SOLUTIONS.tag); b.traces.splice(1, 1);
  const A = analyze(PROJECTS.tag, b);
  assert.equal(A.unrouted, 1); assert.equal(A.rats.length, 1); assert.equal(A.rats[0][4], 'LED');
});

test('a track across two nets is a short', () => {
  const b = clone(SOLUTIONS.tag); b.traces.push({ layer: 'F', w: 0.25, pts: [[-2.2, -1.27], [-2.2, 1.27]] });
  const A = analyze(PROJECTS.tag, b);
  assert.ok(A.errors.some(e => e.kind === 'short' && e.nets.includes('VCC') && e.nets.includes('GND')));
  // the same track on the bottom layer also shorts, because header pads go through the board
  const c = clone(SOLUTIONS.tag); c.traces.push({ layer: 'B', w: 0.25, pts: [[-2.2, -1.27], [-2.2, 1.27]] });
  assert.ok(analyze(PROJECTS.tag, c).errors.some(e => e.kind === 'short'));
});

test('clearance, width and edge rules', () => {
  const b = clone(SOLUTIONS.tag);
  b.traces[0].pts = [[-2.2, -1.27], [0.025, -1.27]]; b.traces.push({ layer: 'F', w: 0.25, pts: [[1.675, -1.27], [1.675, -0.62], [0.0, -0.62]] });
  let A = analyze(PROJECTS.tag, b);
  assert.ok(A.errors.some(e => e.kind === 'clearance'), 'track squeezing past a pad of another net');
  const c = clone(SOLUTIONS.tag); c.traces[0].w = 0.1;
  assert.ok(analyze(PROJECTS.tag, c).errors.some(e => e.kind === 'width'));
  const d = clone(SOLUTIONS.tag); d.w = 5.6;
  assert.ok(analyze(PROJECTS.tag, d).errors.some(e => e.kind === 'edge' || e.kind === 'place'));
  const e = clone(SOLUTIONS.tag); e.place.D1 = { x: 0.85, y: -0.6, rot: 0 };
  assert.ok(analyze(PROJECTS.tag, e).errors.some(x => x.kind === 'overlap'));
});

test('IPC-2221 outer layer sizing', () => {
  close(ipcCurrent(0.3, 1), 1.0, 0.03, '0.3 mm at 1 oz carries about 1 A for a 10 °C rise');
  close(ipcWidth(1, 1), 0.30, 0.01, 'width for 1 A');
  close(ipcRise(ipcCurrent(0.5, 2, 20), 0.5, 2), 20, 1e-6, 'rise round trip');
  close(trackOhms(10, 0.25, 1), 0.0197, 5e-4, '10 mm of 0.25 mm track');
});

test('the tag board lights its LED at about 9 mA from a coin cell', () => {
  const A = analyze(PROJECTS.tag, SOLUTIONS.tag), rt = boardRuntime(PROJECTS.tag, A);
  rt.advance(0.02);
  const d = rt.read('D1');
  close(d.i, (3 - 1.85) / (100 + 10 + 15), 0.0015, 'LED current');
  // current in the tracks matches the LED current
  const s = rt.solver, inj = (i) => {
    const o = A.objs[i]; if (o.type !== 'pad') return 0;
    if (o.part === 'J1') { const pc = rt.part('PS').pinCurrents(s); return -(o.pin === '1' ? pc.p : pc.n); }
    const P = rt.part(o.part), pc = P.pinCurrents(s); return -(pc[o.pin] || 0);
  };
  const flow = trackFlow(A, inj);
  assert.ok(flow.length >= 3);
  for (const f of flow) close(Math.abs(f.I), d.i, d.i * 0.02, 'track current');
});

test('the blinker board blinks at the 555 formula rate', () => {
  const A = analyze(PROJECTS.blinker, SOLUTIONS.blinker), rt = boardRuntime(PROJECTS.blinker, A);
  for (let i = 0; i < 60 * 5; i++) rt.advance(1 / 60);
  const u = rt.read('U1');
  close(1 / u.period, 1.44 / ((10000 + 2 * 68000) * 10e-6), 0.03, 'frequency');
  assert.ok(padIndex(A, 'U1', 5) >= 0);
});

test('a shorted board drags the supply down', () => {
  const b = clone(SOLUTIONS.tag); b.traces.push({ layer: 'F', w: 0.25, pts: [[-2.2, -1.27], [-2.2, 1.27]] });
  const A = analyze(PROJECTS.tag, b), rt = boardRuntime(PROJECTS.tag, A); rt.advance(0.02);
  assert.ok(rt.read('D1').i < 1e-6);
  close(rt.read('PS').i, 3 / 15, 0.01, 'coin cell short circuit current');
});

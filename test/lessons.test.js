import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/sim/runtime.js';
import { benchSpec, holeClashes } from '../src/bench/board.js';
import { BENCH_LESSONS } from '../src/lessons/bench.js';

function run(lesson, over = {}, seconds = 0.5) {
  const p = { ...lesson.defaults, ...over };
  const layout = lesson.layout(p);
  const rt = new Runtime(benchSpec(layout, lesson.hMax ? lesson.hMax(p) : undefined));
  const steps = Math.ceil(seconds * 60);
  for (let i = 0; i < steps; i++) rt.advance(1 / 60, 1, (r) => lesson.scope.get(r, p));
  const stats = { burnt: {}, replaced: {} };
  for (const e of rt.events) if (e.ev === 'burnt') stats.burnt[e.id] = 1;
  const ctx = { p, rt, r: (id) => rt.read(id), stats };
  return { p, rt, ctx, layout };
}
const done = (lesson, id, ctx) => lesson.tasks.find(t => t.id === id).check(ctx);

test('every station builds, has no clashing holes, and reports', () => {
  for (const L of BENCH_LESSONS) {
    for (const over of [{}, ...(L.id === 'series' ? [{ topo: 'parallel' }] : []), ...(L.id === 'divider' ? [{ load: true }] : []), ...(L.id === 'led' ? [{ flip: true }] : [])]) {
      const { p, rt, layout } = run(L, over, 0.2);
      assert.deepEqual(holeClashes(layout), [], L.id);
      const tiles = L.tiles(rt, p); assert.equal(tiles.length, 4, L.id);
      for (const t of tiles) assert.ok(Number.isFinite(t.v), `${L.id} tile ${t.k} = ${t.v}`);
      const st = L.status(rt, p); assert.ok(Array.isArray(st) && st[1].length > 5, L.id);
      assert.ok(rt.solver.failed === 0, `${L.id} solver failed ${rt.solver.failed} times`);
      const sch = typeof L.schematic === 'function' ? L.schematic(p) : L.schematic;
      for (const sp of sch.parts) assert.ok(sp.id === 'PS' || layout.parts.some(q => q.id === sp.id) || sp.ghost, `${L.id} schematic part ${sp.id}`);
      for (const w of sch.wires) assert.ok(rt.nodeOf.has(w.net) || w.ghost, `${L.id} schematic net ${w.net}`);
      // no task is already complete at the defaults
      if (!Object.keys(over).length) for (const t of L.tasks) assert.equal(!!t.check({ p, rt, r: (id) => rt.read(id), stats: { burnt: {}, replaced: {} } }), false, `${L.id}/${t.id} done at defaults`);
    }
  }
});

test('Ohm tasks', () => {
  const L = BENCH_LESSONS[0];
  assert.ok(done(L, 'ohm5', run(L, { V: 5, R: 1000 }).ctx));
  assert.ok(done(L, 'ohmhot', run(L, { V: 12, R: 220 }).ctx));
});

test('LED tasks', () => {
  const L = BENCH_LESSONS[1];
  assert.ok(done(L, 'led1015', run(L, { R: 560 }).ctx));
  assert.ok(done(L, 'ledflip', run(L, { flip: true }).ctx));
  assert.ok(done(L, 'ledblue', run(L, { color: 'blue', R: 470 }).ctx));
  assert.ok(done(L, 'ledburn', run(L, { V: 12, R: 47 }, 2).ctx));
});

test('Series and parallel tasks', () => {
  const L = BENCH_LESSONS[2];
  assert.ok(done(L, 'ser2x', run(L, { R1: 2200, R2: 1000 }).ctx));
  assert.ok(done(L, 'par500', run(L, { topo: 'parallel', R1: 1000, R2: 1000 }).ctx));
  assert.ok(done(L, 'par3x', run(L, { topo: 'parallel', R1: 1000, R2: 3300 }).ctx));
});

test('Divider tasks', () => {
  const L = BENCH_LESSONS[3];
  assert.ok(done(L, 'div33', run(L, { R1: 2700, R2: 5600 }).ctx));
  assert.ok(done(L, 'divsag', run(L, { load: true }).ctx));
  assert.ok(done(L, 'divstiff', run(L, { load: true, R1: 68, R2: 150 }).ctx));
});

test('RC tasks', () => {
  const L = BENCH_LESSONS[4];
  assert.ok(done(L, 'rcfull', run(L, {}, 5.5).ctx));
  assert.ok(done(L, 'rctau', run(L, { R: 10000 }, 0.1).ctx));
  const a = run(L, {}, 3);
  // flip to discharge, keeping the charge
  const p = { ...a.p, sw: 1 }, rt = new Runtime(benchSpec(L.layout(p), L.hMax(p)), a.rt);
  rt.advance(1 / 60);
  assert.ok(done(L, 'rcback', { p, rt, r: (id) => rt.read(id), stats: {} }));
});

test('Transistor tasks', () => {
  const L = BENCH_LESSONS[5];
  assert.ok(done(L, 'qon', run(L, { press: true }).ctx));
  assert.ok(done(L, 'qsat', run(L, { press: true, Rb: 10000 }).ctx));
  assert.ok(!done(L, 'qsat', run(L, { press: true, Rb: 1000 }).ctx));
  assert.ok(done(L, 'qhalf', run(L, { press: true, Rb: 220000 }).ctx));
});

test('Blinker tasks', () => {
  const L = BENCH_LESSONS[6];
  assert.ok(done(L, 'b1hz', run(L, { RB: 68000 }, 6).ctx));
  assert.ok(done(L, 'bduty', run(L, { RA: 1000, RB: 68000 }, 6).ctx));
  assert.ok(done(L, 'bfast', run(L, { RA: 1000, RB: 10000 }, 2).ctx));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Runtime } from '../src/sim/runtime.js';
import { bands, RVALS, fmt, fmtR } from '../src/sim/parts.js';

const close = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= rel * Math.abs(b), `${msg}: got ${a}, want ${b} ±${rel * 100}%`);

function rt(parts, hMax) { return new Runtime({ ground: 'gnd', parts, hMax }); }
const supply = (V, p = 'vcc') => ({ id: 'PS', kind: 'supply', V, nets: { p, n: 'gnd' } });

test('Ohm: 5 V across 1 kΩ gives 5 mA', () => {
  const r = rt([supply(5), { id: 'R1', kind: 'resistor', value: 1000, nets: { a: 'vcc', b: 'gnd' } }]);
  r.advance(0.016);
  close(r.read('R1').i, 0.005, 1e-3, 'current');
  close(r.read('R1').p, 0.025, 2e-3, 'power');
});

test('LED: red LED drops 1.9 V at 20 mA', () => {
  const r = rt([supply(3.9), { id: 'R1', kind: 'resistor', value: 100, nets: { a: 'vcc', b: 'x' } },
    { id: 'D1', kind: 'led', color: 'red', nets: { a: 'x', k: 'gnd' } }]);
  r.advance(0.016);
  const d = r.read('D1');
  close(d.i, 0.020, 0.03, 'LED current');
  close(d.v, 1.9, 0.02, 'LED voltage');
});

test('LED: blue LED needs about 3.1 V', () => {
  const r = rt([supply(9), { id: 'R1', kind: 'resistor', value: 330, nets: { a: 'vcc', b: 'x' } },
    { id: 'D1', kind: 'led', color: 'blue', nets: { a: 'x', k: 'gnd' } }]);
  r.advance(0.016);
  const d = r.read('D1');
  assert.ok(d.i > 0.015 && d.i < 0.02, 'blue current ' + d.i);
  assert.ok(d.v > 2.9 && d.v < 3.3, 'blue vf ' + d.v);
});

test('LED: reversed LED blocks current', () => {
  const r = rt([supply(9), { id: 'R1', kind: 'resistor', value: 330, nets: { a: 'vcc', b: 'x' } },
    { id: 'D1', kind: 'led', color: 'red', nets: { a: 'gnd', k: 'x' } }]);
  r.advance(0.016);
  assert.ok(Math.abs(r.read('D1').i) < 1e-8);
  close(r.v('x'), 9, 1e-3, 'full supply across the reversed LED');
});

test('LED burns out when driven far past its rating', () => {
  const r = rt([supply(12), { id: 'R1', kind: 'resistor', value: 47, nets: { a: 'vcc', b: 'x' } },
    { id: 'D1', kind: 'led', color: 'red', nets: { a: 'x', k: 'gnd' } }]);
  for (let i = 0; i < 120; i++) r.advance(1 / 60);
  assert.ok(r.part('D1').burnt, 'LED should have failed');
  assert.ok(Math.abs(r.read('D1').i) < 1e-6);
});

test('Resistor overheats and fails open at 1.4 W', () => {
  const r = rt([supply(12), { id: 'R1', kind: 'resistor', value: 100, nets: { a: 'vcc', b: 'gnd' } }]);
  for (let i = 0; i < 60 * 12; i++) r.advance(1 / 60);
  assert.ok(r.part('R1').burnt);
  assert.ok(r.events.some(e => e.id === 'R1' && e.ev === 'burnt'));
});

test('RC: reaches 63 % after one time constant', () => {
  const r = rt([supply(5), { id: 'R1', kind: 'resistor', value: 10000, nets: { a: 'vcc', b: 'x' } },
    { id: 'C1', kind: 'cap', value: 100e-6, nets: { p: 'x', n: 'gnd' } }], 1 / 150);
  for (let i = 0; i < 60; i++) r.advance(1 / 60);
  close(r.read('C1').v, 5 * (1 - Math.exp(-1)), 0.01, 'vc at t = τ');
});

test('Transistor saturates with 10 kΩ base resistor and sits in the active region at 220 kΩ', () => {
  const build = (Rb) => rt([supply(9),
    { id: 'Rb', kind: 'resistor', value: Rb, nets: { a: 'vcc', b: 'base' } },
    { id: 'Rc', kind: 'resistor', value: 330, nets: { a: 'vcc', b: 'an' } },
    { id: 'D1', kind: 'led', color: 'red', nets: { a: 'an', k: 'col' } },
    { id: 'Q1', kind: 'npn', nets: { c: 'col', b: 'base', e: 'gnd' } }]);
  const a = build(10000); a.advance(0.016);
  const q = a.read('Q1');
  assert.ok(q.vce < 0.2, 'saturated vce ' + q.vce);
  assert.ok(q.ic > 0.018 && q.ic < 0.023, 'saturated ic ' + q.ic);
  close(q.ib, (9 - q.vbe) / 10000, 0.01, 'base current');
  const b = build(220000); b.advance(0.016);
  const q2 = b.read('Q1');
  assert.ok(q2.vce > 2 && q2.vce < 6, 'active vce ' + q2.vce);
  close(q2.beta, 200, 0.05, 'current gain');
});

test('555 astable matches 1.44 / ((RA + 2RB) C)', () => {
  const RA = 10000, RB = 68000, C = 10e-6, parts = [supply(9),
    { id: 'U1', kind: 'ic555', nets: { 1: 'gnd', 2: 'cap', 3: 'out', 4: 'vcc', 5: 'ctrl', 6: 'cap', 7: 'dis', 8: 'vcc' } },
    { id: 'RA', kind: 'resistor', value: RA, nets: { a: 'vcc', b: 'dis' } },
    { id: 'RB', kind: 'resistor', value: RB, nets: { a: 'dis', b: 'cap' } },
    { id: 'C1', kind: 'cap', value: C, nets: { p: 'cap', n: 'gnd' } },
    { id: 'R3', kind: 'resistor', value: 470, nets: { a: 'out', b: 'led' } },
    { id: 'D1', kind: 'led', color: 'red', nets: { a: 'led', k: 'gnd' } }];
  const r = rt(parts, RB * C / 200);
  for (let i = 0; i < 60 * 6; i++) r.advance(1 / 60);
  const u = r.read('U1');
  close(1 / u.period, 1.44 / ((RA + 2 * RB) * C), 0.03, 'frequency');
  close(u.high / u.period, (RA + RB) / (RA + 2 * RB), 0.03, 'duty cycle');
});

test('Colour bands and formatting', () => {
  assert.deepEqual(bands(1000).map(b => b[0]), ['brown', 'black', 'red', 'gold']);
  assert.deepEqual(bands(470).map(b => b[0]), ['yellow', 'violet', 'brown', 'gold']);
  assert.deepEqual(bands(10).map(b => b[0]), ['brown', 'black', 'black', 'gold']);
  assert.deepEqual(bands(1e6).map(b => b[0]), ['brown', 'black', 'green', 'gold']);
  assert.equal(RVALS[0], 10); assert.equal(RVALS[RVALS.length - 1], 1e6); assert.equal(RVALS.length, 61);
  assert.equal(fmt(0.0049, 'A'), '4.90 mA'); assert.equal(fmtR(4700), '4.7 kΩ');
});

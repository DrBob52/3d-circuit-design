import { Runtime } from '../sim/runtime.js';
import { padIndex, islandKey } from './geom.js';

/* Simulate the board as drawn. Each part's pins join whatever copper
   island their pads sit in, so a missing track, a short or a swapped
   net behaves on screen the way it would on the bench. */
const PIN_MAP = { cap: { a: 'p', b: 'n' } };

export function boardSpec(project, A) {
  const key = (part, pin) => { const i = padIndex(A, part, pin); return i < 0 ? null : islandKey(A, i); };
  const J = project.parts.find(p => p.kind === 'header');
  const gnd = key(J.id, 2);
  const parts = [{ id: 'PS', kind: 'supply', V: project.supply.V, Rint: project.supply.Rint, nets: { p: key(J.id, 1), n: gnd } }];
  for (const p of project.parts) {
    if (p.kind === 'header') continue;
    const nets = {}, map = PIN_MAP[p.kind] || {};
    for (const pin in p.pins) nets[map[pin] || pin] = key(p.id, pin);
    const spec = { id: p.id, kind: p.kind, value: p.value, color: p.color, nets, pads: p.pins };
    if (p.kind === 'resistor') spec.rating = 0.1;          // 0603 resistors are rated 0.1 W
    parts.push(spec);
  }
  let hMax;
  const RB = project.parts.find(p => p.id === 'RB'), C1 = project.parts.find(p => p.id === 'C1');
  if (RB && C1) hMax = RB.value * C1.value / 200;
  return { ground: gnd, parts, hMax };
}
export function boardRuntime(project, A, prev) { return new Runtime(boardSpec(project, A), prev); }

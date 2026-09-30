/* =====================================================================
   BREADBOARD GEOMETRY. A half+ breadboard: 30 columns, rows a to j,
   two power rails top and bottom. Units are centimetres, the top face
   of the board is y = 0 and the centre channel runs along x.
   Each column's holes a-e are one metal strip, f-j another. Each rail is
   one long strip. Rails have 25 holes in groups of five.
   ===================================================================== */
export const P = 0.254;                       // 0.1 inch pitch
export const BOARD = { w: 8.2, d: 5.5, h: 0.85 };
export const ROWS = 'abcdefghij';
export const RAIL_Z = { 'T+': -2.159, 'T-': -1.905, 'B+': 1.905, 'B-': 2.159 };
export const colX = (c) => (c - 15.5) * P;
export const rowZ = (r) => { const i = ROWS.indexOf(r); return i < 5 ? -0.381 - (4 - i) * P : 0.381 + (i - 5) * P; };
export const railHas = (c) => c >= 1 && c <= 29 && c % 6 !== 0;

const cache = new Map();
export function hole(name) {
  if (cache.has(name)) return cache.get(name);
  let h, m = /^([a-j])(\d+)$/.exec(name);
  if (m) {
    const col = +m[2], top = 'abcde'.includes(m[1]);
    h = { name, row: m[1], col, strip: (top ? 'U' : 'L') + col, x: colX(col), z: rowZ(m[1]), rail: false, pos: rowZ(m[1]) };
  } else if ((m = /^([TB][+-])(\d+)$/.exec(name))) {
    const col = +m[2];
    if (!railHas(col)) throw new Error('no rail hole at column ' + col);
    h = { name, row: m[1], col, strip: m[1], x: colX(col), z: RAIL_Z[m[1]], rail: true, pos: colX(col) };
  } else throw new Error('bad hole ' + name);
  if (h.col < 1 || h.col > 30) throw new Error('bad column ' + name);
  cache.set(name, h); return h;
}
export const strip = (name) => hole(name).strip;

// Where a strip's holes run, for drawing it
export function stripSpan(id) {
  if (RAIL_Z[id] !== undefined) return { axis: 'x', z: RAIL_Z[id], a: colX(1), b: colX(29) };
  const col = +id.slice(1), top = id[0] === 'U';
  return { axis: 'z', x: colX(col), a: top ? rowZ('a') : rowZ('f'), b: top ? rowZ('e') : rowZ('j') };
}

/* Turn a breadboard layout into a runtime spec: every pin is tagged with
   the strip it sits in. The supply's negative rail is ground. */
export function benchSpec(layout, hMax) {
  const parts = [];
  const nets = (pins) => { const o = {}; for (const k in pins) o[k] = strip(pins[k]); return o; };
  parts.push({ id: 'PS', kind: 'supply', V: layout.supply.V, nets: nets(layout.supply.pins) });
  for (const p of layout.parts) parts.push({ ...p, nets: nets(p.pins) });
  layout.wires.forEach((w, i) => parts.push({ id: w.id || 'W' + (i + 1), kind: 'wire', nets: nets({ a: w.from, b: w.to }), pins: { a: w.from, b: w.to } }));
  return { ground: strip(layout.supply.pins.n), parts, hMax };
}

// Check no two legs share a hole
export function holeClashes(layout) {
  const seen = new Map(), bad = [];
  const use = (h, who) => { if (seen.has(h)) bad.push(`${h}: ${seen.get(h)} and ${who}`); seen.set(h, who); };
  for (const k in layout.supply.pins) use(layout.supply.pins[k], 'supply');
  for (const p of layout.parts) for (const k in p.pins) use(p.pins[k], p.id + '.' + k);
  layout.wires.forEach((w, i) => { use(w.from, 'wire ' + (i + 1)); use(w.to, 'wire ' + (i + 1)); });
  return bad;
}

/* =====================================================================
   FOOTPRINTS AND PROJECTS, in millimetres. Pad sizes follow the KiCad
   standard library (IPC-7351 nominal density): R_0603_1608Metric,
   LED_0603_1608Metric, C_0805_2012Metric, SOIC-8_3.9x4.9mm_P1.27mm and
   PinHeader_1x02_P2.54mm. x runs right and y runs down, as in a
   layout editor seen from above.
   ===================================================================== */
export const FAB = {
  name: 'standard 2 layer service',
  minTrace: 0.127, clearance: 0.127, edge: 0.25,        // 5 mil track and gap, copper to edge
  via: { drill: 0.3, dia: 0.6 },
  copperUm: { 0.5: 17.5, 1: 35, 2: 70 }
};

const chip = (pl, pw, px, extra = {}) => ({ pads: [{ n: 'a', x: -px, y: 0, w: pl, h: pw }, { n: 'b', x: px, y: 0, w: pl, h: pw }], ...extra });
export const FP = {
  R0603: { ...chip(0.8, 0.95, 0.825), label: '0603', body: { w: 1.6, h: 0.8, t: 0.45 }, court: { w: 2.96, h: 1.46 } },
  LED0603: { pads: [{ n: 'k', x: -0.7875, y: 0, w: 0.875, h: 0.95 }, { n: 'a', x: 0.7875, y: 0, w: 0.875, h: 0.95 }], label: '0603 LED', body: { w: 1.6, h: 0.8, t: 0.6 }, court: { w: 2.96, h: 1.46 } },
  C0603: { ...chip(0.8, 0.95, 0.775), label: '0603', body: { w: 1.6, h: 0.8, t: 0.8 }, court: { w: 2.96, h: 1.46 } },
  C0805: { ...chip(1.0, 1.45, 0.95), label: '0805', body: { w: 2.0, h: 1.25, t: 1.1 }, court: { w: 3.36, h: 1.96 } },
  SOIC8: {
    pads: [1, 2, 3, 4].map((n, i) => ({ n: String(n), x: -2.475, y: -1.905 + i * 1.27, w: 1.95, h: 0.6 }))
      .concat([5, 6, 7, 8].map((n, i) => ({ n: String(n), x: 2.475, y: 1.905 - i * 1.27, w: 1.95, h: 0.6 }))),
    label: 'SOIC-8', body: { w: 3.9, h: 4.9, t: 1.5 }, court: { w: 7.4, h: 5.4 }
  },
  HDR2: {
    pads: [{ n: '1', x: 0, y: -1.27, w: 1.7, h: 1.7, tht: true, drill: 1.0, square: true }, { n: '2', x: 0, y: 1.27, w: 1.7, h: 1.7, tht: true, drill: 1.0 }],
    label: '2 pin header', body: { w: 2.54, h: 5.08, t: 2.5 }, court: { w: 3.04, h: 5.58 }
  }
};

// Rotate a local offset by 0, 90, 180 or 270 degrees (clockwise on screen)
export function rot(x, y, r) {
  switch (((r % 360) + 360) % 360) { case 90: return [-y, x]; case 180: return [-x, -y]; case 270: return [y, -x]; default: return [x, y]; }
}
export function padsOf(part, place) {
  const fp = FP[part.fp], r = place.rot || 0, swap = r % 180 !== 0;
  return fp.pads.map(pd => {
    const [dx, dy] = rot(pd.x, pd.y, r);
    return { part: part.id, pin: pd.n, net: part.pins[pd.n] || null, x: place.x + dx, y: place.y + dy, w: swap ? pd.h : pd.w, h: swap ? pd.w : pd.h, tht: !!pd.tht, drill: pd.drill, square: pd.square };
  });
}
export function courtyard(part, place) {
  const c = FP[part.fp].court, swap = (place.rot || 0) % 180 !== 0;
  const w = swap ? c.h : c.w, h = swap ? c.w : c.h;
  return { x0: place.x - w / 2, x1: place.x + w / 2, y0: place.y - h / 2, y1: place.y + h / 2 };
}

/* The two boards you can lay out. pins map each pad to its net. */
export const PROJECTS = {
  tag: {
    name: 'LED tag', blurb: 'a coin cell, a resistor and an LED',
    supply: { V: 3.0, Rint: 15, name: 'CR2032 coin cell, 3 V', kind: 'coin' },
    parts: [
      { id: 'J1', fp: 'HDR2', kind: 'header', pins: { 1: 'VCC', 2: 'GND' }, value: 'battery' },
      { id: 'R1', fp: 'R0603', kind: 'resistor', value: 100, pins: { a: 'VCC', b: 'LED' } },
      { id: 'D1', fp: 'LED0603', kind: 'led', color: 'red', pins: { a: 'LED', k: 'GND' } }
    ],
    board: { w: 16, h: 12 }
  },
  blinker: {
    name: 'Blinker', blurb: 'the 555 blinker from station 7',
    supply: { V: 9.0, Rint: 1.5, name: '9 V battery', kind: 'pp3' },
    parts: [
      { id: 'J1', fp: 'HDR2', kind: 'header', pins: { 1: 'VCC', 2: 'GND' }, value: 'battery' },
      { id: 'U1', fp: 'SOIC8', kind: 'ic555', pins: { 1: 'GND', 2: 'THR', 3: 'OUT', 4: 'VCC', 5: null, 6: 'THR', 7: 'DIS', 8: 'VCC' }, value: 'NE555' },
      { id: 'RA', fp: 'R0603', kind: 'resistor', value: 10000, pins: { a: 'VCC', b: 'DIS' } },
      { id: 'RB', fp: 'R0603', kind: 'resistor', value: 68000, pins: { a: 'DIS', b: 'THR' } },
      { id: 'C1', fp: 'C0805', kind: 'cap', value: 10e-6, pins: { a: 'THR', b: 'GND' } },
      { id: 'C2', fp: 'C0603', kind: 'cap', value: 100e-9, pins: { a: 'VCC', b: 'GND' } },
      { id: 'R3', fp: 'R0603', kind: 'resistor', value: 470, pins: { a: 'OUT', b: 'LED' } },
      { id: 'D1', fp: 'LED0603', kind: 'led', color: 'red', pins: { a: 'LED', k: 'GND' } }
    ],
    board: { w: 22, h: 16 }
  }
};
// Net colours for the ratsnest and the schematic
export const NET_HUE = { VCC: '#ef5b4c', GND: '#6aa0ff', LED: '#fdb42f', DIS: '#b388ff', THR: '#35b779', OUT: '#4dd0e1' };

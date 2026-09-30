import { fmt, fmtR, fmtC, LEDS, LED_IMAX, LED_INOM, R_RATING, RVALS } from '../sim/parts.js';

/* =====================================================================
   BREADBOARD STATIONS
   Each station gives: the words, the controls, a breadboard layout
   (hole by hole), a schematic, what the scope and readouts show, and
   tasks that tick themselves off when the circuit gets there.
   Supply leads always land in the top rails at column 1.
   ===================================================================== */
const SUPPLY = (V) => ({ V, pins: { p: 'T+1', n: 'T-1' } });
const RED = 'red', BLK = 'black';
const near = (x, y, tol) => Math.abs(x - y) <= tol;
const pct = (x) => (x * 100).toFixed(x < 0.1 ? 1 : 0) + ' %';
const mA = (i) => fmt(i, 'A');
const Rsel = (key, label, min = 10, max = 1e6) => ({ type: 'rsel', key, label, min, max });

// shared supply readout for the spec list
const specSupply = (rt, p) => ['Supply', `${(+p.V).toFixed(1)} V, 0.05 Ω internal`];
const specR = (id, R) => [id, `${fmtR(R)} carbon film, ¼ W`];
const specLed = (id, c) => [id, `${LEDS[c].name.toLowerCase()}${LEDS[c].nm ? ' ' + LEDS[c].nm + ' nm' : ''}, V<sub>f</sub> ${LEDS[c].vf} V at 20 mA`];

export const ohm = {
  id: 'ohm', num: 1, sym: 'Ω', name: "Ohm's law", title: 'Voltage, current and resistance',
  text: [
    'The supply holds its red lead a few volts above its black lead. That difference is the voltage, the push. Charge leaves the red lead, passes through the resistor and comes back on the black one. The flow is the current, measured in amps.',
    'The resistor decides how much current a given push produces. Raise the voltage and the current rises in step with it. A bigger resistor lets less through. Georg Ohm measured this in 1827.',
    'Every resistor turns current into heat. The power it has to shed is P = V × I, and the small ones used on breadboards are rated for a quarter of a watt.',
    'The moving dots are the current. Their speed shows how much is flowing and their colour shows the voltage at that spot, so you can watch the charge lose its push as it crosses the resistor.'
  ],
  formula: ['I = V / R', 'P = V × I'],
  defaults: { V: 3, R: 1000 },
  controls: [
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 0, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('R', 'Resistor R1')
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [{ id: 'R1', kind: 'resistor', value: p.R, pins: { a: 'c10', b: 'c14' } }],
    wires: [{ from: 'T+10', to: 'a10', color: RED }, { from: 'a14', to: 'T-14', color: BLK }]
  }),
  probe: 'R1',
  scope: { ch1: ['Voltage across R1', 'V'], ch2: ['Current', 'A'], get: (rt) => { const r = rt.read('R1'); return [r.v, r.i]; } },
  tiles: (rt, p) => {
    const r = rt.read('R1');
    return [
      { k: 'Current', v: r.i, u: 'A', x: `${(+p.V).toFixed(1)} V ÷ ${fmtR(p.R)}`, ch: 1 },
      { k: 'Voltage across R1', v: r.v, u: 'V', x: 'the whole supply', ch: 2 },
      { k: 'Power in R1', v: r.p, u: 'W', x: `rating ${R_RATING} W`, warn: r.p > R_RATING },
      { k: 'R1 temperature', v: r.T, u: '°C', raw: true, x: 'surface, estimated', warn: r.T > 120 }
    ];
  },
  status: (rt, p) => {
    const P = rt.part('R1'), r = rt.read('R1');
    if (P.burnt) return ['fault', 'R1 has burnt out and no current flows. Press Replace part to fit a new one.'];
    if (P.fault === 'smoke') return ['fault', `R1 is smoking at ${r.T.toFixed(0)} °C. It is taking ${fmt(r.p, 'W')}, far over its ¼ W rating.`];
    if (r.p > R_RATING) return ['warm', `${fmt(r.p, 'W')} is more than the ¼ W rating. R1 is heating up.`];
    if (Math.abs(r.i) < 1e-7) return ['idle', 'The supply is at 0 V, so nothing flows.'];
    return ['live', `${mA(r.i)} through ${fmtR(p.R)}, ${fmt(r.p, 'W')} of heat`];
  },
  tasks: [
    { id: 'ohm5', text: 'Set 5 V across 1 kΩ. The current should read 5 mA.', check: (c) => near(c.p.V, 5, 0.05) && c.p.R === 1000 && near(c.r('R1').i, 0.005, 2e-4) },
    { id: 'ohm10', text: 'Keep 1 kΩ and raise the supply to 10 V. Watch the current double.', check: (c) => near(c.p.V, 10, 0.05) && c.p.R === 1000 },
    { id: 'ohmhot', text: 'Push R1 past its ¼ W rating and watch it heat up.', check: (c) => c.r('R1').p > R_RATING },
    { id: 'ohmburn', text: 'Keep going until R1 burns out, then replace it.', check: (c) => c.stats.replaced.R1 > 0 }
  ],
  spec: (rt, p) => [specSupply(rt, p), specR('R1', p.R), ['Model', 'ideal resistor, 300 °C/W, fails open at 400 °C'], ['Wires', '10 mΩ each']],
  schematic: {
    w: 12, h: 8,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4] }, { id: 'R1', sym: 'resistor', at: [6, 1] }],
    wires: [{ net: 'T+', pts: [[2, 2.5], [2, 1], [4.5, 1]] }, { net: 'T-', pts: [[7.5, 1], [10, 1], [10, 7], [2, 7], [2, 5.5]] }],
    volts: [{ net: 'T+', at: [3.2, 0.35] }, { net: 'T-', at: [6, 7.65] }],
    grounds: [[6, 7]]
  },
  graph: 'ohm'
};

export const led = {
  id: 'led', num: 2, sym: 'LED', name: 'Light an LED', title: 'LEDs and current limiting',
  text: [
    'An LED is a diode that makes light. Current only passes one way, from the long leg (the anode) to the short leg (the cathode). Turn it round and it blocks.',
    'It also takes a fairly fixed bite out of the voltage, called the forward voltage. Red LEDs need about 1.9 V and blue ones about 3.1 V. Whatever is left over lands on the resistor, and that leftover sets the current.',
    'Leave the resistor out and the current climbs until the LED dies. Most 5 mm LEDs are happy at 10 to 20 mA and rated for 30 mA at most.',
    'To pick the resistor, subtract the forward voltage from the supply and divide by the current you want.'
  ],
  formula: ['R = (V<sub>supply</sub> − V<sub>f</sub>) / I'],
  defaults: { V: 9, R: 470, color: 'red', flip: false },
  controls: [
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 0, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('R', 'Resistor R1'),
    { type: 'cells', key: 'color', label: 'LED colour', options: Object.entries(LEDS).map(([k, L]) => ({ k, sym: L.name[0], z: L.vf.toFixed(1) + ' V', nm: L.name, swatch: L.css })) },
    { type: 'toggle', key: 'flip', label: 'Turn the LED round', on: 'LED is backwards', off: 'Turn the LED round' }
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [
      { id: 'R1', kind: 'resistor', value: p.R, pins: { a: 'c10', b: 'c14' } },
      { id: 'D1', kind: 'led', color: p.color, pins: p.flip ? { a: 'd15', k: 'd14' } : { a: 'd14', k: 'd15' } }
    ],
    wires: [{ from: 'T+10', to: 'a10', color: RED }, { from: 'a15', to: 'T-15', color: BLK }]
  }),
  probe: 'D1',
  scope: { ch1: ['LED voltage', 'V'], ch2: ['LED current', 'A'], get: (rt) => { const r = rt.read('D1'); return [r.v, r.i]; } },
  tiles: (rt, p) => {
    const d = rt.read('D1'), r = rt.read('R1');
    return [
      { k: 'LED current', v: d.i, u: 'A', x: 'aim for 10 to 20 mA', ch: 2, warn: d.i > LED_INOM },
      { k: 'LED voltage', v: d.v, u: 'V', x: 'forward voltage', ch: 1 },
      { k: 'Across R1', v: r.v, u: 'V', x: 'the leftover voltage' },
      { k: 'Brightness', v: Math.min(d.glow, 9.99) * 100, u: '%', raw: true, x: 'of the 20 mA level' }
    ];
  },
  status: (rt, p) => {
    const P = rt.part('D1'), d = rt.read('D1');
    if (P.burnt) return ['fault', 'The LED has burnt out. Fit a bigger resistor, then press Replace part.'];
    if (rt.part('R1').burnt) return ['fault', 'R1 has burnt out. Press Replace part.'];
    if (p.flip) return ['idle', p.V > 5 ? `The LED is backwards and blocks. The full ${(+p.V).toFixed(1)} V sits across it, over its 5 V reverse rating.` : 'The LED is backwards, so it blocks the current.'];
    if (d.i > LED_IMAX) return ['fault', `${mA(d.i)} is over the 30 mA maximum. The LED will fail.`];
    if (d.i > LED_INOM) return ['warm', `${mA(d.i)} is above the 20 mA the LED is designed for.`];
    if (d.i < 50e-6) return ['idle', `Only ${mA(d.i)}. The supply is too low to get past the ${LEDS[p.color].vf} V forward voltage.`];
    return ['live', `LED at ${mA(d.i)}, inside its 20 mA rating`];
  },
  tasks: [
    { id: 'led1015', text: 'Light the red LED at 10 to 15 mA.', check: (c) => c.p.color === 'red' && !c.p.flip && c.r('D1').i >= 0.0099 && c.r('D1').i <= 0.0151 },
    { id: 'ledflip', text: 'Turn the LED round with the supply at 3 V or more. It stops conducting.', check: (c) => c.p.flip && c.p.V >= 3 && Math.abs(c.r('D1').i) < 1e-5 },
    { id: 'ledblue', text: 'Switch to blue, set 9 V, and pick a resistor that keeps it between 5 and 20 mA.', check: (c) => c.p.color === 'blue' && !c.p.flip && near(c.p.V, 9, 0.05) && c.r('D1').i > 0.005 && c.r('D1').i < 0.02 },
    { id: 'ledburn', text: 'Find out what a 47 Ω resistor does to an LED on 12 V.', check: (c) => c.stats.burnt.D1 > 0 }
  ],
  spec: (rt, p) => [specSupply(rt, p), specR('R1', p.R), specLed('D1', p.color), ['LED model', 'Shockley diode, 10 Ω series, fails past 60 mA']],
  schematic: (p) => ({
    w: 12, h: 8,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4] }, { id: 'R1', sym: 'resistor', at: [5.5, 1] }, { id: 'D1', sym: 'led', at: [10, 4], rot: p.flip ? 270 : 90, color: p.color }],
    wires: [{ net: 'T+', pts: [[2, 2.5], [2, 1], [4, 1]] }, { net: 'U14', pts: [[7, 1], [10, 1], [10, 2.5]] }, { net: 'T-', pts: [[10, 5.5], [10, 7], [2, 7], [2, 5.5]] }],
    volts: [{ net: 'T+', at: [3, 0.35] }, { net: 'U14', at: [8.6, 0.35] }, { net: 'T-', at: [6, 7.65] }],
    grounds: [[6, 7]]
  }),
  graph: 'led'
};

export const series = {
  id: 'series', num: 3, sym: '∥', name: 'Series and parallel', title: 'Series and parallel',
  text: [
    'In series the resistors sit end to end, so the same current flows through both. The supply voltage splits between them, and the bigger resistor takes the bigger share. The total resistance is the sum.',
    'In parallel each resistor has its own path and gets the full supply voltage. Now the current splits, with more of it taking the easier path. The total ends up smaller than either resistor on its own.',
    'Behind both are Kirchhoff’s two laws. The voltage drops around any loop add up to the supply voltage, and whatever current flows into a junction flows out again.'
  ],
  formula: ['Series: R = R1 + R2', 'Parallel: R = R1 × R2 / (R1 + R2)'],
  defaults: { V: 9, R1: 1000, R2: 2200, topo: 'series' },
  controls: [
    { type: 'choice', key: 'topo', label: 'Wiring', options: [['series', 'Series'], ['parallel', 'Parallel']] },
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 0, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('R1', 'Resistor R1'), Rsel('R2', 'Resistor R2')
  ],
  layout: (p) => p.topo === 'series' ? {
    supply: SUPPLY(p.V),
    parts: [{ id: 'R1', kind: 'resistor', value: p.R1, pins: { a: 'c7', b: 'c11' } }, { id: 'R2', kind: 'resistor', value: p.R2, pins: { a: 'd11', b: 'd15' } }],
    wires: [{ from: 'T+7', to: 'a7', color: RED }, { from: 'a15', to: 'T-15', color: BLK }]
  } : {
    supply: SUPPLY(p.V),
    parts: [{ id: 'R1', kind: 'resistor', value: p.R1, pins: { a: 'b7', b: 'b11' } }, { id: 'R2', kind: 'resistor', value: p.R2, pins: { a: 'd7', b: 'd11' } }],
    wires: [{ from: 'T+7', to: 'a7', color: RED }, { from: 'a11', to: 'T-11', color: BLK }]
  },
  probe: 'R1',
  scope: { ch1: ['Voltage across R1', 'V'], ch2: ['Voltage across R2', 'V'], get: (rt) => [rt.read('R1').v, rt.read('R2').v] },
  tiles: (rt, p) => {
    const a = rt.read('R1'), b = rt.read('R2'), I = rt.read('PS').i, Rt = p.topo === 'series' ? p.R1 + p.R2 : p.R1 * p.R2 / (p.R1 + p.R2);
    return [
      { k: 'Total resistance', v: Rt, u: 'Ω', x: p.topo === 'series' ? 'R1 + R2' : 'R1 × R2 / (R1 + R2)' },
      { k: 'Supply current', v: I, u: 'A', x: 'out of the red lead' },
      { k: 'R1', v: a.v, u: 'V', x: `carries ${mA(a.i)}`, ch: 1 },
      { k: 'R2', v: b.v, u: 'V', x: `carries ${mA(b.i)}`, ch: 2 }
    ];
  },
  status: (rt, p) => {
    for (const id of ['R1', 'R2']) if (rt.part(id).burnt) return ['fault', `${id} has burnt out. Press Replace part.`];
    const a = rt.read('R1'), b = rt.read('R2');
    if (a.p > R_RATING || b.p > R_RATING) return ['warm', `${a.p > b.p ? 'R1' : 'R2'} is over its ¼ W rating and heating up.`];
    if (p.topo === 'series') return ['live', `Same ${mA(a.i)} through both. ${a.v.toFixed(2)} V + ${b.v.toFixed(2)} V = ${(a.v + b.v).toFixed(2)} V`];
    return ['live', `Same ${a.v.toFixed(2)} V across both. ${mA(a.i)} + ${mA(b.i)} = ${mA(a.i + b.i)}`];
  },
  tasks: [
    { id: 'ser2x', text: 'In series, make R1 drop twice the voltage of R2.', check: (c) => c.p.topo === 'series' && c.r('R2').v > 0.1 && near(c.r('R1').v / c.r('R2').v, 2, 0.25) },
    { id: 'par500', text: 'Switch to parallel and get a total of 500 Ω, give or take 20.', check: (c) => c.p.topo === 'parallel' && near(c.p.R1 * c.p.R2 / (c.p.R1 + c.p.R2), 500, 20) },
    { id: 'par3x', text: 'In parallel, make one resistor carry at least three times the current of the other.', check: (c) => { if (c.p.topo !== 'parallel') return false; const a = Math.abs(c.r('R1').i), b = Math.abs(c.r('R2').i); return Math.min(a, b) > 1e-6 && Math.max(a, b) / Math.min(a, b) >= 3; } }
  ],
  spec: (rt, p) => [specSupply(rt, p), specR('R1', p.R1), specR('R2', p.R2), ['Wiring', p.topo]],
  schematic: (p) => p.topo === 'series' ? {
    w: 13, h: 8,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4] }, { id: 'R1', sym: 'resistor', at: [5, 1] }, { id: 'R2', sym: 'resistor', at: [11, 4], rot: 90 }],
    wires: [{ net: 'T+', pts: [[2, 2.5], [2, 1], [3.5, 1]] }, { net: 'U11', pts: [[6.5, 1], [11, 1], [11, 2.5]] }, { net: 'T-', pts: [[11, 5.5], [11, 7], [2, 7], [2, 5.5]] }],
    volts: [{ net: 'T+', at: [3, 0.35] }, { net: 'U11', at: [8.8, 0.35] }, { net: 'T-', at: [6.5, 7.65] }],
    grounds: [[6.5, 7]]
  } : {
    w: 13, h: 8,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4] }, { id: 'R1', sym: 'resistor', at: [7, 4], rot: 90 }, { id: 'R2', sym: 'resistor', at: [11, 4], rot: 90 }],
    wires: [{ net: 'T+', pts: [[2, 2.5], [2, 1], [11, 1], [11, 2.5]] }, { net: 'T+', pts: [[7, 1], [7, 2.5]] }, { net: 'T-', pts: [[11, 5.5], [11, 7], [2, 7], [2, 5.5]] }, { net: 'T-', pts: [[7, 5.5], [7, 7]] }],
    dots: [[7, 1], [7, 7]],
    volts: [{ net: 'T+', at: [4.5, 0.35] }, { net: 'T-', at: [4.5, 7.65] }],
    grounds: [[9, 7]]
  },
  graph: 'series'
};

export const divider = {
  id: 'divider', num: 4, sym: '÷', name: 'Voltage divider', title: 'The voltage divider',
  text: [
    'Two resistors in series split the supply. Tap the point between them and you get a new, lower voltage. Sensors and volume knobs use this all the time.',
    'The output depends only on the ratio of the two resistors, as long as nothing draws current from the middle.',
    'A load changes that. It sits in parallel with the bottom resistor and drags the output down. The cure is to make the divider’s resistors small compared with the load, which wastes some current in the divider itself.'
  ],
  formula: ['V<sub>out</sub> = V<sub>in</sub> × R2 / (R1 + R2)'],
  defaults: { V: 5, R1: 1000, R2: 2200, load: false, RL: 1000 },
  controls: [
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 0, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('R1', 'Top resistor R1'), Rsel('R2', 'Bottom resistor R2'),
    { type: 'toggle', key: 'load', label: 'Connect the load', on: 'Load connected', off: 'Connect the load' },
    Rsel('RL', 'Load resistor RL')
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [
      { id: 'R1', kind: 'resistor', value: p.R1, pins: { a: 'c7', b: 'c11' } },
      { id: 'R2', kind: 'resistor', value: p.R2, pins: { a: 'd11', b: 'd15' } },
      ...(p.load ? [{ id: 'RL', kind: 'resistor', value: p.RL, pins: { a: 'g11', b: 'g15' } }] : [])
    ],
    wires: [
      { from: 'T+7', to: 'a7', color: RED }, { from: 'a15', to: 'T-15', color: BLK },
      { from: 'e11', to: 'f11', color: 'yellow' }, { from: 'j15', to: 'B-15', color: BLK }, { from: 'T-29', to: 'B-29', color: BLK }
    ],
    tags: [{ strip: 'U11', text: 'V out' }]
  }),
  probe: 'R2',
  scope: { ch1: ['V out', 'V'], ch2: ['Supply current', 'A'], get: (rt) => [rt.v('U11'), rt.read('PS').i] },
  tiles: (rt, p) => {
    const vo = rt.v('U11'), ideal = p.V * p.R2 / (p.R1 + p.R2), sag = ideal > 1e-3 ? 1 - vo / ideal : 0;
    return [
      { k: 'V out', v: vo, u: 'V', x: 'measured', ch: 1 },
      { k: 'Without a load', v: ideal, u: 'V', x: 'V × R2 / (R1 + R2)' },
      { k: 'Load current', v: p.load ? rt.read('RL').i : 0, u: 'A', x: p.load ? 'through RL' : 'load not connected' },
      { k: 'Sag', v: sag * 100, u: '%', raw: true, x: 'drop caused by the load', warn: sag > 0.05 }
    ];
  },
  status: (rt, p) => {
    for (const id of ['R1', 'R2', 'RL']) if (rt.part(id) && rt.part(id).burnt) return ['fault', `${id} has burnt out. Press Replace part.`];
    const vo = rt.v('U11'), ideal = p.V * p.R2 / (p.R1 + p.R2), sag = ideal > 1e-3 ? 1 - vo / ideal : 0;
    if (!p.load) return ['live', `V out is ${vo.toFixed(2)} V, ${pct(p.R2 / (p.R1 + p.R2))} of the supply`];
    if (sag > 0.05) return ['warm', `The load pulls V out down to ${vo.toFixed(2)} V, ${pct(sag)} below ${ideal.toFixed(2)} V`];
    return ['live', `Loaded V out is ${vo.toFixed(2)} V, only ${pct(sag)} below the unloaded value`];
  },
  tasks: [
    { id: 'div33', text: 'From a 5 V supply with no load, make 3.3 V within 0.1 V.', check: (c) => near(c.p.V, 5, 0.05) && !c.p.load && near(c.rt.v('U11'), 3.3, 0.1) },
    { id: 'divsag', text: 'Connect a 1 kΩ load and watch the output sag by more than 10 %.', check: (c) => c.p.load && c.p.RL === 1000 && 1 - c.rt.v('U11') / (c.p.V * c.p.R2 / (c.p.R1 + c.p.R2)) > 0.1 },
    { id: 'divstiff', text: 'Keep the 1 kΩ load and bring the sag under 5 %.', check: (c) => c.p.load && c.p.RL === 1000 && c.p.V > 1 && 1 - c.rt.v('U11') / (c.p.V * c.p.R2 / (c.p.R1 + c.p.R2)) < 0.05 }
  ],
  spec: (rt, p) => [specSupply(rt, p), specR('R1', p.R1), specR('R2', p.R2), p.load ? specR('RL', p.RL) : ['RL', 'not connected']],
  schematic: (p) => ({
    w: 12, h: 9.5,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4.5] }, { id: 'R1', sym: 'resistor', at: [6, 2.5], rot: 90 }, { id: 'R2', sym: 'resistor', at: [6, 6.5], rot: 90 },
      { id: 'RL', sym: 'resistor', at: [9.5, 6.5], rot: 90, ghost: !p.load }],
    wires: [{ net: 'T+', pts: [[2, 3], [2, 1], [6, 1]] }, { net: 'U11', pts: [[6, 4], [6, 5]] }, { net: 'U11', pts: [[6, 4.5], [9.5, 4.5], [9.5, 5]], ghost: !p.load },
      { net: 'T-', pts: [[6, 8], [2, 8], [2, 6]] }, { net: 'T-', pts: [[9.5, 8], [6, 8]], ghost: !p.load }],
    dots: [[6, 4.5], ...(p.load ? [[6, 8]] : [])],
    volts: [{ net: 'T+', at: [3.4, 0.35] }, { net: 'U11', at: [8.2, 3.85], label: 'V out' }, { net: 'T-', at: [4, 8.65] }],
    grounds: [[4, 8]]
  }),
  graph: 'divider'
};

export const rc = {
  id: 'rc', num: 5, sym: 'RC', name: 'Capacitor timing', title: 'Capacitors and time',
  text: [
    'A capacitor stores charge on two metal plates with a thin insulator between them. While it fills, charge piles onto one plate and drains off the other, so current flows everywhere else in the loop.',
    'The fuller it gets, the harder it pushes back, and the current fades. How fast it fades is set by the time constant τ = R × C. One τ in, the capacitor has reached 63 % of the supply. After five it is effectively full.',
    'Slide the switch to the other side and the stored charge drains back out through the resistor, flowing the opposite way.',
    'This same timing sets how fast the blinker in station 7 flashes.'
  ],
  formula: ['τ = R × C', 'V<sub>C</sub> = V × (1 − e<sup>−t/τ</sup>)'],
  defaults: { V: 5, R: 4700, C: 100e-6, sw: 0 },
  controls: [
    { type: 'choice', key: 'sw', label: 'Switch S1', options: [[0, 'Charge'], [1, 'Discharge']] },
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 1, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('R', 'Resistor R1', 100, 1e6),
    { type: 'csel', key: 'C', label: 'Capacitor C1' }
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [
      { id: 'S1', kind: 'slide', pos: p.sw, pins: { a: 'b5', c: 'b6', b: 'b7' } },
      { id: 'R1', kind: 'resistor', value: p.R, pins: { a: 'c6', b: 'c10' } },
      { id: 'C1', kind: 'cap', value: p.C, pins: { p: 'd10', n: 'd11' } }
    ],
    wires: [{ from: 'T+5', to: 'a5', color: RED }, { from: 'a7', to: 'T-7', color: BLK }, { from: 'a11', to: 'T-11', color: BLK }]
  }),
  hMax: (p) => p.R * p.C / 150,
  live: { sw: (rt, v) => rt.part('S1').set(v) },
  window: (p) => Math.min(60, Math.max(2, niceUp(5 * p.R * p.C))),
  probe: 'C1',
  scope: { ch1: ['Capacitor voltage', 'V'], ch2: ['Current', 'A'], get: (rt) => { const c = rt.read('C1'); return [c.v, c.i]; } },
  tiles: (rt, p) => {
    const c = rt.read('C1'), tau = p.R * p.C;
    return [
      { k: 'Capacitor voltage', v: c.v, u: 'V', x: `${pct(c.v / p.V)} of the supply`, ch: 1 },
      { k: 'Current', v: c.i, u: 'A', x: c.i < -1e-7 ? 'flowing back out' : 'into C1', ch: 2 },
      { k: 'Time constant τ', v: tau, u: 's', x: `${fmtR(p.R)} × ${fmtC(p.C)}` },
      { k: 'Stored charge', v: c.q, u: 'C', x: `energy ${fmt(0.5 * p.C * c.v * c.v, 'J')}` }
    ];
  },
  status: (rt, p) => {
    const c = rt.read('C1'), f = c.v / p.V;
    if (p.sw === 0) return f > 0.99 ? ['live', `Charged to ${c.v.toFixed(2)} V. The current has faded to ${mA(c.i)}.`] : ['warm', `Charging: ${pct(f)} full, ${mA(c.i)} flowing in`];
    return c.v > 0.01 ? ['warm', `Discharging: ${c.v.toFixed(2)} V left, ${mA(-c.i)} flowing back out`] : ['idle', 'The capacitor is empty.'];
  },
  tasks: [
    { id: 'rcfull', text: 'Charge C1 to more than 99 % of the supply.', check: (c) => c.p.sw === 0 && c.r('C1').v > 0.99 * c.p.V },
    { id: 'rctau', text: 'Pick R and C so that τ is between 0.8 and 1.25 seconds.', check: (c) => c.p.R * c.p.C >= 0.8 && c.p.R * c.p.C <= 1.25 },
    { id: 'rcback', text: 'Discharge it and watch the current run backwards.', check: (c) => c.p.sw === 1 && c.r('C1').i < -1e-4 }
  ],
  spec: (rt, p) => [specSupply(rt, p), specR('R1', p.R), ['C1', `${fmtC(p.C)} electrolytic, 16 V`], ['S1', 'slide switch, 30 mΩ closed'], ['Time step', fmt(p.R * p.C / 150, 's') + ', backward Euler']],
  schematic: (p) => ({
    w: 12, h: 9,
    parts: [{ id: 'PS', sym: 'source', at: [2, 4.5] }, { id: 'S1', sym: 'spdt', at: [5.5, 2], pos: p.sw, lab: [0.4, 1.35] }, { id: 'R1', sym: 'resistor', at: [8.5, 2] }, { id: 'C1', sym: 'cap', at: [10, 5], rot: 90 }],
    wires: [{ net: 'T+', pts: [[2, 3], [2, 1], [4, 1]] }, { net: 'T-', pts: [[4, 3], [4, 8]] }, { net: 'U10', pts: [[10, 2], [10, 3.5]] }, { net: 'T-', pts: [[10, 6.5], [10, 8], [2, 8], [2, 6]] }],
    dots: [[4, 8]],
    volts: [{ net: 'T+', at: [3, 0.35] }, { net: 'U10', at: [11.2, 1.4] }, { net: 'T-', at: [7, 8.65] }],
    grounds: [[7, 8]]
  }),
  graph: 'rc'
};

export const transistor = {
  id: 'transistor', num: 6, sym: 'Q', name: 'Transistor switch', title: 'The transistor as a switch',
  text: [
    'A transistor lets a small current control a much bigger one. A trickle into the base lets up to about 200 times as much flow from collector to emitter. That ratio is the current gain, β.',
    'As a switch you want it fully on, which is called saturation. The voltage across it then falls to about 0.1 V and nearly all of the supply reaches the LED. A safe habit is a base current of at least a tenth of the load current.',
    'Starve the base and the transistor only half opens. It then sits in the middle, dropping volts and turning them into heat.',
    'A microcontroller pin can only supply a few milliamps. This is how it runs motors and bright lights anyway.'
  ],
  formula: ['I<sub>B</sub> ≈ (V − 0.7 V) / R<sub>B</sub>', 'I<sub>C</sub> = β × I<sub>B</sub>, until saturation'],
  defaults: { V: 9, Rb: 1000, Rc: 330, press: false },
  controls: [
    { type: 'toggle', key: 'press', label: 'Press button S1', on: 'S1 held down', off: 'Press button S1', hint: 'You can also click the button in the view.' },
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 3, max: 12, step: 0.1, unit: 'V', dig: 1 },
    Rsel('Rb', 'Base resistor RB', 1000, 1e6), Rsel('Rc', 'LED resistor RC', 100, 4700)
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [
      { id: 'S1', kind: 'button', pressed: p.press, pins: { a1: 'e10', a2: 'f10', b1: 'e12', b2: 'f12' } },
      { id: 'RB', kind: 'resistor', value: p.Rb, pins: { a: 'c12', b: 'c16' } },
      { id: 'Q1', kind: 'npn', pins: { e: 'e15', b: 'e16', c: 'e17' } },
      { id: 'D1', kind: 'led', color: 'red', pins: { k: 'b17', a: 'b18' } },
      { id: 'RC', kind: 'resistor', value: p.Rc, pins: { a: 'c18', b: 'c22' } }
    ],
    wires: [{ from: 'T+10', to: 'a10', color: RED }, { from: 'a15', to: 'T-15', color: BLK }, { from: 'a22', to: 'T+22', color: RED }]
  }),
  probe: 'Q1',
  live: { press: (rt, v) => rt.part('S1').set(v) },
  scope: { ch1: ['V<sub>CE</sub>', 'V'], ch2: ['LED current', 'A'], get: (rt) => [rt.read('Q1').vce, rt.read('D1').i] },
  tiles: (rt, p) => {
    const q = rt.read('Q1'), forced = q.ib > 1e-9 ? q.ic / q.ib : 0;
    return [
      { k: 'Base current', v: q.ib, u: 'A', x: 'the control current' },
      { k: 'LED current', v: rt.read('D1').i, u: 'A', x: 'collector current', ch: 2 },
      { k: 'V<sub>CE</sub>', v: q.vce, u: 'V', x: q.vce < 0.3 && q.ib > 1e-7 ? 'saturated, fully on' : q.ib > 1e-7 ? 'active, partly on' : 'off', ch: 1 },
      { k: 'I<sub>C</sub> ÷ I<sub>B</sub>', v: forced, u: '', raw: true, x: q.ib > 1e-7 ? (forced < 150 ? 'less than β, so saturated' : 'equals β ≈ 200') : 'no base current' }
    ];
  },
  status: (rt, p) => {
    const q = rt.read('Q1'), i = rt.read('D1').i;
    if (!p.press) return ['idle', 'Button up. No base current, so the transistor is off and the LED is dark.'];
    if (q.vce < 0.3) return ['live', `Saturated. ${mA(q.ib)} into the base switches ${mA(i)} through the LED.`];
    if (q.vce < p.V - 2.5) return ['warm', `Only partly on. ${q.vce.toFixed(2)} V sits across the transistor and it wastes ${fmt(q.p, 'W')} as heat.`];
    return ['warm', `Barely on. ${mA(q.ib)} of base current is not enough to light the LED.`];
  },
  tasks: [
    { id: 'qon', text: 'Press the button to switch the LED on.', check: (c) => c.p.press && c.r('D1').i > 0.005 },
    { id: 'qsat', text: 'Saturate the transistor (V<sub>CE</sub> under 0.3 V) with less than 1 mA of base current and at least 10 mA in the LED.', check: (c) => { const q = c.r('Q1'); return c.p.press && q.ib < 0.001 && q.vce < 0.3 && c.r('D1').i >= 0.01; } },
    { id: 'qhalf', text: 'Pick a large base resistor so the transistor only half opens, with V<sub>CE</sub> between 2 and 6 V.', check: (c) => c.p.press && c.r('Q1').vce > 2 && c.r('Q1').vce < 6 }
  ],
  spec: (rt, p) => [specSupply(rt, p), ['Q1', '2N3904 NPN, Ebers-Moll, β 200'], specR('RB', p.Rb), specR('RC', p.Rc), specLed('D1', 'red'), ['S1', '6 mm tactile button']],
  schematic: (p) => ({
    w: 17, h: 7.6,
    parts: [{ id: 'PS', sym: 'source', at: [1.5, 3.75] }, { id: 'S1', sym: 'button', at: [4.5, 2.25], rot: 90, pressed: p.press },
      { id: 'RB', sym: 'resistor', at: [8, 4.5] }, { id: 'RC', sym: 'resistor', at: [9, 0.75] }, { id: 'D1', sym: 'led', at: [13, 0.75], color: 'red' }, { id: 'Q1', sym: 'npn', at: [14.5, 4.5] }],
    wires: [{ net: 'T+', pts: [[1.5, 2.25], [1.5, 0.75], [7.5, 0.75]] }, { net: 'U18', pts: [[10.5, 0.75], [11.5, 0.75]] }, { net: 'U17', pts: [[14.5, 0.75], [15, 0.75], [15, 3]] },
      { net: 'U12', pts: [[4.5, 3.75], [4.5, 4.5], [6.5, 4.5]] }, { net: 'U16', pts: [[9.5, 4.5], [13, 4.5]] },
      { net: 'T-', pts: [[15, 6], [15, 6.75], [1.5, 6.75], [1.5, 5.25]] }],
    dots: [[4.5, 0.75]],
    volts: [{ net: 'T+', at: [3, 0.15] }, { net: 'U16', at: [11.3, 3.85], label: 'base' }, { net: 'U17', at: [16.4, 2.2], label: 'C' }, { net: 'T-', at: [8, 7.35] }],
    grounds: [[5.5, 6.75]]
  }),
  graph: 'transistor'
};

export const blinker = {
  id: 'blinker', num: 7, sym: '555', name: 'Blinker', title: 'A 555 timer blinker',
  text: [
    'The 555 timer was designed in 1971 and is still one of the most popular chips ever made. Here it charges C1 through RA and RB until it reaches two thirds of the supply. Then it empties C1 through RB alone, down to one third, and starts again.',
    'The output pin is high while C1 charges and low while it drains, so the LED blinks. Bigger resistors or a bigger capacitor slow it down.',
    'On the oscilloscope the capacitor voltage saws between the two dashed thresholds while the output snaps high and low.',
    'This is the circuit you will lay out as a real board in station 9.'
  ],
  formula: ['f = 1.44 / ((R<sub>A</sub> + 2 R<sub>B</sub>) × C)', 'duty = (R<sub>A</sub> + R<sub>B</sub>) / (R<sub>A</sub> + 2 R<sub>B</sub>)'],
  defaults: { V: 9, RA: 10000, RB: 33000, C: 10e-6 },
  controls: [
    { type: 'slider', key: 'V', label: 'Supply voltage', min: 5, max: 15, step: 0.1, unit: 'V', dig: 1 },
    Rsel('RA', 'Resistor RA', 1000, 100000), Rsel('RB', 'Resistor RB', 1000, 1e6),
    { type: 'csel', key: 'C', label: 'Timing capacitor C1' }
  ],
  layout: (p) => ({
    supply: SUPPLY(p.V),
    parts: [
      { id: 'U1', kind: 'ic555', pins: { 1: 'f10', 2: 'f11', 3: 'f12', 4: 'f13', 5: 'e13', 6: 'e12', 7: 'e11', 8: 'e10' } },
      { id: 'RA', kind: 'resistor', value: p.RA, pins: { a: 'c7', b: 'c11' } },
      { id: 'RB', kind: 'resistor', value: p.RB, pins: { a: 'd11', b: 'g11' }, lift: 0.62 },
      { id: 'C1', kind: 'cap', value: p.C, pins: { p: 'i11', n: 'i10' } },
      { id: 'R3', kind: 'resistor', value: 470, pins: { a: 'g12', b: 'g16' } },
      { id: 'D1', kind: 'led', color: 'red', pins: { a: 'h16', k: 'h17' } }
    ],
    wires: [
      { from: 'T+10', to: 'a10', color: RED }, { from: 'T+7', to: 'a7', color: RED },
      { from: 'c12', to: 'h11', color: 'blue', arch: 0.95 },
      { from: 'j10', to: 'B-10', color: BLK }, { from: 'j17', to: 'B-17', color: BLK }, { from: 'j13', to: 'B+13', color: RED },
      { from: 'T+28', to: 'B+28', color: RED }, { from: 'T-29', to: 'B-29', color: BLK }
    ]
  }),
  hMax: (p) => Math.min(p.RB, p.RA + p.RB) * p.C / 200,
  window: (p) => Math.min(20, Math.max(1, niceUp(4 * 0.693 * (p.RA + 2 * p.RB) * p.C))),
  probe: 'C1',
  scope: { ch1: ['Capacitor voltage', 'V'], ch2: ['Output, pin 3', 'V'], same: true, get: (rt) => [rt.read('C1').v, rt.read('U1').out], thresholds: (p) => [p.V / 3, 2 * p.V / 3] },
  tiles: (rt, p) => {
    const u = rt.read('U1'), f = u.period > 0 ? 1 / u.period : 0, fp = 1.44 / ((p.RA + 2 * p.RB) * p.C);
    return [
      { k: 'Measured frequency', v: f, u: 'Hz', x: u.period > 0 ? `period ${fmt(u.period, 's')}` : 'waiting for two edges', ch: 1 },
      { k: 'Formula', v: fp, u: 'Hz', x: '1.44 / ((RA + 2RB) C)' },
      { k: 'Duty cycle', v: u.period > 0 ? u.high / u.period * 100 : 0, u: '%', raw: true, x: `formula ${pct((p.RA + p.RB) / (p.RA + 2 * p.RB))}` },
      { k: 'Output', v: u.out, u: 'V', x: u.q ? 'high, LED on' : 'low, LED off', ch: 2 }
    ];
  },
  status: (rt, p) => {
    const u = rt.read('U1'), f = 1.44 / ((p.RA + 2 * p.RB) * p.C);
    if (f > 25) return ['warm', `Blinking at ${fmt(f, 'Hz')}, too fast for your eye. Slow the clock in Display to see it.`];
    return ['live', `Output ${u.q ? 'high' : 'low'}, C1 at ${rt.read('C1').v.toFixed(2)} V, about ${fmt(f, 'Hz')}`];
  },
  tasks: [
    { id: 'b1hz', text: 'Make the LED blink about once a second (0.8 to 1.25 Hz, measured).', check: (c) => { const u = c.r('U1'); return u.period > 0 && 1 / u.period >= 0.8 && 1 / u.period <= 1.25 && near(1 / u.period, 1.44 / ((c.p.RA + 2 * c.p.RB) * c.p.C), 0.1); } },
    { id: 'bduty', text: 'Bring the duty cycle under 55 %.', check: (c) => (c.p.RA + c.p.RB) / (c.p.RA + 2 * c.p.RB) < 0.55 && c.r('U1').period > 0 && c.r('U1').high / c.r('U1').period < 0.55 },
    { id: 'bfast', text: 'Blink faster than 5 times a second.', check: (c) => { const u = c.r('U1'); return u.period > 0 && 1 / u.period > 5 && near(1 / u.period, 1.44 / ((c.p.RA + 2 * c.p.RB) * c.p.C), 0.15); } }
  ],
  spec: (rt, p) => [specSupply(rt, p), ['U1', 'NE555, behavioural model'], specR('RA', p.RA), specR('RB', p.RB), ['C1', `${fmtC(p.C)} electrolytic`], specR('R3', 470), specLed('D1', 'red')],
  schematic: {
    w: 21, h: 9.9,
    parts: [{ id: 'PS', sym: 'source', at: [1.2, 4.5] }, { id: 'U1', sym: 'ic555', at: [12, 4.5] }, { id: 'RA', sym: 'resistor', at: [6, 1.5], rot: 90 },
      { id: 'RB', sym: 'resistor', at: [6, 4.5], rot: 90, lab: [0.6, -0.55] }, { id: 'C1', sym: 'cap', at: [4, 7.5], rot: 90, lab: [-0.6, -0.1, 'right'] }, { id: 'R3', sym: 'resistor', at: [16.5, 3.5], lab: [-1.3, 1.05] }, { id: 'D1', sym: 'led', at: [18.5, 6], rot: 90, color: 'red' }],
    wires: [
      { net: 'T+', pts: [[1.2, 3], [1.2, 0], [12.8, 0], [12.8, 1]] }, { net: 'T+', pts: [[11.2, 0], [11.2, 1]] },
      { net: 'U11', pts: [[6, 3], [9, 3]] },
      { net: 'L11', pts: [[4, 6], [9, 6]] }, { net: 'L11', pts: [[9, 4.5], [8.5, 4.5], [8.5, 6]] },
      { net: 'L12', pts: [[18, 3.5], [18.5, 3.5], [18.5, 4.5]] },
      { net: 'T-', pts: [[1.2, 6], [1.2, 9], [18.5, 9], [18.5, 7.5]] }, { net: 'T-', pts: [[12, 8], [12, 9]] }
    ],
    dots: [[6, 3], [6, 6], [8.5, 6], [6, 0], [11.2, 0], [4, 9], [12, 9]],
    volts: [{ net: 'T+', at: [3.4, -0.5] }, { net: 'U11', at: [7.6, 2.4], label: 'DIS' }, { net: 'L11', at: [7.2, 6.65], label: 'C1' }, { net: 'L12', at: [16.6, 2.75], label: 'out' }, { net: 'T-', at: [8, 9.65] }],
    grounds: [[15, 9]]
  },
  graph: null
};

export function niceUp(x) { const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }

export const BENCH_LESSONS = [ohm, led, series, divider, rc, transistor, blinker];
export { RVALS };

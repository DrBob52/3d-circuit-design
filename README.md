# Circuit bench

An interactive 3D teaching bench for electronics. It starts with one resistor on a breadboard and ends with you laying out a tiny two-layer circuit board that passes a real factory's design rules. Inspired by [thebuggeddev/electromagnetism](https://github.com/thebuggeddev/electromagnetism).

Every number on screen comes from a circuit simulation running live in the page. Change a part and the current dots, the multimeter, the oscilloscope and the schematic all follow.

## The nine stations

| # | Station | What you learn | You'll try |
|---|---|---|---|
| 1 | Ohm's law | voltage, current, resistance, power | burning out a ¼ W resistor |
| 2 | Light an LED | forward voltage, current limiting | sizing a resistor for a blue LED |
| 3 | Series and parallel | Kirchhoff's two laws | making 500 Ω from two resistors |
| 4 | Voltage divider | ratios, and why loads sag | making 3.3 V from 5 V |
| 5 | Capacitor timing | charge, τ = RC | a one second time constant |
| 6 | Transistor switch | gain, saturation | switching an LED with under 1 mA |
| 7 | Blinker | the 555 timer | blinking once a second |
| 8 | Inside a board | FR-4, copper, mask, silkscreen, vias, IPC-2221 | sizing a track for 1 A |
| 9 | Lay out a board | placement, routing, vias, design rule check | a working LED tag under 100 mm², then the blinker |

Tasks tick themselves off when the circuit gets there. Progress is saved in your browser.

## Run it

```sh
npm install
npm run dev      # then open the address it prints
npm test         # solver, lessons and board geometry tests
npm run build    # static site in dist/
```

## Using it

- **Drag** in the 3D view to orbit, **scroll** to zoom. **Click a part** to put the multimeter on it; hover for its live readings.
- The multimeter's dial switches between volts, milliamps and ohms. Click the dial labels.
- **Display** toggles the current dots, electron flow, the coloured strip voltages and the labels. **Clock** slows time by 10 or 100, which you need to see a fast blinker.
- In station 9: pick **Move parts** and drag parts onto the board, **R** rotates the selected one. Pick **Draw tracks**, click a pad, click to add corners, and click the pad it should join. **V** drops a via and continues on the other layer. **Esc** cancels, **Backspace** removes the last corner. Click an item in the design rule report to fly to it.

## How it works

**Solver** (`src/sim/engine.js`). Modified nodal analysis with every node voltage as an unknown. Sources are stamped as Norton equivalents. Nonlinear parts are linearised and solved by Newton iteration with SPICE's junction voltage limiting. Capacitors use backward Euler, which stays stable through the 555's hard switching edges. The time step shrinks to a small fraction of the circuit's time constant; if keeping accuracy needs more steps than a frame allows, the clock slows and the header says so.

**Part models** (`src/sim/parts.js`)

- Resistors carry a thermal model: 300 °C per watt, 3 s time constant, smoking past 250 °C, failing open at 400 °C.
- LEDs are Shockley diodes with 10 Ω of series resistance, fitted to each colour's forward voltage at 20 mA (red 1.9 V, blue 3.1 V). They fail open when driven well past 60 mA.
- The 2N3904 uses the Ebers-Moll transport model with β = 200.
- The NE555 is behavioural: a 5 kΩ divider sets the 1/3 and 2/3 thresholds, the output sits 1.6 V below the supply when high, and the discharge pin shorts to ground when low. Its measured frequency lands within 1 % of 1.44 / ((RA + 2RB) C).

**Breadboard** (`src/bench/`). Parts are placed hole by hole on a half+ breadboard. Each metal strip becomes a circuit node, so a part in the wrong row really is disconnected. Current along each strip is worked out from what enters and leaves at each hole.

**Circuit board** (`src/pcb/`). Footprints follow the KiCad standard library (0603, 0805, SOIC-8, 2.54 mm pads). The design rule check finds copper islands, shorts, clearances under 0.127 mm, tracks under 0.127 mm, copper within 0.25 mm of the edge, overlapping parts and unrouted nets. These match the standard two-layer service of common board factories. The simulation runs on the copper you actually drew, so a short or a missing track behaves like it would on the bench. Current along each track comes from solving each copper island as a little resistor network. Track sizing uses IPC-2221 for outer layers: I = 0.048 × ΔT^0.44 × A^0.725, with A in square mils.

## What it leaves out

- It models DC and slow signals. There's no inductance or radio-frequency behaviour, and the 555 has no internal delays.
- Temperatures are estimates to show the idea of a power rating, not predictions for a specific part.
- The layout editor teaches the workflow. It does not export Gerber files. For a board you want made, use [KiCad](https://www.kicad.org/): the same steps apply, schematic, footprints, layout, design rule check, then Gerbers for the factory.

## Next steps toward your own tiny board

1. Build stations 2 and 7 on a real breadboard with a multimeter.
2. Draw the LED tag in KiCad's schematic editor, assign footprints, lay it out, and run its DRC.
3. Order five copies from a board service. A board this small usually costs a few dollars.
4. Solder 0603 parts with fine tweezers, flux and a fine tip, or start with 0805, which is larger.

## Sources

- LED forward voltages: typical 5 mm LED datasheets (red 1.8 to 2.2 V, blue and white 3.0 to 3.6 V at 20 mA).
- 2N3904: ON Semiconductor datasheet (hFE 100 to 300 at 10 mA, V<sub>CE(sat)</sub> under 0.2 V, I<sub>C</sub> max 200 mA).
- NE555: Texas Instruments datasheet; astable timing t<sub>H</sub> = 0.693 (RA + RB) C, t<sub>L</sub> = 0.693 RB C.
- IPC-2221 track current formula, outer layer k = 0.048.
- JLCPCB capabilities for standard two-layer boards: 0.127 mm minimum track and gap, 0.3 mm vias are routine.
- Footprints: KiCad standard library, IPC-7351 nominal density.

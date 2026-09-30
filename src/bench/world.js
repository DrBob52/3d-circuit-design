import * as THREE from 'three';
import { BOARD, P, ROWS, RAIL_Z, colX, rowZ, railHas, hole, stripSpan } from './board.js';
import { buildPart, LEG } from './parts3d.js';
import { Flow } from './flow.js';
import { fillet, tubeMesh, V3, canvasTex, redraw, FONT, labelSprite, viridis, draw7, puffTexture } from './util3d.js';
import { fmtR, fmtC, LEDS } from '../sim/parts.js';

/* =====================================================================
   BENCH WORLD: an anti-static mat, a bench supply, a breadboard, and
   whatever the station puts on it. Units are centimetres.
   ===================================================================== */
const WIRE_COLORS = { red: 0xc9302c, black: 0x1f1f21, yellow: 0xe6b422, blue: 0x2f62c9, green: 0x2f9e55, orange: 0xe07b2a, white: 0xe8e8e8 };
const H = (name) => { const h = hole(name); return V3(h.x, 0, h.z); };
const MAT_Y = -BOARD.h;

export class BenchWorld {
  constructor() {
    this.group = new THREE.Group();
    this.dyn = new THREE.Group(); this.group.add(this.dyn);
    this.flow = new Flow(6000); this.group.add(this.flow.mesh);
    this.parts = new Map(); this.pickables = []; this.strips = new Map(); this.labels = [];
    this.buildMat(); this.buildBoard(); this.buildSupply(); this.buildSmoke();
    this.views = {
      Angled: { az: 0.42, el: 0.82, r: 10, target: V3(-1, 0.15, -0.5) },
      Top: { az: 0, el: 1.53, r: 9.5, target: V3(-1, 0, -0.5) },
      Front: { az: 0.05, el: 0.3, r: 8, target: V3(-1, 0.3, -0.5) },
      Close: { az: 0.6, el: 0.6, r: 5, target: V3(-1, 0.25, -0.5) },
      Bench: { az: 0.3, el: 0.75, r: 16, target: V3(-1.6, 0, -0.4) }
    };
    this.defaultView = 'Angled';
  }

  buildMat() {
    const tex = canvasTex(512, 512, (g, W) => {
      g.fillStyle = '#27313a'; g.fillRect(0, 0, W, W);
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.025})`; g.fillRect(Math.random() * W, Math.random() * W, 2, 2); }
      g.strokeStyle = 'rgba(160,190,210,0.10)'; g.lineWidth = 2;
      for (let k = 0; k <= 5; k++) { const x = k * W / 5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, W); g.moveTo(0, x); g.lineTo(W, x); g.stroke(); }
      g.strokeStyle = 'rgba(160,190,210,0.22)'; g.lineWidth = 3; g.strokeRect(0, 0, W, W);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(16, 12);
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(80, 60).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92 }));
    mat.position.set(0, MAT_Y, 0); this.group.add(mat);
  }

  buildBoard() {
    const W = 2048, Hh = Math.round(2048 * BOARD.d / BOARD.w), sx = W / BOARD.w;
    const px = (x) => (x + BOARD.w / 2) * sx, pz = (z) => (z + BOARD.d / 2) * sx;
    const tex = canvasTex(W, Hh, (g) => {
      g.fillStyle = '#efece5'; g.fillRect(0, 0, W, Hh);
      for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(90,80,60,${Math.random() * 0.03})`; g.fillRect(Math.random() * W, Math.random() * Hh, 3, 3); }
      // centre channel
      const cg = g.createLinearGradient(0, pz(-0.16), 0, pz(0.16));
      cg.addColorStop(0, '#cfccc4'); cg.addColorStop(0.5, '#bdb9b0'); cg.addColorStop(1, '#d6d3cb');
      g.fillStyle = cg; g.fillRect(px(-3.95), pz(-0.16), px(3.95) - px(-3.95), pz(0.16) - pz(-0.16));
      // rail stripes
      const stripe = (z, color) => { g.fillStyle = color; g.fillRect(px(colX(1) - 0.2), pz(z) - 5, px(colX(29) + 0.2) - px(colX(1) - 0.2), 10); };
      stripe(RAIL_Z['T+'] - 0.16, '#d2362c'); stripe(RAIL_Z['T-'] + 0.16, '#2d5fbf');
      stripe(RAIL_Z['B+'] - 0.16, '#d2362c'); stripe(RAIL_Z['B-'] + 0.16, '#2d5fbf');
      g.font = `700 46px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [k, sgn, col] of [['T+', '+', '#d2362c'], ['T-', '−', '#2d5fbf'], ['B+', '+', '#d2362c'], ['B-', '−', '#2d5fbf']]) {
        g.fillStyle = col; g.fillText(sgn, px(colX(-0.1)), pz(RAIL_Z[k])); g.fillText(sgn, px(colX(31.1)), pz(RAIL_Z[k]));
      }
      // holes
      const holeAt = (x, z) => {
        const s = 21, X = px(x) - s / 2, Z = pz(z) - s / 2;
        g.fillStyle = '#dcd8cf'; g.fillRect(X - 4, Z - 4, s + 8, s + 8);
        g.fillStyle = '#4b4843'; g.fillRect(X, Z, s, s);
        g.fillStyle = '#6a665e'; g.fillRect(X, Z + s - 5, s, 5);
        g.fillStyle = '#2e2c29'; g.fillRect(X + 4, Z + 3, s - 8, s - 9);
      };
      for (let c = 1; c <= 30; c++) for (const r of ROWS) holeAt(colX(c), rowZ(r));
      for (const k in RAIL_Z) for (let c = 1; c <= 29; c++) if (railHas(c)) holeAt(colX(c), RAIL_Z[k]);
      // row letters and column numbers
      g.fillStyle = '#8b877d'; g.font = `600 34px ${FONT}`;
      for (const r of ROWS) { g.fillText(r, px(colX(0) + 0.02), pz(rowZ(r))); g.fillText(r, px(colX(31) - 0.02), pz(rowZ(r))); }
      for (const c of [1, 5, 10, 15, 20, 25, 30]) { g.fillText(String(c), px(colX(c)), pz(rowZ('a') - 0.24)); g.fillText(String(c), px(colX(c)), pz(rowZ('j') + 0.24)); }
    });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.d).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75 }));
    top.position.y = 0.0005;
    const body = new THREE.Mesh(new THREE.BoxGeometry(BOARD.w, BOARD.h - 0.002, BOARD.d), new THREE.MeshStandardMaterial({ color: 0xe6e3dc, roughness: 0.8 }));
    body.position.y = -BOARD.h / 2 - 0.001;
    this.board = new THREE.Group(); this.board.add(top, body); this.group.add(this.board);
  }

  buildSupply() {
    const g = new THREE.Group(), w = 2.6, h = 1.7, d = 2.0, cx = -6.05, cz = -2.35;
    const caseMat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.55, metalness: 0.3 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), caseMat); box.position.set(cx, MAT_Y + h / 2, cz); g.add(box);
    this.supplyTex = canvasTex(520, 340, (c) => this.drawSupply(c, 0, 0));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.96, h * 0.9), new THREE.MeshStandardMaterial({ map: this.supplyTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: this.supplyTex, emissiveIntensity: 0.55 }));
    face.position.set(cx, MAT_Y + h / 2, cz + d / 2 + 0.003); g.add(face);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.18, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.4 }));
    knob.position.set(cx - 0.8, MAT_Y + 0.42, cz + d / 2 + 0.09); g.add(knob); this.knob = knob;
    const post = (x, color) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
      m.position.set(x, MAT_Y + 0.42, cz + d / 2 + 0.11); g.add(m); return m.position.clone().add(V3(0, 0, 0.1));
    };
    const pPlus = post(cx + 0.95, 0xc9302c), pMinus = post(cx + 0.45, 0x1f1f21);
    const lead = (from, holeName, color) => {
      const t = H(holeName);
      const pts = [from, from.clone().add(V3(0, 0.05, 0.35)), V3((from.x + t.x) / 2 - 0.2, 0.75, (from.z + t.z) / 2 + 0.25), V3(t.x - 0.1, 0.45, t.z), V3(t.x, 0.12, t.z)];
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      const dense = curve.getPoints(60);
      g.add(tubeMesh(dense, 0.055, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), 10));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10), LEG); tip.position.set(t.x, 0.0, t.z); g.add(tip);
      dense.push(V3(t.x, 0.01, t.z));
      return dense;
    };
    this.leadPlus = lead(pPlus, 'T+1', 0xc9302c);
    this.leadMinus = lead(pMinus, 'T-1', 0x1f1f21).reverse();
    this.group.add(g); this.supply = g;
  }
  drawSupply(c, V, I) {
    const W = c.canvas.width, Hh = c.canvas.height;
    c.fillStyle = '#2c2f33'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#a9adb3'; c.font = `600 20px ${FONT}`; c.textAlign = 'left'; c.fillText('BENCH SUPPLY  0–15 V  1 A', 24, 36);
    const panel = (x, y, w, h) => { c.fillStyle = '#0c0d0c'; c.fillRect(x, y, w, h); };
    panel(24, 56, 300, 96); panel(24, 166, 300, 96);
    const txt = (v, d) => { const s = v.toFixed(d); return s.length > 5 ? s.slice(0, 5) : s.padStart(5, ' '); };
    draw7(c, txt(V, 2), 40, 70, 68, '#ff5a3c', '#2a1410'); draw7(c, txt(Math.abs(I), 3), 40, 180, 68, '#58e07c', '#10251a');
    c.fillStyle = '#c9ccd1'; c.font = `600 26px ${FONT}`; c.fillText('V', 334, 128); c.fillText('A', 334, 238);
    c.fillStyle = '#8d9196'; c.font = `500 17px ${FONT}`; c.fillText('VOLTAGE', 390, 290); c.fillText('+', 486, 322); c.fillText('−', 440, 322);
  }

  buildSmoke() {
    this.smoke = [];
    const mat = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, opacity: 0 });
    for (let i = 0; i < 48; i++) { const s = new THREE.Sprite(mat.clone()); s.visible = false; s.userData = { life: 0 }; s.renderOrder = 8; this.group.add(s); this.smoke.push(s); }
    this.smokeAcc = 0;
  }
  puff(at, n = 1) {
    for (let k = 0; k < n; k++) {
      const s = this.smoke.find(q => !q.visible); if (!s) return;
      s.visible = true; s.position.copy(at).add(V3((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.5) * 0.15));
      s.userData = { life: 0, max: 1.6 + Math.random(), vx: (Math.random() - 0.5) * 0.15, vz: (Math.random() - 0.5) * 0.15 };
    }
  }

  /* ---------- station layout ---------- */
  setLayout(layout) {
    for (const o of [...this.dyn.children]) { this.dyn.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
    this.parts.clear(); this.pickables = []; this.strips.clear(); this.labels = [];
    this.layout = layout;
    const attach = new Map();   // strip -> [{pos, id, pin, hole}]
    const add = (holeName, id, pin) => {
      const h = hole(holeName);
      if (!attach.has(h.strip)) attach.set(h.strip, []);
      attach.get(h.strip).push({ pos: h.pos, id, pin, h });
    };
    add(layout.supply.pins.p, 'PS', 'p'); add(layout.supply.pins.n, 'PS', 'n');
    const paths = [];
    // supply leads
    paths.push({ id: 'PS', pts: this.leadPlus, pins: this.leadPlus.map(() => 'p'), cur: (Pt, s, pc) => -pc.p });
    paths.push({ id: 'PS', pts: this.leadMinus, pins: this.leadMinus.map(() => 'n'), cur: (Pt, s, pc) => pc.n });
    for (const spec of layout.parts) {
      const b = buildPart(spec, H); b.spec = spec;
      this.dyn.add(b.root); this.parts.set(spec.id, b);
      for (const m of b.pick) this.pickables.push(m);
      for (const pth of b.paths) paths.push({ ...pth, id: spec.id });
      for (const k in spec.pins) add(spec.pins[k], spec.id, k);
      const lab = labelSprite(`${spec.id} ${partValue(spec)}`, 0.2); lab.position.copy(b.labelAt); this.dyn.add(lab); this.labels.push(lab);
    }
    layout.wires.forEach((w, i) => {
      const id = w.id || 'W' + (i + 1), pa = H(w.from), pb = H(w.to);
      const pts = w.arch ? archPath(pa, pb, w.arch) : flatPath(pa, pb);
      const mat = new THREE.MeshStandardMaterial({ color: WIRE_COLORS[w.color] ?? 0x888888, roughness: 0.5 });
      const ins = tubeMesh(pts.slice(1, -1), 0.045, mat, 10);
      this.dyn.add(ins);
      for (const p of [pa, pb]) { const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 8), LEG); tip.position.set(p.x, 0.02, p.z); this.dyn.add(tip); }
      const flowPts = pts.slice(1, -1); flowPts.unshift(V3(pa.x, 0.01, pa.z)); flowPts.push(V3(pb.x, 0.01, pb.z));
      paths.push({ id, pts: flowPts, pins: flowPts.map((_, k) => k < flowPts.length / 2 ? 'a' : 'b'), cur: (Pt, s, pc) => pc.a });
      add(w.from, id, 'a'); add(w.to, id, 'b');
    });
    // strips: a tinted band per used strip, and dots between the holes in use
    for (const [sid, list] of attach) {
      list.sort((a, b) => a.pos - b.pos);
      const sp = stripSpan(sid), mat = new THREE.MeshBasicMaterial({ color: 0x444444, transparent: true, opacity: 0.5, depthWrite: false });
      const len = sp.b - sp.a + 0.26, geo = sp.axis === 'x' ? new THREE.BoxGeometry(len, 0.004, 0.16) : new THREE.BoxGeometry(0.16, 0.004, len);
      const band = new THREE.Mesh(geo, mat); band.renderOrder = 2;
      if (sp.axis === 'x') band.position.set((sp.a + sp.b) / 2, 0.004, sp.z); else band.position.set(sp.x, 0.004, (sp.a + sp.b) / 2);
      this.dyn.add(band);
      const segs = [];
      for (let k = 0; k + 1 < list.length; k++) {
        const A = list[k].h, B = list[k + 1].h;
        const seg = { id: sid, strip: sid, pts: [V3(A.x, 0.012, A.z), V3(B.x, 0.012, B.z)], k };
        segs.push(seg); paths.push(seg);
      }
      this.strips.set(sid, { band, mat, list, segs });
    }
    for (const t of layout.tags || []) {
      const sp = stripSpan(t.strip), lab = labelSprite(t.text, 0.2, '#141414', 'rgba(253,231,37,0.92)');
      lab.position.set(sp.axis === 'x' ? sp.a : sp.x, 0.05, sp.axis === 'x' ? sp.z : sp.b + 0.25); this.dyn.add(lab); this.labels.push(lab);
    }
    this.paths = paths;
    this.flow.setPaths(paths);
    // aim the camera at the parts, not the middle of the board
    const box = new THREE.Box3();
    for (const spec of layout.parts) for (const k in spec.pins) box.expandByPoint(H(spec.pins[k]));
    const c = box.getCenter(V3(0, 0, 0)), size = box.getSize(V3(0, 0, 0)).length();
    const r = Math.max(7.5, Math.min(11, 5.5 + size * 0.9));
    this.views.Angled = { az: 0.42, el: 0.82, r, target: V3(c.x - 0.3, 0.15, c.z + 0.25) };
    this.views.Top = { az: 0, el: 1.53, r: r * 0.95, target: V3(c.x, 0, c.z) };
    this.views.Front = { az: 0.05, el: 0.3, r: r * 0.8, target: V3(c.x, 0.3, c.z) };
    this.views.Close = { az: 0.6, el: 0.6, r: Math.max(4.2, r * 0.5), target: V3(c.x, 0.25, c.z) };
  }

  /* ---------- per frame ---------- */
  update(rt, dt, opts) {
    const s = rt.solver, vmax = Math.max(0.5, opts.vmax);
    const pinV = new Map(), pinC = new Map();
    for (const [id, Pt] of rt.parts) {
      const pv = {}; for (const k in Pt.pinNode) pv[k] = s.v[Pt.pinNode[k]];
      pinV.set(id, pv); pinC.set(id, Pt.pinCurrents(s));
    }
    for (const p of this.paths) {
      if (p.strip) continue;
      const Pt = rt.parts.get(p.id); if (!Pt) { p.I = 0; continue; }
      const pv = pinV.get(p.id);
      p.I = p.cur(Pt, s, pinC.get(p.id));
      for (let i = 0; i < p.pins.length; i++) p.v[i] = pv[p.pins[i]];
    }
    for (const [sid, st] of this.strips) {
      const V = rt.v(sid); viridis(0.08 + 0.92 * V / vmax, st.mat.color);
      st.band.visible = opts.strips;
      let acc = 0;
      for (let k = 0; k < st.list.length; k++) {
        const a = st.list[k], pc = pinC.get(a.id);
        acc += pc ? -(pc[a.pin] || 0) : 0;
        if (k < st.segs.length) { st.segs[k].I = acc; st.segs[k].v[0] = st.segs[k].v[1] = V; }
      }
    }
    this.flow.update(dt, { dir: opts.electrons ? -1 : 1, vmax, speedScale: opts.speedScale ?? 1, show: opts.dots });
    for (const [id, b] of this.parts) { const Pt = rt.parts.get(id); if (Pt && b.update) b.update(Pt, s, { vmax }); }
    for (const l of this.labels) l.visible = opts.labels;
    // smoke from anything over temperature
    this.smokeAcc += dt;
    for (const [id, b] of this.parts) {
      const Pt = rt.parts.get(id);
      if (Pt && Pt.fault === 'smoke' && b.smokeAt && this.smokeAcc > 0.12) this.puff(b.smokeAt(), 1);
    }
    if (this.smokeAcc > 0.12) this.smokeAcc = 0;
    for (const sm of this.smoke) {
      if (!sm.visible) continue;
      const u = sm.userData; u.life += dt;
      if (u.life > u.max) { sm.visible = false; continue; }
      sm.position.y += dt * 0.7; sm.position.x += u.vx * dt; sm.position.z += u.vz * dt;
      const f = u.life / u.max, sc = 0.25 + f * 0.9; sm.scale.set(sc, sc, 1); sm.material.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, f * 1.3));
    }
    // supply display, a few times a second
    this.dispT = (this.dispT || 0) + dt;
    if (this.dispT > 0.15) {
      this.dispT = 0; const ps = rt.read('PS');
      redraw(this.supplyTex, (c) => this.drawSupply(c, this.layout.supply.V, ps ? ps.i : 0));
      this.knob.rotation.z = -this.layout.supply.V / 15 * 4.5;
    }
  }
  // hold-to-press parts (the tactile button) grab the pointer
  pointerDown(ray, hit) {
    const b = hit && this.parts.get(hit.id);
    if (b && b.press) { this.held = hit.id; this.onPress && this.onPress(hit.id, true); return true; }
    return false;
  }
  pointerMove() {}
  pointerUp() { if (this.held) { this.onPress && this.onPress(this.held, false); this.held = null; } }
  burst(id) { const b = this.parts.get(id); if (b && b.smokeAt) this.puff(b.smokeAt(), 14); }
  setHover(id) { for (const [k, b] of this.parts) b.hover = k === id; }
  partAt(obj) { while (obj && !obj.userData.part) obj = obj.parent; return obj ? obj.userData.part : null; }
}

function flatPath(pa, pb) {
  const y = 0.05;
  return fillet([V3(pa.x, -0.1, pa.z), V3(pa.x, y, pa.z), V3(pb.x, y, pb.z), V3(pb.x, -0.1, pb.z)], 0.06, 5);
}
function archPath(pa, pb, h) {
  const m = pa.clone().add(pb).multiplyScalar(0.5);
  const c = new THREE.CatmullRomCurve3([V3(pa.x, -0.1, pa.z), V3(pa.x, 0.1, pa.z), V3(pa.x, h * 0.7, pa.z).lerp(V3(m.x, h, m.z), 0.35), V3(m.x, h, m.z), V3(pb.x, h * 0.7, pb.z).lerp(V3(m.x, h, m.z), 0.35), V3(pb.x, 0.1, pb.z), V3(pb.x, -0.1, pb.z)], false, 'centripetal');
  return c.getPoints(40);
}

export function partValue(spec) {
  switch (spec.kind) {
    case 'resistor': return fmtR(spec.value);
    case 'cap': return fmtC(spec.value);
    case 'led': return (LEDS[spec.color] || LEDS.red).name.toLowerCase();
    case 'npn': return '2N3904';
    case 'ic555': return 'NE555';
    case 'button': return 'button';
    case 'slide': return 'switch';
    default: return '';
  }
}

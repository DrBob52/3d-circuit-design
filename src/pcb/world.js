import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FP, FAB, padsOf, courtyard, NET_HUE } from './footprints.js';
import { trackFlow, inShape, islandKey, bbox } from './geom.js';
import { Flow } from '../bench/flow.js';
import { canvasTex, FONT, labelSprite, glowTexture, viridis, V3, tubeMesh, fillet } from '../bench/util3d.js';
import { LEDS } from '../sim/parts.js';

/* =====================================================================
   CIRCUIT BOARD WORLD, in millimetres. A two layer board: FR-4 core,
   copper top and bottom, solder mask, silkscreen, parts on top.
   The layers can be pulled apart. In the layout station it is also an
   editor: drag parts, draw tracks on either layer, drop vias.
   ===================================================================== */
const CORE = 1.5, CU = 0.035, MASK = 0.022;
const TOPY = CORE / 2;
const LAYERS = ['silkB', 'maskB', 'cuB', 'core', 'cuF', 'maskF', 'silkF', 'parts'];
const OFFSET = { silkB: -3, maskB: -2, cuB: -1, core: 0, cuF: 1, maskF: 2, silkF: 3, parts: 3.8 };
const LAYER_NAMES = { silkF: 'Silkscreen, ink', maskF: 'Solder mask, about 20 µm', cuF: 'Top copper, 35 µm', core: 'FR-4 core, 1.5 mm', cuB: 'Bottom copper, 35 µm', maskB: 'Bottom solder mask', silkB: 'Bottom silkscreen' };
const P2 = (x, y) => new THREE.Vector2(x, -y);          // board (x, y down) into shape space
const flat = (g) => g.rotateX(-Math.PI / 2);             // shape space into the board plane, facing up

function capsuleShape(ax, ay, bx, by, r, seg = 10) {
  const s = new THREE.Shape(), a = Math.atan2(by - ay, bx - ax), L = Math.hypot(bx - ax, by - ay);
  const nx = -Math.sin(a), ny = Math.cos(a);
  if (L < 1e-6) { s.absarc(ax, -ay, r, 0, Math.PI * 2, false); return s; }
  const pts = [];
  for (let k = 0; k <= seg; k++) { const t = a + Math.PI / 2 + Math.PI * k / seg; pts.push(P2(ax + r * Math.cos(t), ay + r * Math.sin(t))); }
  for (let k = 0; k <= seg; k++) { const t = a - Math.PI / 2 + Math.PI * k / seg; pts.push(P2(bx + r * Math.cos(t), by + r * Math.sin(t))); }
  s.setFromPoints(pts); void nx; void ny; return s;
}
function rectShape(x, y, w, h) { const s = new THREE.Shape(); s.moveTo(x - w / 2, -(y - h / 2)); s.lineTo(x + w / 2, -(y - h / 2)); s.lineTo(x + w / 2, -(y + h / 2)); s.lineTo(x - w / 2, -(y + h / 2)); s.closePath(); return s; }
function roundRect(w, h, r) {
  const s = new THREE.Shape(), x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0 + r, y0); s.lineTo(x1 - r, y0); s.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false); s.lineTo(x1, y1 - r); s.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  s.lineTo(x0 + r, y1); s.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false); s.lineTo(x0, y0 + r); s.absarc(x0 + r, y0 + r, r, Math.PI, 1.5 * Math.PI, false);
  return s;
}
const circPath = (x, y, r) => { const p = new THREE.Path(); p.absarc(x, -y, r, 0, Math.PI * 2, true); return p; };
const smdCode = (R) => { const e = Math.floor(Math.log10(R)) - 1; return e >= 0 ? `${Math.round(R / 10 ** e)}${e}` : `${R}`.replace('.', 'R'); };

const MAT = {
  core: () => new THREE.MeshStandardMaterial({ color: 0xbdb07c, roughness: 0.78, transparent: true, opacity: 1 }),
  copper: () => new THREE.MeshStandardMaterial({ color: 0xc98552, metalness: 0.85, roughness: 0.32 }),
  copperB: () => new THREE.MeshStandardMaterial({ color: 0x9fb4d8, metalness: 0.7, roughness: 0.35 }),
  gold: () => new THREE.MeshStandardMaterial({ color: 0xd8b04c, metalness: 1, roughness: 0.22 }),
  mask: () => new THREE.MeshPhysicalMaterial({ color: 0x17693a, roughness: 0.35, clearcoat: 0.6, transparent: true, opacity: 0.84, depthWrite: false, side: THREE.DoubleSide }),
  barrel: () => new THREE.MeshStandardMaterial({ color: 0xc98552, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide })
};

export class PcbWorld {
  constructor() {
    this.group = new THREE.Group();
    this.G = {}; for (const k of LAYERS) { this.G[k] = new THREE.Group(); this.group.add(this.G[k]); }
    this.over = new THREE.Group(); this.group.add(this.over);        // ratsnest, markers, route preview
    this.labelsG = new THREE.Group(); this.group.add(this.labelsG);
    this.extra = new THREE.Group(); this.group.add(this.extra);       // battery and leads
    this.flow = new Flow(4000, 0.075); this.group.add(this.flow.mesh);
    this.buildMat();
    this.explode = 0; this.show = { silk: true, mask: true, copper: true, core: true };
    this.tool = 'move'; this.layer = 'F'; this.width = 0.25; this.editable = false;
    this.sel = null; this.route = null; this.cursorPt = null;
    this.parts = new Map(); this.pickables = []; this.defaultView = 'Angled';
    this.zoom = [4, 160]; this.views = {};
  }
  buildMat() {
    const tex = canvasTex(512, 512, (g, W) => {
      g.fillStyle = '#1d2329'; g.fillRect(0, 0, W, W);
      g.strokeStyle = 'rgba(160,190,210,0.09)'; g.lineWidth = 2;
      for (let k = 0; k <= 10; k++) { const x = k * W / 10; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, W); g.moveTo(0, x); g.lineTo(W, x); g.stroke(); }
      g.strokeStyle = 'rgba(160,190,210,0.2)'; g.lineWidth = 3; g.strokeRect(0, 0, W, W);
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(30, 30);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    m.position.y = -14; this.group.add(m);
  }

  /* ---------- build everything from the design ---------- */
  setDesign(project, board, A, opts = {}) {
    this.project = project; this.board = board; this.A = A;
    this.editable = !!opts.editable;
    for (const k of LAYERS) this.clear(this.G[k]);
    this.clear(this.over); this.clear(this.labelsG);
    this.parts.clear(); this.pickables = [];
    this.buildCore(); this.buildCopper(); this.buildMask(); this.buildSilk(); this.buildParts(); this.buildOverlay(); this.buildLabels();
    if (opts.battery !== false && this.batteryFor !== project.supply.kind + board.w + ',' + board.h + JSON.stringify(board.place.J1)) this.buildBattery();
    this.applyExplode(); this.applyShow();
    let x0 = -board.w / 2, x1 = board.w / 2, y0 = -board.h / 2, y1 = board.h / 2;
    for (const part of project.parts) { const pl = board.place[part.id]; if (!pl) continue; const c = courtyard(part, pl); x0 = Math.min(x0, c.x0); x1 = Math.max(x1, c.x1); y0 = Math.min(y0, c.y0); y1 = Math.max(y1, c.y1); }
    const cx = (x0 + x1) / 2, cz = (y0 + y1) / 2, ext = Math.max(x1 - x0, (y1 - y0) * 1.45, 8);
    this.views = {
      Angled: { az: 0.45, el: 0.85, r: 1.55 * ext + 14, target: V3(cx - 3, 0, cz) },
      Top: { az: 0, el: 1.56, r: 1.45 * ext + 4, target: V3(cx, 0, cz) },
      Side: { az: 0.02, el: 0.1, r: 1.3 * ext + 6, target: V3(cx, 1, cz) },
      Bottom: { az: 0, el: -1.5, r: 1.45 * ext + 4, target: V3(cx, 0, cz) }
    };
    this.defaultView = opts.view || this.defaultView;
    this.paths = null;
  }
  clear(g) { for (const o of [...g.children]) { g.remove(o); o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material && c.material.map && c.userData.own) c.material.map.dispose(); }); } }

  holes() {
    const out = [], W = this.board.w / 2, H = this.board.h / 2;
    for (const o of this.A.objs) {
      if (o.type === 'pad' && o.pad.tht && Math.abs(o.shape.x) < W - 0.6 && Math.abs(o.shape.y) < H - 0.6) out.push([o.shape.x, o.shape.y, o.pad.drill / 2]);
      if (o.type === 'via' && Math.abs(o.shape.x) < W - 0.3 && Math.abs(o.shape.y) < H - 0.3) out.push([o.shape.x, o.shape.y, FAB.via.drill / 2]);
    }
    return out;
  }
  buildCore() {
    const { w, h } = this.board, sh = roundRect(w, h, Math.min(0.8, w / 6, h / 6));
    const hs = this.holes();
    for (const [x, y, r] of hs) sh.holes.push(circPath(x, y, r));
    const geo = flat(new THREE.ExtrudeGeometry(sh, { depth: CORE, bevelEnabled: false, curveSegments: 24 })).translate(0, -CORE / 2, 0);
    this.coreMat = MAT.core();
    const m = new THREE.Mesh(geo, this.coreMat); m.renderOrder = 1; this.G.core.add(m);
    // plated barrels through each hole
    const bm = MAT.barrel();
    for (const [x, y, r] of hs) { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, CORE + 2 * CU, 20, 1, true), bm); c.position.set(x, 0, y); this.G.core.add(c); }
  }
  buildCopper() {
    const A = this.A; this.islandMats = new Map();
    const matsFor = (k, layer) => {
      const key = k + layer;
      if (!this.islandMats.has(key)) this.islandMats.set(key, { tr: layer === 'B' && this.editable ? MAT.copperB() : MAT.copper(), pad: MAT.gold(), island: k });
      return this.islandMats.get(key);
    };
    const geos = new Map();
    const add = (layer, k, kind, g) => { const key = layer + '|' + k + '|' + kind; if (!geos.has(key)) geos.set(key, []); geos.get(key).push(g); };
    A.objs.forEach((o, i) => {
      const k = A.isl[i];
      for (const layer of o.layers) {
        let sh;
        if (o.shape.kind === 'seg') sh = capsuleShape(o.shape.ax, o.shape.ay, o.shape.bx, o.shape.by, o.shape.r);
        else if (o.shape.kind === 'rect') sh = rectShape(o.shape.x, o.shape.y, o.shape.w, o.shape.h);
        else { sh = new THREE.Shape(); sh.absarc(o.shape.x, -o.shape.y, o.shape.r, 0, Math.PI * 2, false); }
        const drill = o.type === 'via' ? FAB.via.drill / 2 : o.pad && o.pad.tht ? o.pad.drill / 2 : 0;
        if (drill) sh.holes.push(circPath(o.shape.x, o.shape.y, drill));
        const g = flat(new THREE.ExtrudeGeometry(sh, { depth: CU, bevelEnabled: false, curveSegments: 16 }));
        g.translate(0, layer === 'F' ? 0 : -CU, 0);
        add(layer, k, o.type === 'seg' ? 'tr' : 'pad', g);
      }
    });
    if (this.editable) {   // layout view: tracks drawn bright on top of the mask, bottom ones in blue
      for (const [L, color, op, dy] of [['B', 0x7fa6ff, 0.6, 0.006], ['F', 0xe39a62, 0.92, 0.009]]) {
        const xr = [];
        A.objs.forEach((o) => { if (o.type === 'seg' && o.layers[0] === L) xr.push(flat(new THREE.ShapeGeometry(capsuleShape(o.shape.ax, o.shape.ay, o.shape.bx, o.shape.by, o.shape.r)))); });
        if (!xr.length) continue;
        const m = new THREE.Mesh(mergeGeometries(xr), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }));
        m.position.y = TOPY + CU + MASK + dy; m.renderOrder = 6; this.G.maskF.add(m); xr.forEach(g => g.dispose());
      }
    }
    for (const [key, list] of geos) {
      const [layer, k, kind] = key.split('|'), mats = matsFor(+k, layer);
      const m = new THREE.Mesh(mergeGeometries(list), kind === 'tr' ? mats.tr : mats.pad);
      m.position.y = layer === 'F' ? TOPY : -TOPY;
      this.G[layer === 'F' ? 'cuF' : 'cuB'].add(m);
      list.forEach(g => g.dispose());
    }
  }
  buildMask() {
    const { w, h } = this.board, W = w / 2, H = h / 2;
    for (const layer of ['F', 'B']) {
      const sh = roundRect(w, h, Math.min(0.8, w / 6, h / 6)), opens = [];
      for (const o of this.A.objs) {
        if (o.type !== 'pad' || !o.layers.includes(layer)) continue;
        const b = bbox(o.shape), ex = 0.05;
        if (b[0] - ex < -W + 0.05 || b[2] + ex > W - 0.05 || b[1] - ex < -H + 0.05 || b[3] + ex > H - 0.05) continue;
        if (opens.some(q => !(b[0] - ex > q[2] || q[0] > b[2] + ex || b[1] - ex > q[3] || q[1] > b[3] + ex))) continue;
        opens.push([b[0] - ex, b[1] - ex, b[2] + ex, b[3] + ex]);
        if (o.shape.kind === 'circle') sh.holes.push(circPath(o.shape.x, o.shape.y, o.shape.r + ex));
        else { const p = new THREE.Path(); const [x0, y0, x1, y1] = [b[0] - ex, b[1] - ex, b[2] + ex, b[3] + ex]; p.moveTo(x0, -y0); p.lineTo(x0, -y1); p.lineTo(x1, -y1); p.lineTo(x1, -y0); p.closePath(); sh.holes.push(p); }
      }
      for (const o of this.A.objs) if (o.type === 'via') sh.holes.push(circPath(o.shape.x, o.shape.y, FAB.via.drill / 2));
      const g = flat(new THREE.ShapeGeometry(sh, 16));
      const mat = MAT.mask(); mat.opacity = this.editable ? 0.72 : 0.84;
      const m = new THREE.Mesh(g, mat); m.position.y = layer === 'F' ? TOPY + CU + MASK : -TOPY - CU - MASK; m.renderOrder = 4;
      this.G[layer === 'F' ? 'maskF' : 'maskB'].add(m);
    }
  }
  buildSilk() {
    const { w, h } = this.board, s = Math.min(64, 2048 / Math.max(w, h)), W = Math.round(w * s), H = Math.round(h * s);
    const X = (x) => (x + w / 2) * s, Y = (y) => (y + h / 2) * s;
    const tex = canvasTex(W, H, (g) => {
      g.clearRect(0, 0, W, H); g.strokeStyle = g.fillStyle = '#f4f2ea'; g.lineWidth = 0.15 * s; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const part of this.project.parts) {
        const pl = this.board.place[part.id]; if (!pl || !this.A.onBoard[part.id]) continue;
        const c = courtyard(part, pl), fp = FP[part.fp];
        g.font = `600 ${0.9 * s}px ${FONT}`;
        const above = c.y0 - 0.55 > -h / 2 + 0.4;
        g.fillText(part.id, X(pl.x), Y(above ? c.y0 - 0.1 - 0.45 : c.y1 + 0.55));
        if (part.fp === 'SOIC8') { const b = { w: (pl.rot || 0) % 180 ? 4.9 : 3.9, h: (pl.rot || 0) % 180 ? 3.9 : 4.9 }; g.strokeRect(X(pl.x - b.w / 2 + 0.1), Y(pl.y - b.h / 2), (b.w - 0.2) * s, b.h * s); const p1 = padsOf(part, pl)[0]; g.beginPath(); g.arc(X(p1.x + (p1.x < pl.x ? -1.25 : 1.25) * ((pl.rot || 0) % 180 ? 0 : 1)), Y(p1.y + (p1.y < pl.y ? -0.7 : 0.7) * ((pl.rot || 0) % 180 ? 1 : 0)), 0.22 * s, 0, 7); g.fill(); }
        if (part.fp === 'HDR2') { g.strokeRect(X(c.x0 + 0.25), Y(c.y0 + 0.25), (c.x1 - c.x0 - 0.5) * s, (c.y1 - c.y0 - 0.5) * s); for (const pd of padsOf(part, pl)) { g.font = `700 ${1.0 * s}px ${FONT}`; const side = (c.x0 - 0.8 > -w / 2) ? -1 : 1; g.fillText(pd.pin === '1' ? '+' : '−', X(side < 0 ? c.x0 - 0.45 : c.x1 + 0.45), Y(pd.y)); } }
        if (part.fp === 'LED0603') { const k = padsOf(part, pl).find(p => p.pin === 'k'), a = padsOf(part, pl).find(p => p.pin === 'a'); const dx = k.x - a.x, dy = k.y - a.y, L = Math.hypot(dx, dy); const bx = k.x + dx / L * 0.75, by = k.y + dy / L * 0.75; g.lineWidth = 0.2 * s; g.beginPath(); g.moveTo(X(bx - dy / L * 0.5), Y(by + dx / L * 0.5)); g.lineTo(X(bx + dy / L * 0.5), Y(by - dx / L * 0.5)); g.stroke(); g.lineWidth = 0.15 * s; }
        if (fp.pads.length === 2 && !fp.pads[0].tht) { const sw = (pl.rot || 0) % 180 !== 0; g.beginPath(); if (sw) { g.moveTo(X(c.x0 + 0.25), Y(pl.y - 0.1)); g.lineTo(X(c.x0 + 0.25), Y(pl.y + 0.1)); g.moveTo(X(c.x1 - 0.25), Y(pl.y - 0.1)); g.lineTo(X(c.x1 - 0.25), Y(pl.y + 0.1)); } else { g.moveTo(X(pl.x - 0.1), Y(c.y0 + 0.25)); g.lineTo(X(pl.x + 0.1), Y(c.y0 + 0.25)); g.moveTo(X(pl.x - 0.1), Y(c.y1 - 0.25)); g.lineTo(X(pl.x + 0.1), Y(c.y1 - 0.25)); } g.stroke(); }
      }
    });
    tex.userData.own = true;
    const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(w, h)), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.y = TOPY + CU + MASK + 0.012; m.renderOrder = 5; this.G.silkF.add(m);
    // a small maker's mark on the back
    const back = canvasTex(512, 128, (g) => { g.fillStyle = '#f4f2ea'; g.font = `700 64px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(this.project.name.toUpperCase(), 256, 64); });
    const bw = Math.min(w * 0.7, 12), bm = new THREE.Mesh(new THREE.PlaneGeometry(bw, bw / 4).rotateX(Math.PI / 2).rotateY(Math.PI), new THREE.MeshStandardMaterial({ map: back, transparent: true, depthWrite: false }));
    bm.position.y = -TOPY - CU - MASK - 0.012; this.G.silkB.add(bm);
  }

  /* ---------- parts ---------- */
  buildParts() {
    const tin = new THREE.MeshStandardMaterial({ color: 0xd9dcdf, metalness: 0.9, roughness: 0.3 });
    for (const part of this.project.parts) {
      const pl = this.board.place[part.id]; if (!pl) continue;
      const g = new THREE.Group(), fp = FP[part.fp], b = fp.body;
      const body = [];
      const box = (w, t, h, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, h), mat); m.position.set(x, y + t / 2, z); g.add(m); return m; };
      let glow = null, lens = null, die = null;
      if (part.fp === 'R0603') {
        const bm = new THREE.MeshStandardMaterial({ color: 0x1b1b1c, roughness: 0.55 });
        body.push(box(1.0, 0.45, 0.8, bm), box(0.3, 0.46, 0.81, tin, -0.65), box(0.3, 0.46, 0.81, tin, 0.65));
        const t = textDecal(smdCode(part.value), 0.9, 0.5); t.position.y = 0.455; g.add(t);
      } else if (part.fp === 'C0603' || part.fp === 'C0805') {
        const bm = new THREE.MeshStandardMaterial({ color: 0xb58b5c, roughness: 0.6 }), L = b.w, e = part.fp === 'C0805' ? 0.45 : 0.3;
        body.push(box(L - 2 * e, b.t, b.h, bm), box(e, b.t + 0.01, b.h + 0.01, tin, -(L - e) / 2), box(e, b.t + 0.01, b.h + 0.01, tin, (L - e) / 2));
      } else if (part.fp === 'LED0603') {
        const L = LEDS[part.color] || LEDS.red;
        body.push(box(1.6, 0.18, 0.8, new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.5 })));
        box(0.28, 0.2, 0.81, tin, -0.66); box(0.28, 0.2, 0.81, tin, 0.66);
        const lm = new THREE.MeshPhysicalMaterial({ color: 0xfff6d8, transparent: true, opacity: 0.55, roughness: 0.1, clearcoat: 1, emissive: L.hex, emissiveIntensity: 0, depthWrite: false });
        lens = box(1.1, 0.42, 0.72, lm, 0, 0.18); body.push(lens);
        die = box(0.28, 0.08, 0.28, new THREE.MeshBasicMaterial({ color: 0x333333 }), 0.1, 0.19);
        box(0.12, 0.012, 0.6, new THREE.MeshBasicMaterial({ color: 0x2f9a3a }), -0.55, 0.6);
        glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: L.hex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.position.set(0.1, 0.4, 0); glow.renderOrder = 7; g.add(glow);
        const light = new THREE.PointLight(L.hex, 0, 20, 2); light.position.set(0, 1.5, 0); g.add(light); glow.userData.light = light;
      } else if (part.fp === 'SOIC8') {
        const bm = new THREE.MeshStandardMaterial({ color: 0x1a1a1b, roughness: 0.6 });
        body.push(box(3.9, 1.45, 4.9, bm, 0, 0.1));
        const dot = new THREE.Mesh(new THREE.CircleGeometry(0.28, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0b0b0b })); dot.position.set(-1.3, 1.556, -1.8); g.add(dot);
        const t = textDecal('NE555', 3.2, 1.0); t.position.set(0.2, 1.556, 0.3); t.rotation.z = 0; g.add(t);
        for (const pd of fp.pads) {
          const s = Math.sign(pd.x);
          g.add(tubeMesh(fillet([V3(s * 1.9, 0.75, pd.y), V3(s * 2.25, 0.75, pd.y), V3(s * 2.45, 0.08, pd.y), V3(pd.x + s * 0.5, 0.08, pd.y)], 0.15), 0.1, tin, 6));
        }
      } else if (part.fp === 'HDR2') {
        // battery wires soldered straight into the two holes
        const solder = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 0.95, roughness: 0.25 });
        for (const pd of fp.pads) {
          const blob = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), solder); blob.scale.set(1, 0.55, 1); blob.position.set(pd.x, 0.02, pd.y); g.add(blob); body.push(blob);
        }
      }
      g.position.set(pl.x, TOPY + CU, pl.y); g.rotation.y = -(pl.rot || 0) * Math.PI / 180;
      g.traverse(o => { o.userData.part = part.id; });
      this.G.parts.add(g);
      const rec = { group: g, body, glow, lens, die, part };
      this.parts.set(part.id, rec);
      for (const m of body) this.pickables.push(m);
      if (this.editable && this.sel === part.id) {
        const c = courtyard(part, pl), pts = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]].map(([x, y]) => V3(x, TOPY + 0.1, y));
        const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x35b779, depthTest: false }));
        loop.renderOrder = 9; this.over.add(loop);
      }
    }
  }
  buildOverlay() {
    const A = this.A, y = TOPY + 3.2;
    if (A.rats.length) {
      const pos = [], col = [], c = new THREE.Color();
      for (const [x1, y1, x2, y2, net] of A.rats) { c.set(NET_HUE[net] || '#ffffff'); pos.push(x1, y, y1, x2, y, y2); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.95 })); l.renderOrder = 10; this.over.add(l);
      // dots on the pads the ratsnest joins
      for (const [x1, y1, x2, y2, net] of A.rats) for (const [x, z] of [[x1, y1], [x2, y2]]) {
        const d = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: NET_HUE[net] || '#fff', depthTest: false })); d.position.set(x, y, z); d.renderOrder = 10; this.over.add(d);
      }
    }
    if (this.editable) {
      const mk = (e, color) => {
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.62, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
        ring.position.set(e.x, TOPY + 0.4, e.y); ring.renderOrder = 11; this.over.add(ring);
      };
      for (const e of A.errors) if (e.kind !== 'place') mk(e, 0xef5b4c);
      for (const e of A.warnings) mk(e, 0xfdb42f);
    }
    // board outline for the editor
    if (this.editable) {
      const { w, h } = this.board, pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, z]) => V3(x, TOPY + 0.06, z));
      const loop = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xfde725, transparent: true, opacity: 0.55 }));
      this.over.add(loop);
    }
    this.preview = new THREE.Group(); this.over.add(this.preview);
  }
  buildLabels() {
    const names = ['silkF', 'maskF', 'cuF', 'core', 'cuB', 'maskB'];
    this.layerLabels = names.map(k => { const s = labelSprite(LAYER_NAMES[k], 0.5); s.center.set(0, 0.5); s.userData.layer = k; this.labelsG.add(s); return s; });
  }
  buildBattery() {
    this.clear(this.extra);
    const kind = this.project.supply.kind, J = this.board.place.J1; if (!J) return;
    const pads = padsOf(this.project.parts.find(p => p.id === 'J1'), J);
    const g = new THREE.Group(), steel = new THREE.MeshStandardMaterial({ color: 0xc5c9ce, metalness: 1, roughness: 0.28 });
    let plus, minus, at;
    if (kind === 'coin') {
      at = V3(-this.board.w / 2 - 15, -TOPY - 1.6, 0);
      const cell = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 3.2, 64), steel); cell.position.copy(at); g.add(cell);
      const top = new THREE.Mesh(new THREE.CircleGeometry(9.2, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (c) => {
        const gr = c.createRadialGradient(256, 256, 20, 256, 256, 256); gr.addColorStop(0, '#e2e5e8'); gr.addColorStop(1, '#9ea4aa'); c.fillStyle = gr; c.fillRect(0, 0, 512, 512);
        c.fillStyle = '#4a4f55'; c.font = `700 70px ${FONT}`; c.textAlign = 'center'; c.fillText('CR2032', 256, 230); c.font = `600 56px ${FONT}`; c.fillText('3V  +', 256, 320);
      }), metalness: 0.7, roughness: 0.35 }));
      top.position.set(at.x, at.y + 1.61, at.z); g.add(top);
      plus = V3(at.x + 2, at.y + 1.7, at.z); minus = V3(at.x + 9.6, at.y - 1.2, at.z + 3);
    } else {
      at = V3(-this.board.w / 2 - 32, -TOPY + 1, 0);
      const body = new THREE.Mesh(new THREE.BoxGeometry(26.5, 17.5, 48.5), new THREE.MeshStandardMaterial({ map: canvasTex(512, 512, (c) => { c.fillStyle = '#23262b'; c.fillRect(0, 0, 512, 512); c.fillStyle = '#e0b43a'; c.fillRect(0, 300, 512, 90); c.fillStyle = '#e9e6df'; c.font = `700 90px ${FONT}`; c.textAlign = 'center'; c.fillText('9 V', 256, 220); }), roughness: 0.5 }));
      body.position.copy(at); g.add(body);
      for (const dx of [-6.3, 6.3]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(dx < 0 ? 3 : 4, dx < 0 ? 3 : 4, 3, dx < 0 ? 24 : 6), steel); t.position.set(at.x + dx * 0.5, at.y + 8.75 + 1.5, at.z + 20); g.add(t); }
      plus = V3(at.x - 3.2, at.y + 11, at.z + 20); minus = V3(at.x + 3.2, at.y + 11, at.z + 20);
    }
    const lead = (from, to, color) => {
      const c = new THREE.CatmullRomCurve3([from, from.clone().add(V3(0, 4, 0)), from.clone().lerp(to, 0.5).add(V3(0, 7, 0)), to.clone().add(V3(0, 3.5, 0)), to.clone().add(V3(0, 1.2, 0)), to], false, 'centripetal');
      const pts = c.getPoints(60); g.add(tubeMesh(pts, 0.35, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }), 10)); return pts;
    };
    const top1 = V3(pads[0].x, TOPY + 0.35, pads[0].y), top2 = V3(pads[1].x, TOPY + 0.35, pads[1].y);
    this.leadP = lead(plus, top1, 0xc9302c); this.leadN = lead(top2, minus, 0x1f1f21);
    this.extra.add(g); this.batteryFor = kind + this.board.w + ',' + this.board.h + JSON.stringify(J);
  }

  /* ---------- layers ---------- */
  setExplode(e) { this.explode = e; this.applyExplode(); }
  applyExplode() {
    const gapmm = 2.4 * this.explode;
    for (const k of LAYERS) this.G[k].position.y = OFFSET[k] * gapmm;
    this.over.position.y = OFFSET.cuF * gapmm;
    const vis = this.explode > 0.12, W = this.board ? this.board.w / 2 : 5;
    for (const s of this.layerLabels || []) {
      s.visible = vis && this.G[s.userData.layer].visible;
      s.position.set(W + 1.2, OFFSET[s.userData.layer] * gapmm + (s.userData.layer === 'core' ? 0 : s.userData.layer.endsWith('F') ? TOPY : -TOPY), 0);
      s.material.opacity = Math.min(1, (this.explode - 0.12) * 4);
    }
    this.extra.visible = this.explode < 0.05;
  }
  setShow(show) { Object.assign(this.show, show); this.applyShow(); }
  applyShow() {
    const s = this.show;
    this.G.silkF.visible = this.G.silkB.visible = s.silk;
    this.G.maskF.visible = this.G.maskB.visible = s.mask;
    this.G.cuF.visible = this.G.cuB.visible = s.copper;
    this.G.core.visible = s.core;
    this.applyExplode();
  }

  /* ---------- per frame ---------- */
  update(rt, dt, opts) {
    if (!this.A) return;
    const s = rt.solver, A = this.A, vmax = Math.max(0.5, opts.vmax);
    const nodeV = (i) => rt.v(islandKey(A, i));
    const pinCur = new Map(); for (const [id, P] of rt.parts) pinCur.set(id, P.pinCurrents(s));
    const J = this.project.parts.find(p => p.kind === 'header');
    const inj = (i) => {
      const o = A.objs[i]; if (o.type !== 'pad') return 0;
      if (o.part === J.id) { const pc = pinCur.get('PS'); return pc ? -(o.pin === '1' ? pc.p : pc.n) : 0; }
      const P = rt.parts.get(o.part); if (!P) return 0;
      const map = P.kind === 'cap' ? { a: 'p', b: 'n' } : {};
      return -((pinCur.get(o.part) || {})[map[o.pin] || o.pin] || 0);
    };
    if (!this.paths || this.pathsFor !== A) this.buildPaths(inj);
    else if ((this.flowT = (this.flowT || 0) + dt) > 0.05) { this.flowT = 0; this.refreshTrackCurrents(inj); }
    for (const p of this.paths) {
      if (p.island != null) { const v = rt.v('I' + p.island); p.v[0] = p.v[1] = v; continue; }
      const P = p.part === 'PS' ? rt.parts.get('PS') : rt.parts.get(p.part); if (!P) { p.I = 0; continue; }
      p.I = p.cur(P, s, pinCur.get(p.part));
      for (let k = 0; k < p.pads.length; k++) p.v[k] = p.pads[k] == null ? 0 : nodeV(p.pads[k]);
    }
    this.flow.update(dt, { dir: opts.electrons ? -1 : 1, vmax, speedScale: 3.2, show: opts.dots && this.explode < 0.05 });
    // copper tinted by voltage, if asked
    for (const m of this.islandMats.values()) {
      const v = rt.v('I' + m.island);
      if (opts.strips && isFinite(v)) { viridis(0.08 + 0.92 * v / vmax, m.tr.emissive).multiplyScalar(0.55); m.pad.emissive.copy(m.tr.emissive).multiplyScalar(0.5); }
      else { m.tr.emissive.setRGB(0, 0, 0); m.pad.emissive.setRGB(0, 0, 0); }
    }
    // LEDs
    for (const [id, rec] of this.parts) {
      if (!rec.glow) continue;
      const P = rt.parts.get(id); const b = P ? Math.min(3, P.read(s).glow || 0) : 0;
      rec.glow.material.opacity = Math.min(1, 0.95 * Math.pow(b, 0.55)); const sc = 2 + 5 * Math.sqrt(Math.min(b, 2.5)); rec.glow.scale.set(sc, sc, 1);
      rec.glow.userData.light.intensity = 40 * b;
      rec.lens.material.emissiveIntensity = Math.min(1.4, 0.9 * Math.sqrt(b));
      rec.die.material.color.set(b > 0.002 ? LEDS[rec.part.color].hex : 0x333333);
    }
    for (const [id, rec] of this.parts) for (const m of rec.body) if (m.material.emissive && !rec.glow) m.material.emissive.setHex(this.hover === id ? 0x1a2a20 : 0x000000);
    if (this.pending) { this.pending = false; this.onEdit && this.onEdit(true); }
  }
  buildPaths(inj) {
    const A = this.A, paths = [], lift = 0.05;
    this.trackPaths = [];
    for (const f of trackFlow(A, inj)) {
      const y = f.layer === 'F' ? TOPY + CU + lift : -TOPY - CU - lift;
      const p = { pts: [V3(f.ax, y, f.ay), V3(f.bx, y, f.by)], I: f.I, island: f.island, v: [0, 0], key: `${f.ax},${f.ay},${f.bx},${f.by}` };
      paths.push(p); this.trackPaths.push(p);
    }
    const padAt = (id, pin) => A.objs.findIndex(o => o.type === 'pad' && o.part === id && o.pin === String(pin));
    for (const part of this.project.parts) {
      const pl = this.board.place[part.id]; if (!pl) continue;
      const pads = padsOf(part, pl), y0 = TOPY + CU + 0.05, cx = pl.x, cz = pl.y;
      if (part.kind === 'header') {
        for (const pd of pads) {
          const top = V3(pd.x, TOPY + 0.35, pd.y), bot = V3(pd.x, y0, pd.y), i = padAt(part.id, pd.pin);
          const lead = pd.pin === '1' ? this.leadP : this.leadN;
          const pts = pd.pin === '1' ? [...(lead || []), top, bot] : [bot, top, ...(lead || [])];
          paths.push({ part: 'PS', pads: pts.map(() => i), pts, cur: (P, s) => P.el.current(s), v: pts.map(() => 0) });
        }
      } else if (pads.length === 2) {
        const [a, b] = pads, ia = padAt(part.id, a.pin), ib = padAt(part.id, b.pin), h = FP[part.fp].body.t * 0.5 + y0;
        const pinA = part.kind === 'cap' ? 'p' : a.pin;
        paths.push({ part: part.id, pads: [ia, ia, ib, ib], pts: [V3(a.x, y0, a.y), V3(a.x, h, a.y), V3(b.x, h, b.y), V3(b.x, y0, b.y)], cur: (P, s, pc) => pc[pinA], v: [0, 0, 0, 0] });
      } else {
        for (const pd of pads) {
          const i = padAt(part.id, pd.pin);
          paths.push({ part: part.id, pads: [i, i], pts: [V3(pd.x, y0, pd.y), V3(cx + (pd.x - cx) * 0.25, y0 + 0.7, cz + (pd.y - cz) * 0.8)], cur: (P, s, pc) => pc[pd.pin] || 0, v: [0, 0] });
        }
      }
    }
    this.paths = paths; this.pathsFor = A;
    this.flow.setPaths(paths, 0.45);
  }
  refreshTrackCurrents(inj) {
    const map = new Map(this.trackPaths.map(p => [p.key, p]));
    for (const f of trackFlow(this.A, inj)) { const p = map.get(`${f.ax},${f.ay},${f.bx},${f.by}`); if (p) p.I = f.I; }
  }

  /* ---------- editing ---------- */
  boardPoint(rc) {
    const ray = rc.ray || rc, y = TOPY + (this.G.cuF.position.y || 0), t = (y - ray.origin.y) / ray.direction.y;
    if (!(t > 0)) return null;
    return [ray.origin.x + t * ray.direction.x, ray.origin.z + t * ray.direction.z];
  }
  partUnder([x, y]) {
    let best = null, ba = Infinity;
    for (const part of this.project.parts) {
      const pl = this.board.place[part.id]; if (!pl) continue;
      const c = courtyard(part, pl), a = (c.x1 - c.x0) * (c.y1 - c.y0);
      if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1 && a < ba) { best = part.id; ba = a; }
    }
    return best;
  }
  // copper under a point on the current layer: returns where a track should attach
  copperAt([x, y], layer, skipTrace = -1) {
    const A = this.A;
    for (const o of A.objs) if (o.type !== 'seg' && o.layers.includes(layer) && inShape(o.shape, x, y, 0.12)) return { x: o.shape.x, y: o.shape.y, kind: o.type, o };
    for (let ti = 0; ti < this.board.traces.length; ti++) {
      const t = this.board.traces[ti]; if (t.layer !== layer || ti === skipTrace) continue;
      for (const [px, py] of [t.pts[0], t.pts[t.pts.length - 1]]) if (Math.hypot(px - x, py - y) <= t.w / 2 + 0.15) return { x: px, y: py, kind: 'end' };
    }
    for (const o of A.objs) if (o.type === 'seg' && o.layers.includes(layer) && inShape(o.shape, x, y, 0.1)) {
      const s = o.shape, dx = s.bx - s.ax, dy = s.by - s.ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - s.ax) * dx + (y - s.ay) * dy) / L2)) : 0;
      return { x: s.ax + t * dx, y: s.ay + t * dy, kind: 'track' };
    }
    return null;
  }
  snap(v, g = 0.05) { return Math.round(v / g) * g; }
  // the next track corner: straight lines at 0, 45 or 90 degrees
  constrain(last, [x, y]) {
    const dx = x - last[0], dy = y - last[1], ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax > 2 * ay) return [x, last[1]];
    if (ay > 2 * ax) return [last[0], y];
    const d = (ax + ay) / 2; return [last[0] + Math.sign(dx) * d, last[1] + Math.sign(dy) * d];
  }
  // reach a target that is off the grid of angles: a straight run then a 45° run
  reach(last, [x, y]) {
    const dx = x - last[0], dy = y - last[1], ax = Math.abs(dx), ay = Math.abs(dy);
    if (ax < 1e-6 || ay < 1e-6 || Math.abs(ax - ay) < 1e-6) return [[x, y]];
    const c = ax > ay ? [last[0] + Math.sign(dx) * (ax - ay), last[1]] : [last[0], last[1] + Math.sign(dy) * (ay - ax)];
    return [c, [x, y]];
  }
  pointerDown(ray, hit, e) {
    if (!this.editable) return false;
    const p = this.boardPoint(ray); if (!p) return false;
    if (this.tool === 'move') {
      const id = (hit && this.parts.has(hit.id)) ? hit.id : this.partUnder(p);
      if (!id) { if (this.sel) { this.sel = null; this.onEdit && this.onEdit(false, true); } return false; }
      const pl = this.board.place[id]; this.drag = { id, dx: pl.x - p[0], dy: pl.y - p[1], moved: false };
      this.sel = id; this.onSelect && this.onSelect(id); this.onEdit && this.onEdit(false, true);
      return true;
    }
    const W = this.board.w / 2 + 12, H = this.board.h / 2 + 12;
    if (Math.abs(p[0]) > W || Math.abs(p[1]) > H) return false;
    if (this.tool === 'route') { this.routeClick(p, e); return true; }
    if (this.tool === 'erase') { this.eraseAt(p); return true; }
    return false;
  }
  pointerMove(ray) {
    if (!this.drag) return;
    const p = this.boardPoint(ray); if (!p) return;
    const pl = this.board.place[this.drag.id], nx = this.snap(p[0] + this.drag.dx, 0.1), ny = this.snap(p[1] + this.drag.dy, 0.1);
    if (nx !== pl.x || ny !== pl.y) { pl.x = +nx.toFixed(3); pl.y = +ny.toFixed(3); this.drag.moved = true; this.pending = true; }
  }
  pointerUp() { if (this.drag) { const m = this.drag.moved; this.drag = null; if (m) this.onEdit && this.onEdit(false); } }
  pointerHover(ray, hit) {
    this.hover = hit ? hit.id : null;
    if (!this.editable || this.tool !== 'route') { this.clear(this.preview || new THREE.Group()); return; }
    const p = this.boardPoint(ray); if (!p) return;
    this.cursorPt = p; this.drawPreview();
  }
  cursor(hit) { if (!this.editable) return hit ? 'pointer' : 'grab'; return this.tool === 'route' ? 'crosshair' : this.tool === 'erase' ? 'not-allowed' : hit ? 'move' : 'grab'; }
  routeClick(p, e) {
    const L = this.layer;
    if (!this.route) {
      const t = this.copperAt(p, L);
      if (!t) { this.onToast && this.onToast(`Start a track on a pad, a via or a track on the ${L === 'F' ? 'top' : 'bottom'} layer.`); return; }
      this.route = { layer: L, w: this.width, pts: [[t.x, t.y]] }; this.drawPreview(); return;
    }
    const last = this.route.pts[this.route.pts.length - 1], t = this.copperAt(p, L);
    if (t) {
      if (Math.hypot(t.x - last[0], t.y - last[1]) < 1e-6) { this.finishRoute(); return; }
      for (const q of this.reach(last, [t.x, t.y])) this.route.pts.push(q.map(v => +v.toFixed(4)));
      this.finishRoute(); return;
    }
    const q = this.constrain(last, [this.snap(p[0]), this.snap(p[1])]);
    if (Math.hypot(q[0] - last[0], q[1] - last[1]) < 1e-6) { if (e && e.detail >= 2) this.finishRoute(); return; }
    this.route.pts.push(q.map(v => +v.toFixed(4))); this.drawPreview();
  }
  finishRoute() {
    const r = this.route; this.route = null;
    if (r && r.pts.length >= 2) { this.board.traces.push(r); this.onEdit && this.onEdit(false); }
    else this.drawPreview();
  }
  cancelRoute() { this.route = null; this.drawPreview(); }
  undoPoint() { if (!this.route) return false; this.route.pts.pop(); if (!this.route.pts.length) this.route = null; this.drawPreview(); return true; }
  placeVia() {
    if (!this.route) { this.onToast && this.onToast('Start drawing a track first, then press V where the via should go.'); return; }
    const last = this.route.pts[this.route.pts.length - 1];
    this.board.vias.push({ x: last[0], y: last[1] });
    const other = this.route.layer === 'F' ? 'B' : 'F';
    if (this.route.pts.length >= 2) this.board.traces.push(this.route);
    this.layer = other; this.route = { layer: other, w: this.width, pts: [[last[0], last[1]]] };
    this.onLayer && this.onLayer(other); this.onEdit && this.onEdit(false);
  }
  eraseAt(p) {
    for (let vi = 0; vi < this.board.vias.length; vi++) { const v = this.board.vias[vi]; if (Math.hypot(v.x - p[0], v.y - p[1]) <= FAB.via.dia / 2 + 0.1) { this.board.vias.splice(vi, 1); this.onEdit && this.onEdit(false); return; } }
    for (const layer of [this.layer, this.layer === 'F' ? 'B' : 'F']) {
      for (let ti = this.board.traces.length - 1; ti >= 0; ti--) {
        const t = this.board.traces[ti]; if (t.layer !== layer) continue;
        for (let k = 0; k + 1 < t.pts.length; k++) {
          if (inShape({ kind: 'seg', ax: t.pts[k][0], ay: t.pts[k][1], bx: t.pts[k + 1][0], by: t.pts[k + 1][1], r: t.w / 2 }, p[0], p[1], 0.12)) { this.board.traces.splice(ti, 1); this.onEdit && this.onEdit(false); return; }
        }
      }
    }
  }
  drawPreview() {
    if (!this.preview) return;
    this.clear(this.preview);
    if (this.tool !== 'route' || !this.editable) return;
    const L = this.route ? this.route.layer : this.layer, y = L === 'F' ? TOPY + CU + 0.08 : -TOPY - CU - 0.08;
    const col = L === 'F' ? 0xffb070 : 0x8fb3ff;
    const pts = this.route ? this.route.pts.map(p => p.slice()) : [];
    if (this.route && this.cursorPt) {
      const last = pts[pts.length - 1], t = this.copperAt(this.cursorPt, L);
      if (t) for (const q of this.reach(last, [t.x, t.y])) pts.push(q); else pts.push(this.constrain(last, [this.snap(this.cursorPt[0]), this.snap(this.cursorPt[1])]));
    }
    const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthTest: false });
    for (let k = 0; k + 1 < pts.length; k++) {
      const g = flat(new THREE.ShapeGeometry(capsuleShape(pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], (this.route ? this.route.w : this.width) / 2)));
      const m = new THREE.Mesh(g, mat); m.position.y = y; m.renderOrder = 12; this.preview.add(m);
    }
    if (this.cursorPt) {
      const t = this.copperAt(this.cursorPt, L), c = t ? [t.x, t.y] : [this.snap(this.cursorPt[0]), this.snap(this.cursorPt[1])];
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.4, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: t ? 0x35b779 : col, depthTest: false }));
      ring.position.set(c[0], y + 0.02, c[1]); ring.renderOrder = 13; this.preview.add(ring);
    }
  }
  setHover(id) { this.hover = id; }
  partAt(obj) { while (obj && !obj.userData.part) obj = obj.parent; return obj ? obj.userData.part : null; }
  burst() {}
}

function textDecal(text, w, h) {
  const tex = canvasTex(256, Math.round(256 * h / w), (g, W, H) => { g.fillStyle = '#d9d6cf'; g.font = `600 ${H * 0.7}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2); });
  const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(w, h)), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.renderOrder = 3; return m;
}

import * as THREE from 'three';
import { fillet, tubeMesh, V3, canvasTex, FONT, glowTexture, heatColor, viridis } from './util3d.js';
import { bands, LEDS } from '../sim/parts.js';

/* =====================================================================
   PART MODELS, to real size in centimetres: a ¼ W resistor is 6.3 mm
   long, a 5 mm LED is 5 mm across, a DIP-8 is 9.6 × 6.35 mm.
   Each builder returns the group, the meshes you can click, and the
   paths the current dots follow. A path is a list of points, the pin
   whose voltage each point sits at, and a function giving its current.
   ===================================================================== */
export const LEG = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 1, roughness: 0.32 });
const LEG_R = 0.024;

// local frame: x along `dir`, y up, origin at `o`
function frame(o, dir) {
  const x = dir.clone().setY(0).normalize(), y = V3(0, 1, 0), z = new THREE.Vector3().crossVectors(x, y);
  const m = new THREE.Matrix4().makeBasis(x, y, z).setPosition(o);
  return { m, toWorld: (lx, ly, lz) => V3(lx, ly, lz).applyMatrix4(m) };
}
function place(obj, f) { obj.applyMatrix4(f.m); return obj; }
function leg(pts, mat = LEG, r = LEG_R) { return tubeMesh(fillet(pts, 0.06), r, mat, 8); }
const down = (p, y = -0.05) => V3(p.x, y, p.z);

function textPlane(lines, w, h, color = '#d8d6d0', bg = null, weight = 600) {
  const tex = canvasTex(Math.round(256 * w / h), 256, (g, W, H) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, H); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
    const fs = Math.min(H / lines.length * 0.72, W / Math.max(...lines.map(l => l.length)) * 1.5);
    g.font = `${weight} ${fs}px ${FONT}`;
    lines.forEach((l, i) => g.fillText(l, W / 2, H * (i + 0.5) / lines.length));
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
}

/* ---------------- resistor ---------------- */
function resistor(spec, H) {
  const pa = H(spec.pins.a), pb = H(spec.pins.b), dir = pb.clone().sub(pa).normalize();
  const L = 0.63, lift = spec.lift ?? 0.2, mid = pa.clone().add(pb).multiplyScalar(0.5);
  const f = frame(V3(mid.x, lift, mid.z), dir), g = new THREE.Group();
  const prof = [[0, -L / 2], [0.07, -L / 2 + 0.004], [0.108, -L / 2 + 0.025], [0.119, -L / 2 + 0.07], [0.118, -L / 2 + 0.14], [0.103, -L / 2 + 0.19],
    [0.102, 0], [0.103, L / 2 - 0.19], [0.118, L / 2 - 0.14], [0.119, L / 2 - 0.07], [0.108, L / 2 - 0.025], [0.07, L / 2 - 0.004], [0, L / 2]].map(([r, y]) => new THREE.Vector2(r, y));
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xd7c29c, roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 40).rotateZ(-Math.PI / 2), bodyMat);
  g.add(body);
  const bandMats = [];
  const bs = bands(spec.value), pos = [[-L / 2 + 0.085, 0.1205], [-L / 2 + 0.215, 0.1045], [-L / 2 + 0.3, 0.1035], [L / 2 - 0.085, 0.1205]];
  bs.forEach((b, i) => {
    const m = new THREE.MeshStandardMaterial({ color: b[1], roughness: b[0] === 'gold' ? 0.35 : 0.6, metalness: b[0] === 'gold' ? 0.7 : 0 });
    bandMats.push(m);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(pos[i][1], pos[i][1], 0.048, 40, 1, true).rotateZ(-Math.PI / 2), m);
    ring.position.x = pos[i][0]; g.add(ring);
  });
  place(g, f);
  const eA = f.toWorld(-L / 2 + 0.01, 0, 0), eB = f.toWorld(L / 2 - 0.01, 0, 0);
  const legA = [down(pa), V3(pa.x, lift, pa.z), eA], legB = [eB, V3(pb.x, lift, pb.z), down(pb)];
  const root = new THREE.Group(); root.add(g, leg(legA), leg(legB));
  const a = fillet(legA, 0.06), b = fillet(legB, 0.06);
  a[0].y = 0.01; b[b.length - 1].y = 0.01;
  return {
    root, pick: [body], hi: [bodyMat],
    paths: [{ pts: [...a, ...b], pins: [...a.map(() => 'a'), ...b.map(() => 'b')], cur: (P, s, pc) => pc.a }],
    labelAt: f.toWorld(0, 0.2, 0),
    update(P) {
      if (P.burnt) { bodyMat.color.setHex(0x2a1f17); bodyMat.roughness = 0.95; bodyMat.clearcoat = 0; bandMats.forEach(m => m.color.multiplyScalar(0.985)); bodyMat.emissive.setRGB(0, 0, 0); return; }
      bodyMat.color.setHex(0xd7c29c); bodyMat.roughness = 0.55; bodyMat.clearcoat = 0.35;
      heatColor(P.T, bodyMat.emissive); if (this.hover) bodyMat.emissive.add(HOVER);
    },
    smokeAt: () => f.toWorld(0, 0.1, 0)
  };
}
const HOVER = new THREE.Color(0.12, 0.16, 0.13);

/* ---------------- LED ---------------- */
function led(spec, H) {
  const pa = H(spec.pins.a), pk = H(spec.pins.k), L = LEDS[spec.color] || LEDS.red;
  const mid = pa.clone().add(pk).multiplyScalar(0.5), f = frame(V3(mid.x, 0, mid.z), pk.clone().sub(pa)), g = new THREE.Group();
  const yb = 0.32, flat = 0.24;
  const epoxy = new THREE.MeshPhysicalMaterial({ color: L.body, transparent: true, opacity: 0.62, roughness: 0.12, clearcoat: 1, emissive: L.hex, emissiveIntensity: 0, depthWrite: false });
  const th = Math.acos(flat / 0.29), sh = new THREE.Shape();
  sh.absarc(0, 0, 0.29, th, 2 * Math.PI - th, false); sh.closePath();
  const flange = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: false, curveSegments: 40 }).rotateX(-Math.PI / 2), epoxy);
  flange.position.y = yb;
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.46, 40, 1, true), epoxy); cyl.position.y = yb + 0.1 + 0.23;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), epoxy); dome.position.y = yb + 0.56;
  for (const m of [flange, cyl, dome]) m.renderOrder = 3;
  // lead frame inside the epoxy: the cathode post carries the cup with the die
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.35 });
  const postA = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.035), frameMat); postA.position.set(-0.127, yb + 0.18, 0);
  const postK = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.035), frameMat); postK.position.set(0.127, yb + 0.15, 0);
  const cup = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.07, 0.1), frameMat); cup.position.set(0.08, yb + 0.33, 0);
  const dieMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
  const die = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.02, 0.045), dieMat); die.position.set(0.06, yb + 0.375, 0);
  g.add(flange, cyl, dome, postA, postK, cup, die);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: L.hex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.set(0.04, yb + 0.42, 0); glow.renderOrder = 6; g.add(glow);
  const light = new THREE.PointLight(L.hex, 0, 6, 2); light.position.set(0, yb + 0.5, 0); g.add(light);
  place(g, f);
  const wa = f.toWorld(-0.127, 0, 0), wk = f.toWorld(0.127, 0, 0);
  const legA = [down(pa), V3(pa.x, yb * 0.35, pa.z), V3(wa.x, yb * 0.5, wa.z).lerp(f.toWorld(-0.2, yb * 0.5, 0), 1), V3(wa.x, yb * 0.65, wa.z), V3(wa.x, yb + 0.02, wa.z)];
  const legK = [V3(wk.x, yb + 0.02, wk.z), down(pk)];
  const root = new THREE.Group(); root.add(g, leg(legA), leg(legK));
  const c1 = f.toWorld(0.06, yb + 0.37, 0), c2 = f.toWorld(0.062, yb + 0.37, 0);
  const pa0 = V3(pa.x, 0.01, pa.z), pk0 = V3(pk.x, 0.01, pk.z);
  return {
    root, pick: [cyl, dome, flange], hi: [epoxy],
    paths: [{ pts: [pa0, V3(wa.x, yb, wa.z), c1, c2, V3(wk.x, yb, wk.z), pk0], pins: ['a', 'a', 'a', 'k', 'k', 'k'], cur: (P, s, pc) => pc.a }],
    labelAt: f.toWorld(0, yb + 0.9, 0),
    update(P, s) {
      const r = P.read(s), b = Math.min(3, r.glow);
      epoxy.emissiveIntensity = P.burnt ? 0 : Math.min(1.6, 0.05 + 0.9 * Math.sqrt(b)) * (b > 0.002 ? 1 : 0);
      epoxy.opacity = 0.5 + 0.3 * Math.min(1, b);
      glow.material.opacity = P.burnt ? 0 : Math.min(1, 0.95 * Math.pow(b, 0.55));
      const sc = 0.5 + 1.3 * Math.sqrt(Math.min(b, 2.5)); glow.scale.set(sc, sc, 1);
      light.intensity = P.burnt ? 0 : 0.35 * b;
      dieMat.color.set(P.burnt ? 0x111111 : b > 0.002 ? L.hex : 0x333333);
      epoxy.color.setHex(P.burnt ? 0x3a3530 : L.body).multiplyScalar(0.55 + 0.45 * Math.min(1, b * 4));
      if (this.hover) epoxy.emissive.setHex(L.hex).lerp(HOVER, 0.4); else epoxy.emissive.setHex(L.hex);
    },
    smokeAt: () => f.toWorld(0, yb + 0.8, 0)
  };
}

/* ---------------- electrolytic capacitor ---------------- */
function cap(spec, H) {
  const pp = H(spec.pins.p), pn = H(spec.pins.n), lg = Math.log10(spec.value / 1e-6);
  const r = 0.2 + 0.1 * lg, h = 0.5 + 0.33 * lg, yb = 0.08;
  const mid = pp.clone().add(pn).multiplyScalar(0.5), f = frame(V3(mid.x, 0, mid.z), pn.clone().sub(pp)), g = new THREE.Group();
  const label = spec.value >= 1e-6 ? `${+(spec.value * 1e6).toPrecision(3)}µF` : '';
  const sleeve = canvasTex(512, 256, (c, W, Hh) => {
    c.fillStyle = '#1d2d5c'; c.fillRect(0, 0, W, Hh);
    c.fillStyle = '#c9ced6'; c.fillRect(W * 0.15, 0, W * 0.2, Hh);
    c.fillStyle = '#1d2d5c'; c.font = `700 ${Hh * 0.2}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 3; i++) c.fillRect(W * 0.25 - 16, Hh * (0.25 + i * 0.25) - 5, 32, 10);
    c.fillStyle = '#d8dce4'; c.font = `600 ${Hh * 0.17}px ${FONT}`;
    c.save(); c.translate(W * 0.75, Hh / 2); c.rotate(-Math.PI / 2); c.fillText(label, 0, -Hh * 0.08); c.font = `500 ${Hh * 0.13}px ${FONT}`; c.fillText('16V', 0, Hh * 0.14); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, Hh * 0.04, W, Hh * 0.03);
  });
  const sleeveMat = new THREE.MeshPhysicalMaterial({ map: sleeve, roughness: 0.4, clearcoat: 0.6 });
  const can = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 48, 1, true), sleeveMat); can.position.y = yb + h / 2;
  const topTex = canvasTex(256, 256, (c) => {
    const gr = c.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#d5d9de'); gr.addColorStop(1, '#8f959c');
    c.fillStyle = gr; c.fillRect(0, 0, 256, 256); c.strokeStyle = 'rgba(40,44,50,0.55)'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(128, 30); c.lineTo(128, 128); c.lineTo(45, 180); c.moveTo(128, 128); c.lineTo(211, 180); c.stroke();
  });
  const topMat = new THREE.MeshStandardMaterial({ map: topTex, metalness: 0.8, roughness: 0.35 });
  const top = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, 48).rotateX(-Math.PI / 2), topMat); top.position.y = yb + h + 0.002;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.97, 0.015, 8, 48).rotateX(Math.PI / 2), sleeveMat); lip.position.y = yb + h;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222 })); bottom.position.y = yb;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x35b779, side: THREE.DoubleSide, transparent: true, opacity: 0.95, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.BufferGeometry(), ringMat); ring.position.y = yb + h + 0.006; ring.renderOrder = 4;
  g.add(can, top, lip, bottom, ring);
  place(g, f);
  const wp = f.toWorld(-0.127, 0, 0), wn = f.toWorld(0.127, 0, 0), cb = f.toWorld(0, yb + 0.1, 0);
  const root = new THREE.Group(); root.add(g, leg([down(pp), V3(wp.x, yb, wp.z)]), leg([V3(wn.x, yb, wn.z), down(pn)]));
  let lastFrac = -1;
  return {
    root, pick: [can, top], hi: [sleeveMat],
    paths: [
      { pts: [V3(pp.x, 0.01, pp.z), V3(wp.x, yb + 0.02, wp.z), cb], pins: ['p', 'p', 'p'], cur: (P) => P.el.i },
      { pts: [cb, V3(wn.x, yb + 0.02, wn.z), V3(pn.x, 0.01, pn.z)], pins: ['n', 'n', 'n'], cur: (P) => P.el.i }
    ],
    labelAt: f.toWorld(0, yb + h + 0.15, 0),
    update(P, s, env) {
      const frac = Math.max(0, Math.min(1, P.el.vc / (env.vmax || 1)));
      if (Math.abs(frac - lastFrac) > 0.004) {
        lastFrac = frac; ring.geometry.dispose();
        ring.geometry = frac > 0.004 ? new THREE.RingGeometry(r * 0.28, r * 0.6, 48, 1, Math.PI / 2, -frac * Math.PI * 2).rotateX(-Math.PI / 2) : new THREE.BufferGeometry();
        viridis(frac, ringMat.color);
      }
      sleeveMat.emissive.copy(this.hover ? HOVER : BLACK);
    }
  };
}
const BLACK = new THREE.Color(0, 0, 0);

/* ---------------- TO-92 transistor ---------------- */
function to92(spec, H) {
  const pe = H(spec.pins.e), pb = H(spec.pins.b), pc = H(spec.pins.c);
  const f = frame(V3(pb.x, 0, pb.z), pc.clone().sub(pe)), g = new THREE.Group(), yb = 0.3, R = 0.24, fl = 0.1;
  const x0 = Math.sqrt(R * R - fl * fl), a0 = Math.atan2(-fl, x0), sh = new THREE.Shape();
  sh.absarc(0, 0, R, a0, Math.PI - a0, false); sh.closePath();
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x1b1b1c, roughness: 0.55, clearcoat: 0.2 });
  const body = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.48, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 32 }).rotateX(-Math.PI / 2), mat);
  body.position.y = yb;
  const txt = textPlane(['2N', '3904'], 0.3, 0.26, '#b9b7b0'); txt.position.set(0, yb + 0.3, fl + 0.013);
  g.add(body, txt); place(g, f);
  const root = new THREE.Group(); root.add(g);
  const paths = [], center = f.toWorld(0, yb + 0.2, -0.05);
  [['e', pe, -0.127], ['b', pb, 0], ['c', pc, 0.127]].forEach(([pin, h, lx]) => {
    const top = f.toWorld(lx, yb, 0), kink = f.toWorld(lx, yb - 0.08, 0);
    const pts = [top, kink, V3(h.x, 0.1, h.z), down(h)];
    root.add(leg(pts));
    const pp = fillet(pts, 0.06); pp[pp.length - 1].y = 0.01;
    if (pin === 'e') paths.push({ pts: [center, ...pp], pins: pp.concat([0]).map(() => 'e'), cur: (P, s, c) => -c.e });
    else paths.push({ pts: [...pp].reverse().concat([center]), pins: pp.concat([0]).map(() => pin), cur: (P, s, c) => c[pin] });
  });
  return { root, pick: [body], hi: [mat], paths, labelAt: f.toWorld(0, yb + 0.7, 0), update() { mat.emissive.copy(this.hover ? HOVER : BLACK); } };
}

/* ---------------- DIP-8, the 555 ---------------- */
function dip8(spec, H) {
  const P = {}; for (let i = 1; i <= 8; i++) P[i] = H(spec.pins[i]);
  const c = new THREE.Vector3(); for (let i = 1; i <= 8; i++) c.add(P[i]); c.multiplyScalar(1 / 8); c.y = 0;
  const f = frame(c, P[4].clone().sub(P[1])), g = new THREE.Group(), yb = 0.07, hh = 0.34, W = 0.635, Lx = 0.96;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1b, roughness: 0.62, clearcoat: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(Lx, hh, W), mat); body.position.y = yb + hh / 2;
  const notch = new THREE.Mesh(new THREE.CircleGeometry(0.07, 24, -Math.PI / 2, Math.PI).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x080808 }));
  notch.position.set(-Lx / 2, yb + hh + 0.002, 0);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x0c0c0c }));
  const z1 = f.toWorld(0, 0, 1).sub(f.toWorld(0, 0, 0)).dot(P[1].clone().sub(c)) > 0 ? 1 : -1;
  dot.position.set(-Lx / 2 + 0.14, yb + hh + 0.002, z1 * 0.19);
  const txt = textPlane(['NE555P'], 0.62, 0.16, '#a9a7a0'); txt.rotation.x = -Math.PI / 2; txt.position.set(0.04, yb + hh + 0.003, 0);
  g.add(body, notch, dot, txt); place(g, f);
  const root = new THREE.Group(); root.add(g);
  const paths = [], inside = f.toWorld(0, yb + hh / 2, 0);
  const inv = new THREE.Matrix4().copy(f.m).invert();
  for (let i = 1; i <= 8; i++) {
    const h = P[i], lz = h.clone().applyMatrix4(inv).z, s = Math.sign(lz), lx = h.clone().applyMatrix4(inv).x;
    const pts = [f.toWorld(lx, yb + 0.12, s * (W / 2 - 0.02)), f.toWorld(lx, yb + 0.12, s * 0.381), down(h)];
    const m = tubeMesh(fillet(pts, 0.05), 0.022, LEG, 6); root.add(m);
    const pp = fillet(pts, 0.05).reverse(); pp[0].y = 0.01;
    paths.push({ pts: [...pp, f.toWorld(lx, yb + 0.12, s * 0.15), inside], pins: [...pp.map(() => String(i)), String(i), String(i)], cur: (Pt, sv, pc) => pc[i] });
  }
  return { root, pick: [body], hi: [mat], paths, labelAt: f.toWorld(0, yb + hh + 0.25, 0), update() { mat.emissive.copy(this.hover ? HOVER : BLACK); } };
}

/* ---------------- 6 mm tactile button ---------------- */
function button(spec, H) {
  const h = { a1: H(spec.pins.a1), a2: H(spec.pins.a2), b1: H(spec.pins.b1), b2: H(spec.pins.b2) };
  const c = h.a1.clone().add(h.a2).add(h.b1).add(h.b2).multiplyScalar(0.25); c.y = 0;
  const f = frame(c, h.b1.clone().sub(h.a1)), g = new THREE.Group(), yb = 0.06, hh = 0.3;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x202021, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.62, hh, 0.62), mat); body.position.y = yb + hh / 2;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.02, 0.64), new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.3 })); plate.position.y = yb + hh + 0.01;
  const capMat = new THREE.MeshPhysicalMaterial({ color: 0xc8392b, roughness: 0.45, clearcoat: 0.5 });
  const act = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.2, 32), capMat); act.position.y = yb + hh + 0.12;
  g.add(body, plate, act); place(g, f);
  const root = new THREE.Group(); root.add(g);
  const inv = new THREE.Matrix4().copy(f.m).invert();
  for (const k of ['a1', 'a2', 'b1', 'b2']) {
    const l = h[k].clone().applyMatrix4(inv), sx = Math.sign(l.x), sz = Math.sign(l.z);
    root.add(leg([f.toWorld(sx * 0.27, yb + 0.05, sz * 0.3), f.toWorld(sx * 0.27, yb - 0.02, sz * 0.36), down(h[k])]));
  }
  const up = (k, y = 0.18) => V3(h[k].x, y, h[k].z), at0 = (k) => V3(h[k].x, 0.01, h[k].z);
  return {
    root, pick: [body, act, plate], hi: [capMat], press: true,
    paths: [
      { pts: [at0('a1'), up('a1'), up('b1'), at0('b1')], pins: ['a1', 'a1', 'b1', 'b1'], cur: (P, s) => P.sw.current(s) },
      { pts: [at0('a1'), up('a1', 0.12), up('a2', 0.12), at0('a2')], pins: ['a1', 'a1', 'a2', 'a2'], cur: (P, s) => P.ja.current(s) },
      { pts: [at0('b1'), up('b1', 0.12), up('b2', 0.12), at0('b2')], pins: ['b1', 'b1', 'b2', 'b2'], cur: (P, s) => P.jb.current(s) }
    ],
    labelAt: f.toWorld(0, yb + hh + 0.35, 0),
    update(P) { act.position.y = yb + hh + (P.pressed ? 0.06 : 0.12); capMat.emissive.copy(this.hover ? HOVER : BLACK); }
  };
}

/* ---------------- SPDT slide switch ---------------- */
function slide(spec, H) {
  const pa = H(spec.pins.a), pc = H(spec.pins.c), pb = H(spec.pins.b);
  const f = frame(V3(pc.x, 0, pc.z), pb.clone().sub(pa)), g = new THREE.Group(), yb = 0.14, hh = 0.32;
  const mat = new THREE.MeshPhysicalMaterial({ color: 0x1e1e20, roughness: 0.6 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.86, hh, 0.36), mat); body.position.y = yb + hh / 2;
  const cover = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.03, 0.38), new THREE.MeshStandardMaterial({ color: 0xb4b8be, metalness: 0.9, roughness: 0.32 })); cover.position.y = yb + hh + 0.015;
  const knobMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2b2d, roughness: 0.5 });
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), knobMat); knob.position.y = yb + hh + 0.12;
  g.add(body, cover, knob); place(g, f);
  const root = new THREE.Group(); root.add(g);
  for (const p of [pa, pc, pb]) root.add(leg([V3(p.x, yb + 0.02, p.z), down(p)], LEG, 0.028));
  const at = (p, y) => V3(p.x, y, p.z);
  return {
    root, pick: [body, knob, cover], hi: [knobMat], toggle: true,
    paths: [
      { pts: [at(pc, 0.01), at(pc, yb + 0.1), at(pa, yb + 0.1), at(pa, 0.01)], pins: ['c', 'c', 'a', 'a'], cur: (P, s) => P.sa.current(s) },
      { pts: [at(pc, 0.01), at(pc, yb + 0.1), at(pb, yb + 0.1), at(pb, 0.01)], pins: ['c', 'c', 'b', 'b'], cur: (P, s) => P.sb.current(s) }
    ],
    labelAt: f.toWorld(0, yb + hh + 0.4, 0),
    update(P) { const t = P.pos ? 0.16 : -0.16; knob.position.x += (t - knob.position.x) * 0.3; knobMat.emissive.copy(this.hover ? HOVER : BLACK); }
  };
}

export const BUILDERS = { resistor, led, cap, npn: to92, ic555: dip8, button, slide };
export function buildPart(spec, H) {
  const b = BUILDERS[spec.kind](spec, H);
  b.root.traverse(o => { o.userData.part = spec.id; });
  return b;
}

import * as THREE from 'three';

/* Shared 3D helpers: polyline curves with rounded corners, canvas
   textures, text sprites, seven segment digits, and the colour map. */

export class PolyCurve extends THREE.Curve {
  constructor(pts) {
    super(); this.pts = pts; this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    this.len = this.cum[this.cum.length - 1] || 1e-9;
  }
  getPoint(t, out = new THREE.Vector3()) {
    const s = t * this.len, c = this.cum; let i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    const f = (s - c[i - 1]) / ((c[i] - c[i - 1]) || 1e-9);
    return out.copy(this.pts[i - 1]).lerp(this.pts[i], Math.min(1, Math.max(0, f)));
  }
}

// Replace each corner of a polyline with a short quadratic arc
export function fillet(pts, r = 0.08, seg = 6) {
  if (pts.length < 3) return pts.map(p => p.clone());
  const out = [pts[0].clone()];
  for (let i = 1; i < pts.length - 1; i++) {
    const A = pts[i - 1], B = pts[i], C = pts[i + 1];
    const u = A.clone().sub(B), w = C.clone().sub(B), lu = u.length(), lw = w.length();
    const d = Math.min(r, lu / 2, lw / 2);
    if (d < 1e-4) { out.push(B.clone()); continue; }
    const P1 = B.clone().addScaledVector(u, d / lu), P2 = B.clone().addScaledVector(w, d / lw);
    for (let k = 0; k <= seg; k++) {
      const t = k / seg, a = (1 - t) * (1 - t), b = 2 * t * (1 - t), c = t * t;
      out.push(new THREE.Vector3(a * P1.x + b * B.x + c * P2.x, a * P1.y + b * B.y + c * P2.y, a * P1.z + b * B.z + c * P2.z));
    }
  }
  out.push(pts[pts.length - 1].clone());
  return out;
}

export function tubeMesh(pts, radius, material, radial = 10) {
  const curve = new PolyCurve(pts);
  const g = new THREE.TubeGeometry(curve, Math.max(8, Math.ceil(curve.len / 0.03)), radius, radial, false);
  return new THREE.Mesh(g, material);
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  t.userData.canvas = c; t.userData.draw = draw;
  return t;
}
export function redraw(tex, draw) {
  const c = tex.userData.canvas, g = c.getContext('2d'); g.clearRect(0, 0, c.width, c.height); (draw || tex.userData.draw)(g, c.width, c.height); tex.needsUpdate = true;
}

export const FONT = 'Archivo, "Helvetica Neue", Arial, sans-serif';
export function labelSprite(text, size = 0.22, color = '#e9e6df', bg = 'rgba(20,20,19,0.78)') {
  const font = `600 44px ${FONT}`, pad = 16;
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = font;
  const w = Math.ceil(g.measureText(text).width) + pad * 2; c.width = w; c.height = 64;
  g.font = font; g.fillStyle = bg;
  g.beginPath(); g.moveTo(8, 0); g.lineTo(w, 0); g.lineTo(w, 56); g.lineTo(w - 8, 64); g.lineTo(0, 64); g.lineTo(0, 8); g.closePath(); g.fill();
  g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, pad, 34);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  sp.scale.set(size * w / 64, size, 1); sp.renderOrder = 20; sp.center.set(0.5, 0);
  return sp;
}

// Viridis, the same stops the colour bar uses
const CMAP = [[0, 0x44, 0x01, 0x54], [0.25, 0x3b, 0x52, 0x8b], [0.5, 0x21, 0x91, 0x8c], [0.75, 0x5e, 0xc9, 0x62], [1, 0xfd, 0xe7, 0x25]];
export function viridis(t, out = new THREE.Color()) {
  t = Math.min(1, Math.max(0, t)); let i = 1;
  while (i < CMAP.length - 1 && t > CMAP[i][0]) i++;
  const a = CMAP[i - 1], b = CMAP[i], f = (t - a[0]) / (b[0] - a[0]);
  return out.setRGB((a[1] + (b[1] - a[1]) * f) / 255, (a[2] + (b[2] - a[2]) * f) / 255, (a[3] + (b[3] - a[3]) * f) / 255, THREE.SRGBColorSpace);
}
export function viridisCss(t) { const c = viridis(t); return '#' + c.getHexString(THREE.SRGBColorSpace); }

/* Seven segment digits on a canvas: the supply display and the multimeter.
   Segments a to g, drawn as slanted hexagons. */
const SEG = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', '-': 'g', ' ': '', 'O': 'abcdef', 'L': 'fed', 'E': 'afged', 'r': 'eg', 'o': 'cdeg', 'P': 'abefg', 'n': 'ceg', 'U': 'bcdef' };
export function draw7(g, text, x, y, h, on, off) {
  const w = h * 0.52, t = h * 0.12, sl = h * 0.08;
  let cx = x;
  const seg = (x0, y0, x1, y1, lit) => {
    g.fillStyle = lit ? on : off;
    const horiz = Math.abs(y1 - y0) < 1e-6, k = t / 2;
    g.beginPath();
    if (horiz) { g.moveTo(x0 + k, y0); g.lineTo(x0 + 2 * k, y0 - k); g.lineTo(x1 - 2 * k, y1 - k); g.lineTo(x1 - k, y1); g.lineTo(x1 - 2 * k, y1 + k); g.lineTo(x0 + 2 * k, y0 + k); }
    else { g.moveTo(x0, y0 + k); g.lineTo(x0 + k, y0 + 2 * k); g.lineTo(x1 + k, y1 - 2 * k); g.lineTo(x1, y1 - k); g.lineTo(x1 - k, y1 - 2 * k); g.lineTo(x0 - k, y0 + 2 * k); }
    g.closePath(); g.fill();
  };
  const skew = (yy) => (y + h - yy) / h * sl;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '.') { g.fillStyle = on; g.fillRect(cx - w * 0.28 + skew(y + h), y + h - t * 0.9, t * 0.9, t * 0.9); continue; }
    const s = SEG[ch] ?? '', L = cx, R = cx + w, T = y, M = y + h / 2, B = y + h;
    seg(L + skew(T), T, R + skew(T), T, s.includes('a'));
    seg(R + skew(T), T, R + skew(M), M, s.includes('b'));
    seg(R + skew(M), M, R + skew(B), B, s.includes('c'));
    seg(L + skew(B), B, R + skew(B), B, s.includes('d'));
    seg(L + skew(M), M, L + skew(B), B, s.includes('e'));
    seg(L + skew(T), T, L + skew(M), M, s.includes('f'));
    seg(L + skew(M), M, R + skew(M), M, s.includes('g'));
    cx += w + h * 0.3;
  }
  return cx;
}

// A soft round glow for LEDs, and a puff for smoke
let glowTex = null, puffTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  glowTex = canvasTex(128, 128, (g) => {
    const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,0.75)'); r.addColorStop(0.45, 'rgba(255,255,255,0.18)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  });
  return glowTex;
}
export function puffTexture() {
  if (puffTex) return puffTex;
  puffTex = canvasTex(128, 128, (g) => {
    for (let i = 0; i < 7; i++) {
      const x = 64 + (Math.sin(i * 2.3) * 22), y = 64 + Math.cos(i * 1.7) * 18, rr = 30 + (i % 3) * 8;
      const r = g.createRadialGradient(x, y, 0, x, y, rr); r.addColorStop(0, 'rgba(220,220,215,0.45)'); r.addColorStop(1, 'rgba(220,220,215,0)');
      g.fillStyle = r; g.fillRect(0, 0, 128, 128);
    }
  });
  return puffTex;
}

// Heat colour for a resistor body: dull red above 120 °C, orange near 400 °C
export function heatColor(T, out = new THREE.Color()) {
  const f = Math.min(1, Math.max(0, (T - 120) / 280));
  return out.setRGB(0.9 * f + 0.1 * f * f, 0.25 * f * f, 0.02 * f);
}

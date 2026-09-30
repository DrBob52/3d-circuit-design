import * as THREE from 'three';
import { viridis } from './util3d.js';

/* =====================================================================
   CURRENT DOTS. Evenly spaced dots ride along every conductor. Speed
   follows the current on a square root scale (1 mA crawls, 100 mA
   hurries) and colour shows the local voltage, so a dot changes colour
   as it crosses a resistor. Dots in a dead circuit sit still: the charge
   is always in the wire, only the flow stops.
   ===================================================================== */
export const SPACING = 0.1;
export function dotSpeed(I) {
  const a = Math.abs(I); if (a < 1e-8) return 0;
  return Math.sign(I) * Math.min(3.2, 1.1 * Math.sqrt(a / 0.01));
}

export class Flow {
  constructor(max = 5000, radius = 0.019) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 5;
    this.max = max; this.paths = []; this.spacing = SPACING;
  }
  // paths: [{ pts: [Vector3], I: number, v: [volts per point] }]
  setPaths(paths, spacing = SPACING) {
    this.spacing = spacing;
    this.paths = paths.map(p => {
      const cum = [0];
      for (let i = 1; i < p.pts.length; i++) cum.push(cum[i - 1] + p.pts[i].distanceTo(p.pts[i - 1]));
      return Object.assign(p, { cum, len: cum[cum.length - 1], off: Math.random() * spacing, v: p.v || p.pts.map(() => 0), I: p.I || 0 });
    });
  }
  update(dt, { dir = 1, vmax = 1, speedScale = 1, show = true } = {}) {
    const M = new THREE.Matrix4(), c = new THREE.Color(), pos = new THREE.Vector3(), SP = this.spacing;
    let n = 0;
    if (show) for (const p of this.paths) {
      if (p.len < 1e-4) continue;
      const v = dotSpeed(p.I) * dir * speedScale;
      p.off = ((p.off + v * dt) % SP + SP) % SP;
      const still = v === 0;
      let j = 1;
      for (let s = p.off; s <= p.len && n < this.max; s += SP) {
        while (j < p.cum.length - 1 && p.cum[j] < s) j++;
        const seg = p.cum[j] - p.cum[j - 1], f = seg > 0 ? (s - p.cum[j - 1]) / seg : 0;
        pos.copy(p.pts[j - 1]).lerp(p.pts[j], f);
        M.makeTranslation(pos.x, pos.y, pos.z); this.mesh.setMatrixAt(n, M);
        viridis(0.08 + 0.92 * ((p.v[j - 1] + (p.v[j] - p.v[j - 1]) * f) / vmax), c);
        if (still) c.multiplyScalar(0.45);
        this.mesh.setColorAt(n, c); n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

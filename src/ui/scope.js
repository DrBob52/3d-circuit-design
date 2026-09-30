import { fmt } from '../sim/parts.js';
import { FONT } from '../bench/util3d.js';

/* Two channel oscilloscope. CH1 on the left scale, CH2 on the right,
   unless both are volts on one scale. Ranges step through 1-2-5 and
   hold for a moment before shrinking, like a scope's auto set. */
export function nice(x) { const e = Math.pow(10, Math.floor(Math.log10(x))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; }

export function sizeCanvas(c) {
  const r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  if (!r.width || !r.height) return null;
  if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return { g, W: r.width, H: r.height };
}

export class Scope {
  constructor(canvas) { this.c = canvas; this.r1 = 1; this.r2 = 1; this.hold = 0; }
  reset() { this.r1 = 1e-3; this.r2 = 1e-3; this.hold = 0; }
  draw(samples, now, win, cfg, p, css) {
    const s = sizeCanvas(this.c); if (!s) return; const { g, W, H } = s;
    const c1 = css('--ch1'), c2 = css('--ch2'), soft = css('--ink-soft');
    const L = 54, R = 58, T = 10, B = 22, pw = W - L - R, ph = H - T - B;
    const pos1 = cfg.same || cfg.pos1, pos2 = cfg.same || cfg.pos2;
    let m1 = 0, m2 = 0;
    const t0 = now - win;
    for (const q of samples) if (q.t >= t0) { m1 = Math.max(m1, Math.abs(q.a)); m2 = Math.max(m2, Math.abs(q.b)); }
    if (cfg.same) m1 = m2 = Math.max(m1, m2, p && cfg.thresholds ? p.V : 0);
    const w1 = nice(Math.max(m1 * 1.12, cfg.min1 || 1e-3)), w2 = nice(Math.max(m2 * 1.12, cfg.min2 || 1e-5));
    if (w1 > this.r1 || (now - this.hold > 1.5 && w1 < this.r1)) { this.r1 = w1; this.hold = now; }
    if (w2 > this.r2 || (now - this.hold > 1.5 && w2 < this.r2)) this.r2 = w2;
    // screen
    g.fillStyle = css('--screen'); g.beginPath(); g.moveTo(L, T); g.lineTo(L + pw - 8, T); g.lineTo(L + pw, T + 8); g.lineTo(L + pw, T + ph); g.lineTo(L + 8, T + ph); g.lineTo(L, T + ph - 8); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(200,196,186,0.09)'; g.lineWidth = 1;
    for (let k = 1; k < 8; k++) { const y = T + ph * k / 8; g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
    for (let k = 1; k < 10; k++) { const x = L + pw * k / 10; g.beginPath(); g.moveTo(x, T); g.lineTo(x, T + ph); g.stroke(); }
    const y0 = (pos) => pos ? T + ph : T + ph / 2;
    const Y = (v, r, pos) => pos ? T + ph - Math.max(-0.03, Math.min(1.05, v / r)) * ph : T + ph / 2 - Math.max(-1.05, Math.min(1.05, v / r)) * ph / 2;
    g.strokeStyle = 'rgba(200,196,186,0.24)'; g.beginPath(); g.moveTo(L, y0(pos1)); g.lineTo(L + pw, y0(pos1)); g.stroke();
    g.font = `11px ${FONT}`; g.textAlign = 'right'; g.fillStyle = c1;
    g.fillText(fmt(this.r1, cfg.ch1[1], 1), L - 6, T + 9); g.fillText(pos1 ? '0' : fmt(-this.r1, cfg.ch1[1], 1), L - 6, T + ph);
    g.textAlign = 'left'; g.fillStyle = cfg.same ? c1 : c2;
    if (!cfg.same) { g.fillText(fmt(this.r2, cfg.ch2[1], 1), L + pw + 6, T + 9); g.fillText(pos2 ? '0' : fmt(-this.r2, cfg.ch2[1], 1), L + pw + 6, T + ph); }
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    if (cfg.thresholds && p) {
      g.setLineDash([4, 4]); g.strokeStyle = 'rgba(253,231,37,0.55)'; g.lineWidth = 1;
      for (const v of cfg.thresholds(p)) { const y = Y(v, this.r1, pos1); g.beginPath(); g.moveTo(L, y); g.lineTo(L + pw, y); g.stroke(); }
      g.setLineDash([]);
    }
    const plot = (key, range, pos, color, w) => {
      g.strokeStyle = color; g.lineWidth = w; g.shadowColor = color; g.shadowBlur = 6; g.beginPath(); let st = false;
      for (const q of samples) { if (q.t < t0) continue; const x = L + pw * (q.t - t0) / win, y = Y(q[key], range, pos); if (!st) { g.moveTo(x, y); st = true; } else g.lineTo(x, y); }
      g.stroke(); g.shadowBlur = 0;
    };
    plot('b', cfg.same ? this.r1 : this.r2, cfg.same ? pos1 : pos2, c2, 1.4); plot('a', this.r1, pos1, c1, 1.8);
    g.restore();
    g.fillStyle = soft; g.textAlign = 'center'; g.fillText(`${fmt(win / 10, 's', 2)} / div`, L + pw / 2, H - 6);
  }
}

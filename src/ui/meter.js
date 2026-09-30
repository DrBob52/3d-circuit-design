import { draw7, FONT } from '../bench/util3d.js';

/* A digital multimeter drawn on a canvas. The rotary switch picks what
   it measures: voltage across the probed part, current through it, or
   the part's own resistance as if you pulled it off the board. */
const POS = [['OFF', -118], ['V', -40], ['mA', 40], ['Ω', 118]];

export function lcdText(x, unit) {
  if (!isFinite(x)) return ['  OL', unit];
  const a = Math.abs(x);
  let s = 1, pre = '';
  if (unit === 'Ω') { if (a >= 1e6) { s = 1e6; pre = 'M'; } else if (a >= 1e3) { s = 1e3; pre = 'k'; } }
  else if (a < 1e-12) { s = 1; } else if (a < 1e-6) { s = 1e-9; pre = 'n'; } else if (a < 1e-3) { s = 1e-6; pre = 'µ'; } else if (a < 1) { s = 1e-3; pre = 'm'; }
  const v = x / s, av = Math.abs(v);
  const t = av < 10 ? v.toFixed(3) : av < 100 ? v.toFixed(2) : v.toFixed(1);
  return [t, pre + unit];
}

export class Meter {
  constructor(canvas, onMode) {
    this.c = canvas; this.mode = 'V'; this.onMode = onMode;
    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      const cx = r.width - 62, cy = 64, dx = x - cx, dy = y - cy;
      if (Math.hypot(dx, dy) > 62) return;
      const ang = Math.atan2(dx, -dy) * 180 / Math.PI;
      let best = POS[0]; for (const p of POS) if (Math.abs(p[1] - ang) < Math.abs(best[1] - ang)) best = p;
      this.mode = best[0]; this.onMode && this.onMode(this.mode);
    });
    canvas.setAttribute('role', 'img');
  }
  draw(st, css) {
    const c = this.c, r = c.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    if (!r.width) return;
    if (c.width !== Math.round(r.width * dpr) || c.height !== Math.round(r.height * dpr)) { c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr); }
    const g = c.getContext('2d'), W = r.width, H = r.height;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    // body
    g.fillStyle = css('--panel-2'); g.beginPath(); g.moveTo(0, 0); g.lineTo(W - 12, 0); g.lineTo(W, 12); g.lineTo(W, H); g.lineTo(12, H); g.lineTo(0, H - 12); g.closePath(); g.fill();
    // LCD
    const lx = 10, ly = 10, lw = W - 140, lh = 78;
    g.fillStyle = '#23261f'; g.fillRect(lx - 2, ly - 2, lw + 4, lh + 4);
    g.fillStyle = css('--lcd'); g.fillRect(lx, ly, lw, lh);
    const ink = css('--lcd-ink'), off = css('--lcd-off');
    let text = '', unit = '';
    if (this.mode === 'OFF' || !st) text = '';
    else if (this.mode === 'V') [text, unit] = lcdText(st.v, 'V');
    else if (this.mode === 'mA') { if (Math.abs(st.i) > 0.2) { text = '  OL'; unit = 'mA'; } else [text, unit] = lcdText(st.i, 'A'); }
    else { if (st.R == null) { text = '  OL'; unit = 'Ω'; } else [text, unit] = lcdText(st.R, 'Ω'); }
    const dh = Math.min(30, (lw - 40) / 4.1), cw = dh * 0.82, nChars = text.replace('.', '').length;
    if (this.mode !== 'OFF') {
      g.font = `600 9px ${FONT}`; g.fillStyle = ink; g.textAlign = 'left';
      g.fillText(this.mode === 'Ω' ? 'AUTO' : 'DC  AUTO', lx + 6, ly + 12);
      draw7(g, '88888', lx + lw - 30 - 5 * cw, ly + 22, dh, off, off);
      draw7(g, text, lx + lw - 30 - nChars * cw, ly + 22, dh, ink, 'rgba(0,0,0,0)');
      g.font = `600 13px ${FONT}`; g.textAlign = 'right'; g.fillText(unit, lx + lw - 6, ly + lh - 8);
    }
    // what is probed
    g.textAlign = 'left'; g.font = `600 12px ${FONT}`; g.fillStyle = css('--ink');
    const what = !st ? 'No part selected' : `${st.name}`;
    g.fillText(what, lx, ly + lh + 20);
    g.font = `400 11px ${FONT}`; g.fillStyle = css('--ink-soft');
    const how = { OFF: 'switched off', V: st && st.vwhat ? st.vwhat : 'voltage across it', mA: 'current through it (200 mA range)', Ω: 'its own resistance, off the board' }[this.mode];
    fitText(g, how, lx, ly + lh + 36, lw + 20);
    g.fillStyle = css('--ink-faint'); fitText(g, 'click a part to probe it', lx, ly + lh + 52, lw + 20);
    // rotary switch
    const cx = W - 62, cy = 64, R = 30;
    g.font = `600 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [name, a] of POS) {
      const t = a * Math.PI / 180, on = name === this.mode;
      g.fillStyle = on ? css('--acc') : css('--ink-soft');
      g.fillText(name === 'V' ? 'V⎓' : name, cx + (R + 17) * Math.sin(t), cy - (R + 17) * Math.cos(t));
      g.strokeStyle = css('--tick'); g.lineWidth = 1; g.beginPath(); g.moveTo(cx + (R + 3) * Math.sin(t), cy - (R + 3) * Math.cos(t)); g.lineTo(cx + (R + 7) * Math.sin(t), cy - (R + 7) * Math.cos(t)); g.stroke();
    }
    g.fillStyle = '#1b1c1d'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2c2e30'; g.beginPath(); g.arc(cx, cy, R - 6, 0, Math.PI * 2); g.fill();
    const t = POS.find(p => p[0] === this.mode)[1] * Math.PI / 180;
    g.strokeStyle = '#e9e6df'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + 4 * Math.sin(t), cy - 4 * Math.cos(t)); g.lineTo(cx + (R - 4) * Math.sin(t), cy - (R - 4) * Math.cos(t)); g.stroke();
    // jacks
    const jack = (x, col, lab) => { g.fillStyle = '#111'; g.beginPath(); g.arc(x, H - 22, 7, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(x, H - 22, 4, 0, 7); g.fill();
      g.fillStyle = css('--ink-faint'); g.font = `500 8.5px ${FONT}`; g.fillText(lab, x, H - 8); };
    jack(W - 92, '#2a2a2a', 'COM'); jack(W - 32, '#c9302c', 'VΩmA');
    g.textBaseline = 'alphabetic';
    c.setAttribute('aria-label', `Multimeter on ${this.mode}, reading ${text.trim() || 'nothing'} ${unit}, probing ${what}`);
  }
}
function fitText(g, s, x, y, w) {
  if (g.measureText(s).width <= w) { g.fillText(s, x, y); return; }
  while (s.length > 3 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
  g.fillText(s + '…', x, y);
}

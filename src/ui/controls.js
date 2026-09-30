import { RVALS, CVALS, fmtR, fmtC, bands } from '../sim/parts.js';

/* Build the station's controls from their definitions. Every control
   writes through onChange(key, value); sync(p) puts values back. */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const bandHtml = (R) => `<span class="bands">${bands(R).map(b => `<i style="background:${b[1]}" title="${b[0]}"></i>`).join('')}</span>`;

function fillRule(el) {
  const lo = +el.min, hi = +el.max, v = +el.value, f = (x) => ((x - lo) / (hi - lo) * 100).toFixed(2) + '%';
  el.style.setProperty('--a', '0%'); el.style.setProperty('--b', f(v));
}
const nearestIdx = (arr, v) => { let b = 0; for (let i = 1; i < arr.length; i++) if (Math.abs(Math.log(arr[i] / v)) < Math.abs(Math.log(arr[b] / v))) b = i; return b; };

export function buildControls(root, defs, p, onChange, uid) {
  root.innerHTML = '';
  const grp = document.createElement('div'); grp.className = 'grp';
  grp.innerHTML = '<div class="gh">Controls</div>';
  root.appendChild(grp);
  const syncers = [];
  defs.forEach((d, n) => {
    const id = `${uid}-${d.key || n}`;
    if (d.type === 'slider' || d.type === 'rsel' || d.type === 'csel') {
      const vals = d.type === 'rsel' ? RVALS.filter(v => v >= d.min && v <= d.max) : d.type === 'csel' ? CVALS : null;
      const box = document.createElement('div'); box.className = 'dial';
      const min = vals ? 0 : d.min, max = vals ? vals.length - 1 : d.max, step = vals ? 1 : d.step;
      const lo = vals ? (d.type === 'rsel' ? fmtR(vals[0]) : fmtC(vals[0])) : `${d.min}`, hi = vals ? (d.type === 'rsel' ? fmtR(vals[vals.length - 1]) : fmtC(vals[vals.length - 1])) : `${d.max} ${d.unit}`;
      box.innerHTML = `<div class="lab"><label for="${id}">${esc(d.label)}</label><output id="${id}-o"></output></div>
        <input class="rule" type="range" id="${id}" min="${min}" max="${max}" step="${step}"><div class="scale"><span>${lo}</span><span>${hi}</span></div>`;
      grp.appendChild(box);
      const inp = box.querySelector('input'), out = box.querySelector('output');
      const show = (v) => { out.innerHTML = d.type === 'rsel' ? `${bandHtml(v)}${fmtR(v)}` : d.type === 'csel' ? fmtC(v) : d.fmt ? d.fmt(v) : `${(+v).toFixed(d.dig ?? 1)} ${d.unit}`; };
      const toVal = () => vals ? vals[+inp.value] : +inp.value;
      inp.addEventListener('input', () => { fillRule(inp); const v = toVal(); show(v); onChange(d.key, v); });
      if (vals) inp.setAttribute('aria-valuetext', '');
      syncers.push((p) => { inp.value = vals ? nearestIdx(vals, p[d.key]) : p[d.key]; fillRule(inp); show(p[d.key]); if (vals) inp.setAttribute('aria-valuetext', d.type === 'rsel' ? fmtR(p[d.key]) : fmtC(p[d.key])); });
    } else if (d.type === 'cells') {
      const box = document.createElement('div'); box.className = 'dial';
      box.innerHTML = `<div class="lab"><span>${esc(d.label)}</span><output></output></div>`;
      const cells = document.createElement('div'); cells.className = 'cells' + (d.options.length === 5 ? ' five' : ''); cells.setAttribute('role', 'group'); cells.setAttribute('aria-label', d.label);
      cells.style.marginTop = '5px';
      cells.innerHTML = d.options.map(o => `<button class="cell" data-k="${esc(o.k)}" aria-pressed="false" title="${esc(o.nm)}"><span class="z"><span>${esc(o.z || '')}</span></span><span class="sym">${esc(o.sym)}</span><span class="nm">${esc(o.nm)}</span>${o.swatch ? `<i class="sw" style="background:${o.swatch}"></i>` : ''}</button>`).join('');
      box.appendChild(cells); grp.appendChild(box);
      cells.querySelectorAll('.cell').forEach(c => c.addEventListener('click', () => onChange(d.key, d.options.find(o => String(o.k) === c.dataset.k).k)));
      const out = box.querySelector('output');
      syncers.push((p) => { cells.querySelectorAll('.cell').forEach(c => c.setAttribute('aria-pressed', c.dataset.k === String(p[d.key]))); const o = d.options.find(o => String(o.k) === String(p[d.key])); out.textContent = o ? o.nm : ''; });
    } else if (d.type === 'toggle') {
      const b = document.createElement('button'); b.className = 'btn'; b.id = id; b.style.marginTop = '10px'; b.style.width = '100%';
      b.innerHTML = '<i class="led"></i><span></span>';
      b.addEventListener('click', () => onChange(d.key, !p[d.key]));
      grp.appendChild(b);
      if (d.hint) { const t = document.createElement('p'); t.className = 'tip'; t.textContent = d.hint; grp.appendChild(t); }
      syncers.push((p) => { b.setAttribute('aria-pressed', !!p[d.key]); b.querySelector('span').textContent = p[d.key] ? d.on : d.off; });
    } else if (d.type === 'choice') {
      const box = document.createElement('div'); box.className = 'dial';
      box.innerHTML = `<div class="lab"><span>${esc(d.label)}</span></div>`;
      const seg = document.createElement('div'); seg.className = 'seg'; seg.style.marginTop = '5px'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', d.label);
      seg.innerHTML = d.options.map(([v, t]) => `<button data-v="${esc(v)}" aria-pressed="false">${esc(t)}</button>`).join('');
      box.appendChild(seg); grp.appendChild(box);
      seg.querySelectorAll('button').forEach((b, i) => b.addEventListener('click', () => onChange(d.key, d.options[i][0])));
      syncers.push((p) => seg.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', d.options[i][0] === p[d.key])));
    } else if (d.type === 'buttons') {
      const row = document.createElement('div'); row.className = 'row2';
      for (const [act, text] of d.items) {
        const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `<i class="led"></i><span>${esc(text)}</span>`;
        b.addEventListener('click', () => onChange(act, true, true)); row.appendChild(b);
      }
      grp.appendChild(row);
    } else if (d.type === 'toggles') {
      const box = document.createElement('div'); box.className = 'dial';
      box.innerHTML = `<div class="lab"><span>${esc(d.label)}</span></div>`;
      const row = document.createElement('div'); row.className = 'row2'; row.style.marginTop = '5px';
      const btns = d.items.map(([k, text]) => { const b = document.createElement('button'); b.className = 'btn'; b.innerHTML = `<i class="led"></i><span>${esc(text)}</span>`; b.addEventListener('click', () => onChange(k, !p[k])); row.appendChild(b); return [k, b]; });
      box.appendChild(row); grp.appendChild(box);
      syncers.push((p) => btns.forEach(([k, b]) => b.setAttribute('aria-pressed', !!p[k])));
    } else if (d.type === 'steps') {
      const box = document.createElement('div'); box.className = 'dial';
      box.innerHTML = `<div class="lab"><label for="${id}">${esc(d.label)}</label><output></output></div>
        <input class="rule" type="range" id="${id}" min="0" max="${d.values.length - 1}" step="1"><div class="scale"><span>${d.fmt(d.values[0])}</span><span>${d.fmt(d.values[d.values.length - 1])}</span></div>`;
      grp.appendChild(box);
      const inp = box.querySelector('input'), out = box.querySelector('output');
      inp.addEventListener('input', () => { fillRule(inp); out.textContent = d.fmt(d.values[+inp.value]); onChange(d.key, +inp.value); });
      syncers.push((p) => { inp.value = p[d.key]; fillRule(inp); out.textContent = d.fmt(d.values[p[d.key]]); inp.setAttribute('aria-valuetext', d.fmt(d.values[p[d.key]])); });
    } else if (d.type === 'note') {
      const t = document.createElement('p'); t.className = 'tip'; t.innerHTML = d.html; grp.appendChild(t);
    }
  });
  const sync = (p) => syncers.forEach(f => f(p));
  sync(p);
  return { sync, root: grp };
}

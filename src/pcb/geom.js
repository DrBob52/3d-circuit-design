import { FAB, padsOf, courtyard } from './footprints.js';

/* =====================================================================
   BOARD GEOMETRY. Copper is a set of flat shapes on the top (F) and
   bottom (B) layers: rectangular pads, round through-hole pads and vias
   that sit on both layers, and tracks made of capsule-shaped segments.
   From these we find which copper touches (islands), what shorts, what
   sits too close, what still needs routing, and how current spreads
   along the tracks.
   ===================================================================== */
const EPS = 1e-6;

/* ---------- distances between shapes, with the closest points ---------- */
function segPt(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, y = ay + t * dy;
  return { d: Math.hypot(px - x, py - y), x, y, t };
}
function segInter(a, b) {   // proper or touching intersection of two segments
  const d1x = a.bx - a.ax, d1y = a.by - a.ay, d2x = b.bx - b.ax, d2y = b.by - b.ay;
  const den = d1x * d2y - d1y * d2x; if (Math.abs(den) < 1e-12) return null;
  const t = ((b.ax - a.ax) * d2y - (b.ay - a.ay) * d2x) / den, u = ((b.ax - a.ax) * d1y - (b.ay - a.ay) * d1x) / den;
  if (t < -1e-9 || t > 1 + 1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return { x: a.ax + t * d1x, y: a.ay + t * d1y, t, u };
}
function segSeg(a, b) {
  const X = segInter(a, b); if (X) return { d: 0, p: [X.x, X.y], q: [X.x, X.y] };
  let best = null;
  const tryPt = (px, py, s, onA) => { const r = segPt(s.ax, s.ay, s.bx, s.by, px, py); if (!best || r.d < best.d) best = { d: r.d, p: onA ? [r.x, r.y] : [px, py], q: onA ? [px, py] : [r.x, r.y] }; };
  tryPt(b.ax, b.ay, a, true); tryPt(b.bx, b.by, a, true); tryPt(a.ax, a.ay, b, false); tryPt(a.bx, a.by, b, false);
  return best;
}
function ptRect(px, py, r) {
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  const x = Math.max(x0, Math.min(x1, px)), y = Math.max(y0, Math.min(y1, py));
  return { d: Math.hypot(px - x, py - y), x, y };
}
function segHitsRect(s, r) {   // Liang-Barsky
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  const dx = s.bx - s.ax, dy = s.by - s.ay; let t0 = 0, t1 = 1;
  for (const [p, q] of [[-dx, s.ax - x0], [dx, x1 - s.ax], [-dy, s.ay - y0], [dy, y1 - s.ay]]) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return null; continue; }
    const t = q / p; if (p < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  const tm = (t0 + t1) / 2; return { x: s.ax + tm * dx, y: s.ay + tm * dy };
}
function segRect(s, r) {
  const hit = segHitsRect(s, r); if (hit) return { d: 0, p: [hit.x, hit.y], q: [hit.x, hit.y] };
  let best = null;
  for (const [px, py] of [[s.ax, s.ay], [s.bx, s.by]]) { const k = ptRect(px, py, r); if (!best || k.d < best.d) best = { d: k.d, p: [px, py], q: [k.x, k.y] }; }
  const x0 = r.x - r.w / 2, x1 = r.x + r.w / 2, y0 = r.y - r.h / 2, y1 = r.y + r.h / 2;
  for (const [cx, cy] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) { const k = segPt(s.ax, s.ay, s.bx, s.by, cx, cy); if (k.d < best.d) best = { d: k.d, p: [k.x, k.y], q: [cx, cy] }; }
  return best;
}
// Gap between two copper shapes: negative or zero means they touch.
export function gap(A, B) {
  const a = A.kind, b = B.kind;
  if (a > b) { const r = gap(B, A); return { d: r.d, x: r.x, y: r.y }; }   // order: circle, rect, seg
  const mid = (p, q) => ({ x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2 });
  if (a === 'circle' && b === 'circle') { const d = Math.hypot(A.x - B.x, A.y - B.y); return { d: d - A.r - B.r, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }; }
  if (a === 'circle' && b === 'rect') { const k = ptRect(A.x, A.y, B); return { d: k.d - A.r, ...mid([A.x, A.y], [k.x, k.y]) }; }
  if (a === 'circle' && b === 'seg') { const k = segPt(B.ax, B.ay, B.bx, B.by, A.x, A.y); return { d: k.d - A.r - B.r, ...mid([A.x, A.y], [k.x, k.y]) }; }
  if (a === 'rect' && b === 'rect') {
    const dx = Math.abs(A.x - B.x) - (A.w + B.w) / 2, dy = Math.abs(A.y - B.y) - (A.h + B.h) / 2;
    const d = dx <= 0 && dy <= 0 ? Math.max(dx, dy) : Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
    return { d, x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 };
  }
  if (a === 'rect' && b === 'seg') { const k = segRect(B, A); return { d: k.d - B.r, ...mid(k.p, k.q) }; }
  const k = segSeg(A, B); return { d: k.d - A.r - B.r, ...mid(k.p, k.q) };
}
export function inShape(S, x, y, m = 0) {
  if (S.kind === 'circle') return Math.hypot(x - S.x, y - S.y) <= S.r + m;
  if (S.kind === 'rect') return Math.abs(x - S.x) <= S.w / 2 + m && Math.abs(y - S.y) <= S.h / 2 + m;
  return segPt(S.ax, S.ay, S.bx, S.by, x, y).d <= S.r + m;
}
export function bbox(S) {
  if (S.kind === 'circle') return [S.x - S.r, S.y - S.r, S.x + S.r, S.y + S.r];
  if (S.kind === 'rect') return [S.x - S.w / 2, S.y - S.h / 2, S.x + S.w / 2, S.y + S.h / 2];
  return [Math.min(S.ax, S.bx) - S.r, Math.min(S.ay, S.by) - S.r, Math.max(S.ax, S.bx) + S.r, Math.max(S.ay, S.by) + S.r];
}

/* ---------- copper objects ---------- */
export function copperObjects(project, board) {
  const objs = [];
  for (const part of project.parts) {
    const pl = board.place[part.id]; if (!pl) continue;
    for (const pd of padsOf(part, pl)) {
      const shape = pd.tht && !pd.square ? { kind: 'circle', x: pd.x, y: pd.y, r: pd.w / 2 } : { kind: 'rect', x: pd.x, y: pd.y, w: pd.w, h: pd.h };
      objs.push({ type: 'pad', layers: pd.tht ? ['F', 'B'] : ['F'], shape, part: part.id, pin: pd.pin, net: pd.net, pad: pd });
    }
  }
  board.traces.forEach((t, ti) => {
    for (let k = 0; k + 1 < t.pts.length; k++) {
      const [ax, ay] = t.pts[k], [bx, by] = t.pts[k + 1];
      objs.push({ type: 'seg', layers: [t.layer], shape: { kind: 'seg', ax, ay, bx, by, r: t.w / 2 }, trace: ti, k, w: t.w });
    }
  });
  board.vias.forEach((v, vi) => objs.push({ type: 'via', layers: ['F', 'B'], shape: { kind: 'circle', x: v.x, y: v.y, r: FAB.via.dia / 2 }, via: vi }));
  return objs;
}
const share = (a, b) => a.layers.some(l => b.layers.includes(l));

/* ---------- analysis: islands, shorts, clearance, routing, placement ---------- */
export function analyze(project, board) {
  const objs = copperObjects(project, board), n = objs.length;
  const par = objs.map((_, i) => i), find = (i) => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; };
  const boxes = objs.map(o => bbox(o.shape)), adj = objs.map(() => []), near = [];
  const C = FAB.clearance;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const a = objs[i], b = objs[j]; if (!share(a, b)) continue;
    const A = boxes[i], B = boxes[j];
    if (A[0] > B[2] + C || B[0] > A[2] + C || A[1] > B[3] + C || B[1] > A[3] + C) continue;
    if (a.type === 'seg' && b.type === 'seg' && a.trace === b.trace && Math.abs(a.k - b.k) === 1) { par[find(i)] = find(j); adj[i].push(j); adj[j].push(i); continue; }
    const g = gap(a.shape, b.shape);
    if (g.d <= EPS) { par[find(i)] = find(j); adj[i].push(j); adj[j].push(i); }
    else if (g.d < C - EPS) near.push({ i, j, g });
  }
  const island = objs.map((_, i) => find(i)), ids = [...new Set(island)], idx = new Map(ids.map((r, k) => [r, k]));
  const isl = island.map(r => idx.get(r));
  const nets = ids.map(() => new Set());
  objs.forEach((o, i) => { if (o.type === 'pad' && o.net) nets[isl[i]].add(o.net); });
  const errors = [], warnings = [], W = board.w / 2, H = board.h / 2;

  // shorts: label copper outward from each pad and look for where two labels meet
  const label = objs.map(o => (o.type === 'pad' && o.net) ? o.net : null), queue = [];
  objs.forEach((o, i) => { if (label[i]) queue.push(i); });
  while (queue.length) { const i = queue.shift(); for (const j of adj[i]) if (!label[j]) { label[j] = label[i]; queue.push(j); } }
  const seenShort = new Set();
  for (let i = 0; i < n; i++) for (const j of adj[i]) {
    if (j < i || !label[i] || !label[j] || label[i] === label[j]) continue;
    const key = [label[i], label[j]].sort().join('|'); if (seenShort.has(key)) continue; seenShort.add(key);
    const g = gap(objs[i].shape, objs[j].shape);
    errors.push({ kind: 'short', msg: `Short: ${key.replace('|', ' touches ')}`, x: g.x, y: g.y, nets: key.split('|') });
  }
  // same part, pads of different nets bridged by the footprint itself cannot happen; now clearance
  const seenGap = new Set();
  for (const { i, j, g } of near) {
    if (isl[i] === isl[j]) continue;
    const A = nets[isl[i]], B = nets[isl[j]]; if ([...A].some(x => B.has(x))) continue;
    if (objs[i].type === 'pad' && objs[j].type === 'pad' && objs[i].part === objs[j].part) continue;   // pads inside one footprint follow its datasheet
    const key = [isl[i], isl[j]].sort().join('|') + '@' + Math.round(g.x * 2) + ',' + Math.round(g.y * 2); if (seenGap.has(key)) continue; seenGap.add(key);
    errors.push({ kind: 'clearance', msg: `Gap of ${g.d.toFixed(3)} mm is under the ${C} mm minimum`, x: g.x, y: g.y, d: g.d });
  }
  // tracks
  board.traces.forEach((t, ti) => { if (t.w < FAB.minTrace - 1e-9) errors.push({ kind: 'width', msg: `Track ${ti + 1} is ${t.w.toFixed(2)} mm wide, under the ${FAB.minTrace} mm minimum`, x: t.pts[0][0], y: t.pts[0][1] }); });
  // placement: parts on the board, clear of the edge and of each other
  const onBoard = {}, court = {};
  for (const part of project.parts) {
    const pl = board.place[part.id]; if (!pl) continue;
    const cy = courtyard(part, pl); court[part.id] = cy;
    const pads = objs.filter(o => o.type === 'pad' && o.part === part.id);
    const inside = pads.every(o => { const b = bbox(o.shape); return b[0] >= -W && b[2] <= W && b[1] >= -H && b[3] <= H; });
    onBoard[part.id] = inside && Math.abs(pl.x) <= W && Math.abs(pl.y) <= H;
    if (!onBoard[part.id]) errors.push({ kind: 'place', msg: `${part.id} is not on the board yet`, x: pl.x, y: pl.y, part: part.id });
  }
  const ids2 = Object.keys(court);
  for (let a = 0; a < ids2.length; a++) for (let b = a + 1; b < ids2.length; b++) {
    const A = court[ids2[a]], B = court[ids2[b]];
    if (A.x0 < B.x1 - 1e-6 && B.x0 < A.x1 - 1e-6 && A.y0 < B.y1 - 1e-6 && B.y0 < A.y1 - 1e-6)
      errors.push({ kind: 'overlap', msg: `${ids2[a]} and ${ids2[b]} are too close together`, x: (Math.max(A.x0, B.x0) + Math.min(A.x1, B.x1)) / 2, y: (Math.max(A.y0, B.y0) + Math.min(A.y1, B.y1)) / 2 });
  }
  // copper near the board edge (only for parts that are on the board, and all tracks and vias)
  objs.forEach((o) => {
    if (o.type === 'pad' && !onBoard[o.part]) return;
    const b = bbox(o.shape), m = Math.min(b[0] + W, W - b[2], b[1] + H, H - b[3]);
    if (m < FAB.edge - 1e-6) errors.push({ kind: 'edge', msg: m < 0 ? 'Copper runs off the board' : `Copper ${m.toFixed(2)} mm from the edge, under ${FAB.edge} mm`, x: Math.max(-W, Math.min(W, (b[0] + b[2]) / 2)), y: Math.max(-H, Math.min(H, (b[1] + b[3]) / 2)) });
  });
  // dangling track ends
  board.traces.forEach((t, ti) => {
    for (const end of [0, t.pts.length - 1]) {
      const [x, y] = t.pts[end];
      const ok = objs.some((o, i) => {
        if (o.type === 'seg' && o.trace === ti) return false;
        if (!o.layers.includes(t.layer)) return false;
        return inShape(o.shape, x, y, t.w / 2 + 1e-6);
      });
      if (!ok) warnings.push({ kind: 'dangle', msg: `Track ${ti + 1} ends in mid air`, x, y });
    }
  });
  // routing: which pads of each net are not joined yet, and the ratsnest to show them
  const byNet = {};
  objs.forEach((o, i) => { if (o.type === 'pad' && o.net) (byNet[o.net] = byNet[o.net] || []).push(i); });
  let unrouted = 0; const rats = [];
  for (const net in byNet) {
    const groups = new Map();
    for (const i of byNet[net]) { const k = isl[i]; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(i); }
    const G = [...groups.values()]; unrouted += G.length - 1;
    const inTree = [0];   // Prim over groups, closest pad pairs
    while (inTree.length < G.length) {
      let best = null;
      for (const a of inTree) for (let b = 0; b < G.length; b++) {
        if (inTree.includes(b)) continue;
        for (const i of G[a]) for (const j of G[b]) {
          const p = objs[i].shape, q = objs[j].shape, d = Math.hypot(p.x - q.x, p.y - q.y);
          if (!best || d < best.d) best = { d, b, line: [p.x, p.y, q.x, q.y, net] };
        }
      }
      inTree.push(best.b); rats.push(best.line);
    }
  }
  const allOn = project.parts.every(p => onBoard[p.id]);
  return { objs, isl, nets, errors, warnings, unrouted, rats, onBoard, allOn, pass: errors.length === 0 && unrouted === 0, islandCount: ids.length };
}
export const islandKey = (A, i) => 'I' + A.isl[i];
export function padIndex(A, part, pin) { return A.objs.findIndex(o => o.type === 'pad' && o.part === part && o.pin === String(pin)); }

/* ---------- current along the tracks ----------
   Each island becomes a little resistor network: track pieces conduct in
   proportion to width over length, pads and vias join the pieces that
   touch them. inj(i) gives the current a part pushes into pad i. */
export function trackFlow(A, inj) {
  const out = [], objs = A.objs;
  const byIsl = new Map();
  objs.forEach((o, i) => { if (!byIsl.has(A.isl[i])) byIsl.set(A.isl[i], []); byIsl.get(A.isl[i]).push(i); });
  for (const members of byIsl.values()) {
    const segs = members.filter(i => objs[i].type === 'seg'); if (!segs.length) continue;
    const V = [], vert = (x, y) => { for (let k = 0; k < V.length; k++) if (Math.abs(V[k][0] - x) < 1e-4 && Math.abs(V[k][1] - y) < 1e-4) return k; V.push([x, y]); return V.length - 1; };
    const E = [], big = 1e3;
    const nodeOf = new Map();   // pad or via object -> vertex at its centre
    for (const i of members) if (objs[i].type !== 'seg') nodeOf.set(i, vert(objs[i].shape.x, objs[i].shape.y));
    const chains = [];
    for (const i of segs) {
      const s = objs[i].shape, pts = [{ t: 0, v: vert(s.ax, s.ay) }, { t: 1, v: vert(s.bx, s.by) }];
      for (const j of members) {
        if (j === i) continue;
        const o = objs[j]; if (!share(o, objs[i])) continue;
        if (o.type === 'seg') {
          const q = o.shape;
          for (const [px, py] of [[q.ax, q.ay], [q.bx, q.by]]) {
            const k = segPt(s.ax, s.ay, s.bx, s.by, px, py);
            if (k.t > 1e-3 && k.t < 1 - 1e-3 && k.d <= s.r + q.r + 1e-6) { const v = vert(k.x, k.y); pts.push({ t: k.t, v }); E.push([v, vert(px, py), big, null]); }
          }
          const X = segInter(s, q); if (X && X.t > 1e-3 && X.t < 1 - 1e-3) pts.push({ t: X.t, v: vert(X.x, X.y) });
        } else {
          const c = o.shape, k = segPt(s.ax, s.ay, s.bx, s.by, c.x, c.y);
          if (gap(c, s).d <= 1e-6) {
            const endA = inShape(c, s.ax, s.ay, s.r), endB = inShape(c, s.bx, s.by, s.r);
            if (endA) E.push([pts[0].v, nodeOf.get(j), big, null]);
            if (endB) E.push([pts[1].v, nodeOf.get(j), big, null]);
            if (!endA && !endB) { const v = vert(k.x, k.y); pts.push({ t: k.t, v }); E.push([v, nodeOf.get(j), big, null]); }
          }
        }
      }
      pts.sort((a, b) => a.t - b.t);
      const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
      for (let k = 0; k + 1 < pts.length; k++) {
        const len = Math.max(1e-4, (pts[k + 1].t - pts[k].t) * L);
        if (pts[k].v !== pts[k + 1].v) E.push([pts[k].v, pts[k + 1].v, objs[i].w / len, i]);
      }
      chains.push(i);
    }
    // pads and vias touching each other in this island
    const nonSeg = members.filter(i => objs[i].type !== 'seg');
    for (let a = 0; a < nonSeg.length; a++) for (let b = a + 1; b < nonSeg.length; b++) {
      const oa = objs[nonSeg[a]], ob = objs[nonSeg[b]];
      if (share(oa, ob) && gap(oa.shape, ob.shape).d <= 1e-6) E.push([nodeOf.get(nonSeg[a]), nodeOf.get(nonSeg[b]), big, null]);
    }
    // solve G v = injections with a weak tie to ground at every vertex
    const N = V.length, M = new Float64Array(N * N), rhs = new Float64Array(N);
    for (const [a, b, g] of E) { M[a * N + a] += g; M[b * N + b] += g; M[a * N + b] -= g; M[b * N + a] -= g; }
    for (let k = 0; k < N; k++) M[k * N + k] += 1e-9;
    let tot = 0;
    for (const [i, v] of nodeOf) { const c = inj(i) || 0; rhs[v] += c; tot += c; }
    if (Math.abs(tot) > 1e-12) { const share0 = tot / nodeOf.size; for (const v of nodeOf.values()) rhs[v] -= share0; }
    const x = solveDense(M, rhs, N);
    for (const [a, b, g, seg] of E) if (seg !== null) out.push({ layer: objs[seg].layers[0], ax: V[a][0], ay: V[a][1], bx: V[b][0], by: V[b][1], I: g * (x[a] - x[b]), island: A.isl[seg] });
  }
  return out;
}
function solveDense(M, b, N) {
  const A = M, x = b;
  for (let k = 0; k < N; k++) {
    let p = k; for (let r = k + 1; r < N; r++) if (Math.abs(A[r * N + k]) > Math.abs(A[p * N + k])) p = r;
    if (p !== k) { for (let c = 0; c < N; c++) { const t = A[k * N + c]; A[k * N + c] = A[p * N + c]; A[p * N + c] = t; } const t = x[k]; x[k] = x[p]; x[p] = t; }
    const d = A[k * N + k] || 1e-18;
    for (let r = k + 1; r < N; r++) { const f = A[r * N + k] / d; if (!f) continue; for (let c = k; c < N; c++) A[r * N + c] -= f * A[k * N + c]; x[r] -= f * x[k]; }
  }
  for (let k = N - 1; k >= 0; k--) { let s = x[k]; for (let c = k + 1; c < N; c++) s -= A[k * N + c] * x[c]; x[k] = s / (A[k * N + k] || 1e-18); }
  return x;
}

/* ---------- IPC-2221 track sizing for outer layers ---------- */
export const IPC_K = 0.048;
export const areaMil2 = (wmm, oz) => (wmm / 0.0254) * (1.378 * oz);
export const ipcCurrent = (wmm, oz, dT = 10) => IPC_K * Math.pow(dT, 0.44) * Math.pow(areaMil2(wmm, oz), 0.725);
export const ipcRise = (I, wmm, oz) => Math.pow(I / (IPC_K * Math.pow(areaMil2(wmm, oz), 0.725)), 1 / 0.44);
export const ipcWidth = (I, oz, dT = 10) => Math.pow(I / (IPC_K * Math.pow(dT, 0.44)), 1 / 0.725) / (1.378 * oz) * 0.0254;
export const trackOhms = (Lmm, wmm, oz) => 1.72e-8 * (Lmm / 1000) / ((wmm / 1000) * (FAB.copperUm[oz] * 1e-6));

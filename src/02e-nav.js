// ---------------------------------------------------------------------------
// Navigation without the DOM: each town's junctions and the streets between
// them as a table of one-way pieces, and the route search over it (main
// streets first, few right turns, never a U-turn).
// Town coordinates (u, v). A direction's angle is atan2(dv, du); turning by
// +90 degrees is a left turn (traffic keeps left, so left turns are cheap).
// ---------------------------------------------------------------------------
const NAV_TURN = { left: 15, right: 60 }, NAV_SIDE = 1.4;
const _NAV_DIR = { 'u+': [1, 0], 'v+': [0, 1], 'u-': [-1, 0], 'v-': [0, -1] };
const _NAV_TEXT = {
  left: '左折', right: '右折', straight: '直進', gateLeft: '門は左', gateRight: '門は右', outLeft: '門を出て左', outRight: '門を出て右',
  plaza: '広場へ', arrive: '到着', etcIn: 'ETC 入口 20km/h 以下', etcOut: 'ETC 出口 20km/h 以下', ramp: '料金所 ETC は 20km/h 以下',
  merge: '本線へ合流　右', exit: '出口　左', dock: '荷台口にバックで（+20%）', bay: '納品の枠へ',
};
function navText(kind, name) { return kind === 'exitLane' ? `${name}IC 出口　左車線へ` : _NAV_TEXT[kind] || ''; }
// The turn from direction a to direction b (unit vectors): 'left', 'right', 'straight', or null (back the way it came).
function _navTurn(a, b) {
  const dot = a[0] * b[0] + a[1] * b[1];
  if (dot > 0.7) return 'straight';
  if (dot < -0.7) return null;
  return a[0] * b[1] - a[1] * b[0] > 0 ? 'left' : 'right';
}
const _navTurnCost = t => (t === 'left' ? NAV_TURN.left : t === 'right' ? NAV_TURN.right : 0);

// The junction table: { nodes, edges, out: node -> [edge ids], plaza } (edges are one-way; each street piece gives two).
// Ends of streets with no junction (closed at the town's edge) are left out. The plaza's mouth on Main A is a node of
// its own, joined both ways to Main A's first junction.
const _navG = new WeakMap();
function navGraph(L) {
  let G = _navG.get(L);
  if (G) return G;
  const nodes = L.nodes.map(n => ({ id: n.id, u: n.u, v: n.v })), edges = [], out = new Map();
  const add = (from, to, st) => {
    const a = nodes[from], b = nodes[to], du = b.u - a.u, dv = b.v - a.v;
    const e = { id: edges.length, from, to, street: st.id, dir: st.axis === 'v' ? (dv > 0 ? 'v+' : 'v-') : (du > 0 ? 'u+' : 'u-'),
      len: Math.hypot(du, dv), main: st.kind === 'main', a: [a.u, a.v], b: [b.u, b.v] };
    edges.push(e);
    if (!out.has(from)) out.set(from, []);
    out.get(from).push(e.id);
  };
  const A = L.streets.find(s => s.kind === 'main' && s.axis === 'v' && Math.abs(s.c) < 0.5);   // Main A: its start is the plaza's mouth
  for (const st of L.streets) {
    const along = n => (st.axis === 'v' ? n.v : n.u);
    const on = L.nodes.filter(n => n.streets.includes(st.id)).sort((p, q) => along(p) - along(q));
    for (let k = 1; k < on.length; k++) { add(on[k - 1].id, on[k].id, st); add(on[k].id, on[k - 1].id, st); }
    // a dead end beyond the last junction is kept only when a warehouse gate is on it (the yard is the way out)
    if (!on.length) continue;
    for (const [end, near] of [[st.a0, on[0]], [st.a1, on[on.length - 1]]]) {
      if (st === A && end === st.a0) continue;
      const lo = Math.min(end, along(near)), hi = Math.max(end, along(near));
      if (Math.abs(end - along(near)) < 1 || !(L.warehouses || []).some(w => w.street === st.id && (st.axis === 'v' ? w.gate.v : w.gate.u) > lo && (st.axis === 'v' ? w.gate.v : w.gate.u) < hi)) continue;
      const id = nodes.length; nodes.push(st.axis === 'v' ? { id, u: st.c, v: end } : { id, u: end, v: st.c });
      add(near.id, id, st); add(id, near.id, st);
    }
  }
  let plaza = null;
  const first = A && L.nodes.filter(n => n.streets.includes(A.id)).sort((p, q) => p.v - q.v)[0];
  if (first) { plaza = nodes.length; nodes.push({ id: plaza, u: A.c, v: A.a0 }); add(plaza, first.id, A); add(first.id, plaza, A); }
  G = { nodes, edges, out, plaza };
  _navG.set(L, G);
  return G;
}

const _navFac = e => (e.main ? 1 : NAV_SIDE);
// Where a gate sits on an edge: its distance from the edge's start (or -1 if not on it), and whether it is on the left.
function _navGateOn(L, e, w) {
  if (e.street !== w.street) return -1;
  const st = L.streets[e.street], k = st.axis === 'v' ? 1 : 0, t = k ? w.gate.v : w.gate.u;
  const lo = Math.min(e.a[k], e.b[k]), hi = Math.max(e.a[k], e.b[k]);
  return t < lo - 0.01 || t > hi + 0.01 ? -1 : Math.abs(t - e.a[k]);
}
function _navGateLeft(e, w) { const d = _NAV_DIR[e.dir]; return -d[1] * w.gate.nu + d[0] * w.gate.nv > 0; }
function _navPt(e, d) { const k = d / (e.len || 1); return [e.a[0] + (e.b[0] - e.a[0]) * k, e.a[1] + (e.b[1] - e.a[1]) * k]; }

// The best route from `from` ({ edge, d } | { gate } | { plaza: true, start: true }) to `to` ({ gate } | { plaza: true }):
// { edges, cost, steps: [{ kind, at, edge, dist }] } (turns and the end only), or null when there is none.
function navRoute(L, from, to) {
  const G = navGraph(L), E = G.edges, n = E.length;
  if (!n) return null;
  // seeds: [edge, offset along it where the rig starts, extra cost before it, first step (leaving a gate) or null]
  const seeds = [];
  if (from.plaza) { const id = G.plaza == null ? -1 : G.out.get(G.plaza)[0]; if (id < 0) return null; seeds.push([id, 0, 0, null]); }
  else if (from.gate) {
    const w = from.gate, back = [-w.gate.nu, -w.gate.nv];
    for (const e of E) {
      const t = _navGateOn(L, e, w);
      if (t < 0) continue;
      const turn = _navTurn(back, _NAV_DIR[e.dir]);
      if (turn !== 'left' && turn !== 'right') continue;
      seeds.push([e.id, t, _navTurnCost(turn), { kind: turn === 'left' ? 'outLeft' : 'outRight', at: _navPt(e, t), edge: e.id }]);
    }
  } else if (from.edge != null && E[from.edge]) seeds.push([from.edge, clamp(from.d, 0, E[from.edge].len), 0, null]);
  if (!seeds.length) return null;

  // best[e]: cost of having driven all of edge e (standing at its end, facing along it)
  const best = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), seedOf = new Int32Array(n).fill(-1), done = new Uint8Array(n);
  let fin = { cost: Infinity };
  // reaching the target while on edge e, having stood at offset d0 on it with cost c0 so far
  const tryEnd = (e, d0, c0, via, seed) => {
    if (to.gate) {
      const t = _navGateOn(L, e, to.gate);
      if (t >= d0 - 0.01) {
        const left = _navGateLeft(e, to.gate), c = c0 + (t - d0) * _navFac(e) + (left ? NAV_TURN.left : NAV_TURN.right);
        if (c < fin.cost) fin = { cost: c, edge: e.id, via, seed, d: t, kind: left ? 'gateLeft' : 'gateRight', at: _navPt(e, t) };
      }
    } else if (to.plaza && e.to === G.plaza) {
      const c = c0 + (e.len - d0) * _navFac(e);
      if (c < fin.cost) fin = { cost: c, edge: e.id, via, seed, d: e.len, kind: 'plaza', at: e.b.slice() };
    }
  };
  seeds.forEach(([id, d0, c0], k) => {
    const e = E[id];
    tryEnd(e, d0, c0, -1, k);
    const c = c0 + (e.len - d0) * _navFac(e);
    if (c < best[id]) { best[id] = c; prev[id] = -1; seedOf[id] = k; }
  });
  for (;;) {
    let e = -1, bc = Infinity;
    for (let i = 0; i < n; i++) if (!done[i] && best[i] < bc) { bc = best[i]; e = i; }
    if (e < 0 || bc >= fin.cost) break;
    done[e] = 1;
    const de = _NAV_DIR[E[e].dir];
    for (const f of G.out.get(E[e].to) || []) {
      const turn = _navTurn(de, _NAV_DIR[E[f].dir]);
      if (!turn) continue;
      const c0 = bc + _navTurnCost(turn);
      tryEnd(E[f], 0, c0, e, -1);
      const c = c0 + E[f].len * _navFac(E[f]);
      if (c < best[f]) { best[f] = c; prev[f] = e; seedOf[f] = seedOf[e]; }
    }
  }
  if (fin.cost === Infinity) return null;

  // the edges driven, first to last
  const chain = [];
  for (let e = fin.via; e >= 0; e = prev[e]) chain.unshift(e);
  const seedK = fin.via >= 0 ? seedOf[chain[0]] : fin.seed, seed = seeds[seedK], edges = fin.via >= 0 ? [...chain, fin.edge] : [fin.edge];
  const steps = [];
  if (seed[3]) steps.push({ ...seed[3], dist: 0 });
  let dist = 0;
  for (let k = 0; k < edges.length; k++) {
    const e = E[edges[k]], d0 = k === 0 ? seed[1] : 0;
    if (k === edges.length - 1) { dist += fin.d - d0; break; }
    dist += e.len - d0;
    const turn = _navTurn(_NAV_DIR[e.dir], _NAV_DIR[E[edges[k + 1]].dir]);
    if (turn !== 'straight') steps.push({ kind: turn, at: e.b.slice(), edge: e.id, dist });
  }
  steps.push({ kind: fin.kind, at: fin.at, edge: fin.edge, dist });
  return { edges, cost: fin.cost, steps };
}

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
  merge: '本線へ合流　右', exit: '出口　左', dock: '荷台口にバックで（+20%）', bay: '納品の枠へ', wrongRamp: '目的地ではない出口です',
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
  // where each edge starts, as distance along the route from the start (the first edge starts before it)
  const starts = [-seed[1]];
  for (let k = 1; k < edges.length; k++) starts.push(starts[k - 1] + E[edges[k - 1]].len);
  return { edges, cost: fin.cost, steps, starts };
}

// ---- where the rig is, what to do next, and when to look for a new route ----
const _navHt = st => st.lanes * st.laneW + st.walkW;   // half a street's width with its pavements
const _NAV_ANG = { 'u+': 0, 'v+': Math.PI / 2, 'u-': Math.PI, 'v-': -Math.PI / 2 };
// The street piece under a town point heading θ: { edge, d, off }. In a junction (two streets' widths), off the streets,
// or heading across the street, the previous answer stands (prev, or null).
function navMatch(L, u, v, θ, prev) {
  const G = navGraph(L);
  let st = null, n = 0;
  for (const s of L.streets) {
    const h = _navHt(s), inside = s.axis === 'v' ? Math.abs(u - s.c) <= h && v >= s.a0 && v <= s.a1 : Math.abs(v - s.c) <= h && u >= s.a0 && u <= s.a1;
    if (inside) { st = s; n++; }
  }
  if (n !== 1) return prev || null;
  const k = st.axis === 'v' ? 1 : 0, t = k ? v : u;
  for (const e of G.edges) {
    if (e.street !== st.id) continue;
    if (t < Math.min(e.a[k], e.b[k]) - 0.01 || t > Math.max(e.a[k], e.b[k]) + 0.01) continue;
    if (Math.abs(wrapA(θ - _NAV_ANG[e.dir])) >= Math.PI / 3) continue;
    return { edge: e.id, d: Math.abs(t - e.a[k]), off: Math.abs((k ? u : v) - st.c) };
  }
  return prev || null;
}
const _NAV_LEFTISH = { left: 1, gateLeft: 1, outLeft: 1, plaza: 1 }, _NAV_RIGHTISH = { right: 1, gateRight: 1, outRight: 1 };
// Where `match` is along `route`: { k (which visit of its street piece), pos (route distance) }, or null. A route can
// use a piece twice (from past a gate round the block and back to it): the first visit counts only from where it began.
function _navPos(route, match) {
  for (let k = 0; k < route.edges.length; k++) {
    if (route.edges[k] !== match.edge || (k === 0 && match.d < -route.starts[0] - 0.5)) continue;
    return { k, pos: route.starts[k] + match.d };
  }
  return null;
}
// The rest of `route` as town points: from `match` (or from the route's start) through the junctions to its end.
function navRoutePoly(L, route, match) {
  const E = navGraph(L).edges, at = match ? _navPos(route, match) : { k: 0, pos: 0 };
  if (!at) return null;
  const e0 = E[route.edges[at.k]], d = at.pos - route.starts[at.k], f = d / (e0.len || 1);
  const pts = [[e0.a[0] + (e0.b[0] - e0.a[0]) * f, e0.a[1] + (e0.b[1] - e0.a[1]) * f]];
  for (let i = at.k; i < route.edges.length - 1; i++) pts.push(E[route.edges[i]].b.slice());
  pts.push(route.steps.at(-1).at.slice());
  return pts;
}
// The next thing to do along `route` from `match`: { kind, dist, then, lanes }, or null when the rig is not on the route.
function navGuide(L, route, match) {
  if (!route || !match) return null;
  const at = _navPos(route, match);
  if (!at) return null;
  const pos = at.pos, steps = route.steps;
  let i = 0;
  while (i < steps.length - 1 && steps[i].dist <= pos + 0.5) i++;
  const s = steps[i], last = i === steps.length - 1, dist = Math.max(0, s.dist - pos);
  let kind = s.kind, then = null;
  if (last && dist < 8) kind = 'arrive';
  else if (dist > 300) kind = 'straight';
  else if (!last && steps[i + 1].dist - s.dist <= 60) then = { kind: steps[i + 1].kind, dist: steps[i + 1].dist - pos };
  const st = L.streets[navGraph(L).edges[match.edge].street];
  const lanes = st.kind === 'main' && st.lanes >= 2
    ? [{ arrows: ['left', 'straight'], use: !_NAV_RIGHTISH[kind] }, { arrows: ['straight', 'right'], use: !_NAV_LEFTISH[kind] }] : null;
  return { kind, dist, then, lanes };
}
// Follow the rig along T.route ({ route, to, match, offT, backD, lastT, t }); 'reroute' when a new route was made from
// where it is: on a street not on the route (5 m in), 15 m the wrong way along the route, or 20 m off it for 2 s.
function navFollow(L, T, u, v, θ, dt) {
  T.t += dt;
  const G = navGraph(L), E = G.edges, prev = T.match, m = navMatch(L, u, v, θ, prev);
  T.match = m;
  if (!T.route) return null;
  const on = new Set(T.route.edges);
  let off = Infinity;
  for (const id of on) {   // distance to the route's nearest piece
    const e = E[id], du = e.b[0] - e.a[0], dv = e.b[1] - e.a[1], q = clamp(((u - e.a[0]) * du + (v - e.a[1]) * dv) / (du * du + dv * dv || 1), 0, 1);
    off = Math.min(off, Math.hypot(e.a[0] + du * q - u, e.a[1] + dv * q - v));
  }
  T.offT = off > 20 ? T.offT + dt : 0;
  let why = false;
  if (m && !on.has(m.edge)) {
    const e = E[m.edge], back = T.route.edges.some(id => E[id].from === e.to && E[id].to === e.from);
    if (back) { if (prev && prev.edge === m.edge) T.backD += Math.max(0, m.d - prev.d); why = T.backD >= 15; }
    else why = m.d > 5;
  } else T.backD = 0;
  if (T.offT >= 2) why = true;
  if (!why || T.t - T.lastT < 3 || !m) return null;
  const r = navRoute(L, { edge: m.edge, d: m.d }, T.to);
  if (!r) return null;
  const at = _navPos(T.route, m), rest = at ? T.route.edges.slice(at.k) : null;   // what was still ahead on the old route
  const same = !!rest && r.edges.length === rest.length && r.edges.every((e, i) => e === rest[i]);
  T.lastT = T.t; T.offT = 0; T.backD = 0;
  if (same) return null;   // off the streets (a yard, a dead end): the way from where it last was has not changed
  T.route = r;
  return 'reroute';
}

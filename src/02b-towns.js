// ---------------------------------------------------------------------------
// Towns behind the interchanges (data only, no DOM): where each town is, its
// streets, junctions, blocks, warehouses, buildings and fences, and the lanes
// the town traffic follows. Town coordinates: u along the expressway at the
// toll plaza (westbound positive), v away from it to the left. Metres, true
// scale (the expressway itself is 1:10 in distance).
// ---------------------------------------------------------------------------
const TOWN_CELL = 0.5, TOWN_U0 = -300, TOWN_V0 = -8, TOWN_NU = 1200, TOWN_NV = 826;
const TCELL = { OUT: 0, ROAD: 1, WALK: 2, YARD: 3, WALL: 4 };
const TOWN_CORNER_R = 12;          // kerb radius at the junction corners
const TOWN_CLEAR = 42.8 + 15;      // town things stay this far left of the road centre (ramp edge + 15 m)
const TOWN_STREET = {
  main: { lanes: 2, laneW: 3.25, walkW: 3.5, limit: 50 },
  side: { lanes: 1, laneW: 3.0, walkW: 2.5, limit: 40 },
};
const TOWN_WH_NAMES = ['物流センター', '配送センター', '倉庫'];

function townSite(i) {
  const ic = ICS[i], s = ic.s + 125, p = posAt(s, -40, {}), hu = p.h;
  return { i, ic, s, ox: p.x, oz: p.z, y0: elevAt(s), hu, Fx: Math.sin(hu), Fz: Math.cos(hu), Lx: Math.cos(hu), Lz: -Math.sin(hu), exit: i > 0, entry: i < ICS.length - 1 };
}
const TOWN_SITES = ICS.map((ic, i) => townSite(i));
function townUV(site, x, z, out) {
  const dx = x - site.ox, dz = z - site.oz;
  out.u = dx * site.Fx + dz * site.Fz; out.v = dx * site.Lx + dz * site.Lz;
  return out;
}
function townXZ(site, u, v, out) {
  out.x = site.ox + u * site.Fx + v * site.Lx; out.z = site.oz + u * site.Fz + v * site.Lz;
  return out;
}
function townInside(u, v) {
  return Math.abs(u) <= 300 && v <= 405 && (v >= 5 || (Math.abs(u) <= 60 && v >= -8));
}
// Ground height: the road's height along the front edge, rising (or falling) to the plaza's height by v = 60.
function townHeight(site, u, v) {
  return lerp(elevAt(site.s + u), site.y0, smooth(5, 60, v));
}

const _twq = {}, _twp = {};
// how far left of the road centre a town point lies (negative: left)
function townLat(site, u, v) {
  townXZ(site, u, v, _twq);
  return project(_twq.x, _twq.z, Math.max(0, Math.floor((site.s + u) / DS)), _twp).lat;
}
// the smallest v (>= 20) at u where town things are clear of the road and its ramps
function townClearV(site, u) {
  let v = 20;
  while (v < 120 && townLat(site, u, v) > -TOWN_CLEAR - 1) v += 1;
  return v;
}

const _hc = st => st.lanes * st.laneW, _ht = st => st.lanes * st.laneW + st.walkW;
// lane k's distance from the centre line (k = 0: the left-most lane, by the kerb)
const _lo = (st, k) => (st.lanes - 0.5 - k) * st.laneW;
// a point on street st at position a along it, for travel direction dir and lane k (left-hand traffic)
function _lanePt(st, a, dir, k) {
  const o = _lo(st, k);
  return st.axis === 'v' ? [st.c - dir * o, a] : [a, st.c + dir * o];
}
function _len(pts) { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; }
function _bez(p0, p1, p2, n = 8) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; out.push([a * p0[0] + b * p1[0] + c * p2[0], a * p0[1] + b * p1[1] + c * p2[1]]); }
  return out;
}
function _arc(cu, cv, r, t0, t1, n = 12) {
  const out = [];
  for (let i = 0; i <= n; i++) { const t = t0 + (t1 - t0) * i / n; out.push([cu + r * Math.cos(t), cv + r * Math.sin(t)]); }
  return out;
}
// travel direction as a unit (u, v) vector: 'v+' 'v-' 'u+' 'u-'
const _DIRV = { 'v+': [0, 1], 'v-': [0, -1], 'u+': [1, 0], 'u-': [-1, 0] };
// exits from a junction for each way in: straight, left, right (left of (du, dv) is (-dv, du))
const _TURNS = { 'v+': { straight: 'v+', left: 'u-', right: 'u+' }, 'v-': { straight: 'v-', left: 'u+', right: 'u-' },
  'u+': { straight: 'u+', left: 'v+', right: 'v-' }, 'u-': { straight: 'u-', left: 'v-', right: 'v+' } };

function townLayout(i) {
  const site = TOWN_SITES[i], R = rng(9001 + 101 * i), town = regionAt(site.ic.s, {}).town;
  const streets = [], nodes = [], lanes = [], blocks = [], warehouses = [], buildings = [], fences = [];
  const addStreet = (kind, axis, c, a0, a1) => { const st = { id: streets.length, kind, axis, c, a0, a1, ...TOWN_STREET[kind] }; streets.push(st); return st; };

  // ---- streets ----
  const v1 = 115 + 15 * R(), v2 = v1 + 118 + 10 * R(), v3 = v2 + 105 + 10 * R();
  const pm = R(), pk = Math.floor(R() * 3);
  const A = addStreet('main', 'v', 0, 45, v3);
  const cross = [v1, v2, v3].map((c, k) => addStreet(k === pk && pm < 0.6 ? 'main' : 'side', 'u', c, -292, 292));
  for (const sgn of [-1, 1]) addStreet('side', 'v', sgn * (135 + (R() - 0.5) * 20), v1, v3);
  for (const sgn of [-1, 1]) { const p = R(), off = 255 + (R() - 0.5) * 20; if (p < 0.5) addStreet('side', 'v', sgn * off, v1, v3); }
  const vStreets = streets.filter(s => s.axis === 'v');

  // ---- junctions ----
  for (const V of vStreets) for (const U of cross) {
    if (U.c < V.a0 - 0.01 || U.c > V.a1 + 0.01 || V.c < U.a0 || V.c > U.a1) continue;
    const signal = V.kind === 'main' || U.kind === 'main';
    nodes.push({ id: nodes.length, u: V.c, v: U.c, streets: [V.id, U.id], signal, stop: !signal, phase: Math.floor(R() * 70),
      arms: { 'v+': V.a1 > U.c + 0.01, 'v-': V.a0 < U.c - 0.01, 'u+': U.a1 > V.c, 'u-': U.a0 < V.c } });
  }

  // ---- lanes along the streets, junction to junction ----
  const addLane = o => { const l = { id: lanes.length, next: [], turn: null, stopD: null, stopNode: null, stopAxis: null, edge0: false, edge1: false, plaza: false, node0: null, node1: null, ...o }; l.len = _len(l.pts); lanes.push(l); return l; };
  const outLane = new Map();   // `${node}:${dir}:${k}` → the lane leaving that junction that way
  const inLanes = [];          // lanes that end at a junction
  for (const st of streets) {
    const here = nodes.filter(n => n.streets.includes(st.id)).sort((a, b) => (st.axis === 'v' ? a.v - b.v : a.u - b.u));
    const pos = n => (st.axis === 'v' ? n.v : n.u);
    const cross_ = n => streets[n.streets.find(id => id !== st.id)];
    const stations = [];
    if (!here.length || pos(here[0]) > st.a0 + 0.01) stations.push({ a: st.a0, node: null, ko: st === A ? 0 : 3 });
    for (const n of here) stations.push({ a: pos(n), node: n, ko: _hc(cross_(n)) + 5 });
    if (!here.length || pos(here[here.length - 1]) < st.a1 - 0.01) stations.push({ a: st.a1, node: null, ko: st === A ? 0 : 3 });
    for (let j = 0; j + 1 < stations.length; j++) {
      const p = stations[j], q = stations[j + 1], a0 = p.a + p.ko, a1 = q.a - q.ko;
      if (a1 - a0 < 2) continue;
      for (const dir of [1, -1]) for (let k = 0; k < st.lanes; k++) {
        const [s0, s1] = dir > 0 ? [p, q] : [q, p], from = dir > 0 ? a0 : a1, to = dir > 0 ? a1 : a0;
        const d = (st.axis === 'v' ? 'v' : 'u') + (dir > 0 ? '+' : '-');
        const l = addLane({ pts: [_lanePt(st, from, dir, k), _lanePt(st, to, dir, k)], street: st.id, limit: st.limit, k, dir: d,
          node0: s0.node ? s0.node.id : null, node1: s1.node ? s1.node.id : null, edge0: !s0.node, edge1: !s1.node });
        if (s1.node && (s1.node.signal || s1.node.stop)) { l.stopD = l.len; l.stopNode = s1.node.id; l.stopAxis = st.axis; }
        if (s0.node) outLane.set(`${s0.node.id}:${d}:${k}`, l);
        if (s1.node) inLanes.push(l);
      }
    }
  }
  // ---- turns inside the junctions ----
  const lineX = (p, d, q, e) => {   // where the line through p along d meets the line through q along e
    const den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  };
  for (const l of inLanes) {
    const n = nodes[l.node1], st = streets[l.street];
    for (const turn of ['straight', 'left', 'right']) {
      const d = _TURNS[l.dir][turn];
      if (!n.arms[d]) continue;
      const toSt = streets[n.streets.find(id => streets[id].axis === d[0])];
      if (turn === 'left' && l.k !== 0) continue;
      if (turn === 'right' && l.k !== st.lanes - 1) continue;
      const k2 = turn === 'straight' ? Math.min(l.k, toSt.lanes - 1) : turn === 'left' ? 0 : toSt.lanes - 1;
      const out = outLane.get(`${n.id}:${d}:${k2}`);
      if (!out) continue;
      const p0 = l.pts[l.pts.length - 1], p2 = out.pts[0];
      const ctl = turn === 'straight' ? null : lineX(p0, _DIRV[l.dir], p2, _DIRV[d]);
      const pts = ctl ? _bez(p0, ctl, p2) : [p0, p2];
      const c = addLane({ pts, street: null, limit: Math.min(st.limit, toSt.limit), k: k2, dir: d, turn, node0: n.id, node1: n.id });
      c.next.push(out.id); l.next.push(c.id);
    }
  }
  // ---- the toll plaza's roads: exit from the ramp end (u = -25, v = 0), entrance to the ramp start (u = 25, v = 0) ----
  const plaza = { exitPath: null, entryPath: null, exitLane: null, entryLane: null,
    gates: { exit: { u: -5, v: 30, dir: 1, state: 'closed', open: 0 }, entry: { u: 5, v: 30, dir: -1, state: 'closed', open: 0 } } };
  const aStart = (dir, k) => lanes.find(l => l.street === A.id && l.dir === dir && l.k === k && (dir === 'v+' ? l.edge0 : l.edge1));
  if (site.exit) {
    plaza.exitPath = [[-60, 0], ..._arc(-25, 20, 20, -Math.PI / 2, 0), [-5, 45]];
    const l = addLane({ pts: plaza.exitPath, street: null, limit: 20, k: 0, dir: 'v+', plaza: true });
    const to = aStart('v+', 0); if (to) l.next.push(to.id);
    plaza.exitLane = l.id;
  }
  if (site.entry) {
    plaza.entryPath = [[5, 45], ..._arc(25, 20, 20, Math.PI, 1.5 * Math.PI), [60, 0]];
    const l = addLane({ pts: plaza.entryPath, street: null, limit: 20, k: 0, dir: 'u+', plaza: true });
    const from = aStart('v-', 0); if (from) from.next.push(l.id);
    plaza.entryLane = l.id;
  }

  // ---- blocks ----
  const rows = [[20, v1 - _ht(cross[0])], [v1 + _ht(cross[0]), v2 - _ht(cross[1])], [v2 + _ht(cross[1]), v3 - _ht(cross[2])], [v3 + _ht(cross[2]), 403]];
  rows.forEach(([r0, r1], row) => {
    const splits = vStreets.filter(V => row === 0 ? V === A : row === 3 ? false : V.a0 <= r0 && V.a1 >= r1).sort((a, b) => a.c - b.c);
    const edges = [[-298, 0], ...splits.map(V => [V.c, _ht(V)]), [298, 0]];
    for (let j = 0; j + 1 < edges.length; j++) {
      const u0 = edges[j][0] + edges[j][1], u1 = edges[j + 1][0] - edges[j + 1][1];
      let pieces = [{ u0, u1, v0: r0, v1: r1 }];
      if (row === 0) {   // keep the plaza (|u| < 50, v < 45) open
        pieces = [];
        const out = u0 >= 0 ? { a: Math.max(u0, 50), b: u1 } : { a: u0, b: Math.min(u1, -50) };
        if (out.b - out.a > 0) pieces.push({ u0: out.a, u1: out.b, v0: r0, v1: r1 });
        const inn = u0 >= 0 ? { a: u0, b: Math.min(u1, 50) } : { a: Math.max(u0, -50), b: u1 };
        if (inn.b - inn.a > 0) pieces.push({ u0: inn.a, u1: inn.b, v0: 45, v1: r1 });
      }
      for (const b of pieces) {
        let cv = b.v0;
        for (let u = b.u0; u <= b.u1 + 0.01; u += Math.max(1, (b.u1 - b.u0) / 12)) cv = Math.max(cv, townClearV(site, Math.min(u, b.u1)));
        b.v0 = cv;
        if (b.u1 - b.u0 <= 1 || b.v1 - b.v0 <= 1) continue;
        blocks.push({ ...b, row, use: Math.min(b.u1 - b.u0, b.v1 - b.v0) < 30 ? 'park' : 'houses' });
      }
    }
  });

  // ---- warehouses in the middle row ----
  const streetAt = (side, b) => {   // the street a block edge faces, or null
    if (side === 'v0' || side === 'v1') {
      const c = side === 'v0' ? b.v0 : b.v1;
      return cross.find(U => Math.abs((side === 'v0' ? U.c + _ht(U) : U.c - _ht(U)) - c) < 0.5) || null;
    }
    const c = side === 'u0' ? b.u0 : b.u1;
    return vStreets.find(V => Math.abs((side === 'u0' ? V.c + _ht(V) : V.c - _ht(V)) - c) < 0.5 && V.a0 <= b.v0 && V.a1 >= b.v1) || null;
  };
  const cands = blocks.filter(b => b.row === 1 && b.u1 - b.u0 >= 90 && b.v1 - b.v0 >= 97)
    .map(b => ({ b, key: Math.abs((b.u0 + b.u1) / 2) + R() * 40 })).sort((x, y) => x.key - y.key).map(x => x.b);
  const nWh = Math.min(cands.length, 2 + (R() < 0.5 ? 1 : 0));
  for (let k = 0; k < nWh; k++) {
    const b = cands[k]; b.use = 'warehouse';
    const rank = side => { const st = streetAt(side, b); return st ? (st.kind === 'main' ? 2 : 1) + (side === 'v0' ? 0.2 : 0) + (st === A ? 0.1 : 0) : -1; };
    const side = ['v0', 'v1', 'u0', 'u1'].sort((x, y) => rank(y) - rank(x))[0];
    const st = streetAt(side, b);
    // the gate's frame: g on the edge, e inward, lft across (left as you drive in), D deep, W wide
    const e = { v0: [0, 1], v1: [0, -1], u0: [1, 0], u1: [-1, 0] }[side], lft = [-e[1], e[0]];
    const g = side === 'v0' ? [(b.u0 + b.u1) / 2, b.v0] : side === 'v1' ? [(b.u0 + b.u1) / 2, b.v1] : side === 'u0' ? [b.u0, (b.v0 + b.v1) / 2] : [b.u1, (b.v0 + b.v1) / 2];
    const D = side[0] === 'v' ? b.v1 - b.v0 : b.u1 - b.u0, W = side[0] === 'v' ? b.u1 - b.u0 : b.v1 - b.v0;
    const P = (bb, x) => [g[0] + bb * e[0] + x * lft[0], g[1] + bb * e[1] + x * lft[1]];
    const rect = (b0, b1, x0, x1) => { const p = P(b0, x0), q = P(b1, x1); return { u0: Math.min(p[0], q[0]), u1: Math.max(p[0], q[0]), v0: Math.min(p[1], q[1]), v1: Math.max(p[1], q[1]) }; };
    const yard = rect(1, D - 26, -W / 2 + 1, W / 2 - 1), bld = rect(D - 26, D - 1, -W / 2 + 8, W / 2 - 8);
    const bw = W - 16, nd = clamp(Math.floor((bw - 10) / 4.5), 4, 6);
    const docks = []; for (let j = 0; j < nd; j++) { const p = P(D - 26, (j - (nd - 1) / 2) * 4.5); docks.push({ u: p[0], v: p[1], nu: -e[0], nv: -e[1] }); }
    const bay = P(20, W / 2 - 9), park = P(31, -(W / 2 - 11));
    const along = st.axis === 'v' ? g[1] : g[0];
    const gateLanes = lanes.filter(l => l.street === st.id && !l.turn && Math.min(...l.pts.map(p => (st.axis === 'v' ? p[1] : p[0]))) <= along && Math.max(...l.pts.map(p => (st.axis === 'v' ? p[1] : p[0]))) >= along).map(l => l.id);
    warehouses.push({ id: k, name: site.ic.jp + TOWN_WH_NAMES[k], block: blocks.indexOf(b), street: st.id, gate: { u: g[0], v: g[1], nu: e[0], nv: e[1], w: 14 }, yard, building: bld, docks,
      bay: { u: bay[0], v: bay[1], hu: e[0], hv: e[1] }, park: { u: park[0], v: park[1], hu: -e[0], hv: -e[1] }, gateLanes });
    buildings.push({ u: (bld.u0 + bld.u1) / 2, v: (bld.v0 + bld.v1) / 2, w: bld.u1 - bld.u0, d: bld.v1 - bld.v0, h: 10, rot: 0, kind: 'warehouse', wh: k });
    // the yard wall, open for 14 m at the gate
    const a = P(1, -W / 2 + 1), c = P(1, W / 2 - 1), d2 = P(D - 1, W / 2 - 1), f = P(D - 1, -W / 2 + 1), gl = P(1, -7), gr = P(1, 7);
    for (const [p, q] of [[a, gl], [gr, c], [c, d2], [d2, f], [f, a]]) fences.push({ u0: p[0], v0: p[1], u1: q[0], v1: q[1], kind: 'wall' });
  }

  // ---- buildings and hedges in the other blocks ----
  const boxes = buildings.map(b => ({ u0: b.u - b.w / 2, u1: b.u + b.w / 2, v0: b.v - b.d / 2, v1: b.v + b.d / 2 }));
  const free = (B, m) => boxes.every(o => !(B.u0 < o.u1 + m && o.u0 < B.u1 + m && B.v0 < o.v1 + m && o.v0 < B.v1 + m));
  const clear = B => [[B.u0, B.v0], [B.u1, B.v0], [B.u1, B.v1], [B.u0, B.v1]].every(([u, v]) => townLat(site, u, v) <= -TOWN_CLEAR);
  for (const b of blocks) {
    if (b.use === 'warehouse') continue;
    for (const side of ['v0', 'v1', 'u0', 'u1']) {   // hedges along the block's edges, kept clear of the rounded corners
      const horiz = side[0] === 'v', c = b[side], t0 = (horiz ? b.u0 : b.v0) + 14, t1 = (horiz ? b.u1 : b.v1) - 14;
      if (t1 - t0 > 2) fences.push(horiz ? { u0: t0, v0: c, u1: t1, v1: c, kind: 'hedge' } : { u0: c, v0: t0, u1: c, v1: t1, kind: 'hedge' });
    }
    if (b.use !== 'houses') continue;
    for (const side of ['v0', 'v1', 'u0', 'u1']) {
      const horiz = side[0] === 'v', st = streetAt(side, b), inward = side.endsWith('0') ? 1 : -1;
      const len = horiz ? b.u1 - b.u0 : b.v1 - b.v0, deep = horiz ? b.v1 - b.v0 : b.u1 - b.u0;
      for (let row = 0; row < (deep >= 60 ? 2 : 1); row++) {
        let t = 14;
        while (t < len - 14) {
          const rk = R(); let lw = 10 + 4 * R(), dd = 8 + 4 * R(), h = 6 + 3 * R(), kind = 'house';
          const sb = 1 + 2 * R(), gap = 1.5 + 1.5 * R();
          if (st && st.kind === 'main' && rk < 0.4) { kind = 'shop'; h = 4 + 2 * R(); }
          else if (town >= 0.6 && rk >= 0.4 && rk < 0.6) { kind = 'apartment'; lw = 14 + 6 * R(); dd = 10 + 4 * R(); h = 12 + 18 * R(); }
          else if (rk > 0.9) { kind = 'factory'; lw = 24 + 12 * R(); dd = 18 + 6 * R(); h = 8 + 4 * R(); }
          if (t + lw > len - 14) break;
          const off = sb + row * 18;          // a second row stands behind the first
          const a0 = (horiz ? b.u0 : b.v0) + t, n0 = b[side] + inward * off, n1 = n0 + inward * dd;
          const B = horiz ? { u0: a0, u1: a0 + lw, v0: Math.min(n0, n1), v1: Math.max(n0, n1) } : { v0: a0, v1: a0 + lw, u0: Math.min(n0, n1), u1: Math.max(n0, n1) };
          if (B.u0 >= b.u0 + 1 && B.u1 <= b.u1 - 1 && B.v0 >= b.v0 + 1 && B.v1 <= b.v1 - 1 && free(B, 1.5) && clear(B)) {
            boxes.push(B);
            buildings.push({ u: (B.u0 + B.u1) / 2, v: (B.v0 + B.v1) / 2, w: B.u1 - B.u0, d: B.v1 - B.v0, h, rot: 0, kind });
          }
          t += lw + gap;
        }
      }
    }
  }
  // ---- closures across the cross streets' ends ----
  for (const U of cross) for (const sgn of [-1, 1]) fences.push({ u0: sgn * 292, v0: U.c - _ht(U), u1: sgn * 292, v1: U.c + _ht(U), kind: 'closure' });

  return { site, streets, nodes, blocks, warehouses, buildings, fences, lanes, plaza, cornerR: TOWN_CORNER_R };
}

// Speed limit at a town point: plaza and warehouse yards 20, otherwise the street's (40 off the streets).
function townLimitAt(L, u, v) {
  if (Math.abs(u) <= 50 && v < 45) return 20;
  for (const w of L.warehouses) { const y = w.yard; if (u >= y.u0 && u <= y.u1 && v >= y.v0 && v <= y.v1) return 20; }
  let lim = 0;
  for (const st of L.streets) {
    const h = _ht(st), inside = st.axis === 'v' ? Math.abs(u - st.c) <= h && v >= st.a0 && v <= st.a1 : Math.abs(v - st.c) <= h && u >= st.a0 && u <= st.a1;
    if (inside) lim = Math.max(lim, st.limit);
  }
  return lim || 40;
}
function townPlazaPoint() { return { u: 0, v: 45 }; }

// Distance along the streets between two town points (each taken to the nearest point of a street's centre line).
function townGraphDistance(L, a, b) {
  const near = p => {
    let best = null, bd = Infinity;
    for (const st of L.streets) {
      const along = clamp(st.axis === 'v' ? p.v : p.u, st.a0, st.a1), q = st.axis === 'v' ? [st.c, along] : [along, st.c];
      const d = Math.hypot(p.u - q[0], p.v - q[1]);
      if (d < bd) { bd = d; best = { st, a: along }; }
    }
    return best;
  };
  const pa = near(a), pb = near(b);
  // vertices: every junction and street end, plus the two points; edges: neighbours along each street
  const verts = [], key = new Map(), edges = new Map();
  const vid = (u, v) => { const k = `${u.toFixed(3)},${v.toFixed(3)}`; if (!key.has(k)) { key.set(k, verts.length); verts.push([u, v]); edges.set(verts.length - 1, []); } return key.get(k); };
  const ia = vid(...(pa.st.axis === 'v' ? [pa.st.c, pa.a] : [pa.a, pa.st.c])), ib = vid(...(pb.st.axis === 'v' ? [pb.st.c, pb.a] : [pb.a, pb.st.c]));
  for (const st of L.streets) {
    const at = [st.a0, st.a1, ...L.nodes.filter(n => n.streets.includes(st.id)).map(n => (st.axis === 'v' ? n.v : n.u))];
    if (pa.st === st) at.push(pa.a); if (pb.st === st) at.push(pb.a);
    const sorted = [...new Set(at.map(x => +x.toFixed(6)))].sort((x, y) => x - y);
    for (let j = 0; j + 1 < sorted.length; j++) {
      const p = st.axis === 'v' ? [st.c, sorted[j]] : [sorted[j], st.c], q = st.axis === 'v' ? [st.c, sorted[j + 1]] : [sorted[j + 1], st.c];
      const i0 = vid(...p), i1 = vid(...q), w = sorted[j + 1] - sorted[j];
      edges.get(i0).push([i1, w]); edges.get(i1).push([i0, w]);
    }
  }
  const dist = new Array(verts.length).fill(Infinity), done = new Array(verts.length).fill(false);
  dist[ia] = 0;
  for (;;) {
    let u = -1;
    for (let k = 0; k < verts.length; k++) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
    if (u < 0 || u === ib) break;
    done[u] = true;
    for (const [w, c] of edges.get(u)) if (dist[u] + c < dist[w]) dist[w] = dist[u] + c;
  }
  return dist[ib];
}

// How much the expressway's terrain at (s, lat) should give way to a town's ground: 1 inside the
// town, falling to 0 60 m outside it; nothing on the road side of the town (v < 5). y: the town's height there.
const _gb = { w: 0, y: null }, _gbp = {}, _gbu = {};
function townGroundBlend(s, lat) {
  _gb.w = 0; _gb.y = null;
  for (const site of TOWN_SITES) {
    if (Math.abs(s - site.s) > 800) continue;
    posAt(s, lat, _gbp); townUV(site, _gbp.x, _gbp.z, _gbu);
    const u = _gbu.u, v = _gbu.v;
    if (v < 5 && Math.abs(u) <= 300) continue;
    const du = Math.max(0, Math.abs(u) - 300), dv = Math.max(0, 5 - v, v - 405), d = Math.hypot(du, dv);
    const w = 1 - smooth(0, 60, d);
    if (w > _gb.w) { _gb.w = w; _gb.y = townHeight(site, clamp(u, -300, 300), clamp(v, 5, 405)); }
  }
  return _gb;
}

// ---- the town grid: what each 50 cm cell is, and the signed distance to the nearest wall ----
// A stand-in when a town's layout cannot be made: the plaza roads and one flat yard behind them.
function townFallbackLayout(i) {
  const site = TOWN_SITES[i], lanes = [];
  const plaza = { exitPath: null, entryPath: null, exitLane: null, entryLane: null,
    gates: { exit: { u: -5, v: 30, dir: 1, state: 'closed', open: 0 }, entry: { u: 5, v: 30, dir: -1, state: 'closed', open: 0 } } };
  const add = (pts, dir) => { const l = { id: lanes.length, pts, len: _len(pts), next: [], turn: null, stopD: null, stopNode: null, stopAxis: null, edge0: false, edge1: false, plaza: true, node0: null, node1: null, street: null, limit: 20, k: 0, dir }; lanes.push(l); return l; };
  if (site.exit) { plaza.exitPath = [[-60, 0], ..._arc(-25, 20, 20, -Math.PI / 2, 0), [-5, 45]]; plaza.exitLane = add(plaza.exitPath, 'v+').id; }
  if (site.entry) { plaza.entryPath = [[5, 45], ..._arc(25, 20, 20, Math.PI, 1.5 * Math.PI), [60, 0]]; plaza.entryLane = add(plaza.entryPath, 'u+').id; }
  const yard = { u0: -35, u1: 35, v0: 45, v1: 115 }, fences = [];
  for (const [p, q] of [[[-35, 45], [-7, 45]], [[7, 45], [35, 45]], [[35, 45], [35, 115]], [[35, 115], [-35, 115]], [[-35, 115], [-35, 45]]]) fences.push({ u0: p[0], v0: p[1], u1: q[0], v1: q[1], kind: 'wall' });
  const wh = { id: 0, name: site.ic.jp + TOWN_WH_NAMES[0], block: -1, street: null, gate: { u: 0, v: 45, nu: 0, nv: 1, w: 14 }, yard, building: null, docks: [],
    bay: { u: -20, v: 80, hu: 0, hv: 1 }, park: { u: 20, v: 76, hu: 0, hv: -1 }, gateLanes: [] };
  return { site, streets: [], nodes: [], blocks: [], warehouses: [wh], buildings: [], fences, lanes, plaza, cornerR: TOWN_CORNER_R, fallback: true };
}

const _gIdx = (iu, iv) => iv * TOWN_NU + iu;
// Fill the cells of the box [u0, u1] x [v0, v1] (town metres) that pass keep(u, v) with value t.
function _gFill(type, u0, u1, v0, v1, t, keep) {
  const a0 = clamp(Math.floor((u0 - TOWN_U0) / TOWN_CELL), 0, TOWN_NU - 1), a1 = clamp(Math.ceil((u1 - TOWN_U0) / TOWN_CELL) - 1, 0, TOWN_NU - 1);
  const b0 = clamp(Math.floor((v0 - TOWN_V0) / TOWN_CELL), 0, TOWN_NV - 1), b1 = clamp(Math.ceil((v1 - TOWN_V0) / TOWN_CELL) - 1, 0, TOWN_NV - 1);
  for (let iv = b0; iv <= b1; iv++) {
    const v = TOWN_V0 + (iv + 0.5) * TOWN_CELL;
    for (let iu = a0; iu <= a1; iu++) {
      const u = TOWN_U0 + (iu + 0.5) * TOWN_CELL;
      if (keep && !keep(u, v)) continue;
      type[_gIdx(iu, iv)] = t;
    }
  }
}
function _segDist(u, v, p, q) {
  const du = q[0] - p[0], dv = q[1] - p[1], L2 = du * du + dv * dv;
  const t = L2 > 0 ? clamp(((u - p[0]) * du + (v - p[1]) * dv) / L2, 0, 1) : 0;
  return Math.hypot(u - p[0] - du * t, v - p[1] - dv * t);
}
function _pathDist(u, v, pts) { let d = Infinity; for (let i = 1; i < pts.length; i++) d = Math.min(d, _segDist(u, v, pts[i - 1], pts[i])); return d; }

// The grid, made in steps (each yield is a short piece of work). The last value is { type, dist }.
function* townGridSteps(L) {
  const type = new Uint8Array(TOWN_NU * TOWN_NV), C = TCELL;
  for (let iv0 = 0; iv0 < TOWN_NV; iv0 += 100) {        // inside the town: walls until painted; outside: out
    for (let iv = iv0; iv < Math.min(TOWN_NV, iv0 + 100); iv++) {
      const v = TOWN_V0 + (iv + 0.5) * TOWN_CELL;
      for (let iu = 0; iu < TOWN_NU; iu++) type[_gIdx(iu, iv)] = townInside(TOWN_U0 + (iu + 0.5) * TOWN_CELL, v) ? C.WALL : C.OUT;
    }
    yield null;
  }
  const box = st => (st.axis === 'v' ? [st.c - _ht(st), st.c + _ht(st), st.a0, st.a1] : [st.a0, st.a1, st.c - _ht(st), st.c + _ht(st)]);
  const carr = st => (st.axis === 'v' ? [st.c - _hc(st), st.c + _hc(st), st.a0, st.a1] : [st.a0, st.a1, st.c - _hc(st), st.c + _hc(st)]);
  for (const st of L.streets) { const b = box(st); _gFill(type, b[0], b[1], b[2], b[3], C.WALK); }
  yield null;
  // rounded kerbs: in each corner between two arms, the 12 m square outside the kerb circle is road, a ring inside it pavement
  for (const n of L.nodes) {
    const V = L.streets[n.streets[0]], U = L.streets[n.streets[1]], walk = Math.min(V.walkW, U.walkW), r = TOWN_CORNER_R;
    for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (!n.arms[sv > 0 ? 'v+' : 'v-'] || !n.arms[su > 0 ? 'u+' : 'u-']) continue;
      const ku = n.u + su * _hc(V), kv = n.v + sv * _hc(U), cu = ku + su * r, cv = kv + sv * r;
      _gFill(type, Math.min(ku, cu), Math.max(ku, cu), Math.min(kv, cv), Math.max(kv, cv), C.WALK, (u, v) => Math.hypot(u - cu, v - cv) > r - walk);
      _gFill(type, Math.min(ku, cu), Math.max(ku, cu), Math.min(kv, cv), Math.max(kv, cv), C.ROAD, (u, v) => Math.hypot(u - cu, v - cv) > r);
    }
  }
  for (const st of L.streets) { const b = carr(st); _gFill(type, b[0], b[1], b[2], b[3], C.ROAD); }
  yield null;
  // the plaza roads (6 m either side of each path, so a trailer cutting the bend stays on them) and the booth islands
  for (const path of [L.plaza.exitPath, L.plaza.entryPath]) if (path) for (let k = 1; k < path.length; k++) {   // each piece of the path as a 6 m capsule
    const a = path[k - 1], b = path[k];
    _gFill(type, Math.min(a[0], b[0]) - 6, Math.max(a[0], b[0]) + 6, Math.min(a[1], b[1]) - 6, Math.max(a[1], b[1]) + 6, C.ROAD, (u, v) => townInside(u, v) && _segDist(u, v, a, b) <= 6);
  }
  for (const [u0, u1] of [[-1.2, 1.2], [-9.5, -7.5], [7.5, 9.5]]) _gFill(type, u0, u1, 24, 38, C.WALL);
  yield null;
  // warehouse yards and their gates, then the fences (1 m thick)
  for (const w of L.warehouses) {
    const y = w.yard; _gFill(type, y.u0, y.u1, y.v0, y.v1, C.YARD);
    const g = w.gate, lu = -g.nv, lv = g.nu;     // across the gate
    const p = [g.u + lu * 7, g.v + lv * 7], q = [g.u - lu * 7 + g.nu * 1.2, g.v - lv * 7 + g.nv * 1.2];
    _gFill(type, Math.min(p[0], q[0]), Math.max(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[1], q[1]), C.YARD);
  }
  for (const f of L.fences) if (f.kind !== 'hedge') {
    const pts = [[f.u0, f.v0], [f.u1, f.v1]];
    _gFill(type, Math.min(f.u0, f.u1) - 0.5, Math.max(f.u0, f.u1) + 0.5, Math.min(f.v0, f.v1) - 0.5, Math.max(f.v0, f.v1) + 0.5, C.WALL, (u, v) => _pathDist(u, v, pts) <= 0.5);
  }
  yield null;
  // signed distance (3-4 chamfer): to the nearest wall for free cells, to the nearest free cell for walls
  const INF = 65000, dF = new Uint16Array(TOWN_NU * TOWN_NV), dW = new Uint16Array(TOWN_NU * TOWN_NV);
  for (let i = 0; i < type.length; i++) { const fr = type[i] === C.ROAD || type[i] === C.WALK || type[i] === C.YARD; dF[i] = fr ? INF : 0; dW[i] = fr ? 0 : INF; }
  yield null;
  const relax = (D, i, j, c) => { const x = D[j] + c; if (x < D[i]) D[i] = x; };
  for (let iv0 = 0; iv0 < TOWN_NV; iv0 += 50) {
    for (let iv = iv0; iv < Math.min(TOWN_NV, iv0 + 50); iv++) for (let iu = 0; iu < TOWN_NU; iu++) {
      const i = _gIdx(iu, iv);
      for (const D of [dF, dW]) {
        if (D[i] === 0) continue;
        if (iu > 0) relax(D, i, i - 1, 3);
        if (iv > 0) { relax(D, i, i - TOWN_NU, 3); if (iu > 0) relax(D, i, i - TOWN_NU - 1, 4); if (iu < TOWN_NU - 1) relax(D, i, i - TOWN_NU + 1, 4); }
      }
    }
    yield null;
  }
  for (let iv0 = TOWN_NV - 1; iv0 >= 0; iv0 -= 50) {
    for (let iv = iv0; iv > Math.max(-1, iv0 - 50); iv--) for (let iu = TOWN_NU - 1; iu >= 0; iu--) {
      const i = _gIdx(iu, iv);
      for (const D of [dF, dW]) {
        if (D[i] === 0) continue;
        if (iu < TOWN_NU - 1) relax(D, i, i + 1, 3);
        if (iv < TOWN_NV - 1) { relax(D, i, i + TOWN_NU, 3); if (iu < TOWN_NU - 1) relax(D, i, i + TOWN_NU + 1, 4); if (iu > 0) relax(D, i, i + TOWN_NU - 1, 4); }
      }
    }
    yield null;
  }
  const dist = new Int16Array(TOWN_NU * TOWN_NV), k = TOWN_CELL / 3;
  for (let i0 = 0; i0 < dist.length; i0 += 100 * TOWN_NU) {
    for (let i = i0; i < Math.min(dist.length, i0 + 100 * TOWN_NU); i++) {
      const d = dF[i] > 0 ? dF[i] * k - TOWN_CELL / 2 : -(dW[i] * k - TOWN_CELL / 2);   // zero on the cell boundary
      dist[i] = d >= 6 ? 600 : d <= -6 ? -600 : Math.round(d * 100);
    }
    yield null;
  }
  return { type, dist };
}
function townGrid(L) { const it = townGridSteps(L); for (;;) { const r = it.next(); if (r.done) return r.value; } }

// The loaded towns (2 at most in the game; tests load any).
const TOWNS_LOADED = new Map();
function townAdd(i, layout, grid) {
  TOWNS_LOADED.set(i, { layout, grid });
  if (!GROUND.towns.includes(i)) GROUND.towns.push(i);
}
function townLoad(i) {
  if (TOWNS_LOADED.has(i)) return TOWNS_LOADED.get(i);
  let layout, grid;
  try { layout = townLayout(i); grid = townGrid(layout); }
  catch (e) { console.warn('town ' + i + ' could not be made; using a plain yard:', e && e.message); layout = townFallbackLayout(i); grid = townGrid(layout); }
  townAdd(i, layout, grid);
  return TOWNS_LOADED.get(i);
}
function townUnload(i) {
  TOWNS_LOADED.delete(i);
  const k = GROUND.towns.indexOf(i); if (k >= 0) GROUND.towns.splice(k, 1);
}
// Signed distance (m, positive on drivable ground) and cell type at a town point, from the grid.
function townSample(grid, u, v) {
  const fu = (u - TOWN_U0) / TOWN_CELL - 0.5, fv = (v - TOWN_V0) / TOWN_CELL - 0.5;
  const iu = clamp(Math.floor(fu), 0, TOWN_NU - 2), iv = clamp(Math.floor(fv), 0, TOWN_NV - 2), tu = clamp(fu - iu, 0, 1), tv = clamp(fv - iv, 0, 1);
  const D = grid.dist, i = _gIdx(iu, iv);
  return ((D[i] * (1 - tu) + D[i + 1] * tu) * (1 - tv) + (D[i + TOWN_NU] * (1 - tu) + D[i + TOWN_NU + 1] * tu) * tv) / 100;
}
function townCellAt(grid, u, v) {
  const iu = Math.floor((u - TOWN_U0) / TOWN_CELL), iv = Math.floor((v - TOWN_V0) / TOWN_CELL);
  if (iu < 0 || iv < 0 || iu >= TOWN_NU || iv >= TOWN_NV) return TCELL.OUT;
  return grid.type[_gIdx(iu, iv)];
}

// ---------------------------------------------------------------------------
// Service areas (data only, no DOM): the car park beside the expressway with its
// truck stalls, fuel bays, building and parked vehicles, the paths through it,
// and its grid of cells (the same kind of grid a town has). Coordinates are road
// coordinates (see SAS in 02-route.js): u = s - sDiv along the road, v = -lat to
// the left of it. One way through: the deceleration lane, aisle A past the
// stalls, aisle B behind them, the fuel bays, the exit, the acceleration lane.
// ---------------------------------------------------------------------------
const SA_GRID = { u0: 130, v0: 10, nu: 760, nv: 188, cell: 0.5 };
// the part of the road's left side that the service area's own ground answers for
function saInside(u, v) { return u >= 140 && u <= 500 && v >= 13.6 && v <= 102; }
const SA_STALL = { n: 12, u0: 212, du: 5.66, v: 37, w: 4, len: 20 };
const SA_PUMP = { u: 377, v: [26, 36], w: 4.5, len: 22 };
const SA_CAR_KINDS = ['kei', 'sedan', 'minivan'];

// A path of [u, v] points every metre or so: straight lines, 45-degree corners, S-bends.
function _saLine(out, b) { const a = out[out.length - 1], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
// an S-bend from the last point to b: v eases across while u goes on
function _saS(out, b) {
  const a = out[out.length - 1], n = Math.max(2, Math.ceil(Math.abs(b[0] - a[0]) / 2));
  for (let k = 1; k <= n; k++) { const t = k / n, e = (1 - Math.cos(Math.PI * t)) / 2; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * e]); }
}
// a corner of radius R at P, from direction d1 to d2 (unit vectors), then on to the corner's end
function _saCorner(out, P, d1, d2, R) {
  const cosA = d1[0] * d2[0] + d1[1] * d2[1], half = Math.acos(clamp(cosA, -1, 1)) / 2, T = R * Math.tan(half);
  _saLine(out, [P[0] - d1[0] * T, P[1] - d1[1] * T]);
  const left = d1[0] * d2[1] - d1[1] * d2[0] > 0, nx = left ? -d1[1] : d1[1], ny = left ? d1[0] : -d1[0];   // toward the corner's centre
  const s = out[out.length - 1], c = [s[0] + nx * R, s[1] + ny * R], a0 = Math.atan2(s[1] - c[1], s[0] - c[0]);
  const da = (left ? 1 : -1) * 2 * half, n = 10;
  for (let k = 1; k <= n; k++) { const a = a0 + da * k / n; out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
}

function saLayout(k, visit = 0) {
  const sa = SAS[k], R = rng(7001 + 131 * k + 17 * visit), D = Math.SQRT1_2;
  const stalls = [];
  for (let n = 0; n < SA_STALL.n; n++) stalls.push({ id: n, u: SA_STALL.u0 + SA_STALL.du * n, v: SA_STALL.v, hu: D, hv: D, w: SA_STALL.w, len: SA_STALL.len, taken: false });
  const nTaken = 4 + Math.floor(R() * 4), order = stalls.map(s => s.id);   // 4..7 of 12: 3 to 6 tenths, at least 5 free
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  for (const id of order.slice(0, nTaken)) stalls[id].taken = true;
  const pumps = SA_PUMP.v.map((v, id) => ({ id, u: SA_PUMP.u, v, hu: 1, hv: 0, w: SA_PUMP.w, len: SA_PUMP.len }));
  const cars = [];
  for (const s of stalls) if (s.taken) cars.push({ u: s.u, v: s.v, hu: s.hu, hv: s.hv, len: 12, wid: 2.5, kind: 'truck' });
  const carPark = { u0: 205, u1: 325, rows: [{ v: 59, hv: -1 }, { v: 71, hv: 1 }], slotW: 2.5, len: 5 };
  for (const row of carPark.rows) for (let u = carPark.u0 + 1.25; u < carPark.u1; u += carPark.slotW) {
    if (R() < 0.5) cars.push({ u, v: row.v, hu: 0, hv: row.hv, len: 4.4, wid: 1.75, kind: SA_CAR_KINDS[Math.floor(R() * 3)] });
  }
  const hue = R();
  return {
    sa, kind: 'sa', visit, fallback: false, stalls, pumps, cars, carPark,
    building: { u0: 215, u1: 275, v0: 79, v1: 99, h: 5.5, hue },
    canopy: { u0: 357, u1: 397, v0: 20, v1: 44, h: 6.5, pillars: [[362.5, 31], [391.5, 31], [362.5, 40.25], [391.5, 40.25]] },
    islands: [{ u0: 362, u1: 392, v0: 29, v1: 33 }, { u0: 362, u1: 392, v0: 39, v1: 41.5 }],
    planted: [{ u0: 180, u1: 190, v0: 28, v1: 46 }, { u0: 298, u1: 320, v0: 28, v1: 46 }],
    // what the grid paints as road, in order (boxes [u0, u1, v0, v1]); the throat narrows toward the exit lane
    paved: [[180, 335, 18, 28], [190, 298, 28, 46], [190, 420, 46, 56], [200, 330, 56, 76], [320, 420, 18, 56]],
    walk: [[205, 285, 76, 79]],
    signs: [{ u: 186, v: 30, text: '大型車' }, { u: 340, v: 15, text: '給油所' }, { u: 452, v: 30, text: '出口' }],
  };
}
// A plain car park when the layout cannot be made: one fuel bay, four straight drive-through stalls, no building.
function saFallbackLayout(k) {
  const sa = SAS[k];
  const stalls = [40, 44.5, 49, 53.5].map((v, id) => ({ id, u: 270, v, hu: 1, hv: 0, w: 4, len: 20, taken: false }));
  return { sa, kind: 'sa', visit: 0, fallback: true, stalls, pumps: [{ id: 0, u: 360, v: 26, hu: 1, hv: 0, w: 4.5, len: 22 }], cars: [],
    carPark: null, building: null, canopy: null, islands: [], planted: [], paved: [[180, 420, 18, 80]], walk: [], signs: [] };
}

// The way between two places in the car park as [u, v] points: a is 'in' | { stall } | { pump }, b is { stall } | { pump } | 'out'.
// 'in' starts on the deceleration lane at u = 140; 'out' ends on the acceleration lane at u = 500.
function saPath(L, a, b) {
  const out = [], D = Math.SQRT1_2, E = {};
  if (a === 'in') { for (let u = 140; u <= 180; u += 5) out.push([u, -saExitEdges(u, E).cx]); _saLine(out, [190, 23]); }
  else if (a.stall != null) { const s = L.stalls[a.stall]; out.push([s.u, s.v]); }
  else { const p = L.pumps[a.pump]; out.push([p.u, p.v]); }
  const toOut = () => { _saS(out, [455, 22]); _saLine(out, [460, 22]); for (let u = 465; u <= 500; u += 5) out.push([u, -saEntryEdges(u - 460, E).cx]); };
  if (L.fallback) {   // an open car park: S-bends between straight runs
    const at = out[out.length - 1];
    if (b === 'out') { if (at[0] < 300) _saLine(out, [Math.max(at[0] + 10, 300), at[1]]); _saLine(out, [400, at[1]]); toOut(); return out; }
    const t = b.stall != null ? L.stalls[b.stall] : L.pumps[b.pump];
    if (a !== 'in') _saLine(out, [at[0] + 25, at[1]]);
    _saS(out, [t.u - 22, t.v]); _saLine(out, [t.u, t.v]);
    return out;
  }
  if (a === 'in' && b.stall != null) {
    const s = L.stalls[b.stall];
    _saCorner(out, [s.u - 14, 23], [1, 0], [D, D], 14); _saLine(out, [s.u, s.v]);
    return out;
  }
  if (a.stall != null) {   // out of the stall onto aisle B, heading on along it
    const s = L.stalls[a.stall];
    _saCorner(out, [s.u + 14, 51], [D, D], [1, 0], 14);
    if (b === 'out') { _saLine(out, [400, 51]); toOut(); return out; }
    const p = L.pumps[b.pump];
    _saLine(out, [Math.max(out[out.length - 1][0] + 2, 318), 51]); _saS(out, [357, p.v]); _saLine(out, [p.u, p.v]);
    return out;
  }
  if (a === 'in') {   // along aisle A
    if (b === 'out') { _saLine(out, [318, 23]); _saS(out, [355, 51]); _saLine(out, [400, 51]); toOut(); return out; }
    const p = L.pumps[b.pump];
    _saLine(out, [330, 23]); _saS(out, [357, p.v]); _saLine(out, [p.u, p.v]);
    return out;
  }
  _saLine(out, [400, out[out.length - 1][1]]); toOut();   // from a fuel bay
  return out;
}

// The grid in steps (each yield a short piece of work); the last value is the grid with its distances.
function* saGridSteps(L) {
  const G = gridNew(SA_GRID.u0, SA_GRID.v0, SA_GRID.nu, SA_GRID.nv, SA_GRID.cell), C = TCELL, E = {};
  for (let iv = 0; iv < G.nv; iv++) {   // inside: walls (planting, fences) until painted; outside: out
    const v = G.v0 + (iv + 0.5) * G.cell;
    for (let iu = 0; iu < G.nu; iu++) G.type[iv * G.nu + iu] = saInside(G.u0 + (iu + 0.5) * G.cell, v) ? C.WALL : C.OUT;
  }
  yield null;
  const inside = (u, v) => saInside(u, v);
  // the lanes: the deceleration lane up to the car park, the acceleration lane from it
  for (let u = 130; u < 186; u += 0.5) { const e = saExitEdges(u, E); _gFill(G, u, u + 0.5, -e.xr, -e.xl, C.ROAD, inside); }
  for (let u = 454; u < 510; u += 0.5) { const e = saEntryEdges(Math.max(0, u - SA_LOT1), E); _gFill(G, u, u + 0.5, -e.xr, -e.xl, C.ROAD, inside); }
  for (const [u0, u1, v0, v1] of L.paved) _gFill(G, u0, u1, v0, v1, C.ROAD, inside);
  if (!L.fallback) {   // the throat: from the fuel bays and aisle B down to the exit lane's width
    _gFill(G, 420, 460, 18, 56, C.ROAD, (u, v) => v <= 56 - (u - 420) * (56 - 27) / 40);
  } else _gFill(G, 420, 460, 18, 80, C.ROAD, (u, v) => v <= 80 - (u - 420) * (80 - 27) / 40);
  yield null;
  for (const [u0, u1, v0, v1] of L.walk) _gFill(G, u0, u1, v0, v1, C.WALK, inside);
  for (const p of L.planted) _gFill(G, p.u0, p.u1, p.v0, p.v1, C.WALL);
  for (const p of L.islands) _gFill(G, p.u0, p.u1, p.v0, p.v1, C.WALL);
  if (L.building) _gFill(G, L.building.u0, L.building.u1, L.building.v0, L.building.v1, C.WALL);
  for (const c of L.cars) {   // parked vehicles: boxes along their heading
    const r = Math.hypot(c.len, c.wid) / 2 + 0.3;
    _gFill(G, c.u - r, c.u + r, c.v - r, c.v + r, C.WALL, (u, v) => {
      const du = u - c.u, dv = v - c.v;
      return Math.abs(du * c.hu + dv * c.hv) <= c.len / 2 + 0.15 && Math.abs(-du * c.hv + dv * c.hu) <= c.wid / 2 + 0.15;
    });
  }
  yield null;
  yield* gridSdfSteps(G);
  return G;
}
function saGrid(L) { const it = saGridSteps(L); for (;;) { const r = it.next(); if (r.done) return r.value; } }

// The loaded service areas (one at a time in the game; tests load any).
const SA_LOADED = new Map();
function saAdd(k, layout, grid) {
  SA_LOADED.set(k, { layout, grid });
  if (!GROUND.sas.includes(k)) GROUND.sas.push(k);
}
function saLoad(k, visit = 0) {
  if (SA_LOADED.has(k)) return SA_LOADED.get(k);
  let layout, grid;
  try { layout = saLayout(k, visit); grid = saGrid(layout); }
  catch (e) { console.warn('service area ' + k + ' could not be made; using a plain car park:', e && e.message); layout = saFallbackLayout(k); grid = saGrid(layout); }
  saAdd(k, layout, grid);
  return SA_LOADED.get(k);
}
function saUnload(k) {
  SA_LOADED.delete(k);
  const i = GROUND.sas.indexOf(k); if (i >= 0) GROUND.sas.splice(i, 1);
}

// The slot (a free truck stall, or a fuel bay) holding the tractor's centre (u, v) with its heading (hu, hv) within 20 degrees.
const _SA_COS20 = Math.cos(20 * Math.PI / 180);
function _saSlot(list, u, v, hu, hv) {
  for (const s of list) {
    if (s.taken) continue;
    const du = u - s.u, dv = v - s.v;
    if (Math.abs(du * s.hu + dv * s.hv) > s.len / 2 || Math.abs(-du * s.hv + dv * s.hu) > s.w / 2) continue;
    if (hu * s.hu + hv * s.hv >= _SA_COS20) return s;
  }
  return null;
}
function saStallAt(L, u, v, hu, hv) { return _saSlot(L.stalls, u, v, hu, hv); }
function saPumpAt(L, u, v, hu, hv) { return _saSlot(L.pumps, u, v, hu, hv); }

// Expressway houses and trees keep out of each service area and its surroundings.
function saKeepOut(s, lat) {
  for (const a of SAS) { const u = s - a.sDiv, v = -lat; if (u >= 100 && u <= 560 && v >= 10 && v <= 140) return true; }
  return false;
}
// How much the expressway's terrain at (s, lat) gives way to a service area's ground: 1 over the car park, 0 40 m beyond it.
const _sgb = { w: 0, y: null };
function saGroundBlend(s, lat) {
  _sgb.w = 0; _sgb.y = null;
  for (const a of SAS) {
    const u = s - a.sDiv, v = -lat;
    if (u < 100 || u > 560 || v < 13.6) continue;
    const d = Math.hypot(Math.max(0, SA_LOT0 - u, u - SA_LOT1), Math.max(0, v - 102)), w = 1 - smooth(0, 40, d);
    if (w > _sgb.w) { _sgb.w = w; _sgb.y = elevAt(a.sDiv + clamp(u, SA_LOT0, SA_LOT1)); }
  }
  return _sgb;
}

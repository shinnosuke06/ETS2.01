// ---------------------------------------------------------------------------
// World chunks (200 m each): road, median, guardrails, terrain, trees, houses,
// tunnels, exit ramps with ETC toll gates, signs, sound walls, water.
// Every chunk's geometry is stored relative to its first sample for precision.
// ---------------------------------------------------------------------------
const CHUNK = 200;
const chunks = new Map();
const _pp = { x: 0, y: 0, z: 0, h: 0 };

const SHARED = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0),
  ico: new THREE.IcosahedronGeometry(1, 0),
  roof: roofGeo(),
  panel: new THREE.BoxGeometry(0.05, 0.72, 0.26),
  post: new THREE.CylinderGeometry(0.07, 0.07, 0.95, 6).translate(0, 0.475, 0),
  hpost: new THREE.BoxGeometry(0.2, 1, 0.2).translate(0, 0.5, 0),
  lampBox: new THREE.BoxGeometry(0.35, 0.12, 1.3),
};
for (const k in SHARED) SHARED[k].userData.keep = true;

function innerAt(s, side) { // where terrain begins; inside tunnels it starts behind the bore walls
  if (tunnelAt(s, 1)) return 13.2;
  return side < 0 ? leftInner(s) : ROAD_IN;
}
function leftInner(s) {
  const r = rampAt(s);
  if (r) return Math.max(ROAD_IN, -rampEdges(s - r.sDiv).xl);
  const en = entryAt(s);
  if (en) return Math.max(ROAD_IN, -entryEdges(s - en.s0).xl);   // beyond the entrance band
  const sx = saExitAt(s); if (sx) return Math.max(ROAD_IN, -saExitEdges(s - sx.sDiv).xl);   // beyond a service area's lanes
  const sn = saEntryAt(s); if (sn) return Math.max(ROAD_IN, -saEntryEdges(s - sn.sLot1).xl);
  return ROAD_IN;
}
// The left post of a sign gantry: at the usual -13.1, or a metre beyond an entrance band's outer edge.
function gantryLeftX(s) {
  const en = entryAt(s), sx = en ? null : saExitAt(s), sn = en || sx ? null : saEntryAt(s);
  const e = en ? entryEdges(s - en.s0) : sx ? saExitEdges(s - sx.sDiv) : sn ? saEntryEdges(s - sn.sLot1) : null;
  return e ? Math.min(-13.1, e.xl - 1.0) : -13.1;
}

const _tp = {};
function terrainY(s, x, d, side) {
  const p = regionAt(s, _tp);
  const roadY = elevAt(s);
  const n1 = fbm(s * 0.0025, x * 0.0025 + 31, 4, 3);
  const n2 = vnoise(s * 0.02, x * 0.02 + 7, 9);
  let rel = (n1 - 0.42) * 2.2 * p.hill * smooth(4, 170, d) + (n2 - 0.5) * 2.5 * smooth(3, 40, d);
  rel += d * (side < 0 ? p.sl : p.sr) * smooth(8, 90, d);
  rel -= 1.6 * smooth(0, 5, d) * (1 - smooth(5, 45, d));
  const tf = tunnelFactor(s);
  if (tf > 0) rel = Math.max(rel, tf * (8 + d * 0.6 + n1 * 22) * smooth(0, 14, d));
  let y = roadY + rel;
  const w = waterAt(s, side);
  if (w > 0) y = lerp(y, Math.min(y, -5 + (n2 - 0.5) * 3), w * smooth(6, 30, d));
  const tb = townGroundBlend(s, x);   // give way to a town's ground (just under it)
  if (tb.w > 0) y = lerp(y, tb.y - 0.3, tb.w);
  const sb = saGroundBlend(s, x);     // and to a service area's
  if (sb.w > 0) y = lerp(y, sb.y - 0.3, sb.w);
  return y;
}

const _tc = {};
function terrainColor(s, x, d, y, slope, out) {
  const p = regionAt(s, _tc);
  const rel = y - elevAt(s);
  const n = vnoise(s * 0.018, x * 0.018, 5), nf = vnoise(s * 0.006, x * 0.006, 12), n3 = vnoise(s * 0.05, x * 0.05, 19);
  let r = 0.44, g = 0.53, b = 0.27; // autumn meadow
  // fields: harvested rice paddies (straw / bare soil), arranged in a coarse grid
  const flat = 1 - smooth(0.05, 0.18, slope);
  const paddy = p.paddy * flat * smooth(10, 28, d) * smooth(0.25, 0.45, n);
  if (paddy > 0) {
    const cell = hash2(Math.floor(s / 32), Math.floor(x / 26), 3);
    const pr = cell < 0.5 ? 0.66 : cell < 0.8 ? 0.47 : 0.56, pg = cell < 0.5 ? 0.58 : cell < 0.8 ? 0.38 : 0.6, pb = cell < 0.5 ? 0.36 : cell < 0.8 ? 0.26 : 0.33;
    r = lerp(r, pr, paddy); g = lerp(g, pg, paddy); b = lerp(b, pb, paddy);
  }
  // tea fields (Makinohara): bright green
  const tea = p.tea * flat * smooth(14, 30, d) * smooth(0.4, 0.6, nf);
  if (tea > 0) { r = lerp(r, 0.22, tea); g = lerp(g, 0.5, tea); b = lerp(b, 0.16, tea); }
  // forest on slopes and hills, with autumn colour patches
  const forest = clamp(p.forest * (0.5 + slope * 2.5) + smooth(18, 70, rel) * 0.7, 0, 1) * smooth(8, 26, d) * (1 - paddy * 0.8);
  if (forest > 0) {
    const autumn = smooth(0.58, 0.82, nf) * 0.85;
    const fr = lerp(0.17, 0.58, autumn * (0.5 + n3 * 0.5)), fg = lerp(0.29, 0.30, autumn), fb = lerp(0.15, 0.12, autumn);
    r = lerp(r, fr, forest); g = lerp(g, fg, forest); b = lerp(b, fb, forest);
  }
  // mown verge right next to the road
  const verge = 1 - smooth(2, 8, d);
  r = lerp(r, 0.40, verge * 0.6); g = lerp(g, 0.56, verge * 0.6); b = lerp(b, 0.26, verge * 0.6);
  // shore / beach near water
  if (y < 1.6 && (waterAt(s, -1) > 0 || waterAt(s, 1) > 0)) { const t = smooth(1.6, 0.2, y); r = lerp(r, 0.55, t); g = lerp(g, 0.52, t); b = lerp(b, 0.45, t); }
  const shade = 0.88 + n3 * 0.2;
  out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
  return out;
}

// Strip along samples [from..to] between lateral a(i) and b(i) (a < b).
function stripGeo(O, from, to, a, b, o = {}) {
  const n = to - from + 1;
  if (n < 2) return null;
  const pos = new Float32Array(n * 6), uv = new Float32Array(n * 4), nor = new Float32Array(n * 6);
  const col = o.color ? new Float32Array(n * 6) : null;
  for (let j = 0; j < n; j++) {
    const i = from + j, s = i * DS;
    const xa = typeof a === 'function' ? a(i, s) : a, xb = typeof b === 'function' ? b(i, s) : b;
    const ya = (o.yAbs != null ? o.yAbs : PY[i] + (typeof o.y === 'function' ? o.y(i, s, xa) : (o.y || 0))) - O.y;
    const yb = (o.yAbs != null ? o.yAbs : PY[i] + (typeof o.y === 'function' ? o.y(i, s, xb) : (o.y || 0))) - O.y;
    pos[j * 6] = PX[i] + RX[i] * xa - O.x; pos[j * 6 + 1] = ya; pos[j * 6 + 2] = PZ[i] + RZ[i] * xa - O.z;
    pos[j * 6 + 3] = PX[i] + RX[i] * xb - O.x; pos[j * 6 + 4] = yb; pos[j * 6 + 5] = PZ[i] + RZ[i] * xb - O.z;
    nor[j * 6 + 1] = 1; nor[j * 6 + 4] = 1;
    let ua, ub;
    if (o.uFn) { const u = o.uFn(i, s, xa, xb); ua = u[0]; ub = u[1]; } else { ua = o.uA ?? 0; ub = o.uB ?? 1; }
    const v = s / (o.vScale || 10);
    uv[j * 4] = ua; uv[j * 4 + 1] = v; uv[j * 4 + 2] = ub; uv[j * 4 + 3] = v;
    if (col) { const c = o.color(i, s); col.set(c, j * 6); col.set(c, j * 6 + 3); }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) { const v0 = j * 2; idx.push(v0, v0 + 1, v0 + 2, v0 + 1, v0 + 3, v0 + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  if (o.yAbs == null && o.y && typeof o.y === 'function') g.computeVertexNormals();
  return g;
}

// Sweep a cross-section profile [[lat, height], ...] along samples.
function sweepGeo(O, from, to, profile, o = {}) {
  const m = profile.length, n = to - from + 1;
  if (n < 2) return null;
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  const col = o.colorFn ? new Float32Array(n * m * 3) : null;
  const cum = [0];
  for (let p = 1; p < m; p++) cum.push(cum[p - 1] + Math.hypot(profile[p][0] - profile[p - 1][0], profile[p][1] - profile[p - 1][1]));
  for (let j = 0; j < n; j++) {
    const i = from + j, s = i * DS;
    const off = o.xFn ? o.xFn(i, s) : 0;
    for (let p = 0; p < m; p++) {
      const lat = profile[p][0] + off, y = profile[p][1];
      const k = (j * m + p);
      pos[k * 3] = PX[i] + RX[i] * lat - O.x; pos[k * 3 + 1] = PY[i] + y - O.y; pos[k * 3 + 2] = PZ[i] + RZ[i] * lat - O.z;
      uv[k * 2] = cum[p] / (o.uScale || 1); uv[k * 2 + 1] = s / (o.vScale || 4);
      if (col) { const c = o.colorFn(profile[p][0], y); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]; }
    }
  }
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let p = 0; p < m - 1; p++) {
    const a = j * m + p, b = a + 1, c = a + m, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function addMesh(ctx, geo, mat, { cast = false, receive = false } = {}) {
  if (!geo) return null;
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  ctx.grp.add(m);
  return m;
}
function runs(from, to, pred) { // contiguous runs of samples where pred(i) is true (end shares the next vertex)
  const out = []; let st = -1;
  for (let i = from; i <= to; i++) {
    if (pred(i)) { if (st < 0) st = i; }
    else if (st >= 0) { out.push([st, i]); st = -1; }
  }
  if (st >= 0 && to > st) out.push([st, to]);
  return out;
}
// Local frame at (s, lat): object -Z points along the road.
function placeAt(obj, O, s, lat, y = 0, yaw = 0) {
  posAt(s, lat, _pp);
  obj.position.set(_pp.x - O.x, _pp.y - O.y + y, _pp.z - O.z);
  obj.rotation.y = _pp.h + Math.PI + yaw;
  return obj;
}
function instanced(ctx, geo, mat, list, { cast = false, colors = false } = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
  const c = new THREE.Color();
  list.forEach((it, k) => {
    e.set(it.rx || 0, it.ry || 0, it.rz || 0); q.setFromEuler(e);
    m.compose(p.set(it.x, it.y, it.z), q, sc.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1));
    im.setMatrixAt(k, m);
    if (colors) im.setColorAt(k, c.set(it.c));
  });
  im.instanceMatrix.needsUpdate = true;
  if (colors && im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = cast;
  ctx.grp.add(im);
  return im;
}
function localPt(O, s, lat, y = 0) { posAt(s, lat, _pp); return { x: _pp.x - O.x, y: _pp.y - O.y + y, z: _pp.z - O.z, h: _pp.h }; }

// ---------------------------------------------------------------------------
function buildChunk(k) {
  const s0 = k * CHUNK, s1 = Math.min((k + 1) * CHUNK, ROUTE_LEN - DS * 2);
  if (s0 >= s1) return null;
  const i0 = Math.round(s0 / DS), i1 = Math.round(s1 / DS);
  const O = { x: PX[i0], y: PY[i0], z: PZ[i0] };
  const grp = new THREE.Group();
  grp.position.set(O.x, O.y, O.z);
  const ctx = { k, s0, s1, i0, i1, O, grp, rand: rng(k * 7919 + 13), extra: [] };
  buildRoad(ctx);
  buildMedian(ctx);
  buildRails(ctx);
  buildTerrain(ctx);
  buildTrees(ctx);
  buildHouses(ctx);
  buildSoundWalls(ctx);
  buildWater(ctx);
  buildTunnels(ctx);
  buildRamps(ctx);
  buildSigns(ctx);
  buildEnd(ctx);
  scene.add(grp);
  return ctx;
}
function disposeChunk(c) {
  scene.remove(c.grp);
  c.grp.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose && o.dispose(); });
  for (const t of c.extra) t.dispose();
}
function updateChunks(s, budget = 1) {
  const a = Math.max(0, Math.floor((s - 300) / CHUNK)), b = Math.min(Math.floor((ROUTE_LEN - 1) / CHUNK), Math.floor((s + Q.far * 0.85) / CHUNK));
  for (const [k, c] of chunks) if (k < a - 1 || k > b + 1) { disposeChunk(c); chunks.delete(k); }
  const cur = Math.floor(s / CHUNK);
  const order = [];
  for (let k = a; k <= b; k++) if (!chunks.has(k)) order.push(k);
  order.sort((x, y) => Math.abs(x - cur) - Math.abs(y - cur));
  let built = 0;
  for (const k of order) {
    if (built >= budget) break;
    const c = buildChunk(k);
    if (c) chunks.set(k, c);
    built++;
  }
  return order.length - built;
}

// ---------------------------------------------------------------------------
function inTun(i) { return !!tunnelAt(i * DS); }
function buildRoad(ctx) {
  const { O, i0, i1 } = ctx;
  for (const tun of [false, true]) {
    for (const [f, t] of runs(i0, i1, i => inTun(i) === tun)) {
      const list = [];
      list.push(stripGeo(O, f, t, X_PAVE, -1.5, { uA: 1, uB: 0, vScale: 20 }));
      list.push(stripGeo(O, f, t, 1.5, -X_PAVE, { uA: 0, uB: 1, vScale: 20 }));
      const g = mergeGeometries(list.filter(Boolean)); list.forEach(x => x && x.dispose());
      addMesh(ctx, g, tun ? MAT.roadTun : MAT.road, { receive: !tun });
    }
  }
}

function buildMedian(ctx) {
  const { O, i0, i1 } = ctx;
  for (const [f, t] of runs(i0, i1, i => !inTun(i))) {
    addMesh(ctx, stripGeo(O, f, t, -1.5, 1.5, { y: 0.04, uA: 0, uB: 0.5, vScale: 6 }), MAT.median, { receive: true });
    const prof = [[-0.32, 0.02], [-0.18, 0.28], [-0.13, 0.82], [0.13, 0.82], [0.18, 0.28], [0.32, 0.02]];
    addMesh(ctx, sweepGeo(O, f, t, prof, { vScale: 3 }), MAT.concrete, { receive: true });
    // anti-glare panels (防眩板) every 0.9 m
    const list = [];
    for (let s = f * DS; s < t * DS; s += 0.9) {
      const p = localPt(O, s, 0, 0.82 + 0.36);
      list.push({ x: p.x, y: p.y, z: p.z, ry: p.h + 1.15 });
    }
    instanced(ctx, SHARED.panel, MAT.antiglare, list);
  }
}

function railRuns(ctx, side) {
  const { i0, i1 } = ctx;
  return runs(i0, i1, i => {
    const s = i * DS;
    if (tunnelAt(s, 2)) return false;
    if (s > ROUTE_END) return false;
    if (side < 0) { const r = rampAt(s + 2) || rampAt(s - 2); if (r) { const u = s - r.sDiv; if (u > -6 && u < r.uSep + 14) return false; } }
    if (side < 0) { const e = entryAt(s + 2) || entryAt(s - 2); if (e) { const u = s - e.s0; if (u > e.uJoin - 14 && u < ENTRY_LEN + 6) return false; } }   // the acceleration lane
    if (side < 0) { const a = saAt(s + 2) || saAt(s - 2); if (a) { const u = s - a.sDiv; if ((u > -6 && u < a.uSep + 14) || (u > SA_LOT1 + a.uJoin - 14 && u < SA_LEN + 6)) return false; } }   // a service area's lanes
    return true;
  });
}
const RAIL_PROF = [[0, 0.46], [0.05, 0.54], [0, 0.62], [0.05, 0.70], [0, 0.79]];
function buildRails(ctx) {
  const { O } = ctx;
  for (const side of [-1, 1]) {
    for (const [f, t] of railRuns(ctx, side)) {
      const prof = RAIL_PROF.map(([x, y]) => [side * (12.35 + x), y]);
      addMesh(ctx, sweepGeo(O, f, t, prof, { vScale: 4 }), MAT.guard, { cast: false });
      const posts = [];
      for (let i = f; i <= t; i++) { const p = localPt(O, i * DS, side * 12.45); posts.push({ x: p.x, y: p.y, z: p.z }); }
      instanced(ctx, SHARED.post, MAT.post, posts);
    }
  }
}

const TER_OFFS = [0, 1.2, 3.5, 7, 12, 20, 32, 50, 80, 120, 175, 250, 350];
function buildTerrain(ctx) {
  const { O, i0, i1 } = ctx;
  const n = i1 - i0 + 1, m = TER_OFFS.length;
  const col = [0, 0, 0];
  for (const side of [-1, 1]) {
    const pos = new Float32Array(n * m * 3), cl = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
    for (let j = 0; j < n; j++) {
      const i = i0 + j, s = i * DS;
      const inner = innerAt(s, side);
      let prevY = 0;
      for (let p = 0; p < m; p++) {
        const d = TER_OFFS[p], x = side * (inner + d);
        const y = terrainY(s, x, d, side);
        const slope = p === 0 ? 0 : Math.abs(y - prevY) / (TER_OFFS[p] - TER_OFFS[p - 1]);
        prevY = y;
        const k = j * m + p;
        pos[k * 3] = PX[i] + RX[i] * x - O.x; pos[k * 3 + 1] = y - O.y; pos[k * 3 + 2] = PZ[i] + RZ[i] * x - O.z;
        terrainColor(s, x, d, y, slope, col);
        cl[k * 3] = col[0]; cl[k * 3 + 1] = col[1]; cl[k * 3 + 2] = col[2];
        uv[k * 2] = x / 6; uv[k * 2 + 1] = s / 6;
      }
    }
    const idx = [];
    for (let j = 0; j < n - 1; j++) for (let p = 0; p < m - 1; p++) {
      const a = j * m + p, b = a + 1, c = a + m, d = c + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(cl, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    addMesh(ctx, g, MAT.terrain, { receive: true });

    // 法枠 lattice on steep cut slopes near the road
    const cut = i => { const s = i * DS; const inner = side < 0 ? leftInner(s) : ROAD_IN; return terrainY(s, side * (inner + 12), 12, side) - elevAt(s) > 5 && !tunnelAt(s, 2); };
    for (const [f, t] of runs(i0, i1, cut)) {
      const g2 = stripGeo(O, f, t,
        side < 0 ? (i, s) => -(leftInner(s) + 16) : ROAD_IN + 1.6,
        side < 0 ? (i, s) => -(leftInner(s) + 1.6) : ROAD_IN + 16,
        { y: (i, s, x) => terrainY(s, x, Math.abs(x) - (side < 0 ? leftInner(s) : ROAD_IN), side) - PY[i] + 0.05, uFn: (i, s, xa, xb) => [xa / 2.5, xb / 2.5], vScale: 2.5 });
      addMesh(ctx, g2, MAT.lattice, { receive: true });
    }
  }
}

const AUTUMN = [0x2f5a2a, 0x3b6a2f, 0x4b7a34, 0xa88a2c, 0xc2862a, 0xb8512a, 0x9a3a24, 0x6d7a2e];
function buildTrees(ctx) {
  const { O, i0, i1, rand } = ctx;
  const p = regionAt((i0 + i1) / 2 * DS, {});
  const n = Math.round(260 * Q.trees * (0.3 + p.forest));
  const cedars = [], broad = [];
  for (let t = 0; t < n; t++) {
    const i = i0 + Math.floor(rand() * (i1 - i0)), s = i * DS;
    const side = rand() < 0.5 ? -1 : 1;
    const d = 6 + Math.pow(rand(), 1.5) * 300;
    const inner = side < 0 ? leftInner(s) : ROAD_IN;
    const x = side * (inner + d);
    const w = waterAt(s, side);
    if (w > 0.2 && d > 10) continue;
    if (d < 15 && tunnelAt(s, 6)) continue;
    if ([[0, 0], [-5, -5], [5, -5], [5, 5], [-5, 5]].some(([a, b]) => townKeepOut(s + a, x + b) || saKeepOut(s + a, x + b))) continue;   // towns and service areas have their own trees
    const y = terrainY(s, x, d, side);
    const y2 = terrainY(s, x + side * 6, d + 6, side);
    const slope = Math.abs(y2 - y) / 6;
    const rel = y - elevAt(s);
    let prob = p.forest * 0.75 + slope * 1.2 + smooth(20, 60, rel) * 0.4 + tunnelFactor(s) * 0.6 - p.paddy * 0.45 - p.town * 0.35 - p.tea * 0.5;
    if (d < 14) prob *= 0.35;
    if (rand() > prob) continue;
    const c = localPt(O, s, x, 0);
    const cedar = vnoise(s * 0.012, x * 0.012, 3) > 0.42 || slope > 0.5;
    if (cedar) {
      const h = 9 + rand() * 9, r = 1.6 + rand() * 1.3;
      cedars.push({ x: c.x, y: y - O.y - 0.4, z: c.z, sx: r, sy: h, sz: r, c: rand() < 0.5 ? 0x22412a : 0x2b4b2e });
    } else {
      const r = 2.6 + rand() * 2.4;
      const nf = vnoise(s * 0.006, x * 0.006, 12);
      const pick = nf > 0.55 && rand() < 0.75 ? AUTUMN[3 + Math.floor(rand() * 5)] : AUTUMN[Math.floor(rand() * 3)];
      broad.push({ x: c.x, y: y - O.y + r * 0.75, z: c.z, sx: r, sy: r * (0.85 + rand() * 0.3), sz: r, ry: rand() * 3, c: pick });
    }
  }
  instanced(ctx, SHARED.cone, MAT.tree, cedars, { colors: true });
  instanced(ctx, SHARED.ico, MAT.tree, broad, { colors: true });
}

const WALLS = [0xf1ede3, 0xe7e2d6, 0xd9d4c8, 0xc9c3b4, 0xf5f5f2, 0xb9b2a5];
const ROOFS = [0x3c4148, 0x34404f, 0x4a3c34, 0x575d63, 0x2c3a52, 0x6b4a3a];
function buildHouses(ctx) {
  const { O, i0, i1, rand } = ctx;
  const p = regionAt((i0 + i1) / 2 * DS, {});
  const n = Math.round(80 * Q.houses * p.town);
  const walls = [], roofs = [];
  for (let t = 0; t < n; t++) {
    const i = i0 + Math.floor(rand() * (i1 - i0)), s = i * DS;
    const side = rand() < 0.5 ? -1 : 1;
    let d = 16 + Math.pow(rand(), 1.3) * 210;
    if (waterAt(s, side) > 0.1) continue;
    if (tunnelFactor(s) > 0.05) continue;
    const big = p.town > 0.65 && rand() < 0.12;
    const fac = !big && rand() < 0.08;
    // the size first, so that even a large building stands clear of the road (its centre at least half its size + 2 m out)
    const w = big ? 12 + rand() * 20 : fac ? 30 + rand() * 40 : 7 + rand() * 4, dd = big ? 9 + rand() * 4 : fac ? 20 + rand() * 25 : 6.5 + rand() * 3.5;
    const h = big ? 12 + rand() * 22 : fac ? 8 + rand() * 6 : rand() < 0.7 ? 6 : 3.2;
    d = Math.max(d, Math.max(w, dd) / 2 * 1.1 + 2);
    const inner = side < 0 ? leftInner(s) : ROAD_IN;
    const x = side * (inner + d);
    const hw = Math.hypot(w, dd) / 2 + 1;   // half the diagonal: clear at any turn
    if ([[0, 0], [-hw, -hw], [hw, -hw], [hw, hw], [-hw, hw]].some(([a, b]) => townKeepOut(s + a, x + b) || saKeepOut(s + a, x + b))) continue;   // towns place their own buildings
    const y = terrainY(s, x, d, side);
    const y2 = terrainY(s, x + side * 8, d + 8, side);
    if (Math.abs(y2 - y) > 2.5) continue;
    const c = localPt(O, s, x, 0);
    const ry = c.h + (rand() < 0.7 ? 0 : Math.PI / 2) + (rand() - 0.5) * 0.3;
    if (big) { // apartment block
      walls.push({ x: c.x, y: y - O.y - 0.5, z: c.z, sx: w, sy: h, sz: dd, ry, c: WALLS[Math.floor(rand() * 3)] });
    } else if (fac) { // factory / warehouse
      walls.push({ x: c.x, y: y - O.y - 0.5, z: c.z, sx: w, sy: h, sz: dd, ry, c: rand() < 0.5 ? 0xb9c0c4 : 0x9aa7b0 });
      roofs.push({ x: c.x, y: y - O.y - 0.5 + h, z: c.z, sx: w * 1.02, sy: 1.6, sz: dd * 1.02, ry, c: 0x6f7b82 });
    } else {
      walls.push({ x: c.x, y: y - O.y - 0.5, z: c.z, sx: w, sy: h + 0.5, sz: dd, ry, c: WALLS[Math.floor(rand() * WALLS.length)] });
      roofs.push({ x: c.x, y: y - O.y + h, z: c.z, sx: w * 1.15, sy: 1.8 + rand() * 0.8, sz: dd * 1.15, ry: ry + Math.PI / 2, c: ROOFS[Math.floor(rand() * ROOFS.length)] });
    }
  }
  instanced(ctx, SHARED.box, MAT.house, walls, { colors: true });
  instanced(ctx, SHARED.roof, MAT.roof, roofs, { colors: true });
}

function buildSoundWalls(ctx) {
  const { O, i0, i1 } = ctx;
  for (const side of [-1, 1]) {
    for (const [f, t] of runs(i0, i1, i => soundWallAt(i * DS, side))) {
      const x = side * 13.0;
      addMesh(ctx, sweepGeo(O, f, t, [[x, 0], [x, 2.2]], { vScale: 6, uScale: 2.2 }), MAT.wallLow);
      addMesh(ctx, sweepGeo(O, f, t, [[x, 2.2], [x, 4.4]], { vScale: 6 }), MAT.wallHigh);
      const posts = [];
      for (let i = f; i <= t; i += 1) { const p = localPt(O, i * DS, x); posts.push({ x: p.x, y: p.y, z: p.z, sy: 4.5, ry: p.h }); }
      instanced(ctx, SHARED.hpost, MAT.steelDark, posts);
    }
  }
}

function buildWater(ctx) {
  const { O, i0, i1 } = ctx;
  for (const side of [-1, 1]) {
    for (const [f, t] of runs(i0, i1, i => waterAt(i * DS, side) > 0.02)) {
      const a = side < 0 ? -900 : ROAD_IN + 24, b = side < 0 ? -(ROAD_IN + 24) : 900;
      addMesh(ctx, stripGeo(O, f, t, a, b, { yAbs: 0.2, uA: 0, uB: 1, vScale: 50 }), MAT.water);
    }
  }
}

// ---- tunnels ----------------------------------------------------------------
function boreArch(side) { // wall, arch, wall: side=-1 spans lat -1.0..-12.8
  const pts = [];
  const xi = side * 1.0, xo = side * 12.8, cx = (xi + xo) / 2, hw = Math.abs(xo - xi) / 2;
  pts.push([xi, 4.2]);
  for (let k = 1; k < 12; k++) { const a = k / 12 * Math.PI; pts.push([cx + Math.cos(a) * hw * Math.sign(xi - cx), 4.2 + Math.sin(a) * 3.4]); }
  pts.push([xo, 4.2]);
  return pts;
}
function boreProfile(side) {
  const xi = side * 1.0, xo = side * 12.8;
  return [[xi + side * 0.6, 0], [xi + side * 0.6, 0.2], [xi, 0.2], ...boreArch(side), [xo, 0.25], [xo - side * 0.7, 0.25], [xo - side * 0.7, 0]];
}
function tunnelCover(s, t) { return Math.min(11 + fbm(s * 0.0025, 31, 4, 3) * 26, 10.2 + Math.min(s - t.s0, t.s1 - s) * 0.45); }
// Cross-section strip with a per-sample list of [lat, yAbs] points (ordered by lat).
function profileStrip(O, from, to, fn, colorFn) {
  const rows = [];
  for (let i = from; i <= to; i++) rows.push(fn(i, i * DS));
  const m = rows[0].length, n = rows.length;
  const pos = new Float32Array(n * m * 3), col = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  rows.forEach((row, j) => {
    const i = from + j, s = i * DS;
    row.forEach(([lat, y], p) => {
      const k = j * m + p;
      pos[k * 3] = PX[i] + RX[i] * lat - O.x; pos[k * 3 + 1] = y - O.y; pos[k * 3 + 2] = PZ[i] + RZ[i] * lat - O.z;
      const c = colorFn(s, lat, y); col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2];
      uv[k * 2] = lat / 6; uv[k * 2 + 1] = s / 6;
    });
  });
  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let p = 0; p < m - 1; p++) { const a = j * m + p, b = a + 1, c = a + m, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function buildTunnels(ctx) {
  const { O, i0, i1, s0, s1 } = ctx;
  for (const t of TUNNELS) {
    if (t.s1 < s0 || t.s0 > s1) continue;
    const f = Math.max(i0, Math.ceil(t.s0 / DS)), to = Math.min(i1, Math.floor(t.s1 / DS));
    if (to > f) {
      for (const side of [-1, 1]) {
        const colorFn = (x, y) => (y < 2.7 ? [0.9, 0.85, 0.76] : [0.5, 0.45, 0.38]);
        addMesh(ctx, sweepGeo(O, f, to, boreProfile(side), { colorFn, vScale: 3, uScale: 3 }), MAT.tunnel);
      }
      // sodium lamps on both upper walls, fire extinguisher boxes and exit lights
      const lamps = [], reds = [], greens = [];
      for (let s = Math.max(t.s0 + 4, f * DS); s < Math.min(t.s1 - 2, to * DS); s += 7) {
        for (const lx of [-2.4, -11.4]) { const p = localPt(O, s, lx, 6.35); lamps.push({ x: p.x, y: p.y, z: p.z, ry: p.h, rz: lx < -6 ? 0.5 : -0.5 }); }
      }
      for (let s = Math.ceil(t.s0 / 50) * 50; s < Math.min(t.s1, to * DS); s += 50) if (s >= f * DS) { const p = localPt(O, s, -12.75, 1.1); reds.push({ x: p.x, y: p.y, z: p.z, sx: 0.12, sy: 0.6, sz: 0.5, ry: p.h }); }
      for (let s = Math.ceil(t.s0 / 100) * 100 + 25; s < Math.min(t.s1, to * DS); s += 100) if (s >= f * DS) { const p = localPt(O, s, -12.7, 2.4); greens.push({ x: p.x, y: p.y, z: p.z, sx: 0.08, sy: 0.3, sz: 0.9, ry: p.h }); }
      instanced(ctx, SHARED.lampBox, MAT.lamp, lamps);
      instanced(ctx, SHARED.box, MAT.red, reds);
      instanced(ctx, SHARED.box, MAT.exitGreen, greens);
      // mountain over the bores, meeting the hillside terrain 12 m out
      const col = [0, 0, 0];
      addMesh(ctx, profileStrip(O, f, to, (i, s) => {
        const C = PY[i] + tunnelCover(s, t);
        const T7L = terrainY(s, -20.2, 7, -1), T7R = terrainY(s, 20.2, 7, 1);
        return [[-25.2, terrainY(s, -25.2, 12, -1)], [-20.2, Math.max(C, T7L)], [-13.2, C], [0, C + 1.5], [13.2, C], [20.2, Math.max(C, T7R)], [25.2, terrainY(s, 25.2, 12, 1)]];
      }, (s, lat, y) => terrainColor(s, lat, 40, y, 0.6, col)), MAT.terrain, { receive: true });
    }
    for (const [ps, dirSign] of [[t.s0, 1], [t.s1, -1]]) {
      if (ps < s0 || ps >= s1) continue;
      buildPortal(ctx, t, ps, dirSign);
    }
  }
}
function buildPortal(ctx, t, ps, dirSign) {
  const { O } = ctx;
  const top = 10.9;
  const shape = new THREE.Shape();
  shape.moveTo(-17, -0.5); shape.lineTo(17, -0.5); shape.lineTo(17, top); shape.lineTo(-17, top); shape.closePath();
  for (const side of [-1, 1]) {
    const pr = boreArch(side);
    const h = new THREE.Path();
    h.moveTo(pr[0][0], -0.4);
    for (const [x, y] of pr) h.lineTo(x, y);
    h.lineTo(pr[pr.length - 1][0], -0.4);
    h.closePath();
    shape.holes.push(h);
  }
  const geo = new THREE.ShapeGeometry(shape, 6);
  // basis: shape x -> road right, y -> up, z -> -tangent
  posAt(ps, 0, _pp);
  const h = _pp.h;
  const R = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)), U = new THREE.Vector3(0, 1, 0), B = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
  const m = new THREE.Matrix4().makeBasis(R, U, B);
  m.setPosition(_pp.x - O.x, _pp.y - O.y, _pp.z - O.z);
  geo.applyMatrix4(m);
  const facade = addMesh(ctx, geo, new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0xc6c2b8, side: THREE.DoubleSide }));
  ctx.extra.push(facade.material);
  // name plate over the bore facing the traffic that enters here
  const plateMat = cachedTex('tun:' + t.jp, 512, 128, (g, w, hh) => {
    g.fillStyle = '#1f2a2a'; g.fillRect(0, 0, w, hh);
    g.strokeStyle = '#d8dcd6'; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, hh - 16);
    g.fillStyle = '#f2f2ee'; fitText(g, t.jp, w - 60, 64); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(t.jp, w / 2, hh * 0.44); g.font = font(24, 400); g.fillText(t.en, w / 2, hh * 0.8);
  });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 1.55), plateMat);
  const lat = dirSign > 0 ? -6.9 : 6.9;
  placeAt(plate, O, ps - dirSign * 0.05, lat, 8.9, dirSign > 0 ? 0 : Math.PI);
  ctx.grp.add(plate);
}

// ---- exit ramps and toll gates -----------------------------------------------
function buildRamps(ctx) {
  const { O, i0, i1, s0, s1 } = ctx;
  for (const r of RAMPS) {
    if (r.sEnd < s0 || r.sDiv > s1) continue;
    const f = Math.max(i0, Math.ceil(r.sDiv / DS)), t = Math.min(i1, Math.floor(r.sEnd / DS));
    if (t <= f) continue;
    const E = {};
    const xl = (i, s) => rampEdges(s - r.sDiv, E).xl, xr = (i, s) => rampEdges(s - r.sDiv, E).xr;
    const uFn = (i, s, a, b) => { const e = rampEdges(s - r.sDiv, E); const base = e.cx - 2.8; return [(a - base) / 5, (b - base) / 5]; };
    const iSplit = Math.round((r.sDiv + r.uSep + 6) / DS);
    for (const [ff, tt, mat] of [[f, Math.min(t, iSplit), MAT.rampA], [Math.max(f, iSplit), t, MAT.rampB]]) {
      if (tt > ff) addMesh(ctx, stripGeo(O, ff, tt, xl, xr, { y: 0.015, uFn, vScale: 24 }), mat, { receive: true });
    }
    // zebra gore (導流帯) between the diverging lanes
    const zf = Math.max(f, Math.ceil((r.sDiv + 252) / DS)), zt = Math.min(t, Math.floor((r.sDiv + r.uSep + 4) / DS));
    if (zt > zf) addMesh(ctx, stripGeo(O, zf, zt, (i, s) => Math.min(rampEdges(s - r.sDiv, E).xr, X_EDGE - 0.12), X_EDGE - 0.12, { y: 0.03, uFn: (i, s, a, b) => [a / 3, b / 3], vScale: 3 }), MAT.zebra);
    // grass between mainline and ramp after the nose
    const gf = Math.max(f, Math.ceil((r.sDiv + r.uSep) / DS));
    if (t > gf) addMesh(ctx, stripGeo(O, gf, t, (i, s) => rampEdges(s - r.sDiv, E).xr + 0.05, X_PAVE, { y: 0.0, uFn: (i, s, a, b) => [a / 6, b / 6], vScale: 6 }), MAT.grassFill, { receive: true });
    // guardrails along the ramp, ending 15 m before the plaza's bend (the town's road is wider there)
    const lf = Math.max(f, Math.ceil((r.sDiv + 110) / DS)), rtEnd = Math.min(t, Math.floor((r.sEnd - 15) / DS));
    if (rtEnd > lf) {
      addMesh(ctx, sweepGeo(O, lf, rtEnd, RAIL_PROF.map(([x, y]) => [-(x + 0.25), y]), { xFn: (i, s) => rampEdges(s - r.sDiv, E).xl, vScale: 4 }), MAT.guard);
    }
    const rf = Math.max(f, Math.ceil((r.sDiv + r.uSep + 14) / DS));
    if (rtEnd > rf) addMesh(ctx, sweepGeo(O, rf, rtEnd, RAIL_PROF.map(([x, y]) => [x + 0.25, y]), { xFn: (i, s) => rampEdges(s - r.sDiv, E).xr, vScale: 4 }), MAT.guard);
    // nose cushion drum
    const sn = r.sDiv + r.uSep + 8;
    if (sn >= s0 && sn < s1) {
      const e = rampEdges(r.uSep + 8);
      const c = localPt(O, sn, (e.xr + X_PAVE) / 2, 0);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.95, 14).translate(0, 0.475, 0), MAT.drum);
      drum.position.set(c.x, c.y, c.z); ctx.grp.add(drum);
    }
  }
  buildEntries(ctx);
  buildSaLanes(ctx);
}
// A service area's deceleration and acceleration lanes (the car park itself is the service area's own mesh).
function buildSaLanes(ctx) {
  const { O, i0, i1, s0, s1 } = ctx, E = {};
  for (const a of SAS) {
    if (a.sEnd < s0 || a.sDiv > s1) continue;
    const lane = (base, u0, u1, edges, matA, matB, uSplit) => {   // the lane's pavement from u0 to u1 (u from base)
      const f = Math.max(i0, Math.ceil((base + u0) / DS)), t = Math.min(i1, Math.floor((base + u1) / DS));
      if (t <= f) return;
      const xl = (i, s) => edges(s - base, E).xl, xr = (i, s) => edges(s - base, E).xr;
      const uFn = (i, s, x0, x1) => { const e = edges(s - base, E), b = e.cx - 2.8; return [(x0 - b) / 5, (x1 - b) / 5]; };
      const iSplit = Math.round((base + uSplit) / DS);
      for (const [ff, tt, mat] of [[f, Math.min(t, iSplit), matA], [Math.max(f, iSplit), t, matB]]) if (tt > ff) addMesh(ctx, stripGeo(O, ff, tt, xl, xr, { y: 0.015, uFn, vScale: 24 }), mat, { receive: true });
    };
    const strip = (base, u0, u1, a0, b0, mat, y, sc) => {
      const f = Math.max(i0, Math.ceil((base + u0) / DS)), t = Math.min(i1, Math.floor((base + u1) / DS));
      if (t > f) addMesh(ctx, stripGeo(O, f, t, a0, b0, { y, uFn: (i, s, x0, x1) => [x0 / sc, x1 / sc], vScale: sc }), mat, { receive: true });
    };
    const rail = (base, u0, u1, edges) => {
      const f = Math.max(i0, Math.ceil((base + u0) / DS)), t = Math.min(i1, Math.floor((base + u1) / DS));
      if (t > f) addMesh(ctx, sweepGeo(O, f, t, RAIL_PROF.map(([x, y]) => [-(x + 0.25), y]), { xFn: (i, s) => edges(s - base, E).xl, vScale: 4 }), MAT.guard);
    };
    const drum = sn => {
      if (sn < s0 || sn >= s1) return;
      const c = localPt(O, sn, X_PAVE - 1.2, 0), d = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.95, 14).translate(0, 0.475, 0), MAT.drum);
      d.position.set(c.x, c.y, c.z); ctx.grp.add(d);
    };
    // out: the lane, the zebra gore where it leaves the travel lane, grass up to the car park, the outer guardrail
    lane(a.sDiv, 0, SA_LOT0 + 6, saExitEdges, MAT.rampA, MAT.rampB, a.uSep + 6);
    strip(a.sDiv, 100, a.uSep + 4, (i, s) => Math.min(saExitEdges(s - a.sDiv, E).xr, X_EDGE - 0.12), X_EDGE - 0.12, MAT.zebra, 0.03, 3);
    strip(a.sDiv, a.uSep, SA_LOT0, (i, s) => saExitEdges(s - a.sDiv, E).xr + 0.05, X_PAVE, MAT.grassFill, 0.0, 6);
    rail(a.sDiv, 110, SA_LOT0 - 15, saExitEdges);
    drum(a.sDiv + a.uSep + 8);
    // back in: the lane, grass beside it, the zebra where it meets the travel lane, the outer guardrail where it narrows
    lane(a.sLot1, -6, SA_LEN - SA_LOT1, saEntryEdges, MAT.rampB, MAT.rampA, a.uJoin - 6);
    strip(a.sLot1, 0, a.uJoin, (i, s) => saEntryEdges(s - a.sLot1, E).xr + 0.05, X_PAVE, MAT.grassFill, 0.0, 6);
    strip(a.sLot1, a.uJoin - 4, 100, (i, s) => Math.min(saEntryEdges(s - a.sLot1, E).xr, X_EDGE - 0.12), X_EDGE - 0.12, MAT.zebra, 0.03, 3);
    rail(a.sLot1, 15, 175, saEntryEdges);
    drum(a.sLot1 + a.uJoin - 8);
  }
}
// Entrance ramps: from the town's plaza at lat -40 over to the travel lane, then an acceleration lane.
function buildEntries(ctx) {
  const { O, i0, i1, s0, s1 } = ctx;
  for (const en of ENTRIES) {
    if (en.s1 < s0 || en.s0 > s1) continue;
    const f = Math.max(i0, Math.ceil(en.s0 / DS)), t = Math.min(i1, Math.floor(en.s1 / DS));
    if (t <= f) continue;
    if (en.uJoin == null) { en.uJoin = ENTRY_LEN; for (let u = 0; u < ENTRY_LEN; u += 1) if (entryEdges(u).xr >= -12.75) { en.uJoin = u; break; } }
    const E = {}, xl = (i, s) => entryEdges(s - en.s0, E).xl, xr = (i, s) => entryEdges(s - en.s0, E).xr;
    const uFn = (i, s, a, b) => { const e = entryEdges(s - en.s0, E); const base = e.cx - 2.8; return [(a - base) / 5, (b - base) / 5]; };
    const iJoin = Math.round((en.s0 + en.uJoin - 6) / DS);
    for (const [ff, tt, mat] of [[f, Math.min(t, iJoin), MAT.rampB], [Math.max(f, iJoin), t, MAT.rampA]]) {
      if (tt > ff) addMesh(ctx, stripGeo(O, ff, tt, xl, xr, { y: 0.015, uFn, vScale: 24 }), mat, { receive: true });
    }
    // zebra where the lanes come together, grass between them before that
    const zf = Math.max(f, Math.ceil((en.s0 + en.uJoin - 4) / DS)), zt = Math.min(t, Math.floor((en.s0 + 248) / DS));
    if (zt > zf) addMesh(ctx, stripGeo(O, zf, zt, (i, s) => Math.min(entryEdges(s - en.s0, E).xr, X_EDGE - 0.12), X_EDGE - 0.12, { y: 0.03, uFn: (i, s, a, b) => [a / 3, b / 3], vScale: 3 }), MAT.zebra);
    const gt = Math.min(t, Math.floor((en.s0 + en.uJoin) / DS));
    if (gt > f) addMesh(ctx, stripGeo(O, f, gt, (i, s) => entryEdges(s - en.s0, E).xr + 0.05, X_PAVE, { y: 0.0, uFn: (i, s, a, b) => [a / 6, b / 6], vScale: 6 }), MAT.grassFill, { receive: true });
    // guardrails: the outer one up to where the lane closes in, the inner one up to the nose
    // (both start 15 m past the plaza's bend, where the town's road is wider)
    const lt = Math.min(t, Math.floor((en.s0 + 400) / DS)), gf0 = Math.max(f, Math.ceil((en.s0 + 15) / DS));
    if (lt > gf0) addMesh(ctx, sweepGeo(O, gf0, lt, RAIL_PROF.map(([x, y]) => [-(x + 0.25), y]), { xFn: (i, s) => entryEdges(s - en.s0, E).xl, vScale: 4 }), MAT.guard);
    const rt = Math.min(t, Math.floor((en.s0 + en.uJoin - 14) / DS));
    if (rt > gf0) addMesh(ctx, sweepGeo(O, gf0, rt, RAIL_PROF.map(([x, y]) => [x + 0.25, y]), { xFn: (i, s) => entryEdges(s - en.s0, E).xr, vScale: 4 }), MAT.guard);
    const sn = en.s0 + en.uJoin - 8;
    if (sn >= s0 && sn < s1) {
      const e = entryEdges(en.uJoin - 8), c = localPt(O, sn, (e.xr + X_PAVE) / 2, 0);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.95, 14).translate(0, 0.475, 0), MAT.drum);
      drum.position.set(c.x, c.y, c.z); ctx.grp.add(drum);
    }
  }
}
function buildEnd(ctx) {
  const { O, s0, s1 } = ctx;
  if (ROUTE_END < s0 || ROUTE_END >= s1) return;
  const g = new THREE.Group();
  placeAt(g, O, ROUTE_END, -6.8, 0);
  const P = new Parts();
  for (let x = -4.5; x <= 4.5; x += 1.5) P.add(new THREE.CylinderGeometry(0.3, 0.38, 0.95, 10), MAT.drum, x, 0.47, 0);
  P.box(MAT.drum, 11, 0.5, 0.15, 0, 1.25, 0.3);
  P.build(g);
  ctx.grp.add(g);
}

// ---- signs --------------------------------------------------------------------
function signBoard(w, h, mat) {
  const g = new THREE.Group();
  const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  front.position.z = 0.03; // local +Z faces drivers approaching from behind (see placeAt)
  g.add(front);
  const back = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), MAT.signBack);
  g.add(back);
  return g;
}
// The service area marks on its signs: fuel, food, toilets, as white squares with dark pictures (n: how many).
function saIcons(g, x, y, size, n = 3) {
  const draw = [
    (cx, cy, r) => { g.fillRect(cx - r * 0.45, cy - r * 0.55, r * 0.6, r * 1.1); g.fillRect(cx + 0.2 * r, cy - r * 0.35, r * 0.28, r * 0.12); g.fillRect(cx + 0.4 * r, cy - r * 0.35, r * 0.1, r * 0.7); },   // a pump
    (cx, cy, r) => { for (const dx of [-0.35, 0.3]) g.fillRect(cx + dx * r, cy - r * 0.6, r * 0.12, r * 1.2); g.fillRect(cx - 0.52 * r, cy - r * 0.6, r * 0.46, r * 0.12); },   // a fork and knife
    (cx, cy, r) => { for (const dx of [-0.3, 0.3]) { g.beginPath(); g.arc(cx + dx * r, cy - r * 0.45, r * 0.16, 0, TAU); g.fill(); g.fillRect(cx + dx * r - r * 0.14, cy - r * 0.22, r * 0.28, r * 0.75); } },   // two people
  ];
  for (let k = 0; k < n; k++) {
    const x0 = x + k * (size + 16); g.fillStyle = '#fff'; roundRect(g, x0, y, size, size, 10); g.fill();
    g.fillStyle = '#0b6b42'; draw[k](x0 + size / 2, y + size / 2, size / 2);
  }
  g.fillStyle = '#fff';
}
function postsFor(P, xs, h, r = 0.1) { for (const x of xs) P.add(new THREE.CylinderGeometry(r, r, h, 8), MAT.steel, x, h / 2, 0); }
function nextICs(fromIdx, n = 3) {
  const majors = new Set([4, 7, 9, 12]);
  const out = [];
  if (fromIdx + 1 < ICS.length) out.push(ICS[fromIdx + 1]);
  for (let i = fromIdx + 2; i < ICS.length && out.length < n; i++) if (majors.has(i) || i === ICS.length - 1) out.push(ICS[i]);
  if (out[out.length - 1] !== ICS[ICS.length - 1] && out.length >= n) out[n - 1] = ICS[ICS.length - 1];
  return out.slice(0, n);
}
function distSignTex(key, rows, kpHere) {
  return cachedTex(key, 768, 512, (g, w, h) => {
    greenSignBase(g, w, h);
    g.fillStyle = '#fff'; g.textBaseline = 'alphabetic';
    rows.forEach((ic, k) => {
      const y = 140 + k * 140;
      g.textAlign = 'left'; fitText(g, ic.jp, 400, 92); g.fillText(ic.jp, 46, y);
      g.font = font(30, 400); g.fillText(ic.en, 50, y + 36);
      const km = Math.max(1, Math.round(Math.abs(ic.kp - kpHere)));
      g.textAlign = 'right'; g.font = font(96); g.fillText(String(km), w - 120, y + 8);
      g.font = font(44); g.fillText('km', w - 44, y + 8);
    });
  });
}
function buildSigns(ctx) {
  const { O, s0, s1 } = ctx;
  for (const sg of SIGNS) {
    if (sg.s < s0 || sg.s >= s1) continue;
    const kpHere = sToKp(sg.s);
    const grp = new THREE.Group();
    const P = new Parts();
    switch (sg.t) {
      case 'kp': {   // on a ramp, at the ramp's outer edge
        const rr = rampAt(sg.s), en = rr ? null : entryAt(sg.s), xo = rr ? rampEdges(sg.s - rr.sDiv).xl : en ? entryEdges(sg.s - en.s0).xl : 0;
        placeAt(grp, O, sg.s, Math.min(-12.7, xo - 0.5), 0);
        P.add(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 6), MAT.steel, 0, 0.55, 0);
        P.build(grp);
        const mat = cachedTex('kp:' + sg.kp, 64, 96, (g, w, h) => {
          g.fillStyle = '#0b6b42'; g.fillRect(0, 0, w, h); g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
          g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(14, 400); g.fillText('kp', w / 2, 20);
          fitText(g, String(sg.kp), w - 10, 40); g.fillText(String(sg.kp), w / 2, 60);
        });
        const b = signBoard(0.32, 0.48, mat); b.position.y = 1.2; grp.add(b);
        break;
      }
      case 'exitAdv': {
        placeAt(grp, O, sg.s, 0, 0);
        const xL = gantryLeftX(sg.s), bw = -0.5 - xL, bc = (xL - 0.7) / 2;   // the beam reaches the left post
        postsFor(P, [xL, -0.75], 8.0, 0.2);
        P.box(MAT.steel, bw, 0.3, 0.3, bc, 7.75, 0); P.box(MAT.steel, bw, 0.3, 0.3, bc, 7.2, 0);
        P.build(grp);
        const ic = sg.ic, d = sg.d;
        const mat = cachedTex('exit:' + ic.jp + d, 1024, 460, (g, w, h) => {
          greenSignBase(g, w, h);
          g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
          fitText(g, ic.jp, 620, 170); g.fillText(ic.jp, 60, 205);
          g.font = font(56, 400); g.fillText(ic.en, 66, 272);
          // 出口 panel
          g.fillStyle = '#fff'; roundRect(g, 60, 318, 300, 110, 14); g.fill();
          g.fillStyle = '#0b6b42'; g.font = font(78); g.fillText('出口', 82, 400); g.font = font(30); g.fillText('EXIT', 262, 398);
          g.fillStyle = '#fff'; g.textAlign = 'right'; g.font = font(130); g.fillText(d.replace('km', '').replace('m', ''), w - 160, 420);
          g.font = font(60); g.fillText(d.endsWith('km') ? 'km' : 'm', w - 60, 420);
          // arrow toward the left lane
          g.save(); g.translate(w - 140, 150); g.rotate(-0.6); g.fillStyle = '#fff';
          g.beginPath(); g.moveTo(0, -95); g.lineTo(55, -20); g.lineTo(18, -20); g.lineTo(18, 80); g.lineTo(-18, 80); g.lineTo(-18, -20); g.lineTo(-55, -20); g.closePath(); g.fill(); g.restore();
        });
        const b = signBoard(6.2, 2.79, mat); b.position.set(-8.0, 5.9, 0.2); grp.add(b);
        break;
      }
      case 'exitNose': {
        const e = rampEdges(sg.s - sg.r.sDiv);
        placeAt(grp, O, sg.s, (e.xr + X_EDGE) / 2 - 0.4, 0);
        postsFor(P, [0], 3.4, 0.09); P.build(grp);
        const mat = cachedTex('exitNose', 384, 256, (g, w, h) => {
          greenSignBase(g, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = font(96); g.fillText('出口', w * 0.58, h * 0.4); g.font = font(40, 400); g.fillText('EXIT', w * 0.58, h * 0.76);
          g.save(); g.translate(w * 0.18, h * 0.5); g.rotate(-0.75);
          g.beginPath(); g.moveTo(0, -70); g.lineTo(40, -15); g.lineTo(13, -15); g.lineTo(13, 60); g.lineTo(-13, 60); g.lineTo(-13, -15); g.lineTo(-40, -15); g.closePath(); g.fill(); g.restore();
        });
        const b = signBoard(2.3, 1.53, mat); b.position.y = 3.0; grp.add(b);
        break;
      }
      case 'tollAdv': {
        const e = rampEdges(sg.s - sg.r.sDiv);
        placeAt(grp, O, sg.s, e.xl - 1.2, 0);
        postsFor(P, [-0.9, 0.9], 3.6, 0.08); P.build(grp);
        const mat = cachedTex('tollAdv:' + sg.r.ic.jp, 512, 320, (g, w, h) => {
          greenSignBase(g, w, h); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
          g.font = font(76); g.fillText('料金所', 40, 120); g.font = font(30, 400); g.fillText('TOLL GATE', 44, 160);
          g.fillStyle = '#5a2d8c'; roundRect(g, 40, 190, 210, 96, 12); g.fill(); g.fillStyle = '#fff'; g.font = font(60); g.fillText('ETC', 62, 262);
          g.textAlign = 'right'; g.font = font(40); g.fillText('20km/h', w - 40, 230); g.font = font(26, 400); g.fillText('以下で通過', w - 40, 270);
        });
        const b = signBoard(2.6, 1.62, mat); b.position.y = 2.6; grp.add(b);
        break;
      }
      case 'dist': {
        placeAt(grp, O, sg.s, -14.0, 0);
        postsFor(P, [-1.3, 1.3], 4.4, 0.1); P.build(grp);
        const rows = nextICs(sg.from);
        const mat = distSignTex('dist:' + sg.from, rows, sToKp(sg.s));
        const b = signBoard(3.8, 2.53, mat); b.position.y = 3.3; grp.add(b);
        break;
      }
      case 'oppDist': { // eastbound sign: we only see its back, but mirrors may show the front
        placeAt(grp, O, sg.s, 14.0, 0, Math.PI);
        postsFor(P, [-1.3, 1.3], 4.4, 0.1); P.build(grp);
        const rows = [];
        for (let i = sg.to - 1; i >= 0 && rows.length < 2; i--) if (i === 0 || i === 4 || i === 7 || i === 9 || i === sg.to - 1) rows.push(ICS[i]);
        if (rows[rows.length - 1] !== ICS[0]) rows.push(ICS[0]);
        const mat = distSignTex('odist:' + sg.to, rows.slice(0, 3), sToKp(sg.s));
        const b = signBoard(3.8, 2.53, mat); b.position.y = 3.3; grp.add(b);
        break;
      }
      case 'speed': {
        const lim = sg.force || Math.min(100, regionAt(sg.s + 50, {}).lim);
        placeAt(grp, O, sg.s, -13.0, 0);
        postsFor(P, [0], 2.9, 0.06); P.build(grp);
        const mat = cachedTex('spd:' + lim, 256, 256, (g, w, h) => {
          g.clearRect(0, 0, w, h);
          g.fillStyle = '#d0201a'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 2, 0, TAU); g.fill();
          g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, h / 2, w / 2 - 30, 0, TAU); g.fill();
          g.fillStyle = '#1f3f9a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(118); g.fillText(String(lim), w / 2, h / 2 + 6);
        });
        mat.transparent = true;
        const disc = new THREE.Mesh(new THREE.CircleGeometry(0.6, 28), mat);
        disc.position.set(0, 2.6, 0.03); grp.add(disc);
        const back = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.04, 28), MAT.signBack); back.rotation.x = Math.PI / 2; back.position.y = 2.6; grp.add(back);
        // 大型 auxiliary plate: trucks are limited to 90 anyway
        break;
      }
      case 'led': {
        placeAt(grp, O, sg.s, 0, 0);
        const xL = gantryLeftX(sg.s);
        postsFor(P, [xL, -0.75], 8.0, 0.2);
        P.box(MAT.steel, -0.5 - xL, 0.3, 0.3, (xL - 0.7) / 2, 7.75, 0);
        P.box(MAT.black, 7.4, 1.6, 0.4, -6.9, 6.5, 0);
        P.build(grp);
        const mat = cachedTex('led:' + sg.msg, 1024, 200, (g, w, h) => {
          g.fillStyle = '#0a0b09'; g.fillRect(0, 0, w, h);
          g.fillStyle = '#ffb020'; g.textAlign = 'center'; g.textBaseline = 'middle';
          let px = 120; g.font = `400 ${px}px ${LED_FONT}`; while (g.measureText(sg.msg).width > w - 80 && px > 30) { px -= 4; g.font = `400 ${px}px ${LED_FONT}`; }
          g.fillText(sg.msg, w / 2, h / 2 + 4);
          g.fillStyle = 'rgba(0,0,0,.45)'; for (let x = 0; x < w; x += 6) g.fillRect(x, 0, 2, h); for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
        });
        const face = new THREE.Mesh(new THREE.PlaneGeometry(7.1, 1.39), mat);
        face.position.set(-6.9, 6.5, 0.21); grp.add(face);
        break;
      }
      case 'gap': {
        placeAt(grp, O, sg.s, -13.2, 0);
        postsFor(P, [-0.6, 0.6], 2.6, 0.05); P.build(grp);
        const mat = cachedTex('gap:' + sg.d, 320, 200, (g, w, h) => {
          g.fillStyle = '#fafaf6'; g.fillRect(0, 0, w, h); g.strokeStyle = '#1f3f9a'; g.lineWidth = 8; g.strokeRect(6, 6, w - 12, h - 12);
          g.fillStyle = '#1f3f9a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(40); g.fillText('車間距離確認', w / 2, 56);
          g.font = font(84); g.fillText(sg.d, w / 2, 136);
        });
        const b = signBoard(1.6, 1.0, mat); b.position.y = 2.2; grp.add(b);
        break;
      }
      case 'saAdv': case 'saNext': {   // on a gantry like the exit signs: the service area 2km / 1km / 500m ahead, or the next two
        placeAt(grp, O, sg.s, 0, 0);
        const xL = gantryLeftX(sg.s), bw = -0.5 - xL, bc = (xL - 0.7) / 2;
        postsFor(P, [xL, -0.75], 8.0, 0.2);
        P.box(MAT.steel, bw, 0.3, 0.3, bc, 7.75, 0); P.box(MAT.steel, bw, 0.3, 0.3, bc, 7.2, 0);
        P.build(grp);
        const a = sg.sa, mat = sg.t === 'saAdv'
          ? cachedTex('saAdv:' + a.jp + sg.d, 1024, 460, (g, w, h) => {
            greenSignBase(g, w, h); g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
            fitText(g, a.jp, 520, 150); g.fillText(a.jp, 60, 190);
            g.font = font(110); g.fillText('SA', 70 + Math.min(520, g.measureText(a.jp).width) + 40, 190);
            g.font = font(50, 400); g.fillText(a.en, 66, 260);
            saIcons(g, 60, 300, 120);
            g.textAlign = 'right'; g.font = font(130); g.fillText(sg.d.replace('km', '').replace('m', ''), w - 160, 420);
            g.font = font(60); g.fillText(sg.d.endsWith('km') ? 'km' : 'm', w - 60, 420);
          })
          : cachedTex('saNext:' + a.jp, 1024, 460, (g, w, h) => {
            greenSignBase(g, w, h); g.fillStyle = '#fff'; g.textBaseline = 'middle';
            g.textAlign = 'left'; g.font = font(64); g.fillText('この先の SA', 50, 70);
            SAS.filter(x => x.i >= a.i).slice(0, 2).forEach((x, k) => {
              const y = 190 + k * 150, km = Math.round(x.kp - sToKp(sg.s));
              g.textAlign = 'left'; g.font = font(96); g.fillText(x.jp, 60, y);
              saIcons(g, 520, y - 50, 100, 1);
              g.textAlign = 'right'; g.font = font(96); g.fillText(String(km), w - 140, y); g.font = font(56); g.fillText('km', w - 50, y + 10);
            });
          });
        const b = signBoard(6.2, 2.79, mat); b.position.set(-8.0, 5.9, 0.2); grp.add(b);
        break;
      }
      case 'saNose': {   // at the nose where the lane leaves for the service area
        const e = saExitEdges(sg.s - sg.sa.sDiv);
        placeAt(grp, O, sg.s, (e.xr + X_EDGE) / 2 - 0.4, 0);
        postsFor(P, [0], 3.4, 0.09); P.build(grp);
        const mat = cachedTex('saNose', 384, 256, (g, w, h) => {
          greenSignBase(g, w, h); g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.font = font(80); g.fillText('SA', w * 0.6, h * 0.32); g.font = font(64); g.fillText('入口', w * 0.6, h * 0.7);
          g.save(); g.translate(w * 0.18, h * 0.5); g.rotate(-0.75);
          g.beginPath(); g.moveTo(0, -70); g.lineTo(40, -15); g.lineTo(13, -15); g.lineTo(13, 60); g.lineTo(-13, 60); g.lineTo(-13, -15); g.lineTo(-40, -15); g.closePath(); g.fill(); g.restore();
        });
        const b = signBoard(2.3, 1.53, mat); b.position.y = 3.0; grp.add(b);
        break;
      }
      case 'saMerge': {   // beside the acceleration lane
        const e = saEntryEdges(sg.s - sg.sa.sLot1);
        placeAt(grp, O, sg.s, e.xl - 1.2, 0);
        postsFor(P, [-0.7, 0.7], 3.0, 0.07); P.build(grp);
        const mat = cachedTex('saMerge', 384, 256, (g, w, h) => {
          g.fillStyle = '#f2c21b'; g.fillRect(0, 0, w, h); g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
          g.fillStyle = '#111'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(70); g.fillText('本線', w / 2, h * 0.32); g.font = font(64); g.fillText('合流注意', w / 2, h * 0.7);
        });
        const b = signBoard(1.9, 1.27, mat); b.position.y = 2.2; grp.add(b);
        break;
      }
    }
    grp.userData.sign = sg.t;
    ctx.grp.add(grp);
  }
}

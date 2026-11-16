// ---------------------------------------------------------------------------
// Town meshes, built from a loaded town's layout in short steps (townMeshSteps).
// The town's group sits at its plaza origin, turned so local x = u and local
// z = -v; local y is the height above the plaza (y0).
// ---------------------------------------------------------------------------
const TOWN_MESH = new Map();   // i -> { grp, parts, signals, heads, gates, docks, lampsOf, tris, meshes }

// Collects triangles in town coordinates; geo() makes a BufferGeometry in the group's frame.
class _TB {
  constructor() { this.p = []; this.t = []; }
  // flat triangles are turned to face up; steep ones keep the order given
  tri(a, b, c, ta = [0, 0], tb = [0, 0], tc = [0, 0]) {
    const ux = b[0] - a[0], uy = b[2] - a[2], uz = -(b[1] - a[1]), vx = c[0] - a[0], vy = c[2] - a[2], vz = -(c[1] - a[1]);
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (ny < 0 && Math.abs(ny) > 0.5 * Math.hypot(nx, ny, nz)) { [b, c] = [c, b]; [tb, tc] = [tc, tb]; }
    for (const [q, w] of [[a, ta], [b, tb], [c, tc]]) { this.p.push(q[0], q[2], -q[1]); this.t.push(w[0], w[1]); }
  }
  // a quad from four [u, v, y] corners given counter-clockwise seen from above; uv from town metres / s
  quad(a, b, c, d, s = 4) { const uv = q => [q[0] / s, q[1] / s]; this.tri(a, b, c, uv(a), uv(b), uv(c)); this.tri(a, c, d, uv(a), uv(c), uv(d)); }
  // a vertical quad over the ground segment (a, b) from y0 to y1, facing the side where the town point `to` is
  wall(a, b, y0, y1, to) {
    const right = (b[0] - a[0]) * (to[1] - a[1]) - (b[1] - a[1]) * (to[0] - a[0]) < 0;   // is `to` to the right of a -> b?
    if (!right) [a, b] = [b, a];
    this.tri([a[0], a[1], y0], [b[0], b[1], y0], [b[0], b[1], y1]); this.tri([a[0], a[1], y0], [b[0], b[1], y1], [a[0], a[1], y1]);
  }
  geo() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

function* townMeshSteps(i) {
  const T = TOWNS_LOADED.get(i), L = T.layout, site = L.site, Y = (u, v) => townHeight(site, u, v) - site.y0;
  const grp = new THREE.Group(); grp.position.set(site.ox, site.y0, site.oz); grp.rotation.y = site.hu - Math.PI / 2;
  const M = { grp, parts: {}, signals: null, heads: [], gates: { exit: null, entry: null }, docks: 0, lampIdx: new Map() };
  const add = (name, geo, mat, { cast = false, receive = true } = {}) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast && Q.shadow > 0; m.receiveShadow = receive; grp.add(m);
    M.parts[name] = (M.parts[name] || 0) + triCount(geo);
    return m;
  };
  const inst = (name, geo, mat, list, { colors = false, cast = false } = {}) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((it, k) => {
      e.set(0, it.ry || 0, 0); q.setFromEuler(e);
      im.setMatrixAt(k, m4.compose(p.set(it.u, it.y, -it.v), q, sc.set(it.sx, it.sy, it.sz)));
      if (colors) im.setColorAt(k, c.set(it.c));
    });
    im.instanceMatrix.needsUpdate = true; if (colors && im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast && Q.shadow > 0; im.receiveShadow = true; grp.add(im);
    M.parts[name] = (M.parts[name] || 0) + triCount(geo) * list.length;
    return im;
  };
  const hc = _hc, ht = _ht;
  const along = (st, a, x) => (st.axis === 'v' ? [st.c + x, a] : [a, st.c + x]);   // a point on street st: position a along it, x across

  // ---- ground: the town's flat (and sloping front) ground, and a skirt falling away behind and beside it ----
  { const B = new _TB(), step = 20;
    for (let u = -300; u < 300; u += step) for (let v = 5; v < 405; v += step) {
      const v1 = Math.min(405, v + step), q = (a, b) => [a, b, Y(a, b) - 0.05];
      B.quad(q(u, v), q(u + step, v), q(u + step, v1), q(u, v1), 6);
    }
    const ring = [];   // the town's edge (sides and back), and the same pushed out 80 m and down 8 m
    for (let v = 5; v <= 405; v += step) ring.push([-300, v]);
    for (let u = -300 + step; u <= 300; u += step) ring.push([u, 405]);
    for (let v = 405 - step; v >= 5; v -= step) ring.push([300, v]);
    const out = ([u, v]) => [u + (u <= -300 ? -80 : u >= 300 ? 80 : 0), v + (v >= 405 ? 80 : 0)];
    for (let k = 0; k + 1 < ring.length; k++) {
      const a = ring[k], b = ring[k + 1], A = out(a), Bo = out(b), ya = Y(a[0], a[1]) - 0.05, yb = Y(b[0], b[1]) - 0.05;
      B.quad([a[0], a[1], ya], [A[0], A[1], ya - 8], [Bo[0], Bo[1], yb - 8], [b[0], b[1], yb], 6);
    }
    add('ground', B.geo(), MAT.grassFill); }
  yield null;

  // ---- roads: carriageways, rounded corners, the plaza roads, yards ----
  { const B = new _TB(), r = TOWN_CORNER_R;
    for (const st of L.streets) {
      const h = hc(st), n = Math.max(1, Math.ceil((st.a1 - st.a0) / 10));
      for (let k = 0; k < n; k++) {
        const a0 = st.a0 + (st.a1 - st.a0) * k / n, a1 = st.a0 + (st.a1 - st.a0) * (k + 1) / n;
        const c = [along(st, a0, -h), along(st, a1, -h), along(st, a1, h), along(st, a0, h)].map(([u, v]) => [u, v, Y(u, v) + 0.02]);
        B.quad(c[0], c[1], c[2], c[3]);
      }
    }
    for (const nd of L.nodes) {
      const V = L.streets[nd.streets[0]], U = L.streets[nd.streets[1]];
      for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!nd.arms[sv > 0 ? 'v+' : 'v-'] || !nd.arms[su > 0 ? 'u+' : 'u-']) continue;
        const ku = nd.u + su * hc(V), kv = nd.v + sv * hc(U), cu = ku + su * r, cv = kv + sv * r, y = Y(ku, kv) + 0.02;
        const pts = []; for (let k = 0; k <= 8; k++) { const t = k / 8 * Math.PI / 2; pts.push([cu - su * r * Math.cos(t), cv - sv * r * Math.sin(t)]); }
        // fan from the kerb corner over the rounded part: (cu, kv) .. arc .. (ku, cv)
        const seq = [[cu, kv], ...pts.slice(1, -1).reverse(), [ku, cv]];   // pts run from (ku, cv) to (cu, kv)
        for (let k = 0; k + 1 < seq.length; k++) B.tri([ku, kv, y], [...seq[k], y], [...seq[k + 1], y]);
      }
    }
    for (const path of [L.plaza.exitPath, L.plaza.entryPath]) if (path) for (let k = 1; k < path.length; k++) {
      if (Math.min(Math.abs(path[k - 1][0]), Math.abs(path[k][0])) > PLAZA_BAND_U - 0.5) continue;   // the ramp's own asphalt is there
      const a = path[k - 1], b = path[k], du = b[0] - a[0], dv = b[1] - a[1], s = Math.hypot(du, dv) || 1, nu = -dv / s * 6, nv = du / s * 6;
      const q = (u, v) => [u, v, Y(u, v) + 0.03];
      B.quad(q(a[0] - nu, a[1] - nv), q(b[0] - nu, b[1] - nv), q(b[0] + nu, b[1] + nv), q(a[0] + nu, a[1] + nv));
    }
    for (const w of L.warehouses) {
      const y = w.yard, q = (u, v) => [u, v, Y(u, v) + 0.02];
      B.quad(q(y.u0, y.v0), q(y.u1, y.v0), q(y.u1, y.v1), q(y.u0, y.v1));
      const g = w.gate, lu = -g.nv, lv = g.nu, p0 = [g.u + lu * 7, g.v + lv * 7], p1 = [g.u - lu * 7, g.v - lv * 7], e = [g.nu * 1.5, g.nv * 1.5];
      B.quad(q(...p0), q(p0[0] + e[0], p0[1] + e[1]), q(p1[0] + e[0], p1[1] + e[1]), q(...p1));
    }
    add('roads', B.geo(), MAT.townRoad);
    M.parts.yards = L.warehouses.length; }
  yield null;

  // ---- pavements (15 cm up, with a kerb face), cut back at the junctions where the rounded corners take over ----
  { const B = new _TB(), r = TOWN_CORNER_R;
    for (const st of L.streets) {
      const here = L.nodes.filter(n => n.streets.includes(st.id)).map(n => ({ a: st.axis === 'v' ? n.v : n.u, cross: L.streets[n.streets.find(id => id !== st.id)], n }));
      for (const side of [-1, 1]) {
        // stretches of this side free of crossings (a crossing on this side cuts it from -hcCross - r to +hcCross + r)
        const cuts = here.filter(x => x.n.arms[st.axis === 'v' ? (side > 0 ? 'u+' : 'u-') : (side > 0 ? 'v+' : 'v-')]).map(x => [x.a - hc(x.cross) - r, x.a + hc(x.cross) + r]).sort((p, q) => p[0] - q[0]);
        let a = st.a0; const spans = [];
        for (const [c0, c1] of cuts) { if (c0 > a) spans.push([a, Math.min(c0, st.a1)]); a = Math.max(a, c1); }
        if (a < st.a1) spans.push([a, st.a1]);
        for (const [s0, s1] of spans) {
          const n = Math.max(1, Math.ceil((s1 - s0) / 10));
          for (let k = 0; k < n; k++) {
            const a0 = s0 + (s1 - s0) * k / n, a1 = s0 + (s1 - s0) * (k + 1) / n, xi = side * hc(st), xo = side * ht(st);
            const pt = (aa, x, dy) => { const [u, v] = along(st, aa, x); return [u, v, Y(u, v) + dy]; };
            B.quad(pt(a0, xi, 0.15), pt(a1, xi, 0.15), pt(a1, xo, 0.15), pt(a0, xo, 0.15));
            const p = along(st, a0, xi), q2 = along(st, a1, xi);
            B.wall(p, q2, Y(...p) + 0.02, Y(...p) + 0.15, along(st, (a0 + a1) / 2, 0));   // the kerb faces the road
          }
        }
      }
    }
    for (const nd of L.nodes) {   // the rounded corner's pavement ring
      const V = L.streets[nd.streets[0]], U = L.streets[nd.streets[1]], walk = Math.min(V.walkW, U.walkW);
      for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!nd.arms[sv > 0 ? 'v+' : 'v-'] || !nd.arms[su > 0 ? 'u+' : 'u-']) continue;
        const ku = nd.u + su * hc(V), kv = nd.v + sv * hc(U), cu = ku + su * r, cv = kv + sv * r, y = Y(ku, kv) + 0.15;
        for (let k = 0; k < 8; k++) {
          const t0 = k / 8 * Math.PI / 2, t1 = (k + 1) / 8 * Math.PI / 2, P = (rr, t) => [cu - su * rr * Math.cos(t), cv - sv * rr * Math.sin(t), y];
          B.quad(P(r, t0), P(r - walk, t0), P(r - walk, t1), P(r, t1));
          B.wall(P(r, t0), P(r, t1), y - 0.13, y, [ku, kv]);   // the kerb faces the junction
        }
      }
    }
    add('walks', B.geo(), MAT.concrete); }
  yield null;

  // ---- markings: lane lines, the centre strip (hatched, or the right-turn lanes), kerb lines, stop lines, crossings,
  // the arrows before the stop lines, 止まれ ----
  { const B = new _TB(), S = new _TB(), AR = new _TB(), lineQ = (p, q, w, y = 0.04) => {
      const du = q[0] - p[0], dv = q[1] - p[1], s = Math.hypot(du, dv) || 1, nu = -dv / s * w / 2, nv = du / s * w / 2;
      B.quad([p[0] - nu, p[1] - nv, Y(...p) + y], [q[0] - nu, q[1] - nv, Y(...q) + y], [q[0] + nu, q[1] + nv, Y(...q) + y], [p[0] + nu, p[1] + nv, Y(...p) + y]);
    };
    for (const st of L.streets) {
      const here = L.nodes.filter(n => n.streets.includes(st.id)).sort((a, b) => (st.axis === 'v' ? a.v - b.v : a.u - b.u));
      const pos = n => (st.axis === 'v' ? n.v : n.u), koOf = n => hc(L.streets[n.streets.find(id => id !== st.id)]) + 2;   // up to the crossing
      const stations = [{ a: st.a0, ko: 0 }, ...here.map(n => ({ a: pos(n), ko: koOf(n) })), { a: st.a1, ko: 0 }];
      const at = p => (st.axis === 'v' ? p[1] : p[0]), side = d => (st.axis === 'v' ? -1 : 1) * (d[1] === '+' ? 1 : -1);   // which side of the centre a way's lanes lie
      // the turn lanes on this street: along the street, the taper [a0, a1] and the lane [a1, a2], and the side
      const pockets = L.lanes.filter(l => l.pocket && l.street === st.id).map(l => ({ a0: at(l.pts[0]), a1: at(l.pts[1]), a2: at(l.pts[2]), x: side(l.dir) }));
      const inPocket = (a, x) => pockets.some(p => (x == null || p.x === x) && a >= Math.min(p.a0, p.a2) - 0.01 && a <= Math.max(p.a0, p.a2) + 0.01);
      const inLane = (a, x) => pockets.some(p => p.x === x && a >= Math.min(p.a1, p.a2) - 0.01 && a <= Math.max(p.a1, p.a2) + 0.01);
      const med = st.med || 0;
      for (let j = 0; j + 1 < stations.length; j++) {
        const a0 = stations[j].a + stations[j].ko, a1 = stations[j + 1].a - stations[j + 1].ko;
        if (a1 - a0 < 2) continue;
        for (const sx of [-1, 1]) {
          for (let a = a0 + 2; a + 5 < a1; a += 10) lineQ(along(st, a, sx * (med / 2 + st.laneW)), along(st, a + 5, sx * (med / 2 + st.laneW)), 0.15);   // between the two lanes
          lineQ(along(st, a0, sx * (hc(st) - 0.25)), along(st, a1, sx * (hc(st) - 0.25)), 0.15);                                                   // by the kerb
          // the centre strip's edge on this side: solid, but open where this side's turn lane is being entered (drawn as runs)
          let run = null;
          for (let a = a0; a < a1 - 0.01; a += 1) {
            const b = Math.min(a1, a + 1), m = (a + b) / 2, open = inPocket(m, sx) && !inLane(m, sx);
            if (!open) { if (run) run[1] = b; else run = [a, b]; }
            if ((open || b >= a1 - 0.01) && run) { lineQ(along(st, run[0], sx * med / 2), along(st, run[1], sx * med / 2), 0.15); run = null; }
          }
        }
        // the hatching across the strip where no turn lane is
        for (let a = a0 + 1; a + 2.5 < a1; a += 4) if (!inPocket(a, null) && !inPocket(a + 2.5, null)) lineQ(along(st, a, -med / 2 + 0.2), along(st, a + 2.5, med / 2 - 0.2), 0.3);
      }
    }
    yield null;
    // the arrows: 8 m before each stop line, the ways a lane may go (an atlas of 7 glyphs, one quad each)
    const GLYPHS = ['l', 's', 'r', 'ls', 'sr', 'lr', 'lsr'];
    for (const l of L.lanes) {
      if (l.stopNode == null || l.turn) continue;
      const P = l.pts[l.pts.length - 1], Q2 = l.pts[l.pts.length - 2], s = Math.hypot(P[0] - Q2[0], P[1] - Q2[1]), du = (P[0] - Q2[0]) / s, dv = (P[1] - Q2[1]) / s, w = L.streets[l.street].laneW / 2;
      lineQ([P[0] - dv * w, P[1] + du * w], [P[0] + dv * w, P[1] - du * w], 0.45);   // stop line across the lane
      const ways = l.next.map(id => L.lanes[id].turn), key = ['left', 'straight', 'right'].filter(k => ways.includes(k)).map(k => k[0]).join(''), g = GLYPHS.indexOf(key);
      if (g >= 0 && l.len > 14) {
        const c = [P[0] - du * 8, P[1] - dv * 8], hw = 0.8, hl = 2.5, y = Y(...c) + 0.045;
        const e = (k, m) => [c[0] + du * k * hl - dv * m * hw, c[1] + dv * k * hl + du * m * hw, y];   // k along (+ ahead), m across (+ left)
        const U = x => (g + x) / GLYPHS.length;   // the image's right edge (x = 1) on the lane's right (m = -1)
        AR.tri(e(-1, -1), e(-1, 1), e(1, 1), [U(1), 0], [U(0), 0], [U(0), 1]); AR.tri(e(-1, -1), e(1, 1), e(1, -1), [U(1), 0], [U(0), 1], [U(1), 1]);
      }
      if (L.nodes[l.stopNode].stop && l.k === 0) {   // 止まれ, painted before the line
        const c = [P[0] - du * 4, P[1] - dv * 4], ww = 1.4, ll = 2.8;
        const y = Y(...c) + 0.045, e = (k, m) => [c[0] + du * k * ll / 2 - dv * m * ww, c[1] + dv * k * ll / 2 + du * m * ww, y];
        S.tri(e(-1, -1), e(-1, 1), e(1, 1), [0, 0], [1, 0], [1, 1]); S.tri(e(-1, -1), e(1, 1), e(1, -1), [0, 0], [1, 1], [0, 1]);
      }
    }
    for (const nd of L.nodes) {   // crossings across each arm, 2 - 6 m out from the crossing street's kerb
      const V = L.streets[nd.streets[0]], U = L.streets[nd.streets[1]];
      for (const [arm, st, other] of [['v+', V, U], ['v-', V, U], ['u+', U, V], ['u-', U, V]]) {
        if (!nd.arms[arm]) continue;
        const sg = arm[1] === '+' ? 1 : -1, base = (st.axis === 'v' ? nd.v : nd.u) + sg * (hc(other) + 2);
        for (let x = -hc(st) + 0.5; x + 0.45 <= hc(st) - 0.3; x += 0.9) lineQ(along(st, base, x + 0.22), along(st, base + sg * 4, x + 0.22), 0.45);
      }
    }
    add('markings', B.geo(), MAT.mark);
    const tomare = cachedTex('tomare', 128, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.font = font(100); g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(w / 2, h / 2); g.fillText('止', 0, -60); g.fillText('ま', 0, 30); g.restore(); g.font = font(70); g.fillText('れ', w / 2, h - 30); });
    if (!tomare.transparent) { tomare.transparent = true; tomare.polygonOffset = true; tomare.polygonOffsetFactor = -4; tomare.polygonOffsetUnits = -8; tomare.depthWrite = false; }
    add('markings', S.geo(), tomare);
    const arrows = cachedTex('laneArrows', 7 * 64, 192, (g, w, h) => {   // white arrows on nothing, pointing up (ahead)
      g.clearRect(0, 0, w, h); g.fillStyle = '#f2f2ee'; g.strokeStyle = '#f2f2ee'; g.lineWidth = 9; g.lineCap = 'butt';
      ['l', 's', 'r', 'ls', 'sr', 'lr', 'lsr'].forEach((key, j) => {
        const cx = j * 64 + 32, base = h - 6, mid = h * 0.52;
        const head = (x, y, ang) => { g.save(); g.translate(x, y); g.rotate(ang); g.beginPath(); g.moveTo(0, -18); g.lineTo(14, 4); g.lineTo(-14, 4); g.closePath(); g.fill(); g.restore(); };
        g.beginPath(); g.moveTo(cx, base); g.lineTo(cx, mid); g.stroke();
        if (key.includes('s')) { g.beginPath(); g.moveTo(cx, mid); g.lineTo(cx, 26); g.stroke(); head(cx, 22, 0); }
        if (key.includes('l')) { g.beginPath(); g.moveTo(cx, mid); g.quadraticCurveTo(cx, mid - 30, cx - 16, mid - 30); g.stroke(); head(cx - 20, mid - 30, -Math.PI / 2); }
        if (key.includes('r')) { g.beginPath(); g.moveTo(cx, mid); g.quadraticCurveTo(cx, mid - 30, cx + 16, mid - 30); g.stroke(); head(cx + 20, mid - 30, Math.PI / 2); }
      });
    });
    if (!arrows.transparent) { arrows.transparent = true; arrows.polygonOffset = true; arrows.polygonOffsetFactor = -4; arrows.polygonOffsetUnits = -8; arrows.depthWrite = false; }
    add('markings', AR.geo(), arrows); }
  yield null;

  // ---- buildings (houses, shops, flats, factories), warehouses with their docks, bays and slots ----
  { const walls = [], gables = [], flats = [], whs = [], R = rng(31 + i);
    for (const b of L.buildings) {
      const y = Y(b.u, b.v) - 0.3;
      if (b.kind === 'warehouse') { whs.push({ u: b.u, y, v: b.v, sx: b.w, sy: b.h + 0.3, sz: b.d, c: R() < 0.5 ? 0xb9c0c4 : 0x9aa7b0 }); continue; }
      walls.push({ u: b.u, y, v: b.v, sx: b.w, sy: b.h + 0.3, sz: b.d, c: b.kind === 'shop' ? 0xe9e6dc : WALLS[Math.floor(R() * WALLS.length)] });
      // gable roofs: SHARED.roof's ridge runs along its z; the ridge follows the house's longer side
      const wide = b.w >= b.d;
      if (b.kind === 'house') gables.push({ u: b.u, y: y + b.h + 0.3, v: b.v, sx: (wide ? b.d : b.w) * 1.12, sy: 1.8 + R() * 0.8, sz: (wide ? b.w : b.d) * 1.12, ry: wide ? Math.PI / 2 : 0, c: ROOFS[Math.floor(R() * ROOFS.length)] });
      else flats.push({ u: b.u, y: y + b.h + 0.3, v: b.v, sx: b.w * 1.02, sy: 0.5, sz: b.d * 1.02, c: b.kind === 'factory' ? 0x6f7b82 : 0x8c8f92 });
    }
    inst('buildings', SHARED.box, MAT.house, walls, { colors: true, cast: true });
    inst('buildings', SHARED.roof, MAT.roof, gables, { colors: true });
    inst('buildings', SHARED.box, MAT.roof, flats, { colors: true });
    inst('warehouses', SHARED.box, MAT.house, whs, { colors: true, cast: true });
    const D = new _TB(), Bmp = [], Ln = new _TB(), Bay = new _TB();
    const lq = (p, q, w) => { const du = q[0] - p[0], dv = q[1] - p[1], s = Math.hypot(du, dv) || 1, nu = -dv / s * w / 2, nv = du / s * w / 2; Ln.quad([p[0] - nu, p[1] - nv, Y(...p) + 0.04], [q[0] - nu, q[1] - nv, Y(...q) + 0.04], [q[0] + nu, q[1] + nv, Y(...q) + 0.04], [p[0] + nu, p[1] + nv, Y(...p) + 0.04]); };
    for (const w of L.warehouses) {
      for (const d of w.docks) {
        const tu = -d.nv, tv = d.nu, y = Y(d.u, d.v), f = 0.02;   // the door just in front of the wall face, facing the yard
        const a = [d.u - tu * 1.8 + d.nu * f, d.v - tv * 1.8 + d.nv * f], b = [d.u + tu * 1.8 + d.nu * f, d.v + tv * 1.8 + d.nv * f];
        D.wall(a, b, y + 0.9, y + 4.6, [d.u + d.nu * 5, d.v + d.nv * 5]);
        for (const s of [-1, 1]) Bmp.push({ u: d.u + tu * s * 1.5 + d.nu * 0.15, y: y + 1.0, v: d.v + tv * s * 1.5 + d.nv * 0.15, sx: Math.abs(tu) > 0.5 ? 0.3 : 0.25, sy: 0.4, sz: Math.abs(tu) > 0.5 ? 0.25 : 0.3 });
        for (const s of [-1, 1]) lq([d.u + tu * s * 1.8, d.v + tv * s * 1.8], [d.u + tu * s * 1.8 + d.nu * 14, d.v + tv * s * 1.8 + d.nv * 14], 0.15);
        M.docks++;
      }
      const b = w.bay, bu = -b.hv, bv = b.hu, E = (k, m) => [b.u + b.hu * k * 9 + bu * m * 2, b.v + b.hv * k * 9 + bv * m * 2];
      const yb = Y(b.u, b.v) + 0.035; Bay.quad([...E(-1, -1), yb], [...E(1, -1), yb], [...E(1, 1), yb], [...E(-1, 1), yb], 2.5);
      for (const [p, q] of [[E(-1, -1), E(1, -1)], [E(1, -1), E(1, 1)], [E(1, 1), E(-1, 1)], [E(-1, 1), E(-1, -1)]]) lq(p, q, 0.2);
      const k = w.park, ku = -k.hv, kv = k.hu;   // the trailer slot: two white lines either side
      for (const s of [-1, 1]) lq([k.u + ku * s * 1.8 - k.hu * 2, k.v + kv * s * 1.8 - k.hv * 2], [k.u + ku * s * 1.8 - k.hu * 14, k.v + kv * s * 1.8 - k.hv * 14], 0.15);
    }
    add('warehouses', D.geo(), MAT.black);
    inst('warehouses', SHARED.box, MAT.black, Bmp);
    add('markings', Ln.geo(), MAT.mark);
    add('warehouses', Bay.geo(), MAT.bay); }
  yield null;

  // ---- fences: yard walls, hedges, closures across the street ends ----
  { const lists = { wall: [], hedge: [], closure: [] }, dims = { wall: [0.2, 2.0], hedge: [0.8, 1.0], closure: [0.35, 1.2] };
    for (const f of L.fences) {
      const du = f.u1 - f.u0, dv = f.v1 - f.v0, len = Math.hypot(du, dv);
      if (len < 0.5) continue;
      const [w, h] = dims[f.kind], cu = (f.u0 + f.u1) / 2, cv = (f.v0 + f.v1) / 2;
      lists[f.kind].push({ u: cu, y: Y(cu, cv), v: cv, sx: Math.abs(du) > Math.abs(dv) ? len : w, sy: h, sz: Math.abs(du) > Math.abs(dv) ? w : len });
    }
    inst('fences', SHARED.box, MAT.concrete, lists.wall);
    inst('fences', SHARED.box, MAT.hedge, lists.hedge);
    inst('fences', SHARED.box, MAT.drum, lists.closure); }
  yield null;

  // ---- street trees every 20 m on the pavements, clear of the junctions and the gates ----
  { const trees = [], trunks = [], R = rng(77 + i), keep = Math.max(0.3, Q.trees);
    for (const st of L.streets) for (const side of [-1, 1]) for (let a = st.a0 + 10; a < st.a1 - 10; a += 20) {
      if (R() > keep) continue;
      const [u, v] = along(st, a, side * (hc(st) + st.walkW * 0.55));
      if (L.nodes.some(n => Math.hypot(n.u - u, n.v - v) < 22)) continue;
      if (L.warehouses.some(w => Math.hypot(w.gate.u - u, w.gate.v - v) < 12)) continue;
      if (Math.abs(u) < 14 && v < 60) continue;
      const h = 4 + R() * 2, y = Y(u, v) + 0.15;
      trees.push({ u, y: y + 1.6, v, sx: 1.4 + R() * 0.6, sy: h, sz: 1.4 + R() * 0.6, c: AUTUMN[Math.floor(R() * AUTUMN.length)] });
      trunks.push({ u, y, v, sx: 1.4, sy: 1.7, sz: 1.4 });
    }
    inst('trees', SHARED.cone, MAT.tree, trees, { colors: true, cast: true });
    inst('trees', SHARED.post, MAT.black, trunks); }
  yield null;

  // ---- signals: for each approach, a pole on the far side of the junction (on the left corner's pavement), an arm
  // reaching over the lanes going on, and three lamps facing the drivers (seen from a cab stopped at the line) ----
  { const P = new Parts(), lamps = [], heads = new Map();
    for (const l of L.lanes) {
      if (l.stopNode == null || l.turn || !L.nodes[l.stopNode].signal) continue;
      const key = `${l.stopNode}:${l.dir}`;
      if (heads.has(key)) continue;
      const n = L.nodes[l.stopNode], st = L.streets[l.street], cr = L.streets[n.streets.find(id => id !== st.id)];
      const [du, dv] = _DIRV[l.dir], lu = -dv, lv = du, at = (a, x) => [n.u + du * a + lu * x, n.v + dv * a + lv * x];   // a ahead of the centre, x to the left
      const R = TOWN_CORNER_R, walk = st.walkW, over = (st.med || 0) / 2 + st.laneW;   // the head hangs over the line between the two lanes
      let pole;
      if (!n.arms[l.dir]) pole = at(hc(cr) + cr.walkW / 2, over);                                 // no way on: on the far pavement, under the head
      else if (n.arms[_TURNS[l.dir].left]) { const k = R - (R - walk / 2) * Math.SQRT1_2; pole = at(hc(cr) + k, hc(st) + k); }   // the rounded corner
      else pole = at(hc(cr) + 4, hc(st) + walk / 2);                                                // a straight kerb on the left
      const head = at(Math.max(hc(cr) + 2, (pole[0] - n.u) * du + (pole[1] - n.v) * dv), over), y = Y(...pole), hy = y + 5.4;
      P.push(pole[0], y, -pole[1]); P.cyl(MAT.steelDark, 0.13, 0.15, 5.8, 8, 0, 2.9, 0); P.pop();
      const reach = Math.hypot(head[0] - pole[0], head[1] - pole[1]);
      if (reach > 0.3) P.add(new THREE.BoxGeometry(0.12, 0.12, reach), MAT.steelDark, (pole[0] + head[0]) / 2, hy + 0.3, -(pole[1] + head[1]) / 2, 0, Math.atan2(head[0] - pole[0], -(head[1] - pole[1])), 0);   // the arm
      P.add(new THREE.BoxGeometry(1.3, 0.45, 0.35), MAT.steelDark, head[0], hy, -head[1], 0, Math.atan2(lv, lu), 0);   // the head, across the road
      // lamps: green, yellow, red from left to right as the driver sees them, on the face toward the driver
      const idx = [];
      for (const [k, x] of [[0, -0.42], [1, 0], [2, 0.42]]) {   // x: to the driver's right
        idx.push(lamps.length); lamps.push({ u: head[0] - lu * x - du * 0.19, v: head[1] - lv * x - dv * 0.19, y: hy, face: Math.atan2(-du, dv), k });
      }
      heads.set(key, { node: l.stopNode, axis: l.stopAxis, idx, state: null, u: head[0], v: head[1], y: hy });
      M.lampIdx.set(l.stopNode, [...(M.lampIdx.get(l.stopNode) || []), ...idx]);
    }
    if (lamps.length) {
      const g = new THREE.CircleGeometry(0.15, 12), im = new THREE.InstancedMesh(g, MAT.sigLamp, lamps.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), c = new THREE.Color(0x222222);
      lamps.forEach((lp, k) => { e.set(0, lp.face, 0); q.setFromEuler(e); im.setMatrixAt(k, m4.compose(p.set(lp.u, lp.y, -lp.v), q, one)); im.setColorAt(k, c); });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true; grp.add(im);
      M.signals = im; M.parts.signals = triCount(g) * lamps.length;
    }
    M.heads = [...heads.values()];
    const sb = P.build(grp); for (const m of sb) M.parts.signals = (M.parts.signals || 0) + triCount(m.geometry); }
  yield null;

  // ---- night: street lamps along the main streets (every 35 m, both sides), floodlights in the warehouse yards ----
  { const poles = [], arms = [], heads = [], pools = [];
    const lamp = (u, v, au, av, h, r) => {
      const y = Y(u, v), ya = Y(au, av), len = Math.hypot(au - u, av - v), ry = Math.atan2(au - u, -(av - v)) + Math.PI / 2;
      poles.push({ u, v, y, sx: 1, sy: h, sz: 1 });
      if (len > 0.3) arms.push({ u: (u + au) / 2, v: (v + av) / 2, y: y + h - 0.1, ry, sx: len, sy: 0.12, sz: 0.12 });
      heads.push({ u: au, v: av, y: y + h - 0.35, ry, sx: 0.7, sy: 0.18, sz: 0.4 });
      pools.push({ u: au, v: av, y: ya + 0.07, sx: r * 2, sy: 1, sz: r * 2 });
    };
    for (const st of L.streets) {
      if (st.kind !== 'main') continue;
      for (let a = st.a0 + 12; a < st.a1 - 6; a += 35) {
        const at = along(st, a, 0);
        if (L.nodes.some(n => Math.hypot(n.u - at[0], n.v - at[1]) < TOWN_CORNER_R + 12)) continue;   // not in a junction or on its rounded corners
        for (const side of [-1, 1]) { const f = along(st, a, side * (hc(st) + st.walkW - 0.5)), h = along(st, a, side * (hc(st) - 1.0)); lamp(f[0], f[1], h[0], h[1], 8, 12); }
      }
    }
    for (const w of L.warehouses) {
      const y = w.yard, cu = (y.u0 + y.u1) / 2, cv = (y.v0 + y.v1) / 2, big = (y.u1 - y.u0) * (y.v1 - y.v0) > 6000;
      const corners = [[y.u0 + 3, y.v1 - 3], [y.u1 - 3, y.v1 - 3], [y.u0 + 3, y.v0 + 3], [y.u1 - 3, y.v0 + 3]].slice(0, big ? 4 : 2);
      for (const [u, v] of corners) { const d = Math.hypot(cu - u, cv - v) || 1; lamp(u, v, u + (cu - u) / d * 2.5, v + (cv - v) / d * 2.5, 12, 18); }
    }
    inst('lamps', RS_POLE, MAT.steel, poles); inst('lamps', SHARED.box, MAT.steel, arms); inst('lamps', SHARED.box, RS_MAT.lampHead, heads);
    const pm = inst('lamps', RS.mark, RS_MAT.pool, pools); if (pm) pm.receiveShadow = false; }
  yield null;

  // ---- the toll plaza: one canopy over both gates, booths on the islands, a bar for each gate ----
  { const P = new Parts(), y = Y(0, 30);
    P.box(MAT.white, 28, 0.7, 14, 0, y + 5.9, -31);
    P.box(MAT.steel, 28.2, 0.25, 14.2, 0, y + 5.5, -31);
    for (const u of [-13, -1.5, 1.5, 13]) for (const v of [25, 37]) P.box(MAT.white, 0.6, 5.5, 0.6, u, y + 2.75, -v);
    for (const [u0, u1] of PLAZA_ISLANDS) { P.box(MAT.concrete, u1 - u0, 0.3, 14, (u0 + u1) / 2, y + 0.15, -31); P.box(MAT.drum, u1 - u0 + 0.02, 0.32, 0.6, (u0 + u1) / 2, y + 0.16, -24.2); P.box(MAT.drum, u1 - u0 + 0.02, 0.32, 0.6, (u0 + u1) / 2, y + 0.16, -37.8); }
    for (const u of [-PLAZA_LU - 3.5, PLAZA_LU + 3.5]) { P.box(MAT.white, 1.05, 2.4, 2.4, u, y + 1.5, -31); P.box(MAT.black, 1.07, 0.9, 2.0, u, y + 1.9, -31); }
    P.build(grp);
    const etc = cachedTex('etcSign', 256, 128, (c, w, h) => {
      c.fillStyle = '#5a2d8c'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 5; roundRect(c, 7, 7, w - 14, h - 14, 10); c.stroke();
      c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font(64); c.fillText('ETC', w / 2, h * 0.42); c.font = font(26); c.fillText('専用', w / 2, h * 0.78);
    });
    const tsign = cachedTex('toll:' + site.ic.jp, 512, 160, (c, w, h) => {
      greenSignBase(c, w, h); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = font(70); c.fillText(site.ic.jp + ' 料金所', w / 2, h * 0.42); c.font = font(30, 400); c.fillText('TOLL GATE', w / 2, h * 0.78);
    });
    let tolls = 0;
    for (const [key, gate] of [['exit', L.plaza.gates.exit], ['entry', L.plaza.gates.entry]]) {
      if (!(key === 'exit' ? L.plaza.exitPath : L.plaza.entryPath)) continue;
      const face = gate.dir > 0 ? -24 : -38, rot = gate.dir > 0 ? Math.PI : 0;   // the signs face the traffic coming to the gate
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.95), etc); sg.position.set(gate.u, y + 4.75, face - (gate.dir > 0 ? 0.02 : -0.02)); sg.rotation.y = rot; grp.add(sg);
      const ts = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 2.0), tsign); ts.position.set(gate.u * 1.6, y + 7.3, face - (gate.dir > 0 ? 0.02 : -0.02)); ts.rotation.y = rot; grp.add(ts);
      // the bar pivots on the island to the gate lane's right and swings up
      const pivot = new THREE.Group(), side = gate.dir > 0 ? 1 : -1;
      pivot.position.set(gate.u + side * 4.4, y + 1.05, -gate.v);   // by the middle island pivot.rotation.y = gate.dir > 0 ? 0 : Math.PI;
      pivot.add(new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.09, 0.09).translate(-2.8, 0, 0), MAT.bar)); grp.add(pivot);
      M.gates[key] = pivot; tolls++;
    }
    M.parts.toll = tolls; }
  yield null;

  M.lampsOf = n => (M.lampIdx.get(n) || []).map(k => { const c = new THREE.Color(); M.signals.getColorAt(k, c); return c; });
  TOWN_MESH.set(i, M);
  scene.add(grp);
}

const _SIG_ON = [0x2bff8a, 0xffc21c, 0xff2b18], _SIG_OFF = [0x1b3326, 0x3a3120, 0x3a1c1a], _sigC = new THREE.Color();
// Light the signal lamps for time t (only the heads whose colour changed are written).
function townSignalsUpdate(i, t) {
  const M = TOWN_MESH.get(i), L = TOWNS_LOADED.get(i) && TOWNS_LOADED.get(i).layout;
  if (!M || !M.signals || !L) return;
  let dirty = false;
  for (const h of M.heads) {
    const st = signalState(L.nodes[h.node], h.axis, t);
    if (st === h.state) continue;
    h.state = st; dirty = true;
    const on = st === 'green' ? 0 : st === 'yellow' ? 1 : 2;
    h.idx.forEach((k, j) => M.signals.setColorAt(k, _sigC.setHex(j === on ? _SIG_ON[j] : _SIG_OFF[j])));
  }
  if (dirty) M.signals.instanceColor.needsUpdate = true;
}
function townMeshDispose(i) {
  const M = TOWN_MESH.get(i);
  if (!M) return;
  scene.remove(M.grp);
  M.grp.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
  TOWN_MESH.delete(i);
}
// Triangles and draw calls of town i's meshes.
function townStats(i) {
  const M = TOWN_MESH.get(i), r = { tris: 0, meshes: 0 };
  if (!M) return r;
  M.grp.traverse(o => { if (!o.isMesh) return; r.meshes++; r.tris += triCount(o.geometry) * (o.isInstancedMesh ? o.count : 1); });
  return r;
}

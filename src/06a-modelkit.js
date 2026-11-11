// ---------------------------------------------------------------------------
// Model kit: curved parts for the tractor and its cab. Uses THREE only (no DOM),
// so the Node tests can check the shapes. Every builder returns a non-indexed
// BufferGeometry with position, normal and uv (in metres), faces pointing outward.
// ---------------------------------------------------------------------------
let DETAIL = 1;   // segment multiplier from the quality setting: high 1, mid 0.6, low 0.35
function setDetail(k) { DETAIL = k; }
function seg(n, min = 2) { return Math.max(min, Math.round(n * DETAIL)); }

const _kv = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: a => Math.hypot(a[0], a[1], a[2]),
  norm: a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
  dist: (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]),
};

// Triangles (flat arrays) -> geometry with crease-aware normals.
function _kitFinish(pos, uv, crease) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return creaseNormals(g, crease);
}

// Smooth normals across edges flatter than `deg`, hard edges elsewhere. Drops triangles with no area.
// Returns a new non-indexed geometry with position, normal, uv (zeros if the input had none) and color if present.
function creaseNormals(geo, deg = 40) {
  const src = geo.index ? geo.toNonIndexed() : geo;
  const P = src.attributes.position.array, UV = src.attributes.uv ? src.attributes.uv.array : null, C = src.attributes.color ? src.attributes.color.array : null;
  const nT = Math.floor(P.length / 9), fn = [], area = [], keep = [];
  for (let t = 0; t < nT; t++) {
    const o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], wx = P[o + 6] - P[o], wy = P[o + 7] - P[o + 1], wz = P[o + 8] - P[o + 2];
    const cx = uy * wz - uz * wy, cy = uz * wx - ux * wz, cz = ux * wy - uy * wx, l = Math.hypot(cx, cy, cz);
    if (l > 1e-10) { keep.push(t); fn.push(cx / l, cy / l, cz / l); area.push(l / 2); }
  }
  const K = keep.length, pos = new Float32Array(K * 9), nor = new Float32Array(K * 9), uv = new Float32Array(K * 6), col = C ? new Float32Array(K * 9) : null;
  for (let k = 0; k < K; k++) {
    const t = keep[k];
    pos.set(P.subarray(t * 9, t * 9 + 9), k * 9);
    if (UV) uv.set(UV.subarray(t * 6, t * 6 + 6), k * 6);
    if (col) col.set(C.subarray(t * 9, t * 9 + 9), k * 9);
  }
  // faces meeting at each position
  const at = new Map(), key = i => `${Math.round(pos[i] * 1e4)},${Math.round(pos[i + 1] * 1e4)},${Math.round(pos[i + 2] * 1e4)}`;
  for (let k = 0; k < K; k++) for (let c = 0; c < 3; c++) {
    const s = key(k * 9 + c * 3); let l = at.get(s); if (!l) at.set(s, l = []); l.push(k);
  }
  const cosT = Math.cos(deg * Math.PI / 180);
  for (let k = 0; k < K; k++) {
    const fx = fn[k * 3], fy = fn[k * 3 + 1], fz = fn[k * 3 + 2];
    for (let c = 0; c < 3; c++) {
      const i = k * 9 + c * 3;
      let nx = 0, ny = 0, nz = 0;
      for (const f of at.get(key(i))) {
        const gx = fn[f * 3], gy = fn[f * 3 + 1], gz = fn[f * 3 + 2];
        if (gx * fx + gy * fy + gz * fz >= cosT - 1e-9) { nx += gx * area[f]; ny += gy * area[f]; nz += gz * area[f]; }
      }
      const l = Math.hypot(nx, ny, nz);
      if (l > 1e-12) { nor[i] = nx / l; nor[i + 1] = ny / l; nor[i + 2] = nz / l; } else { nor[i] = fx; nor[i + 1] = fy; nor[i + 2] = fz; }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (src !== geo) src.dispose();
  return g;
}

// Join rings of equal point count, in order. A ring listed counter-clockwise when seen from where the rings
// are heading (looking back along them) gives outward faces. Caps fan from each end ring's centroid.
function loft(rings, { closed = true, capStart = false, capEnd = false, crease = 40, flip = false } = {}) {
  const V = _kv, M = rings.length, N = rings[0].length, pos = [], uv = [];
  const U = rings.map(R => { const u = [0]; for (let j = 1; j <= N; j++) { if (j === N && !closed) break; u.push(u[j - 1] + V.dist(R[j - 1], R[j % N])); } return u; });
  const W = [new Array(N).fill(0)];
  for (let i = 1; i < M; i++) W.push(rings[i].map((p, j) => W[i - 1][j] + V.dist(rings[i - 1][j], p)));
  const tri = (a, ua, b, ub, c, uc) => {
    if (flip) { const t = b; b = c; c = t; const s = ub; ub = uc; uc = s; }
    pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); uv.push(ua[0], ua[1], ub[0], ub[1], uc[0], uc[1]);
  };
  const J = closed ? N : N - 1;
  for (let i = 0; i < M - 1; i++) for (let j = 0; j < J; j++) {
    const j1 = (j + 1) % N, a = rings[i][j], b = rings[i][j1], c = rings[i + 1][j1], d = rings[i + 1][j];
    const ua = [U[i][j], W[i][j]], ub = [U[i][j + 1], W[i][j1]], uc = [U[i + 1][j + 1], W[i + 1][j1]], ud = [U[i + 1][j], W[i + 1][j]];
    tri(a, ua, b, ub, c, uc); tri(a, ua, c, uc, d, ud);
  }
  const cap = (R, end) => {
    const C = [0, 0, 0]; for (const p of R) { C[0] += p[0] / N; C[1] += p[1] / N; C[2] += p[2] / N; }
    let n = [0, 0, 0];                                     // Newell normal: along the direction the rings head
    for (let j = 0; j < N; j++) { const p = R[j], q = R[(j + 1) % N]; n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]); }
    n = V.norm(n);
    let e1 = V.sub(R[0], C); if (V.len(e1) < 1e-9) e1 = Math.abs(n[1]) < 0.9 ? V.cross([0, 1, 0], n) : V.cross([1, 0, 0], n);
    e1 = V.norm(e1); const e2 = V.cross(n, e1), uvOf = p => { const d = V.sub(p, C); return [V.dot(d, e1), V.dot(d, e2)]; }, uc = uvOf(C);
    for (let j = 0; j < J; j++) {
      const p = R[j], q = R[(j + 1) % N];
      if (end) tri(C, uc, p, uvOf(p), q, uvOf(q)); else tri(C, uc, q, uvOf(q), p, uvOf(p));
    }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[M - 1], true);
  return _kitFinish(pos, uv, crease);
}

// Move a cross-section along a path. At each point t is the path direction, side = up x t and
// vert = t x side; a profile point (a, b) goes to p + s * (a * side + b * vert), turned by `tilt` about t.
// Heading along +z with up +y, (a, b) is (x, y). `closed`: the profile is a loop. `transport`: carry the
// frame along the path without twisting (for tubes) instead of re-deriving it from `up` at every point.
function sweep(profile, path, { closed = false, up = [0, 1, 0], crease = 40, capStart = false, capEnd = false, flip = false, transport = false } = {}) {
  const V = _kv, n = path.length, rings = [];
  let side = null;
  for (let i = 0; i < n; i++) {
    const p = path[i].p, t = V.norm(V.sub(path[Math.min(n - 1, i + 1)].p, path[Math.max(0, i - 1)].p));
    let sd = null;
    if (transport && side) { sd = V.sub(side, t.map(x => x * V.dot(side, t))); if (V.len(sd) < 1e-6) sd = null; }
    if (!sd) {
      for (const u of [up, [0, 0, 1], [1, 0, 0]]) { sd = V.cross(u, t); if (V.len(sd) > 1e-6) break; }
    }
    sd = V.norm(sd); side = sd;
    const vt = V.cross(t, sd), s = path[i].s == null ? 1 : path[i].s, tl = path[i].tilt || 0, ct = Math.cos(tl), st = Math.sin(tl);
    rings.push(profile.map(([a, b]) => {
      const a2 = (a * ct - b * st) * s, b2 = (a * st + b * ct) * s;
      return [p[0] + a2 * sd[0] + b2 * vt[0], p[1] + a2 * sd[1] + b2 * vt[1], p[2] + a2 * sd[2] + b2 * vt[2]];
    }));
  }
  return loft(rings, { closed, capStart, capEnd, crease, flip });
}

// Rounded rectangle outline centred on the origin, counter-clockwise, k segments per corner.
function _kitRR(w, h, r, k) {
  const out = [], hw = w / 2 - r, hh = h / 2 - r;
  for (const [cx, cy, a0] of [[hw, -hh, -90], [hw, hh, 0], [-hw, hh, 90], [-hw, -hh, 180]]) {
    for (let i = 0; i <= k; i++) { const a = (a0 + 90 * i / k) * Math.PI / 180; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  }
  return out;
}
function roundRectPts(w, h, r, s = 4) { return _kitRR(w, h, r, seg(s, 1)); }

// Box with every edge and corner rounded by r (a box grown by a ball), centred on the origin.
function roundBox(w, h, d, r, s = 3) {
  const k = seg(s, 1), rings = [], iw = w - 2 * r, ih = h - 2 * r, hz = d / 2 - r;
  const ring = (z, rho) => _kitRR(iw + 2 * rho, ih + 2 * rho, rho, k).map(([x, y]) => [x, y, z]);
  for (let i = 0; i <= k; i++) { const phi = (90 - 90 * i / k) * Math.PI / 180; rings.push(ring(-(hz + r * Math.sin(phi)), r * Math.cos(phi))); }
  for (let i = 0; i <= k; i++) { const phi = (90 * i / k) * Math.PI / 180; rings.push(ring(hz + r * Math.sin(phi), r * Math.cos(phi))); }
  return loft(rings, { capStart: true, capEnd: true });
}

// A flat outline [[x, y], ...] pushed out from z = 0 to z = depth, its edges rounded by `bevel`.
// The outline keeps its size: the bevel is cut from inside it.
function panel(outline, depth, bevel = 0.004) {
  const shape = new THREE.Shape();
  shape.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) shape.lineTo(outline[i][0], outline[i][1]);
  shape.closePath();
  const bt = Math.min(bevel, depth / 3), core = Math.max(1e-4, depth - 2 * bt);
  const g = new THREE.ExtrudeGeometry(shape, { depth: core, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bt, bevelOffset: -bt, bevelSegments: seg(2, 1), steps: 1, curveSegments: 1 });
  g.translate(0, 0, bt);
  const out = creaseNormals(g, 40); g.dispose();
  return out;
}

// Turn a profile [[r, y], ...] (bottom to top) about the y axis. Ends are open unless the profile reaches r = 0.
function lathe(profile, n = 24, { crease } = {}) {
  const k = seg(n, 3);
  const rings = profile.map(([r, y]) => Array.from({ length: k }, (_, j) => { const a = j / k * Math.PI * 2; return [r * Math.cos(a), y, -r * Math.sin(a)]; }));
  return loft(rings, { closed: true, crease: crease == null ? Math.max(40, 360 / k + 5) : crease });
}

// Round tube of radius r through points [[x, y, z], ...]. Open tubes get end caps.
function tube(points, r, n = 8, closed = false) {
  const k = seg(n, 3), prof = Array.from({ length: k }, (_, j) => { const a = j / k * Math.PI * 2; return [r * Math.cos(a), r * Math.sin(a)]; });
  const pts = closed ? [...points, points[0]] : points;
  return sweep(prof, pts.map(p => ({ p })), { closed: true, transport: true, capStart: !closed, capEnd: !closed, crease: Math.min(130, 360 / k + 5) });
}

// Write a grey level per vertex (0..1, from fn(x, y, z, nx, ny, nz)) as vertex colour: darkens gaps and recesses.
function shade(geo, fn) {
  const P = geo.attributes.position, N = geo.attributes.normal, c = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const v = clamp(fn(P.getX(i), P.getY(i), P.getZ(i), N ? N.getX(i) : 0, N ? N.getY(i) : 0, N ? N.getZ(i) : 0), 0, 1);
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}

// Triangles in a geometry, or in every mesh under an object.
function triCount(o) {
  if (o.isBufferGeometry) return (o.index ? o.index.count : o.attributes.position.count) / 3;
  let n = 0;
  o.traverse(m => { if (m.isMesh && m.geometry) n += triCount(m.geometry); });
  return n;
}

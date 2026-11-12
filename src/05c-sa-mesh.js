// ---------------------------------------------------------------------------
// Service area meshes, built from a loaded layout in short steps (saMeshSteps).
// The group sits at the road point in the car park's middle (u = 330, v = 0),
// not turned: every point goes through posAt, so the car park follows the road.
// ---------------------------------------------------------------------------
const SA_MESH = new Map();   // k -> { grp, parts }
// a service area point (u, v) at height y above the road there, in the group's frame
function saLocal(sa, O, u, v, y = 0, out = []) {
  const p = posAt(sa.sDiv + u, -v, _saP);
  out[0] = p.x - O.x; out[1] = p.y + y - O.y; out[2] = p.z - O.z;
  return out;
}
const _saP = {};
// the world heading of a direction (hu, hv) at u
const saHeading = (sa, u, hu, hv) => headingAt(sa.sDiv + u) + Math.atan2(hv, hu);

// Flat pieces in the group's frame: quads over boxes of (u, v), cut every 10 m along u so they follow the road.
class _SB {
  constructor(sa, O) { this.sa = sa; this.O = O; this.p = []; this.t = []; }
  quad4(a, b, c, d, y, s = 4) {   // corners [u, v] in order round the quad; each triangle is turned to face up
    const P = q => saLocal(this.sa, this.O, q[0], q[1], y, []);
    for (const tri of [[a, b, c], [a, c, d]]) {
      let [p0, p1, p2] = tri.map(P), [t0, t1, t2] = tri;
      const ny = (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]);
      if (ny < 0) { [p1, p2] = [p2, p1]; [t1, t2] = [t2, t1]; }
      for (const [p, t] of [[p0, t0], [p1, t1], [p2, t2]]) { this.p.push(p[0], p[1], p[2]); this.t.push(t[0] / s, t[1] / s); }
    }
  }
  box(u0, u1, v0, v1, y, s = 4, vFn = null) {   // vFn(u): the box's top edge where it narrows
    for (let u = u0; u < u1 - 1e-6; u += 10) {
      const ua = u, ub = Math.min(u1, u + 10), va = vFn ? vFn(ua) : v1, vb = vFn ? vFn(ub) : v1;
      this.quad4([ua, v0], [ub, v0], [ub, vb], [ua, va], y, s);
    }
  }
  // a thin strip from p to q (a painted line), w wide
  line(p, q, w, y) {
    const du = q[0] - p[0], dv = q[1] - p[1], L = Math.hypot(du, dv) || 1, nu = -dv / L * w / 2, nv = du / L * w / 2;
    this.quad4([p[0] - nu, p[1] - nv], [q[0] - nu, q[1] - nv], [q[0] + nu, q[1] + nv], [p[0] + nu, p[1] + nv], y, 1);
  }
  geo() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.computeVertexNormals(); g.computeBoundingSphere();
    return g;
  }
}

function* saMeshSteps(k) {
  const A = SA_LOADED.get(k), L = A.layout, sa = L.sa;
  const o = posAt(sa.sDiv + 330, 0, {}), O = { x: o.x, y: o.y, z: o.z };
  const grp = new THREE.Group(); grp.position.set(O.x, O.y, O.z);
  const M = { grp, parts: {} };
  const add = (name, geo, mat, { cast = false, receive = true } = {}) => {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, mat); m.castShadow = cast && Q.shadow > 0; m.receiveShadow = receive; grp.add(m);
    M.parts[name] = (M.parts[name] || 0) + triCount(geo);
    return m;
  };
  // instances: { u, v, y, ry (world heading), sx, sy, sz, c }
  const inst = (name, geo, mat, list, { colors = false, cast = false } = {}) => {
    if (!list.length) return null;
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color(), w = [];
    list.forEach((it, n) => {
      saLocal(sa, O, it.u, it.v, it.y || 0, w); e.set(0, it.ry != null ? it.ry : headingAt(sa.sDiv + it.u), 0); q.setFromEuler(e);
      im.setMatrixAt(n, m4.compose(p.set(w[0], w[1], w[2]), q, sc.set(it.sx || 1, it.sy || 1, it.sz || 1)));
      if (colors) im.setColorAt(n, c.set(it.c));
    });
    im.instanceMatrix.needsUpdate = true; if (colors && im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast && Q.shadow > 0; im.receiveShadow = true; grp.add(im);
    M.parts[name] = (M.parts[name] || 0) + triCount(geo) * list.length;
    return im;
  };
  const R = rng(911 + 37 * k + 5 * L.visit);

  // ---- ground: grass under everything, asphalt over the paved boxes and the throat to the exit lane ----
  { const G = new _SB(sa, O), P = new _SB(sa, O);
    G.box(SA_LOT0, SA_LOT1, 13.6, 102, -0.05, 6);
    for (const [u0, u1, v0, v1] of L.paved) P.box(u0, u1, v0, v1, 0.02, 6);
    const top = L.fallback ? 80 : 56;
    P.box(420, 460, 18, top, 0.02, 6, u => top - (u - 420) * (top - 27) / 40);
    P.box(SA_LOT0 - 6, SA_LOT0 + 4, 18, 26, 0.02, 6); P.box(SA_LOT1 - 4, SA_LOT1 + 6, 18, 26, 0.02, 6);
    add('ground', G.geo(), MAT.grassFill); add('paved', P.geo(), MAT.townRoad); }
  yield null;

  // ---- kerbs, walkway, islands, planted islands; the painted lines and arrows ----
  { const W = new _SB(sa, O), Pl = new _SB(sa, O), Ln = new _SB(sa, O);
    for (const [u0, u1, v0, v1] of L.walk) W.box(u0, u1, v0, v1, 0.15, 3);
    for (const p of L.islands) W.box(p.u0, p.u1, p.v0, p.v1, 0.2, 3);
    for (const p of L.planted) Pl.box(p.u0, p.u1, p.v0, p.v1, 0.12, 4);
    const y = 0.05, side = (s, k2) => { const nu = -s.hv * s.w / 2 * k2, nv = s.hu * s.w / 2 * k2, h = s.len / 2; Ln.line([s.u - s.hu * h + nu, s.v - s.hv * h + nv], [s.u + s.hu * h + nu, s.v + s.hv * h + nv], 0.15, y); };
    for (const s of L.stalls) { side(s, 1); side(s, -1); }
    for (const p of L.pumps) { side(p, 1); side(p, -1); }
    if (L.carPark) for (const row of L.carPark.rows) for (let u = L.carPark.u0; u <= L.carPark.u1; u += L.carPark.slotW) Ln.line([u, row.v - 2.5], [u, row.v + 2.5], 0.12, y);
    // arrows along the one-way aisles: a shaft and a head, pointing toward +u
    const arrow = (u, v) => { Ln.line([u - 3, v], [u + 1, v], 0.35, y); Ln.quad4([u + 1, v - 0.9], [u + 3, v], [u + 3, v], [u + 1, v + 0.9], y, 1); };
    for (const u of [200, 300]) arrow(u, 23);
    for (const u of [300, 410]) arrow(u, 51);
    add('kerbs', W.geo(), MAT.concrete); add('planted', Pl.geo(), MAT.hedge); add('markings', Ln.geo(), MAT.mark); }
  yield null;

  // ---- the building, the fuel canopy and its pumps, the hedge along the back ----
  { const boxes = [], whites = [], darks = [];
    const b = L.building;
    if (b) {
      const WALLC = [0xe9e4d8, 0xdfe3e6, 0xeadfcf, 0xd8d2c4], c = WALLC[Math.floor(b.hue * WALLC.length) % WALLC.length];
      const cu = (b.u0 + b.u1) / 2, cv = (b.v0 + b.v1) / 2;
      boxes.push({ u: cu, v: cv, sx: b.v1 - b.v0, sy: b.h, sz: b.u1 - b.u0, c });   // SHARED.box: x across (v), z along (u)
      boxes.push({ u: cu, v: cv, y: b.h, sx: b.v1 - b.v0 + 1.2, sy: 0.6, sz: b.u1 - b.u0 + 1.2, c: 0x5b6670 });
      darks.push({ u: cu, v: b.v0 - 0.05, y: 0.9, sx: 0.12, sy: 2.2, sz: b.u1 - b.u0 - 6 });   // the glass front toward the car park
    }
    const cp = L.canopy;
    if (cp) {   // the roof on its own, so it can be hidden when an outside camera is above it
      const roof = inst('canopy', SHARED.box, MAT.white, [{ u: (cp.u0 + cp.u1) / 2, v: (cp.v0 + cp.v1) / 2, y: cp.h, sx: cp.v1 - cp.v0, sy: 0.9, sz: cp.u1 - cp.u0 }], { cast: true });
      M.roof = roof; M.roofBox = cp;
      for (const [u, v] of cp.pillars) whites.push({ u, v, sx: 0.6, sy: cp.h, sz: 0.6 });
      for (const isl of L.islands) for (const u of [372, 382]) { const v = (isl.v0 + isl.v1) / 2; whites.push({ u, v, y: 0.2, sx: 0.8, sy: 1.7, sz: 1.1 }); darks.push({ u, v, y: 1.1, sx: 0.85, sy: 0.5, sz: 0.7 }); }
    }
    if (!L.fallback) for (let u = SA_LOT0; u < SA_LOT1; u += 6) boxes.push({ u: u + 3, v: 101.5, sx: 1.2, sy: 1.1, sz: 6, c: 0x3f6b35 });
    inst('building', SHARED.box, MAT.house, boxes, { colors: true, cast: true });
    inst('canopy', SHARED.box, MAT.white, whites, { cast: true });
    inst('canopy', SHARED.box, MAT.black, darks); }
  yield null;

  // ---- shrubs on the planted islands and in the strip by the road, trees along the back ----
  { const shrubs = [], trees = [], n = Q.trees;
    const scatter = (u0, u1, v0, v1, per, out, sz) => { const cnt = Math.round((u1 - u0) * (v1 - v0) / per * n); for (let i = 0; i < cnt; i++) out.push({ u: u0 + R() * (u1 - u0), v: v0 + R() * (v1 - v0), y: 0.1, ...sz(), c: [0x3d6b33, 0x4b7a3a, 0x355e2e][Math.floor(R() * 3)] }); };
    scatter(190, 455, 13.8, 16.6, 6, shrubs, () => ({ sx: 1.1, sy: 0.8, sz: 1.1 }));
    for (const p of L.planted) scatter(p.u0 + 1, p.u1 - 1, p.v0 + 1, p.v1 - 1, 9, shrubs, () => ({ sx: 1.2, sy: 0.9 + R() * 0.5, sz: 1.2 }));
    if (!L.fallback) for (let u = SA_LOT0 + 8; u < SA_LOT1; u += 16 / n) trees.push({ u: u + R() * 4, v: 104 + R() * 4, y: 0, sx: 2.2, sy: 6 + R() * 3, sz: 2.2, c: AUTUMN[Math.floor(R() * 3)] });
    inst('plants', SHARED.ico, MAT.tree, shrubs, { colors: true });
    inst('plants', SHARED.cone, MAT.tree, trees, { colors: true, cast: true }); }
  yield null;

  // ---- parked vehicles: one instanced mesh per kind and part (the car park's cars are plain boxes on low quality) ----
  { const plain = Q.detail < 0.5, byKind = new Map(), boxesC = [];
    for (const c of L.cars) {
      const cols = CAR_COLORS[c.kind === 'truck' ? 'truck' : c.kind], col = cols[Math.floor(R() * cols.length)];
      const it = { u: c.u, v: c.v, ry: saHeading(sa, c.u, c.hu, c.hv) + Math.PI, c: col };
      if (plain && c.kind !== 'truck') { boxesC.push({ ...it, sx: c.wid, sy: 1.45, sz: c.len }); continue; }
      if (!byKind.has(c.kind)) byKind.set(c.kind, []);
      byKind.get(c.kind).push(it);
    }
    const paint = new THREE.MeshPhongMaterial({ color: 0xffffff, specular: 0x666666, shininess: 60 });
    M.paint = paint;
    for (const [kind, list] of byKind) {
      const P = PROTOS[kind];
      inst('cars', P.body, paint, list, { colors: true, cast: kind === 'truck' });
      inst('cars', P.det, CAR_DET, list); inst('cars', P.lit, CAR_LIT, list);
    }
    inst('cars', SHARED.box, paint, boxesC, { colors: true }); }
  yield null;

  // ---- the signs inside: 大型車, 給油所, 出口 on posts ----
  { const P = new Parts();
    for (const sg of L.signs) {
      const g = new THREE.Group(), w = saLocal(sa, O, sg.u, sg.v, 0);
      g.position.set(w[0], w[1], w[2]); g.rotation.y = headingAt(sa.sDiv + sg.u) + Math.PI;
      const mat = cachedTex('saIn:' + sg.text, 256, 128, (c, W, H) => { greenSignBase(c, W, H); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; fitText(c, sg.text, W - 30, 64); c.fillText(sg.text, W / 2, H / 2 + 2); });
      const b = signBoard(1.8, 0.9, mat); b.position.y = 2.4; g.add(b);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.0, 6).translate(0, 1.0, 0), MAT.steel); g.add(post);
      grp.add(g); M.parts.signs = (M.parts.signs || 0) + 40;
    }
    void P; }
  yield null;

  SA_MESH.set(k, M);
  scene.add(grp);
}
// Hide the fuel canopy's roof while the camera is over it and above its underside (the view from behind the rig).
const _scp = { i: 0, s: 0, lat: 0 };
function saCanopyUpdate(cam) {
  for (const [k, M] of SA_MESH) {
    if (!M.roof) continue;
    const a = SAS[k], c = M.roofBox, p = cam.getWorldPosition(_scv);
    project(p.x, p.z, Math.max(0, Math.floor((a.sDiv + (c.u0 + c.u1) / 2) / DS)), _scp);
    const u = _scp.s - a.sDiv, v = -_scp.lat, over = u > c.u0 - 25 && u < c.u1 + 10 && v > c.v0 - 12 && v < c.v1 + 12 && p.y > elevAt(_scp.s) + c.h - 0.5;
    M.roof.visible = !over;
  }
}
const _scv = new THREE.Vector3();
function saMeshDispose(k) {
  const M = SA_MESH.get(k);
  if (!M) return;
  scene.remove(M.grp);
  M.grp.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); if (o.isInstancedMesh && o.dispose) o.dispose(); });
  if (M.paint) M.paint.dispose();
  SA_MESH.delete(k);
}
// Triangles and draw calls of service area k's meshes.
function saStats(k) {
  const M = SA_MESH.get(k), r = { tris: 0, meshes: 0 };
  if (!M) return r;
  M.grp.traverse(o => { if (!o.isMesh) return; r.meshes++; r.tris += triCount(o.geometry) * (o.isInstancedMesh ? o.count : 1); });
  return r;
}

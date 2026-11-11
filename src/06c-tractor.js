// ---------------------------------------------------------------------------
// 4x2 tractor modelled on the S-series photos (right-hand drive, as sold in Japan)
// and the two trailers. Materials are in 06b-materials.js. Local frame: -Z forward, +X right, +Y up; tractor
// origin = rear axle on the ground. Maker badges are left blank on purpose.
// ---------------------------------------------------------------------------
function plateTexture(top, bottom) {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#1e6a3b'; roundRect(g, 0, 0, 256, 128, 10); g.fill();
  g.strokeStyle = '#d9e8dc'; g.lineWidth = 3; roundRect(g, 4, 4, 248, 120, 8); g.stroke();
  g.fillStyle = '#f4f7f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font(30); g.fillText(top, 128, 32);
  g.font = font(64); g.fillText(bottom, 140, 88);
  g.font = font(26); g.fillText('か', 30, 92);
  return canvasTex(c);
}
const PLATE_MAT = new THREE.MeshBasicMaterial({ map: plateTexture('品川 100', '23-45') });

const LOGO_TEX = (() => {
  const W = 1024, H = 190, c = makeCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#c8231c'; g.beginPath(); g.arc(96, 92, 66, 0, TAU); g.fill();
  g.fillStyle = '#1c2b52'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `400 104px "Dela Gothic One",${JP_FONT}`; g.fillText('日之出運輸', 190, 116);
  g.font = font(30); g.fillText('HINODE TRANSPORT', 196, 160);
  g.font = font(26, 400); g.textAlign = 'right'; g.fillText('東京 · 静岡 · 名古屋', W - 24, 160);
  g.fillStyle = '#c8231c'; g.fillRect(190, 176, W - 214, 8);
  return canvasTex(c, { aniso: 8 });
})();
const LOGO_MAT = new THREE.MeshPhongMaterial({ map: LOGO_TEX, transparent: true, shininess: 30, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

// ---- cab body: lofted horizontal sections of a rounded rectangle ----------------
// y: height, zf/zr: front/rear face, w: half width, rf/rr: front/rear corner radius
const CAB_SECTIONS = [
  { y: 1.22, zf: -5.40, zr: -3.12, w: 1.235, rf: 0.16, rr: 0.05 },
  { y: 1.62, zf: -5.45, zr: -3.12, w: 1.25, rf: 0.20, rr: 0.05 },
  { y: 2.10, zf: -5.48, zr: -3.12, w: 1.25, rf: 0.24, rr: 0.05 },
  { y: 2.24, zf: -5.42, zr: -3.12, w: 1.25, rf: 0.25, rr: 0.05 },
  { y: 3.30, zf: -5.27, zr: -3.12, w: 1.245, rf: 0.27, rr: 0.05 },
  { y: 3.48, zf: -5.24, zr: -3.12, w: 1.24, rf: 0.27, rr: 0.06 },
  { y: 3.92, zf: -5.14, zr: -3.13, w: 1.235, rf: 0.29, rr: 0.07 },
  { y: 3.99, zf: -5.05, zr: -3.17, w: 1.19, rf: 0.30, rr: 0.09 },
  { y: 4.02, zf: -4.93, zr: -3.24, w: 1.12, rf: 0.30, rr: 0.09 },
];
function cabSectionAt(y) {
  const S = CAB_SECTIONS;
  if (y <= S[0].y) return S[0];
  for (let i = 0; i < S.length - 1; i++) {
    if (y <= S[i + 1].y) {
      const a = S[i], b = S[i + 1], t = (y - a.y) / (b.y - a.y), o = { y };
      for (const k of ['zf', 'zr', 'w', 'rf', 'rr']) o[k] = lerp(a[k], b[k], t);
      return o;
    }
  }
  return S[S.length - 1];
}
const zfAt = y => cabSectionAt(y).zf;
const RING_N = 46;
function ringPts(sec) { // clockwise seen from above, starting at the front-left of the front face
  const { zf, zr, w, rf, rr } = sec, pts = [], NC = 6;
  for (let i = 0; i <= 6; i++) pts.push([lerp(-(w - rf), w - rf, i / 6), zf]);
  for (let i = 1; i < NC; i++) { const a = -Math.PI / 2 + Math.PI / 2 * i / NC; pts.push([w - rf + Math.cos(a) * rf, zf + rf + Math.sin(a) * rf]); }
  for (let i = 0; i <= 5; i++) pts.push([w, lerp(zf + rf, zr - rr, i / 5)]);
  for (let i = 1; i < NC; i++) { const a = Math.PI / 2 * i / NC; pts.push([w - rr + Math.cos(a) * rr, zr - rr + Math.sin(a) * rr]); }
  for (let i = 0; i <= 6; i++) pts.push([lerp(w - rr, -(w - rr), i / 6), zr]);
  for (let i = 1; i < NC; i++) { const a = Math.PI / 2 + Math.PI / 2 * i / NC; pts.push([-(w - rr) + Math.cos(a) * rr, zr - rr + Math.sin(a) * rr]); }
  for (let i = 0; i <= 5; i++) pts.push([-w, lerp(zr - rr, zf + rf, i / 5)]);
  for (let i = 1; i < NC; i++) { const a = Math.PI + Math.PI / 2 * i / NC; pts.push([-(w - rf) + Math.cos(a) * rf, zf + rf + Math.sin(a) * rf]); }
  return pts;
}
function ringNormal(pts, p) {
  const a = pts[(p - 1 + RING_N) % RING_N], b = pts[(p + 1) % RING_N];
  const tx = b[0] - a[0], tz = b[1] - a[1], l = Math.hypot(tx, tz) || 1;
  return [tz / l, -tx / l];
}
function loftCabGeo() {
  const rings = CAB_SECTIONS.map(sec => ringPts(sec).map(([x, z]) => [x, sec.y, z]));
  const R = rings.length, M = RING_N, pos = [], idx = [];
  rings.forEach(r => r.forEach(p => pos.push(...p)));
  for (let k = 0; k < R - 1; k++) for (let p = 0; p < M; p++) {
    const q = (p + 1) % M, a = k * M + p, b = k * M + q, c = (k + 1) * M + p, d = (k + 1) * M + q;
    idx.push(a, c, b, b, c, d);
  }
  for (const [ring, top] of [[rings[R - 1], true], [rings[0], false]]) {
    const base = pos.length / 3;
    let cx = 0, cz = 0; ring.forEach(p => { cx += p[0]; cz += p[2]; });
    pos.push(cx / M, ring[0][1], cz / M);
    ring.forEach(p => pos.push(...p));
    for (let p = 0; p < M; p++) { const a = base + 1 + p, b = base + 1 + (p + 1) % M; if (top) idx.push(base, b, a); else idx.push(base, a, b); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// A patch of the body surface over ring columns `cols`, offset along the surface normal.
const WS_COLS = [43, 44, 45, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
function bodyPatch(y0, y1, cols, off, rows, outward) {
  const pos = [], idx = [], uv = [], m = cols.length;
  for (let r = 0; r <= rows; r++) {
    const y = lerp(y0, y1, r / rows), pts = ringPts(cabSectionAt(y));
    cols.forEach((c, j) => { const p = pts[c], n = ringNormal(pts, c); pos.push(p[0] + n[0] * off, y, p[1] + n[1] * off); uv.push(j / (m - 1), r / rows); });
  }
  for (let r = 0; r < rows; r++) for (let j = 0; j < m - 1; j++) {
    const a = r * m + j, b = a + 1, c = a + m, d = c + 1;
    if (outward) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Flat polygon in the plane x = const; pts are [z, y]. facing = +1 / -1 along x.
function polyOnX(x, pts, facing) {
  const tris = THREE.ShapeUtils.triangulateShape(pts.map(([z, y]) => new THREE.Vector2(z, y)), []);
  const pos = [];
  for (const [ia, ib, ic] of tris) {
    let A = pts[ia], B = pts[ib], C = pts[ic];
    const nx = (B[1] - A[1]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[1] - A[1]);
    if (Math.sign(nx) !== facing) [B, C] = [C, B];
    for (const P of [A, B, C]) pos.push(x, P[1], P[0]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
// Coiled air / electric line: a helix wound around a sagging curve.
function coilGeo(p0, p1, sag, turns, radius, tube) {
  const A = new THREE.Vector3(...p0), C = new THREE.Vector3(...p1);
  const B = A.clone().lerp(C, 0.5); B.y -= sag;
  const up = new THREE.Vector3(1, 0, 0);
  class Helix extends THREE.Curve {
    getPoint(t, target = new THREE.Vector3()) {
      const u = 1 - t;
      const P = new THREE.Vector3(u * u * A.x + 2 * u * t * B.x + t * t * C.x, u * u * A.y + 2 * u * t * B.y + t * t * C.y, u * u * A.z + 2 * u * t * B.z + t * t * C.z);
      const Tg = B.clone().sub(A).multiplyScalar(2 * u).add(C.clone().sub(B).multiplyScalar(2 * t)).normalize();
      const N = new THREE.Vector3().crossVectors(Tg, up).normalize(), Bn = new THREE.Vector3().crossVectors(Tg, N);
      const a = t * turns * TAU;
      return target.copy(P).addScaledVector(N, Math.cos(a) * radius).addScaledVector(Bn, Math.sin(a) * radius);
    }
  }
  return new THREE.TubeGeometry(new Helix(), Math.round(turns * 14), tube, 5, false);
}
function tubeGeo(points, r, seg = 16) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), seg, r, 6, false);
}

function makeWheel(dual, side) {
  const g = new THREE.Group();
  const P = new Parts();
  const tw = dual ? 0.28 : 0.31;
  const offs = dual ? [-0.16, 0.16] : [0];
  for (const o of offs) {
    P.add(new THREE.CylinderGeometry(0.52, 0.52, tw, 26), TM.tire, o, 0, 0, 0, 0, Math.PI / 2);
    P.add(new THREE.TorusGeometry(0.47, 0.05, 6, 26), TM.tire, o + side * (tw / 2 - 0.04), 0, 0, 0, Math.PI / 2, 0);
  }
  const outer = side * (dual ? 0.16 + tw / 2 : tw / 2);
  // polished aluminium disc with a raised rim lip and hand holes
  P.add(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 26), TM.rim, outer - side * 0.01, 0, 0, 0, 0, Math.PI / 2);
  P.add(new THREE.TorusGeometry(0.315, 0.022, 6, 26), TM.rim, outer, 0, 0, 0, Math.PI / 2, 0);
  P.add(new THREE.CylinderGeometry(0.14, 0.16, 0.1, 16), TM.chrome, outer + side * 0.035, 0, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU;
    P.add(new THREE.CylinderGeometry(0.019, 0.019, 0.06, 6), TM.chrome, outer + side * 0.03, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, Math.PI / 2);
  }
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU + 0.31;
    P.add(new THREE.BoxGeometry(0.02, 0.075, 0.04), TM.dark, outer - side * 0.0, Math.cos(a) * 0.265, Math.sin(a) * 0.265, a, 0, 0);
  }
  P.build(g, { cast: true });
  return g;
}

function buildTractor() {
  const T = { blinkL: [], blinkR: [], heads: [], lightbar: [], spin: [], steer: [], rear: [] };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  T.root = root;

  // ---- chassis (does not tilt) ----
  const C = new Parts();
  C.box(TM.frame, 0.1, 0.28, 6.3, -0.42, 0.92, -2.1); C.box(TM.frame, 0.1, 0.28, 6.3, 0.42, 0.92, -2.1);
  for (const z of [-4.7, -3.1, -1.7, -0.3, 0.85]) C.box(TM.frame, 0.84, 0.1, 0.12, 0, 0.92, z);
  C.box(TM.dark, 1.0, 0.1, 1.0, 0, 1.11, -0.35);
  C.cyl(TM.dark, 0.47, 0.47, 0.07, 22, 0, 1.19, -0.35);
  C.box(TM.black, 0.2, 0.02, 0.5, 0, 1.235, -0.05);
  C.add(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 20), TM.alu, -0.84, 0.74, -2.2, Math.PI / 2, 0, 0);
  C.box(TM.black, 0.46, 0.5, 0.8, 0.86, 0.8, -2.65);
  C.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), TM.dark, 0.64, 0.62, -1.0, Math.PI / 2, 0, 0);
  C.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), TM.dark, -0.64, 0.62, -0.9, Math.PI / 2, 0, 0);
  // catwalk behind the cab (chequer plate) and the steps up to it
  C.box(TM.chequer, 1.6, 0.03, 2.05, 0, 1.335, -2.08);
  for (const sx of [-0.78, 0.78]) C.box(TM.frame, 0.05, 0.25, 2.0, sx, 1.21, -2.08);
  C.box(TM.chequer, 0.3, 0.03, 0.26, -1.1, 0.62, -0.95); C.box(TM.chequer, 0.3, 0.03, 0.26, -1.04, 0.98, -0.95);
  C.box(TM.frame, 0.03, 0.5, 0.04, -1.24, 0.8, -0.83);
  for (const sx of [-1, 1]) {
    // side skirts between the axles, chrome foot strip, amber side markers (Japan)
    C.box(TM.paint, 0.04, 0.74, 2.62, sx * 1.235, 0.8, -1.98);
    C.box(TM.chrome, 0.046, 0.028, 2.62, sx * 1.237, 0.445, -1.98);
    C.add(new THREE.CylinderGeometry(0.02, 0.02, 0.74, 8), TM.paint, sx * 1.235, 0.8, -3.29);
    // front wheel-arch liners
    C.add(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 18, 1, true, 0, Math.PI), TM.blackDS, sx * 1.03, 0.52, -3.9, 0, 0, Math.PI / 2);
    // rear fenders: black wings over the drive wheels, end plates with lamps and the
    // mandatory 大型後部反射器 striped reflector, mudflaps below
    const x0 = sx < 0 ? -1.27 : 0.52, x1 = sx < 0 ? -0.52 : 1.27;
    C.add(extrudeX([[-0.78, 1.0], [-0.78, 1.08], [-0.42, 1.23], [0.58, 1.23], [0.9, 1.12], [0.9, 1.04], [0.58, 1.15], [-0.42, 1.15]], x0, x1, 0.01), TM.rubber);
    C.box(TM.rubber, 0.035, 0.28, 1.3, sx * 1.252, 1.05, 0.06);
    C.box(TM.rubber, 0.75, 0.34, 0.05, sx * 0.895, 0.96, 0.885);
    C.box(TM.rubber, 0.7, 0.46, 0.015, sx * 0.9, 0.56, 0.9);
    C.box(TM.reflector, 0.5, 0.11, 0.012, sx * 0.9, 0.87, 0.913);
    C.box(TM.amberOff, 0.1, 0.08, 0.02, sx * 0.62, 1.06, 0.915);
  }
  C.box(TM.dark, 1.0, 0.12, 0.08, 0, 0.82, 0.9);
  // bumper: body-coloured top, grey lower part, corner headlamp housings, centre step
  C.box(TM.paint, 2.5, 0.36, 0.3, 0, 0.99, -5.47);
  C.box(TM.bumper, 2.42, 0.34, 0.32, 0, 0.64, -5.46);
  C.box(TM.black, 2.2, 0.08, 0.34, 0, 0.43, -5.45);
  C.box(TM.gloss, 0.68, 0.12, 0.02, 0, 0.8, -5.625);
  C.box(TM.chequer, 0.62, 0.03, 0.22, 0, 0.865, -5.56);
  for (const sx of [-1, 1]) {
    C.box(TM.gloss, 0.6, 0.34, 0.05, sx * 0.92, 0.97, -5.605);
    C.box(TM.gloss, 0.06, 0.34, 0.28, sx * 1.235, 0.97, -5.5);
    C.box(TM.drl, 0.54, 0.024, 0.02, sx * 0.92, 1.125, -5.635);
    C.box(TM.drl, 0.024, 0.28, 0.02, sx * 1.205, 0.98, -5.635);
    C.add(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 16), TM.headOff, sx * 0.92, 0.62, -5.625, Math.PI / 2, 0, 0);
    C.box(TM.rubber, 0.3, 0.035, 0.3, sx * 0.95, 0.32, -5.4); // front mud flap stub
  }
  C.build(root, { cast: true });
  const LP = new Parts();
  for (const sx of [-1, 1]) LP.box(TM.redDim, 0.3, 0.085, 0.02, sx * 0.97, 1.06, 0.915);
  LP.build(root);
  for (const sx of [-1, 1]) {
    for (const dx of [0.07, 0.25]) { // twin LED projector units
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.19, 0.03), TM.headOff);
      h.position.set(sx * (0.92 + dx - 0.07), 0.97, -5.638); root.add(h); T.heads.push(h);
    }
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.03), TM.amberOff);
    b.position.set(sx * 0.7, 0.97, -5.638); root.add(b); (sx < 0 ? T.blinkL : T.blinkR).push(b);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), PLATE_MAT);
  plate.position.set(0, 0.6, -5.63); plate.rotation.y = Math.PI; root.add(plate);
  // coiled air (yellow, red) and electric (black) lines to the trailer
  const hoses = new Parts();
  hoses.add(coilGeo([0.02, 2.0, -3.04], [0.12, 2.0, -1.62], 0.42, 16, 0.055, 0.011), TM.hoseY);
  hoses.add(coilGeo([0.16, 2.0, -3.04], [0.26, 2.02, -1.62], 0.46, 16, 0.055, 0.011), TM.hoseR);
  hoses.add(coilGeo([0.31, 2.0, -3.04], [0.4, 2.04, -1.62], 0.38, 18, 0.045, 0.009), TM.hoseB);
  T.coil = new THREE.Group(); root.add(T.coil);
  hoses.build(T.coil, { cast: true });
  // the same lines hung up on the back of the cab while no trailer is coupled
  const stowed = new Parts();
  stowed.add(coilGeo([0.02, 2.0, -3.04], [0.06, 1.52, -2.99], 0.03, 9, 0.05, 0.011), TM.hoseY);
  stowed.add(coilGeo([0.16, 2.0, -3.04], [0.2, 1.5, -2.99], 0.03, 9, 0.05, 0.011), TM.hoseR);
  stowed.add(coilGeo([0.31, 2.0, -3.04], [0.35, 1.55, -2.99], 0.03, 10, 0.042, 0.009), TM.hoseB);
  T.coilStowed = new THREE.Group(); root.add(T.coilStowed);
  stowed.build(T.coilStowed, { cast: true });
  T.coilStowed.visible = false;

  // wheels
  for (const sx of [-1, 1]) {
    const st = new THREE.Group(); st.position.set(sx * 1.03, 0.52, -3.9); root.add(st);
    const w = makeWheel(false, sx); st.add(w); T.spin.push(w); T.steer.push(st);
    const r = makeWheel(true, sx); r.position.set(sx * 0.9, 0.52, 0); root.add(r); T.spin.push(r); T.rear.push(r);
  }

  // headlight beam (night / tunnels)
  T.spot = new THREE.SpotLight(0xfff0d6, 0, 110, 0.42, 0.55, 1.1);
  T.spot.position.set(0, 1.1, -5.7);
  T.spot.target.position.set(0, -2.5, -45);
  root.add(T.spot); root.add(T.spot.target);

  // ---- cab (tilts on its suspension) ----
  const cabPivot = new THREE.Group(); cabPivot.position.set(0, 1.25, -4.3); root.add(cabPivot);
  const cab = new THREE.Group(); cab.position.set(0, -1.25, 4.3); cabPivot.add(cab);
  T.cabPivot = cabPivot; T.cab = cab;

  const K = new Parts();
  K.add(loftCabGeo(), TM.paint);
  // black band at the windscreen base (wiper cowl)
  K.box(TM.gloss, 2.24, 0.12, 0.06, 0, 2.18, -5.445);
  // grille: honeycomb mesh with three body-coloured slats, a blank badge rail, lower intake
  const gb = 1.30, gt = 1.94, gwb = 0.8, gwt = 0.98;
  const zg = y => zfAt(y) - 0.006;
  K.add(quadGeo([-gwb, gb, zg(gb)], [gwb, gb, zg(gb)], [gwt, gt, zg(gt)], [-gwt, gt, zg(gt)], [0, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1]), TM.mesh);
  for (const y of [1.84, 1.66, 1.48]) {
    const hw = lerp(gwb, gwt, (y - gb) / (gt - gb)) + 0.03;
    K.box(TM.paint, hw * 2, 0.085, 0.05, 0, y, zfAt(y) - 0.03, -0.09, 0, 0);
    K.box(TM.chrome, hw * 2, 0.012, 0.052, 0, y + 0.045, zfAt(y) - 0.031, -0.09, 0, 0);
  }
  K.box(TM.chrome, 2.0, 0.018, 0.02, 0, 1.955, zfAt(1.955) - 0.01, -0.09, 0, 0);
  K.box(TM.gloss, 1.26, 0.05, 0.012, 0, 2.03, zfAt(2.03) - 0.006, -0.09, 0, 0);
  K.box(TM.gloss, 2.1, 0.07, 0.02, 0, 1.255, zfAt(1.255) - 0.01);
  for (const sx of [-1, 1]) {
    // entry step housing under the door, black treads
    K.box(TM.paint, 0.1, 0.82, 0.98, sx * 1.2, 0.84, -4.86);
    K.box(TM.black, 0.3, 0.04, 0.5, sx * 1.12, 0.58, -4.86);
    K.box(TM.black, 0.3, 0.04, 0.5, sx * 1.12, 0.98, -4.86);
    // door: pull recess, seams
    K.box(TM.black, 0.016, 0.045, 0.2, sx * 1.256, 2.1, -4.32);
    K.box(TM.black, 0.012, 1.95, 0.012, sx * 1.252, 2.2, -4.15);
    K.box(TM.black, 0.012, 0.012, 1.0, sx * 1.252, 1.27, -4.65);
    // rear corner extenders with the red LED marker strip
    K.box(TM.paint, 0.035, 2.42, 0.25, sx * 1.215, 2.76, -3.0);
    K.box(TM.chrome, 0.03, 2.38, 0.03, sx * 1.222, 2.76, -2.868);
    K.add(new THREE.CylinderGeometry(0.016, 0.016, 0.95, 8), TM.black, sx * 1.0, 2.35, -3.06);
    K.box(TM.black, 0.03, 0.03, 0.06, sx * 1.0, 1.9, -3.09); K.box(TM.black, 0.03, 0.03, 0.06, sx * 1.0, 2.8, -3.09);
  }
  // rear wall: embossed panels (badge area left blank), ribs, handles, line bracket
  K.box(TM.paint, 1.8, 0.62, 0.02, 0, 3.45, -3.105);
  K.box(TM.paint, 1.2, 0.86, 0.02, 0, 2.2, -3.105);
  for (const y of [2.74, 2.8, 2.86]) K.box(TM.paint, 1.6, 0.014, 0.03, 0, y, -3.1);
  K.add(new THREE.CylinderGeometry(0.016, 0.016, 0.75, 8), TM.black, 0, 3.05, -3.06, 0, 0, Math.PI / 2);
  K.box(TM.black, 0.55, 0.12, 0.09, 0.18, 2.0, -3.065);
  for (const [x, m] of [[0.02, TM.hoseY], [0.16, TM.hoseR], [0.31, TM.hoseB]]) K.add(new THREE.CylinderGeometry(0.025, 0.025, 0.05, 10), m, x, 2.0, -3.03, Math.PI / 2, 0, 0);
  // roof: rear lip
  K.box(TM.black, 2.3, 0.04, 0.22, 0, 4.0, -3.08, -0.12, 0, 0);
  // sun visor (body colour) and light bar
  K.box(TM.paint, 2.46, 0.05, 0.42, 0, 3.5, -5.41, 0.12, 0, 0);
  K.box(TM.black, 1.95, 0.07, 0.1, 0, 3.58, -5.5);
  // kerb-view and front under-mirrors (left side, as required in Japan)
  K.box(TM.paint, 0.22, 0.13, 0.18, -1.38, 3.47, -5.3);
  K.box(TM.paint, 0.24, 0.1, 0.16, -0.95, 3.6, -5.55);
  K.add(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 6), TM.black, -1.3, 3.55, -5.38, 0, 0, 0.9);
  K.add(new THREE.CylinderGeometry(0.012, 0.012, 0.15, 6), TM.black, -0.95, 3.6, -5.45, Math.PI / 2, 0, 0);
  // mirror arms (upper and lower) to the main mirror heads
  for (const sx of [-1, 1]) {
    const hz = sx < 0 ? -5.15 : -5.2;
    K.add(tubeGeo([[sx * 1.22, 3.28, -5.0], [sx * 1.45, 3.26, hz + 0.06], [sx * 1.6, 3.12, hz]], 0.022), TM.black);
    K.add(tubeGeo([[sx * 1.23, 2.36, -5.02], [sx * 1.48, 2.35, hz + 0.04], [sx * 1.6, 2.44, hz]], 0.02), TM.black);
  }
  K.build(cab, { cast: true });

  // windscreen wraps into the rounded corners; dark from outside, faint from inside
  cab.add(new THREE.Mesh(bodyPatch(2.29, 3.27, WS_COLS, 0.012, 6, true), TM.glassOut));
  cab.add(new THREE.Mesh(bodyPatch(2.29, 3.27, WS_COLS, -0.035, 6, false), TM.glassIn));
  cab.add(new THREE.Mesh(bodyPatch(3.27, 3.33, WS_COLS, 0.008, 1, true), TM.gloss));
  // door windows with the dropped front corner, and the small bunk windows
  const DOOR_WIN = [[-5.13, 2.12], [-4.88, 2.12], [-4.76, 2.32], [-4.18, 2.32], [-4.18, 3.16], [-4.97, 3.16]];
  const BUNK_WIN = [[-3.95, 3.0], [-3.45, 3.0], [-3.45, 3.42], [-3.95, 3.42]];
  for (const sx of [-1, 1]) {
    cab.add(new THREE.Mesh(polyOnX(sx * 1.257, DOOR_WIN, sx), TM.glassOut));
    cab.add(new THREE.Mesh(polyOnX(sx * 1.2, DOOR_WIN, -sx), TM.glassIn));
    cab.add(new THREE.Mesh(polyOnX(sx * 1.256, BUNK_WIN, sx), TM.glassOut));
  }

  const M = new Parts();
  for (let k = 0; k < 5; k++) M.box(TM.marker, 0.13, 0.04, 0.04, -0.8 + k * 0.4, 3.47, -5.62);
  for (const sx of [-1, 1]) M.box(TM.marker, 0.03, 0.06, 0.12, sx * 1.265, 1.4, -5.0);
  M.build(cab);
  for (const sx of [-1, 1]) {
    const rep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), TM.amberOff);
    rep.position.set(sx * 1.262, 1.95, -5.1); cab.add(rep); (sx < 0 ? T.blinkL : T.blinkR).push(rep);
  }
  // light bar lamps and red end markers on the visor
  for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 16), TM.headOff);
    l.rotation.x = Math.PI / 2; l.position.set(-0.75 + k * 0.3, 3.58, -5.56); cab.add(l); T.lightbar.push(l);
  }
  const LED = new Parts();
  for (const sx of [-1, 1]) {
    LED.box(TM.ledRed, 0.06, 0.05, 0.03, sx * 0.94, 3.58, -5.56);
    for (let k = 0; k < 8; k++) LED.box(TM.ledRed, 0.022, 0.05, 0.012, sx * 1.222, 1.66 + k * 0.315, -2.85);
  }
  LED.build(cab);
  { // static under-mirrors
    const m1 = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.16), TM.mirrorStatic); m1.position.set(-1.38, 3.4, -5.3); m1.rotation.set(-1.2, 0, 0); cab.add(m1);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.13), TM.mirrorStatic); m2.position.set(-0.95, 3.54, -5.47); m2.rotation.set(-0.9, Math.PI, 0); cab.add(m2);
  }

  // live mirrors: body-coloured heads holding the main and wide-angle glass
  T.mirrors = {};
  for (const [key, sx] of [['L', -1], ['R', 1]]) {
    const hz = sx < 0 ? -5.15 : -5.2;
    const anchor = new THREE.Object3D(); anchor.position.set(sx * 1.62, 2.9, hz + 0.08); cab.add(anchor);
    const mainG = new THREE.PlaneGeometry(0.23, 0.37), wideG = new THREE.PlaneGeometry(0.23, 0.19);
    const uvm = mainG.attributes.uv, uvw = wideG.attributes.uv;
    for (let i = 0; i < uvm.count; i++) uvm.setXY(i, 1 - (0.13 + uvm.getX(i) * 0.74), 0.2 + uvm.getY(i) * 0.76);
    for (let i = 0; i < uvw.count; i++) uvw.setXY(i, 1 - uvw.getX(i), uvw.getY(i) * 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa3aa });
    const head = new THREE.Group(); head.position.set(sx * 1.62, 2.75, hz); head.rotation.y = sx > 0 ? -0.42 : 0.55; cab.add(head);
    const hb = new Parts();
    hb.box(TM.paint, 0.27, 0.66, 0.1, 0, -0.02, -0.02);
    hb.box(TM.black, 0.262, 0.65, 0.05, 0, -0.02, 0.045);
    hb.box(TM.black, 0.27, 0.02, 0.06, 0, -0.13, 0.05);
    hb.build(head, { cast: true });
    const main = new THREE.Mesh(mainG, mat); main.position.set(0, 0.105, 0.071); head.add(main);
    const wide = new THREE.Mesh(wideG, mat); wide.position.set(0, -0.24, 0.071); head.add(wide);
    T.mirrors[key] = { anchor, main, wide, mat, side: sx };
  }

  // wipers parked along the cowl
  T.wipers = [];
  const wg = new THREE.Group(); wg.position.set(0, 2.27, -5.455); wg.rotation.x = 0.14; cab.add(wg);
  for (const px of [0.95, -0.12]) {
    const piv = new THREE.Group(); piv.position.set(px, 0.02, 0); wg.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.022, 0.02).translate(-0.44, 0, -0.012), TM.black);
    piv.add(arm); T.wipers.push(piv);
  }
  applyPaint(paintName);
  return T;
}

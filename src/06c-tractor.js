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
  // lightbar: the roof lamps that light with the headlights (empty on the normal trim). deco: parts of the custom trim.
  const T = { blinkL: [], blinkR: [], heads: [], lightbar: [], barLamps: [], spin: [], steer: [], rear: [] };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  T.root = root;

  // ---- chassis (does not tilt) ----
  const C = new Parts();
  tractorChassis(T, C, root);

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
  tractorCab(T, K, root, cab);
  tractorFront(T, C, K, root, cab);
  C.build(root, { cast: true });
  tractorMirrors(T, K, cab);
  K.build(cab, { cast: true });

  const M = new Parts();
  for (let k = 0; k < 5; k++) M.box(TM.marker, 0.13, 0.04, 0.04, -0.8 + k * 0.4, 3.47, -5.62);
  for (const sx of [-1, 1]) M.box(TM.marker, 0.03, 0.06, 0.12, sx * 1.265, 1.4, -5.0);
  M.build(cab);
  for (const sx of [-1, 1]) {
    const rep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), TM.amberOff);
    rep.position.set(sx * 1.262, 1.95, -5.1); cab.add(rep); (sx < 0 ? T.blinkL : T.blinkR).push(rep);
  }
  // custom trim: light bar lamps on the visor
  T.deco = new THREE.Group(); cab.add(T.deco);
  { const D = new Parts(); D.add(roundBox(1.95, 0.07, 0.1, 0.02), TM.black, 0, 3.58, -5.5); D.build(T.deco); }
  for (let k = 0; k < 6; k++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.04, 16), TM.headOff);
    l.rotation.x = Math.PI / 2; l.position.set(-0.75 + k * 0.3, 3.58, -5.56); T.deco.add(l); T.barLamps.push(l);
  }
  // red end markers on the visor
  const LED = new Parts();
  for (const sx of [-1, 1]) {
    LED.box(TM.ledRed, 0.06, 0.05, 0.03, sx * 0.94, 3.58, -5.56);
  }
  LED.build(cab);
  applyPaint(paintName); applyTrim(trimName, T);
  return T;
}

// ---- cab exterior ------------------------------------------------------------------------------
// A ring around one cab section, counter-clockwise seen from above (+x side, then the front, the -x side, the back),
// with a fixed share of points on each face and corner so that columns line up from section to section.
function cabRing(sec, n) {
  const { zf, zr, w, rf, rr } = sec, share = [12, 14, 10, 12, 4, 6, 4, 10], k = share.map(s => Math.max(1, Math.round(s * n / 72)));
  const pts = [], arc = (cx, cz, r, a0, a1, m) => { for (let i = 0; i < m; i++) { const a = a0 + (a1 - a0) * i / m; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  const line = (x0, z0, x1, z1, m) => { for (let i = 0; i < m; i++) pts.push([lerp(x0, x1, i / m), lerp(z0, z1, i / m)]); };
  line(w, zr - rr, w, zf + rf, k[0]);                                   // +x side, back to front
  arc(w - rf, zf + rf, rf, 0, -Math.PI / 2, k[2]);                      // front-right corner
  line(w - rf, zf, -(w - rf), zf, k[1]);                                // front face
  arc(-(w - rf), zf + rf, rf, -Math.PI / 2, -Math.PI, k[7]);            // front-left corner
  line(-w, zf + rf, -w, zr - rr, k[3]);                                 // -x side, front to back
  arc(-(w - rr), zr - rr, rr, Math.PI, Math.PI / 2, k[4]);              // rear-left corner
  line(-(w - rr), zr, w - rr, zr, k[5]);                                // back face
  arc(w - rr, zr - rr, rr, Math.PI / 2, 0, k[6]);                       // rear-right corner
  return pts;
}
function cabShellGeo() {
  const n = seg(72, 28), sub = seg(2, 1), rings = [], S = CAB_SECTIONS;
  for (let i = 0; i < S.length; i++) for (let j = 0; j < (i < S.length - 1 ? sub : 1); j++) {
    const sec = cabSectionAt(lerp(S[i].y, i < S.length - 1 ? S[i + 1].y : S[i].y, j / sub));
    rings.push(cabRing(sec, n).map(([x, z]) => [x, sec.y, z]));
  }
  return loft(rings, { capStart: true, capEnd: true, crease: 50 });
}
// The parts of the cab body: shell, roof spoiler, doors, steps, wheel arches, rear-corner fins with LEDs,
// windows, rear panel and the air and electric lines (coiled to the trailer, or hung on the cab).
function tractorCab(T, K, root, cab) {
  K.part('cabShell'); K.add(cabShellGeo(), TM.paint);
  K.part('roofKit');
  K.add(sweep([[-1.12, 0], [1.12, 0], [1.12, 0.03], [-1.12, 0.03]], [{ p: [0, 3.99, -3.26] }, { p: [0, 4.02, -3.10] }, { p: [0, 4.06, -2.96] }], { closed: true, up: [0, 1, 0], capStart: true, capEnd: true }), TM.paint);
  for (const sx of [-1, 1]) K.add(tube([[sx * 1.17, 3.985, -4.90], [sx * 1.19, 3.99, -4.0], [sx * 1.19, 3.99, -3.30]], 0.012, 6), TM.black);   // rain gutters
  K.part('doors');
  for (const sx of [-1, 1]) {
    const x = sx * 1.252;
    K.add(roundBox(0.012, 1.95, 0.012, 0.004, 1), TM.black, x, 2.2, -4.15);              // rear shut line
    K.add(roundBox(0.012, 0.012, 1.0, 0.004, 1), TM.black, x, 1.27, -4.65);              // bottom shut line
    K.add(roundBox(0.012, 1.0, 0.012, 0.004, 1), TM.black, x, 1.75, -5.16, 0.12, 0, 0);  // front shut line
    K.add(roundBox(0.018, 0.05, 0.22, 0.012), TM.black, x + sx * 0.004, 2.1, -4.32);    // handle recess
    K.add(roundBox(0.016, 0.026, 0.18, 0.01), TM.chrome, x + sx * 0.012, 2.1, -4.32);    // handle
  }
  K.part('steps');
  for (const sx of [-1, 1]) {
    K.add(roundBox(0.10, 0.84, 0.72, 0.03), TM.paint, sx * 1.2, 0.84, -4.94);           // step housing under the door
    for (const y of [0.46, 0.82, 1.18]) K.add(roundBox(0.24, 0.035, 0.46, 0.01), TM.rubber, sx * 1.13, y, -4.94);
  }
  K.part('arches');
  for (const sx of [-1, 1]) {
    const path = []; for (let i = 0; i <= 12; i++) { const a = 0.32 + (Math.PI - 0.32) * i / 12; path.push({ p: [sx * 1.255, 0.52 + 0.62 * Math.sin(a), -3.9 - 0.62 * Math.cos(a)] }); }
    K.add(sweep([[-0.03, -0.04], [0.03, -0.04], [0.03, 0.04], [-0.03, 0.04]], path, { closed: true, up: [1, 0, 0], capStart: true, capEnd: true }), TM.dark);
  }
  K.part('sideFins');
  for (const sx of [-1, 1]) {
    // a thin panel standing back 0.32 m from the cab's rear corner, rounded at the top, with a red LED strip on its trailing edge
    const fin = panel([[3.12, 1.5], [2.80, 1.55], [2.80, 3.80], [2.88, 3.90], [3.12, 3.90]], 0.03, 0.006);   // outline in [-z, y]
    K.add(xform(fin, 0, 0, 0, 0, Math.PI / 2, 0), TM.paint, sx > 0 ? 1.215 : -1.245, 0, 0);
    K.add(roundBox(0.02, 2.25, 0.02, 0.006, 1), TM.ledRed, sx * 1.232, 2.68, -2.805);
  }
  K.part('rearPanel');
  K.add(roundBox(1.8, 0.62, 0.025, 0.012), TM.paint, 0, 3.45, -3.105);                 // embossed upper panel (badge area blank)
  K.add(roundBox(1.2, 0.86, 0.025, 0.012), TM.paint, 0, 2.2, -3.105);                  // lower panel
  for (const y of [2.74, 2.8, 2.86]) K.add(roundBox(1.6, 0.014, 0.03, 0.005, 1), TM.paint, 0, y, -3.1);
  K.add(roundBox(0.5, 0.12, 0.03, 0.01), TM.mesh, -0.55, 3.05, -3.1);                   // air intake
  K.add(tube([[-0.37, 3.05, -3.06], [0.37, 3.05, -3.06]], 0.016, 8), TM.black);           // handle
  K.add(roundBox(0.55, 0.12, 0.09, 0.015), TM.black, 0.18, 2.0, -3.065);                 // line connector bracket
  for (const [x, m] of [[0.02, TM.hoseY], [0.16, TM.hoseR], [0.31, TM.hoseB]]) K.add(lathe([[0, 0], [0.025, 0], [0.025, 0.05], [0, 0.05]], 10), m, x, 2.0, -3.055, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) {
    K.add(tube([[sx * 1.0, 1.88, -3.06], [sx * 1.0, 2.82, -3.06]], 0.016, 8), TM.black);   // grab bars
    K.add(roundBox(0.03, 0.03, 0.06, 0.008), TM.black, sx * 1.0, 1.9, -3.09); K.add(roundBox(0.03, 0.03, 0.06, 0.008), TM.black, sx * 1.0, 2.8, -3.09);
  }
  K.part(null);
  // coiled air (yellow, red) and electric (black) lines to the trailer, and the same lines hung up on the cab
  const hoses = new Parts(); hoses.part('hoses');
  hoses.add(coilGeo([0.02, 2.0, -3.04], [0.12, 2.0, -1.62], 0.42, 16, 0.055, 0.011), TM.hoseY);
  hoses.add(coilGeo([0.16, 2.0, -3.04], [0.26, 2.02, -1.62], 0.46, 16, 0.055, 0.011), TM.hoseR);
  hoses.add(coilGeo([0.31, 2.0, -3.04], [0.4, 2.04, -1.62], 0.38, 18, 0.045, 0.009), TM.hoseB);
  T.coil = new THREE.Group(); root.add(T.coil);
  hoses.part(null); hoses.build(T.coil, { cast: true });
  const stowed = new Parts(); stowed.part('hoses');
  stowed.add(coilGeo([0.02, 2.0, -3.04], [0.06, 1.52, -2.99], 0.03, 9, 0.05, 0.011), TM.hoseY);
  stowed.add(coilGeo([0.16, 2.0, -3.04], [0.2, 1.5, -2.99], 0.03, 9, 0.05, 0.011), TM.hoseR);
  stowed.add(coilGeo([0.31, 2.0, -3.04], [0.35, 1.55, -2.99], 0.03, 10, 0.042, 0.009), TM.hoseB);
  T.coilStowed = new THREE.Group(); root.add(T.coilStowed);
  stowed.part(null); stowed.build(T.coilStowed, { cast: true });
  T.coilStowed.visible = false;

  // windscreen wraps into the rounded corners; dark from outside, faint from inside. Door windows with the
  // dropped front corner, and the small bunk windows.
  const win = (g, m) => { statPart('windows', g); cab.add(new THREE.Mesh(g, m)); };
  win(bodyPatch(2.29, 3.27, WS_COLS, 0.012, 6, true), TM.glassOut);
  win(bodyPatch(2.29, 3.27, WS_COLS, -0.035, 6, false), TM.glassIn);
  win(bodyPatch(3.27, 3.33, WS_COLS, 0.008, 1, true), TM.gloss);
  const DOOR_WIN = [[-5.13, 2.12], [-4.88, 2.12], [-4.76, 2.32], [-4.18, 2.32], [-4.18, 3.16], [-4.97, 3.16]];
  const BUNK_WIN = [[-3.95, 3.0], [-3.45, 3.0], [-3.45, 3.42], [-3.95, 3.42]];
  for (const sx of [-1, 1]) {
    win(polyOnX(sx * 1.257, DOOR_WIN, sx), TM.glassOut);
    win(polyOnX(sx * 1.2, DOOR_WIN, -sx), TM.glassIn);
    win(polyOnX(sx * 1.256, BUNK_WIN, sx), TM.glassOut);
  }
}
// Mirrors: the main and wide-angle heads on two arms each side (their glass shows the live mirror pictures),
// and Japan's kerb-view and front under-mirrors on the left.
function tractorMirrors(T, K, cab) {
  K.part('mirrors');
  for (const sx of [-1, 1]) {
    const hz = sx < 0 ? -5.15 : -5.2;
    K.add(tube([[sx * 1.22, 3.28, -5.0], [sx * 1.36, 3.285, hz + 0.1], [sx * 1.50, 3.24, hz + 0.05], [sx * 1.6, 3.12, hz]], 0.022, 8), TM.black);
    K.add(tube([[sx * 1.23, 2.36, -5.02], [sx * 1.38, 2.34, hz + 0.07], [sx * 1.52, 2.37, hz + 0.03], [sx * 1.6, 2.44, hz]], 0.02, 8), TM.black);
  }
  K.add(roundBox(0.22, 0.13, 0.18, 0.04), TM.paint, -1.38, 3.47, -5.3);                 // kerb-view mirror
  K.add(roundBox(0.24, 0.1, 0.16, 0.035), TM.paint, -0.95, 3.6, -5.55);                 // front under-mirror
  K.add(tube([[-1.24, 3.47, -5.32], [-1.30, 3.55, -5.36], [-1.36, 3.6, -5.38]], 0.012, 6), TM.black);
  K.add(tube([[-0.95, 3.6, -5.38], [-0.95, 3.6, -5.52]], 0.012, 6), TM.black);
  K.part(null);
  { // static glass of the under-mirrors
    const m1 = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.16), TM.mirrorStatic); m1.position.set(-1.38, 3.4, -5.3); m1.rotation.set(-1.2, 0, 0); cab.add(m1);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.13), TM.mirrorStatic); m2.position.set(-0.95, 3.54, -5.47); m2.rotation.set(-0.9, Math.PI, 0); cab.add(m2);
  }
  T.mirrors = {};
  for (const [key, sx] of [['L', -1], ['R', 1]]) {
    const hz = sx < 0 ? -5.15 : -5.2;
    const anchor = new THREE.Object3D(); anchor.position.set(sx * 1.62, 2.9, hz + 0.08); cab.add(anchor);
    const mainG = new THREE.PlaneGeometry(0.23, 0.37), wideG = new THREE.PlaneGeometry(0.23, 0.19);
    const uvm = mainG.attributes.uv, uvw = wideG.attributes.uv;
    for (let i = 0; i < uvm.count; i++) uvm.setXY(i, 1 - (0.13 + uvm.getX(i) * 0.74), 0.2 + uvm.getY(i) * 0.76);
    for (let i = 0; i < uvw.count; i++) uvw.setXY(i, 1 - uvw.getX(i), uvw.getY(i) * 0.9);
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa3aa });
    const head = new THREE.Group(); head.position.set(sx * 1.62, 2.75, hz); head.rotation.y = sx > 0 ? -0.42 : 0.55; head.updateMatrix(); cab.add(head);
    const hb = new Parts(); hb.part('mirrors', head.matrix);
    hb.add(roundBox(0.27, 0.66, 0.10, 0.03), TM.paint, 0, -0.02, -0.02);               // shell
    hb.add(roundBox(0.262, 0.65, 0.05, 0.012), TM.black, 0, -0.02, 0.045);             // glass frame
    hb.add(roundBox(0.27, 0.02, 0.06, 0.006, 1), TM.black, 0, -0.13, 0.05);
    hb.part(null); hb.build(head, { cast: true });
    const main = new THREE.Mesh(mainG, mat); main.position.set(0, 0.105, 0.071); head.add(main);
    const wide = new THREE.Mesh(wideG, mat); wide.position.set(0, -0.24, 0.071); head.add(wide);
    T.mirrors[key] = { anchor, main, wide, mat, side: sx };
  }
}

// ---- front: grille, visor, wipers on the cab; bumper, lamps and plate on the chassis -----------------
// Half width of the trapezoid grille at height y: 0.75 at the bottom (y 1.25), 0.90 at the top (y 2.20).
const _grilleHW = y => 0.75 + 0.15 * (y - 1.25) / 0.95;
// A mesh-faced patch that follows the cab's front face (which bulges forward around y 2.1).
function _grillePatch() {
  const rows = seg(8, 3), pos = [], uv = [];
  const at = (y, s) => { const hw = _grilleHW(y); return [[s * hw, y, zfAt(y) - 0.006], [(s + 1) / 2, (y - 1.25) / 0.95]]; };
  for (let r = 0; r < rows; r++) {
    const y0 = 1.25 + 0.95 * r / rows, y1 = 1.25 + 0.95 * (r + 1) / rows;
    const [a, ua] = at(y0, -1), [b, ub] = at(y0, 1), [c, uc] = at(y1, 1), [d, ud] = at(y1, -1);
    for (const [p, u] of [[a, ua], [c, uc], [b, ub], [a, ua], [d, ud], [c, uc]]) { pos.push(...p); uv.push(...u); }   // facing -z
  }
  return _kitFinish(pos, uv, 40);
}
function tractorFront(T, C, K, root, cab) {
  // grille: honeycomb mesh, five rounded slats in the trim colour, a blank badge rail
  K.part('grille');
  K.add(_grillePatch(), TM.mesh);
  const slat = [[0, -0.04], [0.04, -0.03], [0.05, 0], [0.04, 0.03], [0, 0.04], [-0.01, 0]];
  for (const y of [1.36, 1.53, 1.70, 1.87, 2.04]) {
    const hw = _grilleHW(y) + 0.03, z = zfAt(y) - 0.02;
    K.add(sweep(slat, [{ p: [-hw, y, z] }, { p: [0, y, z - 0.008] }, { p: [hw, y, z] }], { closed: true, capStart: true, capEnd: true }), TM.trim);
  }
  K.add(roundBox(0.34, 0.07, 0.03, 0.012), TM.gloss, 0, 2.12, zfAt(2.12) - 0.02);
  K.part('wipers');
  K.add(roundBox(2.24, 0.12, 0.06, 0.02), TM.gloss, 0, 2.18, -5.445);                       // cowl
  // sun visor in body colour, following the top of the windscreen and reaching 0.28 m forward
  K.part('visor');
  const vp = [];
  for (let i = 0; i <= 12; i++) { const x = -1.18 + 2.36 * i / 12; vp.push({ p: [x, 3.50 + 0.03 * (x / 1.18) ** 2, zfAt(3.5) + 0.02 + 0.10 * (x / 1.18) ** 4] }); }
  K.add(sweep([[0, -0.02], [0.27, -0.07], [0.28, -0.05], [0, 0.02]], vp, { closed: true, capStart: true, capEnd: true }), TM.paint);
  K.part(null);
  // wipers parked along the cowl: arm and blade on each pivot
  T.wipers = [];
  const wg = new THREE.Group(); wg.position.set(0, 2.27, -5.455); wg.rotation.x = 0.14; wg.updateMatrix(); cab.add(wg);
  for (const px of [0.95, -0.12]) {
    const piv = new THREE.Group(); piv.position.set(px, 0.02, 0); piv.updateMatrix(); wg.add(piv);
    const P = new Parts(); P.part('wipers', new THREE.Matrix4().multiplyMatrices(wg.matrix, piv.matrix));
    P.add(roundBox(0.62, 0.022, 0.02, 0.006, 1), TM.black, -0.31, 0, -0.012);
    P.add(roundBox(0.84, 0.016, 0.022, 0.006, 1), TM.black, -0.45, 0.012, -0.022);
    P.part(null); P.build(piv);
    T.wipers.push(piv);
  }
  // bumper: body-coloured top, plastic lower part, black lip, a step in the middle
  C.part('bumper');
  C.add(roundBox(2.50, 0.34, 0.30, 0.05), TM.paint, 0, 0.99, -5.46);
  C.add(roundBox(2.42, 0.34, 0.32, 0.05), TM.bumper, 0, 0.64, -5.45);
  C.add(roundBox(2.2, 0.08, 0.34, 0.03), TM.black, 0, 0.43, -5.45);
  C.add(roundBox(0.68, 0.12, 0.02, 0.01), TM.gloss, 0, 0.8, -5.625);
  C.add(roundBox(0.62, 0.03, 0.22, 0.01), TM.chequer, 0, 0.865, -5.56);
  C.part('headlamps');
  for (const sx of [-1, 1]) {
    C.add(roundBox(0.62, 0.34, 0.06, 0.04), TM.gloss, sx * 0.92, 0.97, -5.605);              // housing in the bumper corner
    C.add(roundBox(0.06, 0.34, 0.28, 0.02), TM.gloss, sx * 1.235, 0.97, -5.5);
    C.add(roundBox(0.54, 0.024, 0.02, 0.008, 1), TM.drl, sx * 0.92, 1.125, -5.635);         // daytime light line
    C.add(roundBox(0.024, 0.28, 0.02, 0.008, 1), TM.drl, sx * 1.205, 0.98, -5.635);
  }
  C.part('fogs');
  for (const sx of [-1, 1]) {
    C.add(lathe([[0, 0], [0.055, 0], [0.055, 0.02], [0, 0.03]], 16), TM.headOff, sx * 0.92, 0.62, -5.61, -Math.PI / 2, 0, 0);
    C.add(lathe([[0.055, 0], [0.065, 0.01], [0.06, 0.025]], 16), TM.gloss, sx * 0.92, 0.62, -5.61, -Math.PI / 2, 0, 0);
  }
  C.part('spoiler');
  C.add(roundBox(2.3, 0.05, 0.18, 0.02), TM.black, 0, 0.36, -5.50, 0.1, 0, 0);
  for (const sx of [-1, 1]) C.add(roundBox(0.3, 0.035, 0.3, 0.01), TM.rubber, sx * 0.95, 0.32, -5.4);   // front mud flap stubs
  C.part(null);
  // lamps that switch material at run time: two projector units and the indicator in each corner
  const lamp = (g, m, list, name) => { statPart(name, g); const mesh = new THREE.Mesh(g, m); root.add(mesh); list.push(mesh); };
  for (const sx of [-1, 1]) {
    for (const dx of [0.07, 0.25]) lamp(roundBox(0.17, 0.19, 0.03, 0.03).translate(sx * (0.92 + dx - 0.07), 0.97, -5.638), TM.headOff, T.heads, 'headlamps');
    lamp(roundBox(0.08, 0.2, 0.03, 0.012).translate(sx * 0.7, 0.97, -5.638), TM.amberOff, sx < 0 ? T.blinkL : T.blinkR, 'headlamps');
  }
  const plate = new THREE.PlaneGeometry(0.44, 0.22).rotateY(Math.PI).translate(0, 0.6, -5.63);
  statPart('plateF', plate); root.add(new THREE.Mesh(plate, PLATE_MAT));
}

// ---- chassis, tanks, fenders, rear lamps and wheels (the parts that do not tilt with the cab) -------
// A tractor wheel with its axle along x: polished aluminium disc with hand holes, ten nuts and a centre cap,
// on a tyre with four tread grooves and rounded shoulders; `dual` puts two tyres side by side.
// side: +1 right, -1 left (the disc faces outward). Parts are recorded as `name` (toRoot: the wheel's place).
function tractorWheel(dual, side, name, toRoot) {
  const g = new THREE.Group(), P = new Parts(), k = seg(20, 10);
  P.part(name, toRoot);
  const tw = dual ? 0.28 : 0.31, offs = dual ? [-0.16, 0.16] : [0], h = tw / 2;
  const tread = []; for (let i = 0; i <= 8; i++) { const y = -h + 0.06 + (tw - 0.12) * i / 8; tread.push([i % 2 ? 0.507 : 0.52, y]); }
  const tyre = [[0.33, -h], [0.47, -h - 0.004], [0.505, -h + 0.02], ...tread, [0.505, h - 0.02], [0.47, h + 0.004], [0.33, h]];
  for (const o of offs) P.add(lathe(tyre, k), TM.tire, o, 0, 0, 0, 0, -Math.PI / 2);         // lathe axis y -> x
  const outer = side * (dual ? 0.16 + h : h);
  // disc: a shallow dish with a raised lip, drawn facing outward
  const disc = [[0.33, -0.06], [0.33, 0.0], [0.315, 0.015], [0.30, -0.005], [0.16, 0.0], [0.14, 0.03], [0, 0.03]];   // rim lip to centre (faces outward)
  P.add(lathe(disc, k), TM.rim, outer - side * 0.03, 0, 0, 0, 0, -side * Math.PI / 2);
  P.add(lathe([[0.14, 0], [0.12, 0.04], [0.09, 0.07], [0, 0.07]], seg(16, 8)), TM.chrome, outer - side * 0.03, 0, 0, 0, 0, -side * Math.PI / 2);   // centre cap
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU, b = a + 0.31;
    P.add(lathe([[0.019, 0], [0.018, 0.025], [0, 0.025]], 5), TM.chrome, outer - side * 0.03, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, -side * Math.PI / 2);   // nuts
    P.add(new THREE.PlaneGeometry(0.035, 0.07).rotateY(side * Math.PI / 2).rotateX(b), TM.dark, outer - side * 0.028, Math.cos(b) * 0.265, Math.sin(b) * 0.265);   // hand holes, on the dish
  }
  P.part(null); P.build(g, { cast: true });
  return g;
}
function tractorChassis(T, C, root) {
  C.part('frame');
  for (const sx of [-1, 1]) C.add(roundBox(0.10, 0.28, 6.3, 0.02), TM.frame, sx * 0.42, 0.92, -2.1);
  for (const z of [-4.7, -3.1, -1.7, -0.3, 0.85]) C.add(roundBox(0.84, 0.10, 0.12, 0.02), TM.frame, 0, 0.92, z);
  C.add(roundBox(1.0, 0.12, 0.08, 0.02), TM.dark, 0, 0.82, 0.9);                        // rear cross beam
  C.part('catwalk');
  C.add(roundBox(1.6, 0.03, 2.05, 0.01), TM.chequer, 0, 1.335, -2.08);
  for (const sx of [-0.78, 0.78]) C.add(roundBox(0.05, 0.25, 2.0, 0.01), TM.frame, sx, 1.21, -2.08);
  C.add(roundBox(0.3, 0.03, 0.26, 0.01), TM.chequer, -1.1, 0.62, -0.95); C.add(roundBox(0.3, 0.03, 0.26, 0.01), TM.chequer, -1.04, 0.98, -0.95);
  C.add(roundBox(0.03, 0.5, 0.04, 0.008), TM.frame, -1.24, 0.8, -0.83);
  // fifth wheel: a 0.94 m plate with the V-shaped throat opening to the rear, on its mounting
  C.part('fifthWheel');
  C.add(roundBox(1.0, 0.10, 1.0, 0.02), TM.dark, 0, 1.11, -0.35);
  const rim = []; for (let i = 0; i <= 28; i++) { const a = (-65 + 310 * i / 28) * Math.PI / 180; rim.push([0.47 * Math.cos(a), 0.47 * Math.sin(a)]); }
  C.add(xform(panel([...rim, [-0.03, -0.12], [0.03, -0.12]], 0.06, 0.008), 0, 0, 0, -Math.PI / 2, 0, 0), TM.dark, 0, 1.17, -0.35);   // throat at -y -> +z
  C.add(roundBox(0.2, 0.02, 0.4, 0.006, 1), TM.black, 0, 1.235, -0.15);
  // tanks and boxes along the frame: fuel on the left, battery box, urea tank, exhaust silencer, air tanks
  C.part('tankFuel');
  C.add(lathe([[0, 0], [0.28, 0], [0.30, 0.03], [0.30, 1.67], [0.28, 1.70], [0, 1.70]], seg(24, 10)), TM.alu, -0.84, 0.74, -3.05, Math.PI / 2, 0, 0);
  for (const z of [-2.65, -1.75]) C.add(lathe([[0.302, -0.02], [0.308, 0], [0.302, 0.02]], seg(24, 10)), TM.black, -0.84, 0.74, z, Math.PI / 2, 0, 0);
  C.add(lathe([[0, 0], [0.045, 0], [0.045, 0.03], [0, 0.035]], 12), TM.chrome, -0.84, 1.03, -1.6);
  C.part('battery');
  C.add(roundBox(0.46, 0.5, 0.8, 0.03), TM.black, 0.86, 0.8, -2.65);
  C.part('tankUrea');
  C.add(lathe([[0, 0], [0.17, 0], [0.18, 0.03], [0.18, 0.47], [0.17, 0.5], [0, 0.5]], seg(16, 8)), TM.dark, 0.84, 0.75, -1.85, Math.PI / 2, 0, 0);
  C.part('muffler');
  C.add(roundBox(0.55, 0.45, 0.55, 0.06), TM.dark, 0.72, 0.72, -1.0);
  C.add(lathe([[0.12, 0], [0.12, 0.9]], seg(12, 6)), TM.dark, -0.64, 0.62, -1.35, Math.PI / 2, 0, 0);   // air tank
  // side skirts between the axles: body colour, a chrome foot strip
  C.part('skirts');
  for (const sx of [-1, 1]) {
    const skirt = panel(roundRectPts(2.62, 0.74, 0.06).map(([u, y]) => [u, y + 0.79]), 0.04, 0.008);   // outline in [-z, y], bottom 0.42
    C.add(xform(skirt, 0, 0, 0, 0, Math.PI / 2, 0), TM.paint, sx > 0 ? 1.215 : -1.255, 0, -1.98);
    C.add(roundBox(0.046, 0.028, 2.6, 0.008), TM.chrome, sx * 1.237, 0.445, -1.98);
  }
  // rear fenders: black shells over the duals with three ribs on top; end plates with lamps; mud flaps
  C.part('fenders');
  for (const sx of [-1, 1]) {
    const path = []; for (let i = 0; i <= 14; i++) { const a = (25 + 130 * i / 14) * Math.PI / 180; path.push({ p: [sx * 0.895, 0.52 + 0.60 * Math.sin(a), -0.60 * Math.cos(a)] }); }
    C.add(sweep([[0, -0.375], [0.03, -0.375], [0.03, 0.375], [0, 0.375]], path, { closed: true, up: [1, 0, 0], capStart: true, capEnd: true }), TM.rubber);
    for (const a of [75, 90, 105]) { const r = a * Math.PI / 180; C.add(roundBox(0.70, 0.02, 0.04, 0.006, 1), TM.rubber, sx * 0.895, 0.52 + 0.632 * Math.sin(r), -0.632 * Math.cos(r), Math.PI / 2 - r, 0, 0); }
  }
  C.part('tailLamps');
  for (const sx of [-1, 1]) {
    C.add(roundBox(0.75, 0.34, 0.05, 0.02), TM.rubber, sx * 0.895, 0.96, 0.885);
    C.add(roundBox(0.3, 0.085, 0.02, 0.008), TM.redDim, sx * 0.97, 1.06, 0.915);
    C.add(roundBox(0.1, 0.08, 0.02, 0.008), TM.amberOff, sx * 0.62, 1.06, 0.915);
    C.add(roundBox(0.08, 0.06, 0.02, 0.008), TM.white, sx * 0.76, 1.06, 0.915);
  }
  C.part('flaps');
  for (const sx of [-1, 1]) {
    C.add(roundBox(0.7, 0.46, 0.015, 0.006), TM.rubber, sx * 0.9, 0.56, 0.9);
    C.add(roundBox(0.5, 0.11, 0.012, 0.004, 1), TM.reflector, sx * 0.9, 0.87, 0.913);    // the striped rear reflector (no lettering)
  }
  C.part('arches');
  for (const sx of [-1, 1]) C.add(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 18, 1, true, 0, Math.PI), TM.blackDS, sx * 1.03, 0.52, -3.9, 0, 0, Math.PI / 2);   // wheel-well liners
  C.part(null);
  const plate = new THREE.PlaneGeometry(0.44, 0.22).translate(-0.45, 0.72, 0.94);
  statPart('plateR', plate); root.add(new THREE.Mesh(plate, PLATE_MAT));
  // wheels: steered fronts, dual rears
  for (const sx of [-1, 1]) {
    const st = new THREE.Group(); st.position.set(sx * 1.03, 0.52, -3.9); st.updateMatrix(); root.add(st);
    const w = tractorWheel(false, sx, 'wheelF', st.matrix); st.add(w); T.spin.push(w); T.steer.push(st);
    const rm = new THREE.Matrix4().makeTranslation(sx * 0.9, 0.52, 0);
    const r = tractorWheel(true, sx, 'wheelR', rm); r.position.set(sx * 0.9, 0.52, 0); root.add(r); T.spin.push(r); T.rear.push(r);
  }
}

// ---------------------------------------------------------------------------
// Traffic: Japanese kei cars, sedans, minivans, 10 t trucks, highway buses and
// kei trucks. Car-following (IDM), keep-left lane changes, both directions.
// ---------------------------------------------------------------------------
function carProto(build) {
  const B = [], D = [], L = [];
  const box = (arr, w, h, d, x, y, z, col, rx = 0) => { const g = xform(new THREE.BoxGeometry(w, h, d), x, y, z, rx, 0, 0); if (col != null) colorize(g, col); arr.push(g); };
  const wheel = (x, z, r, w) => {
    const g = xform(new THREE.CylinderGeometry(r, r, w, 12), x, r, z, 0, 0, Math.PI / 2); colorize(g, 0x141414); D.push(g);
    const h = xform(new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10), x, r, z, 0, 0, Math.PI / 2); colorize(h, 0xa8acb0); D.push(h);
  };
  const info = build({ B, D, L, box, wheel });
  const out = { body: mergeGeometries(B), det: mergeGeometries(D), lit: mergeGeometries(L), ...info };
  out.body.userData.keep = out.det.userData.keep = out.lit.userData.keep = true;
  return out;
}
const GLASS = 0x1a232b, TRIM = 0x26282b, HEAD = 0xfff3d6, TAIL = 0xd2190f, AMB = 0xff9a1a;
const PROTOS = {
  kei: carProto(({ B, D, L, box, wheel }) => {
    box(B, 1.47, 0.75, 3.38, 0, 0.66, 0); box(B, 1.44, 0.9, 2.55, 0, 1.47, 0.38); box(B, 1.44, 0.32, 0.62, 0, 1.17, -1.36);
    box(D, 1.32, 0.66, 0.04, 0, 1.5, -0.9, GLASS, -0.38); box(D, 1.452, 0.5, 2.15, 0, 1.58, 0.45, GLASS); box(D, 1.3, 0.52, 0.03, 0, 1.56, 1.67, GLASS);
    box(D, 1.49, 0.22, 0.1, 0, 0.42, -1.7, TRIM); box(D, 1.49, 0.22, 0.1, 0, 0.42, 1.7, TRIM);
    for (const s of [-1, 1]) { box(L, 0.32, 0.14, 0.04, s * 0.5, 0.98, -1.7, HEAD); box(L, 0.18, 0.26, 0.04, s * 0.62, 1.05, 1.705, TAIL); }
    for (const z of [-1.18, 1.18]) for (const s of [-1, 1]) wheel(s * 0.64, z, 0.29, 0.18);
    return { len: 3.4, wid: 1.48 };
  }),
  sedan: carProto(({ B, D, L, box, wheel }) => {
    box(B, 1.8, 0.62, 4.8, 0, 0.62, 0); box(B, 1.66, 0.5, 2.3, 0, 1.18, 0.25);
    box(D, 1.672, 0.4, 2.05, 0, 1.2, 0.25, GLASS); box(D, 1.56, 0.56, 0.04, 0, 1.16, -0.98, GLASS, -0.95); box(D, 1.5, 0.5, 0.04, 0, 1.17, 1.45, GLASS, 0.95);
    box(D, 1.82, 0.2, 0.12, 0, 0.42, -2.4, TRIM); box(D, 1.82, 0.2, 0.12, 0, 0.42, 2.4, TRIM); box(D, 0.9, 0.16, 0.04, 0, 0.72, -2.41, 0x9aa0a4);
    for (const s of [-1, 1]) { box(L, 0.42, 0.12, 0.04, s * 0.62, 0.82, -2.41, HEAD); box(L, 0.4, 0.14, 0.04, s * 0.62, 0.88, 2.41, TAIL); }
    for (const z of [-1.45, 1.45]) for (const s of [-1, 1]) wheel(s * 0.78, z, 0.33, 0.22);
    return { len: 4.8, wid: 1.8 };
  }),
  minivan: carProto(({ B, D, L, box, wheel }) => {
    box(B, 1.85, 0.82, 4.95, 0, 0.72, 0); box(B, 1.8, 0.95, 3.6, 0, 1.6, 0.55); box(B, 1.8, 0.3, 0.9, 0, 1.25, -1.95);
    box(D, 1.812, 0.62, 3.4, 0, 1.62, 0.55, GLASS); box(D, 1.66, 0.72, 0.04, 0, 1.55, -1.32, GLASS, -0.55);
    box(D, 1.25, 0.55, 0.05, 0, 0.88, -2.48, 0xb8bcc0); box(D, 1.87, 0.2, 0.12, 0, 0.42, 2.47, TRIM);
    for (const s of [-1, 1]) { box(L, 0.36, 0.14, 0.04, s * 0.72, 1.12, -2.48, HEAD); box(L, 0.12, 0.6, 0.04, s * 0.84, 1.45, 2.48, TAIL); }
    for (const z of [-1.5, 1.5]) for (const s of [-1, 1]) wheel(s * 0.8, z, 0.34, 0.23);
    return { len: 4.95, wid: 1.85 };
  }),
  truck: carProto(({ B, D, L, box, wheel }) => {
    box(B, 2.49, 2.3, 2.2, 0, 2.03, -4.85);
    box(D, 2.3, 0.95, 0.05, 0, 2.55, -5.96, GLASS); box(D, 2.2, 0.55, 0.05, 0, 1.35, -5.96, TRIM); box(D, 2.49, 0.36, 0.22, 0, 0.72, -5.9, 0x8a8e92);
    box(D, 2.5, 0.5, 1.1, 0, 2.6, -4.75, GLASS); // side windows
    box(D, 2.49, 2.75, 9.25, 0, 2.4, 0.95, 0xd9dde0); box(D, 2.5, 0.1, 9.27, 0, 3.78, 0.95, 0xb5babe);
    box(D, 1.0, 0.3, 11.2, 0, 0.8, 0, 0x202224); box(D, 0.05, 0.08, 5.5, -1.2, 0.7, 0.4, 0x4a4d50); box(D, 0.05, 0.08, 5.5, 1.2, 0.7, 0.4, 0x4a4d50);
    for (const s of [-1, 1]) {
      box(L, 0.4, 0.18, 0.04, s * 0.85, 1.05, -5.97, HEAD); box(L, 0.3, 0.16, 0.04, s * 0.95, 0.95, 5.58, TAIL);
      for (let z = -3; z <= 5; z += 1.6) box(L, 0.03, 0.06, 0.1, s * 1.25, 1.0, z, AMB);
    }
    wheel(-1.03, -4.3, 0.5, 0.3); wheel(1.03, -4.3, 0.5, 0.3);
    for (const z of [2.9, 4.2]) for (const s of [-1, 1]) wheel(s * 0.95, z, 0.5, 0.55);
    return { len: 11.9, wid: 2.49, heavy: true };
  }),
  bus: carProto(({ B, D, L, box, wheel }) => {
    box(B, 2.49, 3.0, 12, 0, 1.95, 0);
    box(D, 2.5, 1.0, 10.4, 0, 2.5, 0.5, GLASS); box(D, 2.3, 1.4, 0.05, 0, 2.25, -6.01, GLASS); box(D, 2.5, 0.25, 12.02, 0, 0.55, 0, TRIM);
    box(D, 2.51, 0.18, 12.02, 0, 1.6, 0, 0x2f6fb5);
    for (const s of [-1, 1]) { box(L, 0.36, 0.16, 0.04, s * 0.9, 0.95, -6.02, HEAD); box(L, 0.2, 0.5, 0.04, s * 1.05, 1.2, 6.02, TAIL); }
    for (const z of [-3.9, 3.6]) for (const s of [-1, 1]) wheel(s * 1.0, z, 0.5, 0.35);
    return { len: 12, wid: 2.49, heavy: true };
  }),
  keitora: carProto(({ B, D, L, box, wheel }) => {
    box(B, 1.48, 1.15, 1.35, 0, 1.15, -1.0); box(B, 1.48, 0.12, 2.0, 0, 0.75, 0.65);
    box(B, 0.05, 0.3, 2.0, -0.72, 0.95, 0.65); box(B, 0.05, 0.3, 2.0, 0.72, 0.95, 0.65); box(B, 1.48, 0.3, 0.05, 0, 0.95, 1.67);
    box(D, 1.3, 0.52, 0.04, 0, 1.45, -1.69, GLASS, -0.1); box(D, 1.49, 0.45, 0.9, 0, 1.45, -1.0, GLASS); box(D, 1.49, 0.2, 0.1, 0, 0.45, -1.7, TRIM);
    box(D, 1.3, 0.5, 0.2, 0, 0.98, 0.4, 0x5a6b3a); // a few bags of produce
    for (const s of [-1, 1]) { box(L, 0.2, 0.14, 0.04, s * 0.55, 0.95, -1.7, HEAD); box(L, 0.14, 0.2, 0.04, s * 0.62, 0.95, 1.7, TAIL); }
    for (const z of [-1.05, 0.95]) for (const s of [-1, 1]) wheel(s * 0.64, z, 0.27, 0.17);
    return { len: 3.4, wid: 1.48 };
  }),
};
const CAR_COLORS = {
  kei: [0xf4f4f2, 0xf4f4f2, 0x1a1a1c, 0xe8d9b5, 0xa8cbe0, 0xd6b8c4, 0x9fc0a8, 0x2a3a5a, 0xf0d070],
  sedan: [0xf4f4f2, 0xf4f4f2, 0x111214, 0x111214, 0xa9adb1, 0x3a3f45, 0x2a3a5a, 0x7a1f22],
  minivan: [0xf4f4f2, 0x111214, 0xf4f4f2, 0x3a3f45, 0xa9adb1],
  truck: [0xf4f4f2, 0x2b5aa8, 0x2f7a4e, 0xf4f4f2, 0x1d1f22, 0xd8a12a, 0x9c2a2a],
  bus: [0xf4f4f2, 0xeeeeea, 0xf2f0e6],
  keitora: [0xf4f4f2, 0xf4f4f2, 0xd8dadc],
};
const TYPE_MIX = [['kei', 0.22], ['sedan', 0.24], ['minivan', 0.17], ['truck', 0.23], ['bus', 0.05], ['keitora', 0.09]];
const CAR_DET = new THREE.MeshLambertMaterial({ vertexColors: true });
const CAR_LIT = new THREE.MeshBasicMaterial({ vertexColors: true });
const _bodyMats = new Map();
function bodyMat(c) { if (!_bodyMats.has(c)) _bodyMats.set(c, new THREE.MeshPhongMaterial({ color: c, specular: 0x666666, shininess: 60, envMap: ENV, reflectivity: 0.15, combine: THREE.MixOperation })); return _bodyMats.get(c); }

const CARS = [];
const TRAFFIC = { rand: rng(4242) };
const laneX = (dir, lane) => -dir * (lane === 0 ? 7.65 : 4.05);

function makeCar() {
  const grp = new THREE.Group(); grp.rotation.order = 'YXZ';
  scene.add(grp);
  const car = { grp, meshes: null, type: null, len: 4, wid: 1.8, dir: 1, lane: 0, s: -1e6, x: 0, v: 0, v0: 25, lc: null, t: 0, blink: 0, hidden: true };
  CARS.push(car);
  return car;
}
function setCarType(car, type) {
  const P = PROTOS[type], R = TRAFFIC.rand;
  const cols = CAR_COLORS[type];
  if (car.meshes) car.meshes.forEach(m => car.grp.remove(m));
  const mb = new THREE.Mesh(P.body, bodyMat(cols[Math.floor(R() * cols.length)]));
  const md = new THREE.Mesh(P.det, CAR_DET);
  const ml = new THREE.Mesh(P.lit, CAR_LIT);
  mb.castShadow = md.castShadow = Q.shadow > 0 && P.heavy;
  car.meshes = [mb, md, ml];
  car.grp.add(mb, md, ml);
  car.type = type; car.len = P.len; car.wid = P.wid; car.heavy = !!P.heavy;
}
function pickType() {
  let r = TRAFFIC.rand(), acc = 0;
  for (const [t, w] of TYPE_MIX) { acc += w; if (r < acc) return t; }
  return 'sedan';
}
function laneFree(dir, lane, s, gap, ignore) {
  for (const c of CARS) {
    if (c === ignore || c.hidden || c.dir !== dir) continue;
    const inLane = c.lane === lane || (c.lc && c.lc.to === lane);
    if (inLane && Math.abs(c.s - s) < gap + (c.len) / 2) return false;
  }
  if (dir === 1) {
    const latL = laneX(1, lane);
    if ((Math.abs(TR.lat - latL) < 3 || Math.abs(TR.tr.lat - latL) < 3) && s > TR.tr.s - 4.2 - gap - 10 && s < TR.s + 5.5 + gap + 10) return false;
  }
  return true;
}
function spawnCar(car, where) {
  const R = TRAFFIC.rand;
  for (let attempt = 0; attempt < 10; attempt++) {
    const dir = R() < 0.6 ? 1 : -1;
    const type = pickType();
    const heavy = type === 'truck' || type === 'bus';
    let lane = heavy ? (R() < 0.88 ? 0 : 1) : (R() < 0.58 ? 0 : 1);
    let s;
    if (where === 'any') s = TR.s + lerp(-260, 1150, R());
    else if (where === 'behind') { if (dir !== 1) continue; lane = 1; s = TR.s - lerp(230, 320, R()); }
    else s = TR.s + lerp(dir === 1 ? 850 : 950, dir === 1 ? 1180 : 1300, R());
    if (s < 40 || s > ROUTE_END - 60) continue;
    if (where === 'any' && Math.abs(s - TR.s) < 70) continue;
    if (!laneFree(dir, lane, s, 38, car)) continue;
    setCarType(car, type);
    car.dir = dir; car.lane = lane; car.s = s; car.x = laneX(dir, lane); car.lc = null; car.t = R() * 2;
    let v0 = heavy ? lerp(80, 88, R()) : lane === 0 ? lerp(84, 102, R()) : lerp(100, 116, R());
    if (type === 'keitora') v0 = Math.min(v0, lerp(78, 90, R()));
    if (where === 'behind') v0 = Math.max(v0, TR.v * 3.6 + 12);
    car.v0 = v0 / 3.6; car.v = car.v0 * 0.96;
    car.hidden = false; car.grp.visible = true;
    return true;
  }
  car.hidden = true; car.grp.visible = false; car.s = -1e6;
  return false;
}
function resetTraffic() {
  const n = Q.traffic;
  while (CARS.length < n) makeCar();
  CARS.forEach((c, i) => { if (i >= n) { c.hidden = true; c.grp.visible = false; c.s = -1e6; } });
  for (let i = 0; i < n; i++) spawnCar(CARS[i], 'any');
}

function idm(v, v0, gap, dv) {
  const a = 1.3, b = 2.2, T = 1.25, s0 = 5;
  const ss = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  return a * (1 - Math.pow(v / Math.max(v0, 0.1), 4) - (ss / Math.max(gap, 0.3)) ** 2);
}
// Road-aligned boxes of the tractor and the job trailer. A parked trailer is still an obstacle.
function playerBoxes() {
  const boxes = [{ s0: TR.s - 1.1, s1: TR.s + 5.5, lat: TR.lat, tractor: true }];
  const sp = TRAILERS[TR.trailerKey];
  if (sp) boxes.push({ s0: TR.tr.s - (sp.rear - sp.L2) - 0.1, s1: TR.tr.s + sp.L2 + sp.nose + 0.1, lat: TR.tr.lat, tractor: false });
  return boxes;
}
function leaderOf(c, laneIdx, PB) {
  const q = c.s * c.dir;
  let best = null, bg = 1e9, bv = 0;
  for (const o of CARS) {
    if (o === c || o.hidden || o.dir !== c.dir) continue;
    const inLane = o.lane === laneIdx || (o.lc && (o.lc.to === laneIdx || o.lc.from === laneIdx));
    if (!inLane) continue;
    const gap = o.s * o.dir - q - (o.len + c.len) / 2;
    if (gap > -c.len * 0.5 && gap < bg) { bg = gap; best = o; bv = o.v; }
  }
  if (c.dir === 1) {
    const lx = laneX(1, laneIdx);
    for (const b of PB) {
      if (Math.abs(b.lat - lx) > 2.6) continue;
      const gap = b.s0 - c.s - c.len / 2;
      if (gap > -2 && gap < bg) { bg = gap; best = 'player'; bv = TR.v; }
    }
  }
  return { gap: bg, v: bv, who: best };
}
function laneChangeSafe(c, to, PB) {
  const q = c.s * c.dir;
  for (const o of CARS) {
    if (o === c || o.hidden || o.dir !== c.dir) continue;
    const inLane = o.lane === to || (o.lc && o.lc.to === to);
    if (!inLane) continue;
    const d = o.s * o.dir - q;
    if (d > -(14 + Math.max(0, o.v - c.v) * 3.5) && d < 22 + Math.max(0, c.v - o.v) * 2.5) return false;
  }
  if (c.dir === 1) {
    const lx = laneX(1, to);
    for (const b of PB) {
      if (Math.abs(b.lat - lx) > 2.8) continue;
      if (c.s + c.len / 2 > b.s0 - 25 - Math.max(0, c.v - TR.v) * 2.5 && c.s - c.len / 2 < b.s1 + 15 + Math.max(0, TR.v - c.v) * 3) return false;
    }
  }
  return true;
}

function updateTraffic(dt, active) {
  const PB = playerBoxes();
  const n = Q.traffic;
  for (let k = 0; k < n && k < CARS.length; k++) {
    const c = CARS[k];
    if (c.hidden) { if (active && TRAFFIC.rand() < 0.02) spawnCar(c, 'ahead'); continue; }
    // recycle
    const rel = c.s - TR.s;
    if (rel < -340 || rel > 1450) { spawnCar(c, c.dir === 1 && rel > 0 && TRAFFIC.rand() < 0.5 ? 'behind' : 'ahead'); continue; }
    // car following
    const L = leaderOf(c, c.lane, PB);
    let acc = idm(c.v, c.v0, L.gap, c.v - L.v);
    if (c.lc) { const L2 = leaderOf(c, c.lc.to, PB); acc = Math.min(acc, idm(c.v, c.v0, L2.gap, c.v - L2.v)); }
    c.v = Math.max(0, c.v + clamp(acc, -8, 2) * dt);
    c.s += c.v * c.dir * dt;
    // keep-left lane logic
    c.t -= dt;
    if (!c.lc && c.t <= 0) {
      c.t = 0.6 + TRAFFIC.rand() * 0.6;
      if (c.lane === 0 && L.who && L.gap < 75 && L.v < c.v0 - 2.2 && !c.heavy) {
        if (laneChangeSafe(c, 1, PB)) c.lc = { from: 0, to: 1, p: 0 };
      } else if (c.lane === 1) {
        const ahead0 = leaderOf(c, 0, PB);
        if ((!ahead0.who || ahead0.gap > 110 || ahead0.v > c.v0 - 1) && laneChangeSafe(c, 0, PB)) c.lc = { from: 1, to: 0, p: 0 };
      }
    }
    if (c.lc) {
      c.lc.p += dt / 3.6;
      c.x = lerp(laneX(c.dir, c.lc.from), laneX(c.dir, c.lc.to), smooth(0, 1, c.lc.p));
      if (c.lc.p >= 1) { c.lane = c.lc.to; c.lc = null; c.x = laneX(c.dir, c.lane); }
    }
    if (c.dir === 1 && active) collideCar(c, PB);
  }
}
function collideCar(c, PB) {
  const c0 = c.s - c.len / 2, c1 = c.s + c.len / 2;
  for (const b of PB) {
    if (c1 <= b.s0 || c0 >= b.s1) continue;
    const ov = (c.wid / 2 + 1.25) - Math.abs(c.x - b.lat);
    if (ov <= 0) continue;
    const mid = (b.s0 + b.s1) / 2;
    let hit = 0;
    if (b.tractor && c0 > b.s1 - 2.0) { // we hit it from behind
      hit = Math.max(0, TR.v - c.v);
      TR.v = Math.max(0, c.v - 0.4); c.v += hit * 0.35; c.s = b.s1 + c.len / 2 + 0.05;
    } else if (!b.tractor && c1 < b.s0 + 2.0) { // it ran into our trailer
      c.v = Math.max(0, Math.min(c.v, TR.v - 0.6)); c.s = b.s0 - c.len / 2 - 0.05; hit = 0.6;
    } else { // side swipe
      const sgn = Math.sign(c.x - b.lat) || 1;
      c.x += sgn * ov; c.lc = null; c.lane = Math.abs(c.x - laneX(1, 0)) < Math.abs(c.x - laneX(1, 1)) ? 0 : 1;
      hit = 1 + Math.abs(TR.v - c.v) * 0.2; c.v *= 0.97;
    }
    if (hit > 0.4) EVENTS.push({ t: 'car', hit });
    TR.damage = Math.min(100, TR.damage + hit * 0.7);
    break;
  }
}
const _cp = {};
function updateCarVisuals(dayMul) {
  for (const c of CARS) {
    if (c.hidden) continue;
    posAt(c.s, c.x, _cp);
    let yaw = 0;
    if (c.lc) { const dx = (laneX(c.dir, c.lc.to) - laneX(c.dir, c.lc.from)) / 3.6 * (6 * c.lc.p * (1 - c.lc.p)); yaw = Math.atan2(dx, Math.max(4, c.v)) * c.dir; }
    c.grp.position.set(_cp.x, _cp.y, _cp.z);
    c.grp.rotation.y = _cp.h + (c.dir === 1 ? Math.PI : 0) - yaw;
    const g = gradeAt(c.s);
    c.grp.rotation.x = Math.atan(g) * c.dir;
  }
  CAR_LIT.color.setScalar(dayMul);
}

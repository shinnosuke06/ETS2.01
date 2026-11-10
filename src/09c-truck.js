// ---------------------------------------------------------------------------
// The truck as the rest of the game sees it: TR (state read by visuals, traffic,
// dash and game logic), placement on the road, and one step of powertrain + rig.
// ---------------------------------------------------------------------------
const WB = 3.9, HITCH = 0.35;
const PHYS_H = 1 / 240;

// L2: kingpin to axle group. cgE / cgC: [distance behind the kingpin, height] of the empty
// trailer and of the cargo. I0 + cargo * kI: yaw inertia. rear / nose: body ends from the kingpin.
const TRAILERS = {
  van: { key: 'van', name: 'バン', empty: 7000, L2: 8.3, cgE: [5.4, 1.5], cgC: [5.6, 2.0], I0: 108000, kI: 13, rear: 12.4, nose: 1.2, slosh: null },
  tank: { key: 'tank', name: 'タンク', empty: 6500, L2: 7.4, cgE: [4.8, 1.4], cgC: [5.0, 2.15], I0: 80000, kI: 9, rear: 10.4, nose: 1.0,
    slosh: { frac: 0.35, fx: 0.35, zx: 0.10, lx: 0.8, fy: 0.55, zy: 0.08, ly: 0.35 } },
};

const TR = {
  x: 0, z: 0, h: 0, v: 0, steer: 0, yawRate: 0, gear: 3, nextGear: 3, dir: 1, rpm: 600, shiftT: 0,
  thr: 0, brk: 0, ret: 0, load: 0, cruise: false, cruiseV: 0, cruiseI: 0,
  s: 0, lat: 0, idx: 0, y: 0, pitch: 0, accel: 0, latAcc: 0, frontS: 0, frontLat: 0,
  tr: { x: 0, z: 0, h: 0, s: 0, lat: 0, idx: 0, y: 0, pitch: 0, kx: 0, kz: 0 },
  odo: 128460, fuel: 0.82, damage: 0,
  gcw: 7600, mass: 7600, trailerKey: null,      // gross combination weight (kg) of tractor + job trailer + cargo
  link: 'free', linkT: 0,                        // 'free' | 'locking' | 'coupled' | 'unlocking'
  art: 0, kp: 0, roll: 0, ltr: 0, slip: 0, surge: 0,
  assist: { abs: false, tcs: false, esc: false, rsc: false },
  cab: { p: 0, pv: 0, r: 0, rv: 0, hv: 0, hy: 0 },
  spin: 0, onRamp: false, acc: 0, snapT: 0, railT: { t: 0, r: 0 },
};
const _tkPos = { x: 0, y: 0, z: 0, h: 0 }, _po = {};
const _pj = { i: 0, s: 0, lat: 0 }, _pjF = { i: 0, s: 0, lat: 0 }, _pjT = { i: 0, s: 0, lat: 0 };
const _cmd = { steer: 0, drive: 0, drag: 0, service: 0, hold: false };

// Largest front wheel angle the steering allows at this speed.
function steerLock(v) { return 0.6 / (1 + Math.pow(Math.abs(v) / 6.5, 2)); }

function setRigTrailer(key, cargoKg) {
  const spec = key ? TRAILERS[key] : null;
  TR.trailerKey = spec ? key : null;
  rigSetTrailer(spec, cargoKg);
  TR.gcw = RIGP.m1 + (spec ? spec.empty + cargoKg : 0); TR.mass = TR.gcw;
}

// Copy the rig's pose into TR and find where it is on the road.
function syncTR() {
  const T = TR, P = rigPose(_po), spec = RIG.spec;
  T.x = P.x; T.z = P.z; T.h = P.h; T.v = P.v; T.yawRate = P.w; T.steer = RIG.steer;
  ROAD.project(T.x, T.z, T.idx, _pj); T.idx = _pj.i; T.s = _pj.s; T.lat = _pj.lat;
  ROAD.project(T.x + Math.sin(T.h) * RIGP.front, T.z + Math.cos(T.h) * RIGP.front, T.idx, _pjF);
  T.frontS = _pjF.s; T.frontLat = _pjF.lat;
  T.y = ROAD.elevAt(T.s); T.pitch = Math.atan2(ROAD.elevAt(T.s + WB) - T.y, WB);
  const tr = T.tr;
  if (spec) {
    tr.x = P.tx; tr.z = P.tz; tr.h = P.th;
    ROAD.project(tr.x, tr.z, tr.idx, _pjT); tr.idx = _pjT.i; tr.s = _pjT.s; tr.lat = _pjT.lat;
    tr.kx = tr.x + Math.sin(tr.h) * spec.L2; tr.kz = tr.z + Math.cos(tr.h) * spec.L2;
    tr.y = ROAD.elevAt(tr.s); tr.pitch = Math.atan2(ROAD.elevAt(tr.s + spec.L2) - tr.y, spec.L2);
  } else {
    tr.x = P.hx; tr.z = P.hz; tr.h = T.h; tr.idx = T.idx; tr.s = T.s; tr.lat = T.lat; tr.kx = P.hx; tr.kz = P.hz; tr.y = T.y; tr.pitch = T.pitch;
  }
  T.art = RIG.coupled ? wrapA(T.h - tr.h) : 0;
  T.kp = RIG.coupled ? Math.max(0, RIG.r.m * G - RIG.axle[2].Fz) : 0;
}

// ---- a known-good copy to fall back on if the numbers ever break ----
const _snap = { t: rigBody(), r: rigBody(), coupled: false, idx: 0, tidx: 0, ok: false };
function truckSnapshot() {
  Object.assign(_snap.t, RIG.t); Object.assign(_snap.r, RIG.r);
  _snap.coupled = RIG.coupled; _snap.idx = TR.idx; _snap.tidx = TR.tr.idx; _snap.ok = true;
}
function truckRestore() {
  if (!_snap.ok) return;
  Object.assign(RIG.t, _snap.t); Object.assign(RIG.r, _snap.r);
  RIG.coupled = _snap.coupled; TR.idx = _snap.idx; TR.tr.idx = _snap.tidx;
  RIG.t.vx = RIG.t.vz = RIG.t.w = 0; RIG.r.vx = RIG.r.vz = RIG.r.w = 0;
  rigResetState(); syncTR();
  TR.accel = TR.latAcc = 0; TR.cruise = false;
  EVENTS.push({ t: 'reset' });
}
function truckHealthy() {
  const t = RIG.t, r = RIG.r;
  return Number.isFinite(t.x + t.z + t.h + t.vx + t.vz + t.w + r.x + r.z + r.h + r.vx + r.vz + r.w + TR.s + TR.lat + TR.v) && Math.abs(TR.lat) <= 200;
}

// Put the tractor's rear axle on the road at (s, lat). opts.coupled (default true) tows the job
// trailer straight behind; opts.yaw turns the rig away from the road direction (rad, left positive).
function placeTruck(s, lat, v = 0, opts = {}) {
  const T = TR, coupled = opts.coupled !== false && !!T.trailerKey;
  ROAD.posAt(s, lat, _tkPos);
  rigPlace(_tkPos.x, _tkPos.z, _tkPos.h + (opts.yaw || 0), v, coupled);
  const hint = Math.max(0, Math.floor(s / DS));
  T.idx = hint; RIG.t.i = hint;
  if (coupled) { T.tr.idx = hint; RIG.r.i = hint; }
  T.link = coupled ? 'coupled' : 'free'; T.linkT = 0;
  T.cruise = false; T.shiftT = 0; T.dir = 1; T.rpm = 600; T.ret = 0; T.thr = T.brk = T.load = 0;
  T.accel = T.latAcc = 0; T.acc = 0; T.snapT = 0; T.railT.t = T.railT.r = 0;
  T.cab.p = T.cab.pv = T.cab.r = T.cab.rv = T.cab.hv = T.cab.hy = 0;
  syncTR();
  T.gear = T.nextGear = startGear();
  truckSnapshot();
}

// Scale the whole rig's speed (0 stops it). For game events such as hitting the toll bar.
function scaleSpeed(k) {
  for (const b of [RIG.t, RIG.r]) { b.vx *= k; b.vz *= k; b.w *= k; }
  TR.v *= k;
}

// Turn what the rig hit this step into damage and events.
function truckContacts(dt) {
  const T = TR, H = RIG.hit;
  for (const u of ['t', 'r']) {
    const c = H[u];
    T.railT[u] = Math.max(0, T.railT[u] - dt);
    if (c.imp > 0) {
      T.damage = Math.min(100, T.damage + 1.5 * c.imp / RIG[u].m);
      if (T.railT[u] <= 0) { EVENTS.push({ t: 'rail', hit: c.vn, unit: u }); T.railT[u] = 1.2; }
    }
    c.imp = c.vn = 0;
  }
  const b = H.b;
  if (b.imp > 0) {
    T.damage = Math.min(100, T.damage + 1.5 * b.imp / (RIG.t.m + (RIG.coupled ? RIG.r.m : 0)));
    if (b.vn > 2) EVENTS.push({ t: 'crash', hit: b.vn });
  }
  b.imp = b.vn = 0;
}

// Another vehicle c = { s, x, v, len, wid, heavy } against one of playerBoxes(). Moves and slows c,
// pushes the truck with an impulse, and returns how hard the contact was (0: none).
const _cc = { x: 0, y: 0, z: 0, h: 0 };
function resolveCarContact(c, b) {
  const c0 = c.s - c.len / 2, c1 = c.s + c.len / 2;
  if (c1 <= b.s0 || c0 >= b.s1) return 0;
  const ov = (c.wid / 2 + RIGP.half) - Math.abs(c.x - b.lat);
  if (ov <= 0) return 0;
  const unit = b.tractor ? 't' : 'r', towed = RIG.coupled;
  const movable = b.tractor || towed;
  const M = towed ? RIG.t.m + RIG.r.m : RIG[unit].m, mc = c.heavy ? 12000 : 1500;
  const red = mc * M / (mc + M), vTruck = movable ? TR.v : 0;
  let hit = 0;
  if (b.tractor && c0 > b.s1 - 2.0) {                 // the truck ran into it
    const dv = Math.max(0, vTruck - c.v), J = 1.1 * red * dv;
    c.v += J / mc; c.s = b.s1 + c.len / 2 + 0.05; hit = dv;
    ROAD.posAt(b.s1, b.lat, _cc);
    rigApplyImpulse('t', _cc.x, _cc.z, -J * Math.sin(_cc.h), -J * Math.cos(_cc.h));
  } else if (!b.tractor && c1 < b.s0 + 2.0) {         // it ran into the back of the trailer
    const dv = Math.max(0, c.v - vTruck), J = 1.1 * (movable ? red : mc) * dv;
    c.v = Math.max(0, Math.min(c.v - J / mc, vTruck - 0.3)); c.s = b.s0 - c.len / 2 - 0.05; hit = 0.6;
    ROAD.posAt(b.s0, b.lat, _cc);
    rigApplyImpulse('r', _cc.x, _cc.z, J * Math.sin(_cc.h), J * Math.cos(_cc.h));
  } else {                                            // side swipe: shove both apart
    const sgn = Math.sign(c.x - b.lat) || 1, J = red * 1.0;
    c.x += sgn * ov; hit = 1 + Math.abs(vTruck - c.v) * 0.2; c.v *= 0.97;
    ROAD.posAt(c.s, b.lat, _cc);
    rigApplyImpulse(unit, _cc.x, _cc.z, sgn * J * Math.cos(_cc.h), -sgn * J * Math.sin(_cc.h));
  }
  if (hit > 0.4) EVENTS.push({ t: 'car', hit });
  TR.damage = Math.min(100, TR.damage + hit * 0.7);
  return hit;
}

const finite = v => (Number.isFinite(v) ? v : 0);
// inp: { throttle 0..1, brake 0..1, steer -1..1 (right positive) }
function stepTruck(dt, inp) {
  const T = TR, vPrev = T.v;
  const pt = powertrainStep(dt, finite(inp.throttle), finite(inp.brake));
  const target = clamp(finite(inp.steer), -1, 1) * steerLock(T.v);
  _cmd.steer = damp(RIG.steer, target, 7, dt);
  _cmd.drive = pt.drive; _cmd.drag = pt.drag; _cmd.service = pt.service;
  // standing still with the throttle closed or the brake on: stay put, also on a slope
  _cmd.hold = Math.abs(T.v) < 0.05 && (T.thr < 0.05 || pt.service > 0.02);
  rigStep(dt, _cmd);
  syncTR();
  if (!truckHealthy()) { truckRestore(); return; }
  T.snapT += dt; if (T.snapT >= 0.5) { T.snapT = 0; truckSnapshot(); }
  truckContacts(dt);

  // derived motion for cab sway, sounds and gauges
  T.accel = damp(T.accel, (T.v - vPrev) / dt, 8, dt);
  T.latAcc = damp(T.latAcc, T.v * T.yawRate, 8, dt);
  T.spin += T.v / RW * dt;
  T.odo += Math.abs(T.v) * dt * SCALE / 1000;
  T.fuel = Math.max(0, T.fuel - (Math.max(0, pt.drive * T.v) / (0.42 * 36e6) + 0.0004) * dt * SCALE / 600);
  const c = T.cab;
  const bump = (vnoise(T.s * 0.35, 0, 3) - 0.5) * Math.min(1, Math.abs(T.v) / 15);
  c.pv += ((clamp(T.accel * 0.006, -0.045, 0.035) - c.p) * 70 - c.pv * 9) * dt; c.p += c.pv * dt;
  c.rv += ((clamp(-T.latAcc * 0.011, -0.06, 0.06) - c.r) * 60 - c.rv * 8) * dt; c.r += c.rv * dt;
  c.hv += ((bump * 0.03 - c.hy) * 120 - c.hv * 10) * dt; c.hy += c.hv * dt;
}

// Advance the physics by a frame's worth of fixed steps. Returns how many steps ran.
function physicsAdvance(dt, inp) {
  TR.acc += Math.min(finite(dt), 0.1);
  let n = 0;
  while (TR.acc >= PHYS_H - 1e-9 && n < 24) { stepTruck(PHYS_H, inp); TR.acc -= PHYS_H; n++; }
  if (n === 24) TR.acc = 0;   // a long frame: drop the backlog rather than chase it
  return n;
}

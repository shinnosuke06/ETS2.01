// ---------------------------------------------------------------------------
// Truck motion: longitudinal forces from the powertrain, kinematic steering and trailer.
// ---------------------------------------------------------------------------
const WB = 3.9, LT = 8.3, HITCH = 0.35;

const TR = {
  x: 0, z: 0, h: 0, v: 0, steer: 0, yawRate: 0, gear: 3, nextGear: 3, dir: 1, rpm: 600, shiftT: 0,
  thr: 0, brk: 0, ret: 0, load: 0, cruise: false, cruiseV: 0, cruiseI: 0,
  s: 0, lat: 0, idx: 0, y: 0, pitch: 0, accel: 0, latAcc: 0, frontS: 0, frontLat: 0,
  tr: { x: 0, z: 0, h: 0, s: 0, lat: 0, idx: 0, y: 0, pitch: 0 },
  odo: 128460, fuel: 0.82, damage: 0, mass: 26000,
  cab: { p: 0, pv: 0, r: 0, rv: 0, hv: 0, hy: 0 },
  spin: 0, scrapeT: 0, lastImpact: 0, onRamp: false,
};
const _pj = { i: 0, s: 0, lat: 0 }, _pjF = { i: 0, s: 0, lat: 0 }, _pjT = { i: 0, s: 0, lat: 0 };
const _iv = [];

function placeTruck(s, lat, v = 0) {
  posAt(s, lat, _pp);
  TR.x = _pp.x; TR.z = _pp.z; TR.h = _pp.h; TR.v = v; TR.steer = 0; TR.yawRate = 0;
  TR.idx = idxAt(s); TR.s = s; TR.lat = lat;
  const hx = TR.x + Math.sin(TR.h) * HITCH, hz = TR.z + Math.cos(TR.h) * HITCH;
  TR.tr.x = hx - Math.sin(TR.h) * LT; TR.tr.z = hz - Math.cos(TR.h) * LT; TR.tr.h = TR.h;
  TR.tr.idx = idxAt(s - LT);
  project(TR.tr.x, TR.tr.z, TR.tr.idx, _pjT); TR.tr.idx = _pjT.i; TR.tr.s = _pjT.s; TR.tr.lat = _pjT.lat;
  TR.cruise = false; TR.shiftT = 0; TR.dir = 1; TR.gear = startGear(); TR.rpm = 600;
  TR.cab.p = TR.cab.pv = TR.cab.r = TR.cab.rv = 0;
  updateHeights();
}
function updateHeights() {
  const yR = elevAt(TR.s), yF = elevAt(TR.s + WB);
  TR.y = yR; TR.pitch = Math.atan2(yF - yR, WB);
  const yH = elevAt(TR.s + HITCH), yA = elevAt(TR.tr.s);
  TR.tr.y = yA; TR.tr.pitch = Math.atan2(yH - yA, LT);
}

function pickInterval(ivs, lat) {
  let best = ivs[0], bd = Infinity;
  for (const iv of ivs) {
    if (lat >= iv[0] && lat <= iv[1]) return iv;
    const d = Math.min(Math.abs(lat - iv[0]), Math.abs(lat - iv[1]));
    if (d < bd) { bd = d; best = iv; }
  }
  return best;
}

function stepTruck(dt, inp) {
  const T = TR;
  const vPrev = T.v;
  // steering: lock reduces with speed
  const maxSt = 0.6 / (1 + Math.pow(Math.abs(T.v) / 6.5, 2));
  T.steer = damp(T.steer, inp.steer * maxSt, 7, dt);

  const pt = powertrainStep(dt, inp.throttle, inp.brake);
  const thr = T.thr, service = pt.service, Fd = pt.drive;

  const m = T.mass, g9 = 9.81;
  const grade = gradeAt(T.s), sinG = grade / Math.sqrt(1 + grade * grade);
  const Fg = -m * g9 * sinG;
  const sv = Math.sign(T.v);
  const Froll = -sv * 0.0055 * m * g9;
  const Faero = -sv * 0.5 * 1.2 * 0.6 * 10.2 * T.v * T.v;
  const Fret = -sv * pt.drag;
  const Fsrv = -sv * service * m * 6.8;
  if (Math.abs(T.v) < 0.05) {
    const F = Fd + Fg, fr = 0.0055 * m * g9;
    const hold = (thr < 0.05 || service > 0.02) ? Infinity : fr;
    if (Math.abs(F) <= hold) T.v = 0;
    else T.v += (F - Math.sign(F) * fr) / m * dt;
  } else {
    const a = (Fd + Fg + Froll + Faero + Fret + Fsrv) / m;
    const vn = T.v + a * dt;
    T.v = (Math.sign(vn) !== Math.sign(T.v) && Fd * Math.sign(T.v) <= 0) ? 0 : vn;
  }

  // kinematics
  T.yawRate = -T.v * Math.tan(T.steer) / WB;
  T.h += T.yawRate * dt;
  T.x += Math.sin(T.h) * T.v * dt;
  T.z += Math.cos(T.h) * T.v * dt;

  project(T.x, T.z, T.idx, _pj); T.idx = _pj.i; T.s = _pj.s; T.lat = _pj.lat;
  const fx = T.x + Math.sin(T.h) * 5.3, fz = T.z + Math.cos(T.h) * 5.3;
  project(fx, fz, T.idx, _pjF); T.frontS = _pjF.s; T.frontLat = _pjF.lat;
  collideEdges(dt);

  // trailer follows the fifth wheel
  const hx = T.x + Math.sin(T.h) * HITCH, hz = T.z + Math.cos(T.h) * HITCH;
  const dx = hx - T.tr.x, dz = hz - T.tr.z, d = Math.hypot(dx, dz) || 1;
  T.tr.x = hx - dx / d * LT; T.tr.z = hz - dz / d * LT;
  T.tr.h = T.h - wrapA(T.h - Math.atan2(dx, dz));
  const art = wrapA(T.h - T.tr.h);
  if (Math.abs(art) > 1.35) { T.tr.h = T.h - Math.sign(art) * 1.35; T.tr.x = hx - Math.sin(T.tr.h) * LT; T.tr.z = hz - Math.cos(T.tr.h) * LT; }
  project(T.tr.x, T.tr.z, T.tr.idx, _pjT); T.tr.idx = _pjT.i; T.tr.s = _pjT.s; T.tr.lat = _pjT.lat;
  updateHeights();

  // derived motion for cab sway, sounds, gauges
  T.accel = damp(T.accel, (T.v - vPrev) / dt, 8, dt);
  T.latAcc = damp(T.latAcc, T.v * T.yawRate, 8, dt);
  T.spin += T.v / RW * dt;
  T.odo += Math.abs(T.v) * dt * SCALE / 1000;
  const P = Math.max(0, Fd * T.v);
  T.fuel = Math.max(0, T.fuel - (P / (0.42 * 36e6) + 0.0004) * dt * SCALE / 600);
  const c = T.cab;
  const bump = (vnoise(T.s * 0.35, 0, 3) - 0.5) * Math.min(1, Math.abs(T.v) / 15);
  c.pv += ((clamp(T.accel * 0.006, -0.045, 0.035) - c.p) * 70 - c.pv * 9) * dt; c.p += c.pv * dt;
  c.rv += ((clamp(-T.latAcc * 0.011, -0.06, 0.06) - c.r) * 60 - c.rv * 8) * dt; c.r += c.rv * dt;
  c.hv += ((bump * 0.03 - c.hy) * 120 - c.hv * 10) * dt; c.hy += c.hv * dt;
  T.scrapeT = Math.max(0, T.scrapeT - dt);
}

function collideEdges(dt) {
  const T = TR, HW = 1.25;
  let push = 0;
  for (const [s, lat] of [[T.s, T.lat], [T.frontS, T.frontLat]]) {
    drivable(s, _iv);
    const iv = pickInterval(_iv, lat);
    if (lat - HW < iv[0]) push = Math.max(push, iv[0] - (lat - HW));
    else if (lat + HW > iv[1]) push = Math.min(push, iv[1] - (lat + HW));
  }
  if (Math.abs(push) > 0.002) {
    const i = idxAt(T.s);
    T.x += RX[i] * push; T.z += RZ[i] * push;
    const rh = headingAt(T.s);
    const da = wrapA(T.h - rh);
    // push > 0 means the wall is on our left (increasing h turns left)
    if ((push > 0 && da > 0) || (push < 0 && da < 0)) T.h = rh + da * 0.6;
    const hit = Math.abs(T.v * Math.sin(da)) + Math.abs(push) * 4;
    T.v *= 1 - clamp(0.02 + hit * 0.04, 0, 0.5) * Math.min(1, dt * 60);
    if (T.scrapeT <= 0) { EVENTS.push({ t: 'rail', hit }); T.scrapeT = 1.2; }
    T.damage = Math.min(100, T.damage + hit * 0.15);
    project(T.x, T.z, T.idx, _pj); T.idx = _pj.i; T.s = _pj.s; T.lat = _pj.lat;
  }
  // barriers: end of the road, end of a ramp
  const r = rampAt(T.frontS);
  const onRampLane = r && T.frontLat < -14.5;
  if ((T.frontS > ROUTE_END - 1.5 && T.frontLat > -14) || (onRampLane && T.frontS > r.sEnd - 5)) {
    const lim = onRampLane ? r.sEnd - 5 : ROUTE_END - 1.5;
    const back = T.frontS - lim;
    T.x -= Math.sin(T.h) * back; T.z -= Math.cos(T.h) * back;
    if (T.v > 2) { EVENTS.push({ t: 'crash', hit: T.v }); T.damage = Math.min(100, T.damage + T.v * 0.8); }
    T.v = Math.min(T.v, 0);
    project(T.x, T.z, T.idx, _pj); T.idx = _pj.i; T.s = _pj.s; T.lat = _pj.lat;
  }
}

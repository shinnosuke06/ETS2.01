// ---------------------------------------------------------------------------
// Truck dynamics: 13 L engine, 12-speed automated gearbox (Opticruise-style),
// retarder, cruise control, 90 km/h limiter, kinematic steering and trailer.
// ---------------------------------------------------------------------------
const GEARS = [0, 11.32, 9.16, 7.19, 5.82, 4.57, 3.70, 3.02, 2.44, 1.92, 1.55, 1.24, 1.00];
const REV_RATIO = 10.5, FINAL = 2.59, RW = 0.52, EFF = 0.92, WB = 3.9, LT = 8.3, HITCH = 0.35;
const VMAX = 90 / 3.6;
const TQ = [[500, 900], [700, 1700], [900, 2350], [1000, 2550], [1300, 2550], [1500, 2380], [1700, 2150], [1900, 1850], [2100, 1450], [2250, 600], [2400, 0]];
function engineTorque(rpm) {
  if (rpm <= TQ[0][0]) return TQ[0][1];
  for (let i = 0; i < TQ.length - 1; i++) if (rpm < TQ[i + 1][0]) return lerp(TQ[i][1], TQ[i + 1][1], (rpm - TQ[i][0]) / (TQ[i + 1][0] - TQ[i][0]));
  return 0;
}

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
function startGear() {
  const g = gradeAt(TR.s);
  if (g > 0.03) return 2;
  return TR.mass > 30000 ? 2 : 3;
}
function rWheelOk(r) { return r < 1900; }
function shiftTo(g) { if (g === TR.gear) return; TR.nextGear = g; TR.shiftT = 0.42; }

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

const EVENTS = []; // collisions etc. for the game layer
function stepTruck(dt, inp) {
  const T = TR;
  const vPrev = T.v;
  // steering: lock reduces with speed
  const maxSt = 0.6 / (1 + Math.pow(Math.abs(T.v) / 6.5, 2));
  T.steer = damp(T.steer, inp.steer * maxSt, 7, dt);

  let thr = clamp(inp.throttle, 0, 1), brk = clamp(inp.brake, 0, 1);
  if (T.cruise) {
    if (brk > 0.05 || T.dir !== 1 || T.v < 7) { T.cruise = false; EVENTS.push({ t: 'cruiseOff' }); }
    else {
      const err = T.cruiseV - T.v;
      T.cruiseI = clamp(T.cruiseI + err * 0.05 * dt, -0.2, 0.6);
      thr = Math.max(thr, clamp(0.25 + err * 0.55 + T.cruiseI, 0, 1));
    }
  }
  if (T.dir === 1 && T.v > VMAX - 0.6) thr = Math.min(thr, clamp((VMAX - T.v) / 0.6, 0, 1));
  if (T.dir === -1 && T.v < -3) thr = Math.min(thr, clamp((T.v + 4) / 1, 0, 1));
  T.thr = thr; T.brk = brk;

  let ret = brk > 0 ? clamp(brk / 0.35, 0, 1) : 0;
  if (T.cruise && T.v > T.cruiseV + 0.6) ret = Math.max(ret, clamp((T.v - T.cruiseV - 0.6) * 0.5, 0, 1));
  T.ret = damp(T.ret, ret, 6, dt);
  const service = clamp((brk - 0.3) / 0.7, 0, 1);

  // gearbox
  const wheelRpm = Math.abs(T.v) / RW * 60 / TAU;
  const rpmFor = g => wheelRpm * GEARS[g] * FINAL;
  if (T.shiftT > 0) { T.shiftT -= dt; if (T.shiftT <= 0) T.gear = T.nextGear; }
  else if (T.dir === 1) {
    const r = rpmFor(T.gear), hard = thr > 0.7;
    if (Math.abs(T.v) < 0.6) T.gear = startGear();
    else if (r > (hard ? 1700 : 1420) && T.gear < 12) {
      let g = T.gear + 1; while (g < 12 && rpmFor(g + 1) > (hard ? 1250 : 1080)) g++;
      shiftTo(g);
    } else if (r < (hard ? 1080 : 900) && T.gear > startGear() && rWheelOk(rpmFor(T.gear - 1))) {
      const g0 = startGear();
      let g = T.gear - 1; while (g > g0 && rpmFor(g) < (hard ? 1150 : 1000)) g--;
      shiftTo(g);
    }
  }
  const ratio = T.dir === -1 ? REV_RATIO : GEARS[T.gear];
  const rWheel = wheelRpm * ratio * FINAL;
  let rpmT;
  if (T.dir === 0) rpmT = 600 + thr * 1400;
  else if (T.shiftT > 0) rpmT = Math.max(600, rpmFor(T.nextGear));
  else if (rWheel < 800) rpmT = Math.max(rWheel, 650 + thr * 520);
  else rpmT = rWheel;
  T.rpm = clamp(damp(T.rpm, rpmT, T.shiftT > 0 ? 9 : 14, dt), 560, 2350);

  let Fd = 0;
  if (T.dir !== 0 && T.shiftT <= 0) {
    Fd = engineTorque(Math.max(T.rpm, 700)) * thr * ratio * FINAL * EFF / RW * T.dir;
    if (thr < 0.05 && rWheel > 700) Fd -= Math.sign(T.v) * (120 + T.rpm * 0.06) * ratio * FINAL / RW * 0.5;
  }
  T.load = T.shiftT > 0 ? 0 : thr;

  const m = T.mass, g9 = 9.81;
  const grade = gradeAt(T.s), sinG = grade / Math.sqrt(1 + grade * grade);
  const Fg = -m * g9 * sinG;
  const sv = Math.sign(T.v);
  const Froll = -sv * 0.0055 * m * g9;
  const Faero = -sv * 0.5 * 1.2 * 0.6 * 10.2 * T.v * T.v;
  const Fret = -sv * 21000 * T.ret * clamp(Math.abs(T.v) / 6, 0, 1);
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

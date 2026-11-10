// ---------------------------------------------------------------------------
// Articulated vehicle dynamics: a tractor and a semi-trailer as two rigid bodies
// in the road plane, joined at the fifth wheel. Each axle is one lumped tyre whose
// grip comes from its load. Fixed step (1/240 s); free of browser APIs.
//
// Conventions: heading h has forward f = (sin h, cos h) and right r = (-cos h, sin h).
// Yaw rate w = dh/dt is positive turning left; steer is positive to the right.
// A point at world offset (rx, rz) from a centre of mass moves at v + w * (rz, -rx),
// and a force (Fx, Fz) there gives the moment Fx * rz - Fz * rx.
// ---------------------------------------------------------------------------
const MU = 0.8;          // tyre-road friction, dry asphalt
const G = 9.81;
const RIGP = {
  m1: 7600, I1: 22000, L1: 3.9, a1: 1.25, b1: 2.65,   // tractor: mass, yaw inertia, wheelbase, CG to front / rear axle
  e: 0.35, h1: 1.1, hh: 1.2,                         // fifth wheel ahead of the rear axle, CG height, fifth wheel height
  track: 2.05, half: 1.25, front: 5.4, back: 0.9,     // track, half body width, body ends measured from the rear axle
  ca: [5.8, 6.0, 6.0],                               // cornering stiffness per unit load: front, drive, trailer
  brakeMax: [45000, 75000, 160000], lag: [0.35, 0.35, 0.5],
  lsvRef: 24000 * 9.81, lsvMin: 0.4,                 // trailer load-sensing valve
  V0: 1.5, artMax: 1.396,                           // below V0 the slip angle is taken against V0, which keeps a stopped tyre stable
};

const rigBody = () => ({ x: 0, z: 0, h: 0, vx: 0, vz: 0, w: 0, m: 0, I: 0, i: 0 });
const RIG = {
  t: rigBody(), r: rigBody(),
  coupled: false, spec: null, cargo: 0, d2: 0, h2: 0,
  steer: 0, brakeP: [0, 0, 0],
  axle: [0, 1, 2].map(() => ({ Fz: 0, Fx: 0, Fy: 0, alpha: 0, lock: false, spin: false })),
  stat: [0, 0, 0],       // static axle loads (N)
  ax: 0, Hx: 0, FxT: 0,  // smoothed longitudinal acceleration, trailer push on the tractor, trailer tyre force
  assistOn: true, assist: { abs: false, tcs: false, esc: false, rsc: false },
  roll: 0, rollV: 0, ltr: 0, ltrT: 0, slosh: { x: 0, vx: 0, y: 0, vy: 0 }, surge: 0, gap: 0,
  // contacts since the truck layer last looked: impulse taken (N s) and the fastest approach (m/s)
  hit: { t: { imp: 0, vn: 0 }, r: { imp: 0, vn: 0 }, b: { imp: 0, vn: 0 } },
  escT: 0, artDev: 0, wref: 0,   // stability control: time left active, last articulation error, expected yaw rate
  ms: 0, ay: 0,                  // sloshing part of the cargo (kg); smoothed lateral acceleration of the unit that can tip
  rscOn: false, rolled: false, jack: false,
};
RIG.t.m = RIGP.m1; RIG.t.I = RIGP.I1;

// Axle loads with longitudinal transfer. ax: forward acceleration; Hx: trailer pushing the
// tractor forward; FxT: longitudinal tyre force on the trailer axles (negative when braking).
const _L = [0, 0, 0];
function rigLoads(ax, Hx, FxT, out) {
  const P = RIGP, m1 = P.m1, S = RIG.stat;
  let FzT = 0, Fk = 0;
  if (RIG.coupled) {
    const m2 = RIG.r.m;
    FzT = (m2 * G * RIG.d2 + m2 * ax * (RIG.h2 - P.hh) + P.hh * FxT) / RIG.spec.L2;
    FzT = clamp(FzT, 0.05 * S[2], m2 * G);
    Fk = m2 * G - FzT;
  }
  let FzF = (m1 * G * P.b1 - m1 * ax * P.h1 + P.e * Fk + P.hh * Hx) / P.L1;
  const total = m1 * G + Fk;
  FzF = clamp(FzF, 0.05 * S[0], total - 0.05 * S[1]);
  out[0] = FzF; out[1] = total - FzF; out[2] = FzT;
  return out;
}
function rigStatic() {
  const S = RIG.stat; S[0] = S[1] = S[2] = 0;
  rigLoads(0, 0, 0, S);
}
function rigAxleLoads() { rigStatic(); return RIG.stat.slice(); }

function rigSetTrailer(spec, cargoKg) {
  const R = RIG;
  R.spec = spec || null; R.cargo = spec ? cargoKg : 0;
  if (!spec) { R.r.m = 0; R.r.I = 0; R.d2 = 0; R.h2 = 0; R.ms = 0; R.coupled = false; rigStatic(); return; }
  const m = spec.empty + cargoKg;
  R.r.m = m; R.r.I = spec.I0 + cargoKg * spec.kI;
  R.ms = spec.slosh ? spec.slosh.frac * cargoKg : 0;
  R.d2 = (spec.empty * spec.cgE[0] + cargoKg * spec.cgC[0]) / m;
  R.h2 = (spec.empty * spec.cgE[1] + cargoKg * spec.cgC[1]) / m;
  rigStatic();
}

function rigResetState() {
  const R = RIG;
  R.steer = 0; R.brakeP[0] = R.brakeP[1] = R.brakeP[2] = 0;
  for (const a of R.axle) { a.Fx = a.Fy = a.alpha = 0; a.lock = a.spin = false; }
  R.ax = R.Hx = R.FxT = 0; R.gap = 0;
  R.assist.abs = R.assist.tcs = R.assist.esc = R.assist.rsc = false;
  R.roll = R.rollV = R.ltr = R.ltrT = 0; R.surge = 0;
  R.slosh.x = R.slosh.vx = R.slosh.y = R.slosh.vy = 0;
  for (const k of ['t', 'r', 'b']) R.hit[k].imp = R.hit[k].vn = 0;
  R.escT = 0; R.artDev = 0; R.wref = 0;
  R.ay = 0; R.rscOn = false; R.rolled = false; R.jack = false;
}
// (x, z) is the tractor's rear axle. A coupled trailer is put straight behind.
function rigPlace(x, z, h, v, coupled) {
  const R = RIG, P = RIGP, t = R.t, r = R.r, fx = Math.sin(h), fz = Math.cos(h);
  t.x = x + fx * P.b1; t.z = z + fz * P.b1; t.h = h; t.vx = fx * v; t.vz = fz * v; t.w = 0;
  R.coupled = !!coupled && !!R.spec;
  if (R.coupled) {
    const kx = x + fx * P.e, kz = z + fz * P.e;
    r.h = h; r.x = kx - fx * R.d2; r.z = kz - fz * R.d2; r.vx = t.vx; r.vz = t.vz; r.w = 0;
  }
  rigResetState(); rigStatic();
  for (let i = 0; i < 3; i++) R.axle[i].Fz = R.stat[i];
}
// Leave the trailer standing with its kingpin at (kx, kz).
function rigParkTrailer(kx, kz, h) {
  const R = RIG, r = R.r;
  r.h = h; r.x = kx - Math.sin(h) * R.d2; r.z = kz - Math.cos(h) * R.d2; r.vx = r.vz = r.w = 0;
  R.coupled = false; rigStatic();
}

// One lumped tyre. (uP, vP): velocity of the axle centre in body axes (forward, right).
// Leaves the body-axis force in _Fu, _Fv.
let _Fu = 0, _Fv = 0;
function rigTyre(i, uP, vP, delta, Fz, drive, brake) {
  const P = RIGP, A = RIG.axle[i];
  const cd = Math.cos(delta), sd = Math.sin(delta);
  const uw = uP * cd + vP * sd, vw = -uP * sd + vP * cd;
  const alpha = Math.atan2(vw, Math.max(Math.abs(uw), P.V0));
  const roll = clamp(Math.abs(uw) / 0.3, 0, 1) * (uw >= 0 ? 1 : -1);
  const Fmax = MU * Fz, moving = Math.abs(uw) > 0.5;
  let lock = false, spin = false;
  if (RIG.assistOn) {
    // ABS keeps each axle short of locking, traction control keeps the drive axle short of spinning.
    // Both give way to cornering: they leave room on the friction circle for the side force the slip angle asks for.
    const want = Math.min(P.ca[i] * Fz * Math.abs(alpha), 0.95 * Fmax), room = Math.sqrt(Fmax * Fmax - want * want);
    const capB = Math.min(0.85 * Fmax, room), capD = Math.min(0.9 * Fmax, room);
    if (brake > capB) { brake = capB; if (moving) RIG.assist.abs = true; }
    if (Math.abs(drive) > capD) { drive = Math.sign(drive) * capD; RIG.assist.tcs = true; }
  }
  const Fxd = drive - roll * (brake + 0.0055 * Fz);
  let Fx, Fy;
  if (Math.abs(Fxd) <= Fmax || RIG.assistOn) {
    Fx = clamp(Fxd, -Fmax, Fmax);
    const cap = Math.sqrt(Math.max(Fmax * Fmax - Fx * Fx, 0));
    Fy = cap > 1 ? -cap * Math.tanh(P.ca[i] * Fz * alpha / cap) : 0;
  } else if (Math.abs(roll) * brake > Math.abs(drive)) {
    // locked wheel: it slides, and friction simply opposes the sliding. No sideways grip is left.
    const sp = Math.hypot(uw, vw) || 1;
    Fx = -0.8 * Fmax * uw / sp; Fy = -0.8 * Fmax * vw / sp; lock = true;
  } else {
    // spinning under power: less drive, and little sideways grip
    const cap = 0.3 * Fmax;
    Fx = Math.sign(drive) * 0.7 * Fmax; Fy = -cap * Math.tanh(P.ca[i] * Fz * alpha / cap); spin = true;
  }
  A.Fz = Fz; A.Fx = Fx; A.Fy = Fy; A.alpha = alpha; A.lock = lock; A.spin = spin;
  _Fu = Fx * cd - Fy * sd; _Fv = Fx * sd + Fy * cd;
}

const _pr = { i: 0, s: 0, lat: 0 };

// ---- body roll, liquid cargo and the tipping measure ----
// aLat: lateral acceleration (to the right) of the unit that can tip. aLongT, aLatT: the trailer's own.
function rigRollSlosh(h, aLat, aLongT, aLatT) {
  const R = RIG, P = RIGP;
  R.ay += (aLat - R.ay) * (1 - Math.exp(-h * TAU * 5));
  const wr = TAU * 1.0;
  R.rollV += (wr * wr * (0.0255 * R.ay - R.roll) - 2 * 0.4 * wr * R.rollV) * h; R.roll += R.rollV * h;
  let shift = 0;
  const sl = R.spec && R.spec.slosh;
  if (sl && R.ms > 0) {
    // part of the liquid moves like a mass on a spring inside the tank, fore-aft and sideways
    const S = R.slosh, wx = TAU * sl.fx, wy = TAU * sl.fy;
    S.vx += (-aLongT - wx * wx * S.x - 2 * sl.zx * wx * S.vx) * h; S.x += S.vx * h;
    if (S.x > sl.lx) { S.x = sl.lx; if (S.vx > 0) S.vx = 0; } else if (S.x < -sl.lx) { S.x = -sl.lx; if (S.vx < 0) S.vx = 0; }
    S.vy += (-aLatT - wy * wy * S.y - 2 * sl.zy * wy * S.vy) * h; S.y += S.vy * h;
    if (S.y > sl.ly) { S.y = sl.ly; if (S.vy > 0) S.vy = 0; } else if (S.y < -sl.ly) { S.y = -sl.ly; if (S.vy < 0) S.vy = 0; }
    R.surge = R.ms * (wx * wx * S.x + 2 * sl.zx * wx * S.vx) / (R.r.m * G);
    shift = R.ms * S.y / R.r.m;
  } else R.surge = 0;
  // load transfer ratio: 1 means the inside wheels have lifted. Liquid piled up on the outside adds to it.
  R.ltr = 2 * (R.coupled ? R.h2 : P.h1) * (R.ay + G * R.roll) / (P.track * G) - 2 * shift / P.track;
  if (Math.abs(R.ltr) >= 1) { R.ltrT += h; if (R.ltrT >= 0.35) R.rolled = true; } else R.ltrT = 0;
}

// ---- contacts: guardrails and walls push on the body corners, barriers stop the nose ----
const _iv = [];
let _cFx = 0, _cFz = 0, _cT = 0;
// One corner of body b at (a forward, side * half-width right) of its centre of mass.
function rigCorner(b, rec, a, side, h) {
  const fx = Math.sin(b.h), fz = Math.cos(b.h), w = side * RIGP.half;
  const ox = a * fx - w * fz, oz = a * fz + w * fx;
  ROAD.project(b.x + ox, b.z + oz, b.i, _pr);
  const ivs = ROAD.drivable(_pr.s, _iv), lat = _pr.lat;
  let iv = ivs[0], bd = Infinity;
  for (const c of ivs) {
    const d = lat < c[0] ? c[0] - lat : lat > c[1] ? lat - c[1] : 0;
    if (d < bd) { bd = d; iv = c; }
  }
  if (!(bd > 0)) return;
  const dir = lat < iv[0] ? 1 : -1;                       // push back toward the road
  const hr = ROAD.headingAt(_pr.s), tx = Math.sin(hr), tz = Math.cos(hr), nx = -dir * tz, nz = dir * tx;
  const vpx = b.vx + b.w * oz, vpz = b.vz - b.w * ox;
  const vn = vpx * nx + vpz * nz, vt = vpx * tx + vpz * tz;
  if (vn > 3) return;                                     // already leaving fast enough
  const N = 1.5e6 * Math.min(bd, 0.5) + 1.2e5 * Math.max(0, -vn);
  const Ff = -0.4 * N * clamp(vt / 0.5, -1, 1);
  const Fx = N * nx + Ff * tx, Fz = N * nz + Ff * tz;
  _cFx += Fx; _cFz += Fz; _cT += Fx * oz - Fz * ox;
  rec.imp += N * h; if (-vn > rec.vn) rec.vn = -vn;
}
function rigWalls(b, rec, aFront, aRear, h) {
  _cFx = _cFz = _cT = 0;
  rigCorner(b, rec, aFront, -1, h); rigCorner(b, rec, aFront, 1, h);
  rigCorner(b, rec, aRear, -1, h); rigCorner(b, rec, aRear, 1, h);
}
// The closure at the end of the road or of a ramp: takes all forward momentum at once.
function rigBarrier(h) {
  const R = RIG, t = R.t, a = RIGP.front - RIGP.b1, ox = a * Math.sin(t.h), oz = a * Math.cos(t.h);
  ROAD.project(t.x + ox, t.z + oz, t.i, _pr);
  const pen = _pr.s - ROAD.barrier(_pr.s, _pr.lat);
  if (!(pen > 0)) return;
  const hr = ROAD.headingAt(_pr.s), tx = Math.sin(hr), tz = Math.cos(hr);
  const u = t.vx * tx + t.vz * tz, M = t.m + (R.coupled ? R.r.m : 0);
  let F = u > -0.5 ? 1.5e6 * Math.min(pen, 0.5) : 0;
  if (u > 0) { F += M * u / h; R.hit.b.imp += M * u; if (u > R.hit.b.vn) R.hit.b.vn = u; }
  _cFx -= F * tx; _cFz -= F * tz; _cT += -F * tx * oz + F * tz * ox;
}
// A sudden push at a world point of the tractor ('t') or the trailer ('r'), e.g. from another vehicle.
function rigApplyImpulse(unit, px, pz, jx, jz) {
  const b = RIG[unit];
  if (!b || !(b.m > 0) || (unit === 'r' && !RIG.coupled)) return;   // a parked trailer does not move
  const rx = px - b.x, rz = pz - b.z;
  b.vx += jx / b.m; b.vz += jz / b.m; b.w += (jx * rz - jz * rx) / b.I;
}
// cmd: { steer (rad), drive (N at the drive axle), drag (N, engine brake + retarder), service (0..1), hold }
function rigStep(h, cmd) {
  const R = RIG, P = RIGP, t = R.t, r = R.r, coupled = R.coupled;
  for (let i = 0; i < 3; i++) R.brakeP[i] += (cmd.service - R.brakeP[i]) * (1 - Math.exp(-h / P.lag[i]));
  R.steer = cmd.steer;
  R.assist.abs = R.assist.tcs = false;
  if (cmd.hold) {
    t.vx = t.vz = t.w = 0; if (coupled) r.vx = r.vz = r.w = 0;
    R.ax = 0; R.Hx = 0; R.FxT = 0; R.assist.esc = false; R.escT = 0; R.assist.rsc = false;
    rigRollSlosh(h, 0, 0, 0);
    return;
  }
  const v1x0 = t.vx, v1z0 = t.vz, v2x0 = r.vx, v2z0 = r.vz, m2 = r.m - R.ms;   // m2: the trailer without the sloshing liquid
  const L = rigLoads(R.ax, R.Hx, R.FxT, _L);

  // ---- tractor ----
  const f1x = Math.sin(t.h), f1z = Math.cos(t.h), r1x = -f1z, r1z = f1x;
  const u1 = t.vx * f1x + t.vz * f1z, v1 = t.vx * r1x + t.vz * r1z;
  let Fu = 0, Fv = 0, T1 = 0, drive = cmd.drive, trailerExtra = 0;
  // ---- stability control: yaw rate against what the steering asks for, and a growing fold ----
  if (R.assistOn) {
    const ua = Math.max(Math.abs(u1), 1), wmax = MU * G / ua;
    // the yaw rate a healthy rig would have: what the steering asks for, reached with the rig's own delay
    R.wref += (clamp(-u1 * Math.tan(cmd.steer) / P.L1, -wmax, wmax) - R.wref) * (1 - Math.exp(-h / 0.25));
    const wref = R.wref, err = t.w - wref;
    if (Math.abs(u1) > 5) {
      let trig = Math.abs(err) > 0.06;
      if (coupled) {
        const dev = Math.abs(wrapA(t.h - r.h) - R.spec.L2 * wref / u1);
        if (dev > 0.105 && dev > R.artDev) trig = true;
        R.artDev = dev;
      }
      if (trig) R.escT = 0.5;
    }
    if (R.escT > 0) {
      R.escT -= h; R.assist.esc = true; drive = 0;
      const Mmax = 0.3 * MU * (L[0] + L[1]) * P.track / 2;
      T1 += clamp(-6 * P.I1 * err, -Mmax, Mmax);       // differential braking, as a yaw moment
      if (coupled) trailerExtra = 1.5 * r.m;            // trailer brakes pull the combination straight
    } else R.assist.esc = false;
  } else { R.assist.esc = false; R.escT = 0; }
  // ---- rollover protection: slow down before the inside wheels lift ----
  if (R.assistOn) { const al = Math.abs(R.ltr); if (al > 0.6) R.rscOn = true; else if (al < 0.5) R.rscOn = false; } else R.rscOn = false;
  R.assist.rsc = R.rscOn;
  const rsc = R.rscOn ? 2.0 / G : 0;                    // extra braking worth 2 m/s2 on every axle
  if (R.rscOn) drive = 0;
  rigTyre(0, u1, v1 - t.w * P.a1, cmd.steer, L[0], 0, P.brakeMax[0] * R.brakeP[0] + rsc * L[0]);
  Fu += _Fu; Fv += _Fv; T1 -= _Fv * P.a1;
  rigTyre(1, u1, v1 + t.w * P.b1, 0, L[1], drive, P.brakeMax[1] * R.brakeP[1] + cmd.drag + rsc * L[1]);
  Fu += _Fu; Fv += _Fv; T1 += _Fv * P.b1;
  Fu -= Math.sign(u1) * 0.5 * 1.2 * 0.6 * 10.2 * u1 * u1 * (coupled ? 1 : 0.75);
  let F1x = Fu * f1x + Fv * r1x, F1z = Fu * f1z + Fv * r1z;
  ROAD.project(t.x, t.z, t.i, _pr); t.i = _pr.i;
  let g = ROAD.gradeAt(_pr.s), hr = ROAD.headingAt(_pr.s), sg = g / Math.sqrt(1 + g * g);
  F1x -= t.m * G * sg * Math.sin(hr); F1z -= t.m * G * sg * Math.cos(hr);
  rigWalls(t, R.hit.t, P.front - P.b1, -P.back - P.b1, h); rigBarrier(h);
  F1x += _cFx; F1z += _cFz; T1 += _cT;

  // ---- trailer ----
  let f2x = 0, f2z = 0, F2x = 0, F2z = 0, T2 = 0;
  if (coupled) {
    f2x = Math.sin(r.h); f2z = Math.cos(r.h);
    const r2x = -f2z, r2z = f2x, arm = R.spec.L2 - R.d2;
    const u2 = r.vx * f2x + r.vz * f2z, v2 = r.vx * r2x + r.vz * r2z;
    const lsv = clamp(R.stat[2] / P.lsvRef, P.lsvMin, 1);
    rigTyre(2, u2, v2 + r.w * arm, 0, L[2], 0, P.brakeMax[2] * lsv * R.brakeP[2] + trailerExtra + rsc * L[2]);
    R.FxT += (R.axle[2].Fx - R.FxT) * 0.2;
    F2x = _Fu * f2x + _Fv * r2x; F2z = _Fu * f2z + _Fv * r2z; T2 = _Fv * arm;
    if (R.ms > 0) {   // the liquid leans on the tank
      const sl = R.spec.slosh, S = R.slosh, wx = TAU * sl.fx, wy = TAU * sl.fy;
      const Fsx = R.ms * (wx * wx * S.x + 2 * sl.zx * wx * S.vx), Fsy = R.ms * (wy * wy * S.y + 2 * sl.zy * wy * S.vy);
      F2x += Fsx * f2x + Fsy * r2x; F2z += Fsx * f2z + Fsy * r2z;
    }
    ROAD.project(r.x, r.z, r.i, _pr); r.i = _pr.i;
    g = ROAD.gradeAt(_pr.s); hr = ROAD.headingAt(_pr.s); sg = g / Math.sqrt(1 + g * g);
    F2x -= r.m * G * sg * Math.sin(hr); F2z -= r.m * G * sg * Math.cos(hr);
    rigWalls(r, R.hit.r, R.d2 + R.spec.nose - 0.2, R.d2 - R.spec.rear, h);
    F2x += _cFx; F2z += _cFz; T2 += _cT;
  } else { R.axle[2].Fz = R.axle[2].Fx = R.axle[2].Fy = R.axle[2].alpha = 0; R.FxT = 0; }

  // ---- integrate velocities, then make the two bodies agree at the fifth wheel ----
  t.vx += F1x / t.m * h; t.vz += F1z / t.m * h; t.w += T1 / t.I * h;
  if (coupled) {
    r.vx += F2x / m2 * h; r.vz += F2z / m2 * h; r.w += T2 / r.I * h;
    const o1 = -(P.b1 - P.e), a1x = o1 * f1x, a1z = o1 * f1z, a2x = R.d2 * f2x, a2z = R.d2 * f2z;
    const p1x = a1z, p1z = -a1x, p2x = a2z, p2z = -a2x;
    const Cx = (r.x + a2x) - (t.x + a1x), Cz = (r.z + a2z) - (t.z + a1z);
    const bx = -((r.vx + r.w * p2x) - (t.vx + t.w * p1x) + 0.2 * Cx / h);
    const bz = -((r.vz + r.w * p2z) - (t.vz + t.w * p1z) + 0.2 * Cz / h);
    const im = 1 / t.m + 1 / m2;
    const k11 = im + p1x * p1x / t.I + p2x * p2x / r.I, k22 = im + p1z * p1z / t.I + p2z * p2z / r.I;
    const k12 = p1x * p1z / t.I + p2x * p2z / r.I, det = k11 * k22 - k12 * k12;
    const Jx = (k22 * bx - k12 * bz) / det, Jz = (k11 * bz - k12 * bx) / det;
    r.vx += Jx / m2; r.vz += Jz / m2; r.w += (Jx * p2x + Jz * p2z) / r.I;
    t.vx -= Jx / t.m; t.vz -= Jz / t.m; t.w -= (Jx * p1x + Jz * p1z) / t.I;
    R.Hx += (-(Jx * f1x + Jz * f1z) / h - R.Hx) * 0.2;
  } else R.Hx = 0;

  // ---- coming to rest: brakes and drag must not push the rig backwards ----
  const uNew = t.vx * f1x + t.vz * f1z;
  if (Math.abs(u1) > 0.02 && uNew * u1 < 0 && drive * u1 <= 0) {
    t.vx = t.vz = t.w = 0; if (coupled) r.vx = r.vz = r.w = 0;
    R.ax = 0;
  } else R.ax += ((uNew - u1) / h - R.ax) * 0.19;

  if (coupled) {
    const ax2 = (r.vx - v2x0) / h, az2 = (r.vz - v2z0) / h, aLat = -ax2 * f2z + az2 * f2x;
    rigRollSlosh(h, aLat, ax2 * f2x + az2 * f2z, aLat);
  } else rigRollSlosh(h, ((t.vx - v1x0) * r1x + (t.vz - v1z0) * r1z) / h, 0, 0);

  t.x += t.vx * h; t.z += t.vz * h; t.h += t.w * h;
  if (coupled) {
    r.x += r.vx * h; r.z += r.vz * h; r.h += r.w * h;
    const g1x = Math.sin(t.h), g1z = Math.cos(t.h), o1 = -(P.b1 - P.e), a1x = o1 * g1x, a1z = o1 * g1z;
    const art = wrapA(t.h - r.h);
    if (Math.abs(art) > P.artMax) {
      // the cab is against the trailer: the fold cannot deepen, and the two turn together from here
      // Equal and opposite twists cancel the rotation between them, so no momentum is made up.
      const sgn = Math.sign(art), wrel = t.w - r.w;
      if (wrel * sgn > 0) { const Lz = wrel / (1 / t.I + 1 / r.I); t.w -= Lz / t.I; r.w += Lz / r.I; }
      r.h = t.h - sgn * P.artMax;
      r.x = t.x + a1x - R.d2 * Math.sin(r.h); r.z = t.z + a1z - R.d2 * Math.cos(r.h);   // seat it back on the fifth wheel
      if (Math.abs(u1) > 2.8) R.jack = true;            // above 10 km/h this is a jackknife
    }
    R.gap = Math.hypot((r.x + R.d2 * Math.sin(r.h)) - (t.x + a1x), (r.z + R.d2 * Math.cos(r.h)) - (t.z + a1z));
  } else R.gap = 0;
}

// With the assists on, the front wheel angle is held to 80% of what would tip or slide the rig at speed u.
function rigSteerLimit(u) {
  if (!RIG.assistOn) return Infinity;
  const aRoll = 0.8 * G * (RIGP.track / 2) / (RIG.coupled ? RIG.h2 : RIGP.h1);
  // Braking in a turn and liquid cargo can lean the rig further than the steering angle alone predicts,
  // so the limit also closes in as the measured load transfer nears the point of tipping.
  const ease = clamp(1 - 2 * Math.max(0, Math.abs(RIG.ltr) - 0.7), 0.35, 1);
  return ease * Math.atan(0.8 * Math.min(aRoll, MU * G) * RIGP.L1 / Math.max(u * u, 1));
}

// Rear axle position, heading, forward speed, yaw rate, fifth wheel, trailer axle centre and heading.
function rigPose(out) {
  const R = RIG, P = RIGP, t = R.t, r = R.r, fx = Math.sin(t.h), fz = Math.cos(t.h);
  out.x = t.x - fx * P.b1; out.z = t.z - fz * P.b1; out.h = t.h;
  out.v = t.vx * fx + t.vz * fz; out.w = t.w;
  out.hx = out.x + fx * P.e; out.hz = out.z + fz * P.e;
  if (R.spec) {
    const arm = R.spec.L2 - R.d2;
    out.tx = r.x - Math.sin(r.h) * arm; out.tz = r.z - Math.cos(r.h) * arm; out.th = r.h;
  } else { out.tx = out.hx; out.tz = out.hz; out.th = t.h; }
  return out;
}

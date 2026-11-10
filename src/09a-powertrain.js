// ---------------------------------------------------------------------------
// Powertrain: 13 L engine, 12-speed automated gearbox (Opticruise-style),
// retarder, cruise control and the 90 km/h limiter. Turns the pedals into
// force requests at the wheels; the vehicle model decides what the tyres can take.
// ---------------------------------------------------------------------------
const EVENTS = []; // things the game layer reacts to: contacts, coupling, assists
const GEARS = [0, 11.32, 9.16, 7.19, 5.82, 4.57, 3.70, 3.02, 2.44, 1.92, 1.55, 1.24, 1.00];
const REV_RATIO = 10.5, FINAL = 2.59, RW = 0.52, EFF = 0.92;
const VMAX = 90 / 3.6;
const TQ = [[500, 900], [700, 1700], [900, 2350], [1000, 2550], [1300, 2550], [1500, 2380], [1700, 2150], [1900, 1850], [2100, 1450], [2250, 600], [2400, 0]];
function engineTorque(rpm) {
  if (rpm <= TQ[0][0]) return TQ[0][1];
  for (let i = 0; i < TQ.length - 1; i++) if (rpm < TQ[i + 1][0]) return lerp(TQ[i][1], TQ[i + 1][1], (rpm - TQ[i][0]) / (TQ[i + 1][0] - TQ[i][0]));
  return 0;
}
function startGear() {
  if (ROAD.gradeAt(TR.s) > 0.03) return 2;
  return TR.gcw > 30000 ? 2 : 3;
}
function rWheelOk(r) { return r < 1900; }
function shiftTo(g) { if (g === TR.gear) return; TR.nextGear = g; TR.shiftT = 0.42; }

const PT_OUT = { drive: 0, drag: 0, service: 0 };
// drive: force at the drive axle (N, forward positive). drag: engine brake + retarder (N, opposes motion).
// service: how far the pedal is into the service brakes (0..1).
function powertrainStep(dt, throttle, brake) {
  const T = TR;
  let thr = clamp(throttle, 0, 1), brk = clamp(brake, 0, 1);
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

  // the first 35% of pedal travel is the retarder, the rest adds the service brakes
  let ret = brk > 0 ? clamp(brk / 0.35, 0, 1) : 0;
  if (T.cruise && T.v > T.cruiseV + 0.6) ret = Math.max(ret, clamp((T.v - T.cruiseV - 0.6) * 0.5, 0, 1));
  T.ret = damp(T.ret, ret, 6, dt);

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

  let drive = 0, drag = 21000 * T.ret * clamp(Math.abs(T.v) / 6, 0, 1);
  if (T.dir !== 0 && T.shiftT <= 0) {
    if (thr > 0) drive = engineTorque(Math.max(T.rpm, 700)) * thr * ratio * FINAL * EFF / RW * T.dir;
    if (thr < 0.05 && rWheel > 700) drag += (120 + T.rpm * 0.06) * ratio * FINAL / RW * 0.5;
  }
  T.load = T.shiftT > 0 ? 0 : thr;
  PT_OUT.drive = drive; PT_OUT.drag = drag; PT_OUT.service = clamp((brk - 0.3) / 0.7, 0, 1);
  return PT_OUT;
}

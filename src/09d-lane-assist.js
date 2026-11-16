// ---------------------------------------------------------------------------
// The lane-keeping help: a small pull of the steering toward the middle of the
// lane the rig is in (the expressway's lanes, the ramps and the service areas'
// lanes, the town streets). It lets go while the driver steers and comes back
// slowly after; it is off when signalling, reversing, slow, in a junction, a
// yard, the toll plaza or a car park.
// ---------------------------------------------------------------------------
// max: the most it adds, as a share of the steering the speed allows; quiet: seconds after the driver lets go before
// it comes back; ramp: seconds it takes to come back fully; minV: the slowest it works at (m/s)
const LKA = { on: true, max: 0.25, quiet: 0.6, ramp: 1.0, minV: 15 / 3.6, look: 1.0, lookMax: 30, w: 0, wait: 0, active: false, lane: null };   // look: seconds ahead it aims (lookMax m at most)
const _lka = {}, _lkb = {}, _lkc = {}, _lkd = {};

// The expressway's lanes at s as functions of s giving the lane centre (lat).
function _lkaRoadLanes(s) {
  const out = [{ key: 'trv', f: () => X_TRV }, { key: 'ovt', f: () => X_OVT }];
  const r = rampAt(s); if (r) out.push({ key: 'ramp', f: x => rampCx(x - r.sDiv) });
  const e = entryAt(s); if (e) out.push({ key: 'entry', f: x => entryCx(x - e.s0) });
  const a = saExitAt(s); if (a) out.push({ key: 'saOut', f: x => saExitEdges(x - a.sDiv, _lkd).cx });
  const b = saEntryAt(s); if (b) out.push({ key: 'saIn', f: x => saEntryEdges(x - b.sLot1, _lkd).cx });
  return out;
}
// Where to aim: a world point ahead on the middle of the lane the rig's rear axle is in, or null.
// (rx, rz): the rear axle; h: heading; Ld: how far ahead.
function lkaAim(rx, rz, h, Ld, out) {
  if (TR.zone === 'road') {
    project(rx, rz, TR.idx, _lka);
    let best = null, bd = 1.9;   // within 1.9 m of a lane's middle (a lane is 3.6 m)
    for (const l of _lkaRoadLanes(_lka.s)) { const d = Math.abs(l.f(_lka.s) - _lka.lat); if (d < bd) { bd = d; best = l; } }
    if (!best) return null;
    if (Math.abs(wrapA(h - headingAt(_lka.s))) > 0.5) return null;   // across or against the road
    // far off the middle, it aims at most 0.5 m nearer to it each time (a slow way back, no swing past it)
    const off = _lka.lat - best.f(_lka.s), keep = Math.sign(off) * Math.max(0, Math.abs(off) - 0.5);
    const s2 = _lka.s + Ld; posAt(s2, best.f(s2) + keep, _lkb);
    out.x = _lkb.x; out.z = _lkb.z; out.lane = best.key; return out;
  }
  if (TR.zone === 'town' && TOWNS_LOADED.has(TR.town)) {
    const L = TOWNS_LOADED.get(TR.town).layout, site = L.site;
    townUV(site, rx, rz, _lka);
    const u = _lka.u, v = _lka.v, hu = Math.cos(h - site.hu), hv = Math.sin(h - site.hu);   // heading in town axes
    let best = null, bd = 1.9, bseg = 0, bt = 0;
    for (const l of L.lanes) {
      if (l.turn || l.plaza) continue;
      for (let k = 1; k < l.pts.length; k++) {
        const a = l.pts[k - 1], b = l.pts[k], du = b[0] - a[0], dv = b[1] - a[1], sl = Math.hypot(du, dv) || 1;
        if ((du * hu + dv * hv) / sl < 0.82) continue;   // within 35 degrees of the way the rig points
        const t = clamp(((u - a[0]) * du + (v - a[1]) * dv) / (sl * sl), 0, 1), d = Math.hypot(a[0] + du * t - u, a[1] + dv * t - v);
        if (d < bd) { bd = d; best = l; bseg = k; bt = t; }
      }
    }
    if (!best) return null;
    // Ld along the lane from the nearest point (past its end, straight on along its last piece)
    let k = bseg, a = best.pts[k - 1], b = best.pts[k], rem = Ld + bt * Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (;;) {
      a = best.pts[k - 1]; b = best.pts[k];
      const sl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (rem <= sl || k === best.pts.length - 1) { const f = rem / sl; townXZ(site, a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, _lkc); break; }
      rem -= sl; k++;
    }
    out.x = _lkc.x; out.z = _lkc.z; out.lane = best.id; return out;
  }
  return null;
}
// The steering to send: the driver's, plus the help while the driver leaves the wheel alone.
// steer: the driver's (-1..1, right positive); active: the driver is steering now; blink: a turn signal is on.
function laneAssistSteer(dt, steer, active, blink) {
  const T = TR;
  if (active) { LKA.w = 0; LKA.wait = LKA.quiet; }
  else if (LKA.wait > 0) LKA.wait -= dt;
  else LKA.w = Math.min(1, LKA.w + dt / LKA.ramp);
  LKA.active = false;
  // off: the weight stays at 0, so it comes back over `ramp` seconds after (not at full strength at once)
  if (!LKA.on || blink || T.dir !== 1 || T.v < LKA.minV) { LKA.w = 0; return steer; }
  if (LKA.w <= 0) return steer;
  const h = T.h, rx = T.x, rz = T.z, Ld = clamp(T.v * LKA.look, 12, LKA.lookMax);   // TR.x, TR.z: the tractor's rear axle
  const aim = lkaAim(rx, rz, h, Ld, _lkc);
  if (!aim) { LKA.lane = null; LKA.w = 0; return steer; }
  LKA.lane = aim.lane;
  const dx = aim.x - rx, dz = aim.z - rz, fwd = dx * Math.sin(h) + dz * Math.cos(h), right = -dx * Math.cos(h) + dz * Math.sin(h);
  const alpha = Math.atan2(right, fwd), dist = Math.hypot(dx, dz) || 1;
  const delta = Math.atan(2 * RIGP.L1 * Math.sin(alpha) / dist);   // pure pursuit: the wheel angle that reaches the point
  const want = clamp(delta / steerLock(T.v), -LKA.max, LKA.max);
  LKA.active = true;
  return clamp(steer + LKA.w * want, -1, 1);
}

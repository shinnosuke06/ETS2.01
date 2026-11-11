// Town rules without the DOM: signals, town traffic, docks and bays, red lights, bumping into town cars.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim } from './helpers/sim.mjs';

const SIM = loadSim(), L2 = SIM.townLayout(2);
// does the oriented box a overlap the oriented box b (town frame: u, v, h = angle, len, wid)?
function obbOverlap(a, b) {
  const axes = [a.h, a.h + Math.PI / 2, b.h, b.h + Math.PI / 2].map(t => [Math.cos(t), Math.sin(t)]);
  const half = (o, ax) => Math.abs(Math.cos(o.h) * ax[0] + Math.sin(o.h) * ax[1]) * o.len / 2 + Math.abs(-Math.sin(o.h) * ax[0] + Math.cos(o.h) * ax[1]) * o.wid / 2;
  return axes.every(ax => Math.abs((b.u - a.u) * ax[0] + (b.v - a.v) * ax[1]) < half(a, ax) + half(b, ax));
}

test('T8 信号は 70 秒周期：v 方向 青 0–30、黄 30–33、赤 33–70。u 方向 赤 0–35、青 35–65、黄 65–68、赤 68–70。ずれも足す', () => {
  const n = { signal: true, phase: 0 }, at = (axis, t) => SIM.signalState(n, axis, t);
  assert.deepEqual([at('v', 0), at('v', 29.9), at('v', 30), at('v', 33), at('v', 69.9), at('u', 0), at('u', 34.9), at('u', 35), at('u', 65), at('u', 68), at('u', 140)],
    ['green', 'green', 'yellow', 'red', 'red', 'red', 'red', 'green', 'yellow', 'red', 'red']);
  assert.equal(SIM.signalState({ signal: true, phase: 10 }, 'v', 21), 'yellow');
  assert.equal(SIM.signalState({ signal: false, stop: true, phase: 0 }, 'u', 0), 'green');
});

// run the town traffic for `seconds`; boxesAt(t) gives the player's boxes
function runCars(L, n, seconds, boxesAt = () => [], each) {
  const R = SIM.rng(77), cars = SIM.townCarsInit(L, n, R);
  for (let t = 0; t < seconds; t += 0.1) { SIM.townCarsStep(L, cars, 0.1, t, boxesAt(t), R); if (each && each(cars, t) === false) break; }
  return cars;
}
test('T9 赤のあいだ、町の車は停止線の手前（0〜6 m）で止まり、越えない', () => {
  const sig = L2.nodes.find(n => n.signal), lane = L2.lanes.find(l => l.stopNode === sig.id && !l.turn);
  const R = SIM.rng(5), cars = SIM.townCarsInit(L2, 1, R); const c = cars[0];
  c.lane = lane.id; c.d = Math.max(0, lane.len - 60); c.v = 8; c.next = null;
  // the time when this approach has just turned red, for a minute
  let t0 = 0; while (SIM.signalState(sig, lane.stopAxis, t0) !== 'red' || SIM.signalState(sig, lane.stopAxis, t0 - 0.1) === 'red') t0 += 0.1;
  for (let t = t0; t < t0 + 30; t += 0.05) { SIM.townCarsStep(L2, cars, 0.05, t, [], R); assert.equal(c.lane, lane.id, `crossed the line at ${t - t0}`); }
  const front = lane.len - (c.d + c.len / 2);
  assert.ok(front >= 0 && front <= 6 && c.v < 0.2, `front ${front} v ${c.v}`);
});
test('T9 10 分進めても全部の車が 50 m 以上進み、車どうしが重ならない（最初の 1 分はあなたの車両が交差点の真ん中に止まっている）', () => {
  for (const L of [L2, SIM.townLayout(8)]) {
    const node = L.nodes.find(n => n.signal), moved = new Map(), box = { u: node.u, v: node.v, h: 0.3, len: 16.5, wid: 2.5, tractor: false };
    let worst = null;
    runCars(L, 25, 600, t => (t < 60 ? [box] : []), (cars, t) => {
      for (const c of cars) moved.set(c, (moved.get(c) || 0) + c.v * 0.1);
      if (Math.round(t * 10) % 10) return;
      const poses = cars.filter(c => !c.hidden).map(c => ({ ...SIM.townCarPose(L, c, {}), len: c.len, wid: c.wid }));
      for (let a = 0; a < poses.length; a++) for (let b = 0; b < a; b++) if (obbOverlap(poses[a], poses[b])) worst = worst || `t ${t.toFixed(1)}: ${JSON.stringify([poses[a], poses[b]])}`;
    });
    assert.equal(worst, null, worst);
    const least = Math.min(...moved.values()); assert.ok(least >= 50, `a car moved only ${least.toFixed(1)} m in ${L.site.ic.jp}`);
  }
});
test('T10 荷台口：0.6 m・0.5 m・4° の内側なら番号、外なら −1。枠：キングピンと後ろの端が中なら真', () => {
  const w = L2.warehouses[0], d = w.docks[2], n = [d.nu, d.nv], tn = [-n[1], n[0]], back = (deg) => { const a = deg * Math.PI / 180; return [-(n[0] * Math.cos(a) - n[1] * Math.sin(a)), -(n[0] * Math.sin(a) + n[1] * Math.cos(a))]; };
  const rear = (off, lat) => ({ u: d.u + n[0] * off + tn[0] * lat, v: d.v + n[1] * off + tn[1] * lat });
  const bk = deg => { const b = back(deg); return { u: b[0], v: b[1] }; };
  assert.equal(SIM.dockCheck(w, rear(0.3, 0.2), bk(2)), 2);
  assert.equal(SIM.dockCheck(w, rear(0.7, 0), bk(0)), -1);
  assert.equal(SIM.dockCheck(w, rear(0.3, 0.6), bk(0)), -1);
  assert.equal(SIM.dockCheck(w, rear(0.3, 0), bk(5)), -1);
  const b = w.bay, a = [b.hu, b.hv];
  assert.equal(SIM.bayCheck(w, { u: b.u + a[0] * 7, v: b.v + a[1] * 7 }, { u: b.u - a[0] * 6, v: b.v - a[1] * 6 }), true);
  assert.equal(SIM.bayCheck(w, { u: b.u + a[0] * 10, v: b.v + a[1] * 10 }, { u: b.u - a[0] * 6, v: b.v - a[1] * 6 }), false);
});
test('T11 赤で停止線を越えると交差点の番号、黄なら −1、停止線と逆向きに越えても −1', () => {
  const sig = L2.nodes.find(n => n.signal), lane = L2.lanes.find(l => l.stopNode === sig.id && !l.turn), P = lane.pts[lane.pts.length - 1], Q = lane.pts[lane.pts.length - 2];
  const dir = [(P[0] - Q[0]) / Math.hypot(P[0] - Q[0], P[1] - Q[1]), (P[1] - Q[1]) / Math.hypot(P[0] - Q[0], P[1] - Q[1])];
  const at = k => ({ u: P[0] + dir[0] * k, v: P[1] + dir[1] * k });
  let red = 0; while (SIM.signalState(sig, lane.stopAxis, red) !== 'red') red += 0.5;
  let yel = 0; while (SIM.signalState(sig, lane.stopAxis, yel) !== 'yellow') yel += 0.5;
  assert.equal(SIM.townRedLight(L2, at(-0.3), at(0.3), red), sig.id);
  assert.equal(SIM.townRedLight(L2, at(-0.3), at(0.3), yel), -1);
  assert.equal(SIM.townRedLight(L2, at(0.3), at(-0.3), red), -1);
});
test('止まっている町の車に 36 km/h で当たると、車が前に押され、トラックは少し遅くなり、car のできごとが出る', () => {
  const sim = loadSim(); sim.setRigTrailer(null, 0); sim.placeTruck(1000, -7.65, 10, { coupled: false });
  const T = sim.TR, f = [Math.sin(T.h), Math.cos(T.h)], x0 = T.x + f[0] * (sim.RIGP.front + 2.2), z0 = T.z + f[1] * (sim.RIGP.front + 2.2);
  const car = { x: x0, z: z0, h: T.h, v: 0, len: 4.7, wid: 1.8, heavy: false, d: 50 };
  const box = { x: T.x + f[0] * (sim.RIGP.front - sim.RIGP.back) / 2, z: T.z + f[1] * (sim.RIGP.front - sim.RIGP.back) / 2, h: T.h, len: sim.RIGP.front + sim.RIGP.back, wid: 2.5, tractor: true };
  sim.EVENTS.length = 0; const v0 = Math.hypot(sim.RIG.t.vx, sim.RIG.t.vz);
  const hit = sim.resolveBoxContact(car, box);
  assert.ok(hit > 5, `hit ${hit}`); assert.ok(car.v > 8 && car.d > 50, `car ${car.v} ${car.d}`);
  const v1 = Math.hypot(sim.RIG.t.vx, sim.RIG.t.vz); assert.ok(v1 < v0 && v1 > v0 * 0.7, `${v0} -> ${v1}`);
  assert.ok(sim.EVENTS.some(e => e.t === 'car'));
});

test('townNearestLane は町の車線の上の点と、その車線の向きを返す（曲がる道と広場は使わず、後ろにトレーラーの長さを残す）', () => {
  for (const [u, v] of [[-20, 140], [3, 60], [-60, 200], [150, 300], [0, 45]]) {
    const r = SIM.townNearestLane(L2, u, v), l = L2.lanes[r.lane];
    assert.ok(!l.turn && !l.plaza, `lane ${r.lane}`);
    // the point lies on the lane's polyline, and h is that piece's direction
    let best = Infinity, hb = 0;
    for (let k = 1; k < l.pts.length; k++) {
      const a = l.pts[k - 1], b = l.pts[k], du = b[0] - a[0], dv = b[1] - a[1], s2 = du * du + dv * dv, t = Math.max(0, Math.min(1, ((r.u - a[0]) * du + (r.v - a[1]) * dv) / s2));
      const d = Math.hypot(a[0] + du * t - r.u, a[1] + dv * t - r.v); if (d < best) { best = d; hb = Math.atan2(dv, du); }
    }
    assert.ok(best < 1e-6 && Math.abs(SIM.wrapA(r.h - hb)) < 1e-9, JSON.stringify({ u, v, r, best }));
    assert.ok(r.d >= Math.min(20, l.len / 2) - 1e-9, `room behind: ${r.d}`);
    // no other usable lane passes much nearer to (u, v) than the chosen one, give or take the room kept behind
    for (const o of L2.lanes) if (!o.turn && !o.plaza) for (const p of o.pts) assert.ok(Math.hypot(p[0] - u, p[1] - v) >= Math.hypot(r.u - u, r.v - v) - 20.5 - 1e-6);
  }
});

test('町の車と横にこすれ続けても、損傷とできごとは最初の 1 回だけ（押し合いは毎回）', () => {
  const sim = loadSim(); sim.setRigTrailer(null, 0); sim.placeTruck(1000, -7.65, 0, { coupled: false });
  const T = sim.TR, f = [Math.sin(T.h), Math.cos(T.h)], r = [Math.cos(T.h), -Math.sin(T.h)];
  const box = { x: T.x + f[0] * (sim.RIGP.front - sim.RIGP.back) / 2, z: T.z + f[1] * (sim.RIGP.front - sim.RIGP.back) / 2, h: T.h, len: sim.RIGP.front + sim.RIGP.back, wid: 2.5, tractor: true };
  const car = { x: box.x + r[0] * 2.0, z: box.z + r[1] * 2.0, h: T.h, v: 3, len: 4.7, wid: 1.8, heavy: false, d: 50 };   // alongside, 0.15 m into the tractor
  sim.EVENTS.length = 0; T.damage = 0;
  const first = sim.resolveBoxContact(car, box, false), d1 = T.damage, w1 = sim.RIG.t.vx * r[0] + sim.RIG.t.vz * r[1];
  for (let k = 0; k < 30; k++) sim.resolveBoxContact(car, box, true);
  const w2 = sim.RIG.t.vx * r[0] + sim.RIG.t.vz * r[1];
  assert.ok(first > 0 && d1 > 0, `first ${first} ${d1}`); assert.equal(T.damage, d1, 'no more damage while still touching');
  assert.equal(sim.EVENTS.filter(e => e.t === 'car').length, 1); assert.ok(w2 < w1, `still pushed apart: ${w1} -> ${w2}`);
});

test('町の車は、あなたの車両のそばの車線の始まりには出てこない', () => {
  const L = SIM.townLayout(2), starts = L.lanes.filter(l => l.edge0 && !l.plaza && !l.turn), rand = SIM.rng(77);
  const spawnAt = l => { const P = l.pts, d = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]), k = 2.4 / d; return { u: P[0][0] + (P[1][0] - P[0][0]) * k, v: P[0][1] + (P[1][1] - P[0][1]) * k, h: Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]) }; };
  const box = l => ({ ...spawnAt(l), len: 7, wid: 2.5, tractor: true });
  // the rig at every lane start: nobody can come in
  let cars = SIM.townCarsInit(L, 1, rand); cars[0].hidden = true;
  SIM.townCarsStep(L, cars, 1 / 60, 0, starts.map(box), rand);
  assert.equal(cars[0].hidden, true, 'no start is free');
  // the rig at one lane start: cars come in elsewhere
  cars = SIM.townCarsInit(L, 1, rand);
  for (let k = 0; k < 200; k++) { cars[0].hidden = true; SIM.townCarsStep(L, cars, 1 / 60, 0, [box(starts[0])], rand); assert.notEqual(cars[0].lane, starts[0].id); }
});

test('町の車を作り直しても（画質の切り替え、町の作り直し）、止まれの交差点の順番待ちが残らず、10 分で全部の車が 50 m 以上進む', () => {
  for (const i of [2, 5, 9]) {
    const L = SIM.townLayout(i), X = SIM._townIndex(L), rand = SIM.rng(31 + i);
    let cars = SIM.townCarsInit(L, 25, rand), t = 0;
    for (let k = 0; k < 60 * 300 && X.claim.size === 0; k++) { SIM.townCarsStep(L, cars, 1 / 60, t, [], rand); t += 1 / 60; }
    assert.ok(X.claim.size > 0, `a stop junction was being crossed in ${L.site.ic.jp}`);
    cars = SIM.townCarsInit(L, 25, rand);   // the old cars are gone, the claim with them
    const moved = new Map();
    for (let k = 0; k < 10 * 600; k++) { SIM.townCarsStep(L, cars, 0.1, t, [], rand); t += 0.1; for (const c of cars) moved.set(c, (moved.get(c) || 0) + c.v * 0.1); }
    const least = Math.min(...moved.values()); assert.ok(least >= 50, `a car moved only ${least.toFixed(1)} m in ${L.site.ic.jp}`);
  }
});

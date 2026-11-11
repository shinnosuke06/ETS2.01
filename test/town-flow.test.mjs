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

// The lane-keeping help: it keeps a rig whose driver leaves the wheel alone in the middle of its lane (straight and
// curved expressway, a town street), lets go while the driver steers, and is off when signalling, reversing or slow.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, kmh, H } from './helpers/sim.mjs';

// Drive with the help only (the driver's wheel at 0), holding about `speed` km/h; each(t) gets the lane offset (m).
function drive(sim, seconds, speed, offset, { active = () => false, blink = 0 } = {}) {
  const T = sim.TR, n = Math.round(seconds / H);
  for (let k = 0; k < n; k++) {
    const t = k * H, steer = sim.laneAssistSteer(H, 0, active(t), blink);
    sim.stepTruck(H, { throttle: sim.clamp((speed - kmh(sim)) * 0.3 + 0.35, 0, 1), brake: kmh(sim) > speed + 4 ? 0.3 : 0, steer });
    offset(t);
  }
}
const onRoad = (s, lat, speed) => {
  const sim = loadSim(); sim.setRigTrailer('van', 12000); sim.RIG.assistOn = true;
  sim.placeTruck(s, lat, speed / 3.6, { coupled: true }); sim.EVENTS.length = 0; sim.LKA.w = 1; sim.LKA.wait = 0;
  return sim;
};

test('高速の本線：車線の中心から 0.9 m ずれて手を離すと、15 秒で 0.3 m 以内に戻り、そのあとも 0.4 m 以内', () => {
  const sim = onRoad(1500 + 2000, -7.65 + 0.9, 80); let late = 0;
  drive(sim, 25, 80, t => { if (t > 15) late = Math.max(late, Math.abs(sim.TR.lat - sim.X_TRV)); });
  assert.ok(late < 0.4, `${late.toFixed(2)} m`);
});
test('高速のいちばんきついカーブ（トンネルの外）でも、手を離したまま 80 km/h と 90 km/h（上限）で車線の中心から 0.6 m 以内', () => {
  const sim0 = loadSim(); let worst = null, k = 0;
  for (let s = sim0.S0 + 2000; s < sim0.ROUTE_END - 2000; s += 50) {
    if (sim0.rampAt(s) || sim0.entryAt(s) || sim0.saAt(s) || sim0.tunnelAt(s, 200)) continue;
    const c = Math.abs(sim0.wrapA(sim0.headingAt(s + 40) - sim0.headingAt(s - 40))) / 80;
    if (c > k) { k = c; worst = s; }
  }
  for (const v of [80, 90]) {
    const sim = onRoad(worst - 300, sim0.X_TRV, v); let max = 0;
    drive(sim, 25, v, t => { if (t > 3) max = Math.max(max, Math.abs(sim.TR.lat - sim.X_TRV)); });
    assert.ok(max < 0.6, `${v} km/h, radius ${(1 / k).toFixed(0)} m: ${max.toFixed(2)} m off the middle`);
  }
});
test('ハンドルを操作している間は何も足さず、離して 0.6 秒は待ち、そのあと 1 秒かけて戻る', () => {
  const sim = onRoad(3500, -7.65 + 1.2, 80);
  assert.equal(sim.laneAssistSteer(H, 0.3, true, 0), 0.3);
  assert.equal(sim.LKA.w, 0);
  let t = 0; const outs = [];
  for (; t < 2.5; t += 0.05) outs.push([t, sim.laneAssistSteer(0.05, 0, false, 0)]);
  for (const [tt, s] of outs) if (tt < 0.55) assert.equal(s, 0, `at ${tt.toFixed(2)} s`);
  const at = tt => outs.find(([x]) => Math.abs(x - tt) < 0.026)[1];
  assert.ok(Math.abs(at(1.1)) > 0 && Math.abs(at(1.1)) < Math.abs(at(2.0)) + 1e-9, JSON.stringify([at(1.1), at(2.0)]));
  assert.ok(Math.abs(at(2.0)) <= sim.LKA.max + 1e-9);
});
test('ウインカー・後退・時速 15 km 未満・車線から外れているときは何も足さない', () => {
  const sim = onRoad(3500, -7.65 + 1.2, 80);
  assert.equal(sim.laneAssistSteer(H, 0, false, 1), 0);
  sim.TR.dir = -1; assert.equal(sim.laneAssistSteer(H, 0, false, 0), 0); sim.TR.dir = 1;
  const slow = onRoad(3500, -7.65 + 1.2, 10); assert.equal(slow.laneAssistSteer(H, 0, false, 0), 0);
  const off = onRoad(3500, -16, 80); assert.equal(off.laneAssistSteer(H, 0, false, 0), 0);   // on the verge, no lane
  assert.notEqual(onRoad(3500, -7.65 + 1.2, 80).laneAssistSteer(H, 0, false, 0), 0);
});
test('町の大通り：左の車線で 0.8 m ずれて手を離すと、8 秒で 0.3 m 以内に戻る。交差点の中では何も足さない', () => {
  const sim = loadSim(); sim.townLoad(2);
  const L = sim.TOWNS_LOADED.get(2).layout, site = L.site, q = {};
  sim.setRigTrailer('van', 12000); sim.RIG.assistOn = true;
  sim.townXZ(site, -7 + 0.8, 60, q); sim.placeTruckAt(q.x, q.z, site.hu + Math.PI / 2, 30 / 3.6, { coupled: true }); sim.LKA.w = 1; sim.LKA.wait = 0;
  let late = 0;
  drive(sim, 9, 30, t => { if (t > 8) late = Math.max(late, Math.abs(sim.TR.tu + 7)); });
  assert.ok(late < 0.3, `${late.toFixed(2)} m (u ${sim.TR.tu.toFixed(2)})`);
  const n = L.nodes.find(x => x.streets.includes(0));
  sim.townXZ(site, n.u - 7, n.v, q); sim.placeTruckAt(q.x, q.z, site.hu + Math.PI / 2, 30 / 3.6, { coupled: true }); sim.LKA.w = 1; sim.LKA.wait = 0;
  assert.equal(sim.laneAssistSteer(H, 0, false, 0), 0);
});
test('90 km/h で 1.7 m ずれて手を離すと、行き過ぎは 0.6 m まで、10 秒で 0.2 m 以内に落ち着く（ふらつかない）', () => {
  const sim = onRoad(3500, -7.65 + 1.7, 90); let over = 0, late = 0;
  drive(sim, 14, 90, t => { const o = sim.TR.lat - sim.X_TRV; if (o < 0) over = Math.max(over, -o); if (t > 10) late = Math.max(late, Math.abs(o)); });
  assert.ok(over < 0.6 && late < 0.2, JSON.stringify({ over, late }));
});
test('補助が止まっていた（ウインカー）あとは、すぐ強くは効かず 1 秒かけて戻る', () => {
  const sim = onRoad(3500, -7.65 + 1.2, 80);
  sim.laneAssistSteer(0.05, 0, false, 1);
  assert.equal(sim.LKA.w, 0);
  sim.laneAssistSteer(0.05, 0, false, 0); assert.ok(sim.LKA.w > 0 && sim.LKA.w <= 0.06, `${sim.LKA.w}`);
});

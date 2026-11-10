import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, H } from './helpers/sim.mjs';
const coast = { throttle: 0, brake: 0, steer: 0 };
test('T13 ガードレールに 60 km/h、5° で当たる', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000 });
  sim.placeTruck(1000, -10.2, 60 / 3.6, { coupled: true, yaw: 5 * Math.PI / 180 });   // 左のガードレールへ向ける
  let worst = 0; run(sim, 6, () => coast, () => { worst = Math.max(worst, -12.2 - (sim.TR.frontLat - 1.25), -12.2 - (sim.TR.lat - 1.25)); });
  assert.ok(worst < 0.3, `penetration ${worst}`);
  assert.ok(sim.EVENTS.some(e => e.t === 'rail' && e.unit === 't')); assert.ok(sim.TR.damage > 0);
});
test('T13 トレーラーの角もガードレールで止まる', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000, v: 15, lat: -10.8 });
  const r = sim.RIG.r; sim.rigApplyImpulse('r', r.x, r.z - 6, r.m * 2.0, 0);     // 後ろを左へ振る（+x は lat の負の向き）
  let worst = 0; run(sim, 4, () => coast, () => { worst = Math.max(worst, -12.2 - (sim.TR.tr.lat - 1.25)); });
  assert.ok(worst < 0.3); assert.ok(sim.EVENTS.some(e => e.t === 'rail' && e.unit === 'r'));
});
test('柵で止まる', () => {
  const sim = loadSim(); flatRoad(sim); sim.ROAD.barrier = () => 1100; setup(sim, { cargo: 12000, v: 10, s: 1050 });
  run(sim, 15, () => ({ throttle: 0.5, brake: 0, steer: 0 }));
  assert.ok(sim.TR.frontS < 1100.3 && Math.abs(sim.TR.v) < 0.5); assert.ok(sim.EVENTS.some(e => e.t === 'crash'));
});
test('大きくはみ出した位置に置いても力が暴れない', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000, lat: -40 });
  let prev = sim.TR.lat, fastest = 0; run(sim, 2, () => coast, () => { fastest = Math.max(fastest, Math.abs(sim.TR.lat - prev) / H); prev = sim.TR.lat; });
  assert.ok(Number.isFinite(sim.TR.x) && fastest < 6, `lateral speed ${fastest}`);
});
test('追突：重いトラックはほとんど減速しない', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 20 });
  const c = { s: sim.TR.s + 5.5 + 2.4 - 0.1, x: -7.65, v: 10, len: 4.8, wid: 1.8, heavy: false };
  const hit = sim.resolveCarContact(c, { s0: sim.TR.s - 1.1, s1: sim.TR.s + 5.5, lat: sim.TR.lat, tractor: true });
  sim.stepTruck(H, coast);
  assert.ok(hit > 0 && c.v > 10); assert.ok(20 - sim.TR.v > 0.3 && 20 - sim.TR.v < 0.8, `dv ${20 - sim.TR.v}`);
});
test('重なっていなければ何もしない', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 20 });
  const c = { s: sim.TR.s + 60, x: -7.65, v: 10, len: 4.8, wid: 1.8, heavy: false };
  assert.equal(sim.resolveCarContact(c, { s0: sim.TR.s - 1.1, s1: sim.TR.s + 5.5, lat: sim.TR.lat, tractor: true }), 0); assert.equal(c.v, 10);
});

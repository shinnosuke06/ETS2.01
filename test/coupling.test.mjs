import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, H } from './helpers/sim.mjs';
// トレーラーのキングピンを s=1000 に置き、トラクターの第五輪をその gap m 前、横に off m ずらして置く
const yard = (gap = 12, off = 0) => { const sim = loadSim(); flatRoad(sim); sim.setRigTrailer('van', 12000); sim.parkTrailer(1000, -10.75);
  sim.placeTruck(1000 + gap - 0.35, -10.75 + off, 0, { coupled: false }); sim.TR.dir = -1; sim.EVENTS.length = 0; return sim; };
const has = (sim, t, why) => sim.EVENTS.some(e => e.t === t && (!why || e.why === why));
const back = (sim, kmhTarget) => () => ({ throttle: -sim.TR.v * 3.6 < kmhTarget ? 0.25 : 0, brake: 0, steer: 0 });
test('T9 まっすぐ 3 km/h でバックするとロックし、2 秒後に連結済みになる', () => {
  const sim = yard(); run(sim, 60, back(sim, 3), () => sim.TR.link === 'free');
  assert.equal(sim.TR.link, 'locking'); assert.ok(has(sim, 'couple-lock')); assert.equal(sim.TR.v, 0);
  run(sim, 1.9, back(sim, 3)); assert.equal(sim.TR.link, 'locking');
  run(sim, 0.2, back(sim, 3)); assert.equal(sim.TR.link, 'coupled'); assert.ok(has(sim, 'coupled'));
  assert.ok(Math.abs(sim.TR.art) < 0.02 && sim.RIG.gap < 0.03);
});
test('T9 横に 0.5 m ずれていると連結しない', () => {
  const sim = yard(12, 0.5); run(sim, 60, back(sim, 3), () => !has(sim, 'couple-miss'));
  assert.ok(has(sim, 'couple-miss', 'offset')); assert.equal(sim.TR.link, 'free'); assert.equal(sim.TR.v, 0);
});
test('T9 8 km/h では速すぎて連結しない', () => {
  const sim = yard(30); run(sim, 60, back(sim, 8), () => !has(sim, 'couple-miss'));
  assert.ok(has(sim, 'couple-miss', 'fast')); assert.equal(sim.TR.link, 'free'); assert.ok(sim.TR.damage >= 2);
});
test('T9 走行中の切り離しは拒否、停止中は 2 秒で完了してトレーラーが残る', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 10 });
  assert.equal(sim.requestUncouple(), false); assert.ok(has(sim, 'uncouple-refused')); assert.equal(sim.TR.link, 'coupled');
  run(sim, 30, () => ({ throttle: 0, brake: 1, steer: 0 }), () => sim.TR.v > 0.01);
  assert.equal(sim.requestUncouple(), true); assert.equal(sim.TR.link, 'unlocking');
  run(sim, 2.1, () => ({ throttle: 1, brake: 0, steer: 0 })); assert.equal(sim.TR.link, 'free'); assert.ok(has(sim, 'uncoupled'));
  const k = { x: sim.TR.tr.kx, z: sim.TR.tr.kz }; run(sim, 5, () => ({ throttle: 1, brake: 0, steer: 0 }));
  assert.deepEqual({ x: sim.TR.tr.kx, z: sim.TR.tr.kz }, k); assert.ok(sim.TR.v > 3);
});
test('自動連結は、止まっていて 40 m 以内のときだけできる', () => {
  let sim = yard(30); assert.equal(sim.canAutoCouple(), true); assert.equal(sim.requestCouple(), true); assert.equal(sim.TR.link, 'locking');
  run(sim, 2.1, () => ({ throttle: 0, brake: 0, steer: 0 })); assert.equal(sim.TR.link, 'coupled');
  sim = yard(60); assert.equal(sim.canAutoCouple(), false); assert.equal(sim.requestCouple(), false);
});
test('止めてあるトレーラーの後ろ半分には入り込めない', () => {
  const sim = loadSim(); flatRoad(sim); sim.setRigTrailer('van', 12000); sim.parkTrailer(1000, -10.75);
  sim.placeTruck(1000 - 30, -10.75, 0, { coupled: false });           // 真後ろから前進してぶつける
  run(sim, 20, () => ({ throttle: 0.4, brake: 0, steer: 0 }));
  assert.ok(sim.TR.frontS < 1000 - 12.4 + 0.4, `front ${sim.TR.frontS}`);
});
test('作業の途中や事故のあとに置き直すと、状態が残らない', () => {
  const sim = yard(30); sim.requestCouple(); run(sim, 0.5, () => ({ throttle: 0, brake: 0, steer: 0 }));
  sim.RIG.rolled = true; sim.RIG.roll = 0.2; sim.RIG.slosh.x = 0.5; sim.RIG.brakeP[2] = 1; sim.RIG.assist.esc = true;
  sim.placeTruck(2000, -7.65, 0, { coupled: true });
  assert.equal(sim.TR.link, 'coupled'); assert.equal(sim.TR.linkT, 0);
  assert.deepEqual([sim.RIG.rolled, sim.RIG.roll, sim.RIG.slosh.x, sim.RIG.brakeP[2], sim.RIG.assist.esc], [false, 0, 0, 0, false]);
});

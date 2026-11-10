import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad } from './helpers/sim.mjs';
const fresh = () => { const sim = loadSim(); flatRoad(sim); sim.TR.gcw = 26000; sim.TR.s = 1000; return sim; };
test('トルク曲線', () => {
  const { engineTorque } = fresh();
  assert.equal(engineTorque(1000), 2550); assert.equal(engineTorque(800), 2025); assert.equal(engineTorque(2400), 0);
});
test('踏み始めはリターダーだけ、深く踏むと主ブレーキ', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: 20, gear: 12, nextGear: 12, dir: 1, rpm: 1200 });
  let o; for (let i = 0; i < 240; i++) o = sim.powertrainStep(1 / 240, 0, 0.2);
  assert.equal(o.service, 0); assert.ok(Math.abs(sim.TR.ret - 0.2 / 0.35) < 0.02); assert.ok(o.drag > 10000);
  o = sim.powertrainStep(1 / 240, 0, 0.65); assert.ok(Math.abs(o.service - 0.5) < 1e-9);
});
test('90 km/h で駆動を切る', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: sim.VMAX, gear: 12, nextGear: 12, dir: 1, rpm: 1160 });
  assert.equal(sim.powertrainStep(1 / 240, 1, 0).drive, 0);
});
test('ブレーキでクルーズが切れる', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: 22, gear: 12, nextGear: 12, dir: 1, rpm: 1050, cruise: true, cruiseV: 22 });
  sim.powertrainStep(1 / 240, 0, 0.1);
  assert.equal(sim.TR.cruise, false); assert.ok(sim.EVENTS.some(e => e.t === 'cruiseOff'));
});
test('今の物理での加速は変わらない（27.5 t、0→80 km/h）', () => {
  const sim = loadSim({ extra: 'const _pp = { x: 0, y: 0, z: 0, h: 0 };' });   // scratch object the old physics borrows from 05-world.js
  sim.TR.gcw = sim.TR.mass = 27500; sim.placeTruck(sim.S0 + 40, -7.65, 0);
  let t = 0; while (sim.TR.v * 3.6 < 80 && t < 60) { sim.stepTruck(0.02, { throttle: 1, brake: 0, steer: 0 }); t += 0.02; }
  assert.ok(t > 24.5 && t < 28, `0-80 took ${t.toFixed(1)} s`);
});

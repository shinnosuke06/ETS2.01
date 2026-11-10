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

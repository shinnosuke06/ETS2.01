import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, setup, run, laneKeep } from './helpers/sim.mjs';
test('物理は 1 フレーム（4 ステップ）あたり 0.3 ミリ秒以下', () => {
  const sim = loadSim(); setup(sim, { trailer: 'tank', cargo: 19000, s: sim.S0 + 100, v: 20 });
  const inp = () => ({ throttle: 0.6, brake: 0, steer: laneKeep(sim, -7.65) });
  run(sim, 5, inp); const t0 = performance.now(); run(sim, 60, inp);
  const perFrame = (performance.now() - t0) / (60 * 60); assert.ok(perFrame < 0.3, `${perFrame.toFixed(3)} ms`);
  console.log(`physics: ${perFrame.toFixed(4)} ms per frame`);
});

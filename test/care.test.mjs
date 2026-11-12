// Fuel and sleepiness: how fast they change, what a refuel costs, when the blinks come, and when the navigation
// suggests a service area.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep } from './helpers/sim.mjs';

const SIM = loadSim();
// Hold about 90 km/h on a flat straight road with cargo (kg) for `metres`; returns the fuel used (fraction of a tank).
function burn(cargo, metres) {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo, v: 25, s: 1000 });
  sim.TR.fuel = 1; const s0 = sim.TR.s;
  run(sim, 2000, () => ({ throttle: sim.clamp((90 - kmh(sim)) * 0.3 + 0.35, 0, 1), brake: 0, steer: laneKeep(sim, -7.65) }), () => sim.TR.s - s0 < metres);
  return 1 - sim.TR.fuel;
}

test('S4 燃料：荷物 15 t・平ら・90 km/h で、ゲームの 2.2 km（本物の 22 km）走ると満タンから 0.1 ±0.01 減る（220 km ±10%）', () => {
  const used = burn(15000, 2200);
  assert.ok(Math.abs(used - 0.1) <= 0.01, `used ${used.toFixed(4)} of a tank`);
});
test('S4 重い荷物ほど早く減る', () => { assert.ok(burn(24000, 1000) > burn(6000, 1000)); });
test('S4 燃料が 0 だとアクセルが効かない（同じ入力で速さが増えない）', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 10 });
  sim.TR.fuel = 0; const v0 = sim.TR.v;
  run(sim, 5, () => ({ throttle: 1, brake: 0, steer: 0 }));
  assert.ok(sim.TR.v <= v0 + 1e-6, `v ${v0} -> ${sim.TR.v}`);
  sim.TR.fuel = 0.5; run(sim, 5, () => ({ throttle: 1, brake: 0, steer: 0 }));
  assert.ok(sim.TR.v > v0 + 1, 'with fuel it speeds up');
});
test('S4 給油の量と代金：燃料 0.2 → 96 L・13,440 円。残りの km は 10 km 単位', () => {
  assert.deepEqual(SIM.refuel(0.2), { liters: 96, yen: 13440 });
  assert.deepEqual(SIM.refuel(1), { liters: 0, yen: 0 });
  assert.equal(SIM.fuelKm(0.5), 110); assert.equal(SIM.fuelKm(0.82), 180); assert.equal(SIM.fuelKm(0), 0);
  assert.equal(SIM.CARE.fuelL, 120); assert.equal(SIM.CARE.price, 140); assert.equal(SIM.CARE.rescueYen, 30000); assert.equal(SIM.CARE.rescueL, 20);
});
test('S5 眠気：昼の 6 時間で 1、夜（22 時〜5 時）は 1.5 倍', () => {
  assert.ok(Math.abs(SIM.sleepyRate(12 * 3600) * 6 * 3600 - 1) < 1e-9);
  for (const h of [22, 23.5, 2, 4.9]) assert.ok(Math.abs(SIM.sleepyRate(h * 3600) / SIM.sleepyRate(12 * 3600) - 1.5) < 1e-9, `hour ${h}`);
  for (const h of [5, 12, 21.9]) assert.equal(SIM.sleepyRate(h * 3600), SIM.sleepyRate(12 * 3600), `hour ${h}`);
  assert.equal(SIM.sleepyRate((24 + 23) * 3600), SIM.sleepyRate(23 * 3600), 'the next day');
});
test('S5 まばたき：0.85 以下はなし、1.0 で平均 8 秒、0.85 を少し超えた所で平均 40 秒', () => {
  assert.equal(SIM.blinkGap(0.85, 0.5), Infinity); assert.equal(SIM.blinkGap(0.5, 0.5), Infinity);
  const mean = sl => { let s = 0; for (let k = 0; k < 1000; k++) s += SIM.blinkGap(sl, (k + 0.5) / 1000); return s / 1000; };
  assert.ok(Math.abs(mean(1) - 8) < 0.05, `${mean(1)}`); assert.ok(Math.abs(mean(0.8501) - 40) < 0.1, `${mean(0.8501)}`);
});
test('燃料と眠気の計算は 1 回 0.05 ms 以内', () => {
  const t0 = performance.now(); let x = 0;
  for (let k = 0; k < 20000; k++) x += SIM.fuelRate(150000, 25) + SIM.sleepyRate(k * 7) + SIM.blinkGap(0.9, 0.3);
  assert.ok((performance.now() - t0) / 20000 < 0.05 && x > 0);
});


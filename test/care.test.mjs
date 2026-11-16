// Fuel and sleepiness: how fast they change, what a refuel costs, when the blinks come, and when the navigation
// suggests a service area.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep } from './helpers/sim.mjs';

const SIM = loadSim();
// Hold about 90 km/h on a flat straight road with cargo (kg) for `metres`; returns the fuel used (fraction of a tank).
function burn(cargo, metres, grade = 0) {
  const sim = loadSim(); flatRoad(sim, { grade }); setup(sim, { cargo, v: 25, s: 1000 });
  sim.TR.fuel = 1; const s0 = sim.TR.s;
  run(sim, 2000, () => ({ throttle: sim.clamp((90 - kmh(sim)) * 0.3 + 0.35, 0, 1), brake: 0, steer: laneKeep(sim, -7.65) }), () => sim.TR.s - s0 < metres);
  return 1 - sim.TR.fuel;
}

test('S4 燃料：荷物 15 t・平ら・90 km/h で、ゲームの 2.2 km（本物の 22 km）走ると満タンから 0.1 ±0.01 減る（220 km ±10%）', () => {
  const used = burn(15000, 2200);
  assert.ok(Math.abs(used - 0.1) <= 0.01, `used ${used.toFixed(4)} of a tank`);
});
test('S4 発進（0 → 90 km/h、15 t）で減る燃料は、同じ距離を 90 km/h で走るのと同じくらい（差 0.5% 以内）', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 15000, v: 0, s: 1000 }); sim.TR.fuel = 1; const s0 = sim.TR.s;
  run(sim, 120, () => ({ throttle: 1, brake: 0, steer: laneKeep(sim, -7.65) }), () => kmh(sim) < 88);
  const used = 1 - sim.TR.fuel, cruise = burn(15000, sim.TR.s - s0);
  assert.ok(Math.abs(used - cruise) <= 0.005, `start ${used.toFixed(4)}, cruise ${cruise.toFixed(4)}`);
});
test('S4 坂を上ると平らより多く減る', () => { assert.ok(burn(15000, 1000, 0.03) > burn(15000, 1000) * 1.05); });
test('S4 燃料が 0 になるとクルーズが切れて、ゆっくり止まっていく', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 15000, v: 22 });
  sim.TR.fuel = 0; sim.TR.cruise = true; sim.TR.cruiseV = 22; sim.TR.cruiseI = 0;
  run(sim, 30, () => ({ throttle: 0, brake: 0, steer: laneKeep(sim, -7.65) }));
  assert.equal(sim.TR.cruise, false); assert.ok(kmh(sim) < 70, `${kmh(sim).toFixed(1)} km/h`);
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
  assert.equal(SIM.CARE.fuelL, 120); assert.equal(SIM.CARE.price, 140); assert.equal(SIM.CARE.rescueYen, 30000); assert.equal(SIM.CARE.rescueMinL, 20); assert.equal(SIM.CARE.rescueMaxL, 60);
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


// ---- which service area the navigation suggests ------------------------------------------------------------------
test('S7 寄り道の案内：燃料 0.1 なら次の SA（fuel）、眠気 0.75 なら（sleep）、どちらでもなければ null', () => {
  const [nakai, ashigara] = SIM.SAS, dest = SIM.RAMPS.find(r => r.ic.i === 4);   // 御殿場, past both
  const s = nakai.sDiv - 3000;
  assert.deepEqual(SIM.saSuggest(s, 0.1, 0.2, dest.sDiv, dest.ic.kp), { sa: nakai, why: 'fuel' });
  assert.deepEqual(SIM.saSuggest(s, 0.5, 0.75, dest.sDiv, dest.ic.kp), { sa: nakai, why: 'sleep' });
  assert.deepEqual(SIM.saSuggest(s, 0.1, 0.9, dest.sDiv, dest.ic.kp), { sa: nakai, why: 'fuel' });
  assert.equal(SIM.saSuggest(s, 0.5, 0.2, dest.sDiv, dest.ic.kp), null);
  assert.equal(SIM.saSuggest(nakai.sEnd + 10, 0.1, 0.2, dest.sDiv, dest.ic.kp).sa, ashigara);
});
test('S7 目的の出口が手前で燃料が足りるときは案内しない、足りなければ案内する', () => {
  const nakai = SIM.SAS[0], atsugi = SIM.RAMPS.find(r => r.ic.i === 2), s = atsugi.sDiv - 2000;   // 厚木 (kp 35) comes before 中井
  assert.equal(SIM.saSuggest(s, 0.18, 0.2, atsugi.sDiv, atsugi.ic.kp), null);         // 0.18 × 220 × 0.8 = 31.7 km ≥ 1.2 × 25 km (kp 10 → 35)
  assert.equal(SIM.saSuggest(s, 0.18, 0.8, atsugi.sDiv, atsugi.ic.kp), null);         // sleepy, but the job ends first
  assert.deepEqual(SIM.saSuggest(s, 0.05, 0.2, atsugi.sDiv, atsugi.ic.kp), { sa: nakai, why: 'fuel' });   // 11 km < 30 km
});
test('S7 分かれ目まで 160 m を切った SA は案内せず、次の SA にする（通り過ぎたら次）', () => {
  const [nakai, ashigara] = SIM.SAS, dest = SIM.RAMPS.find(r => r.ic.i === 4);
  assert.equal(SIM.saSuggest(nakai.sDiv - 161, 0.1, 0, dest.sDiv, dest.ic.kp).sa, nakai);
  assert.equal(SIM.saSuggest(nakai.sDiv - 159, 0.1, 0, dest.sDiv, dest.ic.kp).sa, ashigara);
  assert.equal(SIM.saSuggest(SIM.SAS[5].sDiv + 10, 0.1, 0, SIM.RAMPS.at(-1).sDiv + 1e5, 400), null);   // none left ahead
});
test('S7 燃料の案内：次の次の SA まで（10 km の余裕つきで）届かないときに、次の SA を案内する', () => {
  const [nakai] = SIM.SAS, dest = SIM.RAMPS.find(r => r.ic.i === 4), s = nakai.sDiv - 3000;   // kp 15.8; 足柄 is 55.7 km on
  assert.deepEqual(SIM.saSuggest(s, 0.3, 0, dest.sDiv, dest.ic.kp), { sa: nakai, why: 'fuel' });   // 52.8 km < 65.7
  assert.equal(SIM.saSuggest(s, 0.4, 0, dest.sDiv, dest.ic.kp), null);                             // 70.4 km
});
test('S7 案内中の SA は分かれ目を過ぎてもその車線の終わりまで続き、手前に別の SA があるときは手前にする', () => {
  const [nakai, ashigara] = SIM.SAS, dest = SIM.RAMPS.find(r => r.ic.i === 4);
  assert.equal(SIM.saSuggest(nakai.sDiv - 100, 0.1, 0, dest.sDiv, dest.ic.kp, nakai).sa, nakai);
  assert.equal(SIM.saSuggest(nakai.sDiv + nakai.uSep - 1, 0.1, 0, dest.sDiv, dest.ic.kp, nakai).sa, nakai);
  assert.equal(SIM.saSuggest(nakai.sDiv + nakai.uSep + 1, 0.1, 0, dest.sDiv, dest.ic.kp, nakai).sa, ashigara);
  assert.equal(SIM.saSuggest(nakai.sDiv - 5000, 0.1, 0, dest.sDiv, dest.ic.kp, ashigara).sa, nakai);   // moved back (やり直し)
  assert.equal(SIM.saSuggest(nakai.sDiv - 100, 0.1, 0.8, dest.sDiv, dest.ic.kp, nakai).why, 'fuel');    // the reason is asked again
  assert.equal(SIM.saSuggest(nakai.sDiv - 100, 0.9, 0.8, dest.sDiv, dest.ic.kp, nakai).why, 'sleep');
});
test('S7 救援の燃料は次の SA まで 10 km の余裕をもって届く量（5 L きざみ、20〜60 L）', () => {
  const at = kp => SIM.S0 + kp * 100;
  assert.equal(SIM.rescueLiters(at(50)), 25);      // 足柄 21.5 km on: (21.5 + 10) / 176 × 120 = 21.5 → 25
  assert.equal(SIM.rescueLiters(at(130)), 50);     // 牧之原 59.5 km on: 47.4 → 50
  assert.equal(SIM.rescueLiters(SIM.SAS[1].sDiv - 300), 20);   // 足柄 3 km on: at least 20
  for (let kp = 1; kp < 320; kp += 3) { const L = SIM.rescueLiters(at(kp)); assert.ok(L >= 20 && L <= 60 && L % 5 === 0, `kp ${kp}: ${L}`); }
});
// The 13 jobs' expressway legs, two laps: fuel used per map km as a full tank lasting 220 km, 20% more for climbs and
// towns, and 1% at each job's start; the driver refuels where the navigation guides. The tank never runs dry.
test('S7 案内どおりに給油すれば、13 の仕事を 2 周しても燃料が切れない', () => {
  const JOBS = [[0, 2], [2, 4], [4, 6], [6, 7], [7, 8], [8, 9], [9, 11], [11, 12], [0, 1], [1, 3], [3, 5], [5, 10], [10, 12]];
  let fuel = 0.35, low = 1, stops = 0;
  for (let lap = 0; lap < 2; lap++) for (const [from, to] of JOBS) {
    const s0 = SIM.ICS[from].s + 300, ramp = SIM.RAMPS[to - 1]; let sug = null; const passed = new Set();
    fuel -= 0.01;
    for (let s = s0; s < ramp.sDiv; s += 10) {
      fuel -= 10 * 10 / 1000 / SIM.CARE.rangeKm * 1.2; low = Math.min(low, fuel);
      sug = SIM.saSuggest(s, fuel, 0, ramp.sDiv, SIM.ICS[to].kp, sug && sug.sa);
      for (const a of SIM.SAS) if (!passed.has(a) && s >= a.sDiv && a.sDiv > s0) { passed.add(a); if (sug && sug.sa === a) { fuel = 1; stops++; sug = null; } }
    }
  }
  assert.ok(low > 0, `lowest ${low.toFixed(3)}`); assert.ok(stops >= 2 && stops <= 8, `${stops} stops`);
});

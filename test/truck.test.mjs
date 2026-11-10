import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep, H } from './helpers/sim.mjs';
const flat = (o, road = {}) => { const sim = loadSim(); flatRoad(sim, road); setup(sim, o); return sim; };
const full = { throttle: 1, brake: 0, steer: 0 };
const to80 = o => { const sim = flat(o); return run(sim, 120, () => full, () => kmh(sim) < 80); };
test('T14 総重量', () => {
  assert.equal(flat({ trailer: 'van', cargo: 12000 }).TR.gcw, 26600);
  assert.equal(flat({ trailer: 'tank', cargo: 19000 }).TR.gcw, 33100);
  assert.equal(flat({ trailer: null, cargo: 0 }).TR.gcw, 7600);
});
test('T1 加速：空車 < バン12t < バン22t、22t は空車の 1.5 倍以上', () => {
  const a = to80({ trailer: null, cargo: 0 }), b = to80({ cargo: 12000 }), c = to80({ cargo: 22000 });
  assert.ok(a < b && b < c && c >= 1.5 * a, `${a} ${b} ${c}`);
});
test('T2 登坂 4%', () => {
  const settle = o => { const sim = flat({ ...o, v: 60 / 3.6 }, { grade: 0.04 }); run(sim, 170, () => full); let sum = 0, n = 0; run(sim, 10, () => full, () => { sum += kmh(sim); n++; }); return sum / n; };
  assert.ok(settle({ cargo: 22000 }) <= 75); assert.ok(settle({ cargo: 12000 }) >= 80); assert.ok(settle({ trailer: null, cargo: 0 }) > 88);
});
test('T3 同じ踏み方のブレーキ', () => {
  const dist = (cargo, brake, until) => { const sim = flat({ cargo, v: 80 / 3.6 }); run(sim, 1, () => ({ throttle: 0.3, brake: 0, steer: 0 })); const z0 = sim.TR.z; run(sim, 120, () => ({ throttle: 0, brake, steer: 0 }), () => kmh(sim) > until); return sim.TR.z - z0; };
  assert.ok(dist(22000, 0.6, 0.5) >= 1.10 * dist(12000, 0.6, 0.5));
  assert.ok(dist(22000, 0.3, 40) >= 1.25 * dist(12000, 0.3, 40));
});
test('T11 実際の道路で車線を保つ（85 km/h、3 km）', () => {
  for (const o of [{ trailer: null, cargo: 0 }, { cargo: 12000 }, { cargo: 22000 }, { trailer: 'tank', cargo: 19000 }]) {
    const sim = loadSim(); setup(sim, { ...o, s: sim.S0 + 100, v: 20 }); let worst = 0;
    run(sim, 200, () => ({ throttle: kmh(sim) < 85 ? 1 : 0.2, brake: 0, steer: laneKeep(sim, -7.65) }), () => { worst = Math.max(worst, Math.abs(sim.TR.lat + 7.65)); return sim.TR.s < sim.S0 + 3100; });
    assert.ok(sim.TR.s >= sim.S0 + 3100 && worst < 0.6, `${o.trailer} ${o.cargo}: ${worst}`);
    assert.ok(!sim.EVENTS.some(e => ['rail', 'crash', 'rollover', 'jackknife', 'reset'].includes(e.t)));
  }
});
test('長すぎるフレームでも進めすぎない', () => {
  const sim = flat({ cargo: 12000, v: 10 });
  assert.equal(sim.physicsAdvance(1 / 60, full), 4);
  assert.ok(sim.physicsAdvance(5, full) <= 24);
  assert.ok(Number.isFinite(sim.TR.x) && Number.isFinite(sim.TR.v));
});
test('入力や状態が壊れても戻る', () => {
  const sim = flat({ cargo: 12000, v: 10 }); run(sim, 1, () => full);
  sim.stepTruck(H, { throttle: NaN, brake: undefined, steer: Infinity });
  assert.ok(Number.isFinite(sim.TR.v));
  sim.RIG.t.vx = NaN; sim.stepTruck(H, full);
  assert.ok(Number.isFinite(sim.TR.x) && Number.isFinite(sim.TR.v)); assert.ok(sim.EVENTS.some(e => e.t === 'reset'));
  sim.EVENTS.length = 0; run(sim, 1, () => full); sim.RIG.t.x += 5000; sim.RIG.r.x += 5000; sim.stepTruck(H, full);   // 道路から大きく外れた
  assert.ok(Math.abs(sim.TR.lat) < 50); assert.ok(sim.EVENTS.some(e => e.t === 'reset'));
});
test('ほかのファイルが使う TR の項目がある', () => {
  const T = flat({}).TR;
  for (const k of ['x', 'z', 'h', 'v', 'steer', 'yawRate', 'gear', 'nextGear', 'dir', 'rpm', 'shiftT', 'ret', 'load', 'cruise', 'cruiseV', 's', 'lat', 'idx', 'y', 'pitch', 'accel', 'latAcc', 'frontS', 'frontLat', 'odo', 'fuel', 'damage', 'spin', 'gcw', 'link', 'art']) assert.ok(k in T, k);
  for (const k of ['x', 'z', 'h', 's', 'lat', 'y', 'pitch', 'kx', 'kz']) assert.ok(k in T.tr, 'tr.' + k);
});

import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, H } from './helpers/sim.mjs';
const VAN = { key: 'van', name: 'バン', empty: 7000, L2: 8.3, cgE: [5.4, 1.5], cgC: [5.6, 2.0], I0: 108000, kI: 13, rear: 12.4, nose: 1.2, slosh: null };
const rig = (spec, cargo, v = 0) => { const sim = loadSim(); flatRoad(sim); sim.rigSetTrailer(spec, cargo); sim.rigPlace(0, 0, 0, v, !!spec); return sim; };
const cmd = o => ({ steer: 0, drive: 0, drag: 0, service: 0, hold: false, ...o });
const kg = n => n / 9.81;
test('静的な軸重：空車とバン22t', () => {
  let l = rig(null, 0).rigAxleLoads();
  assert.ok(Math.abs(kg(l[0]) - 5164) < 20 && Math.abs(kg(l[1]) - 2436) < 20);
  l = rig(VAN, 22000).rigAxleLoads();
  assert.ok(Math.abs(kg(l[0]) - 6060) < 150 && Math.abs(kg(l[1]) - 11140) < 150 && Math.abs(kg(l[2]) - 19400) < 150);
});
test('同じ力なら重いほど加速しない', () => {
  const dv = (spec, cargo) => { const sim = rig(spec, cargo, 5); for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({ drive: 15000 })); return sim.rigPose({}).v - 5; };
  const a = dv(null, 0), b = dv(VAN, 12000), c = dv(VAN, 22000);
  assert.ok(a > b && b > c && a > 2.5 * c, `${a} ${b} ${c}`);
});
test('連結点は離れない（スラローム 60 秒）', () => {
  const sim = rig(VAN, 12000, 15); let worst = 0;
  for (let i = 0; i < 60 * 240; i++) { sim.rigStep(H, cmd({ steer: 0.05 * Math.sin(i * H * 1.2), drive: 6000 })); worst = Math.max(worst, sim.RIG.gap); }
  assert.ok(worst < 0.03, `gap ${worst}`);
});
test('T10 低速は横滑りなしの式に合う（舵角 20°、5 km/h、20 秒）', () => {
  const sim = rig(VAN, 12000, 5 / 3.6), d = 20 * Math.PI / 180, target = 5 / 3.6;
  let x = 0, z = 0, h = 0, tx = 0, tz = -(8.3 - 0.35);                    // 参照：今までの式を、同じ速さで積分する
  for (let i = 0; i < 20 * 240; i++) {
    const v = sim.rigPose({}).v;
    sim.rigStep(H, cmd({ steer: d, drive: sim.clamp((target - v) * 20000, -30000, 30000) }));
    h += -v * Math.tan(d) / 3.9 * H; x += Math.sin(h) * v * H; z += Math.cos(h) * v * H;
    const hx = x + Math.sin(h) * 0.35, hz = z + Math.cos(h) * 0.35, dx = hx - tx, dz = hz - tz, L = Math.hypot(dx, dz);
    tx = hx - dx / L * 8.3; tz = hz - dz / L * 8.3;
  }
  const p = sim.rigPose({});
  assert.ok(Math.hypot(p.x - x, p.z - z) < 0.25, `rear axle ${Math.hypot(p.x - x, p.z - z)}`);
  assert.ok(Math.hypot(p.tx - tx, p.tz - tz) < 0.25, `trailer axle ${Math.hypot(p.tx - tx, p.tz - tz)}`);
});
test('T10 まっすぐ 10 m バックしても横にずれない', () => {
  const sim = rig(VAN, 12000, 0);
  for (let i = 0; i < 240 * 30 && sim.rigPose({}).z > -10; i++) sim.rigStep(H, cmd({ drive: sim.rigPose({}).v > -1 ? -8000 : 0 }));
  const p = sim.rigPose({}); assert.ok(p.z <= -10 && Math.abs(p.x) < 0.05 && Math.abs(p.tx) < 0.05);
});
test('坂で保持すると動かず、離すと下がる', () => {
  const sim = loadSim(); flatRoad(sim, { grade: 0.04 }); sim.rigSetTrailer(VAN, 22000); sim.rigPlace(0, 0, 0, 0, true);
  for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({ hold: true }));
  assert.equal(sim.rigPose({}).z, 0);
  for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({}));
  assert.ok(sim.rigPose({}).z < -1);
});
test('ブレーキは力：同じ圧でも重いほど減速が弱い', () => {
  const dec = cargo => { const sim = rig(VAN, cargo, 20); for (let i = 0; i < 480; i++) sim.rigStep(H, cmd({ service: 0.4 })); const v0 = sim.rigPose({}).v; for (let i = 0; i < 240; i++) sim.rigStep(H, cmd({ service: 0.4 })); return v0 - sim.rigPose({}).v; };
  assert.ok(dec(12000) > 1.08 * dec(22000));
});
test('乱数の入力 60 秒で値が壊れない', () => {
  const sim = rig(VAN, 22000, 10), r = sim.rng(7);
  for (let i = 0; i < 60 * 240; i++) { if (i % 120 === 0) sim._c = cmd({ steer: (r() - 0.5) * 0.3, drive: (r() - 0.3) * 40000, service: r() < 0.3 ? r() : 0 }); sim.rigStep(H, sim._c); }
  const p = sim.rigPose({}); for (const k of ['x', 'z', 'h', 'v', 'tx', 'tz', 'th']) assert.ok(Number.isFinite(p[k]), k);
});

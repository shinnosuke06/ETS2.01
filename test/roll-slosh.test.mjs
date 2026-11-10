import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep, steerForLatAcc, H } from './helpers/sim.mjs';
const flat = o => { const sim = loadSim(); flatRoad(sim); setup(sim, o); return sim; };
const has = (sim, t) => sim.EVENTS.some(e => e.t === t);
test('T7 タンクは止まったあと液体が前後に揺れる。バンは揺れない', () => {
  const after = trailer => { const sim = flat({ trailer, cargo: 19000, v: 60 / 3.6 });
    run(sim, 60, () => ({ throttle: 0, brake: 0.5, steer: 0 }), () => sim.TR.v > 0.02);
    let flips = 0, peak = 0, prev = Math.sign(sim.TR.surge);
    run(sim, 6, () => ({ throttle: 0, brake: 0.5, steer: 0 }), () => { const s = Math.sign(sim.TR.surge); if (s && prev && s !== prev) flips++; if (s) prev = s; peak = Math.max(peak, Math.abs(sim.TR.surge)); });
    return { flips, peak }; };
  const tank = after('tank'), van = after('van');
  assert.ok(tank.flips >= 2 && tank.peak >= 0.03, JSON.stringify(tank)); assert.equal(van.peak, 0);
});
test('T8 タンク 80 km/h で 0.5 g の舵角を 3 秒：オフは横転、オンは横転しない', () => {
  const go = assist => { const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist }); const st = steerForLatAcc(sim, 0.5);
    run(sim, 3, () => ({ throttle: 0.6, brake: 0, steer: st })); run(sim, 3, () => ({ throttle: 0, brake: 0, steer: 0 })); return has(sim, 'rollover'); };
  assert.equal(go(false), true); assert.equal(go(true), false);
});
test('横転の境目：バン22t は 0.30 g では起きず、0.55 g では起きる', () => {
  const go = g => { const sim = flat({ cargo: 22000, v: 80 / 3.6, assist: false }); const st = steerForLatAcc(sim, g); run(sim, 5, () => ({ throttle: 0.6, brake: 0, steer: st })); return has(sim, 'rollover'); };
  assert.equal(go(0.30), false); assert.equal(go(0.55), true);
});
test('低速のバックで折れ曲がっても 80° で止まり、事故にはならない', () => {
  const sim = flat({ cargo: 12000, assist: false }); sim.TR.dir = -1; let worst = 0;
  run(sim, 40, () => ({ throttle: sim.TR.v > -0.8 ? 0.3 : 0, brake: 0, steer: 1 }), () => { worst = Math.max(worst, Math.abs(sim.TR.art)); });
  assert.ok(worst > 1.2 && worst <= 1.396 + 0.01, `art ${worst}`); assert.equal(has(sim, 'jackknife'), false); assert.equal(has(sim, 'reset'), false);
});
test('towReset はまっすぐ連結した状態で路肩に戻す', () => {
  const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist: false }); const st = steerForLatAcc(sim, 0.5);
  run(sim, 3, () => ({ throttle: 0.6, brake: 0, steer: st })); sim.towReset();
  assert.equal(sim.TR.link, 'coupled'); assert.equal(sim.TR.v, 0); assert.ok(Math.abs(sim.TR.art) < 1e-6 && Math.abs(sim.TR.lat + 10.75) < 0.01);
  assert.equal(sim.RIG.rolled, false); assert.equal(sim.TR.roll, 0); assert.equal(sim.RIG.slosh.x, 0);
});
test('T12 乱数の入力 10 分（装置オンとオフ）で値が壊れず、連結点も離れない', () => {
  for (const assist of [true, false]) {
    const sim = loadSim(); setup(sim, { trailer: 'tank', cargo: 19000, s: sim.S0 + 100, v: 15, assist }); const r = sim.rng(assist ? 11 : 12);
    let inp = { throttle: 0.5, brake: 0, steer: 0 }, worst = 0, reset = false;
    run(sim, 600, t => { if (Math.round(t / H) % 360 === 0) inp = { throttle: r(), brake: r() < 0.25 ? r() : 0, steer: sim.clamp(laneKeep(sim, -7.65) + (r() - 0.5) * 0.8, -1, 1) }; return inp; },
      () => { worst = Math.max(worst, sim.RIG.gap); reset ||= has(sim, 'reset'); if (has(sim, 'rollover') || has(sim, 'jackknife')) sim.towReset(); sim.EVENTS.length = 0; });
    assert.ok(worst < 0.03, `gap ${worst}`); assert.equal(reset, false);
    for (const k of ['x', 'z', 'h', 'v', 's', 'lat', 'art', 'roll', 'ltr']) assert.ok(Number.isFinite(sim.TR[k]), k);
  }
});
test('装置オンなら、ハンドルを切り続けても横転しない（10 秒）', () => {
  for (const o of [{ trailer: 'tank', cargo: 19000 }, { cargo: 22000 }, { cargo: 12000 }]) {
    for (const kmh0 of [60, 80, 90]) {
      const sim = flat({ ...o, v: kmh0 / 3.6, assist: true }); let ltr = 0;
      run(sim, 10, () => ({ throttle: 0.6, brake: 0, steer: 1 }), () => { ltr = Math.max(ltr, Math.abs(sim.TR.ltr)); });
      assert.equal(has(sim, 'rollover'), false, `${o.trailer || 'van'} ${o.cargo} at ${kmh0} km/h, ltr ${ltr.toFixed(2)}`);
      assert.equal(has(sim, 'jackknife'), false, `${o.trailer || 'van'} ${o.cargo} at ${kmh0} km/h jackknifed`);
    }
  }
});

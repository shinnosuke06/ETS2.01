import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, steerForLatAcc } from './helpers/sim.mjs';
const flat = o => { const sim = loadSim(); flatRoad(sim); setup(sim, o); return sim; };
const brakeFull = { throttle: 0, brake: 1, steer: 0 };
test('T4 全制動（装置オン）は 75 m 以内でまっすぐ止まる', () => {
  for (const o of [{ trailer: null, cargo: 0 }, { cargo: 12000 }, { cargo: 22000 }, { trailer: 'tank', cargo: 19000 }]) {
    const sim = flat({ ...o, v: 80 / 3.6 }); const z0 = sim.TR.z; let art = 0;
    run(sim, 20, () => brakeFull, () => { art = Math.max(art, Math.abs(sim.TR.art)); return sim.TR.v > 0.05; });
    assert.ok(sim.TR.z - z0 < 75, `${o.trailer} ${o.cargo}: ${sim.TR.z - z0} m`);
    assert.ok(Math.abs(sim.TR.lat + 7.65) < 0.3 && art < 3 * Math.PI / 180);
  }
});
test('T5 空車：装置オフでは後軸がロックし、発進で空転する。オンでは起きない', () => {
  const seen = (assist, inp, v) => { const sim = flat({ trailer: null, cargo: 0, v, assist }); let lock = false, spin = false; run(sim, 3, () => inp, () => { lock ||= sim.RIG.axle[1].lock; spin ||= sim.RIG.axle[1].spin; }); return { lock, spin }; };
  assert.equal(seen(false, brakeFull, 80 / 3.6).lock, true); assert.equal(seen(true, brakeFull, 80 / 3.6).lock, false);
  assert.equal(seen(false, { throttle: 1, brake: 0, steer: 0 }, 0).spin, true); assert.equal(seen(true, { throttle: 1, brake: 0, steer: 0 }, 0).spin, false);
});
test('T6 車線変更の途中で全制動：オフはジャックナイフ、オンは立て直す', () => {
  // The driver keeps the front wheels where they are. The steer input is a share of the speed-dependent
  // lock, so it has to rise as the rig slows for the wheel angle to stay put.
  const go = assist => { const sim = flat({ cargo: 12000, v: 80 / 3.6, assist }); const delta = steerForLatAcc(sim, 0.3) * sim.steerLock(sim.TR.v); let art = 0;
    const hold = () => sim.clamp(delta / sim.steerLock(sim.TR.v), -1, 1);
    run(sim, 1, () => ({ throttle: 0.4, brake: 0, steer: hold() }));
    run(sim, 6, () => ({ throttle: 0, brake: 1, steer: hold() }), () => { art = Math.max(art, Math.abs(sim.TR.art)); });
    return { art: art * 180 / Math.PI, v: sim.TR.v }; };
  const off = go(false), on = go(true);
  assert.ok(off.art > 40, `off ${off.art}`); assert.ok(on.art < 15 && Math.abs(on.v) < 0.1, `on ${on.art}`);
});
test('装置オンなら、ハンドルを切り増しながら全制動しても駆動軸は横に流れない', () => {
  // Same steer input all the way down: the wheel angle grows as the lock opens up at low speed.
  const sim = flat({ cargo: 12000, v: 80 / 3.6, assist: true }); const st = steerForLatAcc(sim, 0.3); let slide = 0;
  run(sim, 1, () => ({ throttle: 0.4, brake: 0, steer: st }));
  run(sim, 8, () => ({ throttle: 0, brake: 1, steer: st }), () => { slide = Math.max(slide, Math.abs(sim.RIG.axle[1].alpha)); });
  assert.ok(slide < 0.25, `drive axle slip angle ${slide.toFixed(2)} rad`); assert.ok(Math.abs(sim.TR.v) < 0.1);
});
test('切りすぎ防止：装置オンでは舵角が横転の限界の 80% までに抑えられる', () => {
  const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist: true });
  run(sim, 2, () => ({ throttle: 0.5, brake: 0, steer: 1 }));
  const v = sim.TR.v, ay = v * v * Math.tan(Math.abs(sim.TR.steer)) / 3.9;
  assert.ok(ay <= 0.8 * 0.8 * 9.81 * (2.05 / 2) / sim.RIG.h2 + 0.05, `ay ${ay}`);
});
test('装置の作動は通知される', () => {
  const sim = flat({ trailer: null, cargo: 0, v: 80 / 3.6, assist: true }); run(sim, 1, () => brakeFull);
  assert.ok(sim.EVENTS.some(e => e.t === 'assist' && e.kind === 'abs')); assert.equal(sim.TR.assist.abs, true);
});
test('普通の車線変更（0.2 g）では横滑り防止は働かない', () => {
  for (const o of [{ cargo: 12000 }, { cargo: 22000 }, { trailer: 'tank', cargo: 19000 }, { trailer: null, cargo: 0 }]) {
    const sim = flat({ ...o, v: 80 / 3.6, assist: true }); const st = steerForLatAcc(sim, 0.2); let esc = false;
    run(sim, 4, t => ({ throttle: 0.4, brake: 0, steer: t < 1.5 ? st : t < 3 ? -st : 0 }), () => { esc ||= sim.RIG.assist.esc; });
    assert.equal(esc, false, `${o.trailer} ${o.cargo}`);
  }
});

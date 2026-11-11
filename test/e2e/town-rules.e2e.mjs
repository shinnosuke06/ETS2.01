// The rules in towns: red lights, the dock bonus, town speed limits, and the tow back onto a lane after an accident.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// In the page: empty town i of its cars (so nothing stands in the way), and point helpers in a warehouse gate's frame.
const RULES_SRC = `window.__noCars = i => { const X = TOWN_TRAFFIC.get(i); if (X) { X.cars.length = 0; for (const g of X.groups) g.visible = false; } };
window.__gateP = (w, d, x) => { const g = w.gate; return [g.u + d * g.nu - x * g.nv, g.v + d * g.nv + x * g.nu]; };
window.__gateDir = (w, dd, dx) => [dd * w.gate.nu - dx * w.gate.nv, dd * w.gate.nv + dx * w.gate.nu];`;

test('E6 赤で停止線を越えると罰金 ¥9,000、30 秒は同じ交差点で取らず、そのあとはまた取る。黄では罰金なし', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    const L = TOWNS_LOADED.get(0).layout; __noCars(0);
    const lane = L.lanes.find(l => l.stopNode != null && !l.turn && !l.plaza && L.nodes[l.stopNode].signal && l.len > 60);
    const node = L.nodes[lane.stopNode], P = lane.pts, E = P[P.length - 1], A = P[P.length - 2], s = Math.hypot(E[0] - A[0], E[1] - A[1]);
    const du = (E[0] - A[0]) / s, dv = (E[1] - A[1]) / s, back = 6 + RIGP.front;   // the front starts 6 m before the stop line
    // the next signal time (s) from now at which the lane shows `want` for at least `hold` seconds
    const when = (want, hold) => { for (let t = Math.ceil(GAME.clock / TIME_SCALE); ; t += 0.25) { let ok = true; for (let k = 0; k <= hold; k += 0.25) if (signalState(node, lane.stopAxis, t + k) !== want) { ok = false; break; } if (ok) return t; } };
    const cross = want => {
      GAME.clock = (when(want, want === 'red' ? 3 : 1.5) + 0.2) * TIME_SCALE;
      __placeTown(0, E[0] - du * back, E[1] - dv * back, du, dv, 20, false);
      __drive(__town(0, [[E[0] - du * back, E[1] - dv * back], [E[0] + du * 12, E[1] + dv * 12]]), 20, 2.2, false);
      return { fines: GAME.job.fines, led: document.getElementById('ledText').textContent };
    };
    GAME.job.fines = 0;
    const red1 = cross('red'), red2 = cross('red');
    for (let i = 0; i < 60 * 31; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    const red3 = cross('red');
    GAME.redCool = {};
    const yellow = cross('yellow');
    return { red1, red2, red3, yellow, node: node.id };
  });
  assert.equal(r.red1.fines, 9000, JSON.stringify(r)); assert.match(r.red1.led, /信号無視 罰金 ¥9,000/);
  assert.equal(r.red2.fines, 9000, 'no second fine at the same junction within 30 s');
  assert.equal(r.red3.fines, 18000, 'fined again after 30 s'); assert.equal(r.yellow.fines, 18000, 'no fine on yellow');
  assert.deepEqual(errors, []);
}));

test('荷台口に付けて切り離すと、結果に「荷台口ボーナス（+20%）」が基本報酬の 20% で出る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const w = GAME.job.whB, d = w.docks[2], sp = TRAILERS[TR.trailerKey];
    const rear = [d.u + d.nu * 0.2, d.v + d.nv * 0.2], kp = [rear[0] + d.nu * sp.rear, rear[1] + d.nv * sp.rear];
    __placeTown(2, kp[0] - d.nu * HITCH, kp[1] - d.nv * HITCH, d.nu, d.nv, 0); await __ready();
    for (let i = 0; i < 30; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    INP.actions.push('couple'); for (let i = 0; i < 400 && GAME.state === 'drive'; i++) simTick(1 / 60);
    const rows = [...document.querySelectorAll('#resRows > div')].map(d => [...d.children].map(c => c.textContent));
    return { state: GAME.state, rows, want: yen(Math.round(GAME.job.pay * 0.2 / 100) * 100) };
  });
  assert.equal(r.state, 'result', JSON.stringify(r));
  assert.deepEqual(r.rows.find(x => x[0] === '荷台口ボーナス（+20%）'), ['荷台口ボーナス（+20%）', r.want], JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('町の大通りで 63 km/h を超えて 4 秒走ると速度超過（制限 50）、構内では 33 km/h を超えて 4 秒で速度超過（制限 20）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    const L = TOWNS_LOADED.get(0).layout, out = {}; __noCars(0);
    const run = (from, dir, kmh) => {
      for (const n of L.nodes) GAME.redCool['0:' + n.id] = 99;           // no red-light fines in this test
      GAME.job.fines = 0; GAME.fineCool = 0; GAME.overT = 0;
      __placeTown(0, from[0], from[1], dir[0], dir[1], kmh, false);
      let fineAt = -1, led = '', lim = 0;
      for (let t = 0; t < 6; t += 1 / 60) {
        __drive(__town(0, [[from[0] + dir[0] * 0, from[1] + dir[1] * 0], [from[0] + dir[0] * 200, from[1] + dir[1] * 200]]), kmh, 1 / 60, false);
        lim = GAME.limit;
        if (fineAt < 0 && GAME.job.fines > 0) { fineAt = t; led = document.getElementById('ledText').textContent; }
      }
      return { fines: GAME.job.fines, fineAt, led, lim, kmh: TR.v * 3.6 };
    };
    out.main = run([-4.875, 60], [0, 1], 64);
    const w = GAME.job.whA;
    out.yard = run(__gateP(w, 30, -30), __gateDir(w, 0, 1), 35);
    return out;
  });
  assert.equal(r.main.lim, 50, JSON.stringify(r)); assert.equal(r.main.fines, 9000, JSON.stringify(r));
  assert.ok(r.main.fineAt > 3.9 && r.main.fineAt < 5, JSON.stringify(r)); assert.match(r.main.led, /速度超過（制限50km\/h）/);
  assert.equal(r.yard.lim, 20, JSON.stringify(r)); assert.equal(r.yard.fines, 9000, JSON.stringify(r)); assert.match(r.yard.led, /速度超過（制限20km\/h）/);
  assert.deepEqual(errors, []);
}));

test('町の中で横転すると、いちばん近い車線の上に車線の向きで戻る（連結したまま）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const L = TOWNS_LOADED.get(0).layout, site = L.site, w = GAME.job.whA, at = __gateP(w, 30, 0), dir = __gateDir(w, 0, 1);
    __placeTown(0, at[0], at[1], dir[0], dir[1], 0);
    for (let i = 0; i < 10; i++) simTick(1 / 60);
    const p = townNearestLane(L, TR.tu, TR.tv);
    EVENTS.push({ t: 'rollover' }); simTick(1 / 60);
    const k = townUV(site, TR.tr.kx, TR.tr.kz, {}), side = q => -(q.u - p.u) * Math.sin(p.h) + (q.v - p.v) * Math.cos(p.h);
    return { p, at: [TR.tu, TR.tv], dh: Math.abs(wrapA(TR.h - (site.hu + p.h))), kSide: side(k), tSide: side({ u: TR.tu, v: TR.tv }),
      zone: TR.zone, link: TR.link, led: document.getElementById('ledText').textContent };
  });
  assert.ok(Math.hypot(r.at[0] - r.p.u, r.at[1] - r.p.v) < 0.3 && r.dh < 0.02, JSON.stringify(r));
  assert.ok(Math.abs(r.kSide) < 0.3 && Math.abs(r.tSide) < 0.3, JSON.stringify(r));
  assert.deepEqual([r.zone, r.link], ['town', 'coupled']); assert.match(r.led, /横転しました/);
  assert.deepEqual(errors, []);
}));

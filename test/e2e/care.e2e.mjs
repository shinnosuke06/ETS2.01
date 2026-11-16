// Fuel and sleepiness at the service areas: refuelling, naps, running dry and the rescue, the fade.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';
import { atLane, inSlot, pressStop } from './sa-helpers.mjs';

test('給油の枠で止まると「給油」が出て、押すと満タン、仕事の燃料代、時計 +10 分、電光板の文', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { TR.fuel = 0.2; });
  const b = await inSlot(page, 'pump');
  assert.deepEqual(b, { shown: true, text: '給油', kind: 'fuel' });
  const c0 = await page.evaluate(() => GAME.clock), r = await pressStop(page);
  const after = await page.evaluate(() => ({ fuel: TR.fuel, cost: GAME.job.fuelCost, n: GAME.job.fuelN, clock: GAME.clock }));
  assert.equal(r.state, 'drive'); assert.equal(r.led, '給油 96 L　13,440 円');
  assert.ok(after.fuel > 0.9999, `${after.fuel}`); assert.equal(after.cost, 13440); assert.equal(after.n, 1); assert.ok(Math.abs(after.clock - c0 - 600) < 3, `${after.clock - c0}`);
  assert.deepEqual(errors, []);
}));

test('空いている大型車の枠で止まると「仮眠」が出て、押すと眠気 0、時計 +30 分', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { GAME.sleepy = 0.8; });
  assert.deepEqual(await inSlot(page, 'stall'), { shown: true, text: '仮眠', kind: 'nap' });
  const c0 = await page.evaluate(() => GAME.clock), r = await pressStop(page);
  const after = await page.evaluate(() => ({ sleepy: GAME.sleepy, clock: GAME.clock }));
  assert.equal(r.led, '30 分の仮眠をとりました'); assert.ok(after.sleepy < 0.001, `${after.sleepy}`); assert.ok(Math.abs(after.clock - c0 - 1800) < 3);
  assert.deepEqual(errors, []);
}));

test('E2 燃料切れ：本線で燃料 0 → アクセルが効かず止まる → 「救援を呼ぶ」→ 次の SA まで届く燃料、時計 +60 分、結果の画面に「救援　-¥30,000」', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __clearRoad(S0 + 1500, S0 + 3500); placeTruck(S0 + 2000, X_TRV, 15, { coupled: true }); await __ready();
    TR.fuel = 0; const v0 = TR.v; let vmax = 0;
    for (let n = 0; n < 120; n++) { INP.tGas = 1; simTick(1 / 60); vmax = Math.max(vmax, TR.v); }
    INP.tGas = 0; for (let n = 0; n < 900 && Math.abs(TR.v) > 0.05; n++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    for (let n = 0; n < 10; n++) simTick(1 / 60);
    return { v0, vmax, led: document.getElementById('ledText').textContent, hazard: GAME.hazard, shown: !document.getElementById('bStop').hidden, text: document.getElementById('bStop').textContent };
  });
  assert.ok(r.vmax <= r.v0 + 0.01, JSON.stringify(r)); assert.equal(r.shown, true); assert.equal(r.text, '救援を呼ぶ'); assert.equal(r.hazard, true);
  const c0 = await page.evaluate(() => GAME.clock), L = await page.evaluate(() => rescueLiters(TR.s)), p = await pressStop(page);
  const after = await page.evaluate(() => { const o = { fuel: TR.fuel, rescue: GAME.job.rescue, clock: GAME.clock }; completeJob({}); o.rows = document.getElementById('resRows').textContent; return o; });
  assert.ok(L >= 20 && L <= 60, `${L}`); assert.equal(p.led, `救援が来ました　燃料 ${L} L`);
  assert.ok(Math.abs(after.fuel - L / 120) < 1e-4, `${after.fuel}`); assert.equal(after.rescue, 30000); assert.ok(Math.abs(after.clock - c0 - 3600) < 3);
  assert.match(after.rows, /救援-¥30,000/);
  assert.deepEqual(errors, []);
}));

test('燃料切れで止まると、ペダルを踏まなくても坂で下がらず、救援のあと走り出せる（上り坂と加速車線の上）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    let hill = null; for (let s = S0 + 500; s < ROUTE_END - 500 && hill == null; s += 20) if (gradeAt(s) > 0.025 && !rampAt(s) && !entryAt(s) && !saAt(s) && !tunnelAt(s, 150)) hill = s;
    const out = {};
    for (const [name, s, lat] of [['hill', hill, X_TRV], ['band', ENTRIES[2].s0 + 330, entryEdges(330).cx]]) {
      __clearRoad(s - 300, s + 300); placeTruck(s, lat, 0, { coupled: true }); await __ready();
      TR.fuel = 0; const s0 = TR.s;
      for (let n = 0; n < 180; n++) { INP.tBrake = 0; INP.tGas = 0; simTick(1 / 60); }
      const moved = Math.abs(TR.s - s0), kind = GAME.stopKind;
      document.getElementById('bStop').click(); for (let n = 0; n < 4; n++) simTick(1 / 60);
      const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
      for (let n = 0; n < 300; n++) { INP.tGas = 1; simTick(1 / 60); } INP.tGas = 0;
      out[name] = { grade: gradeAt(s), moved, kind, v: TR.v, fuel: TR.fuel };
    }
    return out;
  });
  for (const k of ['hill', 'band']) {
    assert.ok(r[k].moved < 0.3 && r[k].kind === 'rescue', `${k} ${JSON.stringify(r[k])}`);
    assert.ok(r[k].v > 1.5 && r[k].fuel > 0, `${k} drives off ${JSON.stringify(r[k])}`);
  }
  assert.ok(r.hill.grade > 0.025);
  assert.deepEqual(errors, []);
}));

test('暗転の間のボタンとキーは効かない（給油を 2 回押しても代金は 1 回、メニュー・地図は開かない）', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { TR.fuel = 0.2; });
  await inSlot(page, 'pump');
  const r = await page.evaluate(async () => {
    const b = document.getElementById('bStop'); b.click(); simTick(1 / 60);
    b.click(); INP.actions.push('stop', 'menu', 'map', 'camera'); simTick(1 / 60);
    const cam = GAME.cam, t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
    for (let n = 0; n < 4; n++) simTick(1 / 60);
    return { n: GAME.job.fuelN, cost: GAME.job.fuelCost, state: GAME.state, menu: !document.getElementById('menuOv').hidden, map: !document.getElementById('mapOv').hidden, cam, camNow: GAME.cam };
  });
  assert.deepEqual({ n: r.n, cost: r.cost, state: r.state, menu: r.menu, map: r.map }, { n: 1, cost: 13440, state: 'drive', menu: false, map: false });
  assert.equal(r.camNow, r.cam);
  assert.deepEqual(errors, []);
}));

test('燃料 0 で給油の枠に入ったときは、救援ではなく「給油」が出る', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { TR.fuel = 0; });
  assert.deepEqual(await inSlot(page, 'pump'), { shown: true, text: '給油', kind: 'fuel' });
  assert.deepEqual(errors, []);
}));

test('仮眠のすぐあとは、同じ枠でもう一度「仮眠」は出ない', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { GAME.sleepy = 0.8; });
  await inSlot(page, 'stall'); await pressStop(page);
  const r = await page.evaluate(() => { for (let n = 0; n < 30; n++) simTick(1 / 60); return { shown: !document.getElementById('bStop').hidden, kind: GAME.stopKind }; });
  assert.deepEqual(r, { shown: false, kind: null });
  assert.deepEqual(errors, []);
}));

test('やり直しで、燃料と眠気が仕事を始めたときの値に戻り、寄り道の案内も消える', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    const f0 = GAME.job.fuel0, s0 = GAME.job.sleepy0;   // as the job began
    TR.fuel = 0.05; GAME.sleepy = 0.9; NAV.sug = { sa: SAS[3], why: 'fuel' };
    document.getElementById('restartBtn').click();
    const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 30000) await __t.frames(1);
    return { f0, s0, fuel: TR.fuel, sleepy: GAME.sleepy, sug: NAV.sug };
  });
  assert.ok(r.f0 > 0.5 && Math.abs(r.fuel - r.f0) < 2e-3 && Math.abs(r.sleepy - r.s0) < 2e-3, JSON.stringify(r)); assert.equal(r.sug, null);   // a few frames run after it
  assert.deepEqual(errors, []);
}));

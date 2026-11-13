// Fuel and sleepiness kept across page loads, old saves, the blinks, the place button on phones, the small marks, the night's sleep.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';
import { atLane, inSlot } from './sa-helpers.mjs';

test('E3 開き直し：燃料と眠気が保存した値に戻る', async () => {
  let store;
  await withGame({}, async page => {
    await startJob(page);
    store = await page.evaluate(() => { TR.fuel = 0.37; GAME.sleepy = 0.42; for (let n = 0; n < 5; n++) simTick(1 / 60); careSave(); saveDrive(); return Object.fromEntries(['nlh.care', 'nlh.drive'].map(k => [k, JSON.parse(localStorage.getItem(k))])); });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => ({ fuel: TR.fuel, sleepy: GAME.sleepy }));
    assert.ok(Math.abs(r.fuel - 0.37) < 0.002 && Math.abs(r.sleepy - 0.42) < 0.002, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('サービスエリアの中で開き直しても、そこから走れる（地面の上、壁の外）', async () => {
  let store;
  await withGame({}, async page => {
    await atLane(page, 0, 100, 0);
    store = await page.evaluate(() => { __placeSa(0, 250, 23, 1, 0, 0); for (let n = 0; n < 10; n++) simTick(1 / 60); saveDrive(); careSave(); return Object.fromEntries(['nlh.care', 'nlh.drive'].map(k => [k, JSON.parse(localStorage.getItem(k))])); });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => {
      for (let n = 0; n < 5; n++) simTick(1 / 60);
      const a = SAS[0], c = {}, u0 = TR.s - a.sDiv, zone = TR.zone; let pen = 0;
      for (const [f, w] of [[5, 1.2], [5, -1.2], [-1, 1.2], [-1, -1.2]]) { GROUND.contact(TR.x + Math.sin(TR.h) * f + Math.cos(TR.h) * w, TR.z + Math.cos(TR.h) * f - Math.sin(TR.h) * w, TR.idx, c); pen = Math.max(pen, c.pen); }
      for (let n = 0; n < 240; n++) { INP.tGas = 0.4; simTick(1 / 60); } INP.tGas = 0;
      return { zone, u0, pen, moved: TR.s - a.sDiv - u0, damage: TR.damage };
    });
    assert.equal(r.zone, 'sa', JSON.stringify(r)); assert.ok(Math.abs(r.u0 - 250) < 1 && r.pen === 0, JSON.stringify(r));
    assert.ok(r.moved > 3 && r.damage < 0.1, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('古い保存（燃料・眠気・燃料代のない nlh.drive、nlh.care なし）でも始まる', async () => {
  let store;
  await withGame({}, async page => {
    await startJob(page);
    store = await page.evaluate(() => { saveDrive(); const d = JSON.parse(localStorage.getItem('nlh.drive')); for (const k of ['fuel', 'sleepy']) delete d[k]; for (const k of ['fuelCost', 'fuelN', 'rescue']) delete d.jp[k]; return { 'nlh.drive': d }; });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => { for (let n = 0; n < 5; n++) simTick(1 / 60); return { fuel: TR.fuel, sleepy: GAME.sleepy, cost: GAME.job.fuelCost, rescue: GAME.job.rescue, n: GAME.job.fuelN }; });
    assert.ok(Math.abs(r.fuel - 0.82) < 0.002 && r.sleepy < 0.01 && r.cost === 0 && r.rescue === 0 && r.n === 0, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('E5 まばたき：眠気 0.95 で 30 秒のうちに画面が暗くなる、0.5 では暗くならない', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const ov = document.getElementById('blinkOv'), run = sl => { let max = 0; for (let n = 0; n < 1800; n++) { GAME.sleepy = sl; simTick(1 / 60); max = Math.max(max, +getComputedStyle(ov).opacity || 0); } return max; };
    return { high: run(0.95), low: run(0.5) };
  });
  assert.ok(r.high >= 0.5 && r.high <= 0.86, JSON.stringify(r)); assert.equal(r.low, 0, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('E9 場所のボタン：スマホの縦・横で、ほかのボタン・札・LED と重ならず画面に収まる', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) await withGame({ width, height, touch: true }, async (page, errors) => {
    await atLane(page, 0, 100, 0);
    await page.evaluate(() => { TR.fuel = 0.3; });
    await inSlot(page, 'pump');
    const r = await page.evaluate(async () => {
      led('給油 96 L　13,440 円'); setCam('chase'); await __t.frames(2);
      const box = el => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
      const stop = document.getElementById('bStop');
      return { stop: box(stop), shown: !stop.hidden, others: [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden && b !== stop).map(b => ({ name: b.textContent, ...box(b) })),
        fixed: ['jobSign', 'led', 'navCard', 'blinkPad', 'wheelPad', 'gearPad', 'pedalPad', 'speedo'].map(id => ({ name: id, el: document.getElementById(id) })).filter(o => o.el && !o.el.hidden).map(o => ({ name: o.name, ...box(o.el) })).filter(b => b.w > 0) };
    });
    const hits = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1, tag = `${width}x${height}`;
    assert.ok(r.shown && r.stop.w > 30, tag);
    assert.ok(r.stop.x >= 0 && r.stop.r <= width && r.stop.y >= 0 && r.stop.b <= height, `${tag}: off screen ${JSON.stringify(r.stop)}`);
    for (const b of [...r.others, ...r.fixed]) assert.ok(!hits(r.stop, b), `${tag}: overlaps ${b.name} ${JSON.stringify([r.stop, b])}`);
    assert.deepEqual(errors, []);
  });
});

test('燃料が 25% 未満、眠気が 0.5 を超えると、車の外の視点で小さな印が出る（15%・0.85 で赤）', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    setCam('chase');
    const look = (fuel, sleepy) => { TR.fuel = fuel; GAME.sleepy = sleepy; for (let n = 0; n < 40; n++) simTick(1 / 60); updateHud(1); const f = document.getElementById('icFuel'), s = document.getElementById('icSleep'); return [!f.hidden, f.classList.contains('red'), !s.hidden, s.classList.contains('red')]; };
    return { calm: look(0.6, 0.2), low: look(0.2, 0.6), worse: look(0.1, 0.9), cluster: clusterState() };
  });
  assert.deepEqual(r.calm, [false, false, false, false]); assert.deepEqual(r.low, [true, false, true, false]); assert.deepEqual(r.worse, [true, true, true, true]);
  assert.equal(r.cluster.fuelKm, 20); assert.ok(r.cluster.sleepy > 0.89);
  assert.deepEqual(errors, []);
}));

test('夜に仕事を終えて次の朝になると、眠気が 0 になる', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    GAME.clock = 20 * 3600; GAME.sleepy = 0.6; completeJob({});
    document.getElementById('nextBtn').click();
    const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 60000) await __t.frames(1);
    return { sleepy: GAME.sleepy, h: (GAME.clock / 3600) % 24 };
  });
  assert.ok(r.sleepy < 0.001, JSON.stringify(r)); assert.ok(r.h < 9, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

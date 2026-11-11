import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, tick, driveHelpers } from './helpers.mjs';

test('自動連結 → 厚木の倉庫 → 納品の枠で切り離すと結果が出る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  assert.equal(await page.evaluate(() => TR.link), 'free');
  await page.keyboard.press('KeyT'); await tick(page, 2.5);
  assert.equal(await page.evaluate(() => TR.link), 'coupled');
  const r = await page.evaluate(async () => {
    // lined up behind the destination's bay with the kingpin at its middle, then 6 m forward: kingpin and tail both inside
    const b = GAME.job.whB.bay;
    __placeTown(2, b.u - b.hu * 0.35, b.v - b.hv * 0.35, b.hu, b.hv, 0); await __ready();
    const site = TOWN_SITES[2], k = {}, at = () => townUV(site, TR.tr.kx, TR.tr.kz, k);
    const inp = () => ({ throttle: TR.v < 1.5 ? 0.3 : 0, brake: (at(), (k.u - b.u) * b.hu + (k.v - b.v) * b.hv >= 6) ? 0.8 : 0, steer: 0 });
    for (let i = 0; i < 240 * 60 && !((at(), (k.u - b.u) * b.hu + (k.v - b.v) * b.hv >= 6) && Math.abs(TR.v) < 0.05); i++) stepTruck(1 / 240, inp());
    return { into: +((k.u - b.u) * b.hu + (k.v - b.v) * b.hv).toFixed(2), ok: requestUncouple() };
  });
  assert.ok(r.into >= 6 && r.into < 8.5 && r.ok, JSON.stringify(r));
  await tick(page, 2.5);
  assert.equal(await page.evaluate(() => GAME.state), 'result');
  assert.equal(await page.isVisible('#resultOv'), true);
  assert.deepEqual(errors, []);
}));

test('手動の連結：バックして合わせると連結できる', () => withGame({}, async page => {
  await startJob(page);
  const link = await page.evaluate(() => {
    TR.dir = -1;
    for (let i = 0; i < 240 * 60 && TR.link === 'free'; i++) stepTruck(1 / 240, { throttle: -TR.v * 3.6 < 3 ? 0.25 : 0, brake: 0, steer: 0 });
    return TR.link;
  });
  assert.equal(link, 'locking');
  assert.match(await tick(page, 0.1), /ロックしました/);
  assert.match(await tick(page, 2.5), /連結完了　総重量 26\.6 t/);
  assert.equal(await page.evaluate(() => TR.link), 'coupled');
}));

test('仕事 3（御殿場 → 富士）はタンクトレーラーで、総重量は 33.1 t', () => withGame({}, async page => {
  const r = await page.evaluate(() => { GAME.jobIdx = 2; setupJob(2); return { key: TR.trailerKey, gcw: TR.gcw, link: TR.link, mass: document.getElementById('jMass').textContent, cargo: document.getElementById('jCargo').textContent }; });
  assert.equal(r.key, 'tank'); assert.equal(r.gcw, 33100); assert.equal(r.link, 'free');
  assert.match(r.mass, /総重量 33\.1 t/); assert.equal(r.cargo, '牛乳（タンク）');
}));

test('目的地の構内で、荷台口でも枠でもない所に切り離すと、理由が表示される', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  await page.evaluate(async () => {
    const y = GAME.job.whB.yard, g = GAME.job.whB.gate;   // the middle of the yard, facing in from the gate
    __placeTown(2, (y.u0 + y.u1) / 2 + g.nu * 10, (y.v0 + y.v1) / 2 + g.nv * 10, g.nu, g.nv, 0); await __ready(); requestUncouple();
  });
  assert.match(await tick(page, 2.5), /荷台口か納品の枠で切り離してください/);
  assert.equal(await page.evaluate(() => TR.link), 'free');
  assert.equal(await page.evaluate(() => GAME.state), 'drive');
}));

test('トレーラーを置いたまま走り去ると知らせる。やり直しで元に戻る', () => withGame({}, async page => {
  await startJob(page);
  await page.evaluate(() => { placeTruck(TR.s + 200, -7.65, 10, { coupled: false }); });
  assert.match(await tick(page, 3), /トレーラーを置いたままです/);
  await page.keyboard.press('Escape'); await page.click('#restartBtn');
  await page.waitForFunction(() => GAME.state === 'drive' && TR.link === 'free' && canAutoCouple(), null, { timeout: 30000 });
}));

test('横転するとレッカー移動になり、違反金がつく', () => withGame({}, async page => {
  await startJob(page);
  // on the shoulder, clear of the traffic lanes, so no other contact adds to the bill
  await page.evaluate(() => { placeTruck(TR.s + 300, -10.75, 20, { coupled: true }); GAME.job.fines = 0; TR.damage = 0; EVENTS.push({ t: 'rollover' }); });
  assert.match(await tick(page, 0.1), /横転しました。レッカー移動 ¥30,000/);
  const r = await page.evaluate(() => ({ fines: GAME.job.fines, damage: TR.damage, v: TR.v, lat: TR.lat, link: TR.link }));
  assert.equal(r.fines, 30000); assert.equal(r.damage, 25); assert.equal(r.link, 'coupled');
  assert.ok(Math.abs(r.v) < 0.5 && Math.abs(r.lat + 10.75) < 0.3);
}));

test('安定装置の設定は RIG に伝わり、保存される', () => withGame({}, async page => {
  await startJob(page);
  assert.equal(await page.evaluate(() => RIG.assistOn), true);
  await page.keyboard.press('Escape'); await page.click('#assistSeg [data-v="off"]');
  assert.equal(await page.evaluate(() => RIG.assistOn), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nlh.assist'))), false);
}));

test('スマホの横向きと縦向きで、連結のボタンが画面内にある', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) {
    await withGame({ width, height, touch: true }, async page => {
      await startJob(page);
      const b = await page.locator('#bCouple').boundingBox();
      assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `${width}x${height}`);
      assert.equal(await page.textContent('#bCouple'), '自動連結');
    });
  }
});

test('スマホの横向きと縦向きで、上のボタンが目的地の表示やメッセージと重ならない', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) {
    await withGame({ width, height, touch: true }, async page => {
      await startJob(page);
      const boxes = await page.evaluate(() => {
        led('後ろのトレーラーにバックして連結してください（T で自動連結）');
        const box = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom }; };
        return { sign: box(document.getElementById('jobSign')), led: box(document.getElementById('led')),
          buttons: [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden).map(b => ({ name: b.textContent, ...box(b) })) };
      });
      const hits = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;
      for (const b of boxes.buttons) {
        assert.ok(!hits(b, boxes.sign), `${width}x${height}: ${b.name} overlaps the destination sign`);
        assert.ok(!hits(b, boxes.led), `${width}x${height}: ${b.name} overlaps the message board`);
        assert.ok(b.x >= 0 && b.r <= width, `${width}x${height}: ${b.name} is off screen`);
      }
      assert.ok(!hits(boxes.led, boxes.sign), `${width}x${height}: the message board overlaps the destination sign`);
    });
  }
});

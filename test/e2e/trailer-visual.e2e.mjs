import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, tick } from './helpers.mjs';

test('仕事ごとにトレーラーのモデルが切り替わり、同じ形の部品を持つ', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(() => {
    const keys = o => ['root', 'body', 'legs', 'blinkL', 'blinkR', 'tail', 'rev', 'spin'].every(k => k in o);
    setupJob(2); updateVisuals(0.016);
    const a = { tank: TRAILER_MODELS.tank.root.visible, van: TRAILER_MODELS.van.root.visible, is: TRL === TRAILER_MODELS.tank };
    setupJob(0); updateVisuals(0.016);
    return { a, b: { tank: TRAILER_MODELS.tank.root.visible, van: TRAILER_MODELS.van.root.visible }, shape: keys(TRAILER_MODELS.van) && keys(TRAILER_MODELS.tank), wheels: TRAILER_MODELS.tank.spin.length };
  });
  assert.deepEqual(r.a, { tank: true, van: false, is: true }); assert.deepEqual(r.b, { tank: false, van: true });
  assert.equal(r.shape, true); assert.equal(r.wheels, 6);
  assert.deepEqual(errors, []);
}));

test('脚とカールコードは連結の状態に合わせて動き、置いたトレーラーはその場に見える', () => withGame({}, async page => {
  await startJob(page);
  let v = await page.evaluate(() => {
    updateVisuals(0.016);
    const spin0 = TRL.spin[0].rotation.x; window.__start = [TR.x, TR.z, TR.h];
    for (let i = 0; i < 240; i++) stepTruck(1 / 240, { throttle: 0.5, brake: 0, steer: 0 });   // drive off without it
    updateVisuals(0.016);
    return { legs: TRL.legs.position.y, coil: TRK.coil.visible, stowed: TRK.coilStowed.visible,
      at: [TRL.root.position.x - TR.tr.kx, TRL.root.position.z - TR.tr.kz], moved: Math.hypot(TR.x - __start[0], TR.z - __start[1]) > 0.5, wheelsStill: TRL.spin[0].rotation.x === spin0 };
  });
  assert.deepEqual(v, { legs: 0, coil: false, stowed: true, at: [0, 0], moved: true, wheelsStill: true });
  await page.evaluate(() => { placeTruckAt(__start[0], __start[1], __start[2], 0, { coupled: false }); });   // back where the job put it
  await page.keyboard.press('KeyT'); await tick(page, 2.5);
  v = await page.evaluate(() => { updateVisuals(0.016); return { link: TR.link, legs: TRL.legs.position.y, coil: TRK.coil.visible, stowed: TRK.coilStowed.visible }; });
  assert.deepEqual(v, { link: 'coupled', legs: 0.45, coil: true, stowed: false });
}));

test('車体は曲がる向きの外側へ傾き、車輪は傾かない', () => withGame({}, async page => {
  await startJob(page);
  // TR.roll is positive in a right turn. The model's +x is its right side, so a positive turn about z lifts the right: a lean to the left.
  const r = await page.evaluate(() => { TR.roll = 0.05; updateVisuals(0.016); return { body: TRL.body.rotation.z, wheelParent: TRL.spin[0].parent === TRL.root }; });
  assert.ok(Math.abs(r.body - 0.05) < 1e-9); assert.equal(r.wheelParent, true);
}));

test('連結するとトラクターの後ろが沈み、後輪は路面に残る', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => {
    updateVisuals(0.016); const free = { y: TRK.root.position.y - TR.y, wheel: TRK.rear[0].position.y };
    placeTruck(TR.s + 100, -10.75, 0, { coupled: true }); for (let i = 0; i < 60; i++) stepTruck(1 / 240, { throttle: 0, brake: 1, steer: 0 });
    updateVisuals(0.016);
    return { free, kp: TR.kp, y: TRK.root.position.y - TR.y, wheelOnRoad: TRK.root.position.y - TR.y + TRK.rear[0].position.y };
  });
  assert.deepEqual(r.free, { y: 0, wheel: 0.52 });
  assert.ok(r.kp > 40000, `kingpin load ${r.kp}`); assert.ok(r.y < -0.02 && r.y >= -0.06, `sink ${r.y}`);
  assert.ok(Math.abs(r.wheelOnRoad - 0.52) < 1e-9);
}));

import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, tick } from './helpers.mjs';

test('メーターに総重量、連結の状態、装置のランプが出る', () => withGame({}, async (page, errors) => {
  await startJob(page);
  let st = await page.evaluate(() => clusterState());
  assert.equal(st.link, 'free'); assert.deepEqual(st.lamps, { abs: 'off', esc: 'off', tcs: 'off' });
  st = await page.evaluate(() => {
    placeTruck(TR.s + 300, -10.75, 22, { coupled: true });
    for (let i = 0; i < 120; i++) stepTruck(1 / 240, { throttle: 0, brake: 1, steer: 0 });
    return clusterState();
  });
  assert.equal(st.gcwText, '総重量 26.6 t'); assert.equal(st.link, 'coupled'); assert.equal(st.lamps.abs, 'flash');
  st = await page.evaluate(() => { RIG.assistOn = false; GAME.assist = false; return clusterState(); });
  assert.deepEqual(st.lamps, { abs: 'on', esc: 'on', tcs: 'on' });
  await page.evaluate(() => { drawCluster(clusterState()); drawNav(navState()); });
  assert.deepEqual(errors, []);
}));

test('ナビは切り離し中にトレーラーの位置を持つ', () => withGame({}, async page => {
  await startJob(page);
  const n = await page.evaluate(() => navState().trailer);
  assert.ok(n && Number.isFinite(n.x) && Number.isFinite(n.z));
  await page.keyboard.press('KeyT'); await tick(page, 2.5);
  assert.equal(await page.evaluate(() => TR.link), 'coupled');
  assert.equal(await page.evaluate(() => navState().trailer), null);
}));

test('音の関数は、音を始める前に呼んでも落ちない', () => withGame({}, async (page, errors) => {
  await page.evaluate(() => { sfxClunk(); sfxHiss(1); sfxWarn(); audioUpdate({ rpm: 800, load: 0, v: 0, ret: 0, inCab: true, running: true, tunnel: false, slip: 1 }); });
  assert.deepEqual(errors, []);
}));

test('音を始めたあと、滑りの音量が slip に従う', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const g = await page.evaluate(async () => {
    const st = { rpm: 900, load: 0, v: 15, ret: 0, inCab: true, running: true, tunnel: false };
    const update = audioUpdate; window.audioUpdate = () => {};   // keep the game's own per-frame update (slip 0) out of the way
    const read = async slip => { update({ ...st, slip }); await new Promise(r => setTimeout(r, 600)); return AUD.squealG.gain.value; };
    const out = { on: AUD.on, loud: await read(1), quiet: await read(0) };
    window.audioUpdate = update;
    return out;
  });
  assert.equal(g.on, true); assert.ok(g.loud > 0.02 && g.quiet < g.loud / 4, JSON.stringify(g));
  await page.evaluate(() => { sfxClunk(); sfxHiss(1); sfxWarn(); });
  assert.deepEqual(errors, []);
}));

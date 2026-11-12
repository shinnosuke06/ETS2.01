import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, tick, driveHelpers } from './helpers.mjs';

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

test('町の中ではナビに町の道、目的の倉庫の印、そこまでの青いルートが出て、上の帯は次の操作（門は左）、下の帯は「〇〇まで 〇 m」。目的地でない町では広場へ案内する', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __placeTown(0, 4.875, 120, 0, -1, 0); await __ready();
    for (let i = 0; i < 10; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    const tokyo = navState().guide;
    const gate = GAME.job.whB.gate;
    __placeTown(2, -4.875, gate.v - 100, 0, 1, 0); await __ready();
    for (let i = 0; i < 10; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;   // a physics step notes that the rig is in the town
    const st = navState(); drawNav(st);
    // the same projection as drawNav's (0.35 px per metre in a town, the truck at (256, 250) facing up)
    const sh = Math.sin(st.heading), ch = Math.cos(st.heading), scr = (x, z) => { const dx = x - st.x, dz = z - st.z; return [Math.round(256 + (dx * -ch + dz * sh) * 0.35), Math.round(250 - (dx * sh + dz * ch) * 0.35)]; };
    const px = (x, y) => [...DASH.ng.getImageData(x, y, 1, 1).data].slice(0, 3);
    const q = townXZ(TOWN_SITES[2], 0, gate.v + 100, {}), main = scr(q.x, q.z), wh = scr(st.destWh.x, st.destWh.z);
    const qr = townXZ(TOWN_SITES[2], 0, gate.v - 50, {}), route = scr(qr.x, qr.z);
    return { tokyo, guide: st.guide, footer: st.footer, name: GAME.job.whB.name, town: st.town, wh: px(...wh), main: px(...main), route: px(...route), arrow: px(30, 27), at: wh };
  });
  assert.equal(r.tokyo, '広場へ');
  assert.equal(r.town, 2); assert.equal(r.guide, '門は左', JSON.stringify(r)); assert.match(r.footer, new RegExp('^' + r.name + 'まで \\d*0 m$'), JSON.stringify(r));
  assert.deepEqual(r.route, [47, 156, 255], 'the route in blue ' + JSON.stringify(r));
  assert.deepEqual(r.wh, [47, 156, 255], 'the blue mark at the gate ' + JSON.stringify(r));
  assert.deepEqual(r.main, [127, 142, 155], 'Main A drawn grey ' + JSON.stringify(r)); assert.deepEqual(r.arrow, [47, 156, 255], 'the arrow');
  assert.deepEqual(errors, []);
}));

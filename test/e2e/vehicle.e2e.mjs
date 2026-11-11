// The tractor and cab model: materials, lighting, structure, budgets and the trim switch.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob } from './helpers.mjs';

const vehMats = () => { const s = new Set(); TRK.root.traverse(o => { if (o.isMesh) s.add(o.material); }); return [...s]; };

test('画質 高：塗装はクリア層つき、まわりの絵は前処理済み、革に凹凸がある', () => withGame({ storage: { 'nlh.quality': 'high' } }, async (page, errors) => {
  const r = await page.evaluate(() => ({ pbr: VEH.pbr, paint: !!TM.paint.isMeshPhysicalMaterial, cc: TM.paint.clearcoat, env: !!TM.paint.envMap && TM.paint.envMap.mapping === THREE.CubeUVReflectionMapping,
    cab: IM.seat.envMap === VEH.envCab, bump: !!IM.seat.normalMap, vc: IM.lower.vertexColors === true, keys: ['amberOn', 'amberOff', 'headOn', 'headOff', 'white', 'whiteOn', 'redOn', 'redOff', 'redDim', 'marker', 'ledRed'].every(k => TM[k]) }));
  assert.deepEqual(r, { pbr: true, paint: true, cc: 1, env: true, cab: true, bump: true, vc: true, keys: true }); assert.deepEqual(errors, []);
}));
test('V8 画質 低：軽い素材だけで、凹凸の地図がない', () => withGame({ storage: { 'nlh.quality': 'low' } }, async page => {
  const r = await page.evaluate(`(${vehMats})().map(m => [m.type, !!m.normalMap]).filter(([t, n]) => /Standard|Physical/.test(t) || n)`);
  assert.deepEqual(r, []); assert.equal(await page.evaluate(() => VEH.pbr), false);
}));
test('V7 夜とトンネルでは、まわりの絵の効きが昼より弱く、0 にはならない', () => withGame({}, async page => {
  const r = await page.evaluate(() => { const at = (d, t) => { setVehicleLight(d, t); return [TM.paint.envMapIntensity, IM.seat.envMapIntensity]; };
    return { day: at(1, 0), night: at(0, 0), tunnel: at(1, 1) }; });
  assert.ok(Math.abs(r.day[0] - 1) < 1e-6 && Math.abs(r.day[1] - 1) < 1e-6, JSON.stringify(r));
  assert.ok(Math.abs(r.night[0] - 0.12) < 1e-6 && Math.abs(r.night[1] - 0.10) < 1e-6, JSON.stringify(r)); assert.ok(Math.abs(r.tunnel[0] - 0.4) < 1e-6 && Math.abs(r.tunnel[1] - 0.5) < 1e-6, JSON.stringify(r));
}));
test('V7 夜になると、ゲームが効きを弱め、赤い間接照明が点く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => { await __t.frames(2); const day = TM.paint.envMapIntensity; GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 19 * 3600; await __t.frames(10);
    return { day, night: TM.paint.envMapIntensity, amb: IM.ambient.color.r }; });
  assert.ok(r.night < r.day * 0.4 && r.night > 0, JSON.stringify(r)); assert.ok(r.amb > 0.5, JSON.stringify(r));
}));
test('質感のある素材が作れないときは、軽い素材に切り替わって続く', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(() => { THREE.PMREMGenerator.prototype.fromCubemap = () => { throw new Error('no pmrem'); }; disposeVehicleMaterials(); makeVehicleMaterials('high');
    return { pbr: VEH.pbr, fallback: VEH.fallback, paint: TM.paint.type }; });
  assert.deepEqual(r, { pbr: false, fallback: true, paint: 'MeshPhongMaterial' }); assert.deepEqual(errors, []);
}));
test('模様の絵が作れないときは、その素材は単色になって続く', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(() => { CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error('no pixels'); }; disposeVehicleMaterials(); makeVehicleMaterials('high');
    return [IM.seat.normalMap, IM.seat.map, IM.seat.color.getHex() !== 0]; });
  assert.deepEqual(r, [null, null, true]); assert.deepEqual(errors, []);
}));
test('保存された名前が知らない値なら、初期値を使う', () => withGame({ storage: { 'nlh.trim': 'zzz', 'nlh.paint': 'zzz', 'nlh.interior': 'zzz' } }, async page => {
  assert.deepEqual(await page.evaluate(() => [trimName, paintName, interiorName]), ['normal', 'white', 'black']);
}));
test('内装の表示名はライトグレー、保存名は beige のまま', () => withGame({}, async page => {
  const r = await page.evaluate(() => { document.querySelector('#intSeg [data-v="beige"]').click(); return [document.querySelector('#intSeg [data-v="beige"]').textContent.trim(), interiorName, JSON.parse(localStorage.getItem('nlh.interior'))]; });
  assert.deepEqual(r, ['ライトグレー', 'beige', 'beige']);
}));

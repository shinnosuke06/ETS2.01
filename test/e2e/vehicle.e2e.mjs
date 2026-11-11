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

const TKEYS = ['root', 'cab', 'cabPivot', 'blinkL', 'blinkR', 'heads', 'lightbar', 'spin', 'steer', 'rear', 'coil', 'coilStowed', 'spot', 'mirrors', 'wipers'];
const IKEYS = ['cluster', 'nav', 'wheel', 'gas', 'brake', 'charm', 'charmState', 'eye', 'group', 'shell', 'fine'];
test('V5 つなぎ：トラクターと室内が決まった名前を返す', () => withGame({}, async page => {
  const r = await page.evaluate(([tk, ik]) => ({ t: tk.filter(k => TRK[k] == null), i: ik.filter(k => INT[k] == null), n: ['heads', 'blinkL', 'blinkR', 'rear', 'spin', 'steer'].map(k => TRK[k].length),
    cam: cabCam.parent === INT.eye, eye: INT.eye.position.toArray(), st: vehicleStats() }), [TKEYS, IKEYS]);
  assert.deepEqual(r.t, []); assert.deepEqual(r.i, []); assert.ok(r.n.every(n => n > 0), String(r.n)); assert.equal(r.cam, true); assert.deepEqual(r.eye, [0.55, 2.62, -4.28]);
  assert.ok(r.st.interior.tris > 0 && r.st.exterior.tris > 0, JSON.stringify(r.st));
}));
test('走行中に画質を 6 回切り替えても、車両は動き続け、形とテクスチャが増え続けない', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60);
    INP.tGas = 1; for (let i = 0; i < 300; i++) simTick(1 / 60);
    const mem = []; for (const q of ['low', 'high', 'mid', 'high', 'low', 'high']) { setQuality(q); await __t.frames(2); mem.push([renderer.info.memory.geometries, renderer.info.memory.textures]); }
    for (let i = 0; i < 60; i++) simTick(1 / 60); await __t.frames(2);
    return { mem, link: TR.link, v: TR.v, cam: cabCam.parent === INT.eye, inScene: TRK.root.parent === scene, mir: ['L', 'R'].map(k => { let p = MIRROR.cams[k].parent; while (p && p !== TRK.root) p = p.parent; return !!p; }),
      trl: TRL.root.visible && TRL.root.parent === scene, roots: scene.children.filter(o => o === TRK.root).length, pbr: VEH.pbr, tris: vehicleStats().exterior.tris };
  });
  assert.equal(r.link, 'coupled'); assert.ok(r.v > 3, String(r.v)); assert.deepEqual([r.cam, r.inScene, r.trl, r.roots, r.pbr], [true, true, true, 1, true]); assert.deepEqual(r.mir, [true, true]);
  assert.ok(r.mem[5][0] <= r.mem[1][0] * 1.05 && r.mem[5][1] <= r.mem[1][1] * 1.05, JSON.stringify(r.mem)); assert.deepEqual(errors, []);
}));
test('V9 外の視点では細かい部品を描かず、車内視点では描く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => { GAME.cam = 'cab'; await __t.frames(2); const a = [INT.fine.visible, INT.shell.visible]; GAME.cam = 'chase'; await __t.frames(2); return [a, [INT.fine.visible, INT.shell.visible], INT.fine.children.length > 0, INT.shell.children.length > 0]; });
  assert.deepEqual(r, [[true, true], [false, true], true, true]);
}));

test('V6 外装色 4 × 仕様 2 × 内装 3 のどれに切り替えても描ける。仕様で屋根のランプが入れ替わる', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => { const out = [];
    for (const trim of ['normal', 'custom']) for (const paint of ['white', 'blue', 'red', 'silver']) for (const th of ['black', 'beige', 'red']) {
      document.querySelector(`#trimSeg2 [data-v="${trim}"]`).click(); document.querySelector(`#paintSeg2 [data-v="${paint}"]`).click(); document.querySelector(`#intSeg2 [data-v="${th}"]`).click();
      await __t.frames(1); out.push([trimName, paintName, interiorName, TRK.deco.visible, TRK.lightbar.length].join());
    }
    return { out, saved: JSON.parse(localStorage.getItem('nlh.trim')), pressed: document.querySelector('#trimSeg [data-v="custom"]').getAttribute('aria-pressed') };
  });
  assert.equal(r.out.length, 24); assert.ok(r.out.every(s => /^normal,.*,false,0$/.test(s) || /^custom,.*,true,[1-9]\d*$/.test(s)), r.out.join(' | '));
  assert.equal(r.saved, 'custom'); assert.equal(r.pressed, 'true'); assert.deepEqual(errors, []);
}));
test('基準の視点 9 つを当てられ、車内の視点では細かい部品が描かれる', () => withGame({}, async (page, errors) => {
  await startJob(page); const { REFVIEWS, applyRefView } = await import('./refviews.mjs'); assert.equal(Object.keys(REFVIEWS).length, 9);
  for (const id of ['R1', 'R4']) { await applyRefView(page, id);
    const r = await page.evaluate(() => [INT.fine.visible, paintName, trimName, interiorName, TR.link, Math.round(chaseCam.fov)]);
    assert.deepEqual(r, id === 'R1' ? [true, r[1], r[2], 'black', r[4], 85] : [false, 'red', 'custom', r[3], 'free', 40]); }
  assert.deepEqual(errors, []);
}));

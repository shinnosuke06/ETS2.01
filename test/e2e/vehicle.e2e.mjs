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

// ---- cab interior: parts in place ----
const cabin = b => b[0] >= -1.2 && b[3] <= 1.2 && b[1] >= 1.40 && b[4] <= 3.85 && b[2] >= -5.35 && b[5] <= -3.15;
const partsOf = page => page.evaluate(() => vehicleStats().parts);
test('室内の前：ダッシュ、ひさし、センターパネルが決まった場所と大きさにある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['floor', 'dash', 'hood', 'centerPanel', 'sidePanel', 'vents', 'table', 'etc']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  assert.ok(P.dash.box[4] <= 2.42 && P.dash.box[4] >= 2.28 && P.dash.box[3] - P.dash.box[0] > 2.2, String(P.dash.box)); assert.ok(P.hood.box[4] <= 2.47, String(P.hood.box));
  assert.ok(P.dash.tris <= 9000 && P.hood.tris <= 3000 && P.centerPanel.tris <= 6000, JSON.stringify([P.dash.tris, P.hood.tris, P.centerPanel.tris]));
}));
// from the eye, a ray through screen point (u, v) (-1..1): the first thing shown that it hits
const firstHit = (page, fov, aspect, pts) => page.evaluate(([fov, aspect, pts]) => {
  GAME.cam = 'cab'; setCabDetail(true); TRK.root.updateMatrixWorld(true); cabCam.fov = fov; cabCam.aspect = aspect; cabCam.rotation.set(-0.18, 0, 0); cabCam.updateProjectionMatrix(); cabCam.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); return pts.map(([u, v]) => { rc.setFromCamera({ x: u, y: v }, cabCam); const h = __t.first(rc, TRK.root);
    return h ? { d: +h.distance.toFixed(2), glass: h.object.material === TM.glassIn || h.object.material === TM.glassOut, screen: h.object === INT.cluster ? 'cluster' : h.object === INT.nav ? 'nav' : null } : null; });
}, [fov, aspect, pts]);
test('V11 目の前：正面の視線はフロントガラスまで何にも当たらず、2 つの画面が見える', () => withGame({}, async page => {
  const [c] = await firstHit(page, 64, 16 / 9, [[0, 0.33]]); assert.ok(c === null || c.glass, JSON.stringify(c));
  const scr = await page.evaluate(() => { setCabDetail(true); TRK.root.updateMatrixWorld(true); const eye = INT.eye.getWorldPosition(new THREE.Vector3()), rc = new THREE.Raycaster();
    return [INT.cluster, INT.nav].map(m => { const c = m.getWorldPosition(new THREE.Vector3()); rc.set(eye, c.clone().sub(eye).normalize()); const h = __t.first(rc, TRK.root); return h && h.object === m; }); });
  assert.deepEqual(scr, [true, true]);
}));
test('縦持ち（視野 80°）でも、計器が画面に入り、前の道路が隠れない', () => withGame({ width: 390, height: 844, touch: true }, async page => {
  const r = await page.evaluate(() => { GAME.cam = 'cab'; TRK.root.updateMatrixWorld(true); cabCam.fov = 80; cabCam.aspect = 390 / 844; cabCam.rotation.set(-0.18, 0, 0); cabCam.updateProjectionMatrix(); cabCam.updateMatrixWorld(true);
    return INT.cluster.getWorldPosition(new THREE.Vector3()).project(cabCam).toArray(); });
  assert.ok(Math.abs(r[0]) < 0.9 && Math.abs(r[1]) < 0.9, String(r));
  const road = await firstHit(page, 80, 390 / 844, [[0, 0.1], [-0.5, 0.1], [0.4, 0.1]]); for (const h of road) assert.ok(h === null || h.glass, JSON.stringify(road));
}));
test('室内の前：ハンドルは直径 0.45、ドアとピラーは室内に収まる', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['wheel', 'stalks', 'pedals', 'doorR', 'doorL', 'pillars', 'grabs']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  const w = P.wheel.box, d = Math.max(w[3] - w[0], w[4] - w[1], w[5] - w[2]); assert.ok(Math.abs(d - 0.45) < 0.02, String(d)); assert.ok(Math.abs((w[0] + w[3]) / 2 - 0.55) < 0.03, String(w));
  assert.ok(P.doorR.box[3] > 1.1 && P.doorL.box[0] < -1.1, JSON.stringify([P.doorR.box, P.doorL.box])); assert.ok(P.wheel.tris <= 5000 && P.doorR.tris <= 4500, JSON.stringify([P.wheel.tris, P.doorR.tris]));
}));
test('ハンドルとペダルは、今までどおり動く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    const a = [INT.wheel.rotation.z, INT.gas.rotation.x, INT.brake.rotation.x]; INP.tWheelHeld = true; INP.tWheel = 1.5; INP.tGas = 1; for (let i = 0; i < 30; i++) simTick(1 / 60); await __t.frames(2);
    return [a, [INT.wheel.rotation.z, INT.gas.rotation.x, INT.brake.rotation.x]]; });
  assert.ok(Math.abs(r[1][0] - r[0][0]) > 0.5 && Math.abs(r[1][1] - r[0][1]) > 0.1, JSON.stringify(r));
}));
test('室内の後ろ：背の高いシートが 2 脚、間にコンソールがある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['seatD', 'seatP', 'belts', 'console']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  for (const [k, x] of [['seatD', 0.55], ['seatP', -0.6]]) { const b = P[k].box; assert.ok(Math.abs((b[0] + b[3]) / 2 - x) < 0.05, `${k} centre ${b}`); assert.ok(b[4] >= 2.85 && b[4] <= 2.95, `${k} top ${b[4]}`); assert.ok(P[k].tris <= 9000, `${k} tris ${P[k].tris}`); }
  assert.ok(P.console.box[0] >= -0.3 && P.console.box[3] <= 0.25, String(P.console.box));
}));
test('運転席の背もたれと頭の部分は、目の後ろにある（目をふさがない）', () => withGame({}, async page => {
  const P = await partsOf(page); assert.ok(P.seatDBack && P.seatDBack.box[2] > -4.28 + 0.08, JSON.stringify(P.seatDBack));
}));

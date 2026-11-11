// The tractor and cab model: materials, lighting, structure, budgets and the trim switch.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, luma } from './helpers.mjs';

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
test('室内の後ろ：頭上の棚、ベッド、後ろの収納が決まった高さにある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['shelf', 'visors', 'ceiling', 'bed', 'drawers', 'rearWall', 'lockers', 'curtains', 'small']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  assert.ok(P.shelf.box[1] >= 3.30 && P.lockers.box[1] >= 3.20 && Math.abs(P.bed.box[4] - 2.13) < 0.06, JSON.stringify([P.shelf.box, P.lockers.box, P.bed.box]));
}));
test('V4 室内の上限：三角形と素材の数。画質を下げると三角形が減る', async () => { const tris = [];
  for (const [q, max] of [['high', 100000], ['mid', 60000], ['low', 35000]]) await withGame({ storage: { 'nlh.quality': q } }, async page => {
    const s = await page.evaluate(() => vehicleStats().interior); tris.push(s.tris); assert.ok(s.tris <= max, `${q} ${s.tris}`); assert.ok(s.mats <= 24, `${q} mats ${s.mats}`); });
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2], String(tris)); });
test('夜の赤い間接照明は、足元と頭上の両方で点く', () => withGame({}, async page => {
  const r = await page.evaluate(() => { setCabAmbient(false); const off = IM.ambient.color.r; setCabAmbient(true); const P = vehicleStats().parts; return [off, IM.ambient.color.r, !!P.shelf, !!P.floor]; });
  assert.ok(r[1] > r[0] * 2 && r[2] && r[3], String(r));
}));
test('車内で見回しても、面の欠けや穴から外が見えない', () => withGame({}, async page => {
  const holes = await page.evaluate(() => { GAME.cam = 'cab'; setCabDetail(true); TRK.root.updateMatrixWorld(true);
    const eye = INT.eye.getWorldPosition(new THREE.Vector3()), q = TRK.root.getWorldQuaternion(new THREE.Quaternion()), rc = new THREE.Raycaster(), out = [];
    for (let yaw = -140; yaw <= 140; yaw += 5) for (let pitch = -35; pitch <= 35; pitch += 5) {
      const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180, dir = new THREE.Vector3(-Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)).applyQuaternion(q);   // the tractor's front is -z
      rc.set(eye, dir); const h = __t.first(rc, TRK.root);
      if (!h || h.distance > 3.2) out.push([yaw, pitch, h ? +h.distance.toFixed(2) : 'none']);   // nothing in the cab is 3.2 m away; glass counts as a hit
    }
    return out; });
  assert.deepEqual(holes, []);
}));
test('夜とトンネルの車内は、真っ黒にならず、昼より暗い', () => withGame({}, async page => {
  await startJob(page);
  // todT = 0: apply the new time on the next frame (it is otherwise re-applied every half second of game time)
  const set = h => page.evaluate(async h => { GAME.cam = 'cab'; INP.lookYaw = 0; INP.lookPitch = -0.18; GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + h * 3600; GAME.todT = 0; await __t.frames(12); }, h);
  const dash = [[0.25, 0.05, 0.75, 0.35]];   // the bottom of the picture: dash and wheel
  await set(12); const [day] = await luma(page, dash); await set(21); const [night] = await luma(page, dash);
  assert.ok(day > 25 && day < 200, `day ${day}`); assert.ok(night > 6 && night < day * 0.8, `night ${night} day ${day}`);
  const tun = await page.evaluate(async () => { GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 12 * 3600; const t = TUNNELS[0]; placeTruck((t.s0 + t.s1) / 2, X_TRV, 0, { coupled: false }); await __t.frames(40); return GAME.tunnelBlend; });
  assert.ok(tun > 0.8, String(tun)); const [inTun] = await luma(page, dash); assert.ok(inTun > 6 && inTun < day, `tunnel ${inTun} day ${day}`);
}));

// ---- exterior ----
test('外観：キャブの部品があり、外寸は今のまま', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['cabShell', 'roofKit', 'doors', 'steps', 'arches', 'sideFins', 'windows', 'mirrors', 'rearPanel', 'hoses']) assert.ok(P[k] && P[k].tris > 0, k);
  const c = P.cabShell.box; assert.ok(Math.abs(c[2] + 5.48) < 0.03 && Math.abs(c[5] + 3.12) < 0.03 && Math.abs(c[3] - c[0] - 2.5) < 0.02 && Math.abs(c[4] - 4.02) < 0.02, String(c));
  assert.ok(P.roofKit.box[4] <= 4.10 && P.sideFins.box[5] <= -3.12 + 0.34 && P.steps.box[3] <= 1.30 && P.steps.box[0] >= -1.30, JSON.stringify([P.roofKit.box, P.sideFins.box, P.steps.box]));
}));
test('映る鏡のカメラは、新しい導風板やミラーの殻にふさがれない', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => { INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60); updateVisuals(0.016); scene.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(); return ['L', 'R'].map(k => { const cam = MIRROR.cams[k]; cam.updateMatrixWorld(true); const out = [];
      for (const [u, v] of [[0, 0], [0.5, -0.3], [-0.5, -0.3], [0, -0.6]]) { rc.setFromCamera({ x: u, y: v }, cam); const h = __t.first(rc, TRK.root); out.push(h ? +h.distance.toFixed(2) : null); }
      return out; }); });
  for (const side of r) assert.ok(side.filter(d => d !== null && d < 3).length <= 1, JSON.stringify(r));   // of four rays, at most one meets the own truck within 3 m
}));
test('外観：前まわりの部品があり、前端は今のまま、灯火は今までどおり点く', () => withGame({}, async page => {
  await startJob(page); const P = await partsOf(page);
  for (const k of ['grille', 'bumper', 'headlamps', 'fogs', 'spoiler', 'visor', 'wipers', 'plateF']) assert.ok(P[k] && P[k].tris > 0, k);
  assert.ok(Math.min(P.bumper.box[2], P.grille.box[2], P.visor.box[2]) >= -5.75, 'front end'); const gw = P.grille.box[3] - P.grille.box[0]; assert.ok(gw > 1.7 && gw < 1.9, String(gw));
  const r = await page.evaluate(async () => { GAME.lights = true; GAME.hazard = true; await __t.frames(3); return [TRK.heads.length, TRK.heads.every(m => m.material === TM.headOn), TRK.blinkL.length > 0 && TRK.blinkR.length > 0, TRK.wipers.length]; });
  assert.ok(r[0] >= 2 && r[1] && r[2] && r[3] === 2, JSON.stringify(r));
}));
test('外観：シャシーと車輪の部品があり、車輪は今までどおり回り、後輪は路面に残る', () => withGame({}, async page => {
  await startJob(page); const P = await partsOf(page);
  for (const k of ['frame', 'catwalk', 'fifthWheel', 'tankFuel', 'tankUrea', 'battery', 'muffler', 'skirts', 'fenders', 'tailLamps', 'flaps', 'plateR', 'wheelF', 'wheelR']) assert.ok(P[k] && P[k].tris > 0, k);
  const f = P.fifthWheel.box; assert.ok(Math.abs((f[2] + f[5]) / 2 + 0.35) < 0.08 && Math.abs(f[4] - 1.23) < 0.03, String(f));
  assert.ok(Math.abs(P.wheelF.box[4] - 1.04) < 0.02 && P.wheelF.box[1] > -0.01, String(P.wheelF.box)); assert.ok(P.fenders.box[3] <= 1.28 && P.skirts.box[1] >= 0.40, JSON.stringify([P.fenders.box, P.skirts.box]));
  const r = await page.evaluate(async () => { const a = TRK.spin[0].rotation.x; INP.tGas = 1; for (let i = 0; i < 240; i++) simTick(1 / 60); await __t.frames(2); return [TRK.spin.length, TRK.steer.length, TRK.rear.length, Math.abs(TRK.spin[0].rotation.x - a) > 0.5]; });
  assert.deepEqual(r, [4, 2, 2, true]);
}));
test('V10 外寸：トラクターの形は決まった箱に収まる', () => withGame({}, async page => {
  const P = await partsOf(page), ext = Object.entries(P).filter(([k, p]) => p.group === 'exterior' && !['mirrors', 'lightBar', 'markers'].includes(k)).map(([, p]) => p.box);
  const w = Math.max(...ext.map(b => b[3])) - Math.min(...ext.map(b => b[0])), front = Math.min(...ext.map(b => b[2])), top = Math.max(...ext.map(b => b[4]));
  assert.ok(w >= 2.50 && w <= 2.60, `width ${w}`); assert.ok(front <= -5.60 && front >= -5.75, `front ${front}`); assert.ok(top >= 4.00 && top <= 4.10, `top ${top}`);
}));

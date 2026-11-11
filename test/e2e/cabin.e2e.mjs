// The cab interior: parts in place, the view from the seat, budgets, light at night.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, luma } from './helpers.mjs';

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
test('V4 上限：画質ごとの三角形、部品の数、素材の数', async () => { for (const [q, inMax, exMax] of [['high', 100000, 60000], ['mid', 60000, 36000], ['low', 35000, 21000]])
  await withGame({ storage: { 'nlh.quality': q, 'nlh.trim': 'custom' } }, async (page, errors) => { await startJob(page);
    const s = await page.evaluate(async () => { GAME.cam = 'cab'; await __t.frames(3); return vehicleStats(); });
    assert.ok(s.interior.tris <= inMax && s.exterior.tris <= exMax, `${q} ${s.interior.tris} ${s.exterior.tris}`); assert.ok(s.exterior.tris >= exMax * 0.4, `${q} too coarse`);
    assert.ok(s.interior.meshes + s.exterior.meshes <= 110, `${q} meshes ${s.interior.meshes + s.exterior.meshes}`); assert.ok(s.interior.mats <= 24 && s.exterior.mats <= 30, `${q} mats ${s.interior.mats} ${s.exterior.mats}`); assert.deepEqual(errors, []); }); });
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

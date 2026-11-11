// The tractor exterior: cab, front, chassis and wheels, outer size, the custom trim.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob } from './helpers.mjs';

const partsOf = page => page.evaluate(() => vehicleStats().parts);

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
test('飾り付き：屋根のランプ 6 個がライトと一緒に点き、スラットはメッキ、線模様は外装色に合わせて変わる', () => withGame({ storage: { 'nlh.trim': 'custom', 'nlh.paint': 'white' } }, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => { const P = vehicleStats().parts;
    GAME.lights = true; await __t.frames(3); const lit = TRK.lightbar.length === 6 && TRK.lightbar.every(m => m.material === TM.headOn);
    const px = () => { const c = TM.livery.map.image, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [Math.round(r / n), Math.round(g / n), Math.round(b / n), n / (c.width * c.height)]; };
    const white = px(), metal = TM.trim.metalness; applyPaint('red'); const red = px(); applyTrim('normal', TRK); await __t.frames(2);
    return { parts: ['lightBar', 'markers', 'nutCaps', 'livery'].every(k => P[k] && P[k].tris > 0), top: P.lightBar.box[4], lit, white, red, metal, plain: [TM.trim.metalness, TRK.deco.visible, TRK.lightbar.length, TRK.decoExtra.every(g => !g.visible)] }; });
  assert.ok(r.parts && r.lit && r.top <= 4.38, JSON.stringify(r)); assert.equal(r.metal, 1); assert.deepEqual(r.plain, [0, false, 0, true]);
  assert.ok(Math.abs(r.white[0] - 0x1b) < 12 && Math.abs(r.white[2] - 0x4a) < 12, String(r.white)); assert.ok(Math.abs(r.red[0] - 0xd4) < 12 && Math.abs(r.red[2] - 0x37) < 12, String(r.red));
  assert.ok(r.white[3] > 0.01 && r.white[3] < 0.2, `coverage ${r.white[3]}`); assert.deepEqual(errors, []);
}));

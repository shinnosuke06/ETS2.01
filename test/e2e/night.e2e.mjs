// The night: road lamps and their light on the road, reflectors and signs in the headlights, the cars' lights,
// town lamps, the cost of it all.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// In the page: the rig at (s, lat), the clock at `hour`, the road around built, the lights updated.
const atNight = (page, s, lat, hour = 22) => page.evaluate(async ([s, lat, hour]) => {
  INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
  GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + hour * 3600;
  placeTruck(s, lat, 0, { coupled: true }); await __ready(); __clearRoad(s - 800, s + 800);
  for (let i = 0; i < 10; i++) simTick(1 / 60);
  GAME.todT = 0; updateLighting(0.016); updateVisuals(0.016); nightUpdate(); await __t.frames(2);
}, [s, lat, hour]);
// In the page: render the scene from a camera at road point (s, lat, height y) looking at (s2, lat2, 0); mean and max
// brightness of the screen rectangle [x0, y0, x1, y1] (fractions, (0, 0) bottom left); the rig's headlight beam off.
const LOOK = `window.__look = (s, lat, y, s2, lat2, rect) => {
  const cam = new THREE.PerspectiveCamera(60, renderer.domElement.width / renderer.domElement.height, 0.1, 3000), p = posAt(s, lat, {}), q = posAt(s2, lat2, {});
  cam.position.set(p.x, p.y + y, p.z); cam.lookAt(q.x, q.y, q.z); cam.updateMatrixWorld();
  const spot = TRK.spot.intensity; TRK.spot.intensity = 0; renderer.render(scene, cam); TRK.spot.intensity = spot;
  const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, [x0, y0, x1, y1] = rect;
  const X = Math.floor(x0 * w), Y = Math.floor(y0 * h), W = Math.max(1, Math.floor((x1 - x0) * w)), H = Math.max(1, Math.floor((y1 - y0) * h)), px = new Uint8Array(W * H * 4);
  gl.readPixels(X, Y, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let sum = 0, max = 0, bright = 0; for (let i = 0; i < px.length; i += 4) { const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]; sum += l; if (l > max) max = l; if (l > 140) bright++; }
  return { mean: sum / (W * H), max, bright };
};
// a mainline point with no lamp zone within 300 m, in the country
window.__darkS = () => { for (let s = S0 + 2000; s < ROUTE_END - 2000; s += 50) if (!LAMP_ZONES.some(z => s > z.s0 - 300 && s < z.s1 + 300) && regionAt(s, {}).town < 0.3 && !tunnelAt(s, 300) && !OVERPASSES.some(o => Math.abs(o.s - s) < 300)) return s; return null; };`;

test('E6 夜：IC の近くの路面は山の中の路面より明るい（明るさの差 12 以上）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(LOOK);
  const ic = await page.evaluate(() => RAMPS.find(r => r.ic.i === 4).sDiv - 40);
  await atNight(page, ic + 300, -7.65);
  const lit = await page.evaluate(s => __look(s - 30, -7, 14, s + 30, -7, [0.3, 0.2, 0.7, 0.6]), ic);
  const dark = await page.evaluate(() => __darkS());
  assert.ok(dark, 'a dark stretch');
  await atNight(page, dark + 300, -7.65);
  const unlit = await page.evaluate(s => __look(s - 30, -7, 14, s + 30, -7, [0.3, 0.2, 0.7, 0.6]), dark);
  assert.ok(lit.mean - unlit.mean >= 12, JSON.stringify({ lit, unlit }));
  assert.deepEqual(errors, []);
}));

test('E6 ライトの前の反射板は光り、ライトを後ろへ向けると光らない', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(LOOK);
  const s = await page.evaluate(() => __darkS());
  await atNight(page, s, -7.65);
  const r = await page.evaluate(s => {
    const view = () => __look(s - 4, -9, 1.6, s + 60, -12.3, [0.0, 0.3, 0.6, 0.7]);
    const front = view();
    NIGHT_U.uDir.value.multiplyScalar(-1); const back = view();
    NIGHT_U.uLit.value = 0; const off = view();
    return { front, back, off, lit: GAME.lampsOn };
  }, s);
  assert.ok(r.lit, 'the headlights are on at night');
  assert.ok(r.front.bright >= r.back.bright + 4 && Math.abs(r.back.bright - r.off.bright) <= 2, JSON.stringify(r));   // the reflectors ahead light up
  assert.deepEqual(errors, []);
}));

test('E6 前の車の尾灯の光の点が夜に見え、昼は隠れる', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await atNight(page, await page.evaluate(() => S0 + 2000), -7.65);
  const r = await page.evaluate(async () => {
    const car = CARS.find(c => c.hidden); setCarType(car, 'sedan'); car.dir = 1; car.lane = 0; car.lc = null; car.s = TR.s + 40; car.x = laneX(1, 0); car.v = car.v0 = 0; car.hidden = false; car.grp.visible = true;
    updateCarVisuals(1); nightUpdate();
    const night = { shown: CAR_GLOW.pts.visible, n: CAR_GLOW.pts.geometry.drawRange.count, beams: CAR_GLOW.beams.count };
    GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 12 * 3600; GAME.todT = 0; updateLighting(0.016); nightUpdate();
    return { night, day: CAR_GLOW.pts.visible };
  });
  assert.ok(r.night.shown && r.night.n >= 4 && r.night.beams >= 1, JSON.stringify(r)); assert.equal(r.day, false);
  assert.deepEqual(errors, []);
}));

test('夜の毎フレームの仕事（nightUpdate）は 0.5 ms 以内（60 回の平均）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await atNight(page, await page.evaluate(() => S0 + 2000), -7.65);
  const ms = await page.evaluate(() => { for (let i = 0; i < 10; i++) nightUpdate(); const t0 = performance.now(); for (let i = 0; i < 60; i++) nightUpdate(); return (performance.now() - t0) / 60; });
  assert.ok(ms <= 0.5, `${ms.toFixed(3)} ms`);
  assert.deepEqual(errors, []);
}));

test('画質「低」では本線の模様を描かず、IC の模様は描く', async () => {
  for (const q of ['low', 'high']) await withGame({ storage: { 'nlh.quality': q } }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => {
      // a road chunk lit only by the town-like stretches' lamps, and one by an interchange's
      const only = kind => { for (let k = 15; k < ROUTE_LEN / CHUNK - 5; k++) { const ls = lampsIn(k * CHUNK, (k + 1) * CHUNK); if (ls.length > 4 && ls.every(l => l.kind === kind)) return k * CHUNK + 100; } return null; };
      const urban = only('urban'), ic = only('ic');
      const pools = s => { placeTruck(s, X_TRV, 0, { coupled: false }); updateChunks(s, 99); const c = chunks.get(Math.floor(s / CHUNK)); let n = 0; c.grp.traverse(o => { if (o.userData.pools) n += o.count; }); return n; };
      return { urban: urban != null ? pools(urban) : null, ic: pools(ic) };
    });
    if (q === 'low') { assert.equal(r.urban, 0, JSON.stringify(r)); assert.ok(r.ic > 0, JSON.stringify(r)); }
    else assert.ok(r.urban > 0 && r.ic > 0, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('町の夜：大通りの街灯と倉庫の投光器が光る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 22 * 3600; GAME.todT = 0; updateLighting(0.016); nightUpdate();
    const M = TOWN_MESH.get(0); let pools = 0; M.grp.traverse(o => { if (o.isInstancedMesh && o.material === RS_MAT.pool) pools += o.count; });
    return { lamps: M.parts.lamps || 0, pools, head: RS_MAT.lampHead.color.getHexString(), poolOp: RS_MAT.pool.opacity };
  });
  assert.ok(r.lamps > 0 && r.pools >= 10, JSON.stringify(r)); assert.ok(r.poolOp > 0.3 && r.head !== '7d8388', JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('夜の IC と SA の中で、昼より増える三角形と描く回数が限られている（描く回数 +80、三角形 +60,000 まで）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const out = {};
  for (const name of ['ic', 'sa']) {
    out[name] = await page.evaluate(async name => {
      if (name === 'ic') { const r = RAMPS.find(x => x.ic.i === 4); placeTruck(r.sDiv - 40, X_TRV, 0, { coupled: false }); }
      else __placeSa(0, 250, 23, 1, 0, 0, false);
      await __ready(); __clearRoad(TR.s - 800, TR.s + 800); setCam('cab');
      const at = async h => { GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + h * 3600; GAME.todT = 0; updateLighting(0.016); updateVisuals(0.016); nightUpdate(); updateCamera(0.016); renderer.render(scene, activeCam); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
      const day = await at(12), night = await at(22);
      return { day, night };
    }, name);
  }
  for (const k of ['ic', 'sa']) {
    const { day, night } = out[k];
    assert.ok(night.calls - day.calls <= 80 && night.tris - day.tris <= 60000, `${k} ${JSON.stringify(out[k])}`);
  }
  assert.deepEqual(errors, []);
}));

test('nightUpdate の中で例外が出ても運転が続き、コンソールに 1 行だけ出る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await atNight(page, await page.evaluate(() => S0 + 2000), -7.65);
  const r = await page.evaluate(async () => {
    let warns = 0; const w0 = console.warn; console.warn = (...a) => { if (/night lights/.test(a[0])) warns++; w0(...a); };
    CAR_GLOW.pts.geometry.attributes.position = null;   // broken
    const s0 = TR.s; for (let n = 0; n < 120; n++) { INP.tGas = 0.5; simTick(1 / 60); nightUpdate(); } INP.tGas = 0;
    await __t.frames(3);
    console.warn = w0;
    return { warns, moved: TR.s - s0, state: GAME.state };
  });
  assert.equal(r.warns, 1); assert.ok(r.moved > 1 && r.state === 'drive', JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

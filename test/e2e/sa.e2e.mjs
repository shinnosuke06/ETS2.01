// The service areas in the game: built in short steps as the rig comes near, their look, driving through them,
// and (later tasks) refuelling, naps and the rescue.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// In the page: the job's trailer coupled, then the rig in service area k's deceleration lane at u (heading along it), ready.
const atLane = async (page, k = 0, u = 100, kmh = 15) => {
  await startJob(page); await driveHelpers(page);
  await page.evaluate(async ([k, u, kmh]) => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const a = SAS[k]; __clearRoad(a.sDiv - 400, a.sEnd + 400);
    placeTruck(a.sDiv + u, saExitEdges(u, {}).cx, kmh / 3.6, { coupled: true }); await __ready();
  }, [k, u, kmh]);
};

test('SA を作る仕事は 1 回 30 ms 以内に分かれ、90 km/h で来ても分かれ目に着く前にでき上がる', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    // every step on its own
    const L = saLayout(0), times = [], it = saGridSteps(L); let G;
    for (;;) { const t = performance.now(), x = it.next(); times.push(performance.now() - t); if (x.done) { G = x.value; break; } }
    saAdd(0, L, G);
    const m = saMeshSteps(0);
    for (;;) { const t = performance.now(), x = m.next(); times.push(performance.now() - t); if (x.done) break; }
    saMeshDispose(0); saUnload(0);
    // and coming in at 90 km/h, the work done a little each frame
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const a = SAS[0]; __clearRoad(a.sDiv - 2000, a.sEnd);
    placeTruck(a.sDiv - 1700, X_TRV, 25, { coupled: true }); GAME.state = 'loading';
    await (async () => { let left = 1; while (left) { left = updateChunks(TR.s, 4) + townsTick(200); await __t.frames(1); } })(); GAME.state = 'drive';
    const steer = () => clamp(0.35 * (X_TRV - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * (0.4 + Math.abs(TR.v) / 25), -1, 1);
    let worst = 0, slow = 0, ready = null;
    for (let n = 0; n < 60 * 120 && TR.s < a.sDiv; n++) {
      INP.tGas = TR.v * 3.6 < 88 ? 1 : 0; INP.tBrake = 0; INP.tWheelHeld = true; INP.tWheel = Math.sign(steer()) * Math.pow(Math.abs(steer()), 1 / 1.35) * 2.6;
      simTick(1 / 60); updateChunks(TR.s, 1);
      const t0 = performance.now(); saTick(6); const dt = performance.now() - t0;
      worst = Math.max(worst, dt); if (dt > 40) slow++;
    }
    ready = SA_LOADED.has(0) && SA_MESH.has(0);
    INP.tGas = 0; INP.tWheelHeld = false;
    return { max: Math.max(...times), n: times.length, worst, slow, ready, s: TR.s - a.sDiv };
  });
  assert.ok(r.n > 8 && r.max <= 30, JSON.stringify(r)); assert.ok(r.ready && r.slow <= 1, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('中井 SA：減速車線から入り、大型車の枠を通り抜け、給油の枠を通って、加速車線から本線に戻る（罰金・損傷なし）', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 15);
  const r = await page.evaluate(async () => {
    const A = SA_LOADED.get(0), L = A.layout, a = L.sa, st = L.stalls.find(s => !s.taken), E = {};
    const lead = []; for (let u = 100; u < 140; u += 5) lead.push([u, -saExitEdges(u, E).cx]);
    const tail = []; for (let u = 505; u <= 600; u += 5) tail.push([u, -saEntryEdges(u - 460, E).cx]);
    const uv = [...lead, ...saPath(L, 'in', { stall: st.id }), ...saPath(L, { stall: st.id }, { pump: 1 }).slice(1), ...saPath(L, { pump: 1 }, 'out').slice(1), ...tail];
    const zones = new Set(), path = uv.map(([u, v]) => { const p = posAt(a.sDiv + u, -v, {}); return [p.x, p.z]; });
    const t = __drive(path, 15, 300);
    for (let n = 0; n < 5; n++) { simTick(1 / 60); zones.add(TR.zone); }
    return { t, fines: GAME.job.fines, damage: TR.damage, link: TR.link, u: TR.s - a.sDiv, lat: TR.lat, zone: TR.zone };
  });
  assert.ok(r.u > 590 && r.zone === 'road', JSON.stringify(r));
  assert.equal(r.fines, 0, JSON.stringify(r)); assert.ok(r.damage < 0.5, JSON.stringify(r)); assert.equal(r.link, 'coupled');
  assert.deepEqual(errors, []);
}));

test('SA の中で、三角形と描く回数が画質ごとの上限に収まる（高 120,000・80、低は高の 6 割以下）', async () => {
  const got = {};
  for (const q of ['high', 'low']) await withGame({ storage: { 'nlh.quality': q } }, async (page, errors) => {
    await atLane(page, 0, 100, 0);
    got[q] = await page.evaluate(() => saStats(0));
    assert.deepEqual(errors, []);
  });
  console.log('SA stats', JSON.stringify(got));
  assert.ok(got.high.tris > 2000 && got.high.tris <= 120000 && got.high.meshes <= 80, JSON.stringify(got));
  assert.ok(got.low.tris <= got.high.tris * 0.6, JSON.stringify(got));
});

test('SA の 2km・1km・500m の案内と「SA 入口」の標識がある', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    const a = SAS[4], want = SIGNS.filter(g => g.sa === a), out = {};
    for (const g of want) {
      placeTruck(g.s, X_TRV, 0, { coupled: false }); updateChunks(g.s, 99);
      const k = Math.floor(g.s / CHUNK), c = chunks.get(k); let n = 0;
      c.grp.traverse(o => { if (o.userData.sign === g.t) n++; });
      out[g.t + (g.d || '')] = n;
    }
    return out;
  });
  for (const k of ['saAdv2km', 'saAdv1km', 'saAdv500m', 'saNose', 'saMerge', 'saNext']) assert.ok(r[k] >= 1, `${k} ${JSON.stringify(r)}`);
  assert.deepEqual(errors, []);
}));

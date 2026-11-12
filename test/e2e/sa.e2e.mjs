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

// ---- fuel, sleepiness, refuelling, naps, the rescue -------------------------------------------------------------
// In the page: the rig stopped in a slot of service area k ('pump' 0 or the first free 'stall'), the button updated.
const inSlot = (page, kind, k = 0) => page.evaluate(async ([kind, k]) => {
  const L = SA_LOADED.get(k).layout, s = kind === 'pump' ? L.pumps[0] : L.stalls.find(x => !x.taken);
  __placeSa(k, s.u, s.v, s.hu, s.hv, 0); for (let n = 0; n < 30; n++) simTick(1 / 60);
  const b = document.getElementById('bStop');
  return { shown: !b.hidden, text: b.textContent, kind: GAME.stopKind };
}, [kind, k]);
// Press the place button and wait until the fade is over (real frames run the fade).
const pressStop = page => page.evaluate(async () => {
  document.getElementById('bStop').click(); for (let n = 0; n < 4; n++) simTick(1 / 60);
  const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
  return { state: GAME.state, led: document.getElementById('ledText').textContent };
});

test('給油の枠で止まると「給油」が出て、押すと満タン、仕事の燃料代、時計 +10 分、電光板の文', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { TR.fuel = 0.2; });
  const b = await inSlot(page, 'pump');
  assert.deepEqual(b, { shown: true, text: '給油', kind: 'fuel' });
  const c0 = await page.evaluate(() => GAME.clock), r = await pressStop(page);
  const after = await page.evaluate(() => ({ fuel: TR.fuel, cost: GAME.job.fuelCost, n: GAME.job.fuelN, clock: GAME.clock }));
  assert.equal(r.state, 'drive'); assert.equal(r.led, '給油 96 L　13,440 円');
  assert.ok(after.fuel > 0.9999, `${after.fuel}`); assert.equal(after.cost, 13440); assert.equal(after.n, 1); assert.ok(Math.abs(after.clock - c0 - 600) < 3, `${after.clock - c0}`);
  assert.deepEqual(errors, []);
}));

test('空いている大型車の枠で止まると「仮眠」が出て、押すと眠気 0、時計 +30 分', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { GAME.sleepy = 0.8; });
  assert.deepEqual(await inSlot(page, 'stall'), { shown: true, text: '仮眠', kind: 'nap' });
  const c0 = await page.evaluate(() => GAME.clock), r = await pressStop(page);
  const after = await page.evaluate(() => ({ sleepy: GAME.sleepy, clock: GAME.clock }));
  assert.equal(r.led, '30 分の仮眠をとりました'); assert.ok(after.sleepy < 0.001, `${after.sleepy}`); assert.ok(Math.abs(after.clock - c0 - 1800) < 3);
  assert.deepEqual(errors, []);
}));

test('E2 燃料切れ：本線で燃料 0 → アクセルが効かず止まる → 「救援を呼ぶ」→ 燃料 20 L、時計 +60 分、結果の画面に「救援　-¥30,000」', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __clearRoad(S0 + 1500, S0 + 3500); placeTruck(S0 + 2000, X_TRV, 15, { coupled: true }); await __ready();
    TR.fuel = 0; const v0 = TR.v; let vmax = 0;
    for (let n = 0; n < 120; n++) { INP.tGas = 1; simTick(1 / 60); vmax = Math.max(vmax, TR.v); }
    INP.tGas = 0; for (let n = 0; n < 900 && Math.abs(TR.v) > 0.05; n++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    for (let n = 0; n < 10; n++) simTick(1 / 60);
    return { v0, vmax, led: document.getElementById('ledText').textContent, hazard: GAME.hazard, shown: !document.getElementById('bStop').hidden, text: document.getElementById('bStop').textContent };
  });
  assert.ok(r.vmax <= r.v0 + 0.01, JSON.stringify(r)); assert.equal(r.shown, true); assert.equal(r.text, '救援を呼ぶ'); assert.equal(r.hazard, true);
  const c0 = await page.evaluate(() => GAME.clock), p = await pressStop(page);
  const after = await page.evaluate(() => { const o = { fuel: TR.fuel, rescue: GAME.job.rescue, clock: GAME.clock }; completeJob({}); o.rows = document.getElementById('resRows').textContent; return o; });
  assert.equal(p.led, '救援が来ました　燃料 20 L');
  assert.ok(Math.abs(after.fuel - 20 / 120) < 1e-4, `${after.fuel}`); assert.equal(after.rescue, 30000); assert.ok(Math.abs(after.clock - c0 - 3600) < 3);
  assert.match(after.rows, /救援-¥30,000/);
  assert.deepEqual(errors, []);
}));

test('燃料切れでも、ブレーキで止まっていられ、救援のあと走り出せる（上り坂と加速車線の上）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    let hill = null; for (let s = S0 + 500; s < ROUTE_END - 500 && hill == null; s += 20) if (gradeAt(s) > 0.025 && !rampAt(s) && !entryAt(s) && !saAt(s) && !tunnelAt(s, 150)) hill = s;
    const out = {};
    for (const [name, s, lat] of [['hill', hill, X_TRV], ['band', ENTRIES[2].s0 + 330, entryEdges(330).cx]]) {
      __clearRoad(s - 300, s + 300); placeTruck(s, lat, 0, { coupled: true }); await __ready();
      TR.fuel = 0; const s0 = TR.s;
      for (let n = 0; n < 180; n++) { INP.tBrake = 0; INP.tGas = 0; simTick(1 / 60); }
      const moved = Math.abs(TR.s - s0), kind = GAME.stopKind;
      document.getElementById('bStop').click(); for (let n = 0; n < 4; n++) simTick(1 / 60);
      const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
      for (let n = 0; n < 300; n++) { INP.tGas = 1; simTick(1 / 60); } INP.tGas = 0;
      out[name] = { grade: gradeAt(s), moved, kind, v: TR.v, fuel: TR.fuel };
    }
    return out;
  });
  for (const k of ['hill', 'band']) {
    assert.ok(r[k].moved < 0.3 && r[k].kind === 'rescue', `${k} ${JSON.stringify(r[k])}`);
    assert.ok(r[k].v > 1.5 && r[k].fuel > 0, `${k} drives off ${JSON.stringify(r[k])}`);
  }
  assert.ok(r.hill.grade > 0.025);
  assert.deepEqual(errors, []);
}));

test('暗転の間のボタンとキーは効かない（給油を 2 回押しても代金は 1 回、メニュー・地図は開かない）', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await page.evaluate(() => { TR.fuel = 0.2; });
  await inSlot(page, 'pump');
  const r = await page.evaluate(async () => {
    const b = document.getElementById('bStop'); b.click(); simTick(1 / 60);
    b.click(); INP.actions.push('stop', 'menu', 'map', 'camera'); simTick(1 / 60);
    const cam = GAME.cam, t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
    for (let n = 0; n < 4; n++) simTick(1 / 60);
    return { n: GAME.job.fuelN, cost: GAME.job.fuelCost, state: GAME.state, menu: !document.getElementById('menuOv').hidden, map: !document.getElementById('mapOv').hidden, cam, camNow: GAME.cam };
  });
  assert.deepEqual({ n: r.n, cost: r.cost, state: r.state, menu: r.menu, map: r.map }, { n: 1, cost: 13440, state: 'drive', menu: false, map: false });
  assert.equal(r.camNow, r.cam);
  assert.deepEqual(errors, []);
}));

test('E3 開き直し：燃料と眠気が保存した値に戻る', async () => {
  let store;
  await withGame({}, async page => {
    await startJob(page);
    store = await page.evaluate(() => { TR.fuel = 0.37; GAME.sleepy = 0.42; for (let n = 0; n < 5; n++) simTick(1 / 60); careSave(); saveDrive(); return Object.fromEntries(['nlh.care', 'nlh.drive'].map(k => [k, JSON.parse(localStorage.getItem(k))])); });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => ({ fuel: TR.fuel, sleepy: GAME.sleepy }));
    assert.ok(Math.abs(r.fuel - 0.37) < 0.002 && Math.abs(r.sleepy - 0.42) < 0.002, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('サービスエリアの中で開き直しても、そこから走れる（地面の上、壁の外）', async () => {
  let store;
  await withGame({}, async page => {
    await atLane(page, 0, 100, 0);
    store = await page.evaluate(() => { __placeSa(0, 250, 23, 1, 0, 0); for (let n = 0; n < 10; n++) simTick(1 / 60); saveDrive(); careSave(); return Object.fromEntries(['nlh.care', 'nlh.drive'].map(k => [k, JSON.parse(localStorage.getItem(k))])); });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => {
      for (let n = 0; n < 5; n++) simTick(1 / 60);
      const a = SAS[0], c = {}, u0 = TR.s - a.sDiv, zone = TR.zone; let pen = 0;
      for (const [f, w] of [[5, 1.2], [5, -1.2], [-1, 1.2], [-1, -1.2]]) { GROUND.contact(TR.x + Math.sin(TR.h) * f + Math.cos(TR.h) * w, TR.z + Math.cos(TR.h) * f - Math.sin(TR.h) * w, TR.idx, c); pen = Math.max(pen, c.pen); }
      for (let n = 0; n < 240; n++) { INP.tGas = 0.4; simTick(1 / 60); } INP.tGas = 0;
      return { zone, u0, pen, moved: TR.s - a.sDiv - u0, damage: TR.damage };
    });
    assert.equal(r.zone, 'sa', JSON.stringify(r)); assert.ok(Math.abs(r.u0 - 250) < 1 && r.pen === 0, JSON.stringify(r));
    assert.ok(r.moved > 3 && r.damage < 0.1, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('古い保存（燃料・眠気・燃料代のない nlh.drive、nlh.care なし）でも始まる', async () => {
  let store;
  await withGame({}, async page => {
    await startJob(page);
    store = await page.evaluate(() => { saveDrive(); const d = JSON.parse(localStorage.getItem('nlh.drive')); for (const k of ['fuel', 'sleepy']) delete d[k]; for (const k of ['fuelCost', 'fuelN', 'rescue']) delete d.jp[k]; return { 'nlh.drive': d }; });
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(() => { for (let n = 0; n < 5; n++) simTick(1 / 60); return { fuel: TR.fuel, sleepy: GAME.sleepy, cost: GAME.job.fuelCost, rescue: GAME.job.rescue, n: GAME.job.fuelN }; });
    assert.ok(Math.abs(r.fuel - 0.82) < 0.002 && r.sleepy < 0.01 && r.cost === 0 && r.rescue === 0 && r.n === 0, JSON.stringify(r));
    assert.deepEqual(errors, []);
  });
});

test('E5 まばたき：眠気 0.95 で 30 秒のうちに画面が暗くなる、0.5 では暗くならない', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const ov = document.getElementById('blinkOv'), run = sl => { let max = 0; for (let n = 0; n < 1800; n++) { GAME.sleepy = sl; simTick(1 / 60); max = Math.max(max, +getComputedStyle(ov).opacity || 0); } return max; };
    return { high: run(0.95), low: run(0.5) };
  });
  assert.ok(r.high >= 0.5 && r.high <= 0.86, JSON.stringify(r)); assert.equal(r.low, 0, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('E9 場所のボタン：スマホの縦・横で、ほかのボタン・札・LED と重ならず画面に収まる', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) await withGame({ width, height, touch: true }, async (page, errors) => {
    await atLane(page, 0, 100, 0);
    await page.evaluate(() => { TR.fuel = 0.3; });
    await inSlot(page, 'pump');
    const r = await page.evaluate(async () => {
      led('給油 96 L　13,440 円'); setCam('chase'); await __t.frames(2);
      const box = el => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
      const stop = document.getElementById('bStop');
      return { stop: box(stop), shown: !stop.hidden, others: [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden && b !== stop).map(b => ({ name: b.textContent, ...box(b) })),
        fixed: ['jobSign', 'led', 'navCard', 'blinkPad', 'wheelPad', 'gearPad', 'pedalPad', 'speedo'].map(id => ({ name: id, el: document.getElementById(id) })).filter(o => o.el && !o.el.hidden).map(o => ({ name: o.name, ...box(o.el) })).filter(b => b.w > 0) };
    });
    const hits = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1, tag = `${width}x${height}`;
    assert.ok(r.shown && r.stop.w > 30, tag);
    assert.ok(r.stop.x >= 0 && r.stop.r <= width && r.stop.y >= 0 && r.stop.b <= height, `${tag}: off screen ${JSON.stringify(r.stop)}`);
    for (const b of [...r.others, ...r.fixed]) assert.ok(!hits(r.stop, b), `${tag}: overlaps ${b.name} ${JSON.stringify([r.stop, b])}`);
    assert.deepEqual(errors, []);
  });
});

test('燃料が 25% 未満、眠気が 0.5 を超えると、車の外の視点で小さな印が出る（15%・0.85 で赤）', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    setCam('chase');
    const look = (fuel, sleepy) => { TR.fuel = fuel; GAME.sleepy = sleepy; for (let n = 0; n < 40; n++) simTick(1 / 60); updateHud(1); const f = document.getElementById('icFuel'), s = document.getElementById('icSleep'); return [!f.hidden, f.classList.contains('red'), !s.hidden, s.classList.contains('red')]; };
    return { calm: look(0.6, 0.2), low: look(0.2, 0.6), worse: look(0.1, 0.9), cluster: clusterState() };
  });
  assert.deepEqual(r.calm, [false, false, false, false]); assert.deepEqual(r.low, [true, false, true, false]); assert.deepEqual(r.worse, [true, true, true, true]);
  assert.equal(r.cluster.fuelKm, 20); assert.ok(r.cluster.sleepy > 0.89);
  assert.deepEqual(errors, []);
}));

test('夜に仕事を終えて次の朝になると、眠気が 0 になる', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    GAME.clock = 20 * 3600; GAME.sleepy = 0.6; completeJob({});
    document.getElementById('nextBtn').click();
    const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 60000) await __t.frames(1);
    return { sleepy: GAME.sleepy, h: (GAME.clock / 3600) % 24 };
  });
  assert.ok(r.sleepy < 0.001, JSON.stringify(r)); assert.ok(r.h < 9, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('給油の枠で後ろからの視点にしても、給油所の屋根で画面がふさがらない（カメラが屋根より上なら屋根を隠す）', () => withGame({}, async (page, errors) => {
  await atLane(page, 0, 100, 0);
  await inSlot(page, 'pump');
  const r = await page.evaluate(async () => {
    setCam('chase'); await __t.frames(6);
    const gl = renderer.getContext(); renderer.render(scene, activeCam);
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(4 * 40 * 40);
    gl.readPixels(Math.floor(w / 2) - 20, Math.floor(h * 0.4) - 20, 40, 40, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let white = 0; for (let i = 0; i < px.length; i += 4) if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) white++;
    const roofShown = SA_MESH.get(0).roof.visible;
    setCam('cab'); await __t.frames(3);
    return { white: white / 1600, roofShown, roofCab: SA_MESH.get(0).roof.visible };
  });
  assert.ok(r.white < 0.5 && r.roofShown === false && r.roofCab === true, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

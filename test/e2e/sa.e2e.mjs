// The service areas in the game: built in short steps as the rig comes near, their look, driving through them,
// the canopy in the outside view, and the navigation to and through them (with the traffic at a merge).
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';
import { atLane, inSlot, job2At } from './sa-helpers.mjs';

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

// ---- the navigation to and through a service area, and the traffic at a merge ------------------------------------
test('E1 案内どおりに走る運転手が、中井 SA に入り、大型車の枠で「仮眠」、給油の枠で「給油」をして、出口から本線に戻る（罰金・損傷なし）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await job2At(page, 0, -2000, 80, 0.14, 0.75);   // 14% (under the 15% that starts the suggestion): about 31 true km, enough for the 2 km of game road and the car park
  const r = await page.evaluate(async () => {
    const a = SAS[0], E = {}, seen = [], W = pts => pts.map(([u, v]) => { const p = posAt(a.sDiv + u, -v, {}); return [p.x, p.z]; });
    const note = () => { const m = navState().maneuver, k = m && m.kind; if (k && seen[seen.length - 1] !== k) seen.push(k); return m; };
    const press = async () => { document.getElementById('bStop').click(); for (let n = 0; n < 4; n++) simTick(1 / 60); const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1); };
    // the travel lane at 80 km/h until the guidance says to leave, then the deceleration lane
    const steer = lat => clamp(0.35 * (lat - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * (0.4 + Math.abs(TR.v) / 25), -1, 1);
    for (let n = 0; n < 60 * 120 && TR.s < a.sDiv; n++) {
      const v = TR.v * 3.6; INP.tGas = clamp((80 - v) * 0.25, 0, 1); INP.tBrake = 0; INP.tWheelHeld = true; const st = steer(X_TRV); INP.tWheel = Math.sign(st) * Math.pow(Math.abs(st), 1 / 1.35) * 2.6;
      simTick(1 / 60); if (n % 15 === 0) { const m = note(); if (m && m.kind === 'saExit') break; }
    }
    await __ready();   // in the game the service area is built a little each frame; this drive runs without frames
    // near the edge line until the deceleration lane has opened (as a driver does), then along its middle
    const lane = [], u0 = TR.s - a.sDiv + 10; for (let u = u0; u < 140; u += 5) lane.push([u, u < 60 ? lerp(-TR.lat, 9.8, smooth(u0, u0 + 80, u)) : -saExitEdges(u, E).cx]);
    __drive(W(lane), 30, 60, false);
    const L = SA_LOADED.get(0).layout; let from = 'in';
    for (let step = 0; step < 4; step++) {
      const m = note(), t = NAV.saTarget;
      if (!t) break;
      const on = (path, o) => [...path, [o.u + o.hu * 4, o.v + o.hv * 4]];   // a little past the slot's centre, to come to rest straight in it
      if (t.kind === 'toStall') { __drive(W(on(saPath(L, from, { stall: t.id }), L.stalls[t.id])), 12, 120); from = { stall: t.id }; }
      else if (t.kind === 'toPump') { __drive(W(on(saPath(L, from, { pump: t.id }), L.pumps[t.id])), 12, 120); from = { pump: t.id }; }
      else if (t.kind === 'toOut') break;
      for (let n = 0; n < 10; n++) simTick(1 / 60);
      const k = note().kind;
      if (k === 'stopNap' || k === 'stopFuel') await press();
    }
    note();
    const out = []; for (let u = 505; u <= 620; u += 5) out.push([u, -saEntryEdges(u - 460, E).cx]);
    for (let u = 625; u <= 760; u += 5) out.push([u, u < 680 ? lerp(11.25, 7.65, (u - 620) / 60) : 7.65]);   // v = -lat: over to the travel lane
    __drive(W(saPath(L, from, 'out')), 15, 120, false); __clearRoad(TR.s - 300, TR.s + 600); __drive(W(out), 50, 120);
    for (let n = 0; n < 30; n++) { simTick(1 / 60); if (n % 10 === 0) note(); }
    return { seen, fines: GAME.job.fines, damage: TR.damage, fuelN: GAME.job.fuelN, fuel: TR.fuel, sleepy: GAME.sleepy, zone: TR.zone, lat: TR.lat, u: TR.s - a.sDiv };
  });
  const order = ['saFuel', 'saLane', 'saExit', 'toStall', 'stopNap', 'toPump', 'stopFuel', 'toOut'];
  let k = 0; for (const s of r.seen) if (s === order[k]) k++;
  assert.equal(k, order.length, JSON.stringify(r));
  assert.ok(r.zone === 'road' && r.u > 700 && Math.abs(r.lat + 7.65) < 1.5, JSON.stringify(r));
  assert.ok(r.fines === 0 && r.damage < 0.5 && r.fuelN === 1 && r.fuel > 0.9 && r.sleepy < 0.1, JSON.stringify(r));   // some fuel and sleepiness again on the way out
  assert.deepEqual(errors, []);
}));

test('E4 ナビ：燃料 10% で「中井SA で給油を」、2km の案内で「中井SA 入口　左車線へ」、中で「給油機の横に止める」、給油したらふだんの案内', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await job2At(page, 0, -3000, 0, 0.1, 0);
  const r = await page.evaluate(async () => {
    const a = SAS[0], at = (s, lat = X_TRV) => { placeTruck(s, lat, 0, { coupled: true }); for (let n = 0; n < 8; n++) simTick(1 / 60); const st = navState(); return { text: st.maneuver && st.maneuver.text, card: st.card, d: st.guideDist, lanes: st.maneuver && st.maneuver.lanes && st.maneuver.lanes.map(l => l.use) }; };
    const far = at(a.sDiv - 3000), two = at(a.sDiv - 700);
    __placeSa(0, 200, 23, 1, 0, 0); await __ready(); for (let n = 0; n < 8; n++) simTick(1 / 60);
    const inside = navState().maneuver.text;
    TR.fuel = 1; const after = at(a.sEnd + 300);
    return { far, two, inside, after, sug: NAV.sug };
  });
  assert.deepEqual(r.far, { text: '中井SA で給油を', card: true, d: '25.0 km', lanes: null });
  assert.deepEqual(r.two, { text: '中井SA 入口　左車線へ', card: true, d: '2.0 km', lanes: [true, false] });
  assert.equal(r.inside, '給油機の横に止める');
  assert.equal(r.sug, null); assert.notEqual(r.after.text, '中井SA で給油を');
  assert.deepEqual(errors, []);
}));

test('分かれ目の 160 m 手前を過ぎても、その SA の「SA 入口　左」が続く', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await job2At(page, 0, -300, 0, 0.1, 0);
  const r = await page.evaluate(() => { const a = SAS[0], out = []; for (const d of [150, 60, 10]) { placeTruck(a.sDiv - d, X_TRV, 0, { coupled: true }); for (let n = 0; n < 5; n++) simTick(1 / 60); out.push(navState().maneuver.text); } return out; });
  assert.deepEqual(r, ['SA 入口　左', 'SA 入口　左', 'SA 入口　左']);
  assert.deepEqual(errors, []);
}));

test('通り過ぎると次の SA（足柄）の案内になる', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  await job2At(page, 0, 200, 0, 0.1, 0);
  const r = await page.evaluate(() => navState().maneuver && navState().maneuver.text);
  assert.equal(r, '足柄SA で給油を');
  assert.deepEqual(errors, []);
}));

test('E7 合流：加速車線にいるとき、後ろから来る走行車線の車が車線を移るか速度を落とし、ぶつからない', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const e = ENTRIES[2], out = {};
    for (const blocked of [false, true]) {
      __clearRoad(e.s0 - 600, e.s1 + 600); placeTruck(e.s0 + 300, entryEdges(300).cx, 18, { coupled: true }); await __ready();
      __clearRoad(e.s0 - 600, e.s1 + 600);
      const free = CARS.filter(c => c.hidden), car = free[0], other = free[1];
      setCarType(car, 'sedan'); car.dir = 1; car.lane = 0; car.lc = null; car.s = TR.s - 70; car.x = laneX(1, 0); car.v = car.v0 = 27; car.hidden = false; car.grp.visible = true;
      if (blocked) { setCarType(other, 'truck'); other.dir = 1; other.lane = 1; other.lc = null; other.s = TR.s - 75; other.x = laneX(1, 1); other.v = other.v0 = 27; other.hidden = false; other.grp.visible = true; }
      EVENTS.length = 0; let minGap = Infinity, contacts = 0;
      for (let n = 0; n < 60 * 4; n++) {
        INP.tGas = TR.v * 3.6 < 70 ? 0.6 : 0; INP.tWheelHeld = false; simTick(1 / 60);
        if (car.lane === 0 && !car.lc) minGap = Math.min(minGap, (TR.tr.s - 12) - (car.s + car.len / 2));
        contacts += EVENTS.filter(x => x.t === 'car').length; EVENTS.length = 0;
      }
      out[blocked ? 'blocked' : 'free'] = { lane: car.lane, lc: !!car.lc, minGap, contacts, v: car.v };
    }
    return out;
  });
  assert.ok(r.free.lane === 1 || r.free.lc, JSON.stringify(r));
  assert.ok(r.blocked.lane === 0 && r.blocked.minGap > 5, JSON.stringify(r));
  assert.equal(r.free.contacts + r.blocked.contacts, 0, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

// The rules in towns: red lights, the dock bonus, town speed limits, and the tow back onto a lane after an accident.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// In the page: empty town i of its cars (so nothing stands in the way), and point helpers in a warehouse gate's frame.
const RULES_SRC = `window.__noCars = i => { const X = TOWN_TRAFFIC.get(i); if (X) { X.cars.length = 0; for (const g of X.groups) g.visible = false; } };
window.__gateP = (w, d, x) => { const g = w.gate; return [g.u + d * g.nu - x * g.nv, g.v + d * g.nv + x * g.nu]; };
window.__gateDir = (w, dd, dx) => [dd * w.gate.nu - dx * w.gate.nv, dd * w.gate.nv + dx * w.gate.nu];`;

test('E6 赤で停止線を越えると罰金 ¥9,000、30 秒は同じ交差点で取らず、そのあとはまた取る。黄では罰金なし', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    const L = TOWNS_LOADED.get(0).layout; __noCars(0);
    const lane = L.lanes.find(l => l.stopNode != null && !l.turn && !l.plaza && L.nodes[l.stopNode].signal && l.len > 60);
    const node = L.nodes[lane.stopNode], P = lane.pts, E = P[P.length - 1], A = P[P.length - 2], s = Math.hypot(E[0] - A[0], E[1] - A[1]);
    const du = (E[0] - A[0]) / s, dv = (E[1] - A[1]) / s, back = 6 + RIGP.front;   // the front starts 6 m before the stop line
    // the next signal time (s) from now at which the lane shows `want` for at least `hold` seconds
    const when = (want, hold) => { for (let t = Math.ceil(GAME.clock / TIME_SCALE); ; t += 0.25) { let ok = true; for (let k = 0; k <= hold; k += 0.25) if (signalState(node, lane.stopAxis, t + k) !== want) { ok = false; break; } if (ok) return t; } };
    const cross = want => {
      GAME.clock = (when(want, want === 'red' ? 3 : 1.5) + 0.2) * TIME_SCALE;
      __placeTown(0, E[0] - du * back, E[1] - dv * back, du, dv, 20, false);
      __drive(__town(0, [[E[0] - du * back, E[1] - dv * back], [E[0] + du * 12, E[1] + dv * 12]]), 20, 2.2, false);
      return { fines: GAME.job.fines, led: document.getElementById('ledText').textContent };
    };
    GAME.job.fines = 0;
    const red1 = cross('red'), red2 = cross('red');
    for (let i = 0; i < 60 * 31; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    const red3 = cross('red');
    GAME.redCool = {};
    const yellow = cross('yellow');
    return { red1, red2, red3, yellow, node: node.id };
  });
  assert.equal(r.red1.fines, 9000, JSON.stringify(r)); assert.match(r.red1.led, /信号無視 罰金 ¥9,000/);
  assert.equal(r.red2.fines, 9000, 'no second fine at the same junction within 30 s');
  assert.equal(r.red3.fines, 18000, 'fined again after 30 s'); assert.equal(r.yellow.fines, 18000, 'no fine on yellow');
  assert.deepEqual(errors, []);
}));

test('荷台口に付けて切り離すと、結果に「荷台口ボーナス（+20%）」が基本報酬の 20% で出る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const w = GAME.job.whB, d = w.docks[2], sp = TRAILERS[TR.trailerKey];
    const rear = [d.u + d.nu * 0.2, d.v + d.nv * 0.2], kp = [rear[0] + d.nu * sp.rear, rear[1] + d.nv * sp.rear];
    __placeTown(2, kp[0] - d.nu * HITCH, kp[1] - d.nv * HITCH, d.nu, d.nv, 0); await __ready();
    for (let i = 0; i < 30; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    INP.actions.push('couple'); for (let i = 0; i < 400 && GAME.state === 'drive'; i++) simTick(1 / 60);
    const rows = [...document.querySelectorAll('#resRows > div')].map(d => [...d.children].map(c => c.textContent));
    return { state: GAME.state, rows, want: yen(Math.round(GAME.job.pay * 0.2 / 100) * 100) };
  });
  assert.equal(r.state, 'result', JSON.stringify(r));
  assert.deepEqual(r.rows.find(x => x[0] === '荷台口ボーナス（+20%）'), ['荷台口ボーナス（+20%）', r.want], JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('町の大通りで 63 km/h を超えて 4 秒走ると速度超過（制限 50）、構内では 33 km/h を超えて 4 秒で速度超過（制限 20）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    const L = TOWNS_LOADED.get(0).layout, out = {}; __noCars(0);
    const run = (from, dir, kmh) => {
      for (const n of L.nodes) GAME.redCool['0:' + n.id] = 99;           // no red-light fines in this test
      GAME.job.fines = 0; GAME.fineCool = 0; GAME.overT = 0;
      __placeTown(0, from[0], from[1], dir[0], dir[1], kmh, false);
      let fineAt = -1, led = '', lim = 0;
      for (let t = 0; t < 6; t += 1 / 60) {
        __drive(__town(0, [[from[0] + dir[0] * 0, from[1] + dir[1] * 0], [from[0] + dir[0] * 200, from[1] + dir[1] * 200]]), kmh, 1 / 60, false);
        lim = GAME.limit;
        if (fineAt < 0 && GAME.job.fines > 0) { fineAt = t; led = document.getElementById('ledText').textContent; }
      }
      return { fines: GAME.job.fines, fineAt, led, lim, kmh: TR.v * 3.6 };
    };
    out.main = run([-4.875, 60], [0, 1], 64);
    const w = GAME.job.whA;
    out.yard = run(__gateP(w, 30, -30), __gateDir(w, 0, 1), 35);
    return out;
  });
  assert.equal(r.main.lim, 50, JSON.stringify(r)); assert.equal(r.main.fines, 9000, JSON.stringify(r));
  assert.ok(r.main.fineAt > 3.9 && r.main.fineAt < 5, JSON.stringify(r)); assert.match(r.main.led, /速度超過（制限50km\/h）/);
  assert.equal(r.yard.lim, 20, JSON.stringify(r)); assert.equal(r.yard.fines, 9000, JSON.stringify(r)); assert.match(r.yard.led, /速度超過（制限20km\/h）/);
  assert.deepEqual(errors, []);
}));

test('町の中で横転すると、いちばん近い車線の上に車線の向きで戻る（連結したまま）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(RULES_SRC);
  const r = await page.evaluate(() => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const L = TOWNS_LOADED.get(0).layout, site = L.site, w = GAME.job.whA, at = __gateP(w, 30, 0), dir = __gateDir(w, 0, 1);
    __placeTown(0, at[0], at[1], dir[0], dir[1], 0);
    for (let i = 0; i < 10; i++) simTick(1 / 60);
    const p = townNearestLane(L, TR.tu, TR.tv);
    EVENTS.push({ t: 'rollover' }); simTick(1 / 60);
    const k = townUV(site, TR.tr.kx, TR.tr.kz, {}), side = q => -(q.u - p.u) * Math.sin(p.h) + (q.v - p.v) * Math.cos(p.h);
    return { p, at: [TR.tu, TR.tv], dh: Math.abs(wrapA(TR.h - (site.hu + p.h))), kSide: side(k), tSide: side({ u: TR.tu, v: TR.tv }),
      zone: TR.zone, link: TR.link, led: document.getElementById('ledText').textContent };
  });
  assert.ok(Math.hypot(r.at[0] - r.p.u, r.at[1] - r.p.v) < 0.3 && r.dh < 0.02, JSON.stringify(r));
  assert.ok(Math.abs(r.kSide) < 0.3 && Math.abs(r.tSide) < 0.3, JSON.stringify(r));
  assert.deepEqual([r.zone, r.link], ['town', 'coupled']); assert.match(r.led, /横転しました/);
  assert.deepEqual(errors, []);
}));

// ---- saving the drive and resuming it ("reopening" = a new page whose localStorage holds what the old one saved) ----
const saved = page => page.evaluate(() => ({ 'nlh.drive': JSON.parse(localStorage.getItem('nlh.drive')), 'nlh.job': JSON.parse(localStorage.getItem('nlh.job') || '0') }));
const pose = page => page.evaluate(() => ({ x: TR.x, z: TR.z, h: TR.h, kx: TR.tr.kx, kz: TR.tr.kz, kh: TR.tr.h, link: TR.link, zone: TR.zone, town: TR.town, state: GAME.state }));
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < 0.05 && Math.abs(a.h - b.h) < 0.01 && Math.hypot(a.kx - b.kx, a.kz - b.kz) < 0.05 && Math.abs(a.kh - b.kh) < 0.01;

test('E4 町の中で保存して開き直すと、同じ位置・向き・連結の状態（曲がった角度のまま）で再開する。保存は 10 秒ごとにも行われる', async () => {
  let store, before;
  await withGame({}, async (page, errors) => {
    await startJob(page); await driveHelpers(page);
    const periodic = await page.evaluate(() => {
      INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
      __placeTown(0, -4.875, 60, 0, 1, 0); localStorage.removeItem('nlh.drive'); GAME.saveT = 0;
      for (let i = 0; i < 60 * 6; i++) { INP.tGas = TR.v < 3 ? 0.4 : 0; INP.tWheelHeld = true; INP.tWheel = i > 120 ? 0.9 : 0; simTick(1 / 60); }   // ahead, then a bend
      for (let i = 0; i < 60 * 5; i++) { INP.tGas = 0; INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0; INP.tWheelHeld = false;
      const at10 = localStorage.getItem('nlh.drive') != null;
      saveDrive(); return { at10, angle: Math.abs(wrapA(TR.h - TR.tr.h)) };
    });
    assert.ok(periodic.at10, 'saved after 10 s of driving'); assert.ok(periodic.angle > 0.05, `bent: ${periodic.angle}`);
    store = await saved(page); before = await pose(page); assert.deepEqual(errors, []);
  });
  await withGame({ storage: store }, async (page, errors) => {
    const title = await pose(page); await startJob(page); const after = await pose(page);
    assert.ok(near(title, before) && near(after, before), JSON.stringify({ before, title, after }));
    assert.deepEqual([after.link, after.zone, after.town], ['coupled', 'town', 0]); assert.deepEqual(errors, []);
  });
});

test('トレーラーを荷台口に置いたまま保存して開き直すと、トレーラーは荷台口、トラクターは離れた位置に戻る', async () => {
  let store, before;
  await withGame({}, async (page, errors) => {
    await startJob(page); await driveHelpers(page);
    await page.evaluate(async () => {
      INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
      const w = GAME.job.whA, d = w.docks[1], sp = TRAILERS[TR.trailerKey], kp = [d.u + d.nu * (0.2 + sp.rear), d.v + d.nv * (0.2 + sp.rear)];
      __placeTown(0, kp[0] - d.nu * HITCH, kp[1] - d.nv * HITCH, d.nu, d.nv, 0);
      for (let i = 0; i < 30; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
      INP.actions.push('couple'); for (let i = 0; i < 200 && TR.link !== 'free'; i++) simTick(1 / 60);
      for (let i = 0; i < 60 * 6; i++) { INP.tGas = TR.v < 3 ? 0.4 : 0; INP.tWheelHeld = true; INP.tWheel = 0; simTick(1 / 60); }
      for (let i = 0; i < 60 * 3; i++) { INP.tGas = 0; INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0; INP.tWheelHeld = false;
      saveDrive();
    });
    store = await saved(page); before = await pose(page); assert.equal(before.link, 'free'); assert.deepEqual(errors, []);
  });
  assert.ok(Math.hypot(before.x - before.kx, before.z - before.kz) > 12, 'the tractor drove off');
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page); const after = await pose(page);
    const dock = await page.evaluate(() => { const site = TOWN_SITES[0], sp = TRAILERS[TR.trailerKey], q = townUV(site, TR.tr.kx - Math.sin(TR.tr.h) * sp.rear, TR.tr.kz - Math.cos(TR.tr.h) * sp.rear, {});
      return dockCheck(GAME.job.whA, q, { u: -Math.cos(TR.tr.h - site.hu), v: -Math.sin(TR.tr.h - site.hu) }); });
    assert.ok(near(after, before) && after.link === 'free', JSON.stringify({ before, after })); assert.equal(dock, 1); assert.deepEqual(errors, []);
  });
});

test('連結の途中（ロック中）で保存して開き直すと、離れた状態で戻り、もう一度連結できる', async () => {
  let store, before;
  await withGame({}, async (page, errors) => {
    await startJob(page);
    const link = await page.evaluate(() => {
      TR.dir = -1;
      for (let i = 0; i < 240 * 60 && TR.link === 'free'; i++) stepTruck(1 / 240, { throttle: -TR.v * 3.6 < 3 ? 0.25 : 0, brake: 0, steer: 0 });
      saveDrive(); return TR.link;
    });
    assert.equal(link, 'locking'); store = await saved(page); before = await pose(page); assert.deepEqual(errors, []);
  });
  await withGame({ storage: store }, async (page, errors) => {
    await startJob(page); const after = await pose(page);
    assert.ok(near(after, before) && after.link === 'free', JSON.stringify({ before, after }));
    const link = await page.evaluate(() => { INP.actions.push('couple'); for (let i = 0; i < 200; i++) simTick(1 / 60); return TR.link; });
    assert.equal(link, 'coupled'); assert.deepEqual(errors, []);
  });
});

test('壊れた保存（数値でない）は消して、仕事の始まりから始める', () => withGame({ storage: { 'nlh.drive': { job: 0, x: 'a' } } }, async (page, errors) => {
  const r = await page.evaluate(() => {
    const site = TOWN_SITES[0], pk = GAME.job.whA.park, k = townUV(site, TR.tr.kx, TR.tr.kz, {});
    return { kept: localStorage.getItem('nlh.drive'), k: Math.hypot(k.u - pk.u, k.v - pk.v), link: TR.link };
  });
  assert.equal(r.kept, 'null'); assert.ok(r.k < 0.05, JSON.stringify(r)); assert.equal(r.link, 'free'); assert.deepEqual(errors, []);
}));

test('E5 町の中で画質を 3 回切り替え、メニューを開いて閉じ、やり直しても、町と町の車と車両が動き続ける', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    const out = [];
    const check = async label => {
      for (let i = 0; i < 60; i++) { INP.tGas = 0.5; INP.tWheelHeld = true; INP.tWheel = 0; simTick(1 / 60); } INP.tGas = 0; INP.tWheelHeld = false;
      await __t.frames(2);
      const X = TOWN_TRAFFIC.get(0), moved = X ? X.cars.filter(c => c.v > 0.5).length : 0;
      out.push({ label, mesh: TOWN_MESH.has(0), cars: X ? X.cars.length : -1, want: Q.townCars, moved, v: +TR.v.toFixed(2), state: GAME.state });
      for (let i = 0; i < 90; i++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    };
    __placeTown(0, 4.875, 200, 0, -1, 0, false); await __ready();
    for (const q of ['low', 'mid', 'high']) { setQuality(q); await check(q); }
    toggleMenu(); await __t.frames(2); toggleMenu(); await check('menu');
    document.getElementById('restartBtn').click();
    for (let n = 0; n < 600 && GAME.state !== 'drive'; n++) await __t.frames(1);
    await check('restart');
    return out;
  });
  for (const x of r) {
    assert.ok(x.mesh && x.cars === x.want && x.moved > 0 && x.v > 0.3 && x.state === 'drive', JSON.stringify(r));
  }
  assert.deepEqual(errors, []);
}));

test('E2（ゲームの中）：町の中の車内視点で、町 1 つの三角形と描く回数が画質ごとの上限に収まる', async () => {
  for (const [q, triMax] of [['high', 150000], ['mid', 90000], ['low', 50000]]) await withGame({ storage: { 'nlh.quality': q } }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(async () => {
      setCam('cab'); await __t.frames(2);
      // the town alone, seen from the cab: its group moved for one render into a scene of its own, with the same lights
      const town = TOWN_MESH.get(0).grp, solo = new THREE.Scene(), h = hemi.clone(), s = sun.clone();
      solo.add(town, h, s); s.target.position.copy(sun.target.position); solo.add(s.target);
      const se = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
      renderer.render(solo, activeCam);
      const info = { tris: renderer.info.render.triangles, calls: renderer.info.render.calls, stats: townStats(0) };
      renderer.shadowMap.enabled = se; scene.add(town);
      return info;
    });
    console.log('E2 in game', q, JSON.stringify(r));
    assert.ok(r.tris > 1000 && r.tris <= triMax && r.calls <= 90, `${q} ${JSON.stringify(r)}`);
    assert.deepEqual(errors, []);
  });
});

test('町の車の上に車両を置いても（レッカーのあとなど）、その車は別の所へ移り、接触の罰金が続かない', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const L = TOWNS_LOADED.get(0).layout, site = L.site, X = TOWN_TRAFFIC.get(0);
    const c = X.cars.find(o => !o.hidden && !L.lanes[o.lane].turn && o.d > 30 && o.d < L.lanes[o.lane].len - 10);
    const p = townCarPose(L, c, {});
    __placeTown(0, p.u, p.v, Math.cos(p.h), Math.sin(p.h), 0);   // the tractor right on top of it
    GAME.job.fines = 0;
    for (let k = 0; k < 60 * 8; k++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    const inside = X.cars.filter(o => !o.hidden && Math.hypot(o.x - TR.x, o.z - TR.z) < 2).length;
    return { fines: GAME.job.fines, inside };
  });
  assert.deepEqual(r, { fines: 0, inside: 0 }); assert.deepEqual(errors, []);
}));

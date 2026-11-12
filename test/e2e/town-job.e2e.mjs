// The job through the towns: start at a warehouse, out through the plaza, the expressway, in at the destination.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

test('仕事 1 の始まり：トレーラーは東京の倉庫の置き場、トラクターはその 12 m 前で門の向き', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const site = TOWN_SITES[0], pk = GAME.job.whA.park, k = townUV(site, TR.tr.kx, TR.tr.kz, {}), a = townUV(site, TR.x, TR.z, {});
    const hTr = Math.atan2(Math.sin(TR.tr.h - site.hu), Math.cos(TR.tr.h - site.hu)), want = Math.atan2(pk.hv, pk.hu);
    return { k: Math.hypot(k.u - pk.u, k.v - pk.v), a: Math.hypot(a.u - (pk.u + pk.hu * (12 - HITCH)), a.v - (pk.v + pk.hv * (12 - HITCH))), dh: Math.abs(Math.atan2(Math.sin(hTr - want), Math.cos(hTr - want))), zone: TR.zone, town: TR.town, link: TR.link, mesh: TOWN_MESH.has(0) };
  });
  assert.ok(r.k < 0.05 && r.a < 0.05 && r.dh < 1e-6, JSON.stringify(r)); assert.deepEqual([r.zone, r.town, r.link, r.mesh], ['town', 0, 'free', true]);
}));

// In the page: town (u, v) points from a street's kerb lane (at gate depth d0, yard on the left) through warehouse w's gate,
// across the yard and straight into its bay, ending where the trailer stands centred in the bay.
const YARD_SRC = `window.yardPath = (w, d0, rear, R = 15) => {
  const g = w.gate, lu = -g.nv, lv = g.nu, b = w.bay, db = (b.u - g.u) * g.nu + (b.v - g.v) * g.nv, xb = (b.u - g.u) * lu + (b.v - g.v) * lv;
  const P = (d, x) => [g.u + d * g.nu + x * lu, g.v + d * g.nv + x * lv], out = [];
  const line = (a, c, n = 8) => { for (let k = 0; k <= n; k++) out.push(P(a[0] + (c[0] - a[0]) * k / n, a[1] + (c[1] - a[1]) * k / n)); };
  const arc = (cd, cx, t0, t1, n = 12) => { for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; out.push(P(cd + R * Math.cos(t), cx + R * Math.sin(t))); } };
  const d1 = d0 + R + 8;
  line([d0, R + 40], [d0, R]); arc(d0 + R, R, Math.PI, 1.5 * Math.PI);         // along the street, left through the gate
  line([d0 + R, 0], [d1, 0]); arc(d1, R, -Math.PI / 2, 0);                         // left across the yard
  line([d1 + R, R], [d1 + R, xb - R]); arc(d1 + 2 * R, xb - R, Math.PI, Math.PI / 2); // right, lined up with the bay
  line([d1 + 2 * R, xb], [db + rear / 2 - HITCH, xb], 16);                         // straight in
  return out;
};`;

test('E1 仕事 1：東京の倉庫で連結 → 入口ゲート → 合流 → 厚木で降りる → 厚木の倉庫の荷台口にバックで付けて納品 → 結果で報酬が 1.2 倍', () => withGame({}, async (page, errors) => {
  await startJob(page);
  await driveHelpers(page); await page.evaluate(YARD_SRC);
  const r = await page.evaluate(async () => {
    const log = {};
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    log.coupled = TR.link;
    // out of Tokyo: Main A's kerb lane toward the plaza, through the entrance gate, along the entrance ramp into the travel lane
    __placeTown(0, 4.875, 80, 0, -1, 10); await __ready();
    const L0 = TOWNS_LOADED.get(0).layout, en = ENTRIES[0], ramp = [];
    // along the band, easing over into the travel lane before the band closes (from u = 330 to 420)
    for (let s = en.s0 + 40; s <= en.s1 + 120; s += 5) { const u = s - en.s0, p = posAt(s, u < 330 ? entryEdges(u).cx : lerp(entryEdges(330).cx, X_TRV, smooth(330, 420, u)), {}); ramp.push([p.x, p.z]); }
    __drive([...__town(0, [[4.875, 80], ...L0.plaza.entryPath]), ...ramp.slice(0, 1)], 15, 90, false);
    log.entryGate = L0.plaza.gates.entry.state; log.tollAfterEntry = GAME.job.toll;
    __clearRoad(en.s0 - 600, en.s1 + 600); __drive(ramp, 60, 120, false);   // merging into a clear gap
    log.merged = [TR.zone, +TR.lat.toFixed(1)];
    // into Atsugi: on its exit ramp, through the exit gate (the fare), into the town and up Main A
    const r2 = RAMPS.find(x => x.ic.i === 2), ex = [];
    for (let s = r2.sDiv + 420; s <= r2.sEnd; s += 5) { const p = posAt(s, rampEdges(s - r2.sDiv).cx, {}); ex.push([p.x, p.z]); }
    placeTruck(r2.sDiv + 420, rampEdges(420).cx, 8, { coupled: true }); await __ready(); __noTownCars(2);   // the driver here does not look at traffic
    const L2 = TOWNS_LOADED.get(2).layout;
    __drive([...ex, ...__town(2, [...L2.plaza.exitPath.filter(p => p[0] > -24.5), [-4.875, 70]])], 15, 120);
    log.exitGate = L2.plaza.gates.exit.state; log.toll = GAME.job.toll;
    // onto a dock of the destination warehouse: lined up 12 m out, then straight back until the tail is at the bumpers
    const w = GAME.job.whB, d = w.docks[2], sp = TRAILERS[TR.trailerKey], site = TOWN_SITES[2], q = {};
    const tail = () => { townUV(site, TR.tr.kx - Math.sin(TR.tr.h) * sp.rear, TR.tr.kz - Math.cos(TR.tr.h) * sp.rear, q); return (q.u - d.u) * d.nu + (q.v - d.v) * d.nv; };
    const k0 = [d.u + d.nu * (12 + sp.rear), d.v + d.nv * (12 + sp.rear)];
    __placeTown(2, k0[0] - d.nu * HITCH, k0[1] - d.nv * HITCH, d.nu, d.nv, 0); await __ready();
    INP.actions.push('dir'); simTick(1 / 60);
    for (let i = 0; i < 60 * 60 && tail() > 0.3; i++) { INP.tGas = Math.abs(TR.v) * 3.6 < 3 ? 0.3 : 0; INP.tBrake = 0; INP.tWheelHeld = true; INP.tWheel = 0; simTick(1 / 60); }
    for (let i = 0; i < 120 && Math.abs(TR.v) > 0.02; i++) { INP.tGas = 0; INP.tBrake = 1; simTick(1 / 60); }
    INP.tBrake = 0; INP.tWheelHeld = false;
    log.tail = +tail().toFixed(2); log.dock = dockCheck(w, q, { u: -Math.cos(TR.tr.h - site.hu), v: -Math.sin(TR.tr.h - site.hu) });
    INP.actions.push('couple'); for (let i = 0; i < 200 && GAME.state === 'drive'; i++) simTick(1 / 60);
    const rows = [...document.querySelectorAll('#resRows > div')].map(x => [...x.children].map(c => c.textContent));
    return { ...log, state: GAME.state, fines: GAME.job.fines, rows, bonus: yen(Math.round(GAME.job.pay * 0.2 / 100) * 100) };
  });
  assert.equal(r.coupled, 'coupled'); assert.equal(r.entryGate, 'open'); assert.equal(r.tollAfterEntry, 0, 'no fare at the entrance');
  assert.equal(r.merged[0], 'road'); assert.ok(r.merged[1] > -9.5, `merged at lat ${r.merged[1]}`);
  assert.equal(r.exitGate, 'open'); assert.ok(r.toll > 0, 'the fare at the destination exit');
  assert.ok(r.dock >= 0, JSON.stringify(r)); assert.equal(r.state, 'result', JSON.stringify(r)); assert.equal(r.fines, 0, JSON.stringify(r));
  assert.deepEqual(r.rows.find(x => x[0] === '荷台口ボーナス（+20%）'), ['荷台口ボーナス（+20%）', r.bonus], 'the pay is 1.2 times: ' + JSON.stringify(r.rows));
  assert.deepEqual(errors, []);
}));

test('厚木の倉庫：大通りから門を左に入り、構内を横切って納品の枠にまっすぐ入れ、枠で納品できる（壁に当たらない）', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(YARD_SRC);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const w = GAME.job.whB, sp = TRAILERS[TR.trailerKey], site = TOWN_SITES[2], yp = yardPath(w, -5.125, sp.rear);   // -5.125: Main A's kerb lane, in gate depth
    __placeTown(2, yp[0][0], yp[0][1], yp[1][0] - yp[0][0], yp[1][1] - yp[0][1], 10); await __ready();
    GAME.job.fines = 0; TR.damage = 0;
    __drive(__town(2, yp), 10, 120);
    const bay = bayCheck(w, townUV(site, TR.tr.kx, TR.tr.kz, {}), townUV(site, TR.tr.kx - Math.sin(TR.tr.h) * sp.rear, TR.tr.kz - Math.cos(TR.tr.h) * sp.rear, {}));
    INP.actions.push('couple'); for (let i = 0; i < 200 && GAME.state === 'drive'; i++) simTick(1 / 60);
    const rows = [...document.querySelectorAll('#resRows > div')].map(x => x.children[0].textContent);
    return { bay, state: GAME.state, fines: GAME.job.fines, damage: TR.damage, rows };
  });
  assert.deepEqual([r.bay, r.state, r.fines], [true, 'result', 0], JSON.stringify(r)); assert.ok(r.damage < 1, JSON.stringify(r));
  assert.ok(r.rows.includes('基本報酬') && !r.rows.includes('荷台口ボーナス（+20%）'), JSON.stringify(r)); assert.deepEqual(errors, []);
}));

test('T12 違う IC で降りて入口から戻っても、罰金はなく、料金も増えない', () => withGame({}, async (page, errors) => {
  await startJob(page);
  await driveHelpers(page);
  const r = await page.evaluate(async () => {
    const r1 = RAMPS.find(x => x.ic.i === 1), ex = [];   // 横浜町田: not job 1's destination
    for (let s = r1.sDiv + 420; s <= r1.sEnd; s += 5) { const p = posAt(s, rampEdges(s - r1.sDiv).cx, {}); ex.push([p.x, p.z]); }
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    placeTruck(r1.sDiv + 420, rampEdges(420).cx, 8, { coupled: true }); await __ready();
    const L1 = TOWNS_LOADED.get(1).layout;
    __drive([...ex, ...__town(1, [...L1.plaza.exitPath.filter(p => p[0] > -24.5), [-4.875, 60]])], 15, 120);
    const led1 = document.getElementById('ledText').textContent;
    __placeTown(1, 4.875, 80, 0, -1, 8); await __ready();
    __drive(__town(1, [[4.875, 80], ...L1.plaza.entryPath]), 15, 90, false);
    return { exit: L1.plaza.gates.exit.state, entry: L1.plaza.gates.entry.state, fines: GAME.job.fines, toll: GAME.job.toll, to: GAME.job.to, led1, zone: TR.zone };
  });
  assert.deepEqual([r.exit, r.entry, r.fines, r.toll, r.to], ['open', 'open', 0, 0, 2], JSON.stringify(r));
  assert.match(r.led1, /目的地ではありません/); assert.deepEqual(errors, []);
}));

test('90 km/h で 3 つの IC を通り過ぎても、町を作る仕事が 1 フレーム 40 ms を超えるのも、全体で 50 ms を超えるのも 1 回までで、出口のゲートに着く前に町ができている', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    placeTruck(S0 + 700, X_TRV, 25, { coupled: true }); GAME.state = 'loading'; await (async () => { let left = 1; while (left) { left = updateChunks(TR.s, 4) + townsTick(200); await __t.frames(1); } })(); GAME.state = 'drive';
    const seen = {}, steer = () => clamp(0.35 * (X_TRV - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * (0.4 + Math.abs(TR.v) / 25), -1, 1);
    let towns = 0, townSlow = 0, slow = 0, worst = 0;
    for (let n = 0; n < 60 * 260 && TR.s < ICS[3].s + 200; n++) {
      INP.tGas = TR.v * 3.6 < 88 ? 1 : 0; INP.tBrake = 0; INP.tWheelHeld = true; INP.tWheel = Math.sign(steer()) * Math.pow(Math.abs(steer()), 1 / 1.35) * 2.6;
      const t0 = performance.now(); simTick(1 / 60); updateChunks(TR.s, 1); const t1 = performance.now(); townsTick(6); const t2 = performance.now();
      towns = Math.max(towns, t2 - t1); worst = Math.max(worst, t2 - t0); if (t2 - t1 > 40) townSlow++; if (t2 - t0 > 50) slow++;
      for (const i of [1, 2, 3]) if (seen[i] == null && TR.s >= ICS[i].s + 100) seen[i] = TOWN_MESH.has(i);
    }
    INP.tGas = 0; INP.tWheelHeld = false;
    return { towns, townSlow, slow, worst, seen, s: TR.s, link: TR.link };
  });
  // the town work's own share: its 6 ms budget plus one step of at most 30 ms; one pause (a garbage collection, say) is
  // allowed, in the town work or anywhere in the tick
  assert.deepEqual(r.seen, { 1: true, 2: true, 3: true }, JSON.stringify(r)); assert.ok(r.townSlow <= 1 && r.slow <= 1, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

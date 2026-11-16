// Easier driving: the destination marker, the mirrors and back monitor on the screen, the next signal's colour on
// the navigation card, the lane-keeping help in the game.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

test('配送先の目印：目的の町が読み込まれていると倉庫の門の上に出て、構内に入ると消える', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const j = GAME.job, w = j.whB, g = w.gate, q = {};
    __placeTown(j.to, g.u - g.nu * 40, g.v - g.nv * 40, g.nu, g.nv, 0); await __ready(); await __t.frames(2);
    townXZ(TOWN_SITES[j.to], g.u, g.v, q);
    const out = { shown: DEST_MARK.grp && DEST_MARK.grp.visible, d: DEST_MARK.grp ? Math.hypot(DEST_MARK.grp.position.x - q.x, DEST_MARK.grp.position.z - q.z) : null };
    const y = w.yard; __placeTown(j.to, (y.u0 + y.u1) / 2, (y.v0 + y.v1) / 2, g.nu, g.nv, 0); await __t.frames(2);
    out.inYard = DEST_MARK.grp.visible;
    return out;
  });
  assert.equal(r.shown, true, JSON.stringify(r)); assert.ok(r.d < 5, JSON.stringify(r)); assert.equal(r.inYard, false);
  assert.deepEqual(errors, []);
}));

test('ミラー：外からの視点では初めは出ず、「ミラー」で出せる（視点ごとに別）。絵は毎回描き直される', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    setCam('chase'); await __t.frames(3);
    const first = SMIR.shown;
    INP.actions.push('mirror'); for (let i = 0; i < 2; i++) simTick(1 / 60); await __t.frames(4);
    const on = SMIR.shown, cab = smirShownFor('cab');
    // the back monitor's picture changes when the rig moves on
    const read = () => { const px = new Uint8Array(4 * 16); renderer.readRenderTargetPixels(SMIR.backRt, 150, 60, 4, 4, px); return [...px].reduce((a, b) => a + b, 0); };
    const a = read(); placeTruck(TR.s + 300, X_TRV, 0, { coupled: true }); await __ready(); await __t.frames(4); const b = read();
    return { first, on, cab, changed: a !== b, parentIsTrailer: SMIR.parent === TRL.root };
  });
  assert.equal(r.first, false); assert.equal(r.on, true); assert.equal(r.cab, true);
  assert.equal(r.parentIsTrailer, true); assert.equal(r.changed, true, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('信号の色：町で信号のある交差点に近づくと、案内カードに次の信号の色が出て、信号どおりの色', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const i = GAME.job.from, L = TOWNS_LOADED.get(i).layout, n = L.nodes.find(x => x.streets.includes(0));
    __placeTown(i, -7, n.v - 70, 0, 1, 0); for (let k = 0; k < 30; k++) simTick(1 / 60); await __t.frames(2);
    const out = [];
    for (const t of [5, 31, 40]) {   // green, yellow, red for the v approaches (phase shifted per junction)
      GAME.clock = (Math.ceil(GAME.clock / TIME_SCALE / 70) * 70 + t - n.phase + 700) * TIME_SCALE;
      for (let k = 0; k < 15; k++) simTick(1 / 60);
      await __t.frames(2); sigRepUpdate();   // the frame loop redraws it every 0.2 s; read it as of now
      const el = document.getElementById('ncSig');
      out.push({ hidden: el.hidden, cls: el.className, want: signalState(n, 'v', GAME.clock / TIME_SCALE) });
    }
    return out;
  });
  for (const o of r) { assert.equal(o.hidden, false, JSON.stringify(r)); assert.ok(o.cls.endsWith(o.want[0]), JSON.stringify(o)); }
  assert.deepEqual(r.map(o => o.want), ['green', 'yellow', 'red']);
  assert.deepEqual(errors, []);
}));

test('車線キープ補助：ハンドルを離して走ると車線の中心へ戻り、印が出る。ウインカーや設定「オフ」では戻さない', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const s = S0 + 3000, out = {};
    const run = async (blink, on) => {
      setLka(on); __clearRoad(s - 400, s + 2000); placeTruck(s, X_TRV + 1.0, 22, { coupled: true }); await __ready();
      GAME.blink = blink; LKA.w = 1; LKA.wait = 0; TR.cruise = true; TR.cruiseV = 22;
      let icon = false;
      for (let k = 0; k < 60 * 10; k++) { simTick(1 / 60); if (k % 30 === 0) { careIcons(); icon = icon || !document.getElementById('icLka').hidden; } }
      GAME.blink = 0; return { off: Math.abs(TR.lat - X_TRV), icon };
    };
    out.help = await run(0, true); out.blink = await run(1, true); out.off = await run(0, false);
    setLka(true);
    return out;
  });
  assert.ok(r.help.off < 0.35 && r.help.icon, JSON.stringify(r));
  assert.ok(r.blink.off > 0.6 && r.off.off > 0.6, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('料金所の遮断機は、閉じているとき自分のゲートの車線をふさぐ（出口・入口とも）', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    const out = [];
    for (const i of [1, 2]) {
      if (!TOWNS_LOADED.has(i)) townLoad(i);
      if (!TOWN_MESH.has(i)) { const it = townMeshSteps(i); while (!it.next().done); }
      const M = TOWN_MESH.get(i), L = TOWNS_LOADED.get(i).layout, site = L.site, p = new THREE.Vector3(), q = {};
      for (const key of ['exit', 'entry']) {
        const pv = M.gates[key], g = L.plaza.gates[key]; if (!pv) continue;
        pv.rotation.z = 0; pv.updateWorldMatrix(true, false);   // with its parents (the town's group may not have been drawn yet)
        const ends = [0, -6.2].map(x => { pv.localToWorld(p.set(x, 0, 0)); townUV(site, p.x, p.z, q); return [q.u, q.v]; });
        out.push({ town: i, key, gu: g.u, lo: Math.min(ends[0][0], ends[1][0]), hi: Math.max(ends[0][0], ends[1][0]), dv: Math.abs(ends[0][1] - g.v) });
      }
    }
    return out;
  });
  for (const b of r) assert.ok(b.lo <= b.gu - 1.3 && b.hi >= b.gu + 1.3 && b.dv < 0.5, JSON.stringify(b));
  assert.equal(r.length, 4);
  assert.deepEqual(errors, []);
}));

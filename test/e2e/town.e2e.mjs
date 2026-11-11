// Town meshes: what is drawn, within budget, built in short steps; the terrain and houses around towns.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame } from './helpers.mjs';

// In the page: make town i's grid and meshes now, timing every step (ms).
const buildTownNow = i => {
  const times = [], layout = townLayout(i), it = townGridSteps(layout); let t = performance.now(), grid;
  for (;;) { const r = it.next(), n = performance.now(); times.push(n - t); t = n; if (r.done) { grid = r.value; break; } }
  townAdd(i, layout, grid);
  const m = townMeshSteps(i);
  for (;;) { const r = m.next(), n = performance.now(); times.push(n - t); t = n; if (r.done) break; }
  return times;
};

test('E2 町の見た目：道・信号・倉庫・荷台口があり、画質 高・中・低で上限に収まる', async () => {
  for (const [q, triMax] of [['high', 150000], ['mid', 90000], ['low', 50000]]) await withGame({ storage: { 'nlh.quality': q } }, async (page, errors) => {
    const s = await page.evaluate(`(${buildTownNow})(2), (() => { const m = TOWN_MESH.get(2); return { ...townStats(2), signals: m.signals.count, gates: !!(m.gates.exit && m.gates.entry), docks: m.docks, parts: Object.keys(m.parts).filter(k => m.parts[k] > 0).sort() }; })()`);
    assert.ok(s.tris <= triMax && s.tris > triMax * 0.1 && s.meshes <= 90, `${q} ${JSON.stringify(s)}`);
    assert.ok(s.signals > 0 && s.gates && s.docks >= 8, JSON.stringify(s));
    for (const k of ['buildings', 'fences', 'ground', 'markings', 'roads', 'signals', 'toll', 'trees', 'walks', 'warehouses', 'yards']) assert.ok(s.parts.includes(k), `${q} part ${k}: ${s.parts}`);
    assert.deepEqual(errors, []);
  });
});

test('E3 町を作る仕事は 1 回 30 ms 以内に分かれ、作っている間も描き続ける', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(async () => {
    const layout = townLayout(7), it = townGridSteps(layout), times = []; let grid;
    for (;;) { const t = performance.now(), x = it.next(); times.push(performance.now() - t); if (x.done) { grid = x.value; break; } await __t.frames(1); }
    townAdd(7, layout, grid);
    const m = townMeshSteps(7);
    for (;;) { const t = performance.now(), x = m.next(); times.push(performance.now() - t); if (x.done) break; await __t.frames(1); }
    return { max: Math.max(...times), n: times.length, built: TOWN_MESH.has(7) };
  });
  assert.ok(r.built && r.n > 10, JSON.stringify(r)); assert.ok(r.max <= 30, `slowest step ${r.max.toFixed(1)} ms`); assert.deepEqual(errors, []);
}));

test('信号の灯火は信号の周期に合わせて色が変わる', () => withGame({}, async page => {
  const r = await page.evaluate(`(${buildTownNow})(2), (() => { const L = TOWNS_LOADED.get(2).layout, n = L.nodes.find(x => x.signal);
    const lit = t => { townSignalsUpdate(2, t); return TOWN_MESH.get(2).lampsOf(n.id).map(c => c.getHexString()); };
    return [lit(5), lit(31), lit(40)]; })()`);
  assert.notDeepEqual(r[0], r[1]); assert.notDeepEqual(r[1], r[2]);
}));

test('高速沿いの家は道路にはみ出さない（家の四隅が本線から 14.2 m 以上）、町の範囲と、本線と町のあいだ（出入口の帯が広場へ曲がる所）には高速の家と木を置かない', () => withGame({}, async page => {
  const r = await page.evaluate(async () => {
    const out = { worst: Infinity, inTown: 0, n: 0 }, m = new THREE.Matrix4(), p = new THREE.Vector3(), pr = {};
    for (let s = 1500; s < 30000; s += 2400) {
      placeTruck(s, X_TRV, 0, { coupled: false }); updateChunks(s, 99);
      for (const c of chunks.values()) c.grp.traverse(o => {
        if (!o.isInstancedMesh || (o.material !== MAT.house && o.material !== MAT.tree)) return;
        for (let k = 0; k < o.count; k++) {
          o.getMatrixAt(k, m);
          for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
            p.set(x, 0, z).applyMatrix4(m).add(c.grp.position);
            project(p.x, p.z, Math.floor(c.k * CHUNK / DS), pr);
            if (o.material === MAT.house) { out.worst = Math.min(out.worst, Math.abs(pr.lat)); out.n++; }
            if (pr.lat < -12 && townKeepOut(pr.s, pr.lat + (pr.lat < 0 ? 1 : -1))) out.inTown++;   // 1 m inside, so a corner on the edge counts as out
          }
        }
      });
    }
    return out;
  });
  assert.ok(r.n > 100 && r.worst >= 14.2, JSON.stringify(r)); assert.equal(r.inTown, 0, JSON.stringify(r));
}));

test('入口の帯の中に、本線の左のガードレール・地面・案内の門の柱が入らない（12 か所すべて）', () => withGame({}, async page => {
  const r = await page.evaluate(() => {
    const out = { posts: [], ground: [], gantry: [] }, m = new THREE.Matrix4(), p = new THREE.Vector3(), pr = {};
    const gantryLeft = typeof gantryLeftX === 'function' ? gantryLeftX : () => -13.1;   // before: always at -13.1
    for (const e of ENTRIES) {
      placeTruck(e.s0 + 250, X_TRV, 0, { coupled: false }); updateChunks(e.s0 + 250, 99);
      for (const c of chunks.values()) c.grp.traverse(o => {   // the mainline's left guardrail posts
        if (!o.isInstancedMesh || o.material !== MAT.post) return;
        for (let k = 0; k < o.count; k++) {
          o.getMatrixAt(k, m); p.setFromMatrixPosition(m).add(c.grp.position); project(p.x, p.z, Math.floor(c.k * CHUNK / DS), pr);
          const u = pr.s - e.s0; if (u > 0 && u < ENTRY_LEN && pr.lat > -12.6 && pr.lat < -12.3 && pr.lat < entryEdges(u).xr + 0.3) out.posts.push(`${e.ic.jp} +${Math.round(u)} ${pr.lat.toFixed(2)} ${entryEdges(u).xr.toFixed(2)}`);   // the band's inner edge reaches the post
        }
      });
      for (let u = 0; u <= ENTRY_LEN; u += 10) {   // the ground starts beyond the band's outer edge
        const s = e.s0 + u, xl = entryEdges(u).xl; if (leftInner(s) < -xl - 0.01) out.ground.push(`${e.ic.jp} +${u}`);
        const g = gantryLeft(s); if (g > xl - 0.5 && u < ENTRY_LEN - 2) out.gantry.push(`${e.ic.jp} +${u} ${g.toFixed(1)} ${xl.toFixed(1)}`);
      }
    }
    return out;
  });
  assert.deepEqual(r.posts.slice(0, 4), [], `${r.posts.length} posts in the lane`); assert.deepEqual(r.ground.slice(0, 4), []); assert.deepEqual(r.gantry.slice(0, 4), []);
}));

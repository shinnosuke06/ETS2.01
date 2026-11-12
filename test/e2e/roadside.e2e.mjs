// Roadside things in the game: the overpasses, the road markings, the fences and shrubs.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob } from './helpers.mjs';

test('橋のある区間のチャンクに橋のメッシュがあり、1 本 2,500 三角形以下', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => OVERPASSES.map(ov => {
    placeTruck(ov.s, X_TRV, 0, { coupled: false }); updateChunks(ov.s, 99);
    const c = chunks.get(Math.floor(ov.s / CHUNK)); let tris = 0, n = 0;
    c.grp.traverse(o => { if (o.userData.overpass) { n++; o.traverse(m => { if (m.isMesh) tris += triCount(m.geometry); }); } });
    return { s: Math.round(ov.s), n, tris };
  }));
  assert.ok(r.length >= 5, JSON.stringify(r));
  for (const b of r) assert.ok(b.n === 1 && b.tris > 20 && b.tris <= 2500, JSON.stringify(b));
  assert.deepEqual(errors, []);
}));

test('IC の出口の手前の走行車線に矢印、出口の道に「減速」がある', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const ramp = RAMPS.find(x => x.ic.i === 4), count = s => { placeTruck(s, X_TRV, 0, { coupled: false }); updateChunks(s, 99); const c = chunks.get(Math.floor(s / CHUNK)); const out = { arrow: 0, gen: 0 }; c.grp.traverse(o => { if (o.isInstancedMesh && o.material === RS_MAT.arrow) out.arrow += o.count; if (o.isInstancedMesh && o.material === RS_MAT.gen) out.gen += o.count; }); return out; };
    const a1 = count(ramp.sDiv - 300), a2 = count(ramp.sDiv - 150), g = count(ramp.sDiv + 40);
    return { arrows: a1.arrow + (Math.floor((ramp.sDiv - 300) / CHUNK) === Math.floor((ramp.sDiv - 150) / CHUNK) ? 0 : a2.arrow), gen: g.gen };
  });
  assert.ok(r.arrows >= 2 && r.gen >= 2, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('柵と植え込みが道路沿いにあり、高速沿いの家は柵の外（中心から 27.5 m より外）', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    let fenced = 0, shrubs = 0, inside = 0; const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = {};
    for (let s = S0 + 1000; s < ROUTE_END - 1000; s += 2000) {
      placeTruck(s, X_TRV, 0, { coupled: false }); updateChunks(s, 99);
      const c = chunks.get(Math.floor(s / CHUNK));
      c.grp.traverse(o => {
        if (o.isMesh && o.material === RS_MAT.fence) fenced++;
        if (o.isInstancedMesh && o.material === RS_MAT.shrub) shrubs += o.count;
        if (o.isInstancedMesh && o.material === MAT.house) for (let k = 0; k < o.count; k++) {   // house centres
          o.getMatrixAt(k, m); p.setFromMatrixPosition(m).add(c.grp.position); project(p.x, p.z, Math.floor(s / DS), q);
          if (Math.abs(q.lat) < 27.5 && fenceAt(q.s, Math.sign(q.lat))) inside++;
        }
      });
    }
    return { fenced, shrubs, inside };
  });
  assert.ok(r.fenced > 5 && r.shrubs > 0, JSON.stringify(r)); assert.equal(r.inside, 0, JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

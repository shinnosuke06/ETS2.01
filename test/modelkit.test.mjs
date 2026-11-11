import test from 'node:test'; import assert from 'node:assert/strict';
import { loadKit, stats } from './helpers/kit.mjs';
const K = loadKit(), near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
const ring = (r, z, n = 48) => Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * 2 * Math.PI), r * Math.sin(i / n * 2 * Math.PI), z]);
const samples = () => ({
  loft: K.loft([ring(1, 0), ring(1.2, 0.5), ring(0.8, 1)], { capStart: true, capEnd: true }),
  sweep: K.sweep([[0, 0], [0.3, 0], [0.3, 0.1], [0, 0.1]], [{ p: [0, 0, 0] }, { p: [0, 0, 1] }, { p: [0.5, 0, 2] }], { closed: true, capStart: true, capEnd: true }),
  roundBox: K.roundBox(1, 0.5, 2, 0.05), panel: K.panel(K.roundRectPts(0.6, 0.4, 0.05), 0.02),
  lathe: K.lathe([[0.1, 0], [0.3, 0.1], [0.3, 0.4], [0.1, 0.5]]), tube: K.tube([[0, 0, 0], [0, 1, 0], [1, 1, 0]], 0.02),
});
test('V1 道具の出力に壊れた値がなく、法線の長さは 1、つぶれた三角形がない', () => {
  for (const [name, g] of Object.entries(samples())) { const s = stats(g);
    assert.ok(s.finite, name); assert.ok(s.maxNormalErr < 1e-3, `${name} ${s.maxNormalErr}`); assert.equal(s.degenerate, 0, name); assert.ok(g.attributes.uv, name); }
});
test('V1 寸法は指定どおり（誤差 1 mm）', () => {
  const b = stats(K.roundBox(1, 0.5, 2, 0.05)).size, p = stats(K.panel(K.roundRectPts(0.6, 0.4, 0.05), 0.02)).size;
  assert.ok(near(b[0], 1) && near(b[1], 0.5) && near(b[2], 2), String(b)); assert.ok(near(p[0], 0.6) && near(p[1], 0.4) && near(p[2], 0.02), String(p));
});
test('V2 閉じた形は外向きで、体積が寸法からの値と 2% 以内', () => {
  const r = 0.05, a = 1 - 2 * r, b = 0.5 - 2 * r, c = 2 - 2 * r, box = a * b * c + 2 * r * (a * b + b * c + c * a) + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3;
  const vb = stats(K.roundBox(1, 0.5, 2, r)).volume; assert.ok(vb > 0 && Math.abs(vb - box) / box < 0.02, `${vb} ${box}`);
  const vc = stats(K.loft([ring(1, 0), ring(1, 1)], { capStart: true, capEnd: true })).volume; assert.ok(vc > 0 && Math.abs(vc - Math.PI) / Math.PI < 0.02, String(vc));
  const vf = stats(K.loft([ring(1, 0), ring(1, 1)], { capStart: true, capEnd: true, flip: true })).volume; assert.ok(vf < 0);
  const vs = stats(K.sweep([[0, 0], [0.3, 0], [0.3, 0.1], [0, 0.1]], [{ p: [0, 0, 0] }, { p: [0, 0, 2] }], { closed: true, capStart: true, capEnd: true })).volume; assert.ok(Math.abs(vs - 0.06) / 0.06 < 0.02, String(vs));
});
test('V3 細かさを下げると三角形が減る', () => {
  const n = d => { K.setDetail(d); return K.triCount(K.roundBox(1, 1, 1, 0.1, 4)) + K.triCount(K.lathe([[0.1, 0], [0.3, 0.2], [0.1, 0.4]], 24)) + K.triCount(K.tube([[0, 0, 0], [0, 1, 0], [1, 1, 0]], 0.02, 12)); };
  const hi = n(1), mid = n(0.6), lo = n(0.35); K.setDetail(1); assert.ok(hi > mid && mid > lo, `${hi} ${mid} ${lo}`);
});
test('creaseNormals：箱は面ごとの法線、球はなめらかな法線', () => {
  const T = K.THREE, box = K.creaseNormals(new T.BoxGeometry(1, 1, 1), 40), nb = box.attributes.normal.array;
  for (let i = 0; i < nb.length; i += 3) assert.ok(near(Math.max(Math.abs(nb[i]), Math.abs(nb[i + 1]), Math.abs(nb[i + 2])), 1, 1e-4));
  const sp = K.creaseNormals(new T.SphereGeometry(1, 24, 16), 40), p = sp.attributes.position.array, ns = sp.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) assert.ok(p[i] * ns[i] + p[i + 1] * ns[i + 1] + p[i + 2] * ns[i + 2] > 0.97);
});
test('shade は頂点の色を書き、部品の記録は箱と三角形の数を持つ', () => {
  const g = K.shade(K.roundBox(1, 1, 1, 0.1), (x, y) => (y > 0 ? 1 : 0.25)), c = g.attributes.color.array, p = g.attributes.position.array;
  for (let i = 0; i < c.length; i += 3) assert.ok(near(c[i], p[i + 1] > 0 ? 1 : 0.25, 1e-6));
  K.VEH_STATS.parts = {}; const P = new K.Parts(), m = new K.THREE.MeshBasicMaterial({ vertexColors: true });
  P.part('demo'); P.add(K.roundBox(1, 0.5, 2, 0.05), m, 0, 3, 0); P.part(null);
  const out = P.build(new K.THREE.Group()), s = K.VEH_STATS.parts.demo;
  assert.ok(s.tris > 0 && near(s.box[1], 2.75) && near(s.box[4], 3.25), JSON.stringify(s)); assert.ok(out[0].geometry.attributes.color, 'forceColor');
});

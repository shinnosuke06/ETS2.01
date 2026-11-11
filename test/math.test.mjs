import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { loadSim, flatRoad, PURE } from './helpers/sim.mjs';
test('数学の小道具と道路が Node で読める', () => {
  const sim = loadSim();
  assert.equal(sim.clamp(5, 0, 1), 1);
  assert.ok(Math.abs(sim.wrapA(3 * Math.PI) - Math.PI) < 1e-9);
  const p = sim.posAt(sim.S0, 0, {});
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.h));
});
test('ROAD は道路の関数を指し、平らな道に差し替えられる', () => {
  const sim = loadSim();
  assert.equal(sim.ROAD.gradeAt, sim.gradeAt);
  flatRoad(sim, { grade: 0.04 });
  assert.equal(sim.ROAD.gradeAt(123), 0.04);
  assert.deepEqual({ ...sim.ROAD.project(3, 50, 0, {}) }, { i: 0, s: 50, lat: -3 });
});
test('柵の位置：本線の終点の手前だけ（出口の帯の先は町につながる）', () => {
  const sim = loadSim(), r = sim.RAMPS[3];
  assert.equal(sim.roadBarrier(5000, -7.65), sim.ROUTE_END - 1.5);
  assert.equal(sim.roadBarrier(r.sEnd - 10, -40), sim.ROUTE_END - 1.5);
});
test('物理のファイルは画面の API を参照しない', () => {
  for (const f of PURE) {
    const u = new URL('../src/' + f, import.meta.url); if (!fs.existsSync(u)) continue;
    assert.doesNotMatch(fs.readFileSync(u, 'utf8'), /\b(THREE|document|window|localStorage|matchMedia)\b/, f);
  }
});
test('全ファイルをつなげても、名前の重複や構文エラーがない', () => {
  const dir = new URL('../src/', import.meta.url);
  const src = fs.readdirSync(dir).filter(f => f.endsWith('.js')).sort().map(f => fs.readFileSync(new URL(f, dir), 'utf8')).join('\n');
  assert.doesNotThrow(() => new Function(src));   // compiles the bundle without running it
});

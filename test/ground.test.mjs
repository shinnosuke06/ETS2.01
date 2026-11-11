// GROUND: the ground height, slope and walls at a point, as the physics asks for them.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad } from './helpers/sim.mjs';

// the wall push the rig worked out before GROUND, copied as the reference
function oldContact(sim, x, z, hint) {
  const pr = sim.ROAD.project(x, z, hint, {}), ivs = sim.ROAD.drivable(pr.s, []); let iv = ivs[0], bd = Infinity;
  for (const c of ivs) { const d = pr.lat < c[0] ? c[0] - pr.lat : pr.lat > c[1] ? pr.lat - c[1] : 0; if (d < bd) { bd = d; iv = c; } }
  const h = sim.ROAD.headingAt(pr.s), dir = pr.lat < iv[0] ? 1 : -1;
  return bd > 0 ? { pen: bd, nx: -dir * Math.cos(h), nz: dir * Math.sin(h) } : { pen: 0 };
}
test('T1 高速と出口の帯とトンネルの 2,000 か所以上で、壁と坂の答えが今の計算と同じ', () => {
  const sim = loadSim(), G = sim.GROUND; let n = 0;
  for (let s = 200; s < sim.ROUTE_END - 50; s += 37) for (const lat of [-45, -40, -30, -14, -12.5, -7, -1.5, 0.5]) {
    const p = sim.posAt(s, lat, {}), hint = Math.floor(s / sim.DS), a = oldContact(sim, p.x, p.z, hint), b = G.contact(p.x, p.z, hint, {});
    assert.ok(Math.abs(a.pen - b.pen) < 1e-9, `${s} ${lat}`);
    if (a.pen > 0) assert.ok(Math.abs(a.nx - b.nx) + Math.abs(a.nz - b.nz) < 1e-9, `${s} ${lat} normal`);
    const g = G.at(p.x, p.z, hint, {}), pr = sim.project(p.x, p.z, hint, {}), gr = sim.gradeAt(pr.s), h = sim.headingAt(pr.s);
    assert.ok(Math.abs(g.y - sim.elevAt(pr.s)) < 1e-9 && Math.abs(g.gx - gr * Math.sin(h)) < 1e-9 && Math.abs(g.gz - gr * Math.cos(h)) < 1e-9 && g.zone === 'road' && g.town === -1, `${s} ${lat} at`);
    n++;
  }
  assert.ok(n >= 2000, String(n));
});
test('道を差し替えると GROUND も平らでまっすぐな道を見る', () => {
  const sim = loadSim(); flatRoad(sim, { grade: 0.04, walls: true });
  const g = sim.GROUND.at(-7, 500, 0, {}); assert.ok(Math.abs(g.y - 20) < 1e-9 && Math.abs(g.gz - 0.04) < 1e-9, JSON.stringify(g));
  assert.ok(sim.GROUND.contact(-13.2, 500, 0, {}).pen > 0.99);
});

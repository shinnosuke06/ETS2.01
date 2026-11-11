// Driving the rig inside a town: the plaza bends, turning at junctions, walls and pavements.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, followPath } from './helpers/sim.mjs';

function town(i = 2) {
  const sim = loadSim(); sim.townLoad(i);
  const L = sim.TOWNS_LOADED.get(i).layout, site = L.site;
  const W = (u, v) => { const p = sim.townXZ(site, u, v, {}); return [p.x, p.z]; };
  const H = (du, dv) => site.hu + Math.atan2(dv, du);              // the rig's heading for a town direction
  const start = (trailer, u, v, du, dv, kmh = 15) => {
    sim.setRigTrailer(trailer, trailer ? 12000 : 0); sim.RIG.assistOn = true;
    const p = W(u, v); sim.placeTruckAt(p[0], p[1], H(du, dv), kmh / 3.6, { coupled: !!trailer });
  };
  const line = (a, b, n = 10) => { const out = []; for (let k = 0; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); return out; };
  const arc = (cu, cv, r, t0, t1, n = 16) => { const out = []; for (let k = 0; k <= n; k++) { const t = t0 + (t1 - t0) * k / n; out.push([cu + r * Math.cos(t), cv + r * Math.sin(t)]); } return out; };
  return { sim, L, site, W, H, start, line, arc, world: pts => pts.map(([u, v]) => W(u, v)) };
}
// a left turn from Main A's kerb lane (heading +v) into the cross street at node v = c, ending in its kerb lane heading -u
function leftTurn(T, R) {
  const { L, line, arc } = T, U = L.streets.filter(s => s.axis === 'u')[0], o = (U.lanes - 0.5) * U.laneW, ve = U.c - o, uA = -4.875;
  return [...line([uA, ve - R - 50], [uA, ve - R]), ...arc(uA - R, ve - R, R, 0, Math.PI / 2), ...line([uA - R, ve], [-95, ve])];
}
// a right turn from Main A's inner lane (heading +v) into the cross street's lane heading +u
function rightTurn(T, R) {
  const { L, line, arc } = T, U = L.streets.filter(s => s.axis === 'u')[0], ve = U.c + U.laneW / 2, uA = -1.625;
  return [...line([uA, ve - R - 50], [uA, ve - R]), ...arc(uA + R, ve - R, R, Math.PI, Math.PI / 2), ...line([uA + R, ve], [95, ve])];
}

test('T7 バンとタンクで、広場の出口・入口の曲がりと交差点の左折・右折を壁に当てずに通れる', () => {
  for (const trailer of ['van', 'tank']) {
    const runs = [];
    { const T = town(); T.start(trailer, -55, 0, 1, 0); runs.push(['exit', followPath(T.sim, T.world([...T.L.plaza.exitPath.slice(1), [-4.875, 95]]), 15)]); }
    { const T = town(); T.start(trailer, 4.875, 100, 0, -1); runs.push(['entry', followPath(T.sim, T.world([[4.875, 100], ...T.L.plaza.entryPath, [58, 0]]), 15)]); }
    { const T = town(), p = leftTurn(T, LEFT_R); T.start(trailer, p[0][0], p[0][1], 0, 1); runs.push(['left', followPath(T.sim, T.world(p), 15)]); }
    { const T = town(), p = rightTurn(T, RIGHT_R); T.start(trailer, p[0][0], p[0][1], 0, 1); runs.push(['right', followPath(T.sim, T.world(p), 15)]); }
    for (const [name, r] of runs) assert.ok(r.done && r.maxPen < 0.05 && r.rails === 0 && !r.jack, `${trailer} ${name} ${JSON.stringify(r)}`);
  }
});
const LEFT_R = 14, RIGHT_R = 16;

test('T7 建物の側の壁に 20 km/h で向かうと 2 m 以内で止まり、rail のできごとが出る', () => {
  const T = town(), { sim } = T;
  T.start(null, 4, 80, -1, 0, 20);                     // the kerb-side wall is at u = -10, the front 5.5 m ahead of the axle
  let rails = 0, minU = 0, hit = false;
  const front = () => sim.townUV(T.site, sim.TR.x + Math.sin(sim.TR.h) * sim.RIGP.front, sim.TR.z + Math.cos(sim.TR.h) * sim.RIGP.front, {}).u;
  for (let k = 0; k < 240 * 5; k++) {
    sim.stepTruck(1 / 240, hit ? { throttle: 0, brake: 1, steer: 0 } : { throttle: 0.3, brake: 0, steer: 0 });
    for (const e of sim.EVENTS) if (e.t === 'rail') { rails++; hit = true; } sim.EVENTS.length = 0;
    minU = Math.min(minU, front());
  }
  assert.ok(rails > 0, 'wall contact'); assert.ok(minU > -12, `front reached u = ${minU.toFixed(2)} (wall at -10)`);
  assert.ok(Math.abs(sim.TR.v) < 0.5 && front() > -10.6 && front() < -7, `v ${sim.TR.v}, front ${front()}`);
});
test('T7 歩道に斜めに乗り上げても止まらない（壁の接触なし）', () => {
  const T = town(), { sim } = T, a = 20 * Math.PI / 180;
  T.start(null, -3.5, 70, -Math.sin(a), Math.cos(a), 15);
  let rails = 0, walk = false;
  for (let k = 0; k < 240 * 1.6; k++) {
    sim.stepTruck(1 / 240, { throttle: 0.3, brake: 0, steer: 0 });
    for (const e of sim.EVENTS) if (e.t === 'rail') rails++; sim.EVENTS.length = 0;
    const fx = sim.TR.x + Math.sin(sim.TR.h) * 3.9, fz = sim.TR.z + Math.cos(sim.TR.h) * 3.9, q = sim.townUV(T.site, fx, fz, {});   // the front axle
    if (sim.GROUND.at(fx, fz, sim.TR.idx, {}).y > sim.townHeight(T.site, q.u, q.v) + 0.1) walk = true;
  }
  assert.equal(rails, 0); assert.ok(walk, 'went up on the pavement'); assert.ok(sim.TR.v > 3, `v ${sim.TR.v}`);
});

test('町の中に置いても壊れた扱いにならない（lat が −200 を超えても戻されない）、TR.zone は town', () => {
  const T = town(), { sim } = T;
  T.start(null, 0, 200, 0, 1, 10);
  for (let k = 0; k < 240; k++) sim.stepTruck(1 / 240, { throttle: 0.2, brake: 0, steer: 0 });
  assert.ok(sim.TR.lat < -200, `lat ${sim.TR.lat}`); assert.ok(!sim.EVENTS.some(e => e.t === 'reset')); assert.equal(sim.TR.zone, 'town'); assert.equal(sim.TR.town, 2);
  assert.ok(sim.TR.tv > 200 && sim.TR.tv < 210 && Math.abs(sim.TR.tu) < 0.5, `town position ${sim.TR.tu}, ${sim.TR.tv}`);
});

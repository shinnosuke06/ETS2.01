// Loads the DOM-free game sources into one function scope so tests can drive the physics in Node.
import fs from 'node:fs';
const SRC = new URL('../../src/', import.meta.url);
export const PURE = ['01a-math.js', '02-route.js', '02b-towns.js', '02c-ground.js', '02d-town-flow.js', '09a-powertrain.js', '09b-rig.js', '09c-truck.js'];
const NAMES = ['TAU', 'clamp', 'lerp', 'damp', 'wrapA', 'rng', 'S0', 'DS', 'X_TRV', 'ICS', 'RAMPS', 'TUNNELS', 'ROUTE_END',
  'posAt', 'project', 'elevAt', 'gradeAt', 'headingAt', 'drivable', 'rampAt', 'ROAD', 'roadBarrier', 'GROUND',
  'ENTRIES', 'entryEdges', 'entryAt', 'SIGNS', 'rampEdges', 'TOWN_SITES', 'townSite', 'townUV', 'townXZ', 'townInside', 'townLayout', 'townLimitAt', 'townGraphDistance', 'townPlazaPoint', 'townGroundBlend', 'townHeight', 'TCELL',
  'townLoad', 'townUnload', 'TOWNS_LOADED', 'townGrid', 'townGridSteps', 'townFallbackLayout', 'TOWN_U0', 'TOWN_V0', 'TOWN_CELL', 'TOWN_NU', 'TOWN_NV', 'placeTruckAt', 'parkTrailerAt', 'routeHint',
  'signalState', 'townIdm', 'townCarsInit', 'townCarsStep', 'townCarPose', 'townPlayerBoxes', 'townRedLight', 'dockCheck', 'bayCheck', 'resolveBoxContact', 'townNearestLane',
  'EVENTS', 'GEARS', 'VMAX', 'engineTorque', 'startGear', 'powertrainStep',
  'MU', 'RIGP', 'RIG', 'rigSetTrailer', 'rigPlace', 'rigParkTrailer', 'rigStep', 'rigPose', 'rigApplyImpulse', 'rigAxleLoads', 'rigSteerLimit',
  'TRAILERS', 'TR', 'steerLock', 'setRigTrailer', 'placeTruck', 'parkTrailer', 'stepTruck', 'physicsAdvance',
  'requestCouple', 'requestUncouple', 'canAutoCouple', 'towReset', 'resolveCarContact'];
// `extra` is source appended after the game files (for globals that live in browser-only files).
export function loadSim({ extra = '' } = {}) {
  const src = PURE.filter(f => fs.existsSync(new URL(f, SRC))).map(f => fs.readFileSync(new URL(f, SRC), 'utf8')).join('\n');
  const ret = NAMES.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  return new Function(`${src}\n${extra}\n;return { ${ret} };`)();
}
export const H = 1 / 240;
// Replace the road with a straight line along +z (lat = -x), constant grade, optional guardrails.
export function flatRoad(sim, { grade = 0, walls = false } = {}) {
  const R = sim.ROAD;
  R.project = (x, z, hint, out) => { out.i = 0; out.s = z; out.lat = -x; return out; };
  R.posAt = (s, lat, out) => { out.x = -lat; out.z = s; out.y = grade * s; out.h = 0; return out; };
  R.elevAt = s => grade * s; R.gradeAt = () => grade; R.headingAt = () => 0;
  R.drivable = (s, out) => { out.length = 0; out.push(walls ? [-12.2, -1.75] : [-1e9, 1e9]); return out; };
  R.barrier = () => Infinity; R.rampAt = () => null;
}
export function setup(sim, { trailer = 'van', cargo = 12000, v = 0, lat = -7.65, s = 1000, assist = true } = {}) {
  sim.setRigTrailer(trailer, cargo); sim.RIG.assistOn = assist;
  sim.placeTruck(s, lat, v, { coupled: !!trailer }); sim.EVENTS.length = 0;
}
export function run(sim, seconds, input, each) {
  const n = Math.round(seconds / H);
  for (let k = 0; k < n; k++) { const t = k * H; sim.stepTruck(H, input(t)); if (each && each(t) === false) return t; }
  return seconds;
}
export const kmh = sim => sim.TR.v * 3.6;
export function laneKeep(sim, lat) {
  const T = sim.TR, da = sim.wrapA(T.h - sim.ROAD.headingAt(T.s));
  return sim.clamp(0.35 * (lat - T.lat) + 9 * da * (0.4 + Math.abs(T.v) / 25), -1, 1);
}
export function steerForLatAcc(sim, g) { const v = Math.abs(sim.TR.v); return Math.atan(g * 9.81 * 3.9 / (v * v)) / sim.steerLock(v); }
// Drive along pts ([[x, z], ...] in the world) with pure pursuit (8 m look-ahead) at about kmh.
// Returns { done, maxPen, rails, jack, t }: reached the last point, the deepest any body corner went into
// a wall, how many wall-contact events, whether it jackknifed, and the time taken.
export function followPath(sim, path, kmh, { seconds = 120, look = 8 } = {}) {
  const T = sim.TR, R = sim.RIGP, G = sim.GROUND, c = {}, pts = [path[0]];
  for (let i = 1; i < path.length; i++) {            // every metre, so the look-ahead point is where it should be
    const [a, b] = [path[i - 1], path[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])));
    for (let k = 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
  }
  let j = 0, maxPen = 0, rails = 0, t = 0;
  const corners = () => {
    const out = [], spec = sim.TRAILERS[T.trailerKey];
    for (const [x, z, h, f, b] of [[T.x, T.z, T.h, R.front, R.back], ...(spec && T.link === 'coupled' ? [[T.tr.kx, T.tr.kz, T.tr.h, spec.nose, spec.rear]] : [])])
      for (const a of [f, -b]) for (const w of [-1.25, 1.25]) out.push([x + Math.sin(h) * a + Math.cos(h) * w, z + Math.cos(h) * a - Math.sin(h) * w]);
    return out;
  };
  sim.EVENTS.length = 0;
  while (t < seconds) {
    // the nearest path point from where we were, then the point `look` metres further on
    while (j < pts.length - 1 && Math.hypot(pts[j + 1][0] - T.x, pts[j + 1][1] - T.z) <= Math.hypot(pts[j][0] - T.x, pts[j][1] - T.z)) j++;
    let k = j, acc = 0;
    while (k < pts.length - 1 && acc < look) { acc += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); k++; }
    const end = pts[pts.length - 1];
    if (Math.hypot(end[0] - T.x, end[1] - T.z) < 3) return { done: true, maxPen, rails, jack: !!sim.RIG.jack, t };
    const dx = pts[k][0] - T.x, dz = pts[k][1] - T.z, fx = Math.sin(T.h), fz = Math.cos(T.h);
    const alpha = Math.atan2(dx * Math.cos(T.h) - dz * Math.sin(T.h), dx * fx + dz * fz);   // left positive
    const delta = Math.atan(2 * 3.9 * Math.sin(alpha) / Math.max(4, Math.hypot(dx, dz)));
    const lock = sim.steerLock(T.v), v = T.v * 3.6;
    const inp = { steer: sim.clamp(-delta / lock, -1, 1), throttle: sim.clamp((kmh - v) * 0.25, 0, 1), brake: sim.clamp((v - kmh - 2) * 0.15, 0, 1) };
    for (let n = 0; n < 4; n++) sim.stepTruck(1 / 240, inp);
    t += 4 / 240;
    for (const [x, z] of corners()) { G.contact(x, z, T.idx, c); if (c.pen > maxPen) maxPen = c.pen; }
    for (const e of sim.EVENTS) if (e.t === 'rail') rails++;
    sim.EVENTS.length = 0;
  }
  return { done: false, maxPen, rails, jack: !!sim.RIG.jack, t };
}

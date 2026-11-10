// Loads the DOM-free game sources into one function scope so tests can drive the physics in Node.
import fs from 'node:fs';
const SRC = new URL('../../src/', import.meta.url);
export const PURE = ['01a-math.js', '02-route.js', '09-physics.js', '09a-powertrain.js', '09b-rig.js', '09c-truck.js'];
const NAMES = ['TAU', 'clamp', 'lerp', 'damp', 'wrapA', 'rng', 'S0', 'DS', 'X_TRV', 'ICS', 'RAMPS', 'TUNNELS', 'ROUTE_END',
  'posAt', 'project', 'elevAt', 'gradeAt', 'headingAt', 'drivable', 'rampAt', 'ROAD', 'roadBarrier',
  'EVENTS', 'GEARS', 'VMAX', 'engineTorque', 'startGear', 'powertrainStep',
  'MU', 'RIGP', 'RIG', 'rigSetTrailer', 'rigPlace', 'rigParkTrailer', 'rigStep', 'rigPose', 'rigApplyImpulse', 'rigAxleLoads', 'rigSteerLimit',
  'TRAILERS', 'TR', 'steerLock', 'setRigTrailer', 'placeTruck', 'parkTrailer', 'stepTruck', 'physicsAdvance',
  'requestCouple', 'requestUncouple', 'canAutoCouple', 'towReset', 'resolveCarContact'];
export function loadSim() {
  const src = PURE.filter(f => fs.existsSync(new URL(f, SRC))).map(f => fs.readFileSync(new URL(f, SRC), 'utf8')).join('\n');
  const ret = NAMES.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  return new Function(`${src}\n;return { ${ret} };`)();
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

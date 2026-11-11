// Loads the THREE geometry helpers and the vehicle model kit into one function scope for Node tests.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const SRC = new URL('../../src/', import.meta.url);
const NAMES = ['setDetail', 'seg', 'loft', 'sweep', 'roundBox', 'roundRectPts', 'panel', 'lathe', 'tube', 'creaseNormals', 'shade', 'triCount',
  'Parts', 'mergeGeometries', 'VEH_STATS', 'statPart'];
export function loadKit() {
  const THREE = require('three');
  const src = ['01a-math.js', '01b-three.js', '06a-modelkit.js'].map(f => fs.readFileSync(new URL(f, SRC), 'utf8')).join('\n');
  const ret = NAMES.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  return new Function('THREE', `${src}\n;return { THREE, ${ret} };`)(THREE);
}
// Facts about a geometry: are all numbers finite, how far normals are from unit length, how many triangles
// have no area, its bounding box, and the signed volume it encloses (positive when the faces point outward).
export function stats(geo) {
  const P = geo.attributes.position, N = geo.attributes.normal, idx = geo.index ? geo.index.array : null;
  const n = idx ? idx.length : P.count;
  let finite = true, maxNormalErr = 0, degenerate = 0, volume = 0;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    if (!Number.isFinite(x + y + z)) finite = false;
    const c = [x, y, z]; for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], c[k]); max[k] = Math.max(max[k], c[k]); }
    if (N) {
      const nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
      if (!Number.isFinite(nx + ny + nz)) finite = false;
      maxNormalErr = Math.max(maxNormalErr, Math.abs(Math.hypot(nx, ny, nz) - 1));
    } else maxNormalErr = Infinity;
  }
  const v = i => { const j = idx ? idx[i] : i; return [P.getX(j), P.getY(j), P.getZ(j)]; };
  for (let t = 0; t + 2 < n; t += 3) {
    const a = v(t), b = v(t + 1), c = v(t + 2);
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(...cr) < 1e-10) degenerate++;
    volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
  }
  return { finite, maxNormalErr, degenerate, min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], volume };
}

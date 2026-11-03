'use strict';
// ---------------------------------------------------------------------------
// Small math helpers, seeded random, value noise, geometry merging.
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2, DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y, oct = 4, seed = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const yen = n => (n < 0 ? '-¥' : '¥') + Math.abs(Math.round(n)).toLocaleString('ja-JP');
function fmtClock(gameSec) {
  const t = ((gameSec % 86400) + 86400) % 86400;
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h + ':' + String(m).padStart(2, '0');
}
function lsGet(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } }

const IS_TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window; } catch (e) { return false; } })();

function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

// ---- geometry helpers ------------------------------------------------------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v3 = new THREE.Vector3(), _s3 = new THREE.Vector3();
function xform(geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e);
  _m4.compose(_v3.set(x, y, z), _q, _s3.set(sx, sy, sz));
  geo.applyMatrix4(_m4);
  return geo;
}
function colorize(geo, hex) {
  const c = new THREE.Color(hex);
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}
function mergeGeometries(list) {
  const geos = list.map(g => (g.index ? g.toNonIndexed() : g));
  const hasColor = geos.some(g => g.attributes.color);
  let total = 0;
  for (const g of geos) total += g.attributes.position.count;
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), uv = new Float32Array(total * 2);
  const col = hasColor ? new Float32Array(total * 3) : null;
  let o = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) { if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + n) * 3); }
    o += n;
  }
  geos.forEach((g, i) => { if (g !== list[i]) g.dispose(); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// Collects transformed parts per material and merges them into one mesh each.
class Parts {
  constructor() { this.lists = new Map(); this.stack = []; this.base = new THREE.Matrix4(); }
  push(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    this.stack.push(this.base.clone());
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    this.base.multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(1, 1, 1)));
    return this;
  }
  pop() { this.base = this.stack.pop(); return this; }
  add(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    xform(geo, x, y, z, rx, ry, rz, sx, sy, sz);
    geo.applyMatrix4(this.base);
    if (!this.lists.has(mat)) this.lists.set(mat, []);
    this.lists.get(mat).push(geo);
    return geo;
  }
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz); }
  cyl(mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, rx, ry, rz); }
  build(parent, { cast = false, receive = false } = {}) {
    const out = [];
    for (const [mat, list] of this.lists) {
      const g = mergeGeometries(list);
      list.forEach(x => x.dispose());
      const m = new THREE.Mesh(g, mat);
      m.castShadow = cast; m.receiveShadow = receive;
      parent.add(m); out.push(m);
    }
    this.lists.clear();
    return out;
  }
}

// A side profile [[z,y],...] extruded across x0..x1 (soft edges with bevel).
function extrudeX(pts, x0, x1, bevel = 0) {
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  const depth = Math.max(0.001, x1 - x0 - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel,
    bevelSegments: 2, steps: 1, curveSegments: 4,
  });
  // (sx, sy, ez) -> (x1 - bevel - ez, sy, sx): a proper rotation, so winding is kept.
  const m = new THREE.Matrix4().set(0, 0, -1, x1 - bevel, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1);
  g.applyMatrix4(m);
  return g;
}

// Quad from 4 points; flips winding so the face points along `facing`.
function quadGeo(p0, p1, p2, p3, facing, uv = [0, 0, 1, 0, 1, 1, 0, 1]) {
  const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), c = new THREE.Vector3(...p2);
  const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
  let P = [p0, p1, p2, p3], U = [[uv[0], uv[1]], [uv[2], uv[3]], [uv[4], uv[5]], [uv[6], uv[7]]];
  if (facing && n.dot(new THREE.Vector3(...facing)) < 0) { P = [p0, p3, p2, p1]; U = [U[0], U[3], U[2], U[1]]; }
  const pos = new Float32Array([...P[0], ...P[1], ...P[2], ...P[0], ...P[2], ...P[3]]);
  const uvs = new Float32Array([...U[0], ...U[1], ...U[2], ...U[0], ...U[2], ...U[3]]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Triangular prism roof: base at y=0 spans x,z in [-0.5,0.5], ridge at y=1 along z.
function roofGeo() {
  const v = [
    0.5, 0, -0.5, -0.5, 0, -0.5, 0, 1, -0.5,
    -0.5, 0, 0.5, 0.5, 0, 0.5, 0, 1, 0.5,
    -0.5, 0, -0.5, -0.5, 0, 0.5, 0, 1, 0.5, -0.5, 0, -0.5, 0, 1, 0.5, 0, 1, -0.5,
    0.5, 0, 0.5, 0.5, 0, -0.5, 0, 1, -0.5, 0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(v.length / 3 * 2), 2));
  g.computeVertexNormals();
  return g;
}

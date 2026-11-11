// ---------------------------------------------------------------------------
// GROUND: what the physics and the truck ask about the ground at a point —
// its height and slope, and how far a point has gone into a wall. On the
// expressway and its ramps the answers come from ROAD (the same numbers the
// physics used before); towns add their own answers (see 02b-towns.js).
// GROUND looks at ROAD on every call, so tests that swap ROAD for a flat road
// also change what GROUND says.
// ---------------------------------------------------------------------------
const _gpr = { i: 0, s: 0, lat: 0 }, _giv = [];
const GROUND = {
  towns: [],
  // out = { y, gx, gz, zone, town, s, lat, i }: height, uphill slope along x and z, 'road' | 'town'
  at(x, z, hint, out) {
    const R = ROAD;
    R.project(x, z, hint, _gpr);
    const s = _gpr.s, g = R.gradeAt(s), h = R.headingAt(s);
    out.y = R.elevAt(s); out.gx = g * Math.sin(h); out.gz = g * Math.cos(h);
    out.zone = 'road'; out.town = -1; out.s = s; out.lat = _gpr.lat; out.i = _gpr.i;
    return out;
  },
  // out = { pen, nx, nz, tx, tz, i }: how far the point is outside the drivable ground (0: inside),
  // the way back in, and the direction along the wall
  contact(x, z, hint, out) {
    const R = ROAD;
    R.project(x, z, hint, _gpr);
    const ivs = R.drivable(_gpr.s, _giv), lat = _gpr.lat;
    let iv = ivs[0], bd = Infinity;
    for (const c of ivs) {
      const d = lat < c[0] ? c[0] - lat : lat > c[1] ? lat - c[1] : 0;
      if (d < bd) { bd = d; iv = c; }
    }
    const h = R.headingAt(_gpr.s), tx = Math.sin(h), tz = Math.cos(h);
    out.i = _gpr.i; out.tx = tx; out.tz = tz;
    if (!(bd > 0)) { out.pen = 0; out.nx = out.nz = 0; return out; }
    const dir = lat < iv[0] ? 1 : -1;                       // back toward the road
    out.pen = bd; out.nx = -dir * tz; out.nz = dir * tx;
    return out;
  },
  // how far the point is past the closure ahead (positive: into it)
  barrier(x, z, hint) {
    ROAD.project(x, z, hint, _gpr);
    return _gpr.s - ROAD.barrier(_gpr.s, _gpr.lat);
  },
};

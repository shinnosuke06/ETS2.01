// ---------------------------------------------------------------------------
// GROUND: what the physics and the truck ask about the ground at a point —
// its height and slope, and how far a point has gone into a wall. On the
// expressway and its ramps the answers come from ROAD (the same numbers the
// physics used before); towns add their own answers (see 02b-towns.js).
// GROUND looks at ROAD on every call, so tests that swap ROAD for a flat road
// also change what GROUND says.
// ---------------------------------------------------------------------------
const _gpr = { i: 0, s: 0, lat: 0 }, _giv = [], _guv = { u: 0, v: 0 };
// The loaded town whose area holds the point (its town coordinates are left in _guv), or null.
function _groundTown(x, z) {
  for (const i of GROUND.towns) {
    const T = TOWNS_LOADED.get(i);
    if (!T) continue;
    townUV(T.layout.site, x, z, _guv);
    if (townInside(_guv.u, _guv.v)) return T;
  }
  return null;
}
// A route sample index near a world point, for a first projection from far away (placing the rig).
function routeHint(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < NP; i += 25) { const d = (PX[i] - x) ** 2 + (PZ[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return best;
}
const GROUND = {
  towns: [],
  // out = { y, gx, gz, zone, town, s, lat, i }: height, uphill slope along x and z, 'road' | 'town'
  at(x, z, hint, out) {
    const R = ROAD, T = this.towns.length ? _groundTown(x, z) : null;
    R.project(x, z, hint, _gpr);
    if (T) {
      const site = T.layout.site, u = _guv.u, v = _guv.v, e = 0.5;
      const hu = (townHeight(site, u + e, v) - townHeight(site, u - e, v)) / (2 * e), hv = (townHeight(site, u, v + e) - townHeight(site, u, v - e)) / (2 * e);
      out.y = townHeight(site, u, v) + (townCellAt(T.grid, u, v) === TCELL.WALK ? 0.15 : 0);
      out.gx = hu * site.Fx + hv * site.Lx; out.gz = hu * site.Fz + hv * site.Lz;
      out.zone = 'town'; out.town = site.i; out.s = _gpr.s; out.lat = _gpr.lat; out.i = _gpr.i;
      return out;
    }
    const s = _gpr.s, g = R.gradeAt(s), h = R.headingAt(s);
    out.y = R.elevAt(s); out.gx = g * Math.sin(h); out.gz = g * Math.cos(h);
    out.zone = 'road'; out.town = -1; out.s = s; out.lat = _gpr.lat; out.i = _gpr.i;
    return out;
  },
  // out = { pen, nx, nz, tx, tz, i }: how far the point is outside the drivable ground (0: inside),
  // the way back in, and the direction along the wall
  contact(x, z, hint, out) {
    const R = ROAD, T = this.towns.length ? _groundTown(x, z) : null;
    if (T) {
      const site = T.layout.site, u = _guv.u, v = _guv.v, d = townSample(T.grid, u, v), e = 0.25;
      let du = townSample(T.grid, u + e, v) - townSample(T.grid, u - e, v), dv = townSample(T.grid, u, v + e) - townSample(T.grid, u, v - e);
      const m = Math.hypot(du, dv);
      if (m > 1e-9) { du /= m; dv /= m; } else { du = 0; dv = -1; }   // deep inside a wall: back toward the expressway side
      out.i = hint; out.pen = Math.max(0, -d);
      out.nx = du * site.Fx + dv * site.Lx; out.nz = du * site.Fz + dv * site.Lz; out.tx = -out.nz; out.tz = out.nx;
      return out;
    }
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

// ---------------------------------------------------------------------------
// The route: a Tomei-style expressway from Tokyo to Nagoya at 1:10 map scale.
// Road coordinates: s = distance along the centreline (game metres),
// lat = lateral offset, positive to the right of the westbound direction.
// Westbound (our) carriageway is on the left (lat < 0): Japan drives on the left.
// ---------------------------------------------------------------------------
const DS = 4;            // sample spacing (m)
const SCALE = 10;        // 1 game km = 10 real km on signs and in jobs
const S0 = 300;          // s of Tokyo IC (kp 0)
const TIME_SCALE = 10;   // game clock runs 10x

const LANE_W = 3.6;
const X_OVT = -4.05;     // overtaking lane centre (追越車線)
const X_TRV = -7.65;     // travel lane centre (走行車線)
const X_EDGE = -9.45;    // outer edge line
const X_PAVE = -12.2;    // pavement edge
const X_RAIL = -12.35;   // guardrail
const ROAD_IN = 12.2;    // terrain starts at the pavement edge (|lat|)

const ICS = [
  { jp: '東京', en: 'Tokyo', kp: 0 },
  { jp: '横浜町田', en: 'Yokohama-Machida', kp: 19.7 },
  { jp: '厚木', en: 'Atsugi', kp: 35.0 },
  { jp: '大井松田', en: 'Oimatsuda', kp: 57.9 },
  { jp: '御殿場', en: 'Gotemba', kp: 83.7 },
  { jp: '沼津', en: 'Numazu', kp: 103.0 },
  { jp: '富士', en: 'Fuji', kp: 120.4 },
  { jp: '静岡', en: 'Shizuoka', kp: 162.0 },
  { jp: '掛川', en: 'Kakegawa', kp: 208.0 },
  { jp: '浜松', en: 'Hamamatsu', kp: 240.0 },
  { jp: '豊川', en: 'Toyokawa', kp: 290.0 },
  { jp: '岡崎', en: 'Okazaki', kp: 306.0 },
  { jp: '名古屋', en: 'Nagoya', kp: 325.0 },
];
const kpToS = kp => S0 + kp * 1000 / SCALE;
const sToKp = s => (s - S0) * SCALE / 1000;
ICS.forEach((ic, i) => { ic.i = i; ic.s = kpToS(ic.kp); });
const ROUTE_LEN = ICS[ICS.length - 1].s + 1400;
const ROUTE_END = ROUTE_LEN - 300; // closure barrier
const NP = Math.floor(ROUTE_LEN / DS) + 2;

// Region table, interpolated along kp.
// kp, base elev, rolling amp, hill amp, slope L, slope R, town, forest, curviness, sound walls, paddy, tea, limit
const REG_KEYS = ['kp', 'base', 'amp', 'hill', 'sl', 'sr', 'town', 'forest', 'curv', 'wall', 'paddy', 'tea', 'lim'];
const REG = [
  [0, 12, 5, 14, .02, .03, 1.0, .25, .6, 1.0, .1, 0, 100],
  [25, 25, 8, 22, .04, .05, .8, .35, .7, .7, .2, 0, 100],
  [45, 35, 10, 35, .06, .08, .45, .55, .9, .2, .4, 0, 100],
  [58, 45, 12, 70, .14, .18, .2, .85, 1.3, 0, .2, 0, 80],
  [72, 95, 14, 120, .22, .26, .05, 1.0, 1.5, 0, 0, 0, 80],
  [86, 115, 8, 55, .04, .12, .35, .55, 1.0, .1, .3, 0, 100],
  [105, 45, 6, 35, .03, .08, .7, .35, .8, .4, .4, 0, 100],
  [124, 14, 2, 60, 0, .30, .3, .6, .9, 0, 0, 0, 100],
  [146, 16, 4, 50, .04, .2, .5, .5, .9, .3, .2, .2, 100],
  [166, 35, 12, 100, .16, .2, .1, 1.0, 1.3, 0, 0, .1, 80],
  [182, 40, 10, 30, .04, .05, .3, .4, .9, 0, .2, 1.0, 100],
  [215, 20, 6, 18, .02, .03, .55, .3, .7, .2, .7, .3, 100],
  [248, 8, 1, 12, 0, 0, .3, .3, .6, 0, .3, 0, 100],
  [262, 25, 10, 70, .12, .14, .1, .9, 1.2, 0, .2, 0, 100],
  [282, 18, 5, 20, .03, .03, .6, .35, .7, .4, .6, 0, 100],
  [310, 12, 4, 12, .02, .02, .9, .2, .6, .8, .3, 0, 100],
  [400, 12, 4, 12, .02, .02, .9, .2, .6, .8, .3, 0, 100],
];
const _reg = {};
function regionAt(s, out = _reg) {
  const kp = sToKp(s);
  let i = 0;
  while (i < REG.length - 2 && REG[i + 1][0] < kp) i++;
  const a = REG[i], b = REG[i + 1];
  const t = smooth(a[0], b[0], kp);
  for (let k = 1; k < REG_KEYS.length; k++) out[REG_KEYS[k]] = a[k] + (b[k] - a[k]) * t;
  out.lim = kp >= a[0] && kp < b[0] ? a[12] : b[12];
  return out;
}

const WATER = [{ kp0: 127, kp1: 145, side: -1 }, { kp0: 251.5, kp1: 255.5, side: 0 }];
function waterAt(s, side) {
  const kp = sToKp(s);
  for (const w of WATER) {
    if (w.side !== 0 && w.side !== side) continue;
    const t = smooth(w.kp0 - 1.5, w.kp0, kp) * (1 - smooth(w.kp1, w.kp1 + 1.5, kp));
    if (t > 0) return t;
  }
  return 0;
}

const TUNNELS = [
  { jp: '都夫良野トンネル', en: 'TSUBURANO TUNNEL', kp: 64.5, len: 540 },
  { jp: '日本坂トンネル', en: 'NIHONZAKA TUNNEL', kp: 171.5, len: 820 },
  { jp: '宇利トンネル', en: 'URI TUNNEL', kp: 270.5, len: 460 },
].map(t => ({ ...t, s0: kpToS(t.kp), s1: kpToS(t.kp) + t.len }));
function tunnelAt(s, margin = 0) {
  for (const t of TUNNELS) if (s >= t.s0 - margin && s <= t.s1 + margin) return t;
  return null;
}
function tunnelFactor(s) {
  let f = 0;
  for (const t of TUNNELS) f = Math.max(f, smooth(t.s0 - 130, t.s0 + 5, s) * (1 - smooth(t.s1 - 5, t.s1 + 130, s)));
  return f;
}

// ---- exit ramps (左側の出口) and entrance ramps (入口) ------------------------
// An exit ramp leaves the travel lane at ic.s - 500 and reaches lat -40 by ic.s + 100, where it bends into the
// town's toll plaza (02b-towns.js). An entrance ramp starts there at ic.s + 150 and joins the travel lane by ic.s + 600.
const RAMP_LEN = 600, RAMP_X = -40, ENTRY_LEN = 450;
function rampCx(u) {
  if (u < 250) return -11.25;
  if (u < 600) return lerp(-11.25, RAMP_X, smooth(250, 600, u));
  return RAMP_X;
}
// Ramp lane: 1.0 m left shoulder, 3.6 m lane, 0.4 m right strip. cx = lane centre.
const _re = { cx: 0, xl: 0, xr: 0 };
function rampEdges(u, out = _re) {
  const cx = rampCx(u);
  let xl = cx - 2.8; const xr = cx + 2.2;
  if (u < 110) xl = lerp(-9.05, cx - 2.8, smooth(0, 110, u));
  out.cx = cx; out.xl = xl; out.xr = xr;
  return out;
}
const RAMPS = ICS.slice(1).map(ic => ({ ic, sDiv: ic.s - 500, uSep: 330 }));
for (const r of RAMPS) {
  for (let u = 250; u < 600; u += 1) { if (rampEdges(u).xr < -12.75) { r.uSep = u; break; } }
  r.sEnd = r.sDiv + RAMP_LEN;
}
function rampAt(s) {
  for (const r of RAMPS) if (s >= r.sDiv && s <= r.sEnd) return r;
  return null;
}
// Entrance lane: the same widths as the exit lane; from lat -40 it comes over to the travel lane in 250 m, runs
// 200 m beside it as an acceleration lane, and its outer edge closes in over the last 50 m.
function entryCx(u) { return u < 250 ? lerp(RAMP_X, -11.25, smooth(0, 250, u)) : -11.25; }
const _ee = { cx: 0, xl: 0, xr: 0 };
function entryEdges(u, out = _ee) {
  const cx = entryCx(u);
  let xl = cx - 2.8; const xr = cx + 2.2;
  if (u > 400) xl = lerp(cx - 2.8, -12.2, smooth(400, ENTRY_LEN, u));
  out.cx = cx; out.xl = xl; out.xr = xr;
  return out;
}
const ENTRIES = ICS.slice(0, -1).map(ic => ({ ic, s0: ic.s + 150, s1: ic.s + 150 + ENTRY_LEN }));
function entryAt(s) {
  for (const e of ENTRIES) if (s >= e.s0 && s <= e.s1) return e;
  return null;
}

// ---- centreline samples ------------------------------------------------------
const PX = new Float64Array(NP), PY = new Float64Array(NP), PZ = new Float64Array(NP), PH = new Float64Array(NP);
const TX = new Float64Array(NP), TZ = new Float64Array(NP), RX = new Float64Array(NP), RZ = new Float64Array(NP);
(function buildRoute() {
  const rr = rng(20261103);
  const K = new Float32Array(NP);
  const p = {};
  let s = 600;
  while (s < ROUTE_LEN) {
    regionAt(s, p);
    s += lerp(380, 1300, rr()) / p.curv;
    const R = Math.max(560, lerp(700, 2400, rr()) / p.curv);
    const arc = lerp(200, 650, rr()), tr = 110, total = arc + 2 * tr;
    const dir = rr() < 0.5 ? -1 : 1;
    for (let u = 0; u < total; u += DS) {
      const i = Math.floor((s + u) / DS); if (i >= NP) break;
      let k = dir / R;
      if (u < tr) k *= u / tr; else if (u > arc + tr) k *= (total - u) / tr;
      K[i] = k;
    }
    s += total;
  }
  PH[0] = 0; PX[0] = 0; PZ[0] = 0;
  for (let i = 0; i < NP - 1; i++) {
    PH[i + 1] = PH[i] + K[i] * DS;
    const hm = (PH[i] + PH[i + 1]) / 2;
    PX[i + 1] = PX[i] + Math.sin(hm) * DS;
    PZ[i + 1] = PZ[i] + Math.cos(hm) * DS;
  }
  const raw = new Float64Array(NP);
  for (let i = 0; i < NP; i++) {
    const si = i * DS; regionAt(si, p);
    raw[i] = p.base + p.amp * (0.65 * Math.sin(si / 1350 + 0.7) + 0.35 * Math.sin(si / 470 + 2.1));
    if (waterAt(si, -1) > 0 || waterAt(si, 1) > 0) raw[i] = Math.max(raw[i], 8);
  }
  // two box-blur passes (±100 m) keep grades gentle
  const tmp = new Float64Array(NP);
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? raw : PY, dst = pass === 0 ? tmp : PY;
    const W = 25; let acc = 0, cnt = 0;
    const out = new Float64Array(NP);
    for (let i = -W; i < NP; i++) {
      const add = i + W; if (add < NP) { acc += src[add]; cnt++; }
      const rem = i - W - 1; if (rem >= 0) { acc -= src[rem]; cnt--; }
      if (i >= 0) out[i] = acc / cnt;
    }
    dst.set(out);
    if (pass === 0) PY.set(tmp);
  }
  for (let i = 0; i < NP; i++) {
    TX[i] = Math.sin(PH[i]); TZ[i] = Math.cos(PH[i]);
    RX[i] = -Math.cos(PH[i]); RZ[i] = Math.sin(PH[i]);
  }
})();

function idxAt(s) { return clamp(Math.floor(s / DS), 0, NP - 2); }
function elevAt(s) { const i = idxAt(s), f = clamp(s / DS - i, 0, 1); return PY[i] + (PY[i + 1] - PY[i]) * f; }
function gradeAt(s) { const i = idxAt(s); return (PY[i + 1] - PY[i]) / DS; }
function headingAt(s) { const i = idxAt(s), f = clamp(s / DS - i, 0, 1); return PH[i] + (PH[i + 1] - PH[i]) * f; }
function posAt(s, lat, out) {
  const i = idxAt(s), f = clamp(s / DS - i, 0, 1);
  const h = PH[i] + (PH[i + 1] - PH[i]) * f;
  out.x = PX[i] + (PX[i + 1] - PX[i]) * f - Math.cos(h) * lat;
  out.z = PZ[i] + (PZ[i + 1] - PZ[i]) * f + Math.sin(h) * lat;
  out.y = PY[i] + (PY[i + 1] - PY[i]) * f;
  out.h = h;
  return out;
}
// Project a world point onto the road, walking from a hint index.
function project(x, z, hint, out) {
  let i = clamp(hint | 0, 0, NP - 2);
  for (let k = 0; k < 400; k++) {
    const along = (x - PX[i]) * TX[i] + (z - PZ[i]) * TZ[i];
    if (along > DS && i < NP - 2) i++;
    else if (along < 0 && i > 0) i--;
    else break;
  }
  const along = (x - PX[i]) * TX[i] + (z - PZ[i]) * TZ[i];
  out.i = i;
  out.s = i * DS + along;
  out.lat = (x - PX[i]) * RX[i] + (z - PZ[i]) * RZ[i];
  return out;
}

// Drivable lateral intervals for the westbound side at s.
function drivable(s, out) {
  out.length = 0;
  let lo = -12.2, hi = -1.75;
  if (tunnelAt(s)) { lo = -12.55; hi = -1.25; }
  const r = rampAt(s), en = r ? null : entryAt(s);
  const e = r ? rampEdges(s - r.sDiv) : en ? entryEdges(s - en.s0) : null;
  if (e) {
    if (e.xr >= lo - 0.2) out.push([Math.min(lo, e.xl + 0.2), hi]);
    else { out.push([lo, hi]); out.push([e.xl + 0.2, e.xr - 0.1]); }
  } else out.push([lo, hi]);
  return out;
}

// ---- signs ----------------------------------------------------------------
const SIGNS = [];
(function placeSigns() {
  const free = (s, m = 60) => !RAMPS.some(r => s > r.sDiv - m && s < r.sEnd + m) && !TUNNELS.some(t => s > t.s0 - m - 40 && s < t.s1 + m);
  for (let s = S0 + 100; s < ROUTE_END - 50; s += 100) {
    if (!tunnelAt(s, 4)) SIGNS.push({ s, t: 'kp', kp: Math.round(sToKp(s)) });
  }
  for (const r of RAMPS) {
    SIGNS.push({ s: r.sDiv - 700, t: 'exitAdv', ic: r.ic, d: '2km' });
    SIGNS.push({ s: r.sDiv - 400, t: 'exitAdv', ic: r.ic, d: '1km' });
    SIGNS.push({ s: r.sDiv - 160, t: 'exitAdv', ic: r.ic, d: '500m' });
    SIGNS.push({ s: r.sDiv + r.uSep - 30, t: 'exitNose', r });
    SIGNS.push({ s: r.sDiv + 500, t: 'tollAdv', r });
    if (r.ic.i < ICS.length - 1) {
      SIGNS.push({ s: r.ic.s + 650, t: 'dist', from: r.ic.i });
      SIGNS.push({ s: r.ic.s + 820, t: 'speed' });
      SIGNS.push({ s: r.ic.s + 560, t: 'oppDist', to: r.ic.i });
    }
  }
  SIGNS.push({ s: S0 + 220, t: 'dist', from: 0 });
  SIGNS.push({ s: S0 + 360, t: 'speed' });
  for (const t of TUNNELS) {
    SIGNS.push({ s: t.s0 - 260, t: 'speed', force: 80 });
    SIGNS.push({ s: t.s0 - 420, t: 'led', msg: 'トンネル内 速度落とせ' });
  }
  const msgs = ['安全運転で', '車間距離 確保', '居眠り運転 注意', 'スピード 注意', '落下物 注意', 'この先 横風注意', '休憩は早めに'];
  let mi = 0;
  for (let s = S0 + 1700; s < ROUTE_END - 600; s += 2900) {
    let ss = s; let guard = 0;
    while (!free(ss) && guard++ < 20) ss += 150;
    if (guard < 20) {
      const kp = sToKp(ss);
      const msg = kp > 125 && kp < 146 ? 'この先 横風注意' : msgs[mi++ % msgs.length];
      SIGNS.push({ s: ss, t: 'led', msg });
    }
  }
  for (let s = S0 + 3800; s < ROUTE_END - 800; s += 6100) {
    let ss = s; let guard = 0;
    while (!(free(ss) && free(ss + 100)) && guard++ < 20) ss += 150;
    if (guard < 20) { SIGNS.push({ s: ss, t: 'gap', d: '0m' }); SIGNS.push({ s: ss + 50, t: 'gap', d: '50m' }); SIGNS.push({ s: ss + 100, t: 'gap', d: '100m' }); }
  }
  SIGNS.push({ s: ROUTE_END - 600, t: 'led', msg: 'この先 通行止め' });
  // roadside signs on the left never stand in an entrance ramp: move them just past it, one after another
  for (const e of ENTRIES) {
    let k = 0;
    for (const g of SIGNS) if (['dist', 'speed', 'gap'].includes(g.t) && g.s >= e.s0 - 20 && g.s <= e.s1 + 20) g.s = e.s1 + 30 + 60 * k++;
  }
  // nothing roadside inside the bores
  for (let k = SIGNS.length - 1; k >= 0; k--) if (tunnelAt(SIGNS[k].s, 25)) SIGNS.splice(k, 1);
  SIGNS.sort((a, b) => a.s - b.s);
})();

// Sections with sound walls (urban), decided per 100 m block.
function soundWallAt(s, side) {
  const p = regionAt(s, {});
  if (p.wall < 0.3 || tunnelAt(s, 30)) return false;
  if (side < 0 && rampAt(s - 30) ) return false;
  if (side < 0 && rampAt(s + 30)) return false;
  return hash2(Math.floor(s / 100), side, 77) < p.wall * 0.8;
}

// ---- barriers ----------------------------------------------------------------
// s of the barrier ahead: the closure at the end of the route (ramps lead on into the towns).
function roadBarrier(s, lat) {
  return ROUTE_END - 1.5;
}
// Road queries used by the physics. Tests swap these for a flat straight road.
const ROAD = { project, posAt, elevAt, gradeAt, headingAt, drivable, rampAt, barrier: roadBarrier };

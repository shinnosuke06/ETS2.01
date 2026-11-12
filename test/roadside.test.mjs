// Roadside things: the overpasses, the boundary fences, and (later) the road lamps.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim } from './helpers/sim.mjs';

const SIM = loadSim();
const near = (s, a, b, m) => s > a - m && s < b + m;
// where an overpass must not stand, and how far from it (m)
function blocked(s) {
  for (const r of SIM.RAMPS) if (near(s, r.sDiv, r.sEnd, 150)) return 'exit ' + r.ic.jp;
  for (const e of SIM.ENTRIES) if (near(s, e.s0, e.s1, 150)) return 'entry ' + e.ic.jp;
  for (const a of SIM.SAS) if (near(s, a.sDiv, a.sEnd, 150)) return 'sa ' + a.jp;
  for (const t of SIM.TUNNELS) if (near(s, t.s0, t.s1, 150)) return 'tunnel ' + t.jp;
  for (let d = -40; d <= 40; d += 10) if (SIM.waterAt(s + d, -1) + SIM.waterAt(s + d, 1) + SIM.waterAt(s + d, 0) > 0) return 'water';
  for (const g of SIM.SIGNS) if (['exitAdv', 'saAdv', 'saNext', 'led', 'gap'].includes(g.t) && Math.abs(g.s - s) < 40) return 'sign ' + g.t;
  return null;
}

test('S8 どの橋の下も、本線と路肩（lat −12.2〜12.2）で路面から 5.0 m 以上', () => {
  assert.ok(SIM.OVERPASSES.length >= 5, `${SIM.OVERPASSES.length} overpasses`);   // about 5.4 km of the route is free of the places a bridge may not stand
  for (const ov of SIM.OVERPASSES) for (let lat = -12.2; lat <= 12.2; lat += 0.5) {
    const s = ov.s + lat * Math.tan(ov.skew);   // the deck crosses at an angle
    assert.ok(ov.y - SIM.elevAt(s) >= 5.0, `overpass at ${ov.s.toFixed(0)} lat ${lat}: ${(ov.y - SIM.elevAt(s)).toFixed(2)} m`);
  }
});

test('S8 橋は IC と SA の出入口・トンネル（前後 150 m）・海と湖・上にかかる標識と電光板と車間距離の標識（前後 40 m）にない', () => {
  for (const ov of SIM.OVERPASSES) { const why = blocked(ov.s); assert.equal(why, null, `overpass at ${ov.s.toFixed(0)}: ${why}`); }
  for (const ov of SIM.OVERPASSES) { assert.ok(Math.abs(ov.skew) <= 15 * Math.PI / 180 + 1e-9); assert.ok(ov.kind === 'road' ? ov.w >= 9 && ov.w <= 12 : ov.w === 6, JSON.stringify(ov)); }
});

test('S8 橋脚は走れる所（drivable）から 0.5 m 以上離れている', () => {
  const iv = [];
  for (const ov of SIM.OVERPASSES) for (const p of SIM.overpassPiers(ov)) {
    SIM.drivable(p.s, iv);
    for (const [lo, hi] of iv) assert.ok(p.lat < lo - 0.5 || p.lat > hi + 0.5, `pier ${JSON.stringify(p)} in [${lo}, ${hi}]`);
    if (p.lat > 0) assert.ok(p.lat >= 14.5 || p.lat === 0, JSON.stringify(p));   // the eastbound side mirrors ours
  }
});

test('S8 橋の数：町に近い区間は 1 km に 2〜3 本くらい、それ以外は 1 km に 0.5〜1.3 本くらい（置けない所を除いた長さで）', () => {
  let urbanLen = 0, ruralLen = 0, urban = 0, rural = 0;
  for (let s = SIM.S0; s < SIM.ROUTE_END - 300; s += 20) {
    if (blocked(s)) continue;
    const u = SIM.regionAt(s, {}).town >= 0.6;
    if (u) urbanLen += 20; else ruralLen += 20;
  }
  for (const ov of SIM.OVERPASSES) { if (SIM.regionAt(ov.s, {}).town >= 0.6) urban++; else rural++; }
  const du = urban / (urbanLen / 1000), dr = rural / (ruralLen / 1000);
  assert.ok(du >= 1.2 && du <= 4, `urban ${du.toFixed(2)} per km (${urban} in ${urbanLen} m)`);
  assert.ok(dr >= 0.4 && dr <= 1.4, `rural ${dr.toFixed(2)} per km (${rural} in ${ruralLen} m)`);
});

test('柵は防音壁・町・SA・トンネル・橋・海と湖・出入口の道の所にない', () => {
  let on = 0;
  for (let s = SIM.S0; s < SIM.ROUTE_END - 300; s += 7) for (const side of [-1, 1]) {
    if (!SIM.fenceAt(s, side)) continue;
    on++;
    assert.ok(!SIM.soundWallAt(s, side), `wall ${s}`); assert.ok(!SIM.townKeepOut(s, side * 26), `town ${s}`); assert.ok(!SIM.saKeepOut(s, side * 26), `sa ${s}`);
    assert.ok(!SIM.tunnelAt(s, 20), `tunnel ${s}`); assert.equal(SIM.waterAt(s, side) + SIM.waterAt(s, 0), 0, `water ${s}`);
    assert.ok(!SIM.OVERPASSES.some(ov => Math.abs(ov.s - s) < 10), `bridge ${s}`);
    if (side < 0) assert.ok(!(SIM.rampAt(s) || SIM.rampAt(s - 30) || SIM.rampAt(s + 30) || SIM.entryAt(s) || SIM.entryAt(s - 30) || SIM.entryAt(s + 30) || SIM.saAt(s) || SIM.saAt(s - 30) || SIM.saAt(s + 30)), `lanes ${s}`);
  }
  assert.ok(on > 3000, `fence along ${on} samples`);
});

// ---- the road lamps -----------------------------------------------------------------------------------------------
test('S9 照明灯は IC・SA・トンネルの前後・町に近い区間にあり、どれでもない山の中にない', () => {
  const lamps = SIM.lampsIn(0, SIM.ROUTE_LEN), inZone = s => SIM.LAMP_ZONES.some(z => s >= z.s0 - 1 && s <= z.s1 + 1);
  for (const kind of ['ic', 'sa', 'tunnel', 'urban']) {
    const zs = SIM.LAMP_ZONES.filter(z => z.kind === kind);
    assert.ok(zs.length > 0, kind);
    for (const z of zs.slice(0, 3)) assert.ok(lamps.some(l => l.s >= z.s0 && l.s <= z.s1), `${kind} ${z.s0}-${z.s1}`);
  }
  for (const l of lamps) assert.ok(inZone(l.s), `lamp at ${l.s} outside every zone`);
  // a mountain stretch with none of them: 都夫良野 area west of 大井松田, outside the zones
  let dark = 0; for (let s = SIM.S0; s < SIM.ROUTE_END; s += 50) if (!inZone(s) && SIM.regionAt(s, {}).town < 0.3) dark++;
  assert.ok(dark >= 20, `dark stretches ${dark}`);   // at least a kilometre of unlit country road
});
test('S9 照明灯はトンネルの中と走れる所（drivable）の中にない', () => {
  const iv = [];
  for (const l of SIM.lampsIn(0, SIM.ROUTE_LEN)) {
    assert.ok(!SIM.tunnelAt(l.s), `in a tunnel at ${l.s}`);
    if (l.lat < 0) { SIM.drivable(l.s, iv); for (const [lo, hi] of iv) assert.ok(l.lat < lo - 0.5 || l.lat > hi + 0.5, `lamp ${JSON.stringify(l)} in [${lo}, ${hi}]`); }
    else assert.ok(l.lat >= 13.5, JSON.stringify(l));
  }
});
test('S9 同じ所の照明灯は、どの範囲で聞いても同じ（チャンクの境目で重ならない）', () => {
  const all = SIM.lampsIn(0, SIM.ROUTE_LEN).map(l => `${l.s}:${l.lat}`).sort();
  const parts = []; for (let s = 0; s < SIM.ROUTE_LEN; s += 200) parts.push(...SIM.lampsIn(s, s + 200).map(l => `${l.s}:${l.lat}`));
  assert.deepEqual(parts.sort(), all);
});

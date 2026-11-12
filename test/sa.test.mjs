// The service areas: where they are on the route, their lanes, their layout and grid, and driving a rig through them.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, followPath } from './helpers/sim.mjs';

const SIM = loadSim();

// A fresh sim with service area k loaded (visit 0 unless given), helpers to turn SA points into world points.
function area(k, { visit = 0, fallback = false } = {}) {
  const sim = loadSim();
  if (fallback) { const L = sim.saFallbackLayout(k); sim.saAdd(k, L, sim.saGrid(L)); } else sim.saLoad(k, visit);
  const L = sim.SA_LOADED.get(k).layout, sa = L.sa;
  const W = (u, v) => { const p = sim.posAt(sa.sDiv + u, -v, {}); return [p.x, p.z]; };
  // the rig in the deceleration lane at u = 100, facing along the road
  const start = trailer => {
    sim.setRigTrailer(trailer, 12000); sim.RIG.assistOn = true;
    const p = sim.posAt(sa.sDiv + 100, sim.saExitEdges(100, {}).cx, {});
    sim.placeTruckAt(p.x, p.z, p.h, 15 / 3.6, { coupled: true });
  };
  // the lane from u = 100 to the start of saPath's 'in' (u = 140)
  const lead = () => { const out = []; for (let u = 100; u < 140; u += 5) out.push([u, -sim.saExitEdges(u, {}).cx]); return out; };
  return { sim, L, sa, W, start, lead, world: pts => pts.map(([u, v]) => W(u, v)) };
}
const free = L => L.stalls.filter(s => !s.taken);
const ok = r => r.done && r.maxPen < 0.05 && !r.jack;

test('S1 6 か所のサービスエリアが kp の順で、IC の出入口・トンネル・海と湖から離れている', () => {
  assert.deepEqual(SIM.SAS.map(a => a.jp), ['中井', '足柄', '富士川', '牧之原', '浜名湖', '上郷']);
  for (let k = 1; k < SIM.SAS.length; k++) assert.ok(SIM.SAS[k].sDiv > SIM.SAS[k - 1].sEnd);
  for (const a of SIM.SAS) {
    assert.equal(a.sEnd - a.sDiv, 660, a.jp); assert.equal(a.sLot0 - a.sDiv, 180); assert.equal(a.sLot1 - a.sDiv, 460);
    for (const r of SIM.RAMPS) assert.ok(a.sEnd < r.sDiv - 20 || a.sDiv > r.sEnd + 20, `${a.jp} / ${r.ic.jp} exit`);
    for (const e of SIM.ENTRIES) assert.ok(a.sEnd < e.s0 - 20 || a.sDiv > e.s1 + 20, `${a.jp} / ${e.ic.jp} entry`);
    for (const t of SIM.TUNNELS) assert.ok(a.sEnd < t.s0 - 100 || a.sDiv > t.s1 + 100, `${a.jp} / ${t.jp}`);
    for (let s = a.sDiv; s <= a.sEnd; s += 10) assert.equal(SIM.waterAt(s, -1) + SIM.waterAt(s, 0), 0, `${a.jp} water at ${s}`);
  }
});

// the rig's SA position and direction: u along the road, v to the left; (hu, hv) its heading in those axes
const rigAt = T => { const a = T.sim.TR.h - T.sim.headingAt(T.sim.TR.s); return [T.sim.TR.s - T.sa.sDiv, -T.sim.TR.lat, Math.cos(a), Math.sin(a)]; };

test('S2 中井：空いている大型車の枠すべてにバンで入れて、止まった所で枠の判定が出る', () => {
  const k = 0, base = area(k);
  for (const st of free(base.L)) {
    const T = area(k); T.start('van');
    const r = followPath(T.sim, T.world([...T.lead(), ...T.sim.saPath(T.L, 'in', { stall: st.id })]), 15, { seconds: 150 });
    assert.ok(ok(r), `stall ${st.id} ${JSON.stringify(r)}`);
    const at = T.sim.saStallAt(T.L, ...rigAt(T));
    assert.equal(at && at.id, st.id, `stall ${st.id} at ${rigAt(T).map(x => x.toFixed(2))}`);
  }
});

test('S2 どの SA でも、入口→大型車の枠→給油の枠→出口、入口→給油の枠→出口、入口→出口をバンとタンクで走れる', () => {
  for (let k = 0; k < 6; k++) for (const trailer of ['van', 'tank']) {
    const L0 = area(k).L, st = free(L0)[trailer === 'van' ? 0 : free(L0).length - 1];
    const runs = [
      ['stall-pump-out', a => [...a.lead(), ...a.sim.saPath(a.L, 'in', { stall: st.id }), ...a.sim.saPath(a.L, { stall: st.id }, { pump: 1 }).slice(1), ...a.sim.saPath(a.L, { pump: 1 }, 'out').slice(1)]],
      ['pump-out', a => [...a.lead(), ...a.sim.saPath(a.L, 'in', { pump: 0 }), ...a.sim.saPath(a.L, { pump: 0 }, 'out').slice(1)]],
      ['bypass', a => [...a.lead(), ...a.sim.saPath(a.L, 'in', 'out')]],
    ];
    for (const [name, mk] of runs) {
      const T = area(k); T.start(trailer);
      const r = followPath(T.sim, T.world(mk(T)), 15, { seconds: 300 });
      assert.ok(ok(r), `${T.sa.jp} ${trailer} ${name} ${JSON.stringify(r)}`);
    }
  }
});

test('S2 枠の判定：枠の中心で枠の向きなら出て、20 度を超えてずれると出ない。止まっている車のある枠は出ない', () => {
  const T = area(0), st = free(T.L)[0], p = T.L.pumps[0];
  assert.equal(T.sim.saStallAt(T.L, st.u, st.v, st.hu, st.hv).id, st.id);
  const a = Math.atan2(st.hv, st.hu) + 25 * Math.PI / 180;
  assert.equal(T.sim.saStallAt(T.L, st.u, st.v, Math.cos(a), Math.sin(a)), null);
  assert.equal(T.sim.saPumpAt(T.L, p.u, p.v, 1, 0).id, 0);
  assert.equal(T.sim.saPumpAt(T.L, p.u, p.v + 6, 1, 0), null);
  const taken = T.L.stalls.find(s => s.taken);
  if (taken) assert.equal(T.sim.saStallAt(T.L, taken.u, taken.v, taken.hu, taken.hv), null);
});

test('S3 減速車線と加速車線のつなぎ目（u = 140、500）で、走れる所が切れず、高さもつながる', () => {
  for (let k = 0; k < 6; k++) {
    const T = area(k), G = T.sim.GROUND, c = {}, g = {};
    let prevY = null;
    const check = (u, cx, label) => {
      for (const w of [-1.5, 0, 1.5]) {
        const p = T.sim.posAt(T.sa.sDiv + u, cx + w, {});
        G.contact(p.x, p.z, Math.floor((T.sa.sDiv + u) / 4), c);
        assert.equal(c.pen, 0, `${T.sa.jp} ${label} u=${u} w=${w}`);
      }
      const p = T.sim.posAt(T.sa.sDiv + u, cx, {}); G.at(p.x, p.z, Math.floor((T.sa.sDiv + u) / 4), g);
      if (prevY != null) assert.ok(Math.abs(g.y - prevY) < 0.05, `${T.sa.jp} ${label} height step at u=${u}`);
      prevY = g.y;
    };
    for (let u = 120; u <= 160; u += 0.5) check(u, T.sim.saExitEdges(u, {}).cx, 'exit');
    prevY = null;
    for (let u = 480; u <= 520; u += 0.5) check(u, T.sim.saEntryEdges(u - 460, {}).cx, 'entry');
  }
});

test('S3 SA の中は zone が sa で、番号が入る。駐車場の外は sa ではない', () => {
  const T = area(2), g = {}, p = T.sim.posAt(T.sa.sDiv + 300, -23, {});
  T.sim.GROUND.at(p.x, p.z, Math.floor((T.sa.sDiv + 300) / 4), g);
  assert.equal(g.zone, 'sa'); assert.equal(g.sa, 2);
  const q = T.sim.posAt(T.sa.sDiv + 300, -7.65, {});
  T.sim.GROUND.at(q.x, q.z, Math.floor((T.sa.sDiv + 300) / 4), g);
  assert.equal(g.zone, 'road'); assert.equal(g.sa, -1);
});

test('S6 signKm：2km・1km・500m の標識の位置で 2.0・1.0・0.5', () => {
  assert.equal(SIM.signKm(700), 2); assert.equal(SIM.signKm(400), 1); assert.equal(SIM.signKm(160), 0.5); assert.equal(SIM.signKm(0), 0);
  assert.ok(Math.abs(SIM.signKm(1000) - 5) < 1e-9); assert.ok(Math.abs(SIM.signKm(280) - 0.75) < 1e-9);
});

test('SA の配置：空いている大型車の枠が 4 つ以上、止まっているトラックが 3〜6 割（6 か所 × visit 0〜9）。来るたびに変わる', () => {
  for (let k = 0; k < 6; k++) {
    const seen = new Set();
    for (let visit = 0; visit < 10; visit++) {
      const L = SIM.saLayout(k, visit), taken = L.stalls.filter(s => s.taken).length;
      assert.equal(L.stalls.length, 12); assert.equal(L.pumps.length, 2);
      assert.ok(12 - taken >= 4 && taken >= 4 && taken <= 7, `${L.sa.jp} visit ${visit}: ${taken} taken`);
      seen.add(L.stalls.map(s => +s.taken).join(''));
    }
    assert.ok(seen.size > 1, `SA ${k} is the same every visit`);
  }
});

test('SA の配置が作れないときは簡単な駐車場になり、給油の枠 1 と大型車の枠 4 で走れる', () => {
  const T = area(3, { fallback: true });
  assert.equal(T.L.fallback, true); assert.equal(T.L.pumps.length, 1); assert.equal(T.L.stalls.length, 4);
  T.start('van');
  const r = followPath(T.sim, T.world([...T.lead(), ...T.sim.saPath(T.L, 'in', { stall: 0 }), ...T.sim.saPath(T.L, { stall: 0 }, { pump: 0 }).slice(1), ...T.sim.saPath(T.L, { pump: 0 }, 'out').slice(1)]), 15, { seconds: 300 });
  assert.ok(ok(r), JSON.stringify(r));
});

test('減速車線と加速車線は本線から外れない（走れる所 drivable に車線の中心が入る）', () => {
  for (const a of SIM.SAS) {
    const iv = [];
    for (let u = 2; u < 140; u += 2) { const cx = SIM.saExitEdges(u, {}).cx; SIM.drivable(a.sDiv + u, iv); assert.ok(iv.some(([lo, hi]) => cx > lo && cx < hi), `${a.jp} exit u=${u}`); }
    for (let u = 40; u < 198; u += 2) { const cx = SIM.saEntryEdges(u, {}).cx; SIM.drivable(a.sLot1 + u, iv); assert.ok(iv.some(([lo, hi]) => cx > lo && cx < hi), `${a.jp} entry u=${u}`); }
  }
});

test('SA の標識：6 か所それぞれに 500m の案内・「SA 入口」・合流注意があり、2km と 1km は置ける所なら置く。左の標識とキロポストは SA の中にない', () => {
  for (const a of SIM.SAS) {
    const mine = SIM.SIGNS.filter(g => g.sa === a);
    for (const t of ['saNose', 'saMerge']) assert.equal(mine.filter(g => g.t === t).length, 1, `${a.jp} ${t}`);
    assert.ok(mine.some(g => g.t === 'saAdv' && g.d === '500m'), `${a.jp} 500m`);
    // a missing 2km or 1km sign means its whole stretch (to 100 m before the next sign) is on an exit ramp or by a tunnel
    const busy = s => SIM.RAMPS.some(r => s > r.sDiv - 40 && s < r.sEnd + 40) || SIM.TUNNELS.some(t => s > t.s0 - 40 && s < t.s1 + 40);
    for (const [d, s0, s1] of [['2km', a.sDiv - 700, a.sDiv - 500], ['1km', a.sDiv - 400, a.sDiv - 260]]) {
      if (mine.some(g => g.t === 'saAdv' && g.d === d)) continue;
      for (let ss = s0; ss <= s1; ss += 20) assert.ok(busy(ss), `${a.jp} ${d} left out though ${ss} is free`);
    }
    for (const g of mine) assert.ok(!busy(g.s) || g.t === 'saNose' || g.t === 'saMerge', `${a.jp} ${g.t} on a busy spot`);
    for (const g of mine.filter(g => g.t === 'saAdv' || g.t === 'saNext')) assert.ok(g.s < a.sDiv, a.jp);
    for (const g of SIM.SIGNS) if (['dist', 'speed', 'gap', 'kp', 'led'].includes(g.t)) assert.ok(g.s < a.sDiv - 20 || g.s > a.sEnd + 20, `${g.t} at ${g.s} in ${a.jp}`);
  }
});

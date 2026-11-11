// Town sites and layouts behind every interchange (data only).
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim } from './helpers/sim.mjs';

const SIM = loadSim();                    // layouts are pure data; one copy serves every test
const ALL = SIM.TOWN_SITES.map(t => SIM.townLayout(t.i));
const corners = r => [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
const boxOf = b => ({ u0: b.u - b.w / 2, u1: b.u + b.w / 2, v0: b.v - b.d / 2, v1: b.v + b.d / 2 });
const overlap = (a, b, m = 0) => a.u0 < b.u1 - m && b.u0 < a.u1 - m && a.v0 < b.v1 - m && b.v0 < a.v1 - m;
// the strip a street takes (carriageway and pavements) as a box
const streetBox = st => { const h = st.lanes * st.laneW + st.walkW;
  return st.axis === 'v' ? { u0: st.c - h, u1: st.c + h, v0: st.a0, v1: st.a1 } : { u0: st.a0, u1: st.a1, v0: st.c - h, v1: st.c + h }; };

test('T2 前半：13 の町の場所。原点は ic.s + 125・横 −40、東京は入口だけ、名古屋は出口だけ', () => {
  assert.equal(SIM.TOWN_SITES.length, 13);
  for (const t of SIM.TOWN_SITES) {
    const p = SIM.posAt(t.ic.s + 125, -40, {});
    assert.ok(Math.abs(t.ox - p.x) < 1e-9 && Math.abs(t.oz - p.z) < 1e-9 && Math.abs(t.y0 - SIM.elevAt(t.ic.s + 125)) < 1e-9, t.ic.jp);
    assert.equal(t.exit, t.i > 0); assert.equal(t.entry, t.i < 12);
    const q = SIM.townXZ(t, 30, 100, {}), uv = SIM.townUV(t, q.x, q.z, {});
    assert.ok(Math.abs(uv.u - 30) < 1e-9 && Math.abs(uv.v - 100) < 1e-9);
    const left = SIM.townXZ(t, 0, 10, {}), pr = SIM.project(left.x, left.z, Math.floor(t.s / SIM.DS), {});
    assert.ok(Math.abs(pr.lat + 50) < 0.5, `v grows to the left: ${pr.lat}`);
  }
  assert.equal(SIM.townInside(0, -5), true); assert.equal(SIM.townInside(100, -5), false); assert.equal(SIM.townInside(299, 404), true); assert.equal(SIM.townInside(0, 406), false);
});

test('T3 13 の町で、建物・柵・構内は本線と出入口の帯から 15 m 以上離れている', () => {
  for (const L of ALL) {
    const site = L.site, pts = [];
    for (const b of L.buildings) pts.push(...corners(boxOf(b)));
    for (const f of L.fences) pts.push([f.u0, f.v0], [f.u1, f.v1]);
    for (const w of L.warehouses) pts.push(...corners(w.yard));
    for (const [u, v] of pts) {
      const p = SIM.townXZ(site, u, v, {}), pr = SIM.project(p.x, p.z, Math.max(0, Math.floor((site.s + u) / SIM.DS)), {});
      assert.ok(pr.lat <= -42.8 - 15, `${site.ic.jp} (${u.toFixed(1)}, ${v.toFixed(1)}) lat ${pr.lat.toFixed(1)}`);
    }
  }
});

// lane ids reachable from `from` by following `next`
function reach(L, from) {
  const seen = new Set(from), q = [...from];
  while (q.length) for (const n of L.lanes[q.shift()].next) if (!seen.has(n)) { seen.add(n); q.push(n); }
  return seen;
}
test('T4 13 の町で、広場から全部の倉庫の門まで車線でつながり、門から広場の入口の道にもつながる', () => {
  for (const L of ALL) {
    const exitLane = L.lanes.find(l => l.plaza && l.id === L.plaza.exitLane), entryLane = L.lanes.find(l => l.plaza && l.id === L.plaza.entryLane);
    assert.equal(!!exitLane, L.site.exit, L.site.ic.jp); assert.equal(!!entryLane, L.site.entry, L.site.ic.jp);
    for (const w of L.warehouses) {
      assert.ok(w.gateLanes.length > 0, `${L.site.ic.jp} ${w.name}`);
      if (exitLane) assert.ok(w.gateLanes.some(id => reach(L, [exitLane.id]).has(id)), `${L.site.ic.jp}: plaza → ${w.name}`);
      if (entryLane) assert.ok(reach(L, w.gateLanes).has(entryLane.id), `${L.site.ic.jp}: ${w.name} → entrance`);
    }
  }
});

test('T5 13 の町で、建物と柵は車道・歩道・構内・広場にはみ出さず、建物どうしも重ならない。角の丸みは 12 m', () => {
  const plaza = { u0: -50, u1: 50, v0: -8, v1: 45 };
  for (const L of ALL) {
    const boxes = L.buildings.map(boxOf), yards = L.warehouses.map(w => w.yard);
    L.buildings.forEach((b, k) => {
      const B = boxes[k], name = `${L.site.ic.jp} building ${k}`;
      for (const st of L.streets) assert.ok(!overlap(B, streetBox(st)), `${name} on street ${st.id}`);
      assert.ok(!overlap(B, plaza), `${name} in the plaza`);
      for (const [j, y] of yards.entries()) if (!(b.kind === 'warehouse' && b.wh === j)) assert.ok(!overlap(B, y), `${name} in yard ${j}`);
      for (let j = 0; j < k; j++) assert.ok(!overlap(B, boxes[j], 0.01), `${name} on building ${j}`);
    });
    // fences other than the closures across street ends never cross a carriageway
    for (const f of L.fences) if (f.kind !== 'closure') {
      const F = { u0: Math.min(f.u0, f.u1), u1: Math.max(f.u0, f.u1), v0: Math.min(f.v0, f.v1), v1: Math.max(f.v0, f.v1) };
      for (const st of L.streets) { const h = st.lanes * st.laneW, C = st.axis === 'v' ? { u0: st.c - h, u1: st.c + h, v0: st.a0, v1: st.a1 } : { u0: st.a0, u1: st.a1, v0: st.c - h, v1: st.c + h };
        assert.ok(!(F.u0 <= C.u1 && C.u0 <= F.u1 && F.v0 <= C.v1 && C.v0 <= F.v1), `${L.site.ic.jp} ${f.kind} fence on street ${st.id}`); }
    }
    assert.equal(L.cornerR, 12);
  }
});

test('倉庫は 2〜3 か所、構内は 60 m × 70 m 以上、荷台口は 4〜6 つ、名前は町の名前 + 物流センター／配送センター／倉庫', () => {
  for (const L of ALL) {
    assert.ok(L.warehouses.length >= 2 && L.warehouses.length <= 3, L.site.ic.jp);
    L.warehouses.forEach((w, k) => {
      assert.ok(w.docks.length >= 4 && w.docks.length <= 6, w.name);
      const du = w.yard.u1 - w.yard.u0, dv = w.yard.v1 - w.yard.v0;
      assert.ok(Math.min(du, dv) >= 60 && Math.max(du, dv) >= 70, `${w.name} yard ${du} x ${dv}`);
      assert.equal(w.name, L.site.ic.jp + ['物流センター', '配送センター', '倉庫'][k]);
      assert.equal(w.gate.w, 14);
    });
  }
});

test('道の決まり：大通り A は u = 0、片側 2 車線 3.25 m・歩道 3.5 m・制限 50。脇道は 1 車線 3.0 m・歩道 2.5 m・制限 40。両方脇道の交差点は「止まれ」', () => {
  for (const L of ALL) {
    const A = L.streets[0];
    assert.deepEqual([A.kind, A.axis, A.c, A.a0, A.lanes, A.laneW, A.walkW, A.limit], ['main', 'v', 0, 45, 2, 3.25, 3.5, 50]);
    for (const st of L.streets) if (st.kind === 'side') assert.deepEqual([st.lanes, st.laneW, st.walkW, st.limit], [1, 3.0, 2.5, 40]);
    const cross = L.streets.filter(s => s.axis === 'u'); assert.equal(cross.length, 3);
    for (const n of L.nodes) {
      const main = n.streets.some(id => L.streets[id].kind === 'main');
      assert.equal(n.signal, main); assert.equal(n.stop, !main); assert.ok(n.phase >= 0 && n.phase < 70);
    }
  }
});

test('同じ町は何度作っても同じ形', () => {
  assert.equal(JSON.stringify(SIM.townLayout(4)), JSON.stringify(SIM.townLayout(4)));
});

test('道なりの距離：同じ道の上の 2 点は直線の距離、角を曲がる 2 点は道に沿った長さ', () => {
  const L = ALL[2], v1 = L.streets.filter(s => s.axis === 'u')[0].c;
  assert.ok(Math.abs(SIM.townGraphDistance(L, { u: 0, v: 60 }, { u: 0, v: 100 }) - 40) < 1e-6);
  assert.ok(Math.abs(SIM.townGraphDistance(L, { u: 0, v: 80 }, { u: 60, v: v1 }) - ((v1 - 80) + 60)) < 1e-6);
});

test('制限速度：大通り 50、脇道 40、構内と広場 20。地形のなじみ：町の中は 1、外へ 60 m で 0、本線側（v < 5）は 0', () => {
  const L = ALL[2], side = L.streets.find(s => s.kind === 'side' && s.axis === 'v'), w = L.warehouses[0];
  assert.equal(SIM.townLimitAt(L, 0, 80), 50);
  assert.equal(SIM.townLimitAt(L, side.c, side.a0 + 20), 40);
  assert.equal(SIM.townLimitAt(L, (w.yard.u0 + w.yard.u1) / 2, (w.yard.v0 + w.yard.v1) / 2), 20);
  assert.equal(SIM.townLimitAt(L, -5, 30), 20);
  const site = L.site, at = (u, v) => { const p = SIM.townXZ(site, u, v, {}), pr = SIM.project(p.x, p.z, Math.floor((site.s + u) / SIM.DS), {}); return SIM.townGroundBlend(pr.s, pr.lat); };
  assert.equal(at(0, 200).w, 1); assert.ok(at(0, 470).w < 1e-6); assert.ok(at(0, 435).w > 0 && at(0, 435).w < 1); assert.equal(at(-200, -2).w, 0);
});

// ---- the town grid and GROUND inside a town ----
test('T6 町の地図は 4 MB 以下。壁の中の点では contact が外へ押し、車道の点では押さない', () => {
  const sim = loadSim(); sim.townLoad(2);
  const T = sim.TOWNS_LOADED.get(2), L = T.layout, site = L.site;
  assert.ok(T.grid.type.byteLength + T.grid.dist.byteLength <= 4 * 1024 * 1024);
  const b = L.buildings.find(x => x.kind === 'house'), p = sim.townXZ(site, b.u, b.v, {}), c = sim.GROUND.contact(p.x, p.z, 0, {});
  assert.ok(c.pen > 0.5, `pen ${c.pen}`);
  const q = sim.townXZ(site, 0, 80, {});
  assert.equal(sim.GROUND.contact(q.x, q.z, 0, {}).pen, 0);
  const g = sim.GROUND.at(q.x, q.z, Math.floor(site.s / sim.DS), {});
  assert.equal(g.zone, 'town'); assert.equal(g.town, 2); assert.ok(Math.abs(g.y - sim.townHeight(site, 0, 80)) < 1e-9);
  // the push points back toward the street: from inside the kerb-side block next to Main A, it points to -u... toward u = 0
  const w = sim.townXZ(site, 11.5, 80, {}), cw = sim.GROUND.contact(w.x, w.z, 0, {});
  assert.ok(cw.pen > 0.5 && cw.pen < 2.5, `pen ${cw.pen}`);
  assert.ok(cw.nx * site.Fx + cw.nz * site.Fz < -0.9, 'pushes toward Main A');
  sim.townUnload(2); assert.equal(sim.GROUND.at(q.x, q.z, Math.floor(site.s / sim.DS), {}).zone, 'road');
});
test('町の地図：交差点の角は半径 12 m で丸く車道、歩道は 15 cm 高い、広場の道と出入口の帯の端は車道', () => {
  const sim = loadSim(); sim.townLoad(2);
  const { layout: L, grid } = sim.TOWNS_LOADED.get(2), site = L.site, C = sim.TCELL;
  const cell = (u, v) => grid.type[Math.floor((v - sim.TOWN_V0) / sim.TOWN_CELL) * sim.TOWN_NU + Math.floor((u - sim.TOWN_U0) / sim.TOWN_CELL)];
  const n = L.nodes.find(x => x.streets.includes(0) && x.arms['v-'] && x.arms['u-']), V = L.streets[n.streets[0]], U = L.streets[n.streets[1]];
  const cu = n.u - V.lanes * V.laneW, cv = n.v - U.lanes * U.laneW;          // the kerb corner of the south-west quadrant
  assert.equal(cell(cu - 1.5, cv - 1.5), C.ROAD, 'rounded corner is road');   // 2.1 m from the square corner, inside the 12 m round
  assert.equal(cell(cu + 1, cv - 20), C.ROAD); assert.equal(cell(cu - 1, cv - 20), C.WALK);
  const q = sim.townXZ(site, -5, 30, {}), r = sim.townXZ(site, cu - 1, cv - 20, {});
  assert.ok(Math.abs(sim.GROUND.at(r.x, r.z, 0, {}).y - sim.townHeight(site, cu - 1, cv - 20) - 0.15) < 1e-9);
  assert.equal(sim.GROUND.contact(q.x, q.z, 0, {}).pen, 0);
  assert.equal(cell(-45, 0), C.ROAD); assert.equal(cell(45, 0), C.ROAD);       // the ramp ends inside the notch
  assert.equal(cell(0, 30), C.WALL);                                           // the booth island between the gates
});
test('町を作るのに失敗したら簡単な構内に切り替わり、倉庫が 1 か所、納品の枠と置き場がある', () => {
  const sim = loadSim({ extra: 'townLayout = () => { throw new Error("broken town"); };' });
  const warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try { sim.townLoad(5); } finally { console.warn = warn; }
  const { layout: L } = sim.TOWNS_LOADED.get(5);
  assert.equal(L.fallback, true); assert.equal(L.warehouses.length, 1); assert.ok(L.warehouses[0].bay && L.warehouses[0].park); assert.equal(warned, 1);
  const p = sim.townXZ(L.site, 0, 80, {}); assert.equal(sim.GROUND.contact(p.x, p.z, 0, {}).pen, 0); assert.equal(sim.GROUND.at(p.x, p.z, 0, {}).zone, 'town');
});

// ---- the interchanges' ramps ----
test('T2 13 の IC で、入口の帯の終わりは次の出口の分かれ目より 30 m 以上手前、トンネルの入口より 50 m 以上手前。標識と帯が重ならない', () => {
  const sim = loadSim();
  assert.equal(sim.ENTRIES.length, 12);
  for (const e of sim.ENTRIES) {
    assert.equal(e.s0, e.ic.s + 150); assert.equal(e.s1, e.ic.s + 600);
    const next = sim.RAMPS.find(r => r.ic.i === e.ic.i + 1); if (next) assert.ok(next.sDiv - e.s1 >= 30, e.ic.jp);
    for (const t of sim.TUNNELS) if (t.s0 > e.s0) assert.ok(t.s0 - e.s1 >= 50, `${e.ic.jp} ${t.jp}`);
    for (const g of sim.SIGNS) if (['dist', 'speed', 'gap'].includes(g.t)) assert.ok(g.s < e.s0 - 20 || g.s > e.s1 + 20, `${g.t} ${g.s} in ${e.ic.jp}'s entrance`);
  }
});
test('出口の帯は ic.s + 100 で終わり、行き止まりの壁はない。入口の帯は合流する所で本線とつながる', () => {
  const sim = loadSim(), r = sim.RAMPS[3], e = sim.ENTRIES[3];
  assert.equal(r.sEnd, r.ic.s + 100); assert.equal(r.sGate, undefined);
  assert.equal(sim.roadBarrier(r.sEnd - 10, -40), sim.ROUTE_END - 1.5);
  assert.equal(sim.drivable(r.sEnd - 2, []).length, 2, 'the exit lane runs to its end');
  assert.equal(sim.drivable(e.s0 + 430, []).length, 1); assert.equal(sim.drivable(e.s0 + 100, []).length, 2);
  const E = sim.entryEdges(0, {}); assert.ok(Math.abs(E.cx + 40) < 1e-9 && Math.abs(E.xl + 42.8) < 1e-9 && Math.abs(E.xr + 37.8) < 1e-9);
  assert.ok(Math.abs(sim.entryEdges(300, {}).cx + 11.25) < 1e-9); assert.ok(Math.abs(sim.entryEdges(450, {}).xl + 12.2) < 1e-9);
  assert.equal(sim.entryAt(e.s0 + 10), e); assert.equal(sim.entryAt(e.s1 + 10), null);
});

test('T5 交差点の丸い角（半径 12 m）の車道と歩道には、どの町でも壁がない（倉庫の塀も角では丸く曲がる）', () => {
  const sim = loadSim();
  for (let i = 0; i < sim.TOWN_SITES.length; i++) {
    sim.townLoad(i);
    const T = sim.TOWNS_LOADED.get(i), L = T.layout, r = 12, bad = [];
    for (const n of L.nodes) {
      const V = L.streets[n.streets[0]], U = L.streets[n.streets[1]], walk = Math.min(V.walkW, U.walkW);
      const hc = st => st.lanes * st.laneW;   // half the carriageway
      for (const [su, sv] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        if (!n.arms[sv > 0 ? 'v+' : 'v-'] || !n.arms[su > 0 ? 'u+' : 'u-']) continue;
        const ku = n.u + su * hc(V), kv = n.v + sv * hc(U), cu = ku + su * r, cv = kv + sv * r;
        for (let a = 0; a <= 1.0001; a += 0.05) for (const rad of [r - walk + 0.6, r - walk / 2, r - 0.2]) {
          const t = Math.PI / 2 * a, u = cu - su * rad * Math.cos(t), v = cv - sv * rad * Math.sin(t);
          if (sim.townCellAt(T.grid, u, v) === sim.TCELL.WALL) bad.push([n.id, su, sv, +u.toFixed(1), +v.toFixed(1)]);
        }
      }
    }
    assert.deepEqual(bad.slice(0, 5), [], `${L.site.ic.jp}: ${bad.length} wall cells in rounded corners`);
    sim.townUnload(i);
  }
});

test('入口の帯の左に防音壁を立てない（帯の前後 30 m も）', () => {
  const sim = loadSim(), bad = [];
  for (const e of sim.ENTRIES) for (let s = e.s0 - 30; s <= e.s1 + 30; s += 5) if (sim.soundWallAt(s, -1)) bad.push(`${e.ic.jp} +${Math.round(s - e.s0)}`);
  assert.deepEqual(bad.slice(0, 6), [], `${bad.length} wall spots`);
});

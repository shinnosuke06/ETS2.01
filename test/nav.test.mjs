// Navigation without the DOM: the junction table, route search, map matching, guidance and rerouting.
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim } from './helpers/sim.mjs';

const SIM = loadSim();

// A hand-made layout: streets { id, kind, axis, c, a0, a1 }, junctions where two streets cross, and gates.
function layout(streets, gates = []) {
  const S = streets.map((s, id) => ({ id, kind: 'side', lanes: 1, laneW: 3, walkW: 2.5, ...s }));
  const nodes = [];
  for (const V of S.filter(s => s.axis === 'v')) for (const U of S.filter(s => s.axis === 'u')) {
    if (V.c < U.a0 - 0.01 || V.c > U.a1 + 0.01 || U.c < V.a0 - 0.01 || U.c > V.a1 + 0.01) continue;
    nodes.push({ id: nodes.length, u: V.c, v: U.c, streets: [V.id, U.id],
      arms: { 'v+': V.a1 > U.c + 0.01, 'v-': V.a0 < U.c - 0.01, 'u+': U.a1 > V.c + 0.01, 'u-': U.a0 < V.c - 0.01 } });
  }
  const warehouses = gates.map(([street, u, v, nu, nv], k) => ({ id: k, name: 'G' + k, street, gate: { u, v, nu, nv, w: 14 } }));
  return { streets: S, nodes, warehouses };
}
const kinds = r => r.steps.map(s => s.kind);

test('N1 13 の町すべてで、どの倉庫の門にも広場から行けて、門から広場に戻れる', () => {
  for (let i = 0; i < 13; i++) {
    const L = SIM.townLayout(i);
    for (const w of L.warehouses) {
      const go = SIM.navRoute(L, { plaza: true, start: true }, { gate: w }), back = SIM.navRoute(L, { gate: w }, { plaza: true });
      assert.ok(go && back, `${L.site.ic.jp} ${w.name}`);
      assert.match(go.steps.at(-1).kind, /^gate(Left|Right)$/); assert.match(back.steps[0].kind, /^out(Left|Right)$/); assert.equal(back.steps.at(-1).kind, 'plaza');
      for (const r of [go, back]) for (let k = 1; k < r.steps.length; k++) assert.ok(r.steps[k].dist >= r.steps[k - 1].dist, 'steps in order along the way');
    }
  }
});

test('N2 点数：同じ長さなら大通り、右折 1 回と 300 m の遠回りなら右折、とても小さな遠回り（10 m）なら左折 3 回', () => {
  // (a) a ring: from a gate on the left street to a gate on the right street, round the top (U1) or the bottom (U0);
  // both ways have the same turns (out, two corners, in), the bottom way is 60 m shorter
  const ring = top => layout([
    { axis: 'v', c: 0, a0: 0, a1: 100, kind: 'main' }, { axis: 'v', c: 200, a0: 0, a1: 100, kind: 'main' },
    { axis: 'u', c: 0, a0: 0, a1: 200 }, { axis: 'u', c: 100, a0: 0, a1: 200, kind: top },
  ], [[0, 0, 50, -1, 0], [1, 200, 20, 1, 0]]);
  for (const [top, wantTop] of [['main', true], ['side', false]]) {
    const L = ring(top), r = SIM.navRoute(L, { gate: L.warehouses[0] }, { gate: L.warehouses[1] }), g = SIM.navGraph(L);
    const viaTop = r.edges.some(e => g.edges[e].street === 3);
    assert.equal(viaTop, wantTop, `top street ${top}: ${kinds(r)}`);
  }
  // (b), (c) a P: arriving northward at A, the gate is east along U0; right at A, or straight on round a small block of side s
  // and three lefts back through A
  const P = s => layout([
    { axis: 'v', c: 0, a0: -100, a1: s }, { axis: 'v', c: -s, a0: 0, a1: s }, { axis: 'v', c: 200, a0: 0, a1: 50 },
    { axis: 'u', c: -100, a0: 0, a1: 50 }, { axis: 'u', c: 0, a0: -s, a1: 200 }, { axis: 'u', c: s, a0: -s, a1: 0 },
  ], [[4, 100, 0, 0, 1]]);   // the yard north of U0
  for (const [s, want] of [[75, ['right', 'gateLeft']], [2.5, ['left', 'left', 'left', 'gateLeft']]]) {
    const L = P(s), g = SIM.navGraph(L), e = g.edges.find(x => x.street === 0 && x.dir === 'v+' && x.a[1] === -100);
    const r = SIM.navRoute(L, { edge: e.id, d: 10 }, { gate: L.warehouses[0] });
    assert.deepEqual(kinds(r).filter(k => k !== 'straight'), want, `block side ${s}`);
  }
});

test('N6 1 回の道探しは 1 ms 未満（13 町 × 全倉庫、行きと帰りの平均）', () => {
  const Ls = []; for (let i = 0; i < 13; i++) Ls.push(SIM.townLayout(i));
  for (const L of Ls) SIM.navGraph(L);   // the tables are made once per layout
  let n = 0; const t0 = performance.now();
  for (let rep = 0; rep < 5; rep++) for (const L of Ls) for (const w of L.warehouses) { SIM.navRoute(L, { plaza: true, start: true }, { gate: w }); SIM.navRoute(L, { gate: w }, { plaza: true }); n += 2; }
  const each = (performance.now() - t0) / n; assert.ok(each < 1, `${each.toFixed(3)} ms per search`);
});

test('簡単な構内の町では道探しが null', () => {
  const L = SIM.townFallbackLayout(3);
  assert.equal(SIM.navRoute(L, { plaza: true, start: true }, { gate: L.warehouses[0] }), null);
});

test('案内の文：曲がりと門と高速の文', () => {
  assert.deepEqual(['left', 'right', 'straight', 'gateLeft', 'gateRight', 'outLeft', 'outRight', 'plaza', 'arrive', 'etcIn', 'etcOut', 'ramp', 'merge', 'exit', 'dock', 'bay'].map(k => SIM.navText(k)),
    ['左折', '右折', '直進', '門は左', '門は右', '門を出て左', '門を出て右', '広場へ', '到着', 'ETC 入口 20km/h 以下', 'ETC 出口 20km/h 以下', '料金所 ETC は 20km/h 以下', '本線へ合流　右', '出口　左', '荷台口にバックで（+20%）', '納品の枠へ']);
  assert.equal(SIM.navText('exitLane', '厚木'), '厚木IC 出口　左車線へ');
});

const ANG = { 'u+': 0, 'v+': Math.PI / 2, 'u-': Math.PI, 'v-': -Math.PI / 2 };
const ht = st => st.lanes * st.laneW + st.walkW;
const inStreets = (L, u, v) => L.streets.filter(st => (st.axis === 'v' ? Math.abs(u - st.c) <= ht(st) && v >= st.a0 && v <= st.a1 : Math.abs(v - st.c) <= ht(st) && u >= st.a0 && u <= st.a1)).length;

test('N3 位置合わせ：13 の町の、すべての道の両向きで、道の真ん中の点は正しい道と向き。交差点の中は直前のまま', () => {
  for (let i = 0; i < 13; i++) {
    const L = SIM.townLayout(i), G = SIM.navGraph(L);
    for (const e of G.edges) {
      const u = (e.a[0] + e.b[0]) / 2, v = (e.a[1] + e.b[1]) / 2;
      if (inStreets(L, u, v) !== 1) continue;   // a very short piece whose middle is inside a junction
      const m = SIM.navMatch(L, u, v, ANG[e.dir] + 0.3, null);
      assert.ok(m && m.edge === e.id, `${L.site.ic.jp} edge ${e.id} ${e.dir}: ${JSON.stringify(m)}`);
      assert.ok(Math.abs(m.d - e.len / 2) < 0.01, `d ${m.d}`);
    }
    const prev = { edge: 0, d: 1, off: 0 };
    for (const n of L.nodes) assert.equal(SIM.navMatch(L, n.u, n.v, 0, prev), prev, `${L.site.ic.jp} junction ${n.id}`);
  }
});

// A test layout: north up V0 (a main street, 2 lanes each way) to A, right onto U0 (a side street), after 40 m left onto
// V1, the gate 50 m up V1 on the right
const LL = layout([
  { axis: 'v', c: 0, a0: -400, a1: 100, kind: 'main', lanes: 2 }, { axis: 'v', c: 40, a0: 0, a1: 100 },
  { axis: 'u', c: -400, a0: 0, a1: 50 }, { axis: 'u', c: 0, a0: 0, a1: 300 },
], [[1, 40, 50, 1, 0]]);

test('N4 案内：曲がる交差点までの距離と操作、その先、車線（左折は左、右折は右、直進は両方、脇道はなし）', () => {
  const G = SIM.navGraph(LL), e0 = G.edges.find(e => e.street === 0 && e.dir === 'v+' && e.a[1] === -400);
  const r = SIM.navRoute(LL, { edge: e0.id, d: 10 }, { gate: LL.warehouses[0] });
  assert.deepEqual(r.steps.map(s => [s.kind, Math.round(s.dist)]), [['right', 390], ['left', 430], ['gateRight', 480]]);
  const at = (edge, d) => SIM.navGuide(LL, r, { edge, d, off: 0 });
  const eU = G.edges.find(e => e.street === 3 && e.dir === 'u+' && e.a[0] === 0), eV = G.edges.find(e => e.street === 1 && e.dir === 'v+');
  let g = at(e0.id, 10);
  assert.deepEqual([g.kind, Math.round(g.dist), g.then, g.lanes.map(l => l.use)], ['straight', 390, null, [true, true]]);
  g = at(e0.id, 200);
  assert.deepEqual([g.kind, Math.round(g.dist), g.then && g.then.kind, Math.round(g.then.dist), g.lanes.map(l => l.use)], ['right', 200, 'left', 240, [false, true]]);
  assert.deepEqual(g.lanes.map(l => l.arrows), [['left', 'straight'], ['straight', 'right']]);
  g = at(eU.id, 20);
  assert.deepEqual([g.kind, Math.round(g.dist), g.then && g.then.kind, g.lanes], ['left', 20, 'gateRight', null]);
  assert.equal(at(eV.id, 45).kind, 'arrive');
  // Atsugi: from the plaza up Main A to the warehouse gate on the left, in the left lane
  const A = SIM.townLayout(2), ra = SIM.navRoute(A, { plaza: true, start: true }, { gate: A.warehouses[1] }), ga = SIM.navGuide(A, ra, { edge: ra.edges[0], d: 0, off: 0 });
  assert.deepEqual([ga.kind, Math.round(ga.dist / 10) * 10, ga.lanes.map(l => l.use)], ['gateLeft', 140, [true, false]]);
});

// Run navFollow along a list of [u, v, θ] at `dt` a sample; returns the samples at which it rerouted.
function follow(L, T, pts, dt = 1 / 60) { const out = []; pts.forEach(([u, v, h], k) => { if (SIM.navFollow(L, T, u, v, h, dt) === 'reroute') out.push(k); }); return out; }
const tracker = (route, to) => ({ route, to, match: null, offT: 0, backD: 0, lastT: -99, t: 0 });
const line = (u0, v0, u1, v1, n, h) => Array.from({ length: n + 1 }, (_, k) => [u0 + (u1 - u0) * k / n, v0 + (v1 - v0) * k / n, h]);

test('N5 探し直し：ルートにない道に入る・逆向きに 15 m・20 m 離れて 2 秒で探し直し、新しいルートは今の道から目的地に届く', () => {
  const A = SIM.townLayout(2), G = SIM.navGraph(A), to = { gate: A.warehouses[1] }, base = SIM.navRoute(A, { plaza: true, start: true }, to);
  const arrives = r => r && /^gate/.test(r.steps.at(-1).kind);
  // a street that is not on the route: west along the cross street at v = 123 → at once
  let T = tracker(base, to), hits = follow(A, T, [[-2, 80, Math.PI / 2], ...line(-12, 123, -40, 123, 28, Math.PI)]);
  assert.ok(hits.length === 1 && hits[0] <= 12, `wrong street: ${hits}`); assert.ok(arrives(T.route)); assert.equal(G.edges[T.route.edges[0]].street, 1);
  // the wrong way along the route's street, south on Main A from v = 200: after 15 m
  T = tracker(base, to); hits = follow(A, T, line(-4.875, 200, -4.875, 170, 60, -Math.PI / 2));
  assert.ok(hits.length === 1 && hits[0] >= 30 && hits[0] <= 34, `wrong way: ${hits}`); assert.ok(arrives(T.route));
  // 20 m and more from the route (inside a block) for 2 s, with no street under the rig: the route from where it last was
  // is the same one, so nothing is announced (not every 3 s, as a yard or a dead end would otherwise get)
  T = tracker(base, to); follow(A, T, [[-4.875, 150, Math.PI / 2]]);
  hits = follow(A, T, Array.from({ length: 600 }, () => [-45, 150, Math.PI / 2]), 1 / 60);
  assert.deepEqual(hits, [], `off the route for 10 s: ${hits}`);
});

test('交差点を曲がるあいだは探し直さない', () => {
  const G = SIM.navGraph(LL), e0 = G.edges.find(e => e.street === 0 && e.dir === 'v+' && e.a[1] === -400), to = { gate: LL.warehouses[0] };
  const T = tracker(SIM.navRoute(LL, { edge: e0.id, d: 10 }, to), to), pts = [...line(0, -390, 0, -16, 374, Math.PI / 2)];
  for (let k = 0; k <= 30; k++) { const a = Math.PI - k / 30 * Math.PI / 2; pts.push([16 + 16 * Math.cos(a), -16 + 16 * Math.sin(a), a - Math.PI / 2]); }   // right, radius 16
  pts.push(...line(16, 0, 26, 0, 10, 0));
  for (let k = 0; k <= 30; k++) { const a = -Math.PI / 2 + k / 30 * Math.PI / 2; pts.push([26 + 14 * Math.cos(a), 14 + 14 * Math.sin(a), a + Math.PI / 2]); }   // left, radius 14
  pts.push(...line(40, 14, 40, 45, 31, Math.PI / 2));
  assert.deepEqual(follow(LL, T, pts), []);
});

test('門を出る向きを間違えても、U ターンなしで探し直す', () => {
  const A = SIM.townLayout(2), G = SIM.navGraph(A), w = A.warehouses[1], to = { plaza: true }, base = SIM.navRoute(A, { gate: w }, to);
  assert.equal(base.steps[0].kind, 'outRight');   // south, toward the plaza
  const T = tracker(base, to), hits = follow(A, T, line(-4.875, 188, -4.875, 210, 44, Math.PI / 2));   // out to the left (north) instead
  assert.equal(hits.length, 1, `${hits}`);
  const r = T.route; assert.equal(r.steps.at(-1).kind, 'plaza');
  for (let k = 1; k < r.edges.length; k++) { const a = G.edges[r.edges[k - 1]], b = G.edges[r.edges[k]]; assert.ok(!(a.from === b.to && a.to === b.from), 'no U-turn'); }
});

test('同じ道を 2 度使うルート（門を通り過ぎてから街区を回って戻る）では、2 度目に通るとき門までの案内になる', () => {
  let found = 0;
  for (let i = 0; i < 13 && found < 3; i++) {
    const L = SIM.townLayout(i), G = SIM.navGraph(L);
    for (const w of L.warehouses) for (const e of G.edges) {
      if (e.street !== w.street) continue;
      const k = L.streets[e.street].axis === 'v' ? 1 : 0, t = Math.abs((k ? w.gate.v : w.gate.u) - e.a[k]);
      if (t > e.len || t + 15 > e.len - 1 || t < 25) continue;
      const r = SIM.navRoute(L, { edge: e.id, d: t + 15 }, { gate: w });   // 15 m past the gate
      if (!r || r.edges.indexOf(e.id) === r.edges.lastIndexOf(e.id)) continue;
      found++;
      const g = SIM.navGuide(L, r, { edge: e.id, d: t - 20, off: 0 });   // back on it, 20 m before the gate
      assert.ok(g && /^gate/.test(g.kind) && Math.abs(g.dist - 20) < 1, `${L.site.ic.jp} ${w.name}: ${JSON.stringify(g)}`);
      const pts = SIM.navRoutePoly(L, r, { edge: e.id, d: t - 20 });
      assert.ok(pts.length === 2 && Math.hypot(pts[1][0] - r.steps.at(-1).at[0], pts[1][1] - r.steps.at(-1).at[1]) < 0.01, `the line: ${JSON.stringify(pts)}`);
    }
  }
  assert.ok(found > 0, 'a route that uses a street piece twice');
});

test('ルートの線の点：広場から、門から、走っている位置から、終わりの所まで', () => {
  const A = SIM.townLayout(2), w = A.warehouses[1];
  const go = SIM.navRoute(A, { plaza: true, start: true }, { gate: w }), pg = SIM.navRoutePoly(A, go, null);
  assert.deepEqual(pg[0].map(Math.round), [0, 45]); assert.deepEqual(pg.at(-1).map(x => Math.round(x * 100) / 100), go.steps.at(-1).at.map(x => Math.round(x * 100) / 100));
  const out = SIM.navRoute(A, { gate: w }, { plaza: true }), po = SIM.navRoutePoly(A, out, null);
  assert.deepEqual(po[0].map(x => Math.round(x * 100) / 100), out.steps[0].at.map(x => Math.round(x * 100) / 100)); assert.deepEqual(po.at(-1).map(Math.round), [0, 45]);
  const pm = SIM.navRoutePoly(A, go, { edge: go.edges[0], d: 30 });
  assert.deepEqual(pm[0].map(Math.round), [0, 75]);
});

test('目的地でない出口ランプの文', () => { assert.equal(SIM.navText('wrongRamp'), '目的地ではない出口です'); });
test('SA の案内の文', () => {
  const T = { saFuel: '中井SA で給油を', saRest: '中井SA で休憩を', saLane: '中井SA 入口　左車線へ', saExit: 'SA 入口　左', toPump: '給油機の横に止める',
    toStall: '大型車の枠に止める', toOut: '出口へ', stopFuel: '止まって「給油」', stopNap: '止まって「仮眠」' };
  for (const [k, v] of Object.entries(T)) assert.equal(SIM.navText(k, '中井'), v, k);
});

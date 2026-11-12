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

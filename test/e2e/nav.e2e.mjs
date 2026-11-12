// The navigation in the game: turn-by-turn guidance, new routes, the expressway's exit lanes, the cab screen.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// In the page: a driver who decides only from navState().maneuver (which way, how far, which lane) and uses the town's
// map just to steer: along the kerb lane, round a corner at the junction ahead, into a gate, out of a yard, into the plaza.
const DRIVER_SRC = `(() => {
  const DIR = { 'u+': [1, 0], 'v+': [0, 1], 'u-': [-1, 0], 'v-': [0, -1] };
  const W = (site, u, v) => { const q = townXZ(site, u, v, {}); return [q.x, q.z]; };
  // the fixed cross coordinate of street st's lane k (0: kerb) for direction d
  const laneC = (st, d, k) => { const o = (st.lanes - 0.5 - k) * st.laneW; return st.c + (st.axis === 'v' ? -d[1] : d[0]) * o; };
  const lanePt = (st, d, k, t) => (st.axis === 'v' ? [laneC(st, d, k), t] : [t, laneC(st, d, k)]);
  // a 90-degree corner of radius R at P, coming in along d1 and leaving along d2
  const corner = (P, d1, d2, R, out) => {
    const c = [P[0] + (d2[0] - d1[0]) * R, P[1] + (d2[1] - d1[1]) * R], s = [P[0] - d1[0] * R, P[1] - d1[1] * R], e = [P[0] + d2[0] * R, P[1] + d2[1] * R];
    const a0 = Math.atan2(s[1] - c[1], s[0] - c[0]); let da = Math.atan2(e[1] - c[1], e[0] - c[0]) - a0; da = Math.atan2(Math.sin(da), Math.cos(da));
    for (let k = 0; k <= 12; k++) { const a = a0 + da * k / 12; out.push([c[0] + R * Math.cos(a), c[1] + R * Math.sin(a)]); }
  };
  const turnDir = (d, kind) => (/[Ll]eft/.test(kind) ? [-d[1], d[0]] : [d[1], -d[0]]);
  window.__obey = async (i, seconds, stopWhen, force) => {
    const L = TOWNS_LOADED.get(i).layout, site = L.site, G = navGraph(L), seen = [], q = {};
    let path = null, committed = false, t = 0, check = 0, last = '';
    const front = () => { townUV(site, TR.x + Math.sin(TR.h) * RIGP.front, TR.z + Math.cos(TR.h) * RIGP.front, q); return [q.u, q.v]; };
    const where = () => { const [u, v] = front(); const m = navMatch(L, u, v, wrapA(TR.h - site.hu), null); return m && { e: G.edges[m.edge], u, v }; };
    const cruise = ({ e, u, v }) => { const st = L.streets[e.street], d = DIR[e.dir], t0 = st.axis === 'v' ? v : u; return [0, 15, 40].map(k => lanePt(st, d, 0, t0 + (d[0] + d[1]) * k)); };
    const turn = ({ e }, kind) => {
      const n = L.nodes[e.to], d1 = DIR[e.dir], d2 = turnDir(d1, kind), A = L.streets[e.street], B = L.streets[n.streets[0] === e.street ? n.streets[1] : n.streets[0]];
      const right = kind === 'right', kA = right && A.lanes > 1 ? A.lanes - 1 : 0, kB = right && B.lanes > 1 ? B.lanes - 1 : 0;
      const P = A.axis === 'v' ? [laneC(A, d1, kA), laneC(B, d2, kB)] : [laneC(B, d2, kB), laneC(A, d1, kA)], out = [];
      out.push([P[0] - d1[0] * 40, P[1] - d1[1] * 40]); corner(P, d1, d2, right ? 16 : 14, out); out.push([P[0] + d2[0] * 45, P[1] + d2[1] * 45]);
      return out;
    };
    const gate = ({ e }, kind) => {
      const w = GAME.job.whB, g = w.gate, d1 = DIR[e.dir], A = L.streets[e.street], k = kind === 'gateRight' && A.lanes > 1 ? A.lanes - 1 : 0;
      const P = A.axis === 'v' ? [laneC(A, d1, k), g.v] : [g.u, laneC(A, d1, k)], n = [g.nu, g.nv], out = [];
      out.push([P[0] - d1[0] * 40, P[1] - d1[1] * 40]); corner(P, d1, n, kind === 'gateRight' ? 16 : 14, out); out.push([P[0] + n[0] * 40, P[1] + n[1] * 40]);
      return out;
    };
    const plaza = ({ u }) => [[4.875, Math.min(u, 120)], [4.875, 50], ...L.plaza.entryPath];
    const outOfYard = kind => {   // the start yard, in the gate's frame: straight, an S across to the gate's line, out, round into the street
      const w = GAME.job.whA, g = w.gate, n = [g.nu, g.nv], lf = [-n[1], n[0]], [u, v] = [TR.tu, TR.tv];
      const P = (d, x) => [g.u + d * n[0] + x * lf[0], g.v + d * n[1] + x * lf[1]], d0 = (u - g.u) * n[0] + (v - g.v) * n[1], x0 = (u - g.u) * lf[0] + (v - g.v) * lf[1];
      const back = [-n[0], -n[1]], side = x0 < 0 ? lf : [-lf[0], -lf[1]], out = [P(d0 - 2, x0)], R = 15, dc = 15 + R;
      corner(P(dc, x0), back, side, R, out); corner(P(dc, 0), side, back, R, out);
      const st = L.streets[w.street], d2 = turnDir(back, kind), kk = kind === 'outRight' && st.lanes > 1 ? st.lanes - 1 : 0;
      const Q = st.axis === 'v' ? [laneC(st, d2, kk), g.v] : [g.u, laneC(st, d2, kk)];
      corner(Q, back, d2, kind === 'outRight' ? 16 : 14, out); out.push([Q[0] + d2[0] * 40, Q[1] + d2[1] * 40]);
      return out;
    };
    while (t < seconds && GAME.state === 'drive') {
      if ((check -= 1 / 60) <= 0) {
        check = 0.25;
        if (stopWhen && stopWhen()) break;
        const m = navState().maneuver; if (m && m.kind !== last) { seen.push(m.kind); last = m.kind; }
        if (path && committed && Math.hypot(path.at(-1)[0] - TR.tu, path.at(-1)[1] - TR.tv) < 12) committed = false;
        if (!committed && m) {
          const at = NAV.leg === 'town' ? where() : null;
          const f = force && at && force(at, m, { turn });
          if (f) { path = f; committed = true; }
          else if (NAV.leg === 'startYard' && /^out/.test(m.kind)) { path = outOfYard(m.kind); committed = true; }
          else if (at && (m.kind === 'left' || m.kind === 'right') && m.dist <= 30) { path = turn(at, m.kind); committed = true; }
          else if (at && /^gate/.test(m.kind) && m.dist <= 30) { path = gate(at, m.kind); committed = true; }
          else if (at && m.kind === 'plaza' && m.dist <= 60) { path = plaza(at); committed = true; }
          else if (at) path = cruise(at);
        }
      }
      if (path) {   // pure pursuit, 8 m ahead along the path
        const pts = path.map(([u, v]) => W(site, u, v));
        let j = 0, bd = Infinity; pts.forEach((p, k) => { const dd = Math.hypot(p[0] - TR.x, p[1] - TR.z); if (dd < bd) { bd = dd; j = k; } });
        let k = j, acc = 0; while (k < pts.length - 1 && acc < 8) { acc += Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]); k++; }
        const dx = pts[k][0] - TR.x, dz = pts[k][1] - TR.z, alpha = Math.atan2(dx * Math.cos(TR.h) - dz * Math.sin(TR.h), dx * Math.sin(TR.h) + dz * Math.cos(TR.h));
        const steer = clamp(-Math.atan(2 * 3.9 * Math.sin(alpha) / Math.max(4, Math.hypot(dx, dz))) / steerLock(TR.v), -1, 1), want = committed ? 12 : 22, v = TR.v * 3.6;
        INP.tGas = clamp((want - v) * 0.25, 0, 1); INP.tBrake = clamp((v - want - 2) * 0.15, 0, 1); INP.tWheelHeld = true;
        INP.tWheel = Math.sign(steer) * Math.pow(Math.abs(steer), 1 / 1.35) * 2.6;
      }
      simTick(1 / 60); t += 1 / 60;
    }
    INP.tGas = 0; INP.tWheelHeld = false; for (let n = 0; n < 120 && Math.abs(TR.v) > 0.05; n++) { INP.tBrake = 1; simTick(1 / 60); } INP.tBrake = 0;
    return { t, seen };
  };
  window.__noCars = i => { const X = TOWN_TRAFFIC.get(i); if (X) { X.cars.length = 0; for (const g of X.groups) g.visible = false; } };
})()`;

test('E1 仕事 1：案内だけに従う運転手が、東京の構内から入口ゲートへ、厚木の出口から目的の倉庫の門まで着く', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(DRIVER_SRC);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __noCars(0);
    const L0 = TOWNS_LOADED.get(0).layout;
    const tokyo = await __obey(0, 240, () => L0.plaza.gates.entry.state === 'open' || NAV.leg === 'band');
    const out = { tokyoGate: L0.plaza.gates.entry.state, tokyoSeen: tokyo.seen };
    // Atsugi: from the end of the exit ramp through the exit gate (no turns there), then by the guidance to the gate
    const r2 = RAMPS.find(x => x.ic.i === 2), ex = [];
    for (let s = r2.sDiv + 420; s <= r2.sEnd; s += 5) { const p = posAt(s, rampEdges(s - r2.sDiv).cx, {}); ex.push([p.x, p.z]); }
    placeTruck(r2.sDiv + 420, rampEdges(420).cx, 8, { coupled: true }); await __ready(); __noCars(2);
    const L2 = TOWNS_LOADED.get(2).layout;
    __drive([...ex, ...__town(2, [...L2.plaza.exitPath.filter(p => p[0] > -24.5), [-4.875, 60]])], 15, 120);
    const atsugi = await __obey(2, 240, () => NAV.leg === 'destYard');
    return { ...out, atsugiSeen: atsugi.seen, leg: NAV.leg, zone: TR.zone, town: TR.town };
  });
  console.log('E1', JSON.stringify(r));
  assert.equal(r.tokyoGate, 'open', JSON.stringify(r)); assert.match(r.tokyoSeen[0], /^out(Left|Right)$/);
  assert.deepEqual([r.leg, r.zone, r.town], ['destYard', 'town', 2], JSON.stringify(r)); assert.ok(r.atsugiSeen.some(k => /^gate/.test(k)), JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('E4 わざと違う向きに曲がると、2 秒以内に「ルートを探し直しました」が出て、新しいルートで門に着ける', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page); await page.evaluate(DRIVER_SRC);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __placeTown(2, -4.875, 70, 0, 1, 15); await __ready(); __noCars(2);
    const L = TOWNS_LOADED.get(2).layout, G = navGraph(L);
    let msg = null, tWrong = null, tMsg = null;
    // at the first junction, turn right whatever the guidance says (it says to go on to the gate on the left)
    const forced = { done: false };
    const res = await __obey(2, 300, () => {
      const me = NAV.T && NAV.T.match && G.edges[NAV.T.match.edge];
      if (forced.done && tWrong == null && me && me.street !== 0) tWrong = GAME.clock;
      if (navState().reroute && msg == null) { msg = document.getElementById('ledText').textContent; tMsg = GAME.clock; }
      return NAV.leg === 'destYard';
    }, (at, m, b) => {
      if (forced.done || at.e.dir !== 'v+' || at.e.street !== 0 || Math.abs(L.nodes[at.e.to].v - at.v) > 30) return null;
      forced.done = true; forced.guide = m.kind;
      return b.turn(at, 'right');
    });
    const late = tMsg != null && tWrong != null ? (tMsg - tWrong) / TIME_SCALE : null;
    return { msg, late, guideAtTurn: forced.guide, leg: NAV.leg, seen: res.seen };
  });
  assert.notEqual(r.guideAtTurn, 'right', 'the guidance did not say to turn right there');
  assert.equal(r.msg, 'ルートを探し直しました', JSON.stringify(r)); assert.ok(r.late != null && r.late <= 2, `message ${r.late} s after the wrong street`);
  assert.equal(r.leg, 'destYard', JSON.stringify(r));
  assert.deepEqual(errors, []);
}));

test('E5 高速：目的の出口の 2km の標識から「左車線へ」と 2 車線の絵（左が明るい）、500m の標識から「出口　左」、入口の帯で「本線へ合流　右」', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const r2 = RAMPS.find(x => x.ic.i === 2), at = (s, lat) => { placeTruck(s, lat, 0, { coupled: true }); for (let i = 0; i < 5; i++) simTick(1 / 60); const st = navState(); return { kind: st.maneuver && st.maneuver.kind, text: st.guide, lanes: st.maneuver && st.maneuver.lanes && st.maneuver.lanes.map(l => l.use), card: st.card }; };
    const en = ENTRIES[0];
    const r1 = RAMPS.find(x => x.ic.i === 1);   // 横浜町田: not job 1's destination
    return { far: at(r2.sDiv - 1500, X_TRV), lane: at(r2.sDiv - 650, X_TRV), exit: at(r2.sDiv - 100, X_TRV), band: at(en.s0 + 120, entryEdges(120).cx),
      wrong: at(r1.sDiv + 450, rampEdges(450).cx), right: at(r2.sDiv + 450, rampEdges(450).cx) };
  });
  assert.equal(r.far.card, false, JSON.stringify(r));
  assert.deepEqual([r.lane.kind, r.lane.text, r.lane.lanes, r.lane.card], ['exitLane', '厚木IC 出口　左車線へ', [true, false], true]);
  assert.deepEqual([r.exit.kind, r.exit.text, r.exit.card], ['exit', '出口　左', true]);
  assert.deepEqual([r.band.kind, r.band.text, r.band.card], ['merge', '本線へ合流　右', true]);
  assert.deepEqual([r.wrong.kind, r.wrong.text, r.wrong.card], ['wrongRamp', '目的地ではない出口です', true], 'a ramp that is not the destination');
  assert.deepEqual([r.right.kind, r.right.text], ['ramp', '料金所 ETC は 20km/h 以下']);
}));

test('目的地が変わるとルートの終わりも変わる', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __placeTown(2, -4.875, 70, 0, 1, 0); await __ready();
    for (let i = 0; i < 10; i++) simTick(1 / 60);
    const before = { gate: !!NAV.T.to.gate, end: NAV.T.route.steps.at(-1).kind };
    nextDestination('テスト。');
    for (let i = 0; i < 10; i++) simTick(1 / 60);
    return { before, after: { plaza: !!NAV.T.to.plaza, end: NAV.T.route && NAV.T.route.steps.at(-1).kind }, to: GAME.job.to };
  });
  assert.deepEqual(r.before, { gate: true, end: 'gateLeft' }, JSON.stringify(r));
  assert.deepEqual([r.after.plaza, r.after.end, r.to], [true, 'plaza', 3], JSON.stringify(r));
}));

test('町の中で再開した直後から案内が出る', async () => {
  let store;
  await withGame({}, async page => {
    await startJob(page); await driveHelpers(page);
    await page.evaluate(async () => {
      INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
      __placeTown(2, -4.875, 70, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60); saveDrive();
    });
    store = await page.evaluate(() => ({ 'nlh.drive': JSON.parse(localStorage.getItem('nlh.drive')) }));
  });
  await withGame({ storage: store }, async page => {
    await startJob(page);
    const m = await page.evaluate(() => { for (let i = 0; i < 5; i++) simTick(1 / 60); const st = navState(); return st.maneuver && st.maneuver.kind; });
    assert.equal(m, 'gateLeft');
  });
});

test('町の道から外れて道探しができない所では仮の案内（「〇〇まで 〇 m」）、簡単な構内の町では枠への案内', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    // Atsugi as it is: in the yard of the other warehouse (not a street, not the destination)
    const w0 = townLayout(2).warehouses[0], y = w0.yard;
    __placeTown(2, -4.875, 150, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);   // on Main A first, as if it drove in
    __placeTown(2, (y.u0 + y.u1) / 2, (y.v0 + y.v1) / 2, 0, 1, 0); for (let i = 0; i < 10; i++) simTick(1 / 60);
    let reroutes = 0; for (let i = 0; i < 600; i++) { simTick(1 / 60); if (NAV.msgT > 1.99) reroutes++; }   // 10 s standing there
    const st = navState(), out = { off: { guide: st.guide, maneuver: st.maneuver, leg: NAV.leg, name: GAME.job.whB.name, reroutes } };
    return out;
  });
  assert.equal(r.off.leg, 'yard', JSON.stringify(r)); assert.equal(r.off.maneuver, null); assert.equal(r.off.reroutes, 0, 'no new route announced in another yard');
  assert.match(r.off.guide, new RegExp('^' + r.off.name + 'まで \\d*0 m$'), JSON.stringify(r));
  const f = await page.evaluate(async () => {
    // Atsugi as the plain yard a failed build falls back to (no streets, no docks): the bay
    townDrop(2); _jobLayouts.set(2, townFallbackLayout(2)); GAME.job.whB = jobWh(2, GAME.job.toWh);
    const b = GAME.job.whB.bay; __placeTown(2, b.u, b.v - 20, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);
    const y = navState(); return { fallback: TOWNS_LOADED.get(2).layout.fallback, kind: y.maneuver && y.maneuver.kind, dist: y.maneuver && y.maneuver.dist, leg: NAV.leg };
  });
  assert.ok(f.fallback && f.leg === 'destYard' && f.kind === 'bay' && f.dist < 30, JSON.stringify(f));
}));

test('drawNav は町の中で 1 回 3 ms 以内（20 回の平均）', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  const ms = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __placeTown(2, -4.875, 70, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);
    const st = navState(); drawNav(st); const t0 = performance.now(); for (let i = 0; i < 20; i++) drawNav(navState()); return (performance.now() - t0) / 20;
  });
  assert.ok(ms <= 3, `${ms.toFixed(2)} ms`);
}));

test('E2 小さな札：スマホの縦・横で、ボタン・目的地の札・LED と重ならず画面に収まる。「地図」ボタンも収まる', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) await withGame({ width, height, touch: true }, async (page, errors) => {
    await startJob(page); await driveHelpers(page);
    const r = await page.evaluate(async () => {
      INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
      const gate = GAME.job.whB.gate;
      __placeTown(2, -4.875, gate.v - 100, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);
      led('ルートを探し直しました。その先の交差点を左折してください');
      navCardUpdate(navState()); await __t.frames(2);
      const box = el => { const q = el.getBoundingClientRect(); return { x: q.left, y: q.top, r: q.right, b: q.bottom, w: q.width, h: q.height }; };
      const card = document.getElementById('navCard');
      return { hidden: card.hidden, card: box(card), text: card.textContent, sign: box(document.getElementById('jobSign')), led: box(document.getElementById('led')),
        buttons: [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden).map(b => ({ name: b.textContent, ...box(b) })),
        pads: ['blinkPad', 'wheelPad', 'gearPad', 'pedalPad', 'speedo'].map(id => ({ name: id, ...box(document.getElementById(id)) })).filter(b => b.w > 0) };
    });
    const hits = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1, tag = `${width}x${height}`;
    assert.ok(r.pads.length >= 4, `${tag}: the touch controls are shown`);
    for (const b of r.pads) assert.ok(!hits(r.card, b), `${tag}: the card overlaps ${b.name} ${JSON.stringify([r.card, b])}`);
    assert.equal(r.hidden, false, tag); assert.ok(r.card.w > 60 && r.card.h > 30, `${tag} ${JSON.stringify(r.card)}`); assert.match(r.text, /門は左/);
    assert.ok(r.card.x >= 0 && r.card.r <= width && r.card.y >= 0 && r.card.b <= height, `${tag}: the card is off screen ${JSON.stringify(r.card)}`);
    assert.ok(!hits(r.card, r.sign) && !hits(r.card, r.led), `${tag}: the card overlaps the sign or the board ${JSON.stringify(r)}`);
    for (const b of r.buttons) {
      assert.ok(!hits(r.card, b), `${tag}: the card overlaps ${b.name}`);
      assert.ok(b.x >= 0 && b.r <= width, `${tag}: ${b.name} is off screen`);
    }
    assert.ok(r.buttons.some(b => b.name === '地図'), `${tag}: no 地図 button`);
    assert.deepEqual(errors, []);
  });
});

test('E3 全体地図：M で開くと時刻と周りの車が止まり、東名の線と町のルート（青）が描かれる。M で閉じると続きから走れる。縦持ちのスマホでも地図が画面に収まる', async () => {
  for (const [width, height] of [[1280, 720], [390, 844]]) await withGame({ width, height }, async (page, errors) => {
    await startJob(page); await driveHelpers(page);
    await page.evaluate(async () => {
      INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
      __placeTown(2, -4.875, 70, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);
    });
    await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
    const r = await page.evaluate(async () => {
      const c0 = GAME.clock, X = TOWN_TRAFFIC.get(2), car = X && X.cars.find(c => !c.hidden), d0 = car && car.d;
      await __t.frames(10);
      const cv = document.getElementById('mapCanvas'), g = cv.getContext('2d'), px = g.getImageData(0, 0, cv.width, cv.height).data;
      let blue = 0, grey = 0;
      for (let i = 0; i < px.length; i += 16) { const [rr, gg, bb] = [px[i], px[i + 1], px[i + 2]]; if (rr === 47 && gg === 156 && bb === 255) blue++; if (rr === 127 && gg === 142 && bb === 155) grey++; }
      const q = cv.getBoundingClientRect();
      return { state: GAME.state, clockStill: GAME.clock === c0, carStill: !car || car.d === d0, blue, grey, rect: { x: q.left, y: q.top, r: q.right, b: q.bottom } };
    });
    await page.keyboard.press('KeyM'); await page.waitForTimeout(300);
    const after = await page.evaluate(() => { const x0 = TR.x, z0 = TR.z, st = GAME.state; INP.tGas = 1; for (let i = 0; i < 120; i++) simTick(1 / 60); INP.tGas = 0; return { st, moved: Math.hypot(TR.x - x0, TR.z - z0) > 0.5 }; });
    const tag = `${width}x${height}`;
    assert.deepEqual([r.state, r.clockStill, r.carStill], ['map', true, true], `${tag} ${JSON.stringify(r)}`);
    assert.ok(r.blue > 20 && r.grey > 50, `${tag} drawn: ${JSON.stringify(r)}`);
    assert.ok(r.rect.x >= 0 && r.rect.y >= 0 && r.rect.r <= width + 0.5 && r.rect.b <= height + 0.5, `${tag} fits: ${JSON.stringify(r.rect)}`);
    assert.deepEqual([after.st, after.moved], ['drive', true], `${tag} ${JSON.stringify(after)}`);
    assert.deepEqual(errors, []);
  });
});

test('全体地図を開いたときの描画は 1 回 30 ms 以内', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    __placeTown(2, -4.875, 70, 0, 1, 0); await __ready(); for (let i = 0; i < 10; i++) simTick(1 / 60);
    const t0 = performance.now(); mapOpen(); const open = performance.now() - t0; mapClose();
    const cv = document.getElementById('mapCanvas'), t1 = performance.now(); for (let i = 0; i < 5; i++) drawMap(cv, navState()); return { open, each: (performance.now() - t1) / 5 };
  });
  assert.ok(r.open <= 30 && r.each <= 30, JSON.stringify(r));
}));

test('構内でも青いルートが出る（出発の構内では門から）。高速にいるときの全体地図には、目的の町の広場から門までのルートが青く描かれる', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const yard = { leg: NAV.leg, pts: (navState().routePts || []).length };
    placeTruck(S0 + 1500, X_TRV, 0, { coupled: true }); for (let i = 0; i < 10; i++) simTick(1 / 60);
    mapOpen(); await __t.frames(2);
    const cv = document.getElementById('mapCanvas'), g = cv.getContext('2d'), top = Math.round(cv.height * 0.24) + 20, px = g.getImageData(0, top, cv.width, cv.height - top).data;
    let blue = 0; for (let i = 0; i < px.length; i += 4) if (px[i] === 47 && px[i + 1] === 156 && px[i + 2] === 255) blue++;
    mapClose();
    return { yard, blue };
  });
  assert.equal(r.yard.leg, 'startYard'); assert.ok(r.yard.pts >= 2, JSON.stringify(r));
  assert.ok(r.blue > 200, `blue route in the destination town on the map: ${r.blue}`);
}));

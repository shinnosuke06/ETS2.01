// ---------------------------------------------------------------------------
// Town rules without the DOM: the signals' cycle, the town traffic (cars on the
// layout's lanes, stopping for signals, stop signs, each other and the player),
// and the checks the game makes: docks, delivery bays, red lights.
// Positions and headings here are in town coordinates (u, v; angle 0 = +u).
// ---------------------------------------------------------------------------

// 70 s: the v approaches green 0-30, yellow 30-33, all red 33-35; the u approaches green 35-65, yellow 65-68, all red 68-70.
function signalState(node, axis, t) {
  if (!node.signal) return 'green';
  const p = (((t + node.phase) % 70) + 70) % 70;
  if (axis === 'v') return p < 30 ? 'green' : p < 33 ? 'yellow' : 'red';
  return p >= 35 && p < 65 ? 'green' : p >= 65 && p < 68 ? 'yellow' : 'red';
}
// Car following in town (the same kind of model as on the expressway, with town gaps).
function townIdm(v, v0, gap, dv) {
  const a = 1.5, b = 2.5, T = 1.2, s0 = 2.5;
  const ss = s0 + Math.max(0, v * T + v * dv / (2 * Math.sqrt(a * b)));
  return a * (1 - Math.pow(v / Math.max(v0, 0.1), 4) - (gap === Infinity ? 0 : (ss / Math.max(gap, 0.3)) ** 2));
}

const TOWN_CAR_TYPES = [['kei', 0.26, 3.4, 1.48], ['sedan', 0.28, 4.7, 1.8], ['minivan', 0.2, 4.8, 1.8], ['truck', 0.14, 8.5, 2.3], ['keitora', 0.12, 3.4, 1.48]];
// per layout: lanes a car may start on, junction turns by node, and the approaches facing each other
const _tflow = new WeakMap();
function _townIndex(L) {
  let X = _tflow.get(L);
  if (X) return X;
  const OPP = { 'v+': 'v-', 'v-': 'v+', 'u+': 'u-', 'u-': 'u+' };
  X = { starts: L.lanes.filter(l => l.edge0 && !l.plaza && !l.turn).map(l => l.id), turns: new Map(), opp: new Map(), claim: new Map() };   // claim: stop-sign junction -> the car crossing it
  for (const l of L.lanes) if (l.turn) { if (!X.turns.has(l.node0)) X.turns.set(l.node0, []); X.turns.get(l.node0).push(l.id); }
  for (const l of L.lanes) if (!l.turn && l.node1 != null) X.opp.set(l.id, L.lanes.filter(o => !o.turn && o.node1 === l.node1 && o.dir === OPP[l.dir]).map(o => o.id));
  _tflow.set(L, X);
  return X;
}
function _pick(list, rand) { return list.length ? list[Math.floor(rand() * list.length) % list.length] : null; }
function _carNext(L, lane, rand) { const opts = lane.next.filter(id => !L.lanes[id].plaza); return _pick(opts, rand); }

function townCarsInit(L, n, rand) {
  const cars = [], pool = L.lanes.filter(l => !l.turn && !l.plaza && l.len > 20);
  for (let k = 0; k < n; k++) {
    let r = rand(), type = TOWN_CAR_TYPES[0];
    for (const t of TOWN_CAR_TYPES) { if (r < t[1]) { type = t; break; } r -= t[1]; }
    const car = { lane: -1, d: 0, v: 0, v0: 10, len: type[2], wid: type[3], heavy: type[0] === 'truck', type: type[0], next: null, stopT: 0, wait: 0, commit: -1, turnOk: false, hidden: false };
    for (let tries = 0; tries < 30; tries++) {
      const lane = pool[Math.floor(rand() * pool.length) % pool.length], d = 5 + rand() * Math.max(0, lane.len - 15);
      if (cars.some(o => o.lane === lane.id && Math.abs(o.d - d) < 30)) continue;
      car.lane = lane.id; car.d = d; break;
    }
    if (car.lane < 0) { car.hidden = true; car.lane = pool[0].id; }
    const lane = L.lanes[car.lane];
    car.v0 = Math.max(6, (lane.limit - 5 + 8 * rand()) / 3.6); car.v = car.v0 * 0.8;
    car.next = _carNext(L, lane, rand);
    cars.push(car);
  }
  return cars;
}

// Point and direction on a lane at distance d.
function _laneAt(lane, d, out) {
  const P = lane.pts;
  let k = 1, acc = 0;
  for (; k < P.length - 1; k++) { const s = Math.hypot(P[k][0] - P[k - 1][0], P[k][1] - P[k - 1][1]); if (acc + s >= d) break; acc += s; }
  const a = P[k - 1], b = P[k], s = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, t = clamp((d - acc) / s, 0, 1);
  out.u = a[0] + (b[0] - a[0]) * t; out.v = a[1] + (b[1] - a[1]) * t; out.h = Math.atan2(b[1] - a[1], b[0] - a[0]);
  return out;
}
// Where a car is drawn: on the chord between a point 0.4 of its length ahead of its centre and one as far behind,
// both on its path (so long cars sit inside a bend, like their wheels, rather than swinging out of their lane).
const _cpf = {}, _cpr = {};
function _pathAt(L, car, d, out) {
  const lane = L.lanes[car.lane];
  if (d < 0) {                                   // behind the lane's start: along its first piece
    const P = lane.pts, du = P[1][0] - P[0][0], dv = P[1][1] - P[0][1], s = Math.hypot(du, dv) || 1;
    out.u = P[0][0] + du / s * d; out.v = P[0][1] + dv / s * d; return out;
  }
  if (d > lane.len) {
    if (car.next != null) { const nx = L.lanes[car.next]; if (d - lane.len <= nx.len) return _laneAt(nx, d - lane.len, out); }
    const P = lane.pts, n = P.length, du = P[n - 1][0] - P[n - 2][0], dv = P[n - 1][1] - P[n - 2][1], s = Math.hypot(du, dv) || 1;
    out.u = P[n - 1][0] + du / s * (d - lane.len); out.v = P[n - 1][1] + dv / s * (d - lane.len); return out;
  }
  return _laneAt(lane, d, out);
}
function townCarPose(L, car, out) {
  const half = car.len * 0.4;
  _pathAt(L, car, car.d + half, _cpf); _pathAt(L, car, car.d - half, _cpr);
  out.u = (_cpf.u + _cpr.u) / 2; out.v = (_cpf.v + _cpr.v) / 2; out.h = Math.atan2(_cpf.v - _cpr.v, _cpf.u - _cpr.u);
  return out;
}

const _tpa = {};
function _inBox(b, u, v, m) {
  const du = u - b.u, dv = v - b.v, c = Math.cos(b.h), s = Math.sin(b.h);
  return Math.abs(du * c + dv * s) <= b.len / 2 + m && Math.abs(-du * s + dv * c) <= b.wid / 2 + m;
}
// distance from the car's front, along its way ahead (this lane, then the next), to the first player box (Infinity: none)
function _boxAhead(L, car, boxes) {
  if (!boxes.length) return Infinity;
  const lane = L.lanes[car.lane], nx = car.next != null ? L.lanes[car.next] : null, front = car.d + car.len / 2;
  for (let s = 0; s <= 50; s += 1) {
    let d = front + s, ln = lane;
    if (d > lane.len) { if (!nx) break; d -= lane.len; ln = nx; if (d > ln.len) break; }
    _laneAt(ln, d, _tpa);
    for (const b of boxes) if (_inBox(b, _tpa.u, _tpa.v, 0.8)) return s;
  }
  return Infinity;
}
// cars on the turns inside node n (other than car); with otherAxisOf, only those that cross this car's way:
// coming in on the other axis, or turning right across it
function _inJunction(L, X, cars, car, n, otherAxisOf) {
  const turns = X.turns.get(n) || [];
  return cars.some(o => o !== car && !o.hidden && turns.includes(o.lane) && (!otherAxisOf || L.lanes[o.lane].turn === 'right' || L.lanes[o.lane].dir[0] !== otherAxisOf));
}

function townCarsStep(L, cars, dt, t, boxes, rand) {
  const X = _townIndex(L);
  for (const car of cars) {
    if (car.hidden) { _respawn(L, X, cars, car, rand, boxes); continue; }
    const lane = L.lanes[car.lane], nx = car.next != null ? L.lanes[car.next] : null;
    // the car ahead on this lane, or on the next one near its start
    let gap = Infinity, vl = 0;
    for (const o of cars) {
      if (o === car || o.hidden) continue;
      let g = Infinity;
      if (o.lane === car.lane && o.d > car.d) g = o.d - car.d - (o.len + car.len) / 2;
      else if (nx && o.lane === nx.id) g = lane.len - car.d + o.d - (o.len + car.len) / 2;
      if (g < gap) { gap = g; vl = o.v; }
    }
    const bx = _boxAhead(L, car, boxes);
    if (bx < gap) { gap = bx; vl = 0; }
    // the stop line: signals, stop signs, right turns giving way
    const front = car.d + car.len / 2;
    if (lane.stopD != null && front < lane.stopD + 0.5) {
      const node = L.nodes[lane.stopNode], dist = lane.stopD - front, stopDist = car.v * car.v / (2 * 3) + 2;
      let go = true;
      if (node.signal) {
        const st = signalState(node, lane.stopAxis, t);
        if (st === 'green') {
          if (dist < stopDist) car.commit = lane.id;
          // someone crossing in the junction: stop for them unless too close to stop even hard
          if (_inJunction(L, X, cars, car, node.id, lane.dir[0])) go = dist < car.v * car.v / (2 * 7) + 1;
        } else go = car.commit === lane.id;
      } else if (node.stop) {
        if (car.v < 0.3 && dist <= 4) car.stopT += dt;
        go = car.commit === lane.id || (car.stopT >= 1 && !X.claim.get(node.id) && !_inJunction(L, X, cars, car, node.id, null));
        if (go && car.commit !== lane.id) { car.commit = lane.id; X.claim.set(node.id, car); }
      }
      if (go && nx && nx.turn === 'right' && !car.turnOk) {
        // give way to traffic coming the other way, at most 10 s, then go when the junction is clear
        const opp = X.opp.get(lane.id) || [], tNeed = car.wait > 10 ? 3.5 : 5;   // seconds until the oncoming car arrives; shorter after 10 s
        const coming = cars.some(o => { if (o === car || o.hidden || !opp.includes(o.lane)) return false; const rem = L.lanes[o.lane].len - o.d; return rem < 60 && rem / Math.max(o.v, 1) < tNeed; });
        if (car.v < 0.5 && dist <= 4) car.wait += dt;
        if (coming || _inJunction(L, X, cars, car, node.id, lane.dir[0])) go = false;
        else if (dist < 1) car.turnOk = true;   // committed to the turn
      }
      if (go && car.commit !== lane.id && nx && bx < dist + nx.len + 6) go = false;   // do not drive into a junction the truck is blocking
      if (!go) { const g = dist - 0.5; if (g < gap) { gap = g; vl = 0; } }
    }
    const acc = townIdm(car.v, car.v0, gap, car.v - vl);
    car.v = Math.max(0, car.v + clamp(acc, -8, 2) * dt);
    car.d += car.v * dt;
    // into the next lane, or off the town's edge (and back in at another)
    while (car.d > L.lanes[car.lane].len) {
      const cur = L.lanes[car.lane];
      car.d -= cur.len;
      if (car.next == null || cur.edge1) { car.hidden = true; break; }
      if (cur.turn && X.claim.get(cur.node0) === car) X.claim.delete(cur.node0);   // out of the junction
      car.lane = car.next; car.next = _carNext(L, L.lanes[car.lane], rand);
      car.stopT = 0; car.wait = 0; car.commit = -1; car.turnOk = false;
    }
    if (car.hidden) _respawn(L, X, cars, car, rand, boxes);
  }
}
const _rsp = {};
function _respawn(L, X, cars, car, rand, boxes = []) {
  for (const [n, o] of X.claim) if (o === car) X.claim.delete(n);
  for (let tries = 0; tries < 4; tries++) {
    const id = _pick(X.starts, rand);
    if (id == null) return;
    if (cars.some(o => o !== car && !o.hidden && o.lane === id && o.d - o.len / 2 < car.len + 15)) continue;   // room to come in behind a queue
    const lane = L.lanes[id];
    _laneAt(lane, car.len / 2, _rsp);
    if (boxes.some(b => Math.hypot(b.u - _rsp.u, b.v - _rsp.v) < b.len / 2 + car.len / 2 + 8)) continue;   // not where the rig stands
    car.lane = id; car.d = car.len / 2; car.v0 = Math.max(6, (lane.limit - 5 + 8 * rand()) / 3.6); car.v = car.v0 * 0.6;
    car.next = _carNext(L, lane, rand); car.stopT = 0; car.wait = 0; car.commit = -1; car.turnOk = false; car.hidden = false;
    return;
  }
  car.hidden = true;
}

// The player's tractor and trailer as boxes in the town's frame.
function townPlayerBoxes(site) {
  const T = TR, out = [], P = RIGP, q = {};
  const add = (x, z, h, ahead, behind, tractor) => {
    const c = (ahead - behind) / 2;
    townUV(site, x + Math.sin(h) * c, z + Math.cos(h) * c, q);
    out.push({ u: q.u, v: q.v, h: h - site.hu, len: ahead + behind, wid: 2.5, tractor });
  };
  add(T.x, T.z, T.h, P.front, P.back, true);
  const sp = TRAILERS[T.trailerKey];
  if (sp) add(T.tr.kx, T.tr.kz, T.tr.h, sp.nose, sp.rear, false);
  return out;
}

// Which signal's stop line the front crossed from prev to cur (town points) while it was red: the junction's id, or -1.
function townRedLight(L, prev, cur, t) {
  for (const l of L.lanes) {
    if (l.stopNode == null || l.turn) continue;
    const node = L.nodes[l.stopNode];
    if (!node.signal) continue;
    const P = l.pts[l.pts.length - 1], Q = l.pts[l.pts.length - 2], s = Math.hypot(P[0] - Q[0], P[1] - Q[1]), du = (P[0] - Q[0]) / s, dv = (P[1] - Q[1]) / s;
    const a = (prev.u - P[0]) * du + (prev.v - P[1]) * dv, b = (cur.u - P[0]) * du + (cur.v - P[1]) * dv;
    if (!(a < 0 && b >= 0)) continue;
    const w = L.streets[l.street].laneW / 2 + 0.3;
    if (Math.abs(-(cur.u - P[0]) * dv + (cur.v - P[1]) * du) > w) continue;
    if (signalState(node, l.stopAxis, t) === 'red') return node.id;
  }
  return -1;
}
// The nearest point on a town lane (not a turn or the plaza's bends) to (u, v), with the lane's direction there, kept at
// least 20 m along the lane (or half of it) so a trailer fits behind, and 6 m short of its end. { u, v, h, lane, d }
function townNearestLane(L, u, v) {
  let best = null, bd = Infinity;
  for (const l of L.lanes) {
    if (l.turn || l.plaza) continue;
    let acc = 0;
    for (let k = 1; k < l.pts.length; k++) {
      const a = l.pts[k - 1], b = l.pts[k], du = b[0] - a[0], dv = b[1] - a[1], s = Math.hypot(du, dv) || 1;
      const t = clamp(((u - a[0]) * du + (v - a[1]) * dv) / (s * s), 0, 1), d2 = (a[0] + du * t - u) ** 2 + (a[1] + dv * t - v) ** 2;
      if (d2 < bd) { bd = d2; best = { lane: l.id, d: acc + t * s }; }
      acc += s;
    }
  }
  if (!best) return null;
  const l = L.lanes[best.lane], d = clamp(best.d, Math.min(20, l.len / 2), l.len - Math.min(6, l.len / 2)), p = _laneAt(l, d, {});
  return { u: p.u, v: p.v, h: p.h, lane: l.id, d };
}
// The dock the trailer stands at: its rear end (town point) within 0.6 m of the bumpers, 0.5 m of the dock's centre line,
// and pointing into the dock within 4 degrees (back: the trailer's backward unit vector). -1: none.
function dockCheck(wh, rear, back) {
  const cos4 = Math.cos(4 * Math.PI / 180);
  for (let j = 0; j < wh.docks.length; j++) {
    const d = wh.docks[j], ru = rear.u - d.u, rv = rear.v - d.v;
    const off = ru * d.nu + rv * d.nv, lat = -ru * d.nv + rv * d.nu;
    if (off >= -0.2 && off <= 0.6 && Math.abs(lat) <= 0.5 && -(back.u * d.nu + back.v * d.nv) >= cos4) return j;
  }
  return -1;
}
// Kingpin and rear end both inside the 4 m x 18 m delivery bay.
function bayCheck(wh, kingpin, rear) {
  const b = wh.bay, inside = p => { const du = p.u - b.u, dv = p.v - b.v; return Math.abs(du * b.hu + dv * b.hv) <= 9 && Math.abs(-du * b.hv + dv * b.hu) <= 2; };
  return inside(kingpin) && inside(rear);
}

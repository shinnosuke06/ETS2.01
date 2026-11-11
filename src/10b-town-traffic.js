// ---------------------------------------------------------------------------
// Town traffic in the game: the cars of a loaded town (logic in 02d-town-flow.js)
// drawn with the expressway traffic's car models, and bumping into the rig.
// ---------------------------------------------------------------------------
const TOWN_TRAFFIC = new Map();   // town i -> { cars, groups, rand, t }

function townTrafficStart(i) {
  if (TOWN_TRAFFIC.has(i) || !TOWNS_LOADED.has(i)) return;
  const L = TOWNS_LOADED.get(i).layout, rand = rng(5501 + 37 * i);
  const cars = L.lanes.some(l => l.edge0 && !l.plaza) ? townCarsInit(L, Q.townCars, rand) : [];
  const groups = cars.map(c => {
    const P = PROTOS[c.type], cols = CAR_COLORS[c.type], grp = new THREE.Group();
    const mb = new THREE.Mesh(P.body, bodyMat(cols[Math.floor(rand() * cols.length)])), md = new THREE.Mesh(P.det, CAR_DET), ml = new THREE.Mesh(P.lit, CAR_LIT);
    mb.castShadow = Q.shadow > 0 && !!P.heavy; grp.add(mb, md, ml); scene.add(grp);
    c.len = P.len; c.wid = P.wid; c.heavy = !!P.heavy;   // the model's size
    return grp;
  });
  TOWN_TRAFFIC.set(i, { cars, groups, rand, t: 0 });
}
function townTrafficStop(i) {
  const X = TOWN_TRAFFIC.get(i);
  if (!X) return;
  for (const g of X.groups) scene.remove(g);
  TOWN_TRAFFIC.delete(i);
}
const _ttp = {}, _ttq = {};
// Advance every loaded town's traffic by dt; the town the rig is in also gets the rig's boxes and bumps.
function townTrafficStep(dt, active) {
  for (const [i, X] of TOWN_TRAFFIC) {
    const T = TOWNS_LOADED.get(i);
    if (!T) continue;
    const L = T.layout, site = L.site, near = TR.zone === 'town' && TR.town === i;
    X.t += dt;
    townCarsStep(L, X.cars, dt, GAME.clock / TIME_SCALE, near ? townPlayerBoxes(site) : [], X.rand);
    X.cars.forEach((c, k) => {
      const g = X.groups[k];
      g.visible = !c.hidden;
      if (c.hidden) return;
      townCarPose(L, c, _ttp); townXZ(site, _ttp.u, _ttp.v, _ttq);
      c.x = _ttq.x; c.z = _ttq.z; c.h = site.hu + _ttp.h;
      g.position.set(c.x, townHeight(site, _ttp.u, _ttp.v), c.z); g.rotation.y = c.h + Math.PI;
      if (near && active) townCarBump(c, L, site, X);
    });
  }
}
// The rig against one town car (world boxes): resolveBoxContact moves the car along its lane and pushes the rig.
// A car whose centre is inside the rig was not driven into it: the rig was put down on top of it (after a tow, a restart
// or a resume), or it came in at a lane's start where the rig stands. It goes elsewhere instead of bumping every step.
function townCarBump(c, L, site, X) {
  const P = RIGP, T = TR, ax = (P.front - P.back) / 2;
  const boxes = [{ x: T.x + Math.sin(T.h) * ax, z: T.z + Math.cos(T.h) * ax, h: T.h, len: P.front + P.back, wid: 2.5, tractor: true }];
  const sp = TRAILERS[T.trailerKey];
  if (sp) { const a = (sp.nose - sp.rear) / 2; boxes.push({ x: T.tr.kx + Math.sin(T.tr.h) * a, z: T.tr.kz + Math.cos(T.tr.h) * a, h: T.tr.h, len: sp.nose + sp.rear, wid: 2.5, tractor: false }); }
  for (const b of boxes) {
    if (Math.hypot(b.x - c.x, b.z - c.z) > (b.len + c.len) / 2 + 3) continue;
    const dx = c.x - b.x, dz = c.z - b.z, al = dx * Math.sin(b.h) + dz * Math.cos(b.h), sd = dx * Math.cos(b.h) - dz * Math.sin(b.h);
    if (Math.abs(al) < b.len / 2 && Math.abs(sd) < b.wid / 2) { _respawn(L, _townIndex(L), X.cars, c, X.rand); return; }
    if (resolveBoxContact(c, b)) { c.d = clamp(c.d, 0, L.lanes[c.lane].len); break; }
  }
}

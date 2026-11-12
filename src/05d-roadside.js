// ---------------------------------------------------------------------------
// Roadside things built with each road chunk: the overpasses (跨道橋), the road
// markings (arrows before the exits, 減速 on the exit lanes), the boundary fence
// and the shrubs between the lanes. The night lights are added in Task 6.
// ---------------------------------------------------------------------------
const RS = {
  deck: new THREE.BoxGeometry(1, 1, 1),
  pier: new THREE.CylinderGeometry(0.55, 0.65, 1, 10).translate(0, 0.5, 0),
  fencePost: new THREE.CylinderGeometry(0.035, 0.035, 1.6, 5).translate(0, 0.8, 0),
  mark: new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
};
for (const k in RS) RS[k].userData.keep = true;
const RS_MAT = {
  deck: new THREE.MeshLambertMaterial({ color: 0xb9b6ac }),
  deckTop: new THREE.MeshLambertMaterial({ color: 0x55585c }),
  rail: new THREE.MeshLambertMaterial({ color: 0x8f9a9f }),
  fence: null, arrow: null, gen: null, shrub: MAT.tree.clone(),   // shrub: the shrubs between the lanes, apart from the country's trees
};
// the fence's wire mesh and the road paint, drawn once
(function rsTextures() {
  const mesh = makeCanvas(64, 64), g = mesh.getContext('2d');
  g.clearRect(0, 0, 64, 64); g.strokeStyle = '#3f7a55'; g.lineWidth = 2;
  for (let k = -64; k < 128; k += 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 64, 64); g.stroke(); g.beginPath(); g.moveTo(k + 64, 0); g.lineTo(k, 64); g.stroke(); }
  g.fillStyle = '#3f7a55'; g.fillRect(0, 0, 64, 3); g.fillRect(0, 61, 64, 3);
  const ft = new THREE.CanvasTexture(mesh); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  RS_MAT.fence = new THREE.MeshLambertMaterial({ map: ft, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const paint = (draw, w, h) => { const c = makeCanvas(w, h), x = c.getContext('2d'); x.clearRect(0, 0, w, h); x.fillStyle = '#f2f2ee'; draw(x, w, h); const t = new THREE.CanvasTexture(c); return new THREE.MeshLambertMaterial({ map: t, transparent: true, alphaTest: 0.4, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }); };
  // straight-and-left arrow, seen from behind (the top of the picture is ahead)
  RS_MAT.arrow = paint((x, w, h) => {
    x.fillRect(w * 0.56, h * 0.2, w * 0.14, h * 0.8);
    x.beginPath(); x.moveTo(w * 0.63, 0); x.lineTo(w * 0.86, h * 0.22); x.lineTo(w * 0.4, h * 0.22); x.closePath(); x.fill();
    x.save(); x.translate(w * 0.6, h * 0.62); x.rotate(-0.8); x.fillRect(-w * 0.07, -h * 0.34, w * 0.14, h * 0.34);
    x.beginPath(); x.moveTo(0, -h * 0.48); x.lineTo(w * 0.2, -h * 0.3); x.lineTo(-w * 0.2, -h * 0.3); x.closePath(); x.fill(); x.restore();
  }, 64, 256);
  // 減速, stretched along the road as road text is, read from the near end: 減 near (the bottom), 速 beyond it
  RS_MAT.gen = paint((x, w, h) => { x.textAlign = 'center'; x.textBaseline = 'middle'; x.save(); x.scale(1, 2); x.font = font(56); x.fillText('速', w / 2, 32); x.fillText('減', w / 2, 96); x.restore(); }, 64, 256);
})();

// ---- overpasses --------------------------------------------------------------------------------------------------
function buildOverpasses(ctx) {
  const { O, s0, s1, grp } = ctx;
  for (const ov of OVERPASSES) {
    if (ov.s < s0 || ov.s >= s1) continue;
    const g = new THREE.Group(); g.userData.overpass = true;
    placeAt(g, O, ov.s, 0, 0, ov.skew);
    const yd = ov.y - elevAt(ov.s), half = 36, t = 1.2, P = new Parts();
    P.add(RS.deck.clone(), RS_MAT.deck, 0, yd + t / 2, 0, 0, 0, 0, half * 2, t, ov.w);   // the deck (x across the road)
    P.add(RS.deck.clone(), RS_MAT.deckTop, 0, yd + t + 0.03, 0, 0, 0, 0, half * 2, 0.06, ov.w - 1.2);
    for (const z of [-1, 1]) P.add(RS.deck.clone(), RS_MAT.rail, 0, yd + t + 0.55, z * (ov.w / 2 - 0.15), 0, 0, 0, half * 2, 1.0, 0.25);   // parapets
    for (const p of overpassPiers(ov)) {   // piers from the ground up to the deck
      const ground = elevAt(p.s), h = ov.y - ground;   // along the skewed deck: lat / cos(skew) from its middle
      P.add(RS.pier.clone(), RS_MAT.deck, p.lat / Math.cos(ov.skew), ground - elevAt(ov.s), 0, 0, 0, 0, 1, h, ov.kind === 'farm' ? 0.8 : 1.4);
    }
    for (const side of [-1, 1]) {   // the ends: an abutment down to the ground where the deck is above it
      const x = side * (half - 1.5), lat = x * Math.cos(ov.skew), s = ov.s + lat * Math.tan(ov.skew), d = Math.max(0, Math.abs(lat) - innerAt(s, side));
      const ty = terrainY(s, lat, d, side) - elevAt(ov.s), h = yd - ty;
      if (h > 0.3) P.add(RS.deck.clone(), RS_MAT.deck, x, ty + h / 2, 0, 0, 0, 0, 3, h, ov.w + 0.6);
    }
    P.build(g, { cast: true, receive: true });
    grp.add(g);
  }
}

// ---- road markings ---------------------------------------------------------------------------------------------------
function buildMarks(ctx) {
  const { O, s0, s1 } = ctx, arrows = [], gens = [];
  // the picture's top ahead and its right to the road's right (the plane's +z faces back, so turned round)
  const at = (list, s, lat, sx, sz) => { if (s < s0 || s >= s1) return; const p = localPt(O, s, lat, 0.035); list.push({ x: p.x, y: p.y, z: p.z, ry: p.h + Math.PI, sx, sy: 1, sz }); };
  for (const r of RAMPS) { for (const d of [300, 150]) at(arrows, r.sDiv - d, X_TRV, 1.4, 5.6); for (const u of [30, 50]) at(gens, r.sDiv + u, rampEdges(u).cx - 0.6, 2.2, 4.8); }
  for (const a of SAS) for (const u of [30, 50]) at(gens, a.sDiv + u, saExitEdges(u).cx - 0.6, 2.2, 4.8);
  instanced(ctx, RS.mark, RS_MAT.arrow, arrows);
  instanced(ctx, RS.mark, RS_MAT.gen, gens);
}

// ---- the boundary fence ----------------------------------------------------------------------------------------------
function buildFences(ctx) {
  const { O, i0, i1 } = ctx, posts = [];
  for (const side of [-1, 1]) {
    const x = side * 26, ys = [];
    for (let i = i0; i <= i1; i++) { const s = i * DS; ys[i] = fenceAt(s, side) ? terrainY(s, x, Math.max(0, 26 - innerAt(s, side)), side) : null; }
    const pos = [], uv = [], idx = [];
    for (let i = i0; i < i1; i++) {
      if (ys[i] == null || ys[i + 1] == null) continue;
      const a = localPt(O, i * DS, x, 0), b = localPt(O, (i + 1) * DS, x, 0), ya = ys[i] - O.y, yb = ys[i + 1] - O.y, n = pos.length / 3;
      pos.push(a.x, ya, a.z, b.x, yb, b.z, b.x, yb + 1.5, b.z, a.x, ya + 1.5, a.z);
      uv.push(0, 0, DS / 1.5, 0, DS / 1.5, 1, 0, 1);
      idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      posts.push({ x: a.x, y: ya, z: a.z });   // a post at every road sample (4 m)
    }
    if (!idx.length) continue;
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gm.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gm.setIndex(idx); gm.computeVertexNormals();
    addMesh(ctx, gm, RS_MAT.fence);
  }
  instanced(ctx, RS.fencePost, MAT.steel, posts);
}

// ---- shrubs between the lanes at the interchanges and the service areas ----------------------------------------------
function buildShrubs(ctx) {
  const { O, s0, s1, rand } = ctx, list = [], E = {}, n = Q.trees;
  const strip = (base, u0, u1, edges) => {
    for (let u = u0; u < u1; u += 6 / n) {
      const s = base + u; if (s < s0 || s >= s1) continue;
      const e = edges(u, E), w = X_PAVE - e.xr; if (w < 3) continue;   // the grass between the lane and the mainline
      const p = localPt(O, s, (e.xr + X_PAVE) / 2 + (rand() - 0.5) * (w - 2), 0);
      const h = 1 + rand(); list.push({ x: p.x, y: p.y + h * 0.4, z: p.z, sx: 1.2 + rand() * 0.6, sy: h * 0.6, sz: 1.2 + rand() * 0.6, c: [0x3d6b33, 0x4b7a3a, 0x355e2e][Math.floor(rand() * 3)] });
    }
  };
  for (const r of RAMPS) strip(r.sDiv, r.uSep + 12, RAMP_LEN - 20, rampEdges);
  for (const e of ENTRIES) strip(e.s0, 20, e.uJoin - 12, entryEdges);
  for (const a of SAS) { strip(a.sDiv, a.uSep + 12, SA_LOT0 - 5, saExitEdges); strip(a.sLot1, 5, a.uJoin - 12, saEntryEdges); }
  instanced(ctx, SHARED.ico, RS_MAT.shrub, list, { colors: true });
}
// ---- night: the road lamps and their light on the road, the reflectors on the guardrails ---------------------------
const RS_POLE = new THREE.CylinderGeometry(0.11, 0.16, 1, 7).translate(0, 0.5, 0), RS_REFL = new THREE.PlaneGeometry(0.12, 0.09);
RS_POLE.userData.keep = RS_REFL.userData.keep = true;
const _lc0 = new THREE.Color(0x7d8388), _lc1 = new THREE.Color(0xfff2d8);
RS_MAT.lampHead = new THREE.MeshBasicMaterial({ color: 0x7d8388 });
RS_MAT.reflector = nightPatch(new THREE.MeshBasicMaterial({ color: 0xffffff }), 9);
// a soft round pool of light, added onto the road (no light source)
RS_MAT.pool = (() => {
  const c = makeCanvas(128, 128), g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0xffe6bd, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12 });
})();
// lamps as instance lists in a group's frame; `P(u, v, y)` gives the frame's point for a place, yaw the heading there.
// Each lamp: { at: [x, y, z] (foot), arm: [x, y, z] (where the head hangs), h: pole height, r: pool radius }
function lampLists(lamps, out = { poles: [], arms: [], heads: [], pools: [] }) {
  for (const l of lamps) {
    const [x, y, z] = l.at, [ax, , az] = l.arm, len = Math.hypot(ax - x, az - z), ry = Math.atan2(ax - x, az - z) + Math.PI / 2;
    out.poles.push({ x, y, z, sy: l.h });
    if (len > 0.3) out.arms.push({ x: (x + ax) / 2, y: y + l.h - 0.1, z: (z + az) / 2, ry, sx: len, sy: 0.12, sz: 0.12 });
    out.heads.push({ x: ax, y: y + l.h - 0.35, z: az, ry, sx: 0.7, sy: 0.18, sz: 0.4 });
    if (l.r > 0) out.pools.push({ x: ax, y: l.groundY + 0.06, z: az, sx: l.r * 2, sy: 1, sz: l.r * 2 });
  }
  return out;
}
function addLampMeshes(add, lists) {
  add(RS_POLE, MAT.steel, lists.poles); add(SHARED.box, MAT.steel, lists.arms); add(SHARED.box, RS_MAT.lampHead, lists.heads); add(RS.mark, RS_MAT.pool, lists.pools);
}
function buildLamps(ctx) {
  const { O, s0, s1 } = ctx, low = qualityName === 'low', lamps = [];
  for (const l of lampsIn(s0, s1)) {
    const p = localPt(O, l.s, l.lat, 0), a = localPt(O, l.s, l.armLat, 0), main = l.kind === 'urban' || l.kind === 'tunnel';
    lamps.push({ at: [p.x, p.y, p.z], arm: [a.x, a.y, a.z], h: 12, r: low && main ? 0 : 14, groundY: a.y });
  }
  addLampMeshes((g, m, list) => { const im = instanced(ctx, g, m, list); if (im && m === RS_MAT.pool) im.userData.pools = true; }, lampLists(lamps));
}
// reflectors every 10 m: white on the left guardrail, amber on the median, facing the traffic coming up behind
function buildReflectors(ctx) {
  const { O, i0, i1 } = ctx, list = [];
  for (const [f, t] of railRuns(ctx, -1)) for (let i = f; i <= t; i++) { const s = i * DS; if (s % 10 >= DS) continue; const p = localPt(O, s, -12.3, 0.72); list.push({ x: p.x, y: p.y, z: p.z, ry: p.h + Math.PI, c: 0xffffff }); }
  for (const [f, t] of runs(i0, i1, i => !inTun(i))) for (let i = f; i <= t; i++) { const s = i * DS; if (s % 10 >= DS) continue; const p = localPt(O, s, -0.36, 0.76); list.push({ x: p.x, y: p.y, z: p.z, ry: p.h + Math.PI, c: 0xffb21c }); }
  const im = instanced(ctx, RS_REFL, RS_MAT.reflector, list, { colors: true });
  if (im) im.userData.reflectors = true;
}
function buildRoadside(ctx) { buildOverpasses(ctx); buildMarks(ctx); buildFences(ctx); buildShrubs(ctx); buildLamps(ctx); buildReflectors(ctx); }

// Every frame: the lamps and their pools by the time of day, the headlights for the reflectors and signs, the cars'
// lights. Nothing breaks the drive: an error hides the cars' lights for that frame and is reported once.
let _nightWarned = false;
function nightUpdate() {
  try {
    const night = TOD.night, dark = Math.max(night, GAME.tunnelBlend * 0.8);
    NIGHT_U.uLit.value = GAME.lampsOn ? clamp(dark * 1.5, 0, 1) : 0;
    const f = 5.6; NIGHT_U.uCar.value.set(TR.x + Math.sin(TR.h) * f, TR.y + 1, TR.z + Math.cos(TR.h) * f); NIGHT_U.uDir.value.set(Math.sin(TR.h), Math.cos(TR.h));
    RS_MAT.lampHead.color.copy(_lc0).lerp(_lc1, smooth(0.05, 0.6, night));
    RS_MAT.pool.opacity = night * 0.55; RS_MAT.pool.visible = night > 0.02;
    RS_MAT.reflector.color.setScalar(lerp(0.85, 0.1, night));
    carLightsUpdate(dark);
  } catch (e) {
    if (CAR_GLOW.pts) CAR_GLOW.pts.visible = CAR_GLOW.beams.visible = false;
    if (!_nightWarned) { _nightWarned = true; console.warn('night lights:', e && e.message); }
  }
}

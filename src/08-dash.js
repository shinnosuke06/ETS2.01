// ---------------------------------------------------------------------------
// Instrument cluster and navigation screen (canvas textures), live mirrors.
// ---------------------------------------------------------------------------
const DASH = {};
(function initDash() {
  const W = 1024, H = 380;
  DASH.cc = makeCanvas(W, H); DASH.cg = DASH.cc.getContext('2d');
  DASH.bg = makeCanvas(W, H);
  DASH.tex = canvasTex(DASH.cc, { aniso: 8 });
  DASH.nc = makeCanvas(512, 320); DASH.ng = DASH.nc.getContext('2d');
  DASH.ntex = canvasTex(DASH.nc, { aniso: 4 });
  DASH.A0 = 0.75 * Math.PI; DASH.SW = 1.5 * Math.PI;
  DASH.L = { x: 200, y: 196, r: 168 }; DASH.R = { x: 824, y: 196, r: 168 };
  drawClusterBG();
})();

function drawDial(g, d, max, minor, major, labelEvery, label, unit, zones) {
  const { x, y, r } = d;
  const grd = g.createRadialGradient(x, y, r * 0.2, x, y, r + 6);
  grd.addColorStop(0, '#0d1013'); grd.addColorStop(1, '#050607');
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r + 6, 0, TAU); g.fill();
  g.strokeStyle = '#2b3036'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r + 4, 0, TAU); g.stroke();
  for (const z of zones) {
    g.strokeStyle = z.c; g.lineWidth = 10; g.beginPath();
    g.arc(x, y, r - 8, DASH.A0 + z.a / max * DASH.SW, DASH.A0 + z.b / max * DASH.SW); g.stroke();
  }
  for (let v = 0; v <= max + 0.001; v += minor) {
    const a = DASH.A0 + v / max * DASH.SW, isMaj = Math.abs(v / major - Math.round(v / major)) < 1e-6;
    const r0 = r - (isMaj ? 30 : 18), r1 = r - 4;
    g.strokeStyle = isMaj ? '#e9edf0' : '#7d868e'; g.lineWidth = isMaj ? 4 : 2;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0); g.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1); g.stroke();
  }
  g.fillStyle = '#e9edf0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = font(30);
  for (let v = 0; v <= max + 0.001; v += labelEvery) {
    const a = DASH.A0 + v / max * DASH.SW;
    g.fillText(label(v), x + Math.cos(a) * (r - 54), y + Math.sin(a) * (r - 54));
  }
  g.fillStyle = '#8a949c'; g.font = font(20, 400); g.fillText(unit, x, y + r * 0.42);
}
function drawClusterBG() {
  const g = DASH.bg.getContext('2d'), W = DASH.bg.width, H = DASH.bg.height;
  g.fillStyle = '#030405'; g.fillRect(0, 0, W, H);
  drawDial(g, DASH.L, 125, 5, 10, 20, v => String(v), 'km/h', [{ a: 85, b: 90, c: 'rgba(255,170,30,.55)' }]);
  drawDial(g, DASH.R, 30, 1, 5, 5, v => String(v), '×100 r/min', [{ a: 10, b: 15, c: 'rgba(60,200,110,.8)' }, { a: 23, b: 30, c: 'rgba(230,50,40,.85)' }]);
  // centre display frame
  g.fillStyle = '#0a1016'; roundRect(g, 398, 34, 228, 312, 16); g.fill();
  g.strokeStyle = '#1f2830'; g.lineWidth = 3; roundRect(g, 398, 34, 228, 312, 16); g.stroke();
}
function arrow(g, x, y, dir, on) {
  g.fillStyle = on ? '#35e07a' : '#16251c';
  g.beginPath(); g.moveTo(x + dir * 22, y); g.lineTo(x - dir * 4, y - 16); g.lineTo(x - dir * 4, y - 7); g.lineTo(x - dir * 20, y - 7); g.lineTo(x - dir * 20, y + 7); g.lineTo(x - dir * 4, y + 7); g.lineTo(x - dir * 4, y + 16); g.closePath(); g.fill();
}
function needle(g, d, frac, color) {
  const a = DASH.A0 + clamp(frac, 0, 1.02) * DASH.SW;
  g.save(); g.translate(d.x, d.y); g.rotate(a);
  g.shadowColor = color; g.shadowBlur = 10;
  g.fillStyle = color; g.beginPath(); g.moveTo(-20, -5); g.lineTo(d.r - 16, -2); g.lineTo(d.r - 16, 2); g.lineTo(-20, 5); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#20262c'; g.beginPath(); g.arc(d.x, d.y, 18, 0, TAU); g.fill();
}
function drawCluster(st) {
  const g = DASH.cg;
  g.drawImage(DASH.bg, 0, 0);
  needle(g, DASH.L, st.kmh / 125, '#ff5a1f');
  needle(g, DASH.R, st.rpm / 3000, '#ff5a1f');
  // tell-tales
  const blinkOn = st.blinkPhase;
  arrow(g, 330, 40, -1, blinkOn && (st.blink < 0 || st.hazard));
  arrow(g, 694, 40, 1, blinkOn && (st.blink > 0 || st.hazard));
  g.font = font(22); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = st.lights ? '#35e07a' : '#14211a'; g.fillText('◐', 290, 340);
  g.fillStyle = st.retarder > 0.05 ? '#ffb020' : '#2a2210'; g.fillText('R', 330, 340);
  g.fillStyle = st.parked ? '#ff3b2f' : '#2a1210'; g.fillText('P', 694, 340);
  g.fillStyle = st.cruise ? '#35e07a' : '#14211a'; g.fillText('CC', 736, 340);
  // centre LCD
  g.textAlign = 'left'; g.fillStyle = '#cfe0ee'; g.font = font(24);
  g.fillText(st.clock, 418, 64);
  g.textAlign = 'right'; g.fillText(st.temp + '℃', 606, 64);
  g.textAlign = 'center';
  g.fillStyle = '#ffffff'; g.font = `700 104px ${JP_FONT}`;
  g.fillText(st.gearTxt, 512, 150);
  // what is on the fifth wheel: the gross weight when a trailer is coupled
  g.font = font(19);
  if (st.link === 'coupled') {
    g.fillStyle = '#cfe0ee'; g.fillText(st.gcwText, 524, 200);
    const x0 = 524 - g.measureText(st.gcwText).width / 2 - 34;      // a small trailer pictogram
    g.fillRect(x0, 192, 24, 12); g.fillRect(x0 + 3, 206, 5, 5); g.fillRect(x0 + 14, 206, 5, 5);
  } else {
    g.fillStyle = '#ffb020';
    g.fillText(st.link === 'locking' ? '連結中…' : st.link === 'unlocking' ? '切り離し中…' : 'トレーラーなし', 512, 200);
  }
  g.fillStyle = '#ffffff'; g.font = font(36); g.fillText(Math.round(st.kmh) + ' km/h', 512, 238);
  g.font = font(20);
  if (st.cruise) { g.fillStyle = '#35e07a'; g.fillText('クルーズ ' + Math.round(st.cruiseKmh), 512, 271); }
  else if (st.retarder > 0.05) { g.fillStyle = '#ffb020'; g.fillText('リターダー ' + Math.max(1, Math.round(st.retarder * 5)), 512, 271); }
  else { g.fillStyle = '#6f7f8c'; g.fillText(st.dir === -1 ? '後退' : 'リミッター 90', 512, 271); }
  // stability assists: steady = switched off, flashing = acting now
  g.font = font(17);
  [['ABS', st.lamps.abs, 450], ['ESC', st.lamps.esc, 512], ['TCS', st.lamps.tcs, 574]].forEach(([name, state, x]) => {
    g.fillStyle = state === 'on' || (state === 'flash' && st.flashOn) ? '#ffb020' : '#26323b';
    g.fillText(name, x, 298);
  });
  // fuel bar
  g.fillStyle = '#1d262e'; g.fillRect(430, 314, 164, 10);
  g.fillStyle = st.fuel < 0.15 ? '#ff5a1f' : '#e8eef2'; g.fillRect(430, 314, 164 * st.fuel, 10);
  g.fillStyle = '#9fb3c4'; g.font = font(15, 400); g.textAlign = 'left'; g.fillText(`燃料　残り 約 ${st.fuelKm} km`, 430, 336); g.textAlign = 'right'; g.fillText(Math.round(st.odo).toLocaleString('ja-JP') + ' km', 594, 336);
  // sleepiness bar
  g.fillStyle = '#1d262e'; g.fillRect(430, 346, 164, 8);
  g.fillStyle = st.sleepy > 0.85 ? '#ff5a1f' : st.sleepy > 0.7 ? '#ffb020' : '#7fa7c9'; g.fillRect(430, 346, 164 * st.sleepy, 8);
  g.fillStyle = '#9fb3c4'; g.textAlign = 'left'; g.fillText('眠気', 430, 368);
  if (st.damage > 1) { g.fillStyle = st.damage > 25 ? '#ff5a1f' : '#ffb020'; g.textAlign = 'center'; g.font = font(18); g.fillText('損傷 ' + Math.round(st.damage) + '%', 512, 96); }
  DASH.tex.needsUpdate = true;
}

const _np = {};
// The guidance arrow's turn for each kind (radians, 0 = straight up), and the lane arrows as characters.
const NAV_ARROW = { left: -Math.PI / 2, right: Math.PI / 2, gateLeft: -Math.PI / 2, gateRight: Math.PI / 2, outLeft: -Math.PI / 2, outRight: Math.PI / 2,
  merge: Math.PI / 4, exit: -Math.PI / 4, exitLane: -Math.PI / 6, dock: Math.PI };
const NAV_GLYPH = { left: '←', straight: '↑', right: '→' };
function drawNav(st) {
  const g = DASH.ng, W = 512, H = 320;
  g.fillStyle = '#121b24'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(120,150,180,.07)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  const scale = st.inTown ? 0.35 : 0.085, cx = W / 2, cy = 250;   // closer in a town
  const h = st.heading, sh = Math.sin(h), ch = Math.cos(h);
  const toScr = (x, z) => { const dx = x - st.x, dz = z - st.z; const f = dx * sh + dz * ch, r = dx * -ch + dz * sh; return [cx + r * scale, cy - f * scale]; };
  // road
  const path = [];
  for (let s = st.s - 800; s < st.s + 2800; s += 20) { if (s < 0 || s > ROUTE_LEN) continue; posAt(s, -6, _np); path.push(toScr(_np.x, _np.z)); }
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = '#3c4955'; g.lineWidth = 14; g.beginPath(); path.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  g.strokeStyle = '#7f8e9b'; g.lineWidth = 9; g.stroke();
  // route ahead to the destination exit
  if (st.destS) {
    const pts = [];
    for (let s = st.s; s < Math.min(st.destS, st.s + 2800); s += 20) { posAt(s, -6, _np); pts.push(toScr(_np.x, _np.z)); }
    if (pts.length > 1) { g.strokeStyle = '#2f9cff'; g.lineWidth = 6; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); }
  }
  // tunnels
  for (const t of TUNNELS) {
    if (t.s1 < st.s - 800 || t.s0 > st.s + 2800) continue;
    const pts = [];
    for (let s = Math.max(t.s0, st.s - 800); s < Math.min(t.s1, st.s + 2800); s += 20) { posAt(s, -6, _np); pts.push(toScr(_np.x, _np.z)); }
    if (pts.length > 1) { g.strokeStyle = 'rgba(10,14,18,.85)'; g.lineWidth = 9; g.setLineDash([6, 6]); g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.setLineDash([]); }
  }
  // interchanges
  g.font = font(15); g.textBaseline = 'middle';
  for (const r of RAMPS) {
    if (r.ic.s < st.s - 600 || r.ic.s > st.s + 2800) continue;
    posAt(r.sDiv + 520, -30, _np); const p = toScr(_np.x, _np.z);
    posAt(r.sDiv + 200, -10, _np); const q = toScr(_np.x, _np.z);
    g.strokeStyle = '#7f8e9b'; g.lineWidth = 5; g.beginPath(); g.moveTo(q[0], q[1]); g.lineTo(p[0], p[1]); g.stroke();
    const isDest = st.destIc === r.ic.i;
    g.fillStyle = isDest ? '#2f9cff' : '#0b6b42'; const tw = g.measureText(r.ic.jp + ' IC').width + 14;
    roundRect(g, p[0] - tw - 6, p[1] - 12, tw, 24, 5); g.fill();
    g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(r.ic.jp + ' IC', p[0] - tw + 1, p[1] + 1);
  }
  // the nearest town: its streets' centre lines, and the destination warehouse's gate
  const TL = st.town >= 0 && TOWNS_LOADED.get(st.town);
  if (TL) {
    const L = TL.layout, site = L.site, q = {};
    g.strokeStyle = '#7f8e9b';
    for (const S of L.streets) {
      const a = S.axis === 'v' ? [S.c, S.a0] : [S.a0, S.c], b = S.axis === 'v' ? [S.c, S.a1] : [S.a1, S.c];
      townXZ(site, a[0], a[1], q); const p0 = toScr(q.x, q.z); townXZ(site, b[0], b[1], q); const p1 = toScr(q.x, q.z);
      g.lineWidth = S.kind === 'main' ? 7 : 5; g.beginPath(); g.moveTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.stroke();
    }
    townXZ(site, 0, 0, q); const pz = toScr(q.x, q.z); townXZ(site, 0, 45, q); const pg = toScr(q.x, q.z);   // the plaza to Main A
    g.lineWidth = 7; g.beginPath(); g.moveTo(pz[0], pz[1]); g.lineTo(pg[0], pg[1]); g.stroke();
  }
  if (TL && st.routePts && st.routePts.length > 1) {   // the way ahead, in blue over the grey streets
    const site = TL.layout.site, q = {};
    g.strokeStyle = '#2f9cff'; g.lineWidth = 6; g.beginPath();
    st.routePts.forEach(([u, v], i) => { townXZ(site, u, v, q); const p = toScr(q.x, q.z); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.stroke();
  }
  if (st.destMarks) {   // the destination yard: docks in orange, the bay outlined in blue
    g.fillStyle = '#ff9a1a';
    for (const [x, z] of st.destMarks.docks) { const p = toScr(x, z); g.fillRect(p[0] - 4, p[1] - 4, 8, 8); }
    g.strokeStyle = '#2f9cff'; g.lineWidth = 2; g.beginPath();
    st.destMarks.bay.forEach(([x, z], i) => { const p = toScr(x, z); i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); });
    g.closePath(); g.stroke();
  }
  if (st.destWh && (TL || st.inTown)) {
    const p = toScr(st.destWh.x, st.destWh.z);
    g.fillStyle = '#2f9cff'; g.beginPath(); g.arc(p[0], p[1], 9, 0, TAU); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.stroke();
  }
  // the trailer waiting to be picked up
  if (st.trailer) {
    const p = toScr(st.trailer.x, st.trailer.z);
    g.fillStyle = '#ff9a1a'; g.fillRect(p[0] - 7, p[1] - 7, 14, 14);
    g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.strokeRect(p[0] - 7, p[1] - 7, 14, 14);
    g.font = font(15); g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillStyle = '#ffcf8a'; g.fillText('トレーラー', p[0] + 13, p[1]);
  }
  // own vehicle
  g.fillStyle = '#ffffff'; g.strokeStyle = '#2f9cff'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx, cy - 16); g.lineTo(cx + 11, cy + 12); g.lineTo(cx, cy + 6); g.lineTo(cx - 11, cy + 12); g.closePath(); g.fill(); g.stroke();
  // header
  g.fillStyle = 'rgba(8,12,16,.92)'; g.fillRect(0, 0, W, 54);
  let gx = 16;
  const arrow = a => {   // a block arrow at the band's left, turned by a (up: straight ahead)
    g.save(); g.translate(30, 27); g.rotate(a); g.fillStyle = '#2f9cff';
    g.beginPath(); g.moveTo(0, -17); g.lineTo(12, 3); g.lineTo(4, 3); g.lineTo(4, 16); g.lineTo(-4, 16); g.lineTo(-4, 3); g.lineTo(-12, 3); g.closePath(); g.fill(); g.restore();
    gx = 58;
  };
  if (st.maneuver) {
    if (st.maneuver.kind === 'arrive') { g.fillStyle = '#2f9cff'; g.beginPath(); g.arc(30, 27, 13, 0, TAU); g.fill(); gx = 58; }
    else arrow(NAV_ARROW[st.maneuver.kind] || 0);
  } else if (st.target && st.inTown) {   // no route: which way the target lies, seen from the truck
    const p = toScr(st.target.x, st.target.z); arrow(Math.atan2(p[0] - cx, cy - p[1]));
  }
  if (st.maneuver && st.maneuver.lanes) {   // the lanes, lit where to drive
    st.maneuver.lanes.forEach((l, i) => {
      const x = 16 + i * 34; g.fillStyle = l.use ? '#2f9cff' : 'rgba(40,52,64,.95)'; roundRect(g, x, 60, 30, 30, 4); g.fill();
      g.fillStyle = l.use ? '#ffffff' : '#7f8e9b'; g.font = font(15); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(l.arrows.map(a => NAV_GLYPH[a]).join(''), x + 15, 76);
    });
  }
  g.textAlign = 'left'; g.fillStyle = '#fff'; g.font = font(22);
  g.fillText(st.guide, gx, 28);
  g.textAlign = 'right'; g.fillStyle = '#9fd0ff'; g.font = font(26); g.fillText(st.guideDist, W - 16, 28);
  // footer
  g.fillStyle = 'rgba(8,12,16,.92)'; g.fillRect(0, H - 40, W, 40);
  g.textAlign = 'left'; g.fillStyle = '#cfe0ee'; g.font = font(18, 400);
  g.fillText(st.footer, 16, H - 20);
  // speed limit badge
  g.fillStyle = '#fff'; g.beginPath(); g.arc(W - 36, 86, 24, 0, TAU); g.fill();
  g.strokeStyle = '#d0201a'; g.lineWidth = 6; g.beginPath(); g.arc(W - 36, 86, 21, 0, TAU); g.stroke();
  g.fillStyle = '#1f3f9a'; g.textAlign = 'center'; g.font = font(20); g.fillText(String(st.limit), W - 36, 87);
  DASH.ntex.needsUpdate = true;
}

// ---- live mirrors -------------------------------------------------------------
const MIRROR = { cams: {}, rts: {}, frame: 0 };
// Can be called again for a rebuilt tractor: the render targets are kept, the cameras move to the new cab.
function setupMirrors(T) {
  for (const k of ['L', 'R']) {
    const [w, h] = Q.mirror;
    const rt = MIRROR.rts[k] || new THREE.WebGLRenderTarget(w, h, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    MIRROR.rts[k] = rt;
    const old = MIRROR.cams[k]; if (old && old.parent) old.parent.remove(old);
    const cam = new THREE.PerspectiveCamera(30, w / h, 0.5, 700);
    cam.rotation.order = 'YXZ';
    const m = T.mirrors[k];
    cam.position.copy(m.anchor.position).add(new THREE.Vector3(m.side * 0.05, 0, 0.12));
    cam.rotation.set(-0.045, Math.PI + m.side * 0.05, 0); // look back, slightly outward and down
    T.cab.add(cam);
    MIRROR.cams[k] = cam;
    m.mat.map = rt.texture; m.mat.color.set(0xffffff); m.mat.needsUpdate = true;
  }
}
function resizeMirrors() {
  for (const k of ['L', 'R']) { const [w, h] = Q.mirror; MIRROR.rts[k].setSize(w, h); MIRROR.cams[k].aspect = w / h; MIRROR.cams[k].updateProjectionMatrix(); }
}
function renderMirrors(force) {
  MIRROR.frame++;
  if (!force && MIRROR.frame % Q.mirrorEvery) return;
  const k = (MIRROR.frame / Q.mirrorEvery) % 2 < 1 ? 'L' : 'R';
  const keys = force ? ['L', 'R'] : [k];
  const fogFar = scene.fog.far;
  scene.fog.far = Math.min(fogFar, 700);
  for (const key of keys) {
    renderer.setRenderTarget(MIRROR.rts[key]);
    renderer.render(scene, MIRROR.cams[key]);
  }
  renderer.setRenderTarget(null);
  scene.fog.far = fogFar;
}

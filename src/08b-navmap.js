// ---------------------------------------------------------------------------
// The navigation card (top right, in every view) and the full map (opened with
// the 地図 button or M; the game stops while it is open).
// ---------------------------------------------------------------------------
let _ncKey = '';
// Show or hide the card for navState() st; the DOM is touched only when what it shows changes.
function navCardUpdate(st) {
  const el = $('navCard'), m = st && st.maneuver, show = !!(st && (st.card && m || st.reroute));
  const key = show ? [m && m.kind, m && m.text, st.guideDist, m && m.lanes && m.lanes.map(l => l.use + l.arrows.join()).join('|'), m && m.then && m.then.text, st.reroute, m && m.angle != null ? Math.round(m.angle * 12) : ''].join('/') : '';
  if (key === _ncKey) return;
  _ncKey = key; el.hidden = !show;
  if (!show) return;
  const arrive = m && (m.kind === 'arrive' || m.kind === 'stopFuel' || m.kind === 'stopNap');   // a dot: you are there
  $('ncDot').toggleAttribute('hidden', !arrive); $('ncArrow').toggleAttribute('hidden', arrive || !m);
  if (m && !arrive) $('ncArrow').setAttribute('transform', `rotate(${(m.angle != null ? m.angle : NAV_ARROW[m.kind] || 0) * 180 / Math.PI})`);
  $('ncText').textContent = m ? m.text : '';
  $('ncDist').textContent = m ? st.guideDist : '';
  $('ncLanes').innerHTML = m && m.lanes ? m.lanes.map(l => `<span class="${l.use ? 'on' : ''}">${l.arrows.map(a => NAV_GLYPH[a]).join('')}</span>`).join('') : '';
  $('ncThen').textContent = m && m.then ? 'その先 ' + m.then.text : '';
  $('ncMsg').textContent = st.reroute ? 'ルートを探し直しました' : '';
}

function mapOpen() {
  if (GAME.state !== 'drive' || !GAME.job) return;
  GAME.prevState = GAME.state; GAME.state = 'map';
  setHorn(false); showHud(false);
  $('mapOv').hidden = false;
  const cv = $('mapCanvas'), portrait = innerHeight > innerWidth;
  cv.width = portrait ? 720 : 960; cv.height = portrait ? 960 : 720;
  drawMap(cv, navState());
}
function mapClose() {
  if (GAME.state !== 'map') return;
  $('mapOv').hidden = true; GAME.state = GAME.prevState; showHud(GAME.state === 'drive');
}

// The whole expressway as one line with its 13 interchanges on top, the town the rig is in (on the expressway, the
// destination's) below, with the route and the rig.
function drawMap(cv, st) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height, j = GAME.job, top = Math.round(H * 0.24);
  g.fillStyle = '#121b24'; g.fillRect(0, 0, W, H);
  // the expressway
  const m = 40, X = s => m + (s / ROUTE_END) * (W - 2 * m), y0 = Math.round(top * 0.55);
  g.strokeStyle = '#7f8e9b'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(X(0), y0); g.lineTo(X(ROUTE_END), y0); g.stroke();
  g.strokeStyle = '#2f9cff'; g.lineWidth = 6; g.beginPath(); g.moveTo(X(ICS[j.from].s), y0); g.lineTo(X(ICS[j.to].s), y0); g.stroke();
  g.font = font(W < 800 ? 13 : 15); g.textAlign = 'center';
  ICS.forEach((ic, k) => {
    const x = X(ic.s), col = k === j.from ? '#3fbf6f' : k === j.to ? '#2f9cff' : '#cfe0ee';
    g.fillStyle = col; g.beginPath(); g.arc(x, y0, k === j.from || k === j.to ? 7 : 4, 0, TAU); g.fill();
    g.textBaseline = k % 2 ? 'top' : 'bottom'; g.fillText(ic.jp, x, k % 2 ? y0 + 10 : y0 - 10);
  });
  // the six service areas: a small green mark with the fuel sign, the name under the line
  g.font = font(W < 800 ? 11 : 12); g.textBaseline = 'top';
  for (const a of SAS) {
    const x = X(a.sDiv + 330);
    g.fillStyle = '#0b6b42'; roundRect(g, x - 7, y0 - 7, 14, 14, 3); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x - 3, y0 - 4, 4, 8); g.fillRect(x + 1, y0 - 3, 2, 1.5);
    g.fillStyle = '#7fd6a2'; g.fillText(a.jp, x, y0 + 30);
  }
  g.font = font(W < 800 ? 13 : 15);
  const sNow = TR.zone === 'town' && TR.town >= 0 ? ICS[TR.town].s : TR.s;
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(X(sNow), y0 - 12); g.lineTo(X(sNow) + 7, y0 - 24); g.lineTo(X(sNow) - 7, y0 - 24); g.closePath(); g.fill();
  if (TR.zone === 'sa' && SA_LOADED.has(TR.sa)) { drawSaMap(g, W, H, top + 10, m, st); return; }
  // the town
  const ti = TR.zone === 'town' && TR.town >= 0 ? TR.town : j.to, L = jobLayout(ti), y1 = top + 10;
  const sc = Math.min((W - 2 * m) / 620, (H - y1 - 50) / 430), ox = W / 2, oy = H - 34;
  const P = (u, v) => [ox + u * sc, oy - (v + 10) * sc];
  g.fillStyle = '#cfe0ee'; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = font(15);
  g.fillText(`${ICS[ti].jp}の町`, m, y1);
  g.fillStyle = '#26323b';
  for (const w of L.warehouses) { const a = P(w.yard.u0, w.yard.v1); g.fillRect(a[0], a[1], (w.yard.u1 - w.yard.u0) * sc, (w.yard.v1 - w.yard.v0) * sc); }
  { const a = P(-50, 45); g.fillRect(a[0], a[1], 100 * sc, 55 * sc); }   // the plaza
  g.strokeStyle = '#7f8e9b'; g.lineCap = 'butt';
  for (const S of L.streets) {
    const a = S.axis === 'v' ? P(S.c, S.a0) : P(S.a0, S.c), b = S.axis === 'v' ? P(S.c, S.a1) : P(S.a1, S.c);
    g.lineWidth = Math.max(3, (S.kind === 'main' ? 20 : 14) * sc); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
  }
  const dot = (u, v, col, r = 7) => { const p = P(u, v); g.fillStyle = col; g.beginPath(); g.arc(p[0], p[1], r, 0, TAU); g.fill(); };
  if (ti === j.from) dot(j.whA.gate.u, j.whA.gate.v, '#3fbf6f');
  if (ti === j.to) dot(j.whB.gate.u, j.whB.gate.v, '#2f9cff');
  // the way: the rig's route in the town it is in; from the expressway, the destination town's way from the plaza
  const pts = TR.zone === 'town' && TR.town === ti ? st.routePts : ti === j.to ? (() => { const r = navRoute(L, { plaza: true, start: true }, { gate: j.whB }); return r && navRoutePoly(L, r, null); })() : null;
  if (pts && pts.length > 1) {
    g.strokeStyle = '#2f9cff'; g.lineWidth = Math.max(4, 8 * sc); g.lineCap = 'round'; g.beginPath();
    pts.forEach(([u, v], k) => { const p = P(u, v); k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]); }); g.stroke();
  }
  if (TR.zone === 'town' && TR.town === ti) {   // the rig, pointing the way it faces (town angle; v is drawn upward)
    const p = P(TR.tu, TR.tv), a = wrapA(TR.h - L.site.hu);
    g.save(); g.translate(p[0], p[1]); g.rotate(-a + Math.PI / 2); g.fillStyle = '#ffffff'; g.strokeStyle = '#2f9cff'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
  }
  g.fillStyle = '#9fb3c4'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.font = font(13, 400);
  g.fillText('地図ボタン・M で閉じる', W - m, H - 8);
}

// The service area the rig is in, below the expressway: u to the right, v (away from the road) upward.
function drawSaMap(g, W, H, y1, m, st) {
  const k = TR.sa, L = SA_LOADED.get(k).layout, a = L.sa;
  const sc = Math.min((W - 2 * m) / 370, (H - y1 - 70) / 100), ox = W / 2 - 320 * sc, oy = H - 40;
  const P = (u, v) => [ox + u * sc, oy - (v - 10) * sc];
  g.fillStyle = '#cfe0ee'; g.textAlign = 'left'; g.textBaseline = 'top'; g.font = font(15); g.fillText(`${a.jp} SA`, m, y1);
  const box = (u0, u1, v0, v1, col) => { const p = P(u0, v1); g.fillStyle = col; g.fillRect(p[0], p[1], (u1 - u0) * sc, (v1 - v0) * sc); };
  for (const [u0, u1, v0, v1] of L.paved) box(u0, u1, v0, v1, '#3c4955');
  box(420, 460, 18, 27, '#3c4955');
  g.strokeStyle = '#3c4955'; g.lineWidth = Math.max(3, 5 * sc); g.beginPath();   // the lanes in and out
  for (let u = 140; u <= 180; u += 5) { const p = P(u, -saExitEdges(u).cx); u === 140 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
  g.stroke(); g.beginPath();
  for (let u = 460; u <= 500; u += 5) { const p = P(u, -saEntryEdges(u - 460).cx); u === 460 ? g.moveTo(p[0], p[1]) : g.lineTo(p[0], p[1]); }
  g.stroke();
  if (L.building) box(L.building.u0, L.building.u1, L.building.v0, L.building.v1, '#6f7b82');
  const slot = (s, fill, stroke) => {
    const nu = -s.hv * s.w / 2, nv = s.hu * s.w / 2, h = s.len / 2, c = [[-h, -1], [h, -1], [h, 1], [-h, 1]].map(([t, q]) => P(s.u + s.hu * t + nu * q, s.v + s.hv * t + nv * q));
    g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); }
  };
  const t = st.saTarget && st.saTarget.sa === k ? st.saTarget : null;
  for (const s of L.stalls) slot(s, s.taken ? '#5c6670' : null, t && t.kind === 'toStall' && t.id === s.id ? '#2f9cff' : '#cfe0ee');
  for (const p of L.pumps) slot(p, null, t && t.kind === 'toPump' && t.id === p.id ? '#2f9cff' : '#ffb020');
  const r = P(TR.s - a.sDiv, -TR.lat), ang = TR.h - headingAt(TR.s);
  g.save(); g.translate(r[0], r[1]); g.rotate(-ang + Math.PI / 2); g.fillStyle = '#ffffff'; g.strokeStyle = '#2f9cff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 5); g.lineTo(-8, 9); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.fillStyle = '#9fb3c4'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.font = font(13, 400);
  g.fillText('地図ボタン・M で閉じる', W - m, H - 8);
}

// ---------------------------------------------------------------------------
// The navigation card (top right, in every view) and the full map (opened with
// the 地図 button or M; the game stops while it is open).
// ---------------------------------------------------------------------------
let _ncKey = '';
// Show or hide the card for navState() st; the DOM is touched only when what it shows changes.
function navCardUpdate(st) {
  const el = $('navCard'), m = st && st.maneuver, show = !!(st && (st.card && m || st.reroute));
  const key = show ? [m && m.kind, m && m.text, st.guideDist, m && m.lanes && m.lanes.map(l => l.use + l.arrows.join()).join('|'), m && m.then && m.then.text, st.reroute].join('/') : '';
  if (key === _ncKey) return;
  _ncKey = key; el.hidden = !show;
  if (!show) return;
  const arrive = m && m.kind === 'arrive';
  $('ncDot').toggleAttribute('hidden', !arrive); $('ncArrow').toggleAttribute('hidden', arrive || !m);
  if (m && !arrive) $('ncArrow').setAttribute('transform', `rotate(${(NAV_ARROW[m.kind] || 0) * 180 / Math.PI})`);
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
  const sNow = TR.zone === 'town' && TR.town >= 0 ? ICS[TR.town].s : TR.s;
  g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(X(sNow), y0 - 12); g.lineTo(X(sNow) + 7, y0 - 24); g.lineTo(X(sNow) - 7, y0 - 24); g.closePath(); g.fill();
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

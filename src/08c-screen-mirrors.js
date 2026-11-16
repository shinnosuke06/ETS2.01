// ---------------------------------------------------------------------------
// Mirrors on the screen: the two side mirrors as slim panels at the screen's
// left and right edges and a back monitor (at the top in portrait, at the
// bottom in the middle in landscape). Each view (cab, chase, far) remembers whether
// they are shown: in the cab at first, outside not. The side pictures are the
// live mirrors' own (08-dash.js); the back monitor has a camera of its own at
// the rear of the trailer (of the tractor when no trailer is on). All are
// mirror images, drawn over the scene after it.
// ---------------------------------------------------------------------------
const SMIR = { on: null, scene: null, cam: null, panels: {}, backCam: null, backRt: null, lay: null, shown: false, layT: 0, parent: null };
const SMIR_ASPECT = { side: 0.57, back: 2.2 };   // panel width / height
function smirShownFor(cam) { if (!SMIR.on) SMIR.on = Object.assign({ cab: true, chase: false, far: false }, lsGet('nlh.mirrors', {}) || {}); return !!SMIR.on[cam]; }
function smirToggle() {
  smirShownFor(GAME.cam); SMIR.on[GAME.cam] = !SMIR.on[GAME.cam]; lsSet('nlh.mirrors', SMIR.on);
  led(SMIR.on[GAME.cam] ? 'ミラー 表示' : 'ミラー 非表示', false, 1.2);
  smirLayout(true);
}
function _smirMake() {
  SMIR.scene = new THREE.Scene(); SMIR.cam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  SMIR.backRt = new THREE.WebGLRenderTarget(320, 146, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
  const cam = new THREE.PerspectiveCamera(62, 320 / 146, 0.3, 250); cam.rotation.order = 'YXZ'; cam.rotation.set(-0.42, Math.PI, 0);   // back and down
  SMIR.backCam = cam;
  // a panel: a dark frame and the picture, mirrored left to right, cropped to the panel's shape
  const panel = (tex, crop) => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x0b0f12, depthTest: false, depthWrite: false, toneMapped: false }));
    const pg = new THREE.PlaneGeometry(1, 1), uv = pg.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, crop[1] - uv.getX(i) * (crop[1] - crop[0]), crop[2] + uv.getY(i) * (crop[3] - crop[2]));
    const pic = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false, toneMapped: false }));
    pic.renderOrder = 1; g.add(frame, pic); SMIR.scene.add(g);
    return { g, frame, pic };
  };
  SMIR.panels.L = panel(MIRROR.rts.L.texture, [0.1, 0.9, 0.08, 1]);
  SMIR.panels.R = panel(MIRROR.rts.R.texture, [0.1, 0.9, 0.08, 1]);
  SMIR.panels.B = panel(SMIR.backRt.texture, [0, 1, 0, 1]);
}
// The screen's safe-area insets (a notch, rounded corners), in CSS pixels.
let _smirProbe = null;
function _smirSafe() {
  if (!_smirProbe) { _smirProbe = document.createElement('div'); _smirProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)'; document.body.appendChild(_smirProbe); }
  const cs = getComputedStyle(_smirProbe), n = v => parseFloat(v) || 0;
  return { t: n(cs.paddingTop), r: n(cs.paddingRight), b: n(cs.paddingBottom), l: n(cs.paddingLeft) };
}
// Where the panels go (CSS pixels from the top left), and the HUD moved to make room. force: work it out now.
// Portrait: one row at the very top (mirror, back monitor, mirror), the HUD below it, the middle of the screen clear.
// Landscape: the side mirrors in the top corners (the sign, buttons and card move in), the back monitor at the bottom
// in the middle, under the instrument cluster (above the speed box outside the cab), between the touch controls.
function smirLayout(force) {
  const show = GAME.state === 'drive' && smirShownFor(GAME.cam);
  if (!force && show === SMIR.shown && SMIR.layT > 0) return;
  SMIR.layT = window.innerHeight > window.innerWidth ? 0.1 : 0.5; SMIR.shown = show;   // portrait follows the buttons' rows closely
  const hud = $('hud'), W = window.innerWidth, H = window.innerHeight, portrait = H > W;
  document.body.classList.toggle('mirrors', show && !portrait);
  document.body.classList.toggle('mirrors-top', show && portrait);
  $('led').style.top = ''; $('navCard').style.top = '';
  if (!show) { hud.style.removeProperty('--mir'); hud.style.removeProperty('--monTop'); SMIR.lay = null; return; }
  const safe = _smirSafe(), gap = 6;
  if (portrait) {
    hud.style.removeProperty('--mir');
    const y = Math.round(safe.t + 4), x0 = 4 + safe.l, x1 = W - 4 - safe.r;
    const w = Math.round(clamp(W * 0.13, 44, 90)), h = Math.round(w / SMIR_ASPECT.side);
    const bw = x1 - x0 - 2 * (w + gap), bh = h;
    SMIR.lay = { L: { x: x0, y, w, h }, R: { x: x1 - w, y, w, h }, B: { x: x0 + w + gap, y, w: bw, h: bh } };
    hud.style.setProperty('--monTop', (y + h + 6 - safe.t) + 'px');   // the HUD starts under the row
    // the card right under the buttons (their rows, or the toggle alone when put away), the board under the card
    const hudTop = hud.getBoundingClientRect().top + (parseFloat(getComputedStyle(hud).paddingTop) || 0);
    let below = 0;
    for (const id of ['jobSign', 'topbar']) {
      const el = $(id); if (!el || el.hidden) continue;
      for (const b of (id === 'topbar' ? [...el.children].filter(c => !c.hidden) : [el])) { const r = b.getBoundingClientRect(); if (r.width) below = Math.max(below, r.bottom - hudTop + 6); }
    }
    const card = $('navCard'), ch = card.hidden ? 0 : card.getBoundingClientRect().height;
    card.style.top = Math.round(below) + 'px'; $('led').style.top = Math.round(below + Math.max(84, ch + 6)) + 'px';
    return;
  }
  hud.style.removeProperty('--monTop');
  const sw = Math.round(clamp(Math.min(W, H * 1.6) * 0.085, 56, 120)), sh = Math.round(sw / SMIR_ASPECT.side);
  hud.style.setProperty('--mir', (sw + 8) + 'px');   // the sign, buttons and card move in by this
  const top = Math.max(8, parseFloat(getComputedStyle(hud).paddingTop) || 10);
  // the back monitor: bottom middle (under the instrument cluster in the cab), clear of the wheel, the pedals and
  // their buttons, of the speed box, and below the navigation card where that sits in the middle
  let left = 8 + safe.l, right = W - 8 - safe.r, bottom = H - 6 - Math.max(safe.b, 4), ceil = 0;
  const sp = $('speedo'); if (sp && !sp.hidden) { const r = sp.getBoundingClientRect(); if (r.height) bottom = Math.min(bottom, r.top - 6); }
  for (const el of document.querySelectorAll('#touch > *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    if (r.right < W / 2) left = Math.max(left, r.right + 8); else right = Math.min(right, r.left - 8);
  }
  const card = $('navCard'), cs = getComputedStyle(card), hudTop = hud.getBoundingClientRect().top + (parseFloat(getComputedStyle(hud).paddingTop) || 0);
  const cr = card.getBoundingClientRect(), cardMid = cr.width ? cr.left < W / 2 && cr.right > W / 2 : cs.left === '50%' || /translateX|matrix/.test(cs.transform);
  if (cardMid) ceil = hudTop + (parseFloat(cs.top) || 0) + 78;   // the card's bottom (room for its lanes)
  let bw = Math.round(Math.min(right - left, clamp(W * 0.3, 180, 380))), bh = Math.round(bw / SMIR_ASPECT.back);
  if (bottom - bh < ceil) { bh = Math.max(50, Math.round(bottom - ceil)); bw = Math.min(bw, Math.round(bh * 2.8)); }
  const bx = Math.round(clamp(W / 2 - bw / 2, left, right - bw));
  SMIR.lay = { L: { x: 4 + safe.l, y: top, w: sw, h: sh }, R: { x: W - 4 - safe.r - sw, y: top, w: sw, h: sh }, B: { x: bx, y: Math.round(bottom - bh), w: bw, h: bh } };
}
// The back monitor's camera and picture follow its panel's shape (no stretching).
function _smirBackShape(w, h) {
  const a = w / h; if (Math.abs(SMIR.backCam.aspect - a) < 0.01) return;
  SMIR.backCam.aspect = a; SMIR.backCam.fov = a > 2.6 ? 48 : 62; SMIR.backCam.updateProjectionMatrix();
  SMIR.backRt.setSize(Math.round(clamp(w * 1.2, 160, 512)), Math.round(clamp(h * 1.2, 60, 240)));
}
// After the scene: refresh the pictures in turn and draw the panels over it.
function smirRender(dt) {
  SMIR.layT -= dt;
  smirLayout(false);
  if (!SMIR.shown || !SMIR.lay || !MIRROR.rts.L) return;
  if (!SMIR.scene) _smirMake();
  // the back camera rides on the trailer's rear when one is on, else on the tractor's
  const coupled = TR.link === 'coupled' && TRL && TRL.root, parent = coupled ? TRL.root : TRK.root;
  if (SMIR.parent !== parent) { parent.add(SMIR.backCam); SMIR.parent = parent; }
  const sp = TRAILERS[TR.trailerKey];
  if (coupled) SMIR.backCam.position.set(0, 3.9, (sp ? sp.rear : 12) + 0.15); else SMIR.backCam.position.set(0, 2.9, RIGP.back + 0.2);
  // the side mirrors' pictures: the cab's own refresh does them in the cab view; outside, they are done here
  if (GAME.cam !== 'cab') renderMirrors(false);
  SMIR.frame = (SMIR.frame || 0) + 1;
  _smirBackShape(SMIR.lay.B.w, SMIR.lay.B.h);
  if (SMIR.frame % Math.max(2, Q.mirrorEvery) === 0) {   // every second frame at most, 250 m
    const fogFar = scene.fog.far; scene.fog.far = Math.min(fogFar, 250);
    renderer.setRenderTarget(SMIR.backRt); renderer.render(scene, SMIR.backCam); renderer.setRenderTarget(null);
    scene.fog.far = fogFar;
  }
  const W = window.innerWidth, H = window.innerHeight, C = SMIR.cam;
  if (C.right !== W || C.top !== H) { C.left = 0; C.right = W; C.top = H; C.bottom = 0; C.updateProjectionMatrix(); }
  for (const k of ['L', 'R', 'B']) {
    const p = SMIR.panels[k], r = SMIR.lay[k];
    p.g.position.set(r.x + r.w / 2, H - r.y - r.h / 2, 0);
    p.frame.scale.set(r.w + 6, r.h + 6, 1); p.pic.scale.set(r.w, r.h, 1);
  }
  const ac = renderer.autoClear; renderer.autoClear = false; renderer.clearDepth();
  renderer.render(SMIR.scene, C);
  renderer.autoClear = ac;
}

// ---- the next signal, repeated on the navigation card --------------------------------------------------------------
// In a town, on a street piece that ends at a junction with signals, within 120 m of it and not yet in it: the colour
// that junction shows this way; else null.
function nextSignal() {
  if (NAV.leg !== 'town' || !NAV.T || !NAV.T.match || !TOWNS_LOADED.has(TR.town)) return null;
  const L = TOWNS_LOADED.get(TR.town).layout, e = navGraph(L).edges[NAV.T.match.edge];
  const n = e && L.nodes[e.to];
  if (!n || !n.signal || e.to >= L.nodes.length) return null;
  const left = e.len - NAV.T.match.d, cr = L.streets[n.streets.find(id => id !== e.street)];
  if (left > 120 || left < (cr ? _hc(cr) : 9)) return null;
  return signalState(n, e.dir[0], GAME.clock / TIME_SCALE);
}
let _sigKey = '';
function sigRepUpdate() {
  const st = GAME.state === 'drive' ? nextSignal() : null, key = st || '';
  if (key === _sigKey) return;
  _sigKey = key;
  const el = $('ncSig'); el.hidden = !st; el.className = 'sigrep' + (st === 'green' ? ' g' : st === 'yellow' ? ' y' : st === 'red' ? ' r' : '');
}

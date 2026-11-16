// ---------------------------------------------------------------------------
// Mirrors on the screen: the two side mirrors as slim panels at the screen's
// left and right edges (the HUD moves in to make room) and a back monitor at
// the top, below the buttons. Each view (cab, chase, far) remembers whether
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
function smirLayout(force) {
  const show = GAME.state === 'drive' && smirShownFor(GAME.cam);
  if (!force && show === SMIR.shown && SMIR.layT > 0) return;
  SMIR.layT = 0.5; SMIR.shown = show;
  const hud = $('hud'), W = window.innerWidth, H = window.innerHeight;
  document.body.classList.toggle('mirrors', show);
  if (!show) { hud.style.removeProperty('--mir'); $('led').style.top = ''; $('navCard').style.top = ''; SMIR.lay = null; return; }
  const sw = Math.round(clamp(Math.min(W, H * 1.6) * 0.085, 56, 120)), sh = Math.round(sw / SMIR_ASPECT.side), gap = 8;
  const safe = _smirSafe();
  if (H > W) {   // portrait: one row right under the buttons (mirror, monitor, mirror); the board and the card move below it
    hud.style.removeProperty('--mir'); $('led').style.top = ''; $('navCard').style.top = '';
    const hudTop = hud.getBoundingClientRect().top + (parseFloat(getComputedStyle(hud).paddingTop) || 0);
    let y = Math.round(safe.t + 8);
    for (const id of ['jobSign', 'topbar']) {
      const el = $(id); if (!el || el.hidden) continue;
      for (const b of (id === 'topbar' ? [...el.children].filter(c => !c.hidden) : [el])) { const r = b.getBoundingClientRect(); if (r.width) y = Math.max(y, Math.round(r.bottom) + 6); }
    }
    // as tall as fits with the board and a card under it above the touch controls, 52 px at the least (always shown)
    let floor = H - 8 - safe.b;
    for (const el of document.querySelectorAll('#touch > *')) { const r = el.getBoundingClientRect(); if (r.width && r.height) floor = Math.min(floor, r.top - 8); }
    const h = Math.round(clamp(floor - y - 170, 52, sh)), w = Math.round(h * SMIR_ASPECT.side);
    const x0 = 4 + safe.l, x1 = W - 4 - safe.r, bw = x1 - x0 - 2 * (w + gap), bh = Math.min(h, Math.round(bw / SMIR_ASPECT.back));
    SMIR.lay = { L: { x: x0, y, w, h }, R: { x: x1 - w, y, w, h }, B: { x: x0 + w + gap, y, w: bw, h: bh } };
    const below = y + h + 8 - hudTop;
    $('led').style.top = below + 'px'; $('navCard').style.top = (below + 84) + 'px';   // room for a board of three lines
    return;
  }
  hud.style.setProperty('--mir', (sw + gap) + 'px');   // the HUD's side padding grows by this
  const top = Math.max(8, parseFloat(getComputedStyle(hud).paddingTop) || 10);
  // the back monitor: on the right, under the buttons (the middle of the screen stays clear: the junction's signals
  // hang there, ahead over the lanes)
  const bar = $('topbar'), btns = bar && !bar.hidden ? [...bar.children].filter(c => !c.hidden && c.getBoundingClientRect().width) : [];
  const barR = btns.length ? Math.max(...btns.map(b => b.getBoundingClientRect().right)) : W - 4 - sw - gap - 12;
  const bw = Math.round(clamp(W * 0.25, 160, 340)), bh = Math.round(bw / SMIR_ASPECT.back), bx = Math.round(barR - bw);
  let by = top;
  for (const b of btns) { const r = b.getBoundingClientRect(); if (r.right > bx - 4 && r.left < bx + bw + 4) by = Math.max(by, Math.round(r.bottom) + 6); }
  // on a low screen, smaller so it ends above the touch buttons under it (kept on the right)
  let floor = H - 8;
  for (const el of document.querySelectorAll('#touch button, #touch > *')) { const r = el.getBoundingClientRect(); if (r.width && r.height && r.right > bx && r.left < bx + bw && r.top > by) floor = Math.min(floor, r.top - 6); }
  const mh = Math.max(40, Math.min(bh, floor - by)), mw = Math.round(mh * SMIR_ASPECT.back);
  SMIR.lay = { L: { x: 4 + safe.l, y: top, w: sw, h: sh }, R: { x: W - 4 - safe.r - sw, y: top, w: sw, h: sh }, B: { x: bx + bw - mw, y: by, w: mw, h: mh } };
  // the navigation card goes below the monitor when it would be under it
  const hudTop = hud.getBoundingClientRect().top + (parseFloat(getComputedStyle(hud).paddingTop) || 0), below = by + bh + 8 - hudTop;
  const card = $('navCard'); card.style.top = ''; $('led').style.top = '';
  const cr = card.getBoundingClientRect(), cardL = cr.width ? cr.left : W - 300, cardR = cr.width ? cr.right : W;
  if ((parseFloat(getComputedStyle(card).top) || 0) < below && cardR > bx && cardL < bx + bw) card.style.top = below + 'px';
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

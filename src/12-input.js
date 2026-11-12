// ---------------------------------------------------------------------------
// Input: keyboard, touch wheel and pedals, mouse/touch look-around, gamepad.
// ---------------------------------------------------------------------------
const INP = {
  keys: new Set(), throttle: 0, brake: 0, steer: 0,
  kbThr: 0, kbBrk: 0, kbSteer: 0,
  tSteer: 0, tWheel: 0, tWheelHeld: false, tGas: 0, tBrake: 0,
  lookYaw: 0, lookPitch: -0.2, sens: lsGet('nlh.sens', 1.0),
  actions: [], usingTouch: IS_TOUCH,
};
const $ = id => document.getElementById(id);

window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'INPUT')) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.repeat) { INP.keys.add(e.code); return; }
  INP.keys.add(e.code);
  const map = { KeyQ: 'blinkL', KeyE: 'blinkR', KeyF: 'hazard', KeyC: 'cruise', KeyV: 'camera', KeyL: 'lights', KeyP: 'wiper', KeyR: 'dir', KeyT: 'couple', KeyM: 'map', KeyG: 'stop', Escape: 'menu', Equal: 'cruiseUp', NumpadAdd: 'cruiseUp', Minus: 'cruiseDown', NumpadSubtract: 'cruiseDown', Digit1: 'cam1', Digit2: 'cam2', Digit3: 'cam3', KeyH: 'hornOn' };
  if (map[e.code]) INP.actions.push(map[e.code]);
});
window.addEventListener('keyup', e => { INP.keys.delete(e.code); if (e.code === 'KeyH') INP.actions.push('hornOff'); });
window.addEventListener('blur', () => { INP.keys.clear(); INP.tGas = INP.tBrake = 0; INP.tWheelHeld = false; });

// look-around drag on the 3D view
(function lookDrag() {
  let id = null, lx = 0, ly = 0, lastTap = 0;
  canvasEl.addEventListener('pointerdown', e => {
    if (id !== null) return;
    id = e.pointerId; lx = e.clientX; ly = e.clientY;
    try { canvasEl.setPointerCapture(id); } catch (err) { /* ignore */ }
    if (e.pointerType === 'touch') { enableTouchUI(); const now = performance.now(); if (now - lastTap < 300) INP.actions.push('lookReset'); lastTap = now; }
  });
  canvasEl.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const k = e.pointerType === 'touch' ? 0.006 : 0.0045;
    INP.lookYaw = clamp(INP.lookYaw - (e.clientX - lx) * k, -2.2, 2.2);
    INP.lookPitch = clamp(INP.lookPitch - (e.clientY - ly) * k, -0.75, 0.45);
    lx = e.clientX; ly = e.clientY;
  });
  const up = e => { if (e.pointerId === id) id = null; };
  canvasEl.addEventListener('pointerup', up); canvasEl.addEventListener('pointercancel', up);
  canvasEl.addEventListener('dblclick', () => INP.actions.push('lookReset'));
  canvasEl.addEventListener('wheel', e => { INP.actions.push(e.deltaY > 0 ? 'zoomOut' : 'zoomIn'); }, { passive: true });
})();

// touch steering wheel
(function touchWheel() {
  const pad = $('wheelPad'), rot = $('wheelRot');
  let id = null, last = 0;
  const ang = e => { const r = pad.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  pad.addEventListener('pointerdown', e => { id = e.pointerId; last = ang(e); INP.tWheelHeld = true; try { pad.setPointerCapture(id); } catch (err) { /* */ } e.preventDefault(); });
  pad.addEventListener('pointermove', e => {
    if (e.pointerId !== id) return;
    const a = ang(e); let d = a - last; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; last = a;
    INP.tWheel = clamp(INP.tWheel + d, -2.6, 2.6);
  });
  const up = e => { if (e.pointerId === id) { id = null; INP.tWheelHeld = false; } };
  pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
  INP.drawWheel = () => { rot.setAttribute('transform', `rotate(${(INP.tWheel * 180 / Math.PI).toFixed(1)})`); };
})();
function pedal(el, key) {
  let id = null;
  const fill = el.querySelector('.fill');
  const set = e => { const r = el.getBoundingClientRect(); INP[key] = clamp(0.35 + 0.65 * (e.clientY - r.top) / r.height, 0.35, 1); fill.style.height = Math.round(INP[key] * 100) + '%'; };
  el.addEventListener('pointerdown', e => { id = e.pointerId; try { el.setPointerCapture(id); } catch (err) { /* */ } set(e); e.preventDefault(); });
  el.addEventListener('pointermove', e => { if (e.pointerId === id) set(e); });
  const up = e => { if (e.pointerId === id) { id = null; INP[key] = 0; fill.style.height = '0'; } };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
pedal($('pGas'), 'tGas'); pedal($('pBrake'), 'tBrake');

function holdButton(el, onDown, onUp) {
  el.addEventListener('pointerdown', e => { e.preventDefault(); onDown(); try { el.setPointerCapture(e.pointerId); } catch (err) { /* */ } });
  const up = () => onUp(); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
}
holdButton($('tHorn'), () => INP.actions.push('hornOn'), () => INP.actions.push('hornOff'));
$('tGear').addEventListener('click', () => INP.actions.push('dir'));
$('tBlinkL').addEventListener('click', () => INP.actions.push('blinkL'));
$('tBlinkR').addEventListener('click', () => INP.actions.push('blinkR'));
for (const [id, a] of [['bCam', 'camera'], ['bCruise', 'cruise'], ['bLights', 'lights'], ['bWiper', 'wiper'], ['bHazard', 'hazard'], ['bCouple', 'couple'], ['bMap', 'map'], ['bStop', 'stop'], ['mapClose', 'map'], ['bMenu', 'menu']]) $(id).addEventListener('click', () => INP.actions.push(a));

function enableTouchUI() {
  if (document.body.classList.contains('touch')) return;
  INP.usingTouch = true;
  document.body.classList.add('touch');
  if (GAME && GAME.state === 'drive') $('touch').hidden = false;
}

function pollInput(dt, vAbs) {
  const K = INP.keys;
  const up = K.has('KeyW') || K.has('ArrowUp'), dn = K.has('KeyS') || K.has('ArrowDown'), hard = K.has('Space');
  INP.kbThr = up ? Math.min(1, INP.kbThr + dt * 2.2) : Math.max(0, INP.kbThr - dt * 4);
  INP.kbBrk = hard ? 1 : dn ? Math.min(0.85, INP.kbBrk + dt * (INP.kbBrk < 0.35 ? 1.2 : 0.9)) : Math.max(0, INP.kbBrk - dt * 4);
  const left = K.has('KeyA') || K.has('ArrowLeft'), right = K.has('KeyD') || K.has('ArrowRight');
  const target = (right ? 1 : 0) - (left ? 1 : 0);
  const rate = 1.1 + 1.4 * (1 - clamp(vAbs / 25, 0, 1));
  if (target !== 0) INP.kbSteer = clamp(INP.kbSteer + target * rate * dt * (Math.sign(target) !== Math.sign(INP.kbSteer) ? 2 : 1), -1, 1);
  else INP.kbSteer = damp(INP.kbSteer, 0, 5, dt);
  if (!INP.tWheelHeld) INP.tWheel = damp(INP.tWheel, 0, 4, dt);
  INP.drawWheel();
  const tw = INP.tWheel / 2.6;
  INP.tSteer = Math.sign(tw) * Math.pow(Math.abs(tw), 1.35);

  let gpT = 0, gpB = 0, gpS = 0;
  try {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find(p => p && p.connected);
    if (gp) {
      const ax = gp.axes[0] || 0; gpS = Math.abs(ax) > 0.06 ? ax : 0;
      gpT = gp.buttons[7] ? gp.buttons[7].value : 0; gpB = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (gp.axes.length > 2 && gpT === 0 && gpB === 0) { const a2 = gp.axes[2] || 0; if (a2 < -0.1) gpT = -a2; } // some wheels
    }
  } catch (e) { /* gamepads unavailable */ }

  INP.throttle = Math.max(INP.kbThr, INP.tGas, gpT);
  INP.brake = Math.max(INP.kbBrk, INP.tBrake, gpB);
  let st = INP.kbSteer;
  if (INP.tWheelHeld || Math.abs(INP.tSteer) > Math.abs(st)) st = INP.tSteer;
  if (Math.abs(gpS) > Math.abs(st)) st = gpS;
  INP.steer = clamp(st * INP.sens, -1, 1);
}

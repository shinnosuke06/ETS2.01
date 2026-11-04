// ---------------------------------------------------------------------------
// Cab interior, modelled on the current Scania S-series cab (right-hand drive).
// Driver eye at (0.55, 2.62, -4.28). Flat floor, wrap-around two-tone dash,
// instrument screen under a hood, control panel angled toward the driver with
// the infotainment screen, centre console with cup holders, 3-spoke wheel,
// tall leather seats, bed with drawers, overhead and rear cabinets, red ambient
// LEDs at night, curtains and a 交通安全 omamori charm that swings.
// ---------------------------------------------------------------------------
const INTERIOR_THEMES = {
  black: { label: 'ブラック', upper: 0x3b3d41, lower: 0x1c1d1f, head: 0xcac7c0, cabinet: 0xd3d0c9, door: 0x2f3134, stitch: '#61656a', mattress: 0x34373d, drawer: 0x2c2e31, curtain: 0x1a1b1d, ambient: 0xff1e2c, quilt: false },
  beige: { label: 'ベージュ', upper: 0xd6cfbf, lower: 0x1e1f21, head: 0xe6e1d5, cabinet: 0xdfd8c9, door: 0xd2cbbb, stitch: '#4a4a4a', mattress: 0xd9cdb6, drawer: 0xd8d3c8, curtain: 0x2b2c2e, ambient: 0xffcf8a, quilt: false },
  red: { label: 'レッド', upper: 0x9b111b, lower: 0x141415, head: 0x8a0f18, cabinet: 0x930f19, door: 0x930f19, stitch: '#d0202c', mattress: 0x1a1a1b, drawer: 0x930f19, curtain: 0x121213, ambient: 0xff1e2c, quilt: true },
};
let interiorName = lsGet('nlh.interior', 'black');
if (!INTERIOR_THEMES[interiorName]) interiorName = 'black';

TEX.headW = (() => {
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 4000, 1, 200, 245, 0.2, 0.5, 211);
  const t = canvasTex(c, { repeat: true }); t.repeat.set(4, 4); return t;
})();
TEX.leather = (() => { const c = makeCanvas(256, 256); const t = canvasTex(c, { repeat: false }); t.userData = { c }; return t; })();
function drawLeather(stitch) {
  const c = TEX.leather.userData.c, g = c.getContext('2d'), W = 256;
  g.fillStyle = '#1b1b1c'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 5000, 1, 10, 50, 0.3, 0.6, 221);
  for (let y = 0; y < W; y += 32) { // stitched horizontal channels
    const grd = g.createLinearGradient(0, y, 0, y + 32);
    grd.addColorStop(0, 'rgba(255,255,255,.06)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = grd; g.fillRect(0, y, W, 32);
    g.fillStyle = '#0b0b0c'; g.fillRect(0, y + 30, W, 3);
    g.fillStyle = stitch; for (let x = 4; x < W; x += 9) { g.fillRect(x, y + 26, 5, 1.4); g.fillRect(x, y + 35, 5, 1.4); }
  }
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, 0, 18, W); g.fillRect(W - 18, 0, 18, W);
  TEX.leather.needsUpdate = true;
}
let _quilt = null;
function quiltTexture(hex) {
  const c = _quilt ? _quilt.userData.c : makeCanvas(256, 256), g = c.getContext('2d'), W = 256;
  const col = new THREE.Color(hex);
  g.fillStyle = '#' + col.getHexString(); g.fillRect(0, 0, W, W);
  speckle(g, W, W, 3000, 1, 0, 60, 0.15, 0.3, 231);
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
  for (let k = -W; k < 2 * W; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + W, W); g.stroke(); g.beginPath(); g.moveTo(k, W); g.lineTo(k + W, 0); g.stroke(); }
  g.strokeStyle = 'rgba(255,255,255,.16)'; g.lineWidth = 1; g.setLineDash([3, 3]);
  for (let k = -W; k < 2 * W; k += 32) { g.beginPath(); g.moveTo(k + 3, 0); g.lineTo(k + 3 + W, W); g.stroke(); g.beginPath(); g.moveTo(k + 3, W); g.lineTo(k + 3 + W, 0); g.stroke(); }
  g.setLineDash([]);
  if (!_quilt) { _quilt = canvasTex(c, { repeat: true }); _quilt.userData = { c }; _quilt.repeat.set(3, 3); }
  _quilt.needsUpdate = true;
  return _quilt;
}

const IM = {
  upper: new THREE.MeshPhongMaterial({ color: 0x3b3d41, specular: 0x1c1c1c, shininess: 14, bumpMap: TEX.grain, bumpScale: 0.003 }),
  lower: new THREE.MeshPhongMaterial({ color: 0x1c1d1f, specular: 0x1a1a1a, shininess: 12, bumpMap: TEX.grain, bumpScale: 0.003 }),
  head: new THREE.MeshPhongMaterial({ map: TEX.headW, color: 0xcac7c0, shininess: 2, specular: 0x050505 }),
  cabinet: new THREE.MeshPhongMaterial({ color: 0xd3d0c9, specular: 0x1a1a1a, shininess: 10, bumpMap: TEX.grain, bumpScale: 0.002 }),
  door: new THREE.MeshPhongMaterial({ color: 0x2f3134, specular: 0x1a1a1a, shininess: 10, bumpMap: TEX.grain, bumpScale: 0.003 }),
  drawer: new THREE.MeshPhongMaterial({ color: 0x2c2e31, specular: 0x222222, shininess: 18 }),
  seat: new THREE.MeshPhongMaterial({ map: TEX.leather, specular: 0x3a3a3a, shininess: 28 }),
  seatPlain: new THREE.MeshPhongMaterial({ color: 0x18181a, specular: 0x3a3a3a, shininess: 30, bumpMap: TEX.grain, bumpScale: 0.002 }),
  mattress: new THREE.MeshPhongMaterial({ map: TEX.headW, color: 0x34373d, shininess: 3, specular: 0x050505 }),
  leather: new THREE.MeshPhongMaterial({ color: 0x1b1b1c, specular: 0x3a3a3a, shininess: 35, bumpMap: TEX.grain, bumpScale: 0.002 }),
  floor: new THREE.MeshPhongMaterial({ map: TEX.floor, shininess: 10, specular: 0x111111, emissive: 0x000000 }),
  mat: new THREE.MeshPhongMaterial({ color: 0x121314, specular: 0x222222, shininess: 20, emissive: 0x000000 }),
  metal: new THREE.MeshPhongMaterial({ color: 0xa5a9ad, specular: 0xffffff, shininess: 90, envMap: ENV, reflectivity: 0.35, combine: THREE.MixOperation }),
  silver: new THREE.MeshPhongMaterial({ color: 0xc4c8cb, specular: 0xffffff, shininess: 100, envMap: ENV, reflectivity: 0.45, combine: THREE.MixOperation }),
  black: new THREE.MeshPhongMaterial({ color: 0x0f1011, specular: 0x333333, shininess: 40 }),
  gloss: new THREE.MeshPhongMaterial({ color: 0x0a0b0c, specular: 0x888888, shininess: 120 }),
  button: new THREE.MeshPhongMaterial({ color: 0x1f2022, specular: 0x444444, shininess: 50 }),
  red: new THREE.MeshPhongMaterial({ color: 0xb3141b, specular: 0x333333, shininess: 30 }),
  gold: new THREE.MeshPhongMaterial({ color: 0xd8b04a, specular: 0xffffff, shininess: 80 }),
  curtain: new THREE.MeshPhongMaterial({ map: TEX.fabric, color: 0x1a1b1d, shininess: 3 }),
  can: new THREE.MeshPhongMaterial({ color: 0x23365a, specular: 0xffffff, shininess: 70 }),
  ambient: new THREE.MeshBasicMaterial({ color: 0xff1e2c }),
  tv: new THREE.MeshBasicMaterial({ color: 0x0b1016 }),
  ledGreen: new THREE.MeshBasicMaterial({ color: 0x3dff8a }),
  ledAmber: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
  lcdGreen: new THREE.MeshBasicMaterial({ color: 0x46c07a }),
  lcdAmber: new THREE.MeshBasicMaterial({ color: 0xd88a1c }),
  lcdBlue: new THREE.MeshBasicMaterial({ color: 0x3a8ad8 }),
};
TEX.fabric.repeat.set(2, 2);
TEX.floor.repeat.set(4, 4);
const CAB_AMBIENT = { base: new THREE.Color(0xff1e2c), on: null };

function applyInteriorTheme(name) {
  const th = INTERIOR_THEMES[name]; if (!th) return;
  interiorName = name; lsSet('nlh.interior', name);
  drawLeather(th.stitch);
  const q = th.quilt ? quiltTexture(th.upper) : null;
  for (const [m, c, plainMap] of [[IM.upper, th.upper, null], [IM.head, th.head, TEX.headW], [IM.cabinet, th.cabinet, null], [IM.door, th.door, null]]) {
    const want = th.quilt ? q : plainMap;
    if (m.map !== want) { m.map = want; m.needsUpdate = true; }
    m.color.setHex(th.quilt ? (m === IM.head ? 0xe0d0d0 : 0xffffff) : c);
  }
  IM.lower.color.setHex(th.lower); IM.drawer.color.setHex(th.drawer);
  IM.mattress.color.setHex(th.mattress); IM.curtain.color.setHex(th.curtain);
  CAB_AMBIENT.base.setHex(th.ambient); CAB_AMBIENT.on = null;
}
function setCabAmbient(on) {
  if (CAB_AMBIENT.on === on) return;
  CAB_AMBIENT.on = on;
  IM.ambient.color.copy(CAB_AMBIENT.base).multiplyScalar(on ? 1 : 0.28);
  const e = CAB_AMBIENT.base.clone().multiplyScalar(on ? 0.13 : 0);
  IM.floor.emissive.copy(e); IM.mat.emissive.copy(e);
}

function buildInterior(T) {
  const cab = T.cab;
  const I = new Parts(); // casts and receives shadows
  const S = new Parts(); // small details

  // flat floor with mats, firewall
  I.box(IM.floor, 2.36, 0.04, 2.1, 0, 1.43, -4.2);
  for (const x of [0.55, -0.6]) S.box(IM.mat, 0.66, 0.012, 0.78, x, 1.456, -4.72);
  I.box(IM.lower, 2.36, 0.64, 0.06, 0, 1.77, -5.31);

  // ---- dashboard -----------------------------------------------------------------
  const upperProf = [[-5.34, 2.225], [-5.06, 2.205], [-4.95, 2.165], [-4.895, 2.1], [-4.895, 2.0], [-5.34, 2.0]];
  const lowerProf = [[-5.34, 2.0], [-4.895, 2.0], [-4.91, 1.9], [-4.99, 1.72], [-5.08, 1.5], [-5.34, 1.5]];
  for (const [x0, x1] of [[-1.17, -0.24], [-0.24, 0.22], [0.88, 1.17]]) {
    I.add(extrudeX(upperProf, x0, x1, 0.012), IM.upper);
    I.add(extrudeX(lowerProf, x0, x1, 0.01), IM.lower);
  }
  I.add(extrudeX([[-5.34, 2.07], [-4.97, 2.045], [-4.905, 2.0], [-4.905, 1.93], [-4.96, 1.83], [-5.03, 1.68], [-5.10, 1.5], [-5.34, 1.5]], 0.22, 0.88, 0.01), IM.lower);
  S.box(IM.silver, 0.92, 0.008, 0.008, -0.7, 2.0, -4.892);          // chrome line along the passenger dash
  S.box(IM.lower, 0.6, 0.008, 0.2, -0.66, 2.214, -5.14);             // storage tray in the dash top
  S.box(IM.black, 0.62, 0.006, 0.006, -0.66, 1.86, -4.948, 0.6, 0, 0);
  // passenger pull-out table with two cup holders (as in the S-series cab)
  I.box(IM.lower, 0.58, 0.04, 0.3, -0.66, 1.9, -4.76);
  S.box(IM.silver, 0.58, 0.012, 0.012, -0.66, 1.92, -4.612);
  for (const x of [-0.82, -0.7]) S.add(new THREE.CylinderGeometry(0.038, 0.038, 0.01, 16), IM.black, x, 1.922, -4.72);
  // instrument hood and screen bezel
  I.add(extrudeX([[-5.16, 2.05], [-5.16, 2.34], [-5.06, 2.355], [-4.97, 2.33], [-4.955, 2.302], [-4.985, 2.296], [-5.05, 2.315], [-5.12, 2.292], [-5.12, 2.05]], 0.21, 0.89, 0.008), IM.upper);
  for (const x of [0.225, 0.875]) I.box(IM.upper, 0.03, 0.27, 0.2, x, 2.175, -5.03);
  S.box(IM.gloss, 0.62, 0.24, 0.01, 0.55, 2.16, -5.058, -0.59, 0, 0);
  S.box(IM.silver, 0.64, 0.008, 0.008, 0.55, 2.298, -4.96);

  // control panel angled toward the driver: screen, hard keys, switch rows, climate
  for (const P of [S, I]) { P.push(-0.03, 1.86, -4.84, 0, 0.32, 0); P.push(0, 0, 0, -0.1, 0, 0); }
  I.box(IM.lower, 0.48, 0.66, 0.1, 0, 0, 0);
  I.box(IM.upper, 0.5, 0.03, 0.12, 0, 0.335, 0);
  S.box(IM.gloss, 0.34, 0.21, 0.025, 0, 0.18, 0.06);
  for (let k = 0; k < 5; k++) S.box(IM.button, 0.05, 0.026, 0.014, -0.13 + k * 0.055, 0.048, 0.056);
  S.add(new THREE.CylinderGeometry(0.022, 0.024, 0.024, 18), IM.silver, 0.185, 0.048, 0.06, Math.PI / 2, 0, 0);
  S.box(IM.silver, 0.46, 0.006, 0.006, 0, 0.012, 0.052);
  for (let row = 0; row < 2; row++) for (let k = 0; k < 6; k++) {
    S.box(IM.button, 0.036, 0.046, 0.018, -0.15 + k * 0.06, -0.05 - row * 0.065, 0.055);
    if ((row + k) % 3 === 0) S.box(k % 2 ? IM.ledAmber : IM.ledGreen, 0.008, 0.005, 0.004, -0.15 + k * 0.06, -0.034 - row * 0.065, 0.066);
  }
  for (const x of [-0.165, 0.165]) { S.add(new THREE.CylinderGeometry(0.03, 0.032, 0.026, 20), IM.button, x, -0.22, 0.062, Math.PI / 2, 0, 0); S.box(IM.silver, 0.004, 0.018, 0.004, x, -0.205, 0.077); }
  S.box(IM.black, 0.15, 0.045, 0.01, 0, -0.22, 0.053);
  S.box(IM.lcdAmber, 0.11, 0.022, 0.004, 0, -0.22, 0.059);
  S.box(IM.black, 0.2, 0.05, 0.03, 0, -0.29, 0.04);
  for (const P of [S, I]) { P.pop(); P.pop(); }
  // centre console between the seats: cup holders, phone tray, storage
  I.box(IM.lower, 0.36, 0.3, 0.52, -0.03, 1.62, -4.56);
  I.box(IM.lower, 0.38, 0.03, 0.54, -0.03, 1.785, -4.56);
  S.box(IM.silver, 0.38, 0.012, 0.012, -0.03, 1.79, -4.297);
  for (const x of [-0.11, 0.04]) S.add(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 16), IM.black, x, 1.801, -4.45);
  S.add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), IM.can, -0.11, 1.86, -4.45);
  S.add(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 16), IM.metal, -0.11, 1.925, -4.45);
  S.box(IM.black, 0.26, 0.006, 0.13, -0.03, 1.802, -4.66);
  S.box(IM.black, 0.28, 0.006, 0.006, -0.03, 1.6, -4.299);
  // driver's outer panel: light switch, buttons, parking brake
  for (const P of [S, I]) P.push(1.0, 1.98, -4.915, 0, -0.5, 0);
  I.box(IM.lower, 0.27, 0.3, 0.06, 0, 0, 0);
  S.add(new THREE.CylinderGeometry(0.036, 0.038, 0.03, 20), IM.button, 0.05, 0.06, 0.04, Math.PI / 2, 0, 0);
  S.box(IM.ledGreen, 0.004, 0.02, 0.004, 0.05, 0.075, 0.057);
  for (let k = 0; k < 3; k++) S.box(IM.button, 0.035, 0.035, 0.014, -0.07 + k * 0.045, -0.05, 0.035);
  S.box(IM.black, 0.03, 0.03, 0.09, -0.07, 0.07, 0.06);
  S.box(new THREE.MeshPhongMaterial({ color: 0xd4a017, shininess: 40 }), 0.034, 0.034, 0.03, -0.07, 0.07, 0.11);
  for (const P of [S, I]) P.pop();
  // vents with chrome surrounds
  for (const x of [-0.98, -0.42, 1.03]) {
    S.box(IM.silver, 0.185, 0.082, 0.012, x, 2.055, -4.886);
    S.box(IM.black, 0.168, 0.068, 0.02, x, 2.055, -4.882);
    for (let k = 0; k < 3; k++) S.box(IM.lower, 0.155, 0.008, 0.02, x, 2.035 + k * 0.02, -4.874);
  }
  // ETC unit on the dash top
  S.box(IM.black, 0.12, 0.035, 0.08, 0.96, 2.233, -5.16);
  S.box(IM.ledGreen, 0.01, 0.006, 0.004, 0.92, 2.243, -5.119);
  // red footwell LEDs
  S.box(IM.ambient, 2.0, 0.012, 0.012, 0, 1.52, -5.04);

  // ---- seats: tall leather seats with stitched channels, integrated headrests ----------
  for (const [sx, drv] of [[0.55, true], [-0.6, false]]) {
    I.box(IM.black, 0.4, 0.3, 0.42, sx, 1.6, -4.05);
    I.box(IM.seat, 0.44, 0.11, 0.5, sx, 1.835, -4.07);
    for (const o of [-0.25, 0.25]) I.box(IM.seatPlain, 0.075, 0.14, 0.5, sx + o, 1.86, -4.07);
    I.box(IM.seat, 0.42, 0.74, 0.1, sx, 2.3, -3.93, 0.16, 0, 0);
    for (const o of [-0.245, 0.245]) I.box(IM.seatPlain, 0.085, 0.7, 0.17, sx + o, 2.28, -3.915, 0.16, 0, 0);
    I.box(IM.seat, 0.32, 0.25, 0.1, sx, 2.86, -3.835, 0.16, 0, 0);
    for (const o of [-0.19, 0.19]) I.box(IM.seatPlain, 0.06, 0.24, 0.14, sx + o, 2.85, -3.83, 0.16, 0, 0);
    I.box(IM.seatPlain, 0.56, 1.06, 0.05, sx, 2.39, -3.86, 0.16, 0, 0);
    I.box(IM.seatPlain, 0.06, 0.05, 0.36, sx + (drv ? -0.31 : 0.31), 2.12, -4.0);
    if (!drv) I.box(IM.seatPlain, 0.06, 0.05, 0.36, sx - 0.31, 2.12, -4.0);
    S.box(IM.black, 0.05, 0.6, 0.008, sx + (drv ? 0.26 : -0.26), 2.45, -3.83, 0.16, 0, 0); // belt along the seat
  }

  // ---- bed with drawers, rear wall with TV and control panel, rear cabinets -----------
  I.box(IM.mattress, 2.3, 0.15, 0.62, 0, 2.06, -3.5);
  I.box(IM.lower, 2.32, 0.05, 0.04, 0, 1.985, -3.81);
  I.box(IM.drawer, 2.3, 0.5, 0.04, 0, 1.73, -3.82);
  for (const x of [-0.55, 0.55]) {
    for (const y of [1.93, 1.53]) S.box(IM.black, 0.92, 0.006, 0.006, x, y, -3.842);
    for (const dx of [-0.46, 0.46]) S.box(IM.black, 0.006, 0.4, 0.006, x + dx, 1.73, -3.842);
    S.box(IM.black, 0.24, 0.03, 0.02, x, 1.87, -3.85);
  }
  I.box(IM.head, 0.5, 0.1, 0.34, -0.85, 2.18, -3.45);
  I.box(new THREE.MeshPhongMaterial({ color: 0x29355c, shininess: 4 }), 0.6, 0.08, 0.4, 0.72, 2.17, -3.42);
  I.box(IM.head, 2.36, 2.36, 0.04, 0, 2.62, -3.17);
  S.box(IM.gloss, 0.5, 0.3, 0.03, -0.55, 2.62, -3.19);
  S.add(new THREE.PlaneGeometry(0.46, 0.26), IM.tv, -0.55, 2.62, -3.174);
  S.box(IM.black, 0.13, 0.19, 0.025, 0.78, 2.56, -3.19);
  S.add(new THREE.PlaneGeometry(0.09, 0.055), IM.lcdBlue, 0.78, 2.6, -3.177);
  for (let k = 0; k < 3; k++) S.box(IM.button, 0.025, 0.02, 0.01, 0.75 + k * 0.03, 2.5, -3.177);
  S.box(IM.black, 0.24, 0.15, 0.03, 0.78, 2.33, -3.19);
  for (const x of [-0.95, 0.95]) S.box(IM.black, 0.1, 0.05, 0.04, x, 2.95, -3.2);
  I.add(extrudeX([[-3.62, 3.78], [-3.62, 3.28], [-3.55, 3.2], [-3.19, 3.2], [-3.19, 3.78]], -1.16, 1.16, 0.01), IM.cabinet);
  for (const x of [-0.58, 0, 0.58]) S.box(IM.black, 0.006, 0.5, 0.006, x, 3.48, -3.623);
  S.box(IM.ambient, 2.2, 0.01, 0.01, 0, 3.195, -3.58);

  // ---- ceiling and the overhead cabinets above the windscreen ------------------------------
  I.box(IM.head, 2.36, 0.04, 2.15, 0, 3.8, -4.22);
  S.box(IM.cabinet, 0.66, 0.02, 0.66, 0, 3.775, -4.05);
  for (const x of [-0.5, 0.5]) S.box(IM.silver, 0.12, 0.02, 0.07, x, 3.775, -4.62);
  I.add(extrudeX([[-5.16, 3.79], [-5.16, 3.44], [-5.05, 3.33], [-4.70, 3.33], [-4.60, 3.42], [-4.60, 3.79]], -1.16, 1.16, 0.01), IM.cabinet);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) S.box(IM.black, 0.006, 0.12, 0.004, x, 3.378, -4.648, 0.83, 0, 0);
  S.add(new THREE.PlaneGeometry(0.4, 0.07), IM.gloss, 0, 3.374, -4.648, 0.83, 0, 0);
  S.add(new THREE.PlaneGeometry(0.12, 0.028), IM.lcdGreen, -0.08, 3.373, -4.646, 0.83, 0, 0);
  for (let k = 0; k < 4; k++) S.add(new THREE.PlaneGeometry(0.018, 0.012), IM.button, 0.06 + k * 0.03, 3.373, -4.646, 0.83, 0, 0);
  S.box(IM.ambient, 2.2, 0.01, 0.01, 0, 3.326, -4.7);
  for (const x of [-0.9, 0.9]) S.box(IM.ambient, 0.12, 0.012, 0.03, x, 3.328, -4.85);

  // ---- pillars, doors, curtains --------------------------------------------------------------
  for (const sx of [-1, 1]) {
    I.box(IM.door, 0.09, 1.07, 0.11, sx * 1.15, 2.78, -5.22, 0.164, 0, 0);
    S.box(IM.black, 0.03, 0.35, 0.04, sx * 1.1, 2.75, -5.15, 0.164, 0, 0);
    // door trim follows the dropped window line at the front
    I.box(IM.door, 0.05, 0.68, 0.36, sx * 1.17, 1.78, -5.02);
    I.box(IM.door, 0.05, 0.87, 0.68, sx * 1.17, 1.875, -4.49);
    I.box(IM.door, 0.08, 0.04, 0.36, sx * 1.15, 2.12, -5.02);
    I.box(IM.door, 0.08, 0.04, 0.24, sx * 1.15, 2.215, -4.82, -1.03, 0, 0);
    I.box(IM.door, 0.08, 0.04, 0.66, sx * 1.15, 2.31, -4.49);
    I.box(IM.lower, 0.1, 0.055, 0.45, sx * 1.11, 2.14, -4.52);
    S.box(IM.silver, 0.03, 0.03, 0.15, sx * 1.105, 2.2, -4.72);
    S.box(IM.black, 0.05, 0.015, 0.1, sx * 1.11, 2.172, -4.42);
    S.add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), IM.black, sx * 1.143, 1.72, -4.95, 0, 0, Math.PI / 2);
    S.add(new THREE.TorusGeometry(0.076, 0.006, 6, 20), IM.silver, sx * 1.145, 1.72, -4.95, 0, Math.PI / 2, 0);
    I.box(IM.lower, 0.07, 0.15, 0.6, sx * 1.13, 1.58, -4.58);
    I.box(IM.door, 0.05, 0.64, 1.06, sx * 1.17, 3.47, -4.68);
    I.box(IM.door, 0.07, 2.36, 0.13, sx * 1.15, 2.62, -4.14);
    I.box(IM.head, 0.05, 2.36, 0.95, sx * 1.165, 2.62, -3.63);
    S.box(IM.ambient, 0.012, 0.012, 0.9, sx * 1.135, 1.5, -4.62);
    for (let k = 0; k < 3; k++) I.add(new THREE.CylinderGeometry(0.045, 0.05, 0.98, 8), IM.curtain, sx * (1.06 - k * 0.04), 2.78, -5.13 + k * 0.035, 0.164, 0, 0);
    for (let k = 0; k < 2; k++) I.add(new THREE.CylinderGeometry(0.055, 0.06, 1.15, 8), IM.curtain, sx * (1.07 - k * 0.05), 2.95, -4.06 + k * 0.03);
    S.box(IM.black, 0.13, 0.03, 0.1, sx * 1.07, 2.7, -4.05);
  }
  I.box(IM.door, 2.3, 0.1, 0.08, 0, 3.31, -5.15);
  S.box(IM.metal, 2.2, 0.01, 0.01, 0, 3.26, -5.12);
  // sun visors: the driver's is down against the afternoon sun
  I.box(IM.cabinet, 0.86, 0.022, 0.3, 0.55, 3.166, -5.06, 1.1, 0, 0);
  I.box(IM.cabinet, 0.86, 0.022, 0.3, -0.55, 3.285, -4.99, 0.15, 0, 0);
  // fire extinguisher by the passenger seat, footrest
  S.add(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 14), IM.red, -1.0, 1.63, -4.25);
  S.box(IM.black, 0.06, 0.05, 0.05, -1.0, 1.83, -4.25);
  S.box(IM.lower, 0.12, 0.05, 0.22, 0.22, 1.5, -4.92, -0.5, 0, 0);

  I.build(cab, { cast: true, receive: true });
  S.build(cab, { cast: false, receive: true });

  const R = {};
  R.cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.215), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  R.cluster.position.set(0.55, 2.165, -5.04); R.cluster.rotation.x = -0.59; cab.add(R.cluster);
  R.nav = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.18), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  { const g = new THREE.Group(); g.position.set(-0.03, 1.86, -4.84); g.rotation.y = 0.32; const g2 = new THREE.Group(); g2.rotation.x = -0.1; g.add(g2); R.nav.position.set(0, 0.18, 0.074); g2.add(R.nav); cab.add(g); }

  // steering wheel: axis points up and toward the driver
  const wf = new THREE.Group(); wf.position.set(0.55, 2.03, -4.64); wf.rotation.x = -0.96; cab.add(wf);
  const W = new Parts();
  W.box(IM.lower, 0.12, 0.12, 0.38, 0, 0, -0.24);
  W.add(new THREE.CylinderGeometry(0.012, 0.01, 0.17, 8), IM.black, -0.13, 0.02, -0.085, 0, 0, Math.PI / 2 + 0.15);
  W.box(IM.button, 0.03, 0.02, 0.02, -0.215, 0.032, -0.085);
  W.add(new THREE.CylinderGeometry(0.012, 0.01, 0.15, 8), IM.black, 0.12, 0.0, -0.09, 0, 0, Math.PI / 2 - 0.1);
  W.build(wf, { cast: true, receive: true });
  R.wheel = new THREE.Group(); wf.add(R.wheel);
  const SW = new Parts();
  SW.add(new THREE.TorusGeometry(0.218, 0.022, 12, 48), IM.leather, 0, 0, 0);
  SW.add(new THREE.CylinderGeometry(0.078, 0.088, 0.06, 24), IM.black, 0, -0.012, -0.025, Math.PI / 2, 0, 0);
  SW.box(IM.leather, 0.165, 0.13, 0.04, 0, -0.008, 0.008);
  SW.add(new THREE.TorusGeometry(0.024, 0.0045, 6, 24), IM.silver, 0, 0.0, 0.03);
  for (const sx of [-1, 1]) {
    SW.box(IM.lower, 0.13, 0.075, 0.025, sx * 0.135, -0.015, -0.006);
    SW.box(IM.silver, 0.13, 0.006, 0.006, sx * 0.135, -0.054, 0.006);
    for (let k = 0; k < 4; k++) SW.box(IM.button, 0.018, 0.014, 0.008, sx * (0.11 + (k % 2) * 0.028), 0.0 - Math.floor(k / 2) * 0.022, 0.009);
    SW.box(IM.silver, 0.012, 0.03, 0.008, sx * 0.175, -0.01, 0.009);
  }
  SW.box(IM.silver, 0.045, 0.13, 0.02, 0, -0.14, -0.008);
  SW.build(R.wheel, { cast: true, receive: true });
  R.wheelFrame = wf;

  // pedals
  R.gas = new THREE.Group(); R.gas.position.set(0.72, 1.47, -5.0); cab.add(R.gas);
  R.gas.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.015).translate(0, 0.13, 0), IM.black), { castShadow: true }));
  R.brake = new THREE.Group(); R.brake.position.set(0.42, 1.98, -4.98); cab.add(R.brake);
  R.brake.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.03).translate(0, -0.16, 0), IM.metal));
  R.brake.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.02).translate(0, -0.34, 0.03), IM.black));

  // omamori charm hanging from the overhead console
  R.charm = new THREE.Group(); R.charm.position.set(0.08, 3.33, -4.66); cab.add(R.charm);
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.1, 0.002).translate(0, -0.05, 0), IM.gold));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.008).translate(0, -0.128, 0), IM.red));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.009).translate(0, -0.112, 0), IM.gold));
  R.charmState = { ax: 0, vx: 0, az: 0, vz: 0 };

  R.eye = new THREE.Object3D(); R.eye.position.set(0.55, 2.62, -4.28); cab.add(R.eye);
  applyInteriorTheme(interiorName);
  return R;
}

// ---------------------------------------------------------------------------
// Cab interior (right-hand drive). Driver eye at (0.55, 2.62, -4.28).
// Wrap-around dashboard, instrument pod, angled centre stack with navigation,
// 3-spoke wheel, stalks, pedals, seats, bunk, overhead storage, doors,
// sun visors, curtains and a 交通安全 omamori charm that swings.
// ---------------------------------------------------------------------------
const IM = {
  dash: new THREE.MeshPhongMaterial({ color: 0x2b2d30, specular: 0x1c1c1c, shininess: 14, bumpMap: TEX.grain, bumpScale: 0.003 }),
  dashTop: new THREE.MeshPhongMaterial({ color: 0x1c1d1f, specular: 0x111111, shininess: 6, bumpMap: TEX.grain, bumpScale: 0.004 }),
  trim: new THREE.MeshPhongMaterial({ color: 0x45484d, specular: 0x1a1a1a, shininess: 10, bumpMap: TEX.grain, bumpScale: 0.003 }),
  trimLight: new THREE.MeshPhongMaterial({ color: 0x8b8e91, specular: 0x1a1a1a, shininess: 8, bumpMap: TEX.grain, bumpScale: 0.002 }),
  fabric: new THREE.MeshPhongMaterial({ map: TEX.fabric, shininess: 3, specular: 0x050505 }),
  bunk: new THREE.MeshPhongMaterial({ map: TEX.fabric, color: 0x9fb2cf, shininess: 3, specular: 0x050505 }),
  leather: new THREE.MeshPhongMaterial({ color: 0x1b1b1c, specular: 0x3a3a3a, shininess: 35, bumpMap: TEX.grain, bumpScale: 0.002 }),
  head: new THREE.MeshPhongMaterial({ map: TEX.headliner, shininess: 2, specular: 0x050505 }),
  floor: new THREE.MeshPhongMaterial({ map: TEX.floor, shininess: 10, specular: 0x111111 }),
  metal: new THREE.MeshPhongMaterial({ color: 0xa5a9ad, specular: 0xffffff, shininess: 90, envMap: ENV, reflectivity: 0.35, combine: THREE.MixOperation }),
  black: new THREE.MeshPhongMaterial({ color: 0x0f1011, specular: 0x333333, shininess: 40 }),
  gloss: new THREE.MeshPhongMaterial({ color: 0x0a0b0c, specular: 0x888888, shininess: 120 }),
  button: new THREE.MeshPhongMaterial({ color: 0x1f2022, specular: 0x444444, shininess: 50 }),
  red: new THREE.MeshPhongMaterial({ color: 0xb3141b, specular: 0x333333, shininess: 30 }),
  gold: new THREE.MeshPhongMaterial({ color: 0xd8b04a, specular: 0xffffff, shininess: 80 }),
  curtain: new THREE.MeshPhongMaterial({ map: TEX.fabric, color: 0x7a8aa0, shininess: 3 }),
  can: new THREE.MeshPhongMaterial({ color: 0x23365a, specular: 0xffffff, shininess: 70 }),
  ledGreen: new THREE.MeshBasicMaterial({ color: 0x3dff8a }),
  ledAmber: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
  ledBlue: new THREE.MeshBasicMaterial({ color: 0x5aa8ff }),
  lcdGreen: new THREE.MeshBasicMaterial({ color: 0x46c07a }),
  lcdAmber: new THREE.MeshBasicMaterial({ color: 0xd88a1c }),
};
TEX.fabric.repeat.set(2, 2);
TEX.headliner.repeat.set(4, 4);
TEX.floor.repeat.set(4, 4);

function buildInterior(T) {
  const cab = T.cab;
  const I = new Parts(); // casts and receives shadows
  const S = new Parts(); // small details

  // floor and firewall
  I.box(IM.floor, 2.36, 0.04, 2.05, 0, 1.43, -4.2);
  I.box(IM.dash, 2.36, 0.64, 0.06, 0, 1.77, -5.27);
  // dashboard: passenger part, centre part, driver section (lower, under the instrument pod), outer right part
  const dashProf = [[-5.30, 2.21], [-5.04, 2.19], [-4.93, 2.14], [-4.885, 2.07], [-4.885, 1.97], [-4.95, 1.85], [-5.03, 1.68], [-5.10, 1.50], [-5.30, 1.50]];
  I.add(extrudeX(dashProf, -1.17, 0.22, 0.012), IM.dash);
  I.add(extrudeX(dashProf, 0.88, 1.17, 0.012), IM.dash);
  I.add(extrudeX([[-5.30, 2.07], [-4.97, 2.045], [-4.9, 2.0], [-4.9, 1.93], [-4.96, 1.83], [-5.03, 1.68], [-5.10, 1.5], [-5.30, 1.5]], 0.22, 0.88, 0.01), IM.dash);
  I.box(IM.dashTop, 1.38, 0.012, 0.27, -0.475, 2.207, -5.17, 0.05, 0, 0);
  I.box(IM.dashTop, 0.28, 0.012, 0.27, 1.025, 2.207, -5.17, 0.05, 0, 0);
  // instrument pod: hood + cheeks
  I.add(extrudeX([[-5.16, 2.05], [-5.16, 2.34], [-5.06, 2.355], [-4.97, 2.33], [-4.955, 2.302], [-4.985, 2.296], [-5.05, 2.315], [-5.12, 2.292], [-5.12, 2.05]], 0.21, 0.89, 0.008), IM.dashTop);
  for (const x of [0.225, 0.875]) I.box(IM.dash, 0.03, 0.27, 0.2, x, 2.175, -5.03);
  S.box(IM.gloss, 0.62, 0.24, 0.01, 0.55, 2.16, -5.058, -0.59, 0, 0);

  // centre stack, turned toward the driver
  S.push(-0.03, 1.84, -4.83, 0, 0.3, 0); S.push(0, 0, 0, -0.12, 0, 0);
  I.push(-0.03, 1.84, -4.83, 0, 0.3, 0); I.push(0, 0, 0, -0.12, 0, 0);
  I.box(IM.dash, 0.47, 0.62, 0.1, 0, 0.01, 0);
  S.box(IM.gloss, 0.31, 0.2, 0.02, 0, 0.16, 0.055);
  for (let k = 0; k < 6; k++) S.box(IM.button, 0.042, 0.028, 0.016, -0.15 + k * 0.06, -0.02, 0.055);
  for (const x of [-0.165, 0.165]) { S.add(new THREE.CylinderGeometry(0.029, 0.031, 0.026, 18), IM.button, x, -0.12, 0.062, Math.PI / 2, 0, 0); S.box(IM.metal, 0.004, 0.018, 0.004, x, -0.105, 0.077); }
  S.box(IM.black, 0.15, 0.045, 0.01, 0, -0.12, 0.053);
  S.box(IM.lcdAmber, 0.11, 0.022, 0.004, 0, -0.12, 0.059);
  for (let k = 0; k < 6; k++) { S.box(IM.button, 0.036, 0.052, 0.02, -0.15 + k * 0.06, -0.235, 0.055); if (k === 1 || k === 4) S.box(k === 1 ? IM.ledGreen : IM.ledAmber, 0.008, 0.006, 0.004, -0.15 + k * 0.06, -0.218, 0.066); }
  S.box(IM.black, 0.2, 0.06, 0.03, 0, -0.33, 0.04);
  I.pop(); I.pop(); S.pop(); S.pop();

  // driver's outer panel (light switch, parking brake)
  S.push(1.0, 1.98, -4.915, 0, -0.5, 0);
  I.push(1.0, 1.98, -4.915, 0, -0.5, 0);
  I.box(IM.dash, 0.27, 0.3, 0.06, 0, 0, 0);
  S.add(new THREE.CylinderGeometry(0.036, 0.038, 0.03, 20), IM.button, 0.05, 0.06, 0.04, Math.PI / 2, 0, 0);
  S.box(IM.ledGreen, 0.004, 0.02, 0.004, 0.05, 0.075, 0.057);
  for (let k = 0; k < 3; k++) S.box(IM.button, 0.035, 0.035, 0.014, -0.07 + k * 0.045, -0.05, 0.035);
  S.box(IM.black, 0.03, 0.03, 0.09, -0.07, 0.07, 0.06);
  S.box(new THREE.MeshPhongMaterial({ color: 0xd4a017, shininess: 40 }), 0.034, 0.034, 0.03, -0.07, 0.07, 0.11);
  I.pop(); S.pop();

  // air vents on the dash face
  for (const x of [-1.0, -0.45, 1.02]) {
    S.box(IM.black, 0.17, 0.075, 0.02, x, 2.02, -4.878);
    for (let k = 0; k < 3; k++) S.box(IM.dash, 0.155, 0.008, 0.02, x, 2.0 + k * 0.02, -4.872);
  }
  // passenger side: tray, glovebox seam, cupholders with a can of coffee, ETC unit
  S.box(IM.dash, 0.55, 0.008, 0.18, -0.6, 2.214, -5.12);
  S.box(IM.black, 0.62, 0.006, 0.006, -0.62, 1.86, -4.948, 0.6, 0, 0);
  S.box(IM.black, 0.62, 0.006, 0.006, -0.62, 1.70, -5.03, 0.6, 0, 0);
  for (const x of [-0.3, -0.42]) S.add(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 16), IM.black, x, 2.16, -4.94);
  S.add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), IM.can, -0.3, 2.21, -4.94);
  S.add(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 16), IM.metal, -0.3, 2.275, -4.94);
  S.box(IM.black, 0.12, 0.035, 0.08, 0.96, 2.233, -5.16);
  S.box(IM.ledGreen, 0.01, 0.006, 0.004, 0.92, 2.243, -5.119);

  // seats
  for (const [sx, drv] of [[0.55, true], [-0.6, false]]) {
    I.box(IM.black, 0.36, 0.32, 0.38, sx, 1.61, -4.05);
    I.box(IM.fabric, 0.52, 0.12, 0.52, sx, 1.83, -4.06);
    for (const o of [-0.24, 0.24]) I.box(IM.fabric, 0.07, 0.1, 0.48, sx + o, 1.9, -4.06);
    I.box(IM.fabric, 0.54, 0.8, 0.13, sx, 2.3, -3.95, 0.18, 0, 0);
    for (const o of [-0.25, 0.25]) I.box(IM.fabric, 0.06, 0.6, 0.16, sx + o, 2.32, -3.95, 0.18, 0, 0);
    I.box(IM.fabric, 0.3, 0.2, 0.1, sx, 2.83, -3.86, 0.18, 0, 0);
    I.box(IM.black, 0.06, 0.05, 0.36, sx + (drv ? -0.3 : 0.3), 2.12, -4.0);
  }
  // bunk
  I.box(IM.bunk, 2.32, 0.16, 0.62, 0, 2.05, -3.5);
  I.box(IM.trim, 2.32, 0.6, 0.04, 0, 1.68, -3.8);
  for (const x of [-0.55, 0.55]) S.box(IM.black, 0.9, 0.008, 0.005, x, 1.68, -3.822);
  I.box(IM.trimLight, 0.5, 0.1, 0.34, -0.85, 2.18, -3.45);
  I.box(new THREE.MeshPhongMaterial({ color: 0x29355c, shininess: 4 }), 0.6, 0.08, 0.4, 0.72, 2.17, -3.42);
  I.box(IM.trimLight, 2.36, 2.36, 0.04, 0, 2.62, -3.17);
  I.box(IM.trim, 2.3, 0.07, 0.6, 0, 3.2, -3.27, -1.35, 0, 0);
  for (const x of [-0.9, 0.9]) S.box(IM.black, 0.12, 0.06, 0.04, x, 2.62, -3.2);

  // headliner, roof hatch, overhead storage with a digital tachograph module
  I.box(IM.head, 2.36, 0.04, 2.15, 0, 3.8, -4.22);
  S.box(IM.trimLight, 0.66, 0.02, 0.66, 0, 3.775, -4.0);
  for (const x of [-0.5, 0.5]) S.box(IM.trimLight, 0.1, 0.02, 0.06, x, 3.775, -4.6);
  I.add(extrudeX([[-5.16, 3.79], [-5.16, 3.44], [-5.05, 3.33], [-4.70, 3.33], [-4.60, 3.42], [-4.60, 3.79]], -1.16, 1.16, 0.01), IM.trim);
  for (const x of [-0.75, -0.25, 0.25, 0.75]) S.box(IM.black, 0.006, 0.12, 0.004, x, 3.378, -4.648, 0.83, 0, 0);
  S.add(new THREE.PlaneGeometry(0.4, 0.07), IM.gloss, 0, 3.374, -4.648, 0.83, 0, 0);
  S.add(new THREE.PlaneGeometry(0.12, 0.028), IM.lcdGreen, -0.08, 3.373, -4.646, 0.83, 0, 0);
  for (let k = 0; k < 4; k++) S.add(new THREE.PlaneGeometry(0.018, 0.012), IM.button, 0.06 + k * 0.03, 3.373, -4.646, 0.83, 0, 0);

  // pillars, windscreen surround, doors
  for (const sx of [-1, 1]) {
    I.box(IM.trim, 0.09, 1.07, 0.11, sx * 1.15, 2.78, -5.24, 0.164, 0, 0);
    S.box(IM.black, 0.03, 0.35, 0.04, sx * 1.1, 2.75, -5.16, 0.164, 0, 0);
    I.box(IM.trim, 0.05, 0.87, 1.12, sx * 1.17, 1.88, -4.7);
    I.box(IM.trimLight, 0.09, 0.05, 0.42, sx * 1.12, 2.15, -4.58);
    S.box(IM.metal, 0.03, 0.03, 0.14, sx * 1.1, 2.21, -4.84);
    S.box(IM.black, 0.05, 0.015, 0.1, sx * 1.11, 2.182, -4.5);
    S.add(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 20), IM.black, sx * 1.143, 1.72, -4.95, 0, 0, Math.PI / 2);
    I.box(IM.dash, 0.07, 0.15, 0.6, sx * 1.13, 1.58, -4.65);
    I.box(IM.trim, 0.08, 0.04, 1.08, sx * 1.15, 2.31, -4.71);
    I.box(IM.trim, 0.05, 0.64, 1.06, sx * 1.17, 3.47, -4.68);
    I.box(IM.trim, 0.07, 2.36, 0.13, sx * 1.15, 2.62, -4.14);
    I.box(IM.trimLight, 0.05, 2.36, 0.95, sx * 1.165, 2.62, -3.63);
    // curtains gathered at the A-pillars
    for (let k = 0; k < 3; k++) I.add(new THREE.CylinderGeometry(0.045, 0.05, 0.98, 8), IM.curtain, sx * (1.06 - k * 0.04), 2.78, -5.13 + k * 0.035, 0.164, 0, 0);
  }
  I.box(IM.trim, 2.3, 0.1, 0.08, 0, 3.31, -5.15);
  S.box(IM.metal, 2.2, 0.01, 0.01, 0, 3.26, -5.12);
  // sun visors: driver's lowered against the afternoon sun
  I.box(IM.trimLight, 0.86, 0.022, 0.3, 0.55, 3.166, -5.06, 1.1, 0, 0);
  I.box(IM.trimLight, 0.86, 0.022, 0.3, -0.55, 3.285, -4.99, 0.15, 0, 0);
  // fire extinguisher by the passenger seat
  S.add(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 14), IM.red, -1.0, 1.63, -4.25);
  S.box(IM.black, 0.06, 0.05, 0.05, -1.0, 1.83, -4.25);
  S.box(IM.dash, 0.12, 0.05, 0.22, 0.22, 1.5, -4.92, -0.5, 0, 0); // footrest

  I.build(cab, { cast: true, receive: true });
  S.build(cab, { cast: false, receive: true });

  const R = {};
  // instrument cluster and navigation screens (textures from the dash module)
  R.cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.215), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  R.cluster.position.set(0.55, 2.165, -5.04); R.cluster.rotation.x = -0.59; cab.add(R.cluster);
  R.nav = new THREE.Mesh(new THREE.PlaneGeometry(0.275, 0.17), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  { const g = new THREE.Group(); g.position.set(-0.03, 1.84, -4.83); g.rotation.y = 0.3; const g2 = new THREE.Group(); g2.rotation.x = -0.12; g.add(g2); R.nav.position.set(0, 0.16, 0.067); g2.add(R.nav); cab.add(g); }

  // steering wheel: frame tilted so its axis points up and toward the driver
  const wf = new THREE.Group(); wf.position.set(0.55, 2.03, -4.64); wf.rotation.x = -0.96; cab.add(wf);
  const W = new Parts();
  W.box(IM.dash, 0.12, 0.12, 0.38, 0, 0, -0.24);
  W.add(new THREE.CylinderGeometry(0.012, 0.01, 0.17, 8), IM.black, -0.13, 0.02, -0.085, 0, 0, Math.PI / 2 + 0.15);
  W.box(IM.button, 0.03, 0.02, 0.02, -0.215, 0.032, -0.085);
  W.add(new THREE.CylinderGeometry(0.012, 0.01, 0.15, 8), IM.black, 0.12, 0.0, -0.09, 0, 0, Math.PI / 2 - 0.1);
  W.build(wf, { cast: true, receive: true });
  R.wheel = new THREE.Group(); wf.add(R.wheel);
  const SW = new Parts();
  SW.add(new THREE.TorusGeometry(0.225, 0.021, 12, 48), IM.leather, 0, 0, 0);
  SW.add(new THREE.CylinderGeometry(0.078, 0.088, 0.06, 24), IM.black, 0, -0.012, -0.025, Math.PI / 2, 0, 0);
  SW.box(IM.leather, 0.15, 0.115, 0.035, 0, -0.01, 0.005);
  SW.box(IM.dash, 0.16, 0.05, 0.022, -0.135, -0.012, -0.012);
  SW.box(IM.dash, 0.16, 0.05, 0.022, 0.135, -0.012, -0.012);
  SW.box(IM.dash, 0.05, 0.15, 0.022, 0, -0.14, -0.012);
  for (const sx of [-1, 1]) for (let k = 0; k < 4; k++) SW.box(IM.button, 0.017, 0.013, 0.008, sx * (0.11 + (k % 2) * 0.026), -0.002 - Math.floor(k / 2) * 0.02, 0.003);
  SW.box(IM.metal, 0.03, 0.006, 0.004, 0, -0.06, 0.024);
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

  // eye point for the cab camera
  R.eye = new THREE.Object3D(); R.eye.position.set(0.55, 2.62, -4.28); cab.add(R.eye);
  return R;
}

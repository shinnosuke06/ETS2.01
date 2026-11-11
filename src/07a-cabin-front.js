// ---------------------------------------------------------------------------
// Cab interior, front half: floor, dashboard, instrument hood and screen,
// control panel angled toward the driver, driver's side panel, vents, ETC unit,
// steering wheel and pedals, doors and pillars. Right-hand drive; the driver's
// eye is at (0.55, 2.62, -4.28). Parts go into I (outline parts, also drawn from
// outside) and S (small parts, drawn only from inside); single meshes into
// R.shell or R.fine.
// ---------------------------------------------------------------------------
function buildCabinFront(I, S, R) {
  cabFloorAndDash(I, S, R);
  cabCentreStack(I, S, R);
  cabSidePanel(I, S);

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

  // steering wheel: axis points up and toward the driver
  const wf = new THREE.Group(); wf.position.set(0.55, 2.03, -4.64); wf.rotation.x = -0.96; R.shell.add(wf);
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
  R.gas = new THREE.Group(); R.gas.position.set(0.72, 1.47, -5.0); R.fine.add(R.gas);
  R.gas.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.26, 0.015).translate(0, 0.13, 0), IM.black), { castShadow: true }));
  R.brake = new THREE.Group(); R.brake.position.set(0.42, 1.98, -4.98); R.fine.add(R.brake);
  R.brake.add(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.03).translate(0, -0.16, 0), IM.metal));
  R.brake.add(new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.02).translate(0, -0.34, 0.03), IM.black));
}

// ---- floor and dashboard ---------------------------------------------------------
// How much of the driver's dash a point at x has: 0 on the passenger side, 1 in front of the driver.
// The rise from x = 0 to 0.3 is the 25-degree wrap of the dash around the centre stack.
const _dashW = x => smooth(0, 0.3, x) * (1 - smooth(0.98, 1.12, x));
// Cross-sections [z, y] at x, listed counter-clockwise seen from +x (forward is -z).
// The upper dash reaches further back in front of the driver and is lower there, under the instrument pod.
function _dashUpper(x) {
  const w = _dashW(x), d = 0.14 * w, top = 2.345 - 0.13 * w, r = top - 0.08 - 2.0;
  return [[-4.90 + d, 2.0], [-5.31, 2.0], [-5.31, top - 0.025], [-5.2, top - 0.005], [-5.05, top], [-4.93 + d, top - 0.01],
    [-4.895 + d, top - 0.035], [-4.877 + d, top - 0.08], [-4.875 + d, 2.0 + r * 0.55], [-4.88 + d, 2.0 + r * 0.25]];
}
function _dashLower(x) {   // the knee panel: hardly any deeper in front of the driver, who needs the room
  const w = _dashW(x), d = 0.03 * w;
  return [[-4.99 + d, 1.455], [-5.31, 1.455], [-5.31, 2.0], [-4.90 + 0.14 * w, 2.0], [-4.93 + d, 1.88], [-4.96 + d, 1.70], [-4.985 + d, 1.55]];
}
// The top of the dash at x (for parts that sit on it).
const dashTop = x => 2.345 - 0.13 * _dashW(x);
function _dashLoft(section) {
  const n = seg(56, 14), rings = [];
  for (let i = 0; i <= n; i++) { const x = -1.16 + 2.32 * i / n; rings.push(section(x).map(([z, y]) => [x, y, z])); }
  // darker toward the floor and under overhangs
  return shade(loft(rings, { capStart: true, capEnd: true }), (x, y, z, nx, ny) => (0.62 + 0.38 * smooth(1.5, 2.3, y)) * (ny < -0.4 ? 0.6 : 1));
}
function cabFloorAndDash(I, S, R) {
  I.part('floor'); S.part('floor');
  I.add(roundBox(2.36, 0.04, 2.08, 0.01), IM.floor, 0, 1.43, -4.2);
  for (const x of [0.55, -0.6]) S.add(roundBox(0.66, 0.012, 0.78, 0.005), IM.mat, x, 1.456, -4.72);
  S.add(roundBox(2.0, 0.012, 0.012, 0.004, 1), IM.ambient, 0, 1.5, -4.945);          // red footwell light along the knee panel

  I.part('dash'); S.part('dash');
  I.add(_dashLoft(_dashUpper), IM.upper);
  I.add(_dashLoft(_dashLower), IM.lower);
  S.add(roundBox(0.9, 0.06, 0.012, 0.004, 1), IM.gloss, -0.705, 2.08, -4.873);        // gloss black band across the passenger dash
  S.add(roundBox(0.9, 0.008, 0.008, 0.003, 1), IM.silver, -0.705, 2.042, -4.874);     // aluminium line under it
  S.add(roundBox(0.6, 0.008, 0.2, 0.004, 1), IM.lower, -0.66, dashTop(-0.66) + 0.002, -5.12);   // storage tray in the dash top

  // instrument pod: a visor over the cluster screen, a housing and a gloss bezel, tilted toward the eye
  I.part('hood'); S.part('hood');
  const visor = [[-4.905, 2.425], [-4.98, 2.43], [-5.08, 2.40], [-5.10, 2.34], [-5.11, 2.40], [-5.04, 2.462], [-4.95, 2.466], [-4.90, 2.45], [-4.895, 2.435]];
  const vn = seg(16, 6), vr = [];
  for (let i = 0; i <= vn; i++) { const x = 0.30 + 0.5 * i / vn; vr.push(visor.map(([z, y]) => [x, y, z])); }
  I.add(shade(loft(vr, { capStart: true, capEnd: true }), (x, y, z, nx, ny) => (ny < -0.3 ? 0.55 : 1)), IM.upper);
  I.add(roundBox(0.48, 0.24, 0.10, 0.02), IM.upper, 0.55, 2.31, -5.10, -0.39, 0, 0);
  S.add(roundBox(0.44, 0.18, 0.012, 0.01), IM.gloss, 0.55, 2.31, -5.046, -0.39, 0, 0);
  R.cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.40, 0.15), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  R.cluster.position.set(0.55, 2.31, -5.037); R.cluster.rotation.x = -0.39; R.shell.add(R.cluster);

  // passenger side: two vents in the dash face, the pull-out table with two cup holders, the ETC unit on the driver's side
  I.part('vents'); S.part('vents');
  for (const x of [-0.95, -0.42]) {
    S.add(roundBox(0.19, 0.085, 0.016, 0.01), IM.silver, x, 2.17, -4.870);
    S.add(roundBox(0.17, 0.068, 0.02, 0.008), IM.black, x, 2.17, -4.868);
    for (let k = 0; k < 3; k++) S.add(roundBox(0.155, 0.007, 0.018, 0.002, 1), IM.lower, x, 2.148 + k * 0.022, -4.862);
  }
  I.part('table'); S.part('table');
  I.add(roundBox(0.58, 0.035, 0.30, 0.012), IM.lower, -0.66, 1.90, -4.76);
  S.add(roundBox(0.58, 0.01, 0.01, 0.003, 1), IM.silver, -0.66, 1.912, -4.612);
  for (const x of [-0.82, -0.70]) S.add(lathe([[0, 0], [0.038, 0], [0.038, 0.012], [0, 0.012]], 20), IM.black, x, 1.912, -4.72);
  I.part('etc'); S.part('etc');
  S.add(roundBox(0.12, 0.035, 0.08, 0.008), IM.black, 0.96, dashTop(0.96) + 0.0175, -5.16);
  S.add(roundBox(0.01, 0.006, 0.004, 0.001, 1), IM.ledGreen, 0.92, dashTop(0.96) + 0.027, -5.119);
  I.part(null); S.part(null);
}

// ---- centre stack: turned 25 degrees toward the driver -------------------------------
function cabCentreStack(I, S, R) {
  const at = [-0.02, 1.98, -4.82], turn = 0.436, tilt = -0.12;
  I.part('centerPanel'); S.part('centerPanel');
  for (const P of [I, S]) { P.push(at[0], at[1], at[2], 0, turn, 0); P.push(0, 0, 0, tilt, 0, 0); }
  I.add(roundBox(0.46, 0.72, 0.12, 0.025), IM.lower, 0, 0, -0.04);
  I.add(roundBox(0.48, 0.03, 0.14, 0.012), IM.upper, 0, 0.36, -0.04);
  S.add(roundBox(0.38, 0.24, 0.02, 0.012), IM.gloss, 0, 0.19, 0.026);              // screen surround
  for (const x of [-0.1, 0.1]) {                                                     // vents under the screen
    S.add(roundBox(0.16, 0.05, 0.016, 0.008), IM.silver, x, 0.035, 0.025);
    S.add(roundBox(0.145, 0.036, 0.018, 0.006), IM.black, x, 0.035, 0.026);
    for (let k = 0; k < 2; k++) S.add(roundBox(0.135, 0.006, 0.016, 0.002, 1), IM.lower, x, 0.025 + k * 0.02, 0.031);
  }
  for (let row = 0; row < 2; row++) for (let k = 0; k < 8; k++) {                     // two rows of switches
    const x = -0.175 + k * 0.05, y = -0.05 - row * 0.055;
    S.add(roundBox(0.036, 0.042, 0.014, 0.004, 1), IM.button, x, y, 0.024);
    if ((row + k) % 3 === 0) S.add(roundBox(0.008, 0.005, 0.004, 0.001, 1), k % 2 ? IM.ledAmber : IM.ledGreen, x, y + 0.014, 0.032);
  }
  const knob = [[0, 0], [0.027, 0], [0.028, 0.012], [0.025, 0.024], [0, 0.026]];      // climate knobs
  for (const x of [-0.13, 0, 0.13]) {
    S.add(lathe(knob, 24), IM.button, x, -0.2, 0.02, Math.PI / 2, 0, 0);
    S.add(lathe([[0.029, 0], [0.03, 0.004], [0.029, 0.008]], 24), IM.silver, x, -0.2, 0.02, Math.PI / 2, 0, 0);
  }
  S.add(roundBox(0.11, 0.022, 0.006, 0.002, 1), IM.lcdAmber, 0, -0.265, 0.022);
  for (const P of [I, S]) P.pop().pop();
  I.part(null); S.part(null);
  // the navigation screen (the game draws on it)
  const g = new THREE.Group(); g.position.set(...at); g.rotation.y = turn;
  const g2 = new THREE.Group(); g2.rotation.x = tilt; g.add(g2);
  R.nav = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.20), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  R.nav.position.set(0, 0.19, 0.037); g2.add(R.nav); R.shell.add(g);
}

// ---- the panel right of the driver: light switch, buttons, parking brake --------------
function cabSidePanel(I, S) {
  I.part('sidePanel'); S.part('sidePanel');
  for (const P of [I, S]) P.push(1.06, 2.06, -4.86, 0, -0.55, 0);
  I.add(roundBox(0.20, 0.28, 0.06, 0.015), IM.lower, 0, 0, 0);
  S.add(lathe([[0, 0], [0.034, 0], [0.036, 0.016], [0.03, 0.03], [0, 0.032]], 24), IM.button, 0.035, 0.07, 0.03, Math.PI / 2, 0, 0);
  S.add(roundBox(0.004, 0.02, 0.004, 0.001, 1), IM.ledGreen, 0.035, 0.088, 0.064);
  for (let k = 0; k < 6; k++) S.add(roundBox(0.034, 0.034, 0.012, 0.004, 1), IM.button, -0.05 + (k % 3) * 0.045, -0.02 - Math.floor(k / 3) * 0.045, 0.034);
  S.add(roundBox(0.03, 0.03, 0.09, 0.008), IM.black, -0.06, -0.11, 0.06);            // parking brake lever
  S.add(roundBox(0.034, 0.012, 0.03, 0.004, 1), IM.silver, -0.06, -0.11, 0.105);
  for (const P of [I, S]) P.pop();
  I.part(null); S.part(null);
}

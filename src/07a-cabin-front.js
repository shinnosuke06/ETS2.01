// ---------------------------------------------------------------------------
// Cab interior, front half: floor, dashboard, instrument hood and screen,
// control panel angled toward the driver, driver's side panel, vents, ETC unit,
// steering wheel and pedals, doors and pillars. Right-hand drive; the driver's
// eye is at (0.55, 2.62, -4.28). Parts go into I (outline parts, also drawn from
// outside) and S (small parts, drawn only from inside); single meshes into
// R.shell or R.fine.
// ---------------------------------------------------------------------------
function buildCabinFront(I, S, R) {
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

  R.cluster = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.215), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  R.cluster.position.set(0.55, 2.165, -5.04); R.cluster.rotation.x = -0.59; R.shell.add(R.cluster);
  R.nav = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.18), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  { const g = new THREE.Group(); g.position.set(-0.03, 1.86, -4.84); g.rotation.y = 0.32; const g2 = new THREE.Group(); g2.rotation.x = -0.1; g.add(g2); R.nav.position.set(0, 0.18, 0.074); g2.add(R.nav); R.shell.add(g); }

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

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

  for (const sx of [-1, 1]) cabDoor(I, S, sx);
  cabPillars(I, S);
  cabWheel(I, R);
  cabPedals(S, R);
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
  S.add(roundBox(0.11, 0.022, 0.006, 0.002, 1), IM.ledAmber, 0, -0.265, 0.022);
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

// ---- doors and pillars -------------------------------------------------------------------
// A flat outline [[z, y], ...] made into a door-card panel `thick` deep, standing at x0 and reaching toward +x.
function _sideCard(zy, thick, bevel = 0.006) {
  const g = panel(zy.map(([z, y]) => [-z, y]), thick, bevel);
  return xform(g, 0, 0, 0, 0, Math.PI / 2, 0);   // outline x -> -z, extrusion -> +x
}
// Door trim following the door window (inner glass outline: sill at y 2.32, dropping to 2.12 at the front).
function cabDoor(I, S, sx) {
  const name = sx > 0 ? 'doorR' : 'doorL', xin = sx * 1.125, x0 = sx > 0 ? 1.125 : -1.17;   // inner face, and the card's -x side
  I.part(name); S.part(name);
  // the card's top runs 1.5 cm above the glass's lower edge, so no gap opens between them
  I.add(_sideCard([[-5.22, 1.47], [-4.16, 1.47], [-4.16, 2.335], [-4.76, 2.335], [-4.88, 2.135], [-5.14, 2.135], [-5.22, 2.03]], 0.045), IM.upper, x0, 0, 0);
  I.add(_sideCard([[-4.99, 3.13], [-4.16, 3.13], [-4.16, 3.78], [-4.92, 3.78]], 0.04), IM.upper, sx > 0 ? 1.13 : -1.17, 0, 0);   // above the window, overlapping its top
  // sill along the window line
  S.add(tube([[sx * 1.135, 2.14, -5.15], [sx * 1.135, 2.14, -4.88], [sx * 1.135, 2.34, -4.76], [sx * 1.135, 2.34, -4.16]], 0.016, 8), IM.lower);
  // armrest with a leather top, door pull, window switches on the driver's side
  I.add(roundBox(0.08, 0.05, 0.42, 0.018), IM.lower, sx * 1.095, 2.09, -4.50);
  S.add(roundBox(0.07, 0.014, 0.38, 0.006), IM.seatPlain, sx * 1.093, 2.118, -4.50);
  S.add(roundBox(0.025, 0.03, 0.13, 0.008), IM.silver, sx * 1.105, 2.20, -4.76);
  if (sx > 0) for (let k = 0; k < 4; k++) S.add(roundBox(0.02, 0.008, 0.028, 0.003, 1), IM.button, sx * 1.08, 2.128, -4.66 + k * 0.035);
  // speaker grille low on the door, pocket, red courtesy light along the bottom
  S.add(lathe([[0, 0], [0.075, 0], [0.075, 0.012], [0, 0.014]], 24), IM.black, xin - sx * 0.001, 1.72, -4.95, 0, 0, sx * Math.PI / 2);
  S.add(lathe([[0.072, 0], [0.08, 0.004], [0.072, 0.008]], 24), IM.silver, xin - sx * 0.002, 1.72, -4.95, 0, 0, sx * Math.PI / 2);
  I.add(roundBox(0.06, 0.15, 0.55, 0.015), IM.lower, sx * 1.10, 1.60, -4.60);
  S.add(roundBox(0.012, 0.012, 0.9, 0.004, 1), IM.ambient, sx * 1.12, 1.5, -4.62);
  I.part(null); S.part(null);
}
function cabPillars(I, S) {
  I.part('pillars'); S.part('pillars');
  for (const sx of [-1, 1]) {
    // A-pillar trim: meets the windscreen's wrapped corner and overlaps the door window's front edge. On the
    // passenger side the overlap is 2 cm, no more, so the driver still sees all of that mirror past it.
    const d = sx < 0 ? 0.25 : 0.30;
    I.add(roundBox(0.07, 1.05, d, 0.03), IM.upper, sx * 1.14, 2.83, -5.25 + d / 2, 0.153, 0, 0);
    I.add(roundBox(0.07, 2.30, 0.13, 0.025), IM.upper, sx * 1.15, 2.62, -4.12);                // B-pillar behind the door
  }
  I.add(roundBox(2.30, 0.10, 0.08, 0.02), IM.upper, 0, 3.31, -5.15);                          // windscreen header
  S.add(roundBox(2.2, 0.01, 0.01, 0.004, 1), IM.silver, 0, 3.26, -5.11);
  I.part('grabs'); S.part('grabs');
  for (const sx of [-1, 1]) S.add(tube([[sx * 1.13, 1.95, -4.22], [sx * 1.09, 2.0, -4.22], [sx * 1.09, 2.65, -4.22], [sx * 1.13, 2.70, -4.22]], 0.014, 10), IM.silver);
  I.part(null); S.part(null);
}

// ---- steering wheel, column and stalks, pedals ------------------------------------------------
// The wheel frame wf: axis points up and toward the driver. R.wheel turns inside it.
function cabWheel(I, R) {
  const wf = new THREE.Group(); wf.position.set(0.55, 2.03, -4.64); wf.rotation.x = -0.96; wf.updateMatrix(); R.shell.add(wf);
  I.part('stalks'); I.push(0.55, 2.03, -4.64, -0.96, 0, 0);                                     // column and stalks: fixed, so they join the cab's parts
  I.add(roundBox(0.12, 0.11, 0.36, 0.03), IM.lower, 0, -0.01, -0.23);                         // column shroud
  for (const sx of [-1, 1]) {
    I.add(tube([[sx * 0.06, 0.02, -0.085], [sx * 0.13, 0.025, -0.09], [sx * 0.21, 0.03, -0.095]], 0.009, 8), IM.black);
    I.add(roundBox(0.03, 0.022, 0.022, 0.008), IM.black, sx * 0.215, 0.03, -0.095);
  }
  I.pop(); I.part(null);
  R.wheel = new THREE.Group(); wf.add(R.wheel);
  const SW = new Parts(), N = seg(48, 16), ring = [];
  for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; ring.push([0.208 * Math.cos(a), 0.208 * Math.sin(a), 0]); }
  SW.part('wheel', wf.matrix);
  SW.add(tube(ring, 0.017, 10, true), IM.seatPlain);                                         // rim: 0.45 across
  SW.add(lathe([[0, 0], [0.07, 0], [0.085, 0.03], [0.07, 0.06], [0, 0.065]], 24), IM.black, 0, 0, -0.06, Math.PI / 2, 0, 0);   // hub
  SW.add(roundBox(0.16, 0.12, 0.045, 0.02), IM.seatPlain, 0, 0, 0.012);                    // centre pad, plain
  for (const sx of [-1, 1]) {
    SW.add(roundBox(0.12, 0.07, 0.025, 0.012), IM.lower, sx * 0.13, -0.01, -0.005);       // side spokes with four buttons each
    for (let k = 0; k < 4; k++) SW.add(roundBox(0.018, 0.014, 0.008, 0.003, 1), IM.button, sx * (0.11 + (k % 2) * 0.028), 0.0 - Math.floor(k / 2) * 0.022, 0.009);
    SW.add(roundBox(0.12, 0.005, 0.005, 0.002, 1), IM.silver, sx * 0.13, -0.046, 0.008);
  }
  SW.add(roundBox(0.05, 0.13, 0.022, 0.01), IM.lower, 0, -0.13, -0.008);                  // lower spoke
  SW.part(null); SW.build(R.wheel, { cast: true, receive: true });
  R.wheelFrame = wf;
}
function cabPedals(S, R) {
  R.gas = new THREE.Group(); R.gas.position.set(0.72, 1.47, -5.0); R.gas.updateMatrix(); R.fine.add(R.gas);
  const G = new Parts(); G.part('pedals', R.gas.matrix);
  G.add(roundBox(0.085, 0.26, 0.016, 0.006), IM.black, 0, 0.13, 0);
  G.add(roundBox(0.075, 0.22, 0.006, 0.003, 1), IM.mat, 0, 0.13, 0.009);
  G.part(null); G.build(R.gas, { cast: true });
  R.brake = new THREE.Group(); R.brake.position.set(0.42, 1.98, -4.98); R.brake.updateMatrix(); R.fine.add(R.brake);
  const B = new Parts(); B.part('pedals', R.brake.matrix);
  B.add(tube([[0, 0, 0], [0, -0.30, 0.02]], 0.014, 8), IM.silver);
  B.add(roundBox(0.14, 0.09, 0.02, 0.008), IM.black, 0, -0.34, 0.03);
  B.part(null); B.build(R.brake, { cast: true });
  S.part('pedals');
  S.add(roundBox(0.12, 0.05, 0.22, 0.01), IM.lower, 0.22, 1.50, -4.92, -0.5, 0, 0);       // footrest
  S.part(null);
}

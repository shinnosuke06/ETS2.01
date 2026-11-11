// ---------------------------------------------------------------------------
// Cab interior, back half: seats, centre console, bed and drawers, rear wall,
// overhead cabinets and ceiling, sun visors, curtains, small items and the
// omamori charm that swings. buildInterior puts the whole cab together.
// ---------------------------------------------------------------------------
function buildCabinRear(I, S, R) {
  // side walls behind the doors and the tied-back curtains (to be rebuilt with the back of the cab)
  for (const sx of [-1, 1]) {
    I.box(IM.head, 0.05, 2.36, 0.95, sx * 1.165, 2.62, -3.63);
    for (let k = 0; k < 3; k++) I.add(new THREE.CylinderGeometry(0.045, 0.05, 0.98, 8), IM.curtain, sx * (1.06 - k * 0.04), 2.78, -5.13 + k * 0.035, 0.164, 0, 0);
    for (let k = 0; k < 2; k++) I.add(new THREE.CylinderGeometry(0.055, 0.06, 1.15, 8), IM.curtain, sx * (1.07 - k * 0.05), 2.95, -4.06 + k * 0.03);
    S.box(IM.black, 0.13, 0.03, 0.1, sx * 1.07, 2.7, -4.05);
  }
  cabConsole(I, S);
  cabSeat(I, S, 0.55, 1, 'seatD');
  cabSeat(I, S, -0.6, -1, 'seatP');

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

  // sun visors: the driver's is down against the afternoon sun
  I.box(IM.cabinet, 0.86, 0.022, 0.3, 0.55, 3.166, -5.06, 1.1, 0, 0);
  I.box(IM.cabinet, 0.86, 0.022, 0.3, -0.55, 3.285, -4.99, 0.15, 0, 0);
  // fire extinguisher by the passenger seat, footrest
  S.add(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 14), IM.red, -1.0, 1.63, -4.25);
  S.box(IM.black, 0.06, 0.05, 0.05, -1.0, 1.83, -4.25);


  // omamori charm hanging from the overhead console
  R.charm = new THREE.Group(); R.charm.position.set(0.08, 3.33, -4.66); R.fine.add(R.charm);
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.1, 0.002).translate(0, -0.05, 0), IM.gold));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.008).translate(0, -0.128, 0), IM.red));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.009).translate(0, -0.112, 0), IM.gold));
  R.charmState = { ax: 0, vx: 0, az: 0, vz: 0 };
}


// ---- seats: tall one-piece leather seats ---------------------------------------------------
// Rings for a cushion lofted front to back (along +z): [x, y] across the seat at height `top` (centre)
// and `bol` (side bolsters), listed counter-clockwise seen from behind.
function _cushionRing(hw, base, top, bol) {
  return [[-hw + 0.01, base], [hw - 0.01, base], [hw, base + 0.03], [hw, bol - 0.02], [hw - 0.015, bol], [hw - 0.05, bol],
    [hw - 0.07, top + 0.01], [0.1, top], [0, top], [-0.1, top], [-hw + 0.07, top + 0.01], [-hw + 0.05, bol], [-hw + 0.015, bol], [-hw, bol - 0.02], [-hw, base + 0.03]];
}
// Rings for the backrest lofted bottom to top (along +y), in the back's own frame: [x, z], front face toward -z.
// b: how far the side bolsters stand out in front (0.04 at the hips and shoulders).
function _backRing(hw, b, t) {
  return [[hw, t], [hw, -0.01], [hw - 0.015, -b], [hw - 0.06, -b], [hw - 0.08, -0.004], [0.1, -0.008], [0, -0.01], [-0.1, -0.008],
    [-hw + 0.08, -0.004], [-hw + 0.06, -b], [-hw + 0.015, -b], [-hw, -0.01], [-hw, t], [-hw + 0.06, t + 0.025], [0, t + 0.035], [hw - 0.06, t + 0.025]];
}
const _insertRing = (hw, z) => [[hw, z + 0.02], [hw, z], [0, z - 0.004], [-hw, z], [-hw, z + 0.02], [0, z + 0.024]];
// x: seat centre; side: +1 for the driver (door on the right), -1 for the passenger. name: part record.
function cabSeat(I, S, x, side, name) {
  I.part(name); S.part(name);
  // pedestal: base plate, bellows, top frame
  I.add(roundBox(0.40, 0.06, 0.42, 0.015), IM.black, x, 1.48, -4.12);
  I.add(lathe([[0.15, 0], [0.13, 0.03], [0.15, 0.06], [0.13, 0.09], [0.15, 0.12], [0.13, 0.15], [0.15, 0.18]], 20), IM.black, x, 1.52, -4.12);
  I.add(roundBox(0.46, 0.06, 0.46, 0.015), IM.black, x, 1.74, -4.12);
  // cushion: plain body with raised side bolsters, stitched centre insert
  const n = seg(10, 4), cz = [], ins = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, z = -4.40 + 0.48 * t, lip = 1 - smooth(0, 0.18, t);         // the front edge rolls down
    cz.push(_cushionRing(0.26, 1.77, 1.85 - 0.05 * lip, 1.89 - 0.05 * lip).map(([px, y]) => [x + px, y, z]));
    if (t > 0.08 && t < 0.92) ins.push(_insertRing(0.17, 0).map(([px, dz]) => [x + px, 1.85 - 0.05 * lip - dz + 0.012, z]));
  }
  I.add(loft(cz, { capStart: true, capEnd: true }), IM.seatPlain);
  I.add(loft(ins.map(r => r.map(([px, y, z]) => [px, y, z])), { capStart: true, capEnd: true }), IM.seat);
  // backrest with integrated head part, reclined 9 degrees
  for (const P of [I, S]) P.push(x, 1.90, -3.92, 0.16, 0, 0);
  const m = seg(16, 6), br = [], bi = [];
  for (let i = 0; i <= m; i++) {
    const s = i / m, y = 1.0 * s;
    const hw = 0.26 - 0.09 * smooth(0.76, 0.86, s) - 0.05 * smooth(0.95, 1, s);    // narrower head part, rounded top
    const b = 0.04 * (1 - smooth(0.36, 0.45, s) + smooth(0.48, 0.56, s) - smooth(0.74, 0.80, s)) + 0.015;
    const tTop = 0.08 - 0.04 * smooth(0.95, 1, s);
    br.push(_backRing(hw, b, tTop).map(([px, z]) => [px, y, z]));
    if ((s > 0.05 && s < 0.74) || (s > 0.86 && s < 0.96)) bi.push({ s, ring: _insertRing(hw - 0.09, -0.012).map(([px, z]) => [px, y, z]) });
  }
  const back = loft(br, { capStart: true, capEnd: true });
  statPart(name + 'Back', I.add(back, IM.seatPlain));                              // also recorded on its own: must stay behind the eye
  for (const span of [bi.filter(r => r.s < 0.8), bi.filter(r => r.s > 0.8)]) if (span.length > 1) {
    const g = loft(span.map(r => r.ring), { capStart: true, capEnd: true });
    statPart(name + 'Back', I.add(g, IM.seat));
  }
  for (const P of [I, S]) P.pop();
  // armrests: the driver's on the inside, the passenger's on both sides
  for (const o of side > 0 ? [-1] : [-1, 1]) I.add(roundBox(0.06, 0.05, 0.34, 0.02), IM.seatPlain, x + o * 0.30, 2.12, -4.05);
  I.part(null); S.part(null);
  // seat belt down the outer side of the back, buckle on the inside of the cushion
  I.part('belts'); S.part('belts');
  const xo = x + side * 0.27, xi = x - side * 0.28;
  S.add(sweep([[-0.022, -0.002], [0.022, -0.002], [0.022, 0.002], [-0.022, 0.002]], [{ p: [xo, 2.82, -3.80] }, { p: [xo + side * 0.005, 2.35, -3.86] }, { p: [xo, 1.95, -3.95] }], { closed: true, up: [1, 0, 0], capStart: true, capEnd: true }), IM.black);
  S.add(roundBox(0.03, 0.06, 0.02, 0.006, 1), IM.silver, xo, 1.93, -3.96);
  S.add(roundBox(0.035, 0.08, 0.03, 0.008, 1), IM.black, xi, 1.93, -3.98);
  I.part(null); S.part(null);
}
// ---- centre console between the seats: two cup holders, a tray, a lidded box --------------------------
function cabConsole(I, S) {
  I.part('console'); S.part('console');
  I.add(roundBox(0.40, 0.48, 0.66, 0.04), IM.lower, -0.025, 1.70, -4.50);
  S.add(roundBox(0.28, 0.006, 0.14, 0.003, 1), IM.black, -0.025, 1.943, -4.72);                // tray
  for (const x of [-0.11, 0.06]) {                                                              // cup holders
    S.add(lathe([[0.042, 0], [0.045, 0.004], [0.042, 0.008]], 20), IM.silver, x, 1.938, -4.47);
    S.add(lathe([[0, 0], [0.041, 0], [0.041, 0.004], [0, 0.004]], 20), IM.black, x, 1.939, -4.47);
  }
  S.add(lathe([[0, 0], [0.033, 0], [0.033, 0.12], [0.03, 0.13], [0, 0.13]], 16), IM.can, -0.11, 1.90, -4.47);
  I.add(roundBox(0.36, 0.03, 0.22, 0.012), IM.leather, -0.025, 1.955, -4.27);                  // lid
  S.add(roundBox(0.30, 0.006, 0.006, 0.002, 1), IM.silver, -0.025, 1.94, -4.165);
  I.part(null); S.part(null);
}

// The cab interior inside the tractor's cab group. Returns the parts the game moves or reads:
// cluster, nav (screens), wheel, gas, brake, charm, charmState, eye, and group / shell / fine
// (everything, the parts seen from outside, the parts seen only from the driver's seat).
function buildInterior(T) {
  const cab = T.cab, R = {};
  R.group = new THREE.Group(); R.shell = new THREE.Group(); R.fine = new THREE.Group();
  R.group.add(R.shell, R.fine); cab.add(R.group);
  const I = new Parts(), S = new Parts();
  buildCabinFront(I, S, R);
  buildCabinRear(I, S, R);
  I.build(R.shell, { cast: true, receive: true });
  S.build(R.fine, { cast: false, receive: true });
  R.eye = new THREE.Object3D(); R.eye.position.set(0.55, 2.62, -4.28); cab.add(R.eye);
  fillVertexColors(R.group);
  return R;
}

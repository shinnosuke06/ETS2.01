// ---------------------------------------------------------------------------
// Cab interior, back half: seats, centre console, bed and drawers, rear wall,
// overhead cabinets and ceiling, sun visors, curtains, small items and the
// omamori charm that swings. buildInterior puts the whole cab together.
// ---------------------------------------------------------------------------
function buildCabinRear(I, S, R) {
  // centre console between the seats: cup holders, phone tray, storage
  I.box(IM.lower, 0.36, 0.3, 0.52, -0.03, 1.62, -4.56);
  I.box(IM.lower, 0.38, 0.03, 0.54, -0.03, 1.785, -4.56);
  S.box(IM.silver, 0.38, 0.012, 0.012, -0.03, 1.79, -4.297);
  for (const x of [-0.11, 0.04]) S.add(new THREE.CylinderGeometry(0.041, 0.041, 0.012, 16), IM.black, x, 1.801, -4.45);
  S.add(new THREE.CylinderGeometry(0.033, 0.033, 0.12, 16), IM.can, -0.11, 1.86, -4.45);
  S.add(new THREE.CylinderGeometry(0.03, 0.033, 0.01, 16), IM.metal, -0.11, 1.925, -4.45);
  S.box(IM.black, 0.26, 0.006, 0.13, -0.03, 1.802, -4.66);
  S.box(IM.black, 0.28, 0.006, 0.006, -0.03, 1.6, -4.299);

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

  // sun visors: the driver's is down against the afternoon sun
  I.box(IM.cabinet, 0.86, 0.022, 0.3, 0.55, 3.166, -5.06, 1.1, 0, 0);
  I.box(IM.cabinet, 0.86, 0.022, 0.3, -0.55, 3.285, -4.99, 0.15, 0, 0);
  // fire extinguisher by the passenger seat, footrest
  S.add(new THREE.CylinderGeometry(0.06, 0.06, 0.36, 14), IM.red, -1.0, 1.63, -4.25);
  S.box(IM.black, 0.06, 0.05, 0.05, -1.0, 1.83, -4.25);
  S.box(IM.lower, 0.12, 0.05, 0.22, 0.22, 1.5, -4.92, -0.5, 0, 0);


  // omamori charm hanging from the overhead console
  R.charm = new THREE.Group(); R.charm.position.set(0.08, 3.33, -4.66); R.fine.add(R.charm);
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.1, 0.002).translate(0, -0.05, 0), IM.gold));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.008).translate(0, -0.128, 0), IM.red));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.009).translate(0, -0.112, 0), IM.gold));
  R.charmState = { ax: 0, vx: 0, az: 0, vz: 0 };
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

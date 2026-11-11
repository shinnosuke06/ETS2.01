// ---------------------------------------------------------------------------
// Cab interior, back half: seats, centre console, bed and drawers, rear wall,
// overhead cabinets and ceiling, sun visors, curtains, small items and the
// omamori charm that swings. buildInterior puts the whole cab together.
// ---------------------------------------------------------------------------
function buildCabinRear(I, S, R) {
  cabConsole(I, S);
  cabSeat(I, S, 0.55, 1, 'seatD');
  cabSeat(I, S, -0.6, -1, 'seatP');

  cabShelf(I, S);
  cabVisors(I);
  cabCeiling(I, S);
  cabBed(I, S);
  cabCurtains(I, S);
  cabSmall(I, S);

  // omamori charm hanging from the overhead console
  R.charm = new THREE.Group(); R.charm.position.set(0.08, 3.30, -4.66); R.fine.add(R.charm);
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.1, 0.002).translate(0, -0.05, 0), IM.ledAmber));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.052, 0.008).translate(0, -0.128, 0), IM.red));
  R.charm.add(new THREE.Mesh(new THREE.BoxGeometry(0.037, 0.008, 0.009).translate(0, -0.112, 0), IM.ledAmber));
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
  I.add(roundBox(0.36, 0.03, 0.22, 0.012), IM.seatPlain, -0.025, 1.955, -4.27);                  // lid
  S.add(roundBox(0.30, 0.006, 0.006, 0.002, 1), IM.silver, -0.025, 1.94, -4.165);
  I.part(null); S.part(null);
}


// ---- the sleeping area and everything overhead -------------------------------------------------------
// A section [z, y] lofted across the cab from x0 to x1 (sections listed counter-clockwise seen from +x).
function _acrossCab(zy, x0, x1, n) {
  const rings = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (x1 - x0) * i / n; rings.push(zy.map(([z, y]) => [x, y, z])); }
  return loft(rings, { capStart: true, capEnd: true });
}
// Above the windscreen: three lockers, two device slots, reading lamps and a red light strip underneath.
function cabShelf(I, S) {
  I.part('shelf'); S.part('shelf');
  const sec = [[-4.62, 3.40], [-4.66, 3.35], [-4.75, 3.32], [-5.05, 3.32], [-5.14, 3.36], [-5.16, 3.45], [-5.16, 3.79], [-4.60, 3.79], [-4.60, 3.45]];
  I.add(shade(_acrossCab(sec, -1.12, 1.12, 1), (x, y, z, nx, ny) => (ny < -0.5 ? 0.7 : 1)), IM.cabinet);
  for (const x of [-0.72, 0, 0.72]) {
    S.add(roundBox(0.68, 0.30, 0.014, 0.008), IM.cabinet, x, 3.62, -4.594);
    S.add(roundBox(0.12, 0.012, 0.012, 0.004, 1), IM.silver, x, 3.50, -4.585);
  }
  for (const x of [0.35, -0.12]) {
    S.add(roundBox(0.20, 0.006, 0.06, 0.003, 1), IM.gloss, x, 3.317, -4.80);
    S.add(roundBox(0.08, 0.004, 0.02, 0.001, 1), IM.ledGreen, x - 0.04, 3.315, -4.80);
  }
  for (const x of [-0.85, 0.85]) S.add(roundBox(0.10, 0.01, 0.05, 0.004, 1), IM.silver, x, 3.316, -4.72);
  S.add(roundBox(2.1, 0.008, 0.012, 0.003, 1), IM.ambient, 0, 3.316, -4.66);
  I.part(null); S.part(null);
}
function cabVisors(I) {
  I.part('visors');
  I.add(roundBox(0.80, 0.28, 0.022, 0.01), IM.cabinet, 0.55, 3.16, -5.08, -0.25, 0, 0);       // driver's, down
  I.add(roundBox(0.80, 0.022, 0.28, 0.01), IM.cabinet, -0.55, 3.30, -4.98);                   // passenger's, up
  I.part(null);
}
// The headlining follows the roof's gentle arch; roof hatch and two dome lights.
function cabCeiling(I, S) {
  I.part('ceiling'); S.part('ceiling');
  const n = seg(16, 6), arch = [];
  for (let i = 0; i <= n; i++) { const x = -1.17 + 2.34 * i / n; arch.push([x, 3.79 + 0.055 * (1 - (x / 1.17) ** 2)]); }
  const ring = [...arch.map(([x, y]) => [x, y - 0.02]), ...arch.slice().reverse().map(([x, y]) => [x, y])];
  const rings = []; for (const z of [-5.10, -4.6, -4.1, -3.6, -3.20]) rings.push(ring.map(([x, y]) => [x, y, z]));
  I.add(loft(rings, { capStart: true, capEnd: true }), IM.head);
  I.add(roundBox(0.66, 0.025, 0.66, 0.03), IM.cabinet, 0, 3.80, -4.05);                     // roof hatch
  for (const x of [-0.5, 0.5]) S.add(roundBox(0.12, 0.012, 0.07, 0.01), IM.silver, x, 3.79, -4.40);
  I.part(null); S.part(null);
}
// Bed with a rounded mattress, the drawers under it (the middle one a fridge), the rear wall with its
// panel, screen and lamps, three lockers above, the side walls of the sleeper.
function cabBed(I, S) {
  I.part('bed');
  I.add(roundBox(2.30, 0.15, 0.62, 0.04), IM.mattress, 0, 2.055, -3.50);
  I.add(roundBox(2.32, 0.05, 0.04, 0.01), IM.lower, 0, 1.985, -3.81);
  I.part('drawers'); S.part('drawers');
  I.add(roundBox(2.30, 0.48, 0.04, 0.01), IM.drawer, 0, 1.72, -3.82);
  for (const [x, fridge] of [[-0.76, false], [0, true], [0.76, false]]) {
    S.add(roundBox(0.72, 0.40, 0.02, 0.012), fridge ? IM.lower : IM.drawer, x, 1.71, -3.845);
    S.add(roundBox(0.22, 0.025, 0.02, 0.008), fridge ? IM.silver : IM.black, x, 1.87, -3.858);
  }
  I.part('rearWall'); S.part('rearWall');
  I.add(roundBox(2.36, 1.70, 0.04, 0.01), IM.head, 0, 2.95, -3.175);
  for (const sx of [-1, 1]) I.add(roundBox(0.04, 1.70, 0.92, 0.01), IM.head, sx * 1.16, 2.95, -3.65);
  S.add(roundBox(0.5, 0.30, 0.03, 0.01), IM.gloss, -0.55, 2.62, -3.20);                       // screen
  S.add(roundBox(0.14, 0.20, 0.025, 0.008), IM.black, 0.78, 2.52, -3.20);                     // control panel
  S.add(roundBox(0.09, 0.055, 0.004, 0.001, 1), IM.lcdBlue, 0.78, 2.56, -3.186);
  for (let k = 0; k < 3; k++) S.add(roundBox(0.025, 0.02, 0.01, 0.003, 1), IM.button, 0.75 + k * 0.03, 2.46, -3.186);
  for (const x of [-0.95, 0.95]) S.add(roundBox(0.10, 0.05, 0.04, 0.01), IM.black, x, 2.95, -3.21);
  S.add(roundBox(2.2, 0.01, 0.01, 0.003, 1), IM.ambient, 0, 3.195, -3.60);
  I.part('lockers'); S.part('lockers');
  I.add(_acrossCab([[-3.19, 3.20], [-3.55, 3.20], [-3.62, 3.28], [-3.62, 3.78], [-3.19, 3.78]], -1.10, 1.10, 1), IM.cabinet);
  for (const x of [-0.74, 0, 0.74]) {
    S.add(roundBox(0.70, 0.46, 0.012, 0.008), IM.cabinet, x, 3.52, -3.627);
    S.add(roundBox(0.14, 0.012, 0.012, 0.004, 1), IM.silver, x, 3.31, -3.636);
  }
  I.part(null); S.part(null);
}
// Curtains tied back at the pillars behind the doors: folded columns with a strap at the waist.
function cabCurtains(I, S) {
  I.part('curtains'); S.part('curtains');
  const k = seg(18, 10), n = seg(14, 5);
  for (const sx of [-1, 1]) {
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = 1.95 + 1.75 * t, w = 0.65 + 0.35 * Math.abs(t - 0.45) / 0.55;   // gathered at the strap
      rings.push(Array.from({ length: k }, (_, j) => { const a = j / k * Math.PI * 2, r = (0.055 + 0.012 * Math.sin(6 * a)) * w; return [sx * 1.08 + r * Math.cos(a), y, -4.04 - r * Math.sin(a)]; }));
    }
    I.add(loft(rings, { capStart: true, capEnd: true, crease: 75 }), IM.curtain);
    S.add(roundBox(0.11, 0.035, 0.10, 0.015), IM.black, sx * 1.08, 2.74, -4.04);
  }
  I.part(null); S.part(null);
}
// Fire extinguisher by the passenger seat, a pillow and a folded blanket on the bed.
function cabSmall(I, S) {
  I.part('small'); S.part('small');
  S.add(lathe([[0, 0], [0.06, 0], [0.06, 0.32], [0.04, 0.35], [0, 0.36]], 16), IM.red, -1.0, 1.45, -4.25);
  S.add(roundBox(0.06, 0.05, 0.05, 0.01), IM.black, -1.0, 1.83, -4.25);
  I.add(roundBox(0.50, 0.10, 0.34, 0.045), IM.head, -0.85, 2.18, -3.42);
  I.add(roundBox(0.60, 0.08, 0.40, 0.03), IM.can, 0.72, 2.17, -3.42);
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

// ---------------------------------------------------------------------------
// The job trailers: a 13.6 m box van and a 3-axle tanker. Materials are in
// 06b-materials.js. Local frame: -Z forward, +X right, +Y up.
// ---------------------------------------------------------------------------
// ---- trailers -------------------------------------------------------------------
// Both builders return { root, body, legs, blinkL, blinkR, tail, rev, spin }. root's origin is the
// ground under the kingpin. body is what leans in a corner; axles, wheels and legs hang off root.
// legs.position.y: 0 = feet on the ground, 0.45 = wound up.
function trailerLegs(root, z) {
  const fixed = new Parts(), moving = new Parts();
  for (const sx of [-1, 1]) {
    fixed.box(TM.dark, 0.14, 0.62, 0.14, sx * 0.85, 1.02, z);          // outer leg housing
    moving.box(TM.alu, 0.09, 0.8, 0.09, sx * 0.85, 0.44, z);           // inner leg
    moving.box(TM.dark, 0.3, 0.05, 0.3, sx * 0.85, 0.025, z);          // foot
  }
  fixed.box(TM.dark, 1.7, 0.06, 0.06, 0, 1.05, z);
  fixed.build(root, { cast: true });
  const legs = new THREE.Group(); root.add(legs);
  moving.build(legs, { cast: true });
  return legs;
}
function trailerRearLamps(R, root, z) {
  for (const sx of [-1, 1]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.04), TM.redDim); tl.position.set(sx * 0.9, 1.1, z); root.add(tl); R.tail.push(tl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.04), TM.amberOff); bl.position.set(sx * 0.6, 1.1, z); root.add(bl); (sx < 0 ? R.blinkL : R.blinkR).push(bl);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), TM.white); rv.position.set(sx * 0.42, 1.1, z); root.add(rv); R.rev.push(rv);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), PLATE_MAT);
  plate.position.set(0, 0.92, z + 0.01); root.add(plate);
}
function trailerShell() {
  const R = { blinkL: [], blinkR: [], tail: [], rev: [], spin: [] };
  R.root = new THREE.Group(); R.root.rotation.order = 'YXZ';
  R.body = new THREE.Group(); R.root.add(R.body);
  return R;
}

function buildTrailer() {   // 13.6 m box van
  const R = trailerShell(), root = R.root;
  const B = new Parts();   // leans with the load
  B.box(TM.trailerBody, 2.49, 2.5, 13.6, 0, 2.55, 5.6);
  B.box(TM.alu, 2.52, 0.08, 13.62, 0, 3.8, 5.6);
  B.box(TM.alu, 2.52, 0.18, 13.62, 0, 1.26, 5.6);
  for (const sx of [-1, 1]) for (const z of [-1.2, 12.4]) B.box(TM.alu, 0.08, 2.56, 0.08, sx * 1.25, 2.55, z);
  B.box(TM.dark, 2.5, 0.12, 0.08, 0, 1.38, 12.43);
  B.box(TM.dark, 2.5, 0.12, 0.08, 0, 3.72, 12.43);
  B.box(TM.black, 0.02, 2.35, 0.01, 0, 2.55, 12.442);
  for (const x of [-0.9, -0.3, 0.3, 0.9]) B.add(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 6), TM.chrome, x, 2.55, 12.46);
  B.build(R.body, { cast: true });
  const P = new Parts();   // running gear
  for (const sx of [-1, 1]) {
    P.box(TM.frame, 0.12, 0.32, 12.6, sx * 0.52, 1.0, 6.0);
    P.box(TM.dark, 0.05, 0.06, 4.6, sx * 1.18, 0.78, 4.4);
    P.box(TM.dark, 0.05, 0.06, 4.6, sx * 1.18, 0.48, 4.4);
    for (const z of [2.3, 3.8, 5.3, 6.5]) P.box(TM.dark, 0.08, 0.5, 0.06, sx * 1.16, 0.85, z);
    P.box(TM.black, 0.62, 0.05, 4.1, sx * 0.95, 1.13, 8.3);
    P.box(TM.black, 0.6, 0.45, 0.02, sx * 0.95, 0.85, 10.45);
  }
  P.box(TM.dark, 2.3, 0.15, 0.12, 0, 0.55, 12.28);
  for (const sx of [-0.8, 0.8]) P.box(TM.dark, 0.08, 0.55, 0.08, sx, 0.85, 12.2);
  P.box(TM.dark, 2.3, 0.18, 0.1, 0, 1.1, 12.42);
  P.box(TM.dark, 0.25, 0.05, 0.35, 0, 1.05, -0.2); // kingpin plate
  P.build(root, { cast: true });
  R.legs = trailerLegs(root, 1.8);

  // Japanese-style amber side marker lamps
  const Mk = new Parts();
  for (const sx of [-1, 1]) for (let z = 0; z <= 12; z += 1.5) Mk.box(TM.marker, 0.03, 0.06, 0.1, sx * 1.27, 1.22, z);
  Mk.build(R.body);
  for (const sx of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.15), LOGO_MAT);
    logo.position.set(sx * 1.252, 2.62, 5.4); logo.rotation.y = sx * Math.PI / 2; R.body.add(logo);
  }
  trailerRearLamps(R, root, 12.49);
  for (const z of [7.0, 8.3, 9.6]) for (const sx of [-1, 1]) {
    const w = makeWheel(true, sx); w.position.set(sx * 0.92, 0.52, z); root.add(w); R.spin.push(w);
  }
  return R;
}

function buildTankTrailer() {   // 3-axle food-grade tanker: no baffles, so the liquid moves
  const R = trailerShell(), root = R.root;
  const B = new Parts();
  const RX0 = 1.225, RY0 = 0.95, LEN = 10.2, ZC = 4.2, YC = 2.32;        // elliptical barrel: 2.45 m wide, 1.9 m high
  const barrel = new THREE.CylinderGeometry(1, 1, LEN, 32, 1, true);
  B.add(barrel, TM.tank, 0, YC, ZC, Math.PI / 2, 0, 0, RX0, 1, RY0);       // scale is applied before the turn onto the z axis
  for (const s of [-1, 1]) {                                               // dished ends
    const end = new THREE.SphereGeometry(1, 24, 12, 0, TAU, 0, Math.PI / 2);
    B.add(end, TM.tank, 0, YC, ZC + s * LEN / 2, s * Math.PI / 2, 0, 0, RX0, 0.32, RY0);
  }
  for (const z of [-0.2, 2.0, 4.2, 6.4, 8.6]) B.add(new THREE.CylinderGeometry(1, 1, 0.07, 32, 1, true), TM.chrome, 0, YC, z, Math.PI / 2, 0, 0, RX0 * 1.012, 1, RY0 * 1.012);
  // walkway on top with a handrail, and three manholes
  B.box(TM.chequer, 0.5, 0.04, 8.6, 0.42, YC + RY0 + 0.03, ZC);
  for (let z = 0.2; z <= 8.2; z += 2) B.add(new THREE.CylinderGeometry(0.014, 0.014, 0.5, 6), TM.alu, 0.7, YC + RY0 + 0.28, z);
  B.add(new THREE.CylinderGeometry(0.016, 0.016, 8.2, 6), TM.alu, 0.7, YC + RY0 + 0.53, ZC, Math.PI / 2, 0, 0);
  for (const z of [1.4, 4.2, 7.0]) {
    B.cyl(TM.alu, 0.3, 0.32, 0.14, 20, -0.12, YC + RY0 + 0.04, z);
    B.cyl(TM.chrome, 0.26, 0.26, 0.03, 20, -0.12, YC + RY0 + 0.12, z);
    B.box(TM.dark, 0.05, 0.03, 0.62, -0.12, YC + RY0 + 0.15, z);
  }
  // ladder on the right, toward the rear
  for (const z of [8.75, 9.15]) B.add(new THREE.CylinderGeometry(0.018, 0.018, 2.15, 6), TM.alu, 1.27, 2.3, z);
  for (let y = 1.4; y <= 3.3; y += 0.32) B.box(TM.alu, 0.03, 0.03, 0.4, 1.27, y, 8.95);
  // saddles and the upper coupler plate
  for (const z of [0.3, 2.4, 4.6, 6.8, 8.8]) B.box(TM.alu, 1.9, 0.22, 0.22, 0, 1.36, z);
  B.build(R.body, { cast: true });

  const P = new Parts();
  for (const sx of [-1, 1]) {
    P.box(TM.alu, 0.12, 0.26, 9.9, sx * 0.52, 1.14, 4.6);                 // frame rails
    P.box(TM.dark, 0.05, 0.06, 3.5, sx * 1.16, 0.78, 3.7);                // side under-run guard
    P.box(TM.dark, 0.05, 0.06, 3.5, sx * 1.16, 0.48, 3.7);
    for (const z of [2.2, 3.7, 5.2]) P.box(TM.dark, 0.07, 0.5, 0.06, sx * 1.14, 0.85, z);
    P.box(TM.black, 0.62, 0.05, 4.0, sx * 0.95, 1.13, 7.4);               // mudguard over the three axles
    P.box(TM.black, 0.6, 0.45, 0.02, sx * 0.95, 0.85, 9.5);               // mudflap
    P.box(TM.reflector, 0.5, 0.11, 0.012, sx * 0.62, 0.6, 10.37);         // 大型後部反射器
  }
  P.box(TM.dark, 1.1, 0.06, 1.5, 0, 1.03, 0.1);                           // upper coupler plate
  P.box(TM.alu, 0.9, 0.55, 0.55, 0, 1.2, 9.75);                           // valve cabinet
  P.add(new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12), TM.chrome, 0.25, 1.05, 10.1, Math.PI / 2, 0, 0);
  P.box(TM.dark, 2.3, 0.15, 0.12, 0, 0.6, 10.3);                          // rear under-run bar
  for (const sx of [-0.8, 0.8]) P.box(TM.dark, 0.08, 0.5, 0.08, sx, 0.88, 10.22);
  P.box(TM.dark, 2.3, 0.18, 0.1, 0, 1.1, 10.36);                          // lamp bar
  P.build(root, { cast: true });
  R.legs = trailerLegs(root, 1.6);

  const Mk = new Parts();
  for (const sx of [-1, 1]) for (let z = 0.2; z <= 9.2; z += 1.5) Mk.box(TM.marker, 0.03, 0.06, 0.1, sx * 0.6, 1.14, z);
  Mk.build(root);
  trailerRearLamps(R, root, 10.43);
  for (const z of [6.1, 7.4, 8.7]) for (const sx of [-1, 1]) {
    const w = makeWheel(true, sx); w.position.set(sx * 0.92, 0.52, z); root.add(w); R.spin.push(w);
  }
  return R;
}

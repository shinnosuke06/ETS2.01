// ---------------------------------------------------------------------------
// Scania-style 4x2 tractor (right-hand drive for Japan) and a 13.6 m van trailer.
// Local frame: -Z forward, +X right, +Y up. Tractor origin = rear axle on the ground.
// No maker badges: it is a "Scania-style" cab-over, painted in a fictional livery.
// ---------------------------------------------------------------------------
const TM = {
  paint: new THREE.MeshPhongMaterial({ color: 0x8e1b20, specular: 0x666666, shininess: 80, envMap: ENV, reflectivity: 0.2, combine: THREE.MixOperation }),
  paintDark: new THREE.MeshPhongMaterial({ color: 0x2a2c2f, specular: 0x333333, shininess: 40 }),
  chrome: new THREE.MeshPhongMaterial({ color: 0xe2e6e9, specular: 0xffffff, shininess: 120, envMap: ENV, reflectivity: 0.75, combine: THREE.MixOperation }),
  black: new THREE.MeshPhongMaterial({ color: 0x131415, specular: 0x222222, shininess: 25 }),
  blackDS: new THREE.MeshPhongMaterial({ color: 0x131415, specular: 0x222222, shininess: 25, side: THREE.DoubleSide }),
  dark: new THREE.MeshPhongMaterial({ color: 0x2c2e31, specular: 0x222222, shininess: 20 }),
  frame: new THREE.MeshPhongMaterial({ color: 0x1c1d1f, specular: 0x111111, shininess: 10 }),
  bumper: new THREE.MeshPhongMaterial({ color: 0x34373a, specular: 0x333333, shininess: 30 }),
  alu: new THREE.MeshPhongMaterial({ color: 0xc9cdd1, specular: 0xbbbbbb, shininess: 80, envMap: ENV, reflectivity: 0.35, combine: THREE.MixOperation }),
  white: new THREE.MeshPhongMaterial({ color: 0xeef0f0, specular: 0x444444, shininess: 40 }),
  tire: new THREE.MeshLambertMaterial({ color: 0x18181a }),
  rim: new THREE.MeshPhongMaterial({ color: 0xd2d6d9, specular: 0xffffff, shininess: 90, envMap: ENV, reflectivity: 0.4, combine: THREE.MixOperation }),
  glassOut: new THREE.MeshPhongMaterial({ color: 0x0e171c, specular: 0xffffff, shininess: 110, envMap: ENV, reflectivity: 0.55, combine: THREE.MixOperation, transparent: true, opacity: 0.82, depthWrite: false }),
  glassIn: new THREE.MeshBasicMaterial({ color: 0xcfe0ea, transparent: true, opacity: 0.05, depthWrite: false }),
  headOff: new THREE.MeshPhongMaterial({ color: 0xd8dde0, specular: 0xffffff, shininess: 100, envMap: ENV, reflectivity: 0.5, combine: THREE.MixOperation }),
  headOn: new THREE.MeshBasicMaterial({ color: 0xfff7e4 }),
  drl: new THREE.MeshBasicMaterial({ color: 0xf2faff }),
  amberOff: new THREE.MeshPhongMaterial({ color: 0x9a6512, specular: 0x888888, shininess: 80 }),
  amberOn: new THREE.MeshBasicMaterial({ color: 0xffa51c }),
  redOff: new THREE.MeshPhongMaterial({ color: 0x5c0e0e, specular: 0x888888, shininess: 80 }),
  redDim: new THREE.MeshBasicMaterial({ color: 0xa8170f }),
  redOn: new THREE.MeshBasicMaterial({ color: 0xff2b18 }),
  whiteOn: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  marker: new THREE.MeshBasicMaterial({ color: 0xffa21a }),
  mirrorStatic: new THREE.MeshPhongMaterial({ color: 0x8e98a0, specular: 0xffffff, shininess: 120, envMap: ENV, reflectivity: 0.9, combine: THREE.MixOperation }),
};
TM.trailerBody = new THREE.MeshPhongMaterial({ map: TEX.alu, specular: 0x777777, shininess: 50 });
TEX.alu.repeat.set(1, 1);

function plateTexture(top, bottom) {
  const c = makeCanvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#1e6a3b'; roundRect(g, 0, 0, 256, 128, 10); g.fill();
  g.strokeStyle = '#d9e8dc'; g.lineWidth = 3; roundRect(g, 4, 4, 248, 120, 8); g.stroke();
  g.fillStyle = '#f4f7f2'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = font(30); g.fillText(top, 128, 32);
  g.font = font(64); g.fillText(bottom, 140, 88);
  g.font = font(26); g.fillText('か', 30, 92);
  return canvasTex(c);
}
const PLATE_MAT = new THREE.MeshBasicMaterial({ map: plateTexture('品川 100', '23-45') });

const LOGO_TEX = (() => {
  const W = 1024, H = 190, c = makeCanvas(W, H), g = c.getContext('2d');
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#c8231c'; g.beginPath(); g.arc(96, 92, 66, 0, TAU); g.fill();
  g.fillStyle = '#1c2b52'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = `400 104px "Dela Gothic One",${JP_FONT}`; g.fillText('日之出運輸', 190, 116);
  g.font = font(30); g.fillText('HINODE TRANSPORT', 196, 160);
  g.font = font(26, 400); g.textAlign = 'right'; g.fillText('東京 · 静岡 · 名古屋', W - 24, 160);
  g.fillStyle = '#c8231c'; g.fillRect(190, 176, W - 214, 8);
  return canvasTex(c, { aniso: 8 });
})();
const LOGO_MAT = new THREE.MeshPhongMaterial({ map: LOGO_TEX, transparent: true, shininess: 30, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });

function makeWheel(dual, side) {
  const g = new THREE.Group();
  const P = new Parts();
  const tw = dual ? 0.28 : 0.31;
  const offs = dual ? [-0.16, 0.16] : [0];
  for (const o of offs) {
    P.add(new THREE.CylinderGeometry(0.52, 0.52, tw, 24), TM.tire, o, 0, 0, 0, 0, Math.PI / 2);
    P.add(new THREE.CylinderGeometry(0.47, 0.47, tw + 0.02, 24), TM.tire, o, 0, 0, 0, 0, Math.PI / 2);
  }
  const outer = side * (dual ? 0.16 + tw / 2 : tw / 2);
  P.add(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 22), TM.rim, outer - side * 0.005, 0, 0, 0, 0, Math.PI / 2);
  P.add(new THREE.CylinderGeometry(0.13, 0.15, 0.09, 14), TM.chrome, outer + side * 0.03, 0, 0, 0, 0, Math.PI / 2);
  for (let k = 0; k < 10; k++) {
    const a = k / 10 * TAU;
    P.add(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 6), TM.chrome, outer + side * 0.025, Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0, 0, Math.PI / 2);
  }
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * TAU + 0.2;
    P.add(new THREE.BoxGeometry(0.02, 0.09, 0.05), TM.dark, outer + side * 0.012, Math.cos(a) * 0.27, Math.sin(a) * 0.27, a, 0, 0);
  }
  P.build(g, { cast: true });
  return g;
}

function buildTractor() {
  const T = { blinkL: [], blinkR: [], heads: [], spin: [], steer: [] };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  T.root = root;

  // ---- chassis (does not tilt) ----
  const C = new Parts();
  C.box(TM.frame, 0.1, 0.28, 6.6, -0.42, 0.92, -1.95); C.box(TM.frame, 0.1, 0.28, 6.6, 0.42, 0.92, -1.95);
  for (const z of [-4.7, -3.1, -1.7, -0.3, 0.9]) C.box(TM.frame, 0.84, 0.1, 0.12, 0, 0.92, z);
  C.box(TM.dark, 1.0, 0.1, 1.0, 0, 1.11, -0.35);
  C.cyl(TM.black, 0.46, 0.46, 0.06, 18, 0, 1.19, -0.35);
  C.add(new THREE.CylinderGeometry(0.33, 0.33, 1.7, 20), TM.alu, -0.98, 0.72, -2.2, Math.PI / 2, 0, 0);
  for (const z of [-2.8, -1.6]) C.add(new THREE.TorusGeometry(0.336, 0.016, 6, 22), TM.black, -0.98, 0.72, z);
  C.box(TM.black, 0.56, 0.55, 0.85, 1.0, 0.8, -2.65);
  C.add(new THREE.CylinderGeometry(0.2, 0.2, 0.55, 14), TM.white, 1.0, 0.72, -1.75, Math.PI / 2, 0, 0);
  C.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), TM.dark, 0.64, 0.62, -1.0, Math.PI / 2, 0, 0);
  C.add(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 10), TM.dark, -0.64, 0.62, -0.9, Math.PI / 2, 0, 0);
  for (const sx of [-1, 1]) {
    C.box(TM.black, 0.66, 0.05, 1.4, sx * 0.9, 1.15, 0.0);
    C.box(TM.black, 0.62, 0.5, 0.02, sx * 0.9, 0.86, 0.76);
    C.add(new THREE.CylinderGeometry(0.62, 0.62, 0.42, 18, 1, true, 0, Math.PI), TM.blackDS, sx * 1.03, 0.52, -3.9, 0, 0, Math.PI / 2);
  }
  C.box(TM.dark, 2.2, 0.12, 0.08, 0, 0.78, 1.05);
  // bumper with corner headlamp units
  C.box(TM.bumper, 2.5, 0.56, 0.34, 0, 0.72, -5.44);
  C.box(TM.dark, 2.32, 0.1, 0.36, 0, 0.42, -5.45);
  C.box(TM.black, 0.7, 0.06, 0.25, 0, 0.98, -5.5);
  for (const sx of [-1, 1]) {
    C.box(TM.black, 0.62, 0.3, 0.03, sx * 0.86, 0.82, -5.615);
    C.box(TM.drl, 0.5, 0.025, 0.02, sx * 0.86, 0.948, -5.635);
    C.box(TM.drl, 0.025, 0.2, 0.02, sx * 1.12, 0.84, -5.635);
    C.add(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14), TM.headOff, sx * 0.62, 0.55, -5.62, Math.PI / 2, 0, 0);
  }
  C.build(root, { cast: true });
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.03), TM.headOff);
    h.position.set(sx * 0.84, 0.82, -5.63); root.add(h); T.heads.push(h);
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.03), TM.amberOff);
    b.position.set(sx * 1.17, 0.73, -5.63); root.add(b); (sx < 0 ? T.blinkL : T.blinkR).push(b);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), PLATE_MAT);
  plate.position.set(0, 0.62, -5.63); plate.rotation.y = Math.PI; root.add(plate);

  // wheels
  for (const sx of [-1, 1]) {
    const st = new THREE.Group(); st.position.set(sx * 1.03, 0.52, -3.9); root.add(st);
    const w = makeWheel(false, sx); st.add(w); T.spin.push(w); T.steer.push(st);
    const r = makeWheel(true, sx); r.position.set(sx * 0.9, 0.52, 0); root.add(r); T.spin.push(r);
  }

  // headlight beam (used at night / in tunnels)
  T.spot = new THREE.SpotLight(0xfff0d6, 0, 110, 0.42, 0.55, 1.1);
  T.spot.position.set(0, 1.1, -5.7);
  T.spot.target.position.set(0, -2.5, -45);
  root.add(T.spot); root.add(T.spot.target);

  // ---- cab (tilts on its suspension) ----
  const cabPivot = new THREE.Group(); cabPivot.position.set(0, 1.25, -4.3); root.add(cabPivot);
  const cab = new THREE.Group(); cab.position.set(0, -1.25, 4.3); cabPivot.add(cab);
  T.cabPivot = cabPivot; T.cab = cab;

  const K = new Parts();
  const prof = [[-5.40, 1.28], [-5.44, 2.16], [-5.34, 2.27], [-5.17, 3.30], [-5.10, 3.46], [-4.86, 3.86], [-4.5, 3.93], [-3.3, 3.93], [-3.14, 3.84], [-3.14, 1.28]];
  K.add(extrudeX(prof, -1.25, 1.25, 0.06), TM.paint);
  K.box(TM.paintDark, 2.36, 0.32, 0.16, 0, 1.13, -5.34);
  // grille
  K.box(TM.black, 2.0, 0.74, 0.02, 0, 1.74, -5.43);
  for (let k = 0; k < 6; k++) K.box(TM.dark, 2.0, 0.045, 0.04, 0, 1.44 + k * 0.11, -5.45);
  K.box(TM.chrome, 2.1, 0.05, 0.03, 0, 2.1, -5.45);
  K.box(TM.chrome, 0.9, 0.035, 0.03, 0, 1.36, -5.44);
  // step housings and treads under the doors
  for (const sx of [-1, 1]) {
    K.box(TM.paintDark, 0.12, 0.78, 0.95, sx * 1.19, 0.9, -4.85);
    K.box(TM.black, 0.34, 0.05, 0.5, sx * 1.14, 0.62, -4.85);
    K.box(TM.black, 0.34, 0.05, 0.5, sx * 1.14, 1.02, -4.85);
    K.box(TM.black, 0.03, 0.05, 0.22, sx * 1.266, 2.05, -4.32);          // door handle
    K.box(TM.black, 0.012, 1.85, 0.012, sx * 1.252, 2.25, -4.14);        // door seam
    K.box(TM.black, 0.04, 0.95, 0.2, sx * 1.255, 2.7, -5.38, 0, sx * 0.5, 0); // corner deflector, ahead of the A-pillar
    K.box(TM.black, 0.04, 0.05, 0.3, sx * 1.22, 3.27, -5.1);             // mirror arm base
    K.box(TM.black, 0.38, 0.04, 0.05, sx * 1.42, 3.22, -5.16, 0, 0, sx * 0.25); // arm
    K.box(TM.black, 0.04, 0.62, 0.04, sx * 1.6, 2.85, -5.18);             // mirror stem
  }
  K.box(TM.black, 0.02, 0.8, 0.5, -1.262, 2.65, -3.6);                    // air intake (left)
  K.box(TM.black, 2.44, 0.05, 0.44, 0, 3.47, -5.33, 0.1, 0, 0);           // sun visor
  K.box(TM.black, 0.22, 0.12, 0.18, -1.38, 3.47, -5.33);                  // kerb mirror housing
  K.box(TM.black, 0.24, 0.1, 0.16, 0.52, 3.56, -5.56);                    // front mirror housing
  for (const sx of [-0.3, 0.3]) K.add(new THREE.CylinderGeometry(0.05, 0.085, 0.55, 12), TM.chrome, sx, 3.99, -4.35, -Math.PI / 2, 0, 0);
  K.box(TM.paintDark, 0.7, 0.06, 0.7, 0, 3.96, -4.0);                     // roof hatch
  K.build(cab, { cast: true });

  const M = new Parts();
  for (let k = 0; k < 5; k++) M.box(TM.marker, 0.13, 0.05, 0.05, -0.8 + k * 0.4, 3.53, -5.55);
  for (const sx of [-1, 1]) M.box(TM.marker, 0.03, 0.06, 0.12, sx * 1.265, 1.4, -5.0);
  M.build(cab);
  for (const sx of [-1, 1]) {
    const rep = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.12), TM.amberOff);
    rep.position.set(sx * 1.265, 1.95, -5.08); cab.add(rep); (sx < 0 ? T.blinkL : T.blinkR).push(rep);
  }
  // static small mirrors
  { const m1 = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.16), TM.mirrorStatic); m1.position.set(-1.38, 3.4, -5.33); m1.rotation.set(-1.2, 0, 0); cab.add(m1);
    const m2 = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.13), TM.mirrorStatic); m2.position.set(0.52, 3.5, -5.47); m2.rotation.set(-0.9, Math.PI, 0); cab.add(m2); }

  // glass: dark outer faces for exterior views, faint inner faces for the cab view
  const ws = [[-1.12, 2.30, -5.335], [1.12, 2.30, -5.335], [1.1, 3.26, -5.178], [-1.1, 3.26, -5.178]];
  const off = (p, dz, dy = 0) => [p[0], p[1] + dy, p[2] + dz];
  cab.add(new THREE.Mesh(quadGeo(...ws.map(p => off(p, -0.022)), [0, 0.16, -1]), TM.glassOut));
  cab.add(new THREE.Mesh(quadGeo(...ws.map(p => off(p, 0.04)), [0, -0.16, 1]), TM.glassIn));
  for (const sx of [-1, 1]) {
    const pts = (x) => [[x, 2.32, -5.27], [x, 2.32, -4.2], [x, 3.15, -4.2], [x, 3.15, -5.12]];
    cab.add(new THREE.Mesh(quadGeo(...pts(sx * 1.262), [sx, 0, 0]), TM.glassOut));
    cab.add(new THREE.Mesh(quadGeo(...pts(sx * 1.2), [-sx, 0, 0]), TM.glassIn));
  }

  // live mirrors (textures assigned by the mirror system)
  T.mirrors = {};
  for (const [key, sx] of [['L', -1], ['R', 1]]) {
    const anchor = new THREE.Object3D(); anchor.position.set(sx * 1.62, 2.9, -5.02); cab.add(anchor);
    const mainG = new THREE.PlaneGeometry(0.215, 0.37);
    const wideG = new THREE.PlaneGeometry(0.215, 0.18);
    // mirror image: flip u, crop main mirror to the centre of the render
    const uvm = mainG.attributes.uv, uvw = wideG.attributes.uv;
    for (let i = 0; i < uvm.count; i++) { uvm.setXY(i, 1 - (0.13 + uvm.getX(i) * 0.74), 0.2 + uvm.getY(i) * 0.76); }
    for (let i = 0; i < uvw.count; i++) { uvw.setXY(i, 1 - uvw.getX(i), uvw.getY(i) * 0.9); }
    const mat = new THREE.MeshBasicMaterial({ color: 0x9aa3aa });
    // mirror head (housings + glass) turned toward the driver, who sits on the right
    const head = new THREE.Group(); head.position.set(sx * 1.62, 2.73, -5.12); head.rotation.y = sx > 0 ? -0.42 : 0.55; cab.add(head);
    const hb = new Parts();
    hb.box(TM.black, 0.25, 0.42, 0.12, 0, 0.17, 0);
    hb.box(TM.black, 0.25, 0.21, 0.11, 0, -0.17, 0, 0.12, 0, 0);
    hb.build(head, { cast: true });
    const main = new THREE.Mesh(mainG, mat); main.position.set(0, 0.17, 0.062); head.add(main);
    const wide = new THREE.Mesh(wideG, mat); wide.position.set(0, -0.17, 0.058); wide.rotation.x = 0.12; head.add(wide);
    T.mirrors[key] = { anchor, main, wide, mat, side: sx };
  }

  // wipers: pivots at the windscreen base, parked toward the left
  T.wipers = [];
  const wg = new THREE.Group(); wg.position.set(0, 2.3, -5.37); wg.rotation.x = 0.164; cab.add(wg);
  for (const px of [0.95, -0.12]) {
    const piv = new THREE.Group(); piv.position.set(px, 0.02, 0); wg.add(piv);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.022, 0.02).translate(-0.43, 0, -0.012), TM.black);
    piv.add(arm); T.wipers.push(piv);
  }
  return T;
}

function buildTrailer() {
  const R = { blinkL: [], blinkR: [], tail: [], brake: [], spin: [] };
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  R.root = root;
  const P = new Parts();
  P.box(TM.trailerBody, 2.49, 2.5, 13.6, 0, 2.55, 5.6);
  P.box(TM.alu, 2.52, 0.08, 13.62, 0, 3.8, 5.6);
  P.box(TM.alu, 2.52, 0.18, 13.62, 0, 1.26, 5.6);
  for (const sx of [-1, 1]) for (const z of [-1.2, 12.4]) P.box(TM.alu, 0.08, 2.56, 0.08, sx * 1.25, 2.55, z);
  P.box(TM.dark, 2.5, 0.12, 0.08, 0, 1.38, 12.43);
  P.box(TM.dark, 2.5, 0.12, 0.08, 0, 3.72, 12.43);
  P.box(TM.black, 0.02, 2.35, 0.01, 0, 2.55, 12.442);
  for (const x of [-0.9, -0.3, 0.3, 0.9]) P.add(new THREE.CylinderGeometry(0.02, 0.02, 2.3, 6), TM.chrome, x, 2.55, 12.46);
  for (const sx of [-1, 1]) {
    P.box(TM.frame, 0.12, 0.32, 12.6, sx * 0.52, 1.0, 6.0);
    P.box(TM.dark, 0.1, 0.85, 0.1, sx * 0.85, 0.72, 1.8);
    P.box(TM.dark, 0.3, 0.05, 0.3, sx * 0.85, 0.29, 1.8);
    P.box(TM.dark, 0.05, 0.06, 4.6, sx * 1.18, 0.78, 4.1);
    P.box(TM.dark, 0.05, 0.06, 4.6, sx * 1.18, 0.48, 4.1);
    for (const z of [2.0, 3.5, 5.0, 6.2]) P.box(TM.dark, 0.08, 0.5, 0.06, sx * 1.16, 0.85, z);
    P.box(TM.black, 0.62, 0.05, 4.1, sx * 0.95, 1.13, 8.3);
    P.box(TM.black, 0.6, 0.45, 0.02, sx * 0.95, 0.85, 10.45);
  }
  P.box(TM.dark, 2.3, 0.15, 0.12, 0, 0.55, 12.28);
  for (const sx of [-0.8, 0.8]) P.box(TM.dark, 0.08, 0.55, 0.08, sx, 0.85, 12.2);
  P.box(TM.dark, 2.3, 0.18, 0.1, 0, 1.1, 12.42);
  P.box(TM.dark, 0.25, 0.05, 0.35, 0, 1.05, -0.2); // kingpin plate
  P.build(root, { cast: true });

  // Japanese-style amber side marker lamps
  const Mk = new Parts();
  for (const sx of [-1, 1]) for (let z = 0; z <= 12; z += 1.5) Mk.box(TM.marker, 0.03, 0.06, 0.1, sx * 1.27, 1.22, z);
  Mk.build(root);

  for (const sx of [-1, 1]) {
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(11.6, 2.15), LOGO_MAT);
    logo.position.set(sx * 1.252, 2.62, 5.4); logo.rotation.y = sx * Math.PI / 2; root.add(logo);
    // rear lamps: tail/brake, blinker, reverse
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.04), TM.redDim); tl.position.set(sx * 0.9, 1.1, 12.49); root.add(tl); R.tail.push(tl);
    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.04), TM.amberOff); bl.position.set(sx * 0.6, 1.1, 12.49); root.add(bl); (sx < 0 ? R.blinkL : R.blinkR).push(bl);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.04), TM.white); rv.position.set(sx * 0.42, 1.1, 12.49); root.add(rv); R.rev = R.rev || []; R.rev.push(rv);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.22), PLATE_MAT);
  plate.position.set(0, 0.92, 12.5); root.add(plate);
  for (const z of [7.0, 8.3, 9.6]) for (const sx of [-1, 1]) {
    const w = makeWheel(true, sx); w.position.set(sx * 0.92, 0.52, z); root.add(w); R.spin.push(w);
  }
  return R;
}

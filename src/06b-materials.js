// ---------------------------------------------------------------------------
// Vehicle materials: TM (tractor and trailers) and IM (cab interior), the
// patterns and environment pictures that light them, and the paint, interior
// and trim choices. makeVehicleMaterials(quality) refills TM and IM in place:
// high and mid use physically based materials lit by two environment pictures
// (outside: sky and ground; cab: bright windows, dark floor and back wall),
// low keeps the light Lambert / Phong materials.
// ---------------------------------------------------------------------------
const PAINTS = {
  white: { label: '白', color: 0xf0f1ef },
  blue: { label: '青', color: 0x1b5fb5 },
  red: { label: '赤', color: 0xb01219 },
  silver: { label: '銀', color: 0xaeb4b9 },
};
let paintName = lsGet('nlh.paint', 'white');
if (!PAINTS[paintName]) paintName = 'white';

// The saved name 'beige' is kept for old saves; the cab it describes is light grey (photo 2).
const INTERIOR_THEMES = {
  black: { label: 'ブラック', upper: 0x3b3d41, lower: 0x1c1d1f, head: 0xcac7c0, cabinet: 0xd3d0c9, door: 0x2f3134, stitch: '#61656a', mattress: 0x34373d, drawer: 0x2c2e31, curtain: 0x1a1b1d, ambient: 0xff1e2c, quilt: false },
  beige: { label: 'ライトグレー', upper: 0xcfd0cc, lower: 0x1e1f21, head: 0xe3e3df, cabinet: 0xd9d9d4, door: 0xc9cac6, stitch: '#4a4a4a', mattress: 0xcbc8c0, drawer: 0xd4d4cf, curtain: 0x2b2c2e, ambient: 0xffcf8a, quilt: false },
  red: { label: 'レッド', upper: 0x9b111b, lower: 0x141415, head: 0x8a0f18, cabinet: 0x930f19, door: 0x930f19, stitch: '#d0202c', mattress: 0x1a1a1b, drawer: 0x930f19, curtain: 0x121213, ambient: 0xff1e2c, quilt: true },
};
let interiorName = lsGet('nlh.interior', 'black');
if (!INTERIOR_THEMES[interiorName]) interiorName = 'black';

const TRIMS = ['normal', 'custom'];
let trimName = lsGet('nlh.trim', 'normal');
if (!TRIMS.includes(trimName)) trimName = 'normal';

// ---- shared pictures (made once) ------------------------------------------------
TEX.mesh = (() => { // black honeycomb grille mesh
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#030303'; g.fillRect(0, 0, W, W);
  g.strokeStyle = '#262729'; g.lineWidth = 3;
  for (let y = 0; y < W + 16; y += 16) for (let x = 0; x < W + 16; x += 18) {
    const ox = (y / 16) % 2 ? 9 : 0;
    g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; g.lineTo(x + ox + Math.cos(a) * 9, y + Math.sin(a) * 9); } g.closePath(); g.stroke();
  }
  const t = canvasTex(c, { repeat: true }); t.repeat.set(12, 4); return t;
})();
TEX.chequer = (() => { // aluminium chequer plate (catwalk, steps)
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#aeb3b7'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 2500, 2, 150, 210, 0.15, 0.35, 141);
  for (let y = 0; y < W; y += 16) for (let x = 0; x < W; x += 16) {
    const flip = ((x + y) / 16) % 2;
    g.save(); g.translate(x + 8, y + 8); g.rotate(flip ? 0.8 : -0.8);
    g.fillStyle = '#d9dde0'; g.fillRect(-5, -1.5, 10, 3); g.fillStyle = '#7d8286'; g.fillRect(-5, 1.5, 10, 1.2); g.restore();
  }
  const t = canvasTex(c, { repeat: true }); t.repeat.set(4, 4); return t;
})();
TEX.reflector = (() => { // 大型後部反射器: red / fluorescent orange diagonal stripes
  const W = 256, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#d6141c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#ff8a12';
  for (let x = -H; x < W + H; x += 40) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 20, H); g.lineTo(x + 20 + H, 0); g.lineTo(x + H, 0); g.closePath(); g.fill(); }
  g.strokeStyle = '#a00d12'; g.lineWidth = 6; g.strokeRect(3, 3, W - 6, H - 6);
  return canvasTex(c);
})();
TEX.headW = (() => {
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#f2f2f0'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 4000, 1, 200, 245, 0.2, 0.5, 211);
  const t = canvasTex(c, { repeat: true }); t.repeat.set(4, 4); return t;
})();
TEX.alu.repeat.set(1, 1);
TEX.fabric.repeat.set(2, 2);
TEX.floor.repeat.set(4, 4);

// ---- vehicle materials ----------------------------------------------------------
const TM = {}, IM = {};
// pbr: physically based materials in use. envOut / envCab: prefiltered environment pictures. fallback: pbr was
// asked for but could not be set up. base: each lit material's environment strength at noon, and whether it is in the cab.
// cabRot: turns the cab's environment lookups into the tractor's frame, so the windows stay in front as the road turns.
const VEH = { pbr: false, fallback: false, envOut: null, envCab: null, rts: [], tex: [], base: new Map(), pat: {}, cabRot: { value: new THREE.Matrix3() } };
const CAB_AMBIENT = { base: new THREE.Color(0xff1e2c), on: null };

function _vehCube(size, faces) {   // faces: draw functions for +x, -x, +y, -y, +z, -z
  const t = new THREE.CubeTexture(faces.map(fn => { const c = makeCanvas(size, size); fn(c.getContext('2d'), size); return c; }));
  t.needsUpdate = true;
  return t;
}
function _vehEnvironment() {
  const sky = sun => (g, S) => {
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#5f97dd'); grd.addColorStop(0.5, '#e6eef4'); grd.addColorStop(0.55, '#70745f'); grd.addColorStop(1, '#3c4034');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    if (sun) { const r = g.createRadialGradient(S * 0.5, S * 0.3, 0, S * 0.5, S * 0.3, S * 0.35); r.addColorStop(0, 'rgba(255,250,235,0.9)'); r.addColorStop(1, 'rgba(255,250,235,0)'); g.fillStyle = r; g.fillRect(0, 0, S, S); }
  };
  const flat = col => (g, S) => { g.fillStyle = col; g.fillRect(0, 0, S, S); };
  const win = (x0, y0, x1, y1) => (g, S) => { g.fillStyle = '#16171a'; g.fillRect(0, 0, S, S); g.fillStyle = '#dfe9f2'; g.fillRect(S * x0, S * y0, S * (x1 - x0), S * (y1 - y0)); };
  const out = _vehCube(128, [sky(true), sky(false), flat('#6aa0e2'), flat('#3a3f36'), sky(false), sky(false)]);
  // the cab in the tractor's frame: windscreen ahead (-z), door windows to the sides, headlining above, dark floor and back wall
  const cab = _vehCube(64, [win(0.25, 0.2, 0.75, 0.65), win(0.25, 0.2, 0.75, 0.65), flat('#3a3a3c'), flat('#16171a'), flat('#16171a'), win(0, 0, 1, 0.6)]);
  const pm = new THREE.PMREMGenerator(renderer);
  try {
    const a = pm.fromCubemap(out), b = pm.fromCubemap(cab);
    VEH.rts = [a, b]; VEH.envOut = a.texture; VEH.envCab = b.texture;
  } finally { pm.dispose(); out.dispose(); cab.dispose(); }
}

// A pattern: a colour picture (optional) and, for pbr, a normal map made from a height picture.
// If any of it cannot be drawn, the pattern is left out entirely and the material shows plain colour.
function _vehPattern(S, { rep = 1, colorRep = rep, height = null, color = null }) {
  try {
    let normal = null, map = null;
    if (VEH.pbr && height) {
      // read back below: a canvas kept on the CPU avoids waiting for the GPU
      const c = makeCanvas(S, S), g = c.getContext('2d', { willReadFrequently: true });
      g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); height(g, S);
      const src = g.getImageData(0, 0, S, S).data, img = g.createImageData(S, S), d = img.data;
      const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const nx = -(h(x + 1, y) - h(x - 1, y)), ny = h(x, y + 1) - h(x, y - 1), l = Math.hypot(nx, ny, 1), i = (y * S + x) * 4;
        d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = (0.5 / l + 0.5) * 255; d[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      normal = canvasTex(c, { repeat: true }); normal.repeat.set(rep, rep);
    }
    if (color) {
      const c = makeCanvas(S, S); color(c.getContext('2d'), S);
      map = canvasTex(c, { repeat: true }); map.repeat.set(colorRep, colorRep); map.userData = { c };
    }
    for (const t of [normal, map]) if (t) VEH.tex.push(t);
    return { normal, map };
  } catch (e) { return { normal: null, map: null }; }
}
// Seamless value noise: S x S values in 0..1 with blobs about S / cells pixels across.
function _tileNoise(S, cells, seed) {
  const r = rng(seed), G = new Float32Array(cells * cells), out = new Float32Array(S * S), k = cells / S;
  for (let i = 0; i < G.length; i++) G[i] = r();
  const sm = t => t * t * (3 - 2 * t);
  for (let y = 0; y < S; y++) {
    const fy = y * k, y0 = Math.floor(fy), ty = sm(fy - y0), r0 = (y0 % cells) * cells, r1 = ((y0 + 1) % cells) * cells;
    for (let x = 0; x < S; x++) {
      const fx = x * k, x0 = Math.floor(fx), tx = sm(fx - x0), c0 = x0 % cells, c1 = (x0 + 1) % cells;
      const a = G[r0 + c0] + (G[r0 + c1] - G[r0 + c0]) * tx, b = G[r1 + c0] + (G[r1 + c1] - G[r1 + c0]) * tx;
      out[y * S + x] = a + (b - a) * ty;
    }
  }
  return out;
}
// Write a colour per pixel (f(i) -> [r, g, b], 0..255) straight into the picture.
function _putPixels(g, S, f) {
  const img = g.createImageData(S, S), d = img.data;
  for (let i = 0; i < S * S; i++) { const c = f(i); d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
}
// Height from two layers of noise (fine grain on coarser blobs).
const _noiseHeight = (fine, coarse, seed) => (g, S) => {
  const a = _tileNoise(S, Math.max(4, Math.round(S / fine)), seed), b = _tileNoise(S, Math.max(4, Math.round(S / coarse)), seed + 7), v = [0, 0, 0];
  _putPixels(g, S, i => { v[0] = v[1] = v[2] = (a[i] * 0.7 + b[i] * 0.3) * 255; return v; });
};
// Leather with stitched horizontal channels (seat centres); drawn again when the interior changes.
function _drawLeather(c, stitch) {
  const g = c.getContext('2d'), W = c.width, k = W / 256, n = _tileNoise(W, Math.round(W / 3), 221), v = [0, 0, 0];
  _putPixels(g, W, i => { v[0] = v[1] = v[2] = 20 + n[i] * 16; return v; });
  for (let y = 0; y < W; y += 32 * k) {
    const grd = g.createLinearGradient(0, y, 0, y + 32 * k);
    grd.addColorStop(0, 'rgba(255,255,255,.06)'); grd.addColorStop(0.5, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = grd; g.fillRect(0, y, W, 32 * k);
    g.fillStyle = '#0b0b0c'; g.fillRect(0, y + 30 * k, W, 3 * k);
    g.fillStyle = stitch; for (let x = 4 * k; x < W; x += 9 * k) { g.fillRect(x, y + 26 * k, 5 * k, 1.4 * k); g.fillRect(x, y + 35 * k, 5 * k, 1.4 * k); }
  }
}
// Diamond quilting (the red interior's walls, ceiling and doors).
function _drawQuilt(c, hex) {
  const g = c.getContext('2d'), W = c.width, k = W / 256, col = new THREE.Color(hex), n = _tileNoise(W, Math.round(W / 3), 231), v = [0, 0, 0];
  _putPixels(g, W, i => { const m = 0.88 + n[i] * 0.2; v[0] = col.r * 255 * m; v[1] = col.g * 255 * m; v[2] = col.b * 255 * m; return v; });
  const lines = (dx, style, lw, dash) => {
    g.strokeStyle = style; g.lineWidth = lw * k; g.setLineDash(dash.map(d => d * k));
    for (let x = -W; x < 2 * W; x += 32 * k) { g.beginPath(); g.moveTo(x + dx, 0); g.lineTo(x + dx + W, W); g.stroke(); g.beginPath(); g.moveTo(x + dx, W); g.lineTo(x + dx + W, 0); g.stroke(); }
  };
  lines(0, 'rgba(0,0,0,.45)', 3, []); lines(3 * k, 'rgba(255,255,255,.16)', 1, [3, 3]); g.setLineDash([]);
}
function _vehPatterns(S) {
  return {
    plastic: _vehPattern(S, { rep: 6, height: _noiseHeight(2, 8, 301) }),
    leather: _vehPattern(S, { rep: 8, colorRep: 1, height: _noiseHeight(4, 16, 311), color: (g, W) => _drawLeather(g.canvas, INTERIOR_THEMES[interiorName].stitch) }),
    quilt: _vehPattern(S, { rep: 3, height: (g, W) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, W); g.strokeStyle = '#000000'; g.lineWidth = W / 18;
      for (let x = -W; x < 2 * W; x += W / 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + W, W); g.stroke(); g.beginPath(); g.moveTo(x, W); g.lineTo(x + W, 0); g.stroke(); }
      g.filter = `blur(${W / 64}px)`; g.drawImage(g.canvas, 0, 0); g.filter = 'none';
    }, color: (g, W) => _drawQuilt(g.canvas, INTERIOR_THEMES.red.upper) }),
    fabric: _vehPattern(S, { rep: 10, height: (g, W) => {
      const c = W / 32;
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
        const along = (x + y) % 2, grd = along ? g.createLinearGradient(x * c, 0, x * c + c, 0) : g.createLinearGradient(0, y * c, 0, y * c + c);
        grd.addColorStop(0, '#404040'); grd.addColorStop(0.5, '#c8c8c8'); grd.addColorStop(1, '#404040'); g.fillStyle = grd; g.fillRect(x * c, y * c, c, c);
      }
    } }),
    rubber: _vehPattern(S, { rep: 4, height: (g, W) => {
      const c = W / 8; g.fillStyle = '#e0e0e0';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.save(); g.translate(x * c + c / 2, y * c + c / 2); g.rotate((x + y) % 2 ? 0.8 : -0.8); g.fillRect(-c * 0.32, -c * 0.09, c * 0.64, c * 0.18); g.restore(); }
    } }),
    hair: _vehPattern(S, { rep: 4, height: (g, W) => {
      const r = rng(331);
      for (let i = 0; i < W * 1.5; i++) { const v = (100 + r() * 60) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(r() * W - W / 2, r() * W, W * (0.3 + r()), 1); }
    } }),
  };
}

const _v2 = s => new THREE.Vector2(s, s);
// Turn the cab's environment lookups into the tractor's frame (see VEH.cabRot).
function _cabEnvHook(shader) {
  shader.uniforms.cabRot = VEH.cabRot;
  const chunk = THREE.ShaderChunk.envmap_physical_pars_fragment
    .replace('vec3 worldNormal = inverseTransformDirection( geometry.normal, viewMatrix );', 'vec3 worldNormal = cabRot * inverseTransformDirection( geometry.normal, viewMatrix );')
    .replace('reflectVec = inverseTransformDirection( reflectVec, viewMatrix );', 'reflectVec = cabRot * inverseTransformDirection( reflectVec, viewMatrix );');
  shader.fragmentShader = 'uniform mat3 cabRot;\n' + shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', chunk);
}

function makeVehicleMaterials(quality) {
  const Qp = QUALITY_PRESETS[quality] || QUALITY_PRESETS.mid;
  VEH.pbr = false; VEH.fallback = false; VEH.base.clear();
  if (Qp.pbr) {
    try { _vehEnvironment(); VEH.pbr = true; } catch (e) { VEH.fallback = true; for (const rt of VEH.rts) rt.dispose(); VEH.rts = []; VEH.envOut = VEH.envCab = null; }
  }
  const pbr = VEH.pbr, P = VEH.pat = _vehPatterns(Qp.tex);
  // a material lit by an environment picture: remember its strength at noon
  const lit = (m, base, cab) => { m.envMapIntensity = base; VEH.base.set(m, { base, cab }); if (cab) m.onBeforeCompile = _cabEnvHook; return m; };
  const std = (o, base, cab) => lit(new THREE.MeshStandardMaterial({ ...o, envMap: cab ? VEH.envCab : VEH.envOut, vertexColors: cab }), base, cab);
  const kind = {
    plastic: (color, cab, extra = {}) => (pbr ? std({ color, roughness: 0.8, metalness: 0, normalMap: P.plastic.normal, normalScale: _v2(0.3), ...extra }, cab ? 1 : 0.6, cab)
      : new THREE.MeshLambertMaterial({ color, vertexColors: cab, ...extra })),
    gloss: (color, cab) => (pbr ? std({ color, roughness: 0.1, metalness: 0 }, cab ? 1 : 0.6, cab)
      : new THREE.MeshPhongMaterial({ color, specular: 0x777777, shininess: 110, vertexColors: cab })),
    leather: (color, map = null) => (pbr ? std({ color, map, roughness: 0.55, metalness: 0, normalMap: P.leather.normal, normalScale: _v2(0.6) }, 1, true)
      : new THREE.MeshPhongMaterial({ color, map, specular: 0x3a3a3a, shininess: 20, vertexColors: true })),
    fabric: (color, map = null) => (pbr ? std({ color, map, roughness: 0.95, metalness: 0, normalMap: P.fabric.normal, normalScale: _v2(0.4) }, 1, true)
      : new THREE.MeshLambertMaterial({ color, map, vertexColors: true })),
    rubber: (color, cab, map = null) => (pbr ? std({ color, map, roughness: 0.9, metalness: 0, normalMap: P.rubber.normal, normalScale: _v2(0.8) }, 0.6, cab)
      : new THREE.MeshLambertMaterial({ color, map, vertexColors: cab })),
    hairline: (color, phong) => (pbr ? std({ color, roughness: 0.35, metalness: 1, normalMap: P.hair.normal, normalScale: _v2(0.3) }, 1.2, true) : phong),
    polished: (color, rough, phong) => (pbr ? std({ color, roughness: rough, metalness: 1 }, 1, false) : phong),
    paint: () => (pbr ? lit(new THREE.MeshPhysicalMaterial({ color: PAINTS[paintName].color, roughness: 0.35, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMap: VEH.envOut }), 1, false)
      : new THREE.MeshPhongMaterial({ color: PAINTS[paintName].color, specular: 0x666666, shininess: 80, envMap: ENV, reflectivity: 0.2, combine: THREE.MixOperation })),
  };
  const phong = o => new THREE.MeshPhongMaterial(o), basic = o => new THREE.MeshBasicMaterial(o);
  const envPhong = (color, shininess, reflectivity, specular = 0xffffff) => phong({ color, specular, shininess, envMap: ENV, reflectivity, combine: THREE.MixOperation });

  Object.assign(TM, {
    paint: kind.paint(),
    trim: kind.paint(),          // grille slats and mirror covers: body colour, or chrome on the custom trim
    paintDark: phong({ color: 0x2a2c2f, specular: 0x333333, shininess: 40 }),
    chrome: kind.polished(0xe2e6e9, 0.08, envPhong(0xe2e6e9, 120, 0.75)),
    black: kind.plastic(0x131415, false),
    blackDS: kind.plastic(0x131415, false, { side: THREE.DoubleSide }),
    dark: kind.plastic(0x2c2e31, false),
    frame: kind.plastic(0x1c1d1f, false),
    bumper: kind.plastic(0x34373a, false),
    alu: kind.polished(0xc9cdd1, 0.3, envPhong(0xc9cdd1, 80, 0.35, 0xbbbbbb)),
    white: phong({ color: 0xeef0f0, specular: 0x444444, shininess: 40 }),
    tire: kind.rubber(0x18181a, false),
    rim: kind.polished(0xe4e7e9, 0.15, envPhong(0xe4e7e9, 90, 0.55)),
    glassOut: phong({ color: 0x0e171c, specular: 0xffffff, shininess: 110, envMap: ENV, reflectivity: 0.55, combine: THREE.MixOperation, transparent: true, opacity: 0.82, depthWrite: false }),
    glassIn: basic({ color: 0xcfe0ea, transparent: true, opacity: 0.05, depthWrite: false }),
    headOff: envPhong(0xd8dde0, 100, 0.5),
    headOn: basic({ color: 0xfff7e4 }),
    drl: basic({ color: 0xf2faff }),
    amberOff: phong({ color: 0x9a6512, specular: 0x888888, shininess: 80 }),
    amberOn: basic({ color: 0xffa51c }),
    redOff: phong({ color: 0x5c0e0e, specular: 0x888888, shininess: 80 }),
    redDim: basic({ color: 0xa8170f }),
    redOn: basic({ color: 0xff2b18 }),
    whiteOn: basic({ color: 0xffffff }),
    marker: basic({ color: 0xffa21a }),
    mirrorStatic: envPhong(0x8e98a0, 120, 0.9),
    trailerBody: phong({ map: TEX.alu, specular: 0x777777, shininess: 50 }),
    gloss: kind.gloss(0x0b0c0d, false),
    rubber: kind.rubber(0x17181a, false),
    mesh: phong({ map: TEX.mesh, specular: 0x333333, shininess: 30 }),
    chequer: phong({ map: TEX.chequer, specular: 0xffffff, shininess: 70, envMap: ENV, reflectivity: 0.2, combine: THREE.MixOperation }),
    reflector: phong({ map: TEX.reflector, specular: 0x888888, shininess: 60 }),
    ledRed: basic({ color: 0xff2a2a }),
    hoseY: phong({ color: 0xf0c018, specular: 0x666666, shininess: 50 }),
    hoseR: phong({ color: 0xc81e1e, specular: 0x666666, shininess: 50 }),
    hoseB: phong({ color: 0x1b1b1c, specular: 0x444444, shininess: 40 }),
    tank: envPhong(0xd3d8dc, 120, 0.6),   // the tanker trailer: trailers keep their materials
  });
  const ib = o => basic({ ...o, vertexColors: true }), ip = o => phong({ ...o, vertexColors: true });
  Object.assign(IM, {
    upper: kind.plastic(0x3b3d41, true),
    lower: kind.plastic(0x1c1d1f, true),
    head: kind.fabric(0xcac7c0, TEX.headW),
    cabinet: kind.plastic(0xd3d0c9, true),
    door: kind.plastic(0x2f3134, true),
    drawer: kind.plastic(0x2c2e31, true),
    seat: kind.leather(P.leather.map ? 0xffffff : 0x1b1b1c, P.leather.map),
    seatPlain: kind.leather(0x18181a),
    mattress: kind.fabric(0x34373d, TEX.headW),
    leather: kind.leather(0x1b1b1c),
    floor: kind.rubber(0xffffff, true, TEX.floor),
    mat: kind.rubber(0x121314, true),
    metal: kind.hairline(0xa5a9ad, ip({ color: 0xa5a9ad, specular: 0xffffff, shininess: 90, envMap: ENV, reflectivity: 0.35, combine: THREE.MixOperation })),
    silver: kind.hairline(0xc4c8cb, ip({ color: 0xc4c8cb, specular: 0xffffff, shininess: 100, envMap: ENV, reflectivity: 0.45, combine: THREE.MixOperation })),
    black: kind.plastic(0x0f1011, true),
    gloss: kind.gloss(0x0a0b0c, true),
    button: kind.plastic(0x1f2022, true),
    red: ip({ color: 0xb3141b, specular: 0x333333, shininess: 30 }),
    gold: ip({ color: 0xd8b04a, specular: 0xffffff, shininess: 80 }),
    curtain: kind.fabric(0x1a1b1d, TEX.fabric),
    can: ip({ color: 0x23365a, specular: 0xffffff, shininess: 70 }),
    ambient: ib({ color: 0xff1e2c }),
    tv: ib({ color: 0x0b1016 }),
    ledGreen: ib({ color: 0x3dff8a }),
    ledAmber: ib({ color: 0xffa21a }),
    lcdGreen: ib({ color: 0x46c07a }),
    lcdAmber: ib({ color: 0xd88a1c }),
    lcdBlue: ib({ color: 0x3a8ad8 }),
  });
  CAB_AMBIENT.on = null;
  applyPaint(paintName); applyInteriorTheme(interiorName);
}
function disposeVehicleMaterials() {
  for (const M of [TM, IM]) for (const k in M) if (M[k] && M[k].dispose) M[k].dispose();
  for (const t of VEH.tex) t.dispose();
  for (const rt of VEH.rts) rt.dispose();
  VEH.tex = []; VEH.rts = []; VEH.envOut = VEH.envCab = null; VEH.base.clear(); VEH.pat = {};
}

// Daylight (1 noon .. 0 night) and tunnel (0..1) set how strongly the environment pictures light the vehicle.
// While the cab's own lights are on (night, tunnels) the cab keeps at least 0.45 of its daytime fill.
function setVehicleLight(day, tunnel) {
  VEH.light = [day, tunnel];
  if (!VEH.pbr) return;
  const out = (0.12 + 0.88 * day) * (1 - 0.6 * tunnel), cab = Math.max((0.10 + 0.90 * day) * (1 - 0.5 * tunnel), CAB_AMBIENT.on ? 0.45 : 0);
  for (const [m, b] of VEH.base) m.envMapIntensity = b.base * (b.cab ? cab : out);
}
// Keep the cab's environment picture fixed to the tractor (call after the tractor's rotation is set).
const _vehM4 = new THREE.Matrix4();
function updateVehicleEnv(root) {
  if (!VEH.pbr) return;
  _vehM4.makeRotationFromQuaternion(root.quaternion);
  VEH.cabRot.value.setFromMatrix4(_vehM4).transpose();
}
// Parts made outside Parts (single meshes) get white vertex colours where their material expects them.
function fillVertexColors(root) {
  root.traverse(o => {
    if (!o.isMesh || !o.material.vertexColors || o.geometry.attributes.color) return;
    const n = o.geometry.attributes.position.count;
    o.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
  });
}

function applyPaint(name) {
  if (!PAINTS[name]) return;
  paintName = name; lsSet('nlh.paint', name);
  TM.paint.color.setHex(PAINTS[name].color);
  if (!VEH.pbr) TM.paint.reflectivity = name === 'white' ? 0.12 : 0.24;
  _trimLook();
}
// The trim material follows the paint on the normal trim and turns to chrome on the custom trim.
function _trimLook() {
  const m = TM.trim; if (!m) return;
  const chrome = trimName === 'custom';
  m.color.setHex(chrome ? 0xe2e6e9 : PAINTS[paintName].color);
  if (VEH.pbr) { m.metalness = chrome ? 1 : 0; m.roughness = chrome ? 0.08 : 0.35; m.clearcoat = chrome ? 0 : 1; }
  else m.reflectivity = chrome ? 0.75 : paintName === 'white' ? 0.12 : 0.24;
}
function applyInteriorTheme(name) {
  const th = INTERIOR_THEMES[name]; if (!th) return;
  interiorName = name; lsSet('nlh.interior', name);
  const P = VEH.pat, lm = P.leather && P.leather.map, qm = P.quilt && P.quilt.map;
  if (lm) { _drawLeather(lm.userData.c, th.stitch); lm.needsUpdate = true; }
  const quilted = th.quilt && !!qm;
  if (quilted) { _drawQuilt(qm.userData.c, th.upper); qm.needsUpdate = true; }
  for (const [m, c, plainMap] of [[IM.upper, th.upper, null], [IM.head, th.head, TEX.headW], [IM.cabinet, th.cabinet, null], [IM.door, th.door, null]]) {
    const want = quilted ? qm : plainMap;
    if (m.map !== want) { m.map = want; m.needsUpdate = true; }
    if (VEH.pbr) {
      const nm = quilted ? P.quilt.normal : m === IM.head ? P.fabric.normal : P.plastic.normal;
      if (m.normalMap !== nm) { m.normalMap = nm; m.needsUpdate = true; }
      m.roughness = quilted ? 0.6 : m === IM.head ? 0.95 : 0.8;
    }
    m.color.setHex(quilted ? (m === IM.head ? 0xe0d0d0 : 0xffffff) : c);
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
  if (VEH.light) setVehicleLight(VEH.light[0], VEH.light[1]);
}
// The trim: 'normal' (as in photos 7-9) or 'custom' (light bar, markers, chrome and a pinstripe livery).
// T, the tractor, shows or hides its decorations; its roof lamps light with the headlights only on 'custom'.
function applyTrim(name, T) {
  if (!TRIMS.includes(name)) return;
  trimName = name; lsSet('nlh.trim', name);
  _trimLook();
  if (T && T.deco) { T.deco.visible = name === 'custom'; T.lightbar = name === 'custom' ? T.barLamps : []; }
}

makeVehicleMaterials(qualityName);

// ---------------------------------------------------------------------------
// Renderer, quality presets, procedural textures and shared materials.
// ---------------------------------------------------------------------------
const QUALITY_PRESETS = {
  high: { dpr: 2, shadow: 2048, mirror: [256, 400], mirrorEvery: 1, trees: 1.0, houses: 1.0, traffic: 34, far: 1500, detail: 1.0, pbr: true, tex: 512, townCars: 25 },
  mid: { dpr: 1.5, shadow: 1024, mirror: [192, 300], mirrorEvery: 2, trees: 0.7, houses: 0.8, traffic: 26, far: 1250, detail: 0.6, pbr: true, tex: 256, townCars: 20 },
  low: { dpr: 1, shadow: 0, mirror: [128, 200], mirrorEvery: 3, trees: 0.45, houses: 0.6, traffic: 18, far: 1000, detail: 0.35, pbr: false, tex: 256, townCars: 15 },
};
let qualityName = lsGet('nlh.quality', IS_TOUCH ? 'mid' : 'high');
if (!QUALITY_PRESETS[qualityName]) qualityName = 'mid';
let Q = QUALITY_PRESETS[qualityName];

const canvasEl = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xc9d7e2, 140, Q.far);

function canvasTex(c, { repeat = false, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = Math.min(aniso, MAX_ANISO);
  return t;
}
function speckle(g, W, H, n, r, lo, hi, alo, ahi, seed) {
  const rr = rng(seed);
  for (let i = 0; i < n; i++) {
    const v = (lo + rr() * (hi - lo)) | 0;
    g.fillStyle = `rgba(${v},${v},${v},${alo + rr() * (ahi - alo)})`;
    const s = 1 + rr() * r;
    g.fillRect(rr() * W, rr() * H, s, s);
  }
}

const TEX = {};
// Carriageway: |lat| 1.5..12.2 (10.7 m) across, 20 m along.
TEX.road = (() => {
  const W = 512, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#4d4e51'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 30000, 2, 50, 120, 0.25, 0.6, 7);
  const pxm = W / 10.7;
  const track = xm => {
    const u = (xm - 1.5) * pxm;
    const grd = g.createLinearGradient(u - 22, 0, u + 22, 0);
    grd.addColorStop(0, 'rgba(28,28,30,0)'); grd.addColorStop(0.5, 'rgba(28,28,30,.26)'); grd.addColorStop(1, 'rgba(28,28,30,0)');
    g.fillStyle = grd; g.fillRect(u - 22, 0, 44, H);
  };
  [4.05, 7.65].forEach(cx => { track(cx - 0.9); track(cx + 0.9); });
  // shoulder slightly lighter, less worn
  g.fillStyle = 'rgba(120,120,118,.10)'; g.fillRect((9.6 - 1.5) * pxm, 0, W, H);
  // cracks / patches
  const rr = rng(11);
  g.strokeStyle = 'rgba(25,25,25,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 14; i++) { g.beginPath(); let x = rr() * W, y = rr() * H; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rr() - 0.5) * 30; y += rr() * 30; g.lineTo(x, y); } g.stroke(); }
  g.fillStyle = 'rgba(40,40,42,.35)'; g.fillRect(0.62 * W, 0.62 * H, 70, 120);
  const line = (xm, wm, dash) => {
    g.fillStyle = '#e9e8e0';
    const u = (xm - 1.5) * pxm, w = wm * pxm;
    if (!dash) g.fillRect(u - w / 2, 0, w, H); else g.fillRect(u - w / 2, 0, w, H * 8 / 20);
  };
  line(2.25, 0.15); line(5.85, 0.15, true); line(9.45, 0.2);
  speckle(g, W, H, 9000, 2, 40, 90, 0.15, 0.4, 13); // wear over the paint
  return canvasTex(c, { repeat: true, aniso: 16 });
})();
// Ramp lane: 5 m across (1.0 shoulder | 3.6 lane | 0.4), 24 m along.
function rampTexture(dashedRight) {
  const W = 256, H = 1024, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#4f5053'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 14000, 2, 50, 120, 0.25, 0.6, 21);
  const pxm = W / 5;
  g.fillStyle = '#e9e8e0';
  g.fillRect(1.0 * pxm - 0.075 * pxm, 0, 0.15 * pxm, H);
  if (dashedRight) { const w = 0.45 * pxm; g.fillRect(4.6 * pxm - w / 2, 0, w, H * 6 / 12 / 2); g.fillRect(4.6 * pxm - w / 2, H / 2, w, H * 6 / 12 / 2); }
  else g.fillRect(4.6 * pxm - 0.075 * pxm, 0, 0.15 * pxm, H);
  speckle(g, W, H, 4000, 2, 40, 90, 0.15, 0.4, 23);
  return canvasTex(c, { repeat: true, aniso: 16 });
}
TEX.rampA = rampTexture(true);
TEX.rampB = rampTexture(false);
TEX.zebra = (() => {
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#4f5053'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 1500, 2, 50, 120, 0.25, 0.6, 31);
  g.strokeStyle = '#e6e5dc'; g.lineWidth = 26;
  for (let k = -2; k < 3; k++) { g.beginPath(); g.moveTo(k * W, W); g.lineTo(k * W + W, 0); g.stroke(); }
  return canvasTex(c, { repeat: true });
})();
TEX.concrete = (() => {
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#c9c6bd'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 9000, 2, 140, 220, 0.15, 0.4, 41);
  const rr = rng(43);
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(90,85,75,${0.04 + rr() * 0.06})`; g.fillRect(rr() * W, rr() * W * 0.3, 6 + rr() * 30, 30 + rr() * 200); }
  return canvasTex(c, { repeat: true });
})();
TEX.grass = (() => {
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 16000, 3, 150, 255, 0.25, 0.6, 51);
  return canvasTex(c, { repeat: true });
})();
TEX.lattice = (() => { // 法枠: concrete lattice on cut slopes
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#5f7743'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 6000, 3, 60, 140, 0.2, 0.5, 61);
  g.fillStyle = '#b8b6ab';
  g.fillRect(0, 0, W, 22); g.fillRect(0, 0, 22, W);
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 22, W, 5); g.fillRect(22, 0, 5, W);
  return canvasTex(c, { repeat: true });
})();
TEX.soundwall = (() => {
  const W = 256, H = 128, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#8c978d'; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 2500, 2, 100, 170, 0.15, 0.4, 71);
  for (let x = 0; x < W; x += 64) { g.fillStyle = '#5e665f'; g.fillRect(x, 0, 6, H); }
  for (let y = 16; y < H; y += 24) { g.fillStyle = 'rgba(255,255,255,.08)'; g.fillRect(0, y, W, 3); }
  return canvasTex(c, { repeat: true });
})();
TEX.alu = (() => { // ribbed aluminium van body
  const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
  for (let x = 0; x < W; x += 16) {
    const grd = g.createLinearGradient(x, 0, x + 16, 0);
    grd.addColorStop(0, '#c4c9cd'); grd.addColorStop(0.45, '#e9ecee'); grd.addColorStop(0.8, '#aeb4b9'); grd.addColorStop(1, '#bfc4c8');
    g.fillStyle = grd; g.fillRect(x, 0, 16, H);
  }
  speckle(g, W, H, 3000, 2, 120, 200, 0.05, 0.15, 81);
  return canvasTex(c, { repeat: true });
})();
TEX.grain = (() => {
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 20000, 2, 60, 200, 0.3, 0.7, 91);
  return canvasTex(c, { repeat: true });
})();
TEX.fabric = (() => {
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 4) for (let x = 0; x < W; x += 4) {
    g.fillStyle = ((x + y) / 4) % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.12)';
    g.fillRect(x, y, 4, 4);
  }
  g.fillStyle = 'rgba(160,40,40,.5)'; for (let x = 0; x < W; x += 64) g.fillRect(x, 0, 2, W); // stitching
  speckle(g, W, W, 4000, 1, 30, 110, 0.2, 0.4, 101);
  return canvasTex(c, { repeat: true });
})();
TEX.floor = (() => {
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#1d1e20'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 8) { g.fillStyle = '#2a2b2e'; g.fillRect(0, y, W, 3); }
  return canvasTex(c, { repeat: true });
})();
TEX.headliner = (() => {
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#a7a8a6'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 5000, 1, 120, 200, 0.2, 0.5, 111);
  return canvasTex(c, { repeat: true });
})();
TEX.stripes = (() => { // cushion drum / gate bar
  const W = 64, H = 64, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f2c21b'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#151515'; g.fillRect(0, 0, W, H / 4); g.fillRect(0, H / 2, W, H / 4);
  return canvasTex(c, { repeat: true });
})();
TEX.townRoad = (() => { // town streets: plain worn asphalt, tiled every 8 m
  const W = 256, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#505154'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 9000, 1.6, 45, 125, 0.2, 0.55, 23);
  return canvasTex(c, { repeat: true, aniso: 8 });
})();
TEX.bay = (() => { // delivery bay: yellow hatching on asphalt
  const W = 128, c = makeCanvas(W, W), g = c.getContext('2d');
  g.fillStyle = '#4f5053'; g.fillRect(0, 0, W, W);
  speckle(g, W, W, 1500, 2, 50, 120, 0.25, 0.6, 151);
  g.strokeStyle = '#e8b81c'; g.lineWidth = 9;
  for (let k = -2; k < 3; k++) { g.beginPath(); g.moveTo(k * W, W); g.lineTo(k * W + W, 0); g.stroke(); }
  return canvasTex(c, { repeat: true });
})();
TEX.barStripes = (() => {
  const W = 128, H = 16, c = makeCanvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#f4f4f0'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#d42a22'; for (let x = 0; x < W; x += 32) g.fillRect(x, 0, 16, H);
  return canvasTex(c, { repeat: true });
})();

// Simple environment cube for reflections on paint, glass and water.
const ENV = (() => {
  const mk = (top, mid, bot) => {
    const c = makeCanvas(32, 32), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 32);
    grd.addColorStop(0, top); grd.addColorStop(0.5, mid); grd.addColorStop(0.56, '#6b6f62'); grd.addColorStop(1, bot);
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32); return c;
  };
  const side = mk('#7aa5d8', '#dfe9f0', '#3e4a35');
  const top = makeCanvas(32, 32); { const g = top.getContext('2d'); g.fillStyle = '#86aee0'; g.fillRect(0, 0, 32, 32); }
  const bot = makeCanvas(32, 32); { const g = bot.getContext('2d'); g.fillStyle = '#3a3f36'; g.fillRect(0, 0, 32, 32); }
  const t = new THREE.CubeTexture([side, side, top, bot, side, side]);
  t.needsUpdate = true;
  return t;
})();

const MAT = {
  road: new THREE.MeshPhongMaterial({ map: TEX.road, shininess: 6, specular: 0x222222 }),
  roadTun: new THREE.MeshBasicMaterial({ map: TEX.road, color: 0xc7965a }),
  rampA: new THREE.MeshPhongMaterial({ map: TEX.rampA, shininess: 6, specular: 0x222222, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  rampB: new THREE.MeshPhongMaterial({ map: TEX.rampB, shininess: 6, specular: 0x222222, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  zebra: new THREE.MeshLambertMaterial({ map: TEX.zebra, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
  concrete: new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0xd6d3ca }),
  median: new THREE.MeshLambertMaterial({ map: TEX.concrete, color: 0x9e9c94 }),
  guard: new THREE.MeshLambertMaterial({ color: 0xe8eae6, side: THREE.DoubleSide }),
  post: new THREE.MeshLambertMaterial({ color: 0xc8ccc8 }),
  antiglare: new THREE.MeshLambertMaterial({ color: 0x2f7a4e }),
  terrain: new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.grass }),
  lattice: new THREE.MeshLambertMaterial({ map: TEX.lattice, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
  grassFill: new THREE.MeshLambertMaterial({ color: 0x6d8a43, map: TEX.grass }),
  tree: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  house: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  roof: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  water: new THREE.MeshPhongMaterial({ color: 0x2b5a6c, specular: 0x8fb4c6, shininess: 70, envMap: ENV, reflectivity: 0.35, combine: THREE.MixOperation }),
  tunnel: new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.concrete, side: THREE.DoubleSide }),
  lamp: new THREE.MeshBasicMaterial({ color: 0xffb04a }),
  red: new THREE.MeshBasicMaterial({ color: 0xc8231c }),
  exitGreen: new THREE.MeshBasicMaterial({ color: 0x29c46a }),
  wallLow: new THREE.MeshLambertMaterial({ map: TEX.soundwall, side: THREE.DoubleSide }),
  wallHigh: new THREE.MeshLambertMaterial({ color: 0xd4e8ea, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
  signBack: new THREE.MeshLambertMaterial({ color: 0x8e928f }),
  steel: new THREE.MeshLambertMaterial({ color: 0xa3a8a5 }),
  steelDark: new THREE.MeshLambertMaterial({ color: 0x5d625f }),
  white: new THREE.MeshLambertMaterial({ color: 0xf2f2ee }),
  drum: new THREE.MeshLambertMaterial({ map: TEX.stripes }),
  bar: new THREE.MeshBasicMaterial({ map: TEX.barStripes }),
  black: new THREE.MeshLambertMaterial({ color: 0x1a1b1c }),
  bay: new THREE.MeshLambertMaterial({ map: TEX.bay, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
  bayLine: new THREE.MeshLambertMaterial({ color: 0xf2c21b, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 }),
  townRoad: new THREE.MeshLambertMaterial({ map: TEX.townRoad }),
  mark: new THREE.MeshLambertMaterial({ color: 0xeeeeea, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }),
  hedge: new THREE.MeshLambertMaterial({ color: 0x3f6a34 }),
  sigLamp: new THREE.MeshBasicMaterial({ color: 0xffffff }),
};
for (const k of ['road', 'rampA', 'rampB', 'zebra', 'concrete', 'median', 'terrain', 'lattice', 'grassFill']) MAT[k].userData.keep = true;

// Lights
const hemi = new THREE.HemisphereLight(0xcfe0f0, 0x5d5a40, 0.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 1.0);
sun.castShadow = Q.shadow > 0;
sun.shadow.mapSize.set(Math.max(512, Q.shadow), Math.max(512, Q.shadow));
{ const sc = sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 1; sc.far = 160; }
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun); scene.add(sun.target);
const SUN_DIR = new THREE.Vector3(0.4, 0.6, 0.5).normalize();

// Night: what shines back under the rig's own headlights (the reflectors, the big signs). nightUpdate sets NIGHT_U
// every frame: the headlights' place and direction, and how lit they are (0 by day or with the lights off).
const NIGHT_U = { uCar: { value: new THREE.Vector3(0, -1e5, 0) }, uDir: { value: new THREE.Vector2(0, 1) }, uLit: { value: 0 } };
// Make an unlit (Basic) material brighter by `gain` where it lies in the headlights: within about 18 degrees of their
// direction, from 8 to 160 m ahead.
function nightPatch(m, gain) {
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, NIGHT_U); sh.uniforms.uGain = { value: gain };
    sh.vertexShader = 'varying vec3 vNightW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 nightW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
      nightW = instanceMatrix * nightW;
      #endif
      vNightW = (modelMatrix * nightW).xyz;`);
    sh.fragmentShader = 'uniform vec3 uCar; uniform vec2 uDir; uniform float uLit; uniform float uGain; varying vec3 vNightW;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      { vec2 nd = vNightW.xz - uCar.xz; float dist = length(nd), c = dot(nd / max(dist, 0.001), uDir);
        float lit = uLit * smoothstep(0.94, 0.97, c) * smoothstep(8.0, 14.0, dist) * (1.0 - smoothstep(120.0, 160.0, dist));
        diffuseColor.rgb = mix(diffuseColor.rgb, min(vec3(1.0), diffuseColor.rgb * uGain), lit); }`);
  };
  m.customProgramCacheKey = () => 'night' + gain;
  return m;
}
// Sign materials that dim at night (they are unlit Basic materials); they brighten again in the headlights.
const SIGN_MATS = [];
const _texCache = new Map();
function cachedTex(key, w, h, draw) {
  if (_texCache.has(key)) return _texCache.get(key);
  const c = makeCanvas(w, h), g = c.getContext('2d');
  draw(g, w, h);
  const t = canvasTex(c, { aniso: 8 });
  const m = nightPatch(new THREE.MeshBasicMaterial({ map: t }), 3.2);
  m.userData.keep = true;
  SIGN_MATS.push(m);
  _texCache.set(key, m);
  return m;
}
const JP_FONT = '"BIZ UDPGothic","Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Meiryo","IPAGothic","Noto Sans JP",sans-serif';
const LED_FONT = '"DotGothic16","BIZ UDGothic","IPAGothic",monospace';
function font(px, w = 700) { return `${w} ${px}px ${JP_FONT}`; }
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
}
function greenSignBase(g, w, h) {
  g.fillStyle = '#0b6b42'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#f4f6f2'; g.lineWidth = Math.max(4, w * 0.008);
  roundRect(g, w * 0.02, w * 0.02, w - w * 0.04, h - w * 0.04, w * 0.03); g.stroke();
}
function fitText(g, text, maxW, px, weight = 700) {
  let p = px; g.font = font(p, weight);
  while (g.measureText(text).width > maxW && p > 10) { p -= 2; g.font = font(p, weight); }
  return p;
}

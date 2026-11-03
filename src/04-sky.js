// ---------------------------------------------------------------------------
// Sky dome, distant ridgelines, Mt. Fuji, clouds and time of day.
// World compass: the route starts heading +z, which we call west.
// north = -x, south = +x, east = -z.
// ---------------------------------------------------------------------------
const SKY = {};
(function buildSky() {
  const g = new THREE.SphereGeometry(2600, 32, 18);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  SKY.dome = new THREE.Mesh(g, mat);
  SKY.dome.renderOrder = -10;
  SKY.dome.frustumCulled = false;
  scene.add(SKY.dome);

  // sun disc
  const sc = makeCanvas(128, 128), sg = sc.getContext('2d');
  const grd = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,245,1)'); grd.addColorStop(0.18, 'rgba(255,250,225,1)'); grd.addColorStop(0.3, 'rgba(255,230,170,.35)'); grd.addColorStop(1, 'rgba(255,220,160,0)');
  sg.fillStyle = grd; sg.fillRect(0, 0, 128, 128);
  SKY.sunMat = new THREE.MeshBasicMaterial({ map: canvasTex(sc), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
  SKY.sun = new THREE.Mesh(new THREE.PlaneGeometry(420, 420), SKY.sunMat);
  SKY.sun.renderOrder = -9; SKY.sun.frustumCulled = false;
  scene.add(SKY.sun);

  // distant ridgelines: two rings at different radii
  const ring = (radius, hMin, hMax, seed, color) => {
    const N = 220, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = i / N * TAU;
      const h = hMin + (hMax - hMin) * fbm(Math.cos(a) * 3 + seed, Math.sin(a) * 3, 5, seed);
      const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
      pos.push(x, -260, z, x, h, z);
      if (i < N) { const b = i * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide }));
    m.renderOrder = -8; m.frustumCulled = false;
    scene.add(m);
    return m;
  };
  SKY.ridgeFar = ring(2350, 40, 380, 3, 0x8ea3b4);
  SKY.ridgeNear = ring(2150, 0, 230, 9, 0x7a8f9c);

  // Mt. Fuji (lathe), drawn at a fixed screen-distance in its true direction.
  const prof = [[0.001, 1.0], [0.06, 0.99], [0.14, 0.95], [0.26, 0.85], [0.42, 0.66], [0.6, 0.44], [0.8, 0.22], [1.0, 0.06], [1.15, 0.0], [1.15, -0.3]];
  const pts = prof.map(p => new THREE.Vector2(p[0], p[1]));
  const fg = new THREE.LatheGeometry(pts, 48);
  const cnt = fg.attributes.position.count, col = new Float32Array(cnt * 3);
  for (let i = 0; i < cnt; i++) {
    const y = fg.attributes.position.getY(i), x = fg.attributes.position.getX(i), z = fg.attributes.position.getZ(i);
    const a = Math.atan2(z, x);
    const snowLine = 0.74 + 0.05 * Math.sin(a * 7) + 0.03 * Math.sin(a * 17);
    const snow = y > snowLine ? 1 : 0;
    col[i * 3] = snow ? 0.95 : 0.42; col[i * 3 + 1] = snow ? 0.96 : 0.50; col[i * 3 + 2] = snow ? 0.98 : 0.62;
  }
  fg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  SKY.fujiMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, color: 0xffffff });
  SKY.fuji = new THREE.Mesh(fg, SKY.fujiMat);
  SKY.fuji.renderOrder = -7; SKY.fuji.frustumCulled = false;
  scene.add(SKY.fuji);
  // world position: north of the road near Gotemba
  const p = posAt(kpToS(92), 0, {});
  const i = idxAt(kpToS(92));
  SKY.fujiWorld = new THREE.Vector3(p.x - 15000 * 0.85 + RX[i] * 3000, 0, p.z + TZ[i] * 2500 + RZ[i] * 6000);
  SKY.fujiWorld.set(p.x + RX[i] * 15500 + TX[i] * 2000, -600, p.z + RZ[i] * 15500 + TZ[i] * 2000);

  // cloud deck
  const cc = makeCanvas(512, 512), cg = cc.getContext('2d');
  const img = cg.createImageData(512, 512);
  for (let y = 0; y < 512; y++) for (let x = 0; x < 512; x++) {
    const v = fbm(x / 64, y / 64, 5, 5);
    const a = clamp((v - 0.52) * 3.2, 0, 1);
    const o = (y * 512 + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = a * 220;
  }
  cg.putImageData(img, 0, 0);
  const ct = canvasTex(cc, { repeat: true });
  ct.repeat.set(3, 3);
  SKY.cloudMat = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: 0.8 });
  SKY.clouds = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), SKY.cloudMat);
  SKY.clouds.rotation.x = Math.PI / 2;
  SKY.clouds.renderOrder = -6; SKY.clouds.frustumCulled = false;
  scene.add(SKY.clouds);
})();

const TOD = { hours: 13.5, sunElev: 0.5, night: 0, dusk: 0, tunnel: 0, fogColor: new THREE.Color(), lampsOn: false };
const _c1 = new THREE.Color(), _c2 = new THREE.Color(), _c3 = new THREE.Color();
function mixHex(a, b, t, out) { return out.set(a).lerp(_c3.set(b), t); }

function applyTimeOfDay(hours, tunnelBlend) {
  TOD.hours = hours;
  // November in Shizuoka: sunrise ~6:10, sunset ~16:40, noon elevation ~37°
  const rise = 6.15, set = 16.7, noon = (rise + set) / 2;
  const f = (hours - rise) / (set - rise);
  const elev = Math.sin(clamp(f, -0.25, 1.25) * Math.PI) * 37 * DEG;
  const az = (90 + clamp(f, -0.2, 1.2) * 180) * DEG;          // east -> south -> west
  const ce = Math.cos(elev);
  SUN_DIR.set(-Math.cos(az) * ce, Math.sin(elev), -Math.sin(az) * ce).normalize();
  TOD.sunElev = elev;
  const day = smooth(-4 * DEG, 10 * DEG, elev);         // 0 night .. 1 day
  const golden = (1 - smooth(4 * DEG, 18 * DEG, elev)) * smooth(-6 * DEG, 2 * DEG, elev);
  TOD.night = 1 - day; TOD.dusk = golden;
  TOD.lampsOn = elev < 6 * DEG;

  const top = _c1, hor = _c2;
  mixHex(0x0a1224, 0x4f86cc, day, top);
  mixHex(0x1a2540, 0xc7d9e6, day, hor);
  if (golden > 0) { top.lerp(_c3.set(0x56628e), golden * 0.6); hor.lerp(_c3.set(0xf2a466), golden * 0.85); }

  // sky dome colours by height and closeness to the sun
  const g = SKY.dome.geometry, P = g.attributes.position, C = g.attributes.color;
  const sx = SUN_DIR.x, sy = SUN_DIR.y, sz = SUN_DIR.z;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);
    const l = Math.hypot(x, y, z), ny = y / l;
    const t = clamp(ny, 0, 1);
    const k = Math.pow(1 - t, 3);
    let r = top.r + (hor.r - top.r) * k, gg = top.g + (hor.g - top.g) * k, b = top.b + (hor.b - top.b) * k;
    const cosS = (x * sx + y * sy + z * sz) / l;
    const glow = Math.pow(clamp(cosS, 0, 1), 12) * (0.35 + golden * 0.6) * (0.3 + day * 0.7);
    r += glow * 1.0; gg += glow * 0.8; b += glow * 0.55;
    if (ny < 0) { const d = clamp(-ny * 4, 0, 1); r = lerp(r, hor.r * 0.55, d); gg = lerp(gg, hor.g * 0.55, d); b = lerp(b, hor.b * 0.6, d); }
    C.setXYZ(i, Math.min(r, 1), Math.min(gg, 1), Math.min(b, 1));
  }
  C.needsUpdate = true;

  TOD.fogColor.copy(hor);
  const tb = tunnelBlend || 0;
  scene.fog.color.copy(hor).lerp(_c3.set(0x2a1e10), tb);
  SKY.sunMat.opacity = clamp(day * 1.2, 0, 1) * (1 - tb);
  SKY.sunMat.color.set(golden > 0.3 ? 0xffc890 : 0xffffff);
  SKY.ridgeFar.material.color.copy(hor).lerp(_c3.set(0x5d6f7c), 0.35 * day + 0.15).multiplyScalar(0.55 + 0.45 * day);
  SKY.ridgeNear.material.color.copy(hor).lerp(_c3.set(0x46576a), 0.5 * day + 0.2).multiplyScalar(0.5 + 0.5 * day);
  SKY.fujiMat.color.copy(_c3.set(0xffffff).lerp(hor, 0.35)).multiplyScalar(0.25 + 0.75 * day);
  if (golden > 0) SKY.fujiMat.color.lerp(_c3.set(0xffb08a), golden * 0.35);
  SKY.cloudMat.color.copy(_c3.set(0xffffff)).lerp(_c3.set(0xffb488), golden * 0.7).multiplyScalar(0.25 + 0.75 * day);
  SKY.cloudMat.opacity = 0.75;

  // lights
  const sunI = day * (0.55 + 0.45 * smooth(5 * DEG, 30 * DEG, elev));
  sun.intensity = sunI * (1 - tb);
  sun.color.set(0xfff1dc).lerp(_c3.set(0xffb06a), golden * 0.8);
  hemi.intensity = lerp(0.18, 0.72, day) * (1 - tb * 0.55);
  hemi.color.set(0xcfe0f0).lerp(_c3.set(0x7f8fb8), 1 - day).lerp(_c3.set(0xffb25a), tb * 0.85);
  hemi.groundColor.set(0x5d5a40).lerp(_c3.set(0x15140f), 1 - day).lerp(_c3.set(0x6a4520), tb * 0.7);
  const signB = lerp(0.32, 1.0, day) * (1 - tb * 0.2);
  for (const m of SIGN_MATS) m.color.setScalar(signB);
  MAT.lamp.color.set(0xffb04a);
}

function updateSkyFollow(cam) {
  SKY.dome.position.copy(cam.position);
  SKY.ridgeFar.position.set(cam.position.x, cam.position.y * 0.15 - 40, cam.position.z);
  SKY.ridgeNear.position.set(cam.position.x, cam.position.y * 0.15 - 40, cam.position.z);
  SKY.sun.position.copy(cam.position).addScaledVector(SUN_DIR, 2400);
  SKY.sun.lookAt(cam.position);
  SKY.clouds.position.set(cam.position.x, cam.position.y + 900, cam.position.z);
  SKY.cloudMat.map.offset.set(cam.position.x / 9000 * 3 + performance.now() * 0.0000025, cam.position.z / 9000 * 3);
  // Fuji: true bearing and angular size, drawn at 2200 m
  const dx = SKY.fujiWorld.x - cam.position.x, dz = SKY.fujiWorld.z - cam.position.z;
  const d = Math.hypot(dx, dz);
  const k = 2200 / d;
  SKY.fuji.position.set(cam.position.x + dx * k, cam.position.y + (SKY.fujiWorld.y - cam.position.y) * k, cam.position.z + dz * k);
  SKY.fuji.scale.set(9500 * k, 4300 * k, 9500 * k);
}

// ---------------------------------------------------------------------------
// Game layer: jobs, cameras, lights, HUD, gates, results, main loop.
// ---------------------------------------------------------------------------
const TRK = buildTractor();
const INT = buildInterior(TRK);
const TRL = buildTrailer();
scene.add(TRK.root); scene.add(TRL.root);
INT.cluster.material = new THREE.MeshBasicMaterial({ map: DASH.tex });
INT.nav.material = new THREE.MeshBasicMaterial({ map: DASH.ntex });
setupMirrors(TRK);

const cabCam = new THREE.PerspectiveCamera(62, 1, 0.04, 5200);
cabCam.rotation.order = 'YXZ';
INT.eye.add(cabCam);
const chaseCam = new THREE.PerspectiveCamera(55, 1, 0.3, 5200);
scene.add(chaseCam);
let activeCam = chaseCam;

const JOBS = [
  { from: 0, to: 4, cargo: '精密機器', mass: 12 },
  { from: 4, to: 7, cargo: '自動車部品', mass: 18 },
  { from: 7, to: 9, cargo: '静岡茶', mass: 10 },
  { from: 9, to: 12, cargo: '楽器（ピアノ）', mass: 9 },
];
function jobInfo(j) {
  const a = ICS[j.from], b = ICS[j.to];
  const km = b.kp - a.kp;
  return { ...j, a, b, km, pay: Math.round((km * 520 + j.mass * 900) / 100) * 100 };
}
const etcFare = km => Math.round((150 + km * 24.6) * 1.65 * 1.1 / 10) * 10;

const GAME = {
  state: 'loading', cam: 'cab', clock: 13.5 * 3600, money: lsGet('nlh.money', 0), jobIdx: lsGet('nlh.job', 0) % JOBS.length,
  job: null, blink: 0, hazard: false, lights: false, wiper: false, wiperPhase: 0, blinkT: 0, blinkOn: false,
  tunnelBlend: 0, lastTB: -1, todT: 0, hudT: 0, dashT: 0, navT: 0, overT: 0, fineCool: 0, eventCool: 0,
  chaseYaw: 0, chaseDist: 20, chaseH: 0, engineOn: false, prevState: 'drive', orbit: 0,
};

// ---- jobs -------------------------------------------------------------------
function setupJob(idx) {
  const j = jobInfo(JOBS[idx]);
  GAME.job = { ...j, fines: 0, toll: 0, missPen: 0, startClock: GAME.clock, due: GAME.clock + j.km / 70 * 3600 };
  TR.mass = 15500 + j.mass * 1000; TR.gcw = TR.mass;
  TR.damage = 0;
  const s = j.from === 0 ? S0 + 40 : ICS[j.from].s + 450;
  const lat = j.from === 0 ? X_TRV : -10.75;
  placeTruck(s, lat, 0);
  for (const r of RAMPS) { r.gateOpen = 0; r.gateState = 'closed'; r.passed = false; if (r.barPivot) r.barPivot.rotation.z = 0; }
  GAME.blink = 0; GAME.hazard = j.from !== 0; GAME.autoHazard = GAME.hazard;
  resetTraffic();
  fillJobCard();
}
function fillJobCard() {
  const j = GAME.job;
  $('jobNo').textContent = 'No.' + (GAME.jobIdx + 1);
  $('jFrom').textContent = j.a.jp; $('jTo').textContent = j.b.jp;
  $('jCargo').textContent = j.cargo; $('jMass').textContent = j.mass + ' t';
  $('jDist').textContent = j.km.toFixed(1) + ' km'; $('jPay').textContent = yen(j.pay);
  $('moneyStart').textContent = yen(GAME.money);
}
function destRamp() { return RAMPS[GAME.job.to - 1]; }

async function preloadAround(label) {
  $('loading').hidden = false;
  let left = 99, n = 0;
  while (left > 0) {
    left = updateChunks(TR.s, 2);
    n += 2;
    $('loadText').textContent = (label || '地図を作成中') + '… ' + Math.min(99, Math.round(n / (n + left) * 100)) + '%';
    await new Promise(r => setTimeout(r, 0));
  }
  $('loading').hidden = true;
}

// ---- LED info board toasts ---------------------------------------------------
let ledTimer = 0;
function led(text, warn = false, dur = 3.6) {
  const el = $('led');
  $('ledText').textContent = text;
  el.classList.toggle('warn', !!warn);
  el.hidden = false; el.style.opacity = '1';
  ledTimer = dur;
}

// ---- actions ------------------------------------------------------------------
const CAMS = ['cab', 'chase', 'far'];
function setCam(c) {
  GAME.cam = c;
  $('speedo').hidden = c === 'cab' || GAME.state !== 'drive';
  if (c !== 'cab') GAME.chaseH = TR.h;
  led(c === 'cab' ? '車内視点' : c === 'chase' ? '後方視点' : '遠景視点', false, 1.2);
}
function handleActions() {
  while (INP.actions.length) {
    const a = INP.actions.shift();
    const drv = GAME.state === 'drive';
    if (a === 'menu') { toggleMenu(); continue; }
    if (!drv && a !== 'hornOff') continue;
    switch (a) {
      case 'blinkL': GAME.blink = GAME.blink === -1 ? 0 : -1; break;
      case 'blinkR': GAME.blink = GAME.blink === 1 ? 0 : 1; break;
      case 'hazard': GAME.hazard = !GAME.hazard; GAME.autoHazard = false; break;
      case 'cruise':
        if (!TR.cruise) {
          if (TR.v * 3.6 >= 30 && TR.dir === 1) { TR.cruise = true; TR.cruiseV = Math.min(TR.v, VMAX); TR.cruiseI = 0; led('クルーズ ' + Math.round(TR.cruiseV * 3.6) + ' km/h'); }
          else led('クルーズは30km/h以上で使えます');
        } else { TR.cruise = false; led('クルーズ解除'); }
        break;
      case 'cruiseUp': case 'cruiseDown':
        if (TR.cruise) { TR.cruiseV = clamp(TR.cruiseV + (a === 'cruiseUp' ? 1 : -1) / 3.6, 30 / 3.6, VMAX); led('クルーズ ' + Math.round(TR.cruiseV * 3.6) + ' km/h', false, 1.2); }
        break;
      case 'camera': setCam(CAMS[(CAMS.indexOf(GAME.cam) + 1) % CAMS.length]); break;
      case 'cam1': setCam('cab'); break;
      case 'cam2': setCam('chase'); break;
      case 'cam3': setCam('far'); break;
      case 'lights': GAME.lights = !GAME.lights; break;
      case 'wiper': GAME.wiper = !GAME.wiper; break;
      case 'dir':
        if (Math.abs(TR.v) < 0.6) { TR.dir = TR.dir === 1 ? -1 : 1; TR.cruise = false; led(TR.dir === -1 ? '後退（R）' : '前進（D）', false, 1.5); }
        else led('止まってから切り替えてください');
        break;
      case 'hornOn': setHorn(true); break;
      case 'hornOff': setHorn(false); break;
      case 'lookReset': INP.lookYaw = 0; INP.lookPitch = GAME.cam === 'cab' ? -0.2 : -0.1; break;
      case 'zoomIn': GAME.chaseDist = clamp(GAME.chaseDist - 2, 12, 45); break;
      case 'zoomOut': GAME.chaseDist = clamp(GAME.chaseDist + 2, 12, 45); break;
    }
  }
}

// ---- gates, exits, violations ------------------------------------------------------
function gameLogic(dt) {
  const j = GAME.job;
  const r = rampAt(TR.s);
  TR.onRamp = !!r && TR.lat < -13.4;
  // missed the destination exit
  const dr = destRamp();
  if (!TR.onRamp && TR.s > dr.sDiv + dr.uSep + 30 && TR.s < dr.sEnd + 200 && TR.lat > -12.6) {
    if (j.to < ICS.length - 1) {
      j.missPen += Math.round(j.pay * 0.15 / 100) * 100;
      j.to += 1; j.b = ICS[j.to];
      j.due += (j.b.kp - ICS[j.to - 1].kp) / 70 * 3600;
      led(`出口を通過。次の${j.b.jp}ICで降ります`, true, 5);
    } else {
      led('出口を通過しました。手前に戻ります', true, 4);
      j.missPen += 5000;
      placeTruck(dr.sDiv - 500, X_TRV, 15);
    }
  }
  if (TR.onRamp) {
    const dg = r.sGate - TR.frontS;
    const kmh = Math.abs(TR.v) * 3.6;
    if (r.gateState === 'closed' && dg < 30 && dg > -1) {
      if (kmh <= 22) {
        r.gateState = 'open'; sfxChime();
        const fare = r.ic.i === j.to ? etcFare(j.km) : 0;
        if (fare) { j.toll = fare; led('ETC 料金 ' + yen(fare)); }
      } else if (dg < 7) {
        r.gateState = 'broken'; sfxThump(2); TR.damage = Math.min(100, TR.damage + 2.5); TR.v *= 0.8;
        j.fines += 8000;
        if (r.ic.i === j.to) j.toll = etcFare(j.km);
        led('開閉バーに接触！ETCは20km/h以下で', true, 4.5);
      }
    }
    if (!r.passed && TR.s > r.sGate + 6) {
      r.passed = true;
      if (r.ic.i === j.to) completeJob(); else wrongExit(r);
    }
  }
  for (const q of RAMPS) {
    if (q.barPivot) { q.gateOpen = damp(q.gateOpen, q.gateState === 'closed' ? 0 : 1, q.gateState === 'broken' ? 14 : 4, dt); q.barPivot.rotation.z = -q.gateOpen * (q.gateState === 'broken' ? 1.2 : 1.45); }
    if (q.gateState !== 'closed' && Math.abs(TR.s - q.sGate) > 600) { q.gateState = 'closed'; q.passed = false; }
  }
  if (GAME.autoHazard && TR.v > 14) { GAME.hazard = false; GAME.autoHazard = false; }
  // speeding (trucks: 90, or the posted limit if lower)
  const lim = Math.min(90, regionAt(TR.s, {}).lim);
  GAME.limit = lim;
  if (TR.v * 3.6 > lim + 12) { GAME.overT += dt; if (GAME.overT > 4 && GAME.fineCool <= 0) { j.fines += 9000; led(`速度超過（制限${lim}km/h）罰金 ¥9,000`, true, 4); GAME.fineCool = 45; } }
  else GAME.overT = 0;
  GAME.fineCool -= dt;
}
function wrongExit(r) {
  GAME.job.fines += 5000;
  led(`${r.ic.jp}ICは目的地ではありません。Uターン扱い ¥5,000`, true, 5);
  placeTruck(r.ic.s + 450, -10.75, 0);
  resetTraffic();
}
function processEvents() {
  GAME.eventCool -= 1 / 60;
  while (EVENTS.length) {
    const e = EVENTS.shift();
    if (e.t === 'rail') { sfxScrape(); if (e.hit > 1.2 && GAME.eventCool <= 0) { led('ガードレールに接触', true, 2); GAME.eventCool = 2; } }
    else if (e.t === 'car') { sfxThump(e.hit); if (GAME.eventCool <= 0) { const f = Math.min(30000, Math.round(e.hit * 1500 / 100) * 100 + 2000); if (GAME.job) GAME.job.fines += f; led('接触事故！ 損害 ' + yen(f), true, 3); GAME.eventCool = 2.5; } }
    else if (e.t === 'crash') { sfxThump(3); led('衝突しました', true, 2); }
    else if (e.t === 'cruiseOff') { led('クルーズ解除', false, 1.5); }
  }
}

function completeJob() {
  const j = GAME.job;
  const late = Math.max(0, GAME.clock - j.due) / 60;
  const timeAdj = late > 0 ? -Math.round(Math.min(0.4, late / 5 * 0.02) * j.pay / 100) * 100 : Math.round(j.pay * 0.08 / 100) * 100;
  const dmgCost = Math.round(TR.damage * j.pay * 0.008 / 100) * 100;
  const total = j.pay + timeAdj - dmgCost - j.fines - j.toll - j.missPen;
  GAME.money += total;
  lsSet('nlh.money', GAME.money);
  const rows = [
    ['基本報酬', j.pay],
    [late > 0 ? `遅延（${Math.round(late)}分）` : '早着ボーナス', timeAdj],
    ['高速料金（ETC）', -j.toll],
    [`車両の損傷（${Math.round(TR.damage)}%）`, -dmgCost],
    ['違反・事故', -j.fines],
  ];
  if (j.missPen) rows.push(['出口の通過', -j.missPen]);
  $('resRows').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><span class="${v < 0 ? 'neg' : ''}">${v === 0 ? '—' : yen(v)}</span></div>`).join('') +
    `<div class="tot"><span>今回の利益</span><span>${yen(total)}</span></div>`;
  $('resRoute').textContent = `${j.a.jp} → ${j.b.jp}　${j.cargo} ${j.mass}t`;
  $('resTitle').textContent = '配送完了';
  const notes = ['おつかれさまでした。', '荷主から「丁寧な運転でした」との連絡がありました。', '定刻どおりの到着です。'];
  $('resNote').textContent = late > 0 ? '少し遅れましたが、荷物は無事に届きました。' : TR.damage < 2 && j.fines === 0 ? notes[1] : notes[0];
  $('moneyRes').textContent = yen(GAME.money);
  GAME.state = 'result';
  TR.v = 0; TR.cruise = false;
  setHorn(false);
  showHud(false);
  $('menuOv').hidden = true;
  $('resultOv').hidden = false;
  $('nextBtn').focus();
}
$('nextBtn').addEventListener('click', async () => {
  $('resultOv').hidden = true;
  GAME.jobIdx = (GAME.jobIdx + 1) % JOBS.length;
  lsSet('nlh.job', GAME.jobIdx);
  const h = (GAME.clock / 3600) % 24;
  if (GAME.jobIdx === 0 || h > 19.5 || h < 6) {
    const day = Math.floor(GAME.clock / 86400) + 1;
    GAME.clock = day * 86400 + (GAME.jobIdx === 0 ? 8.5 : 7.5) * 3600;
  }
  setupJob(GAME.jobIdx);
  GAME.state = 'loading';
  await preloadAround(GAME.jobIdx === 0 ? '東京へ回送中' : '次の積み地へ移動中');
  GAME.state = 'drive';
  showHud(true);
  led(GAME.job.a.jp + 'ICから本線へ。' + GAME.job.b.jp + 'ICを目指してください', false, 5);
});

// ---- menu and settings ------------------------------------------------------
function toggleMenu() {
  if (GAME.state === 'menu') { $('menuOv').hidden = true; GAME.state = GAME.prevState; showHud(GAME.state === 'drive'); return; }
  if (GAME.state !== 'drive') return;
  GAME.prevState = GAME.state; GAME.state = 'menu';
  setHorn(false);
  $('menuOv').hidden = false; showHud(false);
  $('resumeBtn').focus();
}
$('resumeBtn').addEventListener('click', toggleMenu);
$('restartBtn').addEventListener('click', async () => {
  $('menuOv').hidden = true;
  GAME.clock = GAME.job.startClock;
  setupJob(GAME.jobIdx);
  GAME.state = 'loading';
  await preloadAround('やり直し');
  GAME.state = 'drive'; showHud(true);
});
$('volRange').value = Math.round(AUD.vol * 100);
$('volRange').addEventListener('input', e => setVolume(e.target.value / 100));
$('sensRange').value = Math.round(INP.sens * 100);
$('sensRange').addEventListener('input', e => { INP.sens = e.target.value / 100; lsSet('nlh.sens', INP.sens); });
function setQuality(name) {
  if (!QUALITY_PRESETS[name]) return;
  qualityName = name; Q = QUALITY_PRESETS[name]; lsSet('nlh.quality', name);
  for (const seg of ['qualSeg', 'qualSeg2']) for (const b of $(seg).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.q === name));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.dpr));
  const sh = Q.shadow > 0;
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); }); }
  sun.castShadow = sh;
  if (sh && sun.shadow.map && sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  sun.shadow.mapSize.set(Math.max(512, Q.shadow), Math.max(512, Q.shadow));
  scene.fog.far = Q.far;
  resizeMirrors();
  if (GAME.state !== 'loading') resetTraffic();
  onResize();
}
for (const seg of ['qualSeg', 'qualSeg2']) $(seg).addEventListener('click', e => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.q); });
function syncSeg(ids, value) { for (const id of ids) for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === value)); }
for (const id of ['paintSeg', 'paintSeg2']) $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { applyPaint(b.dataset.v); syncSeg(['paintSeg', 'paintSeg2'], paintName); } });
for (const id of ['intSeg', 'intSeg2']) $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { applyInteriorTheme(b.dataset.v); syncSeg(['intSeg', 'intSeg2'], interiorName); } });

// ---- HUD ------------------------------------------------------------------------
function showHud(on) {
  $('jobSign').hidden = !on; $('topbar').hidden = !on;
  $('speedo').hidden = !on || GAME.cam === 'cab';
  $('touch').hidden = !on || !INP.usingTouch;
}
function gearText() { if (TR.dir === -1) return 'R'; if (TR.dir === 0) return 'N'; return 'A' + (TR.shiftT > 0 ? TR.nextGear : TR.gear); }
function updateHud() {
  const j = GAME.job; if (!j) return;
  $('jsDest').textContent = j.b.jp; $('jsEn').textContent = j.b.en;
  const rem = Math.max(0, destRamp().sGate - TR.s) * SCALE / 1000;
  $('jsKm').textContent = rem.toFixed(1);
  $('jsClock').textContent = fmtClock(GAME.clock);
  $('jsDue').textContent = fmtClock(j.due);
  $('jsDueWrap').classList.toggle('late', GAME.clock > j.due);
  $('spdNum').textContent = Math.round(Math.abs(TR.v) * 3.6);
  $('spdGear').textContent = gearText();
  $('spdLim').textContent = GAME.limit || 90;
  const pr = (id, v) => $(id).setAttribute('aria-pressed', String(!!v));
  pr('bCruise', TR.cruise); pr('bLights', GAME.lights); pr('bWiper', GAME.wiper); pr('bHazard', GAME.hazard);
  pr('tBlinkL', GAME.blink === -1); pr('tBlinkR', GAME.blink === 1);
  $('tGear').textContent = TR.dir === -1 ? 'R' : 'D';
  $('rotateHint').hidden = !(INP.usingTouch && innerHeight > innerWidth);
}
function navState() {
  const j = GAME.job;
  const dr = destRamp();
  let guide = '', gd = '';
  if (TR.onRamp) { guide = rampAt(TR.s).ic.i === j.to ? '料金所 ETCは20km/h以下' : '目的地ではない出口です'; gd = Math.max(0, Math.round(rampAt(TR.s).sGate - TR.s) * 10) + ' m'; }
  else {
    const nr = RAMPS.find(r => r.sDiv + r.uSep > TR.s);
    if (nr && nr.ic.i === j.to) { guide = `${nr.ic.jp} IC 出口は左`; }
    else if (nr) guide = `次 ${nr.ic.jp} IC　そのまま直進`;
    if (nr) { const d = Math.max(0, nr.sDiv - TR.s) * SCALE / 1000; gd = d < 1 ? Math.round(d * 1000 / 10) * 10 + ' m' : d.toFixed(1) + ' km'; }
  }
  const rem = Math.max(0, dr.sGate - TR.s) * SCALE / 1000;
  const eta = GAME.clock + rem / 80 * 3600;
  return {
    x: TR.x, z: TR.z, heading: TR.h, s: TR.s, destS: dr.sGate, destIc: j.to,
    guide, guideDist: gd, footer: `${j.b.jp} IC まで ${rem.toFixed(1)} km　到着予定 ${fmtClock(eta)}`, limit: GAME.limit || 90,
  };
}

// ---- visuals ------------------------------------------------------------------------
function updateVisuals(dt) {
  const T = TRK.root;
  T.position.set(TR.x, TR.y, TR.z);
  T.rotation.set(TR.pitch, TR.h + Math.PI, 0);
  TRK.cabPivot.rotation.set(TR.cab.p, 0, TR.cab.r);
  TRK.cabPivot.position.y = 1.25 + TR.cab.hy;
  for (const w of TRK.spin) w.rotation.x = -TR.spin;
  for (const s of TRK.steer) s.rotation.y = -TR.steer;
  const hx = TR.x + Math.sin(TR.h) * HITCH, hz = TR.z + Math.cos(TR.h) * HITCH;
  TRL.root.position.set(hx, elevAt(TR.s + HITCH), hz);
  TRL.root.rotation.set(TR.tr.pitch, TR.tr.h + Math.PI, 0);
  for (const w of TRL.spin) w.rotation.x = -TR.spin;
  INT.wheel.rotation.z = -TR.steer * 18;
  INT.gas.rotation.x = 0.75 - INP.throttle * 0.28;
  INT.brake.rotation.x = INP.brake * 0.3;
  // omamori pendulum
  const cs = INT.charmState, w2 = 75;
  cs.vx += (-w2 * (cs.ax - (-TR.accel / 9.81) * 0.8) - 2.2 * cs.vx) * dt; cs.ax += cs.vx * dt;
  cs.vz += (-w2 * (cs.az - (TR.latAcc / 9.81) * 0.8 - TR.cab.r) - 2.2 * cs.vz) * dt; cs.az += cs.vz * dt;
  cs.vx += (vnoise(TR.s * 0.6, 3, 1) - 0.5) * Math.min(1, Math.abs(TR.v) / 20) * dt * 6;
  INT.charm.rotation.set(clamp(cs.ax, -0.9, 0.9), 0, clamp(cs.az, -0.9, 0.9));
  // wipers
  if (GAME.wiper || GAME.wiperPhase % TAU > 0.05) { GAME.wiperPhase += dt * TAU / 1.3; if (!GAME.wiper && GAME.wiperPhase % TAU < 0.1) GAME.wiperPhase = 0; }
  const wa = -(1 - Math.cos(GAME.wiperPhase)) / 2 * 1.45;
  for (const p of TRK.wipers) p.rotation.z = wa;
  // blinkers
  GAME.blinkT += dt;
  const active = GAME.blink !== 0 || GAME.hazard;
  const on = active && (GAME.blinkT % 0.76) < 0.4;
  if (on !== GAME.blinkOn) { GAME.blinkOn = on; if (active && GAME.state === 'drive') sfxTick(on); }
  const L = on && (GAME.blink < 0 || GAME.hazard), R = on && (GAME.blink > 0 || GAME.hazard);
  for (const m of TRK.blinkL) m.material = L ? TM.amberOn : TM.amberOff;
  for (const m of TRK.blinkR) m.material = R ? TM.amberOn : TM.amberOff;
  for (const m of TRL.blinkL) m.material = L ? TM.amberOn : TM.amberOff;
  for (const m of TRL.blinkR) m.material = R ? TM.amberOn : TM.amberOff;
  // lamps
  const lamps = GAME.lights || TOD.lampsOn || GAME.tunnelBlend > 0.3;
  GAME.lampsOn = lamps;
  for (const m of TRK.heads) m.material = lamps ? TM.headOn : TM.headOff;
  for (const m of TRK.lightbar) m.material = lamps ? TM.headOn : TM.headOff;
  TM.ledRed.color.setRGB(lamps ? 1 : 0.6, lamps ? 0.13 : 0.08, lamps ? 0.13 : 0.08);
  setCabAmbient(lamps);
  TRK.spot.intensity = lamps ? 2.6 : 0;
  const braking = INP.brake > 0.08 || TR.ret > 0.3;
  for (const m of TRL.tail) m.material = braking ? TM.redOn : lamps ? TM.redDim : TM.redOff;
  for (const m of TRL.rev) m.material = TR.dir === -1 ? TM.whiteOn : TM.white;
  TM.marker.color.setScalar(lamps ? 1 : 0.55);
  updateCarVisuals(lamps ? 1 : 0.62);
}

const _cv = new THREE.Vector3(), _ct = new THREE.Vector3();
function updateCamera(dt) {
  const ov = window.__camOverride; // dev hook: {p:[x,y,z], t:[x,y,z]} in tractor-local coordinates
  if (ov) {
    const m = TRK.root.matrixWorld;
    chaseCam.position.set(...ov.p).applyMatrix4(m);
    _ct.set(...ov.t).applyMatrix4(m);
    chaseCam.lookAt(_ct); activeCam = chaseCam; return;
  }
  if (GAME.state === 'title' || GAME.state === 'loading') {
    GAME.orbit += dt * 0.12;
    const a = TR.h + 2.3 + Math.sin(GAME.orbit) * 0.9;
    const cx = TR.x + Math.sin(TR.h) * -1.5, cz = TR.z + Math.cos(TR.h) * -1.5;
    chaseCam.position.set(cx + Math.sin(a) * 15, TR.y + 3.2, cz + Math.cos(a) * 15);
    chaseCam.lookAt(cx, TR.y + 2.2, cz);
    activeCam = chaseCam;
    return;
  }
  if (GAME.cam === 'cab') {
    const yaw = INP.lookYaw;
    const lean = yaw < -0.5 ? clamp((-yaw - 0.5) * 0.1, 0, 0.1) : yaw > 0.5 ? -clamp((yaw - 0.5) * 0.12, 0, 0.14) : 0;
    INT.eye.position.set(0.55 + lean, 2.62, -4.28 - Math.abs(lean) * 0.4);
    cabCam.rotation.set(INP.lookPitch, yaw, 0);
    activeCam = cabCam;
  } else {
    GAME.chaseH = GAME.chaseH + wrapA(TR.h - GAME.chaseH) * (1 - Math.exp(-2.2 * dt));
    const far = GAME.cam === 'far';
    const dist = far ? GAME.chaseDist * 2.1 : GAME.chaseDist, ht = far ? 15 : 6.2;
    const yaw = GAME.chaseH + INP.lookYaw;
    _ct.set(TR.x + Math.sin(TR.h) * 2.5, TR.y + 2.6, TR.z + Math.cos(TR.h) * 2.5);
    _cv.set(_ct.x - Math.sin(yaw) * dist, _ct.y + ht + INP.lookPitch * 8, _ct.z - Math.cos(yaw) * dist);
    project(_cv.x, _cv.z, TR.idx, _pjT);
    _cv.y = Math.max(_cv.y, elevAt(_pjT.s) + 2);
    if (chaseCam.position.distanceToSquared(_cv) > 2500) chaseCam.position.copy(_cv); else chaseCam.position.lerp(_cv, 1 - Math.exp(-8 * dt));
    chaseCam.lookAt(_ct);
    activeCam = chaseCam;
  }
}

function updateLighting(dt) {
  const inT = !!tunnelAt(TR.s + 1, -3);
  GAME.tunnelBlend = damp(GAME.tunnelBlend, inT ? 1 : 0, 2.6, dt);
  GAME.todT -= dt;
  if (GAME.todT <= 0 || Math.abs(GAME.tunnelBlend - GAME.lastTB) > 0.03) {
    applyTimeOfDay((GAME.clock / 3600) % 24, GAME.tunnelBlend);
    GAME.todT = 0.5; GAME.lastTB = GAME.tunnelBlend;
  }
  const ext = GAME.cam === 'cab' && GAME.state === 'drive' ? 11 : 24;
  const sc = sun.shadow.camera;
  if (sc.right !== ext) { sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.updateProjectionMatrix(); }
  const fwd = GAME.cam === 'cab' ? 4.3 : -2;
  const cx = TR.x + Math.sin(TR.h) * fwd, cz = TR.z + Math.cos(TR.h) * fwd, cy = TR.y + 1.5;
  sun.target.position.set(cx, cy, cz);
  sun.position.set(cx + SUN_DIR.x * 90, cy + SUN_DIR.y * 90, cz + SUN_DIR.z * 90);
  sun.target.updateMatrixWorld();
}

function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  const asp = w / h;
  cabCam.aspect = asp; cabCam.fov = asp < 1 ? 80 : asp < 1.5 ? 70 : 64; cabCam.updateProjectionMatrix();
  chaseCam.aspect = asp; chaseCam.fov = asp < 1 ? 70 : 55; chaseCam.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => {
  if (!AUD.ctx) return;
  if (document.hidden) AUD.ctx.suspend && AUD.ctx.suspend(); else AUD.ctx.resume && AUD.ctx.resume();
});

// ---- main loop ---------------------------------------------------------------------
let lastT = performance.now();
const DIAG = { frames: 0, ms: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;
  const t0 = performance.now();
  handleActions();
  pollInput(dt, Math.abs(TR.v));
  const driving = GAME.state === 'drive';
  if (driving) {
    const n = Math.ceil(dt / 0.02), h = dt / n;
    const inp = { throttle: GAME.engineOn ? INP.throttle : 0, brake: INP.brake, steer: INP.steer };
    for (let k = 0; k < n; k++) stepTruck(h, inp);
    GAME.clock += dt * TIME_SCALE;
    gameLogic(dt);
  }
  if (GAME.state !== 'menu') updateTraffic(Math.min(dt, 0.05), driving);
  processEvents();
  if (GAME.state !== 'loading') updateChunks(TR.s, 1);
  updateVisuals(dt);
  updateCamera(dt);
  updateLighting(dt);
  updateSkyFollow(activeCam === cabCam ? cabCam.getWorldPosition(_cv) && { position: _cv } : chaseCam);
  audioUpdate({ rpm: TR.rpm, load: TR.load, v: TR.v, ret: TR.ret, inCab: GAME.cam === 'cab', running: GAME.engineOn, tunnel: GAME.tunnelBlend > 0.5 });

  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, activeCam);
  if (GAME.cam === 'cab' && driving) renderMirrors(false);

  GAME.dashT -= dt; GAME.navT -= dt; GAME.hudT -= dt;
  if (GAME.dashT <= 0 && GAME.job) {
    GAME.dashT = GAME.cam === 'cab' ? 1 / 20 : 0.3;
    drawCluster({
      kmh: Math.abs(TR.v) * 3.6, rpm: GAME.engineOn ? TR.rpm : 0, blink: GAME.blink, hazard: GAME.hazard, blinkPhase: GAME.blinkOn,
      lights: GAME.lampsOn, retarder: TR.ret, parked: Math.abs(TR.v) < 0.05 && INP.throttle < 0.05, cruise: TR.cruise, cruiseKmh: TR.cruiseV * 3.6,
      clock: fmtClock(GAME.clock), temp: GAME.tunnelBlend > 0.5 ? 16 : 14, gearTxt: gearText(), dir: TR.dir, fuel: TR.fuel, odo: TR.odo, damage: TR.damage,
    });
  }
  if (GAME.navT <= 0 && GAME.job) { GAME.navT = GAME.cam === 'cab' ? 0.2 : 0.6; drawNav(navState()); }
  if (GAME.hudT <= 0 && GAME.job) { GAME.hudT = 0.2; updateHud(); }
  if (ledTimer > 0) { ledTimer -= dt; if (ledTimer <= 0) { $('led').style.opacity = '0'; setTimeout(() => { if (ledTimer <= 0) $('led').hidden = true; }, 260); } }
  DIAG.frames++; DIAG.ms += performance.now() - t0;
}

// ---- boot -------------------------------------------------------------------------------
async function fontsReady() {
  if (!document.fonts || !document.fonts.load) return;
  const loads = ['700 40px "BIZ UDPGothic"', '400 40px "BIZ UDPGothic"', '400 40px "Dela Gothic One"', '400 40px "DotGothic16"'].map(f => document.fonts.load(f, '東名高速').catch(() => null));
  await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 2500))]);
}
async function startDriving() {
  $('startBtn').disabled = true;
  initAudio();
  sfxStarter();
  $('startOv').hidden = true;
  GAME.state = 'drive';
  setCam('cab');
  showHud(true);
  try { canvasEl.focus({ preventScroll: true }); } catch (e) { /* */ }
  setTimeout(() => { GAME.engineOn = true; }, 850);
  setTimeout(() => { sfxChime(); led('ETCカードが挿入されています', false, 3.5); }, 1500);
  setTimeout(() => { if (GAME.state === 'drive') led(GAME.job.b.jp + 'ICを目指して出発！', false, 4); }, 5200);
}
$('startBtn').addEventListener('click', startDriving);

async function boot(data) {
  if (IS_TOUCH) document.body.classList.add('touch');
  for (const seg of ['qualSeg', 'qualSeg2']) for (const b of $(seg).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.q === qualityName));
  syncSeg(['paintSeg', 'paintSeg2'], paintName); syncSeg(['intSeg', 'intSeg2'], interiorName);
  onResize();
  requestAnimationFrame(frame);
  await fontsReady();
  if (data && typeof data.job === 'number') { GAME.jobIdx = data.job % JOBS.length; GAME.money = data.money || GAME.money; GAME.clock = data.clock || GAME.clock; }
  applyTimeOfDay((GAME.clock / 3600) % 24, 0);
  setupJob(GAME.jobIdx);
  if (data && data.s && data.state === 'drive') placeTruck(data.s, data.lat, data.v || 0);
  await preloadAround();
  GAME.state = 'title';
  $('startBtn').disabled = false;
  $('startBtn').textContent = 'エンジン始動';
  if (data && data.state === 'drive') startDriving();
}
try {
  window.claude?.hot?.snapshot?.(() => ({ job: GAME.jobIdx, money: GAME.money, clock: GAME.clock, s: TR.s, lat: TR.lat, v: TR.v, state: GAME.state === 'drive' ? 'drive' : 'title' }));
} catch (e) { /* not in a viewer */ }
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});

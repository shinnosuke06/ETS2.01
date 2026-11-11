// ---------------------------------------------------------------------------
// Game layer: jobs, cameras, lights, HUD, gates, results, main loop.
// ---------------------------------------------------------------------------
const cabCam = new THREE.PerspectiveCamera(62, 1, 0.04, 5200);
cabCam.rotation.order = 'YXZ';
const chaseCam = new THREE.PerspectiveCamera(55, 1, 0.3, 5200);
scene.add(chaseCam);
let activeCam = chaseCam;

// ---- the vehicle model --------------------------------------------------------
// Built as one unit, at the current quality's level of detail, and built again when the quality changes.
let TRK, INT, TRAILER_MODELS, TRL;   // tractor, cab interior, both trailer models, the current job's trailer
function mountVehicle(trailerKey) {
  setDetail(Q.detail); VEH_STATS.parts = {};
  VEH_STATS.group = 'exterior'; TRK = buildTractor();
  VEH_STATS.group = 'interior'; INT = buildInterior(TRK);
  VEH_STATS.group = null;
  TRAILER_MODELS = { van: buildTrailer(), tank: buildTankTrailer() };
  scene.add(TRK.root);
  for (const k in TRAILER_MODELS) scene.add(TRAILER_MODELS[k].root);
  INT.cluster.material = new THREE.MeshBasicMaterial({ map: DASH.tex });
  INT.nav.material = new THREE.MeshBasicMaterial({ map: DASH.ntex });
  setupMirrors(TRK);
  INT.eye.add(cabCam);
  TRL = TRAILER_MODELS[trailerKey] || TRAILER_MODELS.van;
  for (const k in TRAILER_MODELS) TRAILER_MODELS[k].root.visible = TRAILER_MODELS[k] === TRL;
}
function rebuildVehicle() {
  const mats = new Set();
  for (const root of [TRK.root, ...Object.values(TRAILER_MODELS).map(m => m.root)]) {
    scene.remove(root);
    root.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) mats.add(o.material); });
  }
  for (const m of mats) m.dispose();
  disposeVehicleMaterials();
  makeVehicleMaterials(qualityName);
  mountVehicle(TR.trailerKey);
}
// Outside views draw only the cab parts that show through the windows.
function setCabDetail(inCab) { if (INT) INT.fine.visible = inCab; }
// Triangles, meshes on show, and materials of the interior and of the rest of the tractor; per-part records.
function vehicleStats() {
  const shown = o => { for (; o; o = o.parent) if (!o.visible) return false; return true; };
  const count = (root, skip) => {
    const r = { tris: 0, meshes: 0, mats: 0 }, mats = new Set();
    root.traverse(o => {
      if (!o.isMesh || (skip && skip(o))) return;
      r.tris += triCount(o.geometry); mats.add(o.material); if (shown(o)) r.meshes++;
    });
    r.mats = mats.size;
    return r;
  };
  const inCab = o => { for (; o; o = o.parent) if (o === INT.group) return true; return false; };
  return { interior: count(INT.group), exterior: count(TRK.root, inCab), parts: VEH_STATS.parts };
}
mountVehicle('van');

// From one town's warehouse to another's, westbound; all 13 towns in turn. mass: cargo in tonnes.
// The trailer decides how the load behaves (a tank's liquid sloshes).
const JOBS = [
  { from: 0, to: 2, cargo: '精密機器', trailer: 'van', mass: 12 },
  { from: 2, to: 4, cargo: '飲料', trailer: 'van', mass: 20 },
  { from: 4, to: 6, cargo: '牛乳', trailer: 'tank', mass: 19 },
  { from: 6, to: 7, cargo: '紙製品', trailer: 'van', mass: 15 },
  { from: 7, to: 8, cargo: '緑茶', trailer: 'van', mass: 10 },
  { from: 8, to: 9, cargo: '食用油', trailer: 'tank', mass: 18 },
  { from: 9, to: 11, cargo: '楽器（ピアノ）', trailer: 'van', mass: 9 },
  { from: 11, to: 12, cargo: '自動車部品', trailer: 'van', mass: 22 },
  { from: 0, to: 1, cargo: '日用品', trailer: 'van', mass: 8 },
  { from: 1, to: 3, cargo: '冷凍食品', trailer: 'van', mass: 16 },
  { from: 3, to: 5, cargo: '水', trailer: 'tank', mass: 21 },
  { from: 5, to: 10, cargo: '魚の加工品', trailer: 'van', mass: 14 },
  { from: 10, to: 12, cargo: '機械部品', trailer: 'van', mass: 18 },
].map(j => ({ ...j, fromWh: 0, toWh: 1 }));
// A town's layout without building it into the game (cached; the same as townLayout makes when it is loaded).
const _jobLayouts = new Map();
function jobLayout(i) {
  if (TOWNS_LOADED.has(i)) return TOWNS_LOADED.get(i).layout;
  if (!_jobLayouts.has(i)) { let L; try { L = townLayout(i); } catch (e) { L = townFallbackLayout(i); } _jobLayouts.set(i, L); }
  return _jobLayouts.get(i);
}
const jobWh = (i, k) => { const L = jobLayout(i); return L.warehouses[Math.min(k, L.warehouses.length - 1)]; };
function jobInfo(j) {
  const a = ICS[j.from], b = ICS[j.to];
  const km = b.kp - a.kp;
  // the town part: from the start warehouse's gate to the plaza, and from the plaza to the destination's gate (true km)
  const La = jobLayout(j.from), Lb = jobLayout(j.to), wa = jobWh(j.from, j.fromWh), wb = jobWh(j.to, j.toWh);
  const townKm = (townGraphDistance(La, wa.gate, townPlazaPoint()) + townGraphDistance(Lb, townPlazaPoint(), wb.gate)) / 1000;
  return { ...j, a, b, km, townKm, whA: wa, whB: wb, pay: Math.round((km * 520 + j.mass * 900 + townKm * 520) / 100) * 100 };
}
const etcFare = km => Math.round((150 + km * 24.6) * 1.65 * 1.1 / 10) * 10;

const GAME = {
  state: 'loading', cam: 'cab', clock: 13.5 * 3600, money: lsGet('nlh.money', 0), jobIdx: lsGet('nlh.job', 0) % JOBS.length,
  job: null, blink: 0, hazard: false, lights: false, wiper: false, wiperPhase: 0, blinkT: 0, blinkOn: false,
  tunnelBlend: 0, lastTB: -1, todT: 0, hudT: 0, dashT: 0, navT: 0, overT: 0, fineCool: 0, eventCool: 0,
  chaseYaw: 0, chaseDist: 20, chaseH: 0, engineOn: false, prevState: 'drive', orbit: 0,
  assist: lsGet('nlh.assist', true) !== false, assistCool: { esc: 0, rsc: 0 }, leftT: 0, leftAt: 2,
  redCool: {}, rlPrev: { town: -1, u: 0, v: 0 },   // red lights: seconds before the same junction can fine again; the front's last town point
};

// ---- jobs -------------------------------------------------------------------
function setupJob(idx) {
  const j = jobInfo(JOBS[idx]);
  GAME.job = { ...j, fines: 0, toll: 0, missPen: 0, startClock: GAME.clock, due: GAME.clock + j.km / 70 * 3600 + j.townKm / 20 * 3600 * TIME_SCALE };
  setRigTrailer(j.trailer, j.mass * 1000);
  RIG.assistOn = GAME.assist;
  TRL = TRAILER_MODELS[j.trailer];
  for (const k in TRAILER_MODELS) TRAILER_MODELS[k].root.visible = TRAILER_MODELS[k] === TRL;
  TR.damage = 0;
  // the trailer waits in the start warehouse's slot, nose to the gate; the tractor stands 12 m ahead of its kingpin
  const site = TOWN_SITES[j.from], pk = j.whA.park, h = site.hu + Math.atan2(pk.hv, pk.hu), q = {};
  townXZ(site, pk.u, pk.v, q); parkTrailerAt(q.x, q.z, h);
  townXZ(site, pk.u + pk.hu * (12 - HITCH), pk.v + pk.hv * (12 - HITCH), q); placeTruckAt(q.x, q.z, h, 0, { coupled: false });
  for (const T of TOWNS_LOADED.values()) for (const g of Object.values(T.layout.plaza.gates)) { g.state = 'closed'; g.open = 0; g.passed = false; }
  GAME.blink = 0; GAME.hazard = true; GAME.autoHazard = true; GAME.leftT = 0; GAME.leftAt = 2; GAME.redCool = {}; GAME.rlPrev.town = -1;
  resetTraffic();
  fillJobCard();
}
function fillJobCard() {
  const j = GAME.job;
  $('jobNo').textContent = 'No.' + (GAME.jobIdx + 1);
  $('jFrom').textContent = j.a.jp; $('jTo').textContent = j.b.jp;
  $('jCargo').textContent = `${j.cargo}（${TRAILERS[j.trailer].name}）`;
  $('jMass').textContent = `${j.mass} t／${gcwText()}`;
  $('jDist').textContent = j.km.toFixed(1) + ' km'; $('jPay').textContent = yen(j.pay);
  $('moneyStart').textContent = yen(GAME.money);
}
function destRamp() { return RAMPS[GAME.job.to - 1]; }
const gcwText = () => '総重量 ' + (TR.gcw / 1000).toFixed(1) + ' t';
const COUPLE_HINT = '後ろのトレーラーにバックして連結してください（T で自動連結）';

// ---- towns: made in short steps once the rig is within 2.5 km of a plaza, dropped beyond 3.5 km, two at most ----
const TOWN_JOBS = new Map();   // i -> the steps still to run
function* townBuildJob(i) {
  let L, grid;
  try { L = jobLayout(i); grid = yield* townGridSteps(L); }
  catch (e) { console.warn('town ' + i + ' could not be made; using a plain yard:', e && e.message); L = townFallbackLayout(i); _jobLayouts.set(i, L); grid = townGrid(L); }
  townAdd(i, L, grid);
  yield* townMeshSteps(i);
  townTrafficStart(i);
}
function townDrop(i) { TOWN_JOBS.delete(i); townTrafficStop(i); townMeshDispose(i); townUnload(i); }
// Runs town steps for up to budgetMs; returns how many towns are still being made.
function townsTick(budgetMs = 6) {
  const d = i => Math.hypot(TR.x - TOWN_SITES[i].ox, TR.z - TOWN_SITES[i].oz);
  for (const i of [...new Set([...TOWNS_LOADED.keys(), ...TOWN_JOBS.keys()])]) if (d(i) > 3500 && TR.town !== i) townDrop(i);
  for (const i of TOWN_SITES.map(t => t.i).filter(k => d(k) <= 2500).sort((a, b) => d(a) - d(b))) {
    if (TOWNS_LOADED.has(i) || TOWN_JOBS.has(i)) continue;
    const held = [...new Set([...TOWNS_LOADED.keys(), ...TOWN_JOBS.keys()])];
    if (held.length >= 2) {   // make room: drop the farthest town the rig is not in, if it is farther than this one
      const far = held.filter(k => k !== TR.town).sort((a, b) => d(b) - d(a))[0];
      if (far == null || d(far) <= d(i)) break;
      townDrop(far);
    }
    TOWN_JOBS.set(i, townBuildJob(i));
  }
  const t0 = performance.now();
  for (const [i, job] of TOWN_JOBS) {   // the nearest job first, one at a time
    while (performance.now() - t0 < budgetMs) if (job.next().done) { TOWN_JOBS.delete(i); break; }
    break;
  }
  return TOWN_JOBS.size;
}
async function preloadAround(label) {
  $('loading').hidden = false;
  let left = 99, n = 0;
  while (left > 0) {
    left = updateChunks(TR.s, 2) + townsTick(40);
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
      case 'couple':
        if (TR.link === 'coupled') requestUncouple();
        else if (TR.link === 'free' && !requestCouple()) led('トレーラーの 40 m 以内で止まってから押してください', true, 3.5);
        break;
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
  TR.onRamp = TR.zone === 'road' && !!r && TR.lat < -13.4;
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
      placeTruck(dr.sDiv - 500, X_TRV, 15, { coupled: TR.link !== 'free' });
    }
  }
  plazaGates(dt);
  if (GAME.autoHazard && TR.v > 14) { GAME.hazard = false; GAME.autoHazard = false; }
  // drove off without the trailer: on the expressway (one-way) by the distance along it, in or out of a town in a straight line
  const away = TR.link === 'free' && TR.trailerKey && (TR.zone === 'town' || _groundTown(TR.tr.kx, TR.tr.kz)
    ? Math.hypot(TR.x - TR.tr.kx, TR.z - TR.tr.kz) > 150 : TR.s - TR.tr.s - TRAILERS[TR.trailerKey].L2 > 150);
  if (away) {
    GAME.leftT += dt;
    if (GAME.leftT >= GAME.leftAt) { led('トレーラーを置いたままです。メニューからやり直せます', true, 5); GAME.leftAt = GAME.leftT + 30; }
  } else { GAME.leftT = 0; GAME.leftAt = 2; }
  const T = TR.zone === 'town' ? TOWNS_LOADED.get(TR.town) : null;
  // red lights: the front crossing a stop line on red, once per junction every 30 s
  for (const k in GAME.redCool) if ((GAME.redCool[k] -= dt) <= 0) delete GAME.redCool[k];
  if (T) {
    townUV(T.layout.site, TR.x + Math.sin(TR.h) * RIGP.front, TR.z + Math.cos(TR.h) * RIGP.front, _rlc);
    if (GAME.rlPrev.town === TR.town) {
      const n = townRedLight(T.layout, GAME.rlPrev, _rlc, GAME.clock / TIME_SCALE), key = TR.town + ':' + n;
      if (n >= 0 && !GAME.redCool[key]) { j.fines += 9000; led('信号無視 罰金 ¥9,000', true, 4); GAME.redCool[key] = 30; }
    }
    GAME.rlPrev.town = TR.town; GAME.rlPrev.u = _rlc.u; GAME.rlPrev.v = _rlc.v;
  } else GAME.rlPrev.town = -1;
  // speeding (trucks: 90, or the posted limit if lower; in a town, the street's limit, 20 in the plaza and the yards)
  const lim = T ? townLimitAt(T.layout, TR.tu, TR.tv) : Math.min(90, regionAt(TR.s, {}).lim);
  GAME.limit = lim;
  if (TR.v * 3.6 > lim + 12) { GAME.overT += dt; if (GAME.overT > 4 && GAME.fineCool <= 0) { j.fines += 9000; led(`速度超過（制限${lim}km/h）罰金 ¥9,000`, true, 4); GAME.fineCool = 45; } }
  else GAME.overT = 0;
  GAME.fineCool -= dt;
}
// The toll plaza's gates in the loaded towns: ETC at 22 km/h or less opens them (the fare is paid at the destination's
// exit gate); faster, the bar is hit. Leaving through a town that is not the destination is allowed, and costs nothing.
const _pgf = {}, _rlc = {};
function plazaGates(dt) {
  const j = GAME.job;
  for (const [i, T] of TOWNS_LOADED) {
    const site = T.layout.site, G = T.layout.plaza.gates, mesh = TOWN_MESH.get(i);
    townUV(site, TR.x + Math.sin(TR.h) * RIGP.front, TR.z + Math.cos(TR.h) * RIGP.front, _pgf);
    for (const key of ['exit', 'entry']) {
      const g = G[key], kmh = Math.abs(TR.v) * 3.6;
      if (!(key === 'exit' ? T.layout.plaza.exitPath : T.layout.plaza.entryPath)) continue;
      const inLane = TR.zone === 'town' && TR.town === i && Math.abs(_pgf.u - g.u) <= 3.5, dg = (g.v - _pgf.v) * g.dir;
      if (inLane && g.state === 'closed' && dg < 30 && dg > -1) {
        const dest = key === 'exit' && i === j.to;
        if (kmh <= 22) {
          g.state = 'open'; sfxChime();
          if (dest && !j.toll) { j.toll = etcFare(j.km); led('ETC 料金 ' + yen(j.toll)); }
        } else if (dg < 7) {
          g.state = 'broken'; sfxThump(2); TR.damage = Math.min(100, TR.damage + 2.5); scaleSpeed(0.8);
          j.fines += 8000;
          if (dest && !j.toll) j.toll = etcFare(j.km);
          led('開閉バーに接触！ETCは20km/h以下で', true, 4.5);
        }
      }
      if (inLane && !g.passed && dg < -6) {
        g.passed = true;
        if (key === 'exit' && i !== j.to) led(`${site.ic.jp}ICは目的地ではありません。入口から高速に戻れます`, true, 5);
      }
      g.open = damp(g.open, g.state === 'closed' ? 0 : 1, g.state === 'broken' ? 14 : 4, dt);
      const pv = mesh && mesh.gates[key]; if (pv) pv.rotation.z = -g.open * (g.state === 'broken' ? 1.2 : 1.45);
      if (g.state !== 'closed' && Math.hypot(TR.x - site.ox, TR.z - site.oz) > 600) { g.state = 'closed'; g.passed = false; }
    }
  }
}
// The trailer has just been set down: delivered if it stands at a dock or in the bay of the destination warehouse.
function onUncoupled() {
  const j = GAME.job, site = TOWN_SITES[j.to], wh = j.whB, sp = TRAILERS[TR.trailerKey], q = {}, kp = {};
  townUV(site, TR.tr.kx, TR.tr.kz, kp);
  const back = { u: -Math.cos(TR.tr.h - site.hu), v: -Math.sin(TR.tr.h - site.hu) };
  townUV(site, TR.tr.kx - Math.sin(TR.tr.h) * sp.rear, TR.tr.kz - Math.cos(TR.tr.h) * sp.rear, q);
  const y = wh.yard, inYard = kp.u >= y.u0 - 2 && kp.u <= y.u1 + 2 && kp.v >= y.v0 - 2 && kp.v <= y.v1 + 2;
  const dock = inYard ? dockCheck(wh, q, back) : -1, bay = inYard && bayCheck(wh, kp, q);
  if (dock >= 0 || bay) completeJob({ dock: dock >= 0 });
  else if (inYard) led('荷台口か納品の枠で切り離してください', true, 5);
  else led('切り離しました', false, 3);
}
function onAccident(kind) {
  const roll = kind === 'rollover';
  TR.damage = Math.min(100, TR.damage + (roll ? 25 : 15));
  if (GAME.job) GAME.job.fines += roll ? 30000 : 20000;
  sfxThump(3);
  towReset();
  led(roll ? '横転しました。レッカー移動 ¥30,000' : 'ジャックナイフ。レッカー移動 ¥20,000', true, 5);
}
function processEvents(dt) {
  GAME.eventCool -= dt; GAME.assistCool.esc -= dt; GAME.assistCool.rsc -= dt;
  while (EVENTS.length) {
    const e = EVENTS.shift();
    if (e.t === 'rail') { sfxScrape(); if (e.hit > 1.2 && GAME.eventCool <= 0) { led('ガードレールに接触', true, 2); GAME.eventCool = 2; } }
    else if (e.t === 'car') { sfxThump(e.hit); if (GAME.eventCool <= 0) { const f = Math.min(30000, Math.round(e.hit * 1500 / 100) * 100 + 2000); if (GAME.job) GAME.job.fines += f; led('接触事故！ 損害 ' + yen(f), true, 3); GAME.eventCool = 2.5; } }
    else if (e.t === 'crash') { sfxThump(3); led('衝突しました', true, 2); }
    else if (e.t === 'cruiseOff') { led('クルーズ解除', false, 1.5); }
    else if (e.t === 'couple-lock') { sfxClunk(); sfxHiss(1.6); led('ロックしました。ホースを接続中…', false, 2.5); }
    else if (e.t === 'coupled') led('連結完了　' + gcwText(), false, 4);
    else if (e.t === 'couple-miss') { sfxThump(1); led(e.why === 'fast' ? '速すぎます' : 'ずれています。前に出てやり直してください', true, 4); }
    else if (e.t === 'uncouple-start') { sfxHiss(1.2); led('切り離し中…', false, 2.5); }
    else if (e.t === 'uncouple-refused') led('止まってから切り離してください', true, 3);
    else if (e.t === 'uncoupled') { sfxClunk(); onUncoupled(); }
    else if (e.t === 'rollover' || e.t === 'jackknife') onAccident(e.t);
    else if (e.t === 'assist' && (e.kind === 'esc' || e.kind === 'rsc') && GAME.assistCool[e.kind] <= 0) {
      if (e.kind === 'rsc') sfxWarn();
      led(e.kind === 'esc' ? '横滑り防止 作動' : '横転の危険！減速します', true, 2); GAME.assistCool[e.kind] = 4;
    }
    else if (e.t === 'reset') led('車両の位置を戻しました', true, 3);
  }
}

function completeJob(how = {}) {
  const j = GAME.job;
  const late = Math.max(0, GAME.clock - j.due) / 60;
  const timeAdj = late > 0 ? -Math.round(Math.min(0.4, late / 5 * 0.02) * j.pay / 100) * 100 : Math.round(j.pay * 0.08 / 100) * 100;
  const dmgCost = Math.round(TR.damage * j.pay * 0.008 / 100) * 100;
  const dockBonus = how.dock ? Math.round(j.pay * 0.2 / 100) * 100 : 0;   // backed onto a dock
  const total = j.pay + dockBonus + timeAdj - dmgCost - j.fines - j.toll - j.missPen;
  GAME.money += total;
  lsSet('nlh.money', GAME.money);
  const rows = [
    ['基本報酬', j.pay],
    ...(how.dock ? [['荷台口ボーナス（+20%）', dockBonus]] : []),
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
  scaleSpeed(0); TR.cruise = false;
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
  led(COUPLE_HINT, false, 6);
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
function setAssist(on) {
  GAME.assist = on; RIG.assistOn = on; lsSet('nlh.assist', on);
  syncSeg(['assistSeg'], on ? 'on' : 'off');
}
$('assistSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setAssist(b.dataset.v === 'on'); });
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
  rebuildVehicle();
  resizeMirrors();
  if (GAME.state !== 'loading') resetTraffic();
  onResize();
}
for (const seg of ['qualSeg', 'qualSeg2']) $(seg).addEventListener('click', e => { const b = e.target.closest('button'); if (b) setQuality(b.dataset.q); });
function syncSeg(ids, value) { for (const id of ids) for (const b of $(id).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.v === value)); }
for (const id of ['paintSeg', 'paintSeg2']) $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { applyPaint(b.dataset.v); syncSeg(['paintSeg', 'paintSeg2'], paintName); } });
for (const id of ['intSeg', 'intSeg2']) $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { applyInteriorTheme(b.dataset.v); syncSeg(['intSeg', 'intSeg2'], interiorName); } });
for (const id of ['trimSeg', 'trimSeg2']) $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) { applyTrim(b.dataset.v, TRK); syncSeg(['trimSeg', 'trimSeg2'], trimName); } });

// ---- HUD ------------------------------------------------------------------------
function showHud(on) {
  $('jobSign').hidden = !on; $('topbar').hidden = !on;
  $('speedo').hidden = !on || GAME.cam === 'cab';
  $('touch').hidden = !on || !INP.usingTouch;
}
// km left to the destination: along the expressway to its exit, or in the destination town straight to the warehouse gate
function destRemainKm() {
  const j = GAME.job, q = {};
  if (TR.zone === 'town' && TR.town === j.to) { townXZ(TOWN_SITES[j.to], j.whB.gate.u, j.whB.gate.v, q); return Math.hypot(TR.x - q.x, TR.z - q.z) / 1000; }
  return Math.max(0, destRamp().sEnd - TR.s) * SCALE / 1000;
}
function gearText() { if (TR.dir === -1) return 'R'; if (TR.dir === 0) return 'N'; return 'A' + (TR.shiftT > 0 ? TR.nextGear : TR.gear); }
function updateHud() {
  const j = GAME.job; if (!j) return;
  $('jsDest').textContent = j.b.jp; $('jsEn').textContent = j.b.en;
  const rem = destRemainKm();
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
  const bc = $('bCouple'), auto = TR.link === 'free' && canAutoCouple();
  bc.hidden = !(TR.link === 'coupled' || auto);
  bc.textContent = TR.link === 'coupled' ? '切り離し' : '自動連結';
}
// What the instrument cluster shows right now.
function clusterState() {
  // an assist lamp: steady when the assists are switched off, flashing while that system is acting
  const lamp = on => (!GAME.assist ? 'on' : on ? 'flash' : 'off');
  return {
    kmh: Math.abs(TR.v) * 3.6, rpm: GAME.engineOn ? TR.rpm : 0, blink: GAME.blink, hazard: GAME.hazard, blinkPhase: GAME.blinkOn,
    lights: GAME.lampsOn, retarder: TR.ret, parked: Math.abs(TR.v) < 0.05 && INP.throttle < 0.05, cruise: TR.cruise, cruiseKmh: TR.cruiseV * 3.6,
    clock: fmtClock(GAME.clock), temp: GAME.tunnelBlend > 0.5 ? 16 : 14, gearTxt: gearText(), dir: TR.dir, fuel: TR.fuel, odo: TR.odo, damage: TR.damage,
    gcwText: gcwText(), link: TR.link,
    lamps: { abs: lamp(TR.assist.abs), esc: lamp(TR.assist.esc || TR.assist.rsc), tcs: lamp(TR.assist.tcs) },
    flashOn: performance.now() % 360 < 180,
  };
}
function navState() {
  const j = GAME.job;
  const dr = destRamp();
  let guide = '', gd = '';
  if (TR.onRamp) { guide = rampAt(TR.s).ic.i === j.to ? '料金所 ETCは20km/h以下' : '目的地ではない出口です'; gd = Math.max(0, Math.round(rampAt(TR.s).sEnd - TR.s) * 10) + ' m'; }
  else {
    const nr = RAMPS.find(r => r.sDiv + r.uSep > TR.s);
    if (nr && nr.ic.i === j.to) { guide = `${nr.ic.jp} IC 出口は左`; }
    else if (nr) guide = `次 ${nr.ic.jp} IC　そのまま直進`;
    if (nr) { const d = Math.max(0, nr.sDiv - TR.s) * SCALE / 1000; gd = d < 1 ? Math.round(d * 1000 / 10) * 10 + ' m' : d.toFixed(1) + ' km'; }
  }
  const rem = destRemainKm();
  const eta = GAME.clock + rem / 80 * 3600;
  const trailer = TR.link === 'free' && TR.trailerKey ? { x: TR.tr.kx, z: TR.tr.kz } : null;
  if (trailer && !TR.onRamp) { guide = 'トレーラーを連結してください'; gd = Math.round(Math.hypot(TR.x - trailer.x, TR.z - trailer.z)) + ' m'; }
  return {
    trailer,
    x: TR.x, z: TR.z, heading: TR.h, s: TR.s, destS: dr.sEnd, destIc: j.to,
    guide, guideDist: gd, footer: `${j.b.jp} IC まで ${rem.toFixed(1)} km　到着予定 ${fmtClock(eta)}`, limit: GAME.limit || 90,
  };
}

// ---- visuals ------------------------------------------------------------------------
const _gv = {};
function updateVisuals(dt) {
  const T = TRK.root;
  // the kingpin's weight settles the rear of the tractor by up to 6 cm; the wheels stay on the road
  const squat = 0.06 * clamp(TR.kp / (10000 * 9.81), 0, 1), towing = TR.link !== 'free';
  T.position.set(TR.x, TR.y - squat, TR.z);
  T.rotation.set(TR.pitch + squat / WB, TR.h + Math.PI, 0);
  updateVehicleEnv(T);
  for (const w of TRK.rear) w.position.y = 0.52 + squat;
  TRK.cabPivot.rotation.set(TR.cab.p, 0, TR.cab.r);
  TRK.cabPivot.position.y = 1.25 + TR.cab.hy;
  for (const w of TRK.spin) w.rotation.x = -TR.spin;
  for (const s of TRK.steer) s.rotation.y = -TR.steer;
  const L2 = TRAILERS[TR.trailerKey] ? TRAILERS[TR.trailerKey].L2 : 8.3;
  if (towing) {   // on the fifth wheel
    const hx = TR.x + Math.sin(TR.h) * HITCH, hz = TR.z + Math.cos(TR.h) * HITCH;
    TRL.root.position.set(hx, GROUND.at(hx, hz, TR.idx, _gv).y - squat, hz);
    for (const w of TRL.spin) w.rotation.x = -TR.spin;
  } else TRL.root.position.set(TR.tr.kx, GROUND.at(TR.tr.kx, TR.tr.kz, TR.tr.idx, _gv).y, TR.tr.kz);   // standing where it was set down
  TRL.root.rotation.set(TR.tr.pitch - squat / L2, TR.tr.h + Math.PI, 0);
  TRL.body.rotation.z = TR.roll;   // leans away from the turn
  // landing legs wind up while the lines are connected and down again when they come off
  const up = TR.link === 'coupled' ? 1 : TR.link === 'locking' ? 1 - TR.linkT / 2 : TR.link === 'unlocking' ? TR.linkT / 2 : 0;
  TRL.legs.position.y = 0.45 * clamp(up, 0, 1);
  TRK.coil.visible = towing; TRK.coilStowed.visible = !towing;
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
let chaseFov = 55;   // the outside views' angle for the screen's shape (onResize); a reference view may set its own
function updateCamera(dt) {
  // dev hook: { p: [x, y, z], t: [x, y, z] } in tractor-local coordinates, optional fov (degrees) and
  // inCab (a view from inside the cab: near clipping close in, the small cab parts drawn)
  const ov = window.__camOverride;
  const fov = ov && ov.fov || chaseFov, near = ov && ov.inCab ? 0.05 : 0.3;
  if (chaseCam.fov !== fov || chaseCam.near !== near) { chaseCam.fov = fov; chaseCam.near = near; chaseCam.updateProjectionMatrix(); }
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
    _cv.y = Math.max(_cv.y, GROUND.at(_cv.x, _cv.z, TR.idx, _gv).y + 2);
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
    setVehicleLight(1 - TOD.night, GAME.tunnelBlend);
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
  chaseFov = asp < 1 ? 70 : 55; chaseCam.aspect = asp; chaseCam.fov = chaseFov; chaseCam.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);
document.addEventListener('visibilitychange', () => {
  if (!AUD.ctx) return;
  if (document.hidden) AUD.ctx.suspend && AUD.ctx.suspend(); else AUD.ctx.resume && AUD.ctx.resume();
});

// ---- main loop ---------------------------------------------------------------------
// Everything a frame does except drawing: input, physics, game rules, traffic, events.
// The browser tests call this directly to move game time forward without waiting for frames.
function simTick(dt) {
  handleActions();
  pollInput(dt, Math.abs(TR.v));
  const driving = GAME.state === 'drive';
  if (driving) {
    physicsAdvance(dt, { throttle: GAME.engineOn ? INP.throttle : 0, brake: INP.brake, steer: INP.steer });
    GAME.clock += dt * TIME_SCALE;
    gameLogic(dt);
  }
  if (GAME.state !== 'menu') { updateTraffic(Math.min(dt, 0.05), driving); townTrafficStep(Math.min(dt, 0.05), driving); }
  processEvents(dt);
  return driving;
}
let lastT = performance.now();
const DIAG = { frames: 0, ms: 0 };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000; lastT = now;
  if (!(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;
  const t0 = performance.now();
  const driving = simTick(dt);
  if (GAME.state !== 'loading') { updateChunks(TR.s, 1); townsTick(6); }
  for (const i of TOWN_MESH.keys()) townSignalsUpdate(i, GAME.clock / TIME_SCALE);
  updateVisuals(dt);
  updateCamera(dt);
  setCabDetail(activeCam === cabCam || !!(window.__camOverride && window.__camOverride.inCab));
  updateLighting(dt);
  updateSkyFollow(activeCam === cabCam ? cabCam.getWorldPosition(_cv) && { position: _cv } : chaseCam);
  audioUpdate({ rpm: TR.rpm, load: TR.load, v: TR.v, ret: TR.ret, inCab: GAME.cam === 'cab', running: GAME.engineOn, tunnel: GAME.tunnelBlend > 0.5, slip: TR.slip });

  if (renderer.shadowMap.enabled) renderer.shadowMap.needsUpdate = true;
  renderer.render(scene, activeCam);
  if (GAME.cam === 'cab' && driving) renderMirrors(false);

  GAME.dashT -= dt; GAME.navT -= dt; GAME.hudT -= dt;
  if (GAME.dashT <= 0 && GAME.job) {
    GAME.dashT = GAME.cam === 'cab' ? 1 / 20 : 0.3;
    drawCluster(clusterState());
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
  setTimeout(() => { if (GAME.state === 'drive' && TR.link === 'free') led(COUPLE_HINT, false, 6); }, 5200);
}
$('startBtn').addEventListener('click', startDriving);

async function boot(data) {
  if (IS_TOUCH) document.body.classList.add('touch');
  for (const seg of ['qualSeg', 'qualSeg2']) for (const b of $(seg).querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.q === qualityName));
  syncSeg(['paintSeg', 'paintSeg2'], paintName); syncSeg(['intSeg', 'intSeg2'], interiorName); syncSeg(['assistSeg'], GAME.assist ? 'on' : 'off'); syncSeg(['trimSeg', 'trimSeg2'], trimName);
  onResize();
  requestAnimationFrame(frame);
  await fontsReady();
  if (data && typeof data.job === 'number') { GAME.jobIdx = data.job % JOBS.length; GAME.money = data.money || GAME.money; GAME.clock = data.clock || GAME.clock; }
  applyTimeOfDay((GAME.clock / 3600) % 24, 0);
  setupJob(GAME.jobIdx);
  if (data && data.s && data.state === 'drive') {   // resume where a page update interrupted the drive
    const towing = data.link ? data.link !== 'free' : true;
    if (!towing && Number.isFinite(data.ks)) parkTrailer(data.ks, data.klat);
    placeTruck(data.s, data.lat, data.v || 0, { coupled: towing });
  }
  await preloadAround();
  GAME.state = 'title';
  $('startBtn').disabled = false;
  $('startBtn').textContent = 'エンジン始動';
  if (data && data.state === 'drive') startDriving();
}
try {
  window.claude?.hot?.snapshot?.(() => {
    const k = ROAD.project(TR.tr.kx, TR.tr.kz, TR.tr.idx, {});
    return { job: GAME.jobIdx, money: GAME.money, clock: GAME.clock, s: TR.s, lat: TR.lat, v: TR.v, link: TR.link, ks: k.s, klat: k.lat, state: GAME.state === 'drive' ? 'drive' : 'title' };
  });
} catch (e) { /* not in a viewer */ }
window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {});

// ---------------------------------------------------------------------------
// Fuel and sleepiness in the game: the notices, the blinks, the place button
// (給油 / 仮眠 / 救援を呼ぶ) with its fade, and keeping both across page loads.
// ---------------------------------------------------------------------------
const STOP = { busy: false, blinkT: Infinity, blinkDur: 0, blinkAt: -1, blinkOp: 0, rand: rng(8128) };
const _stp = { i: 0, s: 0, lat: 0 };
// The tractor's centre in its service area's coordinates, with its heading in those axes, or null outside one.
function saRigAt() {
  if (TR.zone !== 'sa' || TR.sa < 0) return null;
  const A = SA_LOADED.get(TR.sa); if (!A) return null;
  const f = (RIGP.front - RIGP.back) / 2, cx = TR.x + Math.sin(TR.h) * f, cz = TR.z + Math.cos(TR.h) * f;
  project(cx, cz, TR.idx, _stp);
  const a = TR.h - headingAt(_stp.s);
  return { L: A.layout, u: _stp.s - A.layout.sa.sDiv, v: -_stp.lat, hu: Math.cos(a), hv: Math.sin(a) };
}
// What the place button offers now (standing still while driving), or null.
function stopKindNow() {
  if (GAME.state !== 'drive' || Math.abs(TR.v) * 3.6 >= 1) return null;
  if (TR.fuel <= 0) return 'rescue';
  const r = saRigAt();
  if (!r) return null;
  if (TR.fuel < 0.98 && saPumpAt(r.L, r.u, r.v, r.hu, r.hv)) return 'fuel';
  if (saStallAt(r.L, r.u, r.v, r.hu, r.hv)) return 'nap';
  return null;
}
const STOP_LABEL = { fuel: '給油', nap: '仮眠', rescue: '救援を呼ぶ' }, STOP_WAIT = { fuel: '給油中…', nap: '仮眠中…', rescue: '救援を待っています…' };
function stopUpdate() {
  const k = STOP.busy ? GAME.stopKind : stopKindNow(), b = $('bStop');
  if (k === GAME.stopKind && b.hidden === !k) return;
  GAME.stopKind = k; b.hidden = !k; if (k) b.textContent = STOP_LABEL[k];
}
const _wait = ms => new Promise(r => setTimeout(r, ms));
// The fade, the time it takes and what it costs; the game is held ('stop') until the screen is back.
async function stopRun(kind) {
  if (STOP.busy || GAME.state !== 'drive' || !kind || kind !== stopKindNow()) return;
  STOP.busy = true; GAME.state = 'stop';
  scaleSpeed(0); TR.cruise = false; setHorn(false); INP.tGas = INP.tBrake = 0;
  const ov = $('fadeOv'); $('fadeText').textContent = STOP_WAIT[kind];
  ov.hidden = false; await _wait(20); ov.classList.add('on'); await _wait(650);
  const j = GAME.job;
  if (kind === 'fuel') {
    const r = refuel(TR.fuel); TR.fuel = 1; GAME.clock += 600;
    j.fuelCost += r.yen; j.fuelN += 1;
    led(`給油 ${r.liters} L　${r.yen.toLocaleString('ja-JP')} 円`, false, 4);
  } else if (kind === 'nap') {
    GAME.clock += 1800; GAME.sleepy = 0;
    led('30 分の仮眠をとりました', false, 4);
  } else {
    GAME.clock += 3600; TR.fuel = CARE.rescueL / CARE.fuelL; j.rescue += CARE.rescueYen;
    led('救援が来ました　燃料 20 L', false, 4);
  }
  GAME.todT = 0; careSave();
  await _wait(700);
  ov.classList.remove('on'); await _wait(650); ov.hidden = true;
  GAME.state = 'drive'; STOP.busy = false; GAME.stopKind = null; stopUpdate();
}
// Sleepiness grows with the clock while driving; the notices come once each time a level is crossed.
function careTick(dt) {
  GAME.sleepy = Math.min(1, GAME.sleepy + sleepyRate(GAME.clock) * dt * TIME_SCALE);
  const m = GAME.careMsg;
  const once = (key, on, text, warn) => { if (on && !m[key]) { m[key] = true; led(text, warn, 5); } else if (!on) m[key] = false; };
  once('f0', TR.fuel <= 0, '燃料がなくなりました', true);
  once('f5', TR.fuel < 0.05 && TR.fuel > 0, '燃料がまもなくなくなります', true);
  once('f15', TR.fuel < 0.15 && TR.fuel >= 0.05, '燃料が少なくなりました　次の SA で給油を', false);
  once('s70', GAME.sleepy > 0.7, '眠気がたまっています　次の SA で休憩を', false);
  // stranded on the expressway: hazard lights once it has slowed (the automatic ones go off again above 14 m/s)
  if (TR.fuel <= 0 && TR.zone === 'road' && !TR.onRamp && Math.abs(TR.lat) < 12.5 && Math.abs(TR.v) < 8 && !m.hz) { m.hz = true; GAME.hazard = GAME.autoHazard = true; }
  if (TR.fuel > 0) m.hz = false;
}
// The blinks above 0.85: the screen darkens for 0.4..0.7 s (85% at most), then the next one comes after blinkGap.
function blinkUpdate(dt) {
  let op = 0;
  if (GAME.state === 'drive' && GAME.sleepy > 0.85) {
    if (STOP.blinkAt >= 0) {
      STOP.blinkAt += dt;
      if (STOP.blinkAt >= STOP.blinkDur) { STOP.blinkAt = -1; STOP.blinkT = blinkGap(GAME.sleepy, STOP.rand()); }
      else op = 0.85 * Math.sin(Math.PI * STOP.blinkAt / STOP.blinkDur);
    } else {
      if (!Number.isFinite(STOP.blinkT)) STOP.blinkT = blinkGap(GAME.sleepy, STOP.rand());
      if ((STOP.blinkT -= dt) <= 0) { STOP.blinkAt = 0; STOP.blinkDur = 0.4 + 0.3 * STOP.rand(); }
    }
  } else { STOP.blinkT = Infinity; STOP.blinkAt = -1; }
  if (Math.abs(op - STOP.blinkOp) > 0.01 || (op === 0) !== (STOP.blinkOp === 0)) { STOP.blinkOp = op; $('blinkOv').style.opacity = op ? op.toFixed(2) : '0'; }
}
function careSave() { lsSet('nlh.care', { fuel: TR.fuel, sleepy: GAME.sleepy }); }
function careLoad() {
  const c = lsGet('nlh.care', null), ok = x => Number.isFinite(x) && x >= 0 && x <= 1;
  TR.fuel = c && ok(c.fuel) ? c.fuel : 0.82; GAME.sleepy = c && ok(c.sleepy) ? c.sleepy : 0;
}
// The small marks beside the speed box: fuel under 25% (red under 15%), sleepiness over 0.5 (red over 0.85).
let _careKey = '';
function careIcons() {
  const f = TR.fuel < 0.25 ? (TR.fuel < 0.15 ? 2 : 1) : 0, s = GAME.sleepy > 0.5 ? (GAME.sleepy > 0.85 ? 2 : 1) : 0, key = f + ':' + s;
  if (key === _careKey) return;
  _careKey = key;
  const F = $('icFuel'), S = $('icSleep');
  F.hidden = !f; F.classList.toggle('red', f === 2); S.hidden = !s; S.classList.toggle('red', s === 2);
}

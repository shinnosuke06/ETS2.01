import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob } from './helpers.mjs';

// Drives through the game's own input path (the touch wheel and pedals) with simTick, so traffic,
// the toll gate and the job rules all run as they do for a player.
test('通し：東京で連結し、御殿場まで走って料金所を通り、納品の枠で切り離す', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const drive = (thr, brk, steer) => {
      INP.tGas = thr; INP.tBrake = brk; INP.tWheelHeld = true;
      INP.tWheel = Math.sign(steer) * Math.pow(Math.abs(steer), 1 / 1.35) * 2.6;   // inverse of the touch wheel's curve
      simTick(1 / 60);
    };
    const steerTo = lat => clamp(0.35 * (lat - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * (0.4 + Math.abs(TR.v) / 25), -1, 1);
    const log = { cruiseHeld: null, maxKmh: 0 };
    INP.actions.push('couple'); for (let i = 0; i < 150; i++) drive(0, 0, 0);
    log.coupled = TR.link;
    const d = destRamp(); let n = 0, cruiseT = 0, cruiseMin = 99, cruiseMax = 0;
    while (GAME.state === 'drive' && n++ < 60000) {
      const u = TR.s - d.sDiv, kmh = TR.v * 3.6;
      let lat = X_TRV, want = 85;
      if (u > -150 && u < 120) lat = -9.8;                                  // drift left toward the exit lane
      if (u >= 120) lat = rampEdges(Math.min(RAMP_LEN, u + 25)).cx;
      if (u > 150) want = 55;
      if (u > d.uSep + 120) want = 17;                                      // ETC gate: 20 km/h or less
      const stopAt = d.sZone0 + 14;
      if (TR.s >= stopAt) want = 0;
      // a stretch on cruise control in the middle of the run
      if (TR.s > S0 + 2500 && TR.s < S0 + 3200 && !TR.cruise && kmh > 60 && cruiseT === 0) INP.actions.push('cruise');
      if (TR.cruise) { cruiseT += 1 / 60; if (cruiseT > 3) { cruiseMin = Math.min(cruiseMin, kmh); cruiseMax = Math.max(cruiseMax, kmh); } }
      const thr = TR.cruise ? 0 : clamp((want - kmh) * 0.25, 0, 1), brk = want === 0 ? 0.8 : TR.cruise ? 0 : clamp((kmh - want - 3) * 0.12, 0, 1);
      if (TR.cruise && TR.s > S0 + 3200) INP.actions.push('cruise');        // switch it off again
      drive(thr, brk, steerTo(lat));
      log.maxKmh = Math.max(log.maxKmh, kmh);
      if (TR.s >= stopAt && Math.abs(TR.v) < 0.05 && TR.link === 'coupled') INP.actions.push('couple');
    }
    INP.tGas = INP.tBrake = 0; INP.tWheelHeld = false;
    return { ...log, state: GAME.state, ticks: n, toll: GAME.job.toll, gate: d.gateState, damage: TR.damage, fines: GAME.job.fines,
      cruise: [cruiseT, cruiseMin, cruiseMax], result: document.getElementById('resRows').innerText.replace(/\n/g, ' | '), shown: !document.getElementById('resultOv').hidden };
  });
  assert.equal(r.coupled, 'coupled');
  assert.equal(r.state, 'result', JSON.stringify(r)); assert.equal(r.shown, true);
  assert.equal(r.gate, 'open'); assert.ok(r.toll > 0, 'ETC fare charged');
  assert.ok(r.maxKmh > 80 && r.maxKmh < 93, `top speed ${r.maxKmh}`);
  assert.ok(r.cruise[0] > 10 && r.cruise[2] - r.cruise[1] < 6, `cruise held ${JSON.stringify(r.cruise)}`);
  assert.ok(r.damage < 10, `damage ${r.damage}`);
  assert.match(r.result, /基本報酬/);
  assert.deepEqual(errors, []);
  console.log('playthrough:', JSON.stringify(r));
}));

test('目的地でない出口に入ると、次の区間の路肩に戻されて違反金がつく', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const wrong = RAMPS[1];                                   // 厚木: not job 1's destination
    placeTruck(wrong.sGate + 5, -40, 3, { coupled: true }); wrong.gateState = 'open'; GAME.job.fines = 0;
    for (let i = 0; i < 120; i++) simTick(1 / 60);
    return { fines: GAME.job.fines, s: TR.s, lat: TR.lat, link: TR.link, expect: wrong.ic.s + 450, led: document.getElementById('ledText').textContent };
  });
  assert.equal(r.fines, 5000); assert.equal(r.link, 'coupled');
  assert.ok(Math.abs(r.s - r.expect) < 5 && Math.abs(r.lat + 10.75) < 0.5, JSON.stringify(r));
  assert.match(r.led, /目的地ではありません/);
}));

test('80 km/h の区間で 92 km/h を超えて 4 秒走ると、速度超過の罰金がつく', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => {
    const s = kpToS(64);                                      // mountain section, posted 80
    placeTruck(s, -7.65, 29.5, { coupled: true }); resetTraffic(); GAME.job.fines = 0; GAME.fineCool = 0; GAME.overT = 0;
    INP.tWheelHeld = true; let over = 0, led = '';
    for (let i = 0; i < 420 && GAME.job.fines === 0; i++) {
      INP.tGas = 1; INP.tWheel = 0;
      const st = clamp(0.35 * (-7.65 - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * 1.4, -1, 1);
      INP.tWheel = Math.sign(st) * Math.pow(Math.abs(st), 1 / 1.35) * 2.6;
      simTick(1 / 60); if (TR.v * 3.6 > 92) over += 1 / 60;
      led = document.getElementById('ledText').textContent;
    }
    INP.tGas = 0; INP.tWheelHeld = false;
    return { fines: GAME.job.fines, limit: GAME.limit, over, led, kmh: TR.v * 3.6 };
  });
  assert.equal(r.limit, 80); assert.equal(r.fines, 9000, JSON.stringify(r));
  assert.ok(r.over > 4 && r.over < 4.3, `fined after ${r.over} s`);
  assert.match(r.led, /速度超過（制限80km\/h）/);
}));

test('夜になるとライトが自動でつき、トレーラーの尾灯もともる', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => {
    INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60);
    const read = () => ({ lamps: GAME.lampsOn, head: TRK.heads[0].material === TM.headOn, tail: TRL.tail[0].material === TM.redDim, spot: TRK.spot.intensity, night: TOD.night });
    const frames = n => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); });
    await frames(2); const day = read();
    GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 19 * 3600;
    await frames(10); const night = read();                  // the sky is re-evaluated every 0.5 s of game time
    return { day, night, link: TR.link };
  });
  assert.equal(r.link, 'coupled');
  assert.deepEqual([r.day.lamps, r.day.head, r.day.tail], [false, false, false], JSON.stringify(r.day));
  assert.deepEqual([r.night.lamps, r.night.head, r.night.tail], [true, true, true], JSON.stringify(r.night));
  assert.ok(r.night.spot > 0 && r.night.night > 0.9, JSON.stringify(r.night));
}));

import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// Drives through the game's own input path (the touch wheel and pedals) with simTick, so traffic,
// the toll gates and the job rules all run as they do for a player.
test('通し：東京の倉庫で連結し、入口から合流して厚木まで走り、料金所を通って町に入る', () => withGame({}, async (page, errors) => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    const drive = (thr, brk, steer) => {
      INP.tGas = thr; INP.tBrake = brk; INP.tWheelHeld = true;
      INP.tWheel = Math.sign(steer) * Math.pow(Math.abs(steer), 1 / 1.35) * 2.6;   // inverse of the touch wheel's curve
      simTick(1 / 60);
    };
    const steerTo = lat => clamp(0.35 * (lat - TR.lat) + 9 * wrapA(TR.h - headingAt(TR.s)) * (0.4 + Math.abs(TR.v) / 25), -1, 1);
    const log = { maxKmh: 0 };
    INP.actions.push('couple'); for (let i = 0; i < 150; i++) drive(0, 0, 0);
    log.coupled = TR.link;
    // through Tokyo's entrance gate and onto the entrance ramp
    __placeTown(0, 4.875, 80, 0, -1, 10); await __ready();
    const L0 = TOWNS_LOADED.get(0).layout, en = ENTRIES[0], ramp = [];
    // along the band, easing over into the travel lane before the band closes (from u = 330 to 420)
    for (let s = en.s0 + 40; s <= en.s1 + 120; s += 5) { const u = s - en.s0, p = posAt(s, u < 330 ? entryEdges(u).cx : lerp(entryEdges(330).cx, X_TRV, smooth(330, 420, u)), {}); ramp.push([p.x, p.z]); }
    __drive([...__town(0, [[4.875, 80], ...L0.plaza.entryPath]), ramp[0]], 15, 90, false);
    log.entryGate = L0.plaza.gates.entry.state;
    __clearRoad(en.s0 - 600, en.s1 + 600);                                   // a clear gap to merge into
    __drive(ramp, 60, 120, false);                                           // the entrance band, merging into the travel lane
    // the expressway (cruise for a while), Atsugi's exit and plaza, by lane-keeping
    const d = destRamp(); let n = 0, cruiseT = 0, cruiseMin = 99, cruiseMax = 0;
    while (GAME.state === 'drive' && n++ < 60 * 400 && TR.zone === 'road') {
      // the driver does not look at traffic: it does not brake for slower trucks ahead, and just after the entrance its
      // path swings it into the overtaking lane for a moment; clear the cars ahead, and behind it over the first 600 m
      if (n % 30 === 0) __clearRoad(TR.s < en.s1 + 600 ? TR.s - 150 : TR.s + 8, TR.s + 400);
      const u = TR.s - d.sDiv, kmh = TR.v * 3.6;
      let lat = X_TRV, want = 85;
      if (u > -150 && u < 120) lat = -9.8;                                  // drift left toward the exit lane
      if (u >= 120) { lat = rampEdges(Math.min(RAMP_LEN, u + 25)).cx; want = 40; }
      if (u > 380) want = 17;                                               // ETC gate ahead: 20 km/h or less
      if (TR.s > en.s1 + 300 && TR.s < en.s1 + 900 && !TR.cruise && kmh > 60 && cruiseT === 0) INP.actions.push('cruise');
      if (TR.cruise) { cruiseT += 1 / 60; if (cruiseT > 3) { cruiseMin = Math.min(cruiseMin, kmh); cruiseMax = Math.max(cruiseMax, kmh); } }
      if (TR.cruise && TR.s > en.s1 + 900) INP.actions.push('cruise');      // switch it off again
      drive(TR.cruise ? 0 : clamp((want - kmh) * 0.25, 0, 1), TR.cruise ? 0 : clamp((kmh - want - 3) * 0.12, 0, 1), steerTo(lat));
      log.maxKmh = Math.max(log.maxKmh, kmh);
      if (u > RAMP_LEN - 40) break;
    }
    INP.tGas = INP.tBrake = 0; INP.tWheelHeld = false;
    await __ready(); __noTownCars(2);   // the driver here does not look at traffic
    const L2 = TOWNS_LOADED.get(2).layout;
    __drive(__town(2, [...L2.plaza.exitPath.slice(2), [-4.875, 70]]), 15, 90);
    return { ...log, ticks: n, zone: TR.zone, town: TR.town, gate: L2.plaza.gates.exit.state, toll: GAME.job.toll, damage: TR.damage, fines: GAME.job.fines, cruise: [cruiseT, cruiseMin, cruiseMax] };
  });
  assert.equal(r.coupled, 'coupled'); assert.equal(r.entryGate, 'open');
  assert.deepEqual([r.zone, r.town, r.gate], ['town', 2, 'open'], JSON.stringify(r)); assert.ok(r.toll > 0, 'ETC fare charged');
  assert.ok(r.maxKmh > 80 && r.maxKmh < 93, `top speed ${r.maxKmh}`);
  assert.ok(r.cruise[0] > 10 && r.cruise[2] - r.cruise[1] < 6, `cruise held ${JSON.stringify(r.cruise)}`);
  assert.ok(r.damage < 10, `damage ${r.damage}`); assert.equal(r.fines, 0, JSON.stringify(r));
  assert.deepEqual(errors, []);
  console.log('playthrough:', JSON.stringify(r));
}));

test('目的地でない出口のゲートを通ると、罰金なしで「入口から高速に戻れます」と出る', () => withGame({}, async page => {
  await startJob(page); await driveHelpers(page);
  const r = await page.evaluate(async () => {
    __placeTown(1, -5, 14, 0, 1, 10, false); await __ready(); GAME.job.fines = 0;   // 横浜町田: not job 1's destination
    __drive(__town(1, [[-5, 14], [-5, 50]]), 12, 20);
    return { fines: GAME.job.fines, gate: TOWNS_LOADED.get(1).layout.plaza.gates.exit.state, led: document.getElementById('ledText').textContent, to: GAME.job.to };
  });
  assert.deepEqual([r.fines, r.gate, r.to], [0, 'open', 2], JSON.stringify(r)); assert.match(r.led, /目的地ではありません。入口から高速に戻れます/);
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

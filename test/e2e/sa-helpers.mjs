// Shared steps for the service-area browser tests (sa, care, care-save).
import { startJob, driveHelpers } from './helpers.mjs';

// In the page: the job's trailer coupled, then the rig in service area k's deceleration lane at u (heading along it), ready.
export const atLane = async (page, k = 0, u = 100, kmh = 15) => {
  await startJob(page); await driveHelpers(page);
  await page.evaluate(async ([k, u, kmh]) => {
    INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
    const a = SAS[k]; __clearRoad(a.sDiv - 400, a.sEnd + 400);
    placeTruck(a.sDiv + u, saExitEdges(u, {}).cx, kmh / 3.6, { coupled: true }); await __ready();
  }, [k, u, kmh]);
};
// In the page: the rig stopped in a slot of service area k ('pump' 0 or the first free 'stall'), the button updated.
export const inSlot = (page, kind, k = 0) => page.evaluate(async ([kind, k]) => {
  const L = SA_LOADED.get(k).layout, s = kind === 'pump' ? L.pumps[0] : L.stalls.find(x => !x.taken);
  __placeSa(k, s.u, s.v, s.hu, s.hv, 0); for (let n = 0; n < 30; n++) simTick(1 / 60);
  const b = document.getElementById('bStop');
  return { shown: !b.hidden, text: b.textContent, kind: GAME.stopKind };
}, [kind, k]);
// Press the place button and wait until the fade is over (real frames run the fade).
export const pressStop = page => page.evaluate(async () => {
  document.getElementById('bStop').click(); for (let n = 0; n < 4; n++) simTick(1 / 60);
  const t0 = performance.now(); while (GAME.state !== 'drive' && performance.now() - t0 < 20000) await __t.frames(1);
  return { state: GAME.state, led: document.getElementById('ledText').textContent };
});

// In the page: job 2 (厚木 → 御殿場, past 中井 and 足柄), coupled, the rig on the travel lane `off` m from service
// area k's divergence, at kmh.
export const job2At = (page, k, off, kmh, fuel, sleepy) => page.evaluate(async ([k, off, kmh, fuel, sleepy]) => {
  const s = SAS[k].sDiv + off;
  GAME.jobIdx = 1; setupJob(1); __clearRoad(s - 400, s + 3000);
  placeTruck(s, X_TRV, kmh / 3.6, { coupled: true }); await __ready();
  TR.fuel = fuel; GAME.sleepy = sleepy; for (let n = 0; n < 20; n++) simTick(1 / 60);
}, [k, off, kmh, fuel, sleepy]);


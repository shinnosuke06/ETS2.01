// The nine reference views: the same angles as the user's photos 1-9, in the tractor's own coordinates
// (front -z, right +x, up +y, origin on the ground under the rear axle). R1-R3 are inside the cab with the
// truck where the job starts; R4-R9 show the tractor alone in the travel lane 3 km down the road.
export const REFVIEWS = {
  R1: { photo: 1, p: [0, 2.65, -3.5], t: [0.15, 2.2, -5.3], fov: 85, inCab: true, theme: 'black', hour: 19.5 },
  R2: { photo: 2, p: [-1.05, 2.5, -4.9], t: [0.7, 2.2, -3.5], fov: 75, inCab: true, theme: 'beige', hour: 12 },
  R3: { photo: 3, p: [1.05, 2.5, -4.75], t: [-0.9, 2.15, -4.2], fov: 80, inCab: true, theme: 'red', hour: 12 },
  R4: { photo: 4, p: [0.6, 1.9, -12.5], t: [0, 2.2, -5.4], fov: 40, paint: 'red', trim: 'custom', hour: 12 },
  R5: { photo: 5, p: [5.5, 1.6, -2.3], t: [0, 1.8, -2.4], fov: 55, paint: 'blue', trim: 'normal', hour: 12 },
  R6: { photo: 6, p: [1.8, 3.0, 2.8], t: [-0.2, 2.5, -3.3], fov: 45, paint: 'silver', trim: 'normal', hour: 17 + 10 / 60 },
  R7: { photo: 7, p: [-6.5, 3.2, 3.0], t: [0, 1.5, -2.4], fov: 45, paint: 'white', trim: 'normal', hour: 12 },
  R8: { photo: 8, p: [-4.8, 2.0, 4.2], t: [0, 1.5, -2.0], fov: 45, paint: 'white', trim: 'normal', hour: 12 },
  R9: { photo: 9, p: [3.6, 1.0, 3.8], t: [0, 1.3, -1.8], fov: 45, paint: 'white', trim: 'custom', hour: 12 },
};

// Set the game up for one reference view and let it settle. The job must already be running (startJob).
export async function applyRefView(page, id) {
  const v = REFVIEWS[id];
  if (!v) throw new Error('unknown reference view ' + id);
  await page.evaluate(async v => {
    if (v.theme) applyInteriorTheme(v.theme);
    if (v.paint) applyPaint(v.paint);
    if (v.trim) applyTrim(v.trim, TRK);
    if (!v.inCab) placeTruck(S0 + 3000, X_TRV, 0, { coupled: false });
    GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + v.hour * 3600;
    applyTimeOfDay(v.hour, 0); setVehicleLight(1 - TOD.night, 0); GAME.todT = 0.5;   // do not wait for the half-second update
    GAME.hazard = false; GAME.autoHazard = false; GAME.lights = false;
    window.__camOverride = { p: v.p, t: v.t, fov: v.fov, inCab: !!v.inCab };
    // the picture only: hide every overlay (start-up messages would otherwise reappear on their timers)
    if (!document.getElementById('refshotStyle')) document.head.insertAdjacentHTML('beforeend', '<style id="refshotStyle">body > *:not(canvas) { visibility: hidden !important; }</style>');
    await __t.frames(12);
  }, v);
}

// Opens the built single-file game in headless Chromium, with the CDN copy of three served from node_modules.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url);
const ORIGIN = 'http://game.test/';

// storage: values put in localStorage before the game starts (e.g. { 'nlh.quality': 'low' }).
export async function openGame({ width = 1280, height = 720, touch = false, storage = {} } = {}) {
  const body = fs.readFileSync(new URL('index.html', ROOT), 'utf8');
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + body + '</body></html>';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  // In-page test tools: wait for frames, and the first ray hit on something actually shown
  // (Raycaster does not look at whether a parent is hidden).
  await context.addInitScript(st => {
    for (const [k, v] of Object.entries(st)) localStorage.setItem(k, JSON.stringify(v));
    window.__t = {
      frames: n => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); }),
      shown: o => { for (; o; o = o.parent) if (!o.visible) return false; return true; },
      first: (rc, root) => rc.intersectObject(root, true).find(h => window.__t.shown(h.object)) || null,
    };
  }, storage);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(ORIGIN, r => r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await page.route('**/three.min.js', r => r.fulfill({ path: new URL('node_modules/three/build/three.min.js', ROOT).pathname, contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  try {
    await page.goto(ORIGIN, { timeout: 60000 });   // the page builds the whole game before "load"; slow when the machine is busy
    await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 60000 });
  } catch (e) {
    await browser.close();   // an open browser would keep the test runner alive forever
    throw new Error('the game did not start: ' + (errors[0] || e.message));
  }
  return { browser, page, errors };
}
// Runs fn(page, errors) against a fresh game and always closes the browser.
export async function withGame(opts, fn) {
  const { browser, page, errors } = await openGame(opts);
  try { return await fn(page, errors); } finally { await browser.close(); }
}
// Press the start button and wait until the engine is running.
export async function startJob(page) {
  await page.click('#startBtn');
  await page.waitForFunction(() => GAME.state === 'drive' && GAME.engineOn, null, { timeout: 20000 });
}
export const led = page => page.evaluate(() => document.getElementById('ledText').textContent);
// Move game time forward by `seconds` without waiting for frames (headless software GL draws about 2 a second).
// Returns what the LED board says right afterwards (start-up messages on real-time timers can replace it later).
export const tick = (page, seconds) => page.evaluate(n => { for (let i = 0; i < n; i++) simTick(1 / 60); return document.getElementById('ledText').textContent; }, Math.round(seconds * 60));
// Draw one frame with the current camera and, in the same task, read the average brightness (0..255) of each
// screen rectangle [x0, y0, x1, y1] given as fractions of the canvas, (0, 0) at the bottom left.
export const luma = (page, rects) => page.evaluate(rects => {
  renderer.render(scene, activeCam);
  const gl = renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
  return rects.map(([x0, y0, x1, y1]) => {
    const X = Math.floor(x0 * w), Y = Math.floor(y0 * h), W = Math.max(1, Math.floor((x1 - x0) * w)), H = Math.max(1, Math.floor((y1 - y0) * h));
    const px = new Uint8Array(W * H * 4); gl.readPixels(X, Y, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    return s / (W * H);
  });
}, rects);

// In the page: drive along pts ([[x, z], ...] world) through the game's own input (touch pedals and wheel) with simTick,
// pure pursuit with an 8 m look-ahead, at kmh. Stops when within 3 m of the end, or after `seconds` of game time.
const DRIVE_SRC = `window.__drive = (path, kmh, seconds = 120, stopAtEnd = true) => {
  const pts = [path[0]];
  for (let i = 1; i < path.length; i++) { const a = path[i - 1], b = path[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]))); for (let k = 1; k <= n; k++) pts.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  let j = 0, t = 0;
  const set = (thr, brk, steer) => { INP.tGas = thr; INP.tBrake = brk; INP.tWheelHeld = true; INP.tWheel = Math.sign(steer) * Math.pow(Math.abs(steer), 1 / 1.35) * 2.6; };
  while (t < seconds && GAME.state === 'drive') {
    while (j < pts.length - 1 && Math.hypot(pts[j + 1][0] - TR.x, pts[j + 1][1] - TR.z) <= Math.hypot(pts[j][0] - TR.x, pts[j][1] - TR.z)) j++;
    const end = pts[pts.length - 1], left = Math.hypot(end[0] - TR.x, end[1] - TR.z);
    if (left < 3) break;
    const k = Math.min(pts.length - 1, j + 8), dx = pts[k][0] - TR.x, dz = pts[k][1] - TR.z;
    const alpha = Math.atan2(dx * Math.cos(TR.h) - dz * Math.sin(TR.h), dx * Math.sin(TR.h) + dz * Math.cos(TR.h));
    const delta = Math.atan(2 * 3.9 * Math.sin(alpha) / Math.max(4, Math.hypot(dx, dz))), v = TR.v * 3.6;
    const want = stopAtEnd ? Math.min(kmh, 4 + left * 1.2) : kmh;
    set(clamp((want - v) * 0.25, 0, 1), clamp((v - want - 2) * 0.15, 0, 1), clamp(-delta / steerLock(TR.v), -1, 1));
    simTick(1 / 60); t += 1 / 60;
  }
  if (stopAtEnd) for (let n = 0; n < 240 && Math.abs(TR.v) > 0.05; n++) { set(0, 0.8, 0); simTick(1 / 60); }
  INP.tGas = INP.tBrake = 0; INP.tWheelHeld = false;
  return t;
};
window.__town = (i, pts) => { const site = TOWN_SITES[i], q = {}; return pts.map(([u, v]) => { townXZ(site, u, v, q); return [q.x, q.z]; }); };
window.__placeTown = (i, u, v, du, dv, kmh, coupled = true) => { const site = TOWN_SITES[i], q = {}; townXZ(site, u, v, q); placeTruckAt(q.x, q.z, site.hu + Math.atan2(dv, du), kmh / 3.6, { coupled }); };
window.__ready = async () => { let left = 1; while (left) { left = updateChunks(TR.s, 4) + townsTick(200); await __t.frames(1); } };`;
// Put __drive, __town, __placeTown and __ready into the page.
export const driveHelpers = page => page.evaluate(DRIVE_SRC);

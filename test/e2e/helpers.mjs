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

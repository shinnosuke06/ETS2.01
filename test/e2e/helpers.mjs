// Opens the built single-file game in headless Chromium, with the CDN copy of three served from node_modules.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const ROOT = new URL('../../', import.meta.url);
const ORIGIN = 'http://game.test/';

export async function openGame({ width = 1280, height = 720, touch = false } = {}) {
  const body = fs.readFileSync(new URL('index.html', ROOT), 'utf8');
  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>' + body + '</body></html>';
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(ORIGIN, r => r.fulfill({ body: html, contentType: 'text/html; charset=utf-8' }));
  await page.route('**/three.min.js', r => r.fulfill({ path: new URL('node_modules/three/build/three.min.js', ROOT).pathname, contentType: 'application/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.route('https://fonts.gstatic.com/**', r => r.abort());
  await page.goto(ORIGIN);
  await page.waitForFunction(() => !document.getElementById('startBtn').disabled, null, { timeout: 120000 });
  return { browser, page, errors };
}

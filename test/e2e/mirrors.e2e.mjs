// The mirrors and the back monitor on the screen at five screen sizes (where they go, what they keep clear, what
// stays put), and the top buttons put away and back.
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob, driveHelpers } from './helpers.mjs';

// The rectangles of the HUD's buttons and boxes shown now, and the mirror panels.
const LAYOUT = () => {
  const rect = el => { const r = el.getBoundingClientRect(); return { name: el.id || el.className, x: r.left, y: r.top, r: r.right, b: r.bottom }; };
  const els = [...document.querySelectorAll('#topbar .tb, #jobSign, #navCard, #speedo, #touch button, #wheelPad, #pGas, #pBrake')].filter(e => !e.hidden && e.getBoundingClientRect().width > 0);
  const pan = SMIR.lay ? Object.entries(SMIR.lay).map(([k, p]) => ({ name: 'mirror ' + k, x: p.x, y: p.y, r: p.x + p.w, b: p.y + p.h })) : [];
  return { shown: SMIR.shown, hud: els.map(rect), pan, W: innerWidth, H: innerHeight };
};
const hits = (a, b) => a.x < b.r - 1 && b.x < a.r - 1 && a.y < b.b - 1 && b.y < a.b - 1;

test('ミラーとバックモニター：車内視点では初めから出て、ボタンや札と重ならず画面の中。「ミラー」で消え、覚えている', async () => {
  for (const [w, h, touch] of [[1280, 720, false], [844, 390, true], [667, 375, true], [390, 844, true], [375, 667, true]]) {
    let store;
    await withGame({ width: w, height: h, touch }, async (page, errors) => {
      await startJob(page); await driveHelpers(page);
      const r = await page.evaluate(async LAYOUT => {
        if (document.body.classList.contains('touch') === false && innerWidth < 900) enableTouchUI();
        INP.actions.push('couple'); for (let i = 0; i < 160; i++) simTick(1 / 60);
        setCam('cab'); await __t.frames(3); smirLayout(true); await __t.frames(2);
        return (0, eval)('(' + LAYOUT + ')')();
      }, LAYOUT.toString());
      const tag = `${w}x${h}`;
      assert.equal(r.shown, true, tag);
      // the middle of the screen (the road ahead) stays clear; portrait: all three in the top row; landscape: the
      // back monitor in the lower half (under the instrument cluster), the side mirrors in the top corners
      const mid = { x: r.W * 0.25, r: r.W * 0.75, y: r.H * 0.3, b: r.H * 0.6 };
      for (const p of r.pan) assert.ok(!hits(p, mid), `${tag} ${p.name} in the middle ${JSON.stringify(p)}`);
      const B = r.pan.find(p => p.name === 'mirror B');
      if (h > w) assert.ok(r.pan.every(p => p.y < 20 && p.b < r.H * 0.2), `${tag} ${JSON.stringify(r.pan)}`);
      else assert.ok(B.y > r.H / 2 && r.pan.filter(p => p !== B).every(p => p.b < r.H * 0.5), `${tag} ${JSON.stringify(r.pan)}`);
      for (const p of r.pan) {
        assert.ok(p.x >= 0 && p.y >= 0 && p.r <= r.W && p.b <= r.H, `${tag} ${p.name} off screen ${JSON.stringify(p)}`);
        for (const b of r.hud) assert.ok(!hits(p, b), `${tag} ${p.name} over ${b.name} ${JSON.stringify([p, b])}`);
      }
      const off = await page.evaluate(async () => {
        const pads = () => [...document.querySelectorAll('#touch > *')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; });
        const before = pads(); document.getElementById('bMirror').click(); for (let i = 0; i < 3; i++) simTick(1 / 60); await __t.frames(2);
        return { shown: SMIR.shown, saved: JSON.parse(localStorage.getItem('nlh.mirrors')), pad: getComputedStyle(document.getElementById('hud')).getPropertyValue('--mir'), before, after: pads() };
      });
      assert.equal(off.shown, false, tag); assert.equal(off.saved.cab, false); assert.equal(off.pad.trim(), '');
      assert.deepEqual(off.after, off.before, `${tag}: the touch controls moved with the mirrors`);
      store = { 'nlh.mirrors': off.saved };
      assert.deepEqual(errors, []);
    });
    await withGame({ width: w, height: h, touch, storage: store }, async (page, errors) => {
      await startJob(page);
      const r = await page.evaluate(async () => { setCam('cab'); await __t.frames(3); return SMIR.shown; });
      assert.equal(r, false, 'remembered as hidden');
      assert.deepEqual(errors, []);
    });
  }
});

test('上のボタンは「▲ 隠す」でしまえて（切り替えのボタンだけ残る）、「▼ ボタン」で戻る。開き直しても覚えている', async () => {
  let store;
  await withGame({ width: 844, height: 390, touch: true }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(async () => {
      const shown = () => [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden && b.getBoundingClientRect().width > 0).map(b => b.id);
      const before = shown(); document.getElementById('bBtns').click(); for (let i = 0; i < 3; i++) simTick(1 / 60); await __t.frames(2);
      return { before, hidden: shown(), label: document.getElementById('bBtns').textContent, saved: localStorage.getItem('nlh.btnsHidden') };
    });
    assert.ok(r.before.length >= 7, JSON.stringify(r)); assert.deepEqual(r.hidden, ['bBtns']); assert.equal(r.label, '▼ ボタン'); assert.equal(r.saved, 'true');
    store = { 'nlh.btnsHidden': true };
    assert.deepEqual(errors, []);
  });
  await withGame({ width: 844, height: 390, touch: true, storage: store }, async (page, errors) => {
    await startJob(page);
    const r = await page.evaluate(async () => {
      const n = () => [...document.querySelectorAll('#topbar .tb')].filter(b => !b.hidden && b.getBoundingClientRect().width > 0).length;
      const kept = n(); document.getElementById('bBtns').click(); for (let i = 0; i < 3; i++) simTick(1 / 60); await __t.frames(2);
      return { kept, back: n(), label: document.getElementById('bBtns').textContent };
    });
    assert.equal(r.kept, 1); assert.ok(r.back >= 7); assert.equal(r.label, '▲ 隠す');
    assert.deepEqual(errors, []);
  });
});

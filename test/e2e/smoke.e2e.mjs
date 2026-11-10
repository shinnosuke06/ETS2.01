import test from 'node:test'; import assert from 'node:assert/strict';
import { openGame } from './helpers.mjs';
test('起動して走り出せる', async () => {
  const { browser, page, errors } = await openGame();
  await page.click('#startBtn'); await page.waitForTimeout(1500);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(3000); await page.keyboard.up('KeyW');
  const st = await page.evaluate(() => ({ state: GAME.state, v: TR.v }));
  await browser.close();
  assert.equal(st.state, 'drive'); assert.ok(st.v > 1); assert.deepEqual(errors, []);
});

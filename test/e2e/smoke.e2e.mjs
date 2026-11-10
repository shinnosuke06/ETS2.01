import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame } from './helpers.mjs';
test('起動して走り出せる', () => withGame({}, async (page, errors) => {
  await page.click('#startBtn');
  await page.waitForFunction(() => GAME.state === 'drive' && GAME.engineOn, null, { timeout: 20000 });
  await page.keyboard.down('KeyW');
  await page.waitForFunction(() => TR.v > 1, null, { timeout: 30000 });   // the frame rate of headless software GL varies
  await page.keyboard.up('KeyW');
  assert.deepEqual(errors, []);
}));

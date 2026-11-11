// The game shows no real maker's name, model name or emblem (the company on the trailer is made up).
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs';

test('ゲームの画面とコードに、実在のメーカー名・車種名・紋章の名前がない', () => {
  const dir = new URL('../src/', import.meta.url), hits = [];
  for (const f of fs.readdirSync(dir)) {
    fs.readFileSync(new URL(f, dir), 'utf8').split('\n').forEach((line, i) => {
      if (/スカニア|scania|グリフィン|griffin|Sシリーズ|S-series/i.test(line)) hits.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(hits, []);
});

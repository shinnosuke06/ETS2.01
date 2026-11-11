// Screenshots of the reference views, and (with REF_PHOTOS=<folder with 1.jpg .. 9.jpg>) the photo and the
// game side by side.  Usage: node tools/refshot.mjs [R1 R2 ... | all] [--q high|mid|low]
// Writes out/refshots/<id>.png and out/refshots/<id>-compare.jpg.
import fs from 'node:fs';
import path from 'node:path';
import { openGame, startJob } from '../test/e2e/helpers.mjs';
import { REFVIEWS, applyRefView } from '../test/e2e/refviews.mjs';

const args = process.argv.slice(2), qi = args.indexOf('--q'), quality = qi >= 0 ? args[qi + 1] : 'high';
let ids = args.filter(a => /^R\d$/.test(a));
if (!ids.length || args.includes('all')) ids = Object.keys(REFVIEWS);
const outDir = new URL('../out/refshots/', import.meta.url).pathname;
fs.mkdirSync(outDir, { recursive: true });
const photos = process.env.REF_PHOTOS;
const dataUrl = (file, type) => `data:${type};base64,${fs.readFileSync(file).toString('base64')}`;

const { browser, page } = await openGame({ storage: { 'nlh.quality': quality } });
try {
  await startJob(page);
  // all game pictures first: opening another page sends the game tab to the background
  for (const id of ids) {
    await applyRefView(page, id);
    await page.screenshot({ path: path.join(outDir, `${id}.png`) });
    console.log(id, 'shot');
  }
  if (photos) {
    await page.close();   // the busy WebGL page can make the next page's screenshot fail
    const cmp = await browser.newPage({ viewport: { width: 1600, height: 560 } });
    for (const id of ids) {
      const photo = path.join(photos, `${REFVIEWS[id].photo}.jpg`), shot = path.join(outDir, `${id}.png`);
      if (!fs.existsSync(photo)) continue;
      await cmp.setContent(`<body style="margin:0;background:#111;display:flex;gap:8px;padding:8px;box-sizing:border-box;height:560px">
        ${[[dataUrl(photo, 'image/jpeg'), '写真 ' + REFVIEWS[id].photo], [dataUrl(shot, 'image/png'), 'ゲーム ' + id]].map(([src, cap]) =>
          `<figure style="margin:0;flex:1;min-width:0;display:flex;flex-direction:column;color:#ddd;font:14px sans-serif"><img src="${src}" style="flex:1;min-height:0;width:100%;object-fit:contain"><figcaption>${cap}</figcaption></figure>`).join('')}</body>`);
      await cmp.screenshot({ path: path.join(outDir, `${id}-compare.jpg`), type: 'jpeg', quality: 85 });
      console.log(id, 'compared');
    }
  }
} finally { await browser.close(); }

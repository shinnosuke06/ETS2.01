# トラックの外観と室内 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トラクターの外観と室内を、曲面の形・素材の質感・窓から入る光で作り直し、ユーザーの写真 9 枚に見える車両にする。

**Architecture:** 形を作る道具（`06a-modelkit.js`、DOM なし）と車両の素材（`06b-materials.js`）を先に作り、その上で室内（`07a`・`07b`）→ 外観（`06c`）の順に部品を置き換える。車両は `mountVehicle()` でまとめて組み立て、画質を変えたら作り直す。どのタスクのあともゲームは動き、テストは通る。

**Tech Stack:** Three.js r128（CDN、テストは npm の `three@0.128.0`）、素の JavaScript（グローバルスコープのスクリプトを `build.mjs` が名前順につなぐ）、`node --test`、Playwright（headless Chromium + swiftshader）。

**Spec:** `docs/superpowers/specs/2026-11-10-truck-detail-design.md`

## Global Constraints

- ゲームは 1 つの HTML にまとまる。形もテクスチャもコードで作る。外部の 3D モデル・画像は読み込まない。
- ロゴ、社名、グリフィンの絵は入れない。グリル中央、キャブの後ろ、泥よけ、ハンドル中央は無地。
- 座標：原点は後軸の中心の真下の地面。前が −z、右が +x、上が +y。右ハンドル。
- 外寸と物理は変えない：キャブ前面 z = −5.40、後面 z = −3.12、全幅 2.50、屋根 y = 4.02、ホイールベース 3.9、連結点は後軸の 0.35 前。`09a`〜`09c` と `RIGP` には触れない。
- 室内の箱：床 y = 1.45、天井 y = 3.80、内側の幅 2.36、前の壁 z = −5.31、後ろの壁 z = −3.19。目の位置 (0.55, 2.62, −4.28)。運転席 x = +0.55、助手席 x = −0.60。
- 色の出し方は変えない：`renderer.outputEncoding`、`toneMapping` に触れない。
- つなぎを保つ：`buildTractor()` は `root, cab, cabPivot, blinkL, blinkR, heads, lightbar, spin, steer, rear, coil, coilStowed, spot, mirrors, wipers` を返す。`buildInterior(T)` は `cluster, nav, wheel, gas, brake, charm, charmState, eye` を返す。`TM.amberOn/amberOff/headOn/headOff/white/whiteOn/redOn/redOff/redDim/marker/ledRed`、`applyPaint`、`paintName`、`applyInteriorTheme`、`interiorName`、`setCabAmbient` を残す。
- 保存する設定の名前：`nlh.trim`（`normal`｜`custom`、初期値 `normal`）、`nlh.paint`、`nlh.interior`（`black`｜`beige`｜`red`。表示名だけ「ベージュ」→「ライトグレー」）。
- 細かさの上限（三角形）：室内 高 100,000／中 60,000／低 35,000。外観 高 60,000／中 36,000／低 21,000。部品（メッシュ）の数は車内視点で 110 以下。素材は室内 24 以下、外観 30 以下。模様の大きさは 高 512、中・低 256。`DETAIL` は 高 1.0、中 0.6、低 0.35。
- r128 の決まり（試して確かめた）：Standard／Physical 素材の `envMap` に CubeTexture をそのまま渡すと映り込みが黒くなる。必ず `new THREE.PMREMGenerator(renderer).fromCubemap(cube).texture` を渡す。キューブの 6 面は同じ大きさにする。
- ソースはグローバルスコープ。ファイルをまたいで同じ名前の `const`／`let`／`function` を作らない（`test/math.test.mjs` の「全ファイルをつなげても…」が見張っている）。`roundRect` は `03-gfx.js` にあるので、道具の側は `roundRectPts` とする。
- `build.mjs` はファイル名の文字の順につなぐ。`06-truck.js` は `06a`・`06b` より先に読まれる（`-` は `a` より前）。読み込み時に `TM`・`IM`・`TEX` の素材を使うコードは、`06b-materials.js` より後ろの名前のファイルに置く。
- 今ある 77 件のテスト（`npm test` 55 件、`npm run e2e` 22 件）は通り続ける。e2e は遅い（全体で約 8 分、1 フレーム 0.5 秒）。ゲーム時間は `tick(page, 秒)` で進める。
- コミットのたびに `npm run build` で `index.html` を作り直して一緒にコミットし、`git push -u origin claude/nippon-long-haul-game` する。プルリクエストは作らない。コミットメッセージの最後に、セッションの指示にある帰属の 2 行（`Co-Authored-By: …` と `Claude-Session: …`）を付ける。
- 写真はリポジトリに入れない。比較には `REF_PHOTOS`（`1.jpg`〜`9.jpg` のあるフォルダ）を使う。今は `/tmp/claude-0/-home-user-ETS2-01/3b191e5d-fb4f-582f-9582-414284932c23/scratchpad/photos/ref`。なくなっていたら、会話の記録 `/root/.claude/projects/-home-user-ETS2-01/3b191e5d-fb4f-582f-9582-414284932c23.jsonl` の、ユーザーの発言「車両の内装外装の写真を見て…」に付いた画像 9 枚を、付いていた順に `1.jpg`〜`9.jpg` として取り出す。

## Review Focus

設計書が暗に求めているが、V1〜V11 では試されない条件。それぞれのテストを担当タスクに入れてある。

1. 走行中にメニューで画質を切り替える → 車両が作り直されても、ミラー、車内のカメラ、灯火、連結中のトレーラーがそのまま動く。6 回切り替えても、形とテクスチャの数が増え続けない。（Task 3）
2. スマホの縦持ち（視野 80°）の車内視点 → 計器の中心が画面に入り、前方の道路がダッシュやピラーで隠れない。（Task 5）
3. 車内で見回す（左右 ±140°、上下 ±35°）→ 面の欠けや裏側から外が見える穴がない。（Task 9）
4. 夜とトンネルの車内視点 → ダッシュとハンドルが真っ黒にならず、昼より暗い。（Task 9）
5. 新しい導風板やミラーの形が「映る鏡」のカメラをふさぐ → ミラーには後ろの道路とトレーラーの側面が映り続ける。（Task 10）

---

## 共通の定義

### 部品の記録

形を作るとき、部品の名前ごとに三角形の数と、形を包む箱を記録する。テストはこの記録で寸法と上限を確かめる。

```js
// 01b-three.js
const VEH_STATS = { parts: {}, group: null };          // name -> { tris, box: [minx, miny, minz, maxx, maxy, maxz], group }
function statPart(name, geo, toRoot)                   // 記録に足す（geo は変えない）。同じ名前は三角形を足し、箱を広げる
// Parts に足す：part(name, toRoot = null) を呼ぶと、以後の add/box/cyl がその名前で記録される。part(null) で止める。
// 箱はトラクターの root の座標で表す。toRoot は、その Parts を build する親から root への Matrix4（省略時は単位行列。
// cab と室内は root と同じ座標なので省略できる。車輪のように位置をずらした Group の中の部品は、その Group の matrix を渡す）。
// group は VEH_STATS.group の値（mountVehicle が、外観を作る前に 'exterior'、室内を作る前に 'interior' にする）
```

### 基準の視点

`test/e2e/refviews.mjs` が、R1〜R9 の設定を持つ（Task 4）。カメラはトラクターの座標で与える。

| 視点 | p（位置） | t（見る点） | 視野 | 設定 |
| --- | --- | --- | --- | --- |
| R1 | [0, 2.75, −3.45] | [0.1, 2.25, −5.3] | 85 | 車内、ブラック、19:30 |
| R2 | [−1.05, 2.5, −4.9] | [0.7, 2.2, −3.5] | 75 | 車内、ライトグレー（`beige`）、12:00 |
| R3 | [1.1, 2.55, −4.0] | [−0.9, 2.2, −4.6] | 80 | 車内、レッド、12:00 |
| R4 | [0.6, 1.9, −12.5] | [0, 2.2, −5.4] | 40 | 赤、`custom`、12:00 |
| R5 | [−11, 1.8, −2.2] | [0, 1.9, −2.4] | 40 | 青、`normal`、12:00 |
| R6 | [−3.2, 2.6, −0.6] | [−0.9, 2.6, −3.3] | 45 | 銀、`normal`、17:10 |
| R7 | [4.5, 2.3, 4.5] | [0, 1.6, −2.2] | 45 | 白、`normal`、12:00 |
| R8 | [−4.8, 2.0, 4.2] | [0, 1.5, −2.0] | 45 | 白、`normal`、12:00 |
| R9 | [3.6, 1.0, 3.8] | [0, 1.3, −1.8] | 45 | 白、`custom`、12:00 |

R4〜R9 は、トレーラーを連結しないトラクターだけを、`S0 + 3000` の走行車線に置いて撮る。

### 見比べの手順（形を作るタスクで毎回使う）

`REF_PHOTOS=<写真のフォルダ> node tools/refshot.mjs R1 R2 …` を実行し、`out/refshots/R<n>-compare.jpg`（左が写真、右がゲーム）を開く。設計書 10.1 の「画面に見えるべきもの」のうち、そのタスクで作った部品が見分けられ、形と配置が写真と食い違わなければ合格。食い違いは直してから次へ進む。

---

### Task 1: 形を作る道具

**Files:**
- Create: `src/06a-modelkit.js`
- Modify: `src/01b-three.js`（`VEH_STATS`、`statPart`、`Parts.part`、`mergeGeometries` の色の扱い）
- Create: `test/helpers/kit.mjs`、`test/modelkit.test.mjs`

**Interfaces:**
- Produces（`06a-modelkit.js`）：
  - `setDetail(k)`、`seg(n, min = 2)` → `Math.max(min, Math.round(n * DETAIL))`
  - `loft(rings, opts)`：`rings` は `[[x,y,z],…]` の配列（点の数は同じ）。`opts = { closed = true, capStart = false, capEnd = false, crease = 40, flip = false }`。輪の点は、輪が進む先から振り返って見て反時計回りに並べると、外向きの面になる。
  - `sweep(profile, path, opts)`：`profile` は `[[a,b],…]`、`path` は `[{ p: [x,y,z], s = 1, tilt = 0 }, …]`。道筋の向き t に対して、横 = up × t、縦 = t × 横。点 = p + s·(a·横 + b·縦)。`opts = { closed = false, up = [0,1,0], crease = 40, capStart, capEnd, flip }`。+z に進むとき (a, b) は (x, y)。
  - `roundBox(w, h, d, r, s = 3)`：中心が原点。`roundRectPts(w, h, r, s = 4)` → 反時計回りの輪郭 `[[x,y],…]`。
  - `panel(outline, depth, bevel = 0.004)`：輪郭を z = 0 から z = depth へ押し出し、前の縁を丸める。
  - `lathe(profile, n = 24)`：`[[r,y],…]` を下から上へ。`tube(points, r, n = 8, closed = false)`。
  - `creaseNormals(geo, deg = 40)` → 法線を付けた非インデックスの形。`shade(geo, fn)`：`fn(x,y,z,nx,ny,nz)` → 0〜1 を頂点の色に書く。`triCount(o)`：形、またはオブジェクト以下の全メッシュ。
  - どの形も `position`・`normal`・`uv` を持つ。`loft` と `sweep` の UV は、輪に沿った長さと輪の間の長さ（m）。
- Produces（`01b-three.js`）：「共通の定義」の部品の記録。`mergeGeometries(list, forceColor = false)`：`forceColor` のとき、色のない形には白を入れる。`Parts.build` は、素材が `vertexColors` なら `forceColor` で作る（色の属性がないと黒くなるため）。

- [ ] **Step 1: テスト用の読み込みを書く**（`test/helpers/kit.mjs`）

```js
import fs from 'node:fs'; import { createRequire } from 'node:module';
const require = createRequire(import.meta.url); const SRC = new URL('../../src/', import.meta.url);
const NAMES = ['setDetail', 'seg', 'loft', 'sweep', 'roundBox', 'roundRectPts', 'panel', 'lathe', 'tube', 'creaseNormals', 'shade', 'triCount', 'Parts', 'mergeGeometries', 'VEH_STATS', 'statPart'];
export function loadKit() {
  const THREE = require('three');
  const src = ['01a-math.js', '01b-three.js', '06a-modelkit.js'].map(f => fs.readFileSync(new URL(f, SRC), 'utf8')).join('\n');
  return new Function('THREE', `${src}\n;return { THREE, ${NAMES.join(', ')} };`)(THREE);
}
// { finite, maxNormalErr, degenerate, min, max, size, volume }。volume は原点と各三角形が作る四面体の符号つき体積の和
export function stats(geo) { /* position と normal を走査する */ }
```

- [ ] **Step 2: 失敗するテストを書く**（`test/modelkit.test.mjs`）

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadKit, stats } from './helpers/kit.mjs';
const K = loadKit(), near = (a, b, e = 1e-3) => Math.abs(a - b) <= e;
const ring = (r, z, n = 48) => Array.from({ length: n }, (_, i) => [r * Math.cos(i / n * 2 * Math.PI), r * Math.sin(i / n * 2 * Math.PI), z]);
const samples = () => ({
  loft: K.loft([ring(1, 0), ring(1.2, 0.5), ring(0.8, 1)], { capStart: true, capEnd: true }),
  sweep: K.sweep([[0, 0], [0.3, 0], [0.3, 0.1], [0, 0.1]], [{ p: [0, 0, 0] }, { p: [0, 0, 1] }, { p: [0.5, 0, 2] }], { closed: true, capStart: true, capEnd: true }),
  roundBox: K.roundBox(1, 0.5, 2, 0.05), panel: K.panel(K.roundRectPts(0.6, 0.4, 0.05), 0.02),
  lathe: K.lathe([[0.1, 0], [0.3, 0.1], [0.3, 0.4], [0.1, 0.5]]), tube: K.tube([[0, 0, 0], [0, 1, 0], [1, 1, 0]], 0.02),
});
test('V1 道具の出力に壊れた値がなく、法線の長さは 1、つぶれた三角形がない', () => {
  for (const [name, g] of Object.entries(samples())) { const s = stats(g);
    assert.ok(s.finite, name); assert.ok(s.maxNormalErr < 1e-3, `${name} ${s.maxNormalErr}`); assert.equal(s.degenerate, 0, name); assert.ok(g.attributes.uv, name); }
});
test('V1 寸法は指定どおり（誤差 1 mm）', () => {
  const b = stats(K.roundBox(1, 0.5, 2, 0.05)).size, p = stats(K.panel(K.roundRectPts(0.6, 0.4, 0.05), 0.02)).size;
  assert.ok(near(b[0], 1) && near(b[1], 0.5) && near(b[2], 2), String(b)); assert.ok(near(p[0], 0.6) && near(p[1], 0.4) && near(p[2], 0.02), String(p));
});
test('V2 閉じた形は外向きで、体積が寸法からの値と 2% 以内', () => {
  const r = 0.05, a = 1 - 2 * r, b = 0.5 - 2 * r, c = 2 - 2 * r, box = a * b * c + 2 * r * (a * b + b * c + c * a) + Math.PI * r * r * (a + b + c) + 4 / 3 * Math.PI * r ** 3;
  const vb = stats(K.roundBox(1, 0.5, 2, r)).volume; assert.ok(vb > 0 && Math.abs(vb - box) / box < 0.02, `${vb} ${box}`);
  const vc = stats(K.loft([ring(1, 0), ring(1, 1)], { capStart: true, capEnd: true })).volume; assert.ok(vc > 0 && Math.abs(vc - Math.PI) / Math.PI < 0.02, String(vc));
  const vf = stats(K.loft([ring(1, 0), ring(1, 1)], { capStart: true, capEnd: true, flip: true })).volume; assert.ok(vf < 0);
  const vs = stats(K.sweep([[0, 0], [0.3, 0], [0.3, 0.1], [0, 0.1]], [{ p: [0, 0, 0] }, { p: [0, 0, 2] }], { closed: true, capStart: true, capEnd: true })).volume; assert.ok(Math.abs(vs - 0.06) / 0.06 < 0.02, String(vs));
});
test('V3 細かさを下げると三角形が減る', () => {
  const n = d => { K.setDetail(d); return K.triCount(K.roundBox(1, 1, 1, 0.1, 4)) + K.triCount(K.lathe([[0.1, 0], [0.3, 0.2], [0.1, 0.4]], 24)) + K.triCount(K.tube([[0, 0, 0], [0, 1, 0], [1, 1, 0]], 0.02, 12)); };
  const hi = n(1), mid = n(0.6), lo = n(0.35); K.setDetail(1); assert.ok(hi > mid && mid > lo, `${hi} ${mid} ${lo}`);
});
test('creaseNormals：箱は面ごとの法線、球はなめらかな法線', () => {
  const T = K.THREE, box = K.creaseNormals(new T.BoxGeometry(1, 1, 1), 40), nb = box.attributes.normal.array;
  for (let i = 0; i < nb.length; i += 3) assert.ok(near(Math.max(Math.abs(nb[i]), Math.abs(nb[i + 1]), Math.abs(nb[i + 2])), 1, 1e-4));
  const sp = K.creaseNormals(new T.SphereGeometry(1, 24, 16), 40), p = sp.attributes.position.array, ns = sp.attributes.normal.array;
  for (let i = 0; i < p.length; i += 3) assert.ok(p[i] * ns[i] + p[i + 1] * ns[i + 1] + p[i + 2] * ns[i + 2] > 0.97);
});
test('shade は頂点の色を書き、部品の記録は箱と三角形の数を持つ', () => {
  const g = K.shade(K.roundBox(1, 1, 1, 0.1), (x, y) => (y > 0 ? 1 : 0.25)), c = g.attributes.color.array, p = g.attributes.position.array;
  for (let i = 0; i < c.length; i += 3) assert.ok(near(c[i], p[i + 1] > 0 ? 1 : 0.25, 1e-6));
  K.VEH_STATS.parts = {}; const P = new K.Parts(), m = new K.THREE.MeshBasicMaterial({ vertexColors: true });
  P.part('demo'); P.add(K.roundBox(1, 0.5, 2, 0.05), m, 0, 3, 0); P.part(null);
  const out = P.build(new K.THREE.Group()), s = K.VEH_STATS.parts.demo;
  assert.ok(s.tris > 0 && near(s.box[1], 2.75) && near(s.box[4], 3.25), JSON.stringify(s)); assert.ok(out[0].geometry.attributes.color, 'forceColor');
});
```

- [ ] **Step 3: `npm test` を実行する。** Expected: `modelkit.test.mjs` が「06a-modelkit.js がない」で失敗する。
- [ ] **Step 4: `src/06a-modelkit.js` と `01b-three.js` の追加を書く。** `loft` は輪の間を四角 2 枚ずつでつなぎ、ふたは輪の重心から扇形に張る。`roundBox` は各面を格子に分け、内側の箱からはみ出た分を半径 r に正規化して作る。`panel` は `THREE.ExtrudeGeometry`（`bevelSegments: seg(2, 1)`）。`creaseNormals` は位置で頂点をまとめ、面の法線のなす角が `deg` 未満の面だけを平均する。
- [ ] **Step 5: `npm test` を実行する。** Expected: 全部通る（今の 55 件 + 新しい 6 件）。
- [ ] **Step 6: コミットする**（`feat: model kit for curved vehicle parts`）

---

### Task 2: 素材と光

**Files:**
- Create: `src/06b-materials.js`（`06-truck.js` と `07-interior.js` から、素材・模様・`PAINTS`・`INTERIOR_THEMES`・`applyPaint`・`applyInteriorTheme`・`setCabAmbient` を移す）
- Rename: `src/06-truck.js` → `src/06c-tractor.js`（`git mv`。`06b` より後に読まれるようにするため。トレーラーは Task 3 で `06d` に分ける）
- Modify: `src/06c-tractor.js`、`src/07-interior.js`（移した分を消す）、`src/03-gfx.js`（`QUALITY_PRESETS` に `detail`・`pbr`・`tex`）、`src/13-game.js`（`updateLighting` から `setVehicleLight`）、`src/page.html`（内装の表示名「ベージュ」→「ライトグレー」、2 か所）
- Modify: `test/e2e/helpers.mjs`（`openGame({ storage })` と、ページの中のテスト用の道具 `window.__t`）
- Create: `test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Consumes: `Parts`、`makeCanvas`、`canvasTex`、`TEX`、`ENV`、`Q`、`TOD`。
- Produces:
  - `QUALITY_PRESETS[*]`：`detail` 1／0.6／0.35、`pbr` true／true／false、`tex` 512／256／256。
  - `const VEH = { pbr, envOut, envCab, fallback }`。`envOut`（1 面 128）と `envCab`（1 面 64）は、`pbr` のとき PMREM 済みのテクスチャ。
  - `makeVehicleMaterials(quality)`：`TM`・`IM` の中身を作り直す（オブジェクト自体は同じ）。今あるキーは全部残す。失敗したら `pbr` なしで作り直し、`VEH.fallback = true`。模様の絵を作るところで失敗したら、その模様（`map`・`normalMap`）は `null` にして色だけで続ける。`disposeVehicleMaterials()`：素材と模様を捨てる。
  - `setVehicleLight(day, tunnel)`：`day` は 0〜1（`1 − TOD.night`）、`tunnel` は 0〜1。外装の効き = 基準 × (0.12 + 0.88·day) × (1 − 0.6·tunnel)。室内の効き = 基準 × (0.10 + 0.90·day) × (1 − 0.5·tunnel)。`pbr` でなければ何もしない。
  - `trimName`（`lsGet('nlh.trim', 'normal')`、知らない値は `normal`）、`applyTrim(name, T)`（このタスクでは名前の保存だけ。T は Task 4 から使う）。
  - `applyPaint`・`applyInteriorTheme`・`setCabAmbient` は今の動きのまま。知らない名前は無視する。`INTERIOR_THEMES.beige.label = 'ライトグレー'`、色は写真 2 に合わせる（壁 `0xcfd0cc`、天井 `0xe3e3df`、収納 `0xd9d9d4`、ドア `0xc9cac6`、マットレス `0xcbc8c0`、引き出し `0xd4d4cf`）。

素材の種類と値（`pbr` のとき／`pbr` でないとき）：

| 種類 | 粗さ | 金属 | 凹凸の地図（強さ） | まわりの絵（基準の効き） | pbr でないとき |
| --- | --- | --- | --- | --- | --- |
| 塗装 | 0.35 | 0 | なし。クリア層 1.0、クリア層の粗さ 0.08 | envOut（1.0） | 今の Phong のまま |
| 艶消しの樹脂 | 0.8 | 0 | しぼ（0.3） | 室内は envCab（1.0）、外装は envOut（0.6） | Lambert |
| 艶のある黒 | 0.1 | 0 | なし | 同上 | Phong、shininess 110 |
| 革 | 0.55 | 0 | 革のしぼ（0.6） | envCab（1.0） | Phong、shininess 20 |
| キルティング | 0.6 | 0 | ひし形（1.0） | envCab（1.0） | Lambert（今の絵） |
| 布 | 0.95 | 0 | 織り目（0.4） | envCab（1.0） | Lambert |
| ゴム | 0.9 | 0 | 縞板（0.8） | envCab／envOut（0.6） | Lambert |
| アルミ調 | 0.35 | 1 | ヘアライン（0.3） | envCab（1.2） | 今の Phong のまま |
| 磨いたアルミ | 0.3 | 1 | なし | envOut（1.0） | 今の Phong のまま |
| メッキ | 0.08 | 1 | なし | envOut（1.0） | 今の Phong のまま |

- 今のキーの割り当て：`TM.paint`→塗装。`TM.gloss`・`IM.gloss`→艶のある黒。`TM.rubber`・`TM.tire`・`IM.mat`・`IM.floor`→ゴム。`TM.chrome`→メッキ。`TM.alu`・`TM.rim`・`TM.tank`→磨いたアルミ（`rim` は粗さ 0.15）。`TM.dark`・`TM.black`・`TM.frame`・`TM.bumper`・`TM.blackDS`・`IM.lower`・`IM.black`・`IM.button`・`IM.drawer`→艶消しの樹脂。`IM.seat`・`IM.seatPlain`・`IM.leather`→革。`IM.upper`・`IM.door`・`IM.cabinet`→内装がレッドならキルティング、ほかは艶消しの樹脂。`IM.head`・`IM.mattress`・`IM.curtain`→布。`IM.silver`・`IM.metal`→アルミ調。光る素材、ガラス、ミラー、ホース、反射器、ナンバー、トレーラーの素材は今のまま。
- 室内の素材はすべて `vertexColors: true`（`shade` の暗さを使うため）。
- 模様の絵は `VEH` の中に持ち、大きさは `Q.tex`。凹凸の地図は、高さの絵の隣どうしの差から作る。
- `envCab` の面：前（−z）は上 60% が明るい窓（`#dfe9f2`）、左右（±x）は中央 50% が窓、上は `#3a3a3c`、下と後ろは `#16171a`。`envOut` の面：横は空 `#5f97dd` → 地平線 `#e6eef4` → 地面 `#3c4034` のグラデーション、上 `#6aa0e2`、下 `#3a3f36`。

- [ ] **Step 1: `openGame` に `storage` と `window.__t` を足す。** `context.addInitScript` で、渡された値を `localStorage.setItem(k, JSON.stringify(v))` し、次の道具を入れる。Raycaster は親が隠れているかを見ないので、`first` で祖先まで確かめる。また、表の面にしか当たらない（素材が `FrontSide` のとき）ので、裏を向いた面は当たらず、穴として見つかる。

```js
window.__t = {
  frames: n => new Promise(res => { const f = () => (n-- > 0 ? requestAnimationFrame(f) : res()); f(); }),
  shown: o => { for (; o; o = o.parent) if (!o.visible) return false; return true; },
  first: (rc, root) => rc.intersectObject(root, true).find(h => window.__t.shown(h.object)) || null,
};
```
- [ ] **Step 2: 失敗するテストを書く**（`test/e2e/vehicle.e2e.mjs`）

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { withGame, startJob } from './helpers.mjs';
const vehMats = () => { const s = new Set(); TRK.root.traverse(o => { if (o.isMesh) s.add(o.material); }); return [...s]; };
test('画質 高：塗装はクリア層つき、まわりの絵は前処理済み、革に凹凸がある', () => withGame({ storage: { 'nlh.quality': 'high' } }, async (page, errors) => {
  const r = await page.evaluate(() => ({ pbr: VEH.pbr, paint: !!TM.paint.isMeshPhysicalMaterial, cc: TM.paint.clearcoat, env: TM.paint.envMap && TM.paint.envMap.mapping === THREE.CubeUVReflectionMapping,
    cab: IM.seat.envMap === VEH.envCab, bump: !!IM.seat.normalMap, vc: IM.lower.vertexColors === true, keys: ['amberOn', 'amberOff', 'headOn', 'headOff', 'white', 'whiteOn', 'redOn', 'redOff', 'redDim', 'marker', 'ledRed'].every(k => TM[k]) }));
  assert.deepEqual(r, { pbr: true, paint: true, cc: 1, env: true, cab: true, bump: true, vc: true, keys: true }); assert.deepEqual(errors, []);
}));
test('V8 画質 低：軽い素材だけで、凹凸の地図がない', () => withGame({ storage: { 'nlh.quality': 'low' } }, async page => {
  const r = await page.evaluate(`(${vehMats})().map(m => [m.type, !!m.normalMap]).filter(([t, n]) => /Standard|Physical/.test(t) || n)`);
  assert.deepEqual(r, []); assert.equal(await page.evaluate(() => VEH.pbr), false);
}));
test('V7 夜とトンネルでは、まわりの絵の効きが昼より弱く、0 にはならない', () => withGame({}, async page => {
  const r = await page.evaluate(() => { const at = (d, t) => { setVehicleLight(d, t); return [TM.paint.envMapIntensity, IM.seat.envMapIntensity]; };
    return { day: at(1, 0), night: at(0, 0), tunnel: at(1, 1) }; });
  assert.ok(Math.abs(r.day[0] - 1) < 1e-6 && Math.abs(r.day[1] - 1) < 1e-6, JSON.stringify(r));
  assert.ok(Math.abs(r.night[0] - 0.12) < 1e-6 && Math.abs(r.night[1] - 0.10) < 1e-6); assert.ok(Math.abs(r.tunnel[0] - 0.4) < 1e-6 && Math.abs(r.tunnel[1] - 0.5) < 1e-6);
}));
test('V7 夜になると、ゲームが効きを弱め、赤い間接照明が点く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => { await __t.frames(2); const day = TM.paint.envMapIntensity; GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 19 * 3600; await __t.frames(10);
    return { day, night: TM.paint.envMapIntensity, amb: IM.ambient.color.r }; });
  assert.ok(r.night < r.day * 0.4 && r.night > 0, JSON.stringify(r)); assert.ok(r.amb > 0.5);
}));
test('質感のある素材が作れないときは、軽い素材に切り替わって続く', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(() => { THREE.PMREMGenerator.prototype.fromCubemap = () => { throw new Error('no pmrem'); }; disposeVehicleMaterials(); makeVehicleMaterials('high');
    return { pbr: VEH.pbr, fallback: VEH.fallback, paint: TM.paint.type }; });
  assert.deepEqual(r, { pbr: false, fallback: true, paint: 'MeshPhongMaterial' }); assert.deepEqual(errors, []);
}));
test('模様の絵が作れないときは、その素材は単色になって続く', () => withGame({}, async (page, errors) => {
  const r = await page.evaluate(() => { CanvasRenderingContext2D.prototype.getImageData = () => { throw new Error('no pixels'); }; disposeVehicleMaterials(); makeVehicleMaterials('high');
    return [IM.seat.normalMap, IM.seat.map, IM.seat.color.getHex() !== 0]; });
  assert.deepEqual(r, [null, null, true]); assert.deepEqual(errors, []);
}));
test('保存された名前が知らない値なら、初期値を使う', () => withGame({ storage: { 'nlh.trim': 'zzz', 'nlh.paint': 'zzz', 'nlh.interior': 'zzz' } }, async page => {
  assert.deepEqual(await page.evaluate(() => [trimName, paintName, interiorName]), ['normal', 'white', 'black']);
}));
test('内装の表示名はライトグレー、保存名は beige のまま', () => withGame({}, async page => {
  const r = await page.evaluate(() => { document.querySelector('#intSeg [data-v="beige"]').click(); return [document.querySelector('#intSeg [data-v="beige"]').textContent.trim(), interiorName, JSON.parse(localStorage.getItem('nlh.interior'))]; });
  assert.deepEqual(r, ['ライトグレー', 'beige', 'beige']);
}));
```

- [ ] **Step 3: `node build.mjs && node --test --test-concurrency=1 --test-timeout=240000 test/e2e/vehicle.e2e.mjs` を実行する。** Expected: `VEH is not defined` などで失敗する。
- [ ] **Step 4: `src/06b-materials.js` を書き、移した分を元のファイルから消す。** `makeVehicleMaterials(qualityName)` は、ファイルの読み込み時に 1 回呼ぶ（今の `TM`・`IM` の定義と同じ時点）。
- [ ] **Step 5: `13-game.js` の `updateLighting` で、`applyTimeOfDay` を呼ぶ所の直後に `setVehicleLight(1 - TOD.night, GAME.tunnelBlend)` を足す。**
- [ ] **Step 6: テストを実行する。** `npm test && npm run e2e`。Expected: 全部通る。
- [ ] **Step 7: 見た目を確かめる。** 車内視点と外の視点を昼と夜で撮り、塗装に空が映ること、室内が窓の側で明るく奥で暗いこと、真っ黒な部品や白飛びがないことを目で確かめる。
- [ ] **Step 8: コミットする**（`feat: vehicle materials with environment lighting`）

---

### Task 3: 車両の組み立てとファイルの分割

**Files:**
- Create: `src/06d-trailers.js`（`06c-tractor.js` のトレーラー部分を移す）、`src/07a-cabin-front.js`・`src/07b-cabin-rear.js`（`07-interior.js` を、設計書 6 章の表の「前半分／後ろ半分」で分ける。`buildInterior` は `07b`）
- Delete: `src/07-interior.js`
- Modify: `src/13-game.js`（`mountVehicle`、`rebuildVehicle`、`vehicleStats`、`setQuality`）、`src/08-dash.js`（`setupMirrors` を何度呼んでもよくする）
- Modify: `test/math.test.mjs`（ファイル名の一覧があれば直す）、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Consumes: Task 1 の道具、Task 2 の `makeVehicleMaterials`・`disposeVehicleMaterials`・`VEH`。
- Produces:
  - `buildCabinFront(I, F, R)`・`buildCabinRear(I, F, R)`：`I` は輪郭になる部品の `Parts`、`F` は細かい部品の `Parts`、`R` は `buildInterior` が返す記録。
  - `buildInterior(T)` が返す記録に `group`（室内の全部）、`shell`（輪郭になる部品）、`fine`（細かい部品）を足す。`setCabDetail(inCab)`：`INT.fine.visible = inCab`。
  - `13-game.js`：`let TRK, INT, TRAILER_MODELS, TRL`。`mountVehicle()`：`setDetail(Q.detail)` → `VEH_STATS.parts = {}` → `VEH_STATS.group` を切り替えながらトラクター、室内を作り、トレーラー 2 種を作って `scene` に足し、`cabCam` を `INT.eye` に付け、`setupMirrors(TRK)`、計器とナビの絵を貼り、今の仕事のトレーラーを `TRL` に選ぶ。`rebuildVehicle()`：古い `root` を `scene` から外して形を捨て、`disposeVehicleMaterials()` → `makeVehicleMaterials(qualityName)` → `mountVehicle()`。`setQuality(name)` の最後で `rebuildVehicle()` を呼ぶ。
  - `vehicleStats()` → `{ interior: { tris, meshes, mats }, exterior: { tris, meshes, mats }, parts }`。`interior` は `INT.group` 以下、`exterior` は `TRK.root` 以下のそれ以外。`tris` と `mats` は全メッシュ、`meshes` は今見えているメッシュの数。
  - `setupMirrors(T)`：描画先（`MIRROR.rts`）があれば使い回し、古いカメラは親から外す。

- [ ] **Step 1: 失敗するテストを書く**（`vehicle.e2e.mjs` に足す）

```js
const TKEYS = ['root', 'cab', 'cabPivot', 'blinkL', 'blinkR', 'heads', 'lightbar', 'spin', 'steer', 'rear', 'coil', 'coilStowed', 'spot', 'mirrors', 'wipers'];
const IKEYS = ['cluster', 'nav', 'wheel', 'gas', 'brake', 'charm', 'charmState', 'eye', 'group', 'shell', 'fine'];
test('V5 つなぎ：トラクターと室内が決まった名前を返す', () => withGame({}, async page => {
  const r = await page.evaluate(([tk, ik]) => ({ t: tk.filter(k => TRK[k] == null), i: ik.filter(k => INT[k] == null), n: ['heads', 'blinkL', 'blinkR', 'rear', 'spin', 'steer'].map(k => TRK[k].length),
    cam: cabCam.parent === INT.eye, eye: INT.eye.position.toArray(), st: vehicleStats() }), [TKEYS, IKEYS]);
  assert.deepEqual(r.t, []); assert.deepEqual(r.i, []); assert.ok(r.n.every(n => n > 0), String(r.n)); assert.equal(r.cam, true); assert.deepEqual(r.eye, [0.55, 2.62, -4.28]);
  assert.ok(r.st.interior.tris > 0 && r.st.exterior.tris > 0);
}));
test('走行中に画質を 6 回切り替えても、車両は動き続け、形とテクスチャが増え続けない', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => { INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60);
    INP.tGas = 1; for (let i = 0; i < 300; i++) simTick(1 / 60);
    const mem = []; for (const q of ['low', 'high', 'mid', 'high', 'low', 'high']) { setQuality(q); await __t.frames(2); mem.push([renderer.info.memory.geometries, renderer.info.memory.textures]); }
    for (let i = 0; i < 60; i++) simTick(1 / 60); await __t.frames(2);
    return { mem, link: TR.link, v: TR.v, cam: cabCam.parent === INT.eye, inScene: TRK.root.parent === scene, mir: ['L', 'R'].map(k => { let p = MIRROR.cams[k].parent; while (p && p !== TRK.root) p = p.parent; return !!p; }),
      trl: TRL.root.visible && TRL.root.parent === scene, roots: scene.children.filter(o => o === TRK.root).length, pbr: VEH.pbr, tris: vehicleStats().exterior.tris };
  });
  assert.equal(r.link, 'coupled'); assert.ok(r.v > 3); assert.deepEqual([r.cam, r.inScene, r.trl, r.roots, r.pbr], [true, true, true, 1, true]); assert.deepEqual(r.mir, [true, true]);
  assert.ok(r.mem[5][0] <= r.mem[1][0] * 1.05 && r.mem[5][1] <= r.mem[1][1] * 1.05, JSON.stringify(r.mem)); assert.deepEqual(errors, []);
}));
test('V9 外の視点では細かい部品を描かず、車内視点では描く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => { GAME.cam = 'cab'; await __t.frames(2); const a = [INT.fine.visible, INT.shell.visible]; GAME.cam = 'chase'; await __t.frames(2); return [a, [INT.fine.visible, INT.shell.visible], INT.fine.children.length > 0, INT.shell.children.length > 0]; });
  assert.deepEqual(r, [[true, true], [false, true], true, true]);
}));
```

- [ ] **Step 2: テストを実行し、`vehicleStats is not defined` などで失敗するのを確かめる。**
- [ ] **Step 3: ファイルを分け、`mountVehicle`・`rebuildVehicle`・`vehicleStats`・`setCabDetail` を書く。** 形はまだ今のまま。`updateCamera` の中で、使うカメラが決まったあとに `setCabDetail(activeCam === cabCam)` を呼ぶ。今の室内の「小さな部品」の `Parts` を `fine` に、それ以外を `shell` に入れる。
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: コミットする**（`refactor: mount the vehicle as one unit, rebuild it on quality change`）

---

### Task 4: 外装の仕様の切り替えと、見比べの道具

**Files:**
- Modify: `src/page.html`（`trimSeg`・`trimSeg2`。外装色の行の下に「外装の仕様」、ボタンは `data-v="normal"`「ノーマル」と `data-v="custom"`「飾り付き」）、`src/13-game.js`（切り替えの処理、`__camOverride` の拡張）、`src/06b-materials.js`（`applyTrim`）、`src/06c-tractor.js`（今のライトバーを `deco` へ）
- Create: `test/e2e/refviews.mjs`、`tools/refshot.mjs`
- Modify: `.gitignore`（`out/`）、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces:
  - `buildTractor()` の記録に `deco`（飾り付きのときだけ見える `Group`）と `barLamps`（屋根のランプ。Task 12 で 6 個になる）を足す。
  - `applyTrim(name, T)`：知らない名前は無視。`trimName` を保存し、`T` があれば `T.deco.visible = (name === 'custom')`、`T.lightbar = name === 'custom' ? T.barLamps : []`。`buildTractor` は最後に `applyTrim(trimName, T)` を呼ぶ。
  - `window.__camOverride = { p, t, fov, inCab }`：`fov` があれば視野を変え、`inCab` が真なら細かい部品を描き、手前の切り取り面を 0.05 にする。外すと元に戻る。
  - `refviews.mjs`：`export const REFVIEWS = { R1: { p, t, fov, inCab, theme, paint, trim, hour, photo: 1 }, … }`（「基準の視点」の表の値）と、`export async function applyRefView(page, id)`（設定を当て、R4〜R9 はトラクターだけを `S0 + 3000`、横位置 `X_TRV` に置き、時刻を合わせて 12 フレーム待つ）。
  - `tools/refshot.mjs`：`node tools/refshot.mjs [R1 …|all] [--q high|mid|low]`。`out/refshots/<id>.png` を書く。`REF_PHOTOS` があれば、写真とゲームの画面を左右に並べた `out/refshots/<id>-compare.jpg` も書く（HTML に 2 枚の画像を並べて撮る）。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('V6 外装色 4 × 仕様 2 × 内装 3 のどれに切り替えても描ける。仕様で屋根のランプが入れ替わる', () => withGame({}, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => { const out = [];
    for (const trim of ['normal', 'custom']) for (const paint of ['white', 'blue', 'red', 'silver']) for (const th of ['black', 'beige', 'red']) {
      document.querySelector(`#trimSeg2 [data-v="${trim}"]`).click(); document.querySelector(`#paintSeg2 [data-v="${paint}"]`).click(); document.querySelector(`#intSeg2 [data-v="${th}"]`).click();
      await __t.frames(1); out.push([trimName, paintName, interiorName, TRK.deco.visible, TRK.lightbar.length].join());
    }
    return { out, saved: JSON.parse(localStorage.getItem('nlh.trim')), pressed: document.querySelector('#trimSeg [data-v="custom"]').getAttribute('aria-pressed') };
  });
  assert.equal(r.out.length, 24); assert.ok(r.out.every(s => /^normal,.*,false,0$/.test(s) || /^custom,.*,true,[1-9]\d*$/.test(s)), r.out.join(' | '));
  assert.equal(r.saved, 'custom'); assert.equal(r.pressed, 'true'); assert.deepEqual(errors, []);
}));
test('基準の視点 9 つを当てられ、車内の視点では細かい部品が描かれる', () => withGame({}, async (page, errors) => {
  await startJob(page); const { REFVIEWS, applyRefView } = await import('./refviews.mjs'); assert.equal(Object.keys(REFVIEWS).length, 9);
  for (const id of ['R1', 'R4']) { await applyRefView(page, id);
    const r = await page.evaluate(() => [INT.fine.visible, paintName, trimName, interiorName, TR.link, Math.round(chaseCam.fov)]);
    assert.deepEqual(r, id === 'R1' ? [true, r[1], r[2], 'black', r[4], 85] : [false, 'red', 'custom', r[3], 'free', 40]); }
  assert.deepEqual(errors, []);
}));
```

（Task 12 で、`custom` のときの `TRK.lightbar.length` を 6 に固定する。）

- [ ] **Step 2: テストを実行し、`#trimSeg2` がないことで失敗するのを確かめる。**
- [ ] **Step 3: メニュー、`applyTrim`、`deco`、`__camOverride` の拡張、`refviews.mjs`、`tools/refshot.mjs` を書く。** メニューのボタンは外装色と同じ書き方（`syncSeg(['trimSeg', 'trimSeg2'], trimName)`、クリックで `applyTrim(v, TRK)`）。
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: `REF_PHOTOS=… node tools/refshot.mjs all` を実行し、9 枚の比較画像ができて、どれも写真と同じ向きから車両が写っているのを確かめる。** 向きが違う視点は、「基準の視点」の表と `refviews.mjs` の両方を直す。
- [ ] **Step 6: コミットする**（`feat: trim switch, reference views and the comparison tool`）

---

### Task 5: 室内 ― ダッシュボードと計器まわり

**Files:**
- Modify: `src/07a-cabin-front.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Consumes: 道具（Task 1）、素材（Task 2）、`buildCabinFront(I, F, R)`（Task 3）。
- Produces: 部品の記録 `floor`、`dash`、`hood`、`centerPanel`、`sidePanel`、`vents`、`table`、`etc`。`R.cluster`・`R.nav` は画面の板（今と同じく、あとで絵を貼る）。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `dash` | 上面は y = 2.30〜2.40、前の壁から手前へ 0.42。運転席の前（x = 0.15〜1.0）は手前へ 0.14 張り出し、左端で 25° 内側へ回り込む。中段に艶のある黒の帯（高さ 0.06）と、アルミ調の線（太さ 0.008）。`sweep` で作る | 9,000 |
| `hood` | 計器のひさし。幅 0.50、奥行 0.20、上端 y ≤ 2.47。中心 x = 0.55。`R.cluster` は幅 0.40 × 高さ 0.15 | 3,000 |
| `centerPanel` | 中心 x = −0.02、運転席へ 25° 向く。`R.nav`（幅 0.34 × 高さ 0.20）、スイッチ 2 列（各 8 個）、つまみ 3 個、吹き出し口 2 個 | 6,000 |
| `sidePanel` | 運転席の右（x = 0.95〜1.16）。つまみ 1 個、ボタン 6 個、パーキングブレーキのレバー | 2,000 |
| `vents`・`table`・`etc` | 助手席側の吹き出し口 2 個、引き出し式のテーブル（カップの穴 2 つ）、ダッシュ上の ETC 車載器 | 2,000 |
| `floor` | 床、左右のマット、足元の赤い帯（`IM.ambient`） | 1,500 |

- [ ] **Step 1: 失敗するテストを書く**

```js
const cabin = b => b[0] >= -1.2 && b[3] <= 1.2 && b[1] >= 1.40 && b[4] <= 3.85 && b[2] >= -5.35 && b[5] <= -3.15;
const partsOf = page => page.evaluate(() => vehicleStats().parts);
test('室内の前：ダッシュ、ひさし、センターパネルが決まった場所と大きさにある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['floor', 'dash', 'hood', 'centerPanel', 'sidePanel', 'vents', 'table', 'etc']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  assert.ok(P.dash.box[4] <= 2.42 && P.dash.box[4] >= 2.28 && P.dash.box[3] - P.dash.box[0] > 2.2, String(P.dash.box)); assert.ok(P.hood.box[4] <= 2.47);
  assert.ok(P.dash.tris <= 9000 && P.hood.tris <= 3000 && P.centerPanel.tris <= 6000);
}));
// 目から、画面の点 (u, v)（−1〜1）の方向へ線を飛ばし、最初に当たる物を返す
const firstHit = (page, fov, aspect, pts) => page.evaluate(([fov, aspect, pts]) => {
  GAME.cam = 'cab'; setCabDetail(true); TRK.root.updateMatrixWorld(true); cabCam.fov = fov; cabCam.aspect = aspect; cabCam.rotation.set(-0.18, 0, 0); cabCam.updateProjectionMatrix(); cabCam.updateMatrixWorld(true);
  const rc = new THREE.Raycaster(); return pts.map(([u, v]) => { rc.setFromCamera({ x: u, y: v }, cabCam); const h = __t.first(rc, TRK.root);
    return h ? { d: h.distance, glass: h.object.material === TM.glassIn || h.object.material === TM.glassOut, screen: h.object === INT.cluster ? 'cluster' : h.object === INT.nav ? 'nav' : null } : null; });
}, [fov, aspect, pts]);
test('V11 目の前：正面の視線はフロントガラスまで何にも当たらず、2 つの画面が見える', () => withGame({}, async page => {
  const [c] = await firstHit(page, 64, 16 / 9, [[0, 0.33]]); assert.ok(c === null || c.glass, JSON.stringify(c));
  const scr = await page.evaluate(() => { TRK.root.updateMatrixWorld(true); const eye = INT.eye.getWorldPosition(new THREE.Vector3()), rc = new THREE.Raycaster();
    return [INT.cluster, INT.nav].map(m => { const c = m.getWorldPosition(new THREE.Vector3()); rc.set(eye, c.clone().sub(eye).normalize()); const h = __t.first(rc, TRK.root); return h && h.object === m; }); });
  assert.deepEqual(scr, [true, true]);
}));
test('縦持ち（視野 80°）でも、計器が画面に入り、前の道路が隠れない', () => withGame({ width: 390, height: 844, touch: true }, async page => {
  const r = await page.evaluate(() => { GAME.cam = 'cab'; TRK.root.updateMatrixWorld(true); cabCam.fov = 80; cabCam.aspect = 390 / 844; cabCam.rotation.set(-0.18, 0, 0); cabCam.updateProjectionMatrix(); cabCam.updateMatrixWorld(true);
    return INT.cluster.getWorldPosition(new THREE.Vector3()).project(cabCam).toArray(); });
  assert.ok(Math.abs(r[0]) < 0.9 && Math.abs(r[1]) < 0.9, String(r));
  const road = await firstHit(page, 80, 390 / 844, [[0, 0.1], [-0.5, 0.1], [0.4, 0.1]]); for (const h of road) assert.ok(h === null || h.glass, JSON.stringify(road));
}));
```

- [ ] **Step 2: テストを実行し、部品の記録がないことで失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに部品を作り、今の箱の部品を置き換える。** 奥まった所（ダッシュの下、ひさしの中）は `shade` で 0.45〜0.7 まで暗くする。
- [ ] **Step 4: テストを実行する。** `npm test && npm run e2e`。Expected: 全部通る。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R1 R3`。回り込んだダッシュ、計器とセンターの 2 つの画面、アルミ調の線が見分けられること。車内視点（運転中の目の位置）の画面も昼と夜で撮り、計器が読めること。
- [ ] **Step 6: コミットする**（`feat: curved dashboard, instrument hood and centre panel`）

---

### Task 6: 室内 ― ハンドル、レバー、ペダル、ドア、ピラー

**Files:**
- Modify: `src/07a-cabin-front.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `wheel`、`stalks`、`pedals`、`doorR`、`doorL`、`pillars`、`grabs`。`R.wheel`（今と同じ軸で回る）、`R.gas`、`R.brake`（今と同じ向きに動く）。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `wheel` | 輪の直径 0.45、太さ 0.034。左右のスポーク（各ボタン 4 個）と下のスポーク、中央のパッド（無地、幅 0.16）。軸は今の位置と傾き | 5,000 |
| `stalks` | 左右に 1 本ずつ、長さ 0.16 | 800 |
| `pedals` | アクセル（吊り下げ式）、ブレーキ、フットレスト | 1,200 |
| `doorR`・`doorL` | 内張りは `panel`。窓の下の線は前で 0.12 下がる。ひじ掛け、取っ手、窓スイッチ 4 個（運転席側）、スピーカーの網、下のポケット | 各 4,500 |
| `pillars`・`grabs` | 前の柱 2 本、ドアの後ろの柱 2 本、乗り降りの手すり 2 本 | 3,000 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('室内の前：ハンドルは直径 0.45、ドアとピラーは室内に収まる', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['wheel', 'stalks', 'pedals', 'doorR', 'doorL', 'pillars', 'grabs']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  const w = P.wheel.box, d = Math.max(w[3] - w[0], w[4] - w[1], w[5] - w[2]); assert.ok(Math.abs(d - 0.45) < 0.02, String(d)); assert.ok(Math.abs((w[0] + w[3]) / 2 - 0.55) < 0.03);
  assert.ok(P.doorR.box[3] > 1.1 && P.doorL.box[0] < -1.1); assert.ok(P.wheel.tris <= 5000 && P.doorR.tris <= 4500);
}));
test('ハンドルとペダルは、今までどおり動く', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(async () => { const a = [INT.wheel.rotation.z, INT.gas.rotation.x, INT.brake.rotation.x]; INP.tWheelHeld = true; INP.tWheel = 1.5; INP.tGas = 1; for (let i = 0; i < 30; i++) simTick(1 / 60); await __t.frames(2);
    return [a, [INT.wheel.rotation.z, INT.gas.rotation.x, INT.brake.rotation.x]]; });
  assert.ok(Math.abs(r[1][0] - r[0][0]) > 0.5 && Math.abs(r[1][1] - r[0][1]) > 0.1, JSON.stringify(r));
}));
```

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに部品を作り、今の箱の部品を置き換える。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る（Task 5 の V11 と縦持ちのテストも通ること。ハンドルやピラーが視線をふさいだら位置を直す）。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R1 R2 R3`。ハンドルと中央のパッド、ドアの内張りが見分けられること。
- [ ] **Step 6: コミットする**（`feat: steering wheel, stalks, pedals, door cards and pillars`）

---

### Task 7: 室内 ― シートとセンターコンソール

**Files:**
- Modify: `src/07b-cabin-rear.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `seatD`（運転席）、`seatP`（助手席）、`belts`、`console`。シートは `shell`、ベルトと小さな部品は `fine`。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `seatD`・`seatP` | 中心 x = +0.55／−0.60。座面の上 y = 1.89、背もたれの上（頭の部分まで一体）y = 2.85〜2.95、幅 0.52。座面と背もたれは `loft`。肩と腰の張り出し 0.04、中央は縦のステッチの筋（`IM.seat`）、張り出しは無地（`IM.seatPlain`）。ひじ掛け 2 本、座面の下の蛇腹と台 | 各 9,000 |
| `belts` | 肩から腰への帯と、差し込み口 | 1,000 |
| `console` | シートの間（x = −0.25〜0.20）。高さ 0.50。カップホルダー 2 個、小物の皿、ふた | 4,000 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('室内の後ろ：背の高いシートが 2 脚、間にコンソールがある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['seatD', 'seatP', 'belts', 'console']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  for (const [k, x] of [['seatD', 0.55], ['seatP', -0.6]]) { const b = P[k].box; assert.ok(Math.abs((b[0] + b[3]) / 2 - x) < 0.05, k); assert.ok(b[4] >= 2.85 && b[4] <= 2.95, `${k} top ${b[4]}`); assert.ok(P[k].tris <= 9000); }
  assert.ok(P.console.box[0] >= -0.3 && P.console.box[3] <= 0.25);
}));
test('運転席の頭の部分は、目の後ろにある（目をふさがない）', () => withGame({}, async page => {
  const P = await partsOf(page); assert.ok(P.seatD.box[2] > -4.28 + 0.08, String(P.seatD.box));
}));
```

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作り、今の箱のシートとコンソールを置き換える。** シートとコンソールの間、座面の下は `shade` で暗くする。
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R1 R2 R3`。背の高いシートと張り出し、ステッチが見分けられること。
- [ ] **Step 6: コミットする**（`feat: tall leather seats and the centre console`）

---

### Task 8: 室内 ― 頭上、天井、ベッド、後ろの壁、カーテン

**Files:**
- Modify: `src/07b-cabin-rear.js`、`src/06b-materials.js`（頭上の赤い帯も `setCabAmbient` で点く）、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `shelf`、`visors`、`ceiling`、`bed`、`drawers`、`rearWall`、`lockers`、`curtains`、`small`（消火器、お守り）。`R.charm`・`R.charmState` は今のまま。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `shelf` | フロントガラスの上。下面 y ≥ 3.30、奥行 0.56。扉つきの収納 3 つ、機器の差し込み口 2 つ、読書灯 2 つ、下面に赤い帯（`IM.ambient`） | 6,000 |
| `visors` | 運転席側は下ろす（下端 y = 3.02）、助手席側は上げる | 800 |
| `ceiling` | 屋根の丸みに沿う内張り（`loft`）、天窓のふた、室内灯 | 3,000 |
| `bed`・`drawers` | マットレスの上 y = 2.13、奥行 0.62、角の丸み 0.04。枕。下に引き出し 3 つ（1 つは冷蔵庫の扉） | 5,000 |
| `rearWall`・`lockers` | 操作パネル、小さな画面、読書灯。上の収納 3 つ（下面 y ≥ 3.20） | 5,000 |
| `curtains` | 左右のドアの後ろの柱に束ねる。ひだ 6 本 | 2,400 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('室内の後ろ：頭上の棚、ベッド、後ろの収納が決まった高さにある', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['shelf', 'visors', 'ceiling', 'bed', 'drawers', 'rearWall', 'lockers', 'curtains', 'small']) { assert.ok(P[k] && P[k].tris > 0, k); assert.ok(cabin(P[k].box), `${k} ${P[k].box}`); }
  assert.ok(P.shelf.box[1] >= 3.30 && P.lockers.box[1] >= 3.20 && Math.abs(P.bed.box[4] - 2.13) < 0.06, JSON.stringify([P.shelf.box, P.lockers.box, P.bed.box]));
}));
test('V4 室内の上限：三角形と素材の数', async () => { for (const [q, max] of [['high', 100000], ['mid', 60000], ['low', 35000]]) await withGame({ storage: { 'nlh.quality': q } }, async page => {
  const s = await page.evaluate(() => vehicleStats().interior); assert.ok(s.tris <= max, `${q} ${s.tris}`); assert.ok(s.tris >= max * 0.4, `${q} too coarse ${s.tris}`); assert.ok(s.mats <= 24, `${q} mats ${s.mats}`); }); });
test('夜の赤い間接照明は、足元と頭上の両方で点く', () => withGame({}, async page => {
  const r = await page.evaluate(() => { setCabAmbient(false); const off = IM.ambient.color.r; setCabAmbient(true); const P = vehicleStats().parts; return [off, IM.ambient.color.r, !!P.shelf, !!P.floor]; });
  assert.ok(r[1] > r[0] * 2 && r[2] && r[3], String(r));
}));
```

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作り、今の箱の部品を置き換える。室内に古い箱の部品が残っていないこと。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R1 R2 R3`。設計書 10.1 の R1〜R3 の「画面に見えるべきもの」がすべて見分けられること。
- [ ] **Step 6: コミットする**（`feat: overhead shelf, ceiling, bed, rear wall and curtains`）

---

### Task 9: 室内の仕上げ

**Files:**
- Modify: `src/07a-cabin-front.js`、`src/07b-cabin-rear.js`、`src/06b-materials.js`（内装 3 種類の色の調整）、`test/e2e/vehicle.e2e.mjs`、`test/e2e/helpers.mjs`

**Interfaces:**
- Produces（`helpers.mjs`）：`luma(page, rects)`：今のカメラで 1 フレーム描き、同じ処理の中で `gl.readPixels` して、画面の割合で与えた四角 `[x0, y0, x1, y1]`（0〜1、左下が原点）ごとの明るさの平均（0〜255）を返す。

- [ ] **Step 1: 失敗するテストを書く**

```js
test('車内で見回しても、面の欠けや穴から外が見えない', () => withGame({}, async page => {
  const holes = await page.evaluate(() => { GAME.cam = 'cab'; setCabDetail(true); TRK.root.updateMatrixWorld(true);
    const eye = INT.eye.getWorldPosition(new THREE.Vector3()), q = TRK.root.getWorldQuaternion(new THREE.Quaternion()), rc = new THREE.Raycaster(), out = [];
    for (let yaw = -140; yaw <= 140; yaw += 5) for (let pitch = -35; pitch <= 35; pitch += 5) {
      const a = yaw * Math.PI / 180, b = pitch * Math.PI / 180, dir = new THREE.Vector3(-Math.sin(a) * Math.cos(b), Math.sin(b), -Math.cos(a) * Math.cos(b)).applyQuaternion(q);   // トラクターの前は −z
      rc.set(eye, dir); const h = __t.first(rc, TRK.root);
      if (!h || h.distance > 3.2) out.push([yaw, pitch, h ? h.distance.toFixed(2) : 'none']);   // 室内の対角は 3.2 m 未満。窓のガラスも当たりに数える
    }
    return out; });
  assert.deepEqual(holes, []);
}));
test('夜とトンネルの車内は、真っ黒にならず、昼より暗い', () => withGame({}, async page => {
  await startJob(page); const { luma } = await import('./helpers.mjs');
  const set = h => page.evaluate(async h => { GAME.cam = 'cab'; INP.lookYaw = 0; INP.lookPitch = -0.18; GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + h * 3600; await __t.frames(12); }, h);
  const dash = [[0.25, 0.05, 0.75, 0.35]];   // 画面の下：ダッシュとハンドル
  await set(12); const [day] = await luma(page, dash); await set(21); const [night] = await luma(page, dash);
  assert.ok(day > 25 && day < 200, `day ${day}`); assert.ok(night > 6 && night < day * 0.8, `night ${night} day ${day}`);
  const tun = await page.evaluate(async () => { GAME.clock = Math.floor(GAME.clock / 86400) * 86400 + 12 * 3600; const t = TUNNELS[0]; placeTruck((t.s0 + t.s1) / 2, X_TRV, 0, { coupled: false }); await __t.frames(40); return GAME.tunnelBlend; });
  assert.ok(tun > 0.8); const [inTun] = await luma(page, dash); assert.ok(inTun > 6 && inTun < day, `tunnel ${inTun} day ${day}`);
}));
```

- [ ] **Step 2: テストを実行する。** 穴の一覧と明るさの値を見て、失敗した所を直す（面の向き、すき間、素材の色や効き）。直す前に、失敗の原因を 1 つずつ確かめる。
- [ ] **Step 3: 内装 3 種類を撮って色を合わせる。** `node tools/refshot.mjs R1 R2 R3`。ライトグレーは写真 2、レッドは写真 3 の色に近いこと。
- [ ] **Step 4: 画質 高・中・低で車内視点を撮り、形が同じで、低でも部品が欠けないことを確かめる。** `node tools/refshot.mjs R1 R2 --q low` と `--q mid`。
- [ ] **Step 5: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 6: コミットし、公開ページを更新する**（`feat: finish the cabin: no gaps when looking around, night and tunnel light`）。Artifact は `index.html` を同じ URL（`https://claude.ai/artifact/3stYQ2EzBLwncXfSz7psx6`）に公開し直す。R1〜R3 の比較画像をユーザーに送る。

---

### Task 10: 外観 ― キャブ

**Files:**
- Modify: `src/06c-tractor.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `cabShell`、`roofKit`、`doors`、`steps`、`arches`、`sideFins`、`windows`、`mirrors`、`rearPanel`、`hoses`。`T.mirrors`（`{ L, R }`、それぞれ `{ anchor, side, mat }`）、`T.coil`、`T.coilStowed` は今の形のまま返す。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `cabShell` | 今の `CAB_SECTIONS` の外形を保ち、輪の点を 46 → `seg(72, 28)`、高さ方向の段を今の 2 倍に細かくする | 7,000 |
| `roofKit` | 屋根の導風板（後ろへ 0.30 せり上がる。上端 y ≤ 4.10）と、左右の縁 | 1,500 |
| `doors` | ドアの見切り線（幅 0.012 の溝）、取っ手、ドアの下の覆い | 2,000 |
| `steps` | 3 段。面は縞板（ゴム）。x = ±1.25〜1.28 | 1,500 |
| `arches` | 前輪のアーチ（樹脂）。半径 0.62 | 1,200 |
| `sideFins` | キャブの後ろの角の導風板。後ろへ 0.32、高さ y = 1.5〜3.9。後ろの縁に赤い LED の帯（`TM.ledRed`、幅 0.02） | 1,600 |
| `windows` | フロントガラス、ドアの窓（前が 0.12 下がる）、ベッドの小窓。内と外の 2 枚（`TM.glassIn`・`TM.glassOut`） | 1,500 |
| `mirrors` | 主ミラーと広角ミラーの殻（`loft`）、腕、補助ミラー 2 個 | 4,000 |
| `rearPanel`・`hoses` | 凹凸のあるパネル（社名の場所は無地）、空気の取り入れ口、カールコード 3 本（2 つの状態） | 4,000 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('外観：キャブの部品があり、外寸は今のまま', () => withGame({}, async page => {
  const P = await partsOf(page);
  for (const k of ['cabShell', 'roofKit', 'doors', 'steps', 'arches', 'sideFins', 'windows', 'mirrors', 'rearPanel', 'hoses']) assert.ok(P[k] && P[k].tris > 0, k);
  const c = P.cabShell.box; assert.ok(Math.abs(c[2] + 5.48) < 0.03 && Math.abs(c[5] + 3.12) < 0.03 && Math.abs(c[3] - c[0] - 2.5) < 0.02 && Math.abs(c[4] - 4.02) < 0.02, String(c));
  assert.ok(P.roofKit.box[4] <= 4.10 && P.sideFins.box[5] <= -3.12 + 0.34 && P.steps.box[3] <= 1.30 && P.steps.box[0] >= -1.30);
}));
test('映る鏡のカメラは、新しい導風板やミラーの殻にふさがれない', () => withGame({}, async page => {
  await startJob(page);
  const r = await page.evaluate(() => { INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60); updateVisuals(0.016); scene.updateMatrixWorld(true);
    const rc = new THREE.Raycaster(); return ['L', 'R'].map(k => { const cam = MIRROR.cams[k]; cam.updateMatrixWorld(true); const out = [];
      for (const [u, v] of [[0, 0], [0.5, -0.3], [-0.5, -0.3], [0, -0.6]]) { rc.setFromCamera({ x: u, y: v }, cam); const h = __t.first(rc, TRK.root); out.push(h ? +h.distance.toFixed(2) : null); }
      return out; }); });
  for (const side of r) assert.ok(side.filter(d => d !== null && d < 3).length <= 1, JSON.stringify(r));   // 4 本のうち、自車に 3 m 以内で当たるのは 1 本まで
}));
```

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作り、今の部品を置き換える。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る（`trailer-visual.e2e.mjs` のカールコードのテストも通ること）。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R5 R6 R7`。屋根と導風板、ドアの線、ステップ、角の LED の帯、後ろのパネルが見分けられること。車内視点でミラーに後ろが映ること。
- [ ] **Step 6: コミットする**（`feat: cab shell, doors, steps, side fins, mirrors and rear panel`）

---

### Task 11: 外観 ― 前まわり

**Files:**
- Modify: `src/06c-tractor.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `grille`、`bumper`、`headlamps`、`fogs`、`spoiler`、`visor`、`wipers`、`plateF`。`T.heads`（ヘッドライトの光る面）、`T.blinkL`・`T.blinkR`（前のウインカーを含む）、`T.wipers`（今と同じ 2 本の軸）。グリルのスラットは `TM.trim`（Task 12 で仕様ごとに色が変わる。今は車体色）。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `grille` | 台形（上の幅 1.50、下の幅 1.80、y = 1.25〜2.20）。横スラット 5 本（丸みのある断面、`sweep`）、奥は黒い網、中央のバッジ台（無地、幅 0.34） | 3,500 |
| `bumper` | 上は車体色、下は樹脂。角を丸める。中央に足掛け | 2,500 |
| `headlamps` | バンパーの角に左右 1 つずつ。光る面 2 つずつ（`T.heads`）、昼に光る線（`TM.drl`）、ウインカー | 2,000 |
| `fogs`・`spoiler`・`plateF` | フォグランプ 2 個、下のスポイラー、前のナンバー（今の絵） | 1,200 |
| `visor` | 車体色。フロントガラスの上端に沿って曲がる。前へ 0.28 | 1,200 |
| `wipers` | 腕とゴムを 2 本。軸は今の位置 | 600 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('外観：前まわりの部品があり、前端は今のまま、灯火は今までどおり点く', () => withGame({}, async page => {
  await startJob(page); const P = await partsOf(page);
  for (const k of ['grille', 'bumper', 'headlamps', 'fogs', 'spoiler', 'visor', 'wipers', 'plateF']) assert.ok(P[k] && P[k].tris > 0, k);
  assert.ok(Math.min(P.bumper.box[2], P.grille.box[2], P.visor.box[2]) >= -5.75, 'front end'); assert.ok(P.grille.box[3] - P.grille.box[0] > 1.7 && P.grille.box[3] - P.grille.box[0] < 1.9);
  const r = await page.evaluate(async () => { GAME.lights = true; GAME.hazard = true; await __t.frames(3); return [TRK.heads.length, TRK.heads.every(m => m.material === TM.headOn), TRK.blinkL.length > 0 && TRK.blinkR.length > 0, TRK.wipers.length]; });
  assert.deepEqual(r, [r[0], true, true, 2]); assert.ok(r[0] >= 2);
}));
```

（物理の前端は `RIGP.front = 5.4` のまま。見た目のバンパーとヘッドライトは今 z = −5.67 まで出ている。新しい部品も −5.75 より前に出さない。）

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作り、今の部品を置き換える。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R4 R5`（R4 はまだ飾りなしで比べる）。台形のグリルと横スラット、バイザー、角のヘッドライトが見分けられること。夜にヘッドライトが点いて見えること。
- [ ] **Step 6: コミットする**（`feat: grille, bumper, headlamps and sun visor`）

---

### Task 12: 外観 ― シャシー、後ろ、車輪

**Files:**
- Modify: `src/06c-tractor.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Produces: 部品の記録 `frame`、`catwalk`、`fifthWheel`、`tankFuel`、`tankUrea`、`battery`、`muffler`、`skirts`、`fenders`、`tailLamps`、`flaps`、`plateR`、`wheelF`、`wheelR`。`T.spin`（回る車輪）、`T.steer`（前輪の向き）、`T.rear`（後輪。連結の沈み込みで上下する）、`T.blinkL`・`T.blinkR`（後ろのウインカーを含む）は今の意味のまま。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `frame`・`catwalk`・`fifthWheel` | はしご形のフレーム、縞板の足場、連結の皿（直径 0.94、後ろに V 字の切り欠き、中心は後軸の 0.35 前、上面 y = 1.23） | 3,000 |
| `tankFuel`・`tankUrea`・`battery`・`muffler` | 左にアルミの燃料タンク（直径 0.60、長さ 1.7、バンド 2 本、ふた）。右にバッテリー箱、尿素水タンク、消音器の箱 | 3,000 |
| `skirts` | 前輪と後輪の間。車体色。下端 y = 0.42 | 1,200 |
| `fenders` | 後輪の上を丸く覆う（`sweep`、半径 0.60）。上面に段 3 本。黒い樹脂 | 2,400 |
| `tailLamps`・`flaps`・`plateR` | 尾灯の箱 2 つ（赤、ウインカー、後退灯）、赤とオレンジの斜めじまの泥よけ 2 枚（無地）、後ろのナンバー | 1,600 |
| `wheelF`・`wheelR` | 磨いたアルミホイール（`lathe`）。手を入れる穴 10 個、ナット 10 個、中央のふた。タイヤは半径 0.52、溝 4 本、側面に丸み。後ろは 2 本並び | 前 各 1,300、後ろ 各 2,300 |

- [ ] **Step 1: 失敗するテストを書く**

```js
test('外観：シャシーと車輪の部品があり、車輪は今までどおり回り、後輪は路面に残る', () => withGame({}, async page => {
  await startJob(page); const P = await partsOf(page);
  for (const k of ['frame', 'catwalk', 'fifthWheel', 'tankFuel', 'tankUrea', 'battery', 'muffler', 'skirts', 'fenders', 'tailLamps', 'flaps', 'plateR', 'wheelF', 'wheelR']) assert.ok(P[k] && P[k].tris > 0, k);
  const f = P.fifthWheel.box; assert.ok(Math.abs((f[2] + f[5]) / 2 + 0.35) < 0.08 && Math.abs(f[4] - 1.23) < 0.03, String(f));
  assert.ok(Math.abs(P.wheelF.box[4] - 1.04) < 0.02 && P.wheelF.box[1] > -0.01, 'tyre radius 0.52'); assert.ok(P.fenders.box[3] <= 1.28 && P.skirts.box[1] >= 0.40);
  const r = await page.evaluate(async () => { const a = TRK.spin[0].rotation.x; INP.tGas = 1; for (let i = 0; i < 240; i++) simTick(1 / 60); await __t.frames(2); return [TRK.spin.length, TRK.steer.length, TRK.rear.length, Math.abs(TRK.spin[0].rotation.x - a) > 0.5]; });
  assert.deepEqual(r, [4, 2, 2, true]);
}));
test('V10 外寸：トラクターの形は決まった箱に収まる', () => withGame({}, async page => {
  const P = await partsOf(page), ext = Object.entries(P).filter(([k, p]) => p.group === 'exterior' && !['mirrors', 'lightBar', 'markers'].includes(k)).map(([, p]) => p.box);
  const w = Math.max(...ext.map(b => b[3])) - Math.min(...ext.map(b => b[0])), front = Math.min(...ext.map(b => b[2])), top = Math.max(...ext.map(b => b[4]));
  assert.ok(w >= 2.50 && w <= 2.60, `width ${w}`); assert.ok(front <= -5.60 && front >= -5.75, `front ${front}`); assert.ok(top >= 4.00 && top <= 4.10, `top ${top}`);
}));
```

（前端の範囲は、今のバンパーとヘッドライトの位置 z = −5.67 に合わせてある。設計書の V10 も同じ値に直してある。）

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作り、今の部品を置き換える。トラクターに古い箱の部品が残っていないこと。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る（`trailer-visual.e2e.mjs` の「後ろが沈み、後輪は路面に残る」も通ること）。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R5 R7 R8 R9`。設計書 10.1 の R5・R7・R8 の「画面に見えるべきもの」がすべて見分けられること。
- [ ] **Step 6: コミットする**（`feat: chassis, tanks, rear fenders and aluminium wheels`）

---

### Task 13: 飾り付きの仕様

**Files:**
- Modify: `src/06c-tractor.js`、`src/06b-materials.js`、`test/e2e/vehicle.e2e.mjs`

**Interfaces:**
- Consumes: `T.deco`、`T.barLamps`、`applyTrim(name, T)`（Task 4）、`TM.trim`（Task 11）。
- Produces: 部品の記録 `lightBar`、`markers`、`nutCaps`、`livery`（すべて `T.deco` の中）。`TM.livery`（透明な板の素材。`map` は線模様を描いた canvas のテクスチャ）。`TM.trim`（グリルのスラットとミラーカバー）は、`normal` のとき車体色（塗装と同じ値）、`custom` のときメッキ（粗さ 0.08、金属 1）。`applyPaint` は線模様の色も塗り直す。

| 部品 | 決めること | 上限（高） |
| --- | --- | --- |
| `lightBar` | 屋根の前の縁の上に、管（直径 0.05）と脚 4 本。丸いランプ 6 個（直径 0.20、`T.barLamps`）。上端 y ≤ 4.38 | 2,400 |
| `markers` | バイザーの下の縁に 5 個、バンパーの下に 5 個の小さな橙のランプ（`TM.marker`） | 600 |
| `nutCaps` | 前輪と後輪のナットのカバー（メッキ） | 800 |
| `livery` | キャブの左右と前に、車体から 2 mm 浮かせた透明な板。絵は 1024 × 512：ドアの下からキャブの後ろへ流れる帯（幅 0.10 → 0.02）と、細い 2 本線（太さ 0.012、間 0.03）。色は、白と銀の車体に `#1b2a4a`、青と赤の車体に `#d4af37`。文字、ロゴ、グリフィンは描かない | 600 |

- [ ] **Step 1: 失敗するテストを書く**（Task 4 の V6 の中の `custom,.*,true,[1-9]\d*` を `custom,.*,true,6` に直す）

```js
test('飾り付き：屋根のランプ 6 個がライトと一緒に点き、スラットはメッキ、線模様は外装色に合わせて変わる', () => withGame({ storage: { 'nlh.trim': 'custom', 'nlh.paint': 'white' } }, async (page, errors) => {
  await startJob(page);
  const r = await page.evaluate(async () => { const P = vehicleStats().parts;
    GAME.lights = true; await __t.frames(3); const lit = TRK.lightbar.length === 6 && TRK.lightbar.every(m => m.material === TM.headOn);
    const px = () => { const c = TM.livery.map.image, d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 200) { n++; r += d[i]; g += d[i + 1]; b += d[i + 2]; } return [Math.round(r / n), Math.round(g / n), Math.round(b / n), n / (c.width * c.height)]; };
    const white = px(), metal = TM.trim.metalness; applyPaint('red'); const red = px(); applyTrim('normal', TRK); await __t.frames(2);
    return { parts: ['lightBar', 'markers', 'nutCaps', 'livery'].every(k => P[k] && P[k].tris > 0), top: P.lightBar.box[4], lit, white, red, metal, plain: [TM.trim.metalness, TRK.deco.visible, TRK.lightbar.length] }; });
  assert.ok(r.parts && r.lit && r.top <= 4.38, JSON.stringify(r)); assert.equal(r.metal, 1); assert.deepEqual(r.plain, [0, false, 0]);
  assert.ok(Math.abs(r.white[0] - 0x1b) < 12 && Math.abs(r.white[2] - 0x4a) < 12, String(r.white)); assert.ok(Math.abs(r.red[0] - 0xd4) < 12 && Math.abs(r.red[2] - 0x37) < 12, String(r.red));
  assert.ok(r.white[3] > 0.01 && r.white[3] < 0.2, `coverage ${r.white[3]}`); assert.deepEqual(errors, []);
}));
```

（画質「低」では `TM.trim.metalness` がないので、このテストは既定の画質「高」で動かす。）

- [ ] **Step 2: テストを実行し、失敗するのを確かめる。**
- [ ] **Step 3: 表のとおりに作る。**
- [ ] **Step 4: `npm test && npm run e2e` を実行する。** Expected: 全部通る。
- [ ] **Step 5: 見比べる。** `node tools/refshot.mjs R4 R9`。屋根のライトバーと丸いランプ 6 個、線模様が見分けられること。4 色すべてで線模様が読めること。
- [ ] **Step 6: コミットする**（`feat: custom trim with light bar, markers, chrome and a pinstripe livery`）

---

### Task 14: 仕上げ

**Files:**
- Modify: `src/06b-materials.js`（使わなくなった素材を消す）、`README.md`、`test/e2e/vehicle.e2e.mjs`、`index.html`

- [ ] **Step 1: 上限のテストを書く**

```js
test('V4 上限：画質ごとの三角形、部品の数、素材の数', async () => { for (const [q, inMax, exMax] of [['high', 100000, 60000], ['mid', 60000, 36000], ['low', 35000, 21000]])
  await withGame({ storage: { 'nlh.quality': q, 'nlh.trim': 'custom' } }, async (page, errors) => { await startJob(page);
    const s = await page.evaluate(async () => { GAME.cam = 'cab'; await __t.frames(3); return vehicleStats(); });
    assert.ok(s.interior.tris <= inMax && s.exterior.tris <= exMax, `${q} ${s.interior.tris} ${s.exterior.tris}`); assert.ok(s.exterior.tris >= exMax * 0.4, `${q} too coarse`);
    assert.ok(s.interior.meshes + s.exterior.meshes <= 110, `${q} meshes ${s.interior.meshes + s.exterior.meshes}`); assert.ok(s.interior.mats <= 24 && s.exterior.mats <= 30, `${q} mats ${s.interior.mats} ${s.exterior.mats}`); assert.deepEqual(errors, []); }); });
test('画質 高・中・低のどれでも、連結して走り出せる', async () => { for (const q of ['high', 'mid', 'low']) await withGame({ storage: { 'nlh.quality': q } }, async (page, errors) => { await startJob(page);
  const r = await page.evaluate(() => { INP.actions.push('couple'); for (let i = 0; i < 150; i++) simTick(1 / 60); INP.tGas = 1; for (let i = 0; i < 600; i++) simTick(1 / 60); return [TR.link, TR.v > 5]; });
  assert.deepEqual(r, ['coupled', true]); assert.deepEqual(errors, []); }); });
```

- [ ] **Step 2: テストを実行する。** 三角形が上限を超えたら、`vehicleStats().parts` の三角形の数が多い順に見て、分割数を減らす。部品の数が上限を超えたら、同じ素材の部品を 1 つの `Parts` にまとめる（灯火のように素材を切り替える部品と、回る車輪は別のまま）。使われていない `TM`・`IM` のキーを消す（Global Constraints の「残す」ものは消さない）。
- [ ] **Step 3: README を直す。** 車両の説明（曲面の形、素材、内装の名前「ライトグレー」、外装の仕様の切り替え）、ファイル構成（`06a`〜`06d`、`07a`・`07b`、`tools/refshot.mjs`）、テストの数。
- [ ] **Step 4: 全体を確かめる。** `npm test && npm run e2e` がすべて通ること。`node tools/refshot.mjs all` を画質 高で撮り、設計書 10.1 の R1〜R9 の「画面に見えるべきもの」を 1 行ずつ確かめること。設計書 12 章の「完成の基準」を 1 行ずつ確かめること。
- [ ] **Step 5: `npm run build` してコミットし、公開ページを更新する**（`docs: vehicle detail in README, budgets test, rebuild`）。R1〜R9 の比較画像をユーザーに送る。

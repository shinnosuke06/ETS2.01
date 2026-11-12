# 高速道路（サービスエリア・給油と休憩・道路の小物・夜の照明） 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 6 か所のサービスエリア（給油と仮眠）、燃料と眠気の決まり、寄り道の案内、合流でよける車、上を通る橋・路面の文字・柵と植え込み、夜の照明灯と反射板と車の光を作る。

**Architecture:** サービスエリアの位置と出入口は `02-route.js`、配置と格子は新しい DOM なしの `02f-sa.js`（町の格子の仕組みを共有）、燃料と眠気の決まりは DOM なしの `02g-care.js`。見た目は `05c-sa-mesh.js`（サービスエリア）と `05d-roadside.js`（橋・路面の文字・柵・植え込み・照明灯・反射板）、ボタンと暗転は `13b-stops.js`。今あるファイルは、つなぐ所だけ変える。

**Tech Stack:** Three.js r128、素の JavaScript（グローバルスコープ、`build.mjs` が名前順につなぐ）、`node --test`、Playwright（headless Chromium + swiftshader）。

**Spec:** `docs/superpowers/specs/2026-11-12-expressway-design.md`

## Global Constraints

- ゲームは 1 つの HTML にまとまる。絵はコードで描く（印は SVG か canvas）。外部の画像・フォントを足さない。実在の会社名・店名・石油会社の名前や印は入れない。
- サービスエリア：中井・足柄・富士川・牧之原・浜名湖・上郷の 6 か所、下り（こちら側）だけ。分かれ目の kp：45.8・71.5・127.0・189.5・259.0・313.0。
- サービスエリアの座標は**道の座標**：`u = s − sa.sDiv`（道に沿って西向きが正）、`v = −lat`（道から左へ離れる向き）。世界の点は `posAt(sa.sDiv + u, −v)`。地面の高さは `elevAt(sa.sDiv + u)`（横向きに平ら）。道が曲がっていても、駐車場の本線の側の縁が本線から 16 m に沿う（仕様 3.2）。
- 長さ 660 m：減速車線 `u` 0〜180、駐車場 180〜460（`v` 16〜100）、加速車線 460〜660。
- 大型車の枠 12（45 度・前から入って前に出る・幅 4.0 m・長さ 20 m）、給油の枠 2（幅 4.5 m・長さ 22 m）、給油所の屋根 40 × 24 m、建物 60 × 20 m。止まっているトラックは大型車の枠の 3〜6 割、空いている枠は必ず 4 つ以上。
- 燃料：タンク 120 L、軽油 1 L 140 円、満タンで 220 km（荷物 15 t・平ら・90 km/h、±10%）、給油で時計 +10 分。救援：時計 +60 分、燃料 20 L、30,000 円。
- 眠気：運転中にゲームの時計 6 時間で 1、22:00〜5:00 は 1.5 倍。給油と救援で進めた時計の分では増えない。まばたきは 0.85 を超えてから、長さ 0.4〜0.7 秒、いちばん暗い所で 85%、間隔の平均は 0.85 で 40 秒・1.0 で 8 秒（実時間）。仮眠で時計 +30 分・眠気 0。次の朝に時計が進んだとき眠気 0。
- 文（そのまま使う）：
  - 電光板：`燃料が少なくなりました　次の SA で給油を`、`燃料がまもなくなくなります`（警告）、`燃料がなくなりました`、`救援が来ました　燃料 20 L`、`眠気がたまっています　次の SA で休憩を`、`給油 ${L} L　${円をカンマ区切り} 円`（例 `給油 96 L　13,440 円`）、`30 分の仮眠をとりました`。
  - 場所のボタン：`給油`、`仮眠`、`救援を呼ぶ`。暗転の文：`給油中…`、`仮眠中…`、`救援を待っています…`。
  - ナビ（`navText`）：`saFuel` `${name}SA で給油を`、`saRest` `${name}SA で休憩を`、`saLane` `${name}SA 入口　左車線へ`、`saExit` `SA 入口　左`、`toPump` `給油機の横に止める`、`toStall` `大型車の枠に止める`、`toOut` `出口へ`、`stopFuel` `止まって「給油」`、`stopNap` `止まって「仮眠」`。合流は今の `merge`。
  - 結果の行：`燃料代（給油 ${n} 回）`、`救援`。メーター：`燃料　残り 約 ${km} km`、`眠気`。
  - 標識：`${name} SA` と `2km`・`1km`・`500m`、`SA 入口`、`この先の SA`、`本線 合流注意`、駐車場の中の `大型車`・`給油所`・`出口`。路面：`減速`。
- `signKm(d)`：`d`（分かれ目までのゲームの m）が 0・160・400・700 で 0・0.5・1.0・2.0 km、間はまっすぐ、700 より先は `2.0 + (d − 700) × 10 / 1000`。
- 上限：サービスエリア 1 か所の三角形は画質「高」で 120,000 以下・描く回数 80 以下、「低」は「高」の 6 割以下。橋 1 本 2,500 以下。夜の毎フレームの仕事 0.5 ms 以内。燃料と眠気の計算は毎フレーム 0.05 ms 以内。サービスエリアを作る仕事は 1 回 30 ms 以内。
- ソースはグローバルスコープ。新しい名前がほかのファイルとぶつからない（`test/math.test.mjs` が見張っている）。`02f-sa.js` と `02g-care.js` は `test/helpers/sim.mjs` の `PURE` と、使う名前を `NAMES` に足す。
- 今あるテスト（`npm test` 108 件、`npm run e2e` 91 件）が通り続ける。e2e は 1 ファイル 10 分まで。e2e の全部は 50 分ほどかかるので、裏で（`run_in_background`）回し、その間に `index.html` を作り直さない。
- コミットのたびに `node build.mjs` で `index.html` を作り直して一緒にコミットし、`git push -u origin claude/nippon-long-haul-game`。プルリクエストは作らない。コミットメッセージの最後に、セッションの指示にある帰属の 2 行を付ける。

### 仕様からの細かい直し（計画で決めたこと）

- 富士川の海の始まりは kp 135.5（仕様は 134.5）。サービスエリアの終わり（kp 133.6）が海の変わり始め（始まりの 1.5 km 手前）にかからないため。
- 合流でよける条件の「本線に入る前」は `lat < −9.6`（走行車線の外側の線 `X_EDGE = −9.45` より外）。仕様の `−12.5` では加速車線が本線の横に並んだ所（`lat −11.25`）が外れるため。
- サービスエリアの中の行き先は、一方通行の順（大型車の枠 → 給油所 → 出口）に合わせる：仮眠が要り、まだ大型車の枠の並びを過ぎていなければ大型車の枠、次に給油が要れば給油の枠、どちらでもなければ出口。

## Review Focus

1. サービスエリアの中で保存して開き直すと、サービスエリアができる前に置かれて地面に落ちたり壁に埋まったりする。→ Task 3 のテスト「サービスエリアの中で開き直しても、そこから走れる」。
2. 給油や仮眠の暗転の途中でメニューや地図を開く・閉じる、またはボタンを 2 回押すと、時計やお金が 2 回進む。→ Task 3 のテスト「暗転の間のボタンとキーは効かない」。
3. 燃料 0 で坂道や入口の加速車線の上に止まると、救援が来ても走り出せない、または転がって止まらない。→ Task 3 のテスト「燃料切れでも、ブレーキで止まっていられ、救援のあと走り出せる」。
4. 寄り道の案内中にサービスエリアを通り過ぎると、案内が消えないか、通り過ぎたサービスエリアを指し続ける。→ Task 4 のテスト（S7）「通り過ぎたら次」と e2e「通り過ぎると次の SA の案内になる」。
5. 古い保存（燃料・眠気・燃料代が入っていない `nlh.drive`、`nlh.care` がない）で開いても、壊れずに始まる。→ Task 3 のテスト「古い保存でも始まる」。

---

### Task 1: サービスエリアの位置・出入口・配置・格子・地面（DOM なし）

**Files:**
- Modify: `src/02-route.js`（`SAS`、出入口の形、`drivable`、標識、海、`signKm`）
- Modify: `src/02b-towns.js`（格子の大きさを格子が持つ：`townSample`、`townCellAt`、塗る関数、距離の計算）
- Create: `src/02f-sa.js`
- Modify: `src/02c-ground.js`（`GROUND.sas`、`zone: 'sa'`）
- Modify: `src/09b-rig.js`、`src/09c-truck.js`（`sa` の欄、`TR.sa`、確かさの判定に `'sa'`）
- Modify: `test/helpers/sim.mjs`
- Test: `test/sa.test.mjs`

**Interfaces:**
- Produces（`02-route.js`）：
  - `SAS`：`[{ i, jp, en, kp, sDiv, sLot0, sLot1, sJoin, sEnd, uSep, uJoin }]`。`sLot0 = sDiv + 180`、`sLot1 = sDiv + 460`、`sJoin = sDiv + 560`、`sEnd = sDiv + 660`。`uSep`：減速車線の右の縁が `−12.75` より左に出る最初の `u`、`uJoin`：加速車線の右の縁が `−12.75` に来る最初の `u`（`sLot1` から）。
  - `saExitEdges(u, out)` → `{ cx, xl, xr }`：`cx` は `u < 100` で `−11.25`、`100〜180` で `−22` へ（`smooth`）、そのあと `−22`。`xl` は `u < 80` で `−9.05` から `cx − 2.8` へ、そのあと `cx − 2.8`。`xr = cx + 2.2`。
  - `saEntryEdges(u, out)`（`u` は `sLot1` から）：`cx` は `u < 100` で `−22` から `−11.25` へ、そのあと `−11.25`。`xl` は `u > 170` で `cx − 2.8` から `−12.2` へ（`smooth(170, 200)`）。`xr = cx + 2.2`。
  - `saAt(s)`（`sDiv ≤ s ≤ sEnd` の SA か null）、`saExitAt(s)`（`sDiv ≤ s ≤ sLot0`）、`saEntryAt(s)`（`sLot1 ≤ s ≤ sEnd`）。
  - `signKm(d)`（グローバル制約）。
- Produces（`02f-sa.js`）：
  - `SA_GRID = { u0: 130, v0: 10, nu: 760, nv: 188, cell: 0.5 }`、`saInside(u, v)`：`140 ≤ u ≤ 500` かつ `13.6 ≤ v ≤ 102`。
  - `saLayout(k, visit = 0)` → `{ sa, kind: 'sa', visit, stalls, pumps, building, canopy, islands, carPark, cars, plants, signs, fallback }`。乱数は `rng(7001 + 131 * k + 17 * visit)`。
    - `stalls[n] = { id, u, v, hu, hv, w: 4, len: 20, taken }`、`hu = hv = Math.SQRT1_2`、中心 `u = 212 + 5.66 n`、`v = 37`。
    - `pumps[j] = { id, u: 377, v: [26, 36][j], hu: 1, hv: 0, w: 4.5, len: 22 }`。
    - 通路 A：`v` 18〜28、`u` 180〜335。通路 B：`v` 46〜56、`u` 200〜420（給油所の横の抜け道を兼ねる）。給油所の前の広場：`u` 335〜355、`v` 18〜56。出口：`u` 397〜460 で `v` 18〜56 から `v` 22 の 1 車線へ狭まる。乗用車の駐車場：`v` 58〜76、`u` 200〜330。建物：`u` 215〜275、`v` 79〜99、歩道 `v` 76〜79。屋根：`u` 357〜397、`v` 20〜44（柱は島の上）。島：`v` 29〜33 と 39〜41.5、`u` 362〜392。本線との間の植え込みの帯：`v` 13.6〜17。
    - 止まっているトラックと乗用車（`cars: [{ u, v, hu, hv, len, wid, kind }]`）は格子では壁。
  - `saPath(L, a, b)` → `[[u, v], …]`（5 m 以下の間隔）。`a`：`'in' | { stall } | { pump }`、`b`：`{ stall } | { pump } | 'out'`。組み合わせ：in→stall、in→pump、in→out（広場を横切って抜け道へ）、stall→pump、stall→out、pump→out。`in` は `u = 140` の減速車線の中心から、`out` は `u = 500` の加速車線の中心まで。
  - `saGridSteps(L)`（ジェネレーター、最後の値が格子 `{ type, dist, u0, v0, nu, nv, cell }`）、`saGrid(L)`。
  - `SA_LOADED = new Map()`（`k → { layout, grid }`）、`saAdd(k, L, G)`、`saLoad(k, visit = 0)`、`saUnload(k)`。
  - `saStallAt(L, u, v, hu, hv)` → 空いている大型車の枠（トラクターの中心が枠の中、向きの差 20 度以内）か null。`saPumpAt(L, u, v, hu, hv)` → 給油の枠か null。
  - `saFallbackLayout(k)`：平らな四角い駐車場（`u` 200〜440、`v` 18〜80）に給油の枠 1 つと大型車の枠 4 つ、建物なし、`fallback: true`。
  - `saKeepOut(s, lat)`（`u` 100〜560・`v` 10〜140 の中なら true：高速沿いの家と木を置かない）、`saGroundBlend(s, lat)` → `{ w, y }`（町の `townGroundBlend` と同じ形。駐車場の外 40 m で 0）。
- Produces（地面）：`GROUND.sas`（読み込んだ SA の番号）。`GROUND.at` の `out` に `sa`（番号、なければ −1）。`zone` は `'road' | 'town' | 'sa'`。`GROUND.contact` は SA の中で格子の距離を使い、向きは `u` が道の向き `(TX, TZ)`、`v` が左 `(−RX, −RZ)`。`TR.sa`。

- [ ] **Step 1: 失敗するテストを書く**（`test/sa.test.mjs`）

```js
test('S1 6 か所のサービスエリアが kp の順で、IC の出入口・トンネル・海と湖から離れている', () => {
  assert.deepEqual(SIM.SAS.map(a => a.jp), ['中井', '足柄', '富士川', '牧之原', '浜名湖', '上郷']);
  for (const a of SIM.SAS) {
    for (const r of SIM.RAMPS) assert.ok(a.sEnd < r.sDiv - 20 || a.sDiv > r.sEnd + 20, a.jp);
    for (const e of SIM.ENTRIES) assert.ok(a.sEnd < e.s0 - 20 || a.sDiv > e.s1 + 20, a.jp);
    for (const t of SIM.TUNNELS) assert.ok(a.sEnd < t.s0 - 100 || a.sDiv > t.s1 + 100, a.jp);
    for (let s = a.sDiv; s <= a.sEnd; s += 10) assert.equal(SIM.waterAt(s, -1) + SIM.waterAt(s, 0), 0, a.jp);
  }
});
test('S2 どの SA でも、すべての大型車の枠と給油の枠にバンとタンクで入って出口まで行ける（壁に当たらない）', () => {
  // saLoad(k)。空いている枠ごとに in→stall→out、in→pump→out、stall 0→pump 0→out を followPath（15 km/h）で走る。
  // 各回 r.done && r.maxPen < 0.05 && !r.jack。枠の中に入ったとき saStallAt / saPumpAt がその枠を返す。
});
test('S3 減速車線と加速車線のつなぎ目（u = 140、500）で、走れる所が切れない', () => {
  // u = 120〜160 と 480〜520 を 0.5 m おきに、車線の中心の点で GROUND.contact の pen が 0、GROUND.at の y の差が 0.05 m 以内
});
test('S6 signKm：2km・1km・500m の標識の位置で 2.0・1.0・0.5', () => {
  assert.equal(SIM.signKm(700), 2); assert.equal(SIM.signKm(400), 1); assert.equal(SIM.signKm(160), 0.5); assert.equal(SIM.signKm(0), 0);
  assert.ok(Math.abs(SIM.signKm(1000) - 5) < 1e-9);
});
test('SA の配置：空いている大型車の枠が 4 つ以上、止まっているトラックが 3〜6 割（6 か所 × visit 0〜9）', () => { /* … */ });
test('SA の配置が作れないときは簡単な駐車場になり、給油の枠 1 と大型車の枠 4 で走れる', () => { /* saFallbackLayout で S2 と同じ確かめ */ });
```

- [ ] **Step 2: `node --test test/sa.test.mjs` を実行して失敗を見る**（`SAS` が undefined）。
- [ ] **Step 3: `02-route.js` に `SAS`・出入口の形・`saAt`・`saExitAt`・`saEntryAt`・`signKm` を作る。** `drivable(s)` は IC の出口・入口がないとき SA の減速車線・加速車線を同じやり方で足す。`WATER[0].kp0 = 135.5`。左の標識（`dist`・`speed`・`gap`・`kp`）と電光板が SA の `[sDiv − 20, sEnd + 20]` に入ったら、入口のときと同じく `sEnd + 30 + 60k` に移す。`gantryLeftX` は SA の車線も避ける。
- [ ] **Step 4: SA の標識を `SIGNS` に足す**：`{ t: 'saAdv', sa, d: '2km' | '1km' | '500m' }` を `sDiv − 700・−400・−160`、`{ t: 'saNose', sa }` を `sDiv + uSep − 30`、`{ t: 'saNext', sa }` を `sDiv − 1000`、`{ t: 'saMerge', sa }` を `sLot1 + 60`。IC の出入口・トンネルの前後 40 m に当たる標識は、SA の側へ 20 m ずつ動かして空いた所に置き、次の標識の 100 m 手前を越えるなら省く。
- [ ] **Step 5: 格子を共有にする。** `02b-towns.js` の格子は `{ type, dist, u0, v0, nu, nv, cell }` を持ち、塗る関数と距離の計算はその値を使う（町は今の `TOWN_*` の値）。`townSample` と `townCellAt` は格子の値を読む。町のテストは変えずに通る。
- [ ] **Step 6: `02f-sa.js` に配置・`saPath`・格子・読み込み・枠の判定・`saKeepOut`・`saGroundBlend`・`saFallbackLayout` を作る。** 格子に塗るもの：通路・広場・出口・駐車場の中は `ROAD`、歩道と島の縁は `WALK`、植え込み・島・建物・屋根の柱・止まっている車・駐車場の縁（`v = 102`、`u = 180` と `460` の通路の外）は `WALL`、減速車線と加速車線は `saExitEdges`・`saEntryEdges` の帯を `ROAD`。
- [ ] **Step 7: 地面とトラックを SA に対応させる。** `GROUND.at` と `GROUND.contact` は、町の次に `GROUND.sas` を見る（`project` の `s, lat` から `u, v`）。`09b-rig.js` の `_ga` と `09c-truck.js` に `sa` を足し、確かさの判定（`zone === 'town'` の所）に `'sa'` を足す。`sim.mjs` の `PURE` に `'02f-sa.js'`、`NAMES` に `SAS, saExitEdges, saEntryEdges, saAt, saExitAt, saEntryAt, signKm, waterAt, saLayout, saPath, saGrid, saGridSteps, saLoad, saUnload, SA_LOADED, saStallAt, saPumpAt, saFallbackLayout, saInside, saKeepOut, saGroundBlend`。
- [ ] **Step 8: `npm test` がすべて通る。**
- [ ] **Step 9: コミット**（`feat: service areas on the route: entrances, layout, grid and ground`）。

---

### Task 2: サービスエリアの読み込みと見た目

**Files:**
- Create: `src/05c-sa-mesh.js`
- Modify: `src/05-world.js`（SA の減速車線・加速車線の路面・しま模様・ガードレール・植え込みの帯、SA の標識、家と木と地面が SA に道を譲る）
- Modify: `src/13-game.js`（`saTick`、`preloadAround`）
- Modify: `test/e2e/helpers.mjs`（`__ready` が `saTick` も回す、`__sa(k, pts)`、`__placeSa(k, u, v, du, dv, kmh, coupled)`）
- Test: `test/e2e/sa.e2e.mjs`

**Interfaces:**
- Consumes: Task 1 の `SAS`、`saLayout`、`saGridSteps`、`saAdd`、`saUnload`、`SA_LOADED`、`saExitEdges`、`saEntryEdges`、`saKeepOut`、`saGroundBlend`、`SIGNS` の `saAdv | saNose | saNext | saMerge`。
- Produces:
  - `function* saMeshSteps(k)`、`saMeshDispose(k)`、`SA_MESH`（`k → { grp, tris, meshes }`）。グループは `posAt(sa.sDiv + 330, 0)` に置き、点は `saLocal(sa, u, v, y, out)`（`posAt(sa.sDiv + u, −v)` からグループの位置を引く）で作る。
  - 見た目：路面（アスファルト）、白線（大型車の枠・給油の枠・乗用車の枠）、路面の矢印、縁石、植え込み（低い木）、建物（箱、壁の色は乱数）、屋根と柱、給油機、駐車場の中の看板（`大型車`・`給油所`・`出口`）、止まっている車（`10-traffic.js` の `PROTOS` の形を使う）。照明灯は Task 6。
  - `saTick(budgetMs = 6)` → 作っている途中の数。`TR.s` が `sDiv − 1500` 〜 `sEnd + 200` の SA を作り始め、`sDiv − 2500` より手前か `sEnd + 2500` より先で、`TR.sa` でなければ捨てる。持つのは 1 か所。作るたびに `visit` を 1 増やす（場所ごと）。作れなかったら `saFallbackLayout`（コンソールに 1 行）。
  - SA の標識の見た目：`saAdv`（緑の板に `${jp} SA`、距離、給油・食事・トイレの印）、`saNose`（`SA 入口`）、`saNext`（`この先の SA`、次の 2 か所の名前と本物の km と給油の印）、`saMerge`（`本線 合流注意`）。

- [ ] **Step 1: 失敗するテストを書く**（`test/e2e/sa.e2e.mjs`）

```js
test('SA を作る仕事は 1 回 30 ms 以内に分かれ、90 km/h で来ても分かれ目に着く前にでき上がる', …);   // town-job の E3 と同じ測り方。中井の sDiv − 1600 から 90 km/h
test('中井 SA：減速車線から入り、大型車の枠を通り抜け、給油の枠を通って、加速車線から本線に戻る（罰金・損傷なし）', …);   // __drive(__sa(0, saPath(...)), 15)
test('SA の中で、三角形と描く回数が画質ごとの上限に収まる（高 120,000・80、低は高の 6 割以下）', …);
test('SA の 2km・1km・500m の案内と「SA 入口」の標識がある', …);   // SIGNS と、その場所のチャンクの中のメッシュ
```

- [ ] **Step 2: `node --test test/e2e/sa.e2e.mjs` を実行して失敗を見る**（`saTick` がない）。
- [ ] **Step 3: `05-world.js` に SA の出入口の道を作る**（`buildRamps` と同じ形：路面の帯、しま模様、本線との間の芝、ガードレール、クッションのドラム）。`railRuns` は SA の減速車線（`u` −6〜`uSep + 14`）と加速車線（`uJoin − 14`〜666）で本線の左のガードレールを切る。`terrainY` は `saGroundBlend` で SA の地面に道を譲る。`buildTrees` と `buildHouses` は `saKeepOut` を避ける。SA の標識を `buildSigns` に足す。
- [ ] **Step 4: `05c-sa-mesh.js` と `saTick` を作る。** `townsTick` と同じく、1 回の仕事を `budgetMs` で区切る。`preloadAround` は `updateChunks + townsTick(40) + saTick(40)` が 0 になるまで回す。
- [ ] **Step 5: `node --test test/e2e/sa.e2e.mjs` と `npm test` が通る。**
- [ ] **Step 6: コミット**（`feat: service areas in the game: loading, entrances and their look`）。

---

### Task 3: 燃料・眠気と、給油・仮眠・救援

**Files:**
- Create: `src/02g-care.js`
- Create: `src/13b-stops.js`
- Modify: `src/09c-truck.js`（減り方を `fuelRate` に、`fuel ≤ 0` でアクセル 0）
- Modify: `src/13-game.js`（`GAME.sleepy`、知らせ、仕事の欄、結果の行、保存、次の朝で眠気 0、`'stop'` の間は周りの車も止める）
- Modify: `src/08-dash.js`（燃料の残りの km、眠気の棒）、`src/page.html`（`#bStop`、`#fadeOv`・`#fadeText`、`#blinkOv`、`#careIcons` の `#icFuel`・`#icSleep`）、`src/12-input.js`（`KeyG: 'stop'`、`['bStop', 'stop']`）
- Modify: `test/helpers/sim.mjs`
- Test: `test/care.test.mjs`、`test/e2e/sa.e2e.mjs`

**Interfaces:**
- Consumes: Task 1 の `SAS`、`SA_LOADED`、`saStallAt`、`saPumpAt`、`TR.sa`、`TR.zone`、`TR.tu`・`TR.tv` にあたる SA の座標（`project` から `u = s − sDiv`、`v = −lat`）。
- Produces（`02g-care.js`、DOM なし）：
  - `CARE = { fuelL: 120, price: 140, rangeKm: 220, rescueYen: 30000, rescueL: 20, burn }`。`burn` は S4 が通るように決める倍率（今の減り方の 5 倍前後）。
  - `fuelRate(drive, v)` → 1 秒あたりの減り（割合）：`(max(0, drive·v) / (0.42·36e6) + 0.0004) · SCALE / 600 · CARE.burn`。
  - `sleepyRate(clockSec)` → ゲームの時計 1 秒あたりの増え：`1 / (6·3600)`、時が 22 以上か 5 未満なら 1.5 倍。
  - `blinkGap(sleepy, r)` → 秒：0.85 以下は `Infinity`、それより上は `lerp(40, 8, (sleepy − 0.85) / 0.15) · (0.5 + r)`（`r` は 0〜1 の乱数、平均が仕様どおり）。
  - `refuel(fuel)` → `{ liters: Math.round((1 − fuel) · 120), yen: liters · 140 }`。
  - `fuelKm(fuel)` → `Math.round(fuel · 220 / 10) · 10`。
- Produces（`13b-stops.js`）：
  - `stopKindNow()` → `'fuel' | 'nap' | 'rescue' | null`（仕様 8.1。止まっている：1 km/h 未満、`GAME.state === 'drive'`）。
  - `stopUpdate(dt)`：`#bStop` の文と出し隠し、`GAME.stopKind`。
  - `stopRun(kind)`：暗転（0.6 秒）→ 文 → 結果 → 明るく（0.6 秒）。その間 `GAME.state = 'stop'`、終わったら `'drive'`。走っている途中でもう 1 度呼ばれても何もしない。
  - `careTick(dt)`：眠気を増やす、15%・5%・0.7 の知らせを 1 回ずつ（`GAME.careMsg = { f15, f5, s70 }`、値が戻ったら次にまた出せる）。
  - `blinkUpdate(dt)`：`#blinkOv` の暗さ。
  - `careSave()`、`careLoad()`：`nlh.care = { fuel, sleepy }`。壊れた値なら燃料 0.82・眠気 0。
  - 仕事の欄：`job.fuelCost`、`job.fuelN`、`job.rescue`（`setupJob` で 0）。`driveState` と `loadDrive` に `fuel`・`sleepy`・`fuelCost`・`fuelN`・`rescue`（ない古い保存は今の値・0）。
  - `clusterState()` に `fuelKm`、`sleepy`。
  - 燃料 0 になったら `GAME.autoHazard`（本線のとき）と電光板 `燃料がなくなりました`。エンジンの音も止める（`audioUpdate` の `running` に `TR.fuel > 0`）。

- [ ] **Step 1: 失敗するテストを書く**（`test/care.test.mjs`）

```js
test('S4 燃料：荷物 15 t・平ら・90 km/h で 22 km 走ると、満タンから 0.1 ±0.01 減る（220 km ±10%）', () => { /* flatRoad、setup(cargo 15000)、速さを 90 に保つ入力で 2.2 km */ });
test('S4 燃料が 0 だとアクセルが効かない（同じ入力で速さが増えない）', …);
test('S4 給油の量と代金：燃料 0.2 → 96 L・13,440 円', () => { assert.deepEqual(SIM.refuel(0.2), { liters: 96, yen: 13440 }); });
test('S5 眠気：昼 6 時間で 1、夜は 1.5 倍', () => { /* sleepyRate(12 * 3600) * 6 * 3600 ≈ 1、sleepyRate(23 * 3600) / sleepyRate(12 * 3600) === 1.5 */ });
test('S5 まばたき：0.85 以下はなし、1.0 で平均 8 秒、0.85 を少し超えた所で平均 40 秒', …);
test('燃料と眠気の計算は 1 回 0.05 ms 以内', …);
```

`test/e2e/sa.e2e.mjs` に足す：

```js
test('給油の枠で止まると「給油」が出て、押すと満タン、仕事の燃料代、時計 +10 分、電光板の文', …);   // __placeSa(0, 377, 26, 1, 0, 0)、燃料 0.2
test('空いている大型車の枠で止まると「仮眠」が出て、押すと眠気 0、時計 +30 分', …);
test('E2 燃料切れ：本線で燃料 0 → 止まる → 「救援を呼ぶ」→ 燃料 20 L、時計 +60 分、結果の画面に「救援　-¥30,000」', …);
test('燃料切れでも、ブレーキで止まっていられ、救援のあと走り出せる（上り坂と加速車線の上）', …);
test('暗転の間のボタンとキーは効かない（給油を 2 回押しても代金は 1 回、メニュー・地図は開かない）', …);
test('E3 開き直し：燃料と眠気が保存した値に戻る', …);
test('サービスエリアの中で開き直しても、そこから走れる（地面の上、壁の外）', …);
test('古い保存（燃料・眠気・燃料代のない nlh.drive、nlh.care なし）でも始まる', …);
test('E5 まばたき：眠気 0.95 で 30 秒のうちに画面が暗くなる、0.5 では暗くならない', …);
test('E9 場所のボタン：スマホの縦・横で、ほかのボタン・札・LED と重ならず画面に収まる', …);
test('燃料が 25% 未満、眠気が 0.5 を超えると、車の外の視点で小さな印が出る（15%・0.85 で赤）', …);
test('夜に仕事を終えて次の朝になると、眠気が 0 になる', …);
```

- [ ] **Step 2: `node --test test/care.test.mjs` を実行して失敗を見る。**
- [ ] **Step 3: `02g-care.js` を作り、`09c-truck.js` の減り方を `fuelRate` にする。** `physicsAdvance` は `TR.fuel ≤ 0` のときアクセルを 0 にする。`CARE.burn` を S4 が通る値に決める。`sim.mjs` に `'02g-care.js'` と `CARE, fuelRate, sleepyRate, blinkGap, refuel, fuelKm`。
- [ ] **Step 4: `npm test` が通る。**
- [ ] **Step 5: `13b-stops.js`・ボタン・幕・印・メーター・結果の行・保存を作る。** `simTick` の運転中に `careTick(dt)` と `stopUpdate(dt)`、毎フレーム `blinkUpdate(dt)`。`handleActions` の `'stop'` は `GAME.stopKind` があり `GAME.state === 'drive'` のときだけ `stopRun`。`'stop'` の間は `handleActions` のほかのボタン（メニュー・地図・視点など）を受け付けない。周りの車と町の車は `'menu' | 'map' | 'stop'` で止める。
- [ ] **Step 6: `node --test test/e2e/sa.e2e.mjs`、`node --test test/e2e/delivery.e2e.mjs test/e2e/dash.e2e.mjs test/e2e/smoke.e2e.mjs` と `npm test` が通る。**
- [ ] **Step 7: コミット**（`feat: fuel and sleepiness, with refuelling, naps and the rescue at the service areas`）。

---

### Task 4: ナビの寄り道・標識の距離・合流でよける車

**Files:**
- Modify: `src/02g-care.js`（`saSuggest`）
- Modify: `src/02e-nav.js`（`navText` に新しい文）
- Modify: `src/13-game.js`（区間 `'sa'`、`NAV.sug`、`navManeuver`、`navState`、目的地の札）
- Modify: `src/08-dash.js`（`NAV_ARROW` に新しい種類、SA の中の画面）、`src/08b-navmap.js`（札の矢印の角度、全体地図の SA）
- Modify: `src/10-traffic.js`（合流でよける）
- Test: `test/care.test.mjs`、`test/nav.test.mjs`、`test/e2e/sa.e2e.mjs`、`test/e2e/nav.e2e.mjs`

**Interfaces:**
- Consumes: Task 1 の `SAS`、`signKm`、`saLayout` の枠、`saStallAt`、`saPumpAt`、`saPath`。Task 3 の `GAME.sleepy`、`TR.fuel`、`fuelKm`、`stopKindNow`。
- Produces:
  - `saSuggest(s, fuel, sleepy, destSDiv, destKp)` → `{ sa, why: 'fuel' | 'sleep' } | null`。燃料 0.15 未満なら `'fuel'`、そうでなく眠気 0.7 以上なら `'sleep'`、どちらでもなければ null。`sDiv − s ≥ 160` のいちばん近い SA。その SA より目的の出口（`destSDiv`）が手前で、`fuel · 220 ≥ 1.2 · (destKp − sToKp(s))` なら null。
  - `navLeg()` に `'sa'`：`TR.zone === 'sa'`、または `TR.zone === 'road'` で `saExitAt(TR.s)` かつ `TR.lat < −12.5`。SA の加速車線で `TR.lat < −12.5` は今の `'band'`。
  - `navManeuver()`：
    - 高速（`'expressway'`）で `NAV.sug` があるとき：`d = sa.sDiv − TR.s`、`d > 700` は `{ kind: 'saFuel' | 'saRest', dist: signKm(d) }`、`d ≤ 700` は `{ kind: 'saLane', lanes: 左が明るい 2 車線 }`、`d ≤ 160` は `{ kind: 'saExit' }`。`NAV.sug` がないときは今の出口の案内（距離は `signKm`）。
    - `'sa'` のとき：行き先（グローバル制約の直しの順）→ `{ kind: 'toStall' | 'toPump' | 'toOut', dist, angle }`（`dist` はまっすぐの距離を 10 m 単位、`angle` はトラックの向きから見た行き先の向き）。枠の中で止まる前は `stopNap` / `stopFuel`。
  - 目的地の札：本線で目的の出口の分かれ目より手前なら `signKm(destSDiv − TR.s)` km。過ぎたら題を `${whB.name}`、距離を門までのナビのルートの長さ（なければまっすぐ）。
  - `navState()` に `sug`、`saTarget`（`{ kind, u, v }`）。
  - `drawNav`：`leg === 'sa'` で SA の形（通路・枠・建物・給油所、止まっているトラックの枠は灰色）、行き先の枠（青）、トラックの矢印。
  - `drawMap`：高速の線の上に 6 か所の SA の印（給油の印と名前）。`TR.zone === 'sa'` なら下半分に SA の地図。
  - 合流でよける：`updateTraffic` で、自分が `(entryAt(TR.s) || saEntryAt(TR.s))` かつ `−16 < TR.lat < −9.6` のとき、`dir === 1`・`lane === 0`・`TR.s − 120 ≤ c.s ≤ TR.s + 20` の車は、`laneChangeSafe(c, 1, PB)` なら車線を移る。移れなければ、トラックの後ろの端の 25 m 後ろを前の車として `idm` を足す（`min`）。

- [ ] **Step 1: 失敗するテストを書く。**

```js
// test/care.test.mjs
test('S7 寄り道の案内：燃料 0.1 なら次の SA（fuel）、眠気 0.75 なら（sleep）、どちらでもなければ null', …);
test('S7 目的の出口が手前で燃料が足りるときは案内しない、足りなければ案内する', …);
test('S7 分かれ目まで 160 m を切った SA は案内せず、次の SA にする（通り過ぎたら次）', …);
// test/nav.test.mjs
test('SA の案内の文', () => { assert.equal(SIM.navText('saFuel', '中井'), '中井SA で給油を'); /* saRest saLane saExit toPump toStall toOut stopFuel stopNap */ });
```

`test/e2e/sa.e2e.mjs` に足す：

```js
test('E1 案内どおりに走る運転手が、中井 SA に入り、大型車の枠で「仮眠」、給油の枠で「給油」をして、出口から本線に戻る（罰金・損傷なし）', …);
// 仕事 2（厚木→御殿場）、中井の sDiv − 2000 の走行車線、燃料 0.1・眠気 0.75。運転手は navState().maneuver だけを見る：
// saLane で減速車線へ、'sa' の区間では saTarget までの saPath を __drive で走り、stopNap / stopFuel で止まって #bStop を押す。
test('E4 ナビ：燃料 10% で「中井SA で給油を」、2km の案内で「中井SA 入口　左車線へ」、中で「給油機の横に止める」、給油したらふだんの案内', …);
test('通り過ぎると次の SA（足柄）の案内になる', …);
test('E7 合流：加速車線にいるとき、後ろから来る走行車線の車が車線を移るか速度を落とし、ぶつからない', …);
// test/e2e/nav.e2e.mjs に足す
test('E8 2km・1km・500m の標識の所で、ナビの札と目的地の札が 2.0・1.0・0.5 km', …);
test('出口の分かれ目を過ぎると、目的地の札が倉庫の名前と門までの距離になる', …);
test('全体地図に 6 か所の SA の印、SA の中では SA の地図', …);
```

今の `nav.e2e.mjs` の E5 などで、高速の距離の数を見ているテストは `signKm` の数に書き直す。

- [ ] **Step 2: `node --test test/care.test.mjs test/nav.test.mjs` を実行して失敗を見る。**
- [ ] **Step 3: `saSuggest` と `navText` の文を作り、`npm test` が通る。**
- [ ] **Step 4: ゲームの中の案内・画面・地図・合流を作る。**
- [ ] **Step 5: `node --test test/e2e/sa.e2e.mjs test/e2e/nav.e2e.mjs test/e2e/dash.e2e.mjs test/e2e/playthrough.e2e.mjs` と `npm test` が通る。**
- [ ] **Step 6: コミット**（`feat: navigation to the service areas, signs and distances agree, traffic makes room at merges`）。

---

### Task 5: 道路の小物（上を通る橋・路面の文字・柵と植え込み）

**Files:**
- Modify: `src/02-route.js`（`OVERPASSES`、`fenceAt(s, side)`）
- Create: `src/05d-roadside.js`（`buildOverpasses(ctx)`、`buildMarks(ctx)`、`buildFences(ctx)`、`buildShrubs(ctx)`）
- Modify: `src/05-world.js`（`buildChunk` から呼ぶ。家と木は柵の外）
- Test: `test/roadside.test.mjs`、`test/e2e/town-job.e2e.mjs`（今の重さのテストがそのまま通ること）

**Interfaces:**
- Produces（`02-route.js`、DOM なし）：
  - `OVERPASSES`：`[{ s, skew, w, kind: 'road' | 'farm', y }]`。町の度合い（`regionAt(s).town`）0.6 以上は 400 m、それ以外は 1200 m を目安に、間隔を `rng(20261112)` で ±30%。置かない所は仕様 9.1。`skew` は ±15 度、`w` は `'road'` 9〜12 m・`'farm'` 6 m。`y` は橋げたの下の高さ（その `s` の前後で最も高い路面 + 5.2 m、ただし地面の形で高くなってよい）。
  - `overpassPiers(ov)` → `[{ s, lat }]`：中央分離帯のまん中と、両側の `|lat| ≥ 14.5`。
  - `fenceAt(s, side)` → bool：防音壁（`soundWallAt`）・町（`townKeepOut`）・SA（`saKeepOut`）・トンネル（`tunnelAt(s, 20)`）・橋（前後 10 m）・海と湖（`waterAt > 0`）・IC と SA の出入口の道（`rampAt`・`entryAt`・`saAt` の前後 30 m）では false。
- 見た目：
  - 橋：橋げた（箱）、欄干、橋脚、両端の土手と橋台（`terrainY` で地面に入る）。橋 1 本 2,500 三角形以下。
  - 路面の矢印：すべての IC の出口の分かれ目の `300 m`・`150 m` 手前の走行車線（`X_TRV`）に「直進・左」。文字：IC と SA の出口の道の始まり（`u = 30`、`50`）の車線の中心に `減速`。canvas の 1 枚の絵から切り出す。
  - 柵：`lat = ±26` の地面の上、高さ 1.5 m の金網（透ける絵）と 3 m おきの柱（まとめて描く）。
  - 植え込み：IC の出口の鼻先の先（本線と出口の道の間の芝）と入口の道と本線の間に 6 m おきの低い木（高さ 1〜2 m、まとめて描く）。
  - `buildTrees` と `buildHouses`：柵がある所では `|lat| < 27.5`（家は大きさの分も）に置かない。

- [ ] **Step 1: 失敗するテストを書く**（`test/roadside.test.mjs`）

```js
test('S8 どの橋の下も、本線と路肩（lat −12.2〜12.2）で路面から 5.0 m 以上', …);
test('S8 橋は IC と SA の出入口・トンネル（前後 150 m）・海と湖・上にかかる標識と電光板と車間距離の標識（前後 40 m）にない', …);
test('S8 橋脚は走れる所（drivable）から 0.5 m 以上離れている', …);
test('S8 橋の数：町に近い区間は 1 km に 2〜3 本、それ以外は 1 km に 0.5〜1.3 本くらい', …);
test('柵は防音壁・町・SA・トンネル・橋・海と湖・出入口の道の所にない', …);
```

`test/e2e/` に足す（`sa.e2e.mjs` か新しい `roadside.e2e.mjs`）：

```js
test('橋のある区間のチャンクに橋のメッシュがあり、1 本 2,500 三角形以下', …);
test('IC の出口の手前の走行車線に矢印、出口の道に「減速」がある', …);
```

- [ ] **Step 2: `node --test test/roadside.test.mjs` を実行して失敗を見る。**
- [ ] **Step 3: `OVERPASSES`・`overpassPiers`・`fenceAt` を作り、`npm test` が通る。**（`sim.mjs` の `NAMES` に足す。）
- [ ] **Step 4: `05d-roadside.js` の見た目を作り、`buildChunk` から呼ぶ。**
- [ ] **Step 5: 新しい e2e と `node --test test/e2e/town-job.e2e.mjs test/e2e/town.e2e.mjs test/e2e/smoke.e2e.mjs` が通る**（「90 km/h で 3 つの IC を通り過ぎても…40 ms を超えるのも…1 回まで」がそのまま通る）。
- [ ] **Step 6: コミット**（`feat: roadside: overpasses, road markings, boundary fences and shrubs`）。

---

### Task 6: 夜の明かり

**Files:**
- Modify: `src/02-route.js`（`LAMP_ZONES`、`lampsIn(s0, s1)`）
- Modify: `src/05d-roadside.js`（`buildLamps(ctx)`、`buildReflectors(ctx)`、夜の素材の更新 `nightUpdate()`）
- Modify: `src/03-gfx.js`（`MAT.lampHead`、`MAT.pool`（加える合成）、反射板と標識の素材に「ライトの前だけ明るい」項）
- Modify: `src/05c-sa-mesh.js`（駐車場の照明灯と模様）、`src/05b-town-mesh.js`（大通りの街灯 35 m おき・高さ 8 m、倉庫の構内の投光器 2〜4 基）
- Modify: `src/10-traffic.js`、`src/10b-town-traffic.js`（光の点、前の路面の明かり）
- Modify: `src/13-game.js`（毎フレーム `nightUpdate()`）
- Test: `test/roadside.test.mjs`、`test/e2e/night.e2e.mjs`

**Interfaces:**
- Produces（`02-route.js`、DOM なし）：
  - `LAMP_ZONES`：`[{ s0, s1, kind: 'ic' | 'sa' | 'tunnel' | 'urban' }]`。IC：`r.sDiv − 100` 〜 その IC の入口の `e.s1`（最後の IC は `r.sEnd`）。SA：`sDiv` 〜 `sEnd`。トンネル：`s0 − 300`〜`s0` と `s1`〜`s1 + 300`。町に近い区間：100 m ごとに `soundWallAt(s, −1) || soundWallAt(s, 1) || regionAt(s).town ≥ 0.6`。
  - `lampsIn(s0, s1)` → `[{ s, lat, side, kind, armLat }]`：区間の中に 40 m おき、両側（`lat = ±13.6`、腕の先 `armLat = ±10.6`）。トンネルの中には置かない。IC と SA の出入口の道には、その道の左の縁の外に 30 m おき。
- 見た目と決まり：
  - 照明灯：柱 12 m、腕 3 m、灯具。`MAT.lampHead` の色は `TOD.night` の割合で灰色から `0xfff2d8` へ。トンネルの中のオレンジ（`MAT.lamp`）は今のまま。
  - 路面の模様：灯具の下の路面に半径 14 m のぼかした丸（加える合成、`depthWrite: false`、`polygonOffset`）。不透明度は `TOD.night` × 0.55。画質「低」では `kind` が `'urban'`・`'tunnel'` の本線の模様を描かない（IC・SA・町は描く）。
  - 反射板：ガードレールに 10 m おき（左は白、右と中央は黄色）。素材は `onBeforeCompile` で、世界の位置がトラックのライトの前（左右 18 度・8〜160 m）にあるほど明るくなる項を足す。`nightUpdate()` がトラックの頭の位置と向きと「ライトがついている × (夜 or トンネル)」を毎フレーム渡す。緑の大きな標識の面の素材にも同じ項。
  - 周りの車：夜（`TOD.night > 0.05` またはトンネル）、前照灯と尾灯の位置に光の点（すべての車で 1 つの `THREE.Points`、加える合成、距離で小さくなる）。向こうから来る車の前照灯は 1.6 倍。こちら向きに走る車（`dir === −1`）の前の路面に細長い明るい模様（`InstancedMesh`）。町の車も同じ。
  - `nightUpdate()` は 1 フレーム 0.5 ms 以内。昼は何もしない（点と模様を隠す）。中で例外が出たら、その飾り（反射板・車の光など）をそのフレームは描かず、コンソールに 1 回だけ出して運転を続ける。

- [ ] **Step 1: 失敗するテストを書く。**

```js
// test/roadside.test.mjs
test('S9 照明灯は IC・SA・トンネルの前後・町に近い区間にあり、どれでもない山の中（kp 60〜63 など）にない', …);
test('S9 照明灯はトンネルの中と走れる所（drivable）の中にない', …);
// test/e2e/night.e2e.mjs
test('E6 夜：IC の近くの路面は山の中の路面より明るい（luma の差 12 以上）', …);   // 22:00、後ろからの視点、画面の下のまん中
test('E6 ライトの前の反射板は、後ろの反射板より明るい', …);
test('E6 前の車の尾灯の光の点が夜に見え、昼は隠れる', …);
test('夜の毎フレームの仕事（nightUpdate）は 0.5 ms 以内（60 回の平均）', …);
test('画質「低」では本線の模様を描かず、IC の模様は描く', …);
test('町の夜：大通りの街灯と倉庫の投光器が光る', …);
test('夜の IC と SA の中で、三角形と描く回数が画質ごとの上限に収まる', …);
test('nightUpdate の中で例外が出ても運転が続き、コンソールに 1 行だけ出る', …);   // 車の光の点の位置を壊してから simTick と描画を続ける
```

- [ ] **Step 2: `node --test test/roadside.test.mjs` を実行して失敗を見る。**
- [ ] **Step 3: `LAMP_ZONES` と `lampsIn` を作り、`npm test` が通る。**
- [ ] **Step 4: 照明灯・模様・反射板・標識・車の光・町の街灯と投光器を作る。**
- [ ] **Step 5: `node --test test/e2e/night.e2e.mjs test/e2e/sa.e2e.mjs test/e2e/town.e2e.mjs test/e2e/smoke.e2e.mjs` と `npm test` が通る。**
- [ ] **Step 6: コミット**（`feat: night lighting: road lamps and light pools, reflectors, lit signs, vehicle lights`）。

---

### Task 7: 仕上げ

**Files:**
- Modify: `README.md`（燃料と眠気、サービスエリア、給油・仮眠・救援、G キー、ファイルの一覧に `02f-sa.js`・`02g-care.js`・`05c-sa-mesh.js`・`05d-roadside.js`・`13b-stops.js`、テストの数と時間）

- [ ] **Step 1: README を書き直す。**
- [ ] **Step 2: `npm test` と `npm run e2e` の全部を裏で回し、すべて通る**（失敗があれば原因を直してから、そのファイルと全部をもう一度）。
- [ ] **Step 3: 公開ページを更新し、サービスエリア（昼と夜）、夜の IC、上を通る橋の画像を撮ってユーザーに送る。**
- [ ] **Step 4: コミット**（`docs: README for the expressway (service areas, fuel and rest, night)`）。

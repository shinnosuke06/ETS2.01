# 牽引の重さと挙動 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** トレーラーの連結・切り離しと、荷物の重さとタイヤの力にもとづく連結車両の挙動を、ニッポン長距離便に入れる。

**Architecture:** 物理を「パワートレイン」「連結車両の力学」「窓口」の3ファイルに分け、THREE と DOM を使わない形にして `node --test` で検証する。力学は、平面上の2剛体、車軸ごとのタイヤ力、連結点の力積拘束で、1/240 秒の固定刻み。ゲーム側は `TR` と `EVENTS` と少数の関数だけで物理に触れる。

**Tech Stack:** 素の JavaScript（ビルドは `build.mjs` がファイルをつなげるだけ）、Three.js r128（実行時は cdnjs、テストは npm の `three@0.128.0`）、`node:test`、Playwright（環境に導入済み。`.mjs` からは `createRequire(import.meta.url)('playwright')` で読む）。

**Spec:** `docs/superpowers/specs/2026-11-10-towing-physics-design.md`

## Global Constraints

- 計算の刻みは 1/240 秒の固定。1/60 秒のフレームで 4 回。1 フレームで進めるのは最大 24 回。
- 路面の摩擦係数は `MU = 0.8`。定義は `src/09b-rig.js` の 1 か所だけ。
- `src/01a-math.js`、`src/02-route.js`、`src/09a-powertrain.js`、`src/09b-rig.js`、`src/09c-truck.js` は `THREE`、`document`、`window`、`localStorage`、`matchMedia` を参照しない。
- 物理のコードは道路を `ROAD` オブジェクト経由でだけ問い合わせる（テストが平らな道に差し替えるため）。
- 実行時の外部ライブラリは増やさない。外部の物理エンジンは使わない。
- `build.mjs` は `src/*.js` を名前順につなげる。読み込み順はファイル名で決まる。
- ほかのファイルが使っている `TR` の項目名は変えない：`x z h v steer yawRate gear nextGear dir rpm shiftT thr brk ret load cruise cruiseV cruiseI s lat idx y pitch accel latAcc frontS frontLat tr.{x z h s lat idx y pitch} odo fuel damage cab spin onRamp`。
- 画面の文言は設計書どおり：「ずれています。前に出てやり直してください」「速すぎます」「止まってから切り離してください」「総重量 33.1 t」（数値は小数1桁）。
- スカニアの社名やロゴは入れない。
- コミットメッセージの末尾に、セッションで指定された帰属の行を付ける。
- テストを先に書き、失敗を確認してから実装する。

## Review Focus

設計書が暗に求めているが、T1〜T14 では試されない条件。それぞれのテストを担当タスクに入れてある。

1. トレーラーを置いたまま走り去る（一方通行なので戻れない）→ 気づけるメッセージが出て、メニューの「やり直す」で復帰できる。（Task 9）
2. 目的地で、納品の枠の外で切り離す → 黙って何も起きないのではなく、「納品の枠の中で切り離してください」と出る。（Task 9）
3. 低速のバックで連結角が 80° に達する → 止まるだけで、事故や違反金にしない。（Task 7）
4. 連結作業中や事故のあとに、やり直しや次の仕事に移る → 連結の状態、液体の揺れ、傾き、ブレーキ圧、装置のフラグが残らない。（Task 8）
5. タブを裏に回したあとなど、1 フレームが極端に長い → 進めすぎず（最大 24 回）、値も壊れない。（Task 4）

---

## 共通の定義

### 座標と符号

- 世界座標は `x, z`。向き `h` の前方向は `f = (sin h, cos h)`、右方向は `ρ = (−cos h, sin h)`。
- ヨーレート `w = dh/dt` は左回りが正。舵角 `steer` は右が正。道路の横位置 `lat` は右が正。
- 重心から世界座標で `r = (rx, rz)` 離れた点の速度は `v + w·(rz, −rx)`。その点にかかる力 `(Fx, Fz)` のモーメントは `Fx·rz − Fz·rx`。
- 車体座標（前 `a`、右 `b`）では、点の速度は `u_p = u + w·b`、`v_p = v − w·a`。力 `(Fu, Fv)` のモーメントは `Fu·b − Fv·a`。

### ファイル

| ファイル | 変更 | 役割 |
| --- | --- | --- |
| `src/01a-math.js` | 新規（`01-util.js` から分割） | 数学の小道具。`wrapA` もここへ移す |
| `src/01b-three.js` | 新規（`01-util.js` の残り） | THREE と DOM を使う小道具 |
| `src/02-route.js` | 変更 | 末尾に `ROAD`、`roadBarrier`、納品の枠 |
| `src/09a-powertrain.js` | 新規 | `EVENTS`、エンジン、変速、クルーズ、リミッター |
| `src/09b-rig.js` | 新規 | 連結車両の力学 |
| `src/09c-truck.js` | 新規 | `TR`、`TRAILERS`、配置、1 ステップ、連結の状態、事故の戻し |
| `src/09-physics.js` | 削除（Task 4） | |
| `src/05-world.js` `06-truck.js` `08-dash.js` `10-traffic.js` `11-audio.js` `12-input.js` `13-game.js` `page.html` | 変更 | 表示、音、操作、仕事の流れ |
| `package.json` `.gitignore` | 新規 | `npm test`、`npm run e2e`、`npm run build` |
| `test/helpers/sim.mjs` `test/*.test.mjs` | 新規 | Node の自動テスト |
| `test/e2e/helpers.mjs` `test/e2e/*.e2e.mjs` | 新規 | ブラウザの通し確認 |

### イベント（`EVENTS` に積む）

`{t:'cruiseOff'}`、`{t:'rail', hit, unit}`、`{t:'crash', hit}`、`{t:'car', hit}`、`{t:'couple-lock'}`、`{t:'coupled'}`、`{t:'couple-miss', why:'offset'|'fast'}`、`{t:'uncouple-start'}`、`{t:'uncoupled'}`、`{t:'uncouple-refused'}`、`{t:'rollover'}`、`{t:'jackknife'}`、`{t:'assist', kind:'abs'|'tcs'|'esc'|'rsc'}`（作動し始めたときに 1 回）、`{t:'reset'}`。

### 力学の手順（`rigStep` の 1 ステップ）

1. ブレーキ圧を一次遅れで更新する：`brakeP[i] += (service − brakeP[i]) · (1 − exp(−h / lag[i]))`、`lag = [0.35, 0.35, 0.5]`。
2. 軸重を計算する（`ax` はならした前後加速度、`FxT` と `Hx` は前のステップの値）。
   - トレーラー車軸群：`FzT = (m2·g·d2 + m2·ax·(h2 − hh) + hh·FxT) / L2`
   - キングピンの荷重：`Fk = m2·g − FzT`
   - 前軸：`FzF = (m1·g·b1 − m1·ax·h1 + e·Fk + hh·Hx) / L1`
   - 駆動軸：`FzR = m1·g + Fk − FzF`
   - `d2`、`h2` は空の車体と荷物の質量で重みをつけた重心。`Hx` はトレーラーがトラクターを前に押す力。連結していないときは `Fk = Hx = 0`。各軸重は静的な値の 5% を下限にする。
3. 安定装置の判定（Task 6、7）。
4. 各軸のタイヤ力。車輪の向きの速度 `uw, vw` を求め、`α = atan2(vw, max(|uw|, 3))`。
   - 前後の要求 `Fxd = 駆動（駆動軸だけ） − sign(uw)·(ブレーキ + drag（駆動軸だけ） + 0.0055·Fz)·clamp(|uw|/0.3, 0, 1)`
   - 上限 `Fmax = MU·Fz`。`|Fxd| ≤ Fmax` なら `Fx = Fxd`、`Fycap = √(Fmax² − Fx²)`、`Fy = −Fycap·tanh(ca·Fz·α / Fycap)`。
   - 上限を超えたときの扱い（ロック、空転）は Task 6。Task 3 では `Fx` を `±Fmax` に切り詰める。
   - ブレーキの最大：前 45 kN、駆動 75 kN、トレーラー `160 kN × clamp(静的な FzT / (24000·g), 0.4, 1)`。それぞれ `brakeP[i]` を掛ける。
5. そのほかの力：空気抵抗（トラクターの重心に `−sign(u)·0.5·1.2·0.6·10.2·u²`、トレーラーなしは 0.75 倍）、勾配（各車体に、その位置の道路の接線方向へ `−m·g·sinG`）、壁（Task 5）、液体（Task 7）。
6. 速度を更新 → 連結点の力積を解く → 位置を更新。連結点の相対速度を `vrel`、位置のずれを `C` として、`K·J = −(vrel + 0.2·C/h)` を解く。`K = (1/m1 + 1/m2)·I + p1·p1ᵀ/I1 + p2·p2ᵀ/I2`、`p = (rz, −rx)`。`J` をトレーラーに、`−J` をトラクターに加える。
7. 停止の処理：`cmd.hold` のときは全速度を 0 にする。ステップの前の速さが 0.02 m/s を超えていて、トラクターの前後速度の符号がこのステップで変わり、駆動がその向きに押していなければ、全速度を 0 にする。
8. 傾き、液体の揺れ、LTR を更新する（Task 7）。

---

### Task 1: テストの土台と `01-util.js` の分割

**Files:**
- Create: `package.json`、`.gitignore`、`test/helpers/sim.mjs`、`test/math.test.mjs`、`test/e2e/helpers.mjs`、`test/e2e/smoke.e2e.mjs`、`src/01a-math.js`、`src/01b-three.js`
- Delete: `src/01-util.js`
- Modify: `src/02-route.js`（末尾に追加）、`src/09-physics.js:14`（`wrapA` を削除）

**Interfaces:**
- Produces（`src/01a-math.js`）：`TAU DEG clamp lerp smooth damp rng hash2 vnoise fbm yen fmtClock wrapA`。先頭に `'use strict';`。
- Produces（`src/01b-three.js`）：`lsGet lsSet IS_TOUCH makeCanvas xform colorize mergeGeometries Parts extrudeX quadGeo roofGeo`。
- Produces（`src/02-route.js`）：
  - `const ROAD = { project, posAt, elevAt, gradeAt, headingAt, drivable, rampAt, barrier: roadBarrier }`
  - `roadBarrier(s, lat) → number`：その車線の先にある柵の `s`。本線（`lat > −14`）は `ROUTE_END − 1.5`。ランプ上（`rampAt(s)` があり `lat < −14.5`）は `r.sEnd − 12`。
  - 各ランプに `r.sZone0 = r.sGate + 70`、`r.sZone1 = r.sGate + 130`。
- Produces（`test/helpers/sim.mjs`）：
  - `loadSim() → sim`：下の `PURE` のうち存在するファイルをつなげ、`new Function` で実行し、`NAMES` の名前を持つオブジェクトを返す（未定義の名前は `undefined`）。
  - `H = 1/240`、`flatRoad(sim, {grade = 0, walls = false})`、`setup(sim, {trailer = 'van', cargo = 12000, v = 0, lat = -7.65, s = 1000, assist = true})`、`run(sim, seconds, input, each) → 経過秒`、`kmh(sim)`、`laneKeep(sim, lat) → steer`、`steerForLatAcc(sim, g) → steer`。
- Produces（`test/e2e/helpers.mjs`）：`openGame({width = 1280, height = 720, touch = false}) → {browser, page, errors}`。`index.html` を HTML の骨組みで包み、cdnjs の three を `node_modules/three/build/three.min.js` で、Google Fonts を空の応答で差し替える。`#startBtn` が押せるようになるまで待つ。

- [ ] **Step 1: `package.json` と `.gitignore` を作り、`npm install` する**

```json
{
  "name": "nippon-long-haul",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs",
    "test": "node --test test/*.test.mjs",
    "e2e": "node build.mjs && node --test --test-concurrency=1 test/e2e/*.e2e.mjs"
  },
  "devDependencies": { "three": "0.128.0" }
}
```

`.gitignore` は `node_modules/` の 1 行。`build.mjs` は ESM のままで動く。

- [ ] **Step 2: テストの読み込み役 `test/helpers/sim.mjs` を書く**

```js
import fs from 'node:fs';
const SRC = new URL('../../src/', import.meta.url);
export const PURE = ['01a-math.js', '02-route.js', '09-physics.js', '09a-powertrain.js', '09b-rig.js', '09c-truck.js'];
const NAMES = ['TAU', 'clamp', 'lerp', 'damp', 'wrapA', 'rng', 'S0', 'DS', 'X_TRV', 'ICS', 'RAMPS', 'TUNNELS', 'ROUTE_END',
  'posAt', 'project', 'elevAt', 'gradeAt', 'headingAt', 'drivable', 'rampAt', 'ROAD', 'roadBarrier',
  'EVENTS', 'GEARS', 'VMAX', 'engineTorque', 'startGear', 'powertrainStep',
  'MU', 'RIGP', 'RIG', 'rigSetTrailer', 'rigPlace', 'rigParkTrailer', 'rigStep', 'rigPose', 'rigApplyImpulse', 'rigAxleLoads', 'rigSteerLimit',
  'TRAILERS', 'TR', 'steerLock', 'setRigTrailer', 'placeTruck', 'parkTrailer', 'stepTruck', 'physicsAdvance',
  'requestCouple', 'requestUncouple', 'canAutoCouple', 'towReset', 'resolveCarContact'];
export function loadSim() {
  const src = PURE.filter(f => fs.existsSync(new URL(f, SRC))).map(f => fs.readFileSync(new URL(f, SRC), 'utf8')).join('\n');
  const ret = NAMES.map(n => `${n}: typeof ${n} !== 'undefined' ? ${n} : undefined`).join(', ');
  return new Function(`${src}\n;return { ${ret} };`)();
}
export const H = 1 / 240;
export function flatRoad(sim, { grade = 0, walls = false } = {}) {
  const R = sim.ROAD;
  R.project = (x, z, hint, out) => { out.i = 0; out.s = z; out.lat = -x; return out; };
  R.posAt = (s, lat, out) => { out.x = -lat; out.z = s; out.y = grade * s; out.h = 0; return out; };
  R.elevAt = s => grade * s; R.gradeAt = () => grade; R.headingAt = () => 0;
  R.drivable = (s, out) => { out.length = 0; out.push(walls ? [-12.2, -1.75] : [-1e9, 1e9]); return out; };
  R.barrier = () => Infinity; R.rampAt = () => null;
}
export function setup(sim, { trailer = 'van', cargo = 12000, v = 0, lat = -7.65, s = 1000, assist = true } = {}) {
  sim.setRigTrailer(trailer, cargo); sim.RIG.assistOn = assist;
  sim.placeTruck(s, lat, v, { coupled: !!trailer }); sim.EVENTS.length = 0;
}
export function run(sim, seconds, input, each) {
  const n = Math.round(seconds / H);
  for (let k = 0; k < n; k++) { const t = k * H; sim.stepTruck(H, input(t)); if (each && each(t) === false) return t; }
  return seconds;
}
export const kmh = sim => sim.TR.v * 3.6;
export function laneKeep(sim, lat) {
  const T = sim.TR, da = sim.wrapA(T.h - sim.ROAD.headingAt(T.s));
  return sim.clamp(0.35 * (lat - T.lat) + 9 * da * (0.4 + Math.abs(T.v) / 25), -1, 1);
}
export function steerForLatAcc(sim, g) { const v = Math.abs(sim.TR.v); return Math.atan(g * 9.81 * 3.9 / (v * v)) / sim.steerLock(v); }
```

- [ ] **Step 3: 失敗するテスト `test/math.test.mjs` を書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict'; import fs from 'node:fs';
import { loadSim, flatRoad, PURE } from './helpers/sim.mjs';
test('数学の小道具と道路が Node で読める', () => {
  const sim = loadSim();
  assert.equal(sim.clamp(5, 0, 1), 1);
  assert.ok(Math.abs(sim.wrapA(3 * Math.PI) - Math.PI) < 1e-9);
  const p = sim.posAt(sim.S0, 0, {});
  assert.ok(Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.h));
});
test('ROAD は道路の関数を指し、平らな道に差し替えられる', () => {
  const sim = loadSim();
  assert.equal(sim.ROAD.gradeAt, sim.gradeAt);
  flatRoad(sim, { grade: 0.04 });
  assert.equal(sim.ROAD.gradeAt(123), 0.04);
  assert.deepEqual({ ...sim.ROAD.project(3, 50, 0, {}) }, { i: 0, s: 50, lat: -3 });
});
test('柵の位置：本線は終点の手前、ランプは終端の 12 m 手前', () => {
  const sim = loadSim(), r = sim.RAMPS[3];
  assert.equal(sim.roadBarrier(5000, -7.65), sim.ROUTE_END - 1.5);
  assert.equal(sim.roadBarrier(r.sGate + 50, -40), r.sEnd - 12);
  assert.equal(r.sZone0, r.sGate + 70); assert.equal(r.sZone1, r.sGate + 130);
});
test('物理のファイルは画面の API を参照しない', () => {
  for (const f of PURE) {
    const u = new URL('../src/' + f, import.meta.url); if (!fs.existsSync(u)) continue;
    assert.doesNotMatch(fs.readFileSync(u, 'utf8'), /\b(THREE|document|window|localStorage|matchMedia)\b/, f);
  }
});
```

- [ ] **Step 4: `npm test` を実行し、失敗を確認する**（`01a-math.js` がないので `clamp is not a function` など）
- [ ] **Step 5: `src/01-util.js` を `01a-math.js` と `01b-three.js` に分ける。`wrapA` を `09-physics.js` から `01a-math.js` へ移す。`02-route.js` の末尾に `ROAD`、`roadBarrier`、`sZone0/1` を足す**
- [ ] **Step 6: `npm test` が通ることを確認する**（4 件 PASS）
- [ ] **Step 7: `test/e2e/helpers.mjs` と、失敗する `test/e2e/smoke.e2e.mjs` を書く**

```js
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
```

- [ ] **Step 8: `npm run e2e` が通ることを確認する**（ビルドが 2 つの新ファイルを含み、ゲームが今までどおり動く）
- [ ] **Step 9: コミット**（`package.json package-lock.json .gitignore test src`、メッセージ `test: add Node and browser test harness, split util into pure and THREE parts`）

---

### Task 2: パワートレインの切り出し

**Files:**
- Create: `src/09a-powertrain.js`、`test/powertrain.test.mjs`
- Modify: `src/09-physics.js:5-13,40-46,65-121`（定数と変速の部分を削り、`powertrainStep` を呼ぶ）、`src/13-game.js:43`（`TR.gcw = TR.mass` を足す）

**Interfaces:**
- Produces：
  - `const EVENTS = []`
  - `GEARS REV_RATIO FINAL RW EFF VMAX TQ`、`engineTorque(rpm) → N·m`
  - `startGear() → 2|3`：`ROAD.gradeAt(TR.s) > 0.03` または `TR.gcw > 30000` なら 2、それ以外は 3。
  - `powertrainStep(dt, throttle, brake) → { drive, drag, service }`（同じオブジェクトを使い回す）
    - `drive`：駆動軸の力（N）。前進が正で、`TR.dir` の向きを含む。変速中とニュートラルは 0。
    - `drag`：エンジンブレーキとリターダーの合計（N、0 以上）。リターダーは `21000·TR.ret·clamp(|TR.v|/6, 0, 1)`。
    - `service`：主ブレーキの踏み込み `clamp((brake − 0.3)/0.7, 0, 1)`。
    - 読む：`TR.v TR.dir TR.gcw TR.s`。書く：`TR.gear nextGear shiftT rpm thr brk ret load cruise cruiseV cruiseI`。クルーズが切れたら `EVENTS` に `cruiseOff`。
- 動きは今の `stepTruck` の該当部分（73〜121 行）と同じにする。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad } from './helpers/sim.mjs';
const fresh = () => { const sim = loadSim(); flatRoad(sim); sim.TR.gcw = 26000; sim.TR.s = 1000; return sim; };
test('トルク曲線', () => {
  const { engineTorque } = fresh();
  assert.equal(engineTorque(1000), 2550); assert.equal(engineTorque(800), 2025); assert.equal(engineTorque(2400), 0);
});
test('踏み始めはリターダーだけ、深く踏むと主ブレーキ', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: 20, gear: 12, nextGear: 12, dir: 1, rpm: 1200 });
  let o; for (let i = 0; i < 240; i++) o = sim.powertrainStep(1 / 240, 0, 0.2);
  assert.equal(o.service, 0); assert.ok(Math.abs(sim.TR.ret - 0.2 / 0.35) < 0.02); assert.ok(o.drag > 10000);
  o = sim.powertrainStep(1 / 240, 0, 0.65); assert.ok(Math.abs(o.service - 0.5) < 1e-9);
});
test('90 km/h で駆動を切る', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: sim.VMAX, gear: 12, nextGear: 12, dir: 1, rpm: 1160 });
  assert.equal(sim.powertrainStep(1 / 240, 1, 0).drive, 0);
});
test('ブレーキでクルーズが切れる', () => {
  const sim = fresh(); Object.assign(sim.TR, { v: 22, gear: 12, nextGear: 12, dir: 1, rpm: 1050, cruise: true, cruiseV: 22 });
  sim.powertrainStep(1 / 240, 0, 0.1);
  assert.equal(sim.TR.cruise, false); assert.ok(sim.EVENTS.some(e => e.t === 'cruiseOff'));
});
test('今の物理での加速は変わらない（26 t、0→80 km/h）', () => {
  const sim = loadSim(); sim.TR.gcw = sim.TR.mass = 26000; sim.placeTruck(sim.S0 + 40, -7.65, 0);
  let t = 0; while (sim.TR.v * 3.6 < 80 && t < 60) { sim.stepTruck(0.02, { throttle: 1, brake: 0, steer: 0 }); t += 0.02; }
  assert.ok(t > 24.5 && t < 28, `0-80 took ${t.toFixed(1)} s`);
});
```

最後のテストは実際の道路の出発地点を走る。分割の前に測った値は 26.2 秒で、分割の前後で変わらないことを確かめる。

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**（`powertrainStep is not a function`。加速のテストだけは通る）
- [ ] **Step 3: `src/09a-powertrain.js` を書き、`09-physics.js` の `stepTruck` を `powertrainStep` の戻り値を使う形に直す**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `refactor: extract powertrain from truck physics`）

---

### Task 3: 連結車両の力学の中核

**Files:**
- Create: `src/09b-rig.js`、`test/rig.test.mjs`

**Interfaces:**
- Consumes：`ROAD`、`clamp lerp wrapA`。
- Produces：
  - `const MU = 0.8`
  - `const RIGP = { m1: 7600, I1: 22000, L1: 3.9, a1: 1.25, b1: 2.65, e: 0.35, h1: 1.1, hh: 1.2, track: 2.05, half: 1.25, front: 5.4, back: 0.9, ca: [5.8, 6.0, 6.0], brakeMax: [45000, 75000, 160000], lag: [0.35, 0.35, 0.5], lsvRef: 24000 * 9.81, lsvMin: 0.4, V0: 3, artMax: 1.396 }`（`front`、`back` は後軸から車体の前端・後端まで）
  - トレーラーの諸元の形：`{ key, name, empty, L2, cgE: [キングピンから, 高さ], cgC: [キングピンから, 高さ], I0, kI, rear, nose, slosh: null | { frac, fx, zx, lx, fy, zy, ly } }`
  - `const RIG = { t: {x, z, h, vx, vz, w, m, I}, r: {x, z, h, vx, vz, w, m, I}, coupled, spec, cargo, d2, h2, steer, brakeP: [0, 0, 0], axle: [{Fz, Fx, Fy, alpha, lock, spin}, …3 個], ax, Hx, assistOn: true, assist: {abs, tcs, esc, rsc}, roll, rollV, ltr, ltrT, slosh: {x, vx, y, vy}, surge, gap }`
  - `rigSetTrailer(spec | null, cargoKg)`：`RIG.r.m`、`RIG.r.I = I0 + cargoKg·kI`、`d2`、`h2` を設定する。`null` はトレーラーなし。
  - `rigPlace(x, z, h, v, coupled)`：`(x, z)` はトラクターの後軸の位置。連結するときはトレーラーをまっすぐ後ろに置く。速度以外の状態（ブレーキ圧、傾き、揺れ、フラグ）を 0 に戻す。
  - `rigParkTrailer(kx, kz, h)`：トレーラーをキングピンの位置と向きで止めて置く。`RIG.coupled = false`。
  - `rigStep(h, cmd)`、`cmd = { steer, drive, drag, service, hold }`。
  - `rigAxleLoads() → [前, 駆動, トレーラー]`（静的、N）。
  - `rigPose(out) → { x, z, h, v, w, hx, hz, tx, tz, th }`：後軸の位置、向き、前後速度、ヨーレート、連結点、トレーラー車軸群の中心、トレーラーの向き。
- 手順は「共通の定義 › 力学の手順」の 1、2、4、5（壁と液体を除く）、6、7。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, H } from './helpers/sim.mjs';
const VAN = { key: 'van', name: 'バン', empty: 7000, L2: 8.3, cgE: [5.4, 1.5], cgC: [5.6, 2.0], I0: 108000, kI: 13, rear: 12.4, nose: 1.2, slosh: null };
const rig = (spec, cargo, v = 0) => { const sim = loadSim(); flatRoad(sim); sim.rigSetTrailer(spec, cargo); sim.rigPlace(0, 0, 0, v, !!spec); return sim; };
const cmd = o => ({ steer: 0, drive: 0, drag: 0, service: 0, hold: false, ...o });
const kg = n => n / 9.81;
test('静的な軸重：空車とバン22t', () => {
  let l = rig(null, 0).rigAxleLoads();
  assert.ok(Math.abs(kg(l[0]) - 5164) < 20 && Math.abs(kg(l[1]) - 2436) < 20);
  l = rig(VAN, 22000).rigAxleLoads();
  assert.ok(Math.abs(kg(l[0]) - 6060) < 150 && Math.abs(kg(l[1]) - 11140) < 150 && Math.abs(kg(l[2]) - 19400) < 150);
});
test('同じ力なら重いほど加速しない', () => {
  const dv = (spec, cargo) => { const sim = rig(spec, cargo, 5); for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({ drive: 15000 })); return sim.rigPose({}).v - 5; };
  const a = dv(null, 0), b = dv(VAN, 12000), c = dv(VAN, 22000);
  assert.ok(a > b && b > c && a > 2.5 * c, `${a} ${b} ${c}`);
});
test('連結点は離れない（スラローム 60 秒）', () => {
  const sim = rig(VAN, 12000, 15); let worst = 0;
  for (let i = 0; i < 60 * 240; i++) { sim.rigStep(H, cmd({ steer: 0.05 * Math.sin(i * H * 1.2), drive: 6000 })); worst = Math.max(worst, sim.RIG.gap); }
  assert.ok(worst < 0.03, `gap ${worst}`);
});
test('T10 低速は横滑りなしの式に合う（舵角 20°、5 km/h、20 秒）', () => {
  const sim = rig(VAN, 12000, 5 / 3.6), d = 20 * Math.PI / 180, target = 5 / 3.6;
  let x = 0, z = 0, h = 0, tx = 0, tz = -(8.3 - 0.35);                    // 参照：今までの式を、同じ速さで積分する
  for (let i = 0; i < 20 * 240; i++) {
    const v = sim.rigPose({}).v;
    sim.rigStep(H, cmd({ steer: d, drive: sim.clamp((target - v) * 20000, -30000, 30000) }));
    h += -v * Math.tan(d) / 3.9 * H; x += Math.sin(h) * v * H; z += Math.cos(h) * v * H;
    const hx = x + Math.sin(h) * 0.35, hz = z + Math.cos(h) * 0.35, dx = hx - tx, dz = hz - tz, L = Math.hypot(dx, dz);
    tx = hx - dx / L * 8.3; tz = hz - dz / L * 8.3;
  }
  const p = sim.rigPose({});
  assert.ok(Math.hypot(p.x - x, p.z - z) < 0.25, `rear axle ${Math.hypot(p.x - x, p.z - z)}`);
  assert.ok(Math.hypot(p.tx - tx, p.tz - tz) < 0.25, `trailer axle ${Math.hypot(p.tx - tx, p.tz - tz)}`);
});
test('T10 まっすぐ 10 m バックしても横にずれない', () => {
  const sim = rig(VAN, 12000, 0);
  for (let i = 0; i < 240 * 30 && sim.rigPose({}).z > -10; i++) sim.rigStep(H, cmd({ drive: sim.rigPose({}).v > -1 ? -8000 : 0 }));
  const p = sim.rigPose({}); assert.ok(p.z <= -10 && Math.abs(p.x) < 0.05 && Math.abs(p.tx) < 0.05);
});
test('坂で保持すると動かず、離すと下がる', () => {
  const sim = loadSim(); flatRoad(sim, { grade: 0.04 }); sim.rigSetTrailer(VAN, 22000); sim.rigPlace(0, 0, 0, 0, true);
  for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({ hold: true }));
  assert.equal(sim.rigPose({}).z, 0);
  for (let i = 0; i < 2400; i++) sim.rigStep(H, cmd({}));
  assert.ok(sim.rigPose({}).z < -1);
});
test('ブレーキは力：同じ圧でも重いほど減速が弱い', () => {
  const dec = cargo => { const sim = rig(VAN, cargo, 20); for (let i = 0; i < 480; i++) sim.rigStep(H, cmd({ service: 0.4 })); const v0 = sim.rigPose({}).v; for (let i = 0; i < 240; i++) sim.rigStep(H, cmd({ service: 0.4 })); return v0 - sim.rigPose({}).v; };
  assert.ok(dec(12000) > 1.08 * dec(22000));
});
test('乱数の入力 60 秒で値が壊れない', () => {
  const sim = rig(VAN, 22000, 10), r = sim.rng(7);
  for (let i = 0; i < 60 * 240; i++) { if (i % 120 === 0) sim._c = cmd({ steer: (r() - 0.5) * 0.3, drive: (r() - 0.3) * 40000, service: r() < 0.3 ? r() : 0 }); sim.rigStep(H, sim._c); }
  const p = sim.rigPose({}); for (const k of ['x', 'z', 'h', 'v', 'tx', 'tz', 'th']) assert.ok(Number.isFinite(p[k]), k);
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**（`rigSetTrailer is not a function`）
- [ ] **Step 3: `src/09b-rig.js` を書く**（上の Interfaces と「力学の手順」のとおり）
- [ ] **Step 4: `npm test` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: articulated rig dynamics with per-axle tyre forces`）

---

### Task 4: 窓口 `09c-truck.js` と古い物理の削除

**Files:**
- Create: `src/09c-truck.js`、`test/truck.test.mjs`
- Delete: `src/09-physics.js`
- Modify: `src/13-game.js:43-47`（`setRigTrailer` と新しい `placeTruck`）、`src/13-game.js:465-469`（`physicsAdvance` を呼ぶ）、`src/10-traffic.js:167-172`（箱の長さを諸元から）、`test/helpers/sim.mjs`（`PURE` から `09-physics.js` を外す）、`test/powertrain.test.mjs`（古い物理に依存する最後のテストを削除）

**Interfaces:**
- Consumes：`powertrainStep`、`startGear`、`rigSetTrailer rigPlace rigStep rigPose rigAxleLoads RIG RIGP`、`ROAD`。
- Produces：
  - `const TRAILERS = { van: {key:'van', name:'バン', empty:7000, L2:8.3, cgE:[5.4,1.5], cgC:[5.6,2.0], I0:108000, kI:13, rear:12.4, nose:1.2, slosh:null}, tank: {key:'tank', name:'タンク', empty:6500, L2:7.4, cgE:[4.8,1.4], cgC:[5.0,2.15], I0:80000, kI:9, rear:10.4, nose:1.0, slosh:{frac:0.35, fx:0.35, zx:0.10, lx:0.8, fy:0.55, zy:0.08, ly:0.35}} }`
  - `const TR`：Global Constraints の項目に加えて `gcw trailerKey link linkT art roll ltr slip surge assist kp tr.kx tr.kz acc`。`TR.mass` は `TR.gcw` と同じ値を入れておく。`TR.art` は連結角（連結していなければ 0）、`TR.kp` はキングピンの荷重（N、連結していなければ 0）、`TR.frontS frontLat` は後軸から `RIGP.front` 前の点。
  - `const HITCH = 0.35`、`const WB = 3.9`（`13-game.js` が使う）。
  - `steerLock(v) → rad`：`0.6 / (1 + (|v|/6.5)²)`。
  - `setRigTrailer(key | null, cargoKg)`：`TR.trailerKey`、`TR.gcw = 7600 + empty + cargoKg` を設定し、`rigSetTrailer` を呼ぶ。
  - `placeTruck(s, lat, v = 0, opts = { coupled: true, yaw: 0 })`：道路上の位置にトラクターの後軸を置く。`yaw` は道路の向きからのずれ（rad、左が正）。`TR.link` は `'coupled'` か `'free'`。変速、クルーズ、運転席の揺れ、`TR.acc` を初期化する。
  - `stepTruck(dt, inp)`、`inp = { throttle, brake, steer }`（有限でない値は 0 として扱う）。`powertrainStep` → `rigStep` → `TR` の更新（位置、道路上の位置、高さ、連結角、運転席の揺れ、燃料、走行距離、`spin`）。
  - `physicsAdvance(dt, inp) → 進めた回数`：`TR.acc += min(dt, 0.1)`、`H = 1/240` ごとに `stepTruck` を呼ぶ。最大 24 回。上限に達したら `TR.acc = 0`。
  - 値が壊れたときの備え：0.5 秒ごとに `RIG` と `TR` の写しを取る。`stepTruck` のあとで、位置か速度が有限でない、または `|TR.lat| > 200` のときは、写しに戻して `EVENTS` に `reset` を積む。
  - `10-traffic.js` の `playerBoxes()` は、連結の状態にかかわらずトレーラーの箱を返す（止めてあるトレーラーも障害物になる）。前後の長さは `TRAILERS[TR.trailerKey]` の `L2 rear nose` から求める。トレーラーがなければトラクターの箱だけ。
- `13-game.js` はこのタスクでは最小限だけ変える：`setupJob` で `setRigTrailer('van', j.mass * 1000)` を呼び、今までどおり連結した状態で置く。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep, H } from './helpers/sim.mjs';
const flat = (o, road = {}) => { const sim = loadSim(); flatRoad(sim, road); setup(sim, o); return sim; };
const full = { throttle: 1, brake: 0, steer: 0 };
const to80 = o => { const sim = flat(o); return run(sim, 120, () => full, () => kmh(sim) < 80); };
test('T14 総重量', () => {
  assert.equal(flat({ trailer: 'van', cargo: 12000 }).TR.gcw, 26600);
  assert.equal(flat({ trailer: 'tank', cargo: 19000 }).TR.gcw, 33100);
  assert.equal(flat({ trailer: null, cargo: 0 }).TR.gcw, 7600);
});
test('T1 加速：空車 < バン12t < バン22t、22t は空車の 1.5 倍以上', () => {
  const a = to80({ trailer: null, cargo: 0 }), b = to80({ cargo: 12000 }), c = to80({ cargo: 22000 });
  assert.ok(a < b && b < c && c >= 1.5 * a, `${a} ${b} ${c}`);
});
test('T2 登坂 4%', () => {
  const settle = o => { const sim = flat({ ...o, v: 60 / 3.6 }, { grade: 0.04 }); run(sim, 170, () => full); let sum = 0, n = 0; run(sim, 10, () => full, () => { sum += kmh(sim); n++; }); return sum / n; };
  assert.ok(settle({ cargo: 22000 }) <= 75); assert.ok(settle({ cargo: 12000 }) >= 80); assert.ok(settle({ trailer: null, cargo: 0 }) > 88);
});
test('T3 同じ踏み方のブレーキ', () => {
  const dist = (cargo, brake, until) => { const sim = flat({ cargo, v: 80 / 3.6 }); run(sim, 1, () => ({ throttle: 0.3, brake: 0, steer: 0 })); const z0 = sim.TR.z; run(sim, 120, () => ({ throttle: 0, brake, steer: 0 }), () => kmh(sim) > until); return sim.TR.z - z0; };
  assert.ok(dist(22000, 0.6, 0.5) >= 1.10 * dist(12000, 0.6, 0.5));
  assert.ok(dist(22000, 0.3, 40) >= 1.25 * dist(12000, 0.3, 40));
});
test('T11 実際の道路で車線を保つ（85 km/h、3 km）', () => {
  for (const o of [{ trailer: null, cargo: 0 }, { cargo: 12000 }, { cargo: 22000 }, { trailer: 'tank', cargo: 19000 }]) {
    const sim = loadSim(); setup(sim, { ...o, s: sim.S0 + 100, v: 20 }); let worst = 0;
    run(sim, 200, () => ({ throttle: kmh(sim) < 85 ? 1 : 0.2, brake: 0, steer: laneKeep(sim, -7.65) }), () => { worst = Math.max(worst, Math.abs(sim.TR.lat + 7.65)); return sim.TR.s < sim.S0 + 3100; });
    assert.ok(sim.TR.s >= sim.S0 + 3100 && worst < 0.6, `${o.trailer} ${o.cargo}: ${worst}`);
    assert.ok(!sim.EVENTS.some(e => ['rail', 'crash', 'rollover', 'jackknife', 'reset'].includes(e.t)));
  }
});
test('長すぎるフレームでも進めすぎない', () => {
  const sim = flat({ cargo: 12000, v: 10 });
  assert.equal(sim.physicsAdvance(1 / 60, full), 4);
  assert.ok(sim.physicsAdvance(5, full) <= 24);
  assert.ok(Number.isFinite(sim.TR.x) && Number.isFinite(sim.TR.v));
});
test('入力や状態が壊れても戻る', () => {
  const sim = flat({ cargo: 12000, v: 10 }); run(sim, 1, () => full);
  sim.stepTruck(H, { throttle: NaN, brake: undefined, steer: Infinity });
  assert.ok(Number.isFinite(sim.TR.v));
  sim.RIG.t.vx = NaN; sim.stepTruck(H, full);
  assert.ok(Number.isFinite(sim.TR.x) && Number.isFinite(sim.TR.v)); assert.ok(sim.EVENTS.some(e => e.t === 'reset'));
  sim.EVENTS.length = 0; run(sim, 1, () => full); sim.RIG.t.x += 5000; sim.RIG.r.x += 5000; sim.stepTruck(H, full);   // 道路から大きく外れた
  assert.ok(Math.abs(sim.TR.lat) < 50); assert.ok(sim.EVENTS.some(e => e.t === 'reset'));
});
test('ほかのファイルが使う TR の項目がある', () => {
  const T = flat({}).TR;
  for (const k of ['x', 'z', 'h', 'v', 'steer', 'yawRate', 'gear', 'nextGear', 'dir', 'rpm', 'shiftT', 'ret', 'load', 'cruise', 'cruiseV', 's', 'lat', 'idx', 'y', 'pitch', 'accel', 'latAcc', 'frontS', 'frontLat', 'odo', 'fuel', 'damage', 'spin', 'gcw', 'link', 'art']) assert.ok(k in T, k);
  for (const k of ['x', 'z', 'h', 's', 'lat', 'y', 'pitch', 'kx', 'kz']) assert.ok(k in T.tr, 'tr.' + k);
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**（`setRigTrailer is not a function`）
- [ ] **Step 3: `src/09c-truck.js` を書き、`src/09-physics.js` を削除し、`13-game.js` と `10-traffic.js` の呼び出しを直す**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: truck facade on the rig model, remove kinematic physics`）

---

### Task 5: 接触（ガードレール、柵、周りの車）

**Files:**
- Modify: `src/09b-rig.js`（壁と柵の力、力積）、`src/09c-truck.js`（損傷とイベント、`resolveCarContact`）、`src/10-traffic.js:246-268`（`collideCar` を `resolveCarContact` の呼び出しに置き換える）
- Test: `test/contact.test.mjs`

**Interfaces:**
- Produces：
  - `rigApplyImpulse(unit, px, pz, jx, jz)`：`unit` は `'t'` か `'r'`。世界座標の点に力積を加える。連結中は、次のステップの連結点の解で相手にも伝わる。
  - 壁：各車体の角（トラクターは後軸から前 `RIGP.front`・後ろ `RIGP.back`、トレーラーはキングピンから前 `spec.nose − 0.2`・後ろ `spec.rear`、それぞれ左右 `RIGP.half`）について `ROAD.project` と `ROAD.drivable` ではみ出し `pen` を求め、道路の横方向に `N = 1.5e6·min(pen, 0.5) + 1.2e5·max(0, 壁へ向かう速度)` で押し戻す。壁から離れる向きの速さが 3 m/s を超えているときは `N = 0`。摩擦は `0.4·N`。
  - 柵：車体の前端の `s` が `ROAD.barrier(s, lat)` を超えたぶんを、同じばねで後ろへ押す。
  - `stepTruck` が積むイベント：壁に触れ始めたとき `{t:'rail', hit: 壁へ向かう速さ, unit}`（同じ車体では 1.2 秒に 1 回まで）。柵に 2 m/s を超えて当たったとき `{t:'crash', hit}`。
  - 損傷：`TR.damage += 1.5 × (受けた力積 ÷ その車体の質量)`、上限 100。
  - `resolveCarContact(c, box) → hit`：`c = {s, x, v, len, wid, heavy}`、`box` は `playerBoxes()` の要素。重なっていなければ 0 を返す。重なっていれば、今の 3 つの場合分け（追突した、追突された、横）で `c` の位置と速度を直し、トラックには `rigApplyImpulse` を使う。相手の質量は普通車 1500 kg、大型 12000 kg、はね返り係数 0.1。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, H } from './helpers/sim.mjs';
const coast = { throttle: 0, brake: 0, steer: 0 };
test('T13 ガードレールに 60 km/h、5° で当たる', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000 });
  sim.placeTruck(1000, -10.2, 60 / 3.6, { coupled: true, yaw: 5 * Math.PI / 180 });   // 左のガードレールへ向ける
  let worst = 0; run(sim, 6, () => coast, () => { worst = Math.max(worst, -12.2 - (sim.TR.frontLat - 1.25), -12.2 - (sim.TR.lat - 1.25)); });
  assert.ok(worst < 0.3, `penetration ${worst}`);
  assert.ok(sim.EVENTS.some(e => e.t === 'rail' && e.unit === 't')); assert.ok(sim.TR.damage > 0);
});
test('T13 トレーラーの角もガードレールで止まる', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000, v: 15, lat: -10.8 });
  const r = sim.RIG.r; sim.rigApplyImpulse('r', r.x, r.z - 6, r.m * 2.0, 0);     // 後ろを左へ振る（+x は lat の負の向き）
  let worst = 0; run(sim, 4, () => coast, () => { worst = Math.max(worst, -12.2 - (sim.TR.tr.lat - 1.25)); });
  assert.ok(worst < 0.3); assert.ok(sim.EVENTS.some(e => e.t === 'rail' && e.unit === 'r'));
});
test('柵で止まる', () => {
  const sim = loadSim(); flatRoad(sim); sim.ROAD.barrier = () => 1100; setup(sim, { cargo: 12000, v: 10, s: 1050 });
  run(sim, 15, () => ({ throttle: 0.5, brake: 0, steer: 0 }));
  assert.ok(sim.TR.frontS < 1100.3 && Math.abs(sim.TR.v) < 0.5); assert.ok(sim.EVENTS.some(e => e.t === 'crash'));
});
test('大きくはみ出した位置に置いても力が暴れない', () => {
  const sim = loadSim(); flatRoad(sim, { walls: true }); setup(sim, { cargo: 12000, lat: -40 });
  let prev = sim.TR.lat, fastest = 0; run(sim, 2, () => coast, () => { fastest = Math.max(fastest, Math.abs(sim.TR.lat - prev) / H); prev = sim.TR.lat; });
  assert.ok(Number.isFinite(sim.TR.x) && fastest < 6, `lateral speed ${fastest}`);
});
test('追突：重いトラックはほとんど減速しない', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 20 });
  const c = { s: sim.TR.s + 5.5 + 2.4 - 0.1, x: -7.65, v: 10, len: 4.8, wid: 1.8, heavy: false };
  const hit = sim.resolveCarContact(c, { s0: sim.TR.s - 1.1, s1: sim.TR.s + 5.5, lat: sim.TR.lat, tractor: true });
  sim.stepTruck(H, coast);
  assert.ok(hit > 0 && c.v > 10); assert.ok(20 - sim.TR.v > 0.3 && 20 - sim.TR.v < 0.8, `dv ${20 - sim.TR.v}`);
});
test('重なっていなければ何もしない', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 20 });
  const c = { s: sim.TR.s + 60, x: -7.65, v: 10, len: 4.8, wid: 1.8, heavy: false };
  assert.equal(sim.resolveCarContact(c, { s0: sim.TR.s - 1.1, s1: sim.TR.s + 5.5, lat: sim.TR.lat, tractor: true }), 0); assert.equal(c.v, 10);
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**
- [ ] **Step 3: 壁と柵の力、`rigApplyImpulse`、損傷とイベント、`resolveCarContact` を実装し、`10-traffic.js` の `collideCar` を置き換える**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: guardrail, barrier and traffic contacts as forces on the rig`）

---

### Task 6: ロック・空転と安定装置

**Files:**
- Modify: `src/09b-rig.js`（タイヤの上限超過、ABS、空転防止、横滑り防止、舵角の上限）、`src/09c-truck.js`（舵角の上限を使う、`TR.assist`、`TR.slip`、`assist` イベント）
- Test: `test/assist.test.mjs`

**Interfaces:**
- Produces：
  - タイヤの上限超過（`RIG.assistOn` が偽のとき）
    - ブレーキ側で `|Fxd| > Fmax`：ロック。力は `−0.8·Fmax·(uw, vw)/|(uw, vw)|`。`axle[i].lock = true`。
    - 駆動側で `|Fxd| > Fmax`：空転。`Fx = ±0.7·Fmax`、横力の上限は `0.3·Fmax`。`axle[i].spin = true`。
  - `RIG.assistOn` が真のとき
    - ABS：各軸のブレーキ側の要求を `0.85·Fmax` までにする。切り詰めたら `assist.abs = true`。
    - 空転防止：駆動の要求を `0.9·Fmax` までにする。切り詰めたら `assist.tcs = true`。
    - 横滑り防止：`|u| > 5` で、`|w − wref| > 0.06`（`wref = −u·tan(steer)/L1`、大きさは `MU·g/|u|` まで）か、`|art − L2·wref/u| > 0.105` でその差が広がっているときに働く。駆動を 0 にし、トラクターにモーメント `clamp(−6·I1·(w − wref), ±0.3·MU·(FzF + FzR)·track/2)` を加え、トレーラーのブレーキ要求に `1.5·m2` N を足す。条件が消えてから 0.5 秒は続ける。`assist.esc = true`。
  - `rigSteerLimit(u) → rad`：`assistOn` のとき `atan(0.8·min(aRoll, MU·g)·L1/u²)`、`aRoll = 0.8·g·(track/2)/重心の高さ`（連結中はトレーラーの `h2`、それ以外は `h1`）。`assistOn` でないときは `Infinity`。
  - `stepTruck`：舵角の目標を `clamp(inp.steer·steerLock(v), ±rigSteerLimit(v))` にする。`TR.assist` に `RIG.assist` を写し、作動し始めた種類ごとに `{t:'assist', kind}` を積む。`TR.slip = 各軸の max(ロックか空転なら 1、それ以外は clamp((|alpha| − 0.06)/0.12, 0, 1))`。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, steerForLatAcc } from './helpers/sim.mjs';
const flat = o => { const sim = loadSim(); flatRoad(sim); setup(sim, o); return sim; };
const brakeFull = { throttle: 0, brake: 1, steer: 0 };
test('T4 全制動（装置オン）は 75 m 以内でまっすぐ止まる', () => {
  for (const o of [{ trailer: null, cargo: 0 }, { cargo: 12000 }, { cargo: 22000 }, { trailer: 'tank', cargo: 19000 }]) {
    const sim = flat({ ...o, v: 80 / 3.6 }); const z0 = sim.TR.z; let art = 0;
    run(sim, 20, () => brakeFull, () => { art = Math.max(art, Math.abs(sim.TR.art)); return sim.TR.v > 0.05; });
    assert.ok(sim.TR.z - z0 < 75, `${o.trailer} ${o.cargo}: ${sim.TR.z - z0} m`);
    assert.ok(Math.abs(sim.TR.lat + 7.65) < 0.3 && art < 3 * Math.PI / 180);
  }
});
test('T5 空車：装置オフでは後軸がロックし、発進で空転する。オンでは起きない', () => {
  const seen = (assist, inp, v) => { const sim = flat({ trailer: null, cargo: 0, v, assist }); let lock = false, spin = false; run(sim, 3, () => inp, () => { lock ||= sim.RIG.axle[1].lock; spin ||= sim.RIG.axle[1].spin; }); return { lock, spin }; };
  assert.equal(seen(false, brakeFull, 80 / 3.6).lock, true); assert.equal(seen(true, brakeFull, 80 / 3.6).lock, false);
  assert.equal(seen(false, { throttle: 1, brake: 0, steer: 0 }, 0).spin, true); assert.equal(seen(true, { throttle: 1, brake: 0, steer: 0 }, 0).spin, false);
});
test('T6 車線変更の途中で全制動：オフはジャックナイフ、オンは立て直す', () => {
  const go = assist => { const sim = flat({ cargo: 12000, v: 80 / 3.6, assist }); const st = steerForLatAcc(sim, 0.3); let art = 0;
    run(sim, 1, () => ({ throttle: 0.4, brake: 0, steer: st }));
    run(sim, 6, () => ({ throttle: 0, brake: 1, steer: st }), () => { art = Math.max(art, Math.abs(sim.TR.art)); });
    return { art: art * 180 / Math.PI, v: sim.TR.v }; };
  const off = go(false), on = go(true);
  assert.ok(off.art > 40, `off ${off.art}`); assert.ok(on.art < 15 && Math.abs(on.v) < 0.1, `on ${on.art}`);
});
test('切りすぎ防止：装置オンでは舵角が横転の限界の 80% までに抑えられる', () => {
  const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist: true });
  run(sim, 2, () => ({ throttle: 0.5, brake: 0, steer: 1 }));
  const v = sim.TR.v, ay = v * v * Math.tan(Math.abs(sim.TR.steer)) / 3.9;
  assert.ok(ay <= 0.8 * 0.8 * 9.81 * (2.05 / 2) / sim.RIG.h2 + 0.05, `ay ${ay}`);
});
test('装置の作動は通知される', () => {
  const sim = flat({ trailer: null, cargo: 0, v: 80 / 3.6, assist: true }); run(sim, 1, () => brakeFull);
  assert.ok(sim.EVENTS.some(e => e.t === 'assist' && e.kind === 'abs')); assert.equal(sim.TR.assist.abs, true);
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test`（Task 1〜6 の全テスト）と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: wheel lock and spin, ABS, traction and stability control`）

---

### Task 7: 傾き・横転・液体の揺れ・事故の戻し

**Files:**
- Modify: `src/09b-rig.js`（傾き、LTR、横転防止、液体、連結角の止め）、`src/09c-truck.js`（`TR.roll ltr surge`、`rollover`／`jackknife` イベント、`towReset`）
- Test: `test/roll-slosh.test.mjs`

**Interfaces:**
- Produces：
  - 傾き：対象は連結中ならトレーラー、そうでなければトラクター。横加速度 `ay` は、その車体の重心の加速度の右方向成分を 5 Hz でならしたもの。`rollV += ((2π·1.0)²·(0.0255·ay − roll) − 2·0.4·(2π·1.0)·rollV)·h`。
  - `RIG.ltr = 2·hcg·(ay + g·roll)/(track·g) + 2·(ms·slosh.y/m2)/track`。`|ltr| ≥ 1` が 0.35 秒続いたら `RIG.rolled = true`。
  - 横転防止（`assistOn`）：`|ltr| > 0.6` で入り、`< 0.5` で切れる。駆動を 0 にし、各軸のブレーキ要求に `2.0·Fz/g` を足す。`assist.rsc = true`。
  - 液体（`spec.slosh` があるとき）：揺れる質量 `ms = frac·cargo`、剛体の質量は `m2 − ms`。前後 `slosh.x`：`vx += (−axTank − ωx²·x − 2·zx·ωx·vx)·h`、`ωx = 2π·fx`、範囲 `±lx`。左右も同じ形で `fy zy ly` と横加速度を使う。タンクにかかる力は前後 `ms·(ωx²·x + 2·zx·ωx·vx)`、左右も同様で、トレーラーの重心に加える。範囲の端では外向きの速度を 0 にする。`RIG.surge = 前後の力 / (m2·g)`。`cmd.hold` の間も液体と傾きは進める。
  - 連結角の止め：`|art| > RIGP.artMax` になったら、トレーラーの向きを `artMax` に戻して連結点を合わせ直し、相対の回転を止める。そのとき `|u| > 2.8`（10 km/h）なら `RIG.jack = true`。
  - `stepTruck`：`RIG.rolled` で `{t:'rollover'}`、`RIG.jack` で `{t:'jackknife'}` を 1 回だけ積む。`TR.roll`、`TR.ltr`、`TR.surge` を写す。運転席の前後の揺れの目標に `TR.surge·0.25` rad を足す。
  - `towReset()`：今の `TR.s` で、ランプ上（`ROAD.rampAt(TR.s)` があり `TR.lat < −13.4`）ならランプの車線の中央、そうでなければ `lat = −10.75` に、速度 0、まっすぐ、連結した状態で置き直す（トレーラーを牽いていた場合）。`rolled`、`jack` を消す。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, kmh, laneKeep, steerForLatAcc, H } from './helpers/sim.mjs';
const flat = o => { const sim = loadSim(); flatRoad(sim); setup(sim, o); return sim; };
const has = (sim, t) => sim.EVENTS.some(e => e.t === t);
test('T7 タンクは止まったあと液体が前後に揺れる。バンは揺れない', () => {
  const after = trailer => { const sim = flat({ trailer, cargo: 19000, v: 60 / 3.6 });
    run(sim, 60, () => ({ throttle: 0, brake: 0.5, steer: 0 }), () => sim.TR.v > 0.02);
    let flips = 0, peak = 0, prev = Math.sign(sim.TR.surge);
    run(sim, 6, () => ({ throttle: 0, brake: 0.5, steer: 0 }), () => { const s = Math.sign(sim.TR.surge); if (s && prev && s !== prev) flips++; if (s) prev = s; peak = Math.max(peak, Math.abs(sim.TR.surge)); });
    return { flips, peak }; };
  const tank = after('tank'), van = after('van');
  assert.ok(tank.flips >= 2 && tank.peak >= 0.03, JSON.stringify(tank)); assert.equal(van.peak, 0);
});
test('T8 タンク 80 km/h で 0.5 g の舵角を 3 秒：オフは横転、オンは横転しない', () => {
  const go = assist => { const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist }); const st = steerForLatAcc(sim, 0.5);
    run(sim, 3, () => ({ throttle: 0.6, brake: 0, steer: st })); run(sim, 3, () => ({ throttle: 0, brake: 0, steer: 0 })); return has(sim, 'rollover'); };
  assert.equal(go(false), true); assert.equal(go(true), false);
});
test('横転の境目：バン22t は 0.30 g では起きず、0.55 g では起きる', () => {
  const go = g => { const sim = flat({ cargo: 22000, v: 80 / 3.6, assist: false }); const st = steerForLatAcc(sim, g); run(sim, 5, () => ({ throttle: 0.6, brake: 0, steer: st })); return has(sim, 'rollover'); };
  assert.equal(go(0.30), false); assert.equal(go(0.55), true);
});
test('低速のバックで折れ曲がっても 80° で止まり、事故にはならない', () => {
  const sim = flat({ cargo: 12000, assist: false }); sim.TR.dir = -1; let worst = 0;
  run(sim, 40, () => ({ throttle: sim.TR.v > -0.8 ? 0.3 : 0, brake: 0, steer: 1 }), () => { worst = Math.max(worst, Math.abs(sim.TR.art)); });
  assert.ok(worst > 1.2 && worst <= 1.396 + 0.01, `art ${worst}`); assert.equal(has(sim, 'jackknife'), false); assert.equal(has(sim, 'reset'), false);
});
test('towReset はまっすぐ連結した状態で路肩に戻す', () => {
  const sim = flat({ trailer: 'tank', cargo: 19000, v: 80 / 3.6, assist: false }); const st = steerForLatAcc(sim, 0.5);
  run(sim, 3, () => ({ throttle: 0.6, brake: 0, steer: st })); sim.towReset();
  assert.equal(sim.TR.link, 'coupled'); assert.equal(sim.TR.v, 0); assert.ok(Math.abs(sim.TR.art) < 1e-6 && Math.abs(sim.TR.lat + 10.75) < 0.01);
  assert.equal(sim.RIG.rolled, false); assert.equal(sim.TR.roll, 0); assert.equal(sim.RIG.slosh.x, 0);
});
test('T12 乱数の入力 10 分（装置オンとオフ）で値が壊れず、連結点も離れない', () => {
  for (const assist of [true, false]) {
    const sim = loadSim(); setup(sim, { trailer: 'tank', cargo: 19000, s: sim.S0 + 100, v: 15, assist }); const r = sim.rng(assist ? 11 : 12);
    let inp = { throttle: 0.5, brake: 0, steer: 0 }, worst = 0, reset = false;
    run(sim, 600, t => { if (Math.round(t / H) % 360 === 0) inp = { throttle: r(), brake: r() < 0.25 ? r() : 0, steer: sim.clamp(laneKeep(sim, -7.65) + (r() - 0.5) * 0.8, -1, 1) }; return inp; },
      () => { worst = Math.max(worst, sim.RIG.gap); reset ||= has(sim, 'reset'); if (has(sim, 'rollover') || has(sim, 'jackknife')) sim.towReset(); sim.EVENTS.length = 0; });
    assert.ok(worst < 0.03, `gap ${worst}`); assert.equal(reset, false);
    for (const k of ['x', 'z', 'h', 'v', 's', 'lat', 'art', 'roll', 'ltr']) assert.ok(Number.isFinite(sim.TR[k]), k);
  }
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: roll and rollover, tanker slosh, articulation stop, tow reset`）

---

### Task 8: 連結と切り離し

**Files:**
- Modify: `src/09b-rig.js`（止めてあるトレーラーを障害物として扱う）、`src/09c-truck.js`（連結の状態）
- Test: `test/coupling.test.mjs`

**Interfaces:**
- Produces：
  - `TR.link`：`'free' | 'locking' | 'coupled' | 'unlocking'`。`TR.linkT` は作業の残り秒（2.0 から減る）。
  - `parkTrailer(s, lat)`：キングピンを道路上の位置に、道路の向きで置く。`TR.link = 'free'`。`TR.tr.kx kz` と `TR.tr.x z h s lat` を更新する。
  - `stepTruck` の中の連結の判定（`link === 'free'` で、牽くトレーラーが設定されているとき）：第五輪の位置をトレーラーの座標で `dl`（前後、前が正）、`dy`（横）、向きの差 `dpsi` として求める。`dl` が正から 0 以下に変わり、`|dy| < 1.6` のとき
    - `|dy| ≤ 0.20`、`|dpsi| ≤ 10°`、近づく速さ `≤ 1.5 m/s`：トラクターの速度を 0 にし、`link = 'locking'`、`linkT = 2.0`、`{t:'couple-lock'}`。
    - 速さが `> 1.5 m/s`：速度を 0 にし、`dl = +0.05` の位置へ戻す。`TR.damage += 2`、`{t:'couple-miss', why:'fast'}`。
    - それ以外：速度を 0 にし、`dl = +0.05` の位置へ戻す。`{t:'couple-miss', why:'offset'}`。
  - `locking` と `unlocking` の間は車両を保持する（`cmd.hold`）。`locking` が終わると、トレーラーをまっすぐ連結した位置に合わせて `link = 'coupled'`、`{t:'coupled'}`。`unlocking` が終わると `rigParkTrailer` して `link = 'free'`、`{t:'uncoupled'}`。
  - `requestUncouple() → boolean`：`coupled` で `|TR.v| < 0.1` なら `unlocking` に入り `{t:'uncouple-start'}`。動いていれば `{t:'uncouple-refused'}` を積んで `false`。
  - `canAutoCouple() → boolean`：`free`、牽くトレーラーがある、`|TR.v| < 0.1`、第五輪とキングピンの距離が 40 m 以内。
  - `requestCouple() → boolean`：`canAutoCouple()` なら、第五輪がキングピンに重なり、向きがトレーラーと同じになる位置にトラクターを置き、`locking` に入り `{t:'couple-lock'}`。
  - 止めてあるトレーラーの箱（キングピンから後ろ 1.5 m 〜 `spec.rear`、左右 `RIGP.half`）にトラクターの角が入ったら、壁と同じばねで浅い方向へ押し出す。
  - `placeTruck` は `link`、`linkT`、`RIG` の `brakeP roll rollV ltr ltrT slosh surge assist rolled jack` をすべて初期値に戻す。`{ coupled: false }` で置くときは、止めてあるトレーラーを動かさない。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, flatRoad, setup, run, H } from './helpers/sim.mjs';
// トレーラーのキングピンを s=1000 に置き、トラクターの第五輪をその gap m 前、横に off m ずらして置く
const yard = (gap = 12, off = 0) => { const sim = loadSim(); flatRoad(sim); sim.setRigTrailer('van', 12000); sim.parkTrailer(1000, -10.75);
  sim.placeTruck(1000 + gap - 0.35, -10.75 + off, 0, { coupled: false }); sim.TR.dir = -1; sim.EVENTS.length = 0; return sim; };
const has = (sim, t, why) => sim.EVENTS.some(e => e.t === t && (!why || e.why === why));
const back = (sim, kmhTarget) => () => ({ throttle: -sim.TR.v * 3.6 < kmhTarget ? 0.25 : 0, brake: 0, steer: 0 });
test('T9 まっすぐ 3 km/h でバックするとロックし、2 秒後に連結済みになる', () => {
  const sim = yard(); run(sim, 60, back(sim, 3), () => sim.TR.link === 'free');
  assert.equal(sim.TR.link, 'locking'); assert.ok(has(sim, 'couple-lock')); assert.equal(sim.TR.v, 0);
  run(sim, 1.9, back(sim, 3)); assert.equal(sim.TR.link, 'locking');
  run(sim, 0.2, back(sim, 3)); assert.equal(sim.TR.link, 'coupled'); assert.ok(has(sim, 'coupled'));
  assert.ok(Math.abs(sim.TR.art) < 0.02 && sim.RIG.gap < 0.03);
});
test('T9 横に 0.5 m ずれていると連結しない', () => {
  const sim = yard(12, 0.5); run(sim, 60, back(sim, 3), () => !has(sim, 'couple-miss'));
  assert.ok(has(sim, 'couple-miss', 'offset')); assert.equal(sim.TR.link, 'free'); assert.equal(sim.TR.v, 0);
});
test('T9 8 km/h では速すぎて連結しない', () => {
  const sim = yard(30); run(sim, 60, back(sim, 8), () => !has(sim, 'couple-miss'));
  assert.ok(has(sim, 'couple-miss', 'fast')); assert.equal(sim.TR.link, 'free'); assert.ok(sim.TR.damage >= 2);
});
test('T9 走行中の切り離しは拒否、停止中は 2 秒で完了してトレーラーが残る', () => {
  const sim = loadSim(); flatRoad(sim); setup(sim, { cargo: 12000, v: 10 });
  assert.equal(sim.requestUncouple(), false); assert.ok(has(sim, 'uncouple-refused')); assert.equal(sim.TR.link, 'coupled');
  run(sim, 30, () => ({ throttle: 0, brake: 1, steer: 0 }), () => sim.TR.v > 0.01);
  assert.equal(sim.requestUncouple(), true); assert.equal(sim.TR.link, 'unlocking');
  run(sim, 2.1, () => ({ throttle: 1, brake: 0, steer: 0 })); assert.equal(sim.TR.link, 'free'); assert.ok(has(sim, 'uncoupled'));
  const k = { x: sim.TR.tr.kx, z: sim.TR.tr.kz }; run(sim, 5, () => ({ throttle: 1, brake: 0, steer: 0 }));
  assert.deepEqual({ x: sim.TR.tr.kx, z: sim.TR.tr.kz }, k); assert.ok(sim.TR.v > 3);
});
test('自動連結は、止まっていて 40 m 以内のときだけできる', () => {
  let sim = yard(30); assert.equal(sim.canAutoCouple(), true); assert.equal(sim.requestCouple(), true); assert.equal(sim.TR.link, 'locking');
  run(sim, 2.1, () => ({ throttle: 0, brake: 0, steer: 0 })); assert.equal(sim.TR.link, 'coupled');
  sim = yard(60); assert.equal(sim.canAutoCouple(), false); assert.equal(sim.requestCouple(), false);
});
test('止めてあるトレーラーの後ろ半分には入り込めない', () => {
  const sim = loadSim(); flatRoad(sim); sim.setRigTrailer('van', 12000); sim.parkTrailer(1000, -10.75);
  sim.placeTruck(1000 - 30, -10.75, 0, { coupled: false });           // 真後ろから前進してぶつける
  run(sim, 20, () => ({ throttle: 0.4, brake: 0, steer: 0 }));
  assert.ok(sim.TR.frontS < 1000 - 12.4 + 0.4, `front ${sim.TR.frontS}`);
});
test('作業の途中や事故のあとに置き直すと、状態が残らない', () => {
  const sim = yard(30); sim.requestCouple(); run(sim, 0.5, () => ({ throttle: 0, brake: 0, steer: 0 }));
  sim.RIG.rolled = true; sim.RIG.roll = 0.2; sim.RIG.slosh.x = 0.5; sim.RIG.brakeP[2] = 1; sim.RIG.assist.esc = true;
  sim.placeTruck(2000, -7.65, 0, { coupled: true });
  assert.equal(sim.TR.link, 'coupled'); assert.equal(sim.TR.linkT, 0);
  assert.deepEqual([sim.RIG.rolled, sim.RIG.roll, sim.RIG.slosh.x, sim.RIG.brakeP[2], sim.RIG.assist.esc], [false, 0, 0, 0, false]);
});
```

- [ ] **Step 2: `npm test` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: コミット**（メッセージ `feat: trailer coupling and uncoupling`）

---

### Task 9: 仕事の流れと操作

**Files:**
- Modify: `src/13-game.js:19-61`（仕事の表、出発の配置、仕事のカード）、`:93-130`（操作）、`:132-200`（納品の判定、事故、メッセージ）、`:248-290`（メニューの設定）、`:456-470`（`physicsAdvance`）、`:521-541`（保存と復元）、`src/12-input.js:18,80`（`T` キーとボタン）、`src/page.html:130-137`（ボタン）、`:254-294`（メニュー）、`src/05-world.js:550-633`（納品の枠の路面と標識）
- Test: `test/e2e/delivery.e2e.mjs`

**Interfaces:**
- Consumes：`setRigTrailer placeTruck parkTrailer requestCouple requestUncouple canAutoCouple towReset physicsAdvance TR RIG EVENTS`、`r.sZone0 r.sZone1`。
- Produces：
  - 仕事の表：

    ```js
    const JOBS = [
      { from: 0, to: 4, cargo: '精密機器', trailer: 'van', mass: 12 },
      { from: 4, to: 7, cargo: '牛乳', trailer: 'tank', mass: 19 },
      { from: 7, to: 9, cargo: '飲料', trailer: 'van', mass: 22 },
      { from: 9, to: 12, cargo: '楽器（ピアノ）', trailer: 'van', mass: 9 },
    ];
    ```

  - `setupJob`：`setRigTrailer(j.trailer, j.mass * 1000)`。キングピンを `sK = (j.from === 0 ? S0 + 40 : ICS[j.from].s + 450)`、`lat = −10.75` に `parkTrailer`。トラクターは `placeTruck(sK + 12 − 0.35, −10.75, 0, { coupled: false })`。ハザードは点ける。
  - 仕事のカード：`#jCargo` は「精密機器（バン）」、`#jMass` は「12 t／総重量 26.6 t」。
  - 操作 `'couple'`（`T` キー、`#bCouple`）：`coupled` なら `requestUncouple()`、`free` なら `requestCouple()`（できないときは「トレーラーの 40 m 以内で止まってから押してください」）。
  - `#bCouple` の表示：`coupled` は「切り離し」、`free` で `canAutoCouple()` は「自動連結」、それ以外は隠す。
  - メッセージ（`led`）：出発時「後ろのトレーラーにバックして連結してください（T で自動連結）」、`couple-lock`「ロックしました。ホースを接続中…」、`coupled`「連結完了　総重量 26.6 t」、`couple-miss` は設計書の 2 つの文言、`uncouple-start`「切り離し中…」、`uncouple-refused` は設計書の文言、`rollover`「横転しました。レッカー移動 ¥30,000」、`jackknife`「ジャックナイフ。レッカー移動 ¥20,000」、`assist` の `esc`「横滑り防止 作動」と `rsc`「横転の危険！減速します」（同じ種類は 4 秒に 1 回まで）、`reset`「車両の位置を戻しました」。
  - 納品：`uncoupled` のとき、`rampAt(TR.tr.s)` が目的地のランプで、`TR.tr.lat < −13.4`、`r.sZone0 ≤ TR.tr.s ≤ r.sZone1` なら `completeJob()`。目的地のランプ上で枠の外なら「納品の枠の中で切り離してください」。それ以外は「切り離しました」。料金所を通過した時点での完了（今の 167 行）はやめ、目的地でない出口の扱いだけ残す。
  - 置き忘れ：`free` で、トラクターがキングピンより 150 m 以上先にいるとき、条件を満たして 2 秒後に 1 回、そのあとは 30 秒ごとに「トレーラーを置いたままです。メニューからやり直せます」。
  - 事故：`rollover` は損傷 +25 と違反金 ¥30,000、`jackknife` は損傷 +15 と違反金 ¥20,000 を足して `towReset()`。
  - 設定：`GAME.assist`（`lsGet('nlh.assist', true)`）を `RIG.assistOn` に入れる。メニューに `#assistSeg`（「オン」「オフ」、`data-v="on|off"`）。
  - フレーム：`physicsAdvance(dt, inp)` を呼ぶ。
  - ホットリロードの保存に `link`、`kx`、`kz`、`kh`（トレーラーの向き）を足し、復元で `parkTrailer` 相当の配置をする。
  - 納品の枠（`05-world.js`）：ランプの車線上、`sZone0`〜`sZone1` に黄色の枠線と斜線の路面、枠の手前に「納品」の標識（緑の標識の作り方を流用）。

- [ ] **Step 1: 失敗するブラウザのテスト `test/e2e/delivery.e2e.mjs` を書く**

`test/e2e/helpers.mjs` に `startJob(page)`（開始ボタンを押し、`GAME.state === 'drive'` かつ `GAME.engineOn` になるまで待つ）と `led(page)`（`#ledText` の文字を返す）を足す。運転は `page.evaluate` の中で `stepTruck` を直接回して進める。

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { openGame, startJob, led } from './helpers.mjs';
test('自動連結 → 御殿場 → 納品の枠で切り離すと結果が出る', async () => {
  const { browser, page, errors } = await openGame(); await startJob(page);
  assert.equal(await page.evaluate(() => TR.link), 'free');
  await page.keyboard.press('KeyT');
  await page.waitForFunction(() => TR.link === 'coupled', null, { timeout: 8000 });
  const r = await page.evaluate(() => {
    const d = destRamp(); placeTruck(d.sGate + 30, -40, 4, { coupled: true }); d.gateState = 'open'; d.passed = true;
    const inp = () => ({ throttle: TR.s < d.sZone0 + 14 && TR.v < 3 ? 0.3 : 0, brake: TR.s >= d.sZone0 + 14 ? 0.8 : 0, steer: 0 });
    for (let i = 0; i < 240 * 60 && !(TR.s >= d.sZone0 + 14 && Math.abs(TR.v) < 0.05); i++) stepTruck(1 / 240, inp());
    return { inZone: TR.tr.s >= d.sZone0 && TR.tr.s <= d.sZone1, ok: requestUncouple() };
  });
  assert.deepEqual(r, { inZone: true, ok: true });
  await page.waitForFunction(() => GAME.state === 'result', null, { timeout: 8000 });
  assert.equal(await page.isVisible('#resultOv'), true); await browser.close(); assert.deepEqual(errors, []);
});
test('手動の連結：バックして合わせると連結できる', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  await page.evaluate(() => { TR.dir = -1; for (let i = 0; i < 240 * 60 && TR.link === 'free'; i++) stepTruck(1 / 240, { throttle: -TR.v * 3.6 < 3 ? 0.25 : 0, brake: 0, steer: 0 }); });
  assert.equal(await page.evaluate(() => TR.link), 'locking'); assert.match(await led(page), /ロックしました/); await browser.close();
});
test('仕事 2 はタンクトレーラーで、総重量は 33.1 t', async () => {
  const { browser, page } = await openGame();
  const r = await page.evaluate(() => { GAME.jobIdx = 1; setupJob(1); return { key: TR.trailerKey, gcw: TR.gcw, text: document.getElementById('jMass').textContent }; });
  assert.equal(r.key, 'tank'); assert.equal(r.gcw, 33100); assert.match(r.text, /総重量 33\.1 t/); await browser.close();
});
test('目的地で枠の外に切り離すと、理由が表示される', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  await page.evaluate(() => { const d = destRamp(); placeTruck(d.sGate + 30, -40, 0, { coupled: true }); requestUncouple(); });
  await page.waitForFunction(() => TR.link === 'free', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => GAME.state), 'drive'); assert.match(await led(page), /納品の枠の中で切り離してください/); await browser.close();
});
test('トレーラーを置いたまま走り去ると知らせる。やり直しで元に戻る', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  await page.evaluate(() => { placeTruck(TR.s + 200, -7.65, 10, { coupled: false }); });
  await page.waitForFunction(() => /トレーラーを置いたまま/.test(document.getElementById('ledText').textContent), null, { timeout: 8000 });
  await page.keyboard.press('Escape'); await page.click('#restartBtn');
  await page.waitForFunction(() => GAME.state === 'drive' && TR.link === 'free' && canAutoCouple(), null, { timeout: 30000 }); await browser.close();
});
test('安定装置の設定は RIG に伝わり、保存される', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  await page.keyboard.press('Escape'); await page.click('#assistSeg [data-v="off"]');
  assert.equal(await page.evaluate(() => RIG.assistOn), false);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('nlh.assist'))), false); await browser.close();
});
test('スマホの横向きと縦向きで、連結のボタンが画面内にある', async () => {
  for (const [width, height] of [[844, 390], [390, 844]]) {
    const { browser, page } = await openGame({ width, height, touch: true }); await startJob(page);
    const b = await page.locator('#bCouple').boundingBox();
    assert.ok(b && b.x >= 0 && b.y >= 0 && b.x + b.width <= width && b.y + b.height <= height, `${width}x${height}`);
    assert.equal(await page.textContent('#bCouple'), '自動連結'); await browser.close();
  }
});
```

- [ ] **Step 2: `npm run e2e` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**（`13-game.js`、`12-input.js`、`page.html`、`05-world.js`）
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: 画像で確認する**（`placeTruck(destRamp().sGate + 20, -40, 0)` のあと、外からの視点で画面を撮り、枠線と「納品」の標識が見えること。スマホの横向きと縦向きの画面を撮り、ボタンの列が目的地の表示やメッセージと重ならないこと）
- [ ] **Step 6: コミット**（メッセージ `feat: coupling and delivery bay in the job flow, stability setting`）

---

### Task 10: メーター・ナビ・音

**Files:**
- Modify: `src/08-dash.js:61-95`（メーター）、`:97-155`（ナビ）、`src/11-audio.js`（音）、`src/13-game.js`（`clusterState`、`navState`、イベントで音を鳴らす、`audioUpdate` に `slip` を渡す）
- Test: `test/e2e/dash.e2e.mjs`

**Interfaces:**
- Produces：
  - `clusterState() → st`（`13-game.js`）：今 `frame` の中で組み立てている値に `gcwText`（`'総重量 26.6 t'`）、`link`、`lamps: { abs, esc, tcs }`（それぞれ `'off' | 'on' | 'flash'`。設定がオフなら `'on'`、作動中は `'flash'`）を足して返す。`frame` はこれを `drawCluster` に渡す。
  - `drawCluster(st)`：中央の表示に `st.gcwText` と連結の状態（連結済みはトレーラーの記号、切り離し済みは「トレーラーなし」）。下段に ABS、ESC、TCS のランプ。
  - `navState()` に `trailer: { x, z } | null`（`free` のときのキングピンの位置）。`drawNav` はそこに橙色の四角と「トレーラー」の文字を描く。
  - 音：`sfxClunk()`（連結）、`sfxHiss(sec)`（エア）、`sfxWarn()`（横転の危険）。`audioUpdate(st)` は `st.slip`（0〜1）でタイヤの鳴く音の音量を変える（`initAudio` で帯域通過のノイズを 1 本足す）。
  - イベントと音：`couple-lock` で `sfxClunk` と `sfxHiss(1.6)`、`uncouple-start` で `sfxHiss(1.2)`、`uncoupled` で `sfxClunk`、`assist` の `rsc` で `sfxWarn`。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { openGame, startJob } from './helpers.mjs';
test('メーターに総重量、連結の状態、装置のランプが出る', async () => {
  const { browser, page, errors } = await openGame(); await startJob(page);
  let st = await page.evaluate(() => clusterState());
  assert.equal(st.link, 'free'); assert.deepEqual(st.lamps, { abs: 'off', esc: 'off', tcs: 'off' });
  st = await page.evaluate(() => { placeTruck(TR.s + 300, -7.65, 22, { coupled: true }); for (let i = 0; i < 120; i++) stepTruck(1 / 240, { throttle: 0, brake: 1, steer: 0 }); return clusterState(); });
  assert.equal(st.gcwText, '総重量 26.6 t'); assert.equal(st.link, 'coupled'); assert.equal(st.lamps.abs, 'flash');
  st = await page.evaluate(() => { RIG.assistOn = false; GAME.assist = false; return clusterState(); });
  assert.deepEqual(st.lamps, { abs: 'on', esc: 'on', tcs: 'on' });
  await page.evaluate(() => { drawCluster(clusterState()); drawNav(navState()); });
  await browser.close(); assert.deepEqual(errors, []);
});
test('ナビは切り離し中にトレーラーの位置を持つ', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  const n = await page.evaluate(() => navState().trailer); assert.ok(n && Number.isFinite(n.x) && Number.isFinite(n.z));
  await page.keyboard.press('KeyT'); await page.waitForFunction(() => TR.link === 'coupled', null, { timeout: 8000 });
  assert.equal(await page.evaluate(() => navState().trailer), null); await browser.close();
});
test('音の関数は、音を始める前に呼んでも落ちない', async () => {
  const { browser, page, errors } = await openGame();
  await page.evaluate(() => { sfxClunk(); sfxHiss(1); sfxWarn(); audioUpdate({ rpm: 800, load: 0, v: 0, ret: 0, inCab: true, running: true, tunnel: false, slip: 1 }); });
  await browser.close(); assert.deepEqual(errors, []);
});
```

- [ ] **Step 2: `npm run e2e` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: メーターとナビを画像で確認する**（運転席の視点で、連結前、連結後、全制動中の 3 枚。総重量とランプが読めること）
- [ ] **Step 6: コミット**（メッセージ `feat: gross weight, coupling state and assist lamps on the dash, new sounds`）

---

### Task 11: トレーラーの見た目

**Files:**
- Modify: `src/06-truck.js:260-477`（カールコードを組にする）、`:478-526`（バンに脚と車体の組を足す）、末尾（`buildTankTrailer`）、`src/13-game.js:4-10`（モデルの表）、`:333-381`（`updateVisuals`）
- Test: `test/e2e/trailer-visual.e2e.mjs`

**Interfaces:**
- Produces：
  - `buildTrailer()` と `buildTankTrailer()` はどちらも `{ root, body, legs, blinkL, blinkR, tail, rev, spin }` を返す。`root` の原点はキングピンの真下の地面。`body` は傾く部分（車体）、車軸と車輪は `root` の直下。`legs` は脚の組で、`legs.position.y = 0` が接地、`0.45` が上げた位置。
  - タンク：だ円断面（幅 2.45 m、高さ 1.9 m）で長さ 10.2 m のアルミのタンク、台枠、車軸は `z = 6.1, 7.4, 8.7`、右側にはしご、上に通路とマンホール 3 個、後ろにバルブ箱、泥よけ、後部反射板、側方灯、後ろの灯火。会社の表示は入れない。
  - `buildTractor()` の戻り値に `coil`（つないだカールコードの組）と `coilStowed`（たたんだコードの組）を足す。
  - `13-game.js`：`const TRAILER_MODELS = { van: buildTrailer(), tank: buildTankTrailer() }`、`let TRL`。`setupJob` で `TRL = TRAILER_MODELS[TR.trailerKey]` にし、ほかは `root.visible = false`。
  - `updateVisuals`：
    - `TRL.root` の位置は、連結中（`coupled`、`locking`、`unlocking`）は第五輪、`free` は `TR.tr.kx, kz`。
    - `TRL.body.rotation.z = −TR.roll`。
    - `TRL.legs.position.y`：`coupled` は 0.45、`free` は 0、作業中は `TR.linkT` で行き来する。
    - `TRK.coil.visible = TR.link !== 'free'`、`TRK.coilStowed.visible = TR.link === 'free'`。
    - トラクターの後ろの沈み：`TRK.root` の傾きに `−0.06·clamp(TR.kp / (10000·9.81), 0, 1) / WB` rad を足す。

- [ ] **Step 1: 失敗するテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { openGame, startJob } from './helpers.mjs';
test('仕事ごとにトレーラーのモデルが切り替わり、同じ形の部品を持つ', async () => {
  const { browser, page, errors } = await openGame();
  const r = await page.evaluate(() => { const keys = o => ['root', 'body', 'legs', 'blinkL', 'blinkR', 'tail', 'rev', 'spin'].every(k => k in o);
    setupJob(1); updateVisuals(0.016); const a = { tank: TRAILER_MODELS.tank.root.visible, van: TRAILER_MODELS.van.root.visible, is: TRL === TRAILER_MODELS.tank };
    setupJob(0); updateVisuals(0.016); return { a, b: { tank: TRAILER_MODELS.tank.root.visible, van: TRAILER_MODELS.van.root.visible }, shape: keys(TRAILER_MODELS.van) && keys(TRAILER_MODELS.tank), wheels: TRAILER_MODELS.tank.spin.length }; });
  assert.deepEqual(r.a, { tank: true, van: false, is: true }); assert.deepEqual(r.b, { tank: false, van: true });
  assert.equal(r.shape, true); assert.equal(r.wheels, 6); await browser.close(); assert.deepEqual(errors, []);
});
test('脚とカールコードは連結の状態に合わせて動く', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  let v = await page.evaluate(() => { updateVisuals(0.016); return { legs: TRL.legs.position.y, coil: TRK.coil.visible, stowed: TRK.coilStowed.visible, at: [TRL.root.position.x - TR.tr.kx, TRL.root.position.z - TR.tr.kz] }; });
  assert.deepEqual(v, { legs: 0, coil: false, stowed: true, at: [0, 0] });
  await page.keyboard.press('KeyT'); await page.waitForFunction(() => TR.link === 'coupled', null, { timeout: 8000 });
  v = await page.evaluate(() => { updateVisuals(0.016); return { legs: TRL.legs.position.y, coil: TRK.coil.visible, stowed: TRK.coilStowed.visible }; });
  assert.deepEqual(v, { legs: 0.45, coil: true, stowed: false }); await browser.close();
});
test('車体は計算した傾きで傾く', async () => {
  const { browser, page } = await openGame(); await startJob(page);
  const z = await page.evaluate(() => { TR.roll = 0.05; updateVisuals(0.016); return TRL.body.rotation.z; });
  assert.ok(Math.abs(z + 0.05) < 1e-9); await browser.close();
});
```

- [ ] **Step 2: `npm run e2e` を実行し、失敗を確認する**
- [ ] **Step 3: 実装する**
- [ ] **Step 4: `npm test` と `npm run e2e` が通ることを確認する**
- [ ] **Step 5: 画像で確認する**（タンクトレーラーを斜め前と斜め後ろから、切り離した状態のバンを横から、運転席のミラーに映るタンク。脚が接地していること、形が破綻していないこと）
- [ ] **Step 6: コミット**（メッセージ `feat: tank trailer model, landing legs, air lines and body roll`）

---

### Task 12: 仕上げ

**Files:**
- Modify: `README.md`（操作の表、車両の説明、ファイル構成、テストの実行方法）
- Create: `test/perf.test.mjs`
- Modify: `index.html`（`npm run build` の結果）

- [ ] **Step 1: 速度のテストを書く**

```js
import test from 'node:test'; import assert from 'node:assert/strict';
import { loadSim, setup, run, laneKeep } from './helpers/sim.mjs';
test('物理は 1 フレーム（4 ステップ）あたり 0.3 ミリ秒以下', () => {
  const sim = loadSim(); setup(sim, { trailer: 'tank', cargo: 19000, s: sim.S0 + 100, v: 20 });
  const inp = () => ({ throttle: 0.6, brake: 0, steer: laneKeep(sim, -7.65) });
  run(sim, 5, inp); const t0 = performance.now(); run(sim, 60, inp);
  const perFrame = (performance.now() - t0) / (60 * 60); assert.ok(perFrame < 0.3, `${perFrame.toFixed(3)} ms`);
});
```

- [ ] **Step 2: `npm test` を実行する**（通らなければ、`rigStep` の中の配列やオブジェクトの生成をなくして通す）
- [ ] **Step 3: README を更新する**：操作の表に「連結／切り離し：`T`／上のボタン」、車両の説明に重さ・連結・安定装置・タンク、ファイル構成に `01a 01b 09a 09b 09c` と `test/`、テストの実行方法（`npm install`、`npm test`、`npm run e2e`）。
- [ ] **Step 4: 全体の確認**：`npm test` と `npm run e2e` がすべて通ること。設計書の「完成の基準」を 1 行ずつ確かめること。今ある機能（周りの車、料金所、目的地でない出口、速度違反、クルーズ、夜の表示）を、ブラウザで 1 つの仕事を通して確かめること。
- [ ] **Step 5: `npm run build` して `index.html` を更新し、コミットする**（メッセージ `docs: towing controls and tests in README, rebuild`）

/* 种子必须有**可点的按钮**（第 74 轮）。
 *
 * ── 为什么这是个大问题 ──
 *
 * 三颗种子（1-5 雷种 / 1-7 岩种 / 1-8 风种）是这三关的**唯一解法**。
 * 而它们的唯一触发方式是 **F 键**：
 *
 *   · 全项目只有 `if (k === 'f')` 一处（index.html 1987 行附近）；
 *   · 没有任何 `btnRect('seed')`，没有触屏入口；
 *   · 整个文件里 `touchstart` / `pointerdown` 一次都没出现。
 *
 * 也就是说：**手机上这三关根本过不去**。而用户在第 64 轮明确要求
 * 「长按屏幕出摇杆控制（电脑，手机）」——这个游戏本来就是打算给手机玩的。
 *
 * 这也是一处"引导"缺口：HUD 上从来没有出现过 F 这个键，
 * 唯一提到它的地方是**失败之后**的诊断语（"车上还有 N 颗种子没用（按 F 键触发）"）。
 * 玩家要先输一次才知道有这么个操作。
 *
 * 判据：
 *   A. 种子按钮存在，且在画面内、和已有按钮不重叠；
 *   B. 点它真的触发种子（和按 F 走**同一条** RAP.triggerSeed 路径）；
 *   C. 没有种子时**没有热区**（幽灵热区是这个项目反复踩的坑）；
 *   D. 种子用完之后按钮变灰、且点不动。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');

(async () => {
  const PORT = 9480 + Math.floor(Math.random() * 60);
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeSeedBtn-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true, awaitPromise: true })).result.value;

  const errs = [];
  ws.addEventListener('message', ev2 => {
    try {
      const m = JSON.parse(ev2.data);
      if (m.method === 'Runtime.exceptionThrown') {
        errs.push(m.params.exceptionDetails.text + ' ' +
          (m.params.exceptionDetails.exception && m.params.exceptionDetails.exception.description || ''));
      } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
        errs.push(m.params.args.map(a =>
          a.description || (a.value !== undefined ? String(a.value) : a.type)).join(' '));
      }
    } catch (e) {}
  });

  await ev('(()=>{const t=window.__rap.state; t.welcome=0; t.introT=1; return 1;})()');
  await sleep(300);

  /* 真实鼠标点击（走 mousedown / mouseup，和玩家完全同一条路径）。 */
  const click = async (dx, dy) => {
    const r = JSON.parse(await ev(`(()=>{const c=document.getElementById('cv');
      const b=c.getBoundingClientRect(); return JSON.stringify({l:b.left,t:b.top,w:b.width,h:b.height});})()`));
    const x = r.l + dx * r.w / 1280, y = r.t + dy * r.h / 720;
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(40);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(120);
  };

  /* 起 1-8（风种关）：车上有一台风种 + 一把伞。 */
  const setup = async () => {
    await ev(`(()=>{const R=window.__rap, S=R.state;
      R.startLevel(7); S.welcome=0; S.introT=1; S.phase='build'; S.run=null; S.runBanner=0;
      R.RAP.applySpec(R.level(), S.build, {
        wood_frame: [[4,1],[4,2],[4,3],[4,4]],
        wood_wheel: [[5,1],[5,4]], pig: [[4,2]],
        anemo_core: [[4,1]], propeller: [[3,1]], umbrella: [[3,2]] });
      S.phase='build'; S.run=null;
      R.launch(); S.runBanner=0;
      R.RAP.applySpecRuntime(S.run, { _dirs: { propeller: 0 } });
      return 1;})()`);
    await sleep(700);
  };

  // ═════════════ A 按钮存在、在画面内、不重叠 ═════════════
  await setup();
  {
    const sb = JSON.parse(await ev(
      'JSON.stringify(window.__rap.btnRect("seed"))'));
    A.chk('A1 行驶期有一个"种子"按钮（btnRect("seed") 不再是 null）',
      !!sb && sb.w > 0, JSON.stringify(sb));

    if (sb) {
      A.chk('A2 按钮完整在画面内（0 ≤ x，x+w ≤ 1280，0 ≤ y，y+h ≤ 720）',
        sb.x >= 0 && sb.x + sb.w <= 1280 && sb.y >= 0 && sb.y + sb.h <= 720,
        `x=${sb.x} y=${sb.y} w=${sb.w} h=${sb.h}`);
      A.chk('A3 按钮够大（最短边 ≥ 60px，手指点得中）',
        Math.min(sb.w, sb.h) >= 60, `${sb.w}×${sb.h}`);

      /* 和已有的行驶期按钮**不能重叠**。这一条是"幽灵热区/互相抢点击"
       * 那类问题的正面防线：重叠时玩家点中间会命中哪个完全看代码顺序。 */
      const others = JSON.parse(await ev(`(()=>{const R=window.__rap;
        const names=['pause','restartRun','help'];
        const out=[];
        names.forEach(n=>{const r=R.btnRect(n); if(r) out.push([n,r]);});
        return JSON.stringify(out);})()`));
      const overlaps = others.filter(([n, r]) =>
        sb.x < r.x + r.w && r.x < sb.x + sb.w && sb.y < r.y + r.h && r.y < sb.y + sb.h);
      A.chk('A4 和暂停/重开/帮助按钮都不重叠', overlaps.length === 0,
        overlaps.length ? overlaps.map(o => o[0]).join(',') : '无重叠');

      /* 交互键那一排也不能压到。交互键在 y = DH-150 起、居中排。 */
      const inter = JSON.parse(await ev(`(()=>{const R=window.__rap, S=R.state;
        const gs=(S.run.car.groups||[]); const n=Math.min(3,gs.length);
        const xs=1280/2-(n*104)/2; const y=R.btnRect('interact').y;
        return JSON.stringify({x: xs, y: y, w: n*104, h: 92, n: n});})()`));
      const hitInter = inter.n > 0 &&
        sb.x < inter.x + inter.w && inter.x < sb.x + sb.w &&
        sb.y < inter.y + inter.h && inter.y < sb.y + sb.h;
      A.chk('A5 不压住交互键那一排', !hitInter,
        `种子 ${sb.x},${sb.y} ${sb.w}×${sb.h} vs 交互 x=${inter.x} y=${inter.y} w=${inter.w}`);
    }
  }

  // ═════════════ B 点它真的触发种子 ═════════════
  await setup();
  {
    const before = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({ use: S.run.seedUse.anemo, field: !!S.run.windField });})()`));
    A.chk('B0 前提：点之前风种还没用（seedUse.anemo = 0）',
      before.use === 0 && before.field === false, JSON.stringify(before));

    const sb = JSON.parse(await ev('JSON.stringify(window.__rap.btnRect("seed"))'));
    A.chk('B0b 前提：按钮存在，否则下面的点击无从谈起', !!sb, JSON.stringify(sb));
    if (sb) {
      await click(sb.x + sb.w / 2, sb.y + sb.h / 2);
      const after = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
        return JSON.stringify({ use: S.run.seedUse.anemo, field: !!S.run.windField,
          r: S.run.windField && S.run.windField.r });})()`));
      A.log('点按钮之后：' + JSON.stringify(after));
      A.chk('B1 点种子按钮 → 真的触发了风场（走 RAP.triggerSeed 同一条路径）',
        after.use === 1 && after.field === true, JSON.stringify(after));
      A.chk('B2 风场参数和键盘触发的一模一样（半径 6 米）',
        after.r === 6, String(after.r));

      /* 次要按钮不该有"按住蓄力"语义 —— 种子是按下即生效。 */
      await sleep(400);
      const still = JSON.parse(await ev(
        'JSON.stringify({ held: !!window.__rap.state.run.car.pumpHeld })'));
      A.chk('B3 点种子按钮不会误触发"按住蓄力"状态', still.held === false,
        'pumpHeld=' + still.held);
    }
  }

  // ═════════════ C 没有种子时不该有热区 ═════════════
  await setup();
  {
    /* 把车上的种子拆掉（模拟"这一关没发种子"的车）。 */
    await ev(`(()=>{const S=window.__rap.state;
      S.run.car.parts = S.run.car.parts.filter(p => !(p.def && p.def.seedKind));
      return 1;})()`);
    await sleep(200);
    const sb = JSON.parse(await ev('JSON.stringify(window.__rap.btnRect("seed"))'));
    A.chk('C1 车上没有种子时 btnRect("seed") 返回 null（没有幽灵热区）',
      sb === null, JSON.stringify(sb));

    /* 点击原来按钮的位置：不该有任何副作用。
     * 用 setup 时记下的坐标 —— 不重算，因为"没有按钮"就没有坐标。 */
    const pos = { x: DW_POS.x, y: DW_POS.y };
    const b2 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({ field: !!S.run.windField,
        use: JSON.stringify(S.run.seedUse) });})()`));
    await click(pos.x, pos.y);
    const a2 = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
      return JSON.stringify({ field: !!S.run.windField,
        use: JSON.stringify(S.run.seedUse) });})()`));
    A.chk('C2 点那片空白不会凭空放出风场', b2.field === a2.field && b2.use === a2.use,
      JSON.stringify(b2) + ' → ' + JSON.stringify(a2));
  }

  // ═════════════ D 用完之后按钮变灰、点不动 ═════════════
  await setup();
  {
    const sb = JSON.parse(await ev('JSON.stringify(window.__rap.btnRect("seed"))'));
    if (sb) {
      /* 直接用键盘路径先把种子用掉，再看按钮的行为。 */
      await ev('window.__rap.triggerSeed("anemo")');
      await sleep(200);
      const st = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
        const b=window.__rap.seedBtnState ? window.__rap.seedBtnState() : null;
        return JSON.stringify({ use: S.run.seedUse.anemo, rect: S.seedBtnRect ?
          S.seedBtnRect() : window.__rap.btnRect('seed'), state: b });})()`));
      A.log('种子用完后：' + JSON.stringify(st));
      A.chk('D1 种子用完后 seedUse.anemo = 1', st.use === 1, String(st.use));

      /* 变灰意味着"还能看见但点不动"—— 热区可以留（它只是不生效），
       * 但必须明确告诉测试它处于灰色状态，否则玩家会以为按钮坏了。 */
      const clickBefore = await ev(`(()=>{const S=window.__rap.state;
        return JSON.stringify({ use: S.run.seedUse.anemo });})()`);
      if (st.rect) await click(st.rect.x + st.rect.w / 2, st.rect.y + st.rect.h / 2);
      const clickAfter = JSON.parse(await ev(`(()=>{const S=window.__rap.state;
        return JSON.stringify({ use: S.run.seedUse.anemo });})()`));
      A.chk('D2 种子用完后点按钮不会再触发（一次性）',
        clickAfter.use === 1, JSON.stringify(clickAfter));
      void clickBefore;
    }
  }

  // ═════════════ E 按钮真的**画出来了**（像素） ═════════════
  /* 前四组证明的是"热区存在、点得动、没有幽灵、用一次就没了"。
   * 它们全都能在一个**什么都不画**的实现上通过 —— 只要 btnRect 返回矩形。
   * 所以必须再有这一组：同一块屏幕区域，有种子时和没种子时**画得不一样**。
   *
   * ⚠ 第一版这一组**恒绿**（把绘制整块删掉仍然 16/16）。原因有两条，
   * 都是这个项目反复踩的同一个坑：判据区里混进了别的东西在动。
   *   1. 把种子从车上摘掉会改车的质量 → 车的落点变 → **镜头跟着动**；
   *   2. `triggerSeed` 里有 `state.shake = 0.5` 的手感震屏 →
   *      「可用 vs 已用」那一次采样整块区域都在抖。
   * 修法和 `test_seed_fx.js` 完全一样：**锁住镜头**（`state.__lockCam`），
   * 它同时会把 shake 归零。锁完之后，这一块区域里唯一会变的就是按钮本身。 */
  {
    const shot = async () => JSON.parse(await ev(`(()=>{
      const cv=document.getElementById('cv'), g=cv.getContext('2d'), v=window.__view;
      const k = cv.width / v.W;
      const x0 = Math.max(0, Math.round((1280 - 140 - v.offX)*k));
      const y0 = Math.max(0, Math.round((720 - 160 - v.offY)*k));
      const side = Math.round(120*k);
      const d = g.getImageData(x0, y0, side, side).data;
      const out = [];
      for (let i = 0; i < d.length; i += 4) out.push((d[i]<<16)|(d[i+1]<<8)|d[i+2]);
      return JSON.stringify({ side, px: out });})()`));

    /* 锁镜头：位置/缩放钉死，同时 shake 归零（渲染层读 __lockCam 时做的）。 */
    const lock = async () => {
      await ev(`(()=>{const S=window.__rap.state;
        const cm = S.camLastDraw || S.camLive;
        S.__lockCam = { x: cm.x, y: cm.y, zoom: cm.zoom };
        return 1;})()`);
      await sleep(260);
    };

    /* 1-8：车上有风种 → 该区域有按钮 */
    await setup();
    await lock();
    const withSeed = await shot();

    /* 把种子从车上摘掉 → 该区域应该回到纯背景。
     * 摘掉会改车重，但镜头已经锁死，所以画面里唯一变的就是按钮。 */
    await ev(`(()=>{const S=window.__rap.state;
      S.run.car.parts = S.run.car.parts.filter(p => !(p.def && p.def.seedKind));
      return 1;})()`);
    await sleep(360);
    const withoutSeed = await shot();

    const pct = (a, b) => {
      if (a.side !== b.side) return -1;
      let n = 0;
      for (let i = 0; i < a.px.length; i++) {
        const p = a.px[i], q = b.px[i];
        const dr = Math.abs(((p>>16)&255) - ((q>>16)&255));
        const dg = Math.abs(((p>>8)&255) - ((q>>8)&255));
        const db = Math.abs((p&255) - (q&255));
        if (dr + dg + db > 20) n++;
      }
      return +(n / Math.max(1, a.px.length) * 100).toFixed(1);
    };
    const d = pct(withSeed, withoutSeed);
    A.log('种子按钮区域：有种子 vs 无种子，差异 ' + d + '%');
    A.chk('E1 种子按钮真的被画出来了（区域差异 ≥ 20%）', d >= 20, d + '%');

    /* 用掉之后也应该有变化（亮 → 灰）。 */
    await setup();
    await lock();
    const ready = await shot();
    await ev('window.__rap.triggerSeed("anemo")');
    await sleep(420);
    const used = await shot();
    const d2 = pct(ready, used);
    A.log('种子按钮区域：可用 vs 已用，差异 ' + d2 + '%');
    A.chk('E2 用掉之后按钮外观变了（亮 → 灰，区域差异 ≥ 8%）', d2 >= 8, d2 + '%');

    /* 自证：镜头锁住之后，**什么都不改**的两帧必须完全相同。
     * 没有这一步，上面两条仍然可能是"镜头在动"而不是"按钮在变"。 */
    await setup();
    await lock();
    const s1 = await shot();
    await sleep(320);
    const s2 = await shot();
    const self = pct(s1, s2);
    A.log('锁镜头后同状态两帧自身差异 ' + self + '%');
    A.chk('E0 前提：锁镜头后画面真的是静止的（自身差异 < 1%）', self < 1, self + '%');
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

/* 按钮位置在**没有按钮时**也要有一份参照：C 组要用它点"原来那个地方"。
 * 这是 1280×720 设计坐标，和产品里的布局是同一个坐标系。 */
var DW_POS = { x: 1140, y: 594 };

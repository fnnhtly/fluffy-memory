/* 切走窗口（alt-tab / 切标签页 / 锁屏）之后回来，这一局会怎样？
 *
 * 两个真实可达的坏结局，形状和第 43 轮（auto-repeat 把 pumpPress 刷到 17）、
 * 第 44 轮（手指滑出按钮松不开）完全一样 —— 那两次都只防了"同一个窗口里的意外松手"：
 *
 *   A. **按住的键永远松不开**。玩家的手还按在键上，窗口先没了：那一刻 `keyup`
 *      落到别的窗口上，页面上**永远收不到**那一下松手。于是
 *      `state.heldKeys['s']` 一直留着 → 回来以后刹车还踩着；
 *      更糟的是下一次按 S 会被 `if (state.heldKeys[k]) return` 直接挡掉，
 *      玩家会以为键盘坏了。打气筒同理，还会一直蓄力、零件一直亮着。
 *
 *   B. **回来时迎面撞上一局已经跑完的比赛**。物理推进只在 `frameBody` 里，
 *      条件里没有任何"页面还看得见吗"的判断。主流浏览器会冻结后台标签页的
 *      rAF，所以多数情况下侥幸没事 —— 但那是巧合不是设计
 *      （被节流到 1 fps 的标签页会用 60 倍的时间步长飙车）。
 *
 * ── 用哪一种"失焦"来验：这是量出来的，不是猜的 ──
 * 三个候选机制各跑一遍（tools/probe_blur_mechanism.js 的结果）：
 *   · `Page.setWebLifecycleState: frozen` → 真的送来 `vis:hidden`，rAF 立刻停 → **能用**；
 *   · 开第二个标签页 + `Target.activateTarget` → `document.hidden` 变 true，
 *     但**事件一次都不送**（无头环境不派发）→ 不能用；
 *   · `Emulation.setFocusEmulationEnabled: false` → 什么都不发生 → 不能用。
 *
 * ── 而且恢复必须"两件一起做"（这一条害我红了一整轮）──
 * `Page.setWebLifecycleState: frozen` 送得到、也能真的停 rAF；但
 * `Page.setWebLifecycleState: active` **单独用收不回来**：实测 hidden 一直是 true、
 * rAF 一直是停的。只开 `Emulation.setFocusEmulationEnabled: true` 又只是
 * 把"可见性"强行改回 visible，页面内部的 lifecycle 还停在 frozen
 * —— 于是下一次 `frozen` 变成空操作，而 focusEmu 又把页面撑成可见，
 * 看起来就像"切走根本没生效"（这正是第一版那一堆红）。
 * 站得住的组合是：
 *   切走 = `setFocusEmulationEnabled:false` + `setWebLifecycleState:frozen`
 *   切回 = `setWebLifecycleState:active`  + `setFocusEmulationEnabled:true`
 * `tools/probe_focus_combo.js` 连做 3 轮验过这个组合：
 * 每轮都送 `vis:hidden`（有时还有 `blur`）、帧数冻结，回来后送
 * `vis:visible` + `focus` 并重启 rAF。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeB-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
  };
  const send = (m, p) => new Promise((res, rej) => {
    const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  async function shot(n) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64'));
  }

  /* 切走/切回各要**两步**（见文件头的说明）。少一步就变成"看起来切走了其实没切"。 */
  const hide = async () => {
    await send('Emulation.setFocusEmulationEnabled', { enabled: false });
    await sleep(150);
    await send('Page.setWebLifecycleState', { state: 'frozen' });
  };
  const show = async () => {
    await send('Page.setWebLifecycleState', { state: 'active' });
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  };
  const snap = () => ev(`(()=>{const s=window.__rap.state;return {
    hidden:document.hidden, held:Object.keys(s.heldKeys), heldBtn:s.heldBtn,
    paused:s.paused, runPhase:s.run&&s.run.phase,
    t:+(s.run?s.run.time:0).toFixed(3),
    braking:s.run?!!s.run.car.braking:null,
    pumpHeld:s.run?!!s.run.car.pumpHeld:null,
    pumpCharge:s.run?+(s.run.car.pumpCharge||0).toFixed(3):null,
    groupsOn:s.run?s.run.car.groups.map(g=>g.on):null,
    speed:s.run?+Math.hypot(s.run.car.vx,s.run.car.vy).toFixed(2):null,
    pumpPress:s.run?s.run.pumpPress:null,
    autoPaused:s.autoPaused || false,
  };})()`);

  /* ---------- 0. 机制自检 ----------
   * 用**独立的**监听器（完全不碰游戏代码）确认"hide 真的把页面标成隐藏"。
   * 判据是"页面知道自己是隐藏的"，不是"必须送 blur" ——
   * 实测 frozen 只送 `vis:hidden`，blur 不一定来。第一版把 blur 写成硬条件，
   * 红的是量具不是功能。 */
  await ev(`(()=>{window.__fl=[];
    document.addEventListener('visibilitychange', ()=>window.__fl.push('vis:'+document.visibilityState));
    window.addEventListener('blur', ()=>window.__fl.push('blur'));
    window.addEventListener('focus', ()=>window.__fl.push('focus'));
    return true;})()`);
  await hide(); await sleep(450);
  const vHidden = await ev('({log:window.__fl.slice(), hidden:document.hidden, vis:document.visibilityState})');
  await show(); await sleep(450);
  const vBack = await ev('({log:window.__fl.slice(), hidden:document.hidden, vis:document.visibilityState})');
  A.log('hide → ' + JSON.stringify(vHidden));
  A.log('show → ' + JSON.stringify(vBack));
  A.chk('失焦机制成立：hide 会真的把页面标成隐藏并送 visibilitychange',
    vHidden.hidden === true && vHidden.log.some(x => x === 'vis:hidden'), JSON.stringify(vHidden));
  A.chk('恢复机制成立：show 会真的把页面拉回可见（否则后面全是假红）',
    vBack.hidden === false && vBack.log.some(x => x === 'vis:visible'), JSON.stringify(vBack));

  /* ---------- A. 按住 S 刹车时切走 ---------- */
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[0], s.build, R.SPECS['1-1']);
    window.__rap.launch();
    return true;})()`);
  await sleep(300);

  /* 真实的键盘事件。`key` 必须是**那个字符**而不是 code —— 游戏里写的是
   * `ev.key.toLowerCase()`，送 'KeyS' 过去永远匹配不上。
   * （第一版把 code 当 key 送，按 1 什么都没发生，那条红又是量具的错。） */
  const KEYMAP = { KeyS: { key: 's', vk: 83 }, Digit1: { key: '1', vk: 49 }, Space: { key: ' ', vk: 32 } };
  const keyEv = (type, code) => {
    const m = KEYMAP[code];
    return send('Input.dispatchKeyEvent', {
      type, code, key: m.key, windowsVirtualKeyCode: m.vk, nativeVirtualKeyCode: m.vk,
    });
  };
  await keyEv('rawKeyDown', 'KeyS');
  await sleep(250);
  const heldBefore = await snap();
  A.log('按住 S 之后：' + JSON.stringify(heldBefore));
  A.chk('按住 S 真的刹上了（量具的前提）', heldBefore.braking === true, 'braking=' + heldBefore.braking);

  /* 切走。**不送 keyup** —— 真实的 alt-tab 就是这样。 */
  await hide(); await sleep(500);
  const goneS = await snap();
  A.log('切走（不送 keyup）期间：' + JSON.stringify(goneS));
  await show(); await sleep(500);
  const backS = await snap();
  A.log('切回来：' + JSON.stringify(backS));

  A.chk('切走时刹车被松开（不是"按着"混过一整个后台）', goneS.braking === false,
    'braking=' + goneS.braking);
  A.chk('切走时按住状态被清空（否则回来按 S 会被自己挡掉）',
    goneS.held.length === 0, 'held=' + JSON.stringify(goneS.held));
  A.chk('切回来刹车没有复活', backS.braking === false, 'braking=' + backS.braking);
  A.chk('切回来按住集合仍然是空的', backS.held.length === 0, JSON.stringify(backS.held));
  A.chk('切走会自动暂停（回来时能看清局面，而不是迎面撞一局已结束的比赛）',
    goneS.paused === true, 'paused=' + goneS.paused);
  A.chk('切回来仍然是暂停（等玩家自己按继续）', backS.paused === true, 'paused=' + backS.paused);
  A.chk('自动暂停会说明是谁按的（暂停卡不能写得像玩家自己按的）',
    backS.autoPaused !== false, 'autoPaused=' + backS.autoPaused);
  await shot('fb-paused-on-return');

  /* 空格把这一局继续开。
   *
   * 顺序很重要：**先继续，再验键盘**。第一次把"回来再按 S 还能刹"写在暂停状态里，
   * 而暂停分支（`if (state.paused && state.phase==='run')`）本来就会吞掉所有键 ——
   * 那条红是测试自己的错，不是键盘失灵。 */
  await keyEv('rawKeyDown', 'Space');
  await keyEv('keyUp', 'Space');
  await sleep(300);
  const resumed = await snap();
  A.chk('空格能把自动暂停的这一局继续开', resumed.paused === false, 'paused=' + resumed.paused);
  A.chk('继续之后"自动暂停"的标记也清掉了（下一次自己按 Esc 不该再写"切走了"）',
    resumed.autoPaused === false, 'autoPaused=' + resumed.autoPaused);
  A.chk('继续之后物理真的在推进（不是卡死）', resumed.t > goneS.t + 0.1,
    goneS.t + ' → ' + resumed.t);

  /* 继续以后按同一个键，必须还能起效 —— 这才是玩家真正的感受 */
  await keyEv('rawKeyDown', 'KeyS');
  await sleep(250);
  const again = await snap();
  A.chk('继续以后再按 S 仍然能刹（键盘没有"失灵"）', again.braking === true,
    'braking=' + again.braking + ' held=' + JSON.stringify(again.held));
  await keyEv('keyUp', 'KeyS');
  await sleep(150);

  /* ---------- B. 按住交互键（打气筒）时切走 ---------- */
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[1], s.build, R.SPECS['1-2']);
    window.__rap.launch();
    return true;})()`);
  await sleep(300);
  await keyEv('rawKeyDown', 'Digit1');
  await sleep(600);   // 蓄力
  const chargeBefore = await snap();
  A.log('按住 1 蓄力 0.6 秒：' + JSON.stringify(chargeBefore));
  A.chk('蓄力真的在进行（量具的前提）', chargeBefore.pumpCharge > 0.2,
    'charge=' + chargeBefore.pumpCharge);

  await hide(); await sleep(500);
  const chargeGone = await snap();
  A.log('切走期间：' + JSON.stringify(chargeGone));
  await show(); await sleep(500);
  const chargeBack = await snap();
  A.log('切回来：' + JSON.stringify(chargeBack));

  A.chk('切走时交互键的按住状态被清空', chargeGone.held.length === 0,
    JSON.stringify(chargeGone.held));
  A.chk('切走时打气筒不再"按着"', chargeGone.pumpHeld === false, 'pumpHeld=' + chargeGone.pumpHeld);
  A.chk('切走时零件不再被点亮', chargeGone.groupsOn.every(x => x === false),
    JSON.stringify(chargeGone.groupsOn));
  /* "不许放气"不能比绝对速度 —— 1-2 的车本来就在自己跑（马达在推），
   * speed 有 2.8 是这一关的正常状态。要比的是**切走前后有没有突然多出一段速度**。
   * 第一版写 `speed < 0.6`，红的是测试自己不了解这一关。 */
  A.chk('切走不是"松开"：不许因此放一次气（车不该被推一下）',
    Math.abs(chargeBack.speed - chargeGone.speed) < 0.6 && chargeBack.pumpPress === 1,
    'speed ' + chargeGone.speed + ' → ' + chargeBack.speed + ' pumpPress=' + chargeBack.pumpPress);
  A.chk('切回来蓄力没有偷偷攒着', chargeBack.pumpCharge === 0, 'charge=' + chargeBack.pumpCharge);

  /* 回来以后按 1 还能蓄力（不是"已经按着了"挡掉）。
   * 必须先继续 —— 暂停分支会吞掉所有键（和上面 S 那一条同一个坑）。 */
  await keyEv('rawKeyDown', 'Space');
  await keyEv('keyUp', 'Space');
  await sleep(250);
  await keyEv('rawKeyDown', 'Digit1');
  await sleep(400);
  const chargeAgain = await snap();
  A.chk('继续以后再按 1 仍然能蓄力', chargeAgain.pumpCharge > 0.1 && chargeAgain.pumpHeld === true,
    'charge=' + chargeAgain.pumpCharge + ' pumpHeld=' + chargeAgain.pumpHeld);
  await keyEv('keyUp', 'Digit1');
  await sleep(150);

  /* ---------- C. 建造阶段切走：拖拽手势必须复位 ---------- */
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    /* 造一个"正拖着零件"的局面：mouse.down + dragPart + pendingClick 全齐 */
    s.mouse.down = true; s.mouse.x = 300; s.mouse.y = 300;
    s.dragPart = 'wood_frame'; s.pendingClick = { r: 4, c: 0, x: 300, y: 300, moved: true };
    s.erasePaint = true;
    return {down:s.mouse.down, drag:s.dragPart};})()`);
  const dragBefore = await ev(`(()=>{const s=window.__rap.state;return {down:s.mouse.down,drag:s.dragPart,pending:!!s.pendingClick,erase:s.erasePaint,held:Object.keys(s.heldKeys)};})()`);
  A.chk('建造期拖拽状态确实造出来了（量具的前提）',
    dragBefore.down === true && dragBefore.drag === 'wood_frame', JSON.stringify(dragBefore));
  await hide(); await sleep(400);
  await show(); await sleep(400);
  const dragAfter = await ev(`(()=>{const s=window.__rap.state;return {down:s.mouse.down,drag:s.dragPart,pending:!!s.pendingClick,erase:s.erasePaint,lastDrag:s.lastDragCell};})()`);
  A.log('切走前后的拖拽状态：' + JSON.stringify(dragBefore) + ' → ' + JSON.stringify(dragAfter));
  A.chk('切走时拖拽手势被复位（回来光标一动不会还在"拖着一个零件"）',
    dragAfter.down === false && dragAfter.drag === null, JSON.stringify(dragAfter));
  A.chk('切走时待落子的点击被清掉', dragAfter.pending === false, 'pending=' + dragAfter.pending);
  A.chk('切走时擦除笔刷被关掉', dragAfter.erase === false, 'erase=' + dragAfter.erase);
  {
    const pa = await ev('window.__rap.state.paused');
    A.chk('建造页切走不弹"已暂停"（那边本来就是静止的）', pa === false, 'paused=' + pa);
  }

  /* ---------- D. 结算页切走：不许把结算卡改成暂停 ---------- */
  await ev(`(()=>{window.__rap.launchSpec(0,'1-1'); return true;})()`);
  /* 1-1 的标准解要跑 5 秒多才通关。第一版只等了 4.8 秒（80×60ms），
   * 于是 D 段整个跑在"还在跑"的局面上，那条红是**没等到**，不是结算页有问题。
   * 这里放宽到 16 秒，并且把"真的到了结算页"单独断言成前提。 */
  let reached = false;
  for (let i = 0; i < 200; i++) {
    await sleep(80);
    if (await ev('window.__rap.state.phase') === 'resolved') { reached = true; break; }
  }
  const resBefore = await ev('(()=>({phase:window.__rap.state.phase, paused:window.__rap.state.paused, result:window.__rap.state.run.result}))()');
  A.chk('结算页真的到了（量具的前提）', reached && resBefore.phase === 'resolved', JSON.stringify(resBefore));
  await hide(); await sleep(400);
  await show(); await sleep(400);
  const resAfter = await ev('(()=>({phase:window.__rap.state.phase, paused:window.__rap.state.paused, result:window.__rap.state.run.result, hidden:document.hidden}))()');
  A.log('结算页切走前后：' + JSON.stringify(resBefore) + ' → ' + JSON.stringify(resAfter));
  A.chk('结算页切走不会把 phase 改成 pause（结算卡还在）',
    resAfter.phase === 'resolved' && resAfter.paused === false && resAfter.result === 'win',
    JSON.stringify(resAfter));
  await shot('fb-resolved-after-return');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

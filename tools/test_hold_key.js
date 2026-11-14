/* 「按住蓄力」到底能不能按（第 47 轮）。
 *
 * 策划案里打气筒是**按住蓄力、松手放气**（`Params.pumpImpulse × (0.35 + 0.65 × 蓄力)`，
 * 蓄力上限 0.8 秒）。1-2 的三星条件之一就是「不按打气筒 ≤ 1 次」——
 * 也就是玩家必须"只按一次、按够、放"。
 *
 * 但 index.html 的 keydown 是这么写的：
 *
 *     if (k >= '1' && k <= '3') RAP.pressInteract(state.run, k);
 *     ...
 *     window.addEventListener('keyup', function up(e2){ RAP.releaseInteract(...) })
 *
 * 浏览器**按住不放会持续发 keydown**（auto-repeat，约 30 次/秒）。
 * 于是：
 *   · `pressInteract` 被调十几次 → `pumpPress` 记十几次 → 1-2 的三星**永远拿不到**；
 *   · 每一次 keydown 都**再注册一个** keyup 监听 → 松手时 `releaseInteract`
 *     被调十几次 → 十几次冲量叠加（实测 5.4 倍）。
 *
 * 两条都直接毁掉这一关：正确的玩法（按住蓄力）反而被判"按了很多次"，
 * 而且松手瞬间车会被弹飞。
 *
 * 这份测试用**真的键盘事件**（CDP Input.dispatchKeyEvent，带 autoRepeat）
 * 去打页面，然后从引擎事件流里数 interact_key / pump_release 的条数 ——
 * 事件流是引擎本来就写的，不需要为测试加新钩子。
 *
 * 量具：autoRepeat 那段必须真的把 keydown 打够（数出来的 interact_key 条数
 * 在修好之前是 >1）。所以先跑一遍"未修"的行为作对照，确认这份量具能红。
 */
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeHk-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL 无法连上浏览器'); process.exit(1); }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  /* '1' 键的真实键位：key='1'、code='Digit1'、windowsVirtualKeyCode=49。
   * 少任何一个，页面里的 `ev.key.toLowerCase()` 读到的是空串，
   * 整段键盘逻辑静默不执行 —— 那样所有断言都会"因为什么都没发生"而绿。 */
  const keyDown = (repeat) => send('Input.dispatchKeyEvent', {
    type: repeat ? 'keyDown' : 'rawKeyDown',
    key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49,
    text: repeat ? undefined : '1', unmodifiedText: repeat ? undefined : '1',
    autoRepeat: !!repeat
  });
  const keyUp = () => send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: '1', code: 'Digit1', windowsVirtualKeyCode: 49, nativeVirtualKeyCode: 49
  });

  /* 起 1-2（唯一有打气筒的关），按标准解摆好车，发射，等车落地稳住 */
  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
      s.welcome=0; s.helpOpen=0; s.paused=false; s.levelSelect=false;
      window.__rap.startLevel(1); s.welcome=0; s.introT=1; s.runBanner=0;
      R.applySpec(lv, s.build, R.SPECS['1-2']);
      window.__rap.launch();
      s.runBanner=0;
      return 1;})()`);
    await sleep(900);   // 落地 + 稳定，避开 spawnGrace
  };

  /* 读一次"从开局到现在"引擎写了哪些相关事件 */
  const readRun = () => ev(`(()=>{const s=window.__rap.state;
    const evs=(s.run&&s.run.events)||[];
    const n=(t)=>evs.filter(e=>e.indexOf(t)===0).length;
    return JSON.stringify({interact:n('interact_key'), pump_charge:n('pump_charge'),
      pump_release:n('pump_release'), pumpPress:s.run?s.run.pumpPress:-1,
      charge:+(s.run&&s.run.car.pumpCharge||0).toFixed(3),
      vx:+(s.run&&s.run.car.vx||0).toFixed(2)});})()`).then(JSON.parse);

  // ---- 1) 只按一下：基线，必须 1 次 press / 1 次 release ----
  await setup();
  await keyDown(false); await sleep(120); await keyUp(); await sleep(250);
  const one = await readRun();
  A.log('单击一次：interact_key ' + one.interact + '　pump_release ' + one.pump_release +
    '　pumpPress ' + one.pumpPress);

  // ---- 2) 按住 1 秒：auto-repeat 会有几十个 keydown ----
  await setup();
  await keyDown(false);
  for (let i = 0; i < 16; i++) { await sleep(60); await keyDown(true); }
  const held = await readRun();          // 松手前先记一次蓄力进度
  await keyUp(); await sleep(280);
  const hold = await readRun();
  A.log('按住 1.1 秒：interact_key ' + hold.interact + '　pump_release ' + hold.pump_release +
    '　pumpPress ' + hold.pumpPress + '　松手前蓄力 ' + held.charge);

  /* 前提必须先证明：这一局真的进了行驶页、车上真的有打气筒这一个交互组。
   * 否则下面"pumpPress 只有 1"在"根本没进这一局"的情形下也会绿。 */
  const pre = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, hasRun:!!s.run,
      groups:((s.run&&s.run.car.groups)||[]).map(g=>g.part)});})()`));
  A.chk('前提：这一局真的进了行驶页，且车上有打气筒组',
    pre.phase === 'run' && pre.hasRun && pre.groups.indexOf('pump') >= 0,
    pre.phase + ' / [' + pre.groups.join(' ') + ']');

  A.chk('单击一下 = 1 次按下 + 1 次松开',
    one.interact === 1 && one.pump_release === 1,
    one.interact + ' / ' + one.pump_release);

  /* 这一条就是 1-2 的三星条件：`pumpPress ≤ 1`。
   * 按住蓄力是**正确玩法**，它不能让计数变成 16。 */
  A.chk('按住 1 秒仍然只算按了 1 次（auto-repeat 不许把 pumpPress 顶上去）',
    hold.pumpPress === 1, 'pumpPress=' + hold.pumpPress);

  /* 松手只能放一次气。按 16 次 keydown → 原来会注册 16 个 keyup 监听，
   * 松手瞬间 16 次 releaseInteract，冲量叠 5 倍。 */
  A.chk('松手只放一次气（pump_release 恰好 1 条，不被叠加）',
    hold.pump_release === 1, hold.pump_release + ' 条');

  /* 蓄力必须真的在涨 —— 否则"按了 1 次"也可能只是"根本没蓄力" */
  A.chk('按住期间蓄力真的涨到接近上限 0.8 秒',
    held.charge >= 0.45, '蓄力 ' + held.charge + ' 秒');

  /* ---- 量具自证：这局如果真的被按住刷了 16 次，pumpPress 必须是 16 ----
   * 直接调引擎入口模拟"每个 keydown 都 pressInteract 一次"的旧行为，
   * 确认 pumpPress 会涨 —— 证明上面那条断言不是恒真。 */
  {
    const wouldFail = await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP;
      const before=s.run.pumpPress;
      for(let i=0;i<16;i++) R.pressInteract(s.run,1);
      return JSON.stringify({before:before, after:s.run.pumpPress});})()`).then(JSON.parse);
    A.chk('量具能失败：连调 16 次 pressInteract，pumpPress 立刻涨到 17',
      wouldFail.after - wouldFail.before === 16,
      wouldFail.before + ' → ' + wouldFail.after);
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

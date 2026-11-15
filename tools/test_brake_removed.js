/* 刹车：**按钮和键位都删了，物理还在**（第 62 轮重写）。
 *
 * 这个脚本原来是 test_brake_release.js（第 48 轮），测的是
 * 「键盘 S 按住刹车后松手必须真的松开」—— 那是个真 bug，修好了。
 *
 * 但第 62 轮用户要求「删掉刹车按钮」，于是**被测对象消失了**：
 * 按钮不再画、S/↓ 不再绑、`btnRect('brake')` 返回 null。
 * 那个脚本第一件事就是 `btnRect('brake')` 再读 `.x`，于是
 * `TypeError: Cannot read properties of null` —— 崩溃，不是断言失败。
 *
 * 和删金币那一轮同一条原则：**测试保护它测的那个东西；
 * 那个东西死了，测试就得一起埋**，否则让它变绿的最省事办法永远是把它加回来。
 *
 * 但它也不是全埋 —— 「删按钮」≠「删物理」这两件事必须分开验证：
 *
 *   A) 界面上真的没有了：btnRect('brake') 是 null、按键 S 不再设 braking、
 *      行驶页那 92×92 的区域里没有刹车按钮的视觉残留。
 *   B) 引擎里的刹车**仍然有效**：直接调 RAP.setBrake，车必须减速。
 *      这一条是防止有人"顺手把 setBrake 也删了"—— 那会连带破坏
 *      `cancelInteract` 与失焦保护里对 braking 的清理。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBk4-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL 无法连上浏览器'); process.exit(1); }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(900);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate',
    { expression: e, returnByValue: true })).result.value;

  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[0];
      s.welcome=0; s.helpOpen=0; s.paused=false; s.levelSelect=false;
      window.__rap.startLevel(0); s.welcome=0; s.introT=1; s.runBanner=0;
      G.applySpec(lv, s.build, G.SPECS['1-1']);
      window.__rap.launch(); s.runBanner=0; return 1;})()`);
    await sleep(800);
  };
  const read = () => ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, hasRun:!!s.run,
      braking:!!(s.run&&s.run.car.braking),
      brakeEvs:(s.run&&s.run.events||[]).filter(e=>String(e).indexOf('brake')===0).length,
      vx:+(s.run&&s.run.car.vx||0).toFixed(2)});})()`).then(JSON.parse);

  const KEY_S = { key: 's', code: 'KeyS', vk: 83 };
  const keyDownS = () => send('Input.dispatchKeyEvent', {
    type: 'rawKeyDown', key: KEY_S.key, code: KEY_S.code,
    windowsVirtualKeyCode: KEY_S.vk, nativeVirtualKeyCode: KEY_S.vk,
    text: 's', unmodifiedText: 's' });
  const keyUpS = () => send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: KEY_S.key, code: KEY_S.code,
    windowsVirtualKeyCode: KEY_S.vk, nativeVirtualKeyCode: KEY_S.vk });

  await setup();

  /* ---- A1) btnRect('brake') 必须是 null ---- */
  const bk = JSON.parse(await ev(
    "JSON.stringify(window.__rap.btnRect('brake'))"));
  A.chk('A1 行驶相里 btnRect(\'brake\') 返回 null（按钮的几何不存在了）',
    bk === null, JSON.stringify(bk));

  /* ---- A2) 按压前的对照 ----
   * 先证明"这个读数会动"：用 setBrake 直接置 true，读到的必须是 true。
   * 没有这一步的话，后面"按 S 之后 braking 仍是 false"可能只是这个字段永远 false。 */
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, true); return 1;})()');
  await sleep(120);
  const forcedOn = await read();
  A.chk('A2 量具能看见 true（直接 setBrake(true) 后 readings.braking 为 true）',
    forcedOn.braking === true, 'braking=' + forcedOn.braking);
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, false); return 1;})()');
  await sleep(120);

  /* ---- A3) 按键 S 不再刹 ---- */
  const before = await read();
  await keyDownS(); await sleep(300);
  const during = await read();
  await keyUpS(); await sleep(200);
  A.log('按 S 前后：braking ' + before.braking + ' → ' + during.braking +
        '，brake 事件 ' + before.brakeEvs + ' → ' + during.brakeEvs);
  A.chk('A3 按 S 不再设 braking（键位已删）', during.braking === false,
    'braking=' + during.braking);
  A.chk('A4 按 S 不再往事件流里写 brake on', during.brakeEvs === before.brakeEvs,
    before.brakeEvs + ' → ' + during.brakeEvs);

  /* ---- A5) 屏幕上不该再有刹车按钮的视觉 ----
   * 原来的按钮在 {x: DW-128, y: DH-150, 92×92} = x 1152..1244, y 570..662。
   * 现在那块应该只是关卡箱底的呼吸区。判据：那里不能有「刹」「按住」这串字。
   * 用 fillText 猴子补丁读这一帧真正画了什么，比猜像素稳。 */
  const texts = JSON.parse(await ev(`(()=>{
    const recs = window.__leg && window.__leg.recs ? window.__leg.recs : null;
    if (!recs) return JSON.stringify({ok:false, why:'no recorder'});
    return JSON.stringify({ok:true, list:recs.slice(-80)});
  })()`));
  if (texts.ok) {
    const hitBrake = texts.list.some(t => String(t).indexOf('刹') >= 0);
    A.chk('A5 这一帧没有任何"刹"字被画出来', !hitBrake,
      hitBrake ? '仍然画了刹' : '干净');
  } else {
    A.log('（跳过 A5：没有安装 fillText 记录器，不影响 A1–A4）');
  }

  /* ---- B) 引擎里的刹车仍然有效 ---- */
  await setup();
  await ev('(()=>{const s=window.__rap.state; s.run.car.vx = 6.0; return 1;})()');
  await sleep(120);
  const v0 = (await read()).vx;
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, true); return 1;})()');
  await sleep(700);
  const v1 = (await read()).vx;
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, false); return 1;})()');
  await sleep(200);
  A.log('引擎刹车减速：vx ' + v0 + ' → ' + v1);
  A.chk('B1 setBrake(true) 确实在减速（物理还在，删的只是按钮）',
    v1 < v0 - 1.5, v0 + ' → ' + v1);
  const after = await read();
  A.chk('B2 setBrake(false) 之后 braking 回到 false', after.braking === false,
    'braking=' + after.braking);

  /* ---- B3) 事件流去重仍然生效（第 48 轮修的，不能被回退）---- */
  await setup();
  const e0 = (await read()).brakeEvs;
  await ev(`(()=>{const r=window.__rap.state.run; const S=window.__rap;
    for(let i=0;i<12;i++) S.setBrake(r,true); return 1;})()`);
  await sleep(120);
  const e1 = (await read()).brakeEvs;
  A.chk('B3 重复 setBrake(true) 只写一条事件（状态没变就不记）',
    e1 - e0 === 1, (e1 - e0) + ' 条');

  A.finish(ws, child);
})().catch(e => { console.log('FAIL', e && e.message); process.exit(1); });

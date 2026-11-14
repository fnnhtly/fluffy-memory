/* 刹车键松手必须真的松开（第 48 轮）。
 *
 * 行驶页右下角有个刹车钮，上面写着「刹 / 按住」，键盘是 S 或 ↓。
 * 但 `keydown` 只调了 `setBrake(state.run, true)` —— 整份键盘处理里
 * **没有任何地方调 `setBrake(false)`**。只有鼠标的 mouseup 会调。
 *
 * 实测（`tools/dbg_brake_key.js`）：
 *
 *     按下前：{"braking":false}
 *     按下后：{"braking":true,  "brakeEvs":["brake on"]}
 *     松手后：{"braking":true,  "brakeEvs":["brake on"]}   ← 一直刹着
 *
 * 也就是说：任何用键盘刹过一次车的玩家，整局都被刹住，
 * 只能靠"点一下鼠标"或"再开局"解除。按 S 之后车开不动，
 * 玩家会以为物理坏了 —— 而刹车钮上的「按住」二字正是他的操作依据。
 *
 * 顺带修第二件事：`setBrake` 无条件 `log('brake on')`。
 * 浏览器按住 S 会 auto-repeat（约 30 次/秒），于是事件流里每秒塞 30 条
 * 一模一样的 `brake on` —— 事件数组无谓地涨，`test_perf_stable` 量的
 * 就是这一局的内存与帧时间。改成只在**状态真的变了**时记一条。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBk3-' + Date.now()),
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

  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[0];
      s.welcome=0; s.helpOpen=0; s.paused=false; s.levelSelect=false;
      window.__rap.startLevel(0); s.welcome=0; s.introT=1; s.runBanner=0;
      G.applySpec(lv, s.build, G.SPECS['1-1']);
      window.__rap.launch(); s.runBanner=0; return 1;})()`);
    await sleep(800);
  };

  const KEY = { s: { key: 's', code: 'KeyS', vk: 83 } };
  const keyDown = (repeat) => send('Input.dispatchKeyEvent', {
    type: repeat ? 'keyDown' : 'rawKeyDown', key: KEY.s.key, code: KEY.s.code,
    windowsVirtualKeyCode: KEY.s.vk, nativeVirtualKeyCode: KEY.s.vk,
    text: repeat ? undefined : 's', unmodifiedText: repeat ? undefined : 's', autoRepeat: !!repeat });
  const keyUp = () => send('Input.dispatchKeyEvent', {
    type: 'keyUp', key: KEY.s.key, code: KEY.s.code,
    windowsVirtualKeyCode: KEY.s.vk, nativeVirtualKeyCode: KEY.s.vk });

  const read = () => ev(`(()=>{const s=window.__rap.state;
    return JSON.stringify({phase:s.phase, hasRun:!!s.run,
      braking:!!(s.run&&s.run.car.braking),
      brakeEvs:(s.run&&s.run.events||[]).filter(e=>e.indexOf('brake')===0).length,
      vx:+(s.run&&s.run.car.vx||0).toFixed(2)});})()`).then(JSON.parse);

  // ---- A) 键盘：按住 S 刹车，松手必须松开 ----
  await setup();
  const t0 = await read();
  await keyDown(false); await sleep(260);
  const t1 = await read();
  await keyUp(); await sleep(320);
  const t2 = await read();
  A.log('键盘 S：按下前 braking=' + t0.braking + '　按下中 braking=' + t1.braking +
    '　松手后 braking=' + t2.braking + '　(vx ' + t2.vx + ')');

  A.chk('前提：这一局真的进了行驶页', t2.phase === 'run' && t2.hasRun, t2.phase);
  A.chk('前提：按下 S 真的刹住了（否则"松手松开"是空话）', t0.braking === false && t1.braking === true,
    t0.braking + ' → ' + t1.braking);
  A.chk('松手 S 之后刹车真的松开（不再是"整局一直刹着"）', t2.braking === false,
    'braking=' + t2.braking);

  // ---- B) 按住 S 的 auto-repeat 不许把 brake 事件刷满 ----
  await setup();
  await keyDown(false);
  for (let i = 0; i < 12; i++) { await sleep(55); await keyDown(true); }
  const spam = await read();
  await keyUp(); await sleep(250);
  A.chk('按住 S 期间 brake 事件只有 1 条（auto-repeat 不刷事件流）',
    spam.brakeEvs === 1, spam.brakeEvs + ' 条');

  // ---- C) 键盘刹车真的在减速（不只是个标志位）----
  {
    await setup();
    // 给车一个初速度，然后按住 S
    await ev(`(()=>{const s=window.__rap.state; s.run.car.vx = 6.0; return 1;})()`);
    await sleep(120);
    const v0 = (await read()).vx;
    await keyDown(false); await sleep(700);
    const v1 = (await read()).vx;
    await keyUp(); await sleep(200);
    A.log('刹车减速：vx ' + v0 + ' → ' + v1);
    A.chk('按住 S 时车速明显下降（刹车真的在起作用）', v1 < v0 - 1.5, v0 + ' → ' + v1);
    const after = await read();
    A.chk('松开后不再继续刹（此刻 braking 为 false）', after.braking === false, after.braking);
  }

  // ---- D) 鼠标刹车钮：按下刹、松手松开（这条本来就是对的，作为对照）----
  {
    await setup();
    const bk = JSON.parse(await ev(`(()=>{const b=window.__rap.btnRect('brake');
      return JSON.stringify(b);})()`));
    const cx = bk.x + bk.w / 2, cy = bk.y + bk.h / 2;
    const inject = (kind) => ev(`(()=>{const cv=document.querySelector('canvas'),r=cv.getBoundingClientRect();
      const ex=r.left+${cx}*r.width/1280, ey=r.top+${cy}*r.height/720;
      cv.dispatchEvent(new MouseEvent('${kind}',{clientX:ex,clientY:ey,button:0,bubbles:true}));
      return 1;})()`);
    await inject('mousedown'); await sleep(220);
    const m1 = await read();
    await inject('mouseup'); await sleep(220);
    const m2 = await read();
    A.chk('鼠标刹车钮：按下刹住、松手松开（对照路径本来是对的）',
      m1.braking === true && m2.braking === false, m1.braking + ' → ' + m2.braking);
  }

  /* ---- 量具自证：把 braking 直接置 true 再读，判据必须能看见 true ----
   * 否则"松手后 braking === false"也可能只是这个字段永远是 false。 */
  {
    const forced = await ev(`(()=>{const s=window.__rap.state;
      s.run.car.braking = true; return JSON.stringify({b:!!s.run.car.braking});})()`).then(JSON.parse);
    A.chk('量具能失败：直接置 braking=true 时读到的就是 true', forced.b === true, 'braking=' + forced.b);
  }

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

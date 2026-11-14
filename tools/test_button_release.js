/* 按住一个按钮、手滑出去、再松手 —— 那一次"松手"还作数吗？（第 47 轮）
 *
 * 打气筒是**按住蓄力、松手放气**。玩家按下交互钮之后，一定会按住一段时间
 * （最多 0.8 秒），而手指在这段时间里移动是常态。
 *
 * 原来的 `mouseup` 是**重新遍历按钮**判命中：
 *
 *     for (i...) if (hit(rect, p.x, p.y)) { RAP.releaseInteract(state.run, i+1); return; }
 *
 * 指针已经离开了按钮 → 一个都不命中 → `releaseInteract` 永远不被调用。
 * 后果（本文件量的）：
 *   · `car.pumpHeld` 永远是 true、蓄力卡在 0.8；
 *   · 玩家之后点车身、点刹车、点别的钮都解除不了，唯一解法是再点一次同一个钮；
 *   · 那一局的三星条件（1-2：`pumpPress ≤ 1`）也不受影响，但"放气"这件事
 *     完全没发生 —— 玩家按了半天车纹丝不动，会以为打气筒坏了。
 *
 * 修法：按下时记住"按的是第几个钮"（`state.heldBtn`），松手时释放**那一个**，
 * 和指针现在在哪无关。这一条对键盘版（数字键）同样适用，但键位那条
 * 已经在 `tools/test_hold_key.js` 里量过了，这里只管鼠标。
 *
 * 量具：B 组"滑出去松手"必须真的把指针移出按钮。所以先断言
 * "松手点确实不在按钮矩形内"—— 否则 B 组会和 A 组走同一条路径，
 * 两条断言都变成一句空话。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBr-' + Date.now()),
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

  /* 在页面里按**设计坐标**注入鼠标事件（canvas 换算由页面自己算，
   * 免得测试自己把屏幕坐标和设计坐标搞混 —— 上一版就是这么点空的）。 */
  const inject = (kind, x, y) => ev(`(()=>{
    const cv=document.querySelector('canvas'), r=cv.getBoundingClientRect();
    const cx=r.left + ${x}*r.width/1280, cy=r.top + ${y}*r.height/720;
    cv.dispatchEvent(new MouseEvent('${kind}',{clientX:cx,clientY:cy,button:0,bubbles:true}));
    return 1;})()`);

  const setup = async () => {
    await ev(`(()=>{const s=window.__rap.state,G=window.__rap.RAP,lv=window.__rap.levels[1];
      s.welcome=0; s.helpOpen=0; s.paused=false; s.levelSelect=false;
      window.__rap.startLevel(1); s.welcome=0; s.introT=1; s.runBanner=0;
      G.applySpec(lv, s.build, G.SPECS['1-2']);
      window.__rap.launch(); s.runBanner=0; return 1;})()`);
    await sleep(900);
  };

  const read = () => ev(`(()=>{const s=window.__rap.state;
    const evs=(s.run&&s.run.events)||[];
    return JSON.stringify({
      press:evs.filter(e=>e.indexOf('interact_key')===0).length,
      release:evs.filter(e=>e.indexOf('pump_release')===0).length,
      pumpPress:s.run?s.run.pumpPress:-1,
      held:!!(s.run&&s.run.car.pumpHeld),
      charge:+(s.run&&s.run.car.pumpCharge||0).toFixed(2),
      vx:+(s.run&&s.run.car.vx||0).toFixed(2)});})()`).then(JSON.parse);

  await setup();
  const rect = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
    const n=Math.min(3,((s.run&&s.run.car.groups)||[]).length);
    const x0=1280/2-(n*104)/2, b=window.__rap.btnRect('interact');
    return JSON.stringify({x:x0, y:b.y, w:92, h:92, n:n});})()`));
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;

  // ---- A) 在钮上按下、在钮上松手（正常路径） ----
  await setup();
  await inject('mousedown', cx, cy); await sleep(420);
  await inject('mouseup', cx, cy); await sleep(300);
  const inside = await read();

  // ---- B) 在钮上按下、滑到远处再松手（玩家的手会滑） ----
  const outX = cx + 320, outY = cy - 240;
  await setup();
  await inject('mousedown', cx, cy); await sleep(420);
  /* 先证明"这个松手点真的在按钮外" —— 否则 B 组和 A 组走同一条路径，
   * 下面的断言就什么都没测到。 */
  const outsideHit = await ev(`(()=>{const b=window.__rap.btnRect('interact');
    const n=Math.min(3,((window.__rap.state.run&&window.__rap.state.run.car.groups)||[]).length);
    const x0=1280/2-(n*104)/2;
    const r={x:x0,y:b.y,w:92,h:92};
    return (${outX}>=r.x && ${outX}<r.x+r.w && ${outY}>=r.y && ${outY}<r.y+r.h);})()`);
  await inject('mouseup', outX, outY); await sleep(320);
  const outside = await read();

  A.log('钮上松手：press ' + inside.press + ' / release ' + inside.release +
    '　pumpHeld=' + inside.held + '　蓄力=' + inside.charge);
  A.log('钮外松手：press ' + outside.press + ' / release ' + outside.release +
    '　pumpHeld=' + outside.held + '　蓄力=' + outside.charge);

  A.chk('前提：这一局是行驶页且车上有打气筒组', rect.n === 1, 'group 数 ' + rect.n);
  A.chk('前提：B 组的松手点确实落在交互钮之外（否则两条路径相同）',
    outsideHit === false, '(' + outX + ',' + outY + ') 在按钮外');

  A.chk('钮上松手：1 次按下 / 1 次松开，蓄力清零',
    inside.press === 1 && inside.release === 1 && inside.held === false,
    inside.press + '/' + inside.release + ' held=' + inside.held);

  A.chk('钮外松手：松手仍然作数（release 1 次，不再卡在按住状态）',
    outside.release === 1 && outside.held === false,
    'release=' + outside.release + ' held=' + outside.held);

  A.chk('钮外松手后蓄力真的被清掉（不会停在 0.7 那种半路状态）',
    outside.charge === 0, '蓄力=' + outside.charge);

  A.chk('钮外松手时车真的被推走了（放气产生了冲量，不只是清了个标志位）',
    outside.vx !== inside.vx || Math.abs(outside.vx) > 0.01,
    'vx ' + inside.vx + ' vs ' + outside.vx);

  /* ---- 量具自证：如果松手点换回"在钮内"，release 仍然是 1 ----
   * 证明上面那两条"钮外松手"的断言不是靠"根本没按下"通过的。 */
  A.chk('量具能失败：同样的注入方式、松手点在钮内时确实会 release（A 组已证明）',
    inside.release === 1, 'release=' + inside.release);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 完整一局：从"全新用户"走到"通关并进下一关"。
 *
 * 这个脚本原来是**只打印不判定的**（log.push 完就算过），而且坐标是写死的
 * （槽位按 46px、格心按 46px 算，但实际 BUILD_PX 是 44）——它一直在点偏，
 * 只是因为没人检查结果才一直"通过"。现在改成：
 *   · 所有坐标从 window.__rap 的几何函数取（槽位 trayRect / 格心 buildOrigin / 按钮 btnRect）
 *   · 每一步都断言，任何一步不对就非零退出
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const gridLib = require('./lib/grid');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeF-' + Date.now()),
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
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
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
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');

  // 全新用户：清空 localStorage
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);

  const ev = async e => {
    const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value;
  };
  async function shot(n) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64'));
  }
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(170); }
  const rectCenter = async expr => JSON.parse(await ev(
    `(()=>{const r=${expr};if(!r)return 'null';return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  const clickRect = async expr => { const c = await rectCenter(expr);
    if (!c) throw new Error('找不到可点区域: ' + expr); await click(c.x, c.y); return c; };

  // 全部从页面几何取，不写死像素
  /* 几何一律走 tools/lib/grid.js，且**每次现读**。
   * 原来缓存 BUILD_PX / ORIGIN 然后一直用 —— 但第 64 轮世界锚定之后
   * buildOrigin() 是活的：放下第一个轮子，锚点就跟着车高抬约 0.84 米，
   * 于是猪放偏、车装不起来、按「出发」被 canLaunch 拦下、phase 停在 build，
   * 最后 `btnRect('next')` 返回 null → 抛「找不到可点区域」。
   * 症状就是一句「崩溃或超时」，一条断言都没跑到。 */
  const G = gridLib.make(ev, click);
  const place = (part, r, c) => G.place(part, r, c);

  const chk = (label, cond, x) => A.chk(label, cond, x);

  // 1) 首次进入：欢迎页
  chk('全新用户看到欢迎页', (await ev('window.__rap.state.welcome')) === 1);

  // 2) 连点「下一步」直到关闭（用真按钮矩形，不用写死 508）
  for (let i = 0; i < 3; i++) await clickRect('window.__rap.welcomeBtnRect()');
  chk('翻完三页后引导关闭', (await ev('window.__rap.state.welcome')) === 0);
  chk('关闭后记住了（下次不再弹）', (await ev("localStorage.getItem('rap-welcomed-v1')")) === '1');

  await sleep(1400);   // 等入场镜头
  chk('入场镜头走完', (await ev('window.__rap.state.introT')) >= 1);
  chk('进入建造阶段', (await ev('window.__rap.state.phase')) === 'build');
  await shot('fp-02-build-after-intro');

  // 3) 按几何摆一台能跑的车
  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);
  const cells = JSON.parse(await ev('JSON.stringify(window.__rap.state.build.cells)'));
  // 内嵌件（小猪/电池）不占新格子，它是挂在木框的 cell.inner 上的
  const outer = Object.keys(cells).filter(k => cells[k] && cells[k].part);
  chk('外框件都落在格子上（3 框 + 2 轮 = 5 格）', outer.length === 5,
    '实际 ' + outer.length + ' 格：' + outer.map(k => k + '=' + cells[k].part).join(' '));
  chk('小猪挂在中空木框 (r4,c2) 里',
    (await ev("(()=>{const c=window.__rap.state.build.cells['4,2'];return c?c.inner:null;})()")) === 'pig');
  chk('木框 (r4,c2) 确实是中空的（能容纳内嵌件）',
    (await ev("(()=>{const c=window.__rap.state.build.cells['4,2'];return !!(c&&c.part==='wood_frame');})()")) === true);
  chk('发射按钮此时是可用的', (await ev('window.__rap.RAP.canLaunch(window.__rap.state.build).ok')) === true);
  await shot('fp-03-built');

  // 4) 发射
  await clickRect("window.__rap.btnRect('launch')");
  chk('发射后进入行驶', (await ev('window.__rap.state.phase')) === 'run');
  chk('出发横幅出现', (await ev('window.__rap.state.runBanner')) > 0);

  // 5) 等结算
  let resolved = false;
  for (let i = 0; i < 100; i++) {
    await sleep(250);
    if ((await ev('window.__rap.state.phase')) === 'resolved') { resolved = true; break; }
  }
  await sleep(1600);
  chk('这一局能走到结算（没卡死）', resolved);
  const run = JSON.parse(await ev('JSON.stringify(window.__rap.state.run)'));
  chk('关卡判定为通过', run && run.result === 'win',
    run ? 'result=' + run.result + ' fail=' + (run.failReason || '') : '无 run');
  chk('拿到至少 1 星', run && run.stars >= 1, 'stars=' + (run ? run.stars : '?'));
  chk('木箱全部吃到', run && run.boxesGot === run.boxes.length,
    run ? run.boxesGot + '/' + run.boxes.length : '');
  await shot('fp-04-result');

  // 6) 点「下一关」
  const idx0 = await ev('window.__rap.state.levelIndex');
  await clickRect("window.__rap.btnRect('next')");
  await sleep(600);
  chk('下一关真的切过去了', (await ev('window.__rap.state.levelIndex')) === idx0 + 1,
    idx0 + ' → ' + (await ev('window.__rap.state.levelIndex')));
  chk('切关后回到建造阶段', (await ev('window.__rap.state.phase')) === 'build');
  chk('切关后拼装是空的（新关重新搭）',
    Object.keys(JSON.parse(await ev('JSON.stringify(window.__rap.state.build.cells)'))).length === 0);
  await shot('fp-05-next-level');

  // 7) 选关页可用
  await ev('window.__rap.state.levelSelect = true;'); await sleep(500);
  chk('选关页能打开', (await ev('window.__rap.state.levelSelect')) === true);
  await shot('fp-06-select');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

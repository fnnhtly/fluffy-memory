/* 刹车：按住 → 速度必须真的降下来；松开 → 不再主动减速。
 *
 * 原来的版本只 console.log 了三个速度值就以 exit 0 结束，
 * 也就是说"刹车完全没生效"它也会通过。现在每个速度差都是断言。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeBr-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) { const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(160); }
  const center = async expr => JSON.parse(await ev(
    `(()=>{const r=${expr};if(!r)return 'null';return JSON.stringify({x:r.x+r.w/2,y:r.y+r.h/2});})()`));
  const clickRect = async expr => { const c = await center(expr); if (!c) throw new Error('没有 ' + expr);
    await click(c.x, c.y); };

  /* 几何一律走 tools/lib/grid.js 现读。
   * 原来这里缓存了一次 ORIGIN/BUILD_PX 然后用到底 —— 而 buildOrigin() 是活的
   * （放下第一个轮子时锚点会抬起约 0.84 米），于是后面放猪那一下必然点偏，
   * 车装不起来、`state.run` 是 null、`state.run.car.vx` 直接抛异常。 */
  const G = gridLib.make(ev, click);
  const place = (part, r, c) => G.place(part, r, c);

  await ev('window.__rap.state.introT=1');
  await sleep(250);

  for (const c of [1, 2, 3]) await place('wood_frame', 4, c);
  for (const c of [1, 3]) await place('wood_wheel', 5, c);
  await place('pig', 4, 2);
  await clickRect("window.__rap.btnRect('launch')");
  // 等车真的跑起来再刹车：原来只等 1.1s，车才 0.69 m/s，
  // 那时"降 1.0 m/s"这个判据本身就不可满足（比车总速度还大）。
  let v1 = 0;
  for (let i = 0; i < 40; i++) {
    await sleep(120);
    v1 = await ev('window.__rap.state.run.car.vx');
    if (v1 > 2.0) break;
  }
  A.chk('刹车前车已经跑起来了（> 2 m/s）', v1 > 2.0, 'vx=' + v1.toFixed(2) + ' m/s');

  /* 刹车钮已删（第 62 轮，用户要求）。这个脚本验的是**刹车物理**，
   * 那件事没被删，所以不再点 UI，改为直接调引擎入口。
   * 用鼠标点一个不存在的按钮会让 `btnRect` 返回 null 然后崩溃 ——
   * 崩溃不是"测试失败"，它连一条断言都没跑到。 */
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, true); return 1;})()');
  await sleep(140);
  A.chk('刹车置位后 braking 为 true',
    (await ev('window.__rap.state.run.car.braking')) === true);
  await sleep(430);
  const v2 = await ev('window.__rap.state.run.car.vx');
  // 判据改成"相对"的：降幅超过初速的 30%（绝对值随关卡坡度波动，写死 1.0 太脆）
  A.chk('刹车 0.43s 速度明显下降（> 30%）', v2 < v1 * 0.7,
    v1.toFixed(2) + ' → ' + v2.toFixed(2) + ' m/s  降 ' +
    (100 * (v1 - v2) / Math.max(0.01, v1)).toFixed(0) + '%');
  await shot('br-01-braking');

  // 松开：不再主动减速（速度不会继续被刹车拉低）
  await ev('(()=>{window.__rap.setBrake(window.__rap.state.run, false); return 1;})()');
  await sleep(160);
  A.chk('松开后 braking 复位', (await ev('window.__rap.state.run.car.braking')) === false);
  const v3 = await ev('window.__rap.state.run.car.vx');
  await sleep(400);
  const v4 = await ev('window.__rap.state.run.car.vx');
  // 松开后除非撞到东西，速度不应该再被刹车继续拖低
  const decelAfter = v3 - v4;
  A.chk('松开后不再被刹车持续拖慢', decelAfter < (v1 - v2),
    '松开后 0.4s 降 ' + decelAfter.toFixed(2) + ' vs 踩住 0.43s 降 ' + (v1 - v2).toFixed(2));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

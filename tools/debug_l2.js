/* 排查 1-2 卡住：打印运行中车体的详细状态与每帧步进是否发生 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9338;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge5-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(res => { ws.onopen = res; });
  const errs = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function click(dx, dy) {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 });
    await sleep(130);
  }
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig', 'eraser'];
  const tray = n => ({ x: (1280 - (8 * 46 + 7 * 7)) / 2 + TRAY.indexOf(n) * 53 + 23, y: 720 - 76 + 23 });
  const cell = (r, c) => ({ x: (1280 / 2 - 120) + c * 40 + 20, y: 150 + r * 40 + 20 });

  // 切 1-2 并建车（用代码直接调用 RAP，排除点击误差）
  await click(24 + 1 * 86 + 40, 33);
  await sleep(300);
  const built = await ev(`(()=>{
    const s = window.__rap.state, R = window.__rap.RAP, lv = window.__rap.levels[1];
    s.build = R.newBuild();
    R.tryPlace(lv, s.build, 'wood_frame', 4, 1);
    R.tryPlace(lv, s.build, 'wood_frame', 4, 2);
    R.tryPlace(lv, s.build, 'wood_frame', 4, 3);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 1);
    R.tryPlace(lv, s.build, 'wood_wheel', 5, 3);
    R.tryPlace(lv, s.build, 'pig', 4, 2);
    R.tryPlace(lv, s.build, 'pump', 3, 2);
    return JSON.stringify(s.build.cells);
  })()`);
  console.log('built via RAP:', built);
  await click(812, 302);
  await sleep(1500);
  const info = await ev(`(()=>{const r=window.__rap.state.run; if(!r) return 'no-run';
    return JSON.stringify({t:+r.time.toFixed(2), x:+r.car.x.toFixed(2), y:+r.car.y.toFixed(2), a:+r.car.a.toFixed(2),
      vx:+r.car.vx.toFixed(2), vy:+r.car.vy.toFixed(2), mass:r.car.mass, wheels:r.car.wheels.length,
      parts:r.car.parts.length, acc:+(r.acc||0).toFixed(3), phase:r.phase});})()`);
  console.log('after 1.5s:', info);
  await sleep(1500);
  console.log('after 3.0s:', await ev(`(()=>{const r=window.__rap.state.run; return JSON.stringify({t:+r.time.toFixed(2),x:+r.car.x.toFixed(2),y:+r.car.y.toFixed(2),a:+r.car.a.toFixed(2)});})()`));
  console.log('errors:', errs.length ? errs.join(' | ') : '(none)');
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 我自己试玩：验证这轮反馈的每一项（拖动移动 / 颜色组按钮 / 分段损坏 / 掉猪 / 1-2 可玩） */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge4-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });

  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = list.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  if (!wsUrl) { console.log('FAIL cdp'); child.kill(); process.exit(1); }
  const ws = new WebSocket(wsUrl);
  let id = 0; const pend = new Map();
  await new Promise(res => { ws.onopen = res; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  const send = (method, params) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(1200);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE });
  await sleep(1000);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  const rect = JSON.parse(await ev(`(()=>{const r=document.getElementById('cv').getBoundingClientRect();return JSON.stringify({l:r.left,t:r.top,w:r.width,h:r.height});})()`));
  const cl = (dx, dy) => ({ x: rect.l + dx * rect.w / 1280, y: rect.t + dy * rect.h / 720 });
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }
  async function click(dx, dy, button = 'left') {
    const p = cl(dx, dy);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button, clickCount: 1 });
    await sleep(130);
  }
  async function drag(fromDX, fromDY, toDX, toDY) {
    const a = cl(fromDX, fromDY), b = cl(toDX, toDY);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x, y: a.y, button: 'none' });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: a.x, y: a.y, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 8; i++) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: a.x + (b.x - a.x) * i / 8, y: a.y + (b.y - a.y) * i / 8, button: 'left' });
      await sleep(25);
    }
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
    await sleep(150);
  }
  const TRAY = ['wood_frame', 'wood_wheel', 'iron_wheel', 'motor', 'battery', 'pump', 'pig', 'eraser'];
  const tray = name => {
    const i = TRAY.indexOf(name);
    return { x: (1280 - (8 * 46 + 7 * 7)) / 2 + i * 53 + 23, y: 720 - 76 + 23 };
  };
  const cell = (r, c) => ({ x: (1280 / 2 - 138 - 40) + c * 46 + 23, y: 128 + r * 46 + 23 });
  const cells = () => ev(`JSON.stringify(window.__rap.state.build.cells)`);
  const run = () => ev(`(()=>{const r=window.__rap.state.run; if(!r) return 'none';
    const hp = r.car.parts.filter(p=>p.def.structure).map(p=>p.hp).join('/');
    return JSON.stringify({ph:r.phase,x:+r.car.x.toFixed(1),stars:r.stars,fail:r.failReason,
      box:r.boxesGot+'/'+r.boxes.length,frameHp:hp,loose:(r.loose||[]).length,
      groups:(r.car.groups||[]).map(g=>g.part+':'+g.list.length)});})()`);

  const out = [];

  // ---------- 1) 1-1 建车 + 拖动移动 ----------
  out.push('== 1-1 ==');
  for (const c of [1, 2, 3]) { await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, c).x, cell(4, c).y); }
  for (const c of [1, 3]) { await click(tray('wood_wheel').x, tray('wood_wheel').y); await click(cell(5, c).x, cell(5, c).y); }
  await click(tray('pig').x, tray('pig').y); await click(cell(4, 2).x, cell(4, 2).y);
  out.push('  建好: ' + await cells());
  // 把中间的框（带猪）从 4,2 拖到 4,3
  await drag(cell(4, 2).x, cell(4, 2).y, cell(3, 2).x, cell(3, 2).y);
  out.push('  拖动 4,2 → 3,2: ' + await cells());
  // 拖回
  await drag(cell(3, 2).x, cell(3, 2).y, cell(4, 2).x, cell(4, 2).y);
  out.push('  拖回 3,2 → 4,2: ' + await cells());
  await shot('fb-01-build');

  await click(830, 320);   // 出发
  await sleep(900); await shot('fb-02-run');
  await sleep(2600); await shot('fb-03-run2');
  out.push('  运行: ' + await run());
  await sleep(3500);
  out.push('  结算: ' + await run());
  await shot('fb-04-result');

  // ---------- 2) 1-2 可玩性 ----------
  out.push('== 1-2 ==');
  await click(24 + 1 * 86 + 40, 33);
  await sleep(300);
  for (const c of [1, 2, 3]) { await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, c).x, cell(4, c).y); }
  for (const c of [1, 3]) { await click(tray('wood_wheel').x, tray('wood_wheel').y); await click(cell(5, c).x, cell(5, c).y); }
  await click(tray('pig').x, tray('pig').y); await click(cell(4, 2).x, cell(4, 2).y);
  await click(tray('pump').x, tray('pump').y); await click(cell(3, 2).x, cell(3, 2).y);
  out.push('  1-2 build: ' + await cells());
  await shot('fb-05-l2-build');
  await click(830, 320);
  await sleep(1200); await shot('fb-06-l2-run');
  // 按颜色组按钮（打气筒组）
  await click(1280 / 2, 720 - 150 + 46);
  await sleep(250);
  await click(1280 / 2, 720 - 150 + 46);
  await sleep(4000);
  out.push('  1-2 运行: ' + await run());
  await shot('fb-07-l2-run2');
  for (let w = 0; w < 40; w++) {
    await sleep(300);
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  await sleep(400);
  out.push('  1-2 结算: ' + await run());
  await shot('fb-08-l2-result');

  // ---------- 3) 1-5 脆弱车：看分段损坏与掉猪 ----------
  out.push('== 1-5 砸车 ==');
  await click(24 + 4 * 86 + 40, 33);
  await sleep(300);
  await click(tray('wood_frame').x, tray('wood_frame').y); await click(cell(4, 1).x, cell(4, 1).y);
  await click(tray('pig').x, tray('pig').y); await click(cell(4, 1).x, cell(4, 1).y);
  await click(tray('wood_wheel').x, tray('wood_wheel').y); await click(cell(5, 1).x, cell(5, 1).y);
  await click(830, 320);
  await sleep(1500); await shot('fb-09-crash');
  for (let k = 0; k < 6; k++) { await sleep(700); }
  out.push('  1-5 结果: ' + await run());
  await shot('fb-10-crash2');

  console.log(out.join('\n'));
  ws.close(); child.kill(); process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

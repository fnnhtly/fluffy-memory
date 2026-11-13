/* 抓一组"给用户看的"展示图：欢迎页 / 拼装 / 行驶 / 结算 / 选关。
 * 不进回归（verify 不跑它），只是我每轮自检画面用。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9440;
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeShow-' + Date.now()),
    '--window-size=1280,760', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try { const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page'); if (pg) wsUrl = pg.webSocketDebuggerUrl; } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } };
  const send = (m, p) => new Promise((res, rej) => { const i = ++id; pend.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method: m, params: p || {} })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: PAGE }); await sleep(700);
  await send('Runtime.evaluate', { expression: 'localStorage.clear()' });
  await send('Page.navigate', { url: PAGE }); await sleep(1400);
  const ev = async e => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result.value;
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  await shot('show-01-welcome1');
  await ev("window.__rap.state.welcome = 2;"); await sleep(350);
  await shot('show-02-welcome2-parts');
  await ev("window.__rap.state.welcome = 3;"); await sleep(350);
  await shot('show-03-welcome3');

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    s.welcome=0; window.__rap.startLevel(0); s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']); s.selected='pump';
    return 1;})()`);
  await sleep(500);
  await shot('show-04-build-l1');
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[2];
    window.__rap.startLevel(2); s.introT=1; R.applySpec(lv, s.build, R.SPECS['1-3']);
    s.selected='motor'; return 1;})()`);
  await sleep(500);
  await shot('show-05-build-l3');
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[3];
    window.__rap.startLevel(3); s.introT=1; R.applySpec(lv, s.build, R.SPECS['1-4']);
    s.selected='iron_wheel'; return 1;})()`);
  await sleep(500);
  await shot('show-06-build-l4-ice');

  await ev(`(()=>{window.__rap.launch(); return 1;})()`);
  await sleep(900); await shot('show-07-run-banner');
  await sleep(2200); await shot('show-08-run');
  for (let i = 0; i < 60; i++) { await sleep(200);
    if ((await ev('window.__rap.state.phase')) === 'resolved') break; }
  await sleep(900); await shot('show-09-result');

  await ev('window.__rap.state.levelSelect = true'); await sleep(500);
  await shot('show-10-levelselect');
  await ev(`(()=>{const s=window.__rap.state; s.levelSelect=false; s.helpOpen=true; return 1;})()`);
  await sleep(400); await shot('show-11-help');
  await ev(`(()=>{const s=window.__rap.state; s.helpOpen=false;
    s.phase='run'; s.paused=true; return 1;})()`);
  await sleep(400); await shot('show-12-pause');

  ws.close(); child.kill();
  console.log('shots written');
})().catch(e => { console.log('FAIL', e); process.exit(1); });

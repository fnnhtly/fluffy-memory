/* 探针：1-6 在**真浏览器**里能不能通关？
 *
 * 背景（第 40 轮发现）：`launchSpec` 只把 `_presses` 送进运行期，
 * 完全忽略了 `_drops` / `_pops`。而 1-6 这一关的全部玩法就是
 * "什么时候扔沙袋、什么时候扎气球" —— 于是：
 *
 *   - `game.js` 的 `simulate()` 认识 _drops/_pops → Node 里 1-6 三星通关
 *   - 浏览器里的 `launchSpec` 不认识 → 车永远带着 3 个沙袋起飞失败 → stuck
 *
 * 也就是说 **1-6 从来没有在真浏览器里通过关**。所有声称"1-6 可通"的证据
 * 都来自 Node。这条探针就是那个缺口。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edge16-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  const ok = await ev(`window.__rap.launchSpec(5, '1-6')`);
  console.log('launchSpec(5,\'1-6\') →', ok);
  console.log('actScript 长度 =', await ev('window.__rap.state.run && window.__rap.state.run.actScript ? window.__rap.state.run.actScript.length : -1'));
  console.log('actScript =', await ev('JSON.stringify(window.__rap.state.run.actScript)'));

  let last = null;
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    last = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run;
      return JSON.stringify({t:+r.time.toFixed(2), x:+r.car.x.toFixed(2), y:+r.car.y.toFixed(2),
        phase:r.phase, res:r.result||'', reason:r.failReason||'',
        bags:r.sandbagsDropped||0, pops:r.balloonPops||0, lift:+(r.car.liftMass||0).toFixed(2)});})()`));
    if (i % 8 === 0) console.log('  t=' + last.t + ' x=' + last.x + ' y=' + last.y +
      ' 扔' + last.bags + ' 扎' + last.pops + ' 浮力' + last.lift + ' ' + (last.res || last.phase));
    if (last.res) break;
  }
  console.log('\n结局：' + JSON.stringify(last));
  const stars = await ev('window.__rap.state.run ? (window.__rap.state.run.stars||0) : -1');
  console.log('星数：' + stars);
  console.log('errors:', errs.length ? errs.slice(0, 4) : '(none)');

  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

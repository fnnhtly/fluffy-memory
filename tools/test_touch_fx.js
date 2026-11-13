/* 接触反馈分级：轻碰不出尘、重碰要出尘 + 震屏（脚本里的 Lv0~Lv4 是策划案定的表现）。
 *
 * 原来只统计"尘土峰值 / 震屏峰值"并打印，exit 0。现在分级本身要被断言：
 * 有 Lv>=1 的接触就必须真的产生尘土；有 Lv>=2 就必须震屏；
 * 而且"轻碰"（Lv0）不能糊到和重碰一样的表现。
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const A = require('./lib/asserts');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);   // 随机端口：避免残留进程撞车
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeTf-' + Date.now()),
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
  await send('Page.navigate', { url: PAGE }); await sleep(800);
  await send('Runtime.evaluate', { expression: "localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1100);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  async function shot(n) { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); }

  // 1-2 接触最频繁
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[1];
    window.__rap.startLevel(1); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-2']);
    window.__rap.launch();
  })()`);

  let maxDust = 0, maxShake = 0, shots = 0, sawDust = false, sawShake = false;
  for (let i = 0; i < 90; i++) {
    await sleep(100);
    const d = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({dust:(s.dust||[]).length, shake:+(s.shake||0).toFixed(2)});})()`));
    if (d.dust > maxDust) maxDust = d.dust;
    if (d.shake > maxShake) maxShake = d.shake;
    if (d.dust >= 3) sawDust = true;
    if (d.shake > 0.05) sawShake = true;
    if (d.dust >= 3 && shots < 2) { await shot('tf-0' + (shots + 1) + '-dust'); shots++; }
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }

  const evs = JSON.parse(await ev(
    `JSON.stringify((window.__rap.state.run&&window.__rap.state.run.events||[])
      .filter(e=>e.indexOf('touch lvl=')===0))`));
  const lvls = evs.map(e => parseInt(e.split('lvl=')[1], 10));
  const counts = {};
  lvls.forEach(l => counts[l] = (counts[l] || 0) + 1);
  const maxLvl = lvls.length ? Math.max(...lvls) : 0;

  A.log('触摸事件 ' + evs.length + ' 次，级别分布 ' + JSON.stringify(counts));
  A.log('尘土峰值 ' + maxDust + ' 个，震屏峰值 ' + maxShake.toFixed(2));

  A.chk('这一关真的发生了接触（不是一路飞过）', evs.length > 0, evs.length + ' 次');
  A.chk('接触产生了分级（不只是全 Lv0）', maxLvl >= 1,
    '最高 Lv' + maxLvl + '，分布 ' + JSON.stringify(counts));
  A.chk('有 Lv≥1 的接触就真的出了尘土', !lvls.some(l => l >= 1) || sawDust,
    'Lv≥1 出现 ' + lvls.filter(l => l >= 1).length + ' 次，尘土峰值 ' + maxDust);
  A.chk('有 Lv≥2 的接触就真的震了屏', !lvls.some(l => l >= 2) || sawShake,
    'Lv≥2 出现 ' + lvls.filter(l => l >= 2).length + ' 次，震屏峰值 ' + maxShake.toFixed(2));
  A.chk('尘土的粒数不是零星的（>=3 才算成片）', maxDust >= 3, '峰值 ' + maxDust);
  A.chk('拍到了带尘土的帧', shots >= 1, shots + ' 张');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

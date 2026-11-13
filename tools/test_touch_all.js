/* 接触分级要"够用"：把车抬高 3 米扔下来，必须触发高级别接触（Lv3/Lv4），
 * 而且高级别不能是死数据 —— 画面要真的出尘土+震屏。
 *
 * 原来统计完只打印一行分布就 exit 0。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeU-' + Date.now()),
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

  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch();
    s.run.car.y += 3.0;
    s.run.car.vy = 0;
  })()`);

  let maxDust = 0, maxShake = 0, hi = 0;
  for (let i = 0; i < 70; i++) {
    await sleep(60);
    const d = JSON.parse(await ev(`(()=>{const s=window.__rap.state;
      return JSON.stringify({dust:(s.dust||[]).length, shake:+(s.shake||0).toFixed(2)});})()`));
    if (d.dust > maxDust) maxDust = d.dust;
    if (d.shake > maxShake) maxShake = d.shake;
    if (d.dust > 6 && hi < 1) { await shot('ta-01-bighit'); hi++; }
    if ((await ev('window.__rap.state.phase')) !== 'run') break;
  }

  const evs = JSON.parse(await ev(
    `JSON.stringify(((window.__rap.state.run||{}).events||[]).filter(e=>e.indexOf('touch lvl=')===0))`));
  const lvls = evs.map(e => parseInt(e.split('lvl=')[1], 10));
  const counts = {};
  lvls.forEach(l => counts[l] = (counts[l] || 0) + 1);
  A.log('从 3 米高处落下：touch ' + evs.length + ' 次，分布 ' + JSON.stringify(counts));
  A.log('尘土峰值 ' + maxDust + '，震屏峰值 ' + maxShake.toFixed(2));

  A.chk('落地产生了接触事件', evs.length > 0, evs.length + ' 次');
  A.chk('3 米落差能触发高级别接触（Lv≥3）',
    lvls.length > 0 && Math.max(...lvls) >= 3,
    '最高 Lv' + (lvls.length ? Math.max(...lvls) : '-') + '，分布 ' + JSON.stringify(counts));
  A.chk('高级别接触真的出尘土（不是死数据）', maxDust >= 6, '峰值 ' + maxDust);
  A.chk('高级别接触真的震屏', maxShake > 0.05, '峰值 ' + maxShake.toFixed(2));
  A.chk('拍到了重击的那一帧', hi >= 1);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 猪的表情：happy / scared / hurt / dizzy / dead 各自要有触发条件，
 * 而且要真的被渲染路径取到（state.pigMood 是渲染层读的那个值）。
 *
 * 原来只把见过的 mood 打印出来，exit 0 —— 一个表情都不出现也算通过。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeP-' + Date.now()),
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

  // 1-1 官方预设，直接跑
  await ev(`(()=>{const s=window.__rap.state,R=window.__rap.RAP,lv=window.__rap.levels[0];
    window.__rap.startLevel(0); s.welcome=0; s.introT=1;
    R.applySpec(lv, s.build, R.SPECS['1-1']);
    window.__rap.launch();
  })()`);

  const seen = {};
  for (let i = 0; i < 260; i++) {
    await sleep(45);
    const mood = await ev('window.__rap.state.pigMood || "-"');
    if (mood !== '-' && !seen[mood]) { seen[mood] = i; await shot('pm-' + mood); }
    if ((await ev('window.__rap.state.phase')) === 'resolved') break;
  }
  A.log('跑完一关见到的表情：' + Object.keys(seen).join(' ') +
    '（首次出现帧 ' + JSON.stringify(seen) + '）');

  A.chk('渲染层真的读到了 mood（不是一直 "-"）', Object.keys(seen).length > 0,
    Object.keys(seen).join(' '));
  A.chk('正常行驶时是 normal', !!seen.normal, Object.keys(seen).join(' '));
  A.chk('出现过至少两种表情（说明状态机在切，不是画死一个）',
    Object.keys(seen).length >= 2, Object.keys(seen).join(' '));

  // 手动构造：受伤 → hurt、被甩飞 → dead。这两条是"输了"的唯一视觉线索，必须能出现。
  await ev(`(()=>{const s=window.__rap.state;
    if (s.phase !== 'run') { s.phase='run'; }
    if (!s.run) s.run = window.__rap.RAP.createRun(window.__rap.level(), s.build);
    s.run.phase = 'run';
    s.run.pigHP = 1;
    return s.run.pigHP;
  })()`);
  await sleep(320);
  const hpHurt = await ev('window.__rap.state.pigMood');
  A.chk('猪血量低时表情切到 hurt', hpHurt === 'hurt', 'mood=' + hpHurt);
  await shot('pm-forced-hurt');

  // 表情判定读的是 state.run.car.hasPig（不是 state.run.hasPig）——第一版设错了对象，
  // 结果"切到 dead"这条永远不成立，还得靠日志才看得出来。
  await ev('(()=>{const s=window.__rap.state; s.run.car.hasPig = false; return s.run.car.hasPig;})()');
  await sleep(320);
  const phDead = await ev('window.__rap.state.pigMood');
  A.chk('猪不在车上时表情切到 dead', phDead === 'dead', 'mood=' + phDead);
  await shot('pm-forced-dead');

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

/* 探针：把六关全打通，看看游戏有没有"收尾"。
 *
 * 用 launchSpec 真跑六关（不伪造存档），最后停在：
 *   A. 1-6 的结算页 —— 垂直切片的终点，玩家在这里看到了什么？
 *   B. 选关页 —— 六个"通关"之后，界面承认这件事吗？
 *
 * 判断标准是人的：一个正常商业游戏的章节终局，至少要说一句"你打完了"。
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

const PATCH = `(() => {
  if (window.__audit) return 'already';
  const C = CanvasRenderingContext2D.prototype;
  const oText = C.fillText, oClear = C.clearRect;
  window.__audit = { recs: [] };
  C.clearRect = function () { window.__audit.recs = []; return oClear.apply(this, arguments); };
  C.fillText = function (txt) { window.__audit.recs.push(String(txt)); return oText.apply(this, arguments); };
  return 'patched';
})()`;

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCE-' + Date.now()),
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
  await send('Runtime.evaluate', { expression:
    "localStorage.setItem('rap-welcomed-v1','1');localStorage.removeItem('rap-progress-v1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1300);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const dump = async label => {
    const recs = JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
    console.log('\n===== ' + label + '（' + recs.length + ' 条）=====');
    console.log('  ' + recs.join('  |  '));
  };

  const pairs = [[0, '1-1'], [1, '1-2'], [2, '1-3'], [3, '1-4i'], [4, '1-5n'], [5, '1-6']];
  for (const [idx, spec] of pairs) {
    await ev(`window.__rap.launchSpec(${idx}, '${spec}')`);
    let done = false;
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.run && window.__rap.state.run.result')) ) { done = true; break; }
    }
    const r = JSON.parse(await ev(`(()=>{const x=window.__rap.state.run;
      return JSON.stringify({res:x.result||'', stars:x.stars||0, t:+(x.time||0).toFixed(2)});})()`));
    console.log('[' + spec + '] ' + (done ? r.res : '未结束') + ' ★' + r.stars + ' ' + r.t + 's');
    await sleep(3400);   // 等回放 + 卡片就位
  }

  console.log('\n进度存档：' + await ev("localStorage.getItem('rap-progress-v1')"));
  console.log('总星数：' + await ev('window.__rap.RAP ? window.__rap.state.totalGoals : "?"'));
  await dump('1-6 通关后的结算页');

  await ev('window.__rap.state.phase="build"; window.__rap.state.run=null; window.__rap.state.levelSelect=true');
  await sleep(500);
  await dump('选关页（六关全通）');

  console.log('\nerrors:', errs.length ? errs.slice(0, 4) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

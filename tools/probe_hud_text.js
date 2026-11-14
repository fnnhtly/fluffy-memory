/* 探针：把每个场景最后一帧的**全部文字**按顺序打出来。
 *
 * 用途：不靠"我会不会看截图"，而是直接读画面在说什么。
 * 判断标准是人的：一个正常商业 2D 游戏在建造页/行驶页/结算页
 * 会告诉玩家的信息，这里有没有、有没有冲突、有没有废话。
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
  C.fillText = function (txt, x, y) {
    const sz = parseFloat((this.font.match(/(\\d+(?:\\.\\d+)?)px/) || [0, 13])[1]) || 13;
    window.__audit.recs.push({ t: String(txt), x: Math.round(x), y: Math.round(y), s: sz });
    return oText.apply(this, arguments);
  };
  return 'patched';
})()`;
const SNAP = 'JSON.stringify(window.__audit.recs)';

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeDT-' + Date.now()),
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
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const dump = async label => {
    const recs = JSON.parse(await ev(SNAP));
    console.log('\n===== ' + label + '（' + recs.length + ' 条）=====');
    recs.forEach(r => console.log('  ' + String(r.s).padStart(3) + 'px  (' + String(r.x).padStart(5) +
      ',' + String(r.y).padStart(4) + ')  ' + r.t));
  };

  for (let li = 0; li < 6; li++) {
    await ev(`(()=>{window.__rap.startLevel(${li});window.__rap.state.welcome=0;
      window.__rap.state.introT=1;return 1;})()`);
    await sleep(320);
    await dump('build 1-' + (li + 1));
  }

  // 1-6 行驶中（有气球/沙袋，HUD 最满）
  await ev(`(()=>{const s=window.__rap.state, R=window.__rap.RAP;
    window.__rap.startLevel(5); s.welcome=0; s.introT=1;
    R.applySpec(window.__rap.levels[5], s.build, R.SPECS['1-6']);
    window.__rap.launch(); return 1;})()`);
  await sleep(1200);
  await dump('run 1-6');

  console.log('\nerrors:', errs.length ? errs.slice(0, 4) : '(none)');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

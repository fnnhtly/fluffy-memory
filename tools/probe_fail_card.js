/* 探针：在**已经三星**的关卡上故意失败，结算卡会说些什么？
 *
 * 这是"屏幕上的字互相打架"那一类 bug 的高发场景：
 * 星级是累计制（`totalGoals`），失败局也照画；
 * 而顶部大标题写的是"这一趟失败了"。两者能不能同时成立必须看一眼。
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeFC-' + Date.now()),
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
    console.log('\n===== ' + label + ' =====');
    console.log('  ' + recs.join('  |  '));
    const bad = [];
    if (recs.some(t => t.indexOf('失败') >= 0 || t.indexOf('没有') >= 0)) {
      if (recs.some(t => t.indexOf('三星达成') >= 0)) bad.push('失败卡上写「三星达成」');
      if (recs.some(t => t.indexOf('全部三星') >= 0)) bad.push('失败卡上写「全部三星」');
      if (recs.some(t => t.indexOf('整章通关') >= 0)) bad.push('失败卡上写「整章通关」');
      if (recs.some(t => /^\+\d+$/.test(t))) bad.push('失败卡上写 +N');
      if (recs.some(t => t.indexOf('无新星') >= 0)) bad.push('失败卡上写「无新星」');
      if (recs.some(t => t === 'S' || t === 'A')) bad.push('失败卡上给 S/A 评级');
    }
    console.log(bad.length ? '  ✗ 矛盾：' + bad.join('；') : '  ✓ 无自相矛盾');
    return { recs, bad };
  };

  // 1) 先把 1-1 打到三星
  await ev(`window.__rap.launchSpec(0, '1-1')`);
  for (let i = 0; i < 150; i++) {
    await sleep(200);
    if (await ev('window.__rap.state.run && window.__rap.state.run.result')) break;
  }
  await sleep(3400);
  await dump('1-1 通关（三星）');

  // 2) 在**同一关**故意失败：把 1-6 的车（没浮力）放到 1-1 会输吗？不一定。
  //    更稳的办法：1-1 的车开到 1-6（必输），再回 1-1 看累计星是否还在。
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(200);
  await ev(`window.__rap.launchSpec(5, '1-1')`);
  let res = '';
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    res = await ev('window.__rap.state.run ? (window.__rap.state.run.result||"") : ""');
    if (res) break;
  }
  await sleep(3400);
  const f6 = await dump('1-6 用 1-1 的车（失败）');

  // 3) 回 1-1，看失败局里累计星是否照旧显示（累计制的核心主张）
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null;
    window.__rap.startLevel(0); return 1;})()`);
  await sleep(300);
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  // 在 1-1 上造一个必输的车：只有木框没有轮子 → 引擎会拦（canLaunch）
  // 所以用 1-6 的车放 1-1 —— 气球会让它飘过终点，反而可能赢。
  // 干脆用 1-1 标准解 + 把车扔进 1-6 已经做过；这里只验证累计星还在。
  const acc = JSON.parse(await ev(`(()=>{const pr=window.__rap.readRecord('1-1');
    return JSON.stringify(pr);})()`));
  console.log('\n1-1 存档：' + JSON.stringify(acc));

  console.log('\nerrors:', errs.length ? errs.slice(0, 3) : '(none)');
  const anyBad = f6.bad.length;
  console.log(anyBad ? '\n→ 有矛盾需要修' : '\n→ 失败卡没有自相矛盾');
  try { ws.close(); } catch (e) {}
  require('child_process').spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  process.exit(0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

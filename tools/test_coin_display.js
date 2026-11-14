/* 结算卡上的 "+N" 必须是钱包真实的变化。
 *
 * 第 41 轮的测量（probe_coins.js）：同一关连打三遍——
 *   第一遍 钱包 0 → 180，卡上写 "+80"
 *   第二遍 钱包 180 → 180，卡上还是 "+80"
 *   第三遍 钱包 180 → 180，卡上还是 "+80"
 *
 * 病因：卡上的数字是**算**出来的（`coinsOf(1, boxesGot)`），而钱包是**推导**出来的
 * （`totalCoins()` ← 永久星标 + 最好木箱数）。两者在"重刷"这个场景下必然分叉：
 * 重刷没有新标记，钱包一分不动，可算式永远返回 80。
 * 屏幕上就出现了一个承诺了却没发生的事 —— 玩家会以为自己攒了 240 块。
 *
 * 修法：主循环在 `saveProgress` 前后各读一次 `totalCoins()`，把差记进
 * `state.coinGain`，卡面只画这个数。0 就写「已拿满」。
 *
 * 这条测试守：
 *   1) 第一次通关时，卡上的 +N = 钱包实增（且 N > 0，不能靠"永远显示 0"蒙过去）；
 *   2) 同一关重刷时，钱包不动，卡上**不许**再出现 +N；
 *   3) 失败局不许出现 +N，也不许改钱包。
 *
 * 第 1 条带 N > 0 是关键：否则"把数字全删了"也能让 2、3 通过。
 */
const A = require('./lib/asserts');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 400);
const ROOT = path.join(__dirname, '..');
const PAGE = 'file:///' + path.join(ROOT, 'prototype', 'index.html').replace(/\\/g, '/');
const SHOTS = path.join(ROOT, 'records', 'shots');
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
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeCoin-' + Date.now()),
    '--window-size=1280,800', '--force-device-scale-factor=1', '--no-first-run',
    '--allow-file-access-from-files', 'about:blank'], { stdio: 'ignore' });
  let wsUrl = null;
  for (let i = 0; i < 60 && !wsUrl; i++) {
    await sleep(250);
    try {
      const l = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      const pg = l.find(t => t.type === 'page');
      if (pg) wsUrl = pg.webSocketDebuggerUrl;
    } catch (e) {}
  }
  const ws = new WebSocket(wsUrl); let id = 0; const pend = new Map(); const errs = [];
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) { const { res, rej } = pend.get(m.id); pend.delete(m.id);
      m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  };
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
  const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(SHOTS, n + '.png'), Buffer.from(r.data, 'base64')); };
  await ev(PATCH);
  await ev('window.__rap.state.introT=1');
  await sleep(250);

  const recsNow = async () => JSON.parse(await ev('JSON.stringify(window.__audit.recs)'));
  const plusOf = recs => recs.find(t => /^\+\d+$/.test(t)) || null;

  async function play(idx, spec) {
    const before = await ev('window.__rap.totalCoins()');
    await ev(`window.__rap.launchSpec(${idx}, '${spec}')`);
    let ok = false;
    for (let i = 0; i < 150; i++) {
      await sleep(200);
      if (await ev('window.__rap.state.run && window.__rap.state.run.result')) { ok = true; break; }
    }
    await sleep(3400);       // 回放 2.8s + 卡片滑入 + 金币淡入（0.55s）
    const after = await ev('window.__rap.totalCoins()');
    const recs = await recsNow();
    const res = await ev('window.__rap.state.run.result');
    return { ok, before, after, gain: after - before, plus: plusOf(recs), recs, res };
  }

  const n = v => { const m = /^\+(\d+)$/.exec(v || ''); return m ? +m[1] : null; };

  // ---------- 1. 首次通关 ----------
  const a = await play(0, '1-1');
  A.chk('1-1 首次通关跑到结算', a.ok && a.res === 'win', a.res);
  A.chk('首次通关钱包真的涨了', a.gain > 0, a.before + ' → ' + a.after);
  A.chk('卡上出现 +N', !!a.plus, a.plus || '没有 +N');
  A.chk('卡上的 +N 等于钱包实增（不是算出来的固定值）',
    n(a.plus) === a.gain, '卡上 ' + a.plus + ' / 实增 ' + a.gain);
  await shot('cn-01-first-clear');

  // ---------- 2. 同一关重刷 ----------
  const b = await play(0, '1-1');
  A.chk('重刷 1-1 仍然是 win', b.ok && b.res === 'win', b.res);
  A.chk('重刷不再涨钱（推导式钱包：没有新标记就不涨）', b.gain === 0,
    b.before + ' → ' + b.after + '（实增 ' + b.gain + '）');
  A.chk('重刷时卡上不许再写 +N',
    !b.plus, b.plus ? '仍写 ' + b.plus + '，但钱包没动' : '');
  A.chk('重刷时卡上明说「已拿满」', b.recs.some(t => t.indexOf('已拿满') >= 0),
    b.recs.filter(t => t.indexOf('拿满') >= 0).join(' ') || '没有这句');
  await shot('cn-02-replay-clear');

  // ---------- 3. 失败局 ----------
  /* 用**真会输**的组合：把 1-1 的极简车（3 木框 + 2 木轮，没气球）放到 1-6。
   * 1-6 要升到 3.3 m 的平台，这辆车没有浮力，必输 —— 而且是引擎自己判的，
   * 不是我们把 result 写进去的。 */
  const beforeF = await ev('window.__rap.totalCoins()');
  await ev(`(()=>{const s=window.__rap.state; s.phase='build'; s.run=null; return 1;})()`);
  await sleep(200);
  await ev(`window.__rap.launchSpec(5, '1-1')`);
  let resF = null;
  for (let i = 0; i < 200; i++) {
    await sleep(200);
    resF = await ev('window.__rap.state.run ? (window.__rap.state.run.result || "") : ""');
    if (resF) break;
  }
  await sleep(3400);
  const afterF = await ev('window.__rap.totalCoins()');
  const recsF = await recsNow();
  A.chk('1-1 的车放在 1-6 里真的会输', resF === 'fail', String(resF));
  A.chk('失败不改钱包', afterF === beforeF, beforeF + ' → ' + afterF);
  A.chk('失败局卡上没有 +N', !plusOf(recsF), plusOf(recsF) || '');
  A.chk('失败局也不该写「已拿满」（那是通关才有的说法）',
    !recsF.some(t => t.indexOf('已拿满') >= 0),
    recsF.filter(t => t.indexOf('拿满') >= 0).join(' '));
  await shot('cn-03-fail');

  A.chk('无 JS 异常', errs.length === 0, errs.slice(0, 3).join(' | '));
  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });

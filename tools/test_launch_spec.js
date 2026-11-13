/* 标准解的"可执行化"：SPECS 现在带 _dirs/_presses，必须证明这条链路真的通。
 *
 * 背景：1-2「按一下」改成必须按之后，光把零件摆好不再能通关。
 * 但十几条测试都用 `applySpec + launch` 这一组合来自动跑关，
 * 如果它们全都静默地开始失败，测试套件就变成了"红的一片但没人知道为什么"。
 *
 * 所以给页面加了一条正式入口 `launchSpec(levelIndex, specKey)`：
 * 摆件 → 发射 → 把 _dirs 装上 → 按 _presses 的时刻调 pressInteract/releaseInteract。
 * 这条入口不是给玩家用的，但它走的是和玩家完全相同的代码路径
 * （pressInteract 就是按 1 键调的那个函数）。
 *
 * 这条测试要证明四件事：
 *   A. launchSpec 能把 1-1 / 1-2 都跑到胜利
 *   B. 1-2 用 launchSpec 时会真的产生一次 pumpPress（不是伪造的）
 *   C. 把 _presses 抽掉，1-2 就过不去（证明是"按"让它过的）
 *   D. 页面里没有第二套物理：launchSpec 的结果和 Node 端 simulate 一致
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const child = spawn(EDGE, ['--headless=new', '--hide-scrollbars',
    '--remote-debugging-port=' + PORT, '--user-data-dir=' + path.join(os.tmpdir(), 'edgeLs-' + Date.now()),
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
  await send('Runtime.evaluate', { expression: "localStorage.clear(); localStorage.setItem('rap-welcomed-v1','1')" });
  await send('Page.navigate', { url: PAGE }); await sleep(1200);
  const ev = async e => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval');
    return r.result.value; };

  async function play(idx, key) {
    const ok = await ev(`window.__rap.launchSpec(${idx}, '${key}')`);
    if (!ok) return { ok: false };
    let done = false;
    for (let i = 0; i < 260; i++) {
      await sleep(200);
      if ((await ev('window.__rap.state.phase')) === 'resolved') { done = true; break; }
    }
    const info = JSON.parse(await ev(`(()=>{const r=window.__rap.state.run||{};
      return JSON.stringify({res:r.result||'', stars:r.stars||0, pump:r.pumpPress||0,
        t:+(r.time||0).toFixed(2), goals:r.starGoals||null});})()`));
    return Object.assign({ ok: true, done }, info);
  }

  // ---- A. 1-1 / 1-2 都能跑到胜利 ----
  const r1 = await play(0, '1-1');
  A.log('1-1 → ' + (r1.done ? r1.res : '未结束') + ' ★' + r1.stars + ' t=' + r1.t);
  A.chk('launchSpec 能驱动 1-1 通关', r1.done && r1.res === 'win');
  A.chk('1-1 三星（不散架这颗也亮了）', r1.stars === 3, r1.stars + ' 星');

  const r2 = await play(1, '1-2');
  A.log('1-2 → ' + (r2.done ? r2.res : '未结束') + ' ★' + r2.stars +
    ' pumpPress=' + r2.pump + ' t=' + r2.t);
  A.chk('launchSpec 能驱动 1-2 通关（按了那一下）', r2.done && r2.res === 'win', r2.res);
  A.chk('1-2 的 pumpPress 真的 = 1（不是伪造的计数）', r2.pump === 1, r2.pump + ' 次');
  A.chk('1-2 拿满三星', r2.stars === 3, r2.stars + ' 星');

  // ---- C. 抽掉 _presses，1-2 就过不去 ----
  const noPress = await ev(`(()=>{
    const R=window.__rap, spec=Object.assign({}, R.RAP.SPECS['1-2']);
    delete spec._presses;
    R.RAP.SPECS.__nopress = spec;
    return 1;})()`);
  const r3 = await play(1, '__nopress');
  A.log('1-2 不按 → ' + (r3.done ? r3.res : '未结束') + ' (t=' + r3.t + ')');
  A.chk('同一个摆法、不按就打不到终点（这就是「按一下」的意义）',
    r3.done && r3.res === 'fail', r3.res);
  A.chk('不按时 pumpPress = 0', r3.pump === 0, r3.pump + ' 次');

  // ---- D. 和 Node 端算出来的一致 ----
  const node = await ev(`(()=>{
    const R=window.__rap.RAP, lv=window.__rap.levels[1];
    const st=R.simulate(lv, R.SPECS['1-2'], {maxTime:40});
    return JSON.stringify({res:st.result, stars:st.stars, pump:st.pumpPress});})()`).then(JSON.parse);
  A.log('Node simulate：' + node.res + ' ★' + node.stars + ' pump=' + node.pump);
  A.chk('浏览器里玩出来的结果和 Node 端模拟一致（没有第二套物理）',
    node.res === r2.res && node.pump === r2.pump,
    node.res + '/' + node.pump + ' vs ' + r2.res + '/' + r2.pump);

  A.finish(ws, child, errs);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
